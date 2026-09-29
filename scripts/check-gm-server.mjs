import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { WebSocket } from 'ws';
import pg from 'pg';
import { playerDatabaseFixture } from './fixture-player-database.mjs';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { newBags, bagUsage } from '../src/bags.ts';
import { newBank } from '../src/bank.ts';
import { newContracts } from '../src/adventure.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { ROOTVAULT_ENTRANCE } from '../src/dungeon.ts';
import { actorFloor, actorCanStand } from '../src/collision3d.ts';
import { createZeppelinFlight } from '../src/zeppelin.ts';
import { gmActionValid, verifiedGmRole, gmLevelAward } from '../src/gm.ts';
import { INSTANT_COMBAT, instantCombatSchedule } from '../src/instant-combat.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-gm-')), file = join(dir, 'players.json'), clients = [];
const originalMonsters = structuredClone(MONSTERS), realNow = Date.now, OriginalClient = pg.Client;
let game, port, keycloak, issuer, offset = 0, releaseWrite;
Date.now = () => realNow() + offset;
const { publicKey, privateKey } = await generateKeyPair('RS256'), wrongKey = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'gm-fixture', use: 'sig', alg: 'RS256' };
const identity = createServer((req, res) => {
  if (req.url !== '/realms/mossvale/protocol/openid-connect/certs') { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
});
const hash = text => createHash('sha256').update(text).digest('hex');
const accountKey = sub => hash(`${issuer}\n${sub}`);
function hero(name, extra = {}) {
  const level = extra.level ?? 25;
  return { id: randomUUID(), name, coordinateVersion: 2, zone: 'greenwood', x: 0, z: 8, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), level, xp: 0, gold: 10, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, carriedItems: {}, itemUseReadyAt: 0, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
    craftingXp: 0, contracts: newContracts(), quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null }, ...extra };
}
const heroes = { gm: hero('Realm GM'), otherGm: hero('Other GM'), player: hero('Untrusted GM', { role: 'gm', gm: { invisible: true, tagHidden: true, flying: true } }), target: hero('Target', { level: 1, xp: 42, hp: 61, ownedPets: ['moss-fox'], summonedPet: 'moss-fox' }),
  full: hero('Full bags', { level: 60 }), rich: hero('Gold cap', { gold: Number.MAX_SAFE_INTEGER }), victim: hero('Moderated player'), expiry: hero('Short GM'), dead: hero('Fallen', { hp: 0, diedAt: Date.now() }), banked: hero('Banked item', { bank: { ...newBank(), gear: ['ranger-head'] } }),
  remote: hero('Vault visitor', { x: ROOTVAULT_ENTRANCE.x, z: ROOTVAULT_ENTRANCE.z, zone: 'hollow', rootvaultUnlocked: true }) };
