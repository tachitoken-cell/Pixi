import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { CHARACTER_CLASSES } from '../src/shared.ts';
import { AUTO_ATTACKS, autoAttackTiming, autoAttackDamage } from '../src/auto-attacks.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, spellsForClass, defaultHotbar, GLOBAL_ATTACK_MS } from '../src/spells.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { canTraverse, regionAt, WORLD_BOUNDS, toWorld } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';
import { BUILDING_CHAIRS, chairApproach, buildingAt } from '../src/buildings.ts';
import { DUNGEON_ENTRANCE } from '../src/adventure.ts';

// Real WebSockets/ticks. Only isolated saves, encounter placement/stats and wall time are controlled.
const dir=mkdtempSync(join(tmpdir(),'mossvale-auto-attacks-')),file=join(dir,'players.json'),realNow=Date.now,originalSlime={...MONSTERS['moss-slime']};
const base=ZONES[0].enemies.find(enemy=>enemy.id==='slime-1'),at=(x,z)=>({x:base.x+x,z:base.z+z}),clients=[];
let clock=realNow(),game,port;Date.now=()=>clock;
const hash=token=>createHash('sha256').update(token).digest('hex');
async function until(fn,label,timeout=5000){const end=realNow()+timeout;while(realNow()<end){const value=fn();if(value)return value;await delay(10);}throw Error(`Timed out: ${label}`);}
async function tick(time=clock){assert(time>=clock,'fixture clock is monotonic');clock=time;await delay(120);}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
function hero(className,extra={}) {const level=60,learnedSpells=spellsForClass(className).map(spell=>spell.id),point=extra.point||at(0,0);return {
 id:randomUUID(),name:'Auto attacker',appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className},
 coordinateVersion:2,zone:regionAt(point.x,point.z),...point,rotation:0,level,maxHp:808,hp:808,xp:0,gold:0,characterCreated:true,talents:[],...starterGear(className),
 learnedSpells,hotbar:defaultHotbar(className,level,learnedSpells),ridingRank:1,ownedMounts:['horse'],inventory:{wood:0,crystal:0,potion:3,herb:0,relic:0},
 skills:{mining:0,woodcutting:0,herbalism:0},quest:{stage:0,kills:0,crystals:0},...extra};}
