import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { spellsForClass, defaultHotbar } from '../src/spells.ts';
import { regionAt, toWorld } from '../src/realm.ts';

const dataDir=mkdtempSync(join(tmpdir(),'mossvale-raid-live-')),clients=[],realNow=Date.now;
let clock=realNow(),game,port;Date.now=()=>clock;
async function until(predicate,label){const end=realNow()+6000;while(realNow()<end){const result=predicate();if(result)return result;await delay(15);}throw Error(`Timed out: ${label}`);}
async function tick(ms=1100){clock+=ms;await delay(130);}
function hero(index){
  const className=index===0?'Knight':index<3?'Cleric':'Ranger',level=index===10?59:60,point=toWorld('greenwood',{x:0,z:22}),learnedSpells=spellsForClass(className).filter(spell=>spell.requiredLevel<=level).map(spell=>spell.id);
  return {id:randomUUID(),name:`Raider${String.fromCharCode(65+index)}`,...point,zone:regionAt(point.x,point.z),coordinateVersion:2,rotation:0,
    appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className},characterCreated:true,talents:[],...starterGear(className),
    learnedSpells,hotbar:defaultHotbar(className,level,learnedSpells),ridingRank:0,ownedMounts:[],hp:100+(level-1)*12,maxHp:100+(level-1)*12,level,xp:0,gold:0,carriedItems:{'trail-bread':1},
    inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},skills:{mining:0,woodcutting:0,herbalism:0},quest:{stage:0,kills:0,crystals:0}};
}
async function connect(token,id){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),client={socket,token,id,messages:[]};clients.push(client);
  client.send=message=>socket.send(JSON.stringify(message));client.player=()=>client.snapshot?.players.find(player=>player.id===id);
  socket.on('message',raw=>{const message=JSON.parse(raw);client.messages.push(message);if(['roster','welcome','snapshot'].includes(message.type))client[message.type]=message;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  client.send({type:'join',token});await until(()=>client.roster,'roster');client.send({type:'selectCharacter',characterId:id});await until(()=>client.player(),'selected character');return client;
}
try{
  const heroes=Array.from({length:11},(_,index)=>hero(index)),tokens=heroes.map(()=>randomBytes(32).toString('base64url'));
  writeFileSync(join(dataDir,'players.json'),JSON.stringify(Object.fromEntries(heroes.map((p,index)=>[createHash('sha256').update(tokens[index]).digest('hex'),{characters:[p]}]))));
  const spawns=ZONES.map(zone=>zone.enemies);ZONES.forEach(zone=>zone.enemies=[]);
  try{game=createGameServer({port:0,host:'127.0.0.1',dataDir,keycloak:null,databaseUrl:''});}finally{ZONES.forEach((zone,index)=>zone.enemies=spawns[index]);}
  port=await game.start();const team=await Promise.all(tokens.map((token,index)=>connect(token,heroes[index].id))),leader=team[0];
  for(const member of team.slice(1,4)){
    await tick();leader.send({type:'partyInvite',targetId:member.id});const invite=await until(()=>member.snapshot.partyInvites?.[0],'ordinary party invite');
    member.send({type:'partyAccept',invitationId:invite.id});await until(()=>member.snapshot.party?.id,'ordinary party accept');
  }
  await until(()=>leader.snapshot.party?.members.length===4,'ordinary four-player party');await tick();
  const prior=leader.messages.length;leader.send({type:'partyInvite',targetId:team[4].id});await until(()=>leader.messages.slice(prior).some(message=>message.type==='event'&&message.kind==='info'),'four-player cap rejection');
  assert.equal(leader.snapshot.party.members.length,4);assert.equal(team[4].snapshot.partyInvites.length,0);
  for(const member of team.slice(0,4))member.send({type:'partyLeave'});
  await until(()=>team.slice(0,4).every(member=>!member.snapshot.party),'ordinary party disband');
  team[10].send({type:'raidCreate'});await tick();assert.equal(team[10].snapshot.raid,null,'server enforces level 60');
  leader.send({type:'raidCreate'});await until(()=>leader.snapshot.raid?.phase==='forming','raid lobby');
  const instance=leader.snapshot.instanceId;assert(instance.startsWith('raid-'));
  assert.equal(leader.snapshot.raid.candidates.length,9,'leader sees eligible overworld candidates from private lobby');assert(!leader.snapshot.raid.candidates.some(candidate=>candidate.id===team[10].id));
  for(const member of team.slice(1,10)){
    await tick();leader.send({type:'raidInvite',targetId:member.id});const invite=await until(()=>member.snapshot.raidInvites?.[0],'raid invite');
    member.send({type:'raidRespond',invitationId:invite.id,accept:true});await until(()=>member.snapshot.raid?.id===leader.snapshot.raid.id,'accepted raid');
  }
  team.slice(0,10).forEach((member,index)=>member.send({type:'raidReady',ready:true,role:index===0?'tank':index<3?'healer':'damage'}));
  await until(()=>leader.snapshot.raid.members.length===10&&leader.snapshot.raid.members.every(member=>member.ready),'ready roster');
  leader.send({type:'raidStart'});await until(()=>leader.snapshot.raid.phase==='approach','full raid pull');
  assert.equal(leader.snapshot.raid.lockedSize,10);assert.equal(leader.snapshot.raid.approach.roomIndex,0);assert.equal(leader.snapshot.raid.approach.remaining,4);
  assert.equal(leader.snapshot.dungeon,null,'raid is not an ordinary dungeon');assert.equal(leader.snapshot.party,null);
  assert(team.slice(0,10).every(member=>member.snapshot.instanceId===instance));
  // A raid starts across the whole room, beyond the root-warden model's ordinary 13m aggro range.
  // Its authoritative warning must retain the actor's cast lock on subsequent server ticks.
  await tick(3500);
  const warning=await until(()=>leader.snapshot.raid.hazards.find(hazard=>hazard.kind==='Voidroot Quake'),'opening creature warning');
  const source=leader.snapshot.enemies.find(enemy=>enemy.id===warning.sourceId);
  assert(team.slice(0,10).every(member=>Math.hypot(member.player().x-source.x,member.player().z-source.z)>13));
  assert.equal(source.attack?.id,warning.id,'ordinary aggro cleanup must not cancel a room-wide raid cast');
  await tick(200);
  const castingSource=leader.snapshot.enemies.find(enemy=>enemy.id===source.id);
  assert.equal(castingSource.attack?.id,warning.id,'raid cast remains locked through later ticks');
  assert.equal(castingSource.x,source.x);assert.equal(castingSource.z,source.z,'warning source stays fixed until impact');
  const healer=team[1];healer.send({type:'attack',ability:'prayer-of-mending',targetId:leader.id});
  await until(()=>healer.player().casting?.ability==='prayer-of-mending','chain healing accepts a raid ally outside an ordinary party');
  await tick(1500);
  const prayer=await until(()=>healer.messages.find(message=>message.type==='combat'&&message.ability==='prayer-of-mending'),'raid chain heal release');
  assert.equal(prayer.targets.length,3,'raid chain healing keeps the existing target cap');assert.equal(prayer.targets[0].id,leader.id);
  const ranged=team[3];
  while(ranged.player().z>10){await tick(700);const z=Math.max(10,ranged.player().z-2.8);ranged.send({type:'move',x:ranged.player().x,z,rotation:Math.PI});await until(()=>Math.abs(ranged.player().z-z)<.01,'legal raid movement');}
  const target=leader.snapshot.enemies.filter(enemy=>enemy.alive).sort((a,b)=>Math.hypot(a.x-ranged.player().x,a.z-ranged.player().z)-Math.hypot(b.x-ranged.player().x,b.z-ranged.player().z))[0],targetHp=target.hp;
  await tick(1000);ranged.send({type:'attack',ability:'arrow',targetId:target.id});
  await until(()=>ranged.player().casting?.ability==='arrow'||ranged.messages.some(message=>message.type==='combat'&&message.playerId===ranged.id&&message.ability==='arrow'),'raid attack accepted');
  await tick(3000);await until(()=>leader.snapshot.enemies.find(enemy=>enemy.id===target.id)?.hp<targetHp,'normal spell damage reaches lead-in creature');
  while(leader.player().z>17){await tick(700);const z=Math.max(17,leader.player().z-2.8);leader.send({type:'move',x:leader.player().x,z,rotation:Math.PI});await until(()=>Math.abs(leader.player().z-z)<.01,'leader approaches within normal taunt range');}
  let tauntSource;
  for(let attempt=0;attempt<60&&!tauntSource;attempt++){
    tauntSource=leader.snapshot.enemies.find(enemy=>enemy.alive&&enemy.attack&&!enemy.attack.basic&&enemy.attack.impactAt-clock>1200&&enemy.targetId!==leader.id&&Math.hypot(enemy.x-leader.player().x,enemy.z-leader.player().z)<18);
    if(!tauntSource)await tick(250);
  }
  assert(tauntSource,'a nearby creature casts while targeting another raider');
  leader.send({type:'attack',ability:'taunt',targetId:tauntSource.id});
  await until(()=>leader.messages.some(message=>message.type==='combat'&&message.ability==='taunt'),'taunt released');await tick(1100);
  const taunted=leader.snapshot.enemies.find(enemy=>enemy.id===tauntSource.id);
  assert.equal(taunted.targetId,leader.id,'taunt changes future targeting');assert.equal(taunted.attack?.id,tauntSource.attack.id,'taunt preserves the authoritative current cast');
  const member=team[9],hp=member.player().hp;
  member.socket.close();await until(()=>leader.snapshot.raid.members.find(entry=>entry.id===member.id)?.online===false,'raid reserves disconnected member');
  const rejoined=await connect(member.token,member.id);
  assert.equal(rejoined.snapshot.instanceId,instance);assert.equal(rejoined.player().hp,hp,'real account reconnect preserves HP');assert.equal(rejoined.snapshot.raid.lockedSize,10);
  rejoined.send({type:'raidLeave'});await tick(100);assert.equal(rejoined.snapshot.instanceId,instance,'locked roster rejects mid-pull exit');
  rejoined.send({type:'raidReady',role:'healer',ready:false});await tick(100);assert.equal(rejoined.snapshot.raid.members.find(entry=>entry.id===rejoined.id).role,'damage');
  const mark=rejoined.messages.length;rejoined.send({type:'dungeonEnter',dungeonId:'rootvault'});await tick(100);assert.equal(rejoined.snapshot.instanceId,instance,'dungeon entry cannot displace raid');
  assert(rejoined.messages.slice(mark).some(message=>message.type==='event'));
  assert(!leader.snapshot.enemies.some(enemy=>Object.hasOwn(enemy,'threat')||Object.hasOwn(enemy,'raidId')),'private combat runtime never leaks');
  console.log('PASS live raid WebSockets: level gate, ten invitations, ready roles, locked pull, isolated instance, distant and taunted cast locks, raid chain healing cap, actual spell damage, real disconnect/account-save/rejoin, no HP reset, active roster and dungeon-entry guards.');
}finally{
  for(const client of clients)client.socket.terminate();await game?.stop();Date.now=realNow;rmSync(dataDir,{recursive:true,force:true});
}
