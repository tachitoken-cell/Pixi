import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { BANKER, AUCTIONEER } from '../src/city.ts';
import { canTraverse } from '../src/realm.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { newBags, bagUsage } from '../src/bags.ts';
import { newBank, bankPlayerValid, BANK_CAPACITY } from '../src/bank.ts';
import { newContracts } from '../src/adventure.ts';

const dir=mkdtempSync(join(tmpdir(),'mossvale-bank-')),file=join(dir,'players.json'),clients=[];
let game,port,offset=0;const realNow=Date.now;Date.now=()=>realNow()+offset;
const key=token=>createHash('sha256').update(token).digest('hex');
const hero=(name,point={x:BANKER.x-1.5,z:BANKER.z})=>({id:randomUUID(),name,...point,coordinateVersion:2,zone:'greenwood',rotation:0,
 appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},
 characterCreated:true,talents:[],...starterGear('Ranger'),...newBags(),level:60,xp:0,gold:5000,hp:808,maxHp:808,
 inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},itemUseReadyAt:0,skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,contracts:newContracts(),
 quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null}});
const owner=hero('Bank owner'),observer=hero('Bank neighbor'),far=hero('Far visitor',{x:0,z:8}),blocked=hero('Behind counter',{x:BANKER.x+3,z:BANKER.z}),dead=hero('Fallen visitor');dead.hp=0;dead.diedAt=Date.now();
const spare={id:randomUUID(),kind:'linen-pouch'};owner.ownedBags.push(spare);owner.inventory.wood=10;owner.carriedItems['slime-residue']=6;owner.ownedGear.push('ranger-head','warden-longbow');owner.equipment.weapon='warden-longbow';
const full=hero('Full backpack');full.bank={...newBank(),resources:{wood:5},items:{'slime-residue':2}};full.inventory.wood=1;
for(const g of Object.values(GEAR))if(bagUsage(full)<16&&(!g.className||g.className==='Ranger')&&g.requiredLevel<=full.level&&!full.ownedGear.includes(g.id))full.ownedGear.push(g.id);
assert.equal(bagUsage(full),16);
const packed=hero('Full bank');packed.bank={...newBank(),bags:Array.from({length:BANK_CAPACITY},()=>({id:randomUUID(),kind:'linen-pouch'}))};packed.inventory.wood=1;
const duplicate=hero('Banked vendor gear',{x:-18,z:-4});duplicate.bank={...newBank(),gear:['ranger-head']};
const auctionBuyer=hero('Banked auction gear',{x:AUCTIONEER.x,z:AUCTIONEER.z+1});auctionBuyer.bank={...newBank(),gear:['ranger-head']};
const seller=hero('Gear seller',{x:AUCTIONEER.x+1,z:AUCTIONEER.z+1});seller.auctions=[{id:randomUUID(),sellerId:seller.id,sellerName:seller.name,item:{kind:'gear',id:'ranger-head',quantity:1},currency:'gold',price:'10',createdAt:Date.now()}];
const heroes={owner,observer,far,blocked,dead,full,packed,duplicate,auctionBuyer,seller};const tokens=Object.fromEntries(Object.keys(heroes).map(name=>[name,randomBytes(32).toString('base64url')]));
const saved=()=>JSON.parse(readFileSync(file,'utf8'));const stored=name=>saved()[key(tokens[name])].characters[0];
const assets=p=>structuredClone({gold:p.gold,inventory:p.inventory,carriedItems:p.carriedItems,ownedGear:p.ownedGear,ownedBags:p.ownedBags,equipment:p.equipment});
async function until(fn,label){const end=realNow()+7000;while(realNow()<end){const result=fn();if(result)return result;await delay(15);}throw Error(`Timed out: ${label}`);}
async function advance(){offset+=900;await delay(120);}
async function start(){game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
async function connect(name){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[],id:heroes[name].id,name};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['roster','welcome','snapshot','bank'].includes(m.type))c[m.type]=m;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token:tokens[name],characterId:c.id});await until(()=>c.player(),'enter bank fixture');return c;}
const request=(type,item,npcId=BANKER.id)=>({type,npcId,...(item?{item}:{})});
async function rejected(c,message,label=message.type){await advance();const index=c.messages.length,before=assets(c.player()),bank=structuredClone(stored(c.name).bank??newBank());c.send(message);
 await until(()=>c.messages.slice(index).some(m=>m.type==='event'&&m.kind==='info'),label);await delay(120);assert.deepEqual(assets(c.player()),before,label);assert.deepEqual(stored(c.name).bank??newBank(),bank,label+' bank unchanged');}
