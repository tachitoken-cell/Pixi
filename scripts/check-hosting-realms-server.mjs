import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { createHostingConfig, hostingOrigin, parseHostingConfig } from '../src/hosting-realms.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-hosting-realms-'));
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const clients = [], games = [];
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'realm-check', use: 'sig', alg: 'RS256' };
const identityServer = createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] })));
const disabledChain = { status: async () => ({ enabled: false, reason: 'Local realm check.' }) };
let keycloak, issuer;
const options = () => ({ port: 0, host: '127.0.0.1', dataDir, keycloak, databaseUrl: '', walletOidc: { env: {} }, auctionChain: disabledChain, mossAuctionChain: disabledChain,
  realmEuOrigin: 'https://eu.example', realmUsOrigin: 'https://us.example', realmAsiaOrigin: 'https://asia.example', gameAllowedOrigins: 'https://game.example' });
async function start(realmId, extra = {}) {
  const game = createGameServer({ ...options(), realmId, ...extra }); games.push(game);
  const port = await game.start(); return { game, port, origin: `http://127.0.0.1:${port}` };
}
async function until(predicate, label) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) { const result = predicate(); if (result) return result; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function token(sub = 'traveler', overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, sub, azp: keycloak.clientId, typ: 'Bearer', iat: now, exp: now + 120, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(privateKey);
}
async function connect(server, message, origin = 'https://game.example') {
  const socket = new WebSocket(`${server.origin.replace('http:', 'ws:')}/socket`, { origin });
  const client = { socket, messages: [], roster: null, welcome: null, snapshot: null, closed: null };
  clients.push(client);
  socket.on('message', raw => { const msg = JSON.parse(raw); client.messages.push(msg); if (['roster', 'welcome', 'snapshot'].includes(msg.type)) client[msg.type] = msg; });
  socket.on('close', code => { client.closed = code; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send = msg => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(msg));
  client.send({ type: 'join', ...message });
  await until(() => client.roster || client.closed, 'join reply');
  if (client.roster && !client.messages.some(message => message.type === 'community' && message.accepted)) {
    client.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION });
    await until(() => client.messages.some(message => message.type === 'community' && message.accepted), 'community rules accepted');
  }
  return client;
}
const roster = (server, accessToken, extra = {}) => fetch(`${server.origin}/api/roster`, { headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...extra } });

// This fast check covers destination config, browser boundaries and legacy
// JSON development saves. check-shared-realms-server.mjs exercises canonical
// PostgreSQL ownership, shared progression and the global auction house.

