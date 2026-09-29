import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

function load(file, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = createContext({ module, exports: module.exports, require: name => { assert(name in imports, name); return imports[name]; }, URL, AbortController, Set, Map, Error, Date, crypto: webcrypto, Uint8Array, setTimeout, clearTimeout });
  runInContext(source, context); return module.exports;
}
const api = load('./native-bridge.ts');
const origin = 'https://mossvale.world', game = origin + '/', login = `${origin}/wallet-login.html?transaction=${'a'.repeat(43)}`;
assert.match(api.randomDocumentId(), /^[a-f0-9]{32}$/);
assert.notEqual(api.randomDocumentId(), api.randomDocumentId());
for (const url of ['https://mossvale.world.evil.invalid/', 'https://asia.mossvale.world.evil.invalid/', 'https://asia.mossvale.world:8443/', 'http://asia.mossvale.world/', 'https://auth.example/', origin + '/wallet-oidc/authorize', login, 'https://user:pass@mossvale.world/', 'http://mossvale.world/', 'file:///index.html', 'about:blank']) assert.equal(api.trustedGamePage(url, origin, false), undefined, url);
assert(api.trustedGamePage('https://us.mossvale.world/', origin, false));
assert(api.trustedGamePage('https://asia.mossvale.world/', origin, false));
assert.equal(api.trustedGamePage('https://evil.invalid/', 'https://evil.invalid/', false), undefined);
assert(api.trustedGamePage('http://127.0.0.1:8080/', 'http://127.0.0.1:8080/', true));

let navigation = 0, generation = 0, calls = [], sent = [], resolvePending;
const bridge = api.createNativeBridge({ configuredUrl: origin, development: false, platform: 'apple', randomId: () => `document-${++generation}`, onNavigate: () => navigation++, send: script => sent.push(script), execute: request => { calls.push(request); return request.params.wait ? new Promise(resolve => { resolvePending = resolve; }) : Promise.resolve({ products: [] }); } });
const request = (n, method = 'billing.products', params = { productIds: [] }) => ({ v: 1, channel: 'mossvale-native', documentId: `document-${generation}`, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, method, params });
bridge.navigate(game);
await bridge.receive(JSON.stringify(request(1)), 'https://auth.example/'); assert.equal(calls.length, 0);
await bridge.receive(JSON.stringify({ ...request(1), documentId: 'forged' }), game); assert.equal(calls.length, 0);
await bridge.receive(JSON.stringify(request(1)), game); assert.equal(calls.length, 1);
await bridge.receive(JSON.stringify(request(1)), game); assert.equal(calls.length, 1, 'duplicate ID must not redispatch');
for (const [index, method] of ['eth_sendTransaction', 'wallet.accounts', 'wallet.connect', 'wallet.signChallenge'].entries()) {
  await bridge.receive(JSON.stringify(request(index + 2, method)), game); assert.equal(calls.length, 1); assert(sent.at(-1).includes('4200'));
}
const pending = bridge.receive(JSON.stringify(request(6, 'billing.products', { wait: true })), game); await Promise.resolve(); const oldRequest = calls.at(-1), oldCount = sent.length;
bridge.navigate('https://auth.example/'); assert(oldRequest.signal.aborted); resolvePending({ products: [] }); await pending; assert.equal(sent.length, oldCount, 'navigation must discard old result');
assert.equal(bridge.script(), 'true;'); assert.equal(navigation, 2);
bridge.navigate(login); assert.equal(bridge.script(), 'true;', 'wallet browser sign-in gets no native capability');
bridge.navigate(game);

