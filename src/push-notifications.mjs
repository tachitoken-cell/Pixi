import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const MINUTE = 60000, DAY = 86400000;
const keyValid = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
const tokenValid = token => typeof token === 'string' && /^(?:Expo|Exponent)PushToken\[[\w-]{10,200}\]$/.test(token);
const digest = secret => createHash('sha256').update(secret).digest('hex');
const tokenLock = token => createHash('sha256').update(`mossvale-push:${token}`).digest().readBigInt64BE().toString();
const revocationId = input => digest(`${input.token}\n${input.revokeSecret}`);
const fail = (status, message) => { throw Object.assign(Error(message), { status }); };
const categories = ['worldEvents', 'invites', 'reminders'];
const preferencesValid = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 3 && categories.every(key => typeof value[key] === 'boolean');
const validMessage = value => value && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200
  && ['title', 'body'].every(key => typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 200 && !/[\u0000-\u001f\u007f]/.test(value[key]))
  && Number.isSafeInteger(value.expiresAt) && value.expiresAt > 0;

// Push uses its own pool: provider and notification-storage failures cannot interrupt player saves.
export function createPushNotifications({ connection, realmId, accounts = () => [], enabled = process.env.MOBILE_PUSH_ENABLED === '1',
  accessToken = process.env.EXPO_ACCESS_TOKEN || '', fetchFn = fetch, now = Date.now, automatic = true, sendIntervalMs = 1000 } = {}) {
  const configured = !!connection?.connectionString;
  if (!['eu', 'us', 'asia'].includes(realmId)) throw Error('Invalid push notification realm.');
  const pool = configured ? new pg.Pool({ ...connection, max: 2, connectionTimeoutMillis: 3000, statement_timeout: 10000, query_timeout: 12000 }) : null;
  let ready = false, starting, closing = false, closingTask, timer, pulsing, sending = Promise.resolve(), lastSendAt = 0, lastWarningAt = -Infinity;
  function warn(error) {
    if (now() - lastWarningAt < MINUTE) return;
    lastWarningAt = now();
    const code = /^[A-Z0-9_]{3,40}$/.test(error?.code || '') ? error.code : 'UNAVAILABLE';
    console.error(`Mobile push delivery unavailable (${code}); gameplay continues.`);
  }
  pool?.on('error', warn);
  const available = () => enabled && configured && ready && !closing;
  async function initialize() {
    if (!configured || closing || ready) return;
    if (starting) return starting;
    starting = (async () => {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        await db.query('SELECT pg_advisory_xact_lock(718932146080)');
        await db.query(`CREATE TABLE IF NOT EXISTS mossvale_push_devices (
          token text PRIMARY KEY, account_key text NOT NULL REFERENCES mossvale_players(account_key) ON DELETE CASCADE,
          platform text NOT NULL CHECK (platform IN ('ios','android')), realm_id text NOT NULL CHECK (realm_id IN ('eu','us','asia')),
          preferences jsonb NOT NULL, revocation_hash text NOT NULL, updated_at bigint NOT NULL, last_active_at bigint NOT NULL,
          last_world_at bigint NOT NULL DEFAULT 0, last_world_id text, last_invite_at bigint NOT NULL DEFAULT 0,
          last_invite_id text, last_reminder_at bigint NOT NULL DEFAULT 0);
          CREATE INDEX IF NOT EXISTS mossvale_push_devices_account ON mossvale_push_devices(account_key);
          CREATE TABLE IF NOT EXISTS mossvale_push_receipts (
            id text PRIMARY KEY, token text NOT NULL REFERENCES mossvale_push_devices(token) ON DELETE CASCADE,
            revocation_hash text NOT NULL, created_at bigint NOT NULL);
          CREATE INDEX IF NOT EXISTS mossvale_push_receipts_created ON mossvale_push_receipts(created_at);
          CREATE TABLE IF NOT EXISTS mossvale_push_revocations (id text PRIMARY KEY, created_at bigint NOT NULL);`);
        await db.query('COMMIT'); ready = true;
      } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
      finally { db.release(); }
    })().finally(() => { starting = null; });
    return starting;
  }
  async function post(path, body, expiresAt) {
    const wait = lastSendAt + sendIntervalMs - Date.now();
    if (wait > 0) await delay(wait);
    if (closing || expiresAt !== undefined && expiresAt <= now()) return null;
    if (expiresAt !== undefined) for (const entry of body) entry.ttl = Math.max(1, Math.ceil((expiresAt - now()) / 1000));
    lastSendAt = Date.now();
    const response = await fetchFn(`https://exp.host/--/api/v2/push/${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Object.assign(Error('Push provider rejected request.'), { code: `HTTP_${response.status}` });
    const result = await response.json();
    if (result.errors?.length || !result.data) throw Error('Invalid push provider response.');
    return result.data;
  }
  function serialize(operation) {
    const pending = sending.then(() => closing ? undefined : operation());
    sending = pending.catch(warn);
    return pending;
  }
  async function removeExpiredToken(row) {
    await pool.query('DELETE FROM mossvale_push_devices WHERE token=$1 AND revocation_hash=$2', [row.token, row.revocation_hash]);
  }
  async function deliver(rows, category, message) {
    // ponytail: one send attempt per claimed event; add a durable retry queue only if missed optional alerts justify duplicate-delivery handling.
    for (let offset = 0; offset < rows.length && !closing && message.expiresAt > now(); offset += 100) {
      if (category === 'reminders') await observe(accounts());
      const candidates = rows.slice(offset, offset + 100);
      const live = (await pool.query(`SELECT d.token,d.revocation_hash FROM mossvale_push_devices d
        JOIN mossvale_players p USING(account_key) WHERE d.token=ANY($1::text[]) AND d.preferences->>$2='true'
        AND ($2='invites' OR d.realm_id=$3) AND NOT p.state ? 'ban' AND ($2<>'reminders' OR d.last_active_at <= $4)
        AND NOT EXISTS (SELECT 1 FROM mossvale_account_deletions a WHERE a.account_key=d.account_key)`,
      [candidates.map(row => row.token), category, realmId, now() - DAY])).rows;
      const batch = candidates.filter(row => live.some(current => current.token === row.token && current.revocation_hash === row.revocation_hash));
      if (!batch.length || message.expiresAt <= now()) continue;
      const tickets = await post('send', batch.map(row => ({ to: row.token, title: message.title, body: message.body, sound: 'default',
        channelId: 'mossvale', priority: category === 'reminders' ? 'default' : 'high', ttl: Math.max(1, Math.ceil((message.expiresAt - now()) / 1000)),
        data: { category, eventId: message.id, realmId, expiresAt: message.expiresAt } })), message.expiresAt);
      if (!tickets) return;
      if (!Array.isArray(tickets) || tickets.length !== batch.length) throw Error('Invalid push tickets.');
      for (let index = 0; index < tickets.length; index++) {
        const ticket = tickets[index], row = batch[index];
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') await removeExpiredToken(row);
        else if (ticket.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length <= 200) {
          await pool.query(`INSERT INTO mossvale_push_receipts(id,token,revocation_hash,created_at)
            SELECT $1,token,revocation_hash,$4 FROM mossvale_push_devices WHERE token=$2 AND revocation_hash=$3 ON CONFLICT DO NOTHING`,
          [ticket.id, row.token, row.revocation_hash, now()]);
        } else warn({ code: ticket.details?.error });
      }
    }
  }
  async function notify(category, accountKey, message) {
    if (!available()) return;
    if (!validMessage(message) || accountKey !== null && !keyValid(accountKey)) throw Error('Invalid push event.');
    if (message.expiresAt <= now()) return;
    return serialize(async () => {
      if (message.expiresAt <= now()) return;
      const world = category === 'worldEvents', at = now();
      const prefix = world ? 'world' : 'invite', cooldown = world ? 5 * MINUTE : 10000;
      const rows = (await pool.query(`UPDATE mossvale_push_devices d SET last_${prefix}_at=$1,last_${prefix}_id=$2
        FROM mossvale_players p WHERE p.account_key=d.account_key AND ($4='invites' OR d.realm_id=$3) AND d.preferences->>$4='true'
        AND ($5::text IS NULL OR d.account_key=$5) AND (d.last_${prefix}_at <= $6 OR $7) AND d.last_${prefix}_id IS DISTINCT FROM $2
        AND NOT p.state ? 'ban' AND NOT EXISTS (SELECT 1 FROM mossvale_account_deletions a WHERE a.account_key=d.account_key)
        RETURNING d.token,d.revocation_hash`, [at, message.id, realmId, category, accountKey, at - cooldown, world && message.urgent === true])).rows;
      await deliver(rows, category, message);
    });
  }
  async function observe(keys) {
    if (!configured || !ready || closing) return;
    const valid = [...new Set(keys)].filter(keyValid);
    if (valid.length) await pool.query('UPDATE mossvale_push_devices SET last_active_at=GREATEST(last_active_at,$2) WHERE account_key=ANY($1::text[])', [valid, now()]);
  }
  async function receipts() {
    const rows = (await pool.query('SELECT * FROM mossvale_push_receipts WHERE created_at <= $1 ORDER BY created_at LIMIT 1000', [now() - 15 * MINUTE])).rows;
    if (!rows.length) return;
    const result = await post('getReceipts', { ids: rows.map(row => row.id) });
    if (!result) return;
    const complete = [];
    for (const row of rows) {
      const receipt = result[row.id];
      if (receipt?.status === 'error') {
        if (receipt.details?.error === 'DeviceNotRegistered') await removeExpiredToken(row);
        else warn({ code: receipt.details?.error });
      }
      if (receipt || Number(row.created_at) < now() - DAY) complete.push(row.id);
    }
    if (complete.length) await pool.query('DELETE FROM mossvale_push_receipts WHERE id=ANY($1::text[])', [complete]);
  }
  async function pulse() {
    if (!configured || closing) return;
    if (pulsing) return pulsing;
    pulsing = (async () => {
      await initialize();
      await pool.query('DELETE FROM mossvale_push_revocations WHERE created_at < $1', [now() - DAY]);
      await observe(accounts());
      await pool.query(`DELETE FROM mossvale_push_devices d WHERE updated_at < $1
        OR EXISTS (SELECT 1 FROM mossvale_account_deletions a WHERE a.account_key=d.account_key)`, [now() - 90 * DAY]);
      if (!enabled) return;
      return serialize(async () => {
        await receipts();
        const at = now();
        const rows = (await pool.query(`UPDATE mossvale_push_devices d SET last_reminder_at=$1 FROM mossvale_players p
          WHERE p.account_key=d.account_key AND d.realm_id=$2 AND d.preferences->>'reminders'='true'
          AND d.last_active_at <= $3 AND d.last_reminder_at <= $3 AND NOT p.state ? 'ban'
          AND NOT EXISTS (SELECT 1 FROM mossvale_account_deletions a WHERE a.account_key=d.account_key)
          RETURNING d.token,d.revocation_hash`, [at, realmId, at - DAY])).rows;
        await deliver(rows, 'reminders', { id: `return:${at}`, title: 'Your next adventure awaits',
          body: 'Come back to Mossvale and continue your adventure.', expiresAt: at + 4 * 3600000 });
      });
    })().finally(() => { pulsing = null; });
    return pulsing;
  }
  return {
    get enabled() { return available(); },
    async start() {
      if (!configured || closing) return;
      try { await initialize(); } catch (error) { warn(error); }
      if (automatic && !timer) { timer = setInterval(() => { void pulse().catch(warn); }, MINUTE); timer.unref(); }
    },
    close() { return closingTask ||= (async () => { closing = true; clearInterval(timer); await Promise.allSettled([starting, pulsing, sending]); await pool?.end(); })(); },
    async register(accountKey, input, authorized = () => true) {
      if (!available()) fail(503, 'Mobile notifications are not available yet.');
      if (!keyValid(accountKey) || !input || Object.keys(input).some(key => !['token', 'platform', 'preferences', 'revokeSecret'].includes(key))
        || !tokenValid(input.token) || !['ios', 'android'].includes(input.platform)
        || !preferencesValid(input.preferences) || !keyValid(input.revokeSecret)) fail(400, 'Invalid mobile notification registration.');
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [tokenLock(input.token)]);
        if ((await db.query('SELECT 1 FROM mossvale_push_revocations WHERE id=$1', [revocationId(input)])).rows.length)
          fail(409, 'This notification registration was cancelled. Enable notifications again.');
        const account = (await db.query('SELECT state FROM mossvale_players WHERE account_key=$1 FOR UPDATE', [accountKey])).rows[0];
        if (!authorized()) fail(401, 'Sign in again to enable notifications.');
        if (!account) fail(404, 'Enter the game before enabling notifications.');
        if (account.state.ban) fail(403, 'This account is banned.');
        if ((await db.query('SELECT 1 FROM mossvale_account_deletions WHERE account_key=$1', [accountKey])).rows.length) fail(409, 'This account is being deleted.');
        const count = (await db.query('SELECT COUNT(*) FROM mossvale_push_devices WHERE account_key=$1 AND token<>$2', [accountKey, input.token])).rows[0].count;
        if (Number(count) >= 5) fail(429, 'Notifications are already enabled on five devices.');
        await db.query(`INSERT INTO mossvale_push_devices(token,account_key,platform,realm_id,preferences,revocation_hash,updated_at,last_active_at)
          VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$7) ON CONFLICT(token) DO UPDATE SET account_key=EXCLUDED.account_key,
          platform=EXCLUDED.platform,realm_id=EXCLUDED.realm_id,preferences=EXCLUDED.preferences,revocation_hash=EXCLUDED.revocation_hash,
          updated_at=EXCLUDED.updated_at,last_active_at=EXCLUDED.last_active_at`,
        [input.token, accountKey, input.platform, realmId, JSON.stringify(input.preferences), digest(input.revokeSecret), now()]);
        if (!authorized()) fail(401, 'Sign in again to enable notifications.');
        await db.query('COMMIT');
        return { registered: true, preferences: { ...input.preferences } };
      } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
      finally { db.release(); }
    },
    async unregister(input) {
      if (!configured || !ready || closing) fail(503, 'Mobile notifications are not available yet.');
      if (!input || Object.keys(input).some(key => !['token', 'revokeSecret'].includes(key))
        || !tokenValid(input.token) || !keyValid(input.revokeSecret)) fail(400, 'Invalid mobile notification removal.');
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [tokenLock(input.token)]);
        // A timed-out registration may still be running. Fence even an unseen capability before acknowledging logout.
        await db.query('INSERT INTO mossvale_push_revocations VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET created_at=EXCLUDED.created_at', [revocationId(input), now()]);
        await db.query('DELETE FROM mossvale_push_devices WHERE token=$1 AND revocation_hash=$2', [input.token, digest(input.revokeSecret)]);
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
      finally { db.release(); }
      return { registered: false };
    },
    worldEvent: message => notify('worldEvents', null, message),
    invite: (accountKey, message) => notify('invites', accountKey, message),
    observe, pulse,
  };
}
