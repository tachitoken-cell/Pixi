import assert from 'node:assert/strict';
import { catalogVersion, needsCatalogBarrier, runCatalogBarrier } from './rollout.mjs';

const oldRevision = 'a'.repeat(40), revision = 'b'.repeat(40), otherRevision = 'c'.repeat(40);
const image = `ghcr.io/trappyon/mossvale:${revision}`, playerCatalogVersion = 5;
const copy = value => structuredClone(value);
const settle = () => new Promise(resolve => setImmediate(resolve));
const initialEu = { revision: oldRevision, instanceId: 'eu-old-instance', state: 'idle', playerCatalogVersion: 4 };
const proofFor = realm => ({ realm, revision: oldRevision, targetRevision: revision, instanceId: `${realm}-old-instance`,
  playerCatalogVersion: 4, finalSave: true, drainedAt: 1_800_000_000_000,
  ...(realm === 'eu' ? { admissionHeld: true } : { restartHeld: true }) });
const expectedProof = { revision, image, playerCatalogVersion,
  realms: Object.fromEntries(['eu', 'us', 'asia'].map(realm => [realm, proofFor(realm)])) };

function fixture({ failure, mutate = (_, value) => value, hooks = {} } = {}) {
  const events = [], records = {}, saved = {}, stopped = new Set();
  const prepared = Object.fromEntries(['us', 'asia'].map(realm => [realm, { realm, phase: 'prepared',
    catalogBarrierVersion: 1, catalogBarrierRequired: true, oldRevision, oldCatalogVersion: 4, playerCatalogVersion }]));
  prepared.eu = { oldCatalogVersion: 4 };
  let eu = copy(initialEu), verified = false;
  const visit = async name => {
    events.push(name);
    await hooks[name]?.();
    if (failure === name) throw Error(`Controlled ${name} failure`);
  };
  const result = (realm, phase) => ({ realm, phase, ...(stopped.has(realm) ? { drainProof: proofFor(realm) } : {}),
    ...(saved[realm] ? { catalogBarrierProof: copy(saved[realm]) } : {}) });
  const options = {
    revision, image, playerCatalogVersion, previous: copy(initialEu), prepared,
    drain: async () => {
      await visit('eu:drain'); stopped.add('eu'); eu = { ...proofFor('eu'), state: 'drained' };
      return mutate('eu:drain', copy(eu));
    },
    deployment: async () => { await visit('eu:status'); return mutate('eu:status', copy(eu)); },
    remote: async (realm, action, proof) => {
      const name = `${realm.id}:${action}`;
      await visit(name);
      if (action === 'catalog-drain') {
        stopped.add(realm.id); prepared[realm.id].phase = 'stopped';
        return mutate(name, result(realm.id, 'stopped'));
      }
      if (action === 'catalog-status') return mutate(name, result(realm.id, prepared[realm.id].phase));
      if (action === 'catalog-authorize') {
        assert.deepEqual(proof, expectedProof, 'Authorization binds the exact image, catalog and three stopped writers');
        assert(stopped.has(realm.id));
        saved[realm.id] = copy(proof); prepared[realm.id].catalogBarrierProof = copy(proof);
        await hooks[`${name}:saved`]?.();
        return mutate(name, result(realm.id, 'stopped'));
      }
      assert.equal(action, 'catalog-start');
      assert(verified, 'Regional writers cannot start before EU public verification');
      assert.deepEqual(saved.us, expectedProof); assert.deepEqual(saved.asia, expectedProof);
      prepared[realm.id].phase = 'complete';
      return mutate(name, result(realm.id, 'complete'));
    },
    promote: async () => {
      await visit('eu:promote');
      assert.deepEqual(saved.us, expectedProof, 'US authorization must survive before promotion');
      assert.deepEqual(saved.asia, expectedProof, 'Asia authorization must survive before promotion');
      eu = { revision, instanceId: 'eu-new-instance', state: 'idle', playerCatalogVersion };
    },
    verifyEu: async () => { await visit('eu:verify'); assert.equal(eu.revision, revision); verified = true; },
    record: (name, value) => { records[name] = copy(value); },
  };
  return { options, events, records, prepared, saved, stopped, run: () => runCatalogBarrier(options),
    setEu(value) { eu = copy(value); options.previous = copy(value); },
    authorize(realms = ['us', 'asia']) {
      for (const realm of ['eu', 'us', 'asia']) stopped.add(realm);
      eu = { ...proofFor('eu'), state: 'drained' };
      for (const realm of ['us', 'asia']) prepared[realm].phase = 'stopped';
      for (const realm of realms) saved[realm] = prepared[realm].catalogBarrierProof = copy(expectedProof);
    } };
}

