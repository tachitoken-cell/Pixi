import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBuildingModels } from '../src/building-models.ts';
import { BUILDINGS, BUILDING_CHAIRS, buildingPoint } from '../src/buildings.ts';
import { createVillager, animateVillager } from '../src/village-models.ts';
import { DEED_AUCTIONEER, AUCTIONEER } from '../src/city.ts';
import { canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';

const load = async path => { const bytes = readFileSync(path); return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')).scene; };
const deed = await load('public/models/deed-cottages-merchants.glb');
assert.equal(deed.children.length, 6);
assert(existsSync('assets/source/deed-cottages-merchants.blend'));
const source = await load('public/models/house-interiors.glb');
source.add(await load('public/models/city-kit.glb'), deed);
const homes = createBuildingModels(source, await load('public/models/frontier-biomes.glb'), await load('public/models/city-furnishings.glb'));
for (let i = 1; i <= 4; i++) {
  const id = `house-greenwood-${i}`, building = BUILDINGS.find(item => item.id === id), model = homes.root.getObjectByName(id);
  assert.equal(model.userData.deedId, i, 'the actual game selects the deed-specific house');
  const front = [], roofs = [];
  model.traverse(part => {
    if (part.isMesh) assert(Array.from(part.geometry.attributes.position.array).every(Number.isFinite));
    const name = part.userData.part;
    if (name?.startsWith('shell-front')) front.push(part);
    if (name?.startsWith('roof-')) roofs.push(part);
  });
  assert(front.length >= 3 && roofs.length >= 3, 'authored garden/lamps/roof survive export');
  homes.root.updateMatrixWorld(true);
  const door = buildingPoint(building, 0, building.depth / 2 + 2);
  const ray = new THREE.Raycaster(new THREE.Vector3(door.x, building.y + 1.6, door.z), new THREE.Vector3(0, 0, -1), 0, 4);
  assert.equal(ray.intersectObjects(front, true).length, 0, 'deed ornamentation never seals the real doorway');
  const chairs = BUILDING_CHAIRS.filter(chair => chair.buildingId === id);
  assert.equal(chairs.length, 2);
  for (const chair of chairs) {
    const mesh = homes.chairs.get(chair.id), centre = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    assert(Math.hypot(centre.x - chair.x, centre.z - chair.z) < .35);
  }
  homes.update(building, buildingPoint(building, 20, 20));
  assert(front.every(part => !part.visible) && roofs.every(part => !part.visible), 'all added decoration obeys interior cutaways');
}
for (const name of ['merchant-deed-auctioneer', 'merchant-auctioneer']) {
  const npc = createVillager(deed, 'auctioneer', name);
  for (const part of ['body', 'head', 'left-arm', 'right-arm']) assert(npc.getObjectByName(`${name}-${part}`));
  const bounds = new THREE.Box3().setFromObject(npc);
  assert(bounds.max.y > 2.4 && bounds.max.y < 2.7 && bounds.min.y >= -.01, 'merchant uses the existing player-scale rig');
  for (const at of [0, 1, 10]) { animateVillager(npc, at); npc.updateMatrixWorld(true); npc.traverse(obj => assert(obj.matrixWorld.elements.every(Number.isFinite))); }
}
assert(canTraverse(DEED_AUCTIONEER, DEED_AUCTIONEER, WORLD_COLLIDERS, WORLD_BOUNDS), 'merchant stands outside furniture collision');
assert(canTraverse(AUCTIONEER, DEED_AUCTIONEER, WORLD_COLLIDERS, WORLD_BOUNDS), 'merchant can be reached through the auction hall');
console.log('PASS: four integrated Blender deed houses, open doors, aligned seats/cutaways, two animated merchants and reachable auction NPC.');
