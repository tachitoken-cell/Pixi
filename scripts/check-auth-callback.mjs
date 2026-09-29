import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/auth-callback.ts', import.meta.url), 'utf8').replace(/^import Keycloak.*\n/, ''));
const realm = { url: 'https://auth.example', realm: 'mossvale', clientId: 'mossvale-browser' };
async function callback(options = {}) {
  const status = { textContent: '' }, requests = [], messages = [], adapters = [], inits = [], channels = [], channelMessages = [], waits = [], timers = new Map();
  let timerId = 0, closed = 0;
  const location = { origin: 'https://mossvale.world', hostname: 'mossvale.world', hash: '#state=expected-state&code=one-use-code', ...options.location };
  const parent = { location: { origin: options.parentOrigin || location.origin }, postMessage: (...args) => messages.push(args) };
  if (options.crossOrigin) Object.defineProperty(parent, 'location', { get() { throw Error('Cross-origin access denied'); } });
  const window = { parent, close() { closed++; } }; if (options.standalone || options.popup) window.parent = window;
  Object.defineProperty(window, 'opener', { get() { throw Error('Popup callbacks must not depend on opener'); } });
  class BroadcastChannel {
    constructor(name) { if (options.channelError) throw Error('Unavailable'); this.name = name; this.closed = false; channels.push(this); }
    onmessage = null;
    postMessage(value) { channelMessages.push(JSON.parse(JSON.stringify(value))); }
    close() { this.closed = true; }
  }
  class Keycloak {
    constructor(config) { adapters.push(config); }
    async init(config) {
      inits.push(config); location.hash = '';
      if (options.initError) throw Error('private-provider-detail');
      this.authenticated = !options.unauthenticated;
      this.token = 'access'; this.refreshToken = options.missingRefresh ? undefined : 'refresh'; this.idToken = options.missingId ? undefined : 'id';
    }
  }
  runInNewContext(source, { window, location, document: { getElementById: () => status }, Keycloak, URL, URLSearchParams, AbortSignal,
    BroadcastChannel: options.popup || options.channelError ? BroadcastChannel : undefined,
    setTimeout: (fn, delay) => { waits.push(delay); timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, init) => {
      requests.push([url, init]); if (options.networkError) throw Error('private-network-detail');
      return { ok: !options.httpError, json: async () => ({ keycloak: options.realm === undefined ? realm : options.realm }) };
    },
  });
  const flush = () => new Promise(setImmediate);
  await flush();
  return { status, requests, channels, channelMessages, timers, waits, flush,
    get closed() { return closed; },
    get messages() { return JSON.parse(JSON.stringify(messages)); },
    get adapters() { return JSON.parse(JSON.stringify(adapters)); },
    get inits() { return JSON.parse(JSON.stringify(inits)); },
    async reply(type, state = 'expected-state', origin = location.origin) { channels[0]?.onmessage?.({ data: { type, state }, origin }); await flush(); },
    async expire() { for (const fn of [...timers.values()]) fn(); await flush(); },
  };
}

const success = await callback();
assert.deepEqual(success.adapters, [realm]);
assert.deepEqual(success.inits, [{ pkceMethod: 'S256', flow: 'standard', checkLoginIframe: false, redirectUri: 'https://mossvale.world/auth-callback.html' }]);
assert.deepEqual(success.messages, [[{ type: 'mossvale:embedded-auth-complete', token: 'access', refreshToken: 'refresh', idToken: 'id', state: 'expected-state' }, 'https://mossvale.world']]);
assert.equal(success.requests[0][0], '/api/config'); assert.equal(success.requests[0][1].cache, 'no-store'); assert.equal(success.requests[0][1].redirect, 'error'); assert(success.requests[0][1].signal);
for (const options of [{ standalone: true }, { crossOrigin: true }, { parentOrigin: 'https://untrusted.example' }]) {
  const result = await callback(options);
  assert.equal(result.requests.length, 0); assert.equal(result.adapters.length, 0); assert.equal(result.messages.length, 0);
  assert.match(result.status.textContent, /Return to Mossvale/);
}
for (const options of [{ initError: true }, { unauthenticated: true }, { missingRefresh: true }, { missingId: true }, { networkError: true }, { httpError: true },
  ...[null, {}, { ...realm, clientId: '' }, { ...realm, url: 'javascript:alert(1)' }, { ...realm, url: 'https://user:password@auth.example' },
    { ...realm, url: 'https://auth.example?unexpected' }, { ...realm, url: 'https://auth.example#unexpected' }, { ...realm, url: 'http://auth.example' }].map(realm => ({ realm }))]) {
  const result = await callback(options);
  assert.deepEqual(result.messages, [[{ type: 'mossvale:embedded-auth-error', state: 'expected-state' }, 'https://mossvale.world']]);
  assert(!result.status.textContent.includes('private'));
  if (options.realm !== undefined) assert.equal(result.adapters.length, 0);
}
const missingState = await callback({ location: { hash: '#code=one-use-code' } });
assert.equal(missingState.requests.length, 0); assert.deepEqual(missingState.messages[0][0], { type: 'mossvale:embedded-auth-error', state: '' });

