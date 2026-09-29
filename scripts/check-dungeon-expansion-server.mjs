import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { MONSTERS, monsterStatsAtLevel } from '../src/bestiary.ts';
import { starterGear } from '../src/progression.ts';
import { newContracts } from '../src/adventure.ts';
import { LEGACY_DUNGEONS as DUNGEONS, dungeonStages, getDungeon, crossedDungeonPortal, DUNGEON_START, dungeonBounds, dungeonCheckpoint, dungeonReturn, dungeonLayout, dungeonColliders, dungeonRoomPortalOpen, inDungeonPreparation } from '../src/dungeon.ts';
import { DUNGEON_TEMPLE_ROUTES } from '../src/dungeon-approach-layout.ts';
import { canTraverse, regionAt, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { surfaceAt } from '../src/landscape.ts';
import { findPath } from '../src/navigation.ts';
import { dungeonSpikeTraps } from '../src/dungeon-traps.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-dungeon-expansion-')), original = structuredClone(MONSTERS), realNow = Date.now, clients = [];
let game, port, offset = 0, mountRolls = 0;
const onlyDungeon = process.argv.find(arg => arg.startsWith('--dungeon='))?.split('=')[1];
assert(!onlyDungeon || DUNGEONS.slice(4).some(dungeon => dungeon.id === onlyDungeon), 'focused dungeon ID must name a themed dungeon');
Date.now = () => realNow() + offset;
const hero = (name, level, point, unlocked = true) => ({ id: randomUUID(), name, ...point, coordinateVersion: 2, zone: regionAt(point.x, point.z), rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, ...starterGear('Ranger'), talents: [], learnedSpells: level >= 38 ? ['arrow', 'wild-renewal'] : ['arrow'], level, xp: 0, gold: 0, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, rootvaultUnlocked: unlocked,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 200, relic: 0 }, contracts: newContracts(),
  quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } });
const cinder = getDungeon('cindercrypt'), stone = { x: cinder.summonStone.x, z: cinder.summonStone.z + 2 }, home = { x: 0, z: 22 };
const heroes = Object.fromEntries(DUNGEONS.flatMap(d => [[d.id, hero(`${d.id} delver`, d.minLevel, { x: d.entrance.x, z: d.entrance.z + 1 }, d.id === 'rootvault')],
  [`${d.id}Low`, hero(`${d.id} novice`, d.minLevel - 1, { x: d.entrance.x, z: d.entrance.z + 1 })]]));
