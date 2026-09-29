import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { ZONES } from '../src/content.ts';

// Real WebSockets and persistence; only the local fixture's wall clock is advanced.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-security-')), file = join(dir, 'players.json'), realNow = Date.now, clients = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const tokens = Object.fromEntries(['normal', 'abusive', 'regular', 'noinput', 'gm', 'empty'].map(id => [id, randomBytes(32).toString('base64url')]));
const heroes = Object.fromEntries(Object.keys(tokens).filter(id => id !== 'empty').map(id => [id, {
  id: randomUUID(), name: `Guard ${id}`, coordinateVersion: 2, zone: 'greenwood', x: 0, z: 8, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, ...starterGear('Ranger'), talents: [], level: 1, xp: 0, hp: 100, maxHp: 100, gold: 40,
  inventory: { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
  quest: { stage: 0, kills: 0, crystals: 0 },
}]));
let clock = realNow(), game, port, pingId = 0;
Date.now = () => clock;
const reports = () => existsSync(join(dir, 'reports.json')) ? JSON.parse(readFileSync(join(dir, 'reports.json'), 'utf8')) : [];
const saved = id => JSON.parse(readFileSync(file, 'utf8'))[hash(tokens[id])];
const inputSample = (changes = {}) => ({ version: 1, durationMs: 30000, viewportWidth: 1300, viewportHeight: 700,
  clicks: 60, keys: 0, drags: 0, touchClicks: 0, syntheticClicks: 60, clickIntervals: 59, clickMeanMs: 500,
  clickJitter: 0, sameCellClicks: 59, resizes: 0, ...changes });
async function until(fn, label) {
  const deadline = realNow() + 6000;
  while (realNow() < deadline) { const result = fn(); if (result) return result; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function start() {
  const disabledChain = { status: async () => ({ configured: false, enabled: false, reason: 'Disabled in isolated security check.' }) };
  const originalNodes = ZONES[0].nodes;
  ZONES[0].nodes = [...originalNodes, { id: 'guard-crystal', kind: 'crystal', x: 0, z: 10 }];
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '',
    walletOidc: { env: {} }, localGmAccountKeys: [hash(tokens.gm)], auctionChain: disabledChain, mossAuctionChain: disabledChain,
    storeChain: disabledChain, treasuryChain: disabledChain, nftChain: disabledChain }); }
  finally { ZONES[0].nodes = originalNodes; }
  port = await game.start();
}
async function stop() {
  for (const client of clients.splice(0)) client.socket.terminate();
  if (game) { await game.stop(); game = null; }
}
async function connect(id, rosterOnly = false) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [], closed: null };
  clients.push(client); client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === heroes[id]?.id);
  socket.on('message', raw => {
    const message = JSON.parse(raw); client.messages.push(message);
    if (['snapshot', 'roster', 'welcome'].includes(message.type)) client[message.type] = message;
  });
  socket.on('close', code => { client.closed = code; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); socket.once('close', () => reject(Error('Socket closed before opening.'))); });
  client.send({ type: 'join', token: tokens[id], ...(!rosterOnly ? { characterId: heroes[id].id } : {}) });
  await until(() => client.player() || rosterOnly && client.roster || client.closed, `${id} joins or receives a rejection`);
  return client;
}
async function send(client, message) {
  const id = ++pingId, before = client.messages.length;
  client.send(message); client.send({ type: 'ping', id });
  await until(() => client.closed || client.messages.slice(before).some(reply => reply.type === 'pong' && reply.id === id), `${message?.type || 'malformed payload'} handled`);
}
async function inbox(client, reviewed = false) {
  const before = client.messages.length;
  client.send({ type: 'reportsList', reviewed });
  return until(() => client.messages.slice(before).find(reply => reply.type === 'reports'), 'GM security inbox');
}
const runtimeChecks = client => client.messages.filter(message => message.type === 'clientCheck');
async function regularGather(client, count = 61, telemetry = false, replyToCheck) {
  for (let i = 0; i < count; i++) {
    if (i) clock += 5000;
    if (telemetry && i % 6 === 0) await send(client, { type: 'inputActivity', sample: inputSample() });
    await send(client, { type: 'gather', targetId: 'guard-crystal' });
    await send(client, { type: 'cancelGather' });
    const check = runtimeChecks(client).at(-1);
    if (check && replyToCheck && check.nonce !== client.lastHandledNonce) {
      client.lastHandledNonce = check.nonce;
      await replyToCheck(check);
    }
  }
}

