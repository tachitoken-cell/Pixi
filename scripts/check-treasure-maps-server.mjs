import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { runInNewContext } from 'node:vm';
import { createGameServer } from '../server.mjs';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { canTraverse, createOverworldSpawns } from '../src/realm.ts';
import { surfaceAt } from '../src/landscape.ts';
import { TREASURE_MAP, TREASURE_MAP_SITES, treasureMapPlayerValid, treasureMapReward } from '../src/treasure-maps.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-map-')), file = join(dir, 'players.json'), realNow = Date.now;
const clients = [], originalSlimeHp = MONSTERS['moss-slime'].hp, originalGuardianHp = MONSTERS['briar-sentinel'].hp;
let clock = realNow(), game, port, chance = 99, draws = 0;
Date.now = () => clock;
const key = token => createHash('sha256').update(token).digest('hex');
const slime = createOverworldSpawns().find(enemy => enemy.id === 'slime-0');
const site = TREASURE_MAP_SITES.find(site => site.zone === 'greenwood');
assert(site, 'at least one real route is available');
assert.equal(TREASURE_MAP.dropChancePercent, 5); assert.equal(TREASURE_MAP.voucherChancePercent, 1);
// Exercise the real authorization and cleanup functions at an otherwise tiny account-lock timing window.
const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const ownerSession = { recordKey: 'owner', player: { id: 'owner', hp: 100, treasureMap: { id: 'route', stage: 'guardian' } } };
const pending = new Map(), releasing = new Map(), ownerSessions = new Map([['owner', ownerSession]]);
const allowedSource = source.slice(source.indexOf('function mapGuardianAllowed('), source.indexOf('  const treasureMapReady ='));
const combatSaveSource = source.match(/  function combatSaveBlocked\([^]*?\n  \}/)[0];
const allowed = runInNewContext(`${combatSaveSource}\n(${allowedSource})`, { sessions: ownerSessions, liveSession: () => true, committingAccounts: pending,
  releasingAccounts: releasing, distance: () => 0, CHASE_DISTANCE: 40, partyOf: () => ({ members: ['member'] }) });
const guard = { mapOwnerId: 'owner', mapExpeditionId: 'route' }, helper = { player: { id: 'member' } };
assert(allowed(guard, helper)); pending.set('owner', {}); assert.equal(allowed(guard, helper), false, 'pending owner save blocks party lethal hits');
pending.set('owner', { backgroundLoot: true }); assert(allowed(guard, helper), 'pending corpse loot keeps guardian combat authorized');
pending.clear(); releasing.set('owner', {}); assert.equal(allowed(guard, helper), false, 'owner handoff blocks party lethal hits');
const corpseGuard = { ...guard, mapRecordKey: 'owner-account', alive: false }, pendingEnemies = [corpseGuard];
let saveAttempts = 0;
const updateSource = source.slice(source.indexOf('function updateMapGuardians('), source.indexOf('  let goldRoundSettlement'));
const cleanupScope = { enemies: pendingEnemies, sessions: new Map(), records: { 'owner-account': { characters: [ownerSession.player] } },
  finishMapGuardian: () => saveAttempts++, liveSession: () => false, activeSessions: () => [ownerSession], mapSite: () => site,
  WORLD_INTEREST_RADIUS: 300, distance: () => 0, pendingHits: [], monsterStatsAtLevel: () => ({ hp: 1 }) };
