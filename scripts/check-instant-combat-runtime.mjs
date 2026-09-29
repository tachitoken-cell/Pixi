import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runInNewContext } from 'node:vm';
import { INSTANT_COMBAT_RANGED_AUTO } from '../src/instant-combat-skills.ts';
import { basicAttackRange } from '../src/bestiary.ts';
const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const extract=name=>source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0];
// A delayed tick must discover follow-up deadlines created by an earlier cast.
{
 const jobs=[500],resolved=[],player={hp:20},boss={alive:true};
 const instantCombat={impacts:now=>jobs.filter(at=>at<=now),resolve(now){while(jobs[0]<=now){const at=jobs.shift();resolved.push(at);if(at===500)jobs.push(1000);if(at===1000)player.hp=0;}}};
 const settle=runInNewContext(`(${extract('settleCombat')})`,{instantCombat,enemies:[],sessions:new Map(),dungeons:new Map(),raids:{impacts:()=>[],resolve(){}},finishCasts(){},resolveHits(at){if(at>=1500&&player.hp>0)boss.alive=false;},advanceKnightCharge(){},updateDungeonHazards(){},updateDungeonSpikeTraps(){},updateKnightCombat(){}});
 settle(2000);assert.deepEqual(resolved,[500,1000]);assert.equal(player.hp,0);assert.equal(boss.alive,true,'newly scheduled lethal effect precedes the later player projectile');
}
// Real taunts are accepted by IC bosses so the authored tank swaps are possible.
{
 const tank={player:{id:'tank',hp:100,x:0,z:2},instanceId:'ic-test',lifeStartedAt:1},offtank={player:{id:'off',hp:100,x:0,z:8},instanceId:'ic-test',lifeStartedAt:1};
 const context={hostileTargetValid:()=>true,combatTargetLife:()=>1,liveSession:()=>true,instantCombat:{bySession:()=>({id:'ic-test'}),combatActive:()=>true},arenaMode:()=>false,gmObserver:()=>false,distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)};
 const api=runInNewContext(extract('tauntEnemy')+'\n'+extract('selectEnemyTarget')+'\n({tauntEnemy,selectEnemyTarget})',context);
 const boss={instantCombat:true,instantCombatRole:'boss',kind:'troll',instanceId:'ic-test',x:0,z:0,threat:new Map()};
 api.tauntEnemy(offtank,boss,1000);assert.equal(api.selectEnemyTarget(boss,[tank,offtank],2000),offtank,'boss follows a valid live taunt despite the nearer former tank');
 assert.equal(api.selectEnemyTarget(boss,[tank,offtank],4001),tank,'expired taunt returns to nearest participant');
 boss.instantCombatRole=undefined;api.tauntEnemy(offtank,boss,5000);assert.equal(api.selectEnemyTarget(boss,[tank,offtank],5000),tank,'ordinary event waves retain nearest-target rules');
}
// Run the actual enemy hit resolver. A launched scepter shot remains locked to
// its ground destination and cannot hit somebody who dodges out of that circle.
{
 const victim={jump:{y:0},player:{id:'p',x:0,z:10,hp:100,level:60},instanceId:'ic-test',lifeStartedAt:1,socket:{readyState:1}},sessions=new Map([['p',victim]]),hit=[];
 const context={INSTANT_COMBAT_RANGED_AUTO,basicAttackRange,sessions,blocked:false,WebSocket:{OPEN:1},combatInstanceActive:()=>true,arenaMode:()=>false,dungeonPreparing:()=>false,gmObserver:()=>false,worldBossCombatAllowed:()=>true,mapGuardianAllowed:()=>true,activeCompanion:()=>null,physicalReach:(s,target,radius)=>!context.blocked&&Math.hypot(s.player.x-target.x,s.jump.y,s.player.z-target.z)<=radius,canTraverse:()=>true,instanceColliders:()=>[],instanceBounds:()=>({}),combatDefense:()=>20,monsterLevelScale:()=>1,dungeons:new Map(),distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),applyDamage(player,type,amount,instanceId,at,source,reflected,edict,execution,school){player.hp-=amount;hit.push({amount,at,school});},stand(){},event(){},dirty(){},moveEnemyToward(){throw Error('A ranged cast cannot walk toward the target while the projectile flies');},selectEnemyTarget(){throw Error('A launched ranged cast cannot reacquire the closest player');}};
 const resolve=runInNewContext(`(${extract('resolveEnemyAttack')})`,context);
 for(const model of ['void-cantor','grave-cantor']){
  const config=INSTANT_COMBAT_RANGED_AUTO[model];assert.equal(config.rangeM,12);assert.equal(config.projectileSpeedMps,40);assert.equal(config.launchMs,500);
  const make=()=>({name:model,model,kind:model==='grave-cantor'?'root-warden':'ice-wisp',instanceId:'ic-test',instantCombat:true,instantCombatRole:model==='grave-cantor'?'boss':undefined,alive:true,x:0,z:0,attackTarget:victim,attackTargetLife:1,attackCompanion:null,attackDamage:40,defenseBypass:.5,level:60,attack:{basic:true,rangedAuto:true,style:'spit',targetId:'p',startedAt:100,launchAt:600,impactAt:850,endsAt:1100,x:0,z:10,radius:.65},attackApplied:false});
  victim.player.hp=100;victim.player.x=0;const enemy=make();resolve(enemy,849);assert.equal(victim.player.hp,100);resolve(enemy,850);assert.equal(victim.player.hp,70);assert.equal(hit.at(-1).at,850);assert.equal(hit.at(-1).school,config.damageSchool);resolve(enemy,900);assert.equal(victim.player.hp,70,'impact resolves once');
  victim.player.hp=100;victim.player.x=1;resolve(make(),850);assert.equal(victim.player.hp,100,'sideways dodge clears the fixed destination');
  victim.player.x=0;victim.instanceId='another';resolve(make(),850);assert.equal(victim.player.hp,100);victim.instanceId='ic-test';
  victim.jump.y=2;resolve(make(),850);assert.equal(victim.player.hp,100,'jumping above the fixed impact radius avoids the ground shot');victim.jump.y=0;
  context.blocked=true;resolve(make(),850);assert.equal(victim.player.hp,100,'physical occlusion blocks the projectile');context.blocked=false;
 }
}
console.log('PASS IC runtime: delayed follow-up damage ordering, both12m/40mps/500ms caster projectiles, fixed-target dodge, one hit and instance isolation.');
