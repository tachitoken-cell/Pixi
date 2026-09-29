import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear, maxHealth } from '../src/progression.ts';
import { NPCS } from '../src/content.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { BANKERS, AUCTIONEERS } from '../src/city-services.ts';
import { OVERWORLD_SPAWNS, toWorld, canTraverse, regionAt } from '../src/realm.ts';
import { createGatheringNodes } from '../src/gathering-nodes.ts';
import { goldSource } from '../src/gold-economy.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { bagUsage, bagCapacity } from '../src/bags.ts';
import { storyQuestById, storyQuestReady } from '../src/story-quests.ts';
import { STORY_OBJECTS } from '../src/story-world-data.ts';

const directory = mkdtempSync(join(tmpdir(), 'mossvale-story-quests-'));
const token = randomBytes(32).toString('base64url'), accountKey = createHash('sha256').update(token).digest('hex'), id = randomUUID();
const savePath = join(directory, 'players.json'), rowan = toWorld('greenwood', NPCS.find(npc => npc.id === 'rowan'));
const approach = point => {
  for (const dz of [1.5, -1.5, 2, -2, 0]) for (const dx of [0, 1.5, -1.5]) {
    const next = {x:point.x+dx,z:point.z+dz}; if(Math.hypot(dx,dz)<=2.8&&canTraverse(next,point)&&canTraverse(next,next))return next;
  }
  throw Error(`No fixture approach to ${point.id}`);
};
const hero = { id, name:'Story traveler', appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},
  coordinateVersion:2,zone:'greenwood',...approach(rowan),rotation:0,level:20,xp:0,gold:0,characterCreated:true,talents:[],...starterGear('Ranger'),
  inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},quest:{stage:0,kills:0,crystals:0} };