const posts = [], browser = { location: new URL(game), top: undefined, ReactNativeWebView: { postMessage: data => posts.push(JSON.parse(data)) }, dispatchEvent() {} };
browser.top = browser;
const context = createContext({ window: browser, location: browser.location, URL, crypto: webcrypto, Uint8Array, Event: class {}, setTimeout, clearTimeout, Error });
runInContext(bridge.script(), context);
assert.equal(browser.mossvaleNative.platform, 'apple');
assert.equal(browser.mossvaleNative.treasureWallet, true, 'web code can distinguish binaries with voucher wallet support');
assert.equal(browser.mossvaleNative.notifications, true, 'web code only offers push settings in capable mobile builds');
assert.equal(browser.ethereum, undefined, 'native store bridge must not impersonate a wallet');
const products = browser.mossvaleNative.request('billing.products', { productIds: [] });
assert.equal(posts.at(-1).method, 'billing.products');
browser.__mossvaleNativeReceive({ ...posts.at(-1), result: { products: [] } }); assert.deepEqual(await products, { products: [] });
for (const [index, method] of ['treasure.connect', 'treasure.sign', 'treasure.collect', 'notifications.authorize', 'notifications.status', 'notifications.configure', 'notifications.settings', 'notifications.prompt'].entries()) {
  const before = calls.length;
  await bridge.receive(JSON.stringify(request(10 + index, method, {})), game);
  assert.equal(calls.length, before + 1); assert.equal(calls.at(-1).method, method);
}
bridge.navigate(origin + '/wallet-action.html'); assert.equal(bridge.script(), 'true;', 'approval pages cannot acquire native game permissions');
bridge.navigate(game);
const events = [], unsubscribe = browser.mossvaleNative.subscribe(event => events.push(event));
const event = { type: 'billing', status: 'delivered' };
browser.__mossvaleNativeReceive({ ...posts.at(-1), event }); assert.deepEqual(events, [event]);
unsubscribe(); browser.__mossvaleNativeReceive({ ...posts.at(-1), event }); assert.equal(events.length, 1);
const frame = { top: {} }; const frameContext = createContext({ window: frame }); runInContext(bridge.script(), frameContext); assert.equal(frame.mossvaleNative, undefined, 'a subframe never receives the native capability');

