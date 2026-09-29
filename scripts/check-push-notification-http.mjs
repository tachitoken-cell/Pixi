import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { createInstantCombatController } from '../src/instant-combat-server.mjs';
import { createGameServer } from '../server.mjs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
// Exercise the actual startup configuration boundary without creating provider or database traffic.
const configuration = source.match(/  const pushConfig =[^]*?  const pushEnabled =[^;]+;/)[0];
const configured = (mobilePushConfig, override) => runInNewContext(`${configuration}\npushEnabled`, {
  mobilePushConfig, process: { env: override === undefined ? {} : { MOBILE_PUSH_ENABLED: override } },
  readFileSync, resolve, ROOT: resolve(import.meta.dirname, '..'),
});
const checkedIn = JSON.parse(readFileSync(new URL('../config/mobile-push.json', import.meta.url), 'utf8'));
assert.equal(configured(undefined), checkedIn.enabled, 'Absent runtime override uses the reviewed release setting.');
for (const enabled of [false, true]) {
  assert.equal(configured({ enabled }), enabled);
  assert.equal(configured({ enabled }, '0'), false, 'An explicit 0 disables either file setting.');
  assert.equal(configured({ enabled }, '1'), true, 'An explicit 1 enables either file setting.');
}
for (const invalid of [null, false, [], {}, { enabled: 0 }, { enabled: 'true' }, { enabled: true, extra: false }]) {
  assert.throws(() => configured(invalid), /Invalid mobile push configuration/);
  assert.throws(() => configured(invalid, '1'), /Invalid mobile push configuration/, 'An override cannot hide an invalid manifest.');
}
for (const invalid of ['', 'true', 'false', ' 1', '2']) assert.throws(() => configured({ enabled: false }, invalid), /MOBILE_PUSH_ENABLED must be 0 or 1/);
assert.throws(() => createGameServer({ mobilePushConfig: { enabled: 'true' } }), /Invalid mobile push configuration/);
assert.match(source, /const mobilePush = createPushNotifications\(\{ connection: statisticsConnection, realmId, enabled: pushEnabled,/,
  'The service receives the validated effective activation setting.');
const calls = [];
const context = {
  pushRequests: 0, pushRevokes: 0, pushRevokeWindow: 0, closing: false, accountStoreReady: true, database: {}, keycloak: {}, Buffer,
  mobileError: (status, message) => Object.assign(Error(message), { status, publicMobile: true }),
  verifyAccessToken: async token => { assert.equal(token, 'valid-session'); return { recordKey: 'verified-account', expiresAt: Date.now() + 60000 }; },
  mobilePush: { enabled: true,
    register: async (accountKey, input, active) => { assert(active()); calls.push({ accountKey, input }); return { registered: true }; },
    unregister: async input => { calls.push({ revoke: input }); return { registered: false }; },
  },
};
const handler = runInNewContext(`(${source.match(/  async function serveMobilePush\([^]*?\n  \}/)[0]})`, context);
const server = createServer((req, res) => { void handler(req, res, req.url === '/unregister'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
async function request(body = '{}', authorization = 'Bearer valid-session', path = '/register', type = 'application/json') {
  return fetch(url + path, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': type }, body });
}
try {
  assert.equal((await request('{}', '')).status, 401);
  assert.equal((await request('{}', 'Bearer expired')).status, 401);
  assert.equal((await request('{')).status, 400);
  assert.equal((await request('x'.repeat(2049))).status, 413);
  assert.equal((await request('{}', 'Bearer valid-session', '/register', 'text/plain')).status, 415);
  assert.equal(calls.length, 0, 'invalid requests cannot reach storage');
  assert.equal((await request(JSON.stringify({ token: 'device', preferences: {} }))).status, 200);
  assert.equal(calls[0].accountKey, 'verified-account', 'identity comes from verified JWT');
  context.mobilePush.enabled = false;
  assert.equal((await request()).status, 503);
  assert.equal((await request(JSON.stringify({ token: 'device', revokeSecret: 'secret' }), '', '/unregister')).status, 200,
    'capability-based logout works with an expired session and delivery disabled');
  assert.equal(calls.at(-1).revoke.revokeSecret, 'secret');
  context.pushRevokes = 64;
  assert.equal((await request('{}', '', '/unregister')).status, 429, 'Unauthenticated revocation writes are bounded.');
  context.pushRevokes = 0;
  context.pushRequests = 64;
  assert.equal((await request()).status, 429);
  context.pushRequests = 0; context.closing = true;
  assert.equal((await request('{}', '', '/unregister')).status, 503);
  assert.equal(context.pushRequests, 0, 'every admitted request releases its slot');
} finally { await new Promise(resolve => server.close(resolve)); }

// Signup notifications originate once from the actual schedule, even with no players online.
const startsAt = Date.UTC(2026, 8, 27, 2), registrations = [];
const readiness = { accountStoreReady: false, closing: false, shutdownTask: null };
const available = runInNewContext(`(${source.match(/live: session => liveSession\(session\), available: (\(\) => [^,]+)/)[1]})`, readiness);
const event = createInstantCombatController({ now: startsAt - 300001, sessions: new Map(), enemies: [],
  available, live: () => false, event() {}, onRegistration: at => registrations.push(at) });
event.tick(startsAt - 300000);
assert.deepEqual(registrations, [], 'startup must not consume the signup announcement before push initialization');
assert(source.indexOf('await mobilePush.start()') < source.indexOf('accountStoreReady = true;'));
readiness.accountStoreReady = true;
event.tick(startsAt - 299999); event.tick(startsAt - 299998);
assert.deepEqual(registrations, [startsAt]);

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-push-http-'));
const disabled = { status: async () => ({ enabled: false }) };
const game = createGameServer({ host: '127.0.0.1', port: 0, dataDir, keycloak: null, databaseUrl: '',
  auctionChain: disabled, mossAuctionChain: disabled, nftChain: disabled, realmId: 'eu' });
try {
  const port = await game.start(), base = `http://127.0.0.1:${port}`;
  assert.equal((await (await fetch(base + '/api/config')).json()).mobilePush.enabled, false);
  assert.equal((await fetch(base + '/api/notifications/register')).status, 405);
  assert.equal((await fetch(base + '/api/notifications/register', { method: 'POST', headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(base + '/api/notifications/register', { method: 'OPTIONS', headers: { Origin: base,
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } })).status, 204);
  assert.equal((await fetch(base + '/api/notifications/register', { method: 'POST' })).status, 503);
} finally { await game.stop(); rmSync(dataDir, { recursive: true, force: true }); }
console.log('PASS push HTTP: checked-in activation, strict overrides, verified identity, bounded JSON, origin/method guards, disabled service, logout capability, request slots and single offline world-event announcement.');
