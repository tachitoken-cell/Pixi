import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import pg from 'pg';
import { WebSocket } from 'ws';
import { Wallet, id } from 'ethers';
import { createGameServer } from '../server.mjs';
import { storeProduct, storePlayerValid } from '../src/ingame-store.ts';
import { MOSS_TOKEN } from '../src/auction.ts';
import { starterGear, TALENT_VERSION } from '../src/progression.ts';

// Real PostgreSQL and two independent game servers with real sockets. Only
// store-chain responses are controlled; unrelated auction chains are disabled.
const run = promisify(execFile), realNow = Date.now, clients = [], games = [];
const schema = `store_realms_${randomUUID().replaceAll('-', '')}`, dir = mkdtempSync(join(tmpdir(), 'mossvale-store-realms-'));
const wallet = Wallet.createRandom(), contract = Wallet.createRandom().address;
const tokens = Array.from({ length: 5 }, () => randomBytes(32).toString('base64url'));
const accountKey = index => createHash('sha256').update(tokens[index]).digest('hex');
const realStartedAt = realNow();
let clock = realStartedAt, container, admin, databaseUrl;
// SQL may become visible before reconciliation releases its lock; background retries must keep advancing after tick().
Date.now = () => clock + realNow() - realStartedAt;
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const products = ['store-embermane', 'store-ashwing', 'burned', 'store-cinderfang', 'store-class-change'].map(storeProduct);
const heroes = ['Offline rider', 'Active keeper', 'Joining keeper', 'Saving rider', 'Changing ranger'].map((name, i) => {
  const characterId = randomUUID(), orderId = randomUUID(), product = products[i];
  return { id: characterId, name, appearance: { ...appearance, race: 'lizardfolk', gender: 'female', face: 'painted', hairStyle: 'dreadlocks', hairHighlight: '#b1c2d3', armorColors: { armor: '#123456', legs: '#654321' } }, x: 0, z: 8, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
    characterCreated: true, ...starterGear('Ranger'), talents: [], talentVersion: TALENT_VERSION,
    skills: { mining: 0, woodcutting: 0, herbalism: 0, fishing: 729 }, dreamRestReadyAt: clock + 600000, carriedItems: { 'silver-carp': 2, 'nightmare-shard': 1 }, level: 1, hp: 100, maxHp: 100, xp: 7, gold: 23,
    inventory: { wood: 2, crystal: 0, herb: 0, potion: 3, relic: 0 }, learnedSpells: ['arrow'], ridingRank: 0,
    ownedMounts: [], ownedPets: [], storePurchases: [], auctionWallet: wallet.address, quest: { stage: 0, kills: 0, crystals: 0 },
    storeOrders: [{ id: orderId, productId: product.id, characterId, wallet: wallet.address, usdPrice: product.usdPrice,
      chainId: 4663, token: MOSS_TOKEN.address, contract, amountWei: '1000000000000000000', mossAmount: '1.0',
      quotedAt: clock, expiresAt: (Math.floor(clock / 1000) + 3600) * 1000, status: 'quoted', signature: '0x' + 'aa'.repeat(65), orderHash: id(orderId),
      contractOrder: { orderId: id(orderId), productId: id(product.id), characterId: id(characterId), buyer: wallet.address,
        amountWei: '1000000000000000000', usdCents: String(product.usdPrice * 100), deadline: Math.floor(clock / 1000) + 3600 },
      approval: { to: MOSS_TOKEN.address, data: '0x00', value: '0x0', chainId: '0x1237' }, transaction: { to: contract, data: '0x00', value: '0x0', chainId: '0x1237' } }] };
});
const feedbackProgress = player => ({ appearance: player.appearance, skills: player.skills, talentVersion: player.talentVersion, dreamRestReadyAt: player.dreamRestReadyAt, carriedItems: player.carriedItems });
const outcomes = new Map(), overrides = new Map(), calls = new Map(), holds = new Map();
const orderId = i => heroes[i].storeOrders[0].id;
const processed = block => ({ state: 'processed', blockHash: id(block), blockNumber: '0x1234' });
const callKey = (realm, i) => `${realm}:${orderId(i)}`;
function hold(i) {
  let release; const gate = { arrived: new Set(), promise: new Promise(resolve => { release = resolve; }) };
  gate.release = () => { holds.delete(orderId(i)); release(); }; holds.set(orderId(i), gate); return gate;
}
async function until(fn, label, timeout = 12000) {
  const end = realNow() + timeout;
  while (realNow() < end) { const result = await fn(); if (result) return result; await delay(20); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 6000) { clock += ms; await delay(90); }
async function provisionDatabase() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = `mossvale-store-realms-${randomUUID().slice(0, 8)}`;
    const password = randomUUID();
    await run('docker', ['run', '--rm', '-d', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`, '-p', '127.0.0.1::5432', 'postgres:17-bookworm']);
    const { stdout } = await run('docker', ['port', container, '5432/tcp']);
    const port = stdout.trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1]; assert(port);
    url = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  }
  const scoped = new URL(url);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(scoped.hostname), 'Only disposable loopback PostgreSQL is permitted');
  await until(async () => {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 });
    try { await client.connect(); admin = client; return true; } catch { await client.end(); return false; }
  }, 'disposable PostgreSQL ready', 30000);
  await admin.query(`CREATE SCHEMA ${schema}`);
  scoped.searchParams.set('options', `-c search_path=${schema}`); databaseUrl = scoped.toString();
  await admin.query(`CREATE TABLE ${schema}.mossvale_players (account_key text PRIMARY KEY, state jsonb NOT NULL)`);
  for (const [i, hero] of heroes.entries()) await admin.query(`INSERT INTO ${schema}.mossvale_players VALUES ($1,$2)`, [accountKey(i), { characters: [hero] }]);
  await admin.query(`CREATE TABLE ${schema}.store_writes (account_key text, status text)`);
  await admin.query(`CREATE FUNCTION ${schema}.audit_store() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF OLD.state#>'{characters,0,storeOrders}' IS DISTINCT FROM NEW.state#>'{characters,0,storeOrders}' THEN
      INSERT INTO ${schema}.store_writes VALUES (NEW.account_key, NEW.state#>>'{characters,0,storeOrders,0,status}');
    END IF; RETURN NEW; END $$`);
  await admin.query(`CREATE TRIGGER store_audit AFTER UPDATE ON ${schema}.mossvale_players FOR EACH ROW EXECUTE FUNCTION ${schema}.audit_store()`);
}
async function start(realmId) {
  const scoped = new URL(databaseUrl); scoped.searchParams.set('application_name', `${schema}_${realmId}`);
  const disabled = { status: async () => ({ enabled: false, reason: 'Local test.' }) };
  const storeChain = {
    status: async () => ({ enabled: true, chainId: 4663, token: MOSS_TOKEN.address, contract }),
    async settlement(order) {
      const key = `${realmId}:${order.id}`; calls.set(key, (calls.get(key) || 0) + 1);
      const result = overrides.get(key) ?? outcomes.get(order.id) ?? { state: 'pending' };
      const gate = holds.get(order.id); if (gate) { gate.arrived.add(realmId); await gate.promise; }
      if (result instanceof Error) throw result;
      return structuredClone(result);
    },
  };
  const game = createGameServer({ realmId, databaseUrl: scoped.toString(), databaseCaBase64: '', port: 0, host: '127.0.0.1',
    dataDir: join(dir, realmId), keycloak: null, walletOidc: { env: {} }, auctionChain: disabled, mossAuctionChain: disabled, storeChain });
  games.push(game); return { game, port: await game.start(), realmId };
}
async function connect(server, index) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/socket`), c = { socket, messages: [], closed: null }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === heroes[index].id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'snapshot') c.snapshot = m; });
  socket.on('close', code => { c.closed = code; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[index], characterId: heroes[index].id, realmId: server.realmId });
  await until(() => c.player() || c.closed, 'realm login'); return c;
}
async function leave(c) { c.send({ type: 'leaveRealm' }); await until(() => c.messages.some(m => m.type === 'realmLeft'), 'durable disconnect'); }
async function stored(i) { return (await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`, [accountKey(i)])).rows[0].state.characters[0]; }
async function status(i, expected) { return until(async () => (await stored(i)).storeOrders[0].status === expected, `order ${i} becomes ${expected}`); }
async function lockHeld(i) {
  const hash = createHash('sha256').update(`mossvale-account:${accountKey(i)}`).digest();
  return (await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
    AND classid=$1::oid AND objid=$2::oid AND objsubid=1 AND granted) AS held`, [String(hash.readUInt32BE()), String(hash.readUInt32BE(4))])).rows[0].held;
}

