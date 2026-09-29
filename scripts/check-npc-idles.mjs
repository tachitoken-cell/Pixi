import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setIdleAnimations } from '../src/idle-animation.ts';
import { createVillager, animateVillager } from '../src/village-models.ts';
import { setMountAssets, makeMount, animateMount, mountBob, mountSeat, mountRiderOffset, disposeMount } from '../src/mounts.ts';
import { makeCharacter, animateCharacter, setCharacterRaces, setCharacterCustomization, setCharacterGear } from '../src/characters.ts';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';

async function load(name) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
function pose(root) {
  const result = []; root.traverse(node => result.push([node.name, ...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()])); return result;
}
function samePose(actual, expected, label) {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((values, index) => values.forEach((value, axis) => typeof value === 'number'
    ? assert(Math.abs(value - expected[index][axis]) < 1e-7, `${label}: ${values[0]}/${axis}`)
    : assert.equal(value, expected[index][axis], label)));
}
function finite(root) {
  root.updateMatrixWorld(true); root.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), `finite ${node.name}`));
}
const [villages, trainers, mounts, idles] = await Promise.all(['village-kit', 'trainer-kit', 'mounts', 'idle-animations'].map(load));
setIdleAnimations(idles.scene, idles.animations); setMountAssets(mounts.scene);
for (const [name, install] of [['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear]]) install((await load(name)).scene);
const roles = ['merchant', 'warden', 'healer', 'riding-trainer', 'mount-seller', 'ranger-trainer', 'knight-trainer', 'mage-trainer'];
for (const role of roles) {
  const asset = roles.indexOf(role) < 3 ? villages.scene : trainers.scene, source = asset.getObjectByName(`village-${role}`), sourcePose = pose(source);
  const actor = createVillager(asset, role), twin = createVillager(asset, role), untouched = pose(twin);
  actor.position.set(7, 4, -3); actor.rotation.y = .73; actor.scale.set(1.2, 1.2, 1.2);
  const rootPose = [actor.position.toArray(), actor.quaternion.toArray(), actor.scale.toArray()], variations = new Set();
  let dephased = false;
  for (const time of [0, .4, 1.2, 2.6, 4.1, 6.7, 9.3, 14.5]) {
    animateVillager(actor, time); finite(actor); variations.add(JSON.stringify(pose(actor).slice(1)));
    assert.deepEqual([actor.position.toArray(), actor.quaternion.toArray(), actor.scale.toArray()], rootPose, 'NPC idles preserve authoritative root transform');
    assert(Math.abs(new THREE.Box3().setFromObject(actor).min.y - 4) < .025, `${role} keeps grounded feet`);
    const sample = pose(actor); animateVillager(actor, time); samePose(pose(actor), sample, 'repeated sampling never accumulates animation');
    if (time === 0) samePose(pose(twin), untouched, 'one NPC cannot animate another clone');
    animateVillager(twin, time);
    dephased ||= JSON.stringify(pose(actor).slice(1)) !== JSON.stringify(pose(twin).slice(1));
  }
  assert(variations.size > 3, `${role} has a changing authored idle`); assert(dephased, `${role} residents idle at different phases`);
  animateVillager(actor, 14.5, -.4); assert.equal(actor.rotation.y, -.4, 'NPCs retain look-at interaction');
  const current = pose(actor); animateVillager(actor, NaN, Infinity); samePose(pose(actor), current, 'invalid time is ignored');
  samePose(pose(source), sourcePose, 'NPC idles never mutate the shared source or held prop geometry');
}
for (const id of ['horse', 'wolf']) {
  const source = mounts.scene.getObjectByName(`mount-${id}`), sourcePose = pose(source), mount = makeMount(id), twin = makeMount(id);
  const rider = makeCharacter({ ...DEFAULT_APPEARANCE, className: 'Ranger' });
  mount.position.set(12, 2, -8); mount.rotation.y = .73; rider.position.copy(mount.position); rider.position.y += mountRiderOffset(rider, id); rider.rotation.y = .73;
  const rig = rider.userData.rig, variations = new Set(); let dephased = false;
  for (const time of [0, .4, 1.2, 2.6, 4.1, 6.7, 9.3, 14.5]) {
    animateCharacter(rider, time, false, false, undefined, false, { mount: id }); animateMount(mount, time, false, false, rider); finite(mount);
    variations.add(JSON.stringify(pose(mount).slice(2))); assert.deepEqual(mount.position.toArray(), [12, 2, -8]); assert.equal(mount.rotation.y, .73); assert.deepEqual(mount.scale.toArray(), [1, 1, 1]);
    const hip = new THREE.Vector3(0, rig.leftLeg.position.y, 0); rig.body.localToWorld(hip); mount.worldToLocal(hip);
    assert(Math.abs(hip.y - mountSeat(id).seatY - mountBob(time, false)) < 1e-6, 'authored idle keeps rider synchronized with the saddle');
    assert(Math.abs(hip.z - mountSeat(id).seatZ) < 1e-6);
    const head = mount.getObjectByName(`${id}-head`), anchor = head.userData.reinAnchor, positions = mount.getObjectByName('rider-reins').geometry.attributes.position;
    for (const [side, arm] of [rig.leftArm, rig.rightArm].entries()) {
      const palm = new THREE.Vector3(0, -.625, .04); arm.localToWorld(palm); mount.worldToLocal(palm);
      const bridle = new THREE.Vector3((side ? -1 : 1) * anchor[0], anchor[1], anchor[2]); head.localToWorld(bridle); mount.worldToLocal(bridle);
      assert(palm.distanceTo(new THREE.Vector3().fromBufferAttribute(positions, side * 4)) < 1e-6, 'idle reins remain inside rider palms');
      assert(bridle.distanceTo(new THREE.Vector3().fromBufferAttribute(positions, side * 4 + 3)) < 1e-6, 'idle reins follow the posed bridle');
    }
    const sample = pose(mount); animateMount(mount, time, false, false, rider); samePose(pose(mount), sample, 'mount idle never accumulates animation');
    animateMount(twin, time, false); dephased ||= JSON.stringify(pose(mount).slice(2, -1)) !== JSON.stringify(pose(twin).slice(2, -1));
  }
  assert(variations.size > 3, `${id} has a changing authored idle`); assert(dephased, `${id} idles are dephased`);
  // Compare all local parts after leaving idle to an independently posed mount.
  for (const [moving, jump] of [[true, undefined], [true, { grounded: false, velocity: 8 }], [false, { grounded: false, velocity: -4 }]]) {
    animateMount(mount, 15, moving, true, undefined, jump); animateMount(twin, 15, moving, true, undefined, jump);
    samePose(pose(mount).slice(1), pose(twin).slice(1), 'movement and jumping clear every idle transform');
  }
  animateMount(mount, 15, false);
  samePose(pose(mount.getObjectByName(`${id}-head`)), pose(source.getObjectByName(`${id}-head`)), 'returning to idle starts from neutral before the authored motion fades in');
  samePose(pose(source), sourcePose, 'mount idles preserve shared source'); disposeMount(mount); disposeMount(twin);
}
console.log('PASS authored idles: eight NPC roles and both mounts animate independently without drift; grounded NPCs, stable world transforms, look-at behavior, synchronized saddles, palm-to-bridle reins, and clean movement/jump transitions.');
