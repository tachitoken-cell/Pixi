import assert from 'node:assert/strict';
import { CONTRACTS, RECIPES, MAX_ACTIVE_CONTRACTS, BOARD_POSITION, WORKSHOP_POSITION, DUNGEON_ENTRANCE, newContracts, validateContracts, acceptContract, cancelContract, contractProgress, claimContract, recipeAllowed, craftingProgress, craftingXpGain, nextCraftingUnlock } from '../src/adventure.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { RESOURCE_TYPES } from '../src/skills.ts';
import { ROOTVAULT_ENTRANCE } from '../src/dungeon.ts';
import { OVERWORLD_SPAWNS, toWorld } from '../src/realm.ts';
import { WORLD_GATHERING_NODES } from '../src/gathering-nodes.ts';
import { surfaceAt } from '../src/landscape.ts';
import { monsterSpawnLevel } from '../src/bestiary.ts';

const now = 1700000000000, catalogs = JSON.stringify({ CONTRACTS, RECIPES });
const zones = ['greenwood', 'amberwild', 'frostmarch', 'hollow'];
assert.deepEqual(BOARD_POSITION, { x: 3, z: 2 });
assert.deepEqual(WORKSHOP_POSITION, { x: -4, z: 3 });
assert.deepEqual(toWorld('hollow', DUNGEON_ENTRANCE), ROOTVAULT_ENTRANCE);
assert.equal(new Set(CONTRACTS.map(c => c.id)).size, CONTRACTS.length);
assert.equal(new Set(RECIPES.map(r => r.id)).size, RECIPES.length);
for (const zone of zones) {
  const contracts = CONTRACTS.filter(c => c.zone === zone && !c.requiredLevel);
  assert.ok(contracts.length >= 3 && contracts.length <= 4, `${zone} has a compact regional board`);
  assert.ok(contracts.some(c => c.kind === 'kill') && contracts.some(c => c.kind === 'gather'));
}
assert.ok(CONTRACTS.some(c => c.zone === 'greenwood' && c.kind === 'craft' && c.target === 'trail-tonic'));
assert.ok(CONTRACTS.some(c => c.zone === 'hollow' && c.kind === 'dungeon' && c.target === 'root-vault'));
for (const contract of CONTRACTS) {
  const level=contract.requiredLevel??1;
  const home=contract.targetRegion&&(contract.kind==='kill'?OVERWORLD_SPAWNS:WORLD_GATHERING_NODES).find(home=>
    home.zone===contract.zone&&(contract.target==='*'||home.kind===contract.target)&&surfaceAt(home.x,home.z).regionId===contract.targetRegion
    &&(contract.targetLevel===undefined||monsterSpawnLevel(home,contract.targetRegion)>=contract.targetLevel));
  if(contract.targetRegion)assert.ok(home,`${contract.id} has a real eligible target in its required region`);
  const context=home?{zone:home.zone,regionId:surfaceAt(home.x,home.z).regionId,...(contract.kind==='kill'?{level:monsterSpawnLevel(home,contract.targetRegion)}:{})}:undefined;
  const acceptAtLevel=(state,id,zone,at)=>acceptContract(state,id,zone,at,level);
  const progressAtLocation=(state,kind,target,amount)=>contractProgress(state,kind,target,amount,context);
  assert.ok(Number.isSafeInteger(contract.count) && contract.count > 0);
  assert.ok(Number.isSafeInteger(contract.cooldownMs) && contract.cooldownMs > 0);
  assert.ok([contract.reward.xp, contract.reward.gold].every(n => Number.isSafeInteger(n) && n > 0));
  if (contract.kind === 'gather') assert.ok(RESOURCE_TYPES[contract.target], 'gather contracts name real resources');
  if (contract.kind === 'craft' && contract.target !== '*') assert.ok(RECIPES.some(r => r.id === contract.target));
  const state = newContracts();
  assert.ok(validateContracts(state));
  if(contract.requiredLevel){
    assert.equal(acceptContract(state,contract.id,contract.zone,now,level-1),false,'frontier level requirements are authoritative');
    assert.equal(acceptContract(state,contract.id,contract.zone,now),false,'missing level cannot bypass frontier requirements');
  }
  assert.equal(acceptAtLevel(state, contract.id, zones.find(z => z !== contract.zone), now), false);
  assert.ok(acceptAtLevel(state, contract.id, contract.zone, now));
  assert.equal(acceptAtLevel(state, contract.id, contract.zone, now), false, 'accepting twice cannot reset progress');
  assert.equal(claimContract(state, contract.id, contract.zone, now), null, 'unfinished work cannot pay');
  assert.equal(progressAtLocation(state, 'unknown', contract.target), false);
  const target = contract.target === '*' ? 'trail-tonic' : contract.target;
  if(contract.targetRegion){
    assert.equal(contractProgress(state,contract.kind,target),false,'frontier jobs require authoritative location context');
    assert.equal(contractProgress(state,contract.kind,target,1,{...context,regionId:'greenwood'}),false,'starter actions cannot complete frontier jobs');
    if(contract.targetLevel)assert.equal(contractProgress(state,contract.kind,target,1,{...context,level:contract.targetLevel-1}),false,'low-level kills cannot complete frontier patrols');
  }
  for (const amount of [0, -1, 0.5, NaN, Infinity, '2']) assert.equal(progressAtLocation(state, contract.kind, target, amount), false);
  assert.equal(state.active[contract.id], 0);
  assert.ok(progressAtLocation(state, contract.kind, target));
  const progress = state.active[contract.id];
  assert.equal(acceptAtLevel(state, contract.id, contract.zone, now), false);
  assert.equal(state.active[contract.id], progress);
  progressAtLocation(state, contract.kind, target, Number.MAX_SAFE_INTEGER);
  assert.equal(state.active[contract.id], contract.count, 'progress caps without numeric overflow');
  assert.equal(progressAtLocation(state, contract.kind, target), false, 'completed work cannot keep increasing');
  assert.equal(claimContract(state, contract.id, zones.find(z => z !== contract.zone), now), null, 'claim at the correct regional board');
  const ready = structuredClone(state);
  const cancelled = structuredClone(ready);
  assert.ok(cancelContract(cancelled, contract.id), 'ready unclaimed contracts can be cancelled');
  assert.deepEqual(cancelled, newContracts(), 'cancellation discards progress without creating a cooldown');
  assert.equal(claimContract(cancelled, contract.id, contract.zone, now), null, 'cancelled work cannot pay');
  assert.ok(acceptAtLevel(cancelled, contract.id, contract.zone, now), 'cancelled contracts can immediately be accepted again');
  assert.equal(cancelled.active[contract.id], 0, 'accepting again starts from zero');
  for (const invalidNow of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal(claimContract(state, contract.id, contract.zone, invalidNow), null, 'invalid or overflowing cooldown timestamps reject');
    assert.deepEqual(state, ready);
  }
  assert.equal(claimContract(state, contract.id, contract.zone, now), contract);
  assert.equal(state.completed[contract.id], now + contract.cooldownMs);
  assert.equal(Object.hasOwn(state.active, contract.id), false);
  assert.equal(claimContract(state, contract.id, contract.zone, now), null, 'replayed claim never pays');
  assert.equal(acceptAtLevel(state, contract.id, contract.zone, now + contract.cooldownMs - 1), false);
  assert.ok(acceptAtLevel(state, contract.id, contract.zone, now + contract.cooldownMs), 'contract repeats at the cooldown boundary');
  assert.equal(state.active[contract.id], 0);
  assert.ok(validateContracts(JSON.parse(JSON.stringify(state))), 'active repeat and old completion history survive serialization');
  const history = structuredClone(state.completed);
  assert.ok(cancelContract(state, contract.id));
  assert.deepEqual(state.completed, history, 'cancellation preserves previous completion history');
  assert.equal(cancelContract(state, contract.id), false, 'replayed cancellation does not change state');
  assert.deepEqual(JSON.parse(JSON.stringify(state)), { active: {}, completed: history }, 'cancelled state survives serialization');
}
const capacity = newContracts(), green = CONTRACTS.filter(c => c.zone === 'greenwood');
for (const c of green.slice(0, MAX_ACTIVE_CONTRACTS)) assert.ok(acceptContract(capacity, c.id, c.zone, now));
assert.equal(acceptContract(capacity, green[3].id, 'greenwood', now), false, 'at most three contracts can be active');
contractProgress(capacity, green[0].kind, green[0].target, green[0].count);
claimContract(capacity, green[0].id, 'greenwood', now);
assert.ok(acceptContract(capacity, green[3].id, 'greenwood', now), 'claiming frees one board slot');
const parallel = newContracts();
acceptContract(parallel, 'greenwood-tonics', 'greenwood', now);
acceptContract(parallel, 'frostmarch-supplies', 'frostmarch', now);
contractProgress(parallel, 'craft', 'travelers-kit');
assert.deepEqual(parallel.active, { 'greenwood-tonics': 0, 'frostmarch-supplies': 1 });
contractProgress(parallel, 'craft', 'trail-tonic');
assert.deepEqual(parallel.active, { 'greenwood-tonics': 1, 'frostmarch-supplies': 2 }, 'one valid action can advance matching and wildcard contracts');
const untouched = structuredClone(parallel);
assert.equal(contractProgress(parallel, 'craft', ''), false);
assert.equal(acceptContract(parallel, '__proto__', 'greenwood', now), false);
assert.equal(claimContract(parallel, '__proto__', 'greenwood', now), null);
for (const invalidId of [undefined, null, 0, [], {}, ['greenwood-tonics'], '', 'unknown', '__proto__', 'constructor', 'greenwood-hunt']) {
  assert.equal(cancelContract(parallel, invalidId), false, 'only an accepted string ID can be cancelled');
}
assert.deepEqual(parallel, untouched);
assert.ok(cancelContract(parallel, 'greenwood-tonics'), 'partly progressed work can be cancelled');
assert.deepEqual(parallel.active, { 'frostmarch-supplies': 2 }, 'other active contracts retain progress');
assert.ok(cancelContract(capacity, green[1].id));
assert.ok(acceptContract(capacity, green[0].id, 'greenwood', now + green[0].cooldownMs), 'cancelling frees a full journal slot');

