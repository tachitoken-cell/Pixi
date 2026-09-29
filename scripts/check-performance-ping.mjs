import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-performance-ping-'));
const realNow = Date.now, messages = [];
let clock = realNow(), game, socket;
Date.now = () => clock;
async function until(predicate, label) {
  const deadline = realNow() + 5000;
  while (realNow() < deadline) { const result = predicate(); if (result) return result; await delay(10); }
  throw new Error(`Timed out: ${label}`);
}
const send = message => socket.send(JSON.stringify(message));
const pongs = () => messages.filter(message => message.type === 'pong');
try {
  game = createGameServer({ databaseUrl: '', port: 0, host: '127.0.0.1', dataDir, keycloak: null });
  const port = await game.start();
  socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  send({ type: 'ping', id: 1 });
  await until(() => messages.some(message => message.type === 'event' && /Sign in/.test(message.text)), 'unjoined request rejected');
  assert.equal(pongs().length, 0);
  send({ type: 'join' });
  await until(() => messages.some(message => message.type === 'roster'), 'account joined');
  for (const id of [0, 17, Number.MAX_SAFE_INTEGER]) send({ type: 'ping', id });
  await until(() => pongs().length === 3, 'valid echoes');
  assert.deepEqual(pongs(), [0, 17, Number.MAX_SAFE_INTEGER].map(id => ({ type: 'pong', id })));
  clock += 1001;
  for (const message of [
    { type: 'ping' }, ...[-1, .5, Number.MAX_SAFE_INTEGER + 1, null, '17', {}, []].map(id => ({ type: 'ping', id })),
    { type: 'ping', id: 17, extra: true }, { type: 'ping', id: 17, gold: 999 },
  ]) send(message);
  send({ type: 'ping', id: 99 });
  await until(() => pongs().at(-1)?.id === 99, 'validation barrier');
  assert.equal(pongs().length, 4, 'invalid IDs and extra fields never receive pong');
  assert(messages.some(message => message.type === 'event' && message.requestType === 'ping' && /Invalid ping/.test(message.text)));
  clock += 1001;
  const limited = () => messages.filter(message => message.type === 'event' && /Too many actions/.test(message.text));
  for (let id = 100; id < 231; id++) send({ type: 'ping', id });
  await until(() => limited().length === 1, 'action burst limit');
  assert.equal(pongs().length, 134, 'only 130 probes are accepted from a full action bucket');
  assert.equal(pongs().at(-1).id, 229);
  clock += 1000;
  for (let id = 300; id < 366; id++) send({ type: 'ping', id });
  await until(() => limited().length === 2, 'sustained action limit');
  assert.equal(pongs().length, 199, 'only 65 probes replenish per second after the burst');
  assert.equal(pongs().at(-1).id, 364);
  clock += 1000;
  send({ type: 'ping', id: 400 });
  await until(() => pongs().at(-1)?.id === 400, 'probe after rate recovery');
  assert.equal(messages.filter(message => message.type === 'roster').length, 1, 'ping does not rebuild the roster');
  assert(!messages.some(message => message.type === 'snapshot' || message.type === 'welcome'), 'ping does not enter the world');
  console.log('Performance ping: joined-only exact echoes, bounded validation, 130-action burst, 65/s refill and recovery passed.');
} finally {
  socket?.terminate();
  await game?.stop();
  Date.now = realNow;
  rmSync(dataDir, { recursive: true, force: true });
}
