import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear, combatStats } from '../src/progression.ts';
import { spellsForClass, defaultHotbar } from '../src/spells.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { autoAttackTiming } from '../src/auto-attacks.ts';
import { canTraverse, regionAt } from '../src/realm.ts';
import { COLOSSEUM, isInColosseum } from '../src/colosseum.ts';

// Real realm combat, players, parties, geometry and damage events. Only saves and wall time are controlled.
const directory=mkdtempSync(join(tmpdir(),'mossvale-reworked-spells-')),realNow=Date.now,clients=[];
let clock=realNow(),game,port;Date.now=()=>clock;
async function until(fn,label){const deadline=realNow()+5000;while(realNow()<deadline){const result=fn();if(result)return result;await delay(10);}throw Error(`Timed out: ${label}`);}
async function tick(time){
  assert(Number.isSafeInteger(time),'Date.now uses whole milliseconds');assert(time>=clock);clock=time;
  // The realm emits snapshots after settling combat; timer expiry alone does not flush WebSocket delivery.
  await until(()=>clients.every(client=>client.snapshot?.serverTime>=time),`realm snapshots at ${time}`);
}
async function stop(){for(const client of clients.splice(0))client.socket.terminate();await game?.stop();game=undefined;}
async function connect(token,id){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),client={socket,id,messages:[]};clients.push(client);
  client.send=message=>socket.send(JSON.stringify(message));client.player=()=>client.snapshot?.players.find(player=>player.id===id);
  client.combats=()=>client.messages.filter(message=>message.type==='combat'&&message.playerId===id);
  client.damage=target=>client.messages.filter(message=>message.type==='damage'&&message.targetId===target.id&&!message.effect);
  socket.on('message',raw=>{const message=JSON.parse(raw);client.messages.push(message);if(message.type==='snapshot')client.snapshot=message;if(message.type==='roster')client.snapshot=undefined;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  client.send({type:'join',token});await until(()=>client.messages.some(message=>message.type==='roster'),'roster');
  client.send({type:'selectCharacter',characterId:id});await until(()=>client.player(),'world entry');return client;
}
async function fixture(className,offsets){
  await stop();clock+=30000;
  const heroes=offsets.map(([x,z],index)=>{
    const role=index===0?className:'Mage',learnedSpells=spellsForClass(role).map(spell=>spell.id),point={x:COLOSSEUM.x+x,z:COLOSSEUM.z+z};
    return {id:randomUUID(),name:`Spell check ${index}`,appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:role},
      coordinateVersion:2,zone:regionAt(point.x,point.z),...point,rotation:0,level:60,maxHp:808,hp:808,xp:0,gold:0,characterCreated:true,talents:[],...starterGear(role),
      learnedSpells,hotbar:defaultHotbar(role,60,learnedSpells),inventory:{wood:0,crystal:0,potion:3,herb:0,relic:0},skills:{mining:0,woodcutting:0,herbalism:0},quest:{stage:0,kills:0,crystals:0}};
  });
  assert(heroes.every(hero=>isInColosseum(hero)&&canTraverse(heroes[0],hero)),'all fixture targets stand on clear Colosseum sand');
  const tokens=heroes.map(()=>randomBytes(32).toString('base64url'));
  writeFileSync(join(directory,'players.json'),JSON.stringify(Object.fromEntries(heroes.map((hero,index)=>[createHash('sha256').update(tokens[index]).digest('hex'),{characters:[hero]}]))));
  game=createGameServer({port:0,host:'127.0.0.1',dataDir:directory,keycloak:null,databaseUrl:''});port=await game.start();
  const result=await Promise.all(tokens.map((token,index)=>connect(token,heroes[index].id)));
  await until(()=>result.every(client=>client.player()?.pvp&&client.snapshot.players.length===heroes.length),'all players visible and hostile');return result;
}
async function cast(caster,ability,target){
  const count=caster.combats().length,mark=caster.messages.length;caster.send({type:'attack',ability,...(target?{targetId:target.id}:{})});
  await until(()=>caster.player().casting||caster.combats().length>count||caster.messages.slice(mark).some(m=>m.type==='event'&&m.kind==='info'),`${ability} accepted`);
  const rejection=caster.messages.slice(mark).find(m=>m.type==='event'&&m.kind==='info');
  assert(!rejection,JSON.stringify({ability,rejection:rejection?.text,players:[caster,target].filter(Boolean).map(c=>({x:c.player().x,z:c.player().z,jump:c.player().jump}))}));
  if(caster.player().casting)await tick(caster.player().casting.endsAt);
  return until(()=>caster.combats()[count],`${ability} released`);
}
function impact(event,target,index=0){const point=event.targets.find(point=>point.id===target.id),gap=Math.hypot(point.x-event.from.x,point.z-event.from.z),timing=event.basic?autoAttackTiming('Ranger',gap):combatTiming(event.ability,gap,index);return event.startedAt+(timing.delay+timing.flight)*1000;}
const pvpDamage=(amount,target)=>Math.max(1,Math.round(Math.max(1,amount-Math.round(combatStats(target.player()).defense))*.2));
const worldGap=(a,b)=>Math.hypot(a.player().x-b.player().x,a.player().z-b.player().z,a.player().jump.y-b.player().jump.y);
async function verifyTicks(caster,event,targets,ticks,direct,periodic){
  const initial=new Map(targets.map(target=>[target.id,target.player().hp]));
  const schedule=targets.flatMap((target,index)=>Array.from({length:ticks+1},(_,tick)=>({target,tick,at:impact(event,target,index)+tick*4000/ticks}))).sort((a,b)=>a.at-b.at);
  for(const step of schedule){
    await tick(Math.floor(step.at)-1);assert.equal(caster.damage(step.target).length,step.tick,`${event.ability}: no early direct hit or tick ${step.tick}`);
    await tick(Math.ceil(step.at)+1);assert.equal(caster.damage(step.target).length,step.tick+1,`${event.ability}: exactly one scheduled hit at tick ${step.tick}`);
    assert.equal(caster.damage(step.target).at(-1).amount,pvpDamage(step.tick?periodic:direct,step.target),`${event.ability}: direct and periodic power reaches real HP after defense and PvP reduction`);
  }
  await tick(clock+3000);
  for(const target of targets){assert.equal(caster.damage(target).length,ticks+1,`${event.ability}: effect ends after its last tick`);assert.equal(target.player().hp,initial.get(target.id)-pvpDamage(direct,target)-ticks*pvpDamage(periodic,target));}
}
try{
  {
    // Keep exact range boundaries on equal-height authored sand. The central
    // decoration has small raised surfaces, so horizontal distance alone is not range.
    const [caster,anchor,boundary,outside]=await fixture('Ranger',[[5.98,-10],[21,-10],[26,-10],[15.99,-10]]);
    const count=caster.messages.length;caster.send({type:'attack',ability:'poison-cloud',targetId:anchor.id});
    await until(()=>caster.messages.slice(count).some(message=>message.type==='event'&&message.text.includes('Move closer')),'Poison Cloud rejects anchors beyond 15m');assert.equal(caster.combats().length,0);
    caster.send({type:'move',x:COLOSSEUM.x+6,z:COLOSSEUM.z-10,zone:caster.player().zone,rotation:0});await until(()=>Math.abs(caster.player().x-COLOSSEUM.x-6)<.001,'move to exact 15m casting range');
    await tick(clock+1);
    assert.equal(worldGap(caster,anchor),15,'Poison Cloud anchor is exactly 15m away in 3D');
    assert.equal(worldGap(anchor,boundary),5,'splash boundary is exactly 5m away in 3D');
    assert(worldGap(caster,boundary)>15&&worldGap(caster,outside)<15,'only the splash radius excludes the nearby outside target');
    assert(worldGap(anchor,outside)>=5.01&&worldGap(anchor,outside)<5.0101,'outside target remains 5.01m away, allowing its 12mm higher sand surface');
    const initialOutside=outside.player().hp,event=await cast(caster,'poison-cloud',anchor),power=combatStats(caster.player()).primaryDamage;
    assert.deepEqual(new Set(event.targets.map(target=>target.id)),new Set([anchor.id,boundary.id]),'Poison Cloud includes 5m splash beyond caster range and excludes 5.01m');
    await verifyTicks(caster,event,[anchor,boundary],4,Math.round(power*.5),Math.round(power*.4));assert.equal(outside.player().hp,initialOutside);
  }
  {
    const [caster,near,boundary,outside]=await fixture('Mage',[[2,0],[4,0],[8,0],[8.01,0]]),initialOutside=outside.player().hp;
    await tick(clock+1);
    assert.equal(worldGap(caster,boundary),6,'Flamewave boundary is exactly 6m away in 3D');
    assert(Math.abs(worldGap(caster,outside)-6.01)<1e-10,'outside target is 6.01m from the caster');
    const event=await cast(caster,'flamewave'),power=combatStats(caster.player()).specialDamage;
    assert.deepEqual(new Set(event.targets.map(target=>target.id)),new Set([near.id,boundary.id]),'Flamewave includes 6m and excludes 6.01m');
    await verifyTicks(caster,event,[near,boundary],3,Math.round(power*.7),Math.round(power*.35));assert.equal(outside.player().hp,initialOutside);
  }
  {
    const [caster,...targets]=await fixture('Ranger',[[0,0],[0,10],[1,10],[2,10],[3,10],[4,10]]);
    caster.send({type:'partyInvite',targetId:targets[0].id});const invite=await until(()=>targets[0].snapshot.partyInvites?.[0],'party invitation');targets[0].send({type:'partyAccept',invitationId:invite.id});
    await until(()=>caster.snapshot.party&&targets[0].snapshot.party,'party formed on PvP sand');
    const initial=targets.map(target=>target.player().hp),event=await cast(caster,'starfall-arrow',targets[0]);
    assert.deepEqual(event.targets.map(target=>target.id),targets.slice(0,4).map(target=>target.id),'Starfall hits its anchor and three closest splash targets, including a party member in world PvP');
    const at=impact(event,targets[0]);await tick(Math.floor(at)-1);targets.forEach((target,index)=>assert.equal(target.player().hp,initial[index],'Starfall has no pre-impact damage'));
    await tick(Math.ceil(at)+1);targets.forEach((target,index)=>assert.equal(target.player().hp,initial[index]-(index<4?pvpDamage(Math.round(combatStats(caster.player()).specialDamage*1.8),target):0),'Starfall caps post-defense PvP damage at four targets'));
  }
  {
    const [caster,target]=await fixture('Ranger',[[0,0],[0,13]]);caster.send({type:'autoAttack',targetId:target.id});const event=await until(()=>caster.combats()[0],'released arrow before target leaves');
    const initial=target.player().hp;target.send({type:'leaveWorld'});await until(()=>!target.player(),'target leaves world');target.send({type:'selectCharacter',characterId:target.id});await until(()=>target.player(),'target reenters with a new combat life');
    await tick(Math.ceil(impact(event,target))+1);assert.equal(target.player().hp,initial,'released arrow cannot survive target world exit/reentry');assert.equal(caster.damage(target).length,0);
  }
  console.log('PASS real reworked spells: Poison Cloud 15m/5m boundaries and direct+4 poison ticks, Flamewave 6m boundary and direct+3 burn ticks over4s, Starfall actual four-target PvP damage including a party member, and released-arrow target-life cancellation.');
}finally{await stop();Date.now=realNow;rmSync(directory,{recursive:true,force:true});}
