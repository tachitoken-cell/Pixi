import assert from 'node:assert/strict';

// Exercise the shipped web auth module and real Keycloak adapter across new app documents.
// Only the OS storage boundary and identity provider HTTP response are synthetic.
const persistent = new Map(), tab = new Map(), requests = [], redirects = [];
const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
globalThis.localStorage = storage(persistent); globalThis.sessionStorage = storage(tab);
globalThis.isSecureContext = true; globalThis.__MOSSVALE_NATIVE_AUTH__ = true; globalThis.__MOSSVALE_NATIVE_SESSION__ = true;
globalThis.location = { href: 'https://mossvale.world/', origin: 'https://mossvale.world', assign: url => redirects.push(url), replace: url => redirects.push(url) };
globalThis.window = new EventTarget(); window.location = location; window.history = { replaceState() {} };
globalThis.document = { body: { appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, submit() { assert.equal(secure, null, 'native credentials are deleted before provider logout navigation'); } }) };
const realm = { url: 'https://auth.fixture.test', realm: 'mossvale', clientId: 'mossvale-game' };
const issuer = `${realm.url}/realms/${realm.realm}`;
const jwt = claims => `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`;
let serial = 0, secure, failure, deferRefresh, deferSave, saveFailure, sequence = 0;
function credentials(provider) {
  const claims = { iss: issuer, sub: 'synthetic-player', azp: realm.clientId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, idp: provider, jti: String(++serial) };
  return { token: jwt(claims), refreshToken: jwt({ ...claims, typ: 'Refresh', exp: claims.exp + 3600 }), idToken: jwt({ ...claims, typ: 'ID' }) };
}
const bridge = { version: 1, platform: 'google', async request(method, params) {
  if (method === 'billing.authorize') return {};
  assert(['auth.restore', 'auth.save', 'auth.clear'].includes(method));
  requests.push(method);
  if (method === 'auth.clear') { secure = null; return {}; }
  assert.equal(params.issuer, issuer); assert.equal(params.clientId, realm.clientId);
  if (method === 'auth.restore') return secure && { ...secure };
  if (deferSave) await deferSave;
  if (saveFailure) throw Error('Synthetic secure storage unavailable');
  secure = { token: params.token, refreshToken: params.refreshToken, idToken: params.idToken }; return {};
} };
window.mossvaleNative = bridge;
globalThis.fetch = async (url, options) => {
  if (url === '/api/config?app-startup=1') return Response.json({ keycloak: realm });
  assert.equal(url, `${issuer}/protocol/openid-connect/token`);
  assert.equal(options.method, 'POST');
  const body = new URLSearchParams(options.body);
  assert.equal(body.get('grant_type'), 'refresh_token'); assert.equal(body.get('client_id'), realm.clientId);
  assert.equal(body.get('refresh_token'), secure.refreshToken, 'only the latest rotated native refresh token is reused');
  const provider = JSON.parse(Buffer.from(secure.token.split('.')[1], 'base64url').toString()).idp;
  if (deferRefresh) await deferRefresh;
  if (failure === 'network') throw Error('Synthetic provider outage');
  if (failure === 'revoked') return Response.json({ error: 'invalid_grant' }, { status: 400 });
  const next = credentials(provider);
  return Response.json({ access_token: next.token, refresh_token: next.refreshToken, id_token: next.idToken });
};
const reopen = async () => { tab.clear(); return import(`../src/auth.ts?native-restart=${sequence++}`); };
for (const provider of ['email', 'mossvale-wallet']) {
  secure = credentials(provider); persistent.clear(); requests.length = 0;
  const previousRefresh = secure.refreshToken;
  let release; deferRefresh = new Promise(resolve => { release = resolve; });
  let auth = await reopen(), completed = false;
  const opening = auth.initAuth().then(value => { completed = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false, 'stored credentials cannot enter an account before provider validation');
  await assert.rejects(auth.getAccessToken(), /not ready/);
  release(); deferRefresh = undefined;
  assert.equal(await opening, 'account', `${provider} session restores without a browser or wallet prompt`);
  assert.notEqual(secure.refreshToken, previousRefresh, 'successful restoration stores the rotated refresh token');
  assert.deepEqual([...persistent], [['mossvale-signed-in', '1']], 'web storage contains no access, refresh or ID token');
  assert.deepEqual([...tab], [['mossvale-signed-in', '1']]);
  assert.equal(redirects.length, 0, 'secure restoration never opens an external sign-in browser');
  const firstRotation = secure.refreshToken;
  await auth.getAccessToken(true); assert.notEqual(secure.refreshToken, firstRotation);
  auth = await reopen(); assert.equal(await auth.initAuth(), 'account');
  assert.notEqual(secure.refreshToken, firstRotation, 'the next app instance continues using rotated credentials');
  failure = 'network'; const offlineCredentials = { ...secure };
  await assert.rejects(auth.getAccessToken(true), /Could not refresh/);
  assert.deepEqual(secure, offlineCredentials, 'a disconnected token refresh retains encrypted credentials');
  failure = undefined; await auth.getAccessToken(true);
  await auth.signOut(); assert.equal(secure, null);
  assert.deepEqual([...persistent.keys()], ['mossvale-wallet-reset'], 'logout retains only the non-secret embedded-wallet invalidation marker');
  assert.match(persistent.get('mossvale-wallet-reset'), /^[\da-f-]{36}$/i); assert.equal(tab.size, 0);
  auth = await reopen(); assert.equal(await auth.initAuth(), 'signed-out', 'logout cannot silently restore on restart');
}
secure = credentials('mossvale-wallet'); failure = 'network';
let auth = await reopen(); await assert.rejects(auth.initAuth(), /Could not restore sign-in/);
assert(secure, 'an offline restart preserves encrypted credentials for a later retry');
await assert.rejects(auth.getAccessToken(), /not ready/);
failure = undefined; auth = await reopen(); assert.equal(await auth.initAuth(), 'account');
failure = 'revoked'; auth = await reopen(); await assert.rejects(auth.initAuth(), /could not be completed/);
await new Promise(resolve => setImmediate(resolve));
assert.equal(secure, null, 'provider-revoked sessions are removed from native storage');
await assert.rejects(auth.getAccessToken(), /not ready/);
failure = undefined; auth = await reopen(); assert.equal(await auth.initAuth(), 'signed-out');
assert.equal(redirects.length, 0, 'revocation does not cause an automatic login loop');

// Older native builds inject at load end. Exercise actual auth startup after
// the former 10-second timeout, and preserve saved credentials on a real timeout.
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
for (const bridgeDelay of [15000, 31000]) {
  const timers = new Map(); let clock = 0;
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (ms !== 10000 && ms !== 30000) return realSetTimeout(callback, ms, ...args);
    const timer = {}; timers.set(timer, { callback, at: clock + ms }); return timer;
  };
  globalThis.clearTimeout = timer => { if (!timers.delete(timer)) realClearTimeout(timer); };
  try {
    secure = credentials('email'); const saved = { ...secure }; requests.length = 0; delete window.mossvaleNative;
    auth = await reopen(); let completed = false;
    const opening = auth.initAuth().then(value => { completed = true; return { value }; }, error => { completed = true; return { error }; });
    await new Promise(setImmediate);
    clock = bridgeDelay;
    for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.callback(); }
    await new Promise(setImmediate);
    if (bridgeDelay < 30000) assert.equal(completed, false, 'slow document loading must not fail native sign-in after ten seconds');
    else {
      assert.match((await opening).error.message, /Could not restore sign-in/);
      await assert.rejects(auth.getAccessToken(), /not ready/);
    }
    assert.deepEqual(secure, saved, 'waiting for the native bridge cannot erase encrypted credentials');
    window.mossvaleNative = bridge; window.dispatchEvent(new Event('mossvale-native-ready'));
    if (bridgeDelay < 30000) assert.equal((await opening).value, 'account', 'a bridge arriving after fifteen seconds completes real provider validation');
    else {
      await new Promise(setImmediate);
      assert(!requests.includes('auth.clear'), 'a late bridge must not receive a queued destructive logout');
      assert.deepEqual(secure, saved, 'expired startup retains the session for a fresh attempt');
      auth = await reopen(); assert.equal(await auth.initAuth(), 'account', 'reopening recovers after an actual bridge timeout');
    }
    assert.equal(timers.size, 0, 'bridge readiness or timeout removes its pending deadline');
    await auth.signOut();
  } finally { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; }
}

