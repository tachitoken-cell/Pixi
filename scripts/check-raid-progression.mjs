import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {newRaidProgress,raidProgressValid,raidRewardChanges,rollRaidRewards,raidProgressionChanges,awardSpecialistXp,SP_UPGRADE_ODDS,specialistJobLevel,activeSpecialist,SPECIALISTS_ENABLED}=await import('../src/raid-progression.ts');
const {storeRewardChanges,SP_STORE_PRODUCTS,mobileRewardChanges}=await import('../src/ingame-store.ts');
const {starterGear,combatStats}=await import('../src/progression.ts');
const {newBags}=await import('../src/bags.ts');
const {renderRaidProgression,raidProgressionAction}=await import('../src/raid-progression-ui.ts');
hook.deregister();
const player={id:'hero',level:60,appearance:{className:'Knight'},...starterGear('Knight'),...newBags(),ownedPets:[],inventory:{wood:0,crystal:10000,herb:0,potion:0,relic:10000},carriedItems:{},achievements:{dungeons:{veilhaven:1}},talents:[],raidProgress:newRaidProgress()};
const apply=(message,random=()=>0)=>Object.assign(player,raidProgressionChanges(player,message,random,()=> 'card-one').changes);
assert(raidProgressValid(undefined));assert(!raidProgressValid({...newRaidProgress(),sigils:-1}));
const all=rollRaidRewards(()=>0);assert.equal(all.length,9);assert.equal(all.find(item=>item.id==='raid-sigil').quantity,3);
assert.deepEqual(rollRaidRewards(()=>.999).map(item=>item.id),['raid-sigil','death-defier']);
assert.throws(()=>rollRaidRewards(()=>1));
const before=structuredClone(player);const rewards=raidRewardChanges(player,'run-one',all);assert.deepEqual(player,before,'reward preparation never mutates live state before durable save');Object.assign(player,rewards);
assert(raidProgressValid(player.raidProgress));assert.equal(player.raidProgress.clears,1);assert(player.ownedPets.includes('death-apostle'));assert(player.raidProgress.pendingHorns);
assert.deepEqual(raidRewardChanges(player,'run-one',all),{},'retry cannot award twice');
Object.assign(player,raidRewardChanges(player,'run-two',all));assert.equal(player.raidProgress.sigils,16,'five duplicate collectables each convert to two sigils');
apply({type:'raidClaimHorns'});assert(player.ownedGear.includes('death-horns'));assert(!player.raidProgress.pendingHorns);
apply({type:'raidSpUnlock'});assert.equal(player.raidProgress.specialists.length,1);assert.throws(()=>apply({type:'raidSpUnlock'}));
const upgrade=protect=>({type:'raidSpUpgrade',specialistId:'card-one',protect,expectedUpgrade:player.raidProgress.specialists[0].upgrade,expectedAttempts:player.raidProgress.specialists[0].attempts});
let card=player.raidProgress.specialists[0];
assert.equal(SPECIALISTS_ENABLED,false);assert.equal(player.raidProgress.activeSpecialistId,null,'newly claimed cards cannot activate');
card.jobXp=180500;player.raidProgress.activeSpecialistId=card.id;
const suspended=structuredClone(player);
assert.equal(activeSpecialist(player.raidProgress,'Knight'),undefined);
awardSpecialistXp(player,500);awardSpecialistXp(player,1e9);assert.deepEqual(player,suspended,'old active cards retain their saved XP without gaining more');
assert.throws(()=>apply({type:'raidSpEquip',specialistId:card.id}),/temporarily disabled/);assert.deepEqual(player,suspended);
for(const className of ['Knight','Ranger','Mage','Cleric']){
 const hero={...structuredClone(player),appearance:{className},...starterGear(className)};Object.assign(hero.raidProgress.specialists[0],{className,upgrade:15});
 assert.deepEqual(combatStats(hero),combatStats({...hero,raidProgress:undefined}),`${className} gets no SP power or defense from a saved active card`);
}
assert.equal(specialistJobLevel(card.jobXp),20,'saved job level remains readable');
const initialStats=combatStats(player),request=upgrade(false);apply(request);assert.equal(player.raidProgress.specialists[0].upgrade,1);assert.throws(()=>apply(request),'stale clicks cannot spend or reroll');
assert.deepEqual(combatStats(player),initialStats,'upgrading a suspended specialist grants no combat bonus');
apply(upgrade(false));card=player.raidProgress.specialists[0];assert.equal(card.upgrade,2);
const failure=structuredClone(player);const prepared=raidProgressionChanges(player,upgrade(false),()=>.999);assert.deepEqual(player,failure,'a failed save does not consume materials or protection');Object.assign(player,prepared.changes);
card=player.raidProgress.specialists[0];assert(card.broken);assert.equal(card.upgrade,2);assert.equal(card.jobXp,180500);assert.equal(player.raidProgress.activeSpecialistId,null);
assert.throws(()=>apply(upgrade(false)));player.carriedItems['sp-revival-core']=1;apply({type:'raidSpRepair',specialistId:card.id});assert(!player.raidProgress.specialists[0].broken);assert.equal(player.carriedItems['sp-revival-core'],0);
player.carriedItems['sp-protection-roll']=1;apply(upgrade(true),()=>.999);assert(!player.raidProgress.specialists[0].broken);assert.equal(player.raidProgress.specialists[0].upgrade,2);assert.equal(player.carriedItems['sp-protection-roll'],0);
for(let rank=0;rank<15;rank++){
 const test=structuredClone(player);test.raidProgress.specialists[0].upgrade=rank;test.raidProgress.specialists[0].attempts=0;test.raidProgress.sigils=1000;
 const msg={type:'raidSpUpgrade',specialistId:'card-one',protect:false,expectedUpgrade:rank,expectedAttempts:0};
 const success=raidProgressionChanges(test,msg,()=>SP_UPGRADE_ODDS[rank][0]/100-1e-8);assert.equal(success.changes.raidProgress.specialists[0].upgrade,rank+1);
 const fail=raidProgressionChanges(test,msg,()=>SP_UPGRADE_ODDS[rank][0]/100);assert.equal(fail.changes.raidProgress.specialists[0].upgrade,rank);
}
player.raidProgress.evolutionCores=10;player.raidProgress.souls=1;for(let stage=1;stage<=3;stage++){apply({type:'raidPetEvolve'});assert.equal(player.raidProgress.petEvolution,stage);}assert.equal(player.raidProgress.evolutionCores,0);assert.equal(player.raidProgress.souls,0);assert.throws(()=>apply({type:'raidPetEvolve'}));
apply({type:'raidCosmeticEquip',cosmetic:'apostle-wings',equipped:true});assert(player.raidProgress.equippedCosmetics.includes('apostle-wings'));
player.raidProgress.specialists=[];player.raidProgress.activeSpecialistId=null;assert.throws(()=>apply({type:'raidSpUnlock'}),'selling the quest card cannot farm free specialists');
for(const product of SP_STORE_PRODUCTS){
 const order={productId:product.id,status:'delivered'};const reward=storeRewardChanges(player,order);assert.equal(reward.reward.kind,'sp-item');assert.equal(reward.changes.carriedItems[product.itemId],(player.carriedItems[product.itemId]||0)+1);
 assert.throws(()=>storeRewardChanges(player,{...order,status:'processed'}),'paid items wait for chain finality');assert.throws(()=>storeRewardChanges(player,{...order,reward:reward.reward}),'receipt replay rejected');
 assert.throws(()=>mobileRewardChanges(player,order),'no unsupported native purchase path');
 const full={...player,ownedGear:Array.from({length:16},(_,i)=>`full-${i}`),equipment:{},inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{}};
 assert.throws(()=>storeRewardChanges(full,order),/Make room/,'full inventory cannot lose paid item');
}
const html=renderRaidProgression(suspended);assert(html.includes('Protection Rolls'));assert(html.includes('Specialist classes are temporarily disabled'));assert.match(html,/data-raid-progression="equip"[^>]*disabled>SP disabled/);assert.deepEqual(raidProgressionAction({raidProgression:'upgrade',specialistId:'card-one',upgrade:'2',attempts:'5',protect:'true'}),{type:'raidSpUpgrade',specialistId:'card-one',expectedUpgrade:2,expectedAttempts:5,protect:true});
console.log('PASS raid progression: nine rewards, immutable/replay-safe receipts, duplicate conversion, horns, persistent class claim, suspended activation, XP and combat bonuses, all 15 odds boundaries, fracture/protection/repair, paid item finality/replay/bag safety, all pet evolutions and UI actions.');

