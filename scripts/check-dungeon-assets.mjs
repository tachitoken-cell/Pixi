import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createDungeonWorld } from '../src/zones.ts';
import { LEGACY_DUNGEONS as DUNGEONS, DUNGEON_BOUNDS, DUNGEON_COLLIDERS, DUNGEON_DOORS, DUNGEON_OBJECTS, DUNGEON_GATES, DUNGEON_STAGES, DUNGEON_POOLS, DUNGEON_CHECKPOINT, dungeonColliders, dungeonLayout, dungeonStages } from '../src/dungeon.ts';
import { dungeonSpikeTraps, DUNGEON_SPIKE_SAFE_MS, DUNGEON_SPIKE_WARNING_MS } from '../src/dungeon-traps.ts';

const bytes = await readFile(new URL('../public/models/rootvault-kit.glb', import.meta.url));
assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
assert(bytes.length < 800_000, 'the authored library stays comfortably below one megabyte');
assert.equal(json.materials.length, 3); assert.equal(json.meshes.length, 23);
assert(!json.textures?.length && !json.cameras?.length && !json.extensions?.KHR_lights_punctual, 'the shipping kit has no textures, lights or preview cameras');
assert((await stat(new URL('../assets/source/rootvault-kit.blend', import.meta.url))).size > 50_000, 'the original Blender source is retained');
assert((await stat(new URL('../assets/source/rootvault-kit-preview.png', import.meta.url))).size > 10_000, 'the authored source has a rendered preview');
const buffer = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const kit = await new GLTFLoader().parseAsync(buffer(), ''); kit.scene.updateMatrixWorld(true);
const props = ['arch', 'pillar', 'brazier', 'guardian', 'chest', 'seal', 'checkpoint', 'mushrooms', 'pool', 'wall', 'gate'];
for (const prop of props) {
  const model = kit.scene.getObjectByName(`rootvault-${prop}`); assert(model, `${prop} has a stable named root`);
  const bounds = new THREE.Box3().setFromObject(model);
  assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
  assert(bounds.min.y >= (prop === 'pool' ? -.54 : -.001), `${prop} has a normalized ground pivot`);
}
let triangles = 0;
kit.scene.traverse(node => { if (!node.isMesh) return;
  assert(node.geometry.getAttribute('color'), 'authored vertex colours survive the GLB export');
  for (const attribute of Object.values(node.geometry.attributes)) assert(attribute.array.every(Number.isFinite));
  triangles += node.geometry.index.count / 3;
});
assert(triangles < 16_000, 'modeled wall courses and gates stay within the geometry budget');
for (const id of ['cindercrypt', 'frosthollow', 'nightroot']) {
  const source = await readFile(new URL(`../public/models/${id}-kit.glb`, import.meta.url));
  assert(source.length < 1_000_000, `${id}: detailed library stays below one megabyte`);
  for (const suffix of ['blend', 'png']) assert((await stat(new URL(`../assets/source/${id}-kit${suffix === 'png' ? '-preview' : ''}.${suffix}`, import.meta.url))).size > 10_000, `${id}: editable Blender source and rendered preview retained`);
  const model = await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
  let count = 0;
  for (const name of props) assert(model.scene.getObjectByName(`${id}-${name}`), `${id}: same grounded prop interface`);
  model.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    count += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    for (const attribute of Object.values(mesh.geometry.attributes)) assert(attribute.array.every(Number.isFinite));
  });
  assert(count < 18_000, `${id}: authored relief remains a bounded mesh`);
  const wall = new THREE.Box3().setFromObject(model.scene.getObjectByName(`${id}-wall`));
  assert(wall.min.x >= -2.001 && wall.max.x <= 2.001 && wall.min.z >= -.601 && wall.max.z <= .601 && wall.max.y <= 4.401, `${id}: relief fits the existing masonry collider`);
  assert.notEqual(model.scene.getObjectByName('wall-stone').geometry.attributes.position.count, kit.scene.getObjectByName('wall-stone').geometry.attributes.position.count, `${id}: geometry is distinct from the Rootvault kit`);
  const resources = new Set();
  model.scene.traverse(mesh => { if (mesh.isMesh) { resources.add(mesh.geometry); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(material); } });
  resources.forEach(resource => resource.dispose());
}

