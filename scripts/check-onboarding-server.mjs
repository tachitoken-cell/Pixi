import { COMMUNITY_VERSION } from '../src/community.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS, ZONES, NPCS } from '../src/content.ts';
import { newContracts, BOARD_POSITION } from '../src/adventure.ts';
import { starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { spellsForClass, defaultHotbar, GLOBAL_ATTACK_MS } from '../src/spells.ts';
import { newOnboarding, onboardingFeatureUnlocked } from '../src/onboarding.ts';
import { BUILDING_CHAIRS, buildingAt, chairApproach } from '../src/buildings.ts';
import { AUCTIONEER, CITY_CLOCKTOWER } from '../src/city.ts';
import { canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { movementCost } from '../src/landscape.ts';
import { WALK_SPEED } from '../src/travel.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';

const dir=mkdtempSync(join(tmpdir(),'mossvale-onboarding-')),file=join(dir,'players.json'),clients=[];
const realNow=Date.now;let clock=realNow(),game,port;Date.now=()=>clock;
const hash=token=>createHash('sha256').update(token).digest('hex');
const tokens=Object.fromEntries(['fresh','legacy','contractFirst','trainingFirst','viewsLast','complete'].map(key=>[key,randomBytes(32).toString('base64url')]));
const appearance={skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'};
const trainer=TRAINER_NPCS.find(n=>n.zone==='greenwood'&&n.className==='Ranger');
const levelTwo=spellsForClass('Ranger').find(s=>s.requiredLevel===2).id;
const quest=(chapter=0,stage=0)=>({chapter,stage,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[chapter].objectives.map(o=>[o.id,0])),completed:false,ending:null});
function hero(name,extra={}) {
 const level=extra.level??2,learnedSpells=['arrow'];
 return {id:randomUUID(),name,appearance:{...appearance},characterCreated:true,coordinateVersion:2,zone:'greenwood',x:BOARD_POSITION.x,z:BOARD_POSITION.z+1,rotation:0,
  level,xp:0,hp:100+(level-1)*12,maxHp:100+(level-1)*12,gold:10,inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},carriedItems:{},itemUseReadyAt:0,
  talents:[],...starterGear('Ranger'),...newBags(),learnedSpells,hotbar:defaultHotbar('Ranger',level,learnedSpells),ridingRank:0,ownedMounts:[],skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,
  contracts:newContracts(),quest:quest(),...extra};
}
const lessons={...newOnboarding(),looted:true,bagViewed:true,gearViewed:true};
const heroes={
 legacy:hero('Legacy beginner',{level:1,gold:0}),
 contractFirst:hero('Contract first',{quest:quest(1,1),onboarding:{...lessons}}),
 trainingFirst:hero('Training first',{x:trainer.x,z:trainer.z+2,quest:quest(1,1),onboarding:{...lessons}}),
 viewsLast:hero('Views last',{quest:quest(1,1),learnedSpells:['arrow',levelTwo],contracts:{active:{'greenwood-hunt':0},completed:{}},onboarding:{...newOnboarding(),looted:true}}),
 complete:hero('Young graduate',{level:4,onboarding:{...lessons,completed:true},x:AUCTIONEER.x,z:AUCTIONEER.z+2}),
};
const records=Object.fromEntries(Object.entries(tokens).map(([key,token])=>[hash(token),{characters:heroes[key]?[heroes[key]]:[]}]));
const stored=key=>JSON.parse(readFileSync(file,'utf8'))[hash(tokens[key])].characters[0];
async function until(fn,label,timeout=6000){const end=realNow()+timeout;while(realNow()<end){const result=fn();if(result)return result;await delay(10);}throw Error(`Timed out: ${label}`);}
async function tick(ms=700){clock+=ms;await delay(110);}
async function connect(key,enter=true){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));
 c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['roster','snapshot','welcome'].includes(m.type))c[m.type]=m;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token:tokens[key]});await until(()=>c.roster,'roster');
 if(enter){c.send({type:'selectCharacter',characterId:c.roster.characters[0].id});await until(()=>c.player(),'world entry');}return c;
}
async function start(){game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();}
async function rejected(c,message,pattern){await tick();const before=structuredClone(c.player().onboarding),index=c.messages.length;c.send(message);const event=await until(()=>c.messages.slice(index).find(m=>m.type==='event'&&m.kind==='info'),'rejection');assert.match(event.text,pattern);assert.deepEqual(c.player().onboarding,before);return event;}
async function move(c,to){
 const path=findPath(c.player(),to,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length,`actual world route exists from ${c.player().x},${c.player().z} to ${to.x},${to.z}`);
 for(const point of path)while(Math.hypot(c.player().x-point.x,c.player().z-point.z)>.001){
  const p=c.player(),gap=Math.hypot(point.x-p.x,point.z-p.z),step=Math.min(2,gap),next={x:p.x+(point.x-p.x)*step/gap,z:p.z+(point.z-p.z)*step/gap};
  assert(canTraverse(p,next));clock+=Math.ceil(movementCost(p,next)/WALK_SPEED*1000)+100;c.send({type:'move',zone:'greenwood',...next,rotation:0});
  await until(()=>Math.hypot(c.player().x-next.x,c.player().z-next.z)<.001,'walk along clear path');
 }
}
async function accept(c){c.send({type:'acceptContract',contractId:'greenwood-hunt'});await until(()=>Object.hasOwn(c.player().contracts.active,'greenwood-hunt'),'accepted contract');}
async function train(c){c.send({type:'learnSpell',npcId:trainer.id,ability:levelTwo});await until(()=>c.player().learnedSpells.includes(levelTwo),'paid class lesson');}
try {
 writeFileSync(file,JSON.stringify(records));await start();const c={};for(const key of Object.keys(heroes))c[key]=await connect(key);
 c.fresh=await connect('fresh',false);
 c.fresh.send({type:'acceptCommunityRules',version:COMMUNITY_VERSION});await until(()=>c.fresh.messages.some(m=>m.type==='community'&&m.accepted),'accepted community rules');
 c.fresh.send({type:'createCharacter',name:'New adventurer',appearance,onboarding:{...lessons,completed:true}});
 await until(()=>c.fresh.roster.characters.length===1,'fresh character created');c.fresh.send({type:'selectCharacter',characterId:c.fresh.roster.characters[0].id});await until(()=>c.fresh.player(),'new character entered');
 assert.deepEqual(c.fresh.player().onboarding,newOnboarding(),'creation never trusts client milestone fields');
 assert.equal(c.legacy.player().onboarding,undefined,'pristine old characters are not silently enrolled');
 await accept(c.legacy);assert(Object.hasOwn(c.legacy.player().contracts.active,'greenwood-hunt'),'legacy level-1 quest-stage-0 contracts remain available');
 const invitationStart=c.fresh.messages.length;
 await rejected(c.legacy,{type:'tradeRequest',targetId:c.fresh.player().id},/must loot a defeated monster before trading/);
 assert(!c.fresh.messages.slice(invitationStart).some(m=>m.type==='trade'),'locked recipients never receive an invitation they cannot accept');
 await tick(1100);let tradeStart=c.viewsLast.messages.length;c.legacy.send({type:'tradeRequest',targetId:c.viewsLast.player().id});
 const offered=await until(()=>c.viewsLast.messages.slice(tradeStart).find(m=>m.type==='trade'&&m.trade?.status==='invited'),'looting unlocks incoming trades before the tour ends');
 c.viewsLast.send({type:'tradeRespond',tradeId:offered.trade.id,accept:false});await until(()=>c.viewsLast.messages.slice(tradeStart).some(m=>m.type==='trade'&&m.trade===null),'decline stays available during onboarding');
 tradeStart=c.viewsLast.messages.length;c.viewsLast.send({type:'tradeRequest',targetId:c.legacy.player().id});
 const returned=await until(()=>c.viewsLast.messages.slice(tradeStart).find(m=>m.type==='trade'&&m.trade?.status==='invited'),'gear-unlocked beginner may invite a legacy player');
 c.viewsLast.send({type:'tradeCancel',tradeId:returned.trade.id});await until(()=>c.viewsLast.messages.slice(tradeStart).some(m=>m.type==='trade'&&m.trade===null),'cancel stays available during onboarding');
 for(const [message,reason] of [
  [{type:'onboardingViewed',panel:'bag'},/current beginner lesson/],
  [{type:'onboardingViewed',panel:'gear'},/current beginner lesson/],
  [{type:'learnSpell',npcId:trainer.id,ability:levelTwo},/Rowan/],
  [{type:'craft',recipeId:'healing-potion'},/level 2 spell/],
  [{type:'acceptContract',contractId:'greenwood-hunt'},/Rowan/],
  [{type:'partyInvite',targetId:c.legacy.player().id},/beginner journey/],
  [{type:'dungeonEnter'},/beginner journey/],
  [{type:'learnTalent',talentId:'precise-aim'},/level 5/],
  [{type:'auctionOpen',npcId:AUCTIONEER.id},/level 10/],
  [{type:'tradeRequest',targetId:c.legacy.player().id},/Loot/],
  [{type:'equipGear',itemId:c.fresh.player().equipment.weapon},/Loot/],
  [{type:'buyBag',npcId:'city-armorer',itemId:'linen-pouch'},/first woodland slime/],
  [{type:'setHotbar',slots:c.fresh.player().hotbar},/Rowan/],
  [{type:'learnRiding',npcId:'city-riding-trainer',rank:1},/level 25/],
 ])await rejected(c.fresh,message,reason);
 await rejected(c.fresh,{type:'onboardingViewed',panel:'gear',completed:true},/Invalid beginner/);
 await rejected(c.fresh,{type:'onboardingViewed',panel:'bag',onboarding:{...lessons,completed:true}},/controlled by the realm/);
 const rowan=NPCS.find(npc=>npc.id==='rowan');
 assert.equal(buildingAt(rowan.x,rowan.z)?.id,CITY_CLOCKTOWER.id,'Rowan works inside the expanded town hall');
 assert.notEqual(buildingAt(c.fresh.player().x,c.fresh.player().z)?.id,CITY_CLOCKTOWER.id,'new characters enter the town hall from the outside spawn');
 await move(c.fresh,{x:rowan.x,z:rowan.z+2});assert.equal(buildingAt(c.fresh.player().x,c.fresh.player().z)?.id,CITY_CLOCKTOWER.id);
 c.fresh.send({type:'interact',targetId:rowan.id});await until(()=>c.fresh.player().quest.stage===1,'Rowan begins real starter quest inside the town hall');
 const hallChairs=BUILDING_CHAIRS.filter(chair=>chair.buildingId===CITY_CLOCKTOWER.id);assert(hallChairs.length>=8,'the town hall has usable council and visitor seating');
 for(const chair of hallChairs){
  await move(c.fresh,chairApproach(chair));c.fresh.send({type:'sit',chairId:chair.id});
  await until(()=>c.fresh.player().seated?.chairId===chair.id,`${chair.id} accepts sitting through the server`);
  assert.deepEqual(c.fresh.player().seated,{chairId:chair.id,x:chair.x,z:chair.z,y:chair.y,rotation:chair.rotation});
  c.fresh.send({type:'stand'});await until(()=>c.fresh.player().seated===null,'town hall chair releases the player');
 }
 const slime=OVERWORLD_SPAWNS.find(e=>e.id==='slime-1');await move(c.fresh,{x:slime.x,z:slime.z+2});
 let drop;
 for(let attacks=0;attacks<8&&!drop;attacks++){
  await tick(GLOBAL_ATTACK_MS+100);const index=c.fresh.messages.length;c.fresh.send({type:'attack',ability:'arrow',targetId:slime.id});
  await until(()=>c.fresh.messages.slice(index).some(m=>m.type==='combat'&&m.playerId===c.fresh.player().id),'starter attack releases while features are locked');
  await tick(750);drop=c.fresh.snapshot.loot.find(d=>d.enemyId===slime.id&&d.ownerId===c.fresh.player().id);
 }
 assert(drop,'unaltered starter attacks defeat a real level-1 woodland slime');assert(c.fresh.player().hp>0);assert.equal(c.fresh.player().level,1);
 assert.equal(c.fresh.player().quest.progress['grove-slimes'],1);assert(onboardingFeatureUnlocked(c.fresh.player(),'bag'));assert.equal(c.fresh.player().onboarding.looted,false,'kill does not auto-loot');
 await tick(DEATH_ANIMATION_MS);await move(c.fresh,drop);await delay(1200);
 mkdirSync(`${file}.tmp`);await rejected(c.fresh,{type:'loot',targetId:drop.id,itemId:'gold'},/could not be saved/);assert.equal(stored('fresh').onboarding.looted,false,'failed loot save cannot advance the guide');
 rmSync(`${file}.tmp`,{recursive:true});c.fresh.send({type:'loot',targetId:drop.id,itemId:'gold'});await until(()=>c.fresh.player().onboarding.looted,'actual corpse loot unlocks gear');assert.equal(stored('fresh').onboarding.looted,true);
 await rejected(c.fresh,{type:'onboardingViewed',panel:'gear'},/current beginner lesson/);
 const crystal=ZONES[0].nodes.find(node=>node.id==='crystal-1');await move(c.fresh,{x:crystal.x,z:crystal.z-2});
 c.fresh.send({type:'gather',targetId:crystal.id});await until(()=>c.fresh.player().gathering,'gathering remains available before profession unlock');
 const gatheringEnds=c.fresh.player().gathering.endsAt;
 c.fresh.send({type:'onboardingViewed',panel:'bag'});await until(()=>c.fresh.player().onboarding.bagViewed,'bag acknowledgement');assert.equal(stored('fresh').onboarding.bagViewed,true);
 assert.equal(c.fresh.player().gathering?.nodeId,crystal.id,'a nonmodal bag acknowledgement does not cancel gathering');
 c.fresh.send({type:'onboardingViewed',panel:'gear'});await until(()=>c.fresh.player().onboarding.gearViewed,'gear acknowledgement');assert.equal(stored('fresh').onboarding.gearViewed,true);
 assert.equal(c.fresh.player().onboarding.completed,false,'views do not skip Rowan, training and contract prerequisites');
 await tick(Math.max(0,gatheringEnds-clock));await until(()=>c.fresh.player().inventory.crystal>0,'first gathered resource');assert.equal(c.fresh.player().quest.progress['grove-crystals'],1);assert(onboardingFeatureUnlocked(c.fresh.player(),'professions'));
 // Both valid play orders finish the tour. Contract income stays available before the first lesson.
 await accept(c.contractFirst);assert.equal(c.contractFirst.player().onboarding.completed,false);await move(c.contractFirst,{x:trainer.x,z:trainer.z+2});await train(c.contractFirst);assert.equal(c.contractFirst.player().onboarding.completed,true);assert.equal(stored('contractFirst').onboarding.completed,true);
 await train(c.trainingFirst);assert.equal(c.trainingFirst.player().onboarding.completed,false);await move(c.trainingFirst,{x:BOARD_POSITION.x,z:BOARD_POSITION.z+1});await accept(c.trainingFirst);assert.equal(c.trainingFirst.player().onboarding.completed,true);
 c.viewsLast.send({type:'onboardingViewed',panel:'bag'});await until(()=>c.viewsLast.player().onboarding.bagViewed,'late bag view');c.viewsLast.send({type:'onboardingViewed',panel:'gear'});await until(()=>c.viewsLast.player().onboarding.completed,'last missing view completes existing contract and training');assert.equal(stored('viewsLast').onboarding.completed,true);
 await rejected(c.complete,{type:'learnTalent',talentId:'precise-aim'},/level 5/);await rejected(c.complete,{type:'auctionOpen',npcId:AUCTIONEER.id},/level 10/);await rejected(c.complete,{type:'interact',targetId:AUCTIONEER.id},/level 10/);
 c.contractFirst.send({type:'partyInvite',targetId:c.trainingFirst.player().id});await until(()=>c.trainingFirst.snapshot.partyInvites.length,'party unlocked after guide');c.trainingFirst.send({type:'partyAccept',invitationId:c.trainingFirst.snapshot.partyInvites[0].id});await until(()=>c.contractFirst.snapshot.party?.members.length===2,'party can form after completion');
 const before=Object.fromEntries(Object.keys(tokens).map(key=>[key,structuredClone(c[key].player().onboarding)]));
 await game.stop();await start();for(const key of Object.keys(tokens)){const next=await connect(key);assert.deepEqual(next.player().onboarding,before[key],`${key}: milestones survive restart`);}assert.equal(stored('legacy').onboarding,undefined);
 await game.stop();game=null;const valid=JSON.parse(readFileSync(file,'utf8'));
 for(const state of [null,{...newOnboarding(),version:2},{...newOnboarding(),looted:'yes'},{...newOnboarding(),completed:true},{...newOnboarding(),gearViewed:true},{...newOnboarding(),extra:true}]){
  const bad=structuredClone(valid);bad[hash(tokens.fresh)].characters[0].onboarding=state;writeFileSync(file,JSON.stringify(bad));assert.throws(()=>createGameServer({port:0,dataDir:dir,keycloak:null,databaseUrl:''}),/Invalid/,'malformed saved milestones fail closed');
 }
 console.log('PASS onboarding server: fresh enrollment, spawn-to-town-hall route, Rowan quest and every council seat, legacy access, direct-action guards, real starter kill and durable corpse loot, failed-save rollback, ordered views, both training/contract orders, level gates, party unlock, restart and forged-state rejection.');
} finally {for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
