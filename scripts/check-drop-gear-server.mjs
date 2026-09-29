import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS, ZONES } from '../src/content.ts';
import { GEAR, gearById, starterGear, combatStats } from '../src/progression.ts';
import { lootRows } from '../src/loot-items.ts';
import { MONSTERS, monsterLevelScale } from '../src/bestiary.ts';
import { SPELLS, spellDamage } from '../src/spells.ts';
import { newBags, bagUsage } from '../src/bags.ts';
import { newBank } from '../src/bank.ts';
import { newContracts } from '../src/adventure.ts';
import { BANKER, AUCTIONEER, CITY_VENDORS } from '../src/city.ts';
import { merchantStock, gearSellPrice } from '../src/merchants.ts';
import { OVERWORLD_SPAWNS, createOverworldSpawns, canTraverse } from '../src/realm.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';

// Isolated saves and a real realm/socket flow, following check-loot-tables-server.mjs.
const dir=mkdtempSync(join(tmpdir(),'mossvale-drop-gear-')),file=join(dir,'players.json'),clients=[];
const realNow=Date.now,realRandom=Math.random,originalMonsters=structuredClone(MONSTERS),originalGear=Object.entries(GEAR);
let clock=realNow(),game,port,probeMode=false;Date.now=()=>clock;
const classes=['Ranger','Knight','Mage','Cleric'],ability={Ranger:'arrow',Knight:'strike',Mage:'fireball',Cleric:'smite'};
const home=OVERWORLD_SPAWNS.find(spawn=>spawn.id==='slime-1'),at={x:home.x,z:home.z-.5};
const hash=token=>createHash('sha256').update(token).digest('hex');
function hero(className,level=3){
 const maxHp=100+(level-1)*12;
 return {id:randomUUID(),name:`${className} Gear ${level}`,coordinateVersion:2,zone:'greenwood',...at,rotation:0,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className},
  characterCreated:true,talents:[],...starterGear(className),ownedGear:[...starterGear(className).ownedGear,`drop-${className.toLowerCase()}-common-1-weapon`],...newBags(),hp:maxHp,maxHp,level,xp:0,gold:1000,
  inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},itemUseReadyAt:0,
  skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,contracts:newContracts(),
  bank:newBank(),
  quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null}};
}
const heroes=Object.fromEntries(classes.map(name=>[name,hero(name)]));heroes.low=hero('Ranger',1);heroes.buyer=hero('Ranger');
const tokens=Object.fromEntries(Object.keys(heroes).map(name=>[name,randomBytes(32).toString('base64url')]));
const saved=()=>JSON.parse(readFileSync(file,'utf8')),stored=name=>saved()[hash(tokens[name])].characters[0];
const assets=p=>structuredClone({gold:p.gold,ownedGear:p.ownedGear,equipment:p.equipment,inventory:p.inventory,carriedItems:p.carriedItems});
async function until(fn,label){const end=realNow()+5000;while(realNow()<end){const value=fn();if(value)return value;await delay(15);}throw Error(`Timed out: ${label}`);}
async function tick(ms=800){clock+=ms;await delay(120);}
async function start(seed=false){
 const spawns=ZONES[0].enemies;
 ZONES[0].enemies=probeMode?[{id:'gear-damage-probe',kind:'briar-sentinel',x:home.x,z:home.z}]:Object.keys(heroes).map(name=>({id:`gear-loot-${name}`,kind:'moss-slime',x:home.x,z:home.z}));
 if(seed){const spawns=createOverworldSpawns(),records=saved();for(const [name,token] of Object.entries(tokens)){const spawn=spawns.find(s=>s.id===`gear-loot-${name}`);Object.assign(records[hash(token)].characters[0],{x:spawn.x,z:spawn.z-.5});}writeFileSync(file,JSON.stringify(records));}
 Object.assign(MONSTERS['moss-slime'],{hp:1,xp:0,speed:0,aggroRange:0});Object.assign(MONSTERS['briar-sentinel'],{hp:10000,speed:0,aggroRange:0,damage:0});
 try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});}finally{ZONES[0].enemies=spawns;}
 port=await game.start();
}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
async function connect(name){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[],name,id:heroes[name].id};clients.push(c);
 c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.id);c.drop=id=>c.snapshot?.loot.find(d=>d.id===id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['snapshot','roster','bank','auction'].includes(m.type))c[m.type]=m;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token:tokens[name],characterId:c.id});await until(()=>c.player(),`${name} joined`);return c;
}
async function reject(c,message,label,pattern){
 await tick();const before=assets(c.player()),index=c.messages.length;c.send(message);
 const event=await until(()=>c.messages.slice(index).find(m=>m.type==='event'&&m.kind==='info'),label);if(pattern)assert.match(event.text,pattern);
 await delay(120);assert.deepEqual(assets(c.player()),before,`${label}: assets unchanged`);
}
async function attack(c,targetId){
 await tick(4500);const index=c.messages.length,spell=ability[c.player().appearance.className];c.send({type:'attack',ability:spell,targetId});
 const casting=await until(()=>c.player().casting||c.messages.slice(index).find(m=>m.type==='combat'&&m.playerId===c.id)||c.messages.slice(index).find(m=>m.type==='event'&&m.kind==='info'),`${c.name} cast starts`);
 assert.notEqual(casting.type,'event',`${c.name}: ${casting.text}`);
 if(casting.endsAt)await tick(Math.max(0,casting.endsAt-clock));await tick(1000);
 return until(()=>c.messages.slice(index).find(m=>m.type==='damage'&&m.targetId===targetId&&!m.effect),'real damage impact');
}
async function damageCheck(c){
 const stats=combatStats(c.player()),target=c.snapshot.enemies.find(e=>e.id==='gear-damage-probe');
 const expected=Math.max(1,Math.round(spellDamage(SPELLS[ability[c.player().appearance.className]],stats)/monsterLevelScale(target.level,c.player().level)));
 assert.equal((await attack(c,target.id)).amount,expected,'server damage uses equipped gear stats');return expected;
}
async function equip(c,id){await tick();c.send({type:'equipGear',itemId:id});await until(()=>c.player().equipment.weapon===id,`equip ${id}`);}
async function relocate(point){
 // Move only the fixture's saved positions between service checks; all ownership comes from the socket flow.
 await stop();const records=saved();for(const record of Object.values(records))Object.assign(record.characters[0],point,{hp:record.characters[0].maxHp});writeFileSync(file,JSON.stringify(records));
 await start();const result={};for(const name of Object.keys(heroes))result[name]=await connect(name);return result;
}
try{
 const dropGear=Object.values(GEAR).filter(g=>g.dropOnly);
 assert(canTraverse(at,home));assert.equal(dropGear.length,128,'expanded drop catalog loaded');
 for(const gear of dropGear)for(const slot of gear.slot==='ring'?['ring1','ring2']:[gear.slot]){
  const player={appearance:{className:gear.className},level:gear.requiredLevel,talents:[],...starterGear(gear.className)},before=combatStats(player);
  player.equipment[slot]=gear.id;const after=combatStats(player);
  for(const stat of ['primaryDamage','specialDamage','defense'])assert.equal(after[stat],before[stat]+(gear.stats[stat]||0)+(stat==='defense'?0:gear.stats[gear.className==='Knight'?'strength':gear.className==='Ranger'?'agility':'intellect']||0),`${gear.label}: ${slot} applies ${stat}`);
 }
 for(const npc of CITY_VENDORS)assert(!merchantStock(npc.id).some(g=>g.dropOnly),'drop gear is excluded from merchant stock');
 // Keep zero-draw fixtures on authored weapons now that already-owned catalog items remain eligible.
 for(const id of Object.keys(GEAR))delete GEAR[id];Object.assign(GEAR,Object.fromEntries([...originalGear.filter(([,g])=>g.dropOnly),...originalGear.filter(([,g])=>!g.dropOnly)]));
 writeFileSync(file,JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([name,p])=>[hash(tokens[name]),{characters:[p]}]))));
 await start(true);let c={};for(const name of Object.keys(heroes))c[name]=await connect(name);const drops={},duplicates={};
 for(const name of classes){
  const client=c[name],baseline=combatStats(client.player()),before=bagUsage(client.player());
  Math.random=()=>0;try{await attack(client,`gear-loot-${name}`);}finally{Math.random=realRandom;}
  const corpse=await until(()=>client.snapshot.loot.find(d=>d.enemyId===`gear-loot-${name}`&&d.ownerId===client.id),'personal gear corpse');
  const rows=lootRows(corpse).filter(row=>row.kind==='gear'&&!gearById(row.itemId)?.randomized);assert.equal(rows.length,2);
  assert(lootRows(corpse).some(row=>row.kind==='gear'&&gearById(row.itemId)?.randomized),'real kills also include the deterministic procedural roll');
  assert.deepEqual(rows.map(row=>row.quality).sort(),['common','uncommon']);
  for(const row of rows){const g=gearById(row.itemId);assert(g.dropOnly);assert.equal(g.className,name);assert.equal(g.slot,'weapon');assert(g.requiredLevel<=client.player().level);assert.match(g.id,/~5~(common|uncommon)~[0-9a-f]{16}~0$/);}
  drops[name]=Object.fromEntries(rows.map(row=>[row.quality,row.itemId]));
  assert(rows.every(row=>!client.player().ownedGear.includes(row.itemId)),'kill does not auto-award equipment');await tick(DEATH_ANIMATION_MS);
  for(const row of rows){
   await tick();const message={type:'loot',targetId:corpse.id,itemId:row.id},index=client.messages.length;client.send(message);client.send(message);
   await until(()=>client.player().ownedGear.includes(row.itemId),'gear is claimed into the bag');
   await until(()=>client.messages.slice(index).some(m=>m.type==='event'&&m.kind==='reward'&&m.text.includes(`+1 ${gearById(row.itemId).label}`)),'loot reward uses the authored item name');
   assert.equal(client.player().ownedGear.filter(id=>id===row.itemId).length,1,'concurrent pickup cannot duplicate gear');
   await reject(client,message,'claimed row cannot be replayed');
  }
  assert.equal(bagUsage(client.player()),before+2,'each unequipped gear item consumes one bag slot');
  await tick(14000);Math.random=()=>0;try{await attack(client,`gear-loot-${name}`);}finally{Math.random=realRandom;}
  const second=await until(()=>client.snapshot.loot.find(d=>d.enemyId===`gear-loot-${name}`&&d.ownerId===client.id&&d.id!==corpse.id),'second personal gear corpse');
  const copy=lootRows(second).find(row=>row.kind==='gear'&&gearById(row.itemId)?.baseId===gearById(drops[name].common).baseId&&!gearById(row.itemId).randomized);
  assert(copy,'already-owned authored gear still drops');assert.notEqual(copy.itemId,drops[name].common,'second copy has its own identity');
  await tick(DEATH_ANIMATION_MS);client.send({type:'loot',targetId:second.id,itemId:copy.id});await until(()=>client.player().ownedGear.includes(copy.itemId),'second copy collected');
  duplicates[name]=copy.itemId;assert.equal(bagUsage(client.player()),before+3,'duplicate copy consumes its own bag slot');
  for(const id of [copy.itemId,drops[name].common,gearById(copy.itemId).baseId])assert(client.player().ownedGear.includes(id),'both copies and the legacy catalog original coexist');
  for(const quality of ['common','uncommon']){
   const id=drops[name][quality],g=gearById(id);await equip(client,id);
   const stats=combatStats(client.player());for(const key of ['primaryDamage','specialDamage','defense'])assert.equal(stats[key],baseline[key]+(g.stats[key]||0)+(key==='defense'?0:g.stats[g.className==='Knight'?'strength':g.className==='Ranger'?'agility':'intellect']||0));
  }
  await reject(c[classes[(classes.indexOf(name)+1)%classes.length]],{type:'equipGear',itemId:drops[name].common},'wrong-class equip rejected',/class and level/);
 }
 await reject(c.low,{type:'equipGear',itemId:drops.Ranger.uncommon},'level requirement rejected',/class and level/);
 Math.random=()=>0;try{await attack(c.low,'gear-loot-low');}finally{Math.random=realRandom;}
 const lowDrop=await until(()=>c.low.snapshot.loot.find(d=>d.enemyId==='gear-loot-low'&&d.ownerId===c.low.id),'low-level corpse');
 assert(lootRows(lowDrop).some(row=>row.kind==='gear'));assert(lootRows(lowDrop).filter(row=>row.kind==='gear').every(row=>gearById(row.itemId).requiredLevel<=1),'loot respects recipient level');
 probeMode=true;c=await relocate(at);
 for(const name of classes){
  await equip(c[name],starterGear(name).equipment.weapon);const baseDamage=await damageCheck(c[name]);
  for(const quality of ['common','uncommon']){await equip(c[name],drops[name][quality]);assert((await damageCheck(c[name]))>baseDamage,`${name} ${quality} weapon improves real damage`);}
 }
 const durable=Object.fromEntries(classes.map(name=>[name,assets(c[name].player())]));c=await relocate({x:BANKER.x-1.5,z:BANKER.z});
 for(const name of classes){
  assert.deepEqual(assets(c[name].player()),durable[name],'claimed/equipped gear survives restart');
  const id=drops[name].common;await tick();c[name].send({type:'bankDeposit',npcId:BANKER.id,item:{kind:'gear',id,quantity:1}});
  await until(()=>c[name].bank?.bank.gear.includes(id),'drop gear bank deposit');assert(!c[name].player().ownedGear.includes(id));
  assert(c[name].player().ownedGear.includes(duplicates[name]),'banking one copy preserves the other');
 }
 c=await relocate({x:BANKER.x-1.5,z:BANKER.z});
 for(const name of classes){
  const id=drops[name].common;assert(stored(name).bank.gear.includes(id),'banked drop gear survives restart');
  await tick();c[name].send({type:'bankWithdraw',npcId:BANKER.id,item:{kind:'gear',id,quantity:1}});await until(()=>c[name].player().ownedGear.includes(id),'drop gear bank withdrawal');
 }
 const near=Array.from({length:32},(_,i)=>({x:AUCTIONEER.x+Math.cos(i*Math.PI/16)*1.2,z:AUCTIONEER.z+Math.sin(i*Math.PI/16)*1.2})).find(p=>canTraverse(p,AUCTIONEER));assert(near);c=await relocate(near);
 const id=drops.Ranger.common;c.Ranger.send({type:'auctionList',npcId:AUCTIONEER.id,item:{kind:'gear',id,quantity:1},currency:'gold',price:'25'});
 const listing=await until(()=>c.Ranger.auction?.mine.find(a=>a.item.id===id),'drop gear auction escrow');assert(!c.Ranger.player().ownedGear.includes(id));
 assert(c.Ranger.player().ownedGear.includes(duplicates.Ranger),'auctioning one copy preserves the other');
 await reject(c.Knight,{type:'auctionBuy',npcId:AUCTIONEER.id,listingId:listing.id},'auction class restriction');
 const buyerGold=c.buyer.player().gold,sellerGold=c.Ranger.player().gold;await tick();c.buyer.send({type:'auctionBuy',npcId:AUCTIONEER.id,listingId:listing.id});
 await until(()=>c.buyer.player().ownedGear.includes(id),'auctioned drop gear transferred');assert.equal(c.buyer.player().gold,buyerGold-25);assert.equal(c.Ranger.player().gold,sellerGold+25);
 await reject(c.buyer,{type:'auctionBuy',npcId:AUCTIONEER.id,listingId:listing.id},'auction replay rejected');
 c=await relocate({x:-17,z:11});assert(c.buyer.player().ownedGear.includes(id),'auction ownership survives restart');
 for(const name of classes){
  const itemId=name==='Ranger'?Object.values(GEAR).find(g=>g.dropOnly&&g.className===name&&g.slot==='weapon'&&g.requiredLevel>3).id:drops[name].common;
  await reject(c[name],{type:'buyGear',npcId:'city-weaponsmith',itemId},'drop gear cannot be bought from NPC',/does not stock/);
 }
 const sale=drops.Mage.common,gold=c.Mage.player().gold;await tick();c.Mage.send({type:'sellGear',npcId:'city-weaponsmith',itemId:sale});
 await until(()=>!c.Mage.player().ownedGear.includes(sale),'drop gear sold');assert.equal(c.Mage.player().gold,gold+gearSellPrice(sale));await reject(c.Mage,{type:'sellGear',npcId:'city-weaponsmith',itemId:sale},'sale replay rejected');
 assert(c.Mage.player().ownedGear.includes(duplicates.Mage),'selling one copy preserves the other');
 for(const name of classes)assert(c[name].player().ownedGear.includes(gearById(duplicates[name]).baseId),'legacy catalog original survives all copy transfers');
 const end=Object.fromEntries(Object.keys(heroes).map(name=>[name,assets(c[name].player())]));await stop();await start();
 for(const name of Object.keys(heroes)){const restored=await connect(name);assert.deepEqual(assets(restored.player()),end[name],`${name}: final ownership/equipment/gold durable`);}
 console.log('PASS: all 128 authored item stat bonuses and both ring slots; real WS named common/uncommon drops for all four classes, repeat copies alongside legacy originals, level/class restrictions, bag slots, duplicate pickup/replay, equipped combat damage, independent bank/auction/vendor transfers and durable restarts.');
}finally{await stop();Date.now=realNow;Math.random=realRandom;for(const [kind,stats] of Object.entries(originalMonsters))Object.assign(MONSTERS[kind],stats);for(const id of Object.keys(GEAR))delete GEAR[id];Object.assign(GEAR,Object.fromEntries(originalGear));rmSync(dir,{recursive:true,force:true});}
