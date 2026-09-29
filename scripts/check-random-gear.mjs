import assert from 'node:assert/strict';
import { GEAR, GEAR_QUALITIES, MAX_GEAR_UPGRADE, PRIMARY_ATTRIBUTES, equippedAttributes, maxHealth, combatStats, copyGear, equipmentSlotFor, gearById, gearFitsSlot, gearIdValid, gearSpeedMultiplier, gearStatBreakdown, gearUpgradeQuote, rollGear, starterGear, upgradeGear } from '../src/progression.ts';
import { DUNGEON_CACHE_ODDS, WORLD_GEAR_ODDS, WORLD_GEAR_ROLL_CHANCE, DUNGEON_GEAR_ROLL_CHANCE, gearLootQuality, lootRows, rollDungeonCacheLoot, rollMonsterLoot } from '../src/loot-items.ts';
import { bagCanFit, bagUsage, newBags } from '../src/bags.ts';
import { bankDeposit, bankItemValid, bankPlayerValid, bankWithdraw, newBank } from '../src/bank.ts';
import { auctionCanList, auctionCanReceive, auctionItemChanges, auctionItemLabel, auctionItemValid } from '../src/auction.ts';
import { gearSellPrice, merchantStock } from '../src/merchants.ts';

const hero = (className = 'Ranger', level = 50) => ({ appearance: { className }, level, talents: [], ...starterGear(className), ...newBags(),
  gold: 1_000_000, inventory: { wood: 10000, crystal: 10000, herb: 10000, relic: 10000, potion: 0 }, carriedItems: {}, bank: newBank(), auctions: [] });
let seed = 9;
const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 0x100000000);
const oldKeys = ['primaryDamage', 'specialDamage', 'damage', 'defense', 'speed'], keys = [...oldKeys, ...PRIMARY_ATTRIBUTES];
const catalogSize = Object.keys(GEAR).length, statVariants = new Set(), statsSeen = new Set();
for (const quality of GEAR_QUALITIES) for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  const base = Object.values(GEAR).find(gear => gear.className === className && gear.requiredLevel === 10 && gear.slot === 'weapon');
  for (let i = 0; i < 30; i++) {
    const gear = rollGear(base.id, quality, random), p = hero(className), before = combatStats(p);
    assert(gear.id.length < 120 && gearIdValid(gear.id));
    assert.deepEqual(gearById(JSON.parse(JSON.stringify(gear.id))), gear, 'the ID alone restores the exact roll');
    assert.equal(gearLootQuality(gear), quality); assert.equal(gear.baseId, base.id); assert.equal(gear.requiredLevel, base.requiredLevel);
    assert.equal(gear.className, base.className); assert.equal(gear.model, base.model); assert.equal(gear.icon, base.icon);
    assert.equal(gear.setId, base.setId); assert(gear.dropOnly); assert(gearSellPrice(gear.id) > 0);
    let changed = 0;
    for (const key of keys) {
      const delta = (gear.stats[key] ?? 0) - (base.stats[key] ?? 0);
      assert(Number.isSafeInteger(delta) && delta >= 0 && delta <= 11, `${quality}: bounded ${key}`);
      if (delta > 0) { changed++; statsSeen.add(key); }
    }
    assert.equal(changed, Math.min(5, GEAR_QUALITIES.indexOf(quality) + 1), 'rarity increases the number of randomized affixes');
    statVariants.add(JSON.stringify(gear.stats));
    p.ownedGear.push(gear.id); p.equipment.weapon = gear.id;
    const after = combatStats(p);
    const primary = gear.stats[className === 'Knight' ? 'strength' : className === 'Ranger' ? 'agility' : 'intellect'] ?? 0;
    assert.equal(after.primaryDamage, before.primaryDamage + (gear.stats.primaryDamage ?? 0) + (gear.stats.damage ?? 0) + primary);
    assert.equal(after.specialDamage, before.specialDamage + (gear.stats.specialDamage ?? 0) + (gear.stats.damage ?? 0) + primary);
    assert.equal(maxHealth(p), 100 + (p.level - 1) * 12 + equippedAttributes(p).stamina * 5);
    assert.equal(after.defense, before.defense + (gear.stats.defense ?? 0));
    assert.equal(equipmentSlotFor(p.equipment, gear.id), 'weapon'); assert(gearFitsSlot(gear.id, 'weapon')); assert(!gearFitsSlot(gear.id, 'armor'));
  }
}
assert.deepEqual([...statsSeen].sort(), keys.sort()); assert(statVariants.size > 100, 'rolls yield varied attributes');
assert.equal(Object.keys(GEAR).length, catalogSize, 'derived items do not pollute merchant or asset catalogues');
// Fixed gear copies retain authored values and remain separate inventory items.
for (const base of Object.values(GEAR).filter(gear => gear.price > 0 || gear.sellPrice)) {
  const copy = copyGear(base.id, () => 0);
  assert.notEqual(copy.id, base.id); assert.equal(copy.baseId, base.id); assert.equal(copy.randomized, false);
  for (const key of ['label', 'stats', 'requiredLevel', 'className', 'slot', 'model', 'icon', 'setId']) assert.deepEqual(copy[key], base[key]);
  assert.equal(gearLootQuality(copy), gearLootQuality(base)); assert.equal(gearSellPrice(copy.id), gearSellPrice(base.id));
  assert.deepEqual(gearById(JSON.parse(JSON.stringify(copy.id))), copy);
  assert(gearStatBreakdown(copy.id).every(row => row.roll === 0 && row.upgrade === 0));
  const quote = gearUpgradeQuote(copy.id);
  assert.equal(quote.next.upgradeLevel, 1); assert.equal(quote.next.baseId, base.id);
  assert.deepEqual(quote.next.stats, gearUpgradeQuote(base.id).next.stats, 'upgrading a copy preserves fixed stats');
  for (const invalid of [copy.id.replace('~5~', '~6~'), copy.id.replace('0000000000000000', '-'), copy.id.replace('~0', '~60~0'),
    copy.id.replace(`~${copy.quality}~`, copy.quality === 'mythic' ? '~common~' : '~mythic~')]) assert(!gearIdValid(invalid));
}
for (const id of ['ranger-bow', '__proto__', 'unknown']) assert.throws(() => copyGear(id), /Invalid gear copy/);
const fixedOwner = hero('Mage', 60), reserved = [];
fixedOwner.ownedGear.push(...Object.keys(GEAR));
const fixedCopy = () => rollMonsterLoot('stone-golem', 14, fixedOwner, () => 0, { instanceId: null, reservedGear: reserved })
  .find(row => row.kind === 'gear' && !gearById(row.itemId).randomized).itemId;
