import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { getAddress, ZeroAddress } from 'ethers';
import { appleActivation, appleActivationPhase, appleAppBefore, appleAppAfter, applePublicConfig } from './apple-iap-activation.mjs';
import { turnkeyActivation, turnkeyActivationPhase, turnkeyAppBefore, turnkeyAppAfter, turnkeyPublicConfig } from './turnkey-activation.mjs';
import { turnkeyActivationPreflight } from './turnkey-activation-preflight.mjs';
import { arenaActivation, arenaActivationPhase, arenaAppBefore, arenaAppAfter } from './arena-activation.mjs';
import { arenaActivationPreflight } from './arena-activation-preflight.mjs';
import { socialProvidersFor } from '../src/social-providers.mjs';
import { parseAppUpdatePolicy } from '../mobile/app-update.ts';

const mobilePush = JSON.parse(readFileSync(new URL('../config/mobile-push.json', import.meta.url), 'utf8'));
assert(mobilePush && typeof mobilePush === 'object' && Object.keys(mobilePush).length === 1 && typeof mobilePush.enabled === 'boolean', 'Invalid mobile push policy');
const mobileAppUpdate = parseAppUpdatePolicy(JSON.parse(readFileSync(new URL('../config/mobile-app-updates.json', import.meta.url), 'utf8')));

const REPO = 'trappyon/mossvale';
const EU = 'https://mossvale.world';
const DOCKER_REALMS = [
  { id: 'us', origin: 'https://us.mossvale.world', host: '51.222.245.146', credential: 'US' },
  { id: 'asia', origin: 'https://asia.mossvale.world', host: '15.235.180.181', credential: 'ASIA' },
];
const sha = data => createHash('sha256').update(data).digest('hex');
const validSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function validateDrain(status, previous, target) {
  assert.equal(status.revision, previous.revision, 'EU process revision changed while draining');
  assert.equal(status.instanceId, previous.instanceId, 'EU restarted before drain was verified');
  assert.equal(status.targetRevision, target, 'Another deployment owns the EU drain');
  assert(['countdown', 'draining', 'drained'].includes(status.state), 'EU drain failed');
}

export function productionCommit(revision, previous, tree) {
  assert(validSha(revision) && validSha(previous) && validSha(tree), 'Invalid production commit');
  return { message: `Deploy tested Mossvale ${revision}`, tree, parents: [...new Set([revision, previous])] };
}

export function shouldSkipRevision(revision, mainRevision, previous) {
  // A newer push may supersede preparation, but must not strand a started rollout.
  return mainRevision !== revision && previous.targetRevision !== revision
    && !(previous.revision === revision && previous.state === 'idle');
}

export async function dockerPhase(action, execute, record, realms = DOCKER_REALMS) {
  assert(['prepare', 'warn', 'cancel-warning', 'deploy', 'economy-prepare', 'economy-drain', 'economy-start', 'catalog-drain', 'catalog-status', 'catalog-authorize', 'catalog-start'].includes(action), 'Invalid Docker release phase');
  const outcomes = await Promise.allSettled(realms.map(async realm => {
    const result = await execute(realm, action);
    assert.equal(result.realm, realm.id, 'Deployment host returned another realm');
    record(realm.id, result);
    return result;
  }));
  const failed = outcomes.flatMap((result, index) => result.status === 'rejected'
    ? [`${realms[index].id}: ${result.reason.message}`] : []);
  assert.equal(failed.length, 0, `${action} stopped; ${failed.join('; ')}`);
}

export function canOverlapWarnings(prepared, previous, revision, apple) {
  return !apple && previous.revision !== revision && DOCKER_REALMS.every(realm =>
    prepared[realm.id]?.warningVersion === 1 && ['prepared', 'warning-requested', 'warned', 'cancel-requested', 'cancelled'].includes(prepared[realm.id].phase));
}

export async function runRegionalRollout({ overlap, prepared = {}, remote, deployEu, record }) {
  const warned = new Set(DOCKER_REALMS.filter(realm => ['warning-requested', 'warned', 'cancel-requested'].includes(prepared[realm.id]?.phase)));
  try {
    // Resolve uncertain delivery even on retries where EU or the other region already finished.
    const pending = DOCKER_REALMS.filter(realm => ['warning-requested', 'cancel-requested'].includes(prepared[realm.id]?.phase));
    if (pending.length) await dockerPhase('cancel-warning', remote, (realm, result) => {
      record(`${realm}WarningCancellation`, result);
      assert.equal(result.phase, 'cancelled', `${realm} did not resolve its pending warning`);
      warned.delete(DOCKER_REALMS.find(value => value.id === realm));
    }, pending);
    if (overlap) {
      for (const realm of DOCKER_REALMS) warned.add(realm);
      await dockerPhase('warn', remote, (realm, result) => {
        record(`${realm}Warning`, result);
        assert(result.phase === 'warned' && result.warningVersion === 1 && /^[\w-]{1,128}$/.test(result.warningId || '')
          && Number.isFinite(Date.parse(result.warningAt)), `${realm} did not acknowledge its held warning`);
      });
    }
    await deployEu();
  } catch (error) {
    if (warned.size) {
      // Both requests may have arrived even if SSH lost one response. Helpers cancel only their own uncommitted notice.
      try { await dockerPhase('cancel-warning', remote, (realm, result) => record(`${realm}WarningCancellation`, result), [...warned]); }
      catch (cleanup) { record('warningCancellationError', { message: cleanup.message }); }
    }
    throw error;
  }
  // Commit regional shutdowns only after EU's public verification succeeded.
  await dockerPhase('deploy', remote, (realm, result) => record(`${realm}Activation`, result));
}

