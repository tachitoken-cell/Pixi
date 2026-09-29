// No real network calls or credentials: exercise the setup tool against an Admin REST fixture.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { configureWalletBroker, optionalAdminNames, walletFlowRequirements, FLOW } from './configure-wallet-broker.mjs';

const rows = [
  ['idp-review-profile', 0, 'REQUIRED'], [null, 0, 'REQUIRED'],
  ['idp-create-user-if-unique', 1, 'ALTERNATIVE'], [null, 1, 'ALTERNATIVE'],
  ['idp-confirm-link', 2, 'REQUIRED'], [null, 2, 'REQUIRED'],
  ['idp-email-verification', 3, 'ALTERNATIVE'], [null, 3, 'ALTERNATIVE'],
  ['idp-username-password-form', 4, 'REQUIRED'], [null, 4, 'CONDITIONAL'],
  ['conditional-user-configured', 5, 'REQUIRED'], ['auth-otp-form', 5, 'ALTERNATIVE'],
  ['webauthn-authenticator', 5, 'DISABLED'], [null, 0, 'CONDITIONAL'],
  ['conditional-user-configured', 1, 'REQUIRED'], ['idp-add-organization-member', 1, 'REQUIRED'],
].map(([providerId, level, requirement], i) => ({ id: String(i), providerId, level, requirement, authenticationFlow: providerId === null }));
let profile = { attributes: [
  { name: 'username', required: { roles: ['user'] }, permissions: { view: ['admin', 'user'], edit: ['admin', 'user'] } },
  { name: 'email', required: { roles: ['user'] }, validations: { email: {} } },
  { name: 'firstName', required: { roles: ['user'] }, permissions: { view: ['admin', 'user'], edit: ['admin', 'user'] }, displayName: 'First name' },
  { name: 'lastName', required: { roles: ['user'] }, permissions: { view: ['admin', 'user'], edit: ['admin', 'user'] } },
], groups: [{ name: 'personal' }] };
const env = {
  KEYCLOAK_URL: 'https://auth.example.test', KEYCLOAK_REALM: 'mossvale', KC_ADMIN_TOKEN: 'synthetic-admin-token',
  APP_ORIGIN: 'https://game.example.test', WALLET_OIDC_CLIENT_ID: 'wallet-test',
  WALLET_OIDC_CLIENT_SECRET: 'synthetic-wallet-secret'.repeat(3),
  WALLET_OIDC_REDIRECT_URI: 'https://auth.example.test/realms/mossvale/broker/mossvale-wallet/endpoint',
};
const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
let jwk = { ...publicKey, kid: 'test-key', alg: 'RS256', use: 'sig' };
let writes = 0, offline = false, badSecret = false, emailAsUsername = false, badDiscovery = false;
let idp, custom, mappers = [], tokenRequests = 0;
const response = (obj, status = 200) => new Response(obj === undefined ? null : JSON.stringify(obj), { status });
const fake = async (url, options = {}) => {
  const u = new URL(url), method = options.method || 'GET';
  const data = options.headers?.['Content-Type'] === 'application/json' ? JSON.parse(options.body) : undefined;
  assert.equal(options.redirect, 'error');
  if (u.host === 'auth.example.test') {
    if (u.pathname === '/realms/master/protocol/openid-connect/token') {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('grant_type'), 'client_credentials');
      assert.equal(body.has('password'), false); tokenRequests++;
      return response({ access_token: 'synthetic-admin-token', expires_in: 60 });
    }
    assert.equal(options.headers.Authorization, 'Bearer synthetic-admin-token');
    const p = decodeURIComponent(u.pathname.slice('/admin/realms/mossvale'.length));
    if (method !== 'GET') writes++;
    if (p === '') return response({ registrationEmailAsUsername: emailAsUsername });
    if (p === '/users/profile') { if (method === 'PUT') profile = data; return response(profile); }
    if (p === '/authentication/flows') return response([{ alias: 'first broker login', builtIn: true }, ...(custom ? [{ alias: FLOW }] : [])]);
    if (p === '/authentication/flows/first broker login/executions') return response(rows);
    if (p === '/authentication/flows/first broker login/copy') { assert.equal(data.newName, FLOW); custom = structuredClone(rows); return response(undefined, 201); }
    if (p === `/authentication/flows/${FLOW}/executions`) {
      if (method === 'PUT') { custom[Number(data.id)] = data; return response(undefined, 204); }
      return response(custom);
    }
    if (p === '/identity-provider/instances') { idp = { ...data, internalId: 'fake-provider' }; return response(undefined, 201); }
    if (p === '/identity-provider/instances/mossvale-wallet') {
      if (method === 'PUT') { idp = data; return response(undefined, 204); }
      return idp ? response(idp) : response(undefined, 404);
    }
    if (p.endsWith('/mappers')) return response(mappers);
    throw Error('Unexpected mocked admin path');
  }
  assert.equal(u.host, 'game.example.test'); assert.equal(options.headers?.Authorization, undefined);
  if (offline) return response({}, 503);
  const issuer = env.APP_ORIGIN + '/wallet-oidc';
  if (u.pathname.endsWith('/.well-known/openid-configuration')) return response({
    issuer: badDiscovery ? 'https://different.example.test' : issuer,
    authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', userinfo_endpoint: issuer + '/userinfo', jwks_uri: issuer + '/jwks',
    response_types_supported: ['code'], grant_types_supported: ['authorization_code'], id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post'], code_challenge_methods_supported: ['S256'],
  });
  if (u.pathname.endsWith('/jwks')) return response({ keys: [jwk] });
  if (u.pathname.endsWith('/token')) return response({ error: badSecret ? 'invalid_client' : 'invalid_grant' }, badSecret ? 401 : 400);
  throw Error('Unexpected mocked public path');
};

