import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/embedded-auth.ts', import.meta.url), 'utf8')).replace(/^export /gm, '');
const origin = 'https://mossvale.world', authOrigin = 'https://accounts.example', state = 'expected-popup-state';
const loginUrl = `${authOrigin}/realms/mossvale/protocol/openid-connect/auth?state=${state}`;
const credentials = { token: 'access', refreshToken: 'refresh', idToken: 'identity' };
const ready = { type: 'mossvale:auth-ready', state }, complete = { type: 'mossvale:embedded-auth-complete', state, ...credentials };
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const forbidden = new Proxy({}, { get() { assert.fail('Popup transport must never persist credentials or navigate the game page'); } });

function browser(options = {}) {
  const opens = [], requests = [], channels = [], navigations = [], timers = new Map(), events = [];
  let timerId = 0, settlement, closeCount = 0;
  const popup = {
    opener: {},
    get closed() { assert.fail('COOP can sever WindowProxy; closed is not a reliable login result'); },
    close() { closeCount++; events.push('popup-close'); if (options.closeError) throw Error('COOP severed window'); },
    focus() {},
    location: { replace(url) {
      assert.equal(popup.opener, null, 'provider navigation must have no opener');
      assert.equal(channels.length, 1, 'channel must exist before the popup navigates');
      assert.equal(typeof channels[0].onmessage, 'function', 'callback handshake listener must exist before navigation');
      navigations.push(url); events.push('navigate');
    } },
  };
  class BroadcastChannel {
    constructor(name) { if (options.channelError) throw Error('Channel unavailable'); this.name = name; this.messages = []; this.closed = false; channels.push(this); }
    postMessage(data) { assert(!this.closed); this.messages.push(structuredClone(data)); events.push(data.type); }
    close() { this.closed = true; events.push('channel-close'); }
  }
  const runtime = {
    URL, Error, location: { origin, assign: forbidden, replace: forbidden }, localStorage: forbidden, sessionStorage: forbidden,
    window: { open(...args) { opens.push(args); if (options.openError) throw Error('Popup unavailable'); return options.blocked ? null : popup; } },
    setTimeout(fn, ms) { assert.equal(ms, 600000); timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
  };
  if (!options.noChannel) runtime.BroadcastChannel = BroadcastChannel;
  const create = runInNewContext(`${source}\npopupAccountFlow`, runtime);
  let flow;
  try {
    flow = create({ authServerUrl: authOrigin, createLoginUrl(params) {
      assert.equal(opens.length, 1, 'popup opens synchronously before the authorization URL promise');
      assert.equal(popup.opener, null); requests.push(params);
      if (options.urlError) return Promise.reject(Error('Provider URL failed'));
      return options.url || Promise.resolve(loginUrl);
    } }, options.provider || 'google');
  } catch (error) { flow = { result: Promise.reject(error), cancel() {} }; }
  flow.result.then(value => { settlement = { value }; }, error => { settlement = { error }; });
  return {
    flow, popup, opens, requests, channels, navigations, timers, events,
    get settlement() { return settlement; }, get closeCount() { return closeCount; },
    send(data, event = {}) { assert.equal(channels.length, 1); channels[0].onmessage?.({ data, origin, ...event }); },
    assertClean() { assert.equal(timers.size, 0); assert(channels.every(channel => channel.closed)); if (opens.length && !options.blocked && !options.openError) assert(closeCount > 0); },
  };
}

for (const provider of ['google', 'apple', 'mossvale-wallet']) {
  const run = browser({ provider });
  assert.deepEqual(run.opens, [['about:blank', '_blank']], 'sign-in must use a normal tab so wallet extension side panels are supported');
  assert.equal(run.popup.opener, null);
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(run.requests)), [{ redirectUri: `${origin}/auth-callback.html`, idpHint: provider, prompt: 'login' }]);
  assert.deepEqual(run.navigations, [loginUrl]); assert.equal(run.channels[0].name, `mossvale-auth:${state}`);
  run.send(ready); assert.deepEqual(run.channels[0].messages, [{ type: 'mossvale:auth-accept', state }]);
  run.send(complete); assert.deepEqual({ ...await run.flow.result }, credentials);
  assert.deepEqual(run.channels[0].messages.at(-1), { type: 'mossvale:auth-received', state });
  assert(run.events.indexOf('mossvale:auth-received') < run.events.indexOf('channel-close'), 'acknowledge credentials before closing the callback channel');
  run.assertClean(); const messageCount = run.channels[0].messages.length;
  run.flow.cancel(); run.send(ready); run.send({ ...complete, token: 'late-token' }); await tick();
  assert.equal(run.channels[0].messages.length, messageCount); assert.equal(run.settlement.value.token, 'access'); run.assertClean();
}

