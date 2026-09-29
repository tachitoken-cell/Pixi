import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createMobilePurchaseVerifier, MOBILE_APP_ID } from '../src/mobile-purchase-verifier.mjs';
import { MOBILE_STORE_SKUS, mobileRefundChanges, storeActivationChanges, storePlayerValid, STORE_BOOST_DURATION_MS } from '../src/ingame-store.ts';
const now = Date.now(), hour = STORE_BOOST_DURATION_MS, id = randomUUID(), sku = MOBILE_STORE_SKUS['store-damage'];
const order = (n, productId = 'store-damage') => ({ id: randomUUID(), characterId: id, productId, sku: MOBILE_STORE_SKUS[productId], platform: 'apple',
  createdAt: now - 10000, expiresAt: now + hour, status: 'delivered', paymentId: String(n), purchasedAt: now - 1000, sandbox: false,
  reward: productId === 'store-damage' ? { kind: 'boost', boostId: 'damage', grantedAt: now } : { kind: 'cosmetic', productId, grantedAt: now } });
const base = { id, storeOrders: [], storePurchases: [], ownedMounts: [], ownedPets: [], mobileStoreOrders: [order(1), order(2)], storeConsumables: { damage: 2 }, storeBoosts: {} };
assert(storePlayerValid(base));
let player = structuredClone(base);
Object.assign(player, storeActivationChanges(player, 'damage', now));
Object.assign(player, storeActivationChanges(player, 'damage', now));
assert.equal(player.storeBoosts.damage, now + 2 * hour); assert(storePlayerValid(player));
const first = player.mobileStoreOrders[0], second = player.mobileStoreOrders[1];
Object.assign(player, mobileRefundChanges(player, first, { at: now + hour / 4, eventId: 'refund-first' }, now + hour / 4));
assert.equal(player.storeBoosts.damage, now + hour * 1.25);
assert.deepEqual(player.mobileStoreOrders[1].activation, { startsAt: now + hour / 4, endsAt: now + hour * 1.25 });
assert.equal(player.mobileStoreOrders[0].revocation.consumedMs, hour / 4); assert(storePlayerValid(player));
assert.deepEqual(mobileRefundChanges(player, player.mobileStoreOrders[0], { at: now + hour / 2, eventId: 'duplicate' }), {});
Object.assign(player, mobileRefundChanges(player, player.mobileStoreOrders[1], { at: now + hour / 2, eventId: 'refund-second' }, now + hour / 2));
assert.equal(player.storeBoosts.damage, 0); assert(storePlayerValid(player));
player = structuredClone(base); Object.assign(player, mobileRefundChanges(player, player.mobileStoreOrders[0], { at: now, eventId: 'unused' }, now));
assert.equal(player.storeConsumables.damage, 1); assert(storePlayerValid(player));
player = { ...structuredClone(base), mobileStoreOrders: [order(10)], storeConsumables: { damage: 1 } };
Object.assign(player, storeActivationChanges(player, 'damage', now));
Object.assign(player, mobileRefundChanges(player, player.mobileStoreOrders[0], { at: now + 2 * hour, eventId: 'fully-consumed' }, now + 2 * hour));
assert.equal(player.storeBoosts.damage, 0); assert.equal(player.mobileStoreOrders[0].revocation.consumedMs, hour); assert(storePlayerValid(player));
player = structuredClone(base); Object.assign(player, storeActivationChanges(player, 'damage', now));
Object.assign(player, storeActivationChanges(player, 'damage', now + 2 * hour));
Object.assign(player, mobileRefundChanges(player, player.mobileStoreOrders[0], { at: now + 2.5 * hour, eventId: 'expired-with-later-benefit' }, now + 2.5 * hour));
assert.equal(player.storeBoosts.damage, now + 3 * hour, 'expired refund preserves later live purchased hour');
assert.deepEqual(player.mobileStoreOrders[1].activation, { startsAt: now + 2 * hour, endsAt: now + 3 * hour }); assert(storePlayerValid(player));
const pet = order(3, 'store-ashwing');
player = { ...structuredClone(base), storePurchases: ['store-ashwing'], ownedPets: ['store-ashwing'], summonedPet: 'store-ashwing', mobileStoreOrders: [...base.mobileStoreOrders, pet] };
Object.assign(player, mobileRefundChanges(player, pet, { at: now, eventId: 'pet' }, now));
assert.deepEqual(player.ownedPets, []); assert.equal(player.summonedPet, null); assert(storePlayerValid(player));
const title = order(4, 'burned');
player = { ...structuredClone(base), title: 'burned', storePurchases: ['burned'], mobileStoreOrders: [...base.mobileStoreOrders, title] };
assert(storePlayerValid(player), 'retired title ownership and historical native receipt remain valid');
Object.assign(player, mobileRefundChanges(player, title, { at: now, eventId: 'retired-title' }, now));
assert.deepEqual(player.storePurchases, []); assert.equal(player.title, null); assert(storePlayerValid(player), 'retired title refunds remain valid');
assert.throws(() => mobileRefundChanges({ ...base, storeConsumables: {} }, base.mobileStoreOrders[0], { at: now, eventId: 'legacy' }), { code: 'PURCHASE_RECOVERY_REQUIRED' });

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 'billing@local.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
  GOOGLE_RTDN_EMAIL: 'push@local.iam.gserviceaccount.com', GOOGLE_RTDN_AUDIENCE: 'https://game.example/api/mobile-purchases/google-notifications', GOOGLE_RTDN_SUBSCRIPTION: 'projects/local/subscriptions/receipts' };
