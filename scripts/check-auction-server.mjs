import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS, ZONES } from '../src/content.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { defaultHotbar } from '../src/spells.ts';
import { newContracts } from '../src/adventure.ts';
import { canTraverse, regionAt, createOverworldSpawns } from '../src/realm.ts';
import { AUCTIONEER, insideAnyCity } from '../src/city.ts';
import { auctionGoldPrice, auctionCanList, auctionCanReceive } from '../src/auction.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-auction-')), file = join(dataDir, 'players.json'), clients = [];
const realNow = Date.now; let offset = 0, game, port, probeHome;
Date.now = () => realNow() + offset;
const hash = token => createHash('sha256').update(token).digest('hex');
const resources = { wood: 30, crystal: 20, herb: 15, potion: 3, relic: 5 };
const near = Array.from({ length: 32 }, (_, i) => ({ x: AUCTIONEER.x + Math.cos(i * Math.PI / 16) * 1.2, z: AUCTIONEER.z + Math.sin(i * Math.PI / 16) * 1.2 })).find(point => canTraverse(point, AUCTIONEER));
assert(near, 'auctioneer has a reachable approach');
function hero(name, className = 'Ranger', level = 75, at = near) {
  const maxHp = 100 + (level - 1) * 12;
  return { id: randomUUID(), name, ...at, zone: regionAt(at.x, at.z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    characterCreated: true, talents: [], ...starterGear(className), hotbar: defaultHotbar(className), hp: maxHp, maxHp, level, xp: 0, gold: 1000,
    inventory: { ...resources }, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } };
}
const heroes = [hero('Auction Seller'), hero('Auction Buyer'), hero('Auction Rival'), hero('Auction Mage', 'Mage', 1), hero('Far Adventurer', 'Ranger', 75, { x: 0, z: 8 })];
heroes[0].ownedGear.push('warden-longbow', 'ranger-head', 'copper-ring'); heroes[0].equipment.ring1 = 'copper-ring';
const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
const saved = () => JSON.parse(readFileSync(file, 'utf8'));
const stored = i => saved()[hash(tokens[i])].characters[0];
const assets = player => ({ gold: player.gold, inventory: player.inventory, ownedGear: player.ownedGear, equipment: player.equipment });
async function until(predicate, label) {
  const until = realNow() + 6000;
  while (realNow() < until) { const value = predicate(); if (value) return value; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function advance(ms = 700) { offset += ms; await delay(35); }
async function start() {
  const spawns = ZONES[0].enemies;
  ZONES[0].enemies = [...spawns, { id: 'capital-safety-probe', kind: 'moss-slime', x: near.x, z: near.z + .8 }];
  try { probeHome = createOverworldSpawns().find(enemy => enemy.id === 'capital-safety-probe'); game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES[0].enemies = spawns; }
  port = await game.start();
}
async function connect(i) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, id: heroes[i].id, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === client.id);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['roster', 'snapshot', 'auction', 'welcome'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token: tokens[i], characterId: client.id });
  await until(() => client.player(), 'character present'); return client;
}
const request = (type, extra = {}) => ({ type, npcId: AUCTIONEER.id, ...extra });
async function reject(client, message, label = message.type) {
  await advance(); const count = client.messages.length; client.send(message);
  await until(() => client.messages.slice(count).some(m => m.type === 'event' && m.kind === 'info'), `reject ${label}`);
}
async function list(client, item, price = '25') {
  const before = new Set(client.auction?.listings.map(listing => listing.id));
  client.send(request('auctionList', { item, currency: 'gold', price }));
  return until(() => client.auction?.mine.find(listing => !before.has(listing.id)), 'durably escrowed listing');
}
async function cancel(client, listing) {
  client.send(request('auctionCancel', { listingId: listing.id }));
  await until(() => !client.auction?.mine.some(item => item.id === listing.id), 'cancel restores escrow');
}
try {
  writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((player, i) => [hash(tokens[i]), { characters: [player] }]))));
  await start(); let [seller, buyer, rival, mage, far] = await Promise.all(heroes.map((_, i) => connect(i)));
  seller.send({ type: 'interact', targetId: AUCTIONEER.id }); await until(() => seller.auction, 'NPC interaction opens auction');
  buyer.send(request('auctionOpen')); await until(() => buyer.auction, 'browse auction');
  assert.equal(seller.auction.crypto.enabled, false);
  assert.equal(seller.auction.open, true, 'explicit NPC interaction opens the window');
  await delay(350);
  assert(probeHome && !insideAnyCity(probeHome.x, probeHome.z), 'unsafe non-roaming spawns are relocated outside the capital');
  const probe = seller.snapshot.enemies.find(enemy => enemy.id === 'capital-safety-probe');
  if (probe) assert.equal(probe.attack, null, 'a relocated monster cannot acquire auction visitors');
  assert.equal(seller.player().hp, seller.player().maxHp, 'auction visitors stay safe beside a monster');
  assert(!Object.hasOwn(seller.player(), 'auctions'), 'escrow is excluded from world player snapshots');
  assert(!Object.hasOwn(seller.player(), 'auctionSales'), 'sale history is excluded from world player snapshots');
  assert.deepEqual(seller.auction.sold, [], 'existing saves begin with empty private sale history');
  for (const player of heroes) assert(canTraverse(player, player), 'fixture is outside walls');
  for (const price of ['', '0', '-1', '01', '1.5', '1e3', '1000000001', 25, null]) assert.equal(auctionGoldPrice(price), null);
  const baseline = structuredClone(assets(seller.player()));
  for (const extra of [
    { item: { kind: 'resource', id: 'wood', quantity: 31 }, currency: 'gold', price: '25' },
    { item: { kind: 'resource', id: 'wood', quantity: .5 }, currency: 'gold', price: '25' },
    { item: { kind: 'resource', id: 'diamonds', quantity: 1 }, currency: 'gold', price: '25' },
    { item: { kind: 'resource', id: 'wood', quantity: 1, gold: 2 }, currency: 'gold', price: '25' },
    { item: { kind: 'gear', id: 'ranger-bow', quantity: 1 }, currency: 'gold', price: '25' },
    { item: { kind: 'gear', id: 'copper-ring', quantity: 1 }, currency: 'gold', price: '25' },
    { item: { kind: 'resource', id: 'wood', quantity: 1 }, currency: 'eth', price: '0.01' },
    { item: { kind: 'resource', id: 'wood', quantity: 1 }, currency: 'gold', price: '0' },
    { item: { kind: 'resource', id: 'wood', quantity: 1 }, currency: 'gold', price: '25', sellerId: buyer.id },
  ]) await reject(seller, request('auctionList', extra));
  assert.deepEqual(assets(seller.player()), baseline, 'invalid messages never move assets');
  await reject(far, request('auctionOpen'), 'range');
  await reject(seller, { ...request('auctionOpen'), npcId: 'fake' }, 'auctioneer identity');
  const resourceListing = await list(seller, { kind: 'resource', id: 'wood', quantity: 5 });
  assert.equal(stored(0).inventory.wood, 25); assert.equal(stored(0).auctions[0].id, resourceListing.id);
  assert.equal(buyer.auction.listings[0].sellerName, heroes[0].name);
  assert.equal(buyer.auction.open, false, 'nearby listing updates never force a closed window open');
  await reject(seller, request('auctionBuy', { listingId: resourceListing.id }), 'self purchase');
  await reject(buyer, request('auctionCancel', { listingId: resourceListing.id }), 'cancel someone else');
  seller.socket.terminate(); await delay(50);
  buyer.send(request('auctionBuy', { listingId: resourceListing.id })); rival.send(request('auctionBuy', { listingId: resourceListing.id }));
  await until(() => stored(0).auctions.length === 0 && buyer.player().gold + rival.player().gold === 1975, 'one concurrent buyer settles with offline seller');
  assert.equal(stored(0).gold, 1025); assert.equal(stored(1).inventory.wood + stored(2).inventory.wood, 65);
  const firstSale = stored(0).auctionSales[0], winner = stored(1).inventory.wood === 35 ? heroes[1] : heroes[2];
  assert.deepEqual(firstSale, { id: resourceListing.id, item: resourceListing.item, currency: 'gold', price: '25', buyerName: winner.name, soldAt: firstSale.soldAt });
  assert(Number.isSafeInteger(firstSale.soldAt) && firstSale.soldAt >= resourceListing.createdAt && firstSale.soldAt <= Date.now());
  assert.equal(stored(0).auctionSales.length, 1, 'concurrent buyers record exactly one sale for the offline seller');
  assert.deepEqual(stored(1).auctionSales, []); assert.deepEqual(stored(2).auctionSales, []);
  assert.deepEqual(buyer.auction.sold, [], 'buyer receives only their own private Sold history');
  assert(buyer.snapshot.players.every(player => !Object.hasOwn(player, 'auctionSales')), 'another player never receives seller history in snapshots');
  await reject(buyer, request('auctionBuy', { listingId: resourceListing.id }), 'replayed purchase');
  const afterSale = [0, 1, 2].map(stored).map(assets);
  await game.stop(); await start(); [seller, buyer, rival, mage, far] = await Promise.all(heroes.map((_, i) => connect(i)));
  assert.deepEqual([seller, buyer, rival].map(client => assets(client.player())), afterSale, 'restart keeps one item transfer and both wallet balances');
  seller.send(request('auctionOpen')); await until(() => seller.auction, 'reopen after restart');
  assert.deepEqual(seller.auction.sold, [firstSale], 'replay and restart preserve one sale in the seller Sold tab');
  assert.deepEqual(stored(0).auctionSales, [firstSale]);
  const gear = await list(seller, { kind: 'gear', id: 'warden-longbow', quantity: 1 }, '90');
  const sellerStats = combatStats(seller.player());
  assert(!stored(0).ownedGear.includes('warden-longbow'));
  assert(!auctionCanReceive(stored(0), gear.item), 'escrowed unique gear cannot be acquired twice');
  await reject(mage, request('auctionBuy', { listingId: gear.id }), 'wrong class or level');
  await cancel(seller, gear); assert(stored(0).ownedGear.includes('warden-longbow'));
  assert.deepEqual(combatStats(seller.player()), sellerStats, 'escrow and cancellation do not change equipped stats');
  await reject(seller, request('auctionCancel', { listingId: gear.id }), 'replayed cancel');
  assert.deepEqual(stored(0).auctionSales, [firstSale], 'cancelled listings never appear as sold');
  const failed = await list(seller, { kind: 'resource', id: 'herb', quantity: 3 }, '40');
  const beforeFailure = [0, 1].map(stored).map(assets);
  await delay(1100); mkdirSync(`${file}.tmp`);
  await reject(buyer, request('auctionBuy', { listingId: failed.id }), 'failed disk save');
  assert.deepEqual([stored(0), stored(1)].map(assets), beforeFailure, 'failed atomic save leaves durable balances unchanged');
  assert.deepEqual([seller, buyer].map(client => assets(client.player())), beforeFailure, 'failed atomic save leaves live balances unchanged');
  assert(stored(0).auctions.some(listing => listing.id === failed.id), 'failed purchase retains escrow');
  assert.deepEqual(stored(0).auctionSales, [firstSale], 'failed atomic purchase cannot append a sale');
  assert.deepEqual(seller.auction.sold, [firstSale], 'failed sale is not shown in the live Sold tab');
  rmSync(`${file}.tmp`, { recursive: true });
  buyer.send(request('auctionBuy', { listingId: failed.id }));
  await until(() => !stored(0).auctions.some(listing => listing.id === failed.id), 'retry settles once');
  assert.equal(stored(0).gold, beforeFailure[0].gold + 40); assert.equal(stored(1).gold, beforeFailure[1].gold - 40);
  assert.equal(stored(1).inventory.herb, beforeFailure[1].inventory.herb + 3);
  assert.deepEqual(stored(0).auctionSales.map(sale => sale.id), [failed.id, resourceListing.id], 'successful retry records one newest-first sale');
  await until(() => seller.auction.sold[0]?.id === failed.id, 'successful sale updates the Sold tab');
  assert.deepEqual(seller.auction.sold, stored(0).auctionSales, 'Sold tab uses the durable seller history');
  assert(!auctionCanList({ ...stored(0), auctions: Array(24).fill({}) }, { kind: 'resource', id: 'wood', quantity: 1 }), 'seller listing cap');
  assert(!auctionCanReceive({ ...stored(1), inventory: { ...resources, wood: Number.MAX_SAFE_INTEGER } }, { kind: 'resource', id: 'wood', quantity: 1 }), 'receive overflow guarded');
  await game.stop();
  const historyState = saved(), seededSales = Array.from({ length: 100 }, (_, index) => ({
    ...firstSale, id: randomUUID(), soldAt: Date.now() - 1000 - index,
  }));
  historyState[hash(tokens[0])].characters[0].auctionSales = seededSales;
  writeFileSync(file, JSON.stringify(historyState));
  await start(); [seller, buyer] = await Promise.all([connect(0), connect(1)]);
  seller.send(request('auctionOpen')); await until(() => seller.auction, 'open complete history');
  const newest = await list(seller, { kind: 'resource', id: 'wood', quantity: 1 }, '1');
  buyer.send(request('auctionBuy', { listingId: newest.id }));
  await until(() => !stored(0).auctions.some(listing => listing.id === newest.id), 'sale after history reaches its limit');
  assert.deepEqual(stored(0).auctionSales.map(sale => sale.id), [newest.id, ...seededSales.slice(0, 99).map(sale => sale.id)], 'history retains exactly the newest 100 completed sales');
  await until(() => seller.auction.sold[0]?.id === newest.id, 'newest sale updates a full Sold tab');
  assert.deepEqual(seller.auction.sold, stored(0).auctionSales, 'Sold tab uses the same bounded durable history');
  console.log('Auction checks passed: real NPC proximity, strict payloads, escrow, offline seller, concurrent buyers, restart, replay, cancellation, gear constraints, stat invariants, durable private Sold history and save-failure rollback.');
} finally {
  rmSync(`${file}.tmp`, { recursive: true, force: true });
  for (const client of clients) client.socket.terminate();
  if (game) await game.stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true });
}
