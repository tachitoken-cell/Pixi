import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { DUNGEONS, dungeonStages, dungeonLayout, dungeonBounds, dungeonColliders } from '../src/dungeon.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { BANKER, AUCTIONEER } from '../src/city.ts';
import { canTraverse, regionAt } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';

// Reuse the real dungeon/pickup paths with two short encounters in the arrival hall.
const mount = 'verdant-revenant', definition = DUNGEONS.find(d => d.id === 'veilhaven');
const stages = dungeonStages(definition.id), layout = dungeonLayout(definition.id);
const originalStages = [...stages], originalObjects = [...layout.objects], originalMonsters = structuredClone(MONSTERS);
const dir = mkdtempSync(join(tmpdir(), 'mossvale-mount-items-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now; let offset = 0, game, port, rolls = 0;
Date.now = () => realNow() + offset;
const hash = token => createHash('sha256').update(token).digest('hex');
const heroes = Object.fromEntries(['owner', 'learner'].map(name => [name, { id: randomUUID(), name, characterCreated: true,
  x: definition.entrance.x, z: definition.entrance.z + 1, zone: definition.entrance.zone, coordinateVersion: 2, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  ...starterGear('Ranger'), ...newBags(), talents: [], level: 60, xp: 0, gold: 1000, hp: 808, maxHp: 808,
  learnedSpells: ['arrow'], ownedMounts: name === 'owner' ? [mount] : [], carriedItems: {}, ridingRank: 0,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } }]));
const tokens = Object.fromEntries(Object.keys(heroes).map(name => [name, randomBytes(32).toString('base64url')]));
const readSave = () => JSON.parse(readFileSync(file, 'utf8'));
const stored = name => readSave()[hash(tokens[name])].characters[0];
const count = c => c.player().carriedItems[mount] ?? 0;
async function until(fn, label) { const end = realNow() + 7000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(12); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 1100) { offset += ms; await delay(120); }
async function start() {
  const disabledChain = { status: async () => ({ enabled: false, reason: 'Wallet payments disabled in local mount check.' }) };
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', auctionChain: disabledChain, mossAuctionChain: disabledChain,
    mountRandomInt: max => { assert.equal(max, 10_000); rolls++; return 0; } }); port = await game.start();
}
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
async function connect(name) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, name, id: heroes[name].id, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.id);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (['snapshot', 'bank', 'auction'].includes(message.type)) c[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[name], characterId: c.id }); await until(() => c.player(), `join ${name}`); return c;
}
async function walk(c, goal) {
  const state = c.snapshot.dungeon, colliders = dungeonColliders(state.clearedStages, [], state.kind), bounds = dungeonBounds(state.kind);
  const path = findPath(c.player(), goal, colliders, bounds); assert(path.length);
  for (const point of path) while (Math.hypot(c.player().x - point.x, c.player().z - point.z) > 1e-6) {
    const p = c.player(), gap = Math.hypot(point.x - p.x, point.z - p.z), step = Math.min(2.5, gap), next = { x: p.x + (point.x - p.x) * step / gap, z: p.z + (point.z - p.z) * step / gap };
    assert(canTraverse(p, next, colliders, bounds)); offset += 450; c.send({ type: 'move', ...next, rotation: 0 }); await until(() => Math.hypot(c.player().x - next.x, c.player().z - next.z) < 1e-6, 'walk');
  }
}
async function kill(c, stage) {
  const enemy = await until(() => c.snapshot.enemies.find(e => e.alive && e.id.includes(`-${stage}-0-`)), `${stage} spawn`);
  await tick(); c.send({ type: 'autoAttack', targetId: enemy.id });
  for (let i = 0; i < 8 && c.snapshot.enemies.find(e => e.id === enemy.id)?.alive; i++) await tick(1500);
  await until(() => c.snapshot.dungeon.clearedStages.includes(stage), `${stage} clear`); c.send({ type: 'autoAttack', targetId: null }); await tick(2200); return enemy;
}
async function reject(c, message, label) {
  await tick(); const index = c.messages.length, before = JSON.stringify({ items: c.player().carriedItems, mounts: c.player().ownedMounts }); c.send(message);
  await until(() => c.messages.slice(index).some(m => m.type === 'event' && m.kind === 'info'), label);
  assert.equal(JSON.stringify({ items: c.player().carriedItems, mounts: c.player().ownedMounts }), before, label);
}
function reposition(npc) {
  const point = Array.from({ length: 32 }, (_, i) => ({ x: npc.x + Math.cos(i * Math.PI / 16) * 1.2, z: npc.z + Math.sin(i * Math.PI / 16) * 1.2 })).find(p => canTraverse(p, npc)); assert(point);
  const records = readSave(); for (const name of Object.keys(heroes)) Object.assign(records[hash(tokens[name])].characters[0], point, { zone: regionAt(point.x, point.z) }); writeFileSync(file, JSON.stringify(records));
}
try {
  stages.splice(0, stages.length, ...[['threshold', 'lantern-wraith', []], ['throne', 'veiled-abbess', ['threshold']]].map(([id, kind, requires]) => ({ id, name: id, level: definition.maxLevel, x: 0, z: -19, requires, enemies: [{ kind, x: 0, z: -19, ...(id === 'throne' ? { boss: true } : {}) }] })));
  layout.objects.splice(0);
  for (const stats of Object.values(MONSTERS)) Object.assign(stats, { hp: 1, speed: 0, aggroRange: 0, damage: 0 });
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([name, hero]) => [hash(tokens[name]), { characters: [hero] }]))));
  await start(); let owner = await connect('owner'), learner = await connect('learner');
  owner.send({ type: 'partyInvite', targetId: learner.id }); const invite = await until(() => learner.snapshot.partyInvites[0], 'party invitation'); learner.send({ type: 'partyAccept', invitationId: invite.id }); await until(() => learner.snapshot.party, 'party accepted');
  await tick(); owner.send({ type: 'dungeonEnter', dungeonId: definition.id }); await until(() => owner.snapshot.dungeon && learner.snapshot.dungeon, 'party enters');
  await walk(owner, { x: 0, z: -17 }); await walk(learner, { x: 1, z: -17 });
  await kill(owner, 'threshold'); assert.equal(rolls, 0, 'ordinary enemies do not roll a mount');
  const boss = await kill(owner, 'throne'); await until(() => owner.snapshot.dungeon.completed, 'final encounter completes');
  assert.equal(rolls, 2, 'both credited players roll, including the learned owner');
  const drops = [owner, learner].map(c => c.snapshot.loot.find(d => d.ownerId === c.id && d.enemyId === boss.id));
  for (const [index, c] of [owner, learner].entries()) {
    assert.deepEqual(drops[index].items.filter(row => row.itemId === mount), [{ id: `item:${mount}`, kind: 'item', itemId: mount, quantity: 1, quality: 'epic' }]);
    assert.equal(count(c), 0, 'kill alone does not bypass pickup');
  }
  assert.deepEqual(learner.player().ownedMounts, [], 'a mount drop does not automatically unlock riding');
  await reject(learner, { type: 'loot', targetId: drops[0].id, itemId: `item:${mount}` }, 'party cannot steal personal mount');
  for (const [index, c] of [owner, learner].entries()) {
    await tick(); c.send({ type: 'loot', targetId: drops[index].id, itemId: `item:${mount}` });
    await until(() => count(c) === 1 && stored(c.name).carriedItems[mount] === 1, 'mount pickup saved');
    await reject(c, { type: 'loot', targetId: drops[index].id, itemId: `item:${mount}` }, 'mount pickup cannot replay');
  }
  await reject(owner, { type: 'learnMount', mount }, 'learned owner retains extra tradable copy');
  await tick(15000); mkdirSync(`${file}.tmp`);
  await reject(learner, { type: 'learnMount', mount }, 'failed learn save retains mount item');
  assert.equal(stored('learner').carriedItems[mount], 1); assert.deepEqual(stored('learner').ownedMounts, []);
  rmSync(`${file}.tmp`, { recursive: true }); await tick(); learner.send({ type: 'learnMount', mount });
  await until(() => learner.player().ownedMounts.includes(mount) && !count(learner), 'learn consumes one saved mount item');
  for (const invalid of ['horse', 'wolf']) await reject(owner, { type: 'learnMount', mount: invalid }, 'vendor mount is not a learnable item');
  await stop(); assert.equal(stored('owner').carriedItems[mount], 1); assert(stored('learner').ownedMounts.includes(mount));
  reposition(BANKER); await start(); owner = await connect('owner');
  assert.equal(count(owner), 1, 'dropped item survives restart'); assert(owner.player().ownedMounts.includes(mount), 'learned ownership coexists with item copy');
  owner.send({ type: 'bankDeposit', npcId: BANKER.id, item: { kind: 'item', id: mount, quantity: 1 } });
  await until(() => !count(owner) && stored('owner').bank.items[mount] === 1, 'mount item banks');
  await tick(); owner.send({ type: 'bankWithdraw', npcId: BANKER.id, item: { kind: 'item', id: mount, quantity: 1 } });
  await until(() => count(owner) === 1 && !stored('owner').bank.items[mount], 'mount item withdraws');
  await stop(); reposition(AUCTIONEER); await start(); owner = await connect('owner'); learner = await connect('learner');
  const beforeGold = [owner.player().gold, learner.player().gold];
  owner.send({ type: 'auctionList', npcId: AUCTIONEER.id, item: { kind: 'item', id: mount, quantity: 1 }, currency: 'gold', price: '25' });
  const listing = await until(() => !count(owner) && stored('owner').auctions.find(row => row.item.id === mount), 'mount listing escrowed and replicated');
  assert.equal(stored('owner').carriedItems[mount] ?? 0, 0); await tick(); learner.send({ type: 'auctionBuy', npcId: AUCTIONEER.id, listingId: listing.id });
  await until(() => count(learner) === 1 && stored('owner').auctions.length === 0, 'another learned owner buys extra mount item');
  assert.deepEqual([stored('owner').gold, stored('learner').gold], [beforeGold[0] + 25, beforeGold[1] - 25]);
  assert(owner.player().ownedMounts.includes(mount) && learner.player().ownedMounts.includes(mount), 'trading copies preserves learned mounts');
  await stop(); await start(); learner = await connect('learner'); assert.equal(count(learner), 1); assert(learner.player().ownedMounts.includes(mount));
  console.log('PASS mount drops: real final-boss personal items, learned-owner duplicate, replay/ownership/vendor guards, pickup and learn persistence, failed-save recovery, bank transfer, auction sale, and restart.');
} finally {
  rmSync(`${file}.tmp`, { recursive: true, force: true }); await stop(); Date.now = realNow;
  stages.splice(0, stages.length, ...originalStages); layout.objects.splice(0, layout.objects.length, ...originalObjects);
  for (const [kind, stats] of Object.entries(originalMonsters)) Object.assign(MONSTERS[kind], stats);
  rmSync(dir, { recursive: true, force: true });
}
