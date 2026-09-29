#!/usr/bin/env node
/**
 * Keycloak 26.7 wallet broker configuration. Never run with shell tracing.
 *
 * All inputs are environment variables; no password grant or persisted admin token.
 * Required: KEYCLOAK_URL, KEYCLOAK_REALM, and either KC_ADMIN_TOKEN or
 * KC_ADMIN_CLIENT_ID + KC_ADMIN_CLIENT_SECRET (service account; KC_ADMIN_REALM
 * defaults to master). Broker phases also require APP_ORIGIN,
 * WALLET_OIDC_CLIENT_ID, WALLET_OIDC_CLIENT_SECRET, WALLET_OIDC_REDIRECT_URI.
 *
 * node scripts/configure-wallet-broker.mjs profile  # hide optional name fields
 * node scripts/configure-wallet-broker.mjs prepare  # configure DISABLED provider
 * node scripts/configure-wallet-broker.mjs enable   # verify live server, enable
 * node scripts/configure-wallet-broker.mjs verify   # read-only readiness/config
 *
 * Run profile independently before or after a migration. Neither it nor the
 * broker phases changes stored users, realm policy, clients, default flows, or roles.
 * An existing username collision requires confirmation + password/configured OTP;
 * no email verification link or automatic account-link authenticator is enabled.
 * Required realm Verify Profile/Verify Email actions are intentionally preserved.
 *
 * Official API: https://www.keycloak.org/docs-api/latest/rest-api/index.html
 * Flow source: https://github.com/keycloak/keycloak/blob/26.7.3/server-spi-private/src/main/java/org/keycloak/models/utils/DefaultAuthenticationFlows.java
 */
