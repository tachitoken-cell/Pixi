import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const origin = 'https://mossvale.world', provider = 'https://accounts.example';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/embedded-auth.ts', import.meta.url), 'utf8')).replace(/^export /gm, '');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const credentials = { token: 'access', refreshToken: 'refresh', idToken: 'identity' };
const complete = { type: 'mossvale:embedded-auth-complete', state: 'expected-state', ...credentials };
const ready = height => ({ type: 'mossvale:auth-frame', ready: true, layout: 'compact-v1', height });
const loginUrl = `${provider}/realms/mossvale/protocol/openid-connect/auth?state=expected-state`;
const forbidden = new Proxy({}, { get() { throw Error('Embedded credentials must never use browser storage'); } });

function browser(options = {}) {
  const listeners = new Set(), timers = new Map(), urls = [], requests = [];
  let timerId = 0, readyCount = 0, settlement;
  const frame = { contentWindow: {}, style: {}, removeAttribute(name) { assert.equal(name, 'src'); delete this.src; } };
  Object.defineProperty(frame, 'src', { configurable: true, get: () => urls.at(-1), set: value => urls.push(value) });
  const window = {
    addEventListener(type, listener) { assert.equal(type, 'message'); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'message'); listeners.delete(listener); },
  };
  const create = runInNewContext(`${source}\nembeddedAccountFlow`, {
    URL, location: { origin }, window, localStorage: forbidden, sessionStorage: forbidden,
    setTimeout(fn, ms) { assert.equal(ms, 15000); timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
  });
  const flow = create({ authServerUrl: provider, createLoginUrl(params) { requests.push(params); return options.url || Promise.resolve(loginUrl); } }, frame, () => readyCount++);
  const listener = [...listeners][0];
  flow.result.then(value => { settlement = { value }; }, error => { settlement = { error }; });
  return {
    flow, frame, urls, requests, listeners, timers,
    get settlement() { return settlement; }, get readyCount() { return readyCount; },
    send(data, event = {}) { listener({ data, origin, source: frame.contentWindow, ...event }); },
    assertClean() { assert.equal(listeners.size, 0); assert.equal(timers.size, 0); assert.equal(frame.src, undefined); },
  };
}

const happy = browser(); await tick();
assert.deepEqual(JSON.parse(JSON.stringify(happy.requests)), [{ redirectUri: `${origin}/auth-callback.html`, prompt: 'login' }], 'the visible form requires user sign-in, so moderation/deletion errors cannot silently rejoin');
assert.deepEqual(happy.urls, [loginUrl]);
for (const [data, event] of [
  [complete, { source: {} }], [complete, { source: null }], [complete, { origin: provider }],
  [complete, { origin: `${origin}.attacker.example` }], [{ ...complete, state: 'wrong-state' }, {}],
  [{ ...complete, state: undefined }, {}], [{ ...complete, type: 'other' }, {}],
  [null, {}], ['text', {}], [[], {}],
  ...Object.keys(credentials).flatMap(key => ['', null, 1, {}, 'x'.repeat(65536)].map(value => [{ ...complete, [key]: value }, {}])),
]) {
  happy.send(data, event); await tick(); assert.equal(happy.settlement, undefined, 'untrusted or malformed messages cannot authorize a session');
}
happy.send(ready(300), { origin: `${provider}.attacker.example` });
happy.send(ready(300), { origin: provider, source: {} });
happy.send({ ...ready(300), ready: 'true' }, { origin: provider });
assert.equal(happy.readyCount, 0); assert.equal(happy.timers.size, 1);
const deadline = [...happy.timers][0];
for (const layout of [undefined, 'compact-v0', 'full-page', true, {}]) {
  happy.send({ ...ready(700), layout }, { origin: provider });
  assert.equal(happy.readyCount, 0, 'legacy/unverified layout readiness must never reveal a scenic provider page');
  assert.deepEqual([...happy.timers][0], deadline, 'unverified readiness preserves the original fallback deadline');
  assert.equal(happy.frame.style.height, undefined);
}
for (const [height, expected] of [[1, '240px'], [431.2, '432px'], [4000, '1100px'], [NaN, '1100px'], [Infinity, '1100px'], ['500', '1100px']]) {
  happy.send(ready(height), { origin: provider }); assert.equal(happy.frame.style.height, expected);
}
assert.equal(happy.readyCount, 6); assert.equal(happy.timers.size, 0, 'a loaded form allows time for recovery or MFA');
happy.send(complete); const result = await happy.flow.result;
assert.deepEqual({ ...result }, credentials); happy.assertClean();
happy.flow.cancel(); happy.send({ ...complete, token: 'late-access' }); happy.send(ready(250), { origin: provider });
assert.equal(happy.readyCount, 6); assert.equal(result.token, 'access'); happy.assertClean();

