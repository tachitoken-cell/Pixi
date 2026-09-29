import assert from 'node:assert/strict';
import * as THREE from 'three';
import { graphics } from '../src/graphics-settings.ts';
import { createAmbientEffects } from '../src/ambient-effects.ts';
import { createCombatEffects } from '../src/combat-effects.ts';
import { combatTiming, RADIAL_SWEEPS } from '../src/combat-timing.ts';
import { SPELLS } from '../src/spells.ts';

graphics.effects = 'high'; // Compare explicit quality levels independently of device startup defaults.
const scene = new THREE.Scene(), ambient = createAmbientEffects(scene);
const view = { position: new THREE.Vector3(0, 0, 8), zone: 'frostmarch', dungeon: false,
  moving: false, sprinting: false, mounted: false, grounded: true, swimming: false, indoors: false, active: true };
const counts = () => ambient.root.children.map(mesh => mesh.count);
ambient.update(4, view);
const highAmbient = counts();
graphics.effects = 'low'; ambient.update(4, view);
assert(counts()[0] > 0 && counts()[0] < highAmbient[0]);
assert(counts()[1] > 0 && counts()[1] < highAmbient[1] / 2, 'Low reduces weather particle work');
for (const [quality, budget] of [['high', 96], ['low', 24]]) {
  graphics.effects = quality;
  for (let i = 0; i < 180; i++) ambient.update(5 + i * .004, { ...view, grounded: i % 2 === 0 });
  assert.equal(counts()[2], budget, `${quality} caps the footstep dust pool`);
}
graphics.effects = 'off';
ambient.update(6, { ...view, position: { toArray() { throw Error('Off must skip particle/terrain work'); } } });
assert.equal(ambient.root.visible, false);
assert.deepEqual(counts(), [0, 0, 0], 'Off immediately clears every ambient pool');
graphics.effects = 'high'; ambient.update(4, view);
assert.equal(ambient.root.visible, true);
assert.deepEqual(counts(), highAmbient, 'High recovers without stale movement dust');
ambient.dispose();

const combat = createCombatEffects(scene);
const batch = () => scene.getObjectByName('combat-effects');
const event = ability => ({ ability, from: { x: 0, z: 0 }, targets: [{ id: 'target', x: 0, z: 8 }] });
for (const spell of Object.values(SPELLS).filter(spell => spell.effect === 'damage' && spell.visual !== 'radial')) {
  graphics.effects = 'high'; combat.play(event(spell.id), 0);
  const timing = combatTiming(spell.id, 8), midway = timing.delay + timing.flight / 2;
  combat.update(midway);
  const high = batch().count, core = [...batch().instanceMatrix.array.slice(0, 16)];
  graphics.effects = 'low'; combat.update(midway);
  assert(batch().count <= high, `${spell.id} Low cannot add particles`);
  const low = batch().count;
  graphics.effects = 'off'; combat.update(midway);
  assert(batch().count > 0 && batch().count <= low, `${spell.id} retains its projectile at Off`);
  assert.deepEqual([...batch().instanceMatrix.array.slice(0, 16)], core, `${spell.id} keeps the same projectile trajectory`);
  if (spell.id === 'fireball') assert(batch().count < low && low < high, 'fireballs shed orbiting particles and trails at each lower quality');
  graphics.effects = 'high'; combat.update(midway);
  assert.equal(batch().count, high, `${spell.id} High recovers during flight`);
  graphics.effects = 'off'; combat.update(timing.delay + timing.flight + .1);
  assert(batch().count > 0, `${spell.id} keeps visible impact feedback`);
  if (spell.id === 'fireball') assert.equal(batch().count, 1, 'Off retains only the impact flash, with no debris');
  combat.clear();
}
graphics.effects = 'off';
for (const spell of Object.values(SPELLS).filter(spell => spell.visual === 'radial' || spell.effect !== 'damage')) {
  const timing = RADIAL_SWEEPS[spell.id];
  combat.play(event(spell.id), 0); combat.update(timing.delay + timing.duration / 2);
  assert(batch().count > 0, `${spell.id} keeps radial, healing and shield feedback at Off`);
  combat.clear();
}
graphics.effects = 'high';
console.log('PASS: quarter ambient/dust budgets, immediate Off cleanup, live High recovery, and all projectile/radial combat cues survive Off.');
