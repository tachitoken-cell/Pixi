import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { installCollisionScene, disposeCollisionScene } from '../src/collision3d.ts';
import { canTraverse, regionAt, toWorld } from '../src/realm.ts';
import { waterAt, WORLD_BOUNDS, groundHeight, TERRAIN_MAX_STEP } from '../src/landscape.ts';
import { DUNGEON_ENTRANCE } from '../src/adventure.ts';
import { newJump, startJump, stepJump, moveJump, jumpFloor, JUMP_SPEED, JUMP_GRAVITY, WALK_MAX_STEP } from '../src/jumping.ts';

const jump = newJump(0, 8);
assert(startJump(jump, 0, 8)); stepJump(jump, 0, 0); assert(!jump.grounded, 'a zero-time snapshot cannot cancel takeoff');
const split = { ...jump }; stepJump(jump, .3, 0); for (let i = 0; i < 6; i++) stepJump(split, .05, 0);
assert(Math.abs(jump.y - split.y) < 1e-9, 'client and server timestep-independent trajectory');
assert(Math.abs(jump.y - (JUMP_SPEED * .3 - .5 * JUMP_GRAVITY * .3 ** 2)) < 1e-9);
assert(!startJump(jump, 0, 8), 'no double jump'); stepJump(jump, 1, 0); assert(jump.grounded); assert.equal(jump.y, 0);
const ledge = { y: 12, velocity: 0, grounded: true, sequence: 1 };
assert(moveJump(ledge, { x: 0, z: 8 }, { x: 0, z: 8 })); assert(!ledge.grounded, 'leaving a ledge starts falling');
stepJump(ledge, .1, 0); assert(ledge.y < 12 && ledge.y > 0); stepJump(ledge, 2, 0); assert(ledge.grounded);

function shorePoint() {
  for (let z = WORLD_BOUNDS.minZ + 10; z < WORLD_BOUNDS.maxZ - 10; z += 4) for (let x = WORLD_BOUNDS.minX + 10; x < WORLD_BOUNDS.maxX - 14; x += 4) {
    if (!waterAt(x, z) && waterAt(x + 4, z) && canTraverse({ x, z }, { x: x + 5, z })) for (let i = 0; i < 40; i++) {
      const a = x + i * .1;
      if (!waterAt(a, z) && waterAt(a + .1, z)) return { x: a - .05, z };
    }
  }
  throw Error('Missing shoreline');
}
let checkedSlope = false;
for (let z = -700; z < 700 && !checkedSlope; z += 4) for (let x = -700; x < 700 && !checkedSlope; x += 4) {
  const from = { x: x + 2, z: z + 2 }, to = { x: x + 6, z: z + 2 };
  const rise = groundHeight(to.x, to.z) - groundHeight(from.x, from.z);
  if (waterAt(from.x, from.z) || waterAt(to.x, to.z) || rise < .5 || rise > TERRAIN_MAX_STEP) continue;
  const grounded = newJump(from.x, from.z); assert(moveJump(grounded, from, to), 'normal terrain terraces remain walkable without a jump');
  assert(grounded.grounded && grounded.y === groundHeight(to.x,to.z), 'walking lifts feet onto the actual terrain tile');
  const lowJump = { ...newJump(from.x, from.z), grounded: false, velocity: 1, y: groundHeight(from.x, from.z) + .1 }, before = { ...lowJump };
  assert(!moveJump(lowJump, from, to), 'airborne feet cannot clip through an uphill terrace'); assert.deepEqual(lowJump, before, 'rejected path leaves prediction intact');
  lowJump.y = groundHeight(to.x, to.z) + .1; assert(moveJump(lowJump, from, to), 'a jump can cross a terrace once feet clear it'); checkedSlope = true;
}
assert(checkedSlope, 'tested real generated terrain');

