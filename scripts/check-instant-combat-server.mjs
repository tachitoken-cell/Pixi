import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createInstantCombatController } from '../src/instant-combat-server.mjs';
import { INSTANT_COMBAT, INSTANT_COMBAT_WAVES, INSTANT_COMBAT_BRACKETS, INSTANT_COMBAT_CREATURES, instantCombatBracket, instantCombatEncounter, instantCombatSchedule, instantCombatWaveReward, isInstantCombatInstance } from '../src/instant-combat.ts';
import { INSTANT_COMBAT_SKILLS } from '../src/instant-combat-skills.ts';
import { SPELLS, SPELL_EFFECT_IDS } from '../src/spells.ts';
import { instantCombatMap, instantCombatPosition } from '../src/instant-combat-maps.ts';
import { findPath } from '../src/navigation.ts';
import { WALK_SPEED } from '../src/travel.ts';
import { createMovementCredit } from '../src/movement-credit.mjs';
import { canTraverse } from '../src/realm.ts';
import { raidHazardContains } from '../src/raid.ts';
import { MONSTERS, BASIC_ATTACK, monsterStatsAtLevel, monsterLevelScale, monsterPursuitSpeed, basicAttackRange, basicAttackCooldown } from '../src/bestiary.ts';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const applyDamageSource = source.match(/  function applyDamage\([^]*?\n  \}/)[0];
assert.deepEqual(INSTANT_COMBAT.defenseBypass, [.3, .4, .5, .6, .7]);

function fixture(start = Date.UTC(2026, 8, 27, 1, 54, 59, 999)) {
  let now = start, sequence = 0, available = true;
  const sessions = new Map(), enemies = [], events = [], damage = [], rewards = [], removedRewards = [];
  const controller = createInstantCombatController({ now, sessions, enemies,
    live: session => !!session?.online && sessions.get(session.player.id) === session,
    available: () => available, entryError: session => session.blocked || (session.player.hp <= 0 ? 'Must be alive.' : null),
    event: (session, text) => events.push({ id: session.player.id, text }), dirty() {}, cancel() {}, cancelEnemy() {}, correct() {},
    rewardWave: (run, members, now, expiresAt) => rewards.push({ id: run.id, round: run.round, members: members.map(member => member.player.id), now, expiresAt }),
    removeRewards: (instanceId, ownerId) => removedRewards.push({ instanceId, ownerId }),
    damage: (session, amount, at) => { damage.push({ id: session.player.id, amount, at }); session.player.hp = Math.max(0, session.player.hp - amount); },
    prepare: session => { if (session.returnPosition) Object.assign(session.player, session.returnPosition); session.instanceId = null; },
  });
  const player = (level = 16) => {
    const id = `player-${sequence++}`, session = { online: true, instanceId: null, player: { id, level, hp: 100, maxHp: 100,
      x: 245, z: 127, rotation: .25, zone: 'greenwood', gold: 10, xp: 5, inventory: { potion: 2 } } };
    sessions.set(id, session); return session;
  };
  const act = (session, type, extra = {}) => controller.handle(session, { type, ...extra }, now);
  const time = at => { now = at; controller.tick(now); };
  const step = ms => time(now + ms);
  const state = session => controller.publicState(session, now);
  const applyDamage = runInNewContext(`(${applyDamageSource})`, { instantCombat: controller, sessions, arenaMode: () => false, triggerEdicts() {}, broadcast() {} });
  const hit = (enemy, amount = Number.MAX_SAFE_INTEGER, at = now) => {
    applyDamage(enemy, 'enemy', amount, enemy.instanceId, at);
    if (enemy.hp <= 0) { enemy.alive = false; controller.enemyKilled(enemy); }
  };
  return { controller, sessions, enemies, events, damage, rewards, removedRewards, player, act, time, step, state, hit,
    get now() { return now; }, unavailable: () => { available = false; } };
}
const walkable = (f, session, point = session.player) => {
  const map = instantCombatMap(f.state(session).run.mapId);
  return canTraverse(point, point, map.colliders, map.bounds);
};
const arenaPoints = [0,6,12,18,24,28].flatMap(radius=>Array.from({length:32},(_,i)=>({x:Math.sin(i*Math.PI/16)*radius,z:Math.cos(i*Math.PI/16)*radius})));
function clearObjective(f, session) {
  const run = f.controller.bySession(session), kind = run.mechanic.kind, startedAt = f.now;
  const team = () => [...run.members].map(id => f.sessions.get(id)).filter(s => s?.instanceId === run.id);
  while (run.mechanic && f.now - startedAt < 45000) {
    const m = run.mechanic;
    if (kind === 'anchors' || kind === 'brood') {
      const actors = f.enemies.filter(enemy => enemy.instanceId === run.id && enemy !== run.boss && enemy.alive);
      assert(actors.length); assert(actors.every(enemy => walkable(f, session, enemy)));
      for (const actor of actors) f.hit(actor);
      f.step(1);
    } else if (kind === 'rifts' || kind === 'notes') {
      const rune = run.runes.find(rune => rune.charge < 1 && (kind !== 'notes' || rune.active));
      assert(walkable(f, session, rune));
      Object.assign(session.player, { x: rune.x, z: rune.z });
      f.step(100);
    } else if (kind === 'stomps') {
      Object.assign(session.player, { x: run.runes[0].x, z: run.runes[0].z });
      f.time(m.nextAt);
    } else if (kind === 'webs') {
      for (const rune of run.runes) {
        const member = team().find(s => s.player.id === rune.playerId);
        const point = arenaPoints.find(point => walkable(f, session, point) && Math.hypot(point.x-rune.x,point.z-rune.z)>=6);
        assert(point); Object.assign(member.player, point);
      }
      f.step(100);
    } else if (kind === 'gaze') {
      for (const member of team()) {
        member.player.rotation = Math.atan2(member.player.x-run.boss.x, member.player.z-run.boss.z);
      }
      f.time(m.nextAt);
    } else if (kind === 'charge') {
      const target = team().find(member => member.player.id === m.targetId);
      const pillar = f.enemies.find(enemy => enemy.id === m.pillarId), hp = pillar.hp;
      f.hit(pillar); assert.equal(pillar.hp, hp, 'players cannot bypass the charge objective by attacking a pillar');
      Object.assign(target.player, { x: run.runes[0].x, z: run.runes[0].z });
      f.time(m.nextAt);
      assert.equal(m.stage, 'impact');
      const hazard = run.hazards.find(hazard => hazard.id === m.hazardId);
      assert(raidHazardContains(hazard, pillar), 'reachable bait guidance aims the charge through the pillar');
      assert.equal(hazard.impactAt-hazard.startedAt,3000,'charge locks for a full readable three-second dodge');
      for (const member of team()) Object.assign(member.player, { x: 0, z: 0 });
      const safe = arenaPoints.find(point => walkable(f, session, point) && !raidHazardContains(hazard,point));
      assert(safe); for (const member of team()) Object.assign(member.player,safe);
      f.time(m.nextAt);
    }
  }
  assert.equal(run.mechanic, null, `${kind}: mandatory objective can be completed`);
}
function clearBoss(f, session) {
  const run = f.controller.bySession(session), boss = run.boss;
  for (const [index, fraction] of [.7, .35].entries()) {
    f.hit(boss); assert.equal(boss.hp, Math.floor(boss.maxHp * fraction), 'burst stops at mandatory threshold');
    f.hit(boss); assert.equal(boss.hp, Math.floor(boss.maxHp * fraction), 'same-tick burst cannot skip threshold');
    f.step(1); assert.equal(run.bossPhase, 'mechanic');
    f.hit(boss); assert.equal(boss.hp, Math.floor(boss.maxHp * fraction), 'shield blocks all shared damage paths');
    clearObjective(f, session);
    assert.equal(run.bossPhase,index ? 'final' : 'combat'); assert.equal(run.mechanicEndsAt,0);
  }
  f.hit(boss); f.step(1); assert.equal(run.phase, 'completed');
  assert.equal(run.hazards.length, 0); assert.equal(run.runes.length, 0);
}

