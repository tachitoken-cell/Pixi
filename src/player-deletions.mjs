import { randomUUID } from 'node:crypto';
import { goldSupply } from './gold-ledger.mjs';
import { insertGoldEvents } from './gold-migration.mjs';
const deletionError = (message, code = 'ACCOUNT_DELETING') => Object.assign(Error(message), { code });
export function playerDeletions({ query, enqueue, transaction, lockId, owned, validate, migrate, goldRounds }) {
  const fenced = new Set(), processing = new Set();
  const publicState = row => row ? { status: row.status, requestedAt: Number(row.requested_at), ...(row.completed_at ? { completedAt: Number(row.completed_at) } : {}), ...(row.last_error ? { code: row.last_error } : {}) } : { status: 'none' };
  const notify = key => query("SELECT pg_notify('mossvale_players_changed', $1)", [key]);
  const blocked = async key => {
    const row = (await query('SELECT * FROM mossvale_account_deletions WHERE account_key=$1', [key])).rows[0];
    if (row) fenced.add(key);
    return row;
  };
  return {
    async initialize() {
      await query(`CREATE TABLE IF NOT EXISTS mossvale_account_deletions (
        account_key text PRIMARY KEY, subject text, status text NOT NULL CHECK (status IN ('pending','complete')),
        requested_at bigint NOT NULL, completed_at bigint, retry_at bigint NOT NULL DEFAULT 0, last_error text)`);
      await query(`CREATE TABLE IF NOT EXISTS mossvale_mobile_intents (
        intent_id uuid PRIMARY KEY, account_key text NOT NULL, character_id text NOT NULL, order_data jsonb NOT NULL)`);
      for (const row of (await query('SELECT account_key FROM mossvale_account_deletions')).rows) fenced.add(row.account_key);
    },
    isDeleting: key => fenced.has(key),
    rememberDeletionFences: rows => { for (const row of rows) fenced.add(row.account_key); },
    async guardClaim(key, deleting) {
      if (deleting === undefined ? await blocked(key) : deleting) {
        fenced.add(key); throw deletionError('This account is being deleted or has been deleted.');
      }
    },
    async guardCommit(entries, blockedKeys) {
      for (const entry of entries) if (entry.expected && (blockedKeys ? blockedKeys.has(entry.key) : await blocked(entry.key))) {
        fenced.add(entry.key); throw deletionError('This account is being deleted.');
      }
    },
    deletionStatus: key => enqueue(async () => publicState(await blocked(key))),
    deletionRequests: () => enqueue(async () => {
      const rows = (await query("SELECT account_key, retry_at FROM mossvale_account_deletions WHERE status='pending' ORDER BY retry_at,requested_at LIMIT 100")).rows;
      for (const row of rows) fenced.add(row.account_key);
      return rows;
    }),
    requestDeletion: (key, subject, authorized) => enqueue(() => transaction(async () => {
      // Same target row as every multi-account trade/auction write; a request
      // observes all admitted payments before erecting its mutation fence.
      const saved = (await query('SELECT state FROM mossvale_players WHERE account_key=$1 FOR UPDATE', [key])).rows[0]?.state;
      const existing = await blocked(key);
      if (existing) return publicState(existing);
      if (!authorized()) throw deletionError('Sign in again to confirm deletion.', 'FRESH_AUTH_REQUIRED');
      await goldRounds?.guardDeletion(key);
      const ids = (saved?.characters || []).map(p => p.id);
      if (saved?.characters.some(p => p.arenaWagers?.length)) throw deletionError('Settle or refund MOSS arena wagers, then request deletion again.', 'ACCOUNT_PAYMENTS_PENDING');
      if (saved?.characters.some(p => p.storeOrders?.some(order => !['delivered', 'expired'].includes(order.status)))) throw deletionError('Finish pending MOSS store payments, then request deletion again.', 'ACCOUNT_PAYMENTS_PENDING');
      if (saved?.characters.some(p => p.treasureClaims?.some(claim => claim.status !== 'paid'))) throw deletionError('Finish pending MOSS treasury payouts, then request deletion again.', 'ACCOUNT_PAYMENTS_PENDING');
      if (saved?.characters.some(p => p.nftOrders?.some(order => order.status === 'quoted'))) throw deletionError('Finish pending pet and house NFT claims, then request deletion again.', 'ACCOUNT_PAYMENTS_PENDING');
      if (saved?.characters.some(p => p.specialistNftOrders?.some(order => order.status === 'quoted') || p.raidProgress?.specialists.some(card => card.nft && !card.sealed))) throw deletionError('Seal active specialist NFTs and finish pending specialist transactions before requesting deletion.', 'ACCOUNT_PAYMENTS_PENDING');
      const accounts = (await query('SELECT state FROM mossvale_players')).rows;
      if (accounts.some(({ state }) => state.characters.some(p => (p.auctions || []).some(listing => listing.reservation && (ids.includes(listing.sellerId) || ids.includes(listing.reservation.buyerId)))))) throw deletionError('Finish pending auction payments, then request deletion again.', 'ACCOUNT_PAYMENTS_PENDING');
      const at = Date.now();
      await query("INSERT INTO mossvale_account_deletions(account_key,subject,status,requested_at) VALUES($1,$2,'pending',$3) ON CONFLICT DO NOTHING", [key, subject, at]);
      await notify(key);
      return publicState((await query('SELECT * FROM mossvale_account_deletions WHERE account_key=$1', [key])).rows[0]);
    })).then(result => { fenced.add(key); return result; }),
    acquireDeletion: key => enqueue(async () => {
      if (owned.has(key) || processing.has(key)) return null;
      const row = await blocked(key);
      if (!row || row.status !== 'pending' || Number(row.retry_at) > Date.now()) return null;
      if (!(await query('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [lockId(key)])).rows[0].acquired) return null;
      processing.add(key); return row;
    }),
    releaseDeletion: key => enqueue(async () => { if (processing.delete(key)) await query('SELECT pg_advisory_unlock($1::bigint)', [lockId(key)]); }),
    deferDeletion: key => enqueue(() => query("UPDATE mossvale_account_deletions SET retry_at=$2,last_error='DELETION_RETRYING' WHERE account_key=$1 AND status='pending'", [key, Date.now() + 10000])),
    finishDeletion: key => enqueue(() => transaction(async () => {
      if (!processing.has(key)) throw deletionError('Account deletion requires exclusive ownership.');
      const operation = await blocked(key);
      if (!operation || operation.status === 'complete') return;
      const current = (await query('SELECT state FROM mossvale_players WHERE account_key=$1', [key])).rows[0]?.state;
      const ids = (current?.characters || []).map(p => p.id);
      // Report review locks reports before player rows. Keep that order here.
      await query("DELETE FROM mossvale_reports WHERE reporter_account=$1 OR report->>'targetAccount'=$1 OR report->>'reviewerId'=ANY($2::text[])", [key, ids]);
      const rows = (await query('SELECT account_key,state,pending_credits FROM mossvale_players ORDER BY account_key FOR UPDATE')).rows;
      for (const row of rows) {
        row.state = migrate(row.state, row.account_key);
        if (row.account_key === key) {
          await insertGoldEvents(query, row.state.characters.map(player => ({ id: randomUUID(), at: Date.now(), characterId: player.id, reason: 'deletion:account',
            created: 0, burned: goldSupply({ characters: [player] }, { [player.id]: row.pending_credits?.[player.id] || 0 }).toString(), transferred: 0 })));
          for (const player of row.state.characters) for (const order of player.mobileStoreOrders || []) await query('INSERT INTO mossvale_mobile_intents(intent_id,account_key,character_id,order_data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING', [order.id, key, player.id, JSON.stringify(order)]);
          continue;
        }
        let changed = false;
        for (const player of row.state.characters) for (const field of ['friendIds', 'friendRequestIds', 'ignoreIds']) {
          const before = player[field] || [], after = before.filter(id => !ids.includes(id));
          if (after.length !== before.length) { player[field] = after; changed = true; }
        }
        if (changed) { validate(row.state, row.account_key); await query('UPDATE mossvale_players SET state=$2::jsonb WHERE account_key=$1', [row.account_key, JSON.stringify(row.state)]); await notify(row.account_key); }
      }
      await query('DELETE FROM mossvale_players WHERE account_key=$1', [key]);
      // Keep the hash fence and financial replay records; drop provider subject.
      await query("UPDATE mossvale_account_deletions SET subject=NULL,status='complete',completed_at=$2,retry_at=0,last_error=NULL WHERE account_key=$1", [key, Date.now()]);
      await notify(key);
    })),
  };
}