const intentId = randomUUID(), token = 'private-fixture-token', at = String(now), calls = [];
let purchase = { obfuscatedExternalAccountId: intentId, purchaseCompletionTime: new Date(now).toISOString(), purchaseStateContext: { purchaseState: 'PURCHASED' }, productLineItem: [{ productId: sku, productOfferDetails: { quantity: 1, refundableQuantity: 1 } }] };
let missing = false;
const verifier = createMobilePurchaseVerifier({ env, googlePushKeys: publicKey, request: async (url, options) => {
  assert.equal(options.redirect, 'error'); calls.push(url);
  if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'private-fixture-oauth', token_type: 'Bearer', expires_in: 3600 });
  assert.equal(options.headers.Authorization, 'Bearer private-fixture-oauth');
  if (url.includes('/voidedpurchases?')) { const params = new URL(url).searchParams; assert.equal(params.get('type'), '0'); assert.equal(params.get('includeQuantityBasedPartialRefund'), 'true');
    return Response.json({ voidedPurchases: [{ purchaseToken: token, voidedTimeMillis: at, voidedQuantity: 1 }], tokenPagination: { nextPageToken: 'next-page' } }); }
  return missing ? new Response('', { status: 404 }) : Response.json(purchase);
} });
async function bearer(change = {}) { return 'Bearer ' + await new SignJWT({ email: env.GOOGLE_RTDN_EMAIL, email_verified: true, ...change })
  .setProtectedHeader({ alg: 'RS256' }).setIssuer('https://accounts.google.com').setAudience(env.GOOGLE_RTDN_AUDIENCE).setIssuedAt().setExpirationTime('15m').sign(privateKey); }