const legacy = browser(); await tick();
legacy.send({ type: 'mossvale:auth-frame', ready: true, height: 900 }, { origin: provider });
assert.equal(legacy.readyCount, 0); assert.equal(legacy.timers.size, 1);
const rejectedLegacy = assert.rejects(legacy.flow.result, /Open sign-in page/);
[...legacy.timers.values()][0](); await rejectedLegacy; legacy.assertClean();
legacy.send(ready(400), { origin: provider });
assert.equal(legacy.readyCount, 0, 'late compact readiness cannot revive a timed-out legacy form');

for (const action of ['cancel', 'timeout', 'provider-error']) {
  const run = browser(); await tick();
  const rejected = assert.rejects(run.flow.result, /Open sign-in page/);
  if (action === 'cancel') run.flow.cancel();
  if (action === 'timeout') [...run.timers.values()][0]();
  if (action === 'provider-error') {
    run.send({ type: 'mossvale:embedded-auth-error', state: 'wrong-state' });
    run.send({ type: 'mossvale:embedded-auth-error', state: 'expected-state' }, { origin: provider });
    assert.equal(run.listeners.size, 1);
    run.send({ type: 'mossvale:embedded-auth-error', state: 'expected-state' });
  }
  await rejected; run.assertClean();
  run.send(complete); run.send(ready(300), { origin: provider }); run.flow.cancel(); await tick();
  assert(run.settlement.error); assert.equal(run.readyCount, 0); run.assertClean();
}
for (const url of ['not-a-url', `${provider}/auth`, `https://untrusted.example/auth?state=expected-state`]) {
  const run = browser({ url: Promise.resolve(url) });
  await assert.rejects(run.flow.result, /Open sign-in page/); run.assertClean(); assert.equal(run.urls.length, 0);
}
for (const lateResult of ['resolve', 'reject']) {
  const pending = deferred(), run = browser({ url: pending.promise });
  const rejected = assert.rejects(run.flow.result, /Open sign-in page/);
  run.send(complete); assert.equal(run.settlement, undefined, 'callback cannot be accepted before the authorization state is known');
  run.flow.cancel(); await rejected;
  if (lateResult === 'resolve') pending.resolve(loginUrl); else pending.reject(Error('Provider failed'));
  await tick(); assert.equal(run.urls.length, 0); run.assertClean();
}
console.log('PASS embedded transport: source/origin/state correlation, verified compact layout, legacy-theme timeout, token shape, height bounds, cancellation/timeout/error cleanup, late messages/URLs, and no credential persistence.');

// A current bridge cannot reveal an old cached full-page stylesheet.
const themeSource = readFileSync(new URL('../auth-theme/mossvale/login/resources/js/embedded.js', import.meta.url), 'utf8');
function themeReady(marker, loading = false, height = 389.2) {
  const messages = [], listeners = new Map(), classes = new Set(), content = { getBoundingClientRect: () => ({ height }) };
  const html = { classList: { add: name => classes.add(name) } };
  runInNewContext(themeSource, {
    URL, location: { protocol: 'https:', hostname: 'accounts.example' },
    document: { currentScript: { src: `${provider}/resources/login/mossvale/js/embedded.js?parent=${encodeURIComponent(origin)}` }, documentElement: html,
      readyState: loading ? 'loading' : 'complete', querySelector: selector => selector === '.login-pf-page' ? content : null,
      addEventListener: (name, handler) => listeners.set(name, handler) },
    getComputedStyle(element) { assert.equal(element, html); return { getPropertyValue(name) { assert.equal(name, '--mossvale-embedded-layout'); return marker; } }; },
    window: { parent: { postMessage: (...message) => messages.push(message) }, addEventListener: (name, handler) => listeners.set(name, handler) },
    ResizeObserver: class { constructor(handler) { this.handler = handler; } observe(element) { assert.equal(element, content); } disconnect() {} },
  });
  return { messages, listeners, classes };
}
for (const marker of ['', 'compact-v0', 'full-page']) {
  const run = themeReady(marker); assert.equal(run.messages.length, 0, 'stale CSS cannot claim compact readiness');
  const waiting = themeReady(marker, true); waiting.listeners.get('DOMContentLoaded')(); assert.equal(waiting.messages.length, 0);
}
for (const height of [0, 389.2]) {
  const run = themeReady('compact-v1', true, height); assert.equal(run.messages.length, 0, 'readiness waits for the parsed form and stylesheet');
  run.listeners.get('DOMContentLoaded')();
  assert(run.classes.has('mossvale-embedded'));
  assert.deepEqual(JSON.parse(JSON.stringify(run.messages)), [[ready(Math.ceil(height)), origin]], 'loaded compact CSS certifies the layout even before a hidden frame has height');
}
assert.deepEqual(JSON.parse(JSON.stringify(themeReady(' compact-v1 ').messages)), [[ready(390), origin]], 'CSS serialization whitespace does not invalidate the compact contract');
console.log('PASS compact theme: missing/stale CSS cannot reveal the iframe; verified styles announce compact-v1 after DOM readiness, including zero-height frames.');

