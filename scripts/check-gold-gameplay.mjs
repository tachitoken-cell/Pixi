import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { goldSource, craftingGoldCost, talentResetGoldCost, goldBoostPurchase, goldStorePrice, contractCooldown } from '../src/gold-economy.ts';
import { RECIPES, CONTRACTS, WORKSHOP_POSITION, claimContract, newContracts, recipeAllowed, recipeOutput, contractProgress } from '../src/adventure.ts';
import { RESOURCE_PRICES, starterGear, TALENTS, canLearnTalent } from '../src/progression.ts';
import { gearSellPrice } from '../src/merchants.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { toWorld, regionAt } from '../src/realm.ts';
import { ZEPPELIN_PORTS } from '../src/zeppelin.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { CHAPTERS } from '../src/content.ts';
import { spellTrainingCost } from '../src/training.ts';
import { SPELLS } from '../src/spells.ts';
import { storeActivationChanges, storePlayerValid } from '../src/ingame-store.ts';

for (const source of ['monster', 'boss', 'cache', 'treasure', 'contract', 'resale']) {
  for (const n of [0, 1, 2, 3, 4, 15, 101]) {
    assert.equal(goldSource(n, source), n);
    assert.equal(goldSource(n, source, true), n ? Math.max(1, Math.floor(n / (source === 'monster' ? 4 : 2))) : 0);
  }
}
for (const r of RECIPES) {
  assert.equal(craftingGoldCost(r), 0);
  const cost = craftingGoldCost(r, true);
  assert.equal(cost, r.output.gear ? r.requiredLevel * 5 : r.output.quantity * (r.output.item === 'greater-tonic' ? 3 : 1));
  const materials = Object.entries(r.cost).reduce((n, [id, count]) => n + count * goldSource(RESOURCE_PRICES[id] || 0, 'resale', true), 0)
    + Object.entries(r.itemCost || {}).reduce((n, [id, count]) => n + count * goldSource(LOOT_ITEMS[id].sellPrice, 'resale', true), 0);
  const resale = r.output.gear ? goldSource(gearSellPrice(r.output.gear), 'resale', true)
    : r.output.quantity * goldSource(r.output.item ? LOOT_ITEMS[r.output.item].sellPrice : RESOURCE_PRICES[r.output.resource] || 0, 'resale', true);
  assert(resale < cost + materials, `${r.id} cannot profit by crafting for NPC resale`);
}
for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  const lesson = Object.values(SPELLS).find(spell => spell.className === className && spell.requiredLevel === 2);
  const earlyEquipment = RECIPES.filter(recipe => recipe.output.gear && recipe.requiredLevel <= 2 && (!recipe.className || recipe.className === className));
  assert(earlyEquipment.length > 0);
  const total = spellTrainingCost(lesson.id) + earlyEquipment.reduce((sum, recipe) => sum + craftingGoldCost(recipe, true), 0);
  assert(CHAPTERS[0].reward.gold >= total, `${className}: the preserved opening quest pays required training and all eligible early equipment fees without MOSS`);
}
for (const c of CONTRACTS) {
  const state = newContracts(); state.active[c.id] = c.count;
  assert.equal(claimContract(state, c.id, c.zone, 1000, true), c);
  assert.equal(state.completed[c.id], 1000 + contractCooldown(c, true));
  assert.equal(contractCooldown(c, true), c.targetRegion ? 900000 : c.cooldownMs);
}
assert.equal(talentResetGoldCost({ level: 60, talents: [] }, true), 0);
assert.equal(talentResetGoldCost({ level: 60, talents: ['talent'] }, true), 300);
for (const [id, cost] of Object.entries({ 'profession-xp': 250, 'combat-xp': 250, damage: 500, defense: 500 })) {
  assert.equal(goldStorePrice(`store-${id}`, true), cost);
  assert.equal(goldBoostPurchase({ gold: cost - 1, storeConsumables: {} }, id, true), null);
  assert.equal(goldBoostPurchase({ gold: cost, storeConsumables: {} }, id, false), null);
  assert.deepEqual(goldBoostPurchase({ gold: cost, storeConsumables: {} }, id, true), { gold: 0, storeConsumables: { [id]: 1 } });
  const boostOwner = { id: 'gold-boost-owner', gold: cost, storeOrders: [], storePurchases: [], ownedMounts: [], ownedPets: [], storeConsumables: {}, storeBoosts: {} };
  Object.assign(boostOwner, goldBoostPurchase(boostOwner, id, true));
  assert(storePlayerValid(boostOwner), `${id}: gold-bought charges validate without a paid receipt`);
  Object.assign(boostOwner, storeActivationChanges(boostOwner, id, 1000));
  assert(storePlayerValid(boostOwner), `${id}: activated gold-bought boosts validate without a paid receipt`);
  assert(!storePlayerValid({ ...boostOwner, storePurchases: ['store-embermane'], ownedMounts: ['store-embermane'] }), 'gold boosts do not grant unreceipted cosmetics');
}
assert.equal(goldBoostPurchase({ gold: 9999, storeConsumables: {} }, '__proto__', true), null);

