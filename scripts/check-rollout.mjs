import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { canOverlapWarnings, dockerConfigBaselines, dockerPhase, productionCommit, readWithTransientRetry, verifyAsset, runEconomyBarrier, runRegionalRollout, shouldSkipRevision, validateDrain, verifyPublicConfig } from './rollout.mjs';
import { appleActivation, appleActivationPhase, appleAppBefore, appleAppAfter, applePublicConfig, APPLE_KEYS } from './apple-iap-activation.mjs';
import { turnkeyActivation, turnkeyActivationPhase, turnkeyAppBefore, turnkeyAppAfter, turnkeyPublicConfig, TURNKEY_KEYS } from './turnkey-activation.mjs';
import { turnkeyConfigurationHash } from '../src/deployment-control.mjs';
import { appleConfigurationHash } from '../src/deployment-control.mjs';

const revision = 'a'.repeat(40), target = 'b'.repeat(40), tree = 'c'.repeat(40);
const previous = { revision, instanceId: 'old-instance' };
for (const failure of [Object.assign(Error('Unavailable'), { status: 503 }), new TypeError('Network unavailable'), Object.assign(Error('Timed out'), { name: 'TimeoutError' })]) {
  let calls = 0; const pauses = [];
  assert.equal(await readWithTransientRetry(async () => { if (++calls < 3) throw failure; return 'ready'; }, async ms => pauses.push(ms)), 'ready');
  assert.equal(calls, 3); assert.deepEqual(pauses, [2000, 4000]);
  calls = 0;
  await assert.rejects(readWithTransientRetry(async () => { calls++; throw failure; }, async () => {}), error => error === failure);
  assert.equal(calls, 3, 'Transient status retries are bounded');
}
for (const failure of [Object.assign(Error('Unauthorized'), { status: 401 }), Object.assign(Error('Conflict'), { status: 409 }), new SyntaxError('Invalid response')]) {
  let calls = 0;
  await assert.rejects(readWithTransientRetry(async () => { calls++; throw failure; }, async () => assert.fail('Non-transient status must not retry')), error => error === failure);
  assert.equal(calls, 1);
}
// Exercise a timeout while consuming an HTTP 200 body, the failure observed from CI to Asia.
const originalFetch = globalThis.fetch, originalSetTimeout = globalThis.setTimeout, assetBytes = Buffer.from('checked release asset');
const assetHash = createHash('sha256').update(assetBytes).digest('hex');
try {
  let calls = 0;
  globalThis.setTimeout = (callback, ms, ...args) => originalSetTimeout(callback, ms === 180000 ? 2 : ms, ...args);
  globalThis.fetch = async (_url, { signal }) => ({ ok: true, arrayBuffer: async () => {
    if (++calls === 1) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    return assetBytes;
  } });
  await verifyAsset('https://example.invalid', 'asia', 'models/example.glb', assetHash);
  assert.equal(calls, 2, 'An interrupted body must be downloaded and hashed again');
  calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, arrayBuffer: async () => Buffer.from('wrong build') }; };
  await assert.rejects(verifyAsset('https://example.invalid', 'asia', 'models/example.glb', assetHash), /asia asset models\/example\.glb: Asset hash differs/);
  assert.equal(calls, 1, 'Content mismatches must fail immediately');
  globalThis.fetch = async () => { calls++; return { ok: false, status: 404 }; };
  await assert.rejects(verifyAsset('https://example.invalid', 'asia', 'models/example.glb', assetHash), /asia asset models\/example\.glb: HTTP 404/);
  assert.equal(calls, 2, 'Missing assets must fail immediately');
  for (const type of ['application/octet-stream', 'image/webp']) {
    globalThis.fetch = async () => new Response(assetBytes, { headers: { 'Content-Type': type } });
    const verified = verifyAsset('https://example.invalid', 'eu', 'ui/instant-combat/bone-pit.webp', assetHash);
    if (type === 'image/webp') await verified;
    else await assert.rejects(verified, /Image Content-Type is incompatible with the updater/);
  }
} finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalSetTimeout; }
const oldSignIn = { keycloak: { url: 'https://auth.mossvale.world', realm: 'mossvale', clientId: 'game' }, realmId: 'eu', mobilePurchases: { apple: false, google: false } };
const mobileConfig = {
  mobilePush: JSON.parse(readFileSync(new URL('../config/mobile-push.json', import.meta.url), 'utf8')),
  mobileAppUpdate: JSON.parse(readFileSync(new URL('../config/mobile-app-updates.json', import.meta.url), 'utf8')),
};
const newSignIn = { ...oldSignIn, socialProviders: { google: 'google', apple: 'apple' }, ...mobileConfig };
verifyPublicConfig(newSignIn, oldSignIn);
verifyPublicConfig(newSignIn, newSignIn);
assert.throws(() => verifyPublicConfig(oldSignIn, oldSignIn), /configuration/);
for (const socialProviders of [{}, { google: 'google' }, { apple: 'apple' }]) {
  const overridden = { ...oldSignIn, socialProviders };
  verifyPublicConfig({ ...overridden, ...mobileConfig }, overridden);
  assert.throws(() => verifyPublicConfig(newSignIn, overridden), /configuration/);
}
for (const keycloak of [null, { ...oldSignIn.keycloak, url: 'https://custom.example' }, { ...oldSignIn.keycloak, realm: 'other' }]) {
  const custom = { ...oldSignIn, keycloak };
  verifyPublicConfig({ ...custom, ...mobileConfig }, custom);
  assert.throws(() => verifyPublicConfig({ ...custom, socialProviders: newSignIn.socialProviders }, custom), /configuration/);
}
for (const changed of [{ ...newSignIn, realmId: 'us' }, { ...newSignIn, mobilePurchases: { apple: true, google: false } },
  { ...newSignIn, keycloak: { ...newSignIn.keycloak, clientId: 'other' } },
  { ...newSignIn, socialProviders: { ...newSignIn.socialProviders, clientSecret: 'must-not-be-public' } }]) {
  assert.throws(() => verifyPublicConfig(changed, oldSignIn), /configuration/);
}
// New fields must match the reviewed target, including policy activation or rollback.
verifyPublicConfig(newSignIn, { ...newSignIn, mobilePush: { enabled: !mobileConfig.mobilePush.enabled }, mobileAppUpdate: { apple: { minVersion: '999' } } });
for (const patch of [
  { mobilePush: undefined }, { mobilePush: { enabled: !mobileConfig.mobilePush.enabled } },
  { mobilePush: { ...mobileConfig.mobilePush, token: 'must-not-be-public' } },
  { mobileAppUpdate: undefined }, { mobileAppUpdate: { google: { minVersion: '999' } } },
]) assert.throws(() => verifyPublicConfig({ ...newSignIn, ...patch }, oldSignIn), /configuration/);
// Adding the public arena address admits only the explicitly reviewed deployment; existing values remain pinned.
const arenaContract = '0x52908400098527886E0F7030069857D2E4169EE7', reviewedArenaContract = arenaContract.toLowerCase();
const oldTurnkey = { ...newSignIn, turnkey: { organizationId: 'existing-org', gasFunding: true, collections: { petsContract: 'unchanged' } } };
const newTurnkey = { ...oldTurnkey, turnkey: { ...oldTurnkey.turnkey, arenaContract } };
verifyPublicConfig(oldTurnkey, oldTurnkey, true, reviewedArenaContract); // Unconfigured arena still omits the field.
verifyPublicConfig(newTurnkey, oldTurnkey, true, reviewedArenaContract);
verifyPublicConfig(newTurnkey, newTurnkey, true, ''); // A published address is preserved without migration.
for (const reviewed of ['', 'invalid', '0x' + '00'.repeat(20), '0x' + '23'.repeat(20)]) {
  assert.throws(() => verifyPublicConfig(newTurnkey, oldTurnkey, true, reviewed), /address|contract|configuration/i);
}
for (const patch of [{ arenaContract: '0x' + '23'.repeat(20) }, { arenaContract: undefined },
  { gasFunding: false }, { organizationId: 'changed' }, { collections: { petsContract: 'changed' } }, { unknown: true }]) {
  const changed = { ...newTurnkey, turnkey: { ...newTurnkey.turnkey, ...patch } };
  assert.throws(() => verifyPublicConfig(changed, oldTurnkey, true, reviewedArenaContract), /configuration/);
  assert.throws(() => verifyPublicConfig(changed, newTurnkey, true, reviewedArenaContract), /configuration/);
}
assert.throws(() => verifyPublicConfig(oldTurnkey, newTurnkey, true, reviewedArenaContract), /configuration/);
assert.throws(() => verifyPublicConfig(newTurnkey, newSignIn, true, reviewedArenaContract), /configuration/);
assert.throws(() => verifyPublicConfig(newTurnkey, oldTurnkey, false, reviewedArenaContract), /configuration/);
// Settings-only activation recreates the old release before the new code is promoted.
const oldConfigured = { ...oldSignIn, socialProviders: newSignIn.socialProviders };
verifyPublicConfig(oldConfigured, oldConfigured, false);
verifyPublicConfig(newSignIn, newSignIn, false);
assert.throws(() => verifyPublicConfig(newSignIn, oldConfigured, false), /configuration/);
assert.throws(() => verifyPublicConfig({ ...newSignIn, mobilePush: { enabled: !mobileConfig.mobilePush.enabled } }, newSignIn, false), /configuration/);
const rolloutSource = readFileSync(new URL('./rollout.mjs', import.meta.url), 'utf8');
assert.equal([...rolloutSource.matchAll(/await verify\(EU, 'eu', oldManifest, .*?, false\);/g)].length, 3, 'All pre-promotion activation checks preserve their old release configuration');
const drained = { ...previous, state: 'drained', targetRevision: target };
validateDrain(drained, previous, target);
for (const patch of [{ revision: target }, { instanceId: 'restarted' }, { state: 'failed' }, { state: 'idle' }, { targetRevision: tree }]) {
  assert.throws(() => validateDrain({ ...drained, ...patch }, previous, target));
}
assert.deepEqual(productionCommit(target, revision, tree).parents, [target, revision]);
assert.deepEqual(productionCommit(target, target, tree).parents, [target]);
assert.throws(() => productionCommit('main', revision, tree));
assert.equal(shouldSkipRevision(target, tree, { ...previous, state: 'idle', targetRevision: null }), true, 'Newer main supersedes an unstarted release');
for (const state of ['countdown', 'draining', 'drained']) {
  assert.equal(shouldSkipRevision(target, tree, { ...previous, state, targetRevision: target }), false, 'A newer push cannot strand an existing drain');
}
assert.equal(shouldSkipRevision(target, tree, { revision: target, state: 'idle', targetRevision: null }), false, 'Finish regional deployment after EU was already promoted');
assert.equal(shouldSkipRevision(target, tree, { ...previous, state: 'countdown', targetRevision: tree }), true, 'An obsolete run cannot take over another target');
assert.equal(shouldSkipRevision(target, tree, { revision: target, state: 'countdown', targetRevision: tree }), true, 'A completed old release must not interfere once the next drain starts');
assert.equal(shouldSkipRevision(target, target, { ...previous, state: 'idle', targetRevision: null }), false);

