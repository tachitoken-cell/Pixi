import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { newBags, bagUsage } from '../src/bags.ts';
import { newBank } from '../src/bank.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { RECIPES, WORKSHOP_POSITION, newContracts, craftingXpGain } from '../src/adventure.ts';
import { MAX_SKILL_XP, skillProgress } from '../src/skills.ts';
import { toWorld, canTraverse } from '../src/realm.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-crafting-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now, key = token => createHash('sha256').update(token).digest('hex'), threshold = level => 50 * (level - 1) ** 2;
let offset = 0, game, port; Date.now = () => realNow() + offset;
function hero(name, craftingXp = threshold(10), extra = {}) {
  return { id: randomUUID(), name, ...toWorld('greenwood', { x: WORKSHOP_POSITION.x, z: WORKSHOP_POSITION.z + 2.7 }), zone: 'greenwood', coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), hp: 600, maxHp: 808, level: 60, xp: 0, gold: 0,
    inventory: { wood: 200, crystal: 200, herb: 200, potion: 0, relic: 0 }, carriedItems: {}, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp, contracts: newContracts(),
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null }, ...extra };
}
const junk = Object.fromEntries(Object.keys(LOOT_ITEMS).filter(id => id !== 'greater-tonic').slice(0, 13).map(id => [id, 9]));
const heroes = {
  apprentice: hero('Apprentice', threshold(10) - 1), journeyman: hero('Journeyman'), expert: hero('Expert', threshold(25)), artisan: hero('Artisan', threshold(50)),
  refiner: hero('Refiner', 0, { carriedItems: { 'gnarled-bark': 6, 'frost-shard': 3 } }),
  mastered: hero('Mastered', MAX_SKILL_XP), full: hero('Full crafter', threshold(10), { carriedItems: junk }),
  stack: hero('Stack crafter', threshold(10), { carriedItems: { ...Object.fromEntries(Object.entries(junk).slice(0, 12)), 'greater-tonic': 1 } }),
  overflow: hero('Overflow crafter', threshold(10), { carriedItems: { 'greater-tonic': Number.MAX_SAFE_INTEGER } }),
  resourceOverflow: hero('Refinement overflow', 0, { inventory: { wood: Number.MAX_SAFE_INTEGER, crystal: 0, herb: 0, potion: 0, relic: 0 }, carriedItems: { 'gnarled-bark': 3 } }),
  banked: hero('Banked crafter', threshold(10), { bank: { ...newBank(), gear: ['sandstrider-weapon'] } }),
  auctioned: hero('Auction crafter'), far: hero('Far crafter', threshold(10), { x: 0, z: 8 }), missing: hero('Missing ingredients', 0),
};
heroes.auctioned.auctions = [{ id: randomUUID(), sellerId: heroes.auctioned.id, sellerName: heroes.auctioned.name, item: { kind: 'gear', id: 'sandstrider-weapon', quantity: 1 }, currency: 'gold', price: '10', createdAt: Date.now() }];
const tokens = Object.fromEntries(Object.keys(heroes).map(name => [name, randomBytes(32).toString('base64url')]));
const assets = p => structuredClone({ inventory: p.inventory, carriedItems: p.carriedItems, ownedGear: p.ownedGear, equipment: p.equipment, craftingXp: p.craftingXp });
async function until(fn, label) { const end = realNow() + 6000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(15); } throw Error(`Timed out: ${label}`); }
async function advance() { offset += 1000; await delay(120); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(name) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], name }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === heroes[name].id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'snapshot') c.snapshot = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[name], characterId: heroes[name].id }); await until(() => c.player(), 'enter crafting fixture'); return c;
}
async function reject(c, recipeId, label) {
  await advance(); const index = c.messages.length, before = assets(c.player()); c.send({ type: 'craft', recipeId });
  await until(() => c.messages.slice(index).some(m => m.type === 'event' && m.kind === 'info'), label); await delay(130);
  assert.deepEqual(assets(c.player()), before, label + ' leaves ingredients, output and XP untouched');
}
async function craft(c, recipeId) {
  await advance(); const recipe = RECIPES.find(r => r.id === recipeId), before = assets(c.player()), index = c.messages.length;
  c.send({ type: 'craft', recipeId }); await until(() => c.messages.slice(index).some(m => m.type === 'event' && m.text.startsWith(`Crafted ${recipe.label}`)), recipeId); await delay(130);
  const after = c.player(); assert.equal(after.craftingXp, before.craftingXp + craftingXpGain(recipe, before.craftingXp));
  for (const [id, quantity] of Object.entries(recipe.cost)) assert.equal(after.inventory[id], before.inventory[id] - quantity);
  for (const [id, quantity] of Object.entries(recipe.itemCost || {})) assert.equal(after.carriedItems[id], before.carriedItems[id] - quantity);
  if (recipe.output.item) assert.equal(after.carriedItems[recipe.output.item], (before.carriedItems[recipe.output.item] || 0) + recipe.output.quantity);
  else if (recipe.output.resource) assert.equal(after.inventory[recipe.output.resource], before.inventory[recipe.output.resource] + recipe.output.quantity);
  else assert(after.ownedGear.includes(recipe.output.gear));
}
try {
  assert(canTraverse(heroes.apprentice, heroes.apprentice)); assert.equal(bagUsage(heroes.full), 16); assert.equal(bagUsage(heroes.stack), 16);
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([name, player]) => [key(tokens[name]), { characters: [player] }]))));
  await start(); const c = {}; for (const name of Object.keys(heroes)) c[name] = await connect(name);
  await reject(c.apprentice, 'moonpetal-remedies', 'adventure level cannot bypass crafting rank');
  await craft(c.apprentice, 'woodland-remedies'); assert.equal(skillProgress(c.apprentice.player().craftingXp).level, 10);
  assert(c.apprentice.messages.some(m => m.type === 'event' && m.text.includes('Unlocked: Moonpetal remedies')), 'rank announces next usable recipe');
  await craft(c.apprentice, 'moonpetal-remedies');
  for (const [name, recipe] of [['journeyman', 'moonpetal-remedies'], ['expert', 'frostbloom-remedies'], ['artisan', 'sunblossom-remedies']]) await craft(c[name], recipe);
  await craft(c.refiner, 'reclaim-timber'); await craft(c.refiner, 'polish-crystals');
  await reject(c.missing, 'reclaim-timber', 'refinement cannot consume absent junk');
  await reject(c.full, 'moonpetal-remedies', 'full bags reject a new output stack');
  await craft(c.stack, 'moonpetal-remedies'); assert.equal(bagUsage(c.stack.player()), 16);
  await reject(c.overflow, 'moonpetal-remedies', 'item overflow'); await reject(c.resourceOverflow, 'reclaim-timber', 'resource overflow');
  await reject(c.far, 'moonpetal-remedies', 'workshop proximity');
  for (const name of ['banked', 'auctioned']) await reject(c[name], 'craft-sandstrider-weapon', 'unique equipment escrow');
  await craft(c.journeyman, 'craft-sandstrider-weapon'); await reject(c.journeyman, 'craft-sandstrider-weapon', 'unique equipment cannot duplicate');
  c.journeyman.send({ type: 'equipGear', itemId: 'sandstrider-weapon' }); await until(() => c.journeyman.player().equipment.weapon === 'sandstrider-weapon', 'crafted gear equips');
  const hp = c.expert.player().hp, tonics = c.expert.player().carriedItems['greater-tonic']; c.expert.send({ type: 'useItem', itemId: 'greater-tonic' });
  await until(() => c.expert.player().carriedItems['greater-tonic'] === tonics - 1, 'crafted tonic consumes'); assert.equal(c.expert.player().hp, Math.min(808, hp + 100));
  await craft(c.mastered, 'trail-tonic'); assert.equal(c.mastered.player().craftingXp, MAX_SKILL_XP, 'mastered recipe retains output but grants no skill');
  const forgedBefore = assets(c.missing.player()), forgedAt = c.missing.messages.length;
  c.missing.send({ type: 'craft', recipeId: 'woodland-remedies', craftingXp: MAX_SKILL_XP });
  await until(() => c.missing.messages.slice(forgedAt).some(m => m.type === 'event' && m.text.includes('controlled by the realm')), 'client skill forgery');
  assert.deepEqual(assets(c.missing.player()), forgedBefore, 'client-provided crafting XP is never trusted');
  const expected = Object.fromEntries(Object.entries(c).map(([name, client]) => [name, assets(client.player())]));
  for (const client of clients) client.socket.terminate(); await game.stop(); game = null;
  const saved = JSON.parse(readFileSync(file, 'utf8')); for (const name of Object.keys(heroes)) assert.deepEqual(assets(saved[key(tokens[name])].characters[0]), expected[name]);
  await start(); const restored = await connect('expert'); assert.deepEqual(assets(restored.player()), expected.expert, 'crafting, consumed tonics and progression survive restart');
  console.log('PASS crafting progression: four ranks, threshold unlocks, refinement, precise inputs and XP, useful healing/equipment, mastered work, full bags/stacks, safe integers, unique escrow, durable restart.');
} finally { for (const client of clients) client.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