async function connect(token){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[],token};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);
 c.enemy=()=>c.snapshot?.enemies.find(e=>e.id==='auto-target');c.basic=()=>c.messages.filter(m=>m.type==='combat'&&m.basic&&m.playerId===c.welcome?.id);c.spells=()=>c.messages.filter(m=>m.type==='combat'&&!m.basic&&m.playerId===c.welcome?.id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['snapshot','roster','welcome'].includes(m.type))c[m.type]=m;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token});await until(()=>c.roster,'roster');c.send({type:'selectCharacter',characterId:c.roster.characters[0].id});await until(()=>c.player(),'world entry');return c;
}
async function fixture(className,{point=at(0,0),target=at(0,2),hp=10000,speed=0,aggroRange=0,damage=8,playerExtra={},node}={}){
 await stop();clock+=30000;const token=randomBytes(32).toString('base64url'),p=hero(className,{point,...playerExtra});delete p.point;
 writeFileSync(file,JSON.stringify({[hash(token)]:{characters:[p]}}));
 const enemies=ZONES[0].enemies,nodes=ZONES[0].nodes;ZONES[0].enemies=[{id:'auto-target',kind:'moss-slime',...target}];if(node)ZONES[0].nodes=[{id:'auto-node',kind:'crystal',...node}];
 Object.assign(MONSTERS['moss-slime'],originalSlime,{hp,speed,aggroRange,damage});
 try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});}finally{ZONES[0].enemies=enemies;ZONES[0].nodes=nodes;}
 port=await game.start();return connect(token);
}
async function begin(c,targetId='auto-target'){
 const index=c.messages.length;c.send({type:'autoAttack',targetId});
 await until(()=>c.messages.slice(index).some(m=>m.type==='snapshot'&&m.players.find(p=>p.id===c.welcome.id)?.autoAttack?.targetId===targetId),'auto target acknowledged');
}
async function release(c){const count=c.basic().length;await begin(c);return until(()=>c.basic()[count],'automatic swing/projectile released');}
async function end(c){c.send({type:'autoAttack',targetId:null});await until(()=>c.player().autoAttack===null,'auto attack stops');}
async function move(c,point){assert(canTraverse(c.player(),point));c.send({type:'move',zone:c.player().zone,...point,rotation:0});await until(()=>Math.hypot(c.player().x-point.x,c.player().z-point.z)<.001,'valid manual step');}
function impact(c,event=c.basic().at(-1)){const t=event.targets[0],timing=autoAttackTiming(c.player().appearance.className,Math.hypot(t.x-event.from.x,t.z-event.from.z));return event.startedAt+(timing.delay+timing.flight)*1000;}
async function rejected(c,message,pattern){await tick(clock+701);const index=c.messages.length;c.send(message);const event=await until(()=>c.messages.slice(index).find(m=>m.type==='event'&&m.kind==='info'),'invalid auto request rejected');assert.match(event.text,pattern);}
try {
 for(const className of CHARACTER_CLASSES){
  const config=AUTO_ATTACKS[className],target=at(0,2),outside=at(0,2-config.range-.1),inside=at(0,2-config.range+.1);
  assert(canTraverse(outside,inside)&&canTraverse(inside,target)&&!waterAt(inside.x,inside.z));
  const c=await fixture(className,{point:outside,target,playerExtra:{learnedSpells:[],hotbar:defaultHotbar(className,60,[])}});
  const cooldowns=structuredClone(c.player().abilityCooldowns),gcd=c.player().globalCooldownUntil,initial=c.enemy().hp;
  await begin(c);await tick(clock+5000);assert.equal(c.basic().length,0,`${className}: no ranged exploit outside configured range`);assert(c.player().autoAttack);
  await move(c,inside);const first=await until(()=>c.basic()[0],`${className}: range reentry starts auto attacks`);
  assert.equal(first.ability,config.ability);assert.equal(first.castTimeMs,0);assert.equal(c.player().casting,null);assert.equal(c.enemy().hp,initial,'release does not apply damage');
  await tick(impact(c,first)-1);assert.equal(c.enemy().hp,initial,'no HP loss before actual contact');await tick(impact(c,first)+1);
  assert.equal(c.enemy().hp,initial-autoAttackDamage(className,combatStats(c.player())),`${className}: primary gear stats scale actual basic damage`);
  assert.equal(c.player().globalCooldownUntil,gcd,'auto attacks never consume the spell GCD');assert.deepEqual(c.player().abilityCooldowns,cooldowns,'starter spell cooldown stays independent');
  const due=c.player().autoAttack.nextAttackAt;
  for(let i=0;i<4;i++){c.send({type:'autoAttack',targetId:null});c.send({type:'autoAttack',targetId:'auto-target'});}await delay(120);
  assert.equal(c.player().autoAttack.nextAttackAt,due,'stop/start spam cannot reset a swing timer');assert.equal(c.basic().length,1);
  await tick(due-1);assert.equal(c.basic().length,1);await tick(due);assert.equal(c.basic().length,2);
  await tick(clock+config.cooldownMs*10);assert.equal(c.basic().length,3,'a delayed tick schedules one current swing, never a catchup burst');
  await end(c);const count=c.basic().length;await tick(clock+config.cooldownMs*2);assert.equal(c.basic().length,count,'null stops repetition');
  for(const request of [{type:'autoAttack'},{type:'autoAttack',targetId:1},{type:'autoAttack',targetId:''},{type:'autoAttack',targetId:'auto-target',cooldownMs:1}])await rejected(c,request,/Choose an enemy/);
  for(const targetId of ['rowan',c.player().id,'invented'])await rejected(c,{type:'autoAttack',targetId},/living enemy/);
 }
 // Released projectiles keep their hit when the attacker moves away; melee still checks contact range.
 for(const className of CHARACTER_CLASSES){
  const config=AUTO_ATTACKS[className],inside=at(0,2-config.range+.1),outside=at(0,2-config.range-.1);
  const c=await fixture(className,{point:inside}),initial=c.enemy().hp,event=await release(c);await move(c,outside);await tick(impact(c,event)+1);
  const expectedDamage=config.visual==='projectile'?autoAttackDamage(className,combatStats(c.player())):0;
  assert.equal(c.enemy().hp,initial-expectedDamage,`${className}: released projectiles land beyond range; melee swings require contact range`);assert(c.player().autoAttack,'out-of-range pauses rather than discards the chosen enemy');
  await tick(clock+config.cooldownMs*2);assert.equal(c.basic().length,1);await move(c,inside);await until(()=>c.basic().length===2,'returning to range resumes one attack');
 }
 // This actual board corner provides a clear release and a blocked impact within melee range.
 {
  const target={x:1.6,z:1.2},point={x:4.4,z:1.2},blocked={x:4.4,z:1.8};assert(canTraverse(point,target)&&canTraverse(point,blocked)&&!canTraverse(blocked,target));
  const c=await fixture('Knight',{target,point}),initial=c.enemy().hp,event=await release(c);await move(c,blocked);await tick(impact(c,event)+1);assert.equal(c.enemy().hp,initial,'shared solid blocks a previously released swing at contact');
  await tick(clock+5000);assert.equal(c.basic().length,1,'blocked line of sight pauses future attacks');await move(c,point);await until(()=>c.basic().length===2,'walking around obstruction resumes attacks');
 }
 // Spell acceptance cancels a pending basic, while each spell retains its own cast and cooldown.
 for(const className of CHARACTER_CLASSES){
  const c=await fixture(className),event=await release(c),initial=c.enemy().hp,spell=SPELLS[AUTO_ATTACKS[className].ability];
  c.send({type:'attack',ability:spell.id,targetId:'auto-target'});const accepted=await until(()=>c.player().casting||c.spells()[0],'normal spell accepted immediately after auto release');
  if(accepted.endsAt)assert.equal(accepted.endsAt-accepted.startedAt,spell.castTimeMs,'fixed preparation remains unchanged');
  assert.equal(c.player().globalCooldownUntil,clock+GLOBAL_ATTACK_MS,'only the normal spell starts GCD');
  if(spell.castTimeMs>0){await tick(impact(c,event)+1);assert.equal(c.enemy().hp,initial,'casting cancels pending basic damage');await tick(accepted.endsAt);}
  const cast=await until(()=>c.spells()[0],'normal spell release');const t=combatTiming(spell.id,2),when=cast.startedAt+(t.delay+t.flight)*1000;
  await tick(Math.max(clock,when+1));assert(c.enemy().hp<initial,'manual spell still deals impact damage');assert.equal(c.basic().length,1,'the spell release is not overwritten by another automatic swing');
  assert.equal(c.player().abilityCooldowns[spell.id],cast.startedAt+spell.cooldownMs);assert(c.player().autoAttack,'automatic targeting remains armed after the spell');
 }
 {
  const c=await fixture('Cleric',{playerExtra:{hp:400}});c.send({type:'attack',ability:'renew'});const cast=await until(()=>c.player().casting,'channel begins');await begin(c);assert.equal(c.player().casting.startedAt,cast.startedAt,'starting autos never cancels a channel');
  await tick(cast.endsAt);assert.equal(c.spells().length,3);assert.equal(c.basic().length,0,'channel ticks have priority over every automatic swing');
  await tick(c.player().autoAttack.nextAttackAt);assert.equal(c.basic().length,1,'auto resumes after the final channel release');
 }
 // Gathering and mounts pause, and another deliberate auto-start exits those activities.
 {
  const c=await fixture('Ranger',{node:at(1,0)}),initial=c.enemy().hp,event=await release(c);
  c.send({type:'gather',targetId:'auto-node'});await until(()=>c.player().gathering,'gather starts');await tick(impact(c,event)+1);assert.equal(c.enemy().hp,initial);assert.equal(c.basic().length,1);
  await begin(c);assert.equal(c.player().gathering,null,'explicit auto-start cancels gathering');await tick(c.player().autoAttack.nextAttackAt);assert.equal(c.basic().length,2);
  c.send({type:'mount',mount:'horse'});await until(()=>c.player().casting?.ability==='mount','mount preparation starts');await begin(c);assert.equal(c.player().casting,null,'explicit auto-start cancels mount preparation');assert.equal(c.player().travel.mount,null,'cancelled mount preparation stays on foot');
  c.send({type:'mount',mount:'horse'});const summon=await until(()=>c.player().casting?.ability==='mount'&&c.player().casting,'mount preparation');await tick(summon.endsAt);assert.equal(c.player().travel.mount,'horse');const before=c.enemy().hp;await tick(clock+10000);assert.equal(c.enemy().hp,before);assert.equal(c.basic().length,2,'mounted player does not auto attack');
  await begin(c);assert.equal(c.player().travel.mount,null,'explicit auto-start dismounts');await until(()=>c.basic().length===3,'dismount resumes one attack');
 }
 {
  const chair=BUILDING_CHAIRS.find(chair=>{const point=chairApproach(chair);return buildingAt(point.x,point.z)?.zone==='greenwood'&&canTraverse(point,point)&&canTraverse(point,{x:point.x+Math.sin(chair.rotation)*1.5,z:point.z+Math.cos(chair.rotation)*1.5});});assert(chair);
  const point=chairApproach(chair);
  const target={x:point.x+Math.sin(chair.rotation)*1.5,z:point.z+Math.cos(chair.rotation)*1.5};assert(canTraverse(point,target));assert.equal(buildingAt(point.x,point.z)?.id,chair.buildingId);
  const c=await fixture('Knight',{point,target}),event=await release(c),initial=c.enemy().hp;c.send({type:'sit',chairId:chair.id});await until(()=>c.player().seated,'seated at a real chair');await tick(impact(c,event)+1);assert.equal(c.enemy().hp,initial);
  await tick(clock+10000);assert.equal(c.basic().length,1,'seated player cannot auto attack');await begin(c);assert.equal(c.player().seated,null);await until(()=>c.basic().length===2,'explicit attack stands and resumes');
 }
 {
  const point={x:WORLD_BOUNDS.minX+4,z:0};assert(waterAt(point.x,point.z));const c=await fixture('Mage',{point,target:{x:point.x+1,z:point.z}});await begin(c);await tick(clock+10000);assert.equal(c.basic().length,0,'swimming blocks automatic attacks');
 }
 // Mobs can chase into range; no automatic player movement is introduced.
 {
  const c=await fixture('Knight',{target:at(0,4.2),speed:originalSlime.speed,aggroRange:7});const origin={x:c.player().x,z:c.player().z};await begin(c);
  for(let i=0;i<12&&!c.basic().length;i++)await tick(clock+200);assert(c.basic().length);assert(c.enemy().z<base.z+4.2,'normal monster chase enters melee range');assert.deepEqual({x:c.player().x,z:c.player().z},origin);
 }
 // Death/loot uses the existing reward pipeline and never retargets a respawned life.
 {
  const c=await fixture('Knight',{hp:1}),event=await release(c);await tick(impact(c,event)+1);assert.equal(c.enemy().alive,false);assert.equal(c.player().autoAttack,null);assert.equal(c.player().xp,originalSlime.xp);assert(c.snapshot.loot.some(drop=>drop.enemyId==='auto-target'&&drop.ownerId===c.player().id));
  await tick(clock+15000);assert(c.enemy().alive);assert.equal(c.basic().length,1,'dead target does not silently re-arm on respawn');
 }
 {
  const c=await fixture('Cleric',{target:at(0,1),aggroRange:7,damage:100,playerExtra:{hp:1}});const event=await release(c),initial=c.enemy().hp;await tick(impact(c,event)+1000);assert.equal(c.player().hp,0);assert.equal(c.player().autoAttack,null);assert.equal(c.enemy().hp,initial,'an earlier fatal monster hit cancels player auto impact');
 }
 {
  const c=await fixture('Mage'),event=await release(c),due=c.player().autoAttack.nextAttackAt,initial=c.enemy().hp,id=c.player().id;
  c.send({type:'leaveWorld'});await until(()=>c.roster?.characters[0]?.autoAttack===null,'roster has no auto targeting');c.send({type:'selectCharacter',characterId:id});await until(()=>c.player().autoAttack===null,'reentry clears target');await begin(c);assert.equal(c.player().autoAttack.nextAttackAt,due,'world reentry cannot reset auto cadence');
  await tick(impact(c,event)+1);assert.equal(c.enemy().hp,initial,'the old life has no surviving queued impact');await tick(due);assert.equal(c.basic().length,2);
  c.socket.close();await until(()=>c.socket.readyState===WebSocket.CLOSED,'disconnect');const again=await connect(c.token);assert.equal(again.player().autoAttack,null,'disconnect never resumes attacking implicitly');
  await tick(clock+5000);assert.equal(again.enemy().hp,initial,'disconnect clears its in-flight basic hit');await delay(1200);assert.equal(JSON.parse(readFileSync(file,'utf8'))[hash(c.token)].characters[0].autoAttack,undefined,'auto targeting is transient, never character progression');
 }
 {
  const point=toWorld('hollow',DUNGEON_ENTRANCE),target={x:point.x,z:point.z+2};const c=await fixture('Mage',{point,target});await begin(c);c.send({type:'dungeonEnter'});await until(()=>c.player().instanceId,'enter dungeon');assert.equal(c.player().autoAttack,null,'instance entry clears the old-world target');await rejected(c,{type:'autoAttack',targetId:'auto-target'},/living enemy/);
 }
 console.log('PASS auto attacks: all four classes, range/LOS at release, ranged flight and melee contact, independent cadence/GCD, spam and reentry guards, one attack after delays, spell/channel priority, activity pauses, chase, life/instance/disconnect cleanup, and shared damage/threat/loot.');
} finally {await stop();Date.now=realNow;Object.assign(MONSTERS['moss-slime'],originalSlime);rmSync(dir,{recursive:true,force:true});}
