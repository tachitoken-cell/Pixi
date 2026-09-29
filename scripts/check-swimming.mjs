import { WILDERNESS_SPAWNS } from '../src/settlements.ts';
import { defaultHotbar, spellsForClass } from '../src/spells.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { newContracts } from '../src/adventure.ts';
import { EXPEDITIONS, EXPEDITION_NODE_OFFSETS, WORLD_BOUNDS, SWIM_SPEED, waterAt, surfaceAt, movementCost } from '../src/landscape.ts';
import { canTraverse, WORLD_COLLIDERS } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-swimming-')), file = join(dataDir, 'players.json');
const realNow = Date.now, clients = []; let offset = 0, game, port;
Date.now = () => realNow() + offset;
const key = token => createHash('sha256').update(token).digest('hex');
function hero(name, point) {
  return { id: randomUUID(), name, coordinateVersion: 2, ...point, zone: surfaceAt(point.x, point.z).zone, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, hotbar: defaultHotbar('Ranger'), talents: [], ...starterGear('Ranger'), hp: 988, maxHp: 988, level: 75, xp: 7, gold: 13,
    learnedSpells: spellsForClass('Ranger').filter(spell => spell.requiredLevel <= 75).map(spell => spell.id), ridingRank: 2, ownedMounts: ['horse', 'wolf'],
    inventory: { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 1 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } };
}
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const value = predicate(); if (value) return value; await delay(15); }
  throw new Error(`Timed out: ${label}`);
}
async function start(records) {
  if (records) writeFileSync(file, JSON.stringify(records));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start();
}
async function connect(token, characterId) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], snapshot: null, roster: null, welcome: null }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'snapshot') c.snapshot = m; if (m.type === 'roster') c.roster = m; if (m.type === 'welcome') c.welcome = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'private roster'); c.send({ type: 'selectCharacter', characterId }); await until(() => c.player(), 'character enters'); return c;
}
async function advance(ms = 500) { offset += ms; await delay(120); }
async function move(c, point, ms = 500) {
  offset += ms; c.send({ type: 'move', zone: c.player().zone, ...point, rotation: 0 });
  await until(() => Math.hypot(c.player().x-point.x,c.player().z-point.z) < .001, 'legal terrain movement');
}
async function rejectedMove(c, point, extra = {}) {
  const before = { x: c.player().x, z: c.player().z }, n = c.messages.filter(m => m.type === 'correction').length;
  c.send({ type: 'move', zone: c.player().zone, ...point, rotation: 0, ...extra });
  await until(() => c.messages.filter(m => m.type === 'correction').length > n, 'invalid movement corrected');
  await delay(120); assert.deepEqual({ x: c.player().x, z: c.player().z }, before);
}
async function walk(c, goal) {
  const path = findPath(c.player(), goal, WORLD_COLLIDERS, WORLD_BOUNDS); assert(path.length, `route to ${JSON.stringify(goal)}`);
  for (const point of path) while (Math.hypot(point.x-c.player().x,point.z-c.player().z) > .01) {
    const p = c.player(), gap = Math.hypot(point.x-p.x,point.z-p.z), step = Math.min(1, gap);
    await move(c, { x: p.x + (point.x-p.x)*step/gap, z: p.z + (point.z-p.z)*step/gap }, 400);
  }
}
function findShore() {
  for (let z = WORLD_BOUNDS.minZ + 10; z < WORLD_BOUNDS.maxZ - 10; z += 4) for (let x = WORLD_BOUNDS.minX + 10; x < WORLD_BOUNDS.maxX - 14; x += 4) {
    if (x > -48 && x < 144 && z > -144 && z < 48 || EXPEDITIONS.some(c => Math.hypot(c.x-x,c.z-z) < 38)) continue;
    const from = { x, z }, to = { x: x + 10, z };
    if (!waterAt(x,z) && waterAt(x+4,z) && waterAt(x+8,z) && waterAt(x+10,z) && canTraverse(from,to,WORLD_COLLIDERS,WORLD_BOUNDS)) return from;
  }
  throw new Error('No clear test shoreline');
}

