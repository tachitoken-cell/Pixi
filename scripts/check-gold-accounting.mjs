import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createPlayerStore } from '../src/player-store.mjs';
import { goldEvent, goldEventValid, goldSupply } from '../src/gold-ledger.mjs';
import { readGoldStats } from '../src/gold-stats.mjs';

const characterId = randomUUID(), accountKey = createHash('sha256').update(characterId).digest('hex');
const schema = 'gold_accounting_' + randomUUID().replaceAll('-', '');
let container, admin, store, pool;
try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    container = 'mossvale-' + schema;
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only', '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
    connectionString = `postgresql://postgres:isolated-test-only@${execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim()}/postgres`;
  }
  const url = new URL(connectionString);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use disposable local PostgreSQL.');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString });
    try { await admin.connect(); break; } catch (error) { await admin.end(); if (attempt > 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`SET search_path=${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  store = createPlayerStore({ connectionString: url.toString() });
  await store.start(); await store.claim(accountKey);
  const account = { characters: [{ id: characterId, gold: 1000, auctions: [], auctionSales: [], friendIds: [], friendRequestIds: [], ignoreIds: [] }] };
  await store.commit([{ key: accountKey, state: account }]);
  await store.close();
  await admin.query('UPDATE mossvale_economy SET version=1');
  await admin.query("SELECT set_config('mossvale.economy_supported','1',false),set_config('mossvale.economy_epoch','1',false)");
  store = createPlayerStore({ connectionString: url.toString() });
  await store.start(); await store.claim(accountKey);
  const read = async () => (await store.read([accountKey]))[0].state;
  const commit = (state, events = [], expected, action) => store.commit([{ key: accountKey, state, ...(expected ? { expected } : {}) }], undefined, undefined, undefined, events, action);
  const conservation = error => error.code === 'PLAYER_STORE_CONFLICT' && /Gold conservation/.test(error.message);
  for (const [delta, events] of [[1, []], [-1, []], [1, [goldEvent(characterId, 'reward:monster', 2)]]]) {
    const altered = structuredClone(account); altered.characters[0].gold += delta;
    await assert.rejects(commit(altered, events), conservation, 'unexplained mint, burn and mismatched reward must roll back');
    assert.deepEqual(await read(), account);
  }
  assert.equal((await admin.query('SELECT COUNT(*)::int AS count FROM mossvale_gold_events')).rows[0].count, 0, 'rejected gold events are not written');
  const reward = goldEvent(characterId, 'reward:monster', 10);
  assert(goldEventValid(reward)); assert(!goldEventValid({ ...reward, created: NaN }));
  assert.throws(() => goldEvent(characterId, 'reward:monster', .5));
  account.characters[0].gold += 10;
  await store.commit([{ key: accountKey, state: account }], undefined, undefined, undefined, [reward]);
  account.characters[0].gold += 10;
  await assert.rejects(store.commit([{ key: accountKey, state: account }], undefined, undefined, undefined, [reward]), /duplicate key/);
  assert.equal((await store.read())[0].state.characters[0].gold, 1010, 'duplicate event aborts the balance change too');
  account.characters[0].gold = 807;
  account.characters[0].auctions = [{ item: { kind: 'gold', id: 'gold', quantity: 200 } }];
  await store.commit([{ key: accountKey, state: account, expected: (await store.read())[0].state }], undefined, undefined, undefined,
    [goldEvent(characterId, 'service:craft', -3), goldEvent(characterId, 'escrow:auction', -200)]);
  assert.equal(goldSupply(account), 1007n);
  assert.equal(goldSupply(account, { [characterId]: 8 }), 1015n);
  assert.throws(() => goldSupply(account, { stranger: 8 }));
  account.characters[0].gold += 8;
  await commit(account, [goldEvent(characterId, 'admin:grant', 8)]);
  // Move an already-accounted grant into pending delivery, without creating gold again.
  await admin.query(`UPDATE mossvale_players SET state=jsonb_set(state,'{characters,0,gold}',to_jsonb((state->'characters'->0->>'gold')::bigint-8)),pending_credits=$1 WHERE account_key=$2`, [JSON.stringify({ [characterId]: 8 }), accountKey]);
  account.characters[0].gold -= 8;
  account.characters[0].gold -= 50;
  await store.commit([{ key: accountKey, state: account }], undefined, undefined, undefined,
    [goldEvent(characterId, 'reset', -50)]);
  pool = new pg.Pool({ connectionString: url.toString() });
  const stats = await readGoldStats(pool);
  assert.equal(stats.status, 'ok');
  assert.equal(stats.supply.total, '965', 'pending credit collection preserves supply and reset removes only its burn');
  assert.equal(stats.supply.escrow, '200');
  for (const days of [1, 7, 30]) {
    const period = stats.windows[days];
    assert.equal(period.created, '10'); assert.equal(period.burned, '3'); assert.equal(period.sinkRatio, .3);
    assert.equal(period.administrativeCreated, '8'); assert.equal(period.resetBurned, '50');
  }
  assert(!JSON.stringify(stats).includes(characterId) && !JSON.stringify(stats).includes(accountKey), 'public totals contain no private identity');
  const fresh = await read(), extra = { ...structuredClone(fresh.characters[0]), id: randomUUID(), gold: 1, auctions: [] };
  await assert.rejects(commit({ characters: [...fresh.characters, extra] }), conservation, 'a new character cannot introduce unaccounted gold');
  extra.gold = 0;
  await commit({ characters: [...fresh.characters, extra] });
  let current = await read(); current.characters[1].gold = 4;
  await commit(current, [goldEvent(extra.id, 'admin:grant', 4)]);
  await assert.rejects(commit(fresh), conservation, 'deleting a funded character requires its burn event');
  await commit(fresh, [goldEvent(extra.id, 'deletion:character', -4)]);

  const wallet = '0x' + '22'.repeat(20), contract = '0x' + '11'.repeat(20), now = Date.now();
  current = await read(); Object.assign(current.characters[0], { auctionWallet: wallet, treasureClaims: [] });
  await commit(current);
  const round = await store.openGoldRound({ id: randomUUID(), startsAt: now - 1000, endsAt: now + 60000, contract, budgetUsdCents: 10000 },
    { contract, capacityWei: String(100n * 10n ** 18n), balanceWei: String(100n * 10n ** 18n), amountWei: String(100n * 10n ** 18n), price: { usdWei: String(10n ** 18n), observedAt: now } });
  const action = { kind: 'offer', roundId: round.id, accountKey, characterId, gold: 100, priceCentsPer1000: 50, wallet, realmId: 'eu' };
  const offered = structuredClone(current); offered.characters[0].gold -= 100;
  const malformed = structuredClone(offered); malformed.characters.push({ ...extra, gold: 1 });
  await assert.rejects(commit(malformed, [goldEvent(characterId, 'escrow:merchant', -100)], current, action), conservation);
  assert.deepEqual((await store.goldRounds(accountKey))[0].bids, {}, 'conservation failure rolls back the merchant offer as well as player gold');
  await commit(offered, [goldEvent(characterId, 'escrow:merchant', -100)], current, action);
  const amended = structuredClone(offered); amended.characters[0].gold += 40;
  await commit(amended, [goldEvent(characterId, 'escrow:merchant', 40)], offered, { ...action, gold: 60 });
  await commit(current, [goldEvent(characterId, 'escrow:merchant', 60)], amended, { ...action, kind: 'cancel' });
  assert.deepEqual(await read(), current, 'merchant offer, partial refund and cancellation preserve gold exactly');
  assert.deepEqual((await store.goldRounds(accountKey))[0].bids, {});
  console.log('Gold accounting: production conservation rejects unexplained mint/burn, forged rewards and funded character creation/deletion; atomic event and merchant rollback, escrow/refunds, pending delivery, privacy and ordinary/admin/reset statistics passed.');
} finally {
  await store?.close(); await pool?.end();
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
}
