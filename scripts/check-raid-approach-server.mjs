import assert from 'node:assert/strict';
import { createRaidController } from '../src/raid-server.mjs';
import { RAID_APPROACH_MONSTERS, RAID_APPROACH_ROOMS, RAID_APPROACH_EXIT } from '../src/raid-approach.ts';
import { raidHazardContains } from '../src/raid.ts';

let now=Date.now(),awards=0;
const sessions=new Map(),enemies=[],events=[],hits=[];
const controller=createRaidController({sessions,enemies,random:()=>.37,live:s=>!!s?.online,dirty:()=>{},error:e=>{throw e;},busy:()=>false,canInvite:()=>true,
 eligible:s=>s.online&&s.player.level===60&&!s.instanceId&&s.player.hp>0,event:(_s,text)=>events.push(text),cancel:()=>{},correct:()=>{},
 cancelEnemy:enemy=>{enemy.attack=null;enemy.threat.clear();enemy.target=null;},target:(_enemy,team)=>team[0],
 damage:(session,amount,at,_execute,source)=>{session.player.hp=Math.max(0,session.player.hp-amount);hits.push({amount,at,sourceId:source?.id});},
 rollRewards:()=>[],award:async()=>{awards++;return {saved:true,rewards:[]};}});
const make=i=>{const s={recordKey:`account-${i}`,online:true,instanceId:null,player:{id:`hero-${i}`,name:`Hero ${i}`,level:60,x:0,z:0,hp:10000,maxHp:10000,zone:'glade',appearance:{className:i<3?'Cleric':'Knight'}}};sessions.set(s.player.id,s);return s;};
const team=Array.from({length:10},(_,i)=>make(i)),leader=team[0];
const act=(s,message)=>controller.handle(s,message,now),run=()=>controller.bySession(leader),state=()=>controller.publicState(leader);
const step=ms=>{now+=ms;controller.tick(now);};
const damage=(enemy,amount=Number.MAX_SAFE_INTEGER)=>{enemy.hp=Math.max(0,enemy.hp-controller.damageAllowed(enemy,amount,now));if(!enemy.hp&&enemy.alive){enemy.alive=false;enemy.diedAt=now;controller.enemyKilled(enemy,now);}};
const live=()=>enemies.filter(e=>e.alive),ready=()=>team.forEach((s,i)=>act(s,{type:'raidReady',ready:true,role:i===0?'tank':i<3?'healer':'damage'}));
act(leader,{type:'raidCreate'});
for(const member of team.slice(1)){now+=1100;act(leader,{type:'raidInvite',targetId:member.player.id});act(member,{type:'raidRespond',invitationId:controller.publicInvites(member)[0].id,accept:true});}
ready();act(leader,{type:'raidStart'});assert.equal(state().phase,'approach');assert.equal(state().approach.roomIndex,0);assert.equal(live().length,4);
const started=run().startedAt,runId=run().runId;
const assertClock=()=>{assert.equal(run().startedAt,started);assert.equal(run().runId,runId);assert.equal(run().lockedSize,10);assert.equal(awards,0,'lead-in never grants final rewards');};
const seen=new Set();let oldActor;
for(let room=0;room<6;room++){
 assert.equal(state().approach.roomIndex,room);assert.equal(state().approach.roomName,RAID_APPROACH_ROOMS[room].name);
 assert.deepEqual(live().map(e=>e.model).sort(),[...RAID_APPROACH_ROOMS[room].monsters].sort());
 for(const enemy of live()){assert.equal(enemy.level,60);const def=RAID_APPROACH_MONSTERS.find(m=>m.model===enemy.model);assert.equal(enemy.maxHp,def.hpPerPlayer*10);seen.add(enemy.model);}
 if(room===0){
  const enemy=live()[0],before={x:enemy.x,z:enemy.z};
  step(200);const normalStep=Math.hypot(enemy.x-before.x,enemy.z-before.z),slowedFrom={x:enemy.x,z:enemy.z};
  enemy.slowUntil=now+1000;enemy.slowMultiplier=.35;step(200);
  assert(Math.abs(Math.hypot(enemy.x-slowedFrom.x,enemy.z-slowedFrom.z)/normalStep-.35)<1e-8,'normal class slows affect approach movement');
  enemy.slowUntil=0;
 }
 Object.assign(leader.player,RAID_APPROACH_EXIT);act(leader,{type:'raidAdvance'});assert.equal(state().approach.roomIndex,room,'no gate skip before clear');
 act(leader,{type:'raidAdvance',roomIndex:room+1});assert.equal(state().approach.roomIndex,room,'no forged room index');
 // All four authored creature abilities schedule from their own actor and stop with its death.
 for(const enemy of live())enemy.raidNextSpecial=now;
 step(1);for(const enemy of live())assert(run().hazards.some(h=>h.sourceId===enemy.id&&h.kind===RAID_APPROACH_MONSTERS.find(m=>m.model===enemy.model).ability));
 assert.doesNotThrow(()=>JSON.stringify(state()));assert(state().hazards.every(h=>h.sourceId&&!Object.hasOwn(h,'damage')&&!Object.hasOwn(h,'target')));
 const first=live()[0];oldActor=first;damage(first);assert(!run().hazards.some(h=>h.sourceId===first.id),'defeated creature cancels its unfinished hazards');
 if(room===2){
  const priorClears=run().checkpoint,oldIds=live().map(e=>e.id),hp=team[4].player.hp=4567;
  controller.detach(team[4]);team[4].online=false;team[4].online=true;controller.reattach(team[4]);assert.equal(team[4].player.hp,hp,'reconnect does not heal');
  team.forEach(s=>s.player.hp=0);step(1);assert.equal(run().phase,'wiped');assert.equal(run().checkpoint,priorClears);assert.equal(state().approach.roomIndex,room);
  const spare=make(20);act(leader,{type:'raidInvite',targetId:spare.player.id});assert.equal(controller.publicInvites(spare).length,0,'cannot replace frozen members after a checkpoint');
  act(team[4],{type:'raidReady',ready:true,role:'healer'});assert.equal(run().members.get(team[4].player.id).role,'tank','class-derived mechanics ignore legacy role choices');
  ready();act(leader,{type:'raidStart'});assert.equal(run().phase,'approach');assert.equal(state().approach.roomIndex,room);assert.equal(live().length,4,'retry restores current chamber only');assert(live().every(e=>!oldIds.includes(e.id)));assertClock();
 }
 // A fallen leader is restored once the final creature dies, avoiding a locked gate.
 if(room===1){leader.player.hp=0;leader.player.diedAt=now;controller.detach(leader);leader.online=false;}
 for(const enemy of [...live()])damage(enemy);
 if(room===1){leader.online=true;controller.reattach(leader);run().leaderId=leader.player.id;assert.equal(leader.player.hp,leader.player.maxHp*.5,'fallen offline leader receives the one-time clear revival and can open the gate');assert.equal(leader.player.diedAt,0);}
 assert.equal(state().approach.remaining,0);assert.equal(state().approach.cleared,true);assert(leader.player.hp>0);assert.equal(run().hazards.length,0);
 const gatesBefore=run().roomIndex;Object.assign(team[1].player,RAID_APPROACH_EXIT);act(team[1],{type:'raidAdvance'});assert.equal(run().roomIndex,gatesBefore,'only the leader rallies');
 Object.assign(leader.player,{x:0,z:0});act(leader,{type:'raidAdvance'});assert.equal(run().roomIndex,gatesBefore,'leader must reach the north exit');
 if(room===3){controller.detach(team[5]);team[5].online=false;Object.assign(leader.player,RAID_APPROACH_EXIT);act(leader,{type:'raidAdvance'});assert.equal(run().roomIndex,room+1,'offline original member does not block advancement');team[5].online=true;controller.reattach(team[5]);}
 Object.assign(leader.player,RAID_APPROACH_EXIT);act(leader,{type:'raidAdvance'});assert.equal(run().roomIndex,room+1);assertClock();
 controller.enemyKilled(oldActor,now);assert.equal(run().roomCleared,false,'late prior-room death cannot clear the next room');assert.equal(controller.damageAllowed(oldActor,50,now),0);
 assert(team.every(s=>s.player.hp===s.player.maxHp),'successful gate is a one-time rest and rally');
 act(leader,{type:'raidAdvance'});assert.equal(run().roomIndex,room+1,'replayed advance never skips a chamber');
}
assert.equal(seen.size,24);assert.equal(run().phase,'morgrath');assert.equal(run().boss.model,'morgrath');assert.equal(run().boss.maxHp,240000);
const boss=run().boss;
for(const [index,kind,shape] of [[0,'Morgrath Cleave','cone'],[1,'Morgrath Rift','line'],[2,'Morgrath Rupture','ring']]){
 run().hazards=[];boss.attack=null;boss.raidAttackIndex=index;boss.raidNextSpecial=now;step(1);
 const hazard=run().hazards.find(h=>h.kind===kind);assert(hazard);assert.equal(hazard.shape,shape);assert.equal(hazard.sourceId,boss.id);assert(hazard.impactAt-now>=2200,'Morgrath keeps readable warnings');
 if(shape==='ring'){assert(!raidHazardContains(hazard,boss),'Morgrath ring has a true safe center');assert(raidHazardContains(hazard,{x:34,z:34}),'Morgrath ring reaches room corners');}
 const point=shape==='ring'?{x:hazard.x+hazard.innerR+1,z:hazard.z}:shape==='cone'?{x:hazard.x+Math.sin(hazard.rotation)*4,z:hazard.z+Math.cos(hazard.rotation)*4}:{x:hazard.x,z:hazard.z};
 Object.assign(leader.player,point);now=hazard.impactAt;controller.resolve(now);assert.equal(hits.at(-1).sourceId,boss.id,'real damage is attributed to Morgrath');team.forEach(s=>s.player.hp=s.player.maxHp);
}
damage(boss);assert.equal(boss.hp,120000,'large hits cannot skip the guard summon');step(1);assert.equal(live().filter(e=>e.model==='raid-grave-knight').length,2);assert.equal(run().morgrathSummoned,true);
damage(boss);assert.equal(run().phase,'morgrath');assert.equal(run().roomCleared,false,'Morgrath alone does not clear his living guards');
for(const enemy of [...live()])damage(enemy);assert.equal(run().roomCleared,true);assertClock();Object.assign(leader.player,RAID_APPROACH_EXIT);act(leader,{type:'raidAdvance'});
assert.equal(run().phase,'sermon');assert.equal(run().roomIndex,7);assert.equal(run().boss.model,'horned-apostle');assert.equal(run().boss.maxHp,400000);assertClock();
team.forEach(s=>s.player.hp=0);step(1);ready();act(leader,{type:'raidStart'});assert.equal(run().phase,'sermon','Apostle wipe preserves six rooms and Morgrath checkpoint');assertClock();
assert.equal(state().approach.totalRooms,8);assert(events.some(text=>text.includes('Morgrath summons')));
console.log('PASS raid approach: all 24 scaled creatures and six chambers, source-attributed abilities, guarded north exits, checkpoint retries, fixed difficulty/clock and offline continuation, reconnect HP, Morgrath patterns/guards, no early rewards and Apostle integration.');
