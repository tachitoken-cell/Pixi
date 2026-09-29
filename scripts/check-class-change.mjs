import { SPECIALISTS_ENABLED } from '../src/specialist-classes.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { classChangeChanges } = await import('../src/class-change.ts');
const { CHARACTER_CLASSES } = await import('../src/shared.ts');
const { GEAR, EQUIPMENT_SLOTS, TALENTS, TALENT_VERSION, starterGear, maxHealth, rollGear, gearUpgradeQuote, availableTalentPoints, earnedTalentPoints, talentsValid } = await import('../src/progression.ts');
const { auctionCanReceive } = await import('../src/auction.ts');
const { BANK_CAPACITY, newBank, bankItems, bankPlayerValid } = await import('../src/bank.ts');
const { bagItems, bagCapacity, bagUsage, bagsValid, newBags } = await import('../src/bags.ts');
const { spellsForClass, defaultHotbar, hotbarValid, extendedHotbar } = await import('../src/spells.ts');
hook.deregister();

function fresh(className = 'Ranger') {
  const learnedSpells = spellsForClass(className).map(spell => spell.id);
  return {
    id: 'unchanged-character', name: 'Keeper', appearance: { className, skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', race: 'elf', gender: 'female', outfit: '#577956', accent: '#d8b36a' },
    zone: 'greenwood', x: 32, z: 71, rotation: 1, level: 60, xp: 0, gold: 8765, hp: 77, maxHp: 808,
    ...starterGear(className), ...newBags(), bank: newBank(), inventory: { wood: 2, crystal: 4, potion: 3, herb: 8, relic: 1 }, carriedItems: { 'trail-bread': 2 },
    learnedSpells, hotbar2: [learnedSpells[0], ...Array(7).fill(null)], hotbar: defaultHotbar(className, 60, learnedSpells), talents: [Object.values(TALENTS).find(t => t.className === className && t.requiredBranchPoints === 0 && !t.prerequisite).id], talentVersion: TALENT_VERSION,
    quest: { chapter: 1, stage: 2, kills: 7, progress: { 'grove-slimes': 5 }, completed: false }, onboarding: { completed: true },
    craftingXp: 233, skills: { fishing: 11, mining: 22, woodcutting: 33, herbalism: 44 }, contracts: { accepted: ['kept-contract'] },
    ridingRank: 2, ownedMounts: ['horse'], ownedPets: ['fox'], summonedPet: 'fox', nftPets: ['dragon'], zeppelinPorts: ['greenwood', 'amberwild'],
    abilityCooldowns: { [learnedSpells[0]]: 987654321 }, globalCooldownUntil: 123456789, itemUseReadyAt: 2468,
    auctions: [], storeOrders: [{ id: 'unused-paid-class-credit', state: 'processed' }], achievements: ['kept-achievement'],
  };
}
function geared(className) {
  const player = fresh(className);
  for (const slot of EQUIPMENT_SLOTS) {
    const item = Object.values(GEAR).find(gear => gear.slot === (slot.startsWith('ring') ? 'ring' : slot)
      && (!gear.className || gear.className === className) && gear.requiredLevel > 1 && !player.ownedGear.includes(gear.id));
    if (item) { player.ownedGear.push(item.id); player.equipment[slot] = item.id; }
  }
  const rolled = rollGear(player.equipment.weapon, 'rare', () => 0.12345);
  const upgraded = gearUpgradeQuote(rolled.id).nextId;
  player.ownedGear = player.ownedGear.map(id => id === player.equipment.weapon ? upgraded : id);
  player.equipment.weapon = upgraded; player.maxHp = maxHealth(player); player.hp = player.maxHp;
  assert(bagsValid(player)); assert(bankPlayerValid(player)); assert(talentsValid(player));
  return player;
}
function assertTransition(player, target) {
  const before = structuredClone(player), changes = classChangeChanges(player, target);
  assert(changes, `${player.appearance.className} to ${target} can be prepared`);
  assert.deepEqual(player, before, 'preparing a class change never mutates the live player or paid credit');
  const next = { ...player, ...changes }, expectedStarters = starterGear(target);
  assert.deepEqual(next.equipment, expectedStarters.equipment, 'all previous equipment, including shared jewelry, is unequipped');
  const allGear = [...next.ownedGear, ...next.bank.gear];
  assert.equal(new Set(allGear).size, allGear.length, 'gear identity stays unique across inventory and bank');
  assert.deepEqual(new Set(allGear), new Set([...player.ownedGear, ...player.bank.gear, ...expectedStarters.ownedGear]), 'old gear and its rolls/upgrades are preserved exactly');
  for (const id of Object.values(player.equipment).filter(Boolean)) assert(bagItems(next).includes(id) || next.bank.gear.includes(id), 'every old equipped item moves to inventory or bank');
  assert.deepEqual(next.learnedSpells, spellsForClass(target).filter(spell => spell.requiredLevel === 1).map(spell => spell.id));
  assert.deepEqual(next.hotbar, defaultHotbar(target, next.level, next.learnedSpells).slice(0,8));
  assert.deepEqual(next.hotbar2,Array(8).fill(null),'changing class clears foreign-class spells from the second bank');
  assert.deepEqual(next.hotbarExtra,[null,null]);assert.deepEqual(next.hotbar2Extra,[null,null],'class changes reset both extra-slot tails');
  assert(hotbarValid(extendedHotbar(next.hotbar,next.hotbarExtra), target, next.level, next.learnedSpells)); assert(talentsValid(next));
  assert.equal(availableTalentPoints(next), earnedTalentPoints(player.level));
  assert.equal(next.talentVersion, TALENT_VERSION); assert.deepEqual(next.talents, []);
  assert.equal(next.maxHp, maxHealth(next)); assert.equal(next.hp, Math.min(player.hp, next.maxHp), 'swapping never heals');
  assert.deepEqual(next.appearance, { ...player.appearance, className: target }, 'all other customization survives');
  for (const key of Object.keys(player)) if (!Object.hasOwn(changes, key)) assert.deepEqual(next[key], before[key], `${key} survives unchanged`);
  assert(bagsValid(next)); assert(bankPlayerValid(next));
  return next;
}
for (const source of CHARACTER_CLASSES) for (const target of CHARACTER_CLASSES) if (source !== target) assertTransition(geared(source), target);
assert.equal(assertTransition(fresh(), 'Mage').hp, 77, 'a wounded player receives no healing');
assert.deepEqual(assertTransition(fresh(), 'Mage').bank, newBank(), 'inventory room avoids unnecessary bank transfers');

let repeated = fresh();
for (const target of ['Mage', 'Knight', 'Cleric', 'Ranger', 'Mage', 'Ranger']) {
  repeated = assertTransition(repeated, target);
  repeated.learnedSpells = spellsForClass(target).map(spell => spell.id);
  repeated.hotbar = defaultHotbar(target, repeated.level, repeated.learnedSpells);
}
assert.equal(repeated.ownedGear.length, 8, 'repeated changes reuse all four sets of basic gear');
const banked = fresh(); banked.bank.gear.push(...starterGear('Mage').ownedGear);
const unbanked = assertTransition(banked, 'Mage');
assert.equal(unbanked.bank.gear.length, 0, 'existing banked starter gear is reused');

const full = fresh(), starterIds = new Set(CHARACTER_CLASSES.flatMap(c => starterGear(c).ownedGear));
const fillers = Object.keys(GEAR).filter(id => !starterIds.has(id));
full.ownedGear.push(...fillers.slice(0, bagCapacity(full) - bagUsage(full)));
assert.equal(bagUsage(full), bagCapacity(full));
const bankFillers = fillers.filter(id => !full.ownedGear.includes(id));
full.bank.gear = bankFillers.slice(0, BANK_CAPACITY - 2);
const overflowed = assertTransition(full, 'Mage');
assert.equal(bankItems(overflowed.bank).length, BANK_CAPACITY, 'exact overflow fits remaining bank slots');
assert.equal(bagUsage(overflowed), bagCapacity(overflowed));
assert.deepEqual(overflowed.bank.gear.slice(-2), full.ownedGear.slice(0, 2), 'only formerly equipped items move to bank');
const noRoom = structuredClone(full); noRoom.bank.gear.push(bankFillers[BANK_CAPACITY - 2]);
const beforeNoRoom = structuredClone(noRoom);
assert.equal(classChangeChanges(noRoom, 'Mage'), null, 'insufficient combined storage refuses the entire transition');
assert.deepEqual(noRoom, beforeNoRoom, 'capacity refusal preserves equipment, training, and paid credit');
const bankedFull = structuredClone(full); bankedFull.bank.gear.push(...starterGear('Mage').ownedGear);
assert.equal(bankItems(bankedFull.bank).length, BANK_CAPACITY);
assertTransition(bankedFull, 'Mage');

const formerClassItem = { kind: 'gear', id: Object.values(GEAR).find(gear => gear.className === 'Ranger' && gear.requiredLevel > 1).id, quantity: 1 };
const changedSeller = assertTransition(fresh(), 'Mage');
assert(!auctionCanReceive(changedSeller, formerClassItem), 'purchasing off-class gear remains forbidden');
assert(auctionCanReceive(changedSeller, formerClassItem, true), 'cancelling the owner\'s old-class listing can return its item');
const fullSeller = structuredClone(changedSeller);
fullSeller.ownedGear.push(...fillers.filter(id => id !== formerClassItem.id && !fullSeller.ownedGear.includes(id)).slice(0, bagCapacity(fullSeller) - bagUsage(fullSeller)));
assert.equal(bagUsage(fullSeller), bagCapacity(fullSeller));
assert(!auctionCanReceive(fullSeller, formerClassItem, true), 'owner returns still require inventory capacity');

for (const target of ['Ranger', 'Unknown', '', null, {}, '__proto__']) assert.equal(classChangeChanges(fresh(), target), null, 'same/invalid class is rejected');
for (const changes of [{ level: 0 }, { level: 61 }, { hp: 0 }, { hp: NaN }, { bank: null }, { ownedGear: ['missing-item'] }, { appearance: { className: 'Unknown' } }]) {
  const invalid = { ...fresh(), ...changes }, before = structuredClone(invalid);
  assert.equal(classChangeChanges(invalid, 'Mage'), null); assert.deepEqual(invalid, before);
}

// Execute the actual snapshot identity update and avatar refresh condition with browser boundaries stubbed.
const client = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const snapshotStart = client.indexOf('    const oldHp=player?.hp??100');
assert(snapshotStart >= 0);
const snapshotIdentity = client.slice(snapshotStart, client.indexOf('    if(selectedBagItem', snapshotStart));
const refreshAvatar = client.match(/    if\(oldEquipment!==JSON\.stringify\(player\.equipment\).*replaceAvatar\(\);/)?.[0];
assert(refreshAvatar);
const raidAppearance = client.match(/^function raidAppearance\(.*$/m)?.[0];
assert(raidAppearance);
function snapshot(next, automaticGuide = true) {
  const previous = fresh(), calls = [], context = { SPECIALISTS_ENABLED, player: previous, authoritative: next, appearance: previous.appearance, guideTargetId: automaticGuide ? 'old-trainer' : undefined, guideKey: 'keeper:train-spell', autoAttackTarget: 'old-target' };
  context.replaceAvatar = () => calls.push(context.appearance.className);
  context.updateShopSales = () => {};
  runInNewContext(`${stripTypeScriptTypes(raidAppearance)}\n${snapshotIdentity}\n${refreshAvatar}`, context);
  return { ...context, calls };
}
const changed = snapshot({ ...fresh(), ...classChangeChanges(fresh(), 'Mage') });
assert.equal(changed.appearance.className, 'Mage'); assert.deepEqual(changed.calls, ['Mage'], 'avatar builds using the new authoritative class');
assert.equal(changed.guideKey, '', 'automatic trainer guidance rebuilds for the new class'); assert.equal(changed.autoAttackTarget, null);
const manual = snapshot({ ...fresh(), ...classChangeChanges(fresh(), 'Mage') }, false);
assert.equal(manual.guideKey, 'keeper:train-spell', 'manual waypoint is preserved');
assert.equal(snapshot(fresh()).calls.length, 0, 'unchanged snapshots do not rebuild the avatar');
const recolored = fresh(); recolored.appearance.outfit = '#112233';
assert.deepEqual(snapshot(recolored).calls, ['Ranger'], 'appearance-only updates refresh the avatar too');
console.log('PASS class change: all 12 class pairs, exact gear preservation, inventory/bank overflow, immutable refusal, repeated training reset, no duplicate starter gear or healing, retained progress, and authoritative client appearance/guidance.');