try {
  const shore = findShore(), camp = EXPEDITIONS[0], swimmer = hero('Swimmer', shore), explorer = hero('Explorer', { x: camp.x, z: camp.z }), original = hero('Original', { x: 0, z: 8 });
  const tokenA = randomBytes(32).toString('base64url'), tokenB = randomBytes(32).toString('base64url');
  await start({ [key(tokenA)]: { characters: [swimmer, original] }, [key(tokenB)]: { characters: [explorer] } });
  let a = await connect(tokenA, swimmer.id), b = await connect(tokenB, explorer.id);
  assert.equal(EXPEDITIONS.length, 16); assert.equal(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX, 1536);
  for (const expedition of EXPEDITIONS) {
    const enemies = WILDERNESS_SPAWNS.filter(e => e.id.startsWith(`expedition-${expedition.id}-`));
    const nodes = EXPEDITION_NODE_OFFSETS.map(n=>({x:expedition.x+n.x,z:expedition.z+n.z}));
    assert.equal(enemies.length, 3); assert.equal(nodes.length, 3);
    if (expedition.zone === 'hollow') assert.deepEqual(enemies.map(enemy => enemy.kind).sort(), ['briar-sentinel', 'briar-sentinel', 'ice-wisp'], 'outer Hollow camps use ordinary mixed guardians');
    for (const p of [...enemies,...nodes]) assert(!waterAt(p.x,p.z) && canTraverse(p,p,WORLD_COLLIDERS,WORLD_BOUNDS), 'expedition actors occupy clear dry land');
  }
  assert.equal(b.snapshot.enemies.filter(e=>e.id.startsWith(`expedition-${camp.id}-`)).length,3,'nearby expedition remains present in a real snapshot');
  assert.equal(b.snapshot.nodes.filter(n=>n.id.startsWith(`expedition-${camp.id}-`)).length,3);
  await move(a, { x: shore.x + 1, z: shore.z });
  await advance(1000);
  assert(movementCost(a.player(), { x: shore.x + 3.5, z: shore.z }) > 3.3);
  await rejectedMove(a, { x: shore.x + 3.5, z: shore.z }); // Raw distance fits; water cost does not.
  await move(a, { x: shore.x + 2.25, z: shore.z }); assert(waterAt(a.player().x,a.player().z));
  await move(a, { x: shore.x + 3.25, z: shore.z });
  await advance(1000); await rejectedMove(a, { x: a.player().x + 3, z: shore.z });
  await rejectedMove(a, { x: a.player().x + .1, z: shore.z }, { swimming: false });
  await rejectedMove(a, { x: 1e300, z: 1e300 });
  const startX = a.player().x;
  for (let i = 1; i <= 8; i++) await move(a, { x: startX + i * SWIM_SPEED * .1, z: shore.z }, 100);
  assert(waterAt(a.player().x,a.player().z), 'native client swim speed remains legal');
  const attacks = a.messages.filter(m => m.type === 'combat').length;
  a.send({ type: 'attack', targetId: b.snapshot.enemies[0].id }); a.send({ type: 'gather', targetId: b.snapshot.nodes[0].id }); await advance();
  assert.equal(a.messages.filter(m => m.type === 'combat').length, attacks); assert.equal(a.player().gathering, null);
  assert(a.messages.some(m => m.text?.includes('dry land before drawing')) && a.messages.some(m => m.text?.includes('dry land before gathering')), 'water stows weapons and gathering tools');
  await walk(a, shore); assert(!waterAt(a.player().x,a.player().z), 'swimming returns to the shore without teleporting');
  const herb = b.snapshot.nodes.find(n => n.id === `expedition-${camp.id}-node-1`);
  await walk(b, { x: herb.x, z: herb.z + 1.5 }); b.send({ type: 'gather', targetId: herb.id });
  await until(() => b.player().gathering, 'outer expedition gathering starts'); await advance(2500);
  await until(() => b.player().inventory.herb === 1, 'outer expedition herb harvested');
  const foe = b.snapshot.enemies.find(e => e.id === `expedition-${camp.id}-enemy-0`), xp = b.player().xp;
  await walk(b, { x: foe.x, z: foe.z + 2.5 });
  for(let attempt=0;attempt<10&&b.snapshot.enemies.find(e=>e.id===foe.id)?.alive;attempt++){
    const current=b.snapshot.enemies.find(e=>e.id===foe.id);
    if(Math.hypot(current.x-b.player().x,current.z-b.player().z)>7)await walk(b,{x:current.x,z:current.z+2});
    b.send({type:'attack',targetId:foe.id});await advance(1200);
  }
  assert.equal(b.snapshot.enemies.find(e=>e.id===foe.id).alive,false,'a roaming expedition enemy can be defeated');
  assert(b.player().xp > xp && b.snapshot.loot.some(drop => drop.enemyId === foe.id && drop.ownerId === b.welcome.id), 'outer encounters grant real XP and personal loot');
  await move(a, { x: shore.x + 1, z: shore.z }); await move(a, { x: shore.x + 2.25, z: shore.z });
  const savedPoint = { x: a.player().x, z: a.player().z, zone: a.player().zone };
  await game.stop(); const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(saved[key(tokenA)].characters.find(p => p.id === original.id), original, 'original core character is untouched');
  await start(); a = await connect(tokenA, swimmer.id);
  assert.deepEqual({ x: a.player().x, z: a.player().z, zone: a.player().zone }, savedPoint, 'reconnect keeps a valid swimming position');
  assert(waterAt(a.player().x,a.player().z)); assert.equal(a.player().inventory.relic, 1); assert.equal(a.player().gold, 13);
  assert(a.snapshot.enemies.every(e => !waterAt(e.x,e.z)), 'enemy spawning and simulation remain on land');
  console.log('PASS: 1536m world with 16 populated expeditions; weighted shore/swim movement, forged-state and huge-jump rejection; dry combat/gather; real outer rewards; shore return and swimming persistence.');
} finally {
  for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true });
}
