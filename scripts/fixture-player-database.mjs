import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

// Keep gameplay tests on the real store/writer while controlling its durable
// acknowledgment. SQL correctness and cross-process locks have real PG tests.
export function playerDatabaseFixture(records, { beforeWrite = async () => {}, onWrite = () => {}, onEnd = () => {} } = {}) {
  const owners = new Map(), pending = new Map(), eventIds = new Set(), dungeonRuns = new Set();
  const copy = value => structuredClone(value);
  const jsonLiteral = sql => {
    const literal = sql.match(/jsonb_to_recordset\((E?'(?:''|[^'])*')::jsonb\)/)?.[1];
    assert(literal, 'batched JSON uses a PostgreSQL string literal');
    const escaped = literal.startsWith('E'), body = literal.slice(escaped ? 2 : 1, -1).replaceAll("''", "'");
    return { literal, json: escaped ? body.replaceAll('\\\\', '\\') : body };
  };
  return class PlayerDatabaseFixture extends EventEmitter {
    transaction;
    goldEvents = [];
    async connect() {}
    async end() {
      for (const [key, owner] of owners) if (owner === this) owners.delete(key);
      this.transaction = undefined;
      this.goldEvents = [];
      onEnd();
    }
    async query(sql, args = []) {
      if (sql.startsWith('SELECT account_key FROM mossvale_account_deletions') && sql.includes('; SELECT account_key, state FROM mossvale_players')) {
        const keys = sql.includes('WHERE') ? [...sql.split('; ')[0].matchAll(/'([a-f0-9]{64})'/g)].map(match => match[1]) : undefined;
        return [{ rows: [] }, await PlayerDatabaseFixture.prototype.query.call(this, 'SELECT account_key, state FROM mossvale_players', [keys])];
      }
      if (sql === 'SELECT current_schema() AS schema') return { rows: [{ schema: 'public' }] };
      if (sql === 'SELECT version,exchange_enabled,maintenance,target_revision FROM mossvale_economy WHERE singleton')
        return { rows: [{ version: 0, exchange_enabled: false, maintenance: false, target_revision: null }] };
      if (sql.startsWith('CREATE OR REPLACE FUNCTION mossvale_economy_write_fence') || sql.startsWith('DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger')
        || sql.startsWith('INSERT INTO mossvale_economy(singleton)') || sql.startsWith("SELECT set_config('mossvale.economy_supported'") || sql === 'LISTEN mossvale_economy_changed') return { rows: [] };
      if (sql.startsWith('INSERT INTO mossvale_gold_events')) {
        if (sql.endsWith('; COMMIT')) {
          const split = sql.indexOf('; WITH changed AS'), { literal, json } = jsonLiteral(sql.slice(0, split));
          const events = await PlayerDatabaseFixture.prototype.query.call(this, sql.slice(0, split).replace(literal, '$1'), [json]);
          return [events, ...await PlayerDatabaseFixture.prototype.query.call(this, sql.slice(split + 2))];
        }
        assert(this.transaction, 'gold events share the player transaction');
        const events = JSON.parse(args[0]);
        for (const event of events) { assert(!eventIds.has(event.id) && !this.goldEvents.includes(event.id), 'gold event must not replay'); this.goldEvents.push(event.id); }
        return { rows: [] };
      }
      if (sql.startsWith('BEGIN; SELECT account_key, state, pending_credits')) {
        const statements = sql.split('; '), keys = [...statements[1].matchAll(/'([a-f0-9]{64})'/g)].map(match => match[1]);
        const begin = await PlayerDatabaseFixture.prototype.query.call(this, 'BEGIN');
        const selected = await PlayerDatabaseFixture.prototype.query.call(this, 'SELECT account_key, state, pending_credits FROM mossvale_players WHERE account_key = ANY($1::text[]) ORDER BY account_key FOR UPDATE', [keys]);
        return [begin, selected, ...(statements.length > 2 ? [{ rows: [] }] : [])];
      }
      if (sql.startsWith('WITH changed AS (UPDATE mossvale_players AS saved SET') && sql.endsWith('; COMMIT')) {
        const { literal, json } = jsonLiteral(sql);
        const written = await PlayerDatabaseFixture.prototype.query.call(this, sql.replace(literal, '$1').slice(0, -8), [json]);
        return [written, await PlayerDatabaseFixture.prototype.query.call(this, 'COMMIT')];
      }
      // Financial SQL has real PostgreSQL tests; this gameplay fixture has no orders or provider events.
      if (sql.startsWith('INSERT INTO mossvale_mobile_intents (intent_id,account_key,character_id,order_data)\n')
          || sql.startsWith('SELECT e.data, i.account_key, i.character_id, i.order_data FROM mossvale_mobile_events e\n')) {
        assert(Object.values(records).every(account => account.characters.every(player => !player.mobileStoreOrders?.length)), 'Use the real financial fixture for native orders.');
        return { rows: [] };
      }
      // These gameplay scenarios have no merchant rounds; their background reads
      // and deletion/history guards must still work through the real player store.
      if (sql.startsWith('UPDATE mossvale_treasure_claims saved SET account_key=')
          || sql.startsWith('SELECT MAX(redeemed_at) AS at FROM mossvale_treasure_claims')) {
        assert(Object.values(records).every(account => account.characters.every(player => !player.treasureClaims?.length)), 'Use the real PostgreSQL treasury fixture for voucher claims.');
        return { rows: sql.startsWith('SELECT') ? [{ at: null }] : [] };
      }
      if (sql.startsWith('SELECT state FROM mossvale_gold_rounds')) {
        assert(Object.values(records).every(account => account.characters.every(player => !player.treasureClaims?.some(claim => claim.goldRoundId))),
          'Use the real PostgreSQL gold fixture for merchant awards.');
        return { rows: [] };
      }
      // Full clears now persist a leaderboard receipt; SQL/rank behavior has real PG checks.
      if (sql.startsWith('INSERT INTO mossvale_dungeon_records(')) {
        assert(sql.endsWith('ON CONFLICT (id) DO NOTHING RETURNING id'));
        const rows = dungeonRuns.has(args[0]) ? [] : [{ id: args[0] }];
        dungeonRuns.add(args[0]); return { rows };
      }
      // Deletion behavior has its own real PostgreSQL/two-realm fixture.
      if (sql === 'SELECT account_key FROM mossvale_account_deletions' || sql === 'SELECT * FROM mossvale_account_deletions WHERE account_key=$1'
          || sql.startsWith('SELECT account_key FROM mossvale_account_deletions WHERE')
          || sql === "SELECT account_key, retry_at FROM mossvale_account_deletions WHERE status='pending' ORDER BY retry_at,requested_at LIMIT 100") return { rows: [] };
      if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX') || sql.startsWith('ALTER TABLE') || sql === 'LISTEN mossvale_players_changed' || sql.startsWith('SELECT pg_notify(')) return { rows: [] };
      if (sql.startsWith('SELECT pg_advisory_lock')) { owners.set(args[0], this); return { rows: [] }; }
      if (sql.startsWith('SELECT pg_try_advisory_lock')) {
        const acquired = !owners.has(args[0]) || owners.get(args[0]) === this;
        if (acquired) owners.set(args[0], this);
        return { rows: [{ acquired }] };
      }
      if (sql.startsWith('SELECT pg_advisory_unlock')) {
        assert.equal(owners.get(args[0]), this, 'only the owning connection releases the account');
        owners.delete(args[0]); return { rows: [{ pg_advisory_unlock: true }] };
      }
      if (sql === 'BEGIN') { assert.equal(this.transaction, undefined); this.transaction = []; return { rows: [] }; }
      if (sql === 'ROLLBACK') { assert(this.transaction); this.transaction = undefined; this.goldEvents = []; return { rows: [] }; }
      if (sql === 'COMMIT') {
        assert(this.transaction);
        for (const row of this.transaction) { records[row.account_key] = copy(row.state); pending.set(row.account_key, copy(row.pending)); }
        for (const id of this.goldEvents) eventIds.add(id);
        this.goldEvents = [];
        if (this.transaction.length) onWrite();
        this.transaction = undefined; return { rows: [] };
      }
      if (sql.startsWith('SELECT account_key, state FROM mossvale_players'))
        return { rows: Object.entries(records).filter(([key]) => !args[0] || args[0].includes(key)).map(([account_key, state]) => ({ account_key, state: copy(state) })) };
      if (sql.startsWith('WITH deletion AS (SELECT EXISTS')) {
        if (!args[1]) records[args[0]] ??= { characters: [] };
        return { rows: [{ state: records[args[0]] ? copy(records[args[0]]) : null, deleting: false, guard_blocked_until: null }] };
      }
      if (sql.startsWith('INSERT INTO mossvale_players')) {
        assert(sql.endsWith('ON CONFLICT DO NOTHING'), 'claims only create missing accounts');
        records[args[0]] ??= { characters: [] }; return { rows: [] };
      }
      if (sql === 'SELECT state FROM mossvale_players WHERE account_key = $1')
        return { rows: records[args[0]] ? [{ state: copy(records[args[0]]) }] : [] };
      if (sql.startsWith('SELECT account_key, state, pending_credits FROM mossvale_players')) {
        assert(sql.endsWith('ORDER BY account_key FOR UPDATE')); assert(this.transaction, 'account reads hold transaction row locks');
        return { rows: args[0].filter(key => records[key]).map(account_key => ({ account_key, state: copy(records[account_key]), pending_credits: copy(pending.get(account_key) ?? {}) })) };
      }
      assert(sql.startsWith('WITH changed AS (UPDATE mossvale_players AS saved SET'), `Unexpected player-store SQL: ${sql}`);
      assert(sql.endsWith("SELECT pg_notify('mossvale_players_changed', account_key) FROM changed WHERE notify"), 'shared changes notify the shared store');
      assert(this.transaction, 'projected writes belong to an atomic transaction');
      const rows = JSON.parse(args[0]); await beforeWrite(rows);
      this.transaction.push(...copy(rows)); return { rows: [] };
    }
  };
}
