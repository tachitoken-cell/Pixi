import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Wallet, ZeroHash, id } from 'ethers';
import { createGameServer } from '../server.mjs';
import { createAuctionChain, tokenAuctionInterface, erc20Interface } from '../src/auction-chain.mjs';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM } from '../src/auction.ts';
import { CHAPTERS } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { defaultHotbar } from '../src/spells.ts';
import { newContracts } from '../src/adventure.ts';
import { canTraverse, regionAt, toWorld } from '../src/realm.ts';
import { AUCTIONEER } from '../src/city.ts';
import { waterAt } from '../src/landscape.ts';
import { buildingAt } from '../src/buildings.ts';
import { migrateReferral } from '../src/referral-store.mjs';

const realNow=Date.now;let offset=0,game,port,priceWei='1000000000000000000',expirePrice=false;Date.now=()=>realNow()+offset;
const dir=mkdtempSync(join(tmpdir(),'mossvale-referral-server-')),file=join(dir,'players.json'),clients=[];
const tokens=Array.from({length:4},()=>randomBytes(32).toString('base64url')),hash=value=>createHash('sha256').update(value).digest('hex');
const wallets=Array.from({length:4},()=>Wallet.createRandom()),authority=Wallet.createRandom(),contract=Wallet.createRandom().address,treasury=Wallet.createRandom().address;
const legacyReferral=process.argv.includes('--legacy-referral');
const runtime=JSON.parse(readFileSync(new URL(`../public/contracts/${legacyReferral?'MossvaleTokenAuctionReferralLegacy':'MossvaleTokenAuction'}.json`,import.meta.url),'utf8')).deployedBytecode;
const payments=new Map(),block={hash:id('referral-finalized'),number:'0x10000'};
const chain=createAuctionChain({currency:'moss',contract,treasury,authorityKey:authority.privateKey,chainId:4663,rpc:async(method,params)=>{
  if(method==='eth_chainId')return '0x1237';
  if(method==='eth_getCode')return params[0].toLowerCase()===MOSS_TOKEN.address.toLowerCase()?readFileSync(new URL('./fixtures/moss-token-runtime.hex',import.meta.url),'utf8').trim():runtime;
  if(method==='eth_getBlockByNumber')return {...block,timestamp:`0x${Math.floor(Date.now()/1000).toString(16)}`};
  if(method==='eth_call'&&params[0].to.toLowerCase()===MOSS_TOKEN.address.toLowerCase()){const call=erc20Interface.parseTransaction({data:params[0].data});return erc20Interface.encodeFunctionResult(call.name,[({name:'Mossvale',symbol:'MOSS',decimals:18,balanceOf:10n**30n})[call.name]]);}
  if(method==='eth_call'){const call=tokenAuctionInterface.parseTransaction({data:params[0].data}),identity={paymentToken:MOSS_TOKEN.address,authority:authority.address,treasury,TAX_BPS:500,devTeam:MOSS_AUCTION_DEV_TEAM};return tokenAuctionInterface.encodeFunctionResult(call.name,[call.name in identity?identity[call.name]:payments.get(call.args[0])||ZeroHash]);}
  throw Error(`Unexpected RPC ${method}`);
}});
const near=Array.from({length:32},(_,i)=>({x:AUCTIONEER.x+Math.cos(i*Math.PI/16)*1.5,z:AUCTIONEER.z+Math.sin(i*Math.PI/16)*1.5})).find(p=>canTraverse(p,AUCTIONEER));assert(near);
const outdoors=toWorld('greenwood',{x:0,z:8});assert(canTraverse(outdoors,outdoors)&&!waterAt(outdoors.x,outdoors.z)&&!buildingAt(outdoors.x,outdoors.z));
const heroes=Array.from({length:4},(_,i)=>{const level=30,maxHp=100+(level-1)*12,position=i===0||i===3?outdoors:near;return {id:randomUUID(),name:['Referral Guide','Referral Guest','Referral Seller','Referral Newcomer'][i],...position,zone:regionAt(position.x,position.z),coordinateVersion:2,rotation:0,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},characterCreated:true,talents:[],...starterGear('Ranger'),hotbar:defaultHotbar('Ranger'),hp:maxHp,maxHp,level,xp:0,gold:1000,ridingRank:1,ownedMounts:[],auctionWallet:wallets[i].address,
  inventory:{wood:30,crystal:20,herb:15,potion:3,relic:5},skills:{mining:0,woodcutting:0,herbalism:0},craftingXp:0,contracts:newContracts(),quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null}};});
