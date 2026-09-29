import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { spawn } from 'node:child_process';
import timers from 'node:timers/promises';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-shutdown-warning-')), clients = [];
let game, child, elapsed = 0, waiting;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, attempts = 500) {
  for (let i = 0; i < attempts; i++) { if (predicate()) return; await delay(10); }
  throw Error('Timed out waiting for shutdown warning');
}
async function connect(port, joinRealm = true) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [], closed: null };
  clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.warnings = () => client.messages.filter(m => m.type === 'shutdownWarning').map(m => m.secondsRemaining);
  socket.on('message', raw => { const m = JSON.parse(raw); client.messages.push(m); client[m.type] = m; });
  socket.on('close', code => { client.closed = code; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  if (joinRealm) {
    client.send({ type: 'join' }); await until(() => client.roster);
    client.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION }); await until(() => client.community?.accepted);
  }
  return client;
}
async function advance(ms) {
  elapsed += ms;
  const previous = waiting; waiting = undefined; assert(previous); previous.resolve();
  await new Promise(setImmediate);
}
function fakeClock() {
  elapsed = 0; waiting = undefined;
  mock.method(performance, 'now', () => elapsed);
  mock.method(timers, 'setTimeout', (ms, value, { signal }) => new Promise(resolve => {
    const done = () => { signal.removeEventListener('abort', done); resolve(value); };
    signal.addEventListener('abort', done, { once: true }); waiting = { ms, resolve: done };
  }));
}
const healthAt = async port => (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json());
try {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' });
  const port = await game.start(), player = await connect(port), roster = await connect(port), unjoined = await connect(port, false);
  player.send({ type: 'createCharacter', name: 'Willow', appearance: DEFAULT_APPEARANCE });
  await until(() => player.roster.characters.length);
  const id = player.roster.characters[0].id;
  player.send({ type: 'selectCharacter', characterId: id }); await until(() => player.snapshot);
  fakeClock();
  const shutdown = game.scheduleShutdown();
  assert.equal(game.scheduleShutdown(), shutdown, 'repeated rollout triggers do not restart the deadline');
  await until(() => player.warnings().length === 1 && roster.warnings().length === 1);
  assert.deepEqual(player.warnings(), [300]); assert.equal(waiting.ms, 60000);
  // An early timer must not send an extra 241-second warning.
  await advance(59999); assert.equal(waiting.ms, 1); await delay(15); assert.deepEqual(player.warnings(), [300]);
  await advance(1); await until(() => player.warnings().at(-1) === 240);
  await advance(60000); await until(() => player.warnings().at(-1) === 180);
  elapsed += 43000;
  const late = await connect(port); await until(() => late.warnings().length);
  assert.deepEqual(late.warnings(), [137], 'late arrivals receive the remaining time without resetting the realm countdown');
  assert(late.messages.findIndex(m => m.type === 'shutdownWarning') < late.messages.findIndex(m => m.type === 'roster'), 'warning arrives before roster can trigger automatic updates');
  await advance(17000); await until(() => player.warnings().at(-1) === 120);
  await advance(60000); await until(() => player.warnings().at(-1) === 60);
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200); assert.equal((await health.json()).available, true);
  const p = player.snapshot.players.find(p => p.id === id), rotation = p.rotation + .25;
  player.send({ type: 'move', x: p.x, z: p.z, rotation });
  await until(() => player.snapshot.players.find(p => p.id === id)?.rotation === rotation);
  assert.equal(player.closed, null, 'players keep playing until the deadline');
  assert.equal(waiting.ms, 50000); await advance(50000);
  for (let n = 10; n >= 1; n--) {
    await until(() => player.warnings().at(-1) === n);
    assert.equal(waiting.ms, 1000);
    if (n > 1) await advance(1000);
  }
  assert.deepEqual(player.warnings(), [300, 240, 180, 120, 60, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(roster.warnings(), player.warnings(), 'character selection also receives every warning');
  assert.deepEqual(unjoined.warnings(), [], 'only admitted accounts receive rollout broadcasts');
  await advance(1000); await shutdown;
  assert.equal(elapsed, 300000); await until(() => player.closed === 1012);
  assert.equal(player.realmStatus.available, false);
  const records = JSON.parse(readFileSync(join(dir, 'players.json'), 'utf8'));
  assert.equal(Object.values(records).flatMap(a => a.characters).find(p => p.id === id).rotation, rotation, 'play during warning is saved by the normal shutdown');
  mock.restoreAll(); game = null;
  // A held notice expires into a playable, admitted realm until a separate commit arrives.
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' });
  const heldPort = await game.start(), heldPlayer = await connect(heldPort);
  heldPlayer.send({ type: 'createCharacter', name: 'Juniper', appearance: DEFAULT_APPEARANCE });
  await until(() => heldPlayer.roster.characters.length);
  const heldId = heldPlayer.roster.characters[0].id;
  heldPlayer.send({ type: 'selectCharacter', characterId: heldId }); await until(() => heldPlayer.snapshot);
  assert.deepEqual((await healthAt(heldPort)).deploymentWarning, { version: 1, id: null, startedAt: null, secondsRemaining: 0, held: false });
  fakeClock();
  const notice = game.warnForShutdown();
  assert.match(notice.id, /^[a-f0-9-]{36}$/); assert(Number.isSafeInteger(notice.startedAt));
  assert.deepEqual((await healthAt(heldPort)).deploymentWarning, notice); assert.equal(notice.held, true); assert.equal(notice.secondsRemaining, 300);
  for (const seconds of [240,180,120,60,0]) { await advance(60000); await until(() => heldPlayer.warnings().at(-1) === seconds); }
  assert.deepEqual(heldPlayer.warnings(), [300,240,180,120,60,0]);
  assert(heldPlayer.messages.filter(m => m.type === 'shutdownWarning').every(m => m.held === true));
  elapsed += 120000;
  assert.equal((await healthAt(heldPort)).available, true); assert.equal(heldPlayer.closed, null);
  const heldLate = await connect(heldPort);
  assert.equal(heldLate.shutdownWarning.secondsRemaining, 0); assert.equal(heldLate.shutdownWarning.held, true);
  assert(heldLate.messages.findIndex(m => m.type === 'shutdownWarning') < heldLate.messages.findIndex(m => m.type === 'roster'));
  const heldState = heldPlayer.snapshot.players.find(p => p.id === heldId), heldRotation = heldState.rotation + .4;
  heldPlayer.send({ type: 'move', x: heldState.x, z: heldState.z, rotation: heldRotation });
  await until(() => heldPlayer.snapshot.players.find(p => p.id === heldId)?.rotation === heldRotation);
  const expiredCommit = game.scheduleShutdown();
  assert.equal(game.cancelShutdownWarning(), false, 'a committed notice cannot be canceled');
  assert.equal(game.warnForShutdown().id, notice.id, 'new warning signals cannot reset a committed notice');
  await expiredCommit; await until(() => heldPlayer.closed === 1012);
  assert.equal(elapsed, 420000, 'committing an expired held warning adds no new delay');
  const heldRecords = JSON.parse(readFileSync(join(dir, 'players.json'), 'utf8'));
  assert.equal(Object.values(heldRecords).flatMap(a => a.characters).find(p => p.id === heldId).rotation, heldRotation);
  mock.restoreAll(); game = null;
  // A new held signal earns a full new warning; canceling it does not close or retire clients.
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' });
  const resetPort = await game.start(), resetPlayer = await connect(resetPort);
  fakeClock();
  const first = game.warnForShutdown(); await advance(60000);
  const second = game.warnForShutdown();
  assert.notEqual(second.id, first.id); assert.equal(second.secondsRemaining, 300);
  await advance(60000); assert.equal((await healthAt(resetPort)).deploymentWarning.secondsRemaining, 240);
  assert.equal(game.cancelShutdownWarning(), true); assert.equal(game.cancelShutdownWarning(), false);
  await until(() => resetPlayer.warnings().at(-1) === null);
  assert.deepEqual((await healthAt(resetPort)).deploymentWarning, { version: 1, id: null, startedAt: null, secondsRemaining: 0, held: false });
  assert.equal(resetPlayer.closed, null); assert(!resetPlayer.realmStatus);
  const third = game.warnForShutdown(); await advance(60000);
  let completed = false;
  const earlyCommit = game.scheduleShutdown(); earlyCommit.then(() => { completed = true; });
  assert.equal(game.scheduleShutdown(), earlyCommit); assert.equal(game.cancelShutdownWarning(), false);
  const committed = (await healthAt(resetPort)).deploymentWarning;
  assert.deepEqual(committed, { ...third, secondsRemaining: 240, held: false });
  assert.equal(game.warnForShutdown().id, third.id);
  await advance(239999); await until(() => resetPlayer.warnings().at(-1) === 1);
  assert.equal(completed, false); assert.equal(resetPlayer.closed, null); assert.equal(waiting.ms, 1);
  await advance(1); await earlyCommit; await until(() => resetPlayer.closed === 1012);
  assert.equal(elapsed, 420000, 'commit waits exactly the remainder of the latest held notice');
  mock.restoreAll(); game = null;
  // A normal host termination can still save immediately and settles the pending countdown.
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' });
  await game.start(); const interrupted = game.scheduleShutdown(); await game.stop(); await interrupted;
  game = null;
  child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', exit;
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  child.on('exit', (code, signal) => { exit = { code, signal }; });
  await until(() => /listening on http:\/\/localhost:\d+/.test(output) || exit, 15000);
  assert.equal(exit, undefined, output);
  const signaled = await connect(Number(output.match(/localhost:(\d+)/)[1]));
  child.kill('SIGUSR1'); await until(() => signaled.shutdownWarning?.held);
  const signalPort = Number(output.match(/localhost:(\d+)/)[1]), firstSignal = (await healthAt(signalPort)).deploymentWarning;
  child.kill('SIGUSR1'); await until(() => signaled.warnings().length === 2);
  const secondSignal = (await healthAt(signalPort)).deploymentWarning;
  assert.notEqual(secondSignal.id, firstSignal.id, 'each real held signal starts a fresh notice');
  child.kill('SIGHUP'); await until(() => signaled.warnings().at(-1) === null);
  assert.equal((await healthAt(signalPort)).deploymentWarning.id, null);
  signaled.messages.length = 0;
  child.kill('SIGUSR2'); await until(() => signaled.warnings().length);
  child.kill('SIGUSR2'); child.kill('SIGHUP'); child.kill('SIGUSR1'); await delay(50);
  assert.deepEqual(signaled.warnings(), [300], 'real repeated rollout signals share one countdown');
  assert.equal((await healthAt(signalPort)).deploymentWarning.held, false);
  child.kill('SIGTERM'); await until(() => exit);
  assert.deepEqual(exit, { code: 0, signal: null }); assert.equal(signaled.closed, 1012);
  console.log('PASS shutdown warning: legacy five-minute cadence, held expiry with continued gameplay, fresh IDs, cancellation, early/late commit, late joins, durable 1012 shutdown, real signals and immediate host-stop cleanup.');
} finally {
  if (child?.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  mock.restoreAll(); for (const client of clients) client.socket.terminate();
  await game?.stop(); rmSync(dir, { recursive: true, force: true });
}
