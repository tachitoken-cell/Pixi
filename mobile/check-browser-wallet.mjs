import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { authCallback, nativeAuthLink, nativeAuthRedirect, startAuthRequest, walletBrowserUrl, walletBrowsers } from './navigation.ts';
const { cancelled, requireActive } = runInNewContext(stripTypeScriptTypes(readFileSync(new URL('./native-bridge.ts', import.meta.url), 'utf8').replace(/^export /gm, ''), { mode: 'transform' }) + ';({cancelled, requireActive})', { Error });

const settings = { issuer: 'https://identity.example/realms/mossvale', clientId: 'game', walletProvider: 'mossvale-wallet' };
const state = 'a'.repeat(32), authUrl = new URL(settings.issuer + '/protocol/openid-connect/auth');
authUrl.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: nativeAuthRedirect, state, nonce: 'b'.repeat(32), response_type: 'code', response_mode: 'fragment', scope: 'openid', code_challenge: 'c'.repeat(43), code_challenge_method: 'S256', kc_idp_hint: settings.walletProvider }).toString();
const request = startAuthRequest(authUrl.href, 'https://mossvale.world/', settings, 'https://mossvale.world/');
const callback = nativeAuthRedirect + '#' + new URLSearchParams({ code: 'synthetic-code', state, iss: settings.issuer });
const source = stripTypeScriptTypes(readFileSync(new URL('./browser-wallet.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '').replace('export async function', 'async function'));
function fixture() {
  const listeners = new Set(), foregroundListeners = new Set(), timers = new Map(), opened = [], selections = [], detected = [], posts = [];
  let select;
  let installed = true, failOpen = false, detection, respond, backgroundOnOpen = false;
  const context = { Error, Date, Promise, Object, URL, AbortController, nativeAuthLink, authCallback, walletBrowserUrl, walletBrowsers, cancelled, requireActive,
    setTimeout: (fn, ms) => { timers.set(fn, ms); return fn; }, clearTimeout: fn => timers.delete(fn),
    AppState: { currentState: 'active', addEventListener: (name, fn) => { assert.equal(name, 'change'); foregroundListeners.add(fn); return { remove: () => foregroundListeners.delete(fn) }; } },
    fetch: async (url, options) => {
      assert(['https://mossvale.world/wallet-oidc/mobile/start', 'https://mossvale.world/wallet-oidc/mobile/result'].includes(url));
      assert.equal(options.method, 'POST'); assert.equal(options.headers['Content-Type'], 'application/json');
      const call = { path: url.split('/').at(-1), body: JSON.parse(options.body), signal: options.signal }; posts.push(call);
      assert.equal(call.body.state, state); if (call.path === 'result') assert.equal(call.body.token, 't'.repeat(43));
      return respond ? respond(call) : { ok: true, status: 200, json: async () => call.path === 'start' ? { token: 't'.repeat(43) } : { callback: null } };
    },
    Linking: {
      addEventListener: (name, fn) => { assert.equal(name, 'url'); listeners.add(fn); return { remove: () => listeners.delete(fn) }; },
      canOpenURL: async url => { assert(walletBrowsers.some(wallet => wallet.id !== 'rabby' && wallet.scheme + '://' === url) || ['okxweb3://', 'okx://', 'rabbygo://go.rabby.io/mobile/'].includes(url)); detected.push(url); return detection ? detection : typeof installed === 'string' ? installed + '://' === url : installed; },
      openURL: async url => { assert.equal(listeners.size, 1, 'return listener is installed before opening the wallet'); opened.push(url); if (backgroundOnOpen) { context.AppState.currentState = 'background'; for (const fn of foregroundListeners) fn('background'); } if (failOpen) throw Error('Synthetic open failure'); },
    },
  };
  runInNewContext(source, context);
  return { ...context, listeners, foregroundListeners, timers, opened, selections, detected, posts,
    openWalletBrowser: (request, signal) => context.openWalletBrowser(request, signal, value => { select = value; selections.push(value); }),
    choose: id => { const current = select || selections.find(value => value); current(id); },
    get choosing() { return !!select; },
    send: url => { for (const listener of listeners) listener({ url }); },
    activate: state => { context.AppState.currentState = state; for (const fn of foregroundListeners) fn(state); },
    tick: ms => { for (const [fn, delay] of [...timers]) if (delay === ms) { timers.delete(fn); fn(); } },
    set respond(value) { respond = value; }, set backgroundOnOpen(value) { backgroundOnOpen = value; },
    set installed(value) { installed = value; }, set failOpen(value) { failOpen = value; }, set detection(value) { detection = value; },
  };
}
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
for (const { id, scheme } of walletBrowsers) {
  const f = fixture(), controller = new AbortController(), task = f.openWalletBrowser(request, controller.signal);
  assert.equal(f.selections.length, 1); assert(f.choosing); assert.equal(f.opened.length, 0, 'wallet opens only after a player chooses');
  f.choose(id); f.choose(id); await flush();
  assert.equal(f.opened.length, 1, 'double presses cannot launch multiple wallet flows');
  assert.equal(f.opened[0], walletBrowserUrl(id, request));
  assert.equal(f.detected[0], id === 'rabby' ? 'rabbygo://go.rabby.io/mobile/' : scheme + '://', `${id} checks its registered app route before opening`);
  assert.equal(f.choosing, false); assert.equal(f.listeners.size, 1, 'closing the chooser after selection must preserve the request');
  for (const bad of [callback.replace(state, 'wrong-state'), callback.replace('mossvale://auth/', 'mossvale://other/'), callback + '&access_token=forbidden', callback + '&state=' + state]) f.send(bad);
  assert.equal(f.listeners.size, 1, 'unrelated or malformed callbacks cannot finish the request');
  f.send(callback); assert.equal(await task, callback); assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0);
}
for (const host of ['mossvale.world', 'us.mossvale.world', 'asia.mossvale.world']) {
  const linkedUrl = new URL(authUrl); linkedUrl.searchParams.set('redirect_uri', nativeAuthLink);
  const linkedRequest = startAuthRequest(linkedUrl.href, `https://${host}/`, settings, 'https://mossvale.world/');
  const linkedCallback = callback.replace(nativeAuthRedirect, `https://${host}/mobile-auth/callback`);
  const f = fixture(), task = f.openWalletBrowser(linkedRequest, new AbortController().signal);
  f.choose('metamask'); await flush();
  assert.equal(f.opened[0], walletBrowserUrl('metamask', linkedRequest));
  for (const bad of [callback, linkedCallback.replace(state, 'wrong-state'), linkedCallback.replace(host, 'evil.example'), linkedCallback + '&access_token=forbidden']) f.send(bad);
  assert.equal(f.listeners.size, 1, 'only verified-host callbacks with the current state can finish HTTPS sign-in');
  f.send(linkedCallback); assert.equal(await task, linkedCallback);
  assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0);
}
for (const cancelBy of ['before-selection', 'after-selection']) {
  const f = fixture(), controller = new AbortController(), task = f.openWalletBrowser(request, controller.signal);
  const rejected = assert.rejects(task, error => error.code === 4001);
  if (cancelBy === 'after-selection') { f.choose('metamask'); await flush(); }
  const before = f.opened.length; controller.abort();
  await rejected; f.choose('metamask'); f.send(callback); await flush(); assert.equal(f.opened.length, before); assert.equal(f.choosing, false); assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0);
}
for (const { id, name } of walletBrowsers) for (const missing of [true, false]) {
  const f = fixture(); f.installed = !missing; f.failOpen = !missing;
  const task = f.openWalletBrowser(request, new AbortController().signal), rejected = assert.rejects(task, missing ? new RegExp('Install ' + name) : /Synthetic open failure/);
  f.choose(id); await rejected; assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0); assert.equal(f.choosing, false);
  if (missing) assert.equal(f.opened.length, 0, `${id} cannot launch when its app is missing`);
}
for (const [index, scheme] of ['okxwallet', 'okxweb3', 'okx'].entries()) {
  const f = fixture(); f.installed = scheme;
  const task = f.openWalletBrowser(request, new AbortController().signal); f.choose('okx'); await flush();
  assert.deepEqual(f.detected, ['okxwallet', 'okxweb3', 'okx'].slice(0, index + 1).map(value => value + '://'), 'OKX prefers the dedicated app before common and legacy schemes');
  assert.equal(new URL(f.opened[0]).protocol, scheme + ':');
  assert.equal(new URL(f.opened[0]).searchParams.get('dappUrl'), request.url, 'every OKX scheme preserves the original authorization URL');
  f.send(callback); assert.equal(await task, callback);
}
{
  const f = fixture(), controller = new AbortController(); let release;
  f.detection = new Promise(resolve => { release = resolve; });
  const task = f.openWalletBrowser(request, controller.signal), rejected = assert.rejects(task, error => error.code === 4001);
  f.choose('metamask'); controller.abort(); release(true); await rejected; await flush(); assert.equal(f.opened.length, 0, 'navigation suppresses a late wallet launch');
}
{
  const f = fixture(), task = f.openWalletBrowser(request, new AbortController().signal), rejected = assert.rejects(task, /expired/);
  for (const timer of f.timers.keys()) timer(); await rejected; assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0);
  await assert.rejects(f.openWalletBrowser({ ...request, wallet: false }, new AbortController().signal), /Start a new/);
  await assert.rejects(f.openWalletBrowser({ ...request, expiresAt: Date.now() - 1 }, new AbortController().signal), /Start a new/);
}
console.log('PASS direct wallet browsers: explicit MetaMask/Phantom/OKX/Trust/Rabby choice, exact auth URLs, callback validation, cancellation, expiry, missing apps, failed launch and stale navigation cleanup; no WalletConnect project or relay.');

