import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deployAuth } from './deploy-auth.mjs';

const token = `bba_pat_${'x'.repeat(43)}`, appId = '347997b7-50dd-490b-aa22-a2627e0732e8';
const issuer = 'https://auth.mossvale.world/realms/mossvale', api = `https://bba.tools/api/apps/${appId}`;
const image = n => `ghcr.io/trappyon/mossvale-auth@sha256:${n.repeat(64)}`;
const old = image('a'), next = image('b'), third = image('c');

function fixture(options = {}) {
  let time = 1_800_000_000_000, readsLeft = 0, stateAfter, rejectedResume = false;
  const writes = [], calls = [], losses = new Set(options.lost ?? []);
  const app = { id: appId, name: 'mossvale-auth-custom', sourceType: 'container', image: options.same ? next : old,
    status: options.stopped ? 'stopped' : 'ready', updatedAt: new Date(time).toISOString(), settingsPending: false, lastError: null,
    publicUrl: options.stopped ? null : `http://${appId}.bba.tools`, customDomain: null, namespace: 'team-daniel-frykman-6d552ba9',
    replicas: 1, port: 8080, isPublic: true, environmentId: 'existing-environment', createdByUserId: 'existing-owner',
    environmentVariableNames: ['KC_DB_PASSWORD'], storageGi: 1, startCommand: null };
  const stamp = () => { app.updatedAt = new Date(++time).toISOString(); };
  const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(value) });
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert(init.signal instanceof AbortSignal);
    if (!url.startsWith(api)) {
      assert.equal(init.headers.Authorization, undefined, 'never send BBA token to public auth');
      assert.equal(init.method, 'GET');
      if (url.endsWith('/.well-known/openid-configuration')) return response({ issuer, jwks_uri: `${issuer}/protocol/openid-connect/certs`,
        authorization_endpoint: `${issuer}/protocol/openid-connect/auth`, token_endpoint: `${issuer}/protocol/openid-connect/token` });
      assert.equal(url, `${issuer}/protocol/openid-connect/certs`);
      return response({ keys: [{ kid: options.keyChange && writes.length ? 'changed' : 'existing', kty: 'RSA', n: 'public-key', e: 'AQAB' }] });
    }
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    if (init.method === 'GET') {
      assert.equal(url, api);
      if (readsLeft && --readsLeft === 0 && !options.stuck) {
        app.status = stateAfter; app.publicUrl = stateAfter === 'paused' ? null : `http://${appId}.bba.tools`; stamp();
      }
      return response({ app, events: [] });
    }
    const body = JSON.parse(init.body);
    const operation = url.endsWith('/image') ? 'image' : body.action;
    writes.push(operation);
    if (operation === 'image') {
      assert.equal(url, `${api}/image`); assert.equal(init.method, 'PATCH'); assert.equal(app.status, options.stopped ? 'stopped' : 'paused');
      assert.deepEqual(body, { image: next, expectedImage: old, expectedUpdatedAt: app.updatedAt });
      if (options.collision) { app.image = options.collision === 'image' ? third : options.collision === 'same-target' ? next : old; stamp(); return response({ secret: token }, 409); }
      if (options.patchFailure) throw new Error(`Transport echoed ${token}`);
      app.image = next; stamp();
    } else {
      assert.equal(url, `${api}/actions`); assert.equal(init.method, 'POST'); assert(['pause', 'resume'].includes(operation));
      assert.deepEqual(body, { action: operation });
      if (operation === 'pause' && options.pauseFailure) return response({ secret: token }, 403);
      if (operation === 'resume' && options.resumeFailure && !rejectedResume) {
        rejectedResume = true; throw new Error(`Transport echoed ${token}`);
      }
      assert.equal(app.status, operation === 'pause' ? 'ready' : options.stopped ? 'stopped' : 'paused');
      app.status = operation === 'pause' ? 'pausing' : 'resuming';
      stateAfter = operation === 'pause' ? 'paused' : 'ready'; readsLeft = 2; stamp();
    }
    if (losses.delete(operation)) throw new Error(`Lost committed response ${token}`);
    return response({ app }, operation === 'image' ? 200 : 202);
  };
  return { app, calls, writes, run: () => deployAuth(next, { token, fetchImpl, sleep: async ms => { time += ms; }, now: () => time,
    waitMs: options.stuck ? 3000 : 30_000, requestMs: 5000 }) };
}

