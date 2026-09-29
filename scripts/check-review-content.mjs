import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { WebSocket } from 'ws';
import { createGameServer, migrateRecords, validateRecords } from '../server.mjs';
import { createPlayerStore } from '../src/player-store.mjs';
import { provisionReviewContent } from './provision-review-content.mjs';
import { STORE_PRODUCTS, MOBILE_STORE_SKUS, storePlayerValid, storeNftConvertible, storeActivationChanges, mobileRefundChanges } from '../src/ingame-store.ts';
import { starterGear, maxHealth } from '../src/progression.ts';
import { newOnboarding } from '../src/onboarding.ts';

// Real local PostgreSQL, competing account owners and game sockets. No provider
// calls, remote database, purchases, or real reviewer data are used.
const suffix = randomUUID().replaceAll('-', ''), schema = `review_content_${suffix}`;
const dir = mkdtempSync(join(tmpdir(), 'mossvale-review-content-')), clients = [], stores = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const tokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
const keys = tokens.map(hash), appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const hero = name => ({ id: randomUUID(), name, appearance, x: 0, z: 8, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
  characterCreated: true, ...starterGear('Ranger'), talents: [], level: 1, hp: 100, maxHp: 100, xp: 7, gold: 23,
  inventory: { wood: 2, crystal: 0, herb: 0, potion: 3, relic: 0 }, learnedSpells: ['arrow'], ridingRank: 0,
  ownedMounts: [], onboarding: newOnboarding(), quest: { stage: 0, kills: 0, crystals: 0 } });
const fixture = migrateRecords({ [keys[0]]: { characters: [hero('Mossreview'), hero('Untouched alt')] }, [keys[1]]: { characters: [hero('Other account')] } });
const reviewer = fixture[keys[0]].characters[0], other = fixture[keys[1]].characters[0];
const options = { accountKey: keys[0], characterId: reviewer.id, expectedName: reviewer.name };
let admin, container, game;
async function until(fn, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await delay(20); }
  throw Error(`Timed out: ${label}`);
}