const f = fixture(), early = f.player();
const schedule = instantCombatSchedule(f.now);
f.act(early, 'instantCombatRegister'); assert.equal(f.state(early).registered, false, 'closed before opening boundary');
f.step(1); assert.equal(f.state(early).registrationOpen, true);
assert.equal(f.events.filter(event => event.text.includes('begins in 5 minutes')).length, 1);
f.step(100); assert.equal(f.events.filter(event => event.text.includes('begins in 5 minutes')).length, 1, 'one warning per event');
f.act(early, 'instantCombatRegister', { instanceId: 'forged' }); assert.equal(f.state(early).registered, false, 'strict fields');
f.act(early, 'instantCombatRegister'); f.act(early, 'instantCombatRegister'); assert.equal(f.state(early).registeredCount, 1, 'idempotent signup');
f.act(early, 'instantCombatUnregister'); assert.equal(f.state(early).registeredCount, 0);
assert.equal(INSTANT_COMBAT_BRACKETS.length, 3);
assert.equal(instantCombatBracket(15), undefined);
assert.equal(instantCombatBracket(16).id, '16-30');
const underlevel = f.player(15); f.act(underlevel, 'instantCombatRegister'); assert.equal(f.state(underlevel).registered, false, 'level 15 cannot register');
const levels = [16, 30, 31, 45, 46, 60], team = levels.map(level => f.player(level));
for (const session of team) f.act(session, 'instantCombatRegister');
const changing = f.player(30); f.act(changing, 'instantCombatRegister'); changing.player.level = 31;
const becameUnderlevel = f.player(16); f.act(becameUnderlevel, 'instantCombatRegister'); becameUnderlevel.player.level = 15;
const invalid = f.player(61); f.act(invalid, 'instantCombatRegister'); assert.equal(f.state(invalid).registered, false);
const becameInvalid = f.player(60); f.act(becameInvalid, 'instantCombatRegister'); becameInvalid.player.level = 61;
const dead = f.player(), busy = f.player(), disconnected = f.player(), traveller = f.player();
for (const session of [dead, busy, disconnected, traveller]) f.act(session, 'instantCombatRegister');
dead.player.hp = 0; busy.blocked = 'Pending save.'; disconnected.online = false;
traveller.instanceId = 'old-dungeon'; traveller.returnPosition = { x: 404, z: 303, zone: 'amberwild', rotation: 1 };
f.time(schedule.startsAt - 1); assert.equal(f.state(team[0]).registered, true);
f.time(schedule.startsAt); assert.equal(f.state(team[0]).registrationOpen, false);
for (let index = 0; index < team.length; index++) {
  assert.equal(f.state(team[index]).run.bracketId, ['16-30', '31-45', '46-60'][Math.floor(index / 2)]);
  if (index % 2) assert.equal(team[index].instanceId, team[index - 1].instanceId, 'one instance per matching small bracket');
}
assert.equal(f.state(changing).run.bracketId, '31-45', 'current level determines locked bracket');
assert([dead, busy, disconnected, becameInvalid, becameUnderlevel, underlevel].every(session => !session.instanceId), 'entry is revalidated');
assert.deepEqual(traveller.returnPosition, { x: 404, z: 303, zone: 'amberwild', rotation: 1, standingPosition: undefined }, 'nested instance exits to world before storing return');
assert.equal(f.state(team[0]).registered, false);
assert.equal(f.state(team[0]).startsAt, schedule.startsAt + INSTANT_COMBAT.intervalMs);
assert.equal(f.state(team[0]).run.phaseEndsAt, schedule.startsAt + 90000);
f.act(early, 'instantCombatRegister'); assert.equal(early.instanceId, null, 'deadline input cannot enter late');
assert.equal(f.controller.combatActive(team[0].instanceId), false, 'preparation prevents combat');
assert(f.controller.allies(team[0], team[1])); assert(!f.controller.allies(team[0], team[2]));
assert.doesNotThrow(() => JSON.stringify(f.state(team[0])));
for (const session of [...team, changing, traveller]) assert(walkable(f, session), 'valid entry positions');
f.step(89999); assert.equal(f.enemies.length, 0);
f.step(1); assert.equal(f.state(team[0]).run.phase, 'fighting'); assert.equal(f.state(team[0]).run.round, 1);
for (const enemy of f.enemies) {
  assert(walkable(f, f.sessions.get([...f.controller.byInstance(enemy.instanceId).members][0]), enemy), 'valid wave spawns');
  assert(f.controller.enemyKilled(enemy), 'event kills skip standard economy rewards');
}
assert(!f.controller.enemyKilled({ kind: 'moss-slime' }));
const firstId = team[0].instanceId;
const preserved = structuredClone({ gold: team[0].player.gold, xp: team[0].player.xp, inventory: team[0].player.inventory });
for (let round = 1; round <= 4; round++) {
  for (let subwave = 1; subwave <= 3; subwave++) {
    assert.equal(f.state(team[0]).run.subwave,subwave);assert.equal(f.state(team[0]).run.totalSubwaves,3);
    for (const enemy of f.enemies) if (enemy.instanceId === firstId) { enemy.hp = 0; enemy.alive = false; }
    if(round===1&&subwave===3)team[1].player.hp=0;
    f.step(1);
    if(subwave<3){assert.equal(f.state(team[0]).run.phase,'fighting');assert.equal(f.rewards.filter(reward=>reward.id===firstId).length,round-1,'subwaves never grant rewards');}
  }
  assert.equal(f.state(team[0]).run.phase, 'intermission');
  f.step(INSTANT_COMBAT.roundBreakMs); assert.equal(f.state(team[0]).run.round, round + 1);
}
assert(!f.rewards[0].members.includes(team[1].player.id),'a player who falls on the final group receives no cleared-round reward');
for(let subwave=1;subwave<3;subwave++){
  assert.equal(f.state(team[0]).run.subwave,subwave);assert.equal(f.state(team[0]).run.boss,null,'the final boss waits for two trash groups');
  for(const enemy of f.enemies)if(enemy.instanceId===firstId){enemy.hp=0;enemy.alive=false;}
  f.step(1);assert.equal(f.rewards.filter(reward=>reward.id===firstId).length,4);
}
assert.equal(f.state(team[0]).run.subwave,3);
clearBoss(f, team[0]);
assert.deepEqual({ gold: team[0].player.gold, xp: team[0].player.xp, inventory: team[0].player.inventory }, preserved);
assert.deepEqual(f.rewards.filter(reward => reward.id === firstId).map(reward => [reward.round, reward.expiresAt - reward.now]), [[1,20000],[2,20000],[3,20000],[4,20000],[5,30000]], 'each cleared wave delegates exactly one timed reward batch');
assert(!f.enemies.some(enemy => enemy.instanceId === firstId), 'completion removes actors');
f.step(INSTANT_COMBAT.returnMs); assert.equal(team[0].instanceId, null); assert.equal(f.state(team[0]).run, null);
assert.equal(team[0].player.x, 245); assert.equal(team[0].player.z, 127);
team[2].player.hp = 0; f.step(1); assert.equal(team[2].instanceId, null); assert.equal(team[2].player.hp, 100, 'death returns alive without re-entry');
team[3].online = false; f.step(1); assert.equal(team[3].instanceId, null, 'disconnect exits');
team[3].online = true; assert.equal(f.state(team[3]).run, null, 'reconnect has no membership');
f.act(team[4], 'instantCombatLeave'); assert.equal(team[4].instanceId, null);
f.time(schedule.startsAt + INSTANT_COMBAT.maxDurationMs); assert.equal(f.state(team[5]).run.phase, 'failed');
f.step(INSTANT_COMBAT.returnMs); assert(team.every(session => session.instanceId === null)); assert.equal(f.enemies.length, 0);

