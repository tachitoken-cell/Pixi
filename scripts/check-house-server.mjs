import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { BUILDINGS, BUILDING_CHAIRS, buildingAt, buildingPoint, chairApproach } from '../src/buildings.ts';
import { canTraverse, regionAt, toWorld } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';
import { insideCity } from '../src/city.ts';
import { starterGear } from '../src/progression.ts';
import { ZONES } from '../src/content.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { DUNGEON_ENTRANCE } from '../src/adventure.ts';

// Real clients exercise the normal network and collision paths; only time and spawn fixtures are controlled.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-chairs-')), realNow = Date.now;
let clock = realNow(), game, port;
Date.now = () => clock;
const monsters = structuredClone(MONSTERS), clients = [];
for (const monster of Object.values(MONSTERS)) monster.aggroRange = 0;
const chair = BUILDING_CHAIRS.find(chair => BUILDINGS.find(building => building.id === chair.buildingId)?.kind === 'cottage' && regionAt(chair.x, chair.z) === 'greenwood' && !insideCity(chair.x, chair.z) && canTraverse(chairApproach(chair), chairApproach(chair)));
assert(chair, 'a cottage outside the safe capital has a clear approach for combat interruption checks');
const approach = chairApproach(chair);
async function until(fn, label) {
  const end = realNow() + 3500;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 0) { clock += ms; await delay(120); }
