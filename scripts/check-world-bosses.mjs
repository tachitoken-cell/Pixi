import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { WORLD_BOSSES, WORLD_BOSS, WORLD_BOSS_BERSERK_MS, MONSTERS, BASIC_ATTACK, monsterLevel, monsterStatsAtLevel } from '../src/bestiary.ts';
import { OVERWORLD_SPAWNS, canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { surfaceAt, waterAt, movementCost } from '../src/landscape.ts';
import { VILLAGES, VILLAGE_SAFE_RADIUS, townSpawnAllowed, insideVillageSafeArea } from '../src/settlements.ts';
import { inColosseumClearing } from '../src/colosseum.ts';
import { regionLevelRange } from '../src/region-levels.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, spellDamage } from '../src/spells.ts';
import { findPath } from '../src/navigation.ts';
import { WALK_SPEED } from '../src/travel.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';

assert.equal(WORLD_BOSS, WORLD_BOSSES[2]);
assert.deepEqual(WORLD_BOSSES.map(boss => MONSTERS[boss.kind].level), [10,20,30,40]);
assert.equal(new Set(WORLD_BOSSES.map(boss => boss.id)).size,4);
for (const boss of WORLD_BOSSES) {
  const home=OVERWORLD_SPAWNS.find(spawn=>spawn.id===boss.id),stats=MONSTERS[boss.kind],range=regionLevelRange(boss.regionId,boss.zone);
  assert(home?.worldBoss&&townSpawnAllowed(home));assert.deepEqual([home.x,home.z],[boss.x,boss.z],'authored boss home is already safe and never silently relocated');
  assert(stats.level>=range.min&&stats.level<=range.max);assert.equal(surfaceAt(home.x,home.z).regionId,boss.regionId);
  for (const regionId of ['greenwood','mistwood','missing']) assert.equal(monsterLevel(boss.kind,boss.zone,regionId,'fixed-boss'),stats.level);
  assert.equal(monsterStatsAtLevel(boss.kind,stats.level),stats,'authored boss stats are not multiplied again by frontier scaling');
  assert(VILLAGES.every(v=>Math.hypot(v.x-home.x,v.z-home.z)>boss.arenaRadius+VILLAGE_SAFE_RADIUS));
  assert(!OVERWORLD_SPAWNS.some(spawn=>!spawn.worldBoss&&Math.hypot(spawn.x-home.x,spawn.z-home.z)<=boss.arenaRadius+5));
  for(let x=-boss.arenaRadius;x<=boss.arenaRadius;x+=2)for(let z=-boss.arenaRadius;z<=boss.arenaRadius;z+=2)if(Math.hypot(x,z)<=boss.arenaRadius){
    const p={x:home.x+x,z:home.z+z},surface=surfaceAt(p.x,p.z);
    assert(!surface.water&&!surface.beach&&!insideVillageSafeArea(p.x,p.z)&&!inColosseumClearing(p.x,p.z)&&canTraverse(home,p),`${boss.name}: dry unobstructed arena`);
    assert.equal(surface.height,surfaceAt(home.x,home.z).height,`${boss.name}: every dodge happens on level ground`);
  }
  assert(boss.attacks.length>=2&&new Set(boss.attacks.map(attack=>attack.style)).size>=2);
  for(const attack of boss.attacks){assert(attack.name&&attack.description);assert(attack.radius<boss.arenaRadius);assert(attack.windupMs*.7>((attack.radius-1.5)/WALK_SPEED+.15)*1000,'an enraged radial leaves time to react and escape from melee distance');}
}

const dir=mkdtempSync(join(tmpdir(),'mossvale-world-bosses-')),clients=[],realNow=Date.now;
let clock=realNow(),game,port;Date.now=()=>clock;
function hero(name,point,level=100){return {id:randomUUID(),name,...point,zone:surfaceAt(point.x,point.z).zone,coordinateVersion:2,rotation:0,characterCreated:true,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Knight'},
  talents:[],...starterGear('Knight'),hp:100+(level-1)*12,maxHp:100+(level-1)*12,level,xp:0,gold:0,inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},quest:{stage:0,kills:0,crystals:0}};}
async function until(fn,label){const end=realNow()+5000;while(realNow()<end){const value=fn();if(value)return value;await delay(10);}throw Error(`Timed out: ${label}`);}
async function tick(ms=1){clock+=ms;await delay(120);}
async function start(players){clock+=20000;const tokens=players.map(()=>randomBytes(32).toString('base64url'));
  writeFileSync(join(dir,'players.json'),JSON.stringify(Object.fromEntries(players.map((p,i)=>[createHash('sha256').update(tokens[i]).digest('hex'),{characters:[p]}]))));
  game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();return tokens;}
