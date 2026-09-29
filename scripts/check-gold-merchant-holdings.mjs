import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Wallet, ZeroAddress, id, parseUnits, toQuantity } from 'ethers';
import { WebSocket } from 'ws';
import { readMossHoldings } from '../src/store-chain.mjs';
import { readPonsMossPrice } from '../src/pons-price.mjs';
import { erc20Interface } from '../src/auction-chain.mjs';
import { MOSS_TOKEN } from '../src/auction.ts';
import { GOLD_MERCHANT, GOLD_MERCHANT_REQUIREMENTS } from '../src/gold-merchant.ts';
import { createGameServer } from '../server.mjs';
import { canTraverse } from '../src/realm.ts';
import { starterGear } from '../src/progression.ts';

const wallets=[Wallet.createRandom(),Wallet.createRandom()],runtime=readFileSync(new URL('./fixtures/moss-token-runtime.hex',import.meta.url),'utf8').trim();
const now=1800000000000,block=(n,seconds)=>({number:toQuantity(n),timestamp:toQuantity(seconds),hash:id(`block-${n}`)});
const finalized=block(10000,now/1000-60),latest=block(10600,now/1000),priceWei=parseUnits('0.0003',18),threshold=(25n*10n**36n+priceWei-1n)/priceWei;
let finalBalance=threshold,latestBalance=threshold,code=runtime,chain='0x1237',head=latest,changed=false,priceAt=now,quotedPriceWei=priceWei;
const rpc=async(method,params)=>{
  if(method==='eth_chainId')return chain;
  if(method==='eth_getBlockByNumber')return params[0]==='finalized'?finalized:params[0]==='latest'?head:changed?{...latest,hash:id('reorg')}:params[0]===finalized.number?finalized:head;
  assert(['eth_getCode','eth_call'].includes(method),'qualification never broadcasts, signs, approves, or transfers');
  assert.equal(params[0]?.to??params[0],MOSS_TOKEN.address);assert.equal(params.at(-1).requireCanonical,true);
  if(method==='eth_getCode')return code;
  const call=erc20Interface.parseTransaction(params[0]);assert.equal(call.name,'balanceOf');assert.equal(call.args[0],wallets[0].address);
  return erc20Interface.encodeFunctionResult('balanceOf',[params[1].blockHash===finalized.hash?finalBalance:latestBalance]);
};
// Sanitized props and nested Flight record from the public Pons MOSS launchpad page.
const ponsUrl=`https://www.ponsfamily.com/launchpad/${MOSS_TOKEN.address}`,rblx='0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8';
const ponsProps={token:MOSS_TOKEN.address,initialDetails:{version:'v2',stack:'launchpad',factory:'0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
  token:MOSS_TOKEN.address,curve:'0xD29ad356Fa22e0FC8baa00f683fB68c2545ad7a5',symbol:'MOSS',decimals:18,
  quoteAsset:{address:rblx,symbol:'RBLX',decimals:18,isNative:false,assetClass:'equity'},phase:2,venue:'pool',
  poolKey:{currency0:MOSS_TOKEN.address,currency1:rblx,fee:0,tickSpacing:200,hooks:'0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044'},
  poolId:'0xc08c208a8bf53008da38fad200c3d8033f234418a6e895720a17a73090935c83',tokenIsCurrency0:true},
  initialPriceQuote:9.326655872545116e-6,quoteUsd:47.82};
