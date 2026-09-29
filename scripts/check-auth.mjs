import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { WebSocket } from 'ws';
import pg from 'pg';
import { playerDatabaseFixture } from './fixture-player-database.mjs';
import { createGameServer } from '../server.mjs';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { createHostingConfig } from '../src/hosting-realms.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-auth-check-'));
const databaseUrl = process.env.TEST_DATABASE_URL || '';
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const clients = [], realNow = Date.now;
const connectionLogs = [], originalInfo = console.info;
console.info = (...args) => {
  if (args[0] === 'Game connection closed:') connectionLogs.push(JSON.parse(args[1]));
  else originalInfo(...args);
};
let clockOffset = 0; Date.now = () => realNow() + clockOffset;
const { publicKey, privateKey } = await generateKeyPair('RS256');
const wrongKeys = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test-key', use: 'sig', alg: 'RS256' };
let game;
let keycloak;
let issuer;
let unavailable = false;
let migratedIdentity, heldJwks, holdJwks = false, keyRequests = 0;
const jwksKeys = [jwk, { ...jwk, kid: 'rotated-key' }];
const identityServer = createServer((req, res) => {
  if (unavailable) { res.writeHead(503).end(); return; }
  if (req.url !== '/realms/mossvale/protocol/openid-connect/certs') { res.writeHead(404).end(); return; }
  keyRequests++;
  const respond = () => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: holdJwks ? jwksKeys : [jwk] }));
  if (holdJwks) heldJwks = respond; else respond();
});

async function until(predicate, label, timeout = 4000) {
  const deadline = realNow() + timeout;
  while (realNow() < deadline) {
    const result = predicate();
    if (result) return result;
    await delay(20);
  }
  throw new Error(`Timed out: ${label}`);
}

async function connect(port, fields, enterWorld = true) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const client = { socket, messages: [], welcome: null, roster: null, snapshot: null, closeCode: null };
  clients.push(client);
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString()); client.messages.push(message);
    if (message.type === 'welcome') client.welcome = message;
    if (message.type === 'roster') client.roster = message;
    if (message.type === 'snapshot') client.snapshot = message;
  });
  socket.on('close', code => { client.closeCode = code; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send = message => socket.send(JSON.stringify(message));
  client.send({ type: 'join', accessToken: fields.accessToken, token: fields.token });
  await until(() => client.roster || client.closeCode, 'account authentication result');
  client.player = () => client.snapshot?.players.find(p => p.id === client.welcome?.id);
  if (client.roster) {
    client.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION });
    await until(() => client.messages.some(message => message.type === 'community' && message.accepted), 'community rules accepted');
  }
  if (client.roster && enterWorld) {
    if (!client.roster.characters.length) {
      client.send({ type: 'createCharacter', name: fields.name || 'Account adventurer', appearance: fields.appearance || appearance });
      await until(() => client.roster.characters.length, 'account character created');
    }
    client.send({ type: 'selectCharacter', characterId: client.roster.characters[0].id });
    await until(() => client.welcome && client.player(), 'account character entered world');
  }
  return client;
}

function sign(overrides = {}, key = privateKey, kid = 'test-key') {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, sub: 'account-a', azp: keycloak.clientId, typ: 'Bearer', iat: now, exp: now + 120, jti: randomUUID(), ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid }).sign(key);
}

