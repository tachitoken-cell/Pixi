import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeCharacter, animateCharacter, setCharacterRaces, setCharacterCustomization, setCharacterGear, setCharacterClericAssets, setDeathAnimations } from '../src/characters.ts';
import { setIdleAnimations } from '../src/idle-animation.ts';
import { DEFAULT_APPEARANCE, RACES, GENDERS } from '../src/appearance.ts';
import { EMOTES } from '../src/emotes.ts';
import { setMountAssets } from '../src/mounts.ts';

for (const [name, install] of [['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear], ['cleric-kit', setCharacterClericAssets], ['death-animations', setDeathAnimations], ['idle-animations', setIdleAnimations], ['mounts', scene => setMountAssets(scene)]]) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  install(asset.scene, asset.animations);
}
const pose = root => {
  const values = [];
  root.traverse(node => values.push(node.name, ...node.position, ...node.quaternion, ...node.scale, node.visible));
  if (root.userData.rig.bow) values.push(...root.userData.rig.bow.batch.instanceMatrix.array);
  return values;
};
const same = (a, b, label) => assert(a.length === b.length && a.every((v, i) => typeof v === 'number' ? Math.abs(v - b[i]) < 1e-6 : v === b[i]), label);
const play = (root, id, elapsed = .73, time = 4) => animateCharacter(root, time, false, false, undefined, false, undefined, undefined, { id, elapsed });
const rotationSignature = root => Object.values(root.userData.rig.idleParts).filter(Boolean).flatMap(part => part.quaternion.toArray()).map(n => +n.toFixed(5));
const states = [
  [true], [true, false, undefined, false, { sprinting: true }],
  [false, false, 'mining'], [false, false, 'woodcutting'], [false, false, 'herbalism'],
  [true, false, undefined, true], [false, false, undefined, true],
  [false, { ability: 'arrow', progress: .26 }], [false, true],
  [false, false, undefined, false, { seated: true }],
  [false, false, undefined, false, { jump: { grounded: false, velocity: 8 } }],
  [false, false, undefined, false, { mount: 'horse' }], [true, false, undefined, false, { mount: 'wolf' }],
  [false, false, undefined, false, undefined, .5], [false, false, undefined, false, undefined, 1],
];
const raceDances = new Map();
let builds = 0;
for (const race of RACES) for (const gender of GENDERS) for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  const root = makeCharacter({ ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id, className });
  const rig = root.userData.rig, label = `${race.id}/${gender.id}/${className}`;
  root.position.set(8, 3, -4); root.rotation.y = .82;
  const world = [...root.position, ...root.quaternion, ...root.scale];
  const anatomy = Object.values(rig.idleParts).filter(Boolean).map(part => [part, part.position.clone(), part.scale.clone()]);
  for (const [id, { duration }] of Object.entries(EMOTES)) {
    const frames = new Set();
    for (let frame = 1; frame <= 12; frame++) {
      const elapsed = frame / 13 * (duration === null ? 4 : duration / 1000);
      play(root, id, elapsed); root.updateMatrixWorld(true);
      root.traverseVisible(node => assert(node.matrixWorld.elements.every(Number.isFinite), `${label}/${id}: finite rendered matrices`));
      same([...root.position, ...root.quaternion, ...root.scale], world, `${label}/${id}: authoritative world transform is unchanged`);
      for (const [part, position, scale] of anatomy) {
        assert(part.scale.equals(scale), `${label}/${id}: preserves anatomy scale`);
        if (part !== rig.body) assert(part.position.equals(position), `${label}/${id}: preserves authored joint offsets`);
      }
      assert(rig.classGear.every(gear => !gear.visible) && !rig.pickaxe.visible && !rig.axe.visible, `${label}/${id}: hands are free`);
      frames.add(JSON.stringify(rotationSignature(root)));
    }
    assert(frames.size >= 4, `${label}/${id}: visible animation over its duration`);
    play(root, id); const stable = pose(root);
    for (let frame = 0; frame < 3; frame++) play(root, id);
    same(pose(root), stable, `${label}/${id}: repeated frames never accumulate`);
    play(root, id, .73, 900); same(pose(root), stable, `${label}/${id}: synchronized emote time is independent of scene uptime`);
    play(root, 'cry'); play(root, id); same(pose(root), stable, `${label}/${id}: switching gestures removes previous pose`);
  }
  play(root, 'dance'); const dance = rotationSignature(root);
  if (!raceDances.has(race.id)) raceDances.set(race.id, dance);
  same(dance, raceDances.get(race.id), `${label}: race choreography is shared across gender and class`);
  play(root, 'dance', 4.73); same(rotationSignature(root), dance, `${label}: dance loop closes after four seconds`);
  animateCharacter(root, 4, false, false, undefined, false, { exhausted: true }, undefined, { id: 'dance', elapsed: .73 });
  same(rotationSignature(root), dance, `${label}: standing exhaustion does not swallow a valid gesture`);
  for (const state of states) {
    animateCharacter(root, 4, true);
    animateCharacter(root, 4, ...state); const expected = pose(root);
    play(root, 'dance');
    const padded = [...state]; while (padded.length < 6) padded.push(undefined);
    animateCharacter(root, 4, ...padded, { id: 'dance', elapsed: .73 });
    same(pose(root), expected, `${label}: activity ${JSON.stringify(state)} overrides dance and restores gear`);
  }
  animateCharacter(root, 4, true); animateCharacter(root, 5, false); const neutral = pose(root);
  play(root, 'dance'); animateCharacter(root, 5, false);
  same(pose(root), neutral, `${label}: stopping restores the neutral anatomy and equipment before idle fades in`);
  for (const emote of [{ id: 'dance', elapsed: NaN }, { id: 'dance', elapsed: Infinity }, { id: 'dance', elapsed: -1 }, { id: 'unknown', elapsed: 1 }, { id: 'laugh', elapsed: EMOTES.laugh.duration / 1000 }]) {
    play(root, 'dance'); animateCharacter(root, 5, false, false, undefined, false, undefined, undefined, emote);
    same(pose(root), neutral, `${label}: invalid or finished gesture returns to idle`);
  }
  builds++;
}
assert.equal(new Set([...raceDances.values()].map(value => JSON.stringify(value))).size, RACES.length, 'all nine races have distinct dance choreography');
console.log(`PASS ${builds} real GLTF builds: nine distinct looping race dances, eight animated gestures, unchanged anatomy/world transforms, synchronization, action priority, gear restoration and idle handoff.`);