const guarded = browser(); await tick();
for (const foreign of [authOrigin, `${origin}.attacker.example`, 'null', undefined]) {
  guarded.send(ready, { origin: foreign }); guarded.send(complete, { origin: foreign }); await tick();
  assert.equal(guarded.settlement, undefined); assert.equal(guarded.channels[0].messages.length, 0, 'foreign-origin messages cannot join the handshake');
}
for (const data of [null, 'text', [], { ...ready, state: 'wrong-state' }, { ...ready, state: undefined },
  { ...complete, state: 'wrong-state' }, { ...complete, state: undefined }, { ...complete, type: 'other' },
  { type: 'mossvale:embedded-auth-error', state: 'wrong-state' },
  ...Object.keys(credentials).flatMap(key => ['', null, 1, {}, 'x'.repeat(65536)].map(value => ({ ...complete, [key]: value })))]) {
  guarded.send(data); await tick(); assert.equal(guarded.settlement, undefined, 'unmatched state or malformed credentials cannot finish sign-in');
  assert.equal(guarded.channels[0].messages.length, 0, 'invalid callback messages receive no acknowledgment');
}
guarded.send(ready); guarded.send(complete); await guarded.flow.result; guarded.assertClean();

for (const options of [{ blocked: true }, { openError: true }, { noChannel: true }, { channelError: true }, { urlError: true }]) {
  const run = browser(options); await assert.rejects(run.flow.result, /sign-in|window|popup|browser|channel/i);
  assert.equal(run.navigations.length, 0, 'unavailable popup/channel cannot navigate to the provider or redirect the game');
  run.assertClean();
}
for (const url of ['not-a-url', `${authOrigin}/auth`, `${authOrigin}/auth?state=${'x'.repeat(2049)}`,
  `${authOrigin}/auth?state=${state}#unexpected`, `https://untrusted.example/auth?state=${state}`, `https://user:password@accounts.example/auth?state=${state}`]) {
  const run = browser({ url: Promise.resolve(url) });
  await assert.rejects(run.flow.result); assert.equal(run.navigations.length, 0); run.assertClean();
}
for (const action of ['cancel', 'timeout', 'provider-error']) {
  const run = browser(); await tick();
  const rejected = assert.rejects(run.flow.result, /sign-in|cancel|time|window|provider/i);
  if (action === 'cancel') run.flow.cancel();
  else if (action === 'timeout') [...run.timers.values()][0]();
  else run.send({ type: 'mossvale:embedded-auth-error', state });
  await rejected; run.assertClean(); const messageCount = run.channels[0].messages.length;
  run.send(ready); run.send(complete); await tick();
  assert(run.settlement.error); assert.equal(run.channels[0].messages.length, messageCount); run.assertClean();
}
for (const lateResult of ['resolve', 'reject']) {
  const pending = deferred(), run = browser({ url: pending.promise });
  const rejected = assert.rejects(run.flow.result); run.flow.cancel(); await rejected;
  if (lateResult === 'resolve') pending.resolve(loginUrl); else pending.reject(Error('Late provider failure'));
  await tick(); assert.equal(run.navigations.length, 0); assert.equal(run.channels.length, 0); run.assertClean();
}
const severed = browser({ closeError: true }); await tick(); severed.send(ready); severed.send(complete);
assert.deepEqual({ ...await severed.flow.result }, credentials, 'COOP popup closure cannot discard a valid callback'); severed.assertClean();
console.log('PASS popup auth: synchronous isolated popup, exact callback/provider, private state channel handshake, state/token/URL guards, blocked/unavailable cases, timeout/cancel/late-response cleanup, COOP resilience and no credential storage.');