/** All writers must stop before the single shared-database migration; never start a partial barrier. */
export async function runEconomyBarrier({ revision, previous, prepared, remote, drain, deployment, promote, verifyAll, record }) {
  assert.equal(previous.economyBarrierVersion, 1, 'Install the compatible EU deployment control before economy activation');
  for (const realm of DOCKER_REALMS) assert.equal(prepared[realm.id]?.economyBarrierVersion, 1, `${realm.id} helper lacks the economy barrier`);
  const us = DOCKER_REALMS[0];
  let status = (await remote(us, 'economy-status')).economy;
  assert([0, 1].includes(status?.version), 'Unexpected shared economy version');
  if (status.targetRevision) assert.equal(status.targetRevision, revision, 'Another revision owns economy activation');
  if (status.version === 0) {
    assert(previous.revision !== revision, 'Initial economy activation requires a fresh revision after the compatibility release');
    const armed = await remote(us, 'economy-arm'); record('economyMaintenance', armed.economy);
    assert.equal(armed.economy.maintenance, true, 'Shared maintenance gate did not arm');
    const proofs = {};
    const outcomes = await Promise.allSettled([
      drain(previous).then(proof => { proofs.eu = { realm: 'eu', ...proof }; record('euDrain', proof); }),
      dockerPhase('economy-drain', remote, (realm, result) => { proofs[realm] = result.drainProof; record(`${realm}Drain`, result.drainProof); }),
    ]);
    for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
    const held = await deployment(); validateDrain(held, previous, revision);
    assert(held.state === 'drained' && held.finalSave && held.admissionHeld, 'EU final-save admission hold was lost');
    const backup = (await remote(us, 'economy-backup')).backup; record('economyBackup', backup);
    // Re-observe exact identities after the backup. Neither an interrupted drain nor a restart is a migration proof.
    const rechecked = await deployment(); validateDrain(rechecked, previous, revision);
    assert(rechecked.state === 'drained' && rechecked.finalSave && rechecked.admissionHeld, 'EU hold changed during backup');
    for (const realm of DOCKER_REALMS) {
      const check = await remote(realm, 'economy-status');
      assert.deepEqual(check.drainProof, proofs[realm.id], `${realm.id} stop proof changed during backup`);
    }
    const migrated = await remote(us, 'economy-migrate', { revision, realms: proofs, backup });
    status = migrated.economy; record('economyMigration', status);
  }
  assert(status.version === 1 && !status.maintenance && status.migration?.revision === revision, 'Economy migration did not commit');
  const oldEu = status.migration.proof.realms.eu;
  // A retry after a committed migration resumes replacement; it never resets balances again.
  await promote(oldEu);
  await dockerPhase('economy-start', remote, (realm, result) => record(`${realm}Activation`, result));
  const verified = await verifyAll();
  assert(verified.length === 3 && verified.every(value => value.economyVersion === 1), 'Every realm must verify the migrated economy');
  const enabled = await remote(us, 'economy-enable', { revision, realms: verified });
  assert(enabled.economy.exchangeEnabled === true, 'Exchange activation did not commit');
  record('economyActivation', enabled.economy);
  return enabled.economy;
}

export function catalogVersion(manifest) {
  const version = manifest.playerCatalogVersion === undefined ? 4 : manifest.playerCatalogVersion;
  assert(Number.isSafeInteger(version) && version >= 4, 'Invalid player catalog version');
  return version;
}

export function needsCatalogBarrier(manifest, euManifest, prepared) {
  const version = catalogVersion(manifest), oldEu = catalogVersion(euManifest);
  assert(version >= oldEu, 'Player catalog downgrade is unsafe');
  for (const realm of DOCKER_REALMS) {
    const state = prepared[realm.id], old = state?.oldCatalogVersion;
    if (manifest.playerCatalogVersion !== undefined) {
      assert(state?.catalogBarrierVersion === 1 && state.playerCatalogVersion === version
        && Number.isSafeInteger(old) && typeof state.catalogBarrierRequired === 'boolean',
      `${realm.id} lacks verified player catalog preparation`);
    }
    if (old !== undefined) assert(Number.isSafeInteger(old) && old >= 4 && old <= version, 'Regional player catalog downgrade is unsafe');
  }
  return version !== oldEu || DOCKER_REALMS.some(realm => prepared[realm.id]?.catalogBarrierRequired
    || prepared[realm.id]?.oldCatalogVersion !== undefined && prepared[realm.id].oldCatalogVersion !== version);
}

function catalogDrainProof(realm, status, version) {
  const hold = realm === 'eu' ? 'admissionHeld' : 'restartHeld';
  const proof = { realm, revision: status.revision, targetRevision: status.targetRevision, instanceId: status.instanceId,
    playerCatalogVersion: version, finalSave: status.finalSave, drainedAt: status.drainedAt, [hold]: status[hold] };
  assert((status.realm === undefined || status.realm === realm)
    && (status.playerCatalogVersion === undefined || status.playerCatalogVersion === version)
    && validSha(proof.revision) && validSha(proof.targetRevision) && proof.revision !== proof.targetRevision
    && typeof proof.instanceId === 'string' && proof.instanceId.length > 0 && proof.instanceId.length <= 256
    && Number.isSafeInteger(version) && version >= 4 && proof.finalSave === true && proof[hold] === true
    && Number.isSafeInteger(proof.drainedAt) && proof.drainedAt > 0, `${realm} lacks a catalog final-save proof`);
  return proof;
}