function hero(extra = {}) {
  const level = 25, maxHp = 100 + (level - 1) * 12;
  return { id: randomUUID(), name: 'House tester', appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Mage' },
    coordinateVersion: 2, zone: regionAt(approach.x, approach.z), ...approach, rotation: 0, hp: maxHp, maxHp, level, xp: 0, gold: 0, characterCreated: true,
    talents: [], ...starterGear('Mage'), learnedSpells: ['fireball'], ridingRank: 1, ownedMounts: ['horse'],
    inventory: { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
    quest: { chapter: 0, stage: 1, kills: 0, crystals: 0, progress: { 'grove-slimes': 0, 'grove-crystals': 0 }, completed: false, ending: null }, ...extra };
}
async function fixture(heroes, spawns = [], nodes = []) {
  clock += 20000;
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((player, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [player] }]))));
  const enemies = ZONES[0].enemies, oldNodes = ZONES[0].nodes;
  ZONES[0].enemies = spawns; ZONES[0].nodes = nodes;
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES[0].enemies = enemies; ZONES[0].nodes = oldNodes; }
  port = await game.start();
  return Promise.all(tokens.map(connect));
}
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [], token };
  clients.push(client);
  client.send = value => socket.send(JSON.stringify(value));
  client.player = () => client.snapshot?.players.find(player => player.id === client.welcome?.id);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['snapshot', 'roster', 'welcome'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'roster');
  client.send({ type: 'selectCharacter', characterId: client.roster.characters[0].id }); await until(() => client.player(), 'world');
  return client;
}
async function sit(client) { client.send({ type: 'sit', chairId: chair.id }); return until(() => client.player()?.seated, 'sit'); }
async function rejected(client, request) {
  clock += 650; // Rejections are deliberately rate-limited by the real server.
  const count = client.messages.length, before = structuredClone(client.player());
  client.send(request); await until(() => client.messages.slice(count).some(message => message.type === 'event' || message.type === 'correction'), 'request rejected'); await tick();
  assert.deepEqual(client.player().seated, before.seated);
  assert.equal(client.player().x, before.x); assert.equal(client.player().z, before.z);
}
try {
  const [actor, observer] = await fixture([hero(), hero({ name: 'Seat observer' })]);
  const seated = await sit(actor);
  assert.deepEqual(seated, { chairId: chair.id, x: chair.x, z: chair.z, y: chair.y, rotation: chair.rotation });
  assert.equal(actor.player().x, approach.x); assert.equal(actor.player().z, approach.z);
  assert(canTraverse(actor.player(), actor.player()), 'the authoritative position stays outside furniture collision');
  await until(() => observer.snapshot.players.find(p => p.id === actor.welcome.id)?.seated, 'remote sitting state');
  await rejected(observer, { type: 'sit', chairId: chair.id });
  await rejected(actor, { type: 'sit', chairId: 'missing-chair' });
  await rejected(actor, { type: 'sit', chairId: chair.id, x: 500 });
  await rejected(actor, { type: 'mount', mount: 'horse' });
  await rejected(actor, { type: 'move', x: approach.x + 25, z: approach.z, rotation: 0 });
  actor.send({ type: 'stand' }); await until(() => actor.player().seated === null, 'explicit stand');
  await sit(observer);
  observer.send({ type: 'stand' }); await until(() => observer.player().seated === null, 'seat reusable');
  await sit(actor);
  const step = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(angle => ({ x: approach.x + Math.sin(angle) * .2, z: approach.z + Math.cos(angle) * .2 })).find(point => canTraverse(approach, point));
  assert(step);
  await tick(500); actor.send({ type: 'move', ...step, rotation: 0 });
  await until(() => actor.player().x === step.x && actor.player().z === step.z, 'normal movement');
  assert.equal(actor.player().seated, null, 'movement stands without bypassing validation');
  await sit(actor); actor.send({ type: 'jump' }); await until(() => !actor.player().jump.grounded, 'jump');
  assert.equal(actor.player().seated, null);
  await rejected(actor, { type: 'sit', chairId: chair.id });
  await tick(1000); await sit(actor);
  actor.send({ type: 'leaveWorld' }); await until(() => !observer.snapshot.players.some(p => p.id === actor.welcome.id), 'left world');
  await sit(observer); observer.socket.close(); await delay(50);
  actor.send({ type: 'selectCharacter', characterId: actor.welcome.id }); await until(() => actor.snapshot.players.some(p => p.id === actor.welcome.id && !p.seated), 'return standing');
  await sit(actor); await game.stop(); game = null;
  assert(Object.values(JSON.parse(readFileSync(join(dir, 'players.json'), 'utf8'))).every(account => account.characters.every(player => !Object.hasOwn(player, 'seated'))), 'sitting is never saved as character progress');

  // Nearby furniture and walls must not allow interacting through solid geometry.
  const outside = [], blocked = [];
  for (let x = chair.x - 3; x <= chair.x + 3; x += .2) for (let z = chair.z - 3; z <= chair.z + 3; z += .2)
    if (Math.hypot(x - chair.x, z - chair.z) <= 3 && !waterAt(x, z) && canTraverse({ x, z }, { x, z })) {
      if (!buildingAt(x, z)) outside.push({ x, z });
      else if (buildingAt(x, z)?.id === chair.buildingId && !canTraverse({ x, z }, approach)) blocked.push({ x, z });
    }
  assert(blocked.length, 'furniture blocks approaching a nearby chair from the wrong side');
  assert(outside.length, 'chair fixture includes a reachable position outside the wall within interaction range');
  const [behind, exterior, remote] = await fixture([hero(blocked[0]), hero(outside[0]), hero({ x: 0, z: 22 })]);
  await rejected(behind, { type: 'sit', chairId: chair.id });
  await rejected(exterior, { type: 'sit', chairId: chair.id });
  await rejected(remote, { type: 'sit', chairId: chair.id });
  await game.stop(); game = null;

  // Gather and actual spell preparation stand the actor; sitting interrupts both.
  const forward = { x: approach.x + Math.cos(chair.rotation), z: approach.z - Math.sin(chair.rotation) };
  assert(canTraverse(approach, forward));
  const [busy] = await fixture([hero()], [{ id: 'house-target', kind: 'moss-slime', ...forward }], [{ id: 'house-herb', kind: 'herb', ...forward }]);
  await sit(busy); busy.send({ type: 'gather', targetId: 'house-herb' }); await until(() => busy.player().gathering, 'gather');
  assert.equal(busy.player().seated, null); await sit(busy); assert.equal(busy.player().gathering, null);
  busy.send({ type: 'attack', ability: 'fireball', targetId: 'house-target' }); await until(() => busy.player().casting, 'spell');
  assert.equal(busy.player().seated, null); await sit(busy); assert.equal(busy.player().casting, null);
  await game.stop(); game = null;

  const building = BUILDINGS.find(building => building.id === chair.buildingId);
  const outsideDoor = buildingPoint(building, 0, building.depth / 2 + .5), insideDoor = buildingPoint(building, 0, building.depth / 2 - .5);
  const [rider] = await fixture([hero(outsideDoor)]);
  rider.send({ type: 'mount', mount: 'horse' }); const summon = await until(() => rider.player().casting?.ability === 'mount' && rider.player().casting, 'mount preparation outdoors'); await tick(summon.endsAt - clock); assert.equal(rider.player().travel.mount, 'horse');
  await tick(500); rider.send({ type: 'move', ...insideDoor, rotation: 0 });
  await until(() => rider.player().x === insideDoor.x && rider.player().z === insideDoor.z, 'walk through doorway');
  assert.equal(rider.player().travel.mount, null, 'crossing the open doorway automatically dismounts');
  await rejected(rider, { type: 'mount', mount: 'horse' });
  await game.stop(); game = null;

  for (const hp of [1, 388]) {
    Object.assign(MONSTERS['moss-slime'], monsters['moss-slime']); MONSTERS['moss-slime'].speed = 0;
    const [victim, witness] = await fixture([hero({ hp }), hero({ x: 0, z: 22 })], [{ id: 'house-attacker', kind: 'moss-slime', ...forward }]);
    const attack = await until(() => victim.snapshot.enemies.find(e => e.id === 'house-attacker')?.attack, 'enemy attack');
    await sit(victim); await tick(attack.impactAt - clock + 1);
    await until(() => victim.player().hp < hp, 'enemy impact');
    assert.equal(victim.player().seated, null, 'both damage and death release the chair');
    assert.equal(witness.snapshot.players.find(p => p.id === victim.welcome.id).seated, null);
    if (hp === 1) assert.equal(victim.player().hp, 0);
    await game.stop(); game = null;
  }
  const entrance = toWorld('hollow', DUNGEON_ENTRANCE);
  const [delver] = await fixture([hero({ ...entrance, zone: 'hollow' })]);
  delver.send({ type: 'dungeonEnter' }); await until(() => delver.player().instanceId, 'dungeon');
  await rejected(delver, { type: 'sit', chairId: chair.id }); await game.stop(); game = null;
  console.log('House server checks passed: shared seats, occupancy, collision and wall validation, movement and action interrupts, damage/death, lifecycle, no saved seat state, and dungeon/indoor-mount guards.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); Date.now = realNow;
  for (const [kind, monster] of Object.entries(monsters)) Object.assign(MONSTERS[kind], monster);
  rmSync(dir, { recursive: true, force: true });
}