const ponsPage=(props=ponsProps)=>`<script>self.__next_f.push(${JSON.stringify([1,`10:${JSON.stringify(['$','main',null,{className:'bridge-main token-buy-main',children:['$','div',null,{className:'bridge-shell token-buy-shell',children:[['$','$L1c',null,{token:MOSS_TOKEN.address}],['$','$L1d',null,props]]}]}])}\n`])})</script>`;
let page=ponsPage(),responseStatus=200,headers;
const freshHeaders=()=>({'content-type':'text/html; charset=utf-8',date:new Date(now).toUTCString(),age:'0'});
headers=freshHeaders();
const fetchPage=async(url,options)=>{
  assert.equal(url,ponsUrl,'only the pinned Pons MOSS page is fetched');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  return new Response(page,{status:responseStatus,headers});
};
const ponsPrice=()=>readPonsMossPrice({now,fetchPage});
const ponsQuote=await ponsPrice();
assert.equal(ponsQuote.usdWei,'446000683825101','Pons quote factors round down to 18 decimals before multiplication');assert.equal(ponsQuote.observedAt,now);
assert.equal(ponsQuote.source,'Pons MOSS/USD displayed estimate');assert.equal(ponsQuote.sourceUrl,ponsUrl);
const originalFetch=globalThis.fetch;
try{
  globalThis.fetch=fetchPage;finalBalance=latestBalance=parseUnits('58540',18);
  assert.equal((await readMossHoldings(wallets[0].address,{rpc,now})).valueUsdCents,'2610','58,540 confirmed MOSS uses the Pons value for merchant eligibility');
  page=ponsPage({...ponsProps,quoteUsd:95.64});
  assert.equal((await readMossHoldings(wallets[0].address,{rpc,now})).valueUsdCents,'5221','a new Pons quote updates unchanged holdings');
  responseStatus=503;
  assert.deepEqual(await readMossHoldings(wallets[0].address,{rpc,now}),{balanceWei:finalBalance.toString(),checkedAt:now},'Pons failure preserves confirmed balance without falling back to another USD source');
}finally{globalThis.fetch=originalFetch;finalBalance=latestBalance=threshold;page=ponsPage();responseStatus=200;}
for(const change of [p=>{p.token=ZeroAddress;},p=>{p.initialDetails.token=ZeroAddress;},p=>{p.initialDetails.poolId=id('other pool');},
  p=>{p.initialDetails.quoteAsset.address=ZeroAddress;},p=>{p.initialDetails.decimals=6;},p=>{p.initialDetails.quoteAsset.decimals=6;},
  p=>{p.initialDetails.phase=1;},p=>{p.initialPriceQuote=0;},p=>{p.quoteUsd=-1;}]){
  const props=structuredClone(ponsProps);change(props);page=ponsPage(props);await assert.rejects(ponsPrice);
}
for(const body of ['<html>No price</html>',ponsPage()+ponsPage(),ponsPage({...ponsProps,quoteUsd:null}),ponsPage().replace('47.82','1e309')]){page=body;await assert.rejects(ponsPrice);}
page='<script>self.__next_f.push([1,(()=>{globalThis.__ponsPricePageExecuted=true;return ""})()])</script>';
await assert.rejects(ponsPrice);assert.equal(globalThis.__ponsPricePageExecuted,undefined,'page scripts are never evaluated');page=ponsPage();
for(const changedHeaders of [{date:''},{date:'invalid'},{date:new Date(now-91000).toUTCString()},{date:new Date(now+16000).toUTCString()},{age:'91'},{age:'invalid'},{'content-type':'application/json'}]){
  headers={...freshHeaders(),...changedHeaders};await assert.rejects(ponsPrice);
}
headers=freshHeaders();responseStatus=503;await assert.rejects(ponsPrice);responseStatus=200;
await assert.rejects(readPonsMossPrice({now,fetchPage:async()=>{throw Error('network unavailable');}}));
const check=()=>readMossHoldings(wallets[0].address,{rpc,now,price:async({purpose})=>{assert.equal(purpose,'holdings');return {usdWei:quotedPriceWei.toString(),observedAt:priceAt};}});
assert.deepEqual(GOLD_MERCHANT_REQUIREMENTS,{level:30,usdCents:2500});
assert.equal((await check()).valueUsdCents,'2500','smallest qualifying token amount meets exactly $25');
quotedPriceWei=priceWei*2n;assert.equal((await check()).valueUsdCents,'5000','a fresh price changes USD value even when the token balance and finalized block are unchanged');quotedPriceWei=priceWei;
latestBalance--;assert.equal((await check()).valueUsdCents,'2499','one wei below threshold never rounds up');
latestBalance=threshold*2n;assert.equal((await check()).balanceWei,threshold.toString(),'unfinalized incoming tokens cannot increase qualified holdings');
finalBalance=threshold*2n;latestBalance=threshold/2n;assert(BigInt((await check()).valueUsdCents)<2500n,'tokens transferred out at the current head no longer qualify');
latestBalance=finalBalance=0n;assert.equal((await check()).valueUsdCents,'0','zero balance is a valid result');
for(const invalid of ['not-a-wallet',ZeroAddress])await assert.rejects(readMossHoldings(invalid,{rpc,now}));
chain='0x1';await assert.rejects(check(),/wrong chain/);chain='0x1237';
code='0x00';await assert.rejects(check(),/reviewed deployment/);code=runtime;
head=block(10600,now/1000-121);await assert.rejects(check(),/stale or inconsistent/);head=latest;
changed=true;await assert.rejects(check(),/changed during verification/);changed=false;
finalBalance=latestBalance=threshold;
for(const at of [now-90001,now+15001]){priceAt=at;assert.deepEqual(await check(),{balanceWei:threshold.toString(),checkedAt:now},'stale pricing preserves the verified balance without dollar qualification');}priceAt=now;
const withoutPrice=()=>readMossHoldings(wallets[0].address,{rpc,now,price:async()=>{throw Error('private pricing details');}});
assert.deepEqual(await withoutPrice(),{balanceWei:threshold.toString(),checkedAt:now},'pricing outage cannot hide actual MOSS holdings');
changed=true;await assert.rejects(withoutPrice(),/changed during verification/);changed=false;
code='0x00';await assert.rejects(withoutPrice(),/reviewed deployment/);code=runtime;
await assert.rejects(readMossHoldings(wallets[0].address,{now,rpc:async()=>{throw Error('unavailable');}}),/unavailable/);

