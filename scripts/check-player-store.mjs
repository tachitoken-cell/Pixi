import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createPlayerStore } from '../src/player-store.mjs';

const suffix = randomUUID().replaceAll('-', ''), schema = `player_store_${suffix}`;
let container, admin;
const stores = [];
const copy = value => structuredClone(value);
const key = name => createHash('sha256').update(`${schema}:${name}`).digest('hex');
const account = (id, gold) => ({ characters: [{ id, name: id, level: 1, gold, inventory: { wood: 3 }, auctions: [], auctionSales: [], friendIds: [], friendRequestIds: [], ignoreIds: [], arenaWagers: [] }] });
const change = (state, fields) => { const result = copy(state); Object.assign(result.characters[0], fields); return result; };
const isConflict = error => error.code === 'PLAYER_STORE_CONFLICT';

try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    container = `mossvale-player-store-${suffix}`;
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only', '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
    const address = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim();
    connectionString = `postgresql://postgres:isolated-test-only@${address}/postgres`;
  }
  const url = new URL(connectionString);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a disposable local PostgreSQL instance for this check.');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
    try { await admin.connect(); break; }
    catch (error) { await admin.end(); if (attempt >= 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const fatalCalls = [], changes = { eu: [], us: [] };
  function makeStore(name) {
    const address = new URL(url);
    address.searchParams.set('application_name', `${schema}_${name}`);
    const store = createPlayerStore({ connectionString: address.toString(), onFatal: error => fatalCalls.push({ name, error }), onChange: id => changes[name].push(id), migrate(state) {
      if (!Object.hasOwn(state, 'characters')) state = { characters: [state] };
      for (const player of state.characters) for (const field of ['auctions', 'auctionSales', 'friendIds', 'friendRequestIds', 'ignoreIds', 'arenaWagers']) player[field] ??= [];
      return state;
    }, validate(state) {
      assert(Array.isArray(state.characters));
      assert(state.characters.every(player => Number.isSafeInteger(player.gold) && player.gold >= 0 && player.inventory.wood >= 0));
    } });
    stores.push(store);
    return store;
  }
  const eu = makeStore('eu'), us = makeStore('us');
  assert.deepEqual(await Promise.all([eu.start(), us.start()]), [[], []]);
  const seller = key('seller'), buyer = key('buyer');
  const read = async (store, id) => (await store.read()).find(row => row.account_key === id)?.state;
  const pending = async id => (await admin.query(`SELECT pending_credits FROM ${schema}.mossvale_players WHERE account_key = $1`, [id])).rows[0].pending_credits;

  const legacyKey = key('legacy'), legacy = account('legacy-character', 12);
  for (const field of ['auctions', 'auctionSales', 'friendIds', 'friendRequestIds', 'ignoreIds', 'arenaWagers']) delete legacy.characters[0][field];
  await admin.query(`INSERT INTO ${schema}.mossvale_players (account_key,state) VALUES ($1,$2::jsonb)`, [legacyKey, JSON.stringify(legacy.characters[0])]);
  const migrated = await eu.claim(legacyKey);
  assert.deepEqual(migrated.characters[0].auctions, []);
  const migratedSave = await eu.commit([{ key: legacyKey, state: migrated, expected: migrated }]);
  assert.deepEqual(migratedSave[0].state.characters[0].friendIds, [], 'Legacy defaults must survive normalization, CAS, and persistence.');
  assert.deepEqual(migratedSave[0].state.characters[0].arenaWagers, [], 'A missing legacy wager array normalizes before shared-field CAS.');
  await eu.release(legacyKey);

  const existingOnlyKey = key('existing-only'), existingOnlyState = account('existing-only-character', 12);
  let existingOnlyMetadata;
  assert.equal(await eu.claim(existingOnlyKey, metadata => { existingOnlyMetadata = metadata; }, { existingOnly: true }), null);
  assert.equal(existingOnlyMetadata, undefined, 'a missing existing-only account never publishes successful claim metadata');
  assert(!eu.owns(existingOnlyKey), 'a missing existing-only claim releases its newly acquired ownership');
  assert.deepEqual((await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`, [existingOnlyKey])).rows, [], 'existing-only claims cannot create accounts');
  assert.deepEqual(await us.claim(existingOnlyKey), { characters: [] }, 'another realm can acquire the released lock and create the account normally');
  await us.release(existingOnlyKey);
  await admin.query(`UPDATE ${schema}.mossvale_players SET state=$2::jsonb WHERE account_key=$1`, [existingOnlyKey, JSON.stringify(existingOnlyState)]);
  assert.deepEqual(await eu.claim(existingOnlyKey, metadata => { existingOnlyMetadata = metadata; }, { existingOnly: true }), existingOnlyState);
  assert.deepEqual(existingOnlyMetadata, { guardBlockedUntil: 0 });
  assert(eu.owns(existingOnlyKey), 'an existing-only claim retains ownership of an existing account');
  await eu.release(existingOnlyKey);
  await admin.query(`DELETE FROM ${schema}.mossvale_players WHERE account_key=$1`, [existingOnlyKey]);

  assert.deepEqual(await eu.claim(seller), { characters: [] });
  assert.equal(await us.claim(seller), null, 'An account cannot be owned by both realms.');
  await eu.claim(seller);
  await eu.release(seller);
  assert.deepEqual(await us.claim(seller), { characters: [] }, 'Repeated local claims must not stack advisory locks.');
  await us.release(seller);
  await eu.claim(seller);
  await us.claim(buyer);
  const originalSeller = account('seller-character', 100);
  originalSeller.characters[0].name = "D'Artagnan \\ lantern; COMMIT; -- \n 雨";
  originalSeller.characters[0].auctions = [{ id: 'listing-1', quantity: 1, price: 30 }];
  const originalBuyer = account('buyer-character', 1000);
  await eu.commit([{ key: seller, state: originalSeller }]);
  await us.commit([{ key: buyer, state: originalBuyer }]);
  await delay(20);
  assert.deepEqual(changes.eu, [buyer], 'Own writes must not invalidate their own cache.');
  assert.deepEqual(changes.us.sort(), [legacyKey, seller].sort());
  changes.eu.length = changes.us.length = 0;
  assert.deepEqual((await eu.read([buyer])).map(row => row.account_key), [buyer], 'Notification refreshes should only read changed accounts.');
  assert.deepEqual(await eu.read([]), []);
  await assert.rejects(eu.read(['not-an-account']), /Invalid player read keys/);
  await admin.query("SELECT pg_notify('mossvale_players_changed', 'malformed-payload')");
  await delay(10);
  assert.deepEqual(changes.eu, []);

  const movingKey = key('moving');
  let moving = change(account('moving-character', 10), { x: 1, z: 2, rotation: 0, hp: 100 });
  await eu.claim(movingKey);
  await eu.commit([{ key: movingKey, state: moving }]);
  await delay(20);
  assert.deepEqual(changes.us, [movingKey], 'Creating a character still invalidates other realms.');
  changes.us.length = 0;
  for (const [field, value] of [['x', 5], ['z', 7], ['rotation', 1.5], ['hp', 80]]) {
    moving = change(moving, { [field]: value });
    await eu.commit([{ key: movingKey, state: moving }]);
    await delay(20);
    assert.deepEqual(changes.us, [], `${field}-only autosaves must not block another realm with a cache refresh.`);
    assert.deepEqual(await read(us, movingKey), moving, 'Quiet autosaves still persist every player field.');
  }
  await eu.release(movingKey);
  assert.deepEqual(await us.claim(movingKey), moving, 'Changing realm reloads the saved position and health without notifications.');
  await us.release(movingKey);
  await eu.claim(movingKey);
  for (const [field, value] of [['name', 'Moving adventurer'], ['level', 2], ['gold', 14], ['inventory', { wood: 4 }], ['zone', 'jade'], ['diedAt', 1], ['friendIds', ['friend-character']]]) {
    const next = change(moving, { [field]: value, x: moving.characters[0].x + 1 });
    await eu.commit([{ key: movingKey, state: next, expected: moving }]);
    moving = next;
    await delay(20);
    assert.deepEqual(changes.us, [movingKey], `${field} changes must still invalidate other realms even when the character moves.`);
    changes.us.length = 0;
  }
  const banned = { ...moving, ban: { at: 1, by: 'fixture-gm', reason: 'Fixture ban' } };
  await eu.commit([{ key: movingKey, state: banned, expected: moving }]);
  await delay(20);
  assert.deepEqual(changes.us, [movingKey], 'Account moderation must still invalidate other realms.');
  changes.us.length = 0;
  await us.commit([{ key: movingKey, state: change(banned, { gold: 19 }), expected: banned }]);
  await delay(20);
  assert.deepEqual(changes.eu, [movingKey], 'Pending credits alone must notify the live owner.');
  assert.deepEqual(await read(eu, movingKey), banned, 'A pending-credit notification does not overwrite durable character state.');
  assert.deepEqual(await pending(movingKey), { 'moving-character': 5 });
  changes.eu.length = changes.us.length = 0;

  const bought = change(originalBuyer, { gold: 970, inventory: { wood: 4 } });
  const sold = change(originalSeller, { gold: 130, auctions: [] });
  const sale = await us.commit([{ key: seller, state: sold, expected: originalSeller }, { key: buyer, state: bought, expected: originalBuyer }]);
  await delay(20);
  assert.deepEqual(changes.eu.sort(), [buyer, seller].sort(), 'Committed transactions must notify the other region for every changed account.');
  assert.deepEqual(changes.us, []);
  changes.eu.length = changes.us.length = 0;
  for (const [name, status, existing] of [['pending-owner', 'pending', true], ['pending-empty', 'pending', false], ['completed', 'complete', false]]) {
    const fencedKey = key(name), state = account(name, 12);
    if (existing) { await eu.claim(fencedKey); await eu.commit([{ key: fencedKey, state }]); }
    await admin.query(`INSERT INTO ${schema}.mossvale_account_deletions(account_key,status,requested_at) VALUES($1,$2,100)`, [fencedKey, status]);
    let claimMetadata;
    await assert.rejects(eu.claim(fencedKey, metadata => { claimMetadata = metadata; }), error => error.code === 'ACCOUNT_DELETING');
    assert.equal(claimMetadata, undefined, 'fenced claims never publish success metadata');
    assert(eu.isDeleting(fencedKey), 'a fresh claim remembers a newly published deletion fence');
    assert.equal(eu.owns(fencedKey), existing, 'rejected claims release only newly acquired ownership; existing owners can finish saving');
    if (existing) await eu.release(fencedKey);
    await assert.rejects(us.claim(fencedKey), error => error.code === 'ACCOUNT_DELETING', 'the failed claim released its advisory lock for another realm');
    assert(!us.owns(fencedKey));
    await assert.rejects(us.claim(fencedKey, undefined, { existingOnly: true }), error => error.code === 'ACCOUNT_DELETING', 'deletion fences take precedence over an existing-only missing-state result');
    assert(!us.owns(fencedKey));
    assert.deepEqual((await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`, [fencedKey])).rows,
      existing ? [{ state }] : [], 'pending and completed fences preserve existing state and never insert a missing account');
  }

  assert.equal(sale.find(row => row.account_key === seller).state.characters[0].gold, 100, 'Remote proceeds must not overwrite the live owner balance.');
  assert.deepEqual(await pending(seller), { 'seller-character': 30 });
  assert.equal((await read(eu, seller)).characters[0].auctions.length, 0);
  const saved = await eu.commit([{ key: seller, state: change(originalSeller, { gold: 105, level: 2 }) }]);
  assert.equal(saved[0].state.characters[0].gold, 135, 'Owner progress and remote proceeds must both survive.');
  assert.equal(saved[0].state.characters[0].level, 2);
  assert.deepEqual(saved[0].state.characters[0].auctions, [], 'A cached autosave must not resurrect a sold listing.');
  assert.deepEqual(saved[0].credits, { 'seller-character': 30 });
  assert.deepEqual(await pending(seller), {});
  const noDuplicate = await eu.commit([{ key: seller, state: saved[0].state }]);
  assert.equal(noDuplicate[0].state.characters[0].gold, 135);
  assert.deepEqual(noDuplicate[0].credits, {});

  await assert.rejects(us.commit([{ key: seller, state: sold, expected: originalSeller }, { key: buyer, state: change(bought, { gold: 940 }), expected: bought }]), isConflict);
  assert.equal((await read(us, buyer)).characters[0].gold, 970, 'Failed listing CAS must roll back the buyer debit.');
  const socialBaseline = await read(us, seller);
  await us.commit([{ key: seller, state: change(socialBaseline, { ignoreIds: ['ignored-player'] }), expected: socialBaseline }]);
  await assert.rejects(eu.commit([{ key: seller, state: change(socialBaseline, { gold: 120 }), expected: socialBaseline }]), isConflict, 'Unchanged shared fields still act as explicit action preconditions.');
  const refreshed = (await eu.commit([{ key: seller, state: change(socialBaseline, { gold: 140 }) }]))[0].state;
  assert.deepEqual(refreshed.characters[0].ignoreIds, ['ignored-player']);
  assert.equal(refreshed.characters[0].gold, 140);

  await assert.rejects(us.commit([{ key: seller, state: change(refreshed, { inventory: { wood: 9 } }), expected: refreshed }]), isConflict);
  await assert.rejects(us.commit([{ key: seller, state: change(refreshed, { gold: 139 }), expected: refreshed }]), isConflict);
  await assert.rejects(us.commit([{ key: seller, state: refreshed }]), isConflict);
  await assert.rejects(us.commit([{ key: seller, state: { characters: [] }, expected: refreshed }]), isConflict);

  await us.commit([{ key: seller, state: change(refreshed, { gold: 147 }), expected: refreshed }]);
  await assert.rejects(eu.commit([{ key: seller, state: { characters: [] } }]), isConflict);
  assert.deepEqual(await pending(seller), { 'seller-character': 7 }, 'Rejected deletion cannot discard proceeds.');
  const credited = (await eu.commit([{ key: seller, state: refreshed }]))[0].state;
  assert.equal(credited.characters[0].gold, 147);

  const wealthyKey = key('wealthy'), wealthy = account('wealthy-character', Number.MAX_SAFE_INTEGER - 5);
  await eu.claim(wealthyKey);
  await eu.commit([{ key: wealthyKey, state: wealthy }]);
  await us.commit([{ key: wealthyKey, state: change(wealthy, { gold: wealthy.characters[0].gold + 3 }), expected: wealthy }]);
  const fullWallet = change(wealthy, { gold: Number.MAX_SAFE_INTEGER - 1, level: 2 });
  const deferred = (await eu.commit([{ key: wealthyKey, state: fullWallet }]))[0];
  assert.equal(deferred.state.characters[0].level, 2, 'Unclaimable proceeds must not block unrelated live progress.');
  assert.deepEqual(deferred.credits, {});
  assert.deepEqual(await pending(wealthyKey), { 'wealthy-character': 3 });
  const room = change(fullWallet, { gold: Number.MAX_SAFE_INTEGER - 11 });
  const collected = (await eu.commit([{ key: wealthyKey, state: room }]))[0];
  assert.equal(collected.state.characters[0].gold, Number.MAX_SAFE_INTEGER - 8);
  assert.deepEqual(collected.credits, { 'wealthy-character': 3 });
  assert.deepEqual(await pending(wealthyKey), {});

  await assert.rejects(us.commit([{ key: buyer, state: change(bought, { gold: 900 }), expected: bought }, { key: key('missing'), state: { characters: [] }, expected: { characters: [] } }]), isConflict);
  assert.equal((await read(us, buyer)).characters[0].gold, 970);
  await assert.rejects(us.commit([{ key: buyer, state: change(bought, { gold: 900 }), expected: bought }], () => { throw new Error('Cross-account invariant rejected.'); }), /Cross-account invariant/);
  assert.equal((await read(us, buyer)).characters[0].gold, 970, 'Cross-account validation must run inside the transaction before writing.');

  await admin.query(`CREATE FUNCTION ${schema}.reject_fixture_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state#>>'{characters,0,name}' = 'reject-fixture' THEN RAISE EXCEPTION 'Controlled player write failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`);
  await admin.query(`CREATE TRIGGER reject_fixture_write BEFORE UPDATE ON ${schema}.mossvale_players FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_fixture_write()`);
  await assert.rejects(us.commit([{ key: buyer, state: change(bought, { name: 'reject-fixture', gold: 900 }), expected: bought }]), error => error.code === '23514');
  assert.equal(fatalCalls.length, 0, 'a definite SQL failure before batched COMMIT rolls back without losing account ownership');
  assert.equal(us.owns(buyer), true);
  assert.equal((await read(us, buyer)).characters[0].gold, 970, 'failed batched UPDATE leaves durable gold unchanged');
  await us.commit([{ key: buyer, state: bought, expected: bought }]);

  await eu.release(seller);
  assert.equal(eu.owns(seller), false);
  const transferred = await us.claim(seller);
  assert.deepEqual(transferred, credited, 'A region switch must reload latest durable progress.');
  await assert.rejects(eu.commit([{ key: seller, state: originalSeller }]), isConflict, 'The released realm must not write stale progress.');
  assert.equal(fatalCalls.length, 0, 'Expected action conflicts must leave the store usable.');

  // MOSS terms and results use the same row locks and shared-field protection as auctions.
  const fighterKeys = [key('arena-a'), key('arena-b')], beforeWager = [account('arena-a', 100), account('arena-b', 100)];
  await eu.claim(fighterKeys[0]); await us.claim(fighterKeys[1]);
  await eu.commit([{ key: fighterKeys[0], state: beforeWager[0] }]); await us.commit([{ key: fighterKeys[1], state: beforeWager[1] }]);
  const terms = { matchId: key('arena-match'), stakeWei: '100000000000000000000', signature: 'fixture-signed-terms' };
  const funded = beforeWager.map(state => change(state, { arenaWagers: [{ order: terms }] }));
  await eu.commit(fighterKeys.map((key, i) => ({ key, state: funded[i], expected: beforeWager[i] })));
  assert.deepEqual((await read(eu, fighterKeys[0])).characters[0].arenaWagers, (await read(us, fighterKeys[1])).characters[0].arenaWagers, 'Both account rows persist identical escrow terms.');
  await assert.rejects(eu.commit([{ key: fighterKeys[0], state: { characters: [] } }]), isConflict, 'Even an owner autosave cannot remove a character carrying unresolved arena escrow.');
  const payout = { winner: 'arena-a-wallet', signature: 'fixture-signed-result' };
  const settled = funded.map(state => change(state, { arenaWagers: [{ order: terms, result: payout }] }));
  await assert.rejects(eu.commit([{ key: fighterKeys[0], state: settled[0], expected: funded[0] },
    { key: fighterKeys[1], state: settled[1], expected: beforeWager[1] }]), isConflict);
  for (const [i, key] of fighterKeys.entries()) assert.deepEqual((await read(eu, key)).characters[0].arenaWagers, funded[i].characters[0].arenaWagers, 'A stale second account rolls back the entire result write.');
  await us.commit(fighterKeys.map((key, i) => ({ key, state: settled[i], expected: funded[i] })));
  await assert.rejects(eu.commit(fighterKeys.map((key, i) => ({ key,
    state: change(funded[i], { arenaWagers: [{ order: terms, result: { ...payout, winner: 'arena-b-wallet' } }] }), expected: funded[i] }))), isConflict, 'A stale outcome cannot replace a committed winner.');
  await eu.commit([{ key: fighterKeys[0], state: beforeWager[0] }]); await us.commit([{ key: fighterKeys[1], state: funded[1] }]);
  for (const [i, key] of fighterKeys.entries()) assert.deepEqual((await read(eu, key)).characters[0].arenaWagers, settled[i].characters[0].arenaWagers, 'Stale autosaves cannot erase escrow terms or their signed result.');
  await eu.commit(fighterKeys.map((key, i) => ({ key, state: beforeWager[i], expected: settled[i] })));
  await eu.commit([{ key: fighterKeys[0], state: settled[0] }]); await us.commit([{ key: fighterKeys[1], state: settled[1] }]);
  for (const key of fighterKeys) { const player = (await read(eu, key)).characters[0]; assert.deepEqual(player.arenaWagers, [], 'Stale autosaves cannot resurrect a finalized, cleared wager.'); assert.equal(player.gold, 100); }

  // Kill the owning backend while its multi-account transaction is open. The
  // old Client must freeze permanently, not reconnect and replay cached writes.
  await assert.rejects(us.commit([{ key: buyer, state: change(bought, { gold: 800 }), expected: bought }], async () => {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1', [`${schema}_us`]);
    await delay(30);
  }), error => error.code === 'PLAYER_STORE_UNAVAILABLE');
  assert.equal(fatalCalls.length, 1);
  assert.equal(us.owns(seller), false);
  await assert.rejects(us.read(), error => error.code === 'PLAYER_STORE_UNAVAILABLE');
  await assert.rejects(us.commit([{ key: seller, state: originalSeller }]), error => error.code === 'PLAYER_STORE_UNAVAILABLE');
  assert.deepEqual(await eu.claim(seller), credited, 'Connection loss releases ownership for the surviving realm.');
  assert.equal((await read(eu, buyer)).characters[0].gold, 970, 'The interrupted transaction must leave both accounts unchanged.');
  await eu.commit([{ key: seller, state: change(credited, { gold: 150 }) }]);
  assert.equal((await read(eu, seller)).characters[0].gold, 150);
  const RealClient = pg.Client; let loseCommitReply = false, lostReplyFatal = 0;
  pg.Client = class extends RealClient {
    async query(text, values) {
      const result = await super.query(text, values);
      if (loseCommitReply && typeof text === 'string' && text.endsWith('; COMMIT')) {
        loseCommitReply = false; throw Object.assign(Error('Lost durable commit reply'), { code: 'ECONNRESET' });
      }
      return result;
    }
  };
  let uncertain;
  try {
    uncertain = createPlayerStore({ connectionString: url.toString(), onFatal: () => { lostReplyFatal++; } }); stores.push(uncertain);
  } finally { pg.Client = RealClient; }
  await uncertain.start(); const uncertainKey = key('uncertain'); await uncertain.claim(uncertainKey);
  loseCommitReply = true;
  await assert.rejects(uncertain.commit([{ key: uncertainKey, state: account('uncertain-character', 23) }]), error => error.code === 'PLAYER_STORE_UNAVAILABLE');
  assert.equal(lostReplyFatal, 1); assert.equal(uncertain.owns(uncertainKey), false);
  assert.equal((await read(eu, uncertainKey)).characters[0].gold, 23, 'a lost reply may hide a successful commit');
  await assert.rejects(uncertain.commit([{ key: uncertainKey, state: account('uncertain-character', 0) }]), error => error.code === 'PLAYER_STORE_UNAVAILABLE', 'uncertain commits permanently fence the old owner against replay');
  console.log('Shared player store passed: exclusive ownership, transfer reload, shared-field CAS, atomic auction credits and arena results, wager migration/stale-save protection, stale-write rejection, rollback, and permanent failure on connection loss.');
} finally {
  await Promise.allSettled(stores.map(store => store.close()));
  if (admin) {
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); }
  }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe' });
}