for (const options of [{}, { lost: ['pause', 'image', 'resume'] }]) {
  const f = fixture(options), proof = await f.run();
  assert.equal(proof.ok, true); assert.equal(proof.previousImage, old); assert.equal(proof.image, next);
  assert.equal(proof.visibleConfigurationPreserved, true); assert.equal(proof.signingKeysPreserved, true);
  assert.deepEqual(f.writes, ['pause', 'image', 'resume']); assert.equal(f.app.status, 'ready');
  assert.equal(proof.rollbackCommand, `node scripts/deploy-auth.mjs ${old}`);
  assert(!JSON.stringify(proof).includes(token));
  for (let i = 0; i < f.calls.length - 1; i++) if (f.calls[i].method !== 'GET')
    assert.equal(f.calls[i + 1].method, 'GET', 'read-reconcile every write, including lost responses');
}
const same = fixture({ same: true }); assert.equal((await same.run()).changed, false); assert.deepEqual(same.writes, []);
for (const same of [false, true]) {
  const f = fixture({ stopped: true, same }), proof = await f.run();
  assert.equal(proof.startedStopped, true); assert.equal(proof.signingKeysPreserved, null);
  assert.equal(proof.visibleConfigurationPreserved, true); assert.equal(f.app.status, 'ready');
  assert.deepEqual(f.writes, same ? ['resume'] : ['image', 'resume']);
  assert.equal(f.calls.filter(c => !c.url.startsWith(api)).length, 2, 'stopped recovery checks discovery and keys only after startup');
}
const stoppedConflict = fixture({ stopped: true, collision: 'image' });
await assert.rejects(stoppedConflict.run()); assert.deepEqual(stoppedConflict.writes, ['image']);
assert.equal(stoppedConflict.app.status, 'stopped'); assert.equal(stoppedConflict.app.image, third);
for (const [options, expectedWrites, finalImage] of [
  [{ collision: 'image' }, ['pause', 'image'], third],
  [{ collision: 'same-target' }, ['pause', 'image'], next],
  [{ collision: 'revision' }, ['pause', 'image', 'resume'], old],
  [{ patchFailure: true }, ['pause', 'image', 'resume'], old],
  [{ pauseFailure: true }, ['pause'], old],
  [{ resumeFailure: true }, ['pause', 'image', 'resume', 'resume'], next],
  [{ keyChange: true }, ['pause', 'image', 'resume'], next],
]) {
  const f = fixture(options);
  await assert.rejects(f.run(), error => {
    assert.equal(error.proof.ok, false); assert.equal(error.proof.previousImage, old);
    assert(!JSON.stringify(error.proof).includes(token)); assert(!error.message.includes(token)); return true;
  });
  assert.deepEqual(f.writes, expectedWrites); assert.equal(f.app.image, finalImage);
  if (!['image', 'same-target'].includes(options.collision)) assert.equal(f.app.status, 'ready', 'safe cleanup leaves the known image serving');
}
const stuck = fixture({ stuck: true }); await assert.rejects(stuck.run(), /Timed out/);
assert.deepEqual(stuck.writes, ['pause']); assert(stuck.calls.length < 30, 'polling is bounded');
for (const patch of [{ name: 'another-app' }, { customDomain: 'unexpected.example' }, { status: 'paused' }, { settingsPending: true }, { lastError: token }]) {
  const f = fixture(); Object.assign(f.app, patch); await assert.rejects(f.run()); assert.deepEqual(f.writes, []);
}
await assert.rejects(deployAuth('https://attacker.example/' + token, { token, fetchImpl: () => assert.fail('invalid target must not request') }), /immutable/);
const dir = await mkdtemp(join(tmpdir(), 'mossvale-auth-release-check-'));
try {
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('./deploy-auth.mjs', import.meta.url)), next],
    { cwd: dir, env: { ...process.env, BBA_API_TOKEN: `invalid-${token}` }, encoding: 'utf8', timeout: 10_000 });
  assert.equal(cli.status, 1);
  const proof = await readFile(join(dir, 'artifacts/auth-release.json'), 'utf8');
  assert.equal(JSON.parse(proof).ok, false); assert(![proof, cli.stdout, cli.stderr].some(value => value.includes(token)));
} finally { await rm(dir, { recursive: true, force: true }); }
console.log('Auth release passed: fixed destinations, owner identity/configuration, ordered lifecycle/CAS, no-op release, lost responses, collision refusal, bounded waits, safe resume and no credential output.');
