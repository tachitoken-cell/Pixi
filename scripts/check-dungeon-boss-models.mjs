import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { LEGACY_DUNGEONS as DUNGEONS, DUNGEON_START, dungeonStages, dungeonLayout, dungeonReturn, dungeonColliders, dungeonBounds, getDungeon } from '../src/dungeon.ts';
import { findPath } from '../src/navigation.ts';
import { DUNGEON_BOSS_MODELS, DUNGEON_BOSS_MODEL_KINDS, dungeonBossVisual } from '../src/dungeon-boss-models.ts';
import { MONSTERS, monsterStatsAtLevel, monsterLevelScale } from '../src/bestiary.ts';
import { storyQuestProgress } from '../src/story-quests.ts';
import { goldSource } from '../src/gold-economy.ts';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = name => { const match = source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`)); assert(match, name); return match[0]; };
const functions = ['spawnDungeonEnemy', 'advanceStoryChamber', 'spawnDungeonStages', 'snapshot', 'resolveHits', 'advanceDungeons', 'selectEnemyTarget', 'resolveEnemyAttack'].map(extract).join('\n');
const clone = value => JSON.parse(JSON.stringify(value));
let nextId = 0;
function fixture(kind, stageId, partySize = 1) {
  const stage = dungeonStages(kind).find(stage => stage.id === stageId), otherStages = dungeonStages(kind).filter(stage => stage.id !== stageId).map(stage => stage.id);
  const dungeon = { id: 'test-run', kind, partySize, wipes: 0, members: ['hero', 'camper'], startedAt: 1, elapsedMs: 0, kills: 0, roster: [],
    spawned: new Set(otherStages), cleared: new Set(otherStages), activated: new Set(['verdant-seal', 'glacial-seal']), completed: false, hazards: [] };
  const member = (id, point) => ({ instanceId: dungeon.id, lifeStartedAt: 0, socket: { readyState: 1 }, player: {
    id, name: id, zone: 'hollow', level: 60, hp: 1000, maxHp: 1000, ...point, appearance: { className: 'Mage' }, contracts: {},
    achievements: { kills: 0, worldBosses: 0, dungeons: {} }, ownedMounts: [], xp: 0 } });
  const hero = member('hero', stage.enemies[0]), camper = member('camper', DUNGEON_START);
  const sessions = new Map([[hero.player.id, hero], [camper.player.id, camper]]), dungeons = new Map([[dungeon.id, dungeon]]), lootDrops = new Map(), calls = [];
  const context = { MONSTERS, storyQuestProgress, storyEncounters: { publicState: () => null }, dungeonStages, dungeonLayout, dungeonBossVisual, getDungeon, monsterStatsAtLevel, monsterLevelScale, enemyStats: MONSTERS,
    enemies: [], nodes: [], sessions, dungeons, lootDrops, pendingHits: [], dungeonSummons: new Map(), invitations: new Map(), duelInvitations: new Map(), arenaInvitations: new Map(), arenaQueue: new Map(),
    activeSessions: () => [...sessions.values()], publicDamageOverTime: () => new Map(), pendingAuctionPurchases: () => new Map(), isGmSession: () => false, canSee: () => true,
    raids: { publicState: () => null, publicInvites: () => [], enemyKilled: () => false },
    publicPlayer: session => session.player, publicParty: () => null, publicDungeon: run => ({ kind: run.kind }), arenaMode: () => false,
    distance: (a, b) => Math.hypot(a.x-b.x, a.z-b.z), expireBurning: () => false, resolveKnightTimer: () => false, resolveEdictTimer: () => false, advanceKnightCharge() {},
    WebSocket: { OPEN: 1 }, hostileTargetValid: (_session, enemy) => enemy.alive, combatTargetLife: enemy => enemy.respawnAt,
    activeCompanion: () => null, applyHarmEdict() {}, applyTalentHit: (_hit, damage) => damage, storeBoostMultiplier: () => 1,
    instantCombat: { enemyKilled: () => false, publicState: () => null },
    CHASE_DISTANCE: 38, applyDamage: (enemy, _type, damage) => { enemy.hp = Math.max(0, enemy.hp-damage); }, event() {}, dirty() {},
    queueDungeonHazards() {}, dungeonDeathHazardPattern: () => null, partyOf: () => null, mapGuardianAllowed: () => true,
    ROOTVAULT_GUARDIAN: { id: 'overworld-guardian' }, goldSource, economyVersion: 1, randomUUID: () => `drop-${++nextId}`,
    rolledLoot: (kind, level, player, enemy) => { calls.push({ kind, level, owner: player.id, enemy }); return []; },
    addXp: (session, xp) => { session.player.xp += xp; return xp; }, creditObjective() {}, contractProgress() {}, surfaceAt: () => ({}),
    lootTrace: { active: () => false },
    rollDungeonMount: () => undefined, mountRandomInt: () => 99, isThemedDungeonLoot: kind => DUNGEONS.slice(4).some(dungeon => dungeon.id === kind),
    rollDungeonCacheLoot: () => [{ id: 'item:relic', kind: 'item', itemId: 'relic', quantity: 1 }], reservedLootGear: () => [], DEATH_ANIMATION_MS: 1600, structuredClone,
  };
  const api = runInNewContext(`${functions}\n({spawnDungeonStages,snapshot,resolveHits,advanceDungeons,selectEnemyTarget,resolveEnemyAttack})`, context);
  api.spawnDungeonStages(dungeon);
  return { stage, dungeon, context, api, hero, camper, lootDrops, calls };
}

assert.equal(new Set(DUNGEON_BOSS_MODEL_KINDS).size, 8);
assert(DUNGEON_BOSS_MODEL_KINDS.every(model => !Object.hasOwn(MONSTERS, model)), 'visual identities cannot replace combat kinds');
assert.equal(dungeonBossVisual('rootvault', 'confluence', -1), undefined);
assert.equal(dungeonBossVisual('rootvault', 'threshold', 0), undefined);
let checked = 0;
for (const { id } of DUNGEONS) for (const stage of dungeonStages(id)) for (const partySize of [1, 4]) {
  const { context, api, hero } = fixture(id, stage.id, partySize), wire = clone(api.snapshot(hero));
  assert.equal(context.enemies.length, stage.enemies.length);
  assert.equal(wire.enemies.length, stage.enemies.length);
  for (const [index, spawn] of stage.enemies.entries()) {
    const enemy = context.enemies[index], publicEnemy = wire.enemies[index], visual = dungeonBossVisual(id, stage.id, index);
    const boss = spawn.boss === true || stage.id === 'throne' && index === 0;
    assert.equal(enemy.kind, spawn.kind, 'combat kind remains unchanged');
    assert.equal(enemy.dungeonBoss, boss, 'art does not promote an ordinary encounter leader to a mechanical boss');
    assert.equal(enemy.worldBoss, undefined); assert.equal(publicEnemy.worldBoss, false);
    assert.equal(enemy.maxHp, Math.round(monsterStatsAtLevel(spawn.kind, stage.level).hp * (1 + (partySize-1)*.6) * (boss ? 1.8 : 1)));
    assert.equal(enemy.damageScale, (1+(stage.level-10)*.07)*(1+(partySize-1)*.15));
    assert.equal(enemy.rewardScale, 1+(getDungeon(id).minLevel-10)*.1);
    assert.deepEqual([enemy.x, enemy.z, enemy.homeX, enemy.homeZ], [spawn.x, spawn.z, spawn.x, spawn.z]);
    assert.equal(enemy.model, visual?.model); assert.equal(publicEnemy.model, visual?.model);
    assert.equal(publicEnemy.kind, spawn.kind); assert.equal(publicEnemy.dungeonBoss, boss);
    assert.equal(publicEnemy.name, visual?.name ?? MONSTERS[spawn.kind].name);
    if (!visual) assert(!Object.hasOwn(publicEnemy, 'model'), 'ordinary neighbours and newer dungeon creatures keep their existing models');
    checked++;
  }
}

for (const { dungeonId, stageId, model, name } of DUNGEON_BOSS_MODELS) {
  const { context, api, hero, camper, dungeon, lootDrops, calls } = fixture(dungeonId, stageId), enemy = context.enemies[0];
  context.pendingHits.push({ session: hero, enemy, life: enemy.respawnAt, playerLife: 0, instanceId: dungeon.id, zone: 'hollow', damage: 1e9, attackerLevel: 60, dueAt: 1000 });
  api.resolveHits(1000);
  assert(!enemy.alive && enemy.hp === 0, 'the actual authoritative kill path creates the corpse');
  assert.equal(enemy.kind, dungeonStages(dungeonId).find(stage => stage.id === stageId).enemies[0].kind);
  assert.equal(enemy.dungeonBoss, stageId === 'throne', 'legacy confluence model still uses its old ordinary-encounter flag');
  const corpse = [...lootDrops.values()].find(drop => drop.ownerId === hero.player.id);
  assert.equal(corpse.model, model); assert.equal(corpse.name, name); assert.equal(corpse.kind, enemy.kind);
  assert.equal(corpse.diedAt, enemy.diedAt); assert.equal(corpse.rotation, enemy.rotation);
  assert.equal(calls[0].kind, enemy.kind, 'loot rolls still use the original monster kind');
  const publicCorpse = clone(api.snapshot(hero)).loot.find(drop => drop.id === corpse.id);
  assert.equal(publicCorpse.model, model); assert(!Object.hasOwn(publicCorpse, 'goldReason'));
  const deadEnemy = clone(api.snapshot(hero)).enemies.find(candidate => candidate.id === enemy.id);
  assert.equal(deadEnemy.model, model); assert.equal(deadEnemy.alive, false, 'dying animation and corpse share visual identity');
  assert(![...lootDrops.values()].some(drop => drop.ownerId === camper.player.id), 'distant party member has no ordinary kill corpse');
  if (stageId === 'throne') {
    assert(context.enemies.some(neighbour => neighbour.alive), 'final chamber adds are still alive when its boss dies');
    api.advanceDungeons(3000);
    assert(dungeon.completed && dungeon.cleared.has('throne'), 'final boss defeat opens the return route without requiring surviving adds');
    assert(findPath(hero.player, dungeonReturn(dungeonId), dungeonColliders(dungeon.cleared, dungeon.activated, dungeonId), dungeonBounds(dungeonId)).length, 'normal dungeon return portal has a usable path while adds survive');
    for (const add of context.enemies.filter(neighbour => neighbour.alive)) {
      assert(add.dungeonCleared && add.attack === null && add.threat.size === 0, 'surviving adds remain alive but stop threatening results and exit');
      assert.equal(api.selectEnemyTarget(add, [hero], 4000), null, 'cleared-room adds cannot acquire another target');
      add.attack = { impactAt: 4000 }; api.resolveEnemyAttack(add, 4000);
      assert.equal(add.attack, null, 'a stale in-flight attack cannot hit after completion');
    }
    const completion = [...lootDrops.values()].find(drop => drop.ownerId === camper.player.id);
    assert(completion, 'actual completion path creates personal clear rewards for a distant member');
    assert.equal(completion.kind, enemy.kind); assert.equal(completion.enemyId, `${dungeon.id}-completion`);
    assert.equal(completion.model, undefined, 'clear rewards are a personal result, not another boss corpse');
    assert.equal(dungeon.results.get(camper.player.id).lootId, completion.id);
    assert.equal(clone(api.snapshot(camper)).loot.find(drop => drop.id === completion.id).kind, enemy.kind);
    const xp = hero.player.xp, count = lootDrops.size; api.advanceDungeons(4000);
    assert.equal(hero.player.xp, xp); assert.equal(lootDrops.size, count, 'visual variants cannot replay final rewards');
  }
}
for (const { id } of DUNGEONS.filter(dungeon => dungeonStages(dungeon.id).some(stage => stage.optional))) {
  const { context, api, dungeon, hero, lootDrops } = fixture(id, 'throne');
  const optional = dungeonStages(id).find(stage => stage.optional);
  dungeon.cleared.delete(optional.id);
  const optionalGuard = { id: 'optional-guard', instanceId: dungeon.id, stageId: optional.id, dungeonOptional: true, alive: true, hp: 100 };
  context.enemies.push(optionalGuard);
  context.enemies[0].alive = false; context.enemies[0].hp = 0;
  api.advanceDungeons(3000);
  assert(dungeon.completed && dungeon.results.has(hero.player.id), `${id}: optional guardians cannot block boss clear rewards or the return portal`);
  assert(findPath(hero.player, dungeonReturn(id), dungeonColliders(dungeon.cleared, dungeon.activated, id), dungeonBounds(id)).length, 'themed dungeon return portal has a usable path while adds and optional enemies survive');
  assert(!dungeon.cleared.has(optional.id), 'completion does not mark an unexplored side room clear');
  assert(!optionalGuard.dungeonCleared, 'optional rooms retain their encounters for further exploration');
  const xp = hero.player.xp, count = lootDrops.size;
  for (const enemy of context.enemies) { enemy.alive = false; enemy.hp = 0; }
  api.advanceDungeons(4000);
  assert.equal(hero.player.xp, xp); assert.equal(lootDrops.size, count, 'later adds and optional kills cannot repeat completion rewards');
}
console.log(`PASS: ${checked} solo/party dungeon spawns retain combat kinds, HP, damage, rewards and flags; exactly eight visual variants survive live/dead snapshots and authoritative kill corpses; all four personal completion reward paths stay separate and cannot replay.`);
