import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { BANKER, AUCTIONEER } from '../src/city.ts';
import { canTraverse } from '../src/realm.ts';
import { combatStats, maxHealth, gearById, gearUpgradeQuote, rollGear, starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newBank } from '../src/bank.ts';
import { newContracts } from '../src/adventure.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-gear-upgrades-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now; let offset = 0, game, port; Date.now = () => realNow() + offset;
const endgame = process.argv.includes('--endgame');
const rolled = endgame ? rollGear('elderwild-weapon', 'mythic', () => .4321, 60) : rollGear('warden-longbow', 'mythic', () => .4321);
function hero(name) {
  return { id: randomUUID(), name, coordinateVersion: 2, zone: 'greenwood', x: BANKER.x - 1.5, z: BANKER.z, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), bank: newBank(), auctions: [], level: endgame ? 60 : 10, xp: 0, gold: endgame ? 100000 : 10000, hp: 208, maxHp: 208,
    inventory: { wood: 1000, crystal: 1000, herb: 1000, relic: 1000, potion: 0 }, carriedItems: {}, itemUseReadyAt: 0,
    skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } };
}
const heroes = { owner: hero('Gear Upgrader'), buyer: hero('Gear Buyer'), poor: hero('Poor Upgrader') };
heroes.owner.ownedGear.push(rolled.id); heroes.owner.equipment.weapon = rolled.id; heroes.owner.maxHp = maxHealth(heroes.owner);
heroes.poor.ownedGear.push('warden-longbow'); heroes.poor.gold = 0; heroes.poor.inventory.crystal = 0;
if (endgame) for (const p of Object.values(heroes)) p.maxHp = maxHealth(p);
const tokens = Object.fromEntries(Object.keys(heroes).map(name => [name, randomBytes(32).toString('base64url')]));
const hash = token => createHash('sha256').update(token).digest('hex');
const saved = () => JSON.parse(readFileSync(file, 'utf8')), stored = name => saved()[hash(tokens[name])].characters[0];
const assets = p => structuredClone({ gold: p.gold, inventory: p.inventory, equipment: p.equipment, ownedGear: p.ownedGear });
async function until(fn, label) { const end = realNow() + 6000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(15); } throw Error(`Timed out: ${label}`); }
async function tick() { offset += 900; await delay(120); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
async function connect(name) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, name, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === heroes[name].id);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (['snapshot', 'bank', 'auction'].includes(message.type)) c[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[name], characterId: heroes[name].id }); await until(() => c.player(), `${name} enters`); return c;
}
async function rejected(c, message, label) {
  await tick(); const before = assets(c.player()), disk = assets(stored(c.name)), index = c.messages.length; c.send(message);
  const event = await until(() => c.messages.slice(index).find(m => m.type === 'event' && m.kind === 'info'), label);
  await delay(120); assert.deepEqual(assets(c.player()), before, `${label}: live assets unchanged`); assert.deepEqual(assets(stored(c.name)), disk, `${label}: saved assets unchanged`); return event;
}
try {
  assert(canTraverse(heroes.owner, BANKER));
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([name, p]) => [hash(tokens[name]), { characters: [p] }]))));
  await start(); let owner = await connect('owner'), buyer = await connect('buyer'), poor = await connect('poor');
  assert.deepEqual(gearById(owner.player().equipment.weapon), rolled, 'a saved roll loads with its exact stats');
  if (endgame) assert.equal(rolled.requiredLevel, 60, 'endgame gear retains its level requirement');
  for (const gearId of ['__proto__', 'unknown', rolled.id.replace(/~0$/, '~9'), rollGear('warden-longbow', 'legendary', () => .1).id, 'ranger-bow'])
    await rejected(owner, { type: 'upgradeGear', gearId }, 'forged, unowned or starter upgrade');
  await rejected(owner, { type: 'upgradeGear', gearId: rolled.id, gold: 0 }, 'client cannot override upgrade cost');
  await rejected(poor, { type: 'upgradeGear', gearId: 'warden-longbow' }, 'insufficient material and gold');
  await delay(1200); mkdirSync(file + '.tmp');
  assert.match((await rejected(owner, { type: 'upgradeGear', gearId: rolled.id }, 'injected disk failure')).text, /could not be saved/);
  rmSync(file + '.tmp', { recursive: true });
  for (let level = 1; level <= 5; level++) {
    await tick(); const id = owner.player().equipment.weapon, before = assets(owner.player()), stats = combatStats(owner.player()), quote = gearUpgradeQuote(id);
    const request = { type: 'upgradeGear', gearId: id }; owner.send(request); owner.send(request);
    await until(() => owner.player().equipment.weapon === quote.nextId, `upgrade to +${level}`); await delay(120);
    const after = owner.player(); assert.equal(after.gold, before.gold - quote.gold); assert.equal(gearById(after.equipment.weapon).upgradeLevel, level);
    assert.equal(gearById(after.equipment.weapon).requiredLevel, rolled.requiredLevel, 'upgrades retain the rolled level requirement');
    assert.equal(after.ownedGear.filter(owned => owned === quote.nextId).length, 1); assert(!after.ownedGear.includes(id));
    for (const [key, quantity] of Object.entries(quote.materials)) assert.equal(after.inventory[key], before.inventory[key] - quantity);
    assert(combatStats(after).primaryDamage > stats.primaryDamage); assert(combatStats(after).specialDamage > stats.specialDamage);
    assert.deepEqual(assets(stored('owner')), assets(after), 'material debit and equipped identity are durable together');
    await rejected(owner, request, 'old upgrade request cannot replay');
  }
  const finalId = owner.player().equipment.weapon, finalGear = gearById(finalId);
  await rejected(owner, { type: 'upgradeGear', gearId: finalId }, 'maximum upgrade guard');
  const beforeRestart = assets(owner.player()); await stop(); await start(); owner = await connect('owner'); buyer = await connect('buyer');
  assert.deepEqual(assets(owner.player()), beforeRestart); assert.deepEqual(gearById(owner.player().equipment.weapon), finalGear);
  await tick(); owner.send({ type: 'equipGear', itemId: 'ranger-bow' }); await until(() => owner.player().equipment.weapon === 'ranger-bow', 'unequip upgraded weapon');
  const item = { kind: 'gear', id: finalId, quantity: 1 };
  await tick(); owner.send({ type: 'bankDeposit', npcId: BANKER.id, item }); await until(() => owner.bank?.bank.gear.includes(finalId), 'bank upgraded gear');
  await rejected(owner, { type: 'upgradeGear', gearId: finalId }, 'banked gear cannot be upgraded from inventory');
  await stop(); await start(); owner = await connect('owner');
  assert.deepEqual(gearById(stored('owner').bank.gear[0]), finalGear, 'banked random attributes survive restart');
  await tick(); owner.send({ type: 'bankWithdraw', npcId: BANKER.id, item }); await until(() => owner.player().ownedGear.includes(finalId), 'withdraw upgraded gear');
  await stop();
  const records = saved(), near = Array.from({ length: 32 }, (_, i) => ({ x: AUCTIONEER.x + Math.cos(i * Math.PI / 16) * 1.2, z: AUCTIONEER.z + Math.sin(i * Math.PI / 16) * 1.2 })).find(point => canTraverse(point, AUCTIONEER)); assert(near);
  for (const record of Object.values(records)) Object.assign(record.characters[0], near); writeFileSync(file, JSON.stringify(records));
  await start(); owner = await connect('owner'); buyer = await connect('buyer');
  await tick(); owner.send({ type: 'auctionList', npcId: AUCTIONEER.id, item, currency: 'gold', price: '25' });
  const listing = await until(() => owner.auction?.mine.find(row => row.item.id === finalId), 'auction upgraded gear');
  assert(!owner.player().ownedGear.includes(finalId)); const buyerGold = buyer.player().gold;
  await tick(); buyer.send({ type: 'auctionBuy', npcId: AUCTIONEER.id, listingId: listing.id }); await until(() => buyer.player().ownedGear.includes(finalId), 'purchase upgraded gear');
  assert.equal(buyer.player().gold, buyerGold - 25); assert.deepEqual(gearById(buyer.player().ownedGear.at(-1)), finalGear);
  await rejected(buyer, { type: 'auctionBuy', npcId: AUCTIONEER.id, listingId: listing.id }, 'auction purchase replay');
  await tick(); buyer.send({ type: 'equipGear', itemId: finalId }); await until(() => buyer.player().equipment.weapon === finalId, 'buyer equips exact upgrade');
  const durableBuyer = assets(buyer.player()); await stop(); await start(); buyer = await connect('buyer'); assert.deepEqual(assets(buyer.player()), durableBuyer);
  await stop(); const valid = saved();
  for (const malformed of [finalId.replace(/~5$/, '~6'), finalId.replace('~mythic~', '~admin~'), endgame ? finalId.replace('~60~', '~61~') : finalId.replace('~2~', '~3~')]) {
    const corrupt = structuredClone(valid), p = corrupt[hash(tokens.buyer)].characters[0]; p.ownedGear = p.ownedGear.map(id => id === finalId ? malformed : id); p.equipment.weapon = malformed;
    const bytes = JSON.stringify(corrupt); writeFileSync(file, bytes); assert.throws(() => createGameServer({ dataDir: dir, keycloak: null, databaseUrl: '' }), /Invalid player save/);
    assert.equal(readFileSync(file, 'utf8'), bytes, 'malformed identities never cause save data to be discarded');
  }
  console.log(`PASS${endgame ? ' (level 60 V3 gear)' : ''}: real WS rolled gear loading, strict ownership/cost checks, disk-failure rollback, +1 to +5 atomic material/gold upgrades, concurrent/replay guards, combat stats, bank/auction transfer, buyer equip, restart and corrupt-save rejection.`);
} finally { rmSync(file + '.tmp', { recursive: true, force: true }); await stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