const fixedCopies = [fixedCopy()]; fixedOwner.ownedGear.push(fixedCopies[0]);
fixedCopies.push(fixedCopy()); fixedOwner.bank.gear.push(fixedCopies[1]);
fixedCopies.push(fixedCopy()); fixedOwner.auctions.push({ item: { kind: 'gear', id: fixedCopies[2], quantity: 1 } });
fixedCopies.push(fixedCopy()); reserved.push(fixedCopies[3]); fixedCopies.push(fixedCopy());
assert.equal(new Set(fixedCopies).size, 5, 'repeated seeds preserve rewards across carried, banked, auctioned and pending corpse copies');
assert.equal(new Set(fixedCopies.map(id => gearById(id).baseId)).size, 1, 'the same fixed gear can keep dropping');
const copyOwner = hero('Mage', 60), [firstCopy, secondCopy] = fixedCopies;
copyOwner.ownedGear.push(gearById(firstCopy).baseId, firstCopy, secondCopy);
const copyItem = { kind: 'gear', id: firstCopy, quantity: 1 }, bankedCopy = bankDeposit(copyOwner, copyItem);
assert(bankedCopy && bankPlayerValid(bankedCopy)); assert(bankedCopy.ownedGear.includes(secondCopy));
const withdrawnCopy = bankWithdraw(JSON.parse(JSON.stringify(bankedCopy)), copyItem);
assert.deepEqual(withdrawnCopy, { ...copyOwner, ownedGear: [...copyOwner.ownedGear.filter(id => id !== firstCopy), firstCopy] });
assert(auctionCanList(copyOwner, copyItem));
assert.deepEqual(auctionItemChanges(copyOwner, copyItem, -1).ownedGear, copyOwner.ownedGear.filter(id => id !== firstCopy));
const upgradedCopy = upgradeGear(copyOwner, firstCopy);
assert(upgradedCopy && upgradedCopy.ownedGear.includes(secondCopy)); assert(!upgradedCopy.ownedGear.includes(firstCopy));
for (const [id, stats] of [
  ['warden-longbow~1~mythic~1234567890abcdef~0', { primaryDamage: 8, specialDamage: 4, defense: 3, damage: 4, speed: 4 }],
  ['warden-longbow~1~mythic~1234567890abcdef~5', { primaryDamage: 13, specialDamage: 9, defense: 8, damage: 9, speed: 9 }],
  ['starfall-staff~1~rare~fedcba9876543210~2', { primaryDamage: 7, specialDamage: 6, speed: 4, damage: 4 }],
]) assert.deepEqual(Object.fromEntries(Object.entries(gearById(id).stats).filter(([key]) => oldKeys.includes(key))), stats, 'version 1 existing combat bonuses are unchanged');
for (const [id, stats] of [
  ['elderwild-weapon~2~mythic~1234567890abcdef~0', { primaryDamage: 24, specialDamage: 21, agility: 15, speed: 3, stamina: 8, defense: 1 }],
  ['seraphic-armor~2~rare~fedcba9876543210~5', { defense: 12, intellect: 10, stamina: 15, spirit: 9, speed: 6 }],
]) assert.deepEqual(gearById(id).stats, stats, 'version 2 level-50 items retain their saved stats');
const highTemplates = Object.values(GEAR).filter(gear => gear.requiredLevel === 50), catalogBefore = JSON.stringify(GEAR);
assert.equal(highTemplates.length, 32);
for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) assert.equal(new Set(highTemplates.filter(gear => gear.className === className).map(gear => gear.slot)).size, 8);
for (const base of highTemplates) for (const quality of GEAR_QUALITIES) {
  const original = rollGear(base.id, quality, () => .4321), tier = GEAR_QUALITIES.indexOf(quality);
  assert.deepEqual(rollGear(base.id, quality, () => .4321, 50), original, 'explicit level 50 still emits the same version 2 item');
  let previous = original;
  for (let level = 51; level <= 60; level++) {
    const gear = rollGear(base.id, quality, () => .4321, level), breakdown = gearStatBreakdown(gear.id);
    assert.match(gear.id, new RegExp(`~3~${quality}~[0-9a-f]{16}~${level}~0$`));
    assert.equal(gear.requiredLevel, level); assert(gear.id.length < 120 && gearIdValid(gear.id));
    for (const key of ['className', 'slot', 'model', 'icon', 'setId']) assert.equal(gear[key], base[key], `scaled item preserves ${key}`);
    assert.equal(gear.baseId, base.id); assert.equal(gear.quality, quality); assert(gear.dropOnly);
    assert.deepEqual(gearById(JSON.parse(JSON.stringify(gear.id))), gear, 'saved identity retains level and stats');
    assert.equal(breakdown.filter(row => row.roll > 0).length, Math.min(5, tier + 1));
    for (const row of breakdown) {
      assert.equal(row.base, Math.ceil((base.stats[row.stat] ?? 0) * level / 50));
      assert.equal(row.upgrade, 0); assert.equal(row.total, row.base + row.roll);
      assert.equal(row.total, gear.stats[row.stat]); assert(row.total >= (previous.stats[row.stat] ?? 0), 'same-seed stats never fall with item level');
      assert.equal(row.max, row.roll ? row.stat === 'speed' ? 1 + Math.ceil(tier / 2) : 1 + tier + Math.floor(level / 12) : 0);
      assert(Number.isSafeInteger(row.roll) && row.roll >= 0 && row.roll <= row.max);
    }
    if (level === 60) assert(Object.entries(gear.stats).some(([stat, value]) => value > (original.stats[stat] ?? 0)), 'every slot and rarity can improve beyond level 50');
    previous = gear;
  }
}
assert.equal(JSON.stringify(GEAR), catalogBefore, 'scaled drops never mutate existing gear or expand merchant and asset catalogues');
// Dungeon item levels fill the gaps between fixed sets without changing saved v1-v3 items.
for (const base of Object.values(GEAR).filter(gear => [25, 40].includes(gear.requiredLevel))) {
  const ceiling = base.requiredLevel === 25 ? 40 : 50;
  for (const quality of GEAR_QUALITIES) for (const level of [base.requiredLevel + 1, ceiling - 1]) {
    const gear = rollGear(base.id, quality, () => .4321, level);
    assert.match(gear.id, /~4~/); assert.equal(gear.requiredLevel, level);
    assert.deepEqual(gearById(JSON.parse(JSON.stringify(gear.id))), gear);
    for (const row of gearStatBreakdown(gear.id)) {
      assert.equal(row.base, Math.ceil((base.stats[row.stat] ?? 0) * level / base.requiredLevel));
      assert.equal(row.total, row.base + row.roll); assert(row.roll >= 0 && row.roll <= row.max);
    }
    const upgraded = gearUpgradeQuote(gear.id);
    assert(upgraded); assert.equal(upgraded.next.requiredLevel, level); assert.equal(upgraded.next.upgradeLevel, 1);
    const owner = hero(base.className, level); owner.ownedGear.push(gear.id);
    const item = { kind: 'gear', id: gear.id, quantity: 1 };
    assert(bankItemValid(item) && auctionItemValid(item));
    assert(auctionCanReceive(hero(base.className, level), item));
    assert(!auctionCanReceive(hero(base.className, level - 1), item));
    for (const invalidLevel of [base.requiredLevel - 1, base.requiredLevel, ceiling, 60, 61])
      assert.equal(gearById(gear.id.replace(`~${level}~0`, `~${invalidLevel}~0`)), undefined);
    assert.equal(gearById(gear.id.replace('~4~', '~3~')), undefined);
  }
}
const scaled = rollGear('elderwild-weapon', 'mythic', () => .4321, 60);
for (const invalid of [
  ...['0', '49', '50', '61', '100', '060', '60.5', '-1', 'NaN', 'Infinity', ''].map(level => scaled.id.replace('~60~', `~${level}~`)),
  ...['1', '2', '4'].map(version => scaled.id.replace('~3~', `~${version}~`)),
  scaled.id.replace('elderwild-weapon', 'warden-longbow'), scaled.id.replace(/[a-f0-9]{16}/, '-'),
  scaled.id.replace('~60~', '~'), scaled.id.replace(/~0$/, '~6'), scaled.id + '~0',
]) {
  assert.equal(gearById(invalid), undefined); assert(!gearIdValid(invalid)); assert.equal(gearUpgradeQuote(invalid), null);
  assert.deepEqual(gearStatBreakdown(invalid), []);
}
for (const level of [49, 50.5, 61, NaN, Infinity]) assert.throws(() => rollGear('elderwild-weapon', 'rare', () => 0, level), /Invalid gear roll/);
assert.throws(() => rollGear('warden-longbow', 'rare', () => 0, 60), /Invalid gear roll/);
const baseId = 'warden-longbow', rolled = rollGear(baseId, 'mythic', random);
for (const invalid of [undefined, null, {}, '__proto__', 'constructor', 'unknown', rolled.id + '~1', rolled.id.replace('~2~', '~3~'),
  rolled.id.replace('~mythic~', '~divine~'), rolled.id.replace(/~0$/, '~6'), rolled.id.replace(/~0$/, '~-1'),
  rolled.id.replace(/[a-f0-9]{16}/, 'f'.repeat(17)), 'ranger-bow~1~mythic~0000000000000000~0', `${baseId}~1~mythic~-~1`, `${baseId}~1~uncommon~-~0`]) {
  assert.equal(gearById(invalid), undefined); assert(!gearIdValid(invalid)); assert.equal(gearUpgradeQuote(invalid), null);
}
let p = hero('Ranger', 10); p.ownedGear.push(rolled.id); p.equipment.weapon = rolled.id;
for (let level = 1; level <= MAX_GEAR_UPGRADE; level++) {
  const id = p.equipment.weapon, original = structuredClone(p), quote = gearUpgradeQuote(id), next = upgradeGear(p, id);
  assert(quote && next); assert.deepEqual(p, original, 'upgrade calculation does not mutate the current owner');
  assert.equal(next.gold, p.gold - quote.gold); assert.equal(next.equipment.weapon, quote.nextId);
  assert.equal(next.ownedGear.filter(owned => owned === quote.nextId).length, 1); assert(!next.ownedGear.includes(id));
  assert.equal(quote.next.upgradeLevel, level); assert.equal(quote.next.baseId, rolled.baseId);
  for (const [key, amount] of Object.entries(quote.materials)) assert.equal(next.inventory[key], p.inventory[key] - amount);
  for (const [key, value] of Object.entries(gearById(id).stats)) assert(quote.next.stats[key] > value, 'every existing attribute improves');
  assert.equal(upgradeGear(next, id), null, 'replaying the previous identity cannot charge again');
  assert.equal(upgradeGear({ ...p, gold: quote.gold - 1 }, id), null);
  assert.equal(upgradeGear({ ...p, inventory: { ...p.inventory, crystal: 0 } }, id), null);
  assert.equal(upgradeGear({ ...p, inventory: { ...p.inventory, crystal: Infinity } }, id), null);
  assert.equal(upgradeGear({ ...p, bank: { ...newBank(), gear: [quote.nextId] } }, id), null, 'existing next identity in bank is protected');
  p = JSON.parse(JSON.stringify(next));
}
assert.equal(gearUpgradeQuote(p.equipment.weapon), null); assert.equal(upgradeGear(p, p.equipment.weapon), null);
assert.equal(upgradeGear(p, 'ranger-bow'), null); assert.equal(upgradeGear(hero(), rolled.id), null);
assert.equal(upgradeGear({ ...p, appearance: { className: 'Mage' } }, p.equipment.weapon), null);
const legacy = hero(); legacy.ownedGear.push(baseId);
const legacyNext = upgradeGear(legacy, baseId); assert(legacyNext); assert.equal(gearById(legacyNext.ownedGear.at(-1)).upgradeLevel, 1);
assert.equal(gearById(legacyNext.ownedGear.at(-1)).quality, 'uncommon');
assert.equal(gearById(legacyNext.ownedGear.at(-1)).randomized, false);
legacy.ownedGear.push('rootforged-charm'); assert(upgradeGear(legacy, 'rootforged-charm'), 'crafted dungeon rewards also upgrade');
const upgradedId = p.equipment.weapon, item = { kind: 'gear', id: upgradedId, quantity: 1 };
assert(auctionItemValid(item) && bankItemValid(item)); assert.equal(auctionItemLabel(item), gearById(upgradedId).label);
assert(!auctionCanList(p, item)); p.equipment.weapon = starterGear('Ranger').equipment.weapon;
assert(auctionCanList(p, item)); const space = bagUsage(p), deposited = bankDeposit(p, item);
assert(deposited && bankPlayerValid(deposited)); assert.equal(bagUsage(deposited), space - 1);
assert.equal(gearById(JSON.parse(JSON.stringify(deposited.bank.gear[0]))).upgradeLevel, MAX_GEAR_UPGRADE);
assert.deepEqual(bankWithdraw(deposited, item), p, 'bank roundtrip keeps rolled stats and upgrade identity');
const buyer = hero('Ranger', 10); assert(auctionCanReceive(buyer, item)); assert(!auctionCanReceive(hero('Mage', 10), item)); assert(!auctionCanReceive(hero('Ranger', 1), item));
Object.assign(buyer, auctionItemChanges(buyer, item, 1)); assert(!auctionCanReceive(buyer, item)); assert(bagCanFit(buyer));
assert(!merchantStock('city-weaponsmith').some(gear => gear.id === upgradedId));
const fast = hero(); for (const slot of Object.keys(fast.equipment)) fast.equipment[slot] = upgradedId;
for (const slot of Object.keys(fast.equipment)) fast.equipment[slot] = 'warden-longbow~1~mythic~1234567890abcdef~5';
assert.equal(gearSpeedMultiplier(fast), 1.2, 'total movement bonus is capped at twenty percent');
assert.equal(gearSpeedMultiplier(hero()), 1);
assert.equal(Object.values(DUNGEON_CACHE_ODDS).reduce((sum, chance) => sum + chance, 0), 1);
const duplicates = { gold: 10, relic: 2, items: [
  { id: 'resource:relic', kind: 'resource', itemId: 'relic', quantity: 3, quality: 'rare' },
  { id: 'resource:crystal', kind: 'resource', itemId: 'crystal', quantity: 2, quality: 'uncommon' },
  { id: 'resource:crystal', kind: 'resource', itemId: 'crystal', quantity: 4, quality: 'uncommon' },
] }, originalDuplicates = structuredClone(duplicates);
assert.deepEqual(lootRows(duplicates).map(row => [row.id, row.quantity]), [['gold', 10], ['resource:relic', 5], ['resource:crystal', 6]]);
assert.deepEqual(duplicates, originalDuplicates, 'coalescing visible loot rows never changes the stored corpse');
for (const [roll, quality] of [[0, 'rare'], [.71, 'epic'], [.95, 'legendary'], [.999, 'mythic']]) {
  const owner = hero('Ranger', 10), rollCache = () => { let calls = 0; return rollDungeonCacheLoot(14, owner, () => calls++ === 0 ? 0 : roll); };
  const cache = rollCache(), gear = cache.find(row => row.kind === 'gear');
  assert.equal(gear.quality, quality); assert.equal(gearById(gear.itemId).requiredLevel, 10);
  assert(cache.some(row => row.itemId === 'crystal' && row.quantity >= 3)); assert(cache.some(row => row.itemId === 'relic' && row.quantity >= 1));
  owner.bank.gear.push(gear.itemId);
  const repeated = rollCache().find(row => row.kind === 'gear');
  assert.notEqual(repeated.itemId, gear.itemId, 'even repeated random values still produce a new cache reward');
}
for (const instanceId of [null, 'dungeon-1']) {
  const owner = hero(), before = structuredClone(owner), rows = rollMonsterLoot('moss-slime', 10, owner, () => 0, { worldBoss: false, instanceId });
  assert(rows.some(row => row.kind === 'gear' && gearById(row.itemId).baseId), 'real kills can roll new equipment');
  assert.deepEqual(owner, before); assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
}
for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) for (const [playerLevel, sourceLevel, expected] of [
  [50, 60, 50], [51, 49, 51], [55, 51, 53], [59, 60, 59], [60, 57, 59], [60, 58, 60], [60, 60, 60], [60, 48, 50], [60, 47, 40], [60, 30, 25], [100, 100, 60],
]) {
  const owner = hero(className, playerLevel), before = structuredClone(owner);
  for (const source of [{ worldBoss: false, instanceId: null }, { worldBoss: true, instanceId: null }, { worldBoss: false, instanceId: 'dungeon-1' }]) {
    const gear = rollMonsterLoot('moss-slime', sourceLevel, owner, () => 0, source).map(row => row.kind === 'gear' && gearById(row.itemId)).find(gear => gear?.randomized);
    assert(gear); assert.equal(gear.requiredLevel, expected); assert.equal(gear.className, className);
  }
  const cache = rollDungeonCacheLoot(sourceLevel, owner, () => 0).find(row => row.kind === 'gear'), gear = gearById(cache.itemId);
  assert.equal(gear.requiredLevel, expected); assert.deepEqual(owner, before);
  owner.ownedGear.push(cache.itemId);
  const second = rollDungeonCacheLoot(sourceLevel, owner, () => 0).find(row => row.kind === 'gear'); owner.bank.gear.push(second.itemId);
  const third = rollDungeonCacheLoot(sourceLevel, owner, () => 0).find(row => row.kind === 'gear'); owner.auctions.push({ item: { kind: 'gear', id: third.itemId, quantity: 1 } });
  const fourth = rollDungeonCacheLoot(sourceLevel, owner, () => 0).find(row => row.kind === 'gear');
  assert.equal(new Set([cache, second, third, fourth].map(row => row.itemId)).size, 4, 'owned, banked and auctioned collisions retain a guaranteed distinct reward');
  for (const row of [second, third, fourth]) assert.equal(gearById(row.itemId).requiredLevel, expected, 'collision walk retains item level');
}
assert.equal(WORLD_GEAR_ROLL_CHANCE, .06);
assert.equal(DUNGEON_GEAR_ROLL_CHANCE, .15);
for (const [instanceId, chance] of [[null, .06], ['dungeon-1', .15]]) for (const draw of [chance - Number.EPSILON, chance]) {
  const rows = rollMonsterLoot('treasure-goblin', 60, hero('Ranger', 60), () => draw, { worldBoss: false, instanceId });
  assert.equal(rows.filter(row => row.kind === 'gear').length, draw < chance ? 1 : 0, 'generic gear chance is halved once, with an exclusive upper boundary');
}
assert.deepEqual(WORLD_GEAR_ODDS, { common: .6, uncommon: .3, rare: .09, epic: .01 }, 'Legendary and Mythic remain exclusive to dungeon rolls');
for (let level = 51; level <= 60; level++) for (const [roll, quality] of [[.3, 'common'], [.75, 'uncommon'], [.95, 'rare'], [.995, 'epic'], [.999999, 'epic']]) {
  const draws = [.999999, .999999, .999999, 0, roll, 0, .4, .7];
  const gear = rollMonsterLoot('treasure-goblin', level - 2, hero('Ranger', level), () => draws.shift() ?? .5, { worldBoss: false, instanceId: null }).find(row => row.kind === 'gear');
  assert(gear); assert.equal(gear.quality, quality); assert.equal(gearById(gear.itemId).requiredLevel, level, 'all world rarities remain reachable through level 60');
}
const failedDraws = [.999999, .999999, .999999, WORLD_GEAR_ROLL_CHANCE];
assert(!rollMonsterLoot('treasure-goblin', 60, hero('Ranger', 60), () => failedDraws.shift() ?? 0, { worldBoss: false, instanceId: null }).some(row => row.kind === 'gear'), 'higher item levels do not increase the overall world gear chance');
let veteran = hero('Ranger', 60); veteran.ownedGear.push(scaled.id); veteran.equipment.weapon = scaled.id;
for (let upgrade = 1; upgrade <= MAX_GEAR_UPGRADE; upgrade++) {
  const id = veteran.equipment.weapon, quote = gearUpgradeQuote(id), next = upgradeGear(veteran, id);
  assert(next); assert.equal(quote.next.requiredLevel, 60); assert.equal(quote.next.upgradeLevel, upgrade);
  assert.equal(quote.gold, (20 + 60 * 5) * upgrade * upgrade);
  for (const row of gearStatBreakdown(quote.nextId)) assert.equal(row.total, row.base + row.roll + row.upgrade);
  assert.equal(upgradeGear({ ...veteran, level: 59 }, id), null, 'upgrading cannot bypass a scaled item level restriction');
  veteran = JSON.parse(JSON.stringify(next));
}
const veteranGear = gearById(veteran.equipment.weapon), veteranItem = { kind: 'gear', id: veteranGear.id, quantity: 1 };
assert.equal(gearUpgradeQuote(veteranGear.id), null); veteran.equipment.weapon = starterGear('Ranger').equipment.weapon;
assert(auctionCanList(veteran, veteranItem)); assert(bankItemValid(veteranItem));
const vaulted = JSON.parse(JSON.stringify(bankDeposit(veteran, veteranItem)));
assert(vaulted && bankPlayerValid(vaulted)); assert.deepEqual(gearById(vaulted.bank.gear[0]), veteranGear);
assert.deepEqual(bankWithdraw(vaulted, veteranItem), veteran);
const veteranBuyer = hero('Ranger', 60); assert(auctionCanReceive(veteranBuyer, veteranItem));
assert(!auctionCanReceive(hero('Ranger', 59), veteranItem)); assert(!auctionCanReceive(hero('Mage', 60), veteranItem));
Object.assign(veteranBuyer, auctionItemChanges(veteranBuyer, veteranItem, 1));
assert.deepEqual(gearById(JSON.parse(JSON.stringify(veteranBuyer)).ownedGear.at(-1)), veteranGear, 'auction and persistence retain level 60, the roll and all upgrades');
console.log('PASS: six gear rarities across all classes and slots through level 60, unchanged version 1/2 items and world rarity odds, scaled stats and breakdowns, source/player gates, strict identities, combat/speed, upgrades/replay/+5 cap, bank/auction/JSON persistence and collision-safe dungeon rewards.');