const old = structuredClone(profile), next = optionalAdminNames(profile);
assert.deepEqual(profile, old); assert.deepEqual(next.attributes.slice(0, 2), old.attributes.slice(0, 2));
assert.equal((await configureWalletBroker('profile', env, fake)).changed, true);
const profileWrites = writes;
assert.equal((await configureWalletBroker('profile', env, fake)).changed, false); assert.equal(writes, profileWrites);
assert.equal((await configureWalletBroker('prepare', env, fake)).enabled, false);
assert.equal(idp.trustEmail, false); assert.equal(idp.storeToken, false); assert.equal(idp.config.pkceMethod, 'S256');
assert.equal(custom[7].requirement, 'REQUIRED'); assert.equal(custom[6].requirement, 'DISABLED');
assert.equal(custom[13].requirement, 'DISABLED'); assert.equal(custom[11].requirement, 'ALTERNATIVE');
const first = JSON.stringify(custom); await configureWalletBroker('prepare', env, fake); assert.equal(JSON.stringify(custom), first);
for (const failure of ['offline', 'secret', 'discovery', 'private-key']) {
  offline = failure === 'offline'; badSecret = failure === 'secret'; badDiscovery = failure === 'discovery';
  if (failure === 'private-key') jwk = { ...jwk, d: 'must-not-be-published' };
  await assert.rejects(configureWalletBroker('enable', env, fake)); assert.equal(idp.enabled, false);
  delete jwk.d;
}
offline = badSecret = badDiscovery = false;
assert.equal((await configureWalletBroker('enable', env, fake)).enabled, true);
const beforeVerify = writes; await configureWalletBroker('verify', env, fake); assert.equal(writes, beforeVerify);
const serviceEnv = { ...env, KC_ADMIN_TOKEN: undefined, KC_ADMIN_CLIENT_ID: 'admin-service', KC_ADMIN_CLIENT_SECRET: 'synthetic-service-secret' };
await configureWalletBroker('verify', serviceEnv, fake); assert.equal(tokenRequests, 1);
mappers = [{ identityProviderMapper: 'oidc-role-idp-mapper' }];
await assert.rejects(configureWalletBroker('enable', env, fake), /mappers/); mappers = [];
emailAsUsername = true; const beforeBlocked = writes;
await assert.rejects(configureWalletBroker('prepare', env, fake), /Email-as-username/); assert.equal(writes, beforeBlocked); emailAsUsername = false;
assert.throws(() => walletFlowRequirements([...rows, { id: 'bad', providerId: 'idp-auto-link', level: 0 }]), /Unexpected/);
assert.throws(() => walletFlowRequirements(rows.filter(row => row.providerId !== 'idp-username-password-form')), /structure/);
assert.throws(() => walletFlowRequirements(rows.map(row => row.providerId === 'webauthn-authenticator' ? { ...row, level: 0 } : row)), /placement/);
await assert.rejects(configureWalletBroker('prepare', { ...env, WALLET_OIDC_REDIRECT_URI: 'https://evil.example/callback' }, fake), /exactly/);
console.log('PASS: wallet broker setup preserves profile policies, copies safe reauthentication, keeps failed preparation disabled, verifies live metadata/keys/client secret, and rejects unsafe branches or endpoint drift. All traffic mocked.');