const id = CONTRACTS[0].id;
const malformed = [null, [], true, '', {}, { active: {} }, { active: {}, completed: {}, extra: 0 },
  { active: [], completed: {} }, { active: {}, completed: [] }, { active: { missing: 0 }, completed: {} },
  { active: {}, completed: { missing: now } }, JSON.parse('{"active":{"__proto__":0},"completed":{}}'),
  { active: Object.create({ [id]: 0 }), completed: {} },
  { active: Object.fromEntries(green.map(c => [c.id, 0])), completed: {} },
  ...[-1, NaN, Infinity, '0', 0.5, CONTRACTS[0].count + 1].map(value => ({ active: { [id]: value }, completed: {} })),
  ...[-1, NaN, Infinity, '0', 0.5, Number.MAX_SAFE_INTEGER + 1].map(value => ({ active: {}, completed: { [id]: value } })),
];
for (const state of malformed) {
  assert.equal(validateContracts(state), false, 'malformed contracts are never accepted as saved state');
  assert.equal(acceptContract(state, id, 'greenwood', now), false);
  assert.equal(cancelContract(state, id), false);
  assert.equal(contractProgress(state, 'kill', 'moss-slime'), false);
  assert.equal(claimContract(state, id, 'greenwood', now), null);
}
const first = newContracts(), second = newContracts();
first.active[id] = 1;
assert.deepEqual(second, { active: {}, completed: {} }, 'new characters receive independent contract state');

