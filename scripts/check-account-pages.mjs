import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { navigationAction, trustedOrigins } from '../mobile/navigation.ts';
import { trustedGamePage } from '../mobile/native-bridge.ts';

const calls = [], storage = new Map(), tabStorage = new Map();
let settings = {}, adapter, sequence = 0;
globalThis.location = { origin: 'https://account.mossvale.world', hostname: 'account.mossvale.world', assign: url => calls.push(['assign', url]), reload() {} };
const browserStorage = data => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
globalThis.localStorage = browserStorage(storage);
globalThis.sessionStorage = browserStorage(tabStorage);
globalThis.AccountKeycloak = class {
  constructor(config) { this.config = config; adapter = this; }
  async init(options) { calls.push(['init', options]); this.authenticated = !!settings.signedIn || (!!settings.ssoAccount && options.onLoad === 'check-sso'); this.token = this.authenticated ? 'private-test-access' : undefined;
    this.tokenParsed = { preferred_username: '<b>Adventurer</b>', email: 'adventurer@example.test', email_verified: true, exp: Date.now() / 1000 + 60, auth_time: Date.now() / 1000 };
    if (settings.initError) throw Error('private-provider-error'); }
  async updateToken(age) { calls.push(['refresh', age]); if (settings.expired) throw Error('private-provider-error'); }
  clearToken() { this.authenticated = false; this.token = undefined; }
  async login(options) { calls.push(['login', options]); if (settings.actionError) throw Error('private-provider-error'); }
  async register(options) { calls.push(['register', options]); }
  async logout(options) { calls.push(['logout', options]); }
  createAccountUrl(options) { calls.push(['account-url', options]); return 'https://auth.example/realms/mossvale/account'; }
};
let mockUI = false;
const hook = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'keycloak-js' && context.parentURL?.includes('/src/account-auth.ts')) return { shortCircuit: true, url: 'data:text/javascript,export default globalThis.AccountKeycloak' };
  if (mockUI && specifier === './account-auth.ts' && context.parentURL?.includes('/src/account-page.ts')) return { shortCircuit: true,
    url: 'data:text/javascript,export const createAccountSession=()=>globalThis.AccountSessionMock();export const AccountPageError=globalThis.AccountErrorMock;' };
  return next(specifier, context);
} });
const { createAccountSession, accountRedirectUri, AccountPageError } = await import('../src/account-auth.ts');
const config = { keycloak: { url: 'https://auth.example', realm: 'mossvale', clientId: 'mossvale-browser' } };
const available = { available: true, status: 'none', freshAuthRequired: false };
let responseBody = available, responseStatus = 200, failTransport = false;
globalThis.fetch = async (url, options) => {
  assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store'); assert(options.signal);
  if (url === '/api/config') return new Response(JSON.stringify(settings.config ?? config));
  assert.equal(url, '/api/account/deletion'); assert.equal(options.headers.Authorization, 'Bearer private-test-access');
  calls.push(['api', options.method, options.body]);
  if (failTransport) throw Error('private-network-error');
  return new Response(JSON.stringify(responseBody), { status: responseStatus });
};
try {
  let account = await createAccountSession();
  assert.equal(account.signedIn(), false);
  assert.deepEqual(calls[0], ['init', { pkceMethod: 'S256', flow: 'standard', checkLoginIframe: false, redirectUri: 'https://account.mossvale.world/account.html' }]);
  assert.equal(storage.size, 0, 'first visit does not store authority or silently log in');
  await assert.rejects(account.deletionStatus(), error => error.code === 'SESSION_EXPIRED');
  await account.signIn(); await account.createAccount(); await account.reauthenticate(); await account.changePassword(); account.manageAccount();
  assert.deepEqual(calls.filter(([name]) => name === 'login'), [
    ['login', { redirectUri: 'https://account.mossvale.world/account.html' }],
    ['login', { redirectUri: 'https://account.mossvale.world/account.html', prompt: 'login', maxAge: 0 }],
    ['login', { redirectUri: 'https://account.mossvale.world/account.html', action: 'UPDATE_PASSWORD' }],
  ]);
  assert.deepEqual(calls.find(([name]) => name === 'account-url'), ['account-url', { redirectUri: 'https://account.mossvale.world/account.html' }]);
  for (const provider of ['google', 'apple', '__proto__', 'https://other.example']) await assert.rejects(account.signInWithSocial(provider), error => error.code === 'PROVIDER_UNAVAILABLE');
  for (const socialProviders of [null, {}, { google: 'apple', apple: 'google' }, { google: true, apple: '../apple' }]) {
    settings.config = { ...config, socialProviders }; account = await createAccountSession();
    assert.deepEqual(account.socialProviders, { google: false, apple: false });
    await assert.rejects(account.signInWithSocial('google'), error => error.code === 'PROVIDER_UNAVAILABLE');
  }
  settings.config = { ...config, socialProviders: { google: 'google', apple: 'apple' } };
  account = await createAccountSession();
  await account.signInWithSocial('google'); await account.signInWithSocial('apple');
  assert.deepEqual(calls.slice(-2), ['google', 'apple'].map(idpHint => ['login', { redirectUri: 'https://account.mossvale.world/account.html', idpHint }]));
  settings.actionError = true; await assert.rejects(account.signInWithSocial('apple'), error => error.code === 'SIGN_IN_FAILED' && !error.message.includes('private')); settings.actionError = false;
  globalThis.__MOSSVALE_NATIVE_AUTH__ = true;
  const startNative = calls.length; account = await createAccountSession();
  await account.signIn(); await account.createAccount(); await account.signInWithSocial('google'); await account.reauthenticate(); await account.changePassword();
  assert(calls.slice(startNative).filter(([name]) => ['init', 'login', 'register'].includes(name)).every(([, value]) => value.redirectUri === 'mossvale://auth/callback'));
  assert.equal(calls.findLast(([name]) => name === 'init')[1].silentCheckSsoRedirectUri, undefined, 'native auth keeps its platform authentication session');
  account.manageAccount(); assert.deepEqual(calls.findLast(([name]) => name === 'account-url'), ['account-url', { redirectUri: 'https://account.mossvale.world/account.html' }]);
  await account.signOut(); assert.deepEqual(calls.at(-1), ['logout', { redirectUri: 'https://account.mossvale.world/account.html', logoutMethod: 'POST' }]);
  delete globalThis.__MOSSVALE_NATIVE_AUTH__;
  globalThis.__MOSSVALE_NATIVE__ = true; account = await createAccountSession();
  assert.equal(calls.findLast(([name]) => name === 'init')[1].silentCheckSsoRedirectUri, undefined, 'older native apps keep their existing restoration flow');
  assert.equal(account.socialSignInRequiresUpdate, true); assert.deepEqual(account.socialProviders, { google: false, apple: false });
  await assert.rejects(account.signInWithSocial('google'), error => error.code === 'PROVIDER_UNAVAILABLE');
  await account.signIn(); assert.deepEqual(calls.at(-1), ['login', { redirectUri: 'https://account.mossvale.world/account.html' }]);
  delete globalThis.__MOSSVALE_NATIVE__; settings = {};
  settings.signedIn = true; account = await createAccountSession();
  assert.equal(account.profile().name, '<b>Adventurer</b>');
  assert.equal(account.recentAuthentication(), true);
  adapter.tokenParsed.auth_time = Date.now() / 1000 - 301; assert.equal(account.recentAuthentication(), false);
  delete adapter.tokenParsed.auth_time; assert.equal(account.recentAuthentication(), false, 'iat cannot substitute for fresh authentication');
  assert.deepEqual(await account.deletionStatus(), available);
  const before = calls.filter(([name]) => name === 'api').length;
  for (const phrase of ['', 'delete account', ' DELETE ACCOUNT', 'DELETE ACCOUNT ', undefined])
    await assert.rejects(account.requestDeletion(phrase), error => error.code === 'CONFIRMATION_REQUIRED');
  assert.equal(calls.filter(([name]) => name === 'api').length, before, 'wrong confirmation never reaches the server');
  responseBody = { status: 'pending', requestedAt: 123, available: true, freshAuthRequired: false };
  assert.equal((await account.requestDeletion('DELETE ACCOUNT')).status, 'pending');
  assert.deepEqual(calls.at(-1), ['api', 'POST', '{"confirmation":"DELETE ACCOUNT"}'], 'server chooses the authenticated account; no client account identifier');
  for (const [code, http] of [['FRESH_AUTH_REQUIRED', 401], ['ACCOUNT_PAYMENTS_PENDING', 409]]) {
    responseBody = { code, error: 'private-server-detail' }; responseStatus = http;
    await assert.rejects(account.requestDeletion('DELETE ACCOUNT'), error => error.code === code && !error.message.includes('private'));
  }
  responseStatus = 200;
  for (const body of [{}, { status: 'none' }, { status: 'mystery' }, null]) {
    responseBody = body;
    await assert.rejects(account.requestDeletion('DELETE ACCOUNT'), error => error.code === 'STATUS_UNKNOWN');
  }
  failTransport = true; await assert.rejects(account.requestDeletion('DELETE ACCOUNT'), /may have been received/); failTransport = false;
  responseBody = available;
  tabStorage.clear(); settings = { ssoAccount: true };
  account = await createAccountSession(); assert.equal(account.signedIn(), true, 'a new browser/app document restores its provider session');
  assert.deepEqual([...storage], [['mossvale-account-signed-in', '1']], 'only a nonsecret sign-in preference survives app restart');
  assert.equal(calls.filter(([name]) => name === 'init').at(-1)[1].onLoad, 'check-sso');
  assert.equal(calls.findLast(([name]) => name === 'init')[1].silentCheckSsoRedirectUri, location.origin + '/silent-check-sso.html');
  assert.equal(calls.findLast(([name]) => name === 'init')[1].silentCheckSsoFallback, false, 'blocked third-party cookies cannot redirect the account page');
  adapter.tokenParsed.auth_time = Date.now() / 1000 - 301;
  assert.equal(account.recentAuthentication(), false, 'restoring an SSO session does not authorize sensitive actions without fresh authentication');
  await account.signOut(); assert.deepEqual(calls.at(-1), ['logout', { redirectUri: 'https://account.mossvale.world/account.html', logoutMethod: 'POST' }]);
  assert.equal(storage.size, 0); assert.equal(tabStorage.size, 0);
  account = await createAccountSession(); assert.equal(account.signedIn(), false, 'logout stays signed out after restart');
  assert.equal(calls.filter(([name]) => name === 'init').at(-1)[1].onLoad, undefined);
  tabStorage.set('mossvale-account-signed-in', '1'); account = await createAccountSession();
  assert.equal(account.signedIn(), true); assert.equal(storage.get('mossvale-account-signed-in'), '1', 'legacy session preferences migrate');
  settings = {}; account = await createAccountSession();
  assert.equal(account.signedIn(), false); assert.equal(storage.size, 0); assert.equal(tabStorage.size, 0, 'expired SSO removes both markers');
  settings.signedIn = true; settings.expired = true; account = await createAccountSession(); await assert.rejects(account.deletionStatus(), error => error.code === 'SESSION_EXPIRED');
  assert.equal(account.signedIn(), false); settings.expired = false;
  for (const keycloak of [null, {}, { ...config.keycloak, url: 'http://auth.example' }, { ...config.keycloak, url: 'https://user:secret@auth.example' }, { ...config.keycloak, url: 'javascript:alert(1)' }]) {
    settings.config = { keycloak }; await assert.rejects(createAccountSession(), error => error.code === 'CONFIG_INVALID');
  }
  settings = {};
  for (const origin of ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world']) {
    location.origin = origin; location.hostname = new URL(origin).hostname;
    assert.equal(accountRedirectUri(), origin + '/account.html');
  }

  // Exercise the actual page handlers against a minimal DOM, including interrupted POSTs.
  const html = readFileSync(new URL('../account.html', import.meta.url), 'utf8');
  class Node {
    hidden = false; disabled = false; value = ''; textContent = ''; onclick; oninput; onsubmit;
    classList = { toggle() {} }; focus() { this.focused = true; }
  }
  const flush = () => new Promise(resolve => setImmediate(resolve));
  let uiCalls, uiSettings;
  async function page(options = {}) {
    uiSettings = { signedIn: true, recent: true, status: available, ...options }; uiCalls = []; storage.clear(); tabStorage.clear();
    if (options.returnToDeletion) tabStorage.set('mossvale-account-delete-step', 'confirm');
    const nodes = new Map();
    for (const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) { const node = new Node(); node.hidden = /\bhidden\b/.test(tag[0]); nodes.set(tag[1], node); }
    globalThis.document = { getElementById: id => { assert(nodes.has(id), `missing markup #${id}`); return nodes.get(id); } };
    globalThis.window = new EventTarget();
    globalThis.AccountErrorMock = AccountPageError;
    globalThis.AccountSessionMock = async () => ({ signedIn: () => uiSettings.signedIn, recentAuthentication: () => uiSettings.recent,
      socialProviders: uiSettings.socialProviders || { google: false, apple: false },
      signInWithSocial: async provider => { uiCalls.push(provider); if (uiSettings.wait) await uiSettings.wait; },
      profile: () => ({ name: '<img src=x onerror=bad()>', email: 'fixture@example.test', emailVerified: true }),
      signIn: async () => { uiCalls.push('sign-in'); if (uiSettings.wait) await uiSettings.wait; }, createAccount: async () => uiCalls.push('register'),
      reauthenticate: async () => { uiCalls.push('fresh-login'); if (uiSettings.wait) await uiSettings.wait; }, manageAccount: () => uiCalls.push('manage'), changePassword: async () => uiCalls.push('password'),
      signOut: async () => { uiCalls.push('sign-out'); uiSettings.signedIn = false; },
      deletionStatus: async () => { uiCalls.push('status'); return uiSettings.status; },
      requestDeletion: async phrase => { uiCalls.push(['delete', phrase]); if (uiSettings.wait) await uiSettings.wait;
        if (uiSettings.error) throw uiSettings.error; return { ...available, status: 'pending' }; },
    });
    mockUI = true; await import(`../src/account-page.ts?test=${sequence++}`); await flush();
    return id => nodes.get(id);
  }
  const submit = get => get('deletion-form').onsubmit({ preventDefault() {} });
  let get = await page({ signedIn: false });
  assert.equal(get('account-social').hidden, true); assert.equal(get('account-google').hidden, true);
  assert.equal(get('delete-sign-in').hidden, false); assert.equal(get('deletion-form').hidden, true);
  let release; uiSettings.wait = new Promise(resolve => { release = resolve; });
  const signIn = get('account-sign-in').onclick(); get('account-sign-in').onclick();
  assert.deepEqual(uiCalls, ['sign-in'], 'repeated clicks do not start concurrent login'); release(); await signIn;
  get = await page({ signedIn: false, socialProviders: { google: true, apple: false } });
  assert.equal(get('account-social').hidden, false); assert.equal(get('account-google').hidden, false); assert.equal(get('account-apple').hidden, true);
  globalThis.__MOSSVALE_NATIVE_AUTH__ = true;
  uiSettings.wait = new Promise(resolve => { release = resolve; });
  const pendingSocial = get('account-google').onclick(); get('account-sign-in').onclick();
  assert.deepEqual(uiCalls, ['google']); assert.equal(get('account-sign-in').disabled, true);
  const cancelled = new Event('mossvale:auth-result'); cancelled.detail = { status: 'cancelled' }; window.dispatchEvent(cancelled);
  assert.equal(get('account-sign-in').disabled, false); assert.match(get('account-message').textContent, /cancelled/);
  release(); await pendingSocial; delete globalThis.__MOSSVALE_NATIVE_AUTH__;
  get = await page(); assert.equal(get('account-name').textContent, '<img src=x onerror=bad()>', 'profile goes through textContent');
  await get('delete-begin').onclick(); assert.equal(tabStorage.get('mossvale-account-delete-step'), 'confirm');
  assert(uiCalls.includes('fresh-login')); assert(!uiCalls.some(Array.isArray));
  globalThis.__MOSSVALE_NATIVE_AUTH__ = true;
  uiSettings.wait = new Promise(resolve => { release = resolve; });
  const freshPending = get('delete-begin').onclick();
  const authError = new Event('mossvale:auth-result'); authError.detail = { status: 'error' }; window.dispatchEvent(authError);
  assert.equal(tabStorage.has('mossvale-account-delete-step'), false, 'cancelled native reauthentication cannot leave a future deletion-confirmation marker');
  assert.equal(get('delete-begin').disabled, false); assert.equal(get('deletion-form').hidden, true);
  release(); await freshPending; delete globalThis.__MOSSVALE_NATIVE_AUTH__;
  get = await page({ returnToDeletion: true });
  assert.equal(get('deletion-form').hidden, false); assert.equal(get('delete-confirm').disabled, true);
  assert(!uiCalls.some(Array.isArray), 'fresh login never submits deletion itself');
  get('delete-phrase').value = 'delete account'; get('delete-phrase').oninput(); submit(get);
  assert.equal(get('delete-confirm').disabled, true); assert(!uiCalls.some(Array.isArray));
  get('delete-phrase').value = 'DELETE ACCOUNT'; get('delete-phrase').oninput();
  assert.equal(get('delete-confirm').disabled, false);
  uiSettings.wait = new Promise(resolve => { release = resolve; }); submit(get); submit(get);
  assert.equal(uiCalls.filter(Array.isArray).length, 1); assert.equal(get('delete-confirm').disabled, true);
  globalThis.__MOSSVALE_NATIVE_AUTH__ = true; window.dispatchEvent(cancelled);
  assert.equal(get('delete-confirm').disabled, true, 'native auth cancellation cannot unlock an in-flight account deletion');
  delete globalThis.__MOSSVALE_NATIVE_AUTH__;
  release(); await flush(); assert.equal(get('deletion-form').hidden, true); assert.equal(get('delete-phrase').value, '');
  assert.match(get('deletion-status').textContent, /received/);
  get = await page({ returnToDeletion: true, error: new AccountPageError('STATUS_UNKNOWN', 'Response interrupted') });
  get('delete-phrase').value = 'DELETE ACCOUNT'; submit(get); await flush();
  assert.equal(get('deletion-form').hidden, true); assert.equal(get('delete-begin').disabled, true);
  await get('deletion-check').onclick(); assert.equal(get('delete-begin').disabled, false);
  assert.equal(get('deletion-form').hidden, true, 'status recovery requires a new explicit confirmation flow');
  get = await page({ returnToDeletion: true, recent: false }); assert.equal(get('deletion-form').hidden, true);
  get = await page({ status: { ...available, available: false } }); assert.equal(get('delete-begin').disabled, true);
  get = await page({ status: { ...available, status: 'pending' }, returnToDeletion: true }); assert.equal(get('deletion-form').hidden, true);
  get = await page({ status: { ...available, status: 'complete' } }); assert.match(get('deletion-status').textContent, /has been deleted/);
  get = await page({ returnToDeletion: true }); get('delete-cancel').onclick(); assert.equal(get('deletion-form').hidden, true); assert.equal(get('delete-begin').focused, true);

  const origins = trustedOrigins('https://mossvale.world/', { keycloak: config.keycloak, realms: [{ origin: 'https://us.mossvale.world' }, { origin: 'https://asia.mossvale.world' }] });
  for (const origin of ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world']) for (const path of ['/account.html', '/support.html', '/privacy.html']) {
    assert.equal(navigationAction(origin + path, origins), 'internal', 'native account/support/privacy stays in the app');
    assert.equal(trustedGamePage(origin + path, 'https://mossvale.world/', false), undefined, 'account/info pages have no native wallet or billing authority');
  }
  for (const name of ['account', 'support', 'privacy']) {
    const source = readFileSync(new URL(`../${name}.html`, import.meta.url), 'utf8');
    assert.match(source, /support@mossvale\.world/); assert.match(source, /name="viewport"/); assert.match(source, /<main id="main"/);
    assert(!/private-test-access|<iframe|onclick=/.test(source));
  }
  console.log('PASS account pages: PKCE/callbacks, provider actions, memory-only tokens, fresh auth, exact confirmation, deletion status/recovery, concurrent clicks, escaped identity and native navigation without wallet authority.');
} finally { hook.deregister(); }
