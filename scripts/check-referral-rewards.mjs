import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMountPassengers, MOUNT_INVITE_MS } from '../src/mount-passengers.mjs';
import { PETS } from '../src/pets.ts';
import { MOUNTS, newTravel } from '../src/travel.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { NFT_PETS, NFT_MOUNTS } from '../src/nfts.ts';
import { MOUNT_PRICES } from '../src/training.ts';
import { setMountAssets, makeMount, animateMount, mountSeat, mountRiderOffset, mountBob, disposeMount } from '../src/mounts.ts';
import { makeCharacter, animateCharacter, setCharacterRaces, setCharacterCustomization, setCharacterGear } from '../src/characters.ts';
import { RACES, GENDERS, DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { renderPetCollection, renderMountCollection } from '../src/pet-ui.ts';

const pet = PETS.find(p => p.id === 'wayfinder-sprite'), mount = MOUNTS.find(m => m.id === 'wayfarer-stag');
assert(pet?.referralOnly && mount?.referralOnly); assert.equal(mount.seats, 2);
assert.equal(LOOT_ITEMS[pet.id], undefined); assert.equal(LOOT_ITEMS[mount.id], undefined); assert(!NFT_PETS.some(p => p.id === pet.id)); assert(!NFT_MOUNTS.some(m => m.id === mount.id)); assert.equal(MOUNT_PRICES[mount.id], undefined);
const uiPlayer = { ownedPets: [], summonedPet: null, carriedItems: { [pet.id]: 1 }, hp: 100, zeppelin: null, ownedMounts: [], ridingRank: 0, level: 1 };
const petUI = renderPetCollection(uiPlayer, true, 0, pet.id);
assert.match(petUI, /10 qualified referrals/); assert.match(petUI, /Cannot be traded or minted/);
assert.match(petUI, /data-learn-pet="wayfinder-sprite"[^>]*disabled/); assert(!petUI.includes('data-claim-nft-pet='));
assert.match(renderPetCollection({ ...uiPlayer, ownedPets: [pet.id] }, true, 0, pet.id), /data-summon-pet="wayfinder-sprite"/);
const mountUI = renderMountCollection(uiPlayer, true, mount.id, mount.id, true);
assert.match(mountUI, /25 qualified referrals/); assert.match(mountUI, /Two saddles/); assert(!mountUI.includes('undefined gold'));

let clock = 1000;
const sessions = new Map(), sent = [], corrected = [];
const session = (id, x = 0) => {
  const s = { player: { id, name: id, hp: 100, x, z: 0, zone: 'greenwood', rotation: 0 }, travel: newTravel(), jump: { grounded: true, y: 0, velocity: 0, sequence: 0 }, moveBudget: 3, lastMove: 0 };
  sessions.set(id, s); return s;
};
const driver = session('driver'), passenger = session('passenger', 2), other = session('other', 3);
driver.travel.mount = mount.id;
const valid = s => !s.combat && !s.indoors;
const rides = createMountPassengers({ sessions, ready: s => valid(s) && s.jump.grounded, valid,
  prepare: s => { s.prepared = true; }, send: (s, message) => sent.push([s.player.id, message]), correct: s => corrected.push(s.player.id), now: () => clock });
assert(rides.accept(passenger, driver.player.id), 'boarding without consent is rejected');
assert(rides.invite(passenger, driver.player.id), 'only the stag driver can invite');
passenger.player.x = 7; assert(rides.invite(driver, passenger.player.id), 'boarding range enforced'); passenger.player.x = 2;
passenger.combat = true; assert(rides.invite(driver, passenger.player.id)); passenger.combat = false;
assert.equal(rides.invite(driver, passenger.player.id), null);
assert.equal(sent.at(-1)[1].invitation.playerId, driver.player.id);
passenger.combat = true; assert(rides.accept(passenger, driver.player.id), 'accept rechecks current gameplay state'); passenger.combat = false;
assert.equal(rides.invite(driver, passenger.player.id), null); clock += MOUNT_INVITE_MS; rides.sync();
assert.equal(sent.at(-1)[1].invitation, null); assert(rides.accept(passenger, driver.player.id), 'expired invitation cannot board');
assert.equal(rides.invite(driver, passenger.player.id), null); assert.equal(rides.accept(passenger, driver.player.id), null);
assert(driver.prepared && passenger.prepared); assert.equal(driver.travel.passengerId, passenger.player.id); assert.equal(passenger.travel.driverId, driver.player.id);
assert.equal(passenger.travel.mount, mount.id); assert.equal(passenger.moveBudget, 0); assert(corrected.includes(passenger.player.id));
assert(rides.invite(driver, other.player.id), 'two seats cannot accept a third rider');
Object.assign(driver.player, { x: 9, z: -6, rotation: .9, zone: 'amberwild' }); Object.assign(driver.jump, { grounded: false, y: 2, velocity: 5, sequence: 1 });
rides.sync(); assert.equal(passenger.player.x, 9); assert.equal(passenger.player.zone, 'amberwild'); assert.deepEqual(passenger.jump, driver.jump);
rides.leave(passenger); assert(!driver.travel.passengerId); assert(!passenger.travel.driverId); assert.equal(passenger.travel.mount, null); assert.equal(driver.travel.mount, mount.id);
driver.jump.grounded = passenger.jump.grounded = true;
assert.equal(rides.invite(driver, passenger.player.id), null); rides.decline(passenger, driver.player.id); assert(rides.accept(passenger, driver.player.id));
assert.equal(rides.invite(driver, passenger.player.id), null); assert.equal(rides.accept(passenger, driver.player.id), null);
driver.combat = true; rides.sync(); assert.equal(passenger.travel.mount, null); assert(!driver.travel.passengerId); driver.combat = false;
assert.equal(rides.invite(driver, passenger.player.id), null); assert.equal(rides.accept(passenger, driver.player.id), null);
sessions.delete(driver.player.id); rides.sync(); assert.equal(passenger.travel.mount, null); assert(!passenger.travel.driverId);
sessions.set(driver.player.id, driver); rides.leave(driver); driver.travel.mount = mount.id;
assert.equal(rides.invite(driver, passenger.player.id), null); assert.equal(rides.accept(passenger, driver.player.id), null);
driver.instanceId = 'dungeon'; rides.sync(); assert.equal(passenger.travel.mount, null); delete driver.instanceId;

for (const [name, setter] of [['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear]]) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  setter((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene);
}
async function loadReferral(name) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const mountAsset = await loadReferral(mount.id), spriteAsset = await loadReferral(pet.id);
setMountAssets(mountAsset, [mount.id]);
const visual = makeMount(mount.id), twin = makeMount(mount.id);
assert(mountSeat(mount.id).seatZ - mountSeat(mount.id, true).seatZ > 1.2, 'two separate saddles leave room for the riders');
const firstMesh = root => { let mesh; root.traverse(node => { if (node.isMesh && !mesh) mesh = node; }); return mesh; };
assert.equal(firstMesh(visual).geometry, firstMesh(twin).geometry, 'mounts share authored geometry');
const spriteA = spriteAsset.getObjectByName(pet.id).clone(true), spriteB = spriteAsset.getObjectByName(pet.id).clone(true);
assert(spriteA.getObjectByName('wayfinder-sprite-wing-left')); assert.notEqual(spriteA.children[0], spriteB.children[0]); assert.equal(firstMesh(spriteA).geometry, firstMesh(spriteB).geometry);
for (const [id, asset] of [[pet.id, spriteA], [mount.id, visual]]) {
  let triangles = 0; const materials = new Set();
  asset.traverse(node => { if (node.isMesh) { triangles += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3; for (const material of [].concat(node.material)) materials.add(material); } });
  assert(triangles > 8000 && triangles < 80000, `${id} uses detailed, bounded Blender geometry: ${triangles}`);
  assert(materials.size <= 4, 'authored parts share their palette');
  assert(readFileSync(new URL(`../assets/source/${id}.blend`, import.meta.url)).length > 1000, 'editable Blender source is retained');
}
for (const race of RACES) for (const gender of GENDERS) for (const passengerSeat of [false, true]) {
  const rider = makeCharacter({ ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id });
  rider.position.y = mountRiderOffset(rider, mount.id, passengerSeat);
  for (const moving of [false, true]) for (const grounded of [false, true]) {
    const jump = { grounded, velocity: 4 }, time = .31;
    animateCharacter(rider, time, moving, false, undefined, false, { mount: mount.id, driverId: passengerSeat ? 'driver' : undefined, jump });
    animateMount(visual, time, moving, false, rider, jump);
    rider.updateMatrixWorld(true); visual.updateMatrixWorld(true);
    const rig = rider.userData.rig, hip = new THREE.Vector3(0, rig.leftLeg.position.y, 0); rig.body.localToWorld(hip);
    assert(Math.abs(hip.y - mountSeat(mount.id, passengerSeat).seatY - mountBob(time, moving, false, mount.id, !grounded)) < 1e-6);
    assert(Math.abs(hip.z - mountSeat(mount.id, passengerSeat).seatZ) < 1e-6, 'each rider stays in their own saddle');
    visual.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite)));
  }
}
disposeMount(visual); disposeMount(twin);
console.log('PASS referral rewards: bound collections, unique shared visuals, both rider seats, consent, expiry, range, capacity, authoritative follow and safe cleanup.');
