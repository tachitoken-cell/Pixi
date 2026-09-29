import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { BUILDING_BEDS, buildingAt } from '../src/buildings.ts';
import { RESOURCE_SITES, WILD_BIOMES, WORLD_CURIOS, DREAM_DURATION_MS } from '../src/world-features.ts';
import { WORLD_GATHERING_NODES } from '../src/gathering-nodes.ts';
import { RESOURCE_TYPES, skillProgress } from '../src/skills.ts';
import { canTraverse, regionAt, WORLD_COLLIDERS, WORLD_BOUNDS, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { surfaceAt, waterAt } from '../src/landscape.ts';
import { findPath } from '../src/navigation.ts';
import { dungeonColliders, dungeonBounds, dungeonLayout, dungeonRoomPortalOpen } from '../src/dungeon.ts';
import { starterGear } from '../src/progression.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { SPELLS } from '../src/spells.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { moveJump } from '../src/jumping.ts';
import { collisionRouteAllowed } from '../src/collision-context.ts';
import { WALK_SPEED } from '../src/travel.ts';

for (const biome of WILD_BIOMES) {
  assert.equal(surfaceAt(biome.x,biome.z).regionId,biome.id);
  assert(OVERWORLD_SPAWNS.filter(enemy=>enemy.id.startsWith(`${biome.id}-`)).length===8);
}
for (const site of RESOURCE_SITES) {
  const nodes=WORLD_GATHERING_NODES.filter(node=>node.siteId===site.id);
  assert(nodes.length>=3, `${site.id} has a usable dense deposit`);
  for(const node of nodes){assert(site.resources.includes(node.kind));assert.equal(node.respawnMs,10000);assert(canTraverse(node,node));assert(!waterAt(node.x,node.z));}
  const entry={x:site.x,z:site.z+16}; assert(canTraverse(entry,entry),`${site.id} has a clear sign and entrance`);
  assert(nodes.some(node=>findPath(entry,node,WORLD_COLLIDERS,WORLD_BOUNDS).length),`${site.id} has a route from its sign to a resource`);
}
for(const curio of WORLD_CURIOS)assert(canTraverse(curio,curio));
const shoals=WORLD_GATHERING_NODES.filter(node=>RESOURCE_TYPES[node.kind].skill==='fishing');
for(const kind of ['brook-shoal','silver-shoal','glacial-shoal','moonfin-shoal'])assert(shoals.some(node=>node.kind===kind));
for(const node of shoals){assert(!waterAt(node.x,node.z));assert(waterAt(node.waterX,node.waterZ));assert(canTraverse(node,node));}
const bed=BUILDING_BEDS.find(bed=>bed.zone==='greenwood'&&canTraverse(bed.approach,bed.approach)&&buildingAt(bed.approach.x,bed.approach.z)?.id===bed.buildingId);
assert(bed,'a playable bed exists');
const blocked=[];for(let x=bed.x-3;x<=bed.x+3;x+=.2)for(let z=bed.z-3;z<=bed.z+3;z+=.2)if(Math.hypot(x-bed.x,z-bed.z)<=3&&buildingAt(x,z)?.id===bed.buildingId&&canTraverse({x,z},{x,z})&&!canTraverse({x,z},bed.approach))blocked.push({x,z});assert(blocked.length,'bed has a blocked approach for the LOS check');
const trout=shoals.find(node=>node.kind==='brook-shoal'), silver=shoals.find(node=>node.kind==='silver-shoal');
const dir=mkdtempSync(join(tmpdir(),'mossvale-world-feedback-')),file=join(dir,'players.json'),realNow=Date.now, monsters=structuredClone(MONSTERS), clients=[];
let now=realNow(),game,port,rolls=[0,0];Date.now=()=>now;
const hero=(name,point,extra={})=>({id:randomUUID(),name,coordinateVersion:2,zone:regionAt(point.x,point.z),x:point.x,z:point.z,rotation:0,characterCreated:true,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},...starterGear('Ranger'),
  onboarding:{version:1,looted:true,bagViewed:true,gearViewed:true,completed:true},talents:[],learnedSpells:['arrow'],level:1,xp:0,gold:0,hp:70,maxHp:100,carriedItems:{},inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},
  quest:{chapter:0,stage:0,kills:0,crystals:0,progress:{'grove-slimes':0,'grove-crystals':0},completed:false,ending:null},...extra});
