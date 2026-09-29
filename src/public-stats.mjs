import { createHmac, randomBytes } from 'node:crypto';
import pg from 'pg';
import { readGoldStats } from './gold-stats.mjs';
import { normalizeCountry } from './player-country.mjs';

export const STATS_REALMS = ['eu', 'us', 'asia'];
export const STATS_SAMPLE_MS = 30000;
const HOUR = 3600000, DAY = 24 * HOUR, FRESH_MS = 60000;
const iso = value => value === null || value === undefined ? null : new Date(Number(value)).toISOString();
const hourOf = at => Math.floor(at / HOUR) * HOUR;
const count = value => value === null || value === undefined ? null : Number(value);
const lock = '718932146070';

// Analytics uses its own reconnecting pool; an unavailable chart must never stop player saves.
export function createPublicStats({ connectionString, ssl, realmId, accounts = () => [], countUsers, auctionChain,
  auctionFromBlock = Number(process.env.MOSS_AUCTION_DEPLOYMENT_BLOCK || 0), now = Date.now, automatic = true } = {}) {
  if (!connectionString) return { start: async () => {}, stop: async () => {}, observe() {}, read: async () => { throw Error('Statistics require shared storage.'); } };
  if (!STATS_REALMS.includes(realmId) || !Number.isSafeInteger(auctionFromBlock) || auctionFromBlock < 0) throw Error('Invalid statistics configuration.');
  const pool = new pg.Pool({ connectionString, ssl, max: 3, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000,
    statement_timeout: 10000, query_timeout: 12000, idle_in_transaction_session_timeout: 30000 });
  pool.on('error', warn);
  // An abandoned analytics transaction must release its cross-realm lock even if its client stops responding.
  // Checked-out clients also emit idle-transaction disconnects; keep analytics failures outside gameplay.
  pool.on('connect', client => client.on('error', warn));
  const startedAt = now(), pending = new Map(), pendingCountries = new Map(), cached = new Map();
  const reading = new Map();
  let ready, salt, trackingSince, countryTrackingSince, pulseTask, syncTask, stopTask, timer, stopped = false, available = true, lastErrorAt = 0;
  function warn(error) {
    if (now() - lastErrorAt <= 60000) return;
    lastErrorAt = now();
    const code = typeof error?.code === 'string' && /^[A-Z0-9_]{5,32}$/.test(error.code) ? error.code : error?.message === 'Query read timeout' ? 'QUERY_TIMEOUT' : 'UNKNOWN';
    console.error(`Public statistics refresh unavailable (${code}); gameplay continues.`);
  }
  async function initialize() {
    if (ready) return ready;
    ready = (async () => {
      const db = await pool.connect();
      let failure;
      try {
        await db.query('BEGIN');
        await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [lock]);
        await db.query(`CREATE TABLE IF NOT EXISTS mossvale_stats_meta (name text PRIMARY KEY, value jsonb NOT NULL);
          CREATE TABLE IF NOT EXISTS mossvale_stats_realms (realm text PRIMARY KEY CHECK (realm IN ('eu','us','asia')), started_at bigint NOT NULL, sampled_at bigint NOT NULL, players integer NOT NULL CHECK (players >= 0), available boolean NOT NULL);
          CREATE TABLE IF NOT EXISTS mossvale_stats_samples (at bigint NOT NULL, realm text NOT NULL CHECK (realm IN ('eu','us','asia')), players integer NOT NULL CHECK (players >= 0), available boolean NOT NULL, PRIMARY KEY (at,realm));
          CREATE TABLE IF NOT EXISTS mossvale_stats_observations (at bigint PRIMARY KEY, players integer NOT NULL CHECK (players >= 0));
          CREATE TABLE IF NOT EXISTS mossvale_stats_activity (hour bigint NOT NULL, token text NOT NULL, PRIMARY KEY (hour,token));
          CREATE TABLE IF NOT EXISTS mossvale_stats_countries (token text PRIMARY KEY, country text, seen_at bigint NOT NULL);
          CREATE INDEX IF NOT EXISTS mossvale_stats_countries_seen ON mossvale_stats_countries (seen_at);
          CREATE TABLE IF NOT EXISTS mossvale_stats_hours (hour bigint PRIMARY KEY, active_players integer NOT NULL, peak_players integer, average_players real, samples integer NOT NULL);
          CREATE TABLE IF NOT EXISTS mossvale_stats_purchases (chain_id integer NOT NULL, contract text NOT NULL, event_id text NOT NULL, amount_wei numeric(78,0) NOT NULL CHECK (amount_wei > 0), PRIMARY KEY (chain_id,contract,event_id));`);
        await db.query("INSERT INTO mossvale_stats_meta VALUES ('tracking',$1::jsonb) ON CONFLICT DO NOTHING", [JSON.stringify({ since: now(), salt: randomBytes(32).toString('hex') })]);
        const value = (await db.query("SELECT value FROM mossvale_stats_meta WHERE name='tracking'")).rows[0].value;
        salt = value.salt; trackingSince = value.since;
        await db.query("INSERT INTO mossvale_stats_meta VALUES ('countryTracking',$1::jsonb) ON CONFLICT DO NOTHING", [JSON.stringify({ since: now() })]);
        countryTrackingSince = (await db.query("SELECT value FROM mossvale_stats_meta WHERE name='countryTracking'")).rows[0].value.since;
        await db.query('COMMIT');
      } catch (error) { failure = error; await db.query('ROLLBACK').catch(() => {}); throw error; }
      finally { db.release(failure); }
    })().catch(error => { ready = undefined; throw error; });
    return ready;
  }
  function collect(entries) {
    const at = now(), hour = hourOf(at), seen = pending.get(hour) || new Set();
    for (const entry of entries) {
      const key = typeof entry === 'string' ? entry : entry?.key;
      if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) continue;
      seen.add(key);
      pendingCountries.set(key, { country: normalizeCountry(entry?.country), at });
    }
    pending.set(hour, seen);
  }
  function observe(extra = []) {
    if (stopped) return;
    collect([...accounts(), ...extra]);
    if (automatic && salt) void pulse().catch(warn);
  }
  const countryToken = key => createHmac('sha256', salt).update(`country:${key}`).digest('hex');
  async function pulse() {
    if (pulseTask) return pulseTask;
    pulseTask = (async () => {
      await initialize();
      const at = now(), entries = available ? accounts() : [], hour = hourOf(at);
      const keys = [...new Set(entries.map(entry => typeof entry === 'string' ? entry : entry.key))];
      collect(entries);
      const countryCapture = new Map(pendingCountries);
      let countries = [...countryCapture].map(([key, value]) => ({ token: countryToken(key), country: value.country, at: value.at }));
      const activity = [...pending].flatMap(([h, values]) => [...values].map(key => ({ hour: h,
        token: createHmac('sha256', salt).update(`${h}:${key}`).digest('hex') })));
      const captured = new Map([...pending].map(([h, values]) => [h, new Set(values)]));
      const db = await pool.connect();
      let failure;
      try {
        await db.query('BEGIN');
        // Serialize the three tiny analytics writes so one realm cannot overwrite another's hourly unique total.
        await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [String(BigInt(lock) + 2n)]);
        // Reuse the durable deletion fence so outages and delayed realm observations
        // cannot retain or recreate country records. Analytics never blocks erasure.
        if ((await db.query("SELECT to_regclass('mossvale_account_deletions') AS name")).rows[0].name) {
          const deleted = new Set((await db.query(`SELECT account_key FROM mossvale_account_deletions
            WHERE status='pending' OR completed_at >= $1 OR account_key=ANY($2::text[])`, [at - 31 * DAY, [...countryCapture.keys()]]))
            .rows.map(row => countryToken(row.account_key)));
          if (deleted.size) {
            await db.query('DELETE FROM mossvale_stats_countries WHERE token=ANY($1::text[])', [[...deleted]]);
            countries = countries.filter(row => !deleted.has(row.token));
            cached.clear();
          }
        }
        const presence = await db.query(`INSERT INTO mossvale_stats_realms VALUES ($1,$2,$3,$4,$5) ON CONFLICT (realm) DO UPDATE
          SET started_at=EXCLUDED.started_at,sampled_at=EXCLUDED.sampled_at,players=EXCLUDED.players,available=EXCLUDED.available
          WHERE mossvale_stats_realms.started_at <= EXCLUDED.started_at RETURNING realm`, [realmId, startedAt, at, keys.length, available]);
        if (presence.rows.length) {
          await db.query(`INSERT INTO mossvale_stats_samples VALUES ($1,$2,$3,$4) ON CONFLICT (at,realm) DO UPDATE SET players=EXCLUDED.players,available=EXCLUDED.available`,
            [Math.floor(at / STATS_SAMPLE_MS) * STATS_SAMPLE_MS, realmId, keys.length, available]);
          // Preserve each complete global observation at its real timestamp: lower counts in the same slot cannot erase a peak.
          await db.query(`INSERT INTO mossvale_stats_observations SELECT $1,SUM(players)::integer FROM mossvale_stats_samples WHERE at=$2
            GROUP BY at HAVING COUNT(*)=3 AND bool_and(available) ON CONFLICT (at) DO UPDATE SET players=GREATEST(mossvale_stats_observations.players,EXCLUDED.players)`,
            [at, Math.floor(at / STATS_SAMPLE_MS) * STATS_SAMPLE_MS]);
          if (activity.length) await db.query(`INSERT INTO mossvale_stats_activity SELECT hour,token FROM jsonb_to_recordset($1::jsonb) AS a(hour bigint,token text) ON CONFLICT DO NOTHING`, [JSON.stringify(activity)]);
          if (countries.length) await db.query(`INSERT INTO mossvale_stats_countries SELECT token,country,at FROM jsonb_to_recordset($1::jsonb) AS a(token text,country text,at bigint)
            ON CONFLICT (token) DO UPDATE SET country=EXCLUDED.country,seen_at=EXCLUDED.seen_at WHERE mossvale_stats_countries.seen_at <= EXCLUDED.seen_at`, [JSON.stringify(countries)]);
          // Keep durable aggregate history; private hourly tokens and dense samples expire.
          await db.query(`WITH slots AS (SELECT at, SUM(players)::integer AS players FROM mossvale_stats_samples WHERE at >= $1 GROUP BY at HAVING COUNT(*)=3 AND bool_and(available)),
            hours AS (SELECT h AS hour FROM generate_series($1::bigint,$2::bigint,${HOUR}::bigint) h),
            peaks AS (SELECT at/${HOUR}*${HOUR} AS hour,MAX(players) AS players FROM mossvale_stats_observations WHERE at >= $1 GROUP BY 1),
            active AS (SELECT hour,COUNT(*)::integer AS players FROM mossvale_stats_activity WHERE hour >= $1 GROUP BY hour)
            INSERT INTO mossvale_stats_hours SELECT h.hour,COALESCE(a.players,0),p.players,AVG(s.players),COUNT(s.at)::integer FROM hours h
              LEFT JOIN active a ON a.hour=h.hour LEFT JOIN peaks p ON p.hour=h.hour LEFT JOIN slots s ON s.at >= h.hour AND s.at < h.hour+${HOUR} GROUP BY h.hour,a.players,p.players
            ON CONFLICT (hour) DO UPDATE SET active_players=EXCLUDED.active_players,peak_players=GREATEST(mossvale_stats_hours.peak_players,EXCLUDED.peak_players),average_players=EXCLUDED.average_players,samples=EXCLUDED.samples`,
            [Math.max(hourOf(trackingSince), hour - HOUR), hour]);
        }
        await db.query('COMMIT');
        for (const [key, value] of countryCapture) if (pendingCountries.get(key) === value) pendingCountries.delete(key);
        for (const [h, values] of captured) { const remaining = pending.get(h); for (const key of values) remaining?.delete(key); if (!remaining?.size) pending.delete(h); }
      } catch (error) { failure = error; await db.query('ROLLBACK').catch(() => {}); throw error; }
      finally { db.release(failure); }
    })().finally(() => { pulseTask = undefined; });
    return pulseTask;
  }
  async function syncSources() {
    if (syncTask) return syncTask;
    syncTask = (async () => {
      await initialize();
      const db = await pool.connect();
      let locked = false, failure;
      const put = (name, value) => db.query('INSERT INTO mossvale_stats_meta VALUES ($1,$2::jsonb) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value', [name, JSON.stringify(value)]);
      try {
        locked = (await db.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [String(BigInt(lock) + 1n)])).rows[0].locked;
        if (!locked) return;
        const metadata = Object.fromEntries((await db.query('SELECT name,value FROM mossvale_stats_meta')).rows.map(row => [row.name, row.value]));
        if (countUsers && (!metadata.registered?.checkedAt || now() - metadata.registered.checkedAt >= 300000)) {
          const previous = metadata.registered || {};
          try {
            const total = await countUsers?.();
            if (!Number.isSafeInteger(total) || total < 0) throw Error('Unavailable count.');
            await put('registered', { total, updatedAt: now(), checkedAt: now(), status: 'ok' });
          } catch { await put('registered', { ...previous, checkedAt: now(), status: previous.updatedAt ? 'stale' : 'unavailable' }); }
        }
        if (auctionChain && (!metadata.auction?.checkedAt || now() - metadata.auction.checkedAt >= (metadata.auction.status === 'indexing' ? 15000 : 60000))) {
          let previous = metadata.auction || {};
          try {
            const status = await auctionChain.status();
            if (!status.contract) throw Object.assign(Error('Auction is not configured on this realm.'), { unconfigured: true });
            const current = status.contract.toLowerCase();
            if (!status.enabled || !/^0x[\da-f]{40}$/.test(current)) throw Error('Auction unavailable.');
            if (previous.chainId !== undefined && previous.chainId !== status.chainId) previous = {};
            let cursors = { ...previous.contracts };
            // Reuse the pre-migration cursor; the old contract may still finalize a reserved purchase.
            if (previous.contract && !cursors[previous.contract]) cursors[previous.contract] = {
              nextBlock: previous.nextBlock, finalizedBlock: previous.finalizedBlock, fromBlock: previous.fromBlock };
            // Keep retrying known old deployments when an RPC outage hides them from the current status.
            if (status.previousContracts !== undefined && !Array.isArray(status.previousContracts)) throw Error('Auction unavailable.');
            const contracts = [...new Set([...Object.keys(cursors), ...(status.previousContracts || []), status.previousContract, current].filter(Boolean).map(value => value.toLowerCase()))], completed = new Set();
            if (contracts.some(value => !/^0x[\da-f]{40}$/.test(value))) throw Error('Auction unavailable.');
            for (const contract of contracts) for (let batch = 0; batch < 8; batch++) {
              if (stopped) break;
              const cursor = cursors[contract] || {};
              const history = await auctionChain.purchaseHistory(cursor.nextBlock ?? (contract === current ? auctionFromBlock || undefined : undefined), undefined, contract);
              if (history.contract !== contract || history.chainId !== status.chainId) throw Error('Auction deployment changed.');
              await db.query('BEGIN');
              if (history.purchases.length) await db.query(`INSERT INTO mossvale_stats_purchases SELECT $1,$2,id,"amountWei"::numeric FROM jsonb_to_recordset($3::jsonb) AS p(id text,"amountWei" text) ON CONFLICT DO NOTHING`,
                [history.chainId, history.contract, JSON.stringify(history.purchases)]);
              const totalWei = (await db.query('SELECT COALESCE(SUM(amount_wei),0)::text AS total FROM mossvale_stats_purchases WHERE chain_id=$1 AND contract=ANY($2::text[])', [history.chainId, contracts])).rows[0].total;
              const nextCursors = { ...cursors, [contract]: { nextBlock: history.nextBlock, finalizedBlock: history.finalizedBlock, fromBlock: cursor.fromBlock ?? history.fromBlock } };
              if (history.complete) completed.add(contract);
              const complete = completed.size === contracts.length;
              const next = { contract: current, chainId: history.chainId, ...nextCursors[current], contracts: nextCursors,
                totalWei, updatedAt: complete ? now() : previous.updatedAt, checkedAt: now(), status: complete ? 'ok' : 'indexing' };
              await put('auction', next);
              await db.query('COMMIT');
              previous = next; cursors = nextCursors;
              if (history.complete) break;
            }
          } catch (error) {
            await db.query('ROLLBACK');
            if (!error.unconfigured) await put('auction', { ...previous, checkedAt: now(), status: previous.updatedAt ? 'stale' : previous.nextBlock ? 'indexing' : 'unavailable' });
          }
        }
        if (!metadata.prunedAt || now() - metadata.prunedAt >= HOUR) {
          await db.query('DELETE FROM mossvale_stats_countries WHERE seen_at < $1', [now() - 31 * DAY]);
          await db.query('DELETE FROM mossvale_stats_activity WHERE hour < $1', [hourOf(now()) - 2 * HOUR]);
          await db.query('DELETE FROM mossvale_stats_samples WHERE at < $1', [hourOf(now()) - 31 * DAY]);
          await db.query('DELETE FROM mossvale_stats_observations WHERE at < $1', [hourOf(now()) - 31 * DAY]);
          await put('prunedAt', now());
        }
      } catch (error) { failure = error; throw error; }
      finally {
        try {
          if (locked && !failure) await db.query('SELECT pg_advisory_unlock($1::bigint)', [String(BigInt(lock) + 1n)]);
        } catch (error) { failure = error; throw error; }
        finally { db.release(failure); }
      }
    })().finally(() => { syncTask = undefined; });
    return syncTask;
  }
  async function load(range) {
    await initialize();
    const old = cached.get(range);
    if (old && now() - old.at < 10000) return old.value;
    const at = now(), start = Math.max(trackingSince, range === 'all' ? trackingSince : at - ({ '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY }[range]));
    const countryWindow = range === 'all' ? '30d' : range;
    const countryStart = Math.max(countryTrackingSince, at - ({ '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY }[countryWindow]));
    const [metadata, present, hourly, samples, peaks, countries] = await Promise.all([
      pool.query("SELECT name,value FROM mossvale_stats_meta WHERE name IN ('registered','auction')"),
      pool.query('SELECT * FROM mossvale_stats_realms'),
      pool.query(`SELECT h.hour,s.active_players,s.peak_players,s.average_players,s.samples FROM generate_series($1::bigint,$2::bigint,${HOUR}::bigint) h(hour)
        LEFT JOIN mossvale_stats_hours s ON s.hour=h.hour ORDER BY h.hour`, [hourOf(start), hourOf(at)]),
      range === '24h' ? pool.query(`WITH slots AS (SELECT at FROM mossvale_stats_samples WHERE at >= $1 GROUP BY at HAVING COUNT(*)=3 AND bool_and(available)),
        complete AS (SELECT at/${STATS_SAMPLE_MS * 2}*${STATS_SAMPLE_MS * 2} AS at FROM slots GROUP BY 1 HAVING COUNT(*)=2),
        minutes AS (SELECT c.at,MAX(o.players) AS players FROM complete c JOIN mossvale_stats_observations o ON o.at >= c.at AND o.at < c.at+${STATS_SAMPLE_MS * 2} GROUP BY c.at)
        SELECT h.at,s.players FROM generate_series($1::bigint,$2::bigint,${STATS_SAMPLE_MS * 2}::bigint) h(at) LEFT JOIN minutes s ON s.at=h.at ORDER BY h.at`,
        [Math.ceil(start / (STATS_SAMPLE_MS * 2)) * STATS_SAMPLE_MS * 2, Math.floor(at / (STATS_SAMPLE_MS * 2)) * STATS_SAMPLE_MS * 2]) : Promise.resolve({ rows: [] }),
      pool.query(`SELECT (SELECT MAX(peak_players) FROM mossvale_stats_hours) AS all_time,
        (SELECT MAX(players) FROM mossvale_stats_observations WHERE at >= $1 AND at <= $2) AS day`, [at - DAY, at]),
      pool.query('SELECT country,COUNT(*)::integer AS players FROM mossvale_stats_countries WHERE seen_at >= $1 AND seen_at <= $2 GROUP BY country ORDER BY players DESC,country', [countryStart, at]),
    ]);
    const economy = await readGoldStats(pool, at), completedAt = now();
    const meta = Object.fromEntries(metadata.rows.map(row => [row.name, row.value]));
    const realms = STATS_REALMS.map(id => {
      // A collector may commit while these reads are running; judge freshness when collection finishes.
      const row = present.rows.find(item => item.realm === id), fresh = !!row && completedAt - Number(row.sampled_at) <= FRESH_MS && completedAt >= Number(row.sampled_at);
      return { id, players: fresh && row.available ? row.players : null, lastSeenAt: iso(row?.sampled_at), available: fresh && row.available };
    });
    const hours = hourly.rows.map(row => ({ hour: iso(row.hour), activePlayers: row.active_players, peakPlayers: count(row.peak_players),
      averagePlayers: count(row.average_players), complete: row.samples === HOUR / STATS_SAMPLE_MS && Number(row.hour) + HOUR <= at }));
    const sourceStatus = (source, age) => source?.updatedAt && completedAt - source.updatedAt > age && source.status === 'ok' ? 'stale' : source?.status || 'unavailable';
    const observedPlayers = realms.reduce((sum, realm) => sum + (realm.players || 0), 0);
    const bucketHours = Math.max(1, Math.ceil(hours.length / 1440)), concurrent = [];
    if (range === '24h') concurrent.push(...samples.rows.map(row => ({ at: iso(row.at), players: count(row.players), complete: row.players !== null })));
    else for (let index = 0; index < hours.length; index += bucketHours) {
      const bucket = hourly.rows.slice(index, index + bucketHours), samples = bucket.reduce((sum, row) => sum + (row.samples ?? 0), 0);
      // Keep measured averages through partial hours; wider buckets weight each valid 30-second sample equally.
      concurrent.push({ at: iso(bucket[0].hour), players: samples ? bucket.reduce((sum, row) => sum + (row.average_players ?? 0) * (row.samples ?? 0), 0) / samples : null,
        complete: hours.slice(index, index + bucketHours).every(row => row.complete) });
    }
    const value = { generatedAt: iso(completedAt), trackingSince: iso(trackingSince), range, sampleIntervalSeconds: STATS_SAMPLE_MS / 1000, concurrentIntervalSeconds: range === '24h' ? 60 : bucketHours * 3600,
      live: { players: realms.every(realm => realm.available) ? observedPlayers : null, observedPlayers, realms },
      registered: { total: meta.registered?.total ?? null, updatedAt: iso(meta.registered?.updatedAt), status: sourceStatus(meta.registered, 10 * 60000), source: 'keycloak' },
      auction: { totalWei: meta.auction?.updatedAt ? meta.auction.totalWei : null, decimals: 18, updatedAt: iso(meta.auction?.updatedAt), status: sourceStatus(meta.auction, 3 * 60000),
        contract: meta.auction?.contract || null, chainId: meta.auction?.chainId || null, finalizedBlock: meta.auction?.finalizedBlock ?? null },
      peaks: { day: count(peaks.rows[0].day), allTime: count(peaks.rows[0].all_time) }, hourly: hours, concurrent };
    const countryRows = countries.rows.map(row => ({ country: row.country, players: row.players }));
    if (!countryRows.some(row => row.country === null)) countryRows.push({ country: null, players: 0 });
    const total = countryRows.reduce((sum, row) => sum + row.players, 0), unknown = countryRows.find(row => row.country === null).players;
    value.countries = { window: countryWindow, trackingSince: iso(countryTrackingSince), since: iso(countryStart), until: iso(at),
      total, known: total - unknown, unknown, rows: countryRows };
    value.economy = economy;
    cached.set(range, { at: completedAt, value });
    return value;
  }
  async function read(range = '24h') {
    if (!['24h', '7d', '30d', 'all'].includes(range)) throw Object.assign(Error('Invalid statistics range.'), { status: 400 });
    if (!reading.has(range)) reading.set(range, load(range).finally(() => reading.delete(range)));
    return reading.get(range);
  }
  return { observe, pulse, syncSources, read,
    async start() {
      await pulse().catch(warn);
      if (automatic) {
        void syncSources().catch(warn);
        timer = setInterval(() => { void pulse().catch(warn); void syncSources().catch(warn); }, 15000);
        timer.unref();
      }
    },
    stop() {
      return stopTask ??= (async () => {
        clearInterval(timer); observe(); stopped = true; available = false;
        await pulseTask?.catch(() => {});
        await pulse().catch(warn);
        await syncTask?.catch(() => {});
        await pool.end();
      })();
    },
  };
}
