import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { regionAt, toWorld, WORLD_COLLIDERS } from '../src/realm.ts';
import { waterAt, WORLD_BOUNDS, groundHeight } from '../src/landscape.ts';
import { BUILDINGS } from '../src/buildings.ts';
import { DUNGEON_ENTRANCE } from '../src/adventure.ts';
import { newJump, startJump, moveJump, stepJump, jumpFloor } from '../src/jumping.ts';
import { newTravel } from '../src/travel.ts';
import { CLIMB_ENABLED, startClimb, stopClimb, stepClimb, CLIMB_SPEED, CLIMB_DRAIN } from '../src/climbing.ts';

const from = { x: -91.8, z: -90 }, to = { x: -92.2, z: -90 }, floor = groundHeight(from.x, from.z), top = groundHeight(to.x, to.z);
assert(top > floor + .5, 'fixture is a real natural terrain ledge');
assert(moveJump(newJump(from.x, from.z), from, to), 'normal terrain terraces remain walkable while climbing is disabled');
const jump = newJump(from.x, from.z), travel = newTravel(), point = { ...from };
if (!CLIMB_ENABLED) {
  const before = structuredClone({ jump, travel });
  assert(!startClimb(jump, from, to, travel), 'shared climbing entry stays disabled');
  assert.deepEqual({ jump, travel }, before, 'disabled climbing changes neither height nor energy');
  jump.climb = { ...to, topY: top, rotation: 0 }; jump.grounded = false;
  stepClimb(jump, point, travel, 1);
  assert(!jump.climb && !jump.grounded && jump.velocity === 0, 'stale climbing releases into normal gravity');
  assert.equal(travel.stamina, before.travel.stamina, 'disabled stale climbing charges no energy');
  stepJump(jump, 1, floor); assert(jump.grounded && jump.y === floor, 'released climb lands on its retained floor');
} else {
assert(startClimb(jump, from, to, travel));
assert(!startJump(jump, from.x, from.z)); assert(!moveJump(jump, from, to));
assert(!startClimb(jump, from, to, travel), 'repeated input cannot reset ascent');
const before = structuredClone(jump); stepJump(jump, 1, floor); assert.deepEqual(jump, before, 'jump integrator does not land an active climber');
const split = structuredClone(jump), splitTravel = { ...travel }, splitPoint = { ...point };
stepClimb(jump, point, travel, .3);
for (let i = 0; i < 6; i++) stepClimb(split, splitPoint, splitTravel, .05);
assert(Math.abs(jump.y - split.y) < 1e-9); assert(Math.abs(travel.stamina - splitTravel.stamina) < 1e-9);
assert(Math.abs(jump.y - (floor + .3 * CLIMB_SPEED)) < 1e-8); assert(Math.abs(travel.stamina - (100 - .3 * CLIMB_DRAIN)) < 1e-8);
assert.deepEqual(point, from, 'horizontal position stays below ledge during ascent');
stepClimb(jump, point, travel, 10); assert.equal(jump.y, top); assert(jump.grounded); assert(!jump.climb);
assert.equal(point.x, to.x); assert.equal(point.z, to.z);
assert(Math.abs(travel.stamina - (100 - (top - floor) / CLIMB_SPEED * CLIMB_DRAIN)) < 1e-8, 'large frame charges only ascent time');
for (const altered of [{ mount: 'horse' }, { driverId: 'driver' }, { exhausted: true }, { stamina: 0 }])
  assert(!startClimb(newJump(from.x, from.z), from, to, { ...newTravel(), ...altered }));
assert(!startClimb(newJump(from.x, from.z), from, { ...to, x: from.x - 1 }, newTravel()), 'reach is bounded');
assert(!startClimb(newJump(from.x, from.z), from, to, newTravel(), true), 'legacy no-scene terrain fallback has no dungeon surfaces');
for (const bad of [BUILDINGS[0], WORLD_COLLIDERS[0]])
  assert(!startClimb(newJump(bad.x, bad.z), bad, { x: bad.x + .4, z: bad.z }, newTravel()), 'legacy no-scene terrain fallback does not climb building or collider footprints');
const cancelled = newJump(from.x, from.z); assert(startClimb(cancelled, from, to, newTravel())); const sequence = cancelled.sequence;
stopClimb(cancelled); assert.equal(cancelled.sequence, sequence + 1); assert(!cancelled.climb); assert(!cancelled.grounded);

}

