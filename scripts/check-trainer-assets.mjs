import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createVillager, animateVillager } from '../src/village-models.ts';

const roles = ['riding-trainer', 'mount-seller', 'ranger-trainer', 'knight-trainer', 'mage-trainer'];
const bytes = await readFile(new URL('../public/models/trainer-kit.glb', import.meta.url));
assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
assert(bytes.length < 250_000, 'five trainers remain below 250KB combined');
const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
assert.equal(document.meshes.length, 20); assert.equal(document.materials.length, 1);
assert(!document.textures?.length && !document.cameras?.length && !document.animations?.length && !document.skins?.length && !document.extensions?.KHR_lights_punctual,
  'the runtime kit excludes gallery cameras, lighting and textures');
assert(document.extensionsRequired?.includes('KHR_mesh_quantization'));
assert(!document.extensionsRequired.some(name => /draco|meshopt/i.test(name)), 'standard GLTFLoader loads the packed kit without another decoder');
assert((await stat(new URL('../assets/source/trainer-kit.blend', import.meta.url))).size > 100_000, 'editable Blender library and gallery are retained');
const preview = await readFile(new URL('../assets/source/trainer-kit-preview.png', import.meta.url));
assert.equal(preview.subarray(1, 4).toString(), 'PNG'); assert(preview.readUInt32BE(16) >= 1600 && preview.readUInt32BE(20) >= 800, 'rendered lineup is large enough to inspect gear and faces');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const asset = gltf.scene; asset.updateMatrixWorld(true); assert.equal(asset.children.length, 5);
const near = (actual, expected, label) => assert(Math.abs(actual - expected) < .00001, `${label}: ${actual} ≈ ${expected}`);
const materials = new Set(), sourceMatrices = new Map(), sourcePositions = new Map(), silhouettes = [];
let triangles = 0;
asset.traverse(node => { sourceMatrices.set(node, node.matrix.toArray()); if (node.isMesh) sourcePositions.set(node.geometry, node.geometry.attributes.position.array.slice()); });
for (const role of roles) {
  const model = asset.getObjectByName(`village-${role}`); assert(model, `${role} root exists`);
  assert.deepEqual(model.position.toArray(), [0, 0, 0]); assert.deepEqual(model.quaternion.toArray(), [0, 0, 0, 1]); assert.deepEqual(model.scale.toArray(), [1, 1, 1]);
  assert.equal(model.children.length, 4, 'four meshes support the existing independent idle parts');
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  near(bounds.min.y, 0, `${role} feet`);
  assert(size.y >= 2.4 && size.y <= 2.7 && size.x < 1.9 && size.z < 1.2, `${role} keeps the grounded human-scale silhouette`);
  silhouettes.push({ role, width: +size.x.toFixed(3), height: +size.y.toFixed(3), depth: +size.z.toFixed(3) });
  for (const [part, pivot] of [['body', [0, 0, 0]], ['head', [0, 1.64, 0]], ['left-arm', [-.47, 1.48, 0]], ['right-arm', [.47, 1.48, 0]]]) {
    const node = model.getObjectByName(`village-${role}-${part}`); assert(node?.isMesh);
    node.position.toArray().forEach((value, axis) => near(value, pivot[axis], `${role}/${part} pivot`));
    assert.deepEqual(node.scale.toArray(), [1, 1, 1], 'parts are authored at scale rather than stretched');
    materials.add(node.material); assert(node.material.vertexColors && node.geometry.attributes.color);
    for (const attribute of Object.values(node.geometry.attributes)) assert(attribute.array.every(Number.isFinite), 'all geometry and colors are finite');
    assert(node.geometry.index.array.every(index => index < node.geometry.attributes.position.count));
    triangles += node.geometry.index.count / 3;
  }
  const left = new THREE.Box3().setFromObject(model.getObjectByName(`village-${role}-left-arm`));
  const right = new THREE.Box3().setFromObject(model.getObjectByName(`village-${role}-right-arm`));
  if (role === 'riding-trainer') assert(right.max.y > 1.7, 'riding crop extends beyond the hand');
  if (role === 'mount-seller') assert(left.min.y < .45, 'feed pouch hangs below the hand');
  if (role === 'ranger-trainer') assert(left.max.y > 1.57 && left.min.y < .25, 'the held bow has two extended limbs');
  if (role === 'knight-trainer') assert(right.max.y > 2.1 && left.max.x - left.min.x > .6, 'sword and shield give the knight a separate silhouette');
  if (role === 'mage-trainer') assert(right.max.y > 2.5 && left.max.z > .48, 'staff and spellbook stay attached to their respective hands');
  const live = createVillager(asset, role), sibling = createVillager(asset, role);
  live.position.set(7, 4, -3);
  for (let tick = 0; tick < 80; tick++) {
    animateVillager(live, tick / 8); live.updateMatrixWorld(true);
    live.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite)));
    const feet = new THREE.Box3().setFromObject(live).min.y;
    assert(feet >= 3.987 && feet <= 4.013, 'subtle idle breathing keeps feet at ground height');
  }
  assert.deepEqual(live.position.toArray(), [7, 4, -3], 'idle preserves authoritative world placement');
  for (const node of sibling.children) {
    const source = model.getObjectByName(node.name); node.updateMatrix();
    assert.equal(node.geometry, source.geometry); assert.equal(node.material, source.material);
    assert.deepEqual(node.matrix.toArray(), sourceMatrices.get(source), 'one animated clone cannot alter another');
  }
}
assert.equal(materials.size, 1); assert(triangles <= 6000, 'five detailed voxel NPCs stay under 6000 triangles');
assert.equal(new Set(roles.map(role => asset.getObjectByName(`village-${role}-body`).geometry)).size, 5, 'each outfit has its own authored geometry');
for (const [node, matrix] of sourceMatrices) { node.updateMatrix(); assert.deepEqual(node.matrix.toArray(), matrix); }
for (const [geometry, positions] of sourcePositions) assert.deepEqual(geometry.attributes.position.array, positions, 'clones preserve the shared imported buffers');
console.log(`PASS trainer assets: ${bytes.length} bytes, ${triangles} triangles, 20 mesh draws, 1 material, 5 grounded models, exact idle pivots and immutable shared geometry.`);
console.log(JSON.stringify(silhouettes));