for (const count of [20, 40, 60, 41]) {
  const f = fixture(); f.step(1);
  const team = Array.from({ length: count }, () => f.player(60));
  for (const session of team) f.act(session, 'instantCombatRegister');
  f.time(instantCombatSchedule(f.now).startsAt);
  const ids = new Set(team.map(session => session.instanceId));
  assert.equal(ids.size, Math.ceil(count / 20));
  assert(team.every(session => f.state(session).run.members <= 20));
  f.step(INSTANT_COMBAT.preparationMs); assert(f.enemies.length);
  f.controller.stop(); assert.equal(f.enemies.length, 0); assert(team.every(session => !session.instanceId && !session.returnPosition));
}
const restart = fixture(), queued = restart.player(); restart.step(1); restart.act(queued, 'instantCombatRegister');
restart.unavailable(); restart.time(instantCombatSchedule(restart.now).startsAt);
assert.equal(queued.instanceId, null); assert.equal(restart.state(queued).registered, false, 'shutdown does not launch an event');
// GM events use the same voluntary signup and preparation, without shifting the even-UTC cadence.
{
  const f=fixture(Date.UTC(2026,8,27,1,30)),member=f.player(),declined=f.player(),scheduled=f.state(member).startsAt;
  const openedAt=f.now;
  assert.equal(f.controller.startRegistration(f.now),null);
  assert.equal(f.state(member).startsAt,openedAt+INSTANT_COMBAT.registrationMs);
  assert(f.state(member).registrationOpen);assert(!member.instanceId&&!declined.instanceId,'GM start never forces entry');
  const manualStart=f.state(member).startsAt;
  assert.match(f.controller.startRegistration(f.now),/already open/);
  assert.equal(f.state(member).startsAt,manualStart,'duplicate command cannot restart or extend signup');
  assert.equal(f.events.filter(event=>event.id===member.player.id&&event.text.includes('begins in 5 minutes')).length,1);
  f.act(member,'instantCombatRegister');f.time(manualStart-1);assert(!member.instanceId);
  f.time(manualStart);assert.equal(f.state(member).run.phase,'preparing');assert.equal(f.state(member).run.phaseEndsAt,manualStart+INSTANT_COMBAT.preparationMs);
  assert.equal(f.state(member).startsAt,scheduled,'normal scheduled event keeps its original UTC slot');
  assert.equal(declined.instanceId,null,'players who decline stay in the world');
  assert.match(f.controller.startRegistration(f.now),/already active/);
  f.controller.leave(member);f.time(scheduled-INSTANT_COMBAT.registrationMs);
  assert(f.state(member).registrationOpen);assert.match(f.controller.startRegistration(f.now),/already open/);
  assert.equal(f.events.filter(event=>event.id===member.player.id&&event.text.includes('begins in 5 minutes')).length,2,'normal five-minute notice still fires');
  for(let event=0;event<4;event++){
    f.time(scheduled+event*INSTANT_COMBAT.intervalMs);
    assert.equal(f.state(member).startsAt,scheduled+(event+1)*INSTANT_COMBAT.intervalMs,'manual start never drifts the two-hour cadence');
  }
}
for(const minutes of [4,5,9]){
  const f=fixture(Date.UTC(2026,8,27,2)-minutes*60000),member=f.player(),scheduled=f.state(member).startsAt;
  assert(f.controller.startRegistration(f.now),'manual signup cannot overlap scheduled signup');
  assert.equal(f.state(member).startsAt,scheduled);
}
{
  const f=fixture(Date.UTC(2026,8,27,1,50)),member=f.player();
  assert.equal(f.controller.startRegistration(f.now),null,'adjacent nonoverlapping signup windows are allowed');
  f.time(Date.UTC(2026,8,27,1,55));assert(f.state(member).registrationOpen);
  assert.equal(f.state(member).startsAt,Date.UTC(2026,8,27,2),'scheduled signup gets its full five minutes');
}
{
  const f=fixture(Date.UTC(2026,8,27,1,30)),member=f.player(),scheduled=f.state(member).startsAt;
  f.unavailable();assert.match(f.controller.startRegistration(f.now),/restart/);
  assert.equal(f.state(member).startsAt,scheduled);assert(!f.state(member).registrationOpen);
}
// Exercise the common GM relocation path: no late entry, cross-run moves or return-slot rejoin.
const gm = fixture(), member = gm.player(), otherRun = gm.player(60), outsider = gm.player();
gm.step(1); gm.act(member, 'instantCombatRegister'); gm.act(otherRun, 'instantCombatRegister'); gm.time(instantCombatSchedule(gm.now).startsAt);
const relocateSource = source.match(/  function relocateGmPlayer\([^]*?\n  \}/)[0];
const relocate = runInNewContext(`(${relocateSource})`, { isInstantCombatInstance, instantCombat: gm.controller,
  dungeons: new Map(), raids: { byInstance: () => undefined }, zoneIds: new Set(['greenwood', 'hollow']),
  safeGmPosition: point => ({ x: point.x, z: point.z }), regionAt: () => 'greenwood',
  cancelTradeFor() {}, cancelGathering() {}, cancelHits() {}, leaveDungeon: session => gm.controller.leave(session),
  resetJump: session => { session.jump = { sequence: 0 }; }, send() {}, snapshot() {}, correction() {}, dirty() {},
});
const destination = { ...member.player, instanceId: member.instanceId, returnPosition: { ...member.returnPosition } };
assert.equal(relocate(outsider, destination, 'GM bring'), false, 'outsiders cannot bypass signup or capacity');
assert.equal(outsider.instanceId, null);
assert.equal(relocate(otherRun, destination, 'GM teleport'), false, 'registered players cannot switch instances');
assert.equal(relocate(member, destination, 'GM teleport'), true, 'existing member can move inside their own run');
assert.equal(relocate(member, { ...member.returnPosition, instanceId: null, returnPosition: null }, 'GM return'), true);
assert.equal(gm.controller.bySession(member), undefined, 'GM exit removes event membership');
assert.equal(relocate(member, destination, 'GM return'), false, 'old return slot cannot rejoin');
gm.controller.stop();

