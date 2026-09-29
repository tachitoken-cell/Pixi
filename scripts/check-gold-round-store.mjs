import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Wallet, Interface, TypedDataEncoder, parseUnits, formatUnits, id } from 'ethers';
import { createPlayerStore } from '../src/player-store.mjs';
import { readGoldStats } from '../src/gold-stats.mjs';
import { goldEvent } from '../src/gold-ledger.mjs';
import { MOSS_TOKEN } from '../src/auction.ts';
import { TREASURE_ABI, TREASURE_CLAIM_TYPES, TREASURE_MAX_CLAIMS, goldUsdAmountWei, treasureUsdAmount, treasureContractClaim, treasurePlayerValid, treasureQuotes } from '../src/treasure-rewards.ts';

// Never reads production DATABASE_URL or realm secrets; one disposable local schema per run.
const suffix = randomUUID().replaceAll('-', ''), schema = `gold_round_${suffix}`;
const authority = Wallet.createRandom(), wallet = Wallet.createRandom(), contract = Wallet.createRandom().address;
const abi = new Interface(TREASURE_ABI), stores = [], fatals = [];
const key = name => createHash('sha256').update(`${schema}:${name}`).digest('hex');
const copy = value => structuredClone(value), amount = value => parseUnits(String(value), 18).toString();
const conflict = error => error.code === 'PLAYER_STORE_CONFLICT';
const realNow = Date.now;
let clock = Date.UTC(2026, 8, 21, 12);
Date.now = () => clock;
let container, admin, pool;
const account = gold => ({ characters: [{ id: randomUUID(), name: 'Test hero', gold, auctionWallet: wallet.address,
  carriedItems: { 'moss-voucher': 2 }, auctions: [], auctionSales: [], friendIds: [], friendRequestIds: [], ignoreIds: [], treasureClaims: [] }] });
