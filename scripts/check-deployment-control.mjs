import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { request } from 'node:http';
import timers from 'node:timers/promises';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import pg from 'pg';
import { playerDatabaseFixture } from './fixture-player-database.mjs';
import { createGameServer } from '../server.mjs';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { appleConfigurationHash, turnkeyConfigurationHash, TURNKEY_ACTIVATION_KEYS, arenaConfigurationHash, ARENA_ACTIVATION_KEYS } from '../src/deployment-control.mjs';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-deploy-')), releaseFile = join(dir, 'release.json');
const token = '1f'.repeat(32), revision = 'a'.repeat(40), targetRevision = 'b'.repeat(40);
const clients = [], delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let game, port, elapsed = 0, waiting, releaseDatabase;
const OriginalClient = pg.Client;
const manifest = value => writeFileSync(releaseFile, JSON.stringify({ revision: value, assets: {} }));
const make = (name, config = {}, databaseUrl = '') => createGameServer({ port: 0, host: '127.0.0.1', dataDir: join(dir, name), keycloak: null, databaseUrl,
  deploymentControl: { token, releaseFile, ...config } });
async function until(predicate) {
  for (let i = 0; i < 500; i++) { const result = await predicate(); if (result) return result; await delay(10); }
  throw Error('Timed out waiting for deployment control.');
}
async function call(method = 'GET', body, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/deployment`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
const post = extra => call('POST', { expectedRevision: revision, targetRevision, ...extra });
const state = async () => (await call()).body;
async function connect(name) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [] };
  clients.push(client);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); client[message.type] = message; });
  socket.on('close', code => { client.closed = code; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send = value => socket.send(JSON.stringify(value));
  client.send({ type: 'join' }); await until(() => client.roster);
  client.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION }); await until(() => client.community?.accepted);
  client.send({ type: 'createCharacter', name, appearance: DEFAULT_APPEARANCE }); await until(() => client.roster.characters.length);
  client.id = client.roster.characters[0].id;
  client.send({ type: 'selectCharacter', characterId: client.id }); await until(() => client.snapshot);
  return client;
}
function fakeCountdown() {
  elapsed = 0; waiting = undefined;
  mock.method(performance, 'now', () => elapsed);
  mock.method(timers, 'setTimeout', (ms, value, { signal }) => new Promise(resolve => {
    const done = () => { signal.removeEventListener('abort', done); resolve(value); };
    signal.addEventListener('abort', done, { once: true }); waiting = done;
  }));
}
async function advance(ms) { elapsed += ms; const done = waiting; waiting = undefined; assert(done); done(); await new Promise(setImmediate); }
function streamingRequest(data, contentLength) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/deployment', method: 'POST', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(contentLength ? { 'Content-Length': contentLength } : {}),
    } }, response => { response.resume(); response.on('end', () => { req.destroy(); resolve(response.statusCode); }); });
    req.on('error', reject); req.write(data);
  });
}
try {
  manifest(revision);
  assert.throws(() => make('bad-token', { token: 'bad' }), /64 hexadecimal/);
  manifest('invalid'); assert.throws(() => make('bad-release'), /valid dist\/release.json/); manifest(revision);
  game = make('disabled', { token: '' }); port = await game.start();
  assert.equal((await call()).status, 404); await game.stop(); game = null;

  const appleEnvironment = { APPLE_IAP_PRIVATE_KEY: 'private-key-for-fingerprint-only', APPLE_IAP_KEY_ID: 'ABCDE12345',
    APPLE_IAP_ISSUER_ID: '12345678-abcd-abcd-abcd-123456789abc', MOBILE_PURCHASE_SANDBOX_ACCOUNTS: '1'.repeat(64) };
  const turnkeyEnvironment = Object.fromEntries(TURNKEY_ACTIVATION_KEYS.map(key => [key, `fingerprint-only-${key}`]));
  const arenaEnvironment = Object.fromEntries(ARENA_ACTIVATION_KEYS.map(key => [key, `fingerprint-only-${key}`]));
  game = make('success', { appleEnvironment, turnkeyEnvironment, arenaEnvironment }); port = await game.start();
  assert.equal((await call('GET', undefined, { Authorization: '' })).status, 401);
  assert.equal((await call('GET', undefined, { Authorization: `Bearer ${'2f'.repeat(32)}` })).status, 401);
  assert.equal((await call('GET', undefined, { Origin: `http://127.0.0.1:${port}` })).status, 403);
  assert.equal((await call('PUT')).status, 405);
  assert.equal((await call('POST', '{')).status, 400);
  assert.equal((await call('POST', ' '.repeat(257))).status, 413);
  assert.equal(await streamingRequest(' '.repeat(257)), 413, 'chunked body is bounded');
  assert.equal(await streamingRequest('{', 100), 408, 'incomplete authenticated body has a fixed deadline');
  assert.equal((await post({ expectedRevision: 'c'.repeat(40) })).status, 409);
  assert.equal((await post({ targetRevision: revision })).status, 409);
  assert.equal((await post({ extra: true })).status, 400);
  const idle = await state(); assert.equal(idle.state, 'idle'); assert.equal(idle.revision, revision);
  assert.equal(idle.appleIapHash, appleConfigurationHash(appleEnvironment));
  assert.equal(idle.turnkeyHash, turnkeyConfigurationHash(turnkeyEnvironment));
  assert.equal(idle.arenaHash, arenaConfigurationHash(arenaEnvironment));
  assert(Object.values(arenaEnvironment).every(value => !JSON.stringify(idle).includes(value)));
  assert(Object.values(turnkeyEnvironment).every(value => !JSON.stringify(idle).includes(value)));
  assert(Object.values(appleEnvironment).every(value => !JSON.stringify(idle).includes(value)));
  const publicConfig = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
  assert(!Object.hasOwn(publicConfig, 'appleIapHash'), 'The configuration fingerprint is authenticated deployment data only');
  assert(!Object.hasOwn(publicConfig, 'arenaHash'), 'The arena fingerprint is authenticated deployment data only');
  assert(!Object.hasOwn(publicConfig, 'turnkeyHash'), 'The wallet configuration fingerprint is authenticated deployment data only');
  const player = await connect('Willow');
  fakeCountdown();
  let releaseDrain;
  const drainGate = new Promise(resolve => { releaseDrain = resolve; }), originalStop = game.stop;
  mock.method(game, 'stop', async function (options) { if (options?.keepHttpOpen) await drainGate; return originalStop.call(this, options); });
  const started = await post(); assert.equal(started.status, 202); assert.equal(started.body.state, 'countdown');
  await until(() => player.shutdownWarning?.secondsRemaining === 300 && waiting);
  assert.deepEqual((await post()).body, started.body, 'same-target retry does not replace the process or countdown');
  assert.equal((await post({ targetRevision: 'c'.repeat(40) })).status, 409);
  await advance(60000); await until(() => player.shutdownWarning?.secondsRemaining === 240 && waiting);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).available, true);
  const me = player.snapshot.players.find(p => p.id === player.id), rotation = me.rotation + .25;
  player.send({ type: 'move', x: me.x, z: me.z, rotation });
  await until(() => player.snapshot.players.find(p => p.id === player.id)?.rotation === rotation);
  manifest(targetRevision);
  assert.equal((await state()).revision, revision, 'old process never reads a replacement manifest as its own release');
  await advance(240000);
  assert.equal((await state()).state, 'draining', 'save completion is not inferred from the countdown ending');
  releaseDrain(); await until(async () => (await state()).state === 'drained');
  await until(() => player.closed === 1012);
  const drained = await state(); assert.equal(drained.instanceId, idle.instanceId); assert.equal(drained.targetRevision, targetRevision);
  const saved = JSON.parse(readFileSync(join(dir, 'success/players.json'), 'utf8'));
  assert.equal(Object.values(saved).flatMap(a => a.characters).find(p => p.id === player.id).rotation, rotation, 'final progress is durably saved');
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  const healthBody = await health.json(), warning = healthBody.deploymentWarning;
  assert.equal(warning.version, 1); assert.match(warning.id, /^[a-f0-9-]{36}$/); assert(Number.isSafeInteger(warning.startedAt));
  assert.equal(warning.held, false); assert.equal(warning.secondsRemaining, 0);
  assert.equal(health.status, 200); assert.deepEqual({ ...healthBody, mossAuction: undefined, deploymentWarning: undefined }, { ok: true, available: false, realmId: 'eu', players: 0, world: 'Mossvale', mossAuction: undefined, deploymentWarning: undefined, referrals: { programEnabled: false }, economy: { supportedVersion: 1, version: 0, exchangeEnabled: false } });
  assert(drained.finalSave && drained.admissionHeld && Number.isSafeInteger(drained.drainedAt));
  assert.equal((await post()).status, 200);
  assert.equal((await post({ targetRevision: 'c'.repeat(40) })).status, 409);
  await game.stop(); assert.equal(game.server.listening, false, 'normal stop closes retained management HTTP');
  game = null; mock.restoreAll();

  game = make('replacement'); port = await game.start();
  const replacement = await state(); assert.equal(replacement.revision, targetRevision); assert.notEqual(replacement.instanceId, idle.instanceId);
  assert.equal(replacement.appleIapHash, null);
  assert.equal(replacement.turnkeyHash, null);
  assert.equal(replacement.arenaHash, null);
  assert.equal((await post()).status, 409, 'a previous-release request cannot drain a new release');
  assert.equal((await state()).state, 'idle'); await game.stop(); game = null;

  for (const failClose of [false, true]) {
    manifest(revision);
    let ending = false, ended = false;
    const gate = new Promise(resolve => { releaseDatabase = resolve; });
    pg.Client = class extends playerDatabaseFixture({}) {
      async end() { ending = true; await gate; if (failClose) throw Error('Simulated database close failure'); await super.end(); ended = true; }
    };
    game = make('database', {}, 'postgres://isolated-deployment-fixture'); port = await game.start(); await connect('Clover');
    fakeCountdown(); await post(); await until(() => waiting); await advance(300000); await until(() => ending);
    assert.equal((await state()).state, 'draining', 'final save alone does not acknowledge an open database connection');
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 503);
    releaseDatabase(); await until(async () => (await state()).state === (failClose ? 'failed' : 'drained'));
    assert.equal(ended, !failClose);
    if (failClose) await assert.rejects(game.stop(), /database close failure/); else await game.stop();
    game = null; pg.Client = OriginalClient; mock.restoreAll();
  }

  manifest(revision); game = make('failed'); port = await game.start(); await connect('Rowan');
  const saveFile = join(dir, 'failed/players.json'), before = readFileSync(saveFile, 'utf8');
  mkdirSync(`${saveFile}.tmp`); // Real final-save failure; preserve the last valid file.
  fakeCountdown(); assert.equal((await post()).status, 202); await until(() => waiting); await advance(300000);
  const failure = await until(async () => { const result = await state(); return result.state === 'failed' && result; });
  assert.equal(failure.errorCode, 'DRAIN_FAILED'); assert(!JSON.stringify(failure).includes(token));
  assert.equal(readFileSync(saveFile, 'utf8'), before);
  assert.equal((await post()).status, 503, 'same-target retry preserves failed state and cannot bypass save failure');
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 503);
  await assert.rejects(game.stop()); assert.equal(game.server.listening, false); game = null;
  console.log('PASS deployment control: disabled and authenticated routes, bounded bodies, revision/retry guards, five-minute live play, final durable save and database close, retained management, new process identity, normal stop, and fail-closed save/close failures.');
} finally {
  releaseDatabase?.(); pg.Client = OriginalClient;
  mock.restoreAll(); for (const client of clients) client.socket.terminate();
  await game?.stop().catch(() => {}); rmSync(dir, { recursive: true, force: true });
}
