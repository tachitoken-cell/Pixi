import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { canTraverse } from '../src/realm.ts';
import { GEAR, EQUIPMENT_SLOTS, starterGear, gearFitsSlot, equipmentSlotFor, combatStats } from '../src/progression.ts';

const classes = ['Ranger', 'Knight', 'Mage'], optionalSlots = EQUIPMENT_SLOTS.filter(slot => slot !== 'weapon' && slot !== 'armor');
assert.equal(EQUIPMENT_SLOTS.length, 9); assert.equal(new Set(EQUIPMENT_SLOTS).size, 9);
for (const className of classes) {
  for (const slot of ['head', 'legs', 'shoes', 'back']) {
    const item = GEAR[`${className.toLowerCase()}-${slot}`];
    assert.equal(item.className, className); assert.equal(item.requiredLevel, 1); assert(item.price > 0); assert.equal(item.model, item.id);
  }
  for (const item of Object.values(GEAR).filter(item => !item.setId && !item.dropOnly && item.slot === 'armor' && item.className === className)) assert.equal(item.model, `${className.toLowerCase()}-body`);
  for (const slot of optionalSlots) assert.equal(starterGear(className).equipment[slot], null);
}
for (const item of Object.values(GEAR)) for (const slot of EQUIPMENT_SLOTS)
  assert.equal(gearFitsSlot(item.id, slot), item.slot === 'ring' ? slot === 'ring1' || slot === 'ring2' : item.slot === slot);
assert.equal(gearFitsSlot('__proto__', 'head'), false); assert.equal(gearFitsSlot('copper-ring', 'ring'), false);
assert.equal(equipmentSlotFor(starterGear('Ranger').equipment, 'unknown'), undefined);
assert.equal(equipmentSlotFor(starterGear('Ranger').equipment, 'copper-ring'), 'ring1');
assert.equal(equipmentSlotFor({ ...starterGear('Ranger').equipment, ring1: 'copper-ring' }, 'star-ring'), 'ring2');
assert.equal(equipmentSlotFor({ ...starterGear('Ranger').equipment, ring1: 'copper-ring', ring2: 'star-ring' }, 'star-ring'), 'ring2');
assert.equal(equipmentSlotFor({ ...starterGear('Ranger').equipment, ring1: 'occupied', ring2: 'also-occupied' }, 'copper-ring'), 'ring1');

