import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { economyOperation, initializeEconomy, migrationConnection, resetAccountGold, validateBarrierProof } from '../src/gold-migration.mjs';

const caPem = '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----';
const caBase64 = Buffer.from(caPem).toString('base64');
for (const scheme of ['postgres', 'postgresql']) {
  const config = migrationConnection(`${scheme}://user:local-only@localhost/db?sslmode=no-verify&sslrootcert=/wrong-ca&sslcert=/wrong-cert&sslkey=/wrong-key&application_name=gold-check`, caBase64);
  const url = new URL(config.connectionString);
  for (const key of ['sslcert', 'sslkey', 'sslrootcert', 'sslmode']) assert(!url.searchParams.has(key));
  assert.equal(url.searchParams.get('application_name'), 'gold-check');
  assert.deepEqual(new pg.Client(config).connectionParameters.ssl, { ca: caPem, rejectUnauthorized: true }, 'the pg parser retains the exact CA and hostname verification');
}
assert.throws(() => migrationConnection('https://localhost/db', caBase64));
assert.throws(() => migrationConnection('postgresql://localhost/db', Buffer.from('invalid').toString('base64')));
assert.equal(new URL(migrationConnection('postgresql://localhost/db?sslmode=require').connectionString).searchParams.get('sslmode'), 'require', 'without a supplied CA, preserve the game writer URL policy');

const account = amounts => ({ characters: amounts.map(gold => ({ id: randomUUID(), gold, auctions: [] })) });
for (const amount of [0, 1, 99, 100, 101, 109, 110, 111, 1000, Number.MAX_SAFE_INTEGER]) {
  const result = resetAccountGold(account([amount]));
  const expected = BigInt(Math.max(0, amount - 100)) * 9n / 10n;
  assert.equal(BigInt(result.burned), expected); assert.equal(BigInt(result.after), BigInt(amount) - expected);
}
const equal = resetAccountGold(account([100, 100, 100]));
assert.deepEqual(equal.state.characters.map(player => player.gold), [40, 40, 40]);
const ties = resetAccountGold(account([101, 101, 101]));
assert.deepEqual(ties.state.characters.map(player => player.gold), [41, 40, 40], 'roster order resolves equal remainders');
const credits = account([0, 100]);
assert.equal(resetAccountGold(credits, { [credits.characters[0].id]: 100 }).after, '110');
assert.throws(() => resetAccountGold(credits, { missing: 100 }));
assert.throws(() => resetAccountGold(account([-1])));
assert.equal(resetAccountGold(account([])).after, '0');
const wide = resetAccountGold(account(Array(6).fill(Number.MAX_SAFE_INTEGER)));
assert(BigInt(wide.before) > BigInt(Number.MAX_SAFE_INTEGER));
assert.equal(BigInt(wide.before), BigInt(wide.after) + BigInt(wide.burned));

const revision = 'a'.repeat(40), oldRevision = 'b'.repeat(40), now = Date.now();
const proof = { revision, realms: Object.fromEntries(['eu', 'us', 'asia'].map(realm => [realm,
  { realm, revision: oldRevision, targetRevision: revision, instanceId: realm + '-old', finalSave: true,
    ...(realm === 'eu' ? { admissionHeld: true } : { restartHeld: true }), drainedAt: now - 1000 }])),
  backup: { sha256: 'f'.repeat(64), bytes: 12345, at: now } };
validateBarrierProof(proof, revision);
assert.throws(() => validateBarrierProof({ ...proof, backup: { ...proof.backup, at: now - 2000 } }, revision));
assert.throws(() => validateBarrierProof({ ...proof, realms: { eu: proof.realms.eu, us: proof.realms.us } }, revision));

