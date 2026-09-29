import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Wallet, ZeroHash, id, verifyTypedData } from 'ethers';
import { createGameServer } from '../server.mjs';
import { createAuctionChain, auctionInterface as abi, AUCTION_ORDER_TYPES } from '../src/auction-chain.mjs';
import { CHAPTERS } from '../src/content.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { bagUsage, newBags } from '../src/bags.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { auctionItemValid, auctionItemLabel } from '../src/auction.ts';
import { newContracts } from '../src/adventure.ts';
import { canTraverse, regionAt } from '../src/realm.ts';
import { AUCTIONEER } from '../src/city.ts';

// Actual server/WebSockets, disk writes and wallet signatures; only chain finality is simulated.
const dir=mkdtempSync(join(tmpdir(),'mossvale-auction-items-')),file=join(dir,'players.json'),clients=[];
const realNow=Date.now;let offset=0,game,port;Date.now=()=>realNow()+offset;
const authority=Wallet.createRandom(),wallets=Array.from({length:4},()=>Wallet.createRandom()),contract=Wallet.createRandom().address,payments=new Map();
const artifact=JSON.parse(readFileSync(new URL('../public/contracts/MossvaleAuction.json',import.meta.url),'utf8'));
const chain=createAuctionChain({contract,authorityKey:authority.privateKey,chainId:4663,rpc:async(method,params)=>{
 if(method==='eth_chainId')return '0x1237';
 if(method==='eth_getCode')return artifact.deployedBytecode;
 if(method==='eth_getBlockByNumber'){const time=['latest','finalized'].includes(params[0])?Math.floor(Date.now()/1000):Number(BigInt(params[0]));return {hash:id(`block-${time}`),number:`0x${time.toString(16)}`,timestamp:`0x${time.toString(16)}`};}
 if(method==='eth_call'){const call=abi.parseTransaction({data:params[0].data});return call.name==='authority'?abi.encodeFunctionResult('authority',[authority.address]):abi.encodeFunctionResult('paidOrders',[payments.get(call.args[0])||ZeroHash]);}
 throw Error(`Unexpected RPC ${method}`);
}});
const near=Array.from({length:32},(_,i)=>({x:AUCTIONEER.x+Math.cos(i*Math.PI/16)*1.2,z:AUCTIONEER.z+Math.sin(i*Math.PI/16)*1.2})).find(p=>canTraverse(p,AUCTIONEER));assert(near);
function hero(name){const level=75,maxHp=100+(level-1)*12;return {id:randomUUID(),name,...near,zone:regionAt(near.x,near.z),coordinateVersion:2,rotation:0,
 appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},
 characterCreated:true,talents:[],...starterGear('Ranger'),...newBags(),hp:maxHp,maxHp,level,xp:0,gold:1000,
 inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,contracts:newContracts(),
 quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null}};}
const heroes=['Item Seller','Item Buyer','Item Rival','Overflow Buyer'].map(hero),tokens=heroes.map(()=>randomBytes(32).toString('base64url'));
heroes[0].carriedItems={'slime-residue':10,'greater-tonic':4,'trail-bread':6,'prismatic-pearl':1};heroes[0].ownedGear.push('ranger-head');heroes[0].equipment.head='ranger-head';
heroes[1].carriedItems={'slime-residue':1};heroes[1].ownedGear.push('ranger-head');heroes[3].carriedItems={'slime-residue':Number.MAX_SAFE_INTEGER};
for(const player of heroes.slice(0,2))for(const item of Object.values(GEAR))if(bagUsage(player)<16&&(!item.className||item.className==='Ranger')&&!player.ownedGear.includes(item.id))player.ownedGear.push(item.id);
assert.equal(bagUsage(heroes[0]),16);assert.equal(bagUsage(heroes[1]),16);
const hash=token=>createHash('sha256').update(token).digest('hex'),stored=i=>JSON.parse(readFileSync(file,'utf8'))[hash(tokens[i])].characters[0];
const assets=p=>structuredClone({gold:p.gold,carriedItems:p.carriedItems,inventory:p.inventory,ownedGear:p.ownedGear,equipment:p.equipment});
async function until(fn,label,timeout=10000){const end=realNow()+timeout;while(realNow()<end){const result=fn();if(result)return result;await delay(15);}throw Error(`Timed out: ${label}`);}
async function tick(ms=800){offset+=ms;await delay(110);}
async function start(){game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'',auctionChain:chain});port=await game.start();}
const request=(type,extra={})=>({type,npcId:AUCTIONEER.id,...extra});
async function connect(index){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,index,messages:[]};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===heroes[index].id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['snapshot','auction'].includes(m.type))c[m.type]=m;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token:tokens[index],characterId:heroes[index].id});
 await until(()=>c.player(),'character connected');c.send(request('auctionOpen'));await until(()=>c.auction,'auction browse');return c;
}
async function reject(c,message,label){await tick();const before=assets(c.player()),index=c.messages.length;c.send(message);await until(()=>c.messages.slice(index).some(m=>m.type==='event'&&m.kind==='info'),label).catch(error=>{throw Error(`${error.message}; ${JSON.stringify(c.messages.slice(index).filter(m=>m.type!=='snapshot').slice(-5))}; socket ${c.socket.readyState}`);});await delay(120);assert.deepEqual(assets(c.player()),before,`${label}: no asset changes`);}
async function list(c,itemId,quantity=1,currency='gold',price='25'){
 const ids=new Set(c.auction.mine.map(l=>l.id));c.send(request('auctionList',{item:{kind:'item',id:itemId,quantity},currency,price}));
 return until(()=>c.auction.mine.find(l=>!ids.has(l.id)),'durable item listing');
}
async function buy(c,listing){c.send(request('auctionBuy',{listingId:listing.id}));await until(()=>!c.auction.listings.some(l=>l.id===listing.id),'item purchased');}
async function cancel(c,listing){c.send(request('auctionCancel',{listingId:listing.id}));await until(()=>!c.auction.mine.some(l=>l.id===listing.id),'item escrow returned');}
async function freeSlot(c){
 const item=c.player().ownedGear.map(id=>GEAR[id]).find(item=>!['weapon','armor','ring'].includes(item.slot)&&c.player().equipment[item.slot]===null);assert(item,'an owned item can be equipped to free space');
 const old=bagUsage(c.player());c.send({type:'equipGear',itemId:item.id});await until(()=>bagUsage(c.player())===old-1,'free a bag slot');return item;
}
async function bind(c){await tick();const start=c.messages.length;c.send(request('auctionWalletChallenge',{wallet:wallets[c.index].address}));
 const challenge=await until(()=>c.messages.slice(start).find(m=>m.type==='auctionWalletChallenge'),'wallet proof');
 c.send(request('auctionWalletBind',{signature:await wallets[c.index].signMessage(challenge.message)}));await until(()=>c.auction.wallet===wallets[c.index].address,'wallet binding saved');}