Object.assign(heroes, { rootLocked: hero('Unproven delver', 10, { x: DUNGEONS[0].entrance.x, z: DUNGEONS[0].entrance.z + 1 }, false), leader: hero('Summon captain', 50, stone), ally: hero('Summon ally', 50, home), outsider: hero('Summon stranger', 50, { x: 2, z: 22 }), recoveryAlly: hero('Checkpoint companion', 50, { x: getDungeon('plagueworks').entrance.x, z: getDungeon('plagueworks').entrance.z + 1 }) });
const tokens = Object.fromEntries(Object.keys(heroes).map(id => [id, randomBytes(32).toString('base64url')]));
const inStage = (enemy, id) => new RegExp(`-${id}-\\d+-\\d+$`).test(enemy.id);
async function until(fn, label, timeout = 6500) { const end = realNow() + timeout; while (realNow() < end) { const result = fn(); if (result) return result; await delay(12); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 1100) {
  offset += ms;
  const target = Date.now(), active = clients.filter(client => client.inWorld && client.socket.readyState === WebSocket.OPEN);
  if (active.length) await until(() => active.every(client => !client.inWorld || client.socket.readyState !== WebSocket.OPEN || client.snapshot?.serverTime >= target), 'fresh dungeon snapshots');
  else await delay(115);
}
async function connect(name) {
  // These accelerated clients share the server's process and zlib limiter; traffic checks cover production compression separately.
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`, { perMessageDeflate: false }), c = { socket, id: heroes[name].id, messages: [] }; clients.push(c);
  c.send = m => socket.send(JSON.stringify(m)); c.player = () => c.snapshot?.players.find(p => p.id === c.id);
  socket.on('message', raw => { const m = JSON.parse(raw); if (m.type === 'welcome') c.inWorld = true; if (m.type === 'roster') c.inWorld = false; if (m.type !== 'snapshot' || m.dungeon?.hazards.length) c.messages.push(m); if (m.type === 'snapshot') c.snapshot = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[name], characterId: c.id }); await until(() => c.player(), `join ${name}`); return c;
}
async function reject(c, message, pattern) { await tick(); const i = c.messages.length; c.send(message); await until(() => c.messages.slice(i).some(m => m.type === 'event' && m.kind === 'info' && pattern.test(m.text)), `reject ${message.type}: ${pattern}`).catch(error => { throw new Error(error.message + ' ' + JSON.stringify({ position:c.player(), messages:c.messages.slice(i) })); }); }
async function party(leader, member) { await tick(); leader.send({ type: 'partyInvite', targetId: member.id }); const offer = await until(() => member.snapshot.partyInvites[0], 'party offer'); member.send({ type: 'partyAccept', invitationId: offer.id }); await until(() => member.snapshot.party?.members.some(m => m.id === leader.id), 'party joined'); }
async function offer(leader, member) { await tick(); leader.send({ type: 'dungeonSummon', dungeonId: cinder.id, targetId: member.id }); return until(() => member.snapshot.dungeonSummon, 'summon offered'); }
async function walk(c, goal, standOff = 0) {
  const state = c.snapshot.dungeon, colliders = state ? [...dungeonColliders(state.clearedStages, state.objects.filter(o => o.activated).map(o => o.id), state.kind),
    ...dungeonLayout(state.kind).objects.filter(object => object.kind === 'chest'),
    ...dungeonSpikeTraps(state.kind).map(trap=>({...trap,r:Math.hypot(trap.width,trap.depth)/2,halfWidth:trap.width/2,halfDepth:trap.depth/2}))] : WORLD_COLLIDERS;
  const bounds = state ? dungeonBounds(state.kind) : WORLD_BOUNDS;
  if (standOff) {
    const target = goal;
    goal = Array.from({ length: 8 }, (_, index) => ({ x: target.x + Math.sin(index * Math.PI / 4) * standOff, z: target.z + Math.cos(index * Math.PI / 4) * standOff }))
      .find(point => canTraverse(point, point, colliders, bounds));
    assert(goal, `clear combat approach around ${target.id}`);
  }
  const path = findPath(c.player(), goal, colliders, bounds);
  if (!path.length && state) {
    const layout = dungeonLayout(state.kind), roomAt = point => layout.rooms.find(room => Math.abs(point.x - room.x) < room.width / 2 && Math.abs(point.z - room.z) < room.depth / 2)?.id;
    const start = roomAt(c.player()), target = roomAt(goal), queue = [{ room: start, route: [] }], seen = new Set([start]);
    let route;
    for (const node of queue) {
      if (node.room === target) { route = node.route; break; }
      for (const portal of layout.portals.filter(portal => portal.roomId === node.room && dungeonRoomPortalOpen(portal, state.clearedStages, state.objects.filter(object => object.activated).map(object => object.id)))) {
        if (!seen.has(portal.targetRoomId)) { seen.add(portal.targetRoomId); queue.push({ room: portal.targetRoomId, route: [...node.route, portal] }); }
      }
    }
    assert(route?.length, `open room portal route ${state.kind}: ${start} -> ${target}`);
    for (const portal of route) {
      await walk(c, portal); c.send({ type: 'dungeonInteract', targetId: portal.id });
      await until(() => Math.hypot(c.player().x - portal.destination.x, c.player().z - portal.destination.z) < .01, `room teleport ${portal.id}`);
    }
    return walk(c, goal);
  }
  assert(path.length, `route ${JSON.stringify(goal)}`);
  for (const point of path) while (Math.hypot(c.player().x - point.x, c.player().z - point.z) > 1e-6) {
    await tick(450);
    const p = c.player(), gap = Math.hypot(point.x - p.x, point.z - p.z);
    if (gap <= 1e-6) continue;
    const step = Math.min(2.5, gap), next = { x: p.x + (point.x - p.x) * step / gap, z: p.z + (point.z - p.z) * step / gap };
    assert(canTraverse(p, next, colliders, state ? dungeonBounds(state.kind) : WORLD_BOUNDS), `movement segment ${JSON.stringify({ dungeon: state?.kind, from: { x: p.x, z: p.z }, next, waypoint: point, goal })}`);
    c.send({ type: 'move', zone: p.zone, ...next, rotation: 0 }); await until(() => Math.hypot(c.player().x - next.x, c.player().z - next.z) < 1e-6, 'physical movement').catch(error=>{throw new Error(error.message+' '+JSON.stringify({goal,next,position:{x:c.player().x,z:c.player().z},hp:c.player().hp,status:c.player().duelStatus,events:c.messages.slice(-6).filter(m=>m.type!=="snapshot")}));});
  }
}
async function defeatEnemy(client, enemy) {
  const target = client.snapshot.enemies.find(candidate => candidate.id === enemy.id);
  assert(target?.alive, 'the real enemy is alive before its attack check');
  await walk(client, { x: target.x, z: target.z + 2 }); client.send({ type: 'autoAttack', targetId: target.id });
  for (let attempts = 0; attempts < 60 && client.snapshot.enemies.find(candidate => candidate.id === target.id)?.alive; attempts++) {
    await tick(1500); assert(client.player().hp > 0, `survive while clearing ${target.name}`);
  }
  await until(() => !client.snapshot.enemies.find(candidate => candidate.id === target.id)?.alive, `${target.name} defeated by real attacks`);
  client.send({ type: 'autoAttack', targetId: null });
}
async function clearOpening(client) {
  for (const enemy of client.snapshot.enemies.filter(enemy => enemy.alive && inStage(enemy, 'threshold'))) await defeatEnemy(client, enemy);
  await until(() => client.snapshot.dungeon.clearedStages.includes('threshold'), 'all opening guardians defeated');
}
try {
  assert.deepEqual(DUNGEONS.map(d => [d.minLevel, d.maxLevel]), [[10, 14], [15, 19], [20, 24], [25, 30], [30, 35], [40, 45], [50, 55]]);
  assert.equal(getDungeon(), DUNGEONS[0]); assert.equal(getDungeon('__proto__'), undefined);
  assert(crossedDungeonPortal({ x: -1, z: 2 }, { x: 1, z: -1 }, { x: 0, z: 0 }), 'swept inward step intersects the opening');
  assert(!crossedDungeonPortal({ x: 0, z: -1 }, { x: 0, z: 2 }, { x: 0, z: 0 }), 'walking outward does not enter');
  assert(!crossedDungeonPortal({ x: 4, z: 2 }, { x: 4, z: -1 }, { x: 0, z: 0 }), 'walking beside the arch does not enter');
  assert(!crossedDungeonPortal({ x: 0, z: 1 }, { x: 0, z: 1 }, { x: 0, z: 0 }), 'standing beside a portal does not enter');
  for (const d of DUNGEONS) {
    assert.equal(dungeonStages(d.id).length, DUNGEONS.indexOf(d) < 4 ? 8 : 24); assert(dungeonStages(d.id).every(s => s.level >= d.minLevel && s.level <= d.maxLevel));
    assert.equal(surfaceAt(d.entrance.x, d.entrance.z).zone, d.entrance.zone); assert(!surfaceAt(d.entrance.x, d.entrance.z).water);
    for (const route of DUNGEON_TEMPLE_ROUTES) {
      const approach = route.map(point => ({ x: d.entrance.x + point.x, z: d.entrance.z + point.z }));
      for (let i = 1; i < approach.length; i++) assert(canTraverse(approach[i-1], approach[i]), `${d.id} breached-wall route segment ${i} is physically open`);
      const path = findPath(approach[0], approach.at(-1), WORLD_COLLIDERS, WORLD_BOUNDS);
      assert(path.length && Math.hypot(path.at(-1).x-d.entrance.x,path.at(-1).z-d.entrance.z)<.01, `${d.id} pathfinding reaches the portal from each temple breach`);
    }
    const landing = { x: d.summonStone.x, z: d.summonStone.z + 2 };
    assert(canTraverse(landing, landing), `${d.id} summoned member lands outside the stone and walls`);
    assert(findPath(landing, { x: d.entrance.x, z: d.entrance.z + 1 }, WORLD_COLLIDERS, WORLD_BOUNDS).length, `${d.id} summon landing connects to its portal`);
    const bounds = dungeonBounds(d.id), checkpoint = dungeonCheckpoint(d.id), finalPortal = dungeonReturn(d.id);
    const secured = dungeonLayout(d.id).checkpointStages, checkpointColliders = dungeonColliders(secured, ['verdant-seal', 'glacial-seal'], d.id);
    assert(canTraverse(checkpoint, checkpoint, checkpointColliders, bounds), 'checkpoint reset lands on clear paving');
    assert(dungeonLayout(d.id).portals.some(portal => portal.roomId === 'confluence' && portal.targetRoomId === 'reliquary' && dungeonRoomPortalOpen(portal, secured, ['verdant-seal', 'glacial-seal'])), 'checkpoint retains a portal into deeper rooms');
    assert(dungeonLayout(d.id).portals.filter(portal => portal.targetRoomId === 'throne' && portal.requires.length).every(portal => !dungeonRoomPortalOpen(portal, secured, ['verdant-seal', 'glacial-seal'])), 'checkpoint reset seals the final room');
    assert(canTraverse(DUNGEON_START, DUNGEON_START, dungeonColliders([], [], d.id), bounds), 'fresh entry and rejoin start is clear');
  }
  assert.equal(new Set(DUNGEONS.map(d => dungeonStages(d.id).map(s => s.name).join())).size, DUNGEONS.length);
  for (const stats of Object.values(MONSTERS)) Object.assign(stats, { speed: 0, aggroRange: 0 });
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([id, p]) => [createHash('sha256').update(tokens[id]).digest('hex'), { characters: [p] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', mountRandomInt: max => { assert.equal(max, 10_000); mountRolls++; return 0; } }); port = await game.start();
  const c = {}; for (const name of Object.keys(heroes)) c[name] = await connect(name);
  assert(Object.values(c).every(client => !client.snapshot.instanceId), 'initial presence beside a portal never enters on its own');
  await reject(c.rootLocked, { type: 'move', x: DUNGEONS[0].entrance.x, z: DUNGEONS[0].entrance.z, rotation: 0 }, /guardian/);
  assert.equal(c.rootLocked.snapshot.instanceId, null, 'walking cannot bypass the Rootvault guardian');
  let previousHp = 0;
  for (const d of DUNGEONS) {
    await reject(c[`${d.id}Low`], { type: 'dungeonEnter', dungeonId: d.id }, new RegExp(`level ${d.minLevel}`)); assert.equal(c[`${d.id}Low`].snapshot.instanceId, null);
    const novice = c[`${d.id}Low`], before = { x: novice.player().x, z: novice.player().z }, crossing = { type: 'move', x: d.entrance.x, z: d.entrance.z, rotation: 0 };
    await reject(novice, crossing, new RegExp(`level ${d.minLevel}`));
    assert.deepEqual({ x: novice.player().x, z: novice.player().z }, before, 'ineligible portal crossing returns to the approach');
    const noticeCount = novice.messages.filter(m => m.type === 'event' && m.text.includes(`level ${d.minLevel}`)).length;
    for (let repeat = 0; repeat < 3; repeat++) { novice.send(crossing); await tick(200); }
    assert.equal(novice.messages.filter(m => m.type === 'event' && m.text.includes(`level ${d.minLevel}`)).length, noticeCount, 'holding movement into a locked portal does not spam notices');
    await tick(); c[d.id].send(crossing); await until(() => c[d.id].snapshot.dungeon?.kind === d.id, `${d.id} minimum level walks through portal`);
    const state = c[d.id].snapshot; assert.equal(state.dungeon.name, d.name); assert.equal(state.dungeon.rooms, dungeonStages(d.id).length);
    const opening = dungeonStages(d.id).filter(stage => !stage.requires.length).flatMap(stage => stage.enemies.map(enemy => ({ ...enemy, level: stage.level })));
    assert.deepEqual(state.enemies.map(enemy => [enemy.kind, enemy.level]), opening.map(enemy => [enemy.kind, enemy.level]));
    const hp = state.enemies.reduce((sum, e) => sum + e.maxHp, 0); if (d.minLevel < 30) assert(hp > previousHp, 'legacy successive opening encounters grow in actual HP'); previousHp = hp;
    for (const enemy of state.enemies) assert.equal(enemy.maxHp, monsterStatsAtLevel(enemy.kind, enemy.level).hp, 'new opening encounters retain the shared continuous level curve');
    assert.deepEqual(state.enemies.map(e => e.kind), opening.map(e => e.kind));
    if (DUNGEONS.indexOf(d) >= 4) {
      const client = c[d.id], health = client.player().hp, kinds = [...new Set(opening.map(e => e.kind))];
      assert(inDungeonPreparation(client.player(), d.id), 'teleport lands inside the preparation room');
      const saved = kinds.map(kind => [kind, { ...MONSTERS[kind] }]);
      try {
        for (const kind of kinds) Object.assign(MONSTERS[kind], { aggroRange: 1000, range: 1000, speed: 20 });
        await tick(10000); await tick(10000);
        assert.equal(client.player().hp, health, 'arrival remains safe as time passes with exaggerated enemy detection');
        assert(client.snapshot.enemies.every(enemy => !enemy.attack), 'preparing players never start enemy attacks');
        await reject(client, { type: 'autoAttack', targetId: state.enemies[0].id }, /Arrival Sanctuary/);
        await reject(client, { type: 'attack', ability: 'arrow', targetId: state.enemies[0].id }, /Arrival Sanctuary/);
        assert(client.snapshot.enemies.every(enemy => enemy.hp === enemy.maxHp), 'outgoing sanctuary attacks never deal damage');
        if (client.player().learnedSpells.includes('wild-renewal')) {
          await tick(); client.send({ type: 'attack', ability: 'wild-renewal' });
          await until(() => client.player().casting, 'friendly recovery channel is permitted inside the sanctuary');
          client.send({ type: 'cancelCast' }); await until(() => !client.player().casting, 'preparation channel cancelled');
        }
      } finally { for (const [kind, stats] of saved) Object.assign(MONSTERS[kind], stats); }
    }

  }
  assert.equal(new Set(DUNGEONS.map(d => c[d.id].snapshot.instanceId)).size, DUNGEONS.length, 'each expedition is isolated');
  assert.equal(c.outsider.snapshot.enemies.some(e => e.instanceId), false);
  if (process.argv.includes('--portals-only')) {
    // Opening HP was already verified above; fresh low-HP instances keep real kill checks focused on sealing.
    for (const stats of Object.values(MONSTERS)) stats.hp = 1;
    for (const definition of DUNGEONS) {
      const client = c[definition.id], layout = dungeonLayout(definition.id), portal = layout.portals.find(portal => portal.roomId === 'preparation');
      client.send({ type: 'dungeonExit' }); await until(() => !client.snapshot.instanceId, 'leave the verified opening from its sanctuary');
      const partyMember = definition.id === 'cindercrypt' ? c.leader : null;
      if (partyMember) { await party(client, partyMember); await walk(partyMember, { x: definition.entrance.x, z: definition.entrance.z + 1 }); }
      client.send({ type: 'dungeonEnter', dungeonId: definition.id }); await until(() => client.snapshot.dungeon?.kind === definition.id, 'fresh opening for real kill checks');
      if (partyMember) await until(() => partyMember.snapshot.instanceId === client.snapshot.instanceId, 'party enters the same test instance');
      const locked = layout.portals.find(portal => portal.roomId === 'threshold' && portal.targetRoomId === 'crossing');
      await reject(client, { type: 'dungeonInteract', targetId: portal.id }, /Stand beside/);
      await reject(client, { type: 'dungeonInteract', targetId: portal.id, destination: portal.destination }, /Choose a dungeon object/);
      await reject(client, { type: 'dungeonInteract', targetId: 'forged-portal' }, /Stand beside/);
      await walk(client, portal); const departure = { x: client.player().x, z: client.player().z }, before = client.messages.length;
      client.send({ type: 'dungeonInteract', targetId: portal.id });
      client.send({ type: 'move', ...departure, rotation: 0 });
      await until(() => Math.hypot(client.player().x - portal.destination.x, client.player().z - portal.destination.z) < .01, `${definition.id} authoritative room teleport`);
      await tick(100);
      assert(!client.messages.slice(before).some(message => /Movement was too fast/.test(message.text || message.reason || '')), 'queued departure movement causes no false cheat strike');
      assert.equal(client.snapshot.dungeon.kind, definition.id); assert(!inDungeonPreparation(client.player(), definition.id));
      await walk(client, locked); await reject(client, { type: 'dungeonInteract', targetId: locked.id }, /sealed/);
      const back = layout.portals.find(portal => portal.roomId === 'threshold' && portal.targetRoomId === 'preparation');
      await walk(client, back);
      const runId = client.snapshot.instanceId, remain = () => client.snapshot.enemies.filter(enemy => enemy.alive && inStage(enemy, 'threshold'));
      const assertSealed = async label => {
        const position = { x: client.player().x, z: client.player().z };
        await reject(client, { type: 'dungeonInteract', targetId: back.id }, /sealed/);
        assert.equal(client.snapshot.instanceId, runId, label); assert.deepEqual({ x: client.player().x, z: client.player().z }, position, label);
        await reject(client, { type: 'dungeonExit' }, /entrance exit|after clearing/);
        assert.equal(client.snapshot.instanceId, runId, 'forged dungeon exit cannot escape the active room');
      };
      await assertSealed('the room seals its entrance immediately upon arrival');
      if (partyMember) {
        await walk(partyMember, back);
        await reject(client, { type: 'partyLeave' }, /clear|Clear|defeat|Defeat|sealed/);
        await reject(client, { type: 'partyKick', targetId: partyMember.id }, /clear|Clear|defeat|Defeat|sealed/);
        assert.equal(partyMember.snapshot.instanceId, runId); assert(client.snapshot.party.members.some(member => member.id === partyMember.id));
      }
      const guardians = remain(); assert(guardians.length >= 2);
      for (const enemy of guardians.slice(0, -1)) await defeatEnemy(client, enemy);
      assert.equal(remain().length, 1, 'all but the last room monster have died');
      assert(!client.snapshot.dungeon.clearedStages.includes('threshold'));
      await walk(client, back); await assertSealed('one surviving monster keeps every room exit sealed');
      await defeatEnemy(client, remain()[0]);
      await until(() => client.snapshot.dungeon.clearedStages.includes('threshold'), 'the last death authoritatively unlocks the chamber');
      if (partyMember) {
        client.send({ type: 'partyKick', targetId: partyMember.id });
        await until(() => !partyMember.snapshot.instanceId && !partyMember.snapshot.party, 'clearing permits party removal from the chamber');
      }
      await walk(client, back); client.send({ type: 'dungeonInteract', targetId: back.id });
      await until(() => inDungeonPreparation(client.player(), definition.id), `${definition.id} cleared-room return portal`);
      if (partyMember) {
        await walk(client, portal); client.send({ type: 'dungeonInteract', targetId: portal.id });
        await until(() => !inDungeonPreparation(client.player(), definition.id), 'reenter the cleared chamber');
        client.send({ type: 'partyLeave' }); await until(() => !client.snapshot.instanceId && !client.snapshot.party, 'clearing permits leaving the party from the chamber');
      }
      console.log(`PASS ${definition.id} real WebSocket portals: spoof/distance/locked/forged-exit rejection, immediate and last-monster return seals, real-kill unlock, explicit travel, stale movement correction and cleared-room backtracking${partyMember ? '; party leave/kick cannot bypass combat seals' : ''}.`);
    }
  } else if (process.argv.includes('--preparation-only')) {
    for (const stats of Object.values(MONSTERS)) stats.hp = 1;
    for (const definition of DUNGEONS.slice(4)) {
      const client = c[definition.id];
      client.send({ type: 'dungeonExit' }); await until(() => !client.snapshot.instanceId, 'leave verified sanctuary');
      client.send({ type: 'dungeonEnter', dungeonId: definition.id }); await until(() => client.snapshot.dungeon?.kind === definition.id, 'fresh opening for sanctuary combat');
      const kinds = [...new Set(client.snapshot.enemies.map(enemy => enemy.kind))];
      const saved = kinds.map(kind => [kind, { ...MONSTERS[kind] }]);
      try {
        for (const kind of kinds) Object.assign(MONSTERS[kind], { aggroRange: 1000, speed: 20, damage: 1 });
        const hp = client.player().hp;
        const threshold = dungeonStages(definition.id).find(stage => stage.id === 'threshold');
        await walk(client, { x: threshold.x, z: threshold.z + 10 });
        await until(() => client.snapshot.enemies.some(enemy => enemy.attack), 'leaving the foyer permits actual enemy pursuit and attack', 15000);
        await tick(1800);
        await until(() => client.player().hp < hp, 'outside attacks inflict real damage');
        for (const kind of kinds) MONSTERS[kind].speed = 0;
        await clearOpening(client);
        await walk(client, DUNGEON_START);
        assert(inDungeonPreparation(client.player(), definition.id));
        const hits = () => client.messages.filter(message => message.type === 'damage' && message.targetId === client.id && !message.effect).length;
        const before = hits(); await tick(10000); await tick(10000);
        assert.equal(hits(), before, 'the sanctuary prevents in-flight and subsequent enemy damage after clearing');
        assert(client.snapshot.enemies.every(enemy => !inDungeonPreparation(enemy, definition.id)), 'pursuing enemies remain outside the arrival room');
        console.log(`PASS ${definition.id} real WebSocket sanctuary: safe entry/time passage, outgoing attacks rejected, friendly channel permitted when learned, outside aggro/damage, clear-before-return protection and enemy exclusion.`);
      } finally { for (const [kind, stats] of saved) Object.assign(MONSTERS[kind], stats); }
    }
  } else {
  // Engage a regular sentinel over the real protocol: the mechanic must not depend on a boss.
  const sentinel = c.rootvault.snapshot.enemies.find(e => e.kind === 'briar-sentinel');
  await walk(c.rootvault, { x: sentinel.x, z: sentinel.z + 6 });
  c.rootvault.send({ type: 'autoAttack', targetId: sentinel.id });
  const rootWarning = await until(() => c.rootvault.snapshot.dungeon.hazards.find(h => h.sourceId === sentinel.id), 'normal sentinel root warning');
  assert.equal(rootWarning.kind, 'roots'); assert(rootWarning.label.includes('move out')); assert.equal(rootWarning.endsAt - rootWarning.startedAt, 1800);
  assert(c.rootvault.snapshot.dungeon.objectives.includes(rootWarning.label), 'live warning instruction is visible');
  assert(!('sourceLevel' in rootWarning) && !('corpse' in rootWarning), 'private resolution metadata stays on server');
  c.rootvault.send({ type: 'autoAttack', targetId: null });
  const openingKinds = [...new Set(c.rootvault.snapshot.enemies.filter(enemy => inStage(enemy, 'threshold')).map(enemy => enemy.kind))];
  const savedOpeningDamage = openingKinds.map(kind => [kind, MONSTERS[kind].damage]);
  try {
    for (const kind of openingKinds) MONSTERS[kind].damage = 0;
    // Keep the live root-warning assertion, then finish this room before testing its return path.
    await defeatEnemy(c.rootvault, c.rootvault.snapshot.enemies.find(enemy => enemy.id === sentinel.id));
    await clearOpening(c.rootvault);
  } finally { for (const [kind, damage] of savedOpeningDamage) MONSTERS[kind].damage = damage; }
  await walk(c.rootvault, DUNGEON_START);
  if (!onlyDungeon) {
  for (const d of DUNGEONS) { c[d.id].send({ type: 'dungeonExit' }); await until(() => !c[d.id].snapshot.instanceId, 'start exit remains usable'); }
  await reject(c.leader, { type: 'dungeonEnter', dungeonId: '__proto__' }, /available dungeon/);
  await party(c.leader, c.ally); await party(c.leader, c.cindercryptLow);
  await reject(c.leader, { type: 'dungeonEnter', dungeonId: cinder.id }, /level 15/);
  await reject(c.leader, { type: 'dungeonSummon', dungeonId: cinder.id, targetId: c.cindercryptLow.id }, /summon stone/);
  c.leader.send({ type: 'partyKick', targetId: c.cindercryptLow.id }); await until(() => !c.cindercryptLow.snapshot.party, 'underlevel party member removed');
  await reject(c.leader, { type: 'dungeonSummon', dungeonId: cinder.id, targetId: c.outsider.id }, /summon stone/);
  const before = { x: c.ally.player().x, z: c.ally.player().z };
  let request = await offer(c.leader, c.ally);
  assert.deepEqual({ x: c.ally.player().x, z: c.ally.player().z }, before, 'request never forces teleport'); assert.equal(c.outsider.snapshot.dungeonSummon, null, 'summon is private');
  await reject(c.outsider, { type: 'dungeonSummonRespond', summonId: request.id, accept: true }, /unavailable/);
  await reject(c.ally, { type: 'dungeonSummonRespond', summonId: request.id, accept: 'yes' }, /unavailable/);
  c.ally.send({ type: 'dungeonSummonRespond', summonId: request.id, accept: false }); await until(() => !c.ally.snapshot.dungeonSummon, 'decline consumed');
  assert.deepEqual({ x: c.ally.player().x, z: c.ally.player().z }, before);
  request = await offer(c.leader, c.ally); await tick(61000); await until(() => !c.ally.snapshot.dungeonSummon, 'expiry cleared');
  await reject(c.ally, { type: 'dungeonSummonRespond', summonId: request.id, accept: true }, /unavailable/);
  request = await offer(c.leader, c.ally); await walk(c.leader, { x: stone.x, z: stone.z + 5 });
  await reject(c.ally, { type: 'dungeonSummonRespond', summonId: request.id, accept: true }, /no longer available/); assert.deepEqual({ x: c.ally.player().x, z: c.ally.player().z }, before);
  await walk(c.leader, stone); request = await offer(c.leader, c.ally); c.ally.send({ type: 'partyLeave' }); await until(() => !c.ally.snapshot.party, 'party left');
  await reject(c.ally, { type: 'dungeonSummonRespond', summonId: request.id, accept: true }, /no longer available/);
  await party(c.leader, c.ally); request = await offer(c.leader, c.ally);
  c.ally.send({ type: 'attack', ability: 'wild-renewal' }); await until(() => c.ally.player().casting, 'target starts channeling');
  await reject(c.ally, { type: 'dungeonSummonRespond', summonId: request.id, accept: true }, /no longer available/);
  c.ally.send({ type: 'cancelCast' }); await until(() => !c.ally.player().casting, 'channel cancelled');
  request = await offer(c.leader, c.ally); c.outsider.send({ type: 'duelRequest', targetId: c.ally.id });
  const duel = await until(() => c.ally.snapshot.duelInvites[0], 'duel offered'); c.ally.send({ type: 'duelAccept', invitationId: duel.id }); await until(() => c.ally.snapshot.duel, 'target enters combat');
  await reject(c.ally, { type: 'dungeonSummonRespond', summonId: request.id, accept: true }, /no longer available/);
  await reject(c.leader, { type: 'dungeonSummon', dungeonId: cinder.id, targetId: c.ally.id }, /summon stone/);
  c.ally.send({ type: 'duelForfeit' }); await until(() => !c.ally.snapshot.duel, 'combat ended');
  request = await offer(c.leader, c.ally); c.ally.send({ type: 'dungeonSummonRespond', summonId: request.id, accept: true });
  await until(() => Math.hypot(c.ally.player().x - stone.x, c.ally.player().z - stone.z) < .01, 'consensual summon arrives at the stone'); assert.equal(c.ally.snapshot.instanceId, null);
  await reject(c.ally, { type: 'dungeonSummonRespond', summonId: request.id, accept: true }, /unavailable/);
  for (const stats of Object.values(MONSTERS)) stats.hp = 1;
  const entrance = { x: cinder.entrance.x, z: cinder.entrance.z + 1 };
  await walk(c.leader, entrance); await walk(c.ally, entrance);
  assert.equal(c.ally.snapshot.instanceId, null, 'moving between the summon stone and approach does not auto-enter');
  await tick(); c.ally.send({ type: 'move', x: cinder.entrance.x, z: cinder.entrance.z, rotation: Math.PI });
  await until(() => c.ally.snapshot.instanceId, 'nonleader walks into the dungeon'); assert.equal(c.leader.snapshot.instanceId, null, 'walking in never teleports other party members');
  const runId = c.ally.snapshot.instanceId;
  await tick(); c.leader.send({ type: 'move', x: cinder.entrance.x, z: cinder.entrance.z, rotation: Math.PI });
  await until(() => c.leader.snapshot.instanceId === runId, 'leader walking later joins the same party run');
  c.ally.send({ type: 'dungeonExit' }); await until(() => !c.ally.snapshot.instanceId, 'member leaves');
  await tick(); c.ally.send({ type: 'move', x: cinder.entrance.x, z: cinder.entrance.z, rotation: Math.PI }); await until(() => c.ally.snapshot.instanceId === runId, 'member walks back into existing run');
  await reject(c.leader, { type: 'dungeonSummon', dungeonId: cinder.id, targetId: c.ally.id }, /summon stone/);
  for (const stage of dungeonStages(cinder.id)) {
    await until(() => c.leader.snapshot.enemies.some(e => inStage(e, stage.id)), `${stage.id} spawned`);
    if (stage.id === 'throne') { await walk(c.leader, dungeonReturn(cinder.id)); await reject(c.leader, { type: 'dungeonExit' }, /after clearing/); assert.equal(c.leader.snapshot.instanceId, runId); }
    for (const enemy of c.leader.snapshot.enemies.filter(e => e.alive && inStage(e, stage.id))) {
      await walk(c.leader, { x: enemy.x, z: enemy.z + 2 }); c.leader.send({ type: 'autoAttack', targetId: enemy.id });
      for (let attempts = 0; attempts < 8 && c.leader.snapshot.enemies.find(e => e.id === enemy.id)?.alive; attempts++) await tick(1500);
      await until(() => !c.leader.snapshot.enemies.find(e => e.id === enemy.id)?.alive, `${stage.id} enemy defeated`);
    }
    await until(() => c.leader.snapshot.dungeon.clearedStages.includes(stage.id), `${stage.id} cleared`);
    for (const object of dungeonLayout(cinder.id).objects.filter(o => o.stageId === stage.id && o.kind !== 'chest')) { await walk(c.leader, { x: object.x, z: object.z + 1.5 }); c.leader.send({ type: 'dungeonInteract', targetId: object.id }); await until(() => c.leader.snapshot.dungeon.objects.find(o => o.id === object.id).activated, `${object.id} activated`); }
  }
  const corpseWarnings = c.leader.messages.filter(m => m.type === 'snapshot').flatMap(m => m.dungeon?.hazards || []).filter(h => h.label?.startsWith('Volatile shell'));
  assert(corpseWarnings.length, 'actual beetle kills publish death warnings over WebSocket');
  assert(corpseWarnings.every(h => h.kind === 'fire' && h.endsAt - h.startedAt === 1600), 'each corpse gives a full 1.6 second warning');
  assert(c.leader.snapshot.dungeon.completed); assert(c.ally.player().xp >= cinder.completionXp, 'waiting party members receive completion plus any nearby kill credit'); assert.equal(c.leader.player().contracts.active['hollow-vault'], undefined, 'other dungeons do not complete Rootvault contract');
  const xp = c.leader.player().xp; await tick(5000); assert.equal(c.leader.player().xp, xp, 'completion pays once');
  for (const member of [c.leader, c.ally]) {
    assert.equal(member.player().achievements.dungeons.cindercrypt, 1, 'actual dungeon completion credits each present party member once');
    assert(member.player().achievements.unlocked['cindercrypt-conqueror']);
    assert.equal(member.messages.filter(m => m.type === 'achievement' && m.achievementId === 'cindercrypt-conqueror').length, 1, 'one dungeon achievement toast per player');
  }
  assert(c.leader.snapshot.dungeon.result.items.some(item => item.itemId === 'relic' && item.quantity === 4), 'Cindercrypt clear awards base relics and upgrade relics once');
  const cinderReturn = dungeonReturn(cinder.id);
  await walk(c.leader, { x: cinderReturn.x, z: cinderReturn.z + 1 }); await tick();
  c.leader.send({ type: 'move', ...cinderReturn, rotation: Math.PI }); await until(() => !c.leader.snapshot.instanceId, 'walking through the completed final return portal exits');
  assert.deepEqual({ x: c.leader.player().x, z: c.leader.player().z }, { x: cinder.entrance.x, z: cinder.entrance.z + 2 }, 'final portal returns to the matching overworld approach');
  c.leader.send({ type: 'dungeonEnter', dungeonId: cinder.id }); await until(() => c.leader.snapshot.instanceId === runId && c.leader.snapshot.dungeon.completed, 'completed run cannot be recreated for duplicate rewards'); assert.equal(c.leader.player().xp, xp);
  console.log('PASS legacy Cindercrypt progression, private summons, party rejoin, checkpoint and once-only final rewards.');
  } else {
    for (const definition of DUNGEONS) { c[definition.id].send({ type: 'dungeonExit' }); await until(() => !c[definition.id].snapshot.instanceId, 'focused run leaves initial entry'); }
    for (const stats of Object.values(MONSTERS)) stats.hp = 1;
  }
  async function defeatStage(client, definition, stage) {
    await until(() => client.snapshot.enemies.some(e => inStage(e, stage.id)), `${definition.id}/${stage.id} spawned`);
    const stageEnemies = client.snapshot.enemies.filter(e => e.alive && inStage(e, stage.id));
    assert.equal(stageEnemies.length, stage.enemies.length, 'the real instance contains the entire authored encounter pack');
    for (const enemy of stageEnemies) {
      // Full clears traverse every spike lane; keep the fixture supplied through
      // ordinary potion actions while preserving real hazards and wipe checks.
      while(client.player().hp>0&&client.player().hp<client.player().maxHp*.8){
        await tick(1250);if(client.player().hp>=client.player().maxHp*.8)break;
        const potions=client.player().inventory.potion;assert(potions>0,'full-clear fixture has healing supplies');
        client.send({type:'heal'});await until(()=>client.player().inventory.potion<potions||client.player().hp<=0,'delver drinks potion');
      }
      assert(client.player().hp>0,'delver survives the route before the next encounter');
      await walk(client, enemy, 2); client.send({ type: 'autoAttack', targetId: enemy.id });
      for (let attempts = 0; attempts < 8 && client.snapshot.enemies.find(e => e.id === enemy.id)?.alive; attempts++) await tick(1500);
      await until(() => !client.snapshot.enemies.find(e => e.id === enemy.id)?.alive, `${definition.id}/${stage.id}/${enemy.kind} defeated`);
    }
    client.send({ type: 'autoAttack', targetId: null });
    await until(() => client.snapshot.dungeon.clearedStages.includes(stage.id), `${definition.id}/${stage.id} cleared`);
    for (const object of dungeonLayout(definition.id).objects.filter(o => o.stageId === stage.id)) {
      const alreadyOpened = client.snapshot.dungeon.objects.find(o => o.id === object.id).activated;
      await walk(client, object.kind === 'chest' ? { x: object.x, z: object.z + 2 } : object);
      if (alreadyOpened) {
        const count = client.messages.filter(m => m.type === 'event' && m.text === `${object.label} opened. Collect your personal treasure.`).length;
        await reject(client, { type: 'dungeonInteract', targetId: object.id }, /nearby guardians/);
        assert.equal(client.messages.filter(m => m.type === 'event' && m.text === `${object.label} opened. Collect your personal treasure.`).length, count, 'checkpoint wipes never duplicate an opened optional cache');
        continue;
      }
      client.send({ type: 'dungeonInteract', targetId: object.id });
      await until(() => client.snapshot.dungeon.objects.find(o => o.id === object.id).activated, `${definition.id}/${object.id} activated`);
      if (object.kind === 'checkpoint') assert(client.snapshot.dungeon.checkpoint.active, 'midpoint boss unlocks the healing checkpoint');
      if (object.kind === 'chest') assert(client.snapshot.loot.some(drop => drop.ownerId === client.id && drop.sourceObjectId === object.id), 'room caches create personal loot even after final completion');
    }
    console.log(`PASS ${definition.id}/${stage.id}: encounter and room interactions.`);
    return stageEnemies;
  }
  async function defeatPlayers(members, source) {
    for (const member of members) { member.send({ type: 'autoAttack', targetId: null }); await walk(member, { x: source.x, z: source.z + 1 }); }
    const stats = MONSTERS[source.kind], saved = { damage: stats.damage, aggroRange: stats.aggroRange };
    const beforeDeath=members.map(member=>({wipes:member.snapshot.dungeon.wipes,messages:member.messages.length}));
    Object.assign(stats, { damage: 100000, aggroRange: 8 });
    try {
      for (let attempts = 0; attempts < 30 && members.some(member => member.player().hp > 0); attempts++) await tick(350);
      assert(members.every(member => member.player().hp === 0), 'real enemy attacks defeat the test party '+JSON.stringify(members.map((member,index)=>({hp:member.player().hp,beforeWipes:beforeDeath[index].wipes,wipes:member.snapshot.dungeon.wipes,source:member.snapshot.enemies.find(enemy=>enemy.id===source.id),events:member.messages.slice(beforeDeath[index].messages).filter(message=>message.type!=='snapshot').slice(-8)}))));
    } finally { Object.assign(stats, saved); }
  }
  for (const definition of DUNGEONS.slice(4).filter(dungeon => !onlyDungeon || dungeon.id === onlyDungeon)) {
    let client = c[definition.id];
    const stages = dungeonStages(definition.id), optional = stages.filter(stage => stage.optional), required = stages.filter(stage => !stage.optional);
    assert.equal(optional.length, 16); assert.equal(required.length, 8);
    assert.equal(stages.reduce((sum, stage) => sum + stage.enemies.length, 0), definition.id === 'veilhaven' ? 96 : 93);
    if (definition.id === 'plagueworks') await party(client, c.recoveryAlly);
    await tick(); client.send({ type: 'dungeonEnter', dungeonId: definition.id });
    await until(() => client.snapshot.dungeon?.kind === definition.id, `${definition.id} starts full progression test`);
    const members = definition.id === 'plagueworks' ? [client, c.recoveryAlly] : [client];
    let midpointId, finalId, visitedOptional;
    for (const stage of required) {
      const enemies = await defeatStage(client, definition, stage);
      if (stage.id === 'confluence' || stage.id === 'throne') {
        const boss = enemies.find(e => e.kind === stage.enemies.find(enemy => enemy.boss).kind);
        assert.equal(boss.name, MONSTERS[boss.kind].name, 'both bosses retain their unique identity');
        if (stage.id === 'confluence') midpointId = boss.id; else finalId = boss.id;
      }
      if (stage.id !== 'throne') assert(!client.snapshot.dungeon.completed, 'a midpoint boss never completes the dungeon');
      if (stage.id === 'confluence') {
        const saved = client.snapshot.dungeon, runId = client.snapshot.instanceId;
        const enemyState = client.snapshot.enemies.map(enemy => [enemy.id, enemy.alive]);
        await Promise.all(members.map(member => new Promise(resolve => { member.socket.once('close', resolve); member.socket.close(); })));
        await tick(0);
        client = c[definition.id] = await connect(definition.id); members[0] = client;
        if (members.length > 1) members[1] = c.recoveryAlly = await connect('recoveryAlly');
        for (const member of members) {
          assert.equal(member.snapshot.party, null, 'disconnect does not require reconstructing the old party');
          member.send({ type: 'dungeonEnter', dungeonId: definition.id });
          await until(() => member.snapshot.instanceId === runId, 'disconnected original adventurer resumes the same run');
          assert.deepEqual({ x: member.player().x, z: member.player().z }, dungeonCheckpoint(definition.id));
          assert.deepEqual([...member.snapshot.dungeon.clearedStages].sort(), [...saved.clearedStages].sort());
          assert.deepEqual(member.snapshot.dungeon.objects.map(object => [object.id, object.activated]), saved.objects.map(object => [object.id, object.activated]));
          assert.equal(member.snapshot.dungeon.startedAt, saved.startedAt);
        }
        assert.deepEqual(client.snapshot.enemies.map(enemy => [enemy.id, enemy.alive]), enemyState, 'whole-party disconnect preserves enemy identities and defeated guards');
      }
      if (stage.id === 'east-seal') {
        const layout = dungeonLayout(definition.id);
        visitedOptional = optional.find(room => room.id.endsWith('-east-branch') && layout.objects.some(object => object.stageId === room.id && object.kind === 'chest')
          && layout.portals.some(portal => portal.targetRoomId === room.id.replace('-east-branch', '-west-branch') && client.snapshot.dungeon.clearedStages.includes(portal.roomId)));
        await defeatStage(client, definition, optional.find(room => room.id === visitedOptional.id.replace('-east-branch', '-west-branch')));
        assert(visitedOptional, 'checkpoint test opens a real optional cache before the wipe');
        await defeatStage(client, definition, visitedOptional);
      }
      if (stage.id === 'confluence') {
        const checkpoint = dungeonCheckpoint(definition.id), candidate = optional.find(room => room.id !== visitedOptional.id && room.requires.every(id => client.snapshot.dungeon.clearedStages.includes(id)));
        const source = client.snapshot.enemies.find(enemy => enemy.alive && inStage(enemy, candidate.id));
        const before = [...client.snapshot.dungeon.clearedStages];
        if (members.length > 1) {
          await defeatPlayers([client], source); await tick(1800); client.send({ type: 'respawn' });
          await until(() => client.player().hp > 0 && Math.hypot(client.player().x - checkpoint.x, client.player().z - checkpoint.z) < .01, 'individual respawn uses the expanded sanctuary');
          assert.equal(client.snapshot.dungeon.wipes, 0); assert.deepEqual(client.snapshot.dungeon.clearedStages, before, 'individual respawn does not clear or reset encounters');
          await walk(c.recoveryAlly, DUNGEON_START);
          c.recoveryAlly.send({ type: 'dungeonExit' }); await until(() => !c.recoveryAlly.snapshot.instanceId, 'waiting member leaves through entrance');
          await tick(); c.recoveryAlly.send({ type: 'dungeonEnter', dungeonId: definition.id });
          await until(() => c.recoveryAlly.snapshot.instanceId === client.snapshot.instanceId && Math.hypot(c.recoveryAlly.player().x - checkpoint.x, c.recoveryAlly.player().z - checkpoint.z) < .01, 'party rejoin uses the expanded sanctuary');
        }
        await defeatPlayers(members, source); await tick(1900);
        await until(() => client.snapshot.dungeon.wipes === 1 && client.player().hp > 0, `${definition.id} full party wipe restores checkpoint`);
        assert.deepEqual({ x: client.player().x, z: client.player().z }, checkpoint);
        assert.deepEqual([...client.snapshot.dungeon.clearedStages].sort(), dungeonLayout(definition.id).checkpointStages.filter(id => before.includes(id)).sort());
        assert(optional.every(room => !client.snapshot.dungeon.clearedStages.includes(room.id)), 'checkpoint never marks unvisited optional rooms clear and optional encounters reset');
        assert(client.snapshot.enemies.some(enemy => enemy.alive && inStage(enemy, candidate.id)), 'unvisited optional guards remain after a wipe');
        for (const object of dungeonLayout(definition.id).objects.filter(object => object.stageId === visitedOptional.id && object.kind === 'chest')) assert(client.snapshot.dungeon.objects.find(o => o.id === object.id).activated, 'opened optional caches remain spent across wipes');
      }
    }
    assert(client.snapshot.dungeon.completed && client.snapshot.dungeon.result, 'final boss completes the run despite uncleared optional rooms');
    if (definition.id === 'veilhaven') {
      await until(() => client.snapshot.loot.some(drop => drop.ownerId === client.id && drop.enemyId === finalId && drop.items.some(item => item.itemId === 'verdant-revenant' && item.kind === 'item')), 'Veiled Abbess mount item reaches personal corpse');
      assert(!client.player().ownedMounts.includes('verdant-revenant'), 'a successful mount roll does not bypass collection and learning');
      assert.equal(mountRolls, 1, 'only the real final boss rolls the mount once for its credited player');
      assert.equal(client.player().carriedItems['verdant-revenant'] ?? 0, 0, 'mount awaits personal pickup');
    } else assert.equal(mountRolls, 0, 'other dungeon bosses never roll this mount');
    assert(optional.every(room => !client.snapshot.dungeon.clearedStages.includes(room.id)), 'side rooms remain uncleared after the boss');
    assert(client.snapshot.dungeon.objectives.some(objective => objective.includes('return portal')), 'completion explains the usable exit');
    const completionMessages = () => client.messages.filter(message => message.type === 'event' && message.kind === 'reward' && message.text.startsWith(`${definition.name.replace(/^The /, '')} cleared ·`)).length;
    assert.equal(completionMessages(), 1);
    const result = client.snapshot.dungeon.result;
    const startedAt = client.snapshot.dungeon.startedAt, beforeSideRooms = client.snapshot.dungeon.elapsedMs;
    for (const stage of optional) await defeatStage(client, definition, stage);
    assert.equal(client.snapshot.dungeon.clearedStages.length, 24, 'optional exploration can still clear every side room after completion');
    assert.equal(client.snapshot.dungeon.startedAt, startedAt, 'side rooms share the original timer');
    assert.equal(client.snapshot.dungeon.elapsedMs, beforeSideRooms, 'completion time freezes at the final boss');
    assert(result && client.snapshot.dungeon.completed);
    assert.equal(client.snapshot.dungeon.result.kills, result.kills, 'later optional kills do not rewrite the finished result');
    assert.equal(client.snapshot.dungeon.kills, result.kills, 'completion kill count remains frozen while exploring side rooms');
    const completion = client.snapshot.loot.find(drop => drop.id === result.lootId);
    assert(completion && completion.enemyId !== finalId && completion.enemyId !== midpointId, 'clear rewards have their own personal source');
    assert(completion.items.some(item => item.itemId === 'relic' && item.quantity === Math.max(1, Math.floor(definition.maxLevel / 10)) + 2 + Math.floor((definition.minLevel - 10) / 5)), 'existing final and upgrade relic amounts are retained');
    const finalGear = completion.items.filter(item => item.kind === 'gear');
    assert(finalGear.length <= 1 && finalGear.every(item => ['epic', 'legendary', 'mythic'].includes(item.quality)), 'completion retains one epic-or-better gear chance');
    assert(completion.items.some(item => item.itemId === 'crystal'), 'completion retains supplies when gear misses');
    assert.equal(completionMessages(), 1); assert.equal(client.player().achievements.dungeons[definition.id], 1, 'clear rewards and achievements occur once');
    if (definition.id === 'veilhaven') { assert.equal(mountRolls, 1, 'later optional clears cannot repeat the mount roll'); assert.equal(client.player().ownedMounts.filter(id => id === 'verdant-revenant').length, 0); }
    const xp = client.player().xp; await tick(4000); assert.equal(client.player().xp, xp, 'new completion rewards pay once');
    assert.equal(client.snapshot.dungeon.elapsedMs, result.durationMs, 'timer remains frozen at final boss defeat');
    const finalPortal = dungeonReturn(definition.id);
    await walk(client, { x: finalPortal.x, z: finalPortal.z + 1 }); await tick(); client.send({ type: 'move', ...finalPortal, rotation: Math.PI });
    await until(() => !client.snapshot.instanceId, `${definition.id} expanded completed return portal exits`);
    console.log(`PASS ${definition.name}: 24 physical encounters, ${stages.reduce((n, stage) => n + stage.enemies.length, 0)} enemies, two bosses, final-boss timer and optional side rooms, checkpoint wipe/rejoin, spent caches and final rewards once.`);
  }
  if (!onlyDungeon) console.log('PASS automatic swept portal entry with level/guardian gates, no idle/stone entry, no denial spam or forced party teleport, shared party walk-in and completed automatic return; seven dungeon level gates, actual level-scaled opening HP, unique encounters and instances; private consensual summons, underlevel/outsider/forgery/expiry/replay/moved-summoner/changed-party/casting/combat/instance rejection; party rejoin, eight-encounter Cindercrypt clear, checkpoint, once-only rewards and gated final return portal.');
  }
} finally { for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; for (const [kind, stats] of Object.entries(original)) Object.assign(MONSTERS[kind], stats); rmSync(dir, { recursive: true, force: true }); }
