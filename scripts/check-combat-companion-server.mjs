import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear, talentsValid, TALENT_VERSION, combatStats } from '../src/progression.ts';
import { SPELLS, spellDamage } from '../src/spells.ts';
import { newBags } from '../src/bags.ts';
import { WORLD_BOSSES } from '../src/bestiary.ts';
import { combatCompanionStats } from '../src/combat-companions.ts';
import { OVERWORLD_SPAWNS, canTraverse } from '../src/realm.ts';
import { COLOSSEUM, COLOSSEUM_PILLARS } from '../src/colosseum.ts';
const dir = mkdtempSync(join(tmpdir(), 'mossvale-companion-')), file = join(dir, 'players.json');
const token = randomBytes(32).toString('base64url'), key = createHash('sha256').update(token).digest('hex');
const bossToken = randomBytes(32).toString('base64url'), bossKey = createHash('sha256').update(bossToken).digest('hex');
const appearance = { skin:'#dca67f', hair:'#49362b', hairStyle:'swept', outfit:'#577956', accent:'#d8b36a', className:'Ranger' };
const seed = { id:randomUUID(), name:'Beastmaster Check', appearance, x:0, z:22, zone:'greenwood', coordinateVersion:2, rotation:0,
  characterCreated:true, ...starterGear('Ranger'), ...newBags(),
  talents:['ranger-4','ranger-5',...Array(3).fill('ranger-pathfinder-1'),'ranger-pathfinder-2','ranger-beastmaster'], talentVersion:TALENT_VERSION,
  level:60, hp:808, maxHp:808, xp:0, gold:0, inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},
  learnedSpells:['arrow'], ridingRank:0, ownedMounts:[], ownedPets:['moss-fox'], summonedPet:'moss-fox',
  tamedCompanion:{kind:'moss-slime',level:1,hp:50}, quest:{stage:0,kills:0,crystals:0} };
