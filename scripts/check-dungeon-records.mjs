import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { fileDungeonRecords } from '../src/dungeon-records.mjs';
import { createPlayerStore } from '../src/player-store.mjs';

const directory = mkdtempSync(join(tmpdir(), 'mossvale-dungeon-records-')), path = join(directory, 'records.json');
const schema = 'dungeon_records_' + randomUUID().replaceAll('-', ''), stores = [];
let container, admin;
const record = (id, fields = {}) => ({ id, dungeonId: 'rootvault', partySize: 1, durationMs: 65000, kills: 48, wipes: 0,
  completedAt: 1800000000000, realmId: 'eu', members: [{ id: 'hero', name: 'Hero', className: 'Knight', level: 12 }], ...fields });

async function check(store) {
  const input = record('first', { accountKey: 'private-account' }); input.members[0].accountKey = 'private-account'; input.session = input;
  const pending = store.record(input); input.durationMs = 1; input.members[0].name = 'Mutated';
  assert.equal(await pending, true);
  assert.equal(await store.record(record('first', { durationMs: 1 })), false, 'retries cannot rewrite a completed run');
  assert.deepEqual(await store.list('rootvault', 1), [record('first')], 'only immutable public fields are stored');
  await store.record(record('tie-b')); await store.record(record('tie-a'));
  await store.record(record('earlier', { completedAt: 1799999999999 }));
  await store.record(record('faster', { durationMs: 64000 }));
  await store.record(record('party', { partySize: 2, members: [record('x').members[0], { id: 'mage', name: 'Mage', className: 'Mage', level: 12 }] }));
  await store.record(record('other-dungeon', { dungeonId: 'cindercrypt' }));
  assert.deepEqual((await store.list('rootvault', 1)).map(row => row.id), ['faster', 'earlier', 'first', 'tie-a', 'tie-b']);
  assert.deepEqual((await store.list('rootvault', 2)).map(row => row.id), ['party']);
  assert.deepEqual((await store.list('cindercrypt', 1)).map(row => row.id), ['other-dungeon']);
  assert.deepEqual(await store.list('rootvault', 3), []);
  for (const fields of [{ id: '' }, { dungeonId: 'missing' }, { partySize: 0 }, { partySize: 5 }, { durationMs: 0 }, { durationMs: Infinity },
    { completedAt: 1 }, { kills: 0 }, { wipes: -1 }, { realmId: 'unknown' }, { members: [] },
    { members: [{ ...record('x').members[0], level: 0 }] }, { members: [{ ...record('x').members[0], className: 'Unknown' }] },
    { partySize: 2, members: [record('x').members[0], record('x').members[0]] }])
    await assert.rejects(async () => store.record(record('bad', fields)), /Invalid dungeon record/);
  for (const args of [['missing', 1], [undefined, 1], ['rootvault', 0], ['rootvault', 1.5], ['rootvault', 5]])
    await assert.rejects(async () => store.list(...args), /Invalid dungeon record/);
  for (let i = 0; i < 25; i++) await store.record(record(`slow-${i}`, { durationMs: 100000 + i }));
  const top = await store.list('rootvault', 1);
  assert.equal(top.length, 20); assert.equal(top.at(-1).id, 'slow-14');
  top[0].members[0].name = 'Changed result';
  assert.equal((await store.list('rootvault', 1))[0].members[0].name, 'Hero');
}

try {
  const local = fileDungeonRecords(path); await check(local);
  const before = readFileSync(path, 'utf8');
  mkdirSync(path + '.tmp');
  assert.throws(() => local.record(record('failed')));
  assert.equal(readFileSync(path, 'utf8'), before, 'failed writes preserve the prior save');
  assert.deepEqual(fileDungeonRecords(path).list('rootvault', 1), local.list('rootvault', 1), 'restart preserves records after a failed write');
  rmSync(path + '.tmp', { recursive: true });
  assert.equal(local.record(record('failed')), true, 'a failed write can be retried');
  const broken = join(directory, 'broken.json'); writeFileSync(broken, '[null]');
  assert.throws(() => fileDungeonRecords(broken), /Invalid dungeon record/);
  assert.equal(readFileSync(broken, 'utf8'), '[null]', 'corrupt saves are never replaced with an empty board');
  const interrupted = join(directory, 'interrupted.json'); writeFileSync(interrupted + '.tmp', '[]');
  assert.throws(() => fileDungeonRecords(interrupted), /Incomplete dungeon record save/);

  if (process.argv.includes('--postgres')) {
    let connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      container = 'mossvale-' + schema;
      execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only', '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
      connectionString = `postgresql://postgres:isolated-test-only@${execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim()}/postgres`;
    }
    const url = new URL(connectionString);
    assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use disposable loopback PostgreSQL for this check.');
    for (let attempt = 0; ; attempt++) {
      admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
      try { await admin.connect(); break; } catch (error) { await admin.end(); if (attempt > 100) throw error; await delay(100); }
    }
    await admin.query(`CREATE SCHEMA ${schema}`); url.searchParams.set('options', `-c search_path=${schema}`);
    const eu = createPlayerStore({ connectionString: url.toString() }), us = createPlayerStore({ connectionString: url.toString() }); stores.push(eu, us);
    await assert.rejects(eu.dungeonRecords.list('rootvault', 1), /not started/);
    await Promise.all([eu.start(), us.start()]); await check(eu.dungeonRecords);
    assert.deepEqual(await us.dungeonRecords.list('rootvault', 1), await eu.dungeonRecords.list('rootvault', 1), 'realms share one board');
    const duplicate = record('cross-realm', { dungeonId: 'veilhaven', durationMs: 10000 });
    assert.deepEqual((await Promise.all([eu.dungeonRecords.record(duplicate), us.dungeonRecords.record(duplicate)])).sort(), [false, true]);
    assert.equal((await us.dungeonRecords.list('veilhaven', 1)).length, 1, 'concurrent realm writes are idempotent');
    await admin.query(`CREATE FUNCTION ${schema}.reject_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected record failure'; END; $$`);
    await admin.query(`CREATE TRIGGER reject_record BEFORE INSERT ON ${schema}.mossvale_dungeon_records FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_record()`);
    await assert.rejects(us.dungeonRecords.record(record('database-failed', { dungeonId: 'nightroot' })), /Injected record failure/);
    assert.deepEqual(await eu.dungeonRecords.list('nightroot', 1), []);
    await admin.query(`DROP TRIGGER reject_record ON ${schema}.mossvale_dungeon_records`);
    assert.equal(await us.dungeonRecords.record(record('database-failed', { dungeonId: 'nightroot' })), true);
    await eu.close();
    const restarted = createPlayerStore({ connectionString: url.toString() }); stores.push(restarted); await restarted.start();
    assert.deepEqual(await restarted.dungeonRecords.list('veilhaven', 1), [duplicate], 'PostgreSQL records survive store restart');
  }
  console.log('PASS dungeon records: public projection, immutable retries, ties, top 20, dungeon/party separation, strict validation, durable restart, failed-write preservation'
    + (process.argv.includes('--postgres') ? ', real PostgreSQL cross-realm concurrency and failure recovery.' : '.'));
} finally {
  await Promise.allSettled(stores.map(store => store.close()));
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {}); await admin.end(); }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
}