// Provider availability and session adoption run through the shipped auth module.
const authSource = stripTypeScriptTypes(readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '')).replace(/^export /gm, '');
const realm = { url: authOrigin, realm: 'mossvale', clientId: 'game' };
async function account(options = {}) {
  const adapters = [], inits = [], popups = [], markers = new Map(), billing = [], messages = deferred(), nextInit = deferred();
  class Keycloak {
    constructor(config) { Object.assign(this, { authServerUrl: config.url, realm: config.realm, clientId: config.clientId }); adapters.push(this); }
    async init(config) {
      inits.push(config); if (config.token && options.holdInit) await nextInit.promise;
      this.authenticated = !!config.token; this.token = this.authenticated ? 'validated-token' : undefined; return this.authenticated;
    }
    async updateToken() {}
    clearToken() { this.authenticated = false; this.token = undefined; this.onAuthLogout?.(); }
  }
  const storage = { getItem: key => markers.get(key), setItem: (key, value) => markers.set(key, value), removeItem: key => markers.delete(key) };
  const config = { keycloak: realm, walletBroker: { enabled: true, provider: 'mossvale-wallet' }, socialProviders: { google: 'google', apple: 'apple' }, ...options.config };
  const auth = runInNewContext(`${authSource}\n({initAuth, signInWithProviderInsideGame, getAccessToken, clearSession})`, {
    Keycloak, URL, AbortSignal, Error, location: { origin }, localStorage: storage, sessionStorage: storage,
    __MOSSVALE_NATIVE__: options.native === 'old', __MOSSVALE_NATIVE_AUTH__: options.native === 'auth',
    configureHosting() {}, requireNativeAppUpdate() {}, authorizeNativeBilling(token) { billing.push(token); }, nativeAccountSession() {},
    fetch: async () => ({ ok: true, json: async () => config }),
    popupAccountFlow(client, hint) { popups.push([client, hint]); return { result: messages.promise, cancel() { messages.reject(Error('cancelled')); } }; },
  });
  await auth.initAuth(); return { auth, adapters, inits, popups, markers, billing, messages, nextInit };
}
for (const [provider, hint] of [['google', 'google'], ['apple', 'apple'], ['wallet', 'mossvale-wallet']]) {
  const run = await account(), flow = run.auth.signInWithProviderInsideGame(provider);
  assert.equal(run.popups.length, 1); assert.equal(run.popups[0][0], run.adapters[0]); assert.equal(run.popups[0][1], hint);
  run.messages.resolve(credentials); assert.equal(await flow.result, true);
  assert.deepEqual(JSON.parse(JSON.stringify(run.inits[1])), { ...credentials, pkceMethod: 'S256', flow: 'standard', checkLoginIframe: false, redirectUri: origin });
  assert.equal(await run.auth.getAccessToken(), 'validated-token'); assert.equal(run.billing.at(-1), 'validated-token');
  assert.deepEqual([...run.markers], [['mossvale-signed-in', '1']], 'provider credentials remain in memory after adoption');
}
for (const options of [{ config: { walletBroker: null, socialProviders: {} } }, { native: 'old' }, { native: 'auth' }, { config: { keycloak: null } }]) {
  const run = await account(options);
  for (const provider of ['wallet', 'google', 'apple']) assert.throws(() => run.auth.signInWithProviderInsideGame(provider), /available|Mossvale app/);
  assert.equal(run.popups.length, 0, 'unavailable/native account methods never start popup authorization');
}
const unknown = await account();
for (const provider of ['other', '__proto__', '../google']) assert.throws(() => unknown.auth.signInWithProviderInsideGame(provider), /Unknown/);
assert.equal(unknown.popups.length, 0);
for (const action of ['cancel', 'clearSession']) {
  const run = await account({ holdInit: true }), flow = run.auth.signInWithProviderInsideGame('google');
  run.messages.resolve(credentials); await tick();
  if (action === 'cancel') flow.cancel(); else run.auth.clearSession();
  run.nextInit.resolve(); assert.equal(await flow.result, false); assert.equal(run.adapters[1].authenticated, false);
  assert.equal(run.markers.size, 0); assert.equal(run.billing.at(-1), null, 'abandoned provider validation never authorizes the game');
}
console.log('PASS provider sessions: configured provider mapping, disabled/unknown/native rejection, PKCE session adoption, cancellation during validation, and no persisted credentials.');
