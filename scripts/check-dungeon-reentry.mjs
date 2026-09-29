import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DUNGEONS, getDungeon, dungeonStages, dungeonLayout, dungeonCheckpoint, DUNGEON_START } from '../src/dungeon.ts';
import { newJump, moveJump } from '../src/jumping.ts';
import { installCollisionScene, disposeCollisionScene, updateCollisionSceneState, actorCanStand } from '../src/collision3d.ts';
import { collisionRouteAllowed, dungeonCollisionFlags } from '../src/collision-context.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';
import { createMovementCredit } from '../src/movement-credit.mjs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = name => { const match = source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`)); assert(match, name); return match[0]; };
const partyStart = source.indexOf("        const party = partyOf(p.id), targetId = message.type === 'partyLeave'");
const partyEnd = source.indexOf("      } else if (message.type === 'dungeonLeaderboard')", partyStart);
assert(partyStart > 0 && partyEnd > partyStart, 'party management message handler exists');
const partyHandler = `function partyMessage(session, message) { const p = session.player; const reject = text => event(session, 'error', text); ${source.slice(partyStart, partyEnd)} }`;
const functions = ['resetJump', 'leaveParty', 'removeDungeonEntities', 'leaveDungeon', 'leaveSession', 'enterDungeon', 'advanceStoryChamber', 'advanceDungeons'].map(extract).join('\n');
function fixture(size = 1, kind = 'cindercrypt', sceneKey) {
  let now = 10000, nextId = 0;
  const definition = getDungeon(kind), entrance = { ...definition.entrance, z: definition.entrance.z + 1, rotation: 0 };
  const members = Array.from({ length: size }, (_, index) => ({ id: `hero-${index}`, name: `Delver ${index}`, className: 'Ranger', level: 50 }));
  const run = { id: 'saved-run', kind: definition.id, partyId: size > 1 ? 'party' : null, partySize: size, roster: members,
    members: members.map(member => member.id), completed: false, checkpoint: true, wipes: 0, startedAt: 1000, elapsedMs: 9000, kills: 12,
    spawned: new Set(['threshold', 'crossing', 'west-seal', 'east-seal', 'confluence', 'throne']),
    cleared: new Set(['threshold', 'crossing', 'west-seal', 'east-seal', 'confluence']), activated: new Set(['verdant-seal', 'glacial-seal', 'sanctuary']), hazards: [] };
  const makeSession = member => ({ player: { ...member, ...dungeonCheckpoint(definition.id), hp: 37, maxHp: 100, xp: 123,
    zone: 'hollow', appearance: { className: member.className } }, socket: { readyState: 1 }, recordKey: member.id,
    instanceId: run.id, returnPosition: { ...entrance }, gm: {}, moveBudget: 0 });
  const heroes = members.map(makeSession), sessions = new Map(heroes.map(hero => [hero.player.id, hero]));
  const dungeons = new Map([[run.id, run]]), parties = new Map(size > 1 ? [['party', { id: 'party', leaderId: members[0].id, members: members.map(member => member.id) }]] : []);
  const lootDrops = new Map([['cache', { id: 'cache', ownerId: members[0].id, instanceId: run.id, expiresAt: 120000 }]]);
  const enemies = [{ id: 'dead-guard', instanceId: run.id, stageId: 'threshold', alive: false, hp: 0 },
    { id: 'boss', instanceId: run.id, stageId: 'throne', dungeonBoss: true, alive: true, hp: 200 }];
  const notices = [], context = { dungeons, sessions, parties, lootDrops, enemies, invitations: new Map(),
    Date: { now: () => now }, movementCredit: createMovementCredit(() => now), getDungeon, dungeonStages, dungeonLayout, dungeonCheckpoint, DUNGEON_START,
    partyOf: id => [...parties.values()].find(party => party.members.includes(id)),
    raids: { byInstance: () => null, detach: () => false }, arenaMode: () => false, arenaPartyChanged() {},
    instantCombat: { bySession: session => session?.instanceId?.startsWith('instant-combat-'),
      leave(session) { if (this.bySession(session)) session.instanceId = null; } },
    passengers: { leave() {} }, leaveZeppelin() {}, cancelTradeFor() {}, cancelGathering() {}, cancelHits() {},
    newJump, collisionScene: session => session.instanceId ? sceneKey : undefined, rememberStanding() {}, gmFlying: () => false, DEATH_ANIMATION_MS,
    lootTrace: { write() {} }, statistics: { observe() {} }, getZone: () => ({ name: 'Hollowmere' }),
    dirty() {}, removeLootDrop: id => lootDrops.delete(id), spawnDungeonStages() {}, dungeonEligibility: () => null,
    liveSession: session => !!session && session.socket.readyState === 1, combatSaveBlocked: () => false,
    canTraverse: () => true, WORLD_COLLIDERS: [], WORLD_BOUNDS: {}, distance: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    WALK_SPEED: 1, randomUUID: () => `new-run-${++nextId}`, hasGmRole: () => false,
    event: (_session, _kind, text) => notices.push(text), correction() {}, send() {}, snapshot: () => ({}),
  };
  const api = runInNewContext(`${functions}\n${partyHandler}\n({leaveDungeon,leaveSession,enterDungeon,advanceDungeons,partyMessage})`, context);
  const reconnect = hero => {
    const returned = { ...makeSession(members.find(member => member.id === hero.player.id)), player: hero.player, instanceId: null, returnPosition: null };
    sessions.set(returned.player.id, returned); return returned;
  };
  return { api, run, heroes, sessions, parties, dungeons, lootDrops, enemies, notices, reconnect, setNow: value => { now = value; } };
}

