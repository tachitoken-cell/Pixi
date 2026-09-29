import './check-player-country.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { Wallet, id } from 'ethers';
import pg from 'pg';
import { WebSocket } from 'ws';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { createPublicStats, STATS_REALMS } from '../src/public-stats.mjs';
import { createAccountDeletionProvider } from '../src/account-deletion-provider.mjs';
import { playerDeletions } from '../src/player-deletions.mjs';
import { createAuctionChain, tokenAuctionInterface as abi, erc20Interface } from '../src/auction-chain.mjs';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM } from '../src/auction.ts';
import { createGameServer } from '../server.mjs';

const suffix = randomUUID().replaceAll('-', ''), schema = `stats_${suffix}`, collectors = [];
let container, admin, game, guest;
try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    container = `mossvale-stats-${suffix}`;
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only', '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
    connectionString = `postgresql://postgres:isolated-test-only@${execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim()}/postgres`;
  }
  const url = new URL(connectionString);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a disposable local PostgreSQL instance.');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
    try { await admin.connect(); break; } catch (error) { await admin.end(); if (attempt > 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`SET search_path=${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  let at = Date.UTC(2026, 8, 18, 12), totalUsers = 42, unavailable = false, nextBlock = 3;
  const alice = createHash('sha256').update('alice').digest('hex'), bob = createHash('sha256').update('bob').digest('hex');
  // JSONB sorts contract keys; keep the old deployment first for the controlled outage below.
  const users = { eu: [alice], us: [bob], asia: [] }, contract = '0x1111111111111111111111111111111111111111';
  const purchases = [{ block: 1, id: `${id('one')}:0`, amountWei: '900719925474099300000000000000000000' }, { block: 2, id: `${id('two')}:0`, amountWei: '2' }];
  let indexed = [];
  const source = {
    status: async () => ({ enabled: !unavailable, contract, chainId: 4663 }),
    purchaseHistory: async (from = 0) => { indexed.push(from); return { contract, chainId: 4663, purchases: purchases.filter(row => row.block >= from && row.block < nextBlock), fromBlock: from, nextBlock, finalizedBlock: nextBlock - 1, complete: true }; },
  };
  const make = realmId => {
    const stats = createPublicStats({ connectionString: url.toString(), realmId, accounts: () => users[realmId].map(key => ({ key, country: key === alice ? 'CN' : null })), now: () => at, automatic: false,
      countUsers: async () => { if (unavailable) throw Error('offline'); return totalUsers; }, auctionChain: source });
    collectors.push(stats); return stats;
  };
  const [eu, us, asia] = STATS_REALMS.map(make);
  await Promise.all(collectors.map(stats => stats.start()));
  await eu.syncSources();
  let data = await eu.read();
  assert.equal(data.live.players, 2);
  assert.equal(data.registered.total, 42, 'Count registrations, independent of connected/game accounts.');
  assert.equal(data.auction.totalWei, '900719925474099300000000000000000002', 'Token totals must never pass through Number.');
  assert.equal(data.hourly[0].activePlayers, 2);
  assert.equal(data.countries.total, 2);
  assert.equal(data.countries.known, 1);
  assert.equal(data.countries.unknown, 1);
  assert.deepEqual(data.countries.rows.find(row => row.country === 'CN'), { country: 'CN', players: 1 });
  assert(!JSON.stringify(data).includes(alice) && !JSON.stringify(data).includes(bob));
  assert.deepEqual(await Promise.all(Array.from({ length: 10 }, () => eu.read())), Array(10).fill(data), 'Public reads share their bounded cache.');
  await assert.rejects(eu.read('bad'), { status: 400 });

  // Reconnect, switch character/realm and briefly connect between samples: one unique account.
  users.eu = []; eu.observe([{ key: alice, country: 'CN' }]); await eu.pulse();
  at += 10000;
  const lastPeakAt = at;
  users.asia = [alice]; asia.observe(); await asia.pulse();
  at += 5000;
  users.asia = []; asia.observe([{ key: alice, country: 'CN' }]); await asia.pulse();
  at += 15000;
  await Promise.all(collectors.map(stats => stats.pulse()));
  data = await eu.read();
  assert.equal(data.hourly[0].activePlayers, 2);
  assert.equal(data.live.players, 1);
  assert.equal(data.countries.total, 2, 'Realm switching and reconnects count each account once in country totals.');
  assert.equal(data.countries.known, 1);
  assert.equal(data.concurrent[0].players, 2, 'A later lower sample in the same slot cannot erase the observed minute peak.');
  assert.equal(data.peaks.day, 2, 'Trailing peak preserves complete observations overwritten in the raw realm slots.');

  // Every 30-second sample is present for this hour, while long-lived Bob crosses UTC rollover.
  for (let tick = 2; tick < 120; tick++) {
    at = Date.UTC(2026, 8, 18, 12) + tick * 30000;
    await Promise.all(collectors.map(stats => stats.pulse()));
  }
  at = Date.UTC(2026, 8, 18, 13);
  await Promise.all(collectors.map(stats => stats.pulse()));
  data = await eu.read();
  assert.equal(data.hourly[0].complete, true);
  assert.equal(data.hourly[1].activePlayers, 1, 'A session across an hour boundary counts in both hours.');
  assert.equal(data.peaks.allTime, 2);
  const completeWeek = await eu.read('7d');
  assert.equal(completeWeek.concurrent[0].players, completeWeek.hourly[0].averagePlayers, 'A complete chart hour keeps its measured average.');
  assert.equal(completeWeek.concurrent[0].complete, true, 'Complete hourly chart readings remain labelled complete.');
  const tokens = (await admin.query('SELECT hour,token FROM mossvale_stats_activity ORDER BY hour')).rows;
  assert.equal(tokens.length, 3); assert(tokens.every(row => row.token !== alice && row.token !== bob));
  assert.notEqual(tokens.find(row => Number(row.hour) === at).token, tokens.find(row => Number(row.hour) < at).token, 'Tokens rotate per hour.');

  at += 90000;
  await eu.pulse(); await us.pulse();
  data = await eu.read();
  assert.equal(data.live.players, null); assert.equal(data.live.observedPlayers, 1); assert.equal(data.live.realms[2].players, null);
  assert(data.concurrent.some(row => row.players === null), 'Missing realm samples produce gaps, not zero.');
  const partialWeek = await eu.read('7d'), partialHour = partialWeek.hourly[1], partialPoint = partialWeek.concurrent[1];
  assert.equal(partialHour.averagePlayers, 1, 'The partial hour retains its one complete three-realm observation.');
  assert.equal(partialPoint.players, partialHour.averagePlayers, 'A short reporting outage must not erase measured hourly averages from the seven-day chart.');
  assert.equal(partialPoint.complete, false, 'Partial hourly readings remain visibly distinct from complete hours.');

  // A realm can publish a sample after an API read starts but before its row is read.
  at += 10000; // Expire the preceding partial-week read before exercising collection.
  const pooledQuery = pg.Pool.prototype.query;
  let racedSample = false;
  pg.Pool.prototype.query = function (text, ...args) {
    if (!racedSample && text === 'SELECT * FROM mossvale_stats_realms') {
      racedSample = true; at += 1;
      return us.pulse().then(() => pooledQuery.call(this, text, ...args));
    }
    return pooledQuery.call(this, text, ...args);
  };
  try { data = await eu.read('7d'); }
  finally { pg.Pool.prototype.query = pooledQuery; }
  assert(racedSample);
  assert.equal(data.live.realms.find(row => row.id === 'us').available, true, 'A sample committed during the read is not a future-dated outage.');
  assert.equal(data.generatedAt, new Date(at).toISOString(), 'Response freshness uses collection completion time.');
  await admin.query("UPDATE mossvale_stats_realms SET sampled_at=$1 WHERE realm='us'", [at + 5000]);
  assert.equal((await eu.read('30d')).live.realms.find(row => row.id === 'us').available, false, 'A genuinely future-dated realm sample remains unavailable.');
  await us.pulse();

  // A metadata failure rolls back both the event and cursor, and retry indexes it once.
  purchases.push({ block: 3, id: `${id('three')}:0`, amountWei: '8' }); nextBlock = 4;
  await admin.query(`CREATE FUNCTION reject_cursor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.name='auction' AND NEW.value->>'nextBlock'='4' THEN RAISE EXCEPTION 'controlled cursor failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_cursor BEFORE UPDATE ON mossvale_stats_meta FOR EACH ROW EXECUTE FUNCTION reject_cursor()`);
  await eu.syncSources();
  assert.equal((await admin.query("SELECT value->>'nextBlock' AS cursor FROM mossvale_stats_meta WHERE name='auction'")).rows[0].cursor, '3');
  assert.equal((await admin.query('SELECT COUNT(*)::int AS n FROM mossvale_stats_purchases')).rows[0].n, 2);
  await admin.query('DROP TRIGGER reject_cursor ON mossvale_stats_meta');
  at += 60000; await Promise.all(collectors.map(stats => stats.syncSources()));
  data = await eu.read();
  assert.equal(data.auction.totalWei, '900719925474099300000000000000000010');
  assert.equal((await admin.query('SELECT COUNT(*)::int AS n FROM mossvale_stats_purchases')).rows[0].n, 3);
  assert(indexed.filter(from => from === 3).length >= 2, 'Failed cursor advance retries the same block.');
  // Explicit replay also deduplicates identical log events.
  await admin.query("UPDATE mossvale_stats_meta SET value=jsonb_set(jsonb_set(value-'contracts','{nextBlock}','0'),'{checkedAt}','0') WHERE name='auction'");
  at += 60000; await eu.syncSources();
  assert.equal((await eu.read()).auction.totalWei, data.auction.totalWei);

  // A failed unlock must discard its backend, otherwise the session lock strands other realms.
  const query = pg.Client.prototype.query;
  let failedUnlockPid;
  pg.Client.prototype.query = function (text, ...args) {
    if (!failedUnlockPid && typeof text === 'string' && text.startsWith('SELECT pg_advisory_unlock(')) {
      failedUnlockPid = this.processID;
      return Promise.reject(Object.assign(Error('Controlled unlock transport failure'), { code: '08006' }));
    }
    return query.call(this, text, ...args);
  };
  try { await assert.rejects(eu.syncSources(), { code: '08006' }); }
  finally { pg.Client.prototype.query = query; }
  assert.ok(failedUnlockPid, 'The real collector attempted to release its advisory lock.');
  for (let attempt = 0; ; attempt++) {
    const { rows } = await admin.query("SELECT COUNT(*)::integer AS n FROM pg_locks WHERE pid=$1 AND locktype='advisory'", [failedUnlockPid]);
    if (rows[0].n === 0) break;
    assert.ok(attempt < 50, 'Discarding the failed connection must release its session advisory lock.');
    await delay(20);
  }
  at += 60000; await us.syncSources(); await eu.pulse();
  assert.equal(Number((await admin.query("SELECT value->>'checkedAt' AS checked FROM mossvale_stats_meta WHERE name='auction'")).rows[0].checked), at, 'Another realm can refresh sources after the failed unlock.');
  assert.equal(Number((await admin.query("SELECT sampled_at FROM mossvale_stats_realms WHERE realm='eu'")).rows[0].sampled_at), at, 'The original collector can resume presence updates.');

  // A stalled client cannot hold the shared analytics transaction lock indefinitely.
  at += 15000;
  let abandonedPid;
  pg.Client.prototype.query = function (text, ...args) {
    if (!abandonedPid && text === "SELECT to_regclass('mossvale_account_deletions') AS name") {
      abandonedPid = this.processID;
      return (async () => {
        assert.equal((await query.call(this, 'SHOW idle_in_transaction_session_timeout')).rows[0].idle_in_transaction_session_timeout, '30s');
        await query.call(this, "INSERT INTO mossvale_stats_meta VALUES ('abandoned-test','true'::jsonb)");
        // Shorten only this isolated test transaction; production retains the 30-second bound.
        await query.call(this, 'SET LOCAL idle_in_transaction_session_timeout=250');
        await delay(500);
        return query.call(this, text, ...args);
      })();
    }
    return query.call(this, text, ...args);
  };
  try {
    const abandoned = assert.rejects(eu.pulse(), /connection error|not queryable|Connection terminated/);
    for (let attempt = 0; !abandonedPid; attempt++) { assert(attempt < 100); await delay(10); }
    await us.pulse();
    await abandoned;
  } finally { pg.Client.prototype.query = query; }
  assert.equal(Number((await admin.query("SELECT sampled_at FROM mossvale_stats_realms WHERE realm='us'")).rows[0].sampled_at), at, 'Another realm samples again after the abandoned lock expires.');
  assert.equal((await admin.query("SELECT COUNT(*)::integer AS n FROM pg_locks WHERE pid=$1 AND locktype='advisory'", [abandonedPid])).rows[0].n, 0, 'PostgreSQL releases the abandoned transaction lock without a game restart.');
  assert.equal((await admin.query("SELECT COUNT(*)::integer AS n FROM mossvale_stats_meta WHERE name='abandoned-test'")).rows[0].n, 0, 'The idle timeout rolls back unfinished analytics writes.');
  at += 15000; await eu.pulse();
  assert.equal(Number((await admin.query("SELECT sampled_at FROM mossvale_stats_realms WHERE realm='eu'")).rows[0].sampled_at), at, 'The failed collector reconnects and resumes sampling.');

  unavailable = true; at += 11 * 60000; await eu.syncSources();
  data = await eu.read();
  assert.equal(data.registered.status, 'stale'); assert.equal(data.registered.total, 42);
  assert.equal(data.auction.status, 'stale'); assert.equal(data.auction.totalWei, '900719925474099300000000000000000010');

  // Contract replacement preserves history and keeps indexing late old-contract finalizations.
  const baseline = BigInt(data.auction.totalWei), oldUpdatedAt = data.auction.updatedAt, replacement = '0x2222222222222222222222222222222222222222', historyCalls = [];
  const oldHistory = source.purchaseHistory;
  let failedContract = replacement, partialHistory = true;
  unavailable = false;
  await admin.query("UPDATE mossvale_stats_meta SET value=value-'contracts' WHERE name='auction'"); // Actual pre-migration metadata has one cursor.
  await admin.query('INSERT INTO mossvale_stats_purchases VALUES ($1,$2,$3,$4),($5,$6,$3,$4)', [4663, Wallet.createRandom().address.toLowerCase(), 'unrelated', '999', 1, contract]);
  purchases.push({ block: 4, id: `${id('late-old')}:0`, amountWei: '11' }); nextBlock = 5;
  const newPurchases = [{ block: 1, id: `${id('one')}:0`, amountWei: '7' }, { block: 9, id: `${id('new-later')}:0`, amountWei: '13' }];
  source.status = async () => ({ enabled: !unavailable, contract: replacement, previousContract: failedContract === contract ? undefined : contract, chainId: 4663 });
  source.purchaseHistory = async (from = 0, _blockCount, requested) => {
    assert([contract, replacement].includes(requested), 'Only verified current and previous deployments are indexed.');
    historyCalls.push({ contract: requested, from });
    if (requested === failedContract) throw Error('Controlled deployment RPC failure');
    if (requested === contract) return oldHistory(from);
    const next = partialHistory ? Math.min(from + 1, 12) : 12;
    return { contract: requested, chainId: 4663, purchases: newPurchases.filter(row => row.block >= from && row.block < next),
      fromBlock: from, nextBlock: next, finalizedBlock: 11, complete: next === 12 };
  };
  at += 60000; await eu.syncSources(); data = await eu.read();
  assert.deepEqual(historyCalls[0], { contract, from: 4 }, 'The legacy cursor is reused, rather than rescanning old blocks.');
  assert.equal(data.auction.totalWei, String(baseline + 11n)); assert.equal(data.auction.status, 'stale');
  assert.equal(data.auction.updatedAt, oldUpdatedAt, 'A new-contract failure preserves the existing displayed baseline and freshness.');
  failedContract = undefined;
  at += 60000; await us.syncSources(); data = await eu.read();
  assert.equal(data.auction.totalWei, String(baseline + 18n)); assert.equal(data.auction.status, 'indexing');
  assert.equal(data.auction.updatedAt, oldUpdatedAt, 'Partial backfill does not erase the old total or claim full freshness.');
  let migration = (await admin.query("SELECT value FROM mossvale_stats_meta WHERE name='auction'")).rows[0].value;
  assert.equal(migration.contracts[contract].nextBlock, 5); assert.equal(migration.contracts[replacement].nextBlock, 8);
  failedContract = contract;
  at += 60000; await eu.syncSources(); data = await eu.read();
  assert.equal(data.auction.totalWei, String(baseline + 18n)); assert.equal(data.auction.status, 'stale', 'An old-contract outage retains both totals and retries its known cursor even when status omits it.');
  purchases.push({ block: 5, id: `${id('later-old')}:0`, amountWei: '17' }); nextBlock = 6;
  failedContract = undefined; partialHistory = false;
  at += 60000; await eu.syncSources(); data = await eu.read();
  assert.equal(data.auction.totalWei, String(baseline + 48n)); assert.equal(data.auction.status, 'ok');
  assert.equal(data.auction.contract, replacement); assert.equal(data.auction.finalizedBlock, 11);
  migration = (await admin.query("SELECT value FROM mossvale_stats_meta WHERE name='auction'")).rows[0].value;
  assert.equal(migration.contracts[contract].nextBlock, 6); assert.equal(migration.contracts[replacement].nextBlock, 12);
  at += 60000; await asia.syncSources();
  assert.equal((await eu.read()).auction.totalWei, String(baseline + 48n), 'Another realm resumes each cursor without counting either deployment twice.');

  // A second replacement discovers both old deployments even without a retained oldest cursor.
  const referralContract = '0x3333333333333333333333333333333333333333';
  await admin.query("UPDATE mossvale_stats_meta SET value=jsonb_set(value,'{contracts}',(value->'contracts')-$1::text) WHERE name='auction'", [contract]);
  purchases.push({ block: 6, id: `${id('late-original-after-second-replacement')}:0`, amountWei: '31' }); nextBlock = 7;
  source.status = async () => ({ enabled: true, contract: referralContract, previousContract: replacement,
    previousContracts: [replacement, contract, replacement], chainId: 4663 });
  source.purchaseHistory = async (from = 0, _blockCount, requested) => {
    historyCalls.push({ contract: requested, from });
    if (requested === contract) return oldHistory(from);
    assert([replacement, referralContract].includes(requested));
    const latest = requested === replacement ? { block: 12, id: `${id('late-taxed-after-second-replacement')}:0`, amountWei: '29' }
      : { block: 1, id: `${id('first-referral-contract-sale')}:0`, amountWei: '23' };
    return { contract: requested, chainId: 4663, purchases: latest.block >= from ? [latest] : [], fromBlock: from,
      nextBlock: latest.block + 1, finalizedBlock: latest.block, complete: true };
  };
  at += 60000; await eu.syncSources(); data = await eu.read();
  assert.equal(data.auction.totalWei, String(baseline + 131n), 'current and both previous contracts retain exact totals and late old payments');
  assert.equal(data.auction.contract, referralContract); assert.equal(data.auction.status, 'ok');
  migration = (await admin.query("SELECT value FROM mossvale_stats_meta WHERE name='auction'")).rows[0].value;
  assert.deepEqual(Object.keys(migration.contracts).sort(), [contract, replacement, referralContract]);
  at += 60000; await asia.syncSources();
  assert.equal((await eu.read()).auction.totalWei, String(baseline + 131n), 'plural history resumes without recounting any contract or duplicate alias');

  at += 3 * 3600000; await eu.pulse(); data = await eu.read('all');
  assert(data.hourly.some(row => row.activePlayers === null), 'Hours without collection remain gaps.');
  await eu.syncSources();
  assert.equal((await admin.query('SELECT COUNT(*)::int AS n FROM mossvale_stats_activity WHERE hour < $1', [at - 2 * 3600000])).rows[0].n, 0, 'Private hourly tokens expire while hourly aggregates remain.');
  await us.stop(); await us.stop(); at += 15000; data = await eu.read();
  assert.equal(data.live.realms.find(row => row.id === 'us').available, false, 'Graceful shutdown becomes unavailable promptly.');
  at = lastPeakAt + 86400000 - 1;
  data = await eu.read('7d');
  assert.equal(data.peaks.day, 2, 'A peak within the exact trailing window survives even when its 30-second slot starts outside it.');
  at += 2;
  data = await eu.read('30d');
  assert.equal(data.peaks.day, 1, 'A peak older than 24 hours expires without retaining the rest of its UTC hour.');
  assert.equal(data.peaks.allTime, 2, 'Expiring the rolling peak never erases the durable all-time peak.');
  // A three-hour bucket combines a full hour, a partial hour, and a missing hour.
  const weightedHour = Date.UTC(2026, 8, 18, 18), zeroHour = weightedHour + 3 * 3600000;
  await admin.query(`INSERT INTO mossvale_stats_hours (hour,active_players,peak_players,average_players,samples) VALUES ($1,1,1,1,120),($2,2,2,2,30),($3,0,0,0,60)`,
    [weightedHour, weightedHour + 3600000, zeroHour]);
  at += 140 * 86400000; await eu.pulse(); data = await eu.read('all');
  assert(data.concurrent.length <= 1440 && data.concurrentIntervalSeconds > 3600, 'Long history charts stay bounded without converting gaps into zero.');
  assert(data.concurrent.some(row => row.players === null));
  assert.equal(data.concurrentIntervalSeconds, 3 * 3600, 'Fixture exercises three-hour downsampling.');
  const weightedPoint = data.concurrent.find(row => Date.parse(row.at) === weightedHour), zeroPoint = data.concurrent.find(row => Date.parse(row.at) === zeroHour);
  assert.equal(weightedPoint.players, (1 * 120 + 2 * 30) / 150, 'Downsampled averages weight recorded samples, not hourly means or missing hours.');
  assert.equal(weightedPoint.complete, false, 'Downsampling cannot promote incomplete coverage to complete.');
  assert.equal(zeroPoint.players, 0, 'A measured zero survives downsampling alongside missing hours.');
  assert.equal(zeroPoint.complete, false);
  const missingPoint = data.concurrent.find(row => Date.parse(row.at) === zeroHour + 3 * 3600000);
  assert.equal(missingPoint.players, null, 'A bucket without any complete realm readings remains a gap.');
  assert.equal(missingPoint.complete, false);

  await eu.syncSources();
  assert.equal((await admin.query('SELECT COUNT(*)::int AS n FROM mossvale_stats_countries')).rows[0].n, 0, 'Country tokens expire after 31 inactive days.');
  const countryAt = at;
  eu.observe([{ key: alice, country: 'CN' }, { key: bob, country: null }]); await eu.pulse();
  at += 11000; data = await eu.read();
  assert.equal(data.countries.total, 2);
  assert.equal(data.countries.known, 1); assert.equal(data.countries.unknown, 1);
  asia.observe([{ key: alice, country: 'SE' }]); await asia.pulse();
  at += 11000; data = await eu.read();
  assert.equal(data.countries.total, 2); assert.equal(data.countries.rows.find(row => row.country === 'SE')?.players, 1, 'Latest connection country replaces the previous country without double counting.');
  const countryTokens = (await admin.query('SELECT token FROM mossvale_stats_countries')).rows;
  assert(countryTokens.every(row => row.token !== alice && row.token !== bob && /^[a-f0-9]{64}$/.test(row.token)));
  at = countryAt + 86400000 + 1;
  data = await eu.read('24h'); assert.equal(data.countries.total, 1, 'Country activity expires at the exact trailing-window boundary.');
  assert.equal((await eu.read('7d')).countries.total, 2);
  assert.equal((await eu.read('all')).countries.window, '30d', 'All-time charts must not imply all-time country retention.');

  // Deletion uses the existing durable fence, including after failed collection.
  await playerDeletions({ query: (...args) => admin.query(...args) }).initialize();
  await admin.query("INSERT INTO mossvale_account_deletions(account_key,status,requested_at) VALUES($1,'pending',$2)", [bob, at]);
  await admin.query(`CREATE FUNCTION reject_country_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'controlled country cleanup failure'; END $$;
    CREATE TRIGGER reject_country_cleanup BEFORE DELETE ON mossvale_stats_countries FOR EACH ROW EXECUTE FUNCTION reject_country_cleanup()`);
  await assert.rejects(eu.pulse(), { code: 'P0001' });
  assert.equal((await admin.query('SELECT COUNT(*)::int AS n FROM mossvale_stats_countries')).rows[0].n, 2);
  await admin.query('DROP TRIGGER reject_country_cleanup ON mossvale_stats_countries');
  await asia.pulse();
  at += 11000;
  assert.equal((await eu.read('7d')).countries.total, 1, 'A different realm recovers pending-account country erasure after collector failure.');
  eu.observe([{ key: bob, country: 'US' }]); await eu.pulse();
  assert.equal((await admin.query('SELECT COUNT(*)::int AS n FROM mossvale_stats_countries')).rows[0].n, 1, 'Delayed observations cannot recreate pending-deletion country records.');
  await admin.query("INSERT INTO mossvale_account_deletions(account_key,status,requested_at,completed_at) VALUES($1,'complete',$2,$2)", [alice, at]);
  await eu.pulse();
  assert.equal((await eu.read('7d')).countries.total, 0, 'Completed account deletions erase country records.');
  await admin.query("UPDATE mossvale_account_deletions SET status='complete',completed_at=$1", [at - 40 * 86400000]);
  asia.observe([{ key: alice, country: 'CN' }, { key: bob, country: 'US' }]); await asia.pulse();
  assert.equal((await admin.query('SELECT COUNT(*)::int AS n FROM mossvale_stats_countries')).rows[0].n, 0, 'Even old permanent deletion fences reject replayed country observations.');
  assert.equal((await eu.read('all')).peaks.allTime, 2, 'Country erasure preserves historical aggregate activity.');

  // The existing provider issues only a server-side count request and validates its response.
  const calls = [];
  const provider = createAccountDeletionProvider({ keycloak: { url: 'https://identity.invalid', realm: 'mossvale' },
    env: { KEYCLOAK_DELETE_CLIENT_ID: 'service', KEYCLOAK_DELETE_CLIENT_SECRET: 'fixture' }, request: async (target, options) => {
      calls.push([target, options]); return new Response(JSON.stringify(target.endsWith('/token') ? { access_token: 'fixture-token', expires_in: 300 } : 123));
    } });
  assert.equal(await provider.countUsers(), 123); assert.equal(await provider.countUsers(), 123);
  assert.equal(calls.filter(([target]) => target.endsWith('/token')).length, 1);
  assert(calls.filter(([target]) => !target.endsWith('/token')).every(([target, options]) => target.endsWith('/users/count') && options.method === 'GET'));

  // Exercise finalized log decoding and reject out-of-range/removed data through the real chain helper.
  const authority = Wallet.createRandom(), buyer = Wallet.createRandom(), seller = Wallet.createRandom(), treasury = Wallet.createRandom().address;
  const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTokenAuction.json', import.meta.url), 'utf8'));
  const tokenCode = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
  const block = { hash: id('finalized'), number: '0x64', timestamp: '0x1234' };
  const event = abi.encodeEventLog(abi.getEvent('Purchased'), [id('listing'), id('order'), buyer.address, seller.address, 12n]);
  let log = { ...event, address: contract, transactionHash: id('transaction'), logIndex: '0x0', blockNumber: '0x64' };
  const chain = createAuctionChain({ currency: 'moss', contract, treasury, authorityKey: authority.privateKey, rpc: async (method, params) => {
    if (method === 'eth_chainId') return '0x1237';
    if (method === 'eth_getBlockByNumber') return block;
    if (method === 'eth_getCode') return params[0].toLowerCase() === MOSS_TOKEN.address.toLowerCase() ? tokenCode : artifact.deployedBytecode;
    if (method === 'eth_getLogs') { assert.deepEqual(params[0].topics, [abi.getEvent('Purchased').topicHash]); assert.equal(params[0].toBlock, '0x64'); return [log]; }
    if (method === 'eth_call') {
      const token = params[0].to.toLowerCase() === MOSS_TOKEN.address.toLowerCase(), iface = token ? erc20Interface : abi;
      const name = iface.parseTransaction({ data: params[0].data }).name;
      return iface.encodeFunctionResult(name, [({ name: 'Mossvale', symbol: 'MOSS', decimals: 18, authority: authority.address, paymentToken: MOSS_TOKEN.address, treasury, TAX_BPS: 500, devTeam: MOSS_AUCTION_DEV_TEAM })[name]]);
    }
    throw Error(method);
  } });
  assert.deepEqual((await chain.purchaseHistory(0)).purchases, [{ id: `${id('transaction')}:0`, amountWei: '12' }]);
  log = { ...log, removed: true }; await assert.rejects(chain.purchaseHistory(0), /Invalid auction purchase log/);
  log = { ...log, removed: false, blockNumber: '0x65' }; await assert.rejects(chain.purchaseHistory(0), /Invalid auction purchase log/);
  const previousCountrySecret = process.env.STATS_COUNTRY_SECRET, countrySecret = 'f'.repeat(64);
  process.env.STATS_COUNTRY_SECRET = countrySecret;
  game = createGameServer({ port: 0, host: '127.0.0.1', keycloak: null, databaseUrl: url.toString(), accountDeletionProvider: { enabled: false },
    auctionChain: { status: async () => ({ enabled: false }) }, mossAuctionChain: { status: async () => ({ enabled: false }) }, nftChain: { status: async () => ({ enabled: false }) } });
  if (previousCountrySecret === undefined) delete process.env.STATS_COUNTRY_SECRET; else process.env.STATS_COUNTRY_SECRET = previousCountrySecret;
  const port = await game.start(), endpoint = `http://127.0.0.1:${port}/api/stats`;
  const response = await fetch(endpoint, { headers: { Origin: 'https://stats.mossvale.world' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), '*');
  const exposed = await response.json();
  assert.equal(exposed.registered.total, 42); assert(!JSON.stringify(exposed).includes(alice));
  assert.equal((await fetch(endpoint + '?range=invalid')).status, 400);
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 405);
  assert.equal((await fetch(endpoint, { method: 'HEAD' })).status, 200);
  guest = new WebSocket(`ws://127.0.0.1:${port}/socket`, { headers: { 'X-Mossvale-Country': 'CN', 'X-Mossvale-Country-Token': countrySecret } });
  const messages = [];
  guest.on('message', raw => messages.push(JSON.parse(raw)));
  await new Promise((resolve, reject) => { guest.once('open', resolve); guest.once('error', reject); });
  async function receive(predicate) {
    for (let attempt = 0; attempt < 300; attempt++) { const found = messages.find(predicate); if (found) return found; await delay(20); }
    throw Error('Country world-entry fixture timed out.');
  }
  const sendGuest = value => guest.send(JSON.stringify(value));
  sendGuest({ type: 'join', token: 'c'.repeat(43) });
  const community = await receive(row => row.type === 'community');
  sendGuest({ type: 'acceptCommunityRules', version: community.version });
  await receive(row => row.type === 'community' && row.accepted);
  sendGuest({ type: 'createCharacter', name: 'Country fixture', appearance: DEFAULT_APPEARANCE });
  const roster = await receive(row => row.type === 'roster' && row.characters.length);
  sendGuest({ type: 'selectCharacter', characterId: roster.characters[0].id });
  const welcome = await receive(row => row.type === 'welcome');
  assert.equal(welcome.player.country, undefined, 'Country data never enters the public player snapshot.');
  for (let attempt = 0; ; attempt++) {
    const rows = (await admin.query("SELECT COUNT(*)::int AS n FROM mossvale_stats_countries WHERE country='CN'")).rows;
    if (rows[0].n === 1) break;
    assert(attempt < 300, 'Real world entry reaches country analytics.'); await delay(20);
  }
  guest.close(); guest = undefined;
  await game.stop(); game = undefined;
  console.log('Public stats passed: shared live counts, hourly unique accounts/rollover, gaps, retained aggregates, private token expiry, exact historical MOSS totals across contract migration and late old finality, rollback/replay, source outages, count provider and finalized logs.');
} finally {
  guest?.terminate();
  await game?.stop();
  await Promise.allSettled(collectors.map(stats => stats.stop()));
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {}); await admin.end(); }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe' });
}
