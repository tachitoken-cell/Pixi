import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { VILLAGES, VILLAGE_NPCS, VILLAGE_SAFE_RADIUS, WILDERNESS_SPAWNS } from '../src/settlements.ts';
import { NPC_SERVICE_COSTS, WORLD_INTEREST_RADIUS } from '../src/shared.ts';
import { CHAPTERS } from '../src/content.ts';
import { CONTRACTS, newContracts } from '../src/adventure.ts';
import { starterGear } from '../src/progression.ts';
import { defaultHotbar } from '../src/spells.ts';
import { EXPEDITIONS, waterAt } from '../src/landscape.ts';
import { regionAt, canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';

const dir=mkdtempSync(join(tmpdir(),'mossvale-villages-')),file=join(dir,'players.json'),clients=[];
const realNow=Date.now;let offset=0,game,port;Date.now=()=>realNow()+offset;
const key=token=>createHash('sha256').update(token).digest('hex'),token=()=>randomBytes(32).toString('base64url');
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function hero(name,point,extra={}) {return {id:randomUUID(),name,coordinateVersion:2,zone:regionAt(point.x,point.z),...point,rotation:0,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},characterCreated:true,
  talents:[],...starterGear('Ranger'),hotbar:defaultHotbar('Ranger'),hp:50,maxHp:100,level:1,xp:0,gold:40,
  inventory:{wood:3,crystal:3,potion:3,herb:3,relic:1},skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,contracts:newContracts(),
  quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null},...extra};}
function beside(npc){const point=Array.from({length:16},(_,i)=>({x:npc.x+Math.sin(i*Math.PI/8)*1.6,z:npc.z+Math.cos(i*Math.PI/8)*1.6})).find(point=>canTraverse(point,npc));assert(point,`reachable NPC ${npc.id}`);return point;}
async function until(fn,label){const end=realNow()+5000;while(realNow()<end){const result=fn();if(result)return result;await delay(12);}throw Error(`Timed out: ${label}`);}
async function advance(ms=800){offset+=ms;await delay(125);}
async function start(records){if(records)writeFileSync(file,JSON.stringify(records));game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();}
async function connect(authToken,characterId){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['roster','welcome','snapshot'].includes(m.type))c[m.type]=m;});
 await new Promise((res,rej)=>{socket.once('open',res);socket.once('error',rej);});c.send({type:'join',token:authToken});await until(()=>c.roster,'account roster');
 if(characterId){c.send({type:'selectCharacter',characterId});await until(()=>c.player()?.id===characterId,'enter character');}return c;
}
async function select(c,id){c.send({type:'selectCharacter',characterId:id});await until(()=>c.player()?.id===id,'switch character');}
async function walk(c,goal){const path=findPath(c.player(),goal,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length,`path ${JSON.stringify(goal)}`);
 for(const destination of path)while(gap(c.player(),destination)>.02){const p=c.player(),length=gap(p,destination),step=Math.min(2.5,length),point={x:p.x+(destination.x-p.x)*step/length,z:p.z+(destination.z-p.z)*step/length};offset+=500;c.send({type:'move',...point,zone:p.zone,rotation:0});await until(()=>gap(c.player(),point)<.02,'legal village walk');}}

