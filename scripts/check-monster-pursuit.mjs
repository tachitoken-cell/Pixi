import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { WORLD_BOSSES, MONSTERS, CHARGE_ATTACK, CHARGING_MONSTERS, BASIC_ATTACK, monsterPursuitSpeed } from '../src/bestiary.ts';
import { ZONES } from '../src/content.ts';
import { toLocal, canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { surfaceAt } from '../src/landscape.ts';
import { starterGear } from '../src/progression.ts';
import { WALK_SPEED, SPRINT_SPEED } from '../src/travel.ts';
const lairs=[...WORLD_BOSSES],clear=lairs[3],dir=mkdtempSync(join(tmpdir(),'mossvale-pursuit-')),clients=[],realNow=Date.now;
let clock=realNow(),game,port,fixtureId;Date.now=()=>clock;
for(const kind of Object.keys(MONSTERS).filter(kind=>kind!=='training-dummy'))assert(monsterPursuitSpeed(kind)>WALK_SPEED&&monsterPursuitSpeed(kind)<SPRINT_SPEED);
const point=(x=0,z=0)=>({x:clear.x+x,z:clear.z+z});
const hero=(name,p,level=100)=>({id:randomUUID(),name,...p,zone:surfaceAt(p.x,p.z).zone,coordinateVersion:2,rotation:0,characterCreated:true,
 appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Knight'},talents:[],learnedSpells:['strike','crippling-strike','shield-bash'],...starterGear('Knight'),hp:100+(level-1)*12,maxHp:100+(level-1)*12,level,xp:0,gold:0,inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},quest:{stage:0,kills:0,crystals:0}});
async function until(fn,label){const end=realNow()+5000;while(realNow()<end){const result=fn();if(result)return result;await delay(10);}throw Error(`Timed out: ${label}`);}
async function tick(ms=100){
 const frames=clients.filter(c=>c.inWorld).map(c=>[c,c.snapshot]);clock+=ms;
 await until(()=>frames.every(([c,before])=>!c.inWorld||c.snapshot!==before&&c.snapshot.serverTime===clock),'fresh pursuit snapshots');
}
async function through(at){while(clock<at)await tick(Math.min(100,at-clock));}
async function connect(token){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);c.enemy=()=>c.snapshot?.enemies.find(e=>e.id===fixtureId);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['roster','welcome','snapshot'].includes(m.type))c[m.type]=m;if(m.type==='snapshot')c.inWorld=true;if(m.type==='roster')c.inWorld=false;});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token});await until(()=>c.roster,'roster');c.send({type:'selectCharacter',characterId:c.roster.characters[0].id});await until(()=>c.player(),'entry');return c;}
// Keep the fake clock fixed while the charge target and bystander enter. A player
// joining after a windup starts is correctly exempt from that existing attack.
async function start(kind,players,home=point(),hp=20000){clock+=20000;fixtureId='pursuit-fixture';const tokens=players.map(()=>randomBytes(32).toString('base64url'));
 writeFileSync(join(dir,'players.json'),JSON.stringify(Object.fromEntries(players.map((p,i)=>[createHash('sha256').update(tokens[i]).digest('hex'),{characters:[p]}]))));
 const zone=ZONES.find(z=>z.id===surfaceAt(home.x,home.z).zone),oldSpawns=zone.enemies,oldHp=MONSTERS[kind].hp,bosses=WORLD_BOSSES.splice(0);
 zone.enemies=[{id:fixtureId,kind,...toLocal(zone.id,home)}];MONSTERS[kind].hp=hp;
 try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});}finally{zone.enemies=oldSpawns;MONSTERS[kind].hp=oldHp;WORLD_BOSSES.push(...bosses);}
 port=await game.start();const joined=[];for(const token of tokens){joined.push(await connect(token));if(joined.length===1){await tick(0);if(tokens.length>1)await until(()=>joined[0].enemy()?.attack,'initial attack');}}return joined;}
async function startBoss(boss,players){clock+=20000;fixtureId=boss.id;const tokens=players.map(()=>randomBytes(32).toString('base64url'));
 writeFileSync(join(dir,'players.json'),JSON.stringify(Object.fromEntries(players.map((p,i)=>[createHash('sha256').update(tokens[i]).digest('hex'),{characters:[p]}]))));game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();const joined=[];for(const token of tokens){joined.push(await connect(token));if(joined.length===1){await tick(0);if(tokens.length>1)await until(()=>joined[0].enemy()?.attack,'initial attack');}}return joined;}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
