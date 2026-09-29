import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { combatCompanionStats } from '../src/combat-companions.ts';
import { CHARGE_ATTACK, MONSTERS } from '../src/bestiary.ts';
const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = name => source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0];
function fixture() {
 const owner={id:'owner',x:0,z:10,hp:100,maxHp:100,level:10}, session={player:owner,instanceId:'vault',lifeStartedAt:1,socket:{readyState:1}};
 const enemy={id:'enemy',kind:'briar-boar',x:0,z:0,level:10,alive:true,respawnAt:1,instanceId:'vault',threat:new Map([[session,10]]),target:session,attackTarget:session,attackTargetLife:1,attackDamage:20};
 const pet={saved:{kind:'briar-boar',level:10,hp:100},x:0,z:1,target:enemy,targetLife:1,instanceId:'vault',playerLife:1};
 session.pet=pet;
 const run={id:'vault',kind:'vault',members:['owner'],hazards:[],completed:false};
 const context={MONSTERS,sessions:new Map([['owner',session]]),dungeons:new Map([['vault',run]]),enemies:[enemy],WebSocket:{OPEN:1},CHASE_DISTANCE:60,WORLD_COLLIDERS:[],WORLD_BOUNDS:{},WORLD_BOSS_BERSERK_MS:99999,
 activeCompanion:s=>s.pet,combatCompanionStats,damageCompanion:(s,n)=>{s.pet.saved.hp=Math.max(0,s.pet.saved.hp-n);},combatTargetLife:e=>e.respawnAt,
 combatInstanceActive:()=>true,arenaMode:()=>false,gmObserver:()=>false,dungeonPreparing:()=>false,inDungeonPreparation:p=>p.z<0,
 mapGuardianAllowed:()=>true,worldBossCombatAllowed:()=>true,insideCity:()=>false,waterAt:()=>false,villageSafe:()=>false,
 distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),moveEnemyToward:()=>true,monsterPursuitSpeed:()=>0,basicAttackRange:()=>2,
 activeSessions:()=>[session],canTraverse:()=>true,physicalReach:(session,target,range)=>Math.hypot(session.player.x-target.x,session.player.z-target.z)<=range,instanceColliders:()=>[],instanceBounds:()=>({}),monsterLevelScale:()=>1,combatStats:()=>({defense:0}),combatDefense:()=>0,storeBoostMultiplier:()=>1,
 applyDamage:(p,_kind,n)=>p.hp-=n,stand(){},playerDied(){},event(){},dirty(){},enemyStats:{'briar-boar':{range:20,aggroRange:20}},pendingHits:[],
 dungeonStages:()=>[],dungeonBounds:()=>({}),dungeonHazardContains:(h,p)=>Math.hypot(h.x-p.x,h.z-p.z)<=h.r,
 dungeonHazardPattern:(_kind,_source,goal)=>{context.hazardGoal=goal;return {cooldownMs:0};},queueDungeonHazards(){},
 CHARGE_ATTACK,CHARGING_MONSTERS:['briar-boar'],chargeLaneAllowed:()=>true,randomUUID:()=> 'charge',
 };
 const api=runInNewContext(['enemyCombatCompanion','selectEnemyTarget','startEnemyCharge','resolveEnemyAttack','updateDungeonHazards'].map(extract).join('\n')+'\n({enemyCombatCompanion,selectEnemyTarget,startEnemyCharge,resolveEnemyAttack,updateDungeonHazards})',context);
 const windup=(basic=true)=>Object.assign(enemy,{attack:{targetId:owner.id,basic,style:'pulse',x:0,z:1,radius:12,startedAt:100,impactAt:200,endsAt:300},attackCompanion:pet,attackApplied:false});
 return {owner,session,enemy,pet,run,context,api,windup};
}
{
 const f=fixture();f.windup();f.api.resolveEnemyAttack(f.enemy,200);
 assert.equal(f.pet.saved.hp,84,'basic attacks apply companion defense');assert.equal(f.owner.hp,100,'pet targeted hit does not hit owner');
 f.api.resolveEnemyAttack(f.enemy,201);assert.equal(f.pet.saved.hp,84,'impact applies once');
}
for (const change of ['swap','dead','retarget','respawn','instance','ownerlife','cover','range','sanctuary']) {
 const f=fixture();f.windup();
 if(change==='swap')f.session.pet={...f.pet,saved:{...f.pet.saved}};
 if(change==='dead')f.pet.saved.hp=0;
 if(change==='retarget')f.pet.target=null;
 if(change==='respawn')f.enemy.respawnAt=2;
 if(change==='instance')f.pet.instanceId='other';
 if(change==='ownerlife')f.session.lifeStartedAt=2;
 if(change==='cover')f.context.canTraverse=()=>false;
 if(change==='range')f.pet.z=4;
 if(change==='sanctuary')f.pet.z=-1;
 const hp=f.session.pet.saved.hp;f.api.resolveEnemyAttack(f.enemy,200);
 assert.equal(f.session.pet.saved.hp,hp,`${change}: companion avoids invalid hit`);assert.equal(f.owner.hp,100,`${change}: no fallback hit to owner`);
}
{
 const f=fixture();f.windup(false);f.api.resolveEnemyAttack(f.enemy,200);
 assert.equal(f.owner.hp,80,'area attack hits owner in area');assert.equal(f.pet.saved.hp,84,'area attack independently hits companion');
}
{
 const f=fixture();f.windup(false);f.enemy.attackCompanion=null;f.pet.target=null;f.api.resolveEnemyAttack(f.enemy,200);
 assert.equal(f.pet.saved.hp,84,'area attack hits idle companion too');
}
{
 const f=fixture();f.owner.z=80;assert.equal(f.api.selectEnemyTarget(f.enemy,[f.session],200),f.session,'engaged nearby pet retains owner threat credit');
}
for(const change of ['none','owneroutside','cover','sanctuary','dead','newlife']) {
 const f=fixture();f.run.hazards=[{sourceId:'enemy',sourceLevel:10,sourceName:'boar',startedAt:100,endsAt:200,x:0,z:1,r:12,damage:20,label:'Blast'}];
 if(change==='owneroutside')f.owner.z=30;
 if(change==='cover')f.context.canTraverse=()=>false;
 if(change==='sanctuary')f.pet.z=-1;
 if(change==='dead')f.pet.saved.hp=0;
 if(change==='newlife')f.session.lifeStartedAt=201;
 const hp=f.pet.saved.hp;f.api.updateDungeonHazards(200,true);
 assert.equal(f.pet.saved.hp,['none','owneroutside'].includes(change)?84:hp,`${change}: hazard companion boundary`);
}
{
 const f=fixture();f.owner.z=30;f.api.updateDungeonHazards(200);
 assert.equal(f.context.hazardGoal,f.pet,'enemy mechanic targets engaged pet when owner is out of range');
}
{
 const f=fixture();f.enemy.instanceId=f.session.instanceId=f.pet.instanceId=null;f.pet.x=6;f.pet.z=0;
 assert(f.api.startEnemyCharge(f.enemy,f.session,{speed:2,damage:20,name:'Boar'},100,false,f.pet));
 assert.equal(f.enemy.attackCompanion,f.pet,'charge captures the original companion');
 assert.equal(f.enemy.attackTarget,f.session,'charge retains real owner session identity');
 assert.equal(f.enemy.attack.targetId,f.owner.id,'public target retains owner ID');
 assert(f.enemy.attack.x>0);assert.equal(f.enemy.attack.z,0,'charge aims at pet position, not owner');
 f.session.pet={...f.pet,saved:{...f.pet.saved}};f.api.resolveEnemyAttack(f.enemy,200);
 assert.equal(f.enemy.attack,null,'changing companion cancels the old charge');
}
{
 const fresh=()=>{const f=fixture();f.enemy.threat.clear();f.enemy.target=null;f.enemy.instanceId=f.session.instanceId=null;f.enemy.roaming=true;f.session.pet=null;return f;};
 const f=fresh();f.owner.z=20;
 for(const key of ['villageSafe','insideCity','waterAt','worldBossCombatAllowed','mapGuardianAllowed'])f.context[key]=()=>{throw Error(`distant detection must skip ${key}`);};
 assert.equal(f.api.selectEnemyTarget(f.enemy,[f.session],200),null,'exact aggro boundary is excluded before expensive safety queries');
 f.owner.z=100;assert.equal(f.api.selectEnemyTarget(f.enemy,[f.session],200),null,'distant players skip safety queries');
 for(const guard of ['villageSafe','insideCity','waterAt','worldBossCombatAllowed','mapGuardianAllowed','dungeonPreparing']){
  const f=fresh();f.context[guard]=()=>!['worldBossCombatAllowed','mapGuardianAllowed'].includes(guard);
  if(guard==='dungeonPreparing')f.enemy.instanceId=f.session.instanceId='vault';
  assert.equal(f.api.selectEnemyTarget(f.enemy,[f.session],200),null,`${guard} still protects nearby players`);
 }
 for(const change of ['ordinary','raid','guardian','story','other-instance']){
  const f=fresh();f.owner.z=100;
  if(change==='raid'||change==='guardian'){f.enemy.raidId='raid';f.enemy.raidKind=change==='guardian'?'guardian':'siege';}
  if(change==='story')f.enemy.storyEncounterId='rescue';
  if(change==='other-instance')f.session.instanceId='other';
  assert.equal(f.api.selectEnemyTarget(f.enemy,[f.session],200),change==='raid'?f.session:null,`${change} retains its detection rule`);
 }
 const near=fresh(),far={...near.session,player:{...near.owner,id:'far',z:15}};
 assert.equal(near.api.selectEnemyTarget(near.enemy,[far,near.session],200),near.session,'nearest eligible player still starts combat');
 const story=fresh();story.enemy.storyEncounterId='rescue';assert.equal(story.api.selectEnemyTarget(story.enemy,[story.session],200),null,'nearby players do not distract story attackers');
 const threat=fresh();threat.owner.z=30;threat.enemy.threat.set(threat.session,5);
 assert.equal(threat.api.selectEnemyTarget(threat.enemy,[threat.session],200),threat.session,'existing threat remains eligible beyond initial aggro range');
 const raid=fresh();raid.owner.z=100;raid.enemy.raidId='raid';raid.enemy.raidKind='siege';raid.context.villageSafe=()=>true;
 assert.equal(raid.api.selectEnemyTarget(raid.enemy,[raid.session],200),null,'raid range exception does not bypass safety');
}
console.log('PASS companion enemy AI: basic defense, single impact, no swap redirect, life/instance/LOS/range/sanctuary guards, separate AoE and hazard hits, owner threat, companion hazard target and charge identity; distant detection skips safety scans while nearby safety, raid, story and threat rules remain intact.');
