import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./billing.ts', import.meta.url), 'utf8');
const exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
  { exports, require: name => name === 'expo-iap' ? {} : { Platform: { OS: 'android' } } });
const { createNativeBilling, BILLING_PRODUCT_IDS } = exports;
const productId = BILLING_PRODUCT_IDS[0];
const intentA = '00000000-0000-4000-8000-000000000001', intentB = '00000000-0000-4000-8000-000000000002';
const receipt = { id: 'GPA.test', productId, store: 'google', quantity: 1, purchaseState: 'purchased',
  obfuscatedAccountIdAndroid: intentA, purchaseToken: 'private-purchase-token', packageNameAndroid: 'world.mossvale.game' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = async () => { for (let count = 0; count < 30; count++) await Promise.resolve(); };
function fixture({ platform = 'android', verify = async () => ({ delivered: true }) } = {}) {
  const updates = new Set(), errors = new Set(), events = [], verified = [], finishes = [], requests = [];
  const state = { purchases: [], initializations: 0, closes: 0, queries: 0, pendingQueries: 0 };
  const sdk = {
    purchaseUpdatedListener(listener) { updates.add(listener); return { remove: () => updates.delete(listener) }; },
    purchaseErrorListener(listener) { errors.add(listener); return { remove: () => errors.delete(listener) }; },
    async initConnection() { assert.equal(updates.size, 1); assert.equal(errors.size, 1); state.initializations++; return true; },
    async endConnection() { state.closes++; },
    async fetchProducts({ skus, type }) {
      assert.equal(type, 'in-app'); state.queries++;
      return skus.map(id => ({ id, type: 'in-app', title: 'Embermane', description: 'Mount', displayPrice: '€39.99', currency: 'EUR', price: 39.99, debugDescription: 'do not forward SDK internals' }));
    },
    async requestPurchase(request) { requests.push(request); },
    async getAvailablePurchases() { return state.purchases; },
    async getPendingTransactionsIOS() { state.pendingQueries++; return state.purchases; },
    async finishTransaction(purchase) { finishes.push(purchase); },
  };
  const billing = createNativeBilling({ sdk, platform, onEvent: event => events.push(event), verifyPurchase: purchase => { verified.push(purchase); return verify(purchase); } });
  return { billing, sdk, state, updates, errors, events, verified, finishes, requests,
    async emit(purchase) { for (const listener of updates) listener(purchase); await tick(); } };
}

// Evaluate catalog constants without pulling the game's TS dependency graph into the native build.
const catalogExports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/ingame-store.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports: catalogExports, require: () => ({}) });
const { STORE_PRODUCTS, MOBILE_STORE_SKUS } = catalogExports;
const expectedSkus = [...STORE_PRODUCTS].map(product => MOBILE_STORE_SKUS[product.id]).filter(Boolean);
assert.deepEqual([...BILLING_PRODUCT_IDS].sort(), expectedSkus.sort(), 'native SKU allowlist matches mobile-eligible store products');
for (const platform of ['android', 'ios']) {
  const retired = fixture({ platform }), productId = MOBILE_STORE_SKUS.burned;
  await assert.rejects(retired.billing.getProducts([productId]), /Unknown store product/);
  await assert.rejects(retired.billing.purchase({ intentId: intentA, productId }), /valid Mossvale purchase intent/);
  assert.equal(retired.requests.length, 0, 'retired title cannot open native checkout');
  retired.state.purchases = [{ ...receipt, productId, ...(platform === 'ios' ? { store: 'apple', appAccountToken: intentA, transactionId: '2000001234567891' } : {}) }];
  await retired.billing.restore();
  assert.equal(retired.verified[0].productId, productId); assert.equal(retired.finishes.length, 1, 'retired title receipts still recover and finish');
  await retired.billing.stop();
}

const confirmation = deferred();
const first = fixture({ verify: () => confirmation.promise });
await Promise.all([first.billing.start(), first.billing.start()]);
assert.equal(first.state.initializations, 1, 'parallel starts share one listener connection');
const products = await first.billing.getProducts([productId, productId]);
assert.equal(products.length, 1); assert.equal(products[0].displayPrice, '€39.99'); assert.equal(products[0].debugDescription, undefined);
await assert.rejects(first.billing.getProducts(['unconfigured.product']), /Unknown store product/);
await first.billing.purchase({ intentId: intentA, productId });
assert.equal(first.requests[0].request.google.obfuscatedAccountId, intentA);
assert.equal(first.verified.length, 0, 'dispatching purchase UI never grants or verifies a reward');
await first.emit(receipt); await first.emit({ ...receipt });
assert.equal(first.verified.length, 1, 'concurrent duplicate callbacks share one verification');
assert.equal(first.finishes.length, 0, 'no store finalization before durable backend confirmation');
confirmation.resolve({ delivered: true }); await tick();
assert.equal(first.finishes.length, 1); assert.equal(first.finishes[0].isConsumable, true);
await first.emit(receipt); assert.equal(first.finishes.length, 1, 'finished replay cannot finalize twice');
assert.equal(first.events.filter(event => event.status === 'delivered').length, 1);
await first.billing.stop(); assert.equal(first.updates.size, 0); assert.equal(first.errors.size, 0);