const player = className => ({ level: 60, craftingXp: 50 * 49 ** 2, carriedItems: { 'gnarled-bark': 99, 'frost-shard': 99 }, appearance: { className }, ownedGear: starterGear(className).ownedGear,
  inventory: { wood: 200, crystal: 200, herb: 200, relic: 2, potion: 3 } });
for (const recipe of RECIPES) {
  assert.ok(Object.keys({...recipe.cost, ...recipe.itemCost}).length && Object.values({...recipe.cost, ...recipe.itemCost}).every(n => Number.isSafeInteger(n) && n > 0));
  assert.ok(Number.isSafeInteger(recipe.craftingXp) && recipe.craftingXp > 0);
  assert.equal([recipe.output.gear, recipe.output.resource, recipe.output.item].filter(Boolean).length, 1, 'a recipe has one output kind');
  if (recipe.output.gear) assert.ok(GEAR[recipe.output.gear], 'equipment outputs exist in the gear catalog');
  else assert.ok((recipe.output.item ? LOOT_ITEMS[recipe.output.item] : ['wood','crystal','herb','potion'].includes(recipe.output.resource)) && Number.isSafeInteger(recipe.output.quantity) && recipe.output.quantity > 0);
  const p = player(recipe.className || 'Ranger'), before = structuredClone(p);
  assert.ok(recipeAllowed(p, recipe), `${recipe.id} is craftable with its required materials`);
  assert.deepEqual(p, before, 'eligibility does not consume ingredients or grant output');
  assert.equal(recipeAllowed(p, { ...recipe, cost: {} }), false, 'forged recipes cannot bypass catalog ingredients');
  assert.equal(recipeAllowed({ ...p, level: recipe.requiredLevel - 1 }, recipe), false);
  if (recipe.requiredCraftingLevel > 1) assert.equal(recipeAllowed({ ...p, craftingXp: 50 * (recipe.requiredCraftingLevel - 1) ** 2 - 1 }, recipe), false, 'adventure level cannot bypass crafting rank');
  if (recipe.className) assert.equal(recipeAllowed(player(['Ranger', 'Knight', 'Mage'].find(c => c !== recipe.className)), recipe), false);
  for (const [resource, quantity] of Object.entries(recipe.cost)) {
    for (const amount of [quantity - 1, -1, NaN, Infinity, '99']) assert.equal(recipeAllowed({ ...p, inventory: { ...p.inventory, [resource]: amount } }, recipe), false);
  }
  for (const [item, quantity] of Object.entries(recipe.itemCost || {}))
    for (const amount of [quantity - 1, -1, NaN, Infinity, '99']) assert.equal(recipeAllowed({ ...p, carriedItems: { ...p.carriedItems, [item]: amount } }, recipe), false, 'refinement requires valid carried ingredients');
  if (recipe.output.gear) assert.equal(recipeAllowed({ ...p, ownedGear: [...p.ownedGear, recipe.output.gear] }, recipe), false, 'owned gear cannot be crafted twice');
  else assert.equal(recipeAllowed({ ...p, ...(recipe.output.item ? { carriedItems: { ...p.carriedItems, [recipe.output.item]: Number.MAX_SAFE_INTEGER } } : { inventory: { ...p.inventory, [recipe.output.resource]: Number.MAX_SAFE_INTEGER } }) }, recipe), false, 'output cannot overflow saved inventory');
}
for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
  let xp = 0;
  for (const id of ['woodland-remedies', 'moonpetal-remedies', 'frostbloom-remedies', 'sunblossom-remedies']) {
    const recipe = RECIPES.find(recipe => recipe.id === id), target = nextCraftingUnlock(className, xp)?.level ?? 99;
    let crafts = 0;
    while (craftingProgress(xp).level < target && crafts < 200) {
      assert(recipeAllowed({ ...player(className), level: 1, craftingXp: xp }, recipe), 'repeatable skill progression does not require adventure leveling or unique gear');
      const gain = craftingXpGain(recipe, xp); assert(gain > 0); xp += gain; crafts++;
    }
    assert.equal(craftingProgress(xp).level, target, 'each rank reaches its successor without a dead end or thousands of crafts');
    assert.equal(craftingXpGain(recipe, xp), 0, 'mastered recipes award no more skill XP');
  }
}
const relicRecipe = RECIPES.find(r => r.id === 'rootforged-sigil');
assert.deepEqual(relicRecipe.cost, { relic: 2, crystal: 5, wood: 3 });
assert.deepEqual(relicRecipe.output, { gear: 'rootforged-charm' });
assert.equal(GEAR[relicRecipe.output.gear].price, 0, 'the dungeon reward is not ordinary purchasable gear');
for (const className of ['Ranger', 'Knight', 'Mage']) assert.ok(recipeAllowed(player(className), relicRecipe));
assert.equal(recipeAllowed({ ...player('Ranger'), inventory: { wood: 20, crystal: 20, herb: 20, potion: 3 } }, relicRecipe), false, 'relic crafting requires actual dungeon materials');
assert.equal(JSON.stringify({ CONTRACTS, RECIPES }), catalogs, 'rule calls do not mutate shared content');
console.log('PASS: regional repeatable contracts with real eligible enemy and resource homes; three active slots; exact/wildcard capped progress; cancellation discards only accepted progress, frees slots, preserves cooldown history and permits fresh acceptance; once-only claim and cooldown boundaries; strict saved-state rejection; four crafting ranks with reachable repeatable progression, refinement and gear recipes, class/level/material/ownership/overflow checks; dungeon relic equipment reward.');
