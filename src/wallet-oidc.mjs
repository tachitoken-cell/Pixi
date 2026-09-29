import { createHash, createPrivateKey, createPublicKey, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT } from 'jose';
import { getAddress, verifyMessage } from 'ethers';

const PREFIX = '/wallet-oidc', PROVIDER = 'mossvale-wallet', COOKIE = '__Host-mossvale-wallet-tx';
const ENDPOINTS = new Set(['/.well-known/openid-configuration', '/jwks', '/authorize', '/challenge', '/verify', '/cancel', '/token', '/userinfo', '/mobile/start', '/mobile/complete', '/mobile/result']);
const TRANSACTION_MS = 300000, CHALLENGE_MS = 120000, CODE_MS = 60000, TOKEN_MS = 120000, MAX_PENDING = 1024;
const MOBILE_MS = 600000, MOBILE_CALLBACK = 'https://mossvale.world/mobile-auth/callback';
const MOBILE_ORIGINS = new Set(['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world']);
const opaque = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest();
const equal = (left, right) => typeof left === 'string' && typeof right === 'string' && timingSafeEqual(digest(left), digest(right));
const bounded = (value, max = 512) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x20\x7f]/.test(value);
const error = (status, code, message) => Object.assign(new Error(message), { status, code });
const json = (res, status, body, headers = {}) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff', ...headers }).end(JSON.stringify(body));
function fields(value, required, optional = []) {
  return value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function parameters(search) {
  const result = {};
  for (const [key, value] of search) {
    if (Object.hasOwn(result, key)) throw error(400, 'invalid_request', 'Duplicate request parameter.');
    Object.defineProperty(result, key, { value, enumerable: true });
  }
  return result;
}
async function readBody(req, type) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== type) throw error(415, 'invalid_request', 'Unsupported request format.');
  if (req.headers['content-encoding'] || Number(req.headers['content-length']) > 8192) throw error(413, 'invalid_request', 'Request body is too large.');
  const chunks = []; let size = 0;
  const timeout = setTimeout(() => req.destroy(), 5000);
  try {
    for await (const chunk of req) {
      size += chunk.length; if (size > 8192) throw error(413, 'invalid_request', 'Request body is too large.'); chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    try { return type === 'application/json' ? JSON.parse(body) : parameters(new URLSearchParams(body)); }
    catch (cause) { if (cause.status) throw cause; throw error(400, 'invalid_request', 'Invalid request body.'); }
  } finally { clearTimeout(timeout); }
}

