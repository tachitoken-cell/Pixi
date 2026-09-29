import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Interface, Wallet, id, toQuantity, ZeroHash } from 'ethers';
import { createSpecialistNftChain } from '../src/specialist-nft-chain.mjs';
import { createSpecialistNftService, specialistNftBusy } from '../src/specialist-nft-service.mjs';
import { specialistNftOrderValid, specialistNftPlayerValid, spCharacterHash } from '../src/specialist-nft.ts';
import { newRaidProgress } from '../src/raid-progression.ts';
import { MOSS_TOKEN } from '../src/auction.ts';
const artifact=JSON.parse(readFileSync(new URL('../public/contracts/MossvaleSpecialists.json',import.meta.url),'utf8'));
const feeArtifact=JSON.parse(readFileSync(new URL('../public/contracts/MossvaleBuyBurn.json',import.meta.url),'utf8'));
const runtime=readFileSync(new URL('./fixtures/moss-token-runtime.hex',import.meta.url),'utf8').trim(),abi=new Interface(artifact.abi),feeAbi=new Interface(feeArtifact.abi);
const authority=Wallet.createRandom(),alice=Wallet.createRandom(),bob=Wallet.createRandom(),contract=Wallet.createRandom().address,feeReceiver=Wallet.createRandom().address;
let now=1000000,number=100,calls=0,badCode=false,badChain=false,reorg=false,stale=false,outage=false,badAuthority=false,latestOwner;
const originalNow=Date.now;Date.now=()=>now;
const orders=new Map(),tokens=new Map(),block=()=>({number:toQuantity(number),timestamp:toQuantity(Math.floor(now/1000)-(stale?4000:0)),hash:id(`block-${number}`)});
const rpc=async(method,params)=>{
  calls++;if(outage)throw Error('RPC unavailable');
  if(method==='eth_chainId')return badChain?'0x1':'0x1237';
  if(method==='eth_getBlockByNumber')return {...block(),...(reorg&&!['finalized','latest'].includes(params[0])?{hash:id('reorg')}:{})};
  if(method==='eth_getCode'){assert(params[1].requireCanonical);return badCode?'0x6000':params[0]===contract?artifact.deployedBytecode:params[0]===feeReceiver?feeArtifact.deployedBytecode:runtime;}
  if(method==='eth_call'){
    const [{to,data},tag]=params;assert(tag.requireCanonical);const iface=to===feeReceiver?feeAbi:abi,call=iface.parseTransaction({data}),args=Array.from(call.args),key=String(args[0]),token=tokens.get(key);
    const values={authority:[badAuthority?bob.address:authority.address],feeReceiver:[feeReceiver],royaltyInfo:[feeReceiver,500n],paymentToken:[MOSS_TOKEN.address],
      claimedOrders:[orders.get(key)||ZeroHash],ownerOf:[latestOwner||token?.owner||alice.address],cards:token?[Object.values(token.progress),token.revision,token.character,token.active]:[[0,0,0,false,0],0,ZeroHash,false],prices:[token?.price||0n],
      totalSupply:[tokens.size],page:[[...tokens].slice(Number(args[0]||0),Number(args[0]||0)+20).map(([tokenId,item])=>[tokenId,item.owner,[Object.values(item.progress),item.revision,item.character,item.active],item.price||0n])]};
    assert(call.name in values);return iface.encodeFunctionResult(call.name,values[call.name]);
  }throw Error(`Unexpected RPC ${method}`);
};
const options={contract,feeReceiver,authorityKey:authority.privateKey,rpc};
const advance=()=>{number++;now+=1000;};
const mintChain=order=>{orders.set(order.contractOrder.orderId,order.orderHash);tokens.set(order.tokenId,{owner:order.wallet,progress:order.contractOrder.progress,revision:order.contractOrder.revision+1,character:order.action==='activate'?spCharacterHash(order.characterId):ZeroHash,active:order.action==='activate'});advance();};
function player(){const card={id:randomUUID(),className:'Knight',jobXp:12000,upgrade:8,broken:true,attempts:20,source:'quest',sealed:false};return {id:randomUUID(),level:60,auctionWallet:alice.address,appearance:{className:'Knight'},specialistNftOrders:[],raidProgress:{...newRaidProgress(),specialists:[card],activeSpecialistId:null},carriedItems:{'sp-specialist-case':3},inventory:{wood:0,herb:0,crystal:0,relic:0,potion:0},ownedGear:[],equipment:{},ownedBags:[],equippedBags:[null,null,null,null]};}
let failSave=false;
const commit=async(owner,prepare)=>{const changes=await prepare(owner.player);if(!changes)return false;if(failSave)throw Error('Simulated disk failure');Object.assign(owner.player,changes);return true;};
try{
  const off=createSpecialistNftChain({contract:'',rpc});const before=calls;assert.equal((await off.status()).enabled,false);assert.equal(calls,before,'disabled config makes no RPC requests');
  {const status=await createSpecialistNftChain(options).status();assert.equal(status.enabled,true,status.reason);}
  for(const flag of ['badCode','badChain','reorg','stale','badAuthority']){
    if(flag==='badCode')badCode=true;if(flag==='badChain')badChain=true;if(flag==='reorg')reorg=true;if(flag==='stale')stale=true;if(flag==='badAuthority')badAuthority=true;
    assert.equal((await createSpecialistNftChain(options).status()).enabled,false,flag);badCode=badChain=reorg=stale=badAuthority=false;advance();
  }
  const chain=createSpecialistNftChain(options),service=createSpecialistNftService({chain,commit}),hero=player(),owner={player:hero,recordKey:'test'};
  const raced=player(),raceOwner={player:raced},raceService=createSpecialistNftService({chain:{...chain,async prepare(input){const result=await chain.prepare(input);raced.raidProgress.specialists[0].jobXp+=25;return result;}},commit});
  await assert.rejects(raceService.handle(raceOwner,{type:'specialistNftSeal',specialistId:raced.raidProgress.specialists[0].id}),/not saved/);
  assert.equal(raced.raidProgress.specialists[0].jobXp,12025);assert.equal(raced.raidProgress.specialists[0].sealed,false);assert.equal(raced.carriedItems['sp-specialist-case'],3);assert.equal(raced.specialistNftOrders.length,0,'XP arriving during RPC keeps all progress and the case');
  for(const nativePlatform of ['ios','apple']){const count=calls;await assert.rejects(service.handle(owner,{type:'specialistNftOpen',offset:0},{nativePlatform}),/iOS/);assert.equal(calls,count);}
  await assert.rejects(service.handle(owner,{type:'specialistNftSeal',specialistId:hero.raidProgress.specialists[0].id,extra:true}),/Invalid/);
  failSave=true;const unchanged=JSON.stringify(hero);await assert.rejects(service.handle(owner,{type:'specialistNftSeal',specialistId:hero.raidProgress.specialists[0].id}),/disk failure/);assert.equal(JSON.stringify(hero),unchanged);failSave=false;
  let response=await service.handle(owner,{type:'specialistNftSeal',specialistId:hero.raidProgress.specialists[0].id}),order=response.order;
  assert(specialistNftOrderValid(order));assert(specialistNftPlayerValid(hero));assert(specialistNftBusy(hero));assert.equal(hero.carriedItems['sp-specialist-case'],2);assert.equal(hero.raidProgress.specialists[0].sealed,true);
  const duplicate=await service.handle(owner,{type:'specialistNftSeal',specialistId:hero.raidProgress.specialists[0].id});assert.equal(duplicate.order.id,order.id);assert.equal(hero.carriedItems['sp-specialist-case'],2);
  const corrupt=structuredClone(order);corrupt.card.upgrade++;assert(!specialistNftOrderValid(corrupt));
  await service.settle(owner,order.id);assert.equal(hero.specialistNftOrders[0].status,'quoted');
  mintChain(order);failSave=true;const frozen=JSON.stringify(hero);await assert.rejects(service.settle(owner,order.id),/disk failure/);assert.equal(JSON.stringify(hero),frozen);failSave=false;
  await service.settle(owner,order.id);assert.equal(hero.specialistNftOrders[0].status,'confirmed');assert.equal(hero.raidProgress.specialists[0].sealed,true);assert.equal(hero.raidProgress.specialists[0].nft.version,1);assert.equal(hero.raidProgress.specialists[0].broken,true);
  response=await service.handle(owner,{type:'specialistNftActivate',tokenId:order.tokenId});const activation=response.order;assert.equal(hero.raidProgress.specialists.length,1);assert.equal(hero.raidProgress.specialists[0].sealed,true);mintChain(activation);
  reorg=true;await assert.rejects(service.settle(owner,activation.id),/changed/);reorg=false;assert.equal(hero.raidProgress.specialists[0].sealed,true);
  latestOwner=bob.address;advance();await assert.rejects(service.settle(owner,activation.id),/matches/);latestOwner=undefined;advance();
  await service.settle(owner,activation.id);assert.equal(hero.raidProgress.specialists[0].sealed,false);assert.equal(hero.raidProgress.specialists[0].nft.version,2);assert.equal(hero.carriedItems['sp-specialist-case'],2);
  await assert.rejects(chain.transaction({wallet:alice.address,action:'transfer',tokenId:order.tokenId,recipient:bob.address}),/Seal/);
  hero.raidProgress.specialists[0].broken=false;hero.raidProgress.specialists[0].jobXp=17000;hero.raidProgress.specialists[0].upgrade=9;hero.raidProgress.specialists[0].attempts=21;
  response=await service.handle(owner,{type:'specialistNftSeal',specialistId:hero.raidProgress.specialists[0].id});const reseal=response.order;assert.equal(reseal.action,'seal');assert.equal(hero.carriedItems['sp-specialist-case'],1);mintChain(reseal);await service.settle(owner,reseal.id);assert.equal(hero.raidProgress.specialists[0].nft.version,3);
  const sale=await chain.transaction({wallet:alice.address,action:'list',tokenId:order.tokenId,amountWei:'10000'});assert.equal(sale.amountWei,'10000');tokens.get(order.tokenId).price=10000n;advance();await assert.rejects(chain.transaction({wallet:bob.address,action:'buy',tokenId:order.tokenId,amountWei:'10001',seller:alice.address,revision:3}),/changed/);
  assert.equal((await chain.transaction({wallet:bob.address,action:'buy',tokenId:order.tokenId,amountWei:'10000',seller:alice.address,revision:3})).action,'buy');
  const other=player(),second={player:other,recordKey:'other'};other.auctionWallet=bob.address;tokens.get(order.tokenId).owner=bob.address;tokens.get(order.tokenId).price=0n;advance();
  await assert.rejects(service.handle(owner,{type:'specialistNftActivate',tokenId:order.tokenId}),/owned/);
  const imported=(await service.handle(second,{type:'specialistNftActivate',tokenId:order.tokenId})).order;assert.equal(other.raidProgress.specialists.length,2);mintChain(imported);await service.settle(second,imported.id);const active=other.raidProgress.specialists.find(card=>card.nft);assert.equal(active.jobXp,17000);assert.equal(active.upgrade,9);assert.equal(active.broken,false);assert.equal(active.attempts,21);assert.equal(active.sealed,false);
  const expires=(await service.handle(second,{type:'specialistNftSeal',specialistId:active.id})).order;now=expires.expiresAt+1000;advance();outage=true;await assert.rejects(service.settle(second,expires.id),/unavailable/);outage=false;assert.equal(active.sealed,false); // old object is untouched; persisted clone is frozen
  other.ownedGear=Array.from({length:16},(_,i)=>`gear-${i}`);delete other.carriedItems['sp-specialist-case'];await service.settle(second,expires.id);assert.equal(other.specialistNftOrders.at(-1).status,'quoted','full bags retain escrow');other.ownedGear=[];
  await service.settle(second,expires.id);assert.equal(other.specialistNftOrders.at(-1).status,'expired');assert.equal(other.carriedItems['sp-specialist-case'],1);assert.equal(other.raidProgress.specialists.find(card=>card.id===active.id).sealed,false);
  await service.settle(second,expires.id);assert.equal(other.carriedItems['sp-specialist-case'],1,'refund replay cannot duplicate a paid case');
  console.log('Specialist bridge: finality/code pin, iOS pre-RPC guard, exact progress round trip, transfer ownership, revision/replay, save failure, expiry refund and full-bag escrow passed.');
}finally{Date.now=originalNow;}
