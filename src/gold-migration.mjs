import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { goldEventValid } from './gold-ledger.mjs';

export const ECONOMY_VERSION = 1;
export const GOLD_ALLOWANCE = 100;
const natural = value => Number.isSafeInteger(value) && value >= 0;
const revisionValid = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

/** Distribute the retained account balance proportionally; roster order breaks remainder ties. */
export function resetAccountGold(state, pending = {}) {
  assert(Array.isArray(state.characters) && state.characters.length <= 6, 'Invalid character roster');
  assert(pending && typeof pending === 'object' && !Array.isArray(pending), 'Invalid pending credits');
  const ids = new Set(state.characters.map(player => player.id));
  assert(ids.size === state.characters.length && Object.keys(pending).every(id => ids.has(id)), 'Invalid pending credit owner');
  const amounts = state.characters.map(player => {
    assert(natural(player.gold) && natural(pending[player.id] ?? 0), 'Invalid gold balance');
    return BigInt(player.gold) + BigInt(pending[player.id] ?? 0);
  });
  const before = amounts.reduce((sum, value) => sum + value, 0n);
  const excess = before > BigInt(GOLD_ALLOWANCE) ? before - BigInt(GOLD_ALLOWANCE) : 0n;
  const burned = excess * 9n / 10n, after = before - burned;
  const parts = amounts.map((amount, index) => ({ index, amount: before ? amount * after / before : 0n, remainder: before ? amount * after % before : 0n }));
  let rest = after - parts.reduce((sum, part) => sum + part.amount, 0n);
  for (const part of [...parts].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (!rest) break;
    part.amount++; rest--;
  }
  assert.equal(rest, 0n);
  const next = structuredClone(state);
  const evidence = parts.map(({ index, amount }) => {
    assert(amount <= BigInt(Number.MAX_SAFE_INTEGER), 'Retained character gold exceeds the supported balance');
    next.characters[index].gold = Number(amount);
    return { characterId: next.characters[index].id, before: amounts[index].toString(), after: amount.toString(), burned: (amounts[index] - amount).toString() };
  });
  return { state: next, pending: {}, before: before.toString(), after: after.toString(), burned: burned.toString(), characters: evidence };
}

