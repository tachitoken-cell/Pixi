import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bytes = readFileSync(new URL('../public/models/raid-approach-rooms.glb', import.meta.url));
assert(bytes.length < 12_000_000, 'the seven-room pack stays below 12 MB');
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
asset.scene.updateMatrixWorld(true);
assert.deepEqual(asset.scene.children.map(node => node.name).sort(), Array.from({ length: 7 }, (_, i) => `raid-chamber-${i}`));
assert.equal(asset.animations.length, 0, 'static rooms carry no animation payload');
const materials = new Set(), position = new THREE.Vector3();
const ray = new THREE.Raycaster(undefined, new THREE.Vector3(0, -1, 0));
const floorTriangleCounts = new Set();
for (let i = 0; i < 7; i++) {
  const root = asset.scene.getObjectByName(`raid-chamber-${i}`);
  assert.deepEqual(root.position.toArray(), [0, 0, 0], 'runtime roots keep the common encounter origin');
  const bounds = new THREE.Box3().setFromObject(root, true);
  assert(bounds.max.y > [20, 13, 19, 16, 20, 16, 21][i], 'defining room scenery remains visible above the common gate and walls');
  assert(/^[a-f0-9]{64}$/.test(root.userData.source_sha256), 'the imported architectural source remains traceable');
  const floor = root.getObjectByName(`${root.name}-floor`);
  assert(floor && root.getObjectByName(`${root.name}-decor`), 'floor and camera-cutaway decorations have stable groups');
  let draws = 0, triangles = 0, floorTriangles = 0;
  root.traverse(node => {
    if (!node.isMesh) return;
    draws++;
    const count = (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    triangles += count;
    if (node.parent === floor) floorTriangles += count;
    materials.add(node.material);
    assert(!node.material.map && node.geometry.attributes.color, 'authored vertex colors use shared texture-free materials');
    const vertices = node.geometry.attributes.position, colors = node.geometry.attributes.color;
    for (let j = 0; j < vertices.count; j++) {
      position.fromBufferAttribute(vertices, j).applyMatrix4(node.matrixWorld);
      assert(Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z));
      if (position.y > .08 && position.y < 7 && Math.abs(position.x) < 34 && Math.abs(position.z) < 34) {
        assert(position.z < -25 && position.z > -29 && Math.abs(position.x) > 6, 'only gate posts outside the central 12m passage may enter the flat combat square');
      }
      assert(colors.getZ(j) >= colors.getX(j) && colors.getZ(j) >= colors.getY(j), 'the architecture retains the void palette');
    }
  });
  assert(draws >= 5 && draws <= 6, 'room details are merged into at most six draws');
  assert(triangles > 20_000 && triangles < 50_000, 'authored terrain and ornaments stay within the detailed-room budget');
  floorTriangleCounts.add(floorTriangles);
  let samples = 0;
  for (let x = -34; x <= 34; x += 2) for (let z = -34; z <= 34; z += 2) {
    ray.ray.origin.set(x, 3, z);
    const hit = ray.intersectObject(floor, true)[0];
    assert(hit && hit.point.y > -.07 && hit.point.y < .04, `room ${i} supports the floor at ${x},${z}`);
    samples++;
  }
  console.log(`Room ${i}: ${draws} draws, ${triangles} triangles, ${samples} flat floor samples`);
}
assert.equal(materials.size, 5, 'all rooms share five material palettes');
assert(floorTriangleCounts.size >= 5, 'the chambers retain distinct authored paving patterns');
console.log(`PASS approach rooms: ${(bytes.length / 1e6).toFixed(2)} MB, stable roots, shared palettes, safe passage, and 8,575 floor samples.`);
