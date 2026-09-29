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
import { ZONES } from '../src/content.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, spellsForClass, defaultHotbar, hotbarValid, spellDamage, abilityUnlocked, availableHotbar, legacyAbility, spellCastTimeMs } from '../src/spells.ts';
import { MONSTERS, monsterLevelScale } from '../src/bestiary.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { EXPEDITIONS, legacyRegionAt, migrateWorldPositionV2 } from '../src/landscape.ts';
import { toWorld, canTraverse } from '../src/realm.ts';
import { MOUNT_UNLOCK_LEVEL, MOUNT_UPGRADE_LEVEL } from '../src/travel.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-spells-')), file = join(dir, 'players.json');
const realNow = Date.now; let clock = realNow(), game, port; const clients = [];
Date.now = () => clock;
const key = token => createHash('sha256').update(token).digest('hex');
const token = randomBytes(32).toString('base64url');
const at=(x,z)=>({x:x-30,z:z+60});
const legacyIds=['arrow','volley','power-shot','multishot','poison-shot','fireball','nova','frostbolt','arcane-burst','meteor','strike','whirlwind','cleave','shockwave','shield-bash'];
function hero(className, extra = {}) {
  const level=extra.level??1,maxHp=100+(level-1)*12;
  return { id:randomUUID(),name:'Spell tester',appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className},
    coordinateVersion:2,zone:'greenwood',...at(12,-1),rotation:0,hp:maxHp,maxHp,level,xp:0,gold:0,characterCreated:true,talents:[],...starterGear(className),learnedSpells:spellsForClass(className).filter(spell=>spell.requiredLevel<=level).map(spell=>spell.id),
    inventory:{wood:4,crystal:5,potion:3,herb:6,relic:1},skills:{mining:0,woodcutting:12,herbalism:0},craftingXp:0,contracts:{active:{},completed:{}},
    quest:{chapter:0,stage:1,kills:0,crystals:0,progress:{'grove-slimes':0,'grove-crystals':0},completed:false,ending:null},...extra };
}
async function until(fn, label) { const end = realNow()+4000; while(realNow()<end){ const result=fn();if(result)return result;await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(ms=0){clock+=ms;await delay(125);}
async function start(records, targetHp=44, spawns, worldCoordinates=false) {
  if(records)writeFileSync(file,JSON.stringify(records));
  const original=ZONES[0].enemies,oldHp=MONSTERS['moss-slime'].hp;
  MONSTERS['moss-slime'].hp=targetHp;
  ZONES[0].enemies=(spawns??[{id:'spell-target',kind:'moss-slime',x:12,z:1},{id:'spell-neighbor',kind:'moss-slime',x:13,z:1},{id:'spell-third',kind:'moss-slime',x:11,z:1},{id:'spell-fourth',kind:'moss-slime',x:12,z:2},{id:'spell-far',kind:'moss-slime',x:30,z:1}]).map(spawn=>worldCoordinates?spawn:{...spawn,...at(spawn.x,spawn.z)});
  try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});}finally{ZONES[0].enemies=original;MONSTERS['moss-slime'].hp=oldHp;}
  port=await game.start();
}
async function connect(enter=true, characterId) {
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`), c={socket,messages:[]};clients.push(c);
  c.send=m=>socket.send(JSON.stringify(m));c.casts=()=>c.messages.filter(m=>m.type==='combat');c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);
  socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['snapshot','roster','welcome'].includes(m.type))c[m.type]=m;});
  await new Promise((res,rej)=>{socket.once('open',res);socket.once('error',rej);});
  c.send({type:'join',token});await until(()=>c.roster,'roster');
  if(enter){c.send({type:'selectCharacter',characterId:characterId||c.roster.characters[0].id});await until(()=>c.player(),'entered');}return c;
}
function due(cast,index=0){const t=cast.targets[index],timing=combatTiming(cast.ability,Math.hypot(t.x-cast.from.x,t.z-cast.from.z),index);return cast.startedAt+(timing.delay+timing.flight)*1000;}


async function release(c, ability, targetId = 'spell-target') {
  const count = c.casts().length, before = structuredClone(c.snapshot), cooldowns = { ...c.player().abilityCooldowns };
  // Exact range and AoE fixtures retain their positions while the separate cast timer advances.
  const speed = MONSTERS['moss-slime'].speed; MONSTERS['moss-slime'].speed = 0;
  try {
    c.send({ type: 'attack', ability, targetId });
    const result=await until(()=>c.player().casting||c.casts()[count],`${ability} accepted`);
    assert.equal(c.player().globalCooldownUntil,clock+1500,'global cooldown starts at acceptance');
    if(result.type==='combat'){
      assert.equal(SPELLS[ability].castTimeMs,0,'only instant abilities release without preparation');
      assert.equal(result.startedAt,clock);assert.equal(c.player().casting,null);return result;
    }
    const casting=result;
    assert.equal(casting.ability, ability); assert.equal(casting.endsAt - casting.startedAt, spellCastTimeMs(SPELLS[ability], combatStats(c.player())));
    clock = casting.endsAt - 1; await tick();
    assert.equal(c.casts().length, count, 'preparation never broadcasts a released attack');
    assert.deepEqual(c.player().abilityCooldowns, cooldowns, 'cooldowns wait until release');
    for (const enemy of before.enemies) assert.equal(c.snapshot.enemies.find(current => current.id === enemy.id)?.hp, enemy.hp, 'cast preparation never deals damage');
    clock = casting.endsAt; await tick();
    const event = await until(() => c.casts()[count], `${ability} releases at completion`);
    assert.equal(event.startedAt, casting.endsAt, 'visual attack begins at the authoritative cast deadline');
    assert.equal(c.player().casting, null); return event;
  } finally { MONSTERS['moss-slime'].speed = speed; }
}

try {
  // Completion rewards include fallen party members. Exercise the actual server helper for both life states.
  const xpSource=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').match(/  function addXp\(session, amount(?:, boosted = true)?\) \{[\s\S]*?\n  \}/);
  assert(xpSource,'server XP helper exists');
  const xpEvents=[];
  const addXp=runInNewContext(`(${xpSource[0].replace(/\n\n  const mime$/,'').trim()})`,{
    storeBoostMultiplier,event:(session,kind,text)=>xpEvents.push({session,kind,text}),spellsForClass,MOUNT_UNLOCK_LEVEL,MOUNT_UPGRADE_LEVEL
  });
  for(const className of ['Ranger','Mage','Knight'])for(const alive of [false,true]){
    const diedAt=alive?0:clock,session={player:hero(className,{level:3,hp:alive?20:0,diedAt})};
    addXp(session,350);
    assert.deepEqual([session.player.level,session.player.xp,session.player.maxHp],[4,50,136]);
    assert.equal(session.player.hp,alive?136:0,'level-up heals living players and leaves fallen players dead');
    assert.equal(session.player.diedAt,diedAt,'completion XP cannot reset the death animation clock');
    const events=xpEvents.filter(event=>event.session===session),learned=spellsForClass(className).find(spell=>spell.requiredLevel===4);
    assert.equal(events.filter(event=>event.text===`Training available: ${learned.label}. Visit your class trainer to learn it.`).length,1);
    assert.equal(events.some(event=>event.text.includes('health has been restored')),alive,'dead players receive no false revival message');
  }
  assert.equal(Object.keys(SPELLS).length,137);
  const previousRanges={arrow:9,volley:5,'power-shot':12,multishot:10,'poison-shot':9,fireball:7,nova:5,frostbolt:10,'arcane-burst':7,meteor:12,strike:3,whirlwind:5,cleave:3.8,shockwave:7,'shield-bash':3};
  for(const spell of legacyIds.map(id=>SPELLS[id]))assert(Math.abs(spell.range-previousRanges[spell.id]*1.5)<1e-9,`${spell.id} receives exactly 50% more range`);
  assert.equal(SPELLS.meteor.radius,3,'Meteor keeps its original three-meter splash radius');
  for(const className of ['Ranger','Mage','Knight']){
    const extraLevels=className==='Ranger'?[9,33]:className==='Knight'?[1,3]:[11],removedLevels={Ranger:[22,34,44,60],Knight:[24,42,46],Mage:[44,52]}[className];
    assert.equal(spellsForClass(className).length,31+extraLevels.length-removedLevels.length);assert(hotbarValid(defaultHotbar(className),className));
    assert.deepEqual(spellsForClass(className).map(spell=>spell.requiredLevel).sort((a,b)=>a-b),[...[1,...Array.from({length:30},(_,i)=>(i+1)*2)].filter(level=>!removedLevels.includes(level)),...extraLevels].sort((a,b)=>a-b));
    assert.deepEqual(defaultHotbar(className).slice(2,4),['mend','interact']);
    assert.equal(defaultHotbar(className).filter(slot=>slot&&SPELLS[slot]).length,1,'new characters start with only their primary spell');
  }
  // Retain all original combat/range regressions; check-spell-catalog covers every new lesson and the Cleric WS check covers support/channel delivery.
  for(const spell of legacyIds.map(id=>SPELLS[id])) {
    assert(abilityUnlocked(spell.id,spell.className,spell.requiredLevel));
    if(spell.requiredLevel>1){
      assert(!abilityUnlocked(spell.id,spell.className,spell.requiredLevel-1));
      const low=hero(spell.className,{level:spell.requiredLevel-1}),oldSlots=[null,legacyAbility(spell.className),'mend',spell.id,'interact',legacyAbility(spell.className),null,null];
      low.hotbar=oldSlots;clock+=20000;await start({[key(token)]:{characters:[low]}});const locked=await connect();
      const expected=oldSlots.map(slot=>slot===spell.id?null:slot);
      assert.deepEqual(locked.player().hotbar,expected,'saved unlocked, duplicate and utility slots retain their positions; only locked spells disappear');
      assert.deepEqual(availableHotbar(oldSlots,spell.className,low.level),expected);
      locked.send({type:'attack',ability:spell.id,targetId:'spell-target'});
      if(spell.id===legacyAbility(spell.className,true))locked.send({type:'attack',skill:'special',targetId:'spell-target'});
      locked.send({type:'setHotbar',slots:oldSlots});await tick(600);
      assert.equal(locked.casts().length,0,'locked named and legacy casts never broadcast');
      assert.equal(locked.snapshot.enemies.find(enemy=>enemy.id==='spell-target').hp,44,'locked spells never apply damage');
      assert.deepEqual(locked.player().abilityCooldowns,{},'rejected locks never spend cooldowns');
      assert.deepEqual(locked.player().hotbar,expected,'forged locked hotbars reject instead of silently assigning');
      assert(locked.messages.some(message=>message.type==='event'&&message.text.startsWith('Hotbar:')));
      await game.stop();game=null;
    }
    // Keep the clock still while selecting boundary targets, so monster pursuit cannot blur the range gate.
    const rangeCaster=hero(spell.className,{level:spell.requiredLevel,x:0,z:86,rotation:Math.PI/2});
    const boundary=[{id:'range-edge',kind:'moss-slime',x:spell.range,z:86},{id:'range-outside',kind:'moss-slime',x:spell.range+.01,z:86}];
    if(spell.id==='meteor')boundary.push({id:'splash-edge',kind:'moss-slime',x:spell.range+3,z:86},{id:'splash-outside',kind:'moss-slime',x:spell.range+3.01,z:86});
    assert(boundary.every(point=>canTraverse(rangeCaster,point)),'range fixtures have clear sight lines');
    clock+=20000;await start({[key(token)]:{characters:[rangeCaster]}},44,boundary,true);const edge=await connect();
    if(spell.targeting!=='radial'){
      edge.send({type:'attack',ability:spell.id,targetId:'range-outside'});await tick();
      assert.equal(edge.casts().length,0,`${spell.id} rejects an explicit target 0.01m past its range`);
      assert.deepEqual(edge.player().abilityCooldowns,{},'range rejection never spends a cooldown');
      assert(edge.snapshot.enemies.every(enemy=>enemy.hp===enemy.maxHp),'range rejection deals no damage');
    }
    await release(edge,spell.id,spell.targeting==='radial'?'range-outside':'range-edge');
    const edgeCast=edge.casts()[0],edgeTarget=edgeCast.targets[0],castDistance=Math.hypot(edgeTarget.x-edgeCast.from.x,edgeTarget.z-edgeCast.from.z);
    assert.equal(castDistance,spell.range,`${spell.id} accepts the inclusive range boundary`);assert(castDistance>previousRanges[spell.id],'the accepted cast reaches beyond the previous maximum');
    assert.deepEqual(edgeCast.targets.map(target=>target.id),spell.id==='meteor'?['range-edge','range-outside','splash-edge']:['range-edge'],'ordinary spells exclude targets beyond range; Meteor only adds targets inside its unchanged splash radius');
    clock=Math.min(...edgeCast.targets.map((_,index)=>due(edgeCast,index)))-1;await tick();
    assert.equal(edge.snapshot.enemies.find(enemy=>enemy.id==='range-edge').hp,44,'longer range still waits for the visible impact');
    clock=Math.max(...edgeCast.targets.map((_,index)=>due(edgeCast,index)))+1;await tick();
    assert.equal(edge.snapshot.enemies.find(enemy=>enemy.id==='range-edge').hp,Math.max(0,44-Math.max(1,Math.round(spellDamage(spell,combatStats(rangeCaster))/monsterLevelScale(edge.snapshot.enemies.find(enemy=>enemy.id==='range-edge').level,rangeCaster.level)))),`${spell.id} applies authoritative damage at the extended boundary`);
    if(spell.id==='meteor')assert.equal(edge.snapshot.enemies.find(enemy=>enemy.id==='splash-outside').hp,44,'Meteor never damages a target outside its three-meter splash');
    await game.stop();game=null;
    clock+=20000;const original=hero(spell.className,{level:spell.requiredLevel}),targetHp=spell.status?150:44;
    // Keep unstunned neighbors out of this observation; their faster attacks would obscure the target's stun.
    const stunSpawns=spell.status?.kind==='stun'?[{id:'spell-target',kind:'moss-slime',x:12,z:1},{id:'spell-far',kind:'moss-slime',x:30,z:1}]:undefined;
    await start({[key(token)]:{characters:[original]}},targetHp,stunSpawns);const c=await connect();
    const before=structuredClone(c.snapshot), stats=combatStats(c.player());
    for(const ability of ['__proto__','constructor',null,42,Object.values(SPELLS).find(s=>s.className!==spell.className).id]) c.send({type:'attack',ability,targetId:'spell-target'});
    if(spell.targeting!=='radial'){c.send({type:'attack',ability:spell.id,targetId:'spell-far'});c.send({type:'attack',ability:spell.id,targetId:'forged'});}
    await tick();assert.equal(c.casts().length,0,'malformed, foreign-class and out-of-range casts rejected');
    await release(c,spell.id);
    const cast=c.casts()[0];assert.equal(cast.ability,spell.id);assert.equal(cast.playerId,original.id);assert.equal(cast.targets[0].id,'spell-target');
    assert(cast.targets.every(t=>before.enemies.some(e=>e.id===t.id&&e.alive)),'server chooses actual enemy IDs');
    assert.equal(cast.targets.length,spell.targeting==='single'?1:spell.targeting==='chain'?3:4);
    c.send({type:'attack',ability:spell.id,targetId:'spell-target'});
    await delay(25);
    clock=Math.min(...cast.targets.map((_,i)=>due(cast,i)))-1;await tick();
    for(const target of cast.targets){const e=c.snapshot.enemies.find(e=>e.id===target.id);assert.equal(e.hp,targetHp,`${spell.id}: damage waits for visible impact`);assert(e.alive);}
    assert.deepEqual([c.player().xp,c.player().gold,c.snapshot.loot.length],[0,0,0],'no early kill/reward');assert.equal(c.casts().length,1,'per-ability cooldown prevents duplicate release');
    clock=Math.max(...cast.targets.map((_,i)=>due(cast,i)))+1;await tick();
    for(const target of cast.targets)assert.equal(c.snapshot.enemies.find(e=>e.id===target.id).hp,Math.max(0,targetHp-Math.max(1,Math.round(spellDamage(spell,stats)/monsterLevelScale(before.enemies.find(enemy=>enemy.id===target.id).level,original.level)))),`${spell.id} authoritative damage`);
    assert.equal(c.player().abilityCooldowns[spell.id],cast.startedAt+spell.cooldownMs);
    if(spell.status?.kind==='poison'){
      await tick(3000);assert.equal(c.snapshot.enemies.find(e=>e.id==='spell-target').hp,targetHp-spellDamage(spell,stats)-3*Math.round(stats.primaryDamage*.35),'three delayed poison ticks');
    }
    if(spell.status?.kind==='stun'){
      const enemy=structuredClone(c.snapshot.enemies.find(e=>e.id==='spell-target')),hp=c.player().hp;
      await tick(1000);assert.deepEqual(c.snapshot.enemies.find(e=>e.id==='spell-target'),enemy,'stun stops enemy movement');assert.equal(c.player().hp,hp,'stun prevents melee');
    }
    if(spell.id==='meteor'){
      assert.equal(c.snapshot.loot.filter(drop=>drop.ownerId===original.id).length,4,'each lethal impact creates one personal drop');
      const xp=c.player().xp;await tick(1000);assert.equal(c.player().xp,xp,'no duplicate kill rewards');
    }
    await game.stop();game=null;
  }
  // Slow movement needs an encounter outside the capital's combat-safe area.
  const combatBase=ZONES[0].enemies.find(enemy=>enemy.id==='slime-1');
  clock+=20000;const mage=hero('Mage',{level:20,x:combatBase.x,z:combatBase.z-6}),other=hero('Mage',{name:'Second mage'});
  await start({[key(token)]:{characters:[mage,other]}},150,[{...combatBase,id:'spell-target'}],true);let c=await connect();
  const custom=['meteor',null,'frostbolt','mend','interact','fireball','nova','arcane-burst'];
  for(const slots of [[],Array(9).fill(null),Array(8).fill('arrow'),Array(8).fill('__proto__'),Array(8).fill({ability:'fireball'})])c.send({type:'setHotbar',slots});
  await tick();assert.deepEqual(c.player().hotbar,defaultHotbar('Mage',20));assert(c.messages.some(m=>m.type==='event'&&m.text.startsWith('Hotbar:')));
  c.send({type:'setHotbar',slots:custom});await until(()=>c.player().hotbar[0]==='meteor','saved hotbar acknowledgement');
  const cast=await release(c,'frostbolt');
  clock=due(cast)+1;await tick();const from=structuredClone(c.snapshot.enemies.find(e=>e.id==='spell-target'));
  await tick(200);const after=c.snapshot.enemies.find(e=>e.id==='spell-target'),slowDistance=Math.hypot(after.x-from.x,after.z-from.z);
  assert(slowDistance>0&&slowDistance<=.2*MONSTERS[from.kind].speed*SPELLS.frostbolt.status.multiplier+.001,'frostbolt halves the current monster movement speed');
  c.socket.close();await until(()=>c.socket.readyState===WebSocket.CLOSED,'disconnect');c=await connect();
  assert.deepEqual(c.player().hotbar,custom);assert.equal(c.player().abilityCooldowns.frostbolt,cast.startedAt,'reconnect retains the released cast clock');
  c.send({type:'attack',ability:'frostbolt',targetId:'spell-target'});await tick();assert.equal(c.player().casting?.ability,'frostbolt','repeatable frostbolt can immediately prepare after reconnect');
  c.send({type:'leaveWorld'});await until(()=>c.roster.characters[0].hotbar[0]==='meteor','roster after leaving');
  c.send({type:'selectCharacter',characterId:other.id});await until(()=>c.player()?.id===other.id,'second character');assert.deepEqual(c.player().hotbar,defaultHotbar('Mage'),'layouts isolated by character');
  await game.stop();game=null;const saved=JSON.parse(readFileSync(file));assert.deepEqual(saved[key(token)].characters[0].hotbar,custom);assert(!Object.hasOwn(saved[key(token)].characters[0],'abilityCooldowns'),'absolute cooldown clocks never persisted');
  await start();c=await connect();assert.deepEqual(c.player().hotbar,custom);assert.deepEqual(c.player().abilityCooldowns,{});assert.equal(c.player().inventory.relic,1);
  await game.stop();game=null;
  const upgraded=hero('Mage',{level:SPELLS.frostbolt.requiredLevel,talents:['mage-1'],ownedGear:['mage-staff','mage-robes','starfall-staff'],equipment:{weapon:'starfall-staff',armor:'mage-robes',charm:null}});
  clock+=20000;await start({[key(token)]:{characters:[upgraded]}},150);c=await connect();
  await release(c,'frostbolt');clock=due(c.casts()[0])+1;await tick();
  assert.equal(c.snapshot.enemies.find(e=>e.id==='spell-target').hp,150-spellDamage(SPELLS.frostbolt,combatStats(c.player())),'new spells include gear, level and talent damage');
  await game.stop();game=null;
  clock+=20000;await start({[key(token)]:{characters:[hero('Ranger',{level:SPELLS['poison-shot'].requiredLevel})]}});c=await connect();
  await release(c,'poison-shot');
  c.socket.close();await until(()=>c.socket.readyState===WebSocket.CLOSED,'poison caster leaves');c=await connect();await tick(5000);
  assert.equal(c.snapshot.enemies.find(e=>e.id==='spell-target').hp,44,'logout cancels both pending poison impact and later pulses');assert.equal(c.player().xp,0);
  await game.stop();game=null;
  for(const className of ['Ranger','Mage','Knight'])for(const level of [4,8,12,16]){
    const learned=spellsForClass(className).find(spell=>spell.requiredLevel===level),primary=legacyAbility(className);
    const hotbar=[primary,null,'interact','mend',primary,null,null,null];
    const graduate=hero(className,{level:level-1,...toWorld('greenwood',{x:ZONES[0].npc.x,z:ZONES[0].npc.z+2}),xp:(level-1)*100-100,hotbar,
      quest:{chapter:0,stage:2,kills:3,crystals:3,progress:{'grove-slimes':3,'grove-crystals':3},completed:false,ending:null}});
    clock+=20000;await start({[key(token)]:{characters:[graduate]}});c=await connect();
    c.send({type:'interact',targetId:'rowan'});await until(()=>c.player().level===level,'quest reward reaches the next spell milestone');
    assert.equal(c.player().xp,0);assert(abilityUnlocked(learned.id,className,c.player().level));
    assert(!abilityUnlocked(learned.id,className,c.player().level,c.player().learnedSpells),'reaching a spell level only makes training available');
    const notifications=()=>c.messages.filter(message=>message.type==='event'&&message.text===`Training available: ${learned.label}. Visit your class trainer to learn it.`);
    assert.equal(notifications().length,1,'quest level-up announces the exact newly available training once');
    assert.deepEqual(c.player().hotbar,hotbar,'learning a spell leaves the player chosen slots intact');
    await tick(1000);c.send({type:'interact',targetId:'rowan'});await tick();assert.equal(notifications().length,1,'a repeated turn-in cannot repeat spell unlocks');
    await game.stop();game=null;
  }
  const oldOrigins={greenwood:{x:0,z:0},amberwild:{x:0,z:-96},frostmarch:{x:96,z:-96},hollow:{x:96,z:0}};
  const legacy=Object.entries(oldOrigins).map(([zone,origin])=>hero('Ranger',{name:`Old ${zone}`,coordinateVersion:1,zone,x:origin.x,z:origin.z+22}));
  legacy.push(hero('Ranger',{name:'Old expedition',coordinateVersion:1,x:-218,z:68,zone:'greenwood'}));
  const offshore={x:-87.9,z:-431.9};assert.equal(legacyRegionAt(offshore.x,offshore.z),'frostmarch','v1 ownership follows tile center rather than nearest camp at raw coordinates');legacy.push(hero('Ranger',{name:'Old swimmer',coordinateVersion:1,...offshore,zone:'frostmarch'}));
  await start({[key(token)]:{characters:legacy}});c=await connect(false);
  for(let i=0;i<legacy.length;i++){
    const migrated=c.roster.characters[i],expected=i<4?{...toWorld(legacy[i].zone,{x:0,z:22}),zone:legacy[i].zone}:i===4?{x:EXPEDITIONS[0].x+2,z:EXPEDITIONS[0].z+3,zone:'greenwood'}:migrateWorldPositionV2(legacy[i]);
    assert.deepEqual({x:migrated.x,z:migrated.z,zone:migrated.zone},expected,'version1 town/camp positions migrate to their retained location');
    assert.equal(migrated.coordinateVersion,2);assert.equal(migrated.id,legacy[i].id);assert.deepEqual(migrated.inventory,legacy[i].inventory);assert.deepEqual(migrated.quest,legacy[i].quest);assert.deepEqual(migrated.skills,legacy[i].skills);
  }
  const migrated=structuredClone(c.roster.characters);await game.stop();game=null;await start();c=await connect(false);assert.deepEqual(c.roster.characters,migrated,'migration is never applied twice after restart');await game.stop();game=null;
  const corrupt=JSON.parse(readFileSync(file));corrupt[key(token)].characters[0].hotbar=Array(8).fill('meteor');writeFileSync(file,JSON.stringify(corrupt));assert.throws(()=>createGameServer({port:0,dataDir:dir,keycloak:null,databaseUrl:''}),/Invalid player save/,'invalid saved hotbar never silently reset');
  console.log('PASS spells: all 15 legacy instant/fixed-cast deadlines and delayed impacts and 50% extended range boundaries, outside rejection and unchanged Meteor splash; locked named/legacy casts and forged hotbars rejected; locked-only save migration; every quest-level training notification; XP cannot revive fallen players; class/range/global/per-ID validation, poison/slow/stun, unique loot, eight-slot persistence/reconnect isolation, one-time v1 towns/camps/water migration.');
} finally { for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true}); }