try {
  await new Promise(resolve => identityServer.listen(0, '127.0.0.1', resolve));
  keycloak = { url: `http://127.0.0.1:${identityServer.address().port}`, realm: 'mossvale', clientId: 'mossvale-browser' };
  issuer = `${keycloak.url}/realms/${keycloak.realm}`;

  const previousSocial = process.env.KEYCLOAK_SOCIAL_PROVIDERS;
  try {
    for (const invalid of ['google,google', 'apple,oidc', '../google', 'none,google', ', ,']) {
      process.env.KEYCLOAK_SOCIAL_PROVIDERS = invalid;
      assert.throws(() => createGameServer({ keycloak, dataDir }), /KEYCLOAK_SOCIAL_PROVIDERS/);
    }
    process.env.KEYCLOAK_SOCIAL_PROVIDERS = 'google, apple';
    for (const enabled of [false, true]) {
      game = createGameServer({ databaseUrl: '', port: 0, host: '127.0.0.1', dataDir, keycloak: enabled ? keycloak : null });
      const base = `http://127.0.0.1:${await game.start()}`;
      const response = await fetch(`${base}/api/config`), settings = await response.json();
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(settings.socialProviders, enabled ? { google: 'google', apple: 'apple' } : undefined);
      assert.equal((await (await fetch(`${base}/api/health`)).json()).socialProviders, undefined);
      await game.stop();
    }
    const sharedRealm = { ...keycloak, url: 'https://auth.mossvale.world' };
    const both = { google: 'google', apple: 'apple' };
    for (const [realm, configured, expected] of [
      [sharedRealm, undefined, both], [sharedRealm, '', both], [sharedRealm, ' ', both],
      [sharedRealm, 'none', {}], [sharedRealm, 'google', { google: 'google' }],
      [sharedRealm, 'apple', { apple: 'apple' }],
      [keycloak, '', undefined], [null, '', undefined], [null, 'none', undefined],
      [{ ...sharedRealm, realm: 'other' }, '', undefined],
      [{ ...sharedRealm, url: 'https://auth.mossvale.world.example' }, '', undefined],
      [{ ...sharedRealm, url: 'http://auth.mossvale.world' }, '', undefined],
      [{ ...sharedRealm, url: 'https://auth.mossvale.world/custom' }, '', undefined],
      [{ ...sharedRealm, url: 'https://auth.mossvale.world:8443' }, '', undefined],
    ]) {
      if (configured === undefined) delete process.env.KEYCLOAK_SOCIAL_PROVIDERS;
      else process.env.KEYCLOAK_SOCIAL_PROVIDERS = configured;
      game = createGameServer({ databaseUrl: '', port: 0, host: '127.0.0.1', dataDir, keycloak: realm });
      const base = `http://127.0.0.1:${await game.start()}`;
      assert.deepEqual((await (await fetch(`${base}/api/config`)).json()).socialProviders, expected);
      await game.stop();
    }
  } finally {
    if (previousSocial === undefined) delete process.env.KEYCLOAK_SOCIAL_PROVIDERS;
    else process.env.KEYCLOAK_SOCIAL_PROVIDERS = previousSocial;
  }

  game = createGameServer({ databaseUrl, port: 0, host: '127.0.0.1', dataDir, keycloak: null });
  const guestPort = await game.start();
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${guestPort}/api/config`)).json(), { keycloak: null, ...createHostingConfig(), mobilePurchases: { apple: false, google: false } });
  const guest = await connect(guestPort, {});
  const guestToken = guest.welcome.token;
  assert.ok(guestToken);
  await game.stop();
  const guestKey = createHash('sha256').update(guestToken).digest('hex');
  const legacyGuest = structuredClone(guest.welcome.player);
  delete legacyGuest.zone;
  delete legacyGuest.gathering;
  legacyGuest.quest = { stage: 1, kills: 1, crystals: 2 };
  legacyGuest.inventory.crystal = 2;
  if (databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try { await pool.query('UPDATE mossvale_players SET state = $1::jsonb WHERE account_key = $2', [JSON.stringify(legacyGuest), guestKey]); }
    finally { await pool.end(); }
  } else {
    const records = JSON.parse(readFileSync(join(dataDir, 'players.json'), 'utf8'));
    records[guestKey] = legacyGuest;
    writeFileSync(join(dataDir, 'players.json'), JSON.stringify(records));
  }

  game = createGameServer({ databaseUrl, port: 0, host: '127.0.0.1', dataDir, keycloak });
  let port = await game.start();
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/config`)).json(), { keycloak, ...createHostingConfig(), mobilePurchases: { apple: false, google: false } });
  const invalidJoins = [
    {},
    { token: guestToken },
    { accessToken: 'not-a-jwt' },
    { accessToken: await sign({}, wrongKeys.privateKey) },
    { accessToken: await sign({ iss: `${issuer}-wrong` }) },
    { accessToken: await sign({ azp: 'another-client' }) },
    { accessToken: await sign({ exp: Math.floor(Date.now() / 1000) - 1 }) },
    { accessToken: await sign({ exp: undefined }) },
    { accessToken: await sign({ iat: undefined }) },
    { accessToken: await sign({ sub: undefined }) },
    { accessToken: await sign({ typ: 'ID' }) },
  ];
  for (const fields of invalidJoins) {
    const rejected = await connect(port, fields);
    assert.equal(rejected.closeCode, 4401, 'invalid identity must require sign-in');
    assert.equal(rejected.welcome, null, 'invalid identity must never enter the world');
  }
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).players, 0);

  const firstToken = await sign();
  const a = await connect(port, { accessToken: firstToken, token: guestToken, name: 'Saved account name', appearance: { ...appearance, className: 'Mage' } });
  assert.ok(a.welcome);
  assert.equal(a.welcome.token, undefined, 'account mode must not issue guest authority');
  assert.notEqual(a.welcome.id, guest.welcome.id, 'guest token must not claim an account character');
  a.send({ type: 'appearance', name: 'Forbidden rename', appearance });
  a.send({ type: 'move', x: 0.5, z: 8, rotation: 0 });
  await until(() => a.player()?.name === 'Saved account name' && a.player()?.x === 0.5, 'account progress changed');
  const firstCharacterId = a.welcome.id;
  a.send({ type: 'leaveWorld' });
  await until(() => a.roster.characters[0].x === 0.5, 'authenticated account returned to roster');
  a.send({ type: 'createCharacter', name: 'Second adventurer', appearance });
  await until(() => a.roster.characters.length === 2, 'second character created on same identity');
  const secondCharacterId = a.roster.characters[1].id;
  a.send({ type: 'selectCharacter', characterId: secondCharacterId });
  await until(() => a.player()?.id === secondCharacterId, 'authenticated alt selected');
  // New characters have tutorial-locked talents; movement still verifies independent saved state.
  a.send({ type: 'move', x: -0.5, z: 8, rotation: 0 });
  await until(() => a.player()?.x === -0.5, 'alt position changed');
  a.send({ type: 'selectCharacter', characterId: firstCharacterId });
  await until(() => a.player()?.id === firstCharacterId, 'original character selected again');
  assert.equal(a.player().x, 0.5, 'characters under one identity keep separate progress');
  const secondToken = await sign();
  assert.notEqual(secondToken, firstToken);
  const otherDevice = await connect(port, { accessToken: secondToken });
  assert.equal(otherDevice.welcome.id, a.welcome.id, 'fresh access token on another device maps to the same subject');
  assert.equal(otherDevice.welcome.player.name, 'Saved account name');
  assert.equal(otherDevice.welcome.player.appearance.className, 'Mage');
  assert.equal(otherDevice.welcome.player.x, 0.5);
  assert.equal(otherDevice.roster.characters.length, 2, 'fresh token restores the entire private roster');
  assert.equal(otherDevice.roster.characters[1].x, -0.5);
  await until(() => a.closeCode === 4001, 'old device session replaced');
  const b = await connect(port, { accessToken: await sign({ sub: 'account-b' }) });
  assert.notEqual(b.welcome.id, a.welcome.id, 'different account gets a distinct character');

  // AFK clients only renew in response to server messages; no browser interval or user activity.
  const originalExpiry = (Math.floor(Date.now() / 1000) + 75) * 1000;
  const renewable = await connect(port, { accessToken: await sign({ sub: 'renew-world', exp: originalExpiry / 1000 }) });
  const renewableRoster = await connect(port, { accessToken: await sign({ sub: 'renew-roster', exp: originalExpiry / 1000 }) }, false);
  renewable.send({ type: 'duelRequest', targetId: b.welcome.id });
  await until(() => b.snapshot.duelInvites.some(invite => invite.inviterId === renewable.welcome.id), 'duel invitation before renewal');
  b.send({ type: 'duelAccept', invitationId: b.snapshot.duelInvites.find(invite => invite.inviterId === renewable.welcome.id).id });
  await until(() => renewable.snapshot.duel, 'duel active before renewal');
  const duelBefore = structuredClone(renewable.snapshot.duel), positionBefore = { x: renewable.player().x, z: renewable.player().z };
  const renewalToken = await sign({ sub: 'renew-world', exp: originalExpiry / 1000 + 120 });
  const rosterRenewalToken = await sign({ sub: 'renew-roster', exp: originalExpiry / 1000 + 120 });
  const prompts = client => client.messages.filter(m => m.type === 'sessionRefresh').length;
  await delay(150);
  assert.equal(prompts(renewable) + prompts(renewableRoster), 0, 'server waits until the last minute before prompting renewal');
  clockOffset = 17000;
  await until(() => prompts(renewable) === 1 && prompts(renewableRoster) === 1, 'server prompts AFK world and roster sockets before expiry');
  clockOffset = 30000; await delay(150);
  assert.equal(prompts(renewable), 1); assert.equal(prompts(renewableRoster), 1, 'unanswered prompts are not sent on every tick');
  for (const [client, accessToken] of [[renewable, renewalToken], [renewableRoster, rosterRenewalToken]]) {
    client.socket.on('message', raw => {
      if (JSON.parse(raw).type === 'sessionRefresh') client.send({ type: 'refreshSession', accessToken });
    });
  }
  clockOffset = 33000;
  await until(() => prompts(renewable) === 2 && prompts(renewableRoster) === 2, 'server retries unanswered renewal after fifteen seconds');
  await delay(150);
  // Duplicate replies still use the existing verifier guard.
  renewable.send({ type: 'refreshSession', accessToken: renewalToken });
  clockOffset = originalExpiry - realNow() + 150;
  await until(() => renewable.snapshot.serverTime > originalExpiry, 'same world socket survives original token expiry');
  assert.equal(renewable.closeCode, null); assert.equal(renewableRoster.closeCode, null);
  assert.deepEqual(renewable.snapshot.duel, duelBefore, 'renewal preserves the active duel');
  assert.deepEqual({ x: renewable.player().x, z: renewable.player().z }, positionBefore);
  assert.equal(renewable.messages.filter(m => m.type === 'welcome').length, 1, 'renewal does not rejoin or reselect the character');
  assert.equal(renewable.messages.filter(m => m.type === 'event' && / (left|arrived in) /.test(m.text)).length, 1, 'AFK renewal does not repeat departure or arrival notices');
  assert.equal(prompts(renewable), 2); assert.equal(prompts(renewableRoster), 2, 'successful renewal moves the next prompt to the new token deadline');
  renewableRoster.send({ type: 'createCharacter', name: 'Renewed roster', appearance });
  await until(() => renewableRoster.roster.characters.length === 1, 'renewed roster can still act after original expiry');
  renewable.send({ type: 'duelForfeit' }); await until(() => renewable.snapshot.duel === null, 'renewed world actions still authorized');
  // A later, shorter token is valid but cannot roll a renewed connection back to its earlier deadline.
  const shorterExpiry = Math.floor(Date.now() / 1000) + 2;
  renewable.send({ type: 'refreshSession', accessToken: await sign({ sub: 'renew-world', exp: shorterExpiry }) });
  await delay(Math.max(0, shorterExpiry * 1000 - Date.now()) + 150);
  await until(() => renewable.snapshot.serverTime > shorterExpiry * 1000, 'replayed older expiry cannot shorten a renewed session');
  for (const refresh of [
    { type: 'refreshSession' }, { type: 'refreshSession', accessToken: renewalToken, expiresAt: Date.now() + 999999 },
    ...['not-a-jwt', 4, 'x'.repeat(12001), await sign({ sub: 'another-account' }), await sign({ sub: 'renew-invalid' }, wrongKeys.privateKey),
      await sign({ sub: 'renew-invalid', iss: `${issuer}-wrong` }), await sign({ sub: 'renew-invalid', azp: 'another-client' }),
      await sign({ sub: 'renew-invalid', typ: 'ID' }), await sign({ sub: 'renew-invalid', exp: Math.floor(Date.now() / 1000) - 1 }),
      await sign({ sub: 'renew-invalid', exp: undefined }), await sign({ sub: undefined }), await sign({ sub: 'renew-invalid', iat: undefined })]
      .map(accessToken => ({ type: 'refreshSession', accessToken })),
  ]) {
    const invalid = await connect(port, { accessToken: await sign({ sub: 'renew-invalid' }) }, false);
    invalid.send(refresh); await until(() => invalid.closeCode === 4401, 'invalid renewal requires a verified sign-in');
    assert.equal(invalid.welcome, null, 'invalid renewal cannot enter another account');
  }
  const privileged = await connect(port, { accessToken: await sign({ sub: 'renew-gm', realm_access: { roles: ['gm'] } }) });
  privileged.send({ type: 'gmAction', targetId: privileged.welcome.id, action: 'setFlying', enabled: true });
  await until(() => privileged.player().gm?.flying, 'GM flight before role change');
  privileged.send({ type: 'refreshSession', accessToken: await sign({ sub: 'renew-gm' }) });
  await until(() => privileged.closeCode === 4401, 'role change deliberately requires reconnect');
  const demoted = await connect(port, { accessToken: await sign({ sub: 'renew-gm' }) });
  assert.equal(demoted.player().role, 'player'); assert.equal(demoted.player().gm, undefined, 'role change clears privileged world modes');

  const expiring = await connect(port, { accessToken: await sign({ sub: 'short-session', exp: Math.floor(Date.now() / 1000) + 2 }) });
  assert.ok(expiring.welcome);
  await until(() => expiring.closeCode === 4401, 'access token expiry closes the world connection');
  const expiredLog = await until(() => connectionLogs.find(log => log.code === 4401 && log.world?.characterId === expiring.welcome.id), 'expiry diagnostic retains the character after session teardown');
  assert.equal(expiredLog.realmId, 'eu'); assert(expiredLog.expiresInMs <= 0); assert.equal(expiredLog.restarting, false);
  const refreshed = await connect(port, { accessToken: await sign({ sub: 'short-session' }) });
  assert.equal(refreshed.welcome.id, expiring.welcome.id, 'refresh restores the same character');
  refreshed.socket.close(4002, 'private peer-supplied close text');
  const timeoutLog = await until(() => connectionLogs.find(log => log.code === 4002 && log.world?.characterId === refreshed.welcome.id), 'browser watchdog close is distinguishable from auth expiry');
  assert.equal(timeoutLog.inWorld, true); assert(timeoutLog.connectedMs >= 0); assert(timeoutLog.lastMessageAgoMs >= 0);
  const idleRoster = await connect(port, { accessToken: await sign({ sub: 'idle-roster', exp: Math.floor(Date.now() / 1000) + 2 }) }, false);
  assert.deepEqual(idleRoster.roster.characters, []);
  await until(() => idleRoster.closeCode === 4401, 'roster-only identity also expires');

  await game.stop(); clockOffset = 0;
  let saved;
  if (databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try { saved = JSON.stringify((await pool.query('SELECT account_key, state FROM mossvale_players')).rows); }
    finally { await pool.end(); }
  } else {
    saved = readFileSync(join(dataDir, 'players.json'), 'utf8');
  }
  for (const credential of [firstToken, secondToken, renewalToken, guestToken, 'account-a', issuer]) assert.ok(!saved.includes(credential), 'raw credentials and provider subjects must not be persisted');
  for (const secret of [firstToken, secondToken, renewalToken, guestToken, 'account-a', issuer, 'private peer-supplied close text']) {
    assert(!JSON.stringify(connectionLogs).includes(secret), 'connection diagnostics contain no credentials, provider identity or peer-supplied close text');
  }
  const savedRecords = JSON.parse(saved);
  const migratedGuest = databaseUrl ? savedRecords.find(row => row.account_key === guestKey).state.characters[0] : savedRecords[guestKey].characters[0];
  assert.equal(migratedGuest.zone, 'greenwood');
  assert.equal(migratedGuest.quest.chapter, 0);
  assert.deepEqual(migratedGuest.quest.progress, { 'grove-slimes': 1, 'grove-crystals': 2 }, 'existing patrol progress migrates without reset');
  game = createGameServer({ databaseUrl, port: 0, host: '127.0.0.1', dataDir, keycloak });
  port = await game.start();
  const afterRestart = await connect(port, { accessToken: await sign() });
  assert.equal(afterRestart.welcome.id, a.welcome.id);
  assert.equal(afterRestart.welcome.player.name, 'Saved account name');
  assert.equal(afterRestart.welcome.player.x, 0.5);
  assert.equal(afterRestart.roster.characters.length, 2);
  assert.equal(afterRestart.roster.characters[1].x, -0.5);

  await game.stop();
  // A copied realm retains user IDs while a new host remains the only trusted issuer.
  const originalIssuer = issuer, originalToken = await sign();
  migratedIdentity = createServer((req, res) => {
    if (req.url !== '/realms/mossvale/protocol/openid-connect/certs') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise(resolve => migratedIdentity.listen(0, '127.0.0.1', resolve));
  const originalKeycloak = keycloak;
  keycloak = { ...keycloak, url: `http://127.0.0.1:${migratedIdentity.address().port}` }; issuer = `${keycloak.url}/realms/${keycloak.realm}`;
  for (const keycloakAccountIssuer of ['https://legacy.invalid/realm?query=1', 'https://legacy.invalid/realm#fragment', 'https://user:pass@legacy.invalid/realm', 'https://legacy.invalid/realm/', null]) {
    assert.throws(() => createGameServer({ dataDir, databaseUrl: '', keycloak, keycloakAccountIssuer }), /KEYCLOAK_ACCOUNT_ISSUER/);
  }
  assert.throws(() => createGameServer({ dataDir, databaseUrl: '', keycloak: null, keycloakAccountIssuer: originalIssuer }), /KEYCLOAK_ACCOUNT_ISSUER/);
  game = createGameServer({ databaseUrl, port: 0, host: '127.0.0.1', dataDir, keycloak, keycloakAccountIssuer: originalIssuer });
  port = await game.start();
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/config`)).json(), { keycloak, ...createHostingConfig(), mobilePurchases: { apple: false, google: false } }, 'legacy account namespace is not a browser issuer');
  assert.equal((await connect(port, { accessToken: originalToken }, false)).closeCode, 4401, 'old issued tokens remain rejected after provider migration');
  const migrated = await connect(port, { accessToken: await sign() });
  assert.equal(migrated.welcome.id, firstCharacterId); assert.equal(migrated.roster.characters[1].id, secondCharacterId);
  assert.equal(migrated.player().x, 0.5); assert.equal(migrated.roster.characters[1].x, -0.5, 'both migrated characters retain independent progress');
  const distinct = await connect(port, { accessToken: await sign({ sub: 'unrelated-new-subject' }) }, false); assert.deepEqual(distinct.roster.characters, [], 'a new provider subject cannot claim an existing account');
  await game.stop();
  game = createGameServer({ databaseUrl, port: 0, host: '127.0.0.1', dataDir, keycloak, keycloakAccountIssuer: originalIssuer }); port = await game.start();
  assert.equal((await connect(port, { accessToken: await sign() })).welcome.id, firstCharacterId, 'old storage identity persists through restart on the new provider');
  await game.stop(); keycloak = originalKeycloak; issuer = originalIssuer;
  // Hold a rotated-key verification across expiry, account replacement and shutdown.
  for (const boundary of ['expired', 'replaced', 'closing']) {
    game = createGameServer({ databaseUrl, port: 0, host: '127.0.0.1', dataDir, keycloak }); port = await game.start();
    const subject = `renew-pending-${boundary}`, oldExpiry = Math.floor(Date.now() / 1000) + (boundary === 'expired' ? 40 : 120);
    const pending = await connect(port, { accessToken: await sign({ sub: subject, exp: oldExpiry }) });
    clockOffset = 31000; holdJwks = true; heldJwks = null;
    const beforeRequests = keyRequests, rotated = await sign({ sub: subject, exp: oldExpiry + 120 }, privateKey, 'rotated-key');
    pending.send({ type: 'refreshSession', accessToken: rotated });
    await until(() => heldJwks, 'renewal awaiting rotated signing key');
    pending.send({ type: 'refreshSession', accessToken: rotated });
    pending.send({ type: 'refreshSession', accessToken: 'not-a-jwt' }); await delay(50);
    assert.equal(pending.closeCode, null, 'additional renewals cannot start another verifier while one is pending');
    assert.equal(keyRequests, beforeRequests + 1, 'one verification remains pending per connection');
    let replacement;
    if (boundary === 'expired') { clockOffset = 42000; await until(() => pending.closeCode === 4401, 'old session expires during verification'); }
    else if (boundary === 'replaced') {
      replacement = await connect(port, { accessToken: await sign({ sub: subject }) });
      await until(() => pending.closeCode === 4001, 'other device replaces pending renewal');
    } else { await game.stop(); game = null; await until(() => pending.closeCode === 1012, 'shutdown closes pending renewal'); }
    heldJwks(); heldJwks = null; holdJwks = false; await delay(100);
    assert.notEqual(pending.socket.readyState, WebSocket.OPEN, 'late verification cannot reopen a retired connection');
    assert.equal(pending.messages.filter(m => m.type === 'welcome').length, 1, 'late renewal cannot re-enter the world');
    if (replacement) { assert.equal(replacement.closeCode, null); assert.equal(replacement.player().id, pending.welcome.id); }
    else if (game) assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).players, 0, 'expired renewal cannot revive world presence');
    await game?.stop(); game = null; clockOffset = 0;
  }
  // An admitted account write may finish after renewal; its inventory changes remain isolated.
  const RealClient = pg.Client; let releaseWrite, holdWrite = false;
  pg.Client = playerDatabaseFixture({}, { beforeWrite: async () => {
    if (holdWrite) await new Promise(resolve => { releaseWrite = resolve; });
  } });
  try {
    game = createGameServer({ databaseUrl: 'postgres://fixture@localhost/renewal', port: 0, host: '127.0.0.1', dataDir, keycloak }); port = await game.start();
    const oldExpiry = (Math.floor(Date.now() / 1000) + 3) * 1000;
    const saving = await connect(port, { accessToken: await sign({ sub: 'renew-during-save', exp: oldExpiry / 1000 }) });
    const index = saving.messages.length; saving.send({ type: 'leaveWorld' });
    await until(() => saving.messages.slice(index).some(m => m.type === 'roster'), 'roster before pending write');
    const rosterBefore = structuredClone(saving.roster.characters); holdWrite = true;
    saving.send({ type: 'deleteCharacter', characterId: rosterBefore[0].id, confirmation: 'I confirm' });
    await until(() => releaseWrite, 'account write awaiting database acknowledgment');
    saving.send({ type: 'refreshSession', accessToken: await sign({ sub: 'renew-during-save', exp: oldExpiry / 1000 + 20 }) });
    await delay(Math.max(0, oldExpiry - Date.now()) + 150);
    assert.equal(saving.closeCode, null, 'pending persistence does not block credential renewal');
    assert.deepEqual(saving.roster.characters, rosterBefore, 'renewal cannot prematurely apply the pending inventory write');
    holdWrite = false; releaseWrite(); releaseWrite = null;
    await until(() => saving.roster.characters.length === 0, 'the original write applies only after acknowledgment');
  } finally { holdWrite = false; releaseWrite?.(); await game?.stop(); game = null; pg.Client = RealClient; }
  unavailable = true;
  game = createGameServer({ databaseUrl, port: 0, host: '127.0.0.1', dataDir, keycloak });
  port = await game.start();
  const failedProvider = await connect(port, { accessToken: await sign() });
  assert.equal(failedProvider.closeCode, 4401, 'JWKS errors must fail closed');
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).ok, true, 'async verification failure must not crash the game');
  assert.throws(() => createGameServer({ databaseUrl: '', port: 0, dataDir, keycloak: { url: keycloak.url } }), /must all be configured/);
  console.log(`PASS (${databaseUrl ? 'PostgreSQL' : 'JSON'}): signed JWT/JWKS login; invalid signature/issuer/client/type/claims and guest tokens rejected; server-prompted AFK world/roster renewal with bounded retries and no repeated arrival/departure, duel continuity, malformed/replayed renewal and role-change revocation, pending-verification expiry/replacement/shutdown guards and renewal during pending persistence; world and roster expiry/reconnect; isolated characters per identity; cross-device and restart roster; migrated issuer retains original account hash while rejecting old tokens; no persisted tokens; JWKS failure handled.`);
} finally {
  Date.now = realNow; heldJwks?.(); holdJwks = false;
  for (const client of clients) client.socket.terminate();
  await game?.stop();
  console.info = originalInfo;
  await new Promise(resolve => identityServer.close(resolve));
  if (migratedIdentity) await new Promise(resolve => migratedIdentity.close(resolve));
  rmSync(dataDir, { recursive: true, force: true });
}
