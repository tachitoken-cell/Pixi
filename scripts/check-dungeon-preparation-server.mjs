import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { WebSocket } from 'ws';
import { DUNGEONS, DUNGEON_START, dungeonBounds, dungeonColliders, dungeonLayout, dungeonStages, inDungeonPreparation } from '../src/dungeon.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';

// Run shipped combat functions against the real sanctuary and collision geometry.
const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = name => { const match = source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`)); assert(match, name); return match[0]; };
const preparing = source.match(/  const dungeonPreparing = [^]*?;\n/)[0];
const liveSession = source.match(/  const liveSession = [^]*?;\n/)[0];
for (const definition of DUNGEONS) {
  const run = { id: definition.id, kind: definition.id }, threshold = dungeonStages(definition.id).find(stage => stage.id === 'threshold');
  const player = { id: 'delver', ...DUNGEON_START, hp: 100, maxHp: 100, level: 50, zone: 'hollow' };
  const session = { player, instanceId: run.id, lifeStartedAt: 0, socket: { readyState: WebSocket.OPEN }, shield: { amount: 20, endsAt: 99999 } };
  const enemy = { id: 'guardian', kind: 'crypt-weaver', name: 'Guardian', x: threshold.x, z: threshold.z, hp: 100, maxHp: 100, level: 50, instanceId: run.id, alive: true, threat: new Map(), target: null, movedAt: 0 };
  const sessions = new Map([[player.id, session]]), dungeons = new Map([[run.id, run]]), events = [];
  const colliders = dungeonColliders(dungeonStages(run.kind).map(s => s.id), dungeonLayout(run.kind).objects.map(o => o.id), run.kind);
  const ctx = { MONSTERS, WebSocket, sessions, dungeons, inDungeonPreparation, canTraverse, groundCanTraverse:canTraverse, findPath, pendingHits: [], movementFrameStart: 0,
    instanceBounds: () => dungeonBounds(run.kind), instanceColliders: () => colliders,
    physicalReach: (session, target, range) => Math.hypot(session.player.x-target.x, session.player.z-target.z) <= range && canTraverse(session.player, target, colliders, dungeonBounds(run.kind)),
    arenaMode: () => false, gmObserver: () => false, worldPvp: () => false, duelValid: () => false,
    instantCombat: { combatActive: () => true, actionError: () => null },
    combatInstanceActive: () => true, mapGuardianAllowed: () => true, worldBossCombatAllowed: () => true,
    enemyStats: { 'crypt-weaver': { aggroRange: 100, range: 10 } }, CHASE_DISTANCE: 60,
    distance: (a, b) => Math.hypot(a.x - b.x, a.z - b.z), combatTargetLife: target => target.respawnAt,
    basicAttackRange: () => 3, monsterPursuitSpeed: () => 0, monsterLevelScale: () => 1,
    combatStats: () => ({ defense: 0 }), storeBoostMultiplier: () => 1, activeSessions: () => [...sessions.values()],
    activeCompanion: () => null, healCompanion() {}, resolveEdictTimer: () => false, triggerEdicts() {},
    broadcast: e => events.push(e), stand() {}, event() {}, dirty() {}, playerDied() {},
    expireBurning: () => false, applyTalentHit: () => { throw Error('Protected outgoing hit reached damage calculation'); },
  };
  const api = runInNewContext(preparing + liveSession + ['combatDefense', 'applyDamage', 'restoreHealth', 'hostileTargetValid', 'enemyCombatCompanion', 'selectEnemyTarget', 'moveEnemyToward', 'resolveEnemyAttack', 'advanceKnightCharge', 'resolveKnightTimer', 'knightDamageTaken', 'resolveHits'].map(extract).join('\n') + '\n({applyDamage,restoreHealth,hostileTargetValid,selectEnemyTarget,moveEnemyToward,resolveEnemyAttack,resolveHits})', ctx);
  assert(inDungeonPreparation(player, run.kind));
  api.applyDamage(player, 'player', 30, run.id, 1000);
  assert.equal(player.hp, 100, `${run.kind}: direct/in-flight/periodic damage is rejected at resolution`);
  assert.equal(session.shield.amount, 20, 'protected hits consume no shield'); assert.equal(events.length, 0, 'protected hits emit no damage');
  assert(!api.hostileTargetValid(session, enemy, 1000), 'safe players cannot acquire hostile targets');
  assert.equal(api.selectEnemyTarget(enemy, [session], 1000), null, 'even exaggerated aggro range cannot detect protected players');
  enemy.threat.set(session, 500); enemy.target = session; enemy.attack = { targetId: player.id };
  assert.equal(api.selectEnemyTarget(enemy, [session], 1000), null, 'retreat clears old threat'); assert.equal(enemy.attack, null);
  for (const dot of [false, true]) {
    ctx.pendingHits.push({ session, enemy, life: enemy.respawnAt, zone: player.zone, instanceId: run.id, playerLife: 0, dueAt: 1000, damage: 30, dot });
    api.resolveHits(1000); assert.equal(enemy.hp, 100, 'outgoing projectile and periodic ticks stop after retreat');
  }
  // A path may approach the boundary before a later step is rejected. Check the actual protected area.
  for (let at = 1000; at <= 10000; at += 1000) {
    api.moveEnemyToward(enemy, player, at, 20, 0);
    assert(!inDungeonPreparation(enemy, run.kind), 'pursuit cannot step inside the sanctuary');
  }
  Object.assign(enemy, { x: threshold.x, z: threshold.z, movedAt: 0, path: [] });
  player.hp = 70; assert.equal(api.restoreHealth(session, 10, 1000), 10, 'preparation permits healing'); assert.equal(player.hp, 80);
  session.shield = null; player.hp = 100; Object.assign(player, { x: threshold.x, z: threshold.z + 1 });
  assert(api.hostileTargetValid(session, enemy, 1000), 'leaving the sanctuary enables combat');
  assert.equal(api.selectEnemyTarget(enemy, [session], 1000), session, 'leaving enables enemy aggro');
  api.applyDamage(player, 'player', 10, run.id, 1000); assert.equal(player.hp, 90, 'outside damage is unchanged');
  const attack = () => ({ targetId: player.id, basic: true, startedAt: 1000, impactAt: 1500, endsAt: 1800, x: player.x, z: player.z });
  Object.assign(enemy, { attack: attack(), attackTarget: session, attackTargetLife: 0, attackApplied: false, attackDamage: 10 });
  api.resolveEnemyAttack(enemy, 1500); assert.equal(player.hp, 80, 'real basic attack lands outside');
  Object.assign(enemy, { attack: attack(), attackApplied: false }); Object.assign(player, DUNGEON_START);
  api.resolveEnemyAttack(enemy, 1500); assert.equal(player.hp, 80, 'retreat before impact cancels a real basic attack'); assert.equal(enemy.attack, null);
  Object.assign(enemy, { x: 0, z: 11.2 }); Object.assign(player, { x: 0, z: 12.2 });
  const other = { player: { ...player, id: 'outside', z: 11.8 }, instanceId: run.id, lifeStartedAt: 0, socket: { readyState: WebSocket.OPEN } };
  sessions.set(other.player.id, other);
  Object.assign(enemy, { attack: { ...attack(), targetId: other.player.id, basic: false, style: 'pulse', x: other.player.x, z: other.player.z, radius: 5 }, attackTarget: other, attackApplied: false });
  api.resolveEnemyAttack(enemy, 1500);
  assert.equal(player.hp, 80, 'area attacks overlapping the boundary cannot hit sanctuary bystanders'); assert.equal(other.player.hp, 70, 'same area attack still hits outside');
}
console.log('PASS sanctuary server combat: all seven arrival rooms reject acquisition, old threat, direct damage, projectiles, DoTs, basic attacks and overlapping AoEs; retreat cancels pending attacks, enemies cannot enter, healing works, combat in encounter chambers remains active.');
