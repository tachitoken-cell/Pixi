import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createRaidPreview, PREVIEW_MECHANICS, startRaidPreviewServer } from './raid-preview-server.mjs';
const preview=createRaidPreview(),state=()=>preview.snapshot();
const advance=milliseconds=>{for(let left=milliseconds;left>0;left-=100)preview.advance(Math.min(100,left));};
const move=async(x,z)=>{await preview.command({type:'move',x,z});advance(15000);};
const play=()=>preview.command({type:'pause',paused:false});
const attack=targetId=>preview.command({type:'attack',targetId});
assert.equal(state().mechanicId,'full-route');assert.equal(state().raid.phase,'approach');assert.equal(state().raid.approach.roomIndex,0,'preview opens at the first chamber');
const catalogModels=new Set();
for(const mechanic of PREVIEW_MECHANICS){
 await preview.select(mechanic.id);const s=state();assert.equal(s.mechanicId,mechanic.id);assert(s.paused);assert.equal(s.raid.members.length,20);
 assert.equal(s.self.id,'hero');assert.equal(s.self.appearance.className,'Ranger');assert.equal(s.attackRange,13.5);assert.doesNotThrow(()=>JSON.stringify(s));
 assert(s.enemies.every(e=>!Object.hasOwn(e,'threat')&&!Object.hasOwn(e,'target')&&!Object.hasOwn(e,'participants')));
 assert(s.players.every(p=>p.instanceId===s.self.instanceId));
 const before=s.now;advance(1000);assert.equal(state().now,before,'mechanic read window freezes real timers');
 if(mechanic.id.startsWith('chamber-')){assert.equal(s.raid.approach.roomIndex,Number(mechanic.id.slice(8))-1);assert.equal(s.raid.phase,'approach');assert.equal(s.enemies.filter(e=>e.alive).length,4);s.enemies.forEach(e=>catalogModels.add(e.model));}
 if(mechanic.id.startsWith('morgrath')){assert.equal(s.raid.approach.roomIndex,6);assert.equal(s.raid.phase,'morgrath');assert(s.enemies.some(e=>e.model==='morgrath'&&e.id===s.raid.bossId));}
}
assert.equal(catalogModels.size,24,'all 24 source creatures have playable chamber selections');
for(const [id,kind]of [['morgrath-cleave','Morgrath Cleave'],['morgrath-rift','Morgrath Rift'],['morgrath-rupture','Morgrath Rupture']]){
 await preview.select(id);assert(state().raid.hazards.some(h=>h.kind===kind&&h.sourceId===state().raid.bossId),`${kind} uses an actual boss cast`);
}
// Drive the whole approach using the same movement/attack/gate commands as the
// browser. Existing Apostle selections below cover the final encounter phases.
await preview.select('full-route');
for(let room=0;room<7;room++){
 assert.equal(state().raid.approach.roomIndex,room);
 await preview.command({type:'advance'});assert.equal(state().raid.approach.roomIndex,room,'an uncleared room cannot be skipped');
 for(let hit=0;!state().raid.approach.cleared;hit++){
  assert(hit<100,'chamber must clear through normal preview attacks');
  const foe=state().enemies.find(e=>e.alive);assert(foe);
  await preview.command({type:'pause',paused:true});await move(foe.x,foe.z);await play();advance(600);await attack(foe.id);
 }
 await preview.command({type:'pause',paused:true});await move(0,20);await preview.command({type:'advance'});assert.equal(state().raid.approach.roomIndex,room,'the leader must reach the cleared north gate');
 await move(0,-27);await preview.command({type:'advance'});assert.equal(state().raid.approach.roomIndex,room+1,'the north gate rallies the next room');
 assert(state().players.every(p=>p.hp===p.maxHp),'rally restores the group before the next chamber');
}
assert.equal(state().raid.phase,'sermon');assert(state().enemies.some(e=>e.model==='horned-apostle'),'the full route reaches the actual Apostle');
for(const [id,kind,count] of [['black-claw','Black Claw',1],['stars','Death Star',6],['palms','Death Palm',4],['four-hands','Four Hands of Judgment',4],['wings','Shadow Wings',3],['harvest','Soul Harvest',1]]){
 await preview.select(id);assert.equal(state().raid.hazards.filter(h=>h.kind===kind).length,count);
}
await preview.select('chains');assert.equal(state().raid.chains.length,2);assert(state().raid.chains.some(c=>c.firstId==='hero'||c.secondId==='hero'));
await preview.select('death-marks');assert.equal(state().raid.members.find(p=>p.id==='hero').marks,4);await play();advance(1600);assert.equal(state().self.hp,1,'practice prevents the fifth Mark execution');
await preview.command({type:'practice',enabled:false});await preview.select('death-marks');await play();advance(1600);assert.equal(state().self.hp,0,'real fifth Mark executes with practice disabled');
await preview.command({type:'practice',enabled:true});
await preview.select('sermon');const boss=state().enemies[0],hp=boss.hp;await attack(boss.id);assert.equal(state().enemies[0].hp,hp,'paused attacks cannot resolve');
await play();await attack(boss.id);assert.equal(state().enemies[0].hp,hp,'14m exceeds real13.5m Quick Shot range');
await preview.command({type:'pause',paused:true});await move(0,10);await play();await attack(boss.id);assert.equal(state().enemies[0].hp,hp-12000);
await attack(boss.id);assert.equal(state().enemies[0].hp,hp-12000,'normal550ms cooldown blocks spam');
await preview.command({type:'pause',paused:true});await move(999,999);assert(state().self.x<=34&&state().self.z<=34,'movement stays inside raid bounds');
await preview.select('clones');const copies=state().enemies;assert.equal(copies.length,4);
const fake=copies.find(e=>e.model==='apostle-clone'),real=copies.find(e=>e.model==='horned-apostle');await move(fake.x,fake.z);await play();await attack(fake.id);assert.equal(state().enemies.find(e=>e.id===fake.id).hp,fake.hp);
await preview.command({type:'pause',paused:true});await move(real.x,real.z);await play();advance(600);await attack(real.id);advance(600);await attack(real.id);
assert(!state().enemies.some(e=>e.model==='apostle-clone'),'real two-percent burst removes all fake copies');
await preview.select('black-sun');assert.equal(state().raid.crystalsRemaining,4);assert.equal(state().raid.members[0].marks,3);
for(const crystal of state().enemies.filter(e=>e.raidVisual==='crystal')){
 await preview.command({type:'pause',paused:true});await move(crystal.x,crystal.z);await play();advance(600);await attack(crystal.id);
}
assert.equal(state().raid.crystalsRemaining,0);assert(state().raid.members.every(m=>m.marks===0),'four crystals cleanse the actual Mark state');
await preview.select('suits');const assigned=state().raid.members.find(m=>m.id==='hero').suit;
const positions={spade:{x:0,z:21},club:{x:21,z:0},diamond:{x:0,z:-21},heart:{x:-21,z:0}};await move(positions[assigned].x,positions[assigned].z);await play();advance(10100);
assert.equal(state().raid.phase,'wings');assert(state().self.hp>0,'matching suit survives real Judgment');
await preview.select('death-realm-shadow');assert.equal(state().raid.plane,'shadow');assert.equal(state().raid.phaseEndsAt-state().now,60000);
let guardian=state().enemies[0];assert(guardian.raidShielded);await move(guardian.x,guardian.z);await play();await attack(guardian.id);assert.equal(state().enemies[0].hp,guardian.hp,'real Soul Shield prevents guardian damage');
await preview.command({type:'pause',paused:true});await preview.command({type:'plane',plane:'arena'});assert.equal(state().raid.plane,'arena');
for(const shield of state().enemies.filter(e=>e.raidVisual==='shield')){await move(shield.x,shield.z);await play();advance(600);await attack(shield.id);await preview.command({type:'pause',paused:true});}
await preview.command({type:'plane',plane:'shadow'});assert(state().enemies.every(e=>!e.raidShielded),'destroyed shields unprotect the matching guardians');
for(const foe of state().enemies){await move(foe.x,foe.z);await play();for(let hit=0;hit<4;hit++){advance(600);await attack(foe.id);}await preview.command({type:'pause',paused:true});}
await play();advance(16000);assert.equal(state().raid.phase,'wings','all guardians and bot-occupied seals complete the real split encounter');
await preview.select('incarnate');assert.equal(state().enemies[0].model,'apostle-incarnate');assert.equal(state().raid.enrageEndsAt-state().now,90000);
await play();advance(90100);assert.equal(state().raid.phase,'wiped','practice cannot bypass the real absolute enrage');
await preview.select('wipe');assert.equal(state().raid.phase,'wiped');assert.equal(state().enemies.length,0);assert(state().raid.members.every(m=>m.hp===m.maxHp&&!m.ready));
await preview.select('completion');assert.equal(state().raid.phase,'completed');assert.equal(state().raid.result.rewards.length,9);assert(state().raid.result.saved);assert.equal(state().self.raidProgress.clears,1);
await preview.command({type:'restart'});assert.equal(state().self.raidProgress.clears,1,'restart creates a fresh ephemeral collection');

