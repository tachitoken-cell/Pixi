import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createTurnkeyConfig } from '../src/turnkey-config.mjs';
import { createGameServer } from '../server.mjs';

const workerSource = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
const acceptsUpdateConfig = runInNewContext(workerSource.slice(workerSource.indexOf('function validHosting('), workerSource.indexOf('async function matchesBuild(')) + '\nvalid;', { URL, CONFIG: '/api/config' });

const organizationId = '51b5e0de-3064-4e9e-990d-e34e4d3df988', authProxyConfigId = '4782e754-75da-4a4c-8462-93b6a65f36e1';
const configured = { TURNKEY_ORGANIZATION_ID: organizationId, TURNKEY_AUTH_PROXY_CONFIG_ID: authProxyConfigId };
const expected = { organizationId, authProxyConfigId };
assert.equal(createTurnkeyConfig({}), null);
assert.equal(createTurnkeyConfig({ TURNKEY_ORGANIZATION_ID: '', TURNKEY_AUTH_PROXY_CONFIG_ID: '' }), null);
assert.deepEqual(createTurnkeyConfig({ ...configured, TURNKEY_API_PRIVATE_KEY: 'fixture-secret' }), expected);
for (const key of Object.keys(configured)) {
  for (const value of [undefined, '', ' ', 'not-a-uuid', '00000000-0000-0000-0000-000000000000', ` ${configured[key]}`, `${configured[key]}\n`, 123, null]) {
    assert.throws(() => createTurnkeyConfig({ ...configured, [key]: value }), /must both be valid UUIDs/);
  }
}

const saved = Object.fromEntries(Object.keys(configured).map(key => [key, process.env[key]]));
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-turnkey-config-'));
const disabledChain = { status: async () => ({ enabled: false }) };
const options = { host: '127.0.0.1', port: 0, dataDir, keycloak: null, keycloakAccountIssuer: undefined, databaseUrl: '',
  realmId: 'eu', realmEuOrigin: '', realmUsOrigin: '', realmAsiaOrigin: '', gameAllowedOrigins: '', walletOidc: { env: {} },
  auctionChain: disabledChain, mossAuctionChain: disabledChain, storeChain: disabledChain, treasuryChain: disabledChain, nftChain: disabledChain,
  mobilePurchaseVerifier: { status: () => ({ apple: false, google: false }) }, accountDeletionProvider: { enabled: false } };
try {
  Object.assign(process.env, configured);
  delete process.env.TURNKEY_AUTH_PROXY_CONFIG_ID;
  assert.throws(() => createGameServer(options), /must both be valid UUIDs/, 'partial configuration stops server construction');
  const arenaContract = `0x${'33'.repeat(20)}`;
  for (const [enabled, arenaEnabled] of [[false, false], [true, false], [true, true]]) {
    for (const [key, value] of Object.entries(configured)) { if (enabled) process.env[key] = value; else delete process.env[key]; }
    const publicOrigin = enabled ? 'https://configured.example' : 'https://mossvale.world';
    const game = createGameServer({ ...options, realmEuOrigin: enabled ? publicOrigin : '',
      arenaChain: { ...disabledChain, ...(arenaEnabled ? { contract: arenaContract } : {}) } });
    try {
      const port = await game.start(), response = await fetch(`http://127.0.0.1:${port}/api/config`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await acceptsUpdateConfig(response.clone(), '/api/config'), true, 'the updater must accept real HTTP configuration with wallet and arena enabled or disabled');
      const body = await response.json();
      if (enabled) assert.deepEqual(body.turnkey, { ...expected, gasFunding: false, ...(arenaEnabled ? { arenaContract } : {}), collections: {} }, 'HTTP config exposes public IDs, funding availability and only the configured public arena destination');
      else assert.equal(Object.hasOwn(body, 'turnkey'), false, 'unconfigured realms omit Turnkey');
      const gas = origin => fetch(`http://127.0.0.1:${port}/api/turnkey/wallet`, { method: 'POST', headers: {
        Origin: origin, Host: 'private-route.bba.tools', 'Content-Type': 'application/json',
      }, body: '{"transaction":{}}' });
      assert.equal((await gas(publicOrigin)).status, 401, 'canonical public origin reaches authentication behind rewritten proxy Host');
      for (const origin of [publicOrigin, 'https://us.mossvale.world', 'https://asia.mossvale.world']) {
        const preflight = await fetch(`http://127.0.0.1:${port}/api/turnkey/wallet`, { method: 'OPTIONS', headers: {
          Origin: origin, Host: 'private-route.bba.tools', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type',
        } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
        assert.equal(preflight.headers.get('vary'), 'Origin');
        assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
        assert.equal((await gas(origin)).status, 401, 'trusted realm browser reaches bearer authentication after an in-page realm switch');
      }
      for (const origin of ['null', 'https://attacker.test', 'https://account.mossvale.world', 'https://user:password@us.mossvale.world']) {
        const denied = await gas(origin); assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
      }
      if (enabled) assert.equal((await gas('https://mossvale.world')).status, 403, 'a configured realm origin replaces its default');
      assert.equal((await gas('https://private-route.bba.tools')).status, 403, 'unconfigured proxy hostname is not a funding origin');
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/turnkey/gas`, { method: 'POST' })).status, 410, 'old clients cannot request withdrawable ETH top-ups');
    } finally { await game.stop(); }
  }
} finally {
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  rmSync(dataDir, { recursive: true, force: true });
}
console.log('Turnkey config checks passed: disabled default, strict IDs, startup rejection and public HTTP config.');
