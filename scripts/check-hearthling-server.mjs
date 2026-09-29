import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { HEARTHLING_NPC, MEADGOD_QUEST_COST } from '../src/hearthling.ts';
import { regionAt } from '../src/realm.ts';
import { getTitle, titleUnlocked, playerTitle } from '../src/titles.ts';
import { starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';

// Temporary local account; no real player data or realm is contacted.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-hearthling-')), file = join(dir, 'players.json');
const token = randomBytes(32).toString('base64url'), key = createHash('sha256').update(token).digest('hex');
const id = randomUUID(), realNow = Date.now;
let clock = realNow(), game, socket, messages = [], snapshot;
Date.now = () => clock;
const home = { x: HEARTHLING_NPC.x, z: HEARTHLING_NPC.z - 2 };
const hero = { id, name: 'Mead Visitor', ...home, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, ...starterGear('Ranger'), ...newBags(), talents: [], level: 60, hp: 808, maxHp: 808, xp: 0, gold: MEADGOD_QUEST_COST - 1,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, learnedSpells: ['arrow'],
  title: 'beta-tester', ownedPets: ['moss-fox'], summonedPet: 'moss-fox', quest: { stage: 0, kills: 0, crystals: 0 } };
writeFileSync(file, JSON.stringify({ [key]: { betaTester: true, characters: [hero, { ...hero, id: randomUUID(), name: 'Mead Sibling' }] } }));
const read = () => JSON.parse(readFileSync(file, 'utf8'));
const saved = () => read()[key].characters[0];
const player = () => snapshot?.players.find(p => p.id === id);
const send = message => socket.send(JSON.stringify(message));
const assets = p => structuredClone({ meadGodPaid: p.meadGodPaid, title: p.title, gold: p.gold, ownedPets: p.ownedPets, summonedPet: p.summonedPet });
async function until(predicate, label) {
  const deadline = realNow() + 7000;
  while (realNow() < deadline) { const result = predicate(); if (result) return result; await delay(20); }
  throw Error(`Timed out: ${label}; recent events ${JSON.stringify(messages.filter(m => m.type === 'event').slice(-3))}`);
}
async function tick(ms = 1000) { clock += ms; await delay(130); }
async function start() {
  const disabled = { status: async () => ({ enabled: false }) };
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', auctionChain: disabled, mossAuctionChain: disabled });
  const port = await game.start();
  snapshot = undefined; messages = [];
  socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  socket.on('message', raw => { const message = JSON.parse(raw); messages.push(message); if (message.type === 'snapshot') snapshot = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  send({ type: 'join', token, characterId: id }); await until(player, 'join');
}
async function stop() { socket?.terminate(); await game?.stop(); game = undefined; }
async function relocate(point) {
  await stop(); const records = read();
  Object.assign(records[key].characters[0], { x: point.x, z: point.z, zone: regionAt(point.x, point.z) });
  writeFileSync(file, JSON.stringify(records)); await start();
}
async function rejected(message, label) {
  await tick(); const before = assets(player()), index = messages.length;
  send(message); await until(() => messages.slice(index).some(m => m.type === 'event' && m.kind === 'info'), label);
  await delay(150); assert.deepEqual(assets(player()), before, label);
}
const payment = { type: 'meadGodQuest' };
async function select(titleId, denied = false) {
  const index = messages.length;
  send({ type: 'selectTitle', titleId });
  const result = await until(() => messages.slice(index).find(message => message.type === 'titleSelected'), 'title selection acknowledged');
  assert.equal(!!result.error, denied);
  if (!denied) assert.equal(player().title, titleId);
}
try {
  await start(); assert.equal(player().meadGodPaid, false, 'legacy save has no paid entitlement');
  const campaign = structuredClone(player().quest);
  send({ type: 'interact', targetId: HEARTHLING_NPC.id });
  await until(() => messages.some(m => m.type === 'dialogue' && m.npcId === HEARTHLING_NPC.id && m.title === 'MEADGod'), 'renamed NPC dialogue');
  await select('pons-lover', true);
  await rejected(payment, '99,999 gold cannot pay');
  await stop(); let records = read(); records[key].characters[0].gold = MEADGOD_QUEST_COST;
  writeFileSync(file, JSON.stringify(records)); await start();
  await rejected({ ...payment, amount: 1 }, 'client cannot choose the price');
  await rejected({ ...payment, meadGodPaid: true }, 'client cannot forge completion');
  await relocate({ x: home.x, z: home.z - 12 }); await rejected(payment, 'remote payment rejected'); await relocate(home);
  await delay(1200); mkdirSync(`${file}.tmp`);
  await rejected(payment, 'failed persistence keeps gold and title unchanged');
  assert(messages.some(message => message.type === 'event' && message.kind === 'info' && message.requestType === 'meadGodQuest' && message.text.includes('could not be saved')), 'failed save enables UI retry');
  assert.equal(saved().meadGodPaid, false); assert.equal(saved().gold, MEADGOD_QUEST_COST);
  rmSync(`${file}.tmp`, { recursive: true });
  send(payment); send(payment);
  await until(() => player().meadGodPaid, 'payment persisted');
  assert.equal(player().gold, 0, 'exactly 100,000 gold deducted even with overlapping requests');
  assert.equal(saved().gold, 0); assert.equal(saved().meadGodPaid, true);
  assert.equal(read()[key].characters[1].meadGodPaid, false, 'another character must pay for its own title');
  const payments = read()[key].goldLedger.filter(event => event.reason === 'service:meadgod');
  assert.equal(payments.length, 1); assert.deepEqual([payments[0].created, payments[0].burned, payments[0].transferred], [0, 100000, 0], 'one exact gold sink recorded');
  assert.equal(player().title, 'beta-tester', 'payment preserves existing displayed title');
  assert.deepEqual(player().ownedPets, ['moss-fox']); assert.equal(player().summonedPet, 'moss-fox');
  assert.deepEqual(player().quest, campaign, 'main campaign unchanged');
  assert.deepEqual([player().inventory.wood, player().inventory.crystal, player().inventory.herb], [0, 0, 0]);
  assert(titleUnlocked(player(), getTitle('pons-lover')));
  await rejected(payment, 'duplicate payment cannot charge again');
  await select('pons-lover'); assert.equal(playerTitle(player()), 'Pons Lover');
  await relocate(home); assert.equal(player().gold, 0); assert.equal(player().meadGodPaid, true); assert.equal(playerTitle(player()), 'Pons Lover');
  await select(null); assert(titleUnlocked(player(), getTitle('pons-lover')), 'hiding title retains unlock');
  await stop(); const valid = read();
  for (const invalid of [null, 1, 'true', {}]) {
    records = structuredClone(valid); records[key].characters[0].meadGodPaid = invalid; writeFileSync(file, JSON.stringify(records));
    assert.throws(() => createGameServer({ port: 0, dataDir: dir, keycloak: null, databaseUrl: '' }), /Invalid player save/, 'invalid paid entitlement fails closed');
  }
  records = structuredClone(valid); records[key].characters[0].meadGodPaid = false; records[key].characters[0].title = 'pons-lover'; writeFileSync(file, JSON.stringify(records));
  assert.throws(() => createGameServer({ port: 0, dataDir: dir, keycloak: null, databaseUrl: '' }), /Invalid player save/, 'unpaid equipped title fails closed');
  console.log('PASS MEADGod: real NPC dialogue; 99,999 rejected and exactly 100,000 deducted; proximity/forgery/concurrent/replay guards; failed-save rollback and retry; existing title/pets/materials/campaign retained; Pons Lover selection, restart and strict saved entitlement.');
} finally { rmSync(`${file}.tmp`, { recursive: true, force: true }); await stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
