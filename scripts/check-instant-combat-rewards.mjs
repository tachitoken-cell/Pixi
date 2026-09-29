import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear, gearById } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newRaidProgress } from '../src/raid-progression.ts';
import { INSTANT_COMBAT, instantCombatEncounter, instantCombatWaveReward } from '../src/instant-combat.ts';
import { INSTANT_COMBAT_MAPS } from '../src/instant-combat-maps.ts';

// Keep real signup, attacks, both boss shields, personal loot and saving. Compress only
// geometry and creature stats; authored traversal and difficulty have separate checks.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-ic-rewards-')), file = join(dir, 'players.json');
const realNow = Date.now, realRandom = Math.random, monsters = structuredClone(MONSTERS), clients = [];
const maps = INSTANT_COMBAT_MAPS.map(map => ({ map, original: { ...map } }));
let startsAt = Date.UTC(2026, 8, 28), game, port;
while (instantCombatEncounter(startsAt).bossModel !== 'ossuary-tyrant') startsAt += INSTANT_COMBAT.intervalMs;
let clock = startsAt - INSTANT_COMBAT.registrationMs + 1;
Date.now = () => clock;
const hash = token => createHash('sha256').update(token).digest('hex');
const heroes = [16,31,60,16].map((level,index) => ({
  id: randomUUID(), name: `Reward Fighter ${index}`, x: 0, z: 8, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
  appearance: { skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger' },
  characterCreated: true, talents: [], learnedSpells: ['arrow'], ...starterGear('Ranger'), ...newBags(),
  level, xp: 0, gold: 0, hp: 100 + (level-1)*12, maxHp: 100 + (level-1)*12,
  inventory: { wood:0,crystal:0,herb:0,potion:0,relic:0 }, carriedItems: {}, quest: { stage:0,kills:0,crystals:0 }, raidProgress: newRaidProgress(),
}));
const specialist = { id: randomUUID(), className:'Ranger', jobXp:0, upgrade:0, broken:false, attempts:0, source:'quest', sealed:false };
heroes[2].raidProgress.specialists.push(specialist); heroes[2].raidProgress.activeSpecialistId = specialist.id;
const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
const stored = index => JSON.parse(readFileSync(file,'utf8'))[hash(tokens[index])].characters[0];
async function until(predicate,label) { const end=realNow()+6000; while(realNow()<end) { const value=predicate(); if(value)return value; await delay(12); } throw Error(`Timed out: ${label}`); }
async function tick(ms=1000) { clock+=ms; await delay(120); }
async function start() { game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'',economyVersion:1});port=await game.start(); }
async function stop() { for(const client of clients.splice(0))client.socket.terminate();await game?.stop();game=null; }
async function connect(index) {
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`), client={socket,index,id:heroes[index].id,messages:[],fighting:[]};clients.push(client);
  client.send=message=>socket.send(JSON.stringify(message));client.player=()=>client.snapshot?.players.find(player=>player.id===client.id);
  socket.on('message',raw=>{
    const message=JSON.parse(raw);
    if(message.type==='snapshot') {
      client.snapshot=message;
      const run=message.instantCombat.run,player=client.player();
      if(run?.phase==='fighting'&&player)client.fighting.push({round:run.round,subwave:run.subwave,totalSubwaves:run.totalSubwaves,enemies:run.enemiesRemaining,loot:message.loot.length,gold:player.gold,xp:player.xp,jobXp:player.raidProgress.specialists.reduce((sum,card)=>sum+card.jobXp,0)});
    } else client.messages.push(message);
  });
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  client.send({type:'join',token:tokens[index],characterId:client.id});await until(()=>client.player(),'world entry');return client;
}
const drops = client => client.snapshot.loot.filter(drop=>drop.ownerId===client.id);
async function rejected(client,dropId,label) {
  const before=client.player().gold,index=client.messages.length;
  client.send({type:'loot',targetId:dropId});
  await until(()=>client.messages.slice(index).some(message=>message.type==='event'&&message.kind==='info'),label);
  assert.equal(client.player().gold,before);
}
async function clearRound(leaders,round) {
  const gold=leaders.map(client=>client.player().gold);
  for(let attempt=0;attempt<60&&leaders.some(client=>client.snapshot.instantCombat.run?.phase==='fighting');attempt++) {
    for(const client of leaders) if(client.snapshot.instantCombat.run?.phase==='fighting') {
      const alive=client.snapshot.enemies.filter(enemy=>enemy.alive);
      const target=alive.find(enemy=>enemy.instantCombatRole==='anchor')||alive[0];
      if(target)client.send({type:'autoAttack',targetId:target.id});
    }
    await tick();
  }
  for(const [index,client] of leaders.entries()) {
    client.send({type:'autoAttack',targetId:null});
    const samples=client.fighting.filter(sample=>sample.round===round);
    assert.deepEqual([...new Set(samples.filter(sample=>sample.enemies>0).map(sample=>sample.subwave))],[1,2,3],`round ${round} spawns all three subwaves`);
    for(const sample of samples) {
      assert.equal(sample.totalSubwaves,3);
      assert.equal(sample.loot,0,`round ${round} group ${sample.subwave}: no enemy or intermediate group drops`);
      assert.equal(sample.gold,gold[index],`round ${round} group ${sample.subwave}: no direct Gold award`);
      assert.equal(sample.xp,0,`round ${round} group ${sample.subwave}: character XP waits for final completion`);
      assert.equal(sample.jobXp,0,`round ${round} group ${sample.subwave}: specialist XP waits for final completion`);
    }
    assert.equal(client.snapshot.instantCombat.run?.phase,round===5?'completed':'intermission',`round ${round} cleared through actual combat`);
    assert.equal(client.snapshot.instantCombat.run.round,round);
    assert.equal(client.snapshot.instantCombat.run.subwave,3);
    assert(client.snapshot.loot.every(drop=>drop.instantCombatRound),'individual event enemies never create corpse loot');
    assert.equal(drops(client).length,1,'one personal reward per three-group round');
    assert.equal(drops(client)[0].instantCombatRound,round);
    assert.equal(drops(client)[0].expiresAt,client.snapshot.instantCombat.run.phaseEndsAt);
  }
}
try {
  for(const stats of Object.values(MONSTERS))Object.assign(stats,{hp:1,damage:1,speed:0,aggroRange:0});
  for(const {map} of maps)Object.assign(map,{colliders:[],spawn:{x:0,z:0},boss:{x:0,z:0},waveRadius:4,mechanicRadius:4});
  Math.random=()=>.19;
  writeFileSync(file,JSON.stringify(Object.fromEntries(heroes.map((player,index)=>[hash(tokens[index]),{characters:[player]}]))));
  await start();const all=await Promise.all(heroes.map((_,index)=>connect(index))),leaders=all.slice(0,3),leaver=all[3];
  for(const client of all)client.send({type:'instantCombatRegister'});
  await until(()=>all.every(client=>client.snapshot.instantCombat.registered),'all brackets register');
  await tick(startsAt-clock);await until(()=>all.every(client=>client.snapshot.instantCombat.run?.phase==='preparing'),'event preparation');
  await tick(INSTANT_COMBAT.preparationMs);const collectedGold=[0,0,0],expired=[];
  for(let round=1;round<=5;round++) {
    await clearRound(leaders,round);
    if(round===1) {
      await rejected(leaver,drops(leaders[0])[0].id,'another player cannot claim a personal reward');
      const abandoned=drops(leaver)[0].id;leaver.send({type:'instantCombatLeave'});
      await until(()=>!leaver.snapshot.instanceId,'leave after a cleared wave');
      await until(()=>!leaders[0].snapshot.loot.some(drop=>drop.id===abandoned),'leaving removes unclaimed personal rewards');
    }
    const ids=leaders.map(client=>drops(client)[0].id);
    await tick(1);assert.deepEqual(leaders.map(client=>drops(client).map(drop=>drop.id)),ids.map(id=>[id]),'repeated ticks never duplicate the cleared wave');
    for(const [index,client] of leaders.entries()) {
      const drop=drops(client)[0],reward=instantCombatWaveReward(client.snapshot.instantCombat.run.bracketId,round,true);
      assert.equal(drop.gold,reward.gold);
      if(round===5) {
        const gear=drop.items.filter(item=>item.kind==='gear');assert.equal(gear.length,1,'one existing20% cache roll succeeds at .19');
        assert(['rare','epic','legendary','mythic'].includes(gear[0].quality));
        const equipment=gearById(gear[0].itemId);assert(!equipment.className||equipment.className===client.player().appearance.className);assert(equipment.requiredLevel<=client.player().level);
      }
      if(round===2&&index===1) { expired.push({client,id:drop.id});continue; }
      client.send({type:'loot',targetId:drop.id});collectedGold[index]+=reward.gold;
      await until(()=>client.player().gold===collectedGold[index]&&!client.snapshot.loot.some(row=>row.id===drop.id),'personal reward durably collected');
      assert.equal(stored(index).gold,collectedGold[index]);
      await rejected(client,drop.id,'a collected reward cannot replay');
    }
    if(round<5) {
      await tick(Math.max(...leaders.map(client=>client.snapshot.instantCombat.run.phaseEndsAt))-clock);
      await until(()=>leaders.every(client=>client.snapshot.instantCombat.run?.phase==='fighting'),'next wave starts after pickup window');
      for(const entry of expired.splice(0)) {assert(!entry.client.snapshot.loot.some(drop=>drop.id===entry.id));await rejected(entry.client,entry.id,'expired reward cannot be collected');}
    }
  }
  assert.deepEqual(leaders.map(client=>client.player().xp),[600,1200,0]);
  assert.equal(leaders[2].player().raidProgress.specialists[0].jobXp,0,'disabled specialists cannot earn final XP at character cap');
  await tick(1000);assert.deepEqual(leaders.map(client=>client.player().xp),[600,1200,0]);assert.equal(leaders[2].player().raidProgress.specialists[0].jobXp,0,'completion cannot repeat XP/SP');
  await tick(Math.max(...leaders.map(client=>client.snapshot.instantCombat.run.phaseEndsAt))-clock);
  await until(()=>leaders.every(client=>!client.snapshot.instanceId),'final30-second return');
  await stop();assert.deepEqual([0,1,2].map(index=>stored(index).gold),collectedGold);assert.equal(stored(3).gold,0);assert.equal(stored(3).xp,0,'leaving before final clear grants no completion XP');
  assert.deepEqual([0,1,2].map(index=>stored(index).xp),[600,1200,0]);assert.equal(stored(2).raidProgress.specialists[0].jobXp,0);
  assert.equal(stored(2).raidProgress.activeSpecialistId,specialist.id,'saved card selection is retained without being activated');
  await start();const restored=await connect(2);assert.equal(restored.player().raidProgress.activeSpecialistId,null,'restart never exposes the old card as active');assert.equal(restored.player().gold,collectedGold[2]);assert.equal(restored.player().raidProgress.specialists[0].jobXp,0);assert(!restored.snapshot.instanceId);assert.equal(drops(restored).length,0);
  console.log('PASS Instant Combat rewards: real five-round clears with all three subwaves and boss shields, three brackets, no drops or XP between groups, one personal timed cache per round, foreign/expired/replayed pickup rejection, leave cleanup, exact increasing Gold, class-matched rare gear, final XP/SP once, durable claims and restart.');
} finally {
  await stop();Date.now=realNow;Math.random=realRandom;
  for(const [kind,stats] of Object.entries(monsters))Object.assign(MONSTERS[kind],stats);
  for(const {map,original} of maps)Object.assign(map,original);
  rmSync(dir,{recursive:true,force:true});
}
