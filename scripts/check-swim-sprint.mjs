import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear, gearById, gearSpeedMultiplier, maxHealth } from '../src/progression.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { canTraverse, regionAt, WORLD_BOUNDS } from '../src/realm.ts';
import { SWIM_SPEED, waterAt, movementCost } from '../src/landscape.ts';
import { SWIM_SPRINT_SPEED, WALK_SPEED, SPRINT_SPEED, STAMINA_DRAIN, STAMINA_MAX, MOUNT_CAST_MS } from '../src/travel.ts';
import { newJump, moveJump } from '../src/jumping.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-swim-sprint-')), clients = [], realNow = Date.now, originalMonsters = structuredClone(MONSTERS);
let game, port, clock = realNow(); Date.now = () => clock;
const close = (actual, expected, label) => assert(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
const position = c => ({ x: c.player().x, z: c.player().z });
function findShore() {
  for (let z = WORLD_BOUNDS.minZ + 10; z < WORLD_BOUNDS.maxZ - 10; z += 4) for (let x = WORLD_BOUNDS.minX + 10; x < WORLD_BOUNDS.maxX - 18; x += 4) {
    if (waterAt(x, z) || !waterAt(x + 4, z)) continue;
    let dryX = x, wetX = x + 4;
    for (let i = 0; i < 20; i++) { const mid = (dryX + wetX) / 2; if (waterAt(mid, z)) wetX = mid; else dryX = mid; }
    const edge = (dryX + wetX) / 2, dry = { x: edge - 1.25, z }, wet = { x: edge + 1.25, z }, end = { x: edge + 12, z };
    if (waterAt(dry.x, z) || !Array.from({ length: 44 }, (_, i) => edge + 1.25 + i * .25).every(a => waterAt(a, z)) || !canTraverse(dry, end)) continue;
    if (!moveJump(newJump(dry.x, z), dry, wet) || !moveJump(newJump(wet.x, z), wet, dry)) continue;
    return { dry, wet, end };
  }
  throw Error('No dry, clear, reversible shoreline and open swim lane found');
}
function hero(name, point) {
  return { id: randomUUID(), name, ...point, coordinateVersion: 2, zone: regionAt(point.x, point.z), rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), level: 25, hp: 388, maxHp: 388, xp: 0, gold: 0,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function until(fn, label) {
  const end = realNow() + 6000;
  while (realNow() < end) { const result = fn(); if (result) return result; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], snapshots: 0 }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const message = JSON.parse(raw); if (message.type !== 'snapshot') c.messages.push(message);
    if (['snapshot', 'roster', 'welcome'].includes(message.type)) c[message.type] = message; if (message.type === 'snapshot') c.snapshots++; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }); c.send({ type: 'join', token });
  await until(() => c.roster, 'swim fixture roster'); c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id }); await until(() => c.player(), 'swim fixture entry'); return c;
}
async function action(c, message, ms = 0) {
  clock += ms; const count = c.snapshots; c.send(message); await until(() => c.snapshots > count && c.snapshot.serverTime >= clock, message.type); return c.player();
}
async function move(c, point, ms, sprint = false) {
  const at = c.messages.length; await action(c, { type: 'move', ...point, rotation: 0, sprint }, ms);
  assert.deepEqual(position(c), point, `legal swim route ${JSON.stringify(c.messages.slice(at).filter(m => m.type === 'correction'))}`); return c.player();
}
async function denied(c, point, ms, sprint, extra = {}) {
  const before = position(c), at = c.messages.length, stamina = c.player().travel.stamina;
  await action(c, { type: 'move', ...point, rotation: 0, sprint, ...extra }, ms);
  assert.deepEqual(position(c), before, 'overspeed/forged state is rejected');
  assert(c.messages.slice(at).some(m => m.type === 'correction')); assert(c.player().travel.stamina >= stamina, 'rejected movement consumes no stamina');
}
async function tick(ms) { clock += ms; await delay(125); }
function routeTimes(from, to) {
  const moved = Math.hypot(to.x - from.x, to.z - from.z), wet = (movementCost(from, to) - moved) / 1.3, dry = moved - wet;
  return { wet, dry, normal: dry / WALK_SPEED + wet / SWIM_SPEED, sprint: dry / SPRINT_SPEED + wet / SWIM_SPRINT_SPEED };
}
try {
  close(SWIM_SPEED, 3.1 * 1.4, 'normal swimming is exactly forty percent faster');
  close(SWIM_SPRINT_SPEED / SWIM_SPEED, SPRINT_SPEED / WALK_SPEED, 'water and land share sprint multiplier');
  const shore = findShore(), actors = ['normal', 'sprint', 'partial', 'mixed', 'mounted', 'geared'].map(name => hero(name, ['mixed', 'mounted', 'geared'].includes(name) ? shore.dry : shore.wet));
  const speedGear=gearById('ranger-shoes~2~mythic~199999996b851eb8~0');actors[5].ownedGear.push(speedGear.id);actors[5].equipment.shoes=speedGear.id;
  for (const actor of actors) actor.hp = actor.maxHp = maxHealth(actor);
  const tokens = actors.map(() => randomBytes(32).toString('base64url'));
  for (const stats of Object.values(MONSTERS)) Object.assign(stats, { speed: 0, aggroRange: 0 });
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(actors.map((p, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [p] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start();
  const normal = await connect(tokens[0]);
  for (let i = 0; i < 8; i++) await move(normal, { x: shore.wet.x + (i % 2 ? 0 : SWIM_SPEED * .2), z: shore.wet.z }, 200);
  close(normal.player().travel.stamina, 100, 'normal swimming uses no stamina'); assert.equal(normal.player().travel.sprinting, false);
  // Raw distance fits the land-speed budget; actual water time still rejects it.
  await denied(normal, { x: shore.wet.x + WALK_SPEED * .55, z: shore.wet.z }, 1000, false);
  await denied(normal, { x: shore.wet.x + SPRINT_SPEED * .55, z: shore.wet.z }, 1000, true);
  await denied(normal, { x: shore.wet.x + .1, z: shore.wet.z }, 0, true, { stamina: 100 });
  const swimmer = await connect(tokens[1]); await move(swimmer, shore.wet, 9000, true);
  close(swimmer.player().travel.stamina, 100, 'stationary Shift consumes no stamina'); assert.equal(swimmer.player().travel.sprinting, false);
  for (let i = 0; i < 16; i++) {
    await move(swimmer, { x: shore.wet.x + (i % 2 ? 0 : SWIM_SPRINT_SPEED * .5), z: shore.wet.z }, 500, true);
    close(swimmer.player().travel.stamina, Math.max(0, 100 - (i + 1) * .5 * STAMINA_DRAIN), 'actual swimming sprint duration drains fatigue');
    if (i < 15) {
      assert.equal(swimmer.player().travel.sprinting, true, 'water sprint remains visible in the next authoritative snapshot');
      await until(() => normal.snapshot.players.find(p => p.id === swimmer.welcome.id)?.travel.sprinting === true, 'observer receives water sprint animation state');
    }
  }
  assert.equal(swimmer.player().travel.exhausted, true); assert.equal(swimmer.player().travel.sprinting, false);
  await move(swimmer, { x: shore.wet.x + SWIM_SPEED * .2, z: shore.wet.z }, 200, true); close(swimmer.player().travel.stamina, 0, 'exhausted Shift falls back to normal swim');
  await tick(1000); assert(swimmer.player().travel.stamina > 0 && swimmer.player().travel.stamina < 25); assert(swimmer.player().travel.exhausted);
  await tick(800); assert.equal(swimmer.player().travel.exhausted, false);
  const rested = swimmer.player().travel.stamina; await move(swimmer, { x: swimmer.player().x + SWIM_SPRINT_SPEED * .2, z: shore.wet.z }, 200, true);
  assert(swimmer.player().travel.sprinting); assert(swimmer.player().travel.stamina < rested + 18 * .2);
  const partial = await connect(tokens[2]);
  for (let i = 0; i < 15; i++) await move(partial, { x: shore.wet.x + (i % 2 ? 0 : SWIM_SPRINT_SPEED * .5), z: shore.wet.z }, 500, true);
  await move(partial, { x: partial.player().x - SWIM_SPRINT_SPEED * .25, z: shore.wet.z }, 250, true);
  close(partial.player().travel.stamina, 3.125, 'quarter-second sprint remains');
  await move(partial, { x: partial.player().x + SWIM_SPRINT_SPEED * .25 + SWIM_SPEED * .25, z: shore.wet.z }, 500, true);
  close(partial.player().travel.stamina, 0, 'partial final stamina charges sprint then normal time'); assert(partial.player().travel.exhausted);
  const mixed = await connect(tokens[3]), crossing = routeTimes(shore.dry, shore.wet); assert(crossing.wet > 0 && crossing.dry > 0);
  await move(mixed, shore.wet, Math.ceil(crossing.sprint * 1000), true);
  close(mixed.player().travel.stamina, 100 - crossing.sprint * STAMINA_DRAIN, 'mixed shoreline drains weighted actual sprint seconds');
  assert(waterAt(mixed.player().x, mixed.player().z)); assert(mixed.player().travel.sprinting);
  // Swim out and back until exactly one tenth of a sprint second remains.
  let remaining = (mixed.player().travel.stamina - 1.25) / STAMINA_DRAIN;
  while (remaining > 1e-8) {
    const leg = Math.min(.5, remaining / 2), start = position(mixed);
    await move(mixed, { x: start.x + SWIM_SPRINT_SPEED * leg, z: start.z }, leg * 1000, true);
    await move(mixed, start, leg * 1000, true); remaining -= leg * 2;
  }
  close(mixed.player().travel.stamina, 1.25, 'shore return has only partial sprint stamina');
  const returning = routeTimes(shore.wet, shore.dry), partialTime = returning.normal - .1 * (SPRINT_SPEED / WALK_SPEED - 1);
  await move(mixed, shore.dry, Math.ceil(partialTime * 1000), true);
  close(mixed.player().travel.stamina, 0, 'leaving water does not reset fatigue'); assert(!waterAt(mixed.player().x, mixed.player().z)); assert(mixed.player().travel.exhausted);
  const mounted = await connect(tokens[4]); await action(mounted, { type: 'mount', mount: 'horse' }); await tick(MOUNT_CAST_MS); assert.equal(mounted.player().travel.mount, 'horse');
  await move(mounted, shore.wet, 300, true); assert.equal(mounted.player().travel.mount, null, 'touching water dismounts even while Shift is held');
  close(mounted.player().travel.stamina, STAMINA_MAX, 'mounted crossing cannot sprint in water'); assert.equal(mounted.player().travel.sprinting, false);
  await action(mounted, { type: 'mount', mount: 'horse' }); assert.equal(mounted.player().casting, null, 'water cannot summon a mount');
  await move(mounted, { x: shore.wet.x + SWIM_SPRINT_SPEED * .2, z: shore.wet.z }, 200, true);
  close(mounted.player().travel.stamina, 97.5, 'the next unmounted water movement can sprint');
  const geared=await connect(tokens[5]), gearSpeed=gearSpeedMultiplier(geared.player());assert(gearSpeed>1);
  const gearedCrossing=routeTimes(shore.dry,shore.wet).sprint/gearSpeed;
  await move(geared,shore.wet,Math.ceil(gearedCrossing*1000),true);
  close(geared.player().travel.stamina,100-gearedCrossing*STAMINA_DRAIN,'geared shoreline crossing drains actual movement time');
  const gearedStamina=geared.player().travel.stamina;
  for(let i=0;i<4;i++)await move(geared,{x:shore.wet.x+(i%2?0:SWIM_SPRINT_SPEED*gearSpeed*.5),z:shore.wet.z},500,true);
  close(geared.player().travel.stamina,gearedStamina-2*STAMINA_DRAIN,'geared swim sprint moves farther with unchanged per-second fatigue');
  await denied(geared,{x:shore.wet.x+SWIM_SPRINT_SPEED*gearSpeed*.8,z:shore.wet.z},1000,true);
  console.log('PASS swim sprint: 4.34m/s normal and proportional 6.136m/s Shift speed, actual-time fatigue, exhaustion/recovery, stationary no-drain, partial final stamina, mixed shore costs, overspeed/forged-state rejection and mounted dismount policy.');
} finally {
  for (const client of clients) client.socket.terminate(); await game?.stop(); Date.now = realNow;
  for (const [kind, stats] of Object.entries(originalMonsters)) Object.assign(MONSTERS[kind], stats); rmSync(dir, { recursive: true, force: true });
}