const wet = (() => {
  for (let z = WORLD_BOUNDS.minZ + 20; z < WORLD_BOUNDS.maxZ - 20; z += 4)
    for (let x = WORLD_BOUNDS.minX + 20; x < WORLD_BOUNDS.maxX - 20; x += 4)
      if (waterAt(x, z)) return { x, z };
  throw Error('No water fixture');
})();
const dir = mkdtempSync(join(tmpdir(), 'mossvale-climbing-')), realNow = Date.now, clients = [];
let clock = realNow(), game, port, requestSequence=0;
Date.now = () => clock;
function hero(name, position = from) {
  return { id: randomUUID(), name, ...position, zone: regionAt(position.x, position.z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), level: 25, hp: 388, maxHp: 388, xp: 0, gold: 0,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function until(fn, label) {
  const end = realNow() + 4000;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 0) {
  const frames = clients.filter(c => c.player()).map(c => [c, c.snapshots]);
  clock += ms;
  await until(() => frames.every(([c, count]) => c.snapshots > count && c.snapshot.serverTime === clock), 'snapshot after clock advance');
}
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], snapshots:0 };
  clients.push(c); c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if(m.type==='snapshot')c.snapshots++; if (['snapshot', 'roster', 'welcome'].includes(m.type)) c[m.type] = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'climb', ...to }); await until(() => c.messages.some(m => m.type === 'event'), 'unauthenticated request rejected');
  assert(c.messages.some(m => m.type === 'event' && m.text === 'Sign in to your account first.'), 'climbing requires authenticated world entry');
  c.send({ type: 'join', token }); await until(() => c.roster, 'roster');
  c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id }); await until(() => c.player(), 'world entry'); return c;
}
async function action(c, message, ms = 0) {
  clock += ms; c.send(message); const id=++requestSequence; c.send({type:'ping',id});
  await until(()=>c.messages.some(m=>m.type==='pong'&&m.id===id),'processed '+message.type);
  const count=c.snapshots; await until(()=>c.snapshots>count,'snapshot after '+message.type); return c.player();
}
try {
  const actors = [hero('Climber'), hero('Watcher'), hero('Tired climber'), hero('Wet climber', wet), { ...hero('Vault climber', toWorld('hollow', DUNGEON_ENTRANCE)), rootvaultUnlocked: true }];
  const tokens = actors.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(actors.map((p, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [p] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start();
  const climber = await connect(tokens[0]), observer = await connect(tokens[1]);
  if (!CLIMB_ENABLED) {
    const before = structuredClone(climber.player());
    await action(climber, { type: 'climb', ...to }, 200);
    assert(climber.messages.some(m => m.type === 'correction' && /temporarily disabled/.test(m.reason || '')), 'old clients receive the disabled-climbing correction');
    for (let i = 0; i < 2; i++) await action(climber, { type: 'climb', ...to }, 200);
    await action(climber, { type: 'climbStop' });
    assert(!climber.player().jump.climb && climber.player().jump.grounded);
    assert.deepEqual([climber.player().x, climber.player().z, climber.player().jump.y, climber.player().travel.stamina], [before.x, before.z, before.jump.y, before.travel.stamina], 'requests cannot change position or consume energy');
    assert(!observer.snapshot.players.find(p => p.id === climber.welcome.id).jump.climb, 'observer sees no climb state');
    await action(climber, { type: 'move', ...to, rotation: 0 }, 200);
    assert.equal(climber.player().x, to.x, 'normal terrain terraces lift a walking player');
    assert(climber.player().jump.grounded && Math.abs(climber.player().jump.y-top)<.03 && !climber.player().jump.climb, 'server terrain auto-step needs neither jump nor climb');
    assert.equal(climber.player().travel.stamina,before.travel.stamina,'walking a terrain tile consumes no climbing energy');
    await action(climber, { type: 'climb', ...to, y: 999 });
    assert(!climber.player().jump.climb, 'forged altitude is still rejected');
    const away = { x: from.x + .4, z: from.z };
    await action(climber, { type: 'move', ...away, rotation: 0 }, 200);
    assert.equal(climber.player().x, away.x, 'walking away remains available');
    await action(climber, { type: 'jump' }); await tick(200);
    assert(!climber.player().jump.grounded && climber.player().jump.y > before.jump.y, 'ordinary jumping remains available');
    await tick(1000); assert(climber.player().jump.grounded && !climber.player().jump.climb);
    console.log('PASS climbing disabled: shared entry and stale states, authenticated WS rejection, unchanged climb-request position/energy, terrain auto-step, free walking and jumping.');
  } else {
  await action(climber, { type: 'move', ...to, rotation: 0 }, 200); assert.equal(climber.player().x, to.x, 'server permits normal terrain auto-step');
  await action(climber, { type: 'move', ...from, rotation: 0 }, 200);
  await action(climber, { type: 'climb', ...to, y: 999 }); assert(!climber.player().jump.climb, 'forged altitude rejected');
  await action(climber, { type: 'climb', x: from.x - 20, z: from.z }); assert(!climber.player().jump.climb, 'distant target rejected');
  await action(climber, { type: 'mount', mount: 'horse' }); await tick(2000); assert.equal(climber.player().travel.mount, 'horse');
  await action(climber, { type: 'climb', ...to }); assert(!climber.player().jump.climb, 'mounted climbing denied');
  await action(climber, { type: 'mount', mount: null });
  await action(climber, { type: 'climb', ...to }); assert(climber.player().jump.climb); assert(!climber.player().jump.grounded);
  const begun = structuredClone(climber.player().jump);
  await action(climber, { type: 'climb', ...to }); assert.deepEqual(climber.player().jump, begun, 'spam adds no vertical or horizontal progress');
  for (const message of [{ type: 'jump' }, { type: 'move', x: from.x, z: from.z + .5, rotation: 0 }, { type: 'attack', ability: 'arrow' }, { type: 'autoAttack', targetId: 'fake' }, { type: 'gather', targetId: 'fake' }, { type: 'mount', mount: 'horse' }, { type: 'emote', emoteId: 'wave' }]) {
    await action(climber, message); assert(climber.player().jump.climb, `${message.type} cannot interrupt or bypass ascent`);
    assert.equal(climber.player().x, from.x); assert.equal(climber.player().z, from.z); assert.equal(climber.player().casting, null); assert.equal(climber.player().autoAttack, null);
  }
  await tick(300); const climbing = climber.player();
  assert(Math.abs(climbing.jump.y - (floor + .3 * CLIMB_SPEED)) < 1e-8); assert.equal(climbing.travel.stamina, 94, 'server charges energy exactly once');
  assert.deepEqual(observer.snapshot.players.find(p => p.id === climber.welcome.id).jump, climbing.jump, 'remote animation receives authoritative climb state');
  await tick(500); assert(!climber.player().jump.climb); assert(climber.player().jump.grounded); assert.equal(climber.player().x, to.x); assert.equal(climber.player().jump.y, top);
  await action(climber, { type: 'move', x: to.x, z: to.z + 1, rotation: 0 }); assert.equal(climber.player().z, to.z, 'climbing accumulates no movement credit');
  const tired = await connect(tokens[2]);
  for (let i = 0; i < 12; i++) {
    await action(tired, { type: 'climb', ...to }); assert(tired.player().jump.climb, JSON.stringify({i, player:tired.player(), messages:tired.messages.slice(-4)}));
    await tick(400); await action(tired, { type: 'climbStop' }); assert(!tired.player().jump.climb); assert(!tired.player().jump.grounded);
    await tick(300); assert(tired.player().jump.grounded); assert.equal(tired.player().jump.y, floor); assert.equal(tired.player().x, from.x);
  }
  assert.equal(tired.player().travel.stamina, 4, 'cancelling never refunds energy');
  await action(tired, { type: 'climb', ...to }); await tick(250);
  assert.equal(tired.player().travel.stamina, 0); assert(tired.player().travel.exhausted); assert(!tired.player().jump.climb); assert.equal(tired.player().x, from.x, 'exhaustion cannot mantle');
  await tick(300); assert(tired.player().jump.grounded); assert.equal(tired.player().jump.y, floor, 'exhaustion falls to lower floor');
  await tick(1000); assert(tired.player().travel.stamina > 0 && tired.player().travel.stamina < 25);
  await action(tired, { type: 'climb', ...to }); assert(!tired.player().jump.climb, 'fatigue lock persists below 25 energy');
  await tick(800); await action(tired, { type: 'climb', ...to }); assert(tired.player().jump.climb, 'rest restores climbing');
  const rosterCount = tired.messages.filter(message => message.type === 'roster').length;
  tired.send({ type: 'leaveWorld' });
  await until(() => tired.messages.filter(message => message.type === 'roster').length > rosterCount, 'new roster after leaving world');
  delete tired.snapshot; delete tired.welcome;
  tired.send({ type: 'selectCharacter', characterId: actors[2].id });
  await until(() => tired.player(), 'fresh selected-character snapshot');
  assert(!tired.player().jump.climb); assert(tired.player().jump.grounded, 'character selection resets climbing');
  const swimmer = await connect(tokens[3]); await action(swimmer, { type: 'climb', x: wet.x + .4, z: wet.z }); assert(!swimmer.player().jump.climb); assert.equal(swimmer.player().jump.y, jumpFloor(wet.x, wet.z));
  const vault = await connect(tokens[4]); await action(vault, { type: 'dungeonEnter' }); assert(vault.player().instanceId);
  await action(vault, { type: 'climb', x: vault.player().x + .4, z: vault.player().z }); assert(!vault.player().jump.climb);
  console.log('PASS climbing: real terrain, shared integration, authenticated WS authority, energy drain/recovery/exhaustion, cancel/fall, remote replication, no move/spam/altitude bypass, mounts/water/dungeons, and reset.');
  }
} finally { for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
