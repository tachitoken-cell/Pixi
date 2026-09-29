#!/usr/bin/env node
// Defaults to an offline, redacted plan. Every mutation requires --apply.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { walletFlowRequirements } from './configure-wallet-broker.mjs';

export const SOCIAL_FLOW = 'Mossvale social first login';
export const SSO_REDIRECTS = ['https://mossvale.world/', 'https://us.mossvale.world/', 'https://asia.mossvale.world/', 'https://account.mossvale.world/', 'https://account.mossvale.world/account.html',
  'https://mossvale.world/account.html', 'https://us.mossvale.world/account.html', 'https://asia.mossvale.world/account.html',
  'https://mossvale.world/auth-callback.html', 'https://us.mossvale.world/auth-callback.html', 'https://asia.mossvale.world/auth-callback.html',
  'https://mossvale.world/silent-check-sso.html', 'https://us.mossvale.world/silent-check-sso.html', 'https://asia.mossvale.world/silent-check-sso.html', 'https://account.mossvale.world/silent-check-sso.html',
  'mossvale://auth/callback'];
const origins = ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world', 'https://account.mossvale.world'];
const demand = (ok, message) => { if (!ok) throw Error(message); };
const required = (env, name) => { demand(typeof env[name] === 'string' && env[name].trim(), `Missing ${name}.`); return env[name].trim(); };
const enc = encodeURIComponent;
const secret = (env, name) => {
  demand(!(env[name] && env[`${name}_FILE`]), `Use ${name} or ${name}_FILE, not both.`);
  if (!env[`${name}_FILE`]) return required(env, name);
  try { const value = readFileSync(env[`${name}_FILE`], 'utf8').trim(); demand(value && value.length < 65536, 'Invalid secret file.'); return value; }
  catch { throw Error(`Cannot read ${name}_FILE.`); }
};
function settings(env) {
  let url; try { url = new URL(required(env, 'KEYCLOAK_URL')); } catch { throw Error('Invalid KEYCLOAK_URL.'); }
  demand(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'KEYCLOAK_URL must be a credential-free HTTPS URL.');
  const realm = required(env, 'KEYCLOAK_REALM');
  demand(/^[A-Za-z0-9_.-]+$/.test(realm), 'Invalid KEYCLOAK_REALM.');
  return { base: url.href.replace(/\/+$/, ''), realm };
}
function socialRequirements(rows) {
  const plan = walletFlowRequirements(rows);
  // Preserve profile collection where required by the realm; collision linking still requires reauthentication.
  plan.set(rows.find(row => row.providerId === 'idp-review-profile').id, 'REQUIRED');
  return plan;
}
function provider(alias, env) {
  const clientId = required(env, alias === 'google' ? 'GOOGLE_SSO_CLIENT_ID' : 'APPLE_SSO_CLIENT_ID');
  demand(/^[A-Za-z0-9][A-Za-z0-9._-]{2,254}$/.test(clientId), 'Invalid social provider client ID.');
  return {
    alias, providerId: alias === 'google' ? 'google' : 'mossvale-apple', displayName: alias === 'google' ? 'Google' : 'Apple', enabled: false,
    trustEmail: false, storeToken: alias === 'apple', addReadTokenRoleOnCreate: false, authenticateByDefault: false,
    linkOnly: false, hideOnLogin: false, firstBrokerLoginFlowAlias: SOCIAL_FLOW,
    config: { clientId, ...(alias === 'google' ? { clientSecret: secret(env, 'GOOGLE_SSO_CLIENT_SECRET'), defaultScope: 'openid email', issuer: 'https://accounts.google.com' }
      : { issuer: 'https://appleid.apple.com', authorizationUrl: 'https://appleid.apple.com/auth/authorize',
          tokenUrl: 'https://appleid.apple.com/auth/token', jwksUrl: 'https://appleid.apple.com/auth/keys',
          defaultScope: 'email', disableUserInfo: 'true', storeTokenInSession: 'false', disableNonce: 'false', pkceEnabled: 'false' }),
      validateSignature: 'true', useJwksUrl: 'true', syncMode: 'IMPORT', acceptsPromptNoneForwardFromClient: 'false',
      clientAuthMethod: 'client_secret_post' },
  };
}
function matches(actual, expected) {
  return actual && !actual.postBrokerLoginFlowAlias && Object.entries(expected).every(([key, value]) => key === 'config'
    ? isDeepStrictEqual(Object.fromEntries(Object.entries(actual.config || {}).filter(([name]) => name !== 'clientSecret')),
      Object.fromEntries(Object.entries(value).filter(([name]) => name !== 'clientSecret')))
    : key === 'enabled' || isDeepStrictEqual(actual[key], value));
}