const data = { version: '1.0', packageName: MOBILE_APP_ID, eventTimeMillis: at, oneTimeProductNotification: { version: '1.0', notificationType: 1, purchaseToken: token, sku } };
const envelope = obj => ({ subscription: env.GOOGLE_RTDN_SUBSCRIPTION, message: { messageId: '123456789', data: Buffer.from(JSON.stringify(obj)).toString('base64') } });
const authorization = await bearer();
const paid = await verifier.notification('google', envelope(data), authorization);
assert.equal(paid.kind, 'payment'); assert.equal(paid.intentId, intentId); assert.equal(paid.paymentId, createHash('sha256').update(token).digest('hex'));
assert(!JSON.stringify(paid).includes(token));
await assert.rejects(() => verifier.notification('google', envelope(data), authorization + 'bad'));
await assert.rejects(() => verifier.notification('google', envelope(data), 'Bearer nonsense'));
await assert.rejects(() => verifier.notification('google', envelope({ ...data, packageName: 'wrong.app' }), authorization));
await assert.rejects(() => verifier.notification('google', { ...envelope(data), subscription: 'other' }, authorization));
for (const claim of [{ email: 'other@example.com' }, { email_verified: false }]) await assert.rejects(async () => verifier.notification('google', envelope(data), await bearer(claim)));
purchase = { ...purchase, productLineItem: [{ productId: sku, productOfferDetails: { quantity: 1, refundableQuantity: 0 } }] };
assert.equal((await verifier.notification('google', envelope(data), authorization)).kind, 'refund', 'fresh refunded state wins over stale PURCHASED message');
missing = true;
await assert.rejects(() => verifier.notification('google', envelope(data), authorization), '404 ordinary RTDN is not a refund proof');
const { oneTimeProductNotification, ...voided } = data;
voided.voidedPurchaseNotification = { purchaseToken: token, productType: 2, refundType: 1 };
assert.equal((await verifier.notification('google', envelope(voided), authorization)).kind, 'refund', 'authenticated full void is authoritative after consumed token expires');
const page = await verifier.voidedPage({ start: now - 60000, end: now, token: 'previous-page' });
assert.equal(page.nextToken, 'next-page'); assert.equal(page.events.length, 1); assert(!JSON.stringify(page).includes(token));
assert(calls.some(url => url.includes('token=previous-page')));

const appleData = { bundleId: MOBILE_APP_ID, transactionId: '999', type: 'Consumable', quantity: 1, inAppOwnershipType: 'PURCHASED', environment: 'Production', appAccountToken: intentId, productId: sku, purchaseDate: now - 1000, revocationDate: now };
let outerCalls = 0, innerCalls = 0;
const appleVerifier = createMobilePurchaseVerifier({ env: {}, appleStores: new Map([['Production', { verifier: {
  async verifyAndDecodeNotification(signed) { outerCalls++; assert.equal(signed, 'outer-signed-fixture'); return { version: '2.0', notificationUUID: randomUUID(), signedDate: now, notificationType: 'REFUND', data: { signedTransactionInfo: 'inner-signed-fixture' } }; },
  async verifyAndDecodeTransaction(signed) { innerCalls++; assert.equal(signed, 'inner-signed-fixture'); return appleData; },
} }]]) });
assert.equal((await appleVerifier.notification('apple', { signedPayload: 'outer-signed-fixture' })).kind, 'refund');
assert.equal(outerCalls, 1); assert.equal(innerCalls, 1, 'both outer notification and nested transaction use official verifier boundary');
appleData.bundleId = 'wrong.app'; await assert.rejects(() => appleVerifier.notification('apple', { signedPayload: 'outer-signed-fixture' }));
// Empty background inboxes must not queue a full player refresh ahead of joins/saves.
const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const pollSource = serverSource.slice(serverSource.indexOf('  async function pollMobileEvents()'), serverSource.indexOf('  let mobileNotifications'));
const pollCalls = [], pollContext = { mobileReady: true, closing: false, mobileVerifier: {},
  refreshRecords: async () => pollCalls.push('refresh'), database: {
    pendingMobileEvents: async () => { pollCalls.push('inbox'); return []; },
    completeMobileEvent: async () => pollCalls.push('complete'),
  } };
const poll = runInNewContext(`${pollSource}; pollMobileEvents`, pollContext);
await poll(); assert.deepEqual(pollCalls, ['inbox']);
pollCalls.length = 0;
pollContext.database.pendingMobileEvents = async () => { pollCalls.push('inbox'); return [{ data: { kind: 'ignored', eventId: 'ignored-fixture' } }]; };
await poll(); assert.deepEqual(pollCalls, ['inbox', 'refresh', 'complete'], 'nonempty inbox still refreshes before processing');
pollCalls.length = 0;
pollContext.database.pendingMobileEvents = async () => { pollCalls.push('inbox'); pollContext.closing = true; return [{ data: { kind: 'ignored' } }]; };
await poll(); assert.deepEqual(pollCalls, ['inbox'], 'shutdown does not start another refresh');
console.log('PASS mobile refunds: exact charge/stacked-duration/cosmetic reversal, immutable audit, real signed Google push identity checks, fresh-state RTDN, voided pagination, and both Apple JWS verifier boundaries. No store calls.');