hero.hp=hero.maxHp=maxHealth(hero);
writeFileSync(savePath,JSON.stringify({[accountKey]:{characters:[hero]}}));
let game,client;
async function until(predicate,label,timeout=6500){const end=Date.now()+timeout;while(Date.now()<end){const value=predicate();if(value)return value;await delay(20);}throw Error(`Timed out: ${label}. Recent: ${JSON.stringify(client?.messages.filter(m=>['event','storyQuestDialogue'].includes(m.type)).slice(-8))}`);}
async function start(){
  game=createGameServer({port:0,host:'127.0.0.1',dataDir:directory,keycloak:null,databaseUrl:'',economyVersion:1});const port=await game.start();
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),current={socket,messages:[],welcomed:false};client=current;
  current.send=message=>socket.send(JSON.stringify(message));current.player=()=>current.snapshot?.players.find(player=>player.id===id);
  socket.on('message',raw=>{const message=JSON.parse(raw);current.messages.push(message);if(message.type==='welcome')current.welcomed=true;if(message.type==='snapshot')current.snapshot=message;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  current.send({type:'join',token,characterId:id});await until(()=>current.welcomed&&current.player(),'world entry');
}
async function stop(){client?.socket.terminate();await game?.stop();game=undefined;}
async function relocate(point,patch){
  await stop();const records=JSON.parse(readFileSync(savePath)),p=records[accountKey].characters[0];
  const spot=approach(point);Object.assign(p,spot,{zone:regionAt(spot.x,spot.z)});patch?.(p);writeFileSync(savePath,JSON.stringify(records));await start();
}
async function request(action,questId,extra={}){const from=client.messages.length;client.send({type:'storyQuest',action,questId,...extra});return until(()=>client.messages.slice(from).find(m=>m.type==='storyQuestDialogue'),'story '+action);}
async function reject(action){await delay(650);const from=client.messages.length;client.send(action);await until(()=>client.messages.slice(from).some(m=>m.type==='event'&&m.kind==='info'),'rejected action');}
try{
  await start();assert.deepEqual(client.player().storyQuests,{active:{},completed:[]},'missing legacy field migrates only to empty progress');
  const campaign=structuredClone(client.player().quest),welcome='story-welcome-to-lanternreach',slime='story-slime-at-the-gates';
  const offer=await request('talk',welcome);assert.equal(offer.phase,'offer');assert.equal(offer.reward.gold,goldSource(storyQuestById(welcome).reward.gold,'contract',true),'offer quotes current net Gold');
  await reject({type:'storyQuest',action:'accept',questId:'story-rainforest-remedies'});assert.deepEqual(client.player().storyQuests.active,{},'remote NPC cannot authorize acceptance');
  await request('accept',welcome);assert.deepEqual(client.player().storyQuests.active[welcome],[1,0,0,0],'accept credits the verified Rowan conversation only');
  await reject({type:'storyQuest',action:'claim',questId:welcome});assert.equal(client.player().gold,0,'unfinished quest pays nothing');
  for(const npc of [BANKERS.find(n=>n.zone==='greenwood'),AUCTIONEERS.find(n=>n.zone==='greenwood'),TRAINER_NPCS.find(n=>n.zone==='greenwood'&&n.className==='Ranger')]){
    await relocate(npc);client.send({type:'interact',targetId:npc.id});
    const index=npc.role==='banker'?1:npc.role==='auctioneer'?2:3;
    await until(()=>client.player().storyQuests.active[welcome][index]===1,`real visit ${npc.id}`);
  }
  assert(storyQuestReady(client.player().storyQuests,welcome));
  await reject({type:'storyQuest',action:'claim',questId:welcome});assert.equal(client.player().gold,0,'completion still requires the correct nearby giver');
  await relocate(rowan);assert(storyQuestReady(client.player().storyQuests,welcome),'objective progress survives restart');
  const result=await request('claim',welcome);assert.equal(result.phase,'reward');assert.equal(result.reward.gold,offer.reward.gold);assert.equal(result.reward.xp,20);
  assert(client.player().storyQuests.completed.includes(welcome));assert.deepEqual(client.player().quest,campaign,'separate story preserves legacy campaign');
  const claimed={gold:client.player().gold,xp:client.player().xp};
  const rewardCount=client.messages.filter(m=>m.type==='storyQuestDialogue'&&m.phase==='reward').length;
  await reject({type:'storyQuest',action:'claim',questId:welcome});assert.deepEqual({gold:client.player().gold,xp:client.player().xp},claimed,'replay pays nothing');
  assert.equal(client.messages.filter(m=>m.type==='storyQuestDialogue'&&m.phase==='reward').length,rewardCount,'replay cannot emit reward UI');
  await request('accept',slime);
  const spawn=OVERWORLD_SPAWNS.find(s=>s.kind==='moss-slime'&&s.zone==='greenwood'&&Math.hypot(s.x,s.z)<350);assert(spawn);
  await relocate(spawn);
  client.send({type:'autoAttack',targetId:spawn.id});
  await until(()=>client.player().storyQuests.active[slime][0]===1,'authoritative combat grants exactly one kill',15000);
  client.send({type:'autoAttack',targetId:null});
  // Helpers cover all six kill counts; resume a valid completed fixture to exercise potion preflight and one-time server reward.
  await relocate(rowan,p=>{p.storyQuests.active[slime][0]=6;
    for(const item of Object.values(LOOT_ITEMS)) { if(bagUsage(p)>=bagCapacity(p))break; if(!['wood','crystal','herb','potion','relic'].includes(item.id))p.carriedItems[item.id]=1; }
  });
  assert.equal(bagUsage(client.player()),bagCapacity(client.player()));
  await reject({type:'storyQuest',action:'claim',questId:slime});assert(storyQuestReady(client.player().storyQuests,slime),'full bags retain claimable quest');
  await relocate(rowan,p=>{p.carriedItems={};});
  const beforePotions=client.player().inventory.potion;await request('claim',slime);
  assert.equal(client.player().inventory.potion,beforePotions+3,'authored potion count awarded');
  await relocate(rowan);assert(client.player().storyQuests.completed.includes(slime));
  await reject({type:'storyQuest',action:'claim',questId:slime});assert.equal(client.player().inventory.potion,beforePotions+3,'durable replay cannot duplicate potions');
  const aurelia=TRAINER_NPCS.find(n=>n.id==='trainer-greenwood-cleric-trainer');await relocate(aurelia);
  const herbs='story-a-bitter-remedy';await request('accept',herbs);
  const node=createGatheringNodes().find(n=>n.kind==='herb'&&n.zone==='greenwood');assert(node);await relocate(node);
  client.send({type:'gather',targetId:node.id});await until(()=>client.player().storyQuests.active[herbs][0]===1,'real profession gather increments quest');
  await relocate(aurelia);await request('talk',herbs);await reject({type:'storyQuest',action:'accept',questId:herbs,progress:[6]});
  assert.equal(client.player().storyQuests.active[herbs][0],1,'extra forged progress fields are rejected');
  // Delivery uses two different existing NPCs in different world-coordinate regions.
  await relocate(rowan,p=>{p.storyQuests.completed.push('story-what-the-slime-left-behind');});
  const delivery='story-a-message-for-sable';await request('accept',delivery);
  const sable=toWorld('amberwild',NPCS.find(n=>n.id==='sable'));await relocate(sable);
  const deliveryReturn=await request('talk',delivery);assert.equal(deliveryReturn.phase,'complete');assert.equal(deliveryReturn.npcId,'sable');
  await request('claim',delivery);assert(client.player().storyQuests.completed.includes(delivery),'world-space Sable accepts delivery and awards once');
  // Seed only valid earlier chapter completions, then use real interactions for the new objectives.
  function unlock(p,id){for(const prerequisite of storyQuestById(id).requires??[]){unlock(p,prerequisite);delete p.storyQuests.active[prerequisite];if(!p.storyQuests.completed.includes(prerequisite))p.storyQuests.completed.push(prerequisite);}}
  const camp='story-the-old-campfire',pack=STORY_OBJECTS.find(object=>object.id==='story-abandoned-pack');
  await relocate(rowan,p=>unlock(p,camp));await request('accept',camp);
  await reject({type:'interact',targetId:pack.id});assert.deepEqual(client.player().storyQuests.active[camp],[0],'distant quest object grants nothing');
  await relocate(pack);client.send({type:'interact',targetId:pack.id});await until(()=>storyQuestReady(client.player().storyQuests,camp),'actual pack interaction');
  await reject({type:'interact',targetId:pack.id});assert.deepEqual(client.player().storyQuests.active[camp],[1],'object replay is bounded');
  await relocate(rowan);await request('claim',camp);
  const survey='story-the-missing-surveyor',surveyCamp=STORY_OBJECTS.find(object=>object.id==='story-surveyor-camp');
  await relocate(sable,p=>unlock(p,survey));await request('accept',survey);await relocate(surveyCamp);
  await reject({type:'interact',targetId:surveyCamp.id});assert.deepEqual(client.player().storyQuests.active[survey],[0,0,0,0],'final survey camp requires all markers');
  for(const marker of STORY_OBJECTS.filter(object=>object.questId===survey&&object.id!==surveyCamp.id)){
    const index=storyQuestById(survey).objectives.findIndex(objective=>objective.targets.includes(marker.id));
    await relocate(marker);client.send({type:'interact',targetId:marker.id});await until(()=>client.player().storyQuests.active[survey][index]===1,marker.id);
  }
  await relocate(surveyCamp);client.send({type:'interact',targetId:surveyCamp.id});await until(()=>storyQuestReady(client.player().storyQuests,survey),'ordered survey completion');
  const scoutQuest='story-the-lost-scout',scout=STORY_OBJECTS.find(object=>object.id==='story-lost-scout');
  await relocate(scout,p=>{unlock(p,scoutQuest);p.storyQuests.active[scoutQuest]=[0,0];});
  const beforeRescue={gold:client.player().gold,xp:client.player().xp};
  client.send({type:'interact',targetId:scout.id});await until(()=>client.snapshot.storyEncounter?.objectId===scout.id,'rescue begins on first discovery click');
  assert.deepEqual(client.player().storyQuests.active[scoutQuest],[1,0]);
  const rescueEnemies=()=>client.snapshot.enemies.filter(enemy=>enemy.id.startsWith('story-encounter-'));
  await until(()=>rescueEnemies().length===2,'first authored rescue wave');
  await delay(650);client.send({type:'interact',targetId:scout.id});await delay(150);
  assert.equal(rescueEnemies().length,2,'repeated interaction cannot spawn more attackers');
  await until(()=>client.snapshot.storyEncounter?.hp<100,'unengaged attackers reach and hurt protected traveler',12000);
  await reject({type:'interact',targetId:'story-defend-scout'});assert.equal(client.player().storyQuests.active[scoutQuest][1],0,'client cannot forge rescue completion');
  assert.deepEqual({gold:client.player().gold,xp:client.player().xp},beforeRescue,'starting and repeating rescue creates no rewards');
  await relocate(scout);assert.equal(client.snapshot.storyEncounter,null,'ephemeral rescue ends on disconnect');assert.equal(rescueEnemies().length,0,'old enemies are removed');
  assert.deepEqual(client.player().storyQuests.active[scoutQuest],[1,0],'discovery persists but rescue stays unfinished');
  client.send({type:'interact',targetId:scout.id});await until(()=>client.snapshot.storyEncounter,'disconnected rescue can retry');
  await stop();const saved=JSON.parse(readFileSync(savePath))[accountKey].characters[0];assert.equal(saved.storyQuests.active[herbs][0],1);assert.deepEqual(saved.quest,campaign);
  console.log('PASS: real WebSocket legacy migration, source offers/current Gold quote, four NPC visits, remote/unfinished/forged rejection, combat/gathering credit, actual quest objects/distance/order/replay, first-click rescue/NPC damage/duplicate prevention/restart retry, one-time rewards, campaign preservation and persistence.');
}finally{await stop();rmSync(directory,{recursive:true,force:true});}
