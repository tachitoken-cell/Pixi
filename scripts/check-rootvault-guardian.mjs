import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { ROOTVAULT_ENTRANCE as entrance,ROOTVAULT_GUARDIAN as guardian } from '../src/dungeon.ts';
import { createOverworldSpawns,canTraverse,overworldSpawnAllowed,regionAt } from '../src/realm.ts';
import { surfaceAt } from '../src/landscape.ts';
import { starterGear } from '../src/progression.ts';
import { newContracts } from '../src/adventure.ts';
const dir=mkdtempSync(join(tmpdir(),'mossvale-rootvault-')),file=join(dir,'players.json'),realNow=Date.now,original=structuredClone(MONSTERS),clients=[];
let game,port,clock=realNow();Date.now=()=>clock;
const key=token=>createHash('sha256').update(token).digest('hex');
const hero=(name,point={x:guardian.x,z:guardian.z+2})=>({id:randomUUID(),name,...point,zone:regionAt(point.x,point.z),coordinateVersion:2,rotation:0,
 appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Knight'},characterCreated:true,...starterGear('Knight'),talents:[],learnedSpells:['strike'],
 level:60,xp:0,gold:0,hp:808,maxHp:808,rootvaultUnlocked:false,inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},contracts:newContracts(),
 quest:{chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null}});
const heroes={leader:hero('Gate leader'),ally:hero('Nearby ally',{x:guardian.x+1,z:guardian.z+2}),remote:hero('Distant ally',{x:guardian.x,z:guardian.z+30}),stranger:hero('Nearby stranger',{x:guardian.x-1,z:guardian.z+2}),fallen:hero('Fallen stranger',{x:guardian.x-2,z:guardian.z+2}),legacy:hero('Vault veteran',{x:entrance.x,z:entrance.z+1})};
heroes.fallen.hp=0;heroes.fallen.diedAt=clock;delete heroes.legacy.rootvaultUnlocked;heroes.legacy.contracts.completed['hollow-vault']=clock;
for(const [name,kills]of [['unproven',0],['proven',1]]) {
 const p=hero(name);delete p.rootvaultUnlocked;p.quest={chapter:7,stage:1,kills,crystals:0,progress:{'break-warden':kills,'cleanse-roots':0},completed:false,ending:null};heroes[name]=p;
}
const tokens=Object.fromEntries(Object.keys(heroes).map(n=>[n,randomBytes(32).toString('base64url')]));
async function until(fn,label){const end=realNow()+6500;while(realNow()<end){const r=fn();if(r)return r;await delay(15);}throw Error(`Timed out: ${label}`);}
async function tick(ms=900){clock+=ms;await delay(135);}
async function start(){game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
async function connect(name){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,id:heroes[name].id,messages:[]};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(m.type==='snapshot')c.snapshot=m;});await new Promise((res,rej)=>{socket.once('open',res);socket.once('error',rej);});c.send({type:'join',token:tokens[name],characterId:c.id});await until(()=>c.player(),'enter guardian fixture');return c;}
async function reject(c,message,part){await tick();const i=c.messages.length;c.send(message);await until(()=>c.messages.slice(i).some(m=>m.type==='event'&&m.kind==='info'&&m.text.includes(part)),part);assert.equal(c.snapshot.instanceId,null);}
async function party(leader,member){await tick(1100);leader.send({type:'partyInvite',targetId:member.id});const invite=await until(()=>member.snapshot.partyInvites[0],'party invitation');member.send({type:'partyAccept',invitationId:invite.id});await until(()=>member.snapshot.party?.members.some(m=>m.id===leader.id),'join party');}
async function walk(c,point){for(let guard=0;Math.hypot(c.player().x-point.x,c.player().z-point.z)>.02;guard++){
 assert(guard<100);const p=c.player(),d=Math.hypot(point.x-p.x,point.z-p.z),step=Math.min(.6,d),next={x:p.x+(point.x-p.x)*step/d,z:p.z+(point.z-p.z)*step/d};assert(canTraverse(p,next),'physical gate approach is clear');await tick(200);c.send({type:'move',zone:regionAt(next.x,next.z),...next,rotation:0});await until(()=>Math.hypot(c.player().x-next.x,c.player().z-next.z)<.01,'walk toward gate');}}
