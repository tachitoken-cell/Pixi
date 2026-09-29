import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const revision = process.argv[2];
const gameRevision = process.argv[3] || revision;
assert.match(revision || '', /^[a-f0-9]{40}$/, 'Pass the full expected release revision');
assert.match(gameRevision || '', /^[a-f0-9]{40}$/, 'Pass the full expected game revision');
assert.ok(process.argv.length === 3 || process.argv.length === 4, 'Unknown verification option');
const origin = 'https://stats.mossvale.world';
const realms = ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world'];
const out = resolve(import.meta.dirname, '../stats-dist');
async function request(base, path) {
  const url = new URL(path, base);
  url.searchParams.set('stats-check', revision);
  return fetch(url, { headers: { 'User-Agent': 'Mossvale-Stats-Verification/1.0', 'Cache-Control': 'no-cache' },
    redirect: 'error', signal: AbortSignal.timeout(30000) });
}
async function checkRealms() {
  await Promise.all(realms.map(async realm => {
    const response = await request(realm, '/release.json');
    assert.equal(response.status, 200, `${realm}: release HTTP status`);
    assert.equal((await response.json()).revision, gameRevision, `${realm}: game must match the expected release`);
  }));
}
await checkRealms();
const manifest = JSON.parse(await readFile(resolve(out, 'release.json'), 'utf8'));
assert.equal(manifest.revision, revision, 'Local statistics build must match expected revision');
assert.ok(Array.isArray(manifest.assets) && manifest.assets.length, 'Statistics asset manifest is missing');
const release = await request(origin, '/release.json');
assert.equal(release.status, 200, 'Public statistics release HTTP status');
assert.deepEqual(await release.json(), manifest, 'Public statistics release differs from build');
for (const asset of manifest.assets) {
  assert.match(asset.path, /^\/[\w./-]+$/);
  assert.ok(!asset.path.split('/').includes('..'), 'Asset path escapes build directory');
  const response = await request(origin, asset.path === '/index.html' ? '/' : asset.path);
  assert.equal(response.status, 200, `${asset.path}: public HTTP status`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `${asset.path}: public content differs from build`);
  assert.deepEqual(bytes, await readFile(resolve(out, asset.path.slice(1))), `${asset.path}: manifest differs from local file`);
  if (asset.path === '/index.html') assert.match(bytes.toString(), new RegExp(`name="mossvale-source-revision" content="${revision}"`));
}
assert.equal((await request(origin, '/statistics-verification-page-does-not-exist')).status, 404, 'Unknown statistics page must return 404');
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
let verified;
for (let attempt = 0; attempt < 8; attempt++) {
  try {
    for (const range of ['24h', '7d', '30d', 'all']) {
      const response = await request(origin, `/api/stats?range=${range}`);
      assert.equal(response.status, 200, `${range}: statistics API HTTP status`);
      const data = await response.json(), generated = Date.parse(data.generatedAt);
      assert.equal(data.range, range);
      assert.ok(Number.isFinite(generated) && Math.abs(Date.now() - generated) <= 90000, 'Statistics response must be current');
      assert.ok(Number.isFinite(Date.parse(data.trackingSince)) && Date.parse(data.trackingSince) <= generated, 'Tracking start must be truthful');
      assert.deepEqual(data.live.realms.map(realm => realm.id).sort(), ['asia', 'eu', 'us']);
      assert.ok(data.live.realms.every(realm => realm.available && nonnegative(realm.players) && Math.abs(generated - Date.parse(realm.lastSeenAt)) <= 60000), 'Every realm must have fresh player statistics');
      assert.equal(data.live.players, data.live.realms.reduce((total, realm) => total + realm.players, 0));
      assert.equal(data.registered.source, 'keycloak');
      assert.equal(data.registered.status, 'ok', 'Keycloak registered-user count must be available');
      assert.ok(nonnegative(data.registered.total), 'Registered users must be a real account count');
      assert.equal(data.auction.status, 'ok', 'Finalized MOSS auction history must be available');
      assert.match(data.auction.totalWei || '', /^\d+$/);
      assert.equal(data.auction.decimals, 18);
      assert.equal(data.auction.chainId, 4663);
      assert.equal(data.treasury.status, 'ok', 'Voucher payouts and vault balance must be available');
      assert.match(data.treasury.totalPaidWei, /^\d+$/);
      assert.match(data.treasury.balanceWei, /^\d+$/);
      assert.equal(data.treasury.decimals, 18);
      assert.equal(data.treasury.chainId, 4663);
      assert.equal(data.treasury.payoutBasis, 'finalized');
      assert.equal(data.treasury.balanceBasis, 'latest');
      assert.ok(Math.abs(Date.now() - Date.parse(data.treasury.updatedAt)) < 120000, 'Treasury figures must be current');
      assert.ok(Array.isArray(data.hourly) && data.hourly.some(hour => nonnegative(hour.activePlayers))
        && data.hourly.every(hour => hour.activePlayers === null || nonnegative(hour.activePlayers)), 'Hourly activity must be recorded, with unavailable hours left as gaps');
      assert.ok(Array.isArray(data.concurrent), 'Concurrent history must be present');
      verified = { players: data.live.players, registered: data.registered.total, auctionWei: data.auction.totalWei,
        voucherPayoutWei: data.treasury.totalPaidWei, vaultBalanceWei: data.treasury.balanceWei, trackingSince: data.trackingSince };
    }
    break;
  } catch (error) {
    if (attempt === 7) throw error;
    await setTimeout(15000);
  }
}
await checkRealms();
console.log(`Live statistics verified: ${manifest.assets.length} assets, four time ranges, fresh EU/US/Asia players, Keycloak registrations, finalized MOSS volume, voucher payouts, vault balance and hourly history match ${revision}; game release ${gameRevision}.`);
console.log(JSON.stringify(verified));
