import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Wallet, Interface, TypedDataEncoder, id, parseUnits, formatUnits } from 'ethers';
import { createPlayerStore } from '../src/player-store.mjs';
import { MOSS_TOKEN } from '../src/auction.ts';
import { TREASURE_ABI, TREASURE_CLAIM_TYPES, treasureContractClaim, treasurePlayerValid, treasureUsdAmount, treasureNextRedemptionAt } from '../src/treasure-rewards.ts';

// Never reads DATABASE_URL or realm secrets. Each run uses a fresh disposable local schema/container.
const suffix = randomUUID().replaceAll('-', ''), schema = `treasury_${suffix}`;
let container, admin, releaseIssuance;
const stores = [], fatalCalls = [], authority = Wallet.createRandom(), wallet = Wallet.createRandom();
const contract = Wallet.createRandom().address, abi = new Interface(TREASURE_ABI);
const key = value => createHash('sha256').update(`${schema}:${value}`).digest('hex');
const conflict = error => error.code === 'PLAYER_STORE_CONFLICT';
const copy = value => structuredClone(value);
const amount = value => parseUnits(String(value), 18).toString();
const priceUsdWei = parseUnits('0.003001', 18).toString();
const realNow = Date.now;
let clock = Date.UTC(2026, 8, 21, 12);
Date.now = () => clock;
const account = characterId => ({ characters: [{ id: characterId, name: characterId, gold: 0, carriedItems: { 'moss-voucher': 2 },
  auctions: [], friendIds: [], friendRequestIds: [], ignoreIds: [], treasureClaims: [] }] });
const makeClaim = async (characterId, realmId, reward = 8, recipient = wallet.address) => {
  const createdAt = Date.now();
  const quotePrice = typeof reward === 'number' ? priceUsdWei : reward.priceUsdWei || priceUsdWei;
  const terms = typeof reward === 'number' ? { amount: reward } : reward.goldRoundId ? { amount: reward.amount, goldRoundId: reward.goldRoundId } : { usdCents: reward.usdCents,
    amount: treasureUsdAmount(reward.usdCents, quotePrice), price: { usdWei: quotePrice, observedAt: createdAt } };
  const input = { id: reward.id || randomUUID(), realmId, characterId, wallet: recipient, ...terms };
  const contractClaim = treasureContractClaim(input), domain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: 4663, verifyingContract: contract };
  const signature = await authority.signTypedData(domain, TREASURE_CLAIM_TYPES, contractClaim);
  return { ...input, amountWei: contractClaim.amountWei, createdAt, chainId: 4663, token: MOSS_TOKEN.address,
    contract, status: 'pending', contractClaim, signature, claimHash: TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, contractClaim),
    transaction: { to: contract, data: abi.encodeFunctionData('claim', [contractClaim, signature]), value: '0x0', chainId: '0x1237' } };
};
const issue = (baseline, claim) => {
  const state = copy(baseline), player = state.characters.find(player => player.id === claim.characterId);
  if (!--player.carriedItems['moss-voucher']) delete player.carriedItems['moss-voucher'];
  player.treasureClaims.push(claim);
  return state;
};
const reservation = (claim, capacity) => ({ claimHash: claim.claimHash, contract, amountWei: claim.amountWei, capacityWei: amount(capacity) });
const requote = async (claim, price) => {
  const { previousQuotes, status, transactionHash, paymentBlock, paidAt, settledClaimHash, ...authorization } = claim;
  return { ...await makeClaim(claim.characterId, claim.realmId, { id: claim.id, usdCents: claim.usdCents, priceUsdWei: amount(price) }),
    previousQuotes: [...(previousQuotes || []), { ...authorization, status: 'pending' }] };
};
const replace = (state, claim) => {
  const next = copy(state); next.characters[0].treasureClaims = next.characters[0].treasureClaims.map(saved => saved.id === claim.id ? claim : saved); return next;
};
const replacementReservation = (previous, claim, capacityWei) => ({ ...reservation(claim, 0), capacityWei, previousClaimHash: previous.claimHash });

