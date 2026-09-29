import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CITY, CITY_ROADS } from '../src/city.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, PLAYER_RADIUS, canTraverse } from '../src/realm.ts';
import { TRAINING_GROUNDS, TRAINING_PROPS, TRAINING_PRACTICE, TRAINING_GROUND_COLLIDERS } from '../src/training-grounds-data.ts';
import { cityPatrolRoutes } from '../src/city-life.ts';
import { findPath } from '../src/navigation.ts';
import { groundHeight, waterAt } from '../src/landscape.ts';
import { loadCharacterAssets } from '../src/characters.ts';

async function asset(name) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
function reachable(target, label) {
  assert(canTraverse(target, target), `${label} has clear standing space`);
  assert(!waterAt(target.x, target.z), `${label} is on dry ground`);
  const route = findPath(CITY, target, WORLD_COLLIDERS, WORLD_BOUNDS);
  assert(route.length, `${label} has a route from the city centre`);
  let previous = CITY;
  for (const step of route) { assert(canTraverse(previous, step), `${label} route uses actual shared collisions`); previous = step; }
  assert(Math.hypot(previous.x - target.x, previous.z - target.z) < .01, `${label} route reaches the actual destination`);
}
function roadPoints(road) {
  const dx = road.x2 - road.x1, dz = road.z2 - road.z1, length = Math.hypot(dx, dz), result = [];
  for (let along = 0; along <= Math.ceil(length * 2); along++) {
    const t = along / Math.ceil(length * 2), edge = road.width / 2 - PLAYER_RADIUS;
    for (const across of [-edge, 0, edge]) result.push({ x: road.x1 + dx * t - dz / length * across, z: road.z1 + dz * t + dx / length * across });
  }
  return result;
}
function resources(root) {
  const result = new Set();
  root.traverse(node => { if (node.isMesh) { result.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) result.add(material); } });
  return result;
}

assert.deepEqual(TRAINING_GROUNDS.map(area => area.className).sort(), ['Cleric', 'Knight', 'Mage', 'Ranger']);
assert.equal(TRAINING_PRACTICE.length, 8);
assert.equal(new Set([...TRAINING_PRACTICE, ...TRAINING_PROPS].map(item => item.id)).size, TRAINING_PRACTICE.length + TRAINING_PROPS.length, 'actors and props have unique identities');
assert.equal(TRAINING_GROUND_COLLIDERS.length, TRAINING_PROPS.length);
for (const collider of TRAINING_GROUND_COLLIDERS) assert(WORLD_COLLIDERS.includes(collider), 'training solids enter the authoritative shared world collision list');
const targetKinds = { Knight: 'dummy', Ranger: 'archery-target', Mage: 'arcane-target', Cleric: 'healing-shrine' };
for (const area of TRAINING_GROUNDS) {
  const trainer = TRAINER_NPCS.find(npc => npc.id === area.trainerId), trainees = TRAINING_PRACTICE.filter(actor => actor.className === area.className);
  assert(trainer && trainer.className === area.className && trainer.zone === 'greenwood', `${area.name} belongs to its real class trainer`);
  assert.equal(trainees.length, 2, `${area.name} has two trainees`);
  reachable(area, area.name);
  assert(Math.hypot(area.x - trainer.x, area.z - trainer.z) < 12, 'practice happens next to the class trainer');
  for (const trainee of trainees) {
    reachable(trainee, trainee.id);
    const target = TRAINING_PROPS.find(prop => prop.id === trainee.targetId);
    assert.equal(target?.kind, targetKinds[area.className], `${trainee.id} practices on its class-specific target`);
    assert.notEqual(trainees[0].targetId, trainees[1].targetId, 'each trainee has a distinct target');
    assert([trainee.x, trainee.z, trainee.phase, target.x, target.z].every(Number.isFinite));
    assert(Math.hypot(trainee.x - target.x, trainee.z - target.z) > 1.5, 'the trainee stands outside its target');
    assert(Math.hypot(trainee.x - trainer.x, trainee.z - trainer.z) >= 1.6, 'the trainee leaves interaction space around the trainer');
    // A projectile or swing may enter its own target, but never crosses another solid.
    const otherSolids = WORLD_COLLIDERS.filter(solid => solid !== TRAINING_GROUND_COLLIDERS[TRAINING_PROPS.indexOf(target)]);
    assert(canTraverse(trainee, target, otherSolids, WORLD_BOUNDS), `${trainee.id} has clear sight of its target`);
  }
}
for (const [index, road] of CITY_ROADS.entries()) for (const point of roadPoints(road))
  assert(canTraverse(point, point), `training props preserve the full walking width of city road ${index}`);