async function connect(token){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);
  c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);
  socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['roster','welcome','snapshot'].includes(m.type))c[m.type]=m;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token});await until(()=>c.roster,'roster');await enter(c);return c;}
async function enter(c){c.snapshot=null;c.send({type:'selectCharacter',characterId:c.roster.characters[0].id});await until(()=>c.player(),'world entry');}
async function leave(c){const count=c.messages.length;c.send({type:'leaveWorld'});await until(()=>c.messages.slice(count).some(m=>m.type==='roster'),'leave world');}
async function strike(c,id){await tick(1400);const count=c.messages.length;c.send({type:'attack',ability:'strike',targetId:id});
  await until(()=>c.messages.slice(count).some(m=>m.type==='combat'&&m.playerId===c.welcome.id),'accepted strike');await tick(700);}
async function walk(c,to){const route=findPath(c.player(),to,WORLD_COLLIDERS,WORLD_BOUNDS);assert(route.length,'walkable test destination');
  for(const end of route)while(Math.hypot(c.player().x-end.x,c.player().z-end.z)>.02){const p=c.player(),gap=Math.hypot(end.x-p.x,end.z-p.z),step=Math.min(2,gap),next={x:p.x+(end.x-p.x)/gap*step,z:p.z+(end.z-p.z)/gap*step};
    clock+=Math.ceil(movementCost(p,next)/WALK_SPEED*1000)+10;c.send({type:'move',...next,zone:p.zone,rotation:0});await until(()=>Math.hypot(c.player().x-next.x,c.player().z-next.z)<.02,'accepted movement');}}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}

