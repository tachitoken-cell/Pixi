import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { CHAPTERS } from '../src/content.ts';
import { MAX_LEVEL, migrateTalents, starterGear, maxHealth, talentsValid } from '../src/progression.ts';
import { awardSpecialistXp } from '../src/raid-progression.ts';
import { storeBoostMultiplier } from '../src/ingame-store.ts';

assert.equal(MAX_LEVEL, 60);
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-level-cap-')), file = join(dataDir, 'players.json'), clients = [];
const tokens = Array.from({ length: 4 }, () => randomBytes(32).toString('base64url'));
const key = token => createHash('sha256').update(token).digest('hex');
function hero(name, level, extra = {}) {
  const player = { id: randomUUID(), name, appearance: { ...DEFAULT_APPEARANCE }, characterCreated: true,
    zone: 'greenwood', coordinateVersion: 2, x: 0, z: 8, rotation: 0, level, xp: 19, gold: 1234,
    ...starterGear('Ranger'), talents: [], inventory: { wood: 7, crystal: 9, herb: 4, relic: 2, potion: 3 },
    skills: { fishing: 0, mining: 123, woodcutting: 234, herbalism: 345 },
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0,
      progress: Object.fromEntries(CHAPTERS[0].objectives.map(objective => [objective.id, 0])), completed: false, ending: null }, ...extra };
  player.maxHp = maxHealth(player); player.hp = extra.hp ?? player.maxHp;
  return player;
}
// This fixture represents the pre-versioned tree, not today's redesigned talent IDs.
const legacyRanks = [
  ...Array.from({length:6}, (_,i)=>[`ranger-${i+1}`,1]),
  ...['marksmanship','pathfinder'].flatMap(branch=>[3,2,3,2,2,1].map((rank,i)=>[`ranger-${branch}-${i+1}`,rank])),
  ...[3,2,2,3,2,3,2,2,1].map((rank,i)=>[`ranger-survival-${i+1}`,rank]),
];
const crowded = hero('All talents', 90, {talents:legacyRanks.flatMap(([id,rank])=>Array(rank).fill(id)).reverse()});
const refunded = structuredClone(crowded); migrateTalents(refunded);
assert.deepEqual(refunded.talents, [], 'reachable legacy allocation is refunded during the current redesign');

