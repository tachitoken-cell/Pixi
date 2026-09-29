import { storeBoostMultiplier } from '../src/ingame-store.ts';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS,ZONES,NPCS } from '../src/content.ts';
import { MAX_LEVEL,maxHealth,starterGear } from '../src/progression.ts';
import { newContracts,CONTRACTS,BOARD_POSITION } from '../src/adventure.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { OVERWORLD_SPAWNS,canTraverse,regionAt } from '../src/realm.ts';
import { surfaceAt } from '../src/landscape.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { RESOURCE_TYPES } from '../src/skills.ts';
import { DUNGEON_OBJECTS,dungeonLayout,dungeonColliders,dungeonBounds } from '../src/dungeon.ts';
const dir=mkdtempSync(join(tmpdir(),'mossvale-reward-numbers-')),file=join(dir,'players.json'),realNow=Date.now,original=structuredClone(MONSTERS),clients=[];
let game,port,clock=realNow();Date.now=()=>clock;
const hash=token=>createHash('sha256').update(token).digest('hex');
function beside(point){for(const [x,z]of [[0,1.5],[0,-1.5],[1.5,0],[-1.5,0]]){const p={x:point.x+x,z:point.z+z};if(canTraverse(p,point)&&!surfaceAt(p.x,p.z).water)return p;}throw Error('No clear approach');}
function hero(name,point={x:0,z:8},extra={}){const level=extra.level??1,className=extra.className??'Ranger';return {id:randomUUID(),name,...point,zone:regionAt(point.x,point.z),coordinateVersion:2,rotation:0,
 appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className},characterCreated:true,...starterGear(className),talents:[],level,hp:100+(level-1)*12,maxHp:100+(level-1)*12,xp:0,gold:40,
 inventory:{wood:0,crystal:0,herb:0,relic:0,potion:3},carriedItems:{'trail-bread':2,'greater-tonic':2},skills:{mining:0,woodcutting:0,herbalism:0},contracts:newContracts(),
 quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null},...extra};}
const healer=VILLAGE_NPCS.find(n=>n.role==='healer'),crystal=ZONES[0].nodes.find(n=>n.kind==='crystal'),slime=OVERWORLD_SPAWNS.find(e=>e.id==='slime-1'),contract=CONTRACTS.find(c=>c.id==='greenwood-hunt');
const heroes={observer:hero('Observer'),food:hero('Food user',{x:0,z:8},{hp:80}),tonic:hero('Tonic user',{x:1,z:8},{hp:50}),dead:hero('Fallen user',{x:2,z:8},{hp:0,diedAt:clock}),patient:hero('Healer patient',beside(healer),{hp:45}),
 contract:hero('Contract reward',{x:BOARD_POSITION.x,z:BOARD_POSITION.z+1},{hp:73,xp:95,contracts:{active:{[contract.id]:contract.count},completed:{}}}),
 chapter:hero('Chapter reward',beside(NPCS.find(npc=>npc.id==='rowan')),{hp:81,xp:99}),gather:hero('Gatherer',beside(crystal)),looter:hero('Loot reward',beside(slime),{className:'Knight',level:60}),
 cleric:hero('Healing caster',{x:2,z:10},{className:'Cleric',level:60,hp:803,learnedSpells:['smite','holy-word-serenity']})};
heroes.chapter.quest.stage=2;for(const o of CHAPTERS[0].objectives)heroes.chapter.quest.progress[o.id]=o.count;heroes.chapter.quest.kills=3;heroes.chapter.quest.crystals=3;
const tokens=Object.fromEntries(Object.keys(heroes).map(n=>[n,randomBytes(32).toString('base64url')]));
const stored=name=>JSON.parse(readFileSync(file,'utf8'))[hash(tokens[name])].characters[0];
async function until(fn,label){const end=realNow()+6500;while(realNow()<end){const r=fn();if(r)return r;await delay(12);}throw Error(`Timed out: ${label}`);}
async function tick(ms=900){clock+=ms;await delay(135);}
async function connect(name){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,name,id:heroes[name].id,messages:[]};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.id);
 c.effects=(effect,from=0)=>c.messages.slice(from).filter(m=>m.type==='damage'&&m.effect===effect&&m.targetId===c.id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(m.type==='snapshot')c.snapshot=m;});await new Promise((res,rej)=>{socket.once('open',res);socket.once('error',rej);});c.send({type:'join',token:tokens[name],characterId:c.id});await until(()=>c.player(),'fixture entry');return c;}
