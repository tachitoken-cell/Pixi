import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { referralWallets } from './referrals.ts';
import { mergeReferral, applyReferralCommit } from './referral-store.mjs';
import { playerDeletions } from './player-deletions.mjs';
import { initializePollStore, postgresPollStore } from './poll-store.mjs';
import { goldRoundStore } from './gold-round-store.mjs';
import { treasureNextRedemptionAt } from './treasure-rewards.ts';
import { goldSupply } from './gold-ledger.mjs';
import { reportDecisionEvidence } from './community.ts';
import { initializeDungeonRecords, postgresDungeonRecords } from './dungeon-records.mjs';
import { ECONOMY_VERSION, initializeEconomy, readEconomy, insertGoldEvents, validateGoldEvents, GOLD_EVENTS_INSERT } from './gold-migration.mjs';

export const SHARED_PLAYER_FIELDS = Object.freeze(['auctions', 'auctionSales', 'friendIds', 'friendRequestIds', 'ignoreIds', 'arenaWagers']);
const lockId = key => createHash('sha256').update(`mossvale-account:${key}`).digest().readBigInt64BE().toString();
const copy = value => structuredClone(value);
const conflict = message => Object.assign(new Error(message), { code: 'PLAYER_STORE_CONFLICT' });
const integer = value => Number.isSafeInteger(value) && value >= 0;
const characters = state => new Map(state.characters.map(player => [player.id, player]));
// Other realms never use a cached character's pose or health. Persist them in
// full, but do not make every movement or combat autosave invalidate those caches.
const notificationState = state => Array.isArray(state?.characters)
  ? { ...state, characters: state.characters.map(({ x, z, rotation, hp, ...player }) => player) } : state;
const progressOnly = player => Object.fromEntries(Object.entries(player).filter(([field]) => !SHARED_PLAYER_FIELDS.includes(field) && field !== 'gold'));
const treasureAuthorization = ({ status, transactionHash, paymentBlock, paidAt, settledClaimHash, ...authorization }) => authorization;
const treasureIdentity = ({ amount, amountWei, price, createdAt, contractClaim, signature, claimHash, transaction, previousQuotes, ...identity }) => treasureAuthorization(identity);
const unsubmittedTreasure = claim => claim.status === 'pending'
  && ['transactionHash', 'paymentBlock', 'paidAt', 'settledClaimHash'].every(field => claim[field] === undefined);
function treasureReplacement(previous, claim) {
  const { previousQuotes, status, transactionHash, paymentBlock, paidAt, settledClaimHash, ...authorization } = previous;
  const snapshot = { ...authorization, status: 'pending' };
  return !previous.goldRoundId && !claim.goldRoundId && unsubmittedTreasure(previous) && unsubmittedTreasure(claim)
    && Number.isInteger(previous.usdCents) && previous.usdCents >= 500 && previous.usdCents <= 3000
    && isDeepStrictEqual(treasureIdentity(previous), treasureIdentity(claim))
    && isDeepStrictEqual(claim.previousQuotes, [...(previousQuotes || []), snapshot]);
}