/** Small, single-process confidential OIDC provider. Keycloak alone maps wallets to game identities. */
export function createWalletOidc({ keycloak, env = process.env } = {}) {
  const enabled = env.WALLET_OIDC_ENABLED === 'true';
  if (!enabled) return { enabled: false, hint: undefined, close() {}, async handle(req, res) { json(res, 404, { error: 'not_found' }); } };
  let origin, redirect, privateKey, publicJwk, chainId, clientId, secret;
  try {
    origin = new URL(env.APP_ORIGIN);
    if (origin.origin !== env.APP_ORIGIN || origin.protocol !== 'https:' || origin.username || origin.password) throw Error();
    if (!keycloak?.url || !keycloak.realm) throw Error();
    redirect = `${keycloak.url.replace(/\/+$/, '')}/realms/${encodeURIComponent(keycloak.realm)}/broker/${PROVIDER}/endpoint`;
    if (env.WALLET_OIDC_REDIRECT_URI !== redirect || new URL(redirect).protocol !== 'https:') throw Error();
    chainId = Number(env.WALLET_OIDC_CHAIN_ID);
    if (!/^[1-9]\d{0,9}$/.test(env.WALLET_OIDC_CHAIN_ID ?? '') || !Number.isSafeInteger(chainId)) throw Error();
    clientId = env.WALLET_OIDC_CLIENT_ID; secret = env.WALLET_OIDC_CLIENT_SECRET;
    if (!bounded(clientId, 128) || !/^[\x21-\x7e]{32,256}$/.test(secret ?? '')) throw Error();
    const jwk = JSON.parse(env.WALLET_OIDC_PRIVATE_JWK);
    if (jwk.kty !== 'RSA' || !bounded(jwk.kid, 128) || !jwk.d || jwk.alg && jwk.alg !== 'RS256' || jwk.use && jwk.use !== 'sig') throw Error();
    privateKey = createPrivateKey({ key: jwk, format: 'jwk' });
    if (privateKey.asymmetricKeyDetails?.modulusLength < 2048) throw Error();
    publicJwk = { ...createPublicKey(privateKey).export({ format: 'jwk' }), kid: jwk.kid, alg: 'RS256', use: 'sig' };
  } catch { throw Error('Wallet OIDC requires an HTTPS APP_ORIGIN, exact Keycloak broker redirect, chain, confidential client and static RSA signing key.'); }
  // ponytail: handoffs use this realm process; use a shared store before adding EU replicas.
  const issuer = `${origin.origin}${PREFIX}`, transactions = new Map(), codes = new Map(), tokens = new Map(), rates = new Map(), handoffs = new Map();
  const keycloakIssuer = `${keycloak.url.replace(/\/+$/, '')}/realms/${encodeURIComponent(keycloak.realm)}`;
  let closed = false;
  const cookie = value => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${value ? TRANSACTION_MS / 1000 : 0}`;
  function prune(now) {
    for (const map of [transactions, codes, tokens, rates, handoffs]) for (const [key, value] of map) if (value.expiresAt <= now) map.delete(key);
  }
  function rate(req, endpoint, now) {
    // The socket may be a shared ingress proxy. Do not trust forwarded headers;
    // keep admission generous and limit browser proof attempts separately below.
    const key = `${req.socket.remoteAddress}|${endpoint}`, limit = endpoint === '/userinfo' ? 1200 : endpoint === '/authorize' ? 300 : 600;
    let bucket = rates.get(key);
    if (!bucket) {
      if (rates.size >= MAX_PENDING) throw error(429, 'slow_down', 'Please try again shortly.');
      rates.set(key, bucket = { count: 0, expiresAt: now + 60000 });
    }
    if (++bucket.count > limit) throw error(429, 'slow_down', 'Please try again shortly.');
  }
  function browserTransaction(req, body, now) {
    if (req.headers.origin !== origin.origin) throw error(403, 'access_denied', 'Sign in from the Mossvale window.');
    const matches = (req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE}=`));
    const transaction = typeof body.transaction === 'string' && transactions.get(body.transaction);
    if (matches.length !== 1 || !transaction || transaction.expiresAt <= now || !equal(matches[0].slice(COOKIE.length + 1), transaction.browser)) {
      throw error(400, 'invalid_request', 'This wallet sign-in expired. Start again.');
    }
    if (++transaction.attempts > 24) throw error(429, 'slow_down', 'Start a new wallet sign-in to try again.');
    return transaction;
  }
  const claims = address => ({ sub: `eip155:${chainId}:${address.toLowerCase()}`, preferred_username: `wallet-${address.toLowerCase()}` });
  const discovery = { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo`, jwks_uri: `${issuer}/jwks`,
    response_types_supported: ['code'], response_modes_supported: ['query'], grant_types_supported: ['authorization_code'], subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    scopes_supported: ['openid', 'profile'], claims_supported: ['sub', 'iss', 'aud', 'iat', 'exp', 'nonce', 'auth_time', 'preferred_username'], code_challenge_methods_supported: ['S256'], authorization_response_iss_parameter_supported: true };
  async function handle(req, res) {
    let untrustedPoll = false;
    try {
      if (closed) throw error(503, 'temporarily_unavailable', 'The realm is restarting. Start sign-in again shortly.');
      if ((req.url?.length ?? 0) > 4096) throw error(414, 'invalid_request', 'Request URL is too long.');
      const url = new URL(req.url, origin), endpoint = url.pathname.slice(PREFIX.length), now = Date.now(); prune(now);
      untrustedPoll = endpoint === '/mobile/result';
      if (!ENDPOINTS.has(endpoint)) throw error(404, 'not_found', 'Endpoint not found.');
      if (endpoint === '/.well-known/openid-configuration' && req.method === 'GET') { json(res, 200, discovery); return; }
      if (endpoint === '/jwks' && req.method === 'GET') { json(res, 200, { keys: [publicJwk] }); return; }
      // Successful mobile polling is limited per secret, not per shared ingress IP.
      if (endpoint !== '/mobile/result') rate(req, endpoint, now);
      if (endpoint.startsWith('/mobile/')) {
        if (url.search || url.hash) throw error(400, 'invalid_request', 'Invalid mobile sign-in request.');
        if (endpoint === '/mobile/complete') {
          if (!MOBILE_ORIGINS.has(req.headers.origin)) throw error(403, 'access_denied', 'Return from the Mossvale sign-in page.');
          res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
          res.setHeader('Vary', 'Origin');
          if (req.method === 'OPTIONS') {
            if (req.headers['access-control-request-method'] !== 'POST'
                || (req.headers['access-control-request-headers'] || '').toLowerCase().split(',').some(header => header.trim() && header.trim() !== 'content-type')) {
              throw error(403, 'access_denied', 'Invalid sign-in preflight.');
            }
            res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' }).end(); return;
          }
        } else if (req.headers.origin !== undefined) {
          throw error(403, 'access_denied', 'Start sign-in from the Mossvale app.');
        }
        if (req.method !== 'POST') throw error(405, 'invalid_request', 'Use a mobile sign-in POST request.');
        const body = await readBody(req, 'application/json'), current = Date.now();
        if (closed) throw error(503, 'temporarily_unavailable', 'The realm is restarting. Start sign-in again shortly.');
        const required = endpoint === '/mobile/start' ? ['state'] : endpoint === '/mobile/result' ? ['state', 'token'] : ['callback'];
        if (!fields(body, required) || endpoint !== '/mobile/complete' && (typeof body.state !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(body.state))) {
          throw error(400, 'invalid_request', 'Invalid mobile sign-in request.');
        }
        if (endpoint === '/mobile/start') {
          prune(current);
          const previous = handoffs.get(body.state);
          if (previous && previous.expiresAt > current) throw error(409, 'invalid_request', 'This sign-in has already started.');
          if (handoffs.size >= MAX_PENDING) throw error(503, 'temporarily_unavailable', 'Please try again shortly.');
          const token = opaque();
          handoffs.set(body.state, { token, callback: null, polls: 0, nextPollAt: 0, expiresAt: current + MOBILE_MS });
          json(res, 200, { token }); return;
        }
        if (endpoint === '/mobile/result') {
          const handoff = handoffs.get(body.state);
          if (!/^[A-Za-z0-9_-]{43}$/.test(body.token ?? '') || !handoff || handoff.expiresAt <= current || !equal(body.token, handoff.token)) {
            throw error(400, 'invalid_request', 'This wallet sign-in expired. Start again.');
          }
          untrustedPoll = false;
          if (current < handoff.nextPollAt || handoff.polls >= MOBILE_MS / 1000) throw error(429, 'slow_down', 'Please try again shortly.');
          handoff.nextPollAt = current + 1000; handoff.polls++;
          // Keep the response available briefly so a lost response can be retried.
          json(res, 200, { callback: handoff.callback }); return;
        }
        if (!bounded(body.callback, 8000) || !body.callback.startsWith(`${MOBILE_CALLBACK}#`)) throw error(400, 'invalid_request', 'Invalid sign-in response.');
        let callback;
        try { callback = new URL(body.callback); } catch { throw error(400, 'invalid_request', 'Invalid sign-in response.'); }
        const response = parameters(new URLSearchParams(callback.hash.slice(1)));
        if (callback.origin + callback.pathname !== MOBILE_CALLBACK || callback.search || callback.username || callback.password
            || !fields(response, ['state', 'iss'], ['code', 'error', 'session_state', 'kc_action_status', 'kc_action', 'error_description', 'error_uri'])
            || !/^[A-Za-z0-9_-]{20,256}$/.test(response.state) || response.iss !== keycloakIssuer
            || (Object.hasOwn(response, 'code') === Object.hasOwn(response, 'error'))
            || !bounded(response.code ?? response.error, 2048)
            || Object.values(response).some(value => value.length > 2048 || /[\x00-\x1f\x7f]/.test(value))) {
          throw error(400, 'invalid_request', 'Invalid sign-in response.');
        }
        const handoff = handoffs.get(response.state);
        if (!handoff || handoff.expiresAt <= current) throw error(400, 'invalid_request', 'This wallet sign-in expired. Start again.');
        if (handoff.callback && handoff.callback !== body.callback) throw error(409, 'invalid_request', 'This sign-in already has a response.');
        if (!handoff.callback) { handoff.callback = body.callback; handoff.expiresAt = Math.min(handoff.expiresAt, current + CODE_MS); }
        json(res, 200, { ok: true }); return;
      }
      if (endpoint === '/authorize' && req.method === 'GET') {
        const request = parameters(url.searchParams);
        if (!fields(request, ['client_id', 'redirect_uri', 'response_type', 'scope', 'state'], ['nonce', 'code_challenge', 'code_challenge_method', 'response_mode', 'prompt', 'login_hint', 'max_age'])
            || request.client_id !== clientId || request.redirect_uri !== redirect || request.response_type !== 'code' || !bounded(request.state)
            || !request.scope.split(' ').includes('openid') || request.scope.split(' ').some(scope => !['openid', 'profile'].includes(scope))
            || request.nonce !== undefined && !bounded(request.nonce, 256) || request.response_mode !== undefined && request.response_mode !== 'query'
            || request.prompt !== undefined && !['login', 'consent', 'select_account', 'none'].includes(request.prompt)
            || request.login_hint !== undefined && !bounded(request.login_hint, 256) || request.max_age !== undefined && !/^\d{1,6}$/.test(request.max_age)
            || (request.code_challenge !== undefined || request.code_challenge_method !== undefined) && (request.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(request.code_challenge ?? ''))) {
          throw error(400, 'invalid_request', 'Invalid wallet authorization request.');
        }
        if (request.prompt === 'none') {
          const target = new URL(redirect); target.searchParams.set('error', 'login_required'); target.searchParams.set('state', request.state); target.searchParams.set('iss', issuer);
          res.writeHead(302, { Location: target.href, 'Cache-Control': 'no-store' }).end(); return;
        }
        if (transactions.size >= MAX_PENDING) throw error(503, 'temporarily_unavailable', 'Please try again shortly.');
        const id = opaque(), browser = opaque(); transactions.set(id, { ...request, browser, attempts: 0, expiresAt: now + TRANSACTION_MS, challenge: null });
        res.writeHead(302, { Location: `${origin.origin}/wallet-login.html?transaction=${id}`, 'Set-Cookie': cookie(browser), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).end(); return;
      }
      if (['/challenge', '/verify', '/cancel'].includes(endpoint) && req.method === 'POST') {
        if (req.headers.origin !== origin.origin) throw error(403, 'access_denied', 'Sign in from the Mossvale window.');
        const body = await readBody(req, 'application/json');
        if (!fields(body, endpoint === '/challenge' ? ['transaction', 'address'] : endpoint === '/cancel' ? ['transaction'] : ['transaction', 'signature'])) throw error(400, 'invalid_request', 'Invalid wallet sign-in request.');
        const transaction = browserTransaction(req, body, Date.now());
        if (endpoint === '/cancel') {
          transactions.delete(body.transaction);
          const target = new URL(redirect); target.searchParams.set('error', 'access_denied'); target.searchParams.set('state', transaction.state); target.searchParams.set('iss', issuer);
          json(res, 200, { redirectUrl: target.href }, { 'Set-Cookie': cookie('') }); return;
        }
        if (endpoint === '/challenge') {
          let address; try { address = getAddress(body.address); if (/^0x0{40}$/i.test(address)) throw Error(); } catch { throw error(400, 'invalid_request', 'Choose a valid Ethereum wallet address.'); }
          const issuedAt = Date.now(), expiresAt = Math.min(transaction.expiresAt, issuedAt + CHALLENGE_MS), nonce = randomBytes(16).toString('hex');
          const message = `${origin.host} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Mossvale. This does not authorize a payment.\n\nURI: ${origin.origin}/wallet-login.html\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${new Date(issuedAt).toISOString()}\nExpiration Time: ${new Date(expiresAt).toISOString()}`;
          transaction.challenge = { message, address, expiresAt }; json(res, 200, { message, address, chainId, expiresAt }); return;
        }
        const challenge = transaction.challenge; transaction.challenge = null; // Consume before signature work or any async boundary.
        if (!challenge || challenge.expiresAt <= Date.now() || typeof body.signature !== 'string' || !/^0x[\da-f]{130}$/i.test(body.signature)) throw error(400, 'invalid_request', 'This signature request expired. Request a new one.');
        let recovered; try { recovered = verifyMessage(challenge.message, body.signature); } catch { throw error(400, 'access_denied', 'The wallet signature is invalid.'); }
        if (recovered !== challenge.address) throw error(400, 'access_denied', 'The wallet signature does not match this sign-in.');
        if (codes.size >= MAX_PENDING) throw error(503, 'temporarily_unavailable', 'Please try again shortly.');
        transactions.delete(body.transaction);
        const code = opaque(); codes.set(code, { ...transaction, ...claims(challenge.address), authTime: Math.floor(Date.now() / 1000), expiresAt: Date.now() + CODE_MS });
        const target = new URL(redirect); target.searchParams.set('code', code); target.searchParams.set('state', transaction.state); target.searchParams.set('iss', issuer);
        json(res, 200, { redirectUrl: target.href }, { 'Set-Cookie': cookie('') }); return;
      }
      if (endpoint === '/token' && req.method === 'POST') {
        const body = await readBody(req, 'application/x-www-form-urlencoded');
        if (!fields(body, ['grant_type', 'code', 'redirect_uri'], ['client_id', 'client_secret', 'code_verifier']) || body.grant_type !== 'authorization_code') throw error(400, 'invalid_request', 'Only authorization code exchange is supported.');
        let id = body.client_id, password = body.client_secret;
        if (req.headers.authorization) {
          if (id !== undefined || password !== undefined || !/^Basic [A-Za-z0-9+/]+=*$/.test(req.headers.authorization)) throw error(401, 'invalid_client', 'Client authentication failed.');
          try {
            const basic = Buffer.from(req.headers.authorization.slice(6), 'base64').toString('utf8'), separator = basic.indexOf(':');
            if (separator < 0) throw Error();
            const decode = value => decodeURIComponent(value.replace(/\+/g, ' ')); id = decode(basic.slice(0, separator)); password = decode(basic.slice(separator + 1));
          } catch { throw error(401, 'invalid_client', 'Client authentication failed.'); }
        }
        if (!equal(id, clientId) || !equal(password, secret)) throw error(401, 'invalid_client', 'Client authentication failed.');
        const code = codes.get(body.code); if (code) codes.delete(body.code); // One exchange, including concurrent requests.
        if (!code || code.expiresAt <= Date.now() || code.client_id !== id || body.redirect_uri !== redirect
            || code.code_challenge && (typeof body.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier)
              || !equal(digest(body.code_verifier).toString('base64url'), code.code_challenge))) throw error(400, 'invalid_grant', 'The authorization code is invalid or expired.');
        if (tokens.size >= MAX_PENDING) throw error(503, 'temporarily_unavailable', 'Please try again shortly.');
        const issuedAt = Math.floor(Date.now() / 1000), accessToken = opaque();
        tokens.set(accessToken, { sub: code.sub, preferred_username: code.preferred_username, expiresAt: Date.now() + TOKEN_MS });
        const idToken = await new SignJWT({ preferred_username: code.preferred_username, auth_time: code.authTime, ...(code.nonce ? { nonce: code.nonce } : {}) })
          .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' }).setIssuer(issuer).setAudience(clientId).setSubject(code.sub).setIssuedAt(issuedAt).setExpirationTime(issuedAt + TOKEN_MS / 1000).sign(privateKey);
        if (closed) { tokens.delete(accessToken); throw error(503, 'temporarily_unavailable', 'The realm is restarting. Start sign-in again shortly.'); }
        json(res, 200, { token_type: 'Bearer', access_token: accessToken, expires_in: TOKEN_MS / 1000, id_token: idToken, scope: code.scope }); return;
      }
      if (endpoint === '/userinfo' && ['GET', 'POST'].includes(req.method)) {
        let authorization = req.headers.authorization;
        if (req.method === 'POST' && (req.headers['transfer-encoding'] || Number(req.headers['content-length']) > 0)) {
          const body = await readBody(req, 'application/x-www-form-urlencoded');
          if (authorization || !fields(body, ['access_token'])) throw error(400, 'invalid_request', 'Use one bearer token authentication method.');
          authorization = `Bearer ${body.access_token}`;
        }
        const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization || ''), token = match && tokens.get(match[1]);
        if (!token || token.expiresAt <= Date.now()) throw error(401, 'invalid_token', 'The access token is invalid or expired.');
        json(res, 200, { sub: token.sub, preferred_username: token.preferred_username }); return;
      }
      throw error(404, 'not_found', 'Endpoint not found.');
    } catch (cause) {
      if (untrustedPoll) { try { rate(req, '/mobile/result', Date.now()); } catch (limited) { cause = limited; } }
      if (!res.headersSent && !res.destroyed) json(res, cause.status || 500, { error: cause.code || 'server_error', error_description: cause.status ? cause.message : 'Wallet sign-in is temporarily unavailable.' },
        cause.status === 401 ? { 'WWW-Authenticate': req.url.startsWith(`${PREFIX}/token`) ? 'Basic realm="Mossvale wallet"' : 'Bearer' } : {});
    }
  }
  return { enabled: true, hint: { enabled: true, provider: PROVIDER, chainId }, handle,
    close() { closed = true; transactions.clear(); codes.clear(); tokens.clear(); rates.clear(); handoffs.clear(); } };
}
