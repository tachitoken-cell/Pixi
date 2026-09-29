import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { generateKeyPair, exportJWK, createLocalJWKSet, jwtVerify } from 'jose';
import { Wallet } from 'ethers';
import { createWalletOidc } from '../src/wallet-oidc.mjs';
import { createGameServer } from '../server.mjs';
import { createHostingConfig } from '../src/hosting-realms.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-wallet-oidc-')), realNow = Date.now;
const { privateKey } = await generateKeyPair('RS256', { extractable: true });
const privateJwk = { ...await exportJWK(privateKey), kid: 'isolated-wallet-key', alg: 'RS256', use: 'sig' };
const keycloak = { url: 'https://identity.mossvale.invalid', realm: 'mossvale', clientId: 'game-browser' };
const env = { WALLET_OIDC_ENABLED: 'true', APP_ORIGIN: 'https://mossvale.invalid', WALLET_OIDC_CHAIN_ID: '46630',
  WALLET_OIDC_CLIENT_ID: 'keycloak-wallet', WALLET_OIDC_CLIENT_SECRET: randomBytes(32).toString('base64url'), WALLET_OIDC_PRIVATE_JWK: JSON.stringify(privateJwk),
  WALLET_OIDC_REDIRECT_URI: `${keycloak.url}/realms/mossvale/broker/mossvale-wallet/endpoint` };