assert.equal(catalogVersion({}), 4, 'Manifests before catalog versioning represent version4');
for (const version of [4, 5, 6, Number.MAX_SAFE_INTEGER]) assert.equal(catalogVersion({ playerCatalogVersion: version }), version);
for (const version of [null, 0, 3, 4.5, '5', true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
  assert.throws(() => catalogVersion({ playerCatalogVersion: version }));
const current = { playerCatalogVersion: 5 }, legacy = {};
const ordinary = Object.fromEntries(['us', 'asia'].map(realm => [realm, {
  catalogBarrierVersion: 1, playerCatalogVersion: 5, oldRevision, oldCatalogVersion: 5, catalogBarrierRequired: false,
}]));
assert.equal(needsCatalogBarrier(current, current, ordinary), false);
assert.equal(needsCatalogBarrier(legacy, legacy, {}), false);
assert.equal(needsCatalogBarrier(current, legacy, ordinary), true, 'EU catalog upgrade requires all writers stopped');
for (const realm of ['us', 'asia']) {
  for (const catalogBarrierRequired of [true, false]) assert.equal(needsCatalogBarrier(current, current,
    { ...ordinary, [realm]: { ...ordinary[realm], oldCatalogVersion: 4, catalogBarrierRequired } }), true,
  'An older regional catalog requires the barrier even when its flag is false and EU already upgraded');
  assert.throws(() => needsCatalogBarrier(current, current, { ...ordinary, [realm]: { ...ordinary[realm], oldCatalogVersion: 6 } }), 'A newer regional writer cannot be downgraded');
  for (const field of ['catalogBarrierVersion', 'oldCatalogVersion', 'playerCatalogVersion', 'catalogBarrierRequired']) {
    const incomplete = { ...ordinary[realm] }; delete incomplete[field];
    assert.throws(() => needsCatalogBarrier(current, current, { ...ordinary, [realm]: incomplete }), `Versioned ${realm} preparation cannot omit ${field}`);
  }
  for (const patch of [{ catalogBarrierVersion: 0 }, { playerCatalogVersion: 4 }, { oldCatalogVersion: 4.5 }, { catalogBarrierRequired: 'false' }])
    assert.throws(() => needsCatalogBarrier(current, current, { ...ordinary, [realm]: { ...ordinary[realm], ...patch } }), 'Malformed helper metadata cannot select ordinary rollout');
}
assert.throws(() => needsCatalogBarrier(legacy, current, ordinary), 'A newer EU writer cannot be downgraded');
for (const realm of ['us', 'asia']) for (const patch of [{ catalogBarrierVersion: undefined }, { catalogBarrierVersion: 0 }, { playerCatalogVersion: 6 }]) {
  const f = fixture(); Object.assign(f.prepared[realm], patch);
  await assert.rejects(f.run()); assert.equal(f.events.length, 0, 'Unsupported or mismatched preparation cannot warn or stop players');
}

// Both regional stops and the EU hold must complete before any authorization or promotion.
{
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const f = fixture({ hooks: { 'asia:catalog-drain': async () => { entered.resolve(); await release.promise; } } });
  const work = f.run(); await entered.promise; await settle();
  assert(f.events.includes('eu:drain') && f.events.includes('us:catalog-drain'));
  assert(!f.events.some(name => /authorize|promote|start/.test(name)), 'One unresolved stop holds the entire fleet');
  release.resolve(); await work;
  const promoted = f.events.indexOf('eu:promote'), verified = f.events.indexOf('eu:verify');
  for (const realm of ['us', 'asia']) {
    assert(f.events.indexOf(`${realm}:catalog-status`) < f.events.indexOf(`${realm}:catalog-authorize`));
    assert(f.events.indexOf(`${realm}:catalog-authorize`) < promoted);
    assert(f.events.indexOf(`${realm}:catalog-start`) > verified);
  }
  assert(f.events.indexOf('eu:status') < promoted);
}

// A fast failure cannot leave the other drain unobserved or authorize a partial fleet.
{
  const entered = Promise.withResolvers(), release = Promise.withResolvers(); let finished = false;
  const f = fixture({ failure: 'us:catalog-drain', hooks: { 'asia:catalog-drain': async () => { entered.resolve(); await release.promise; } } });
  const work = f.run().finally(() => { finished = true; }); const rejected = assert.rejects(work);
  await entered.promise; await settle(); assert.equal(finished, false, 'Both drain requests must settle before failure returns');
  release.resolve(); await rejected;
  assert(!f.events.some(name => /authorize|promote|start/.test(name)));
}

for (const failure of ['eu:drain', 'us:catalog-drain', 'asia:catalog-drain', 'eu:status', 'us:catalog-status', 'asia:catalog-status', 'us:catalog-authorize', 'asia:catalog-authorize']) {
  const f = fixture({ failure }); await assert.rejects(f.run(), /Controlled/);
  assert(!f.events.includes('eu:promote'), `${failure} cannot promote EU`);
  assert(!f.events.some(name => name.endsWith(':catalog-start')), `${failure} cannot start a regional writer`);
}
for (const failure of ['eu:promote', 'eu:verify']) {
  const f = fixture({ failure }); await assert.rejects(f.run(), /Controlled/);
  assert(!f.events.some(name => name.endsWith(':catalog-start')), `${failure} cannot start a regional writer`);
}
for (const failure of ['us:catalog-start', 'asia:catalog-start']) {
  const f = fixture({ failure }); await assert.rejects(f.run(), /Controlled/);
  assert(f.events.includes('us:catalog-start') && f.events.includes('asia:catalog-start'), 'Observe both regional starts before reporting failure');
}

// Bad drain identities, targets, versions or final-save claims must never reach activation.
for (const realm of ['eu', 'us', 'asia']) {
  const stage = realm === 'eu' ? 'eu:drain' : `${realm}:catalog-drain`;
  for (const patch of [{ realm: 'other' }, { revision: otherRevision }, { targetRevision: otherRevision },
    { instanceId: 'restarted-writer' }, { playerCatalogVersion: 6 }, { finalSave: false }, { drainedAt: 0 },
    realm === 'eu' ? { admissionHeld: false } : { restartHeld: false }]) {
    const f = fixture({ mutate: (name, value) => name !== stage ? value : realm === 'eu' ? { ...value, ...patch } : { ...value, drainProof: { ...value.drainProof, ...patch } } });
    await assert.rejects(f.run(), `${realm} rejects ${JSON.stringify(patch)}`);
    assert(!f.events.includes('eu:promote'));
  }
}
for (const stage of ['eu:status', 'us:catalog-status', 'asia:catalog-status']) {
  const f = fixture({ mutate: (name, value) => name !== stage ? value : stage === 'eu:status'
    ? { ...value, instanceId: 'restarted-after-drain' } : { ...value, drainProof: { ...value.drainProof, instanceId: 'restarted-after-drain' } } });
  await assert.rejects(f.run()); assert(!f.events.includes('eu:promote'));
}
for (const realm of ['us', 'asia']) {
  const stage = `${realm}:catalog-authorize`;
  const f = fixture({ mutate: (name, value) => name !== stage ? value : { ...value, catalogBarrierProof: undefined } });
  await assert.rejects(f.run()); assert(!f.events.includes('eu:promote'), 'Persisted authorization requires a verified acknowledgement before promotion');
}

// Persisted authorization recovers an uncertain reply without relying on the runner's memory.
for (const lostRealm of ['us', 'asia']) {
  let lose = true;
  const f = fixture({ hooks: { [`${lostRealm}:catalog-authorize:saved`]: () => { if (lose) { lose = false; throw Error('Lost authorization reply'); } } } });
  await assert.rejects(f.run(), /Lost authorization reply/);
  assert(f.saved[lostRealm]); assert(!f.events.includes('eu:promote'));
  f.events.length = 0; await f.run();
  assert(f.events.includes('eu:promote'));
}

// A single saved authorization is repairable only while the original EU writer remains held.
for (const savedRealm of ['us', 'asia']) {
  const f = fixture(); f.authorize([savedRealm]); await f.run();
  assert(f.events.includes(`${savedRealm === 'us' ? 'asia' : 'us'}:catalog-authorize`));
  const unsafe = fixture(); unsafe.authorize([savedRealm]);
  unsafe.setEu({ revision, instanceId: 'eu-new-instance', state: 'idle', playerCatalogVersion });
  await assert.rejects(unsafe.run());
  assert(!unsafe.events.some(name => /authorize|promote|start/.test(name)), 'Candidate EU does not prove a missing old-writer authorization');
}

// Once both records agree, a retry can finish after EU promotion lost its response.
{
  const f = fixture(); f.authorize();
  f.setEu({ revision, instanceId: 'eu-new-instance', state: 'idle', playerCatalogVersion });
  await f.run();
  assert(!f.events.includes('eu:drain'), 'Never redrain the migrated EU candidate to reconstruct old proof');
  assert(f.events.includes('us:catalog-start') && f.events.includes('asia:catalog-start'));
}
for (const changedRealms of [['asia'], ['us', 'asia']]) for (const patch of [{ revision: otherRevision }, { image: image + '-other' }, { playerCatalogVersion: 6 },
  { realms: { ...copy(expectedProof.realms), eu: { ...proofFor('eu'), finalSave: false } } }]) {
  const f = fixture(); f.authorize();
  for (const realm of changedRealms) f.prepared[realm].catalogBarrierProof = f.saved[realm] = { ...copy(expectedProof), ...patch };
  f.setEu({ revision, instanceId: 'eu-new-instance', state: 'idle', playerCatalogVersion });
  await assert.rejects(f.run()); assert(!f.events.some(name => /promote|start/.test(name)));
}
{
  const f = fixture(); f.setEu({ revision, instanceId: 'eu-new-instance', state: 'idle', playerCatalogVersion });
  await assert.rejects(f.run()); assert(!f.events.some(name => /authorize|promote|start/.test(name)));
}

console.log('Catalog rollout: version/downgrade gates, concurrent observed final saves, exact fleet proof, two durable authorizations, fail-closed phases, lost replies and already-promoted EU recovery passed. No live deployment.');
