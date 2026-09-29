import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { ZONES } from '../src/content.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear } from '../src/progression.ts';
import { defaultHotbar } from '../src/spells.ts';
import { canTraverse, regionAt, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';

// Two real clients and simulation ticks; saves and controlled encounter data are isolated.
const dir=mkdtempSync(join(tmpdir(),'mossvale-personal-notices-')),clients=[],realNow=Date.now;
const originalSlime={...MONSTERS['moss-slime']},base=OVERWORLD_SPAWNS.find(e=>e.id==='slime-1');
const point={x:base.x,z:base.z},target={x:base.x,z:base.z+2},node={x:base.x+1,z:base.z};
let clock=realNow(),game,port;Date.now=()=>clock;
async function until(fn,label){const end=realNow()+5000;while(realNow()<end){const value=fn();if(value)return value;await delay(10);}throw Error(`Timed out: ${label}`);}
async function tick(ms){clock+=ms;await delay(150);}
function hero(name){return {
 id:randomUUID(),name,...point,zone:regionAt(point.x,point.z),coordinateVersion:2,rotation:0,
 appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Knight'},
 characterCreated:true,level:1,hp:100,maxHp:100,xp:0,gold:0,talents:[],...starterGear('Knight'),
 learnedSpells:['strike'],hotbar:defaultHotbar('Knight'),inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},
 skills:{mining:0,woodcutting:0,herbalism:0},quest:{stage:0,kills:0,crystals:0}
};}
async function connect(token,id){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);
 c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===id);c.notices=()=>c.messages.filter(m=>m.type==='event'&&m.kind!=='chat');
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['snapshot','roster','welcome'].includes(m.type))c[m.type]=m;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 c.send({type:'join',token});await until(()=>c.roster,'roster');c.send({type:'selectCharacter',characterId:id});await until(()=>c.player(),'world entry');return c;
}
try {
 assert(canTraverse(point,target)&&canTraverse(point,node)&&!waterAt(point.x,point.z),'dry unobstructed encounter fixture');
 const heroes=[hero('First Adventurer'),hero('Second Adventurer')],tokens=heroes.map(()=>randomBytes(32).toString('base64url'));
 writeFileSync(join(dir,'players.json'),JSON.stringify(Object.fromEntries(heroes.map((p,i)=>[createHash('sha256').update(tokens[i]).digest('hex'),{characters:[p],communityRulesVersion:COMMUNITY_VERSION}]))));
 const enemies=ZONES[0].enemies,nodes=ZONES[0].nodes;
 Object.assign(MONSTERS['moss-slime'],{hp:200,speed:0,aggroRange:0});
 ZONES[0].enemies=[{id:'notification-target',kind:'moss-slime',...target}];ZONES[0].nodes=[{id:'notification-node',kind:'crystal',...node}];
 try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});}finally{ZONES[0].enemies=enemies;ZONES[0].nodes=nodes;}
 port=await game.start();
 const a=await connect(tokens[0],heroes[0].id);await until(()=>a.notices().some(m=>m.text.includes('arrived')),'own arrival');const aArrivalCount=a.notices().length;
 const b=await connect(tokens[1],heroes[1].id);await until(()=>a.snapshot.players.length===2,'shared player presence');
 assert.equal(a.notices().length,aArrivalCount,'another arrival is not a personal popup');assert(b.notices().some(m=>m.text.includes('Second Adventurer arrived')));
 const bCount=b.notices().length;

 a.send({type:'attack',ability:'strike',targetId:'notification-target'});
 await until(()=>b.messages.some(m=>m.type==='combat'&&m.playerId===heroes[0].id),'another player still sees the attack animation');
 assert(!a.notices().some(m=>m.kind==='combat'),'no hit text before impact');await tick(1000);
 await until(()=>a.notices().some(m=>m.kind==='combat'),'attacker receives its hit notice');
 assert(b.messages.some(m=>m.type==='damage'&&m.targetId==='notification-target'),'shared damage numbers remain simulation events');
 assert(b.snapshot.enemies.find(e=>e.id==='notification-target').hp<200,'shared enemy health remains authoritative');
 assert.equal(b.notices().length,bCount,'another attack does not create a personal action notice');

 a.send({type:'interact',targetId:'rowan'});await until(()=>a.notices().some(m=>m.text==="You're to far away"),'exact personal distance error');
 a.send({type:'gather',targetId:'notification-node'});const gathering=await until(()=>a.player().gathering,'gathering started');await tick(gathering.endsAt-clock+1);
 await until(()=>a.player().inventory.crystal===1,'gathering reward');assert(a.notices().some(m=>m.kind==='reward'&&m.text.includes('+1 crystal')));
 assert.equal(b.notices().length,bCount,'another interaction failure and gathering reward remain private');

 a.send({type:'chat',text:'Hello nearby adventurer'});
 await until(()=>b.messages.some(m=>m.type==='event'&&m.kind==='chat'&&m.text.includes('Hello nearby adventurer')),'intentional shared chat');
 a.send({type:'partyInvite',targetId:heroes[1].id});const invite=await until(()=>b.snapshot.partyInvites[0],'party invitation still delivered');
 assert.equal(invite.inviterId,heroes[0].id);assert(a.notices().some(m=>m.text==='Invited Second Adventurer.'));
 assert.equal(b.notices().length,bCount,'inviter confirmation does not replace the recipient invitation protocol');
 b.send({type:'partyAccept',invitationId:invite.id});await until(()=>a.snapshot.party?.members.length===2&&b.snapshot.party?.members.length===2,'party acceptance updates both members');
 assert(b.notices().some(m=>m.text==='Joined First Adventurer’s party.'));assert(!a.notices().some(m=>m.text.startsWith('Joined ')));

 const beforeLeave=a.notices().length;b.send({type:'leaveWorld'});await until(()=>a.snapshot.players.length===1,'shared departure presence');
 assert.equal(a.notices().length,beforeLeave,'another departure is not a personal popup');assert(b.notices().some(m=>m.text.includes('Second Adventurer left')));
 console.log('PASS personal notifications: private arrival/departure, attack, error and gathering notices; shared animation, damage, health, chat, presence and party invitations preserved.');
} finally {
 for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;Object.assign(MONSTERS['moss-slime'],originalSlime);rmSync(dir,{recursive:true,force:true});
}