try {
  await provisionDatabase(); let eu = await start('eu'), us = await start('us');
  outcomes.set(orderId(0), processed('offline-inclusion')); const simultaneous = hold(0); await tick();
  await until(() => simultaneous.arrived.size === 2, 'both realms check the same offline payment'); simultaneous.release();
  await status(0, 'processed'); await until(async () => !await lockHeld(0), 'offline claim released');
  const granted = await stored(0); assert(storePlayerValid(granted)); assert.deepEqual(granted.storePurchases, [products[0].id]); assert.deepEqual(granted.ownedMounts, [products[0].id]);
  assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM ${schema}.store_writes WHERE account_key=$1 AND status='processed'`, [accountKey(0)])).rows[0].n, 1, 'concurrent realms commit one provisional grant');
  outcomes.set(orderId(0), Error('Controlled RPC outage')); const beforeOutage = calls.get(callKey('eu', 0)); await tick();
  await until(() => calls.get(callKey('eu', 0)) > beforeOutage, 'RPC outage observed'); assert.deepEqual((await stored(0)).storeOrders, granted.storeOrders); assert.deepEqual((await stored(0)).ownedMounts, granted.ownedMounts);
  const rider = await connect(eu, 0); assert(rider.player().ownedMounts.includes(products[0].id)); await leave(rider);
  await Promise.all([eu.game.stop(), us.game.stop()]); outcomes.set(orderId(0), { state: 'pending', revoked: true });
  eu = await start('eu'); us = await start('us'); await tick(); await status(0, 'submitted');
  assert.deepEqual((await stored(0)).storePurchases, []); assert.deepEqual((await stored(0)).ownedMounts, [], 'offline revocation persists across restart');
  outcomes.set(orderId(0), processed('re-inclusion')); await tick(); await status(0, 'processed');
  outcomes.set(orderId(0), { state: 'paid' }); await tick(); await status(0, 'delivered');
  outcomes.set(orderId(0), { state: 'expired', revoked: true }); await tick();
  assert.equal((await stored(0)).storeOrders[0].status, 'delivered'); assert.deepEqual((await stored(0)).ownedMounts, [products[0].id]);
  await tick(1200); const finalizedCalls = [calls.get(callKey('eu', 0)), calls.get(callKey('us', 0))]; await tick();
  assert.deepEqual([calls.get(callKey('eu', 0)), calls.get(callKey('us', 0))], finalizedCalls, 'finalized orders are no longer reconciled');

  const keeper = await connect(us, 1); assert.equal((await connect(eu, 1)).closed, 4407, 'active account belongs to one realm');
  const hotbar = [...keeper.player().hotbar]; hotbar[7] = hotbar[7] === null ? hotbar[0] : null;
  keeper.send({ type: 'setHotbar', slots: hotbar }); await until(async () => JSON.stringify((await stored(1)).hotbar) === JSON.stringify(hotbar), 'active gameplay save');
  outcomes.set(orderId(1), processed('owned-account')); overrides.set(callKey('us', 1), Error('Owning realm RPC outage'));
  const beforeRemote = calls.get(callKey('eu', 1)); await tick(); await until(() => calls.get(callKey('eu', 1)) > beforeRemote, 'other realm attempts reconciliation'); await delay(100);
  assert(await lockHeld(1)); assert.equal((await stored(1)).storeOrders[0].status, 'quoted', 'remote poll cannot alter an actively owned account');
  assert.deepEqual((await stored(1)).hotbar, hotbar); assert.deepEqual((await stored(1)).storePurchases, []);
  overrides.delete(callKey('us', 1)); await tick(); await status(1, 'processed'); await until(() => keeper.player().ownedPets.includes(products[1].id), 'owner exposes committed pet');
  assert.deepEqual((await stored(1)).hotbar, hotbar); assert.equal(keeper.closed, null);

  outcomes.set(orderId(2), processed('login-during-rpc')); const networkGate = hold(2); await tick();
  await until(() => networkGate.arrived.size === 2, 'both reconciliation RPCs paused');
  const joining = await connect(eu, 2); assert(joining.player(), 'login is not held behind a slow chain RPC'); networkGate.release(); await tick(); await status(2, 'processed');
  await until(() => joining.player().storePurchases.includes(products[2].id), 'concurrent login receives durable reward');
  assert.equal((await stored(2)).title, 'burned'); assert.equal((await stored(2)).xp, 7);

  await admin.query(`CREATE FUNCTION ${schema}.pause_store_save() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.account_key='${accountKey(3)}' AND NEW.state#>>'{characters,0,storeOrders,0,status}'='processed' THEN PERFORM pg_sleep(1); END IF; RETURN NEW; END $$`);
  await admin.query(`CREATE TRIGGER pause_save BEFORE UPDATE ON ${schema}.mossvale_players FOR EACH ROW EXECUTE FUNCTION ${schema}.pause_store_save()`);
  outcomes.set(orderId(3), processed('login-during-save')); overrides.set(callKey('us', 3), Error('Other realm RPC outage')); await tick();
  await until(async () => (await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event='PgSleep'", [`${schema}_eu`])).rowCount, 'offline save holds real PostgreSQL account claim');
  let loginFinished = false; const login = connect(eu, 3).then(c => { loginFinished = true; return c; });
  await delay(100); assert(!loginFinished, 'same-realm login waits for the short durable save');
  const savedRider = await login; assert.equal(savedRider.closed, null); assert(savedRider.player().ownedMounts.includes(products[3].id));
  assert.equal((await stored(3)).xp, 7); assert.equal((await stored(3)).gold, 23); assert(storePlayerValid(await stored(3)));

  outcomes.set(orderId(4), processed('class-inclusion')); const classGrant = hold(4); await tick();
  await until(() => classGrant.arrived.size === 2, 'both realms check the offline class payment'); classGrant.release();
  await status(4, 'processed'); await until(async () => !await lockHeld(4), 'class grant claim released');
  assert.equal((await stored(4)).storeOrders[0].reward.kind, 'class-change', 'processed payment grants the class credit before finality');
  assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM ${schema}.store_writes WHERE account_key=$1 AND status='processed'`, [accountKey(4)])).rows[0].n, 1, 'two realms grant one class credit');
  const changing = await connect(eu, 4);
  outcomes.set(orderId(4), { state: 'paid' }); const classFinality = hold(4); await tick();
  await until(() => classFinality.arrived.size === 2, 'finality RPCs begin before class redemption');
  changing.send({ type: 'storeChangeClass', orderId: orderId(4), className: 'Mage' });
  await until(async () => (await stored(4)).storeOrders[0].reward?.redeemedAt, 'processed credit and class swap saved together');
  const redeemed = await stored(4); assert.equal(redeemed.appearance.className, 'Mage'); assert(storePlayerValid(redeemed));
  assert.equal(redeemed.storeOrders[0].status, 'processed', 'redemption does not wait for the held finality check');
  classFinality.release(); await tick(); await status(4, 'delivered');
  assert.deepEqual((await stored(4)).storeOrders[0].reward, redeemed.storeOrders[0].reward, 'late settlement never overwrites the used receipt');
  await leave(changing); const changed = await connect(us, 4); assert.equal(changed.player().appearance.className, 'Mage');
  changed.send({ type: 'storeChangeClass', orderId: orderId(4), className: 'Knight' });
  const replay = await until(() => changed.messages.find(message => message.type === 'event' && message.requestType === 'storeChangeClass'), 'other realm rejects used credit');
  assert.match(replay.text, /unused class-change receipt/, 'reuse fails because the receipt is spent');
  assert.equal((await stored(4)).appearance.className, 'Mage');
  assert.deepEqual((await stored(4)).storeOrders[0].reward, redeemed.storeOrders[0].reward, 'realm handoff cannot redeem the same processed receipt twice');
  for (const [index, hero] of heroes.entries()) assert.deepEqual(feedbackProgress(await stored(index)), feedbackProgress(index === 4 ? { ...hero, appearance: { ...hero.appearance, className: 'Mage' } } : hero), 'store settlement, class change, rollback, gameplay saves and realm restarts preserve fishing, new cosmetics and dream progress');
  for (const [index, client] of [[1, keeper], [2, joining], [3, savedRider]]) assert.deepEqual(feedbackProgress(client.player()), feedbackProgress(heroes[index]), 'live characters retain new progression during asynchronous store reconciliation');
  console.log('PASS store realms: real PostgreSQL offline claims, concurrent grant once, processed class credit, redemption during finality RPC, cross-realm redemption replay rejection, RPC outage retention, disconnect/restart revocation, permanent finalization, active owner isolation, login during RPC and durable save, fishing/cosmetic/dream persistence. No real wallet or production database used.');
} finally {
  for (const gate of holds.values()) gate.release();
  for (const client of clients) client.socket.terminate();
  await Promise.allSettled(games.map(game => game.stop()));
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {}); await admin.end(); }
  if (container) await run('docker', ['rm', '-f', container]).catch(() => {});
  Date.now = realNow; rmSync(dir, { recursive: true, force: true });
}