try {
  validateRecords(fixture);
  assert.deepEqual(reviewer.storeGrants, [], 'legacy missing history migrates to an empty array');
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    container = `mossvale-review-content-${suffix}`;
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only', '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
    const address = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim();
    connectionString = `postgresql://postgres:isolated-test-only@${address}/postgres`;
  }
  const url = new URL(connectionString);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Only a disposable local PostgreSQL database may be used.');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
    try { await admin.connect(); break; }
    catch (error) { await admin.end(); if (attempt >= 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const makeStore = () => {
    const store = createPlayerStore({ connectionString: url.toString(),
      migrate: (account, key) => migrateRecords({ [key]: account })[key],
      validate: (account, key) => validateRecords({ [key]: account }, true) });
    stores.push(store); return store;
  };
  const operator = makeStore(), owner = makeStore();
  await operator.start(); await owner.start();
  for (const [key, account] of Object.entries(fixture)) await admin.query(`INSERT INTO ${schema}.mossvale_players (account_key,state) VALUES ($1,$2::jsonb)`, [key, JSON.stringify(account)]);
  const read = async (key = keys[0]) => (await operator.read([key]))[0]?.state;
  const before = await read(), unrelated = await read(keys[1]);

  await assert.rejects(provisionReviewContent(operator, { ...options, accountKey: hash('missing') }), /missing or currently online/);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM ${schema}.mossvale_players`)).rows[0].n, 2, 'missing-account claim never creates a record');
  let claimMetadata; await owner.claim(keys[0], metadata => { claimMetadata = metadata; });
  assert.equal(typeof claimMetadata.guardBlockedUntil, 'number', 'normal claim callback retains guard metadata');
  await assert.rejects(provisionReviewContent(operator, options), /currently online/);
  await owner.release(keys[0]);
  for (const changed of [{ expectedName: 'Wrong name' }, { characterId: other.id }, { accountKey: keys[1] }])
    await assert.rejects(provisionReviewContent(operator, { ...options, ...changed }), /do not match/);
  const preview = await provisionReviewContent(operator, { ...options, prepareRiding: true });
  assert.equal(preview.mode, 'dry-run'); assert.equal(preview.addedProducts.length, 8);
  assert.deepEqual(await read(), before, 'dry-run writes no player data');

  await admin.query(`UPDATE ${schema}.mossvale_players SET pending_credits=$2::jsonb WHERE account_key=$1`, [keys[0], JSON.stringify({ [reviewer.id]: 17 })]);
  const result = await provisionReviewContent(operator, { ...options, prepareRiding: true, apply: true });
  assert.equal(result.changed, true);
  let saved = await read(), player = saved.characters[0];
  validateRecords({ [keys[0]]: saved });
  assert.equal(player.level, 25); assert.equal(player.ridingRank, 1); assert.equal(player.maxHp, maxHealth(player));
  assert.equal(player.hp, reviewer.hp); assert.equal(player.xp, reviewer.xp); assert.equal(player.gold, reviewer.gold + 17, 'normal writer preserves pending auction proceeds');
  assert.equal(player.onboarding.completed, true);
  assert.equal(player.storePurchases.length, 4); assert.equal(player.storeGrants.length, 8);
  assert.equal(player.ownedMounts.length, 2); assert.equal(player.ownedPets.length, 2);
  for (const product of STORE_PRODUCTS.filter(product => product.kind === 'mount' || product.kind === 'pet')) assert.equal(storeNftConvertible(player, product.rewardId), false, 'complimentary rewards are not transferable NFT purchase receipts');
  const goldCharges = structuredClone(player); goldCharges.storeConsumables.damage = 2; assert(storePlayerValid(goldCharges), 'current gold boost purchases remain valid alongside grants');
  assert.deepEqual(player.storeOrders, before.characters[0].storeOrders);
  assert.deepEqual(player.mobileStoreOrders, before.characters[0].mobileStoreOrders);
  for (const field of ['quest', 'inventory', 'equipment', 'ownedGear', 'talents', 'bank', 'learnedSpells', 'hotbar']) assert.deepEqual(player[field], reviewer[field], `preserve ${field}`);
  assert.deepEqual(saved.characters[1], before.characters[1]); assert.deepEqual(await read(keys[1]), unrelated);
  assert(!saved.gmProtected && !saved.betaTester && !player.role && !player.gm);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM ${schema}.mossvale_mobile_receipts`)).rows[0].n, 0, 'complimentary grants never mint payment receipts');
  const replay = await provisionReviewContent(operator, { ...options, prepareRiding: true, apply: true });
  assert.equal(replay.changed, false); assert.deepEqual(await read(), saved);

  for (const mutate of [
    p => { p.storeGrants = null; }, p => { p.storeGrants[0].characterId = other.id; },
    p => { p.storeGrants[0].reason = 'payment'; }, p => { p.storeGrants[0].grantedAt = 0; },
    p => { p.storeGrants[0].receipt = 'fake'; }, p => { p.storeGrants[0].productId = 'store-cosmetic-box'; },
    p => { p.storeGrants[0].id = 'not-a-uuid'; }, p => { p.storeGrants.push({ ...p.storeGrants[0] }); },
    p => { p.storeGrants[0].productId = 'store-class-change'; }, p => { p.storeGrants[0].productId = 'store-sp-protection-roll'; }, p => { p.storeGrants.shift(); },
  ]) { const invalid = structuredClone(player); mutate(invalid); assert.equal(storePlayerValid(invalid), false); }
  const duplicate = structuredClone(player); duplicate.storeGrants.push({ ...duplicate.storeGrants[0], id: randomUUID() });
  assert.equal(storePlayerValid(duplicate), false, 'two grant IDs cannot duplicate a permanent entitlement');
  await owner.claim(keys[0]);
  const changedHistory = structuredClone(saved); changedHistory.characters[0].storeGrants[0].grantedAt++;
  await assert.rejects(owner.commit([{ key: keys[0], state: changedHistory, expected: saved }]), /history cannot be changed/);
  await owner.release(keys[0]);

  // A genuine native charge can coexist with a complimentary boost; refunding
  // the paid charge preserves the free charge and never rewrites its provenance.
  const mixed = structuredClone(player), paidAt = Date.now();
  mixed.mobileStoreOrders = [{ id: randomUUID(), characterId: player.id, productId: 'store-damage', sku: MOBILE_STORE_SKUS['store-damage'], platform: 'apple',
    createdAt: paidAt, expiresAt: paidAt + 60000, status: 'delivered', paymentId: '12345', purchasedAt: paidAt, sandbox: true,
    reward: { kind: 'boost', boostId: 'damage', grantedAt: paidAt } }];
  mixed.storeConsumables.damage++;
  assert(storePlayerValid(mixed));
  Object.assign(mixed, storeActivationChanges(mixed, 'damage', paidAt));
  Object.assign(mixed, mobileRefundChanges(mixed, mixed.mobileStoreOrders[0], { at: paidAt, eventId: 'local-refund' }, paidAt));
  assert(storePlayerValid(mixed)); assert.equal(mixed.storeConsumables.damage, 1); assert.deepEqual(mixed.storeGrants, player.storeGrants);
  await owner.claim(keys[0]);
  const forgedReceipt = structuredClone(saved); forgedReceipt.characters[0] = mixed;
  await assert.rejects(owner.commit([{ key: keys[0], state: forgedReceipt, expected: saved }]), /verified receipt persistence/);
  await owner.release(keys[0]);

  const disabled = { status: async () => ({ enabled: false, reason: 'Local test.' }) };
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, databaseUrl: url.toString(), databaseCaBase64: '', keycloak: null,
    walletOidc: { env: {} }, auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, mobilePurchaseVerifier: { status: () => ({ apple: false, google: false }) } });
  const port = await game.start();
  async function connect(index) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
    c.send = message => socket.send(JSON.stringify(message));
    socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (message.type === 'snapshot') c.snapshot = message; });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    c.send({ type: 'join', token: tokens[index], characterId: fixture[keys[index]].characters[0].id });
    await until(() => c.snapshot, 'local review login'); return c;
  }
  const c = await connect(0), rival = await connect(1);
  assert(c.snapshot.players.every(p => p.storeGrants === undefined));
  assert(rival.snapshot.players.every(p => p.storeGrants === undefined), 'private grant provenance is never broadcast');
  await assert.rejects(provisionReviewContent(operator, { ...options, apply: true }), /currently online/);
  c.send({ type: 'selectTitle', titleId: 'burned', storeGrants: player.storeGrants });
  await until(() => c.messages.some(message => message.type === 'event' && /Game progress is controlled/.test(message.text)), 'forged grants rejected');
  assert.deepEqual((await read()).characters[0].storeGrants, player.storeGrants);
  await delay(300);
  c.send({ type: 'storeActivateBoost', boostId: 'damage' });
  await until(async () => (await read()).characters[0].storeConsumables.damage === 0, 'real activation consumes the complimentary charge');
  saved = await read(); assert(storePlayerValid(saved.characters[0]));
  for (const client of clients) client.socket.terminate();
  await game.stop(); game = undefined;
  const consumedReplay = await provisionReviewContent(operator, { ...options, prepareRiding: true, apply: true });
  assert.equal(consumedReplay.changed, false); assert.equal((await read()).characters[0].storeConsumables.damage, 0, 'replay never refills a consumed grant');

  await owner.claim(keys[1]);
  const pending = await read(keys[1]), t = Date.now();
  pending.characters[0].mobileStoreOrders.push({ id: randomUUID(), characterId: other.id, productId: 'store-damage', sku: MOBILE_STORE_SKUS['store-damage'],
    platform: 'google', createdAt: t, expiresAt: t + 60000, status: 'pending' });
  await owner.commit([{ key: keys[1], state: pending }]); await owner.release(keys[1]);
  await assert.rejects(provisionReviewContent(operator, { accountKey: keys[1], characterId: other.id, expectedName: other.name, apply: true }), /unsettled purchases/);
  console.log('PASS review content: strict grants, legacy saves, dry-run, durable idempotence, consumed-charge replay, lock/missing/identity guards, pending credits, unchanged accounts/receipts, native refund coexistence, forged receipt rejection, private snapshots, socket tamper rejection and real boost activation. Local PostgreSQL only.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop();
  for (const store of stores) await store.close();
  if (admin) { try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); } }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe' });
  rmSync(dir, { recursive: true, force: true });
}