export async function configureSocialSso(phase = 'plan', env = process.env, fetcher = fetch, apply = false) {
  demand(['plan', 'prepare', 'enable', 'verify', 'clients'].includes(phase), 'Choose plan, prepare, enable, verify, or clients.');
  const { base, realm } = settings(env), adminBase = `${base}/admin/realms/${enc(realm)}`;
  const aliases = (env.SSO_PROVIDERS || 'google,apple').split(',');
  demand(aliases.length && new Set(aliases).size === aliases.length && aliases.every(alias => ['google', 'apple'].includes(alias)), 'SSO_PROVIDERS must be google, apple, or google,apple.');
  if (phase === 'plan') return { phase, writes: false, providers: aliases.map(alias => ({ alias, enabled: false,
    providerId: alias === 'google' ? 'google' : 'mossvale-apple', callback: `${base}/realms/${enc(realm)}/broker/${alias}/endpoint` })),
    redirectUris: SSO_REDIRECTS, webOrigins: origins, firstBrokerLoginFlow: SOCIAL_FLOW,
    appleRuntimeSecrets: ['APPLE_SSO_TEAM_ID', 'APPLE_SSO_KEY_ID', 'APPLE_SSO_PRIVATE_KEY_FILE (or APPLE_SSO_PRIVATE_KEY)'] };
  demand(phase === 'verify' || apply === true, 'Mutations require explicit --apply.');
  let token = env.KC_ADMIN_TOKEN || env.KC_ADMIN_TOKEN_FILE ? secret(env, 'KC_ADMIN_TOKEN') : undefined, expires = token ? Infinity : 0;
  async function request(url, options = {}, statuses = [200, 201, 204]) {
    let response;
    try { response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000), ...options }); }
    catch { throw Error('SSO configuration request failed; response details were not logged.'); }
    demand(statuses.includes(response.status), `SSO configuration returned HTTP ${response.status}; response body was not logged.`);
    if ([204, 404].includes(response.status)) return undefined;
    const text = await response.text();
    if (!text) return undefined;
    try { return JSON.parse(text); } catch { throw Error('SSO configuration did not return JSON.'); }
  }
  async function admin(path, method = 'GET', value, statuses) {
    if (expires < Date.now() + 10000) {
      const auth = await request(`${base}/realms/${enc(env.KC_ADMIN_REALM || 'master')}/protocol/openid-connect/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials',
          client_id: required(env, 'KC_ADMIN_CLIENT_ID'), client_secret: secret(env, 'KC_ADMIN_CLIENT_SECRET') }).toString(),
      });
      demand(typeof auth?.access_token === 'string' && Number(auth.expires_in) > 10, 'SSO admin authentication failed.');
      token = auth.access_token; expires = Date.now() + Number(auth.expires_in) * 1000;
    }
    return request(adminBase + path, { method, headers: { Authorization: `Bearer ${token}`, ...(value ? { 'Content-Type': 'application/json' } : {}) },
      ...(value ? { body: JSON.stringify(value) } : {}) }, statuses);
  }
  if (phase === 'clients') {
    const clientId = required(env, 'KEYCLOAK_CLIENT_ID');
    const clients = await admin(`/clients?clientId=${enc(clientId)}`);
    demand(clients?.length === 1 && clients[0].clientId === clientId && clients[0].publicClient === true
      && clients[0].protocol === 'openid-connect' && clients[0].standardFlowEnabled === true, 'Expected one existing public OIDC browser client.');
    const existing = clients[0];
    const previousLogout = existing.attributes?.['post.logout.redirect.uris']?.split('##').filter(Boolean) || [];
    const expected = { ...existing, redirectUris: [...new Set([...(existing.redirectUris || []), ...SSO_REDIRECTS])],
      webOrigins: [...new Set([...(existing.webOrigins || []), ...origins])], attributes: { ...existing.attributes,
        'pkce.code.challenge.method': 'S256', 'post.logout.redirect.uris': [...new Set([...previousLogout, ...SSO_REDIRECTS.filter(uri => uri.startsWith('https:') && ['/', '/account.html'].includes(new URL(uri).pathname))])].join('##') } };
    if (!isDeepStrictEqual(existing, expected)) await admin(`/clients/${enc(existing.id)}`, 'PUT', expected);
    const actual = await admin(`/clients/${enc(existing.id)}`);
    demand(SSO_REDIRECTS.every(uri => actual.redirectUris?.includes(uri)) && origins.every(origin => actual.webOrigins?.includes(origin))
      && actual.attributes?.['pkce.code.challenge.method'] === 'S256', 'Client redirect/PKCE read-back failed.');
    return { phase, clientId, addedExactRedirects: SSO_REDIRECTS, pkce: 'S256' };
  }
  const expected = aliases.map(alias => provider(alias, env));
  const instances = await Promise.all(expected.map(async row => {
    await admin(`/identity-provider/providers/${enc(row.providerId)}`);
    const existing = await admin(`/identity-provider/instances/${row.alias}`, 'GET', undefined, [200, 404]);
    demand(!existing || existing.providerId === row.providerId, 'Social provider alias is already used by another provider.');
    if (existing) demand((await admin(`/identity-provider/instances/${row.alias}/mappers`)).length === 0, 'Review unexpected social provider mappers before applying.');
    return existing;
  }));
  const flowPath = `/authentication/flows/${enc(SOCIAL_FLOW)}/executions`;
  if (phase === 'prepare') {
    const allProviders = await admin('/identity-provider/instances');
    demand(!allProviders.some(row => row.enabled && row.firstBrokerLoginFlowAlias === SOCIAL_FLOW && !aliases.includes(row.alias)),
      'An enabled non-target provider uses the social flow; include it before preparing shared flow changes.');
    // Partial preparation must leave every targeted provider disabled, before flow edits begin.
    for (const row of instances) if (row?.enabled) await admin(`/identity-provider/instances/${row.alias}`, 'PUT', { ...row, enabled: false });
    const flows = await admin('/authentication/flows');
    if (!flows.some(flow => flow.alias === SOCIAL_FLOW)) {
      demand(flows.some(flow => flow.alias === 'first broker login' && flow.builtIn), 'Default broker flow is unavailable.');
      socialRequirements(await admin(`/authentication/flows/${enc('first broker login')}/executions`));
      await admin(`/authentication/flows/${enc('first broker login')}/copy`, 'POST', { newName: SOCIAL_FLOW });
    }
    const rows = await admin(flowPath), plan = socialRequirements(rows);
    for (const row of rows) if (row.requirement !== plan.get(row.id)) await admin(flowPath, 'PUT', { ...row, requirement: plan.get(row.id) });
    for (const [index, row] of expected.entries()) {
      const existing = instances[index];
      if (!matches(existing, row) || existing.enabled || row.config.clientSecret !== existing.config?.clientSecret)
        await admin(existing ? `/identity-provider/instances/${row.alias}` : '/identity-provider/instances', existing ? 'PUT' : 'POST',
          { ...row, ...(existing?.internalId ? { internalId: existing.internalId } : {}) });
    }
  }
  const rows = await admin(flowPath), plan = socialRequirements(rows);
  demand(rows.every(row => row.requirement === plan.get(row.id)), 'Social flow does not require safe account reauthentication.');
  // Validate every target before enabling any provider.
  const prepared = await Promise.all(expected.map(async row => {
    const actual = await admin(`/identity-provider/instances/${row.alias}`);
    demand(matches(actual, row), 'Social provider settings differ from the prepared configuration.');
    demand((await admin(`/identity-provider/instances/${row.alias}/mappers`)).length === 0, 'Unexpected social provider mappers.');
    return actual;
  }));
  if (phase === 'enable') for (const row of prepared) if (!row.enabled) {
    await admin(`/identity-provider/instances/${row.alias}`, 'PUT', { ...row, enabled: true });
    demand((await admin(`/identity-provider/instances/${row.alias}`)).enabled === true, 'Provider enable read-back failed.');
  }
  if (phase === 'prepare') demand(prepared.every(row => row.enabled === false), 'Prepared providers must remain disabled.');
  return { phase, providers: prepared.map(row => ({ alias: row.alias, enabled: phase === 'enable' || row.enabled === true })), flow: SOCIAL_FLOW };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  configureSocialSso(args.find(arg => !arg.startsWith('--')) || 'plan', process.env, fetch, args.includes('--apply'))
    .then(result => console.log(JSON.stringify(result, null, 2)), error => { console.error(error.message); process.exitCode = 1; });
}