// A failed candidate must finish both preparations and block all draining.
const finished = [], evidence = {};
await assert.rejects(dockerPhase('prepare', async (realm, action) => {
  assert.equal(action, 'prepare');
  if (realm.id === 'asia') throw Error('Image configuration differs');
  await new Promise(resolve => setTimeout(resolve, 10));
  finished.push(realm.id);
  return { realm: realm.id };
}, (realm, result) => { evidence[realm] = result; }), /asia: Image configuration differs/);
assert.deepEqual(finished, ['us']);
assert.deepEqual(evidence, { us: { realm: 'us' } });
await assert.rejects(dockerPhase('prepare', async () => ({ realm: 'us' }), () => {}), /another realm/);
const activated = [];
await dockerPhase('deploy', async realm => ({ realm: realm.id }), realm => activated.push(realm));
assert.deepEqual(activated.sort(), ['asia', 'us']);
await assert.rejects(dockerPhase('restart', () => {}, () => {}), /Invalid Docker release phase/);

const warningReady = { us: { warningVersion: 1, phase: 'prepared' }, asia: { warningVersion: 1, phase: 'prepared' } };
assert.equal(canOverlapWarnings(warningReady, previous, target, null), true);
for (const phase of ['prepared', 'warning-requested', 'warned', 'cancel-requested', 'cancelled']) {
  assert.equal(canOverlapWarnings({ ...warningReady, asia: { warningVersion: 1, phase } }, previous, target, null), true);
}
for (const realm of ['us', 'asia']) {
  for (const warningVersion of [undefined, 0, 2, '1', true]) {
    assert.equal(canOverlapWarnings({ ...warningReady, [realm]: { phase: 'prepared', warningVersion } }, previous, target, null), false);
  }
  for (const phase of [undefined, 'warning', 'stopped', 'starting', 'complete']) {
    assert.equal(canOverlapWarnings({ ...warningReady, [realm]: { warningVersion: 1, phase } }, previous, target, null), false);
  }
  assert.equal(canOverlapWarnings({ ...warningReady, [realm]: undefined }, previous, target, null), false);
}
assert.equal(canOverlapWarnings(warningReady, { ...previous, revision: target }, target, null), false, 'Already-promoted EU must resume without another warning');
assert.equal(canOverlapWarnings(warningReady, previous, target, {}), false, 'Apple configuration replacements retain their existing warning sequence');
const warningAck = realm => ({ realm, phase: 'warned', warningVersion: 1, warningId: `notice-${realm}`, warningAt: '2026-09-19T20:00:00.000Z' });