for (const npc of TRAINER_NPCS.filter(npc => npc.zone === 'greenwood')) {
  const front = { x: npc.x + Math.sin(npc.rotation) * 1.5, z: npc.z + Math.cos(npc.rotation) * 1.5 };
  reachable(front, `${npc.id} front`); assert(canTraverse(front, npc), `${npc.id} remains interactable from its front`);
}
const pointSegmentDistance = (point, start, end) => {
  const dx = end.x - start.x, dz = end.z - start.z, t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(point.x - start.x - t * dx, point.z - start.z - t * dz);
};
const routes = cityPatrolRoutes(); assert.equal(routes.length, 24, 'training props retain all city walking routes');
for (const route of routes) {
  assert(canTraverse(route.start, route.end), 'pedestrians retain their clear routes');
  for (const trainee of TRAINING_PRACTICE) assert(pointSegmentDistance(trainee, route.start, route.end) >= 1.6, `${trainee.id} does not overlap a walking citizen at any time`);
}
// Use the exported Blender geometry, not a duplicate approximation of its silhouettes.
const kit = await asset('training-grounds'), kitResources = resources(kit), sharedResources = new Set();
const originalLoader = GLTFLoader.prototype.loadAsync, loads = [];
GLTFLoader.prototype.loadAsync = async function(url) {
  assert(['/models/race-kit.glb', '/models/customization-kit.glb', '/models/gear-kit.glb', '/models/cleric-kit.glb'].includes(url), 'the shared character loader requests only actual avatar kits');
  loads.push(url); const source = await asset(url.split('/').at(-1).replace('.glb', ''));
  for (const resource of resources(source)) sharedResources.add(resource);
  return { scene: source };
};
try { await Promise.all([loadCharacterAssets(), loadCharacterAssets()]); await loadCharacterAssets(); }
finally { GLTFLoader.prototype.loadAsync = originalLoader; }
assert.equal(loads.length, 4, 'concurrent world and player startup decode each kit once');
assert.equal(new Set(loads).size, 4);
const overlaps = (a, b) => b.halfWidth !== undefined
  ? Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth - .0001 && Math.abs(a.z - b.z) < a.halfDepth + b.halfDepth - .0001
  : Math.hypot(Math.max(0, Math.abs(a.x - b.x) - a.halfWidth), Math.max(0, Math.abs(a.z - b.z) - a.halfDepth)) < b.r - .0001;
