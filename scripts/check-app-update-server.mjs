import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server.mjs';
import { parseAppUpdatePolicy } from '../mobile/app-update.ts';

const disabled = { status: async () => ({ enabled: false }) };
const options = { host: '127.0.0.1', port: 0, keycloak: null, databaseUrl: '', realmId: 'eu', auctionChain: disabled, mossAuctionChain: disabled, nftChain: disabled };
async function config(extra = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-app-update-'));
  const game = createGameServer({ ...options, dataDir, ...extra });
  try {
    const port = await game.start();
    const response = await fetch(`http://127.0.0.1:${port}/api/config?app-startup=1`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return (await response.json()).mobileAppUpdate;
  } finally { await game.stop(); rmSync(dataDir, { recursive: true, force: true }); }
}
const checkedIn = JSON.parse(readFileSync(new URL('../config/mobile-app-updates.json', import.meta.url), 'utf8'));
assert.deepEqual(await config(), parseAppUpdatePolicy(checkedIn), 'The released policy is the reviewed, checked-in manifest.');
const required = { apple: { minVersion: '1.0.3', minBuild: '14' }, google: { minVersion: '1.1' } };
assert.deepEqual(await config({ mobileAppUpdate: required }), required);
assert.deepEqual(await config({ mobileAppUpdate: {} }), {}, 'An empty policy keeps both stores optional.');
assert.throws(() => createGameServer({ ...options, mobileAppUpdate: { apple: { minBuild: '14' } } }), /Invalid app update policy/, 'A build floor requires a version floor.');
assert.throws(() => createGameServer({ ...options, mobileAppUpdate: { google: { minVersion: 'latest' } } }), /Invalid app update policy/);
console.log('PASS app update configuration: reviewed release policy, independent store floors, optional build minimum, no-store startup policy and invalid configuration rejection.');
