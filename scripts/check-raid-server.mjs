import assert from 'node:assert/strict';
import { createRaidController } from '../src/raid-server.mjs';
import { RAID_SUIT_ZONES, raidHazardContains } from '../src/raid.ts';
import { RAID_APPROACH_EXIT } from '../src/raid-approach.ts';

let now=Date.now(),sequence=0,awardCalls=0,saveFails=true;
const sessions=new Map(),enemies=[],events=[],plans=[],awardErrors=[];
const controller=createRaidController({sessions,enemies,random:()=>.37,live:session=>!!session?.online,
  rollRewards:()=>[{id:'sigil',quantity:1}],dirty:()=>{},error:error=>awardErrors.push(error),event:(session,text)=>events.push(text),busy:()=>false,canInvite:()=>true,
  eligible:session=>session.online&&session.player.level>=60&&!session.instanceId&&session.player.hp>0,
  cancel:session=>{session.shield=null;},cancelEnemy:enemy=>{enemy.attack=null;enemy.threat.clear();},correct:()=>{},
  damage:(session,amount)=>{session.player.hp=Math.max(0,session.player.hp-amount);},target:(enemy,team)=>team[0],
  award:async(playerId,recordKey,runId,plan)=>{awardCalls++;plan ||= [{id:'sigil',quantity:1}];plans.push(plan);if(awardCalls===1)throw Error('Injected award persistence failure');return {plan,rewards:plan,saved:!saveFails};}});
const player=(level=60)=>{const id=`hero-${sequence++}`,session={online:true,instanceId:null,player:{id,name:id,appearance:{className:'Cleric'},level,hp:10_000,maxHp:10_000,x:0,z:0,zone:'glade',rotation:0}};sessions.set(id,session);return session;};
const leader=player(),team=[leader];
const act=(session,message)=>controller.handle(session,message,now);
const step=ms=>{now+=ms;controller.tick(now);};
const damage=(enemy,amount)=>{enemy.hp-=controller.damageAllowed(enemy,amount,now);if(enemy.hp<=0){enemy.alive=false;controller.enemyKilled(enemy,now);}};
const run=()=>controller.bySession(leader);
const prepare=()=>team.forEach((session,index)=>{session.player.hp=session.player.maxHp;act(session,{type:'raidReady',ready:true,role:index===0?'tank':index<3?'healer':'damage'});});
const fight=()=>{
 prepare();act(leader,{type:'raidStart'});
 while(['approach','morgrath'].includes(run().phase)){
  for(const enemy of [...enemies].filter(e=>e.alive))damage(enemy,Number.MAX_SAFE_INTEGER);
  if(run().phase==='morgrath'&&!run().roomCleared){step(1);for(const enemy of [...enemies].filter(e=>e.alive))damage(enemy,Number.MAX_SAFE_INTEGER);}
  assert(run().roomCleared);Object.assign(leader.player,RAID_APPROACH_EXIT);act(leader,{type:'raidAdvance'});
 }
 assert.equal(run().phase,'sermon');
};
const atThreshold=threshold=>{damage(run().boss,Number.MAX_SAFE_INTEGER);assert.equal(run().boss.hp,Math.floor(run().boss.maxHp*threshold/100));step(100);};

const low=player(59);act(low,{type:'raidCreate'});assert.equal(controller.bySession(low),undefined,'entry rejects low level');
act(leader,{type:'raidCreate',hp:1});assert.equal(run(),undefined,'strict authoritative action fields');
act(leader,{type:'raidCreate'});assert.equal(run().phase,'forming');act(leader,{type:'raidStart'});assert.equal(run().phase,'forming','minimum 10');
for(let index=1;index<10;index++){
  const session=player();team.push(session);now+=1100;act(leader,{type:'raidInvite',targetId:session.player.id});
  const invite=controller.publicInvites(session)[0];assert(invite);act(low,{type:'raidRespond',invitationId:invite.id,accept:true});assert.equal(controller.bySession(low),undefined);
  act(session,{type:'raidRespond',invitationId:invite.id,accept:true});
}
prepare();act(team[1],{type:'raidStart'});assert.equal(run().phase,'forming','only leader starts');fight();
assert.equal(run().lockedSize,10);assert.equal(run().boss.maxHp,400_000);
act(leader,{type:'raidKick',targetId:team[9].player.id});act(team[9],{type:'raidLeave'});assert.equal(run().members.size,10,'roster frozen');
const returning=team[9];returning.player.hp=4321;run().members.get(returning.player.id).marks=3;
controller.detach(returning);returning.online=false;assert.equal(returning.instanceId,null);assert.equal(run().lockedSize,10);
returning.online=true;controller.reattach(returning);assert.equal(returning.player.hp,4321);assert.equal(run().members.get(returning.player.id).marks,3);
assert.equal(run().boss.maxHp,400_000,'no disconnect scaling exploit');

