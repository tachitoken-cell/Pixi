import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createTcpServer } from 'node:net';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { playerDatabaseFixture } from './fixture-player-database.mjs';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { BANKER } from '../src/city.ts';
import { ROOTVAULT_ENTRANCE } from '../src/dungeon.ts';
import { newContracts } from '../src/adventure.ts';
import { regionAt } from '../src/realm.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-realm-restart-')), clients = [], OriginalClient = pg.Client;
let game, port, releaseWrite, holdNext = false, failNext = false, ended = 0, writes = 0;
const hash = token => createHash('sha256').update(token).digest('hex');
function hero(name, point = { x: 0, z: 8 }) {
  return { id: randomUUID(), name, ...point, coordinateVersion: 2, zone: regionAt(point.x, point.z), rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, rootvaultUnlocked: true, talents: [], ...starterGear('Ranger'), level: 25, xp: 13, gold: 77, hp: 388, maxHp: 388,
    inventory: { wood: 10, crystal: 0, herb: 0, potion: 3, relic: 0 }, craftingXp: 0, contracts: newContracts(),
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } };
}
const heroes = { banker: hero('Bank transfer', { x: BANKER.x - 1.5, z: BANKER.z }), delver: hero('Vault return', ROOTVAULT_ENTRANCE), traveler: hero('Mount preparation'), roster: hero('Roster only') };
const tokens = Object.fromEntries(Object.keys(heroes).map(name => [name, randomBytes(32).toString('base64url')]));
let databaseRecords = Object.fromEntries(Object.entries(heroes).map(([name, p]) => [hash(tokens[name]), { characters: [p] }]));
const stored = name => databaseRecords[hash(tokens[name])].characters[0];
pg.Client = playerDatabaseFixture(databaseRecords, {
  beforeWrite: async () => {
    if (holdNext) { holdNext = false; await new Promise(resolve => { releaseWrite = resolve; }); releaseWrite = undefined; }
    if (failNext) { failNext = false; throw Object.assign(Error('simulated final persistence failure'), { code: '23514' }); }
  },
  onWrite: () => { writes++; },
  onEnd: () => { ended++; },
});
async function until(fn, label, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = fn(); if (result) return result; await delay(12); }
  throw Error(`Timed out: ${label}`);
}
async function start() {
  game = createGameServer({ port: port || 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: 'postgres://isolated-restart-fixture' });
  port = await game.start();
}
async function connect(name, enter = true) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, name, messages: [], closed: null }; clients.push(c);
  c.send = message => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
  c.player = () => c.snapshot?.players.find(p => p.id === heroes[name]?.id);
  socket.on('message', raw => { const message = JSON.parse(raw); if (message.type === 'snapshot') c.snapshot = message; else c.messages.push(message);
    if (['roster', 'welcome', 'realmStatus'].includes(message.type)) c[message.type] = message; });
  socket.on('close', (code, reason) => { c.closed = { code, reason: reason.toString() }; }); socket.on('error', () => {});
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[name], ...(enter && heroes[name] ? { characterId: heroes[name].id } : {}) });
  await until(() => c.player() || c.roster || c.closed, 'restart fixture join'); return c;
}
async function listenerStillOwned() {
  const other = createTcpServer();
  const code = await new Promise(resolve => { other.once('error', error => resolve(error.code)); other.listen(port, '127.0.0.1', () => { other.close(); resolve('unexpected listener'); }); });
  assert.equal(code, 'EADDRINUSE', 'the old authoritative listener is held until persistence and drain finish');
}
try {
  await start();
  let health = await fetch(`http://127.0.0.1:${port}/api/health`); assert.equal(health.status, 200); assert.equal((await health.json()).available, true);
  const banker = await connect('banker'), delver = await connect('delver'), traveler = await connect('traveler'), roster = await connect('roster', false);
  delver.send({ type: 'dungeonEnter' }); await until(() => delver.player().instanceId, 'delver enters actual dungeon');
  traveler.send({ type: 'move', x: .5, z: 8, rotation: .25 }); await until(() => traveler.player().x === .5, 'real movement accepted');
  traveler.send({ type: 'mount', mount: 'horse' }); await until(() => traveler.player().casting?.ability === 'mount', 'real mount preparation');
  await delay(1200); holdNext = true;
  banker.send({ type: 'bankDeposit', npcId: BANKER.id, item: { kind: 'resource', id: 'wood', quantity: 4 } });
  await until(() => releaseWrite, 'accepted bank transaction awaits durable acknowledgment'); assert.equal(banker.player().inventory.wood, 10);
  const indexes = new Map([banker, delver, traveler, roster].map(c => [c, c.messages.length]));
  let stopped = false; const stopping = game.stop(); assert.equal(game.stop(), stopping, 'repeated stop signals share the same pending save');
  stopping.then(() => { stopped = true; });
  await until(() => [banker, delver, traveler, roster].every(c => c.realmStatus?.available === false && c.messages.slice(indexes.get(c)).some(m => m.type === 'roster')), 'all authenticated clients receive unavailable roster');
  for (const c of [banker, delver, traveler, roster]) {
    const messages = c.messages.slice(indexes.get(c)); assert(messages.findIndex(m => m.type === 'realmStatus') < messages.findIndex(m => m.type === 'roster'), 'retirement status precedes roster so it cannot reenable entry');
    assert.equal(c.closed, null, 'socket remains available while an admitted write commits');
    assert(c.roster.characters.every(p => p.casting === null && p.gathering === null && p.instanceId === null));
  }
  assert.equal(delver.roster.characters[0].x, ROOTVAULT_ENTRANCE.x, 'dungeon exit is restored before character selection');
  health = await fetch(`http://127.0.0.1:${port}/api/health`); assert.equal(health.status, 503); const { ok, available, players, world } = await health.json(); assert.deepEqual({ ok, available, players, world }, { ok: false, available: false, players: 0, world: 'Mossvale' });
  assert.equal(health.headers.get('cache-control'), 'no-store'); await listenerStillOwned(); assert.equal(stopped, false); assert.equal(ended, 0);
  // Entry and mutations on existing sockets, and a newly verified guest join, cannot race the drain.
  banker.send({ type: 'selectCharacter', characterId: heroes.banker.id }); banker.send({ type: 'createCharacter', name: 'Drain race', appearance: heroes.banker.appearance });
  traveler.send({ type: 'move', x: 1, z: 8, rotation: 0 });
  const late = await connect('banker'); assert.equal(late.closed.code, 1012); assert.equal(late.realmStatus.available, false); assert.equal(late.welcome, undefined); assert.equal(late.roster, undefined);
  releaseWrite(); await stopping; await until(() => [banker, delver, traveler, roster].every(c => c.closed), 'service restart close frames');
  for (const c of [banker, delver, traveler, roster]) assert.deepEqual(c.closed, { code: 1012, reason: 'Service Restart' });
  assert.equal(banker.roster.characters[0].inventory.wood, 6, 'final roster includes the acknowledged transaction');
  assert.equal(banker.roster.characters.length, 1, 'new characters were not admitted during draining');
  assert.equal(stored('banker').inventory.wood, 6); assert.equal(stored('banker').bank.resources.wood, 4, 'both sides of the bank transfer persist exactly once');
  assert.deepEqual([stored('traveler').x, stored('traveler').z, stored('traveler').rotation], [.5, 8, .25], 'late movement is ignored');
  assert.equal(stored('delver').x, ROOTVAULT_ENTRANCE.x); assert.equal(stored('delver').z, ROOTVAULT_ENTRANCE.z); assert.equal(ended, 1); assert(writes > 0);
  game = null;
  await start(); const resumed = await connect('banker', false); assert.equal(resumed.realmStatus, undefined); assert.equal(resumed.welcome, undefined, 'reconnect may safely stay at the private roster');
  resumed.send({ type: 'selectCharacter', characterId: heroes.banker.id }); await until(() => resumed.player(), 'entry resumes after availability returns'); assert.equal(resumed.player().inventory.wood, 6);
  const restoredDelver = await connect('delver'); assert.equal(restoredDelver.player().instanceId, null); assert.equal(restoredDelver.player().x, ROOTVAULT_ENTRANCE.x);
  const silent = await connect('roster', false); silent.socket._socket.pause(); // A real peer that does not read/ack the close frame.
  const before = Date.now(); await game.stop(); assert(Date.now() - before < 3500, 'unresponsive peers cannot make socket draining unbounded');
  silent.socket._socket.resume(); game = null;
  await start(); const moving = await connect('traveler');
  await delay(150); // Let initial shared-store synchronization finish before staging unsaved movement.
  moving.send({ type: 'move', x: 1, z: 8, rotation: .5 }); await until(() => moving.player().x === 1, 'unsaved final movement');
  assert.equal(stored('traveler').x, .5, 'the final movement has not reached durable storage');
  failNext = true; await assert.rejects(game.stop(), /simulated final persistence failure/, 'a failed final save is never reported as successful shutdown');
  await until(() => moving.closed, 'failed save still releases socket resources'); assert.equal(moving.closed.code, 1012); assert.equal(stored('traveler').x, .5); game = null;
  console.log('PASS realm restart: unavailable health/admission, ordered roster handoff, accepted atomic transfer and dungeon return preserved, repeated stop promise, final save before 1012, bounded unresponsive-peer shutdown, explicit save failure and same-port restart with manual world entry.');
} finally {
  releaseWrite?.(); for (const client of clients) { client.socket._socket?.resume(); client.socket.terminate(); }
  try { await game?.stop(); } catch {} pg.Client = OriginalClient; rmSync(dir, { recursive: true, force: true });
}