for (const [index, prop] of TRAINING_PROPS.entries()) {
  const source = kit.getObjectByName(`training-${prop.kind}`); assert(source, `${prop.kind} uses an actual Blender asset`);
  const box = new THREE.Box3().setFromObject(source), size = box.getSize(new THREE.Vector3());
  assert(size.x <= prop.width + .001 && size.z <= prop.depth + .001, `${prop.id} rendered footprint fits its shared collider`);
  assert(box.min.y >= -.001 && size.y > 1, `${prop.id} rests on the ground and is a full-size training prop`);
  const collider = TRAINING_GROUND_COLLIDERS[index];
  assert(!WORLD_COLLIDERS.some(other => other !== collider && overlaps(collider, other)), `${prop.id} does not overlap another training prop or existing city solid`);
}
const { createTrainingGrounds } = await import('../src/training-grounds.ts');
const sourcePositions = new Map(); kit.traverse(node => { if (node.isMesh) sourcePositions.set(node.geometry, node.geometry.attributes.position.array.slice()); });
let sharedDisposals = 0; for (const resource of sharedResources) resource.addEventListener('dispose', () => sharedDisposals++);
const unrelated = new THREE.Group(), scene = new THREE.Scene(); scene.add(unrelated);
const grounds = createTrainingGrounds(kit); scene.add(grounds.root);
try {
  assert.equal(grounds.root.name, 'Lanternreach training grounds'); assert.equal(grounds.root.userData.cosmetic, true);
  assert.equal(grounds.root.userData.practiceCount, 8); assert.equal(grounds.root.userData.targetCount, 8); assert.equal(grounds.citizens.size, 8);
  const rigs = [...grounds.citizens.values()].map(citizen => citizen.mesh), stages = new Map(), joints = new Map();
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  for (const practice of TRAINING_PRACTICE) {
    const citizen = grounds.citizens.get(practice.id), mesh = citizen?.mesh; assert(mesh);
    assert.equal(citizen.name, practice.name); assert.equal(citizen.title, practice.title); assert.equal(mesh.userData.cosmetic, true);
    assert.equal(mesh.userData.rig.className, practice.className, 'the actual equipped character uses its practice class');
    assert.equal(mesh.position.x, practice.x); assert.equal(mesh.position.z, practice.z);
    assert(Math.abs(mesh.position.y - groundHeight(practice.x, practice.z)) < .04);
    if (practice.className === 'Cleric') {
      const companion = TRAINING_PRACTICE.find(other => other.className === 'Cleric' && other !== practice);
      assert.equal(mesh.userData.practice.targetId, companion.id, 'Clerics heal the other living apprentice');
    } else assert.equal(mesh.userData.practice.targetId, practice.targetId);
    stages.set(practice.id, new Set()); joints.set(practice.id, new Set());
  }
  const dummy = grounds.root.getObjectByName('training-dummy-1').getObjectByName('training-dummy-strike');
  const crystal = grounds.root.getObjectByName('training-crystal-1').getObjectByName('training-arcane-target-crystal');
  assert(dummy && crystal, 'authored targets have their real articulated parts');
  const initialCrystal = crystal.quaternion.clone(); let dummyMoved = false, dummyRested = false, projectileSeen = false, greenHealingSeen = false, maxMeshes = 0;
  for (let time = 0; time <= 24; time += .05) {
    grounds.update(time); grounds.root.updateMatrixWorld(true);
    let meshCount = 0;
    grounds.root.traverse(node => {
      assert(node.matrixWorld.elements.every(Number.isFinite), 'practice transforms remain finite');
      if (!node.isMesh) return; meshCount++;
      if (node.isInstancedMesh) { assert(node.count >= 0 && node.count <= node.instanceMatrix.count); assert([...node.instanceMatrix.array].every(Number.isFinite)); }
    });
    maxMeshes = Math.max(maxMeshes, meshCount);
    const effects = grounds.root.getObjectByName('combat-effects');
    if (effects) { assert(effects.count <= 1536, 'shared projectiles keep their existing bounded pool'); projectileSeen ||= effects.count > 0; }
    const sparks = grounds.root.getObjectByName('Training healing streams and contact rings'); assert(sparks && sparks.count <= 256);
    for (let index = 0; index < sparks.count; index++) {
      const color = new THREE.Color(); sparks.getColorAt(index, color);
      greenHealingSeen ||= color.g > color.r && color.g > color.b;
    }
    for (const [id, citizen] of grounds.citizens) {
      const rig = citizen.mesh.userData.rig; stages.get(id).add(citizen.mesh.userData.practice.stage);
      joints.get(id).add([...rig.leftArm.quaternion.toArray(), ...rig.rightArm.quaternion.toArray()].map(n => n.toFixed(3)).join(','));
    }
    const knightState = grounds.citizens.get('training-knight-1').mesh.userData.practice;
    if (knightState.phase < knightState.contactAt) assert(Math.abs(dummy.rotation.z) < 1e-6, 'dummy cannot recoil before weapon contact');
    if (Math.abs(dummy.rotation.z) > .01) dummyMoved = true;
    if (dummyMoved && knightState.stage === 'idle' && Math.abs(dummy.rotation.z) < .0001) dummyRested = true;
  }
  assert(projectileSeen && greenHealingSeen, 'arrows/magic and green healing are visible actual effect instances');
  assert(dummyMoved && dummyRested, 'the struck dummy recoils and returns to rest'); assert(!crystal.quaternion.equals(initialCrystal), 'the arcane target animates');
  for (const [id, seen] of stages) {
    assert(seen.has('idle') && seen.has('prepare') && seen.has('impact'), `${id} has a complete repeatable practice routine`);
    assert(joints.get(id).size > 20, `${id} uses the articulated character pose rather than only effects`);
  }
  grounds.update(25); grounds.root.updateMatrixWorld(true);
  for (const mesh of rigs) {
    ray.ray.origin.set(mesh.position.x, mesh.position.y + 5, mesh.position.z);
    assert(ray.intersectObject(mesh, true).length > 0, 'every trainee is selectable at its actual animated position');
  }
  const settledMeshes = []; grounds.root.traverse(node => { if (node.isMesh) settledMeshes.push(node); });
  for (let time = 25; time < 45; time += .2) grounds.update(time);
  const laterMeshes = []; grounds.root.traverse(node => { if (node.isMesh) laterMeshes.push(node); });
  assert.deepEqual(laterMeshes, settledMeshes, 'repeating routines reuse geometry and effect pools without scene growth');
  grounds.update(46, { x: 1000, z: 1000 });
  assert.equal(grounds.root.userData.visiblePracticeCount, 0); assert(rigs.every(mesh => !mesh.visible), 'distant trainees cannot be rendered or picked');
  for (const prop of TRAINING_PROPS) assert(!grounds.root.getObjectByName(prop.id).visible, 'distant practice props are culled');
  grounds.update(47, { x: -150, z: -40 }); assert.equal(grounds.root.userData.visiblePracticeCount, 0, 'individual100m culling works before general world culling');
  grounds.update(48, { x: -35, z: -20 }); assert.equal(grounds.root.userData.visiblePracticeCount, 8); assert(rigs.every(mesh => mesh.visible));
  grounds.root.visible = false; grounds.update(49); assert(rigs.every(mesh => !mesh.visible), 'world visibility applies to all picking rigs');
  grounds.root.visible = true; grounds.update(1); assert(rigs.every(mesh => mesh.visible), 'a restarted timeline reinitializes practice cleanly');
  const owned = new Set([...kitResources, grounds.root.getObjectByName('Training sand and paving'), grounds.root.getObjectByName('Training healing streams and contact rings')]);
  for (const mesh of rigs) mesh.traverse(node => { if (node.isInstancedMesh) owned.add(node); });
  const fx = grounds.root.getObjectByName('combat-effects'); if (fx) owned.add(fx);
  for (const node of [...owned]) if (node.name === 'Training sand and paving' || node.name === 'Training healing streams and contact rings' || node.name === 'combat-effects') { owned.add(node.geometry); owned.add(node.material); }
  const disposed = new Map([...owned].map(resource => [resource, 0])); for (const resource of owned) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  grounds.dispose(); grounds.dispose(); grounds.update(50);
  assert.equal(grounds.root.parent, null); assert.equal(grounds.root.children.length, 0); assert.equal(grounds.citizens.size, 0);
  assert(rigs.every(mesh => !mesh.visible), 'disposed trainees cannot leave stale pickable rigs');
  assert([...disposed.values()].every(count => count === 1), 'owned GPU buffers and generated resources are disposed exactly once');
  assert.equal(sharedDisposals, 0, 'practice cleanup never disposes shared player or Blender resources');
  assert.equal(unrelated.parent, scene, 'teardown preserves unrelated world content');
  for (const [geometry, original] of sourcePositions) assert.deepEqual(geometry.attributes.position.array, original, 'animation preserves the authored shared prop geometry');
  console.log(`PASS training grounds: four classes/eight apprentices, real Blender footprints, clear roads/trainers/24 patrols, reachable practice/targets, shared four-kit decode, articulated routines and targets, bounded projectile/healing effects, real mesh picking, distance culling and isolated one-time cleanup (${maxMeshes} maximum meshes).`);
} finally { grounds.dispose(); }
