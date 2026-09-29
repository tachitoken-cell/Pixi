import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBuildingModels } from '../src/building-models.ts';
import { discoverEnvironmentEmitters } from '../src/environment-lights.ts';
import { BUILDINGS, buildingPoint } from '../src/buildings.ts';
import { CITY_CLOCKTOWER } from '../src/city.ts';

const load = async name => {
  const bytes = readFileSync(`public/models/${name}.glb`);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')).scene;
};
const [asset, city, deeds, frontier, furnishings] = await Promise.all(
  ['house-interiors', 'city-kit', 'deed-cottages-merchants', 'frontier-biomes', 'city-furnishings'].map(load));
asset.add(city, deeds);
const optimized = createBuildingModels(asset, frontier, furnishings);
const baseline = createBuildingModels(asset, frontier, furnishings);
// The former per-frame transform behavior, using the same authored assets and animation.
baseline.root.traverse(node => { node.matrixAutoUpdate = true; });
const emitters = [optimized, baseline].map(homes => discoverEnvironmentEmitters(homes.root)
  .map(({ position, color, fire, size, scale }) => ({ position: position.toArray(), color, fire, size: size?.toArray(), scale })));
assert(emitters[0].length > 0);
assert.deepEqual(emitters[0], emitters[1], 'every authored lamp and hearth retains its exact lighting anchor');
const nodes = [optimized, baseline].map(homes => {
  const result = []; homes.root.traverse(node => result.push(node)); return result;
});
assert.equal(nodes[0].length, nodes[1].length);
assert.equal(optimized.root.children.length, BUILDINGS.length);
const pendulums = nodes[0].filter(node => node.name === 'Clock pendulum fulcrum');
assert(pendulums.length > 0);
assert(nodes[0].every(node => node.matrixWorldAutoUpdate), 'parent/world transforms stay automatic');
assert.equal(nodes[0].filter(node => node.matrixAutoUpdate).length, pendulums.length + 1,
  'only the public root and animated pivots recompose local matrices each frame');
const scene = new THREE.Scene(); scene.add(optimized.root, baseline.root);
const rest = pendulums[0].quaternion.clone();
let baselineWrites = 0, optimizedWrites = 0;
const nodeSets = nodes.map(list => new Set(list)), updateMatrix = THREE.Object3D.prototype.updateMatrix;
THREE.Object3D.prototype.updateMatrix = function () {
  if (nodeSets[0].has(this)) optimizedWrites++; else if (nodeSets[1].has(this)) baselineWrites++;
  return updateMatrix.call(this);
};
for (let frame = 0; frame < 120; frame++) {
  // Covers open streets, entering/exiting the hall, camera orbits and moved world parents.
  const player = frame < 60 ? { x: CITY_CLOCKTOWER.x + 30 * Math.sin(frame / 8), z: CITY_CLOCKTOWER.z + 30 * Math.cos(frame / 8) } : CITY_CLOCKTOWER;
  const camera = buildingPoint(CITY_CLOCKTOWER, 20 * Math.cos(frame / 10), 20 * Math.sin(frame / 10));
  scene.position.set(frame / 100, frame / 200, -frame / 100); scene.rotation.y = frame / 100;
  for (const homes of [optimized, baseline]) { homes.animate(frame / 30); homes.update(player, camera); }
  scene.updateMatrixWorld();
  for (let i = 0; i < nodes[0].length; i++) {
    assert.deepEqual(nodes[0][i].matrixWorld.elements, nodes[1][i].matrixWorld.elements,
      `same rendered transform at frame ${frame}: ${nodes[0][i].name}`);
    assert.equal(nodes[0][i].visible, nodes[1][i].visible, 'identical distance visibility and indoor cutaways');
  }
}
THREE.Object3D.prototype.updateMatrix = updateMatrix;
assert(!pendulums[0].quaternion.equals(rest), 'pendulum pivot keeps swinging');
assert(optimizedWrites < baselineWrites / 100, 'remove at least 99% of repeated home local matrix compositions');
console.log(`PASS: ${nodes[0].length} authored home nodes retain exact world transforms, visibility, cutaways and ${pendulums.length} pendulums; local matrix compositions ${baselineWrites} -> ${optimizedWrites} across 120 frames.`);

if (process.argv.includes('--benchmark')) {
  // Timings are informational; correctness and counted work above are deterministic.
  for (const homes of [optimized, baseline]) scene.remove(homes.root);
  const measure = homes => {
    scene.add(homes.root);
    for (let i = 0; i < 300; i++) { homes.animate(i / 60); scene.updateMatrixWorld(); }
    const samples = [];
    for (let round = 0; round < 40; round++) {
      const start = performance.now();
      for (let i = 0; i < 100; i++) { homes.animate(i / 60); scene.updateMatrixWorld(); }
      samples.push((performance.now() - start) / 100);
    }
    scene.remove(homes.root); samples.sort((a, b) => a - b);
    return { medianMs: samples[20], p95Ms: samples[38] };
  };
  console.log(JSON.stringify({ baseline: measure(baseline), optimized: measure(optimized) }, null, 2));
}