const original = {
  [key(tokens[0])]: { betaTester: true, characters: [hero('Above cap', 61), hero('At cap', 60, { hp: 400 }), hero('Below cap', 59, { xp: 5899, hp: 401 })] },
  [key(tokens[1])]: { characters: [hero('Offline fallen', 150, { hp: 0, diedAt: Date.now() })] },
  [key(tokens[2])]: hero('Legacy single', 72, { hp: 120 }),
  [key(tokens[3])]: { characters: [crowded] },
};
let game, port;
async function until(fn, label) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { const result = fn(); if (result) return result; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function start() {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' });
  port = await game.start();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status, 200); assert.equal((await response.json()).ok, true);
}
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket }; clients.push(client);
  socket.on('message', raw => { const message = JSON.parse(raw); client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'join', token })); await until(() => client.roster, 'roster');
  socket.send(JSON.stringify({ type: 'selectCharacter', characterId: client.roster.characters[0].id }));
  await until(() => client.snapshot?.players.find(p => p.id === client.welcome?.id), 'world entry');
  return client;
}
function assertMigrated(records) {
  assert.equal(records[key(tokens[0])].betaTester, true);
  for (const [accountKey, beforeAccount] of Object.entries(original)) {
    const before = beforeAccount.characters ?? [beforeAccount], after = records[accountKey].characters;
    assert.equal(after.length, before.length, 'every character remains owned by its original account');
    for (const [index, old] of before.entries()) {
      const player = after[index];
      assert.equal(player.level, Math.min(old.level, MAX_LEVEL));
      assert.equal(player.xp, old.level >= MAX_LEVEL ? 0 : old.xp);
      assert.equal(player.maxHp, maxHealth(player));
      assert.equal(player.hp, Math.min(old.hp, player.maxHp), 'lowering the cap neither heals nor resurrects');
      for (const field of ['id', 'name', 'appearance', 'gold', 'inventory', 'skills', 'equipment', 'ownedGear', 'quest']) assert.deepEqual(player[field], old[field], `${field} survives migration`);
      if (old.diedAt !== undefined) assert.equal(player.diedAt, old.diedAt);
      assert.equal(player.talents.length, 0);
      assert(talentsValid(player), 'refunded allocations remain reachable');
      for (const id of player.talents) assert(player.talents.filter(t => t === id).length <= old.talents.filter(t => t === id).length, 'migration never awards extra talent ranks');
    }
  }
}
try {
  writeFileSync(file, JSON.stringify(original));
  await start();
  const connected = await connect(tokens[0]);
  assert.deepEqual(connected.roster.characters.map(p => p.level), [60, 60, 59]);
  const player = connected.snapshot.players.find(p => p.id === connected.welcome.id);
  assert.equal(player.level, 60); assert.equal(player.xp, 0); assert.equal(player.maxHp, maxHealth(player));
  await game.stop(); game = null;
  const saved = JSON.parse(readFileSync(file, 'utf8')); assertMigrated(saved);
  await start();
  const legacy = await connect(tokens[2]);
  assert.equal(legacy.roster.characters[0].id, original[key(tokens[2])].id);
  assert.equal(legacy.roster.characters[0].level, 60);
  await game.stop(); game = null;
  assertMigrated(JSON.parse(readFileSync(file, 'utf8')));

  const invalidDir = join(dataDir, 'invalid'); mkdirSync(invalidDir);
  for (const corruption of [
    { level: 60.5 }, { level: 1000001 }, { level: '61' }, { level: null },
    { level: 61, xp: -1 }, { level: 61, xp: '1' }, { level: 61, xp: 6100 }, { level: 60, xp: 6000 },
    { level: 61, maxHp: 1 }, { level: 61, talents: Array(61).fill('missing-talent') },
  ]) {
    const copy = structuredClone(saved); Object.assign(copy[key(tokens[0])].characters[0], corruption);
    const text = JSON.stringify(copy), invalidFile = join(invalidDir, 'players.json'); writeFileSync(invalidFile, text);
    assert.throws(() => createGameServer({ dataDir: invalidDir, keycloak: null, databaseUrl: '' }), /Invalid player save/);
    assert.equal(readFileSync(invalidFile, 'utf8'), text, 'corrupt saves remain untouched');
  }

  // Use the same shared award function that kills, gathering, quests and GM XP call.
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const extract = name => `(${source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0].trim()})`;
  const effects = [], notices = [];
  const restoreHealth = runInNewContext(extract('restoreHealth'), { arenaMode: () => false, healCompanion() {}, triggerEdicts() {}, broadcast: message => effects.push({ ...message }) });
  const addXp = runInNewContext(extract('addXp'), { MAX_LEVEL, maxHealth, storeBoostMultiplier, restoreHealth, committingAccounts:new Map(), awardSpecialistXp,
    send: (socket, message) => effects.push({ ...message }), event: (...args) => notices.push(args),
    spellsForClass: () => [], MOUNT_UNLOCK_LEVEL: 25, MOUNT_UPGRADE_LEVEL: 50, checkAchievements() {}, recordReferralGameplay() {} });
  for (const [level, xp, amount, boosted, boostActive, expectedLevel, expectedXp, earned, hp] of [
    [59, 5890, 1000000000, true, false, 60, 0, 10, 300],
    [58, 0, 1000000000, true, false, 60, 0, 11700, 300],
    [59, 5885, 10, true, true, 60, 0, 15, 300],
    [59, 5885, 10, false, true, 59, 5895, 10, 300],
    [60, 0, 1000000000, true, true, 60, 0, 0, 300],
    [59, 5890, 10, true, false, 60, 0, 10, 0],
    [60, 0, 100, true, false, 60, 0, 0, 0],
    [1, 90, 350, true, false, 3, 140, 350, 50],
  ]) {
    effects.length = 0; notices.length = 0;
    const session = { player: hero('XP fixture', level, { xp, hp, storeBoosts: boostActive ? { 'combat-xp': Date.now() + 60000 } : {} }), socket: {} };
    assert.equal(addXp(session, amount, boosted), earned, 'returns only the XP that fits before the cap');
    assert.equal(session.player.level, expectedLevel); assert.equal(session.player.xp, expectedXp);
    assert.deepEqual(effects.filter(e => e.effect === 'xp').map(e => e.amount), earned ? [earned] : [], 'XP float matches actual awarded progress');
    assert.equal(session.player.hp, expectedLevel > level && hp > 0 ? maxHealth(session.player) : hp);
    if (level === MAX_LEVEL || hp === 0) assert(!effects.some(e => e.effect === 'heal'), 'max-level or dead characters gain no healing');
    assert(!notices.some(([, , text]) => /^Level (6[1-9]|[7-9]\d|\d{3,})!/.test(text)), 'no over-cap level notice');
  }
  console.log('PASS level cap: capped XP and boosts, no over-cap levels/healing, all-account legacy/offline migration, reachable talents, health, WebSocket entry, durable restart and invalid-save preservation.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); rmSync(dataDir, { recursive: true, force: true });
}