const rotationStart = Math.floor(schedule.startsAt / (INSTANT_COMBAT.intervalMs * 8)) * INSTANT_COMBAT.intervalMs * 8;
const selected = new Map();
for (let slot = 0; slot < 8; slot++) {
  const start = rotationStart + slot * INSTANT_COMBAT.intervalMs, f = fixture(start - INSTANT_COMBAT.registrationMs);
  const team = [...Array(21).fill(16), 31, 46].map(level => f.player(level));
  for (const session of team) f.act(session, 'instantCombatRegister');
  f.time(start);
  const expected = instantCombatEncounter(start);
  for (const session of team) {
    assert.equal(f.state(session).run.mapId, expected.mapId);
    assert.equal(f.state(session).run.bossModel, expected.bossModel, 'all brackets and overflow rooms share this event boss');
  }
  selected.set(expected.bossModel, expected.mapId);
  f.controller.stop();
}
assert.equal(selected.size, 8, 'all eight bosses rotate before repetition');
for (const mapId of ['bone-pit', 'void-rift']) assert.equal([...selected.values()].filter(id => id === mapId).length, 4);
assert.deepEqual(instantCombatEncounter(rotationStart), instantCombatEncounter(rotationStart + INSTANT_COMBAT.intervalMs * 8), 'rotation wraps after eight events');
assert.equal(new Set(Object.values(INSTANT_COMBAT_CREATURES).flatMap(map => map.bosses.map(boss => boss.attacks.join(',')))).size, 8, 'each boss has a distinct attack schedule');
{
  const eventEnemy = { id: 'event-creature', instantCombat: true }, ordinary = { id: 'world-creature' };
  const canTame = runInNewContext(`(${source.match(/  function canTame\([^]*?\n  \}/)[0]})`, {
    enemies: [eventEnemy, ordinary], ROOTVAULT_GUARDIAN: { id: 'guardian' }, talentEffectRank: () => 1,
    tameableCreature: () => true, hostileTargetValid: () => true,
  });
  const ranger = { player: { appearance: { className: 'Ranger' }, level: 60 } };
  assert.equal(canTame(ranger, eventEnemy, 0), false, 'event models cannot be persisted as the wrong base-archetype pet');
  assert.equal(canTame(ranger, ordinary, 0), true, 'ordinary creature taming remains available');
}

