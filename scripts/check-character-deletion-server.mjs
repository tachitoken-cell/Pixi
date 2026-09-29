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
import { CHARACTER_CLASSES } from '../src/shared.ts';
import { starterGear } from '../src/progression.ts';
import { newContracts } from '../src/adventure.ts';
import { AUCTIONEER } from '../src/city.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-character-deletion-')), file = join(dir, 'players.json');
const clients = [], OriginalClient = pg.Client;
let game, port, keycloak, issuer, releaseWrite, failNext = false, holdNext = false, pendingRows;
const { publicKey, privateKey } = await generateKeyPair('RS256'), forgedKey = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'deletion-fixture', use: 'sig', alg: 'RS256' };
const identity = createServer((req, res) => {
  if (req.url !== '/realms/mossvale/protocol/openid-connect/certs') { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
});
const accountKey = sub => createHash('sha256').update(`${issuer}\n${sub}`).digest('hex');
function hero(name, className = 'Ranger', extra = {}) {
  return { id: randomUUID(), name, coordinateVersion: 2, zone: 'greenwood', x: 0, z: 8, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    characterCreated: true, talents: [], ...starterGear(className), level: 25, xp: 13, gold: 77, hp: 388, maxHp: 388,
    inventory: { wood: 10, crystal: 0, herb: 0, potion: 3, relic: 0 }, craftingXp: 0, contracts: newContracts(),
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null }, ...extra };
}
const classes = CHARACTER_CLASSES.map(name => hero(`Delete ${name}`, name));
const fixtures = { owner: classes, foreign: [hero('Other account')], failure: [hero('Write failure')], expiry: [hero('Expired owner')],
  gold: [hero('Gold seller', 'Ranger', { x: AUCTIONEER.x - 1.5, z: AUCTIONEER.z })], eth: [hero('Ether seller')], buyer: [hero('Pending buyer')],
  banned: [hero('Banned owner')] };
