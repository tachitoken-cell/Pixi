import assert from 'node:assert/strict';
import { TURNKEY_ACTIVATION_KEYS, turnkeyConfigurationHash } from '../src/deployment-control.mjs';
import { createTurnkeyConfig } from '../src/turnkey-config.mjs';
import { createTurnkeySponsorshipConfig } from '../src/turnkey-sponsorship.mjs';
import { appleAppSnapshot } from './apple-iap-activation.mjs';

export const TURNKEY_KEYS = TURNKEY_ACTIVATION_KEYS;

export function turnkeyActivation(env) {
  if (!env.MOSSVALE_ACTIVATE_TURNKEY || env.MOSSVALE_ACTIVATE_TURNKEY === 'false') return null;
  assert.equal(env.MOSSVALE_ACTIVATE_TURNKEY, 'true', 'Invalid Turnkey activation gate');
  const settings = Object.fromEntries(TURNKEY_KEYS.map(key => [key, env[key]]));
  assert(TURNKEY_KEYS.every(key => typeof settings[key] === 'string' && settings[key].length), 'All Turnkey activation settings and explicit budgets are required');
  try { assert(createTurnkeyConfig(settings) && createTurnkeySponsorshipConfig(settings)); }
  catch { throw Error('Invalid Turnkey activation settings or explicit sponsorship budgets'); }
  assert(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(env.MOSSVALE_EU_BBA_APP_ID || ''), 'A pinned EU BBA app ID is required');
  assert(typeof env.BBA_API_TOKEN === 'string' && env.BBA_API_TOKEN.length >= 20 && !/\s/.test(env.BBA_API_TOKEN), 'BBA deployment access is required');
  return { settings, hash: turnkeyConfigurationHash(settings), appId: env.MOSSVALE_EU_BBA_APP_ID, token: env.BBA_API_TOKEN };
}

export function turnkeyPublicConfig(baseline, activation, collections) {
  assert(collections && typeof collections === 'object' && !Array.isArray(collections)
    && Object.entries(collections).every(([key, value]) => ['petsContract', 'legacyPetsContract', 'housesContract'].includes(key)
      && typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value)), 'Invalid public wallet collections');
  if (baseline.turnkey) assert.deepEqual(collections, baseline.turnkey.collections, 'Wallet collections changed during activation');
  return { ...baseline, turnkey: { organizationId: activation.settings.TURNKEY_ORGANIZATION_ID,
    authProxyConfigId: activation.settings.TURNKEY_AUTH_PROXY_CONFIG_ID, gasFunding: true, collections } };
}

export function turnkeyActivationPhase(status, app, activation, targetRevision) {
  appleAppSnapshot(app, activation.appId, false);
  assert(Object.hasOwn(status, 'turnkeyHash'), 'Deploy the Turnkey compatibility release with its gate off first');
  assert(status.turnkeyHash === null || status.turnkeyHash === activation.hash, 'EU has different Turnkey settings; activation cannot rotate credentials or budgets');
  const present = TURNKEY_KEYS.filter(key => app.environmentVariableNames.includes(key)).length;
  if (status.turnkeyHash === activation.hash) {
    appleAppSnapshot(app, activation.appId);
    assert.equal(present, TURNKEY_KEYS.length, 'BBA is missing activated Turnkey settings');
    return 'configured';
  }
  if (present === TURNKEY_KEYS.length) {
    assert(/^[a-f0-9]{40}$/.test(targetRevision || '') && status.state === 'drained' && status.targetRevision === targetRevision
      && status.finalSave === true && status.admissionHeld === true, 'An uncertain Turnkey update requires this release\'s saved EU drain');
    return 'pending'; // Observe an uncertain PATCH; never repeat it.
  }
  assert.equal(present, 0, 'Partial Turnkey settings require private reconciliation');
  turnkeyAppBefore(app, activation.appId);
  return 'initial';
}

export function turnkeyAppBefore(app, appId) {
  const snapshot = appleAppSnapshot(app, appId);
  assert(TURNKEY_KEYS.every(key => !snapshot.names.includes(key)), 'Turnkey settings already exist in BBA; reconcile the previous activation privately before retrying');
  return snapshot;
}

export function turnkeyAppAfter(app, appId, before) {
  const after = appleAppSnapshot(app, appId);
  assert.deepEqual(after.unchanged, before.unchanged, 'BBA changed unrelated app settings');
  assert.deepEqual(after.names, [...before.names, ...TURNKEY_KEYS].sort(), 'BBA changed unrelated environment names');
}
