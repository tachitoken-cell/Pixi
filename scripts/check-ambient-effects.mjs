import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAmbientEffects } from '../src/ambient-effects.ts';
import { graphics } from '../src/graphics-settings.ts';

graphics.effects = 'high'; // Exercise the full authored pool independently of the device's Auto default.
const names = ['Ambient fireflies and spores', 'Ambient leaves and snow', 'Footstep dust'];
const limits = [80, 120, 96];
const view = (overrides = {}) => ({ position: new THREE.Vector3(0, 0, 8), zone: 'greenwood', dungeon: false,
  moving: false, sprinting: false, mounted: false, grounded: true, swimming: false, indoors: false, active: true, ...overrides });
const at = (x, y = 0, z = 8) => new THREE.Vector3(x, y, z);
function fixture() {
  const parent = new THREE.Group(), unrelated = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  parent.add(unrelated);
  const effect = createAmbientEffects(parent), batches = names.map(name => effect.root.getObjectByName(name));
  assert.equal(effect.root.children.length, 3, 'ambience and footsteps use exactly three fixed batches');
  batches.forEach((mesh, index) => {
    assert(mesh?.isInstancedMesh); assert.equal(mesh.instanceMatrix.count, limits[index]);
    assert.equal(mesh.instanceMatrix.usage, THREE.DynamicDrawUsage);
    assert.equal(mesh.geometry.getAttribute('ambientOpacity').count, limits[index]);
    assert.equal(mesh.material.depthWrite, false, 'transparent particles cannot obscure later effects with depth writes');
  });
  return { parent, unrelated, effect, batches, update: (time, overrides) => effect.update(time, view(overrides)) };
}
function parts(mesh) {
  assert(mesh.count >= 0 && mesh.count <= mesh.instanceMatrix.count, `${mesh.name} stays within its allocated capacity`);
  const result = [], matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion(), color = new THREE.Color();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale); mesh.getColorAt(i, color);
    const opacity = mesh.geometry.getAttribute('ambientOpacity').getX(i);
    assert(matrix.elements.every(Number.isFinite), 'particle transforms remain finite');
    assert(scale.toArray().every(value => value > 0), 'visible particles have positive dimensions');
    assert(color.toArray().every(Number.isFinite), 'regional colors remain finite');
    assert(Number.isFinite(opacity) && opacity > 0 && opacity <= 1, 'individual fading opacity remains within range');
    result.push({ position: position.clone(), scale: scale.clone(), color: color.getHex(), opacity });
  }
  return result;
}
const dust = f => parts(f.batches[2]);
function validate(f) { f.batches.forEach(parts); assert.deepEqual(names.map(name => f.effect.root.getObjectByName(name)), f.batches, 'updates reuse the original batches'); }
function dispose(f) {
  const owned = new Set(f.batches.flatMap(mesh => [mesh, mesh.geometry, mesh.material])), counts = new Map();
  for (const resource of owned) { counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); }
  let unrelatedDisposals = 0;
  f.unrelated.geometry.addEventListener('dispose', () => unrelatedDisposals++);
  f.unrelated.material.addEventListener('dispose', () => unrelatedDisposals++);
  f.effect.dispose(); f.effect.dispose(); f.update(200, { moving: true, position: at(2) });
  assert.deepEqual(f.parent.children, [f.unrelated], 'cleanup leaves unrelated scene assets attached');
  assert([...counts.values()].every(count => count === 1), 'owned buffers, geometries and materials dispose exactly once');
  assert.equal(unrelatedDisposals, 0, 'cleanup does not dispose unrelated asset resources');
  assert(f.batches.every(mesh => mesh.count === 0), 'disposed effects cannot emit again');
  f.unrelated.geometry.dispose(); f.unrelated.material.dispose();
}