// Run the actual crafting handler and commit helper with a delayed save. Party rewards
// can land before preparation and during database I/O while player actions are locked.
const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const trainingSource = serverSource.slice(serverSource.indexOf('function completeTraining('), serverSource.indexOf('  const auctionNearby ='));
const craftStart = "      } else if (message.type === 'craft') {", craftEnd = "      } else if (message.type === 'loot') {";
const craftSource = serverSource.slice(serverSource.indexOf(craftStart) + craftStart.length, serverSource.indexOf(craftEnd));
const concurrent = { id: 'craft-concurrency', level: 3, hp: 124, gold: 10, zone: 'greenwood', appearance: { className: 'Ranger' }, ...starterGear('Ranger'),
  craftingXp: 0, inventory: { wood: 10, crystal: 10, herb: 10, potion: 0, relic: 0 }, carriedItems: {},
  achievements: { unlocked: {}, crafted: 0, kills: 0 }, contracts: { active: { 'greenwood-hunt': 0, 'greenwood-tonics': 0 }, completed: {} } };
let stagedCraft, nextAutosave;
const craftScope = { p: concurrent, session: { player: concurrent, recordKey: 'craft-account' }, message: { type: 'craft', recipeId: 'trail-tonic' }, now: 10000,
  economyVersion: 1, RECIPES, WORKSHOP_POSITION, recipeAllowed, recipeOutput, contractProgress, craftingGoldCost, toWorld, structuredClone,
  distance: () => 0, physicalReach: () => true, craftingProgress: () => ({ level: 1 }), craftingXpGain: () => 12, MAX_SKILL_XP: 10000, storeBoostMultiplier: () => 1,
  bagCanFit: () => true, auctionItemsRetained: () => true, auctionEscrowHas: () => false, bankEscrowHas: () => false, auctionIncomingGear: () => false,
  reject: text => assert.fail(text), stand() {}, cancelGathering() {}, cancelTradeFor() {}, committingAccounts: new Map(),
  stagedPlayerChanges: (_player, changes) => typeof changes === 'function' ? changes : () => changes,
  onboardingCanComplete: () => false, unlockAchievements: () => [], sendAchievements() {}, event() {}, liveSession: () => true,
  closing: false, database: null, releasingAccounts: new Map(), accountConnections: new Map(), send() {}, snapshot() {}, recordReferralGameplay() {},
  dirty: () => { nextAutosave = structuredClone(concurrent); }, console,
  async save(overrides, persisted) {
    await Promise.resolve(); contractProgress(concurrent.contracts, 'kill', 'moss-slime');
    stagedCraft = structuredClone(overrides.get(concurrent.id)());
    await Promise.resolve(); contractProgress(concurrent.contracts, 'kill', 'moss-slime'); concurrent.achievements.kills++;
    persisted();
  },
};
craftScope.accountConnections.set('craft-account', { session: craftScope.session });
await runInNewContext(`(async () => { ${trainingSource} ${craftSource} })()`, craftScope);
assert.equal(stagedCraft.contracts.active['greenwood-hunt'], 1, 'queued preparation includes latest party progress');
assert.equal(stagedCraft.contracts.active['greenwood-tonics'], 1, 'craft progress persists with the fee');
assert.equal(concurrent.contracts.active['greenwood-hunt'], 2, 'party progress during persistence survives crafting');
assert.equal(concurrent.contracts.active['greenwood-tonics'], 1, 'craft progress is applied only once');
assert.equal(concurrent.achievements.kills, 1); assert.equal(concurrent.achievements.crafted, 1);
assert.equal(nextAutosave.contracts.active['greenwood-hunt'], 2, 'normal autosave retains concurrent party progress');
assert.equal(stagedCraft.achievements.crafted, 1, 'durable staged craft count increments exactly once');
assert.equal(nextAutosave.achievements.crafted, 1, 'live craft count never reapplies the staged increment');
const failedCraft = structuredClone(concurrent); failedCraft.craftingXp = 49;
const beforeFailedCraft = structuredClone(failedCraft), failureEvents = [];
const failedCraftSession = { player: failedCraft, recordKey: 'failed-craft' };
let failedSaveAttempts = 0;
await runInNewContext(`(async () => { ${trainingSource} ${craftSource} })()`, { ...craftScope,
  p: failedCraft, session: failedCraftSession, accountConnections: new Map([['failed-craft', { session: failedCraftSession }]]),
  craftingProgress: xp => ({ level: xp >= 50 ? 2 : 1 }), auctionFinalityMessage: 'Reserved item',
  console: { error() {} }, event: (_session, kind, text) => failureEvents.push({ kind, text }), dirty() {},
  async save(overrides) {
    failedSaveAttempts++;
    const staged = overrides.get(failedCraft.id)();
    assert(staged.craftingXp >= 50, 'this craft would unlock a level if saved');
    throw Error('Controlled crafting save failure');
  },
});
assert.equal(failedSaveAttempts, 1, 'the owned session reaches the simulated save failure');
assert.deepEqual(failedCraft, beforeFailedCraft, 'failed craft preserves gold, materials, XP, contracts and achievements');
assert(!failureEvents.some(event => event.kind === 'reward' || /Crafting level|Unlocked:/.test(event.text)), 'failed craft announces no level or recipe unlock');


