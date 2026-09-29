import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS, ZONES, NPCS, BEACONS, ENDINGS } from '../src/content.ts';

import { toWorld, WORLD_COLLIDERS, canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-campaign-check-'));
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const clients = [];
let game;
let port;
let currentDirectory = dataDir;
const totalXp = p => p.level * (p.level - 1) * 50 + p.xp;

async function until(predicate, label, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await delay(20);
  }
  throw new Error(`Timed out: ${label}`);
}
async function start(directory = dataDir) {
  currentDirectory = directory;
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, keycloak: null, databaseUrl: '' });
  port = await game.start();
}
async function connect(name, token, existing) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const c = Object.assign(existing || {}, { socket, messages: [], snapshot: null, roster: null, welcome: null });
  clients.push(c);
  socket.on('message', raw => {
    const m = JSON.parse(raw.toString());
    c.messages.push(m);
    if (m.type === 'snapshot') c.snapshot = m;
    if (m.type === 'welcome') c.welcome = m;
    if (m.type === 'roster') c.roster = m;
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send = message => socket.send(JSON.stringify(message));
  c.send({ type: 'join', token });
  await until(() => c.roster, 'campaign roster loaded');
  if (!c.roster.characters.length) {
    c.send({ type: 'createCharacter', name, appearance });
    await until(() => c.roster.characters.length, 'created campaign traveler');
  }
  c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id });
  await until(() => c.welcome && c.snapshot, 'entered campaign world');
  c.player = () => c.snapshot.players.find(p => p.id === c.welcome.id);
  return c;
}
async function walk(c, x, z) {
  const path = findPath(c.player(), { x, z }, WORLD_COLLIDERS);
  assert.ok(path.length, `path to ${x},${z} exists`);
  for (const point of path) {
    let p = c.player();
    while (Math.hypot(point.x - p.x, point.z - p.z) > 0.02) {
      assert.ok(p.hp > 0, 'campaign traveler must remain alive');
      if (p.hp < p.maxHp - 48) c.send({ type: 'heal' });
      await delay(110);
      const gap = Math.hypot(point.x - p.x, point.z - p.z), step = Math.min(gap, .72);
      const next = { x:p.x+(point.x-p.x)/gap*step, z:p.z+(point.z-p.z)/gap*step };
      assert.ok(canTraverse(p,next,WORLD_COLLIDERS));
      c.send({ type:'move',zone:p.zone,...next,rotation:Math.atan2(point.x-p.x,point.z-p.z) });
      await until(()=>Math.hypot(c.player().x-next.x,c.player().z-next.z)<.02,'walk step accepted');
      p=c.player();
    }
  }
}
async function interact(c, id, nextChapter) {
  const target = [...NPCS, ...BEACONS].find(n => n.id === id);
  const point=toWorld(target.zone,target);
  await walk(c, point.x, point.z + 2);
  await delay(520);
  c.send({ type: 'interact', targetId: id });
  if (nextChapter !== undefined) await until(() => c.player().quest.chapter === nextChapter, `chapter ${nextChapter + 1} opened`);
  else await delay(180);
}
async function travel(c, destination) {
  const point=toWorld(destination,{x:0,z:22});
  if(process.argv.includes('--travel-only')) await walk(c,point.x,point.z);
  else {
    // Campaign regression tests chapter authority near each town; terrain checks cover the full road geometry.
    const travelers=[...new Set(clients)].filter(client=>client.socket.readyState===WebSocket.OPEN&&client.welcome).map(client=>({client,token:client.welcome.token,name:client.player().name}));
    const characterId=c.welcome.id;await game.stop();
    const path=join(currentDirectory,'players.json'),records=JSON.parse(readFileSync(path));
    const saved=Object.values(records).flatMap(account=>account.characters).find(player=>player.id===characterId);
    Object.assign(saved,point,{zone:destination,coordinateVersion:2});writeFileSync(path,JSON.stringify(records));
    await start(currentDirectory);for(const traveler of travelers)await connect(traveler.name,traveler.token,traveler.client);
  }
  await until(()=>c.player().zone===destination,`walk to ${destination}`);
  assert.equal(c.snapshot.zone,destination);
  assert.ok(c.snapshot.players.every(p=>p.instanceId===null));
  assert.ok(c.snapshot.enemies.length&&c.snapshot.enemies.every(e=>Math.hypot(e.x-c.player().x,e.z-c.player().z)<=200),'overworld interest includes nearby entities');
}
async function fieldObjectives(c) {
  const chapter = CHAPTERS[c.player().quest.chapter];
  const coreEnemyIds = new Set(ZONES.find(zone => zone.id === chapter.zone).enemies.map(enemy => enemy.id));
  const killTarget = chapter.objectives.find(o => o.kind === 'kill');
  assert.ok(killTarget, `${chapter.title} has a field combat objective`);
  const deadline = Date.now() + 50000;
  let lastSpecial = 0;
  while (c.player().quest.progress[killTarget.id] < killTarget.count) {
    assert.ok(Date.now() < deadline, `${chapter.title}: combat objectives must be achievable; player ${JSON.stringify({x:c.player().x,z:c.player().z,hp:c.player().hp,quest:c.player().quest})}; recent events ${JSON.stringify(c.messages.filter(m=>m.type==='event').slice(-5))}`);
    const p = c.player();
    const enemy = c.snapshot.enemies.filter(e => e.alive && coreEnemyIds.has(e.id) && e.kind===killTarget.target).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    assert.ok(enemy);
    if (Math.hypot(enemy.x - p.x, enemy.z - p.z) > 8 || !canTraverse(p,enemy,WORLD_COLLIDERS)) {
      // The connected world's trees and buildings can block a fixed south-of-enemy approach.
      const firingPoints = [4.5,6.5,7.5].flatMap(radius=>Array.from({length:16},(_,i)=>({x:enemy.x+Math.cos(i*Math.PI/8)*radius,z:enemy.z+Math.sin(i*Math.PI/8)*radius})))
        .filter(point=>canTraverse(point,enemy,WORLD_COLLIDERS)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
      const firingPoint = firingPoints.find(point=>{
        const path=findPath(p,point,WORLD_COLLIDERS);
        return path.length&&Math.hypot(path.at(-1).x-point.x,path.at(-1).z-point.z)<.02;
      });
      assert.ok(firingPoint, `a reachable firing position exists for ${enemy.id}`);
      await walk(c,firingPoint.x,firingPoint.z);
      continue; // Enemies can move while the traveler follows the path; use their next snapshot.
    }
    if (c.player().hp < c.player().maxHp - 48) c.send({ type: 'heal' });
    const special = Math.hypot(enemy.x - c.player().x, enemy.z - c.player().z) <= 5 && Date.now() - lastSpecial > 3600;
    c.send({ type: 'attack', skill: special ? 'special' : 'primary', targetId: enemy.id });
    if (special) lastSpecial = Date.now();
    await delay(620);
  }
  for (const node of ZONES.find(z => z.id === c.player().zone).nodes.filter(n => chapter.objectives.some(o => o.kind === 'gather' && o.target === n.kind))) {
    const point=toWorld(c.player().zone,node);
    await walk(c, point.x, point.z + 1);
    const before = c.player().quest.crystals;
    c.send({ type: 'gather', targetId: node.id });
    c.send({ type: 'gather', targetId: node.id });
    await until(() => c.player().quest.crystals === before + 1, `${node.kind} objective advanced once`);
  }
  assert.equal(c.player().quest.stage, 2);
}

async function checkCampaign() {
  const legacyTokens = Array.from({ length: 4 }, () => randomBytes(32).toString('base64url'));
  const legacy = Object.fromEntries(legacyTokens.map((token, stage) => [createHash('sha256').update(token).digest('hex'), {
    id: randomUUID(), name: `Legacy ${stage}`, appearance, x: 0, z: 8, rotation: 0, hp: 100, maxHp: 100, level: 1, xp: 40, gold: 17,
    inventory: { wood: 0, crystal: 2, potion: 3 }, quest: { stage, kills: stage >= 2 ? 3 : stage, crystals: stage >= 2 ? 3 : stage * 2 },
  }]));
  writeFileSync(join(dataDir, 'players.json'), JSON.stringify(legacy));
  await start();
  for (const [stage, token] of legacyTokens.entries()) {
    const c = await connect('Ignored replacement', token);
    assert.equal(c.player().zone, 'greenwood');
    assert.equal(c.player().quest.chapter, stage === 3 ? 1 : 0);
    assert.equal(c.player().quest.stage, stage === 3 ? 1 : stage);
    assert.equal(c.player().gold, 17, 'migration must not grant duplicate rewards');
    assert.equal(c.player().xp, 40);
    if (stage === 1) assert.deepEqual(c.player().quest.progress, { 'grove-slimes': 1, 'grove-crystals': 2 });
    c.socket.close();
  }

  if (process.argv.includes('--migration-only')) { console.log('PASS: legacy quest migration preserves all four stages, identity, XP and gold.'); return; }
  if (process.argv.includes('--travel-only')) {
    const traveler = await connect('Travel regression', legacyTokens[3]);
    await travel(traveler, 'amberwild');
    await travel(traveler, 'greenwood');
    console.log('PASS: seamless walking between open regions with shared world snapshots.');
    return;
  }

  let a = await connect('Lantern traveler');
  let b = await connect('Greenwood witness');
  const aToken = a.welcome.token, bToken = b.welcome.token;
  a.send({ type: 'travel', zone: 'amberwild' });
  a.send({ type: 'travel', zone: 'hollow' });
  a.send({ type: 'chooseEnding', ending: { toString: null } });
  a.send({ type: 'chooseEnding', ending: 'rekindle' });
  a.send({ type: 'interact', targetId: 'sable' });
  await delay(150);
  assert.equal(a.player().zone, 'greenwood');
  assert.equal(a.player().quest.chapter, 0);
  assert.equal(a.player().quest.completed, false);
  await interact(a, 'rowan');
  assert.equal(a.player().quest.stage, 1);
  await fieldObjectives(a);
  await walk(a, 0, -26);
  a.send({ type: 'travel', zone: 'amberwild' });
  await delay(150);
  assert.equal(a.player().zone, 'greenwood', 'legacy travel action cannot teleport across the open world');
  await interact(a, 'rowan', 1);
  console.log('Campaign: Greenwood patrol and legacy migration passed.');

  a.send({ type: 'travel', zone: 'amberwild' });
  await delay(150);
  assert.equal(a.player().zone, 'greenwood', 'legacy travel never replaces walking along the open road');
  await travel(a, 'amberwild');
  await until(() => b.snapshot.population === 2 && b.snapshot.players.length === 2, 'players remain in the shared overworld across region borders');
  a.send({ type: 'chat', text: 'Across the open roads.' });
  await delay(180);
  assert.ok(b.messages.some(m => m.kind === 'chat' && m.text.includes('Across the open roads')));
  assert.ok(a.messages.some(m => m.kind === 'chat' && m.text.includes('Across the open roads')));
  assert.ok(b.snapshot.enemies.some(e=>e.kind==='moss-slime'));
  assert.ok(a.snapshot.enemies.some(e=>e.kind==='briar-sentinel'));
  assert(!b.snapshot.enemies.some(e=>e.id===ZONES.find(zone=>zone.id==='amberwild').enemies[0].id),'distant enemies stay outside the local snapshot');
  await interact(a, 'sable', 2);
  a.send({ type: 'interact', targetId: 'rowan' });
  await delay(150);
  assert.equal(a.player().quest.chapter, 2, 'wrong-zone NPC cannot progress the story');
  await fieldObjectives(a);
  await interact(a, 'sable', 3);
  const amberRoad=toWorld('amberwild',{x:0,z:-26});
  await walk(a, amberRoad.x, amberRoad.z);
  a.send({ type: 'travel', zone: 'frostmarch' });
  await delay(150);
  assert.equal(a.player().zone, 'amberwild', 'legacy travel action cannot bypass walking');
  await interact(a, 'amber-beacon', 4);
  const amberGold = a.player().gold;
  await interact(a, 'amber-beacon');
  assert.equal(a.player().gold, amberGold, 'beacon reward cannot be replayed');
  console.log('Campaign: Amberwild chapters, beacon and zone isolation passed.');

  await travel(a, 'frostmarch');
  await interact(a, 'iona', 5);
  await fieldObjectives(a);
  await interact(a, 'iona', 6);
  await interact(a, 'frost-beacon', 7);
  await game.stop();
  await start();
  a = await connect('Ignored rename', aToken);
  b = await connect('Greenwood witness', bToken);
  assert.equal(a.player().quest.chapter, 7);
  assert.equal(a.player().zone, 'frostmarch', 'checkpoint restores the current zone');
  console.log('Campaign: Frostmarch chapters and checkpoint restart passed.');

  await travel(a, 'hollow');
  const wardenIds = new Set(ZONES.find(zone => zone.id === 'hollow').enemies.map(enemy => enemy.id));
  const coreWardens = a.snapshot.enemies.filter(enemy => wardenIds.has(enemy.id));
  assert.equal(coreWardens.length,1);
  assert.equal(coreWardens[0].kind,'root-warden');
  await fieldObjectives(a);
  assert.equal(a.player().quest.kills, 1);
  assert.equal(a.player().quest.crystals, 3);
  await interact(a, 'eris', 8);
  a.send({ type: 'chooseEnding', ending: 'release' });
  await delay(150);
  assert.equal(a.player().quest.completed, false, 'ending requires returning to Rowan');
  await travel(a, 'frostmarch');
  await travel(a, 'amberwild');
  await travel(a, 'greenwood');
  await interact(a, 'rowan');
  assert.equal(a.player().quest.stage, 2);
  assert.ok(a.messages.some(m => m.type === 'dialogue' && m.choices?.length === 2));
  const goldBeforeEnding = a.player().gold, xpBeforeEnding = totalXp(a.player()), potionsBeforeEnding = a.player().inventory.potion;
  await game.stop();
  const alternateDir = join(dataDir, 'alternate-ending');
  mkdirSync(alternateDir);
  copyFileSync(join(dataDir, 'players.json'), join(alternateDir, 'players.json'));

  for (const ending of ['rekindle', 'release']) {
    const directory = ending === 'rekindle' ? dataDir : alternateDir;
    await start(directory);
    a = await connect('Lantern traveler', aToken);
    a.send({ type: 'chooseEnding', ending });
    a.send({ type: 'chooseEnding', ending: ending === 'rekindle' ? 'release' : 'rekindle' });
    await until(() => a.player().quest.completed, `${ending} ending completed`);
    assert.equal(a.player().quest.ending, ending);
    assert.equal(a.player().gold, goldBeforeEnding + CHAPTERS[8].reward.gold);
    assert.equal(totalXp(a.player()), xpBeforeEnding + CHAPTERS[8].reward.xp);
    assert.equal(a.player().inventory.potion, potionsBeforeEnding + CHAPTERS[8].reward.potions);
    assert.ok(a.messages.some(m => m.type === 'dialogue' && m.title === ENDINGS[ending].title && m.lines.includes(ENDINGS[ending].epilogue[0])));
    const finished = structuredClone(a.player());
    await interact(a, 'rowan');
    a.send({ type: 'chooseEnding', ending });
    await delay(150);
    assert.equal(a.player().gold, finished.gold, 'final reward remains exactly once');
    assert.equal(totalXp(a.player()), totalXp(finished));
    await game.stop();
    await start(directory);
    a = await connect('Lantern traveler', aToken);
    assert.equal(a.player().quest.ending, ending);
    assert.equal(a.player().quest.completed, true);
    assert.equal(a.player().quest.stage, 3);
    assert.equal(a.player().gold, finished.gold);
    await travel(a, 'amberwild');
    assert.equal(a.player().quest.completed, true, 'completed travelers can revisit the zones');
    await game.stop();
  }
  assert.notEqual(ENDINGS.rekindle.title, ENDINGS.release.title);
  assert.notDeepEqual(ENDINGS.rekindle.epilogue, ENDINGS.release.epilogue);
  console.log('PASS: all 9 chapters across 4 zones; legacy migration; seeded regional checkpoints; world chat and shared overworld snapshots; wrong-zone interactions; boss and heartroots; checkpoint restart; both distinct persistent endings and exactly-once rewards.');
}
try {
  await checkCampaign();
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop();
  rmSync(dataDir, { recursive: true, force: true });
}
