import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { playerDatabaseFixture } from './fixture-player-database.mjs';
import { GEAR, starterGear, maxHealth } from '../src/progression.ts';
import { CHAPTERS } from '../src/content.ts';
import { newContracts } from '../src/adventure.ts';
import { OVERWORLD_SPAWNS, canTraverse } from '../src/realm.ts';
import { DUNGEON_EXIT, dungeonStages, dungeonLayout, dungeonBounds, dungeonColliders, dungeonRoomPortalOpen, dungeonReturn, getDungeon } from '../src/dungeon.ts';
import { findPath } from '../src/navigation.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';
import { LOOT_TABLES, LOOT_ITEMS, lootRows, lootItemValid } from '../src/loot-items.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { bagUsage, bagCanFit, newBags } from '../src/bags.ts';

// Full readers share the next fresh snapshot, never one that began before their request.
{
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'), reads = [], changes = new Map();
  const refresh = runInNewContext(`(() => { let flush = Promise.resolve(); ${source.slice(source.indexOf('  let refreshingRecords'), source.indexOf('\n  function stagedPlayerChanges'))} return refreshRecords; })()`, {
    database: { read: () => new Promise((resolve, reject) => reads.push({ resolve, reject })), owns: () => false },
    closing: false, sharedChanges: changes, records: {}, committingAccounts: new Map(),
    migrateRecords: rows => rows, validateRecords() {}, applyStoredRow() {}, clearDeletedAccount() {},
  });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const first = refresh();
  assert.equal(refresh(), first, 'a full read queued before execution is still fresh for another waiter');
  await tick(); assert.equal(reads.length, 1);
  const second = refresh(), third = refresh();
  assert.notEqual(second, first, 'a running read cannot satisfy a new full request');
  assert.equal(second, third, 'concurrent waiters share the next full read');
  reads[0].resolve([]); await first; await tick(); assert.equal(reads.length, 2);
  const later = refresh();
  assert.notEqual(later, second, 'a request arriving during the next read still needs a newer snapshot');
  assert.equal(refresh(), later);
  reads[1].resolve([]); await Promise.all([second, third]); await tick(); assert.equal(reads.length, 3);
  reads[2].resolve([]); await later;
  const failed = refresh(); await tick(); const queued = refresh();
  const rejected = Promise.all([assert.rejects(failed, /read failed/), assert.rejects(queued, /read failed/)]);
  await tick(); reads[3].reject(Error('read failed')); await rejected;
  const recovered = refresh(); await tick(); const next = refresh();
  reads[4].resolve([]); await recovered; await tick();
  assert.equal(reads.length, 6, 'a failed read cannot retain a rejected queued refresh');
  reads[5].resolve([]); await next;
  changes.set('changed-account', 1);
  const partial = refresh(true), full = refresh();
  assert.notEqual(full, partial, 'a queued changed-only read cannot satisfy a full request');
  await tick(); reads[6].resolve([]); await partial; await tick();
  assert.equal(reads.length, 8); reads[7].resolve([]); await full;
}

// Exercise the real pickup closure with overlapping rows and rewards appended during its save.
{
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'), writes = [], lootDrops = new Map();
  const collect = runInNewContext(`(${source.slice(source.indexOf('  function collectLoot('), source.indexOf('\n  function petLootPath('))})`, {
    lootRows, lootItemValid, LOOT_ITEMS, bagCanFit, lootDrops, lootCollected: new WeakMap(), dungeons: new Map(),
    lootTrace: { active: () => false }, distance: () => 0, swimming: () => false, canTraverse: () => true,
    WORLD_COLLIDERS: [], WORLD_BOUNDS: {}, event: (_session, _kind, text) => assert.fail(text),
    completeTraining: (session, changes, description, onPersist) => new Promise(resolve => writes.push(() => {
      Object.assign(session.player, changes()); onPersist(); description(); resolve(true);
    })),
  });
  const item = quantity => ({ id: 'item:prismatic-pearl', kind: 'item', itemId: 'prismatic-pearl', quality: 'rare', quantity });
  const relic = quantity => ({ id: 'resource:relic', kind: 'resource', itemId: 'relic', quality: 'rare', quantity });
  const player = { id: 'owner', gold: 0, inventory: { relic: 0 }, carriedItems: {}, ...starterGear('Ranger'), ...newBags() };
  const drop = { id: 'stacked', ownerId: player.id, expiresAt: Date.now() + 60000, gold: 10, relic: 1, items: [item(1), item(2), relic(2)] };
  lootDrops.set(drop.id, drop);
  const first = collect({ player }, drop), overlap = collect({ player }, drop);
  drop.gold += 5; drop.items.push(item(4), relic(3));
  writes.shift()(); writes.shift()();
  assert.deepEqual(await Promise.all([first, overlap]), [true, true]);
  assert.equal(player.gold, 10); assert.equal(player.carriedItems['prismatic-pearl'], 3); assert.equal(player.inventory.relic, 3);
  assert.deepEqual(lootRows(drop).map(row => [row.id, row.quantity]), [['gold', 5], ['item:prismatic-pearl', 4], ['resource:relic', 3]], 'overlapping queued clicks consume original stacks once and preserve later rewards');
  delete drop.relic;
  const selected = collect({ player }, drop, ['resource:relic']); writes.shift()(); await selected;
  assert.equal(drop.relic, 0, 'a resource stored only in item rows does not create NaN');
  assert.equal(player.inventory.relic, 6); assert.equal(player.gold, 10, 'selected rows never collect hidden pending gold');
}

const dir = mkdtempSync(join(tmpdir(), 'mossvale-persistence-latency-')), OriginalClient = pg.Client, sockets = [], clients = [];
const realNow = Date.now, oldSlime = { ...MONSTERS['moss-slime'] };
const hash = token => createHash('sha256').update(token).digest('hex');
const tokens = Array.from({ length: 3 }, () => randomBytes(32).toString('base64url'));
const hero = name => ({ id: randomUUID(), name, x: 0, z: 8, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, ...starterGear('Ranger'), level: 25, xp: 13, gold: 77, hp: 388, maxHp: 388,
  inventory: { wood: 10, crystal: 0, herb: 0, potion: 3, relic: 0 }, contracts: newContracts(), craftingXp: 0, talents: [],
  quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } });
const heroes = tokens.map((_, i) => hero(`Latency ${i}`)); heroes[0].ownedGear.push('ranger-head');
const slime = OVERWORLD_SPAWNS.find(enemy => enemy.id === 'slime-0'), looter = hero('Latency looter');
looter.quest.stage = 1;
// The redesigned second self-heal is learned at 38; keep the post-rollback action test legal.
looter.level = 38; looter.maxHp = maxHealth(looter);
Object.assign(looter, { x: slime.x + 1, z: slime.z, ownedPets: ['moss-fox'], hp: 200, learnedSpells: ['arrow', 'power-shot', 'trail-mending', 'barkskin', 'wild-renewal'] });
const oldLootTable = LOOT_TABLES['moss-slime'];
LOOT_TABLES['moss-slime'] = [{ kind: 'item', itemId: 'prismatic-pearl', chance: 1 }];
const records = Object.fromEntries(tokens.map((token, i) => [hash(token), { characters: [heroes[i]], communityRulesVersion: 1 }]));
records[hash(tokens[0])].characters.push(looter);
const remote = 'e'.repeat(64); records[remote] = { characters: [hero('Remote traveler')] };
let slow = false, joining = true, game, notifier, holdWrite, releaseWrite, claims = 0, commits = 0, sharedRefreshQueries = 0, separateFenceQueries = 0, port;
const transactions = [];
const Fixture = playerDatabaseFixture(records, { beforeWrite: async rows => {
  if (holdWrite?.(rows)) {
    holdWrite = undefined;
    const error = await new Promise(resolve => { releaseWrite = resolve; }); releaseWrite = undefined;
    if (error) throw error;
  }
}, onWrite: () => { commits++; } });
pg.Client = class extends Fixture {
  constructor(...args) { super(...args); clients.push(this); }
  async query(sql, args) {
    if (sql.startsWith('SELECT pg_try_advisory_lock')) claims++;
    if (sql.startsWith('SELECT account_key FROM mossvale_account_deletions WHERE')) {
      if (sql.includes('; SELECT account_key, state FROM mossvale_players')) sharedRefreshQueries++;
      else separateFenceQueries++;
    }
    if (sql.startsWith('BEGIN; SELECT account_key, state, pending_credits')) this.transactionQueries = 0;
    if (this.transactionQueries !== undefined) this.transactionQueries++;
    // Measured Asia full-account transfer time, retained for every read until all joins finish.
    const fullRead = sql.includes('; SELECT account_key, state FROM mossvale_players') && !sql.includes('WHERE account_key');
    if (slow) await delay(joining && fullRead ? 2422 : 270);
    const result = await super.query(sql, args);
    if (sql.endsWith('; COMMIT')) {
      transactions.push({ queries: this.transactionQueries, gold: sql.startsWith('INSERT INTO mossvale_gold_events') });
      this.transactionQueries = undefined;
    }
    return result;
  }
};
async function until(predicate, label, timeout = 12000) {
  const deadline = realNow() + timeout;
  while (realNow() < deadline) { if (predicate()) return; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function connect(token, characterId) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`); sockets.push(socket);
  const client = { socket, characterId, messages: [], closed: null, player: () => client.snapshot?.players.find(p => p.id === client.characterId) };
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (message.type === 'snapshot') client.snapshot = message; });
  socket.on('close', code => { client.closed = code; }); socket.on('error', () => {});
  await new Promise(resolve => socket.once('open', resolve));
  client.send = message => socket.send(JSON.stringify(message));
  client.joinedAt = Date.now(); client.send({ type: 'join', token, ...(characterId ? { characterId } : {}) });
  return client;
}
try {
  const disabled = { configured: false, status: async () => ({ configured: false, enabled: false, reason: 'Local latency check.' }) };
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: 'postgres://isolated-latency-fixture',
    auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, nftChain: disabled, treasuryChain: disabled, walletOidc: { env: {} } });
  port = await game.start(); slow = true;
  notifier = setInterval(() => clients.forEach(client => client.emit('notification', { processId: 'remote-realm', channel: 'mossvale_players_changed', payload: remote })), 800);
  const joined = await Promise.all(tokens.map((token, i) => connect(token, heroes[i].id)));
  const joinMs = await Promise.all(joined.map(async client => { await until(() => client.player() || client.closed, 'concurrent join'); assert.equal(client.closed, null); return Date.now() - client.joinedAt; }));
  joining = false;
  assert(Math.max(...joinMs) < 10000, `three joins with 2422 ms full reads must finish before the existing deadline: ${joinMs}`);
  assert(joined.every(client => client.messages.find(message => message.type === 'welcome')?.lootResults === true), 'welcome advertises correlated loot replies for rolling releases');
  assert(joined.every(client => client.messages.find(message => message.type === 'welcome')?.lootQueueLimit === 16), 'welcome advertises the bounded manual pickup queue');
  let client = joined[0]; const timings = {};
  for (const [action, request, expected] of [['equip', { type: 'equipGear', itemId: 'ranger-head' }, 'ranger-head'], ['unequip', { type: 'unequipGear', slot: 'head' }, null]]) {
    const started = Date.now(); client.send(request);
    await until(() => client.player().equipment.head === expected, action);
    timings[action] = Date.now() - started;
    assert(timings[action] < 2900, `${action} must not wait behind excessive background polling: ${timings[action]} ms`);
    assert.equal(records[hash(tokens[0])].characters[0].equipment.head, expected, 'inventory acknowledgment follows durable commit');
    assert.equal(transactions.at(-1).queries, 2, 'inventory and its deletion fence use only two database round trips');
  }

  client.characterId = looter.id; client.send({ type: 'selectCharacter', characterId: looter.id });
  await until(() => client.player(), 'loot character');
  client.send({ type: 'attack', targetId: 'slime-0' });
  await until(() => client.snapshot.loot.some(drop => drop.ownerId === looter.id), 'monster corpse');
  const drop = client.snapshot.loot.find(drop => drop.ownerId === looter.id), gold = client.player().gold;
  await until(() => Date.now() >= drop.diedAt + DEATH_ANIMATION_MS, 'death animation');
  holdWrite = rows => rows.some(row => row.state.characters.some(p => p.id === looter.id && p.gold === gold + drop.gold));
  const request = { type: 'loot', targetId: drop.id, itemId: 'gold', requestId: randomUUID() };
  const lootedAt = Date.now(); client.send(request);
  await until(() => releaseWrite, 'held loot write');
  const heldAt = Date.now();
  assert.equal(client.player().gold, gold, 'uncommitted loot never reaches the player snapshot');
  assert.equal(records[hash(tokens[0])].characters.find(p => p.id === looter.id).gold, gold, 'held loot has not committed');
  assert(client.snapshot.loot.some(value => value.id === drop.id && value.gold === drop.gold), 'loot stays on the corpse until commit');
  client.send(request); // A duplicate must not reject the optimistic original while its save is pending.
  client.send({ ...request, itemId: 'item:prismatic-pearl' });
  const blockedActions = client.messages.length;
  client.send({ type: 'dropItem', itemId: 'potion', quantity: 1 });
  await until(() => client.messages.slice(blockedActions).some(message => message.type === 'event' && message.requestType === 'dropItem'), 'pending pickup retains the inventory mutation lock');
  assert(client.messages.slice(blockedActions).some(message => message.type === 'event' && message.requestType === 'dropItem' && /Saving your changes/.test(message.text)), 'pending loot cannot be spent or destroyed');
  assert(!client.messages.some(message => message.type === 'lootResult' && message.requestId === request.requestId), 'pending and altered duplicates cannot settle the original request');
  const manualPoint = { x: client.player().x + .25, z: client.player().z }, manualMovement = client.messages.length;
  assert(canTraverse(client.player(), manualPoint));
  client.send({ type: 'move', ...manualPoint, rotation: 0 });
  await until(() => client.player().x === manualPoint.x && joined[1].snapshot.players.some(p => p.id === looter.id && p.x === manualPoint.x), 'manual pickup allows normal movement while saving');
  assert(!client.messages.slice(manualMovement).some(message => message.type === 'correction'), 'manual pickup does not freeze valid movement');
  const beforeCombat = { xp: client.player().xp, hp: client.player().hp }, combatAt = client.messages.length;
  client.send({ type: 'attack', ability: 'power-shot', targetId: 'slime-1' });
  await until(() => client.player().casting?.ability === 'power-shot', 'manual loot save accepts a normal cast', 1500);
  client.send({ type: 'cancelCast', ability: 'power-shot' });
  await until(() => !client.player().casting, 'manual loot save accepts cast cancellation', 1500);
  client.send({ type: 'autoAttack', targetId: 'slime-1' });
  await until(() => client.player().autoAttack?.targetId === 'slime-1', 'manual loot save accepts an auto-attack target', 1500);
  await until(() => client.player().xp > beforeCombat.xp, 'auto-attack ticks earn combat XP while manual loot is pending');
  assert(client.messages.slice(combatAt).some(message => message.type === 'combat' && message.basic && message.playerId === looter.id), 'auto-attack really executes during the pending write');
  client.send({ type: 'autoAttack', targetId: null });
  await until(() => !client.player().autoAttack, 'manual loot save accepts stopping auto-attacks');
  const earnedXp = client.player().xp, questAfterCombat = structuredClone(client.player().quest), healthAfterCombat = client.player().hp, combatLoot = client.snapshot.loot.find(value => value.enemyId === 'slime-1');
  assert(combatLoot, 'combat rewards stay on a separate corpse while earlier loot saves');
  const heldFor = Date.now() - heldAt;
  releaseWrite();
  await until(() => client.messages.some(message => message.type === 'lootResult' && message.requestId === request.requestId), 'durable corpse gold acknowledged');
  timings.loot = Date.now() - lootedAt - heldFor; // Exclude only the deliberate fixture hold for combat assertions.
  assert.equal(client.player().xp, earnedXp, 'successful loot does not rewind concurrent combat XP');
  assert.deepEqual(client.player().quest, questAfterCombat, 'successful loot preserves concurrent quest progress');
  assert(client.player().hp >= healthAfterCombat, 'successful loot does not rewind concurrent health');
  assert(client.snapshot.loot.some(value => value.id === combatLoot.id), 'successful loot cannot consume a different combat reward');
  assert(timings.loot < 2300, `loot must not wait for separate deletion and gold-ledger round trips: ${timings.loot} ms`);
  assert.equal(records[hash(tokens[0])].characters.find(p => p.id === looter.id).gold, gold + drop.gold, 'loot acknowledgment follows durable gold and ledger commit');
  assert.deepEqual(transactions.at(-1), { queries: 2, gold: true }, 'loot, deletion fence, gold ledger and COMMIT share two requests');
  const resultIndex = client.messages.findIndex(message => message.type === 'lootResult' && message.requestId === request.requestId);
  assert.equal(client.messages[resultIndex].success, true);
  assert.equal(client.messages.slice(0, resultIndex).findLast(message => message.type === 'snapshot').players.find(p => p.id === looter.id).gold, gold + drop.gold, 'authoritative commit snapshot precedes the result');
  const replay = client.messages.length; client.send(request);
  await until(() => client.messages.slice(replay).some(message => message.type === 'lootResult'), 'completed duplicate reply');
  assert.equal(client.messages.slice(replay).find(message => message.type === 'lootResult').success, true, 'completed duplicate reuses its original success');
  assert.equal(client.player().gold, gold + drop.gold, 'duplicate pickup never grants gold twice');
  for (const invalid of [{ targetId: '' }, { targetId: drop.id, inventory: {} }, { targetId: drop.id, itemId: 'gold' }]) {
    const requestId = randomUUID(); client.send({ type: 'loot', ...invalid, requestId });
    await until(() => client.messages.some(message => message.type === 'lootResult' && message.requestId === requestId), 'invalid or already collected pickup receives a result');
    assert.equal(client.messages.find(message => message.type === 'lootResult' && message.requestId === requestId).success, false);
  }

  const manualFailure = randomUUID();
  const petWrite = rows => rows.some(row => row.state.characters.some(p => p.id === looter.id && p.carriedItems['prismatic-pearl'] === 1));
  holdWrite = petWrite;
  client.send({ type: 'loot', targetId: drop.id, itemId: 'item:prismatic-pearl', requestId: manualFailure });
  await until(() => releaseWrite, 'held manual item pickup');
  await until(() => Date.now() >= client.player().globalCooldownUntil, 'combat cooldown after first pickup');
  const failureCombatAt = client.messages.length, failureXpBefore = client.player().xp;
  client.send({ type: 'attack', ability: 'arrow', targetId: 'slime-3' });
  await until(() => client.player().xp > failureXpBefore, 'a spell earns XP while item save is held');
  const failureXp = client.player().xp, failureQuest = structuredClone(client.player().quest);
  await until(() => Date.now() >= client.player().globalCooldownUntil, 'healing global cooldown');
  const woundedHp = client.player().hp;
  client.send({ type: 'attack', ability: 'trail-mending' });
  await until(() => client.player().casting?.ability === 'trail-mending', 'healing spell starts during pending loot');
  await until(() => !client.player().casting && client.player().hp > woundedHp, 'healing completes while loot save is held');
  const healedHp = client.player().hp;
  assert(!client.messages.slice(failureCombatAt).some(message => message.type === 'event' && message.requestType === 'attack' && /Saving your changes/.test(message.text)), 'combat is not rejected by a corpse save');
  releaseWrite(Object.assign(Error('Fixture manual loot conflict'), { code: '40001' }));
  await until(() => client.messages.some(message => message.type === 'lootResult' && message.requestId === manualFailure), 'manual save failure acknowledged');
  assert.equal(client.messages.find(message => message.type === 'lootResult' && message.requestId === manualFailure).success, false);
  assert.equal(client.player().carriedItems['prismatic-pearl'] || 0, 0, 'failed manual pickup grants no items');
  assert(client.snapshot.loot.find(value => value.id === drop.id).items.some(row => row.itemId === 'prismatic-pearl'), 'failed manual pickup preserves loot for retry');
  assert.equal(records[hash(tokens[0])].characters.find(p => p.id === looter.id).carriedItems['prismatic-pearl'] || 0, 0);
  assert.equal(client.player().xp, failureXp, 'failed loot never rewinds earned combat XP');
  assert.deepEqual(client.player().quest, failureQuest, 'failed loot never rewinds completed quest objectives');
  assert(client.player().hp >= healedHp, 'failed loot never rewinds a completed heal');
  client.send({ type: 'attack', ability: 'wild-renewal' });
  await until(() => client.player().abilityCooldowns['wild-renewal'] > Date.now(), 'casting works immediately after failed loot without reselecting anything');

  // Automatic pickup keeps inventory locked, but slow writes must not freeze the owner or other viewers.
  holdWrite = petWrite;
  client.send({ type: 'summonPet', pet: 'moss-fox' });
  await until(() => releaseWrite, 'held automatic pet pickup');
  const waitingOutOfRange = { type: 'loot', targetId: drop.id, itemId: 'item:prismatic-pearl', requestId: randomUUID() };
  client.send(waitingOutOfRange);
  const moveDuringPickup = async () => {
    const point = { x: client.player().x + .25, z: client.player().z }, first = client.messages.length;
    assert(canTraverse(client.player(), point), 'clear legal movement fixture');
    client.send({ type: 'move', ...point, rotation: 0 });
    await until(() => client.player().x === point.x && joined[1].snapshot.players.some(p => p.id === looter.id && p.x === point.x), 'owner and observer see movement during pet save', 1500);
    assert(!client.messages.slice(first).some(message => message.type === 'correction'), 'legal movement receives no saving correction');
    return point;
  };
  let moved = await moveDuringPickup();
  const petCombatAt = client.messages.length;
  await until(() => Date.now() >= client.player().globalCooldownUntil, 'pet-save combat global cooldown');
  client.send({ type: 'attack', ability: 'barkskin' });
  await until(() => client.player().abilityCooldowns.barkskin > Date.now(), 'automatic pet loot accepts normal skills');
  for (const step of [3, 3, 2]) {
    await delay(700);
    const petPoint = { x: client.player().x, z: client.player().z + step };
    assert(canTraverse(client.player(), petPoint));
    client.send({ type: 'move', ...petPoint, rotation: 0 });
    await until(() => client.player().z === petPoint.z, 'move within range while pet pickup saves');
  }
  const petXpBefore = client.player().xp;
  client.send({ type: 'autoAttack', targetId: 'slime-2' });
  await until(() => client.player().autoAttack?.targetId === 'slime-2', 'pet pickup accepts a new combat target');
  await until(() => client.player().xp > petXpBefore, 'auto-attack ticks continue through automatic pet loot');
  client.send({ type: 'autoAttack', targetId: null });
  await until(() => !client.player().autoAttack, 'pet pickup accepts stopping combat');
  assert(!client.messages.slice(petCombatAt).some(message => message.type === 'event' && ['attack', 'autoAttack'].includes(message.requestType) && /Saving your changes/.test(message.text)));
  moved = { x: client.player().x, z: client.player().z };
  const petCombatXp = client.player().xp, petCombatQuest = structuredClone(client.player().quest), petCombatHp = client.player().hp;
  const petGoldBefore = client.player().gold, corpseGold = () => client.snapshot.loot.filter(value => value.ownerId === looter.id).reduce((sum, value) => sum + value.gold, 0);
  const petCorpseGoldBefore = corpseGold();
  const invalid = client.messages.length;
  client.send({ type: 'move', x: moved.x + 100, z: moved.z, rotation: 0 });
  await until(() => client.messages.slice(invalid).some(message => message.type === 'correction' && message.reason === 'Movement adjusted to the realm.'), 'pet save retains movement limits');
  assert.equal(client.player().x, moved.x, 'impossible movement cannot alter position during a pet save');
  const blocked = client.messages.length;
  client.send({ type: 'selectCharacter', characterId: heroes[0].id });
  await until(() => client.messages.slice(blocked).some(message => message.type === 'event' && message.requestType === 'selectCharacter' && /Saving your changes/.test(message.text)), 'character changes remain locked');
  assert(!client.messages.some(message => message.type === 'lootResult' && message.requestId === waitingOutOfRange.requestId), 'manual pickup waits behind the pet save');
  assert.equal(client.player().carriedItems['prismatic-pearl'] || 0, 0, 'uncommitted pet loot stays unavailable');
  assert(client.snapshot.loot.find(value => value.id === drop.id).items.some(row => row.itemId === 'prismatic-pearl'), 'held loot stays on its corpse');
  const lateRequest = { ...waitingOutOfRange, requestId: randomUUID() };
  client.send(lateRequest);
  await until(() => client.messages.some(message => message.type === 'lootResult' && message.requestId === lateRequest.requestId), 'new out-of-range pickup is rejected at admission');
  assert.equal(client.messages.find(message => message.type === 'lootResult' && message.requestId === lateRequest.requestId).success, false);
  holdWrite = petWrite; // Hold the admitted manual retry so the failed pet write remains observable.
  releaseWrite(Object.assign(Error('Fixture inventory conflict'), { code: '40001' }));
  await until(() => client.messages.slice(blocked).some(message => message.type === 'event' && /Your action could not be saved/.test(message.text)), 'failed pickup acknowledged');
  await until(() => releaseWrite, 'previously admitted manual pickup starts after the failed pet write');
  assert(!client.messages.some(message => message.type === 'lootResult' && message.requestId === waitingOutOfRange.requestId), 'admitted pickup remains pending after walking out of range');
  assert.equal(client.player().carriedItems['prismatic-pearl'] || 0, 0, 'failed pickup grants no items');
  assert.equal(records[hash(tokens[0])].characters.find(p => p.id === looter.id).carriedItems['prismatic-pearl'] || 0, 0, 'failed pickup changes no durable items');
  assert.equal(client.player().x, moved.x, 'failed pickup never rewinds accepted movement');
  assert.equal(client.player().xp, petCombatXp, 'failed pet pickup preserves concurrent combat XP');
  assert.equal(client.player().gold, petGoldBefore, 'failed pet pickup grants no corpse gold');
  assert.deepEqual(client.player().quest, petCombatQuest, 'failed pet pickup preserves quest progress');
  assert(client.player().hp >= petCombatHp, 'failed pet pickup preserves combat health');
  moved = await moveDuringPickup();
  const leaving = client.messages.length;
  client.send({ type: 'leaveRealm' });
  await delay(150);
  assert(!client.messages.slice(leaving).some(message => message.type === 'realmLeft'), 'handoff waits for pending pet rewards');
  releaseWrite();
  await until(() => client.messages.some(message => message.type === 'realmLeft'), 'pet rewards and latest position saved before handoff');
  assert.equal(client.messages.find(message => message.type === 'lootResult' && message.requestId === waitingOutOfRange.requestId)?.success, true, 'admitted pickup commits after moving away and before handoff');
  const storedLooter = records[hash(tokens[0])].characters.find(p => p.id === looter.id);
  assert.equal(storedLooter.carriedItems['prismatic-pearl'], 1, 'failed retry and duplicate manual pickup grant exactly one item');
  assert.equal(storedLooter.gold, petGoldBefore + petCorpseGoldBefore - corpseGold(), 'automatic retry grants only gold removed from the original or newly earned combat corpses');
  assert.equal(storedLooter.x, moved.x, 'handoff preserves movement accepted after the pet write began');
  assert.equal(storedLooter.xp, petCombatXp, 'handoff durably retains combat XP earned during pending loot');
  assert.deepEqual(storedLooter.quest, petCombatQuest, 'handoff durably retains concurrent quest progress');
  client = await connect(tokens[0], heroes[0].id);
  await until(() => client.player(), 'return to inventory character');

  // Disconnected retries waiting behind an admitted write must do no claim SQL.
  holdWrite = rows => rows.some(row => row.state.characters.some(p => p.id === heroes[0].id && p.equipment.head === 'ranger-head'));
  client.send({ type: 'equipGear', itemId: 'ranger-head' });
  await until(() => releaseWrite, 'held inventory write');
  const lockedPosition = { x: client.player().x, z: client.player().z }, locked = client.messages.length;
  client.send({ type: 'move', x: lockedPosition.x + .25, z: lockedPosition.z, rotation: 0 });
  await until(() => client.messages.slice(locked).some(message => message.type === 'correction'), 'ordinary inventory save retains movement lock');
  assert.equal(client.player().x, lockedPosition.x, 'background-loot exception never bypasses ordinary purchase locks');
  client.send({ type: 'attack', ability: 'arrow', targetId: 'slime-0' });
  client.send({ type: 'autoAttack', targetId: 'slime-0' });
  await until(() => client.messages.slice(locked).filter(message => message.type === 'event' && ['attack', 'autoAttack'].includes(message.requestType) && /Saving your changes/.test(message.text)).length === 2, 'ordinary equipment mutations still block combat');
  for (const type of ['dungeonEnter', 'dungeonInteract', 'dungeonExit']) client.send({ type, ...(type === 'dungeonInteract' ? { targetId: 'preparation-to-threshold' } : {}) });
  await until(() => client.messages.slice(locked).filter(message => message.type === 'event' && ['dungeonEnter', 'dungeonInteract', 'dungeonExit'].includes(message.requestType) && /Saving your changes/.test(message.text)).length === 3, 'ordinary equipment mutations still block every dungeon transition');
  const beforeClaims = claims, beforeCommits = commits;
  const abandoned = await Promise.all(Array.from({ length: 3 }, () => connect(randomBytes(32).toString('base64url'))));
  await delay(100); abandoned.forEach(peer => peer.socket.close()); await until(() => abandoned.every(peer => peer.closed !== null), 'abandoned retry sockets');
  releaseWrite(); await until(() => commits > beforeCommits && client.player().equipment.head === 'ranger-head', 'held inventory commit');
  const started = Date.now(); client.send({ type: 'leaveRealm' });
  await until(() => client.messages.some(message => message.type === 'realmLeft'), 'durable handoff');
  timings.handoff = Date.now() - started;
  assert.equal(claims, beforeClaims, 'closed queued joins must not claim and release database ownership');
  assert(timings.handoff < 2900, `handoff remains bounded behind cancelled retries: ${timings.handoff} ms`);
  const throttled = joined[2], throttledId = randomUUID(), rosterAt = throttled.messages.length;
  throttled.send({ type: 'leaveWorld' });
  await until(() => throttled.messages.slice(rosterAt).some(message => message.type === 'roster'), 'return to roster before a stale pickup');
  const noSession = { type: 'loot', targetId: drop.id, requestId: randomUUID() };
  throttled.send(noSession);
  await until(() => throttled.messages.some(message => message.type === 'lootResult' && message.requestId === noSession.requestId), 'pickup without a world session receives a result');
  assert.equal(throttled.messages.find(message => message.type === 'lootResult' && message.requestId === noSession.requestId).success, false);
  const beforeThrottle = throttled.messages.length;
  // Exhaust the account token bucket, including its 130-message burst allowance.
  for (let id = 0; id < 260; id++) throttled.send({ type: 'ping', id });
  throttled.send(noSession);
  throttled.send({ type: 'loot', targetId: drop.id, requestId: throttledId });
  await until(() => throttled.messages.some(message => message.type === 'lootResult' && message.requestId === throttledId), 'rate-limited loot receives a result');
  assert.equal(throttled.messages.find(message => message.type === 'lootResult' && message.requestId === throttledId).success, false);
  assert(!throttled.messages.slice(beforeThrottle).some(message => message.type === 'lootResult' && message.requestId === noSession.requestId), 'cached result replays cannot bypass the rate limit');
  assert(sharedRefreshQueries > 0, 'remote notifications refresh deletion fences and player state in one SQL round trip');
  assert.equal(separateFenceQueries, 0, 'shared refresh never queues a separate deletion-fence round trip');
  clearInterval(notifier); slow = false;
  for (const socket of sockets) socket.terminate();
  await game.stop();

  // Real portal/object requests must proceed while the owning account's loot COMMIT is held.
  // Keep the authored geometry and guards; only shorten unrelated encounter packs.
  const stages = dungeonStages(), packs = stages.map(stage => stage.enemies), monsterStats = structuredClone(MONSTERS);
  let offset = 0;
  Date.now = () => realNow() + offset;
  try {
    for (const stats of Object.values(MONSTERS)) Object.assign(stats, { hp: 1, speed: 0, aggroRange: 0 });
    stages.forEach(stage => { stage.enemies = stage.id === 'threshold' ? stage.enemies.slice(0, 2) : stage.id === 'throne' ? stage.enemies.slice(0, 1) : []; });
    const definition = getDungeon(), layout = dungeonLayout(), token = randomBytes(32).toString('base64url');
    const owner = Object.assign(hero('Saving delver'), { x: definition.entrance.x, z: definition.entrance.z + 1, zone: definition.entrance.zone, rootvaultUnlocked: true });
    records[hash(token)] = { characters: [owner], communityRulesVersion: 1 };
    game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: 'postgres://isolated-latency-fixture',
      auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, nftChain: disabled, treasuryChain: disabled, walletOidc: { env: {} } });
    port = await game.start();
    const peer = await connect(token, owner.id), stored = () => records[hash(token)].characters[0];
    await until(() => peer.player(), 'dungeon latency character');
    const position = () => ({ x: peer.player().x, z: peer.player().z, instanceId: peer.snapshot.instanceId });
    async function rejected(message, pattern) {
      const at = peer.messages.length, before = position(); peer.send(message);
      await until(() => peer.messages.slice(at).some(value => value.type === 'event' && pattern.test(value.text)), `pending loot preserves ${message.type} guard`);
      assert.deepEqual(position(), before);
    }
    async function walk(goal) {
      const state = peer.snapshot.dungeon, activated = state.objects.filter(object => object.activated).map(object => object.id);
      const colliders = dungeonColliders(state.clearedStages, activated), path = findPath(peer.player(), goal, colliders, dungeonBounds());
      if (!path.length) {
        const roomAt = point => layout.rooms.find(room => Math.abs(point.x - room.x) < room.width / 2 && Math.abs(point.z - room.z) < room.depth / 2)?.id;
        const target = roomAt(goal), queue = [{ room: roomAt(peer.player()), route: [] }], seen = new Set([queue[0].room]);
        for (const node of queue) {
          if (node.room === target) {
            for (const portal of node.route) {
              await walk(portal); peer.send({ type: 'dungeonInteract', targetId: portal.id });
              await until(() => Math.hypot(peer.player().x - portal.destination.x, peer.player().z - portal.destination.z) < .01, 'room teleport before held loot commits');
            }
            return walk(goal);
          }
          for (const portal of layout.portals.filter(portal => portal.roomId === node.room && dungeonRoomPortalOpen(portal, state.clearedStages, activated)))
            if (!seen.has(portal.targetRoomId)) { seen.add(portal.targetRoomId); queue.push({ room: portal.targetRoomId, route: [...node.route, portal] }); }
        }
        assert.fail('No open dungeon route to regression target');
      }
      for (const point of path) while (Math.hypot(peer.player().x - point.x, peer.player().z - point.z) > .01) {
        const p = peer.player(), gap = Math.hypot(p.x - point.x, p.z - point.z), step = Math.min(2.5, gap);
        const next = { x: p.x + (point.x - p.x) * step / gap, z: p.z + (point.z - p.z) * step / gap };
        offset += 500; peer.send({ type: 'move', ...next, rotation: 0 });
        await until(() => Math.hypot(peer.player().x - next.x, peer.player().z - next.z) < .01, 'walk during held loot').catch(error => { throw new Error(error.message + ' ' + JSON.stringify({goal,next,position:peer.player(),events:peer.messages.filter(message=>message.type!=='snapshot').slice(-6)})); });
      }
    }
    async function defeat(enemy) {
      await walk({ x: enemy.x, z: enemy.z + 1 }); offset += 2000;
      peer.send({ type: 'autoAttack', targetId: enemy.id });
      await until(() => !peer.snapshot.enemies.find(value => value.id === enemy.id)?.alive, 'latency fixture guardian defeated');
      peer.send({ type: 'autoAttack', targetId: null }); offset += DEATH_ANIMATION_MS + 1;
    }
    peer.send({ type: 'dungeonEnter' }); await until(() => peer.snapshot.instanceId, 'enter latency dungeon');
    await walk(layout.portals.find(portal => portal.roomId === 'preparation'));
    peer.send({ type: 'dungeonInteract', targetId: 'preparation-to-threshold' });
    await until(() => peer.player().z < 0, 'enter sealed threshold');
    const guardians = peer.snapshot.enemies.filter(enemy => enemy.alive);
    await defeat(guardians[0]);
    const corpse = peer.snapshot.loot.find(drop => drop.enemyId === guardians[0].id), gold = peer.player().gold;
    holdWrite = rows => rows.some(row => row.state.characters.some(p => p.id === owner.id && p.gold > gold));
    const request = { type: 'loot', targetId: corpse.id, itemId: 'gold', requestId: randomUUID() }; peer.send(request);
    await until(() => releaseWrite, 'held dungeon loot write');
    await rejected({ type: 'dungeonInteract', targetId: 'forged-portal' }, /Stand beside/);
    await rejected({ type: 'dungeonInteract', targetId: 'garden-cache' }, /Stand beside/);
    const back = layout.portals.find(portal => portal.id === 'threshold-to-preparation');
    await walk(back); await rejected({ type: 'dungeonInteract', targetId: back.id }, /sealed/);
    await rejected({ type: 'dungeonExit' }, /entrance exit/);
    await defeat(guardians[1]);
    await until(() => peer.snapshot.dungeon.clearedStages.includes('west-seal'), 'shortened packs reach rune chambers');
    for (const id of ['verdant-seal', 'garden-cache', 'glacial-seal']) {
      const object = layout.objects.find(object => object.id === id);
      await walk({ x:object.x, z:object.z+2 }); peer.send({ type: 'dungeonInteract', targetId: id });
      await until(() => peer.snapshot.dungeon.objects.find(object => object.id === id)?.activated, `${id} activates before loot commit`);
    }
    assert(peer.snapshot.loot.some(drop => drop.sourceObjectId === 'garden-cache'), 'opening a chest creates its own unclaimed rewards while earlier loot saves');
    assert.equal(stored().gold, gold, 'travel and objects cannot prematurely grant held loot');
    const travelled = position();
    releaseWrite(); await until(() => peer.messages.some(message => message.type === 'lootResult' && message.requestId === request.requestId), 'travelled loot committed');
    assert.equal(stored().gold, gold + corpse.gold); assert.deepEqual(position(), travelled, 'loot commit does not rewind room travel');
    const replayAt = peer.messages.length; peer.send(request);
    await until(() => peer.messages.slice(replayAt).some(message => message.type === 'lootResult'), 'travelled loot replay');
    assert.equal(peer.messages.slice(replayAt).find(message => message.type === 'lootResult').success, true);
    assert.equal(peer.player().gold, gold + corpse.gold, 'travelled pickup grants once');
    await until(() => peer.snapshot.enemies.some(enemy => enemy.alive && enemy.id.includes('-throne-')), 'final fixture guardian spawns');
    const boss = peer.snapshot.enemies.find(enemy => enemy.alive && enemy.id.includes('-throne-'));
    await defeat(boss);
    await until(() => peer.snapshot.dungeon.completed, 'fixture dungeon complete');
    const bossDrop = peer.snapshot.loot.find(drop => drop.enemyId === boss.id), savedGold = peer.player().gold;
    assert(bossDrop.gold > 0);
    holdWrite = rows => rows.some(row => row.state.characters.some(p => p.id === owner.id && p.gold > savedGold));
    const failed = { type: 'loot', targetId: bossDrop.id, itemId: 'gold', requestId: randomUUID() }; peer.send(failed);
    await until(() => releaseWrite, 'held boss loot write');
    const returnPortal = dungeonReturn();
    await walk({ x: returnPortal.x, z: returnPortal.z + 2 }); peer.send({ type: 'dungeonExit' });
    await until(() => !peer.snapshot.instanceId, 'final return portal works before loot commit');
    peer.send({ type: 'dungeonEnter' }); await until(() => peer.snapshot.instanceId, 'new dungeon entry works before loot commit');
    await walk(DUNGEON_EXIT); peer.send({ type: 'dungeonExit' });
    await until(() => !peer.snapshot.instanceId, 'entrance exit works before loot commit');
    const returned = position();
    releaseWrite(Object.assign(Error('Fixture dungeon loot conflict'), { code: '40001' }));
    await until(() => peer.messages.some(message => message.type === 'lootResult' && message.requestId === failed.requestId), 'travelled loot failure acknowledged');
    assert.equal(peer.messages.find(message => message.type === 'lootResult' && message.requestId === failed.requestId).success, false);
    assert.equal(peer.player().gold, savedGold); assert.equal(stored().gold, savedGold, 'failed loot grants no gold after exiting its dungeon');
    assert.deepEqual(position(), returned, 'failed loot does not rewind dungeon entry or exit');
    peer.socket.terminate(); await game.stop();
  } finally {
    releaseWrite?.(); stages.forEach((stage, index) => { stage.enemies = packs[index]; });
    for (const [kind, stats] of Object.entries(monsterStats)) Object.assign(MONSTERS[kind], stats);
    Date.now = realNow;
  }

  // Real socket clicks arrive before any acknowledgment; each row joins the same durable FIFO.
  LOOT_TABLES['moss-slime'] = ['prismatic-pearl', 'trail-bread'].map(itemId => ({ kind: 'item', itemId, chance: 1 }));
  for (const scenario of ['multiple', 'failed-first', 'full-bags', 'queue-limit']) {
    const token = randomBytes(32).toString('base64url'), owner = Object.assign(hero(`Queued ${scenario}`), {
      x: slime.x + 1, z: slime.z, ...newBags(), carriedItems: {},
    });
    owner.quest.stage = 1;
    if (scenario === 'full-bags') {
      for (const item of Object.values(GEAR)) if (bagUsage(owner) < 15 && item.requiredLevel <= owner.level && (!item.className || item.className === 'Ranger') && !owner.ownedGear.includes(item.id)) owner.ownedGear.push(item.id);
      assert.equal(bagUsage(owner), 15, 'one remaining slot allows the first queued item but not the second');
    }
    records[hash(token)] = { characters: [owner], communityRulesVersion: 1 };
    game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: 'postgres://isolated-latency-fixture',
      auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, nftChain: disabled, treasuryChain: disabled, walletOidc: { env: {} } });
    port = await game.start();
    const peer = await connect(token, owner.id), stored = () => records[hash(token)].characters[0];
    await until(() => peer.player(), `${scenario} character`);
    peer.send({ type: 'attack', targetId: 'slime-0' });
    await until(() => peer.snapshot.loot.some(value => value.ownerId === owner.id), `${scenario} corpse`);
    const corpse = peer.snapshot.loot.find(value => value.ownerId === owner.id);
    await until(() => Date.now() >= corpse.diedAt + DEATH_ANIMATION_MS, `${scenario} death animation`);
    const requests = ['gold', 'item:prismatic-pearl', 'item:trail-bread'].map(itemId => ({ type: 'loot', targetId: corpse.id, itemIds: [itemId], requestId: randomUUID() }));
    if (scenario === 'multiple') {
      for (const selection of [{ itemIds: [] }, { itemIds: ['gold', 'gold'] }, { itemIds: null }, { itemIds: [1] }, { itemIds: ['gold'], itemId: 'gold' }, { itemIds: Array.from({ length: 129 }, (_, i) => String(i)) }]) {
        const requestId = randomUUID(); peer.send({ type: 'loot', targetId: corpse.id, ...selection, requestId });
        await until(() => peer.messages.some(message => message.type === 'lootResult' && message.requestId === requestId), 'invalid row selection is acknowledged');
        assert.equal(peer.messages.find(message => message.type === 'lootResult' && message.requestId === requestId).success, false);
      }
      assert.equal(stored().gold, owner.gold, 'malformed row selections cannot grant loot');
    }
    holdWrite = rows => rows.some(row => row.state.characters.some(p => p.id === owner.id && p.gold === owner.gold + corpse.gold));
    peer.send(requests[0]);
    await until(() => releaseWrite, `${scenario} held first manual pickup`);
    peer.send(requests[1]); peer.send(requests[2]); peer.send(requests[1]);
    if (scenario === 'queue-limit') {
      while (requests.length < 16) { const request = { ...requests[1], requestId: randomUUID() }; requests.push(request); peer.send(request); }
      const overflow = { ...requests[2], requestId: randomUUID() };
      peer.send(overflow);
      await until(() => peer.messages.some(message => message.type === 'lootResult' && message.requestId === overflow.requestId), 'seventeenth pickup is bounded without disturbing admitted requests');
      assert.equal(peer.messages.find(message => message.type === 'lootResult' && message.requestId === overflow.requestId).success, false);
    }
    await delay(120);
    assert(requests.every(request => !peer.messages.some(message => message.type === 'lootResult' && message.requestId === request.requestId)), 'distinct clicks and duplicate retries stay pending while the first write is held');
    assert.equal(stored().gold, owner.gold);
    assert.deepEqual(stored().carriedItems, {}, 'queued rows are unavailable before their own commits');
    const moveAt = peer.messages.length;
    for (const step of [3, 1.25]) {
      await delay(700);
      const point = { x: peer.player().x, z: peer.player().z + step };
      assert(canTraverse(peer.player(), point));
      peer.send({ type: 'move', ...point, rotation: 0 });
      await until(() => peer.player().z === point.z, 'walk away while several manual pickups remain pending');
    }
    assert(Math.hypot(peer.player().x - corpse.x, peer.player().z - corpse.z) > 3, 'owner has left pickup range before any commit');
    assert(!peer.messages.slice(moveAt).some(message => message.type === 'correction'), 'the entire queued pickup sequence allows legal movement');
    let shutdown, shutdownFinished = false;
    if (scenario === 'multiple') {
      peer.send({ type: 'leaveRealm' }); await delay(50);
      assert(!peer.messages.some(message => message.type === 'realmLeft'), 'realm handoff waits for the whole pickup queue');
    }
    if (scenario === 'queue-limit') {
      shutdown = game.stop().then(() => { shutdownFinished = true; }); await delay(50);
      assert.equal(shutdownFinished, false, 'shutdown waits for all admitted pickups');
    }
    releaseWrite(scenario === 'failed-first' ? Object.assign(Error('Fixture first queued pickup conflict'), { code: '40001' }) : undefined);
    await until(() => requests.every(request => peer.messages.some(message => message.type === 'lootResult' && message.requestId === request.requestId)), `${scenario} every admitted pickup settles`);
    const results = peer.messages.filter(message => message.type === 'lootResult' && requests.some(request => request.requestId === message.requestId));
    assert.deepEqual(results.map(message => message.requestId), requests.map(request => request.requestId), 'admitted requests settle in click order and pending duplicates add no work');
    assert.deepEqual(results.map(message => message.success), requests.map((_, i) => !(scenario === 'failed-first' && i === 0 || scenario === 'full-bags' && i === 2)));
    assert.equal(stored().gold, owner.gold + (scenario === 'failed-first' ? 0 : corpse.gold), 'a later successful save never grants gold from a failed earlier pickup');
    assert.equal(stored().carriedItems['prismatic-pearl'], 1, 'a selected row is durably granted once across queued requests');
    assert.equal(stored().carriedItems['trail-bread'] || 0, scenario === 'full-bags' ? 0 : 1, 'later queued items use the inventory resulting from earlier commits');
    if (scenario === 'failed-first') assert.equal(peer.snapshot.loot.find(value => value.id === corpse.id)?.gold, corpse.gold, 'failed earlier row remains available after later rows save');
    if (scenario === 'full-bags') {
      assert.equal(bagUsage(peer.player()), 16);
      assert(peer.snapshot.loot.find(value => value.id === corpse.id)?.items.some(row => row.itemId === 'trail-bread'), 'bag rejection preserves the uncollected row');
      assert(peer.messages.some(message => message.type === 'event' && message.text.startsWith('Your bags are full.') && !message.logOnly), 'queued bag rejection retains the visible bags-full message');
    }
    if (scenario === 'multiple') {
      await until(() => peer.messages.some(message => message.type === 'realmLeft'), 'realm handoff acknowledges the full durable queue');
      await game.stop(); continue;
    }
    if (shutdown) { await shutdown; assert.equal(stored().carriedItems['trail-bread'], 1, 'final save preserves the last queued pickup'); continue; }
    const replayAt = peer.messages.length;
    peer.send(requests[0]); peer.send(requests[1]);
    await until(() => peer.messages.slice(replayAt).filter(message => message.type === 'lootResult').length === 2, 'multiple older request results stay available for replay');
    assert.deepEqual(peer.messages.slice(replayAt).filter(message => message.type === 'lootResult').map(message => message.success), [scenario !== 'failed-first', true]);
    assert.equal(stored().carriedItems['prismatic-pearl'], 1, 'replaying an older request after newer pickups never grants twice');
    peer.socket.terminate(); await game.stop();
  }
  LOOT_TABLES['moss-slime'] = [{ kind: 'item', itemId: 'prismatic-pearl', chance: 1 }];
  // Each case gets a fresh corpse; a high pet filter leaves a row for delayed manual collection.
  for (const scenario of ['collected', 'remaining', 'dead', 'expired', 'disconnected']) {
    const token = randomBytes(32).toString('base64url'), owner = Object.assign(hero(`Waiting ${scenario}`), {
      x: slime.x + 1, z: slime.z, ownedPets: ['moss-fox'], summonedPet: 'moss-fox', petLootMinQuality: scenario === 'collected' ? 'uncommon' : 'mythic',
    });
    owner.quest.stage = 1;
    records[hash(token)] = { characters: [owner], communityRulesVersion: 1 };
    game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: 'postgres://isolated-latency-fixture',
      auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, nftChain: disabled, treasuryChain: disabled, walletOidc: { env: {} } });
    port = await game.start();
    const peer = await connect(token, owner.id), stored = () => records[hash(token)].characters[0];
    await until(() => peer.player(), `${scenario} character`);
    holdWrite = rows => rows.some(row => row.state.characters.some(p => p.id === owner.id && p.gold > owner.gold));
    peer.send({ type: 'attack', targetId: 'slime-0' });
    await until(() => releaseWrite, `${scenario} held pet save`);
    const corpse = peer.snapshot.loot.find(value => value.ownerId === owner.id);
    assert(corpse?.items.some(row => row.itemId === 'prismatic-pearl'));
    const waiting = { type: 'loot', targetId: corpse.id, ...(scenario === 'collected' ? {} : { itemId: 'item:prismatic-pearl' }), requestId: randomUUID() };
    peer.send(waiting); peer.send(waiting);
    await delay(120);
    assert(!peer.messages.some(message => message.type === 'lootResult' && message.requestId === waiting.requestId), `${scenario} duplicate stays pending until the pet save finishes`);
    assert.equal(stored().gold, owner.gold, 'uncommitted pet gold is unavailable');
    if (scenario === 'dead') {
      Object.assign(MONSTERS['moss-slime'], { aggroRange: 40, speed: 30, damage: 10000 });
      await until(() => peer.player().hp === 0, 'monster kills owner while pickup waits');
      Object.assign(MONSTERS['moss-slime'], oldSlime);
    } else if (scenario === 'expired') {
      Date.now = () => realNow() + 300001;
      await until(() => !peer.snapshot.loot.some(value => value.id === corpse.id), 'corpse expires while pickup waits');
    } else if (scenario === 'disconnected') {
      peer.socket.close(); await until(() => peer.closed !== null, 'owner disconnects while pickup waits');
    }
    if (scenario === 'dead' || scenario === 'expired') {
      const late = { ...waiting, requestId: randomUUID() };
      peer.send(late);
      await until(() => peer.messages.some(message => message.type === 'lootResult' && message.requestId === late.requestId), `${scenario} pickup cannot be admitted`);
      assert.equal(peer.messages.find(message => message.type === 'lootResult' && message.requestId === late.requestId).success, false);
    }
    releaseWrite(scenario === 'dead' ? Object.assign(Error('Fixture pet save conflict after death'), { code: '40001' }) : undefined);
    if (scenario !== 'disconnected') {
      await until(() => peer.messages.some(message => message.type === 'lootResult' && message.requestId === waiting.requestId), `${scenario} waiting pickup settles`);
      assert.equal(peer.messages.find(message => message.type === 'lootResult' && message.requestId === waiting.requestId).success, true, `${scenario} cannot cancel a pickup already admitted to the durable queue`);
      const replayAt = peer.messages.length; peer.send(waiting);
      await until(() => peer.messages.slice(replayAt).some(message => message.type === 'lootResult' && message.requestId === waiting.requestId), 'admitted pickup reply remains cached');
      assert.equal(peer.messages.slice(replayAt).find(message => message.type === 'lootResult').success, true);
    } else await until(() => stored().carriedItems['prismatic-pearl'] === 1, 'disconnected owner retains every already admitted reward');
    Date.now = realNow;
    peer.socket.terminate(); await game.stop();
    assert.equal(stored().carriedItems['prismatic-pearl'], 1, `${scenario} admitted pickup grants exactly one item`);
    assert.equal(stored().gold, owner.gold + (scenario === 'dead' ? 0 : corpse.gold), `${scenario} pet gold is committed at most once`);
  }
  console.log(`PASS 270 ms SQL latency: three concurrent joins with 2422 ms full reads ${joinMs.join('/')} ms, equip ${timings.equip} ms, unequip ${timings.unequip} ms, gold loot ${timings.loot} ms, handoff ${timings.handoff} ms; fresh full-read coalescing and retry after failure; 16-request durable FIFO, immediate multi-row pickup, exact-once duplicate/replay, arrival-time range/death/expiry guards, admitted pickup survives movement/death/expiry/disconnect, queue-cap/full-bag/failure isolation, queued handoff/shutdown, merged stacks and appended rewards, validated row selections, manual and pet movement/combat, held-loot dungeon portals/runes/caches/entry/exits with guards and no rewind, XP/quest/health preservation, rollback/retry/handoff and ordinary action locks.`);
} finally {
  Date.now = realNow; Object.assign(MONSTERS['moss-slime'], oldSlime);
  clearInterval(notifier); slow = false; releaseWrite?.(); for (const socket of sockets) socket.terminate();
  await game?.stop(); pg.Client = OriginalClient; LOOT_TABLES['moss-slime'] = oldLootTable; rmSync(dir, { recursive: true, force: true });
}