function listing(seller, currency) {
  return { id: randomUUID(), sellerId: seller.id, sellerName: seller.name, item: { kind: 'resource', id: 'wood', quantity: 2 },
    currency, price: currency === 'gold' ? '5' : '0.001', createdAt: Date.now(), ...(currency === 'eth' ? { sellerWallet: `0x${'1'.repeat(40)}` } : {}) };
}
const goldListing = listing(fixtures.gold[0], 'gold'), ethListing = listing(fixtures.eth[0], 'eth');
// A signed order remains authoritative after its wall-clock deadline until chain settlement.
const deadline = Math.floor(Date.now() / 1000) - 60, contract = `0x${'3'.repeat(40)}`;
ethListing.reservation = { buyerId: fixtures.buyer[0].id, expiresAt: deadline * 1000, order: {
  listingId: `0x${'4'.repeat(64)}`, buyer: `0x${'2'.repeat(40)}`, seller: ethListing.sellerWallet, priceWei: '1000000000000000', deadline,
  signature: `0x${'5'.repeat(130)}`, orderHash: `0x${'6'.repeat(64)}`, chainId: 46630, contract,
  transaction: { to: contract, data: '0x1234', value: '0x38d7ea4c68000', chainId: '0xb626' },
} };
fixtures.gold[0].auctions = [goldListing]; fixtures.eth[0].auctions = [ethListing];
const ban = { at: Date.now(), by: fixtures.foreign[0].id, reason: 'Isolated existing ban' };
const disabledChain = { status: async () => ({ enabled: false, reason: 'Isolated deletion fixture' }), settlement: async () => ({ state: 'pending' }) };
async function until(fn, label, timeout = 7000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = fn(); if (value) return value; await delay(12); }
  throw Error(`Timed out: ${label}`);
}
async function signed(sub, claims = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, sub, azp: keycloak.clientId, typ: 'Bearer', iat: now, exp: now + 180, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(key);
}
async function start(databaseUrl = '') {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, databaseUrl, keycloak, auctionChain: disabledChain }); port = await game.start();
}
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
async function connect(sub, { enter, claims, key, wait = true, authenticate = true } = {}) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], sub, closed: null };
  clients.push(c); c.send = message => socket.send(JSON.stringify(message));
  socket.on('message', raw => { const m = JSON.parse(raw); if (m.type === 'snapshot') c.snapshot = m; else c.messages.push(m);
    if (['roster', 'welcome'].includes(m.type)) c[m.type] = m; });
  socket.on('close', code => { c.closed = code; }); socket.on('error', () => {});
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  if (authenticate) c.send({ type: 'join', accessToken: await signed(sub, claims, key), ...(enter ? { characterId: enter } : {}) });
  if (wait && authenticate) await until(() => c.roster || c.welcome || c.closed, `connect ${sub}`);
  return c;
}
const command = id => ({ type: 'deleteCharacter', characterId: id, confirmation: 'I confirm' });
async function denied(c, message, pattern) {
  const index = c.messages.length, roster = c.roster;
  c.send(message);
  const info = await until(() => c.messages.slice(index).find(m => m.type === 'event' && m.requestType === 'deleteCharacter'), 'typed deletion rejection');
  assert.equal(info.kind, 'info'); assert.match(info.text, pattern); assert.equal(c.roster, roster, 'rejection cannot replace the roster or imply success');
  return info;
}
async function remove(c, id) {
  const index = c.messages.length; c.send(command(id));
  return until(() => c.messages.slice(index).find(m => m.type === 'roster' && !m.characters.some(p => p.id === id)), 'durable deletion roster');
}
const stored = sub => JSON.parse(readFileSync(file, 'utf8'))[accountKey(sub)];
try {
  await new Promise(resolve => identity.listen(0, '127.0.0.1', resolve));
  keycloak = { url: `http://127.0.0.1:${identity.address().port}`, realm: 'mossvale', clientId: 'mossvale-browser' }; issuer = `${keycloak.url}/realms/mossvale`;
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(fixtures).map(([sub, characters]) => [accountKey(sub), { characters, ...(sub === 'banned' ? { ban } : {}) }]))));
  await start();
  const owner = await connect('owner'), stranger = await connect('foreign', { enter: fixtures.foreign[0].id });
  const unauthenticated = await connect('owner', { authenticate: false });
  await denied(unauthenticated, command(classes[0].id), /Sign in/); unauthenticated.socket.terminate();
  const forged = await connect('owner', { key: forgedKey.privateKey }); assert.equal(forged.closed, 4401, 'forged identity cannot access or remove the roster');
  assert.equal((await connect('banned')).closed, 4409, 'account ban still blocks deletion admission');
  for (const confirmation of ['', 'I Confirm', 'i confirm', 'I confirm ', ' I confirm', 'I confirm\n', null, true]) {
    await denied(owner, { ...command(classes[0].id), confirmation }, /Type I confirm exactly/);
  }
  for (const message of [{ type: 'deleteCharacter', characterId: classes[0].id }, { ...command(classes[0].id), all: true }, command('__proto__'), command(2), command(null)]) {
    await denied(owner, message, /Type I confirm exactly/);
  }
  await denied(owner, command(fixtures.foreign[0].id), /does not belong/);
  await denied(owner, command(randomUUID()), /already been deleted/);
  owner.send({ type: 'selectCharacter', characterId: classes[0].id }); await until(() => owner.welcome, 'active owned character');
  await denied(owner, command(classes[1].id), /character selection/);
  owner.send({ type: 'leaveWorld' }); await until(() => owner.roster.characters.some(p => p.id === classes[0].id) && owner.messages.at(-1)?.type === 'roster', 'return to roster');
  for (const sub of ['gold', 'eth', 'buyer']) {
    const c = await connect(sub); await denied(c, command(fixtures[sub][0].id), sub === 'buyer' ? /pending auction payment/ : /auction listings/);
  }
  assert.deepEqual(stored('eth').characters[0].auctions, [ethListing], 'expired signed payment escrow is untouched');
  const failure = await connect('failure'); mkdirSync(`${file}.tmp`);
  try { await denied(failure, command(fixtures.failure[0].id), /saving failed/); assert.equal(stored('failure').characters[0].id, fixtures.failure[0].id); }
  finally { rmSync(`${file}.tmp`, { recursive: true }); }
  await remove(failure, fixtures.failure[0].id); assert.deepEqual(stored('failure').characters, [], 'explicit retry can delete the final character');
  for (let i = 0; i < classes.length; i++) {
    const roster = await remove(owner, classes[i].id);
    assert.deepEqual(roster.characters.map(p => p.id), classes.slice(i + 1).map(p => p.id));
    assert.deepEqual(stored('owner').characters.map(p => p.id), roster.characters.map(p => p.id), 'acknowledgment follows the durable character projection');
    await denied(owner, command(classes[i].id), /already been deleted/);
  }
  assert.equal(owner.roster.maxCharacters, 6); assert.deepEqual(stored('owner'), { characters: [] }, 'last-character deletion keeps the account');
  assert.deepEqual(stored('banned').ban, ban, 'deletion projection preserves unrelated account metadata');
  assert.equal(stranger.messages.some(m => m.type === 'roster'), false, 'private deletion does not reveal a roster to another account');
  assert.equal(stored('foreign').characters[0].id, fixtures.foreign[0].id);
  const gold = await connect('gold', { enter: fixtures.gold[0].id });
  gold.send({ type: 'auctionCancel', npcId: AUCTIONEER.id, listingId: goldListing.id });
  await until(() => gold.messages.some(m => m.type === 'auction' && m.mine.length === 0), 'actual auction cancellation clears the escrow guard');
  gold.send({ type: 'leaveWorld' }); await until(() => gold.roster, 'seller returns to roster'); await remove(gold, fixtures.gold[0].id);
  const expiry = await connect('expiry', { claims: { exp: Math.floor(Date.now() / 1000) + 1 } });
  await until(() => expiry.closed, 'signed session expiry'); assert.equal(expiry.closed, 4401); assert.equal(stored('expiry').characters.length, 1);
  await stop(); await start();
  const restored = await connect('owner', { enter: classes[0].id }); assert.deepEqual(restored.roster.characters, []); assert.equal(restored.welcome, undefined, 'deleted ID cannot reenter after restart');
  assert.deepEqual((await connect('failure')).roster.characters, []); assert.deepEqual((await connect('gold')).roster.characters, []);
  await denied(await connect('buyer'), command(fixtures.buyer[0].id), /pending auction payment/);
  // The account can create a fresh character after deleting its last one; old progress/UUID are not reused.
  restored.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION });
  await until(() => restored.messages.some(m => m.type === 'community' && m.accepted), 'accepted community rules before recreation');
  restored.send({ type: 'createCharacter', name: classes[0].name, appearance: classes[0].appearance });
  await until(() => restored.roster.characters.length === 1, 'create after empty roster');
  const recreated = restored.roster.characters[0]; assert.notEqual(recreated.id, classes[0].id); assert.equal(recreated.level, 1); assert.equal(recreated.gold, 0);
  await remove(restored, recreated.id); await stop();

  // Real WS + production SQL writer, with only the database acknowledgment controlled.
  const first = hero('Pending deletion'), survivor = hero('Surviving alt', 'Cleric'), failed = hero('Pending failure');
  let databaseRecords = { [accountKey('pending')]: { characters: [first, survivor] }, [accountKey('sqlFailure')]: { characters: [failed] } };
  pg.Client = playerDatabaseFixture(databaseRecords, { beforeWrite: async rows => {
    if (holdNext) { holdNext = false; pendingRows = rows; await new Promise(resolve => { releaseWrite = resolve; }); releaseWrite = undefined; }
    if (failNext) { failNext = false; throw Object.assign(Error('isolated deletion write failure'), { code: '23514' }); }
  } });
  await start('postgres://isolated-character-deletion');
  const pending = await connect('pending'); await delay(1150); holdNext = true;
  const pendingIndex = pending.messages.length; pending.send(command(first.id));
  await until(() => releaseWrite, 'deletion waiting for SQL acknowledgment');
  assert.deepEqual(pendingRows.find(row => row.account_key === accountKey('pending')).state.characters.map(p => p.id), [survivor.id]);
  assert.equal(databaseRecords[accountKey('pending')].characters.length, 2); assert.equal(pending.roster.characters.length, 2);
  await denied(pending, command(survivor.id), /Saving/);
  pending.send({ type: 'createCharacter', name: 'Race character', appearance: first.appearance });
  pending.send({ type: 'selectCharacter', characterId: first.id });
  const reconnect = await connect('pending', { enter: first.id, wait: false }); await delay(150);
  assert.equal(reconnect.roster, undefined); assert.equal(reconnect.welcome, undefined, 'reconnect cannot enter from pre-commit records');
  assert(!pending.messages.slice(pendingIndex).some(m => m.type === 'roster'), 'no deletion success before durable acknowledgment');
  pending.socket.terminate(); releaseWrite();
  await until(() => reconnect.roster, 'reconnect receives committed roster'); assert.deepEqual(reconnect.roster.characters.map(p => p.id), [survivor.id]);
  assert.equal(reconnect.welcome, undefined); assert.equal(databaseRecords[accountKey('pending')].characters[0].gold, survivor.gold);
  await denied(reconnect, command(first.id), /already been deleted/);
  await delay(1150); assert.deepEqual(databaseRecords[accountKey('pending')].characters.map(p => p.id), [survivor.id], 'later autosave cannot resurrect an old session record');
  const sqlFailure = await connect('sqlFailure'); await delay(1150); holdNext = true; failNext = true;
  sqlFailure.send(command(failed.id)); await until(() => releaseWrite, 'held failed deletion');
  const retryConnection = await connect('sqlFailure', { wait: false }); await delay(100); assert.equal(retryConnection.roster, undefined);
  releaseWrite(); await until(() => retryConnection.roster, 'failed deletion reconnect');
  assert.equal(retryConnection.roster.characters[0].id, failed.id); assert.equal(databaseRecords[accountKey('sqlFailure')].characters[0].id, failed.id);
  await remove(retryConnection, failed.id);
  await stop(); await start('postgres://isolated-character-deletion');
  assert.deepEqual((await connect('pending')).roster.characters.map(p => p.id), [survivor.id]);
  assert.deepEqual((await connect('sqlFailure')).roster.characters, []);
  console.log('PASS character deletion: verified owner and exact confirmation, selection-only and all four classes, both auction escrow directions, private durable roster, last-character account/recreation, JSON/SQL rollback, pending reconnect/duplicate/select/create guards, autosave and restart without resurrection.');
} finally {
  releaseWrite?.(); for (const c of clients) c.socket.terminate();
  try { await game?.stop(); } catch {} pg.Client = OriginalClient;
  await new Promise(resolve => identity.close(resolve)); rmSync(dir, { recursive: true, force: true });
}