const evolutionHero={...player,ownedPets:['death-apostle'],raidProgress:{...newRaidProgress(),evolutionCores:6,petEvolution:2,souls:0,cosmetics:['apostle-wings'],equippedCosmetics:[]}};
const evolutionHtml=renderRaidProgression(evolutionHero);
assert.match(evolutionHtml,/Apostle cosmetics <small>1 \/ 3 collected/);
assert.equal([...evolutionHtml.matchAll(/class="is-complete" aria-label="Stage/g)].length,2);
assert.match(evolutionHtml,/Apostle’s Souls: 0 \/ 1/);
assert.match(evolutionHtml,/data-raid-progression="evolve"[^>]*disabled/,'cores alone cannot enable the final evolution');
assert.doesNotMatch(renderRaidProgression({...evolutionHero,raidProgress:{...evolutionHero.raidProgress,souls:1}}),/data-raid-progression="evolve"[^>]*disabled/);
for(const image of ['wings','aura','weapon'])assert(evolutionHtml.includes(`/ui/raid/${image}.png`));
assert.equal([...evolutionHtml.matchAll(/data-raid-progression="cosmetic"/g)].length,3);
assert.equal([...evolutionHtml.matchAll(/data-raid-progression="evolve"/g)].length,1);
console.log('PASS raid collection composition: real cosmetic count/art, single authoritative actions, evolution stages and soul requirement.');