// The fast realm cannot start EU early, and neither regional writer can stop while EU is still being verified.
{
  const calls = [], records = {}, warningsStarted = Promise.withResolvers(), asiaWarning = Promise.withResolvers(), euEntered = Promise.withResolvers(), euVerified = Promise.withResolvers();
  let verified = false;
  const work = runRegionalRollout({ overlap: true,
    remote: async (realm, action) => {
      calls.push(`${realm.id}:${action}`);
      if (action === 'warn') {
        if (realm.id === 'asia') { warningsStarted.resolve(); await asiaWarning.promise; }
        return warningAck(realm.id);
      }
      assert.equal(action, 'deploy'); assert(verified, 'No regional activation before EU public verification');
      return { realm: realm.id, phase: 'complete' };
    },
    deployEu: async () => {
      assert(records.usWarning && records.asiaWarning, 'Both held warnings must be acknowledged before EU starts');
      calls.push('eu:start'); euEntered.resolve(); await euVerified.promise;
      verified = true; calls.push('eu:verified');
    }, record: (name, value) => { records[name] = value; } });
  await warningsStarted.promise;
  assert.deepEqual(calls, ['us:warn', 'asia:warn'], 'Both regional warning requests run together');
  asiaWarning.resolve(); await euEntered.promise;
  assert(!calls.some(call => call.endsWith(':deploy')));
  euVerified.resolve(); await work;
  assert.deepEqual(calls, ['us:warn', 'asia:warn', 'eu:start', 'eu:verified', 'us:deploy', 'asia:deploy']);
  assert(records.usActivation && records.asiaActivation);
}