let deliver = false;
const recovery = fixture({ verify: async () => { if (!deliver) throw Error('secret-access-token private-purchase-token'); return { delivered: true }; } });
await recovery.billing.start();
await recovery.billing.purchase({ intentId: intentA, productId });
const replay = { ...receipt, obfuscatedAccountIdAndroid: intentB, purchaseToken: 'replayed-token' };
await recovery.emit(replay);
assert.equal(recovery.verified[0].intentId, intentB, 'replay binding comes from receipt, never the most recent purchase request');
assert.equal(recovery.finishes.length, 0, 'failed verification leaves receipt unfinished');
assert(recovery.events.some(event => event.code === 'VERIFICATION_PENDING'));
assert(!JSON.stringify(recovery.events).includes('secret-access-token')); assert(!JSON.stringify(recovery.events).includes('replayed-token'));
deliver = true; recovery.state.purchases = [replay, replay];
await recovery.billing.retryPending(); assert.equal(recovery.finishes.length, 1, 'retry verifies and finalizes pending delivery exactly once');
const paidRecovery = fixture({ verify: async () => { throw Object.assign(Error('private-server-error'), { code: 'PURCHASE_RECOVERY_REQUIRED' }); } });
await paidRecovery.billing.start(); await paidRecovery.emit(receipt);
assert.equal(paidRecovery.finishes.length, 0, 'paid recovery is never consumed');
assert(paidRecovery.events.some(event => event.status === 'error' && event.code === 'PURCHASE_RECOVERY_REQUIRED'));
assert(!JSON.stringify(paidRecovery.events).includes('private-server-error'));
await paidRecovery.billing.stop();
const refunded = fixture({ verify: async () => ({ refunded: true }) });
await refunded.billing.start(); await refunded.emit(receipt);
assert.equal(refunded.finishes.length, 1, 'durably confirmed refunds can finish without granting a reward');
assert(refunded.events.some(event => event.status === 'refunded'));
assert(!refunded.events.some(event => event.status === 'delivered'));
await refunded.billing.stop();
const dismissed = fixture();
await dismissed.billing.purchase({ intentId: intentA, productId });
await assert.rejects(dismissed.billing.purchase({ intentId: intentB, productId }), /Finish the open/);
for (const error of dismissed.errors) error({ code: 'user-cancelled', productId });
assert(dismissed.events.some(event => event.status === 'cancelled' && event.intentId === intentA), 'native cancellation retains the exact checkout identity');
await dismissed.billing.purchase({ intentId: intentB, productId });
await dismissed.billing.stop();
const verifiedBefore = recovery.verified.length;
await recovery.emit({ ...receipt, purchaseState: 'pending' });
await recovery.emit({ ...receipt, obfuscatedAccountIdAndroid: null });
await recovery.emit({ ...receipt, quantity: 2 });
await recovery.emit({ ...receipt, store: 'amazon' });
assert.equal(recovery.verified.length, verifiedBefore, 'pending, unbound, multi-quantity and unrelated-store receipts cannot deliver');
await recovery.billing.stop();

const oldConfirmation = deferred(); let verifyCalls = 0;
const restart = fixture({ verify: () => ++verifyCalls === 1 ? oldConfirmation.promise : Promise.resolve({ delivered: true }) });
await restart.billing.start(); await restart.emit(receipt);
await restart.billing.stop(); await restart.billing.start(); restart.state.purchases = [receipt];
await restart.billing.restore(); assert.equal(restart.finishes.length, 1, 'a new lifecycle can recover a receipt while old verification is pending');
oldConfirmation.resolve({ delivered: true }); await tick();
assert.equal(restart.finishes.length, 1, 'stale lifecycle cannot finalize or publish twice');
await restart.billing.stop();

const closing = fixture(), closeOne = deferred(), closeTwo = deferred();
let closeCount = 0;
closing.sdk.endConnection = async () => { await (++closeCount === 1 ? closeOne.promise : closeTwo.promise); };
await closing.billing.start();
const stoppingOne = closing.billing.stop(), stoppingTwo = closing.billing.stop(), startingAgain = closing.billing.start();
await tick(); assert.equal(closeCount, 1, 'overlapping closes are serialized');
closeOne.resolve(); await stoppingOne; await tick(); assert.equal(closeCount, 2);
assert.equal(closing.state.initializations, 1, 'new connection waits for every old close');
closeTwo.resolve(); await stoppingTwo; await startingAgain;
assert.equal(closing.state.initializations, 2);
await closing.billing.stop();

const ios = fixture({ platform: 'ios' });
await ios.billing.purchase({ intentId: intentA, productId });
assert.equal(ios.requests[0].request.apple.appAccountToken, intentA);
assert.equal(ios.requests[0].request.apple.andDangerouslyFinishTransactionAutomatically, false);
ios.state.purchases = [{ ...receipt, store: 'apple', appAccountToken: intentB, appBundleIdIOS: 'world.mossvale.game', transactionId: '2000001234567890', purchaseToken: 'private-apple-jws' }];
await ios.billing.restore();
assert.equal(ios.state.pendingQueries, 1, 'consumable recovery uses unfinished StoreKit transactions');
assert.deepEqual(JSON.parse(JSON.stringify(ios.verified[0])), { platform: 'apple', intentId: intentB, productId, transactionId: '2000001234567890' });
assert.equal(ios.finishes.length, 1); assert(!JSON.stringify(ios.events).includes('private-apple-jws'));
await ios.billing.stop();

const unavailable = fixture();
unavailable.sdk.initConnection = async () => { throw Error('native-secret'); };
const failures = await Promise.allSettled([unavailable.billing.start(), unavailable.billing.start()]);
assert(failures.every(result => result.status === 'rejected' && !result.reason.message.includes('native-secret')));
assert.equal(unavailable.updates.size, 0); assert.equal(unavailable.errors.size, 0);
assert(!JSON.stringify(unavailable.events).includes('native-secret'));
unavailable.sdk.initConnection = async () => true;
await unavailable.billing.start(); await unavailable.billing.stop();
console.log('Native billing checks passed: duplicate/replayed receipts, binding, deferred verification, recovery, lifecycle cleanup and token-safe events.');
