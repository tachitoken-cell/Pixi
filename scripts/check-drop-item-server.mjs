import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { GEAR, starterGear, rollGear, maxHealth } from '../src/progression.ts';
import { newBags, bagUsage, bagCapacity } from '../src/bags.ts';
import { newBank } from '../src/bank.ts';
import { TREASURE_MAP_SITES } from '../src/treasure-maps.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-drop-item-')), file = join(dir, 'players.json'), clients = [];
const hash = token => createHash('sha256').update(token).digest('hex');
const rolled = rollGear('warden-longbow', 'rare', () => .42);
const stock = Object.values(GEAR).filter(g => g.price > 0 && (!g.className || g.className === 'Ranger') && g.requiredLevel <= 10 && !['warden-longbow', 'ranger-head'].includes(g.id));
function hero(name) {
  return { id: randomUUID(), name, coordinateVersion: 2, zone: 'greenwood', x: 0, z: 22, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), bank: newBank(), level: 10, xp: 0, gold: 500, hp: 208, maxHp: 208,
    inventory: { wood: 3, crystal: 3, herb: 3, potion: 3, relic: 3 }, carriedItems: {}, itemUseReadyAt: 0,
    quest: { stage: 0, kills: 0, crystals: 0 } };
}
const owner = hero('Item Dropper'), other = hero('Trade Partner');
const equippedBag = { id: randomUUID(), kind: 'linen-pouch' }, spareBag = { id: randomUUID(), kind: 'linen-pouch' };
owner.ownedGear.push('warden-longbow', 'ranger-head', rolled.id); owner.equipment.weapon = 'warden-longbow';
owner.maxHp = maxHealth(owner); owner.hp = owner.maxHp;
owner.ownedBags.push(equippedBag, spareBag); owner.equippedBags[0] = equippedBag.id;
owner.carriedItems = { 'slime-residue': 2, 'treasure-map': 1, 'moss-voucher': 1, 'moss-fox': 1 };
owner.ownedPets = ['moss-fox']; owner.summonedPet = 'moss-fox';
owner.treasureMap = { id: randomUUID(), siteId: TREASURE_MAP_SITES[0].id, stage: 'search', level: 10, voucher: false };
owner.bank.gear.push(stock[0].id);
owner.auctions = [{ id: randomUUID(), sellerId: owner.id, sellerName: owner.name,
  item: { kind: 'gear', id: stock[1].id, quantity: 1 }, currency: 'gold', price: '10', createdAt: Date.now() }];
other.ownedGear.push(stock[2].id); other.ownedBags.push({ id: randomUUID(), kind: 'linen-pouch' });
const heroes = { owner, other }, tokens = Object.fromEntries(Object.keys(heroes).map(key => [key, randomBytes(32).toString('base64url')]));
const saved = () => JSON.parse(readFileSync(file, 'utf8')), stored = key => saved()[hash(tokens[key])].characters[0];
const assets = p => structuredClone({ gold: p.gold, inventory: p.inventory, carriedItems: p.carriedItems, ownedGear: p.ownedGear, equipment: p.equipment,
  ownedBags: p.ownedBags, equippedBags: p.equippedBags, ownedPets: p.ownedPets, summonedPet: p.summonedPet,
  treasureMap: p.treasureMap && { id: p.treasureMap.id, siteId: p.treasureMap.siteId, stage: p.treasureMap.stage, level: p.treasureMap.level } });