const accounts=Object.fromEntries(heroes.map((hero,i)=>[hash(tokens[i]),migrateReferral({characters:[hero]},hash(tokens[i]))]));
accounts[hash(tokens[0])].referral.qualifiedCount=25;
accounts[hash(tokens[1])].referral.canBind=true;
accounts[hash(tokens[3])].referral.canBind=true;
const code=accounts[hash(tokens[0])].referral.code;
const stored=i=>JSON.parse(readFileSync(file,'utf8'))[hash(tokens[i])];
async function until(fn,label){const end=realNow()+15000;while(realNow()<end){const value=fn();if(value)return value;await delay(20);}throw Error(`Timed out: ${label}`);}
async function advance(ms=700){offset+=ms;await delay(120);}
async function connect(i,referralCode){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),client={socket,i,messages:[]};clients.push(client);client.send=message=>socket.send(JSON.stringify(message));client.player=()=>client.snapshot?.players.find(p=>p.id===heroes[i].id);socket.on('message',raw=>{const m=JSON.parse(raw);client.messages.push(m);client[m.type]=m;});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});client.send({type:'join',token:tokens[i],characterId:heroes[i].id,...(referralCode?{referralCode}:{})});await until(()=>client.player(),'joined');return client;}
async function response(client,message,type){await advance();const count=client.messages.length;client.send(message);return until(()=>client.messages.slice(count).find(m=>m.type===type),`${message.type} response`);}
async function move(client,distance=.15){await advance();const p=client.player(),target=Array.from({length:16},(_,i)=>({x:p.x+Math.cos(i*Math.PI/8)*distance,z:p.z+Math.sin(i*Math.PI/8)*distance})).find(q=>canTraverse(p,q)&&!waterAt(q.x,q.z));assert(target);client.send({type:'move',...target,rotation:0});await until(()=>Math.hypot(client.player().x-target.x,client.player().z-target.z)<.01,'accepted movement');return target;}
try{
 const legacyAccounts=structuredClone(accounts);for(const account of Object.values(legacyAccounts))delete account.referral;
 const activationKeys=['REFERRALS_ENABLED','MOSS_AUCTION_CONTRACT','MOSS_AUCTION_CHAIN_ID'],activationEnv=activationKeys.map(key=>process.env[key]);
 const productionContract='0xb13ab13df2d0ab0f740cf11d882680501150c652';
 try {
  for (const [label,gate,route,chainId,option,enabled] of [
   ['missing route',undefined,undefined,undefined,undefined,false],
   ['foreign route',undefined,contract,'4663',undefined,false],
   ['production route',undefined,productionContract,'4663',undefined,true],
   ['legacy production route/default chain',undefined,'0xd5508EfEa45f8e0A4594B8A763504bDF31BBf82F',undefined,undefined,true],
   ['prepared five-tier production route',undefined,'0x930f178ca4818a2ae2e97b96f3574f22e509a520','4663',undefined,true],
   ['wrong chain',undefined,productionContract,'46630',undefined,false],
   ['explicit off','0',productionContract,'4663',undefined,false],
   ['manual opt-in','1',contract,'4663',undefined,true],
   ['empty override is not absent','',productionContract,'4663',undefined,false],
   ['injected off','1',productionContract,'4663',false,false],
   ['injected on','0',contract,'46630',true,true],
  ]) {
   for (const [i,value] of [gate,route,chainId].entries()) { if(value===undefined)delete process.env[activationKeys[i]];else process.env[activationKeys[i]]=value; }
   writeFileSync(file,JSON.stringify(legacyAccounts));
   game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'',mossAuctionChain:chain,...(option===undefined?{}:{referralsEnabled:option})});
   port=await game.start();
   const health=await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();assert.deepEqual(health.referrals,{programEnabled:enabled},`${label}: health exposes only the program gate`);
   const gated=await connect(0),gatedState=await response(gated,{type:'referralOpen'},'referrals');
   assert.equal(gatedState.programEnabled,enabled,label);assert.equal(gatedState.referralsEnabled,enabled,label);
   if(!enabled)assert.match((await response(gated,{type:'referralBind',code},'referrals')).error,/not available/);
   await move(gated);await response(gated,{type:'referralOpen'},'referrals');
   assert.equal(Object.hasOwn(stored(0),'referral'),enabled,`${label}: only an enabled program introduces referral schema`);
   gated.socket.close();await game.stop();
  }
 } finally { for(const [i,key] of activationKeys.entries()) { if(activationEnv[i]===undefined)delete process.env[key];else process.env[key]=activationEnv[i]; } }
 writeFileSync(file,JSON.stringify(accounts));game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'',economyVersion:1,referralsEnabled:true,mossAuctionChain:chain,referralPrice:async({now,purpose})=>{assert.equal(purpose,'holdings','Fixed MOSS listing spend uses conservative USD valuation.');if(expirePrice){await delay(20);offset+=91000;}return {usdWei:priceWei,observedAt:now};}});port=await game.start();
 const driver=await connect(0),buyer=await connect(1,`https://mossvale.world/?ref=${code.toUpperCase()}`),seller=await connect(2),newcomer=await connect(3);
 assert(buyer.referrals.referredBy);assert(!buyer.referrals.canBind);assert(driver.player().ownedMounts.includes('wayfarer-stag'));
 const forbidden=await response(seller,{type:'referralBind',code},'referrals');assert.match(forbidden.error,/before you start/);
 const self=await response(newcomer,{type:'referralBind',code:stored(3).referral.code},'referrals');assert.match(self.error,/own account/);
 await move(buyer);let state=await response(buyer,{type:'referralOpen'},'referrals');assert.equal(state.progress.daysPlayed,1);assert.equal(state.feeVersion,legacyReferral?1:2);assert.equal(state.referralsEnabled,true);
 offset+=86400000;await response(buyer,{type:'ping',id:1},'pong');state=await response(buyer,{type:'referralOpen'},'referrals');assert.equal(state.progress.daysPlayed,1,'Idle midnight and ping do not add gameplay days.');
 await move(buyer);state=await response(buyer,{type:'referralOpen'},'referrals');assert.equal(state.progress.daysPlayed,2);assert.equal(state.progress.qualified,false);
 const auction=extra=>({npcId:AUCTIONEER.id,...extra});await response(seller,auction({type:'auctionOpen'}),'auction');await response(buyer,auction({type:'auctionOpen'}),'auction');
 const listed=await response(seller,auction({type:'auctionList',item:{kind:'resource',id:'wood',quantity:1},currency:'moss',price:'10'}),'auction');const listing=listed.mine[0];assert(listing);
 const quote=await response(buyer,auction({type:'auctionBuy',listingId:listing.id}),'auctionPayment');assert.equal(quote.order.referralUsdCents,1000);assert.equal(quote.order.referralBps,0);assert.equal(stored(1).referral.spentUsdCents,0);
 priceWei='1000000000000000';payments.set(quote.order.listingId,quote.order.orderHash);await response(buyer,auction({type:'auctionPaymentCheck',listingId:listing.id}),'auction');await until(()=>stored(1).referral.qualified,'finalized qualifying spend');assert.equal(stored(1).referral.spentUsdCents,1000,'Reservation USD value survives later market changes.');assert.equal(stored(0).referral.qualifiedCount,26);
 const second=await response(seller,auction({type:'auctionList',item:{kind:'resource',id:'wood',quantity:1},currency:'moss',price:'10'}),'auction');const listing2=second.mine[0];
 const quote2=await response(buyer,auction({type:'auctionBuy',listingId:listing2.id}),'auctionPayment');assert.equal(quote2.order.referralBps,legacyReferral?500:50);assert.equal(quote2.order.referrer.toLowerCase(),wallets[0].address.toLowerCase());
 const staleListing=(await response(seller,auction({type:'auctionList',item:{kind:'resource',id:'wood',quantity:1},currency:'moss',price:'10'}),'auction')).mine[0];
 expirePrice=true;await response(buyer,auction({type:'auctionBuy',listingId:staleListing.id}),'event');expirePrice=false;
 assert(!stored(2).characters[0].auctions.find(row=>row.id===staleListing.id).reservation,'Pricing that expires during its await never reserves or signs a spendable purchase.');
 // Passenger protocol exercises the actual server, not only its helper.
 await response(driver,{type:'mount',mount:'wayfarer-stag'},'snapshot');await until(()=>driver.player().travel.mount==='wayfarer-stag','mount cast');
 const forged=await response(newcomer,{type:'mountAccept',playerId:heroes[0].id},'event');assert.match(forged.text,/expired/);assert(!newcomer.player().travel.driverId);
 await advance();driver.send({type:'mountInvite',playerId:heroes[3].id});await until(()=>newcomer.mountInvitation?.invitation,'ride invitation');await response(newcomer,{type:'mountAccept',playerId:heroes[0].id},'snapshot');await until(()=>newcomer.player().travel.driverId===heroes[0].id,'accepted passenger');
 const before={x:newcomer.player().x,z:newcomer.player().z};const rejected=await response(newcomer,{type:'move',x:before.x+1,z:before.z,rotation:0},'correction');assert.match(rejected.reason||rejected.text||JSON.stringify(rejected),/driver controls/);assert(Math.hypot(newcomer.player().x-before.x,newcomer.player().z-before.z)<.01);
 const target=await move(driver);await until(()=>Math.hypot(newcomer.player().x-target.x,newcomer.player().z-target.z)<.01,'passenger follows authoritative movement');
 await response(driver,{type:'mount',mount:null},'snapshot');await until(()=>!newcomer.player().travel.driverId&&!newcomer.player().travel.mount,'driver dismount detaches passenger');
 await response(driver,{type:'mount',mount:'wayfarer-stag'},'snapshot');await until(()=>driver.player().travel.mount==='wayfarer-stag','remount');await advance();driver.send({type:'mountInvite',playerId:heroes[3].id});await until(()=>newcomer.mountInvitation?.invitation,'second invite');await response(newcomer,{type:'mountAccept',playerId:heroes[0].id},'snapshot');await until(()=>newcomer.player().travel.driverId,'second ride');driver.socket.close();await until(()=>!newcomer.player().travel.driverId&&!newcomer.player().travel.mount,'disconnect detaches passenger');
 console.log('Referral WebSockets passed: production activation/overrides/health/schema gates, automatic/manual attribution guards, UTC activity versus idle, frozen USD finalized spend, qualified referral fee quote, passenger consent/forgery/movement/dismount/disconnect. Chain finality simulated; no funds sent.');
}finally{for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
