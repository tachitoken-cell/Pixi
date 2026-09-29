import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-character-names-')), file = join(dataDir, 'players.json'), clients = [];
const realNow = Date.now, reservedError = 'Choose an adventurer name without staff titles such as Admin, GM or Owner.';
let game, port, offset = 0;
Date.now = () => realNow() + offset;
async function until(predicate, label) {
  const end = realNow() + 4000;
  while (realNow() < end) { const result = predicate(); if (result) return result; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token, role: 'gm' }); await until(() => client.roster, 'joined roster');
  client.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION });
  await until(() => client.community?.accepted, 'community rules accepted'); return client;
}
async function create(client, name) {
  const count = client.roster.characters.length;
  client.send({ type: 'createCharacter', name, appearance: DEFAULT_APPEARANCE });
  await until(() => client.roster.characters.length === count + 1, `created ${name}`);
  assert.equal(client.roster.characters.at(-1).name, name.trim());
}
async function rejected(client, name, expected) {
  const before = structuredClone(client.roster.characters), from = client.messages.length;
  offset += 650; // Pass the existing server feedback throttle without slowing the check.
  client.send({ type: 'createCharacter', name, appearance: DEFAULT_APPEARANCE, role: 'gm' });
  const reply = await until(() => client.messages.slice(from).find(message => ['event', 'roster'].includes(message.type)), `rejected ${JSON.stringify(name)}`);
  assert.equal(reply.type, 'event', `${JSON.stringify(name)} cannot create a character`);
  assert.equal(reply.text, expected);
  client.roster = null; client.send({ type: 'leaveWorld' }); await until(() => client.roster, 'fresh roster after rejection');
  assert.deepEqual(client.roster.characters, before, 'rejected requests do not change existing characters or consume slots');
  assert.equal(client.welcome, undefined, 'creation never enters the world');
}
async function selectLegacy(client, id) {
  client.send({ type: 'selectCharacter', characterId: id });
  const player = await until(() => client.snapshot?.players.find(p => p.id === id), 'legacy reserved character selected');
  assert.equal(client.welcome.id, id); assert.equal(player.name, 'Admin'); assert.equal(player.role, 'player', 'reserved names do not grant a staff role');
}
try {
  await start(); const client = await connect(), token = client.roster.token;
  for (const name of ['Dan', ' Icey ', '林间旅人']) await create(client, name);
  for (const name of ['Admin', 'ADMIN', 'administrator', 'GM', 'Game Master', 'owner', 'mod', 'moderator', 'dev', 'developer', 'support', 'staff', 'system', ' Admin42 ', 'a_d-m i n', 'G-M_7', 'g4m3_m4st3r', '0wner', 'm0derat0r', 'AdminDan', 'GM_Dan', 'ModeratorDan', 'Dan Admin', 'G_M_Dan', 'a_d_m_i_n', '4dm1n42', 'd3v', 'm0d', 'DEV_Dan', 'DevDan', 'D_E_V_Dan', 'GameMasterDan', '管理员', '管理员小林', '遊戲管理員', '官方小林', 'GM小林']) await rejected(client, name, reservedError);
  for (const name of [undefined, null, 123, ['Admin'], {}, '', 'A', 'X'.repeat(21), '<Admin>', 'Ad\u0000min', 'Ad\u200bmin', '\u0410dmin']) await rejected(client, name, 'Use 2–20 English letters, Chinese characters, numbers, spaces, hyphens or underscores.');
  for (const name of ['Devin', 'Modric', 'Devon']) await create(client, name);
  assert.equal(client.roster.characters.length, 6, 'rejections leave all six slots usable');
  await game.stop(); game = null;

  // Exercise the actual pre-roster save migration with an existing reserved identity.
  const records = JSON.parse(readFileSync(file, 'utf8')), key = createHash('sha256').update(token).digest('hex');
  assert.equal(records[key].characters[2].name, '林间旅人', 'Chinese name survives final save');
  await start(); const rejoined = await connect(token); assert.equal(rejoined.roster.characters[2].name, '林间旅人', 'Chinese name survives reload'); await game.stop(); game = null;
  const legacy = { ...records[key].characters[0], name: 'Admin' }; records[key] = legacy;
  writeFileSync(file, JSON.stringify(records));
  await start(); await selectLegacy(await connect(token), legacy.id); await game.stop(); game = null;
  const saved = JSON.parse(readFileSync(file, 'utf8'))[key];
  assert.equal(saved.characters[0].name, 'Admin'); assert.equal(saved.characters[0].id, legacy.id);
  await start(); await selectLegacy(await connect(token), legacy.id);
  console.log('PASS character names: staff titles, case/separator/digit/leet/prefix variants and malformed socket input rejected without roster changes; normal names and all six slots accepted; existing reserved identity loads, selects, saves and restarts without privileges.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true });
}
