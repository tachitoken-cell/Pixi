import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { authCallback, authSettings, isAccountNavigation, isAuthNavigation, loadGame, nativeAuthLink, nativeAuthRedirect, navigationAction, startAuthRequest, trustedOrigins, validateGameUrl, walletBrowserUrl, walletBrowsers } from './navigation.ts';
import { APP_STORE_URLS, parseAppUpdatePolicy, requiredAppUpdate } from './app-update.ts';

for (const value of [undefined, null, {}]) assert.deepEqual(parseAppUpdatePolicy(value), {});
for (const value of [false, [], '', { windows: { minVersion: '1' } }, { apple: {} }, { apple: null }, { apple: { minVersion: '1.2.3.4' } }, { apple: { minVersion: '1.2-beta' } }, { apple: { minVersion: '-1' } }, { apple: { minVersion: ' 1' } }, { apple: { minVersion: '1', minBuild: 4 } }, { apple: { minVersion: '1', storeUrl: 'https://evil.test' } }]) assert.throws(() => parseAppUpdatePolicy(value));
const updatePolicy = parseAppUpdatePolicy({ apple: { minVersion: '1.9.0', minBuild: '24.1' } });
for (const [version, build, blocked] of [['1.8.9', '999', true], ['1.9', '24.0.9', true], ['1.9.0', '24.1.0', false], ['1.10', null, false], [null, '99', true], ['invalid', '99', true], ['1.9', null, true], ['1.9', 'bad', true]]) {
  assert.equal(!!requiredAppUpdate(updatePolicy, { platform: 'apple', version, build }), blocked, `version ${version}, build ${build}`);
}
assert.equal(requiredAppUpdate(updatePolicy, { platform: 'google' }), undefined, 'another platform is unaffected');
assert.equal(requiredAppUpdate({}, { platform: 'apple' }), undefined, 'missing metadata only blocks when a mandatory release is configured');
assert.equal(APP_STORE_URLS.apple, 'https://apps.apple.com/app/id6811825860');
assert.equal(APP_STORE_URLS.google, 'https://play.google.com/store/apps/details?id=world.mossvale.game');
assert(readFileSync(new URL('../.easignore', import.meta.url), 'utf8').includes('!/mobile/app-update.ts'), 'native uploads include the shared update policy helper');