/** Persist all three stopped-writer proofs before the first new catalog writer can start. */
export async function runCatalogBarrier({ revision, image, playerCatalogVersion, previous, prepared, remote, drain, deployment, promote, verifyEu, record }) {
  assert.equal(catalogVersion({ playerCatalogVersion }), playerCatalogVersion);
  const saved = [];
  for (const realm of DOCKER_REALMS) {
    const state = prepared[realm.id];
    assert.equal(state?.catalogBarrierVersion, 1, `${realm.id} helper lacks the player catalog barrier`);
    assert.equal(state.playerCatalogVersion, playerCatalogVersion, `${realm.id} prepared another player catalog`);
    assert(Number.isSafeInteger(state.oldCatalogVersion) && state.oldCatalogVersion >= 4 && state.oldCatalogVersion <= playerCatalogVersion,
      `${realm.id} has an invalid catalog baseline`);
    if (state.catalogBarrierProof) saved.push(state.catalogBarrierProof);
  }
  let proof = saved[0];
  if (proof) {
    assert.deepEqual({ revision: proof.revision, image: proof.image, playerCatalogVersion: proof.playerCatalogVersion },
      { revision, image, playerCatalogVersion }, 'Saved catalog authorization targets another candidate');
    assert.deepEqual(Object.keys(proof.realms).sort(), ['asia', 'eu', 'us'], 'Every saved realm proof is required');
    for (const realm of ['eu', 'us', 'asia']) {
      const value = proof.realms[realm];
      assert.deepEqual(catalogDrainProof(realm, value, value.playerCatalogVersion), value, 'Invalid saved catalog proof');
      assert(value.targetRevision === revision && value.playerCatalogVersion <= playerCatalogVersion, 'Saved catalog target changed');
      if (realm !== 'eu') assert(value.revision === prepared[realm].oldRevision && value.playerCatalogVersion === prepared[realm].oldCatalogVersion,
        'Saved catalog baseline changed');
    }
    for (const other of saved) assert.deepEqual(other, proof, 'Regional catalog authorizations disagree');
  }
  if (previous.revision === revision) {
    assert(saved.length === 2 && previous.state === 'idle' && previous.instanceId !== proof.realms.eu.instanceId,
      'A started EU catalog needs both saved all-realm authorizations');
  } else {
    if (proof) assert(previous.revision === proof.realms.eu.revision && previous.instanceId === proof.realms.eu.instanceId,
      'EU baseline changed after partial catalog authorization');
    const oldEuVersion = proof?.realms.eu.playerCatalogVersion ?? prepared.eu?.oldCatalogVersion;
    assert(Number.isSafeInteger(oldEuVersion) && oldEuVersion >= 4 && oldEuVersion <= playerCatalogVersion, 'EU catalog baseline is unavailable');
    const realms = {};
    const outcomes = await Promise.allSettled([
      drain(previous).then(status => {
        validateDrain(status, previous, revision);
        assert.equal(status.state, 'drained', 'EU catalog drain is incomplete');
        realms.eu = catalogDrainProof('eu', status, oldEuVersion);
        record('euDrain', realms.eu);
      }),
      dockerPhase('catalog-drain', remote, (realm, result) => {
        assert.equal(result.phase, 'stopped', `${realm} catalog writer did not stop`);
        realms[realm] = catalogDrainProof(realm, result.drainProof, prepared[realm].oldCatalogVersion);
        assert.equal(realms[realm].revision, prepared[realm].oldRevision, 'Regional catalog baseline changed');
        assert.equal(realms[realm].targetRevision, revision, 'Regional catalog drain targets another revision');
        record(`${realm}Drain`, realms[realm]);
      }),
    ]);
    for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
    const observed = { revision, image, playerCatalogVersion, realms };
    if (proof) assert.deepEqual(observed, proof, 'Catalog drain identities changed after partial authorization');
    else proof = observed;
    const held = await deployment(); validateDrain(held, proof.realms.eu, revision);
    assert.deepEqual(catalogDrainProof('eu', held, proof.realms.eu.playerCatalogVersion), proof.realms.eu, 'EU catalog hold changed');
    await dockerPhase('catalog-status', remote, (realm, result) => {
      assert.equal(result.phase, 'stopped', `${realm} writer restarted before catalog authorization`);
      assert.deepEqual(result.drainProof, proof.realms[realm], `${realm} catalog stop changed`);
    });
    await dockerPhase('catalog-authorize', (realm, action) => remote(realm, action, proof), (realm, result) => {
      assert.deepEqual(result.catalogBarrierProof, proof, `${realm} did not persist the complete catalog authorization`);
      record(`${realm}CatalogAuthorization`, result.catalogBarrierProof);
    });
  }
  // Also runs on retries after EU started; each helper validates its exact old stop or exact candidate.
  await dockerPhase('catalog-status', remote, (realm, result) => {
    assert.deepEqual(result.catalogBarrierProof, proof, `${realm} catalog authorization changed`);
    assert.deepEqual(result.drainProof, proof.realms[realm], `${realm} catalog identity changed`);
    if (previous.revision !== revision) assert.equal(result.phase, 'stopped', `${realm} started before EU promotion`);
  });
  await promote(proof.realms.eu);
  await verifyEu();
  await dockerPhase('catalog-start', remote, (realm, result) => record(`${realm}Activation`, result));
  return proof;
}

export async function dockerConfigBaselines(prepared, read = publicConfig) {
  return Promise.all(DOCKER_REALMS.map(realm => {
    const saved = prepared[realm.id]?.publicConfig;
    // Updated helpers retain the pre-warning baseline even when their game is stopped.
    // Older installed helpers keep the original live-config requirement.
    if (saved !== undefined) {
      assert(saved && typeof saved === 'object' && !Array.isArray(saved), 'Invalid saved public configuration');
      return saved;
    }
    return read(realm.origin);
  }));
}

async function json(url, options = {}) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000), ...options });
  if (!response.ok) throw Object.assign(Error(`Request failed (${response.status}): ${new URL(url).pathname}`), { status: response.status });
  return response.json();
}

export async function readWithTransientRetry(read, pause = sleep) {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      if (attempt === 2 || !([502, 503, 504].includes(error.status) || ['TypeError', 'TimeoutError'].includes(error.name))) throw error;
      await pause(2000 * (attempt + 1));
    }
  }
}

export async function verifyAsset(origin, realm, path, expected) {
  assert(/^[\w./-]+$/.test(path) && !path.split('/').includes('..'), 'Invalid manifest asset path');
  try {
    await readWithTransientRetry(async () => {
      const controller = new AbortController();
      // Retain the watchdog through body consumption, including stalled regional downloads.
      const timer = setTimeout(() => controller.abort(new DOMException('Asset download timed out', 'TimeoutError')), 180000);
      try {
        const result = await fetch(origin + '/' + path, { redirect: 'error', signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } });
        if (!result.ok) throw Object.assign(Error(`HTTP ${result.status}`), { status: result.status });
        if (/\.(?:png|jpe?g|webp|svg)$/.test(path)) assert(result.headers.get('content-type')?.startsWith('image/'), 'Image Content-Type is incompatible with the updater');
        assert.equal(sha(Buffer.from(await result.arrayBuffer())), expected, 'Asset hash differs from the checked build');
      } finally { clearTimeout(timer); }
    });
  } catch (error) { throw Error(`${realm} asset ${path}: ${error.message}`, { cause: error }); }
}