try {
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([id, hero]) => [hash(tokens[id]), { characters: [hero] }]))));
  await start();
  const normal = await connect('normal'), gm = await connect('gm');
  for (let i = 0; i < 40; i++) {
    clock += 50;
    await send(normal, { type: 'move', x: normal.player().x, z: normal.player().z, rotation: 0 });
  }
  for (let i = 0; i < 16; i++) {
    clock += 701;
    await send(normal, { type: 'attack', ability: 'arrow', targetId: 'already-dead' });
    await send(normal, { type: 'loot', targetId: 'already-collected' });
    await send(normal, { type: 'heal' });
    await send(normal, { type: 'old-client-action' });
  }
  assert.equal(normal.closed, null, '20 Hz movement, stale targets/loot and harmless ignored actions do not cause a cooldown');
  assert.equal(reports().length, 0, 'ordinary corrections and stale input create no security accusations');
  assert.equal(normal.player().gold, 40);
  for (let sample = 0; sample < 12; sample++) {
    clock += 30000;
    await send(normal, { type: 'inputActivity', sample: inputSample() });
  }
  assert.equal(reports().length, 0, 'client-only synthetic/repetitive clicks never create a botting accusation');
  for (const sample of [null, [], {}, inputSample({ version: 2 }), inputSample({ clicks: -1 }), inputSample({ viewportWidth: 0 }),
    inputSample({ durationMs: 1e12 }), inputSample({ clicks: 1e12 }), inputSample({ syntheticClicks: 61 }), inputSample({ clickIntervals: 100 }),
    inputSample({ clickJitter: 'bad' }), inputSample({ viewportWidth: 'x'.repeat(4000) }), inputSample({ rawClick: 'PRIVATE_INPUT_MUST_NOT_BE_RECORDED' })]) {
    clock += 30000;
    await send(normal, { type: 'inputActivity', sample });
  }
  assert.equal(normal.closed, null, 'invalid or oversized optional summaries cannot apply a safety cooldown');
  assert.equal(reports().length, 0, 'invalid summaries never create guard reports');
  for (const sample of [inputSample({ clicks: 0, keys: 60, syntheticClicks: 0, clickIntervals: 0, clickMeanMs: 0, sameCellClicks: 0 }),
    inputSample({ viewportWidth: 400, viewportHeight: 800, touchClicks: 60, syntheticClicks: 0, drags: 20, clickJitter: .4 })]) {
    clock += 30000; await send(normal, { type: 'inputActivity', sample });
  }
  assert.equal(reports().length, 0, 'keyboard-only input and mobile touch input are not evidence of cheating');
  for (let i = 0; i <= 60; i++) {
    clock += 5000;
    await send(normal, { type: 'autoAttack', targetId: 'slime-0' });
  }
  assert.equal(normal.player().autoAttack?.targetId, 'slime-0', 'the repeated selection names a real accepted target');
  assert.equal(reports().length, 0, 'repeating the current target is not a new manual target selection');
  await send(normal, { type: 'autoAttack', targetId: null });

  let abusive = await connect('abusive');
  for (let i = 0; i < 6; i++) { clock += 600; await send(abusive, { type: 'attack', gold: 999999 }); }
  assert.equal(abusive.closed, null, 'six definite violations are below the existing threshold');
  abusive.socket.close(); await until(() => abusive.closed, 'first socket disconnects');
  abusive = await connect('abusive');
  for (let i = 0; i < 6; i++) { clock += 600; await send(abusive, { type: 'attack', gold: 999999 }); }
  await until(() => abusive.closed === 4403, 'strikes survive reconnect and reach the account threshold');
  const violation = reports().find(report => report.targetId === heroes.abusive.id);
  assert.equal(violation.source, 'guard'); assert.equal(violation.reason, 'Repeated invalid game actions');
  assert.equal(violation.blockedUntil, clock + 60000); assert.match(violation.details, /12 invalid actions/);
  assert.equal(violation.reporterAccount, hash(tokens.abusive)); assert.equal(violation.targetAccount, hash(tokens.abusive));
  assert.equal((await connect('abusive')).closed, 4403, 'an immediate reconnect cannot bypass the safety cooldown');
  const list = await inbox(gm);
  assert(list.reports.some(report => report.id === violation.id), 'durable guard evidence is visible in the existing GM inbox');
  assert(!JSON.stringify(list).includes(hash(tokens.abusive)), 'GM response does not expose account keys');
  await send(normal, { type: 'ping', id: ++pingId }); assert.equal(normal.closed, null, 'a different account remains usable');
  const empty = await connect('empty', true);
  assert.deepEqual(empty.roster.characters, [], 'the authenticated account has no character to attach to a report');
  for (let i = 0; i < 12; i++) { clock += 600; await send(empty, null); }
  await until(() => empty.closed === 4403, 'malformed authenticated roster traffic reaches the abuse threshold');
  const emptyViolation = reports().find(report => report.targetAccount === hash(tokens.empty));
  assert.equal(emptyViolation.targetId, 'account'); assert.equal(emptyViolation.source, 'guard');
  assert.equal(emptyViolation.blockedUntil, clock + 60000); assert.match(emptyViolation.details, /12 invalid actions/);
  assert.equal((await connect('empty', true)).closed, 4403, 'an empty roster cannot bypass the safety cooldown');
  await stop();
  assert.equal(saved('abusive').characters[0].gold, 40, 'forged gold never reaches the save');
  assert.equal(saved('abusive').ban, undefined, 'a safety cooldown is not an account ban');

  await start();
  assert.equal((await connect('abusive')).closed, 4403, 'the saved report enforces the cooldown after a full server restart');
  assert.equal((await connect('empty', true)).closed, 4403, 'the account-sentinel report preserves the empty-roster cooldown across restart');
  const restartedNormal = await connect('normal'); assert.equal(restartedNormal.closed, null);
  clock = emptyViolation.blockedUntil + 1;
  assert.equal((await connect('abusive')).closed, null, 'the account can rejoin when the cooldown expires');
  assert.equal((await connect('empty', true)).closed, null, 'the empty-roster account can also rejoin after expiry');
  const regular = await connect('regular'), reviewer = await connect('gm');
  for (let i = 0; i <= 60; i++) {
    if (i) clock += 5000;
    await send(regular, { type: 'loot', targetId: 'regular-review-target' });
    await send(regular, { type: 'gather', targetId: 'missing-node' });
    await send(regular, { type: 'attack', ability: 'arrow', targetId: 'already-dead' });
    assert(!reports().some(report => report.targetId === heroes.regular.id), 'repeated rejected targets never provide botting evidence');
  }
  assert.equal(runtimeChecks(regular).length, 0, 'rejected actions do not issue runtime checks');
  const answeredNonces = [];
  let peerNonce;
  async function answerCheck(check) {
    assert.deepEqual(Object.keys(check).sort(), ['nonce', 'type']);
    assert.match(check.nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert(!answeredNonces.includes(check.nonce), 'each runtime probe uses a fresh nonce');
    if (!answeredNonces.length) {
      await regularGather(reviewer, 1);
      peerNonce = runtimeChecks(reviewer).at(-1).nonce;
      assert.notEqual(peerNonce, check.nonce, 'different connections have independent challenges');
      await send(regular, { type: 'clientCheck', nonce: peerNonce, webdriver: true });
      await send(reviewer, { type: 'clientCheck', nonce: check.nonce, webdriver: true });
      for (const reply of [{ type: 'clientCheck', nonce: check.nonce, webdriver: 'true' },
        { type: 'clientCheck', nonce: check.nonce, webdriver: true, extra: 'PRIVATE_INPUT_MUST_NOT_BE_RECORDED' },
        { type: 'clientCheck', nonce: 'x'.repeat(129), webdriver: true }]) await send(regular, reply);
    } else if (answeredNonces.length === 1) {
      await send(regular, { type: 'clientCheck', nonce: answeredNonces[0], webdriver: false });
      await regularGather(reviewer, 1);
      assert.equal(runtimeChecks(reviewer).length, 1, 'another account cannot consume the pending probe, even after the next issue interval');
      await send(reviewer, { type: 'clientCheck', nonce: peerNonce, webdriver: false });
      await regularGather(reviewer, 1);
      assert.equal(runtimeChecks(reviewer).length, 2, 'the matching connection can answer its own probe and receive a fresh one');
      assert.notEqual(runtimeChecks(reviewer).at(-1).nonce, peerNonce);
    }
    await send(regular, { type: 'clientCheck', nonce: check.nonce, webdriver: true });
    await send(regular, { type: 'clientCheck', nonce: check.nonce, webdriver: false });
    answeredNonces.push(check.nonce);
  }
  await regularGather(regular, 60, true, answerCheck);
  assert(!reports().some(report => report.targetId === heroes.regular.id), 'short regular sequences of accepted input are not reported');
  clock += 5000; await regularGather(regular, 1, true, answerCheck);
  const pattern = reports().find(report => report.targetId === heroes.regular.id);
  assert.equal(pattern.source, 'guard'); assert.equal(pattern.reason, 'Possible scripted input');
  assert.equal(pattern.blockedUntil, 0); assert.match(pattern.details, /No automatic ban/);
  const evidence = pattern.securityEvidence;
  assert.equal(evidence.version, 1); assert(evidence.score >= evidence.threshold && evidence.score <= 100);
  assert.deepEqual(evidence.server, { startedAt: clock - 300000, endedAt: clock, actionType: 'gather', intervals: 60, durationMs: 300000, meanIntervalMs: 5000, jitterRatio: 0 });
  assert.deepEqual(evidence.signals.map(signal => signal.id).sort(), ['regular-accepted-actions', 'regular-browser-clicks', 'repeated-click-area', 'synthetic-click-events', 'browser-automation'].sort());
  assert(evidence.signals.some(signal => signal.source === 'server') && evidence.signals.some(signal => signal.source === 'client'), 'server evidence is distinct from browser-reported context');
  assert.equal(evidence.score, Math.min(100, evidence.signals.reduce((total, signal) => total + signal.points, 0)), 'the review score is explainable by its included signals');
  assert.deepEqual(evidence.runtime, { declaredScript: false, issued: 6, answered: 5, unanswered: 0, mismatched: 1, automation: 5 },
    'fresh replies contribute only to the existing behavior report; crossed replies cannot answer and duplicates cannot overwrite it');
  assert.equal(answeredNonces.length, 6, 'the last challenge is emitted with the report and answered after its evidence snapshot');
  assert(evidence.client.windows >= 5 && evidence.client.windows <= 10, 'only a bounded recent set of browser summaries is retained');
  assert.equal(evidence.client.durationMs, evidence.client.windows * 30000);
  assert.equal(evidence.client.clicks, evidence.client.windows * 60);
  assert.equal(evidence.client.syntheticClicks, evidence.client.windows * 60);
  assert.deepEqual(evidence.client.viewportWidths, [1300]); assert.deepEqual(evidence.client.viewportHeights, [700]);
  assert(evidence.limitations.some(text => /not a probability or proof/.test(text)));
  assert(evidence.limitations.some(text => /modified or omitted/.test(text)));
  assert(evidence.limitations.some(text => /game master.*before banning/i.test(text)));
  assert.equal(regular.closed, null, 'regular timing creates review evidence without disconnecting the player');
  const review = await inbox(reviewer), visible = review.reports.find(report => report.id === pattern.id);
  assert.deepEqual(visible.securityEvidence, evidence, 'GM inbox includes the detailed score, context and limitations');
  for (const token of Object.values(tokens)) assert(!JSON.stringify(review).includes(hash(token)), 'GM evidence never exposes account keys');
  assert(!JSON.stringify(review).includes('PRIVATE_INPUT_MUST_NOT_BE_RECORDED'), 'raw or unknown input fields are never recorded');
  for (const nonce of answeredNonces) assert(!JSON.stringify(review).includes(nonce), 'reports retain bounded runtime counts without raw nonces');
  clock += 5000; await regularGather(regular, 1);
  assert.equal(reports().filter(report => report.targetId === heroes.regular.id).length, 1, 'continued repetition does not spam the inbox');
  regular.socket.close(); await until(() => regular.closed, 'review-only player disconnects');
  const rejoined = await connect('regular');
  assert.equal(rejoined.closed, null, 'a timing report does not block rejoining');
  await regularGather(rejoined, 1);
  const reconnectNonce = runtimeChecks(rejoined).at(-1).nonce;
  assert(!answeredNonces.includes(reconnectNonce), 'reconnecting starts a fresh connection-bound challenge');
  await send(rejoined, { type: 'clientCheck', nonce: answeredNonces.at(-1), webdriver: true });
  clock += 60000; await regularGather(rejoined, 1);
  assert.equal(runtimeChecks(rejoined).length, 1, 'a reply replayed from the previous socket cannot consume the new pending challenge');
  await send(rejoined, { type: 'clientCheck', nonce: reconnectNonce, webdriver: false });
  await regularGather(rejoined, 1);
  assert.equal(runtimeChecks(rejoined).length, 2, 'a valid fresh response on the new socket resumes normal runtime checks');
  assert.equal(rejoined.closed, null, 'optional invalid, crossed and replayed runtime replies never apply a safety cooldown');
  const noinput = await connect('noinput');
  await regularGather(noinput);
  const missingTelemetry = reports().find(report => report.targetId === heroes.noinput.id);
  assert.deepEqual(missingTelemetry.securityEvidence.signals.map(signal => signal.source), ['server'], 'missing telemetry adds no client suspicion');
  assert.equal(missingTelemetry.securityEvidence.client, undefined);
  assert.equal(missingTelemetry.securityEvidence.score, 60, 'raw clients that omit runtime and browser telemetry retain only the server behavior score');
  assert.deepEqual(missingTelemetry.securityEvidence.runtime, { declaredScript: false, issued: 3, answered: 0, unanswered: 2, mismatched: 0, automation: 0 });
  assert.equal(noinput.closed, null); assert.equal(missingTelemetry.blockedUntil, 0);
  assert.equal(saved('regular').ban, undefined, 'even combined server and client signals cannot ban without GM review');
  const resolution = 'Fixture GM corroborated scripted input independently.';
  await send(reviewer, { type: 'reviewReport', reportId: pattern.id, decision: 'ban', reason: resolution });
  await until(() => reports().find(report => report.id === pattern.id)?.status === 'banned', 'GM ban decision saved');
  const history = await inbox(reviewer, true), banned = history.reports.find(report => report.id === pattern.id);
  assert.equal(banned.status, 'banned'); assert.equal(banned.decisionEvidence.decision, 'ban');
  assert.equal(banned.decisionEvidence.reviewerId, heroes.gm.id); assert.equal(banned.decisionEvidence.resolution, resolution);
  assert.equal(banned.decisionEvidence.score, evidence.score); assert.deepEqual(banned.decisionEvidence.securityEvidence, evidence);
  assert(!(await inbox(reviewer)).reports.some(report => report.id === pattern.id), 'reviewed ban leaves the open inbox and remains in history');
  for (const token of Object.values(tokens)) assert(!JSON.stringify(history).includes(hash(token)), 'ban history does not expose account keys');
  await stop();
  assert.equal(saved('regular').ban.reason, resolution); assert.equal(saved('regular').characters[0].gold, 40);
  assert.equal(saved('noinput').ban, undefined);
  assert.deepEqual(reports().find(report => report.id === pattern.id).securityEvidence, evidence, 'detailed evidence remains durable after shutdown');
  console.log('PASS security server: durable abuse cooldowns, accepted-action timing only, repeated-target exclusion, passive telemetry validation, keyboard/touch compatibility, connection-bound fresh runtime probes, crossed/replayed/duplicate/malformed replies, optional unanswered checks, bounded detailed evidence, privacy, review-only scoring and persisted GM ban history.');
} finally {
  try { await stop(); } finally { Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
}