async function move(c,next,sprint=false,ms=100){const before={x:c.enemy().x,z:c.enemy().z};clock+=ms;c.send({type:'move',...next,zone:c.player().zone,rotation:0,sprint});await until(()=>c.snapshot?.serverTime===clock&&Math.hypot(c.player().x-next.x,c.player().z-next.z)<.02,'accepted movement');await delay(110);return Math.hypot(c.enemy().x-before.x,c.enemy().z-before.z);}
async function cast(c,ability){const count=c.messages.length;c.send({type:'attack',ability,targetId:fixtureId});await until(()=>c.messages.slice(count).some(m=>m.type==='combat'&&m.playerId===c.welcome.id)||c.player().casting,'attack');if(c.player().casting)await through(c.player().casting.endsAt);await through(clock+600);}
try{
 // Ordinary pursuit must keep applying real contact pressure on both straight and circular walking.
 for(const shape of ['straight','circle']){const home=shape==='straight'?point(-18):point(),startAt=shape==='straight'?{x:home.x+1.5,z:home.z}:point(3),[c]=await start('grove-spider',[hero('Walker',startAt)],home),hp=c.player().hp;
  for(let i=1;i<=60;i++){const next=shape==='straight'?{x:startAt.x+i*WALK_SPEED*.1,z:startAt.z}:point(Math.cos(i*WALK_SPEED*.1/3)*3,Math.sin(i*WALK_SPEED*.1/3)*3);const moved=await move(c,next);assert(moved<=monsterPursuitSpeed('grove-spider')*.1+.03,'contact and main tick share one movement budget');}
  assert(c.player().hp<hp,`${shape} walking cannot indefinitely evade melee`);await stop();}
 // Sprint gives a real escape window; a slow creates one without sprinting.
 for(const slow of [false,true]){const home=point(-18),[c]=await start('grove-spider',[hero('Escaper',{x:home.x+1.5,z:home.z})],home);
  if(slow)await cast(c,'crippling-strike');const hp=c.player().hp,startAt={x:c.player().x,z:c.player().z},speed=slow?WALK_SPEED:SPRINT_SPEED;
  for(let i=1;i<=30;i++)await move(c,{x:startAt.x+i*speed*.1,z:startAt.z},!slow);
  assert.equal(c.player().hp,hp,slow?'slowing the enemy opens safe walking distance':'a sprint can leave basic reach');assert(Math.hypot(c.player().x-c.enemy().x,c.player().z-c.enemy().z)>3);await stop();}
 const [contact]=await start('grove-spider',[hero('Contact walker',point(1.5))]);const attack=await until(()=>contact.enemy().attack,'basic');assert(attack.basic);const hp=contact.player().hp;
 await move(contact,point(2.08));assert(contact.enemy().x>clear.x,'normal windup keeps pursuing');await move(contact,point(2.66));assert(contact.player().hp<hp,'contact follows timestamp-budgeted pursuit');
 const before={x:contact.enemy().x,z:contact.enemy().z};await tick(5000);assert(Math.hypot(contact.enemy().x-before.x,contact.enemy().z-before.z)<=monsterPursuitSpeed('grove-spider')*.2+.01,'delayed tick never grants seconds of catch-up movement');await stop();
 console.log('PASS pursuit: walking straight/circles receives contact damage, sprint and slows give escape, basics keep moving, combined impact/frame budget is capped.');
 // Every authored charging species and boss performs a real locked dash and a single full-lane hit.
 for(const entry of [...CHARGING_MONSTERS.map(kind=>({kind})),...lairs]){const home=entry.id?entry:point(),players=[hero('Lane target',{x:home.x+6,z:home.z}),hero('Lane bystander',{x:home.x+6,z:home.z+1})],pair=entry.id?await startBoss(entry,players):await start(entry.kind,players),[c,b]=pair;
  const charge=await until(()=>c.enemy()?.attack?.style==='charge'&&c.enemy().attack,`${entry.kind} charge`);const before=[c.player().hp,b.player().hp];
  assert(charge.fromX!==undefined&&charge.fromZ!==undefined&&charge.chargeAt>charge.startedAt);assert(charge.impactAt>charge.chargeAt);assert.equal(charge.impactAt-charge.chargeAt,Math.ceil(Math.hypot(charge.x-charge.fromX,charge.z-charge.fromZ)/CHARGE_ATTACK.speed*1000));
  await through(charge.chargeAt-1);assert.deepEqual([c.enemy().x,c.enemy().z],[charge.fromX,charge.fromZ],'charge tell is planted');assert.deepEqual([c.player().hp,b.player().hp],before);
  await through(charge.chargeAt+200);assert(Math.hypot(c.enemy().x-charge.fromX,c.enemy().z-charge.fromZ)>1,'server position advances during dash');
  await through(charge.impactAt-1);assert.deepEqual([c.player().hp,b.player().hp],before,'lane cannot damage before advertised impact');await through(charge.impactAt);
  assert.deepEqual([c.enemy().x,c.enemy().z],[charge.x,charge.z],'dash reaches its fixed destination');if(!(c.player().hp<before[0]&&b.player().hp<before[1]))console.error('CHARGE_FIXTURE',JSON.stringify({entry,charge,before,players:[c.player(),b.player()].map(p=>({x:p.x,z:p.z,hp:p.hp,jump:p.jump})),damage:c.messages.filter(m=>m.type==='damage')}));assert(c.player().hp<before[0]&&b.player().hp<before[1],'full charge capsule hits targets and bystanders');
  const after=[c.player().hp,b.player().hp];await through(charge.endsAt);assert.deepEqual([c.player().hp,b.player().hp],after,'charge applies once');
  assert(c.messages.filter(m=>m.type==='snapshot').flatMap(m=>m.enemies).filter(e=>e.id===fixtureId&&e.attack?.id===charge.id).every(e=>e.attack.x===charge.x&&e.attack.z===charge.z),'charge direction never homes');await stop();}
 console.log('PASS charges: all six ordinary beasts and all four world bosses physically dash along the locked telegraph; one honest capsule hit at dash end.');
 // Sideways dodge and a stalled simulation both avoid a late lane hit.
 for(const mode of ['sidestep','lag','blocked','leave','stun','kill']){const players=[hero('Charge target',point(6)),hero('Observer',point(0,12))];
  if(mode==='stun')players.push(hero('Interrupter',point(2)));if(mode==='kill')players.push(hero('Executioner',point(2),60));
  // The live level cap normalizes oversized saved levels. A wounded creature
  // makes the ordinary strike lethal without relying on an impossible hero.
  const [c,watch,helper]=await start('bramble-wolf',players,point(),mode==='kill'?1:20000),charge=await until(()=>c.enemy()?.attack?.style==='charge'&&c.enemy().attack,`${mode} charge`),before=c.player().hp;
  if(mode==='sidestep'){for(let i=1;i<=7;i++)await move(c,point(6,i*.58));await through(charge.impactAt);assert.equal(c.player().hp,before,'sideways movement clears the locked lane');}
  if(mode==='lag'){const origin={x:c.enemy().x,z:c.enemy().z};await tick(charge.impactAt-clock+100);assert(Math.hypot(c.enemy().x-origin.x,c.enemy().z-origin.z)<=CHARGE_ATTACK.speed*.2+.01);assert.equal(c.player().hp,before,'stalled dash cannot damage untraveled lane');}
  if(mode==='blocked'){const rock={x:charge.fromX+(charge.x-charge.fromX)/2,z:charge.fromZ+(charge.z-charge.fromZ)/2+charge.radius-.1,r:.2};WORLD_COLLIDERS.push(rock);try{await through(charge.impactAt);assert.equal(c.player().hp,before);assert(!c.enemy().attack||c.enemy().attack.id!==charge.id,'side obstruction cancels full-width charge');}finally{WORLD_COLLIDERS.pop();}}
  if(mode==='leave'){c.send({type:'leaveWorld'});await through(charge.impactAt);assert(!watch.enemy().attack||watch.enemy().attack.id!==charge.id,'target session leave cancels charge');}
  if(mode==='stun'||mode==='kill'){await cast(helper,mode==='stun'?'shield-bash':'strike');await through(charge.impactAt);assert.equal(c.player().hp,before);assert(!watch.enemy().attack||watch.enemy().attack.id!==charge.id,`${mode} cancels charge`);if(mode==='kill')assert.equal(watch.enemy().alive,false);}
  await stop();}
 console.log('PASS charge cancellation: sidestep, delayed-tick cap, full-width dynamic obstacle, session exit, stun and lethal hit prevent charge damage.');
}finally{await stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