const heroes=[hero('Dream walker',bed.approach),hero('Trout fisher',trout),hero('Second fisher',trout),hero('Fishing novice',silver),hero('Night walker',bed.approach),hero('Bag tester',trout,{carriedItems:Object.fromEntries(Object.keys(LOOT_ITEMS).filter(id=>id!=='brook-trout').slice(0,16).map(id=>[id,1]))}),hero('Blocked sleeper',blocked[0])];
Object.assign(heroes[4],{appearance:{...heroes[4].appearance,className:'Mage'},...starterGear('Mage'),learnedSpells:['fireball']});
const tokens=heroes.map(()=>randomBytes(32).toString('base64url')),key=token=>createHash('sha256').update(token).digest('hex');
async function until(fn,label){const end=realNow()+5000;while(realNow()<end){const value=fn();if(value)return value;await delay(12);}throw Error(`Timed out: ${label}`);}
async function tick(ms=0){const frames=clients.filter(c=>c.socket.readyState===WebSocket.OPEN&&c.snapshot).map(c=>[c,c.snapshot]);now+=ms;await until(()=>frames.every(([c,before])=>c.socket.readyState!==WebSocket.OPEN||c.snapshot!==before&&c.snapshot.serverTime===now),'fresh world snapshots');}
async function connect(i){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===heroes[i].id);socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(m.type==='snapshot')c.snapshot=m;});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token:tokens[i],characterId:heroes[i].id});await until(()=>c.player(),`join ${i}`);return c;}
async function rejected(c,message,pattern){const start=c.messages.length;c.send(message);await until(()=>c.messages.slice(start).some(m=>m.type==='event'&&pattern.test(m.text)),`reject ${JSON.stringify(message)}`);}
function physicalDreamPath(c,goal){
  const start=c.player(),d=c.snapshot.dungeon,key=`dungeon-${d.kind}:${d.id}`,step=.4;
  const pending=[{x:start.x,z:start.z,jump:{...start.jump},cost:0,parent:null}],seen=new Set(),best=new Map();
  const cell=node=>`${Math.round((node.x-start.x)/step)},${Math.round((node.z-start.z)/step)},${Math.round(node.jump.y*10)}`;
  best.set(cell(pending[0]),0);
  const score=node=>node.cost+Math.hypot(node.x-goal.x,node.z-goal.z);
  for(let visited=0;pending.length&&visited<10000;){
    pending.sort((a,b)=>score(a)-score(b));const node=pending.shift();
    const id=cell(node);
    if(seen.has(id))continue;seen.add(id);visited++;
    if(Math.hypot(node.x-goal.x,node.z-goal.z)<.8&&moveJump({...node.jump},node,goal,true,key)){
      const route=[goal];for(let at=node;at.parent;at=at.parent)route.unshift({x:at.x,z:at.z});return route;
    }
    for(const dx of [-1,0,1])for(const dz of [-1,0,1]){
      if(!dx&&!dz)continue;const to={x:node.x+dx*step,z:node.z+dz*step},jump={...node.jump};
      if(!collisionRouteAllowed(node,to,d.id,d.kind)||!moveJump(jump,node,to,true,key)||!jump.grounded)continue;
      const next={...to,jump,cost:node.cost+Math.hypot(dx,dz)*step,parent:node},id=cell(next);
      if(seen.has(id)||next.cost>=(best.get(id)??Infinity)-1e-9)continue;
      best.set(id,next.cost);pending.push(next);
    }
  }
  throw Error(`No physical dream route from ${start.x},${start.z} to ${goal.x},${goal.z}`);
}
async function walk(c,goal){
  const d=c.snapshot.dungeon,bounds=d?dungeonBounds(d.kind):WORLD_BOUNDS;
  const colliders=d?dungeonColliders(d.clearedStages,d.objects.filter(o=>o.activated).map(o=>o.id),d.kind):WORLD_COLLIDERS;
  let path=findPath(c.player(),goal,colliders,bounds);
  if(!path.length&&d){
    const layout=dungeonLayout(d.kind),roomAt=point=>layout.rooms.find(room=>Math.abs(point.x-room.x)<room.width/2&&Math.abs(point.z-room.z)<room.depth/2)?.id;
    const start=roomAt(c.player()),target=roomAt(goal),queue=[{room:start,route:[]}],seen=new Set([start]);
    let route;
    for(const step of queue){
      if(step.room===target){route=step.route;break;}
      for(const portal of layout.portals.filter(portal=>portal.roomId===step.room&&(d.dream||dungeonRoomPortalOpen(portal,d.clearedStages,d.objects.filter(object=>object.activated).map(object=>object.id))))){
        if(!seen.has(portal.targetRoomId)){seen.add(portal.targetRoomId);queue.push({room:portal.targetRoomId,route:[...step.route,portal]});}
      }
    }
    assert(route?.length,`open room portal route ${d.kind}: ${start} -> ${target}`);
    for(const portal of route){
      await walk(c,portal);c.send({type:'dungeonInteract',targetId:portal.id});
      await until(()=>Math.hypot(c.player().x-portal.destination.x,c.player().z-portal.destination.z)<.01,`room teleport ${portal.id}`);
    }
    return walk(c,goal);
  }
  assert(path.length,'a route exists');
  if(d)path=physicalDreamPath(c,goal);
  for(const point of path)while(Math.hypot(c.player().x-point.x,c.player().z-point.z)>.05){
    const p=c.player(),gap=Math.hypot(point.x-p.x,point.z-p.z),step=Math.min(.4,gap),next={x:p.x+(point.x-p.x)*step/gap,z:p.z+(point.z-p.z)*step/gap};
    assert(d?collisionRouteAllowed(p,next,d.id,d.kind)&&moveJump({...p.jump},p,next,true,`dungeon-${d.kind}:${d.id}`):canTraverse(p,next,colliders,bounds),'each movement segment clears the actual body geometry and stays inside its chamber');
    now+=Math.ceil(step/WALK_SPEED*1000)+20;c.send({type:'move',zone:p.zone,...next,rotation:0});await until(()=>Math.hypot(c.player().x-next.x,c.player().z-next.z)<.05,'walk');
  }
}
try{
  for(const monster of Object.values(MONSTERS))Object.assign(monster,{aggroRange:0,speed:0});
  writeFileSync(file,JSON.stringify(Object.fromEntries(heroes.map((p,i)=>[key(tokens[i]),{characters:[p]}]))));
  const start=async()=>{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'',dreamRandomInt:()=>rolls.shift()??99});port=await game.start();};
  await start();const [dream,fisher,rival,novice,night,full,blockedSleeper]=await Promise.all(heroes.map((_,i)=>connect(i)));
  assert.equal(fisher.player().skills.fishing,0,'legacy characters gain fishing without resetting other progress');
  await rejected(fisher,{type:'interact',targetId:bed.id},/Approach a bed/);
  await rejected(blockedSleeper,{type:'interact',targetId:bed.id},/Approach a bed/);
  await rejected(novice,{type:'gather',targetId:silver.id},/requires Fishing level 10/);
  fisher.send({type:'gather',targetId:trout.id});const cast=await until(()=>fisher.player().gathering,'cast a line');assert.equal(cast.skill,'fishing');
  await rejected(rival,{type:'gather',targetId:trout.id},/Another traveler/);
  await tick(cast.endsAt-now-1);assert.equal(fisher.player().carriedItems['brook-trout'],undefined);
  await tick(2);await until(()=>fisher.player().carriedItems['brook-trout']===1,'catch fish');assert(skillProgress(fisher.player().skills.fishing).level>1);
  assert(!fisher.snapshot.nodes.find(n=>n.id===trout.id).available,'shoal depleted for everyone');
  fisher.send({type:'useItem',itemId:'brook-trout'});await until(()=>!fisher.player().carriedItems['brook-trout'],'eat caught fish');assert.equal(fisher.player().hp,100);
  await tick(14001);full.send({type:'gather',targetId:trout.id});const fullCast=await until(()=>full.player().gathering,'full bag fishing cast');await tick(fullCast.endsAt-now+1);await until(()=>!full.player().gathering,'full bag completion');assert(!full.player().carriedItems['brook-trout']);assert(full.snapshot.nodes.find(n=>n.id===trout.id).available,'full bags do not consume the shared shoal');
  fisher.send({type:'gather',targetId:trout.id});await until(()=>fisher.player().gathering,'cast again');fisher.send({type:'cancelGather'});await until(()=>!fisher.player().gathering,'cancel line');assert(fisher.snapshot.nodes.find(n=>n.id===trout.id).available);
  dream.send({type:'partyInvite',targetId:heroes[4].id});const invite=await until(()=>night.snapshot.partyInvites[0],'invite fellow sleeper');night.send({type:'partyAccept',invitationId:invite.id});await until(()=>night.snapshot.party,'party joined');
  dream.send({type:'interact',targetId:bed.id});await until(()=>dream.snapshot.dungeon?.dream,'pleasant dream');assert.equal(dream.snapshot.dungeon.dream.kind,'pleasant');assert.equal(dream.snapshot.enemies.length,0);assert.equal(dream.snapshot.dungeon.dream.endsAt-now,DREAM_DURATION_MS);
  await until(()=>!night.snapshot.players.some(p=>p.id===heroes[0].id),'dreams are private instances');
  const cache=dream.snapshot.dungeon.objects.find(o=>o.kind==='chest');await walk(dream,{x:cache.x,z:cache.z+1.6});
  dream.send({type:'dungeonInteract',targetId:cache.id});const drop=await until(()=>dream.snapshot.loot.find(d=>d.sourceObjectId===cache.id),'dream cache');assert.equal(drop.items[0].itemId,'dream-petal');
  dream.send({type:'loot',targetId:drop.id});await until(()=>dream.player().carriedItems['dream-petal']===1,'collect keepsake');
  assert(!night.player().carriedItems['dream-petal'],'sleeping never grants party members rewards');
  await rejected(dream,{type:'dungeonInteract',targetId:cache.id},/Defeat the nearby guardians/);assert.equal(dream.snapshot.loot.filter(d=>d.sourceObjectId===cache.id).length,0,'cache cannot be duplicated');
  await tick(DREAM_DURATION_MS);await until(()=>!dream.player().instanceId,'automatic wake');assert.equal(dream.player().x,bed.approach.x);assert.equal(dream.player().z,bed.approach.z);assert.equal(dream.player().carriedItems['dream-petal'],1);assert.equal(dream.player().hp,100);
  await rejected(dream,{type:'interact',targetId:bed.id},/well rested/);
  rolls=[0,1];night.send({type:'interact',targetId:bed.id});await until(()=>night.snapshot.dungeon?.dream?.kind==='nightmare','nightmare entry');assert.equal(night.snapshot.enemies.length,4);assert(night.snapshot.enemies.every(e=>e.level===night.player().level));
  night.send({type:'dungeonExit'});await until(()=>!night.player().instanceId,'wake early at entrance');assert.equal(night.player().x,bed.approach.x);
  await tick(600001);rolls=[0,1];night.send({type:'interact',targetId:bed.id});await until(()=>night.snapshot.dungeon?.dream,'second nightmare');
  let spider=night.snapshot.enemies[0];
  await walk(night,{x:spider.x,z:spider.z+1});
  // A delayed tick may contain valid pre-deadline damage and invalid later casts or DOT ticks.
  const deadline=night.snapshot.dungeon.dream.endsAt, timing=combatTiming('fireball',1), flightMs=(timing.delay+timing.flight)*1000;
  await tick(deadline-now-SPELLS.fireball.castTimeMs-flightMs-500);
  night.send({type:'attack',ability:'fireball',targetId:spider.id});const burnCast=await until(()=>night.player().casting,'dream fireball');
  await tick(burnCast.endsAt-now);await tick(flightMs+1);
  assert(night.snapshot.enemies.find(e=>e.id===spider.id).damageOverTime.length,'a valid hit applies burn before the dream ends');
  const damageCount=night.messages.filter(m=>m.type==='damage'&&m.targetId===spider.id).length, xpBefore=night.player().xp;
  assert.equal(damageCount,1);
  const releaseCount=night.messages.filter(m=>m.type==='combat'&&m.playerId===heroes[4].id).length;
  night.send({type:'attack',ability:'fireball',targetId:spider.id});await until(()=>night.player().casting,'cast crossing the dream deadline');
  await tick(deadline-now+5000);await until(()=>!night.player().instanceId,'expired combat dream wakes');
  assert.equal(night.messages.filter(m=>m.type==='damage'&&m.targetId===spider.id).length,damageCount,'no burn tick or projectile lands after dream expiry');
  assert.equal(night.messages.filter(m=>m.type==='combat'&&m.playerId===heroes[4].id).length,releaseCount,'a cast finishing after dream expiry never releases');
  assert.equal(night.player().xp,xpBefore,'expired dream damage cannot grant rewards');
  assert.deepEqual(night.player().damageOverTime,[]);
  await tick(600001);rolls=[0,1];night.send({type:'interact',targetId:bed.id});await until(()=>night.snapshot.dungeon?.dream,'nightmare death fixture');
  spider=night.snapshot.enemies[0];await walk(night,{x:spider.x,z:spider.z+1});
  Object.assign(MONSTERS['grove-spider'],{aggroRange:10,damage:500,range:4,attackRadius:3});
  for(let i=0;i<5&&night.player().instanceId;i++)await tick(2000);
  await until(()=>!night.player().instanceId,'death wakes the sleeper');assert.equal(night.player().hp,100);assert.equal(night.player().x,bed.approach.x);
  Object.assign(MONSTERS['grove-spider'],{aggroRange:0,damage:monsters['grove-spider'].damage,range:monsters['grove-spider'].range,attackRadius:monsters['grove-spider'].attackRadius});
  rolls=[0,0];dream.send({type:'interact',targetId:bed.id});await until(()=>dream.snapshot.dungeon?.dream,'disconnect dream');
  dream.socket.close();await delay(180);const reconnected=await connect(0);assert.equal(reconnected.player().instanceId,null);assert.equal(reconnected.player().x,bed.approach.x);assert.equal(reconnected.player().carriedItems['dream-petal'],1);
  await tick(600001);rolls=[0,0];reconnected.send({type:'interact',targetId:bed.id});await until(()=>reconnected.snapshot.dungeon?.dream,'restart while dreaming');
  const ready=reconnected.player().dreamRestReadyAt;await game.stop();game=null;
  const saved=JSON.parse(readFileSync(file,'utf8'));assert.equal(saved[key(tokens[0])].characters[0].dreamRestReadyAt,ready);assert.equal(saved[key(tokens[0])].characters[0].carriedItems['dream-petal'],1);assert.equal(saved[key(tokens[0])].characters[0].x,bed.approach.x);assert.equal(saved[key(tokens[0])].characters[0].zone,bed.zone);assert.equal(saved[key(tokens[1])].characters[0].skills.fishing,100);
  await start();const restored=await connect(0);assert.equal(restored.player().dreamRestReadyAt,ready);await rejected(restored,{type:'interact',targetId:bed.id},/well rested/);
  console.log(`PASS world feedback: ${WILD_BIOMES.length} biomes, ${RESOURCE_SITES.length} accessible rich sites, ${shoals.length} fishing spots, fish catch/eat/claims/cancel/full bags and legacy skills; private good/bad dreams, cache rewards, no duplicate claims, timed/early/death wake, delayed-tick combat expiry, distance/LOS, party isolation, disconnect, retained health/location/rewards and restart cooldown.`);
}finally{for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;for(const [id,monster]of Object.entries(monsters))Object.assign(MONSTERS[id],monster);rmSync(dir,{recursive:true,force:true});}
