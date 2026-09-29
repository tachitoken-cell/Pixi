import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { defaultHotbar } from '../src/spells.ts';
import { regionAt, canTraverse, toWorld } from '../src/realm.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';

// Real WebSockets, isolated durable saves, and a controlled clock; no production data.
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-friends-')), file = join(dataDir, 'players.json');
const clients = [], realNow = Date.now, merchant = VILLAGE_NPCS.find(npc => npc.id === 'village-pinewake-merchant');
let game, port, offset = 0;
Date.now = () => realNow() + offset;
const key = token => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('base64url');
function hero(name, index = 0) {
  const x = merchant.x - index, z = merchant.z - 2, className = 'Ranger';
  return { id: randomUUID(), name, x, z, zone: regionAt(x, z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    characterCreated: true, talents: [], ...starterGear(className), hotbar: defaultHotbar(className),
    hp: 100, maxHp: 100, level: 1, xp: 0, gold: 0,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
    quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const result = predicate(); if (result) return result; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 1100) { offset += ms; await delay(120); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = null; }
async function connect(token, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, id, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token, characterId: id });
  await until(() => client.welcome && client.friends, 'world entry and private lists');
  if (!client.community?.accepted) { client.send({ type: 'acceptCommunityRules', version: 1 }); await until(() => client.community?.accepted, 'accepted community rules'); }
  return client;
}
const requestNames = { friendsList: 'list', friendAdd: 'add', friendRemove: 'remove', friendRespond: 'accept', friendCancel: 'cancel', ignoreAdd: 'ignoreAdd', ignoreRemove: 'ignoreRemove' };
async function action(client, message, error = false) {
  const before = client.messages.length; client.send(message);
  const response = await until(() => client.messages.slice(before).find(m => m.type === 'friends' && m.request === (message.type === 'friendRespond' && message.accept === false ? 'decline' : requestNames[message.type])), message.type);
  assert.equal(!!response.error, error, JSON.stringify(response));
  return response;
}
async function invite(a, b) {
  await tick(); a.send({ type: 'partyInvite', targetId: b.id });
  const invitation = await until(() => b.snapshot?.partyInvites.find(i => i.inviterId === a.id), 'party invitation');
  b.send({ type: 'partyAccept', invitationId: invitation.id });
  await until(() => b.snapshot?.party?.members.some(p => p.id === a.id), 'party membership');
}
async function unavailable(sender, message) {
  await tick(); const before = sender.messages.length; sender.send(message);
  const rejection = await until(() => sender.messages.slice(before).find(m => m.type === 'event' && m.kind === 'info'), `unavailable ${message.type}`);
  assert(!/ignor/i.test(rejection.text), 'the sender receives a generic availability error');
}
function privatePayloads(client) {
  for (const message of client.messages) {
    assert(!['friendIds', 'friendRequestIds', 'ignoreIds'].some(key => JSON.stringify(message).includes(key)), 'saved lists never leak into any player payload');
    if (message.type === 'friends') {
      for (const friend of message.friends) assert.deepEqual(Object.keys(friend).sort(), ['className', 'id', 'level', 'name', 'online', 'zone']);
      for (const ignored of [...message.ignored, ...message.incoming, ...message.outgoing]) assert.deepEqual(Object.keys(ignored).sort(), ['id', 'name']);
      assert(!JSON.stringify(message).includes('recordKey') && !JSON.stringify(message).includes('account'), 'social payload contains no account identity');
    }
  }
}

