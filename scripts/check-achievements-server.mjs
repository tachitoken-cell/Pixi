import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import pg from 'pg';
import { playerDatabaseFixture } from './fixture-player-database.mjs';
import { createGameServer } from '../server.mjs';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, newAchievements, achievementsValid, achievementProgress, achievementPoints, unlockAchievements } from '../src/achievements.ts';
import { CHAPTERS, NPCS, ZONES } from '../src/content.ts';
import { ICONS } from '../src/icons.ts';
import { starterGear } from '../src/progression.ts';
import { newContracts, BOARD_POSITION, WORKSHOP_POSITION } from '../src/adventure.ts';
import { OVERWORLD_SPAWNS, regionAt, canTraverse } from '../src/realm.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-achievements-')), file = join(dir, 'players.json'), clients = [], realNow = Date.now, OriginalClient = pg.Client;
let clock = realNow(), game, port, releaseWrite;
Date.now = () => clock;
const hash = token => createHash('sha256').update(token).digest('hex');
const quest = (chapter = 0, stage = 0) => ({ chapter, stage, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[chapter].objectives.map(o => [o.id, 0])), completed: false, ending: null });
function hero(name, point, extra = {}) {
  const level = extra.level || 1;
  return { id: randomUUID(), name, ...point, coordinateVersion: 2, zone: regionAt(point.x, point.z), rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), level, xp: 0, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, gold: 0,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0,
    contracts: newContracts(), quest: quest(), learnedSpells: ['arrow'], ridingRank: 0, ownedMounts: [], ...extra };
}
const slime = OVERWORLD_SPAWNS.find(enemy => enemy.id === 'slime-1'), crystal = ZONES[0].nodes.find(node => node.id === 'crystal-1'), rowan = NPCS.find(npc => npc.id === 'rowan');
const finishedQuest = quest(0, 2);
for (const objective of CHAPTERS[0].objectives) { finishedQuest.progress[objective.id] = objective.count; if (objective.kind === 'kill') finishedQuest.kills += objective.count; if (objective.kind === 'gather') finishedQuest.crystals += objective.count; }
const heroes = {
  fighter: hero('Achievement hunter', { x: slime.x, z: slime.z + 2 }, { level: 4, xp: 399 }),
  gatherer: hero('Achievement gatherer', { x: crystal.x, z: crystal.z - 2 }),
  crafter: hero('Achievement crafter', { x: WORKSHOP_POSITION.x, z: WORKSHOP_POSITION.z + 2 }, { inventory: { wood: 0, crystal: 1, herb: 2, potion: 3, relic: 0 } }),
  quester: hero('Achievement quester', { x: rowan.x, z: rowan.z + 2 }, { quest: finishedQuest }),
  contractor: hero('Achievement helper', { x: BOARD_POSITION.x, z: BOARD_POSITION.z + 1 }, { contracts: { active: { 'greenwood-hunt': 4 }, completed: {} } }),
  explorer: hero('Achievement explorer', { x: 0, z: -86 }),
};
const sibling = hero('A separate journey', { x: 0, z: 8 });
const tokens = Object.fromEntries(Object.keys(heroes).map(key => [key, randomBytes(32).toString('base64url')]));
const stored = key => JSON.parse(readFileSync(file, 'utf8'))[hash(tokens[key])].characters[0];
async function until(fn, label) { const end = realNow() + 6000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 700) { clock += ms; await delay(120); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(key, id = heroes[key].id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], id }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.id);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (message.type === 'snapshot') c.snapshot = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[key], characterId: id }); await until(() => c.player(), `enter ${key}`); return c;
}
const earned = (c, id) => c.player()?.achievements.unlocked[id];
const notices = (c, id) => c.messages.filter(m => m.type === 'achievement' && m.achievementId === id);
try {
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length);
  assert(ACHIEVEMENTS.every(a => ICONS[a.icon] && a.points > 0 && a.target > 0));
  assert(ACHIEVEMENT_CATEGORIES.every(category => ACHIEVEMENTS.some(a => a.category === category)));
  assert(achievementsValid(newAchievements()));
  for (const bad of [{ ...newAchievements(), kills: -1 }, { ...newAchievements(), unlocked: { fake: 1 } }, { ...newAchievements(), unlocked: { 'first-victory': 'now' } }, { ...newAchievements(), zones: ['greenwood', 'greenwood'] }, { ...newAchievements(), dungeons: { fake: 1 } }, { ...newAchievements(), extra: 1 }]) assert(!achievementsValid(bad));
  for (const at of [0, -1, Number.MAX_SAFE_INTEGER]) assert(!achievementsValid({ ...newAchievements(), unlocked: { 'first-victory': at } }), 'unlock timestamps must be positive and renderable dates');
  const maximum = { ...heroes.fighter, level: 60, ownedMounts: ['wolf'], zeppelinPorts: ZONES.map(z => z.id), skills: { mining: 50000 }, quest: { completed: true }, achievements: { ...newAchievements(), kills: 500, worldBosses: 1, gathered: 50, crafted: 25, contracts: 10, zones: ZONES.map(z => z.id), dungeons: { rootvault: 1, cindercrypt: 1, frosthollow: 1, nightroot: 1 } } };
  assert.equal(unlockAchievements(maximum, clock).length, ACHIEVEMENTS.length, 'every catalog entry is attainable from supported gameplay metrics');
  assert.deepEqual(unlockAchievements(maximum, clock + 1), [], 'unlock evaluation is idempotent');
  assert.equal(achievementPoints(maximum), ACHIEVEMENTS.reduce((sum, a) => sum + a.points, 0));
  maximum.level = 1; assert.equal(achievementProgress(ACHIEVEMENTS[0], maximum), ACHIEVEMENTS[0].target, 'earned achievements never lose progress');

  const saddleUp = ACHIEVEMENTS.find(a => a.id === 'saddle-up');
  for (const mount of ['store-embermane', 'store-cinderfang']) {
    const rider = { ...heroes.fighter, ownedMounts: [mount], storeOrders: [{ productId: mount, status: 'processed' }], achievements: newAchievements() };
    assert.equal(achievementProgress(saddleUp, rider), 0, 'provisional ownership must not count toward Saddle Up');
    unlockAchievements(rider, clock);
    assert.equal(rider.achievements.unlocked['saddle-up'], undefined, 'provisional mounts cannot award permanent points');
    rider.ownedMounts = [];
    unlockAchievements(rider, clock);
    assert.equal(rider.achievements.unlocked['saddle-up'], undefined, 'a revoked provisional mount leaves no achievement behind');
    rider.ownedMounts = [mount]; rider.storeOrders[0].status = 'delivered';
    assert(unlockAchievements(rider, clock).some(a => a.id === 'saddle-up'), 'a finalized store mount earns Saddle Up');
  }
  assert.equal(achievementProgress(saddleUp, { ...heroes.fighter, ownedMounts: ['horse'] }), 1, 'ordinary mounts do not require store finality');

  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([key, p]) => [hash(tokens[key]), { characters: key === 'fighter' ? [p, sibling] : [p] }]))));
  await start(); const c = {}; for (const key of Object.keys(heroes)) c[key] = await connect(key);
  assert.equal(earned(c.quester, 'first-victory'), clock, 'legacy campaign evidence backfills existing kills');
  assert.equal(notices(c.quester, 'first-victory').length, 0, 'backfill does not replay historical unlock toasts');
  assert.equal(c.fighter.player().achievements.kills, 0); assert.equal(achievementPoints(c.fighter.player()), 0);
  const beforeForgery = structuredClone(c.fighter.player().achievements);
  for (const message of [{ type: 'achievement', achievementId: 'living-legend', unlockedAt: clock }, { type: 'move', x: 0, z: 8, achievements: maximum.achievements }, { type: 'attack', targetId: slime.id, achievementPoints: 9999 }]) {
    await tick(); c.fighter.send(message); await delay(140); assert.deepEqual(c.fighter.player().achievements, beforeForgery, 'client achievement claims do not change progress');
  }
  for (let attacks = 0; attacks < 8 && !earned(c.fighter, 'first-victory'); attacks++) {
    await tick(1100); c.fighter.send({ type: 'attack', ability: 'arrow', targetId: slime.id }); await tick(800);
  }
  assert(earned(c.fighter, 'first-victory'), 'a real monster kill unlocks First Victory');
  assert.equal(c.fighter.player().achievements.kills, 1); assert(earned(c.fighter, 'growing-roots'), 'XP from that kill crosses level 5');
  assert.equal(notices(c.fighter, 'first-victory').length, 1); assert.equal(notices(c.fighter, 'growing-roots').length, 1);
  const killAt = earned(c.fighter, 'first-victory');
  c.fighter.send({ type: 'attack', ability: 'arrow', targetId: slime.id }); await tick();
  assert.equal(c.fighter.player().achievements.kills, 1, 'attacking a corpse cannot earn duplicate credit');
  assert.equal(earned(c.fighter, 'first-victory'), killAt);

  c.gatherer.send({ type: 'gather', targetId: crystal.id }); await until(() => c.gatherer.player().gathering, 'gather accepted');
  await tick(3000); await until(() => earned(c.gatherer, 'hands-on'), 'real gathering unlock');
  assert.equal(c.gatherer.player().achievements.gathered, 1);
  c.crafter.send({ type: 'craft', recipeId: 'trail-tonic' }); await until(() => earned(c.crafter, 'made-by-hand'), 'real workshop craft unlock');
  await tick(); c.crafter.send({ type: 'craft', recipeId: 'trail-tonic' }); await tick();
  assert.equal(c.crafter.player().achievements.crafted, 1, 'failed craft earns no progress');
  c.contractor.send({ type: 'claimContract', contractId: 'greenwood-hunt' }); await until(() => earned(c.contractor, 'helping-hand'), 'real claim unlock');
  await tick(); c.contractor.send({ type: 'claimContract', contractId: 'greenwood-hunt' }); await tick();
  assert.equal(c.contractor.player().achievements.contracts, 1, 'replaying a claim earns no progress');
  c.quester.send({ type: 'interact', targetId: rowan.id }); await until(() => earned(c.quester, 'first-chapter'), 'actual quest turn-in unlock');
  assert(canTraverse(c.explorer.player(), { x: 0, z: -84 }));
  await tick(); c.explorer.send({ type: 'move', x: 0, z: -84, rotation: 0, zone: 'amberwild' }); await until(() => earned(c.explorer, 'beyond-the-grove'), 'validated movement discovers the next region');
  assert.deepEqual(c.explorer.player().achievements.zones, ['amberwild', 'greenwood']);
  for (const [key, id] of [['gatherer', 'hands-on'], ['crafter', 'made-by-hand'], ['contractor', 'helping-hand'], ['quester', 'first-chapter'], ['explorer', 'beyond-the-grove']]) assert.equal(notices(c[key], id).length, 1);

  const expected = Object.fromEntries(Object.keys(heroes).map(key => [key, structuredClone(c[key].player().achievements)]));
  await delay(1200);
  for (const key of Object.keys(heroes)) assert.deepEqual(stored(key).achievements, expected[key], `${key} persisted by normal autosave`);
  for (const client of clients) client.socket.terminate(); await game.stop(); game = undefined;
  await start();
  for (const key of Object.keys(heroes)) { const restored = await connect(key); assert.deepEqual(restored.player().achievements, expected[key], `${key} survives restart`); assert(!restored.messages.some(m => m.type === 'achievement'), 'reconnect never replays earned notices'); }
  const separate = await connect('fighter', sibling.id); assert.equal(achievementPoints(separate.player()), 0); assert.equal(separate.player().achievements.kills, 0, 'achievements belong to the character, not its account');
  for (const client of clients) client.socket.terminate(); await game.stop(); game = undefined;

  // Hold the existing database adapter while a real, already released arrow lands.
  heroes.pending = hero('A busy adventurer', { x: slime.x, z: slime.z + 2 }, { level: 60, hp: 100, carriedItems: { 'greater-tonic': 1 } });
  tokens.pending = randomBytes(32).toString('base64url');
  const databaseRecords = { [hash(tokens.pending)]: { characters: [heroes.pending] } }; let holdNext = false;
  pg.Client = playerDatabaseFixture(databaseRecords, { beforeWrite: async () => {
    if (holdNext) { holdNext = false; await new Promise(resolve => { releaseWrite = resolve; }); releaseWrite = undefined; }
  } });
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: 'postgres://fixture:fixture@127.0.0.1/fixture' }); port = await game.start();
  const pending = await connect('pending');
  pending.send({ type: 'attack', ability: 'arrow', targetId: slime.id });
  await until(() => pending.messages.some(m => m.type === 'combat' && m.playerId === pending.id), 'arrow released before saving');
  holdNext = true; pending.send({ type: 'useItem', itemId: 'greater-tonic' }); await until(() => releaseWrite, 'consumable save awaits acknowledgment');
  await tick(900); await until(() => earned(pending, 'first-victory'), 'pending arrow earns a kill during saving');
  const duringSave = structuredClone(pending.player().achievements);
  releaseWrite(); await until(() => !pending.player().carriedItems['greater-tonic'], 'consumable write completes');
  assert.deepEqual(pending.player().achievements, duringSave, 'purchase application preserves concurrent kill counters and unlocks');
  assert.equal(notices(pending, 'first-victory').length, 1);
  await game.stop(); game = undefined;
  assert.deepEqual(databaseRecords[hash(tokens.pending)].characters[0].achievements, duringSave, 'normal queued autosave retains the concurrent achievement');
  console.log('PASS achievement catalog, validation, migration, real combat/level/gather/craft/contract/quest/exploration unlocks, spoof/replay rejection, per-character isolation, restart persistence and concurrent kill during an awaited purchase save.');
} finally { releaseWrite?.(); for (const client of clients) client.socket.terminate(); await game?.stop(); Date.now = realNow; pg.Client = OriginalClient; rmSync(dir, { recursive: true, force: true }); }