const linkedUrl = new URL(authUrl); linkedUrl.searchParams.set('redirect_uri', nativeAuthLink);
const linkedRequest = startAuthRequest(linkedUrl.href, 'https://mossvale.world/', settings, 'https://mossvale.world/');
const linkedCallback = callback.replace(nativeAuthRedirect, nativeAuthLink);
const reply = data => ({ ok: true, status: 200, json: async () => data });
const clean = f => { assert.equal(f.listeners.size, 0); assert.equal(f.foregroundListeners.size, 0); assert.equal(f.timers.size, 0); };
{
  const f = fixture(); f.backgroundOnOpen = true;
  f.respond = call => reply(call.path === 'start' ? { token: 't'.repeat(43) } : { callback: linkedCallback });
  const task = f.openWalletBrowser(linkedRequest, new AbortController().signal);
  assert.equal(f.posts.length, 0, 'no handoff exists before choosing a wallet');
  f.choose('metamask'); await flush();
  assert.equal(f.posts.length, 1, 'registration finishes before wallet launch; no background polling');
  assert.equal(f.posts[0].path, 'start'); assert.equal(f.opened.length, 1);
  assert(!f.opened[0].includes('t'.repeat(43)), 'handoff proof never enters a URL');
  f.activate('active'); assert.equal(await task, linkedCallback); clean(f);
}
{
  const f = fixture(), controller = new AbortController();
  const task = f.openWalletBrowser(linkedRequest, controller.signal), rejected = assert.rejects(task, error => error.code === 4001);
  f.choose('phantom'); await flush(); assert.deepEqual(f.posts.map(call => call.path), ['start', 'result']);
  assert([...f.timers.values()].includes(2000));
  f.activate('background'); assert(![...f.timers.values()].includes(2000));
  f.tick(2000); await flush(); assert.equal(f.posts.length, 2);
  f.activate('active'); await flush(); assert.equal(f.posts.length, 3, 'foreground checks immediately');
  controller.abort(); await rejected; clean(f); f.activate('active'); f.tick(2000); await flush(); assert.equal(f.posts.length, 3);
}
for (const pendingPhase of ['start', 'result']) {
  const f = fixture(), controller = new AbortController(); let release;
  f.respond = call => call.path === pendingPhase ? new Promise(resolve => { release = resolve; }) : reply({ token: 't'.repeat(43) });
  const task = f.openWalletBrowser(linkedRequest, controller.signal), rejected = assert.rejects(task, error => error.code === 4001);
  f.choose('metamask'); await flush();
  const pending = f.posts.at(-1); assert.equal(pending.path, pendingPhase);
  controller.abort(); await rejected; await flush(); clean(f); assert(pending.signal.aborted);
  release(reply(pendingPhase === 'start' ? { token: 't'.repeat(43) } : { callback: linkedCallback })); await flush();
  assert.equal(f.opened.length, pendingPhase === 'start' ? 0 : 1, 'late registration cannot launch a wallet'); clean(f);
}
{
  const f = fixture(); f.respond = () => new Promise(() => {});
  const task = f.openWalletBrowser(linkedRequest, new AbortController().signal), rejected = assert.rejects(task, /interrupted/);
  f.choose('metamask'); await flush(); f.tick(10000); await rejected;
  assert(f.posts[0].signal.aborted); assert.equal(f.opened.length, 0, 'registration failure is visible before opening a wallet'); clean(f);
}
{
  const f = fixture(); let attempts = 0;
  f.respond = call => call.path === 'start' ? reply({ token: 't'.repeat(43) }) : ++attempts === 1 ? { ok: false, status: 429 } : reply({ callback: linkedCallback });
  const task = f.openWalletBrowser(linkedRequest, new AbortController().signal); f.choose('metamask'); await flush();
  assert.equal(attempts, 1); f.tick(2000); assert.equal(await task, linkedCallback); clean(f);
}
for (const result of [{ ok: false, status: 400 }, { ok: false, status: 401 }, { ok: false, status: 404 }, reply({ callback: linkedCallback.replace(state, 'wrong-state') }), reply({ callback: 12 })]) {
  const f = fixture(); f.respond = call => call.path === 'start' ? reply({ token: 't'.repeat(43) }) : result;
  const task = f.openWalletBrowser(linkedRequest, new AbortController().signal), rejected = assert.rejects(task, /expired|invalid/);
  f.choose('metamask'); await rejected; clean(f);
}
{
  const f = fixture(); let release;
  f.respond = call => call.path === 'start' ? reply({ token: 't'.repeat(43) }) : new Promise(resolve => { release = resolve; });
  const task = f.openWalletBrowser(linkedRequest, new AbortController().signal); f.choose('metamask'); await flush();
  f.send(linkedCallback); assert.equal(await task, linkedCallback); await flush(); clean(f);
  release(reply({ callback: linkedCallback })); await flush(); clean(f);
}
console.log('PASS HTTPS wallet return: registration before launch, in-memory proof, immediate foreground recovery, no background polling, bounded requests, transient retries, expiry, invalid callback rejection, direct-link races and complete cancellation cleanup.');
