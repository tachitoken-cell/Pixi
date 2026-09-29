import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { LEGACY_DUNGEONS as DUNGEONS, DUNGEON_EXIT, dungeonStages, dungeonLayout, dungeonBounds, dungeonColliders, dungeonRoomPortalOpen, inDungeonPreparation } from '../src/dungeon.ts';
import { MONSTERS, THEMED_DUNGEON_ROSTERS } from '../src/bestiary.ts';
import { starterGear, gearById } from '../src/progression.ts';
import { newContracts } from '../src/adventure.ts';
import { newBags } from '../src/bags.ts';
import { lootRows } from '../src/loot-items.ts';
import { findPath } from '../src/navigation.ts';
import { canTraverse } from '../src/realm.ts';
import { installCollisionScene } from '../src/collision3d.ts';

// Keep real dungeon entry, staged kills, seal activation, loot ownership and saving.
// Compress stages and geometry into an open test hall; keep the preparation area
// and an optional encounter after the boss. The outer room covers this open hall;
// the inner encounter marker still starts its timer. Authored routes have a separate check.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-themed-loot-')), file = join(dir, 'players.json');
const realNow = Date.now, realRandom = Math.random, originals = [], clients = [];
let offset = 0, game, port;
Date.now = () => realNow() + offset;
const definitions = DUNGEONS.slice(4), heroes = {}, tokens = {};
const hash = token => createHash('sha256').update(token).digest('hex');
for (const definition of definitions) {
  const stages = dungeonStages(definition.id), layout = dungeonLayout(definition.id), kinds = THEMED_DUNGEON_ROSTERS[definition.id];
  originals.push({ stages, oldStages: [...stages], layout, oldLayout: { ...layout } });
  stages.splice(0, stages.length, ...[['threshold', definition.minLevel, kinds[0], []], ['confluence', definition.minLevel + 2, kinds.at(-2), ['threshold']], ['interlude', definition.minLevel + 2, kinds[0], ['confluence']], ['throne', definition.maxLevel, kinds.at(-1), ['interlude']], ['last-branch', definition.minLevel, kinds[0], ['throne']]].map(([id, level, kind, requires]) => ({ id, name: `${definition.name} ${id}`, level, x: 0, z: -19, requires, optional: id === 'last-branch', enemies: [{ kind, x: 0, z: -19, ...(id === 'confluence' || id === 'throne' ? { boss: true } : {}) }] })));
  Object.assign(layout, { colliders: [], gates: [], portals: [], doors: [],
    rooms: [{ id: 'preparation', x: 0, z: -1, width: 40, depth: 58 }, { id: 'threshold', x: 0, z: -19, width: 14, depth: 14 }], bounds: { minX: -20, maxX: 20, minZ: -30, maxZ: 28 },
    objects: [['test-side-cache','chest',2],['verdant-seal','seal',1],['glacial-seal','seal',-1]].map(([id,kind,x]) => ({ id, kind, label: id, stageId: 'threshold', x, z: -19, r: 1 })) });
  for (const [index, className] of ['Ranger', 'Mage', 'Cleric'].entries()) {
    const id = `${definition.id}-${index}`, level = index ? definition.minLevel : 60, bag = randomUUID();
    heroes[id] = { id: randomUUID(), name: id, x: definition.entrance.x, z: definition.entrance.z + 1, zone: definition.entrance.zone, coordinateVersion: 2, rotation: 0,
      characterCreated: true, appearance: { skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className },
      level, xp: 0, gold: 0, hp: 100 + (level-1)*12, maxHp: 100 + (level-1)*12, talents: [], ...starterGear(className), ...newBags(),
      ownedBags: [{ id: bag, kind: 'runewoven-holdall' }], equippedBags: [bag,null,null,null],
      inventory: { wood:0,crystal:0,herb:0,relic:0,potion:0 }, contracts: newContracts(),
      quest: { chapter:0,stage:0,kills:0,crystals:0,progress:Object.fromEntries(CHAPTERS[0].objectives.map(o=>[o.id,0])),completed:false,ending:null } };
    tokens[id] = randomBytes(32).toString('base64url');
  }
}
const monsterOriginals = structuredClone(MONSTERS);
async function until(fn, label, timeout = 6000) { const end = realNow()+timeout; while(realNow()<end) { const result=fn(); if(result)return result; await delay(12); } throw Error(`Timed out: ${label}`); }
async function tick(ms=1100) {
  const frames=clients.filter(c=>c.snapshot&&c.socket.readyState===WebSocket.OPEN).map(c=>[c,c.snapshot]);
  offset+=ms; const after=Date.now();
  await until(()=>frames.every(([c,before])=>c.socket.readyState!==WebSocket.OPEN||c.snapshot!==before&&c.snapshot.serverTime>=after),'fresh reward-test snapshots after clock advance');
}
async function connect(id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, id: heroes[id].id, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p=>p.id===c.id); c.drop = id => c.snapshot?.loot.find(drop=>drop.id===id);
  socket.on('message',raw=>{const message=JSON.parse(raw); if(message.type==='snapshot')c.snapshot=message;else c.messages.push(message);});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);}); c.send({type:'join',token:tokens[id],characterId:c.id});await until(()=>c.player(),`join ${id}`); return c;
}
async function party(leader, member) { await tick(); leader.send({type:'partyInvite',targetId:member.id}); const invite=await until(()=>member.snapshot.partyInvites[0],'party invite');member.send({type:'partyAccept',invitationId:invite.id});await until(()=>member.snapshot.party?.members.some(p=>p.id===leader.id),'party accepted'); }
async function walk(c,goal) {
  const state=c.snapshot.dungeon,colliders=dungeonColliders(state.clearedStages,state.objects.filter(o=>o.activated).map(o=>o.id),state.kind),bounds=dungeonBounds(state.kind),path=findPath(c.player(),goal,colliders,bounds);
  if (!path.length) {
    assert(inDungeonPreparation(c.player(), state.kind), 'reward-test travel only crosses from sanctuary to its compressed encounter chamber');
    const portal = dungeonLayout(state.kind).portals.find(portal => portal.roomId === 'preparation' && portal.targetRoomId === 'threshold');
    assert(dungeonRoomPortalOpen(portal, state.clearedStages, state.objects.filter(object => object.activated).map(object => object.id)), 'real entry portal is available');
    await walk(c, portal); c.send({ type: 'dungeonInteract', targetId: portal.id });
    await until(() => Math.hypot(c.player().x - portal.destination.x, c.player().z - portal.destination.z) < .01, 'authoritative entry into reward-test chamber');
    return walk(c, goal);
  }
  assert(path.length);
  for(const point of path)while(Math.hypot(c.player().x-point.x,c.player().z-point.z)>1e-6){const p=c.player(),gap=Math.hypot(point.x-p.x,point.z-p.z),step=Math.min(2.5,gap),next={x:p.x+(point.x-p.x)*step/gap,z:p.z+(point.z-p.z)*step/gap};assert(canTraverse(p,next,colliders,bounds));offset+=450;c.send({type:'move',...next,rotation:0});await until(()=>Math.hypot(c.player().x-next.x,c.player().z-next.z)<1e-6,`accepted movement (hp=${c.player().hp}, goal=${JSON.stringify(goal)}, next=${JSON.stringify(next)})`);}
}
async function reject(c,message,label) { await tick();const index=c.messages.length,before=JSON.stringify({gear:c.player().ownedGear,inventory:c.player().inventory,gold:c.player().gold});c.send(message);await until(()=>c.messages.slice(index).some(m=>m.type==='event'&&m.kind==='info'),label);assert.equal(JSON.stringify({gear:c.player().ownedGear,inventory:c.player().inventory,gold:c.player().gold}),before); }
async function kill(c,stage) {
  const enemy = await until(()=>c.snapshot.enemies.find(enemy=>enemy.alive&&enemy.id.includes(`-${stage}-0-`)),`${stage} spawned`);
  await tick();c.send({type:'autoAttack',targetId:enemy.id});for(let i=0;i<8&&c.snapshot.enemies.find(e=>e.id===enemy.id)?.alive;i++)await tick(1500);
  await until(()=>c.snapshot.dungeon.clearedStages.includes(stage),`${stage} clears`);c.send({type:'autoAttack',targetId:null});await tick(2000);return enemy;
}
function equipment(drop) { return lootRows(drop).filter(row=>row.kind==='gear'); }
async function collect(c,drop,remote=false) { if(!remote)await walk(c,drop); const ids=equipment(drop).map(row=>row.itemId); c.send({type:'loot',targetId:drop.id}); await until(()=>ids.every(id=>c.player().ownedGear.includes(id))&&!c.drop(drop.id),'atomic personal pickup');const after=structuredClone(c.player().ownedGear);await reject(c,{type:'loot',targetId:drop.id},'collected corpse cannot replay');assert.deepEqual(c.player().ownedGear,after); }
let requestId=0;
async function leaderboard(c,dungeonId,partySize=3) { await tick(600);const id=++requestId;c.send({type:'dungeonLeaderboard',dungeonId,partySize,requestId:id});const reply=await until(()=>c.messages.find(m=>m.type==='dungeonLeaderboard'&&m.requestId===id),'leaderboard reply');assert.equal(reply.error,undefined);assert.equal(reply.dungeonId,dungeonId);assert.equal(reply.partySize,partySize);return reply.entries; }
const totalXp = player => player.level*(player.level-1)*50+player.xp;
const options = {port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'',localGmAccountKeys:[hash(tokens['emberfall-2'])]};
try {
  for(const stats of Object.values(MONSTERS)) Object.assign(stats,{hp:1,speed:0,aggroRange:0,damage:0});
  writeFileSync(file,JSON.stringify(Object.fromEntries(Object.keys(heroes).map(id=>[hash(tokens[id]),{characters:[heroes[id]]}]))));
  game=createGameServer(options);port=await game.start();
  // The compressed reward hall needs matching physical geometry as well as its
  // logical layout; authored walls belong to the separate dungeon-route checks.
  const vertices=new Float32Array([-.5,-.5,-.5,.5,-.5,-.5,.5,.5,-.5,-.5,.5,-.5,-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5]);
  const indices=new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);
  const buffer=new ArrayBuffer(vertices.byteLength+indices.byteLength);
  new Float32Array(buffer,0,vertices.length).set(vertices);new Uint32Array(buffer,vertices.byteLength,indices.length).set(indices);
  for(const definition of definitions)await installCollisionScene(`dungeon-${definition.id}`,{
    shapes:[{vertexOffset:0,vertexCount:8,indexOffset:vertices.byteLength,indexCount:indices.length}],
    instances:[{shape:0,matrix:[40,0,0,0,0,1,0,0,0,0,58,0,0,-.5,-1,1],tag:'reward-test-floor'}],
  },buffer);
  const c={},collected=[];
  for(const definition of definitions) {
    // Each scenario owns one party; unrelated dungeon parties need no live sockets.
    for(let i=0;i<3;i++)c[`${definition.id}-${i}`]=await connect(`${definition.id}-${i}`);
    const gearExpected = definition.id !== 'emberfall';
    Math.random = () => gearExpected ? .19 : .99; // First/third runs hit tier chances but miss generic 15%; middle run misses all equipment.
    const owner=c[`${definition.id}-0`],friend=c[`${definition.id}-1`],camper=c[`${definition.id}-2`],members=[owner,friend,camper];
    await party(owner,friend);await party(owner,camper);await tick();owner.send({type:'dungeonEnter',dungeonId:definition.id});await until(()=>members.every(member=>member.snapshot.dungeon?.kind===definition.id),'party enters');
    await tick(5000);assert.equal(owner.snapshot.dungeon.startedAt,0);assert.equal(owner.snapshot.dungeon.elapsedMs,0);assert.equal(owner.snapshot.dungeon.kills,0);assert.equal(owner.snapshot.dungeon.totalKills,5);
    assert.deepEqual(await leaderboard(owner,definition.id),[]);
    await walk(owner,{x:0,z:10});await tick();assert.equal(owner.snapshot.dungeon.startedAt,0,'walking outside the preparation ward but before a combat room stays untimed');
    await walk(owner,{x:0,z:-17});await walk(friend,{x:12,z:-17});
    const startedAt=owner.snapshot.dungeon.startedAt;assert(startedAt>0);const elapsed=owner.snapshot.dungeon.elapsedMs;await tick(1000);assert(owner.snapshot.dungeon.elapsedMs>elapsed,'timer advances after leaving preparation');
    if(definition.id==='veilhaven') { camper.send({type:'dungeonExit'});await until(()=>!camper.snapshot.dungeon,'camper leaves active run');await tick();camper.send({type:'dungeonEnter',dungeonId:definition.id});await until(()=>camper.snapshot.dungeon?.id===owner.snapshot.dungeon.id,'camper rejoins original run');assert.equal(camper.snapshot.dungeon.startedAt,startedAt,'rejoin cannot reset timer'); }
    await kill(owner,'threshold'); owner.send({type:'dungeonInteract',targetId:'test-side-cache'});await until(()=>owner.snapshot.dungeon.objects.find(o=>o.id==='test-side-cache').activated,'side cache opens');
    await until(()=>members.every(member=>member.snapshot.loot.some(drop=>drop.ownerId===member.id&&drop.sourceObjectId==='test-side-cache')),'every member receives its cache snapshot');
    const cacheDrops=members.map(member=>member.snapshot.loot.find(drop=>drop.ownerId===member.id&&drop.sourceObjectId==='test-side-cache'));assert(cacheDrops.every(Boolean));
    for(let i=0;i<members.length;i++){assert.equal(equipment(cacheDrops[i]).length,gearExpected?1:0);assert(lootRows(cacheDrops[i]).some(row=>row.itemId==='relic'));if(gearExpected){const row=equipment(cacheDrops[i])[0],gear=gearById(row.itemId);assert.equal(row.quality,'rare');assert.equal(gear.requiredLevel,definition.minLevel);assert.equal(gear.className,members[i].player().appearance.className);}}
    await reject(friend,{type:'loot',targetId:cacheDrops[0].id},'party member cannot take another cache');
    const stable=JSON.stringify(cacheDrops[0]);await tick(5000);assert.equal(JSON.stringify(owner.drop(cacheDrops[0].id)),stable,'looking and waiting never rerolls cache gear');
    await reject(owner,{type:'dungeonInteract',targetId:'test-side-cache'},'cache activation cannot replay');
    for(const id of ['verdant-seal','glacial-seal']){await tick();owner.send({type:'dungeonInteract',targetId:id});await until(()=>owner.snapshot.dungeon.objects.find(o=>o.id===id).activated,'seal activates');}
    const midpointOwnerLevels=[owner.player().level,friend.player().level];
    const mid=await kill(owner,'confluence');assert(!owner.snapshot.dungeon.completed);
    const midDrops=[owner,friend].map(member=>member.snapshot.loot.find(drop=>drop.ownerId===member.id&&drop.enemyId===mid.id));assert(midDrops.every(Boolean));assert(!camper.snapshot.loot.some(drop=>drop.ownerId===camper.id&&drop.enemyId===mid.id),'uncredited distant player does not get midpoint corpse loot');
    for(let i=0;i<2;i++){assert.equal(equipment(midDrops[i]).length,gearExpected?1:0,'midpoint has exactly one tier roll and no generic gear');assert(lootRows(midDrops[i]).some(row=>row.itemId==='relic'));if(gearExpected){const row=equipment(midDrops[i])[0],gear=gearById(row.itemId);assert.equal(row.quality,'rare');assert.equal(gear.requiredLevel,Math.min(midpointOwnerLevels[i],definition.minLevel+2));assert.notEqual(row.itemId,equipment(cacheDrops[i])[0].itemId,'unclaimed side-cache gear cannot collide with midpoint loot');}}
    await reject(friend,{type:'loot',targetId:midDrops[0].id},'boss corpse is personal');
    const midStable=JSON.stringify(owner.drop(midDrops[0].id));await tick(3000);assert.equal(JSON.stringify(owner.drop(midDrops[0].id)),midStable);
    await collect(owner,midDrops[0]);await collect(friend,midDrops[1]);await walk(friend,{x:12,z:-17});
    await kill(owner,'interlude');
    const camperXp=totalXp(camper.player());
    const final=await kill(owner,'throne');await until(()=>members.every(member=>member.snapshot.dungeon.result),'final boss produces personal results before optional encounters');assert.equal(owner.snapshot.dungeon.completed,true);assert.equal(owner.snapshot.dungeon.kills,4);
    for(const member of members)assert.equal(member.player().achievements.dungeons[definition.id],1);
    assert(!camper.snapshot.loot.some(drop=>drop.ownerId===camper.id&&drop.enemyId===final.id),'distant camper has no ordinary boss corpse');
    const finishedDuration=owner.snapshot.dungeon.elapsedMs;await kill(owner,'last-branch');assert.equal(owner.snapshot.dungeon.elapsedMs,finishedDuration,'optional exploration does not change the final time');
    const duration=owner.snapshot.dungeon.elapsedMs;assert(duration>0);assert.equal(owner.snapshot.dungeon.startedAt,startedAt);assert.equal(owner.snapshot.dungeon.kills,4);assert.equal(totalXp(camper.player())-camperXp,definition.completionXp,'completion XP granted to distant member exactly once');
    const finalDrops=members.map(member=>member.drop(member.snapshot.dungeon.result.lootId));assert(finalDrops.every(Boolean),'every member gets a separate completion reward');
    for(let i=0;i<3;i++){const result=members[i].snapshot.dungeon.result;assert.equal(result.durationMs,duration);assert.equal(result.kills,4);assert.equal(result.wipes,0);assert.equal(result.partySize,3);assert.equal(result.claimed,false);assert.equal(result.xp,i?definition.completionXp:0);assert.deepEqual(result.items,finalDrops[i].items);assert.notEqual(finalDrops[i].enemyId,final.id);assert.equal(equipment(finalDrops[i]).length,gearExpected?1:0,'boss clear has one conditional completion roll');if(gearExpected){const row=equipment(finalDrops[i])[0],gear=gearById(row.itemId);assert.equal(row.quality,'epic');assert.equal(gear.requiredLevel,Math.min(members[i].player().level,definition.maxLevel));assert.equal(gear.className,members[i].player().appearance.className);}assert.equal(finalDrops[i].relic,0);assert.equal(result.items.find(row=>row.itemId==='relic').quantity,Math.max(1,Math.floor(definition.maxLevel/10))+2+Math.floor((definition.minLevel-10)/5));}
    await reject(friend,{type:'loot',targetId:finalDrops[0].id},'completion reward cannot be claimed by another member');
    const xp=members.map(member=>totalXp(member.player()));await tick(6000);assert.deepEqual(members.map(member=>totalXp(member.player())),xp);assert.equal(owner.snapshot.dungeon.elapsedMs,duration,'completion freezes timer');
    const ranked=definition.id==='plagueworks';await until(()=>ranked?owner.snapshot.dungeon.result.ranked:owner.snapshot.dungeon.result.unrankedReason,'leaderboard saved or excluded');
    const entries=await leaderboard(owner,definition.id);assert.equal(entries.length,ranked?1:0);assert.deepEqual(await leaderboard(owner,definition.id,1),[],'solo and party boards are separate');
    if(ranked){assert.equal(entries[0].id,owner.snapshot.dungeon.id);assert.equal(entries[0].durationMs,duration);assert.equal(entries[0].kills,4);assert.equal(entries[0].partySize,3);assert.equal(entries[0].realmId,'eu');assert.deepEqual(entries[0].members.map(m=>m.id),members.map(m=>m.id));assert(entries[0].members.every(m=>Object.keys(m).sort().join(',')==='className,id,level,name'),'leaderboard never exposes account keys');}
    else {assert.equal(owner.snapshot.dungeon.result.ranked,false);assert.match(owner.snapshot.dungeon.result.unrankedReason,definition.id==='emberfall'?/game master/:/party changed/);}
    await reject(owner,{type:'dungeonLeaderboard',dungeonId:definition.id,partySize:3,durationMs:1},'client cannot submit a record through leaderboard request');
    for(const member of members){assert.equal(member.player().achievements.dungeons[definition.id],1);assert.equal(member.messages.filter(m=>m.type==='event'&&m.kind==='reward'&&m.text.startsWith(`${definition.name.replace(/^The /,'')} cleared ·`)).length,1);}
    for(let i=0;i<3;i++){const member=members[i];await walk(member,{x:0,z:0});assert(Math.hypot(member.player().x-finalDrops[i].x,member.player().z-finalDrops[i].z)>3,'claim starts away from the reward drop');
      if(i===0){const before=member.player().inventory.crystal,quantity=finalDrops[i].items.find(row=>row.itemId==='crystal').quantity;mkdirSync(file+'.tmp');try{await reject(member,{type:'loot',targetId:finalDrops[i].id,itemId:'resource:crystal'},'failed completion save preserves reward');assert.equal(member.snapshot.dungeon.result.claimed,false);assert(member.drop(finalDrops[i].id).items.some(row=>row.id==='resource:crystal'));}finally{rmSync(file+'.tmp',{recursive:true,force:true});}
        member.send({type:'loot',targetId:finalDrops[i].id,itemId:'resource:crystal'});await until(()=>member.player().inventory.crystal===before+quantity&&!member.snapshot.dungeon.result.remainingItemIds.includes('resource:crystal'),'partial completion claim saves once');await reject(member,{type:'loot',targetId:finalDrops[i].id,itemId:'resource:crystal'},'claimed completion item cannot replay');}
      if(definition.id!=='plagueworks'||i===1){await collect(member,finalDrops[i],true);assert.equal(member.snapshot.dungeon.result.claimed,true);assert.deepEqual(member.snapshot.dungeon.result.remainingItemIds,[]);}await collect(member,cacheDrops[i]);if(gearExpected)collected.push([`${definition.id}-${i}`,equipment(finalDrops[i])[0].itemId]);}
    if(definition.id==='plagueworks'){
      const completedId=owner.snapshot.dungeon.id,pending=[owner,camper].map(member=>[member,structuredClone(member.drop(member.snapshot.dungeon.result.lootId))]);
      assert(!pending[0][1].items.some(row=>row.id==='resource:crystal'),'partial claim stays claimed before exit');
      for(const member of members){await walk(member,DUNGEON_EXIT);member.send({type:'dungeonExit'});await until(()=>!member.snapshot.dungeon&&!member.player().instanceId,'completed party returns through exit');}
      for(const [member,before] of pending){const drop=member.drop(before.id);assert(drop,'unclaimed completion reward follows its owner outside');assert.equal(drop.instanceId,null);assert.deepEqual(drop.items,before.items);assert.equal(drop.ownerId,member.id);assert.equal(drop.zone,member.player().zone);assert.equal(drop.x,member.player().x);assert.equal(drop.z,member.player().z);assert(drop.expiresAt>Date.now()&&drop.expiresAt<=Date.now()+300000);}
      await reject(friend,{type:'loot',targetId:pending[0][1].id},'exported completion reward remains personal');
      mkdirSync(file+'.tmp');try{await reject(owner,{type:'loot',targetId:pending[0][1].id},'failed world reward save preserves exported loot');assert.deepEqual(owner.drop(pending[0][1].id).items,pending[0][1].items);}finally{rmSync(file+'.tmp',{recursive:true,force:true});}
      for(const [member,drop] of pending)await collect(member,drop,true);
      assert.deepEqual(members.map(member=>totalXp(member.player())),xp,'leaving and collecting never awards completion XP twice');
      await tick();owner.send({type:'dungeonEnter',dungeonId:definition.id});await until(()=>members.every(member=>member.snapshot.dungeon&&member.snapshot.dungeon.id!==completedId),'next entrance opens a fresh party run');
      for(const member of members){assert.equal(member.snapshot.dungeon.completed,false);assert.equal(member.snapshot.dungeon.startedAt,0);assert.equal(member.snapshot.dungeon.result,undefined);}
    }
    for(const member of members)member.socket.close();
    await until(()=>members.every(member=>member.socket.readyState===WebSocket.CLOSED),'scenario party disconnects');
    console.log(`PASS ${definition.id}: final-boss completion with optional enemies, preparation/running/frozen timer, personal results and supplies, remote partial/full claims, failed-save retry, owner/replay checks, once-only XP, ${ranked?'durable leaderboard':definition.id==='emberfall'?'GM excluded':'changed roster excluded'}.`);
  }
  await game.stop();game=null;
  const stored=JSON.parse(readFileSync(file,'utf8'));for(const [id,gear] of collected)assert(stored[hash(tokens[id])].characters[0].ownedGear.includes(gear),'saved ownership preserves the exact scaled rolled ID');
  const records=JSON.parse(readFileSync(join(dir,'dungeon-records-eu.json'),'utf8'));assert.equal(records.length,1);assert.equal(records[0].dungeonId,'plagueworks');
  game=createGameServer(options);port=await game.start();const restarted=await connect('plagueworks-0');assert.deepEqual(await leaderboard(restarted,'plagueworks'),records,'leaderboard survives game server restart');
} finally {
  Math.random=realRandom;for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;
  for(const state of originals){state.stages.splice(0,state.stages.length,...state.oldStages);Object.assign(state.layout,state.oldLayout);}for(const [kind,stats] of Object.entries(monsterOriginals))Object.assign(MONSTERS[kind],stats);rmSync(dir,{recursive:true,force:true});
}
