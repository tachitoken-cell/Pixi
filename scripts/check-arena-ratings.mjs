import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { ARENA_INITIAL_RATING, arenaRank, arenaRatingDelta, arenaRatingsValid, normalizeArenaRatings, arenaTeamPosition } from '../src/arena.ts';

const fresh = normalizeArenaRatings();
assert.equal(ARENA_INITIAL_RATING, 1000);
assert(arenaRatingsValid(fresh));
assert.deepEqual(fresh[1], { rating: 1000, wins: 0, losses: 0, draws: 0 });
assert.notEqual(fresh[1], fresh[2], 'Brackets never share mutable progress.');
assert.deepEqual(normalizeArenaRatings({ 2: { rating: 1500, wins: 5, losses: -1, draws: NaN } })[2], { rating: 1500, wins: 5, losses: 0, draws: 0 });
for (const invalid of [null, [], {}, { ...fresh, 4: fresh[1] }, { ...fresh, 2: { ...fresh[2], wins: -1 } }, { ...fresh, 1: { ...fresh[1], rating: 1.2 } }]) assert(!arenaRatingsValid(invalid));
assert.deepEqual([1199, 1200, 1400, 1600, 1800, 2000].map(arenaRank), ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master']);
assert.equal(arenaRatingDelta(1000, 1000, 1), 16);
assert.equal(arenaRatingDelta(1000, 1000, 0), -16);
assert.equal(arenaRatingDelta(1000, 1000, .5), 0);
assert(arenaRatingDelta(1000, 1400, 1) > arenaRatingDelta(1400, 1000, 1), 'Upsets grant more rating.');
assert(arenaRatingDelta(1000, 1400, .5) > 0, 'A draw against a stronger team improves MMR.');
for (const size of [1, 2, 3]) {
  const slots = Array.from({ length: size }, (_, slot) => arenaTeamPosition(0, slot, size));
  assert.equal(new Set(slots.map(p => p.z)).size, size);
  assert.equal(slots.reduce((sum, p) => sum + p.z, 0), 0);
  assert.deepEqual(slots.map(p => p.z), slots.map((_, slot) => arenaTeamPosition(1, slot, size).z));
}

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-arena-ratings-')), savePath = join(dataDir, 'players.json');
const tokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
const keys = tokens.map(token => createHash('sha256').update(token).digest('hex'));
const players = ['Amber', 'Briar'].map((name, i) => ({
  id: randomUUID(), name, zone: 'greenwood', coordinateVersion: 2, x: i * 2, z: 8, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Cleric' },
  characterCreated: true, talents: [], ...starterGear('Cleric'), hp: 100, maxHp: 100, level: 1, xp: 0, gold: 0,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 },
}));
writeFileSync(savePath, JSON.stringify(Object.fromEntries(players.map((p, i) => [keys[i], { characters: [p] }]))));
const realNow = Date.now;
let game, clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const clients = [];
async function until(test, label) {
  const deadline = realNow() + 5000;
  while (realNow() < deadline) { const result = test(); if (result) return result; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function start() {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' });
  const port = await game.start();
  return Promise.all(tokens.map(async (token, i) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [] };
    clients.push(client);
    client.send = message => socket.send(JSON.stringify(message));
    client.player = () => client.snapshot?.players.find(p => p.id === players[i].id);
    socket.on('message', raw => {
      const message = JSON.parse(raw); client.messages.push(message);
      if (['roster', 'snapshot'].includes(message.type)) client[message.type] = message;
    });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    client.send({ type: 'join', token }); await until(() => client.roster, 'roster');
    client.send({ type: 'selectCharacter', characterId: players[i].id }); await until(client.player, 'world entry');
    return client;
  }));
}
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
async function ratedMatch(a, b) {
  a.send({ type: 'arenaQueueJoin', size: 1 }); b.send({ type: 'arenaQueueJoin', size: 1 });
  const invite = await until(() => a.snapshot.arenaInvites[0], 'rated ready check');
  assert.equal(invite.rated, true);
  a.send({ type: 'arenaAccept', invitationId: invite.id }); b.send({ type: 'arenaAccept', invitationId: invite.id });
  await until(() => a.snapshot.arena?.phase === 'countdown' && b.snapshot.arena?.phase === 'countdown', 'rated match');
}
try {
  let [a, b] = await start();
  assert.deepEqual(a.player().arenaRatings, fresh, 'Legacy characters gain separate starting ratings.');
  a.send({ type: 'arenaQueueJoin', arenaRatings: { 1: { rating: 9999, wins: 99, losses: 0, draws: 0 } } });
  await until(() => a.messages.some(m => m.type === 'event' && /rating is controlled/.test(m.text)), 'rating spoof rejected');
  assert.equal(a.snapshot.arenaQueue, null);
  assert.deepEqual(a.player().arenaRatings, fresh);
  await ratedMatch(a, b);
  a.send({ type: 'arenaForfeit' });
  await until(() => a.snapshot.arena?.phase === 'finished' && b.snapshot.arena?.phase === 'finished', 'rated result');
  assert.deepEqual(a.player().arenaRatings[1], { rating: 984, wins: 0, losses: 1, draws: 0 });
  assert.deepEqual(b.player().arenaRatings[1], { rating: 1016, wins: 1, losses: 0, draws: 0 });
  assert.equal(a.snapshot.arena.ratingChange, -16); assert.equal(b.snapshot.arena.ratingChange, 16);
  a.send({ type: 'arenaForfeit' });
  await stop();
  const saved = JSON.parse(readFileSync(savePath, 'utf8'));
  assert.equal(saved[keys[0]].characters[0].arenaRatings[1].losses, 1, 'Duplicate result cannot count twice.');
  assert.equal(saved[keys[1]].characters[0].arenaRatings[1].rating, 1016, 'Rating writes use durable character persistence.');
  [a, b] = await start();
  assert.equal(a.player().arenaRatings[1].rating, 984, 'Rating survives server restart and reconnect.');
  assert.equal(b.player().arenaRatings[1].wins, 1);
  assert.deepEqual(a.player().arenaRatings[2], fresh[2], 'Solo results preserve other brackets.');
  assert.deepEqual(b.player().arenaRatings[3], fresh[3]);
  let before = [a, b].map(c => structuredClone(c.player().arenaRatings));
  a.send({ type: 'arenaRequest', targetId: players[1].id, size: 1 });
  const friendly = await until(() => b.snapshot.arenaInvites[0], 'unranked invitation');
  assert.equal(friendly.rated, false);
  b.send({ type: 'arenaAccept', invitationId: friendly.id });
  await until(() => a.snapshot.arena?.phase === 'countdown', 'unranked match');
  a.send({ type: 'arenaForfeit' });
  await until(() => a.snapshot.arena?.phase === 'finished' && b.snapshot.arena?.phase === 'finished', 'unranked result');
  assert.deepEqual([a, b].map(c => c.player().arenaRatings), before, 'Direct challenges do not grant rating or ranked statistics.');
  assert.equal(a.snapshot.arena.ratingChange, undefined);

  await ratedMatch(a, b);
  clockOffset += 306000;
  await until(() => a.snapshot.arena?.phase === 'finished' && b.snapshot.arena?.phase === 'finished', 'timeout draw');
  for (const [i, c] of [a, b].entries()) {
    assert.equal(c.snapshot.arena.winnerTeam, null);
    assert.equal(c.player().arenaRatings[1].draws, 1);
    assert.equal(c.player().arenaRatings[1].rating, before[i][1].rating + arenaRatingDelta(before[i][1].rating, before[1 - i][1].rating, .5));
  }
  before = [a, b].map(c => structuredClone(c.player().arenaRatings));
  await ratedMatch(a, b);
  b.socket.close();
  await until(() => a.snapshot.arena?.phase === 'finished', 'disconnect forfeit');
  assert.equal(a.player().arenaRatings[1].wins, before[0][1].wins + 1);
  await stop();
  [a, b] = await start();
  assert.equal(b.player().arenaRatings[1].losses, before[1][1].losses + 1, 'Disconnect forfeit survives reconnect.');

  before = [a, b].map(c => structuredClone(c.player().arenaRatings));
  await ratedMatch(a, b);
  await game.stop(); game = null;
  const interrupted = JSON.parse(readFileSync(savePath, 'utf8'));
  assert.deepEqual(keys.map(key => interrupted[key].characters[0].arenaRatings), before, 'Server shutdown must void unfinished matches without rating or win/loss changes.');
  console.log('Arena ratings passed: ranks, Elo, migration, spoof rejection, rated/unranked results, draws, disconnects and restart persistence.');
} finally { await stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true }); }