function bossFixture(level = 16, count = 1, slot = 0) {
  const start = rotationStart + slot * INSTANT_COMBAT.intervalMs, f = fixture(start - INSTANT_COMBAT.registrationMs);
  const team = Array.from({ length: count }, () => f.player(level));
  for (const session of team) f.act(session, 'instantCombatRegister');
  f.time(start); f.step(INSTANT_COMBAT.preparationMs);
  const run = f.controller.bySession(team[0]);
  run.round = 4; run.phase = 'intermission'; run.phaseEndsAt = f.now;
  f.step(1);
  for(let subwave=1;subwave<INSTANT_COMBAT.subwaves;subwave++){
    assert.equal(run.subwave,subwave);assert.equal(run.boss,null);
    assert(f.enemies.every(enemy => enemy.defenseBypass === .7), 'round-five trash inherits 70% defense bypass');
    for(const enemy of f.enemies.filter(enemy=>enemy.instanceId===run.id))f.hit(enemy);
    f.step(1);
  }
  assert.equal(run.subwave,3);
  assert.equal(run.boss.model, f.state(team[0]).run.bossModel);
  assert.equal(run.boss.defenseBypass, .7);
  assert(run.boss.level >= run.bracket.minLevel && run.boss.level <= run.bracket.maxLevel);
  assert(walkable(f, team[0], run.boss));
  return { f, team, run };
}
const curves = new Map();
for (const level of [16, 31, 46]) for (const count of [1, 20]) for (let slot = 0; slot < 2; slot++) {
  const start = rotationStart + slot * INSTANT_COMBAT.intervalMs, f = fixture(start - INSTANT_COMBAT.registrationMs);
  const team = Array.from({ length: count }, () => f.player(level));
  for (const session of team) f.act(session, 'instantCombatRegister');
  f.time(start); f.step(INSTANT_COMBAT.preparationMs);
  const curve = [];
  for (let round = 1; round <= 4; round++) {
    const wave = f.enemies.filter(enemy => enemy.alive), first = wave[0];
    const power = enemy => Number((monsterStatsAtLevel(enemy.kind, enemy.level).damage * enemy.damageScale).toFixed(6));
    assert(wave.every(enemy => enemy.hp === first.hp && power(enemy) === power(first)), 'mixed wave archetypes share normalized HP and damage');
    curve.push([wave.length, first.hp, power(first)]);
    const expectedCount=Math.max(INSTANT_COMBAT_WAVES[round-1].minimum,Math.ceil(count*INSTANT_COMBAT_WAVES[round-1].perPlayer));
    for(let subwave=1;subwave<=3;subwave++){
      const group=f.enemies.filter(enemy=>enemy.alive);assert.equal(group.length,expectedCount,'each subwave adds a complete scaled enemy group');
      assert(group.every(enemy => enemy.defenseBypass === INSTANT_COMBAT.defenseBypass[round - 1]), 'every spawned subwave uses its round defense bypass');
      assert.equal(f.state(team[0]).run.subwave,subwave);
      for(const enemy of group){enemy.hp=0;enemy.alive=false;}
      f.step(1);assert.equal(f.rewards.length,round-(subwave<3?1:0),'rewards wait for the full round');
    }
    const batches = f.rewards.length; f.step(1); assert.equal(f.rewards.length, batches, 'remaining in intermission cannot duplicate rewards');
    if (round < 4) f.time(f.state(team[0]).run.phaseEndsAt);
  }
  assert.deepEqual(curve.map(row => row[0]), count === 1 ? [1,2,3,5] : [10,13,18,27]);
  assert(curve.every((row, index) => !index || row.every((value, column) => value > curve[index-1][column])), 'wave count, HP and damage increase each round');
  const key = `${level}-${count}`;
  if (curves.has(key)) assert.deepEqual(curve, curves.get(key), 'both maps have equivalent base wave strength'); else curves.set(key, curve);
  assert.equal(f.rewards[0].members.length, count);
  f.controller.stop(); assert(f.removedRewards.length >= count);
}
for (const [index, bracket] of INSTANT_COMBAT_BRACKETS.entries()) {
  const rewards = Array.from({ length: 5 }, (_, i) => instantCombatWaveReward(bracket.id, i + 1, true));
  assert.deepEqual(rewards.map(reward => reward.gold), [1,2,3,5,9].map(multiplier => multiplier * 5 * (index + 1)));
  assert.deepEqual(rewards.map(reward => reward.xp), [0,0,0,0,600 * (index + 1)]);
  assert.equal(rewards[4].gearChance, .2); assert(rewards.slice(0,4).every(reward => !reward.gearChance));
}
assert.equal(instantCombatWaveReward('1-15', 1), null); assert.equal(instantCombatWaveReward('16-30', 6), null);
// Execute the production attack scheduling block for event and ordinary monsters.
{
  const start=source.indexOf('      const companion = target && enemyCombatCompanion(enemy, target, now), goal = companion || target?.player || patrol;');
  const end=source.indexOf('\n    }\n    instantCombat.tick(now);',start);
  assert(start>=0&&end>start);
  const attack=runInNewContext(`(enemy,target,now,stats)=>{for(const actor of [enemy]){${source.slice(start,end)} }}`,{
    INSTANT_COMBAT,BASIC_ATTACK,basicAttackCooldown,basicAttackRange,monsterPursuitSpeed,
    enemyCombatCompanion:()=>null,distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),moveEnemyToward(){},startEnemyCharge:()=>false,
    canTraverse:()=>true,instanceColliders:()=>[],instanceBounds:()=>({}),WORLD_COLLIDERS:[],WORLD_BOUNDS:{},randomUUID:()=> 'attack',
  });
  for(const instantCombat of [true,false]){
    const enemy={kind:'briar-sentinel',instantCombat,instanceId:instantCombat?'event':null,x:0,z:0,hp:100,lastAttack:0,lastSpecialAttack:0};
    const target={player:{id:'target',x:1,z:0},lifeStartedAt:1},stats=monsterStatsAtLevel(enemy.kind,16);
    const interval=basicAttackCooldown(enemy.kind)/(instantCombat?1.25:1);
    attack(enemy,target,interval-1,stats);assert(!enemy.attack,'basic attack respects its full interval');
    attack(enemy,target,interval,stats);assert(enemy.attack?.basic,'basic attack becomes ready at the exact scaled interval');
    assert.equal(enemy.attack.impactAt-enemy.attack.startedAt,BASIC_ATTACK.impactMs,'basic strike windup stays unchanged');
    const caster={kind:'ember-beetle',instantCombat,instanceId:enemy.instanceId,x:0,z:0,hp:100,lastAttack:3000,lastSpecialAttack:0};
    const casterStats=monsterStatsAtLevel(caster.kind,16),specialInterval=casterStats.cooldownMs*3/(instantCombat?1.25:1);
    target.player.x=casterStats.range;
    attack(caster,target,specialInterval-1,casterStats);assert(!caster.attack,'ranged special respects its full interval');
    attack(caster,target,specialInterval,casterStats);assert(caster.attack&&!caster.attack.basic,'special attack interval is scaled only for event monsters');
  }
}
// Exercise production target selection and pursuit against both authored arenas.
for (let slot = 0; slot < 2; slot++) {
  const { f, team: [near, far, fallen], run } = bossFixture(16, 3, slot), map = instantCombatMap(run.mapId);
  const outsider = f.player(); outsider.instanceId = run.id;
  for (const session of [near, far, fallen, outsider]) Object.assign(session, { lifeStartedAt: 1, socket: { readyState: 1 } });
  Object.assign(near.player, { x: 2, z: 0 }); Object.assign(far.player, { x: 20, z: 0 });
  Object.assign(fallen.player, { x: 0, z: 0, hp: 0 }); Object.assign(outsider.player, { x: 0, z: 0 });
  const enemy = { ...run.boss, kind: INSTANT_COMBAT_CREATURES[run.mapId].waves[0].kind, instantCombatRole: undefined,
    x: 0, z: 0, target: far, threat: new Map([[far, 999]]), tauntedBy: far, tauntedUntil: f.now + 10000, tauntedLife: 1, tauntedTargetLife: 1 };
  let pathBounds;
  const context = { MONSTERS, sessions: f.sessions, instantCombat: f.controller, liveSession: session => session?.online && f.sessions.get(session.player.id) === session,
    arenaMode: session => !!session.arena, gmObserver: session => !!session.observer, dungeonPreparing: () => false, combatInstanceActive: () => true,
    activeSessions: () => [...f.sessions.values()], activeCompanion: () => ({ saved: { hp: 100 } }), combatTargetLife: () => 1,
    hostileTargetValid: () => true, distance: (a, b) => Math.hypot(a.x - b.x, a.z - b.z), enemyStats: MONSTERS, CHASE_DISTANCE: 40,
    worldBossCombatAllowed: () => true, mapGuardianAllowed: () => true, insideCity: () => false, waterAt: () => false, villageSafe: () => false,
    pendingHits: [], movementFrameStart: f.now - 100, instanceColliders: () => map.colliders, instanceBounds: () => map.bounds,
    canTraverse, groundCanTraverse:canTraverse, findPath: (from, to, colliders, bounds) => { pathBounds = bounds; return findPath(from, to, colliders, bounds); },
    dungeons: new Map(), monsterPursuitSpeed, basicAttackRange, INSTANT_COMBAT };
  const functions = ['combatDefense', 'tauntEnemy', 'enemyCombatCompanion', 'selectEnemyTarget', 'moveEnemyToward', 'resolveEnemyAttack'];
  const api = runInNewContext(functions.map(name => source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0]).join('\n') + `\n({${functions.join(',')}})`, context);
  const select = () => api.selectEnemyTarget(enemy, [...f.sessions.values()], f.now);
  assert.equal(select(), near, 'closest living participant wins over accumulated threat and an earlier taunt');
  api.tauntEnemy(far, enemy, f.now); assert.equal(enemy.target, near, 'taunt cannot override nearest-player event targeting');
  assert.equal(api.enemyCombatCompanion(enemy, near, f.now), null, 'a companion cannot replace the nearest player target');
  for (const invalid of [{ online: false }, { observer: true }, { arena: true }, { zeppelin: {} }, { instanceId: 'another-arena' }]) {
    const before = Object.fromEntries(Object.keys(invalid).map(key => [key, near[key]])); Object.assign(near, invalid);
    assert.equal(select(), far, 'ineligible participants are not targetable'); Object.assign(near, before);
  }
  near.player.hp = 0; assert.equal(select(), far); near.player.hp = 100;
  assert.equal(select(), near, 'dead members and a nonmember in the same instance never acquire aggro');
  const ordinary = { ...enemy, instantCombat: false, target: far, threat: new Map([[far, 999], [near, 1]]) };
  assert.equal(api.selectEnemyTarget(ordinary, [near, far], f.now), far, 'ordinary monsters retain threat-based targeting');
  enemy.attackTarget = far; enemy.attackTargetLife = 1; enemy.attackCompanion = null;
  enemy.attack = { basic: true, targetId: far.player.id, startedAt: f.now - 100, impactAt: f.now + 1000, endsAt: f.now + 1300 };
  api.resolveEnemyAttack(enemy, f.now); assert.equal(enemy.attack, null, 'a pending basic attack cancels when another player becomes closest');
  enemy.attack = { basic: false, style: 'pulse', targetId: far.player.id, startedAt: f.now - 100, impactAt: f.now + 1000, endsAt: f.now + 1300 };
  const tell = enemy.attack; api.resolveEnemyAttack(enemy, f.now); assert.equal(enemy.attack, tell, 'already telegraphed special attacks remain locked');
  Object.assign(enemy, instantCombatPosition(map.id, 0, -31), { movedAt: f.now - 100, nextPathAt: 0 });
  Object.assign(near.player, instantCombatPosition(map.id, 0, 31)); far.online = false;
  assert(context.distance(near.player, enemy) > 40); assert.equal(select(), near, 'the whole arena is acquisition range');
  enemy.attackTarget = near; enemy.attack = { basic: true, targetId: near.player.id, startedAt: f.now - 100, impactAt: f.now + 1000, endsAt: f.now + 1300 };
  const position = { x: enemy.x, z: enemy.z }; api.resolveEnemyAttack(enemy, f.now);
  assert(enemy.attack, 'pursuit stays active beyond the ordinary 40m leash');
  assert(context.distance(enemy, position) > 0, 'enemy physically pursues the distant participant');
  assert.deepEqual(pathBounds, map.bounds, 'event pathfinding can use the entire authored arena');
  for(const actor of [enemy,ordinary])Object.assign(actor,{x:0,z:0,movedAt:f.now-100});
  api.moveEnemyToward(enemy,{x:0,z:6},f.now,3,0);api.moveEnemyToward(ordinary,{x:0,z:6},f.now,3,0);
  assert(Math.abs(enemy.z-ordinary.z*2)<1e-9&&ordinary.z>0,'only event monsters move at twice their normal speed');
  Object.assign(context, { WebSocket: { OPEN: 1 }, monsterLevelScale, activeCompanion: () => null, canTraverse: () => true,
    physicalReach: (session, target, range) => context.distance(session.player, target) <= range,
    applyDamage: (player, type, damage) => { player.hp -= damage; }, stand() {}, event() {}, dirty() {} });
  Object.assign(near.player, { x: 1, z: 0 });
  Object.assign(enemy, { x: 0, z: 0, level: near.player.level, attackTarget: near, attackTargetLife: 1, attackCompanion: null, target: near });
  for (const basic of [true, false]) for (const instantCombat of [true, false]) {
    for (const [defense, boost, raw, expected] of [
      [0, 1, 20, [20, 20, 20, 20, 20]],
      [27, 1, 20, [1, 4, 6, 9, 12]],
      [27, 1.2, 100, [78, 81, 84, 87, 90]],
      [1000, 1, 20, [1, 1, 1, 1, 1]],
    ]) for (const [round, defenseBypass] of INSTANT_COMBAT.defenseBypass.entries()) {
      context.combatStats = () => ({ defense }); context.storeBoostMultiplier = () => boost;
      near.player.hp = 1000;
      Object.assign(enemy, { instantCombat, defenseBypass, attackDamage: raw, attackApplied: false,
        attack: { basic, style: 'swipe', x: near.player.x, z: near.player.z, radius: 2, targetId: near.player.id,
          startedAt: f.now - 100, impactAt: f.now, endsAt: f.now + 100 } });
      api.resolveEnemyAttack(enemy, f.now);
      assert.equal(1000 - near.player.hp, instantCombat ? expected[round] : Math.max(1, raw - Math.round(defense * boost)),
        'production basic/special hits bypass only event armor, including boosts, zero armor and the unchanged minimum');
    }
  }
  f.controller.stop();
}
for (let slot = 0; slot < 8; slot++) {
  const { f, team: [far, near], run } = bossFixture(16, 2, slot);
  Object.assign(far.player, { x: 0, z: 25 }); Object.assign(near.player, { x: 0, z: 5 });
  f.time(run.nextAbility); assert.equal(run.boss.attack.targetId, near.player.id, 'ordinary boss casts choose the nearest player, not roster order');
  const first = INSTANT_COMBAT_SKILLS[run.boss.model][0];
  assert.equal(run.boss.attack.name, first.name);
  assert.equal(run.boss.attack.impactAt-f.now,first.events[0].ms,'v12 preserves the first authored event deadline');
  assert.equal(run.nextAbility-run.boss.attack.endsAt,2500/1.25,'the existing 25% cadence boost applies after each authored cast or rescue deadline');
  // Isolate cadence from the first ability's penalties; its complete rule is tested separately.
  run.skillRuntime.jobs=[];run.hazards=[];run.runes=[];
  run.bossPhase='final';f.time(run.nextAbility);assert.equal(run.nextAbility-run.boss.attack.endsAt,1500/1.25,'final phase keeps its shorter recovery after the authored skill');
  f.controller.stop();
}
assert.equal(new Set(Object.values(INSTANT_COMBAT_CREATURES).flatMap(map => map.bosses.map(boss => boss.mechanic))).size,8,'all eight bosses have distinct mandatory objectives');
for (let slot=0;slot<8;slot++) for (const level of [16,31,46]) {
  const { f, team } = bossFixture(level,1,slot); clearBoss(f,team[0]); f.controller.stop();
}
for(let slot=0;slot<8;slot++) {
  const { f, team } = bossFixture(60,20,slot);
  clearBoss(f,team[0]); f.controller.stop();
}
for(let slot=0;slot<8;slot++) {
  const { f, team, run } = bossFixture(60,20,slot), hp=run.boss.maxHp;
  for(const session of team.slice(1)) f.controller.leave(session);
  assert.equal(run.boss.maxHp,hp,'leaving cannot lower locked boss health');
  clearBoss(f,team[0]); f.controller.stop();
}
for(let slot=0;slot<8;slot++) {
  const { f,team,run }=bossFixture(16,1,slot);
  f.hit(run.boss);f.step(1);
  const deadline=run.mechanicEndsAt,boss=run.boss;
  assert(f.controller.impacts(deadline).includes(deadline),'ritual deadline participates in chronological combat settlement');
  f.hit(boss,Number.MAX_SAFE_INTEGER,deadline);
  assert.equal(run.phase,'failed','damage at deadline cannot rescue unfinished objective');
  assert.equal(run.hazards.length,0);assert.equal(run.runes.length,0);assert.equal(f.enemies.length,0);
  f.controller.stop();
}
// Distinguish real objective behavior from cosmetic boss labels.
{
  const {f,team,run}=bossFixture(16,1,1); // Sovereign: progress persists, strangers never help.
  f.hit(run.boss);f.step(1);
  const rune=run.runes[0],outsider=f.player();Object.assign(outsider.player,{x:rune.x,z:rune.z});
  Object.assign(team[0].player,{x:0,z:-20});
  for(let i=0;i<10;i++)f.step(100);assert.equal(rune.charge,0);
  Object.assign(team[0].player,{x:rune.x,z:rune.z});for(let i=0;i<10;i++)f.step(100);
  const progress=rune.charge;Object.assign(team[0].player,{x:0,z:-20});f.step(100);assert.equal(rune.charge,progress);
  f.controller.stop();
}
{
  const {f,team,run}=bossFixture(16,1,2); // Colossus: occupancy matters at impact, not before.
  f.hit(run.boss);f.step(1);Object.assign(team[0].player,{x:0,z:-20});
  f.time(run.mechanic.nextAt);assert.equal(run.mechanic.progress,0);assert.equal(team[0].player.hp,80);
  clearObjective(f,team[0]);f.controller.stop();
}
{
  const {f,team,run}=bossFixture(16,1,4); // Cantor: future notes cannot be charged out of order.
  f.hit(run.boss);f.step(1);Object.assign(team[0].player,{x:run.runes[2].x,z:run.runes[2].z});f.step(200);
  assert.equal(run.runes[2].charge,0);assert.equal(run.mechanic.progress,0);assert.equal(team[0].player.hp,90);
  Object.assign(team[0].player,{x:run.runes[0].x,z:run.runes[0].z});f.step(250);assert(run.runes[0].charge>0);
  Object.assign(team[0].player,{x:run.runes[1].x,z:run.runes[1].z});f.step(1000);assert.equal(run.runes[0].charge,0);
  clearObjective(f,team[0]);f.controller.stop();
}
{
  const {f,team,run}=bossFixture(16,1,6); // Queen: missed nest deadline creates genuine fighting adds.
  f.hit(run.boss);f.step(1);f.time(run.mechanic.nextAt);
  const brood=f.enemies.filter(enemy=>enemy.alive&&enemy!==run.boss);
  assert.equal(brood.length,2);assert(brood.every(enemy=>enemy.model==='ossuary-scarab'&&!enemy.instantCombatRole));
  assert(brood.every(enemy => enemy.defenseBypass === .7), 'boss adds inherit final-round defense bypass');
  assert.equal(run.mechanic.progress,0);clearObjective(f,team[0]);f.controller.stop();
}
{
  const {f,team,run}=bossFixture(16,2,3); // Nullweaver: other players' movement cannot sever your tether.
  f.hit(run.boss);f.step(1);Object.assign(team[0].player,{x:0,z:-20});f.step(1);
  assert.equal(run.mechanic.progress,0);assert.equal(run.runes.find(r=>r.playerId===team[1].player.id).charge,0);
  f.controller.leave(team[1]);f.step(1);assert.equal(run.mechanic.progress,1,'departed marks do not make a mechanic impossible');
  clearObjective(f,team[0]);f.controller.stop();
}
{
  const {f,team,run}=bossFixture(16,1,5); // Behemoth: a missed pillar does not count.
  f.hit(run.boss);f.step(1);
  const pillar=f.enemies.find(enemy=>enemy.id===run.mechanic.pillarId);
  const miss=arenaPoints.find(point=>walkable(f,team[0],point)&&Math.abs(pillar.x*point.z-pillar.z*point.x)/Math.max(1,Math.hypot(point.x,point.z))>3);
  assert(miss);Object.assign(team[0].player,miss);f.time(run.mechanic.nextAt);
  const safe=arenaPoints.find(point=>walkable(f,team[0],point)&&!raidHazardContains(run.hazards.at(-1),point));
  assert(safe);Object.assign(team[0].player,safe);f.time(run.mechanic.nextAt);
  assert.equal(run.mechanic.progress,0);clearObjective(f,team[0]);f.controller.stop();
}
{
  const {f,team,run}=bossFixture(16,1,7); // Oracle: authoritative character facing, not distance, clears gaze.
  f.hit(run.boss);f.step(1);team[0].player.rotation=Math.atan2(run.boss.x-team[0].player.x,run.boss.z-team[0].player.z);
  f.time(run.mechanic.nextAt);assert.equal(run.mechanic.progress,0);assert.equal(team[0].player.hp,80);
  team[0].autoAttack={enemy:run.boss};team[0].player.rotation+=Math.PI;
  const rotation=team[0].player.rotation;
  const auto=runInNewContext(`(${source.match(/  function startAutoAttacks\([^]*?\n  \}/)[0]})`,{
    sessions:f.sessions,instantCombat:f.controller,autoAttackTargetValid:()=>true,
  });
  auto(f.now);assert.equal(team[0].player.rotation,rotation,'queued autoattacks do not turn players into a mandatory gaze');
  assert(team[0].autoAttack,'queued target resumes after shield ends');
  clearObjective(f,team[0]);f.controller.stop();
}
{
  const {f,team,run}=bossFixture(16,2,5);
  f.hit(run.boss);f.step(1);assert.equal(run.mechanic.targetId,team[0].player.id);
  f.controller.leave(team[0]);f.step(1);
  assert.equal(run.mechanic.targetId,team[1].player.id,'departed charge targets are visibly reassigned before locking');
  assert.equal(run.mechanic.nextAt-f.now,6000,'replacement target gets the full preparation tell');
  clearObjective(f,team[1]);f.controller.stop();
}
// Traverse actual map routes at walking speed: clear-space teleport fixtures cannot prove a timed bait is reachable.
for (const edgeStart of [false, true]) {
  const {f,team,run}=bossFixture(16,1,5),session=team[0],map=instantCombatMap(run.mapId);
  if (edgeStart) {
    const start=instantCombatPosition(map.id,0,-31);
    assert(findPath(map.boss,start,map.colliders,map.bounds).length,'edge start is connected to the playable arena');
    Object.assign(session.player,start);
  }
  const walkTo=destination=>{
    const path=findPath(session.player,destination,map.colliders,map.bounds);
    assert(path.length,'actual marked player has a route to the shown objective');
    assert.deepEqual(path.at(-1),{x:destination.x,z:destination.z});
    for(const next of path){
      const from={x:session.player.x,z:session.player.z},distance=Math.hypot(next.x-from.x,next.z-from.z);
      const ticks=Math.ceil(distance/(WALK_SPEED*.05));
      for(let tick=1;tick<=ticks;tick++){
        const point={x:from.x+(next.x-from.x)*tick/ticks,z:from.z+(next.z-from.z)*tick/ticks};
        assert(canTraverse(session.player,point,map.colliders,map.bounds),'every simulated movement step respects authored props');
        Object.assign(session.player,point);f.step(50);
      }
    }
  };
  for(const fraction of [.7,.35]){
    f.hit(run.boss);f.step(1);assert.equal(run.boss.hp,Math.floor(run.boss.maxHp*fraction));
    const deadline=run.mechanicEndsAt;
    while(run.mechanic){
      const m=run.mechanic,aimAt=m.nextAt,bait=run.runes[0];
      walkTo(bait);assert(f.now<aimAt,'bait is reached before its real aim window closes');
      f.time(aimAt);assert.equal(m.stage,'impact');
      const hazard=run.hazards.find(h=>h.id===m.hazardId),impactAt=m.nextAt;
      const safe=[3,4,5,6].flatMap(radius=>Array.from({length:32},(_,i)=>({x:session.player.x+Math.sin(i*Math.PI/16)*radius,z:session.player.z+Math.cos(i*Math.PI/16)*radius})))
        .find(point=>canTraverse(session.player,point,map.colliders,map.bounds)&&!raidHazardContains(hazard,point));
      assert(safe,'a local walkable dodge exists beside the bait');
      walkTo(safe);assert(f.now<impactAt,'locked charge gives enough time to walk out of the lane');
      f.time(impactAt);
    }
    assert(f.now<deadline,'three routed pillars and their dodges fit the shield deadline');
    assert.equal(session.player.hp,100,'successful bait and dodge take no charge damage');
  }
  f.controller.stop();
}

