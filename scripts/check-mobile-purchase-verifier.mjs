import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { APIException } from '@apple/app-store-server-library';
import { createMobilePurchaseVerifier, validateMobileReceipt, MOBILE_APP_ID } from '../src/mobile-purchase-verifier.mjs';
const now = Date.now(), intentId = randomUUID(), productId = 'world.mossvale.game.store_damage';
const expected = { intentId, productId, createdAt: now - 1000, transactionId: '1234567890', purchaseToken: 'private-test-token' };
const apple = { bundleId: MOBILE_APP_ID, transactionId: expected.transactionId, type: 'Consumable', inAppOwnershipType: 'PURCHASED', quantity: 1,
  environment: 'Production', productId, appAccountToken: intentId, purchaseDate: now };
const google = { purchaseStateContext: { purchaseState: 'PURCHASED' }, obfuscatedExternalAccountId: intentId, purchaseCompletionTime: new Date(now).toISOString(),
  productLineItem: [{ productId, productOfferDetails: { quantity: 1, refundableQuantity: 1 } }] };
assert.equal(validateMobileReceipt(apple, expected, 'apple', false, now).paymentId, expected.transactionId);
assert.equal(validateMobileReceipt(google, expected, 'google', false, now).paymentId, createHash('sha256').update(expected.purchaseToken).digest('hex'));
for (const change of [{ appAccountToken: randomUUID() }, { productId: 'other' }, { bundleId: 'other.app' }, { transactionId: '9' }, { quantity: 2 },
  { type: 'Non-Consumable' }, { inAppOwnershipType: 'FAMILY_SHARED' }, { revocationDate: now }, { environment: 'Sandbox' }, { purchaseDate: now + 31000 }])
  assert.throws(() => validateMobileReceipt({ ...apple, ...change }, expected, 'apple', false, now));
assert.equal(validateMobileReceipt({ ...apple, environment: 'Sandbox' }, expected, 'apple', true, now).sandbox, true);
for (const change of [{ obfuscatedExternalAccountId: randomUUID() }, { purchaseStateContext: { purchaseState: 'PENDING' } },
  { purchaseStateContext: { purchaseState: 'CANCELLED' } }, { testPurchaseContext: {} }, { purchaseCompletionTime: new Date(now - 40000).toISOString() },
  { productLineItem: [] }, { productLineItem: [...google.productLineItem, ...google.productLineItem] }])
  assert.throws(() => validateMobileReceipt({ ...google, ...change }, expected, 'google', false, now));
for (const refundableQuantity of [0, undefined, null, 2, '1']) assert.throws(() => validateMobileReceipt({ ...google,
  productLineItem: [{ productId, productOfferDetails: { quantity: 1, refundableQuantity } }] }, expected, 'google', false, now));
assert.equal(validateMobileReceipt({ ...google, testPurchaseContext: {} }, expected, 'google', true, now).sandbox, true);
assert.deepEqual(createMobilePurchaseVerifier({ env: {} }).status(), { apple: false, google: false });
assert.throws(() => createMobilePurchaseVerifier({ env: { MOBILE_PURCHASE_SANDBOX_ACCOUNTS: 'not-a-verified-account-key' } }));
const appleSigningKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const appleEnv = { APPLE_IAP_PRIVATE_KEY: appleSigningKey, APPLE_IAP_KEY_ID: 'TESTKEY123',
  APPLE_IAP_ISSUER_ID: '11111111-2222-1333-8444-555555555555' };
assert.equal(createMobilePurchaseVerifier({ env: appleEnv }).status().apple, true, 'Apple issuer UUID is not a Mossvale v4 intent ID');
for (const key of ['private-invalid-key-fixture', generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }),
  generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })])
  assert.throws(() => createMobilePurchaseVerifier({ env: { ...appleEnv, APPLE_IAP_PRIVATE_KEY: key } }),
    { message: 'Invalid App Store purchase signing key configuration.' }, 'unusable Apple keys fail before advertising checkout; no key appears in the error');