// A full enemy/player object must never enter serialized telegraphs.
step(4000);assert(run().hazards.length);assert.doesNotThrow(()=>JSON.stringify(controller.publicState(leader)));
assert.deepEqual(Object.keys(run().hazards[0]).filter(key=>['player','threat','appearance','inventory','socket','target'].includes(key)),[]);
run().hazards=[];run().nextClaw=now+100_000;run().nextAbility=now;run().abilityIndex=4;step(1);
assert.equal(enemies.filter(enemy=>enemy.raidKind==='crystal'&&enemy.alive).length,4);
for(const crystal of enemies.filter(enemy=>enemy.raidKind==='crystal'))damage(crystal,Number.MAX_SAFE_INTEGER);
step(1);assert.equal(run().sun,null);assert.equal(run().members.get(returning.player.id).marks,0,'crystals cleanse');

atThreshold(70);assert.equal(run().phase,'wings');
run().nextAbility=now;run().abilityIndex=2;step(1);
assert(run().hazards.filter(entry=>entry.kind==='Four Hands of Judgment').some(entry=>raidHazardContains(entry,{x:-34,z:-34})),'Judgment reaches arena corners outside the safe slice');
run().hazards=[];run().nextAbility=now;run().abilityIndex=6;step(1);
const harvest=run().hazards.find(entry=>entry.kind==='Soul Harvest');
for(const x of [-34,34])for(const z of [-34,34])assert(raidHazardContains(harvest,{x,z}),'Harvest warning covers the full pull range');
run().harvest=null;run().hazards=[];
run().nextAbility=now;run().abilityIndex=7;step(1);assert(run().clone);
const judgment=run().hazards.find(entry=>entry.kind==='Death Clone');
for(const x of [-34,34])for(const z of [-34,34])assert(raidHazardContains(judgment,{x,z}),'Clone Judgment cannot be escaped in arena corners');
assert.equal(enemies.filter(enemy=>enemy.raidKind==='clone'&&enemy.alive).length,3,'four copies total, only one real');
const fake=enemies.find(enemy=>enemy.raidKind==='clone');assert.equal(controller.damageAllowed(fake,1000,now),0);
damage(run().boss,run().boss.maxHp*.02);step(1);assert.equal(run().clone,null,'real-boss burst interrupts');
assert(!enemies.some(enemy=>enemy.raidKind==='clone'));

atThreshold(50);assert.equal(run().phase,'suits');assert.equal(controller.damageAllowed(run().boss,9999,now),0);
for(const session of team){const member=run().members.get(session.player.id),zone=RAID_SUIT_ZONES.find(zone=>zone.suit===member.suit);Object.assign(session.player,{x:zone.x,z:zone.z});member.marks=4;}
Object.assign(team[9].player,{x:0,z:0});step(10_000);
assert.equal(run().phase,'wings');assert.equal(team[9].player.hp,0,'wrong suit executes');assert.equal(run().members.get(leader.player.id).marks,0,'correct suits cleanse');

