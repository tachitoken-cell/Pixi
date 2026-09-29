import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Wallet, TypedDataEncoder, formatUnits, id, parseUnits } from 'ethers';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { createPlayerStore } from '../src/player-store.mjs';
import { starterGear } from '../src/progression.ts';
import { GOLD_MERCHANT } from '../src/gold-merchant.ts';
import { MOSS_TOKEN } from '../src/auction.ts';
import { TREASURE_CLAIM_TYPES, treasureContractClaim, treasureClaimValid, goldUsdAmountWei } from '../src/treasure-rewards.ts';
import { treasuryInterface } from '../src/treasury-chain.mjs';

// Only an isolated local database and generated signing keys; no real RPC or wallet transactions.
const suffix = randomUUID().replaceAll('-', ''), schema = `gold_ws_${suffix}`;
const directory = mkdtempSync(join(tmpdir(), 'mossvale-gold-rounds-')), clients = [], payments = new Map();
const realNow = Date.now, authority = Wallet.createRandom(), contract = Wallet.createRandom().address;
const domain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: 4663, verifyingContract: contract };
let capacityWei = parseUnits('1000', 18).toString(), priceUsdWei = parseUnits('1', 18).toString();
let quoteStale = false, quoteUnavailable = false, quoteReads = 0, fundingReads = 0;
let clock = realNow(), container, admin, operator, databaseUrl, game, port, prepares = 0, holdingReads = 0;
Date.now = () => clock;
const front = { x: GOLD_MERCHANT.x + Math.sin(GOLD_MERCHANT.rotation) * 1.2, z: GOLD_MERCHANT.z + Math.cos(GOLD_MERCHANT.rotation) * 1.2 };
const tokens = Array.from({ length: 7 }, () => randomBytes(32).toString('base64url'));
const keys = tokens.map(token => createHash('sha256').update(token).digest('hex'));
const wallets = tokens.map(() => Wallet.createRandom());
const heroes = tokens.map((_, index) => ({ id: randomUUID(), name: `Round tester ${index}`, coordinateVersion: 2,
  zone: 'greenwood', ...(index === 5 ? { x: 0, z: 8 } : front), rotation: 0, characterCreated: true,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  ...starterGear('Ranger'), onboarding: { version: 1, looted: true, bagViewed: true, gearViewed: true, completed: true },
  talents: [], level: index === 3 ? 29 : 30, xp: 0, gold: 2_000_000, hp: 100, maxHp: index === 3 ? 436 : 448,
  ...(index === 6 ? {} : { auctionWallet: wallets[index].address }),
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } }));
const treasuryChain = {
  async status() {
    fundingReads++;
    return { configured: true, enabled: true, chainId: 4663, contract, token: MOSS_TOKEN.address, capacityWei, balanceWei: capacityWei };
  },
  async quoteGoldBudget({ payoutUsdMicros = '1000000000' } = {}, now = Date.now()) {
    quoteReads++;
    if (quoteUnavailable) throw Error('Isolated MOSS price outage.');
    return { contract, capacityWei, balanceWei: capacityWei, amountWei: goldUsdAmountWei(payoutUsdMicros, priceUsdWei),
      price: { usdWei: priceUsdWei, observedAt: now - (quoteStale ? 90001 : 0) } };
  },
  async prepareGoldClaim(input) {
    prepares++;
    const terms = { ...input, amount: formatUnits(input.amountWei, 18) }, contractClaim = treasureContractClaim(terms);
    const signature = await authority.signTypedData(domain, TREASURE_CLAIM_TYPES, contractClaim);
    const claim = { ...terms, amountWei: contractClaim.amountWei, createdAt: clock, chainId: 4663, token: MOSS_TOKEN.address, contract,
      status: 'pending', contractClaim, signature, claimHash: TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, contractClaim),
      transaction: { to: contract, data: treasuryInterface.encodeFunctionData('claim', [contractClaim, signature]), value: '0x0', chainId: '0x1237' } };
    assert(treasureClaimValid(claim)); return { claim, capacityWei };
  },
  async checkClaim(claim) {
    assert(treasureClaimValid(claim));
    const state = payments.get(claim.claimHash) || 'pending';
    return { state, claimHash: claim.claimHash, ...(state === 'pending' ? { revoked: !!claim.paymentBlock } : { blockHash: id('isolated-round-block'), blockNumber: '0x64' }) };
  },
  async verifyClaim(claim, transactionHash) {
    if (transactionHash !== id('isolated-round-transaction')) throw Error('Treasury receipt does not match this payout.');
    return this.checkClaim(claim);
  },
};
async function until(fn, label) {
  const end = realNow() + 10000;
  while (realNow() < end) { const result = await fn(); if (result) return result; await delay(20); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 1100) { clock += ms; await delay(80); }
async function stored(index) {
  return (await admin.query(`SELECT state,pending_credits FROM ${schema}.mossvale_players WHERE account_key=$1`, [keys[index]])).rows[0];
}
const roundState = async () => (await operator.goldRounds(keys[0])).find(round => round.id === 'server-pilot');
const reserved = async () => (await admin.query(`SELECT COALESCE(SUM(amount_wei),0)::text AS amount FROM ${schema}.mossvale_treasure_claims`)).rows[0].amount;
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, index, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message)); client.player = () => client.snapshot?.players.find(player => player.id === heroes[index].id);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (message.type === 'snapshot') client.snapshot = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token: tokens[index], characterId: heroes[index].id });
  await until(() => client.player(), `character ${index} entry`); return client;
}
async function start() {
  const disabled = { status: async () => ({ enabled: false, reason: 'Isolated test.' }) };
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, databaseUrl, keycloak: null,
    treasuryChain, auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, nftChain: disabled,
    goldMerchantHoldings: async wallet => { holdingReads++; return { balanceWei: '100000000000000000000',
      valueUsdCents: wallet === wallets[4].address ? '2499' : '2500', checkedAt: clock }; } });
  port = await game.start();
}
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = undefined; }
async function request(client, message = { type: 'goldMerchantCheck' }, type = 'goldMerchantState', advance = 1100) {
  await tick(advance); const before = client.messages.length; client.send(message);
  try { return await until(() => client.messages.slice(before).find(item => item.type === type), `${message.type} for character ${client.index}`); }
  catch (error) { throw Error(`${error.message}; events: ${JSON.stringify(client.messages.slice(before).filter(item => item.type === 'event').map(item => item.text))}`); }
}
async function unchanged(client, message, pattern, type = 'goldMerchantState') {
  const before = await stored(client.index), round = await roundState(), response = await request(client, message, type);
  assert.match(response.state?.reason || response.text || response.message || '', pattern);
  assert.deepEqual((await stored(client.index)).state.characters[0].gold, before.state.characters[0].gold);
  assert.deepEqual(await roundState(), round, 'rejected actions cannot alter round escrow or awards');
  return response;
}
const offer = (gold, priceCentsPer1000) => ({ type: 'goldMerchantOffer', roundId: 'server-pilot', gold, priceCentsPer1000 });