secure = credentials('email'); auth = await reopen(); assert.equal(await auth.initAuth(), 'account');
let releaseRotation; deferRefresh = new Promise(resolve => { releaseRotation = resolve; });
const rotating = auth.getAccessToken(true), rejectedRotation = assert.rejects(rotating, /sign-in changed/);
await new Promise(resolve => setImmediate(resolve));
await auth.signOut(); assert.equal(secure, null);
// A response arriving after logout must neither restore authority nor recreate the stored session.
releaseRotation(); deferRefresh = undefined; await rejectedRotation;
await new Promise(resolve => setImmediate(resolve)); assert.equal(secure, null);
await assert.rejects(auth.getAccessToken(), /session has ended/, 'a late refresh cannot restore the logged-out adapter in memory');

// Keycloak's refresh callback and its awaited caller share one native save.
// The queue can recover from failure, but both callers must still see that failure.
secure = credentials('email'); auth = await reopen(); assert.equal(await auth.initAuth(), 'account');
const savedBeforeFailure = { ...secure };
let releaseSave; deferSave = new Promise(resolve => { releaseSave = resolve; }); saveFailure = true;
const failedSave = auth.getAccessToken(true), rejectedSave = assert.rejects(failedSave, /Could not refresh/);
await new Promise(resolve => setImmediate(resolve));
releaseSave(); await rejectedSave;
assert.deepEqual(secure, savedBeforeFailure, 'the held failure did not persist rotated credentials');
deferSave = undefined; saveFailure = false;
const recoveredToken = await auth.getAccessToken();
assert.equal(secure.token, recoveredToken, 'a later attempt durably stores the in-memory rotation');
assert.notEqual(secure.refreshToken, savedBeforeFailure.refreshToken);
await auth.signOut();

secure = credentials('email');
deferSave = new Promise(resolve => { releaseSave = resolve; }); saveFailure = true;
auth = await reopen(); const rejectedRestoreSave = assert.rejects(auth.initAuth(), /Could not restore sign-in/);
await new Promise(resolve => setImmediate(resolve));
releaseSave(); await rejectedRestoreSave;
await assert.rejects(auth.getAccessToken(), /not ready/);
deferSave = undefined; saveFailure = false;
console.log('PASS native session: real Keycloak refresh before account access, email/wallet app restarts, rotating tokens, logout deletion, revoked-session rejection, offline retry, durable-save failures and recovery, late bridge readiness, and no tokens in web storage.');
