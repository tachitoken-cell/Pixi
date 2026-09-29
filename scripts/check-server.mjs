import { COMMUNITY_VERSION } from '../src/community.ts';
import { NPCS } from '../src/content.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';
import { GLOBAL_ATTACK_MS } from '../src/spells.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { findPath } from '../src/navigation.ts';
import { WORLD_COLLIDERS, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { WORLD_GATHERING_NODES } from '../src/gathering-nodes.ts';
import { movementCost } from '../src/landscape.ts';
import { WALK_SPEED } from '../src/travel.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-check-'));
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const clients = [], rowan = NPCS.find(npc => npc.id === 'rowan');
let game;
const realNow = Date.now; let movementClock = 0;
Date.now = () => realNow() + movementClock;
const slimeSpawns = ['slime-0','slime-1','slime-2'].map(id => OVERWORLD_SPAWNS.find(enemy => enemy.id === id));

async function until(predicate, label, timeout = 4000) {
  const deadline = realNow() + timeout;
  while (realNow() < deadline) {
    const result = predicate();
    if (result) return result;
    await delay(25);
  }
  throw new Error(`Timed out: ${label}`);
}

async function connect(port, name, token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const client = { socket, messages: [], snapshot: null, roster: null, welcome: null };
  clients.push(client);
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString());
    client.messages.push(message);
    if (message.type === 'snapshot') client.snapshot = message;
    if (message.type === 'welcome') client.welcome = message;
    if (message.type === 'roster') client.roster = message;
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send = message => socket.send(JSON.stringify(message));
  client.send({ type: 'join', token });
  await until(() => client.roster, `${name} roster loaded`);
  client.send({type:'acceptCommunityRules',version:COMMUNITY_VERSION});
  await until(()=>client.messages.some(message=>message.type==='community'&&message.accepted),`${name} accepted community rules`);
  if (!client.roster.characters.length) {
    client.send({ type: 'createCharacter', name, appearance });
    await until(() => client.roster.characters.length, `${name} created`);
  }
  client.send({ type: 'selectCharacter', characterId: client.roster.characters[0].id });
  await until(() => client.welcome && client.snapshot, `${name} entered`);
  client.player = () => client.snapshot.players.find(p => p.id === client.welcome.id);
  return client;
}

async function walk(client, x, z) {
  const path = findPath(client.player(), { x, z }, WORLD_COLLIDERS);
  assert(path.length, `a walkable route reaches ${x},${z}`);
  for (const destination of path) {
  let p = client.player();
  while (Math.hypot(destination.x - p.x, destination.z - p.z) > 0.05) {
    const gap = Math.hypot(destination.x - p.x, destination.z - p.z);
    const step = Math.min(gap, 2);
    const nextX = p.x + (destination.x - p.x) / gap * step;
    const nextZ = p.z + (destination.z - p.z) / gap * step;
    movementClock += Math.ceil(movementCost(p, {x:nextX,z:nextZ}) / WALK_SPEED * 1000) + 10;
    client.send({ type: 'move', x: nextX, z: nextZ, rotation: Math.atan2(x - p.x, z - p.z) });
    await until(() => Math.abs(client.player().x - nextX) < 0.01 && Math.abs(client.player().z - nextZ) < 0.01, 'movement accepted');
    p = client.player();
  }
  }
}

async function collect(client) {
  const drop = await until(() => client.snapshot.loot.find(item => item.ownerId === client.welcome.id && item.gold > 0), 'personal corpse loot appears');
  const gold = client.player().gold;
  await walk(client, drop.x, drop.z);
  await delay(Math.max(0, (drop.diedAt || 0) + DEATH_ANIMATION_MS - Date.now()) + 20);
  client.send({ type: 'loot', targetId: drop.id, itemId: 'gold' });
  await until(() => client.player().gold === gold + drop.gold, 'corpse gold collected');
  assert.ok(!client.snapshot.loot.some(item => item.id === drop.id && item.gold > 0));
}

