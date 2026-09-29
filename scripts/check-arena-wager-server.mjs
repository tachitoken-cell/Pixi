import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Wallet, ZeroHash, ZeroAddress, id, toQuantity, verifyTypedData } from 'ethers';
import { createGameServer } from '../server.mjs';
import { createArenaChain, arenaInterface, ARENA_MATCH_TYPES, ARENA_RESULT_TYPES } from '../src/arena-chain.mjs';
import { erc20Interface } from '../src/auction-chain.mjs';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM } from '../src/auction.ts';
import { arenaWagersValid } from '../src/arena-wager.ts';
import { starterGear } from '../src/progression.ts';

// Real sockets, signatures and isolated atomic saves; latest/finalized chain snapshots are controlled.
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-arena-moss-')), savePath = join(dataDir, 'players.json');
const authority = Wallet.createRandom(), wallets = Array.from({ length: 4 }, () => Wallet.createRandom());
const contract = Wallet.createRandom().address, treasury = Wallet.createRandom().address;
const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleArena.json', import.meta.url), 'utf8'));
const tokenCode = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
const tokens = wallets.map(() => randomBytes(32).toString('base64url'));
const keys = tokens.map(token => createHash('sha256').update(token).digest('hex'));
const players = ['Amber', 'Briar', 'Apple fighter', 'Spectator'].map((name, i) => ({
  id: randomUUID(), name, zone: 'greenwood', coordinateVersion: 2, x: i * 2, z: 8, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, talents: [], ...starterGear('Ranger'), hp: 100, maxHp: 100, level: 1, xp: 0, gold: 1000,
  auctionWallet: wallets[i].address, inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 },
}));
writeFileSync(savePath, JSON.stringify(Object.fromEntries(players.map((player, i) => [keys[i], { characters: [player] }]))));
const realNow = Date.now, clients = [], states = new Map(), finalStates = new Map(), calls = [], signedResults = [];
const snapshots = new Map(), blocksByNumber = new Map(), heads = { latest: 10000, finalized: 100 };
let game, port, clockOffset = 0, outage = false, finalUnavailable = false, heldRead, finalTimestamp = 0;
Date.now = () => realNow() + clockOffset;
const block = mode => {
  const number = toQuantity(heads[mode]);
  if (!blocksByNumber.has(number)) {
    const now = Math.floor(Date.now() / 1000);
    if (mode === 'finalized') finalTimestamp = Math.max(finalTimestamp, now - 1200);
    const block = { number, hash: id(`${mode}-block-${number}`), timestamp: toQuantity(mode === 'latest' ? now : finalTimestamp) };
    blocksByNumber.set(number, block);
    snapshots.set(block.hash, { mode, block, states: new Map(mode === 'latest' ? states : finalStates) });
  }
  return blocksByNumber.get(number);
};
const chain = createArenaChain({ contract, authorityKey: authority.privateKey, treasury, rpc: async (method, params) => {
  calls.push(method); if (outage) throw Error('Controlled arena RPC outage');
  if (method === 'eth_chainId') return '0x1237';
  if (method === 'eth_getBlockByNumber') {
    if (params[0] === 'finalized' && finalUnavailable) return null;
    return ['latest', 'finalized'].includes(params[0]) ? block(params[0]) : blocksByNumber.get(params[0]);
  }
  assert.equal(params[1].requireCanonical, true);
  const snapshot = snapshots.get(params[1].blockHash); assert(snapshot, 'Every read pins a known canonical snapshot.');
  if (method === 'eth_getCode') return params[0].toLowerCase() === MOSS_TOKEN.address.toLowerCase() ? tokenCode : artifact.deployedBytecode;
  if (method === 'eth_call') {
    const token = params[0].to.toLowerCase() === MOSS_TOKEN.address.toLowerCase(), abi = token ? erc20Interface : arenaInterface;
    const method = abi.parseTransaction(params[0]);
    const values = { authority: authority.address, treasury, paymentToken: MOSS_TOKEN.address, devTeam: MOSS_AUCTION_DEV_TEAM,
      TAX_BPS: 500n, name: 'Mossvale', symbol: 'MOSS', decimals: 18n };
    if (method.name === 'matches' && heldRead?.matchId === method.args[0] && snapshot.mode === 'latest') {
      const wait = heldRead; heldRead = null; wait.enter(); await wait.released;
    }
    return abi.encodeFunctionResult(method.name, method.name === 'matches' ? snapshot.states.get(method.args[0]) || [ZeroHash, 0n, false] : [values[method.name]]);
  }
  throw Error(`Unexpected chain request ${method}`);
} });
const prepareResult = chain.prepareResult;
chain.prepareResult = (...args) => { signedResults.push({ matchId: args[0].matchId, winner: args[1] }); return prepareResult(...args); };
function holdNextRead(order) {
  let release;
  const wait = { entered: false, released: new Promise(resolve => { release = resolve; }), release: () => release() };
  heldRead = { matchId: order.matchId, enter: () => { wait.entered = true; }, released: wait.released }; return wait;
}
const read = () => JSON.parse(readFileSync(savePath, 'utf8'));
const stored = index => read()[keys[index]].characters[0];
const domain = { name: 'MossvaleArena', version: '1', chainId: 4663, verifyingContract: contract };
async function until(test, label) {
  const deadline = realNow() + 8000;
  while (realNow() < deadline) { const result = test(); if (result) return result; await delay(10); }
  throw Error(`Timed out: ${label}; ${JSON.stringify(clients.flatMap(c => c.messages.filter(m => m.type === 'event').slice(-2)))}`);
}
async function tick(ms = 1100) { clockOffset += ms; heads.latest++; heads.finalized++; await delay(115); }
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, index, id: players[index].id, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.id);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (['snapshot', 'roster', 'arenaWagers', 'arenaWalletChallenge'].includes(message.type)) c[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[index], characterId: c.id, ...(index === 2 ? { nativePlatform: 'ios' } : {}) });
  await until(c.player, 'world entry'); return c;
}
async function start() {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '', arenaChain: chain });
  port = await game.start(); return Promise.all(players.map((_, i) => connect(i)));
}
async function stop() { await game?.stop(); game = null; for (const c of clients.splice(0)) c.socket.terminate(); }
async function rejected(c, message) {
  await tick(); const mark = c.messages.length; c.send(message);
  return until(() => c.messages.slice(mark).find(m => m.type === 'event' && m.kind === 'info'), `reject ${message.type}`);
}
async function open(c, matchId) {
  await tick(); const mark = c.messages.length;
  c.send(matchId ? { type: 'arenaWagerCheck', matchId } : { type: 'arenaWagerOpen' });
  return until(() => c.messages.slice(mark).find(m => m.type === 'arenaWagers'), 'private wager state');
}
async function bind(c, wallet, denied = false) {
  await tick(); const mark = c.messages.length;
  c.send({ type: 'arenaWalletChallenge', wallet: wallet.address });
  const challenge = await until(() => c.messages.slice(mark).find(m => m.type === 'arenaWalletChallenge'), 'wallet ownership challenge');
  const signature = await wallet.signMessage(challenge.message);
  if (denied) await rejected(c, { type: 'arenaWalletBind', signature });
  else {
    await tick(); c.send({ type: 'arenaWalletBind', signature });
    await until(() => c.arenaWagers?.wallet === wallet.address, 'wallet binding persisted');
    assert.equal(stored(c.index).auctionWallet, wallet.address);
  }
}
async function invite(a, b, wagerMoss = '100') {
  await tick(); a.send({ type: 'arenaRequest', targetId: b.id, size: 1, ...(wagerMoss === undefined ? {} : { wagerMoss }) });
  return until(() => b.snapshot.arenaInvites.find(invite => invite.inviterId === a.id), 'MOSS invitation');
}
async function prepare(a, b, amount = '100') {
  const invitation = await invite(a, b, amount); b.send({ type: 'arenaAccept', invitationId: invitation.id });
  await until(() => b.snapshot.arenaInvites.some(invite => invite.id === invitation.id && invite.funding), 'funding begins after both accept');
  const records = [stored(0), stored(1)], entries = records.map(p => p.arenaWagers.at(-1));
  for (const record of records) assert(arenaWagersValid(record.arenaWagers), 'Every funded authorization must reload from the durable player schema.');
  assert.deepEqual(entries[0].order, entries[1].order, 'Both fighter records receive identical signed terms atomically.');
  const order = entries[0].order;
  assert.equal(order.playerA, wallets[0].address); assert.equal(order.playerB, wallets[1].address);
  assert.equal(verifyTypedData(domain, ARENA_MATCH_TYPES, order, order.signature), authority.address);
  assert.equal(b.snapshot.arenaInvites.find(i => i.id === invitation.id).wagerMatchId, order.matchId);
  assert([a, b].every(c => c.snapshot.arena?.phase !== 'countdown'), 'Consent alone cannot start before confirmed deposits.');
  return { invitation, order };
}
function funded(order, mask = 3, closed = false) { states.set(order.matchId, [mask === 0 && !closed ? ZeroHash : order.termsHash, BigInt(mask), closed]); heads.latest++; }
function finalized(order, mask = 3, closed = false) {
  finalStates.set(order.matchId, [mask === 0 && !closed ? ZeroHash : order.termsHash, BigInt(mask), closed]);
  finalTimestamp = Math.floor(Date.now() / 1000); heads.finalized++;
}
async function begin(a, b) {
  const ready = await prepare(a, b); funded(ready.order); await open(a, ready.order.matchId);
  await until(() => [a, b].every(c => c.snapshot.arena?.phase === 'countdown'), 'both soft-confirmed deposits start countdown');
  assert.equal((await chain.verifyMatch(ready.order, { finalized: true })).funded, 0, 'The match starts while finality still has no deposits.');
  return ready;
}
async function finished(group, winnerTeam, order, winner) {
  await until(() => group.every(c => c.snapshot.arena?.phase === 'finished'), 'finished after durable result');
  const entries = [stored(0), stored(1)].map(p => p.arenaWagers.find(w => w.order.matchId === order.matchId));
  assert.deepEqual(entries[0].result, entries[1].result, 'A single result is persisted to both accounts before announcing the winner.');
  assert.equal(entries[0].result.winner, winner);
  assert.equal(signedResults.filter(row => row.matchId === order.matchId).length, 1, 'A match signs exactly one durable outcome.');
  assert.equal(verifyTypedData(domain, ARENA_RESULT_TYPES, { matchId: order.matchId, termsHash: order.termsHash, winner }, entries[0].result.signature), authority.address);
  for (const c of group) { assert.equal(c.snapshot.arena.winnerTeam, winnerTeam); assert.equal(c.player().gold, 1000); assert.equal(c.player().instanceId, null); }
  return entries[0].result;
}
async function close(a, b, order) {
  const mask = Number(states.get(order.matchId)?.[1] || 0); funded(order, mask, true);
  for (const c of [a, b]) await open(c, order.matchId);
  assert([stored(0), stored(1)].every(p => p.arenaWagers.some(w => w.order.matchId === order.matchId)), 'Soft closure retains recovery records until finalized.');
  finalized(order, mask, true);
  for (const c of [a, b]) await open(c, order.matchId);
  await until(() => [stored(0), stored(1)].every(p => !p.arenaWagers.some(w => w.order.matchId === order.matchId)), 'finalized closure releases retained wagers');
}