const merchant = VILLAGE_NPCS.find(npc => npc.id === 'village-pinewake-merchant');
const shopPoint = { x: merchant.x, z: merchant.z + 1 };
assert(canTraverse(shopPoint, merchant), 'purchase fixtures stand at a reachable real merchant');
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-equipment-')), file = join(dataDir, 'players.json'), clients = [];
const tokens = classes.map(() => randomBytes(32).toString('base64url')), key = token => createHash('sha256').update(token).digest('hex');
const records = Object.fromEntries(classes.map((className, index) => {
  const start = starterGear(className);
  return [key(tokens[index]), { characters: [{ id: randomUUID(), name: `Wearables ${className}`, characterCreated: true, coordinateVersion: 2,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    zone: merchant.zone, ...shopPoint, rotation: 0, level: 1, hp: 100, maxHp: 100, xp: 7, gold: 1000, talents: [],
    inventory: { wood: 7, crystal: 3, herb: 2, potion: 3 }, ownedGear: [...start.ownedGear, 'lantern-charm'],
    equipment: { weapon: start.equipment.weapon, armor: start.equipment.armor, charm: 'lantern-charm' },
    quest: { stage: 0, kills: 0, crystals: 0 } }] }];
}));
let game, port;
async function until(predicate, label) { const end = Date.now() + 5000; while (Date.now() < end) { const value = predicate(); if (value) return value; await delay(15); } throw Error(`Timed out: ${label}`); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message)); client.player = () => client.snapshot?.players.find(p => p.id === client.welcome?.id);
  socket.on('message', raw => { const message = JSON.parse(raw); if (['roster', 'welcome', 'snapshot'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'roster');
  client.send({ type: 'selectCharacter', characterId: client.roster.characters[0].id }); await until(() => client.player(), 'selected character'); return client;
}
async function equip(client, itemId, slot) {
  const chosen = slot || equipmentSlotFor(client.player().equipment, itemId); client.send({ type: 'equipGear', itemId, ...(slot ? { slot } : {}) });
  await until(() => client.player().equipment[chosen] === itemId, `equipped ${itemId} in ${chosen}`);
}
const economy = p => ({ gold: p.gold, ownedGear: p.ownedGear, equipment: p.equipment, inventory: p.inventory, talents: p.talents });
try {
  writeFileSync(file, JSON.stringify(records)); await start();
  const heroes = await Promise.all(tokens.map(connect));
  for (const [index, client] of heroes.entries()) {
    const legacy = records[key(tokens[index])].characters[0], p = client.player();
    assert.deepEqual(p.ownedGear, legacy.ownedGear); assert.equal(p.gold, legacy.gold); assert.equal(p.xp, legacy.xp);
    assert.deepEqual(p.equipment, { ...starterGear(classes[index]).equipment, ...legacy.equipment }, 'old three-slot equipment is extended without resetting worn items');
    const base = combatStats(p), prefix = classes[index].toLowerCase(); let cost = 0;
    for (const slot of ['head', 'legs', 'shoes', 'back']) {
      const id = `${prefix}-${slot}`; cost += GEAR[id].price;
      client.send({ type: 'buyGear', npcId: merchant.id, itemId: id }); client.send({ type: 'buyGear', npcId: merchant.id, itemId: id });
      await until(() => client.player().ownedGear.includes(id), 'wearable purchase'); await equip(client, id);
    }
    assert.equal(client.player().gold, 1000 - cost, 'duplicate purchases never charge twice');
    assert.deepEqual(combatStats(client.player()), { ...base, primaryDamage: base.primaryDamage + 5, specialDamage: base.specialDamage + 6, skillDamage: base.skillDamage + 2, defense: base.defense + 2 }, 'four class attributes add one power each alongside the original item bonuses');
  }
  const ranger = heroes[0], before = structuredClone(economy(ranger.player()));
  for (const message of [{ type: 'equipGear', itemId: 'copper-ring' }, { type: 'buyGear', npcId: merchant.id, itemId: 'knight-head' }, { type: 'equipGear', itemId: 'ranger-head', slot: 'ring1' }, { type: 'equipGear', itemId: 'ranger-head', slot: '__proto__' }, { type: 'unequipGear', slot: 'weapon' }, { type: 'unequipGear', slot: 'armor' }, { type: 'unequipGear', slot: 'ring' }, { type: 'unequipGear', slot: {} }]) ranger.send(message);
  await delay(160); assert.deepEqual(economy(ranger.player()), before, 'ownership, class, slot and required-equipment rules remain authoritative');
  for (const id of ['copper-ring', 'star-ring']) { ranger.send({ type: 'buyGear', npcId: merchant.id, itemId: id }); await until(() => ranger.player().ownedGear.includes(id), 'ring purchase'); await equip(ranger, id); }
  assert.deepEqual([ranger.player().equipment.ring1, ranger.player().equipment.ring2], ['copper-ring', 'star-ring']);
  const wearing = structuredClone(economy(ranger.player()));
  ranger.send({ type: 'equipGear', itemId: 'copper-ring', slot: 'ring2' }); await delay(160);
  assert.deepEqual(economy(ranger.player()), wearing, 'one owned ring cannot be worn on both hands');
  ranger.send({ type: 'unequipGear', slot: 'ring1' }); await until(() => ranger.player().equipment.ring1 === null, 'ring returns to backpack');
  await equip(ranger, 'copper-ring', 'ring2'); assert.equal(ranger.player().equipment.ring1, null); assert(ranger.player().ownedGear.includes('star-ring'));
  await equip(ranger, 'star-ring'); assert.equal(ranger.player().equipment.ring1, 'star-ring');
  const ringStats = combatStats(ranger.player());
  assert.equal(ringStats.primaryDamage, combatStats({ ...ranger.player(), equipment: { ...ranger.player().equipment, ring1: null, ring2: null } }).primaryDamage + 1);
  assert.equal(ringStats.specialDamage, combatStats({ ...ranger.player(), equipment: { ...ranger.player().equipment, ring1: null, ring2: null } }).specialDamage + 2);
  for (const slot of ['head', 'charm']) { ranger.send({ type: 'unequipGear', slot }); await until(() => ranger.player().equipment[slot] === null, `removed ${slot}`); }
  assert(ranger.player().ownedGear.includes('ranger-head') && ranger.player().ownedGear.includes('lantern-charm'));
  const final = structuredClone(economy(ranger.player())), id = ranger.welcome.id;
  ranger.send({ type: 'leaveWorld' }); await until(() => ranger.roster.characters[0].equipment.head === null, 'updated roster');
  ranger.send({ type: 'unequipGear', slot: 'back' }); await delay(150);
  ranger.send({ type: 'selectCharacter', characterId: id }); await delay(150); assert.deepEqual(economy(ranger.player()), final, 'inactive characters cannot alter gear');
  assert.deepEqual(economy((await connect(tokens[0])).player()), final, 'reconnect preserves nine-slot equipment');
  await game.stop(); game = null; const saved = readFileSync(file, 'utf8');
  await start(); assert.deepEqual(economy((await connect(tokens[0])).player()), final, 'restart preserves wearable ownership and exact ring slots');
  const invalidDir = join(dataDir, 'invalid'); mkdirSync(invalidDir);
  for (const corrupt of [p => p.equipment.head = 0, p => p.equipment.legs = 'ranger-head', p => p.equipment.back = 'unknown', p => p.equipment.ring2 = p.equipment.ring1, p => p.equipment.ring1 = 'ranger-head', p => p.equipment.extra = null, p => p.equipment.weapon = null, p => delete p.equipment.armor, p => { p.ownedGear.push('knight-head'); p.equipment.head = 'knight-head'; }]) {
    const record = JSON.parse(saved); corrupt(record[key(tokens[0])].characters[0]);
    const text = JSON.stringify(record), path = join(invalidDir, 'players.json'); writeFileSync(path, text);
    assert.throws(() => createGameServer({ port: 0, dataDir: invalidDir, keycloak: null, databaseUrl: '' }), /Invalid player save/);
    assert.equal(readFileSync(path, 'utf8'), text, 'existing corrupt equipment is never overwritten by migration');
  }
  console.log('PASS: nine equipment slots and 14 new wearable pieces; old three-slot migration; real class purchases and stats; ownership/slot/ring uniqueness; nullable unequip; roster authority; reconnect/restart and corruption preservation.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); rmSync(dataDir, { recursive: true, force: true });
}