try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'pipe', timeout: 20000 });
    container = `mossvale-gold-ws-${suffix}`;
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only',
      '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe', timeout: 120000 });
    const address = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8', timeout: 10000 }).trim();
    connectionString = `postgresql://postgres:isolated-test-only@${address}/postgres`;
  }
  const url = new URL(connectionString);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Only a disposable local PostgreSQL instance is permitted.');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
    try { await admin.connect(); break; } catch (error) { await admin.end(); if (attempt >= 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}`); url.searchParams.set('options', `-c search_path=${schema}`); databaseUrl = url.toString();
  operator = createPlayerStore({ connectionString: databaseUrl }); await operator.start();
  for (let index = 0; index < heroes.length; index++) await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state) VALUES($1,$2::jsonb)`,
    [keys[index], JSON.stringify({ characters: [heroes[index]] })]);
  const round = await operator.openGoldRound({ id: 'server-pilot', contract, startsAt: clock, endsAt: clock + 120000 }, await treasuryChain.quoteGoldBudget());
  assert.equal(await reserved(), capacityWei, 'opening backs the USD budget at its current token estimate');
  assert.equal(round.budgetWei, undefined, 'opening never fixes a token payout');
  await start();
  let [winner, partial, loser, young, poor, far, unlinked] = await Promise.all(heroes.map((_, index) => connect(index)));
  const opening = (await request(winner)).state.round;
  assert.equal(opening.budgetUsdCents, 100000); assert.equal(opening.estimatedMossWei, capacityWei); assert.equal(opening.budgetWei, undefined);
  await unchanged(young, offer(1000, 50), /level 30/i);
  await unchanged(poor, offer(1000, 50), /25|hold/i);
  await unchanged(unlinked, offer(1000, 50), /wallet|link/i);
  const priorReads = holdingReads;
  await unchanged(far, offer(1000, 50), /nearby/i, 'event'); assert.equal(holdingReads, priorReads, 'distant offers never query holdings');
  for (const message of [offer(0, 50), offer(-1, 50), offer(1.5, 50), offer(1000, 0), offer(1000, 101),
    offer(1000, 1.5), offer(2_000_001, 50), { ...offer(1000, 50), wallet: wallets[1].address }])
    await unchanged(winner, message, /invalid|gold|afford|enough/i);
  let response = await request(winner, offer(700000, 60));
  assert.equal(response.state.offer.gold, 700000); assert.equal((await stored(0)).state.characters[0].gold, 1300000);
  response = await request(winner, offer(800000, 50));
  assert.equal(response.state.offer.gold, 800000); assert.equal((await stored(0)).state.characters[0].gold, 1200000, 'offer update escrows only its increase');
  await request(winner, { type: 'goldMerchantCancel', roundId: round.id });
  assert.equal((await stored(0)).state.characters[0].gold, 2000000, 'cancellation returns all escrow');
  assert.equal((await roundState()).bids[keys[0]], undefined);
  await request(winner, offer(800000, 50));
  await request(partial, offer(900000, 100));
  await request(loser, offer(100000, 100));
  await unchanged(winner, { type: 'goldMerchantClaim', roundId: round.id }, /ended|closed|settled|award|ready/i);
  assert.equal(prepares, 0, 'no signature is issued while bidding is open');
  assert(!young.messages.some(message => message.type === 'goldMerchantState' && message.state.offer), 'offers stay private');
  priceUsdWei = parseUnits('0.5', 18).toString();
  const repriced = (await request(winner, { type: 'goldMerchantCheck' }, 'goldMerchantState', 16000)).state.round;
  assert.equal(repriced.budgetUsdCents, 100000); assert.equal(repriced.estimatedMossWei, parseUnits('2000', 18).toString());
  assert.equal(repriced.budgetWei, undefined, 'MOSS estimate changes during bidding while the USD budget stays fixed');
  await request(partial, { type: 'leaveWorld' }, 'roster');
  await request(loser, { type: 'leaveWorld' }, 'roster');
  quoteStale = true; clock = round.endsAt;
  await request(winner, { type: 'goldMerchantCheck' }, 'goldMerchantState', 0);
  assert.equal((await roundState()).status, 'open', 'stale close price preserves the unresolved round');
  assert.equal((await roundState()).closingPrice, undefined, 'a stale quote cannot lock payouts');
  assert.equal((await stored(1)).pending_credits[heroes[1].id] || 0, 0, 'a rejected close cannot refund escrow or burn sold gold');
  assert.equal(prepares, 0);
  quoteStale = false;
  const waiting = (await request(winner, { type: 'goldMerchantCheck' }, 'goldMerchantState', 6000)).state.round;
  assert.equal((await roundState()).status, 'open', 'insufficient MOSS cannot partially settle a fixed dollar budget');
  assert.equal((await roundState()).budgetWei, undefined); assert.equal(prepares, 0);
  const closingPrice = (await roundState()).closingPrice;
  assert.equal(closingPrice.usdWei, priceUsdWei, 'first valid close price persists while funding is insufficient');
  assert.equal(waiting.closingMossWei, parseUnits('2000', 18).toString());
  assert.equal(await reserved(), parseUnits('2000', 18).toString(), 'closing price locks the permanent obligation without spending player gold');
  assert.equal((await stored(1)).pending_credits[heroes[1].id] || 0, 0);
  priceUsdWei = parseUnits('0.25', 18).toString(); quoteUnavailable = true;
  capacityWei = parseUnits('2000', 18).toString();
  const readsBeforeFunding = quoteReads, fundsBeforeRetry = fundingReads; await tick(6000);
  await until(async () => (await roundState()).status === 'settled', 'deadline timer settles without a merchant request');
  assert.equal(quoteReads, readsBeforeFunding, 'funding retry never reprices the locked close, even through an oracle outage');
  assert(fundingReads > fundsBeforeRetry, 'funding retry verifies current treasury capacity');
  const settled = await roundState();
  assert.equal(settled.budgetUsdCents, 100000); assert.equal(settled.budgetWei, capacityWei); assert.deepEqual(settled.settlementPrice, closingPrice);
  assert.equal(settled.bids[keys[0]].filledGold, 800000); assert.equal(settled.bids[keys[0]].payoutUsdMicros, '400000000');
  assert.equal(settled.bids[keys[0]].payoutWei, parseUnits('800', 18).toString());
  assert.equal(settled.bids[keys[1]].filledGold, 600000); assert.equal(settled.bids[keys[1]].payoutUsdMicros, '600000000');
  assert.equal(settled.bids[keys[1]].payoutWei, parseUnits('1200', 18).toString());
  assert.equal(settled.bids[keys[2]].filledGold, 0); assert.equal(settled.bids[keys[2]].payoutWei, '0');
  assert.equal((await stored(1)).pending_credits[heroes[1].id], 300000, 'offline partial fill receives its exact refund');
  assert.equal((await stored(2)).pending_credits[heroes[2].id], 100000, 'offline losing offer receives its entire escrow');
  await unchanged(winner, offer(1, 50), /closed|ended/i);
  priceUsdWei = parseUnits('4', 18).toString(); const readsAfterClose = quoteReads;
  response = await request(winner, { type: 'goldMerchantClaim', roundId: round.id });
  const claim = response.state.claims[0]; assert(treasureClaimValid(claim)); assert.equal(claim.amountWei, parseUnits('800', 18).toString());
  assert.equal(quoteReads, readsAfterClose, 'claim retains close-price MOSS despite a later eightfold price increase');
  assert.equal(claim.wallet, wallets[0].address); assert.equal(claim.goldRoundId, round.id); assert.equal(prepares, 1);
  assert.equal(await reserved(), capacityWei, 'claim moves the round reserve to permanent issued liability without changing its total');
  await request(winner, { type: 'goldMerchantClaim', roundId: round.id }); assert.equal(prepares, 1, 'duplicate claim reuses its saved authorization');
  await unchanged(young, { type: 'goldMerchantPayoutCheck', claimId: claim.id }, /does not belong/i);
  await request(winner, { type: 'goldMerchantPayoutCheck', claimId: claim.id });
  assert.equal((await stored(0)).state.characters[0].treasureClaims[0].status, 'pending');
  payments.set(claim.claimHash, 'processed');
  await request(winner, { type: 'goldMerchantSubmitted', claimId: claim.id, transactionHash: id('isolated-round-transaction') });
  assert.equal((await stored(0)).state.characters[0].treasureClaims[0].status, 'processed');
  payments.set(claim.claimHash, 'paid');
  await request(winner, { type: 'goldMerchantPayoutCheck', claimId: claim.id });
  assert.equal((await stored(0)).state.characters[0].treasureClaims[0].status, 'paid');
  assert.equal((await stored(0)).state.characters[0].gold, 1200000, 'payout checks never refund sold gold');
  await stop(); await start();
  [winner, partial, loser] = await Promise.all([0, 1, 2].map(connect));
  await request(partial); await request(loser);
  await until(async () => (await stored(1)).state.characters[0].gold === 1400000, 'offline partial refund collected on reconnect');
  await until(async () => (await stored(2)).state.characters[0].gold === 2000000, 'losing escrow restored on reconnect');
  assert.equal(await operator.settleGoldRounds(), 0, 'restart cannot settle or refund the round twice');
  response = await request(winner); assert.equal(response.state.claims[0].claimHash, claim.claimHash); assert.equal(response.state.claims[0].status, 'paid');
  await request(winner, { type: 'goldMerchantClaim', roundId: round.id }); assert.equal(prepares, 1);
  // A later round's funding shortfall cannot prevent collecting an already reserved fixed award.
  quoteUnavailable = false; capacityWei = parseUnits('2250', 18).toString();
  const later = await operator.openGoldRound({ id: 'server-later', contract, startsAt: clock, endsAt: clock + 10000 }, await treasuryChain.quoteGoldBudget());
  assert.equal(await reserved(), capacityWei, 'a new USD round initially fits beside the previous fixed awards');
  await request(loser, { type: 'goldMerchantOffer', roundId: later.id, gold: 1000000, priceCentsPer1000: 100 });
  priceUsdWei = parseUnits('0.25', 18).toString(); clock = later.endsAt;
  await request(loser, { type: 'goldMerchantCheck' }, 'goldMerchantState', 0);
  const laterState = (await operator.goldRounds(keys[2])).find(item => item.id === later.id);
  assert.equal(laterState.status, 'open'); assert.equal(laterState.closingPrice.usdWei, priceUsdWei);
  const combinedLiability = await reserved(), readsBeforePriorAward = quoteReads;
  assert.equal(combinedLiability, parseUnits('6000', 18).toString());
  assert.equal((await stored(2)).pending_credits[heroes[2].id] || 0, 0, 'underfunded new round preserves its gold escrow');
  quoteUnavailable = true;
  response = await request(partial, { type: 'goldMerchantClaim', roundId: round.id }, 'goldMerchantState', 6000);
  assert.equal(response.state.claims[0].amountWei, parseUnits('1200', 18).toString()); assert.equal(prepares, 2);
  assert.equal(await reserved(), combinedLiability, 'issuing a prior award transfers its reserve without adding liability');
  assert.equal(quoteReads, readsBeforePriorAward, 'a newer unfunded close and oracle outage do not reprice a prior award');
  await request(partial, { type: 'goldMerchantPayoutCheck', claimId: response.state.claims[0].id });
  assert.equal((await stored(1)).state.characters[0].treasureClaims[0].status, 'pending');
  assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${schema}.mossvale_treasure_claims`)).rows[0].count, 3, 'two permanent claims coexist with the newer locked round reserve');
  console.log('PASS gold merchant rounds: local PostgreSQL and real sockets, fixed USD budget, changing MOSS estimate, single close-price lock, stale/underfunded close retries, no repricing at claim, prior awards during a newer funding shortfall, offer gates/update/cancel, automatic cheapest/partial fills, offline refunds, private payment recovery and restart idempotency. No real RPC or transactions.');
} finally {
  await stop(); await operator?.close();
  if (admin) { try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); } }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe', timeout: 20000 });
  Date.now = realNow; rmSync(directory, { recursive: true, force: true });
}