try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    let dockerReady = true;
    try { execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'pipe', timeout: 20000 }); }
    catch {
      dockerReady = false;
      console.log('SKIP treasury PostgreSQL concurrency: Docker is unavailable. Run with a disposable local TEST_DATABASE_URL or start Docker.');
    }
    if (dockerReady) {
      container = `mossvale-treasury-${suffix}`;
      execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only',
        '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe', timeout: 120000 });
      const address = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8', timeout: 10000 }).trim();
      connectionString = `postgresql://postgres:isolated-test-only@${address}/postgres`;
    }
  }
  if (connectionString) {
    const url = new URL(connectionString);
    assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use only a disposable local PostgreSQL instance.');
    for (let attempt = 0; ; attempt++) {
      admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
      try { await admin.connect(); break; }
      catch (error) { await admin.end(); if (attempt >= 100) throw error; await delay(100); }
    }
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE TABLE ${schema}.mossvale_treasure_claims (claim_hash text PRIMARY KEY, contract text NOT NULL, amount_wei numeric(78,0) NOT NULL CHECK (amount_wei > 0))`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    function makeStore(name) {
      const address = new URL(url); address.searchParams.set('application_name', `${schema}_${name}`);
      const store = createPlayerStore({ connectionString: address.toString(), onFatal: error => fatalCalls.push(error), validate(state) {
        assert(Array.isArray(state.characters));
        assert(!Object.hasOwn(state, 'lastTreasureClaimAt'), 'daily limit must not change account JSON read by older realms');
        assert(state.characters.every(player => treasurePlayerValid(player) && Number.isSafeInteger(player.gold)
          && Number.isSafeInteger(player.carriedItems['moss-voucher'] || 0) && (player.carriedItems['moss-voucher'] || 0) >= 0));
      } });
      stores.push(store); return store;
    }
    const eu = makeStore('eu'), us = makeStore('us');
    await Promise.all([eu.start(), us.start()]);
    const euKey = key('eu'), usKey = key('us'), euOriginal = account('eu-character'), usOriginal = account('us-character');
    await eu.claim(euKey); await us.claim(usKey);
    await eu.commit([{ key: euKey, state: euOriginal }]); await us.commit([{ key: usKey, state: usOriginal }]);
    const read = async (store, accountKey) => (await store.read([accountKey]))[0].state;
    const ledger = async () => (await admin.query(`SELECT claim_hash,contract,amount_wei::text,account_key,redeemed_at::text FROM ${schema}.mossvale_treasure_claims ORDER BY claim_hash`)).rows;
    const euClaim = await makeClaim('eu-character', 'eu'), usClaim = await makeClaim('us-character', 'us');
    const euIssued = issue(euOriginal, euClaim), usIssued = issue(usOriginal, usClaim);
    let entered;
    const inside = new Promise(resolve => { entered = resolve; }), hold = new Promise(resolve => { releaseIssuance = resolve; });
    const first = eu.commit([{ key: euKey, state: euIssued, expected: euOriginal }], async () => { entered(); await hold; }, undefined, reservation(euClaim, 10));
    await inside;
    const second = us.commit([{ key: usKey, state: usIssued, expected: usOriginal }], undefined, undefined, reservation(usClaim, 10));
    // Attach handlers before releasing either transaction; an early rejection must not be unhandled.
    const settled = Promise.allSettled([first, second]);
    let waiting = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const state = (await admin.query('SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE application_name=$1', [`${schema}_us`])).rows[0];
      if (state?.wait_event_type === 'Lock' && state.wait_event === 'advisory') { waiting = true; break; }
      await delay(20);
    }
    assert(waiting, 'second independent realm connection must wait on the global treasury lock');
    assert.deepEqual(await ledger(), [], 'uncommitted signature reservation is invisible');
    releaseIssuance(); releaseIssuance = undefined;
    const outcomes = await settled;
    assert.equal(outcomes[0].status, 'fulfilled'); assert.equal(outcomes[1].status, 'rejected'); assert(conflict(outcomes[1].reason));
    assert.deepEqual(await read(eu, euKey), euIssued);
    assert.deepEqual(await read(us, usKey), usOriginal, 'over-capacity rejection leaves voucher and signature history untouched');
    assert.equal((await ledger()).length, 1); assert.equal((await ledger())[0].claim_hash, euClaim.claimHash);
    assert(!(await ledger()).some(row => row.claim_hash === usClaim.claimHash));
    await assert.rejects(us.commit([{ key: usKey, state: usIssued, expected: usOriginal }], undefined, undefined, reservation(usClaim, 10)), conflict);
    await us.commit([{ key: usKey, state: usIssued, expected: usOriginal }], undefined, undefined, reservation(usClaim, 16));
    assert.deepEqual(await read(us, usKey), usIssued, 'same private claim succeeds once capacity increases');
    assert.equal((await ledger()).reduce((sum, row) => sum + BigInt(row.amount_wei), 0n), parseUnits('16', 18));
    await assert.rejects(us.commit([{ key: usKey, state: usIssued, expected: usIssued }], undefined, undefined, reservation(usClaim, 32)), conflict, 'same claim cannot reserve twice');
    await us.commit([{ key: usKey, state: usIssued }]);
    assert.equal((await ledger()).length, 2, 'ordinary autosave preserves one ledger row per issuance');

    const extra = await makeClaim('us-character', 'us', 1), extraState = issue(usIssued, extra);
    await assert.rejects(us.commit([{ key: usKey, state: extraState, expected: usIssued }]), conflict, 'new claims require reservation');
    const multiple = copy(extraState); multiple.characters[0].treasureClaims.push(await makeClaim('us-character', 'us', 1));
    await assert.rejects(us.commit([{ key: usKey, state: multiple, expected: usIssued }], undefined, undefined, reservation(extra, 100)), conflict, 'one reservation cannot add multiple authorizations');
    const noDebit = copy(extraState); noDebit.characters[0].carriedItems = copy(usIssued.characters[0].carriedItems);
    await assert.rejects(us.commit([{ key: usKey, state: noDebit, expected: usIssued }], undefined, undefined, reservation(extra, 100)), conflict, 'reservation requires one voucher debit');
    await assert.rejects(us.commit([{ key: usKey, state: extraState, expected: usIssued }], undefined, undefined, reservation(extra, 100)), /one MOSS voucher per account per day/, 'pending claims consume the daily allowance');
    clock = treasureNextRedemptionAt(usIssued);
    await assert.rejects(us.commit([{ key: usKey, state: extraState, expected: usIssued }], () => { throw Error('Injected commit failure'); }, undefined, reservation(extra, 100)), /Injected commit failure/);
    assert.equal(await us.treasureNextRedemptionAt(usKey), clock, 'failed issuance does not consume the new day');
    assert.deepEqual(await read(us, usKey), usIssued); assert.equal((await ledger()).length, 2, 'later validation failure rolls back signature, voucher, and ledger together');
    const edited = copy(usIssued); edited.characters[0].treasureClaims[0].createdAt++;
    await assert.rejects(us.commit([{ key: usKey, state: edited }]), conflict, 'issued authorization fields are immutable');
    const removed = copy(usIssued); removed.characters[0].treasureClaims = [];
    await assert.rejects(us.commit([{ key: usKey, state: removed }]), conflict, 'history cannot be erased by autosave');
    await assert.rejects(us.commit([{ key: usKey, state: { characters: [] }, expected: usIssued }]), conflict, 'unresolved claims prevent character deletion');

    const paid = copy(euIssued);
    Object.assign(paid.characters[0].treasureClaims[0], { status: 'paid', paidAt: Date.now(), paymentBlock: { hash: id('finalized'), number: '0x64' } });
    await eu.commit([{ key: euKey, state: paid, expected: euIssued }]);
    await assert.rejects(eu.commit([{ key: euKey, state: euIssued }]), conflict, 'stale check cannot downgrade finalized payout');
    await eu.commit([{ key: euKey, state: { characters: [] }, expected: paid }]);
    assert.deepEqual(await read(eu, euKey), { characters: [] });
    assert.equal((await ledger()).length, 2, 'paid character deletion retains permanent issuance liability');
    await assert.rejects(us.commit([{ key: usKey, state: extraState, expected: usIssued }], undefined, undefined, reservation(extra, 16)), conflict, 'deleted paid character does not free treasury capacity');

    await us.release(usKey); await us.close();
    const restarted = makeStore('restarted'); await restarted.start();
    assert.deepEqual(await restarted.claim(usKey), usIssued, 'restart recovers identical signature and voucher count');
    assert.equal((await ledger()).length, 2);
    assert.equal(await restarted.treasureNextRedemptionAt(usKey), treasureNextRedemptionAt(usIssued), 'restart preserves daily allowance');
    await assert.rejects(restarted.commit([{ key: usKey, state: extraState, expected: usIssued }], undefined, undefined, reservation(extra, 16)), conflict);
    const unsavedLoot = copy(usIssued); unsavedLoot.characters[0].carriedItems['moss-voucher'] = 2;
    const afterLoot = issue(unsavedLoot, extra);
    await restarted.commit([{ key: usKey, state: afterLoot, expected: unsavedLoot }], undefined, undefined, reservation(extra, 17));
    assert.deepEqual(await read(restarted, usKey), afterLoot, 'fresh owner loot uses the explicit action baseline before its voucher debit');
    const traded = copy(afterLoot); delete traded.characters[0].carriedItems['moss-voucher'];
    await restarted.commit([{ key: usKey, state: traded, expected: afterLoot }]);
    assert.deepEqual(await read(restarted, usKey), traded, 'ordinary voucher trades remain independent from claim issuance');
    assert.equal((await ledger()).length, 3);

    // New dollar-priced claims share the same permanent ledger as legacy numeric claims.
    const usdKey = key('usd'), usdOriginal = account('usd-character');
    await eu.claim(usdKey); await eu.commit([{ key: usdKey, state: usdOriginal }]);
    const usdClaim = await makeClaim('usd-character', 'eu', { usdCents: 500 }), usdIssued = issue(usdOriginal, usdClaim);
    assert.equal(typeof usdClaim.amount, 'string');
    assert(BigInt(usdClaim.amountWei) > parseUnits('1000', 18) && BigInt(usdClaim.amountWei) % parseUnits('1', 18) !== 0n);
    const used = (await ledger()).reduce((sum, row) => sum + BigInt(row.amount_wei), 0n);
    const exactCapacity = formatUnits(used + BigInt(usdClaim.amountWei), 18), shortCapacity = formatUnits(used + BigInt(usdClaim.amountWei) - 1n, 18);
    await assert.rejects(eu.commit([{ key: usdKey, state: usdIssued, expected: usdOriginal }], undefined, undefined, reservation(usdClaim, shortCapacity)), conflict, 'one wei short rejects a large fractional payout');
    assert.deepEqual(await read(eu, usdKey), usdOriginal); assert.equal((await ledger()).length, 3, 'USD capacity failure preserves the voucher and ledger');
    await eu.commit([{ key: usdKey, state: usdIssued, expected: usdOriginal }], undefined, undefined, reservation(usdClaim, exactCapacity));
    assert.deepEqual(await read(eu, usdKey), usdIssued);
    assert.equal((await ledger()).find(row => row.claim_hash === usdClaim.claimHash).amount_wei, usdClaim.amountWei, 'PostgreSQL retains the exact fractional wei amount');
    const changedPrice = copy(usdIssued); changedPrice.characters[0].treasureClaims[0].price.observedAt--;
    await assert.rejects(eu.commit([{ key: usdKey, state: changedPrice }]), conflict, 'issued USD price metadata is immutable');
    await assert.rejects(eu.commit([{ key: usdKey, state: usdIssued, expected: usdIssued }], undefined, undefined, reservation(usdClaim, exactCapacity)), conflict, 'large fractional claims cannot reserve twice');
    await eu.release(usdKey);
    assert.deepEqual(await restarted.claim(usdKey), usdIssued, 'another realm recovers the same USD value, price, signature and voucher debit');
    await restarted.commit([{ key: usdKey, state: usdIssued }]);
    assert.equal((await ledger()).length, 4, 'cross-realm USD autosave never duplicates the reservation');
    assert.equal((await ledger()).reduce((sum, row) => sum + BigInt(row.amount_wei), 0n), used + BigInt(usdClaim.amountWei));

    const processed = copy(usdIssued);
    Object.assign(processed.characters[0].treasureClaims[0], { status: 'processed', paymentBlock: { hash: id('processed'), number: '0x65' } });
    const beforeProcessed = await ledger();
    await restarted.commit([{ key: usdKey, state: processed, expected: usdIssued }]);
    assert.deepEqual(await ledger(), beforeProcessed, 'processed inclusion keeps the full permanent reservation');
    await assert.rejects(restarted.commit([{ key: usdKey, state: { characters: [] }, expected: processed }]), conflict, 'processed history remains recoverable until finality');
    const sameDayUsdClaim = await makeClaim('usd-character', 'us', { usdCents: 500 });
    await assert.rejects(restarted.commit([{ key: usdKey, state: issue(processed, sameDayUsdClaim), expected: processed }], undefined, undefined, reservation(sameDayUsdClaim, 1000000)), /one MOSS voucher per account per day/, 'processed inclusion does not unlock another daily voucher');
    clock = treasureNextRedemptionAt(processed);
    const nextUsdClaim = await makeClaim('usd-character', 'us', { usdCents: 500 }), nextUsdIssued = issue(processed, nextUsdClaim);
    await assert.rejects(restarted.commit([{ key: usdKey, state: nextUsdIssued, expected: processed }], undefined, undefined, reservation(nextUsdClaim, exactCapacity)), conflict, 'a processed payout cannot fund the next voucher by freeing its reservation');
    const nextCapacity = formatUnits(used + BigInt(usdClaim.amountWei) + BigInt(nextUsdClaim.amountWei), 18);
    await restarted.commit([{ key: usdKey, state: nextUsdIssued, expected: processed }], undefined, undefined, reservation(nextUsdClaim, nextCapacity));
    const withNext = await ledger(), revoked = copy(nextUsdIssued);
    revoked.characters[0].treasureClaims[0].status = 'pending'; delete revoked.characters[0].treasureClaims[0].paymentBlock;
    await restarted.commit([{ key: usdKey, state: revoked, expected: nextUsdIssued }]);
    assert.deepEqual(await ledger(), withNext, 'reorg neither refunds nor duplicates either reservation');
    assert.deepEqual(revoked.characters[0].treasureClaims[0], usdClaim, 'reorg retains the original signed USD payout');
    assert.equal(revoked.characters[0].carriedItems['moss-voucher'], undefined);
    await restarted.release(usdKey);
    assert.deepEqual(await eu.claim(usdKey), revoked, 'realm transfer recovers the original revoked authorization alongside the newer claim');

    // Requotes keep the fixed USD value and all still-valid signatures; one permanent
    // ledger row reserves the largest amount that this voucher ever authorized.
    const quoteEuKey = key('requote-eu'), quoteUsKey = key('requote-us');
    const quoteEuOriginal = account('requote-eu'), quoteUsOriginal = account('requote-us');
    await eu.claim(quoteEuKey); await restarted.claim(quoteUsKey);
    await eu.commit([{ key: quoteEuKey, state: quoteEuOriginal }]);
    await restarted.commit([{ key: quoteUsKey, state: quoteUsOriginal }]);
    const originalEuQuote = await makeClaim('requote-eu', 'eu', { usdCents: 500, priceUsdWei: amount(1) });
    const originalUsQuote = await makeClaim('requote-us', 'us', { usdCents: 500, priceUsdWei: amount(1) });
    const quoteEuIssued = issue(quoteEuOriginal, originalEuQuote), quoteUsIssued = issue(quoteUsOriginal, originalUsQuote);
    const beforeQuotes = (await ledger()).reduce((sum, row) => sum + BigInt(row.amount_wei), 0n);
    const initialCapacity = beforeQuotes + parseUnits('10', 18), increasedCapacity = initialCapacity + parseUnits('5', 18);
    await eu.commit([{ key: quoteEuKey, state: quoteEuIssued, expected: quoteEuOriginal }], undefined, undefined, reservation(originalEuQuote, formatUnits(initialCapacity, 18)));
    await restarted.commit([{ key: quoteUsKey, state: quoteUsIssued, expected: quoteUsOriginal }], undefined, undefined, reservation(originalUsQuote, formatUnits(initialCapacity, 18)));
    const biggerEuQuote = await requote(originalEuQuote, '0.5'), biggerUsQuote = await requote(originalUsQuote, '0.5');
    const biggerEuState = replace(quoteEuIssued, biggerEuQuote), biggerUsState = replace(quoteUsIssued, biggerUsQuote);
    const refreshEu = capacity => eu.commit([{ key: quoteEuKey, state: biggerEuState, expected: quoteEuIssued }], undefined, undefined,
      replacementReservation(originalEuQuote, biggerEuQuote, String(capacity)));
    await assert.rejects(eu.commit([{ key: quoteEuKey, state: biggerEuState, expected: quoteEuIssued }]), conflict, 'ordinary saves cannot replace signed quotes');
    await assert.rejects(refreshEu(increasedCapacity - 1n), conflict, 'requote rejects a one-wei funding shortfall');
    assert.deepEqual(await read(eu, quoteEuKey), quoteEuIssued, 'funding failure keeps original quote and vouchers');
    const voucherDebit = copy(biggerEuState); delete voucherDebit.characters[0].carriedItems['moss-voucher'];
    await assert.rejects(eu.commit([{ key: quoteEuKey, state: voucherDebit, expected: quoteEuIssued }], undefined, undefined,
      replacementReservation(originalEuQuote, biggerEuQuote, increasedCapacity.toString())), conflict, 'refresh must not consume another voucher');
    const voucherCredit = copy(biggerEuState); voucherCredit.characters[0].carriedItems['moss-voucher']++;
    await assert.rejects(eu.commit([{ key: quoteEuKey, state: voucherCredit, expected: quoteEuIssued }], undefined, undefined,
      replacementReservation(originalEuQuote, biggerEuQuote, increasedCapacity.toString())), conflict, 'refresh must not mint a voucher');
    const wrongPrevious = { ...replacementReservation(originalEuQuote, biggerEuQuote, increasedCapacity.toString()), previousClaimHash: id('wrong-previous') };
    await assert.rejects(eu.commit([{ key: quoteEuKey, state: biggerEuState, expected: quoteEuIssued }], undefined, undefined, wrongPrevious), conflict);
    const historyTamper = copy(biggerEuState); historyTamper.characters[0].treasureClaims[0].previousQuotes[0].price.observedAt--;
    await assert.rejects(eu.commit([{ key: quoteEuKey, state: historyTamper, expected: quoteEuIssued }], undefined, undefined,
      replacementReservation(originalEuQuote, biggerEuQuote, increasedCapacity.toString())), conflict, 'previous quote snapshots must remain byte-for-byte identical');
    const changedUsd = { ...await makeClaim('requote-eu', 'eu', { id: originalEuQuote.id, usdCents: 600, priceUsdWei: amount('0.5') }), previousQuotes: [originalEuQuote] };
    await assert.rejects(eu.commit([{ key: quoteEuKey, state: replace(quoteEuIssued, changedUsd), expected: quoteEuIssued }], undefined, undefined,
      replacementReservation(originalEuQuote, changedUsd, increasedCapacity.toString())), 'refresh cannot reroll the fixed USD value');
    const legacy = traded.characters[0].treasureClaims[0];
    const convertedLegacy = { ...await makeClaim(legacy.characterId, legacy.realmId, { id: legacy.id, usdCents: 500, priceUsdWei: amount(1) }), previousQuotes: [legacy] };
    await assert.rejects(restarted.commit([{ key: usKey, state: replace(traded, convertedLegacy), expected: traded }], undefined, undefined,
      replacementReservation(legacy, convertedLegacy, increasedCapacity.toString())), 'legacy claims without a saved USD value cannot be repriced');
    await assert.rejects(eu.commit([{ key: quoteEuKey, state: biggerEuState, expected: quoteEuIssued }], () => { throw Error('Injected requote rollback'); }, undefined,
      replacementReservation(originalEuQuote, biggerEuQuote, increasedCapacity.toString())), /Injected requote rollback/);
    assert.equal((await ledger()).find(row => row.claim_hash === originalEuQuote.claimHash).amount_wei, originalEuQuote.amountWei, 'failed save rolls back reservation increase');

    let enteredRefresh;
    const insideRefresh = new Promise(resolve => { enteredRefresh = resolve; }), holdRefresh = new Promise(resolve => { releaseIssuance = resolve; });
    const euRefresh = eu.commit([{ key: quoteEuKey, state: biggerEuState, expected: quoteEuIssued }], async () => { enteredRefresh(); await holdRefresh; }, undefined,
      replacementReservation(originalEuQuote, biggerEuQuote, increasedCapacity.toString()));
    await insideRefresh;
    const usRefresh = restarted.commit([{ key: quoteUsKey, state: biggerUsState, expected: quoteUsIssued }], undefined, undefined,
      replacementReservation(originalUsQuote, biggerUsQuote, increasedCapacity.toString()));
    const refreshResults = Promise.allSettled([euRefresh, usRefresh]);
    waiting = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const state = (await admin.query('SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE application_name=$1', [`${schema}_restarted`])).rows[0];
      if (state?.wait_event_type === 'Lock' && state.wait_event === 'advisory') { waiting = true; break; }
      await delay(20);
    }
    assert(waiting, 'independent realm requotes serialize on the treasury funding lock');
    releaseIssuance(); releaseIssuance = undefined;
    const refreshed = await refreshResults;
    assert.equal(refreshed[0].status, 'fulfilled'); assert.equal(refreshed[1].status, 'rejected'); assert(conflict(refreshed[1].reason));
    assert.deepEqual(await read(eu, quoteEuKey), biggerEuState);
    assert.equal(await eu.treasureNextRedemptionAt(quoteEuKey), treasureNextRedemptionAt(quoteEuIssued), 'same-day quote refresh leaves daily allowance unchanged');
    assert.deepEqual(await read(restarted, quoteUsKey), quoteUsIssued, 'losing realm keeps its original signed quote and voucher count');
    assert.equal((await ledger()).filter(row => [originalEuQuote.claimHash, biggerEuQuote.claimHash].includes(row.claim_hash)).length, 1, 'refresh updates the original row instead of adding liability twice');
    await assert.rejects(eu.commit([{ key: quoteEuKey, state: quoteEuIssued, expected: biggerEuState }]), conflict, 'stale autosave cannot erase quote history');
    const historyRemoval = copy(biggerEuState); historyRemoval.characters[0].treasureClaims[0].previousQuotes = [];
    await assert.rejects(eu.commit([{ key: quoteEuKey, state: historyRemoval, expected: biggerEuState }]), 'ordinary saves cannot remove previous signatures');
    clock = treasureNextRedemptionAt(quoteEuIssued);
    const smallerQuote = await requote(biggerEuQuote, 1), smallerState = replace(biggerEuState, smallerQuote);
    assert.equal(smallerQuote.claimHash, originalEuQuote.claimHash, 'A-to-B-to-A quotes may revisit a signed digest');
    await eu.commit([{ key: quoteEuKey, state: smallerState, expected: biggerEuState }], undefined, undefined,
      replacementReservation(biggerEuQuote, smallerQuote, increasedCapacity.toString()));
    assert.equal((await ledger()).find(row => row.claim_hash === originalEuQuote.claimHash).amount_wei, biggerEuQuote.amountWei, 'smaller quote never frees the prior maximum reservation');
    assert.equal(await eu.treasureNextRedemptionAt(quoteEuKey), clock, 'next-day refresh does not consume a new daily allowance');
    assert.equal(treasureNextRedemptionAt(smallerState), clock, 'claim history uses the original quote day');
    assert.deepEqual(smallerQuote.previousQuotes, [originalEuQuote, { ...biggerEuQuote, previousQuotes: undefined }].map(({ previousQuotes, ...quote }) => quote));
    assert.equal(smallerState.characters[0].carriedItems['moss-voucher'], quoteEuIssued.characters[0].carriedItems['moss-voucher']);
    await assert.rejects(restarted.commit([{ key: quoteUsKey, state: biggerUsState, expected: quoteUsIssued }], undefined, undefined,
      replacementReservation(originalUsQuote, biggerUsQuote, increasedCapacity.toString())), conflict, 'smaller refreshed quote cannot fund another realm');
    await eu.release(quoteEuKey);
    assert.deepEqual(await restarted.claim(quoteEuKey), smallerState, 'realm transfer retains every signed quote and fixed USD value');
    const historicalPaid = copy(smallerState);
    Object.assign(historicalPaid.characters[0].treasureClaims[0], { status: 'paid', paidAt: Date.now(), paymentBlock: { hash: id('old-quote-paid'), number: '0x66' }, settledClaimHash: biggerEuQuote.claimHash });
    await restarted.commit([{ key: quoteEuKey, state: historicalPaid, expected: smallerState }]);
    assert.equal((await ledger()).find(row => row.claim_hash === originalEuQuote.claimHash).amount_wei, biggerEuQuote.amountWei, 'settling a historical quote never releases permanent backing');

    // An older realm can keep using its three-column ledger INSERT after migration.
    const goldKey = key('gold-only'), goldState = account('gold-only');
    const goldClaim = await makeClaim('gold-only', 'eu', { goldRoundId: 'daily-exempt-round', amount: '1.0' });
    goldState.characters[0].treasureClaims.push(goldClaim);
    assert(treasurePlayerValid(goldState.characters[0]));
    await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state) VALUES($1,$2::jsonb)`, [goldKey, JSON.stringify(goldState)]);
    await admin.query(`INSERT INTO ${schema}.mossvale_treasure_claims(claim_hash,contract,amount_wei) VALUES($1,$2,$3)`, [goldClaim.claimHash, contract.toLowerCase(), goldClaim.amountWei]);
    await admin.query(`UPDATE ${schema}.mossvale_treasure_claims SET account_key=NULL,redeemed_at=NULL WHERE claim_hash=$1`, [originalEuQuote.claimHash]);
    const migrationReader = makeStore('migration'); await migrationReader.start();
    assert.equal(await migrationReader.treasureNextRedemptionAt(quoteEuKey), treasureNextRedemptionAt(quoteEuIssued), 'startup backfills the original quote day without rewriting player JSON');
    assert.deepEqual(await read(migrationReader, quoteEuKey), historicalPaid);
    assert.equal(await migrationReader.treasureNextRedemptionAt(goldKey), 0, 'gold-round payouts are excluded from ledger backfill');
    assert.equal(treasureNextRedemptionAt(goldState), 0, 'gold-round history is excluded from daily voucher allowance');
    await eu.claim(goldKey);
    const afterGoldVoucher = await makeClaim('gold-only', 'eu', 1), afterGoldIssued = issue(goldState, afterGoldVoucher);
    await eu.commit([{ key: goldKey, state: afterGoldIssued, expected: goldState }], undefined, undefined, reservation(afterGoldVoucher, 1000000));
    assert.equal(await eu.treasureNextRedemptionAt(goldKey), treasureNextRedemptionAt(afterGoldIssued), 'a gold payout does not block the first daily voucher');

    const dailyKey = key('daily'), dailyOriginal = account('daily-main');
    dailyOriginal.characters.push(account('daily-alt').characters[0]);
    await eu.claim(dailyKey); await eu.commit([{ key: dailyKey, state: dailyOriginal }]);
    const dailyClaim = await makeClaim('daily-main', 'eu', 1), dailyIssued = issue(dailyOriginal, dailyClaim);
    await eu.commit([{ key: dailyKey, state: dailyIssued, expected: dailyOriginal }], undefined, undefined, reservation(dailyClaim, 1000000));
    const relinkedWallet = Wallet.createRandom().address, altClaim = await makeClaim('daily-alt', 'us', 1, relinkedWallet);
    const relinked = copy(dailyIssued); relinked.characters[1].auctionWallet = relinkedWallet;
    await eu.commit([{ key: dailyKey, state: relinked, expected: dailyIssued }]);
    const dailyPaid = copy(relinked);
    Object.assign(dailyPaid.characters[0].treasureClaims[0], { status: 'paid', paidAt: Date.now(), paymentBlock: { hash: id('daily-finalized'), number: '0x67' } });
    await eu.commit([{ key: dailyKey, state: dailyPaid, expected: relinked }]);
    assert.equal(await restarted.claim(dailyKey), null, 'another realm cannot claim an already owned account');
    await eu.release(dailyKey); assert.deepEqual(await restarted.claim(dailyKey), dailyPaid);
    await assert.rejects(restarted.commit([{ key: dailyKey, state: issue(dailyPaid, altClaim), expected: dailyPaid }], undefined, undefined, reservation(altClaim, 1000000)), /one MOSS voucher per account per day/, 'paid settlement, another character, relinked wallet and realm change do not reset the allowance');
    await admin.query(`UPDATE ${schema}.mossvale_treasure_claims SET account_key=NULL,redeemed_at=NULL WHERE claim_hash=$1`, [dailyClaim.claimHash]);
    await assert.rejects(restarted.commit([{ key: dailyKey, state: issue(dailyPaid, altClaim), expected: dailyPaid }], undefined, undefined, reservation(altClaim, 1000000)), /one MOSS voucher per account per day/, 'legacy history still blocks a second daily claim');
    const afterDeletion = { characters: [copy(dailyPaid.characters[1])] };
    await restarted.commit([{ key: dailyKey, state: afterDeletion, expected: dailyPaid }]);
    const dailyNext = treasureNextRedemptionAt(dailyPaid);
    assert.equal(await restarted.treasureNextRedemptionAt(dailyKey), dailyNext, 'deleting the final paid legacy claim backfills its allowance');
    await restarted.commit([{ key: dailyKey, state: afterDeletion }]);
    assert.deepEqual(await read(restarted, dailyKey), afterDeletion, 'ordinary saves keep player JSON unchanged');
    const dailyLedger = await ledger(); clock = dailyNext - 1;
    await assert.rejects(restarted.commit([{ key: dailyKey, state: issue(afterDeletion, altClaim), expected: afterDeletion }], undefined, undefined, reservation(altClaim, 1000000)), /one MOSS voucher per account per day/, 'allowance remains consumed until UTC midnight after deletion and autosave');
    assert.deepEqual(await ledger(), dailyLedger, 'rejected daily claims do not reserve funds');
    assert.deepEqual(await read(restarted, dailyKey), afterDeletion, 'rejected daily claims keep the remaining vouchers');
    clock++;
    const midnightIssued = issue(afterDeletion, altClaim);
    await restarted.commit([{ key: dailyKey, state: midnightIssued, expected: afterDeletion }], undefined, undefined, reservation(altClaim, 1000000));
    assert.deepEqual(await read(restarted, dailyKey), midnightIssued, 'UTC midnight unlocks one new voucher even for an older prepared claim');
    assert.equal((await ledger()).find(row => row.claim_hash === altClaim.claimHash).redeemed_at, String(clock), 'ledger records actual issuance time, not the older prepared quote');
    const thirdClaim = await makeClaim('daily-alt', 'us', 1, relinkedWallet);
    await assert.rejects(restarted.commit([{ key: dailyKey, state: issue(midnightIssued, thirdClaim), expected: midnightIssued }], undefined, undefined, reservation(thirdClaim, 1000000)), /one MOSS voucher per account per day/, 'the next UTC day also permits only one voucher');
    assert.equal(fatalCalls.length, 0, 'expected conflicts leave both store connections usable');
    console.log('Treasury PostgreSQL passed: one voucher per account per UTC day across realms, characters, wallets, legacy history, deletion, restart and failures; additive schema without player JSON changes, exact midnight reset, gold-round exemption, same/next-day requote exemption, permanent backing and processed/reorg recovery.');
  }
} finally {
  Date.now = realNow;
  releaseIssuance?.();
  await Promise.allSettled(stores.map(store => store.close()));
  if (admin) {
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); }
  }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe', timeout: 20000 });
}
