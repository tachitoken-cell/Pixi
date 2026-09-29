import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS, ZONES } from '../src/content.ts';
import { CITY_LAYOUTS, BANK_HOME_IDS } from '../src/city.ts';
import { BANKERS, AUCTIONEERS } from '../src/city-services.ts';
import { BUILDINGS, BUILDING_BEDS, BUILDING_CHAIRS, buildingPoint } from '../src/buildings.ts';
import { canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS, toWorld } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { waterAt } from '../src/landscape.ts';
import { starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newContracts } from '../src/adventure.ts';

const front = npc => ({ x: npc.x + Math.sin(npc.rotation) * 1.5, z: npc.z + Math.cos(npc.rotation) * 1.5 });
assert.equal(BANKERS.length, 6); assert.equal(AUCTIONEERS.length, 6);
assert.equal(new Set([...BANKERS, ...AUCTIONEERS].map(npc => npc.id)).size, 12);
for (const city of CITY_LAYOUTS) {
  const bank = BUILDINGS.find(home => home.id === BANK_HOME_IDS[city.zone]);
  assert(bank && !BUILDING_BEDS.some(bed => bed.buildingId === bank.id) && !BUILDING_CHAIRS.some(chair => chair.buildingId === bank.id), `${city.name}: bank has a clear service interior`);
  assert(city.furnishings.some(prop => prop.kind === 'bank-counter' && prop.buildingId === bank.id));
  const spawn = toWorld(city.zone, ZONES.find(zone => zone.id === city.zone).spawn);
  for (const npcs of [BANKERS, AUCTIONEERS]) {
    const npc = npcs.find(npc => npc.zone === city.zone), approach = front(npc);
    assert(canTraverse(approach, npc) && !waterAt(approach.x, approach.z), `${npc.id}: dry unobstructed service position`);
    const building = npcs === BANKERS ? bank : BUILDINGS.find(home => home.zone === city.zone && home.kind === 'auction-hall');
    assert(canTraverse(buildingPoint(building, 0, building.depth / 2 + 3), approach), `${npc.id}: doorway leads to service`);
    const path = findPath(spawn, approach, WORLD_COLLIDERS, WORLD_BOUNDS);
    assert(path.length && Math.hypot(path.at(-1).x - approach.x, path.at(-1).z - approach.z) < .01, `${npc.id}: reachable from city spawn`);
    let previous = spawn; for (const point of path) { assert(canTraverse(previous, point)); previous = point; }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'mossvale-city-services-')), file = join(dir, 'players.json'), clients = [];
const hash = token => createHash('sha256').update(token).digest('hex');
const heroes = [...BANKERS, ...AUCTIONEERS].map(npc => ({ id: randomUUID(), name: `Service ${npc.zone}`, ...front(npc), zone: npc.zone, coordinateVersion: 2, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), level: 60, xp: 0, gold: 5000, hp: 808, maxHp: 808,
  inventory: { wood: 10, crystal: 0, herb: 0, potion: 0, relic: 0 }, carriedItems: {}, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
  quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(objective => [objective.id, 0])), completed: false, ending: null } }));
const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
const saved = () => JSON.parse(readFileSync(file, 'utf8'));
let game, port;
async function until(predicate, label) {
  const end = Date.now() + 7000;
  while (Date.now() < end) { const result = predicate(); if (result) return result; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = null; }
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [] };
  clients.push(client); client.send = message => socket.send(JSON.stringify(message));
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token: tokens[index], characterId: heroes[index].id });
  await until(() => client.snapshot?.players.some(player => player.id === heroes[index].id), 'enter city fixture'); return client;
}
async function rejected(client, message) {
  const offset = client.messages.length; client.send(message);
  await until(() => client.messages.slice(offset).some(message => message.type === 'event' && message.kind === 'info'), 'reject distant service identity');
}
try {
  writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((hero, index) => [hash(tokens[index]), { characters: [hero] }]))));
  await start();
  const bankers = [], traders = [], listings = [];
  for (let index = 0; index < 6; index++) {
    const bank = await connect(index), banker = BANKERS[index]; bankers.push(bank);
    bank.send({ type: 'interact', targetId: banker.id });
    await until(() => bank.bank?.open, `${banker.cityName}: banker interaction`); assert.equal(bank.bank.npcId, banker.id);
    bank.send({ type: 'bankDeposit', npcId: banker.id, item: { kind: 'resource', id: 'wood', quantity: 4 } });
    await until(() => bank.bank?.bank.resources.wood === 4, `${banker.cityName}: deposit`);
    await rejected(bank, { type: 'bankWithdraw', npcId: BANKERS[(index + 1) % 6].id, item: { kind: 'resource', id: 'wood', quantity: 1 } });
    assert.equal(saved()[hash(tokens[index])].characters[0].bank.resources.wood, 4);
    const trader = await connect(index + 6), auctioneer = AUCTIONEERS[index]; traders.push(trader);
    trader.send({ type: 'interact', targetId: auctioneer.id });
    await until(() => trader.auction?.open, `${auctioneer.cityName}: auction interaction`); assert.equal(trader.auction.npcId, auctioneer.id);
    trader.send({ type: 'auctionList', npcId: auctioneer.id, item: { kind: 'resource', id: 'wood', quantity: 2 }, currency: 'gold', price: '25' });
    listings.push(await until(() => trader.auction?.mine[0], `${auctioneer.cityName}: listing`));
    await rejected(trader, { type: 'auctionOpen', npcId: AUCTIONEERS[(index + 1) % 6].id });
  }
  for (let index = 0; index < 6; index++) {
    const trader = traders[index], listing = listings[(index + 1) % 6];
    await until(() => trader.auction.listings.some(row => row.id === listing.id), 'same market visible across cities');
    trader.send({ type: 'auctionBuy', npcId: AUCTIONEERS[index].id, listingId: listing.id });
    await until(() => !trader.auction.listings.some(row => row.id === listing.id), 'purchase a listing from another city');
  }
  await stop();
  const records = saved();
  for (let index = 0; index < 6; index++) Object.assign(records[hash(tokens[index])].characters[0], front(BANKERS[(index + 1) % 6]), { zone: BANKERS[(index + 1) % 6].zone });
  writeFileSync(file, JSON.stringify(records)); await start();
  for (let index = 0; index < 6; index++) {
    const bank = await connect(index), banker = BANKERS[(index + 1) % 6];
    bank.send({ type: 'bankOpen', npcId: banker.id }); await until(() => bank.bank?.open, 'reopen same bank in next city');
    assert.equal(bank.bank.bank.resources.wood, 4, 'personal bank follows the character between cities');
    bank.send({ type: 'bankWithdraw', npcId: banker.id, item: { kind: 'resource', id: 'wood', quantity: 4 } });
    await until(() => bank.bank?.reason && !bank.bank.bank.resources.wood, 'withdraw original deposit in another city');
    assert.equal(saved()[hash(tokens[index])].characters[0].inventory.wood, 10);
  }
  console.log('PASS six city services: reachable furnished banks and auction halls, exact local NPC IDs, private durable banking across cities and shared cross-city listing/buying.');
} finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
