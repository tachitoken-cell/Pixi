import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Wallet,TypedDataEncoder,id } from 'ethers';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { spellsForClass } from '../src/spells.ts';
import { newRaidProgress,awardSpecialistXp,SPECIALISTS_ENABLED } from '../src/raid-progression.ts';
import { SP_NFT_TYPES,spCharacterHash,spProgress } from '../src/specialist-nft.ts';
const dir=mkdtempSync(join(tmpdir(),'mossvale-sp-nft-')),file=join(dir,'players.json'),clients=[],wallet=Wallet.createRandom(),authority=Wallet.createRandom(),contract=Wallet.createRandom().address;
const realNow=Date.now;let clock=realNow(),game,port,chainCalls=0,storeCalls=0,settlement='pending';Date.now=()=>clock;
const token=randomBytes(32).toString('base64url'),key=createHash('sha256').update(token).digest('hex'),card={id:randomUUID(),className:'Ranger',jobXp:8000,upgrade:6,attempts:9,broken:false,sealed:false,source:'quest'};
const hero={id:randomUUID(),name:'Specialist tester',appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},x:0,z:8,zone:'greenwood',coordinateVersion:2,rotation:0,characterCreated:true,...starterGear('Ranger'),talents:[],level:60,hp:100,maxHp:808,xp:0,gold:0,inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},learnedSpells:spellsForClass('Ranger').map(spell=>spell.id),ridingRank:0,ownedMounts:[],quest:{stage:0,kills:0,crystals:0},carriedItems:{'sp-specialist-case':2},auctionWallet:wallet.address,raidProgress:{...newRaidProgress(),specialists:[card],activeSpecialistId:card.id}};
const chain={configured:true,async status(){chainCalls++;return {configured:true,enabled:true,contract};},async page(offset){chainCalls++;return {offset,total:0,tokens:[]};},async settlement(){chainCalls++;return {state:settlement};},async prepare(input){chainCalls++;const expiresAt=(Math.floor(clock/1000)+300)*1000,tokenId=BigInt(id(`mossvale-specialist:${input.characterId}:${input.card.id}`)).toString(),contractOrder={orderId:id(`mossvale-specialist-order:${input.characterId}:${input.id}`),action:0,tokenId,revision:0,wallet:input.wallet,character:spCharacterHash(input.characterId),progress:spProgress(input.card),deadline:expiresAt/1000},domain={name:'MossvaleSpecialists',version:'1',chainId:4663,verifyingContract:contract};return {...input,specialistId:input.card.id,contract,chainId:4663,tokenId,status:'quoted',expiresAt,contractOrder,signature:await authority.signTypedData(domain,SP_NFT_TYPES,contractOrder),orderHash:TypedDataEncoder.hash(domain,SP_NFT_TYPES,contractOrder)};}};
const storeChain={async status(){return {enabled:false,chainId:4663};},async prepareOrder(){storeCalls++;throw Error('should not quote');}};
const stored=()=>JSON.parse(readFileSync(file,'utf8'))[key].characters[0];
async function until(fn,label){const end=realNow()+8000;while(realNow()<end){const value=fn();if(value)return value;await delay(15);}throw Error(`Timed out: ${label}`);}
async function start(){game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'',specialistNftChain:chain,storeChain});port=await game.start();}
async function connect(nativePlatform){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),client={socket,messages:[]};clients.push(client);socket.on('message',raw=>client.messages.push(JSON.parse(raw)));await new Promise(resolve=>socket.once('open',resolve));socket.send(JSON.stringify({type:'join',token,characterId:hero.id,...(nativePlatform?{nativePlatform}:{})}));await until(()=>client.messages.find(m=>m.type==='snapshot'),'join');return client;}
async function request(client,message,type){clock+=1100;const offset=client.messages.length;client.socket.send(JSON.stringify(message));return until(()=>client.messages.slice(offset).find(m=>m.type===type&&(type!=='event'||m.requestType===message.type)),message.type);}
try{
  // Exercise the actual XP path during the asynchronous specialist writer window.
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8'),xpSource=source.slice(source.indexOf('  function addXp('),source.indexOf('\n  const gmAuthorized'));
  let xpCalls=0;
  const commits=new Map(),award=Function('committingAccounts','awardSpecialistXp','storeBoostMultiplier','MAX_LEVEL','checkAchievements',`${xpSource};return addXp;`)(commits,(...args)=>{xpCalls++;awardSpecialistXp(...args);},()=>1,60,()=>{}),xpHero=structuredClone(hero),xpSession={recordKey:'test',player:xpHero};
  commits.set('test',{specialistNft:true});award(xpSession,100);assert.equal(xpCalls,0,'accepted NFT reservations cannot enter the XP writer during database commit');assert.equal(xpHero.raidProgress.specialists[0].jobXp,8000);commits.delete('test');award(xpSession,100);assert.equal(xpCalls,1,'XP processing resumes after reservation finishes');assert.equal(SPECIALISTS_ENABLED,false);assert.equal(xpHero.raidProgress.specialists[0].jobXp,8000,'paused specialist classes preserve existing XP');
  writeFileSync(file,JSON.stringify({[key]:{characters:[hero]}}));await start();let client=await connect();
  const state=await request(client,{type:'specialistNftOpen',offset:0},'specialistNftState');assert.equal(state.state.enabled,true);
  const quote=(await request(client,{type:'specialistNftSeal',specialistId:card.id},'specialistNftQuote')).order;
  assert.deepEqual(stored().specialistNftOrders[0],quote,'authorization exposed only after durable save');assert.equal(stored().raidProgress.specialists[0].sealed,true);assert.equal(stored().carriedItems['sp-specialist-case'],1);
  assert(client.messages.filter(m=>m.type==='snapshot').every(m=>m.players.every(p=>p.specialistNftOrders===undefined)),'wallet authorizations stay out of snapshots');
  const wrong=await request(client,{type:'specialistNftCheck',orderId:randomUUID()},'event');assert.match(wrong.text,/another character/);
  const duplicate=(await request(client,{type:'specialistNftSeal',specialistId:card.id},'specialistNftQuote')).order;assert.equal(duplicate.id,quote.id);assert.equal(stored().carriedItems['sp-specialist-case'],1);
  settlement='confirmed';await request(client,{type:'specialistNftCheck',orderId:quote.id},'specialistNftState');assert.equal(stored().specialistNftOrders[0].status,'confirmed');assert.equal(stored().raidProgress.specialists[0].nft.version,1);
  await game.stop();await start();client=await connect();await request(client,{type:'specialistNftOpen',offset:0},'specialistNftState');assert.equal(stored().raidProgress.specialists[0].nft.version,1,'NFT progress survives strict reload');
  await game.stop();await start();client=await connect('ios');const callsBefore=chainCalls;const denied=await request(client,{type:'specialistNftOpen',offset:0},'event');assert.match(denied.text,/iOS/);assert.equal(chainCalls,callsBefore,'native rejection precedes all specialist RPC');
  const purchase=await request(client,{type:'storeQuote',productId:'store-sp-specialist-case'},'event');assert.match(purchase.text,/iOS/);assert.equal(storeCalls,0,'native paid-SP rejection precedes quote preparation');
  client.socket.send(JSON.stringify({type:'join',token,characterId:hero.id}));
  assert.match((await request(client,{type:'specialistNftOpen',offset:0},'event')).text,/iOS/,'repeat join cannot downgrade a native connection');assert.equal(chainCalls,callsBefore);
  console.log('Specialist real server: WebSocket routing, save-before-quote, replay, private snapshots, finality settlement, restart and iOS pre-RPC/store guards passed.');
}finally{for(const client of clients)client.socket.terminate();await game?.stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
