import { dungeonBounds, dungeonStages, inDungeonPreparation } from '../src/dungeon.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { storeRewardChanges, storeActivationChanges, storeBoostMultiplier, STORE_BOOST_DURATION_MS } from '../src/ingame-store.ts';
import { starterGear, combatStats, maxHealth, MAX_LEVEL, talentRank } from '../src/progression.ts';
import { SKILLS, RESOURCE_TYPES, MAX_SKILL_XP, skillProgress, canGather, gatheringUnlocks, gatheringXpGain, professionRank } from '../src/skills.ts';
import { RECIPES, recipeAllowed, recipeOutput, craftingProgress, craftingXpGain, WORKSHOP_POSITION } from '../src/adventure.ts';
import { spellsForClass, SPELLS, TALENT_EFFECT_IDS, spellDamage, spellPeriodicDamage, spellTargetMultiplier } from '../src/spells.ts';
import { AUTO_ATTACKS, autoAttackDamage, autoAttackTiming } from '../src/auto-attacks.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { MONSTERS, monsterLevelScale } from '../src/bestiary.ts';
import { bagCanFit } from '../src/bags.ts';
import { goldSource, craftingGoldCost } from '../src/gold-economy.ts';
import { TREASURE_MAP } from '../src/treasure-maps.ts';
import { rollDungeonMount } from '../src/travel.ts';
import { createLootTrace } from '../src/loot-trace.mjs';
import { awardSpecialistXp } from '../src/raid-progression.ts';

// Execute the shipped reward/impact functions. Payment signatures, finality and saved receipts are covered by check-store-consumables-server.mjs.
const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const extract=name=>{const body=source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))?.[0];assert(body,`${name} exists`);return body;};
const realNow=Date.now;let clock=2_000_000;Date.now=()=>clock;
const noop=()=>{},distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const hero=()=>({id:'boost-hero',name:'Tester',appearance:{className:'Ranger'},level:25,hp:1000,maxHp:1000,xp:0,gold:1000,x:0,z:0,zone:'greenwood',talents:[],...starterGear('Ranger'),
 inventory:{wood:100,crystal:100,herb:100,relic:0,potion:0},skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,carriedItems:{},achievements:{gathered:0,crafted:0,kills:0},contracts:{},ownedMounts:[],ownedPets:[],storePurchases:[],storeConsumables:{},storeBoosts:{}});