let game, port;
async function until(fn, label) { const end = Date.now() + 6000; while (Date.now() < end) { const value = fn(); if (value) return value; await delay(15); } throw Error(`Timed out: ${label}`); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
async function connect(key) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, key, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === heroes[key].id);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (['snapshot', 'trade'].includes(message.type)) c[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[key], characterId: heroes[key].id }); await until(() => c.player(), `${key} enters`); return c;
}
const request = (itemId, quantity = 1) => ({ type: 'dropItem', itemId, quantity });
async function rejected(c, message, label) {
  await delay(650); // Error replies are rate limited by the realm.
  const before = assets(c.player()), disk = assets(stored(c.key)), index = c.messages.length; c.send(message);
  const event = await until(() => c.messages.slice(index).find(m => m.type === 'event' && m.kind === 'info'), label);
  await delay(120); assert.deepEqual(assets(c.player()), before, `${label}: live assets unchanged`); assert.deepEqual(assets(stored(c.key)), disk, `${label}: saved assets unchanged`); return event;
}
async function drop(c, itemId, changed, quantity = 1) {
  const before = assets(c.player()), loot = structuredClone(c.snapshot.loot), index = c.messages.length;
  c.send(request(itemId, quantity)); await until(() => changed(c.player()), `${itemId} destroyed`);
  assert(c.messages.slice(index).some(m => m.type === 'event' && m.text.startsWith('Destroyed ')));
  assert.equal(c.player().gold, before.gold, 'destruction awards no gold');
  assert.deepEqual(c.snapshot.loot, loot, 'destruction creates no world loot');
  assert.deepEqual(assets(stored(c.key)), assets(c.player()), 'destruction persisted before acknowledgement');
}
try {
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([key, p]) => [hash(tokens[key]), { characters: [p] }]))));
  await start(); let c = await connect('owner'), partner = await connect('other');
  for (const message of [request(null), request({}), request(''), request('x'.repeat(129)), request('__proto__'), request('item:__proto__'), request('gold'), request('item:unknown'),
    request('slime-residue'), { type: 'dropItem', itemId: 'wood' }, { ...request('wood'), gold: 1000 },
    ...[0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1, 4].map(quantity => request('wood', quantity)),
    request('ranger-head', 2), request('bag:' + spareBag.id, 2), request('bag:' + other.ownedBags[0].id), request(stock[2].id),
    request(stock[0].id), request(stock[1].id), request('item:slime-residue', 3)])
    await rejected(c, message, `invalid drop: ${JSON.stringify(message)}`);
  await drop(c, 'ranger-bow', p => !p.ownedGear.includes('ranger-bow'));
  await rejected(c, request('ranger-bow'), 'starter destruction replay');
  await rejected(c, request('ranger-tunic'), 'equipped starter armor protected');
  await rejected(c, request('warden-longbow'), 'equipped gear protected');
  await rejected(c, request('bag:' + equippedBag.id), 'equipped bag capacity protected');
  const capacity = bagCapacity(c.player()), usage = bagUsage(c.player());
  await drop(c, 'ranger-head', p => !p.ownedGear.includes('ranger-head'));
  assert.equal(bagUsage(c.player()), usage - 1); assert.equal(bagCapacity(c.player()), capacity);
  await rejected(c, request('ranger-head'), 'gear destruction replay');
  c.send(request(rolled.id)); c.send(request(rolled.id));
  await until(() => !c.player().ownedGear.includes(rolled.id), 'concurrent rolled equipment destruction');
  await delay(120); assert.equal(c.messages.filter(m => m.type === 'event' && m.text?.startsWith('Destroyed 1 ') && m.text.includes(rolled.label)).length, 1);
  for (const resource of ['wood', 'crystal', 'herb', 'potion', 'relic']) await drop(c, resource, p => p.inventory[resource] === 2);
  await drop(c, 'wood', p => p.inventory.wood === 0, 2);
  await rejected(c, request('wood'), 'empty resource stack');
  await drop(c, 'item:slime-residue', p => p.carriedItems['slime-residue'] === 1);
  await drop(c, 'item:slime-residue', p => !Object.hasOwn(p.carriedItems, 'slime-residue'));
  const map = c.player().treasureMap;
  for (const item of ['treasure-map', 'moss-voucher', 'moss-fox']) await drop(c, 'item:' + item, p => !Object.hasOwn(p.carriedItems, item));
  assert.deepEqual(c.player().treasureMap, map, 'unused map destruction preserves active expedition');
  assert.deepEqual(c.player().ownedPets, ['moss-fox']); assert.equal(c.player().summonedPet, 'moss-fox', 'pet token destruction preserves learned/summoned companion');
  await drop(c, 'bag:' + spareBag.id, p => !p.ownedBags.some(bag => bag.id === spareBag.id));
  assert.equal(bagCapacity(c.player()), capacity); await rejected(c, request('bag:' + spareBag.id), 'bag destruction replay');
  c.send({ type: 'tradeRequest', targetId: other.id });
  const trade = await until(() => partner.trade?.trade, 'trade invitation');
  partner.send({ type: 'tradeRespond', tradeId: trade.id, accept: true }); await until(() => c.trade?.trade?.status === 'open', 'trade opened');
  c.send({ type: 'tradeOffer', tradeId: trade.id, offer: { gold: 0, items: { crystal: 2 }, gear: [] } });
  await until(() => c.trade?.trade?.participants[0].offer.items.crystal === 2, 'resource stack offered');
  const partnerBefore = assets(partner.player()); await drop(c, 'crystal', p => p.inventory.crystal === 1);
  await until(() => c.trade?.trade === null && partner.trade?.trade === null, 'destruction cancels both trade views');
  assert.match(c.trade.reason, /dropping an item/); assert.deepEqual(assets(partner.player()), partnerBefore);
  await rejected(partner, { type: 'tradeAccept', tradeId: trade.id, revision: trade.revision }, 'cancelled trade cannot commit');
  await delay(1200); mkdirSync(file + '.tmp');
  assert.match((await rejected(c, request('herb'), 'disk failure rolls back destruction')).text, /could not be saved/);
  rmSync(file + '.tmp', { recursive: true });
  await drop(c, 'herb', p => p.inventory.herb === 1);
  const durable = assets(c.player()); await stop(); await start(); c = await connect('owner');
  assert.deepEqual(assets(c.player()), durable, 'destruction survives restart');
  assert(!c.player().ownedGear.includes('ranger-bow'), 'migration never recreates deliberately dropped starter equipment');
  assert.deepEqual(stored('owner').bank.gear, [stock[0].id]); assert.equal(stored('owner').auctions[0].item.id, stock[1].id);
  console.log('PASS: real WS item destruction, resources/stacks, rolled gear, bags, strict ownership/quantity checks, unequipped starter destruction, equipped/escrow protection, no gold/world loot, pet/map state, concurrent replay, trade cancellation, save-failure rollback and restart.');
} finally { rmSync(file + '.tmp', { recursive: true, force: true }); await stop(); rmSync(dir, { recursive: true, force: true }); }
