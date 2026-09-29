import assert from 'node:assert/strict';
import { LOOT_ITEMS, LOOT_TABLES, rollMonsterLoot, rollDungeonCacheLoot, lootRows, gearLootQuality, carriedItemsValid } from '../src/loot-items.ts';
import { MONSTERS, THEMED_DUNGEON_ROSTERS } from '../src/bestiary.ts';
import { GEAR, GEAR_SETS, gearById, starterGear } from '../src/progression.ts';
import { bagItems, bagCanFit, bagUsage, newBags } from '../src/bags.ts';
import { merchantStock, gearSellPrice } from '../src/merchants.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { auctionItemValid } from '../src/auction.ts';

const player=(className='Ranger',level=50)=>({level,appearance:{className},...starterGear(className),...newBags(),carriedItems:{},inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0}});
assert.deepEqual(Object.keys(LOOT_TABLES).sort(),Object.keys(MONSTERS).sort(),'every monster has its own table');
assert.equal(Object.values(LOOT_ITEMS).filter(item=>!['pet','mount'].includes(item.category)).length,28);
assert.equal(Object.values(LOOT_ITEMS).filter(item=>item.category==='pet').length,25);
const fishingFoodQualities={'brook-trout':'common','silver-carp':'uncommon','glacial-char':'uncommon',moonfin:'rare'};
const qualities=new Set(),themedKinds=new Set(Object.values(THEMED_DUNGEON_ROSTERS).flat());
for(const [id,item] of Object.entries(LOOT_ITEMS)){
 assert.equal(id,item.id);assert(Number.isSafeInteger(item.sellPrice)&&(['pet','mount'].includes(item.category)||['moss-voucher','treasure-map','sp-protection-roll','sp-revival-core','sp-specialist-case','heatproof-tonic'].includes(item.id)?item.sellPrice===0:item.sellPrice>0));qualities.add(item.quality);
 if(item.category==='junk')assert.equal(item.quality,'uncommon','requested junk grade is uncommon');
 if(item.category==='food'){assert(item.heal>0);assert.equal(item.quality,fishingFoodQualities[id]??'common','fish quality follows its gathering tier; existing foods stay common');}
}
assert.deepEqual([...qualities].sort(),['common','epic','rare','uncommon']);
for(const [kind,rules] of Object.entries(LOOT_TABLES)){
 if(kind==='training-dummy'){assert.deepEqual(rules,[]);assert.deepEqual(rollMonsterLoot(kind,60,player(),()=>0,{worldBoss:false,instanceId:null}),[]);continue;}
 assert(rules.length>1);
 if(themedKinds.has(kind))assert(rules.some(rule=>rule.kind!=='gear'&&rule.chance>0),'themed supplies have reachable outcomes without forcing guaranteed drops');
 else assert(rules.some(rule=>rule.chance===1),'legacy guaranteed supplies are retained');
 for(const rule of rules){assert(rule.chance>0&&rule.chance<=1);assert((rule.min||1)<=(rule.max||rule.min||1));
  if(rule.kind==='item')assert(LOOT_ITEMS[rule.itemId]);else if(rule.kind==='resource')assert(['potion','wood','crystal','herb','relic'].includes(rule.itemId));else assert(qualities.has(rule.itemId));
 }
 for(const calling of ['Ranger','Knight','Mage','Cleric'])for(const level of [1,3,6,8,10,12,25,40,50]){
  const p=player(calling,level),before=JSON.stringify(p),rows=rollMonsterLoot(kind,level,p,()=>0);
  assert.equal(JSON.stringify(p),before,'rolling does not award or mutate inventory');
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length,'one stable claim id per row');
  for(const row of rows){assert(row.quantity>=1);assert.equal(row.id,`${row.kind}:${row.itemId}`);
   if(row.kind==='gear'){const gear=gearById(row.itemId);assert(!gear.className||gear.className===calling);assert(gear.requiredLevel<=level);assert(!p.ownedGear.includes(gear.id));assert.equal(row.quality,gearLootQuality(gear));}
  }
  for(const stash of [{ownedGear:Object.keys(GEAR)}, {bank:{gear:Object.keys(GEAR)}}, {auctions:Object.keys(GEAR).map(id=>({item:{kind:'gear',id,quantity:1}}))}])
   assert.deepEqual(rollMonsterLoot(kind,level,{...p,...stash},()=>0),rows,'owned, banked and auctioned catalog gear cannot suppress a drop');
 }
 const minimum=rollMonsterLoot(kind,50,player(),()=>.999999);
 assert(minimum.every(row=>rules.some(rule=>rule.chance===1&&(rule.kind==='gear'?row.kind==='gear':rule.itemId===row.itemId))),'failed optional rolls stay absent');
}
const additions=Object.values(GEAR).filter(gear=>gear.dropOnly&&gear.id!=='death-horns'),reachable=new Set();
assert.equal(GEAR['death-horns'].requiredLevel,60);assert.equal(GEAR['death-horns'].price,0);assert.equal(gearSellPrice('death-horns'),0);
for(const npc of VILLAGE_NPCS)assert(!merchantStock(npc.id).some(gear=>gear.id==='death-horns'),'raid horns are not merchant stock');
assert.equal(additions.length,128);assert.equal(new Set(additions.map(gear=>gear.model)).size,64);
assert.equal(new Set(additions.map(gear=>gear.icon)).size,128);assert.equal(new Set(additions.map(gear=>gear.description)).size,128);
assert.equal(GEAR_SETS.length,20);assert.equal(Object.values(GEAR).filter(gear=>gear.setId).length,160);
for(const gear of Object.values(GEAR).filter(gear=>!gear.dropOnly)){
 const legacyQuality=gear.id==='rootforged-charm'?'rare':gear.setId?gear.requiredLevel>=40?'epic':gear.requiredLevel>=25?'rare':'uncommon':gear.requiredLevel===1||gear.price===0?'common':'uncommon';
 assert.equal(gearLootQuality(gear),legacyQuality,`${gear.id}: legacy rarity is preserved`);
}
for(const className of ['Ranger','Knight','Mage','Cleric'])for(const level of [1,3,8,10]){
 const p=player(className,level),band=additions.filter(gear=>gear.className===className&&gear.requiredLevel===level);
 assert.equal(band.length,8);assert.equal(new Set(band.map(gear=>gear.slot)).size,8);
 for(let pick=0;pick<64;pick++){
  let calls=0;
  // Force each chance to pass, then sweep the two gear-selection draws.
  for(const row of rollMonsterLoot('moss-slime',Math.max(1,level-2),p,()=>[8,13].includes(++calls)?pick/64:0))if(row.kind==='gear')reachable.add(gearById(row.itemId).baseId);
 }
 for(const gear of band)assert(reachable.has(gear.id),`${gear.id}: reachable from a real monster table`);
}
for(const gear of additions){
 const name=gear.label.trim().toLowerCase().replace(/\s+/g,' ');
 assert.equal(Object.values(GEAR).filter(other=>other.label.trim().toLowerCase().replace(/\s+/g,' ')===name).length,1,`${gear.id}: a unique authored name, including legacy gear`);
 assert.equal(gear.icon,gear.id);assert(gear.description.length>=35&&gear.description.endsWith('.'),'every new item has its own description');
 assert(!gear.setId);assert.equal(gear.quality,gear.requiredLevel===1||gear.requiredLevel===8?'common':'uncommon');
 assert.equal(gearLootQuality(gear),gear.quality);assert(gear.price>0&&gearSellPrice(gear.id)>0);
 assert(auctionItemValid({kind:'gear',id:gear.id,quantity:1}),'drop gear can be traded on the auction market');
 assert.match(gear.model,/^drop-(ranger|knight|mage|cleric)-(common|uncommon)-(head|body|legs|shoes|back|necklace|ring|weapon)$/);
 const values=Object.values(gear.stats),combatKeys=['primaryDamage','specialDamage','damage','defense','speed'],total=Object.entries(gear.stats).filter(([key])=>combatKeys.includes(key)).reduce((sum,[,value])=>sum+value,0);
 for(const key of ['strength','agility','intellect','stamina','spirit'])assert((gear.stats[key]??0)<=Math.max(1,Math.ceil(gear.requiredLevel/12))*(gear.slot==='weapon'||gear.slot==='armor'?2:1),'catalog primary attributes retain small slot and level budgets');
 assert(values.length&&values.every(value=>Number.isSafeInteger(value)&&value>0));
 assert(total<=(gear.slot==='weapon'?20:5),'ordinary loot keeps modest bonuses');
 if(gear.requiredLevel===1)assert(total<=3,'early common gear gives only a small bonus');
 if(gear.slot==='weapon'&&gear.requiredLevel===3){
  const shop=GEAR[{Ranger:'warden-longbow',Knight:'sunsteel-sword',Mage:'starfall-staff',Cleric:'dawnlight-mace'}[gear.className]];
  assert.equal(total,Object.entries(shop.stats).filter(([key])=>combatKeys.includes(key)).reduce((sum,[,value])=>sum+value,0)+1,'early uncommon weapons add just one point over the first shop upgrade');
  assert(Object.entries(shop.stats).every(([stat,value])=>gear.stats[stat]>=value));
 }
 for(const later of Object.values(GEAR).filter(other=>!other.dropOnly&&other.requiredLevel>=25&&other.className===gear.className&&other.slot===gear.slot&&['rare','epic'].includes(gearLootQuality(other)))){
  const stats=['primaryDamage','specialDamage','defense'];
  assert(!(stats.every(stat=>(gear.stats[stat]||0)>=(later.stats[stat]||0))&&stats.some(stat=>(gear.stats[stat]||0)>(later.stats[stat]||0))),`${gear.id}: low-tier drops must not strictly dominate ${later.id}`);
 }
 const previous=additions.find(other=>other.className===gear.className&&other.slot===gear.slot&&other.requiredLevel===(gear.requiredLevel===10?8:1));
 if(gear.requiredLevel>1)assert(total>Object.entries(previous.stats).filter(([key])=>combatKeys.includes(key)).reduce((sum,[,value])=>sum+value,0),`${gear.id}: a modest upgrade over its common baseline`);
}
for(const npc of VILLAGE_NPCS.filter(npc=>npc.role==='merchant'))assert(merchantStock(npc.id).every(gear=>!gear.dropOnly),'monster drops are absent from every merchant');
for(const className of ['Ranger','Knight','Mage','Cleric']){
 const p=player(className,50),rows=rollMonsterLoot('moss-slime',50,p,()=>0).filter(row=>row.kind==='gear');
 assert.equal(gearById(rows.find(row=>row.quality==='common').itemId).requiredLevel,8,'higher level monsters select the later common band');
 assert.equal(gearById(rows.find(row=>row.quality==='uncommon').itemId).requiredLevel,12,'existing later uncommon sets keep their place');
 p.ownedGear.push(...Object.values(GEAR).filter(gear=>(!gear.className||gear.className===className)&&((gearLootQuality(gear)==='common'&&gear.requiredLevel===8)||(gearLootQuality(gear)==='uncommon'&&gear.requiredLevel===12))).map(gear=>gear.id));
 assert.deepEqual(rollMonsterLoot('moss-slime',50,p,()=>0).filter(row=>row.kind==='gear'),rows,'owning the current band still awards that band');
 const low=player(className,1);assert(!rollMonsterLoot('moss-slime',50,low,()=>0).some(row=>row.kind==='gear'&&gearById(row.itemId).requiredLevel>1),'a strong monster never bypasses player level');
 assert(rollMonsterLoot('moss-slime',1,player(className,3),()=>0).some(row=>row.kind==='gear'&&row.quality==='uncommon'&&gearById(row.itemId).requiredLevel===3),'early enemies occasionally yield an uncommon upgrade');
}
assert.deepEqual(Object.fromEntries(Object.entries(LOOT_TABLES).map(([kind,rules])=>[kind,rules.filter(rule=>rule.kind==='gear').map(rule=>[rule.itemId,rule.chance])]).filter(([,rules])=>rules.length)),{
 'moss-slime':[['common',.04],['uncommon',.015]],'briar-sentinel':[['uncommon',.05]],'ice-wisp':[['rare',.04]],'root-warden':[['uncommon',.325],['rare',.125]],
 'bramble-wolf':[['common',.06],['uncommon',.02]],'briar-boar':[['common',.06],['uncommon',.02]],'grove-spider':[['common',.05],['uncommon',.02]],
 'ember-beetle':[['uncommon',.06]],'dune-scorpion':[['uncommon',.07]],'stone-golem':[['uncommon',.1]],'frost-yeti':[['rare',.1]],'crystal-bat':[['uncommon',.06]],
 'marsh-toad':[['common',.06],['uncommon',.02]],'void-stalker':[['rare',.12],['epic',.02]],'briarhorn-elder':[['uncommon',.5],['rare',.075]],
 'rimefang-matriarch':[['rare',.5]],'stormhorn-behemoth':[['rare',.5],['epic',.1]],'ashen-crown-titan':[['rare',.5],['epic',.25]],
},'all authored equipment chances are halved; supplies retain their own probabilities');
for(const [kind,rules] of Object.entries(LOOT_TABLES))for(const rule of rules.filter(rule=>rule.kind==='gear'))for(const draw of [rule.chance-Number.EPSILON,rule.chance]){
 const rows=rollMonsterLoot(kind,60,player('Ranger',60),()=>draw);
 assert.equal(rows.filter(row=>row.kind==='gear'&&row.quality===rule.itemId).length,draw<rule.chance?1:0,`${kind}/${rule.itemId}: gear chance is halved once, with an exclusive upper boundary`);
}
const p=player(),drop={gold:8,relic:2,items:rollMonsterLoot('moss-slime',1,p,()=>0)};
// Tracing must observe the exact same rolls, including short-circuited gear and pet branches.
function tracedRollCheck(roll, seed) {
 const draws=[],events=[];let state=seed,calls=0;
 const expected=roll(()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;const draw=seed===0?0:seed===-1?.999999:state/0x100000000;draws.push(draw);return draw;});
 const actual=roll(()=>{assert(calls<draws.length,'tracing must not add RNG calls');return draws[calls++];},event=>events.push(event));
 assert.deepEqual(actual,expected,'tracing preserves every rolled item and quantity');
 assert.equal(calls,draws.length,'tracing must not remove RNG calls');
 assert(events.length,'tracing produces an explanation');
 return events;
}
for(const kind of Object.keys(LOOT_TABLES))for(const seed of [0,-1,123456]){
 const owner=player('Ranger',60);
 tracedRollCheck((random,trace)=>rollMonsterLoot(kind,40,owner,random,{instanceId:null,worldBoss:true,trace}),seed);
 owner.ownedGear=Object.keys(GEAR);
 tracedRollCheck((random,trace)=>rollMonsterLoot(kind,40,owner,random,{instanceId:'run',worldBoss:false,trace}),seed);
}
for(const [dungeonKind,kinds] of Object.entries(THEMED_DUNGEON_ROSTERS))for(const stageId of ['confluence','throne'])for(const seed of [0,-1,123456]){
 tracedRollCheck((random,trace)=>rollMonsterLoot(kinds.at(-1),40,player('Ranger',60),random,{instanceId:'run',dungeonKind,dungeonBoss:true,stageId,trace}),seed);
}
for(const themed of [false,true])for(const tier of ['cache','midpoint','final'])for(const seed of [0,-1,123456]){
 tracedRollCheck((random,trace)=>rollDungeonCacheLoot(40,player('Mage',60),random,{themed,tier,trace}),seed);
}
const exhausted={...player('Ranger',60),ownedGear:Object.keys(GEAR)},rollTrace=tracedRollCheck((random,trace)=>rollMonsterLoot('stone-golem',40,exhausted,random,{instanceId:null,trace}),0);
const staticGear=rollTrace.find(event=>event.stage==='static-gear');
assert.equal(staticGear.reason,'eligible');assert.equal(staticGear.className,'Ranger');
assert.equal(staticGear.minLevel,12);assert.equal(staticGear.maxLevel,42);assert(staticGear.bandCount>0);assert.equal(staticGear.eligibleCount,staticGear.bandCount);
assert(rollTrace.some(event=>event.stage==='table-rule'&&event.ruleItemId==='uncommon'&&event.draw===0&&event.chance===.1&&event.passed&&event.awarded),'successful fixed roll awards a separate copy even with the entire catalog owned');
assert(rollTrace.some(event=>event.stage==='extra-gear'&&event.source==='world'&&event.draw===0&&event.chance===.06&&event.passed));
assert(rollTrace.some(event=>event.stage==='gear-quality'&&event.draw===0&&event.quality==='common'));
assert(rollTrace.some(event=>event.stage==='pet'&&event.itemId==='geode-hedgehog'&&event.draw===0&&event.chance===.00025&&event.passed));
assert(rollTrace.at(-1).items.some(item=>item.kind==='gear'&&item.itemId.includes('~')),'random gear remains possible after exhausting the static band');
assert.equal(lootRows(drop)[0].id,'gold');assert.equal(lootRows(drop)[1].id,'resource:relic');
assert.deepEqual(lootRows(drop),lootRows(drop),'opening the same corpse does not roll new items');
assert.deepEqual(lootRows({gold:0,relic:0,items:[]}),[]);
p.carriedItems={'slime-residue':2,'trail-bread':1};assert(carriedItemsValid(p));assert(bagItems(p).includes('item:slime-residue'));assert.equal(bagUsage(p),3);
assert(bagCanFit(p,{carriedItems:{'slime-residue':10000}}),'loot items stack');
assert(!carriedItemsValid({...p,carriedItems:{forged:1}}));assert(!bagCanFit(p,{carriedItems:{'slime-residue':-1}}));assert(!bagCanFit(p,{carriedItems:{'slime-residue':Number.MAX_SAFE_INTEGER+1}}));
const full=player();full.ownedGear.push(...Object.values(GEAR).filter(g=>!full.ownedGear.includes(g.id)).slice(0,15).map(g=>g.id));assert.equal(bagUsage(full),16);
assert(!bagCanFit(full,{carriedItems:{'trail-bread':1}}),'new loot stacks require real bag space');
console.log(`PASS: all ${Object.keys(LOOT_TABLES).length} monster tables, 128 uniquely named and described common/uncommon gear upgrades with individual icon keys, four classes/eight slots, 64 model roots, modest authored stats, level bands, repeat drops despite ownership/bank/auction holdings, drop-only stock, sale value, legacy rarity, halved gear rates, stable rows and bag validation.`);
