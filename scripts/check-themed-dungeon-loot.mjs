import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { storyQuestProgress } from '../src/story-quests.ts';
import { THEMED_DUNGEON_ROSTERS } from '../src/bestiary.ts';
import { DUNGEONS, dungeonStages, dungeonLayout, getDungeon } from '../src/dungeon.ts';
import { GEAR, gearById, starterGear } from '../src/progression.ts';
import { LOOT_ITEMS, LOOT_TABLES, DUNGEON_CACHE_ODDS, DUNGEON_GEAR_DROP_CHANCES, LEGACY_DUNGEON_GEAR_DROP_CHANCE, DUNGEON_MIDPOINT_ODDS, DUNGEON_FINAL_ODDS, DUNGEON_GEAR_ROLL_CHANCE, WORLD_GEAR_ROLL_CHANCE, rollDungeonCacheLoot, rollMonsterLoot, isThemedDungeonLoot } from '../src/loot-items.ts';
const hero = (className, level) => ({ appearance: { className }, level, ...starterGear(className), bank: { gear: [] }, auctions: [] });
const gearRows = rows => rows.filter(row => row.kind === 'gear');
const rollReward = (level, owner, qualityDraw, options) => { const draws = [0, qualityDraw, 0, .2, .4]; return rollDungeonCacheLoot(level, owner, () => draws.shift() ?? 0, options); };
assert.deepEqual(DUNGEON_GEAR_DROP_CHANCES, { cache: .2, midpoint: .275, final: .35 });
assert.equal(DUNGEON_GEAR_ROLL_CHANCE, .15); assert.equal(WORLD_GEAR_ROLL_CHANCE, .06);
assert.equal(LEGACY_DUNGEON_GEAR_DROP_CHANCE, .5);
assert.deepEqual(DUNGEON_CACHE_ODDS, { rare: .7, epic: .24, legendary: .05, mythic: .01 });
assert.deepEqual(DUNGEON_MIDPOINT_ODDS, { rare: .5, epic: .4, legendary: .09, mythic: .01 });
assert.deepEqual(DUNGEON_FINAL_ODDS, { epic: .85, legendary: .14, mythic: .01 });
for (const id of ['rootvault', 'cindercrypt', 'frosthollow', 'nightroot', '__proto__', undefined]) assert(!isThemedDungeonLoot(id));
for (const [dungeonKind, kinds] of Object.entries(THEMED_DUNGEON_ROSTERS)) {
  assert(isThemedDungeonLoot(dungeonKind)); assert.equal(kinds.length, 12);
  const definition = DUNGEONS.find(d => d.id === dungeonKind);
  for (const kind of kinds) {
    assert(LOOT_TABLES[kind].length, `${kind}: actual themed supplies exist`);
    for (const rule of LOOT_TABLES[kind]) {
      assert(rule.chance > 0 && rule.chance <= 1); assert((rule.max ?? 1) <= 5, 'supplies retain small stack budgets');
      if (rule.kind === 'item') assert(LOOT_ITEMS[rule.itemId]);
      else assert(rule.kind === 'resource' && ['wood', 'herb', 'crystal', 'potion', 'relic'].includes(rule.itemId));
    }
    const rows = rollMonsterLoot(kind, definition.minLevel, hero('Ranger', 60), () => 0, { instanceId: 'run', dungeonKind });
    assert(rows.some(row => row.kind !== 'gear'), `${kind}: themed remains/materials are reachable`);
    assert(gearRows(rows).length === 1, 'ordinary themed monsters retain the single generic 15% equipment roll');
  }
  for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) for (const level of [definition.minLevel, definition.minLevel + 2, definition.maxLevel]) for (const ownerLevel of [definition.minLevel, 60]) {
    const owner = hero(className, ownerLevel), expected = Math.min(level, ownerLevel), before = structuredClone(owner);
    const generic = rollMonsterLoot(kinds[0], level, owner, () => 0, { instanceId: 'run', dungeonKind });
    for (const tier of ['cache', 'midpoint', 'final']) for (const draw of [0, .51, .91, .995]) {
      const rows = rollReward(level, owner, draw, { themed: true, tier }), equipment = gearRows(rows);
      assert.equal(equipment.length, 1, 'each successful reward roll yields exactly one usable piece');
      const gear = gearById(equipment[0].itemId);
      assert.equal(gear.requiredLevel, expected); assert.equal(gear.className, className);
      assert(['rare', 'epic', 'legendary', 'mythic'].includes(gear.quality)); if (tier === 'final') assert.notEqual(gear.quality, 'rare');
      assert(gear.stats && Object.values(gear.stats).every(n => Number.isSafeInteger(n) && n > 0));
      const duplicate = rollReward(level, owner, draw, { themed: true, tier, reservedGear: [gear.id] });
      assert.notEqual(gearRows(duplicate)[0].itemId, gear.id, 'uncollected gear identities remain reserved');
    }
    for (const row of gearRows(generic)) { const gear = gearById(row.itemId); assert.equal(gear.requiredLevel, expected); assert.equal(gear.className, className); }
    assert.deepEqual(owner, before, 'rolling loot never mutates a player or rerolls existing inventory');
  }
  for (const object of dungeonLayout(dungeonKind).objects.filter(object => object.kind === 'chest')) {
    const level = dungeonStages(dungeonKind).find(stage => stage.id === object.stageId).level;
    assert.equal(gearById(gearRows(rollDungeonCacheLoot(level, hero('Ranger', 60), () => 0, { themed: true }))[0].itemId).requiredLevel, level, 'side caches follow their own encounter level');
  }
  const owner = hero('Ranger', 60), midpoint = kinds.at(-2), level = definition.minLevel + 2;
  for (const draw of [.275 - Number.EPSILON, .275, .35 - Number.EPSILON, .35, .999]) {
    const source = { instanceId: 'run', dungeonKind, dungeonBoss: true, stageId: 'confluence' };
    const rows = rollMonsterLoot(midpoint, level, owner, () => draw, source);
    assert.equal(gearRows(rows).length, draw < .275 ? 1 : 0, 'midpoint has one 27.5% roll with no stacked ordinary roll');
    assert(rows.some(row => row.kind === 'resource' && row.itemId === 'relic'), 'midpoint supplies survive a gear miss');
    assert.equal(gearRows(rollMonsterLoot(kinds.at(-1), definition.maxLevel, owner, () => draw, { ...source, stageId: 'throne' })).length, 0, 'final death never rolls gear before the single completion reward');
  }
  // Force a bonus-quality collision against unclaimed equipment with a repeated seed.
  const draws = [...LOOT_TABLES[midpoint].flatMap(() => [0, 0]), 0, .999, 0, .2, .4];
  const first = gearRows(rollMonsterLoot(midpoint, level, owner, () => draws.shift() ?? 0, { instanceId: 'run', dungeonKind, dungeonBoss: true, stageId: 'confluence' }))[0];
  assert.equal(first.quality, 'mythic');
  const repeat = [...LOOT_TABLES[midpoint].flatMap(() => [0, 0]), 0, .999, 0, .2, .4];
  const second = gearRows(rollMonsterLoot(midpoint, level, owner, () => repeat.shift() ?? 0, { instanceId: 'run', dungeonKind, dungeonBoss: true, stageId: 'confluence', reservedGear: [first.itemId] }))[0];
  assert.notEqual(second.itemId, first.itemId, 'unclaimed rolls are reserved even with repeated random seeds');
}
for (const [tier, odds] of [['cache', DUNGEON_CACHE_ODDS], ['midpoint', DUNGEON_MIDPOINT_ODDS], ['final', DUNGEON_FINAL_ODDS]]) {
  const count = {};
  for (let i = 0; i < 1000; i++) {
    const row = gearRows(rollReward(35, hero('Knight', 35), (i + .5) / 1000, { themed: true, tier }))[0];
    count[row.quality] = (count[row.quality] ?? 0) + 1;
  }
  assert.deepEqual(count, Object.fromEntries(Object.entries(odds).map(([quality, chance]) => [quality, chance * 1000])), 'quality thresholds match the documented odds exactly');
}
for (const [themed, tier, chance] of [...Object.entries(DUNGEON_GEAR_DROP_CHANCES).map(([tier, chance]) => [true, tier, chance]), [false, 'cache', LEGACY_DUNGEON_GEAR_DROP_CHANCE]]) {
  let hits = 0;
  for (let i = 0; i < 1000; i++) { const draws = [(i + .5) / 1000, 0, 0, .2, .4]; hits += gearRows(rollDungeonCacheLoot(35, hero('Ranger',35), () => draws.shift() ?? 0, { themed, tier })).length; }
  assert.equal(hits, chance * 1000, 'overall gear drop rate has one chance roll');
  for (const draw of [chance - Number.EPSILON, chance, 1 - Number.EPSILON]) {
    let calls=0;const rows=rollDungeonCacheLoot(35,hero('Ranger',35),()=>{calls++;return draw;},{themed,tier});
    assert.equal(gearRows(rows).length, draw < chance ? 1 : 0, 'exact chance boundary fails and the preceding value succeeds');
    assert(rows.some(row=>row.itemId==='crystal') && rows.some(row=>row.itemId==='relic'), 'failed equipment roll still gives upgrade supplies');
    if(draw>=chance){assert.equal(calls,1,'misses never roll rarity, template or identity');assert.deepEqual(rows.map(row=>[row.itemId,row.quantity]),[['crystal',11],['relic',3]],'gear misses preserve exact supplies');}
  }
}
for (const [level, expected] of [[30,25],[35,25],[40,40],[45,40],[55,57]]) {
  const owner = hero('Ranger', 60);
  assert.equal(gearById(gearRows(rollDungeonCacheLoot(level, owner, () => 0))[0].itemId).requiredLevel, expected, 'legacy caches retain their previous template/source+2 level selection');
}
assert.equal(Object.values(GEAR).filter(gear => gear.requiredLevel === 30).length, 0, 'scaled rolls reuse existing assets rather than adding duplicate gear catalogues');
// Completion rewards live in their own persistent result row; a nearly expired
// boss corpse keeps its original loot and cannot consume the clear reward.
const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const advanceSource = serverSource.match(/  function advanceStoryChamber\([^]*?\n  \}/)[0] + '\n' + serverSource.match(/  function advanceDungeons\([^]*?\n  \}/)[0];
for (const kind of ['rootvault', 'plagueworks', 'emberfall', 'veilhaven']) {
  const definition=getDungeon(kind),player={...hero('Ranger',60),id:'owner',x:0,z:0,hp:100,achievements:{dungeons:{}},contracts:{}},session={player,instanceId:'run'};
  const dungeon={id:'run',kind,members:[player.id],cleared:new Set(dungeonStages(kind).map(stage=>stage.id)),spawned:new Set(),hazards:[],completed:false,startedAt:1000,elapsedMs:299000,roster:[{id:player.id}],partySize:1,kills:7,wipes:0};
  const drop={id:'corpse',ownerId:player.id,instanceId:'run',enemyId:'boss',items:[],expiresAt:301000},originalCorpse=JSON.stringify(drop),lootDrops=new Map([[drop.id,drop]]);let awards=0;
  const records=new Map(),ctx={storyQuestProgress,Date:{now:()=>300000},Math,structuredClone,randomUUID:()=>kind+'-clear',realmId:'eu',pendingDungeonRecords:records,dungeons:new Map([[dungeon.id,dungeon]]),sessions:new Map([[player.id,session]]),enemies:[],dungeonStages,dungeonLayout,getDungeon,lootDrops,rollDungeonCacheLoot,isThemedDungeonLoot,
    reservedLootGear:()=>[],spawnDungeonStages(){},contractProgress(){},addXp(){awards++;return definition.completionXp;},event(){},dirty(){}};
  const advance=runInNewContext(`${advanceSource}\nadvanceDungeons`,ctx);advance(300000);
  assert.equal(JSON.stringify(drop),originalCorpse,'clear rewards never reroll or overwrite the boss corpse');
  const result=dungeon.results.get(player.id),reward=lootDrops.get(result.lootId);
  assert.equal(reward.expiresAt,Number.MAX_SAFE_INTEGER,'unclaimed clear rewards survive an old boss corpse expiring');
  assert.equal(reward.enemyId,'run-completion');assert.equal(result.durationMs,299000);assert.deepEqual(result.items,reward.items);assert.equal(records.size,1);
  const saved=JSON.stringify([...lootDrops]);advance(310000);assert.equal(JSON.stringify([...lootDrops]),saved,'already-completed runs never reroll loot');assert.equal(awards,1);
}
console.log('PASS themed dungeon loot: all 36 monster tables, four classes/three level bands, exact owner-capped encounter levels, side-cache levels, unchanged legacy/world selection, 15% generic rolls, exact cache/midpoint/final odds, single chance-based boss rolls with supplies on failure and collision-safe saved identities.');