try {
  const aHero = hero('Willow', 0), alt = hero('Willow Alt'), bHero = hero('Birch', 1), cHero = hero('Cedar', 2), remote = hero('Far Fern');
  Object.assign(remote, toWorld('frostmarch', { x: 0, z: 22 })); remote.zone = regionAt(remote.x, remote.z);
  assert([aHero, bHero, cHero, remote].every(p => canTraverse(p, p)), 'clear fixture positions');
  const [aToken, bToken, cToken, remoteToken, fullToken, ignoredFullToken, incomingFullToken, outgoingFullToken] = Array.from({ length: 8 }, token);
  const reserve = Array.from({ length: 101 }, (_, index) => hero(`Reserve ${index}`));
  const full = { ...hero('Full Friends'), friendIds: reserve.slice(0, 100).map(p => p.id), friendRequestIds: [reserve[100].id] };
  for (const p of reserve.slice(0, 100)) p.friendIds = [full.id];
  const incomingFull = { ...hero('Full Incoming'), friendRequestIds: reserve.slice(0, 100).map(p => p.id) };
  const outgoingFull = hero('Full Outgoing');
  for (const p of reserve.slice(0, 100)) p.friendRequestIds = [outgoingFull.id];
  cHero.friendRequestIds = [full.id];
  cHero.friendIds = [aHero.id]; // Legacy one-sided entries must not expose presence without consent.
  const ignoredFull = { ...hero('Full Ignore'), ignoreIds: reserve.slice(0, 100).map(p => p.id) };
  const records = Object.fromEntries([[aToken, [aHero, alt]], [bToken, [bHero]], [cToken, [cHero]], [remoteToken, [remote]], [fullToken, [full]], [ignoredFullToken, [ignoredFull]], [incomingFullToken, [incomingFull]], [outgoingFullToken, [outgoingFull]],
    ...reserve.map(p => [token(), [p]]), [token(), [hero('Echo')]], [token(), [hero('echo')]]].map(([token, characters]) => [key(token), { characters }]));
  writeFileSync(file, JSON.stringify(records));
  await start();
  let a = await connect(aToken, aHero.id), b = await connect(bToken, bHero.id), c = await connect(cToken, cHero.id);
  assert.deepEqual(a.friends.friends, []); assert.deepEqual(a.friends.ignored, []);
  assert.deepEqual(c.friends.friends, [], 'one-sided saved entries do not count as accepted friendships');
  await action(a, { type: 'friendAdd', targetId: b.id });
  assert.deepEqual(a.friends.friends, [], 'sending a request does not create a friendship');
  assert.deepEqual(a.friends.outgoing, [{ id: b.id, name: bHero.name }]);
  await until(() => b.friends.incoming.some(p => p.id === a.id), 'recipient sees a private incoming request');
  assert.deepEqual(b.friends.friends, []);
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))[key(bToken)].characters[0].friendRequestIds[0], a.id, 'request success follows durable save');
  await action(c, { type: 'friendRespond', targetId: a.id, accept: true }, true);
  await action(a, { type: 'friendRespond', targetId: b.id, accept: true }, true);
  await action(b, { type: 'friendAdd', targetId: a.id }, true);
  await action(a, { type: 'friendAdd', name: 'birch' }); assert.equal(a.friends.outgoing.length, 1, 'duplicate request is idempotent');
  mkdirSync(`${file}.tmp`);
  try {
    await action(b, { type: 'friendRespond', targetId: a.id, accept: true }, true);
    assert(!a.friends.friends.length && !b.friends.friends.length, 'failed atomic acceptance changes neither list');
    assert(b.friends.incoming.some(p => p.id === a.id), 'failed acceptance preserves the request');
  } finally { rmSync(`${file}.tmp`, { recursive: true, force: true }); }
  await action(b, { type: 'friendRespond', targetId: a.id, accept: true });
  await until(() => a.friends.friends.some(p => p.id === b.id), 'both players become friends only after acceptance');
  assert.equal(a.friends.friends[0].online, true);
  assert.deepEqual(b.friends.friends.map(p => p.id), [a.id]);
  assert(!a.friends.outgoing.length && !b.friends.incoming.length);
  const accepted = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(accepted[key(aToken)].characters[0].friendIds[0], b.id);
  assert.equal(accepted[key(bToken)].characters[0].friendIds[0], a.id, 'both sides are persisted before success');
  await action(b, { type: 'friendRespond', targetId: a.id, accept: true });
  await action(a, { type: 'friendAdd', name: '  fAr FeRn  ' });
  assert(!a.friends.friends.some(p => p.id === remote.id), 'offline characters must also accept');
  assert(a.friends.outgoing.some(p => p.id === remote.id));
  const far = await connect(remoteToken, remote.id);
  await action(far, { type: 'friendRespond', targetId: a.id, accept: true }); await tick();
  assert.equal(a.friends.friends.find(p => p.id === remote.id).zone, remote.zone, 'presence works across the whole realm');
  far.socket.close(); await tick();
  assert.deepEqual(a.friends.friends.find(p => p.id === remote.id), { id: remote.id, name: remote.name, className: 'Ranger', level: 1, online: false, zone: null });
  await action(a, { type: 'friendAdd', name: 'birch' }); assert.equal(a.friends.friends.length, 2, 'duplicate friendship is safe');
  for (const message of [
    { type: 'friendAdd', name: aHero.name }, { type: 'friendAdd', targetId: a.id }, { type: 'friendAdd', name: 'Missing' },
    { type: 'friendAdd', name: 'EcHo' }, { type: 'friendAdd', name: '' }, { type: 'friendAdd', name: '<Birch>' },
    { type: 'friendAdd', name: 'Birch\n' }, { type: 'friendAdd', name: 'x'.repeat(21) }, { type: 'friendAdd', name: {} },
    { type: 'friendAdd', targetId: randomUUID() }, { type: 'friendAdd', targetId: b.id, name: bHero.name },
    { type: 'friendRemove', targetId: {} }, { type: 'friendsList', playerId: b.id },
    { type: 'friendRespond', targetId: b.id, accept: 'yes' }, { type: 'friendRespond', targetId: a.id, accept: true },
    { type: 'friendRespond', targetId: randomUUID(), accept: true }, { type: 'friendRespond', targetId: c.id, accept: true, playerId: b.id },
    { type: 'friendCancel', name: bHero.name }, { type: 'friendCancel', targetId: {} },
    { type: 'ignoreAdd', targetId: a.id }, { type: 'ignoreAdd', name: 'Echo' }, { type: 'ignoreRemove', name: bHero.name },
  ]) await action(a, message, true);
  mkdirSync(`${file}.tmp`);
  try { await action(a, { type: 'friendAdd', targetId: c.id }, true); assert.equal(a.friends.friends.length, 2, 'failed saves do not change a list'); }
  finally { rmSync(`${file}.tmp`, { recursive: true, force: true }); }
  const capped = await connect(fullToken, full.id), ignoredCapped = await connect(ignoredFullToken, ignoredFull.id), outgoingCapped = await connect(outgoingFullToken, outgoingFull.id);
  await action(a, { type: 'friendAdd', targetId: incomingFull.id }, true);
  await action(outgoingCapped, { type: 'friendAdd', targetId: reserve[100].id }, true);
  await action(capped, { type: 'friendRespond', targetId: reserve[100].id, accept: true }, true);
  await action(c, { type: 'friendRespond', targetId: full.id, accept: true }, true);
  await action(c, { type: 'friendRespond', targetId: full.id, accept: false });
  await action(capped, { type: 'friendAdd', targetId: reserve[100].id }, true);
  await action(ignoredCapped, { type: 'ignoreAdd', targetId: reserve[100].id }, true);
  capped.socket.close(); ignoredCapped.socket.close(); outgoingCapped.socket.close();
  a.send({ type: 'selectCharacter', characterId: alt.id }); await until(() => a.welcome?.id === alt.id, 'alternate selection');
  assert.deepEqual((await action(a, { type: 'friendsList' })).friends, [], 'lists belong to characters');
  a.send({ type: 'selectCharacter', characterId: aHero.id }); await until(() => a.welcome?.id === aHero.id, 'original selection');
  assert.equal((await action(a, { type: 'friendsList' })).friends.length, 2);

  await invite(b, a); await invite(b, c);
  await action(a, { type: 'ignoreAdd', name: 'bIrCh' });
  assert(!a.friends.friends.some(p => p.id === b.id), 'ignoring removes friendship');
  await until(() => !b.friends.friends.some(p => p.id === a.id), 'ignoring removes the mutual relationship');
  assert(!/ignor/i.test((await action(b, { type: 'friendAdd', targetId: a.id }, true)).error), 'blocked requester receives generic availability');
  assert.deepEqual(a.friends.ignored, [{ id: b.id, name: bHero.name }]);
  await action(a, { type: 'friendAdd', targetId: b.id }, true);
  await action(a, { type: 'ignoreAdd', targetId: b.id }); assert.equal(a.friends.ignored.length, 1);
  for (const type of ['chat', 'partyChat']) {
    await tick(); const text = `ignored ${type}`, before = a.messages.length;
    b.send({ type, text }); await until(() => c.messages.some(m => m.type === 'event' && m.text?.includes(text)), `${type} still reaches third party`);
    assert.equal(c.messages.find(m => m.type === 'event' && m.text?.includes(text)).channel, type === 'chat' ? 'world' : 'party');
    assert(!a.messages.slice(before).some(m => m.type === 'event' && m.text?.includes(text)), `${type} ignored at recipient`);
  }
  const beforeWhispers = a.messages.filter(m => m.type === 'whisper').length;
  await unavailable(b, { type: 'whisper', targetId: a.id, text: 'blocked whisper' });
  assert.equal(a.messages.filter(m => m.type === 'whisper').length, beforeWhispers);
  await tick(); b.send({ type: 'whisper', targetId: c.id, text: 'visible whisper' });
  await until(() => c.messages.some(m => m.type === 'whisper' && m.text === 'visible whisper'), 'unaffected third-party whisper');
  a.send({ type: 'partyLeave' }); await until(() => !a.snapshot.party, 'leave party for invite suppression');
  for (const type of ['partyInvite', 'duelRequest', 'tradeRequest']) {
    const before = a.messages.length; await unavailable(b, { type, targetId: a.id });
    assert(!a.messages.slice(before).some(m => m.type === 'trade' && m.trade || m.type === 'snapshot' && (m.partyInvites.length || m.duelInvites.length)), `${type} sends no incoming invitation`);
  }
  await action(a, { type: 'ignoreRemove', targetId: b.id });
  await tick(); b.send({ type: 'duelRequest', targetId: a.id });
  await until(() => a.snapshot.duelInvites.length, 'unignoring restores real invitations');
  await action(a, { type: 'ignoreAdd', targetId: b.id }); await tick();
  assert.equal(a.snapshot.duelInvites.length, 0, 'ignoring clears previously delivered invitations');
  await action(a, { type: 'ignoreAdd', name: remote.name });
  await action(a, { type: 'friendAdd', name: cHero.name });
  await until(() => c.friends.incoming.some(p => p.id === a.id), 'request available to decline');
  await action(c, { type: 'friendRespond', targetId: a.id, accept: false });
  await until(() => !a.friends.outgoing.some(p => p.id === c.id), 'decline clears sender outgoing');
  assert(!c.friends.friends.length && !a.friends.friends.length);
  await action(a, { type: 'friendAdd', targetId: c.id });
  await action(a, { type: 'friendCancel', targetId: c.id });
  await until(() => !c.friends.incoming.some(p => p.id === a.id), 'sender cancellation removes recipient request');
  await action(a, { type: 'friendCancel', targetId: c.id });
  await action(c, { type: 'friendRespond', targetId: a.id, accept: true }, true);
  await action(a, { type: 'friendAdd', targetId: c.id });
  await action(c, { type: 'ignoreAdd', targetId: a.id });
  await until(() => !a.friends.outgoing.some(p => p.id === c.id), 'recipient ignore removes incoming request and sender outgoing');
  await action(c, { type: 'ignoreRemove', targetId: a.id });
  await action(a, { type: 'friendAdd', targetId: c.id });
  await action(a, { type: 'ignoreAdd', targetId: c.id });
  await until(() => !c.friends.incoming.some(p => p.id === a.id), 'sender ignore cancels their outgoing request');
  await action(a, { type: 'ignoreRemove', targetId: c.id });
  await action(a, { type: 'friendAdd', targetId: c.id });
  await action(c, { type: 'friendRespond', targetId: a.id, accept: true });
  await action(a, { type: 'friendRemove', targetId: c.id });
  await until(() => !c.friends.friends.some(p => p.id === a.id), 'removal removes both sides');
  await action(a, { type: 'friendRemove', targetId: c.id });
  await action(a, { type: 'friendAdd', targetId: c.id });
  await action(c, { type: 'friendRespond', targetId: a.id, accept: true });
  await action(a, { type: 'friendAdd', targetId: alt.id });
  for (const client of clients) privatePayloads(client);
  assert(c.messages.filter(m => m.type === 'friends').every(m => m.friends.every(p => p.id === a.id) && !m.ignored.some(p => p.id === b.id || p.id === remote.id)), 'another player never receives the owner lists');
  await stop(); await start();
  a = await connect(aToken, aHero.id); b = await connect(bToken, bHero.id);
  assert.deepEqual(a.friends.friends.map(p => [p.id, p.online]), [[cHero.id, false]], 'friendship survives restart and presence is fresh');
  assert.deepEqual(a.friends.ignored.map(p => p.id), [bHero.id, remote.id], 'ignore persists by character ID');
  assert(a.friends.outgoing.some(p => p.id === alt.id), 'offline pending request survives restart');
  a.send({ type: 'selectCharacter', characterId: alt.id }); await until(() => a.welcome.id === alt.id, 'offline recipient enters');
  await action(a, { type: 'friendRespond', targetId: aHero.id, accept: true });
  assert.deepEqual(a.friends.friends.map(p => [p.id, p.online]), [[aHero.id, false]], 'offline requester is accepted with fresh offline presence');
  a.send({ type: 'selectCharacter', characterId: aHero.id }); await until(() => a.welcome.id === aHero.id, 'return to requester');
  assert(a.friends.friends.some(p => p.id === alt.id) && !a.friends.outgoing.length);
  await action(a, { type: 'friendRemove', targetId: alt.id });
  await action(a, { type: 'friendAdd', targetId: a.id }, true);
  await unavailable(b, { type: 'whisper', targetId: a.id, text: 'still blocked after restart' });
  await action(a, { type: 'ignoreRemove', targetId: b.id });
  await action(a, { type: 'ignoreRemove', targetId: remote.id });
  await action(a, { type: 'friendRemove', targetId: cHero.id });
  await stop(); await start(); a = await connect(aToken, aHero.id);
  assert.deepEqual(a.friends.friends, []); assert.deepEqual(a.friends.ignored, [], 'removals survive restart');
  console.log('Friends and Ignore verified: explicit reciprocal consent, private offline requests/restarts, accept/decline/cancel, atomic rollback, authority/caps, name/ID lookup, realm presence and ignore suppression.');
} finally { await stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true }); }
