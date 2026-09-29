import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeLootRemains } from '../src/loot.ts';
import { makeEnemy, animateEnemy, setMonsterAssets, setDeathAnimations } from '../src/characters.ts';
import { MONSTER_MODEL_KINDS } from '../src/monster-models.ts';

const bytes = readFileSync(new URL('../public/models/monster-kit.glb', import.meta.url));
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
setMonsterAssets(asset.scene, asset.animations);
const deathBytes = readFileSync(new URL('../public/models/death-animations.glb', import.meta.url));
const deaths = await new GLTFLoader().parseAsync(deathBytes.buffer.slice(deathBytes.byteOffset, deathBytes.byteOffset + deathBytes.byteLength), '');
setDeathAnimations(deaths.scene, deaths.animations);

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const start = main.indexOf('function removeRig('), end = main.indexOf('function removeNode(');
assert(start >= 0 && end > start, 'test actual rig cleanup');
const removeRig = Function('THREE', `${stripTypeScriptTypes(main.slice(start, end))}; return removeRig;`)(THREE);
const signatures = new Set(), markerAssets = new Set();
for (const kind of ['moss-slime', 'briar-sentinel', 'ice-wisp', 'root-warden', ...MONSTER_MODEL_KINDS]) {
  const living = makeEnemy(kind), remains = makeLootRemains(kind), scene = new THREE.Scene();
  scene.add(living, remains);
  const fallen = remains.getObjectByName(`fallen-${kind}`), marker = remains.getObjectByName('loot-gold');
  const before = new THREE.Box3().setFromObject(living,true), bounds = new THREE.Box3().setFromObject(remains,true), body = new THREE.Box3().setFromObject(fallen,true);
  // Instanced original rigs are checked vertex-by-vertex in check-death-animations.
  if(MONSTER_MODEL_KINDS.includes(kind))assert(Math.abs(body.min.y) < .015 && Math.abs(bounds.min.y) < .015, `${kind} rests on the floor`);
  const pivot = fallen.getObjectByName(`${kind}-body`), overturned = pivot && new THREE.Vector3(0,1,0).applyQuaternion(pivot.quaternion).y < -.4;
  assert(body.max.y < before.max.y * .95 || overturned, `${kind} has a visibly fallen silhouette`);
  animateEnemy(living, 0, false, undefined, 1);
  const finalPose = new THREE.Box3().setFromObject(living,true);
  assert(body.min.distanceTo(finalPose.min) < .001 && body.max.distanceTo(finalPose.max) < .001, 'loot preserves the dying monster’s exact final position and shape');
  assert(marker.isInstancedMesh && marker.count > 0 && marker.instanceColor, 'gold glints use a single raycastable voxel batch');
  markerAssets.add(marker.geometry); markerAssets.add(marker.material);
  const livingAssets = new Set();
  let livingDraws = 0;
  living.traverse(node => { if (node.isMesh) { livingDraws++; livingAssets.add(node.geometry); livingAssets.add(node.material); } });
  const buffers = new Map(), shared = new Map();
  let cubes = 0, draws = 0;
  remains.updateMatrixWorld(true);
  remains.traverse(node => {
    assert(node.matrixWorld.elements.every(Number.isFinite));
    if (!node.isMesh) return;
    draws++;
    if (node.isInstancedMesh) {
      cubes += node.count;
      buffers.set(node, 0); node.addEventListener('dispose', () => buffers.set(node, buffers.get(node) + 1));
    }
    if (node !== marker) assert(livingAssets.has(node.geometry) && livingAssets.has(node.material), 'fallen enemies preserve shared model assets');
    for (const asset of [node.geometry, node.material]) if (!shared.has(asset)) {
      shared.set(asset, 0); asset.addEventListener('dispose', () => shared.set(asset, shared.get(asset) + 1));
    }
  });
  assert(buffers.size <= 9, 'a fallen rig adds only one marker draw');
  assert.equal(draws, livingDraws + 1, 'loot reuses the living mesh hierarchy plus one shared gold marker');
  signatures.add(`${cubes}:${body.getSize(new THREE.Vector3()).toArray().map(n => n.toFixed(3))}`);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, bounds.max.y + 1, 0), new THREE.Vector3(0, -1, 0));
  assert(ray.intersectObject(remains).length > 0, 'loot can be targeted through its real geometry');
  const pose = () => { const values = []; remains.traverse(node => values.push([...node.position.toArray(), ...node.rotation.toArray(), ...node.scale.toArray()])); return values; };
  const rest = pose(); animateEnemy(remains, 10, true); animateEnemy(fallen, 10, true);
  assert.deepEqual(pose(), rest, 'loot never resumes standing or levitating animation');
  removeRig(remains);
  assert.equal(remains.parent, null); assert.equal(living.parent, scene);
  assert([...buffers.values()].every(count => count === 1), 'every body and gold-marker instance buffer is disposed once');
  assert([...shared.values()].every(count => count === 0), 'cleanup preserves all shared geometry/materials for living enemies and later loot');
}
assert.equal(signatures.size, MONSTER_MODEL_KINDS.length + 4, 'all corpses retain distinct fallen monster silhouettes');
assert.equal(markerAssets.size, 2, 'every corpse shares one gold-marker geometry and material');
const treasure = makeLootRemains('briar-sentinel', true);
assert.equal(treasure.children.length, 1, 'chest contents show golden loot without inventing a fallen monster');
assert.equal(treasure.children[0].name, 'loot-gold');
removeRig(treasure);
assert.throws(() => makeLootRemains('unknown-creature'), /Unknown enemy kind/);
console.log('PASS: all distinct fallen monsters, low quadruped remains, grounded finite bounds, static poses, raycastable gold glints, shared assets and isolated instance-buffer disposal.');
