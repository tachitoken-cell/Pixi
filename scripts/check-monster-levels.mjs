import { storeBoostMultiplier } from '../src/ingame-store.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { MONSTERS, WORLD_BOSS, monsterLevel, monsterLevelScale, BASIC_ATTACK } from '../src/bestiary.ts';
import { REGION_LEVEL_RANGES, regionLevelRange, regionLevelLabel } from '../src/region-levels.ts';
import { WILDERNESS_SPAWNS } from '../src/settlements.ts';
import { EXPEDITIONS, surfaceAt } from '../src/landscape.ts';
import { ZONES, NPCS } from '../src/content.ts';
import { DUNGEON_STAGES, DUNGEON_START, dungeonColliders, dungeonBounds } from '../src/dungeon.ts';
import { DUNGEON_ENTRANCE } from '../src/adventure.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, spellDamage } from '../src/spells.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { toWorld, canTraverse } from '../src/realm.ts';

const dir=mkdtempSync(join(tmpdir(),'mossvale-monster-levels-')), clients=[], realNow=Date.now;
let clock=realNow(),game,port; Date.now=()=>clock;
function hero(level=1,extra={}) { return {id:randomUUID(),name:`Level ${level}`,appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},
  characterCreated:true,coordinateVersion:2,zone:'greenwood',x:-48,z:1,rotation:0,level,xp:0,gold:0,hp:100+(level-1)*12,maxHp:100+(level-1)*12,
  talents:[],...starterGear('Ranger'),inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},quest:{chapter:0,stage:0,kills:0,crystals:0,progress:{'grove-slimes':0,'grove-crystals':0},completed:false,ending:null},...extra}; }
async function until(fn,label) {const end=realNow()+4000;while(realNow()<end){const value=fn();if(value)return value;await delay(10);}throw Error(`Timed out: ${label}`);}
async function tick(ms=0){clock+=ms;await delay(120);}
async function start(players,spawn,wideCombatFixture=false){
  clock+=20000;
  const tokens=players.map(()=>randomBytes(32).toString('base64url'));
  writeFileSync(join(dir,'players.json'),JSON.stringify(Object.fromEntries(players.map((p,i)=>[createHash('sha256').update(tokens[i]).digest('hex'),{characters:[p]}]))));
  const original=ZONES[0].enemies,oldMax=REGION_LEVEL_RANGES.greenwood.max;if(spawn)ZONES[0].enemies=[spawn];
  // These isolated combat fixtures need level8/16 foes beside Rowan to test mixed damage and mid-flight level-ups.
  // Widen only while constructing that test server; the shipped regional table is immediately restored.
  if(wideCombatFixture)REGION_LEVEL_RANGES.greenwood.max=30;
  try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});}finally{ZONES[0].enemies=original;REGION_LEVEL_RANGES.greenwood.max=oldMax;}
  port=await game.start();return tokens;
}
async function connect(token,enter=true){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);
  c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);c.enemy=id=>c.snapshot?.enemies.find(e=>e.id===id);c.casts=()=>c.messages.filter(m=>m.type==='combat');
  socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['roster','welcome','snapshot'].includes(m.type))c[m.type]=m;});
  await new Promise((res,rej)=>{socket.once('open',res);socket.once('error',rej);});c.send({type:'join',token});await until(()=>c.roster,'roster');
  if(enter){c.send({type:'selectCharacter',characterId:c.roster.characters[0].id});await until(()=>c.player(),'world entry');}return c;
}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
async function cast(c,targetId,ability='arrow',extra={}){
  const count=c.casts().length;c.send({type:'attack',targetId,ability,...extra});
  const preparation=await until(()=>c.player().casting,'cast preparation');await tick(preparation.endsAt-clock);
  const event=await until(()=>c.casts().slice(count).find(e=>e.playerId===c.welcome.id),'cast');
  const target=event.targets.find(t=>t.id===targetId),timing=combatTiming(event.ability,Math.hypot(target.x-event.from.x,target.z-event.from.z));
  return event.startedAt+(timing.delay+timing.flight)*1000;
}