atThreshold(40);assert.equal(run().phase,'death-realm');assert.equal(controller.damageAllowed(run().boss,99999,now),0);
const shadow=team.filter(session=>session.instanceId===run().shadowId),arena=team.filter(session=>session.instanceId===run().arenaId&&session.player.hp>0);
assert(shadow.some(session=>run().members.get(session.player.id).role==='healer'));assert(arena.some(session=>run().members.get(session.player.id).role==='healer'));
const guardians=enemies.filter(enemy=>enemy.raidKind==='guardian');assert.equal(guardians.length,3);assert.equal(controller.damageAllowed(guardians[0],100,now),0,'shields block guardian damage');
for(const shield of enemies.filter(enemy=>enemy.raidKind==='shield'))damage(shield,Number.MAX_SAFE_INTEGER);
assert(controller.damageAllowed(guardians[0],100,now)>0);
for(const guardian of guardians)damage(guardian,Number.MAX_SAFE_INTEGER);
for(let i=0;i<run().seals.length;i++)Object.assign(arena[i].player,{x:run().seals[i].x,z:run().seals[i].z});
const shadowReconnects=[[shadow[0],4321],[shadow[1],0]];
for(const [session,hp] of shadowReconnects){session.player.hp=hp;controller.detach(session);session.online=false;sessions.delete(session.player.id);}
for(let i=0;i<6;i++)step(1000);
assert.equal(run().phase,'wings');
for(const [session,hp] of shadowReconnects){
 assert.equal(run().members.get(session.player.id).plane,'arena','offline Shadow participants return with the phase');
 sessions.set(session.player.id,session);session.online=true;controller.reattach(session);
 assert.equal(session.instanceId,run().arenaId,'reconnect cannot return to the expired Shadow Realm');assert.equal(session.player.hp,hp,'phase reunion never heals or revives offline players');
}
assert(team.every(session=>session.instanceId===run().arenaId),'everyone returns including dead raiders');
assert.equal(controller.publicState(leader).guardiansKilled,3);
controller.detach(team[9]);team[9].online=false;
atThreshold(15);assert.equal(run().phase,'incarnate');assert.equal(run().enrageEndsAt,now+90_000);
damage(run().boss,Number.MAX_SAFE_INTEGER);assert.equal(run().phase,'completed');step(1);
await Promise.resolve();assert.equal(controller.publicState(leader).result.saved,false);assert.equal(awardCalls,10,'one award attempt per original member');
act(leader,{type:'raidLeave'});assert(controller.bySession(leader),'pending saved rewards block departure');act(leader,{type:'raidKick',targetId:team[1].player.id});assert(controller.bySession(team[1]),'completed awards cannot be removed');
const firstPlans=[...plans];saveFails=false;await controller.flush();assert.equal(controller.publicState(leader).result.saved,true);
assert(plans.slice(10).every((plan,index)=>plan===firstPlans[index]),'retry reuses fixed rolls');step(5001);await Promise.resolve();assert.equal(awardCalls,20,'successful rewards never repeat');
assert.doesNotThrow(()=>JSON.stringify(controller.publicState(leader)));assert.equal(awardErrors.length,1);
team[9].online=true;controller.reattach(team[9]);assert.equal(controller.publicState(team[9]).result.saved,true,'offline participant awarded during shutdown drain');

