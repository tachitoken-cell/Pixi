import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AUTO_ATTACKS, AUTO_ATTACK_ANIMATION_MS, autoAttackTiming, autoAttackDamage } from '../src/auto-attacks.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { makeCharacter, animateCharacter, setCharacterRaces, setCharacterCustomization, setCharacterGear, setCharacterClericAssets } from '../src/characters.ts';
import { createCombatEffects } from '../src/combat-effects.ts';
import { RACES, GENDERS, DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { GEAR, GEAR_SETS, starterGear, equipmentSlotFor } from '../src/progression.ts';

const classes = ['Ranger', 'Knight', 'Mage', 'Cleric'];
assert.deepEqual(Object.keys(AUTO_ATTACKS), classes);
assert.equal(AUTO_ATTACK_ANIMATION_MS, 700);
for (const className of classes) {
  const attack = AUTO_ATTACKS[className];
  assert.equal(attack.damageScale, .55);
  assert.equal(autoAttackDamage(className, { primaryDamage: 20 }), 11);
  assert.equal(autoAttackDamage(className, { primaryDamage: 0 }), 1);
  assert(autoAttackDamage(className, { primaryDamage: 100 }) > autoAttackDamage(className, { primaryDamage: 20 }), 'equipment improves basic attacks');
  let previous = 0;
  for (const distance of [0, 1, 3, attack.range]) {
    const timing = autoAttackTiming(className, distance), impact = (timing.delay + timing.flight) * 1000;
    assert(impact >= previous && impact < attack.cooldownMs, 'impact precedes the next swing and never gets earlier with distance');
    previous = impact;
    if (attack.visual === 'melee') assert.deepEqual(timing, { delay: .3, flight: 0 }, 'melee weapon contact is 300ms');
    else assert.deepEqual(timing, combatTiming(attack.ability, distance), 'ranged basics use the same travel contract as their visual');
  }
  assert.deepEqual(autoAttackTiming(className, NaN), autoAttackTiming(className, 0));
}

const resources = new Map();
for (const [name, install] of [['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear], ['cleric-kit', setCharacterClericAssets]]) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  const scene = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  scene.traverse(node => { if (node.isMesh) resources.set(node.geometry, node.geometry.attributes.position.array.slice()); });
  install(scene);
}

function partCenter(root, part) {
  let result;
  root.traverse(node => {
    const index = node.userData.namedParts?.[part];
    if (node.isInstancedMesh && Number.isInteger(index)) {
      const matrix = new THREE.Matrix4(); node.getMatrixAt(index, matrix);
      result = new THREE.Vector3().setFromMatrixPosition(matrix.premultiply(node.matrixWorld));
    } else if (node.isMesh && node.userData.role === part) {
      node.geometry.computeBoundingBox();
      result = node.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(node.matrixWorld);
    }
  });
  assert(result, `${part} exists on the actual equipped model`); return result;
}
function assertHeadClear(character, weapon, label) {
  const cranium = character.getObjectByName(`${character.userData.raceModel}-head-cranium`);
  cranium.geometry.computeBoundingBox();
  const core = cranium.geometry.boundingBox.clone().expandByScalar(-.05), inverse = cranium.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4(), instance = new THREE.Matrix4(), point = new THREE.Vector3();
  weapon.traverseVisible(node => {
    if (!node.isMesh) return;
    const positions = node.geometry.attributes.position;
    for (let i = 0; i < (node.isInstancedMesh ? node.count : 1); i++) {
      matrix.multiplyMatrices(inverse, node.matrixWorld);
      if (node.isInstancedMesh) { node.getMatrixAt(i, instance); if (Math.abs(instance.determinant()) < 1e-12) continue; matrix.multiply(instance); }
      for (let vertex = 0; vertex < positions.count; vertex++) {
        point.fromBufferAttribute(positions, vertex).applyMatrix4(matrix);
        assert(!core.containsPoint(point), `${label}: ${weapon.name} geometry stays outside the face`);
      }
    }
  });
}
const hands = { bow: 'left-hand', sword: 'right-hand', staff: 'right-hand', mace: 'right-hand', shield: 'left-hand', tome: 'left-hand' };
const fractions = [...new Set([0, .001, .04, .08, .12, .18 / .7, .26, .3 / .7, .5, .64, .8, .95, 1])];
let poses = 0, models = 0;
for (const race of RACES) for (const gender of GENDERS) for (const className of classes) for (const upgraded of [false, true]) {
  const equipment = { ...starterGear(className).equipment };
  if (upgraded) {
    const set = GEAR_SETS.filter(set => set.className === className).at(-1);
    for (const item of Object.values(GEAR).filter(item => item.setId === set.id)) equipment[equipmentSlotFor(equipment, item.id)] = item.id;
  }
  const character = makeCharacter({ ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id, className }, equipment), rig = character.userData.rig;
  character.position.set(7, 3, -12); character.rotation.y = .41; character.scale.setScalar(1.1);
  const objects = []; character.traverse(node => objects.push(node));
  const joints = [rig.head, rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg].map(part => [part, part.position.clone()]);
  const held = Object.entries(hands).flatMap(([name, hand]) => { const weapon = character.getObjectByName(name); return weapon ? [{ weapon, hand: character.getObjectByName(hand) }] : []; });
  models++;
  for (const progress of fractions) for (const mode of ['still', 'walk', 'swim']) {
    const label = `${race.id}/${gender.id}/${className}/${upgraded}/${mode}/${progress}`;
    animateCharacter(character, .37, mode === 'walk', { ability: AUTO_ATTACKS[className].ability, progress, basic: true }, undefined, mode === 'swim');
    character.updateMatrixWorld(true); poses++;
    const after = []; character.traverse(node => { after.push(node); assert(node.matrixWorld.elements.every(Number.isFinite), `${label}: finite pose`); });
    assert.deepEqual(after, objects, 'basic attacks reuse the rig without allocating scene objects');
    assert.deepEqual(character.position.toArray(), [7, 3, -12]); assert.equal(character.rotation.y, .41); assert.deepEqual(character.scale.toArray(), [1.1, 1.1, 1.1]);
    for (const [part, position] of joints) { assert(part.position.distanceTo(position) < 1e-6, 'authored joints stay attached'); assert.deepEqual(part.scale.toArray(), [1, 1, 1]); }
    for (const { weapon, hand } of held) {
      assert(partCenter(weapon, 'weapon-grip').distanceTo(hand.getWorldPosition(new THREE.Vector3())) < 1e-5, `${label}: ${weapon.name} remains palm-centered`);
      if (weapon.visible) assert(weapon.getWorldQuaternion(new THREE.Quaternion()).angleTo(hand.getWorldQuaternion(new THREE.Quaternion())) < 1e-6, `${label}: the wrist follows ${weapon.name} rotation as well as position`);
      assertHeadClear(character, weapon, label);
    }
  }
  animateCharacter(character, .37, false); const rest = rig.weapon.quaternion.clone();
  animateCharacter(character, .37, false, { ability: AUTO_ATTACKS[className].ability, progress: .3 / .7, basic: true });
  const basic = [rig.leftArm, rig.rightArm].map(arm => arm.quaternion.clone());
  if (className === 'Mage' || className === 'Cleric') {
    animateCharacter(character, .37, false, { ability: AUTO_ATTACKS[className].ability, progress: .3 / .7 });
    assert([rig.leftArm, rig.rightArm].some((arm, index) => basic[index].angleTo(arm.quaternion) > .05), 'weapon basics differ visibly from learned casting gestures');
  }
  animateCharacter(character, .37, false);
  assert(rig.weapon.quaternion.angleTo(rest) < 1e-6, 'weapon grip rotation resets after the basic attack');
}
for (const [geometry, original] of resources) assert.deepEqual(geometry.attributes.position.array, original, 'basic animation preserves shared Blender geometry');

const scene = new THREE.Scene(), unrelated = new THREE.Group(); scene.add(unrelated);
const effects = createCombatEffects(scene), matrix = new THREE.Matrix4(), point = new THREE.Vector3();
const batch = () => scene.getObjectByName('combat-effects');
for (const className of classes) for (const distance of [1, AUTO_ATTACKS[className].range]) {
  const attack = AUTO_ATTACKS[className], timing = autoAttackTiming(className, distance), arrival = 10 + timing.delay + timing.flight;
  effects.play({ ability: attack.ability, basic: true, from: { x: 0, z: 0 }, targets: [{ id: 'target', x: 0, z: distance }], rotation: 0 }, 10);
  effects.update(10 + timing.delay - .000001);
  assert.equal(batch().count, 0, `${className} has no effect before weapon launch/contact`);
  if (attack.visual === 'projectile') {
    effects.update(arrival - .000001); assert(batch().count > 0, 'ranged basic is visibly airborne before damage');
    batch().getMatrixAt(0, matrix); point.setFromMatrixPosition(matrix);
    assert(point.distanceTo(new THREE.Vector3(0, .75, distance)) < .002, 'projectile reaches accepted target at shared impact time');
  }
  effects.update(arrival + .00000001); assert(batch().count > 0, 'impact appears exactly at shared damage time');
  batch().getMatrixAt(0, matrix); point.setFromMatrixPosition(matrix);
  assert(point.distanceTo(new THREE.Vector3(0, .75, distance)) < .002, 'impact is located on the target');
  effects.update(arrival + 1); assert.equal(batch().count, 0, 'basic impact expires');
  const owned = [batch(), batch().geometry, batch().material], disposed = owned.map(() => 0);
  owned.forEach((resource, i) => resource.addEventListener('dispose', () => disposed[i]++));
  effects.clear(); effects.clear(); assert.deepEqual(disposed, [1, 1, 1]); assert.deepEqual(scene.children, [unrelated]);
}
console.log(`PASS: four basic-attack timing/damage contracts, ${models} equipped race models, ${poses} palm-centered finite poses, face clearance, shared-buffer preservation and exact-impact VFX teardown.`);