const update = runInNewContext(`(${updateSource})`, cleanupScope);
update(clock); assert.equal(pendingEnemies[0], corpseGuard); assert.equal(pendingEnemies.length, 1); assert.equal(saveAttempts, 1);
pendingEnemies.length = 0; update(clock); assert.equal(pendingEnemies.length, 0, 'closed account awaiting release cannot reconstruct guardian');
function hero(name, point = { x: site.x, z: site.z + 8 }, overrides = {}) {
  return { id: randomUUID(), name, ...point, zone: surfaceAt(point.x, point.z).zone, coordinateVersion: 2, rotation: 0, characterCreated: true,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    talents: [], learnedSpells: ['arrow', 'hamstring-shot', 'tranquilizing-shot', 'eagles-eye'], ...starterGear('Ranger'), ...newBags(),
    hp: 808, maxHp: 808, level: 60, xp: 0, gold: 0, carriedItems: { 'treasure-map': 2 },
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 }, ...overrides };
}
function account(player) { const token = randomBytes(32).toString('base64url'); return { token, key: key(token), player }; }
const saved = account => JSON.parse(readFileSync(file, 'utf8'))[account.key].characters[0];
async function until(fn, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const result = fn(); if (result) return result; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 100) { clock += ms; await delay(140); }
async function start(accounts) {
  if (accounts) writeFileSync(file, JSON.stringify(Object.fromEntries(accounts.map(a => [a.key, { characters: [a.player] }]))));
  clock += 1000; draws = 0;
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '',
    treasureRandomInt: () => 99, treasureMapRandomInt: max => { if (max === 100) { draws++; return chance; } return 0; } });
  port = await game.start();
}
async function connect(account) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [], account };
  clients.push(client); client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === account.player.id);
  socket.on('message', raw => { const m = JSON.parse(raw); client.messages.push(m); if (['snapshot', 'roster', 'welcome'].includes(m.type)) client[m.type] = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token: account.token });
  await until(() => client.roster, 'account roster');
  client.send({ type: 'selectCharacter', characterId: account.player.id });
  await until(() => client.player(), 'character entry'); return client;
}
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = undefined; }
async function command(client, type, fields = {}, success = true) {
  clock += 700; const before = client.messages.length;
  client.send({ type, ...fields });
  const result = await until(() => client.messages.slice(before).find(m => m.type === 'event' && m.requestType === type), type);
  assert.equal(result.kind === 'reward', success, result.text); await delay(140); return result;
}
async function move(client, point) {
  assert(canTraverse(client.player(), point), `clear fixture route to ${point.x}, ${point.z}`);
  while (Math.hypot(client.player().x - point.x, client.player().z - point.z) > .02) {
    const p = client.player(), gap = Math.hypot(point.x - p.x, point.z - p.z), step = Math.min(2, gap);
    const next = { x: p.x + (point.x - p.x) / gap * step, z: p.z + (point.z - p.z) / gap * step };
    clock += 450; client.send({ type: 'move', ...next, rotation: 0 });
    await until(() => Math.hypot(client.player().x - next.x, client.player().z - next.z) < .02, 'legal movement');
  }
}
async function kill(client, id) {
  const before = client.messages.length;
  client.send({ type: 'attack', targetId: id, ability: 'arrow' });
  const cast = await until(() => client.player().casting || client.messages.slice(before).find(m => m.type === 'combat' && m.playerId === client.account.player.id || m.type === 'event' && m.kind === 'info'), 'attack accepted');
  assert.equal(cast.kind, undefined, cast.text);
  await tick(Math.max(0, (cast.endsAt || clock) - clock) + 2000);
  return await until(() => client.snapshot.loot.find(drop => drop.enemyId === id && drop.ownerId === client.account.player.id), 'personal guardian/monster loot');
}
async function party(owner, member) {
  owner.send({ type: 'partyInvite', targetId: member.account.player.id });
  const invitation = await until(() => member.snapshot.partyInvites[0], 'party invitation');
  member.send({ type: 'partyAccept', invitationId: invitation.id });
  await until(() => owner.snapshot.party?.members.length === 2, 'party formed');
}
try {
  // Five winning values out of 100, one roll for a party, and ordinary pickup owns persistence.
  MONSTERS['moss-slime'].hp = 1;
  for (const roll of [4, 5]) {
    const point = { x: slime.x, z: slime.z + 8 }, a = account(hero('Map finder', point, { carriedItems: {} })), b = account(hero('Map helper', { x: point.x + .5, z: point.z }, { carriedItems: {} }));
    chance = roll; await start([a, b]); const owner = await connect(a), member = await connect(b); await party(owner, member);
    const drop = await kill(owner, slime.id); assert.equal(draws, 1);
    await until(() => member.snapshot.loot.some(d => d.enemyId === slime.id), 'party member receives personal loot');
    const drops = [owner, member].flatMap(client => client.snapshot.loot.filter(d => d.enemyId === slime.id));
    assert.equal(drops.length, 2);
    const maps = drops.flatMap(d => d.items.filter(item => item.itemId === 'treasure-map').map(item => ({ ownerId: d.ownerId, count: item.quantity })));
    assert.deepEqual(maps, roll === 4 ? [{ ownerId: a.player.id, count: 1 }] : []);
    if (roll === 4) {
      await move(owner, drop); await move(member, { x: drop.x + .5, z: drop.z });
      member.send({ type: 'loot', targetId: drop.id, itemId: 'item:treasure-map' }); await tick(1000);
      assert.equal(member.player().carriedItems['treasure-map'] || 0, 0);
      owner.send({ type: 'loot', targetId: drop.id, itemId: 'item:treasure-map' }); owner.send({ type: 'loot', targetId: drop.id, itemId: 'item:treasure-map' });
      await until(() => owner.player().carriedItems['treasure-map'] === 1, 'map picked up once');
      assert.equal(saved(a).carriedItems['treasure-map'], 1); assert.equal(draws, 1);
    }
    await stop();
  }
  MONSTERS['moss-slime'].hp = originalSlimeHp;
  MONSTERS['briar-sentinel'].hp = 1;
  for (const roll of [0, 1]) {
    const a = account(hero('Map owner')), b = account(hero('Map companion', { x: site.x + .5, z: site.z + 8 }));
    chance = roll; await start([a, b]); let owner = await connect(a), member = await connect(b);
    await command(owner, 'treasureMapStart', { x: site.x }, false);
    await command(owner, 'treasureMapStart'); const expedition = owner.player().treasureMap, request = { expeditionId: expedition.id };
    assert.equal(saved(a).carriedItems['treasure-map'], 1); assert.equal(saved(a).treasureMap.voucher, roll === 0);
    assert.equal(expedition.voucher, undefined); assert.equal(member.snapshot.players.find(p => p.id === a.player.id).treasureMap, null);
    await command(owner, 'treasureMapStart', {}, false); assert.equal(draws, 1);
    await command(owner, 'treasureMapSearch', request, false);
    await command(owner, 'treasureMapOpen', request, false);
    await command(owner, 'treasureMapSearch', { expeditionId: randomUUID() }, false);
    assert.equal(owner.player().treasureMap.stage, 'search');
    await stop(); await start(); owner = await connect(a); member = await connect(b);
    assert.deepEqual(owner.player().treasureMap, expedition, 'search progress survives restart');
    assert.equal(owner.welcome.player.treasureMap.voucher, undefined);
    assert.equal(owner.roster.characters[0].treasureMap.voucher, undefined);
    assert.equal(draws, 0, 'reconnect never rerolls the voucher');
    await move(owner, { x: site.x, z: site.z + 2.5 }); await move(member, { x: site.x + .5, z: site.z + 2.5 });
    await command(owner, 'treasureMapSearch', request);
    const guardianId = `map-${expedition.id}`;
    await until(() => owner.snapshot.enemies.some(e => e.id === guardianId && e.alive), 'guardian spawned');
    await command(owner, 'treasureMapSearch', request, false);
    await command(member, 'treasureMapOpen', request, false);
    const beforeAttack = member.messages.length; member.send({ type: 'attack', targetId: guardianId, ability: 'arrow' });
    await until(() => member.messages.slice(beforeAttack).some(m => m.type === 'event' && m.kind === 'info'), 'unrelated attack rejected');
    assert.equal(owner.snapshot.enemies.find(e => e.id === guardianId).hp, owner.snapshot.enemies.find(e => e.id === guardianId).maxHp);
    owner.socket.terminate();
    await until(() => !member.snapshot.enemies.some(e => e.id === guardianId), 'offline owner guardian removed');
    owner = await connect(a);
    await until(() => owner.snapshot.enemies.some(e => e.id === guardianId && e.alive), 'guardian restored on reconnect');
    await stop(); await start(); owner = await connect(a); member = await connect(b);
    await until(() => owner.snapshot.enemies.some(e => e.id === guardianId && e.alive), 'saved guardian reconstructed once');
    assert.equal(owner.snapshot.enemies.filter(e => e.id === guardianId).length, 1);
    await party(owner, member);
    if (roll === 0) mkdirSync(`${file}.tmp`);
    const corpse = await kill(member, guardianId);
    if (roll === 0) {
      await until(() => owner.messages.some(m => m.type === 'event' && m.text.includes('treasure is waiting')), 'guardian save failure reported');
      assert.equal(owner.player().treasureMap.stage, 'guardian');
      rmSync(`${file}.tmp`, { recursive: true });
    }
    await until(() => owner.player().treasureMap.stage === 'chest', 'owner chest unlocked by party kill');
    assert.equal(saved(a).treasureMap.stage, 'chest'); assert.equal(draws, 0, 'guardian cannot drop maps or roll vouchers');
    assert.equal([owner, member].flatMap(client => client.snapshot.loot.filter(d => d.enemyId === guardianId)).length, 2, 'nearby party has normal personal combat loot');
    assert(!corpse.items.some(item => ['moss-voucher', 'treasure-map'].includes(item.itemId)));
    await move(owner, { x: site.x, z: site.z + 8 }); await command(owner, 'treasureMapOpen', request, false);
    await move(owner, { x: site.x, z: site.z + 2.5 });
    await stop(); await start(); owner = await connect(a);
    assert.equal(owner.player().treasureMap.stage, 'chest');
    assert(!owner.snapshot.enemies.some(e => e.id === guardianId), 'defeated guardian cannot respawn after restart');
    const before = structuredClone(owner.player()), reward = treasureMapReward(expedition.level);
    // A failed disk write keeps the chest and its hidden roll; retry cannot award twice.
    mkdirSync(`${file}.tmp`); await command(owner, 'treasureMapOpen', request, false); rmSync(`${file}.tmp`, { recursive: true });
    assert.equal(owner.player().treasureMap.stage, 'chest'); assert.equal(owner.player().gold, before.gold);
    owner.send({ type: 'treasureMapOpen', ...request }); owner.send({ type: 'treasureMapOpen', ...request });
    await until(() => owner.player().treasureMap === null, 'chest collected once');
    assert.equal(owner.player().gold, before.gold + reward.gold); assert.equal(owner.player().inventory.potion, before.inventory.potion + reward.potions);
    assert.equal(owner.player().carriedItems['moss-voucher'] || 0, roll === 0 ? 1 : 0); assert.equal(draws, 0);
    assert.equal(saved(a).treasureMap, null); await command(owner, 'treasureMapOpen', request, false);
    const after = saved(a); await stop(); await start(); owner = await connect(a);
    assert.equal(owner.player().gold, after.gold); assert.equal(owner.player().treasureMap, null);
    await command(owner, 'treasureMapStart'); const newId = owner.player().treasureMap.id;
    assert.notEqual(newId, expedition.id); await command(owner, 'treasureMapSearch', request, false);
    assert.equal(owner.player().treasureMap.id, newId, 'old expedition cannot advance a newer map'); await stop();
  }
  const dead = account(hero('Dead map reader', undefined, { hp: 0 }));
  await start([dead]); const ghost = await connect(dead);
  await command(ghost, 'treasureMapStart', {}, false);
  assert.equal(ghost.player().treasureMap, null); assert.equal(ghost.player().carriedItems['treasure-map'], 2); assert.equal(draws, 0); await stop();
  const full = Object.fromEntries(Object.keys(LOOT_ITEMS).filter(id => !['treasure-map', 'moss-voucher', 'ancient-coin'].includes(id)).slice(0, 16).map(id => [id, 1]));
  const a = account(hero('Full treasure bags', { x: site.x, z: site.z + 2 }, { carriedItems: full,
    treasureMap: { id: randomUUID(), siteId: site.id, stage: 'chest', level: 60, voucher: true } }));
  await start([a]); const owner = await connect(a);
  await command(owner, 'treasureMapOpen', { expeditionId: a.player.treasureMap.id }, false);
  assert.equal(owner.player().treasureMap.stage, 'chest'); assert.equal(owner.player().gold, 0); assert.equal(draws, 0); await stop();
  for (const value of [{ ...a.player.treasureMap, voucher: 1 }, { ...a.player.treasureMap, stage: 'paid' }, { ...a.player.treasureMap, extra: true }, { ...a.player.treasureMap, siteId: 'forged' }]) {
    assert.equal(treasureMapPlayerValid({ treasureMap: value }), false);
  }
  console.log('PASS: 5% personal map drops; exact requests; durable map consumption; saved search/guardian/chest across restart; owner/party-only guardian; 1% fixed voucher roll; private snapshots; range/stale/duplicate rejection; full bags and failed persistence preserve treasure.');
} finally {
  MONSTERS['moss-slime'].hp = originalSlimeHp; MONSTERS['briar-sentinel'].hp = originalGuardianHp;
  await stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true });
}
