import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Wallet, TypedDataEncoder, id, parseUnits } from 'ethers';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { SHADY_MERCHANT } from '../src/settlements.ts';
import { canTraverse } from '../src/realm.ts';
import { MOSS_TOKEN } from '../src/auction.ts';
import { TREASURE_CLAIM_TYPES, treasureContractClaim, treasureClaimValid, treasurePlayerValid, treasureUsdAmount, treasureNextRedemptionAt } from '../src/treasure-rewards.ts';
import { treasuryInterface } from '../src/treasury-chain.mjs';

// Real sockets, signing, atomic file saves, and restart. The separate database check covers cross-realm capacity locking.
const directory = mkdtempSync(join(tmpdir(), 'mossvale-treasury-ws-')), file = join(directory, 'players.json');
const authority = Wallet.createRandom(), wallets = [Wallet.createRandom(), Wallet.createRandom(), Wallet.createRandom()], contract = Wallet.createRandom().address;
const domain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: 4663, verifyingContract: contract };
const realNow = Date.now, tokens = wallets.map(() => randomBytes(32).toString('base64url')), clients = [];
const hash = token => createHash('sha256').update(token).digest('hex');
let clock = Date.UTC(2026, 8, 21, 12), game, port, enabled = false, capacityWei = parseUnits('1000000', 18).toString(), prepares = 0, releaseStatus, heldStatus;
let priceUnavailable = false, signedClaims = 0, statusCalls = 0, statusUnavailable = false, claimChecks = 0, claimVerifications = 0;
let holdingsValue = '3000', holdingsAge = 0, holdingsUnavailable = false;
const holdingsReads = [];
const treasuryHoldings = async wallet => {
  holdingsReads.push(wallet);
  if (holdingsUnavailable) throw Error('Private RPC failure.');
  return { valueUsdCents: holdingsValue, checkedAt: clock - holdingsAge };
};
let heldCheck, releaseCheck;
let priceUsdWei = parseUnits('0.003001', 18).toString(), settledClaimHash;
let settlement = 'pending', settlementUnavailable = false, revokeSettlement = true, blockHash = id('included-block'), blockNumber = '0x1234', rejectedHash = id('unrelated-transaction');
Date.now = () => clock;
const heroes = wallets.map((wallet, i) => ({ id: randomUUID(), name: `Treasury tester ${i}`, x: i === 2 ? 0 : SHADY_MERCHANT.x, z: i === 2 ? 8 : SHADY_MERCHANT.z,
  zone: 'greenwood', coordinateVersion: 2, rotation: 0, characterCreated: true,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  ...starterGear('Ranger'), talents: [], level: 60, hp: 808, maxHp: 808, xp: 0, gold: 0, auctionWallet: wallet.address,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, carriedItems: { 'moss-voucher': i === 1 ? 3 : 2 }, quest: { stage: 0, kills: 0, crystals: 0 } }));