const account = 'a'.repeat(64), calls = [];
let productionError = new APIException(401), sandboxCalls = 0, signatureChecks = 0, invalidSignature = false;
let sandboxProof = { ...apple, environment: 'Sandbox' };
const appleInput = { platform: 'apple', intentId, productId, transactionId: expected.transactionId };
const appleIntent = { id: intentId, platform: 'apple', sku: productId, createdAt: expected.createdAt };
const reviewVerifier = createMobilePurchaseVerifier({ env: { MOBILE_PURCHASE_SANDBOX_ACCOUNTS: account }, appleStores: new Map([
  ['Production', { client: { async getTransactionInfo() { throw productionError; } } }],
  ['Sandbox', { client: { async getTransactionInfo(id) { assert.equal(id, expected.transactionId); sandboxCalls++; return { signedTransactionInfo: 'signed-sandbox-fixture' }; } },
    verifier: { async verifyAndDecodeTransaction(signed) { assert.equal(signed, 'signed-sandbox-fixture'); signatureChecks++;
      if (invalidSignature) throw Error('Invalid signature fixture'); return sandboxProof; } } }],
]) });
assert.equal((await reviewVerifier.verify(appleInput, appleIntent, account)).sandbox, true, 'pre-release 401 must permit a verified sandbox receipt for an allowlisted review account');
assert.equal(signatureChecks, 1, 'fallback still passes through the signed-data verifier');
await assert.rejects(() => reviewVerifier.verify(appleInput, appleIntent, 'b'.repeat(64)), { status: 503 });
assert.equal(sandboxCalls, 1, 'production accounts must never follow 401 into sandbox');
productionError = new APIException(404, 4040010);
assert.equal((await reviewVerifier.verify(appleInput, appleIntent, account)).sandbox, true, 'existing not-found fallback remains supported');
await assert.rejects(() => reviewVerifier.verify(appleInput, appleIntent, 'b'.repeat(64)), { status: 503 });
assert.equal(sandboxCalls, 2, 'not-found fallback also remains account-allowlisted');
productionError = new APIException(403);
await assert.rejects(() => reviewVerifier.verify(appleInput, appleIntent, account), { status: 503 });
assert.equal(sandboxCalls, 2, 'other production failures are not sandbox fallbacks');
productionError = new APIException(401); invalidSignature = true;
await assert.rejects(() => reviewVerifier.verify(appleInput, appleIntent, account), /Invalid signature fixture/);
invalidSignature = false;
for (const change of [{ bundleId: 'wrong.app' }, { appAccountToken: randomUUID() }, { productId: 'other' }]) {
  sandboxProof = { ...apple, environment: 'Sandbox', ...change };
  await assert.rejects(() => reviewVerifier.verify(appleInput, appleIntent, account));
}
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 'billing@test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const verifier = createMobilePurchaseVerifier({ env, request: async (url, options) => {
  calls.push(url); assert.equal(options.redirect, 'error'); assert(options.signal);
  if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'private-oauth-test', token_type: 'Bearer', expires_in: 3600 }));
  assert.equal(url, `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${MOBILE_APP_ID}/purchases/productsv2/tokens/private-test-token`);
  assert.equal(options.headers.Authorization, 'Bearer private-oauth-test'); return new Response(JSON.stringify(google));
} });
const input = { platform: 'google', intentId, productId, purchaseToken: expected.purchaseToken };
const intent = { id: intentId, platform: 'google', sku: productId, createdAt: expected.createdAt };
await Promise.all([verifier.verify(input, intent, account), verifier.verify(input, intent, account)]);
assert.equal(calls.filter(url => url.includes('oauth2')).length, 1, 'concurrent verification shares OAuth renewal');
await assert.rejects(() => verifier.verify({ ...input, productId: 'other' }, intent, account));
await assert.rejects(() => verifier.verify({ ...input, purchaseToken: 'bad\nprivate' }, intent, account));
console.log('PASS mobile receipt verification: current store state, account/intent/SKU/app binding, quantities, refund/revocation, allowlisted sandbox, time bounds and private fixed Google transport.');
