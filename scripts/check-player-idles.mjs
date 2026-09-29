import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeCharacter, animateCharacter, setCharacterRaces, setCharacterCustomization, setCharacterGear, setDeathAnimations } from '../src/characters.ts';
import { setIdleAnimations, applyIdleAnimation } from '../src/idle-animation.ts';
import { DEFAULT_APPEARANCE, RACES, GENDERS } from '../src/appearance.ts';
import { setMountAssets } from '../src/mounts.ts';

async function load(name) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
for (const [name, install] of [['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear], ['death-animations', setDeathAnimations], ['mounts', scene => setMountAssets(scene)]]) {
  const asset = await load(name); install(asset.scene, asset.animations);
}
const pose = root => { const result = []; root.traverse(node => result.push([node.name, ...node.position, ...node.quaternion, ...node.scale, node.visible])); return result; };
const samePose = (a, b, message) => assert(a.length === b.length && a.every((row, i) => row.every((v, j) => typeof v === 'number' ? Math.abs(v - b[i][j]) < 1e-6 : v === b[i][j])), message);
const states = [
  [true], [true, false, undefined, false, { sprinting: true }], [false, false, undefined, false, { exhausted: true }],
  [false, false, 'mining'], [false, false, 'woodcutting'], [false, false, 'herbalism'],
  [true, false, undefined, true], [false, false, undefined, true],
  [false, { ability: 'fireball', progress: .3 }], [false, { ability: 'arrow', progress: .26 }],
  [false, false, undefined, false, { jump: { grounded: false, velocity: 8 } }],
  [true, false, undefined, false, { mount: 'horse' }],
  [false, false, undefined, false, undefined, .5], [false, false, undefined, false, undefined, 1],
];
const builds = [];
for (const race of RACES) for (const gender of GENDERS) for (const className of ['Ranger', 'Knight', 'Mage']) {
  const appearance = { ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id, className }, root = makeCharacter(appearance);
  builds.push({ appearance, root, active: states.map(state => { animateCharacter(root, 4, ...state); return pose(root); }) });
}
const asset = await load('idle-animations');
assert.equal(asset.animations.length, 30, 'one authored clip for every supported actor kind');
assert.throws(() => setIdleAnimations(asset.scene, []), /Missing idle animation/);
setIdleAnimations(asset.scene, asset.animations);
const bad = asset.animations.map(clip => clip.clone()); bad[0].tracks[0].values[0] = NaN;
assert.throws(() => setIdleAnimations(asset.scene, bad), /Invalid idle values/);
const duration = asset.animations.find(clip => clip.name === 'player-idle').duration;
for (const { appearance, root, active } of builds) {
  const label = `${appearance.race}/${appearance.gender}/${appearance.className}`, rig = root.userData.rig;
  const dimensions = Object.values(rig.idleParts).filter(Boolean).map(part => [part, part.position.clone(), part.scale.clone()]);
  const rendered = () => { root.updateMatrixWorld(true); const values = []; root.traverseVisible(node => { if (node.isMesh) values.push(...node.matrixWorld.elements); }); return values; };
  root.position.set(8, 3, -4); root.rotation.y = .82; const placed = [root.position.toArray(), root.quaternion.toArray()];
  const samples = new Set();
  for (let frame = 0; frame <= 60; frame++) {
    animateCharacter(root, frame * duration / 30, false); const values = rendered();
    assert(values.every(Number.isFinite), `${label}: finite poses`); samples.add(JSON.stringify(values));
    assert.deepEqual([root.position.toArray(), root.quaternion.toArray()], placed, `${label}: authoritative root stays fixed`);
    for (const [part, position, scale] of dimensions) {
      assert(part.scale.equals(scale), `${label}: idle never rescales race anatomy`);
      if (part !== rig.body) assert(part.position.equals(position), `${label}: joints keep authored offsets`);
    }
  }
  assert(samples.size > 10, `${label}: visible idle motion`);
  animateCharacter(root, 2 * duration + .2, false); const stable = pose(root);
  for (let n = 0; n < 10; n++) animateCharacter(root, 2 * duration + .2, false);
  samePose(pose(root), stable, `${label}: repeated frames never accumulate`);
  animateCharacter(root, 3 * duration + .2, false); samePose(pose(root), stable, `${label}: seamless repeating joint motion`);
  const twin = makeCharacter(appearance); animateCharacter(twin, 3 * duration + .2, false);
  assert.notDeepEqual(pose(root).slice(1), pose(twin).slice(1), `${label}: actors idle independently`);
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  states.forEach((state, index) => {
    animateCharacter(root, 3, false); animateCharacter(root, 4, ...state);
    samePose(pose(root), active[index], `${label}: active state ${index} completely overrides idle`);
  });
  // Existing eye instances still blink while the authored skeleton idles.
  animateCharacter(root, rig.eyes.period - rig.eyes.phase - .09, false); assert(rig.eyes.openness < .1, `${label}: eyes still blink`);
  animateCharacter(root, rig.eyes.period - rig.eyes.phase + .3, false); assert.equal(rig.eyes.openness, 1);
}
// Test the shared handoff directly: movement instantly disables idle; resuming fades from neutral.
const actor = new THREE.Group(), head = new THREE.Group(); actor.add(head);
applyIdleAnimation('player', actor, { head }, 1, false);
head.quaternion.identity(); applyIdleAnimation('player', actor, { head }, 2);
assert(head.quaternion.equals(new THREE.Quaternion()), 'first idle frame after activity starts at zero influence');
head.quaternion.identity(); applyIdleAnimation('player', actor, { head }, 2.5); assert(!head.quaternion.equals(new THREE.Quaternion()), 'idle fades back in');
const held = head.quaternion.clone(); applyIdleAnimation('player', actor, { head }, 2.6, false); assert(head.quaternion.equals(held), 'disabled helper cannot alter the active pose');
console.log(`PASS all ${builds.length} player builds: authored looping independent idles, unchanged race proportions and active poses, working blinks, no accumulated transforms, validated assets, and idle fade-in.`);
