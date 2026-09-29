import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { walletAuthorization, walletIdentity } from '../src/wallet-auth.ts';

const identity = { issuer: 'https://accounts.example/realms/mossvale', subject: 'game-account', clientId: 'mossvale-browser' };
const origin = 'https://mossvale.example', nonce = 'a'.repeat(64), redirect = `${origin}/auth-callback.html`;
const { privateKey, publicKey } = await generateKeyPair('RS256'), jwk = { ...await exportJWK(publicKey), kid: 'fixture', alg: 'RS256' };
const wrongKey = (await generateKeyPair('RS256')).privateKey;
const pause = () => new Promise(setImmediate);
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
async function waitFor(predicate, description) {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => realSetTimeout(resolve, 10));
  assert(predicate(), `Timed out waiting for ${description}`);
}
globalThis.location = { origin, hostname: 'mossvale.example' };
async function token(overrides = {}, badSignature = false) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: identity.issuer, sub: identity.subject, aud: identity.clientId, azp: identity.clientId, nonce, iat: now, exp: now + 300, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(badSignature ? wrongKey : privateKey);
}
async function fixture(options = {}) {
  const signed = await token(options.claims, options.badSignature), channels = [], navigations = [], posts = [], requests = [], deadlines = [], frames = [];
  let opened = 0, closed = 0;
  const popup = { opener: 'old', close() { closed++; }, location: { replace(url) { navigations.push(new URL(url)); } } };
  globalThis.window = Object.assign(new EventTarget(), { open(...args) {
    assert.deepEqual(args, ['about:blank', '_blank'], 'interactive wallet authorization must support extension side panels in a normal tab');
    opened++; return options.blocked ? null : popup;
  } });
  globalThis.document = { body: { append(frame) { frames.push(frame); } }, createElement(tag) {
    assert.equal(tag, 'iframe');
    return { contentWindow: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute() {},
      remove() { this.removed = true; }, set src(value) { navigations.push(new URL(value)); } };
  } };
  globalThis.BroadcastChannel = class {
    constructor(name) { this.name = name; channels.push(this); }
    onmessage = null;
    postMessage(value) { posts.push(value); }
    close() { this.closed = true; }
  };
  globalThis.setTimeout = (callback, delay, ...args) => { const id = realSetTimeout(callback, delay, ...args); if (delay === 120000 || delay === 15000) deadlines.push(callback); return id; };
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith('/certs')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    assert.equal(String(url), `${identity.issuer}/protocol/openid-connect/token`);
    if (options.exchangeFailure) return new Response('{}', { status: 400 });
    return new Response(JSON.stringify({ id_token: signed, access_token: 'unused-access-token', refresh_token: 'unused-refresh-token' }), { status: 200 });
  };
  const controller = new AbortController(); if (options.aborted) controller.abort();
  const result = walletAuthorization(identity, options.nonce ?? nonce, controller.signal, options.reserved ? popup : undefined, options.silent);
  void result.catch(() => {});
  assert.equal(opened, options.silent || options.reserved || options.aborted || options.nonce ? 0 : 1, 'only interactive authorization opens a popup synchronously before crypto awaits');
  if (!options.blocked && !options.aborted && !options.nonce) await waitFor(() => navigations.length > 0, 'wallet authorization navigation');
  function message(data = {}, messageOrigin = origin, channel = channels.at(-1)) {
    const state = navigations.at(-1)?.searchParams.get('state');
    assert(state && (options.silent || typeof channel?.onmessage === 'function'), 'wallet callback requires a ready authorization channel');
    if (options.silent) {
      const params = { state, iss: identity.issuer, code: 'one-use-code', ...data };
      frameMessage(`${origin}/silent-check-sso.html#${new URLSearchParams(Object.entries(params).filter(([, value]) => value != null))}`, messageOrigin);
    } else channel.onmessage({ origin: messageOrigin, data: { type: 'mossvale:wallet-auth-code', state, issuer: identity.issuer, code: 'one-use-code', ...data } });
  }
  function frameMessage(data, originValue = origin, source = frames[0]?.contentWindow) {
    window.dispatchEvent(Object.assign(new Event('message'), { data, origin: originValue, source }));
  }
  return { result, signed, popup, controller, channels, navigations, posts, requests, deadlines, frames, message, frameMessage, get opened() { return opened; }, get closed() { return closed; } };
}