try {
  assert.equal(hostingOrigin('https://US.example/'), 'https://us.example');
  assert.equal(hostingOrigin('http://localhost:2567'), 'http://localhost:2567');
  for (const origin of ['http://us.example', 'https://user:secret@us.example', 'https://us.example/path', 'https://us.example/a/..', 'https://us.example?a=1', 'https://us.example?', 'https://us.example#fragment', 'https://us.example#', '//us.example']) assert.throws(() => hostingOrigin(origin));
  assert.throws(() => createHostingConfig('unknown'));
  for (const realmId of ['us', 'asia']) {
    assert.throws(() => createGameServer({ ...options(), realmId, host: '0.0.0.0', keycloak: null }), /requires Keycloak/);
    assert.throws(() => createGameServer({ ...options(), realmId, host: '0.0.0.0', keycloak: { url: 'https://identity.example', realm: 'mossvale', clientId: 'mossvale-browser' } }), /canonical PostgreSQL DATABASE_URL/);
  }
  assert.throws(() => createGameServer({ ...options(), realmId: 'eu', realmUsOrigin: '', host: '0.0.0.0', keycloak: null }), /canonical PostgreSQL DATABASE_URL/, 'an advertised Asia destination also requires shared storage');
  assert.throws(() => createHostingConfig('eu', 'https://same.example', 'https://same.example/'));
  assert.throws(() => createHostingConfig('eu', 'https://same.example', '', 'https://same.example/'));
  assert.throws(() => createHostingConfig('asia', '', 'https://same.example', 'https://same.example/'));
  assert.deepEqual(parseHostingConfig({ keycloak: null }), createHostingConfig());
  assert.equal(createHostingConfig().realms[1].origin, null, 'unconfigured US is unavailable');
  assert.equal(createHostingConfig().realms[2].origin, null, 'unconfigured Asia is unavailable');
  const oldConfig = createHostingConfig('us', 'https://eu.example', 'https://us.example');
  assert.deepEqual(parseHostingConfig({ ...oldConfig, realms: oldConfig.realms.slice(0, 2) }), oldConfig, 'legacy EU/US config adds unavailable Asia');
  assert.throws(() => parseHostingConfig({ realmId: 'eu' }));
  assert.throws(() => parseHostingConfig({ realmId: 'eu', realms: [{ id: 'eu', name: 'Europe', origin: '' }, { id: 'us', name: 'North America', origin: '' }] }));
  assert.throws(() => parseHostingConfig({ realmId: 'asia', realms: oldConfig.realms.slice(0, 2) }));
  const allConfig = createHostingConfig('eu', '', 'https://us.example', 'https://asia.example');
  assert.throws(() => parseHostingConfig({ ...allConfig, realms: [allConfig.realms[0], allConfig.realms[2]] }), 'Asia never replaces the required US entry');
  assert.throws(() => parseHostingConfig({ ...allConfig, realms: [allConfig.realms[0], allConfig.realms[2], allConfig.realms[2]] }), 'duplicate realm IDs are invalid');
  assert.throws(() => parseHostingConfig({ ...allConfig, realms: allConfig.realms.map(realm => realm.id === 'asia' ? { ...realm, origin: 'https://us.example' } : realm) }), 'remote destinations require distinct origins');

  await new Promise(resolve => identityServer.listen(0, '127.0.0.1', resolve));
  keycloak = { url: `http://127.0.0.1:${identityServer.address().port}`, realm: 'mossvale', clientId: 'mossvale-browser' };
  issuer = `${keycloak.url}/realms/${keycloak.realm}`;
  const eu = await start('eu'), us = await start('us'), asia = await start('asia'), accessToken = await token();
  for (const [server, realmId] of [[eu, 'eu'], [us, 'us'], [asia, 'asia']]) {
    const config = await (await fetch(`${server.origin}/api/config`)).json();
    assert.deepEqual(parseHostingConfig(config), createHostingConfig(realmId, 'https://eu.example', 'https://us.example', 'https://asia.example'));
    assert.equal((await (await fetch(`${server.origin}/api/health`)).json()).realmId, realmId);
    assert.equal((await roster(server)).status, 401);
    assert.equal((await roster(server, 'invalid')).status, 401);
    assert.equal((await roster(server, await token('traveler', { azp: 'other-client' }))).status, 401);
    assert.equal((await roster(server, await token('traveler', { exp: 1 }))).status, 401);
    const empty = await roster(server, await token('unknown-account'), { Origin: 'https://game.example' });
    assert.equal(empty.headers.get('cache-control'), 'no-store');
    assert.equal(empty.headers.get('access-control-allow-origin'), 'https://game.example');
    assert.equal(empty.headers.get('vary'), 'Origin');
    assert.deepEqual((await empty.json()).characters, []);
    const denied = await roster(server, accessToken, { Origin: 'https://evil.example' });
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal((await roster(server, accessToken, { Origin: 'https://asia.example' })).headers.get('access-control-allow-origin'), 'https://asia.example');
    const lookalike = await roster(server, accessToken, { Origin: 'https://asia.example.evil.example' });
    assert.equal(lookalike.status, 403); assert.equal(lookalike.headers.get('access-control-allow-origin'), null);
    assert.equal((await connect(server, { accessToken, realmId }, 'https://asia.example.evil.example')).closed, 4403);
    const preflight = await fetch(`${server.origin}/api/roster`, { method: 'OPTIONS', headers: { Origin: 'https://game.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
    assert.equal(preflight.status, 204);
    assert.equal((await fetch(`${server.origin}/api/roster`, { method: 'OPTIONS', headers: { Origin: 'https://game.example', 'Access-Control-Request-Method': 'POST' } })).status, 403);
  }
  assert.equal(existsSync(join(dataDir, 'players.json')), false, 'HTTP roster does not create records');
  assert.equal(existsSync(join(dataDir, 'players-us.json')), false);
  assert.equal(existsSync(join(dataDir, 'players-asia.json')), false);
  assert.equal((await connect(us, { accessToken })).closed, 4400, 'US rejects legacy joins without a realm');
  assert.equal((await connect(asia, { accessToken })).closed, 4400, 'Asia rejects legacy joins without a realm');
  assert.equal((await connect(us, { accessToken, realmId: 'eu' })).closed, 4400);
  assert.equal((await connect(asia, { accessToken, realmId: 'us' })).closed, 4400);
  assert.equal((await connect(eu, { accessToken, realmId: 'eu' }, 'https://evil.example')).closed, 4403);
  const a = await connect(eu, { accessToken }), b = await connect(us, { accessToken, realmId: 'us' }), c = await connect(asia, { accessToken, realmId: 'asia' }, 'https://asia.example');
  a.send({ type: 'createCharacter', name: 'Same Name', appearance });
  b.send({ type: 'createCharacter', realmId: 'us', name: 'Same Name', appearance });
  c.send({ type: 'createCharacter', realmId: 'asia', name: 'Same Name', appearance });
  await until(() => [a, b, c].every(client => client.roster.characters.length === 1), 'creation on the requested destination');
  const euId = a.roster.characters[0].id, usId = b.roster.characters[0].id, asiaId = c.roster.characters[0].id;
  assert.equal(new Set([euId, usId, asiaId]).size, 3, 'local JSON fixtures use separate development files');
  assert.equal(Object.hasOwn(a.roster.characters[0], 'realmId'), false, 'characters have no permanent realm binding');
  assert.equal(Object.hasOwn(b.roster.characters[0], 'realmId'), false);
  assert.equal(Object.hasOwn(c.roster.characters[0], 'realmId'), false);
  b.send({ type: 'createCharacter', realmId: 'eu', name: 'Wrong Realm', appearance });
  c.send({ type: 'createCharacter', realmId: 'us', name: 'Wrong Realm', appearance });
  await until(() => [b, c].every(client => client.messages.some(msg => msg.requestType === 'createCharacter')), 'wrong realm creation rejection');
  assert.equal((await (await roster(us, accessToken)).json()).characters.length, 1);
  assert.equal((await (await roster(asia, accessToken)).json()).characters.length, 1);
  b.send({ type: 'selectCharacter', realmId: 'eu', characterId: usId });
  a.send({ type: 'selectCharacter', realmId: 'us', characterId: euId });
  c.send({ type: 'selectCharacter', realmId: 'us', characterId: asiaId });
  await delay(100); for (const client of [a, b, c]) assert.equal(client.welcome, null);
  b.send({ type: 'selectCharacter', realmId: 'us', characterId: euId });
  c.send({ type: 'selectCharacter', realmId: 'asia', characterId: euId });
  await delay(100); for (const client of [b, c]) assert.equal(client.welcome, null, 'a character absent from this development account cannot be selected');
  a.send({ type: 'selectCharacter', characterId: euId }); b.send({ type: 'selectCharacter', realmId: 'us', characterId: usId });
  c.send({ type: 'selectCharacter', realmId: 'asia', characterId: asiaId });
  await until(() => [a, b, c].every(client => client.snapshot), 'independent simulation worlds');
  for (const [client, id] of [[a, euId], [b, usId], [c, asiaId]]) assert.deepEqual(client.snapshot.players.map(p => p.id), [id]);
  const observed = await (await roster(eu, accessToken)).json();
  assert.equal(observed.realmId, 'eu'); assert.equal(observed.characters[0].id, euId);
  for (const secret of ['bank', 'auctions', 'auctionWallet', 'friendIds', 'ignoreIds']) assert.equal(Object.hasOwn(observed.characters[0], secret), false);
  assert.equal(a.socket.readyState, WebSocket.OPEN, 'viewing the roster does not displace a playing session');
  assert.equal((await (await fetch(`${eu.origin}/api/health`)).json()).players, 1);

  await eu.game.stop(); await us.game.stop(); await asia.game.stop();
  const euFile = join(dataDir, 'players.json'), usFile = join(dataDir, 'players-us.json'), asiaFile = join(dataDir, 'players-asia.json');
  const euSave = JSON.parse(readFileSync(euFile, 'utf8')), usSaveText = readFileSync(usFile, 'utf8'), usSave = JSON.parse(usSaveText), asiaSaveText = readFileSync(asiaFile, 'utf8'), asiaSave = JSON.parse(asiaSaveText);
  assert.equal(Object.keys(euSave).length, 1, 'readonly unknown-account lookup creates no account');
  assert.deepEqual(Object.keys(euSave), Object.keys(usSave), 'destination routing preserves the verified account identity');
  assert.deepEqual(Object.keys(euSave), Object.keys(asiaSave));
  const accountKey = Object.keys(euSave)[0];
  assert.equal(euSave[accountKey].characters[0].id, euId); assert.equal(usSave[accountKey].characters[0].id, usId); assert.equal(asiaSave[accountKey].characters[0].id, asiaId);
  euSave[accountKey].characters[0].realmId = 'eu';
  writeFileSync(euFile, JSON.stringify(euSave));
  const legacy = await start('eu');
  const legacyRoster = await (await roster(legacy, accessToken)).json();
  assert.equal(legacyRoster.characters[0].id, euId);
  assert.equal(Object.hasOwn(legacyRoster.characters[0], 'realmId'), false, 'former realm binding migrates away');
  await legacy.game.stop();
  // A stopped local fixture can demonstrate that a legacy EU-bound character
  // is accepted on US and Asia; production sharing is verified against PostgreSQL.
  for (const [realmId, file, saved] of [['us', usFile, usSaveText], ['asia', asiaFile, asiaSaveText]]) {
    writeFileSync(file, JSON.stringify(euSave));
    const destination = await start(realmId);
    const traveler = await connect(destination, { accessToken, realmId });
    assert.equal(traveler.roster.characters[0].id, euId);
    traveler.send({ type: 'selectCharacter', realmId, characterId: euId });
    await until(() => traveler.welcome, `legacy character enters selected ${realmId} destination`);
    assert.equal(traveler.welcome.id, euId);
    await destination.game.stop();
    assert.equal(Object.hasOwn(JSON.parse(readFileSync(file, 'utf8'))[accountKey].characters[0], 'realmId'), false, 'saving removes the retired realm field');
    writeFileSync(file, saved);
  }
  euSave[accountKey].ban = { at: Date.now(), by: randomUUID(), reason: 'Local check' };
  writeFileSync(euFile, JSON.stringify(euSave));
  const banned = await start('eu');
  assert.equal((await roster(banned, accessToken)).status, 403, 'roster honors account bans');
  await banned.game.stop();
  for (const [realmId, id] of [['us', usId], ['asia', asiaId]]) {
    const restored = await start(realmId);
    assert.equal((await (await roster(restored, accessToken)).json()).characters[0].id, id, 'the development save survives restart');
    await restored.game.stop();
  }
  const guest = await start('eu', { keycloak: null, dataDir: join(dataDir, 'guest') });
  assert.deepEqual((await (await roster(guest)).json()).characters, []);
  assert.equal((await roster(guest, undefined, { 'X-Guest-Token': 'invalid' })).status, 401);
  const local = await connect(guest, {}); local.send({ type: 'createCharacter', name: 'Local Guest', appearance });
  await until(() => local.roster.characters.length, 'local guest creation');
  assert.equal((await (await roster(guest, undefined, { 'X-Guest-Token': local.roster.token })).json()).characters[0].name, 'Local Guest');
  console.log('Hosting realms: trusted EU/US/Asia destination configuration, legacy config compatibility, public realm guards, request routing, independent worlds, retired character binding migration, authenticated readonly rosters, account bans, and exact-origin CORS/WebSockets passed. Shared progress and auctions are covered by the PostgreSQL integration check.');
} finally {
  for (const client of clients) client.socket.terminate();
  for (const game of games) await game.stop();
  await new Promise(resolve => identityServer.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
}