let verifier, billingEvent, billingCalls = [], receivedFetch, fetchResolve, billingStartError, billingPurchaseError;
const authCalls = [];
const sku = 'world.mossvale.game.store_embermane';
const servicesApi = load('./native-services.ts', {
  './native-bridge': api,
  './auth-session': { createAuthSessionService: () => ({ execute: async request => { authCalls.push(request); return { auth: request.method }; } }) },
  './billing': { BILLING_PRODUCT_IDS: [sku], createNativeBilling: options => {
    verifier = options.verifyPurchase;
    billingEvent = options.onEvent;
    return { start: async () => { if (billingStartError) throw billingStartError; }, stop: async () => {}, retryPending: async () => billingCalls.push('retry'), restore: async () => billingCalls.push('restore'), getProducts: async ids => ids, purchase: async args => { billingCalls.push(args); if (billingPurchaseError) throw billingPurchaseError; } };
  } },
});
const services = servicesApi.createNativeServices({ onEvent() {}, request: async (url, options) => { receivedFetch = { url, options }; return { ok: true, json: async () => ({ delivered: true }) }; } });
const execute = (method, params) => services.execute({ method, params, signal: new AbortController().signal, url: new URL(origin) });
for (const method of ['auth.restore', 'auth.save', 'auth.clear']) assert.deepEqual(await execute(method, {}), { auth: method });
services.clear();
assert.throws(() => services.accessToken(origin), error => error.code === 4100);
assert.equal(authCalls.length, 3, 'navigation billing cleanup must not delete the durable sign-in');
await assert.rejects(verifier({ platform: 'apple', intentId: 'intent', productId: sku }), error => error.code === 4100);
await execute('billing.authorize', { accessToken: 'header.payload.signature' }); assert(billingCalls.includes('retry'));
assert.equal(services.accessToken(origin), 'header.payload.signature');
assert.throws(() => services.accessToken('https://us.mossvale.world'), error => error.code === 4100, 'voucher authorization cannot cross realm origins');
await verifier({ platform: 'apple', intentId: 'intent', productId: sku, transactionId: '123' });
assert.equal(receivedFetch.url, origin + '/api/mobile-purchases/verify'); assert.equal(receivedFetch.options.headers.Authorization, 'Bearer header.payload.signature');
assert.equal(receivedFetch.options.redirect, 'error', 'receipt authorization cannot follow an endpoint redirect');
assert.deepEqual(JSON.parse(receivedFetch.options.body), { platform: 'apple', intentId: 'intent', productId: sku, transactionId: '123' });
await assert.rejects(execute('billing.products', { productIds: ['unapproved'] }));
const purchaseParams = { intentId: '11111111-1111-4111-8111-111111111111', productId: sku, accessToken: 'header.payload.signature' };
await assert.rejects(execute('billing.purchase', { ...purchaseParams, accessToken: null }), error => error.code === 4201);
billingStartError = Error('Synthetic store startup failure'); const beforeDispatch = billingCalls.length;
await assert.rejects(execute('billing.purchase', purchaseParams), error => error.code === 4201); assert.equal(billingCalls.length, beforeDispatch, 'definitely-not-started applies only before purchase dispatch');
billingStartError = undefined; billingPurchaseError = Error('Synthetic uncertain dispatched purchase');
await assert.rejects(execute('billing.purchase', purchaseParams), error => error === billingPurchaseError && error.code !== 4201);
billingPurchaseError = undefined;
await execute('billing.authorize', { accessToken: null }); await assert.rejects(verifier({}), error => error.code === 4100);
assert.throws(() => services.accessToken(origin), error => error.code === 4100, 'logout removes voucher authorization');
const changing = servicesApi.createNativeServices({ onEvent() {}, request: async (_url, options) => { receivedFetch = { options }; return new Promise(resolve => { fetchResolve = resolve; }); } });
await changing.execute({ method: 'billing.authorize', params: { accessToken: 'header.payload.signature' }, signal: new AbortController().signal, url: new URL(origin) });
const checking = verifier({ platform: 'google', intentId: 'intent', productId: sku, purchaseToken: 'synthetic-token' }); await Promise.resolve(); changing.clear(); assert(receivedFetch.options.signal.aborted); fetchResolve({ ok: true, json: async () => ({ delivered: true }) }); await assert.rejects(checking);
await changing.execute({ method: 'billing.authorize', params: { accessToken: 'header.accountA.signature' }, signal: new AbortController().signal, url: new URL(origin) });
const switched = verifier({ platform: 'google', intentId: 'intent', productId: sku, purchaseToken: 'synthetic-token' });
await Promise.resolve();
await changing.execute({ method: 'billing.authorize', params: { accessToken: 'header.accountB.signature' }, signal: new AbortController().signal, url: new URL(origin) });
assert(receivedFetch.options.signal.aborted, 'changing account or token invalidates old payment verification');
fetchResolve({ ok: true, json: async () => ({ delivered: true }) }); await assert.rejects(switched);
const refundedService = servicesApi.createNativeServices({ onEvent() {}, request: async () => ({ status: 409, ok: false, json: async () => ({ delivered: false, refunded: true, code: 'PURCHASE_REFUNDED' }) }) });
await refundedService.execute({ method: 'billing.authorize', params: { accessToken: 'header.payload.signature' }, signal: new AbortController().signal, url: new URL(origin) });
assert.deepEqual(JSON.parse(JSON.stringify(await verifier({ platform: 'apple', intentId: 'intent', productId: sku, transactionId: '123' }))), { refunded: true });
const dismissedEvents = [];
const dismissedService = servicesApi.createNativeServices({ onEvent: event => dismissedEvents.push(event), request: async (url, options) => { receivedFetch = { url, options }; return { ok: true }; } });
await dismissedService.execute({ method: 'billing.authorize', params: { accessToken: 'header.payload.signature' }, signal: new AbortController().signal, url: new URL(origin) });
billingEvent({ status: 'cancelled', intentId: purchaseParams.intentId, productId: sku });
for (let i = 0; i < 8; i++) await Promise.resolve();
assert.equal(receivedFetch.url, origin + '/api/mobile-purchases/abandon');
assert.deepEqual(JSON.parse(receivedFetch.options.body), { intentId: purchaseParams.intentId });
assert.equal(receivedFetch.options.headers.Authorization, 'Bearer header.payload.signature');
assert.equal(receivedFetch.options.redirect, 'error');
assert.equal(dismissedEvents.at(-1)?.status, 'cancelled');
for (const code of ['PURCHASE_RECOVERY_REQUIRED', 'UNTRUSTED_SERVER_CODE']) {
  const recovery = servicesApi.createNativeServices({ onEvent() {}, request: async () => ({ ok: false, json: async () => ({ code, error: 'Sensitive server internals must not escape.' }) }) });
  await recovery.execute({ method: 'billing.authorize', params: { accessToken: 'header.payload.signature' }, signal: new AbortController().signal, url: new URL(origin) });
  await assert.rejects(verifier({ platform: 'apple', intentId: 'intent', productId: sku, transactionId: '123' }), error => error.code === (code === 'PURCHASE_RECOVERY_REQUIRED' ? code : 4000) && !error.message.includes('Sensitive'));
}
console.log('PASS native bridge: trusted game documents, navigation cancellation, scoped treasury actions, generic wallet RPC rejected, billing and secure sign-in recovery.');