import { createPublicKey, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const PROVIDER = 'mossvale-wallet';
export const FLOW = 'Mossvale wallet first login';
const enc = encodeURIComponent;
const demand = (ok, message) => { if (!ok) throw Error(message); };
const required = (env, name) => { demand(typeof env[name] === 'string' && env[name].length > 0, `Missing ${name}.`); return env[name]; };
function httpsBase(value, name, originOnly = false) {
  let url; try { url = new URL(value); } catch { throw Error(`Invalid ${name}.`); }
  demand(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, `${name} must be a credential-free HTTPS URL.`);
  demand(!originOnly || url.origin === value, `${name} must be an exact origin with no trailing slash.`);
  return value.replace(/\/+$/, '');
}

/** Changes profile schema only; names already stored on users are never removed. */
export function optionalAdminNames(profile) {
  demand(Array.isArray(profile?.attributes), 'Keycloak returned an invalid user profile.');
  const result = structuredClone(profile);
  for (const name of ['firstName', 'lastName']) {
    const entries = result.attributes.filter(attribute => attribute.name === name);
    demand(entries.length === 1, `Expected exactly one ${name} profile attribute.`);
    delete entries[0].required;
    entries[0].permissions = { ...entries[0].permissions, view: ['admin'], edit: ['admin'] };
  }
  return result;
}

/** Identify the standard broker structure without depending on translated labels. */
export function walletFlowRequirements(executions) {
  demand(Array.isArray(executions) && executions.length > 0, 'Wallet first-login flow is empty.');
  const mandatory = ['idp-review-profile', 'idp-create-user-if-unique', 'idp-confirm-link', 'idp-email-verification', 'idp-username-password-form', 'auth-otp-form'];
  const known = new Set([...mandatory, 'conditional-user-configured', 'conditional-credential', 'webauthn-authenticator', 'auth-recovery-authn-code-form', 'idp-add-organization-member']);
  const byProvider = id => executions.filter(row => row.providerId === id);
  for (const row of executions) demand(row.authenticationFlow || known.has(row.providerId), 'Unexpected authenticator in wallet first-login flow; review it before enabling.');
  for (const id of mandatory) demand(byProvider(id).length === 1, 'Unexpected first-login flow structure; review it before enabling.');
  const parentOf = child => {
    const index = executions.indexOf(child);
    for (let i = index - 1; i >= 0; i--) if (executions[i].level < child.level) return executions[i];
    return undefined;
  };
  const review = byProvider('idp-review-profile')[0], create = byProvider('idp-create-user-if-unique')[0];
  const confirm = byProvider('idp-confirm-link')[0], email = byProvider('idp-email-verification')[0];
  const password = byProvider('idp-username-password-form')[0], otp = byProvider('auth-otp-form')[0];
  const choice = parentOf(create), existing = parentOf(confirm), verification = parentOf(email), reauth = parentOf(password), secondFactor = parentOf(otp);
  const condition = byProvider('conditional-user-configured').find(row => parentOf(row) === secondFactor);
  demand(review.level === 0 && choice?.level === 0 && parentOf(existing) === choice && parentOf(verification) === existing && parentOf(reauth) === verification && parentOf(secondFactor) === reauth && condition, 'Unexpected broker branches; refusing to modify authentication.');
  demand(['CONDITIONAL', 'REQUIRED'].includes(secondFactor.requirement) && ['ALTERNATIVE', 'REQUIRED'].includes(otp.requirement), 'Configured two-factor verification must remain enabled.');
  const organization = byProvider('idp-add-organization-member');
  demand(organization.length <= 1 && executions.filter(row => row.authenticationFlow).length === 5 + organization.length, 'Unexpected extra authentication branch.');
  for (const row of executions.filter(row => ['conditional-credential', 'webauthn-authenticator', 'auth-recovery-authn-code-form'].includes(row.providerId))) demand(parentOf(row) === secondFactor, 'Unexpected two-factor branch placement.');
  const organizationBranch = organization.length ? parentOf(organization[0]) : undefined;
  for (const row of byProvider('conditional-user-configured')) demand(parentOf(row) === secondFactor || organizationBranch && parentOf(row) === organizationBranch, 'Unexpected conditional branch placement.');
  const plan = new Map(executions.map(row => [row.id, row.requirement]));
  for (const [id, requirement] of [[review.id, 'DISABLED'], [choice.id, 'REQUIRED'], [create.id, 'ALTERNATIVE'], [existing.id, 'ALTERNATIVE'], [confirm.id, 'REQUIRED'], [verification.id, 'REQUIRED'], [email.id, 'DISABLED'], [reauth.id, 'REQUIRED'], [password.id, 'REQUIRED'], [condition.id, 'REQUIRED']]) plan.set(id, requirement);
  if (organization.length) {
    const branch = organizationBranch;
    demand(branch?.level === 0, 'Unexpected organization branch.');
    plan.set(branch.id, 'DISABLED'); // A wallet identity cannot grant organization membership.
  }
  return plan;
}

export async function configureWalletBroker(phase, env = process.env, fetcher = fetch) {
  demand(['profile', 'prepare', 'enable', 'verify'].includes(phase), 'Choose profile, prepare, enable, or verify.');
  const base = httpsBase(required(env, 'KEYCLOAK_URL'), 'KEYCLOAK_URL'), realm = required(env, 'KEYCLOAK_REALM');
  demand(!/[\x00-\x1f/]/.test(realm), 'Invalid KEYCLOAK_REALM.');
  const adminBase = `${base}/admin/realms/${enc(realm)}`;
  let token = env.KC_ADMIN_TOKEN, tokenExpires = token ? Infinity : 0;
  async function request(url, options = {}, accept = [200, 201, 204]) {
    let response;
    try { response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store', ...options }); }
    catch { throw Error('Configuration request failed or timed out; no response details were logged.'); }
    demand(accept.includes(response.status), `Configuration request returned HTTP ${response.status}; no response body was logged.`);
    if (response.status === 204 || response.status === 404) return undefined;
    const body = await response.text();
    if (!body) return undefined;
    try { return JSON.parse(body); } catch { throw Error('Configuration endpoint did not return JSON.'); }
  }
  async function admin(path, method = 'GET', body, accept) {
    if (tokenExpires < Date.now() + 10000) {
      const auth = await request(`${base}/realms/${enc(env.KC_ADMIN_REALM || 'master')}/protocol/openid-connect/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: required(env, 'KC_ADMIN_CLIENT_ID'), client_secret: required(env, 'KC_ADMIN_CLIENT_SECRET') }).toString(),
      });
      demand(typeof auth?.access_token === 'string' && Number(auth.expires_in) > 10, 'Admin service-account authentication failed.');
      token = auth.access_token; tokenExpires = Date.now() + Number(auth.expires_in) * 1000;
    }
    return request(`${adminBase}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accept);
  }
  if (phase === 'profile') {
    const previous = await admin('/users/profile'), next = optionalAdminNames(previous);
    if (!isDeepStrictEqual(previous, next)) await admin('/users/profile', 'PUT', next);
    const actual = await admin('/users/profile');
    demand(isDeepStrictEqual(optionalAdminNames(actual), actual) && isDeepStrictEqual(actual, next), 'Profile read-back differs; review configuration before continuing.');
    return { phase, changed: !isDeepStrictEqual(previous, next), names: 'Optional, admin-visible only; saved values untouched.' };
  }

  const app = httpsBase(required(env, 'APP_ORIGIN'), 'APP_ORIGIN', true), issuer = `${app}/wallet-oidc`;
  const clientId = required(env, 'WALLET_OIDC_CLIENT_ID'), secret = required(env, 'WALLET_OIDC_CLIENT_SECRET');
  demand(/^[\x21-\x7e]{32,256}$/.test(secret) && /^[\x21-\x7e]{1,128}$/.test(clientId), 'Invalid wallet confidential-client configuration.');
  const callback = `${base}/realms/${enc(realm)}/broker/${PROVIDER}/endpoint`;
  demand(env.WALLET_OIDC_REDIRECT_URI === callback, 'WALLET_OIDC_REDIRECT_URI must exactly match this realm and mossvale-wallet broker callback.');
  const representation = {
    alias: PROVIDER, providerId: 'oidc', displayName: 'Wallet', enabled: false,
    trustEmail: false, storeToken: false, addReadTokenRoleOnCreate: false, authenticateByDefault: false,
    linkOnly: false, hideOnLogin: false, firstBrokerLoginFlowAlias: FLOW,
    config: { clientId, clientSecret: secret, clientAuthMethod: 'client_secret_post',
      issuer, authorizationUrl: `${issuer}/authorize`, tokenUrl: `${issuer}/token`, userInfoUrl: `${issuer}/userinfo`, jwksUrl: `${issuer}/jwks`,
      defaultScope: 'openid profile', validateSignature: 'true', useJwksUrl: 'true', syncMode: 'IMPORT',
      pkceEnabled: 'true', pkceMethod: 'S256', acceptsPromptNoneForwardFromClient: 'false', disableUserInfo: 'false',
      userIDClaim: 'sub', userNameClaim: 'preferred_username',
    },
  };
  const info = await admin('');
  demand(info.registrationEmailAsUsername !== true, 'Email-as-username policy is incompatible with the wallet provider; no realm policy was changed.');
  const idpPath = `/identity-provider/instances/${PROVIDER}`;
  let existing = await admin(idpPath, 'GET', undefined, [200, 404]);
  demand(!existing || existing.providerId === 'oidc', 'mossvale-wallet alias already belongs to another provider.');
  if (existing) demand((await admin(`${idpPath}/mappers`)).length === 0, 'Wallet provider has unexpected identity/role mappers; review them before changing it.');
  const flowPath = `/authentication/flows/${enc(FLOW)}/executions`;
  if (phase === 'prepare') {
    // Disable an existing provider before touching its flow/config; partial failures stay closed.
    if (existing?.enabled) await admin(idpPath, 'PUT', { ...existing, enabled: false });
    const flows = await admin('/authentication/flows');
    if (!flows.some(flow => flow.alias === FLOW)) {
      demand(flows.some(flow => flow.alias === 'first broker login' && flow.builtIn), 'Standard first broker login flow is unavailable.');
      walletFlowRequirements(await admin(`/authentication/flows/${enc('first broker login')}/executions`));
      await admin(`/authentication/flows/${enc('first broker login')}/copy`, 'POST', { newName: FLOW });
    }
    const executions = await admin(flowPath), requirements = walletFlowRequirements(executions);
    for (const row of executions) if (row.requirement !== requirements.get(row.id)) await admin(flowPath, 'PUT', { ...row, requirement: requirements.get(row.id) });
    // Owned provider config is written completely: old claim/role forwarding cannot survive.
    await admin(existing ? idpPath : '/identity-provider/instances', existing ? 'PUT' : 'POST', { ...representation, ...(existing?.internalId ? { internalId: existing.internalId } : {}) });
  }
  const executions = await admin(flowPath), requirements = walletFlowRequirements(executions);
  demand(executions.every(row => row.requirement === requirements.get(row.id)), 'Wallet first-login flow is not prepared safely.');
  existing = await admin(idpPath);
  demand(existing && Object.entries(representation).every(([key, value]) => key === 'enabled' || key === 'config' || isDeepStrictEqual(existing[key], value)), 'Wallet provider settings differ from the prepared configuration.');
  demand(Object.entries(representation.config).every(([key, value]) => key === 'clientSecret' || existing.config?.[key] === value), 'Wallet OIDC security settings differ from the prepared configuration.');
  demand((await admin(`${idpPath}/mappers`)).length === 0, 'Unexpected wallet identity/role mappers.');
  if (phase === 'prepare') {
    demand(existing.enabled === false, 'Prepared wallet provider must remain disabled.');
    return { phase, provider: PROVIDER, enabled: false, flow: FLOW };
  }
  // Readiness must precede enable: validate metadata/keys and the configured secret
  // using an impossible random authorization code; this does not sign in a user.
  const discovery = await request(`${issuer}/.well-known/openid-configuration`);
  for (const [field, expected] of Object.entries({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo`, jwks_uri: `${issuer}/jwks` })) demand(discovery?.[field] === expected, 'Wallet discovery does not match the expected endpoints.');
  for (const [field, requiredValue] of Object.entries({ response_types_supported: 'code', grant_types_supported: 'authorization_code', id_token_signing_alg_values_supported: 'RS256', token_endpoint_auth_methods_supported: 'client_secret_post', code_challenge_methods_supported: 'S256' })) demand(discovery[field]?.includes(requiredValue), 'Wallet discovery lacks a required security capability.');
  const jwks = await request(`${issuer}/jwks`);
  demand(Array.isArray(jwks?.keys) && jwks.keys.length > 0 && jwks.keys.length <= 4, 'Invalid wallet signing-key set.');
  for (const key of jwks.keys) {
    demand(key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig' && typeof key.kid === 'string' && !['d', 'p', 'q', 'dp', 'dq', 'qi'].some(field => field in key), 'Wallet JWKS must contain public RS256 signing keys only.');
    let bits; try { bits = createPublicKey({ key, format: 'jwk' }).asymmetricKeyDetails?.modulusLength; } catch { throw Error('Wallet public key is invalid.'); }
    demand(bits >= 2048, 'Wallet RSA keys must be at least 2048 bits.');
  }
  demand(new Set(jwks.keys.map(key => key.kid)).size === jwks.keys.length, 'Wallet key identifiers must be unique.');
  const probe = await request(`${issuer}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: randomBytes(32).toString('base64url'), redirect_uri: callback, client_id: clientId, client_secret: secret }).toString() }, [400, 401]);
  demand(probe?.error === 'invalid_grant', 'Wallet server rejected confidential-client credentials or was unavailable; provider was not enabled.');
  if (phase === 'enable' && !existing.enabled) {
    await admin(idpPath, 'PUT', { ...existing, config: { ...existing.config, clientSecret: secret }, enabled: true });
    demand((await admin(idpPath)).enabled === true, 'Wallet provider enable read-back failed.');
  }
  return { phase, provider: PROVIDER, enabled: phase === 'enable' || existing.enabled === true, ready: true, flow: FLOW };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  configureWalletBroker(process.argv[2]).then(result => console.log(JSON.stringify(result)), error => {
    console.error(error.message); process.exitCode = 1;
  });
}