const dir=mkdtempSync(join(tmpdir(),'mossvale-merchant-holdings-')),file=join(dir,'players.json'),clients=[],reads=[];
const realNow=Date.now;let clock=realNow(),game,port,unavailable=false,unpriced=false,invalidValue=false,stale=false,hold=false,holdingsValue='2500';Date.now=()=>clock;
const front={x:GOLD_MERCHANT.x+Math.sin(GOLD_MERCHANT.rotation)*1.2,z:GOLD_MERCHANT.z+Math.cos(GOLD_MERCHANT.rotation)*1.2};
const blocked=Array.from({length:360},(_,i)=>({x:GOLD_MERCHANT.x+Math.sin(i*Math.PI/180)*2.99,z:GOLD_MERCHANT.z+Math.cos(i*Math.PI/180)*2.99})).find(point=>canTraverse(point,point)&&!canTraverse(point,GOLD_MERCHANT));assert(blocked);
const hero=(name,level,point=front,auctionWallet)=>({id:randomUUID(),name,coordinateVersion:2,zone:'greenwood',...point,rotation:0,characterCreated:true,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},...starterGear('Ranger'),
  onboarding:{version:1,looted:true,bagViewed:true,gearViewed:true,completed:true},talents:[],level,xp:0,gold:500,hp:100,maxHp:100+(level-1)*12,
  ...(auctionWallet?{auctionWallet}:{}),inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},quest:{stage:0,kills:0,crystals:0}});