while (bagUsage(heroes.full) < 16) {
  const gear = Object.values(GEAR).find(g => (!g.className || g.className === 'Ranger') && g.requiredLevel <= 60 && !heroes.full.ownedGear.includes(g.id));
  assert(gear); heroes.full.ownedGear.push(gear.id);
}
heroes.victimAlt = hero('Moderated alt');
const tokens = new Map();
async function signed(sub, claims = {}, key = privateKey) {
  const now = Math.floor(realNow() / 1000);
  return new SignJWT({ iss: issuer, sub, azp: keycloak.clientId, typ: 'Bearer', iat: now, exp: now + 180, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(key);
}
async function until(fn, label, timeout = 7000) {
  const end = realNow() + timeout;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function start(databaseUrl = '', auth = keycloak) { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, databaseUrl, keycloak: auth }); port = await game.start(); }
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
async function connect(sub, claims, extras = {}, key) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], sub, closed: null, snapshot: null, id: heroes[sub]?.id };
  clients.push(c); c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.id);
  socket.on('message', raw => { const message = JSON.parse(raw); if (message.type === 'snapshot') c.snapshot = message; else c.messages.push(message);
    if (['welcome', 'roster', 'gmNotice'].includes(message.type)) c[message.type] = message; });
  socket.on('close', code => { c.closed = code; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const accessToken = keycloak ? await signed(sub, claims, key) : undefined;
  if (accessToken) tokens.set(sub, accessToken);
  c.send({ type: 'join', accessToken, characterId: c.id, ...extras });
  await until(() => c.player() || c.roster || c.closed, `connect ${sub}`);
  if (!c.closed && !c.messages.some(m => m.type === 'community' && m.accepted)) { c.send({ type: 'acceptCommunityRules', version: 1 }); await until(() => c.messages.some(m => m.type === 'community' && m.accepted), 'accepted community rules'); }
  return c;
}
async function request(c, action, target, fields = {}, success = true) {
  const index = c.messages.length;
  c.send({ type: 'gmAction', action, targetId: target.id, ...fields });
  const result = await until(() => c.messages.slice(index).find(m => m.type === 'gmResult'), `GM ${action}`);
  assert.equal(result.success, success, `${action}: ${result.text}`); await delay(110); return result;
}
async function observe(c, message, expectMove = false) {
  const before = c.snapshot;
  c.send(message); await until(() => c.snapshot !== before && (!expectMove || c.player().x === message.x && c.player().z === message.z && (message.y === undefined || c.player().jump.y === message.y)), message.type); return c.player();
}
const position = p => ({ x: p.x, z: p.z, zone: p.zone, instanceId: p.instanceId });
const stored = sub => JSON.parse(readFileSync(file, 'utf8'))[accountKey(sub)];
const possessions = p => structuredClone({ gold: p.gold, level: p.level, xp: p.xp, hp: p.hp, maxHp: p.maxHp, inventory: p.inventory, ownedGear: p.ownedGear, ownedBags: p.ownedBags, carriedItems: p.carriedItems, ownedPets: p.ownedPets, summonedPet: p.summonedPet, ownedMounts: p.ownedMounts });
try {
  for (const stats of Object.values(MONSTERS)) Object.assign(stats, { aggroRange: 0, speed: 0 });
  await new Promise(resolve => identity.listen(0, '127.0.0.1', resolve));
  keycloak = { url: `http://127.0.0.1:${identity.address().port}`, realm: 'mossvale', clientId: 'mossvale-browser' }; issuer = `${keycloak.url}/realms/mossvale`;
  const records = Object.fromEntries(Object.entries(heroes).filter(([sub]) => sub !== 'victimAlt').map(([sub, p]) => [accountKey(sub), { characters: sub === 'victim' ? [p, heroes.victimAlt] : [p] }]));
  writeFileSync(file, JSON.stringify(records)); await start();
  const gm = await connect('gm', { realm_access: { roles: ['gm'] } }), player = await connect('player', {}, { role: 'gm', isGM: true });
  const target = await connect('target'), full = await connect('full'), rich = await connect('rich'), victim = await connect('victim'), dead = await connect('dead'), banked = await connect('banked');
  const otherGm = await connect('otherGm', { realm_access: { roles: ['gm'] } });
  const remote = await connect('remote'); remote.send({ type: 'dungeonEnter' }); await until(() => remote.player().instanceId, 'remote instance fixture');
  assert.equal(gm.player().role, 'gm'); assert.equal(player.player().role, 'player', 'saved/browser role cannot confer privileges');
  assert.equal(player.snapshot.gmPlayers, undefined, 'normal snapshots omit privileged all-instance roster');
  await until(() => gm.snapshot.gmPlayers?.length === 10, 'GM roster');
  await until(() => !gm.snapshot.players.some(p => p.id === remote.id), 'GM observer receives the dungeon instance transition');
  assert.deepEqual(Object.keys(gm.snapshot.gmPlayers[0]).sort(), ['canReturn', 'className', 'id', 'level', 'name', 'role']);
  assert(!gm.snapshot.players.some(p => p.id === remote.id), 'ordinary world snapshot remains instance isolated');
  assert(gm.snapshot.gmPlayers.some(p => p.id === remote.id), 'GM roster includes a target in another instance');
  await request(gm, 'giveGold', remote, { amount: 9 }); assert.equal(remote.player().gold, 19, 'authorized cross-instance action uses saved return coordinates');
  assert.equal(stored('remote').characters[0].x, ROOTVAULT_ENTRANCE.x);
  assert.equal(player.snapshot.players.find(p => p.id === gm.id).role, 'gm', 'other players see the authenticated badge');
  await request(player, 'giveGold', target, { amount: 1 }, false);
  const beforeForgedPet = possessions(target.player());
  await request(player, 'spawnItem', target, { item: { kind: 'item', id: 'golden-pig', quantity: 1 } }, false);
  assert.deepEqual(possessions(target.player()), beforeForgedPet, 'browser/saved GM claims cannot grant pet items');
  assert.equal(stored('target').characters[0].carriedItems['golden-pig'], undefined);
  const mountItem = { kind: 'mount', id: 'verdant-revenant', quantity: 1 };
  const beforeMountItemGrant = possessions(target.player());
  await request(gm, 'spawnItem', target, { item: { ...mountItem, kind: 'item' } });
  const afterMountItemGrant = { ...beforeMountItemGrant, carriedItems: { ...beforeMountItemGrant.carriedItems, [mountItem.id]: 1 } };
  assert.deepEqual(possessions(target.player()), afterMountItemGrant, 'mount item grants add one carried copy without learning it');
  assert.deepEqual(possessions(stored('target').characters[0]), afterMountItemGrant, 'carried mount grant is durably saved');
  assert.deepEqual(gm.player().ownedMounts, ['horse', 'wolf'], 'legacy riding migration never grants dungeon drops');
  await request(player, 'spawnItem', player, { item: mountItem }, false);
  assert(!player.player().ownedMounts.includes(mountItem.id), 'client claims cannot unlock the dungeon mount');
  await request(gm, 'spawnItem', gm, { item: mountItem });
  assert(stored('gm').characters[0].ownedMounts.includes(mountItem.id), 'self mount grant is durably saved');
  await request(gm, 'spawnItem', target, { item: mountItem });
  assert(target.player().ownedMounts.includes(mountItem.id), 'level-one untrained characters may collect the rare mount');
  assert.equal(target.player().ridingRank, 0, 'grant does not silently teach riding');
  await request(gm, 'spawnItem', target, { item: mountItem }, false);
  assert.equal(target.player().ownedMounts.filter(id => id === mountItem.id).length, 1, 'duplicate grant cannot duplicate ownership');
  for (const item of [{ ...mountItem, quantity: 2 }, { ...mountItem, id: 'invented' }, { ...mountItem, id: 'store-embermane' }, { ...mountItem, extra: true }]) await request(gm, 'spawnItem', target, { item }, false);
  // All mobility and presentation controls authorize the actual signed session, including self-targets.
  assert.equal(player.player().gm, undefined, 'saved or browser GM flags never grant control');
  for (const action of ['teleportTo', 'bring', 'return', 'spawnTreasureGoblin']) await request(player, action, target, {}, false);
  for (const action of ['setInvisible', 'setTagHidden', 'setFlying']) {
    await request(player, action, player, { enabled: true }, false);
    await request(gm, action, target, { enabled: true }, false);
    for (const fields of [{}, { enabled: 1 }, { enabled: 'true' }, { enabled: true, role: 'gm' }]) await request(gm, action, gm, fields, false);
  }
  const normalPosition = position(player.player()), normalY = player.player().jump.y;
  for (const fields of [{ y: normalY + 1 }, { flying: true }, { gm: { flying: true } }, { jump: { y: 50 } }]) {
    await observe(player, { type: 'move', x: normalPosition.x + .25, z: normalPosition.z, rotation: 0, ...fields });
    assert.deepEqual(position(player.player()), normalPosition, 'normal players cannot send GM movement state'); assert(Math.abs(player.player().jump.y-normalY)<.0001);
  }
  await observe(player, { type: 'move', x: normalPosition.x + 100, z: normalPosition.z, rotation: 0 });
  assert.deepEqual(position(player.player()), normalPosition, 'normal movement still rejects teleport distances');
  await observe(target, { type: 'move', x: 0, z: 9, rotation: 0 }, true);
  const targetOrigin = position(target.player()), gmOrigin = position(gm.player()); assert.equal(targetOrigin.z, 9);
  await request(gm, 'teleportTo', target); assert.deepEqual(position(gm.player()), targetOrigin); assert(gm.player().gm.canReturn);
  await request(gm, 'return', gm); assert.deepEqual(position(gm.player()), gmOrigin); assert(!gm.player().gm.canReturn);
  await request(gm, 'return', gm, {}, false);
  await request(gm, 'bring', target); assert.deepEqual(position(target.player()), gmOrigin);
  assert(gm.snapshot.gmPlayers.find(p => p.id === target.id).canReturn); assert.equal(target.player().gm, undefined, 'bringing a player never grants GM flags');
  await request(player, 'return', target, {}, false); assert.deepEqual(position(target.player()), gmOrigin);
  await request(gm, 'return', target); assert.deepEqual(position(target.player()), targetOrigin);
  await request(gm, 'return', target, {}, false);
  const dungeonPosition = position(remote.player());
  await request(gm, 'teleportTo', remote); assert.deepEqual(position(gm.player()), dungeonPosition); assert(Math.abs(gm.player().jump.y-actorFloor('dungeon-rootvault',dungeonPosition.x,dungeonPosition.z,gm.player().jump.y+.03))<.01, JSON.stringify({position:dungeonPosition,jump:gm.player().jump,remote:remote.player().jump,floor:actorFloor('dungeon-rootvault',dungeonPosition.x,dungeonPosition.z,gm.player().jump.y+.05)}));
  await request(gm, 'spawnTreasureGoblin', gm, {}, false);
  assert.equal(gm.player().travel.mount, null);
  await request(gm, 'bring', target); assert.deepEqual(position(target.player()), dungeonPosition); assert.equal(target.player().gm, undefined);
  await request(gm, 'return', gm); assert.deepEqual(position(gm.player()), gmOrigin);
  await request(gm, 'bring', remote); assert.deepEqual(position(remote.player()), gmOrigin);
  await request(gm, 'return', remote); assert.deepEqual(position(remote.player()), dungeonPosition, 'return restores a dungeon that still has another member');
  await request(gm, 'return', target); assert.deepEqual(position(target.player()), targetOrigin);
  await request(gm, 'bring', remote); assert.deepEqual(position(remote.player()), gmOrigin);
  await request(gm, 'return', remote);
  assert.deepEqual(position(remote.player()), { x: ROOTVAULT_ENTRANCE.x, z: ROOTVAULT_ENTRANCE.z, zone: 'hollow', instanceId: null }, 'a destroyed empty dungeon returns safely to the saved entrance');
  await until(() => stored('remote').characters[0].x === ROOTVAULT_ENTRANCE.x, 'returned coordinates reach the debounced save');
  assert.equal(stored('remote').characters[0].x, ROOTVAULT_ENTRANCE.x, 'temporary dungeon coordinates never persist');
  await request(gm, 'setFlying', gm, { enabled: true }); assert(gm.player().gm.flying);
  assert.equal(target.snapshot.players.find(p => p.id === gm.id).gm, undefined, 'GM controls remain owner-only');
  await observe(gm, { type: 'mount', mount: 'horse' }); assert.equal(gm.player().casting, null, 'flight cannot start a mount cast');
  const liveEnemy = gm.snapshot.enemies.find(e => e.alive && e.hp > 0); assert(liveEnemy);
  await observe(gm, { type: 'autoAttack', targetId: liveEnemy.id }); assert.equal(gm.player().autoAttack, null, 'flight cannot start combat');
  const flightStart = gm.player().jump.y;
  await observe(gm, { type: 'move', x: gmOrigin.x, z: gmOrigin.z, y: flightStart + 1, rotation: 0 }, true);
  assert.equal(gm.player().jump.y, flightStart + 1, 'authorized flight moves vertically'); assert.equal(gm.player().jump.grounded, false);
  await delay(250); assert.equal(gm.player().jump.y, flightStart + 1, 'flight suspends gravity');
  assert.equal(target.snapshot.players.find(p => p.id === gm.id).jump.y, flightStart + 1, 'observers receive authoritative altitude');
  await observe(gm, { type: 'move', x: gmOrigin.x + .5, z: gmOrigin.z + .5, y: flightStart + 1.5, rotation: .3 }, true);
  assert.deepEqual(position(gm.player()), { ...gmOrigin, x: gmOrigin.x + .5, z: gmOrigin.z + .5 }); assert.equal(gm.player().jump.y, flightStart + 1.5, 'authorized flight moves on all three axes');
  for (const enabled of [true, false]) {
    await request(gm, 'setInvisible', gm, { enabled }); assert.equal(gm.player().jump.y, flightStart + 1.5, 'visibility changes preserve airborne height'); assert(gm.player().gm.flying);
  }
  await observe(gm, { type: 'move', x: gmOrigin.x, z: gmOrigin.z, y: flightStart + 1, rotation: 0 }, true);
  assert.deepEqual(position(gm.player()), gmOrigin); assert.equal(gm.player().jump.y, flightStart + 1);
  for (const fields of [{ y: flightStart + 79 }, { y: flightStart + 81 }, { y: flightStart - 1 }, { y: '2' }, { y: flightStart + 1, x: 1e6 }]) {
    await observe(gm, { type: 'move', x: gmOrigin.x, z: gmOrigin.z, y: flightStart + 1, rotation: 0, ...fields });
    assert.deepEqual(position(gm.player()), gmOrigin); assert.equal(gm.player().jump.y, flightStart + 1, 'invalid flight movement cannot alter authoritative position');
  }
  await request(gm, 'setFlying', gm, { enabled: false }); assert(!gm.player().gm.flying);
  await until(() => gm.player().jump.grounded, 'flight disabled lands'); await delay(250); assert(Math.abs(gm.player().jump.y-actorFloor('overworld',gmOrigin.x,gmOrigin.z,gm.player().jump.y+.03))<.01, JSON.stringify({gmOrigin,jump:gm.player().jump,floor03:actorFloor('overworld',gmOrigin.x,gmOrigin.z,gm.player().jump.y+.03),floor05:actorFloor('overworld',gmOrigin.x,gmOrigin.z,gm.player().jump.y+.05)})); assert(actorCanStand('overworld',gmOrigin.x,gm.player().jump.y,gmOrigin.z));
  await observe(gm, { type: 'move', x: gmOrigin.x, z: gmOrigin.z, y: flightStart + 1, rotation: 0 });
  assert(Math.abs(gm.player().jump.y-flightStart)<.0001, 'GM role alone does not accept vertical coordinates with flight off');
  const staleFlightMessages = gm.messages.length;
  for (let i = 0; i < 14; i++) gm.send({ type: 'move', x: gmOrigin.x + 1, z: gmOrigin.z, y: flightStart + 1, rotation: 0 });
  await until(() => gm.closed || gm.messages.slice(staleFlightMessages).filter(m => m.type === 'correction').length === 14, 'late flight packets corrected');
  assert.equal(gm.closed, null, 'queued flight packets after flight-off cannot kick a verified GM');
  assert(gm.messages.slice(staleFlightMessages).filter(m => m.type === 'correction').every(m => m.reason === 'GM flight is disabled.'), 'late packets use ordinary correction rather than cheating strikes');
  assert.deepEqual(position(gm.player()), gmOrigin); assert(Math.abs(gm.player().jump.y-flightStart)<.0001, 'queued flight packets cannot restore flight or displace the GM');
  gm.send({ type: 'partyInvite', targetId: target.id });
  const invite = await until(() => target.snapshot.partyInvites.find(i => i.inviterId === gm.id), 'visibility party fixture');
  target.send({ type: 'partyAccept', invitationId: invite.id }); await until(() => target.snapshot.party?.members.length === 2, 'visibility party accepted');
  await request(gm, 'setInvisible', gm, { enabled: true }); assert(gm.player().gm.invisible);
  await observe(gm, { type: 'autoAttack', targetId: liveEnemy.id }); assert.equal(gm.player().autoAttack, null, 'invisible observation cannot start combat');
  await until(() => !target.snapshot.players.some(p => p.id === gm.id), 'invisible GM removed from ordinary snapshots and inspect source');
  assert(!target.snapshot.party?.members.some(p => p.id === gm.id), 'ordinary party data cannot reveal an invisible GM');
  assert.notEqual(target.snapshot.party?.leaderId, gm.id, 'party leadership cannot reveal an invisible GM');
  const invisibleMessages = gm.messages.length;
  await observe(player, { type: 'whisper', targetId: gm.id, text: 'Invisible lookup fixture' });
  await observe(player, { type: 'tradeRequest', targetId: gm.id });
  assert(!gm.messages.slice(invisibleMessages).some(m => m.type === 'whisper' || m.type === 'trade' && m.trade), 'known IDs cannot target an invisible GM through social actions');
  assert.equal(target.snapshot.gmPlayers, undefined); assert(otherGm.snapshot.gmPlayers.some(p => p.id === gm.id));
  await request(gm, 'setInvisible', gm, { enabled: false }); await until(() => target.snapshot.players.some(p => p.id === gm.id), 'GM visible again');
  await request(gm, 'setTagHidden', gm, { enabled: true });
  assert.equal(gm.player().role, 'gm', 'hiding the tag preserves owner authority'); assert(gm.player().gm.tagHidden);
  assert.equal(target.snapshot.players.find(p => p.id === gm.id).role, 'player', 'hidden GM tag is absent from public player data');
  gm.send({ type: 'chat', text: 'Hidden tag fixture' });
  const hiddenChat = await until(() => target.messages.find(m => m.kind === 'chat' && m.text.endsWith('Hidden tag fixture')), 'hidden chat'); assert.equal(hiddenChat.role, 'player');
  await delay(800); gm.send({ type: 'whisper', targetId: target.id, text: 'Hidden whisper fixture' });
  const hiddenWhisper = await until(() => target.messages.find(m => m.type === 'whisper' && m.text === 'Hidden whisper fixture'), 'hidden whisper'); assert.equal(hiddenWhisper.from.role, 'player');
  await request(gm, 'setTagHidden', gm, { enabled: false }); assert.equal(target.snapshot.players.find(p => p.id === gm.id).role, 'gm');
  target.send({ type: 'partyLeave' }); gm.send({ type: 'partyLeave' });
  for (const claims of [{ realm_access: { roles: ['GM'] } }, { realm_access: { roles: 'gm' } }, { role: 'gm' }, { resource_access: { [keycloak.clientId]: { roles: ['gm'] } } }]) {
    const normal = await connect('player', claims); assert.equal(normal.player().role, 'player'); await request(normal, 'kill', target, {}, false);
  }
  const forged = await connect('player', { realm_access: { roles: ['gm'] } }, {}, wrongKey.privateKey); assert.equal(forged.closed, 4401);
  for (const [action, fields] of [['giveGold', {}], ['giveGold', { amount: 0 }], ['giveGold', { amount: 1.5 }], ['giveGold', { amount: 1_000_000_001 }], ['giveGold', { amount: 1, role: 'gm' }],
    ['levelUp', { amount: 60 }], ['ban', {}], ['kick', { reason: '' }], ['ban', { reason: '<unsafe>' }], ['kill', { amount: 1 }], ['spawnItem', { item: { kind: 'resource', id: 'wood', quantity: 1_000_001 } }],
    ['spawnItem', { item: { kind: 'gear', id: '__proto__', quantity: 1 } }], ['spawnItem', { item: { kind: 'bag', id: 'linen-pouch', quantity: 2 } }],
    ['spawnItem', { item: { kind: 'item', id: 'invented-pet', quantity: 1 } }],
    ['teleportTo', { x: 123 }], ['bring', { enabled: true }], ['return', { instanceId: 'forged-instance' }], ['constructor', {}]]) {
    await request(gm, action, target, fields, false);
  }
  await request(gm, 'kill', { id: randomUUID() }, {}, false);
  await request(gm, 'ban', gm, { reason: 'Self protection' }, false);
  await request(gm, 'ban', otherGm, { reason: 'GM protection' }, false);
  await request(gm, 'kill', otherGm); await request(otherGm, 'spawnTreasureGoblin', otherGm, {}, false);
  await request(gm, 'giveGold', rich, { amount: 1 }, false);
  await request(gm, 'spawnItem', full, { item: { kind: 'resource', id: 'wood', quantity: 1 } }, false);
  await request(gm, 'spawnItem', target, { item: { kind: 'gear', id: 'knight-head', quantity: 1 } }, false);
  await request(gm, 'spawnItem', banked, { item: { kind: 'gear', id: 'ranger-head', quantity: 1 } }, false);
  await request(gm, 'spawnItem', target, { item: { kind: 'bag', id: 'runewoven-holdall', quantity: 1 } }, false);
  // Selection is not an action, and success is published only after durable saving.
  assert.equal(target.player().gold, 10); assert.equal(target.player().level, 1);
  await request(gm, 'levelUp', target, { amount: 1 }); assert.equal(target.player().level, 2); assert.equal(target.player().xp, 42); assert.equal(target.player().hp, 112);
  assert.equal(stored('target').characters[0].level, 2); assert.deepEqual(target.player().learnedSpells, ['arrow'], 'GM levels preserve trainer-only learning');
  await request(gm, 'giveGold', target, { amount: 37 }); assert.equal(target.player().gold, 47); assert.equal(stored('target').characters[0].gold, 47);
  for (const item of [{ kind: 'resource', id: 'wood', quantity: 5 }, { kind: 'item', id: 'slime-residue', quantity: 3 }, { kind: 'bag', id: 'linen-pouch', quantity: 1 }]) await request(gm, 'spawnItem', target, { item });
  await request(gm, 'spawnItem', target, { item: { kind: 'item', id: 'golden-pig', quantity: 2 } });
  assert.equal(target.player().carriedItems['golden-pig'], 2); assert.equal(stored('target').characters[0].carriedItems['golden-pig'], 2);
  assert.deepEqual(target.player().ownedPets, ['moss-fox']); assert.equal(target.player().summonedPet, 'moss-fox', 'granting pet items preserves the learned collection and active companion');
  target.send({ type: 'learnPet', pet: 'golden-pig' }); await until(() => target.player().ownedPets.includes('golden-pig'), 'GM-granted pet learned normally');
  assert.equal(target.player().carriedItems['golden-pig'], 1, 'learning consumes only one granted copy and keeps the other tradable');
  assert.equal(target.player().summonedPet, 'moss-fox'); assert.deepEqual(stored('target').characters[0].ownedPets, ['moss-fox', 'golden-pig']);
  await request(gm, 'spawnItem', full, { item: { kind: 'resource', id: 'potion', quantity: 2 } }); assert.equal(full.player().inventory.potion, 5, 'full bags allow existing-stack grants');
  await request(gm, 'levelUp', target, { amount: 59 }); assert.equal(target.player().level, 60); assert.equal(target.player().xp, 0); assert.equal(stored('target').characters[0].xp, 0); assert.equal(target.player().maxHp, 808);
  await request(gm, 'levelUp', target, { amount: 1 }, false);
  await request(gm, 'spawnItem', target, { item: { kind: 'gear', id: 'ranger-head', quantity: 1 } });
  await request(gm, 'spawnItem', target, { item: { kind: 'gear', id: 'ranger-head', quantity: 1 } }, false);
  const grantedBag = target.player().ownedBags[0]; assert.match(grantedBag.id, /^[\da-f-]{36}$/); assert.equal(grantedBag.kind, 'linen-pouch');
  target.send({ type: 'tradeRequest', targetId: banked.id });
  await until(() => target.messages.some(m => m.type === 'trade' && m.trade), 'open player trade');
  await request(gm, 'giveGold', target, { amount: 1 });
  assert.equal(target.messages.filter(m => m.type === 'trade').at(-1).trade, null, 'GM balance mutation closes the existing trade');
  assert.equal(banked.messages.filter(m => m.type === 'trade').at(-1).trade, null);
  await request(gm, 'levelUp', dead, { amount: 1 }); assert.equal(dead.player().hp, 0, 'level grant cannot resurrect');
  // Every persistent operation rolls back on a failed writer; ban cannot disconnect early.
  for (const [action, fields, receiver] of [['giveGold', { amount: 1 }, target], ['spawnItem', { item: { kind: 'resource', id: 'wood', quantity: 1 } }, target],
    ['spawnItem', { item: { kind: 'item', id: 'golden-pig', quantity: 1 } }, target],
    ['spawnItem', { item: mountItem }, victim],
    ['levelUp', { amount: 1 }, victim], ['kill', {}, victim], ['ban', { reason: 'Failed ban fixture' }, victim]]) {
    const before = possessions(receiver.player()), savedBefore = possessions(stored(receiver.sub).characters.find(p => p.id === receiver.id)); mkdirSync(`${file}.tmp`);
    try { await request(gm, action, receiver, fields, false); assert.deepEqual(possessions(receiver.player()), before); assert.deepEqual(possessions(stored(receiver.sub).characters.find(p => p.id === receiver.id)), savedBefore); assert.equal(victim.closed, null); assert.equal(stored('victim').ban, undefined); }
    finally { rmSync(`${file}.tmp`, { recursive: true }); }
  }
  // Public and private chat badges both derive from the verified sender.
  gm.send({ type: 'chat', text: 'GM chat fixture' }); await until(() => target.messages.some(m => m.kind === 'chat' && m.text.endsWith('GM chat fixture')), 'GM chat');
  assert.equal(target.messages.find(m => m.kind === 'chat' && m.text.endsWith('GM chat fixture')).role, 'gm');
  await delay(800); gm.send({ type: 'whisper', targetId: target.id, text: 'GM whisper fixture' });
  const whisper = await until(() => target.messages.find(m => m.type === 'whisper' && m.text === 'GM whisper fixture'), 'GM whisper'); assert.equal(whisper.from.role, 'gm'); assert.equal(whisper.to.role, 'player');
  for (const action of ['setInvisible', 'setTagHidden', 'setFlying']) await request(gm, action, gm, { enabled: true });
  await request(gm, 'teleportTo', target);
  const normalGmAccount = await connect('gm'); assert.equal(normalGmAccount.player().role, 'player'); assert.equal(normalGmAccount.player().gm, undefined);
  await until(() => gm.closed === 4001, 'superseded GM socket closes');
  await request(normalGmAccount, 'kill', target, {}, false); await request(normalGmAccount, 'setFlying', normalGmAccount, { enabled: true }, false);
  await request(normalGmAccount, 'spawnTreasureGoblin', normalGmAccount, {}, false);
  assert(normalGmAccount.player().jump.grounded, 'reconnection never inherits privileged flight');
  const liveGm = await connect('gm', { realm_access: { roles: ['gm'] } });
  for (const action of ['setInvisible', 'setTagHidden', 'setFlying']) await request(liveGm, action, liveGm, { enabled: true });
  liveGm.send({ type: 'leaveWorld' }); await until(() => liveGm.roster, 'GM roster role'); assert.equal(liveGm.roster.characters[0].role, 'gm');
  const selectionSnapshot = liveGm.snapshot;
  liveGm.send({ type: 'selectCharacter', characterId: liveGm.id }); await until(() => liveGm.snapshot !== selectionSnapshot && liveGm.player()?.role === 'gm', 'GM selection retains verified role');
  assert.deepEqual(liveGm.player().gm, { invisible: false, tagHidden: false, flying: false, canReturn: false }, 'world re-entry resets session-only GM controls');
  victim.send({ type: 'mount', mount: 'horse' }); await until(() => victim.player().casting?.ability === 'mount', 'kill interrupts real mount cast');
  await request(liveGm, 'kill', victim); assert.equal(victim.player().hp, 0); assert.equal(victim.player().casting, null); assert.equal(victim.player().autoAttack, null); assert.equal(victim.player().gathering, null); assert.equal(victim.player().travel.mount, null);
  assert(victim.player().diedAt > 0); assert.equal(stored('victim').characters[0].hp, 0);
  await request(liveGm, 'kick', victim, { reason: 'Kick fixture' }); await until(() => victim.closed, 'kick closes'); assert.equal(victim.closed, 4408); assert.equal(victim.gmNotice.text, 'Kick fixture');
  const returnedVictim = await connect('victim'); assert(returnedVictim.player(), 'kick is not a persisted ban');
  await request(liveGm, 'ban', returnedVictim, { reason: 'Ban fixture' }); assert.equal(returnedVictim.closed, 4409); assert.equal(returnedVictim.gmNotice.text, 'Ban fixture');
  assert.equal(stored('victim').ban.reason, 'Ban fixture'); assert.equal(stored('victim').ban.by, liveGm.id);
  const bannedAlt = await connect('victim', {}, { characterId: heroes.victimAlt.id }); assert.equal(bannedAlt.closed, 4409); assert.equal(bannedAlt.welcome, undefined);
  const expiry = await connect('expiry', { realm_access: { roles: ['gm'] }, exp: Math.floor(realNow() / 1000) + 2 }); assert.equal(expiry.player().role, 'gm');
  await request(expiry, 'setFlying', expiry, { enabled: true });
  offset += 2500; expiry.send({ type: 'gmAction', action: 'bring', targetId: target.id });
  const beforeExpiredAction = position(target.player());
  await until(() => expiry.closed === 4401, 'GM role expires with access token'); assert.deepEqual(position(target.player()), beforeExpiredAction, 'expired GM action never moves a player'); offset = 0;
  const final = possessions(target.player()); await stop();
  const persisted = readFileSync(file, 'utf8'); assert(!persisted.includes('"role"'), 'roles never persist'); assert(!persisted.includes('"gm"'), 'GM controls never persist'); for (const token of tokens.values()) assert(!persisted.includes(token));
  await start(); const restored = await connect('target'); assert.deepEqual(possessions(restored.player()), final); assert.equal((await connect('victim')).closed, 4409, 'ban survives restart and fresh signed token'); await stop();

  // Guest mode has no way to gain GM, even with a real signed GM token/browser flags.
  await start('', null); const guest = await connect('guest', { realm_access: { roles: ['gm'] } }, { role: 'gm' });
  guest.send({ type: 'createCharacter', name: 'Guest Ranger', appearance: heroes.gm.appearance, role: 'gm' }); await until(() => guest.roster.characters.length, 'guest created'); guest.id = guest.roster.characters[0].id;
  guest.send({ type: 'selectCharacter', characterId: guest.id }); await until(() => guest.player(), 'guest entered'); assert.equal(guest.player().role, 'player');
  await request(guest, 'giveGold', guest, { amount: 1 }, false);
  for (const action of ['teleportTo', 'bring', 'return', 'setInvisible', 'setTagHidden', 'setFlying', 'spawnTreasureGoblin', 'startInstantCombat']) await request(guest, action, guest, action.startsWith('set') ? { enabled: true } : {}, false);
  await stop();

  // A signed GM can open voluntary event signup; it never changes the regular even-UTC cadence.
  heroes.eventGm=hero('Event GM');heroes.eventMember=hero('Event volunteer');heroes.eventUntrusted=hero('Event observer');
  writeFileSync(file,JSON.stringify(Object.fromEntries(['eventGm','eventMember','eventUntrusted'].map(sub=>[accountKey(sub),{characters:[heroes[sub]]}]))));
  offset=Math.floor(realNow()/INSTANT_COMBAT.intervalMs)*INSTANT_COMBAT.intervalMs+30*60000-realNow();
  await start();
  const longSession={exp:Math.floor(realNow()/1000)+86400};
  const eventGm=await connect('eventGm',{...longSession,realm_access:{roles:['gm']}});
  const volunteer=await connect('eventMember',longSession),observer=await connect('eventUntrusted',longSession,{role:'gm'});
  const scheduled=instantCombatSchedule(Date.now()).startsAt;
  await request(observer,'startInstantCombat',observer,{},false);
  await request(eventGm,'startInstantCombat',volunteer,{},false);
  await request(eventGm,'startInstantCombat',eventGm,{enabled:true},false);
  assert.equal(eventGm.snapshot.instantCombat.startsAt,scheduled,'denied commands cannot alter the schedule');
  const beforeSignup=Date.now();await request(eventGm,'startInstantCombat',eventGm);
  await until(()=>[eventGm,volunteer,observer].every(client=>client.snapshot.instantCombat.registrationOpen),'GM realm signup is public');
  const manualStart=eventGm.snapshot.instantCombat.startsAt;
  assert(manualStart>=beforeSignup+INSTANT_COMBAT.registrationMs&&manualStart<=Date.now()+INSTANT_COMBAT.registrationMs);
  assert([eventGm,volunteer,observer].every(client=>!client.player().instanceId&&!client.snapshot.instantCombat.registered),'GM event announcement never registers or teleports anyone');
  await request(eventGm,'startInstantCombat',eventGm,{},false);
  assert.equal(eventGm.snapshot.instantCombat.startsAt,manualStart,'duplicate start cannot extend signup');
  volunteer.send({type:'instantCombatRegister'});await until(()=>volunteer.snapshot.instantCombat.registered,'voluntary GM-event signup');
  offset+=manualStart-Date.now();
  await until(()=>volunteer.snapshot.instantCombat.run?.phase==='preparing','GM event uses normal preparation');
  const preparationEnds=volunteer.snapshot.instantCombat.run.phaseEndsAt;
  assert(preparationEnds>=manualStart+90000&&preparationEnds<manualStart+90500);
  assert.equal(volunteer.snapshot.instantCombat.startsAt,scheduled);
  assert(!eventGm.player().instanceId&&!observer.player().instanceId,'declining and ignoring the notice keep players in the world');
  await request(eventGm,'startInstantCombat',eventGm,{},false);
  volunteer.send({type:'instantCombatLeave'});await until(()=>!volunteer.player().instanceId,'volunteer returns normally');
  offset+=scheduled-INSTANT_COMBAT.registrationMs-Date.now();
  await until(()=>eventGm.snapshot.instantCombat.registrationOpen&&eventGm.snapshot.instantCombat.startsAt===scheduled,'normal scheduled signup remains unchanged');
  assert.equal(eventGm.messages.filter(message=>message.type==='event'&&message.text.includes('Instant Combat begins in 5 minutes')).length,2);
  await request(eventGm,'startInstantCombat',eventGm,{},false);
  offset+=scheduled-Date.now();await until(()=>eventGm.snapshot.instantCombat.startsAt===scheduled+INSTANT_COMBAT.intervalMs,'next event remains exactly two hours later');
  await stop();offset=0;

  heroes.pilot = hero('Flying GM', { zeppelin: createZeppelinFlight('greenwood', 'hollow', Date.now()) });
  writeFileSync(file, JSON.stringify({ [accountKey('pilot')]: { characters: [heroes.pilot] } }));
  await start(); const pilot = await connect('pilot', { realm_access: { roles: ['gm'] } }); assert(pilot.player().zeppelin);
  assert.match((await request(pilot, 'spawnTreasureGoblin', pilot, {}, false)).text, /zeppelin/); await stop();

  // Hold the real server's database acknowledgment to expose target-lock and death timing races.
  const dbGm = hero('Database GM'), dbTarget = hero('Database target'); heroes.dbGm = dbGm; heroes.dbTarget = dbTarget;
  let databaseRecords = { [accountKey('dbGm')]: { characters: [dbGm] }, [accountKey('dbTarget')]: { characters: [dbTarget] } }, hold = false, staged;
  pg.Client = playerDatabaseFixture(databaseRecords, { beforeWrite: async changed => {
    if (hold) { hold = false; staged = changed; await new Promise(resolve => { releaseWrite = resolve; }); releaseWrite = undefined; }
  } });
  await start('postgres://isolated-gm-fixture'); const admin = await connect('dbGm', { realm_access: { roles: ['gm'] } }), subject = await connect('dbTarget');
  await delay(1200); hold = true; let at = admin.messages.length;
  admin.send({ type: 'gmAction', action: 'giveGold', targetId: subject.id, amount: 7 }); await until(() => releaseWrite, 'GM grant holds target writer');
  assert.equal(subject.player().gold, 10); assert(!admin.messages.slice(at).some(m => m.type === 'gmResult' && m.success));
  assert.match((await request(admin, 'startLootTrace', subject, {}, false)).text, /pending save/, 'A trace cannot start or replace a report while old rewards are still saving.');
  await request(admin, 'giveGold', subject, { amount: 3 }, false); subject.send({ type: 'selectCharacter', characterId: subject.id });
  await until(() => subject.messages.some(m => m.requestType === 'selectCharacter'), 'target selection locked');
  releaseWrite(); await until(() => subject.player().gold === 17, 'exact committed grant');
  assert.equal(databaseRecords[accountKey('dbTarget')].characters[0].gold, 17);
  await request(admin, 'startLootTrace', subject);
  hold = true; at = admin.messages.length; admin.send({ type: 'gmAction', action: 'kill', targetId: subject.id }); await until(() => releaseWrite, 'kill write held');
  assert.equal(staged.find(row => row.account_key === accountKey('dbTarget')).state.characters[0].hp, 0); assert(subject.player().hp > 0, 'no speculative death before persistence');
  offset += 2000; const acknowledgedAt = Date.now(); releaseWrite(); await until(() => subject.player().hp === 0, 'kill acknowledged');
  assert(subject.player().diedAt >= acknowledgedAt, 'death animation begins at acknowledged impact'); offset = 0;
  hold = true; admin.send({ type: 'gmAction', action: 'ban', targetId: subject.id, reason: 'Pending ban fixture' });
  await until(() => releaseWrite, 'ban acknowledgment held'); assert.equal(subject.closed, null); assert.equal(databaseRecords[accountKey('dbTarget')].ban, undefined);
  const rejoining = connect('dbTarget'); await delay(80); releaseWrite();
  assert.equal((await rejoining).closed, 4409, 'a new verified connection waiting on the same ban transaction cannot enter');
  await until(() => subject.closed === 4409, 'original banned connection closes'); assert.equal(databaseRecords[accountKey('dbTarget')].ban.reason, 'Pending ban fixture');
  await stop();
  assert.equal(gmLevelAward({ level: 59 }, 59), 5900); assert.equal(verifiedGmRole({ realm_access: { roles: 'gm' } }), 'player');
  assert(!gmActionValid({ type: 'gmAction', action: 'kill', targetId: heroes.gm.id, reason: 'extra' }));
  console.log('PASS GM server: signed realm-role authorization; guest/forged/saved/client-role denial; mount self-grant, strict authorization, duplicates, untrained ownership, rollback/restart; pet item grants, normal learning, bag limits, rollback and restart persistence; teleport/bring/one-use return and destroyed-dungeon safety; private visibility/tag controls; authorized bounded flight and unauthorized movement denial; session/token reset; all existing grants/moderation, durable rollback, writer locks, and account bans.');
} finally {
  releaseWrite?.(); rmSync(`${file}.tmp`, { recursive: true, force: true }); await stop();
  Date.now = realNow; pg.Client = OriginalClient; for (const [kind, stats] of Object.entries(originalMonsters)) Object.assign(MONSTERS[kind], stats);
  await new Promise(resolve => identity.close(resolve)); rmSync(dir, { recursive: true, force: true });
}