async function makeClaim(characterId, realmId, moss, goldRoundId, recipient = wallet.address) {
  const createdAt = Date.now(), reward = typeof moss === 'object' ? { usdCents: moss.usdCents, price: { usdWei: amount(moss.priceUsd), observedAt: createdAt } } : {};
  const input = { id: typeof moss === 'object' && moss.id || randomUUID(), characterId, realmId, wallet: recipient,
    amount: reward.price ? treasureUsdAmount(reward.usdCents, reward.price.usdWei) : goldRoundId ? formatUnits(parseUnits(String(moss), 18), 18) : moss, ...reward,
    ...(goldRoundId ? { goldRoundId } : {}) };
  const contractClaim = treasureContractClaim(input), domain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: 4663, verifyingContract: contract };
  const signature = await authority.signTypedData(domain, TREASURE_CLAIM_TYPES, contractClaim);
  return { ...input, amountWei: contractClaim.amountWei, createdAt, chainId: 4663, token: MOSS_TOKEN.address, contract,
    status: 'pending', signature, contractClaim, claimHash: TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, contractClaim),
    transaction: { to: contract, data: abi.encodeFunctionData('claim', [contractClaim, signature]), value: '0x0', chainId: '0x1237' } };
}
async function refreshClaim(previous, priceUsd) {
  const next = await makeClaim(previous.characterId, previous.realmId, { id: previous.id, usdCents: previous.usdCents, priceUsd });
  const { previousQuotes = [], status, transactionHash, paymentBlock, paidAt, settledClaimHash, ...authorization } = previous;
  return { ...next, previousQuotes: [...previousQuotes, { ...authorization, status: 'pending' }] };
}
const reservation = (claim, capacity = 208) => ({ claimHash: claim.claimHash, contract, amountWei: claim.amountWei, capacityWei: amount(capacity) });
const funding = (round, priceUsd = 10, capacity = 108, balance = 100) => ({
  roundId: round.id, contract, capacityWei: amount(capacity), balanceWei: amount(balance),
  amountWei: goldUsdAmountWei((BigInt(round.budgetUsdCents ?? 100_000) * 10000n).toString(), amount(priceUsd)),
  price: { usdWei: amount(priceUsd), observedAt: Date.now() },
});
const withClaim = (state, claim) => { const next = copy(state); next.characters[0].treasureClaims.push(claim); return next; };
try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'pipe', timeout: 20000 });
    container = `mossvale-gold-round-${suffix}`;
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only',
      '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe', timeout: 120000 });
    const address = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8', timeout: 10000 }).trim();
    connectionString = `postgresql://postgres:isolated-test-only@${address}/postgres`;
  }
  const url = new URL(connectionString);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a disposable local PostgreSQL instance only.');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
    try { await admin.connect(); break; }
    catch (error) { await admin.end(); if (attempt >= 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  pool = new pg.Pool({ connectionString: url.toString() });
  const makeStore = name => {
    const address = new URL(url); address.searchParams.set('application_name', `${schema}_${name}`);
    const store = createPlayerStore({ connectionString: address.toString(), onFatal: error => fatals.push(error), validate(state) {
      assert(Array.isArray(state.characters));
      assert(state.characters.every(player => treasurePlayerValid(player) && Number.isSafeInteger(player.gold) && player.gold >= 0
        && Number.isSafeInteger(player.carriedItems['moss-voucher'] || 0) && (player.carriedItems['moss-voucher'] || 0) >= 0));
    } });
    stores.push(store); return store;
  };
  const eu = makeStore('eu'), us = makeStore('us');
  await Promise.all([eu.start(), us.start()]);
  const euKey = key('eu'), usKey = key('us'), voucherKey = key('voucher');
  const originalEu = account(600_000), originalUs = account(1_100_000), originalVoucher = account(0);
  for (const [store, accountKey, state] of [[eu, euKey, originalEu], [us, usKey, originalUs], [eu, voucherKey, originalVoucher]]) {
    await store.claim(accountKey); await store.commit([{ key: accountKey, state }]);
  }
  const read = async (store, accountKey) => (await store.read([accountKey]))[0].state;
  const raw = async accountKey => (await admin.query(`SELECT state,pending_credits FROM ${schema}.mossvale_players WHERE account_key=$1`, [accountKey])).rows[0];
  const ledger = async () => (await admin.query(`SELECT claim_hash,amount_wei::text FROM ${schema}.mossvale_treasure_claims ORDER BY claim_hash`)).rows;
  const liability = async () => (await ledger()).reduce((sum, row) => sum + BigInt(row.amount_wei), 0n);
  const voucher = await makeClaim(originalVoucher.characters[0].id, 'eu', 8), voucherState = withClaim(originalVoucher, voucher);
  voucherState.characters[0].carriedItems['moss-voucher']--;
  await eu.commit([{ key: voucherKey, state: voucherState, expected: originalVoucher }], undefined, undefined, reservation(voucher));
  clock = (Math.floor(clock / 86400000) + 1) * 86400000;
  const terms = () => ({ id: randomUUID(), startsAt: Date.now() - 60_000, endsAt: Date.now() + 60_000, contract, budgetUsdCents: 100_000 });
  const underfunded = terms();
  await assert.rejects(eu.openGoldRound(underfunded, funding(underfunded, 10, 107)), conflict, 'existing voucher liabilities reduce the available pool');
  assert.equal((await eu.goldRounds()).length, 0);
  const openingEu = terms(), openingUs = terms();
  const opening = await Promise.allSettled([eu.openGoldRound(openingEu, funding(openingEu)), us.openGoldRound(openingUs, funding(openingUs))]);
  assert.equal(opening.filter(result => result.status === 'fulfilled').length, 1, 'independent realms can open only one global round');
  assert(opening.filter(result => result.status === 'rejected').every(result => conflict(result.reason)));
  const round = opening.find(result => result.status === 'fulfilled').value;
  const current = async store => (await store.goldRounds(euKey)).find(item => item.id === round.id);
  assert.equal(round.budgetUsdCents, 100_000); assert.equal(round.budgetWei, undefined); assert.equal(round.settlementPrice, undefined);
  assert.equal(await liability(), parseUnits('108', 18));
  const nextVoucher = await makeClaim(originalVoucher.characters[0].id, 'eu', { usdCents: 500, priceUsd: 5 }), nextVoucherState = withClaim(voucherState, nextVoucher);
  nextVoucherState.characters[0].carriedItems['moss-voucher']--;
  await assert.rejects(eu.commit([{ key: voucherKey, state: nextVoucherState, expected: voucherState }], undefined, undefined, reservation(nextVoucher, 109)), conflict,
    'a competing voucher revalues the fixed USD reserve when MOSS halves; the old 100 MOSS reserve cannot permit another payout');
  assert.equal(await liability(), parseUnits('108', 18), 'a rejected voucher rolls back reserve revaluation as well as issuance');
  assert.deepEqual(await read(eu, voucherKey), voucherState);
  const legacyVoucher = await makeClaim(originalVoucher.characters[0].id, 'eu', 1), legacyState = withClaim(voucherState, legacyVoucher);
  legacyState.characters[0].carriedItems['moss-voucher']--;
  await assert.rejects(eu.commit([{ key: voucherKey, state: legacyState, expected: voucherState }], undefined, undefined, reservation(legacyVoucher, 1000)), conflict,
    'legacy voucher issuance without a fresh USD quote cannot spend while a dollar round is open');

  const action = (kind, accountKey, state, extra = {}) => ({ kind, roundId: round.id, accountKey, characterId: state.characters[0].id, ...extra });
  async function offer(store, accountKey, baseline, gold, priceCentsPer1000, previousGold = 0, validate) {
    const state = copy(baseline); state.characters[0].gold -= gold - previousGold;
    return store.commit([{ key: accountKey, state, expected: baseline }], validate, undefined, undefined,
      [goldEvent(state.characters[0].id, 'escrow:merchant', previousGold - gold)],
      action('offer', accountKey, state, { gold, priceCentsPer1000, wallet: wallet.address, realmId: accountKey === usKey ? 'us' : 'eu' }));
  }
  await assert.rejects(offer(eu, euKey, originalEu, 600_001, 50), /Assertion|assert|gold|limit/i, 'overspending preserves the character and offer book');
  assert.deepEqual(await read(eu, euKey), originalEu); assert.deepEqual((await current(eu)).bids, {});
  await assert.rejects(offer(eu, euKey, originalEu, 500_000, 50, 0, () => { throw Error('Injected save failure'); }), /Injected save failure/);
  assert.deepEqual(await read(eu, euKey), originalEu); assert.deepEqual((await current(eu)).bids, {}, 'failed save rolls back round escrow');
  await Promise.all([offer(eu, euKey, originalEu, 500_000, 50), offer(us, usKey, originalUs, 1_000_000, 100)]);
  let euState = await read(eu, euKey), usState = await read(us, usKey);
  assert.equal(euState.characters[0].gold, 100_000); assert.equal(usState.characters[0].gold, 100_000);
  await assert.rejects(us.commit([{ key: euKey, state: euState, expected: euState }], undefined, undefined, undefined, [], action('cancel', euKey, euState)), conflict, 'another realm cannot mutate an unowned account offer');
  await assert.rejects(eu.commit([{ key: euKey, state: { characters: [] }, expected: euState }]), conflict, 'open offers prevent character deletion');
  await assert.rejects(eu.requestDeletion(euKey, 'local-test-subject', () => true), conflict, 'open offers prevent account deletion');
  const oldSequence = (await current(eu)).bids[euKey].sequence;
  await offer(eu, euKey, euState, 400_000, 50, 500_000);
  assert((await current(eu)).bids[euKey].sequence > oldSequence);
  await assert.rejects(offer(eu, euKey, euState, 400_000, 50, 500_000), conflict, 'stale offer edits cannot refund escrow twice');
  euState = await read(eu, euKey); assert.equal(euState.characters[0].gold, 200_000);
  await offer(eu, euKey, euState, 500_000, 50, 400_000); euState = await read(eu, euKey);
  const canceled = copy(usState); canceled.characters[0].gold += 1_000_000;
  await us.commit([{ key: usKey, state: canceled, expected: usState }], undefined, undefined, undefined,
    [goldEvent(usState.characters[0].id, 'escrow:merchant', 1_000_000)], action('cancel', usKey, usState));
  assert(!(await current(us)).bids[usKey]); assert.equal((await read(us, usKey)).characters[0].gold, 1_100_000);
  await offer(us, usKey, canceled, 1_000_000, 100); usState = await read(us, usKey);
  const beforeStats = await readGoldStats(pool);
  assert.equal(beforeStats.status, 'ok');
  assert.equal(beforeStats.supply.total, '1700000', 'open merchant escrow remains in the circulating gold supply');
  const earlyClaim = await makeClaim(euState.characters[0].id, 'eu', 50, round.id);
  await assert.rejects(eu.commit([{ key: euKey, state: withClaim(euState, earlyClaim), expected: euState }], undefined, undefined, reservation(earlyClaim), [], action('claim', euKey, euState)), conflict,
    'no MOSS claim before the round closes');
  // Advance only this disposable database's deadline; no wall-clock sleeps or production writes.
  await admin.query(`UPDATE ${schema}.mossvale_gold_rounds SET state=jsonb_set(state,'{endsAt}',to_jsonb($2::bigint)) WHERE id=$1`, [round.id, Date.now() - 1]);
  await assert.rejects(offer(eu, euKey, euState, 400_000, 50, 500_000), conflict, 'deadline rejects further edits');
  const burns = async () => (await admin.query(`SELECT SUM(burned)::text AS burned,COUNT(*)::int AS count FROM ${schema}.mossvale_gold_events WHERE reason='merchant:buyback'`)).rows[0];
  const snapshot = async () => ({ round: await current(eu), eu: await raw(euKey), us: await raw(usKey), ledger: await ledger(), burns: await burns() });
  const beforeClose = await snapshot(), closeQuote = funding(round, 5, 208, 200);
  const invalidCloseQuotes = [
    { roundId: round.id, contract },
    { ...closeQuote, price: { ...closeQuote.price, observedAt: Date.now() - 90_001 } },
    { ...closeQuote, amountWei: (BigInt(closeQuote.amountWei) + 1n).toString() },
  ];
  for (const quote of invalidCloseQuotes) {
    await assert.rejects(eu.settleGoldRounds(quote), conflict, 'missing, stale and inconsistent initial close quotes must fail safely');
    assert.deepEqual(await snapshot(), beforeClose, 'failed closing leaves every offer, held gold, refund, burn and liability unchanged');
  }
  await assert.rejects(eu.settleGoldRounds({ ...closeQuote, capacityWei: amount(207) }), conflict, 'insufficient funding preserves gold until a top-up');
  const lockedClose = { ...beforeClose, round: { ...beforeClose.round, closingPrice: closeQuote.price },
    ledger: beforeClose.ledger.map(row => row.claim_hash === id(`mossvale-gold-round:${round.id}`) ? { ...row, amount_wei: amount(200) } : row) };
  assert.deepEqual(await snapshot(), lockedClose, 'the first valid close durably locks only its price and reserve; escrow, refunds and burns stay untouched');
  await assert.rejects(us.settleGoldRounds(funding(round, 20, 208, 199)), conflict,
    'a later higher price cannot reduce fixed winning MOSS obligations to fit an insufficient balance');
  assert.deepEqual(await snapshot(), lockedClose);
  const postLockVoucher = await makeClaim(originalVoucher.characters[0].id, 'eu', { usdCents: 500, priceUsd: 20 });
  const postLockVoucherState = withClaim(voucherState, postLockVoucher); postLockVoucherState.characters[0].carriedItems['moss-voucher']--;
  await assert.rejects(eu.commit([{ key: voucherKey, state: postLockVoucherState, expected: voucherState }], undefined, undefined, reservation(postLockVoucher, 208)), conflict,
    'a later voucher quote cannot reprice a frozen closing reserve and consume promised MOSS');
  assert.deepEqual(await snapshot(), lockedClose);
  const noOracleRetry = { roundId: round.id, contract, capacityWei: amount(208), balanceWei: amount(200) };
  const counts = await Promise.all([eu.settleGoldRounds(funding(round, 20, 208, 200)), us.settleGoldRounds(noOracleRetry)]);
  assert.equal(counts.reduce((a, b) => a + b, 0), 1, 'two realms settle one round exactly once');
  const settled = await current(eu);
  assert.equal(settled.budgetUsdCents, 100_000); assert.equal(settled.budgetWei, amount(200));
  assert.deepEqual(settled.settlementPrice, closeQuote.price, 'one closing quote determines every winning MOSS award');
  assert.equal(settled.status, 'settled'); assert.equal(settled.bids[euKey].filledGold, 500_000);
  assert.equal(settled.bids[euKey].payoutUsdMicros, '250000000'); assert.equal(settled.bids[usKey].payoutUsdMicros, '750000000');
  assert.equal(settled.bids[euKey].payoutWei, amount(50)); assert.equal(settled.bids[usKey].filledGold, 750_000);
  assert.equal(settled.bids[usKey].payoutWei, amount(150), 'a halved MOSS price doubles MOSS awards without changing USD awards or gold fills');
  assert(settled.bids[usKey].refunded);
  assert.equal((await raw(usKey)).pending_credits[usState.characters[0].id], 250_000);
  const burn = await burns();
  assert.deepEqual(burn, { burned: '1250000', count: 2 });
  assert.equal((await readGoldStats(pool)).supply.total, '450000', 'only accepted gold leaves supply');
  assert.equal(await eu.settleGoldRounds(funding(round, 20, 208, 200)), 0);
  assert.deepEqual(await current(eu), settled, 'later MOSS price changes cannot reprice an already closed award');
  assert.equal((await raw(usKey)).pending_credits[usState.characters[0].id], 250_000);
  await assert.rejects(eu.commit([{ key: euKey, state: { characters: [] }, expected: euState }]), conflict, 'unissued round award blocks deletion');
  assert.equal(await liability(), parseUnits('208', 18));
  const claimEu = await makeClaim(euState.characters[0].id, 'eu', 50, round.id), claimedEu = withClaim(euState, claimEu);
  const wrongClaim = await makeClaim(euState.characters[0].id, 'eu', '12.5', round.id);
  await assert.rejects(eu.commit([{ key: euKey, state: withClaim(euState, wrongClaim), expected: euState }], undefined, undefined, reservation(wrongClaim), [], action('claim', euKey, euState)), conflict,
    'claim amount must match the closing award, even if the claim-time price would give only 12.5 MOSS');
  const wrongWallet = await makeClaim(euState.characters[0].id, 'eu', 50, round.id, Wallet.createRandom().address);
  await assert.rejects(eu.commit([{ key: euKey, state: withClaim(euState, wrongWallet), expected: euState }], undefined, undefined, reservation(wrongWallet), [], action('claim', euKey, euState)), conflict,
    'relinking cannot redirect the saved winning wallet');
  const reservedBeforeClaim = await ledger();
  await assert.rejects(eu.commit([{ key: euKey, state: claimedEu, expected: euState }], () => { throw Error('Injected claim save failure'); }, undefined, reservation(claimEu), [], action('claim', euKey, euState)), /Injected claim save failure/);
  assert.deepEqual(await ledger(), reservedBeforeClaim); assert(!((await current(eu)).bids[euKey].claimed));
  const constrainedClaimCapacity = 207;
  assert((await liability()) > BigInt(amount(constrainedClaimCapacity)) && BigInt(claimEu.amountWei) <= BigInt(amount(constrainedClaimCapacity)));
  await eu.commit([{ key: euKey, state: claimedEu, expected: euState }], undefined, undefined, reservation(claimEu, constrainedClaimCapacity), [], action('claim', euKey, euState));
  assert.equal(await liability(), parseUnits('208', 18), 'claim moves reserve into a permanent liability without freeing or double-counting it');
  assert.equal((await current(eu)).bids[euKey].claimId, claimEu.id);
  await assert.rejects(eu.commit([{ key: euKey, state: claimedEu, expected: claimedEu }], undefined, undefined, reservation(claimEu), [], action('claim', euKey, claimedEu)), conflict, 'duplicate claim cannot spend twice');
  assert.deepEqual(await read(eu, euKey), claimedEu);
  await assert.rejects(eu.commit([{ key: euKey, state: { characters: [] }, expected: claimedEu }]), conflict, 'pending on-chain claim still blocks deletion');

  await us.release(usKey); await us.close();
  const restarted = makeStore('restarted'); await restarted.start();
  assert.deepEqual(await restarted.claim(usKey), usState, 'restart restores the original balance before pending-credit collection');
  assert.deepEqual((await restarted.goldRounds(usKey)).find(item => item.id === round.id), await current(eu));
  const claimUs = await makeClaim(usState.characters[0].id, 'us', 150, round.id), claimedUs = withClaim(usState, claimUs);
  await restarted.commit([{ key: usKey, state: claimedUs, expected: usState }], undefined, undefined, reservation(claimUs), [], action('claim', usKey, usState));
  const collected = await read(restarted, usKey);
  assert.equal(collected.characters[0].gold, 350_000, 'claim and pending gold refund commit together');
  assert.deepEqual((await raw(usKey)).pending_credits, {}); assert.equal(await liability(), parseUnits('208', 18));
  assert.equal((await ledger()).length, 3, 'two permanent round claims replace the pool reservation');
  await restarted.commit([{ key: usKey, state: collected }]);
  assert.equal((await read(restarted, usKey)).characters[0].gold, 350_000, 'autosave cannot apply the refund twice');
  const paid = copy(claimedEu); Object.assign(paid.characters[0].treasureClaims[0], { status: 'paid', paidAt: Date.now(), paymentBlock: { hash: id('finalized-gold-round'), number: '0x64' } });
  await eu.commit([{ key: euKey, state: paid, expected: claimedEu }]);
  await eu.commit([{ key: euKey, state: { characters: [] }, expected: paid }]);
  assert.equal(await liability(), parseUnits('208', 18), 'paid character deletion never erases permanent issuance liability');
  const emptyTerms = { ...terms(), budgetUsdCents: 10_000 };
  const empty = await eu.openGoldRound(emptyTerms, funding(emptyTerms, 10, 218, 10));
  assert.equal(await liability(), parseUnits('218', 18));
  await admin.query(`UPDATE ${schema}.mossvale_gold_rounds SET state=jsonb_set(state,'{endsAt}',to_jsonb($2::bigint)) WHERE id=$1`, [empty.id, Date.now() - 1]);
  assert.equal(await eu.settleGoldRounds(funding(empty, 5, 208, 0)), 1);
  assert.equal(await liability(), parseUnits('208', 18), 'an empty round releases its unused budget even when no MOSS balance remains');

  // Seed valid paid history and its permanent liabilities directly in this isolated fixture,
  // avoiding thousands of unrelated voucher-redemption transactions to reach the history bound.
  async function seedPaidHistory(accountKey, baseline, count) {
    const state = copy(baseline), claims = [];
    for (let index = 0; index < count; index++) {
      const claim = await makeClaim(state.characters[0].id, 'eu', 1);
      claim.createdAt -= (index + 1) * 86400000;
      Object.assign(claim, { status: 'paid', paidAt: Date.now(), paymentBlock: { hash: id('paid-history'), number: '0x65' } });
      claims.push(claim);
    }
    state.characters[0].treasureClaims.push(...claims);
    assert(treasurePlayerValid(state.characters[0]));
    await admin.query('BEGIN');
    await admin.query(`UPDATE ${schema}.mossvale_players SET state=$2::jsonb WHERE account_key=$1`, [accountKey, JSON.stringify(state)]);
    await admin.query(`INSERT INTO ${schema}.mossvale_treasure_claims(claim_hash,contract,amount_wei)
      SELECT claim_hash,contract,amount_wei::numeric FROM jsonb_to_recordset($1::jsonb) AS c(claim_hash text,contract text,amount_wei text)`,
    [JSON.stringify(claims.map(claim => ({ claim_hash: claim.claimHash, contract: contract.toLowerCase(), amount_wei: claim.amountWei })))]);
    await admin.query('COMMIT');
    return state;
  }
  const fullKey = key('full-history'), fullOriginal = account(10);
  await eu.claim(fullKey); await eu.commit([{ key: fullKey, state: fullOriginal }]);
  const fullPaid = await seedPaidHistory(fullKey, fullOriginal, TREASURE_MAX_CLAIMS - 2);
  const fullUsdClaim = await makeClaim(fullOriginal.characters[0].id, 'eu', { usdCents: 500, priceUsd: 10 });
  const fullIssued = withClaim(fullPaid, fullUsdClaim); fullIssued.characters[0].carriedItems['moss-voucher']--;
  const quoteCapacity = () => liability().then(value => formatUnits(value + parseUnits('5', 18), 18));
  await eu.commit([{ key: fullKey, state: fullIssued, expected: fullPaid }], undefined, undefined, reservation(fullUsdClaim, await quoteCapacity()));
  const fullRefreshedClaim = await refreshClaim(fullUsdClaim, 5), full = copy(fullIssued);
  full.characters[0].treasureClaims[full.characters[0].treasureClaims.length - 1] = fullRefreshedClaim;
  await eu.commit([{ key: fullKey, state: full, expected: fullIssued }], undefined, undefined,
    { ...reservation(fullRefreshedClaim, await quoteCapacity()), previousClaimHash: fullUsdClaim.claimHash });
  assert.equal(full.characters[0].treasureClaims.length, TREASURE_MAX_CLAIMS - 1);
  assert.equal(full.characters[0].treasureClaims.reduce((sum, claim) => sum + treasureQuotes(claim).length, 0), TREASURE_MAX_CLAIMS,
    'previous voucher quotes count toward the same authorization limit as separate claims');

  const slotUsdClaim = await makeClaim(collected.characters[0].id, 'us', { usdCents: 500, priceUsd: 10 });
  const slotIssued = withClaim(collected, slotUsdClaim); slotIssued.characters[0].carriedItems['moss-voucher']--;
  await restarted.commit([{ key: usKey, state: slotIssued, expected: collected }], undefined, undefined, reservation(slotUsdClaim, await quoteCapacity()));
  const lastSlot = await seedPaidHistory(usKey, slotIssued, TREASURE_MAX_CLAIMS - 1 - slotIssued.characters[0].treasureClaims.length);
  const historyLiability = await liability(), historyCapacity = historyLiability + parseUnits('100', 18);
  const historyTerms = { ...terms(), endsAt: Date.now() + 300_000 };
  const historyRound = await eu.openGoldRound(historyTerms, funding(historyTerms, 10, formatUnits(historyCapacity, 18), 100));
  const historyAction = (kind, accountKey, state, extra = {}) => ({ ...action(kind, accountKey, state, extra), roundId: historyRound.id });
  const fullOffer = copy(full); fullOffer.characters[0].gold--;
  await assert.rejects(eu.commit([{ key: fullKey, state: fullOffer, expected: full }], undefined, undefined, undefined, [],
    historyAction('offer', fullKey, full, { gold: 1, priceCentsPer1000: 100, wallet: wallet.address, realmId: 'eu' })), /history has no room/,
  'a full authorization history cannot sell gold that it could never collect, even with fewer than 1,000 distinct claims');
  assert.deepEqual(await read(eu, fullKey), full);
  assert(!(await eu.goldRounds(fullKey)).find(item => item.id === historyRound.id).bids[fullKey]);
  const slotOffer = copy(lastSlot); slotOffer.characters[0].gold -= 10_000;
  await restarted.commit([{ key: usKey, state: slotOffer, expected: lastSlot }], undefined, undefined, undefined, [],
    historyAction('offer', usKey, lastSlot, { gold: 10_000, priceCentsPer1000: 100, wallet: wallet.address, realmId: 'us' }));
  const slotVoucher = await makeClaim(slotOffer.characters[0].id, 'us', { usdCents: 500, priceUsd: 5 }), stolenSlot = withClaim(slotOffer, slotVoucher);
  stolenSlot.characters[0].carriedItems['moss-voucher']--;
  const extraFunding = { ...reservation(slotVoucher), capacityWei: (historyLiability + parseUnits('201', 18)).toString() };
  await assert.rejects(restarted.commit([{ key: usKey, state: stolenSlot, expected: slotOffer }], undefined, undefined, extraFunding), /history has no room/,
    'a voucher cannot consume the slot reserved by an open gold offer even with enough funding');
  assert.deepEqual(await read(restarted, usKey), slotOffer);
  const slotRefreshedClaim = await refreshClaim(slotUsdClaim, 5), refreshedSlot = copy(slotOffer);
  refreshedSlot.characters[0].treasureClaims[refreshedSlot.characters[0].treasureClaims.findIndex(claim => claim.id === slotUsdClaim.id)] = slotRefreshedClaim;
  const refreshFunding = { ...extraFunding, claimHash: slotRefreshedClaim.claimHash, amountWei: slotRefreshedClaim.amountWei, previousClaimHash: slotUsdClaim.claimHash };
  const beforeReservedRefresh = await ledger();
  await assert.rejects(restarted.commit([{ key: usKey, state: refreshedSlot, expected: slotOffer }], undefined, undefined, refreshFunding), /history has no room/,
    'refreshing an existing voucher cannot consume the signature slot reserved by an open gold offer');
  assert.deepEqual(await read(restarted, usKey), slotOffer); assert.deepEqual(await ledger(), beforeReservedRefresh);
  await admin.query(`UPDATE ${schema}.mossvale_gold_rounds SET state=jsonb_set(state,'{endsAt}',to_jsonb($2::bigint)) WHERE id=$1`, [historyRound.id, Date.now() - 1]);
  const historyCloseCapacity = historyLiability + parseUnits('2', 18);
  assert.equal(await restarted.settleGoldRounds(funding(historyRound, 5, formatUnits(historyCloseCapacity, 18), 2)), 1,
    'closing needs MOSS for only the accepted $10, even though the full $1,000 round budget would require 200 MOSS');
  await assert.rejects(restarted.commit([{ key: usKey, state: stolenSlot, expected: slotOffer }], undefined, undefined, extraFunding), /history has no room/,
    'the history slot remains reserved after closing until the gold award gets its signature');
  const afterCloseLedger = await ledger();
  await assert.rejects(restarted.commit([{ key: usKey, state: refreshedSlot, expected: slotOffer }], undefined, undefined, refreshFunding), /history has no room/,
    'voucher refresh cannot consume the slot reserved for an unissued settled gold award');
  assert.deepEqual(await read(restarted, usKey), slotOffer); assert.deepEqual(await ledger(), afterCloseLedger);
  const award = (await restarted.goldRounds(usKey)).find(item => item.id === historyRound.id).bids[usKey];
  assert.equal(award.filledGold, 10_000); assert.equal(award.payoutUsdMicros, '10000000'); assert.equal(award.payoutWei, amount(2));
  const lastClaim = await makeClaim(slotOffer.characters[0].id, 'us', formatUnits(award.payoutWei, 18), historyRound.id);
  const fullAfterAward = withClaim(slotOffer, lastClaim);
  await restarted.commit([{ key: usKey, state: fullAfterAward, expected: slotOffer }], undefined, undefined,
    { ...reservation(lastClaim), capacityWei: historyCloseCapacity.toString() }, [], historyAction('claim', usKey, slotOffer));
  assert.equal((await read(restarted, usKey)).characters[0].treasureClaims.length, TREASURE_MAX_CLAIMS, 'the promised gold claim consumes its reserved final slot');
  assert.equal(fatals.length, 0, 'expected conflicts preserve all database connections');
  console.log('PASS gold round PostgreSQL: fixed USD budget with one closing MOSS quote, changing-price voucher reserves, failed close rollback and funded retry, global opening/settlement races, exact escrow, stale edits, cancellation, deadline, partial fills, supply/burn accounting, refunds, restart, fixed-price claims, replay, deletion, and 1,000-claim history reservations.');
} finally {
  Date.now = realNow;
  await Promise.allSettled(stores.map(store => store.close()));
  await pool?.end();
  if (admin) { try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); } }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe', timeout: 20000 });
}
