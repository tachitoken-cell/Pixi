import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { SHADY_MERCHANT } from '../src/settlements.ts';
import { playerDatabaseFixture } from './fixture-player-database.mjs';

// Exercise the real account locks and socket lifecycle. No authorization is
// created: the controlled eligibility read always refuses the existing action.
const directory = mkdtempSync(join(tmpdir(), 'mossvale-action-drain-')), OriginalClient = pg.Client, clients = [];
const tokens = Array.from({ length: 2 }, () => randomBytes(32).toString('base64url'));
const hash = token => createHash('sha256').update(token).digest('hex');
const heroes = tokens.map((_, index) => ({ id: randomUUID(), name: `Action drain ${index}`, x: SHADY_MERCHANT.x, z: SHADY_MERCHANT.z,
  zone: 'greenwood', coordinateVersion: 2, rotation: 0, characterCreated: true,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  ...starterGear('Ranger'), talents: [], level: 60, hp: 808, maxHp: 808, xp: 0, gold: 0,
  auctionWallet: `0x${String(index + 1).repeat(40)}`, inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 },
  carriedItems: { 'moss-voucher': 2 }, quest: { stage: 0, kills: 0, crystals: 0 } }));
const records = Object.fromEntries(tokens.map((token, index) => [hash(token), { characters: [heroes[index]], communityRulesVersion: 1 }]));
let game, port, heldHoldings, releaseHoldings, loseCommitReply = false, commitReplyLost = false, pingId = 0;
const claims = [], releases = [];
const Fixture = playerDatabaseFixture(records);
pg.Client = class extends Fixture {
  async query(sql, args) {
    const result = await super.query(sql, args);
    if (sql.startsWith('SELECT pg_try_advisory_lock')) claims.push(args[0]);
    if (sql.startsWith('SELECT pg_advisory_unlock')) releases.push(args[0]);
    if (loseCommitReply && sql.endsWith('; COMMIT')) {
      loseCommitReply = false; commitReplyLost = true;
      throw Object.assign(Error('Fixture lost COMMIT acknowledgment'), { code: 'ECONNRESET' });
    }
    return result;
  }
};
async function until(predicate, label) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) { const value = predicate(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [], closed: null };
  clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === heroes[index].id);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (message.type === 'snapshot') client.snapshot = message; });
  socket.on('close', code => { client.closed = code; }); socket.on('error', () => {});
  await new Promise(resolve => socket.once('open', resolve));
  client.send({ type: 'join', token: tokens[index], characterId: heroes[index].id });
  return client;
}
async function entered(client) {
  await until(() => client.player() || client.closed, 'account entry');
  assert.equal(client.closed, null, 'a refused previous action must not reject account entry');
}
async function ping(client) {
  const id = ++pingId; client.send({ type: 'ping', id });
  await until(() => client.messages.some(message => message.type === 'pong' && message.id === id) || client.closed, 'unrelated player ping');
  assert.equal(client.closed, null, 'one account refusal must not disconnect other players');
}
const saved = () => {
  const account = records[hash(tokens[0])], player = account.characters[0];
  return structuredClone({ vouchers: player.carriedItems['moss-voucher'], claims: player.treasureClaims, lastClaim: account.lastTreasureClaimAt });
};
async function holdRefusal(client) {
  await delay(1050); // The real merchant enforces a one-second request cooldown.
  heldHoldings = { promise: new Promise(resolve => { releaseHoldings = resolve; }), arrived: false };
  client.send({ type: 'treasureRedeem' });
  await until(() => heldHoldings.arrived, 'held eligibility read');
}
try {
  const disabled = { configured: false, status: async () => ({ configured: false, enabled: false, reason: 'Isolated action-drain check.' }) };
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, keycloak: null, databaseUrl: 'postgres://isolated-action-drain-fixture',
    auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, nftChain: disabled, walletOidc: { env: {} },
    treasuryChain: { status: async () => ({ configured: true, enabled: true }), prepareClaim: () => assert.fail('A refused action must never authorize a payout.') },
    treasuryHoldings: async () => {
      if (heldHoldings) { const held = heldHoldings; held.arrived = true; await held.promise; }
      return { valueUsdCents: '2999', checkedAt: Date.now() };
    } });
  port = await game.start();
  let owner = await connect(0); const other = await connect(1);
  await Promise.all([entered(owner), entered(other)]);
  const before = saved();
  owner.send({ type: 'treasureRedeem' });
  const refusal = await until(() => owner.messages.find(message => message.type === 'treasureState' && message.message), 'ordinary eligibility refusal');
  assert.match(refusal.message, /Hold at least \$30.*Your voucher was kept/);
  assert.deepEqual(saved(), before);

  for (const mode of ['another tab', 'realm handoff', 'disconnect']) {
    await holdRefusal(owner);
    const claimsBefore = claims.length, releasesBefore = releases.length;
    let replacement;
    if (mode === 'another tab') replacement = await connect(0);
    else if (mode === 'realm handoff') owner.send({ type: 'leaveRealm' });
    else { owner.socket.close(); await until(() => owner.closed !== null, 'owner disconnect'); }
    await ping(other);
    assert.equal(claims.length, claimsBefore, 'account ownership cannot transfer before the action settles');
    assert.equal(releases.length, releasesBefore, 'ownership stays locked while eligibility is pending');
    assert(!owner.messages.some(message => message.type === 'realmLeft'), 'handoff must wait for the pending action');
    releaseHoldings(); heldHoldings = undefined;
    if (mode === 'another tab') await entered(replacement);
    else {
      await until(() => releases.length > releasesBefore || other.closed, 'released account after refusal');
      assert.equal(other.closed, null, `${mode}: a normal eligibility refusal must not stop the realm`);
      if (mode === 'realm handoff') {
        await until(() => owner.closed !== null, 'acknowledged realm handoff');
        assert.equal(owner.closed, 1000); assert(owner.messages.some(message => message.type === 'realmLeft'));
      }
      replacement = await connect(0); await entered(replacement);
    }
    assert.deepEqual(saved(), before, `${mode}: refusal preserves voucher, claims and daily allowance`);
    assert.equal(releases.length, releasesBefore + 1, 'the previous owner releases exactly once');
    await ping(other);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
    owner = replacement;
  }

  // A settled action is not evidence that the final save succeeded. A committed
  // write with a lost reply still fences the whole realm and never acknowledges a handoff.
  loseCommitReply = true;
  const destination = { x: owner.player().x + .25, z: owner.player().z };
  owner.send({ type: 'move', ...destination, rotation: 0 }); owner.send({ type: 'leaveRealm' });
  await until(() => owner.closed !== null && other.closed !== null, 'uncertain commit fences the realm');
  assert(commitReplyLost, 'the failure is injected after COMMIT, not before the write');
  assert.equal(records[hash(tokens[0])].characters[0].x, destination.x, 'the uncertain write actually committed');
  assert.equal(owner.closed, 1011); assert.equal(other.closed, 1011);
  assert(!owner.messages.some(message => message.type === 'realmLeft'), 'uncertain final save is never acknowledged');
  assert.deepEqual(saved(), before);
  console.log('PASS: expected action refusal preserves vouchers and realm health through tab replacement, realm handoff and disconnect; ownership drains exactly once; lost COMMIT acknowledgment still fences the realm without acknowledging handoff.');
} finally {
  releaseHoldings?.(); heldHoldings = undefined;
  clients.forEach(client => client.socket.terminate());
  await game?.stop().catch(error => { if (!/Progress storage failed/.test(error.message)) throw error; });
  pg.Client = OriginalClient; rmSync(directory, { recursive: true, force: true });
}
