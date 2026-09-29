import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newAchievements } from '../src/achievements.ts';
import { spellsForClass, defaultHotbar } from '../src/spells.ts';
import { regionAt, toWorld } from '../src/realm.ts';
import { newRaidProgress, raidProgressValid, raidRewardChanges, rollRaidRewards, specialistUpgradeCost, SP_UPGRADE_ODDS } from '../src/raid-progression.ts';

const dataDir=mkdtempSync(join(tmpdir(),'mossvale-raid-progression-')),file=join(dataDir,'players.json'),clients=[],realNow=Date.now;
let clock=realNow(),game,port;Date.now=()=>clock;
const hash=token=>createHash('sha256').update(token).digest('hex');
async function until(predicate,label){const end=realNow()+6000;while(realNow()<end){const result=predicate();if(result)return result;await delay(15);}throw Error(`Timed out: ${label}`);}
async function tick(){clock+=1100;await delay(130);}
function hero(name,level=60){
  const className='Knight',point=toWorld('greenwood',{x:0,z:22}),learnedSpells=spellsForClass(className).filter(spell=>spell.requiredLevel<=level).map(spell=>spell.id);
  const p={id:randomUUID(),name,...point,zone:regionAt(point.x,point.z),coordinateVersion:2,rotation:0,
    appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className},characterCreated:true,talents:[],...starterGear(className),...newBags(),
    learnedSpells,hotbar:defaultHotbar(className,level,learnedSpells),ridingRank:0,ownedMounts:[],ownedPets:[],hp:100+(level-1)*12,maxHp:100+(level-1)*12,level,xp:0,gold:37,
    carriedItems:{'trail-bread':1,'sp-protection-roll':1,'sp-revival-core':1},inventory:{wood:0,crystal:10000,herb:0,potion:3,relic:10000},
    skills:{mining:0,woodcutting:0,herbalism:0},quest:{stage:0,kills:0,crystals:0},raidProgress:newRaidProgress()};
  p.achievements=newAchievements(p);p.achievements.dungeons.veilhaven=1;return p;
}
const heroes=[hero('Apostle Keeper'),hero('Young Keeper',59)],tokens=heroes.map(()=>randomBytes(32).toString('base64url'));
// A durable fractured raid card exercises repair without weakening the production crypto RNG.
const brokenId=randomUUID();heroes[0].raidProgress.specialists.push({id:brokenId,className:'Knight',jobXp:12000,upgrade:7,broken:true,attempts:20,source:'raid',sealed:false});
const savedActive={id:randomUUID(),className:'Knight',jobXp:81000,upgrade:12,broken:false,attempts:45,source:'raid',sealed:false};
heroes[0].raidProgress.specialists.push(savedActive);heroes[0].raidProgress.activeSpecialistId=savedActive.id;
Object.assign(heroes[0],raidRewardChanges(heroes[0],'fixture-clear',rollRaidRewards(()=>0)));
Object.assign(heroes[0].raidProgress,{sigils:100,evolutionCores:10,souls:1});
assert(raidProgressValid(heroes[0].raidProgress));
const stored=index=>JSON.parse(readFileSync(file,'utf8'))[hash(tokens[index])].characters[0];
const collection=p=>structuredClone({raidProgress:p.raidProgress,inventory:p.inventory,carriedItems:p.carriedItems,ownedGear:p.ownedGear,ownedPets:p.ownedPets,title:p.title,gold:p.gold,xp:p.xp});
async function start(){
  const spawns=ZONES.map(zone=>zone.enemies);ZONES.forEach(zone=>zone.enemies=[]);
  try{game=createGameServer({port:0,host:'127.0.0.1',dataDir,keycloak:null,databaseUrl:''});}finally{ZONES.forEach((zone,index)=>zone.enemies=spawns[index]);}
  port=await game.start();
}
async function connect(index){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),client={socket,messages:[],outcomes:[],index};clients.push(client);
  client.send=message=>socket.send(JSON.stringify(message));client.player=()=>client.snapshot?.players.find(player=>player.id===heroes[index].id);
  socket.on('message',raw=>{const message=JSON.parse(raw);client.messages.push(message);if(message.specialistUpgrade)client.outcomes.push({message,durable:stored(index)});if(['roster','welcome','snapshot'].includes(message.type))client[message.type]=message;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  client.send({type:'join',token:tokens[index],characterId:heroes[index].id});await until(()=>client.player(),'selected character');return client;
}
async function action(client,message,error){
  await tick();const index=client.messages.length,outcomeIndex=client.outcomes.length;client.send(message);
  const reply=await until(()=>client.messages.slice(index).find(m=>m.type==='event'&&(error?m.kind==='info':m.kind==='reward'&&m.requestType===message.type)),message.type);
  if(error)assert.match(reply.text,error);else assert.equal(reply.text,'Raid collection saved.');
  if(!error)await until(()=>client.messages.indexOf(client.snapshot)>client.messages.indexOf(reply),'snapshot after saved acknowledgement');
  const outcomes=client.outcomes.slice(outcomeIndex);
  if(message.type==='raidSpUpgrade'&&!error){
    assert.equal(outcomes.length,1,'one persisted attempt produces one outcome');
    const result=outcomes[0],savedCard=result.durable.raidProgress.specialists.find(card=>card.id===message.specialistId);
    assert.equal(result.message.upgradeEffectId,message.upgradeEffectId,'result belongs to the exact visual request');
    assert.equal(savedCard.attempts,message.expectedAttempts+1,'the attempt is durable when its outcome reaches the client');
    assert.equal(result.message.specialistUpgrade,savedCard.broken?'break':savedCard.upgrade>message.expectedUpgrade?'success':'fail','the visual reports only the saved outcome');
  }else assert.equal(outcomes.length,0,'rejected and failed saves cannot play a committed outcome');
  if(message.type==='raidSpUpgrade'&&error&&message.upgradeEffectId&&reply.requestType==='raidSpUpgrade')assert.equal(reply.upgradeEffectId,message.upgradeEffectId,'failed request cancels only its own visual');
  return reply;
}
async function rejected(client,message,pattern){
  const before=collection(stored(client.index)),visible=collection(client.player());await action(client,message,pattern);
  assert.deepEqual(collection(stored(client.index)),before,'rejection leaves durable materials, tools, cards and rewards unchanged');
  assert.deepEqual(collection(client.player()),visible,'rejection leaves live collection unchanged');
}
const card=(client,id)=>client.player().raidProgress.specialists.find(entry=>entry.id===id);
const upgrade=(client,id,protect=false)=>({type:'raidSpUpgrade',specialistId:id,protect,expectedUpgrade:card(client,id).upgrade,expectedAttempts:card(client,id).attempts,upgradeEffectId:randomUUID()});
try{
  writeFileSync(file,JSON.stringify(Object.fromEntries(heroes.map((p,index)=>[hash(tokens[index]),{characters:[p]}]))));
  await start();let veteran=await connect(0);const young=await connect(1);
  assert.equal(veteran.player().raidProgress.activeSpecialistId,null,'suspended activation is not projected to clients');
  assert.equal(stored(0).raidProgress.activeSpecialistId,savedActive.id,'projection does not erase the saved activation');
  assert.deepEqual(stored(0).raidProgress.specialists.find(card=>card.id===savedActive.id),savedActive,'saved job XP, rank and attempts remain intact');
  await rejected(young,{type:'raidSpUnlock'},/level 60/);
  await rejected(veteran,{type:'raidSpUnlock',raidProgress:{sigils:999999}},/controlled by the realm/);
  await rejected(veteran,{type:'raidSpUnlock',extra:true},/Invalid raid collection/);
  await action(veteran,{type:'raidSpUnlock'});
  const quest=veteran.player().raidProgress.specialists.find(entry=>entry.source==='quest'),questId=quest.id;assert.equal(veteran.player().raidProgress.activeSpecialistId,null);
  assert.equal(quest.source,'quest');assert.equal(quest.upgrade,0);assert.equal(quest.attempts,0);
  assert.equal(stored(0).raidProgress.specialists.length,3,'claim is persisted before success acknowledgment');
  assert.equal(stored(0).raidProgress.activeSpecialistId,savedActive.id,'claiming a suspended card does not replace a preserved activation');
  assert.deepEqual(stored(0).raidProgress.claimedSpecialistClasses,['Knight']);
  await rejected(veteran,{type:'raidSpUnlock'},/already been claimed/);
  await action(veteran,{type:'raidSpEquip',specialistId:null});assert.equal(veteran.player().raidProgress.activeSpecialistId,null);
  await rejected(veteran,{type:'raidSpEquip',specialistId:questId},/temporarily disabled/);
  await rejected(veteran,{type:'raidSpEquip',specialistId:brokenId},/temporarily disabled/);
  await rejected(veteran,{type:'raidSpEquip',specialistId:randomUUID()},/temporarily disabled/);
  const packet=upgrade(veteran,questId),beforeUpgrade=stored(0);
  await action(veteran,packet);
  assert.equal(card(veteran,questId).attempts,1);assert([0,1].includes(card(veteran,questId).upgrade));assert(!card(veteran,questId).broken);
  assert.equal(stored(0).inventory.crystal,beforeUpgrade.inventory.crystal-specialistUpgradeCost(0).crystal);
  assert.equal(stored(0).inventory.relic,beforeUpgrade.inventory.relic);
  await rejected(veteran,packet,/upgrade changed/);
  await rejected(veteran,{...upgrade(veteran,questId),upgrade:15},/Invalid raid collection/);

  await action(veteran,{type:'raidSpRepair',specialistId:brokenId});
  assert.deepEqual(card(veteran,brokenId),{...heroes[0].raidProgress.specialists[0],broken:false});
  assert.equal(stored(0).carriedItems['sp-revival-core'],0);
  await rejected(veteran,{type:'raidSpRepair',specialistId:brokenId},/does not need repair/);
  await rejected(veteran,{type:'raidSpEquip',specialistId:brokenId},/temporarily disabled/);

  // The real atomic writer fails after a complete upgrade has been staged.
  const protectedPacket=upgrade(veteran,brokenId,true),beforeFailure=collection(stored(0)),liveBeforeFailure=collection(veteran.player());
  await delay(1100);mkdirSync(`${file}.tmp`);
  try{await action(veteran,protectedPacket,/could not be saved/);}finally{rmSync(`${file}.tmp`,{recursive:true,force:true});}
  assert.deepEqual(collection(stored(0)),beforeFailure,'EISDIR rolls back materials, roll, protection and card changes');
  assert.deepEqual(collection(veteran.player()),liveBeforeFailure,'failed persistence cannot expose an upgrade in the snapshot');
  await action(veteran,protectedPacket);
  assert.equal(card(veteran,brokenId).attempts,21);assert([7,8].includes(card(veteran,brokenId).upgrade));assert(!card(veteran,brokenId).broken);
  assert.equal(card(veteran,brokenId).jobXp,12000);assert.equal(stored(0).carriedItems['sp-protection-roll'],0);
  assert.equal(stored(0).inventory.crystal,beforeFailure.inventory.crystal-specialistUpgradeCost(7).crystal);
  assert.equal(stored(0).inventory.relic,beforeFailure.inventory.relic-specialistUpgradeCost(7).relic);
  await rejected(veteran,protectedPacket,/upgrade changed/);
  await rejected(veteran,upgrade(veteran,brokenId,true),/Protection Roll/);

  // Deterministic event fixtures exercise every committed branch with the real writer.
  // The production RNG remains cryptographic; only this isolated test's odds row changes.
  for(const outcome of ['success','fail','break']){
    const packet=upgrade(veteran,questId),odds=SP_UPGRADE_ODDS[packet.expectedUpgrade],original=[...odds];
    odds[0]=outcome==='success'?100:0;odds[1]=outcome==='break'?100:0;
    try{await action(veteran,packet);assert.equal(veteran.outcomes.at(-1).message.specialistUpgrade,outcome);}finally{odds.splice(0,odds.length,...original);}
  }

  for(let stage=1;stage<=3;stage++){await action(veteran,{type:'raidPetEvolve'});assert.equal(stored(0).raidProgress.petEvolution,stage);}
  assert.equal(stored(0).raidProgress.evolutionCores,0);assert.equal(stored(0).raidProgress.souls,0);
  await rejected(veteran,{type:'raidPetEvolve'},/below evolution III/);
  for(const cosmetic of ['apostle-wings','black-aura','apostle-weapon'])await action(veteran,{type:'raidCosmeticEquip',cosmetic,equipped:true});
  assert.equal(stored(0).raidProgress.equippedCosmetics.length,3);
  await action(veteran,{type:'raidCosmeticEquip',cosmetic:'black-aura',equipped:false});
  assert.deepEqual(stored(0).raidProgress.equippedCosmetics,['apostle-wings','apostle-weapon']);
  await action(veteran,{type:'raidClaimHorns'});assert(stored(0).ownedGear.includes('death-horns'));assert(!stored(0).raidProgress.pendingHorns);
  await rejected(veteran,{type:'raidClaimHorns'},/No Death Horns/);
  await tick();const mark=veteran.messages.length;veteran.send({type:'selectTitle',titleId:'death-defier'});
  const title=await until(()=>veteran.messages.slice(mark).find(m=>m.type==='titleSelected'),'raid title');assert.equal(title.error,undefined);assert.equal(stored(0).title,'death-defier');
  const durable=collection(stored(0)),visible=collection(veteran.player());
  assert.equal(durable.gold,37);assert.equal(durable.xp,0);assert.deepEqual(durable.raidProgress.completedRuns,['fixture-clear']);
  assert.deepEqual(visible.raidProgress.completedRuns,[],'private receipt history stays out of snapshots');
  veteran.socket.close();await until(()=>veteran.socket.readyState===WebSocket.CLOSED,'disconnect');veteran=await connect(0);
  assert.deepEqual(collection(veteran.player()),visible,'reconnect retains every collection change');
  for(const client of clients)client.socket.terminate();await game.stop();game=undefined;
  assert.deepEqual(collection(stored(0)),durable,'shutdown retains receipts and collection');
  await start();veteran=await connect(0);assert.deepEqual(collection(veteran.player()),visible,'restart reloads the real durable progression');
  await rejected(veteran,protectedPacket,/upgrade changed/);await rejected(veteran,{type:'raidSpUnlock'},/already been claimed/);
  console.log('PASS live raid progression: suspended projection preserves saved cards, claim/equip guards, correlated success/fail/break only after persistence, crypto upgrade and stale replay, fracture repair/protection, no FX after EISDIR rollback, pet evolutions, cosmetics/horns/title, private receipts, reconnect and restart durability.');
}finally{
  rmSync(`${file}.tmp`,{recursive:true,force:true});for(const client of clients)client.socket.terminate();await game?.stop();Date.now=realNow;rmSync(dataDir,{recursive:true,force:true});
}