const issuer = `${env.APP_ORIGIN}/wallet-oidc`, wallet = Wallet.createRandom(), wrongWallet = Wallet.createRandom();
let game, base, offset = 0;
Date.now = () => realNow() + offset;
async function start(config = env, identity = keycloak) {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: identity, databaseUrl: '', walletOidc: { env: config } });
  base = `http://127.0.0.1:${await game.start()}`;
}
async function stop() { await game?.stop(); game = null; }
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { redirect: 'manual', ...options });
  const text = await response.text();
  return { response, status: response.status, body: text ? JSON.parse(text) : null };
}
async function authorize(extra = {}) {
  const query = new URLSearchParams({ client_id: env.WALLET_OIDC_CLIENT_ID, redirect_uri: env.WALLET_OIDC_REDIRECT_URI,
    response_type: 'code', scope: 'openid profile', state: randomBytes(18).toString('base64url'), nonce: randomBytes(18).toString('base64url'), ...extra });
  const result = await request(`/wallet-oidc/authorize?${query}`);
  if (result.status !== 302) return result;
  const target = new URL(result.response.headers.get('location')), cookie = result.response.headers.get('set-cookie');
  return { ...result, query, transaction: target.searchParams.get('transaction'), cookie: cookie?.split(';')[0], target, rawCookie: cookie };
}
const post = (endpoint, transaction, body, headers = {}) => request(`/wallet-oidc/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.APP_ORIGIN, Cookie: transaction.cookie, ...headers }, body: JSON.stringify({ transaction: transaction.transaction, ...body }) });
async function signFlow(extra = {}, chosen = wallet) {
  const transaction = await authorize(extra); assert.equal(transaction.status, 302);
  const challenge = await post('challenge', transaction, { address: chosen.address }); assert.equal(challenge.status, 200);
  const signature = await chosen.signMessage(challenge.body.message), verified = await post('verify', transaction, { signature }); assert.equal(verified.status, 200);
  const redirect = new URL(verified.body.redirectUrl);
  assert.equal(`${redirect.origin}${redirect.pathname}`, env.WALLET_OIDC_REDIRECT_URI);
  assert.equal(redirect.searchParams.get('state'), transaction.query.get('state')); assert.equal(redirect.searchParams.get('iss'), issuer);
  return { transaction, challenge, signature, redirect, code: redirect.searchParams.get('code') };
}
const basic = (id = env.WALLET_OIDC_CLIENT_ID, secret = env.WALLET_OIDC_CLIENT_SECRET) => `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64')}`;
const exchange = (code, extra = {}, authorization = basic()) => request('/wallet-oidc/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(authorization ? { Authorization: authorization } : {}) },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env.WALLET_OIDC_REDIRECT_URI, ...extra }) });
const userinfo = token => request('/wallet-oidc/userinfo', { headers: { Authorization: `Bearer ${token}` } });
const mobile = (endpoint, body, headers = {}) => request(`/wallet-oidc/mobile/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const mobileState = () => randomBytes(32).toString('base64url');
const mobileCallback = (state, extra = {}) => `https://mossvale.world/mobile-auth/callback#${new URLSearchParams({ state, iss: `${keycloak.url}/realms/${keycloak.realm}`, code: 'isolated-keycloak-code', ...extra })}`;
try {
  assert.equal(createWalletOidc({ env: {} }).enabled, false);
  for (const changed of [{ APP_ORIGIN: 'http://mossvale.invalid' }, { APP_ORIGIN: `${env.APP_ORIGIN}/` }, { WALLET_OIDC_REDIRECT_URI: 'https://evil.invalid/callback' },
    { WALLET_OIDC_CLIENT_SECRET: 'weak' }, { WALLET_OIDC_PRIVATE_JWK: JSON.stringify({ ...privateJwk, d: undefined }) }, { WALLET_OIDC_CHAIN_ID: 'NaN' }]) {
    assert.throws(() => createWalletOidc({ keycloak, env: { ...env, ...changed } }), /Wallet OIDC requires/);
  }
  await start({}, null);
  assert.deepEqual((await request('/api/config')).body, { keycloak: null, ...createHostingConfig(), mobilePurchases: { apple: false, google: false } });
  for (const endpoint of ['.well-known/openid-configuration', 'jwks', 'authorize', 'token', 'userinfo', 'challenge', 'verify', 'cancel', 'mobile/start', 'mobile/result', 'mobile/complete']) assert.equal((await request(`/wallet-oidc/${endpoint}`)).status, 404);
  await stop(); await start();
  const config = await request('/api/config'); assert.deepEqual(config.body.walletBroker, { enabled: true, provider: 'mossvale-wallet', chainId: 46630 });
  assert(!JSON.stringify(config.body).includes(env.WALLET_OIDC_CLIENT_SECRET)); assert(!JSON.stringify(config.body).includes(privateJwk.d));
  const discovery = await request('/wallet-oidc/.well-known/openid-configuration'), keys = await request('/wallet-oidc/jwks');
  assert.equal(discovery.body.issuer, issuer); assert.equal(discovery.body.authorization_endpoint, `${issuer}/authorize`); assert.equal(discovery.body.token_endpoint, `${issuer}/token`);
  assert.deepEqual(discovery.body.code_challenge_methods_supported, ['S256']); assert.deepEqual(discovery.body.response_types_supported, ['code']);
  assert.deepEqual(Object.keys(keys.body.keys[0]).sort(), ['alg', 'e', 'kid', 'kty', 'n', 'use']); const jwks = createLocalJWKSet(keys.body);
  for (const change of [{ redirect_uri: 'https://evil.invalid/callback' }, { redirect_uri: `${env.WALLET_OIDC_REDIRECT_URI}?extra=1` }, { client_id: 'other-client' }, { response_type: 'token' }, { state: '' },
    { state: 'x'.repeat(513) }, { nonce: 'x'.repeat(257) }, { scope: 'openid email' }, { code_challenge: 'x'.repeat(43), code_challenge_method: 'plain' }]) assert.equal((await authorize(change)).status, 400);
  const silent = await authorize({ prompt: 'none' }); assert.equal(silent.status, 302); assert.equal(silent.target.searchParams.get('error'), 'login_required');
  assert.equal(silent.transaction, null); assert.equal(silent.cookie, undefined);
  const tx = await authorize(); assert.equal(tx.target.origin, env.APP_ORIGIN); assert.equal(tx.target.pathname, '/wallet-login.html');
  assert.match(tx.transaction, /^[A-Za-z0-9_-]{43}$/); for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert(tx.rawCookie.includes(attribute));
  assert(tx.rawCookie.startsWith('__Host-')); assert(!tx.rawCookie.includes('Domain='));
  assert.equal((await post('challenge', tx, { address: wallet.address }, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await post('challenge', tx, { address: wallet.address }, { Origin: 'null' })).status, 403);
  assert.equal((await post('challenge', tx, { address: wallet.address }, { Cookie: '__Host-mossvale-wallet-tx=wrong' })).status, 400);
  assert.equal((await post('challenge', tx, { address: wallet.address, chainId: 1 })).status, 400);
  assert.equal((await post('challenge', tx, { address: '0x0000000000000000000000000000000000000000' })).status, 400);
  const challenge = await post('challenge', tx, { address: wallet.address }); assert.equal(challenge.status, 200); assert.equal(challenge.body.chainId, 46630);
  assert(challenge.body.message.startsWith(`mossvale.invalid wants you to sign in with your Ethereum account:\n${wallet.address}`));
  assert.match(challenge.body.message, /URI: https:\/\/mossvale.invalid\/wallet-login.html\nVersion: 1\nChain ID: 46630\nNonce: [a-f0-9]{32}\nIssued At:/);
  assert.equal(challenge.response.headers.get('cache-control'), 'no-store');
  const wrongSignature = await wrongWallet.signMessage(challenge.body.message);
  assert.equal((await post('verify', tx, { signature: wrongSignature })).status, 400);
  assert.equal((await post('verify', tx, { signature: await wallet.signMessage(challenge.body.message) })).status, 400, 'a failed verification consumes the challenge');
  for (const mutate of [s => s.replace('mossvale.invalid wants', 'evil.invalid wants'), s => s.replace('Chain ID: 46630', 'Chain ID: 1'), s => s.replace(/Nonce: [a-f0-9]+/, 'Nonce: 12345678'), s => s.replace('URI: https:', 'URI: http:'),
    s => s.replace(/Issued At: [^\n]+/, 'Issued At: 2000-01-01T00:00:00.000Z'), s => s.replace(/Expiration Time: [^\n]+/, 'Expiration Time: 2099-01-01T00:00:00.000Z')]) {
    const next = await post('challenge', tx, { address: wallet.address });
    assert.equal((await post('verify', tx, { signature: await wallet.signMessage(mutate(next.body.message)) })).status, 400);
  }
  const fresh = await post('challenge', tx, { address: wallet.address }), signature = await wallet.signMessage(fresh.body.message);
  assert.equal((await post('verify', tx, { signature }, { Origin: 'https://evil.invalid' })).status, 403);
  const otherBrowser = await authorize();
  assert.equal((await post('verify', { ...tx, cookie: otherBrowser.cookie }, { signature })).status, 400, 'another authorization browser cannot consume this signature');
  const raced = await Promise.all([post('verify', tx, { signature }), post('verify', tx, { signature })]); assert.deepEqual(raced.map(r => r.status).sort(), [200, 400]);
  const firstCode = new URL(raced.find(r => r.status === 200).body.redirectUrl).searchParams.get('code');
  assert.equal((await exchange(firstCode, {}, basic('wrong-client'))).status, 401);
  assert.equal((await exchange(firstCode, {}, basic(env.WALLET_OIDC_CLIENT_ID, 'wrong-secret'))).status, 401);
  const tokens = await exchange(firstCode); assert.equal(tokens.status, 200); assert.equal(tokens.body.token_type, 'Bearer'); assert.equal(tokens.body.expires_in, 120);
  const verified = await jwtVerify(tokens.body.id_token, jwks, { issuer, audience: env.WALLET_OIDC_CLIENT_ID, currentDate: new Date(Date.now()) });
  assert.equal(verified.payload.nonce, tx.query.get('nonce')); assert.equal(verified.payload.sub, `eip155:46630:${wallet.address.toLowerCase()}`);
  assert.equal(verified.payload.preferred_username, `wallet-${wallet.address.toLowerCase()}`);
  for (const claim of ['email', 'email_verified', 'roles', 'realm_access', 'resource_access']) assert.equal(verified.payload[claim], undefined);
  await assert.rejects(jwtVerify(tokens.body.id_token, jwks, { issuer, audience: 'other-client' }), /aud/);
  assert.equal((await exchange(firstCode)).status, 400, 'authorization codes are one-use');
  assert.deepEqual((await userinfo(tokens.body.access_token)).body, { sub: verified.payload.sub, preferred_username: verified.payload.preferred_username });
  assert.equal((await request('/wallet-oidc/userinfo', { method: 'POST', headers: { Authorization: `Bearer ${tokens.body.access_token}` } })).body.sub, verified.payload.sub);
  assert.equal((await request('/wallet-oidc/userinfo', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ access_token: tokens.body.access_token }) })).body.sub, verified.payload.sub);
  assert.equal((await userinfo(tokens.body.id_token)).status, 401, 'ID tokens are not userinfo bearer tokens');
  const verifier = randomBytes(32).toString('base64url'), pkce = { code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' };
  const proof = await signFlow(pkce); const exchanged = await Promise.all([exchange(proof.code, { code_verifier: verifier }), exchange(proof.code, { code_verifier: verifier })]);
  assert.deepEqual(exchanged.map(r => r.status).sort(), [200, 400]);
  assert.equal((await exchange((await signFlow(pkce)).code)).status, 400); assert.equal((await exchange((await signFlow(pkce)).code, { code_verifier: 'a'.repeat(43) })).status, 400);
  assert.equal((await exchange((await signFlow()).code, { redirect_uri: 'https://evil.invalid/' })).status, 400);
  const postAuth = await exchange((await signFlow()).code, { client_id: env.WALLET_OIDC_CLIENT_ID, client_secret: env.WALLET_OIDC_CLIENT_SECRET }, null); assert.equal(postAuth.status, 200);
  assert.equal((await exchange((await signFlow()).code, { client_id: env.WALLET_OIDC_CLIENT_ID, client_secret: env.WALLET_OIDC_CLIENT_SECRET })).status, 401, 'mixed client authentication is rejected');
  const expiredCode = await signFlow(); offset += 60001; assert.equal((await exchange(expiredCode.code)).status, 400);
  const expiringChallenge = await authorize(), expiring = await post('challenge', expiringChallenge, { address: wallet.address }); offset += 120001;
  assert.equal((await post('verify', expiringChallenge, { signature: await wallet.signMessage(expiring.body.message) })).status, 400);
  assert.equal((await userinfo(tokens.body.access_token)).status, 401); offset += 300001;
  assert.equal((await post('challenge', expiringChallenge, { address: wallet.address })).status, 400);
  const cancel = await authorize(), cancelled = await post('cancel', cancel, {}); assert.equal(cancelled.status, 200);
  const cancelledRedirect = new URL(cancelled.body.redirectUrl); assert.equal(cancelledRedirect.searchParams.get('error'), 'access_denied'); assert.equal(cancelledRedirect.searchParams.get('state'), cancel.query.get('state'));
  assert.equal((await post('challenge', cancel, { address: wallet.address })).status, 400);
  const restartCode = await signFlow(), restartChallenge = await authorize();
  await stop(); await start();
  assert.deepEqual((await request('/wallet-oidc/jwks')).body, keys.body, 'configured signing key is stable across restart');
  assert.equal((await exchange(restartCode.code)).status, 400); assert.equal((await post('challenge', restartChallenge, { address: wallet.address })).status, 400);
  const afterRestart = await exchange((await signFlow()).code); const restored = await jwtVerify(afterRestart.body.id_token, jwks, { issuer, audience: env.WALLET_OIDC_CLIENT_ID, currentDate: new Date(Date.now()) });
  assert.equal(restored.payload.sub, verified.payload.sub, 'wallet identity remains stable across new browser sessions and restart');
  assert.equal(existsSync(join(dir, 'players.json')), false, 'wallet broker does not create or alter game accounts');
  const oversized = await request('/wallet-oidc/challenge', { method: 'POST', headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(9000) }) }); assert.equal(oversized.status, 413);
  const retryLimit = await authorize();
  for (let i = 0; i < 24; i++) assert.equal((await post('challenge', retryLimit, { address: wallet.address })).status, 200);
  assert.equal((await post('challenge', retryLimit, { address: wallet.address })).status, 429, 'proof retries have a per-browser transaction limit');
  let limited = false; for (let i = 0; i < 302; i++) { const result = await authorize(); if (result.status === 429) { limited = true; break; } } assert(limited, 'authorization admission is rate-limited');
  assert.equal((await request('/wallet-oidc/jwks')).status, 200, 'client key discovery remains available during admission throttling');
  offset += 60001; assert.equal((await authorize()).status, 302, 'expired rate buckets recover');
  const mobileOrigin = { Origin: 'https://mossvale.world' }, mobileAlias = { Origin: 'https://us.mossvale.world' }, mobileAsia = { Origin: 'https://asia.mossvale.world' };
  for (const state of ['', 'x'.repeat(19), 'x'.repeat(257), 'contains spaces in state', 123456789012345678901]) assert.equal((await mobile('start', { state })).status, 400);
  assert.equal((await mobile('start', { state: mobileState(), token: 'not-client-chosen' })).status, 400);
  for (const Origin of ['https://evil.invalid', 'null', 'https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world']) {
    const denied = await mobile('start', { state: mobileState() }, { Origin }); assert.equal(denied.status, 403); assert.equal(denied.response.headers.get('access-control-allow-origin'), null);
  }
  const state = mobileState(), registered = await mobile('start', { state }); assert.equal(registered.status, 200);
  assert.deepEqual(Object.keys(registered.body), ['token']); assert.match(registered.body.token, /^[A-Za-z0-9_-]{43}$/); assert.equal(registered.response.headers.get('cache-control'), 'no-store');
  const retrieval = { state, token: registered.body.token }, callback = mobileCallback(state);
  assert.equal((await mobile('start', { state })).status, 409, 'duplicate registration cannot replace or expose the retrieval secret');
  const pending = await mobile('result', retrieval); assert.deepEqual(pending.body, { callback: null }); assert.equal(pending.response.headers.get('access-control-allow-origin'), null);
  assert.equal((await mobile('result', retrieval)).status, 429, 'polling is limited per handoff'); offset += 1001;
  assert.equal((await mobile('result', { ...retrieval, token: mobileState() })).status, 400);
  assert.equal((await mobile('result', { ...retrieval, token: registered.body.token.slice(1) })).status, 400);
  assert.equal((await mobile('result', retrieval, mobileOrigin)).status, 403, 'browser origins cannot retrieve a native completion');
  assert.equal((await mobile('result', retrieval, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await mobile('complete', { callback })).status, 403, 'completion requires a trusted website Origin');
  for (const Origin of ['https://evil.invalid', 'https://mossvale.world.evil.invalid', 'https://asia.mossvale.world.evil.invalid', 'https://asia.mossvale.world:8443', 'http://asia.mossvale.world', 'null']) {
    const denied = await mobile('complete', { callback }, { Origin }); assert.equal(denied.status, 403); assert.equal(denied.response.headers.get('access-control-allow-origin'), null);
  }
  for (const headers of [mobileOrigin, mobileAlias, mobileAsia]) {
    const preflight = await request('/wallet-oidc/mobile/complete', { method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.response.headers.get('access-control-allow-origin'), headers.Origin); assert.equal(preflight.response.headers.get('access-control-allow-credentials'), null);
  }
  assert.equal((await request('/wallet-oidc/mobile/complete', { method: 'OPTIONS', headers: { ...mobileAlias, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' } })).status, 403);
  assert.equal((await request('/wallet-oidc/mobile/result', { method: 'OPTIONS', headers: mobileAlias })).status, 403);
  assert.equal((await mobile('complete', { callback, token: registered.body.token }, mobileOrigin)).status, 400, 'the browser never sends the retrieval secret');
  for (const invalid of [callback.replace('https:', 'http:'), callback.replace('https://mossvale.world', 'mossvale://auth'), callback.replace('mossvale.world/', 'us.mossvale.world/'), callback.replace('mossvale.world/', 'asia.mossvale.world/'),
    callback.replace('/mobile-auth/callback#', '/mobile-auth/callback?query=1#'), callback.replace('/mobile-auth/callback#', '/wrong/../mobile-auth/callback#'),
    callback.replace('https://mossvale.world', 'https://user@mossvale.world'), `${callback}&state=${state}`, `${callback}&code=second`, `${callback}&access_token=bearer`, `${callback}&id_token=jwt`,
    mobileCallback(state, { error: 'access_denied' }), mobileCallback(state, { code: '' }), mobileCallback(state, { iss: 'https://evil.invalid/realms/mossvale' }),
    mobileCallback(mobileState()), callback.replace(/&iss=[^&]*/, ''), mobileCallback(state, { session_state: 'bad\u0000value' })]) {
    const rejected = await mobile('complete', { callback: invalid }, mobileOrigin); assert.equal(rejected.status, 400); assert.equal(rejected.response.headers.get('access-control-allow-origin'), mobileOrigin.Origin);
  }
  assert.deepEqual((await mobile('result', retrieval)).body, { callback: null }, 'invalid completions cannot replace the pending response'); offset += 1001;
  const completeRace = await Promise.all([mobile('complete', { callback }, mobileAlias), mobile('complete', { callback }, mobileOrigin), mobile('complete', { callback }, mobileAsia)]);
  assert.deepEqual(completeRace.map(r => r.status), [200, 200, 200]); assert.deepEqual(completeRace[0].body, { ok: true }); assert(!JSON.stringify(completeRace).includes(registered.body.token));
  assert.deepEqual((await mobile('result', retrieval)).body, { callback }); offset += 1001;
  assert.deepEqual((await mobile('result', retrieval)).body, { callback }, 'a lost successful response can be retrieved again');
  assert.equal((await mobile('complete', { callback: mobileCallback(state, { code: 'different-code' }) }, mobileOrigin)).status, 409);
  offset += 30000; assert.equal((await mobile('complete', { callback }, mobileOrigin)).status, 200); offset += 30001;
  assert.equal((await mobile('result', retrieval)).status, 400, 'identical completion retries do not extend the one-minute code lifetime');
  assert.equal((await mobile('complete', { callback }, mobileOrigin)).status, 400);
  const conflictState = mobileState(); await mobile('start', { state: conflictState });
  const conflicts = await Promise.all(['code-a', 'code-b'].map(code => mobile('complete', { callback: mobileCallback(conflictState, { code }) }, mobileOrigin)));
  assert.deepEqual(conflicts.map(r => r.status).sort(), [200, 409], 'only the first conflicting response wins');
  const errorState = mobileState(), errorStart = await mobile('start', { state: errorState });
  const errorCallback = `https://mossvale.world/mobile-auth/callback#${new URLSearchParams({ state: errorState, iss: `${keycloak.url}/realms/${keycloak.realm}`, error: 'access_denied', error_description: 'Cancelled by user' })}`;
  assert.equal((await mobile('complete', { callback: errorCallback }, mobileAlias)).status, 200);
  assert.deepEqual((await mobile('result', { state: errorState, token: errorStart.body.token })).body, { callback: errorCallback });
  const expiresState = mobileState(), expiresStart = await mobile('start', { state: expiresState }); offset += 600001;
  assert.equal((await mobile('result', { state: expiresState, token: expiresStart.body.token })).status, 400, 'uncompleted registrations expire after ten minutes');
  assert.equal((await mobile('complete', { callback: mobileCallback(expiresState) }, mobileOrigin)).status, 400);
  const restartState = mobileState(), restartStart = await mobile('start', { state: restartState }); await stop(); await start();
  assert.equal((await mobile('result', { state: restartState, token: restartStart.body.token })).status, 400, 'restarting destroys handoffs');
  const independentState = mobileState(), independent = await mobile('start', { state: independentState });
  for (let i = 0; i < 601; i++) await mobile('result', { state: independentState, token: 'invalid' });
  assert.equal((await mobile('result', { state: independentState, token: 'invalid' })).status, 429, 'invalid retrieval secrets are admission-limited');
  assert.deepEqual((await mobile('result', { state: independentState, token: independent.body.token })).body, { callback: null }, 'invalid polling cannot exhaust the shared proxy bucket for valid handoffs');
  await stop(); await start();
  for (let i = 0; i < 1024; i++) {
    if (i && i % 500 === 0) offset += 60001;
    assert.equal((await mobile('start', { state: mobileState() })).status, 200);
  }
  assert.equal((await mobile('start', { state: mobileState() })).status, 503, 'handoff memory is bounded');
  offset += 600001; assert.equal((await mobile('start', { state: mobileState() })).status, 200, 'expired handoffs free capacity');
  console.log('PASS mobile wallet handoffs: native retrieval secret, exact CORS and HTTPS callback/issuer, duplicate/conflicting completion races, retryable retrieval, per-handoff polling, expiry, bounded capacity and restart cleanup.');
  console.log('PASS wallet OIDC: disabled discovery, static signing key/config, exact redirect and browser/Origin binding, issued SIWE proof/tamper/expiry, single-use signatures and codes, confidential client and S256 PKCE, JWT issuer/audience/nonce, private role-free identity, bounded admission/body, cancellation and restart invalidation; game accounts untouched.');
} finally { Date.now = realNow; await stop(); rmSync(dir, { recursive: true, force: true }); }
