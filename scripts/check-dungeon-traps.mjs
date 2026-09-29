import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DUNGEONS, DUNGEON_START, DUNGEON_EXIT, dungeonLayout, dungeonStages, dungeonBounds, dungeonCheckpoint, dungeonReturn, inDungeonPreparation } from '../src/dungeon.ts';
import { dungeonSpikeTraps, dungeonSpikePhase, dungeonSpikeContains, DUNGEON_SPIKE_CYCLE_MS, DUNGEON_SPIKE_SAFE_MS, DUNGEON_SPIKE_WARNING_MS, DUNGEON_SPIKE_DAMAGE_FRACTION } from '../src/dungeon-traps.ts';
import { canTraverse } from '../src/realm.ts';
import { combatCompanionStats } from '../src/combat-companions.ts';

for (const { id, storyQuestId } of DUNGEONS) {
  const layout = dungeonLayout(id), traps = dungeonSpikeTraps(id), bounds = dungeonBounds(id);
  assert.equal(dungeonSpikeTraps(id), traps, 'immutable bed layout is cached');
  if (storyQuestId && id !== 'veiled-sun-temple') assert.equal(traps.length, 0, `${id}: only source-authored trap chambers add spikes`);
  else assert(traps.length >= 2, `${id}: has spike beds`);
  assert.equal(new Set(traps.map(trap => trap.id)).size, traps.length);
  for (const trap of traps) {
    const room = layout.rooms.find(room => room.id === trap.roomId);
    assert(Math.abs(trap.x - room.x) + trap.width / 2 < room.width / 2);
    assert(Math.abs(trap.z - room.z) + trap.depth / 2 < room.depth / 2);
    assert(Math.abs(trap.x - room.x) - trap.width / 2 >= 2, 'clear north/south center aisle');
    assert(Math.abs(trap.z - room.z) - trap.depth / 2 >= 2, 'clear east/west center aisle');
    for (const point of [DUNGEON_START, DUNGEON_EXIT, dungeonCheckpoint(id), dungeonReturn(id), ...layout.portals.flatMap(portal => [portal, portal.destination])]) assert(!dungeonSpikeContains(trap, point, 4), `${id}: safe travel anchor`);
    for (const object of layout.objects) assert(!dungeonSpikeContains(trap, object, object.r + 2), `${id}: safe object approach`);
    for (const dx of [-trap.width / 2, 0, trap.width / 2]) for (const dz of [-trap.depth / 2, 0, trap.depth / 2]) {
      const point = { x: trap.x + dx, z: trap.z + dz };
      assert(canTraverse(point, point, layout.colliders, bounds), `${id}: bed clears walls, pillars and pools`);
      assert(!inDungeonPreparation(point, id));
    }
    const origin = DUNGEON_SPIKE_CYCLE_MS * 3 - trap.offsetMs;
    for (const [offset, expected] of [[0, 'safe'], [3999, 'safe'], [4000, 'warning'], [5599, 'warning'], [5600, 'active'], [7999, 'active'], [8000, 'safe']]) {
      const phase = dungeonSpikePhase(trap, origin + offset);
      assert.equal(phase.phase, expected); assert(phase.progress >= 0 && phase.progress < 1);
      assert.equal(phase.cycle, offset < 8000 ? 3 : 4);
    }
    assert(dungeonSpikeContains(trap, trap));
    assert(!dungeonSpikeContains(trap, { x: trap.x + trap.width / 2 + .5, z: trap.z }, .3));
  }
  // Treat every bed as permanently raised: a damage-free route must still reach all objectives.
  const solids = [...layout.colliders, ...traps.map(trap => ({ x: trap.x, z: trap.z, r: Math.hypot(trap.width, trap.depth) / 2, halfWidth: trap.width / 2, halfDepth: trap.depth / 2 }))];
  for (const room of layout.rooms) {
    const queue = [{ x: room.x, z: room.z }], seen = new Set([`${room.x},${room.z}`]);
    for (let index = 0; index < queue.length; index++) for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
      const point = { x: queue[index].x + dx, z: queue[index].z + dz }, key = `${point.x},${point.z}`;
      if (!seen.has(key) && canTraverse(queue[index], point, solids, bounds)) { seen.add(key); queue.push(point); }
    }
    const goals = [DUNGEON_START, DUNGEON_EXIT, dungeonCheckpoint(id), dungeonReturn(id), ...dungeonStages(id), ...layout.objects, ...layout.portals.flatMap(portal => [portal, portal.destination])]
      .filter(point => Math.abs(point.x - room.x) < room.width / 2 && Math.abs(point.z - room.z) < room.depth / 2);
    for (const goal of goals) assert(queue.some(point => Math.hypot(point.x - goal.x, point.z - goal.z) <= 3 && canTraverse(point, goal, solids, bounds)), `${id}: safe route to ${goal.id || 'portal/checkpoint'}`);
  }
}

