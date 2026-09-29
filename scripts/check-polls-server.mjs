import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { POLL_BOOTHS } from '../src/poll-booths.ts';
import { canTraverse } from '../src/realm.ts';
import { starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newContracts } from '../src/adventure.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-polls-server-')), clients = [], realNow = Date.now, epoch = realNow();
let game, port, offset = 0;
Date.now = () => realNow() + offset;
const booth = POLL_BOOTHS[0], key = token => createHash('sha256').update(token).digest('hex');
const poll = { id: 'fixture-poll', title: 'Server fixture', description: 'Tests only.', opensAt: epoch - 1000, closesAt: epoch + 120000, questions: [{ id: 'one', text: 'First?' }, { id: 'two', text: 'Second?' }] };
const upcoming = { ...poll, id: 'future-poll', opensAt: epoch + 130000, closesAt: epoch + 180000 };
const hero = (name, point = booth) => ({ id: randomUUID(), name, x: point.x, z: point.z, coordinateVersion: 2, zone: booth.zone, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), level: 60, xp: 0, gold: 0, hp: 808, maxHp: 808,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, carriedItems: {}, itemUseReadyAt: 0, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
  quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(objective => [objective.id, 0])), completed: false, ending: null } });
const heroes = { owner: hero('Poll owner'), other: hero('Other voter'), far: hero('Distant voter', { x: 0, z: 8 }), blocked: hero('Behind booth', { x: booth.x, z: booth.modelZ - 1.8 }), dead: hero('Fallen voter') };
heroes.dead.hp = 0; heroes.dead.diedAt = epoch;
const alternate = hero('Alternate character'), tokens = Object.fromEntries(Object.keys(heroes).map(name => [name, randomBytes(32).toString('base64url')]));
const vote = (answers = { one: 'yes', two: 'skip' }, pollId = poll.id) => ({ type: 'pollVote', boothId: booth.id, pollId, answers });
const saved = () => JSON.parse(readFileSync(join(dir, 'polls.json'), 'utf8'));
async function until(fn, label) { const deadline = realNow() + 7000; while (realNow() < deadline) { const value = fn(); if (value) return value; await delay(15); } throw Error('Timed out: ' + label); }
async function advance() { offset += 800; await delay(30); }
async function start() { game = createGameServer({ host: '127.0.0.1', port: 0, dataDir: dir, keycloak: null, databaseUrl: '', polls: [poll, upcoming] }); port = await game.start(); }
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = null; }
async function connect(name, characterId = heroes[name].id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [], id: characterId }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (message.type === 'snapshot') client.snapshot = message; if (message.type === 'polls') client.polls = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token: tokens[name], characterId }); await until(() => client.snapshot?.players.some(player => player.id === characterId), 'join'); return client;
}
async function request(client, message, predicate) { await advance(); const index = client.messages.length; client.send(message); return until(() => client.messages.slice(index).find(predicate), message.type); }
const rejected = (client, message) => request(client, message, reply => reply.type === 'event' && reply.requestType === (message.type === 'interact' ? 'pollOpen' : message.type));
try {
  assert(canTraverse(heroes.owner, booth)); assert(!canTraverse(heroes.blocked, booth));
  assert(Math.hypot(heroes.blocked.x - booth.x, heroes.blocked.z - booth.z) < 4);
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([name, player]) => [key(tokens[name]), { characters: [player, ...(name === 'owner' ? [alternate] : [])] }]))));
  await start(); const c = {}; for (const name of Object.keys(heroes)) c[name] = await connect(name);
  const opened = await request(c.owner, { type: 'interact', targetId: booth.id }, message => message.type === 'polls');
  assert.equal(opened.open, true); assert.equal(opened.polls[0].status, 'open'); assert.equal(opened.polls[1].status, 'upcoming');
  assert.equal(opened.polls[0].results, undefined); assert.equal(opened.polls[0].ballot, undefined);
  for (const name of ['far', 'blocked', 'dead']) { await rejected(c[name], { type: 'pollOpen', boothId: booth.id }); await rejected(c[name], vote()); }
  for (const message of [vote({ one: 'yes' }), vote({ one: 'yes', two: 'no', extra: 'skip' }), vote({ one: true, two: 'skip' }), { ...vote(), extra: 1 }, vote(undefined, upcoming.id), vote(undefined, 'invented'), { type: 'pollOpen', boothId: 'invented' }]) await rejected(c.owner, message);
  mkdirSync(join(dir, 'polls.json.tmp'));
  const failed = await rejected(c.owner, vote()); assert.match(failed.text, /could not save/);
  rmSync(join(dir, 'polls.json.tmp'), { recursive: true });
  const receipt = await request(c.owner, vote(), message => message.type === 'polls' && message.submittedPollId === poll.id);
  assert.equal(receipt.open, false); assert.deepEqual(receipt.polls[0].ballot.answers, vote().answers); assert.equal(saved().ballots.length, 1);
  await rejected(c.owner, vote({ one: 'no', two: 'yes' })); assert.deepEqual(saved().ballots[0].answers, vote().answers);
  c.owner.send(vote()); const spam = await until(() => c.owner.messages.findLast(message => message.requestType === 'pollVote' && /Wait a moment/.test(message.text)), 'rate limit'); assert(spam);
  const privateView = await request(c.other, { type: 'pollOpen', boothId: booth.id }, message => message.type === 'polls');
  assert.equal(privateView.polls[0].ballot, undefined); assert.equal(privateView.polls[0].results, undefined);
  assert.equal(c.other.messages.filter(message => message.type === 'polls').length, 1, 'ballot receipts are never broadcast');
  for (const client of Object.values(c)) for (const message of client.messages) {
    if (['snapshot', 'welcome', 'roster'].includes(message.type)) assert(!JSON.stringify(message).includes('"answers"'), 'public state omits ballots');
    if (message.type === 'polls') assert(!JSON.stringify(message).includes('accountKey'), 'booth response omits account identities');
  }
  await stop(); await start(); const alt = await connect('owner', alternate.id);
  const restored = await request(alt, { type: 'pollOpen', boothId: booth.id }, message => message.type === 'polls');
  assert.deepEqual(restored.polls[0].ballot.answers, vote().answers, 'another character receives the same account ballot after restart');
  await rejected(alt, vote()); assert.equal(saved().ballots.length, 1);
  offset = poll.closesAt - realNow();
  const closed = await request(alt, { type: 'pollOpen', boothId: booth.id }, message => message.type === 'polls');
  assert.equal(closed.polls[0].status, 'closed'); assert.equal(closed.polls[0].results.ballots, 1);
  assert.equal(closed.polls[0].results.questions.one.passed, true); assert.equal(closed.polls[0].results.questions.two.passed, false);
  await rejected(alt, vote());
  console.log('PASS poll server: booth interaction, range/line-of-sight/life guards, strict messages, upcoming/closed rejection, rate limits, private durable receipt, failed-save retry, restart and cross-character duplicate protection.');
} finally { rmSync(join(dir, 'polls.json.tmp'), { recursive: true, force: true }); await stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