// Lost/invalid warning replies might follow an accepted signal: cancellation must reach both hosts.
const badWarnings = [
  { fail: true }, { realm: 'other' }, { phase: 'prepared' }, { warningVersion: 0 },
  { warningId: '' }, { warningId: 'invalid notice' }, { warningAt: 'not-a-date' },
];
for (const bad of badWarnings) {
  const calls = [], records = {}, warningsStarted = Promise.withResolvers(), laterWarning = Promise.withResolvers();
  const work = runRegionalRollout({ overlap: true,
    remote: async (realm, action) => {
      calls.push(`${realm.id}:${action}`);
      if (action === 'warn') {
        if (realm.id === 'asia') { warningsStarted.resolve(); await laterWarning.promise; return warningAck(realm.id); }
        if (bad.fail) throw Error('Lost warning reply');
        return { ...warningAck(realm.id), ...bad };
      }
      assert.equal(action, 'cancel-warning', 'A failed warning cannot reach regional activation');
      return { realm: realm.id, phase: 'cancelled' };
    }, deployEu: async () => assert.fail('A failed warning cannot start EU'),
    record: (name, value) => { records[name] = value; } });
  const rejected = assert.rejects(work, /warn stopped/);
  await warningsStarted.promise;
  assert.deepEqual(calls, ['us:warn', 'asia:warn'], 'Finish both warning attempts before cleanup');
  laterWarning.resolve(); await rejected;
  assert.deepEqual(calls.slice(2).sort(), ['asia:cancel-warning', 'us:cancel-warning']);
  assert(records.usWarningCancellation && records.asiaWarningCancellation);
}

for (const cleanupFails of [false, true]) {
  const calls = [], records = {}, original = Error('EU public verification failed');
  await assert.rejects(runRegionalRollout({ overlap: true,
    remote: async (realm, action) => {
      calls.push(`${realm.id}:${action}`);
      if (action === 'warn') return warningAck(realm.id);
      assert.equal(action, 'cancel-warning', 'Failed EU verification cannot commit regional shutdown');
      if (cleanupFails && realm.id === 'us') throw Error('Cleanup transport failed');
      return { realm: realm.id, phase: 'cancelled' };
    }, deployEu: async () => { calls.push('eu:verify'); throw original; },
    record: (name, value) => { records[name] = value; } }), error => error === original);
  assert.deepEqual(calls, ['us:warn', 'asia:warn', 'eu:verify', 'us:cancel-warning', 'asia:cancel-warning']);
  assert(records.asiaWarningCancellation, 'A failed cleanup cannot skip the other host');
  assert.equal(!!records.warningCancellationError, cleanupFails, 'Cleanup failure is recorded without masking the original EU error');
}

// Once activation starts, a partial deployment must retain its final-save state for a retry, never send SIGHUP.
{
  const calls = [], records = {}, laterDeployment = Promise.withResolvers();
  const work = runRegionalRollout({ overlap: true,
    remote: async (realm, action) => {
      calls.push(`${realm.id}:${action}`);
      if (action === 'warn') return warningAck(realm.id);
      assert.equal(action, 'deploy', 'Committed regional shutdown cannot be cancelled');
      if (realm.id === 'us') throw Error('Activation transport failed');
      await laterDeployment.promise; return { realm: realm.id, phase: 'complete' };
    }, deployEu: async () => { calls.push('eu:verified'); }, record: (name, value) => { records[name] = value; } });
  const rejected = assert.rejects(work, /deploy stopped; us: Activation transport failed/);
  laterDeployment.resolve(); await rejected;
  assert.deepEqual(calls, ['us:warn', 'asia:warn', 'eu:verified', 'us:deploy', 'asia:deploy']);
  assert(records.asiaActivation, 'Retain successful regional evidence after another host fails');
}

for (const failEu of [false, true]) {
  const calls = [], original = Error('Legacy EU failed');
  const work = runRegionalRollout({ overlap: false,
    remote: async (realm, action) => { assert.equal(action, 'deploy'); calls.push(`${realm.id}:${action}`); return { realm: realm.id }; },
    deployEu: async () => { calls.push('eu:verified'); if (failEu) throw original; }, record: () => {} });
  if (failEu) { await assert.rejects(work, error => error === original); assert.deepEqual(calls, ['eu:verified']); }
  else { await work; assert.deepEqual(calls, ['eu:verified', 'us:deploy', 'asia:deploy']); }
}

