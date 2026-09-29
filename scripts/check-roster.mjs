import { COMMUNITY_VERSION } from '../src/community.ts';
import { createGatheringNodes } from '../src/gathering-nodes.ts';
import { NPCS } from '../src/content.ts';
import { defaultHotbar } from '../src/spells.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { movementCost } from '../src/landscape.ts';
import { WALK_SPEED } from '../src/travel.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-roster-'));
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const tokens = Array.from({ length: 3 }, () => randomBytes(32).toString('base64url'));
const key = token => createHash('sha256').update(token).digest('hex');
const base = { id: randomUUID(), name: 'Old.Traveler', appearance, zone: 'greenwood', x: -9, z: -3, rotation: 0,
  hp: 148, maxHp: 148, level: 5, xp: 7, gold: 160, inventory: { wood: 40, crystal: 20, potion: 3, herb: 10 },
  skills: { mining: 75, woodcutting: 40, herbalism: 20 }, quest: { chapter: 0, stage: 1, kills: 1, crystals: 0, progress: { 'grove-slimes': 1, 'grove-crystals': 0 }, completed: false, ending: null } };
const pending = { ...structuredClone(base), id: randomUUID(), name: 'Old draft', characterCreated: false, x: 0, z: 8, hp: 100, maxHp: 100, level: 1, xp: 0, gold: 0,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 3 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
  quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: { 'grove-slimes': 0, 'grove-crystals': 0 }, completed: false, ending: null } };