// Exercise the real resume and wipe paths with their authoritative landing reset.
// The sanctuary glyph used to enclose every member's capsule at this position.
for (const { id } of DUNGEONS.filter(dungeon => !dungeon.storyQuestId)) {
  const scene = `dungeon-${id}`, binary = readFileSync(new URL(`../public/collision/${scene}.bin`, import.meta.url));
  await installCollisionScene(scene, JSON.parse(readFileSync(new URL(`../public/collision/${scene}.json`, import.meta.url), 'utf8')), binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
  try {
    const f = fixture(2, id, scene), returned = [];
    updateCollisionSceneState(scene, dungeonCollisionFlags(id, f.run.activated, f.run.cleared, false, false, 10000));
    for (const hero of f.heroes) f.api.leaveSession({ session: hero });
    for (const hero of f.heroes) {
      const member = f.reconnect(hero); returned.push(member);
      assert.equal(f.api.enterDungeon(member, f.run.kind), true);
    }
    for (const phase of ['resume', 'wipe']) {
      if (phase === 'wipe') {
        for (const member of returned) member.player.hp = 0;
        f.api.advanceDungeons(10000); assert.equal(f.run.wipes, 1);
      }
      for (const member of returned) {
        const point = dungeonCheckpoint(f.run.kind);
        assert.deepEqual({ x: member.player.x, z: member.player.z }, point);
        assert(member.jump.grounded && actorCanStand(scene, point.x, member.jump.y, point.z), `${id} ${phase}: actual server reset lands on clear support`);
        for (let direction = 0; direction < 8; direction++) {
          const angle = direction * Math.PI / 4, to = { x: point.x + Math.cos(angle), z: point.z + Math.sin(angle) };
          assert(collisionRouteAllowed(point, to, f.run.id, id) && moveJump({ ...member.jump }, point, to, true, scene), `${id} ${phase}: party member can walk away in direction ${direction}`);
        }
        member.player.x++;
      }
    }
  } finally { disposeCollisionScene(scene); }
}

{
  const f = fixture(), hero = f.heroes[0], enemyIds = f.enemies.map(enemy => enemy.id), loot = f.lootDrops.get('cache');
  f.api.leaveDungeon(hero);
  assert(f.dungeons.has(f.run.id), 'leaving a begun solo run preserves cleared rooms');
  f.setNow(12000); f.api.advanceDungeons(12000);
  assert.equal(f.api.enterDungeon(hero, f.run.kind), true);
  assert.equal(hero.instanceId, f.run.id); assert.deepEqual(f.enemies.map(enemy => enemy.id), enemyIds);
  assert(f.run.cleared.has('threshold') && f.run.activated.has('sanctuary'));
  assert.deepEqual({ x: hero.player.x, z: hero.player.z }, dungeonCheckpoint(f.run.kind));
  assert.equal(hero.player.hp, 37, 're-entry never heals or revives'); assert.equal(f.run.partySize, 1);
  assert.equal(f.run.startedAt, 1000); f.api.advanceDungeons(12000); assert.equal(f.run.elapsedMs, 11000, 'leaving cannot pause the original timer');
  assert.equal(f.lootDrops.get('cache'), loot); assert.equal(loot.expiresAt, 120000, 're-entry never extends loot expiry');
  assert(f.notices.some(text => /this realm for 10 minutes/.test(text)), 'entry explains the bounded same-realm lifetime');
  f.api.enterDungeon(hero, f.run.kind); assert.equal(f.run.members.length, 1, 'duplicate entry cannot duplicate membership');
}
{
  const f = fixture(2);
  for (const hero of f.heroes) f.api.leaveSession({ session: hero });
  assert.equal(f.sessions.size, 0); assert.equal(f.parties.size, 0, 'ordinary disconnect still dissolves the old party');
  assert(f.dungeons.has(f.run.id), 'whole-party disconnect retains the run');
  f.api.advanceDungeons(10000); assert(f.dungeons.has(f.run.id), 'empty tick does not discard the saved run');
  for (const hero of f.heroes) {
    const returned = f.reconnect(hero); assert.equal(f.api.enterDungeon(returned, f.run.kind), true);
    assert.equal(returned.instanceId, f.run.id); assert.equal(returned.player.hp, 37);
  }
  assert.equal(f.run.partySize, 2); assert.equal(f.run.roster.length, 2); assert.equal(f.run.members.length, 2);
}
{
  const f = fixture(2), hero = f.heroes[0];
  for (const member of f.heroes) f.api.leaveDungeon(member);
  f.run.abandoned = new Set([hero.player.id]);
  assert.equal(f.api.enterDungeon(hero, f.run.kind), undefined, 'an explicitly removed member cannot return through its former party');
  f.run.abandoned.clear(); f.parties.get('party').members.push('outsider');
  assert.equal(f.api.enterDungeon(hero, f.run.kind), undefined, 'a changed party cannot merge an outsider into a saved run');
  assert.equal(f.run.members.length, 0); assert.equal(f.run.roster.length, 2);
}
for (const type of ['partyLeave', 'partyKick']) {
  const f = fixture(2), original = f.heroes[0];
  for (const member of f.heroes) f.api.leaveSession({ session: member });
  const hero = f.reconnect(original), outsider = { player: { id: 'new-leader' } };
  f.parties.set('new-party', { id: 'new-party', leaderId: outsider.player.id, members: [outsider.player.id, hero.player.id] });
  assert.equal(f.api.enterDungeon(hero, f.run.kind), undefined, 'an unrelated new party must leave before resuming');
  f.api.partyMessage(type === 'partyLeave' ? hero : outsider, { type, targetId: hero.player.id });
  assert(!f.run.abandoned?.has(hero.player.id), `${type} in an unrelated party cannot revoke the original run`);
  assert.equal(f.api.enterDungeon(hero, f.run.kind), true, `${type} lets the original adventurer resume after leaving the new party`);
  assert.equal(hero.instanceId, f.run.id); assert.equal(hero.player.hp, 37); assert.equal(f.run.partySize, 2);
}
for (const individual of [false, true]) for (const kind of ['cindercrypt', 'rootvault']) {
  const f = fixture(), original = f.heroes[0]; f.api.leaveSession({ session: original });
  const hero = f.reconnect(original), entrance = getDungeon(kind).entrance;
  Object.assign(hero.player, entrance);
  const leader = { ...hero, player: { ...hero.player, id: 'new-leader' }, recordKey: 'new-leader' };
  f.sessions.set(leader.player.id, leader);
  f.parties.set('new-party', { id: 'new-party', leaderId: leader.player.id, members: [leader.player.id, hero.player.id] });
  assert.equal(f.api.enterDungeon(leader, kind, individual), undefined, 'a new leader cannot create an overlapping roster for a member with a retained run');
  assert.equal(f.dungeons.size, 1); assert.equal(hero.instanceId, null); assert.equal(leader.instanceId, null);
  f.api.partyMessage(hero, { type: 'partyLeave' });
  Object.assign(hero.player, getDungeon(f.run.kind).entrance);
  assert.equal(f.api.enterDungeon(hero, f.run.kind), true, 'the rejected group entry preserves the member’s original run');
}
for (const released of ['abandoned', 'expired']) {
  const f = fixture(), hero = f.heroes[0]; f.api.leaveDungeon(hero);
  if (released === 'abandoned') f.run.abandoned = new Set([hero.player.id]); else f.setNow(610000);
  const leader = { ...hero, player: { ...hero.player, id: 'new-leader' }, recordKey: 'new-leader' };
  f.sessions.set(leader.player.id, leader);
  f.parties.set('new-party', { id: 'new-party', leaderId: leader.player.id, members: [leader.player.id, hero.player.id] });
  assert.equal(f.api.enterDungeon(leader, f.run.kind), true, `${released} rights do not block a new group run`);
  assert.notEqual(hero.instanceId, f.run.id); assert.equal(hero.instanceId, leader.instanceId);
}
for (const type of ['partyLeave', 'partyKick']) {
  const f = fixture(2), target = f.heroes[1];
  f.api.leaveDungeon(target);
  f.api.partyMessage(type === 'partyLeave' ? target : f.heroes[0], { type, targetId: target.player.id });
  assert(f.run.abandoned?.has(target.player.id), `${type} from the owning party relinquishes its retained run`);
}
for (const type of ['partyLeave', 'partyKick']) {
  const f = fixture(2), target = f.heroes[1];
  f.api.leaveDungeon(target);
  target.instanceId = 'instant-combat-independent';
  f.api.partyMessage(type === 'partyLeave' ? target : f.heroes[0], { type, targetId: target.player.id });
  assert.equal(target.instanceId, 'instant-combat-independent', `${type} cannot eject an independently registered event participant`);
  assert(f.run.abandoned?.has(target.player.id), `${type} still relinquishes the former party dungeon`);
  assert(!f.parties.get('party')?.members.includes(target.player.id));
}
{
  const f = fixture(), hero = f.heroes[0]; f.api.leaveDungeon(hero);
  f.setNow(609999); f.api.advanceDungeons(609999); assert(f.dungeons.has(f.run.id), 'grace lasts ten minutes after the last departure');
  f.setNow(610000); f.api.advanceDungeons(610000);
  assert.equal(f.dungeons.size, 0); assert.equal(f.enemies.length, 0); assert.equal(f.lootDrops.size, 0, 'expired runs clean up their entities and loot');
  assert.equal(f.api.enterDungeon(hero, f.run.kind), true); assert.notEqual(hero.instanceId, f.run.id, 'after expiry entry creates a genuinely new run');
}
{
  const f = fixture(), hero = f.heroes[0];
  f.run.completed = true; f.run.results = new Map([[hero.player.id, { lootId: 'cache', xp: 50 }]]);
  f.api.leaveSession({ session: hero });
  assert(f.dungeons.has(f.run.id), 'disconnect preserves completed results');
  assert.equal(f.lootDrops.get('cache').instanceId, f.run.id, 'disconnect leaves rewards in the retained run');
  assert.equal(f.lootDrops.get('cache').expiresAt, 120000, 'disconnect does not alter reward expiry');
  const returned = f.reconnect(hero);
  assert.equal(f.api.enterDungeon(returned, f.run.kind), true);
  assert.equal(f.run.results.get(hero.player.id).lootId, 'cache'); assert.equal(returned.player.xp, 123, 'recovering a result never pays completion XP again');
  f.api.advanceDungeons(10000); assert.equal(f.lootDrops.size, 1, 'completed re-entry never rerolls rewards');
  f.lootDrops.delete('cache'); f.api.leaveDungeon(returned);
  assert.equal(f.dungeons.size, 0, 'collected completed runs close after voluntary final exit');
}
for (const rewards of ['collected', 'unclaimed', 'partial']) {
  const f = fixture(), hero = f.heroes[0], returnedPosition = { ...hero.returnPosition }, drop = f.lootDrops.get('cache');
  const items = [{ id: 'relic-stack', itemId: 'relic', quantity: 5 }, { id: 'equipment', itemId: 'sword', quantity: 1 }];
  Object.assign(drop, { enemyId: `${f.run.id}-completion`, zone: 'hollow', x: hero.player.x, z: hero.player.z,
    gold: 0, relic: 0, items: rewards === 'partial' ? [{ ...items[0], quantity: 2 }] : items, expiresAt: Number.MAX_SAFE_INTEGER });
  const originalDrop = structuredClone(drop);
  f.run.completed = true; f.run.results = new Map([[hero.player.id, { lootId: drop.id, xp: 50, items: structuredClone(items) }]]);
  if (rewards === 'collected') f.lootDrops.delete(drop.id);
  f.api.leaveDungeon(hero);
  assert.equal(f.dungeons.size, 0, `${rewards}: voluntary final exit closes the completed dungeon immediately`);
  assert.equal(f.enemies.length, 0, `${rewards}: the old dungeon enemies are removed`);
  assert.equal(hero.instanceId, null); assert.equal(hero.player.xp, 123);
  if (rewards === 'collected') assert.equal(f.lootDrops.size, 0, 'collected rewards are never recreated');
  else {
    assert.equal(f.lootDrops.get(drop.id), drop, `${rewards}: the original reward drop survives dungeon cleanup`);
    assert.deepEqual(drop, { ...originalDrop, instanceId: null, sourceObjectId: drop.enemyId,
      zone: returnedPosition.zone, x: returnedPosition.x, z: returnedPosition.z, expiresAt: 310000 },
    `${rewards}: only remaining personal rewards move to a five-minute chest at the entrance`);
  }
  assert.equal(f.api.enterDungeon(hero, f.run.kind), true);
  assert.notEqual(hero.instanceId, f.run.id, `${rewards}: entering again creates a new dungeon`);
  const next = f.dungeons.get(hero.instanceId);
  assert.equal(next.completed, false); assert.equal(next.checkpoint, false); assert.equal(next.startedAt, 0);
  assert.equal(next.cleared.size, 0); assert.equal(next.activated.size, 0); assert.equal(next.results, undefined);
  assert.deepEqual({ x: hero.player.x, z: hero.player.z }, DUNGEON_START);
  assert.equal(hero.player.xp, 123, `${rewards}: restarting never duplicates completion XP`);
  if (rewards !== 'collected') assert.deepEqual(drop.items, originalDrop.items, 'starting a new run never restores already collected items');
}
{
  const f = fixture(2), [first, second] = f.heroes, firstDrop = f.lootDrops.get('cache');
  Object.assign(firstDrop, { enemyId: `${f.run.id}-completion`, items: [{ id: 'first-relic', itemId: 'relic', quantity: 3 }], expiresAt: Number.MAX_SAFE_INTEGER });
  const secondDrop = { ...firstDrop, id: 'second-cache', ownerId: second.player.id, items: [{ id: 'second-relic', itemId: 'relic', quantity: 4 }] };
  f.lootDrops.set(secondDrop.id, secondDrop);
  f.run.completed = true; f.run.results = new Map([[first.player.id, { lootId: firstDrop.id, xp: 50 }], [second.player.id, { lootId: secondDrop.id, xp: 50 }]]);
  f.api.leaveDungeon(first);
  assert(f.dungeons.has(f.run.id), 'a completed party run stays available to members still inside');
  assert.equal(firstDrop.instanceId, null); assert.equal(secondDrop.instanceId, f.run.id, 'leaving moves only the departing player’s reward');
  const firstRewardAtEntrance = structuredClone(firstDrop);
  assert.equal(f.api.enterDungeon(first, f.run.kind), undefined, 'a finished member cannot re-enter the cleared party run');
  assert.equal(first.instanceId, null);
  f.api.leaveSession({ session: second });
  assert(f.dungeons.has(f.run.id), 'a disconnect after another member leaves preserves the remaining result');
  assert.equal(secondDrop.instanceId, f.run.id); assert.equal(secondDrop.expiresAt, Number.MAX_SAFE_INTEGER);
  f.setNow(20000);
  const returned = f.reconnect(second);
  assert.equal(f.api.enterDungeon(returned, f.run.kind), true, 'the disconnected member can resume completed results');
  assert.equal(returned.instanceId, f.run.id); assert.equal(returned.player.xp, 123);
  f.api.advanceDungeons(20000); assert.equal(f.lootDrops.size, 2, 'party recovery never rerolls either reward');
  f.api.leaveDungeon(returned);
  assert.equal(f.dungeons.size, 0, 'the final deliberate party departure closes the completed run');
  assert.equal(f.lootDrops.get(firstDrop.id), firstDrop); assert.equal(f.lootDrops.get(secondDrop.id), secondDrop);
  assert.deepEqual(firstDrop, firstRewardAtEntrance, 'a later party exit never moves or extends an earlier reward');
  assert.equal(secondDrop.instanceId, null); assert.equal(secondDrop.expiresAt, 320000);
  assert.equal(f.api.enterDungeon(first, f.run.kind), true, 'the party can start a new run after the last deliberate exit');
  assert.notEqual(first.instanceId, f.run.id); assert.equal(f.dungeons.get(first.instanceId).completed, false);
}
for (const type of ['partyLeave', 'partyKick']) {
  const f = fixture(2), [first, second] = f.heroes, reward = f.lootDrops.get('cache');
  f.run.completed = true; f.run.results = new Map([[first.player.id, { lootId: reward.id }], [second.player.id, { lootId: 'collected' }]]);
  f.api.leaveDungeon(first); f.api.leaveSession({ session: second });
  const returned = f.reconnect(second);
  f.parties.get('party').members.push(returned.player.id);
  f.api.partyMessage(type === 'partyLeave' ? returned : first, { type, targetId: returned.player.id });
  assert(f.run.abandoned.has(returned.player.id), `${type}: the disconnected recipient forfeits the retained run from outside`);
  f.api.advanceDungeons(10001);
  assert.equal(f.dungeons.size, 0, `${type}: the next tick closes an empty completed run once every recipient has left or forfeited`);
  assert.equal(f.lootDrops.get(reward.id), reward, 'cleanup preserves completion rewards already moved to the entrance');
  assert.equal(f.api.enterDungeon(first, f.run.kind), true, `${type}: forfeited re-entry cannot strand finished members for ten minutes`);
  assert.notEqual(first.instanceId, f.run.id);
}
{
  const f = fixture(), hero = f.heroes[0]; hero.player.hp = 0; f.api.leaveSession({ session: hero });
  const returned = f.reconnect(hero); assert.equal(f.api.enterDungeon(returned, f.run.kind), undefined);
  assert.equal(returned.player.hp, 0, 'dead reconnect cannot provide a free revive');
  f.api.advanceDungeons(10000); assert.equal(f.run.wipes, 0, 'an empty run cannot manufacture a party wipe or healing');
}
console.log('PASS dungeon re-entry: same-run solo/whole-party recovery, all seven physical checkpoint resume/wipe landings and eight-direction departures, original roster and scale, unchanged HP and loot expiry, elapsed timer, ten-minute cleanup, exclusions, completed solo/party restart with remaining rewards preserved, disconnect recovery, and no disconnect revive.');