// Keep the restored terrain allowance separate from authored solid prop tops.
const vertices=new Float32Array([-.5,0,7.5, .5,0,7.5, .5,1,7.5, -.5,1,7.5, -.5,0,8.5, .5,0,8.5, .5,1,8.5, -.5,1,8.5]);
const indices=new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);
const buffer=new ArrayBuffer(vertices.byteLength+indices.byteLength);
new Float32Array(buffer,0,vertices.length).set(vertices); new Uint32Array(buffer,vertices.byteLength,indices.length).set(indices);
await installCollisionScene('overworld',{shapes:[{vertexOffset:0,vertexCount:8,indexOffset:vertices.byteLength,indexCount:indices.length}],instances:[{shape:0,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}]},buffer);
try {
  const from={x:-91.8,z:-90},to={x:-92.2,z:-90},state=newJump(from.x,from.z,false,'overworld');
  assert(groundHeight(to.x,to.z)-state.y>WALK_MAX_STEP,'fixture crosses a real one-meter terrain tile');
  assert(moveJump(state,from,to,false,'overworld') && state.grounded && state.y===groundHeight(to.x,to.z),'collision-enabled terrain auto-step restores supported walking');
  assert(!state.climb && state.sequence===0,'terrain walking does not initiate climbing or jumping');
  const highFrom={x:-300.2,z:-298},highTo={x:-299.8,z:-298},high=newJump(highFrom.x,highFrom.z,false,'overworld');
  assert(groundHeight(highTo.x,highTo.z)-high.y===TERRAIN_MAX_STEP && moveJump(high,highFrom,highTo,false,'overworld') && high.grounded && high.y===groundHeight(highTo.x,highTo.z),'the full 1.5m normal terrain rise auto-steps');
  assert(moveJump(high,highTo,highFrom,false,'overworld') && !high.grounded,'reversing off the terrace starts a clear fall'); stepJump(high,1,groundHeight(highFrom.x,highFrom.z),highFrom,'overworld');
  assert(high.grounded && high.y===groundHeight(highFrom.x,highFrom.z) && moveJump(high,highFrom,{x:highFrom.x-.2,z:highFrom.z},false,'overworld'),'reverse fall lands and walking away remains available');

  const propFrom={x:-1,z:8},propTo={x:0,z:8},prop=newJump(propFrom.x,propFrom.z,false,'overworld'),before={...prop};
  assert(!moveJump(prop,propFrom,propTo,false,'overworld'),'one-meter solid props do not gain the terrain step allowance');
  assert.deepEqual(prop,before,'rejected prop movement preserves prediction');
  const airborne={...newJump(from.x,from.z,false,'overworld'),grounded:false,y:groundHeight(from.x,from.z)+.1};
  assert(!moveJump(airborne,from,to,false,'overworld'),'terrain auto-step cannot lift airborne feet through a tile');
} finally { disposeCollisionScene('overworld'); }


