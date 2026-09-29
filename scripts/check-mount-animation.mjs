import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setMountAssets, makeMount, animateMount, mountRiderOffset, mountSeat, mountBob, disposeMount } from '../src/mounts.ts';
import { makeCharacter, animateCharacter, setCharacterRaces, setCharacterCustomization, setCharacterGear } from '../src/characters.ts';
import { RACES, GENDERS, DEFAULT_APPEARANCE } from '../src/appearance.ts';

async function load(name) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const mounts = await load('mounts'); setMountAssets(mounts);
const store = await load('store-collection'); setMountAssets(store, ['store-embermane', 'store-cinderfang']); mounts.add(store);
const revenant = await load('verdant-revenant'); setMountAssets(revenant, ['verdant-revenant']); mounts.add(revenant);
const referral = await load('wayfarer-stag'); setMountAssets(referral, ['wayfarer-stag']); mounts.add(referral);
setCharacterRaces(await load('race-kit')); setCharacterCustomization(await load('customization-kit')); setCharacterGear(await load('gear-kit'));
assert.throws(() => setMountAssets(new THREE.Group()), /Missing mount model/);
function signature(root) {
  const parts = []; root.traverse(node => parts.push([node.position.toArray(), node.quaternion.toArray(), node.scale.toArray(), node.visible, node.isInstancedMesh ? [...node.instanceMatrix.array] : null])); return parts;
}
function finite(root) { root.updateMatrixWorld(true); root.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), `finite ${node.name}`)); }
let poses = 0;
for (const id of ['horse', 'wolf', 'store-embermane', 'store-cinderfang', 'verdant-revenant', 'wayfarer-stag']) {
  const mount = makeMount(id), twin = makeMount(id), source = mounts.getObjectByName(`mount-${id}`);
  const originals = signature(source); mount.position.set(12, 2, -8); mount.rotation.y = .73;
  const bodyMeshes = []; mount.getObjectByName(`${id}-body-mesh`).traverse(node => { if (node.isMesh) bodyMeshes.push(node); });
  const mesh = bodyMeshes[0], sibling = twin.getObjectByName(mesh.name);
  assert.equal(mesh.geometry, sibling.geometry); assert.equal(mesh.material, sibling.material);
  for (const race of RACES) for (const gender of GENDERS) for (const className of ['Knight', 'Mage', 'Ranger']) {
    const rider = makeCharacter({ ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id, className });
    const rig = rider.userData.rig, restJoints = [rig.head, rig.leftLeg, rig.rightLeg, rig.leftArm, rig.rightArm].map(node => [node, node.position.clone()]);
    rider.position.copy(mount.position); rider.position.y += mountRiderOffset(rider, id); rider.rotation.y = mount.rotation.y;
    animateCharacter(rider, 0, false); const rest = signature(rider);
    for (const moving of [false, true]) for (const upgraded of [false, true]) for (const time of [0, .13, .32, .57, 1.21]) {
      animateCharacter(rider, time, moving, false, undefined, false, { mount: id, upgraded });
      animateMount(mount, time, moving, upgraded, rider); finite(rider); finite(mount); poses++;
      assert.deepEqual(mount.position.toArray(), [12, 2, -8]); assert.equal(mount.rotation.y, .73);
      for (const [joint, position] of restJoints) { assert(joint.position.distanceTo(position) < 1e-7, 'riding preserves every authored joint'); assert.deepEqual(joint.scale.toArray(), [1, 1, 1], 'riding never stretches anatomy'); }
      const hip = new THREE.Vector3(0, rig.leftLeg.position.y, 0); rig.body.localToWorld(hip); mount.worldToLocal(hip);
      assert(Math.abs(hip.y - mountSeat(id).seatY - mountBob(time, moving, upgraded, id)) < 1e-6, `${race.id}/${gender.id} sits on the actual saddle`);
      assert(Math.abs(hip.z - mountSeat(id).seatZ) < 1e-6, 'the hips remain centered along the saddle');
      assert(rig.classGear.every(gear => !gear.visible)); assert(!rig.pickaxe.visible && !rig.axe.visible);
      const reins = mount.getObjectByName('rider-reins'); assert(reins.visible);
      for (const [side, arm] of [rig.leftArm, rig.rightArm].entries()) {
        const hand = new THREE.Vector3(0, -.625, .04); arm.localToWorld(hand); mount.worldToLocal(hand);
        assert(hand.distanceTo(new THREE.Vector3().fromBufferAttribute(reins.geometry.attributes.position, side * 4)) < 1e-6, 'reins start inside the actual palm for every race');
      }
    }
    animateCharacter(rider, 0, false); assert.deepEqual(signature(rider), rest, 'dismount restores gear and the complete normal pose');
    animateCharacter(rider, .13, true); const walk = signature(rider), walkArm = rig.leftArm.rotation.x;
    animateCharacter(rider, .13, true, false, undefined, false, { sprinting: true }); finite(rider);
    assert.notDeepEqual(signature(rider), walk, 'sprinting has its own gait'); assert(rig.body.rotation.x > .2); assert(Math.abs(rig.leftArm.rotation.x - walkArm) > .1);
    for (const velocity of [8.5, 0, -5]) {
      const jump = { grounded: false, velocity };
      animateCharacter(rider, .13, true, false, undefined, false, { jump }); finite(rider);
      assert.notDeepEqual(signature(rider), walk, 'airborne legs use a jump pose');
      assert.equal(rig.body.position.y, 0, 'jump altitude is owned by the world root');
      animateCharacter(rider, .13, true, false, undefined, false, { mount:id, jump });
      animateMount(mount, .13, true, false, rider, jump); finite(mount);
      const hip = new THREE.Vector3(0, rig.leftLeg.position.y, 0);rig.body.localToWorld(hip);mount.worldToLocal(hip);
      assert(Math.abs(hip.y-mountSeat(id).seatY-mountBob(.13,true,false,id,true))<1e-6, 'rider stays in the saddle throughout a jump');
      assert(mount.getObjectByName(`${id}-front-left-knee`).rotation.x>.7, 'mount tucks its legs in flight');
    }
    animateCharacter(rider, .13, true, false, undefined, true); const normalSwim = signature(rider);
    animateCharacter(rider, .13, true, false, undefined, true, { sprinting: true }); finite(rider);
    assert.notDeepEqual(signature(rider), normalSwim, 'water sprint accelerates swimming strokes');
    assert(rig.body.rotation.x > 1, 'water sprint keeps the swimming posture');
    animateCharacter(rider, .13, true, false, undefined, true, { sprinting: true, exhausted: true });
    assert.deepEqual(signature(rider), normalSwim, 'exhaustion restores normal swimming strokes');
    animateCharacter(rider, .13, false, false, undefined, false, { exhausted: true }); finite(rider); assert(rig.body.rotation.x > .1, 'exhaustion has a recovery breathing pose');
    for (const [moving, attacking, gathering, swimming] of [[false, { ability: 'fireball', progress: .3 }, undefined, false], [false, false, 'mining', false], [true, false, undefined, true]]) {
      animateCharacter(rider, .13, moving, attacking, gathering, swimming); const action = signature(rider);
      animateCharacter(rider, .13, moving, attacking, gathering, swimming, { sprinting: true, exhausted: true }); assert.deepEqual(signature(rider), action, 'combat, gathering and swimming retain their existing poses');
    }
    animateCharacter(rider, 0, false); assert.deepEqual(signature(rider), rest, 'sprint and fatigue restore the exact rest pose');
  }
  animateMount(mount, .32, false); const idle = signature(mount);
  animateMount(mount, .32, true); assert.notDeepEqual(signature(mount), idle, 'gallop moves authored joints');
  animateMount(mount, .32, false); assert.deepEqual(signature(mount), idle, 'stopping resets the mount gait');
  assert.deepEqual(signature(source), originals, 'runtime poses never mutate the shared source');
  let spiritsDisposed = false;
  if (id === 'verdant-revenant') {
    assert(mounts.getObjectByName(`mount-${id}`).position.y === 0, 'authored source remains at origin');
    for (let time = 0; time < 12; time += .2) assert(mountBob(time, true, false, id) > .7, 'spirit dragon levitates continuously, including while moving');
    const feet = ['front-left', 'front-right', 'rear-left', 'rear-right'].map(name => mount.getObjectByName(`verdant-revenant-${name}-knee`));
    const footHeights = () => feet.map(foot => {
      let bottom = Infinity;
      foot.traverse(node => { if (node.isMesh) {
        const vertices = node.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) bottom = Math.min(bottom, node.localToWorld(new THREE.Vector3().fromBufferAttribute(vertices, i)).y);
      } });
      return bottom;
    });
    for (const time of [0, .8, 1.6, 2.4, 3.2, 4]) {
      animateMount(mount, time, false); mount.updateMatrixWorld(true); const hanging = footHeights();
      animateMount(mount, time, true); mount.updateMatrixWorld(true);
      footHeights().forEach((height, index) => assert(height > hanging[index] + .3, 'every foot folds visibly higher during glide'));
    }
    let flame;
    mount.getObjectByName('verdant-revenant-mane').traverse(node => { if (node.isMesh) {
      const uv = node.geometry.getAttribute('uv');
      assert(uv && uv.count === node.geometry.getAttribute('position').count, 'export preserves flame-flow UVs');
      assert(Math.max(...uv.array) > .99 && Math.min(...uv.array) < .01, 'flame UVs span the entire tongue');
      flame = node.material;
      assert(flame.isShaderMaterial);
      assert.notEqual(flame, twin.getObjectByName(node.name).material, 'each mane owns its animation clock');
    } });
    animateMount(mount, 3.5, false); assert.equal(flame.uniforms.time.value, 3.5);
    const skins = []; mount.traverse(node => { if (node.isSkinnedMesh) skins.push(node); });
    assert(skins.length > 0, 'tail uses weighted skinning, not rigid chunks');
    const skin = skins[0], twinSkin = twin.getObjectByName(skin.name);
    assert.equal(skin.skeleton.bones.length, 14);
    assert.notEqual(skin.skeleton, twinSkin.skeleton, 'each dragon owns its tail skeleton');
    assert.notEqual(skin.skeleton.bones[0], twinSkin.skeleton.bones[0]);
    const tailBase = mount.getObjectByName('verdant-revenant-tail'), tailTip = mount.getObjectByName('verdant-revenant-tail-flow-13');
    const tipSweep = [];
    for (let time = 0; time < 20; time += .2) {
      animateMount(mount, time, true); mount.updateMatrixWorld(true);
      const base = tailBase.getWorldPosition(new THREE.Vector3()), tip = tailTip.getWorldPosition(new THREE.Vector3());
      assert(tip.y < base.y, 'flowing tail trails downward instead of coiling upright');
      assert(tip.y > mount.position.y, 'tail remains above the ground throughout its wave');
      tipSweep.push(mount.worldToLocal(tip).x);
    }
    assert(Math.max(...tipSweep) - Math.min(...tipSweep) > 1.8, 'tail tip slithers visibly from side to side');
    const penultimate = mount.getObjectByName('verdant-revenant-tail-flow-12');
    for (const moving of [false, true]) {
      const bends = [];
      for (let time = 0; time < 20; time += .2) {
        animateMount(mount, time, moving); mount.updateMatrixWorld(true);
        const tip = mount.worldToLocal(tailTip.getWorldPosition(new THREE.Vector3()));
        const incoming = tip.clone().sub(mount.worldToLocal(penultimate.getWorldPosition(new THREE.Vector3()))).setY(0).normalize();
        // Bones point along local +Y: compare the actual final tangent with its incoming segment.
        const outgoing = mount.worldToLocal(tailTip.localToWorld(new THREE.Vector3(0, 1, 0))).sub(tip).setY(0).normalize();
        bends.push(Math.atan2(incoming.z * outgoing.x - incoming.x * outgoing.z, incoming.dot(outgoing)));
      }
      assert(Math.min(...bends) < -.15 && Math.max(...bends) > .15, `tail end curls visibly both left and right while ${moving ? 'gliding' : 'idle'}, independent of whole-tail sway`);
    }
    const samples = () => { mount.updateMatrixWorld(true); return Array.from({ length: 64 }, (_, i) => {
      const index = Math.floor(i * (skin.geometry.attributes.position.count - 1) / 63);
      return skin.applyBoneTransform(index, new THREE.Vector3().fromBufferAttribute(skin.geometry.attributes.position, index));
    }); };
    animateMount(mount, 0, false); const curl = samples();
    animateMount(mount, 1.6, false); const wave = samples();
    assert(Math.max(...wave.map((point, i) => point.distanceTo(curl[i]))) > .35, 'a visible continuous wave deforms the tail itself');
    const motes = mount.getObjectByName('verdant-spirit-motes'), positions = motes.geometry.attributes.position;
    const first = [...positions.array];
    animateMount(mount, 2, true); assert.notDeepEqual([...positions.array], first, 'jade particles move with the mount');
    const sampled = [...positions.array]; animateMount(mount, 2, true);
    assert.deepEqual([...positions.array], sampled, 'resampling particles never accumulates motion');
    assert([...positions.array].every(Number.isFinite));
    animateMount(mount, 2, true, false, undefined, undefined, 'low'); assert.equal(motes.geometry.drawRange.count, 36);
    animateMount(mount, 2, true, false, undefined, undefined, 'off'); assert(!motes.visible);
    animateMount(mount, 2, true); assert(motes.visible); assert.equal(motes.geometry.drawRange.count, 108);
    animateMount(mount, 2, true, false, undefined, undefined, 'high', false);
    assert([...motes.geometry.attributes.life.array.slice(0, 12)].every(value => value === 0), 'bloom off disables the broad halos');
    motes.geometry.addEventListener('dispose', () => { spiritsDisposed = true; });
  }
  let ownDisposed = false, sharedDisposed = false;
  mount.getObjectByName('rider-reins').geometry.addEventListener('dispose', () => { ownDisposed = true; }); mesh.geometry.addEventListener('dispose', () => { sharedDisposed = true; });
  disposeMount(mount); assert(ownDisposed); assert(!sharedDisposed); disposeMount(twin);
  if (id === 'verdant-revenant') assert(spiritsDisposed, 'per-mount particle buffers are released');
}
console.log(`PASS: ${poses} base/store mount rider poses across every race, gender and class; saddle alignment, palm-held reins, shared assets, sprint/fatigue reset and action precedence.`);