const released = new Set();
kit.scene.traverse(node => { if (!node.isMesh) return; released.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) released.add(material); });
released.forEach(resource => resource.dispose());

const originalLoad = GLTFLoader.prototype.loadAsync, originalNow = Date.now;
const disposal = new Map();
function track(resource) {
  if (disposal.has(resource)) return;
  disposal.set(resource, 0); resource.addEventListener('dispose', () => disposal.set(resource, disposal.get(resource) + 1));
}
GLTFLoader.prototype.loadAsync = async function (url) {
  assert(['/models/rootvault-kit.glb', '/models/cindercrypt-kit.glb', '/models/frosthollow-kit.glb', '/models/nightroot-kit.glb', '/models/dungeon-portals.glb', '/models/dungeon-room-kit.glb', '/models/plagueworks-kit.glb', '/models/emberfall-kit.glb', '/models/veilhaven-kit.glb'].includes(url));
  const source = await readFile(new URL(`../public${url}`, import.meta.url));
  const gltf = await this.parseAsync(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
  gltf.scene.traverse(node => { if (!node.isMesh) return; track(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) track(material); });
  return gltf;
};
function checkCaveStone(root, id) {
  const layout = dungeonLayout(id), rocks = root.children.filter(mesh => mesh.userData.asset === 'dungeon-cave-rock');
  assert(rocks.length > 0, `${id}: cave stone continues into the actual encounter scene`);
  const matrix = new THREE.Matrix4(), bounds = new THREE.Box3(), ray = new THREE.Raycaster();
  for (const mesh of rocks) {
    assert(mesh.isInstancedMesh && mesh.count > 0 && mesh.count < 750, 'cave stone uses a bounded shared batch');
    mesh.geometry.computeBoundingBox();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); bounds.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
      assert(layout.walls.some(wall => bounds.min.x >= wall.x - wall.halfWidth - .002 && bounds.max.x <= wall.x + wall.halfWidth + .002
        && bounds.min.z >= wall.z - wall.halfDepth - .002 && bounds.max.z <= wall.z + wall.halfDepth + .002
        && bounds.min.y >= -.002 && bounds.max.y <= wall.height + .002), `${id}: rock ${i} fits the existing solid and camera volume`);
    }
  }
  root.updateMatrixWorld(true);
  for (const spawn of dungeonStages(id).flatMap(stage => stage.enemies)) {
    ray.set(new THREE.Vector3(spawn.x, 8, spawn.z), new THREE.Vector3(0, -1, 0)); ray.far = 8;
    assert.equal(ray.intersectObjects(rocks).length, 0, `${id}: monster spawn remains visibly clear`);
  }
  for (const door of layout.doors) {
    ray.set(new THREE.Vector3(door.x + (door.axis === 'z' ? 2 : 0), 1.2, door.z + (door.axis === 'x' ? 2 : 0)), new THREE.Vector3(door.axis === 'z' ? -1 : 0, 0, door.axis === 'x' ? -1 : 0)); ray.far = 4;
    assert.equal(ray.intersectObjects(rocks).length, 0, `${id}: cave stone leaves the doorway route open`);
  }
}
function checkFittedProps(root, id) {
  const solids = dungeonLayout(id).colliders, matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  const withinSolid = (x, z) => solids.some(c => c.halfWidth !== undefined
    ? Math.abs(x - c.x) <= c.halfWidth + .002 && Math.abs(z - c.z) <= c.halfDepth + .002
    : Math.hypot(x - c.x, z - c.z) <= c.r + .002);
  for (const mesh of root.children.filter(mesh => ['arch', 'pillar', 'guardian', 'wall'].includes(mesh.userData.asset))) {
    const vertices = mesh.geometry.getAttribute('position');
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      for (let j = 0; j < vertices.count; j++) {
        point.fromBufferAttribute(vertices, j).applyMatrix4(matrix);
        if (point.y > .01 && point.y < 1.8) assert(withinSolid(point.x, point.z), `${mesh.name} instance ${i} at ${point.toArray()} base must fit inside the actual authoritative wall, rather than obstructing a free path`);
      }
    }
  }
}
let world;
try {
  const scene = new THREE.Scene(), unrelated = new THREE.Group(); scene.add(unrelated);
  world = await createDungeonWorld(scene);
  world.setDungeonRoom(null);
  const root = scene.getObjectByName('The Rootbound Vault'); root.updateMatrixWorld(true);
  checkCaveStone(root, 'rootvault');
  let draws = 0, instances = 0;
  root.traverse(node => { assert(node.matrixWorld.elements.every(Number.isFinite)); if (!node.isMesh) return;
    draws++; track(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) track(material);
    if (node.isInstancedMesh) { track(node); instances += node.count; assert(node.instanceMatrix.array.every(Number.isFinite)); }
  });
  assert.deepEqual(world.colliders, dungeonColliders()); assert(draws <= 39 && instances < 9000, `the dungeon, shared traps and sealed portal domes stay bounded: ${draws} draws/${instances} instances`);
  for (const prop of props.filter(prop => !['arch', 'gate'].includes(prop))) assert(root.children.some(mesh => mesh.userData.asset === prop), `${prop} is actually loaded into the gameplay scene`);
  const bounds = new THREE.Box3().setFromObject(root);
  assert(bounds.min.x >= DUNGEON_BOUNDS.minX && bounds.max.x <= DUNGEON_BOUNDS.maxX && bounds.min.z >= DUNGEON_BOUNDS.minZ && bounds.max.z <= DUNGEON_BOUNDS.maxZ);
  const groundRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  for (const pool of DUNGEON_POOLS) {
    groundRay.ray.origin.set(pool.x, 1, pool.z); const hits = groundRay.intersectObject(root);
    assert(hits[0]?.object.name === 'Blender Rootvault: pool-water', 'the floor is actually cut away so the water is visible');
    assert(hits[0].point.y < -.04 && hits[0].point.y > -.08, 'the water surface sits inside a recessed basin');
    assert(hits.some(hit => hit.point.y < -.40 && hit.point.y > -.51), 'water has a visible basin bed below the translucent surface');
  }
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  checkFittedProps(root, 'rootvault');
  const ray = new THREE.Raycaster(); ray.far = 4;
  const allCleared = DUNGEON_STAGES.map(stage => stage.id), allObjects = DUNGEON_OBJECTS.map(object => ({ ...object, available: false, activated: true }));
  const colliders = world.colliders;
  const roomPortals = root.getObjectByName('Dungeon: room teleport vortices'), portalLocks = roomPortals.geometry.getAttribute('portalLocked');
  assert.equal(roomPortals.count, dungeonLayout().portals.length, 'every authoritative teleport is visible');
  const domes = root.getObjectByName('Dungeon: sealed portal domes'), chains = root.getObjectByName('Dungeon: sealed portal chains');
  assert(domes?.isInstancedMesh && domes.count === roomPortals.count, 'one shared dome batch covers every room portal');
  assert.equal(domes.geometry.getAttribute('portalLocked'), portalLocks, 'domes share the floor portal lock state');
  assert.equal(chains.geometry.getAttribute('portalLocked'), portalLocks, 'domes and chain seals cannot disagree about unlocks');
  assert(roomPortals.renderOrder < chains.renderOrder && chains.renderOrder < domes.renderOrder && !chains.material.depthWrite, 'chain seals render above the vortex and beneath the translucent shell');
  assert(domes.material.transparent && !domes.material.depthWrite, 'sealed domes are translucent without hiding the portal floor');
  assert.equal(domes.material.uniforms.time, roomPortals.material.uniforms.time, 'the dome pulse shares the portal animation clock');
  for (const attribute of Object.values(domes.geometry.attributes)) assert(attribute.array.every(Number.isFinite), 'dome geometry remains finite');
  domes.geometry.computeBoundingBox();
  const domeBounds = domes.geometry.boundingBox;
  assert(domeBounds.min.y >= -.001 && domeBounds.max.y > 0 && Math.abs(domeBounds.max.y - (domeBounds.max.x - domeBounds.min.x) / 2) < .01, 'dome is an upper hemisphere with no hidden lower half');
  for (const [index, portal] of dungeonLayout().portals.entries()) {
    domes.getMatrixAt(index, matrix); const placed = domeBounds.clone().applyMatrix4(matrix);
    assert([...placed.min.toArray(), ...placed.max.toArray()].every(Number.isFinite));
    assert(Math.abs(placed.min.x - (portal.x - 2.15)) < .01 && Math.abs(placed.max.x - (portal.x + 2.15)) < .01
      && Math.abs(placed.min.z - (portal.z - 2.15)) < .01 && Math.abs(placed.max.z - (portal.z + 2.15)) < .01
      && Math.abs(placed.min.y - .16) < .01 && Math.abs(placed.max.y - 2.31) < .01, 'blue hemisphere sits directly over its floor portal');
    chains.getMatrixAt(index, matrix); point.setFromMatrixPosition(matrix);
    assert(point.y > placed.min.y && point.y < (placed.min.y + placed.max.y) / 2
      && Math.hypot(point.x - portal.x, point.y - placed.min.y, point.z - portal.z) < 2.15, 'chain and lock anchors sit low inside their bubble');
  }
  const pads = root.children.filter(mesh => mesh.userData.asset === 'portal-plinth');
  assert(pads.length === 2 && pads.every(mesh => mesh.count === roomPortals.count), 'each portal has the shared Blender stone rim and luminous inlay');
  assert(portalLocks.array.some(value => value === 1), 'forward teleports start visibly sealed');
  world.setDungeonState({ clearedStages: allCleared, objects: allObjects, hazards: [] }); root.updateMatrixWorld(true);
  assert.equal(world.colliders, colliders, 'teleports preserve the collision array');
  assert.deepEqual(world.colliders, DUNGEON_COLLIDERS, 'room walls remain closed after all encounters clear');
  assert(domes.geometry.getAttribute('portalLocked').array.every(value => value === 0), 'all domes and seals disappear when their requirements are met');
  const water = root.getObjectByName('Blender Rootvault: pool-water').material;
  assert(water.transparent && water.opacity < 1 && water.roughness < .3, 'water uses its own translucent reflective material');
  world.update(12.5); assert.equal(water.userData.time.value, 12.5, 'ripple shader receives the runtime animation clock');
  assert.equal(domes.material.uniforms.time.value, 12.5, 'sealed dome pulse receives the runtime animation clock');
  const target = new THREE.Vector3(10, 1.2, 10), desired = new THREE.Vector3(25, 3, 10);
  world.constrainCamera(target, desired); assert(desired.x < 15, 'tight-room camera stays on the player side of the wall');

  let now = 10_000; Date.now = () => now;
  const rings = root.getObjectByName('Vault: boss danger outlines'), disks = root.getObjectByName('Vault: boss danger fill'), beams = root.getObjectByName('Vault: active seals and available treasure');
  const lid = root.getObjectByName('Blender Rootvault: chest-lid'), seal = root.getObjectByName('Blender Rootvault: seal-glow');
  world.setDungeonState(null, now + 700); world.update(0);
  const firstRoom = dungeonLayout().rooms.find(room => room.id === 'threshold');
  const wallTarget = new THREE.Vector3(firstRoom.x, 1.2, firstRoom.z), wallCamera = new THREE.Vector3(firstRoom.x + firstRoom.width, 5, firstRoom.z);
  world.constrainCamera(wallTarget, wallCamera); assert(wallCamera.x < firstRoom.x + firstRoom.width / 2, 'camera stays inside the enclosed room');
  assert(domes.geometry.getAttribute('portalLocked').array.some(value => value === 1), 'reset restores forward portal domes and seals');
  world.setDungeonState({ clearedStages: [], objects: [], hazards: [], dream: { kind: 'pleasant' } });
  assert(domes.geometry.getAttribute('portalLocked').array.every(value => value === 0), 'dream travel removes domes and seals, matching server access');
  world.setDungeonState(null);
  assert(domes.geometry.getAttribute('portalLocked').array.some(value => value === 1), 'leaving dream state restores normal locked domes');
  const locked = new THREE.Color(); seal.getColorAt(0, locked);
  const closed = new THREE.Matrix4(); lid.getMatrixAt(0, closed);
  const objects = DUNGEON_OBJECTS.map(object => ({ ...object, available: true, activated: false }));
  const state = { id: 'vault-check', clearedStages: [], objects, hazards: [], checkpoint: { ...DUNGEON_CHECKPOINT, active: false } };
  const spikes = root.getObjectByName('Dungeon: timed spikes'), warnings = root.getObjectByName('Dungeon: spike warnings'), trap = dungeonSpikeTraps()[0];
  assert.equal(spikes.count, dungeonSpikeTraps().length * 24, 'each authoritative bed has visible spike sockets');
  const safeTime = -trap.offsetMs + 1000, warningTime = -trap.offsetMs + DUNGEON_SPIKE_SAFE_MS + 800, activeTime = -trap.offsetMs + DUNGEON_SPIKE_SAFE_MS + DUNGEON_SPIKE_WARNING_MS;
  world.setDungeonState(state, safeTime); world.update(.1); spikes.getMatrixAt(0, matrix);
  assert(matrix.elements[5] < .03, 'safe spikes sit flush with their sockets despite the local clock offset');
  world.setDungeonState(state, warningTime); world.update(.1); spikes.getMatrixAt(0, matrix);
  assert(matrix.elements[5] < .03, 'warning comes before spikes rise');
  const warningColor = new THREE.Color(); warnings.getColorAt(0, warningColor);
  assert(warningColor.r > .6 && warningColor.g > .15, 'warning is visibly amber');
  world.setDungeonState(state, activeTime); world.update(.1); spikes.getMatrixAt(0, matrix);
  assert(matrix.elements[5] > .99, 'spikes are fully raised at the exact first damaging instant');
  world.setDungeonState(state, -trap.offsetMs + 8000); world.update(.1); spikes.getMatrixAt(0, matrix);
  assert(matrix.elements[5] < .03, 'spikes retract at the exact first safe instant');
  world.setDungeonState({ ...state, completed: true }, activeTime); world.update(.1); spikes.getMatrixAt(0, matrix);
  assert(matrix.elements[5] < .03, 'completion retracts every trap');
  world.setDungeonState(null, activeTime); world.update(.1); spikes.getMatrixAt(0, matrix);
  assert(matrix.elements[5] < .03, 'missing dungeon state never advertises active damage');
  world.setDungeonState(state, now + 700); world.update(.1);
  const available = new THREE.Color(); seal.getColorAt(0, available);
  assert(available.r > locked.r * 5); assert.equal(beams.count, DUNGEON_OBJECTS.length);
  const activatedState = { ...state, objects: objects.map(object => ({ ...object, activated: true })) };
  world.setDungeonState(activatedState, now + 700); world.update(.2);
  const opened = new THREE.Matrix4(); lid.getMatrixAt(0, opened);
  assert(!opened.equals(closed), 'claiming a chest physically opens its authored lid');
  const closedBounds = lid.geometry.boundingBox.clone().applyMatrix4(closed), openBounds = lid.geometry.boundingBox.clone().applyMatrix4(opened);
  assert(openBounds.max.y > closedBounds.max.y + .35, 'the lid swings upward around its real rear hinge');
  assert.equal(beams.count, objects.filter(o => o.kind !== 'chest').length, 'claimed chests stop advertising available treasure');
  world.setDungeonState(state, now + 700); lid.getMatrixAt(0, opened); assert(opened.equals(closed), 'a reset restores the original closed pose');

  const hazard = Object.freeze({ id: 'slam', x: 0, z: -128, r: 4, startedAt: now + 700, endsAt: now + 2700, damage: 30 });
  const hazardState = Object.freeze({ ...state, hazards: Object.freeze([hazard]) });
  const received = JSON.stringify(hazardState);
  world.setDungeonState(hazardState, now + 700); assert.equal(rings.count, 2); assert.equal(disks.count, 1);
  rings.getMatrixAt(0, matrix); assert(Math.abs(matrix.getMaxScaleOnAxis() - 4) < 1e-6);
  rings.getMatrixAt(1, matrix); assert(Math.abs(matrix.elements[0] - .03) < 1e-6, 'the fill begins at the centre');
  now += 1000; world.update(1); rings.getMatrixAt(1, matrix);
  assert(Math.abs(matrix.elements[0] - 4 * Math.sqrt(.5)) < .001, 'the expanding tell uses synchronized server time');
  now += 1000; world.update(2); assert.equal(disks.count, 1, 'the impact flash survives the damage snapshot');
  world.setDungeonState({ ...state, hazards: [] }, now + 700); assert.equal(disks.count, 1, 'an expired hazard retains its brief impact flash');
  now += 351; world.update(2.351); assert.equal(rings.count, 0); assert.equal(disks.count, 0);
  assert.equal(JSON.stringify(hazardState), received, 'rendering never mutates received authoritative data');
  const future = { ...hazard, startedAt: now + 700, endsAt: now + 2700 };
  world.setDungeonState({ ...state, hazards: [future] }, now + 700);
  world.setDungeonState(state, now + 700); assert.equal(rings.count, 0, 'cancelled boss attacks remove their tell before impact');
  world.setDungeonState({ ...state, hazards: Array.from({ length: 100 }, (_, i) => ({ ...future, id: `cap-${i}` })) }, now + 700);
  assert.equal(rings.count, 48); assert.equal(disks.count, 24, 'hazard buffers remain capped');
  world.setDungeonState(null, now + 700); world.update(3); assert.equal(beams.count + rings.count + disks.count, 0);
  world.dispose(); world.dispose(); world.update(4); world.setDungeonState(state, now + 700);
  for (const dungeon of DUNGEONS.filter(dungeon => dungeon.id !== 'rootvault')) {
    const caveScene = new THREE.Scene(), caveWorld = await createDungeonWorld(caveScene, dungeon.id);
    caveWorld.setDungeonRoom(null);
    try { if (['cindercrypt','frosthollow','nightroot'].includes(dungeon.id)) { const root = caveScene.children.find(node => node.isGroup); checkCaveStone(root, dungeon.id); checkFittedProps(root, dungeon.id); assert(root.children.some(mesh => mesh.userData.authoredDungeon === dungeon.id), `${dungeon.id}: its distinct authored kit is loaded in gameplay`); } else assert(caveScene.children.find(node => node.isGroup).children.some(node => node.userData.authoredDungeon === dungeon.id), 'new dungeon uses its complete original Blender kit'); assert.deepEqual(caveWorld.colliders, dungeonColliders([], [], dungeon.id)); }
    finally { caveWorld.dispose(); }
  }
  assert.deepEqual(scene.children, [unrelated]); assert([...disposal.values()].every(count => count === 1), 'all imported, replaced and instanced resources are disposed exactly once');
  console.log(`PASS: Blender source + ${bytes.length} byte GLB, ${props.length} actual props, ${triangles} triangles, ${draws} dungeon draws/${instances} instances, cave stone within all four layouts' wall/camera volumes and clear spawns/doorways, collider-fitted archways, chest hinges, activation states, synchronized/cancelled/capped hazard tells, and isolated disposal.`);
} finally { world?.dispose(); GLTFLoader.prototype.loadAsync = originalLoad; Date.now = originalNow; }