// Fresh attempt verifies the absolute guardian deadline wins over a simultaneous final hit.
for(const session of team){act(session,{type:'raidLeave'});session.player.hp=session.player.maxHp;}
act(leader,{type:'raidCreate'});
for(const session of team.slice(1)){now+=1100;act(leader,{type:'raidInvite',targetId:session.player.id});const invite=controller.publicInvites(session)[0];act(session,{type:'raidRespond',invitationId:invite.id,accept:true});}
fight();atThreshold(70);atThreshold(50);
for(const session of team){const zone=RAID_SUIT_ZONES.find(zone=>zone.suit===run().members.get(session.player.id).suit);Object.assign(session.player,{x:zone.x,z:zone.z});}
step(10_000);atThreshold(40);const deadline=run().phaseEndsAt,guardian=enemies.find(enemy=>enemy.raidKind==='guardian');now=deadline;
assert.equal(controller.damageAllowed(guardian,Number.MAX_SAFE_INTEGER,now),0);assert.equal(run().phase,'wiped');assert(team.every(session=>session.instanceId===run().arenaId&&session.player.hp===session.player.maxHp));
assert(!enemies.some(enemy=>enemy.raidId===run().id),'wipe removes every combat entity');
assert(team.every(session=>!run().members.get(session.player.id).ready),'wipe requires a new ready check');
// Twenty-player scaling and the cap use the same frozen pull roster.
const checkpointRun=run();const replacement=player();now+=1100;act(leader,{type:'raidInvite',targetId:replacement.player.id});assert.equal(controller.publicInvites(replacement).length,0,'wipe cannot add members to an existing checkpoint');
for(const session of team)act(session,{type:'raidLeave'});
act(leader,{type:'raidCreate'});
for(const session of team.slice(1)){now+=1100;act(leader,{type:'raidInvite',targetId:session.player.id});const invite=controller.publicInvites(session)[0];act(session,{type:'raidRespond',invitationId:invite.id,accept:true});}
assert.notEqual(run(),checkpointRun,'a changed roster starts a fresh full route');
for(let index=0;index<10;index++){const session=player();team.push(session);now+=1100;act(leader,{type:'raidInvite',targetId:session.player.id});const invite=controller.publicInvites(session)[0];act(session,{type:'raidRespond',invitationId:invite.id,accept:true});}
const overflow=player();now+=1100;act(leader,{type:'raidInvite',targetId:overflow.player.id});assert.equal(controller.publicInvites(overflow).length,0,'twenty-player cap');
fight();assert.equal(run().lockedSize,20);assert.equal(run().boss.maxHp,800_000);
run().members.get(leader.player.id).marks=4;
run().hazards=[{id:'mark-check',kind:'Death Star',plane:'arena',shape:'circle',x:leader.player.x,z:leader.player.z,r:1,damage:.01,mark:true,startedAt:now-2000,impactAt:now,endsAt:now+600}];
controller.resolve(now);assert.equal(leader.player.hp,0,'fifth major-ability Mark executes');
for(const session of team)session.player.hp=0;step(100);assert.equal(run().phase,'wiped');assert(team.every(session=>session.player.hp===session.player.maxHp));
// The same controller owns readiness, leadership, offline roster removal and checkpoint continuation.
for (const session of team) act(session,{type:'raidLeave'});
for (const session of team) session.player.appearance.className='Ranger';
act(leader,{type:'raidCreate'});
for (const session of team.slice(1)) {
 now+=1100;act(leader,{type:'raidInvite',targetId:session.player.id});
 act(session,{type:'raidRespond',invitationId:controller.publicInvites(session)[0].id,accept:true});
}
const deputy=team[1];
act(deputy,{type:'raidCoLeader',targetId:deputy.player.id});assert.equal(run().coLeaderId,null,'members cannot appoint themselves');
act(leader,{type:'raidCoLeader',targetId:deputy.player.id});assert.equal(controller.publicState(deputy).coLeaderId,deputy.player.id);
act(deputy,{type:'raidKick',targetId:leader.player.id});assert.equal(run().members.size,20,'co-leader cannot remove leader');
act(deputy,{type:'raidKick',targetId:team[19].player.id});assert.equal(run().members.size,19,'co-leader can remove a lobby member');
now+=1100;act(deputy,{type:'raidInvite',targetId:team[19].player.id});const revokedInvite=controller.publicInvites(team[19])[0];assert(revokedInvite,'co-leader sees and invites candidates');
act(leader,{type:'raidCoLeader',targetId:null});act(team[19],{type:'raidRespond',invitationId:revokedInvite.id,accept:true});assert.equal(controller.bySession(team[19]),undefined,'revocation invalidates outstanding invitations');
act(deputy,{type:'raidKick',targetId:team[18].player.id});assert.equal(run().members.size,19,'revoked co-leader loses authority');
act(leader,{type:'raidCoLeader',targetId:deputy.player.id});now+=1100;act(deputy,{type:'raidInvite',targetId:team[19].player.id});act(team[19],{type:'raidRespond',invitationId:controller.publicInvites(team[19])[0].id,accept:true});
team.slice(0,9).forEach(session=>act(session,{type:'raidReady',ready:true}));act(leader,{type:'raidStart'});assert.equal(run().phase,'forming','nine ready cannot launch');
act(team[9],{type:'raidReady',ready:true});
controller.detach(team[19]);team[19].online=false;sessions.delete(team[19].player.id);
act(leader,{type:'raidStart'});assert.equal(run().phase,'approach','ten ready launch with extra unready and offline members');assert.equal(run().lockedSize,19,'every online member counts toward difficulty, including unready members');assert.equal(controller.bySession(team[19]),undefined,'offline nonparticipants are removed before the pull');
assert([...run().members.values()].every(member=>member.role==='damage'),'no healer or tank required');
const fixedClock=run().startedAt,fixedRun=run().runId;
controller.detach(team[18]);team[18].online=false;sessions.delete(team[18].player.id);
act(leader,{type:'raidKick',targetId:team[18].player.id});assert.equal(run().members.size,19,'cannot strip rewards or remove players during combat');
leader.player.hp=4321;controller.detach(leader);leader.online=false;sessions.delete(leader.player.id);
assert.equal(run().leaderId,deputy.player.id,'online co-leader succeeds disconnected leader');assert.equal(run().coLeaderId,null);
sessions.set(leader.player.id,leader);leader.online=true;controller.reattach(leader);assert.equal(leader.player.hp,4321,'leadership handoff does not revive or heal on reconnect');assert.equal(run().leaderId,deputy.player.id,'returning leader does not reclaim authority');
act(leader,{type:'raidCoLeader',targetId:team[2].player.id});assert.equal(run().coLeaderId,null,'former leader loses authority');
for (const enemy of [...enemies].filter(enemy=>enemy.alive)) damage(enemy,Number.MAX_SAFE_INTEGER);
assert(run().roomCleared);act(deputy,{type:'raidKick',targetId:team[18].player.id});assert.equal(controller.bySession(team[18]),undefined,'offline member can be removed without a session');
sessions.set(team[18].player.id,team[18]);team[18].online=true;controller.reattach(team[18]);assert.equal(team[18].instanceId,null,'removed member cannot rejoin the checkpoint');
for (const session of team.slice(9,18)) act(session,{type:'raidLeave'});
assert.equal(run().members.size,9,'members may leave a cleared chamber');
controller.detach(team[8]);team[8].online=false;sessions.delete(team[8].player.id);
Object.assign(deputy.player,RAID_APPROACH_EXIT);act(deputy,{type:'raidAdvance'});assert.equal(run().roomIndex,1,'offline member cannot block north gate');
sessions.set(team[8].player.id,team[8]);team[8].online=true;controller.reattach(team[8]);
team.slice(0,9).forEach(session=>session.player.hp=0);step(1);assert.equal(run().phase,'wiped');
team.slice(0,9).forEach(session=>act(session,{type:'raidReady',ready:true}));act(deputy,{type:'raidStart'});assert.equal(run().phase,'approach','nine players can retry');assert.equal(run().roomIndex,1);
assert.equal(run().lockedSize,19);assert.equal(run().startedAt,fixedClock);assert.equal(run().runId,fixedRun);
assert(enemies.filter(enemy=>enemy.alive).every(enemy=>enemy.maxHp>0));
// Role-free groups still receive distinct chain pairs and both Death Realm groups.
run().checkpoint=7;team.slice(0,9).forEach(session=>session.player.hp=0);step(1);
team.slice(0,9).forEach(session=>act(session,{type:'raidReady',ready:true}));act(deputy,{type:'raidStart'});
assert.equal(run().boss.maxHp,760000,'departures cannot lower encounter scaling');
run().nextAbility=now;run().abilityIndex=3;step(1);assert.equal(run().chains.length,2);assert.equal(new Set(run().chains.flatMap(chain=>[chain.firstId,chain.secondId])).size,4);
atThreshold(70);atThreshold(50);for(const session of team.slice(0,9)){const zone=RAID_SUIT_ZONES.find(zone=>zone.suit===run().members.get(session.player.id).suit);Object.assign(session.player,zone);}step(10000);atThreshold(40);
assert(team.slice(0,9).some(session=>session.instanceId===run().shadowId));assert(team.slice(0,9).some(session=>session.instanceId===run().arenaId));
controller.detach(deputy);deputy.online=false;sessions.delete(deputy.player.id);assert.equal(run().leaderId,leader.player.id,'leader disconnect falls back to an online member without a co-leader');
console.log('PASS raid server: strict entry, ten-ready launch, co-leader permissions/revocation/handoff, offline removal, nine-player checkpoint retries, locked scaling, reconnect HP, safe snapshots, crystals, clone tells/burst, ordered HP gates, suits, shielded split and seals, deadline wipe, fixed reward retry and replay.');
