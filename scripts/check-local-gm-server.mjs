import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';

const dir=mkdtempSync(join(tmpdir(),'mossvale-local-gm-')),file=join(dir,'players.json'),clients=[];
const tokens=Array.from({length:3},()=>randomBytes(32).toString('base64url'));
const keys=tokens.map(token=>createHash('sha256').update(token).digest('hex'));
const heroes=tokens.map((_,i)=>({id:randomUUID(),name:`Local tester ${i}`,coordinateVersion:2,zone:'greenwood',x:i,z:8,rotation:0,characterCreated:true,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},...starterGear('Ranger'),
  level:1,xp:0,gold:0,hp:100,maxHp:100,talents:[],inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},quest:{stage:0,kills:0,crystals:0},role:'gm',gm:{flying:true}}));
const options={port:0,host:'127.0.0.1',dataDir:dir,databaseUrl:'',keycloak:null};
const oldNodeEnv=process.env.NODE_ENV;let game,port;
async function until(fn,label){const end=Date.now()+6000;while(Date.now()<end){const value=fn();if(value)return value;await delay(15);}throw Error(`Timed out: ${label}`);}
async function start(extra={}){game=createGameServer({...options,...extra});port=await game.start();}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
async function connect(i,extras={}){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[],id:heroes[i].id};clients.push(c);
  c.send=message=>socket.send(JSON.stringify(message));c.player=()=>c.snapshot?.players.find(p=>p.id===c.id);
  socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(m.type==='snapshot')c.snapshot=m;});socket.on('close',code=>{c.closed=code;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  c.send({type:'join',token:tokens[i],characterId:c.id,...extras});await until(()=>c.player()||c.closed,'guest join');return c;
}
async function action(c,success,action='giveGold',targetId=c.id,fields={amount:7}){
  const index=c.messages.length;c.send({type:'gmAction',action,targetId,...fields});
  const result=await until(()=>c.messages.slice(index).find(m=>m.type==='gmResult'),action);assert.equal(result.success,success,result.text);return result;
}
try{
  for(const localGmAccountKeys of [null,keys[0],{},[''],['g'.repeat(64)],['A'.repeat(64)],['a'.repeat(63)],[1],Array(1)])assert.throws(()=>createGameServer({...options,localGmAccountKeys}),/localGmAccountKeys/);
  for(const extra of [{host:'0.0.0.0'},{host:'localhost'},{host:'127.0.0.2'},{host:'[::1]'},{host:'192.0.2.1'},{databaseUrl:'postgres://invalid-local-test'},{keycloak:{url:'http://127.0.0.1',realm:'test',clientId:'test'}}])assert.throws(()=>createGameServer({...options,...extra,localGmAccountKeys:[keys[0]]}),/Local guest GM access requires/);
  process.env.NODE_ENV='production';assert.throws(()=>createGameServer({...options,localGmAccountKeys:[keys[0]]}),/Local guest GM access requires/);
  process.env.NODE_ENV='test';
  writeFileSync(file,JSON.stringify(Object.fromEntries(heroes.map((p,i)=>[keys[i],{characters:[p],...(i===2?{ban:{at:Date.now(),by:heroes[0].id,reason:'Local ban fixture'}}:{})}]))));
  await start();let guest=await connect(0,{role:'gm',isGM:true,localGmAccountKeys:[keys[0]]});
  assert.equal(guest.player().role,'player');assert.equal(guest.player().gm,undefined);await action(guest,false);assert.equal(guest.player().gold,0);await stop();
  const allowed=[keys[0],keys[2]];await start({localGmAccountKeys:allowed});allowed.push(keys[1]);
  let gm=await connect(0),other=await connect(1,{role:'gm',isGM:true});
  assert.equal(gm.player().role,'gm');assert.equal(other.player().role,'player','later mutation of the caller array cannot grant authority');
  assert(gm.snapshot.gmPlayers?.some(p=>p.id===gm.id));assert.equal(other.snapshot.gmPlayers,undefined);
  const roster=await(await fetch(`http://127.0.0.1:${port}/api/roster`,{headers:{'x-guest-token':tokens[0]}})).json();assert.equal(roster.characters[0].role,'gm','HTTP and WebSocket rosters agree');
  await action(other,false);await action(gm,true);await until(()=>gm.player().gold===7,'GM grant reaches snapshot');
  assert.equal(JSON.parse(readFileSync(file))[keys[0]].characters[0].gold,7,'existing GM action writes durably');
  await action(gm,true,'setFlying',gm.id,{enabled:true});assert(gm.player().gm.flying);
  const old=gm;gm=await connect(0);await until(()=>old.closed===4001,'old account connection is retired');assert.equal(gm.player().role,'gm');assert.equal(gm.player().gm.flying,false,'reconnect resets temporary GM modes');
  await action(gm,true,'giveGold',other.id,{amount:2});await until(()=>other.player().gold===2,'active GM connection grants other guest');
  const banned=await connect(2);assert.equal(banned.closed,4409,'allowlist does not bypass a saved account ban');
  const config=await(await fetch(`http://127.0.0.1:${port}/api/config`)).text();for(const key of keys)assert(!config.includes(key),'allowlist remains server-side');
  await stop();const saved=readFileSync(file,'utf8');assert(!saved.includes('"role"'));assert(!saved.includes('"gm"'));assert(!saved.includes('"gmProtected"'),'local privilege does not leave persistent GM protection');
  for(const token of tokens)assert(!saved.includes(token),'guest tokens are never persisted in plaintext');
  await start();guest=await connect(0);assert.equal(guest.player().role,'player','restart without the explicit allowlist revokes GM');assert.equal(guest.player().gold,7);await action(guest,false);await stop();
  await start({host:'::1',localGmAccountKeys:[keys[0]]});await stop();
  console.log('PASS local GM: explicit loopback-only validated opt-in; default, browser, saved-role and other-guest denial; normal durable GM action and flight; roster consistency; takeover reset, bans, private configuration, no persistent privilege and default restart revocation.');
}finally{await stop();if(oldNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNodeEnv;rmSync(dir,{recursive:true,force:true});}
