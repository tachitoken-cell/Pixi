import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createVillageProps, createVillager, animateVillager } from '../src/village-models.ts';
import { VILLAGE_PROPS, VILLAGE_NPCS, VILLAGE_PROP_SIZES, villagePropHeight } from '../src/settlements.ts';
import { disposeWorldGroup } from '../src/world.ts';

const bytes = await readFile(new URL('../public/models/village-kit.glb', import.meta.url));
assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
assert(bytes.length < 700_000, 'the entire village and NPC library stays under 700 KB');
assert.equal(json.meshes.length, 17); assert.equal(json.materials.length, 1);
assert(!json.textures?.length && !json.cameras?.length && !json.animations?.length && !json.extensions?.KHR_lights_punctual,
  'the runtime kit contains only authored geometry and vertex colours, without gallery resources');
assert(!json.extensionsRequired?.some(extension => /draco|meshopt/i.test(extension)), 'standard GLTFLoader needs no additional decoder');
assert(json.extensionsRequired?.includes('KHR_mesh_quantization'), 'compact normal attributes declare their required glTF extension');
assert((await stat(new URL('../assets/source/village-kit.blend', import.meta.url))).size > 100_000, 'editable Blender source is retained');
assert((await stat(new URL('../assets/source/village-kit-preview.png', import.meta.url))).size > 100_000, 'the source has a rendered gallery preview');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const asset = gltf.scene; asset.updateMatrixWorld(true);
const kinds = ['cottage', 'inn', 'stall', 'well', 'lantern'], roles = ['merchant', 'warden', 'healer'];
const heights = { cottage: 5, inn: 6.2, stall: 3, well: 2.4, lantern: 3.1 };
const near = (actual, expected, label, tolerance = .0001) => assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const point = new THREE.Vector3();
let triangles = 0;
for (const kind of [...kinds, ...roles]) {
  const model = asset.getObjectByName(`village-${kind}`); assert(model, `${kind} has a stable named root`);
  assert.deepEqual(model.position.toArray(), [0, 0, 0]); assert.deepEqual(model.quaternion.toArray(), [0, 0, 0, 1]); assert.deepEqual(model.scale.toArray(), [1, 1, 1]);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
  assert(bounds.min.y >= -.0001 && bounds.min.y <= .05, `${kind} is grounded at its root`);
  if (kinds.includes(kind)) {
    assert(bounds.max.y <= heights[kind] + .001 && bounds.max.y >= heights[kind] - .16, `${kind} keeps its authored height contract`);
    const { width, depth } = VILLAGE_PROP_SIZES[kind];
    assert(size.x <= width + .8 && size.z <= depth + .5, `${kind} has only modest roof overhang`);
  } else {
    assert(bounds.max.y >= 2.25 && bounds.max.y <= 2.6 && size.x < 1.4 && size.z < 1.2, `${kind} has a readable human-sized silhouette`);
    assert.equal(model.children.length, 4, `${kind} has four separate idle parts`);
    for (const [part, at] of [['body', [0, 0, 0]], ['head', [0, 1.64, 0]], ['left-arm', [-.47, 1.48, 0]], ['right-arm', [.47, 1.48, 0]]]) {
      const node = model.getObjectByName(`village-${kind}-${part}`); assert(node);
      node.position.toArray().forEach((value, index) => near(value, at[index], `${kind}/${part} pivot ${index}`));
      assert.deepEqual(node.scale.toArray(), [1, 1, 1], 'optimization preserves idle-part transforms');
    }
  }
  model.traverse(node => {
    if (!node.isMesh) return;
    assert(node.geometry.getAttribute('color') && node.material.vertexColors, 'authored vertex colours drive the material');
    for (const attribute of Object.values(node.geometry.attributes)) assert(attribute.array.every(Number.isFinite));
    assert(node.geometry.index.array.every(index => index < node.geometry.getAttribute('position').count));
    triangles += node.geometry.index.count / 3;
    const positions = node.geometry.getAttribute('position');
    // A roof may extend beyond the blocker; every wall, door and post at walking height must fit it.
    if (kinds.includes(kind)) for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld);
      if (point.y >= 2) continue;
      const { width, depth } = VILLAGE_PROP_SIZES[kind];
      assert(Math.abs(point.x) <= width / 2 + .0001 && Math.abs(point.z) <= depth / 2 + .0001,
        `${kind} collision footprint contains walking-height geometry at ${point.toArray()}`);
    }
  });
}
assert(triangles >= 8_000 && triangles <= 15_000, 'the complete detailed kit stays in its triangle budget');