const { expo } = JSON.parse(readFileSync(new URL('./app.json', import.meta.url), 'utf8'));
assert.equal(expo.orientation, 'landscape');
assert.equal(expo.ios.requireFullScreen, true);
assert.deepEqual(expo.ios.infoPlist['UISupportedInterfaceOrientations~ipad'], ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']);
const generated = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./node_modules/expo/bin/cli', import.meta.url)), 'config', '--type', 'introspect', '--json'], { cwd: new URL('.', import.meta.url), encoding: 'utf8' }))._internal.modResults;
const application = generated.android.manifest.manifest.application[0];
assert.equal(application.$['android:appCategory'], 'game');
assert.equal(application.$['android:fullBackupContent'], '@xml/secure_store_backup_rules');
assert.equal(application.$['android:dataExtractionRules'], '@xml/secure_store_data_extraction_rules');
assert.equal(application.activity.find(activity => activity.$['android:name'] === '.MainActivity').$['android:screenOrientation'], 'landscape');
for (const key of ['UISupportedInterfaceOrientations', 'UISupportedInterfaceOrientations~ipad']) {
  assert.deepEqual(generated.ios.infoPlist[key], ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']);
}
assert.equal(generated.ios.infoPlist.UIRequiresFullScreen, true);
assert.equal(generated.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
assert.equal(generated.ios.entitlements['aps-environment'], 'development', 'signed native builds declare the APNs entitlement');
assert(application['meta-data'].some(entry => entry.$['android:name'] === 'com.google.firebase.messaging.default_notification_channel_id' && entry.$['android:value'] === 'mossvale'), 'Android uses the same notification channel as the server');
assert.equal(expo.scheme, 'mossvale');
assert(generated.ios.infoPlist.CFBundleURLTypes.some(entry => entry.CFBundleURLSchemes.includes('mossvale')), 'wallets can return to the iOS app');
assert.deepEqual(generated.ios.entitlements['com.apple.developer.associated-domains'], ['applinks:mossvale.world', 'applinks:us.mossvale.world', 'applinks:asia.mossvale.world']);
const appLinks = application.activity.flatMap(activity => activity['intent-filter'] || []).filter(filter => filter.$?.['android:autoVerify'] === 'true');
assert.equal(appLinks.length, 3, 'only the three owned return hosts are verified');
for (const host of ['mossvale.world', 'us.mossvale.world', 'asia.mossvale.world']) {
  const filter = appLinks.find(filter => filter.data?.some(data => data.$['android:host'] === host));
  assert(filter, host);
  assert.deepEqual(filter.data.map(data => data.$), [{ 'android:scheme': 'https', 'android:host': host, 'android:path': '/mobile-auth/callback' }]);
  assert.deepEqual(filter.action.map(action => action.$['android:name']), ['android.intent.action.VIEW']);
  assert.deepEqual(filter.category.map(category => category.$['android:name']).sort(), ['android.intent.category.BROWSABLE', 'android.intent.category.DEFAULT']);
}
for (const scheme of ['metamask', 'phantom', 'okxwallet', 'okxweb3', 'okx', 'trust', 'rabbygo']) assert(generated.ios.infoPlist.LSApplicationQueriesSchemes.includes(scheme));
const walletPackages = generated.android.manifest.manifest.queries.flatMap(entry => entry.package || []).map(entry => entry.$['android:name']);
for (const name of ['io.metamask', 'app.phantom', 'com.okx.wallet', 'com.okinc.okex.gp', 'com.wallet.crypto.trustapp', 'com.debank.rabbymobile']) assert(walletPackages.includes(name));
for (const permission of ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE']) assert(expo.android.blockedPermissions.includes(permission));
assert.match(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).scripts['build:ios'], /^EXPO_NO_CAPABILITY_SYNC=1 /);
const androidReturns = application.activity.flatMap(activity => activity['intent-filter'] || []).flatMap(filter => filter.data || []);
assert(androidReturns.some(entry => entry.$['android:scheme'] === 'mossvale'), 'wallets can return to the Android app');

const origins = trustedOrigins('https://mossvale.world/', {
  keycloak: { url: 'https://auth.example/identity' },
  realms: [{ origin: '' }, { origin: 'https://us.mossvale.world' }, { origin: 'https://asia.mossvale.world' }],
});
for (const url of ['https://mossvale.world/?code=code&state=state', 'https://auth.example/identity/realms/mossvale/protocol/openid-connect/auth', 'https://us.mossvale.world/', 'https://asia.mossvale.world/', 'about:blank']) {
  assert.equal(navigationAction(url, origins), 'internal', url);
}
for (const url of ['https://wiki.mossvale.world/', 'https://mossvale.world.evil.example', 'mailto:help@example.com', 'tel:+1234567']) {
  assert.equal(navigationAction(url, origins), 'external', url);
}
for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'intent://test', 'http://evil.example', 'https://user:pass@mossvale.world', 'invalid']) {
  assert.equal(navigationAction(url, origins), 'blocked', url);
}
assert.throws(() => validateGameUrl('http://mossvale.world'));
assert.throws(() => validateGameUrl('https://user:pass@mossvale.world'));
assert.equal(validateGameUrl('http://192.168.1.10:5173', true), 'http://192.168.1.10:5173/');
assert.deepEqual([...trustedOrigins('http://localhost:5173', { keycloak: null }, true)], ['http://localhost:5173', 'https://account.mossvale.world']);
assert.throws(() => trustedOrigins('https://mossvale.world/', {}));
assert.throws(() => trustedOrigins('https://mossvale.world/', { keycloak: { url: 'javascript:alert(1)' } }));
assert.throws(() => trustedOrigins('https://mossvale.world/', { keycloak: null, realms: [{ origin: 'http://realm.example' }] }));
const config = { keycloak: { url: 'https://auth.example/identity', realm: 'mossvale', clientId: 'mossvale-game' }, realms: [{ origin: '' }, { origin: 'https://us.mossvale.world' }, { origin: 'https://asia.mossvale.world' }] };
const response = (body = config, status = 200) => new Response(JSON.stringify(body), { status });
const signal = new AbortController().signal;
const statuses = [404, 502, 200];
const recovering = async (url, options) => {
  assert.equal(url, 'https://mossvale.world/api/config');
  assert.equal(options.signal, signal); assert.equal(options.headers['Cache-Control'], 'no-store');
  return response(config, statuses.shift());
};
for (const status of [404, 502]) await assert.rejects(loadGame('https://mossvale.world/', false, recovering, signal), new RegExp(`temporarily unavailable \\(HTTP ${status}\\)`));
const loaded = await loadGame('https://mossvale.world/', false, recovering, signal);
assert.equal(loaded.url, 'https://mossvale.world/'); assert.deepEqual([...loaded.origins], [...origins]);
assert.equal(navigationAction('https://auth.example/identity/login', loaded.origins), 'internal');
assert.equal(navigationAction('https://auth.example.evil.test/login', loaded.origins), 'external');
const blockedConfig = { ...config, mobileAppUpdate: { apple: { minVersion: '1.0.2', minBuild: '24' } } };
assert.deepEqual((await loadGame('https://mossvale.world/', false, async () => response(blockedConfig), signal, { platform: 'apple', version: '1.0.1', build: '99' })).update, { platform: 'apple', minVersion: '1.0.2', minBuild: '24' });
await assert.rejects(loadGame('https://mossvale.world/', false, async () => response({ ...config, mobileAppUpdate: { apple: { minVersion: 'latest' } } }), signal), /sign-in settings are temporarily unavailable/);
await assert.rejects(loadGame('https://mossvale.world/', false, async () => { throw new TypeError('Network failed'); }, signal), /Could not reach Mossvale\. Check your connection/);
for (const invalid of [null, [], {}, { keycloak: { url: 'javascript:alert(1)' } }, { keycloak: { url: 'https://user:pass@auth.example' } }, { keycloak: null, realms: [{ origin: 'http://untrusted.example' }] }]) {
  await assert.rejects(loadGame('https://mossvale.world/', false, async () => response(invalid), signal), /sign-in settings are temporarily unavailable/);
}
await assert.rejects(loadGame('https://mossvale.world/', false, async () => new Response('<html>Restarting</html>'), signal), /sign-in settings are temporarily unavailable/);
await assert.rejects(loadGame('http://mossvale.world/', false, () => assert.fail('unsafe addresses cannot initiate a request'), signal), /HTTPS/);
for (const phase of ['request', 'body']) {
  const cancelled = new AbortController(), cause = new DOMException('Cancelled', 'AbortError');
  await assert.rejects(loadGame('https://mossvale.world/', false, async () => {
    if (phase === 'request') { cancelled.abort(); throw cause; }
    return { ok: true, json: async () => { cancelled.abort(); throw cause; } };
  }, cancelled.signal), error => error === cause, `cancellation during ${phase} preserves its cause`);
}

const settings = authSettings(config), state = 'd83a7bd8-4545-4f8b-8996-54b59d6ad04e';
const authUrl = new URL(`${settings.issuer}/protocol/openid-connect/auth`);
authUrl.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: nativeAuthRedirect,
  response_type: 'code', response_mode: 'fragment', scope: 'openid', state, nonce: '84efc3ad-ef47-41bb-af8d-a13077d8e9ee',
  code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', kc_idp_hint: 'google' }).toString();
const callback = `${nativeAuthRedirect}#${new URLSearchParams({ code: 'synthetic-one-use-code', state, iss: settings.issuer })}`;
const makeRequest = (page = 'https://mossvale.world/', url = authUrl.href) => startAuthRequest(url, page, settings, 'https://mossvale.world/', false, 10000);
assert.equal(authSettings({ keycloak: null }), undefined);
for (const keycloak of [{ url: config.keycloak.url }, { ...config.keycloak, realm: '../evil' }, { ...config.keycloak, url: `${config.keycloak.url}?bad=1` }]) assert.throws(() => authSettings({ keycloak }));
for (const page of ['https://mossvale.world/', 'https://us.mossvale.world/index.html', 'https://asia.mossvale.world/', 'https://asia.mossvale.world/account.html', 'https://account.mossvale.world/', 'https://mossvale.world/account.html']) {
  const request = makeRequest(`${page}?drop=this#also-drop`);
  const resumed = new URL(authCallback(request, callback, 20000));
  assert.equal(resumed.origin + resumed.pathname, page); assert.equal(resumed.search, '', 'callback codes never enter an HTTP query');
  assert.equal(new URLSearchParams(resumed.hash.slice(1)).get('code'), 'synthetic-one-use-code');
}
for (const page of ['https://evil.example/', 'https://asia.mossvale.world.evil.example/', 'https://asia.mossvale.world:8443/', 'http://asia.mossvale.world/', 'https://user:password@mossvale.world/', 'https://auth.example/identity/login', 'https://mossvale.world/wallet-login.html', 'https://mossvale.world/support.html']) assert.throws(() => makeRequest(page));
for (const [key, value] of [['redirect_uri', 'https://mossvale.world/'], ['client_id', 'another-client'], ['response_type', 'token'], ['response_mode', 'query'], ['state', 'short'], ['nonce', ''], ['code_challenge_method', 'plain'], ['code_challenge', 'short'], ['scope', 'profile'], ['access_token', 'never-open-this']]) {
  const changed = new URL(authUrl); changed.searchParams.set(key, value); assert.throws(() => makeRequest(undefined, changed.href), key);
}
const duplicateRequest = new URL(authUrl); duplicateRequest.searchParams.append('state', state); assert.throws(() => makeRequest(undefined, duplicateRequest.href));
assert.throws(() => makeRequest(undefined, authUrl.href.replace('https://auth.example/', 'https://auth.example.evil.test/')));
assert.throws(() => makeRequest(undefined, authUrl.href.replace('https://auth.example/', 'https://username:password@auth.example/')));
assert(isAuthNavigation(authUrl.href, settings));
assert(isAuthNavigation(authUrl.href.replace('/auth?', '/registrations?'), settings));
assert(!isAuthNavigation(authUrl.href.replace('/auth?', '/auth/other?'), settings));
assert(isAccountNavigation(`${settings.issuer}/account?referrer=mossvale-game`, settings));
assert(isAccountNavigation(`${settings.issuer}/account/#/security`, settings));
assert(!isAccountNavigation(`${settings.issuer}/account/other`, settings));
const walletConfig = { ...config, walletBroker: { enabled: true, provider: 'mossvale-wallet' } };
const walletSettings = authSettings(walletConfig), walletUrl = new URL(authUrl);
walletUrl.searchParams.set('kc_idp_hint', 'mossvale-wallet');
walletUrl.searchParams.set('login_hint', 'wallet+name@example.test');
walletUrl.searchParams.set('claims', JSON.stringify({ id_token: { example: { value: 'a&b#c?d=e' } } }));
const walletRequest = startAuthRequest(walletUrl.href, 'https://mossvale.world/', walletSettings, 'https://mossvale.world/');
assert.equal(walletRequest.wallet, true, 'only the configured wallet broker opens a wallet browser');
assert.equal(new URL(authCallback(walletRequest, callback)).origin, 'https://mossvale.world');
const linkedWalletUrl = new URL(walletUrl); linkedWalletUrl.searchParams.set('redirect_uri', nativeAuthLink);
const linkedWalletRequest = startAuthRequest(linkedWalletUrl.href, 'https://mossvale.world/', walletSettings, 'https://mossvale.world/');
const linkedCallback = callback.replace(nativeAuthRedirect, nativeAuthLink);
for (const host of ['mossvale.world', 'us.mossvale.world', 'asia.mossvale.world']) {
  const returned = linkedCallback.replace('mossvale.world', host);
  assert.equal(new URL(authCallback(linkedWalletRequest, returned)).hash, new URL(callback).hash, 'primary and cross-host return preserve the bound response');
  assert.throws(() => authCallback(walletRequest, returned), 'legacy requests cannot consume an HTTPS callback');
}
assert.throws(() => authCallback(linkedWalletRequest, callback), 'HTTPS requests cannot downgrade to an unverified scheme');
const socialAppLink = new URL(authUrl); socialAppLink.searchParams.set('redirect_uri', nativeAuthLink);
assert.throws(() => startAuthRequest(socialAppLink.href, 'https://mossvale.world/', walletSettings, 'https://mossvale.world/'), 'account/social auth keeps its system-browser callback');
for (const invalid of [linkedCallback.replace('https:', 'http:'), linkedCallback.replace('mossvale.world', 'evil.example'), linkedCallback.replace('mossvale.world', 'mossvale.world.evil.example'), linkedCallback.replace('mossvale.world', 'mossvale.world:8443'), linkedCallback.replace('mossvale.world', 'asia.mossvale.world.evil.example'), linkedCallback.replace('mossvale.world', 'asia.mossvale.world:8443'), linkedCallback.replace('https://', 'https://user:password@'), linkedCallback.replace('/callback#', '/callback/extra#'), linkedCallback.replace('/callback#', '/callback?extra=1#'), linkedCallback.replace(state, 'wrong-state'), linkedCallback + '&state=' + state, linkedCallback + '&access_token=secret', linkedCallback + '&error=also-error', linkedCallback.replace(encodeURIComponent(settings.issuer), encodeURIComponent('https://evil.example'))]) assert.throws(() => authCallback(linkedWalletRequest, invalid));
for (const { id: wallet } of walletBrowsers) {
  const link = new URL(walletBrowserUrl(wallet, walletRequest));
  const target = wallet === 'metamask' ? 'https://' + link.href.slice('https://link.metamask.io/dapp/'.length) : wallet === 'phantom' ? decodeURIComponent(link.pathname.slice('/ul/browse/'.length)) : link.searchParams.get(wallet === 'trust' ? 'url' : wallet === 'rabby' ? 'dapp' : 'dappUrl');
  assert.equal(target, walletRequest.url, `${wallet} preserves the complete encoded authorization URL and PKCE/state`);
  const linked = new URL(walletBrowserUrl(wallet, linkedWalletRequest));
  const linkedTarget = wallet === 'metamask' ? 'https://' + linked.href.slice('https://link.metamask.io/dapp/'.length) : wallet === 'phantom' ? decodeURIComponent(linked.pathname.slice('/ul/browse/'.length)) : linked.searchParams.get(wallet === 'trust' ? 'url' : wallet === 'rabby' ? 'dapp' : 'dappUrl');
  assert.equal(linkedTarget, linkedWalletRequest.url, `${wallet} preserves the HTTPS redirect and full PKCE request`);
  assert.deepEqual([...new URL(target).searchParams], [...walletUrl.searchParams]);
  if (wallet === 'phantom') assert.equal(link.searchParams.get('ref'), 'https://mossvale.world');
  if (wallet === 'trust') assert.equal(link.searchParams.get('coin_id'), '60');
  if (wallet === 'rabby') {
    assert.equal(link.protocol, 'rabbygo:'); assert.equal(link.hostname, 'go.rabby.io'); assert.equal(link.pathname, '/mobile/');
    assert.equal(link.searchParams.get('_cmd'), 'open-dapp');
  }
  assert.throws(() => walletBrowserUrl(wallet, makeRequest()), 'social sign-in cannot be opened in a wallet browser');
  for (const url of [walletRequest.url.replace('https:', 'http:'), walletRequest.url.replace('https://', 'https://user:password@'), walletRequest.url + '#fragment', walletRequest.url.replace('auth.example', 'evil.test')]) assert.throws(() => walletBrowserUrl(wallet, { ...walletRequest, url }));
}
assert.throws(() => walletBrowserUrl('unknown', walletRequest));
for (const [key, value] of [['kc_idp_hint', 'unconfigured-wallet'], ['client_id', 'another-client'], ['code_challenge_method', 'plain'], ['redirect_uri', 'https://mossvale.world'], ['redirect_uri', 'https://evil.test']]) {
  const changed = new URL(walletUrl); changed.searchParams.set(key, value);
  assert.throws(() => startAuthRequest(changed.href, 'https://mossvale.world/', walletSettings, 'https://mossvale.world/'));
}
for (const hint of ['google', 'apple', '']) {
  const changed = new URL(walletUrl); changed.searchParams.set('kc_idp_hint', hint);
  assert.equal(startAuthRequest(changed.href, 'https://mossvale.world/', walletSettings, 'https://mossvale.world/').wallet, false);
}
const duplicateWallet = new URL(walletUrl); duplicateWallet.searchParams.append('kc_idp_hint', 'mossvale-wallet');
assert.throws(() => startAuthRequest(duplicateWallet.href, 'https://mossvale.world/', walletSettings, 'https://mossvale.world/'));
assert.throws(() => startAuthRequest(walletUrl.href.replace('/auth?', '/registrations?'), 'https://mossvale.world/', walletSettings, 'https://mossvale.world/'));
assert.throws(() => startAuthRequest(walletUrl.href, 'https://mossvale.world/', settings, 'https://mossvale.world/'), 'unconfigured wallet hints are rejected');
for (const page of ['https://mossvale.world/account.html', 'https://account.mossvale.world/', 'https://evil.test/']) assert.throws(() => startAuthRequest(walletUrl.href, page, walletSettings, 'https://mossvale.world/'));
for (const value of [callback.replace('mossvale://auth/', 'mossvale://evil/'), callback.replace('/callback#', '/callback/extra#'), callback.replace('#', '?'), callback.replace(state, 'wrong-state'), `${callback}&state=${state}`, `${callback}&access_token=bearer`, `${callback}&id_token=bearer`, `${callback}&refresh_token=bearer`, `${callback}&error=also-error`, callback.replace(encodeURIComponent(settings.issuer), encodeURIComponent('https://wrong.example/issuer'))]) assert.throws(() => authCallback(makeRequest(), value, 20000), value);
assert.throws(() => authCallback(makeRequest(), callback, 610000), 'expired responses are rejected');
const denied = `${nativeAuthRedirect}#${new URLSearchParams({ state, error: 'access_denied', error_description: 'untrusted copy', error_uri: 'https://evil.test' })}`;
const deniedResult = authCallback(makeRequest(), denied, 20000);
assert.match(deniedResult, /error=access_denied/); assert(!deniedResult.includes('untrusted') && !deniedResult.includes('evil.test'));

// Execute the actual component with tiny hook/native mocks; no native runtime or network is used.
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '').replace('export default function App()', 'function App()');
const appScript = ts.transpileModule(appSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'createElement', jsxFragmentFactory: 'Fragment' } }).outputText;
function mountApp(request, platform = 'ios', metadata = {}) {
  const hooks = [], timers = new Map(), listeners = new Set(), requests = [], opened = [], bridgeCalls = [], authCalls = [], walletCalls = [], treasureCalls = [], alerts = [], backListeners = new Set();
  let cursor = 0, timerId = 0, dirty = true, mounted = true, staleWrites = 0, tree, pending = [], nativeExecute;
  const AppState = { currentState: 'active', addEventListener(_type, callback) { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } };
  const nativeServiceCalls = [];
  const notifications = { execute: async () => ({}), signOut: async () => ({}), pause() {}, start() {}, stop() {} };
  const links = { openURL: async url => { opened.push(url); } };
  const context = {
    ...Object.fromEntries(['ActivityIndicator', 'Image', 'Modal', 'Pressable', 'ScrollView', 'StatusBar', 'Text', 'View', 'SafeAreaProvider', 'SafeAreaView', 'WebView'].map(name => [name, name])),
    process: { env: {} }, __DEV__: false, Error, AbortController, URL, URLSearchParams, authCallback, isAccountNavigation, isAuthNavigation, loadGame, nativeAuthRedirect, navigationAction, startAuthRequest, walletBrowsers, AppState, APP_STORE_URLS,
    fetch: (url, options) => { requests.push({ url, ...options }); return request(url, options); },
    useKeepAwake() {}, require: () => 0, StyleSheet: { absoluteFill: {}, create: value => value },
    Alert: { alert: (...args) => alerts.push(args) }, Linking: links,
    WebBrowser: { openAuthSessionAsync: (url, redirect) => new Promise((resolve, reject) => authCalls.push({ url, redirect, resolve, reject })), dismissAuthSession: () => authCalls.push({ dismissed: true }) },
    openWalletBrowser: (request, signal, choose) => new Promise((resolve, reject) => {
      const call = { request, signal, resolve: value => { choose(undefined); resolve(value); }, reject: error => { choose(undefined); reject(error); }, wallet: undefined }; walletCalls.push(call);
      choose(wallet => { if (call.wallet || signal.aborted) return; call.wallet = wallet; choose(undefined); });
      signal.addEventListener('abort', () => { choose(undefined); reject(Object.assign(Error('Cancelled'), { code: 4001 })); }, { once: true });
    }),
    BackHandler: { addEventListener: (_type, listener) => { backListeners.add(listener); return { remove: () => backListeners.delete(listener) }; }, exitApp() {} },
    nativeApplicationVersion: metadata.version === undefined ? '1.0.1' : metadata.version, nativeBuildVersion: metadata.build === undefined ? platform === 'ios' ? '23' : '27' : metadata.build, Platform: { OS: platform }, randomDocumentId: () => 'a'.repeat(32),
    createNativeServices: () => ({ execute: async request => { nativeServiceCalls.push(request.method); return {}; }, clear: () => bridgeCalls.push(['clear']), stop: async () => bridgeCalls.push(['stop']) }),
    createNativeNotifications: () => notifications,
    createTreasureWallet: options => {
      let current;
      return {
        busy: () => !!current, clear: () => current?.controller.abort(),
        execute: async request => {
          if (options.blocked() || current) throw Object.assign(Error('Busy'), { code: -32002 });
          const controller = new AbortController(), kind = request.method === 'treasure.collect' ? 'claim' : 'connect';
          try { return await new Promise((resolve, reject) => {
            const finish = result => { options.choose(undefined); resolve(result); };
            current = { request, controller, finish }; treasureCalls.push(current); options.pending({ controller, kind });
            options.choose(wallet => { current.wallet = wallet; options.choose(undefined); });
            controller.signal.addEventListener('abort', () => { options.choose(undefined); reject(Object.assign(Error('Cancelled'), { code: 4001 })); }, { once: true });
          }); } finally { current = undefined; options.pending(undefined); }
        },
      };
    },
    createNativeBridge: options => { nativeExecute = options.execute; return {
      invalidate() { bridgeCalls.push(['invalidate']); options.onNavigate(); },
      navigate(url) { bridgeCalls.push(['navigate', url]); options.onNavigate(); },
      receive: async (data, url) => bridgeCalls.push(['receive', data, url]),
      script: () => 'true;', event: value => bridgeCalls.push(['event', value]),
    }; },
    Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useRef(value) { const index = cursor++; return hooks[index] ||= { current: value }; },
    useMemo(factory, dependencies) {
      const index = cursor++, previous = hooks[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) hooks[index] = { dependencies, value: factory() };
      return hooks[index].value;
    },
    useCallback(callback, dependencies) { return context.useMemo(() => callback, dependencies); },
    useState(value) {
      const index = cursor++; hooks[index] ||= { value };
      return [hooks[index].value, next => {
        if (!mounted) { staleWrites++; return; }
        next = typeof next === 'function' ? next(hooks[index].value) : next;
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
      }];
    },
    useEffect(callback, dependencies) {
      const index = cursor++, previous = hooks[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) pending.push(() => {
        previous?.cleanup?.(); hooks[index] = { dependencies, cleanup: callback() };
      });
    },
    setTimeout(callback, ms) { timers.set(++timerId, { callback, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  runInNewContext(appScript, context);
  function render() { dirty = false; cursor = 0; pending = []; tree = context.App(); for (const effect of pending) effect(); }
  async function flush() { for (let i = 0; i < 20; i++) { if (dirty && mounted) render(); await Promise.resolve(); } }
  function path(type, node, label) { if (!node || typeof node !== 'object') return; if (node.type === type && (!label || text(node) === label)) return [node]; for (const child of node.children || []) { const found = path(type, child, label); if (found) return [node, ...found]; } }
  function text(node) { return typeof node === 'string' ? node : node?.children?.map(text).join(' ') || ''; }
  return {
    requests, timers, listeners, opened, bridgeCalls, authCalls, walletCalls, treasureCalls, alerts, notifications, nativeServiceCalls, links,
    nativeRequest: (method, params = {}) => nativeExecute({ method, params, signal: new AbortController().signal, url: new URL('https://mossvale.world/') }),
    find: (type, label) => path(type, tree, label)?.at(-1), ancestors: (type, label) => path(type, tree, label)?.slice(0, -1) || [], text: () => text(tree), flush, get staleWrites() { return staleWrites; },
    async tick(ms = 15000) { for (const [id, timer] of [...timers]) { if (timer.ms !== ms) continue; timers.delete(id); timer.callback(); } await flush(); },
    async state(value) { AppState.currentState = value; for (const listener of [...listeners]) listener(value); await flush(); },
    async back() { for (const listener of backListeners) assert.equal(listener(), true); await flush(); },
    unmount() { mounted = false; for (const hook of hooks) hook?.cleanup?.(); },
  };
}
for (const platform of ['ios', 'android']) {
  const key = platform === 'ios' ? 'apple' : 'google';
  let policy = { [key]: { minVersion: '1.0.2' } };
  const app = mountApp(async () => response({ ...config, mobileAppUpdate: policy }), platform);
  await app.flush();
  assert.equal(app.find('WebView'), undefined, `${platform}: mandatory updates block before the game loads`);
  assert.match(app.text(), /Update required/);
  assert(app.ancestors('Pressable', 'Update app').some(node => node.type === 'SafeAreaView'));
  assert(app.ancestors('Pressable', 'Check again').some(node => node.type === 'ScrollView'), 'update controls remain reachable on short landscape screens');
  await app.tick(15000); assert.equal(app.requests.length, 1, 'a required release does not poll');
  await app.back(); assert.equal(app.alerts.length, 0, 'Android back cannot dismiss the requirement');
  app.find('Pressable', 'Update app').props.onPress(); await app.flush();
  assert.deepEqual(app.opened, [APP_STORE_URLS[key]], 'only the fixed app listing opens');
  assert.equal(app.find('WebView'), undefined, 'opening the store does not grant access');
  app.links.openURL = async () => { throw Error('No store handler'); };
  app.find('Pressable', 'Update app').props.onPress(); await app.flush();
  assert.equal(app.alerts.at(-1)[0], 'Could not open store');
  assert.equal(app.find('WebView'), undefined);
  await app.state('background'); assert.equal(app.requests.length, 1);
  await app.state('active'); assert.equal(app.requests.length, 2, 'returning from the store rechecks while blocked');
  assert.equal(app.find('WebView'), undefined);
  policy = {};
  app.find('Pressable', 'Check again').props.onPress(); await app.flush();
  assert(app.find('WebView'), 'removing a mistaken minimum allows the current app to start');
  app.find('WebView').props.onLoadEnd(); await app.flush();
  await app.state('background'); await app.state('active');
  assert.equal(app.requests.length, 3, 'playing does not recheck or interrupt the current session');
  app.unmount();

  for (const metadata of [{}, { version: null, build: null }]) {
    const build = platform === 'ios' ? '24' : '28';
    const app = mountApp(async () => response({ ...config, mobileAppUpdate: { [key]: { minVersion: '1.0.1', minBuild: build } } }), platform, metadata);
    await app.flush(); assert.equal(app.find('WebView'), undefined, 'old or unknown installed builds cannot skip an active minimum'); app.unmount();
  }
  const legacy = mountApp(async () => response(config), platform, { version: null, build: null });
  await legacy.flush(); assert(legacy.find('WebView'), 'missing metadata remains compatible without a required release'); legacy.unmount();
}
for (const phase of ['request', 'body']) {
  let finish, attempts = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const app = mountApp(() => {
    attempts++;
    if (attempts === 1) return Promise.resolve(response(blockedConfig));
    if (attempts > 2) return Promise.resolve(response(config));
    return phase === 'request' ? pending : Promise.resolve({ ok: true, json: () => pending });
  });
  await app.flush();
  app.find('Pressable', 'Check again').props.onPress(); await app.flush();
  assert(app.find('Pressable', 'Checking…').props.disabled);
  await app.tick(15000);
  assert(app.requests[1].signal.aborted, `${phase}: update rechecks keep the fifteen-second deadline`);
  assert.equal(app.find('WebView'), undefined, `${phase}: an unavailable recheck cannot bypass the known requirement`);
  assert.equal(app.find('Pressable', 'Check again').props.disabled, false);
  assert.match(app.text(), /check could not finish/);
  await app.tick(15000); assert.equal(app.requests.length, 2, 'failed blocked rechecks have no retry loop');
  finish(phase === 'request' ? response(config) : config); await app.flush();
  assert.equal(app.find('WebView'), undefined, 'a late successful response cannot clear a timed-out requirement');
  app.find('Pressable', 'Check again').props.onPress(); await app.flush();
  assert(app.find('WebView'), 'a fresh successful recheck can clear the requirement');
  app.unmount(); assert.equal(app.staleWrites, 0);
}
for (const platform of ['ios', 'android']) {
  const app = mountApp(async () => response(config), platform); await app.flush();
  const webview = app.find('WebView');
  assert.deepEqual(app.ancestors('WebView').map(node => node.type), ['SafeAreaProvider', 'View'], `${platform}: native safe-area padding must not shrink the game viewport`);
  assert.equal(app.ancestors('WebView').at(-1).props.style.flex, 1);
  assert.equal(webview.props.contentInsetAdjustmentBehavior, 'never'); assert.equal(webview.props.automaticallyAdjustContentInsets, false);
  assert.equal(app.find('StatusBar').props.hidden, true);
  assert(app.ancestors('ActivityIndicator').some(node => node.type === 'SafeAreaView'), `${platform}: loading controls avoid the device cutout`);
  const earlyScripts = []; webview.props.ref.current = { injectJavaScript: script => earlyScripts.push(script) };
  webview.props.onLoadStart({ nativeEvent: { url: 'https://mossvale.world/' } });
  webview.props.onLoadProgress({ nativeEvent: { url: 'https://mossvale.world/', progress: .3 } });
  assert.deepEqual(earlyScripts, ['true;'], `${platform}: install the document-bound bridge before slow subresources finish`);
  await app.flush(); assert(app.find('ActivityIndicator'), 'early bridge installation does not falsely mark the document loaded');
  webview.props.onLoadEnd(); await app.flush(); assert.equal(app.find('SafeAreaView'), undefined, 'the loaded game has no native inset padding');
  webview.props.onError(); await app.flush();
  assert(app.ancestors('Pressable', 'Reconnect').some(node => node.type === 'SafeAreaView'), `${platform}: error recovery remains within the safe area`);
  app.unmount();
}
for (const platform of ['ios', 'android']) {
  const app = mountApp(async () => response(config), platform); await app.flush();
  const webview = app.find('WebView');
  for (const [state, progress] of [['inactive', 0.1], ['background', 0.2]]) {
    await app.state(state);
    assert.equal(app.timers.size, 0, `${platform}: ${state} pauses the document watchdog`);
    webview.props.onLoadProgress({ nativeEvent: { url: 'https://mossvale.world/', progress } }); await app.flush();
    assert.equal(app.timers.size, 0, `${platform}: progress while ${state} cannot rearm the watchdog`);
    await app.tick(30000);
    assert(app.find('WebView'), `${platform}: suspended loading cannot destroy the game`);
    await app.state('active');
    assert.equal(app.timers.size, 1, `${platform}: foreground loading has a fresh deadline`);
    assert.strictEqual(app.find('WebView').props.ref, webview.props.ref, 'foregrounding preserves the current document');
    assert.equal(app.requests.length, 1, 'foregrounding does not restart a suspended load');
  }
  await app.tick(30000);
  assert.match(app.text(), /too long to load/, `${platform}: stalled foreground loading still offers recovery`);
  app.unmount();

  const progressing = mountApp(async () => response(config), platform); await progressing.flush();
  const view = progressing.find('WebView');
  const timerId = () => [...progressing.timers.keys()][0];
  let previous = timerId();
  for (const url of ['https://mossvale.world/', 'https://us.mossvale.world/']) {
    view.props.onLoadStart({ nativeEvent: { url, loading: true } }); await progressing.flush();
    assert.notEqual(timerId(), previous, `${platform}: each real document load receives a fresh deadline`);
    previous = timerId();
  }
  for (const progress of [0.2, 0.6]) {
    view.props.onLoadProgress({ nativeEvent: { url: 'https://us.mossvale.world/', progress } }); await progressing.flush();
    assert.notEqual(timerId(), previous, `${platform}: increasing progress renews the deadline`);
    previous = timerId();
    view.props.onLoadProgress({ nativeEvent: { url: 'https://us.mossvale.world/', progress } }); await progressing.flush();
    assert.equal(timerId(), previous, `${platform}: duplicate progress cannot keep a stalled load alive`);
  }
  for (const progress of [0.4, -0.1, 1.1, NaN, Infinity]) {
    view.props.onLoadProgress({ nativeEvent: { url: 'https://us.mossvale.world/', progress } }); await progressing.flush();
    assert.equal(timerId(), previous, `${platform}: backwards or invalid progress cannot renew the deadline`);
  }
  view.props.onLoadProgress({ nativeEvent: { url: 'https://mossvale.world/', progress: 0.9 } }); await progressing.flush();
  assert.equal(timerId(), previous, `${platform}: another document's progress cannot renew the deadline`);
  view.props.onLoadStart({ nativeEvent: { url: 'https://asia.mossvale.world/', loading: true } }); await progressing.flush();
  previous = timerId();
  view.props.onLoadProgress({ nativeEvent: { url: 'https://asia.mossvale.world/', progress: 0.1 } }); await progressing.flush();
  assert.notEqual(timerId(), previous, `${platform}: a new document resets the progress baseline`);
  view.props.onLoadEnd({ nativeEvent: { url: 'https://asia.mossvale.world/' } }); await progressing.flush();
  view.props.onLoadProgress({ nativeEvent: { url: 'https://asia.mossvale.world/', progress: 1 } }); await progressing.flush();
  assert.equal(progressing.timers.size, 0, 'document completion removes the renewed deadline');
  assert.equal(progressing.listeners.size, 0, 'document completion removes its foreground listener');
  await progressing.tick(30000);
  assert(progressing.find('WebView'), 'completed progress cannot receive a stale timeout');
  progressing.unmount();
}
const outage = [404, 502, 200];
const app = mountApp(async () => response(config, outage.shift()));
await app.flush(); assert.match(app.text(), /HTTP 404/); assert.equal(app.requests.length, 1); assert.equal(app.timers.size, 1);
await app.tick(); assert.match(app.text(), /HTTP 502/); assert.equal(app.requests.length, 2, 'active retry fires after fifteen seconds');
await app.state('background'); await app.tick(); assert.equal(app.requests.length, 2, 'background timers cannot retry');
await app.state('active'); assert.equal(app.requests.length, 3, 'foregrounding immediately retries after a background timeout');
let webview = app.find('WebView'); assert.equal(webview.props.source.uri, 'https://mossvale.world/');
const injected = []; webview.props.ref.current = { injectJavaScript: script => injected.push(script) };
webview.props.onLoadStart({ nativeEvent: { url: 'https://mossvale.world/#state=synthetic' } });
const beforeFragmentCleanup = app.bridgeCalls.length;
assert.equal(webview.props.onShouldStartLoadWithRequest({ url: 'https://mossvale.world/' }), true);
assert.equal(app.bridgeCalls.length, beforeFragmentCleanup, 'OAuth fragment cleanup cannot revoke the same loaded game document');
webview.props.onLoadEnd({ nativeEvent: { url: 'https://mossvale.world/' } });
await app.flush();
assert.deepEqual(injected, ['true;'], 'native installation survives the OAuth fragment being removed before load completion');
assert.equal(app.timers.size, 0); assert.equal(app.listeners.size, 0, 'successful startup removes retry timer and foreground subscription');
assert.equal(webview.props.onShouldStartLoadWithRequest({ url: 'https://auth.example/identity/login' }), true, 'trusted sign-in redirects stay in the WebView');
assert.deepEqual(app.bridgeCalls.slice(-2), [['invalidate'], ['clear']], 'leaving the game revokes the bridge and its purchase authorization');
assert.equal(webview.props.onShouldStartLoadWithRequest({ url: 'javascript:alert(1)' }), false);
assert.equal(webview.props.onShouldStartLoadWithRequest({ url: 'https://wiki.mossvale.world/' }), false); assert.deepEqual(app.opened, ['https://wiki.mossvale.world/']);
webview.props.onLoadStart({ nativeEvent: { url: 'https://auth.example/identity/login' } });
assert.deepEqual(app.bridgeCalls.slice(-2), [['navigate', 'https://auth.example/identity/login'], ['clear']]);
webview.props.onMessage({ nativeEvent: { data: '{"v":1}', url: 'https://auth.example/identity/login' } });
assert.deepEqual(app.bridgeCalls.at(-1), ['receive', '{"v":1}', 'https://auth.example/identity/login'], 'the native event origin is forwarded without trusting a page-supplied origin');
webview.props.onHttpError({ nativeEvent: { url: 'https://auth.example/favicon.ico', statusCode: 404 } });
await app.flush(); assert(app.find('WebView')); assert.equal(app.requests.length, 3, 'missing subresources do not restart sign-in');
assert.equal([...app.timers.values()][0].ms, 30000, 'the active document still has a bounded load deadline');
webview.props.onHttpError({ nativeEvent: { url: 'https://auth.example/identity/login', statusCode: 502 } });
await app.flush(); assert.match(app.text(), /HTTP 502/); assert.equal(app.find('WebView'), undefined, 'failure of the active sign-in page offers recovery');
app.find('Pressable').props.onPress(); await app.flush();
assert.equal(app.requests.length, 4, 'the visible Reconnect button starts a fresh attempt immediately'); assert(app.find('WebView'));
assert.equal([...app.timers.values()][0].ms, 30000); assert.equal(app.listeners.size, 1);
await app.tick(30000); assert.match(app.text(), /too long to load/); assert(app.find('Pressable'), 'a WebView with no finish or error cannot leave an endless splash');
await app.tick(); assert.equal(app.requests.length, 5, 'a timed-out WebView uses normal automatic recovery');
app.find('WebView').props.onLoadEnd(); await app.flush();
assert.equal(app.timers.size, 0, 'finishing the document clears its load deadline');
await app.tick(30000); assert(app.find('WebView'), 'a completed page cannot receive a stale timeout');
app.unmount(); assert(app.requests.at(-1).signal.aborted); assert.equal(app.timers.size, 0);
assert(app.bridgeCalls.some(call => call[0] === 'stop'), 'unmount stops billing listeners');

for (const phase of ['request', 'body']) for (const outcome of ['resolve', 'reject']) {
  let finish, fail, attempts = 0;
  const pending = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const app = mountApp(() => ++attempts > 1 ? Promise.resolve(response()) : phase === 'request' ? pending : Promise.resolve({ ok: true, json: () => pending }), 'android');
  await app.flush(); assert(app.text().includes('Opening the lantern roads'));
  await app.tick(15000);
  assert(app.requests[0].signal.aborted, `${phase}: deadline cancels the stalled request`);
  assert.match(app.text(), /too long to respond/, `${phase}: recovery must not wait for native cancellation to settle`);
  assert(app.find('Pressable', 'Reconnect')); assert.equal(app.find('ActivityIndicator'), undefined);
  if (phase === 'request') {
    await app.state('background'); await app.tick(15000);
    assert.equal(app.requests.length, 1, 'a timed-out startup does not retry in the background');
    await app.state('active');
  } else await app.tick(15000);
  assert.equal(app.requests.length, 2); assert(app.find('WebView'), 'automatic recovery starts a fresh successful attempt');
  app.find('WebView').props.onLoadEnd(); await app.flush();
  const bridgeCalls = app.bridgeCalls.length;
  if (outcome === 'resolve') finish(phase === 'request' ? response() : config);
  else fail(Error('Late native cancellation'));
  await app.flush();
  assert(app.find('WebView')); assert.equal(app.find('SafeAreaView'), undefined, 'expired attempts cannot cover a recovered game');
  assert.equal(app.bridgeCalls.length, bridgeCalls); assert.equal(app.timers.size, 0);
  app.unmount(); assert.equal(app.staleWrites, 0);
}

let finish;
const pendingApp = mountApp((_url, options) => new Promise(resolve => { finish = resolve; assert.equal(options.signal.aborted, false); }));
await pendingApp.flush(); assert.equal(pendingApp.timers.size, 1);
pendingApp.unmount(); assert(pendingApp.requests[0].signal.aborted); assert.equal(pendingApp.timers.size, 0);
finish(response()); await pendingApp.flush(); assert.equal(pendingApp.staleWrites, 0, 'a request completing after cleanup cannot publish a stale game');
const failingApp = mountApp(async () => response(config, 502));
await failingApp.flush(); assert.equal(failingApp.listeners.size, 1);
failingApp.unmount(); assert.equal(failingApp.timers.size, 0); assert.equal(failingApp.listeners.size, 0);
await failingApp.state('active'); assert.equal(failingApp.requests.length, 1, 'cleanup prevents future foreground retries');

async function authApp(platform = 'ios') {
  const app = mountApp(async () => response(walletConfig), platform); await app.flush();
  const webview = app.find('WebView'), scripts = [];
  webview.props.ref.current = { injectJavaScript: script => scripts.push(script) };
  webview.props.onLoadStart({ nativeEvent: { url: 'https://mossvale.world/' } });
  webview.props.onLoadEnd({ nativeEvent: { url: 'https://mossvale.world/' } }); scripts.length = 0;
  await app.flush();
  return { app, webview, scripts };
}
function resumedCallback(script) {
  let resumed, reloads = 0;
  const savedState = { existing: true };
  const history = { state: savedState, replaceState(value, _title, url) { assert.equal(value, savedState); resumed = new URL(url); } };
  const location = { origin: 'https://mossvale.world', pathname: '/', reload() { assert(resumed, 'the callback fragment is set before reload'); reloads++; } };
  const window = {}; window.top = window;
  runInNewContext(script, { window, location, history });
  assert.equal(reloads, 1, 'the document reloads so Keycloak runs its callback parser');
  assert.equal(resumed.origin, 'https://mossvale.world'); assert.equal(resumed.pathname, '/'); assert.equal(resumed.search, '');
  let leaked = false;
  runInNewContext(script, { window, history: { replaceState() { leaked = true; } }, location: { origin: 'https://evil.test', pathname: '/', reload() { leaked = true; } } });
  assert.equal(leaked, false, 'a changed WebView origin cannot receive the callback');
  return new URLSearchParams(resumed.hash.slice(1));
}
function authStatus(script) {
  const events = [], window = { dispatchEvent: event => events.push(event) }; window.top = window;
  runInNewContext(script, { window, location: { origin: 'https://mossvale.world', pathname: '/' }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  assert.equal(events.length, 1); assert.equal(events[0].type, 'mossvale:auth-result');
  return events[0].detail.status;
}
{
  const { app, webview, scripts } = await authApp();
  assert.match(webview.props.injectedJavaScriptBeforeContentLoaded, /__MOSSVALE_NATIVE_AUTH__ = true/);
  assert.match(webview.props.injectedJavaScriptBeforeContentLoaded, /__MOSSVALE_NATIVE_SESSION__ = true/);
  const metadataWindow = {}; runInNewContext(webview.props.injectedJavaScriptBeforeContentLoaded, { window: metadataWindow });
  assert.deepEqual(JSON.parse(JSON.stringify(metadataWindow.__MOSSVALE_NATIVE_APP__)), { platform: 'apple', version: '1.0.1', build: '23' }, 'installed native metadata is injected before the web game starts');
  assert.match(webview.props.injectedJavaScriptBeforeContentLoaded, /__MOSSVALE_NATIVE_WALLET_BROWSER__ = true/);
  assert.match(webview.props.injectedJavaScriptBeforeContentLoaded, /__MOSSVALE_NATIVE_AUTH_LINKS__ = true/);
  assert.equal(webview.props.onShouldStartLoadWithRequest({ url: authUrl.href, isTopFrame: false }), false);
  assert.equal(app.authCalls.length, 0, 'subframes cannot initiate native sign-in');
  assert.equal(webview.props.onShouldStartLoadWithRequest({ url: authUrl.href }), false);
  assert.equal(app.authCalls[0].url, authUrl.href); assert.equal(app.authCalls[0].redirect, nativeAuthRedirect);
  assert.equal(app.opened.length, 0, 'sign-in uses an auth session rather than a fire-and-forget external link');
  assert.equal(webview.props.onShouldStartLoadWithRequest({ url: authUrl.href }), false);
  assert.equal(app.authCalls.length, 1, 'duplicate navigations cannot create overlapping sign-in sessions');
  app.authCalls[0].resolve({ type: 'success', url: callback }); await app.flush();
  assert.equal(scripts.length, 1); assert.equal(resumedCallback(scripts[0]).get('state'), state);
  assert.strictEqual(app.find('WebView').props.ref, webview.props.ref, 'the callback resumes the same WebView and its Keycloak state storage');
  app.unmount();
}
for (const result of [{ type: 'cancel' }, { type: 'dismiss' }, { type: 'success', url: callback.replace(state, 'wrong-state') }, { type: 'success', url: `${callback}&access_token=secret` }, { type: 'success', url: denied }]) {
  const { app, webview, scripts } = await authApp();
  webview.props.onShouldStartLoadWithRequest({ url: authUrl.href }); app.authCalls[0].resolve(result); await app.flush();
  assert.equal(scripts.length, 2, 'cancellation reinstalls permissions only for the unchanged original game document and unlocks UI');
  assert(['cancelled', 'error'].includes(authStatus(scripts[1]))); assert(!scripts.join('').includes('secret')); assert(!scripts.join('').includes('location.reload'));
  webview.props.onShouldStartLoadWithRequest({ url: authUrl.href }); assert.equal(app.authCalls.length, 2, 'a completed failure permits a fresh login'); app.unmount();
}
{
  const { app, webview, scripts } = await authApp(), silent = new URL(authUrl); silent.searchParams.set('prompt', 'none');
  webview.props.onShouldStartLoadWithRequest({ url: silent.href }); app.authCalls[0].resolve({ type: 'cancel' }); await app.flush();
  assert.equal(scripts.length, 1); const params = resumedCallback(scripts[0]); assert.equal(params.get('error'), 'access_denied'); assert.equal(params.get('state'), state);
  app.unmount();
}
for (const reason of ['navigate', 'reload', 'unmount', 'error']) {
  const { app, webview, scripts } = await authApp(); webview.props.onShouldStartLoadWithRequest({ url: authUrl.href });
  if (reason === 'navigate') webview.props.onShouldStartLoadWithRequest({ url: 'https://mossvale.world/account.html' });
  if (reason === 'reload') webview.props.onLoadStart({ nativeEvent: { url: 'https://mossvale.world/' } });
  if (reason === 'unmount') app.unmount();
  if (reason === 'error') { webview.props.onError(); await app.flush(); }
  assert(app.authCalls.some(call => call.dismissed), `${reason} dismisses outstanding native auth`);
  app.authCalls[0].resolve({ type: 'success', url: callback }); await app.flush();
  assert.equal(scripts.length, 0, `${reason} discards the old callback`); assert.equal(app.staleWrites, 0);
  if (reason !== 'unmount') app.unmount();
}
for (const { id, name } of walletBrowsers) {
  const { app, webview, scripts } = await authApp();
  const accountUrl = `${settings.issuer}/account?referrer=mossvale-game&referrer_uri=https%3A%2F%2Fmossvale.world`;
  assert.equal(webview.props.onShouldStartLoadWithRequest({ url: accountUrl }), false); assert.deepEqual(app.opened, [accountUrl]);
  assert.equal(webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href, isTopFrame: false }), false);
  assert.equal(app.walletCalls.length, 0, 'subframes cannot open a wallet');
  assert.equal(webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href }), false, 'wallet authorization leaves the original WebView and its PKCE verifier in place');
  await app.flush();
  assert.equal(app.authCalls.length, 0); assert.equal(app.walletCalls.length, 1);
  assert.equal(app.walletCalls[0].request.url, walletUrl.href); assert.equal(app.walletCalls[0].request.wallet, true);
  assert(app.find('Modal')); assert(app.find('ScrollView'), 'wallet choices remain reachable on small screens');
  assert(app.ancestors('ScrollView').some(node => node.type === 'SafeAreaView'), 'wallet choices retain native safe-area padding');
  for (const wallet of walletBrowsers) assert.equal(app.find('Pressable', wallet.name).props.accessibilityRole, 'button');
  app.find('Pressable', name).props.onPress(); await app.flush();
  assert.equal(app.walletCalls[0].wallet, id); assert.equal(app.find('Modal'), undefined, `${name} closes the chooser before opening the wallet`);
  assert.match(app.text(), /Cancel sign-in/);
  assert(app.ancestors('Pressable', 'Cancel sign-in').some(node => node.type === 'SafeAreaView'), 'wallet pending controls retain native safe-area padding');
  webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href }); assert.equal(app.walletCalls.length, 1, 'duplicate wallet navigations cannot open another chooser');
  await app.state('background'); await app.state('active');
  assert.equal(app.walletCalls[0].signal.aborted, false); assert.match(app.text(), /Cancel sign-in/, 'returning before the callback keeps the sign-in pending');
  app.walletCalls[0].resolve(callback); await app.flush();
  assert.equal(scripts.length, 1); assert.equal(resumedCallback(scripts[0]).get('code'), 'synthetic-one-use-code');
  assert(!app.text().includes('Cancel sign-in')); assert.strictEqual(app.find('WebView').props.ref, webview.props.ref);
  app.unmount();
}
for (const host of ['mossvale.world', 'us.mossvale.world', 'asia.mossvale.world']) {
  const { app, webview, scripts } = await authApp();
  webview.props.onShouldStartLoadWithRequest({ url: linkedWalletUrl.href }); await app.flush();
  app.find('Pressable', 'MetaMask').props.onPress(); await app.flush();
  assert.equal(app.authCalls.length, 0, 'wallet HTTPS links use the native wallet return listener');
  app.walletCalls[0].resolve(linkedCallback.replace('mossvale.world', host)); await app.flush();
  assert.equal(resumedCallback(scripts[0]).get('code'), 'synthetic-one-use-code');
  assert(!app.text().includes('Cancel sign-in'));
  app.unmount();
}
for (const outcome of ['cancel-button', 'android-back', 'chooser-cancel', 'wallet-error', 'wallet-declined', 'wrong-state', 'token-callback']) {
  const { app, webview, scripts } = await authApp();
  webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href }); await app.flush();
  assert.match(app.text(), /Cancel sign-in/);
  if (outcome === 'cancel-button') app.find('Pressable', 'Cancel sign-in').props.onPress();
  else if (outcome === 'android-back') await app.back();
  else if (outcome === 'chooser-cancel') app.find('Modal').props.onRequestClose();
  else if (outcome === 'wallet-error') app.walletCalls[0].reject(Error('The wallet could not open.'));
  else app.walletCalls[0].resolve(outcome === 'wallet-declined' ? denied : outcome === 'wrong-state' ? callback.replace(state, 'wrong-state') : `${callback}&access_token=secret`);
  await app.flush();
  assert(!app.text().includes('Cancel sign-in'), `${outcome} removes the pending overlay`);
  assert.equal(app.find('Modal'), undefined, `${outcome} dismisses the chooser`);
  assert.equal(scripts.length, 2, `${outcome} restores original game permissions and controls`);
  assert.equal(authStatus(scripts[1]), ['wallet-error', 'wrong-state', 'token-callback'].includes(outcome) ? 'error' : 'cancelled');
  assert(!scripts.join('').includes('secret')); assert(!scripts.join('').includes('location.reload'));
  if (outcome === 'cancel-button' || outcome === 'android-back') assert(app.walletCalls[0].signal.aborted);
  webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href }); assert.equal(app.walletCalls.length, 2, `${outcome} permits retry`);
  app.unmount(); await app.flush(); assert.equal(app.staleWrites, 0);
}
for (const reason of ['navigate', 'reload', 'unmount', 'error']) {
  const { app, webview, scripts } = await authApp(); webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href }); await app.flush();
  if (reason === 'navigate') { webview.props.onShouldStartLoadWithRequest({ url: 'https://mossvale.world/account.html' }); webview.props.onLoadStart({ nativeEvent: { url: 'https://mossvale.world/account.html' } }); }
  if (reason === 'reload') webview.props.onLoadStart({ nativeEvent: { url: 'https://mossvale.world/' } });
  if (reason === 'unmount') app.unmount();
  if (reason === 'error') { webview.props.onError(); await app.flush(); }
  assert(app.walletCalls[0].signal.aborted, `${reason} aborts wallet sign-in`);
  app.walletCalls[0].resolve(callback); await app.flush();
  assert.equal(scripts.length, 0, `${reason} discards the late wallet callback`); assert.equal(app.staleWrites, 0);
  if (reason !== 'unmount') { assert(!app.text().includes('Cancel sign-in')); app.unmount(); }
}
{
  const { app, webview, scripts } = await authApp('android');
  assert.match(webview.props.injectedJavaScriptBeforeContentLoaded, /__MOSSVALE_NATIVE_AUTH_LINKS__ = true/, 'Android advertises HTTPS wallet callbacks with foreground handoff recovery');
  const metadataWindow = {}; runInNewContext(webview.props.injectedJavaScriptBeforeContentLoaded, { window: metadataWindow });
  assert.deepEqual(JSON.parse(JSON.stringify(metadataWindow.__MOSSVALE_NATIVE_APP__)), { platform: 'google', version: '1.0.1', build: '27' }, 'Android reports the installed package version and build');
  webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href }); await app.flush();
  app.find('Pressable', 'Phantom').props.onPress(); await app.flush();
  app.walletCalls[0].resolve(callback); await app.flush();
  const resumed = authCallback(app.walletCalls[0].request, callback);
  assert.equal(resumedCallback(scripts[0]).get('code'), 'synthetic-one-use-code');
  // Android's doUpdateVisitedHistory emits load-start even for replaceState.
  webview.props.onLoadStart({ nativeEvent: { url: resumed, loading: false } }); await app.flush();
  assert(!app.text().includes('Opening the lantern roads'), 'setting the callback fragment alone does not start a document load');
  webview.props.onLoadStart({ nativeEvent: { url: resumed, loading: true } }); await app.flush();
  assert(app.text().includes('Opening the lantern roads'), 'the actual callback reload retains its loading indicator');
  webview.props.onLoadEnd({ nativeEvent: { url: resumed, loading: false } }); await app.flush();
  const bridgeCalls = app.bridgeCalls.length, requests = app.requests.length;
  // /api/config may finish after page load; Keycloak then removes the OAuth fragment.
  webview.props.onLoadStart({ nativeEvent: { url: 'https://mossvale.world/', loading: false } }); await app.flush();
  assert(!app.text().includes('Opening the lantern roads'), 'callback cleanup has no matching load-end and must not cover the signed-in page');
  assert.equal(app.bridgeCalls.length, bridgeCalls, 'same-document history keeps the existing bridge authority');
  await app.tick(30000); await app.tick(15000);
  assert.equal(app.requests.length, requests, 'history cleanup cannot enter the watchdog/reconnect loop');
  assert(!app.text().includes('Reconnect'));
  app.unmount();
}
for (const [url, loading] of [
  ['https://mossvale.world/', false], // A genuine reload may report completed progress.
  ['https://mossvale.world/#new-document', true],
  ['https://mossvale.world/account.html', false],
]) {
  const { app, webview } = await authApp('android');
  webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href }); await app.flush();
  const bridgeCalls = app.bridgeCalls.length;
  webview.props.onLoadStart({ nativeEvent: { url, loading } }); await app.flush();
  assert(app.walletCalls[0].signal.aborted, 'a real document load cancels outstanding wallet sign-in');
  assert(app.bridgeCalls.length > bridgeCalls, 'a real document load invalidates the previous bridge authority');
  assert(app.text().includes('Opening the lantern roads'));
  await app.tick(30000); assert(app.text().includes('The game took too long to load'), 'real loads keep their watchdog');
  app.unmount();
}

