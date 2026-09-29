import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bytes = await readFile(new URL('../public/models/giant-trees.glb', import.meta.url));
assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(8), bytes.length);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
assert.equal(json.meshes.length, 4); assert.equal(json.materials.length, 1);
assert(bytes.length < 1_000_000, 'four authored tree models fit a one-megabyte download budget');
assert(!json.textures?.length && !json.cameras?.length && !json.animations?.length && !json.extensions?.KHR_lights_punctual,
  'the runtime asset excludes gallery resources');
assert(json.extensionsRequired.includes('KHR_mesh_quantization'));
assert(!json.extensionsRequired.some(extension => /draco|meshopt/i.test(extension)), 'the existing loader needs no new decoder');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
gltf.scene.updateMatrixWorld(true);
let triangles = 0, giantTriangles = 0, woodlandTriangles = 0, material;
for (const [name, height, minWidth, trunkRadius] of [['ElderOak', 24, 20, 1.5], ['GiantPine', 29.7, 10, 1.5], ['WoodlandOak', 5.8, 4.5, .59], ['WoodlandPine', 5.8, 3.7, .59]]) {
  const mesh = gltf.scene.getObjectByName(name); assert(mesh?.isMesh, `${name} is directly instanced as a single mesh`);
  assert.deepEqual(mesh.position.toArray(), [0, 0, 0]); assert.deepEqual(mesh.quaternion.toArray(), [0, 0, 0, 1]); assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
  const bounds = new THREE.Box3().setFromObject(mesh), size = bounds.getSize(new THREE.Vector3());
  assert(Math.abs(bounds.min.y) < .001, `${name} root rests at ground level`);
  assert(Math.abs(bounds.max.y - height) < .001, `${name} preserves its authored height`);
  assert(size.x >= minWidth && size.z >= minWidth, `${name} has a substantial canopy`);
  assert.equal(mesh.userData.trunkRadius, trunkRadius); assert.equal(mesh.userData.height, height);
  assert(mesh.material.vertexColors && mesh.geometry.getAttribute('color'), 'one shared palette preserves painted voxel detail');
  material ??= mesh.material;assert.equal(mesh.material,material,'all four tree species share one painted material');
  for (const attribute of Object.values(mesh.geometry.attributes)) assert(attribute.array.every(Number.isFinite));
  const position = mesh.geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) if (position.getY(i) < 2) {
    assert(Math.hypot(position.getX(i), position.getZ(i)) <= trunkRadius, `${name} walking-height trunk fits its collider`);
  }
  assert(mesh.geometry.index.array.every(index => index < position.count));
  triangles += mesh.geometry.index.count / 3;
  if(name.startsWith('Woodland'))woodlandTriangles+=mesh.geometry.index.count/3;else giantTriangles+=mesh.geometry.index.count/3;
}
assert(giantTriangles > 8_000 && giantTriangles < 15_000, 'the two original giant trees keep their repeated-mesh budget');
assert(woodlandTriangles > 1_500 && woodlandTriangles < 4_500, 'the two distinct woodland models add bounded detail for dense forests');
assert(triangles < 19_000,'all four instanced models retain a bounded combined mesh budget');
assert((await stat(new URL('../assets/source/giant-trees.blend', import.meta.url))).size > 100_000);
assert((await stat(new URL('../assets/source/giant-trees-preview.png', import.meta.url))).size > 100_000);
console.log(`Tree assets checked: four single-mesh trees, 5.8/24/29.7m tall, ${triangles} triangles, ${bytes.length} bytes, one shared palette and grounded collision footprints.`);
