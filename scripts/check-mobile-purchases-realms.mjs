import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { createGameServer } from '../server.mjs';
import { validateMobileReceipt } from '../src/mobile-purchase-verifier.mjs';
import { MOBILE_STORE_SKUS, storePlayerValid } from '../src/ingame-store.ts';
import { starterGear } from '../src/progression.ts';
import { createPlayerStore } from '../src/player-store.mjs';

// Real HTTP/JWT/PostgreSQL and independent realm account locks. Store responses
// alone are controlled; no store API, wallet, live database or real purchase.
const run = promisify(execFile), realNow = Date.now, dir = mkdtempSync(join(tmpdir(), 'mossvale-mobile-purchases-'));
const schema = `mobile_purchases_${randomUUID().replaceAll('-', '')}`, games = [], receipts = new Map(), notifications = new Map();
let container, admin, databaseUrl, issuer, collision, hold, offset = 0;
Date.now = () => realNow() + offset;
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'local-mobile-test', use: 'sig', alg: 'RS256' };
const identityServer = createServer((req, res) => req.url === '/realms/mossvale/protocol/openid-connect/certs'
  ? res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] })) : res.writeHead(404).end());
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const hero = name => ({ id: randomUUID(), name, appearance, x: 0, z: 8, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
  characterCreated: true, ...starterGear('Ranger'), talents: [], level: 1, hp: 100, maxHp: 100, xp: 7, gold: 23,
  inventory: { wood: 2, crystal: 0, herb: 0, potion: 3, relic: 0 }, learnedSpells: ['arrow'], ridingRank: 0,
  ownedMounts: [], ownedPets: [], storePurchases: [], quest: { stage: 0, kills: 0, crystals: 0 } });