async function publicConfig(origin) { return json(origin + '/api/config'); }
export function verifyPublicConfig(actual, baseline, currentRelease = true, reviewedArenaContract = process.env.MOSS_ARENA_CONTRACT) {
  // Older Mossvale releases omitted the shared realm's provider defaults. Preserve explicit overrides.
  const socialProviders = !Object.hasOwn(baseline, 'socialProviders') && socialProvidersFor(baseline.keycloak);
  // New clients can review arena transactions using the existing, explicitly reviewed deployment address.
  let turnkey = baseline.turnkey;
  if (currentRelease && turnkey && !Object.hasOwn(turnkey, 'arenaContract') && Object.hasOwn(actual.turnkey || {}, 'arenaContract')) {
    const arenaContract = getAddress(reviewedArenaContract);
    assert.notEqual(arenaContract, ZeroAddress, 'Public arena configuration needs a reviewed nonzero contract');
    turnkey = { ...turnkey, arenaContract };
  }
  // These reviewed manifests intentionally control additions and later policy changes.
  // A conflicting host override must fail verification, not silently change the target.
  assert.deepEqual(actual, { ...baseline, ...(turnkey ? { turnkey } : {}), ...(socialProviders ? { socialProviders } : {}), ...(currentRelease ? { mobilePush, mobileAppUpdate } : {}) }, 'Public configuration changed unexpectedly');
}
async function verify(origin, realm, manifest, baseline, turnkey, currentRelease = true) {
  const health = await readWithTransientRetry(() => json(origin + '/api/health'));
  assert(health.ok && health.available && health.realmId === realm, `${realm} is unavailable`);
  const config = await readWithTransientRetry(() => publicConfig(origin));
  verifyPublicConfig(config, turnkey ? turnkeyPublicConfig(baseline, turnkey, config.turnkey?.collections) : baseline, currentRelease);
  const published = await readWithTransientRetry(() => json(origin + '/release.json', { headers: { 'Cache-Control': 'no-cache' } }));
  assert.deepEqual(published, manifest, `${realm} release manifest differs from the checked build`);
  const paths = Object.keys(manifest.assets).filter(path => path === 'index.html' || path === 'sw.js'
    || path === 'favicon.png' || path.startsWith('assets/') || path.startsWith('nfts/') || path.endsWith('.webp')
    || path.startsWith('collision/') || ['models/deed-cottages-merchants.glb', 'models/climbing-animations.glb', 'models/town-biomes.glb', 'models/world-feedback-kit.glb'].includes(path));
  // Four downloads at a time keep large artwork checks from overwhelming the origin.
  for (let i = 0; i < paths.length; i += 4) await Promise.all(paths.slice(i, i + 4).map(path => verifyAsset(origin, realm, path, manifest.assets[path])));
  for (const kind of ['ping', 'jwt', 'origin']) await new Promise((resolve, reject) => {
    const socket = new WebSocket(origin.replace('https:', 'wss:') + '/socket', { origin: kind === 'origin' ? 'https://rollout.invalid' : EU });
    const done = error => { clearTimeout(timer); socket.removeAllListeners(); socket.on('error', () => {}); socket.terminate(); error ? reject(error) : resolve(); };
    const timer = setTimeout(() => done(Error(`${realm} WebSocket ${kind} timed out`)), 10000);
    socket.on('error', done);
    socket.on('open', () => { if (kind === 'ping') socket.ping('release'); else if (kind === 'jwt') socket.send(JSON.stringify({ type: 'join', realmId: realm, accessToken: 'invalid' })); });
    socket.on('pong', data => { if (kind === 'ping') done(data.toString() === 'release' ? undefined : Error('Wrong pong')); });
    socket.on('close', code => done(kind !== 'ping' && code === (kind === 'jwt' ? 4401 : 4403) ? undefined : Error(`${realm} unexpected WebSocket close`)));
  });
  return { realm, revision: manifest.revision, verifiedAt: new Date().toISOString(), assets: paths.length, configPreserved: true, sockets: true,
    ...(health.economy ? { economyVersion: health.economy.version, exchangeEnabled: health.economy.exchangeEnabled } : {}) };
}