function expectedProgress(player,amount){let level=player.level,xp=player.xp+amount;while(xp>=level*100){xp-=level*100;level++;}return {level,xp,maxHp:100+(level-1)*12};}
async function healAction(c,message,expected){await tick();const index=c.messages.length,before=c.player().hp;c.send(message);await until(()=>c.player().hp===before+expected,'effective healing applied');assert.equal(c.effects('heal',index).length,1,'one number for one restoration');assert.equal(c.effects('heal',index)[0].amount,expected);return index;}
function onlyLoggedBreakdown(c,from,part){const event=c.messages.slice(from).find(m=>m.type==='event'&&m.kind==='reward'&&m.text.includes(part));assert(event,part+' remains in chat');assert.equal(event.logOnly,true,part+' is excluded from toast');}
try{
 for(const stats of Object.values(MONSTERS))Object.assign(stats,{hp:1,speed:0,aggroRange:0});
 writeFileSync(file,JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([n,p])=>[hash(tokens[n]),{characters:[p]}]))));game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();const c={};for(const name of Object.keys(heroes))c[name]=await connect(name);
 // Failed persistence cannot consume food or produce an optimistic green number.
 await delay(1200);mkdirSync(file+'.tmp');let index=c.food.messages.length;c.food.send({type:'useItem',itemId:'trail-bread'});
 await until(()=>c.food.messages.slice(index).some(m=>m.type==='event'&&m.text.includes('could not be saved')),'food save rejected');assert.equal(c.food.effects('heal',index).length,0);assert.equal(c.food.player().hp,80);assert.equal(c.food.player().carriedItems['trail-bread'],2);assert.equal(stored('food').hp,80);rmSync(file+'.tmp',{recursive:true});
 index=await healAction(c.food,{type:'useItem',itemId:'trail-bread'},20);onlyLoggedBreakdown(c.food,index,'Used ');assert.equal(stored('food').hp,100);assert.equal(stored('food').carriedItems['trail-bread'],1);
 await healAction(c.tonic,{type:'useItem',itemId:'greater-tonic'},50);
 index=await healAction(c.patient,{type:'npcService',npcId:healer.id,service:'heal'},55);onlyLoggedBreakdown(c.patient,index,'Restored to full health');assert.equal(c.patient.player().gold,35);
 await tick();index=c.patient.messages.length;c.patient.send({type:'npcService',npcId:healer.id,service:'heal'});await tick();assert.equal(c.patient.effects('heal',index).length,0,'full health produces no fake healing');assert.equal(c.patient.player().gold,35);
 index=c.dead.messages.length;c.dead.send({type:'useItem',itemId:'greater-tonic'});c.dead.send({type:'heal'});await tick();assert.equal(c.dead.player().hp,0);assert.equal(c.dead.effects('heal',index).length,0,'dead targets are never restored merely for an effect');
 await healAction(c.cleric,{type:'attack',ability:'holy-word-serenity',targetId:c.cleric.id},5);
 // Quests award their exact XP even when crossing a level boundary. Informational unlocks still toast.
 for(const [name,message,amount,summary]of [['contract',{type:'claimContract',contractId:contract.id},contract.reward.xp,'complete ·'],['chapter',{type:'interact',targetId:'rowan'},CHAPTERS[0].reward.xp,'Chapter complete']]){
  await tick();const actor=c[name],before={...actor.player()},expected=expectedProgress(before,amount),at=actor.messages.length;actor.send(message);await until(()=>actor.player().level===expected.level&&actor.player().xp===expected.xp,'quest XP and level thresholds');
  assert.deepEqual(actor.effects('xp',at).map(m=>m.amount),[amount]);assert.deepEqual(actor.effects('heal',at).map(m=>m.amount),[expected.maxHp-before.hp]);onlyLoggedBreakdown(actor,at,summary);
  assert(actor.messages.slice(at).some(m=>m.type==='event'&&m.text.startsWith('Level ')&&!m.logOnly),'level-up informational notice remains visible');
 }
 await tick();index=c.gather.messages.length;c.gather.send({type:'gather',targetId:crystal.id});const gathering=await until(()=>c.gather.player().gathering,'gather starts');assert.equal(c.gather.effects('xp',index).length,0,'gather preparation grants no XP');await tick(gathering.endsAt-clock);await until(()=>c.gather.player().inventory.crystal===1,'gather commits');assert.deepEqual(c.gather.effects('xp',index).map(m=>m.amount),[RESOURCE_TYPES[crystal.kind].adventureXp]);onlyLoggedBreakdown(c.gather,index,'adventure XP');
 await tick();index=c.looter.messages.length;c.looter.send({type:'autoAttack',targetId:slime.id});const swing=await until(()=>c.looter.messages.slice(index).find(m=>m.type==='combat'&&m.basic),'lethal swing starts');assert.equal(c.looter.effects('xp',index).length,0);await tick(swing.startedAt+301-clock);const drop=await until(()=>c.looter.snapshot.loot.find(d=>d.enemyId===slime.id),'loot drops at death');assert.equal(c.looter.effects('xp',index).length,0,'max-level kills award no XP or XP number');assert.equal(c.looter.player().level,MAX_LEVEL);assert.equal(c.looter.player().xp,0);onlyLoggedBreakdown(c.looter,index,'defeated');
 await tick(1500);const beforeGold=c.looter.player().gold;index=c.looter.messages.length;c.looter.send({type:'loot',targetId:drop.id});await until(()=>c.looter.player().gold>beforeGold,'durable loot collection');onlyLoggedBreakdown(c.looter,index,'looted');assert.equal(c.looter.effects('xp',index).length,0,'collecting an already rewarded corpse does not grant XP twice');
 assert.equal(c.observer.messages.filter(m=>m.type==='damage'&&m.effect==='xp').length,0,'XP never broadcasts another player’s gains');assert(c.observer.messages.some(m=>m.type==='damage'&&m.effect==='heal'&&m.targetId===c.food.id),'effective healing keeps existing continuous-world visibility');
 // Exercise the actual common source functions at multi-level/dead/checkpoint boundaries.
 const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');const extract=name=>`(${source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0].trim()})`;
 const effects=[],logs=[];const restore=runInNewContext(extract('restoreHealth'),{arenaMode:()=>false,broadcast:m=>effects.push({...m})});const award=runInNewContext(extract('addXp'),{MAX_LEVEL,maxHealth,storeBoostMultiplier,send:(socket,m)=>effects.push({...m}),restoreHealth:restore,event:(...args)=>logs.push(args),spellsForClass:()=>[],checkAchievements(){},MOUNT_UNLOCK_LEVEL:25,MOUNT_UPGRADE_LEVEL:50});
 const multi={player:hero('Multi level',undefined,{hp:50,xp:90}),socket:{},instanceId:null};award(multi,350);assert.equal(multi.player.level,3);assert.equal(multi.player.xp,140);assert.deepEqual(effects.filter(m=>m.effect==='xp').map(m=>m.amount),[350]);assert.deepEqual(effects.filter(m=>m.effect==='heal').map(m=>m.amount),[74]);
 effects.length=0;const fallen={player:hero('Dead award',undefined,{hp:0,xp:90}),socket:{},instanceId:null};award(fallen,350);assert.equal(fallen.player.hp,0);assert(!effects.some(m=>m.effect==='heal'));assert.equal(effects[0].amount,350);
 effects.length=0;const checkpoint=DUNGEON_OBJECTS.find(o=>o.kind==='checkpoint'),living={player:hero('Checkpoint',{x:checkpoint.x,z:checkpoint.z},{hp:71}),instanceId:'checkpoint'},dead={player:hero('Dead checkpoint',{x:checkpoint.x,z:checkpoint.z},{hp:0}),instanceId:'checkpoint'};
 const vault={id:'checkpoint',activated:new Set(),cleared:new Set([checkpoint.stageId]),members:[living.player.id,dead.player.id]};
 const activate=runInNewContext(extract('dungeonInteract'),{dungeons:new Map([[vault.id,vault]]),dungeonLayout,dungeonColliders,dungeonBounds,distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),canTraverse,sessions:new Map([[living.player.id,living],[dead.player.id,dead]]),restoreHealth:restore,stand(){},event(){},dirty(){}});
 activate(living,checkpoint.id);assert.equal(living.player.hp,100);assert.equal(dead.player.hp,0);assert.deepEqual(effects.map(m=>m.amount),[29]);
 console.log('PASS reward numbers: capped kills grant no XP, exact private XP from gathering/contracts/chapters and across multiple levels, clamped spell/food/tonic/NPC/checkpoint/level healing, no full/dead/failed-save floats, durable loot log-only summaries and visible level notices.');
}finally{rmSync(file+'.tmp',{recursive:true,force:true});for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;for(const [kind,stats]of Object.entries(original))Object.assign(MONSTERS[kind],stats);rmSync(dir,{recursive:true,force:true});}
