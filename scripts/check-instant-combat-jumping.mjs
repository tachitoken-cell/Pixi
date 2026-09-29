import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { jumpFloor, newJump, startJump, stepJump, moveJump, JUMP_SPEED, JUMP_GRAVITY } from '../src/jumping.ts';
import { INSTANT_COMBAT, instantCombatEncounter } from '../src/instant-combat.ts';
import { INSTANT_COMBAT_MAPS } from '../src/instant-combat-maps.ts';
import { installCollisionScene, actorFloor, actorCanStand } from '../src/collision3d.ts';
import { collisionRouteAllowed } from '../src/collision-context.ts';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const freeAt = stripTypeScriptTypes(main.slice(main.indexOf('function freeAt('), main.indexOf('function tryClimb(')));
const landingStart = main.indexOf('stepJump(jump,frameSeconds,');
assert(landingStart >= 0, 'the actual client frame advances shared vertical physics');
const landingFrame = stripTypeScriptTypes(`function land(frameSeconds){${main.slice(landingStart, main.indexOf(';', landingStart) + 1)}}`);
const fixtures = [];
// Follow actual support and swept-body geometry to the fixture; old footprint
// paths can cut through the extra detail now present in the authored meshes.
function physicalRoute(start, goal, map) {
  const key = `instant-${map.id}`, step = .4, nodes = [{ x: start.x, z: start.z, jump: { ...start.jump }, cost: 0, parent: null }], seen = new Set();
  const score = n => n.cost + Math.hypot(n.x - goal.x, n.z - goal.z);
  for (let visited = 0; nodes.length && visited < 10000; visited++) {
    nodes.sort((a, b) => score(a) - score(b));
    const node = nodes.shift(), grid = `${Math.round((node.x - start.x) / step)},${Math.round((node.z - start.z) / step)},${Math.round(node.jump.y * 10)}`;
    if (seen.has(grid)) continue;
    seen.add(grid);
    if (Math.hypot(node.x - goal.x, node.z - goal.z) < .8 && moveJump({ ...node.jump }, node, goal, true, key)) {
      const path = [goal]; for (let n = node; n.parent; n = n.parent) path.unshift({ x: n.x, z: n.z }); return path;
    }
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      if (!dx && !dz) continue;
      const to = { x: node.x + dx * step, z: node.z + dz * step }, jump = { ...node.jump };
      if (!collisionRouteAllowed(node, to, 'instant-combat-jump', 'rootvault', map.id) || !moveJump(jump, node, to, true, key) || !jump.grounded) continue;
      nodes.push({ ...to, jump, cost: node.cost + Math.hypot(dx, dz) * step, parent: node });
    }
  }
  throw Error(`${map.id}: no physical walking route to the test prop`);
}
for (const map of INSTANT_COMBAT_MAPS) {
  const key = `instant-${map.id}`, manifest = JSON.parse(readFileSync(new URL(`../public/collision/${key}.json`, import.meta.url), 'utf8'));
  const binary = readFileSync(new URL(`../public/collision/${key}.bin`, import.meta.url));
  await installCollisionScene(key, manifest, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
  const prop = map.colliders.find(c => c.x === -8.754 && c.z === 5.842);
  assert(prop && prop.height < JUMP_SPEED ** 2 / (2 * JUMP_GRAVITY), 'authored bone is below the normal jump apex');
  const from = { x: prop.x - 1.2, z: prop.z }, to = { x: prop.x, z: prop.z - 1.2 };
  const topY = actorFloor(key, prop.x, prop.z, prop.height + .1);
  assert(topY > .5 && actorCanStand(key, prop.x, topY, prop.z), 'the exact authored bone supplies a usable raised top');
  for (const p of [from, to]) {
    const floor = actorFloor(key, p.x, p.z, .1);
    assert(Math.abs(floor) < .01 && actorCanStand(key, p.x, floor, p.z), 'both sides of the bone are physically clear');
  }
  const ctx = createContext({ worldInstance: 'instant-combat-jump', position: { ...from },
    jump: newJump(from.x, from.z, true, key), lastSentMove: null,
    playerRouteAllowed: (a, b) => collisionRouteAllowed(a, b, 'instant-combat-jump', 'rootvault', map.id),
    currentCollisionScene: () => key, tryClimb: () => {}, moveJump, stepJump, jumpFloor });
  runInContext(freeAt, ctx); runInContext(landingFrame, ctx);
  assert(!ctx.freeAt(to.x, to.z), `${map.id}: grounded client cannot walk through the prop`);
  assert(startJump(ctx.jump, from.x, from.z, true, key)); stepJump(ctx.jump, .25, 0, from, key);
  assert(ctx.freeAt(prop.x, prop.z), `${map.id}: actual client movement clears the prop at normal jump height`);
  Object.assign(ctx.position, { x: prop.x, z: prop.z }); ctx.land(1);
  assert(ctx.jump.grounded && Math.abs(ctx.jump.y - topY) < .01, 'actual client lands on the authored surface');
  const clientLanding = { ...ctx.position }; ctx.land(.1);
  assert.deepEqual({ ...ctx.position }, clientLanding, 'standing on a prop does not slide sideways');
  assert(Math.abs(ctx.jump.y - topY) < .01, 'the next client frame preserves raised support');
  assert(startJump(ctx.jump, prop.x, prop.z, true, key), 'a supported prop permits another jump');
  ctx.land(.25); assert(ctx.jump.y > topY + 1, 'jump launches from the raised top'); ctx.land(1);
  const tall = map.colliders.filter(c => c.height > 3 && !actorCanStand(key, c.x, 1.64, c.z));
  assert(tall.length >= 2, 'normal jump height cannot occupy the solid body of tall physical props');
  assert(!collisionRouteAllowed({ x: 0, z: 33 }, { x: 0, z: 34 }, 'instant-combat-jump', 'rootvault', map.id), 'outer rim remains a sealed game boundary');
  assert.equal(map.colliders.filter(c => c.height === undefined).length, 96, 'all authored perimeter blockers are retained');
  let supports = 0;
  for (const c of map.colliders.filter(c => c.height <= JUMP_SPEED ** 2 / (2 * JUMP_GRAVITY))) {
    const floor = actorFloor(key, c.x, c.z, c.height + .1);
    if (floor < .5 || !actorCanStand(key, c.x, floor, c.z)) continue;
    const landed = newJump(c.x, c.z, true, key, floor); stepJump(landed, 1, 0, c, key);
    assert(landed.grounded && Math.abs(landed.y - floor) < .01, 'every sampled usable prop preserves its actual support');
    supports++;
  }
  assert(supports >= 10, 'multiple distinct authored props were tested for stable raised support');
  fixtures.push({ map, prop, from, to, topY });
}

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-ic-jumping-')), realNow = Date.now;
let clock = Date.UTC(2026, 8, 28, 12) - INSTANT_COMBAT.registrationMs + 1, game, socket, snapshot;
Date.now = () => clock;
const id = randomUUID(), token = randomBytes(32).toString('base64url'), messages = [];
const hero = { id, name: 'Event Jumper', x: 0, z: 8, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, talents: [], ...starterGear('Ranger'), level: 25, hp: 388, maxHp: 388, xp: 0, gold: 0,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
const player = () => snapshot?.players.find(p => p.id === id), send = message => socket.send(JSON.stringify(message));
async function until(fn, label) { const end = realNow() + 7000; while (realNow() < end) { const result = fn(); if (result) return result; await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(ms) { clock += ms; await until(() => snapshot?.serverTime === clock, 'server tick'); }
async function move(point, ms = 200) { await tick(ms); send({ type: 'move', ...point, rotation: 0 }); await until(() => Math.hypot(player().x - point.x, player().z - point.z) < 1e-6, 'authoritative movement').catch(error => { console.error(JSON.stringify({ point, player: player(), run: snapshot.instantCombat?.run, instanceId: snapshot.instanceId, recent: messages.slice(-5) })); throw error; }); }
async function blocked(point, reason) { const start = messages.length, before = { x: player().x, z: player().z }; send({ type: 'move', ...point, rotation: 0 }); await until(() => messages.slice(start).some(m => m.type === 'correction'), reason); assert.deepEqual({ x: player().x, z: player().z }, before, reason); }
async function jump() { const sequence = player().jump.sequence; send({ type: 'jump' }); await until(() => player().jump.sequence === sequence + 1, 'authoritative takeoff'); }
try {
  writeFileSync(join(dataDir, 'players.json'), JSON.stringify({ [createHash('sha256').update(token).digest('hex')]: { characters: [hero] } }));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); const port = await game.start();
  socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  socket.on('message', raw => { const message = JSON.parse(raw); messages.push(message); if (message.type === 'snapshot') snapshot = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  send({ type: 'join', token, characterId: id }); await until(player, 'world entry');
  for (const { map, prop, from, to, topY } of fixtures) {
    let startsAt = Math.ceil(clock / INSTANT_COMBAT.intervalMs) * INSTANT_COMBAT.intervalMs;
    while (instantCombatEncounter(startsAt).mapId !== map.id) startsAt += INSTANT_COMBAT.intervalMs;
    await tick(startsAt - INSTANT_COMBAT.registrationMs + 1 - clock);
    send({ type: 'instantCombatRegister' }); await until(() => snapshot.instantCombat.registered, 'registration');
    await tick(startsAt - clock); await until(() => snapshot.instantCombat.run?.mapId === map.id, 'map entry');
    const route = physicalRoute(player(), from, map); assert(route.length, 'test obstacle is reachable from the real entry through actual mesh geometry');
    for (const goal of route) while (Math.hypot(player().x - goal.x, player().z - goal.z) > .001) {
      const p = player(), scale = Math.min(1, 1 / Math.hypot(p.x - goal.x, p.z - goal.z));
      await move({ x: p.x + (goal.x - p.x) * scale, z: p.z + (goal.z - p.z) * scale });
    }
    await tick(600); await blocked(to, 'grounded server movement cannot cross the obstacle');
    await jump(); await move({ x: prop.x, z: prop.z }, 250);
    assert(player().jump.y > prop.height && !player().jump.grounded, 'server clears the prop using its own ballistic height');
    await move(to, 200); await tick(800); assert(player().jump.grounded && Math.abs(player().jump.y) < .01, 'jump reaches the other side and lands');
    await blocked(from, 'grounded collision resumes after landing');
    await jump(); await move({ x: prop.x, z: prop.z }, 250); await tick(800);
    assert(player().jump.grounded && Math.abs(player().jump.y - topY) < .01, 'server lands on the same exact authored support as the client');
    assert(Math.hypot(player().x - prop.x, player().z - prop.z) < 1e-6, 'physical landing preserves the chosen horizontal position');
    const serverLanding = { x: player().x, z: player().z }; await tick(200);
    assert.deepEqual({ x: player().x, z: player().z }, serverLanding, 'the next authoritative tick preserves raised support without sliding');
    await jump(); await blocked({ x: player().x + 12, z: player().z }, 'jumping does not grant extra movement speed');
    await tick(snapshot.instantCombat.run.phaseEndsAt - clock);
    await until(() => snapshot.instantCombat.run?.phase === 'fighting', 'first wave');
    const start = messages.length, trajectory = [];
    for (let i = 0; i < 150 && !messages.slice(start).some(m => m.type === 'damage' && m.targetId === id && !m.effect); i++) { await tick(200); if(i % 10 === 0) trajectory.push({time:clock,enemies:snapshot.enemies?.map(e=>({x:e.x,z:e.z,targetId:e.targetId,attack:e.attack}))}); }
    if (!messages.slice(start).some(m => m.type === 'damage' && m.targetId === id && !m.effect)) console.error('COMBAT_FIXTURE', JSON.stringify({ map: map.id, player: player(), enemies: snapshot.enemies, trajectory, events: messages.slice(start).filter(m => m.type !== 'snapshot') }));
    assert(messages.slice(start).some(m => m.type === 'damage' && m.targetId === id && !m.effect), 'nearest wave monsters can approach and damage the player after a short prop landing');
    send({ type: 'instantCombatLeave' }); await until(() => !snapshot.instanceId, 'event return');
  }
  console.log('PASS Instant Combat jumps: both authored maps, actual client movement/landing, real server crossing and stable raised support, jumping from prop tops, nearest-monster damage after landing, grounded/tall-prop/perimeter collision, and movement-speed authority.');
} finally { socket?.terminate(); await game?.stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true }); }
