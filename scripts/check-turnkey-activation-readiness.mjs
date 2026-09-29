import assert from 'node:assert/strict';
import { turnkeyActivationReadiness } from './turnkey-activation-readiness.mjs';
import { turnkeyActivation, TURNKEY_KEYS } from './turnkey-activation.mjs';

const env = { MOSSVALE_ACTIVATE_TURNKEY: 'true', GITHUB_REPOSITORY: 'trappyon/mossvale', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40),
  MOSSVALE_DEPLOY_TOKEN: 'b'.repeat(64), MOSSVALE_EU_BBA_APP_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', BBA_API_TOKEN: 'private-bba-readiness-fixture',
  TURNKEY_ORGANIZATION_ID: '11111111-2222-4333-8444-555555555555', TURNKEY_AUTH_PROXY_CONFIG_ID: '22222222-2222-4333-8444-555555555555',
  ALCHEMY_WALLET_API_KEY: 'private-readiness-fixture-key', ALCHEMY_GAS_POLICY_ID: '33333333-2222-4333-8444-555555555555',
  TURNKEY_SPONSOR_MAX_OPERATION_WEI: '2000000', TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI: '4000000', TURNKEY_SPONSOR_WALLET_DAILY_WEI: '4000000',
  TURNKEY_SPONSOR_GLOBAL_DAILY_WEI: '100000000', TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI: '10', TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS: '100' };
const activation = turnkeyActivation(env);
const originalStatus = { revision: 'c'.repeat(40), state: 'idle', turnkeyHash: null };
const originalApp = { id: env.MOSSVALE_EU_BBA_APP_ID, sourceType: 'github-nodejs', replicas: 1, githubRepositoryOwner: 'trappyon', githubRepositoryName: 'mossvale',
  githubBranch: 'production', autoDeployPush: true, autoDeployPullRequest: false, status: 'ready', settingsPending: false, environmentVariableNames: ['DATABASE_URL'] };
let status, app, fault, calls, preparations;
function reset() { status = { ...originalStatus }; app = { ...originalApp }; fault = ''; calls = []; preparations = 0; }
const fetcher = async (url, options) => {
  calls.push(url);
  assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  assert.equal(options.body, undefined); assert(options.signal instanceof AbortSignal);
  assert(['https://mossvale.world/api/deployment', `https://bba.tools/api/apps/${activation.appId}`].includes(url), 'Only the pinned EU/app endpoints may be observed');
  assert.equal(options.headers.Authorization, `Bearer ${url.includes('bba.tools') ? env.BBA_API_TOKEN : env.MOSSVALE_DEPLOY_TOKEN}`);
  if (fault === 'network') throw Error(`private upstream ${env.BBA_API_TOKEN}`);
  if (fault === 'http') return new Response(env.ALCHEMY_WALLET_API_KEY, { status: 403 });
  if (fault === 'large') return new Response('x'.repeat(524289));
  return new Response(JSON.stringify(url.includes('bba.tools') ? { app } : status));
};
const preflight = async options => {
  assert.deepEqual(options.env, activation.settings); assert.equal(options.fetcher, fetcher); preparations++;
  if (fault === 'provider') throw Error(`private upstream ${env.ALCHEMY_WALLET_API_KEY}`);
};
async function run(changes = {}) { return turnkeyActivationReadiness({ env: { ...env, ...changes }, fetcher, preflight }); }
const safe = expression => error => expression.test(error.message) && !error.message.includes('private') && !error.message.includes('https://')
  && !error.message.includes(env.MOSSVALE_DEPLOY_TOKEN) && !error.stack.includes('private upstream');

for (const flag of ['', 'false', undefined]) {
  reset(); assert.deepEqual(await run({ MOSSVALE_ACTIVATE_TURNKEY: flag, BBA_API_TOKEN: '' }), { enabled: false });
  assert.equal(calls.length, 0); assert.equal(preparations, 0);
}
reset(); assert.deepEqual(await run(), { enabled: true, state: 'initial' }); assert.equal(calls.length, 2); assert.equal(preparations, 1);
reset(); status = { ...status, revision: env.GITHUB_SHA, turnkeyHash: activation.hash }; app.environmentVariableNames = [...app.environmentVariableNames, ...TURNKEY_KEYS];
assert.deepEqual(await run(), { enabled: true, state: 'configured' }); assert.equal(preparations, 1);
reset(); status = { ...status, state: 'drained', targetRevision: env.GITHUB_SHA, finalSave: true, admissionHeld: true };
app = { ...app, settingsPending: true, environmentVariableNames: [...app.environmentVariableNames, ...TURNKEY_KEYS] };
await assert.rejects(run(), safe(/pending settings replacement \(not ready\)/)); assert.equal(calls.length, 2); assert.equal(preparations, 0);
for (const mutation of [
  () => { app.id = 'another-app'; }, () => { app.githubBranch = 'main'; }, () => { status.turnkeyHash = 'f'.repeat(64); },
  () => { app.environmentVariableNames = [TURNKEY_KEYS[0]]; }, () => { status.revision = env.GITHUB_SHA; },
  () => { status.state = 'drained'; status.targetRevision = 'd'.repeat(40); },
]) {
  reset(); mutation(); await assert.rejects(run(), safe(/activation state validation/)); assert.equal(preparations, 0);
}
for (const changes of [{ MOSSVALE_ACTIVATE_TURNKEY: 'yes' }, { GITHUB_REF: 'refs/pull/1/merge' }, { GITHUB_REPOSITORY: 'foreign/repo' },
  { MOSSVALE_DEPLOY_TOKEN: '' }, { TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS: '0' }]) {
  reset(); await assert.rejects(run(changes), safe(/configuration/)); assert.equal(calls.length, 0); assert.equal(preparations, 0);
}
for (const mode of ['network', 'http', 'large', 'provider']) {
  reset(); fault = mode; await assert.rejects(run(), safe(/Turnkey activation readiness failed/));
  assert.equal(calls.length, mode === 'provider' ? 2 : 1); assert.equal(preparations, mode === 'provider' ? 1 : 0);
}
console.log('PASS early activation readiness: disabled no-op, pinned read-only initial/configured checks, pending fail-fast, invalid state/config rejection and sanitized failures. No live calls.');
