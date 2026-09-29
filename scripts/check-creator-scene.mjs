import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bytes = await readFile(new URL('../public/models/creator-scene.glb', import.meta.url));
assert(bytes.length < 1500000, 'the starting scene must remain small enough for browser entry');
const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
scene.updateMatrixWorld(true);
let meshes = 0, triangles = 0;
const materials = new Set();
scene.traverse(object => {
  assert(object.matrixWorld.elements.every(Number.isFinite));
  if (!(object instanceof THREE.Mesh)) return;
  meshes++;
  assert([...object.geometry.attributes.position.array].every(Number.isFinite));
  triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
    materials.add(material);
    assert(!material.map, 'the woodland must be real geometry, not a backdrop texture');
  }
});
assert(meshes > 0 && meshes <= 35 && materials.size <= 24);
assert(triangles > 1000 && triangles < 50000);
const bounds = new THREE.Box3().setFromObject(scene);
assert(bounds.min.x < -10 && bounds.max.x > 10 && bounds.min.z < -20 && bounds.max.y > 5);
for (const x of [-1, 0, 1]) for (const z of [-.5, .5]) {
  const hits = new THREE.Raycaster(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0)).intersectObject(scene, true);
  assert(hits.length && Math.abs(hits[0].point.y) < .015, 'the character must stand on clear ground at Y=0');
}
console.log(`PASS: creator GLB imports; ${meshes} meshes, ${triangles} triangles; finite geometry, no backdrop textures, clear character stage.`);
