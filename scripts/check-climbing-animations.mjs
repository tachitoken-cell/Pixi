import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_APPEARANCE, RACES, GENDERS } from '../src/appearance.ts';
import { setClimbingAnimations } from '../src/climbing-animation.ts';

// Match the browser's extensionless imports in the existing character modules.
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { makeCharacter, animateCharacter, setCharacterRaces, setCharacterCustomization, setCharacterGear, setCharacterClericAssets, setDeathAnimations } = await import('../src/characters.ts');
hook.deregister();
const load = async name => {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};
for (const [name, install] of [['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear], ['cleric-kit', setCharacterClericAssets], ['death-animations', setDeathAnimations]]) {
  const asset = await load(name); install(asset.scene, asset.animations);
}
const asset = await load('climbing-animations'), clip = asset.animations[0];
assert.deepEqual(asset.animations.map(clip => clip.name), ['player-climb']);
assert.equal(asset.scene.getObjectByName('player').userData.coverage.length, 72, 'all class/body references recorded by Blender');
assert(!asset.parser.json.meshes?.length && !asset.parser.json.images?.length, 'the new download contains motion only');
assert(statSync(new URL('../public/models/climbing-animations.glb', import.meta.url)).size < 100_000, 'small shared clip');
assert(statSync(new URL('../assets/source/climbing-animations.blend', import.meta.url)).size > 100_000, 'editable source retained');
assert.throws(() => setClimbingAnimations(asset.scene, []), /Missing climbing animation/);
const invalid = clip.clone(); invalid.tracks[0].values[0] = NaN;
assert.throws(() => setClimbingAnimations(asset.scene, [invalid]), /Invalid climbing values/);
setClimbingAnimations(asset.scene, asset.animations);
const pose = root => { const result = []; root.traverse(node => result.push([node.name, ...node.position, ...node.quaternion, ...node.scale, node.visible])); return result; };
const equalPose = (actual, expected, label) => assert(actual.length === expected.length && actual.every((row, i) => row.every((value, j) => typeof value === 'number' ? Math.abs(value - expected[i][j]) < 1e-5 : value === expected[i][j])), label);
let builds = 0;
for (const race of RACES) for (const gender of GENDERS) for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  const label = `${race.id}/${gender.id}/${className}`, root = makeCharacter({ ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id, className }), rig = root.userData.rig;
  root.position.set(9, 12, -4); root.rotation.y = .7;
  const placement = [root.position.toArray(), root.quaternion.toArray()];
  const dimensions = Object.values(rig.idleParts).filter(Boolean).map(part => [part, part.position.clone(), part.scale.clone()]);
  const climb = (time, moving = true) => animateCharacter(root, time, moving, false, undefined, false, { climbing: true, jump: { grounded: false, velocity: 3 } });
  const states = [[true], [false], [true, false, undefined, true], [false, false, 'mining'], [false, { ability: 'fireball', progress: .3 }], [false, false, undefined, false, { jump: { grounded: false, velocity: -3 } }], [false, false, undefined, false, undefined, .6]];
  const baseline = states.map(state => { animateCharacter(root, 4, ...state); return pose(root); });
  const samples = new Set();
  for (let frame = 0; frame <= 24; frame++) {
    climb(frame * clip.duration / 24); root.updateMatrixWorld(true);
    const values = []; root.traverseVisible(node => values.push(...node.matrixWorld.elements));
    assert(values.every(Number.isFinite), `${label}: finite geometry`); samples.add(JSON.stringify(values));
    assert.deepEqual([root.position.toArray(), root.quaternion.toArray()], placement, `${label}: world root remains authoritative`);
    for (const [part, position, scale] of dimensions) assert(part.position.equals(position) && part.scale.equals(scale), `${label}: anatomy unchanged`);
    assert(rig.classGear.every(gear => !gear.visible) && rig.grips.every(grip => !grip.held), `${label}: both hands free`);
  }
  assert(samples.size > 15, `${label}: visible motion throughout the loop`);
  climb(.17); const stable = pose(root);
  climb(.17 + clip.duration); equalPose(pose(root), stable, `${label}: seamless repeat`);
  for (let frame = 0; frame < 5; frame++) climb(.17);
  equalPose(pose(root), stable, `${label}: no accumulation`);
  climb(.2, false); const held = pose(root); climb(1.1, false); equalPose(pose(root), held, `${label}: stationary grip`);
  climb(clip.duration * .25); const left = rig.leftArm.rotation.x, right = rig.rightArm.rotation.x;
  climb(clip.duration * .75); assert((left - right) * (rig.leftArm.rotation.x - rig.rightArm.rotation.x) < 0, `${label}: alternating reaches`);
  states.forEach((state, index) => { climb(.2); animateCharacter(root, 4, ...state); equalPose(pose(root), baseline[index], `${label}: exit restores state ${index}`); });
  builds++;
}
console.log(`PASS climbing animation: ${builds} builds, Blender clip/source, anatomy and root preservation, alternating limbs, stationary hold, loop closure, freed hands and restored land/water/combat/death poses.`);