// An interrupted signal/cleanup must reconcile even when EU already runs the release or another region finished.
for (const phase of ['warning-requested', 'cancel-requested']) for (const otherComplete of [false, true]) {
  const prepared = { us: { warningVersion: 1, phase }, asia: { warningVersion: 1, phase: otherComplete ? 'complete' : 'prepared' } };
  const resumedEu = otherComplete ? previous : { ...previous, revision: target };
  const overlap = canOverlapWarnings(prepared, resumedEu, target, null);
  assert.equal(overlap, false);
  const calls = [], records = {};
  await runRegionalRollout({ overlap, prepared,
    remote: async (realm, action) => {
      calls.push(`${realm.id}:${action}`);
      if (action === 'cancel-warning') { assert.equal(realm.id, 'us'); return { realm: realm.id, phase: 'cancelled' }; }
      assert.equal(action, 'deploy', 'Recovery must not issue a fresh overlapping warning');
      assert(calls.includes('eu:verified')); return { realm: realm.id, phase: 'complete' };
    }, deployEu: async () => { assert.equal(records.usWarningCancellation?.phase, 'cancelled'); calls.push('eu:verified'); },
    record: (name, value) => { records[name] = value; } });
  assert.deepEqual(calls, ['us:cancel-warning', 'eu:verified', 'us:deploy', 'asia:deploy']);
}

for (const invalidReply of [false, true]) for (const otherPending of [false, true]) {
  const prepared = { us: { phase: 'warning-requested' }, asia: { phase: otherPending ? 'cancel-requested' : 'complete' } };
  const calls = [], records = {}; let attempts = 0;
  await assert.rejects(runRegionalRollout({ overlap: false, prepared,
    remote: async (realm, action) => {
      calls.push(`${realm.id}:${action}`); assert.equal(action, 'cancel-warning');
      if (realm.id === 'us' && ++attempts === 1) {
        if (invalidReply) return { realm: realm.id, phase: 'warned' };
        throw Error('Uncertain cancellation response');
      }
      return { realm: realm.id, phase: 'cancelled' };
    }, deployEu: async () => assert.fail('Unresolved warning recovery must block EU and regional deployment'),
    record: (name, value) => { records[name] = value; } }), /cancel-warning stopped/);
  assert.deepEqual(calls, ['us:cancel-warning', ...(otherPending ? ['asia:cancel-warning'] : []), 'us:cancel-warning'],
    'Cleanup retries only unresolved notices, never completed regions or already-cancelled warnings');
  assert.equal(records.usWarningCancellation.phase, 'cancelled');
}

{
  const calls = [], original = Error('Retry EU verification failed');
  await assert.rejects(runRegionalRollout({ overlap: false, prepared: { us: { phase: 'warned' }, asia: { phase: 'complete' } },
    remote: async (realm, action) => {
      calls.push(`${realm.id}:${action}`); assert.equal(realm.id, 'us'); assert.equal(action, 'cancel-warning');
      return { realm: realm.id, phase: 'cancelled' };
    }, deployEu: async () => { calls.push('eu:verify'); throw original; }, record: () => {} }), error => error === original);
  assert.deepEqual(calls, ['eu:verify', 'us:cancel-warning'], 'Previously held warnings still cancel when overlap is disabled on retry');
}
console.log('PASS regional rollout: capability-gated overlap, both warning acknowledgements, EU verification before regional activation, partial/invalid warning and EU-failure cancellation, retained cleanup errors, committed-state recovery, interrupted signal/cancellation reconciliation and legacy fallback.');