// Run the production settlement ordering against a lethal earlier tell and a later boss-killing hit.
{
  const { f, team, run } = bossFixture(), player = team[0].player, boss = run.boss;
  run.bossStep = 2; run.bossPhase = 'final'; boss.hp = 1; player.hp = 20;
  run.hazards.push({ id: 'earlier-ritual', sourceId: boss.id, plane: 'arena', shape: 'circle', x: player.x, z: player.z, r: 3,
    startedAt: f.now, impactAt: f.now + 1000, endsAt: f.now + 2000, damage: .5 });
  const impactAt = f.now + 1000, shotAt = f.now + 1500;
  const settle = runInNewContext(`(${source.match(/  function settleCombat\([^]*?\n  \}/)[0]})`, {
    enemies: f.enemies, instantCombat: f.controller, sessions: f.sessions, dungeons: new Map(), raids: { impacts: () => [], resolve() {} },
    finishCasts() {}, resolveHits: at => { if (at >= shotAt && player.hp > 0) f.hit(boss, 10, at); },
    advanceKnightCharge() {}, updateDungeonHazards() {}, updateDungeonSpikeTraps() {}, updateKnightCombat() {},
    resolveEnemyAttack() { throw Error('Controlled boss must not execute ordinary enemy AI.'); },
  });
  settle(f.now + 2500);
  assert.equal(player.hp, 0); assert.equal(boss.hp, 1, 'earlier lethal hazard wins over later lethal boss damage');
  assert.equal(f.damage[0].at, impactAt); assert.equal(f.damage.length, 1, 'hazard resolves only once');
  assert.equal(f.controller.damageAllowed(boss, 999, shotAt, team[0]), 0, 'dead attackers cannot land a delayed hit through the shared hook');
  f.controller.stop();
}
for (let slot = 0; slot < 8; slot++) {
  const { f, team, run } = bossFixture(16, 1, slot), outsider = f.player();
  for (let attack = 0; attack < 3; attack++) {
    f.time(run.nextAbility);
    const skill=INSTANT_COMBAT_SKILLS[run.boss.model][attack],state=f.state(team[0]).run;
    assert.equal(run.boss.attack.name,skill.name,'all three v12 abilities enter the live controller rotation');
    assert(!JSON.stringify(state.hazards).includes('damage'),'private damage amounts never enter telegraph state');
    assert(!JSON.stringify(state.runes).includes('inventory'),'markers never disclose private player data');
    f.time(run.boss.attack.impactAt);assert.equal(outsider.player.hp,100,'authored events never damage another instance');
    // Rescue/stack/action rules have dedicated success and failure tests. They
    // intentionally cannot all be evaded by one player moving outside a shape.
    team[0].player.hp=100;run.skillRuntime.jobs=[];run.skillRuntime.controls.clear();run.hazards=[];run.runes=[];
  }
  f.controller.stop(); assert.equal(f.enemies.length, 0);
}
// Execute the complete production movement handler, accepted-ability guard and
// cast movement hooks with real IC control state. Geometry is open in this fixture.
{
 const {f,team:[session],run}=bossFixture(16,1,0),at=f.now,rejections=[];
 const movementCredit=createMovementCredit(()=>at);
 const entry={rootUntil:at+1000};run.skillRuntime={jobs:[],controls:new Map([[session.player.id,entry]]),venom:new Map(),digest:new Map(),acidHitAt:new Map()};
 Object.assign(session,{lifeStartedAt:1,travel:{stamina:100,mount:null},jump:{grounded:true,y:0},lastMove:at,moveBudget:.5});
 Object.assign(session.player,{x:0,z:0,appearance:{className:'Knight'},hp:10000,maxHp:10000});
 const context={movementCredit,swimming:()=>false,CLIMB_ENABLED:false,playerRouteAllowed:()=>true,moveSessionJump:()=>true,rememberStanding(){},jumpFloor:()=>0,instantCombat:f.controller,SPELLS,WALK_SPEED,SPRINT_SPEED:9,SWIM_SPEED:3,STAMINA_DRAIN:1,
  distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),zoneIds:new Set(['hollow']),isGmSession:()=>false,
  recoverTravel(){},advanceJump(){},gearSpeedMultiplier:()=>1,canSprint:()=>false,canTraverse:()=>true,moveJump:()=>true,
  instanceColliders:()=>[],instanceBounds:()=>({}),isInstantCombatInstance,instantCombatJumpColliders:()=>[],instantCombatJumpFloor:()=>0,
  stand(){},cancelGathering(){},cancelCast:s=>{s.casting=null;},worldPvp:()=>false,recordReferralGameplay(){},arenaMode:()=>false,
  checkTrade(){},playerTrades:new Map(),dungeons:new Map(),updateArena(){},visitAchievementZone(){},dirty(){},resetJump(){},
  correction:(s,text)=>{movementCredit.reset(s);rejections.push(text);},reject:text=>rejections.push(text),cheat:text=>{throw Error(text);},
  abilityValid:()=>true,liveSession:()=>true,combatInstanceActive:()=>true,hostileTargetValid:()=>true,combatTargetLife:()=>1,
  friendlyTarget:()=>true,gmObserver:()=>false,sessions:f.sessions,mobilityDestination:(s,d)=>({x:s.player.x+d,z:s.player.z})};
 const moveStart=source.indexOf("      } else if (message.type === 'move') {")+"      } else if (message.type === 'move') {".length;
 const moveEnd=source.indexOf("      } else if (message.type === 'autoAttack') {",moveStart);assert(moveStart>0&&moveEnd>moveStart);
 const move=runInNewContext(`(session,message,now)=>{const p=session.player,movementReceipt=movementCredit.observe();${source.slice(moveStart,moveEnd)}}`,context);
 const input=dx=>move(session,{type:'move',x:session.player.x+dx,z:session.player.z,rotation:1},at);
 for(let i=0;i<100;i++)input(.009);assert.equal(session.player.x,0,'small repeated packets cannot walk through a root');
 entry.rootUntil=0;entry.stunUntil=at+1000;input(.009);assert.equal(session.player.x,0,'small packets cannot walk through a stun');
 input(0);assert.equal(session.player.rotation,1,'stationary heartbeats still work during control effects');
 entry.stunUntil=0;run.skillRuntime.requiem={until:at+1000,punished:new Set()};input(.009);
 assert.equal(session.player.x,.009);assert.equal(session.player.hp,5000,'even a tiny accepted move triggers Requiem');
 delete run.skillRuntime.requiem;entry.silenceUntil=0;entry.rootUntil=at+1000;
 const attackStart=source.indexOf("      } else if (message.type === 'attack') {")+"      } else if (message.type === 'attack') {".length;
 const attackEnd=source.indexOf("        if (spell.targetRelation === 'hostile'",attackStart);assert(attackStart>0&&attackEnd>attackStart);
 const accepted=runInNewContext(`(session,message,now)=>{const p=session.player;${source.slice(attackStart,attackEnd)}return true;}`,context);
 for(const ability of ['charge',SPELL_EFFECT_IDS.roll])assert(!accepted(session,{type:'attack',ability},at),'ordinary movement abilities cannot start while rooted');
 for(const ability of [SPELL_EFFECT_IDS.blink,SPELL_EFFECT_IDS.lightspeed,'fireball'])assert(accepted(session,{type:'attack',ability},at),'root cleanses and stationary casts remain usable');
 const extract=name=>source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0];
 const charge=runInNewContext(`(${extract('advanceKnightCharge')})`,context),targets=runInNewContext(`(${extract('castTargets')})`,context);
 for(const ability of ['charge',SPELL_EFFECT_IDS.roll]){
  const origin={x:session.player.x,z:session.player.z};session.casting={ability,startedAt:at-250,endsAt:at+250,from:origin,chargeEnd:{x:origin.x+10,z:origin.z},playerLife:1,instanceId:session.instanceId,anchor:session.player,targetLife:1};
  assert.equal(targets(session,session.casting,at),null,'root prevents movement at cast release');
  charge(session,at);assert.equal(session.casting,null,'a root cancels movement already in flight');assert.equal(session.player.x,origin.x);
 }
 const cast=ability=>({ability,from:{x:session.player.x,z:session.player.z},anchor:session.player,targetLife:1,playerLife:1,instanceId:session.instanceId});
 const mobilityStart=source.indexOf('    const state = session.combatTalents ||= {};',source.indexOf('  function releaseCast('));
 const mobilityEnd=source.indexOf("    if (spell.effect === 'revive')",mobilityStart);
 const release=runInNewContext(`(session,cast,releasedAt)=>{const p=session.player,spell=SPELLS[cast.ability];${source.slice(mobilityStart,mobilityEnd)}}`,context);
 for(const ability of [SPELL_EFFECT_IDS.blink,SPELL_EFFECT_IDS.lightspeed]){
  entry.rootUntil=at+1000;const prepared=cast(ability);assert.equal(targets(session,prepared,at).length,1);assert(release(session,prepared,at));
  assert.equal(f.controller.actionError(session,'move',at),null,'authored movement cleanse releases ordinary IC roots');
 }
 entry.rootUntil=at+1000;entry.trapId='cage';
 assert(!accepted(session,{type:'attack',ability:SPELL_EFFECT_IDS.blink},at));assert.equal(targets(session,cast(SPELL_EFFECT_IDS.blink),at),null,'a cage cannot be blinked out of');
 const displaceBody=source.match(/    displace: \(session, point, at\) => \{([^]*?)\n    \},/)[1];
 const displace=runInNewContext(`(session,point,at)=>{${displaceBody}}`,context),before=session.player.x;
 displace(session,{x:before+1,z:session.player.z},at);assert.equal(session.player.x,before+1,'boss-forced displacement still works while rooted');
 f.controller.stop();
}
console.log('Instant Combat: signup/brackets/capacity, rewards, scaling, targeting, eight boss rotations/objectives, chronological deadlines, safe tells, tiny-input control enforcement, charge/roll interruption, authored root cleansing, forced displacement and cleanup passed.');