const heroes = [hero('Native rider'), hero('Native mage'), hero('Native recovery')], subjects = [randomUUID(), randomUUID(), randomUUID()], tokens = [];
const key = i => createHash('sha256').update(`${issuer}\n${subjects[i]}`).digest('hex');
async function until(fn, label, timeout = 20000) {
  const end = realNow() + timeout;
  while (realNow() < end) { const result = await fn(); if (result) return result; await delay(20); }
  throw Error(`Timed out: ${label}`);
}
async function provision() {
  await new Promise(resolve => identityServer.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${identityServer.address().port}/realms/mossvale`;
  for (const sub of subjects) tokens.push(await new SignJWT({ sub, azp: 'mossvale-game', typ: 'Bearer' }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(issuer).setIssuedAt().setExpirationTime('2h').sign(privateKey));
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = `mossvale-mobile-purchases-${randomUUID().slice(0, 8)}`; const password = randomUUID();
    await run('docker', ['run', '--rm', '-d', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`, '-p', '127.0.0.1::5432', 'postgres:17-bookworm']);
    const { stdout } = await run('docker', ['port', container, '5432/tcp']);
    const port = stdout.trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1]; assert(port);
    url = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  }
  const scoped = new URL(url);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(scoped.hostname), 'Only disposable loopback PostgreSQL is permitted');
  await until(async () => { const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 });
    try { await client.connect(); admin = client; return true; } catch { await client.end(); return false; } }, 'local PostgreSQL ready', 30000);
  await admin.query(`CREATE SCHEMA ${schema}`);
  scoped.searchParams.set('options', `-c search_path=${schema}`); databaseUrl = scoped.toString();
  await admin.query(`CREATE TABLE ${schema}.mossvale_players (account_key text PRIMARY KEY, state jsonb NOT NULL)`);
  for (const [i, player] of heroes.entries()) await admin.query(`INSERT INTO ${schema}.mossvale_players VALUES ($1,$2)`, [key(i), { characters: [player] }]);
  await admin.query(`CREATE TABLE ${schema}.fail_delivery (enabled boolean)`); await admin.query(`INSERT INTO ${schema}.fail_delivery VALUES (false)`);
  await admin.query(`CREATE FUNCTION ${schema}.controlled_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF (SELECT enabled FROM ${schema}.fail_delivery) AND OLD.state#>'{characters,0,mobileStoreOrders}' IS DISTINCT FROM NEW.state#>'{characters,0,mobileStoreOrders}'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.state#>'{characters,0,mobileStoreOrders}') item WHERE item->>'status' <> 'pending') THEN
      RAISE EXCEPTION 'Controlled delivery write failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
  await admin.query(`CREATE TRIGGER controlled_failure BEFORE UPDATE ON ${schema}.mossvale_players FOR EACH ROW EXECUTE FUNCTION ${schema}.controlled_failure()`);
}
async function start(realmId) {
  const disabled = { status: async () => ({ enabled: false, reason: 'Local test.' }) };
  const mobilePurchaseVerifier = { status: () => ({ apple: true, google: true }), async notification(platform, body, authorization) {
    if (authorization !== 'Bearer local-notification-proof' || !notifications.has(body.signedPayload)) throw Object.assign(Error('Invalid controlled provider event'), { status: 401 });
    return notifications.get(body.signedPayload);
  }, async verify(input, intent) {
    if (hold) { hold.arrived++; await hold.promise; }
    const data = receipts.get(input.purchaseToken || input.transactionId);
    if (!data) throw Object.assign(Error('Controlled absent receipt'), { status: 400 });
    const result = validateMobileReceipt(data, { ...input, createdAt: intent.createdAt }, input.platform);
    return collision ? { ...result, paymentId: collision } : result;
  } };
  const game = createGameServer({ host: '127.0.0.1', port: 0, realmId, databaseUrl, databaseCaBase64: '', dataDir: join(dir, realmId),
    keycloak: { url: issuer.split('/realms/')[0], realm: 'mossvale', clientId: 'mossvale-game' }, walletOidc: { env: {} },
    auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, mobilePurchaseVerifier });
  games.push(game); return { game, port: await game.start() };
}
async function request(server, i, endpoint, body, options = {}) {
  const response = await fetch(`http://127.0.0.1:${server.port}/api/mobile-purchases/${endpoint}`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokens[i]}`, 'Content-Type': 'application/json', ...options.headers }, body: JSON.stringify(body) });
  const result = { status: response.status, body: await response.json().catch(() => null) };
  if (result.status === 429 && options.retry !== false) { await delay(1050); return request(server, i, endpoint, body, { ...options, retry: false }); }
  return result;
}
const stored = async i => (await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`, [key(i)])).rows[0].state.characters[0];
const ledgerCount = async () => (await admin.query(`SELECT count(*)::int AS n FROM ${schema}.mossvale_mobile_receipts`)).rows[0].n;
async function intent(server, i, productId, platform = 'google') {
  const response = await request(server, i, 'intents', { characterId: heroes[i].id, productId, platform });
  assert.equal(response.status, 200, JSON.stringify(response)); assert.equal(response.body.productId, MOBILE_STORE_SKUS[productId]);
  assert((await stored(i)).mobileStoreOrders.some(order => order.id === response.body.intentId && order.status === 'pending'), 'checkout response follows durable intent save');
  return response.body;
}
function proof(checkout, platform = 'google') {
  const identity = { intentId: checkout.intentId, productId: checkout.productId, platform };
  if (platform === 'apple') {
    const transactionId = String(receipts.size + 1000000000);
    receipts.set(transactionId, { bundleId: 'world.mossvale.game', transactionId, type: 'Consumable', quantity: 1, inAppOwnershipType: 'PURCHASED', environment: 'Production',
      appAccountToken: checkout.intentId, productId: checkout.productId, purchaseDate: Date.now() });
    return { ...identity, transactionId };
  }
  const purchaseToken = `private-local-${randomUUID()}`;
  receipts.set(purchaseToken, { purchaseStateContext: { purchaseState: 'PURCHASED' }, obfuscatedExternalAccountId: checkout.intentId,
    purchaseCompletionTime: new Date(Date.now()).toISOString(), productLineItem: [{ productId: checkout.productId, productOfferDetails: { quantity: 1, refundableQuantity: 1 } }] });
  return { ...identity, purchaseToken };
}
try {
  await provision(); let eu = await start('eu'), us = await start('us');
  const config = await (await fetch(`http://127.0.0.1:${eu.port}/api/config`)).json(); assert.deepEqual(config.mobilePurchases, { apple: true, google: true });
  assert.equal((await request(eu, 0, 'intents', {}, { headers: { Authorization: '' } })).status, 401);
  assert.equal((await request(eu, 0, 'intents', {}, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  for (const platform of ['apple', 'google']) assert.equal((await request(eu, 0, 'intents', { characterId: heroes[0].id, productId: 'burned', platform })).status, 400, 'retired titles cannot create native purchase intents');
  const boostIntent = await intent(eu, 0, 'store-damage'), purchase = proof(boostIntent);
  assert.equal((await request(eu, 1, 'verify', purchase)).status, 404, 'wrong account cannot claim receipt');
  assert.equal((await request(eu, 0, 'verify', { ...purchase, productId: MOBILE_STORE_SKUS.burned })).status, 400);
  await admin.query(`UPDATE ${schema}.fail_delivery SET enabled=true`);
  assert.equal((await request(eu, 0, 'verify', purchase)).status, 503);
  assert.equal((await stored(0)).mobileStoreOrders[0].status, 'pending'); assert.equal(await ledgerCount(), 0, 'failed reward save rolls back unique receipt');
  assert.deepEqual((await stored(0)).storeConsumables, {});
  await admin.query(`UPDATE ${schema}.fail_delivery SET enabled=false`);
  let release; hold = { arrived: 0, promise: new Promise(resolve => { release = resolve; }) };
  const simultaneous = Promise.all([request(eu, 0, 'verify', purchase), request(us, 0, 'verify', purchase)]);
  await until(() => hold.arrived === 2, 'both independent realms verify same receipt'); release(); hold = undefined;
  const outcomes = await simultaneous; assert(outcomes.some(result => result.status === 200)); assert(outcomes.every(result => [200, 409].includes(result.status)));
  assert.equal((await stored(0)).storeConsumables.damage, 1); assert.equal(await ledgerCount(), 1); assert(storePlayerValid(await stored(0)));
  await Promise.all([eu.game.stop(), us.game.stop()]); eu = await start('eu'); us = await start('us');
  assert.deepEqual((await request(us, 0, 'verify', purchase)).body, { delivered: true }, 'unfinished receipt replay after server restart');
  assert.equal((await stored(0)).storeConsumables.damage, 1); assert.equal(await ledgerCount(), 1);
  const second = proof(await intent(us, 1, 'store-damage'));
  assert.equal((await request(us, 1, 'verify', { ...second, purchaseToken: purchase.purchaseToken })).status, 400, 'provider account binding defeats copied receipt');
  collision = createHash('sha256').update(purchase.purchaseToken).digest('hex');
  assert.equal((await request(us, 1, 'verify', second)).status, 503, 'global ledger rejects reused payment even if verifier regression supplied a different intent');
  assert.deepEqual((await stored(1)).storeConsumables, {}); assert.equal(await ledgerCount(), 1); collision = undefined;
  assert.equal((await request(us, 1, 'verify', second)).status, 200); assert.equal(await ledgerCount(), 2);
  const oldCheckout = await intent(eu, 2, 'store-embermane', 'apple');
  assert.deepEqual(await intent(eu, 2, 'store-embermane', 'apple'), oldCheckout, 'repeated unpaid checkout reuses durable intent');
  const reserved = await request(eu, 2, 'intents', { characterId: heroes[2].id, productId: 'store-cosmetic-box', platform: 'apple' });
  assert.equal(reserved.status, 409, 'cosmetic reservation blocks conflicting box');
  offset += 16 * 60 * 1000;
  const newCheckout = await intent(eu, 2, 'store-embermane', 'apple'); assert.notEqual(newCheckout.intentId, oldCheckout.intentId);
  assert.equal((await request(eu, 2, 'verify', proof(newCheckout, 'apple'))).status, 200);
  const latePaid = proof(oldCheckout, 'apple'), recovery = await request(eu, 2, 'verify', latePaid);
  assert.equal(recovery.status, 409); assert.equal(recovery.body.code, 'PURCHASE_RECOVERY_REQUIRED');
  const recovered = await stored(2); assert(storePlayerValid(recovered)); assert.equal(recovered.mobileStoreOrders[0].status, 'payment-confirmed');
  assert.equal(recovered.mobileStoreOrders[0].reason, 'duplicate-cosmetic'); assert.deepEqual(recovered.ownedMounts, ['store-embermane']);
  assert.equal(await ledgerCount(), 4, 'paid conflict recorded durably without duplicate reward or acknowledgement');
  assert.equal((await request(us, 2, 'verify', latePaid)).body.code, 'PURCHASE_RECOVERY_REQUIRED');
  receipts.get(latePaid.transactionId).revocationDate = Date.now();
  assert.equal((await request(us, 2, 'verify', latePaid)).status, 409, 'revoked receipt recheck cannot become delivered');
  assert.equal(await ledgerCount(), 4);
  const nextPurchase = proof(await intent(eu, 0, 'store-defense'));
  assert.equal((await request(eu, 0, 'verify', nextPurchase, { retry: false })).status, 200, 'immediate native verification is not throttled after checkout');
  for (const pending of [purchase, nextPurchase]) assert.equal((await request(eu, 0, 'verify', pending, { retry: false })).status, 200, 'bulk restore can confirm sequential receipts without throttling');
  const writer = createPlayerStore({ connectionString: databaseUrl, validate: state => assert(state.characters.every(storePlayerValid)) });
  try {
    await writer.start(); const baseline = await writer.claim(key(0)); assert(baseline);
    const forged = structuredClone(baseline), character = forged.characters[0];
    character.mobileStoreOrders.push({ ...character.mobileStoreOrders[0], id: randomUUID(), paymentId: 'f'.repeat(64) });
    character.storeConsumables.damage++;
    assert(storePlayerValid(character), 'forgery resembles internally consistent reward history');
    await assert.rejects(() => writer.commit([{ key: key(0), state: forged }]), /verified receipt persistence/, 'ordinary gameplay save cannot introduce a fabricated native reward');
    assert.equal((await stored(0)).storeConsumables.damage, 1); assert.equal(await ledgerCount(), 5);
  } finally { await writer.close(); }
  // New refund lifecycle: auth and durable inbox are separate from applying the
  // exact entitlement. Simulate provider events, but use real HTTP/DB/realm locks.
  async function notify(server, input, kind = 'refund', eventId = randomUUID()) {
    const raw = receipts.get(input.purchaseToken || input.transactionId);
    const receipt = validateMobileReceipt(raw, { ...input, createdAt: 0 }, input.platform, false, Date.now(), true);
    const event = { ...receipt, eventId, kind, at: Date.now() }, signedPayload = randomUUID();
    notifications.set(signedPayload, event);
    const result = await request(server, 0, `${input.platform}-notifications`, { signedPayload }, { headers: { Authorization: 'Bearer local-notification-proof' } });
    assert.equal(result.status, 204, 'notification acknowledges durable inbox'); return event;
  }
  assert.equal((await request(eu, 0, 'apple-notifications', { signedPayload: 'untrusted' })).status, 401);
  const abandoned = await intent(eu, 1, 'store-cinder-kit');
  assert.equal((await request(eu, 0, 'abandon', { intentId: abandoned.intentId })).status, 404);
  assert.equal((await request(eu, 1, 'abandon', { intentId: abandoned.intentId })).body.status, 'abandoned');
  assert.equal((await request(eu, 1, 'abandon', { intentId: abandoned.intentId })).body.status, 'abandoned');
  const unlocked = await intent(eu, 1, 'store-cosmetic-box');
  assert.equal((await request(eu, 1, 'abandon', { intentId: unlocked.intentId })).body.status, 'abandoned');
  const abandonedPaid = proof(abandoned);
  assert.equal((await request(eu, 1, 'verify', abandonedPaid)).status, 200, 'abandon is not proof of nonpayment and accepts a late valid receipt');
  await admin.query(`UPDATE ${schema}.fail_delivery SET enabled=true`);
  const refund = await notify(us, purchase);
  await delay(1300);
  assert.equal((await stored(0)).storeConsumables.damage, 1, 'failed reversal leaves original reward intact');
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM ${schema}.mossvale_mobile_events WHERE event_id=$1 AND applied_at IS NULL`, [refund.eventId])).rows[0].n, 1, 'failed reversal remains in durable inbox');
  await admin.query(`UPDATE ${schema}.fail_delivery SET enabled=false`);
  await Promise.all([eu.game.stop(), us.game.stop()]); eu = await start('eu'); us = await start('us');
  await until(async () => (await stored(0)).mobileStoreOrders.find(order => order.id === purchase.intentId).status === 'refunded', 'reversal resumes after both realms restart');
  assert.equal((await stored(0)).storeConsumables.damage, 0); assert(storePlayerValid(await stored(0)));
  await Promise.all([notify(eu, purchase, 'refund', refund.eventId), notify(us, purchase, 'refund', refund.eventId)]);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM ${schema}.mossvale_mobile_events WHERE event_id=$1`, [refund.eventId])).rows[0].n, 1);
  const final = await request(eu, 0, 'verify', purchase);
  assert.equal(final.status, 409); assert.equal(final.body.code, 'PURCHASE_REFUNDED'); assert.equal(final.body.refunded, true);
  assert.equal((await stored(0)).storeConsumables.damage, 0, 'old valid-looking payment cannot override durable refund');
  const expiredProviderReceipt = receipts.get(purchase.purchaseToken); receipts.delete(purchase.purchaseToken);
  assert.equal((await request(eu, 0, 'verify', purchase)).body.code, 'PURCHASE_REFUNDED', 'durable refund remains terminal after consumed token expires at provider');
  receipts.set(purchase.purchaseToken, expiredProviderReceipt);
  const earlyRefund = proof(await intent(us, 1, 'store-defense'));
  await notify(eu, earlyRefund);
  await until(async () => (await stored(1)).mobileStoreOrders.find(order => order.id === earlyRefund.intentId).status === 'refunded', 'refund before native delivery');
  assert.equal((await stored(1)).storeConsumables.defense || 0, 0);
  assert.equal((await request(us, 1, 'verify', earlyRefund)).body.code, 'PURCHASE_REFUNDED');
  const petRevoke = await notify(eu, abandonedPaid);
  await until(async () => !(await stored(1)).ownedPets.includes('store-cinder-kit'), 'exact cosmetic revoked');
  assert(storePlayerValid(await stored(1)));
  await notify(us, latePaid);
  await until(async () => (await stored(2)).mobileStoreOrders.find(order => order.id === latePaid.intentId).status === 'refunded', 'paid duplicate resolves only on verified refund');
  const retryOld = await intent(eu, 2, 'store-ashwing'); await request(eu, 2, 'abandon', { intentId: retryOld.intentId });
  const retryNew = proof(await intent(eu, 2, 'store-ashwing')), retryPaid = proof(retryOld);
  assert.equal((await request(eu, 2, 'verify', retryNew)).status, 200);
  assert.equal((await request(eu, 2, 'verify', retryPaid)).body.code, 'PURCHASE_RECOVERY_REQUIRED');
  await notify(us, retryNew);
  await until(async () => !(await stored(2)).ownedPets.includes('store-ashwing'), 'conflicting exact cosmetic becomes available');
  assert.equal((await request(eu, 2, 'verify', retryPaid)).status, 200, 'same paid receipt can deliver original reward after conflict clears');
  assert.equal((await request(us, 2, 'verify', retryPaid)).status, 200, 'retried paid reward remains idempotent');
  assert(storePlayerValid(await stored(2)));
  const legacyPayment = proof(await intent(eu, 2, 'store-damage'));
  assert.equal((await request(eu, 2, 'verify', legacyPayment)).status, 200);
  const legacyWriter = createPlayerStore({ connectionString: databaseUrl, validate: state => assert(state.characters.every(storePlayerValid)) });
  try { await legacyWriter.start(); const account = await legacyWriter.claim(key(2)); assert(account);
    // Represents an old native charge consumed before activation attribution existed.
    account.characters[0].storeConsumables.damage--;
    await legacyWriter.commit([{ key: key(2), state: account }]);
  } finally { await legacyWriter.close(); }
  const laterHealthyPayment = proof(await intent(eu, 2, 'store-defense'));
  assert.equal((await request(eu, 2, 'verify', laterHealthyPayment)).status, 200);
  const legacyEvent = await notify(us, legacyPayment);
  await notify(us, laterHealthyPayment);
  await until(async () => (await admin.query(`SELECT outcome FROM ${schema}.mossvale_mobile_events WHERE event_id=$1`, [legacyEvent.eventId])).rows[0]?.outcome === 'support-review-required', 'unattributed legacy refund becomes explicit support case');
  await until(async () => (await stored(2)).mobileStoreOrders.find(order => order.id === laterHealthyPayment.intentId).status === 'refunded', 'legacy support case does not block later healthy refund');
  assert.equal((await stored(2)).mobileStoreOrders.find(order => order.id === legacyPayment.intentId).status, 'delivered', 'uncertain legacy benefit retained for explicit review');
  assert.equal((await request(eu, 2, 'verify', legacyPayment)).body.code, 'PURCHASE_RECOVERY_REQUIRED');
  const syncStore = createPlayerStore({ connectionString: databaseUrl });
  try {
    await syncStore.start(); const first = { start: Date.now() - 60000, end: Date.now(), token: 'next-page' };
    assert.equal(await syncStore.commitMobileSync(null, first, []), true);
    assert.equal(await syncStore.commitMobileSync(null, { cursor: Date.now() }, []), false, 'stale realm cannot advance a newer shared cursor');
    await admin.query(`CREATE FUNCTION ${schema}.fail_mobile_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_id='cursor-write-failure' THEN RAISE EXCEPTION 'Controlled event failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER fail_mobile_event BEFORE INSERT ON ${schema}.mossvale_mobile_events FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_mobile_event()`);
    await assert.rejects(() => syncStore.commitMobileSync(first, { cursor: Date.now() }, [{ eventId: 'cursor-write-failure', platform: 'google', kind: 'refund', at: Date.now(), paymentId: 'e'.repeat(64) }]));
    assert.deepEqual(await syncStore.mobileSyncState(), first, 'page failure rolls back cursor; no refund page can be skipped');
  } finally { await syncStore.close(); }
  const retired = await intent(us, 1, 'store-profession-xp');
  await request(us, 1, 'abandon', { intentId: retired.intentId });
  const retiredPayment = proof(retired);
  const retirement = createPlayerStore({ connectionString: databaseUrl, validate: state => assert(state.characters.every(storePlayerValid)) });
  try { await retirement.start(); const account = await retirement.claim(key(1)); assert(account);
    await retirement.commit([{ key: key(1), state: { ...account, characters: [] } }]);
  } finally { await retirement.close(); }
  assert((await admin.query(`SELECT order_data FROM ${schema}.mossvale_mobile_intents WHERE intent_id=$1`, [retired.intentId])).rows.length, 'deleted character preserves its checkout');
  const lateRetired = await request(us, 1, 'verify', retiredPayment);
  assert.equal(lateRetired.body.code, 'PURCHASE_RECOVERY_REQUIRED');
  assert.equal((await admin.query(`SELECT status FROM ${schema}.mossvale_mobile_receipts WHERE intent_id=$1`, [retired.intentId])).rows[0].status, 'payment-confirmed', 'late paid obligation recorded without recreating character');
  await notify(eu, retiredPayment);
  await until(async () => (await admin.query(`SELECT status FROM ${schema}.mossvale_mobile_receipts WHERE intent_id=$1`, [retired.intentId])).rows[0]?.status === 'refunded', 'retired receipt refund reconciliation');
  assert.equal((await admin.query(`SELECT jsonb_array_length(state->'characters') AS n FROM ${schema}.mossvale_players WHERE account_key=$1`, [key(1)])).rows[0].n, 0);
  console.log('PASS refund lifecycle: abandon/late pay, private provider HTTP gate, durable inbox rollback/restart, duplicate two-realm refund, pre-delivery tombstone, exact cosmetic/charge revocation, terminal native status and retired-character paid/refund retention.');
  console.log('PASS native purchases: authenticated HTTP, durable checkout, atomic save rollback, two-realm duplicate race, restart replay, foreign account/SKU rejection, unique global ledger, consumable grants, reservations and durable paid recovery. No real purchases.');
} finally {
  hold = undefined;
  await Promise.allSettled(games.map(game => game.stop()));
  await new Promise(resolve => identityServer.close(resolve));
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {}); await admin.end(); }
  if (container) await run('docker', ['rm', '-f', container]).catch(() => {});
  Date.now = realNow; rmSync(dir, { recursive: true, force: true });
}