async function transfer(c,type,item){await advance();const index=c.messages.length;c.send(request(type,item));await until(()=>c.messages.slice(index).find(m=>m.type==='bank'&&m.reason),type);assert.equal(c.bank.open,false);assert(bankPlayerValid(stored(c.name)));}
try{
 assert(canTraverse(owner,BANKER));assert(!canTraverse(blocked,BANKER));assert(Math.hypot(blocked.x-BANKER.x,blocked.z-BANKER.z)<4);
 writeFileSync(file,JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([name,p])=>[key(tokens[name]),{characters:[p]}]))));await start();const c={};for(const name of Object.keys(heroes))c[name]=await connect(name);
 c.owner.send({type:'interact',targetId:BANKER.id});await until(()=>c.owner.bank?.open,'right click banker opens private inventory');assert.equal(c.owner.bank.capacity,48);assert.deepEqual(c.owner.bank.bank,newBank(),'old characters migrate to empty banks');
 for(const visitor of [c.far,c.blocked,c.dead])await rejected(visitor,request('bankOpen'),'bank range, wall or life guard');
 for(const item of [{kind:'resource',id:'gold',quantity:1},{kind:'item',id:'missing',quantity:1},{kind:'resource',id:'wood',quantity:-1},{kind:'resource',id:'wood',quantity:1.5},{kind:'resource',id:'wood',quantity:11},{kind:'bag',id:randomUUID(),quantity:1}])await rejected(c.owner,request('bankDeposit',item),'strict authoritative ownership/quantity');
 await rejected(c.owner,{...request('bankDeposit',{kind:'resource',id:'wood',quantity:1}),price:0},'extra client fields');
 await rejected(c.owner,request('bankDeposit',{kind:'gear',id:'warden-longbow',quantity:1}),'equipped weapon cannot be deposited');
 await rejected(c.owner,request('bankDeposit',{kind:'resource',id:'wood',quantity:1},AUCTIONEER.id),'wrong service NPC');
 for(const item of [{kind:'resource',id:'wood',quantity:4},{kind:'item',id:'slime-residue',quantity:3},{kind:'gear',id:'ranger-head',quantity:1},{kind:'gear',id:'ranger-bow',quantity:1},{kind:'bag',id:spare.id,quantity:1}])await transfer(c.owner,'bankDeposit',item);
 assert.equal(c.owner.player().inventory.wood,6);assert.equal(c.owner.bank.bank.resources.wood,4);assert.equal(c.owner.player().carriedItems['slime-residue'],3);assert(!c.owner.player().ownedGear.includes('ranger-bow'));assert(c.owner.bank.bank.gear.includes('ranger-bow'),'unequipped starter gear can be banked');
 assert.equal(c.observer.messages.filter(m=>m.type==='bank').length,0,'bank contents never broadcast to nearby players');
 for(const client of Object.values(c))for(const m of client.messages){if(m.type==='snapshot'||m.type==='roster')for(const p of m.players??m.characters)assert(!Object.hasOwn(p,'bank'),'public player has no private bank');if(m.type==='welcome')assert(!Object.hasOwn(m.player,'bank'));}
 await rejected(c.duplicate,{type:'buyGear',npcId:'city-armorer',itemId:'ranger-head'},'cannot buy duplicate banked gear');
 await rejected(c.auctionBuyer,{type:'auctionBuy',npcId:AUCTIONEER.id,listingId:seller.auctions[0].id},'cannot auction-buy duplicate banked gear');
 await rejected(c.packed,request('bankDeposit',{kind:'resource',id:'wood',quantity:1}),'48-slot bank limit');
 await rejected(c.full,request('bankWithdraw',{kind:'item',id:'slime-residue',quantity:1}),'full backpack withdrawal');
 await transfer(c.full,'bankWithdraw',{kind:'resource',id:'wood',quantity:5});assert.equal(c.full.player().inventory.wood,6,'existing stacks merge in a full backpack');assert.equal(bagUsage(c.full.player()),16);
 // A failed disk write must leave both sides unchanged and permit a retry.
 await advance();mkdirSync(file+'.tmp');const failedBefore=assets(c.owner.player()),failedBank=structuredClone(stored('owner').bank),index=c.owner.messages.length;
 c.owner.send(request('bankWithdraw',{kind:'item',id:'slime-residue',quantity:1}));await until(()=>c.owner.messages.slice(index).some(m=>m.type==='event'&&m.text.includes('could not be saved')),'injected save failure');
 assert.deepEqual(assets(c.owner.player()),failedBefore);assert.deepEqual(stored('owner').bank,failedBank);rmSync(file+'.tmp',{recursive:true});await transfer(c.owner,'bankWithdraw',{kind:'item',id:'slime-residue',quantity:1});
 // Concurrent/replayed unique-item withdrawals cannot duplicate either side.
 await advance();const before=c.owner.player().ownedGear.filter(id=>id==='ranger-head').length;assert.equal(before,0);
 const same=request('bankWithdraw',{kind:'gear',id:'ranger-head',quantity:1});c.owner.send(same);c.owner.send(same);await until(()=>c.owner.player().ownedGear.includes('ranger-head'),'concurrent withdrawal');await advance();c.owner.send(same);await delay(160);
 assert.equal(c.owner.player().ownedGear.filter(id=>id==='ranger-head').length,1);assert(!stored('owner').bank.gear.includes('ranger-head'));assert.equal(c.owner.player().gold,5000,'bank transfers never charge or store gold');
 const finalAssets=assets(c.owner.player()),finalBank=structuredClone(stored('owner').bank);await stop();await start();const restored=await connect('owner');assert.deepEqual(assets(restored.player()),finalAssets);restored.send(request('bankOpen'));await until(()=>restored.bank,'bank restored');assert.deepEqual(restored.bank.bank,finalBank);
 await transfer(restored,'bankWithdraw',{kind:'gear',id:'ranger-bow',quantity:1});await transfer(restored,'bankWithdraw',{kind:'bag',id:spare.id,quantity:1});assert(restored.player().ownedBags.some(b=>b.id===spare.id));assert(bankPlayerValid(stored('owner')));
 await stop();
 const malformed=[];
 for(const bank of [null,{...newBank(),resources:{gold:1}},{...newBank(),gear:['ranger-bow']},{...newBank(),gear:['unknown-gear']}])malformed.push({...hero('Invalid bank fixture'),bank});
 writeFileSync(file,JSON.stringify({[key(tokens.owner)]:{characters:[{...hero('Old class gear'),bank:{...newBank(),gear:['knight-sword']}}]}}));
 await start();await stop();assert.deepEqual(stored('owner').bank.gear,['knight-sword'],'off-class gear remains valid in bank after a class change');
 const lowBank={...hero('Invalid high bag'),level:1,hp:100,maxHp:100,bank:{...newBank(),bags:[{id:randomUUID(),kind:'trail-satchel'}]}};malformed.push(lowBank);
 for(const invalid of malformed){const bytes=JSON.stringify({[key(tokens.owner)]:{characters:[invalid]}});writeFileSync(file,bytes);
  assert.throws(()=>createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''}),/Invalid player save/,'malformed or conflicting bank saves fail closed');
  assert.equal(readFileSync(file,'utf8'),bytes,'invalid bank saves are never rewritten');
 }
 console.log('PASS bank server: private banker interaction, all item categories, partial stacks, starter gear, bank/bag capacity, equipped/range/LOS/dead/forgery guards, banked gear duplicate prevention, concurrent/replayed withdrawals, failed-save rollback and restart.');
}finally{rmSync(file+'.tmp',{recursive:true,force:true});await stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