try {
  const run = await fixture({ reserved: true }), target = run.navigations[0];
  assert.equal(run.opened, 0); assert.equal(run.popup.opener, null);
  assert.equal(target.origin + target.pathname, `${identity.issuer}/protocol/openid-connect/auth`);
  for (const [name, value] of Object.entries({ nonce, client_id: identity.clientId, redirect_uri: redirect, response_type: 'code', response_mode: 'fragment', prompt: 'none', scope: 'openid', code_challenge_method: 'S256' })) assert.equal(target.searchParams.get(name), value);
  run.message({ state: 'wrong' }); run.message({}, 'https://foreign.example'); await pause(); assert.equal(run.requests.length, 0);
  run.message(); const proof = await run.result;
  assert.deepEqual(proof, { idToken: run.signed, identity: walletIdentity(identity) });
  const exchange = run.requests.find(request => request.url.endsWith('/token')), body = exchange.init.body;
  assert.equal(body.get('code'), 'one-use-code'); assert.equal(body.get('client_id'), identity.clientId); assert.equal(body.get('redirect_uri'), redirect);
  assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), target.searchParams.get('code_challenge'));
  assert.equal(exchange.init.credentials, 'omit'); assert.equal(exchange.init.redirect, 'error'); assert.equal(exchange.init.cache, 'no-store');
  assert.equal(run.closed, 1); assert(run.channels.every(channel => channel.closed));
  assert(run.posts.every(post => !('idToken' in post) && !('token' in post) && !('refreshToken' in post)), 'the channel never carries credentials');

  for (const claims of [{ iss: 'https://wrong.example' }, { sub: 'different-account' }, { aud: 'different-client' }, { aud: [identity.clientId, 'another'] },
    { azp: 'different-client' }, { nonce: 'b'.repeat(64) }, { exp: 1 }, { iat: 1 }, { iat: Math.floor(Date.now() / 1000) + 120 }]) {
    const bad = await fixture({ claims }); bad.message(); await assert.rejects(bad.result, /did not match/); assert.equal(bad.closed, 1);
  }
  for (const options of [{ badSignature: true }, { exchangeFailure: true }]) { const bad = await fixture(options); bad.message(); await assert.rejects(bad.result, /did not match/); }
  const wrongIssuer = await fixture(); wrongIssuer.message({ issuer: 'https://wrong.example' }); await assert.rejects(wrongIssuer.result, /wrong account provider/); assert.equal(wrongIssuer.requests.length, 0);
  const fallback = await fixture(); const first = fallback.navigations[0];
  fallback.message({ code: null, error: 'login_required' });
  await waitFor(() => fallback.navigations.length === 2, 'interactive wallet authorization navigation');
  assert.equal(fallback.navigations[1].searchParams.get('prompt'), 'login');
  assert.notEqual(first.searchParams.get('state'), fallback.navigations[1].searchParams.get('state'));
  assert.notEqual(first.searchParams.get('code_challenge'), fallback.navigations[1].searchParams.get('code_challenge'));
  assert.equal(fallback.navigations[1].searchParams.get('nonce'), nonce);
  fallback.message(); await fallback.result; assert.equal(fallback.opened, 1, 'interactive fallback reuses the gesture-opened window');
  for (const options of [{ blocked: true }, { aborted: true }, { nonce: 'short' }]) { const bad = await fixture(options); await assert.rejects(bad.result); }
  const cancelled = await fixture(); cancelled.controller.abort(); await assert.rejects(cancelled.result, /cancelled/);
  const timedOut = await fixture(); timedOut.deadlines[0](); await assert.rejects(timedOut.result, /timed out/); timedOut.message(); assert.equal(timedOut.requests.length, 0);

  const silent = await fixture({ silent: true }), silentTarget = silent.navigations[0], frame = silent.frames[0];
  assert.equal(silent.opened, 0); assert.equal(silent.channels.length, 0); assert.equal(frame.hidden, true);
  assert.equal(silentTarget.searchParams.get('redirect_uri'), `${origin}/silent-check-sso.html`);
  assert.equal(silentTarget.searchParams.get('prompt'), 'none'); assert.equal(silentTarget.searchParams.get('nonce'), nonce);
  const callbackUrl = `${origin}/silent-check-sso.html#${new URLSearchParams({ state: silentTarget.searchParams.get('state'), iss: identity.issuer, code: 'one-use-code' })}`;
  silent.frameMessage(callbackUrl, origin, {}); silent.frameMessage(callbackUrl, 'https://foreign.example');
  silent.frameMessage(callbackUrl.replace('/silent-check-sso.html', '/auth-callback.html'));
  silent.frameMessage(`${callbackUrl}&state=duplicate`); silent.message({ state: 'wrong' });
  await pause(); assert.equal(silent.requests.length, 0, 'silent SSO requires the exact frame, origin, callback path and unique matching state');
  silent.message(); assert.deepEqual(await silent.result, { idToken: silent.signed, identity: walletIdentity(identity) });
  assert.equal(frame.removed, true); assert.equal(silent.closed, 0); assert.equal(silent.posts.length, 0);
  assert.equal(silent.requests.find(request => request.url.endsWith('/token')).init.body.get('redirect_uri'), `${origin}/silent-check-sso.html`);
  for (const error of ['login_required', 'interaction_required', 'consent_required', 'account_selection_required']) {
    const expired = await fixture({ silent: true }); expired.message({ code: null, error });
    await assert.rejects(expired.result, result => result.code === 'WALLET_SSO_INTERACTION_REQUIRED');
    assert.equal(expired.opened, 0); assert.equal(expired.navigations.length, 1); assert(expired.frames[0].removed);
  }
  const silentCancelled = await fixture({ silent: true }); silentCancelled.controller.abort(); await assert.rejects(silentCancelled.result, /cancelled/); assert(silentCancelled.frames[0].removed);
  const silentBlocked = await fixture({ silent: true }); silentBlocked.deadlines[0](); await assert.rejects(silentBlocked.result, error => error.code === 'WALLET_SSO_INTERACTION_REQUIRED'); assert(silentBlocked.frames[0].removed);
  const silentMismatch = await fixture({ silent: true, claims: { sub: 'another-account' } }); silentMismatch.message(); await assert.rejects(silentMismatch.result, /did not match/); assert(silentMismatch.frames[0].removed);

  const callbackSource = stripTypeScriptTypes(readFileSync(new URL('../src/auth-callback.ts', import.meta.url), 'utf8').replace(/^import Keycloak.*\n/, ''));
  const state = `mossvale-wallet:${crypto.randomUUID()}`, sent = [], channels = [], status = { textContent: '' }, cleared = [];
  const callbackWindow = {}; callbackWindow.parent = callbackWindow;
  runInNewContext(callbackSource, { URL, URLSearchParams, window: callbackWindow, location: { origin, pathname: '/auth-callback.html', hash: `#state=${state}&code=callback-code&iss=${encodeURIComponent(identity.issuer)}` },
    history: { replaceState: (...args) => cleared.push(args) }, document: { getElementById: () => status }, setTimeout: realSetTimeout, clearTimeout: realClearTimeout,
    BroadcastChannel: class { constructor(name) { this.name = name; channels.push(this); } postMessage(value) { sent.push(value); } close() { this.closed = true; } },
    Keycloak: class { constructor() { assert.fail('Wallet code callback must not adopt a game session'); } }, fetch: () => assert.fail('Only the parent can exchange the wallet authorization code'),
  });
  await pause(); assert.deepEqual(cleared, [[null, '', '/auth-callback.html']]);
  assert.equal(channels[0].name, `mossvale-wallet-auth:${state}`);
  channels[0].onmessage({ origin, data: { type: 'mossvale:wallet-auth-accept', state } }); await pause();
  assert.equal(sent[1].code, 'callback-code'); assert.equal(sent[1].issuer, identity.issuer); assert.equal(sent[1].type, 'mossvale:wallet-auth-code');
  channels[0].onmessage({ origin, data: { type: 'mossvale:wallet-auth-received', state } }); await pause(); assert(channels[0].closed);

  let adapter, complete;
  globalThis.window.addEventListener = () => {};
  globalThis.MockWalletKeycloak = class {
    constructor(config) { adapter = this; this.authServerUrl = config.url; this.realm = config.realm; this.clientId = config.clientId; }
    async init() { this.authenticated = true; this.token = 'game-access-token'; this.tokenParsed = { iss: identity.issuer, sub: identity.subject, azp: identity.clientId }; }
    clearToken() { this.authenticated = false; this.onAuthLogout?.(); }
  };
  const authorizations = [];
  globalThis.mockWalletAuthorization = (...args) => { authorizations.push(args); return new Promise(resolve => { complete = resolve; }); };
  globalThis.localStorage = globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ keycloak: { url: 'https://accounts.example', realm: 'mossvale', clientId: identity.clientId } }) });
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.includes('/src/auth.ts')) {
      if (specifier === 'keycloak-js') return { shortCircuit: true, url: 'data:text/javascript,export default globalThis.MockWalletKeycloak' };
      if (specifier === './wallet-auth.ts') return { shortCircuit: true, url: 'data:text/javascript,export const walletAuthorization=(...a)=>globalThis.mockWalletAuthorization(...a);export const walletIdentity=({issuer,subject,clientId})=>JSON.stringify([issuer,subject,clientId]);' };
    }
    return next(specifier, context);
  } });
  try {
    const auth = await import(`../src/auth.ts?wallet-check=${Date.now()}`);
    assert.throws(() => auth.getWalletIdentity()); await auth.initAuth(); assert.equal(auth.getWalletIdentity(), walletIdentity(identity));
    const proof = auth.authorizeWallet(nonce); assert.equal(authorizations.at(-1)[4], true, 'normal game wallet authorization uses silent SSO'); auth.clearSession(); complete({ idToken: 'unused', identity: walletIdentity(identity) });
    await assert.rejects(proof, /game account changed/);
    adapter.authenticated = true; adapter.token = 'new-access'; adapter.tokenParsed.sub = 'changed';
    const switched = auth.authorizeWallet(nonce); adapter.tokenParsed.sub = identity.subject; complete({ idToken: 'unused', identity: walletIdentity({ ...identity, subject: 'changed' }) });
    await assert.rejects(switched, /game account changed/);
    const reservedPopup = { close() {} };
    const interactive = auth.authorizeWallet(nonce, undefined, reservedPopup);
    assert.equal(authorizations.at(-1)[3], reservedPopup); assert.equal(authorizations.at(-1)[4], false, 'only explicit reconnect uses the reserved popup');
    complete({ idToken: 'bound-token', identity: walletIdentity(identity) }); await interactive;
  } finally { hooks.deregister(); }
  console.log('Wallet game SSO passed: custom nonce + S256 PKCE, same-origin code-only callback, signed exact account/audience/issuer/freshness validation, safe fallback, cancellation and account-generation fencing. No live provider calls.');
} finally { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; }