const dir = mkdtempSync(join(tmpdir(), 'mossvale-gold-gameplay-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now; let clock = realNow(), game, port;
Date.now = () => clock;
const workshop = toWorld('greenwood', WORKSHOP_POSITION), merchant = VILLAGE_NPCS.find(n => n.id === 'village-pinewake-merchant');
const tokens = Array.from({ length: 5 }, () => randomBytes(32).toString('base64url'));
const key = token => createHash('sha256').update(token).digest('hex');
const zeroValueGear = starterGear('Mage').equipment.weapon;
assert.equal(gearSellPrice(zeroValueGear), 0);
const heroes = ['Gold crafter', 'Poor crafter', 'Gold passenger', 'Gold vendor', 'Legacy vendor'].map((name, i) => {
  const point = [workshop, workshop, ZEPPELIN_PORTS[0], merchant, merchant][i];
  return { id: randomUUID(), name, x: point.x, z: point.z, zone: regionAt(point.x, point.z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, ...starterGear('Ranger'), talents: [], level: 3, hp: 124, maxHp: 124, xp: 0, gold: [4000, 0, 25, 0, 0][i],
    inventory: { wood: 40, crystal: 30, herb: 20, potion: 3, relic: 0 }, carriedItems: { 'gnarled-bark': 3 },
    zeppelinPorts: ZEPPELIN_PORTS.slice(0, 2).map(p => p.id), quest: { stage: 0, kills: 0, crystals: 0 },
    ...(i >= 3 ? { ownedGear: [...starterGear('Ranger').ownedGear, 'warden-longbow', 'ranger-mantle', zeroValueGear] } : {}) };
});
const stored = i => JSON.parse(readFileSync(file, 'utf8'))[key(tokens[i])].characters[0];
async function until(fn, label) { const end = realNow() + 8000; while (realNow() < end) { const result = fn(); if (result) return result; await delay(10); } throw Error(`Timed out: ${label}`); }
async function connect(i) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === heroes[i].id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'snapshot') c.snapshot = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[i], characterId: heroes[i].id }); await until(() => c.player(), 'join'); return c;
}
async function action(c, message, match) { clock += 1200; await delay(30); const first = c.messages.length; c.send(message); return until(() => c.messages.slice(first).find(match || (m => m.type === 'event')), message.type); }
try {
  writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((p, i) => [key(tokens[i]), { characters: [p] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', economyVersion: 0 }); port = await game.start();
  const legacyVendor = await connect(4);
  await action(legacyVendor, { type: 'sellGear', npcId: merchant.id, itemId: 'warden-longbow' }, m => m.type === 'event' && m.text.startsWith('Sold '));
  assert.equal(stored(4).gold, gearSellPrice('warden-longbow'), 'compatibility mode retains the original authoritative gear resale quote');
  assert(!stored(4).ownedGear.includes('warden-longbow'));
  await game.stop(); game = null;
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', economyVersion: 1 }); port = await game.start();
  const [crafter, poor, passenger, vendor] = await Promise.all(heroes.map((_, i) => connect(i)));
  assert.equal(crafter.player().economyVersion, 1);
  await action(poor, { type: 'craft', recipeId: 'trail-tonic' }); assert.equal(poor.player().inventory.potion, 3);
  await action(crafter, { type: 'craft', recipeId: 'trail-tonic' }, m => m.type === 'event' && m.text.includes('Crafted'));
  assert.equal(stored(0).gold, 3999); assert.equal(stored(0).inventory.potion, 4); assert.equal(stored(0).achievements.crafted, 1);
  await action(crafter, { type: 'craft', recipeId: 'warden-longbow' }, m => m.type === 'event' && m.text.includes('Crafted'));
  assert.equal(stored(0).gold, 3989); assert(stored(0).ownedGear.includes('warden-longbow'));
  await action(crafter, { type: 'craft', recipeId: 'warden-longbow' }); assert.equal(stored(0).gold, 3989, 'duplicate gear crafting does not charge twice');
  await action(crafter, { type: 'storeBuyBoost', boostId: 'damage' }, m => m.type === 'storeState');
  assert.equal(stored(0).gold, 3489); assert.equal(stored(0).storeConsumables.damage, 1); assert.equal(stored(0).storeOrders.length, 0);
  assert(storePlayerValid(stored(0)), 'gold boost save remains a valid store state');
  await action(poor, { type: 'storeBuyBoost', boostId: 'damage' }, m => m.type === 'storeState'); assert.equal(poor.player().gold, 0);
  await action(crafter, { type: 'storeActivateBoost', boostId: 'damage' }, m => m.type === 'storeState'); assert(stored(0).storeBoosts.damage > clock);
  await action(crafter, { type: 'storeQuote', productId: 'store-damage' }, m => m.type === 'event' && m.requestType === 'storeQuote'); assert.equal(stored(0).storeOrders.length, 0);
  const talent = Object.values(TALENTS).find(t => canLearnTalent(crafter.player(), t.id));
  await action(crafter, { type: 'learnTalent', talentId: talent.id });
  await action(crafter, { type: 'resetTalents' }, m => m.type === 'event' && m.text.includes('Talents reset'));
  assert.equal(stored(0).gold, 3474); assert.deepEqual(stored(0).talents, []);
  await action(crafter, { type: 'storeBuyClass', className: 'Mage' }, m => m.type === 'storeState');
  assert.equal(stored(0).gold, 974); assert.equal(stored(0).appearance.className, 'Mage'); assert.deepEqual(stored(0).storeOrders, []);
  await action(crafter, { type: 'storeBuyClass', className: 'Mage' }, m => m.type === 'storeState'); assert.equal(stored(0).gold, 974);
  await action(passenger, { type: 'zeppelinBoard', from: ZEPPELIN_PORTS[0].id, to: ZEPPELIN_PORTS[1].id }, m => m.type === 'event' && m.text.includes('Departing'));
  assert.equal(stored(2).gold, 0); assert(stored(2).zeppelin, 'debit and resumable flight persist together');
  clock = Math.ceil(stored(2).zeppelin.arrivesAt) + 1; await until(() => passenger.player().zeppelin === null, 'paid flight lands');
  await action(vendor, { type: 'sellResource', npcId: merchant.id, resource: 'wood', quantity: 2 });
  await until(() => vendor.player().gold === 2 * goldSource(RESOURCE_PRICES.wood, 'resale', true), 'vendor unit quotes');
  const vendorBefore = vendor.player().gold, gearQuote = goldSource(gearSellPrice('warden-longbow'), 'resale', true);
  const sale = await action(vendor, { type: 'sellGear', npcId: merchant.id, itemId: 'warden-longbow' }, m => m.type === 'event' && m.text.startsWith('Sold '));
  assert(sale.text.includes(`+${gearQuote} gold`));
  assert.equal(stored(3).gold, vendorBefore + gearQuote, 'active authoritative gear sales pay the displayed halved quote');
  assert(!stored(3).ownedGear.includes('warden-longbow'), 'successful sale durably removes gear');
  const gearEvents = JSON.parse(readFileSync(file, 'utf8'))[key(tokens[3])].goldLedger.filter(event => event.reason === 'vendor:gear');
  assert.equal(gearEvents.length, 1); assert.equal(gearEvents[0].created, gearQuote); assert.equal(gearEvents[0].burned, 0);
  await action(vendor, { type: 'sellGear', npcId: merchant.id, itemId: 'warden-longbow' });
  assert.equal(stored(3).gold, vendorBefore + gearQuote, 'repeated sale cannot issue gold twice');
  await action(vendor, { type: 'sellGear', npcId: merchant.id, itemId: zeroValueGear });
  assert.equal(stored(3).gold, vendorBefore + gearQuote); assert(stored(3).ownedGear.includes(zeroValueGear), 'zero-value unequipped gear stays unsellable');
  const gold = stored(0).gold, charges = stored(0).storeConsumables.defense || 0;
  // A failed durable save must leave both the gold and boost charge untouched.
  renameSync(file, `${file}.saved`); mkdirSync(file);
  const failedVendorGold = vendor.player().gold, failedVendorGear = [...vendor.player().ownedGear];
  await action(vendor, { type: 'sellGear', npcId: merchant.id, itemId: 'ranger-mantle' }, m => m.type === 'event' && m.text.includes('could not be saved'));
  assert.equal(vendor.player().gold, failedVendorGold); assert.deepEqual(vendor.player().ownedGear, failedVendorGear, 'failed vendor save preserves both gear and gold');

  await action(crafter, { type: 'storeBuyBoost', boostId: 'defense' }, m => m.type === 'storeState');
  assert.equal(crafter.player().gold, gold); assert.equal(crafter.player().storeConsumables.defense || 0, charges);
  rmSync(file, { recursive: true }); renameSync(`${file}.saved`, file);
  await game.stop(); game = null;
  assert.equal(stored(0).gold, gold); assert.equal(stored(0).appearance.className, 'Mage');
  assert.equal(stored(0).achievements.crafted, 2); assert.equal(stored(2).zeppelin, undefined, 'landed flight cannot teleport the character again after restart');
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', economyVersion: 1 }); port = await game.start();
  const reloadedCrafter = await connect(0);
  assert.equal(reloadedCrafter.player().gold, gold); assert(reloadedCrafter.player().storeBoosts.damage > clock, 'gold-purchased active boost survives validated reload');
  assert(storePlayerValid(stored(0)));
  console.log('PASS gold gameplay: legacy/active quotes, every recipe unprofitable for vendor resale, beginner craft funding, frontier cooldowns, authoritative craft/boost/class/respec/flight charges, insufficient funds, duplicate unique actions, no fabricated receipts, failed-save preservation, legacy/active authoritative gear resale and durable restart data.');
} finally {
  for (const c of clients) c.socket.terminate(); if (game) await game.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true });
}