try{
 for(const stats of Object.values(MONSTERS))Object.assign(stats,{hp:1,speed:0,aggroRange:0});
 const home=createOverworldSpawns().find(s=>s.id===guardian.id);assert.deepEqual({x:home.x,z:home.z},{x:guardian.x,z:guardian.z});assert(overworldSpawnAllowed(home,'hollow'));
 const heights=[];for(const x of [entrance.x-5,entrance.x,entrance.x+5])for(const z of [entrance.z-3,entrance.z,guardian.z+3])heights.push(surfaceAt(x,z).height);assert(Math.max(...heights)-Math.min(...heights)<.01,'gate and guardian have a flat arena');
 writeFileSync(file,JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([name,p])=>[key(tokens[name]),{characters:[p]}]))));await start();const c={};for(const n of Object.keys(heroes))c[n]=await connect(n);
 assert.equal(c.legacy.player().rootvaultUnlocked,true,'a previously completed vault retains access');assert.equal(c.leader.player().rootvaultUnlocked,false);assert.equal(c.unproven.player().rootvaultUnlocked,false,'merely arriving at chapter7 does not bypass the guardian');assert.equal(c.proven.player().rootvaultUnlocked,true,'saved completed guardian objective retains access');
 await reject(c.leader,{type:'dungeonEnter'},'guardian');await reject(c.stranger,{type:'dungeonEnter',rootvaultUnlocked:true},'controlled');
 await party(c.leader,c.ally);await party(c.leader,c.remote);await reject(c.leader,{type:'dungeonEnter'},'guardian');
 const i=c.leader.messages.length;c.leader.send({type:'autoAttack',targetId:guardian.id});const swing=await until(()=>c.leader.messages.slice(i).find(m=>m.type==='combat'&&m.basic),'guardian attack starts');
 assert.equal(c.leader.player().rootvaultUnlocked,false,'an animation release is not kill credit');await tick(swing.startedAt+301-clock);
 await until(()=>c.leader.player().rootvaultUnlocked&&c.ally.player().rootvaultUnlocked,'actual guardian death unlocks nearby party');
 assert.equal(c.remote.player().rootvaultUnlocked,false,'distant party member must participate nearby');assert.equal(c.stranger.player().rootvaultUnlocked,false,'nearby nonparty does not receive gate credit');assert.equal(c.fallen.player().rootvaultUnlocked,false,'dead characters do not receive gate credit');
 await reject(c.leader,{type:'dungeonEnter'},'guardian');c.leader.send({type:'partyKick',targetId:c.remote.id});await until(()=>c.leader.snapshot.party.members.length===2,'remove unqualified member');
 await walk(c.leader,{x:entrance.x,z:entrance.z+1});await walk(c.ally,{x:entrance.x+1,z:entrance.z+1});c.leader.send({type:'dungeonEnter'});await until(()=>c.leader.snapshot.instanceId&&c.ally.snapshot.instanceId,'qualified living party enters');assert.equal(c.leader.snapshot.instanceId,c.ally.snapshot.instanceId);
 await stop();const saved=JSON.parse(readFileSync(file,'utf8'));assert(saved[key(tokens.leader)].characters[0].rootvaultUnlocked);assert(saved[key(tokens.ally)].characters[0].rootvaultUnlocked);assert.equal(saved[key(tokens.remote)].characters[0].rootvaultUnlocked,false);
 await start();const restored=await connect('leader');assert(restored.player().rootvaultUnlocked);restored.send({type:'dungeonEnter'});await until(()=>restored.snapshot.instanceId,'permanent unlock allows solo entry after restart');
 console.log('PASS Rootvault guardian: canonical protected temple spawn, flat gate arena, locked solo/group/forgery rejection, actual-impact kill credit for living nearby party only, physical approach and shared instance entry, legacy completion and permanent per-character restart access.');
}finally{await stop();Date.now=realNow;for(const [kind,stats]of Object.entries(original))Object.assign(MONSTERS[kind],stats);rmSync(dir,{recursive:true,force:true});}
