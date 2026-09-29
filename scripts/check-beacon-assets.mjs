import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BEACONS } from '../src/content.ts';
import { WORLD_COLLIDERS, REGION_ORIGINS, toWorld, canTraverse } from '../src/realm.ts';
import { groundHeight } from '../src/landscape.ts';
import { createOverworld } from '../src/zones.ts';

const bytes = await readFile(new URL('../public/models/beacon-kit.glb', import.meta.url));
assert.equal(bytes.readUInt32LE(0), 0x46546c67);
assert.equal(bytes.readUInt32LE(8), bytes.length);
assert(bytes.length < 750_000, 'the two static landmarks stay below 750KB');
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
assert(!json.images?.length && !json.textures?.length && !json.cameras?.length && !json.animations?.length);
assert(!json.extensionsRequired?.some(name => /draco|meshopt/i.test(name)));
assert((await stat(new URL('../assets/source/beacon-kit.blend', import.meta.url))).size > 30_000);
const kit = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')).scene;
kit.updateMatrixWorld(true);
assert.deepEqual(kit.children.map(node => node.name).sort(), BEACONS.map(b => `beacon-${b.zone}`).sort());
let triangles = 0;
const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
for (const beacon of BEACONS) {
  const model = kit.getObjectByName(`beacon-${beacon.zone}`);
  assert.deepEqual(model.position.toArray(), [0, 0, 0]);
  assert.deepEqual(model.scale.toArray(), [1, 1, 1]);
  assert.equal(model.children.length, 2, 'one frame and one separately controlled light');
  assert.deepEqual(model.children.map(node => node.userData.part).sort(), ['frame', 'light']);
  assert(model.children.find(node => node.userData.part === 'light').material.isMeshBasicMaterial,
    'exported glow preserves its vertex palette in standard glTF viewers');
  const bounds = new THREE.Box3().setFromObject(model);
  assert(Math.abs(bounds.min.y) < .002 && bounds.max.y > 3.5 && bounds.max.y <= 4.8);
  const frame = model.children.find(node => node.userData.part === 'frame');
  for (const node of model.children) {
    assert(node.isMesh && node.geometry.getAttribute('color'), 'authored palette survives export');
    for (const attribute of Object.values(node.geometry.attributes)) assert(attribute.array.every(Number.isFinite));
    triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3;
  }
  const positions = frame.geometry.getAttribute('position'), point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(frame.matrixWorld);
    if (point.y < 1.4) assert(Math.min(Math.hypot(point.x - 1, point.z), Math.hypot(point.x + 1, point.z)) <= .202,
      'low stonework stays within the two canonical post colliders');
  }
  for (const x of [-.4, 0, .4]) for (const y of [.4, 1.2]) {
    ray.ray.origin.set(x, y, 2); ray.far = 4;
    assert.equal(ray.intersectObject(frame, true).length, 0, 'the player can approach through the open center');
  }
  for (const x of [-1, 1]) {
    ray.ray.origin.set(x, 1.2, 2);
    assert(ray.intersectObject(frame, true).length, 'each canonical post has visible stonework');
  }
}
assert(triangles < 12_000);

// Load the real gameplay world so placement, story toggles, effects and cleanup share the production path.
const originalLoad = GLTFLoader.prototype.loadAsync;
const loadLocal = async function (url) {
  const source = await readFile(new URL(`../public${url}`, import.meta.url));
  return this.parseAsync(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
};
const scene = new THREE.Scene(), unrelated = new THREE.Group(); scene.add(unrelated);
let world;
try {
  GLTFLoader.prototype.loadAsync = async function (url) {
    if (url === '/models/beacon-kit.glb') throw new Error('Beacon load probe');
    return loadLocal.call(this, url);
  };
  await assert.rejects(createOverworld(scene), /Beacon load probe/);
  assert.deepEqual(scene.children, [unrelated], 'failed beacon load leaves no partially attached world');
  GLTFLoader.prototype.loadAsync = loadLocal;
  world = await createOverworld(scene);
  assert.equal(world.colliders, WORLD_COLLIDERS);
  const root = scene.getObjectByName('Mossvale open world'); root.updateMatrixWorld(true);
  const resources = new Set(), models = [], effects = root.getObjectByName('Mossvale environmental effects');
  for (const beacon of BEACONS) {
    const model = root.getObjectByName(`beacon-${beacon.zone}`), glow = model.getObjectByName(`${beacon.zone}: beacon light`);
    const frame = model.children.find(node => node.userData.part === 'frame'), at = toWorld(beacon.zone, beacon), origin = REGION_ORIGINS[beacon.zone];
    assert.deepEqual(model.getWorldPosition(new THREE.Vector3()).toArray(), [at.x, groundHeight(origin.x, origin.z), at.z]);
    assert(frame.visible && !glow.visible, 'dormant frame remains visible before story ignition');
    assert(glow.material.isMeshBasicMaterial && glow.material.vertexColors && !glow.material.toneMapped);
    assert(frame.castShadow && frame.receiveShadow && !glow.castShadow);
    assert(canTraverse({ x: at.x, z: at.z + 3 }, at), 'the canonical interaction remains reachable');
    const rest = frame.matrix.clone(), energyRest = glow.matrixWorld.clone(), anchor = new THREE.Vector3(at.x, groundHeight(origin.x, origin.z) + 2.8, at.z);
    world.setRegionBeaconLit(beacon.zone, true); world.update(1, anchor); root.updateMatrixWorld(true);
    assert(glow.visible && glow.material.color.r !== 1, 'the lit energy pulses in brightness');
    assert(frame.matrix.equals(rest) && glow.matrixWorld.equals(energyRest), 'frame and light geometry stay fixed over the dormant crystal');
    assert(effects.children.some(node => node.isPointLight && node.intensity > 0 && node.position.distanceTo(anchor) < .001), 'lit beacon registers its nearby environmental light');
    world.setRegionBeaconLit(beacon.zone, false); world.update(2, anchor);
    assert(!glow.visible && frame.visible, 'release extinguishes energy while preserving dormant stonework');
    assert(!effects.children.some(node => node.isPointLight && node.intensity > 0 && node.position.distanceTo(anchor) < .001), 'extinguished beacon leaves no floating point light');
    model.traverse(node => { if (node.isMesh) { resources.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) resources.add(material); } });
    models.push({ beacon, glow });
  }
  world.setRegionBeaconLit(models[0].beacon.zone, true);
  assert(models[0].glow.visible && !models[1].glow.visible, 'regional story progression stays independent');
  world.setRegionBeaconLit('unknown-zone', true);
  const disposed = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  world.dispose(); world.dispose(); world.setRegionBeaconLit(models[0].beacon.zone, false); world.update(3);
  assert.deepEqual(scene.children, [unrelated]);
  assert([...disposed.values()].every(count => count === 1), 'shared beacon resources release exactly once');
} finally { world?.dispose(); GLTFLoader.prototype.loadAsync = originalLoad; }
console.log(`PASS: two Blender beacons, ${triangles} triangles, ${bytes.length} bytes, canonical posts and anchors, separate story light/pulse, effects and isolated cleanup.`);
