import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';
import { WebSocket, WebSocketServer } from 'ws';
import { createLootTrace } from '../src/loot-trace.mjs';
import { starterGear } from '../src/progression.ts';
import { rollMonsterLoot, lootRows } from '../src/loot-items.ts';
import { dungeonStages } from '../src/dungeon.ts';

// Run the actual shared send helper against TCP sockets whose peer stops reading.
const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'), warnings = [];
const send = vm.runInNewContext(source.slice(source.indexOf('const send ='), source.indexOf('const nonnegativeInteger =')) + '\nsend;', {
  WebSocket, Buffer, console: { warn: message => warnings.push(message) },
});
const compression = [], recorder = { readyState: WebSocket.OPEN, bufferedAmount: 0, send: (_data, options) => compression.push(options?.compress) };
send(recorder, { type: 'snapshot' });
send(recorder, { type: 'roster', token: 'private-session' });
send(recorder, { type: 'event', text: 'chat' });
assert.deepEqual(compression, [true, false, false], 'only world snapshots enter compression; credentials and chat do not share it');
const server = new WebSocketServer({ host: '127.0.0.1', port: 0,
  perMessageDeflate: { clientNoContextTakeover: true,
    zlibDeflateOptions: { level: 6 }, concurrencyLimit: 4, threshold: 1024 } }), peers = [], clients = [];
server.on('connection', socket => { peers.push(socket); socket.on('error', () => {}); });
async function until(predicate, label) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { if (predicate()) return; await delay(5); }
  throw Error(`Timed out: ${label}`);
}
async function connect(compress = true) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { perMessageDeflate: compress }), client = { socket, snapshots: 0, latest: -1, reply: null };
  clients.push(client); socket.on('error', () => {});
  socket.on('message', data => {
    const message = JSON.parse(data);
    if (message.type === 'snapshot') { client.snapshots++; client.latest = message.sequence; }
    if (message.type === 'lootResult') client.reply = message;
    if (message.type === 'gmLootTrace') client.report = message.report;
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return client;
}
try {
  await new Promise(resolve => server.once('listening', resolve));
  const slow = await connect(), healthy = await connect(false);
  await until(() => peers.length === 2, 'both peers connected');
  assert(slow.socket.extensions.includes('permessage-deflate'), 'stalled-reader test negotiates compression');
  assert.equal(healthy.socket.extensions, '', 'plain healthy reader remains supported');
  slow.socket._socket.pause();
  const padding = randomBytes(48 * 1024).toString('base64');
  let sequence = 0, maximum = 0;
  for (; sequence < 500; sequence++) {
    const snapshot = { type: 'snapshot', sequence, padding };
    send(peers[0], snapshot); send(peers[1], snapshot);
    maximum = Math.max(maximum, peers[0].bufferedAmount);
    await delay(1);
  }
  assert(maximum > 256 * 1024, 'the unread peer creates real TCP backpressure');
  assert(maximum < 384 * 1024, 'replaceable snapshots retain at most the watermark plus one frame');
  assert.equal(peers[0].readyState, WebSocket.OPEN, 'snapshot lag alone does not disconnect the player');
  assert(healthy.snapshots > 100, 'a slow peer does not stall healthy updates');
  const reply = { type: 'lootResult', requestId: 'persisted-pickup', success: true };
  send(peers[0], reply);
  // Fill the real trace store to its event cap with a large authored loot-roll event.
  const player = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Trace size fixture', level: 60,
    appearance: { className: 'Ranger' }, ...starterGear('Ranger') }, rolls = [];
  const stage = dungeonStages('nightroot').find(stage => stage.level === 27 && stage.enemies.some(enemy => enemy.kind === 'root-warden'));
  assert(stage, 'large authored dungeon loot source exists');
  const items = rollMonsterLoot('root-warden', stage.level, player, () => .00012345678901234567,
    { worldBoss: false, instanceId: player.id, dungeonKind: 'nightroot', trace: detail => rolls.push(detail) });
  const trace = createLootTrace({ realmId: 'eu' }); trace.start(player, player.id);
  for (let i = 0; i < 999; i++) trace.write(player.id, 'generated', { dropId: player.id,
    enemy: { id: player.id + '-' + stage.id + '-0-0', kind: 'root-warden', level: stage.level, instanceId: player.id }, killer: true,
    map: { eligible: false, roll: null, chancePercent: 1, awarded: false, reason: 'ineligible_source' },
    rolls, items: lootRows({ gold: 100, relic: 5, items }), bags: { used: 120, capacity: 120, minimumQuality: 'uncommon' } });
  const report = trace.report(player.id), exportBytes = Buffer.byteLength(JSON.stringify({ type: 'gmLootTrace', report }));
  assert.equal(report.events.length, 1000); assert(exportBytes > 3 * 1024 * 1024, 'representative full trace exercises a large reliable frame');
  assert(peers[0].bufferedAmount > 256 * 1024, 'full trace is queued behind real snapshot backpressure');
  send(peers[0], { type: 'gmLootTrace', report });
  slow.socket._socket.resume();
  await until(() => slow.reply?.requestId === reply.requestId && peers[0].bufferedAmount === 0, 'reliable reply and backlog drain');
  assert.deepEqual(slow.reply, reply, 'successful persistence acknowledgment survives skipped snapshots');
  send(peers[0], { type: 'snapshot', sequence: ++sequence });
  await until(() => slow.latest === sequence, 'resumed reader receives current authoritative state');

  await until(() => slow.report?.events?.length === 1000, 'full GM loot trace export');
  assert.deepEqual(slow.report, report, 'the complete 1000-event report survives the queue guard');
  assert.equal(peers[0].readyState, WebSocket.OPEN);

  slow.socket._socket.pause();
  for (let i = 0; i < 500 && peers[0].readyState === WebSocket.OPEN; i++) {
    send(peers[0], { type: 'gmLootTrace', report: { padding } });
    assert(peers[0].bufferedAmount <= 8 * 1024 * 1024, 'reliable traffic has a strict queue bound');
    send(peers[1], { type: 'snapshot', sequence: ++sequence });
    await delay(1);
  }
  await until(() => peers[0].readyState === WebSocket.CLOSED, 'reliable overflow closes only the slow socket');
  assert.equal(warnings.length, 1, 'one bounded diagnostic per disconnected slow peer');
  assert(!warnings[0].includes('persisted-pickup') && !warnings[0].includes(padding), 'diagnostic contains no message data');
  await until(() => healthy.latest === sequence, 'healthy peer still receives updates after slow-peer closure');
  assert.equal(peers[1].readyState, WebSocket.OPEN);
  console.log(`PASS WebSocket backpressure: bounded snapshots, healthy traffic, pickup reply, current-state catch-up, full 1000-event GM export (${exportBytes} bytes), bounded reliable queue and isolated slow-peer closure.`);
} finally {
  for (const client of clients) client.socket.terminate();
  for (const peer of peers) peer.terminate();
  await new Promise(resolve => server.close(resolve));
}