const key = curve => generateKeyPairSync('ec', { namedCurve: curve }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const activationEnv = { MOSSVALE_ACTIVATE_APPLE_IAP: 'true', APPLE_IAP_PRIVATE_KEY: key('prime256v1'), APPLE_IAP_KEY_ID: 'ABCDE12345',
  APPLE_IAP_ISSUER_ID: '12345678-abcd-abcd-abcd-123456789abc', MOBILE_PURCHASE_SANDBOX_ACCOUNTS: '1'.repeat(64),
  MOSSVALE_EU_BBA_APP_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', BBA_API_TOKEN: 'private-bba-credential-for-offline-check' };
assert.equal(appleActivation({}), null);
assert.equal(appleActivation({ ...activationEnv, MOSSVALE_ACTIVATE_APPLE_IAP: 'false' }), null);
const apple = appleActivation(activationEnv);
assert.equal(apple.hash, appleConfigurationHash(apple.settings));
assert.equal(appleConfigurationHash({}), null);
assert.equal(appleConfigurationHash(Object.fromEntries(Object.entries(apple.settings).reverse())), apple.hash);
for (const name of APPLE_KEYS) assert.notEqual(appleConfigurationHash({ ...apple.settings, [name]: 'different' }), apple.hash);
for (const bad of [{ APPLE_IAP_PRIVATE_KEY: 'invalid-private-key' }, { APPLE_IAP_PRIVATE_KEY: key('secp384r1') },
  { APPLE_IAP_KEY_ID: '' }, { APPLE_IAP_ISSUER_ID: '' }, { MOBILE_PURCHASE_SANDBOX_ACCOUNTS: '*' }, { BBA_API_TOKEN: '' }]) {
  assert.throws(() => appleActivation({ ...activationEnv, ...bad }), error =>
    !String(error).includes(activationEnv.APPLE_IAP_PRIVATE_KEY) && !String(error).includes(activationEnv.BBA_API_TOKEN));
}
const app = { id: apple.appId, sourceType: 'github-nodejs', replicas: 1, githubRepositoryOwner: 'trappyon', githubRepositoryName: 'mossvale',
  githubBranch: 'production', autoDeployPush: true, autoDeployPullRequest: false, lastError: null, status: 'ready', settingsPending: false,
  environmentVariableNames: ['DATABASE_URL', 'MOSSVALE_DEPLOY_TOKEN'], updatedAt: 'before', customDomain: 'mossvale.world' };
const before = appleAppBefore(app, apple.appId);
const configured = { ...app, updatedAt: 'after', environmentVariableNames: [...app.environmentVariableNames, ...APPLE_KEYS] };
appleAppAfter(configured, apple.appId, before);
assert.throws(() => appleAppAfter({ ...configured, customDomain: 'other.invalid' }, apple.appId, before));
assert.throws(() => appleAppAfter({ ...configured, environmentVariableNames: APPLE_KEYS }, apple.appId, before));
assert.throws(() => appleAppBefore(configured, apple.appId));
assert.throws(() => appleActivationPhase(previous, app, apple), /compatibility release/);
assert.equal(appleActivationPhase({ ...previous, appleIapHash: null }, app, apple), 'initial');
// Lost PATCH response: names can be present before the replacement starts. Wait for the exact private fingerprint.
assert.equal(appleActivationPhase({ ...drained, appleIapHash: null }, { ...configured, settingsPending: true }, apple), 'pending');
for (const status of [{ ...previous, state: 'idle' }, drained, { revision: target, state: 'idle', instanceId: 'new' }]) {
  assert.equal(appleActivationPhase({ ...status, appleIapHash: apple.hash }, configured, apple), 'configured');
}
assert.throws(() => appleActivationPhase({ ...previous, appleIapHash: '0'.repeat(64) }, configured, apple));
assert.throws(() => appleActivationPhase({ ...previous, appleIapHash: null }, { ...app, environmentVariableNames: ['APPLE_IAP_KEY_ID'] }, apple));
assert.throws(() => appleActivationPhase({ ...previous, appleIapHash: null }, { ...configured, id: 'wrong' }, apple));
const publicBefore = { auth: { issuer: 'unchanged' }, mobilePurchases: { apple: false, google: false } };
assert.deepEqual(applePublicConfig(publicBefore), { ...publicBefore, mobilePurchases: { apple: true, google: false } });
assert.equal(publicBefore.mobilePurchases.apple, false);
assert.deepEqual(await dockerConfigBaselines({ us: { phase: 'complete', publicConfig: publicBefore }, asia: { phase: 'starting', publicConfig: publicBefore } },
  async () => { throw Error('Stopped realm must not require a live config endpoint to resume'); }), [publicBefore, publicBefore]);
assert.deepEqual(await dockerConfigBaselines({}, async () => publicBefore), [publicBefore, publicBefore]);
await assert.rejects(dockerConfigBaselines({ us: { publicConfig: null }, asia: { publicConfig: publicBefore } }), /Invalid saved/);
await assert.rejects(dockerConfigBaselines({}, async () => { throw Error('Unavailable original baseline'); }), /Unavailable original/);

const workflow = readFileSync(new URL('../.github/workflows/production.yml', import.meta.url), 'utf8');
assert(workflow.includes('cancel-in-progress: false'), 'A final save must never be canceled by a newer push');
assert(workflow.includes('needs: [checks, image]'));
assert.match(workflow, /if \[ -n "\$ALCHEMY_WALLET_API_KEY" \]; then\s+node scripts\/turnkey-activation-preflight\.mjs --chain-only\s+fi\s+node scripts\/rollout\.mjs/, 'Paid chain reads must pass before rollout can warn or drain players, including after activation');
assert(workflow.includes("vars.MOSSVALE_PRODUCTION_ENABLED == 'true'"), 'Bootstrap must explicitly activate production');
assert(!workflow.includes('pull_request_target'), 'Untrusted pull requests must never receive deployment access');
assert(workflow.includes('vars.MOSSVALE_ACTIVATE_APPLE_IAP'));
assert(workflow.includes('vars.MOSSVALE_ACTIVATE_TURNKEY'));
for (const name of TURNKEY_KEYS) assert(workflow.includes(`${name === 'ALCHEMY_WALLET_API_KEY' ? 'secrets' : 'vars'}.${name}`), `Missing Turnkey deployment setting ${name}`);
assert(workflow.includes('secrets.MOSSVALE_BBA_API_TOKEN'));
assert(workflow.includes('BBA_API_TOKEN: ${{ secrets.MOSSVALE_BBA_API_TOKEN || secrets.BBA_API_TOKEN }}'), 'The explicit existing BBA credential fallback stays within the pinned game-app rollout');
for (const realm of ['US', 'ASIA']) {
  assert(workflow.includes(`secrets.MOSSVALE_${realm}_DEPLOY_KEY`));
  assert(workflow.includes(`secrets.MOSSVALE_${realm}_KNOWN_HOSTS`));
}
console.log('PASS rollout: successful drain only, process replacement/replay/concurrent target rejection, newer-push recovery, production ancestry, both candidate preparations, partial evidence, realm identity, and CI gates.');

const turnkeyEnvironment = { MOSSVALE_ACTIVATE_TURNKEY: 'true', TURNKEY_ORGANIZATION_ID: '11111111-1111-4111-8111-111111111111',
  TURNKEY_AUTH_PROXY_CONFIG_ID: '22222222-2222-4222-8222-222222222222', ALCHEMY_WALLET_API_KEY: 'private-alchemy-offline-fixture',
  ALCHEMY_GAS_POLICY_ID: '33333333-3333-4333-8333-333333333333', TURNKEY_SPONSOR_MAX_OPERATION_WEI: '10',
  TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI: '100', TURNKEY_SPONSOR_WALLET_DAILY_WEI: '100', TURNKEY_SPONSOR_GLOBAL_DAILY_WEI: '1000',
  TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI: '1', TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS: '100',
  MOSSVALE_EU_BBA_APP_ID: app.id, BBA_API_TOKEN: activationEnv.BBA_API_TOKEN };
assert.equal(turnkeyActivation({}), null);
assert.equal(turnkeyActivation({ ...turnkeyEnvironment, MOSSVALE_ACTIVATE_TURNKEY: 'false' }), null);
const turnkey = turnkeyActivation(turnkeyEnvironment);
assert.equal(turnkey.hash, turnkeyConfigurationHash(turnkey.settings));
assert.equal(turnkeyConfigurationHash({}), null);
assert.equal(turnkeyConfigurationHash(Object.fromEntries(Object.entries(turnkey.settings).reverse())), turnkey.hash);
for (const name of TURNKEY_KEYS) {
  assert.notEqual(turnkeyConfigurationHash({ ...turnkey.settings, [name]: 'different' }), turnkey.hash);
  assert.throws(() => turnkeyActivation({ ...turnkeyEnvironment, [name]: undefined }), /required/);
}
for (const change of [{ TURNKEY_ORGANIZATION_ID: 'invalid' }, { ALCHEMY_WALLET_API_KEY: '${injected}' },
  { TURNKEY_SPONSOR_MAX_OPERATION_WEI: '101' }, { TURNKEY_SPONSOR_GLOBAL_DAILY_WEI: '99' },
  { TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI: '0' }, { TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS: '1000001' },
  { MOSSVALE_ACTIVATE_TURNKEY: 'yes' }, { BBA_API_TOKEN: '' }]) {
  assert.throws(() => turnkeyActivation({ ...turnkeyEnvironment, ...change }), error =>
    !String(error).includes(turnkeyEnvironment.ALCHEMY_WALLET_API_KEY) && !String(error).includes(activationEnv.BBA_API_TOKEN));
}
const turnkeyBefore = turnkeyAppBefore(app, app.id);
const turnkeyApp = { ...app, updatedAt: 'after', environmentVariableNames: [...app.environmentVariableNames, ...TURNKEY_KEYS] };
turnkeyAppAfter(turnkeyApp, app.id, turnkeyBefore);
assert.throws(() => turnkeyAppAfter({ ...turnkeyApp, replicas: 2 }, app.id, turnkeyBefore));
assert.throws(() => turnkeyAppAfter({ ...turnkeyApp, environmentVariableNames: TURNKEY_KEYS }, app.id, turnkeyBefore));
assert.throws(() => turnkeyAppBefore(turnkeyApp, app.id));
assert.throws(() => turnkeyAppBefore({ ...app, sourceType: 'container', id: '347997b7-50dd-490b-aa22-a2627e0732e8' }, app.id), /pinned/,
  'Reusing a BBA credential cannot select or modify the separate authentication app');
assert.throws(() => turnkeyActivationPhase(previous, app, turnkey), /compatibility release/);
assert.equal(turnkeyActivationPhase({ ...previous, turnkeyHash: null }, app, turnkey), 'initial');
assert.equal(turnkeyActivationPhase({ ...drained, turnkeyHash: null, finalSave: true, admissionHeld: true }, { ...turnkeyApp, settingsPending: true }, turnkey, target), 'pending');
assert.throws(() => turnkeyActivationPhase({ ...previous, state: 'idle', turnkeyHash: null }, turnkeyApp, turnkey, target), /saved EU drain/);
assert.throws(() => turnkeyActivationPhase({ ...drained, turnkeyHash: null, finalSave: true, admissionHeld: true }, turnkeyApp, turnkey, 'c'.repeat(40)), /saved EU drain/);
for (const status of [previous, drained, { revision: target, state: 'idle', instanceId: 'new' }])
  assert.equal(turnkeyActivationPhase({ ...status, turnkeyHash: turnkey.hash }, turnkeyApp, turnkey), 'configured');
assert.throws(() => turnkeyActivationPhase({ ...previous, turnkeyHash: '0'.repeat(64) }, turnkeyApp, turnkey), /rotate/);
assert.throws(() => turnkeyActivationPhase({ ...previous, turnkeyHash: null }, { ...app, environmentVariableNames: [TURNKEY_KEYS[0]] }, turnkey), /Partial/);
const collections = { petsContract: '0x' + 'a'.repeat(40) };
const enabledWalletConfig = turnkeyPublicConfig(publicBefore, turnkey, collections);
assert.deepEqual(enabledWalletConfig, { ...publicBefore, turnkey: { organizationId: turnkey.settings.TURNKEY_ORGANIZATION_ID,
  authProxyConfigId: turnkey.settings.TURNKEY_AUTH_PROXY_CONFIG_ID, gasFunding: true, collections } });
assert(!JSON.stringify(enabledWalletConfig).includes(turnkey.settings.ALCHEMY_WALLET_API_KEY));
assert.throws(() => turnkeyPublicConfig(publicBefore, turnkey, { apiKey: 'secret' }));
assert.throws(() => turnkeyPublicConfig(enabledWalletConfig, turnkey, {}), /collections changed/);
assert.equal(canOverlapWarnings(warningReady, previous, target, turnkey), false, 'Turnkey activation keeps two complete EU warning/save cycles');
console.log('PASS Turnkey activation: explicit limits, secret-free fingerprints, gate-off compatibility, exact initial/resumed BBA settings and restricted public changes.');

// The whole barrier must succeed before migration; restart resumes the same committed epoch.
async function barrier(failAt, resumed = false) {
  const calls = [], record = () => {}, prepared = {us:{economyBarrierVersion:1},asia:{economyBarrierVersion:1}};
  const old = {...previous,economyBarrierVersion:1};
  const eu = {...old,state:'drained',targetRevision:target,finalSave:true,admissionHeld:true,drainedAt:Date.now()};
  const proofs = Object.fromEntries(['us','asia'].map(realm=>[realm,{realm,finalSave:true,restartHeld:true,instanceId:realm}]));
  let migrated = resumed, armed = false, stopped = new Set(), verified = false;
  const touch = name => {calls.push(name);if(name===failAt)throw Error('injected '+name);};
  const state = () => ({version:migrated?1:0,maintenance:armed&&!migrated,targetRevision:armed||migrated?target:null,
    ...(migrated?{migration:{revision:target,proof:{realms:{eu}}}}:{})});
  const work = runEconomyBarrier({revision:target,previous:old,prepared,record,
    remote:async(realm,action,proof)=>{
      touch(realm.id+':'+action);
      if(action==='economy-arm')armed=true;
      if(action==='economy-drain'){assert(armed);stopped.add(realm.id);}
      if(action==='economy-backup')assert.equal(stopped.size,3);
      if(action==='economy-migrate'){assert.equal(stopped.size,3);assert.deepEqual(Object.keys(proof.realms).sort(),['asia','eu','us']);migrated=true;}
      if(action==='economy-start')assert(migrated);
      if(action==='economy-enable')assert(verified);
      return {realm:realm.id,economy:{...state(),exchangeEnabled:action==='economy-enable'},drainProof:proofs[realm.id],backup:{sha256:'f'.repeat(64),bytes:1,at:Date.now()}};
    },drain:async()=>{touch('eu:drain');assert(armed);stopped.add('eu');return eu;},deployment:async()=>eu,
    promote:async()=>{touch('eu:promote');assert(migrated);},
    verifyAll:async()=>{touch('verify');verified=true;return ['eu','us','asia'].map(realm=>({realm,economyVersion:1}));}});
  if(failAt){await assert.rejects(work,/injected/);assert(!calls.includes('us:economy-enable'));if(['eu:drain','asia:economy-drain','us:economy-backup'].includes(failAt))assert(!calls.includes('eu:promote'));}
  else {await work;assert(calls.includes('us:economy-enable'));if(resumed)assert(!calls.includes('us:economy-arm')&&!calls.includes('us:economy-migrate'));}
}
await barrier(); await barrier(undefined,true);
for(const failure of ['eu:drain','asia:economy-drain','us:economy-backup','us:economy-migrate','eu:promote','asia:economy-start','verify'])await barrier(failure);
console.log('PASS economy barrier: all-realm stop before migration, failed phases cannot enable exchange, and committed migration resumes without another reset.');
await import('./check-catalog-rollout.mjs');
