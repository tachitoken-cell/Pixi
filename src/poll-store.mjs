import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pollAnswersValid, pollsValid, pollStatus, pollViews } from './polls.ts';

const error = message => Object.assign(Error(message), { code: 'POLL_REJECTED' });
const accountValid = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
function validateVote(key, poll, answers, eligible) {
  if (!accountValid(key) || !pollsValid([poll]) || !pollAnswersValid(poll, answers)) throw error('Answer every question with Yes, No, or Skip.');
  if (pollStatus(poll) !== 'open') throw error('This poll is not open for voting.');
  if (!eligible()) throw error('Stand beside a polling booth to vote.');
}
const definitionError = () => error('This poll has changed. Please wait for the realm update before voting.');

export async function initializePollStore(query) {
  await query('CREATE TABLE IF NOT EXISTS mossvale_polls (id text PRIMARY KEY, definition jsonb NOT NULL)');
  await query(`CREATE TABLE IF NOT EXISTS mossvale_poll_ballots (poll_id text NOT NULL REFERENCES mossvale_polls(id), account_key text NOT NULL,
    answers jsonb NOT NULL, submitted_at bigint NOT NULL, PRIMARY KEY (poll_id, account_key))`);
}

export function postgresPollStore({ query, enqueue, transaction, requireStarted, owned, deletions }) {
  return {
    readPolls: (key, polls, now = Date.now()) => enqueue(async () => {
      requireStarted();
      if (!accountValid(key) || !pollsValid(polls)) throw error('Invalid poll request.');
      if (!polls.length) return [];
      const ids = polls.map(poll => poll.id), closed = polls.filter(poll => pollStatus(poll, now) === 'closed').map(poll => poll.id);
      const definitions = (await query('SELECT id, definition FROM mossvale_polls WHERE id=ANY($1::text[])', [ids])).rows;
      if (definitions.some(row => !isDeepStrictEqual(row.definition, polls.find(poll => poll.id === row.id)))) throw definitionError();
      const own = (await query('SELECT poll_id AS "pollId", account_key AS "accountKey", answers, submitted_at AS "submittedAt" FROM mossvale_poll_ballots WHERE account_key=$1 AND poll_id=ANY($2::text[])', [key, ids])).rows.map(row => ({ ...row, submittedAt: Number(row.submittedAt) }));
      const counts = closed.length ? (await query(`SELECT poll_id AS "pollId", answer.key AS "questionId", answer.value AS answer, count(*)::integer AS count
        FROM mossvale_poll_ballots, jsonb_each_text(answers) answer WHERE poll_id=ANY($1::text[]) GROUP BY poll_id, answer.key, answer.value`, [closed])).rows : [];
      return pollViews(polls, own, counts, now);
    }),
    submitPoll: (key, poll, answers, eligible) => {
      const ballot = structuredClone(answers), definition = structuredClone(poll);
      return enqueue(async () => {
        requireStarted();
        validateVote(key, definition, ballot, eligible);
        if (!owned.has(key) || deletions.isDeleting(key)) throw error('Reconnect before submitting your vote.');
        return transaction(async () => {
          await query('INSERT INTO mossvale_polls(id,definition) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING', [definition.id, JSON.stringify(definition)]);
          const saved = (await query('SELECT definition FROM mossvale_polls WHERE id=$1', [definition.id])).rows[0].definition;
          if (!isDeepStrictEqual(saved, definition)) throw definitionError();
          validateVote(key, definition, ballot, eligible);
          const submittedAt = Date.now();
          const inserted = await query(`INSERT INTO mossvale_poll_ballots(poll_id,account_key,answers,submitted_at) VALUES($1,$2,$3::jsonb,$4)
            ON CONFLICT DO NOTHING RETURNING poll_id`, [definition.id, key, JSON.stringify(ballot), submittedAt]);
          if (!inserted.rows.length) throw error('Your account has already voted in this poll.');
          return { answers: ballot, submittedAt };
        });
      });
    },
  };
}

export function localPollStore(directory) {
  const path = join(directory, 'polls.json');
  if (!existsSync(path) && existsSync(path + '.tmp')) throw Error('Incomplete poll save found; refusing to overwrite it.');
  const read = () => {
    const data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { definitions: [], ballots: [] };
    if (!data || !pollsValid(data.definitions) || !Array.isArray(data.ballots)
      || new Set(data.ballots.map(row => row?.pollId + ':' + row?.accountKey)).size !== data.ballots.length
      || data.ballots.some(row => !row || !accountValid(row.accountKey) || !Number.isSafeInteger(row.submittedAt)
        || !data.definitions.some(poll => poll.id === row.pollId && pollAnswersValid(poll, row.answers) && row.submittedAt >= poll.opensAt && row.submittedAt < poll.closesAt))) throw Error('Invalid poll save; refusing to overwrite it.');
    return data;
  };
  read();
  return {
    readPolls(key, polls, now = Date.now()) {
      if (!accountValid(key) || !pollsValid(polls)) throw error('Invalid poll request.');
      const { definitions, ballots } = read(), closed = new Set(polls.filter(poll => pollStatus(poll, now) === 'closed').map(poll => poll.id));
      if (polls.some(poll => definitions.some(saved => saved.id === poll.id && !isDeepStrictEqual(saved, poll)))) throw definitionError();
      const counts = ballots.filter(row => closed.has(row.pollId)).flatMap(row => Object.entries(row.answers).map(([questionId, answer]) => ({ pollId: row.pollId, questionId, answer, count: 1 })));
      return pollViews(polls, ballots.filter(row => row.accountKey === key), counts, now);
    },
    submitPoll(key, poll, answers, eligible) {
      validateVote(key, poll, answers, eligible);
      const data = read(), saved = data.definitions.find(item => item.id === poll.id);
      if (saved && !isDeepStrictEqual(saved, poll)) throw definitionError();
      if (data.ballots.some(row => row.accountKey === key && row.pollId === poll.id)) throw error('Your account has already voted in this poll.');
      if (!saved) data.definitions.push(structuredClone(poll));
      validateVote(key, poll, answers, eligible);
      const ballot = { answers: structuredClone(answers), submittedAt: Date.now() };
      data.ballots.push({ ...ballot, pollId: poll.id, accountKey: key });
      mkdirSync(directory, { recursive: true });
      writeFileSync(path + '.tmp', JSON.stringify(data), { mode: 0o600 });
      const fd = openSync(path + '.tmp', 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(path + '.tmp', path);
      const dir = openSync(directory, 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
      return ballot;
    },
  };
}
