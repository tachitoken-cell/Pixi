import assert from 'node:assert/strict';
import { createPrivateKey } from 'node:crypto';
import { APPLE_ACTIVATION_KEYS, appleConfigurationHash } from '../src/deployment-control.mjs';

export const APPLE_KEYS = APPLE_ACTIVATION_KEYS;

export function appleActivation(env) {
  if (!env.MOSSVALE_ACTIVATE_APPLE_IAP || env.MOSSVALE_ACTIVATE_APPLE_IAP === 'false') return null;
  assert.equal(env.MOSSVALE_ACTIVATE_APPLE_IAP, 'true', 'Invalid Apple activation gate');
  const settings = Object.fromEntries(APPLE_KEYS.map(key => [key, env[key]]));
  assert(APPLE_KEYS.every(key => typeof settings[key] === 'string'), 'All four Apple activation secrets are required');
  assert(/^[A-Z0-9]{10}$/.test(settings.APPLE_IAP_KEY_ID), 'Invalid Apple key identifier');
  assert(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(settings.APPLE_IAP_ISSUER_ID), 'Invalid Apple issuer identifier');
  assert(/^[a-f\d]{64}(?:,[a-f\d]{64}){0,19}$/.test(settings.MOBILE_PURCHASE_SANDBOX_ACCOUNTS), 'Explicit review account hashes are required');
  try {
    const key = createPrivateKey(settings.APPLE_IAP_PRIVATE_KEY);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw Error();
    settings.APPLE_IAP_PRIVATE_KEY = key.export({ type: 'pkcs8', format: 'pem' }).toString();
  } catch { throw Error('Invalid Apple P-256 signing key'); }
  assert(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(env.MOSSVALE_EU_BBA_APP_ID || ''), 'A pinned EU BBA app ID is required');
  assert(typeof env.BBA_API_TOKEN === 'string' && env.BBA_API_TOKEN.length >= 20 && !/\s/.test(env.BBA_API_TOKEN), 'BBA deployment access is required');
  return { settings, hash: appleConfigurationHash(settings), appId: env.MOSSVALE_EU_BBA_APP_ID, token: env.BBA_API_TOKEN };
}

export function applePublicConfig(baseline) {
  assert(baseline.mobilePurchases && typeof baseline.mobilePurchases.apple === 'boolean', 'Missing public Apple purchase status');
  return { ...baseline, mobilePurchases: { ...baseline.mobilePurchases, apple: true } };
}

export function appleAppSnapshot(app, appId, ready = true) {
  assert(app?.id === appId && app.sourceType === 'github-nodejs' && app.replicas === 1
    && app.githubRepositoryOwner === 'trappyon' && app.githubRepositoryName === 'mossvale'
    && app.githubBranch === 'production' && app.autoDeployPush === true && app.autoDeployPullRequest === false,
  'BBA app is not the pinned single-replica Mossvale production app');
  assert(!app.lastError && (!ready || app.status === 'ready' && app.settingsPending === false), 'BBA app settings are not ready');
  assert(Array.isArray(app.environmentVariableNames), 'BBA environment names are unavailable');
  const { status, settingsPending, lastError, updatedAt, environmentVariableNames, ...unchanged } = app;
  return { unchanged, names: [...environmentVariableNames].sort(), updatedAt };
}

export function appleActivationPhase(status, app, activation) {
  appleAppSnapshot(app, activation.appId, false);
  assert(Object.hasOwn(status, 'appleIapHash'), 'Deploy the Apple activation compatibility release with its gate off first');
  assert(status.appleIapHash === null || status.appleIapHash === activation.hash, 'EU has different Apple settings; activation cannot rotate credentials');
  assert(Array.isArray(app?.environmentVariableNames), 'BBA environment names are unavailable');
  const present = APPLE_KEYS.filter(key => app.environmentVariableNames.includes(key)).length;
  if (status.appleIapHash === activation.hash) {
    appleAppSnapshot(app, activation.appId);
    assert.equal(present, APPLE_KEYS.length, 'BBA is missing activated Apple settings');
    return 'configured';
  }
  if (present === APPLE_KEYS.length) return 'pending'; // Reconcile an uncertain PATCH by runtime fingerprint; never repeat it.
  assert.equal(present, 0, 'Partial Apple settings require private reconciliation');
  appleAppBefore(app, activation.appId);
  return 'initial';
}

export function appleAppBefore(app, appId) {
  const snapshot = appleAppSnapshot(app, appId);
  assert(APPLE_KEYS.every(key => !snapshot.names.includes(key)), 'Apple settings already exist in BBA; reconcile the previous activation privately before retrying');
  return snapshot;
}

export function appleAppAfter(app, appId, before) {
  const after = appleAppSnapshot(app, appId);
  assert.deepEqual(after.unchanged, before.unchanged, 'BBA changed unrelated app settings');
  assert.deepEqual(after.names, [...before.names, ...APPLE_KEYS].sort(), 'BBA changed unrelated environment names');
}