// Exercise session adoption with the shipped module and only the browser/provider boundaries mocked.
const authSource = stripTypeScriptTypes(readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '')).replace(/^export /gm, '');
async function account(options = {}) {
  const adapters = [], markers = new Map(), billing = [];
  const initialRefresh = deferred(), nextInit = deferred(), messages = deferred();
  class Keycloak {
    constructor(config) { Object.assign(this, { authServerUrl: config.url, realm: config.realm, clientId: config.clientId }); adapters.push(this); }
    async init(config) {
      if (adapters[0] !== this && options.holdInit) await nextInit.promise;
      this.authenticated = true; this.token = adapters[0] === this ? 'old-token' : 'new-token'; return true;
    }
    async updateToken() { if (adapters[0] === this) await initialRefresh.promise; this.token = adapters[0] === this ? 'old-refreshed' : 'new-refreshed'; }
    clearToken() { this.authenticated = false; this.token = undefined; this.onAuthLogout?.(); }
  }
  const storage = { getItem: key => markers.get(key), setItem: (key, value) => markers.set(key, value), removeItem: key => markers.delete(key) };
  const auth = runInNewContext(`${authSource}\n({initAuth, signInInsideGame, getAccessToken, refreshSessionAccessToken, clearSession})`, {
    Keycloak, URL, AbortSignal, location: { origin }, localStorage: storage, sessionStorage: storage,
    configureHosting() {}, requireNativeAppUpdate() {}, authorizeNativeBilling(token) { billing.push(token); }, nativeAccountSession() {},
    fetch: async () => ({ ok: true, json: async () => ({ keycloak: { url: provider, realm: 'mossvale', clientId: 'game' } }) }),
    embeddedAccountFlow: () => ({ result: messages.promise, cancel() { messages.reject(Error('cancelled')); } }),
  });
  assert.equal(await auth.initAuth(), 'account');
  return { auth, adapters, markers, billing, initialRefresh, nextInit, messages };
}
for (const method of ['getAccessToken', 'refreshSessionAccessToken']) {
  const run = await account();
  const stale = run.auth[method]().then(value => ({ value }), error => ({ error }));
  const signIn = run.auth.signInInsideGame({}, () => {});
  run.messages.resolve(credentials); assert.equal(await signIn.result, true);
  const next = run.adapters[1];
  assert.equal(run.adapters[0].authenticated, false); assert.equal(next.authenticated, true);
  run.initialRefresh.resolve(); const settled = await stale;
  assert.equal(settled.value, undefined, 'an earlier request cannot return authority for a different sign-in');
  if (method === 'getAccessToken') assert(settled.error);
  assert.equal(next.authenticated, true, 'stale refresh cannot clear the adopted session');
  assert.equal(next.token, 'new-token'); assert.equal(run.billing.at(-1), 'new-token');
  assert.deepEqual([...run.markers], [['mossvale-signed-in', '1']], 'only a non-secret sign-in preference persists');
  assert.equal(await run.auth.getAccessToken(), 'new-refreshed');
}
for (const action of ['cancel', 'clearSession']) {
  const run = await account({ holdInit: true });
  const signIn = run.auth.signInInsideGame({}, () => {});
  run.messages.resolve(credentials); await tick();
  if (action === 'cancel') signIn.cancel(); else run.auth.clearSession();
  run.nextInit.resolve(); assert.equal(await signIn.result, false);
  assert.equal(run.adapters[1].authenticated, false, 'abandoned provider initialization cannot gain authority');
  assert.equal(run.adapters[0].authenticated, action === 'cancel');
  assert.equal(run.billing.at(-1), action === 'cancel' ? 'old-token' : null);
}
console.log('PASS embedded adoption: refresh races preserve the new account, abandoned initialization cannot authorize, and browser storage contains only the session preference.');
