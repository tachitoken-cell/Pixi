import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { SPELLS, SPELL_EFFECT_IDS, TALENT_EFFECT_IDS, spellDamage } from '../src/spells.ts';
import { AUTO_ATTACKS } from '../src/auto-attacks.ts';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = name => source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Run the real server movement against circle and rectangular cover. The old
// instance-only detour stalls at these obstacles in the overworld.
for (const collider of [{ x: 0, z: 0, r: 1.4 }, { x: 0, z: 0, halfWidth: 1.2, halfDepth: 2.5 }]) {
  let at = 0;
  const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, colliders = [collider];
  const context = { movementFrameStart: 0, WORLD_COLLIDERS: colliders, WORLD_BOUNDS: bounds, distance, findPath, canTraverse, groundCanTraverse:canTraverse,
    insideCity: () => false, worldBossCombatAllowed: () => true, waterAt: () => false,
    movementCost: distance, villageSafe: () => false, dungeons: new Map() };
  const move = runInNewContext(`${extract('moveEnemyToward')}\nmoveEnemyToward`, context);
  const enemy = { x: -5, z: 0, movedAt: 0 }, goal = { x: 5, z: 0 };
  assert(!canTraverse(enemy, goal, colliders, bounds));
  for (let i = 0; i < 100 && distance(enemy, goal) > .1; i++) {
    const before = { ...enemy }; at += 100;
    move(enemy, goal, at, 3, 0);
    assert(distance(before, enemy) <= .300001, 'detours retain the movement budget');
    assert(canTraverse(before, enemy, colliders, bounds), 'detours never cross cover');
  }
  assert(distance(enemy, goal) < .1, 'overworld enemy reaches the far side of cover');
  context.waterAt = () => true;
  const before = { ...enemy }; move(enemy, { x: 8, z: 0 }, at + 100, 3, 0);
  assert.equal(distance(before, enemy), 0, 'detours retain water restrictions');
}

const player = { id: 'knight', hp: 1000, maxHp: 1000, x: 0, z: 0, appearance: { className: 'Knight' }, talents: [] };
const knight = { player, combatTalents: { guardian: { until: 10000 } }, lifeStartedAt: 1 };
const attacker = { id: 'enemy', hp: 1000, x: 1, z: 0 }, counters = [], broadcasts = [];
const context = { SPELLS, sessions: new Map([[player.id, knight]]), arenaMode: () => false,
  talentEffectRank: (p, id) => p.talents.filter(t => t === TALENT_EFFECT_IDS[id]).length,
  combatStats: () => ({ defense: 2, primaryDamage: 100 }), autoAttackDamage: () => 55,
  hostileTargetValid: () => true, queueKnightHit: (...args) => counters.push(args), knightEnemies: () => [],
  broadcast: m => broadcasts.push(m), triggerEdicts() {}, worldPvp: () => false, storeBoostMultiplier: () => 1,
  healCompanion() {}, activeSessions: () => [knight], friendlyTarget: () => true, gmObserver: () => false,
  edictNearby: () => [player], dirty() {}, distance };
const api = runInNewContext(['knightDamageTaken', 'applyDamage', 'combatDefense', 'clericSupportTalents', 'restoreHealth'].map(extract).join('\n') + '\n({applyDamage,combatDefense,restoreHealth,clericSupportTalents})', context);
api.applyDamage(player, 'player', 100, null, 1000, attacker);
assert.equal(player.hp, 940, 'Guardian reduces incoming damage by forty percent');
assert.equal(counters.length, 1, 'Guardian immediately counters');
api.applyDamage(player, 'player', 100, null, 1500, attacker);
assert.equal(counters.length, 1, 'Guardian counter has a one-second internal cooldown');
api.applyDamage(player, 'player', 100, null, 2000, attacker);
assert.equal(counters.length, 2);
api.applyDamage(player, 'player', 100, null, 3000, attacker, true);
assert.equal(counters.length, 2, 'reflections cannot recursively counter');
api.applyDamage(player, 'player', 100, null, 10000, attacker);
assert.equal(player.hp, 660, 'reduction expires exactly at its deadline');

player.hp = 100; knight.combatTalents = { guardian: { until: 20000 } };
api.applyDamage(player, 'player', 100, null, 10001, undefined, false, true, true);
assert.equal(player.hp, 0, 'explicit raid or GM executions bypass Guardian reduction');
player.hp = 660;
knight.combatTalents = { guard: { until: 20000, absorbed: 0 } };
player.talents = [TALENT_EFFECT_IDS.holdTheLine, TALENT_EFFECT_IDS.holdTheLine];
knight.shield = { amount: 100, endsAt: 20000 };
api.applyDamage(player, 'player', 100, null, 11000, attacker);
assert.equal(counters.at(-1)[2], 35, 'Hold the Line adds ten percent of absorption at rank two');