const heroes=[hero('Merchant patron',30),hero('Young patron',29,front,wallets[1].address),hero('Far patron',30,{x:0,z:8},wallets[0].address),hero('Blocked patron',30,blocked,wallets[0].address),hero('Nearby observer',30)];
const tokens=heroes.map(()=>randomBytes(32).toString('base64url')),key=token=>createHash('sha256').update(token).digest('hex');
async function until(fn,label){const end=realNow()+6000;while(realNow()<end){const value=fn();if(value)return value;await delay(15);}throw Error(`Timed out: ${label}`);}
async function tick(ms=1100){clock+=ms;await delay(100);}
const stored=index=>JSON.parse(readFileSync(file,'utf8'))[key(tokens[index])].characters[0];
async function request(c,message={type:'goldMerchantCheck'},type='goldMerchantState'){await tick();const start=c.messages.length;c.send(message);return until(()=>c.messages.slice(start).find(m=>m.type===type),message.type);}
async function bind(c,wallet){const challenge=await request(c,{type:'storeWalletChallenge',wallet:wallet.address},'storeWalletChallenge');return request(c,{type:'storeWalletBind',signature:await wallet.signMessage(challenge.message)},'storeState');}
const goldMerchantHoldings=async wallet=>{reads.push(wallet);const checkedAt=Date.now();if(hold)await new Promise(resolve=>{hold=resolve;});if(unavailable)throw Error('private RPC details');return {balanceWei:'100000000000000000000',...(unpriced?{}:{valueUsdCents:invalidValue?'invalid':holdingsValue}),checkedAt:stale?checkedAt-15000:checkedAt};};
try{
  writeFileSync(file,JSON.stringify(Object.fromEntries(heroes.map((p,i)=>[key(tokens[i]),{characters:[p]}]))));
  game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'',goldMerchantHoldings});port=await game.start();
  for(let i=0;i<heroes.length;i++){
    const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===heroes[i].id);
    socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(m.type==='snapshot')c.snapshot=m;});
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token:tokens[i],characterId:heroes[i].id});await until(()=>c.player(),'join holdings fixture');
  }
  const [patron,young,far,obstructed,observer]=clients;
  const unlinked=(await request(patron)).state;assert.equal(unlinked.characterId,heroes[0].id);assert.equal(unlinked.level,30);assert.equal(unlinked.wallet,null);assert.equal(unlinked.balanceWei,undefined);assert.equal(reads.length,0,'unlinked checks do not call the chain');
  await bind(patron,wallets[0]);assert.equal(stored(0).auctionWallet,wallets[0].address,'normal signed wallet proof is durably linked');
  const verified=(await request(patron)).state;assert.equal(verified.valueUsdCents,'2500');assert.equal(verified.wallet,wallets[0].address);assert.equal(verified.checkedAt,clock);
  holdingsValue='3001';const repriced=(await request(patron)).state;assert.equal(repriced.valueUsdCents,'3001','Refresh replaces the prior USD value with the new quote');assert.equal(repriced.balanceWei,verified.balanceWei);assert(repriced.checkedAt>verified.checkedAt);holdingsValue='2500';
  const low=(await request(young)).state;assert.equal(low.level,29);assert.equal(low.valueUsdCents,'2500','a player below level 30 can independently meet the holdings requirement');
  const readCount=reads.length;for(const c of [far,obstructed]){const rejection=await request(c,{type:'goldMerchantCheck'},'event');assert.match(rejection.text,/nearby/);assert(!c.messages.some(m=>m.type==='goldMerchantState'));}assert.equal(reads.length,readCount);
  for(const fields of [{wallet:wallets[1].address},{valueUsdCents:'999999',balanceWei:'999999'},{level:60}])assert.match((await request(patron,{type:'goldMerchantCheck',...fields},'event')).text,/Invalid gold merchant/);
  await request(patron);const cooldownStart=patron.messages.length,cooledReads=reads.length;patron.send({type:'goldMerchantCheck'});const cooldown=await until(()=>patron.messages.slice(cooldownStart).find(m=>m.type==='goldMerchantState'),'cooldown');assert.match(cooldown.state.reason,/Wait/);assert.equal(cooldown.state.balanceWei,undefined);assert.equal(reads.length,cooledReads);
  unpriced=true;const balanceOnly=(await request(patron)).state;assert.equal(balanceOnly.balanceWei,'100000000000000000000');assert.equal(balanceOnly.valueUsdCents,undefined);assert.equal(balanceOnly.checkedAt,clock);assert.match(balanceOnly.reason,/balance verified.*USD pricing is temporarily unavailable/);unpriced=false;
  invalidValue=true;const invalid=(await request(patron)).state;assert.equal(invalid.balanceWei,undefined);assert.equal(invalid.valueUsdCents,undefined);invalidValue=false;
  unavailable=true;let failed=(await request(patron)).state;assert.equal(failed.valueUsdCents,undefined);assert.match(failed.reason,/temporarily unavailable/);assert(!JSON.stringify(failed).includes('private RPC'));unavailable=false;
  stale=true;failed=(await request(patron)).state;assert.equal(failed.checkedAt,undefined);assert.equal(failed.valueUsdCents,undefined);stale=false;
  hold=true;await tick();let start=patron.messages.length;patron.send({type:'goldMerchantCheck'});await until(()=>typeof hold==='function','held check');const pendingReads=reads.length;patron.send({type:'goldMerchantCheck'});await delay(100);assert.equal(reads.length,pendingReads,'one in-flight read per session');
  await bind(patron,wallets[1]);let release=hold;hold=false;release();const changedWallet=await until(()=>patron.messages.slice(start).find(m=>m.type==='goldMerchantState'),'wallet changed during read');assert.equal(changedWallet.state.wallet,wallets[1].address);assert.equal(changedWallet.state.valueUsdCents,undefined,'old-wallet response cannot qualify a new wallet');
  hold=true;await tick();start=patron.messages.length;patron.send({type:'goldMerchantCheck'});await until(()=>typeof hold==='function','moving during read');
  const away={x:front.x-3,z:front.z};assert(canTraverse(front,away));assert(Math.hypot(away.x-GOLD_MERCHANT.x,away.z-GOLD_MERCHANT.z)>3);await request(patron,{type:'move',zone:'greenwood',...away,rotation:0},'snapshot');await until(()=>Math.abs(patron.player().x-away.x)<.01,'walk away');
  release=hold;hold=false;release();await delay(120);assert(!patron.messages.slice(start).some(m=>m.type==='goldMerchantState'),'leaving merchant range discards delayed results');
  await request(patron,{type:'move',zone:'greenwood',...front,rotation:0},'snapshot');await until(()=>Math.abs(patron.player().x-front.x)<.01,'return to merchant');
  hold=true;await tick();start=patron.messages.length;patron.send({type:'goldMerchantCheck'});await until(()=>typeof hold==='function','slow check');await tick(16000);release=hold;hold=false;release();const slow=await until(()=>patron.messages.slice(start).find(m=>m.type==='goldMerchantState'),'expired check');assert.equal(slow.state.valueUsdCents,undefined,'late replies cannot refresh an expired verification');
  hold=true;await tick();start=patron.messages.length;patron.send({type:'goldMerchantCheck'});await until(()=>typeof hold==='function','leaving during read');await request(patron,{type:'leaveWorld'},'roster');release=hold;hold=false;release();await delay(120);assert(!patron.messages.slice(start).some(m=>m.type==='goldMerchantState'),'leaving the world discards delayed results');
  assert(!observer.messages.some(m=>m.type==='goldMerchantState'),'checks are private to their owner');
  for(const c of clients)for(const m of c.messages)if(['snapshot','welcome','roster'].includes(m.type))assert(!JSON.stringify(m).includes('valueUsdCents')&&!JSON.stringify(m).includes('balanceWei')&&!JSON.stringify(m).includes('auctionWallet'),'public state contains no wallet holdings');
  assert(!readFileSync(file,'utf8').includes('valueUsdCents')&&!readFileSync(file,'utf8').includes('balanceWei'),'qualification is never persisted');assert.equal(stored(0).gold,500);assert.deepEqual(stored(0).inventory,heroes[0].inventory);
  console.log('PASS gold merchant holdings: exact USD threshold, finalized/current balance, canonical chain/token/price checks; signed wallet link, independent level and balance, private on-demand state, range/LOS, forgery/cooldown, unavailable/stale, wallet change and delayed-session guards. No payments.');
}finally{if(typeof hold==='function')hold();for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