const boss = WORLD_BOSSES[0], bossSeed = {...structuredClone(seed),id:randomUUID(),name:'Boss Tame Check',x:boss.x,z:boss.z+2,zone:boss.zone,tamedCompanion:null};
let game, port, clock = Date.now(); const realNow = Date.now, clients=[]; Date.now = () => clock;
async function until(fn,label) { const end=realNow()+6000; while(realNow()<end){const value=fn();if(value)return value;await delay(10);}throw Error(`Timed out: ${label}`); }
async function tick(ms=1000){
  const frames=clients.filter(c=>c.socket.readyState===WebSocket.OPEN&&c.player()).map(c=>[c,c.snapshot]);
  clock+=ms;
  await until(()=>frames.every(([c,before])=>c.socket.readyState!==WebSocket.OPEN||c.snapshot!==before&&c.snapshot.serverTime===clock),'fresh companion snapshots');
}
async function start(){game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();}
async function connect(loginToken=token,id=seed.id){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);
  c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===id);
  socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(m.type==='snapshot')c.snapshot=m;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  c.send({type:'join',token:loginToken,characterId:id});await until(()=>c.player(),'join');return c;
}
async function stop(){for(const c of clients)c.socket.terminate();await game?.stop();game=null;}
const saved=()=>JSON.parse(readFileSync(file,'utf8'));
try{
  assert(talentsValid(seed),'saved Beastmaster fixture includes its six required branch points');
  writeFileSync(file,JSON.stringify({[key]:{characters:[seed]},[bossKey]:{characters:[bossSeed]}}));
  await start();let c=await connect();
  assert.equal(c.player().combatCompanion.kind,'moss-slime');assert.equal(c.player().combatCompanion.hp,50);
  assert.equal(c.player().summonedPet,'moss-fox','cosmetic pet coexists');
  c.send({type:'combatCompanion',action:'recall'});await until(()=>c.player().combatCompanion?.hp===100,'out-of-combat recall heals');
  c.send({type:'combatCompanion',action:'dismiss'});await until(()=>!c.player().combatCompanion&&c.player().tamedCompanion.dismissed,'dismiss');
  const before=structuredClone(c.player().tamedCompanion),index=c.messages.length;
  c.send({type:'combatCompanion',action:'recall',tamedCompanion:{kind:boss.kind,level:60,hp:808}});
  await until(()=>c.messages.slice(index).some(m=>m.type==='event'),'forged save rejected');await delay(130);
  assert.deepEqual(c.player().tamedCompanion,before);
  const b=await connect(bossToken,bossSeed.id);await tick();const bi=b.messages.length;
  b.send({type:'attack',ability:'tame-beast',targetId:boss.id});
  await until(()=>b.messages.slice(bi).some(m=>m.type==='event'&&/cannot tame/.test(m.text)),'world boss rejected over WebSocket');
  assert.equal(b.player().casting,null);assert.equal(b.player().tamedCompanion,null);
  await stop();assert.deepEqual(saved()[key].characters[0].tamedCompanion,before,'dismissed companion saved');
  const records=saved(),spawn=OVERWORLD_SPAWNS.find(e=>e.kind==='moss-slime'),p=records[key].characters[0];
  Object.assign(p,{x:spawn.x,z:spawn.z+2,zone:spawn.zone});writeFileSync(file,JSON.stringify(records));
  await start();c=await connect();assert.equal(c.player().combatCompanion,null,'dismissal survives reconnect');
  const enemy=await until(()=>c.snapshot.enemies.find(e=>e.kind==='moss-slime'&&e.alive&&Math.hypot(e.x-c.player().x,e.z-c.player().z)<8),'nearby tame target');
  await tick();c.send({type:'attack',ability:'tame-beast',targetId:enemy.id});
  await until(()=>c.player().casting?.ability==='tame-beast','tame cast starts');
  await tick(3001);await until(()=>c.player().combatCompanion&&c.player().tamedCompanion.dismissed!==true,'tame completes');
  assert.equal(c.player().tamedCompanion.kind,enemy.kind);assert.equal(c.player().tamedCompanion.level,enemy.level);
  assert.equal(c.player().tamedCompanion.hp,combatCompanionStats(enemy.level).maxHp);
  assert(c.snapshot.enemies.find(e=>e.id===enemy.id)?.alive,'tame grants no kill or loot');
  const ri=c.messages.length;c.send({type:'combatCompanion',action:'recall'});
  await until(()=>c.messages.slice(ri).some(m=>m.type==='event'&&/Leave combat/.test(m.text)),'recall blocked while engaged');
  await stop();const final=saved(),pet=structuredClone(final[key].characters[0].tamedCompanion);
  const mage=final[key].characters[0];Object.assign(mage,{appearance:{...appearance,className:'Mage'},...starterGear('Mage'),talents:[],learnedSpells:['fireball'],hotbar:['fireball',null,null,null,null,null,null,null],hotbar2:Array(8).fill(null),x:0,z:22,zone:'greenwood',hp:808,maxHp:808});
  writeFileSync(file,JSON.stringify(final));await start();c=await connect();assert.deepEqual(c.player().tamedCompanion,pet);assert.equal(c.player().combatCompanion,null,'class change preserves save but deactivates pet');
  await stop();clock+=30000;
  const hunter={...structuredClone(seed),x:COLOSSEUM.x,z:COLOSSEUM.z,zone:COLOSSEUM.zone,
    talents:['ranger-beastmaster','ranger-everlasting-bond','ranger-everlasting-bond','ranger-4','ranger-5',
      ...Array(3).fill('ranger-pathfinder-1'),...Array(2).fill('ranger-pathfinder-2'),...Array(2).fill('ranger-pathfinder-3'),'ranger-pathfinder-6'],
    tamedCompanion:{kind:'moss-slime',level:60,hp:200}};
  // Stay inside the 2m melee radius including the authored arena floor's height.
  const opponent={...structuredClone(hunter),id:bossSeed.id,name:'Pet Target Check',z:hunter.z+1.9,talents:[],tamedCompanion:null};
  const petHitHp=hunter.tamedCompanion.hp=Math.max(1,Math.round(Math.max(1,spellDamage(SPELLS.arrow,combatStats(opponent))-combatCompanionStats(60).defense)*.2))+1;
  assert(talentsValid(hunter),'ranged command uses a legal Beastmaster build');
  writeFileSync(file,JSON.stringify({[key]:{characters:[hunter]},[bossKey]:{characters:[opponent]}}));
  await start();c=await connect();const rival=await connect(bossToken,opponent.id);
  assert(c.player().pvp&&rival.player().pvp,'both owners are on the colosseum floor');
  const position=[c.player().x,c.player().z],ownerHp=c.player().hp,companionId=`companion:${hunter.id}`;
  c.send({type:'attack',ability:'combined-assault',targetId:opponent.id});
  await until(()=>c.messages.some(m=>m.type==='combat'&&m.ability==='combined-assault'),'Combined Assault accepted with an adjacent companion');
  const hits=()=>c.messages.filter(m=>m.type==='damage'&&m.targetId===opponent.id);
  assert(Math.hypot(c.player().combatCompanion.x-rival.player().x,c.player().combatCompanion.z-rival.player().z)<=2,'companion must already be in melee');
  for(let i=0;i<20&&hits().length<2;i++)await tick(200);
  assert.equal(hits().length,2,'Combined Assault delivers the hunter shot and adjacent pet strike');
  assert(hits().some(hit=>hit.amount===Math.max(1,Math.round(Math.max(1,Math.round(combatCompanionStats(60).damage*1.5)-combatStats(opponent).defense)*.2))),'adjacent pet delivers its empowered hit with PvP reduction');
  assert(Math.hypot(c.player().combatCompanion.x-rival.player().x,c.player().combatCompanion.z-rival.player().z)<=2,'pet remains in melee for its hit');
  assert.deepEqual([c.player().x,c.player().z],position,'Combined Assault does not move the hunter');
  rival.send({type:'attack',ability:'arrow',targetId:companionId});
  await until(()=>rival.messages.some(m=>m.type==='combat'&&m.ability==='arrow'&&m.targets.some(t=>t.id===companionId)),'enemy player spell targets pet');
  await tick(1000);await until(()=>c.player().combatCompanion.hp<petHitHp,'player spell damages pet health');
  assert(c.player().combatCompanion.hp>0,'pet survives first hit for the basic-attack check');
  await tick(600);rival.send({type:'autoAttack',targetId:companionId});
  await until(()=>rival.player().autoAttack?.targetId===companionId,'enemy player selects pet for basic attacks');
  for(let i=0;i<6&&c.player().combatCompanion.hp>0;i++)await tick(1000);
  assert.equal(c.player().combatCompanion.hp,0,'enemy player basic attack defeats the pet');
  assert.equal(c.player().hp,ownerHp,'pet damage and death leave owner health unchanged');
  assert.deepEqual([c.player().x,c.player().z],position,'pet combat never moves its owner');
  assert.equal(rival.player().xp,0);assert.equal(rival.player().gold,0);assert.equal(rival.snapshot.loot.length,0,'pet death awards no loot');
  await stop();assert.equal(saved()[key].characters[0].tamedCompanion.hp,0,'PvP pet damage persists');
  const pillar=COLOSSEUM_PILLARS[0],west={x:pillar.x-6,z:pillar.z},east={x:pillar.x+6,z:pillar.z};
  assert(!canTraverse(west,east),'the actual colosseum pillar blocks the direct route');
  const follower={...structuredClone(seed),...west,zone:COLOSSEUM.zone,tamedCompanion:{kind:'moss-slime',level:60,hp:808}};
  writeFileSync(file,JSON.stringify({[key]:{characters:[follower]}}));await start();c=await connect();
  let lastPet={...c.player().combatCompanion},checkedMessages=c.messages.length;
  const checkPetStep=()=>{
    // A loaded runner can deliver several simulation snapshots before this observer resumes.
    // Check every server step rather than treating the latest snapshot as one movement step.
    for(const message of c.messages.slice(checkedMessages)){
      if(message.type!=='snapshot')continue;
      const pet=message.players.find(player=>player.id===seed.id)?.combatCompanion;
      assert(pet,'following companion remains present');
      assert(canTraverse(lastPet,pet),'companion movement never cuts through the pillar');
      assert(Math.hypot(pet.x-lastPet.x,pet.z-lastPet.z)<=1.21,'companion walks at normal speed without teleporting');
      lastPet={...pet};
    }
    checkedMessages=c.messages.length;
  };
  for(const goal of [{x:west.x,z:pillar.z-6},{x:east.x,z:pillar.z-6},east]){
    while(Math.hypot(c.player().x-goal.x,c.player().z-goal.z)>.01){
      await tick(500);checkPetStep();
      const p=c.player(),gap=Math.hypot(goal.x-p.x,goal.z-p.z),step=Math.min(3,gap);
      const next={x:p.x+(goal.x-p.x)/gap*step,z:p.z+(goal.z-p.z)/gap*step};
      c.send({type:'move',...next,rotation:0,sprint:true});
      await until(()=>Math.hypot(c.player().x-next.x,c.player().z-next.z)<.01,'owner walks around pillar');
      checkPetStep();
    }
  }
  for(let i=0;i<35&&Math.hypot(c.player().combatCompanion.x-east.x,c.player().combatCompanion.z-east.z)>1.51;i++){await tick(200);checkPetStep();}
  assert(Math.hypot(c.player().combatCompanion.x-east.x,c.player().combatCompanion.z-east.z)<=1.51,'following companion walks around cover and reaches its owner');
  await stop();
  const coveredTarget={...structuredClone(opponent),...east};
  writeFileSync(file,JSON.stringify({[key]:{characters:[follower]},[bossKey]:{characters:[coveredTarget]}}));
  await start();c=await connect();const coveredRival=await connect(bossToken,coveredTarget.id);lastPet={...c.player().combatCompanion};checkedMessages=c.messages.length;
  c.send({type:'autoAttack',targetId:coveredTarget.id});
  await until(()=>c.player().autoAttack?.targetId===coveredTarget.id,'command companion toward covered target');
  const coveredHp=coveredRival.player().hp;
  for(let i=0;i<40&&coveredRival.player().hp===coveredHp;i++){await tick(200);checkPetStep();}
  assert(coveredRival.player().hp<coveredHp,'companion navigates around cover and attacks in melee');
  assert.deepEqual({x:c.player().x,z:c.player().z},west,'owner stays behind cover during companion pursuit');
  assert(!canTraverse(c.player(),coveredRival.player()),'owner cannot shoot through the pillar');
  console.log('Combat companion server: tame, authority, persistence, ranged pursuit, adjacent Combined Assault, PvP damage, collision-safe pillar following and covered-target pursuit passed.');
}finally{await stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
