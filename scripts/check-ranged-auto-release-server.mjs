import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear } from '../src/progression.ts';
import { spellsForClass, defaultHotbar } from '../src/spells.ts';
import { AUTO_ATTACKS, autoAttackTiming } from '../src/auto-attacks.ts';
import { OVERWORLD_SPAWNS, canTraverse, overworldSpawnAllowed, regionAt } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';

// Real WebSockets and combat ticks, using a current, dry overworld spawn rather than old city coordinates.
const base=OVERWORLD_SPAWNS.find(enemy=>enemy.zone==='greenwood'&&enemy.kind==='moss-slime'
  &&canTraverse(enemy,{x:enemy.x,z:enemy.z-16})&&!waterAt(enemy.x,enemy.z-16)
  &&overworldSpawnAllowed({x:enemy.x+5,z:enemy.z},'greenwood'));
assert(base,'the current overworld has a clear ranged-combat fixture');
const directory=mkdtempSync(join(tmpdir(),'mossvale-ranged-release-')),originalSlime={...MONSTERS['moss-slime']},realNow=Date.now;
let clock=realNow(),game,socket,snapshot,messages=[];Date.now=()=>clock;
const until=async(fn,label)=>{const deadline=realNow()+5000;while(realNow()<deadline){const result=fn();if(result)return result;await delay(10);}throw Error(`Timed out: ${label}; ${JSON.stringify(messages.filter(message=>message.type==='event').slice(-3))}`);};
const tick=async(time)=>{
  assert(Number.isSafeInteger(time),'Date.now uses whole milliseconds');assert(time>=clock);
  const before=snapshot;clock=time;
  await until(()=>snapshot!==before&&snapshot?.serverTime===time,`fresh ranged snapshot at ${time}`);
};
const send=message=>socket.send(JSON.stringify(message));
const player=()=>snapshot?.players[0],enemy=id=>snapshot?.enemies.find(enemy=>enemy.id===id),basics=()=>messages.filter(message=>message.type==='combat'&&message.basic);
async function stop(){socket?.terminate();socket=undefined;await game?.stop();game=undefined;}
async function fixture(className){
  await stop();clock+=30000;messages=[];snapshot=undefined;
  const token=randomBytes(32).toString('base64url'),id=randomUUID(),range=AUTO_ATTACKS[className].range,point={x:base.x,z:base.z-range-.1};
  const learnedSpells=spellsForClass(className).map(spell=>spell.id);
  const hero={id,name:'Ranged check',appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className},
    coordinateVersion:2,zone:regionAt(point.x,point.z),...point,rotation:0,level:60,maxHp:808,hp:808,xp:0,gold:0,characterCreated:true,talents:[],...starterGear(className),
    learnedSpells,hotbar:defaultHotbar(className,60,learnedSpells),inventory:{wood:0,crystal:0,potion:3,herb:0,relic:0},skills:{mining:0,woodcutting:0,herbalism:0},quest:{stage:0,kills:0,crystals:0}};
  writeFileSync(join(directory,'players.json'),JSON.stringify({[createHash('sha256').update(token).digest('hex')]:{characters:[hero]}}));
  const oldEnemies=ZONES[0].enemies;ZONES[0].enemies=[{id:'released-target',kind:'moss-slime',x:base.x,z:base.z},{id:'next-target',kind:'moss-slime',x:base.x+5,z:base.z}];
  Object.assign(MONSTERS['moss-slime'],{hp:10000,speed:0,aggroRange:0,damage:0});
  try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:directory,keycloak:null,databaseUrl:''});}finally{ZONES[0].enemies=oldEnemies;}
  const port=await game.start();socket=new WebSocket(`ws://127.0.0.1:${port}/socket`);
  socket.on('message',raw=>{const message=JSON.parse(raw);messages.push(message);if(message.type==='snapshot')snapshot=message;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  send({type:'join',token});await until(()=>messages.some(message=>message.type==='roster'),'roster');send({type:'selectCharacter',characterId:id});await until(()=>player(),'world entry');
  assert(Math.hypot(enemy('released-target').x-base.x,enemy('released-target').z-base.z)<.001,'fixture target was not relocated by town protection');
  send({type:'autoAttack',targetId:'released-target'});await until(()=>player().autoAttack,'attack armed');await tick(clock+5000);assert.equal(basics().length,0,'outside range never releases an attack');
  send({type:'move',zone:player().zone,x:base.x,z:base.z-range+.1,rotation:0});
  const release=await until(()=>basics()[0],'reentering range releases a real projectile');
  const initial=enemy('released-target').hp,timing=autoAttackTiming(className,range-.1),impact=release.startedAt+(timing.delay+timing.flight)*1000;
  return {range,initial,impact};
}
try{
  for(const className of ['Ranger','Mage'])for(const action of ['range','stop','spell','retarget']){
    const {range,initial,impact}=await fixture(className);
    if(action==='range'){
      send({type:'move',zone:player().zone,x:base.x,z:base.z-range-.1,rotation:0});
      await until(()=>Math.hypot(player().x-base.x,player().z-base.z)>range,'move beyond range after release');
    }else if(action==='stop'){
      send({type:'autoAttack',targetId:null});await until(()=>player().autoAttack===null,'stop after release');
    }else if(action==='retarget'){
      send({type:'autoAttack',targetId:'next-target'});await until(()=>player().autoAttack?.targetId==='next-target','retarget after release');
    }else{
      send({type:'attack',ability:className==='Ranger'?'power-shot':'pyroblast',targetId:'released-target'});await until(()=>player().casting,'spell begins after release');assert(player().casting.endsAt>impact,'manual spell remains in preparation at basic impact');
    }
    await tick(Math.floor(impact)-1);assert.equal(enemy('released-target').hp,initial,`${className}/${action}: no damage before projectile arrival`);
    await tick(Math.ceil(impact)+1);assert(enemy('released-target').hp<initial,`${className}/${action}: released projectile must deal positive damage`);
    assert.equal(basics().length,1,`${className}/${action}: the hit comes from the original projectile`);
    assert.equal(enemy('next-target').hp,enemy('next-target').maxHp,`${className}/${action}: the launched shot never changes its victim`);
  }
  console.log('PASS real ranged auto attacks: Ranger and Mage release on range entry, then retain positive original-target impact after range exit, stopping, casting and retargeting; no early damage or extra releases.');
}finally{await stop();Date.now=realNow;Object.assign(MONSTERS['moss-slime'],originalSlime);rmSync(directory,{recursive:true,force:true});}
