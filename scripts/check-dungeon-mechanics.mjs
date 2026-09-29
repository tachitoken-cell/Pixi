import { storeBoostMultiplier } from '../src/ingame-store.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { dungeonHazardPattern, dungeonDeathHazardPattern, dungeonHazardContains } from '../src/dungeon-mechanics.ts';
import { DUNGEONS, LEGACY_DUNGEONS, DUNGEON_START, getDungeon, dungeonBounds, dungeonCheckpoint, dungeonColliders, dungeonLayout, dungeonStages, inDungeonPreparation } from '../src/dungeon.ts';
import { canTraverse } from '../src/realm.ts';
import { combatStats, starterGear, GEAR_SETS, EQUIPMENT_SLOTS, maxHealth } from '../src/progression.ts';
import { monsterLevelScale, monsterStatsAtLevel, BASIC_ATTACK } from '../src/bestiary.ts';

// Execute the shipped server's queue and resolver, with actual collision, defense,
// level scaling and damage events, without clearing eight rooms for each boundary.
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const section = (a, b) => server.slice(server.indexOf(`  function ${a}(`), server.indexOf(`  function ${b}(`));
function fixture(kind, enemyKind, boss = false) {
  const run = { id: randomUUID(), kind, members: [], hazards: [], completed: false, spawned: new Set(), cleared: new Set(), activated: new Set(), checkpoint: false, wipes: 0 };
  const room = dungeonStages(kind).find(stage => stage.id === 'threshold');
  const player = { id: randomUUID(), x: room.x, z: room.z + 5, hp: 1000, maxHp: 1000, level: 30, zone: 'hollow', appearance: { className: 'Ranger' }, talents: [], ...starterGear('Ranger') };
  const session = { player, instanceId: run.id, lifeStartedAt: 0 };
  const source = { id: randomUUID(), kind: enemyKind, name: 'Mechanic guardian', x: room.x, z: room.z, level: 30, damageScale: 2.4, alive: true, dungeonBoss: boss, instanceId: run.id, target: session };
  const enemies = [source], sessions = new Map([[player.id, session]]), dungeons = new Map([[run.id, run]]), events = [];
  run.members.push(player.id);
  // Use the clear center of an actual encounter chamber; extra walls exercise revalidation.
  const colliders = dungeonColliders(dungeonStages(kind).map(stage => stage.id), dungeonLayout(kind).objects.map(object => object.id), kind), extraWalls = [];
  assert(canTraverse(source, player, colliders, dungeonBounds(kind)), `${kind}: test chamber is traversable`);
  const ctx = { instantCombat: { combatActive: () => true }, arenaMode: s => s?.duel?.mode === 'arena', dungeons, enemies, sessions, dungeonHazardPattern, dungeonHazardContains, randomUUID,
    distance: (a, b) => Math.hypot(a.x - b.x, a.z - b.z), canTraverse, dungeonBounds, dungeonStages, inDungeonPreparation, dungeonPreparing: s => inDungeonPreparation(s.player, run.kind),
    instanceColliders: () => [...colliders, ...extraWalls], gmObserver: s => !!s.gm,
    activeCompanion: s => s.companion || null, combatTargetLife: target => target.respawnAt,
    getDungeon, dungeonLayout, dungeonCheckpoint, DUNGEON_START,
    combatStats, storeBoostMultiplier, monsterLevelScale, triggerEdicts() {}, stand() {}, playerDied() {}, event() {}, dirty() {},
    broadcast: (event, zone, instanceId) => events.push({ ...event, zone, instanceId }),
  };
  const knightDamageTaken = server.match(/  function knightDamageTaken\([^]*?\n  \}/)[0];
  const api = runInNewContext(server.match(/  function combatDefense\([^]*?\n  \}/)[0] + knightDamageTaken + section('applyDamage', 'event') + section('enemyCombatCompanion', 'selectEnemyTarget')
    + section('queueDungeonHazards', 'leaveSession') + section('publicDungeon', 'spawnDungeonStages') + '\n({queueDungeonHazards,updateDungeonHazards,publicDungeon})', ctx);
  return { run, source, session, player, enemies, sessions, events, extraWalls,
    queue: (plan, now = 10000, corpse = false) => api.queueDungeonHazards(run, source, plan, now, corpse),
    update: (now, resolveOnly = false) => api.updateDungeonHazards(now, resolveOnly), publicDungeon: () => api.publicDungeon(run) };
}
// Companions retain their enemy, which retains the owning session and companion.
// Hazard geometry must not copy that cycle (or a player's private state) into snapshots.
const targetPatterns = [
  ['rootvault', 'briar-sentinel'], ['rootvault', 'root-warden', true],
  ['nightroot', 'void-stalker'], ['nightroot', 'root-warden', true],
  ['plagueworks', 'carrion-hound'], ['plagueworks', 'sewer-horror'], ['plagueworks', 'crypt-weaver'],
  ['plagueworks', 'plague-alchemist'], ['plagueworks', 'plague-abomination', true],
  ['emberfall', 'furnace-revenant'], ['emberfall', 'pyrelord-ignivar', true],
  ['veilhaven', 'grave-fox'], ['veilhaven', 'lantern-wraith'], ['veilhaven', 'veiled-abbess', true],
];
const publicHazardFields = new Set(['id', 'sourceId', 'leap', 'x', 'z', 'r', 'innerR', 'kind', 'label', 'startedAt', 'endsAt', 'damage']);
for (const args of targetPatterns) for (const companion of [true, false]) {
  const f = fixture(...args), label = `${args[1]} targeting ${companion ? 'companion' : 'player'}`;
  if (companion) f.session.companion = { id: `companion:${f.player.id}`, ownerId: f.player.id,
    x: f.player.x, z: f.player.z, saved: { hp: 100, level: 30 }, target: f.source,
    targetLife: f.source.respawnAt, instanceId: f.run.id, playerLife: f.session.lifeStartedAt };
  const target = companion ? f.session.companion : f.player, original = { ...target }, locked = { x: target.x, z: target.z };
  f.update(12000);
  assert(f.run.hazards.some(hazard => hazard.x === locked.x && hazard.z === locked.z), `${label}: the target mark queues at the cast position`);
  assert.deepEqual(target, original, `${label}: planning does not mutate the target`);
  const snapshot = { type: 'snapshot', dungeon: f.publicDungeon() };
  assert.doesNotThrow(() => JSON.stringify(snapshot), `${label}: the shipped public dungeon snapshot is serializable`);
  for (const hazard of snapshot.dungeon.hazards) {
    assert(Object.keys(hazard).every(key => publicHazardFields.has(key)), `${label}: only public hazard fields leave the server`);
  }
  const before = JSON.stringify(snapshot.dungeon.hazards);
  target.x += 5; target.z += 5;
  assert.equal(JSON.stringify(f.publicDungeon().hazards), before, `${label}: moving the target cannot change queued warning coordinates`);
}
const normalKinds = [['rootvault', 'briar-sentinel', 'roots'], ['frosthollow', 'ice-wisp', 'frost'], ['frosthollow', 'frost-yeti', 'frost'], ['nightroot', 'void-stalker', 'shadow'], ['plagueworks', 'crypt-weaver', 'roots'], ['plagueworks', 'plague-alchemist', 'roots'], ['emberfall', 'furnace-revenant', 'fire'], ['veilhaven', 'lantern-wraith', 'frost'], ['veilhaven', 'jade-sentinel', 'frost']];
for (const [kind, enemyKind, effect] of normalKinds) {
  const f = fixture(kind, enemyKind); f.update(10000);
  assert(f.run.hazards.length > 0, `${enemyKind}: normal engaged mob has authoritative mechanic`);
  assert.equal(f.run.hazards[0].kind, effect); assert(f.run.hazards[0].label.includes(' · '));
  assert(f.run.hazards.every(hazard => hazard.endsAt - hazard.startedAt >= 1200));
  assert(f.source.dungeonCastUntil > f.run.hazards[0].endsAt, 'source holds its pose through the warning');
  f.update(10001); assert.equal(f.run.hazards.length, 1, 'a normal mob cannot spam warnings');
  const unengaged = fixture(kind, enemyKind); unengaged.source.target = null; unengaged.update(10000); assert.equal(unengaged.run.hazards.length, 0);
}
// Nine new creature roles reuse the authoritative warning/impact path, with distinct geometry.
const newPatterns = [
  ['plagueworks', 'fungal-thrall', 1, 'roots'], ['plagueworks', 'carrion-hound', 1, 'roots'], ['plagueworks', 'sewer-horror', 2, 'roots'],
  ['emberfall', 'slag-elemental', 1, 'fire'], ['emberfall', 'ash-drake', 3, 'fire'], ['emberfall', 'chain-jailer', 1, 'fire'],
  ['veilhaven', 'grave-fox', 1, 'shadow'], ['veilhaven', 'incense-acolyte', 1, 'frost'], ['veilhaven', 'spirit-koi', 2, 'frost'],
];
for (const [id, enemyKind, count, effect] of newPatterns) {
  const f = fixture(id, enemyKind); f.update(12000);
  assert.equal(f.run.hazards.length, count, `${enemyKind}: its whole authored pattern queues through the real server`);
  assert(f.run.hazards.every(hazard => hazard.kind === effect && hazard.endsAt - hazard.startedAt >= 1500 && hazard.label.includes(' · ')));
  const due = Math.min(...f.run.hazards.map(hazard => hazard.endsAt)); f.update(due - 1, true);
  assert.equal(f.player.hp, 1000, 'readable windups never inflict early damage');
  f.source.stunUntil = due + 100; f.update(due, true);
  assert.equal(f.run.hazards.length, 0, 'stunning a new caster cancels its warning sequence'); assert.equal(f.player.hp, 1000);
  const unengaged = fixture(id, enemyKind); unengaged.source.target = null; unengaged.update(12000);
  assert.equal(unengaged.run.hazards.length, 0, 'new ordinary mechanics require combat engagement');
}
{
  const source = { kind: 'chain-jailer', x: 0, z: 0 }, ring = dungeonHazardPattern('emberfall', source, { x: 0, z: 5 }).hazards[0];
  assert(!dungeonHazardContains(ring, source) && dungeonHazardContains(ring, { x: 0, z: 4 }), 'chain sweep has a real safe centre');
  const koi = dungeonHazardPattern('veilhaven', { kind: 'spirit-koi', x: 0, z: 0 }, { x: 0, z: 5 });
  assert(koi.hazards.every(hazard => !dungeonHazardContains(hazard, { x: 0, z: 5 })), 'spirit ripples leave the advertised gap');
  const f = fixture('plagueworks', 'corpse-scarab'); f.source.alive = false; f.player.z = f.source.z + 2;
  assert(f.queue(dungeonDeathHazardPattern('plagueworks', f.source), 12000, true));
  f.update(13899, true); assert.equal(f.player.hp, 1000); f.update(13900, true); assert(f.player.hp < 1000, 'scarab spores resolve after a complete 1.9 second death warning');
  assert.equal(dungeonDeathHazardPattern('emberfall', f.source), null, 'scarab spores remain dungeon-specific');
}
assert.equal(dungeonHazardPattern('cindercrypt', { kind: 'ember-beetle', x: 0, z: 0 }, { x: 1, z: 1 }), null, 'beetles explode on death, not while alive');
assert.equal(dungeonDeathHazardPattern('rootvault', { kind: 'ember-beetle', x: 0, z: 0 }), null, 'death mechanic is dungeon-specific');
{
  const f = fixture('rootvault', 'briar-sentinel'); f.update(10000); const h = f.run.hazards[0];
  f.player.x = 4; f.update(h.endsAt - 1, true); assert.equal(f.player.hp, 1000, 'warning is harmless');
  f.update(h.endsAt, true); assert.equal(f.player.hp, 1000, 'leaving a locked root mark dodges it');
  f.player.x = 0; f.update(17000); const second = f.run.hazards[0]; f.update(second.endsAt, true);
  assert(f.player.hp < 1000, 'remaining inside a root mark takes authoritative damage');
  const hp = f.player.hp; f.update(second.endsAt + 1, true); assert.equal(f.player.hp, hp, 'each impact resolves once');
}
{
  const f = fixture('frosthollow', 'frost-yeti', true); f.update(10000); const ring = f.run.hazards[0];
  assert(ring.innerR > 0); f.player.z = f.source.z + 1; f.update(ring.endsAt, true); assert.equal(f.player.hp, 1000, 'frost ring center is safe');
  f.update(17000); const core = f.run.hazards[0]; assert.equal(core.innerR, undefined, 'boss alternates safe center and core blast');
  f.update(core.endsAt, true); assert(f.player.hp < 1000, 'remaining in the core is punished next cycle');
  assert(!dungeonHazardContains(ring, { x: ring.x, z: ring.z + ring.innerR - .001 }));
  assert(dungeonHazardContains(ring, { x: ring.x, z: ring.z + ring.innerR }));
  assert(!dungeonHazardContains(ring, { x: ring.x, z: ring.z + ring.r + .001 }));
}
{
  const f = fixture('cindercrypt', 'ember-beetle'); f.source.alive = false; f.player.z = f.source.z + 3;
  assert(f.queue(dungeonDeathHazardPattern('cindercrypt', f.source), 10000, true));
  f.update(11599, true); assert.equal(f.player.hp, 1000); f.update(11600, true);
  assert(f.player.hp < 1000, 'corpse blast survives source death and resolves after 1.6 seconds');
  const boss = fixture('cindercrypt', 'stone-golem', true); boss.update(10000);
  assert.equal(boss.run.hazards.length, 5); const times = boss.run.hazards.map(h => h.endsAt);
  assert(times.every((t, i) => !i || t > times[i - 1]), 'fire line detonates in sequence');
  assert(boss.run.hazards.every(h => h.x === 0), 'fire line points toward target; lateral movement dodges it');
}
{
  const f = fixture('nightroot', 'root-warden', true); f.update(10000); assert.equal(f.run.hazards.length, 2);
  const departureZ = f.source.z, targetZ = f.player.z;
  f.player.x = 4; f.update(11499, true); assert.equal(f.source.z, departureZ, 'leap waits for its warning');
  f.update(11500, true); assert.equal(f.source.z, targetZ, 'leap moves the actual source to the recorded point');
  assert.equal(f.source.x, 0, 'leap never homes to the dodging player'); assert.equal(f.player.hp, 1000);
  f.update(12600, true); assert(f.player.hp < 1000, 'larger delayed echo makes the player keep moving');
}
for (const cancel of ['dead', 'stunned', 'removed', 'wall', 'new-life', 'other-instance', 'observer']) {
  const f = fixture('nightroot', 'void-stalker'); f.update(10000); const old = { x: f.source.x, z: f.source.z };
  if (cancel === 'dead') f.source.alive = false;
  if (cancel === 'stunned') f.source.stunUntil = 12000;
  if (cancel === 'removed') f.enemies.length = 0;
  if (cancel === 'wall') f.extraWalls.push({ x: 0, z: f.source.z + 2.5, r: 5, halfWidth: 5, halfDepth: .5 });
  if (cancel === 'new-life') f.session.lifeStartedAt = 11000;
  if (cancel === 'other-instance') f.session.instanceId = 'another-run';
  if (cancel === 'observer') f.session.gm = true;
  f.update(11500, true); assert.equal(f.player.hp, 1000, `${cancel}: stale/invalid attack cannot damage player`);
  if (['dead', 'stunned', 'removed', 'wall'].includes(cancel)) assert.deepEqual({ x: f.source.x, z: f.source.z }, old, `${cancel}: no invalid teleport`);
}
{
  const f = fixture('rootvault', 'briar-sentinel'); f.extraWalls.push({ x: 0, z: f.source.z + 2.5, r: 5, halfWidth: 5, halfDepth: .5 });
  f.update(10000); assert.equal(f.run.hazards.length, 0, 'no targeting through walls');
  const boss = fixture('cindercrypt', 'stone-golem', true), plan = dungeonHazardPattern('cindercrypt', boss.source, boss.player);
  for (let i = 0; i < 5; i++) boss.queue(plan); assert.equal(boss.run.hazards.length, 20, 'whole patterns fit within the 24 warning budget');
  boss.run.completed = true; boss.update(11000); assert.equal(boss.run.hazards.length, 0, 'completion clears all attacks');
}
for (const [kind, enemyKind, count] of [['plagueworks', 'broodmother-vex', 3], ['plagueworks', 'plague-abomination', 2], ['emberfall', 'anvil-warden', 5], ['emberfall', 'pyrelord-ignivar', 2], ['veilhaven', 'bellkeeper-shen', 2], ['veilhaven', 'veiled-abbess', 3]]) {
  const f = fixture(kind, enemyKind, true); f.update(10000);
  assert.equal(f.run.hazards.length, count, `${enemyKind}: the complete themed boss pattern queues on the authoritative server`);
  assert(f.run.hazards.every(h => h.endsAt - h.startedAt >= 1800), 'all new boss mechanics have readable warnings');
  assert(new Set(f.run.hazards.map(h => h.endsAt)).size > 1, 'each boss has a staged attack sequence');
  const hp = f.player.hp; f.update(Math.min(...f.run.hazards.map(h => h.endsAt)) - 1, true); assert.equal(f.player.hp, hp, 'telegraphs do not deal early damage');
  f.source.alive = false; f.update(15000, true); assert.equal(f.run.hazards.length, 0, 'killing either boss cancels its remaining sequence');
}
for (const [id, kind] of [['plagueworks', 'plague-abomination'], ['emberfall', 'pyrelord-ignivar']]) {
  const source = { kind, x: 0, z: 0, dungeonBoss: true };
  const ring = dungeonHazardPattern(id, source, { x: 0, z: 5 }, 0).hazards[0], core = dungeonHazardPattern(id, source, { x: 0, z: 5 }, 1).hazards[0];
  assert(!dungeonHazardContains(ring, source) && dungeonHazardContains(core, source), 'boss alternates a genuinely safe center with a core eruption');
}
{
  const f = fixture('emberfall', 'slag-crawler'); f.source.alive = false; f.player.z = f.source.z + 3;
  assert(f.queue(dungeonDeathHazardPattern('emberfall', f.source), 10000, true)); f.update(11600, true);
  assert(f.player.hp < 1000, 'slag crawler carapace explodes after death');
}
{
  const f = fixture('plagueworks', 'plague-alchemist'); f.run.completed = true; f.source.dungeonOptional = true;
  f.update(10000); assert(f.run.hazards.length > 0, 'optional guardians retain their real mechanics after final completion');
  f.source.dungeonOptional = false; f.update(10001, true); assert.equal(f.run.hazards.length, 0, 'completion still cancels non-optional attacks');
}
for (const { id: kind } of DUNGEONS) {
  const f = fixture(kind, 'crypt-weaver'); Object.assign(f.source, { x: 0, z: 11.2 }); Object.assign(f.player, { x: 0, z: 11.8 });
  const plan = { hazards: [{ x: 0, z: 11.8, r: 5, delayMs: 1600, damageScale: 1, kind: 'fire', label: 'Boundary blast' }] };
  assert(f.queue(plan)); f.player.z = 12.2; f.update(11600, true); assert.equal(f.player.hp, 1000, 'retreat protects against already queued overlapping dungeon hazards');
  plan.hazards[0].z = 15; plan.hazards[0].leap = true;
  assert(!f.queue(plan), 'hazard and leap destinations cannot target the arrival sanctuary');
}
// Existing level growth and party scaling both apply: tune new base stats against actual equipped health.
const balance = [];
for (const dungeon of LEGACY_DUNGEONS.slice(4)) for (const stage of dungeonStages(dungeon.id)) {
  const level = stage.level, set = GEAR_SETS.filter(set => set.className === 'Ranger' && set.requiredLevel <= level).at(-1);
  const equipment = Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, slot === 'ring2' ? null : `${set.id}-${slot === 'ring1' ? 'ring' : slot}`]));
  const player = { level, appearance: { className: 'Ranger' }, equipment, talents: [] }, health = maxHealth(player), defense = combatStats(player).defense;
  for (const enemy of stage.enemies) for (const partySize of [1, 4]) {
    const stats = monsterStatsAtLevel(enemy.kind, level), scale = (1 + (level - 10) * .07) * (1 + (partySize - 1) * .15);
    const hit = Math.max(1, Math.round(stats.damage * scale * BASIC_ATTACK.damageScale) - defense), fraction = hit / health;
    assert(fraction < (enemy.boss ? .55 : .4), `${dungeon.id}/${enemy.kind}: same-level equipped basic attacks remain survivable in solo and four-player groups`);
    if (stage.id === 'throne' && enemy.boss) balance.push({ dungeon: dungeon.id, level, partySize, health, basicDamage: hit, basicPercent: +(fraction * 100).toFixed(1) });
  }
}
console.table(balance);
console.log('PASS shipped dungeon mechanics: six staged boss patterns, nine additional creature mechanics, scarab/slag corpse explosions and solo/four-player balance; distinct normal mob warnings, roots locked to cast position, beetle corpse blasts, staggered fire line, true frost safe-center/core alternation, actual stalker leap and delayed boss echo; dodge/deadline/once-only damage, cooldown, source death/stun/removal, wall and teleport revalidation, player lifespan/instance/observer isolation and 24-warning cap.');