for (const options of [{ popup: true }, { popup: true, channelError: true }, { popup: true, location: { hash: '#code=one-use-code' } }, { popup: true, location: { hash: '#state=' + 'a'.repeat(2049) } }]) {
  const result = await callback(options);
  assert.equal(result.requests.length, 0); assert.equal(result.adapters.length, 0, 'unpaired popup cannot consume PKCE state');
  if (result.channels.length) {
    assert.deepEqual(result.waits, [600000], 'pairing allows the suspended game tab to return within the original attempt deadline');
    assert.match(result.status.textContent, /Return to your game tab to finish signing in/);
    assert.equal(result.channels[0].name, 'mossvale-auth:expected-state');
    assert.deepEqual(result.channelMessages, [{ type: 'mossvale:auth-ready', state: 'expected-state' }]);
    await result.reply('mossvale:auth-accept', 'wrong-state');
    await result.reply('mossvale:auth-accept', 'expected-state', 'https://untrusted.example');
    await result.reply('mossvale:auth-received');
    assert.equal(result.requests.length, 0);
    await result.expire(); assert(result.channels[0].closed);
    await result.reply('mossvale:auth-accept'); assert.equal(result.requests.length, 0, 'expired pairing stays rejected');
  }
  assert.equal(result.closed, 0); assert.match(result.status.textContent, /Return to Mossvale/);
}
let popup = await callback({ popup: true });
await popup.reply('mossvale:auth-accept');
assert.deepEqual(popup.waits, [600000, 5000], 'receipt acknowledgement stays bounded to five seconds');
assert.equal(popup.requests.length, 1); assert.deepEqual(popup.inits, success.inits); assert.deepEqual(popup.adapters, success.adapters);
assert.deepEqual(popup.channelMessages[1], success.messages[0][0], 'popup transports the same validated result as the iframe');
assert.equal(popup.closed, 0); assert.equal(popup.channels[0].closed, false, 'tokens wait for receipt before closing');
await popup.reply('mossvale:auth-received', 'wrong-state');
await popup.reply('mossvale:auth-received', 'expected-state', 'https://untrusted.example');
assert.equal(popup.closed, 0); assert.equal(popup.channels[0].closed, false);
await popup.reply('mossvale:auth-received');
assert.equal(popup.closed, 1); assert(popup.channels[0].closed); assert.equal(popup.timers.size, 0);
popup = await callback({ popup: true }); await popup.reply('mossvale:auth-accept'); await popup.expire();
assert.equal(popup.closed, 0); assert(popup.channels[0].closed); assert.match(popup.status.textContent, /Return to Mossvale to check your sign-in/);
await popup.reply('mossvale:auth-received'); assert.equal(popup.closed, 0, 'late receipt cannot close an expired handoff');
popup = await callback({ popup: true, initError: true }); await popup.reply('mossvale:auth-accept');
assert.deepEqual(popup.channelMessages[1], { type: 'mossvale:embedded-auth-error', state: 'expected-state' });
assert(!popup.status.textContent.includes('private')); assert.equal(popup.closed, 0);
await popup.reply('mossvale:auth-received'); assert.equal(popup.closed, 1); assert(popup.channels[0].closed);
const silent = readFileSync(new URL('../public/silent-check-sso.html', import.meta.url), 'utf8');
const messages = [], location = { href: 'https://mossvale.world/silent-check-sso.html#state=expected-state&code=one-use-code', origin: 'https://mossvale.world' };
runInNewContext(silent.match(/<script>([\s\S]*?)<\/script>/)[1], { parent: { postMessage: (...args) => messages.push(args) }, location });
assert.deepEqual(messages, [[location.href, location.origin]]);
console.log('PASS auth callback: exact-origin iframe and paired popup transport, state/origin matching, bounded receipt acknowledgements, standard PKCE adapter, invalid configuration/incomplete results rejected and silent SSO relay.');
