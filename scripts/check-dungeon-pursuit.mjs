import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { dungeonBounds, dungeonColliders, dungeonLayout, inDungeonPreparation } from '../src/dungeon.ts';
import { canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { CHARGE_ATTACK } from '../src/bestiary.ts';
import { TERRAIN_STEP } from '../src/landscape.ts';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = name => server.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0];
const source = extract('moveEnemyToward');
const kind = 'veilhaven', colliders = dungeonColliders([], [], kind), bounds = dungeonBounds(kind);
const pillar = dungeonLayout(kind).walls.find(wall => wall.halfWidth <= 1 && wall.halfDepth <= 1);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let searches = 0;
// Clear elevated combat sightlines must never let ground navigation skip a cover detour.
const context = { distance, movementFrameStart: 0, canTraverse:()=>true, groundCanTraverse:canTraverse, inDungeonPreparation,
  instanceColliders: () => colliders, instanceBounds: () => bounds, dungeons: new Map([['run', { kind }]]),
  findPath: (...args) => { searches++; return findPath(...args); }, WORLD_COLLIDERS: colliders, WORLD_BOUNDS: bounds,
  insideCity: () => false, worldBossCombatAllowed: () => true, waterAt: () => false, movementCost: distance,
};
const move = runInNewContext(source + '\nmoveEnemyToward', context);
function pursue(enemy, goal, stoppingRange, steps = 60) {
  for (let i = 0; i < steps; i++) {
    const before = { x: enemy.x, z: enemy.z }, at = (enemy.movedAt || 0) + 100;
    context.movementFrameStart = at - 100;
    move(enemy, goal, at, 6, stoppingRange);
    assert(canTraverse(before, enemy, colliders, bounds), 'each authoritative step clears pillars and walls');
    assert(distance(before, enemy) <= .600001, 'detours preserve the 100 ms movement budget');
    const after = { x: enemy.x, z: enemy.z }, previousSearches = searches;
    move(enemy, goal, at, 6, stoppingRange);
    assert.equal(distance(after, enemy), 0, 'basic windup and ordinary pursuit cannot move twice at one timestamp');
    assert.equal(searches, previousSearches, 'a repeated movement call does not repeat pathfinding');
  }
}
for (const [dx, dz, offset, stop] of [[0, 1, 4, 2], [0, -1, 4, 2], [1, 0, 4, 2], [-1, 0, 4, 2], [0, 1, 2, 7]]) {
  const enemy = { x: pillar.x - dx * offset, z: pillar.z - dz * offset, instanceId: 'run', movedAt: 0 };
  const goal = { x: pillar.x + dx * offset, z: pillar.z + dz * offset };
  assert(canTraverse(enemy, enemy, colliders, bounds) && canTraverse(goal, goal, colliders, bounds));
  assert(!canTraverse(enemy, goal, colliders, bounds), 'the real level-50 pillar blocks the initial pursuit line');
  searches = 0; pursue(enemy, goal, stop);
  assert(canTraverse(enemy, goal, colliders, bounds), 'enemy navigates around the pillar until it can attack');
  assert(distance(enemy, goal) <= stop + 1e-8, 'enemy reaches attack range, including ranged foes already near cover');
  assert(distance(enemy, goal) > 1, 'enemy does not run onto the player');
  assert(searches > 0 && searches < 8, 'blocked pursuit reuses its route instead of searching every tick');
  assert.equal(enemy.path.length, 0, 'clear pursuit drops the old detour');
}
{
  const enemy = { x: pillar.x, z: pillar.z - 4, instanceId: 'run', movedAt: 0 };
  const goal = { x: pillar.x, z: pillar.z + 4 };
  for (let i = 0; i < 12; i++) { goal.x += .2; pursue(enemy, goal, 2, 1); }
  pursue(enemy, goal, 2, 30);
  assert(canTraverse(enemy, goal, colliders, bounds) && distance(enemy, goal) <= 2.000001, 'cached pursuit follows a moving player around cover');
  const other = { x: enemy.x + 4, z: enemy.z };
  assert(canTraverse(enemy, other, colliders, bounds));
  enemy.path = [{ x: pillar.x, z: pillar.z - 4 }]; searches = 0;
  pursue(enemy, other, 2, 10);
  assert(distance(enemy, other) <= 2.000001 && !enemy.path.length && !searches, 'switching to a clear target immediately discards the previous route');
}
{
  const enemy = { x: pillar.x, z: pillar.z - 4, instanceId: 'run', movedAt: 0 };
  const room = dungeonLayout(kind).rooms.find(room => Math.abs(enemy.x - room.x) < room.width / 2 && Math.abs(enemy.z - room.z) < room.depth / 2);
  const goal = dungeonLayout(kind).rooms.find(other => other !== room && canTraverse(other, other, colliders, bounds));
  assert(room && goal, 'destination is in a different sealed chamber');
  searches = 0; pursue(enemy, goal, 2);
  assert(Math.abs(enemy.x - room.x) < room.width / 2 && Math.abs(enemy.z - room.z) < room.depth / 2 && distance(enemy, goal) > 40, 'failed navigation cannot cross sealed chamber walls');
  assert(searches <= 8, 'unreachable goals also throttle pathfinding');
}
{
  const enemy = { x: pillar.x, z: pillar.z - 4, instanceId: '', movedAt: 0 };
  const goal = { x: pillar.x, z: pillar.z + 4 };
  searches = 0; pursue(enemy, goal, 2);
  assert(searches > 0 && searches < 8, 'overworld pursuit also uses cached obstacle detours');
  assert(canTraverse(enemy, goal, colliders, bounds) && distance(enemy, goal) <= 2.000001, 'overworld pursuit safely reaches attack range around cover');
}
{
  Object.assign(context, { CHARGE_ATTACK, TERRAIN_STEP, chargeSafeAreas: [], CHASE_DISTANCE: 100,
    combatInstanceActive: () => true, arenaMode: () => false, mapGuardianAllowed: () => true });
  const resolve = runInNewContext(['chargeLaneAllowed', 'resolveEnemyAttack'].map(extract).join('\n') + '\nresolveEnemyAttack', context);
  for (const blocked of [true, false]) {
    const from = { x: pillar.x + (blocked ? 0 : 4), z: pillar.z - 4 }, goal = { x: from.x, z: pillar.z + 4 };
    const target = { player: { id: 'charger-target', hp: 100, x: goal.x + 2, z: goal.z }, instanceId: '', lifeStartedAt: 0 };
    const attack = { style: 'charge', targetId: target.player.id, fromX: from.x, fromZ: from.z, ...goal, radius: .3, chargeAt: 0, impactAt: 1000, endsAt: 1200 };
    const enemy = { ...from, instanceId: '', movedAt: 0, attack, attackTarget: target, attackTargetLife: 0 };
    context.sessions = new Map([[target.player.id, target]]); context.movementFrameStart = 0; searches = 0;
    assert.equal(canTraverse(from, goal, colliders, bounds, attack.radius), !blocked);
    resolve(enemy, 100);
    assert.equal(searches, 0, 'locked charges never seek a detour');
    if (blocked) {
      assert.equal(enemy.attack, null, 'cover in a locked charge lane cancels the attack');
      assert.equal(distance(enemy, from), 0, 'a blocked charge never moves through cover');
    } else {
      assert.equal(enemy.attack, attack); assert.equal(enemy.x, from.x, 'clear charges retain their locked lane when the target moves');
      assert(Math.abs(enemy.z - from.z - CHARGE_ATTACK.speed * .1) < 1e-8, 'clear charges retain their exact movement budget');
    }
  }
}
console.log('PASS dungeon pursuit: actual Veilhaven pillar detours, attack range, cached paths, shared movement budget, sealed walls, safe overworld detours and straight or cancelled locked charges.');