function boost(player,ids){for(const boostId of ids){const delivered={status:'delivered',productId:`store-${boostId}`};Object.assign(player,storeRewardChanges(player,delivered,clock).changes);Object.assign(player,storeActivationChanges(player,boostId,clock));}return player;}
const session=player=>({player,instanceId:null,lifeStartedAt:1,socket:{readyState:1},abilityCooldowns:{},recordKey:player.id});
function runtime(extra={}){
 const events=[],hits=[],context={instantCombat:{enemyKilled:()=>false,actionError:()=>null,recordAction(){},clearMovementImpairments(){}},Date,Math,structuredClone,economyVersion:0,goldSource,craftingGoldCost,awardSpecialistXp,changeGold:(player,delta)=>{player.gold+=delta;},completeTraining:async(s,changes,description,onPersist)=>{const {goldReason,...state}=structuredClone(typeof changes==='function'?changes():changes),achievements=s.player.achievements;Object.assign(s.player,state,{achievements});onPersist?.(s.player.hp);events.push({kind:'reward',text:description});return true;},storeBoostMultiplier,combatStats,maxHealth,MAX_LEVEL,talentRank,TALENT_EFFECT_IDS,spellsForClass,SKILLS,RESOURCE_TYPES,MAX_SKILL_XP,skillProgress,canGather,gatheringUnlocks,gatheringXpGain,professionRank,
 RECIPES,recipeAllowed,recipeOutput,craftingProgress,craftingXpGain,WORKSHOP_POSITION,bagCanFit,SPELLS,spellDamage,spellPeriodicDamage,spellTargetMultiplier,AUTO_ATTACKS,autoAttackDamage,combatTiming,autoAttackTiming,MONSTERS,monsterLevelScale,
 WebSocket:{OPEN:1},MOUNT_UNLOCK_LEVEL:25,MOUNT_UPGRADE_LEVEL:50,rollDungeonMount,mountRandomInt:()=>assert.fail('ordinary enemies cannot roll dungeon mounts'),CHASE_DISTANCE:100,GLOBAL_ATTACK_MS:0,distance,sessions:new Map(),pendingHits:[],dungeons:new Map(),nodes:[],gatheringClaims:new Map(),committingAccounts:new Map(),lootTrace:createLootTrace({realmId:'test'}),
 WORLD_COLLIDERS:[],WORLD_BOUNDS:{},depletedResources:{},overworldCollisionKey:'boost-fixture',updateCollisionSceneState:noop,dungeonBounds,dungeonStages,inDungeonPreparation,dungeonPreparing:s=>inDungeonPreparation(s.player),instanceColliders:()=>[],instanceBounds:()=>({}),canTraverse:()=>true,physicalReach:(session,target,range)=>distance(session.player,target)<=range,swimming:()=>false,waterAt:()=>false,insideCity:()=>false,gmObserver:()=>false,arenaMode:()=>false,duelMember:()=>null,
 liveSession:()=>true,combatInstanceActive:()=>true,hostileTargetValid:()=>true,combatTargetLife:target=>target.lifeStartedAt??1,autoAttackPaused:()=>false,autoAttackInRange:()=>true,autoAttackTargetValid:()=>true,worldBossCombatAllowed:()=>true,
 activeCompanion:()=>null,enemyCombatCompanion:()=>null,healCompanion:noop,raids:{enemyKilled:()=>false},
 broadcast:noop,event:(_s,kind,text)=>events.push({kind,text}),send:noop,dirty:noop,stand:noop,playerDied:noop,checkAchievements:noop,restoreHealth:noop,cancelCast:noop,cancelBasicHits:noop,creditObjective:noop,contractProgress:noop,storyQuestProgress:noop,recordReferralGameplay:noop,surfaceAt:()=>({regionId:'test'}),
 applyDamage:(target,kind,amount)=>{target.hp=Math.max(0,target.hp-amount);hits.push({kind,amount});},auctionOwners:()=>[],...extra};
 const names=['combatSaveBlocked','auctionItemsRetained','addXp','grantChapterReward','cancelGathering','finishGathering','mapGuardianAllowed','combatTalentState','chilledTarget','changeDotRate','expireBurning','scheduleDot','queueTalentHit','applyTalentHit','applyHarmEdict','advanceKnightCharge','resolveKnightTimer','resolveEdictTimer','combatDefense','resolveHits','releaseCast','startAutoAttacks','updateDungeonHazards','resolveEnemyAttack'];
 runInNewContext(source.match(/^  const auctionFinalityMessage = .*;$/m)[0]+'\n'+source.match(/^  const talentEffectRank = .*;$/m)[0]+'\n'+names.map(extract).join('\n')+'\nthis.api={'+names.join(',')+'};',context);
 return {context,api:context.api,events,hits};
}
try{
 const p=boost(hero(),['combat-xp']),s=session(p),{api,events}=runtime();
 assert.equal(api.addXp(s,20),30);assert.equal(p.xp,30);
 assert.equal(api.addXp(s,20,false),20,'administrative XP can opt out');
 assert(api.grantChapterReward(s,{reward:{xp:20,gold:5,potions:0}}));assert.equal(p.xp,80,'quests use the central boosted XP grant');
 assert(events.some(row=>row.text.includes('+30 XP')),'quest notice reports actual boosted gain');
 clock+=STORE_BOOST_DURATION_MS;assert.equal(api.addXp(s,20),20,'expiry boundary restores normal XP');clock-=STORE_BOOST_DURATION_MS;

 for(const kind of ['crystal','timber','herb']){
  const p=boost(hero(),['profession-xp','combat-xp']),s=session(p),node={id:'resource',kind,instanceId:null,available:true,x:0,z:0,zone:'greenwood'};
  s.gathering={nodeId:node.id,endsAt:clock};const {api,events}=runtime({nodes:[node],gatheringClaims:new Map([[node.id,s]])});
  api.finishGathering(s,clock);const definition=RESOURCE_TYPES[kind];
  assert.equal(p.skills[definition.skill],150,`${kind} awards +50% profession XP`);assert.equal(p.xp,Math.floor(definition.adventureXp*1.5),`${kind} separately awards +50% character XP`);
  assert.equal(p.inventory[definition.reward],101,'boosts do not multiply gathered materials');assert.equal(node.available,false);
  assert(events.some(row=>row.text.includes('+150')),'profession notice reports actual boosted gain');
 }
 const craftStart=source.indexOf("} else if (message.type === 'craft') {")+"} else if (message.type === 'craft') {".length;
 const craftEnd=source.indexOf("} else if (message.type === 'loot') {",craftStart);assert(craftEnd>craftStart);
 for(const active of [false,true]){
  const p=active?boost(hero(),['profession-xp']):hero(),s=session(p),{context,events}=runtime({toWorld:()=>({x:0,z:0}),auctionEscrowHas:()=>false,bankEscrowHas:()=>false,auctionIncomingGear:()=>false,reject:message=>assert.fail(message)});
  const craft=runInNewContext(`(async function(session,message,now){const p=session.player;${source.slice(craftStart,craftEnd)}})`,context);await craft(s,{recipeId:'trail-tonic'},clock);
  assert.equal(p.craftingXp,active?18:12,'crafting receives +50% profession XP with normal material costs');assert.equal(p.inventory.herb,98);assert.equal(p.inventory.crystal,99);assert.equal(p.inventory.potion,1);
  p.craftingXp=MAX_SKILL_XP-10;await craft(s,{recipeId:'sunblossom-remedies'},clock+1000);
  assert.equal(p.craftingXp,MAX_SKILL_XP,'profession boosts cannot exceed the crafting XP cap');
  assert(events.some(row=>row.text.includes('+10 crafting XP')),'the near-cap crafting notice reports only XP actually earned');
  const before=structuredClone(p);let rejected;
  context.auctionOwners=()=>[{player:{auctions:[{id:'pending',item:{kind:'resource',id:'herb',quantity:p.inventory.herb},reservation:{buyerId:p.id,delivered:true}}]}}];
  context.reject=message=>{rejected=message;};await craft(s,{recipeId:'trail-tonic'},clock+2000);
  assert.match(rejected,/awaiting payment verification/,'boosted and normal crafting respect the real auction guard');
  assert.deepEqual(p,before,'rejected provisional crafting changes neither items nor XP');
 }
 function attackFixture(ids=[],targetPlayer=false){
  const p=boost(hero(),ids),s=session(p),enemy=targetPlayer?{...boost(hero(),['defense']),id:'victim',equipment:{...starterGear('Ranger').equipment,armor:'sunsteel-plate'},level:25}: {id:'enemy',kind:'moss-slime',name:'Enemy',lifeStartedAt:1,level:25,hp:10000,threat:new Map(),x:1,z:0,instanceId:null,alive:true};
  const sessions=new Map([[p.id,s]]);if(targetPlayer)sessions.set(enemy.id,session(enemy));
  const fixture=runtime({sessions,castTargets:()=>[enemy]});return {...fixture,p,s,enemy};
 }
 for(const active of [false,true]){
  const f=attackFixture(active?['damage']:[]);f.s.autoAttack={enemy:f.enemy,targetLife:1};
  f.api.startAutoAttacks(clock);const due=f.context.pendingHits[0].dueAt,base=f.context.pendingHits[0].damage;
  f.api.resolveHits(due);assert.equal(f.hits[0].amount,Math.round(base*(active?1.2:1)),'auto attacks apply the live damage boost once at impact');
 }
 const poison=attackFixture(['damage']);const cast={ability:'poison-shot',stats:combatStats(poison.p),attackerLevel:25,rotation:0};
 assert(poison.api.releaseCast(poison.s,cast,clock));assert.equal(poison.context.pendingHits.length,1,'poison waits for its projectile to land before applying ticks');
 const initial=poison.context.pendingHits[0];poison.api.resolveHits(initial.dueAt);
 assert.equal(poison.context.pendingHits.length,3,'a landed poison projectile schedules exactly three ticks');
 const queued=poison.context.pendingHits.map(hit=>({damage:hit.damage,dueAt:hit.dueAt}));
 for(const hit of queued)poison.api.resolveHits(hit.dueAt);
 assert.deepEqual(poison.hits.map(hit=>hit.amount),[initial,...queued].map(hit=>Math.round(hit.damage*1.2)),'every poison tick receives the same 20% boost without double application');
 const expired=attackFixture(['damage']);expired.context.pendingHits.push({session:expired.s,enemy:expired.enemy,life:1,zone:'greenwood',instanceId:null,damage:100,attackerLevel:25,dueAt:clock+STORE_BOOST_DURATION_MS,playerLife:1});
 expired.api.resolveHits(clock+STORE_BOOST_DURATION_MS);assert.equal(expired.hits[0].amount,100,'an expired damage boost does not affect a late projectile');
 const pvp=attackFixture(['damage'],true),armor=combatStats(pvp.enemy).defense;
 pvp.context.pendingHits.push({session:pvp.s,enemy:pvp.enemy,life:1,instanceId:null,damage:100,attackerLevel:25,dueAt:clock,playerLife:1});pvp.api.resolveHits(clock);
 assert.equal(pvp.hits[0].amount,Math.max(1,Math.round((120-Math.round(armor*1.2))*.2)),'PvP applies attacker damage and defender defense boosts before the 80% reduction');
 const killed=attackFixture(['combat-xp']);killed.enemy.hp=1;killed.enemy.zone='greenwood';killed.enemy.homeX=1;killed.enemy.homeZ=0;
 Object.assign(killed.context,{partyOf:()=>null,activeSessions:()=>[killed.s],monsterStatsAtLevel:()=>({xp:20,gold:1}),randomUUID:()=> 'corpse',lootDrops:new Map(),rolledLoot:()=>[],ROOTVAULT_GUARDIAN:{id:'guardian'},TREASURE_MAP,treasureMapRandomInt:max=>max-1});
 killed.context.pendingHits.push({session:killed.s,enemy:killed.enemy,life:1,instanceId:null,damage:100,attackerLevel:25,dueAt:clock,playerLife:1});killed.api.resolveHits(clock);assert.equal(killed.p.xp,30,'monster kill credit uses boosted character XP');
 for(const active of [false,true]){
  const p=hero();p.equipment.armor='sunsteel-plate';if(active)boost(p,['defense']);const s=session(p);s.instanceId='dungeon';const armor=combatStats(p).defense;
  const hazard={sourceId:'boss',sourceLevel:25,sourceName:'Boss',label:'Eruption',x:0,z:0,startedAt:clock-100,endsAt:clock,damage:100},dungeon={id:s.instanceId,members:[p.id],hazards:[hazard]};
  const f=runtime({sessions:new Map([[p.id,s]]),dungeons:new Map([[s.instanceId,dungeon]]),enemies:[{id:'boss',alive:true,instanceId:s.instanceId,x:0,z:0}],dungeonHazardContains:()=>true});
  f.api.updateDungeonHazards(clock,true);assert.equal(f.hits[0].amount,100-Math.round(armor*(active?1.2:1)),'dungeon hazard armor mitigation includes the defense boost');
  const enemy={id:'boss',name:'Boss',kind:'moss-slime',x:0,z:0,level:25,instanceId:s.instanceId,attackDamage:100,attackTarget:s,attackTargetLife:1,attack:{targetId:p.id,x:0,z:0,style:'bite',radius:4,startedAt:clock-100,impactAt:clock,endsAt:clock+100}};
  f.context.enemyStats={'moss-slime':{range:5}};f.api.resolveEnemyAttack(enemy,clock);assert.equal(f.hits[1].amount,100-Math.round(armor*(active?1.2:1)),'enemy attacks use the same defense multiplier');
  if(active){
   const expires=p.storeBoosts.defense;
   dungeon.hazards=[{...hazard,endsAt:expires-1}];f.api.updateDungeonHazards(expires+1,true);
   assert.equal(f.hits[2].amount,100-Math.round(armor*1.2),'delayed hazard processing preserves the defense boost active at scheduled impact');
   dungeon.hazards=[{...hazard,endsAt:expires}];f.api.updateDungeonHazards(expires+2,true);
   assert.equal(f.hits[3].amount,100-armor,'a hazard at boost expiry receives no expired defense bonus');
  }
 }
 console.log('PASS: live boost effects through actual server XP, quest, kill, gathering, crafting, auto-attack, spell/poison, PvP, enemy-attack and dungeon-hazard code; exact +50%/+20% values, unchanged yields/costs and impact/XP expiry boundaries.');
}finally{Date.now=realNow;}