const cleric = { player: { talents: [TALENT_EFFECT_IDS.healingLight, TALENT_EFFECT_IDS.healingLight, TALENT_EFFECT_IDS.blessedArmor, TALENT_EFFECT_IDS.blessedArmor] } };
player.hp = 500; knight.shield = null; knight.combatTalents = {};
api.restoreHealth(knight, 100, 12000, false, cleric);
assert.equal(player.hp, 610, 'Healing Light adds one ten-percent pulse without recursion');
api.clericSupportTalents({ player: { talents: [TALENT_EFFECT_IDS.blessedArmor] } }, knight, 100, 16000, false);
assert.equal(knight.combatTalents.blessedArmor.until, 17000, 'weaker armor cannot extend a stronger buff');
assert.equal(api.combatDefense(knight, 16999), 6, 'Blessed Armor adds four defense for five seconds');
assert.equal(api.combatDefense(knight, 17000), 2, 'Blessed Armor expires at its deadline');
api.clericSupportTalents(cleric, knight, 100, 18000, false);
assert.equal(player.hp, 610, 'shield casts do not produce a healing pulse');
assert.equal(api.combatDefense(knight, 18000), 6, 'shield casts grant Blessed Armor');
player.hp = 0; api.restoreHealth(knight, 100, 18000, false, cleric);
assert.equal(player.hp, 0, 'ordinary healing never revives dead players');
player.hp = player.maxHp;
const injured = { player: { id: 'injured', hp: 50, maxHp: 100, x: 1, z: 0 }, combatTalents: {} };
context.sessions.set('injured', injured); context.edictNearby = () => [player, injured.player];
let pulseSaves = 0; context.dirty = () => { pulseSaves++; };
assert.equal(api.restoreHealth(knight, 100, 19000, false, cleric), 0, 'direct target is already full');
assert.equal(injured.player.hp, 60, 'pulse still heals a nearby injured ally');
assert.equal(pulseSaves, 1, 'pulse-only healing is scheduled for persistence');

{
  const caster = { player: { id: 'cleric', hp: 100, maxHp: 100, x: 0, z: 0, zone: 'greenwood', appearance: { className: 'Cleric' }, name: 'Cleric' }, lifeStartedAt: 1, instanceId: 'raid', abilityCooldowns: {} };
  const friend = (id, changes = {}) => ({ player: { id, hp: 0, maxHp: 100, diedAt: 999, x: 2, z: 0, zone: 'greenwood', ...changes }, lifeStartedAt: 1, instanceId: 'raid' });
  const dead = friend('dead'), alive = friend('alive', { hp: 20 }), far = friend('far', { x: 30 }), wall = friend('wall'); wall.blocked = true;
  const elsewhere = friend('elsewhere'); elsewhere.instanceId = 'other';
  const stranger = friend('stranger'), arena = friend('arena'); arena.arena = true;
  const group = [dead, alive, far, wall, elsewhere, arena], sessions = new Map([caster, ...group, stranger].map(s => [s.player.id, s]));
  const canceled = [], messages = [], corrections = [];
  const c = { SPELLS, AUTO_ATTACKS, spellDamage, sessions, distance, WALK_SPEED: 5,
    committingAccounts: new Map(), releasingAccounts: new Set(), liveSession: s => !!s, combatInstanceActive: () => true, instantCombat: { bySession: () => null, allies: () => false, actionError: () => null, recordAction() {}, clearMovementImpairments() {} },
    raids: { bySession: () => ({ phase: 'completed' }), allies: () => false }, partyOf: () => ({ members: group.map(s => s.player.id) }),
    arenaMode: s => !!s.arena, arenaFighter: () => false, swimming: () => false, gmObserver: () => false,
    activeSessions: () => [...sessions.values()], friendlyTarget: () => true, canSee: () => true,
    instanceColliders: () => [], instanceBounds: () => ({}), canTraverse: (_p, target) => !sessions.get(target.id)?.blocked,
    cancelHits: s => { canceled.push(s.player.id); s.combatTalents = null; }, cancelGathering: s => { s.gathering = null; }, resetJump: s => { s.jump = { grounded: true }; },
    correction: s => corrections.push(s.player.id), broadcast: m => messages.push(m), dirty() {}, event() {} };
  const api = runInNewContext([extract('castTargets'), extract('releaseCast')].join('\n') + '\n({castTargets,releaseCast})', c);
  const cast = { ability: SPELL_EFFECT_IDS.revivify, playerLife: 1, instanceId: 'raid', anchor: caster.player, targetLife: 1,
    from: { x: 0, z: 0 }, rotation: 0, startedAt: 1000, endsAt: 1000, stats: { primaryDamage: 20, specialDamage: 20 } };
  assert.deepEqual(Array.from(api.castTargets(caster, cast, 1000), p => p.id), ['dead'], 'revive filters living, distant, blocked, other-instance, ungrouped and arena players');
  c.committingAccounts.set(dead.recordKey, {});
  assert.equal(api.castTargets(caster, cast, 1000).length, 0, 'revive waits for target saves');
  c.committingAccounts.clear();
  c.combatInstanceActive = () => false;
  assert.equal(api.castTargets(caster, cast, 1000).length, 1, 'completed raids still permit revival');
  assert(api.releaseCast(caster, cast, 1000));
  assert.equal(dead.player.hp, 100); assert.equal(dead.player.diedAt, 0);
  assert.equal(dead.lifeStartedAt, 1000, 'revival invalidates hits from the previous life');
  assert.equal(dead.player.x, 2, 'revival preserves the corpse position');
  assert.deepEqual(canceled, ['dead']); assert.deepEqual(corrections, ['dead']);
  assert.equal(dead.jump.grounded, true); assert(dead.moveBudget > 0);
  assert.equal(alive.player.hp, 20); assert.equal(stranger.player.hp, 0);
  assert.equal(api.castTargets(caster, cast, 1000).length, 0, 'repeated instant revival cannot heal living players');
}
console.log('PASS September combat: overworld cover, Guardian, Hold the Line, healing pulse, Blessed Armor, and Revivify boundaries/lifecycle/completed raids.');
