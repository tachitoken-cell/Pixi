import assert from 'node:assert/strict';
import { Wallet, getAddress, ZeroAddress } from 'ethers';
import { ARENA_ACTIVATION_KEYS, arenaConfigurationHash } from '../src/deployment-control.mjs';
import { appleAppSnapshot } from './apple-iap-activation.mjs';

export const ARENA_KEYS = ARENA_ACTIVATION_KEYS;

export function arenaActivation(env) {
  if (!env.MOSSVALE_ACTIVATE_ARENA || env.MOSSVALE_ACTIVATE_ARENA === 'false') return null;
  assert.equal(env.MOSSVALE_ACTIVATE_ARENA, 'true', 'Invalid arena activation gate');
  const settings = Object.fromEntries(ARENA_KEYS.map(key => [key, env[key]]));
  let authority;
  try {
    assert(ARENA_KEYS.every(key => typeof settings[key] === 'string' && settings[key].length));
    assert(getAddress(settings.MOSS_ARENA_CONTRACT) !== ZeroAddress);
    assert(/^0x[\da-f]{64}$/i.test(settings.MOSS_ARENA_AUTHORITY_KEY));
    authority = new Wallet(settings.MOSS_ARENA_AUTHORITY_KEY).address;
    assert(/^https:\/\/robinhood-mainnet\.g\.alchemy\.com\/v2\/[A-Za-z0-9_-]{8,256}$/.test(settings.MOSS_ARENA_RPC_URL));
  } catch { throw Error('Invalid arena contract, signing key or Robinhood Alchemy RPC setting'); }
  assert(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(env.MOSSVALE_EU_BBA_APP_ID || ''), 'A pinned EU BBA app ID is required');
  assert(typeof env.BBA_API_TOKEN === 'string' && env.BBA_API_TOKEN.length >= 20 && !/\s/.test(env.BBA_API_TOKEN), 'BBA deployment access is required');
  return { settings, authority, hash: arenaConfigurationHash(settings), appId: env.MOSSVALE_EU_BBA_APP_ID, token: env.BBA_API_TOKEN };
}

export function arenaActivationPhase(status, app, activation, targetRevision) {
  appleAppSnapshot(app, activation.appId, false);
  assert(Object.hasOwn(status, 'arenaHash'), 'Deploy the arena compatibility release with its gate off first');
  assert(status.arenaHash === null || status.arenaHash === activation.hash, 'EU has different arena settings; activation cannot rotate a contract, key or RPC');
  const present = ARENA_KEYS.filter(key => app.environmentVariableNames.includes(key)).length;
  if (status.arenaHash === activation.hash) {
    appleAppSnapshot(app, activation.appId);
    assert.equal(present, ARENA_KEYS.length, 'BBA is missing activated arena settings');
    return 'configured';
  }
  if (present === ARENA_KEYS.length) {
    assert(/^[a-f0-9]{40}$/.test(targetRevision || '') && status.state === 'drained' && status.targetRevision === targetRevision
      && status.finalSave === true && status.admissionHeld === true, 'An uncertain arena update requires this release\'s saved EU drain');
    return 'pending'; // Reconcile the runtime fingerprint; never repeat an uncertain PATCH.
  }
  assert.equal(present, 0, 'Partial arena settings require private reconciliation');
  arenaAppBefore(app, activation.appId);
  return 'initial';
}

export function arenaAppBefore(app, appId) {
  const snapshot = appleAppSnapshot(app, appId);
  assert(ARENA_KEYS.every(key => !snapshot.names.includes(key)), 'Arena settings already exist in BBA; reconcile the previous activation privately');
  return snapshot;
}

export function arenaAppAfter(app, appId, before) {
  const after = appleAppSnapshot(app, appId);
  assert.deepEqual(after.unchanged, before.unchanged, 'BBA changed unrelated app settings');
  assert.deepEqual(after.names, [...before.names, ...ARENA_KEYS].sort(), 'BBA changed unrelated environment names');
}
