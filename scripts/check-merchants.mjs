import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import pg from 'pg';
import { createGameServer } from '../server.mjs';
import { playerDatabaseFixture } from './fixture-player-database.mjs';
import { merchantStock, gearSellPrice, MERCHANT_SET_LEVELS } from '../src/merchants.ts';
import { GEAR, GEAR_SETS, RESOURCE_PRICES, starterGear } from '../src/progression.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { CITY_VENDORS } from '../src/city.ts';
import { canTraverse, regionAt, toWorld, OVERWORLD_SPAWNS, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { waterAt, movementCost } from '../src/landscape.ts';
import { WALK_SPEED } from '../src/travel.ts';
import { findPath } from '../src/navigation.ts';
import { DUNGEON_ENTRANCE } from '../src/adventure.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { LOOT_TABLES, LOOT_ITEMS } from '../src/loot-items.ts';

const merchants = VILLAGE_NPCS.filter(npc => npc.role === 'merchant'), tiers = Object.entries(MERCHANT_SET_LEVELS);
assert.deepEqual(tiers.map(([id, level]) => [VILLAGE_NPCS.find(npc => npc.id === id)?.name, level]), [['Mira', 5], ['Nessa', 12], ['Anwen', 25], ['Bram', 40], ['Tessa', 50]]);
const essentials = Object.values(GEAR).filter(item => !item.setId && !item.dropOnly && item.price > 0).map(item => item.id);
for (const npc of merchants) {
  const stock = merchantStock(npc.id);
  if(CITY_VENDORS.some(city=>city.id===npc.id)){
    assert.deepEqual(stock.map(item=>item.id),Object.values(GEAR).filter(item=>!item.dropOnly&&item.price>0&&(npc.id==='city-weaponsmith'?item.slot==='weapon':item.slot!=='weapon')).map(item=>item.id));
    continue;
  }
  assert.deepEqual(stock.filter(item => !item.setId).map(item => item.id), essentials);
  assert.equal(stock.filter(item => item.setId).length, GEAR_SETS.filter(set => set.requiredLevel === MERCHANT_SET_LEVELS[npc.id]).length * 8);
  assert(stock.every(item => !item.setId || item.requiredLevel === MERCHANT_SET_LEVELS[npc.id]));
}
for (const item of Object.values(GEAR).filter(item => item.setId)) assert.equal(merchants.filter(npc => merchantStock(npc.id).some(gear => gear.id === item.id)).length, 2, `${item.id} has one regional merchant and one capital specialist`);
for (const id of ['ranger-bow', 'unknown', '__proto__', 'constructor']) assert.equal(gearSellPrice(id), 0);
for (const item of Object.values(GEAR)) assert.equal(gearSellPrice(item.id), item.sellPrice ?? Math.floor(item.price / 4));
for (const id of ['unknown', '__proto__', VILLAGE_NPCS.find(npc => npc.role === 'warden').id]) assert.deepEqual(merchantStock(id), []);
function beside(npc, radius = 1.6) {
  const point = Array.from({ length: 128 }, (_, i) => ({ x: npc.x + Math.sin(i * Math.PI / 64) * radius, z: npc.z + Math.cos(i * Math.PI / 64) * radius }))
    .find(point => !waterAt(point.x, point.z) && regionAt(point.x, point.z) === npc.zone && canTraverse(point, npc));
  assert(point, `reachable ${npc.id}`); return point;
}
let blocked;
for (const npc of merchants) {
  for (let i = 0; i < 256; i++) {
    const point = { x: npc.x + Math.sin(i * Math.PI / 128) * 2.95, z: npc.z + Math.cos(i * Math.PI / 128) * 2.95 };
    if (!waterAt(point.x, point.z) && regionAt(point.x, point.z) === npc.zone && canTraverse(point, point) && !canTraverse(point, npc)) { blocked = { npc, point }; break; }
  }
  if (blocked) break;
}
assert(blocked, 'real merchant scenery supplies an obstructed point inside the trade radius');
const primary = VILLAGE_NPCS.find(npc => npc.id === tiers[0][0]), healer = VILLAGE_NPCS.find(npc => npc.villageId === primary.villageId && npc.role === 'healer');
const ordinary = merchants.find(npc => !MERCHANT_SET_LEVELS[npc.id]), wet = { x: WORLD_BOUNDS.minX + 4, z: 0 };
assert(waterAt(wet.x, wet.z));
const fixtures = [
  ...tiers.map(([id]) => ({ name: id, npc: VILLAGE_NPCS.find(npc => npc.id === id), point: beside(VILLAGE_NPCS.find(npc => npc.id === id)) })),
  { name: 'Ordinary merchant', npc: ordinary, point: beside(ordinary) },
  { name: 'Remote buyer', npc: primary, point: { x: 0, z: 8 } },
  { name: 'Obstructed buyer', npc: blocked.npc, point: blocked.point },
  { name: 'Wrong villager', npc: healer, point: beside(healer) },
  { name: 'Swimming buyer', npc: primary, point: wet },
  { name: 'Dungeon buyer', npc: primary, point: toWorld('hollow', DUNGEON_ENTRANCE) },
  { name: 'Low level buyer', npc: primary, point: beside(primary), level: 4 },
  { name: 'Poor buyer', npc: primary, point: beside(primary), gold: 0 },
  { name: 'Fallen buyer', npc: primary, point: beside(primary), hp: 0 },
  ...CITY_VENDORS.map(npc=>({name:npc.id,npc,point:beside(npc)})),
  { name: 'Full purse seller', npc: primary, point: beside(primary), gold: Number.MAX_SAFE_INTEGER },
];
const dir = mkdtempSync(join(tmpdir(), 'mossvale-merchants-')), file = join(dir, 'players.json'), clients = [], realNow = Date.now;
let clock = realNow(), game, port; Date.now = () => clock;
const key = token => createHash('sha256').update(token).digest('hex'), tokens = fixtures.map(() => randomBytes(32).toString('base64url'));
function hero(fixture, index) {
  const level = fixture.level || 50;
  return { id: randomUUID(), name: `Merchant tester ${index}`, ...fixture.point, zone: regionAt(fixture.point.x, fixture.point.z), coordinateVersion: 2, rotation: 0, characterCreated: true, rootvaultUnlocked: fixture.name === 'Dungeon buyer',
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    ...starterGear('Ranger'), ownedGear: [...starterGear('Ranger').ownedGear, ...(fixture.name === 'Low level buyer' ? [] : ['warden-longbow']), 'star-ring', 'rootforged-charm'], talents: [], level, hp: fixture.hp ?? 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, xp: 0, gold: fixture.gold ?? 5000,
    inventory: { wood: 10, crystal: 10, herb: 10, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
}
writeFileSync(file, JSON.stringify(Object.fromEntries(fixtures.map((f, i) => [key(tokens[i]), { characters: [hero(f, i)] }]))));
async function until(fn, label) { const end = realNow() + 5000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 1000) { clock += ms; await delay(120); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['roster', 'welcome', 'snapshot'].includes(m.type)) c[m.type] = m; if (m.type === 'trade') c.trade = m.trade; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'roster');
  c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id }); await until(() => c.player(), 'world entry'); return c;
}
const economy = p => ({ gold: p.gold, ownedGear: p.ownedGear, equipment: p.equipment, inventory: p.inventory });
async function unchanged(c, requests, label) { const before = structuredClone(economy(c.player())); for (const request of requests) c.send(request); await tick(); assert.deepEqual(economy(c.player()), before, label); }
const buy = (npcId, itemId = 'briarwatch-head') => ({ type: 'buyGear', npcId, itemId });
const sellGear = (npcId, itemId = 'warden-longbow') => ({ type: 'sellGear', npcId, itemId });
const sell = npcId => ({ type: 'sellResource', npcId, resource: 'wood', quantity: 1 });
const saleEvents = (c, after = 0) => c.messages.slice(after).filter(m => m.type === 'event' && ['sellGear', 'sellBag', 'sellItem', 'sellResource'].includes(m.requestType));
async function queuedMerchantSale() {
  const OriginalClient = pg.Client, oldMerchant = { ...primary }, oldSlime = { ...MONSTERS['moss-slime'] }, oldLoot = LOOT_TABLES['moss-slime'];
  const slime = OVERWORLD_SPAWNS.find(enemy => enemy.id === 'slime-0'), token = randomBytes(32).toString('base64url');
  const owner = hero({ name: 'Queued seller', point: { x: slime.x + 1, z: slime.z } }, 99);
  owner.quest.stage = 1;
  const records = { [key(token)]: { characters: [owner], communityRulesVersion: 1 } }, stored = () => records[key(token)].characters[0];
  let holds = 0, releaseWrite;
  Date.now = realNow;
  pg.Client = playerDatabaseFixture(records, { beforeWrite: async rows => {
    const saved = rows.find(row => row.account_key === key(token))?.state.characters[0];
    if (saved && (holds === 0 && saved.carriedItems['prismatic-pearl'] === 1 || holds === 1 && saved.gold > owner.gold)) {
      holds++; await new Promise(resolve => { releaseWrite = resolve; }); releaseWrite = undefined;
    }
  } });
  Object.assign(primary, { x: owner.x, z: owner.z, zone: owner.zone });
  Object.assign(MONSTERS['moss-slime'], { hp: 1, damage: 0, speed: 0, aggroRange: 0 });
  LOOT_TABLES['moss-slime'] = [{ kind: 'item', itemId: 'prismatic-pearl', chance: 1 }];
  const disabled = { configured: false, status: async () => ({ configured: false, enabled: false }) };
  try {
    game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: 'postgres://isolated-merchant-fixture',
      auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, nftChain: disabled, treasuryChain: disabled, walletOidc: { env: {} } });
    port = await game.start();
    const c = await connect(token); c.send({ type: 'attack', targetId: slime.id });
    await until(() => c.snapshot.loot.some(drop => drop.ownerId === owner.id), 'queued-sale corpse');
    const corpse = c.snapshot.loot.find(drop => drop.ownerId === owner.id);
    await until(() => Date.now() >= corpse.diedAt + DEATH_ANIMATION_MS, 'queued-sale death animation');
    c.send({ type: 'loot', targetId: corpse.id, itemId: 'item:prismatic-pearl', requestId: randomUUID() });
    await until(() => releaseWrite, 'held pickup before merchant sale');
    const messages = c.messages.length;
    c.send({ type: 'sellItem', npcId: primary.id, itemId: 'prismatic-pearl', quantity: 1 }); c.send({ type: 'ping', id: 1 });
    await until(() => c.messages.some(m => m.type === 'pong' && m.id === 1), 'sale admitted behind held pickup');
    assert.equal(saleEvents(c, messages).length, 0, 'sale waits without rejecting or acknowledging pending loot');
    assert.equal(stored().carriedItems['prismatic-pearl'] || 0, 0, 'unconfirmed loot is not owned');
    releaseWrite(); await until(() => holds === 2 && releaseWrite, 'sale starts after loot is durable');
    assert.equal(saleEvents(c, messages).length, 0, 'sale success waits for its own durable commit');
    assert.equal(stored().carriedItems['prismatic-pearl'], 1); assert.equal(stored().gold, owner.gold);
    releaseWrite(); await until(() => saleEvents(c, messages).some(m => m.kind === 'reward'), 'tagged durable sale success');
    assert.equal(stored().carriedItems['prismatic-pearl'] || 0, 0);
    assert.equal(stored().gold, owner.gold + LOOT_ITEMS['prismatic-pearl'].sellPrice, 'newly committed loot sells exactly once');
    c.socket.terminate(); await game.stop(); game = null;
  } finally {
    releaseWrite?.(); await game?.stop(); game = null; pg.Client = OriginalClient;
    Date.now = () => clock;
    Object.assign(primary, oldMerchant); Object.assign(MONSTERS['moss-slime'], oldSlime); LOOT_TABLES['moss-slime'] = oldLoot;
  }
}
async function walk(c, destination) {
  const path = findPath(c.player(), destination, WORLD_COLLIDERS, WORLD_BOUNDS); assert(path.length, 'walkable departure');
  for (const point of path) while (Math.hypot(c.player().x - point.x, c.player().z - point.z) > .02) {
    const p = c.player(), gap = Math.hypot(point.x - p.x, point.z - p.z), step = Math.min(2.2, gap), next = { x: p.x + (point.x - p.x) / gap * step, z: p.z + (point.z - p.z) / gap * step };
    clock += Math.ceil(movementCost(p, next) / WALK_SPEED * 1000) + 50; c.send({ type: 'move', ...next, rotation: 0, zone: p.zone });
    await until(() => Math.hypot(c.player().x - next.x, c.player().z - next.z) < .02, 'accepted departure');
  }
}
try {
  await start(); let players = await Promise.all(tokens.map(connect));
  const buyer = players[0];
  assert.equal(buyer.welcome.merchantSales, true, 'welcome advertises tagged merchant acknowledgements');
  const rejectedAt = buyer.messages.length;
  for (const type of ['sellGear', 'sellBag', 'sellItem', 'sellResource']) buyer.send({ type });
  await until(() => saleEvents(buyer, rejectedAt).length === 4, 'each same-tick invalid sale receives a reply');
  assert.deepEqual(saleEvents(buyer, rejectedAt).map(m => [m.requestType, m.kind]), ['sellGear', 'sellBag', 'sellItem', 'sellResource'].map(type => [type, 'info']));
  await unchanged(buyer, [buy(undefined), sell(undefined), buy('__proto__'), sell('__proto__'), buy({ id: primary.id }), sell({ id: primary.id }), buy(healer.id), sell(healer.id), buy(tiers[1][0]), sell(tiers[1][0]), buy(primary.id, 'sandstrider-head'), buy(primary.id, 'ironbastion-head')], 'missing, fake, wrong-role, remote, wrong-stock and wrong-class requests cannot mutate balances');
  for (let index = 0; index < tiers.length; index++) {
    const [npcId, level] = tiers[index], c = players[index], set = GEAR_SETS.find(set => set.className === 'Ranger' && set.requiredLevel === level), item = GEAR[`${set.id}-head`], before = structuredClone(economy(c.player()));
    c.send(buy(npcId, item.id)); c.send(buy(npcId, item.id)); await until(() => c.player().ownedGear.includes(item.id), 'designated tier purchase');
    assert.equal(c.player().gold, before.gold - item.price, 'repeat purchase charges once');
    c.send({ type: 'equipGear', itemId: item.id }); await until(() => c.player().equipment.head === item.id, 'purchased tier equipment');
    for (const resource of ['wood', 'crystal', 'herb']) c.send({ type: 'sellResource', npcId, resource, quantity: 2 });
    await until(() => c.player().inventory.herb === 8, 'merchant resource sale');
    assert.equal(c.player().gold, before.gold - item.price + Object.values(RESOURCE_PRICES).reduce((sum, price) => sum + price * 2, 0));
  }
  const regular = players[5]; await unchanged(regular, [buy(ordinary.id)], 'ordinary merchants cannot sell exclusive sets');
  for(const [index,npc] of CITY_VENDORS.entries()){
    const c=players[14+index],weapon=npc.id==='city-weaponsmith',item=GEAR[weapon?'elderwild-weapon':'elderwild-head'];
    await unchanged(c,[buy(npc.id,weapon?'elderwild-head':'elderwild-weapon')],'capital specialists reject the other shop category');
    const before=structuredClone(economy(c.player()));c.send(buy(npc.id,item.id));c.send(buy(npc.id,item.id));
    await until(()=>c.player().ownedGear.includes(item.id),'capital specialist purchase');
    assert.equal(c.player().gold,before.gold-item.price,'capital specialist repeat purchase charges once');
    c.send({type:'equipGear',itemId:item.id});await until(()=>c.player().equipment[item.slot]===item.id,'capital purchase equips');
    c.send(sell(npc.id));await until(()=>c.player().inventory.wood===9,'capital vendor resource sale');
    assert.equal(c.player().gold,before.gold-item.price+RESOURCE_PRICES.wood);
  }
  regular.send(buy(ordinary.id, 'copper-ring')); await until(() => regular.player().ownedGear.includes('copper-ring'), 'ordinary merchant essentials');
  for (const index of [6, 7, 8, 9, 13]) await unchanged(players[index], [buy(fixtures[index].npc.id, 'copper-ring'), sell(fixtures[index].npc.id), sellGear(fixtures[index].npc.id)], `${fixtures[index].name} cannot buy or sell`);
  await unchanged(players[11], [buy(primary.id)], 'merchant proximity does not bypass level requirements');
  await unchanged(players[12], [buy(primary.id)], 'merchant proximity does not bypass gold requirements');
  const delver = players[10]; delver.send({ type: 'dungeonEnter' }); await until(() => delver.player().instanceId, 'enter actual dungeon');
  await unchanged(delver, [buy(primary.id, 'copper-ring'), sell(primary.id), sellGear(primary.id)], 'world merchants cannot transact from a dungeon');
  // Sales use the gear's resale value, independently of the merchant's stock.
  await unchanged(buyer, [sellGear(undefined), sellGear('__proto__'), sellGear({ id: primary.id }), sellGear(healer.id), sellGear(tiers[1][0]),
    sellGear(primary.id, 'unknown'), sellGear(primary.id, '__proto__'), sellGear(primary.id, 'constructor'), sellGear(primary.id, 'ranger-bow'),
    sellGear(primary.id, 'elderwild-head'), sellGear(primary.id, null), { type: 'sellGear', npcId: primary.id },
    { ...sellGear(primary.id), price: 99999 }, { ...sellGear(primary.id), quantity: 2 }, { ...sellGear(primary.id), slot: 'weapon' }],
    'malformed, forged-price, unknown, unowned, free and invalid-merchant sales cannot change assets');
  await unchanged(players.at(-1), [sellGear(primary.id)], 'gear sales reject gold overflow');
  buyer.send({ type: 'equipGear', itemId: 'warden-longbow' }); await until(() => buyer.player().equipment.weapon === 'warden-longbow', 'equip old weapon');
  await unchanged(buyer, [sellGear(primary.id)], 'equipped weapons cannot be sold');
  await unchanged(buyer, [sellGear(primary.id, 'ranger-bow')], 'unequipped starter gear cannot be sold');
  buyer.send({ type: 'equipGear', itemId: 'ranger-bow' }); await until(() => buyer.player().equipment.weapon === 'ranger-bow', 'replace old weapon');
  for (const slot of ['ring1', 'ring2']) {
    buyer.send({ type: 'equipGear', itemId: 'star-ring', slot }); await until(() => buyer.player().equipment[slot] === 'star-ring', `equip ${slot}`);
    await unchanged(buyer, [sellGear(primary.id, 'star-ring')], `${slot} equipment cannot be sold`);
    buyer.send({ type: 'unequipGear', slot }); await until(() => buyer.player().equipment[slot] === null, `unequip ${slot}`);
  }
  // The same atomic inventory path cancels an open trade before consuming its offered gear.
  const peer = players[11], peerBefore = structuredClone(economy(peer.player()));
  buyer.send({ type: 'tradeRequest', targetId: peer.player().id }); await until(() => peer.trade?.status === 'invited', 'trade invitation');
  peer.send({ type: 'tradeRespond', tradeId: peer.trade.id, accept: true }); await until(() => buyer.trade?.status === 'open', 'open trade');
  buyer.send({ type: 'tradeOffer', tradeId: buyer.trade.id, offer: { gold: 0, items: {}, gear: ['warden-longbow'] } });
  await until(() => buyer.trade?.participants[0].offer.gear.includes('warden-longbow'), 'offer old gear');
  const offered = structuredClone(buyer.trade), beforeSale = structuredClone(economy(buyer.player()));
  buyer.send(sellGear(primary.id)); buyer.send(sellGear(primary.id));
  buyer.send({ type: 'tradeAccept', tradeId: offered.id, revision: offered.revision }); peer.send({ type: 'tradeAccept', tradeId: offered.id, revision: offered.revision });
  await until(() => !buyer.player().ownedGear.includes('warden-longbow') && buyer.trade === null && peer.trade === null, 'gear sale cancels the trade');
  assert.equal(buyer.player().gold, beforeSale.gold + gearSellPrice('warden-longbow'), 'concurrent sales credit the old gear exactly once');
  assert.deepEqual(economy(peer.player()), peerBefore, 'the trade recipient never receives sold gear or loses funds');
  await unchanged(buyer, [sellGear(primary.id)], 'replaying a completed sale cannot credit it again');
  const saleOnDisk = JSON.parse(readFileSync(file, 'utf8'))[key(tokens[0])].characters[0];
  assert.equal(saleOnDisk.gold, buyer.player().gold); assert(!saleOnDisk.ownedGear.includes('warden-longbow'), 'sale credit and removal are durable together');
  // Capital specialists also buy gear outside their own shop category.
  for (const [index, npc] of CITY_VENDORS.entries()) {
    const c = players[14 + index], itemId = npc.id === 'city-weaponsmith' ? 'star-ring' : 'warden-longbow', gold = c.player().gold;
    assert(!merchantStock(npc.id).some(item => item.id === itemId)); c.send(sellGear(npc.id, itemId));
    await until(() => !c.player().ownedGear.includes(itemId), 'off-stock gear sale'); assert.equal(c.player().gold, gold + gearSellPrice(itemId));
  }
  const craftedGold = buyer.player().gold; buyer.send(sellGear(primary.id, 'rootforged-charm'));
  await until(() => !buyer.player().ownedGear.includes('rootforged-charm'), 'sell crafted gear');
  assert.equal(buyer.player().gold, craftedGold + 25, 'crafted Rootforged gear has an explicit resale price');
  // A failed save consumes neither the gear nor its resale gold; retry remains possible.
  await delay(1100); const failureAssets = structuredClone(economy(buyer.player())), failureDisk = readFileSync(file, 'utf8'), failureMessages = buyer.messages.length;
  mkdirSync(`${file}.tmp`); const previousError = console.error; console.error = () => {};
  try {
    buyer.send(sellGear(primary.id, 'star-ring'));
    await until(() => saleEvents(buyer, failureMessages).some(m => m.requestType === 'sellGear' && m.kind === 'info' && m.text.includes('could not be saved')), 'tagged sale save failure');
    assert.deepEqual(economy(buyer.player()), failureAssets, 'failed sale leaves live gear and gold untouched');
    assert.equal(readFileSync(file, 'utf8'), failureDisk, 'failed sale leaves stored gear and gold untouched');
  } finally { rmSync(`${file}.tmp`, { recursive: true, force: true }); console.error = previousError; }
  buyer.send(sellGear(primary.id, 'star-ring')); await until(() => !buyer.player().ownedGear.includes('star-ring'), 'retry sale after failed persistence');
  assert.equal(buyer.player().gold, failureAssets.gold + gearSellPrice('star-ring'));
  buyer.send({ type: 'npcService', npcId: primary.id, service: 'trade' }); await until(() => buyer.messages.some(m => m.type === 'villageService' && m.npcId === primary.id), 'valid merchant menu');
  buyer.send(buy(primary.id, 'copper-ring')); await until(() => buyer.player().ownedGear.includes('copper-ring'), 'own sellable gear before leaving shop');
  await walk(buyer, beside(primary, 6));
  await unchanged(buyer, [buy(primary.id, 'briarwatch-shoes'), sell(primary.id), sellGear(primary.id, 'copper-ring')], 'leaving an open merchant menu revokes every transaction');
  buyer.send({ type: 'unequipGear', slot: 'head' }); await until(() => buyer.player().equipment.head === null, 'unequip away from merchant');
  buyer.send({ type: 'equipGear', itemId: 'briarwatch-head' }); await until(() => buyer.player().equipment.head === 'briarwatch-head', 'owned gear equips away from merchant');
  const saved = players.slice(0, 6).map(c => structuredClone(economy(c.player()))); await game.stop(); game = null;
  const disk = JSON.parse(readFileSync(file, 'utf8')); for (let i = 0; i < 6; i++) assert.deepEqual(economy(disk[key(tokens[i])].characters[0]), saved[i]);
  await start(); players = await Promise.all(tokens.slice(0, 6).map(connect));
  for (let i = 0; i < 6; i++) assert.deepEqual(economy(players[i].player()), saved[i], 'merchant purchases and sales survive restart');
  const limited = players[0], floodAt = limited.messages.length;
  for (let id = 0; id < 130; id++) limited.send({ type: 'ping', id });
  await until(() => limited.messages.slice(floodAt).some(m => m.type === 'event' && m.text === 'Too many actions. Slow down a little.'), 'exhausted message budget');
  const limitedAt = limited.messages.length, saleTypes = ['sellGear', 'sellBag', 'sellItem', 'sellResource'];
  for (const type of saleTypes) limited.send({ type });
  await until(() => saleEvents(limited, limitedAt).length === saleTypes.length, 'rate-limited sales each receive their tagged reply');
  assert.deepEqual(saleEvents(limited, limitedAt).map(m => [m.requestType, m.kind, m.text]), saleTypes.map(type => [type, 'info', 'Too many actions. Slow down a little.']));
  assert.equal(limited.socket.readyState, WebSocket.OPEN, 'a same-tick burst does not disconnect the sales queue');
  assert.deepEqual(economy(limited.player()), saved[0], 'rate-limited sales change no gold or items');
  await game.stop(); game = null; await queuedMerchantSale();
  console.log('PASS: five regional tier merchants and two capital specialists, all160 pieces stocked by region/category; real purchases/equipment/sales; missing/fake/remote/wrong-role/wrong-stock/class/level/gold/obstructed/water/death/dungeon guards; departing an open shop; anywhere equipment; atomic gear resale, exact-once trade races, failure rollback/retry, durable restart, tagged unthrottled acknowledgements and sales waiting for loot durability.');
} finally { for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