// Execute the shipped server functions, including shield absorption and death handling.
const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = name => { const match = source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`)); assert(match, name); return match[0]; };
assert.match(extract('settleCombat'), /updateDungeonSpikeTraps\(now\)/, 'trap damage is wired into authoritative combat ticks');
const trap = dungeonSpikeTraps('veilhaven')[0], run = { id: 'test-run', kind: 'veilhaven', members: ['player'], completed: false };
const player = { id: 'player', level: 50, hp: 1000, maxHp: 1000, zone: 'hollow', x: trap.x, z: trap.z };
const pet = { x: trap.x, z: trap.z, saved: { hp: combatCompanionStats(50).maxHp, level: 50 } };
const session = { player, instanceId: run.id, gm: {}, shield: null, socket: {}, lifeStartedAt: 0 };
const sessions = new Map([[player.id, session]]), dungeons = new Map([[run.id, run]]), events = [], cancellations = [];
const context = { instantCombat: { combatActive: () => true }, sessions, dungeons, dungeonSpikeTraps, dungeonSpikePhase, dungeonSpikeContains, DUNGEON_SPIKE_DAMAGE_FRACTION, inDungeonPreparation, combatCompanionStats,
  dungeonPreparing: s => inDungeonPreparation(s.player, run.kind), liveSession: s => !s.disconnected, gmObserver: s => !!s.observer,
  activeCompanion: () => pet, combatStats: () => ({ defense: 20 }), storeBoostMultiplier: () => 1,
  arenaMode: () => false, worldPvp: () => false, knightDamageTaken() {}, triggerEdicts() {}, dirty() {}, broadcast: event => events.push(event), event: (...args) => events.push(args),
  cancelHits: () => cancellations.push('hits'), cancelGathering: () => cancellations.push('gathering'), cancelTradeFor: () => cancellations.push('trade'),
};
const api = runInNewContext(['combatDefense', 'applyDamage', 'damageCompanion', 'playerDied', 'stand', 'updateDungeonSpikeTraps'].map(extract).join('\n') + '\n({ updateDungeonSpikeTraps })', context);
const activeAt = DUNGEON_SPIKE_CYCLE_MS * 3 - trap.offsetMs + DUNGEON_SPIKE_SAFE_MS + DUNGEON_SPIKE_WARNING_MS;
api.updateDungeonSpikeTraps(activeAt - 1); assert.equal(player.hp, 1000, 'warning never hurts');
api.updateDungeonSpikeTraps(activeAt); assert.equal(player.hp, 900, 'server position on raised bed takes armor-reduced damage');
assert.equal(pet.saved.hp, combatCompanionStats(50).maxHp - (Math.round(combatCompanionStats(50).maxHp * .12) - combatCompanionStats(50).defense), 'companions use the same trap timing');
api.updateDungeonSpikeTraps(activeAt + 2000); assert.equal(player.hp, 900, 'only one hit from each bed in a cycle');
Object.assign(player, { x: trap.x + 3, hp: 1000 }); pet.x = player.x;
api.updateDungeonSpikeTraps(activeAt + 8000); assert.equal(player.hp, 1000, 'clear aisle stays safe beside raised spikes');
player.x = trap.x; api.updateDungeonSpikeTraps(activeAt + 9000); assert.equal(player.hp, 900, 'entering late into a raised bed still hurts');
session.shield = { amount: 1000, endsAt: activeAt + 30000 };
api.updateDungeonSpikeTraps(activeAt + 16000); assert.equal(player.hp, 900); assert.equal(session.shield.amount, 900, 'normal shields absorb trap damage');
for (const [target, key, value] of [[run, 'dream', { kind: 'nightmare' }], [run, 'completed', true], [session, 'observer', true], [session, 'zeppelin', {}], [session, 'disconnected', true], [session, 'instanceId', 'another-run']]) {
  const previous = target[key]; target[key] = value; session.dungeonSpikeHits = null; session.shield = null;
  api.updateDungeonSpikeTraps(activeAt + 24000); assert.equal(player.hp, 900, `${key}: no trap damage`); target[key] = previous;
}
for (const point of [DUNGEON_START, dungeonCheckpoint(run.kind), dungeonReturn(run.kind)]) {
  Object.assign(player, point); api.updateDungeonSpikeTraps(activeAt + 24000); assert.equal(player.hp, 900, 'arrival/checkpoint/return remain safe');
}
Object.assign(player, { x: trap.x, z: trap.z, hp: 1 }); session.dungeonSpikeHits = null;
api.updateDungeonSpikeTraps(activeAt + 24000); assert.equal(player.hp, 0); assert.equal(player.diedAt, activeAt + 24000);
assert.deepEqual(cancellations, ['hits', 'gathering', 'trade'], 'trap death uses the normal cleanup path');
assert(events.some(event => event.type === 'damage' && event.targetId === player.id), 'standard damage numbers are broadcast');
console.log('PASS all 13 dungeon trap policies/layouts, permanent safe routes, exact phase boundaries, server-only hits, late entry, one hit per cycle, armor/shields, companions, sanctuary/dream/completion protection and death cleanup.');
