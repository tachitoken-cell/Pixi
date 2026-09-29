import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { STORY_DUNGEONS, getDungeon, dungeonStages, dungeonLayout, dungeonCheckpoint, dungeonColliders, dungeonBounds, dungeonRoomPortalOpen, DUNGEON_START } from '../src/dungeon.ts';
import { dungeonBossVisual } from '../src/dungeon-boss-models.ts';
import { MONSTERS, monsterStatsAtLevel, monsterLevelScale } from '../src/bestiary.ts';
import { canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { starterGear } from '../src/progression.ts';
import { newBags, bagCanFit, bagUsage, bagCapacity } from '../src/bags.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { dungeonCollisionFlags } from '../src/collision-context.ts';
import { storyQuestById, storyQuestProgress, storyQuestReady, storyQuestsValid, acceptStoryQuest, claimStoryQuest } from '../src/story-quests.ts';

// Execute the shipped authority. Only transport, clocks and unrelated activities are adapted.
const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const names=['spawnDungeonEnemy','spawnDungeonStages','advanceStoryChamber','dungeonEligibility','enterDungeon','startDungeonTimer','dungeonInteract','publicDungeon','removeDungeonEntities','leaveDungeon','advanceDungeons','resolveHits'];
const extract=name=>{const match=source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`));assert(match,`server helper ${name}`);return match[0];};
const functions=names.map(extract).join('\n');
function questState(id){
  const completed=new Set();const prerequisites=quest=>{for(const required of quest.requires??[]){prerequisites(storyQuestById(required));completed.add(required);}};prerequisites(storyQuestById(id));
  const state={active:{},completed:[...completed]};assert(acceptStoryQuest(state,id,60));return state;
}
function fixture(kind,size=1){
  let now=100_000,nextId=0;const definition=getDungeon(kind),dungeons=new Map(),enemies=[],lootDrops=new Map(),pendingDungeonRecords=new Map(),events=[],damage=[];
  const members=Array.from({length:size},(_,index)=>({recordKey:`account-${index}`,socket:{readyState:1},instanceId:null,returnPosition:null,lifeStartedAt:0,jump:{grounded:true,sequence:0},gm:{},player:{
    id:`hero-${index}`,name:`Hero ${index}`,level:60,hp:1000,maxHp:1000,x:definition.entrance.x,z:definition.entrance.z+1,zone:definition.entrance.zone,rotation:0,
    appearance:{className:'Ranger'},...starterGear('Ranger'),...newBags(),inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},xp:123,gold:7,
    contracts:{},achievements:{kills:0,worldBosses:0,dungeons:{}},storyQuests:questState(definition.storyQuestId)}}));
  const sessions=new Map(members.map(member=>[member.player.id,member])),party=size>1?{id:'party',leaderId:members[0].player.id,members:members.map(m=>m.player.id)}:null;
  const failReward=()=>assert.fail('story chamber invoked ordinary repeatable rewards');
  const context={Date:{now:()=>now},Object,Map,Set,structuredClone,WebSocket:{OPEN:1},getDungeon,dungeonStages,dungeonLayout,dungeonCheckpoint,dungeonColliders,dungeonBounds,dungeonRoomPortalOpen,DUNGEON_START,
    dungeonBossVisual,monsterStatsAtLevel,monsterLevelScale,enemyStats:MONSTERS,canTraverse,WORLD_COLLIDERS,WORLD_BOUNDS,bagCanFit,
    enemies,dungeons,sessions,lootDrops,pendingDungeonRecords,committingAccounts:new Map(),pendingHits:[],events,damage,DEATH_ANIMATION_MS:1600,WALK_SPEED:7,PET_LOOT_RADIUS:14,CHASE_DISTANCE:60,
    distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),physicalReach:(s,target,radius)=>Math.hypot(s.player.x-target.x,s.player.z-target.z)<=radius,randomUUID:()=>`id-${++nextId}`,partyOf:()=>party,liveSession:s=>!!s&&s.socket.readyState===1,gmObserver:s=>!!s.gm.observer,
    onboardingFeatureUnlocked:()=>true,combatSaveBlocked:()=>false,hasGmRole:()=>false,arenaMode:()=>false,
    raids:{byInstance:()=>null,enemyKilled:()=>false},instantCombat:{bySession:()=>null,enemyKilled:()=>false},
    cancelTradeFor(){},cancelGathering(){},cancelHits(){},stand(){},resetJump(s){s.jump={grounded:true,sequence:0};},dirty(){},correction(){},send(){},snapshot:()=>({}),
    restoreHealth:(s,hp)=>{s.player.hp=hp;},removeLootDrop:id=>lootDrops.delete(id),event:(s,kind,text)=>events.push({id:s.player.id,kind,text}),
    storyQuestProgress,addXp:failReward,rollDungeonCacheLoot:failReward,rolledLoot:failReward,rollDungeonMount:failReward,contractProgress:failReward,
    expireBurning:()=>false,resolveKnightTimer:()=>false,resolveEdictTimer:()=>false,advanceKnightCharge(){},activeCompanion:()=>null,
    hostileTargetValid:(_s,e)=>e.alive,combatTargetLife:e=>e.respawnAt,applyTalentHit:(_h,value)=>value,storeBoostMultiplier:()=>1,applyHarmEdict(){},
    queueDungeonHazards(){},dungeonDeathHazardPattern:()=>null,
    applyDamage(target,type,amount,instanceId,at){target.hp=Math.max(0,target.hp-amount);damage.push({id:target.id,type,amount,instanceId,at});},
    playerDied(s,at){s.player.diedAt=at;},
  };
  const api=runInNewContext(`${functions}\n({${names.join(',')}})`,context);
  const tick=at=>{now=at;api.advanceDungeons(now);};
  const enter=()=>{assert.equal(api.enterDungeon(members[0],kind),true);return dungeons.get(members[0].instanceId);};
  const isolate=(run,stageId)=>{const stages=dungeonStages(kind),index=stages.findIndex(s=>s.id===stageId);run.cleared=new Set(stages.slice(0,index).map(s=>s.id));run.spawned=new Set(run.cleared);run.activated=new Set(dungeonLayout(kind).objects.filter(o=>run.cleared.has(o.stageId)).map(o=>o.id));enemies.length=0;api.spawnDungeonStages(run);return stages[index];};
  const kill=(run,enemy)=>{const hero=members[0];context.pendingHits.push({session:hero,enemy,life:enemy.respawnAt,playerLife:hero.lifeStartedAt,instanceId:run.id,zone:'hollow',damage:1e9,attackerLevel:60,dueAt:now});api.resolveHits(now);assert.equal(enemy.alive,false);};
  return{kind,definition,members,sessions,party,dungeons,enemies,lootDrops,pendingDungeonRecords,events,damage,context,api,enter,isolate,kill,tick,setNow:at=>{now=at;}};
}
// Every party member must hold the exact story quest, and level checks still apply.
for(const definition of STORY_DUNGEONS){
  const f=fixture(definition.id,2),[leader,ally]=f.members;delete ally.player.storyQuests.active[definition.storyQuestId];
  assert.equal(f.api.enterDungeon(leader,definition.id),undefined);assert.equal(f.dungeons.size,0);assert.equal(leader.instanceId,null);assert.equal(ally.instanceId,null);
  assert(f.events.some(event=>/quest active/.test(event.text)));ally.player.storyQuests=questState(definition.storyQuestId);
  ally.player.level=definition.minLevel-1;assert.equal(f.api.enterDungeon(leader,definition.id),undefined);assert.equal(f.dungeons.size,0);
  ally.player.level=definition.minLevel;const run=f.enter();assert(f.members.every(member=>member.instanceId===run.id));assert.equal(run.partySize,2);
  const threshold=dungeonStages(definition.id)[0];assert.equal(f.enemies.length,threshold.enemies.length);assert(f.enemies.every(enemy=>enemy.level===definition.minLevel&&enemy.respawnAt===Infinity));
}
// Timed rooms must be entered, spawn every wave at its deadline, then require time AND kills.
for(const [kind,stageId]of [['ashbound-hall','furnace-defense'],['frozen-memory','winter-survival'],['hollow-door','lantern-protection']]){
  const f=fixture(kind),run=f.enter(),stage=f.isolate(run,stageId),hero=f.members[0];
  f.tick(100_000);assert.equal(f.enemies.filter(e=>e.stageId===stageId).length,0);assert(!run.storyObjectives?.has(stageId),'remote room cannot start a timer');assert(!run.cleared.has(stageId));
  Object.assign(hero.player,{x:stage.x,z:stage.z});f.tick(101_000);assert.equal(f.enemies.filter(e=>e.stageId===stageId).length,2);
  f.tick(110_999);assert.equal(f.enemies.filter(e=>e.stageId===stageId).length,2);f.tick(111_000);assert.equal(f.enemies.filter(e=>e.stageId===stageId).length,4);
  f.tick(121_000);const waveEnemies=f.enemies.filter(e=>e.stageId===stageId);assert.equal(waveEnemies.length,6);assert.equal(new Set(waveEnemies.map(e=>e.id)).size,6);
  for(const enemy of waveEnemies.slice(0,-1))f.kill(run,enemy);f.tick(131_000);assert(!run.cleared.has(stageId),'one surviving attacker blocks the 30-second clear');
  f.kill(run,waveEnemies.at(-1));f.tick(131_001);assert(run.cleared.has(stageId));assert.equal(hero.player.xp,123);assert.equal(f.lootDrops.size,0,'wave kills have no farmable ordinary rewards');
  const count=f.enemies.length;f.tick(200_000);assert.equal(f.enemies.length,count,'completed waves cannot replay');
  const early=fixture(kind),earlyRun=early.enter(),earlyStage=early.isolate(earlyRun,stageId);Object.assign(early.members[0].player,{x:earlyStage.x,z:earlyStage.z});
  early.tick(100_000);early.tick(110_000);early.tick(120_000);for(const enemy of early.enemies.filter(e=>e.stageId===stageId))early.kill(earlyRun,enemy);
  early.tick(129_999);assert(!earlyRun.cleared.has(stageId),'clearing waves early cannot bypass 30 seconds');early.tick(130_000);assert(earlyRun.cleared.has(stageId));
}
// Leaving a timed room cannot bank its timer; darkness damages only outside the exact lantern radius.
{
  const f=fixture('hollow-door',2),run=f.enter(),stage=f.isolate(run,'lantern-protection'),[inside,outside]=f.members;
  Object.assign(inside.player,{x:stage.x+6,z:stage.z});Object.assign(outside.player,{x:stage.x+6.01,z:stage.z});f.tick(100_000);f.tick(101_000);
  assert.equal(inside.player.hp,1000,'radius boundary is protected');assert.equal(outside.player.hp,900,'outside light takes10% per second');
  f.tick(101_999);assert.equal(outside.player.hp,900,'subsecond ticks cannot multiply damage');f.tick(102_000);assert.equal(outside.player.hp,800);
  Object.assign(inside.player,DUNGEON_START);f.tick(103_000);assert.equal(run.storyObjectives.get(stage.id).startedAt,103_000,'uncovered lantern resets progress');
  Object.assign(outside.player,DUNGEON_START);f.tick(150_000);assert(!run.cleared.has(stage.id));assert.equal(run.storyObjectives.get(stage.id).startedAt,150_000,'empty room resets progress');
  Object.assign(inside.player,{x:stage.x,z:stage.z});f.tick(150_100);assert(!run.cleared.has(stage.id),'returning cannot instantly finish banked time');
}
// Rune order uses real interaction validation and public availability.
{
  const f=fixture('frozen-memory'),run=f.enter(),hero=f.members[0],layout=dungeonLayout(f.kind);f.isolate(run,'frozen-runes');run.cleared.add('frozen-runes');
  const runes=layout.objects.filter(o=>o.id.startsWith('memory-rune-')),second=runes[1];Object.assign(hero.player,second);
  assert.equal(f.api.publicDungeon(run,hero).objects.find(o=>o.id===second.id).available,false);f.api.dungeonInteract(hero,second.id);assert(!run.activated.has(second.id));
  for(const rune of runes){Object.assign(hero.player,rune);assert.equal(f.api.publicDungeon(run,hero).objects.find(o=>o.id===rune.id).available,true);f.api.dungeonInteract(hero,rune.id);assert(run.activated.has(rune.id));}
  const portal=layout.portals.find(p=>p.roomId==='frozen-runes'&&p.targetRoomId==='winter-survival');assert(dungeonRoomPortalOpen(portal,run.cleared,run.activated));
}
// Personal treasures are durable, capacity checked, retryable after the shared chest opens, and never ordinary cache rolls.
for(const [kind,chestId]of [['ashbound-hall','ashbound-treasure'],['veiled-sun-temple','veiled-sun-treasure']]){
  const f=fixture(kind,3),run=f.enter(),[hero,full,committing]=f.members,chest=dungeonLayout(kind).objects.find(o=>o.id===chestId);run.cleared.add(chest.stageId);Object.assign(hero.player,chest);
  for(const item of Object.values(LOOT_ITEMS)){if(bagUsage(full.player)>=bagCapacity(full.player))break;if(item.id!=='ancient-coin'&&!['wood','crystal','herb','potion','relic'].includes(item.id))full.player.carriedItems[item.id]=1;}
  assert.equal(bagUsage(full.player),bagCapacity(full.player));f.context.committingAccounts.set(committing.recordKey,true);f.api.dungeonInteract(hero,chest.id);
  assert.equal(hero.player.carriedItems['ancient-coin'],1);assert(hero.player.storyQuests.treasures.includes(chest.id));assert.equal(full.player.carriedItems['ancient-coin'],undefined);assert(!full.player.storyQuests.treasures?.includes(chest.id));
  const personal=f.api.publicDungeon(run,full).objects.find(o=>o.id===chest.id);assert.equal(personal.available,true,'full-bag member retains visible retry');assert.equal(personal.activated,false);assert.equal(personal.opened,true,'shared gate stays open even with personal treasure pending');
  const clientSource=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
  const syncSource=clientSource.match(/function syncCollisionState\(\)\{[^]*?\n\}/)?.[0];assert(syncSource,'client collision state sync exists');
  let collisionFlags;
  runInNewContext(`${syncSource}\nsyncCollisionState()`,{currentCollisionScene:()=>`dungeon-${kind}`,hasCollisionScene:()=>true,dungeon:f.api.publicDungeon(run,full),dungeonCollisionFlags,
    updateCollisionSceneState:(key,flags)=>{collisionFlags=flags;},Date,serverOffset:0});
  assert.equal(collisionFlags[`object:${chest.id}`],true,'unclaimed personal treasure keeps the shared chest lid physically open');
  assert.equal(committing.player.carriedItems['ancient-coin'],undefined);assert(!committing.player.storyQuests.treasures?.includes(chest.id),'paid transaction lock preserves personal retry');
  if(kind==='ashbound-hall'){const state=f.api.publicDungeon(run,full),portal=dungeonLayout(kind).portals.find(p=>p.roomId===chest.stageId&&p.targetRoomId==='throne');assert(dungeonRoomPortalOpen(portal,state.clearedStages,state.objects.filter(o=>o.activated||o.opened).map(o=>o.id)),'unclaimed personal treasure cannot reclose the shared boss portal');}
  full.player.carriedItems={};Object.assign(full.player,chest);f.api.dungeonInteract(full,chest.id);assert.equal(full.player.carriedItems['ancient-coin'],1);assert.equal(hero.player.carriedItems['ancient-coin'],1);
  assert.equal(committing.player.carriedItems['ancient-coin'],undefined);f.context.committingAccounts.delete(committing.recordKey);Object.assign(committing.player,chest);f.api.dungeonInteract(committing,chest.id);assert.equal(committing.player.carriedItems['ancient-coin'],1,'unlocked member retries exactly once after transaction');
  hero.player.storyQuests=JSON.parse(JSON.stringify(hero.player.storyQuests));assert(storyQuestsValid(hero.player.storyQuests));f.api.dungeonInteract(hero,chest.id);assert.equal(hero.player.carriedItems['ancient-coin'],1,'saved treasure flag prevents replay');assert.equal(f.lootDrops.size,0);
}
// Story bosses retain names; all final-room enemies must die; completion progresses the quest once with no legacy payout/record.
for(const definition of STORY_DUNGEONS){
  const f=fixture(definition.id),run=f.enter(),hero=f.members[0],stage=f.isolate(run,'throne');Object.assign(hero.player,{x:stage.x,z:stage.z});
  const guards=f.enemies.filter(e=>e.stageId==='throne'),boss=guards.find(e=>e.dungeonBoss);assert.equal(boss.name,stage.enemies.find(e=>e.boss).name);
  f.kill(run,boss);f.tick(110_000);assert.equal(run.completed,false,'story final chamber requires surviving adds');
  for(const enemy of guards.filter(e=>e.alive))f.kill(run,enemy);f.tick(110_100);assert.equal(run.completed,true);assert(storyQuestReady(hero.player.storyQuests,definition.storyQuestId));
  assert.equal(hero.player.xp,123);assert.equal(hero.player.gold,7);assert.equal(f.lootDrops.size,0);assert.equal(f.pendingDungeonRecords.size,0);assert.equal(run.results.size,0);assert.deepEqual(hero.player.achievements.dungeons,{});
  const count=f.events.filter(e=>/cleared\. Return/.test(e.text)).length;f.tick(120_000);assert.equal(f.events.filter(e=>/cleared\. Return/.test(e.text)).length,count);
  assert(claimStoryQuest(hero.player.storyQuests,definition.storyQuestId));assert.equal(claimStoryQuest(hero.player.storyQuests,definition.storyQuestId),undefined,'quest claim is one-time');
}
// A wipe discards uncompleted timers/waves, keeps checkpoint progress, and re-entry does not recreate rewards or heal.
{
  const f=fixture('ashbound-hall'),run=f.enter(),hero=f.members[0],stage=f.isolate(run,'furnace-defense');run.checkpoint=true;Object.assign(hero.player,{x:stage.x,z:stage.z});f.tick(100_000);assert(run.storyObjectives.size);
  hero.player.hp=0;hero.player.diedAt=100_000;f.tick(102_000);assert.equal(run.wipes,1);assert.equal(run.storyObjectives.size,0);assert.equal(hero.player.hp,hero.player.maxHp);assert.deepEqual({x:hero.player.x,z:hero.player.z},dungeonCheckpoint(f.kind));
  assert.deepEqual([...run.cleared],dungeonLayout(f.kind).checkpointStages);assert(!f.enemies.some(e=>e.id.includes('wave-')));
  hero.player.hp=37;const ids=f.enemies.map(e=>e.id);f.api.leaveDungeon(hero,true);assert(f.dungeons.has(run.id));f.setNow(103_000);assert.equal(f.api.enterDungeon(hero,f.kind),true);assert.equal(hero.instanceId,run.id);assert.equal(hero.player.hp,37);assert.deepEqual(f.enemies.map(e=>e.id),ids);
}
console.log('PASS: actual server party quest/level gates; named bosses; ordered public interactions; entered-room waves0/10/20s;30s+kill completion; lantern bounds/reset/damage; durable personal treasure retry; no farmable kill/clear payouts or records; one-time quest progress; checkpoint wipe/reentry.');