try{
  for(const boss of WORLD_BOSSES){
    const stats=MONSTERS[boss.kind],testLevel=Math.max(100,Math.ceil(stats.hp/15)),specials=boss.attacks.filter(attack=>attack.style!=='charge'),near={x:boss.x+1.5,z:boss.z},beside={x:boss.x+1.5,z:boss.z+.8};
    const distant=Array.from({length:32},(_,i)=>({x:boss.x+Math.sin(i*Math.PI/16)*(boss.arenaRadius+6),z:boss.z+Math.cos(i*Math.PI/16)*(boss.arenaRadius+6)}))
      .find(p=>!waterAt(p.x,p.z)&&canTraverse(p,p));assert(distant);
    const tokens=await start([hero('Primary',near,testLevel),hero('Partner',beside,testLevel),hero('Prior contributor',near,testLevel),hero('Observer',distant,testLevel)]);
    const prior=await connect(tokens[2]),watch=await connect(tokens[3]),enemy=()=>watch.snapshot.enemies.find(e=>e.id===boss.id);
    assert.deepEqual([enemy().level,enemy().maxHp,enemy().worldBoss],[stats.level,stats.hp,true]);
    await strike(prior,boss.id);assert(enemy().hp<stats.hp);await leave(prior);await tick(9000);
    assert.deepEqual([enemy().hp,enemy().x,enemy().z,enemy().attack],[stats.hp,boss.x,boss.z,null],'abandoned encounter resets to its own lair');
    const primary=await connect(tokens[0]),partner=await connect(tokens[1]);await enter(prior);await tick(2000);
    const basic=await until(()=>enemy().attack,'boss basic'),beforeBasic=[primary.player().hp,partner.player().hp];
    assert(basic.basic);assert.equal(basic.impactAt-basic.startedAt,BASIC_ATTACK.impactMs);await tick(BASIC_ATTACK.impactMs);
    assert(primary.player().hp<beforeBasic[0]);assert.equal(partner.player().hp,beforeBasic[1],'boss basics remain target-only');
    async function nextSpecial(){for(let i=0;i<3;i++){await tick(stats.cooldownMs*3);const attack=enemy().attack;if(attack&&!attack.basic&&attack.style!=='charge')return attack;}throw Error('Missing special after basic');}
    for(const [index,spec] of specials.entries()){
      const attack=await nextSpecial();
      assert(attack&&!attack.basic);assert.deepEqual([attack.name,attack.description,attack.style,attack.radius],[spec.name,spec.description,spec.style,spec.radius]);
      assert.equal(attack.impactAt-attack.startedAt,spec.windupMs);
      assert.deepEqual([attack.x,attack.z],spec.center==='self'?[enemy().x,enemy().z]:[primary.player().x,primary.player().z]);
      const before=[primary.player().hp,partner.player().hp],dodging=index===specials.length-1;
      if(dodging)await walk(partner,{x:attack.x+attack.radius+1,z:attack.z});
      await tick(attack.impactAt-clock-1);assert.deepEqual([primary.player().hp,partner.player().hp],before,'telegraph cannot damage early');
      await tick(1);const damage=Math.round(stats.damage*spec.damageScale);
      assert.equal(primary.player().hp,before[0]-damage,'named attack lands its authored damage at impact');
      assert.equal(partner.player().hp,before[1]-(dodging?0:damage),dodging?'leaving the marked circle avoids the area hit':'special hits nearby bystanders');
      await tick(stats.recoveryMs);assert.equal(primary.player().hp,before[0]-damage,'impact is applied once');
      if(dodging)await walk(partner,beside);
    }
    while(enemy().hp>enemy().maxHp/2)await strike(primary,boss.id);
    assert(enemy().alive,'enrage starts before death');
    const rage=await nextSpecial(),spec=boss.attacks.find(attack=>attack.name===rage?.name);assert(spec&&!rage.basic);
    assert.equal(rage.impactAt-rage.startedAt,Math.round(spec.windupMs*.7));
    const hp=primary.player().hp;await tick(rage.impactAt-clock);assert.equal(primary.player().hp,hp-Math.round(stats.damage*1.25*spec.damageScale),'enrage damage uses the authored per-attack multiplier');
    await strike(partner,boss.id);while(enemy().alive)await strike(primary,boss.id);
    const killedAt=enemy().diedAt;assert.equal(enemy().attack,null);
    await until(()=>[primary,partner].every(client=>client.snapshot.loot.some(drop=>drop.enemyId===boss.id)),'both contributors receive personal boss loot');
    const drops=[primary,partner].flatMap(client=>client.snapshot.loot.filter(drop=>drop.enemyId===boss.id));
    assert(!watch.snapshot.loot.some(drop=>drop.enemyId===boss.id),'observer never receives participants’ private loot');
    assert.deepEqual(drops.map(drop=>drop.ownerId).sort(),[primary.welcome.id,partner.welcome.id].sort(),'only current-encounter contributors get personal loot');
    assert(drops.every(drop=>drop.gold===stats.gold&&drop.relic===boss.relic&&drop.items.length));
    assert.equal(prior.player().gold,0);assert.equal(watch.player().gold,0);assert.equal(primary.player().gold,0,'coins are collected manually');
    await tick(DEATH_ANIMATION_MS);const drop=drops.find(drop=>drop.ownerId===primary.welcome.id);primary.send({type:'loot',targetId:drop.id});primary.send({type:'loot',targetId:drop.id});
    await until(()=>primary.player().gold===stats.gold,'personal corpse loot');assert.equal(primary.player().inventory.relic,boss.relic,'duplicate claim cannot duplicate relics');
    await tick(killedAt+boss.respawnMs-clock-1);assert.equal(enemy().alive,false,'per-boss respawn cannot occur early');await tick(1000);
    assert.deepEqual([enemy().alive,enemy().hp,enemy().level,enemy().x,enemy().z,enemy().attack],[true,stats.hp,stats.level,boss.x,boss.z,null]);
    await leave(partner);await leave(prior);await leave(watch);await strike(primary,boss.id);
    const exit=Array.from({length:32},(_,i)=>({x:boss.x+Math.sin(i*Math.PI/16)*(boss.leashRadius+2),z:boss.z+Math.cos(i*Math.PI/16)*(boss.leashRadius+2)}))
      .find(p=>canTraverse(primary.player(),p)&&Array.from({length:40},(_,i)=>({x:near.x+(p.x-near.x)*i/39,z:near.z+(p.z-near.z)*i/39})).every(p=>!waterAt(p.x,p.z)));assert(exit);
    await walk(primary,exit);await tick();const reset=primary.snapshot.enemies.find(e=>e.id===boss.id);
    assert.deepEqual([reset.hp,reset.x,reset.z,reset.attack,reset.targetId],[stats.hp,boss.x,boss.z,null,null],'crossing the lair leash cancels combat and restores the boss');
    console.log(`PASS ${boss.name}: Lv ${stats.level}, ${boss.attacks.map(attack=>attack.name).join(' / ')}, exact AoE contact and dodge, enrage, reset, participant loot, respawn and home leash.`);
    await stop();
  }
  // Isolate reward fan-out from raid DPS tuning: all twenty equal-level players must receive their own corpse.
  const raidBoss=WORLD_BOSSES[0],raidStats=MONSTERS[raidBoss.kind],raid=Array.from({length:20},(_,i)=>hero(`Raid ${i+1}`,{x:raidBoss.x+1.5,z:raidBoss.z},raidStats.level));
  const original={hp:raidStats.hp,damage:raidStats.damage};raidStats.hp=20*spellDamage(SPELLS.strike,combatStats(raid[0]))+1;raidStats.damage=1;
  try{
    const tokens=await start(raid),members=[];for(const token of tokens)members.push(await connect(token));
    for(const member of members)member.send({type:'attack',ability:'strike',targetId:raidBoss.id});
    await until(()=>members.every(member=>member.messages.some(m=>m.type==='combat'&&m.playerId===member.welcome.id)),'twenty contributions');await tick(700);
    assert(members[0].snapshot.enemies.find(enemy=>enemy.id===raidBoss.id).alive,'all twenty participate before the final blow');
    await strike(members[0],raidBoss.id);await until(()=>members.every(member=>member.snapshot.loot.some(drop=>drop.enemyId===raidBoss.id)),'all raid members receive their own corpse');
    const drops=members.flatMap(member=>member.snapshot.loot.filter(drop=>drop.enemyId===raidBoss.id));
    assert.deepEqual(drops.map(drop=>drop.ownerId).sort(),members.map(member=>member.welcome.id).sort(),'all twenty living contributors receive independent loot');
    await tick(DEATH_ANIMATION_MS);
    for(const member of members){const drop=drops.find(drop=>drop.ownerId===member.welcome.id);member.send({type:'loot',targetId:drop.id,itemId:'gold'});member.send({type:'loot',targetId:drop.id,itemId:'gold'});}
    await until(()=>members.every(member=>member.player().gold===raidStats.gold),'twenty independent manual gold claims');
    console.log('PASS twenty-player raid: twenty same-level contributors receive twenty personal corpses and exactly one manual gold reward each.');
  }finally{Object.assign(raidStats,original);await stop();}
  const timedBoss=WORLD_BOSSES[0],timedStats=MONSTERS[timedBoss.kind],timerLevel=Math.max(100,Math.ceil(timedStats.hp/15));
  const timerTokens=await start([hero('Berserk target',{x:timedBoss.x+1.5,z:timedBoss.z},timerLevel),hero('Berserk observer',{x:timedBoss.x,z:timedBoss.z+timedBoss.arenaRadius+6},timerLevel)]);
  const fighter=await connect(timerTokens[0]),observer=await connect(timerTokens[1]),timed=()=>observer.snapshot.enemies.find(enemy=>enemy.id===timedBoss.id);
  const first=await until(()=>timed()?.attack,'initial timed boss attack'),startedAt=first.startedAt;
  const bash=async()=>{const before=timed().hp,count=fighter.messages.length;fighter.send({type:'attack',ability:'shield-bash',targetId:timedBoss.id});await until(()=>fighter.messages.slice(count).some(m=>m.type==='combat'&&m.playerId===fighter.welcome.id),'accepted boss shield bash');await tick(300);assert(timed().hp<before,'stun immunity preserves the incoming spell damage');};
  await bash();assert.equal(timed().attack?.id,first.id,'boss basic keeps its recovery after a landed stun spell');
  await tick(startedAt+WORLD_BOSS_BERSERK_MS-clock-1);assert.equal(timed().berserk,false,'berserk is not early');await tick(1);assert.equal(timed().berserk,true,'boss berserks exactly210s after engagement');
  await tick(2000);const furious=timed().attack,spec=timedBoss.attacks.find(attack=>attack.name===furious?.name);assert(spec&&!furious.basic);
  assert.equal(furious.impactAt-furious.startedAt,spec.windupMs,'timed berserk preserves the dodge window');
  const beforeImpact=fighter.player().hp;await bash();assert.equal(timed().attack?.id,furious.id,'boss special remains committed after a landed stun spell');
  await tick(furious.impactAt-clock);assert.equal(fighter.player().hp,beforeImpact-Math.round(timedStats.damage*spec.damageScale*4),'timed berserk multiplies actual damage by four');
  await leave(fighter);await tick(9000);assert.equal(timed().berserk,false);assert.equal(timed().hp,timedStats.hp,'evade resets berserk and boss health');
  await enter(fighter);await tick(1000);assert.equal(timed().berserk,false,'a new pull receives a fresh encounter timer');
  console.log('PASS berserk: exact210s threshold, fourfold damage with unchanged warning, fresh timer after evade; world-boss stun immunity preserves spell damage, basics and specials.');
  await stop();
}finally{await stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
