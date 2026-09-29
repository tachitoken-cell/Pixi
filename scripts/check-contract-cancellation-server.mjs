import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-contract-cancel-')), file = join(dataDir, 'players.json');
const token = randomBytes(32).toString('base64url'), recordKey = createHash('sha256').update(token).digest('hex');
const realNow = Date.now, clients = [];
let offset = 0, game, port;
Date.now = () => realNow() + offset;
const player = {
  id: randomUUID(), name: 'Cancellation', coordinateVersion: 2, zone: 'greenwood', x: 0, z: 8, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, talents: [], ...starterGear('Ranger'), hp: 688, maxHp: 688, level: 50, xp: 7, gold: 40,
  inventory: { wood: 40, crystal: 40, potion: 10, herb: 40, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0,
  contracts: { active: { 'greenwood-hunt': 2, 'greenwood-tonics': 2, 'amberwild-hunt': 1 }, completed: { 'greenwood-hunt': Date.now() - 1000, 'hollow-vault': Date.now() + 300000 } },
  quest: { chapter: 0, stage: 1, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null },
};
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { if (predicate()) return; await delay(15); }
  throw new Error(`Timed out: ${label}`);
}
async function advance() { offset += 1000; await delay(115); }
async function start() {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start();
}
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], snapshot: null }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message));
  c.player = () => c.snapshot?.players.find(p => p.id === player.id);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (message.type === 'snapshot') c.snapshot = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.messages.some(m => m.type === 'roster'), 'account roster');
  c.send({ type: 'selectCharacter', characterId: player.id }); await until(() => c.player(), 'selected character snapshot');
  return c;
}

try {
  writeFileSync(file, JSON.stringify({ [recordKey]: { characters: [player] } }));
  await start(); const c = await connect(), before = structuredClone(c.player());
  const rewardCount = c.messages.filter(m => m.kind === 'reward').length;
  for (const contractId of [null, [], {}, ['greenwood-hunt'], '', 'forged', '__proto__', 'greenwood-herbs']) c.send({ type: 'cancelContract', contractId });
  c.send({ type: 'cancelContract' }); c.send({ type: 'cancelContract', contractId: 'greenwood-hunt', progress: 0 });
  await advance(); assert.deepEqual(c.player().contracts, before.contracts, 'malformed, extra-field and unaccepted IDs cannot mutate state');
  c.send({ type: 'cancelContract', contractId: 'greenwood-hunt' });
  c.send({ type: 'cancelContract', contractId: 'greenwood-tonics' });
  await until(() => Object.keys(c.player().contracts.active).length === 1, 'partial and ready contracts cancelled away from a board');
  c.send({ type: 'cancelContract', contractId: 'greenwood-tonics' });
  c.send({ type: 'acceptContract', contractId: 'greenwood-tonics' }); await advance();
  const cancelled = { active: { 'amberwild-hunt': 1 }, completed: before.contracts.completed };
  assert.deepEqual(c.player().contracts, cancelled, 'replay is harmless, history survives and acceptance still requires a board');
  for (const point of [{ x: 1.5, z: 6 }, { x: 3, z: 4 }]) {
    offset += 400; c.send({ type: 'move', ...point, rotation: 0 });
    await until(() => Math.hypot(c.player().x - point.x, c.player().z - point.z) < .02, 'walk to the board');
  }
  c.send({ type: 'claimContract', contractId: 'greenwood-tonics' }); await advance();
  for (const field of ['gold', 'xp', 'inventory', 'skills', 'craftingXp', 'achievements', 'quest']) assert.deepEqual(c.player()[field], before[field], `cancellation and a forged claim preserve ${field}`);
  assert.equal(c.messages.filter(m => m.kind === 'reward').length, rewardCount, 'cancelling ready work grants no reward');
  c.send({ type: 'acceptContract', contractId: 'greenwood-tonics' });
  await until(() => c.player().contracts.active['greenwood-tonics'] === 0, 'cancelled contract accepted immediately from zero at its board');
  c.send({ type: 'cancelContract', contractId: 'greenwood-tonics' });
  await until(() => !Object.hasOwn(c.player().contracts.active, 'greenwood-tonics'), 'fresh contract cancelled before disconnect');
  await game.stop();
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8'))[recordKey].characters[0].contracts, cancelled, 'cancellation and history are saved');
  await start(); const restored = await connect();
  assert.deepEqual(restored.player().contracts, cancelled, 'cancellation survives server restart and reconnection');
  console.log('PASS: strict contract cancellation requests; partial and ready cancellation away from boards; no rewards or new cooldown; unrelated state and history preserved; fresh board acceptance; saved cancellation survives restart.');
} finally {
  for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true });
}
