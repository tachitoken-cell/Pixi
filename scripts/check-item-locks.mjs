import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { BANKER, AUCTIONEER } from '../src/city.ts';
import { starterGear, gearUpgradeQuote } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newBank } from '../src/bank.ts';
import { newContracts } from '../src/adventure.ts';
import { itemLocked, itemLocksValid } from '../src/item-locks.ts';

const dir=mkdtempSync(join(tmpdir(),'mossvale-item-locks-')),file=join(dir,'players.json'),clients=[];
const realNow=Date.now;let offset=0,game,port;Date.now=()=>realNow()+offset;
const hash=token=>createHash('sha256').update(token).digest('hex');
const hero=(name,point)=>({id:randomUUID(),name,...point,coordinateVersion:2,zone:'greenwood',rotation:0,
 appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},
 characterCreated:true,talents:[],...starterGear('Ranger'),...newBags(),level:60,xp:0,gold:5000,hp:808,maxHp:808,
 inventory:{wood:100,crystal:100,herb:100,potion:3,relic:100},carriedItems:{'slime-residue':6},itemUseReadyAt:0,
 skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,contracts:newContracts(),bank:newBank(),
 quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null}});
const heroes={seller:hero('Protected seller',{x:-18,z:-4}),peer:hero('Trading neighbor',{x:-17,z:-4}),banker:hero('Protected bank',{x:BANKER.x-1.5,z:BANKER.z}),auction:hero('Protected auction',{x:AUCTIONEER.x,z:AUCTIONEER.z+1})};
for(const p of Object.values(heroes)){p.ownedGear.push('ranger-head');p.ownedBags.push({id:randomUUID(),kind:'linen-pouch'});}
heroes.peer.ownedGear=heroes.peer.ownedGear.filter(id=>id!=='ranger-head');
const tokens=Object.fromEntries(Object.keys(heroes).map(name=>[name,randomBytes(32).toString('base64url')]));
const stored=name=>JSON.parse(readFileSync(file,'utf8'))[hash(tokens[name])].characters[0];
const assets=p=>structuredClone({gold:p.gold,inventory:p.inventory,carriedItems:p.carriedItems,ownedGear:p.ownedGear,ownedBags:p.ownedBags,equipment:p.equipment,bank:p.bank,lockedItems:p.lockedItems});
async function until(fn,label){const end=realNow()+6000;while(realNow()<end){const value=fn();if(value)return value;await delay(15);}throw Error(`Timed out: ${label}`);}
async function advance(){offset+=1100;await delay(110);}
async function start(){game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
async function connect(name){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={name,socket,messages:[],id:heroes[name].id};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(m.type==='snapshot')c.snapshot=m;if(m.type==='trade')c.trade=m.trade;if(m.type==='bank')c.bank=m;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token:tokens[name],characterId:c.id});await until(()=>c.player(),'join');return c;}
async function lock(c,itemId,locked=true){await advance();c.send({type:'setItemLock',itemId,locked});await until(()=>itemLocked(c.player(),itemId)===locked&&itemLocked(stored(c.name),itemId)===locked,`persist lock ${itemId}`);}
async function reject(c,message,pattern=/locked/){await advance();const at=c.messages.length,before=assets(stored(c.name));c.send(message);const event=await until(()=>c.messages.slice(at).find(m=>m.type==='event'&&m.kind==='info'||m.type==='trade'&&m.reason),message.type);assert.match(event.text||event.reason,pattern);assert.deepEqual(assets(stored(c.name)),before,`${message.type} preserves assets`);}
async function transfer(c,type,item){await advance();c.send({type,npcId:BANKER.id,item});await until(()=>c.messages.at(-1)?.type==='snapshot'&& (type==='bankDeposit'?stored(c.name).bank.gear.includes(item.id):stored(c.name).ownedGear.includes(item.id)),type);}
try{
 for(const value of [null,['unknown'],['wood','wood'],['bag:not-a-uuid'],['item:unknown']])assert(!itemLocksValid({lockedItems:value}));
 assert(itemLocksValid({}));
 writeFileSync(file,JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([name,p])=>[hash(tokens[name]),{characters:[p]}]))));await start();const c={};for(const name of Object.keys(heroes))c[name]=await connect(name);
 for(const client of Object.values(c))for(const id of [...(client.name==='peer'?[]:['ranger-head']),'wood','item:slime-residue',`bag:${heroes[client.name].ownedBags[0].id}`])await lock(client,id);
 await until(()=>c.peer.snapshot.players.some(p=>p.id===c.seller.id),'observer snapshot');assert(!Object.hasOwn(c.peer.snapshot.players.find(p=>p.id===c.seller.id),'lockedItems'),'item protection is private');
 const bagId=heroes.seller.ownedBags[0].id;
 for(const message of [{type:'sellGear',itemId:'ranger-head',npcId:'city-armorer'},{type:'sellResource',resource:'wood',quantity:2,npcId:'city-armorer'},{type:'sellItem',itemId:'slime-residue',quantity:6,npcId:'city-armorer'},{type:'sellBag',bagId,npcId:'city-armorer'},...['ranger-head','wood','item:slime-residue',`bag:${bagId}`].map(itemId=>({type:'dropItem',itemId,quantity:1}))])await reject(c.seller,message);
 for(const item of [{kind:'gear',id:'ranger-head',quantity:1},{kind:'resource',id:'wood',quantity:1},{kind:'item',id:'slime-residue',quantity:1}])await reject(c.auction,{type:'auctionList',npcId:AUCTIONEER.id,item,currency:'gold',price:'10'});
 await reject(c.seller,{type:'setItemLock',itemId:'unknown',locked:true},/Choose an item/);
 await reject(c.seller,{type:'setItemLock',itemId:'wood',locked:false,extra:true},/Choose an item/);
 await advance();c.seller.send({type:'tradeRequest',targetId:c.peer.id});await until(()=>c.peer.trade?.status==='invited','trade invitation');c.peer.send({type:'tradeRespond',tradeId:c.peer.trade.id,accept:true});await until(()=>c.seller.trade?.status==='open','trade open');
 for(const offer of [{gold:0,items:{wood:1},gear:[]},{gold:0,items:{},gear:['ranger-head']}])await reject(c.seller,{type:'tradeOffer',tradeId:c.seller.trade.id,offer},/offer|items|equipment/i);
 await lock(c.seller,'wood',false);assert.equal(c.seller.trade,null,'changing protection cancels any stale trade acceptance');
 await advance();c.seller.send({type:'sellResource',resource:'wood',quantity:2,npcId:'city-armorer'});await until(()=>stored('seller').inventory.wood===98,'explicit unlock permits sale');
 await transfer(c.banker,'bankDeposit',{kind:'gear',id:'ranger-head',quantity:1});assert(itemLocked(stored('banker'),'ranger-head'),'bank deposit retains protection');
 await lock(c.banker,'ranger-head',false);await lock(c.banker,'ranger-head');await transfer(c.banker,'bankWithdraw',{kind:'gear',id:'ranger-head',quantity:1});
 const quote=gearUpgradeQuote('ranger-head');await advance();c.banker.send({type:'upgradeGear',gearId:'ranger-head'});await until(()=>stored('banker').ownedGear.includes(quote.nextId),'locked gear upgrade');assert(itemLocked(stored('banker'),quote.nextId));assert(!itemLocked(stored('banker'),'ranger-head'));assert(itemLocked(stored('banker'),'wood'),'craft materials may be used without dropping protection');
 await reject(c.banker,{type:'dropItem',itemId:quote.nextId,quantity:1});
 await advance();mkdirSync(file+'.tmp');const before=assets(stored('banker')),at=c.banker.messages.length;c.banker.send({type:'setItemLock',itemId:quote.nextId,locked:false});await until(()=>c.banker.messages.slice(at).some(m=>m.type==='event'&&/could not be saved/.test(m.text)),'failed lock save');assert.deepEqual(assets(stored('banker')),before);assert(itemLocked(c.banker.player(),quote.nextId));rmSync(file+'.tmp',{recursive:true});
 await stop();await start();const restored=await connect('banker');assert(itemLocked(restored.player(),quote.nextId),'restart retains upgraded lock');await reject(restored,{type:'dropItem',itemId:quote.nextId,quantity:1});
 console.log('PASS item locks: durable private protection, all vendor/drop/auction categories, trade offer rejection and stale acceptance cancellation, explicit unlock, bank toggles/transfers, upgrade identity, material use, rollback, restart and malformed input.');
}finally{rmSync(file+'.tmp',{recursive:true,force:true});await stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
