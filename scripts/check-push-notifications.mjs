import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createPushNotifications } from '../src/push-notifications.mjs';

const suffix = randomUUID().replaceAll('-', ''), schema = `push_${suffix}`, services = [], sent = [], receiptResults = {};
const hash = value => createHash('sha256').update(value).digest('hex'), account = hash('push-account'), other = hash('push-other');
const token = name => `ExpoPushToken[${name.padEnd(24, 'x')}]`, secret = hash('revoke'), prefs = { worldEvents: true, invites: true, reminders: true };
let container, admin, clock = Date.now(), active = [], failSend = false, ticketError, activityDuringDispatch = false, activityReads = 0;
const now = () => clock, day = 86400000;
const message = id => ({ id, title: 'Mossvale event', body: 'An adventure is ready.', expiresAt: clock + 60000 });
const registration = (name, preferences = prefs, revokeSecret = secret) => ({ token: token(name), platform: 'android', preferences, revokeSecret });
async function provider(url, options) {
  assert(url.startsWith('https://exp.host/--/api/v2/push/'));
  assert.equal(options.headers.Authorization, 'Bearer test-only-access-token');
  const body = JSON.parse(options.body);
  if (url.endsWith('getReceipts')) return { ok: true, json: async () => ({ data: Object.fromEntries(body.ids.filter(id => receiptResults[id]).map(id => [id, receiptResults[id]])) }) };
  if (failSend) throw Error('simulated provider outage');
  assert(body.length <= 100); sent.push(...body);
  return { ok: true, json: async () => ({ data: body.map(() => ticketError ? { status: 'error', details: { error: ticketError } } : { status: 'ok', id: randomUUID() }) }) };
}
try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    container = `mossvale-push-${suffix}`;
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only', '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
    connectionString = `postgresql://postgres:isolated-test-only@${execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim()}/postgres`;
  }
  const url = new URL(connectionString);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use disposable local PostgreSQL only.');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
    try { await admin.connect(); break; } catch (error) { await admin.end(); if (attempt > 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}; SET search_path=${schema};
    CREATE TABLE mossvale_players(account_key text PRIMARY KEY,state jsonb NOT NULL);
    CREATE TABLE mossvale_account_deletions(account_key text PRIMARY KEY);`);
  await admin.query('INSERT INTO mossvale_players VALUES($1,$3),($2,$3)', [account, other, { characters: [] }]);
  url.searchParams.set('options', `-c search_path=${schema}`);
  function service(realmId, enabled = true) {
    const instance = createPushNotifications({ connection: { connectionString: url.toString() }, realmId, enabled,
      accounts: () => activityDuringDispatch && ++activityReads > 1 ? [account] : active,
      accessToken: 'test-only-access-token', now, fetchFn: provider, automatic: false, sendIntervalMs: 0 });
    services.push(instance); return instance;
  }
  const eu = service('eu'), overlap = service('eu'), us = service('us'), disabled = service('eu', false);
  await Promise.all(services.map(instance => instance.start()));
  assert(eu.enabled); assert(!disabled.enabled);
  await assert.rejects(disabled.register(account, registration('phone')), { status: 503 });
  await assert.rejects(eu.register(account, registration('phone', { ...prefs, extra: true })), { status: 400 });
  await assert.rejects(eu.register(account, { ...registration('phone'), accountKey: other }), { status: 400 });
  await assert.rejects(eu.unregister({ token: token('phone'), revokeSecret: secret, accountKey: other }), { status: 400 });
  await assert.rejects(eu.register(account, { ...registration('phone'), token: 'https://evil.invalid' }), { status: 400 });
  await assert.rejects(eu.register(hash('missing'), registration('phone')), { status: 404 });
  await assert.rejects(eu.register(account, registration('phone'), () => false), { status: 401 });
  await admin.query('BEGIN'); await admin.query('SELECT 1 FROM mossvale_players WHERE account_key=$1 FOR UPDATE', [account]);
  let authenticated = true;
  const delayedAuth = eu.register(account, registration('expired-auth'), () => authenticated);
  const rejectedAuth = assert.rejects(delayedAuth, { status: 401 });
  await delay(20); authenticated = false; await admin.query('COMMIT'); await rejectedAuth;
  assert.deepEqual(await eu.register(account, registration('phone')), { registered: true, preferences: prefs });

  await Promise.all([eu.worldEvent(message('world-1')), overlap.worldEvent(message('world-1')), us.worldEvent(message('world-1'))]);
  assert.equal(sent.length, 1, 'A device receives the event once across simultaneous realm instances.');
  assert.deepEqual(sent[0].data, { category: 'worldEvents', eventId: 'world-1', realmId: 'eu', expiresAt: clock + 60000 });
  assert.equal(sent[0].channelId, 'mossvale'); assert.equal(sent[0].ttl, 60); assert.equal(sent[0].priority, 'high');
  clock += 5 * 60000 - 1; await eu.worldEvent(message('world-2')); assert.equal(sent.length, 1, 'Ordinary world events are capped at one per five minutes.');
  clock++; await eu.worldEvent(message('world-1')); assert.equal(sent.length, 1, 'Same event stays deduplicated after cooldown.');
  await eu.worldEvent(message('world-2')); assert.equal(sent.length, 2);
  await Promise.all([eu.worldEvent({ ...message('ic-registration'), urgent: true }), overlap.worldEvent({ ...message('ic-registration'), urgent: true })]);
  assert.equal(sent.length, 3, 'Time-sensitive Instant Combat signup bypasses a recent boss alert but still deduplicates.');
  await us.invite(account, message('invite-1'));
  assert.equal(sent.length, 4, 'An account-targeted invitation reaches a device last registered on another realm.');
  await Promise.all([eu.invite(account, message('invite-1')), overlap.invite(account, message('invite-2'))]);
  assert.equal(sent.length, 4, 'Cross-realm invitations share the durable event deduplication and ten-second cap.');
  await eu.invite(other, message('other')); assert.equal(sent.length, 4, 'Invites target only the intended account.');
  clock += 9999; await eu.invite(account, message('invite-3')); assert.equal(sent.length, 4);
  clock++; await eu.invite(account, message('invite-3')); assert.equal(sent.length, 5, 'Invites can resume after ten seconds.');
  clock += 10001; await eu.invite(account, { ...message('expired'), expiresAt: clock - 1 }); assert.equal(sent.length, 5);

  await eu.register(account, registration('phone', { worldEvents: false, invites: false, reminders: false }));
  clock += 4 * day; await eu.worldEvent(message('muted')); await eu.invite(account, message('muted')); await eu.pulse();
  assert.equal(sent.length, 5, 'Every category respects opt-out.');
  await eu.register(account, registration('phone'));
  clock += day - 1; await eu.pulse(); assert.equal(sent.length, 5, 'No reminder before 24 hours.');
  clock++; await Promise.all([eu.pulse(), overlap.pulse(), us.pulse()]); assert.equal(sent.length, 6);
  assert.equal(sent.at(-1).priority, 'default'); assert.equal(sent.at(-1).ttl, 4 * 3600, 'Return alerts expire after four hours.');
  clock += day - 1; await eu.pulse(); assert.equal(sent.length, 6, 'At least 24 hours must pass between reminders.');
  clock++; await Promise.all([eu.pulse(), overlap.pulse()]); assert.equal(sent.length, 7, 'An absent player gets at most one reminder each day across overlapping servers.');
  active = [account]; await us.pulse(); active = [];
  clock += day - 1; await eu.pulse(); assert.equal(sent.length, 7, 'Activity on another realm resets the 24-hour absence.');
  clock++; await eu.pulse(); assert.equal(sent.length, 8);
  active = [account]; clock += day; await disabled.pulse(); active = [];
  await eu.pulse(); assert.equal(sent.length, 8, 'Gameplay on a delivery-disabled realm resets reminders on enabled realms.');
  clock += day; activityDuringDispatch = true; activityReads = 0; await eu.pulse(); activityDuringDispatch = false;
  assert.equal(sent.length, 8, 'A player returning after the reminder claim is rechecked before provider delivery.');

  const newer = hash('new-secret'); await eu.register(account, registration('phone', prefs, newer));
  await disabled.unregister({ token: token('phone'), revokeSecret: secret });
  assert.equal((await admin.query('SELECT COUNT(*) FROM mossvale_push_devices')).rows[0].count, '1', 'Queued old logout cannot delete a new registration.');
  await disabled.unregister({ token: token('phone'), revokeSecret: newer });
  await disabled.unregister({ token: token('phone'), revokeSecret: newer });
  assert.equal((await admin.query('SELECT COUNT(*) FROM mossvale_push_devices')).rows[0].count, '0', 'Revocation works while delivery is disabled and is idempotent.');

  await disabled.unregister({ token: token('late'), revokeSecret: secret });
  await assert.rejects(eu.register(account, registration('late')), { status: 409 }, 'A revoke arriving before its delayed registration fences resurrection.');
  await eu.register(account, registration('late', prefs, newer));
  await disabled.unregister({ token: token('late'), revokeSecret: newer });
  await assert.rejects(eu.register(account, registration('phone')), { status: 409 });
  const movedSecret = hash('moved-secret');
  await eu.register(account, registration('phone', prefs, movedSecret)); await us.register(other, registration('phone', prefs, movedSecret));
  assert.equal((await admin.query('SELECT account_key FROM mossvale_push_devices')).rows[0].account_key, other, 'One token belongs only to the latest signed-in account.');
  const beforeMove = sent.length; await eu.invite(account, message('old-account')); assert.equal(sent.length, beforeMove);
  await Promise.all([eu.invite(other, message('moved')), us.invite(other, message('moved'))]);
  assert.equal(sent.length, beforeMove + 1, 'Concurrent realm controllers claim the same recipient invitation once.');
  const receipt = (await admin.query('SELECT * FROM mossvale_push_receipts')).rows[0];
  receiptResults[receipt.id] = { status: 'error', details: { error: 'DeviceNotRegistered' } };
  clock += 15 * 60000; await us.pulse();
  assert.equal((await admin.query('SELECT COUNT(*) FROM mossvale_push_devices')).rows[0].count, '0', 'Unregistered-device receipts prune tokens.');

  await eu.register(account, registration('stale-ticket')); ticketError = 'DeviceNotRegistered';
  await eu.worldEvent(message('stale-ticket')); ticketError = undefined;
  assert.equal((await admin.query('SELECT COUNT(*) FROM mossvale_push_devices')).rows[0].count, '0', 'Immediate stale-token tickets also prune tokens.');
  await eu.register(account, registration('old-receipt')); await eu.worldEvent(message('old-receipt'));
  const stale = (await admin.query('SELECT * FROM mossvale_push_receipts')).rows[0];
  receiptResults[stale.id] = { status: 'error', details: { error: 'DeviceNotRegistered' } };
  await eu.register(account, registration('old-receipt', prefs, newer)); clock += 15 * 60000; await eu.pulse();
  assert.equal((await admin.query('SELECT COUNT(*) FROM mossvale_push_devices')).rows[0].count, '1', 'Old receipts cannot prune a newer registration.');

  for (let i = 0; i < 4; i++) await eu.register(account, registration(`limit-${i}`));
  await assert.rejects(eu.register(account, registration('too-many')), { status: 429 });
  await eu.register(account, registration('limit-1', prefs, newer));
  await admin.query("UPDATE mossvale_players SET state=state || '{\"ban\":{}}' WHERE account_key=$1", [account]);
  const beforeBan = sent.length; clock += 3600001; await eu.worldEvent(message('banned')); assert.equal(sent.length, beforeBan);
  await assert.rejects(eu.register(account, registration('limit-1')), { status: 403 });
  await admin.query("UPDATE mossvale_players SET state=state-'ban' WHERE account_key=$1", [account]);
  failSend = true; await assert.rejects(eu.worldEvent(message('outage')), /simulated provider outage/); failSend = false;
  await eu.worldEvent(message('outage')); assert.equal(sent.length, beforeBan, 'An uncertain delivery is not duplicated.');
  await admin.query('INSERT INTO mossvale_account_deletions VALUES($1)', [account]);
  clock += 3600001; await eu.worldEvent(message('deleted')); await eu.pulse();
  assert.equal(sent.length, beforeBan); assert.equal((await admin.query('SELECT COUNT(*) FROM mossvale_push_devices')).rows[0].count, '0');
  await assert.rejects(eu.register(account, registration('phone')), { status: 409 });
  await eu.register(other, registration('cascade')); await admin.query('DELETE FROM mossvale_players WHERE account_key=$1', [other]);
  assert.equal((await admin.query('SELECT COUNT(*) FROM mossvale_push_devices')).rows[0].count, '0', 'Account deletion cascades token and receipt removal.');
  assert(Number((await admin.query('SELECT COUNT(*) FROM mossvale_push_revocations')).rows[0].count) > 0);
  await admin.query('DELETE FROM mossvale_account_deletions WHERE account_key=$1', [account]);
  await eu.register(account, registration('aged-token'));
  clock += 91 * day; await disabled.pulse();
  assert.equal((await admin.query('SELECT COUNT(*) FROM mossvale_push_devices')).rows[0].count, '0', 'Stale devices expire while delivery is disabled.');
  clock += day + 1; await disabled.pulse();
  assert.equal((await admin.query('SELECT COUNT(*) FROM mossvale_push_revocations')).rows[0].count, '0', 'Revocation hashes expire even while delivery is disabled.');
  await disabled.close(); await disabled.close();
  console.log('PASS mobile push: real PostgreSQL concurrent dedup/cooldowns, realm routing, consent, activity/reminders, private revocation, reassignment, receipts, limits, bans/deletion and provider outages.');
} finally {
  await Promise.allSettled(services.map(service => service.close()));
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {}); await admin.end(); }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
}
