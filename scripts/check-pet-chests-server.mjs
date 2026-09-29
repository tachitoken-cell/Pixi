import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear } from '../src/progression.ts';
import { bagUsage, newBags } from '../src/bags.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { DUNGEONS, dungeonStages, dungeonLayout, dungeonColliders, dungeonBounds } from '../src/dungeon.ts';
import { canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { surfaceAt } from '../src/landscape.ts';
import { PET_LOOT_RADIUS } from '../src/pets.ts';
import { TREASURE_MAP_SITES, treasureMapReward } from '../src/treasure-maps.ts';

// Keep real joins, dungeon entry, combat, shared chest activation, personal loot
// and persistence. Only the encounter positions/stats are compressed for speed.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-pet-chests-')), file = join(dir, 'players.json');
const realNow = Date.now, realRandom = Math.random, clients = [];
const monsterOriginals = structuredClone(MONSTERS);
const definition = DUNGEONS.find(d => d.id === 'plagueworks');
const layout = dungeonLayout(definition.id), stages = dungeonStages(definition.id), objects = layout.objects;
const room = layout.rooms.find(room => room.id === 'threshold'), entry = layout.portals.find(portal => portal.roomId === 'preparation' && portal.targetRoomId === room.id);
const pointInRoom = (x, z) => ({ x: room.x + x, z: room.z + z });
const oldStages = [...stages], oldObjects = [...objects];
const site = TREASURE_MAP_SITES.find(s => s.zone === 'greenwood');
let clock = realNow(), game, port, rolls = 0;
Date.now = () => clock;
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hash = token => createHash('sha256').update(token).digest('hex');
const saved = account => JSON.parse(readFileSync(file, 'utf8'))[account.key].characters[0];
const assets = p => structuredClone({ gold: p.gold, inventory: p.inventory, carriedItems: p.carriedItems, ownedGear: p.ownedGear });
function account(name, point, extra = {}) {
  const token = randomBytes(32).toString('base64url');
  return { token, key: hash(token), player: { id: randomUUID(), name, ...point, zone: surfaceAt(point.x, point.z).zone,
    coordinateVersion: 2, rotation: 0, characterCreated: true,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    ...starterGear('Ranger'), ...newBags(), talents: [], learnedSpells: ['arrow'],
    level: 60, hp: 808, maxHp: 808, xp: 0, gold: 0, inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 },
    carriedItems: {}, quest: { stage: 0, kills: 0, crystals: 0 }, ownedPets: ['fern-lynx'], summonedPet: 'fern-lynx', ...extra } };
}
async function until(fn, label) {
  const end = realNow() + 6000;
  while (realNow() < end) { const result = fn(); if (result) return result; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 200) { clock += ms; await delay(130); }
async function travelUntil(fn, label, steps = 50) {
  for (let i = 0; i < steps; i++) { if (fn()) return; await tick(); }
  assert(fn(), label);
}
async function idle(ms = 4000) { for (let elapsed = 0; elapsed < ms; elapsed += 200) await tick(); }
async function start(accounts) {
  if (accounts) writeFileSync(file, JSON.stringify(Object.fromEntries(accounts.map(a => [a.key, { characters: [a.player] }]))));
  clock += 1000;
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '',
    treasureRandomInt: () => 99, treasureMapRandomInt: () => { rolls++; return 99; } });
  port = await game.start();
}
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = undefined; }
async function connect(account) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, account, messages: [] };
  clients.push(c); c.send = m => socket.send(JSON.stringify(m));
  c.player = () => c.snapshot?.players.find(p => p.id === account.player.id);
  socket.on('message', raw => { const m = JSON.parse(raw); if (m.type === 'snapshot') c.snapshot = m; else c.messages.push(m); });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: account.token, characterId: account.player.id }); await until(() => c.player(), `${account.player.name} joins`); return c;
}
async function party(leader, friend) {
  leader.send({ type: 'partyInvite', targetId: friend.account.player.id });
  const invite = await until(() => friend.snapshot.partyInvites[0], 'party invitation');
  friend.send({ type: 'partyAccept', invitationId: invite.id });
  await until(() => leader.snapshot.party?.members.length === 2, 'party formed');
}
async function move(c, point) {
  assert(canTraverse(c.player(), point), 'clear overworld movement fixture');
  while (gap(c.player(), point) > .01) {
    const p = c.player(), distance = gap(p, point), step = Math.min(2, distance);
    const next = { x: p.x + (point.x - p.x) / distance * step, z: p.z + (point.z - p.z) / distance * step };
    clock += 450; c.send({ type: 'move', ...next, rotation: 0 }); await until(() => gap(c.player(), next) < .01, 'accepted movement');
  }
}
async function walkDungeon(c, goal) {
  const state = c.snapshot.dungeon, colliders = dungeonColliders(state.clearedStages, state.objects.filter(o => o.activated).map(o => o.id), state.kind);
  const bounds = dungeonBounds(state.kind), path = findPath(c.player(), goal, colliders, bounds);
  assert(path.length, 'reachable dungeon fixture');
  for (const point of path) while (gap(c.player(), point) > .001) {
    const p = c.player(), distance = gap(p, point), step = Math.min(2, distance);
    const next = { x: p.x + (point.x - p.x) / distance * step, z: p.z + (point.z - p.z) / distance * step };
    assert(canTraverse(p, next, colliders, bounds)); clock += 450;
    c.send({ type: 'move', ...next, rotation: 0 }); await until(() => gap(c.player(), next) < .001, 'accepted dungeon movement');
  }
}
function expedition(stage = 'chest', voucher = true) { return { id: randomUUID(), siteId: site.id, stage, level: 60, voucher }; }
try {
  for (const stats of Object.values(MONSTERS)) Object.assign(stats, { hp: 1, damage: 0, speed: 0, aggroRange: 0 });
  stages.splice(0, stages.length,
    { id: 'threshold', name: 'Pet chest guardian', level: 30, ...pointInRoom(0, -5), requires: [], enemies: [{ kind: 'bone-rat', ...pointInRoom(0, -5) }] },
    { id: 'confluence', name: 'Uncleared encounter', level: 30, ...pointInRoom(0, 1), requires: ['threshold'], enemies: [{ kind: 'bone-rat', ...pointInRoom(0, 1) }] });
  objects.splice(0, objects.length,
    { id: 'pet-cache', kind: 'chest', label: 'Pet test cache', stageId: 'threshold', ...pointInRoom(5, -2), r: 1 },
    { id: 'locked-cache', kind: 'chest', label: 'Locked cache', stageId: 'confluence', ...pointInRoom(-5, -2), r: 1 },
    { id: 'verdant-seal', kind: 'seal', label: 'Test rune', stageId: 'threshold', ...pointInRoom(0, 2), r: 1 });
  Math.random = () => .99;
  const entrance = { x: definition.entrance.x, z: definition.entrance.z + 1 };
  const a = account('Chest pet owner', entrance), b = account('Cache friend', entrance, { summonedPet: null });
  await start([a, b]); const owner = await connect(a), friend = await connect(b); await party(owner, friend);
  owner.send({ type: 'dungeonEnter', dungeonId: definition.id });
  await until(() => owner.snapshot.dungeon?.kind === definition.id && friend.snapshot.dungeon?.kind === definition.id, 'party enters dungeon');
  for (const c of [owner, friend]) {
    await walkDungeon(c, entry); c.send({ type: 'dungeonInteract', targetId: entry.id });
    await until(() => gap(c.player(), entry.destination) < .01, 'enter the sealed encounter room through its portal');
  }
  await walkDungeon(owner, pointInRoom(0, 0)); await walkDungeon(friend, pointInRoom(1, 0));
  const position = { x: owner.player().x, z: owner.player().z }, chest = objects[0];
  assert(gap(position, chest) > 3 && gap(position, chest) < PET_LOOT_RADIUS);
  assert(canTraverse(position, chest, dungeonColliders([], [], definition.id), dungeonBounds(definition.id)));
  await idle(2000);
  assert(owner.snapshot.dungeon.objects.every(o => !o.activated), 'pet does not bypass living guardians or activate runes');
  assert.equal(owner.snapshot.loot.filter(d => d.sourceObjectId).length, 0);
  const guardian = owner.snapshot.enemies.find(e => e.alive && e.id.includes('-threshold-0-'));
  owner.send({ type: 'attack', targetId: guardian.id, ability: 'arrow' });
  await travelUntil(() => owner.snapshot.dungeon.clearedStages.includes('threshold'), 'real guardian death clears stage');
  assert(!owner.snapshot.dungeon.objects.find(o => o.id === chest.id).activated, 'chest remains closed before pet arrives');
  const petStart = gap(owner.player().petPosition, chest);
  await tick();
  assert(!owner.snapshot.dungeon.objects.find(o => o.id === chest.id).activated, 'travel precedes chest reward');
  await travelUntil(() => gap(owner.player().petPosition, chest) < petStart - .5, 'pet visibly approaches chest');
  await travelUntil(() => owner.player().inventory.relic === 4, 'pet opens and collects personal dungeon cache');
  assert.deepEqual({ x: owner.player().x, z: owner.player().z }, position, 'player remains beyond manual interaction range');
  assert(owner.snapshot.dungeon.objects.find(o => o.id === chest.id).activated);
  const foreignDrop = friend.snapshot.loot.find(d => d.ownerId === b.player.id && d.sourceObjectId === chest.id);
  assert(foreignDrop, 'shared activation creates a separate personal cache for the party member');
  const foreignBefore = structuredClone(foreignDrop), friendBefore = assets(friend.player());
  await idle();
  assert.deepEqual(friend.snapshot.loot.find(d => d.id === foreignDrop.id), foreignBefore, 'owner pet never collects another member’s cache');
  assert.deepEqual(assets(friend.player()), friendBefore);
  assert(!owner.snapshot.dungeon.objects.find(o => o.id === 'locked-cache').activated, 'other encounter remains locked');
  assert(!owner.snapshot.dungeon.objects.find(o => o.id === 'verdant-seal').activated, 'pet never activates a progression rune');
  assert.equal(owner.player().inventory.relic, 4, 'automatic activation cannot replay');
  assert.equal(saved(a).inventory.relic, 4, 'automatic dungeon pickup is durable');
  assert.equal(owner.messages.filter(m => m.type === 'event' && m.text === 'Pet test cache opened. Collect your personal treasure.').length, 1);
  await stop();

  const point = { x: site.x, z: site.z + 8 };
  const fullItems = Object.fromEntries(Object.keys(LOOT_ITEMS).filter(id => !['treasure-map', 'moss-voucher', 'ancient-coin'].includes(id)).slice(0, 16).map(id => [id, 1]));
  const accounts = {
    owner: account('Treasure pet owner', point, { summonedPet: null, treasureMap: expedition() }),
    foreign: account('Foreign treasure pet', point),
    search: account('Unsearched map', point, { treasureMap: expedition('search'), carriedItems: { 'treasure-map': 1 } }),
    guardian: account('Living map guardian', point, { treasureMap: expedition('guardian') }),
    far: account('Distant map chest', { x: site.x, z: site.z + PET_LOOT_RADIUS + .25 }, { treasureMap: expedition() }),
    full: account('Full map bags', point, { treasureMap: expedition(), carriedItems: fullItems }),
  };
  assert.equal(bagUsage(accounts.full.player), 16);
  assert(Object.values(accounts).every(a => canTraverse(a.player, site)));
  await start(Object.values(accounts)); const c = {};
  for (const [name, account] of Object.entries(accounts)) c[name] = await connect(account);
  await idle();
  assert.equal(c.owner.player().treasureMap.stage, 'chest', 'dismissed pet and a nearby foreign pet cannot collect owner chest');
  assert.equal(c.search.player().treasureMap.stage, 'search', 'pet does not search maps or consume unused maps');
  assert.equal(c.search.player().carriedItems['treasure-map'], 1);
  assert.equal(c.guardian.player().treasureMap.stage, 'guardian', 'pet does not bypass map guardian');
  assert(c.guardian.snapshot.enemies.some(e => e.id === `map-${accounts.guardian.player.treasureMap.id}` && e.alive));
  assert.equal(c.far.player().treasureMap.stage, 'chest', 'chest outside owner radius remains unopened');
  assert.equal(c.full.player().treasureMap.stage, 'chest'); assert.equal(c.full.player().gold, 0, 'full bags keep all chest rewards intact');
  assert.equal(saved(accounts.full).treasureMap.voucher, true, 'fixed voucher remains saved while bags are full');
  assert.equal(rolls, 0, 'waiting never rerolls treasure rewards');
  c.owner.send({ type: 'summonPet', pet: 'fern-lynx' });
  await until(() => c.owner.player().summonedPet === 'fern-lynx', 'treasure pet summoned');
  const before = assets(c.owner.player());
  await delay(250); mkdirSync(`${file}.tmp`);
  await tick();
  assert.equal(c.owner.player().treasureMap.stage, 'chest', 'map chest stays closed before pet arrival');
  await travelUntil(() => gap(c.owner.player().petPosition, site) < 2, 'pet travels to unlocked map chest');
  await idle(2400);
  assert.deepEqual(assets(c.owner.player()), before, 'failed chest save grants no partial reward');
  assert.deepEqual(assets(saved(accounts.owner)), before);
  assert.equal(saved(accounts.owner).treasureMap.voucher, true, 'failed save retains original hidden reward');
  rmSync(`${file}.tmp`, { recursive: true });
  await travelUntil(() => c.owner.player().treasureMap === null, 'pet retries failed save and collects chest');
  const reward = treasureMapReward(60);
  assert.equal(c.owner.player().gold, before.gold + reward.gold);
  assert.equal(c.owner.player().inventory.potion, before.inventory.potion + reward.potions);
  assert.equal(c.owner.player().carriedItems['ancient-coin'], reward.coins);
  assert.equal(c.owner.player().carriedItems['moss-voucher'], 1);
  assert.deepEqual({ x: c.owner.player().x, z: c.owner.player().z }, point, 'map collection does not move player into manual range');
  assert.equal(c.foreign.player().gold, 0, 'foreign pet cannot claim expedition reward');
  const collected = assets(c.owner.player()); await idle(); assert.deepEqual(assets(c.owner.player()), collected, 'automatic chest cannot replay');
  await move(c.far, point); await travelUntil(() => c.far.player().treasureMap === null, 'entering pet radius makes own unlocked chest collectible');
  assert.equal(c.far.player().carriedItems['moss-voucher'], 1);
  assert.equal(rolls, 0);
  await stop(); await start(); const restored = await connect(accounts.owner);
  assert.equal(restored.player().treasureMap, null); assert.deepEqual(assets(restored.player()), collected, 'collected map rewards survive restart');
  assert(!Object.hasOwn(saved(accounts.owner), 'petPosition'), 'pet travel stays transient instead of modifying save schema');
  console.log('PASS: pets visibly travel before dungeon/map chest collection; living encounter and map guardian gates; no rune/search activation; personal party and expedition ownership; owner radius; full bags and fixed vouchers; failed-save rollback/retry; once-only durable rewards.');
} finally {
  rmSync(`${file}.tmp`, { recursive: true, force: true }); await stop(); Date.now = realNow; Math.random = realRandom;
  stages.splice(0, stages.length, ...oldStages); objects.splice(0, objects.length, ...oldObjects);
  for (const [kind, stats] of Object.entries(monsterOriginals)) Object.assign(MONSTERS[kind], stats);
  rmSync(dir, { recursive: true, force: true });
}