let server;const sockets=[];
async function until(check,label){for(let i=0;i<100;i++){const result=check();if(result)return result;await delay(20);}throw Error(`Timed out: ${label}`);}
async function connect(port){const ws=new WebSocket(`ws://127.0.0.1:${port}/raid-preview-ws`),client={ws,messages:[]};sockets.push(ws);ws.on('message',raw=>client.messages.push(JSON.parse(raw)));await once(ws,'open');await until(()=>client.messages.length,'initial snapshot');return client;}
try{
 server=await startRaidPreviewServer({port:0});const origin=`http://127.0.0.1:${server.port}`;
 assert.deepEqual(await (await fetch(`${origin}/preview-health`)).json(),{localOnly:true,ephemeral:true});
 const page=await (await fetch(`${origin}/raid-preview.html`)).text(),module=await (await fetch(`${origin}/src/raid-preview.ts`)).text();
 assert(!page.includes('/@vite/client')&&!module.includes('/@vite/client'),'preview never injects the disabled Vite HMR client');
 assert(page.includes('/src/raid-preview.css'),'preview styles load directly without an HMR module');
 const a=await connect(server.port),b=await connect(server.port);a.ws.send(JSON.stringify({type:'select',id:'black-sun'}));await until(()=>a.messages.at(-1).mechanicId==='black-sun','WS mechanic selection');
 assert.equal(b.messages.at(-1).mechanicId,'full-route','browser sessions do not share raid state');
 a.ws.send(JSON.stringify({type:'move',x:10,z:14}));await until(()=>a.messages.at(-1).self.x>0,'paused movement');
 assert(a.messages.at(-1).self.x<10,'movement is speed-limited, not teleportation');
 a.ws.send(JSON.stringify({type:'practice',enabled:false}));await until(()=>a.messages.at(-1).practice===false,'WS practice toggle');
 a.ws.send(JSON.stringify({type:'pause',paused:false}));await until(()=>a.messages.at(-1).paused===false,'WS playback');
 const foreign=new WebSocket(`ws://127.0.0.1:${server.port}/raid-preview-ws`,{origin:'https://example.com'});foreign.on('error',()=>{});await once(foreign,'close').catch(()=>{});assert.notEqual(foreign.readyState,WebSocket.OPEN,'foreign origins cannot control the preview');
 console.log(`PASS raid preview: ${PREVIEW_MECHANICS.length} real scenarios, 24 creatures, six cleared chambers/Morgrath/real gate progression, paused timers, normal attacks, Apostle mechanics, nine rewards and isolated loopback WebSockets.`);
}finally{for(const socket of sockets)socket.terminate();await server?.close();}
