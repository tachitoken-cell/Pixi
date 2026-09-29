import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HEARTHLING_NPC as npc } from '../src/hearthling.ts';
import { createVillager, animateVillager } from '../src/village-models.ts';
import { setIdleAnimations } from '../src/idle-animation.ts';
import { buildingFloorHeight } from '../src/buildings.ts';
import { VILLAGES, VILLAGE_NPCS, insideVillageSafeArea } from '../src/settlements.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, WORLD_SCENERY, canTraverse } from '../src/realm.ts';
import { surfaceAt } from '../src/landscape.ts';
import { WORLD_GATHERING_NODES } from '../src/gathering-nodes.ts';
import { findPath } from '../src/navigation.ts';
import { disposeWorldGroup } from '../src/world.ts';

async function load(path) {
  const bytes = readFileSync(new URL(`../public${path}`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const root = new THREE.Group(), villagers = new Map();
const source = readFileSync(new URL('../src/zones.ts', import.meta.url), 'utf8');
const block = source.match(/const hearthlingAsset = [\s\S]*?villagers\.set\(HEARTHLING_NPC\.id, hearthling\);/)?.[0];
assert(block, 'Hearthling must use the overworld-owned loading path');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction('GLTFLoader', 'createVillager', 'HEARTHLING_NPC', 'buildingFloorHeight', 'root', 'villagers', block)(
  class { async loadAsync(path) { assert.equal(path, '/models/hearthling.glb'); return load(path); } },
  createVillager, npc, buildingFloorHeight, root, villagers,
);
const model = villagers.get(npc.id);
assert(model && model.parent === root && model.userData.targetId === npc.id);
assert.deepEqual(model.scale.toArray(), [4, 4, 4]);
assert.equal(model.rotation.y, npc.rotation);
assert.equal(model.userData.villagerIdle.head.name, 'hearthling-head');
assert.equal(model.userData.villagerIdle.leftArm.name, 'hearthling-left-arm');
assert.equal(model.userData.villagerIdle.rightArm.name, 'hearthling-right-arm');
model.traverse(part => { if (part.isMesh) assert(part.castShadow && part.receiveShadow); });
const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
assert(size.y > 4.5 && size.y < 4.9 && Math.abs(bounds.min.y - buildingFloorHeight(npc.x, npc.z)) < .001);
assert(insideVillageSafeArea(npc.x, npc.z) && canTraverse(npc, npc), 'Friendly NPC remains in the safe area and nonblocking');
const heights = [];
for (const x of [bounds.min.x, npc.x, bounds.max.x]) for (const z of [bounds.min.z, npc.z, bounds.max.z]) {
  const surface = surfaceAt(x, z);
  assert(!surface.water && surface.zone === npc.zone && canTraverse({ x, z }, { x, z }), 'Entire model footprint is dry and clear');
  heights.push(surface.height);
}
assert(Math.max(...heights) - Math.min(...heights) < .05, 'Both feet stand on level terrain');
assert(VILLAGE_NPCS.every(other => Math.hypot(npc.x - other.x, npc.z - other.z) > 4), 'Existing NPC interactions stay clear');
assert(WORLD_GATHERING_NODES.every(node => Math.hypot(npc.x - node.x, npc.z - node.z) > 4), 'No resource model overlaps Hearthling');
assert(WORLD_SCENERY.filter(solid => solid.kind !== 'house').every(solid => Math.hypot(npc.x - solid.x, npc.z - solid.z) > solid.r + 2), 'No scenery overlaps Hearthling');
const approach = { x: npc.x + Math.sin(npc.rotation) * 2.5, z: npc.z + Math.cos(npc.rotation) * 2.5 };
const village = VILLAGES.find(entry => entry.name === 'Willowbrook');
const path = findPath(village, approach, WORLD_COLLIDERS, WORLD_BOUNDS);
assert(path.length && Math.hypot(path.at(-1).x - approach.x, path.at(-1).z - approach.z) < .01);
assert(canTraverse(approach, npc), 'Talk point has clear line of sight within three metres');
let previous = village;
for (const step of path) { assert(canTraverse(previous, step)); previous = step; }

const idles = await load('/models/idle-animations.glb');
setIdleAnimations(idles.scene, idles.animations);
const position = model.position.toArray(), head = model.userData.villagerIdle.head, poses = new Set();
for (const time of [0, .4, 1.2, 2.6, 4.1, 6.7]) {
  animateVillager(model, time); model.updateMatrixWorld(true);
  assert.deepEqual(model.position.toArray(), position); assert.deepEqual(model.scale.toArray(), [4, 4, 4]);
  model.traverse(part => assert(part.matrixWorld.elements.every(Number.isFinite)));
  poses.add(JSON.stringify(head.quaternion.toArray()));
  const pose = head.quaternion.clone(); animateVillager(model, time); assert(head.quaternion.equals(pose), 'Idle sampling does not accumulate');
}
assert(poses.size > 2, 'Existing authored idle animates the cottage head');
const pet = (await load('/models/hearthling.glb')).scene;
let petDisposed = false, npcDisposed = false;
pet.traverse(part => { if (part.isMesh) part.geometry.addEventListener('dispose', () => { petDisposed = true; }); });
model.traverse(part => { if (part.isMesh) part.geometry.addEventListener('dispose', () => { npcDisposed = true; }); });
disposeWorldGroup(root);
assert(npcDisposed && !petDisposed, 'Leaving the world releases NPC geometry without disposing pet assets');
console.log(`PASS ${npc.name} NPC: ${size.y.toFixed(3)}m tall, authored idle and portrait joints, safe dry footprint, clear village route and interaction, independently owned world geometry.`);
