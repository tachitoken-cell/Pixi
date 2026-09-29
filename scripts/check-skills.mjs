import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { SKILLS, RESOURCE_TYPES, MAX_SKILL_XP, skillProgress, gatheringDuration } from '../src/skills.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-skills-'));
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const tokens = Array.from({ length: 7 }, () => randomBytes(32).toString('base64url'));
const key = token => createHash('sha256').update(token).digest('hex');
const positions = [[-9, -3], [-9, -3], [-8, 11], [7, 12], [7, 1], [-13, 4], [11, -11]];
const records = Object.fromEntries(tokens.map((token, i) => [key(token), {
  id: randomUUID(), name: `Gatherer ${i}`, appearance: { ...appearance, className: ['Ranger', 'Ranger', 'Knight', 'Mage', 'Ranger', 'Mage', 'Knight'][i] }, zone: 'greenwood',
  x: positions[i][0], z: positions[i][1], rotation: 0, hp: i === 6 ? 1 : 100, maxHp: 100, level: 1, xp: 7, gold: 13,
  inventory: { wood: 4, crystal: 2, potion: 3 },
  quest: { chapter: 0, stage: 1, kills: 0, crystals: 0, progress: { 'grove-slimes': 0, 'grove-crystals': 0 }, completed: false, ending: null },
}]));
writeFileSync(join(dataDir, 'players.json'), JSON.stringify(records));
const clients = [];
let game, port;
async function until(predicate, label, timeout = 4200) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = predicate(); if (result) return result; await delay(20); }
  throw new Error(`Timed out: ${label}`);
}
async function start() {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' });
  port = await game.start();
}
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const c = { socket, snapshot: null, roster: null, welcome: null, messages: [] };
  clients.push(c);
  socket.on('message', raw => {
    const m = JSON.parse(raw.toString()); c.messages.push(m);
    if (m.type === 'snapshot') c.snapshot = m;
    if (m.type === 'welcome') c.welcome = m;
    if (m.type === 'roster') c.roster = m;
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send = m => socket.send(JSON.stringify(m));
  c.send({ type: 'join', token: tokens[index] });
  await until(() => c.roster, 'roster loaded');
  c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id });
  await until(() => c.welcome && c.snapshot, 'entered world');
  c.player = () => c.snapshot.players.find(p => p.id === c.welcome.id);
  return c;
}
async function begin(c, targetId) {
  c.send({ type: 'gather', targetId });
  return until(() => c.player().gathering, `begin ${targetId}`);
}

