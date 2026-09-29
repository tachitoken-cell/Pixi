import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { MONSTERS } from '../src/bestiary.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { bagUsage, newBags } from '../src/bags.ts';
import { LOOT_TABLES, WORLD_GEAR_ODDS, lootRows } from '../src/loot-items.ts';
import { PET_LOOT_QUALITIES, PET_LOOT_RADIUS } from '../src/pets.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';
import { OVERWORLD_SPAWNS, canTraverse } from '../src/realm.ts';
import { movementCost } from '../src/landscape.ts';
import { WALK_SPEED } from '../src/travel.ts';
import { combatTiming } from '../src/combat-timing.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-pet-loot-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now, realRandom = Math.random, oldMonster = { ...MONSTERS['moss-slime'] };
const oldTable = LOOT_TABLES['moss-slime'], oldOdds = { ...WORLD_GEAR_ODDS };
const home = OVERWORLD_SPAWNS.find(enemy => enemy.id === 'slime-0');
let clock = realNow(), game, port;
Date.now = () => clock;
const hash = token => createHash('sha256').update(token).digest('hex');
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const readSave = () => JSON.parse(readFileSync(file, 'utf8'));
const stored = key => readSave()[hash(tokens[key])].characters[0];
const assets = p => structuredClone({ gold: p.gold, inventory: p.inventory, carriedItems: p.carriedItems, ownedGear: p.ownedGear, petLootMinQuality: p.petLootMinQuality });
function hero(name, offset, extra = {}) {
  return { id: randomUUID(), name, x: home.x + offset, z: home.z, zone: home.zone, coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, ...starterGear('Ranger'), ...newBags(), talents: [], learnedSpells: ['arrow'],
    level: 25, hp: 388, maxHp: 388, xp: 0, gold: 100, inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 },
    quest: { stage: 0, kills: 0, crystals: 0 }, ownedPets: ['moss-fox'], summonedPet: null, carriedItems: {}, ...extra };
}
const heroes = { owner: hero('Pet Loot Owner', 13), stranger: hero('Pet Loot Stranger', 2, { summonedPet: 'moss-fox' }),
  full: hero('Pet Full Bags', 4, { summonedPet: 'moss-fox', carriedItems: { 'slime-residue': 1 } }), gm: hero('Loot Trace GM', 3) };