// One permanent connection owns every account lock and performs every write.
// Replacing this Client with a reconnecting pool would allow stale owners to save.
export function createPlayerStore({ connectionString, ssl, onFatal = () => {}, onChange = () => {}, validate = () => {}, migrate = state => state, referralsEnabled = false }) {
  const client = new pg.Client({ connectionString, ssl, connectionTimeoutMillis: 10000, keepAlive: true, keepAliveInitialDelayMillis: 10000 });
  const owned = new Set();
  let queue = Promise.resolve(), started = false, closing = false, fatalError, ending;
  let economy = { version: 0, exchangeEnabled: false, maintenance: false, targetRevision: null }, economyEpoch;

  function fatal(error) {
    if (fatalError || closing) return;
    fatalError = Object.assign(new Error('Player database connection lost; this server must restart.', { cause: error }), { code: 'PLAYER_STORE_UNAVAILABLE' });
    owned.clear();
    ending = client.end().catch(() => {});
    try { Promise.resolve(onFatal(fatalError)).catch(() => {}); } catch { /* The store stays closed even if its caller fails. */ }
  }
  client.on('error', fatal);
  client.on('end', () => { if (!closing) fatal(new Error('Player database connection ended.')); });
  client.on('notification', notification => {
    if (!closing && !fatalError && notification.channel === 'mossvale_economy_changed') {
      void enqueue(refreshEconomy).catch(fatal); return;
    }
    if (closing || fatalError || notification.processId === client.processID || notification.channel !== 'mossvale_players_changed'
        || !/^[a-f0-9]{64}$/.test(notification.payload || '')) return;
    try { Promise.resolve(onChange(notification.payload)).catch(fatal); } catch (error) { fatal(error); }
  });

  function enqueue(operation) {
    if (closing) return Promise.reject(new Error('Player store is closed.'));
    const result = queue.then(() => {
      if (fatalError) throw fatalError;
      return operation();
    });
    queue = result.catch(() => {});
    return result;
  }
  async function query(text, values) {
    if (fatalError) throw fatalError;
    try { return await client.query(text, values); }
    catch (error) {
      // SQL constraint/serialization errors have definite server replies. A
      // transport error or server shutdown may have lost a successful reply.
      if (!/^[0-9A-Z]{5}$/.test(error.code || '') || /^(08|57P0)/.test(error.code)) fatal(error);
      throw fatalError || error;
    }
  }
  function requireStarted() { if (!started) throw new Error('Player store has not started.'); }
  async function refreshEconomy() {
    const next = await readEconomy(query);
    if (economyEpoch !== undefined && next.version !== economyEpoch) {
      const error = new Error('Economy writer epoch changed; this realm must restart.'); fatal(error); throw error;
    }
    economy = next; return { ...economy };
  }
  const normalize = row => ({ ...row, hasReferral: Object.hasOwn(row.state, 'referral'), state: migrate(row.state, row.account_key) });
  async function nextTreasureRedemptionAt(key) {
    const { rows } = await query('SELECT MAX(redeemed_at) AS at FROM mossvale_treasure_claims WHERE account_key=$1', [key]);
    return treasureNextRedemptionAt({ characters: [], lastTreasureClaimAt: Number(rows[0].at) });
  }
  async function backfillTreasureClaims(keys = null) {
    await query(`UPDATE mossvale_treasure_claims saved SET account_key=existing.account_key, redeemed_at=existing.redeemed_at
      FROM (SELECT p.account_key, COALESCE(claim->'previousQuotes'->0->>'claimHash',claim->>'claimHash') AS claim_hash,
        (SELECT MIN((quote->>'createdAt')::bigint) FROM jsonb_array_elements(COALESCE(claim->'previousQuotes','[]'::jsonb)||jsonb_build_array(claim)) quote) AS redeemed_at
        FROM mossvale_players p, jsonb_array_elements(p.state->'characters') hero,
          jsonb_array_elements(COALESCE(hero->'treasureClaims','[]'::jsonb)) claim
        WHERE ($1::text[] IS NULL OR p.account_key=ANY($1)) AND NOT claim ? 'goldRoundId') existing
      WHERE saved.claim_hash=existing.claim_hash AND saved.account_key IS NULL`, [keys]);
  }
  async function transaction(operation, begin = 'BEGIN', finish) {
    let committing = false;
    try {
      const opened = await query(begin);
      const result = await operation(opened);
      committing = true;
      await query(finish ? finish() : 'COMMIT');
      return result;
    } catch (error) {
      // A PostgreSQL error aborts the remaining UPDATE; COMMIT batch; its
      // transaction can roll back. Transport uncertainty is already fatal in query().
      if (committing && !finish) fatal(error);
      if (!fatalError) {
        try { await query('ROLLBACK'); } catch (rollbackError) { fatal(rollbackError); }
      }
      throw fatalError || error;
    }
  }

  function project(entry, current, pending, hasReferral) {
    const { key, state, expected } = entry;
    const isOwner = owned.has(key);
    if (!state || !Array.isArray(state.characters) || new Set(state.characters.map(p => p.id)).size !== state.characters.length)
      throw conflict('Invalid projected character roster.');
    if (!isOwner && !expected) throw conflict('An unowned account requires an explicit action baseline.');
    const currentPlayers = characters(current), nextPlayers = characters(state), baselinePlayers = expected && characters(expected);
    if (expected) {
      for (const [id, before] of baselinePlayers) {
        const saved = currentPlayers.get(id);
        if (!saved || SHARED_PLAYER_FIELDS.some(field => !isDeepStrictEqual(saved[field], before[field])))
          throw conflict('Shared character state changed; refresh and retry the action.');
      }
      if (!isDeepStrictEqual(current.ban, expected.ban)) throw conflict('Account moderation changed; refresh and retry the action.');
    }
    if (!isOwner) {
      const withoutPlayers = account => Object.fromEntries(Object.entries(account).filter(([field]) => field !== 'characters'));
      if (!isDeepStrictEqual(withoutPlayers(state), withoutPlayers(expected)) || nextPlayers.size !== baselinePlayers.size
          || [...nextPlayers].some(([id, player]) => !baselinePlayers.has(id) || !isDeepStrictEqual(progressOnly(player), progressOnly(baselinePlayers.get(id)))))
        throw conflict('Only the owning server may change character progress.');
    }
    if (!pending || typeof pending !== 'object' || Array.isArray(pending)
        || Object.entries(pending).some(([id, amount]) => !currentPlayers.has(id) || !integer(amount)))
      throw new Error('Invalid pending player credits.');

    const projected = copy(isOwner ? state : current);
    // Cross-realm moderation survives an owning realm's stale autosave.
    if (!expected || isDeepStrictEqual(state.ban, expected.ban)) { if (current.ban) projected.ban = copy(current.ban); else delete projected.ban; }
    if (current.gmProtected) projected.gmProtected = true;
    const projectedPlayers = characters(projected), credits = {}, remaining = copy(pending);
    if (isOwner) {
      for (const [id, saved] of currentPlayers) if (!nextPlayers.has(id)) {
        if (pending[id]) throw conflict('Collect pending auction proceeds before deleting this character.');
        if (saved.arenaWagers?.length) throw conflict('Settle or refund arena MOSS wagers before deleting this character.');
        if (saved.auctions?.length) throw conflict('Resolve active auctions before deleting this character.');
        if (saved.treasureClaims?.some(claim => claim.status !== 'paid')) throw conflict('Resolve treasury payouts before deleting this character.');
      }
    }
    for (const [id, candidate] of nextPlayers) {
      const saved = currentPlayers.get(id), target = projectedPlayers.get(id), before = baselinePlayers?.get(id);
      if (!saved) {
        if (!isOwner || before) throw conflict('Character ownership changed; refresh and retry the action.');
        continue;
      }
      const previousGrants = saved.storeGrants || [], nextGrants = candidate.storeGrants || [];
      if (!isDeepStrictEqual(previousGrants, nextGrants.slice(0, previousGrants.length)))
        throw conflict('Complimentary grant history cannot be changed or removed.');
      for (const field of SHARED_PLAYER_FIELDS) {
        // Autosaves never write cached shared fields. Explicit actions have
        // already compared every shared precondition while holding row locks.
        if (before && !isDeepStrictEqual(candidate[field], before[field])) target[field] = copy(candidate[field]);
        else if (Object.hasOwn(saved, field)) target[field] = copy(saved[field]);
        else delete target[field];
      }
      if (isOwner) {
        const amount = pending[id] || 0;
        if (!integer(target.gold)) throw conflict('Character gold limit reached.');
        // Live rewards may have filled the wallet since a remote sale checked
        // its durable balance. Keep proceeds pending without blocking saves.
        if (integer(target.gold + amount)) {
          target.gold += amount;
          if (amount) credits[id] = amount;
          delete remaining[id];
        }
      } else {
        const amount = candidate.gold - before.gold;
        if (!integer(candidate.gold) || !integer(before.gold) || !integer(amount)) throw conflict('An unowned character can only receive positive gold credits.');
        const total = (remaining[id] || 0) + amount;
        if (!integer(total) || !integer(saved.gold + total)) throw conflict('Character gold limit reached.');
        if (total) remaining[id] = total;
      }
    }
    if (referralsEnabled) mergeReferral(projected, current, key);
    else if (current.referral) projected.referral = copy(current.referral);
    else delete projected.referral;
    validate(projected, key);
    return { account_key: key, state: projected, credits, pending: remaining, hasReferral };
  }

  async function archiveIntent(accountKey, characterId, order, update = true) {
    const result = await query(`INSERT INTO mossvale_mobile_intents (intent_id, account_key, character_id, order_data) VALUES ($1,$2,$3,$4::jsonb)
      ON CONFLICT (intent_id) DO ${update ? 'UPDATE SET order_data=EXCLUDED.order_data WHERE mossvale_mobile_intents.account_key=EXCLUDED.account_key AND mossvale_mobile_intents.character_id=EXCLUDED.character_id' : 'NOTHING'} RETURNING intent_id`,
      [order.id, accountKey, characterId, JSON.stringify(order)]);
    if (update && !result.rows.length) throw conflict('Mobile checkout identity already belongs to another character.');
  }
  const unpaid = order => ['pending', 'abandoned'].includes(order.status);
  const withoutActivation = ({ activation, ...order }) => order;
  async function putReceipt(receipt, status) {
    await query('SELECT pg_advisory_xact_lock($1::bigint)', [lockId('mobile:' + receipt.platform + ':' + receipt.paymentId)]);
    const revoked = (await query("SELECT data FROM mossvale_mobile_events WHERE platform=$1 AND payment_id=$2 AND kind='refund' ORDER BY at DESC LIMIT 1", [receipt.platform, receipt.paymentId])).rows[0]?.data;
    if (status !== 'refunded' && revoked) throw Object.assign(conflict('This purchase was refunded or revoked.'), { code: 'PURCHASE_REFUNDED' });
    if (status === 'refunded') {
      const proof = (await query("SELECT data FROM mossvale_mobile_events WHERE event_id=$1 AND platform=$2 AND payment_id=$3 AND kind='refund'", [receipt.eventId, receipt.platform, receipt.paymentId])).rows[0]?.data;
      if (!proof || proof.intentId && proof.intentId !== receipt.intentId || proof.productId && proof.productId !== receipt.productId) throw conflict('A refund requires its verified durable event.');
    }
    const values = [receipt.platform, receipt.paymentId, receipt.accountKey, receipt.characterId, receipt.intentId, receipt.productId, receipt.purchasedAt, receipt.sandbox, status];
    const inserted = await query('INSERT INTO mossvale_mobile_receipts (platform, payment_id, account_key, character_id, intent_id, product_id, purchased_at, sandbox, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING payment_id', values);
    if (!inserted.rows.length) {
      const saved = (await query('SELECT * FROM mossvale_mobile_receipts WHERE platform=$1 AND payment_id=$2 FOR UPDATE', values.slice(0, 2))).rows[0];
      if (!saved || saved.account_key !== receipt.accountKey || saved.character_id !== receipt.characterId || saved.intent_id !== receipt.intentId
          || saved.product_id !== receipt.productId || Number(saved.purchased_at) !== receipt.purchasedAt || saved.sandbox !== receipt.sandbox
          || saved.status === 'refunded' && status !== 'refunded' || saved.status === 'delivered' && status === 'payment-confirmed')
        throw conflict('This mobile payment has already been recorded for another delivery.');
      await query('UPDATE mossvale_mobile_receipts SET status=$3 WHERE platform=$1 AND payment_id=$2', [receipt.platform, receipt.paymentId, status]);
    }
  }
  async function commitMobileReceipt(existing, projected, receipt) {
    let matched = false;
    for (const row of projected) {
      const beforePlayers = characters(existing.get(row.account_key).state);
      // Also archive histories of whole characters removed by a normal delete.
      for (const player of beforePlayers.values()) if (!row.state.characters.some(next => next.id === player.id)) for (const order of player.mobileStoreOrders || []) await archiveIntent(row.account_key, player.id, order, false);
      for (const player of row.state.characters) {
        const before = new Map((beforePlayers.get(player.id)?.mobileStoreOrders || []).map(order => [order.id, order]));
        const afterIds = new Set((player.mobileStoreOrders || []).map(order => order.id));
        for (const order of player.mobileStoreOrders || []) {
          const old = before.get(order.id);
          const selected = receipt && row.account_key === receipt.accountKey && player.id === receipt.characterId && order.id === receipt.intentId;
          if (old && ['characterId', 'productId', 'sku', 'platform', 'createdAt', 'expiresAt'].some(key => old[key] !== order[key])) throw conflict('Mobile checkout binding changed.');
          if (old && !unpaid(old) && !isDeepStrictEqual(old, order)) {
            const activation = old.status === 'delivered' && isDeepStrictEqual(withoutActivation(old), withoutActivation(order))
              && (!old.activation && order.activation || receipt?.action === 'refund' && row.account_key === receipt.accountKey && player.id === receipt.characterId);
            const transition = selected && (receipt.action === 'refund' && order.status === 'refunded'
              || old.status === 'payment-confirmed' && order.status === 'delivered');
            if (!activation && !transition) throw conflict('Recorded mobile payments are immutable.');
          }
          if ((!old || unpaid(old)) && !unpaid(order) && !selected) throw conflict('Mobile rewards require verified receipt persistence.');
          if (selected) {
            if (matched || !owned.has(row.account_key) || !old || unpaid(order)
                || ['platform', 'paymentId', 'purchasedAt', 'sandbox'].some(key => order[key] !== receipt[key]) || order.sku !== receipt.productId) throw conflict('Invalid mobile receipt binding.');
            matched = true;
            await putReceipt(receipt, order.status);
          }
          if (!old || !isDeepStrictEqual(old, order)) await archiveIntent(row.account_key, player.id, order);
        }
        for (const id of before.keys()) if (!afterIds.has(id)) throw conflict('Mobile purchase history cannot be removed.');
      }
    }
    if (receipt && !matched) throw conflict('Mobile receipt has no participating character.');
  }
  async function addMobileEvent(event) {
    if (!event || !['apple', 'google'].includes(event.platform) || !['payment', 'refund', 'review', 'ignored'].includes(event.kind)
        || typeof event.eventId !== 'string' || event.eventId.length > 200 || !Number.isSafeInteger(event.at) || event.at <= 0 || event.at > Date.now() + 300000
        || event.paymentId !== undefined && !(event.platform === 'apple' ? /^\d{1,40}$/ : /^[\da-f]{64}$/).test(event.paymentId)
        || event.intentId !== undefined && !/^[\da-f-]{36}$/.test(event.intentId)) throw Error('Invalid verified mobile event.');
    if (event.paymentId) await query('SELECT pg_advisory_xact_lock($1::bigint)', [lockId('mobile:' + event.platform + ':' + event.paymentId)]);
    // Fixed fields only: raw purchase tokens, JWTs and provider payloads are never retained.
    const keys = ['eventId', 'platform', 'kind', 'at', 'paymentId', 'intentId', 'productId', 'purchasedAt', 'sandbox'];
    const data = Object.fromEntries(keys.filter(key => event[key] !== undefined).map(key => [key, event[key]]));
    await query('INSERT INTO mossvale_mobile_events (event_id, platform, payment_id, intent_id, kind, at, data) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING',
      [data.eventId, data.platform, data.paymentId || null, data.intentId || null, data.kind, data.at, JSON.stringify(data)]);
  }

  const goldRounds = goldRoundStore({ query, enqueue, transaction, lockId, owned });
  const deletions = playerDeletions({ query, enqueue, transaction, lockId, owned, goldRounds,
    validate: (state, key) => validate(migrate(copy(state), key), key),
    migrate: (state, key) => {
      const hadReferral = Object.hasOwn(state, 'referral'), normalized = migrate(state, key);
      if (!referralsEnabled && !hadReferral) delete normalized.referral;
      return normalized;
    } });
  return {
    ...deletions,
    ...postgresPollStore({ query, enqueue, transaction, requireStarted, owned, deletions }),
    goldRounds: goldRounds.goldRounds,
    openGoldRound: goldRounds.openGoldRound,
    settleGoldRounds: goldRounds.settleGoldRounds,
    dungeonRecords: postgresDungeonRecords({ query, enqueue, requireStarted }),
    economyState: () => ({ ...economy }),
    refreshEconomyState: () => enqueue(refreshEconomy),
    owns: key => !fatalError && !closing && owned.has(key),
    start: () => enqueue(async () => {
      if (started) return (await query('SELECT account_key, state FROM mossvale_players')).rows.map(normalize);
      try { await client.connect(); } catch (error) { fatal(error); throw fatalError; }
      // Serialize the first migration when both realms start on an empty DB.
      await query('SELECT pg_advisory_lock($1::bigint)', [lockId('schema')]);
      try {
        await query('CREATE TABLE IF NOT EXISTS mossvale_treasure_claims (claim_hash text PRIMARY KEY, contract text NOT NULL, amount_wei numeric(78,0) NOT NULL CHECK (amount_wei > 0))');
        await goldRounds.initialize();
        await query("CREATE TABLE IF NOT EXISTS mossvale_players (account_key text PRIMARY KEY, state jsonb NOT NULL, pending_credits jsonb NOT NULL DEFAULT '{}'::jsonb)");
        await query('ALTER TABLE mossvale_treasure_claims ADD COLUMN IF NOT EXISTS account_key text, ADD COLUMN IF NOT EXISTS redeemed_at bigint');
        await query('CREATE INDEX IF NOT EXISTS mossvale_treasure_claims_account ON mossvale_treasure_claims(account_key,redeemed_at)');
        await backfillTreasureClaims();
        await query('CREATE TABLE IF NOT EXISTS mossvale_referral_wallets (wallet text PRIMARY KEY, account_key text NOT NULL)');
        await initializePollStore(query);
        await initializeDungeonRecords(query);
        await query(`CREATE TABLE IF NOT EXISTS mossvale_mobile_receipts (
          platform text NOT NULL CHECK (platform IN ('apple','google')), payment_id text NOT NULL,
          account_key text NOT NULL, character_id text NOT NULL, intent_id uuid NOT NULL UNIQUE,
          product_id text NOT NULL, purchased_at bigint NOT NULL, sandbox boolean NOT NULL,
          status text NOT NULL CHECK (status IN ('delivered','payment-confirmed','refunded')), created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (platform, payment_id))`);
        await query('ALTER TABLE mossvale_mobile_receipts DROP CONSTRAINT IF EXISTS mossvale_mobile_receipts_status_check');
        await query("ALTER TABLE mossvale_mobile_receipts ADD CONSTRAINT mossvale_mobile_receipts_status_check CHECK (status IN ('delivered','payment-confirmed','refunded'))");
        await query('CREATE TABLE IF NOT EXISTS mossvale_mobile_intents (intent_id uuid PRIMARY KEY, account_key text NOT NULL, character_id text NOT NULL, order_data jsonb NOT NULL)');
        await query(`CREATE TABLE IF NOT EXISTS mossvale_mobile_events (event_id text PRIMARY KEY, platform text NOT NULL, payment_id text, intent_id uuid,
          kind text NOT NULL, at bigint NOT NULL, data jsonb NOT NULL, applied_at bigint, outcome text)`);
        await query('CREATE INDEX IF NOT EXISTS mossvale_mobile_events_payment ON mossvale_mobile_events(platform,payment_id)');
        await query('CREATE INDEX IF NOT EXISTS mossvale_mobile_events_pending ON mossvale_mobile_events(at) WHERE applied_at IS NULL');
        await query('CREATE TABLE IF NOT EXISTS mossvale_mobile_sync (name text PRIMARY KEY, state jsonb NOT NULL)');
        await query(`INSERT INTO mossvale_mobile_intents (intent_id,account_key,character_id,order_data)
          SELECT (item->>'id')::uuid,p.account_key,hero->>'id',item FROM mossvale_players p,
          jsonb_array_elements(p.state->'characters') hero, jsonb_array_elements(COALESCE(hero->'mobileStoreOrders','[]'::jsonb)) item ON CONFLICT DO NOTHING`);
        await query("ALTER TABLE mossvale_players ADD COLUMN IF NOT EXISTS pending_credits jsonb NOT NULL DEFAULT '{}'::jsonb");
        await initializeEconomy(query);
        economy = await readEconomy(query);
        if (economy.maintenance) throw new Error('Economy maintenance is in progress; do not start another writer.');
        economyEpoch = economy.version;
        await query("SELECT set_config('mossvale.economy_supported',$1,false),set_config('mossvale.economy_epoch',$2,false)", [String(ECONOMY_VERSION), String(economyEpoch)]);
        await query("CREATE TABLE IF NOT EXISTS mossvale_reports (id uuid PRIMARY KEY, reporter_account text NOT NULL, created_at bigint NOT NULL, report jsonb NOT NULL)");
        await query("CREATE INDEX IF NOT EXISTS mossvale_reports_reporter_time ON mossvale_reports (reporter_account, created_at)");
        await deletions.initialize();
      } finally { if (!fatalError) await query('SELECT pg_advisory_unlock($1::bigint)', [lockId('schema')]); }
      // Subscribe before taking the initial snapshot so no cross-realm commit
      // can fall between loading the cache and starting invalidation delivery.
      await query('LISTEN mossvale_players_changed');
      await query('LISTEN mossvale_economy_changed');
      started = true;
      return (await query('SELECT account_key, state FROM mossvale_players')).rows.map(normalize);
    }),
    read: (keys, refreshFences = false) => {
      const snapshot = keys === undefined ? undefined : copy(keys);
      return enqueue(async () => {
        requireStarted();
        if (snapshot !== undefined && (!Array.isArray(snapshot) || snapshot.some(key => typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)))) throw new Error('Invalid player read keys.');
        if (snapshot?.length === 0) return [];
        if (refreshFences) {
          const where = snapshot === undefined ? '' : ` WHERE account_key=ANY(ARRAY[${snapshot.map(key => pg.escapeLiteral(key)).join(',')}]::text[])`;
          const [fences, players] = await query(`SELECT account_key FROM mossvale_account_deletions${where}; SELECT account_key, state FROM mossvale_players${where}`);
          deletions.rememberDeletionFences(fences.rows);
          return players.rows.map(normalize);
        }
        if (snapshot === undefined) return (await query('SELECT account_key, state FROM mossvale_players')).rows.map(normalize);
        return (await query('SELECT account_key, state FROM mossvale_players WHERE account_key = ANY($1::text[])', [snapshot])).rows.map(normalize);
      });
    },
    treasureNextRedemptionAt: key => enqueue(() => {
      requireStarted();
      if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid player account key.');
      return nextTreasureRedemptionAt(key);
    }),
    claim: (key, onClaim, { existingOnly = false } = {}) => enqueue(async () => {
      requireStarted();
      if ((await refreshEconomy()).maintenance) throw conflict('Economy maintenance is in progress. Reconnect after the update.');
      if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid player account key.');
      let acquired = false;
      if (!owned.has(key)) {
        const { rows } = await query('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [lockId(key)]);
        if (!rows[0].acquired) return null;
        owned.add(key);
        acquired = true;
      }
      try {
        // Read the fence with state on the lock-owning connection; a fenced
        // account must never be recreated by the missing-account insert.
        const { rows } = await query(`WITH deletion AS (SELECT EXISTS (SELECT 1 FROM mossvale_account_deletions WHERE account_key=$1) AS blocked),
          inserted AS (INSERT INTO mossvale_players (account_key, state) SELECT $1, '{"characters":[]}'::jsonb WHERE NOT $2::boolean AND NOT (SELECT blocked FROM deletion) ON CONFLICT DO NOTHING RETURNING state),
          claimed AS (SELECT state FROM inserted UNION ALL SELECT state FROM mossvale_players WHERE account_key=$1 AND NOT EXISTS (SELECT 1 FROM inserted))
          SELECT (SELECT state FROM claimed) AS state, (SELECT blocked FROM deletion) AS deleting,
            (SELECT MAX((report->>'blockedUntil')::bigint) FROM mossvale_reports WHERE reporter_account=$1 AND report->>'source'='guard') AS guard_blocked_until`, [key, existingOnly]);
        await deletions.guardClaim(key, rows[0].deleting);
        if (rows[0].state === null) {
          if (acquired) { await query('SELECT pg_advisory_unlock($1::bigint)', [lockId(key)]); owned.delete(key); }
          return null;
        }
        const state = migrate(rows[0].state, key);
        // Join-only metadata shares the fresh claim read; it never enters player state.
        onClaim?.({ guardBlockedUntil: Number(rows[0].guard_blocked_until || 0) });
        return state;
      } catch (error) {
        if (!fatalError && acquired) { await query('SELECT pg_advisory_unlock($1::bigint)', [lockId(key)]); owned.delete(key); }
        throw error;
      }
    }),
    release: key => enqueue(async () => {
      requireStarted();
      if (!owned.has(key)) return;
      await query('SELECT pg_advisory_unlock($1::bigint)', [lockId(key)]);
      owned.delete(key);
    }),
    commit: (entries, validateTransaction, mobileReceipt, treasureReservation, goldEvents = [], goldRoundAction, referralPurchase) => {
      const snapshot = copy(entries), receipt = mobileReceipt && copy(mobileReceipt), reservation = treasureReservation && copy(treasureReservation), events = copy(goldEvents);
      const roundAction = goldRoundAction && copy(goldRoundAction), referralPayment = referralPurchase && copy(referralPurchase);
      return enqueue(async () => {
        requireStarted();
        if (!Array.isArray(snapshot) || snapshot.some(entry => !/^[a-f0-9]{64}$/.test(entry.key))
            || new Set(snapshot.map(entry => entry.key)).size !== snapshot.length) throw new Error('Invalid player commit participants.');
        if (!snapshot.length) { if (events.length || roundAction || referralPayment) throw new Error('Economy actions require participating accounts.'); return []; }
        const keys = [...new Set(snapshot.flatMap(entry => [entry.key, (referralsEnabled || referralPayment) && entry.state.referral?.referredBy].filter(Boolean)))].sort();
        // Batch adjacent statements on the same lock-owning connection to avoid
        // extra intercontinental round trips; acknowledgment still follows COMMIT.
        const lockKeys = keys.map(key => pg.escapeLiteral(key));
        // Deletion requests take the same player row lock before creating their fence.
        const begin = `BEGIN; SELECT account_key, state, pending_credits FROM mossvale_players WHERE account_key = ANY(ARRAY[${keys.map(key => pg.escapeLiteral(key)).join(',')}]::text[]) ORDER BY account_key FOR UPDATE`
          + `; SELECT account_key FROM mossvale_account_deletions WHERE account_key=ANY(ARRAY[${lockKeys.join(',')}]::text[])`;
        let write;
        return transaction(async opened => {
          const { rows } = opened[1];
          if (snapshot.some(entry => !rows.some(row => row.account_key === entry.key))) throw conflict('A participating account no longer exists.');
          const deleting = new Set(opened[2].rows.map(row => row.account_key));
          await deletions.guardCommit(snapshot, deleting);
          const previous = new Map(rows.map(row => [row.account_key, { state: notificationState(copy(row.state)), pending: row.pending_credits }]));
          const existing = new Map(rows.map(normalize).map(row => [row.account_key, { ...row, deleting: deleting.has(row.account_key) }]));
          validateGoldEvents(events, new Set([...existing.values()].flatMap(row => row.state.characters.map(player => player.id)).concat(snapshot.flatMap(entry => entry.state.characters.map(player => player.id)))));
          let projected = snapshot.map(entry => { const row = existing.get(entry.key); return project(entry, row.state, row.pending_credits, row.hasReferral); });
          const referralAccounts = projected.filter(row => referralsEnabled && row.state.referral?.referredBy && (!row.state.referral.qualified
            ? row.state.referral.level >= 20 && row.state.referral.days.length >= 2 && (row.state.referral.spentUsdCents >= 1000 || referralPayment?.buyerKey === row.account_key)
            : referralWallets(row.state).some(wallet => !referralWallets(existing.get(row.account_key).state).includes(wallet))));
          const wallets = [...new Set(referralAccounts.flatMap(row => referralWallets(row.state)))].sort();
          const blockedWalletAccounts = new Set();
          if (wallets.length) {
            // Lock wallet claims before qualifying, including accounts owned in another realm.
            await query('SELECT pg_advisory_xact_lock(key) FROM unnest($1::bigint[]) AS key ORDER BY key', [wallets.map(wallet => lockId('referral-wallet:' + wallet)).sort()]);
            const claims = (await query('SELECT wallet, account_key FROM mossvale_referral_wallets WHERE wallet=ANY($1::text[])', [wallets])).rows;
            for (const row of referralAccounts) if (claims.some(claim => claim.account_key !== row.account_key && referralWallets(row.state).includes(claim.wallet))) blockedWalletAccounts.add(row.account_key);
          }
          if (referralsEnabled || referralPayment) projected = applyReferralCommit(existing, projected, referralPayment, blockedWalletAccounts, referralsEnabled);
          for (const row of projected) if (row.state.referral?.qualified && referralAccounts.some(account => account.account_key === row.account_key)) for (const wallet of referralWallets(row.state))
            await query('INSERT INTO mossvale_referral_wallets(wallet,account_key) VALUES($1,$2) ON CONFLICT DO NOTHING', [wallet, row.account_key]);
          for (const row of projected) validate(row.state, row.account_key);
          const deletingCharacters = projected.filter(row => existing.get(row.account_key).state.characters.some(player => !row.state.characters.some(next => next.id === player.id))).map(row => row.account_key);
          if (deletingCharacters.length) await backfillTreasureClaims(deletingCharacters);
          for (const row of projected) for (const player of existing.get(row.account_key).state.characters)
            if (!row.state.characters.some(next => next.id === player.id)) await goldRounds.guardDeletion(row.account_key, player.id);
          const authorizations = [];
          for (const row of projected) for (const player of row.state.characters) {
            const old = existing.get(row.account_key).state.characters.find(p => p.id === player.id);
            for (const claim of player.treasureClaims || []) {
              const previous = old?.treasureClaims?.find(item => item.id === claim.id);
              const changed = previous && !isDeepStrictEqual(treasureAuthorization(previous), treasureAuthorization(claim));
              if (previous?.status === 'paid' && claim.status !== 'paid'
                  || (!previous || changed) && (!reservation || claim.claimHash !== reservation.claimHash
                    || previous && (reservation.previousClaimHash !== previous.claimHash || !treasureReplacement(previous, claim))))
                throw conflict('Treasury claims require a permanent funding reservation.');
              if (!previous || changed) authorizations.push({ claim, previous, player, account: row, baseline: snapshot.find(entry => entry.key === row.account_key).expected?.characters.find(p => p.id === player.id) });
            }
            if (old?.treasureClaims?.some(claim => !player.treasureClaims?.some(item => item.id === claim.id))) throw conflict('Treasury payout history cannot be removed.');
          }
          const merchantEscrowDelta = roundAction ? await goldRounds.apply(roundAction, snapshot, projected, authorizations, reservation) : 0n;
          if (economy.version >= 1) {
            const before = projected.reduce((sum, row) => { const saved = existing.get(row.account_key); return sum + goldSupply(saved.state, saved.pending_credits); }, 0n);
            const after = projected.reduce((sum, row) => sum + goldSupply(row.state, row.pending), 0n);
            const accounted = events.reduce((sum, event) => sum + BigInt(event.created) - BigInt(event.burned), 0n);
            if (after - before + merchantEscrowDelta !== accounted)
              throw conflict('Gold conservation check failed; refresh and retry the action.');
          }
          for (const { player } of authorizations) {
            const row = projected.find(row => row.state.characters.some(candidate => candidate.id === player.id));
            await goldRounds.guardClaimCapacity(row.account_key, player);
          }
          if (reservation) {
            const { claimHash, previousClaimHash, contract, amountWei, capacityWei } = reservation;
            if (!/^0x[\da-f]{64}$/i.test(claimHash) || !/^0x[\da-f]{40}$/i.test(contract)
                || previousClaimHash !== undefined && !/^0x[\da-f]{64}$/i.test(previousClaimHash)
                || !/^[1-9]\d{0,77}$/.test(amountWei) || !/^\d{1,78}$/.test(capacityWei)) throw conflict('Invalid treasury reservation.');
            const [{ claim, previous, player, account, baseline } = {}] = authorizations;
            if (authorizations.length !== 1 || claim.contract.toLowerCase() !== contract.toLowerCase() || claim.amountWei !== amountWei
                || previousClaimHash !== previous?.claimHash || !previous && claim.previousQuotes?.length)
              throw conflict('Treasury reservation must match exactly one authorization.');
            // A live owner may have unsaved loot; the explicit action baseline records the voucher before its debit.
            const before = baseline?.carriedItems?.['moss-voucher'] || 0, after = player.carriedItems?.['moss-voucher'] || 0;
            if (!baseline || !integer(before) || !integer(after) || (claim.goldRoundId ? previous || roundAction?.kind !== 'claim' || roundAction.roundId !== claim.goldRoundId || after !== before : previous ? after !== before : before < 1 || after !== before - 1))
              throw conflict(previous ? 'Refreshing a treasury quote cannot change vouchers.' : 'Treasury issuance must consume exactly one voucher.');
            await query('SELECT pg_advisory_xact_lock($1::bigint)', [lockId('treasury:' + contract.toLowerCase())]);
            const redeemedAt = !previous && !claim.goldRoundId ? Date.now() : null;
            if (redeemedAt !== null && Math.max(await nextTreasureRedemptionAt(account.account_key), treasureNextRedemptionAt(existing.get(account.account_key).state)) > redeemedAt)
              throw conflict('You can redeem only one MOSS voucher per account per day. Resets at 00:00 UTC.');
            if (!claim.goldRoundId) await goldRounds.revalueOpenRounds(contract, claim.price);
            const rootHash = previous?.previousQuotes?.[0]?.claimHash || previous?.claimHash;
            const held = previous && (await query('SELECT contract, amount_wei::text FROM mossvale_treasure_claims WHERE claim_hash=$1', [rootHash])).rows[0];
            if (previous && (!held || held.contract !== contract.toLowerCase()
                || [...(previous.previousQuotes || []), previous].some(quote => BigInt(quote.amountWei) > BigInt(held.amount_wei))))
              throw conflict('The original treasury reservation is unavailable.');
            const increase = held ? (BigInt(amountWei) > BigInt(held.amount_wei) ? BigInt(amountWei) - BigInt(held.amount_wei) : 0n) : BigInt(amountWei);
            const used = (await query('SELECT COALESCE(SUM(amount_wei),0)::text AS total FROM mossvale_treasure_claims WHERE contract=$1', [contract.toLowerCase()])).rows[0].total;
            // Gold issuance only moves an existing fixed award from its round reserve.
            if (!claim.goldRoundId && BigInt(used) + increase > BigInt(capacityWei)) throw conflict('The treasury is awaiting funding. Your voucher was kept.');
            if (held) {
              if (increase) await query('UPDATE mossvale_treasure_claims SET amount_wei=$2 WHERE claim_hash=$1', [rootHash,amountWei]);
            } else await query('INSERT INTO mossvale_treasure_claims (claim_hash,contract,amount_wei,account_key,redeemed_at) VALUES ($1,$2,$3,$4,$5)',
              [claimHash,contract.toLowerCase(),amountWei,redeemedAt === null ? null : account.account_key,redeemedAt]);
          }
          await commitMobileReceipt(existing, projected, receipt);
          if (validateTransaction) await validateTransaction(projected.map(({ account_key, state }) => ({ account_key, state: copy(state) })));
          // The first guarded rollout only teaches all realms the new schema. Until
          // activation, old writers must never encounter newly introduced account fields.
          const stored = projected.map(row => {
            if (referralsEnabled || row.hasReferral || !row.state.referral) return row;
            const { referral, ...state } = row.state; return { ...row, state };
          });
          const writes = stored.map(row => ({ ...row, notify: !isDeepStrictEqual(previous.get(row.account_key).state, notificationState(row.state))
            || !isDeepStrictEqual(previous.get(row.account_key).pending, row.pending) }));
          write = `WITH changed AS (UPDATE mossvale_players AS saved SET state = incoming.state, pending_credits = incoming.pending FROM jsonb_to_recordset(${pg.escapeLiteral(JSON.stringify(writes))}::jsonb) AS incoming(account_key text, state jsonb, pending jsonb, notify boolean) WHERE saved.account_key = incoming.account_key AND (saved.state IS DISTINCT FROM incoming.state OR saved.pending_credits IS DISTINCT FROM incoming.pending) RETURNING saved.account_key, incoming.notify) SELECT pg_notify('mossvale_players_changed', account_key) FROM changed WHERE notify; COMMIT`;
          if (events.length) write = `${GOLD_EVENTS_INSERT.replace('$1', () => pg.escapeLiteral(JSON.stringify(events)))}; ${write}`;
          return projected.map(({ account_key, state, credits }) => ({ account_key, state, credits }));
        }, begin, () => write);
      });
    },
    addMobileEvent: event => enqueue(() => transaction(() => addMobileEvent(copy(event)))),
    mobileIntent: (id, accountKey) => enqueue(async () => (await query('SELECT * FROM mossvale_mobile_intents WHERE intent_id=$1 AND ($2::text IS NULL OR account_key=$2)', [id, accountKey || null])).rows[0]),
    mobileRevocation: (platform, paymentId) => enqueue(async () => (await query("SELECT data FROM mossvale_mobile_events WHERE platform=$1 AND payment_id=$2 AND kind='refund' ORDER BY at DESC LIMIT 1", [platform, paymentId])).rows[0]?.data),
    pendingMobileEvents: () => enqueue(async () => (await query(`SELECT e.data, i.account_key, i.character_id, i.order_data FROM mossvale_mobile_events e
      LEFT JOIN mossvale_mobile_receipts r ON r.platform=e.platform AND r.payment_id=e.payment_id
      LEFT JOIN mossvale_mobile_intents i ON i.intent_id=COALESCE(e.intent_id,r.intent_id)
      WHERE e.applied_at IS NULL ORDER BY e.at LIMIT 100`)).rows),
    completeMobileEvent: (id, outcome) => enqueue(() => query('UPDATE mossvale_mobile_events SET applied_at=$2,outcome=$3 WHERE event_id=$1 AND applied_at IS NULL', [id, Date.now(), outcome])),
    archiveMobileReceipt: receipt => enqueue(() => transaction(async () => {
      // Match normal receipt commits: player, payment, then checkout row.
      const state = (await query('SELECT state FROM mossvale_players WHERE account_key=$1 FOR UPDATE', [receipt.accountKey])).rows[0]?.state;
      if (state?.characters.some(player => player.id === receipt.characterId)) throw conflict('This purchase character is still active.');
      await query('SELECT pg_advisory_xact_lock($1::bigint)', [lockId('mobile:' + receipt.platform + ':' + receipt.paymentId)]);
      const archived = (await query('SELECT * FROM mossvale_mobile_intents WHERE intent_id=$1 FOR UPDATE', [receipt.intentId])).rows[0];
      if (!archived || archived.account_key !== receipt.accountKey || archived.character_id !== receipt.characterId
          || archived.order_data.platform !== receipt.platform || archived.order_data.sku !== receipt.productId
          || receipt.purchasedAt < archived.order_data.createdAt - 30000) throw conflict('Retired checkout does not match this receipt.');
      const old = archived.order_data, status = receipt.action === 'refund' ? 'refunded' : old.status === 'delivered' ? 'delivered' : 'payment-confirmed';
      await putReceipt(receipt, status);
      const order = { ...old, paymentId: receipt.paymentId, purchasedAt: receipt.purchasedAt, sandbox: receipt.sandbox, status,
        ...(status === 'refunded' ? { revocation: { at: receipt.at, eventId: receipt.eventId, consumedMs: 0 } } : {}) };
      await archiveIntent(receipt.accountKey, receipt.characterId, order);
    })),
    mobileSyncState: () => enqueue(async () => (await query("SELECT state FROM mossvale_mobile_sync WHERE name='google-voids'")).rows[0]?.state || null),
    commitMobileSync: (expected, next, events) => enqueue(() => transaction(async () => {
      await query('SELECT pg_advisory_xact_lock($1::bigint)', [lockId('mobile-sync')]);
      const current = (await query("SELECT state FROM mossvale_mobile_sync WHERE name='google-voids' FOR UPDATE")).rows[0]?.state || null;
      if (!isDeepStrictEqual(current, expected)) return false;
      for (const event of events) await addMobileEvent(event);
      await query("INSERT INTO mossvale_mobile_sync VALUES ('google-voids',$1::jsonb) ON CONFLICT (name) DO UPDATE SET state=EXCLUDED.state", [JSON.stringify(next)]);
      return true;
    })),
    addGuardReport: report => {
      const submitted = copy(report);
      return enqueue(() => transaction(async () => {
        requireStarted();
        if (submitted?.source !== 'guard' || submitted.status !== 'open' || submitted.reporterAccount !== submitted.targetAccount
            || !/^[a-f0-9]{64}$/.test(submitted.targetAccount || '') || typeof submitted.id !== 'string' || !submitted.id
            || typeof submitted.targetId !== 'string' || !submitted.targetId || typeof submitted.targetName !== 'string'
            || typeof submitted.reason !== 'string' || !submitted.reason || submitted.reason.length > 128
            || typeof submitted.details !== 'string' || submitted.details.length > 4000 || !integer(submitted.createdAt) || !submitted.createdAt
            || submitted.blockedUntil !== undefined && !integer(submitted.blockedUntil)) throw conflict('Invalid guard report.');
        await query('SELECT pg_advisory_xact_lock($1::bigint)', [lockId('guard:' + submitted.targetAccount)]);
        // Report rows precede player rows, matching moderation and account deletion.
        const found = await query("SELECT report FROM mossvale_reports WHERE reporter_account=$1 AND report->>'source'='guard' AND report->>'status'='open' AND report->>'reason'=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [submitted.targetAccount, submitted.reason]);
        const present = await query('SELECT account_key FROM mossvale_players WHERE account_key=$1 FOR SHARE', [submitted.targetAccount]);
        if (!present.rows.length) throw conflict('A report account no longer exists.');
        await deletions.guardCommit([{ key: submitted.targetAccount, expected: {} }]);
        const previous = found.rows[0]?.report;
        const saved = previous ? { ...submitted, id: previous.id, createdAt: previous.createdAt,
          ...(submitted.blockedUntil !== undefined || previous.blockedUntil !== undefined ? { blockedUntil: Math.max(submitted.blockedUntil || 0, previous.blockedUntil || 0) } : {}) } : submitted;
        if (previous) await query('UPDATE mossvale_reports SET report=$2::jsonb WHERE id=$1', [saved.id, JSON.stringify(saved)]);
        else await query('INSERT INTO mossvale_reports (id,reporter_account,created_at,report) VALUES ($1,$2,$3,$4::jsonb)', [saved.id, saved.reporterAccount, saved.createdAt, JSON.stringify(saved)]);
        return saved;
      }));
    },
    guardBlockedUntil: accountKey => enqueue(async () => {
      requireStarted();
      if (typeof accountKey !== 'string' || !/^[a-f0-9]{64}$/.test(accountKey)) throw conflict('Invalid guard account.');
      const { rows } = await query("SELECT MAX((report->>'blockedUntil')::bigint) AS until FROM mossvale_reports WHERE reporter_account=$1 AND report->>'source'='guard'", [accountKey]);
      return Number(rows[0].until || 0);
    }),
    addReport: report => enqueue(() => transaction(async () => {
      const subjects = [report.reporterAccount, report.targetAccount];
      const present = await query('SELECT account_key FROM mossvale_players WHERE account_key=ANY($1::text[]) ORDER BY account_key FOR SHARE', [subjects]);
      if (present.rows.length !== new Set(subjects).size) throw conflict('A report account no longer exists.');
      await deletions.guardCommit(subjects.map(key => ({ key, expected: {} })));
      await query('SELECT pg_advisory_xact_lock($1::bigint)', [lockId('report:' + report.reporterAccount)]);
      const recent = await query("SELECT id FROM mossvale_reports WHERE reporter_account = $1 AND created_at > $2 AND COALESCE(report->>'source','')<>'guard' LIMIT 1", [report.reporterAccount, report.createdAt - 60000]);
      if (recent.rows.length) throw Error('Wait one minute before sending another report.');
      await query('INSERT INTO mossvale_reports (id, reporter_account, created_at, report) VALUES ($1,$2,$3,$4::jsonb)', [report.id, report.reporterAccount, report.createdAt, JSON.stringify(report)]);
    })),
    listReports: (includeReviewed = false) => enqueue(async () => (await query("SELECT report FROM mossvale_reports WHERE ($1::boolean OR report->>'status' = 'open') ORDER BY COALESCE((report->>'reviewedAt')::bigint, created_at) DESC LIMIT 50", [includeReviewed === true])).rows.map(row => row.report)),
    reviewReport: (id, decision, reason, actor, authorized) => enqueue(() => transaction(async () => {
      const result = await query('SELECT report FROM mossvale_reports WHERE id = $1 FOR UPDATE', [id]);
      const report = result.rows[0]?.report;
      if (!report || report.status !== 'open') throw Error('This report has already been reviewed.');
      if (!authorized()) throw Error('Game master access has expired.');
      if (decision === 'ban') {
        if (report.targetAccount === actor.accountKey) throw Error('You cannot ban your own account.');
        const found = await query('SELECT state FROM mossvale_players WHERE account_key = $1 FOR UPDATE', [report.targetAccount]);
        const state = found.rows[0]?.state;
        if (!state) throw Error('This account no longer exists. Dismiss the report.');
        if (state.gmProtected) throw Error('Game master accounts require administrator review.');
        if (!authorized()) throw Error('Game master access has expired.');
        const ban = state.ban || { at: Date.now(), by: actor.characterId, reason };
        validate(migrate(copy({ ...state, ban }), report.targetAccount), report.targetAccount);
        await query("UPDATE mossvale_players SET state = jsonb_set(state, '{ban}', $2::jsonb) WHERE account_key = $1", [report.targetAccount, JSON.stringify(ban)]);
        await query("SELECT pg_notify('mossvale_players_changed', $1)", [report.targetAccount]);
      }
      const reviewedAt = Date.now();
      const reviewed = { ...report, status: decision === 'ban' ? 'banned' : 'dismissed', resolution: reason, reviewerId: actor.characterId, reviewedAt,
        decisionEvidence: reportDecisionEvidence(report, decision, reason, actor.characterId, reviewedAt) };
      await query('UPDATE mossvale_reports SET report = $2::jsonb WHERE id = $1', [id, JSON.stringify(reviewed)]);
      return reviewed;
    })),
    close: async () => {
      if (closing) { await queue; await ending; return; }
      closing = true;
      await queue;
      owned.clear();
      ending ||= client.end();
      await ending;
    },
  };
}
