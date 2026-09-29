import assert from 'node:assert/strict';
import { CITY_LAYOUTS } from '../src/city.ts';
import { TRAINING_DUMMIES, TRAINING_DUMMY_HP, TRAINING_DUMMY_RESET_MS } from '../src/training-dummies.ts';
import { OVERWORLD_SPAWNS, WORLD_COLLIDERS, WORLD_BOUNDS, canTraverse, overworldSpawnAllowed } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { surfaceAt } from '../src/landscape.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { TRAINING_PROPS, TRAINING_PRACTICE } from '../src/training-grounds-data.ts';
import { rollMonsterLoot } from '../src/loot-items.ts';

assert.equal(TRAINING_DUMMY_HP, 100_000);
assert.equal(TRAINING_DUMMY_RESET_MS, 10_000);
assert.deepEqual(rollMonsterLoot('training-dummy', 60, {}, () => 0, { worldBoss: false, instanceId: null }), [], 'training can never award loot, including random equipment');
assert.equal(TRAINING_DUMMIES.length, CITY_LAYOUTS.length);
assert.equal(new Set(OVERWORLD_SPAWNS.map(spawn => spawn.id)).size, OVERWORLD_SPAWNS.length);
for (const city of CITY_LAYOUTS) {
  const dummies = TRAINING_DUMMIES.filter(dummy => dummy.zone === city.zone);
  assert.equal(dummies.length, 1, `${city.name} has exactly one attackable dummy`);
  const dummy = dummies[0];
  assert(OVERWORLD_SPAWNS.includes(dummy), `${city.name} dummy is in the actual server spawn catalog`);
  assert(overworldSpawnAllowed(dummy, city.zone));
  assert(!overworldSpawnAllowed({ ...dummy, id: 'unrecognized-spawn' }, city.zone), 'ordinary encounters cannot use the training exception');
  assert(!overworldSpawnAllowed({ ...dummy, x: dummy.x + 1 }, city.zone), 'the exception is limited to the authored home');
  assert.equal(surfaceAt(dummy.x, dummy.z).water, false);
  assert(Math.min(...TRAINER_NPCS.filter(npc => npc.zone === city.zone).map(npc => Math.hypot(dummy.x - npc.x, dummy.z - npc.z))) < 15);
  for (const [dx, dz] of [[0, 2], [2, 0], [-2, 0], [0, -2]]) {
    const approach = { x: dummy.x + dx, z: dummy.z + dz };
    assert(canTraverse(approach, dummy), `${city.name} melee attacks have clear sight`);
    const route = findPath(city, approach, WORLD_COLLIDERS, WORLD_BOUNDS);
    assert(route.length, `${city.name} practice space is reachable from the square`);
    let previous = city;
    for (const step of route) { assert(canTraverse(previous, step)); previous = step; }
    assert(Math.hypot(previous.x - approach.x, previous.z - approach.z) < .01);
  }
  assert([[8, 0], [-8, 0], [0, 8], [0, -8]].some(([dx, dz]) => canTraverse({ x: dummy.x + dx, z: dummy.z + dz }, dummy)), `${city.name} has a ranged casting approach`);
  for (const prop of [...TRAINING_PROPS, ...TRAINING_PRACTICE]) assert(Math.hypot(dummy.x - prop.x, dummy.z - prop.z) > 3, 'existing practice actors and props remain clear');
}
console.log('Training dummy placement: all six cities, dry reachable approaches, melee/ranged sight, unique authoritative spawns.');