const sibling = { ...structuredClone(heroes[0]), id: randomUUID(), name: 'Treasury sibling' };
const dailyLimit = /only one MOSS voucher per account per day.*00:00 UTC/;
const treasuryChain = {
  async status() {
    statusCalls++;
    if (heldStatus) { heldStatus.arrived = true; await heldStatus.promise; }
    if (statusUnavailable) throw Error('Isolated status failure.');
    return { configured: true, enabled, chainId: 4663, contract, token: MOSS_TOKEN.address, capacityWei, ...(enabled ? {} : { reason: 'The treasury needs funding.' }) };
  },
  async prepareClaim(input) {
    prepares++;
    assert(Number.isSafeInteger(input.usdCents) && (input.usdCents >= 200 && input.usdCents <= 500 || input.usdCents >= 600 && input.usdCents <= 1000));
    assert.equal(input.amount, undefined, 'the server rolls USD value instead of a fixed token amount');
    assert.equal(input.price, undefined, 'pricing belongs to the trusted chain adapter');
    if (priceUnavailable) throw Error('The MOSS price is unavailable. Your voucher was kept.');
    const priced = { ...input, amount: treasureUsdAmount(input.usdCents, priceUsdWei), price: { usdWei: priceUsdWei, observedAt: clock } };
    const contractClaim = treasureContractClaim(priced), signature = await authority.signTypedData(domain, TREASURE_CLAIM_TYPES, contractClaim);
    signedClaims++;
    const claim = { ...priced, wallet: contractClaim.recipient, amountWei: contractClaim.amountWei, createdAt: clock, chainId: 4663,
      token: MOSS_TOKEN.address, contract, status: 'pending', contractClaim, signature, claimHash: TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, contractClaim),
      transaction: { to: contract, data: treasuryInterface.encodeFunctionData('claim', [contractClaim, signature]), value: '0x0', chainId: '0x1237' } };
    assert(treasureClaimValid(claim)); return { claim, capacityWei };
  },
  async checkClaim(claim) {
    claimChecks++;
    if (heldCheck) {heldCheck.arrived=true;await heldCheck.promise;}
    assert(treasureClaimValid(claim));
    if (settlementUnavailable) throw Error('Isolated settlement RPC failure.');
    return { state: settlement, claimHash: claim.claimHash, ...(settlement === 'pending' ? { revoked: revokeSettlement && !!claim.paymentBlock } : { blockHash, blockNumber, ...(settledClaimHash ? {settledClaimHash} : {}) }) };
  },
  async refreshClaim(previous) {
    if (settlementUnavailable || settlement !== 'pending') throw Error('Check the existing payout before refreshing.');
    const {id,realmId,characterId,wallet,usdCents} = previous;
    const result = await this.prepareClaim({id,realmId,characterId,wallet,usdCents});
    if (result.claim.claimHash === previous.claimHash) return {...result,claim:previous};
    const {previousQuotes = [], transactionHash, paymentBlock, paidAt, settledClaimHash, ...snapshot} = previous;
    return {...result,claim:{...result.claim,previousQuotes:[...previousQuotes,snapshot]}};
  },
  async verifyClaim(claim, transactionHash) {
    claimVerifications++;
    if (transactionHash === rejectedHash) throw Error('Treasury receipt does not match this payout.');
    return this.checkClaim(claim);
  },
};
const storedAccount = index => JSON.parse(readFileSync(file, 'utf8'))[hash(tokens[index])];
const stored = (index, characterId = heroes[index].id) => storedAccount(index).characters.find(p => p.id === characterId);
async function until(fn, label) {
  const end = realNow() + 6000;
  while (realNow() < end) { const result = fn(); if (result) return result; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 1100) { clock += ms; await delay(120); }
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, index, characterId: heroes[index].id, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message)); client.player = () => client.snapshot?.players.find(p => p.id === client.characterId);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (message.type === 'snapshot') client.snapshot = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token: tokens[index], characterId: heroes[index].id }); await until(() => client.player(), 'character entry'); return client;
}
async function start(seed = false) {
  if (seed) writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((hero, i) => [hash(tokens[i]), { characters: i === 0 ? [hero, sibling] : [hero] }]))));
  const disabled = { status: async () => ({ enabled: false, reason: 'Isolated fixture.' }) };
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, databaseUrl: '', keycloak: null, treasuryChain, treasuryHoldings, auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled });
  port = await game.start(); return [await connect(0), await connect(1), await connect(2)];
}
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = undefined; }
async function request(client, message) {
  await tick(); const before = client.messages.length; client.send(message);
  return until(() => client.messages.slice(before).find(m => m.type === 'treasureState'), message.type);
}
async function unchanged(client, message, pattern) {
  const saved = () => ({ claims: stored(client.index, client.characterId).treasureClaims, vouchers: stored(client.index, client.characterId).carriedItems['moss-voucher'], lastClaim: storedAccount(client.index).lastTreasureClaimAt });
  const before = saved();
  const response = await request(client, message); assert.match(response.message, pattern);
  assert.deepEqual(saved(), before); return response;
}
async function select(client, characterId) {
  client.characterId = characterId; client.snapshot = undefined;
  client.send({ type: 'selectCharacter', characterId }); await until(() => client.player(), 'character selection');
}
async function move(client, point) {
  const from = client.player(), steps = Math.ceil(Math.hypot(point.x - from.x, point.z - from.z) / 2);
  for (let i = 1; i <= steps; i++) {
    const next = { x: from.x + (point.x - from.x) * i / steps, z: from.z + (point.z - from.z) * i / steps };
    assert(canTraverse(client.player(), next)); clock += 400; client.send({ type: 'move', ...next, rotation: 0 });
    await until(() => Math.hypot(client.player().x - next.x, client.player().z - next.z) < .02, 'legal merchant movement');
  }
}
try {
  let [owner, other, distant] = await start(true);
  // Multiple characters share one in-flight status and the resulting disabled cache.
  heldStatus = { promise: new Promise(resolve => { releaseStatus = resolve; }), arrived: false };
  const concurrentOpens = [request(owner, { type: 'treasureOpen' }), request(other, { type: 'treasureOpen' })];
  await until(() => heldStatus.arrived, 'shared merchant status'); await delay(100);
  assert.equal(statusCalls, 1, 'concurrent merchants share the same in-flight status check');
  releaseStatus(); heldStatus = undefined;
  const firstStates = await Promise.all(concurrentOpens);
  assert(firstStates.every(reply => !reply.state.enabled)); assert.equal(statusCalls, 1);
  assert(firstStates.every(reply => reply.state.nextRedemptionAt === 0), 'unused accounts have no daily redemption limit');
  await unchanged(owner, { type: 'treasureRedeem' }, /funding/); assert.equal(prepares, 0, 'empty treasury does not create a claim');
  enabled = true;
  assert.equal((await request(other, { type: 'treasureOpen' })).state.enabled, false);
  assert.equal(statusCalls, 1, 'disabled status is cached across characters');
  await tick(10001);
  assert.equal((await request(owner, { type: 'treasureOpen' })).state.enabled, true);
  assert.equal(statusCalls, 2, 'status refreshes after the ten-second TTL');
  statusUnavailable = true; await tick(10001);
  const failedStatus = await request(owner, { type: 'treasureOpen' });
  assert.equal(failedStatus.state.enabled, false); assert.match(failedStatus.state.reason, /temporarily unavailable/);
  const failedCalls = statusCalls; statusUnavailable = false;
  await unchanged(other, { type: 'treasureRedeem' }, /temporarily unavailable/);
  assert.equal(statusCalls, failedCalls, 'failed status is cached to prevent retries from every merchant');
  assert.equal(prepares, 0);
  await tick(10001);
  assert.equal((await request(owner, { type: 'treasureOpen' })).state.enabled, true);
  assert.equal(statusCalls, failedCalls + 1, 'a cached failure can recover after its TTL');
  for (const extra of [{ amount: 1000 }, { usdCents: 3000 }, { price: { usdWei: priceUsdWei, observedAt: clock } }, { wallet: wallets[1].address }, { contract: wallets[1].address }])
    await unchanged(owner, { type: 'treasureRedeem', ...extra }, /Invalid/);
  await unchanged(distant, { type: 'treasureRedeem' }, /Visit Veyl/);
  await unchanged(owner, { type: 'treasureCheck', claimId: id('invented') }, /does not belong/);
  const preparesBeforeHoldings = prepares;
  for (holdingsValue of ['0', '2999']) await unchanged(owner, { type: 'treasureRedeem' }, /Hold at least \$30/);
  for (holdingsValue of [undefined, 3000, '-1', '3000.1', 'invalid'])
    await unchanged(owner, { type: 'treasureRedeem' }, /holdings could not be verified/);
  holdingsValue = '3000';
  for (holdingsAge of [15000, -1]) await unchanged(owner, { type: 'treasureRedeem' }, /holdings could not be verified/);
  holdingsAge = 0; holdingsUnavailable = true;
  const unavailableHoldings = await unchanged(owner, { type: 'treasureRedeem' }, /holdings could not be verified/);
  assert.equal(unavailableHoldings.state.nextRedemptionAt, 0);
  holdingsUnavailable = false;
  assert.equal(prepares, preparesBeforeHoldings, 'underfunded, stale or unverified holdings never roll or sign a reward');
  assert(holdingsReads.every(wallet => wallet === wallets[0].address), 'the linked recipient supplies the balance');
  priceUnavailable = true;
  const signedBeforePriceFailure = signedClaims;
  try { assert.equal((await unchanged(owner, { type: 'treasureRedeem' }, /price.*unavailable/)).state.nextRedemptionAt, 0); }
  finally { priceUnavailable = false; }
  assert.equal(signedClaims, signedBeforePriceFailure, 'failed price verification reveals no signed authorization');
  assert.equal(stored(0).carriedItems['moss-voucher'], 2, 'failed pricing preserves both vouchers');

  // An authorization signed while the player walks away is never exposed or charged.
  await tick(10001);
  heldStatus = { promise: new Promise(resolve => { releaseStatus = resolve; }), arrived: false };
  await tick(); const heldStart = owner.messages.length; owner.send({ type: 'treasureRedeem' }); await until(() => heldStatus.arrived, 'treasury verification held');
  const home = { x: owner.player().x, z: owner.player().z };
  const away = [{ x: home.x + 4, z: home.z }, { x: home.x - 4, z: home.z }, { x: home.x, z: home.z + 4 }, { x: home.x, z: home.z - 4 }].find(p => canTraverse(home, p)); assert(away);
  await move(owner, away); releaseStatus(); heldStatus = undefined;
  const abandoned = await until(() => owner.messages.slice(heldStart).find(m => m.type === 'treasureState'), 'abandoned claim rejected');
  assert.match(abandoned.message, /kept/); assert.equal(abandoned.state.claims.length, 0); assert.equal(stored(0).carriedItems['moss-voucher'], 2); await move(owner, home);

  // Failed durable writes keep the voucher and reveal no signed claim.
  await delay(1100); mkdirSync(`${file}.tmp`);
  try { assert.equal((await unchanged(owner, { type: 'treasureRedeem' }, /EISDIR|saved|directory/)).state.nextRedemptionAt, 0); } finally { rmSync(`${file}.tmp`, { recursive: true }); }
  const response = await request(owner, { type: 'treasureRedeem' }); let claim = response.state.claims[0];
  assert(treasureClaimValid(claim)); assert.equal(claim.wallet, wallets[0].address); assert.equal(claim.characterId, heroes[0].id); assert.equal(claim.realmId, 'eu');
  assert.equal(typeof claim.amount, 'string'); assert.equal(claim.amount, treasureUsdAmount(claim.usdCents, priceUsdWei));
  assert(BigInt(claim.amountWei) > parseUnits('600', 18) && BigInt(claim.amountWei) % parseUnits('1', 18) !== 0n, 'USD payout preserves fractional tokens without rounding to whole tokens');
  assert.deepEqual(claim.price, { usdWei: priceUsdWei, observedAt: claim.createdAt });
  assert.equal(response.state.vouchers, 1); assert.deepEqual(stored(0).treasureClaims, [claim]);
  const resetAt = Date.UTC(2026, 8, 22);
  assert.equal(response.state.nextRedemptionAt, resetAt); assert.equal(storedAccount(0).lastTreasureClaimAt, claim.createdAt);
  assert.equal(treasureNextRedemptionAt({ characters: [{ treasureClaims: [{ createdAt: clock, goldRoundId: 'round-1' }] }] }), 0, 'gold round payouts never consume a voucher allowance');
  assert(!other.snapshot.players.some(p => p.treasureClaims?.length), 'signatures are private to their owner');
  assert.equal(holdingsValue, '3000', 'exactly $30 of MOSS permits new redemption');
  const readsBeforeRefresh = holdingsReads.length; holdingsValue = '0'; holdingsUnavailable = true;
  const originalClaim = structuredClone(claim);
  await unchanged(other, {type:'treasureRefresh',claimId:claim.id}, /does not belong/);
  await unchanged(owner, {type:'treasureRefresh',claimId:claim.id,usdCents:3000}, /Invalid/);
  await unchanged(distant, {type:'treasureRefresh',claimId:claim.id}, /Visit Veyl/);
  await unchanged(owner, {type:'treasureRefresh',claimId:claim.id}, /already current/);
  priceUsdWei = parseUnits('0.006002',18).toString();
  priceUnavailable = true;
  try { await unchanged(owner, {type:'treasureRefresh',claimId:claim.id}, /price.*unavailable/); } finally {priceUnavailable=false;}
  await delay(1100); mkdirSync(`${file}.tmp`);
  try {await unchanged(owner, {type:'treasureRefresh',claimId:claim.id}, /EISDIR|saved|directory/);} finally {rmSync(`${file}.tmp`,{recursive:true});}
  heldCheck={promise:new Promise(resolve=>{releaseCheck=resolve;}),arrived:false};
  await tick(); const beforeHeldCheck=owner.messages.length; owner.send({type:'treasureCheck',claimId:claim.id});
  await until(()=>heldCheck.arrived,'settlement read held before a newer refresh');
  const refreshed = await request(owner, {type:'treasureRefresh',claimId:claim.id}); claim=refreshed.state.claims[0];
  releaseCheck();heldCheck=undefined;
  await until(()=>owner.messages.slice(beforeHeldCheck).find(message=>message.type==='treasureState'&&/changed during verification/.test(message.message||'')),'stale settlement cannot overwrite a refreshed claim');
  assert.equal(claim.id,originalClaim.id); assert.equal(claim.usdCents,originalClaim.usdCents);
  assert.equal(claim.contractClaim.claimId,originalClaim.contractClaim.claimId,'repricing shares one on-chain payment identity');
  assert(BigInt(claim.amountWei)<BigInt(originalClaim.amountWei)); assert.deepEqual(claim.previousQuotes,[originalClaim]);
  assert.equal(refreshed.state.vouchers,1,'repricing never consumes another voucher');
  assert.equal(refreshed.state.nextRedemptionAt, resetAt); assert.equal(storedAccount(0).lastTreasureClaimAt, originalClaim.createdAt, 'quote refresh preserves the original redemption timestamp');
  assert.deepEqual(stored(0).treasureClaims,[claim],'fresh signature is durable before exposure');
  const calls = prepares;
  await unchanged(owner, { type: 'treasureRedeem' }, /saved|Finish/); assert.equal(prepares, calls, 'repeat redeem reuses pending amount and signature');
  await unchanged(other, { type: 'treasureCheck', claimId: claim.id }, /does not belong/);
  await unchanged(owner, { type: 'treasureSubmitted', claimId: claim.id, transactionHash: '0x1234' }, /Invalid/);
  await unchanged(owner, { type: 'treasureSubmitted', claimId: claim.id, transactionHash: rejectedHash }, /does not match/);
  await tick(10001); await request(owner, { type: 'treasureOpen' });
  assert.equal(holdingsReads.length, readsBeforeRefresh, 'saved payout refresh/check/submission bypass the holdings minimum');
  holdingsValue = '3000'; holdingsUnavailable = false;
  const statusBeforeCapacityChange = statusCalls, preparesBeforeCapacityChange = prepares;
  capacityWei = claim.amountWei;
  await unchanged(other, { type: 'treasureRedeem' }, /funding|kept/); assert.equal(stored(1).treasureClaims.length, 0, 'all outstanding claims consume capacity');
  assert.equal(statusCalls, statusBeforeCapacityChange);
  assert.equal(prepares, preparesBeforeCapacityChange + 1, 'fresh claim capacity overrides a cached funded merchant status');

  capacityWei = '0';
  await unchanged(other, { type: 'treasureRedeem' }, /funding|kept/); assert.deepEqual(stored(0).treasureClaims, [claim], 'withdrawal below reserved liabilities keeps existing claims and unredeemed vouchers');
  assert.equal(statusCalls, statusBeforeCapacityChange);
  assert.equal(prepares, preparesBeforeCapacityChange + 2, 'each attempted issuance checks current capacity independently');

  await stop(); [owner, other, distant] = await start();
  const resumed = await request(owner, { type: 'treasureOpen' }); assert.deepEqual(resumed.state.claims, [claim]); assert.equal(resumed.state.vouchers, 1);
  assert.equal(resumed.state.nextRedemptionAt, resetAt, 'the daily limit survives restart');
  const submitted = await request(owner, { type: 'treasureSubmitted', claimId: claim.id, transactionHash: id('matching-transaction') });
  assert.equal(submitted.state.claims[0].status, 'pending'); assert.equal(submitted.state.claims[0].transactionHash, id('matching-transaction'));
  assert.match(submitted.message, /Checking for payment/);
  await unchanged(owner, {type:'treasureRefresh',claimId:claim.id}, /submitted payout/);
  await unchanged(owner, { type: 'treasureCheck', claimId: claim.id }, /Checking for payment/);
  settlementUnavailable = true;
  try { await unchanged(owner, { type: 'treasureCheck', claimId: claim.id }, /RPC failure/); } finally { settlementUnavailable = false; }
  assert.equal(stored(0).treasureClaims[0].transactionHash, id('matching-transaction'), 'ordinary pending and unavailable RPC never authorize resubmission');
  settlement = 'processed';
  await delay(1100); mkdirSync(`${file}.tmp`);
  try { await unchanged(owner, { type: 'treasureCheck', claimId: claim.id }, /EISDIR|saved|directory/); } finally { rmSync(`${file}.tmp`, { recursive: true }); }
  assert.equal(stored(0).treasureClaims[0].status, 'pending', 'an unsaved settlement cannot unlock the next voucher');
  const paidOnInclusion = await request(owner, { type: 'treasureCheck', claimId: claim.id });
  await unchanged(owner, {type:'treasureRefresh',claimId:claim.id}, /submitted payout/);
  assert.match(paidOnInclusion.message, /MOSS paid to your wallet/); assert.doesNotMatch(paidOnInclusion.message, /waiting|final/i);
  assert.equal(stored(0).treasureClaims[0].status, 'processed'); assert.deepEqual(stored(0).treasureClaims[0].paymentBlock, { hash: blockHash, number: blockNumber }); assert(treasurePlayerValid(stored(0)));
  const preparesBeforeLimit = prepares;
  assert.equal((await unchanged(owner, { type: 'treasureRedeem' }, dailyLimit)).state.nextRedemptionAt, resetAt);
  assert.equal(prepares, preparesBeforeLimit, 'processed payout cannot issue another claim on the same UTC day');
  await unchanged(other, { type: 'treasureRedeem' }, /funding|kept/);
  assert.equal(stored(0).carriedItems['moss-voucher'], 1, 'processed claims still reserve treasury capacity');
  capacityWei = parseUnits('1000000', 18).toString();
  const otherResponse = await request(other, { type: 'treasureRedeem' }), otherClaim = otherResponse.state.claims[0];
  assert(treasureClaimValid(otherClaim), 'failed funding attempts do not consume the daily allowance');
  settlement = 'paid'; await request(other, { type: 'treasureCheck', claimId: otherClaim.id });
  const preparesBeforePaidLimit = prepares;
  await unchanged(other, { type: 'treasureRedeem' }, dailyLimit);
  assert.equal(prepares, preparesBeforePaidLimit, 'finalized payout cannot issue another claim on the same UTC day');
  settlement = 'processed';
  await select(owner, sibling.id);
  assert.equal((await unchanged(owner, { type: 'treasureRedeem' }, dailyLimit)).state.nextRedemptionAt, resetAt, 'another character shares the account daily limit');
  await select(owner, heroes[0].id);
  await stop(); [owner, other, distant] = await start();
  clock = resetAt - 1101;
  await unchanged(owner, { type: 'treasureRedeem' }, dailyLimit);
  assert.equal(clock, resetAt - 1, 'the daily limit still applies one millisecond before UTC midnight after restart');
  const beforeNext = prepares, nextResponse = await request(owner, { type: 'treasureRedeem' }), nextClaim = nextResponse.state.claims[1];
  assert(treasureClaimValid(nextClaim)); assert.equal(prepares, beforeNext + 1, 'processed inclusion permits the next voucher on the next UTC day without finality');
  assert.equal(nextClaim.createdAt, resetAt + 1099); assert.equal(nextResponse.state.nextRedemptionAt, resetAt + 86400000);
  assert.equal(nextResponse.state.vouchers, 0); assert.equal(nextResponse.state.claims[0].status, 'processed');
  assert.equal(nextResponse.state.claims[0].signature, claim.signature); assert.equal(nextResponse.state.claims[0].paidAt, undefined, 'internal finality proof remains distinct from merchant completion');
  const savedClaims = stored(0).treasureClaims;
  await stop(); [owner, other, distant] = await start();
  assert.deepEqual((await request(owner, { type: 'treasureOpen' })).state.claims, savedClaims, 'processed history and the next pending authorization survive restart');
  settlement = 'pending'; revokeSettlement = false;
  await unchanged(owner, { type: 'treasureCheck', claimId: claim.id }, /could not be verified/);
  revokeSettlement = true;
  await delay(1100); mkdirSync(`${file}.tmp`);
  try { await unchanged(owner, { type: 'treasureCheck', claimId: claim.id }, /EISDIR|saved|directory/); } finally { rmSync(`${file}.tmp`, { recursive: true }); }
  assert.deepEqual(stored(0).treasureClaims, savedClaims, 'failed reorg persistence retains the processed proof and submitted hash');
  const resumedStatusCalls = statusCalls, previousClaimChecks = claimChecks;
  const revoked = await request(owner, { type: 'treasureSubmitted', claimId: claim.id, transactionHash: id('matching-transaction') });
  assert.equal(statusCalls, resumedStatusCalls); assert.equal(claimChecks, previousClaimChecks + 1, 'settlement checks stay fresh while status is cached');
  assert.match(revoked.message, /available again.*Retry/);
  assert.deepEqual(revoked.state.claims[0], claim, 'canonical revocation clears stale transaction metadata even when the check resends its old hash');
  assert.deepEqual(stored(0).treasureClaims[0], claim, 'retry preserves the exact amount, signature and signed wallet transaction');
  assert.equal(stored(0).carriedItems['moss-voucher'], undefined, 'reorg retries the same payout without refunding a signed claim');
  assert.deepEqual(stored(0).treasureClaims[1], nextClaim, 'reorg preserves the newer authorization');
  const preparesBeforeRecovery = prepares;
  const blocked = await unchanged(owner, { type: 'treasureRedeem' }, /Finish that payout first/);
  assert.equal(blocked.message, `Your ${claim.amount} MOSS claim is saved. Finish that payout first.`);
  assert.equal(prepares, preparesBeforeRecovery, 'the oldest revoked claim is reused without a new roll or signature');
  await stop(); [owner, other, distant] = await start();
  assert.deepEqual((await request(owner, { type: 'treasureOpen' })).state.claims, [claim, nextClaim], 'cleared reorg metadata and exact authorizations survive reconnect and restart');
  const recoveryStatusCalls = statusCalls;
  settlement = 'paid'; enabled = false; settledClaimHash = originalClaim.claimHash;
  const previousVerifications = claimVerifications;
  const oldQuotePaid = await request(owner, { type: 'treasureSubmitted', claimId: claim.id, transactionHash: id('matching-transaction') });
  assert.match(oldQuotePaid.message,new RegExp(originalClaim.amount.replace('.', '\\.')));
  assert.equal(statusCalls, recoveryStatusCalls); assert.equal(claimVerifications, previousVerifications + 1, 'submitted receipt verification is not cached');
  const paid = stored(0).treasureClaims[0]; assert.equal(paid.status, 'paid'); assert(paid.paidAt >= claim.createdAt); assert(treasurePlayerValid(stored(0)));
  assert.equal(paid.settledClaimHash,originalClaim.claimHash,'settlement records the actual known authorization without changing fixed USD');
  assert.equal(stored(0).carriedItems['moss-voucher'], undefined); assert.equal(stored(0).gold, 0, 'receipt verification never invents in-game gold or replacement vouchers');
  await stop(); [owner, other] = await start(); assert.deepEqual((await request(owner, { type: 'treasureOpen' })).state.claims, [paid, nextClaim]);
  enabled = true; settlement = 'pending'; settledClaimHash = undefined; await tick(10001);
  const dayTwoClaim = (await request(other, { type: 'treasureRedeem' })).state.claims[1];
  assert(treasureClaimValid(dayTwoClaim));
  clock = Date.UTC(2026, 8, 23, 12); priceUsdWei = parseUnits('0.012004', 18).toString();
  const dayThreeRefresh = await request(other, { type: 'treasureRefresh', claimId: dayTwoClaim.id });
  assert(treasureClaimValid(dayThreeRefresh.state.claims[1]));
  assert.equal(dayThreeRefresh.state.nextRedemptionAt, resetAt + 86400000, 'a later-day quote refresh does not consume that day\'s allowance');
  assert.equal(storedAccount(1).lastTreasureClaimAt, dayTwoClaim.createdAt);
  assert.equal(treasureNextRedemptionAt({ characters: [{ treasureClaims: dayThreeRefresh.state.claims }] }), resetAt + 86400000, 'legacy histories use the original quote date even without an account marker');
  settlement = 'paid'; await request(other, { type: 'treasureCheck', claimId: dayTwoClaim.id });
  const dayThreeClaim = (await request(other, { type: 'treasureRedeem' })).state.claims[2];
  assert(treasureClaimValid(dayThreeClaim), 'refreshing an old payout leaves the new day\'s voucher available');
  console.log('PASS: one voucher per account per UTC day across characters/restart, processed/paid daily limits, midnight reset, failed pricing/funding/saving keeps daily allowance, refreshed quotes retain the original redemption day, gold round payouts are excluded, next-day redemption without finality, submitted transaction recovery, settlement save rollback, durable processed/next-claim restart, reorg restores the oldest unchanged authorization without refund/reroll, permanent capacity reservations, shared status cache, fresh authorization/settlement/receipt checks, treasury WS boundaries, trusted fractional USD pricing, proximity, private claims and wrong receipts.');
} finally { releaseStatus?.(); heldStatus = undefined; releaseCheck?.(); heldCheck=undefined; rmSync(`${file}.tmp`, { recursive: true, force: true }); await stop(); Date.now = realNow; rmSync(directory, { recursive: true, force: true }); }