try {
  let [a, b, ios, spectator] = await start();
  const request = { type: 'arenaRequest', targetId: b.id, size: 1 };
  for (const wagerMoss of [-1, 1, '-1', '01', '1e3', '0.0000000000000000001', '1000000', null, {}, true]) {
    await rejected(a, { ...request, wagerMoss }); assert.equal(b.snapshot.arenaInvites.length, 0);
  }
  for (const message of [{ ...request, wagerMoss: '100', size: 2 }, { ...request, wagerMoss: '100', targetId: a.id },
    { type: 'arenaQueueJoin', size: 1, wagerMoss: '100' }, { ...request, wagerMoss: '100', result: { winner: wallets[0].address } }]) await rejected(a, message);
  for (const message of [{ type: 'arenaWagerOpen' }, { type: 'arenaWagerCheck', matchId: id('any') },
    { type: 'arenaWalletChallenge', wallet: wallets[2].address }, { ...request, wagerMoss: '100' }]) {
    await tick(); const count = calls.length, mark = ios.messages.length; ios.send(message);
    await until(() => ios.messages.slice(mark).some(m => m.type === 'event' && m.kind === 'info'), 'iOS blocks MOSS wagering');
    assert.equal(calls.length, count, 'iOS restrictions reject before chain RPC and signing.');
  }

  const consent = await invite(a, b);
  await rejected(b, { type: 'arenaAccept', invitationId: consent.id, wagerMoss: '1' });
  assert.equal(stored(0).arenaWagers.length, 0); b.send({ type: 'arenaDecline', invitationId: consent.id });
  await until(() => !b.snapshot.arenaInvites.length, 'declined before funding');
  await bind(spectator, wallets[0]);
  await rejected(a, { ...request, targetId: spectator.id, wagerMoss: '100' });
  assert.equal(spectator.snapshot.arenaInvites.length, 0, 'Two characters cannot wager using one wallet.');
  await bind(spectator, wallets[3]);
  const pending = await prepare(a, b);
  await bind(a, wallets[3], true); assert.equal(stored(0).auctionWallet, wallets[0].address, 'Pending escrow locks the bound wallet.');
  await open(a, pending.order.matchId); assert.equal(a.arenaWagers.wagers.find(w => w.order.matchId === pending.order.matchId).funded, 0);
  funded(pending.order, 1); await open(a, pending.order.matchId); assert(a.snapshot.arena?.phase !== 'countdown', 'One deposit cannot start combat.');
  await rejected(spectator, { type: 'arenaWagerCheck', matchId: pending.order.matchId });
  assert(!JSON.stringify(spectator.snapshot).includes(pending.order.signature), 'Public snapshots never disclose signed orders or results.');
  await rejected(b, { type: 'arenaWagerCheck', matchId: pending.order.matchId, funded: 3 });
  b.send({ type: 'arenaDecline', invitationId: pending.invitation.id }); await until(() => !a.snapshot.arenaInvites.length, 'funding invitation canceled');
  for (const index of [0, 1]) assert(!stored(index).arenaWagers.at(-1).result, 'Cancellation keeps the onchain timeout refund rather than signing an overlapping outcome.');
  await stop(); [a, b, ios, spectator] = await start();
  assert.deepEqual(stored(0).arenaWagers[0].order, pending.order); assert(!a.snapshot.arena); assert.equal(a.snapshot.arenaInvites.length, 0);
  await close(a, b, pending.order);

  const empty = await prepare(a, b);
  b.send({ type: 'arenaDecline', invitationId: empty.invitation.id }); await until(() => !a.snapshot.arenaInvites.length, 'unused funding cancelled');
  await open(a, empty.order.matchId); assert(stored(0).arenaWagers.some(w => w.order.matchId === empty.order.matchId), 'An unfunded order stays recoverable while funding is possible.');
  await tick(empty.order.fundingDeadline * 1000 - Date.now() + 2000);
  for (const c of [a, b]) await open(c, empty.order.matchId);
  assert([stored(0), stored(1)].every(p => p.arenaWagers.some(w => w.order.matchId === empty.order.matchId)), 'Soft expiry keeps recovery records while finality lags.');
  finalUnavailable = true; await open(a, empty.order.matchId);
  assert(stored(0).arenaWagers.some(w => w.order.matchId === empty.order.matchId), 'Unavailable finality cannot release a saved wallet lock.');
  finalUnavailable = false; finalized(empty.order, 0);
  for (const c of [a, b]) await open(c, empty.order.matchId);
  assert([stored(0), stored(1)].every(p => !p.arenaWagers.some(w => w.order.matchId === empty.order.matchId)), 'Finalized zero deposits after funding expiry release wallet locks without an impossible refund transaction.');

  const wager = await begin(a, b); a.send({ type: 'arenaForfeit' }); a.send({ type: 'arenaForfeit' });
  const result = await finished([a, b], 1, wager.order, wallets[1].address);
  await rejected(a, { type: 'arenaForfeit' }); assert.deepEqual(stored(0).arenaWagers[0].result, result);
  await stop(); [a, b, ios, spectator] = await start();
  assert.deepEqual(stored(0).arenaWagers[0].result, result, 'Completed result remains claimable after restart.');
  await open(a, wager.order.matchId); assert.deepEqual(a.arenaWagers.wagers[0].result, result);
  funded(wager.order, 0); await open(a, wager.order.matchId);
  assert.deepEqual(stored(0).arenaWagers[0].result, result, 'Later missing soft deposits cannot overwrite a saved winner.');
  assert.equal(signedResults.filter(row => row.matchId === wager.order.matchId).length, 1);
  await close(a, b, wager.order);

  const draw = await begin(a, b); await tick(306000); await finished([a, b], null, draw.order, ZeroAddress); await close(a, b, draw.order);
  const delayed = await prepare(a, b); funded(delayed.order, 1);
  await tick((delayed.order.fundingDeadline + 140) * 1000 - Date.now());
  assert(a.snapshot.arenaInvites.some(i => i.id === delayed.invitation.id), 'A deposit near the deadline keeps its invitation through the 150-second soft-confirmation grace.');
  funded(delayed.order); await open(a, delayed.order.matchId);
  await until(() => a.snapshot.arena?.phase === 'countdown', 'deposits observed within the grace still start the match');
  a.send({ type: 'arenaForfeit' }); await finished([a, b], 1, delayed.order, wallets[1].address); await close(a, b, delayed.order);
  const expired = await prepare(a, b); funded(expired.order, 1);
  await tick((expired.order.fundingDeadline + 151) * 1000 - Date.now());
  await until(() => !a.snapshot.arenaInvites.some(i => i.id === expired.invitation.id), 'funding invitation expires after the 150-second grace');
  funded(expired.order); await open(a, expired.order.matchId);
  assert(!a.snapshot.arena || a.snapshot.arena.phase === 'finished', 'A late deposit cannot resume an expired invitation.');
  assert(!stored(0).arenaWagers.find(w => w.order.matchId === expired.order.matchId).result, 'Expired funding retains timeout recovery without signing an outcome.');
  await close(a, b, expired.order);
  const restart = await begin(a, b); await stop();
  assert.equal(stored(0).arenaWagers[0].result.winner, ZeroAddress, 'Orderly shutdown signs a full-refund draw.');
  [a, b, ios, spectator] = await start(); await close(a, b, restart.order);

  const lost = await begin(a, b); b.socket.close(); await finished([a], 0, lost.order, wallets[0].address);
  assert.deepEqual({ x: stored(1).x, z: stored(1).z, zone: stored(1).zone }, { x: players[1].x, z: players[1].z, zone: players[1].zone }, 'Disconnect stores overworld coordinates.');
  b = await connect(1); await close(a, b, lost.order);

  const offline = await begin(a, b); outage = true; a.send({ type: 'arenaForfeit' });
  await finished([a, b], 1, offline.order, wallets[1].address); outage = false; await close(a, b, offline.order);

  for (const [mask, closed] of [[1, false], [0, false], [3, true]]) {
    const reverted = await begin(a, b); await tick(5100);
    await until(() => a.snapshot.arena?.phase === 'active', 'funded fight becomes active');
    funded(reverted.order, mask, closed); await tick(5100);
    const refund = await finished([a, b], null, reverted.order, ZeroAddress);
    await tick(5100);
    assert.deepEqual(stored(0).arenaWagers.find(w => w.order.matchId === reverted.order.matchId).result, refund);
    assert.equal(signedResults.filter(row => row.matchId === reverted.order.matchId).length, 1, 'Repeated monitors cannot sign a second cancellation.');
    await close(a, b, reverted.order);
  }
  const beforePoll = await begin(a, b);
  funded(beforePoll.order, 1); a.send({ type: 'arenaForfeit' });
  await finished([a, b], null, beforePoll.order, ZeroAddress);
  await close(a, b, beforePoll.order);

  const previous = await begin(a, b), slow = holdNextRead(previous.order);
  let replacement;
  try {
    funded(previous.order, 1); await tick(5100);
    await until(() => slow.entered, 'active funding poll is held before a delayed response');
    funded(previous.order); a.send({ type: 'arenaForfeit' });
    const saved = await finished([a, b], 1, previous.order, wallets[1].address);
    replacement = await begin(a, b); slow.release(); await tick(1100);
    assert.equal(a.snapshot.arena.wagerMatchId, replacement.order.matchId);
    assert.equal(a.snapshot.arena.phase, 'countdown', 'A delayed old poll cannot cancel the replacement match.');
    assert.deepEqual(stored(0).arenaWagers.find(w => w.order.matchId === previous.order.matchId).result, saved, 'A delayed missing-funding result cannot overwrite a saved winner.');
    assert.equal(signedResults.filter(row => row.matchId === previous.order.matchId).length, 1);
    a.send({ type: 'arenaForfeit' }); await finished([a, b], 1, replacement.order, wallets[1].address);
  } finally { slow.release(); }
  await close(a, b, previous.order); await close(a, b, replacement.order);

  const failedResult = await begin(a, b); await delay(1200); mkdirSync(`${savePath}.tmp`);
  a.send({ type: 'arenaForfeit' });
  await until(() => [a, b].every(c => c.snapshot.arena?.phase === 'finished'), 'failed result save releases the match safely');
  for (const c of [a, b]) {
    assert.equal(c.snapshot.arena.winnerTeam, null);
    assert(!stored(c.index).arenaWagers.find(w => w.order.matchId === failedResult.order.matchId).result, 'A failed result write retains original escrow terms for timeout refund.');
    assert(!c.arenaWagers?.wagers.find(w => w.order.matchId === failedResult.order.matchId)?.result, 'No unsaved payout signature reaches a wallet.');
  }
  rmSync(`${savePath}.tmp`, { recursive: true }); await close(a, b, failedResult.order);

  const free = await invite(a, b, '0'); b.send({ type: 'arenaAccept', invitationId: free.id });
  await until(() => a.snapshot.arena?.phase === 'countdown', 'free challenge retains existing flow'); a.send({ type: 'arenaForfeit' });
  await until(() => a.snapshot.arena?.phase === 'finished', 'free match finishes'); assert.equal(stored(0).arenaWagers.length, 0);

  // A failed save must never release a usable funding authorization to either wallet.
  const unsaved = await invite(a, b); await delay(1200); mkdirSync(`${savePath}.tmp`); const beforeFailure = b.messages.length;
  b.send({ type: 'arenaAccept', invitationId: unsaved.id });
  await until(() => !b.snapshot.arenaInvites.some(i => i.id === unsaved.id) || b.messages.slice(beforeFailure).some(m => m.type === 'event' && /could not|failed|saved/i.test(m.text)), 'funding save fails safely');
  assert.equal(stored(0).arenaWagers.length, 0); assert.equal(stored(1).arenaWagers.length, 0);
  assert(!b.snapshot.arenaInvites.some(i => i.id === unsaved.id && i.funding), 'No escrow funding is exposed before both records persist.');
  rmSync(`${savePath}.tmp`, { recursive: true });
  b.send({ type: 'arenaDecline', invitationId: unsaved.id }); await tick();
  const retained = [];
  for (let count = 0; count < 8; count++) {
    const entry = await prepare(a, b); retained.push(entry.order);
    b.send({ type: 'arenaDecline', invitationId: entry.invitation.id });
    await until(() => !b.snapshot.arenaInvites.length, 'cancel retains timeout recovery');
  }
  await rejected(a, { ...request, wagerMoss: '100' });
  assert.equal(stored(0).arenaWagers.length, 8); assert.equal(b.snapshot.arenaInvites.length, 0, 'Eight unresolved wagers bound recoverable history.');
  await close(a, b, retained[0]);
  const next = await prepare(a, b); assert.equal(stored(0).arenaWagers.length, 8, 'Finalized closure frees a slot for a new wager.');
  b.send({ type: 'arenaDecline', invitationId: next.invitation.id });
  assert.equal(stored(0).gold, 1000); assert.equal(stored(1).gold, 1000);
  console.log('Arena MOSS server passed: soft funding, finalized recovery cleanup, funding-loss cancellation, one durable outcome, stale-poll isolation, consent, private authorizations, spoof/iOS guards, wallet locks, restart recovery, RPC outage, free matches, save failures and bounded history.');
} finally { rmSync(`${savePath}.tmp`, { recursive: true, force: true }); await stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true }); }