for (const gear of Object.values(GEAR)) if (bagUsage(heroes.full) < 16 && gear.requiredLevel <= heroes.full.level && (!gear.className || gear.className === 'Ranger') && !heroes.full.ownedGear.includes(gear.id)) heroes.full.ownedGear.push(gear.id);
const tokens = Object.fromEntries(Object.keys(heroes).map(key => [key, randomBytes(32).toString('base64url')]));
async function until(fn, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 800) { clock += Math.ceil(ms); await delay(150); }
async function start() {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', treasureMapRandomInt: () => 99, localGmAccountKeys: [hash(tokens.gm)] });
  port = await game.start();
}
async function stop() { for (const client of clients) client.socket.terminate(); await game?.stop(); game = undefined; }
async function connect(key) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], id: heroes[key].id };
  clients.push(c); c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.id);
  c.drop = id => c.snapshot?.loot.find(drop => drop.id === id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'snapshot') c.snapshot = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[key], characterId: c.id }); await until(() => c.player(), `${key} enters world`); return c;
}
async function quality(c, value) {
  await tick(); c.send({ type: 'petLootQuality', quality: value });
  await until(() => c.player().petLootMinQuality === value, `${value} preference accepted`);
  await until(() => stored('owner').petLootMinQuality === value, `${value} preference durable`);
}
async function reject(c, message, label) {
  await tick(); const before = assets(c.player()), index = c.messages.length; c.send(message);
  await until(() => c.messages.slice(index).some(m => m.type === 'event' && m.kind === 'info'), label);
  await delay(150); assert.deepEqual(assets(c.player()), before, label);
}
async function walk(c, offset) {
  const destination = { x: home.x + offset, z: home.z };
  while (gap(c.player(), destination) > .001) {
    const p = c.player(), distance = gap(p, destination), step = Math.min(2, distance);
    const point = { x: p.x + (destination.x - p.x) / distance * step, z: p.z + (destination.z - p.z) / distance * step };
    assert(canTraverse(p, point)); await tick(movementCost(p, point) / WALK_SPEED * 1000 + 10);
    c.send({ type: 'move', ...point, rotation: 0 }); await until(() => gap(c.player(), point) < .001, 'legal movement');
  }
}
async function kill(c, gearQuality) {
  await tick(16000);
  for (const key of Object.keys(WORLD_GEAR_ODDS)) delete WORLD_GEAR_ODDS[key];
  WORLD_GEAR_ODDS[gearQuality] = 1;
  const before = c.messages.length; Math.random = () => 0;
  try {
    c.send({ type: 'attack', ability: 'arrow', targetId: home.id });
    const hit = await until(() => c.messages.slice(before).find(m => m.type === 'combat' && m.playerId === c.id), 'arrow released');
    const timing = combatTiming(hit.ability, gap(hit.from, hit.targets[0]));
    await tick(hit.startedAt + (timing.delay + timing.flight) * 1000 - clock + 1);
    return await until(() => c.snapshot.loot.find(drop => drop.enemyId === home.id && drop.ownerId === c.id && drop.diedAt >= hit.startedAt), 'personal corpse rolled');
  } finally { Math.random = realRandom; }
}
async function ready(drop) { await tick(Math.max(0, drop.diedAt + DEATH_ANIMATION_MS - clock) + 800); await tick(2500); }
async function traceAction(c, action, target, success = true, extra = {}) {
  const index = c.messages.length;
  c.send({ type: 'gmAction', action, targetId: target.id, ...extra });
  const result = await until(() => c.messages.slice(index).find(m => m.type === 'gmResult'), action);
  assert.equal(result.success, success, result.text);
  const report = c.messages.slice(index).find(m => m.type === 'gmLootTrace')?.report;
  if (!success) assert.equal(report, undefined, 'Rejected callers receive no trace data.');
  return report;
}
function assertSavedCounts(entry, player) {
  assert(entry, 'A persisted pickup must have a trace entry.');
  assert.equal(entry.savedCounts.length, entry.items.length);
  for (const row of entry.items) {
    const count = row.kind === 'gold' ? player.gold : row.kind === 'gear' ? Number(player.ownedGear.includes(row.itemId))
      : row.kind === 'item' ? player.carriedItems[row.itemId] || 0 : player.inventory[row.itemId];
    assert.equal(entry.savedCounts.find(saved => saved.itemId === row.itemId)?.count, count, `Saved count for ${row.itemId}`);
  }
}
try {
  assert.deepEqual(PET_LOOT_QUALITIES, ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']); assert.equal(PET_LOOT_RADIUS, 12);
  assert.equal(bagUsage(heroes.full), 16); assert(Object.values(heroes).every(p => canTraverse(p, home)));
  Object.assign(MONSTERS['moss-slime'], { hp: 1, speed: 0, aggroRange: 0 });
  // Only chance draws and the fixture monster's loot table change; drops and pickups use real server paths.
  LOOT_TABLES['moss-slime'] = ['trail-bread', 'slime-residue', 'prismatic-pearl', 'stormhorn-core'].map(itemId => ({ kind: 'item', itemId, chance: 1 }));
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([key, p]) => [hash(tokens[key]), { characters: [p] }]))));
  await start(); let owner = await connect('owner'); const stranger = await connect('stranger'), full = await connect('full'), gm = await connect('gm');
  assert.equal(gm.player().role, 'gm');
  for (const action of ['startLootTrace', 'getLootTrace', 'stopLootTrace']) await traceAction(owner, action, owner, false);
  await traceAction(gm, 'getLootTrace', owner, false);
  await traceAction(gm, 'startLootTrace', owner, false, { enabled: true });
  await traceAction(gm, 'startLootTrace', owner);
  await traceAction(gm, 'startLootTrace', full);
  const initialTrace = await traceAction(gm, 'getLootTrace', owner);
  assert.equal(initialTrace.events[0].actorId, gm.id);
  assert.equal(initialTrace.player.id, owner.id);
  await traceAction(gm, 'startLootTrace', owner);
  assert.equal((await traceAction(gm, 'getLootTrace', owner)).startedAt, initialTrace.startedAt, 'Active start preserves the current trace.');
  assert.equal(owner.player().petLootMinQuality, 'uncommon', 'legacy saves default to uncommon');
  for (const value of PET_LOOT_QUALITIES) await quality(owner, value);
  for (const message of [ { type: 'petLootQuality' }, ...['invented', null, 1, ['rare']].map(value => ({ type: 'petLootQuality', quality: value })),
    { type: 'petLootQuality', quality: 'rare', extra: true } ]) await reject(owner, message, 'malformed minimum rejected');
  await quality(owner, 'rare');
  const first = await kill(owner, 'rare'); await ready(first);
  assert.equal(owner.player().gold, 100, 'dismissed pet cannot collect'); assert.equal(stranger.player().gold, 100, 'another pet cannot collect owner loot');
  owner.send({ type: 'summonPet', pet: 'moss-fox' }); await until(() => owner.player().summonedPet === 'moss-fox', 'pet summoned');
  await tick(); assert.equal(owner.player().gold, 100, 'summoned pet cannot collect outside radius');
  await walk(owner, PET_LOOT_RADIUS + .01); await tick(); assert.equal(owner.player().gold, 100, 'just outside twelve metres stays uncollected');
  await walk(owner, PET_LOOT_RADIUS); await tick();
  assert.equal(owner.player().gold, 100, 'pet must arrive before collecting');
  assert(owner.player().petPosition && gap(owner.player().petPosition, first) < gap(owner.player(), first), 'pet runs outward while owner stays put');
  await tick(2500);
  await until(() => owner.player().gold === 100 + first.gold, 'twelve-metre boundary collects gold');
  assert.equal(gap(owner.player(), {x: home.x + PET_LOOT_RADIUS, z: home.z}), 0, 'collection never moves the player');
  const firstGear = first.items.find(row => row.kind === 'gear');
  assert.equal(firstGear.quality, 'rare'); assert(owner.player().ownedGear.includes(firstGear.itemId), 'inclusive rare gear pickup');
  assert.equal(owner.player().carriedItems['prismatic-pearl'], 1); assert.equal(owner.player().carriedItems['stormhorn-core'], 1);
  assert.deepEqual(owner.drop(first.id).items.map(row => row.itemId), ['trail-bread', 'slime-residue'], 'lower qualities remain on the same corpse');
  assert.equal(stranger.player().gold, 100);
  const firstTrace = await traceAction(gm, 'getLootTrace', owner), generated = firstTrace.events.find(e => e.type === 'generated' && e.dropId === first.id);
  assert(generated, 'A real kill records generation.');
  assert.deepEqual(generated.map, { eligible: true, roll: 99, chancePercent: 5, awarded: false, reason: 'roll_missed' });
  assert.equal(generated.killer, true);
  assert.deepEqual(generated.items, lootRows(first));
  assert(generated.rolls.some(roll => roll.stage === 'extra-gear' && roll.passed && roll.draw === 0));
  assert(generated.rolls.some(roll => roll.stage === 'gear-quality' && roll.quality === 'rare'));
  assert(generated.rolls.some(roll => roll.stage === 'random-gear' && roll.itemId === firstGear.itemId));
  assert(firstTrace.events.some(e => e.type === 'pickup_decision' && e.reason === 'out_of_range'));
  assert(firstTrace.events.some(e => e.type === 'pickup_decision' && e.skipped?.some(row => row.reason === 'below_minimum_rarity')));
  assertSavedCounts(firstTrace.events.find(e => e.type === 'pickup_saved' && e.dropId === first.id), stored('owner'));
  assert(!JSON.stringify(owner.snapshot).includes('lootTrace'), 'Ordinary snapshots omit diagnostics and trace metadata.');
  assert(!JSON.stringify(firstTrace).includes(tokens.owner), 'Trace export never contains account credentials.');
  await walk(owner, 2); owner.send({ type: 'loot', targetId: first.id, itemId: 'item:trail-bread' });
  await until(() => owner.player().carriedItems['trail-bread'] === 1, 'manual pickup still collects filtered common items');
  for (const minimum of PET_LOOT_QUALITIES) {
    await quality(owner, minimum); const beforeBread = owner.player().carriedItems['trail-bread'] || 0, beforeGold = owner.player().gold, drop = await kill(owner, minimum);
    const gear = drop.items.find(row => row.kind === 'gear'); assert.equal(gear.quality, minimum);
    await tick(Math.max(0, drop.diedAt + DEATH_ANIMATION_MS - clock - 1));
    assert.equal(owner.player().gold, beforeGold, 'auto pickup respects the death animation gate');
    await ready(drop); await until(() => owner.player().ownedGear.includes(gear.itemId), `${minimum} gear collected at its minimum`);
    assert.equal(owner.player().gold, beforeGold + drop.gold, `${minimum} minimum always collects gold`);
    if (minimum === 'common') assert.equal(owner.player().carriedItems['trail-bread'], beforeBread + drop.items.find(row => row.itemId === 'trail-bread').quantity, 'Common food is collected when opted in');
    assert((owner.drop(drop.id)?.items || []).every(row => PET_LOOT_QUALITIES.indexOf(row.quality) < PET_LOOT_QUALITIES.indexOf(minimum)), `${minimum} preserves only rows below minimum`);
  }
  const fullBefore = assets(full.player()), fullDrop = await kill(full, 'mythic'); await ready(fullDrop);
  await until(() => full.player().gold === fullBefore.gold + fullDrop.gold, 'gold fits full bags');
  assert.equal(full.player().carriedItems['slime-residue'], 2, 'existing item stack fits full bags'); assert.equal(bagUsage(full.player()), 16);
  const expectedFullRows = fullDrop.items.filter(row => row.itemId !== 'slime-residue');
  assert.deepEqual(full.drop(fullDrop.id).items, expectedFullRows, 'all items requiring a new slot stay on corpse');
  const fullTrace = await traceAction(gm, 'getLootTrace', full);
  assert(fullTrace.events.some(e => e.type === 'pickup_decision' && e.dropId === fullDrop.id && e.skipped?.some(row => row.reason === 'bags_full')), 'A full bag records why items remain.');
  assertSavedCounts(fullTrace.events.find(e => e.type === 'pickup_saved' && e.dropId === fullDrop.id), stored('full'));
  const failureDrop = await kill(owner, 'mythic'), failureBefore = assets(owner.player());
  await delay(1200); mkdirSync(`${file}.tmp`); await ready(failureDrop);
  assert.deepEqual(assets(owner.player()), failureBefore, 'failed auto-save does not mutate assets');
  assert.deepEqual(lootRows(owner.drop(failureDrop.id)), lootRows(failureDrop), 'failed auto-save retains exact loot');
  assert(!Object.hasOwn(stored('owner'),'petPosition'), 'pet movement stays out of persistent character state');
  assert.deepEqual(assets(stored('owner')), failureBefore, 'failed auto-save leaves durable assets unchanged');
  const failedTrace = await traceAction(gm, 'getLootTrace', owner), failedPickup = failedTrace.events.find(e => e.type === 'pickup_save_failed' && e.dropId === failureDrop.id);
  assert(failedPickup, 'A failed persistence attempt is explicitly recorded.');
  assert.deepEqual(failedPickup.remaining, lootRows(failureDrop));
  assertSavedCounts(failedPickup, stored('owner'));
  rmSync(`${file}.tmp`, { recursive: true }); await tick();
  await until(() => owner.player().gold === failureBefore.gold + failureDrop.gold, 'failed auto pickup retries successfully');
  let durable = assets(owner.player());
  await reject(owner, {type:'move', x:owner.player().x, z:owner.player().z, rotation:0, petPosition:{x:home.x,z:home.z}}, 'client cannot control pet position'); await tick(2400); assert.deepEqual(assets(owner.player()), durable, 'collected rewards are not replayed');
  await tick(5 * 60 * 1000);
  const expiredTrace = await traceAction(gm, 'getLootTrace', full), expiredLoot = expiredTrace.events.find(e => e.type === 'loot_removed' && e.dropId === fullDrop.id);
  assert.equal(expiredLoot?.reason, 'expired');
  assert.deepEqual(expiredLoot.remaining, expectedFullRows, 'Expiry records exactly the uncollected rows.');
  await traceAction(gm, 'stopLootTrace', owner);
  const stoppedTrace = await traceAction(gm, 'getLootTrace', owner);
  assert.equal(stoppedTrace.stoppedReason, 'manual');
  const untracedDrop = await kill(owner, 'mythic'); await ready(untracedDrop);
  assert.deepEqual(await traceAction(gm, 'getLootTrace', owner), stoppedTrace, 'Stopped traces collect no subsequent kills or pickups.');
  owner.send({ type: 'summonPet', pet: null }); await until(() => owner.player().summonedPet === null, 'dismiss before storing preference');
  await quality(owner, 'common'); durable = assets(owner.player());
  full.socket.terminate();
  await until(() => gm.snapshot.gmPlayers?.some(p => p.id === full.id && p.online === false && p.lootTrace), 'Offline traced player remains in GM roster');
  assert((await traceAction(gm, 'getLootTrace', full)).events.some(e => e.type === 'left_world'), 'A GM can export retained evidence after the target disconnects.');
  assert(!JSON.stringify(readSave()).includes('lootTrace'), 'Diagnostics stay out of persistent player data.');
  assert(!owner.messages.some(m => m.type === 'gmLootTrace'), 'A normal player never receives diagnostic exports.');
  await stop(); await start(); owner = await connect('owner'); assert.deepEqual(assets(owner.player()), durable, 'preference and collected assets survive restart');
  await stop(); const valid = readSave();
  for (const value of ['invented', null, 1, ['rare']]) {
    const records = structuredClone(valid); records[hash(tokens.owner)].characters[0].petLootMinQuality = value; writeFileSync(file, JSON.stringify(records));
    assert.throws(() => createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }), /Invalid player save/, 'malformed present preference fails closed');
  }
  console.log('PASS: pet auto-loot thresholds/range/ownership, full bags, save rollback/retry, persisted rewards/preferences, and GM-only loot tracing through generation, pickup, failed save, expiry, stop and offline export without player-data leakage.');
} finally {
  rmSync(`${file}.tmp`, { recursive: true, force: true }); await stop(); Date.now = realNow; Math.random = realRandom;
  Object.assign(MONSTERS['moss-slime'], oldMonster); LOOT_TABLES['moss-slime'] = oldTable;
  for (const key of Object.keys(WORLD_GEAR_ODDS)) delete WORLD_GEAR_ODDS[key]; Object.assign(WORLD_GEAR_ODDS, oldOdds);
  rmSync(dir, { recursive: true, force: true });
}