const regional = fixture(), profiles = {
  greenwood: { mote: 0xe4ff9b, drift: [0xa6bd53, 0xc5a458, 0x88b96a] },
  amberwild: { mote: 0xffd987, drift: [0xd57b38, 0xdba548, 0xc4bd69] },
  frostmarch: { mote: 0xbcefff, drift: [0xd9f4ff, 0xffffff, 0xb7dae8] },
  hollow: { mote: 0xcbb6ff, drift: [0x9985b6, 0xad9dbb, 0x9cb2bc] },
  sunveil: { mote: 0xffd79d, drift: [0xd4b273, 0xe4c790, 0xb89560] },
  mistwood: { mote: 0xb9f8b8, drift: [0x3f9d68, 0x62b979, 0x8cc876] },
};
const regionalCounts = {};
for (const [zone, palette] of Object.entries(profiles)) {
  regional.update(4, { zone }); validate(regional);
  const motes = parts(regional.batches[0]), falling = parts(regional.batches[1]);
  assert(motes.length && falling.length, `${zone} has visible ambient particles`);
  assert(motes.every(particle => particle.color === palette.mote));
  assert(falling.every(particle => palette.drift.includes(particle.color)), `${zone} uses its own drift palette`);
  regionalCounts[zone] = falling.length;
}
assert(regionalCounts.frostmarch > regionalCounts.amberwild && regionalCounts.amberwild > regionalCounts.greenwood, 'snowfall is denser than autumn leaves and Greenwood drift');
regional.update(5, { zone: 'frostmarch' });
assert(dust(regional).length === 0, 'stationary biome changes never produce footsteps');
regional.update(5.1, { indoors: true }); assert.equal(parts(regional.batches[1]).length, 0, 'falling weather is excluded from interiors');
regional.update(5.2, { dungeon: true }); assert.equal(parts(regional.batches[1]).length, 0, 'outdoor weather is excluded from dungeons');
assert(parts(regional.batches[0]).every(particle => particle.color === 0xcbb3ef), 'dungeons retain their separate mote palette');
dispose(regional);

const night=fixture();night.update(3,{daylight:1});
const dayGlow=parts(night.batches[0]).reduce((sum,p)=>sum+p.opacity,0);
night.update(3,{daylight:0});
assert(parts(night.batches[0]).reduce((sum,p)=>sum+p.opacity,0)>dayGlow,'fireflies brighten after sunset');
assert(night.batches[1].material.color.r<.5,'unlit leaves and snow no longer retain full daylight at night');
night.update(3,{daylight:NaN});assert.equal(night.batches[1].material.color.r,1,'invalid optional daylight uses the original daylight palette');
night.update(3,{daylight:0,dungeon:true});assert.equal(night.batches[2].material.color.r,1,'underground dust retains its authored light');
dispose(night);

const walk = fixture(); walk.update(0);
for (const time of [.1, .4, .8]) walk.update(time, { moving: true });
assert.equal(dust(walk).length, 0, 'held movement without actual displacement cannot emit wall-running dust');
walk.update(.9, { position: at(.2), moving: false });
assert.equal(dust(walk).length, 0, 'position corrections without locomotion do not emit footsteps');
const input = at(.6); walk.update(1.1, { position: input, moving: true });
assert(dust(walk).length > 0, 'grounded movement emits footsteps');
assert(input.equals(at(.6)), 'effects do not mutate the supplied player position');
const freshDust = dust(walk), originalCount = freshDust.length;
walk.update(1.2, { position: at(.6) });
assert.equal(dust(walk).length, originalCount); assert(dust(walk).every((particle, i) => particle.opacity < freshDust[i].opacity), 'stopping allows existing dust to fade without new emissions');
walk.update(2.2, { position: at(.6) }); assert.equal(dust(walk).length, 0, 'idle dust expires completely');
walk.update(2.3, { position: at(.9), moving: true, swimming: true });
walk.update(2.8, { position: at(1.9), moving: true, swimming: true });
assert.equal(dust(walk).length, 0, 'swimming movement cannot emit ground dust');
walk.update(3, { position: at(2.2), moving: true }); assert(dust(walk).length > 0);
walk.update(3.1, { position: at(2.4), moving: true, active: false });
assert.equal(walk.effect.root.visible, false); assert(walk.batches.every(mesh => mesh.count === 0), 'pause immediately clears all three pools');
walk.update(3.2, { position: at(80), moving: true }); assert.equal(dust(walk).length, 0, 'resuming initializes movement history without a phantom step');
walk.update(3.6, { position: at(80.2), moving: true }); assert(dust(walk).length > 0);
walk.update(3.7, { position: at(140), moving: true }); assert.equal(dust(walk).length, 0, 'teleports discard the old trail and do not bridge distant positions');
walk.update(4.1, { position: at(140.2), moving: true }); assert(dust(walk).length > 0);
walk.update(4.2, { position: at(140.3), zone: 'amberwild', moving: true }); assert.equal(dust(walk).length, 0, 'biome transitions reset existing footsteps');
walk.update(4.6, { position: at(140.5), zone: 'amberwild', moving: true }); assert(dust(walk).length > 0);
walk.update(4.7, { position: at(140.6), zone: 'amberwild', dungeon: true, moving: true }); assert.equal(dust(walk).length, 0, 'world-to-dungeon changes reset movement history');
walk.update(1, { position: at(140.8), zone: 'amberwild', dungeon: true, moving: true }); assert.equal(dust(walk).length, 0, 'clock resets cannot replay stale footsteps');
walk.update(NaN); assert.equal(walk.effect.root.visible, false); assert(walk.batches.every(mesh => mesh.count === 0));
walk.update(6, { position: at(Infinity) }); assert(walk.batches.every(mesh => mesh.count === 0), 'invalid positions fail closed');
dispose(walk);