try{
 for(const item of Object.values(LOOT_ITEMS)){assert(auctionItemValid({kind:'item',id:item.id,quantity:1}));assert.equal(auctionItemLabel({kind:'item',id:item.id,quantity:1}),item.label);}
 writeFileSync(file,JSON.stringify(Object.fromEntries(heroes.map((p,i)=>[hash(tokens[i]),{characters:[p]}]))));await start();let [seller,buyer,rival,overflow]=await Promise.all(heroes.map((_,i)=>connect(i)));
 for(const item of [{kind:'item',id:'invented',quantity:1},{kind:'item',id:'__proto__',quantity:1},{kind:'item',id:'wood',quantity:1},{kind:'resource',id:'slime-residue',quantity:1},
  ...[0,-1,.5,11,1000001,Number.MAX_SAFE_INTEGER].map(quantity=>({kind:'item',id:'slime-residue',quantity})),{kind:'item',id:'slime-residue',quantity:1,price:0}]){
  await reject(seller,request('auctionList',{item,currency:'gold',price:'25'}),'invalid item or quantity');
 }
 const first=await list(seller,'slime-residue',4);assert.equal(stored(0).carriedItems['slime-residue'],6);assert.deepEqual(stored(0).auctions[0].item,first.item);
 await reject(seller,request('auctionBuy',{listingId:first.id}),'self purchase');await reject(overflow,request('auctionBuy',{listingId:first.id}),'stack integer overflow');
 seller.socket.terminate();await delay(60);await buy(buyer,first);
 assert.equal(stored(0).gold,1025);assert.equal(buyer.player().carriedItems['slime-residue'],5);assert.equal(bagUsage(buyer.player()),16,'existing stack fits full bags');
 await reject(buyer,request('auctionBuy',{listingId:first.id}),'replayed purchase');seller=await connect(0);
 const race=await list(seller,'slime-residue',2),beforeRace=[buyer,rival].map(c=>assets(c.player()));
 buyer.send(request('auctionBuy',{listingId:race.id}));rival.send(request('auctionBuy',{listingId:race.id}));
 await until(()=>!seller.auction.mine.some(l=>l.id===race.id),'concurrent item buy');
 assert.equal(stored(1).gold+stored(2).gold,beforeRace[0].gold+beforeRace[1].gold-25);
 assert.equal((stored(1).carriedItems['slime-residue']||0)+(stored(2).carriedItems['slime-residue']||0),7,'only one concurrent buyer receives the stack');
 const tonic=await list(seller,'greater-tonic',2);await reject(buyer,request('auctionBuy',{listingId:tonic.id}),'full bag rejects new item type');
 await freeSlot(buyer);await buy(buyer,tonic);assert.equal(buyer.player().carriedItems['greater-tonic'],2);assert.equal(bagUsage(buyer.player()),16);
 const pearl=await list(seller,'prismatic-pearl');assert.equal(stored(0).carriedItems['prismatic-pearl'],undefined,'empty escrowed stacks are removed');
 seller.send({type:'unequipGear',slot:'head'});await until(()=>seller.player().equipment.head===null,'fill cancellation slot');
 await reject(seller,request('auctionCancel',{listingId:pearl.id}),'full cancellation leaves item in escrow');
 seller.send({type:'equipGear',itemId:'ranger-head'});await until(()=>seller.player().equipment.head==='ranger-head','free cancellation slot');await cancel(seller,pearl);
 assert.equal(seller.player().carriedItems['prismatic-pearl'],1);await reject(seller,request('auctionCancel',{listingId:pearl.id}),'replayed cancellation');
 const failure=await list(seller,'trail-bread'),beforeFailure=[assets(seller.player()),assets(rival.player())];await delay(1200);mkdirSync(`${file}.tmp`);
 await reject(rival,request('auctionBuy',{listingId:failure.id}),'failed item delivery save');assert.deepEqual([assets(stored(0)),assets(stored(2))],beforeFailure);assert(stored(0).auctions.some(l=>l.id===failure.id));
 rmSync(`${file}.tmp`,{recursive:true});await buy(rival,failure);assert.equal(rival.player().carriedItems['trail-bread'],1);
 // Real wallet ownership/signing remains required for the newly supported item kind.
 await reject(seller,request('auctionList',{item:{kind:'item',id:'prismatic-pearl',quantity:1},currency:'eth',price:'0.01'}),'ETH item requires verified wallet');
 await bind(seller);await bind(buyer);const eth=await list(seller,'prismatic-pearl',1,'eth','0.01');const free=await freeSlot(buyer),beforeEthGold=[stored(0).gold,stored(1).gold];
 const orderStart=buyer.messages.length;buyer.send(request('auctionBuy',{listingId:eth.id}));
 const {order}=await until(()=>buyer.messages.slice(orderStart).find(m=>m.type==='auctionPayment'),'durable signed item reservation');
 assert.deepEqual(stored(0).auctions.find(l=>l.id===eth.id).reservation.order,order);assert.equal(order.buyer,wallets[1].address);assert.equal(order.seller,wallets[0].address);
 assert.equal(verifyTypedData({name:'MossvaleAuction',version:'1',chainId:4663,verifyingContract:contract},AUCTION_ORDER_TYPES,order,order.signature),authority.address);
 assert(!rival.auction.listings.find(l=>l.id===eth.id).reservation.order,'private payment order is not broadcast');
 await reject(rival,request('auctionBuy',{listingId:eth.id}),'another buyer cannot take reserved item');await reject(seller,request('auctionCancel',{listingId:eth.id}),'seller cannot cancel signed item reservation');
 buyer.send({type:'unequipGear',slot:free.slot});await until(()=>bagUsage(buyer.player())===16,'fill bag during wallet payment');payments.set(order.listingId,order.orderHash);await tick(6000);
 await until(()=>buyer.auction.reason?.includes('Payment confirmed. Make room'),'paid loot item remains escrowed if bags filled');assert(!stored(1).carriedItems['prismatic-pearl']);
 await game.stop();await start();[seller,buyer,rival,overflow]=await Promise.all(heroes.map((_,i)=>connect(i)));
 assert.equal(stored(0).auctions.find(l=>l.id===eth.id).reservation.order.orderHash,order.orderHash,'restart preserves the paid item reservation');
 buyer.send({type:'equipGear',itemId:free.id});await until(()=>buyer.player().equipment[free.slot]===free.id,'make room for paid item');buyer.send(request('auctionPaymentCheck',{listingId:eth.id}));
 await until(()=>stored(1).carriedItems['prismatic-pearl']===1&&!stored(0).auctions.some(l=>l.id===eth.id),'paid item delivered after freeing space');
 assert.deepEqual([stored(0).gold,stored(1).gold],beforeEthGold,'ETH delivery never transfers in-game gold');
 const beforeReplay=assets(buyer.player()),previousMarket=buyer.auction;buyer.send(request('auctionPaymentCheck',{listingId:eth.id}));
 await until(()=>buyer.auction!==previousMarket,'replayed paid item status returns current market');assert.deepEqual(assets(buyer.player()),beforeReplay,'replayed paid delivery never duplicates its item');
 const durable=heroes.map((_,i)=>assets(stored(i)));await game.stop();await start();const again=await Promise.all(heroes.map((_,i)=>connect(i)));
 assert.deepEqual(again.map(c=>assets(c.player())),durable,'restart preserves every item/balance exactly once');assert.equal(stored(1).carriedItems['prismatic-pearl'],1);
 console.log('PASS: catalog item auctions over real WS, strict quantities/allowlist, escrow, offline seller, concurrent buy, full/new/existing stacks, overflow, cancellation, disk rollback/retry, signed ETH reservation and paid capacity recovery, replay and restart. Chain finality was simulated; no ETH sent.');
}finally{rmSync(`${file}.tmp`,{recursive:true,force:true});for(const c of clients)c.socket.terminate();if(game)await game.stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