const originalGeometry = new Map(), originalMatrices = new Map();
asset.traverse(node => {
  originalMatrices.set(node, node.matrix.toArray());
  if (node.isMesh) originalGeometry.set(node.geometry, node.geometry.getAttribute('position').array.slice());
});
const placements = [
  { kind: 'cottage', x: 8, y: 4.5, z: 8, rotation: Math.PI / 2 },
  { kind: 'cottage', x: 22, y: 6, z: 17, rotation: -Math.PI / 2 },
  { kind: 'cottage', x: -265, y: 3, z: -260, rotation: Math.PI },
];
const instanced = createVillageProps(asset, placements);
assert.equal(instanced.children.length, 2, 'nearby equal props share a draw, distant villages retain independent culling');
assert.equal(instanced.children.reduce((sum, mesh) => sum + mesh.count, 0), placements.length);
const expected = new THREE.Matrix4(), actual = new THREE.Matrix4(), pose = new THREE.Object3D();
for (const mesh of instanced.children) {
  assert(mesh.isInstancedMesh && mesh.frustumCulled && mesh.boundingSphere.radius > 0);
  const source = asset.getObjectByName('village-cottage-body');
  assert.equal(mesh.geometry, source.geometry); assert.equal(mesh.material, source.material);
  for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, actual); point.setFromMatrixPosition(actual);
    const at = placements.find(placement => point.distanceTo(new THREE.Vector3(placement.x, placement.y, placement.z)) < .0001); assert(at);
    pose.position.set(at.x, at.y, at.z); pose.rotation.set(0, at.rotation, 0); pose.updateMatrix(); expected.copy(pose.matrix).multiply(source.matrix);
    actual.elements.forEach((value, offset) => near(value, expected.elements[offset], 'instanced source transform'));
  }
}
assert.equal(createVillageProps(asset, []).children.length, 0);
assert.throws(() => createVillageProps(asset, [{ kind: 'inn', x: NaN, y: 0, z: 0 }]), /invalid coordinates/);
assert.throws(() => createVillageProps(new THREE.Group(), placements), /Missing village prop/);
assert.throws(() => createVillager(new THREE.Group(), 'healer'), /Missing village NPC/);

const root = new THREE.Group(), scene = new THREE.Scene(), unrelated = new THREE.Group(); scene.add(root, unrelated); root.add(instanced);
const worldProps = createVillageProps(asset, VILLAGE_PROPS.map(prop => ({ ...prop, y: villagePropHeight(prop) })));
root.add(worldProps);
assert.equal(worldProps.children.reduce((sum, mesh) => sum + mesh.count, 0), 84, 'all 84 actual town placements use the authored kit');
assert(worldProps.children.length <= 72, 'local instancing bounds village draw calls');
for (const npc of VILLAGE_NPCS) {
  const model = createVillager(asset, npc.role); model.position.set(npc.x, 2.5, npc.z); root.add(model);
  const sibling = createVillager(asset, npc.role), source = asset.getObjectByName(`village-${npc.role}`);
  const before = sibling.children.map(child => child.matrix.toArray());
  for (let time = 0; time < 30; time += .25) animateVillager(model, time, npc.rotation);
  model.updateMatrixWorld(true);
  model.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite)));
  assert.deepEqual(model.position.toArray(), [npc.x, 2.5, npc.z], 'idle never moves an NPC off its authoritative position');
  sibling.children.forEach((child, index) => {
    child.updateMatrix(); assert.deepEqual(child.matrix.toArray(), before[index], 'one villager cannot animate another');
    assert.equal(child.geometry, source.children[index].geometry); assert.equal(child.material, source.children[index].material);
    assert.notEqual(child, model.children[index]);
  });
  const head = model.getObjectByName(`village-${npc.role}-head`), beforeInvalid = head.rotation.toArray();
  animateVillager(model, NaN, Infinity); assert.deepEqual(head.rotation.toArray(), beforeInvalid);
  assert.notDeepEqual(head.rotation.toArray(), sibling.getObjectByName(`village-${npc.role}-head`).rotation.toArray(), 'idle visibly animates the head');
}
assert.equal(VILLAGE_NPCS.length, 36);
for (const [geometry, positions] of originalGeometry) assert.deepEqual(geometry.getAttribute('position').array, positions, 'instances and idle retain immutable shared geometry');
for (const [node, matrix] of originalMatrices) { node.updateMatrix(); assert.deepEqual(node.matrix.toArray(), matrix, 'the source library is immutable'); }

const disposal = new Map();
function track(resource) { if (disposal.has(resource)) return; disposal.set(resource, 0); resource.addEventListener('dispose', () => disposal.set(resource, disposal.get(resource) + 1)); }
root.traverse(node => {
  if (!node.isMesh) return;
  track(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) track(material);
  if (node.isInstancedMesh) track(node);
});
assert.equal([...disposal.keys()].filter(resource => resource.isBufferGeometry).length, 17);
assert.equal([...disposal.keys()].filter(resource => resource.isMaterial).length, 1);
disposeWorldGroup(root);
assert.equal(root.parent, null); assert.equal(root.children.length, 0); assert.equal(unrelated.parent, scene);
assert([...disposal.values()].every(count => count === 1), 'one world close releases shared asset resources and every instance buffer exactly once');
console.log(`Village assets checked: ${bytes.length} bytes, ${triangles} triangles, 84 instanced props, 36 isolated villagers, exact pivots and one-time world disposal.`);