async function main() {
  const apple = appleActivation(process.env); // Validate credentials before staging or warning any players.
  const turnkey = turnkeyActivation(process.env);
  const arena = arenaActivation(process.env);
  assert([undefined, '', 'false', 'true'].includes(process.env.MOSSVALE_ACTIVATE_GOLD_ECONOMY), 'Invalid gold economy activation gate');
  const gold = process.env.MOSSVALE_ACTIVATE_GOLD_ECONOMY === 'true';
  assert([apple, turnkey, arena, gold].filter(Boolean).length <= 1, 'Run Apple, Turnkey, arena and gold economy activations in separate releases');
  const image = process.argv[2];
  assert(/^ghcr\.io\/trappyon\/mossvale-game@sha256:[a-f0-9]{64}$/.test(image), 'An immutable image is required');
  const manifest = JSON.parse(readFileSync('dist/release.json', 'utf8'));
  const revision = manifest.revision;
  assert(validSha(revision) && revision === process.env.GITHUB_SHA, 'Release must be the checked main commit');
  assert(process.env.GITHUB_REPOSITORY === REPO && process.env.GITHUB_REF === 'refs/heads/main', 'Production only deploys main');
  const token = process.env.MOSSVALE_DEPLOY_TOKEN;
  assert(/^[a-f0-9]{64}$/.test(token || ''), 'EU deployment credential is not configured');
  const githubToken = process.env.GITHUB_TOKEN;
  assert(githubToken && DOCKER_REALMS.every(realm => process.env[`MOSSVALE_${realm.credential}_SSH_KEY`]
    && process.env[`MOSSVALE_${realm.credential}_KNOWN_HOSTS`]), 'Deployment access is not configured for every realm');
  const github = (path, method = 'GET', body) => json(`https://api.github.com/repos/${REPO}/${path}`, { method,
    headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const deploymentRequest = (body) => json(EU + '/api/deployment', { method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  // Retry only idempotent observations; a lost drain response must never replay a mutation automatically.
  const deployment = body => body ? deploymentRequest(body) : readWithTransientRetry(() => deploymentRequest());
  const remote = (realm, action, proof) => new Promise((resolve, reject) => {
    const child = spawn('ssh', ['-T', '-i', process.env[`MOSSVALE_${realm.credential}_SSH_KEY`], '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${process.env[`MOSSVALE_${realm.credential}_KNOWN_HOSTS`]}`, '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4', `ubuntu@${realm.host}`], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 1800000);
    child.stdout.on('data', data => { if (output.length < 65536) output += data; });
    child.stderr.resume(); // Never relay remote configuration or credentials to CI logs.
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      try {
        assert.equal(code, 0, `${realm.id} ${action} stopped; inspect the host release record before retrying`);
        const result = JSON.parse(output.trim());
        assert.equal(result.revision, revision, `${realm.id} prepared a different commit`);
        assert.equal(result.image, image, `${realm.id} prepared a different image`);
        resolve(result);
      } catch (error) { reject(error); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ action, image, registryToken: githubToken, ...(apple ? { appleIap: apple.settings } : {}),
      ...(turnkey ? { turnkey: turnkey.settings } : {}), ...(arena ? { arena: arena.settings } : {}), ...(proof ? { proof } : {}) }));
  });
  const report = { revision, image, startedAt: new Date().toISOString() };
  mkdirSync('artifacts/deployment', { recursive: true });
  const record = () => writeFileSync('artifacts/deployment/result.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  let catalogStarted = false;
  const drain = async previous => {
      assert(previous.state === 'idle' || previous.targetRevision === revision, 'Another EU deployment is in progress');
      if (previous.state === 'idle') {
        if (!gold && !catalogStarted) assert.equal((await github('git/ref/heads/main')).object.sha, revision, 'Main advanced before the drain; rerun the newer release');
        await deployment({ expectedRevision: previous.revision, targetRevision: revision });
      }
      console.log('EU: player warning and final save in progress');
      const deadline = Date.now() + 480000;
      let drained;
      while (Date.now() < deadline) {
        try {
          const status = await deployment();
          validateDrain(status, previous, revision);
          if (status.state === 'drained') { drained = status; break; }
        } catch (error) {
          // Readiness can briefly remove the HTTP route while storage is closing.
          if (![502, 503, 504].includes(error.status) && error.name !== 'TypeError' && error.name !== 'TimeoutError') throw error;
        }
        await sleep(5000);
      }
      assert(drained, 'EU did not confirm its final save; production was not advanced');
      return drained;
  };
  try {
    const [head, initial] = await Promise.all([github('git/ref/heads/main'), deployment()]);
    let previous = initial;
    assert(validSha(previous.revision) && typeof previous.instanceId === 'string', 'EU has not installed deployment control');
    if (!gold && manifest.playerCatalogVersion === undefined && shouldSkipRevision(revision, head.object.sha, previous)) { report.skipped = 'A newer main commit is waiting for checks'; record(); return; }
    // Bootstrap must move BBA to this branch before production automation is enabled.
    const production = await github('git/ref/heads/production');
    assert(validSha(production.object.sha), 'Production branch is not configured');
    const [checkedCommit, priorPromotion] = await Promise.all([github(`git/commits/${revision}`), github(`git/commits/${production.object.sha}`)]);
    const tree = await github('git/trees', 'POST', { base_tree: checkedCommit.tree.sha,
      tree: [{ path: 'release-revision.txt', mode: '100644', type: 'blob', content: revision + '\n' }] });
    const alreadyPromoted = priorPromotion.tree.sha === tree.sha && priorPromotion.parents.some(parent => parent.sha === revision);
    const euBefore = await publicConfig(EU);
    if (gold) assert.equal(previous.economyBarrierVersion, 1, 'Install the economy compatibility release before activation');
    let appleBefore, applePhase, turnkeyBefore, turnkeyPhase, arenaBefore, arenaPhase, arenaProof;
    const settingsActivation = apple || turnkey || arena;
    const bba = settingsActivation ? (method = 'GET', body) => json(`https://bba.tools/api/apps/${settingsActivation.appId}${method === 'PATCH' ? '/settings' : ''}`, {
      method, headers: { Authorization: `Bearer ${settingsActivation.token}`, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 MossvaleProduction/1.0' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }) : null;
    if (apple) {
      applePhase = appleActivationPhase(previous, (await bba()).app, apple);
      if (applePhase === 'pending') {
        const readyBy = Date.now() + 900000;
        while (Date.now() < readyBy && applePhase === 'pending') {
          await sleep(5000);
          const app = (await bba()).app;
          assert(!app.lastError && app.status !== 'failed', 'EU Apple settings update failed; inspect BBA privately');
          if (app.status !== 'ready' || app.settingsPending) continue;
          previous = await deployment();
          applePhase = appleActivationPhase(previous, app, apple);
        }
        assert.equal(applePhase, 'configured', 'EU Apple settings update is unresolved; no settings were retried');
      }
      if (applePhase === 'initial') {
        assert(previous.revision !== revision && !alreadyPromoted, 'Initial Apple activation requires a fresh release revision');
        assert(euBefore.mobilePurchases?.apple === false, 'Initial Apple activation requires billing disabled');
        appleBefore = appleAppBefore((await bba()).app, apple.appId);
      }
    }
    if (turnkey) {
      turnkeyPhase = turnkeyActivationPhase(previous, (await bba()).app, turnkey, revision);
      if (turnkeyPhase === 'pending') {
        const readyBy = Date.now() + 900000;
        while (Date.now() < readyBy && turnkeyPhase === 'pending') {
          await sleep(5000);
          const app = (await bba()).app;
          assert(!app.lastError && app.status !== 'failed', 'EU Turnkey settings update failed; inspect BBA privately');
          if (app.status !== 'ready' || app.settingsPending) continue;
          previous = await deployment();
          turnkeyPhase = turnkeyActivationPhase(previous, app, turnkey, revision);
        }
        assert.equal(turnkeyPhase, 'configured', 'EU Turnkey settings update is unresolved; no settings were retried');
      }
      if (turnkeyPhase === 'initial') {
        assert(previous.revision !== revision && !alreadyPromoted, 'Initial Turnkey activation requires a fresh release revision');
        assert(!Object.hasOwn(euBefore, 'turnkey'), 'Initial Turnkey activation requires embedded wallets disabled');
        turnkeyBefore = turnkeyAppBefore((await bba()).app, turnkey.appId);
      }
      await turnkeyActivationPreflight({ env: turnkey.settings });
      console.log('Turnkey: provider sponsorship preflight verified before player warnings');
    }
    if (arena) {
      arenaPhase = arenaActivationPhase(previous, (await bba()).app, arena, revision);
      if (arenaPhase === 'pending') {
        const readyBy = Date.now() + 900000;
        while (Date.now() < readyBy && arenaPhase === 'pending') {
          await sleep(5000);
          const app = (await bba()).app;
          assert(!app.lastError && app.status !== 'failed', 'EU Arena settings update failed; inspect BBA privately');
          if (app.status !== 'ready' || app.settingsPending) continue;
          previous = await deployment();
          arenaPhase = arenaActivationPhase(previous, app, arena, revision);
        }
        assert.equal(arenaPhase, 'configured', 'EU Arena settings update is unresolved; no settings were retried');
      }
      if (arenaPhase === 'initial') {
        assert(previous.revision !== revision && !alreadyPromoted, 'Initial Arena activation requires a fresh release revision');
        arenaBefore = arenaAppBefore((await bba()).app, arena.appId);
      }
      arenaProof = await arenaActivationPreflight({ activation: arena });
      console.log('Arena: escrow, signing authority, treasury, tax and RPC preflight verified before player warnings');
    }
    report.prepared = {};
    await dockerPhase(gold ? 'economy-prepare' : 'prepare', remote, (realm, result) => { report.prepared[realm] = result; record(); });
    if (turnkey) for (const realm of DOCKER_REALMS) {
      assert.equal(report.prepared[realm.id]?.turnkeyHash, turnkey.hash, `${realm.id} did not prepare the exact wallet settings`);
      assert.equal(report.prepared[realm.id]?.turnkeyCompatibilityVersion, 1, `${realm.id} did not verify the installed wallet compatibility release`);
    }
    if (arena) for (const realm of DOCKER_REALMS) {
      assert.equal(report.prepared[realm.id]?.arenaHash, arena.hash, `${realm.id} did not prepare the exact arena settings`);
      assert.equal(report.prepared[realm.id]?.arenaCompatibilityVersion, 1, `${realm.id} did not verify the installed arena compatibility release`);
      assert.equal(report.prepared[realm.id]?.arenaTreasury?.toLowerCase(), arenaProof.treasury.toLowerCase(), `${realm.id} has a different arena treasury`);
    }
    const dockerBefore = await dockerConfigBaselines(report.prepared);
    const euManifest = await json(EU + '/release.json', { headers: { 'Cache-Control': 'no-cache' } });
    assert.equal(euManifest.revision, previous.revision, 'EU revision changed during preparation');
    const catalog = needsCatalogBarrier(manifest, euManifest, report.prepared);
    assert(!catalog || !gold && !apple && !turnkey && !arena, 'Run catalog, economy, Apple, Turnkey and arena activations in separate releases');
    catalogStarted = Object.values(report.prepared).some(state => state.catalogBarrierRequired
      && (state.catalogBarrierProof || ['warning', 'stopped', 'starting', 'complete'].includes(state.phase)));
    if (!gold && !catalogStarted && shouldSkipRevision(revision, head.object.sha, previous)) {
      report.skipped = 'A newer main commit is waiting for checks'; record(); return;
    }
    if (gold) {
      if (!report.prepared.us.economy?.targetRevision && (await github('git/ref/heads/main')).object.sha !== revision) {
        report.skipped = 'A newer main commit is waiting for checks'; record(); return;
      }
      await runEconomyBarrier({ revision, previous, prepared: report.prepared, remote, drain, deployment,
        record: (name, value) => { report[name] = value; record(); },
        promote: async oldEu => {
          const current = await deployment();
          if (current.revision === revision && current.state === 'idle' && current.instanceId !== oldEu.instanceId) return;
          validateDrain(current, oldEu, revision);
          assert(current.state === 'drained' && current.finalSave && current.admissionHeld, 'EU final-save hold changed before promotion');
          const currentProduction = await github('git/ref/heads/production');
          assert.equal(currentProduction.object.sha, production.object.sha, 'Production branch changed during the barrier');
          if (!alreadyPromoted) {
            const commit = await github('git/commits', 'POST', productionCommit(revision, production.object.sha, tree.sha));
            await github('git/refs/heads/production', 'PATCH', { sha: commit.sha, force: false });
            report.productionCommit = commit.sha;
          } else report.productionCommit = production.object.sha;
          record();
          const readyBy = Date.now() + 900000;
          while (Date.now() < readyBy) {
            try { const value = await deployment(); if (value.revision === revision && value.state === 'idle' && value.instanceId !== oldEu.instanceId) return; }
            catch { /* BBA can temporarily remove the route while replacing the drained process. */ }
            await sleep(5000);
          }
          throw Error('EU did not start the migrated economy; keep exchange disabled and resume this revision');
        },
        verifyAll: async () => {
          const targets = [{ id: 'eu', origin: EU }, ...DOCKER_REALMS], baselines = [euBefore, ...dockerBefore];
          const checked = await Promise.allSettled(targets.map(async (realm, index) => {
            const value = await verify(realm.origin, realm.id, manifest, baselines[index]); report[realm.id] = value; record(); return value;
          }));
          for (const value of checked) if (value.status === 'rejected') throw value.reason;
          return checked.map(value => value.value);
        },
      });
      // Notification delivery is asynchronous: require the public gate on each realm before reporting completion.
      for (const realm of [{ id: 'eu', origin: EU }, ...DOCKER_REALMS]) {
        let enabled = false;
        for (let attempt = 0; attempt < 12; attempt++) {
          const health = await json(realm.origin + '/api/health');
          if (health.economy?.version === 1 && health.economy.exchangeEnabled === true) { enabled = true; break; }
          await sleep(1000);
        }
        assert(enabled, `${realm.id} did not observe exchange activation`); report[realm.id].exchangeEnabled = true;
      }
      report.completedAt = new Date().toISOString(); record();
      console.log(`Gold economy activated and verified: ${revision} on EU, US, and Asia`); return;
    }
    if (applePhase === 'initial') assert(dockerBefore.every(config => config.mobilePurchases?.apple === false), 'Initial Apple activation requires all realms to have billing disabled');
    if (turnkeyPhase === 'initial') assert(dockerBefore.every(config => !Object.hasOwn(config, 'turnkey')), 'Initial Turnkey activation requires all realms to have embedded wallets disabled');
    if (catalog) {
      assert.equal(previous.economyBarrierVersion, 1, 'EU must support a final-save admission hold');
      // Bind the EU baseline separately; it can legitimately differ from a regional catalog after an interrupted release.
      report.prepared.eu = { oldCatalogVersion: catalogVersion(euManifest) };
      await runCatalogBarrier({ revision, image, playerCatalogVersion: catalogVersion(manifest), previous, prepared: report.prepared,
        remote, drain, deployment, record: (name, value) => { report[name] = value; record(); },
        promote: async oldEu => {
          const current = await deployment();
          if (current.revision === revision && current.state === 'idle' && current.instanceId !== oldEu.instanceId) return;
          validateDrain(current, oldEu, revision);
          assert(current.state === 'drained' && current.finalSave && current.admissionHeld, 'EU catalog final-save hold changed before promotion');
          assert.equal((await github('git/ref/heads/production')).object.sha, production.object.sha, 'Production branch changed during catalog barrier');
          if (!alreadyPromoted) {
            const commit = await github('git/commits', 'POST', productionCommit(revision, production.object.sha, tree.sha));
            await github('git/refs/heads/production', 'PATCH', { sha: commit.sha, force: false });
            report.productionCommit = commit.sha;
          } else report.productionCommit = production.object.sha;
          record();
          const readyBy = Date.now() + 900000;
          while (Date.now() < readyBy) {
            try { const status = await deployment(); if (status.revision === revision && status.state === 'idle' && status.instanceId !== oldEu.instanceId) return; }
            catch { /* Keep regional writers stopped while BBA replaces the held EU process. */ }
            await sleep(5000);
          }
          throw Error('EU catalog release did not start; resume this exact release with the saved barrier proofs');
        }, verifyEu: async () => { report.eu = await verify(EU, 'eu', manifest, euBefore); record(); },
      });
      const checked = await Promise.allSettled(DOCKER_REALMS.map(async (realm, index) => {
        report[realm.id] = await verify(realm.origin, realm.id, manifest, dockerBefore[index]); record();
      }));
      for (const result of checked) if (result.status === 'rejected') throw result.reason;
      report.completedAt = new Date().toISOString(); record();
      console.log(`Player catalog release verified: ${revision} on EU, US, and Asia`); return;
    }
    if (applePhase === 'initial') {
      const oldManifest = await json(EU + '/release.json', { headers: { 'Cache-Control': 'no-cache' } });
      assert.equal(oldManifest.revision, previous.revision, 'EU release changed before Apple activation');
      report.euConfigurationDrain = await drain(previous); record();
      assert.deepEqual(appleAppBefore((await bba()).app, apple.appId), appleBefore, 'BBA changed during the configuration drain');
      const status = await deployment();
      validateDrain(status, previous, revision);
      assert.equal(status.state, 'drained', 'EU must confirm its final save immediately before the settings update');
      // BBA environment updates immediately Recreate the old code. Never combine this with promotion.
      await bba('PATCH', { environmentVariables: apple.settings });
      console.log('EU: waiting for the Apple settings replacement before a second player warning');
      let replacement;
      const readyBy = Date.now() + 900000;
      while (Date.now() < readyBy) {
        const app = (await bba()).app;
        assert(!app.lastError && app.status !== 'failed', 'EU Apple settings update failed; inspect BBA privately');
        if (app.status === 'ready' && !app.settingsPending) {
          appleAppAfter(app, apple.appId, appleBefore);
          try {
            const current = await deployment();
            if (current.revision === previous.revision && current.instanceId !== previous.instanceId && current.state === 'idle' && current.appleIapHash === apple.hash) {
              replacement = current; break;
            }
          } catch (error) {
            if (![502, 503, 504].includes(error.status) && !['TypeError', 'TimeoutError'].includes(error.name)) throw error;
          }
        }
        await sleep(5000);
      }
      assert(replacement, 'EU Apple settings replacement did not become ready; reconcile before retrying');
      await verify(EU, 'eu', oldManifest, applePublicConfig(euBefore), undefined, false);
      previous = replacement;
      report.appleIapConfigured = true; record();
    }
    if (turnkeyPhase === 'initial') {
      const oldManifest = await json(EU + '/release.json', { headers: { 'Cache-Control': 'no-cache' } });
      assert.equal(oldManifest.revision, previous.revision, 'EU release changed before Turnkey activation');
      report.euConfigurationDrain = await drain(previous); record();
      assert.deepEqual(turnkeyAppBefore((await bba()).app, turnkey.appId), turnkeyBefore, 'BBA changed during the configuration drain');
      const status = await deployment();
      validateDrain(status, previous, revision);
      assert.equal(status.state, 'drained', 'EU must confirm its final save immediately before the settings update');
      assert(status.finalSave === true && status.admissionHeld === true, 'EU must retain its saved admission hold before Turnkey activation');
      // Environment changes replace the compatible old code only after its final save.
      await bba('PATCH', { environmentVariables: turnkey.settings });
      console.log('EU: waiting for the Turnkey settings replacement before a second player warning');
      let replacement;
      const readyBy = Date.now() + 900000;
      while (Date.now() < readyBy) {
        const app = (await bba()).app;
        assert(!app.lastError && app.status !== 'failed', 'EU Turnkey settings update failed; inspect BBA privately');
        if (app.status === 'ready' && !app.settingsPending) {
          turnkeyAppAfter(app, turnkey.appId, turnkeyBefore);
          try {
            const current = await deployment();
            if (current.revision === previous.revision && current.instanceId !== previous.instanceId && current.state === 'idle' && current.turnkeyHash === turnkey.hash) {
              replacement = current; break;
            }
          } catch (error) {
            if (![502, 503, 504].includes(error.status) && !['TypeError', 'TimeoutError'].includes(error.name)) throw error;
          }
        }
        await sleep(5000);
      }
      assert(replacement, 'EU Turnkey settings replacement did not become ready; reconcile before retrying');
      await verify(EU, 'eu', oldManifest, euBefore, turnkey, false);
      previous = replacement;
      report.turnkeyConfigured = true; record();
    }
    if (arenaPhase === 'initial') {
      const oldManifest = await json(EU + '/release.json', { headers: { 'Cache-Control': 'no-cache' } });
      assert.equal(oldManifest.revision, previous.revision, 'EU release changed before Arena activation');
      report.euConfigurationDrain = await drain(previous); record();
      assert.deepEqual(arenaAppBefore((await bba()).app, arena.appId), arenaBefore, 'BBA changed during the configuration drain');
      const status = await deployment();
      validateDrain(status, previous, revision);
      assert.equal(status.state, 'drained', 'EU must confirm its final save immediately before the settings update');
      assert(status.finalSave === true && status.admissionHeld === true, 'EU must retain its saved admission hold before Arena activation');
      // Environment changes replace the compatible old code only after its final save.
      await bba('PATCH', { environmentVariables: arena.settings });
      console.log('EU: waiting for the Arena settings replacement before a second player warning');
      let replacement;
      const readyBy = Date.now() + 900000;
      while (Date.now() < readyBy) {
        const app = (await bba()).app;
        assert(!app.lastError && app.status !== 'failed', 'EU Arena settings update failed; inspect BBA privately');
        if (app.status === 'ready' && !app.settingsPending) {
          arenaAppAfter(app, arena.appId, arenaBefore);
          try {
            const current = await deployment();
            if (current.revision === previous.revision && current.instanceId !== previous.instanceId && current.state === 'idle' && current.arenaHash === arena.hash) {
              replacement = current; break;
            }
          } catch (error) {
            if (![502, 503, 504].includes(error.status) && !['TypeError', 'TimeoutError'].includes(error.name)) throw error;
          }
        }
        await sleep(5000);
      }
      assert(replacement, 'EU Arena settings replacement did not become ready; reconcile before retrying');
      await verify(EU, 'eu', oldManifest, euBefore, undefined, false);
      previous = replacement;
      report.arenaConfigured = true; record();
    }
    const overlap = canOverlapWarnings(report.prepared, previous, revision, apple || turnkey || arena);
    if (overlap && previous.state === 'idle') assert.equal((await github('git/ref/heads/main')).object.sha, revision, 'Main advanced before player warnings; rerun the newer release');
    if (overlap) console.log('US and Asia: advance warnings; realms stay available until EU is verified');
    await runRegionalRollout({ overlap, prepared: report.prepared, remote, record: (name, value) => { report[name] = value; record(); }, deployEu: async () => {
      if (previous.revision !== revision) {
        report.euDrain = await drain(previous); record();
        const currentProduction = await github('git/ref/heads/production');
        assert.equal(currentProduction.object.sha, production.object.sha, 'Production branch changed during the drain');
        // BBA removes .git. Only this marker differs from the commit that passed CI.
        // Recover an uncertain prior promotion without queueing the same build twice.
        if (!alreadyPromoted) {
          const commit = await github('git/commits', 'POST', productionCommit(revision, production.object.sha, tree.sha));
          await github('git/refs/heads/production', 'PATCH', { sha: commit.sha, force: false });
          report.productionCommit = commit.sha;
        } else report.productionCommit = production.object.sha;
        record();
        console.log('EU: waiting for BBA to publish the tested release');
        let deployed = false;
        const readyBy = Date.now() + 900000;
        while (Date.now() < readyBy) {
          try {
            const status = await deployment();
            if (status.revision === revision && status.state === 'idle' && status.instanceId !== previous.instanceId) { deployed = true; break; }
          } catch { /* BBA briefly removes the old HTTP endpoint during replacement. */ }
          await sleep(5000);
        }
        assert(deployed, 'EU deployment did not become ready; US and Asia remain on their prior releases');
      }
      if (apple) assert.equal((await deployment()).appleIapHash, apple.hash, 'EU Apple configuration changed during rollout');
      if (turnkey) assert.equal((await deployment()).turnkeyHash, turnkey.hash, 'EU Turnkey configuration changed during rollout');
      if (arena) assert.equal((await deployment()).arenaHash, arena.hash, 'EU arena configuration changed during rollout');
      report.eu = await verify(EU, 'eu', manifest, apple ? applePublicConfig(euBefore) : euBefore, turnkey); record();
      console.log('EU verified. US and Asia: committing player saves and replacement');
    } });
    // Keep every completed realm's evidence even if another realm fails verification.
    const verified = await Promise.allSettled(DOCKER_REALMS.map(async (realm, index) => {
      report[realm.id] = await verify(realm.origin, realm.id, manifest, apple ? applePublicConfig(dockerBefore[index]) : dockerBefore[index], turnkey); record();
    }));
    for (const result of verified) if (result.status === 'rejected') throw result.reason;
    report.completedAt = new Date().toISOString(); record();
    console.log(`Production verified: ${revision} on EU, US, and Asia`);
  } catch (error) {
    report.failedAt = new Date().toISOString(); report.error = error.message; record();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