const dir = mkdtempSync(join(tmpdir(), 'mossvale-jumping-')), realNow = Date.now, clients = [];
let clock = realNow(), game, port, requestSequence=0;
Date.now = () => clock;
function hero(name, point = { x: 0, z: 8 }) {
  return { id: randomUUID(), name, ...point, zone: regionAt(point.x, point.z), coordinateVersion: 2, rotation: 0,
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
  const frames = clients.filter(c => c.inWorld).map(c => [c, c.snapshots]);
  clock += ms;
  await until(() => frames.every(([c, count]) => !c.inWorld || c.snapshots > count && c.snapshot.serverTime === clock), 'snapshot after clock advance');
}
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], snapshots: 0 };
  clients.push(c); c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['snapshot', 'roster', 'welcome'].includes(m.type)) c[m.type] = m; if (m.type === 'snapshot') { c.snapshots++; c.inWorld = true; } if (m.type === 'roster') c.inWorld = false; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'roster'); c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id }); await until(() => c.player(), 'world entry'); return c;
}
async function action(c, message, ms = 0) {
  clock += ms; const id = ++requestSequence;
  c.send(message); c.send({ type: 'ping', id });
  const reply = await until(() => c.messages.find(m => m.type === 'pong' && m.id === id), `${message.type} processed`);
  // A compressed snapshot already in flight may predate this input, even with the same fake clock.
  await until(() => c.messages.slice(c.messages.indexOf(reply) + 1).some(m => m.type === 'snapshot'), `${message.type} snapshot`);
  return c.player();
}
async function move(c, point, ms = 0) {
  const p = await action(c, { type: 'move', zone: c.player().zone, ...point, rotation: 0 }, ms);
  assert(Math.hypot(p.x - point.x, p.z - point.z) < 1e-6, `legal jump movement: ${JSON.stringify(c.messages.filter(m => m.type === 'correction').slice(-2))}`); return p;
}
try {
  const shore = shorePoint(), actors = [hero('Jumper'), hero('Observer'), hero('Shore jumper', shore), {...hero('Vault jumper', toWorld('hollow', DUNGEON_ENTRANCE)), rootvaultUnlocked:true}];
  const wetShore = { x: shore.x + .6, z: shore.z };
  assert(moveJump(newJump(wetShore.x, wetShore.z), wetShore, shore), 'swimming feet can step back onto the dry shore without climbing');
  const tokens = actors.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(actors.map((p, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [p] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start();
  const jumper = await connect(tokens[0]), observer = await connect(tokens[1]);
  const spawnFloor=jumper.player().jump.y;
  await action(jumper, { type: 'jump' }); await until(()=>jumper.player().jump.sequence>0, 'jump acknowledgement'); assert(!jumper.player().jump.grounded,JSON.stringify(jumper.messages.slice(-4))); assert.equal(jumper.player().jump.sequence, 1);
  await tick(250); const airborne = jumper.player().jump; assert(airborne.y > 1 && airborne.velocity > 0);
  assert.deepEqual(observer.snapshot.players.find(p => p.id === jumper.welcome.id).jump, airborne, 'remote players receive authoritative altitude');
  await action(jumper, { type: 'jump' }); assert.equal(jumper.player().jump.sequence, 1, 'spamming jump cannot restart flight');
  await action(jumper, { type: 'mount', mount: 'horse' }); assert.equal(jumper.player().travel.mount, null, 'mounting must wait for landing');
  await action(jumper, { type: 'jump', y: 999 }); assert.deepEqual(jumper.player().jump, airborne, 'forged jump altitude ignored');
  await action(jumper, { type: 'move', x: 0, z: 8, y: 999, rotation: 0 }); assert.deepEqual(jumper.player().jump, airborne, 'move cannot supply vertical state');
  await tick(600); assert(jumper.player().jump.grounded); assert(Math.abs(jumper.player().jump.y-spawnFloor)<.05, 'lands on the authored paving');
  await action(jumper, { type: 'mount', mount: 'horse' }); assert.equal(jumper.player().casting?.ability, 'mount'); await tick(jumper.player().casting.endsAt - clock); const stamina = jumper.player().travel.stamina;
  await action(jumper, { type: 'jump' }); assert.equal(jumper.player().travel.mount, 'horse'); assert(!jumper.player().jump.grounded);
  await move(jumper, { x: 0, z: 9 }); await action(jumper, { type: 'jump' });
  await action(jumper, { type: 'move', x: 0, z: 10, rotation: 0 }); assert.equal(jumper.player().z, 9, 'jump spamming grants no movement credit'); assert.equal(jumper.player().travel.stamina, stamina);
  await tick(900); assert(jumper.player().jump.grounded); assert.equal(jumper.player().travel.mount, 'horse');
  const swimmer = await connect(tokens[2]); await action(swimmer, { type: 'mount', mount: 'wolf' }); assert.equal(swimmer.player().casting?.ability, 'mount'); await tick(swimmer.player().casting.endsAt - clock); await action(swimmer, { type: 'jump' });
  await move(swimmer, { x: shore.x + .6, z: shore.z }, 100); assert(waterAt(swimmer.player().x, swimmer.player().z)); assert(!swimmer.player().jump.grounded); assert.equal(swimmer.player().travel.mount, 'wolf', 'airborne shore crossing retains mount');
  await tick(1000); assert(swimmer.player().jump.grounded); assert.equal(swimmer.player().jump.y, jumpFloor(swimmer.player().x, swimmer.player().z)); assert.equal(swimmer.player().travel.mount, null, 'water contact dismounts');
  const sequence = swimmer.player().jump.sequence; await action(swimmer, { type: 'jump' }); assert.equal(swimmer.player().jump.sequence, sequence, 'swimming is not a jumping platform');
  const vault = await connect(tokens[3]); await action(vault, { type: 'jump' }); await tick(200); await action(vault, { type: 'dungeonEnter' }); assert(vault.player().instanceId); assert(vault.player().jump.grounded && Math.abs(vault.player().jump.y)<.1 && vault.player().jump.velocity===0 && vault.player().jump.sequence===1, 'teleport resets motion onto the actual dungeon floor');
  await action(vault, { type: 'jump' }); await tick(200); assert(vault.player().jump.y > 1, 'jump works on dungeon floor');
  await action(jumper, { type: 'mount', mount: null }); assert.equal(jumper.player().travel.mount, null, 'explicit dismount before returning to roster');
  await action(jumper, { type: 'jump' }); await tick(200); assert(!jumper.player().jump.grounded, 'roster reset begins during an active jump');
  const rosterCount = jumper.messages.filter(message => message.type === 'roster').length;
  jumper.send({ type: 'leaveWorld' });
  await until(() => jumper.messages.filter(message => message.type === 'roster').length > rosterCount, 'new roster after leaving world');
  delete jumper.snapshot; delete jumper.welcome;
  jumper.send({ type: 'selectCharacter', characterId: actors[0].id });
  await until(() => jumper.player(), 'fresh selected-character snapshot');
  assert(jumper.player().jump.grounded, 'character selection clears airborne motion');
  assert.equal(jumper.player().jump.velocity, 0); assert(!jumper.player().jump.climb);
  assert.equal(jumper.player().travel.mount, null, 'explicit dismount remains after reselection');
  console.log('PASS jumping: shared ballistic arc, takeoff/landing, terraces and falling, server authority and replication, mounted jumps, no double jump or movement-credit refill, water landing, and dungeon reset.');
} finally { for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
