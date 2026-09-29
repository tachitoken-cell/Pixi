import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import pg from 'pg';
import { playerDatabaseFixture } from './fixture-player-database.mjs';
import { createGameServer } from '../server.mjs';
import { CHAPTERS, ZONES } from '../src/content.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { newContracts } from '../src/adventure.ts';
import { MONSTERS, WORLD_BOSS } from '../src/bestiary.ts';
import { bagUsage, newBags } from '../src/bags.ts';
import { LOOT_ITEMS, lootRows } from '../src/loot-items.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';
import { createOverworldSpawns, canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { movementCost } from '../src/landscape.ts';
import { WALK_SPEED } from '../src/travel.ts';

const dir=mkdtempSync(join(tmpdir(),'mossvale-item-loot-')),file=join(dir,'players.json'),clients=[];
const realNow=Date.now,realRandom=Math.random,realClient=pg.Client,bossDamage=MONSTERS[WORLD_BOSS.kind].damage;let clock=realNow(),game,port,releasePendingWrite;
Date.now=()=>clock;
const hash=token=>createHash('sha256').update(token).digest('hex');
function hero(name,at={x:2,z:13}){
 return {id:randomUUID(),name,...at,zone:'greenwood',coordinateVersion:2,rotation:0,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},
  characterCreated:true,talents:[],...starterGear('Ranger'),...newBags(),hp:400,maxHp:988,level:75,xp:0,gold:100,
  inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,contracts:newContracts(),
  quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null}};
}
const owner=hero('Loot Collector'),full=hero('Full Collector',{x:3,z:13});
owner.carriedItems={'trail-bread':2,'greater-tonic':3};
owner.ownedBags=[{id:randomUUID(),kind:'runewoven-holdall'}];owner.equippedBags[0]=owner.ownedBags[0].id;
full.carriedItems={'stormhorn-core':5};
for(const item of Object.values(GEAR))if(bagUsage(full)<16&&(!item.className||item.className==='Ranger')&&!full.ownedGear.includes(item.id))full.ownedGear.push(item.id);
assert.equal(bagUsage(full),16);
const eater=hero('Merchant Customer',{x:-18,z:-4}),trader=hero('Trade Customer',{x:-17.5,z:-4});
eater.carriedItems={'slime-residue':4,'trail-bread':3,'greater-tonic':2};eater.inventory.wood=2;
trader.carriedItems={'prismatic-pearl':1};trader.inventory.herb=2;
const dead=hero('Fallen Customer',{x:-18.5,z:-4});dead.hp=0;dead.carriedItems={'trail-bread':1};
const legacy=hero('Legacy Customer',{x:-17,z:-4});
const heroes={owner,full,eater,trader,dead,legacy},tokens=Object.fromEntries(Object.keys(heroes).map(k=>[k,randomBytes(32).toString('base64url')]));
const assets=p=>structuredClone({gold:p.gold,inventory:p.inventory,ownedGear:p.ownedGear,carriedItems:p.carriedItems,itemUseReadyAt:p.itemUseReadyAt});
const stored=key=>JSON.parse(readFileSync(file,'utf8'))[hash(tokens[key])].characters[0];
async function until(fn,label,timeout=5000){const end=realNow()+timeout;while(realNow()<end){const value=fn();if(value)return value;await delay(15);}throw Error(`Timed out: ${label}`);}
async function tick(ms=800){clock+=ms;await delay(120);}
async function start(seed=false){
 if(seed)writeFileSync(file,JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([k,p])=>[hash(tokens[k]),{characters:[p]}]))));
 const spawns=ZONES[0].enemies,bossHp=MONSTERS[WORLD_BOSS.kind].hp,slimeHp=MONSTERS['moss-slime'].hp;
 ZONES[0].enemies=[{id:'loot-table-slime',kind:'moss-slime',x:WORLD_BOSS.x+32,z:WORLD_BOSS.z},{id:'loot-full-boss',kind:WORLD_BOSS.kind,worldBoss:true,x:WORLD_BOSS.x+6,z:WORLD_BOSS.z}];
 if(seed){
  const actual=createOverworldSpawns(),records=JSON.parse(readFileSync(file,'utf8'));
  for(const [name,id] of [['owner',WORLD_BOSS.id],['full','loot-full-boss']]){const spawn=actual.find(enemy=>enemy.id===id),point={x:spawn.x,z:spawn.z+.5};assert(canTraverse(point,spawn));Object.assign(records[hash(tokens[name])].characters[0],point);}
  writeFileSync(file,JSON.stringify(records));
 }
 MONSTERS[WORLD_BOSS.kind].hp=1;MONSTERS['moss-slime'].hp=1;
 MONSTERS[WORLD_BOSS.kind].damage=0;
 try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});}
 finally{ZONES[0].enemies=spawns;MONSTERS[WORLD_BOSS.kind].hp=bossHp;MONSTERS['moss-slime'].hp=slimeHp;}
 port=await game.start();
}
async function connect(key){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[],id:heroes[key].id};clients.push(c);
 c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.id);c.drop=id=>c.snapshot?.loot.find(d=>d.id===id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['snapshot','roster','trade'].includes(m.type))c[m.type]=m;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 c.send({type:'join',token:tokens[key],characterId:c.id});await until(()=>c.player(),'character connected');return c;
}
async function reject(c,message,label,advance=true){
 if(advance)await tick();const before=assets(c.player()),index=c.messages.length;c.send(message);
 const event=await until(()=>c.messages.slice(index).find(m=>m.type==='event'&&m.kind==='info'),label);
 await delay(120);assert.deepEqual(assets(c.player()),before,`${label}: assets unchanged`);return event;
}
async function finishKill(c,targetId,alreadyCasting=false){
 if(!alreadyCasting){
  const enemy=c.snapshot.enemies.find(enemy=>enemy.id===targetId),route=findPath(c.player(),{x:enemy.x,z:enemy.z+.5},WORLD_COLLIDERS,WORLD_BOUNDS);assert(route.length,'loot fixture reaches the actual relocated enemy');
  for(const end of route)while(Math.hypot(c.player().x-end.x,c.player().z-end.z)>.02){const p=c.player(),gap=Math.hypot(end.x-p.x,end.z-p.z),step=Math.min(2,gap),next={x:p.x+(end.x-p.x)/gap*step,z:p.z+(end.z-p.z)/gap*step};clock+=Math.ceil(movementCost(p,next)/WALK_SPEED*1000)+10;c.send({type:'move',...next,rotation:0});await until(()=>Math.hypot(c.player().x-next.x,c.player().z-next.z)<.02,'legal loot fixture movement');}
  await tick(2000);c.send({type:'attack',ability:'power-shot',targetId});await until(()=>c.player().casting,'spell preparation');
 }
 const endsAt=c.player().casting.endsAt;
 // Deterministic chance draws exercise every eligible row through an actual lethal hit.
 Math.random=()=>0;
 try{await tick(endsAt-clock);await tick(1250);return await until(()=>c.snapshot.loot.find(d=>d.enemyId===targetId&&d.ownerId===c.id),'personal rolled corpse');}
 finally{Math.random=realRandom;}
}
async function collect(c,dropId,rowId){
 const before=c.drop(dropId);assert(before);c.send({type:'loot',targetId:dropId,...(rowId?{itemId:rowId}:{})});
 await until(()=>!c.drop(dropId)||(rowId&&!lootRows(c.drop(dropId)).some(row=>row.id===rowId)),'selected loot committed');
}
try{
 await start(true);const c={};for(const key of Object.keys(heroes))c[key]=await connect(key);
 assert.deepEqual(c.legacy.player().carriedItems,{});assert.equal(c.legacy.player().itemUseReadyAt,0);
 const castIndex=c.owner.messages.length;c.owner.send({type:'attack',ability:'power-shot',targetId:WORLD_BOSS.id});
 const cast=await until(()=>c.owner.player().casting||c.owner.messages.slice(castIndex).find(m=>m.type==='event'&&m.kind==='info'),'combat preparation');assert.notEqual(cast.type,'event',cast.text);
 assert.match((await reject(c.owner,{type:'useItem',itemId:'trail-bread'},'food blocked while casting',false)).text,/combat/);
 const hpBefore=c.owner.player().hp;c.owner.send({type:'useItem',itemId:'greater-tonic'});
 await until(()=>c.owner.player().carriedItems['greater-tonic']===2,'combat tonic consumed');assert.equal(c.owner.player().hp,hpBefore+100);
 const drop=await finishKill(c.owner,WORLD_BOSS.id,true);
 const rows=lootRows(drop);assert(rows.some(row=>row.kind==='gear'&&row.quality==='rare'));assert(rows.some(row=>row.quality==='epic'));assert(rows.some(row=>row.id==='resource:relic'));
 assert.equal(c.owner.player().gold,100,'kill grants no gold/items');assert.equal(c.owner.player().carriedItems['stormhorn-core'],undefined);
 const beforeDeathGate=c.owner.messages.length;c.owner.send({type:'loot',targetId:drop.id});
 await until(()=>c.owner.messages.slice(beforeDeathGate).some(m=>m.type==='event'&&m.text.includes('finish falling')),'death animation blocks premature collection');
 const fullDrop=await finishKill(c.full,'loot-full-boss');
 await tick(DEATH_ANIMATION_MS);await reject(c.full,{type:'loot',targetId:drop.id,itemId:'gold'},'foreign corpse');
 await reject(c.owner,{type:'loot',targetId:drop.id,itemId:'item:invented'},'unknown row');assert.deepEqual(lootRows(c.owner.drop(drop.id)),rows,'opening and failed requests never reroll');
 await reject(c.full,{type:'loot',targetId:fullDrop.id},'loot-all is atomic when full');assert.deepEqual(lootRows(c.full.drop(fullDrop.id)),lootRows(fullDrop));
 await collect(c.full,fullDrop.id,'gold');assert.equal(c.full.player().gold,100+fullDrop.gold,'gold needs no inventory slot');
 await collect(c.full,fullDrop.id,'item:stormhorn-core');assert.equal(c.full.player().carriedItems['stormhorn-core'],6,'existing stacks fit a full bag');assert.equal(bagUsage(c.full.player()),16);
 await reject(c.full,{type:'loot',targetId:fullDrop.id,itemId:'resource:relic'},'new stack needs space');
 // An atomic write failure must preserve the exact rolled corpse and all balances.
 await delay(1200);const beforeFailure=assets(c.owner.player());mkdirSync(`${file}.tmp`);
 assert.match((await reject(c.owner,{type:'loot',targetId:drop.id},'failed loot save')).text,/could not be saved/);
 assert.deepEqual(lootRows(c.owner.drop(drop.id)),rows);assert.deepEqual(assets(stored('owner')),beforeFailure);
 rmSync(`${file}.tmp`,{recursive:true});
 const gearRow=rows.find(row=>row.kind==='gear');await collect(c.owner,drop.id,gearRow.id);
 assert(c.owner.player().ownedGear.includes(gearRow.itemId));await reject(c.owner,{type:'loot',targetId:drop.id,itemId:gearRow.id},'replayed gear row');
 await collect(c.owner,drop.id);assert.equal(c.owner.player().gold,100+drop.gold);assert.equal(c.owner.player().inventory.relic,drop.relic);
 const once=assets(c.owner.player());await reject(c.owner,{type:'loot',targetId:drop.id},'replayed empty corpse');assert.deepEqual(assets(c.owner.player()),once);
 const slime=await finishKill(c.owner,'loot-table-slime');assert(slime.items.some(row=>row.id==='item:slime-residue'));assert(!slime.items.some(row=>row.id==='item:stormhorn-core'));
 await tick(DEATH_ANIMATION_MS);await collect(c.owner,slime.id,'item:slime-residue');assert.equal(c.owner.player().carriedItems['slime-residue'],1);
 await reject(c.owner,{type:'sellItem',npcId:'city-armorer',itemId:'slime-residue',quantity:1},'selling requires a nearby merchant');
 await reject(c.eater,{type:'sellItem',npcId:'rowan',itemId:'slime-residue',quantity:1},'nonmerchant sale');
 for(const quantity of [0,-1,1.5,5,Number.MAX_SAFE_INTEGER])await reject(c.eater,{type:'sellItem',npcId:'city-armorer',itemId:'slime-residue',quantity},'invalid sale quantity');
 await reject(c.eater,{type:'sellItem',npcId:'city-armorer',itemId:'slime-residue',quantity:1,sellPrice:999},'client cannot choose sale value');
 await reject(c.eater,{type:'useItem',itemId:'slime-residue'},'junk cannot be consumed');
 await reject(c.dead,{type:'useItem',itemId:'trail-bread'},'dead player cannot eat');
 const sellGold=c.eater.player().gold;c.eater.send({type:'sellItem',npcId:'city-armorer',itemId:'slime-residue',quantity:4});
 await until(()=>!c.eater.player().carriedItems['slime-residue'],'sell complete stack');assert.equal(c.eater.player().gold,sellGold+4*LOOT_ITEMS['slime-residue'].sellPrice);
 await reject(c.eater,{type:'sellItem',npcId:'city-armorer',itemId:'slime-residue',quantity:4},'replayed sale');
 await delay(1200);const beforeFood=c.eater.player().hp;mkdirSync(`${file}.tmp`);
 await reject(c.eater,{type:'useItem',itemId:'trail-bread'},'failed item use save');assert.equal(c.eater.player().hp,beforeFood);assert.equal(stored('eater').hp,beforeFood);
 rmSync(`${file}.tmp`,{recursive:true});c.eater.send({type:'useItem',itemId:'trail-bread'});await until(()=>c.eater.player().carriedItems['trail-bread']===2,'food consumed');
  assert.equal(c.eater.player().hp,beforeFood+25);assert.equal(c.eater.player().itemUseReadyAt,clock+10000);
 assert.equal(stored('eater').hp,beforeFood+25,'healing is durable in the consumption write before the next autosave');
 assert.equal(stored('eater').carriedItems['trail-bread'],2);assert.equal(stored('eater').itemUseReadyAt,clock+10000);
 assert.match((await reject(c.eater,{type:'useItem',itemId:'greater-tonic'},'shared item cooldown')).text,/cooldown/);
 const cooldown=c.eater.player().itemUseReadyAt;
 // Ordinary trade stages only its own fields and must preserve the new item stacks/cooldown.
 const carriedBefore=[assets(c.eater.player()),assets(c.trader.player())].map(p=>({carriedItems:p.carriedItems,itemUseReadyAt:p.itemUseReadyAt}));
 c.eater.send({type:'tradeRequest',targetId:c.trader.id});await until(()=>c.trader.trade?.trade?.status==='invited','trade invite');
 const tradeId=c.trader.trade.trade.id;c.trader.send({type:'tradeRespond',tradeId,accept:true});await until(()=>c.eater.trade?.trade?.status==='open','trade open');
 c.eater.send({type:'tradeOffer',tradeId,offer:{gold:1,items:{wood:1},gear:[]}});await until(()=>c.eater.trade.trade.participants.some(p=>p.offer.items.wood===1),'trade offer');
 const revision=c.eater.trade.trade.revision;for(const client of [c.eater,c.trader])client.send({type:'tradeAccept',tradeId,revision});await until(()=>!c.eater.trade.trade,'trade complete');
 assert.equal(c.trader.player().inventory.wood,1);
 assert.deepEqual([c.eater,c.trader].map(client=>({carriedItems:client.player().carriedItems,itemUseReadyAt:client.player().itemUseReadyAt})),carriedBefore);
 const durable=Object.fromEntries(Object.entries(c).map(([key,client])=>[key,assets(client.player())]));
 await game.stop();await start();const again={};for(const key of Object.keys(heroes)){again[key]=await connect(key);assert.deepEqual(assets(again[key].player()),durable[key],`${key}: item ownership persists`);}
 assert.equal(again.eater.player().itemUseReadyAt,cooldown);await reject(again.eater,{type:'useItem',itemId:'greater-tonic'},'cooldown survives restart');
 await tick(Math.max(0,cooldown-clock));again.eater.send({type:'useItem',itemId:'greater-tonic'});await until(()=>again.eater.player().carriedItems['greater-tonic']===1,'tonic after cooldown');
 assert.equal(again.eater.player().hp,beforeFood+125);
 // Malformed persisted stacks/cooldowns must fail closed, not silently erase owned items.
 await game.stop();game=null;const valid=JSON.parse(readFileSync(file,'utf8'));
 for(const bad of [{carriedItems:{'forged-item':1}},{carriedItems:{'trail-bread':-1}},{carriedItems:{'trail-bread':1.5}},{carriedItems:null},{itemUseReadyAt:-1},{itemUseReadyAt:null}]){
  const records=structuredClone(valid);Object.assign(records[hash(tokens.eater)].characters[0],bad);writeFileSync(file,JSON.stringify(records));
  assert.throws(()=>createGameServer({port:0,dataDir:dir,keycloak:null,databaseUrl:''}),/Invalid/);
 }
 // Delay only the database adapter acknowledgment; real monster impacts and sockets keep running.
 // Both a surviving player and a lethal hit must retain damage received while item saving awaits.
 for(const startingHp of [400,1]){
  clock+=20000;const pending=hero('Pending Restore',{x:-18,z:62});pending.hp=startingHp;pending.carriedItems={'trail-bread':1,'greater-tonic':1};
  const spawns=ZONES[0].enemies;ZONES[0].enemies=[{id:'pending-hit-slime',kind:'moss-slime',x:-18,z:63}];
  const actual=createOverworldSpawns().find(enemy=>enemy.id==='pending-hit-slime');Object.assign(pending,{x:actual.x,z:actual.z-.5});
  heroes.pending=pending;tokens.pending=randomBytes(32).toString('base64url');
  let databaseRecords={[hash(tokens.pending)]:{characters:[pending]}},holdNext=false,stagedWrite;
  pg.Client=playerDatabaseFixture(databaseRecords,{beforeWrite:async updates=>{
   if(holdNext){holdNext=false;stagedWrite=updates;await new Promise(resolve=>releasePendingWrite=resolve);releasePendingWrite=undefined;}
  }});
  try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'postgres://fixture:fixture@127.0.0.1/fixture'});}
  finally{ZONES[0].enemies=spawns;}
  port=await game.start();const client=await connect('pending');
  const attack=await until(()=>client.snapshot.enemies.find(enemy=>enemy.id==='pending-hit-slime')?.attack,'real incoming melee windup');
  assert.match((await reject(client,{type:'useItem',itemId:'trail-bread'},'food blocked by enemy threat',false)).text,/combat/);
  holdNext=true;client.send({type:'useItem',itemId:'greater-tonic'});await until(()=>releasePendingWrite,'consumable write is pending');
  const staged=stagedWrite.find(row=>row.account_key===hash(tokens.pending)).state.characters[0];
  assert.equal(staged.hp,startingHp+100);assert(!staged.carriedItems['greater-tonic']);assert.equal(staged.itemUseReadyAt,clock+10000);
  await tick(attack.impactAt-clock);await until(()=>client.player().hp<startingHp,'monster damages while persistence awaits');
  const damagedHp=client.player().hp;releasePendingWrite();await until(()=>!client.player().carriedItems['greater-tonic'],'pending consumable completes');
  assert.equal(client.player().hp,damagedHp>0?damagedHp+100:0,'save completion retains intervening damage and never resurrects');
  const liveHp=client.player().hp;await game.stop();game=null;
  assert.equal(databaseRecords[hash(tokens.pending)].characters[0].hp,liveHp,'next normal combat save persists the later damage');
 }
 console.log('PASS: real WS per-monster rolled rows/qualities, death gate, ownership, individual and atomic loot-all, gold/full-stack capacity, durable rollback/retry, gear pickup/replay, NPC sales, food/combat tonic/cooldown, atomic healing with intervening damage/death, trade preservation, restart and strict save validation.');
}finally{
 releasePendingWrite?.();rmSync(`${file}.tmp`,{recursive:true,force:true});for(const c of clients)c.socket.terminate();if(game)await game.stop();Date.now=realNow;Math.random=realRandom;pg.Client=realClient;MONSTERS[WORLD_BOSS.kind].damage=bossDamage;rmSync(dir,{recursive:true,force:true});
}