try {
 assert.equal(VILLAGES.length,12);assert.equal(VILLAGE_NPCS.filter(npc=>VILLAGES.some(v=>v.id===npc.villageId)).length,36);assert.equal(WILDERNESS_SPAWNS.length,348);
 assert.equal(new Set(WILDERNESS_SPAWNS.map(e=>e.id)).size,348);assert(WILDERNESS_SPAWNS.every(e=>e.kind!=='root-warden'),'story boss remains unique');
 for(const spawn of WILDERNESS_SPAWNS){assert(!waterAt(spawn.x,spawn.z)&&canTraverse(spawn,spawn));assert(VILLAGES.every(v=>gap(spawn,v)>=VILLAGE_SAFE_RADIUS));}
 const village=VILLAGES[0],merchant=VILLAGE_NPCS.find(n=>n.villageId===village.id&&n.role==='merchant'),warden=VILLAGE_NPCS.find(n=>n.villageId===village.id&&n.role==='warden'),healer=VILLAGE_NPCS.find(n=>n.villageId===village.id&&n.role==='healer');
 const buyer=hero('Buyer',beside(merchant)),patient=hero('Patient',beside(healer)),poor=hero('Poor patient',beside(healer),{gold:4}),dead=hero('Fallen patient',beside(healer),{hp:0}),full=hero('Full bags',beside(merchant),{inventory:{wood:0,crystal:0,potion:Number.MAX_SAFE_INTEGER,herb:0,relic:0}});
 const contract=CONTRACTS.find(c=>c.zone===village.zone),contracts=newContracts();contracts.active[contract.id]=contract.count;
 const contractor=hero('Contractor',beside(warden),{contracts});
 let blocked;
 for(const npc of VILLAGE_NPCS){for(let i=0;i<128;i++){const angle=i*Math.PI/64,point={x:npc.x+Math.sin(angle)*2.95,z:npc.z+Math.cos(angle)*2.95};if(canTraverse(point,point)&&!canTraverse(point,npc)){blocked={npc,point};break;}}if(blocked)break;}
 assert(blocked,'a real village prop can obstruct a nearby interaction');
 const auth=token(),farToken=token(),blockedToken=token(),far=hero('Distant observer',{x:0,z:8}),blockedHero=hero('Behind the stall',blocked.point);
 await start({[key(auth)]:{characters:[buyer,patient,poor,dead,full,contractor]},[key(farToken)]:{characters:[far]},[key(blockedToken)]:{characters:[blockedHero]}});
 let c=await connect(auth,buyer.id);const observer=await connect(farToken,far.id),roster=await connect(token());
 assert(c.snapshot.enemies.length<WILDERNESS_SPAWNS.length/2,'interest avoids hundreds of client meshes');
 assert(c.snapshot.enemies.every(e=>gap(c.player(),e)<=WORLD_INTEREST_RADIUS));assert(c.snapshot.nodes.every(n=>gap(c.player(),n)<=WORLD_INTEREST_RADIUS));
 assert(!c.snapshot.enemies.some(e=>VILLAGE_NPCS.some(n=>n.id===e.id)),'villagers are noncombat NPCs');
 const obstructed=await connect(blockedToken,blockedHero.id);
 obstructed.send({type:'interact',targetId:blocked.npc.id});obstructed.send({type:'npcService',npcId:blocked.npc.id,service:blocked.npc.role==='merchant'?'trade':blocked.npc.role==='warden'?'contracts':'heal'});
 await advance();assert(!obstructed.messages.some(m=>m.type==='dialogue'||m.type==='villageService'),'nearby NPC cannot be used through a solid');assert.equal(obstructed.player().gold,40);
 c.send({type:'interact',targetId:merchant.id});await until(()=>c.messages.some(m=>m.type==='dialogue'&&m.npcId===merchant.id),'merchant dialogue');
 const dialogue=c.messages.find(m=>m.type==='dialogue'&&m.npcId===merchant.id);assert.deepEqual(dialogue.lines,merchant.lines);assert.deepEqual(dialogue.services.map(s=>s.id),['trade']);
 c.send({type:'npcService',npcId:merchant.id,service:'trade'});await until(()=>c.messages.some(m=>m.type==='villageService'&&m.npcId===merchant.id&&m.service==='trade'),'merchant opens supplies');
 c.send({type:'npcService',npcId:merchant.id,service:'potion',price:0,quantity:999});c.send({type:'npcService',npcId:merchant.id,service:'potion'});
 await until(()=>c.player().gold===buyer.gold-NPC_SERVICE_COSTS.potion,'one authoritative potion purchase');assert.equal(c.player().inventory.potion,buyer.inventory.potion+1);
 assert(!observer.messages.some(m=>m.type==='villageService'),'service responses remain private');
 const gold=c.player().gold,potions=c.player().inventory.potion;
 await advance();for(const message of [{npcId:merchant.id,service:'heal'},{npcId:healer.id,service:'potion'},{npcId:'__proto__',service:'potion'},{npcId:merchant.id,service:{forged:true}},{npcId:VILLAGE_NPCS.at(-1).id,service:'potion'},{npcId:merchant.id,service:'potion',gold:999999}])c.send({type:'npcService',...message});
 await advance();assert.equal(c.player().gold,gold);assert.equal(c.player().inventory.potion,potions);
 const quest=structuredClone(c.player().quest);c.send({type:'attack',targetId:merchant.id});await advance();assert.equal(c.messages.filter(m=>m.type==='combat'&&m.playerId===buyer.id).length,0);assert.deepEqual(c.player().quest,quest);
 await select(c,patient.id);c.send({type:'interact',targetId:healer.id});await until(()=>c.messages.some(m=>m.type==='dialogue'&&m.npcId===healer.id),'healer dialogue');
 c.send({type:'npcService',npcId:healer.id,service:'heal'});c.send({type:'npcService',npcId:healer.id,service:'heal'});
 await until(()=>c.player().hp===100,'healer restores full health');assert.equal(c.player().gold,35);assert.equal(c.player().inventory.potion,3);
 await advance();c.send({type:'npcService',npcId:healer.id,service:'heal'});await advance();assert.equal(c.player().gold,35,'full-health rest never charges');
 await select(c,poor.id);c.send({type:'npcService',npcId:healer.id,service:'heal'});await advance();assert.deepEqual([c.player().hp,c.player().gold],[50,4]);
 await select(c,dead.id);c.send({type:'npcService',npcId:healer.id,service:'heal'});await advance();assert.deepEqual([c.player().hp,c.player().gold],[0,40]);
 await select(c,full.id);c.send({type:'npcService',npcId:merchant.id,service:'potion'});await advance();assert.equal(c.player().gold,40);assert.equal(c.player().inventory.potion,Number.MAX_SAFE_INTEGER);
 await select(c,contractor.id);c.send({type:'npcService',npcId:warden.id,service:'contracts'});await until(()=>c.messages.some(m=>m.type==='villageService'&&m.service==='contracts'),'warden opens contracts');
 c.send({type:'claimContract',contractId:contract.id});c.send({type:'claimContract',contractId:contract.id});await until(()=>c.player().gold===40+contract.reward.gold,'warden claims completed regional contract once');
 const next=CONTRACTS.find(row=>row.zone===village.zone&&row.id!==contract.id);c.send({type:'acceptContract',contractId:next.id});await until(()=>Object.hasOwn(c.player().contracts.active,next.id),'warden accepts regional contract');
 const wrongRegion=CONTRACTS.find(row=>row.zone!==village.zone);c.send({type:'acceptContract',contractId:wrongRegion.id});await advance();assert(!Object.hasOwn(c.player().contracts.active,wrongRegion.id));
 const active=structuredClone(c.player().contracts);await walk(c,{x:warden.x,z:warden.z+7});c.send({type:'npcService',npcId:warden.id,service:'contracts'});c.send({type:'acceptContract',contractId:contract.id});await advance();assert.deepEqual(c.player().contracts,active,'services and contract claims require local proximity');
 roster.send({type:'npcService',npcId:healer.id,service:'heal'});await advance();assert.equal(roster.snapshot,undefined,'roster cannot activate NPC services');
 await game.stop();game=null;let saved=JSON.parse(readFileSync(file));assert.equal(saved[key(auth)].characters.find(p=>p.id===patient.id).gold,35);assert.equal(saved[key(auth)].characters.find(p=>p.id===patient.id).hp,100);assert.equal(saved[key(auth)].characters.find(p=>p.id===buyer.id).inventory.potion,4);
 await start();c=await connect(auth,patient.id);assert.equal(c.player().gold,35);assert.equal(c.player().hp,100);await game.stop();game=null;

 // Every retained expedition is observed through a real nearby snapshot, not a world-wide payload.
 const campTokens=EXPEDITIONS.map(token),campHeroes=EXPEDITIONS.map((camp,i)=>hero(`Scout ${i}`,{x:camp.x,z:camp.z},{hp:988,maxHp:988,level:75}));
 let chase;
 for(const village of VILLAGES){for(const enemy of WILDERNESS_SPAWNS){const d=gap(village,enemy),dx=(enemy.x-village.x)/d,dz=(enemy.z-village.z)/d;
   const outside={x:enemy.x-dx*5,z:enemy.z-dz*5},inside={x:village.x+dx*9,z:village.z+dz*9};
   if(d<VILLAGE_SAFE_RADIUS+12&&canTraverse(outside,inside)&&canTraverse(outside,enemy)){chase={village,enemy,outside,inside};break;}}if(chase)break;}
 assert(chase,'there is a reachable wilderness encounter beside a village boundary');
 const chaseToken=token(),chaser=hero('Returning hunter',chase.outside,{hp:988,maxHp:988,level:75});
 await start({...Object.fromEntries(campHeroes.map((p,i)=>[key(campTokens[i]),{characters:[p]}])),[key(chaseToken)]:{characters:[chaser]}});
 const scouts=[];for(let i=0;i<EXPEDITIONS.length;i++){const scout=await connect(campTokens[i],campHeroes[i].id);scouts.push(scout);const prefix=`expedition-${EXPEDITIONS[i].id}-`;
  assert.equal(scout.snapshot.enemies.filter(e=>e.id.startsWith(prefix)).length,3);assert.equal(scout.snapshot.nodes.filter(n=>n.id.startsWith(prefix)).length,3);
  assert(scout.snapshot.enemies.every(e=>gap(e,scout.player())<=WORLD_INTEREST_RADIUS));}
 const hunter=await connect(chaseToken,chaser.id);
 for(let step=0;step<25&&gap(hunter.player(),hunter.snapshot.enemies.find(e=>e.id===chase.enemy.id))>2;step++)await advance(600);
 assert(gap(hunter.player(),hunter.snapshot.enemies.find(e=>e.id===chase.enemy.id))<=2,'wildlife really pursues a nearby player outside the village');
 await walk(hunter,chase.inside);const arrivalHealth=hunter.player().hp;
 const sampled=scouts.flatMap(s=>s.snapshot.enemies).filter(e=>e.id.startsWith('wilderness-')),positions=new Map(sampled.map(e=>[e.id,{x:e.x,z:e.z}]));
 const idleIds=new Set(sampled.filter(enemy=>[chase.outside,chase.inside,...campHeroes].every(point=>gap(enemy,point)>50)).map(enemy=>enemy.id));
 for(let step=0;step<120&&hunter.player().hp===arrivalHealth;step++)await advance(600);
 const moved=new Set();for(const scout of scouts)for(const enemy of scout.snapshot.enemies){const spawn=WILDERNESS_SPAWNS.find(e=>e.id===enemy.id);if(!spawn)continue;
  assert(!waterAt(enemy.x,enemy.z)&&canTraverse(enemy,enemy));
  if(idleIds.has(enemy.id)){assert(VILLAGES.every(v=>gap(enemy,v)>=VILLAGE_SAFE_RADIUS),'idle patrols stay outside villages');assert(gap(enemy,spawn)<=8,'idle wildlife patrols near home');}
  if(positions.has(enemy.id)&&gap(enemy,positions.get(enemy.id))>.1)moved.add(enemy.id);}
 assert(moved.size>=20,'many visible wilderness mobs really patrol while idle');
 const pursuer=hunter.snapshot.enemies.find(enemy=>enemy.id===chase.enemy.id);
 assert(gap(pursuer,chase.village)<VILLAGE_SAFE_RADIUS,'an engaged monster follows its target into a village');
 assert(gap(pursuer,chase.enemy)>20,'an engaged monster can leave its old home leash');
 assert(hunter.player().hp<arrivalHealth,'entering a village does not cancel an engaged monster attack');
 assert(idleIds.size>=20,'idle patrol checks cover wildlife away from engaged players');
 for(const scout of scouts.filter(s=>VILLAGES.some(v=>gap(v,s.player())<VILLAGE_SAFE_RADIUS)))assert.equal(scout.player().hp,988,'idle wildlife does not acquire village residents');
 await game.stop();game=null;
 console.log('PASS villages:36 role NPCs, private services and transactions, persistence,200m interest,348 dry wilderness spawns, idle patrols avoid villages while engaged monsters pursue beyond home and into villages.');
}finally{for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