for (const outcome of ['completed', 'cancel', 'navigation', 'unmount', 'sign-out', 'authorization-cleared']) {
  const { app, webview, scripts } = await authApp();
  const task = app.nativeRequest('treasure.collect');
  const result = outcome === 'completed' ? task : assert.rejects(task, error => error.code === 4001);
  await app.flush(); assert(app.find('Modal')); assert.match(app.text(), /saved payout/); assert.match(app.text(), /Cancel action/);
  webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href });
  assert.equal(app.walletCalls.length, 0, 'wallet sign-in cannot overlap a voucher wallet action');
  app.find('Pressable', 'Phantom').props.onPress(); await app.flush();
  assert.equal(app.find('Modal'), undefined); assert.match(app.text(), /Your wallet request may still be open/); assert.match(app.text(), /Check payout before collecting again/);
  if (outcome === 'completed') app.treasureCalls[0].finish({ transactionHash: '0x' + 'a'.repeat(64) });
  else if (outcome === 'cancel') app.find('Pressable', 'Stop waiting').props.onPress();
  else if (outcome === 'navigation') webview.props.onLoadStart({ nativeEvent: { url: 'https://mossvale.world/' } });
  else if (outcome === 'sign-out') await app.nativeRequest('auth.clear');
  else if (outcome === 'authorization-cleared') await app.nativeRequest('billing.authorize', { accessToken: null });
  else app.unmount();
  await result; await app.flush(); assert.equal(scripts.length, 0, 'voucher approval never reloads the game or signs in again');
  assert.equal(app.staleWrites, 0);
  if (outcome !== 'unmount') { assert(!app.text().includes('Cancel action') && !app.text().includes('Stop waiting')); app.unmount(); }
}
{
  const { app, webview } = await authApp(); webview.props.onShouldStartLoadWithRequest({ url: walletUrl.href });
  await assert.rejects(app.nativeRequest('treasure.connect'), error => error.code === -32002);
  assert.equal(app.treasureCalls.length, 0, 'voucher linking cannot overlap wallet sign-in'); app.unmount();
}
{
  const { app } = await authApp();
  app.notifications.signOut = async () => { throw Error('Synthetic push storage failure'); };
  await app.nativeRequest('auth.clear');
  assert(app.nativeServiceCalls.includes('auth.clear'), 'notification storage failure cannot prevent native sign-out');
  app.unmount();
}
console.log('Mobile checks: required-release startup gate, landscape, safe navigation, outage recovery, native SSO, wallet sign-in and in-app voucher approval passed (bounded update rechecks, callback validation, preserved WebView, mutual exclusion, cancellation and stale navigation cleanup).');