try {
  assert.deepEqual(skillProgress(0), { level: 1, xp: 0, nextLevelXp: 50, percent: 0 });
  assert.deepEqual(skillProgress(50), { level: 2, xp: 0, nextLevelXp: 150, percent: 0 });
  assert.equal(skillProgress(MAX_SKILL_XP).level, 99);
  assert.equal(skillProgress(MAX_SKILL_XP).percent, 100);
  assert.equal(gatheringDuration('crystal', MAX_SKILL_XP), RESOURCE_TYPES.crystal.duration * 0.7);
  for (let xp = 0; xp < MAX_SKILL_XP; xp += 29) assert.ok(skillProgress(xp + 29).level >= skillProgress(xp).level);
  await start();
  let miner = await connect(0);
  const competitor = await connect(1), woodcutter = await connect(2), herbalist = await connect(3), fighter = await connect(4);
  for (const c of [miner, competitor, woodcutter, herbalist]) {
    assert.deepEqual(c.player().skills, { mining: 0, woodcutting: 0, herbalism: 0 });
    assert.deepEqual(c.player().inventory, { wood: 4, crystal: 2, potion: 3, herb: 0, relic: 0 });
    assert.equal(c.player().gold, 13);
    assert.equal(c.player().xp, 7, 'legacy migration preserves adventure progress');
    assert.equal(c.player().gathering, null);
    assert.ok(Math.abs(c.snapshot.serverTime - Date.now()) < 1500);
  }
  for (const targetId of ['missing', 'ember-shard-0', 'timber-greenwood-0', { invalid: true }]) miner.send({ type: 'gather', targetId });
  await delay(150);
  assert.equal(miner.player().gathering, null, 'explicit invalid or distant targets, including other regions, never fallback');
  const pending = await begin(miner, 'crystal-0');
  assert.equal(pending.skill, 'mining');
  assert.equal(pending.endsAt - pending.startedAt, gatheringDuration('crystal', 0));
  competitor.send({ type: 'gather', targetId: 'crystal-0' });
  for (let n = 0; n < 8; n++) miner.send({ type: 'gather', targetId: 'crystal-0' });
  miner.send({ type: 'move', zone: 'greenwood', x: -9, z: -3, rotation: 1 });
  await delay(180);
  assert.equal(miner.player().inventory.crystal, 2, 'gathering cannot award immediately');
  assert.equal(miner.player().gathering.startedAt, pending.startedAt, 'spam and unchanged-position heartbeats do not restart gathering');
  assert.equal(competitor.player().gathering, null, 'one node has one claimant');
  miner.send({ type: 'move', zone: 'greenwood', x: -8.8, z: -3, rotation: 1 });
  await until(() => !miner.player().gathering, 'movement cancels gathering');
  await delay(2500);
  assert.equal(miner.player().inventory.crystal, 2, 'cancelled gathering never awards later');
  await begin(miner, 'crystal-0');
  miner.send({ type: 'cancelGather' });
  await until(() => !miner.player().gathering, 'explicit cancel');
  await begin(miner, 'crystal-0');
  miner.send({ type: 'attack', targetId: 'missing' });
  await until(() => !miner.player().gathering, 'attack cancels gathering');
  await begin(miner, 'crystal-0');
  miner.socket.close();
  await until(() => miner.socket.readyState === WebSocket.CLOSED, 'disconnect');
  miner = await connect(0);
  assert.equal(miner.player().gathering, null, 'reconnect cannot continue an interrupted action');

  const expected = [[miner, 'crystal-0'], [woodcutter, 'timber-greenwood-0'], [herbalist, 'herb-greenwood-0']];
  for (const [c, id] of expected) await begin(c, id);
  for (const [c, id] of expected) {
    const node = c.snapshot.nodes.find(n => n.id === id), resource = RESOURCE_TYPES[node.kind];
    await until(() => c.player().skills[resource.skill] === resource.xp, `${resource.skill} XP`);
    assert.equal(c.player().inventory[resource.reward], (resource.reward === 'crystal' ? 2 : resource.reward === 'wood' ? 4 : 0) + 1);
    assert.equal(c.player().xp, 7 + resource.adventureXp);
    assert.equal(c.player().gathering, null);
    assert.equal(c.snapshot.nodes.find(n => n.id === id).available, false);
    for (let n = 0; n < 3; n++) c.send({ type: 'gather', targetId: id });
  }
  assert.equal(miner.player().quest.crystals, 1, 'quest resources still grant existing story credit');
  await delay(200);
  for (const [c, id] of expected) {
    const resource = RESOURCE_TYPES[c.snapshot.nodes.find(n => n.id === id).kind];
    assert.equal(c.player().skills[resource.skill], resource.xp, 'depleted node cannot be claimed again');
  }
  const enemy = fighter.snapshot.enemies.find(e => e.id === 'slime-0');
  fighter.send({ type: 'attack', targetId: 'missing' });
  fighter.send({ type: 'attack', targetId: 'briar-sentinel-0' });
  fighter.send({ type: 'attack', targetId: 'slime-3' });
  await delay(150);
  assert.equal(fighter.snapshot.enemies.find(e => e.id === enemy.id).hp, enemy.hp, 'explicit unavailable enemy cannot fallback to a nearby enemy');
  fighter.send({ type: 'attack', targetId: enemy.id });
  await until(() => fighter.snapshot.enemies.find(e => e.id === enemy.id).hp < enemy.hp, 'explicit enemy target accepted');
  const vulnerable = await connect(6);
  await begin(vulnerable, 'crystal-2');
  await until(() => vulnerable.player().hp === 0 && !vulnerable.player().gathering, 'death cancels gathering');
  assert.equal(vulnerable.player().inventory.crystal, 2);
  assert.equal(vulnerable.player().skills.mining, 0);

  // Stop during a live claim: transient animation state must never reach either persistence backend.
  const interrupted = await connect(5);
  await begin(interrupted, 'crystal-1');
  await game.stop();
  const disk = readFileSync(join(dataDir, 'players.json'), 'utf8');
  assert.ok(!disk.includes('gathering') && !tokens.some(token => disk.includes(token)));
  await start();
  for (const [index, skill] of [[0, 'mining'], [2, 'woodcutting'], [3, 'herbalism']]) {
    const c = await connect(index);
    const saved = JSON.parse(disk)[key(tokens[index])].characters[0];
    assert.deepEqual(c.player().skills, saved.skills);
    assert.ok(c.player().skills[skill] > 0);
    assert.deepEqual(c.player().inventory, saved.inventory);
    assert.equal(c.player().gathering, null);
  }
  const invalidDir = join(dataDir, 'invalid'); mkdirSync(invalidDir);
  const invalidPath = join(invalidDir, 'players.json');
  for (const corrupt of [p => { p.skills = null; }, p => { p.skills.mining = -1; }, p => { p.skills.mining = MAX_SKILL_XP + 1; }, p => { delete p.skills.herbalism; }, p => { p.inventory.herb = '0'; }, p => { p.xp = -1; }]) {
    const copy = JSON.parse(disk); corrupt(copy[key(tokens[0])].characters[0]);
    const text = JSON.stringify(copy); writeFileSync(invalidPath, text);
    assert.throws(() => createGameServer({ dataDir: invalidDir, keycloak: null, databaseUrl: '' }), /Invalid player save/);
    assert.equal(readFileSync(invalidPath, 'utf8'), text, 'invalid data is preserved, not silently reset');
  }
  assert.equal(Object.keys(SKILLS).length, 3);
  console.log('PASS: all three professions and class-independent gathering; timed actions, exclusive claims, cancellation, explicit targeting, legacy migration, restart persistence and corrupt-save preservation.');
} finally {
  for (const c of clients) c.socket.terminate();
  await game?.stop();
  rmSync(dataDir, { recursive: true, force: true });
}