try{
  const expected={ 'moss-slime':1,'briar-sentinel':3,'ice-wisp':5,'root-warden':8,'bramble-wolf':3,'briar-boar':4,'grove-spider':2,'ember-beetle':6,'dune-scorpion':8,'stone-golem':10,'frost-yeti':12,'crystal-bat':9,'marsh-toad':7,'void-stalker':16,'stormhorn-behemoth':30 };
  assert.deepEqual(Object.fromEntries(Object.entries(MONSTERS).map(([kind,stats])=>[kind,stats.level])),expected);
  const regions=[...ZONES,...EXPEDITIONS];
  assert.equal(regions.length,20);assert.deepEqual(Object.keys(REGION_LEVEL_RANGES).sort(),regions.map(region=>region.id).sort());
  assert.deepEqual(REGION_LEVEL_RANGES.greenwood,{min:1,max:6});
  for(const region of regions){
    const zone=region.zone??region.id,range=regionLevelRange(region.id,zone);
    assert(Number.isInteger(range.min)&&Number.isInteger(range.max)&&range.min>=1&&range.max>=range.min);
    assert.equal(regionLevelLabel(region.id,zone),`Lv ${range.min}–${range.max}`);
    for(const [kind,level] of Object.entries(expected))assert.equal(monsterLevel(kind,zone,region.id),kind===WORLD_BOSS.kind?30:Math.max(range.min,Math.min(range.max,level)));
    const assigned=Array.from({length:100},(_,i)=>monsterLevel('moss-slime',zone,region.id,`range-fixture-${i}`));
    assert.deepEqual([...new Set(assigned)].sort((a,b)=>a-b),Array.from({length:range.max-range.min+1},(_,i)=>range.min+i),'stable IDs can populate the entire inclusive regional band');
  }
  for(const zone of ZONES)for(const id of ['sea','missing','__proto__','constructor'])assert.deepEqual(regionLevelRange(id,zone.id),REGION_LEVEL_RANGES[zone.id],'unknown/prototype region IDs safely fall back to their biome');
  assert.equal(monsterLevelScale(8,8),1);assert.equal(monsterLevelScale(8,80),1);assert.equal(monsterLevelScale(8,1),2.05);assert.equal(monsterLevelScale(30,1),2.5);
  const homes=[...ZONES.flatMap(zone=>zone.enemies.map(spawn=>({...toWorld(zone.id,spawn),zone:zone.id}))),...WILDERNESS_SPAWNS.map(spawn=>({...spawn,roaming:true})),WORLD_BOSS];
  const homeById=new Map(homes.map(home=>[home.id,home])),probes=[...ZONES.map(zone=>({...toWorld(zone.id,{x:12,z:-1}),zone:zone.id})),...EXPEDITIONS];
  // A few extra dry spawn positions cover the coastline beyond the200m snapshot interest radius.
  for(const home of homes)if(probes.every(point=>Math.hypot(point.x-home.x,point.z-home.z)>190))probes.push(home);
  let tokens,previousLevels;
  for(const playerLevel of [100,1]){
    tokens=await start(probes.map(point=>hero(playerLevel,{x:point.x,z:point.z,zone:surfaceAt(point.x,point.z).zone})));
    const seen=new Map();
    for(const token of tokens){const c=await connect(token);for(const enemy of c.snapshot.enemies)seen.set(enemy.id,enemy);}
    assert.equal(seen.size,homes.length,'real snapshots inspect every ordinary monster and the world boss');
    const grouped=new Map();
    for(const [id,enemy] of seen){
      const home=homeById.get(id),regionId=surfaceAt(home.x,home.z).regionId,range=regionLevelRange(regionId,home.zone);
      assert.equal(enemy.level,monsterLevel(home.kind,home.zone,regionId,home.roaming?home.id:undefined));assert.equal(enemy.maxHp,MONSTERS[home.kind].hp);
      if(enemy.worldBoss)assert.equal(enemy.level,30);else assert(enemy.level>=range.min&&enemy.level<=range.max,`${id} belongs to its actual home-region band`);
      if(home.roaming){if(!grouped.has(regionId))grouped.set(regionId,new Set());grouped.get(regionId).add(enemy.level);}
      if(id.startsWith('slime-'))assert.equal(enemy.level,1,'the original village slimes remain safe level1 encounters');
    }
    for(const region of EXPEDITIONS)assert(grouped.get(region.id)?.size>=3,`${region.id} has several actual mob levels, not one fixed value`);
    const levels=Object.fromEntries([...seen].map(([id,enemy])=>[id,enemy.level]));
    if(previousLevels)assert.deepEqual(levels,previousLevels,'server restart and different observer levels preserve every spawn level');previousLevels=levels;
    await stop();
  }

  const boundarySpawn={id:'boundary-level-target',kind:'moss-slime',x:0,z:-47},across={x:0,z:-52};
  assert(canTraverse(boundarySpawn,across));assert.notEqual(surfaceAt(boundarySpawn.x,boundarySpawn.z).regionId,surfaceAt(across.x,across.z).regionId);
  tokens=await start([hero(100,{...across,zone:surfaceAt(across.x,across.z).zone})],boundarySpawn);let c=await connect(tokens[0]);
  for(let i=0;i<30&&surfaceAt(c.enemy(boundarySpawn.id).x,c.enemy(boundarySpawn.id).z).regionId==='greenwood';i++)await tick(200);
  assert.equal(surfaceAt(c.enemy(boundarySpawn.id).x,c.enemy(boundarySpawn.id).z).regionId,'cindergrove');assert.equal(c.enemy(boundarySpawn.id).level,1,'chasing into another region never changes an existing monster level');await stop();

  // Retain a Greenwood encounter beside the west gate, outside capital immunity and solid scenery.
  const target={id:'level-target',kind:'root-warden',x:-48,z:0};
  const low=hero(1),matched=hero(8,{z:1.2});tokens=await start([low,matched],target,true);
  let a=await connect(tokens[0]),b=await connect(tokens[1]),attack=await until(()=>a.enemy(target.id).attack,'basic swing');
  assert(attack.basic);assert.equal(a.enemy(target.id).level,8);assert.equal(b.enemy(target.id).level,8);
  await tick(attack.impactAt-clock-1);assert.equal(a.player().hp,low.hp);await tick(1);
  const basicBase=Math.round(MONSTERS[target.kind].damage*BASIC_ATTACK.damageScale);
  assert.equal(a.player().hp,low.hp-Math.round(basicBase*2.05));assert.equal(b.player().hp,matched.hp,'basic hits only its selected victim');
  await tick(attack.startedAt+MONSTERS[target.kind].cooldownMs*3-clock);
  attack=a.enemy(target.id).attack;assert(attack&&!attack.basic&&attack.style==='slam');
  const hp=[a.player().hp,b.player().hp];await tick(attack.impactAt-clock-1);assert.deepEqual([a.player().hp,b.player().hp],hp);
  await tick(1);assert.deepEqual([a.player().hp,b.player().hp],[hp[0]-Math.round(14*2.05),hp[1]-14],'one AoE applies the level gap separately to each victim');
  assert.deepEqual([a.enemy(target.id).hp,b.enemy(target.id).hp],[240,240],'mixed-level observers share one unchanged HP pool');await stop();

  tokens=await start([hero(1),hero(8,{z:-1}),hero(1)],target,true);a=await connect(tokens[0]);b=await connect(tokens[1]);const roster=await connect(tokens[2],false);
  roster.send({type:'attack',targetId:target.id,level:999,ability:'arrow'});a.send({type:'monsterLevel',targetId:target.id,level:1});
  a.socket.send('null');a.socket.send('{}');a.send({type:'attack',targetId:target.id,level:999,damage:9999});await tick();assert.equal(a.casts().length,0,'bodyless, roster-only and forged damage actions cannot cast');
  // The legacy primary packet has no ability field; forged progression and damage remain untrusted.
  let due=await cast(a,target.id,undefined,{ability:undefined,level:999,attackerLevel:999,enemyLevel:1});
  await tick(due-clock-1);assert.equal(a.enemy(target.id).hp,240);assert.equal(a.player().level,1);await tick(1);
  assert.equal(a.enemy(target.id).hp,232,'level1 primary16 is reduced to8 against level8');
  due=await cast(b,target.id);await tick(due-clock+1);
  assert.equal(a.enemy(target.id).hp,195,'matched level8 primary37 lands without a penalty');assert.equal(b.enemy(target.id).hp,195);assert.equal(a.enemy(target.id).level,8);await stop();

  // Learn a level while poison is in flight: launch-time stats and level govern every pulse.
  const rowan=NPCS.find(npc=>npc.id==='rowan');
  const graduate=hero(10,{x:rowan.x,z:rowan.z+2,xp:900,quest:{chapter:0,stage:2,kills:3,crystals:3,progress:{'grove-slimes':3,'grove-crystals':3},completed:false,ending:null}});
  const poisonTarget={id:'poison-level-target',kind:'void-stalker',x:rowan.x,z:rowan.z+5};tokens=await start([graduate],poisonTarget,true);a=await connect(tokens[0]);
  const baseStats=combatStats(a.player());due=await cast(a,poisonTarget.id,'poison-shot');a.send({type:'interact',targetId:'rowan'});await until(()=>a.player().level===11,'level gained during projectile flight');
  await tick(due-clock-1);assert.equal(a.enemy(poisonTarget.id).hp,108);await tick(1);
  const initial=Math.round(spellDamage(SPELLS['poison-shot'],baseStats)/1.9),pulse=Math.round(Math.round(baseStats.primaryDamage*.35)/1.9);
  assert.equal(a.enemy(poisonTarget.id).hp,108-initial,'projectile retains the old level gap after the player levels up');
  for(let i=1;i<=3;i++){await tick(1000);assert.equal(a.enemy(poisonTarget.id).hp,108-initial-i*pulse,'each poison pulse uses the same frozen level and damage');}
  const remaining=a.enemy(poisonTarget.id).hp;due=await cast(a,poisonTarget.id);await tick(due-clock+1);
  assert.equal(a.enemy(poisonTarget.id).hp,remaining-Math.round(combatStats(a.player()).primaryDamage/1.75),'a new cast uses the newly earned level');await stop();

  const slime=WILDERNESS_SPAWNS.find(spawn=>spawn.kind==='moss-slime'),slimeLevel=monsterLevel(slime.kind,slime.zone,surfaceAt(slime.x,slime.z).regionId,slime.id);
  tokens=await start([hero(100,{x:slime.x+1,z:slime.z,zone:slime.zone})]);a=await connect(tokens[0]);due=await cast(a,slime.id);await tick(due-clock+1);
  assert.equal(a.enemy(slime.id).alive,false);assert.equal(a.enemy(slime.id).level,slimeLevel);await tick(14001);
  assert.equal(a.enemy(slime.id).alive,true);assert.equal(a.enemy(slime.id).level,slimeLevel,'hashed roaming levels survive death and respawn');assert.equal(a.enemy(slime.id).maxHp,44);await stop();

  tokens=await start([hero(1,{zone:'hollow',...toWorld('hollow',DUNGEON_ENTRANCE)})]);a=await connect(tokens[0]);a.send({type:'dungeonEnter'});await until(()=>a.player().instanceId,'dungeon entry');
  assert.equal(a.snapshot.enemies.length,3);assert(a.snapshot.enemies.every(enemy=>enemy.level===8),'entry stage has fixed level8 even for a level1 entrant');await stop();

  // Execute the actual stage constructor and eruption resolver without replaying a complete dungeon.
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const extract=(name,next)=>{const found=source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}\\n  function ${next}`));assert(found,`${name} exists`);return `(${found[0].replace(new RegExp(`\\n  function ${next}$`),'').trim()})`;};
  assert.deepEqual(DUNGEON_STAGES.map(stage=>stage.level),[8,9,10,10,11,12,12,14]);
  for(const stage of DUNGEON_STAGES){
    const enemies=[],spawn=runInNewContext(extract('spawnDungeonStages','enterDungeon'),{DUNGEON_STAGES:[stage],enemyStats:MONSTERS,enemies});
    spawn({id:'level-instance',partySize:2,wipes:0,spawned:new Set(),cleared:new Set(stage.requires),activated:new Set(['verdant-seal','glacial-seal'])});
    assert.equal(enemies.length,stage.enemies.length);assert(enemies.every(enemy=>enemy.level===stage.level));
    for(let i=0;i<enemies.length;i++)assert.equal(enemies[i].maxHp,Math.round(MONSTERS[stage.enemies[i].kind].hp*1.6*(stage.id==='throne'&&stage.enemies[i].kind==='root-warden'?1.8:1)),'party HP scaling remains unchanged');
  }
  const boss={id:'hazard-boss',kind:'root-warden',instanceId:'hazard-instance',alive:true,level:14,...DUNGEON_START};
  const armored=hero(2,DUNGEON_START);armored.appearance.className='Knight';Object.assign(armored,starterGear('Knight'));armored.ownedGear.push('sunsteel-plate');armored.equipment.armor='sunsteel-plate';
  const victims=[hero(1,DUNGEON_START),hero(14,DUNGEON_START),hero(80,DUNGEON_START),armored].map(player=>({player,instanceId:boss.instanceId}));
  const sessions=new Map(victims.map(s=>[s.player.id,s])),hazard={bossId:boss.id,...DUNGEON_START,r:4.5,damage:32,endsAt:clock+1800};
  const dungeon={id:boss.instanceId,completed:false,members:victims.map(s=>s.player.id),hazards:[hazard],lastHazard:clock+99999},events=[];
  const applyDamage=runInNewContext(extract('applyDamage','event'),{broadcast:()=>{}});
  const stand=runInNewContext(`(${source.match(/function stand\(session\) \{[^\n]*\}/)[0]})`);
  const eruption=runInNewContext(extract('updateDungeonHazards','leaveSession'),{stand,applyDamage,dungeons:new Map([[dungeon.id,dungeon]]),enemies:[boss],sessions,combatStats,storeBoostMultiplier,monsterLevelScale,activeCompanion:()=>null,enemyCombatCompanion:()=>null,
    distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),canTraverse,dungeonColliders,dungeonBounds,event:(s,kind,text)=>events.push({s,kind,text}),dirty:()=>{},playerDied:()=>assert.fail('surviving hazard fixture'),randomUUID});
  const before=victims.map(s=>s.player.hp);eruption(hazard.endsAt-1);assert.deepEqual(victims.map(s=>s.player.hp),before);eruption(hazard.endsAt);
  assert.deepEqual(victims.map(s=>s.player.hp),[before[0]-80,before[1]-32,before[2]-32,before[3]-78],'eruptions cap the lower-level penalty, preserve matched/higher-level damage, and subtract armor after scaling');assert.equal(events.length,4);
  eruption(hazard.endsAt+1);assert.equal(events.length,4,'an eruption only impacts once');
  assert.deepEqual(REGION_LEVEL_RANGES.greenwood,{min:1,max:6},'isolated combat fixtures never leave altered regional ranges');
  console.log('PASS monster levels:20 regional ranges and every real spawn, varied stable IDs, server restart/observer/chase/respawn invariance, level1 starters, mixed-level shared HP and AoE, delayed primary/poison scaling with frozen levels, forged/roster rejection, unchanged dungeon stages, party HP and eruption scaling.');
}finally{await stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
