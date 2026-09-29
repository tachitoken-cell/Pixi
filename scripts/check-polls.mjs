import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { localPollStore } from '../src/poll-store.mjs';
import { createPlayerStore } from '../src/player-store.mjs';
import { POLLS, pollsValid, pollStatus, pollViews, pollAnswersValid } from '../src/polls.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-polls-')), realNow = Date.now, epoch = realNow();
let now = epoch, container, admin;
Date.now = () => now;
const stores = [], schema = 'polls_' + randomUUID().replaceAll('-', '');
const key = name => createHash('sha256').update(name).digest('hex');
const poll = { id: 'check-poll', title: 'Check poll', description: 'Test only.', opensAt: epoch, closesAt: epoch + 60000, questions: [{ id: 'first', text: 'First question?' }, { id: 'second', text: 'Second question?' }] };
const answers = { first: 'yes', second: 'skip' };
try {
  assert(pollsValid(POLLS));
  assert.equal(POLLS[0].title, 'Stake MOSS?');
  assert.equal(pollStatus(poll, epoch - 1), 'upcoming'); assert.equal(pollStatus(poll, epoch), 'open'); assert.equal(pollStatus(poll, poll.closesAt), 'closed');
  for (const bad of [{ first: 'yes' }, { ...answers, extra: 'yes' }, { ...answers, first: true }, ['yes', 'skip'], null]) assert(!pollAnswersValid(poll, bad));
  const exact = pollViews([poll], [], [{ pollId: poll.id, questionId: 'first', answer: 'yes', count: 7 }, { pollId: poll.id, questionId: 'first', answer: 'no', count: 3 }, { pollId: poll.id, questionId: 'first', answer: 'skip', count: 20 }], poll.closesAt)[0];
  assert.equal(exact.results.questions.first.approval, 70); assert.equal(exact.results.questions.first.passed, true); assert.equal(exact.results.ballots, 30);
  assert.equal(exact.results.questions.second.passed, false); assert.equal(exact.results.questions.second.approval, null);
  const below = pollViews([poll], [], [{ pollId: poll.id, questionId: 'first', answer: 'yes', count: 69 }, { pollId: poll.id, questionId: 'first', answer: 'no', count: 31 }], poll.closesAt)[0];
  assert.equal(below.results.questions.first.passed, false);
  let local = localPollStore(dir);
  assert.throws(() => local.submitPoll(key('a'), poll, answers, () => false), /Stand beside/);
  mkdirSync(join(dir, 'polls.json.tmp'));
  assert.throws(() => local.submitPoll(key('a'), poll, answers, () => true));
  assert.equal(local.readPolls(key('a'), [poll])[0].ballot, undefined, 'failed durable write grants no ballot');
  rmSync(join(dir, 'polls.json.tmp'), { recursive: true });
  local.submitPoll(key('a'), poll, answers, () => true);
  assert.throws(() => local.submitPoll(key('a'), poll, answers, () => true), /already voted/);
  assert.throws(() => local.submitPoll(key('b'), { ...poll, title: 'Changed after voting' }, answers, () => true), /changed/);
  assert.throws(() => local.readPolls(key('a'), [{ ...poll, closesAt: epoch + 1 }], epoch + 1), /changed/, 'changed catalog cannot expose results early');
  local = localPollStore(dir);
  assert.deepEqual(local.readPolls(key('a'), [poll])[0].ballot.answers, answers, 'restart retains immutable ballot');
  assert.equal(local.readPolls(key('b'), [poll])[0].ballot, undefined, 'other account has no ballot receipt');
  assert.equal(local.readPolls(key('a'), [poll])[0].results, undefined, 'open poll turnout stays hidden');
  now = poll.closesAt;
  assert.throws(() => local.submitPoll(key('b'), poll, answers, () => true), /not open/);
  assert.equal(local.readPolls(key('b'), [poll])[0].results.questions.first.yes, 1);
  assert.equal(JSON.parse(readFileSync(join(dir, 'polls.json'), 'utf8')).ballots.length, 1);
  if (process.argv.includes('--postgres')) {
    now = epoch;
    let connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      container = 'mossvale-' + schema;
      execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only', '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
      connectionString = `postgresql://postgres:isolated-test-only@${execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim()}/postgres`;
    }
    const url = new URL(connectionString);
    assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Checks only use disposable loopback PostgreSQL.');
    for (let attempt = 0; ; attempt++) {
      admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
      try { await admin.connect(); break; } catch (error) { await admin.end(); if (attempt > 100) throw error; await delay(100); }
    }
    await admin.query(`CREATE SCHEMA ${schema}`); url.searchParams.set('options', `-c search_path=${schema}`);
    const eu = createPlayerStore({ connectionString: url.toString() }), us = createPlayerStore({ connectionString: url.toString() }); stores.push(eu, us);
    await Promise.all([eu.start(), us.start()]); await eu.claim(key('a')); await us.claim(key('b'));
    const writes = await Promise.allSettled([eu.submitPoll(key('a'), poll, answers, () => true), eu.submitPoll(key('a'), poll, { first: 'no', second: 'yes' }, () => true), us.submitPoll(key('b'), poll, { first: 'no', second: 'skip' }, () => true)]);
    assert.deepEqual(writes.map(write => write.status), ['fulfilled', 'rejected', 'fulfilled']);
    assert.equal((await us.readPolls(key('b'), [poll]))[0].results, undefined);
    await eu.release(key('a')); await us.claim(key('a'));
    await assert.rejects(us.submitPoll(key('a'), poll, answers, () => true), /already voted/, 'realm transfer cannot vote twice');
    assert.deepEqual((await us.readPolls(key('a'), [poll]))[0].ballot.answers, answers);
    await assert.rejects(us.submitPoll(key('b'), { ...poll, title: 'Changed' }, answers, () => true), /changed/);
    await assert.rejects(us.readPolls(key('a'), [{ ...poll, closesAt: epoch + 1 }], epoch + 1), /changed/, 'mixed revision cannot publish early totals');
    await admin.query(`CREATE FUNCTION ${schema}.reject_test_ballot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected ballot write failure'; END; $$`);
    await admin.query(`CREATE TRIGGER reject_test_ballot BEFORE INSERT ON ${schema}.mossvale_poll_ballots FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_test_ballot()`);
    await us.claim(key('c'));
    await assert.rejects(us.submitPoll(key('c'), poll, answers, () => true), /Injected ballot/);
    assert.equal((await us.readPolls(key('c'), [poll]))[0].ballot, undefined, 'failed transaction has no receipt');
    await admin.query(`DROP TRIGGER reject_test_ballot ON ${schema}.mossvale_poll_ballots`);
    await us.submitPoll(key('c'), poll, { first: 'skip', second: 'skip' }, () => true);
    now = poll.closesAt;
    const closed = (await eu.readPolls(key('a'), [poll]))[0];
    assert.equal(closed.results.ballots, 3); assert.equal(closed.results.questions.first.approval, 50); assert.equal(closed.results.questions.first.passed, false);
    assert.equal(closed.results.questions.second.approval, null); assert.equal(closed.results.questions.second.skip, 3);
    await assert.rejects(us.submitPoll(key('b'), poll, answers, () => true), /not open/);
    assert.equal((await admin.query(`SELECT count(*)::integer AS count FROM ${schema}.mossvale_poll_ballots`)).rows[0].count, 3);
  }
  console.log('PASS polls: strict answers, dates, 70% threshold, Skip denominator, hidden open totals, account privacy, durable restart, immutable ballots and definitions, failed-write rollback' + (process.argv.includes('--postgres') ? ', real PostgreSQL concurrent writes and cross-realm uniqueness.' : '.'));
} finally {
  await Promise.allSettled(stores.map(store => store.close()));
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {}); await admin.end(); }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe' });
  Date.now = realNow; rmSync(dir, { recursive: true, force: true });
}