const gaits = [fixture(), fixture(), fixture()];
for (let index = 0; index < gaits.length; index++) {
  const gait = gaits[index], movement = { moving: true, sprinting: index === 1, mounted: index === 2 };
  gait.update(0);
  for (let i = 1; i <= 6; i++) gait.update(i * .1, { ...movement, position: at(i * .3) });
  validate(gait);
}
assert(dust(gaits[1]).length > dust(gaits[0]).length, 'sprinting produces a denser trail than walking');
assert(dust(gaits[2]).length > dust(gaits[0]).length, 'mounted movement produces a denser trail than walking');
gaits[0].update(1, { zone: 'frostmarch' });
gaits[0].update(1.2, { zone: 'frostmarch', position: at(.3), moving: true });
assert(dust(gaits[0]).every(particle => particle.color === 0xd9edf2), 'Frostmarch footsteps kick up snow-colored dust');
gaits.forEach(dispose);

const jump = fixture(); jump.update(0);
jump.update(.1, { grounded: false, position: at(.3, 1), moving: true });
jump.update(.4, { grounded: false, position: at(.8, .7), moving: true });
assert.equal(dust(jump).length, 0, 'airborne movement cannot produce footsteps');
jump.update(.6, { position: at(1), moving: false });
const landing = dust(jump); assert(landing.length > 0, 'landing emits dust even after horizontal movement stops');
jump.update(.7, { position: at(1) }); assert.equal(dust(jump).length, landing.length, 'landing burst occurs once per airborne transition');
jump.update(2, { position: at(1) }); assert.equal(dust(jump).length, 0);
jump.update(2.1, { position: at(1, 1), grounded: false });
jump.update(2.4, { position: at(1), swimming: true }); assert.equal(dust(jump).length, 0, 'landing in water never emits ground dust');

// Rapid landing bursts deliberately exceed the 96-particle pool to exercise recycling.
for (let i = 0; i < 180; i++) {
  jump.update(3 + i * .004, { position: at(1 + i * .001), grounded: i % 2 === 0, moving: true, mounted: true });
  validate(jump);
}
assert.equal(dust(jump).length, 96, 'particle overflow recycles the fixed dust pool rather than allocating another batch');
jump.update(3.72, { position: at(1.18) }); // Finish the final airborne transition before waiting for all dust to fade.
jump.update(5); assert.equal(dust(jump).length, 0, 'even a saturated trail completely expires');
dispose(jump);
console.log('PASS: three finite bounded particle pools, regional drift and snow, actual-movement footsteps, single landings, water/idle/pause cleanup, teleport and world resets, and isolated idempotent disposal.');
