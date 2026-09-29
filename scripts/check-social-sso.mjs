// Real Keycloak + PostgreSQL, isolated credentials/network. Never contacts Apple or Google.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { configureSocialSso, SOCIAL_FLOW, SSO_REDIRECTS } from './configure-social-sso.mjs';

const directory = mkdtempSync(join(tmpdir(), 'mossvale-social-sso-'));
const suffix = randomBytes(5).toString('hex'), network = `mossvale-sso-${suffix}`, database = `${network}-db`, auth = `${network}-auth`, copy = `${network}-copy`;
const image = `mossvale-apple-provider:${suffix}`, password = randomBytes(24).toString('base64url');
const env = { KEYCLOAK_URL: 'https://sso.fixture.invalid', KEYCLOAK_REALM: 'mossvale', KEYCLOAK_CLIENT_ID: 'mossvale-browser',
  GOOGLE_SSO_CLIENT_ID: 'google-fixture.apps.googleusercontent.com', GOOGLE_SSO_CLIENT_SECRET: 'isolated-google-fixture-secret', APPLE_SSO_CLIENT_ID: 'world.mossvale.game.signin' };
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 }).trim();
let pool;
try {
  const plan = await configureSocialSso('plan', env, () => { throw Error('Plan cannot make network calls'); });
  assert.equal(plan.writes, false); assert(plan.providers.every(row => row.enabled === false));
  for (const path of ['/', '/account.html']) assert(plan.redirectUris.includes(`https://asia.mossvale.world${path}`));
  assert(plan.webOrigins.includes('https://asia.mossvale.world'));
  for (const origin of ['https://asia.mossvale.world.evil.invalid', 'https://asia.mossvale.world:8443', 'http://asia.mossvale.world']) {
    assert(!plan.webOrigins.includes(origin)); assert(!plan.redirectUris.includes(origin + '/'));
  }
  assert(!JSON.stringify(plan).includes(env.GOOGLE_SSO_CLIENT_SECRET));
  await assert.rejects(configureSocialSso('prepare', env), /--apply/);
  await assert.rejects(configureSocialSso('plan', { ...env, KEYCLOAK_URL: 'https://user:secret@auth.invalid' }), /credential-free/);
  execFileSync(process.execPath, ['scripts/build-auth-theme.mjs'], { stdio: 'pipe' });
  const embeddedScript = readFileSync('artifacts/auth-theme/mossvale/login/theme.properties', 'utf8')
    .match(/^mossvaleEmbeddedScript=(js\/embedded\.[a-f0-9]{16}\.js)$/m)?.[1];
  assert(embeddedScript, 'Built theme versions its injected script');
  docker('build', '--load', '-f', 'Dockerfile.auth', '--target', 'apple-provider', '-t', image, '.');
  const output = docker('run', '--rm', '--network', 'none', '--mount', `type=bind,source=${resolve('auth-provider/test')},target=/build/test,readonly`,
    '-e', 'APPLE_SSO_TEAM_ID=TEAM123456', '-e', 'APPLE_SSO_KEY_ID=KEYID12345', '-e', 'APPLE_SSO_PRIVATE_KEY_FILE=/tmp/apple-sso-fixture-key.p8', image,
    'sh', '-c', "javac -J-XX:ActiveProcessorCount=2 -J-Xmx512m --release 21 -cp 'classes:lib/main/*:lib/boot/*' -d /tmp/check test/world/mossvale/auth/AppleProviderCheck.java && java -XX:ActiveProcessorCount=2 -Xmx512m -ea -cp '/tmp/check:classes:lib/main/*:lib/boot/*' world.mossvale.auth.AppleProviderCheck");
  assert(output.includes('PASS: Apple ES256'));
  docker('create', '--name', copy, image); docker('cp', `${copy}:/build/mossvale-apple.jar`, join(directory, 'mossvale-apple.jar')); docker('rm', copy);
  chmodSync(directory, 0o755); chmodSync(join(directory, 'mossvale-apple.jar'), 0o644);
  writeFileSync(join(directory, 'database.env'), `POSTGRES_USER=fixture\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=keycloak\n`, { mode: 0o600 });
  writeFileSync(join(directory, 'keycloak.env'), `KC_BOOTSTRAP_ADMIN_USERNAME=fixture\nKC_BOOTSTRAP_ADMIN_PASSWORD=${password}\nKC_DB=postgres\nKC_DB_USERNAME=fixture\nKC_DB_PASSWORD=${password}\nKC_DB_URL=jdbc:postgresql://${database}:5432/keycloak\nJAVA_OPTS_APPEND=-XX:ActiveProcessorCount=2 -Xms64m -Xmx512m\n`, { mode: 0o600 });
  docker('network', 'create', network);
  docker('run', '-d', '--name', database, '--network', network, '--env-file', join(directory, 'database.env'), '-p', '127.0.0.1::5432', 'postgres:17');
  for (let i = 0; i < 100; i++) { try { docker('exec', database, 'pg_isready', '-U', 'fixture'); break; } catch { await delay(100); } }
  docker('run', '-d', '--name', auth, '--network', network, '--env-file', join(directory, 'keycloak.env'), '-p', '127.0.0.1::8080',
    '--add-host', 'appleid.apple.com:127.0.0.1', '--add-host', 'accounts.google.com:127.0.0.1',
    '--add-host', 'oauth2.googleapis.com:127.0.0.1', '--add-host', 'www.googleapis.com:127.0.0.1',
    '--mount', `type=bind,source=${join(directory, 'mossvale-apple.jar')},target=/opt/keycloak/providers/mossvale-apple.jar,readonly`,
    '--mount', `type=bind,source=${resolve('artifacts/auth-theme')},target=/opt/keycloak/themes,readonly`,
    'quay.io/keycloak/keycloak:26.7.3', 'start-dev', '--cache=local', '--http-host=0.0.0.0');
  const port = docker('port', auth, '8080/tcp').split(':').at(-1), base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 1800; i++) {
    try { if ((await fetch(base + '/realms/master', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await delay(500);
  }
  assert(ready, 'Disposable Keycloak must start with the Apple provider');
  const tokenResponse = await fetch(base + '/realms/master/protocol/openid-connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'fixture', password }) });
  assert(tokenResponse.ok); env.KC_ADMIN_TOKEN = (await tokenResponse.json()).access_token;
  async function admin(path, method = 'GET', body, statuses = [200, 201, 204]) {
    const response = await fetch(`${base}/admin/realms${path}`, { method, headers: { Authorization: `Bearer ${env.KC_ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert(statuses.includes(response.status), `Local Admin ${method} status ${response.status}`);
    const text = await response.text(); return text ? JSON.parse(text) : undefined;
  }
  await admin('', 'POST', { realm: 'mossvale', enabled: true, registrationAllowed: true, resetPasswordAllowed: true, loginTheme: 'mossvale',
    browserSecurityHeaders: { contentSecurityPolicy: "frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self';" }, clients: [{ clientId: env.KEYCLOAK_CLIENT_ID,
    publicClient: true, standardFlowEnabled: true, protocol: 'openid-connect', redirectUris: ['https://existing.fixture/callback'], webOrigins: ['https://existing.fixture'] }] });
  let writes = 0;
  const fixtureFetch = (url, options) => {
    assert(new URL(url).origin === 'https://sso.fixture.invalid'); assert.equal(options.redirect, 'error');
    if (options.method !== 'GET') writes++;
    return fetch(base + new URL(url).pathname + new URL(url).search, options);
  };
  try { await configureSocialSso('prepare', env, fixtureFetch, true); }
  catch (error) {
    console.error((await admin('/mossvale/identity-provider/instances')).map(({ config, ...row }) => ({ ...row, configKeys: Object.keys(config) })));
    throw error;
  }
  const beforeVerify = writes; await configureSocialSso('verify', env, fixtureFetch); assert.equal(writes, beforeVerify);
  await configureSocialSso('prepare', env, fixtureFetch, true);
  const idps = await admin('/mossvale/identity-provider/instances'); assert.equal(idps.length, 2); assert(idps.every(row => !row.enabled && !row.trustEmail && !row.addReadTokenRoleOnCreate));
  const flow = await admin(`/mossvale/authentication/flows/${encodeURIComponent(SOCIAL_FLOW)}/executions`);
  assert.equal(flow.find(row => row.providerId === 'idp-email-verification').requirement, 'DISABLED');
  assert.equal(flow.find(row => row.providerId === 'idp-username-password-form').requirement, 'REQUIRED');
  await configureSocialSso('enable', env, fixtureFetch, true);
  const apple = await admin('/mossvale/identity-provider/instances/apple'); assert(apple.enabled && apple.storeToken);
  await assert.rejects(configureSocialSso('prepare', { ...env, SSO_PROVIDERS: 'google' }, fixtureFetch, true), /non-target provider/);
  const google = await admin('/mossvale/identity-provider/instances/google');
  await admin('/mossvale/identity-provider/instances/google', 'PUT', { ...google, config: { ...google.config, userIDClaim: 'email' } });
  await assert.rejects(configureSocialSso('verify', env, fixtureFetch), /settings differ/);
  await configureSocialSso('prepare', env, fixtureFetch, true);
  await configureSocialSso('clients', env, fixtureFetch, true);
  await configureSocialSso('enable', env, fixtureFetch, true);
  const start = new URL(`${base}/realms/mossvale/protocol/openid-connect/auth`);
  for (const [key, value] of Object.entries({ client_id: env.KEYCLOAK_CLIENT_ID, redirect_uri: 'mossvale://auth/callback', response_type: 'code',
    scope: 'openid', state: 'fixture-client-state', nonce: 'fixture-client-nonce', code_challenge: 'VnKtQAu_p_q6_FHBmfWRBMz-HDxEQGABU0SbFaYEhy4', code_challenge_method: 'S256', kc_idp_hint: 'apple' })) start.searchParams.set(key, value);
  let startResponse = await fetch(start, { redirect: 'manual' });
  const cookieJar = new Map();
  for (let i = 0; i < 5; i++) {
    assert([302, 303].includes(startResponse.status));
    const location = new URL(startResponse.headers.get('location'));
    if (location.origin !== base) break;
    for (const value of startResponse.headers.getSetCookie()) { const [name, ...parts] = value.split(';')[0].split('='); cookieJar.set(name, parts.join('=')); }
    startResponse = await fetch(location, { redirect: 'manual', headers: { Cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join('; ') } });
  }
  const appleAuthorize = new URL(startResponse.headers.get('location'));
  assert.equal(appleAuthorize.origin, 'https://appleid.apple.com'); assert.equal(appleAuthorize.searchParams.get('response_mode'), 'form_post');
  assert.equal(appleAuthorize.searchParams.get('scope'), 'email'); assert(appleAuthorize.searchParams.get('nonce'));
  // A cross-site Apple form POST may omit SameSite=Lax cookies; broker state must recover the session.
  const cancel = await fetch(`${base}/realms/mossvale/broker/apple/endpoint`, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ state: appleAuthorize.searchParams.get('state'), error: 'user_cancelled_authorize' }) });
  assert.equal(cancel.status, 303, 'Apple form POST returns a same-origin GET so browsers can send Lax cookies');
  const bounce = new URL(cancel.headers.get('location'), `${base}/realms/mossvale/broker/apple/endpoint`);
  assert.equal(bounce.origin, base); assert.equal(bounce.pathname, '/realms/mossvale/broker/apple/endpoint');
  assert.equal(cancel.headers.get('cache-control'), 'no-store'); assert.equal(cancel.headers.get('referrer-policy'), 'no-referrer');
  const cancelled = await fetch(bounce, { redirect: 'manual', headers: { Cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join('; ') } });
  assert.equal(cancelled.status, 200, 'Keycloak recovers the browser sign-in form after provider cancellation');
  const cancelledPage = await cancelled.text();
  assert.match(cancelledPage, /id="kc-form-login"/); assert.match(cancelledPage, /Access denied when authenticating with Apple/);
  const browser = (await admin('/mossvale/clients?clientId=mossvale-browser'))[0];
  assert(SSO_REDIRECTS.every(uri => browser.redirectUris.includes(uri))); assert(browser.redirectUris.includes('https://existing.fixture/callback'));
  assert(browser.webOrigins.includes('https://asia.mossvale.world'));
  assert(!browser.attributes['post.logout.redirect.uris'].includes('/auth-callback.html'));
  assert(!browser.attributes['post.logout.redirect.uris'].includes('/silent-check-sso.html'));
  for (const path of ['/', '/account.html']) {
    const uri = `https://asia.mossvale.world${path}`;
    assert(browser.attributes['post.logout.redirect.uris'].split('##').includes(uri));
    const request = new URL(start); request.searchParams.delete('kc_idp_hint'); request.searchParams.set('redirect_uri', uri);
    const response = await fetch(request, { redirect: 'manual' }); assert.equal(response.status, 200); assert.match(await response.text(), /id="kc-form-login"/);
  }
  for (const uri of ['https://asia.mossvale.world.evil.invalid/', 'https://asia.mossvale.world:8443/', 'http://asia.mossvale.world/', 'https://asia.mossvale.world/other']) {
    const request = new URL(start); request.searchParams.delete('kc_idp_hint'); request.searchParams.set('redirect_uri', uri);
    assert.equal((await fetch(request, { redirect: 'manual' })).status, 400, uri);
  }
  assert.equal(browser.attributes['pkce.code.challenge.method'], 'S256');
  await configureSocialSso('clients', env, fixtureFetch, true);

  // Real browser cookies reproduce Keycloak 26.7's account-switch identity check.
  // Keep a second A session to prove restart revokes this browser, not every device.
  const accounts = {};
  for (const name of ['a', 'b']) {
    const username = `account-switch-${name}`, accountPassword = randomBytes(24).toString('base64url');
    await admin('/mossvale/users', 'POST', { username, enabled: true, email: `${username}@fixture.invalid`, emailVerified: true,
      firstName: 'Account', lastName: name.toUpperCase(), credentials: [{ type: 'password', value: accountPassword, temporary: false }] });
    accounts[name] = (await admin(`/mossvale/users?username=${username}&exact=true`))[0];
    accounts[name].fixturePassword = accountPassword;
  }
  const authorization = (extra = {}) => {
    const verifier = randomBytes(32).toString('base64url'), state = randomBytes(24).toString('base64url'), nonce = randomBytes(24).toString('base64url');
    const url = new URL(`${base}/realms/mossvale/protocol/openid-connect/auth`);
    url.search = new URLSearchParams({ client_id: env.KEYCLOAK_CLIENT_ID, redirect_uri: 'https://existing.fixture/callback',
      response_type: 'code', scope: 'openid', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256', ...extra }).toString();
    return { url, verifier, state, nonce };
  };
  async function browserRequest(jar, url, options = {}) {
    assert.equal(new URL(url).origin, base, 'Synthetic browser only contacts isolated Keycloak');
    const response = await fetch(url, { ...options, redirect: 'manual', headers: { ...options.headers,
      Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') } });
    for (const cookie of response.headers.getSetCookie()) {
      const [name, ...parts] = cookie.split(';')[0].split('=');
      if (/;\s*Max-Age=0(?:;|$)/i.test(cookie)) jar.delete(name); else jar.set(name, parts.join('='));
    }
    return response;
  }
  async function followBrowser(jar, response) {
    for (let i = 0; i < 10; i++) {
      if (![302, 303].includes(response.status)) return { response, page: await response.text() };
      const location = new URL(response.headers.get('location'), base);
      if (location.origin !== base) return { response, callback: location };
      response = await browserRequest(jar, location);
    }
    assert.fail('Isolated account sign-in exceeded the redirect limit');
  }
  async function advanceLogin(jar, response) {
    // Keycloak may first redirect to required actions; retain the final 303 recovery response.
    for (let i = 0; i < 10; i++) {
      if (response.status !== 302) return response;
      const location = new URL(response.headers.get('location'), base);
      if (location.origin !== base) return response;
      response = await browserRequest(jar, location);
    }
    assert.fail('Isolated sign-in exceeded its internal redirect limit');
  }
  const decodeAttribute = value => value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  async function submitAccount(jar, request, account, page) {
    page ??= (await followBrowser(jar, await browserRequest(jar, request.url))).page;
    const form = page?.match(/<form\b[^>]*\bid="kc-form-login"[^>]*>/)?.[0];
    assert(form, 'Account sign-in must render the real Keycloak password form');
    const action = new URL(decodeAttribute(form.match(/\baction="([^"]+)"/)[1]));
    const response = await browserRequest(jar, action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: account.username, password: account.fixturePassword, credentialId: '' }) });
    return { response, action };
  }
  // Embedded forms change framing only for one exact, registered game callback.
  function embeddedHeaders(response, origin) {
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /(?:^|;)\s*base-uri 'self';/, 'Custom realm CSP directives are preserved');
    assert.match(csp, /(?:^|;)\s*object-src 'none';/);
    assert(csp.includes(`frame-ancestors 'self' ${origin};`), 'Only the requesting game origin may frame this form');
    assert.equal(response.headers.get('x-frame-options'), null);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  for (const origin of ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world']) {
    const jar = new Map(), request = authorization({ redirect_uri: origin + '/auth-callback.html' });
    const login = await followBrowser(jar, await browserRequest(jar, request.url));
    assert.equal(login.response.status, 200); embeddedHeaders(login.response, origin);
    assert(login.page.includes('/' + embeddedScript + '?parent=' + encodeURIComponent(origin)), 'Theme receives only the server-validated parent origin');
    for (const action of ['registration', 'reset-credentials']) {
      const href = login.page.match(new RegExp('href="([^"]*/login-actions/' + action + '[^"]*)"'))?.[1];
      assert(href, `Native ${action} link remains available`);
      const next = await followBrowser(jar, await browserRequest(jar, new URL(decodeAttribute(href), base)));
      assert.equal(next.response.status, 200); embeddedHeaders(next.response, origin);
      assert(next.page.includes('/' + embeddedScript + '?parent=' + encodeURIComponent(origin)));
    }
    const invalidJar = new Map();
    const invalid = await submitAccount(invalidJar, request, { ...accounts.a, fixturePassword: 'incorrect-fixture-password' });
    embeddedHeaders(invalid.response, origin);
    assert.match(await invalid.response.text(), /Invalid username or password/);
  }
  for (const redirect_uri of ['https://mossvale.world/', 'mossvale://auth/callback', 'https://existing.fixture/callback',
    'https://mossvale.world.evil.invalid/auth-callback.html', 'https://mossvale.world:8443/auth-callback.html', 'http://mossvale.world/auth-callback.html']) {
    const response = await browserRequest(new Map(), authorization({ redirect_uri }).url);
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('content-security-policy').includes("frame-ancestors 'self';"), true);
    assert.equal((await response.text()).includes('/' + embeddedScript + '?parent='), false);
  }
  await admin('/mossvale/clients', 'POST', { clientId: 'foreign-browser', publicClient: true, standardFlowEnabled: true,
    protocol: 'openid-connect', redirectUris: ['https://mossvale.world/auth-callback.html'] });
  const foreign = await browserRequest(new Map(), authorization({ client_id: 'foreign-browser', redirect_uri: 'https://mossvale.world/auth-callback.html' }).url);
  assert.equal(foreign.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal((await foreign.text()).includes('/' + embeddedScript + '?parent='), false);
  // Required actions (including MFA setup) retain Keycloak's real forms and scoped framing.
  const requiredJar = new Map(), requiredRequest = authorization({ redirect_uri: 'https://mossvale.world/auth-callback.html', kc_action: 'CONFIGURE_TOTP' });
  const required = await submitAccount(requiredJar, requiredRequest, accounts.a);
  const totp = await followBrowser(requiredJar, required.response);
  assert.equal(totp.response.status, 200); embeddedHeaders(totp.response, 'https://mossvale.world');
  assert.match(totp.page, /id="kc-totp-settings-form"/);
  // No completed session is left behind to interfere with account-switch regression counts.
  for (const account of Object.values(accounts)) for (const session of await admin(`/mossvale/users/${account.id}/sessions`)) await admin(`/mossvale/sessions/${session.id}`, 'DELETE');
  console.log('PASS: real Keycloak embedded login, registration, recovery, invalid-password and MFA forms; exact callback/client framing, custom CSP preservation and native/foreign-origin denial.');
  async function redeemCallback(callback, request, account) {
    assert(callback, 'Successful sign-in must reach the original client callback');
    assert.equal(callback.origin + callback.pathname, 'https://existing.fixture/callback');
    assert.equal(callback.searchParams.get('state'), request.state, 'Restart preserves the original request state');
    assert.equal(callback.searchParams.get('error'), null);
    const response = await fetch(`${base}/realms/mossvale/protocol/openid-connect/token`, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code',
        client_id: env.KEYCLOAK_CLIENT_ID, redirect_uri: 'https://existing.fixture/callback', code: callback.searchParams.get('code'), code_verifier: request.verifier }) });
    assert.equal(response.status, 200, 'Original PKCE verifier must redeem the restarted authorization code');
    const tokens = await response.json(), claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url'));
    assert.equal(claims.sub, account.id, 'Authorization must authenticate the requested account');
    assert.equal(claims.nonce, request.nonce, 'Restart preserves the original nonce');
    return tokens;
  }
  async function signIn(jar, account) {
    const request = authorization();
    const { response } = await submitAccount(jar, request, account);
    return redeemCallback((await followBrowser(jar, response)).callback, request, account);
  }
  const unrelatedBrowser = new Map();
  await signIn(unrelatedBrowser, accounts.a);
  const unrelatedSession = (await admin(`/mossvale/users/${accounts.a.id}/sessions`))[0].id;
  for (const extra of [{ max_age: '0' }, { kc_action: 'UPDATE_PASSWORD' }]) {
    const switchingBrowser = new Map();
    const request = authorization({ prompt: 'login', ...extra });
    // Two pending tabs share an auth root. Completing A binds that root to A;
    // then the older B form reaches the actual differentUserAuthenticated guard.
    const pendingPage = (await followBrowser(switchingBrowser, await browserRequest(switchingBrowser, request.url))).page;
    await signIn(switchingBrowser, accounts.a);
    const sessions = await admin(`/mossvale/users/${accounts.a.id}/sessions`);
    assert.equal(sessions.length, 2);
    let { response } = await submitAccount(switchingBrowser, request, accounts.b, pendingPage);
    response = await advanceLogin(switchingBrowser, response);
    if (extra.kc_action && response.status === 200) {
      const page = await response.text(), form = page.match(/<form\b[^>]*\bid="kc-passwd-update-form"[^>]*>/)?.[0];
      assert(form, 'UPDATE_PASSWORD must present its real required-action form before final authentication');
      response = await browserRequest(switchingBrowser, new URL(decodeAttribute(form.match(/\baction="([^"]+)"/)[1])), {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'password-new': accounts.b.fixturePassword, 'password-confirm': accounts.b.fixturePassword }) });
      response = await advanceLogin(switchingBrowser, response);
    }
    assert.equal(response.status, 400, `Identity-sensitive ${Object.keys(extra)[0]} requests must retain the standard account mismatch error`);
    assert.match(await response.text(), /already authenticated as different user/, 'Reproduce Keycloak differentUserAuthenticated on the real cookie session');
    assert.deepEqual((await admin(`/mossvale/users/${accounts.a.id}/sessions`)).map(session => session.id).sort(),
      sessions.map(session => session.id).sort(), 'Protected reauthentication must not log out either A session');
    await admin(`/mossvale/sessions/${sessions.find(session => session.id !== unrelatedSession).id}`, 'DELETE');
  }
  const switchingBrowser = new Map();
  const switchingRequest = authorization({ prompt: 'login' });
  const pendingPage = (await followBrowser(switchingBrowser, await browserRequest(switchingBrowser, switchingRequest.url))).page;
  const originalATokens = await signIn(switchingBrowser, accounts.a);
  const originalSessions = await admin(`/mossvale/users/${accounts.a.id}/sessions`);
  assert.equal(originalSessions.length, 2);
  const replacedSession = originalSessions.find(session => session.id !== unrelatedSession).id;
  const switched = await submitAccount(switchingBrowser, switchingRequest, accounts.b, pendingPage);
  switched.response = await advanceLogin(switchingBrowser, switched.response);
  assert.equal(switched.response.status, 303, 'Ordinary account mismatch starts recovery in a separate request');
  assert(switched.response.headers.get('cache-control').split(/,\s*/).includes('no-store'));
  assert.equal(switched.response.headers.get('referrer-policy'), 'no-referrer');
  const restart = new URL(switched.response.headers.get('location'));
  assert.equal(restart.origin, base); assert.equal(restart.pathname, '/realms/mossvale/login-actions/restart');
  for (const key of ['client_id', 'tab_id', 'client_data']) assert.equal(restart.searchParams.get(key), switched.action.searchParams.get(key), `Restart retains ${key}`);
  assert.equal(restart.searchParams.get('skip_logout'), 'false');
  assert.equal(restart.searchParams.has('session_code'), false);
  const restarted = await followBrowser(switchingBrowser, await browserRequest(switchingBrowser, restart));
  assert.equal(restarted.response.status, 200); assert.match(restarted.page, /id="kc-form-login"/);
  assert.deepEqual((await admin(`/mossvale/users/${accounts.a.id}/sessions`)).map(session => session.id), [unrelatedSession],
    'Standard restart revokes only the original browser session');
  const revoked = await fetch(`${base}/realms/mossvale/protocol/openid-connect/token`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token',
      client_id: env.KEYCLOAK_CLIENT_ID, refresh_token: originalATokens.refresh_token }) });
  assert.equal(revoked.status, 400, 'The replaced browser session can no longer refresh its existing tokens');
  assert.equal((await revoked.json()).error, 'invalid_grant');
  const completed = await submitAccount(switchingBrowser, switchingRequest, accounts.b, restarted.page);
  const accountBTokens = await redeemCallback((await followBrowser(switchingBrowser, completed.response)).callback, switchingRequest, accounts.b);
  const accountBSessions = await admin(`/mossvale/users/${accounts.b.id}/sessions`);
  assert.equal(accountBSessions.length, 1);
  assert.notEqual(accountBSessions[0].id, replacedSession, 'Recovery must create a new session instead of reusing another account identity');
  const silentRequest = authorization({ prompt: 'none' });
  await redeemCallback((await followBrowser(unrelatedBrowser, await browserRequest(unrelatedBrowser, silentRequest.url))).callback, silentRequest, accounts.a);
  // Keep the successful session alive through an ordinary refresh; no synthetic token is logged.
  const refreshed = await fetch(`${base}/realms/mossvale/protocol/openid-connect/token`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token',
      client_id: env.KEYCLOAK_CLIENT_ID, refresh_token: accountBTokens.refresh_token }) });
  assert.equal(refreshed.status, 200);
  console.log('PASS: real Keycloak account-switch recovery preserves state/nonce/PKCE, revokes only this browser session, and leaves protected reauthentication unchanged.');

  await admin('/mossvale/users', 'POST', { username: 'apple-deletion-fixture', enabled: true });
  const user = (await admin('/mossvale/users?username=apple-deletion-fixture&exact=true'))[0];
  await admin(`/mossvale/users/${user.id}/federated-identity/apple`, 'POST', { userId: 'apple-fixture', userName: 'apple-fixture' });
  const dbPort = docker('port', database, '5432/tcp').split(':').at(-1);
  pool = new pg.Pool({ host: '127.0.0.1', port: Number(dbPort), database: 'keycloak', user: 'fixture', password });
  const stored = JSON.stringify({ refresh_token: 'isolated-revocable-token' });
  await pool.query('UPDATE federated_identity SET token = $1 WHERE user_id = $2', [stored, user.id]);
  await admin('/mossvale/clear-user-cache', 'POST');
  // Runtime signing credentials intentionally absent: must fail before any network I/O and keep identity.
  await admin(`/mossvale/users/${user.id}`, 'DELETE', undefined, [500]);
  assert.equal((await admin(`/mossvale/users/${user.id}`)).id, user.id, 'Failed Apple revoke must roll back Admin deletion');
  await admin(`/mossvale/users/${user.id}/federated-identity/apple`, 'DELETE', undefined, [500]);
  assert.equal((await admin(`/mossvale/users/${user.id}/federated-identity`)).length, 1, 'Failed Apple revoke must roll back unlink');
  await pool.query('UPDATE federated_identity SET token = NULL WHERE user_id = $1', [user.id]);
  await admin('/mossvale/clear-user-cache', 'POST');
  await admin(`/mossvale/users/${user.id}`, 'DELETE');
  await admin(`/mossvale/users/${user.id}`, 'GET', undefined, [404]);
  console.log('PASS: compiled Apple SPI + signatures/POST/revocation; real Keycloak safe Google/Apple config, exact redirects/PKCE, drift rejection, and transactional account deletion/unlink rollback. Missing historic tokens permit deletion. No live provider or user was contacted.');
} catch (error) {
  try { console.error(docker('logs', auth).replaceAll(password, '<fixture-secret>').slice(-8000)); } catch {}
  throw error;
} finally {
  await pool?.end();
  for (const name of [auth, database, copy]) { try { docker('rm', '-f', name); } catch {} }
  try { docker('network', 'rm', network); } catch {}
  try { docker('image', 'rm', image); } catch {}
  rmSync(directory, { recursive: true, force: true });
}
