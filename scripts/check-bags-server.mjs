import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS, ZONES, NPCS } from '../src/content.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { newContracts } from '../src/adventure.ts';
import { MONSTERS, WORLD_BOSS } from '../src/bestiary.ts';
import { AUCTIONEER } from '../src/city.ts';
import { bagCapacity, bagUsage, newBags, bagsValid, BAG_ITEMS } from '../src/bags.ts';

const dataDir=mkdtempSync(join(tmpdir(),'mossvale-bags-')),file=join(dataDir,'players.json'),clients=[];
const realNow=Date.now;let offset=0,game,port;
Date.now=()=>realNow()+offset;
const hash=token=>createHash('sha256').update(token).digest('hex');
const stock=Object.values(GEAR).filter(item=>(!item.className||item.className==='Ranger')&&item.id!=='warden-longbow');
function hero(name,at={x:-18,z:-4},level=75){
 const maxHp=100+(level-1)*12;
 return {id:randomUUID(),name,...at,zone:'greenwood',coordinateVersion:2,rotation:0,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},
  characterCreated:true,talents:[],...starterGear('Ranger'),...newBags(),hp:maxHp,maxHp,level,xp:0,gold:5000,
  inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,contracts:newContracts(),
  quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null}};
}
function fill(player,used=16){
 for(const item of stock)if(bagUsage(player)<used&&item.requiredLevel<=player.level&&!player.ownedGear.includes(item.id))player.ownedGear.push(item.id);
 assert.equal(bagUsage(player),used);return player;
}
const shopper=hero('Bag Shopper'),low=hero('Young Traveler',undefined,1),poor=hero('Poor Traveler'),far=hero('Distant Traveler',{x:0,z:8});
poor.gold=23;
const full=hero('Full Backpack'),swap=hero('Bag Upgrade');
full.ownedGear.push('ranger-head');full.equipment.head='ranger-head';fill(full);
const large={id:randomUUID(),kind:'wayfarer-pack'},small={id:randomUUID(),kind:'linen-pouch'};
swap.ownedBags=[large,small];swap.equippedBags[0]=large.id;fill(swap,25);
const rowan=NPCS.find(npc=>npc.id==='rowan');
const quest=fill(hero('Quest Collector',{x:rowan.x,z:rowan.z+1.8}));quest.quest.stage=2;
for(const objective of CHAPTERS[0].objectives)quest.quest.progress[objective.id]=objective.count;
quest.quest.kills=CHAPTERS[0].objectives.filter(o=>o.kind==='kill').reduce((n,o)=>n+o.count,0);
quest.quest.crystals=CHAPTERS[0].objectives.filter(o=>o.kind==='gather').reduce((n,o)=>n+o.count,0);
const craft=hero('Full Workshop',{x:-4,z:5});craft.inventory.herb=3;craft.inventory.crystal=2;fill(craft);
const craftNet=hero('Workshop Net',{x:-4,z:5.2});craftNet.inventory.herb=2;craftNet.inventory.crystal=1;fill(craftNet);
const gather=fill(hero('Full Gatherer',{x:1,z:11})),loot=fill(hero('Full Loot',{x:2,z:13}));
const seller=hero('Bag Seller',{x:AUCTIONEER.x,z:AUCTIONEER.z+1});seller.inventory.herb=2;
const buyer=fill(hero('Bag Buyer',{x:AUCTIONEER.x+1,z:AUCTIONEER.z+1}));
const canceller=fill(hero('Full Cancellation',{x:AUCTIONEER.x-1,z:AUCTIONEER.z+1}));
canceller.auctions=[{id:randomUUID(),sellerId:canceller.id,sellerName:canceller.name,item:{kind:'resource',id:'herb',quantity:1},currency:'gold',price:'10',createdAt:Date.now()}];
const legacy=hero('Old Gear Collector');legacy.inventory={wood:1,crystal:1,herb:1,potion:1,relic:1};legacy.ownedGear=Object.values(GEAR).filter(g=>!g.className||g.className==='Ranger').map(g=>g.id);
delete legacy.ownedBags;delete legacy.equippedBags;
const heroes={shopper,low,poor,far,full,swap,quest,craft,craftNet,gather,loot,seller,buyer,canceller,legacy};
const tokens=Object.fromEntries(Object.keys(heroes).map(key=>[key,randomBytes(32).toString('base64url')]));
const saved=()=>JSON.parse(readFileSync(file,'utf8'));
const stored=key=>saved()[hash(tokens[key])].characters[0];
const assets=p=>structuredClone({gold:p.gold,inventory:p.inventory,ownedGear:p.ownedGear,equipment:p.equipment,ownedBags:p.ownedBags,equippedBags:p.equippedBags,xp:p.xp,quest:p.quest,skills:p.skills,craftingXp:p.craftingXp});
async function until(predicate,label,timeout=6000){const end=realNow()+timeout;while(realNow()<end){const result=predicate();if(result)return result;await delay(15);}throw Error(`Timed out: ${label}`);}
async function advance(ms=800){offset+=ms;await delay(110);}
async function start(seed=false){
 if(seed)writeFileSync(file,JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([key,player])=>[hash(tokens[key]),{characters:[player]}]))));
 const oldNodes=ZONES[0].nodes,oldBoss={...WORLD_BOSS},oldHp=MONSTERS[WORLD_BOSS.kind].hp;
 ZONES[0].nodes=[...oldNodes,{id:'bag-capacity-herb',kind:'herb',x:1,z:10}];WORLD_BOSS.x=2;WORLD_BOSS.z=12;MONSTERS[WORLD_BOSS.kind].hp=1;
 try{game=createGameServer({port:0,host:'127.0.0.1',dataDir,keycloak:null,databaseUrl:''});}
 finally{ZONES[0].nodes=oldNodes;Object.assign(WORLD_BOSS,oldBoss);MONSTERS[WORLD_BOSS.kind].hp=oldHp;}
 port=await game.start();
}
async function connect(key){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),client={socket,id:heroes[key].id,messages:[]};clients.push(client);
 client.send=message=>socket.send(JSON.stringify(message));client.player=()=>client.snapshot?.players.find(p=>p.id===client.id);
 socket.on('message',raw=>{const message=JSON.parse(raw);client.messages.push(message);if(['snapshot','roster','auction','trade'].includes(message.type))client[message.type]=message;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 client.send({type:'join',token:tokens[key],characterId:client.id});await until(()=>client.player(),'connected character');return client;
}
async function reject(client,message,label=message.type){
 await advance();const before=assets(client.player()),index=client.messages.length;client.send(message);
 await until(()=>client.messages.slice(index).some(m=>m.type==='event'&&m.kind==='info'),label);
 await delay(120);assert.deepEqual(assets(client.player()),before,`${label}: rejected action does not change assets or progress`);
}
const buy=(kind='linen-pouch',npcId='city-armorer')=>({type:'buyBag',itemId:kind,npcId});
async function equipToFree(client){
 const item=client.player().ownedGear.map(id=>GEAR[id]).find(item=>!['weapon','armor','ring'].includes(item.slot)&&client.player().equipment[item.slot]===null);
 assert(item);const old=bagUsage(client.player());client.send({type:'equipGear',itemId:item.id});await until(()=>bagUsage(client.player())===old-1,'equip an owned item to free a slot');return item;
}
try{
 await start(true);const c={};for(const key of Object.keys(heroes))c[key]=await connect(key);
 assert.equal(c.legacy.player().ownedBags.length,2);assert(bagsValid(c.legacy.player()));
 assert.deepEqual(c.legacy.player().ownedGear,legacy.ownedGear);assert.deepEqual(c.legacy.player().inventory,legacy.inventory);
 assert.equal(c.shopper.player().ownedBags.length,0);assert.equal(bagCapacity(c.shopper.player()),16);
 await reject(c.low,buy('trail-satchel'),'bag level requirement');
 await reject(c.poor,buy(),'insufficient bag gold');
 await reject(c.far,buy(),'bag merchant range');
 await reject(c.shopper,buy('linen-pouch','city-weaponsmith'),'wrong merchant stock');
 await reject(c.shopper,{...buy(),price:0},'client price override');
 await reject(c.shopper,{type:'equipBag',bagId:small.id,slot:0},'foreign bag');
 for(let slot=0;slot<4;slot++){
  c.shopper.send(buy());await until(()=>c.shopper.player().ownedBags.length===slot+1,'purchase and auto-equip duplicate bag type');
  assert.equal(c.shopper.player().equippedBags[slot],c.shopper.player().ownedBags[slot].id);
 }
 assert.equal(bagCapacity(c.shopper.player()),48);assert.equal(c.shopper.player().gold,5000-4*24);
 c.shopper.send(buy('trail-satchel'));await until(()=>c.shopper.player().ownedBags.length===5,'fifth owned bag goes into backpack');
 const spare=c.shopper.player().ownedBags.at(-1);assert(!c.shopper.player().equippedBags.includes(spare.id));
 await reject(c.shopper,{type:'equipBag',bagId:spare.id,slot:4},'fifth equipped slot');
 await reject(c.shopper,{type:'sellBag',bagId:c.shopper.player().equippedBags[0],npcId:'city-armorer'},'selling an equipped bag');
 c.shopper.send({type:'equipBag',bagId:spare.id,slot:0});await until(()=>c.shopper.player().equippedBags[0]===spare.id,'replace bag');
 assert.equal(bagCapacity(c.shopper.player()),52);const replaced=c.shopper.player().ownedBags[0],beforeSell=c.shopper.player().gold;
 c.shopper.send({type:'sellBag',bagId:replaced.id,npcId:'city-armorer'});await until(()=>!c.shopper.player().ownedBags.some(b=>b.id===replaced.id),'sell the replaced bag');
 assert.equal(c.shopper.player().gold,beforeSell+6);
 await reject(c.shopper,{type:'sellBag',bagId:replaced.id,npcId:'city-armorer'},'replayed bag sale');
 c.shopper.send({type:'equipBag',bagId:spare.id,slot:3});await until(()=>c.shopper.player().equippedBags[0]===null,'moving one bag clears its previous socket');
 assert.equal(c.shopper.player().equippedBags.filter(id=>id===spare.id).length,1);assert.equal(bagCapacity(c.shopper.player()),44);
 c.shopper.send({type:'unequipBag',slot:1});await until(()=>c.shopper.player().equippedBags[1]===null,'safe bag removal returns its item');
 assert.equal(bagCapacity(c.shopper.player()),36);assert.equal(c.shopper.player().ownedBags.length,4);
 await reject(c.swap,{type:'equipBag',bagId:small.id,slot:0},'unsafe smaller replacement');
 await reject(c.swap,{type:'unequipBag',slot:0},'unsafe bag removal');
 const newGear=stock.find(item=>item.price>0&&item.slot!=='weapon'&&!full.ownedGear.includes(item.id));assert(newGear);
 await reject(c.full,{type:'buyGear',npcId:'city-armorer',itemId:newGear.id},'full gear purchase preserves gold');
 await reject(c.full,{type:'npcService',npcId:'city-armorer',service:'potion'},'full potion purchase preserves gold');
 await reject(c.full,{type:'unequipGear',slot:'head'},'full equipment removal preserves equipped stats');
 c.full.send(buy());await until(()=>bagCapacity(c.full.player())===24,'full base backpack can buy and equip its first expansion');
 await reject(c.full,{type:'unequipBag',slot:0},'removal needs a slot for the bag itself');
 await reject(c.quest,{type:'interact',targetId:'rowan'},'full quest reward remains unclaimed');
 await equipToFree(c.quest);await advance();c.quest.send({type:'interact',targetId:'rowan'});await until(()=>c.quest.player().quest.chapter===1,'claim quest after freeing a slot');
 assert.equal(c.quest.player().inventory.potion,2);assert.equal(c.quest.player().gold,5060);
 await reject(c.craft,{type:'craft',recipeId:'trail-tonic'},'full craft preserves materials and crafting XP');
 c.craftNet.send({type:'craft',recipeId:'trail-tonic'});await until(()=>c.craftNet.player().inventory.potion===1,'craft evaluates net slots after consuming full stacks');
 assert.equal(c.craftNet.player().inventory.herb,0);assert.equal(c.craftNet.player().inventory.crystal,0);assert.equal(bagUsage(c.craftNet.player()),15);
 c.gather.send({type:'gather',targetId:'bag-capacity-herb'});await until(()=>c.gather.player().gathering,'gather starts');
 await advance(2200);await until(()=>!c.gather.player().gathering,'full gather completes safely');
 assert.equal(c.gather.player().inventory.herb,0);assert.equal(c.gather.player().skills.herbalism,0);
 assert(c.gather.snapshot.nodes.find(node=>node.id==='bag-capacity-herb').available,'failed gather does not consume the node');
 await equipToFree(c.gather);c.gather.send({type:'gather',targetId:'bag-capacity-herb'});await until(()=>c.gather.player().gathering,'gather retry');await advance(2200);
 await until(()=>c.gather.player().inventory.herb===1,'gather succeeds after freeing space');
 c.loot.send({type:'attack',ability:'arrow',targetId:WORLD_BOSS.id});await until(()=>c.loot.player().casting,'loot fixture cast starts');await advance(5000);await advance(1000);
 const drop=await until(()=>c.loot.snapshot.loot.find(drop=>drop.ownerId===c.loot.id),'real defeated monster drops relic loot');assert(drop.relic>0);
 await reject(c.loot,{type:'loot',targetId:drop.id},'full loot stays on corpse');assert(c.loot.snapshot.loot.some(item=>item.id===drop.id));
 await equipToFree(c.loot);c.loot.send({type:'loot',targetId:drop.id,itemId:'resource:relic'});await until(()=>c.loot.player().inventory.relic===drop.relic,'individual relic stack after freeing room');
 const one=c.seller,two=c.buyer;
 one.send({type:'tradeRequest',targetId:two.id});await until(()=>two.trade?.trade?.status==='invited','trade invitation');
 const tradeId=two.trade.trade.id;two.send({type:'tradeRespond',tradeId,accept:true});await until(()=>one.trade?.trade?.status==='open','trade accepted');
 one.send({type:'tradeOffer',tradeId,offer:{gold:0,items:{herb:1},gear:[]}});await until(()=>one.trade.trade.participants.some(p=>p.offer.items.herb===1),'trade offer');
 const beforeTrade=[assets(one.player()),assets(two.player())];two.send({type:'tradeAccept',tradeId,revision:one.trade.trade.revision});
 await until(()=>two.trade.reason?.includes('bag space'),'full trade is rejected');assert.deepEqual([assets(one.player()),assets(two.player())],beforeTrade);
 one.send({type:'tradeCancel',tradeId});await until(()=>!one.trade.trade,'trade cancelled');
 await reject(c.canceller,{type:'auctionCancel',npcId:AUCTIONEER.id,listingId:canceller.auctions[0].id},'full cancelled auction retains escrow');
 one.send({type:'auctionList',npcId:AUCTIONEER.id,item:{kind:'resource',id:'herb',quantity:1},currency:'gold',price:'10'});
 const listing=await until(()=>one.auction?.mine[0],'auction listing');
 await reject(two,{type:'auctionBuy',npcId:AUCTIONEER.id,listingId:listing.id},'auction purchase capacity');
 assert(one.auction.mine.some(item=>item.id===listing.id),'failed buy keeps listing');
 await equipToFree(two);two.send({type:'auctionBuy',npcId:AUCTIONEER.id,listingId:listing.id});await until(()=>two.player().inventory.herb===1,'auction purchase after making room');
 assert.equal(two.player().gold,4990);assert.equal(one.player().gold,5010);
 // A failed durable bag purchase neither charges gold nor grants its new capacity.
 await delay(1200);const beforeFailure=assets(c.shopper.player());mkdirSync(`${file}.tmp`);
 await reject(c.shopper,buy(),'bag purchase persistence failure');assert.deepEqual(assets(stored('shopper')),beforeFailure);
 rmSync(`${file}.tmp`,{recursive:true});c.shopper.send(buy());await until(()=>c.shopper.player().ownedBags.length===5,'retry after restoring persistence');
 const durable=Object.fromEntries(Object.entries(c).map(([key,client])=>[key,assets(client.player())]));
 await game.stop();await start();for(const key of Object.keys(heroes)){const again=await connect(key);assert.deepEqual(assets(again.player()),durable[key],`${key}: item and bag ownership survive restart`);assert(bagsValid(again.player()));}
 assert.equal(stored('legacy').ownedBags.length,2,'restart never repeats the legacy bag grant');
 console.log('PASS: real WebSocket bag purchases/auto-equip, duplicates, four sockets, levels/ownership/merchant security, safe replacement/removal/sale, full rewards/crafting/gathering/loot/trade/auctions, legacy preservation, disk rollback and restart.');
}finally{rmSync(`${file}.tmp`,{recursive:true,force:true});for(const client of clients)client.socket.terminate();if(game)await game.stop();Date.now=realNow;rmSync(dataDir,{recursive:true,force:true});}