let container;
const clients = [], schema = 'gold_migration_' + randomUUID().replaceAll('-', '');
let connectionString = process.env.TEST_DATABASE_URL, admin;
try {
  if (!connectionString) {
    container = 'mossvale-gold-migration-' + randomUUID().slice(0, 8);
    execFileSync('docker', ['run', '-d', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=isolated-test-only', '-p', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
    connectionString = 'postgresql://postgres:isolated-test-only@' + execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim() + '/postgres';
  }
  const url = new URL(connectionString);
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Use only disposable local PostgreSQL');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
    try { await admin.connect(); break; } catch (error) { await admin.end(); if (attempt > 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  async function connect(epoch) {
    const client = new pg.Client({ connectionString: url.toString() }); await client.connect(); clients.push(client);
    if (epoch !== undefined) await client.query("SELECT set_config('mossvale.economy_supported','1',false),set_config('mossvale.economy_epoch',$1,false)", [String(epoch)]);
    return client;
  }
  const migration = await connect(), old = await connect(), compatible = await connect(0);
  await migration.query("CREATE TABLE mossvale_players(account_key text PRIMARY KEY,state jsonb NOT NULL,pending_credits jsonb NOT NULL DEFAULT '{}')");
  await initializeEconomy(migration.query.bind(migration));
  const accounts = [account([99]), account([400, 400]), account([0, 0]), account([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])];
  for (const [index, state] of accounts.entries()) await old.query('INSERT INTO mossvale_players VALUES($1,$2::jsonb,$3::jsonb)', [String(index), JSON.stringify(state), JSON.stringify(index === 2 ? { [state.characters[1].id]: 1000 } : {})]);
  // A caller with another search_path must still find the trigger's own metadata.
  await admin.query(`UPDATE ${schema}.mossvale_players SET state=state WHERE account_key='0'`);
  const armed = await economyOperation(migration, 'arm', revision);
  assert(armed.maintenance && armed.version === 0 && !armed.exchangeEnabled);
  await compatible.query("UPDATE mossvale_players SET state=state WHERE account_key='0'");
  await old.query("UPDATE mossvale_players SET state=state WHERE account_key='0'");
  const late = await connect(0);
  await assert.rejects(late.query("UPDATE mossvale_players SET state=state WHERE account_key='0'"), /maintenance rejects a new writer/);
  await assert.rejects(economyOperation(migration, 'arm', 'c'.repeat(40)), /Another revision/);
  // Fail after an earlier account was changed; reset rows/events and every balance must roll back.
  await old.query("UPDATE mossvale_players SET state=jsonb_set(state,'{characters,0,gold}','-1') WHERE account_key='1'");
  await assert.rejects(economyOperation(migration, 'migrate', revision, proof), /Invalid gold balance/);
  assert.equal((await migration.query('SELECT count(*)::int AS n FROM mossvale_gold_reset')).rows[0].n, 0);
  assert.equal((await migration.query('SELECT count(*)::int AS n FROM mossvale_gold_events')).rows[0].n, 0);
  assert.equal((await economyOperation(migration, 'status', revision)).version, 0);
  await old.query("UPDATE mossvale_players SET state=jsonb_set(state,'{characters,0,gold}','400') WHERE account_key='1'");
  const completed = await economyOperation(migration, 'migrate', revision, proof);
  assert(completed.version === 1 && !completed.maintenance && !completed.exchangeEnabled);
  const rows = (await migration.query('SELECT * FROM mossvale_players ORDER BY account_key')).rows;
  assert.deepEqual(rows.map(row => row.state.characters.map(player => player.gold)), [[99], [85, 85], [0, 190], resetAccountGold(accounts[3]).state.characters.map(player => player.gold)]);
  assert(rows.every(row => Object.keys(row.pending_credits).length === 0));
  const sum = (await migration.query('SELECT SUM(burned)::text AS burned FROM mossvale_gold_events')).rows[0].burned;
  assert.equal(sum, completed.migration.burned);
  for (const writer of [old, compatible, late]) await assert.rejects(writer.query("UPDATE mossvale_players SET state=state WHERE account_key='0'"), /writer epoch changed/);
  const fresh = await connect(1);
  await fresh.query("UPDATE mossvale_players SET state=jsonb_set(state,'{characters,0,gold}','500') WHERE account_key='0'");
  await economyOperation(migration, 'migrate', revision, proof);
  assert.equal((await fresh.query("SELECT state->'characters'->0->>'gold' AS gold FROM mossvale_players WHERE account_key='0'")).rows[0].gold, '500', 'retry cannot burn later earnings');
  const verified = { revision, realms: ['eu', 'us', 'asia'].map(realm => ({ realm, revision, economyVersion: 1, assets: 12, configPreserved: true, sockets: true })) };
  await assert.rejects(economyOperation(migration, 'enable', revision, { ...verified, realms: verified.realms.slice(1) }), /All realm/);
  assert.equal((await economyOperation(migration, 'enable', revision, verified)).exchangeEnabled, true);
  assert.equal((await economyOperation(migration, 'enable', revision, verified)).exchangeEnabled, true);
  console.log('PASS gold migration: exact account allowance/largest remainders, credits, wide arithmetic, transactional failure/retry, old/new-session fence, schema-safe trigger, and verified activation.');
} finally {
  for (const client of clients) await client.end().catch(() => {});
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {}); await admin.end(); }
  if (container) execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}