async function kill(client, targetId) {
  const kills = client.player().quest.kills;
  for (let attempt = 0; attempt < 8 && client.player().quest.kills === kills; attempt++) {
    client.send({ type: 'attack', targetId });
    await delay(GLOBAL_ATTACK_MS + 150);
  }
  assert.equal(client.player().quest.kills, kills + 1, 'combat must advance the quest by one kill');
  await collect(client);
}

try {
  game = createGameServer({ databaseUrl: '', port: 0, host: '127.0.0.1', dataDir, keycloak: null });
  const port = await game.start();
  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  assert.equal(health.ok, true);
  let a = await connect(port, 'Ada');
  const b = await connect(port, 'Bea');
  await until(() => a.snapshot.players.length === 2 && b.snapshot.players.length === 2, 'two real players share a world');
  a.send({ type: 'chat', text: 'Hello, grove!' });
  await until(() => b.messages.some(m => m.kind === 'chat' && m.text === 'Ada: Hello, grove!'), 'chat delivered to other player');

  for (const malformed of ['{', 'null', '[]', '42', '{"type":"move","x":1e999,"z":8,"rotation":0}']) a.socket.send(malformed);
  a.send({ type: 'appearance', appearance: { ...appearance, skin: { toString: null } } });
  a.send({ type: 'attack', skill: { toString: null } });
  a.send({ type: 'unknown', xp: 999999, gold: 999999 });
  await delay(200);
  assert.equal(a.player().gold, 0);
  assert.equal(a.player().xp, 0);
  assert.equal(a.player().appearance.skin, appearance.skin);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).players, 2, 'malformed payloads must not crash or create players');

  a.send({ type: 'move', x: 30, z: 30, rotation: 0, gold: 999999 });
  await delay(220);
  assert.equal(a.player().x, 0, 'teleports must be rejected');
  assert.equal(a.player().gold, 0, 'client cannot set gold');
  a.send({ type: 'move', x: 0, z: 999, rotation: 0 });
  await delay(150);
  assert.equal(a.player().z, 8, 'world bounds must be enforced');
  a.send({ type: 'appearance', appearance: { ...appearance, outfit: 'url(javascript:bad)' } });
  await delay(150);
  assert.equal(a.player().appearance.outfit, appearance.outfit);

  await walk(a, rowan.x, rowan.z + 2);
  await until(() => b.snapshot.players.find(p => p.id === a.welcome.id)?.z === rowan.z + 2, 'movement replicated to other client');
  a.send({ type: 'interact' });
  await until(() => a.player().quest.stage === 1, 'quest accepted at Rowan');
  await walk(a, slimeSpawns[0].x + 8, slimeSpawns[0].z);
  const slime = await until(() => a.snapshot.enemies.find(e => e.id === 'slime-0' && Math.hypot(e.x - a.player().x, e.z - a.player().z) < 12), 'slime in arrow range');
  assert.equal(slime.hp, 44);
  a.send({ type: 'attack', skill: 'primary', targetId: slimeSpawns[0].id });
  a.send({ type: 'attack', skill: 'primary', targetId: slimeSpawns[0].id });
  a.send({ type: 'attack', skill: 'primary', targetId: slimeSpawns[0].id });
  await until(() => a.snapshot.enemies.find(e => e.id === slime.id).hp === 28, 'primary damage lands before reconnect');
  a = await connect(port, 'Ada', a.welcome.token);
  a.send({ type: 'attack', skill: 'primary', targetId: slimeSpawns[0].id });
  await delay(120);
  assert.equal(a.snapshot.enemies.find(e => e.id === slime.id).hp, 28, 'rapid attacks share a cooldown');
  assert.equal(a.snapshot.players.length, 2, 'reconnect replaces the old session');
  assert.equal(a.player().gold, 0, 'damage does not award a kill');
  await delay(GLOBAL_ATTACK_MS);
  a.send({ type: 'attack', targetId: slime.id });
  await delay(GLOBAL_ATTACK_MS + 150);
  a.send({ type: 'attack', targetId: slime.id });
  await until(() => a.player().quest.kills === 1, 'kill XP and objective credit awarded');
  assert.equal(a.player().gold, 0, 'kills leave gold on the corpse until collected');
  assert.equal(a.player().xp, MONSTERS['moss-slime'].xp);
  assert.equal(a.player().quest.kills, 1);
  assert.equal(a.snapshot.enemies.find(e => e.id === slime.id).alive, false);
  a.send({ type: 'attack' });
  await delay(200);
  assert.equal(a.player().gold, 0, 'dead enemy cannot award gold automatically');
  assert.equal(a.snapshot.loot.filter(drop => drop.ownerId === a.welcome.id).length, 1, 'dead enemy leaves exactly one personal drop');
  await collect(a);
  assert.equal(a.player().gold, 8);

  for (const spawn of slimeSpawns.slice(1)) {
    await walk(a, spawn.x + 8, spawn.z);
    await kill(a, spawn.id);
  }
  assert.equal(a.player().gold, 24);
  assert.equal(a.player().level, 1, 'three monster kills no longer grant a full level');
  assert.equal(a.player().xp, 21);
  const crystalStops = ['crystal-2','crystal-0','crystal-1'].map(id => WORLD_GATHERING_NODES.find(node => node.id === id));
  for (const [index, {x, z, id}] of crystalStops.entries()) {
    await walk(a, x, z);
    a.send({ type: 'gather', targetId: id });
    a.send({ type: 'gather', targetId: id });
    await until(() => a.player().inventory.crystal === index + 1, 'crystal gathered once', 8000);
    assert.equal(a.player().quest.crystals, index + 1);
    assert.equal(a.snapshot.nodes.find(n => n.id === id).available, false);
  }
  assert.equal(a.player().quest.stage, 2, 'three kills and three crystals complete the objectives');
  assert.equal(a.player().xp, 57);
  a.send({ type: 'interact' });
  await delay(150);
  assert.equal(a.player().quest.stage, 2, 'quest cannot be turned in remotely');
  await walk(a, rowan.x, rowan.z + 2);
  const potionsBeforeReward = a.player().inventory.potion;
  a.send({ type: 'interact' });
  a.send({ type: 'interact' });
  await until(() => a.player().quest.chapter === 1, 'patrol reward claimed and next story chapter opened');
  assert.equal(a.player().gold, 84);
  assert.equal(a.player().level, 2, 'the quest turn-in levels up and carries excess XP');
  assert.equal(a.player().xp, 57);
  assert.equal(a.player().inventory.potion, potionsBeforeReward + 2);
  await delay(550);
  a.send({ type: 'interact' });
  await delay(150);
  assert.equal(a.player().quest.chapter, 1, 'Rowan cannot reset the story to a repeat patrol');
  assert.equal(a.player().quest.kills, 0);
  assert.equal(a.player().quest.crystals, 0);
  assert.equal(a.player().gold, 84, 'repeating interact cannot claim the old reward again');
  assert.equal(a.player().xp, 57);

  await walk(a, slimeSpawns[0].x + 1, slimeSpawns[0].z);
  await until(() => a.player().hp <= a.player().maxHp - 64, 'slimes inflict real combat damage', 45000);
  const damagedHp = a.player().hp;
  const potionsBeforeHeal = a.player().inventory.potion;
  a.send({ type: 'heal' });
  a.send({ type: 'heal' });
  await until(() => a.player().inventory.potion === potionsBeforeHeal - 1, 'one healing potion consumed');
  assert.ok(a.player().hp > damagedHp, 'potion restores health');
  await delay(180);
  assert.equal(a.player().inventory.potion, potionsBeforeHeal - 1, 'healing cooldown prevents duplicate consumption');
  await until(() => a.player().hp === 0, 'enemies can defeat the player', 45000);
  const dead = structuredClone(a.player());
  a.send({ type: 'move', x: dead.x + 0.2, z: dead.z, rotation: 0 });
  a.send({ type: 'attack', skill: 'primary', targetId: slimeSpawns[0].id });
  a.send({ type: 'heal' });
  a.send({ type: 'gather' });
  await delay(200);
  assert.deepEqual(a.player(), dead, 'fallen players cannot move, earn rewards, or spend healing potions');
  await delay(Math.max(0, dead.diedAt + DEATH_ANIMATION_MS - Date.now()) + 20);
  a.send({ type: 'respawn' });
  await until(() => a.player().hp === a.player().maxHp, 'respawn restores health');
  assert.equal(a.player().x, 0);
  assert.equal(a.player().z, 22);
  assert.deepEqual(a.player().inventory, dead.inventory);
  assert.equal(a.player().gold, 84);
  a.send({ type: 'heal' });
  await delay(150);
  assert.deepEqual(a.player().inventory, dead.inventory, 'healing at full health wastes no potion');

  const savedToken = a.welcome.token;
  const savedId = a.welcome.id;
  await game.stop();
  const disk = readFileSync(join(dataDir, 'players.json'), 'utf8');
  assert.ok(!disk.includes(savedToken), 'session tokens are not saved in plaintext');
  game = createGameServer({ databaseUrl: '', port: 0, host: '127.0.0.1', dataDir, keycloak: null });
  const reconnect = await connect(await game.start(), 'Changed name', savedToken);
  assert.equal(reconnect.welcome.id, savedId);
  assert.equal(reconnect.player().name, 'Ada');
  assert.equal(reconnect.player().gold, 84);
  assert.equal(reconnect.player().xp, 57);
  assert.equal(reconnect.player().inventory.crystal, 3);
  assert.equal(reconnect.player().quest.kills, 0);
  assert.equal(reconnect.player().quest.stage, 1);
  assert.equal(reconnect.player().quest.chapter, 1);
  assert.equal(reconnect.player().hp, reconnect.player().maxHp);

  const invalidDir = join(dataDir, 'invalid');
  mkdirSync(invalidDir);
  const invalidPath = join(invalidDir, 'players.json');
  const validRecords = JSON.parse(disk);
  Object.values(validRecords)[0].characters[0].xp = -1;
  for (const corrupt of ['', '{broken', 'null', '[]', '{"bad-key":{}}', JSON.stringify(validRecords)]) {
    writeFileSync(invalidPath, corrupt);
    assert.throws(() => createGameServer({ databaseUrl: '', port: 0, dataDir: invalidDir, keycloak: null }), 'corrupt save must stop startup');
    assert.equal(readFileSync(invalidPath, 'utf8'), corrupt, 'failed recovery must preserve the original save');
  }
  rmSync(invalidPath);
  writeFileSync(`${invalidPath}.tmp`, 'unfinished-save');
  assert.throws(() => createGameServer({ databaseUrl: '', port: 0, dataDir: invalidDir, keycloak: null }), /Incomplete player save/);
  assert.equal(readFileSync(`${invalidPath}.tmp`, 'utf8'), 'unfinished-save');
  rmSync(`${invalidPath}.tmp`);
  const emptyGame = createGameServer({ databaseUrl: '', port: 0, host: '127.0.0.1', dataDir: invalidDir, keycloak: null });
  await emptyGame.start();
  await emptyGame.stop();
  assert.equal(existsSync(invalidPath), false, 'an empty world does not create an empty player save');
  console.log('PASS: two-client movement/chat; malformed-input validation; reconnect-safe attack cooldown; manual corpse looting; 3-kill/3-crystal quest, level-up and once-only turn-in; heal/death/respawn; atomic save/reconnect; corrupt and incomplete save preservation.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop();
  Date.now = realNow;
  rmSync(dataDir, { recursive: true, force: true });
}
