import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createPlayerStore } from '../src/player-store.mjs';
import { localReports } from '../src/local-reports.mjs';

const schema = 'guard_reports_' + randomUUID().replaceAll('-', '');
const key = createHash('sha256').update(schema).digest('hex'), characterId = randomUUID(), stores = [];
const directory = mkdtempSync(join(tmpdir(), 'mossvale-report-audit-'));
let container, admin;
try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    container = 'mossvale-' + schema;
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only', '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
    connectionString = `postgresql://postgres:isolated-test-only@${execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim()}/postgres`;
  }
  const url = new URL(connectionString);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use disposable local PostgreSQL.');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString });
    try { await admin.connect(); break; } catch (error) { await admin.end(); if (attempt > 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const store = createPlayerStore({ connectionString: url.toString() }), other = createPlayerStore({ connectionString: url.toString() });
  stores.push(store, other);
  await store.start(); await other.start(); await store.claim(key);
  await store.commit([{ key, state: { characters: [{ id: characterId, gold: 0, auctions: [], auctionSales: [], friendIds: [], friendRequestIds: [], ignoreIds: [], treasureClaims: [] }] } }]);
  const now = Date.now(), report = { id: randomUUID(), source: 'guard', reporterAccount: key, targetAccount: key, targetId: characterId,
    targetName: 'Guard fixture', reason: 'Scripted actions', details: 'Initial evidence', createdAt: now, status: 'open', blockedUntil: now + 60000,
    securityEvidence: { version: 1, score: 65, threshold: 60, signals: [{ id: 'regular-timing', source: 'server', points: 65, summary: 'Accepted actions repeated at regular intervals.' }],
      server: { actionType: 'gather', startedAt: now - 300000, endedAt: now, intervals: 60, durationMs: 300000, meanIntervalMs: 5000, jitterRatio: .005 }, limitations: ['Timing does not prove botting.'] } };
  assert.equal(await store.guardBlockedUntil(key), 0);
  await store.addGuardReport(report);
  const results = await Promise.all([store.addGuardReport({ ...report, id: randomUUID(), createdAt: now + 1, blockedUntil: now + 90000 }),
    other.addGuardReport({ ...report, id: randomUUID(), createdAt: now + 2, details: 'Later evidence', blockedUntil: now + 1000 })]);
  assert(results.every(saved => saved.id === report.id && saved.createdAt === now));
  assert.equal((await store.listReports()).length, 1, 'concurrent realms coalesce one open report');
  assert.equal(await other.guardBlockedUntil(key), now + 90000, 'a later report cannot shorten a block');
  let claimMetadata;
  assert.equal(await other.claim(key, metadata => { claimMetadata = metadata; }), null, 'cooldown metadata never bypasses account ownership');
  assert.equal(claimMetadata, undefined, 'a rejected claim cannot report success metadata');
  await store.release(key);
  const claimed = await other.claim(key, metadata => { claimMetadata = metadata; });
  assert.deepEqual(claimMetadata, { guardBlockedUntil: now + 90000 }, 'a new realm reads the latest report in its claim query');
  assert.deepEqual(Object.keys(claimed), ['characters'], 'cooldown metadata never enters the account save');
  await other.release(key); await store.claim(key);
  const { source, blockedUntil, ...userReport } = report;
  await store.addReport({ ...userReport, id: randomUUID(), reason: 'Other' });
  await assert.rejects(store.addReport({ ...userReport, id: randomUUID() }), /one minute/, 'guard flags do not consume the separate user report throttle');
  const reviewed = await store.reviewReport(report.id, 'dismiss', 'Reviewed', { accountKey: key, characterId }, () => true);
  assert.deepEqual(reviewed.decisionEvidence.securityEvidence, report.securityEvidence);
  assert.equal(reviewed.decisionEvidence.score, 65); assert.equal(reviewed.decisionEvidence.decision, 'dismiss');
  assert.equal(reviewed.decisionEvidence.reviewerId, characterId); assert.equal(reviewed.decisionEvidence.resolution, 'Reviewed');
  assert.equal(reviewed.decisionEvidence.details, reviewed.details, 'decision uses the stored report, not a client override');
  assert(!(await store.listReports()).some(row => row.id === report.id), 'default inbox shows only open reports');
  assert.deepEqual((await other.listReports(true)).find(row => row.id === report.id), reviewed, 'history exposes persisted review evidence across realms');
  assert.equal(await other.guardBlockedUntil(key), now + 90000, 'dismissal does not bypass the temporary block');
  await store.claim(key, metadata => { claimMetadata = metadata; });
  assert.equal(claimMetadata.guardBlockedUntil, now + 90000, 'a repeated claim keeps the maximum even after report dismissal');
  const later = await other.addGuardReport({ ...report, id: randomUUID(), details: 'New observation', securityEvidence: { ...report.securityEvidence, score: 80 }, blockedUntil: now + 30000 });
  await store.addGuardReport({ ...report, id: randomUUID(), details: 'Updated new observation', securityEvidence: { ...report.securityEvidence, score: 90 } });
  assert.deepEqual((await store.listReports(true)).find(row => row.id === report.id), reviewed, 'later guard reports never rewrite a completed decision');
  const banned = await store.reviewReport(later.id, 'ban', 'GM confirmed repeated scripted actions.', { accountKey: 'c'.repeat(64), characterId }, () => true);
  assert.equal(banned.decisionEvidence.score, 90); assert.equal(banned.decisionEvidence.details, 'Updated new observation');
  assert.equal(banned.decisionEvidence.decision, 'ban'); assert.equal(banned.status, 'banned');
  assert.equal(banned.decisionEvidence.resolution, 'GM confirmed repeated scripted actions.');
  assert.deepEqual((await other.listReports(true)).find(row => row.id === later.id), banned);
  const local = localReports(directory), localInitial = local.addGuard(report);
  local.resolve(localInitial.id, 'banned', 'GM confirmed local scripted actions.', characterId);
  const localReviewed = localReports(directory).list(true)[0];
  assert.equal(local.list().length, 0); assert.equal(localReviewed.decisionEvidence.score, 65);
  assert.equal(localReviewed.decisionEvidence.decision, 'ban'); assert.equal(localReviewed.decisionEvidence.details, 'Initial evidence');
  local.addGuard({ ...report, id: randomUUID(), securityEvidence: { ...report.securityEvidence, score: 99 } });
  assert.deepEqual(localReports(directory).list(true).find(row => row.id === localInitial.id), localReviewed, 'local history snapshot survives later observations and restart');
  assert.equal(await store.guardBlockedUntil(key), now + 90000, 'new reports retain the maximum expiry across reviewed reports');
  await assert.rejects(store.addGuardReport({ ...report, source: 'player' }), /Invalid guard report/);
  await assert.rejects(store.addGuardReport({ ...report, reporterAccount: 'a'.repeat(64) }), /Invalid guard report/);
  await assert.rejects(store.addGuardReport({ ...report, reporterAccount: 'b'.repeat(64), targetAccount: 'b'.repeat(64) }), /no longer exists/);
  await store.requestDeletion(key, 'isolated-guard-subject', () => true);
  await assert.rejects(other.addGuardReport({ ...report, id: randomUUID() }), error => error.code === 'ACCOUNT_DELETING');
  console.log('Guard reports: PostgreSQL/local immutable decision evidence and history, concurrent deduplication, durable cooldowns, separate user throttle, input validation and deletion fencing passed.');
} finally {
  await Promise.all(stores.map(store => store.close()));
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
  rmSync(directory, { recursive: true, force: true });
}