const legacy = { [key(tokens[0])]: base, [key(tokens[1])]: { ...structuredClone(base), id: randomUUID(), name: 'Second owner', appearance: { ...appearance, className: 'Mage' } }, [key(tokens[2])]: pending };
writeFileSync(join(dataDir, 'players.json'), JSON.stringify(legacy));
const clients = [];
const merchant=VILLAGE_NPCS.find(npc=>npc.id==='village-pinewake-merchant'),realNow=Date.now;
let game, port, clockOffset=0;
Date.now=()=>realNow()+clockOffset;
async function until(predicate, label, timeout = 4500) {
  const end = realNow() + timeout;
  while (realNow() < end) { const result = predicate(); if (result) return result; await delay(20); }
  throw new Error(`Timed out: ${label}`);
}
async function start() {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' });
  port = await game.start();
}
async function connect(token, characterId) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const c = { socket, roster: null, snapshot: null, welcome: null, closeCode: null, messages: [] }; clients.push(c);
  socket.on('message', raw => {
    const m = JSON.parse(raw.toString()); c.messages.push(m);
    if (m.type === 'roster') { c.roster = m; c.welcome = null; c.snapshot = null; }
    if (m.type === 'snapshot') c.snapshot = m;
    if (m.type === 'welcome') c.welcome = m;
  });
  socket.on('close', code => { c.closeCode = code; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send = m => socket.send(JSON.stringify(m));
  c.send({ type: 'join', token, characterId });
  await until(() => c.roster || c.welcome, 'authenticated account');
  c.send({type:'acceptCommunityRules',version:COMMUNITY_VERSION});
  await until(() => c.messages.some(m => m.type === 'community' && m.accepted), 'community rules accepted');
  c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  return c;
}
async function create(c, name, className = 'Ranger') {
  const size = c.roster.characters.length;
  c.send({ type: 'createCharacter', name, appearance: { ...appearance, className } });
  await until(() => c.roster.characters.length === size + 1, `created ${name}`);
  return c.roster.characters.at(-1);
}
async function enter(c, characterId) {
  const messageStart = c.messages.length;
  c.send({ type: 'selectCharacter', characterId });
  await until(() => c.welcome?.id === characterId && c.player()?.id === characterId, 'character selected');
  const received = c.messages.slice(messageStart);
  const welcomeIndex = received.findIndex(m => m.type === 'welcome');
  const arrivalIndex = received.findIndex(m => m.type === 'event' && m.playerId === characterId && m.text.includes('arrived'));
  assert.ok(welcomeIndex >= 0 && (arrivalIndex < 0 || arrivalIndex > welcomeIndex), 'welcome must precede the arrival event');
}
async function leave(c) {
  c.roster = null; c.send({ type: 'leaveWorld' });
  await until(() => c.roster, 'returned to character roster');
}
async function walk(c,goal) {
  const path=findPath(c.player(),goal,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length,'the requested route is walkable');
  for(const waypoint of path)while(Math.hypot(c.player().x-waypoint.x,c.player().z-waypoint.z)>.001) {
    const p=c.player(),gap=Math.hypot(waypoint.x-p.x,waypoint.z-p.z),step=Math.min(2.8,gap),to={x:p.x+(waypoint.x-p.x)/gap*step,z:p.z+(waypoint.z-p.z)/gap*step};
    clockOffset+=Math.ceil(movementCost(p,to)/WALK_SPEED*1000)+30;
    c.send({type:'move',...to,rotation:0});await until(()=>Math.hypot(c.player().x-to.x,c.player().z-to.z)<.001,'accepted route movement');
  }
}
const population = async () => (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).players;

try {
  await start();
  let a = await connect(tokens[0]), b = await connect(tokens[1]);
  const oldDraft = await connect(tokens[2]);
  assert.deepEqual(oldDraft.roster.characters, [], 'unplayed legacy drafts migrate to an empty roster');
  const migrated = a.roster.characters[0];
  const legacyExpected = { ...base, skills:{...base.skills,fishing:0}, inventory:{...base.inventory,relic:0},coordinateVersion:2,hotbar:defaultHotbar('Ranger', base.level).slice(0,8),abilityCooldowns:{},craftingXp:0,contracts:{active:{},completed:{}},instanceId:null, ...starterGear('Ranger'), characterCreated: true, talents: [], gathering: null };
  assert.equal(a.roster.characters.length, 1);
  assert.deepEqual(Object.fromEntries(Object.keys(legacyExpected).map(key => [key, migrated[key]])), legacyExpected, 'legacy character identity and every existing progress field are preserved alongside new default fields');
  assert.equal(a.welcome, null);
  assert.equal(a.snapshot, null);
  assert.equal(await population(), 0, 'signed-in rosters do not create world presence');
  const oldId = a.roster.characters[0].id, foreignId = b.roster.characters[0].id;
  for (const m of [{ type: 'move', zone: 'greenwood', x: -8.5, z: -3, rotation: 0 }, { type: 'chat', text: 'Roster must be silent' }, { type: 'attack' }, { type: 'gather' }, { type: 'interact' }, { type: 'heal' }, { type: 'learnTalent', talentId: 'ranger-1' }, { type: 'buyGear', itemId: 'lantern-charm',npcId:merchant.id }, { type: 'sellResource', resource: 'wood', quantity: 2,npcId:merchant.id }, { type: 'selectCharacter', characterId: foreignId }, { type: 'selectCharacter', characterId: { invalid: true } }]) a.send(m);
  await delay(180);
  assert.equal(a.welcome, null, 'world actions and foreign selection cannot bypass the roster');
  assert.ok(!b.messages.some(m => m.kind === 'chat'));
  await leave(a);
  assert.equal(a.roster.characters[0].gold, 160);
  assert.equal(a.roster.characters[0].x, -9);

  const fresh = await connect();
  const freshToken = fresh.roster.token;
  assert.deepEqual(fresh.roster.characters, []);
  assert.equal(fresh.roster.maxCharacters, 6);
  for (const name of ['', 'A', '<script>', 'X'.repeat(21), { invalid: true }]) fresh.send({ type: 'createCharacter', name, appearance });
  fresh.send({ type: 'createCharacter', name: 'Wrong class', appearance: { ...appearance, className: 'Rogue' } });
  await delay(180);
  assert.deepEqual(fresh.roster.characters, []);
  for (let i = 0; i < 6; i++) await create(fresh, `Character ${i}`, ['Ranger', 'Knight', 'Mage'][i % 3]);
  fresh.send({ type: 'createCharacter', name: 'Seventh character', appearance });
  await delay(150);
  assert.equal(fresh.roster.characters.length, 6, 'six-slot limit is authoritative');
  assert.equal(new Set(fresh.roster.characters.map(p => p.id)).size, 6);
  assert.equal(fresh.welcome, null, 'creating characters never enters the world');
  assert.equal(await population(), 0);
  for (const p of fresh.roster.characters) {
    assert.equal(p.characterCreated, true); assert.equal(p.gold, 0); assert.equal(p.level, 1);
    assert.deepEqual(p.ownedGear, starterGear(p.appearance.className).ownedGear);
  }
  const alt = await create(a, 'New Keeper', 'Knight');
  a.send({ type: 'createCharacter', name: 'NEW KEEPER', appearance });
  await delay(150);
  assert.equal(a.roster.characters.length, 2, 'case-insensitive duplicate names are rejected per account');
  assert.equal(a.roster.characters[0].id, oldId);
  await enter(a, oldId);
  assert.equal(await population(), 1);
  await walk(a,{x:merchant.x,z:merchant.z-2});
  a.send({ type: 'buyGear', itemId: 'warden-longbow',npcId:merchant.id });
  a.send({ type: 'equipGear', itemId: 'warden-longbow' });
  await until(() => a.player().equipment.weapon === 'warden-longbow', 'first gear change durably completes');
  a.send({ type: 'buyGear', itemId: 'lantern-charm',npcId:merchant.id });
  a.send({ type: 'equipGear', itemId: 'lantern-charm' });
  await until(() => a.player().equipment.charm === 'lantern-charm', 'second gear change durably completes');
  a.send({ type: 'sellResource', resource: 'wood', quantity: 2,npcId:merchant.id });
  await until(() => a.player().inventory.wood === 38, 'resource sale durably completes');
  a.send({ type: 'learnTalent', talentId: 'ranger-1' });
  await until(() => a.player().talents.includes('ranger-1') && a.player().equipment.charm === 'lantern-charm', 'old character progression updated');
  assert.equal(a.player().gold, 66);
  const crystal = createGatheringNodes().find(node => node.id === 'crystal-0');
  await walk(a,{x:crystal.x,z:crystal.z});
  a.send({ type: 'gather', targetId: 'crystal-0' });
  await until(() => a.player().gathering, 'gathering started');
  await leave(a);
  const preserved = structuredClone(a.roster.characters.find(p => p.id === oldId));
  assert.equal(preserved.gathering, null);
  await enter(b, foreignId);
  await walk(b,{x:crystal.x,z:crystal.z});
  b.send({ type: 'gather', targetId: 'crystal-0' });
  await until(() => b.player().gathering, 'leaving world releases the resource claim');
  await until(() => b.player().inventory.crystal === 21, 'other account can finish the released gather');
  await leave(b);
  await enter(a, alt.id);
  assert.equal(a.player().gold, 0); assert.equal(a.player().level, 1);
  assert.deepEqual(a.player().skills, { mining: 0, woodcutting: 0, herbalism: 0, fishing: 0 });
  assert.deepEqual(a.player().inventory, { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 0 });
  assert.deepEqual(a.player().talents, []);
  a.send({ type: 'equipGear', itemId: 'lantern-charm' });
  a.send({ type: 'appearance', name: 'Renamed', appearance });
  a.send({ type: 'createCharacter', name: 'While playing', appearance });
  await delay(150);
  assert.equal(a.player().equipment.charm, null, 'ownership is per character');
  assert.equal(a.player().name, 'New Keeper');
  const rowan = NPCS.find(npc => npc.id === 'rowan');
  await walk(a, { x: rowan.x, z: rowan.z + 2 });
  a.send({ type: 'interact' });
  await until(() => a.player().quest.stage === 1, 'alt accepts its own first quest');
  assert.equal(a.player().quest.kills, 0);
  await leave(a);
  assert.deepEqual(a.roster.characters.find(p => p.id === oldId), preserved, 'gold, equipment, skills and story do not bleed across characters');
  assert.equal(a.roster.characters.find(p => p.id === alt.id).quest.stage, 1);
  await enter(a, oldId);
  const firstConnection = a;
  a = await connect(tokens[0]);
  await until(() => firstConnection.closeCode === 4001, 'account connection takeover');
  assert.equal(a.welcome, null, 'fresh login returns to roster even if another device was in-world');
  assert.equal(await population(), 0);
  const replay = await connect(tokens[0], oldId);
  await until(() => replay.player(), 'explicit network reconnect resumes selected character');
  assert.equal(replay.welcome.id, oldId);
  assert.equal(replay.player().gold, 66);
  assert.equal(replay.player().equipment.weapon, 'warden-longbow');
  assert.equal(await population(), 1);
  const foreignResume = await connect(tokens[0], foreignId);
  assert.equal(foreignResume.welcome, null, 'foreign reconnect id never selects an owned fallback');
  assert.equal(foreignResume.roster.characters.length, 2);
  assert.equal(await population(), 0);

  await game.stop();
  const disk = readFileSync(join(dataDir, 'players.json'), 'utf8');
  assert.ok(!disk.includes('gathering') && ![...tokens, freshToken].some(token => disk.includes(token)));
  const saved = JSON.parse(disk);
  assert.deepEqual(saved[key(tokens[2])], { characters: [], communityRulesVersion: COMMUNITY_VERSION });
  assert.equal(saved[key(tokens[0])].characters.length, 2);
  assert.equal(saved[key(freshToken)].characters.length, 6);
  await start();
  a = await connect(tokens[0]);
  assert.equal(a.welcome, null);
  assert.deepEqual(a.roster.characters.find(p => p.id === oldId), preserved);
  assert.equal(a.roster.characters.find(p => p.id === alt.id).quest.stage, 1);
  assert.equal((await connect(freshToken)).roster.characters.length, 6);

  const invalidDir = join(dataDir, 'invalid'); mkdirSync(invalidDir);
  const invalidFile = join(invalidDir, 'players.json');
  for (const corrupt of [r => { r[key(tokens[0])].characters = null; }, r => { r[key(tokens[0])].extra = true; }, r => { r[key(tokens[0])].characters[0].xp = -1; }, r => { r[key(tokens[0])].characters[0].characterCreated = false; }, r => { r[key(tokens[0])].characters.push(structuredClone(r[key(tokens[0])].characters[0])); }, r => { r[key(tokens[1])].characters[0].id = oldId; }, r => { r[key(freshToken)].characters.push({ ...structuredClone(r[key(freshToken)].characters[0]), id: randomUUID(), name: 'Seventh' }); }, r => { r[key(tokens[2])] = { ...structuredClone(pending), xp: 1 }; }]) {
    const r = structuredClone(saved); corrupt(r); const text = JSON.stringify(r); writeFileSync(invalidFile, text);
    assert.throws(() => createGameServer({ dataDir: invalidDir, keycloak: null, databaseUrl: '' }), /Invalid .*save/);
    assert.equal(readFileSync(invalidFile, 'utf8'), text, 'corrupt ownership or progressed pending data is preserved');
  }
  console.log('PASS: private six-character rosters; explicit enter/leave; immutable identities; legacy/pending migration; per-character gear, gold, skills and story; claim release; account takeover; owned reconnect; restart persistence and corruption preservation.');
} finally {
  for (const c of clients) c.socket.terminate();
  await game?.stop();
  Date.now=realNow;
  rmSync(dataDir, { recursive: true, force: true });
}