export async function initializeEconomy(query) {
  const schema = (await query('SELECT current_schema() AS schema')).rows[0].schema;
  await query(`CREATE TABLE IF NOT EXISTS mossvale_economy (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), version integer NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 1),
    exchange_enabled boolean NOT NULL DEFAULT false, maintenance boolean NOT NULL DEFAULT false,
    target_revision text, admitted_backends jsonb NOT NULL DEFAULT '[]', migration jsonb, activation jsonb,
    CHECK (NOT exchange_enabled OR version=1))`);
  await query('INSERT INTO mossvale_economy(singleton) VALUES(true) ON CONFLICT DO NOTHING');
  await query(`CREATE TABLE IF NOT EXISTS mossvale_gold_events (
    id uuid PRIMARY KEY, at bigint NOT NULL CHECK (at>0), character_id uuid NOT NULL,
    reason text NOT NULL CHECK (reason ~ '^[a-z][a-z0-9:_-]{0,63}$'),
    created numeric(30,0) NOT NULL CHECK (created>=0), burned numeric(30,0) NOT NULL CHECK (burned>=0), transferred numeric(30,0) NOT NULL CHECK (transferred>=0))`);
  await query('CREATE INDEX IF NOT EXISTS mossvale_gold_events_at ON mossvale_gold_events(at)');
  await query(`CREATE TABLE IF NOT EXISTS mossvale_gold_reset (
    account_key text PRIMARY KEY, version integer NOT NULL CHECK(version=1), evidence jsonb NOT NULL)`);
  // Both the capability and the epoch are fixed for the lifetime of the permanent writer connection.
  // The metadata row lock serializes every write against maintenance/epoch activation.
  await query(`CREATE OR REPLACE FUNCTION mossvale_economy_write_fence() RETURNS trigger LANGUAGE plpgsql SET search_path TO ${pg.escapeIdentifier(schema)}, pg_catalog AS $$
    DECLARE economy mossvale_economy%ROWTYPE; backend timestamptz;
    BEGIN
      SELECT * INTO STRICT economy FROM mossvale_economy WHERE singleton FOR SHARE;
      IF economy.version>0 AND (COALESCE(current_setting('mossvale.economy_supported',true),'')<>'1'
          OR COALESCE(current_setting('mossvale.economy_epoch',true),'')<>economy.version::text) THEN
        RAISE EXCEPTION 'Economy writer epoch changed; restart on compatible code' USING ERRCODE='55000';
      END IF;
      IF economy.maintenance AND COALESCE(current_setting('mossvale.economy_migration',true),'')<>'1' THEN
        SELECT backend_start INTO backend FROM pg_stat_activity WHERE pid=pg_backend_pid();
        IF NOT economy.admitted_backends @> jsonb_build_array(jsonb_build_object('pid',pg_backend_pid(),'startedAt',backend)) THEN
          RAISE EXCEPTION 'Economy maintenance rejects a new writer' USING ERRCODE='55000';
        END IF;
      END IF;
      RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
    END $$`);
  await query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='mossvale_players'::regclass AND tgname='mossvale_economy_fence') THEN
    CREATE TRIGGER mossvale_economy_fence BEFORE INSERT OR UPDATE OR DELETE ON mossvale_players FOR EACH ROW EXECUTE FUNCTION mossvale_economy_write_fence();
    END IF; END $$`);
}

export async function readEconomy(query) {
  const row = (await query('SELECT version,exchange_enabled,maintenance,target_revision FROM mossvale_economy WHERE singleton')).rows[0];
  assert(row && [0, ECONOMY_VERSION].includes(row.version), 'Unsupported economy version');
  return { version: row.version, exchangeEnabled: row.exchange_enabled, maintenance: row.maintenance, targetRevision: row.target_revision };
}

export function validateGoldEvents(events, characterIds) {
  assert(Array.isArray(events) && events.length <= 10000, 'Invalid gold events');
  const ids = new Set();
  for (const event of events) {
    assert(goldEventValid(event) && Object.keys(event).length === 7 && !ids.has(event.id) && characterIds.has(event.characterId), 'Invalid gold event');
    ids.add(event.id);
  }
}

export const GOLD_EVENTS_INSERT = `INSERT INTO mossvale_gold_events(id,at,character_id,reason,created,burned,transferred)
    SELECT id,at,"characterId",reason,created,burned,transferred FROM jsonb_to_recordset($1::jsonb)
    AS event(id uuid,at bigint,"characterId" uuid,reason text,created numeric,burned numeric,transferred numeric)`;

export async function insertGoldEvents(query, events) {
  if (!events.length) return;
  // Duplicate IDs abort the complete balance transaction; never silently accept a replay.
  await query(GOLD_EVENTS_INSERT, [JSON.stringify(events)]);
}

export function validateBarrierProof(proof, revision) {
  assert(proof && proof.revision === revision && revisionValid(revision), 'Invalid migration revision');
  assert(proof.realms && Object.keys(proof.realms).sort().join(',') === 'asia,eu,us', 'All realm drain proofs are required');
  for (const [realm, value] of Object.entries(proof.realms)) {
    assert(value && value.realm === realm && value.targetRevision === revision && typeof value.instanceId === 'string' && value.instanceId.length > 0
      && revisionValid(value.revision) && value.finalSave === true && (realm === 'eu' ? value.admissionHeld === true : value.restartHeld === true) && Number.isSafeInteger(value.drainedAt) && value.drainedAt > 0,
    'Exact drained process, final save and restart hold are required');
  }
  assert(proof.backup && /^[a-f0-9]{64}$/.test(proof.backup.sha256) && Number.isSafeInteger(proof.backup.bytes) && proof.backup.bytes > 0
    && Number.isSafeInteger(proof.backup.at) && proof.backup.at >= Math.max(...Object.values(proof.realms).map(value => value.drainedAt)), 'Verified post-drain backup is required');
}

/** Commands run only by the workflow's fixed host helper, never by a game request. */
export async function economyOperation(client, action, revision, proof) {
  assert(['status', 'arm', 'migrate', 'enable'].includes(action) && revisionValid(revision), 'Invalid economy operation');
  const query = client.query.bind(client);
  if (action === 'status') return { ...await readEconomy(query), ...(await query('SELECT migration,activation FROM mossvale_economy WHERE singleton')).rows[0] };
  await query('BEGIN');
  try {
    // Match ordinary writes' table-then-metadata lock order to avoid a drain/save deadlock.
    await query('LOCK TABLE mossvale_players IN ACCESS EXCLUSIVE MODE');
    const row = (await query('SELECT * FROM mossvale_economy WHERE singleton FOR UPDATE')).rows[0];
    assert(row, 'Economy compatibility release must be installed first');
    if (row.target_revision) assert.equal(row.target_revision, revision, 'Another revision owns the economy activation');
    if (action === 'arm') {
      if (!row.maintenance && row.version === 0) {
        await query(`UPDATE mossvale_economy SET maintenance=true,target_revision=$1,
          admitted_backends=(SELECT COALESCE(jsonb_agg(jsonb_build_object('pid',pid,'startedAt',backend_start)),'[]'::jsonb)
          FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) WHERE singleton`, [revision]);
      }
    } else if (action === 'migrate') {
      validateBarrierProof(proof, revision);
      assert.equal(row.target_revision, revision, 'Maintenance was not armed for this revision');
      if (row.version === 0) {
        assert(row.maintenance, 'Migration requires the maintenance barrier');
        await query("SELECT set_config('mossvale.economy_migration','1',true)");
        const rows = (await query('SELECT account_key,state,pending_credits FROM mossvale_players ORDER BY account_key')).rows;
        let before = 0n, burned = 0n, after = 0n;
        const at = Date.now();
        for (const account of rows) {
          const result = resetAccountGold(account.state, account.pending_credits);
          const evidence = { before: result.before, burned: result.burned, after: result.after, characters: result.characters };
          await query('INSERT INTO mossvale_gold_reset(account_key,version,evidence) VALUES($1,1,$2::jsonb)', [account.account_key, JSON.stringify(evidence)]);
          await query("UPDATE mossvale_players SET state=$2::jsonb,pending_credits='{}'::jsonb WHERE account_key=$1", [account.account_key, JSON.stringify(result.state)]);
          await insertGoldEvents(query, result.characters.filter(value => value.burned !== '0').map(value => ({ id: randomUUID(), at, characterId: value.characterId, reason: 'reset', created: 0, burned: value.burned, transferred: 0 })));
          before += BigInt(result.before); burned += BigInt(result.burned); after += BigInt(result.after);
        }
        assert.equal(before - burned, after);
        await query(`UPDATE mossvale_economy SET version=1,maintenance=false,admitted_backends='[]'::jsonb,exchange_enabled=false,migration=$1::jsonb WHERE singleton`,
          [JSON.stringify({ revision, at, accounts: rows.length, before: before.toString(), burned: burned.toString(), after: after.toString(), proof })]);
      } else assert(row.migration?.revision === revision && row.version === 1, 'Unexpected migration evidence');
    } else {
      assert(row.version === 1 && !row.maintenance && row.migration?.revision === revision, 'Migration must complete before exchange activation');
      assert(proof && proof.revision === revision && Array.isArray(proof.realms) && proof.realms.length === 3, 'All realm verification is required');
      assert.deepEqual(proof.realms.map(value => value.realm).sort(), ['asia', 'eu', 'us']);
      assert(proof.realms.every(value => value.revision === revision && value.economyVersion === 1 && value.assets > 0 && value.configPreserved === true && value.sockets === true), 'Every compatible realm must be verified');
      if (!row.exchange_enabled) await query('UPDATE mossvale_economy SET exchange_enabled=true,activation=$1::jsonb WHERE singleton', [JSON.stringify({ revision, at: Date.now(), proof })]);
    }
    await query("SELECT pg_notify('mossvale_economy_changed','changed')");
    await query('COMMIT');
    return { ...await readEconomy(query), migration: (await query('SELECT migration FROM mossvale_economy WHERE singleton')).rows[0].migration };
  } catch (error) { await query('ROLLBACK'); throw error; }
}

export function migrationConnection(connectionString, caBase64) {
  const url = new URL(connectionString);
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'A PostgreSQL connection URL is required');
  let ssl;
  if (caBase64) {
    const ca = Buffer.from(caBase64, 'base64').toString('utf8');
    assert(ca.includes('-----BEGIN CERTIFICATE-----'), 'A base64-encoded PEM certificate is required');
    // node-postgres otherwise replaces this explicit CA with SSL settings parsed from the URL.
    for (const key of ['sslcert', 'sslkey', 'sslrootcert', 'sslmode']) url.searchParams.delete(key);
    ssl = { ca, rejectUnauthorized: true };
  }
  return { connectionString: url.toString(), ssl, connectionTimeoutMillis: 10000 };
}

async function main() {
  const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
  const { action, revision, proof, connectionString, ca } = JSON.parse(Buffer.concat(chunks).toString());
  const client = new pg.Client(migrationConnection(connectionString, ca));
  try { await client.connect(); console.log(JSON.stringify(await economyOperation(client, action, revision, proof))); }
  finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Economy operation failed; inspect the retained private deployment evidence.'); process.exitCode = 1; });
