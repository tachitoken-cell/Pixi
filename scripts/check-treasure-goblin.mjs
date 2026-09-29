import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createGameServer } from '../server.mjs';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear } from '../src/progression.ts';
import { canTraverse, overworldSpawnAllowed } from '../src/realm.ts';
import { surfaceAt } from '../src/landscape.ts';
import { TREASURE_GOBLIN as rules, engageTreasureGoblin, treasureGoblinDeadline, treasureGoblinFleeGoal } from '../src/treasure-goblin.ts';

const state = { spawnedAt: 1000, portalAt: 1000 + rules.idleLifetimeMs - rules.portalMs };
assert.equal(treasureGoblinDeadline(state), 301000);
engageTreasureGoblin(state, 2000); assert.equal(state.escapeAt, 32000); assert.equal(state.portalAt, 29000);
engageTreasureGoblin(state, 5000); assert.equal(state.escapeAt, 32000, 'damage, fear, and renewed pursuit cannot reset the deadline');
const old = { spawnedAt: 0, portalAt: rules.idleLifetimeMs - rules.portalMs }; engageTreasureGoblin(old, rules.idleLifetimeMs - 1000);
assert.equal(old.escapeAt, rules.idleLifetimeMs, 'engaging an old goblin cannot extend its idle lifetime');
const origin = { x: 0, z: 0, rotation: 0 }, pursuer = { x: 0, z: -1 };
assert.deepEqual(treasureGoblinFleeGoal(origin, pursuer, () => true), { x: 0, z: 2 });
assert(treasureGoblinFleeGoal(origin, pursuer, p => p.x > .5)?.x > .5, 'a blocked escape chooses a clear side route');
assert.equal(treasureGoblinFleeGoal(origin, pursuer, () => false), undefined, 'a surrounded goblin cannot cross obstacles');
assert.equal(rules.spawnChancePercent, 2); assert.equal(rules.voucherChancePercent, 10); assert.equal(rules.escapeMs, 30000);

const dir = mkdtempSync(join(tmpdir(), 'mossvale-treasure-')), file = join(dir, 'players.json'), realNow = Date.now;
const anchor = { x: -400, z: 210 }, expectedSpawn = { x: -400, z: 235 };
assert(overworldSpawnAllowed(anchor) && overworldSpawnAllowed(expectedSpawn) && canTraverse(anchor, expectedSpawn));
assert.equal(surfaceAt(anchor.x, anchor.z).regionId, surfaceAt(expectedSpawn.x, expectedSpawn.z).regionId);
let clock = realNow(), game, port, clients = [], chance = 1, chanceCalls = 0, spawnAngle = 0;
Date.now = () => clock;
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'goblin-fixture', use: 'sig', alg: 'RS256' };
const identity = createServer((req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] })));
await new Promise(resolve => identity.listen(0, '127.0.0.1', resolve));
const keycloak = { url: `http://127.0.0.1:${identity.address().port}`, realm: 'mossvale', clientId: 'mossvale-browser' }, issuer = `${keycloak.url}/realms/mossvale`;
const hash = token => createHash('sha256').update(token).digest('hex');
function hero(name, position = anchor) {
  return { id: randomUUID(), name, ...position, zone: surfaceAt(position.x, position.z).zone, coordinateVersion: 2, rotation: 0, characterCreated: true,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    talents: [], learnedSpells: ['arrow', 'hamstring-shot', 'tranquilizing-shot', 'eagles-eye'], ...starterGear('Ranger'),
    hp: 808, maxHp: 808, level: 60, xp: 0, gold: 0, inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 },
    quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function until(fn, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const result = fn(); if (result) return result; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 100) { clock += ms; await delay(120); }
async function connect(player, token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, id: player.id, recordKey: hash(`${issuer}\n${player.id}`), messages: [] };
  clients.push(client); client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(p => p.id === player.id);
  client.goblin = () => client.snapshot?.enemies.find(e => e.kind === 'treasure-goblin');
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['roster', 'snapshot'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', accessToken: token, characterId: player.id, role: 'gm' }); await until(() => client.player(), 'character entry'); return client;
}
async function start(count = 1, position = anchor) {
  clock += 10000; chance = 1; chanceCalls = 0; spawnAngle = 0;
  const people = Array.from({ length: count }, (_, i) => hero(`Goblin tester ${i}`, { x: position.x + i * .5, z: position.z }));
  const tokens = await Promise.all(people.map((p, i) => new SignJWT({ iss: issuer, sub: p.id, azp: keycloak.clientId, typ: 'Bearer',
    iat: Math.floor(realNow() / 1000), exp: Math.floor(clock / 1000) + 3600, realm_access: { roles: i === 0 ? ['gm'] : [] } }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(privateKey)));
  writeFileSync(file, JSON.stringify(Object.fromEntries(people.map(p => [hash(`${issuer}\n${p.id}`), { characters: [p] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak, databaseUrl: '',
    treasureRandomInt: max => { if (max === 100) { chanceCalls++; return chance; } return max === 360 ? spawnAngle : 0; } });
  port = await game.start();
  const result = []; for (let i = 0; i < people.length; i++) result.push(await connect(people[i], tokens[i])); return result;
}
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = undefined; }
async function gmSpawn(client, fields = {}, success = true) {
  const before = client.messages.length;
  client.send({ type: 'gmAction', action: 'spawnTreasureGoblin', targetId: client.id, ...fields });
  const result = await until(() => client.messages.slice(before).find(m => m.type === 'gmResult'), 'GM spawn result');
  assert.equal(result.success, success, result.text); await delay(120);
}
async function spawn(client, hp = 160, manual = false) {
  chance = 1; const original = MONSTERS['treasure-goblin'].hp; MONSTERS['treasure-goblin'].hp = hp;
  const before = new Set(client.snapshot.enemies.map(e => e.id));
  try {
    if (manual) await gmSpawn(client); else await tick(rules.spawnIntervalMs);
    return await until(() => client.snapshot.enemies.find(e => e.kind === 'treasure-goblin' && !before.has(e.id)), 'treasure goblin spawn');
  }
  finally { MONSTERS['treasure-goblin'].hp = original; }
}
async function move(client, destination) {
  while (Math.hypot(client.player().x - destination.x, client.player().z - destination.z) > .02) {
    const p = client.player(), gap = Math.hypot(destination.x - p.x, destination.z - p.z), step = Math.min(2, gap);
    const point = { x: p.x + (destination.x - p.x) / gap * step, z: p.z + (destination.z - p.z) / gap * step };
    assert(canTraverse(p, point)); clock += 400; client.send({ type: 'move', ...point, rotation: 0 });
    await until(() => Math.hypot(client.player().x - point.x, client.player().z - point.z) < .02, 'legal movement');
  }
}
async function attack(client, id, ability = 'arrow') {
  const before = client.messages.length; client.send({ type: 'attack', targetId: id, ability });
  const result = await until(() => client.messages.slice(before).find(m => m.type === 'combat' && m.playerId === client.id || m.type === 'event' && m.kind === 'info') || client.player().casting, 'accepted attack');
  assert.notEqual(result.kind, 'info', result.text);
  if (client.player().casting) await tick(client.player().casting.endsAt - clock);
}
try {
  // Empty realms and towns do not generate opportunities; the 2% boundary is strict.
  const [town] = await start(1, { x: 0, z: 8 }); await tick(rules.spawnIntervalMs);
  await gmSpawn(town, {}, false);
  assert.equal(chanceCalls, 0); assert(!town.goblin()); await stop();
  const [idle] = await start(); chance = 2; await tick(rules.spawnIntervalMs);
  assert.equal(chanceCalls, 1); assert(!idle.goblin(), 'a draw of 2 is outside the two winning values');
  const idleGoblin = await spawn(idle); assert.equal(chanceCalls, 2); assert.equal(idleGoblin.treasure.escapeAt, undefined);
  assert.deepEqual({ x: idleGoblin.x, z: idleGoblin.z }, expectedSpawn);
  await tick(rules.idleLifetimeMs - rules.portalMs); assert.equal(idle.goblin().treasure.portalAt, clock);
  chance = 99; await tick(rules.portalMs); assert(!idle.goblin()); assert(!idle.snapshot.loot.some(d => d.enemyId === idleGoblin.id)); await stop();

  // A shorter test interval exposes the natural cap while all goblins are still alive.
  const interval = rules.spawnIntervalMs;
  try {
    rules.spawnIntervalMs = 10000;
    const [gm, ordinary] = await start(2), startedAt = clock;
    assert.equal(gm.player().role, 'gm'); assert.equal(ordinary.player().role, 'player');
    await gmSpawn(ordinary, {}, false); await gmSpawn(gm, { targetId: ordinary.id }, false);
    for (const fields of [{ amount: 2 }, { x: anchor.x }, { gmSpawned: true }, { role: 'gm' }]) await gmSpawn(gm, fields, false);
    assert(!gm.goblin(), 'unauthorized, cross-target and malformed requests cannot spawn enemies');
    await tick(9000); spawnAngle = 30; const manual = await spawn(gm, 160, true);
    assert.equal(chanceCalls, 0, 'a manual spawn does not roll natural rarity');
    await gmSpawn(gm, {}, false); assert.equal(gm.snapshot.enemies.filter(e => e.treasure).length, 1, 'occupied placement fails without duplicating the goblin');
    spawnAngle = 0;
    const originalHp = MONSTERS['treasure-goblin'].hp; MONSTERS['treasure-goblin'].hp = 1;
    try { await tick(1000); } finally { MONSTERS['treasure-goblin'].hp = originalHp; }
    const natural = await until(() => gm.snapshot.enemies.find(e => e.treasure && e.id !== manual.id), 'natural spawn alongside manual');
    assert.equal(natural.treasure.spawnedAt, startedAt + 10000, 'manual spawn does not reset the natural schedule');
    assert.equal(chanceCalls, 1);
    spawnAngle = 60; const extra = await spawn(gm, 160, true);
    assert.equal(gm.snapshot.enemies.filter(e => e.treasure && e.alive).length, 3, 'GM can add a second extra while a natural goblin lives');
    for (const e of [manual, natural, extra]) {
      assert(overworldSpawnAllowed(e, e.zone)); assert.equal(e.gmSpawned, undefined, 'manual marker stays server-only');
      assert.equal(e.treasure.portalAt, e.treasure.spawnedAt + rules.idleLifetimeMs - rules.portalMs);
    }
    await tick(10000); assert.equal(chanceCalls, 1, 'one living natural goblin still blocks the next natural roll');
    await attack(gm, natural.id, 'eagles-eye'); await tick(1500);
    await until(() => gm.snapshot.enemies.find(e => e.id === natural.id)?.alive === false, 'natural goblin killed');
    const afterKillDraws = chanceCalls; spawnAngle = 90;
    await tick(startedAt + 30000 - clock);
    assert.equal(chanceCalls, afterKillDraws + 1, 'manual goblins do not occupy the vacated natural slot');
    assert.equal(gm.snapshot.enemies.filter(e => e.treasure && e.alive).length, 3);
    await stop();
  } finally { rules.spawnIntervalMs = interval; }

  const [runner] = await start(), running = await spawn(runner, 20000, true), hp = runner.player().hp;
  await move(runner, { x: anchor.x, z: expectedSpawn.z - 11 });
  await until(() => runner.goblin()?.treasure.escapeAt, 'proximity starts escape');
  const escapeAt = runner.goblin().treasure.escapeAt, beforeRun = runner.goblin(); await tick(100);
  assert(Math.hypot(runner.goblin().x - runner.player().x, runner.goblin().z - runner.player().z) > Math.hypot(beforeRun.x - runner.player().x, beforeRun.z - runner.player().z));
  assert(Math.hypot(runner.goblin().x - beforeRun.x, runner.goblin().z - beforeRun.z) <= rules.fleeSpeed * .1 + .001);
  await attack(runner, running.id, 'tranquilizing-shot'); await tick(2500);
  assert.equal(runner.goblin().treasure.escapeAt, escapeAt, 'a stun cannot restart the timer');
  await tick(escapeAt - rules.portalMs - clock); const portal = runner.goblin(); await tick(200);
  assert.deepEqual([runner.goblin().x, runner.goblin().z], [portal.x, portal.z], 'portal channel remains at its advertised position');
  assert.equal(runner.player().hp, hp); assert.equal(runner.goblin().attack, null, 'goblin never attacks');
  await tick(escapeAt - 2600 - clock); const damageMessages = runner.messages.filter(m => m.type === 'damage' && m.targetId === running.id).length;
  await attack(runner, running.id, 'eagles-eye'); await tick(escapeAt - clock + 1000);
  assert(!runner.goblin(), 'escape wins against projectiles arriving at or beyond the deadline');
  assert.equal(runner.messages.filter(m => m.type === 'damage' && m.targetId === running.id).length, damageMessages, 'the late projectile cannot damage the escaped goblin');
  assert(!runner.snapshot.loot.some(d => d.enemyId === running.id)); await tick(15000); assert(!runner.goblin(), 'escaped goblins do not use ordinary respawn'); await stop();

  // Check both sides of the 10% boundary using real kills, party loot, persistence, and replay.
  for (const [roll, ranged] of [[9, false], [10, false], [0, true]]) {
    const [killer, member] = await start(2);
    killer.send({ type: 'partyInvite', targetId: member.id });
    const invitation = await until(() => member.snapshot?.partyInvites[0], 'party invitation'); member.send({ type: 'partyAccept', invitationId: invitation.id });
    await until(() => killer.snapshot?.party?.members.length === 2, 'party formed');
    const goblin = await spawn(killer, 1, !ranged); const spawnDraws = chanceCalls;
    if (!ranged) { await move(killer, { x: anchor.x, z: expectedSpawn.z - 13 }); await move(member, { x: anchor.x + .5, z: expectedSpawn.z - 13 }); }
    chance = roll; await attack(killer, goblin.id, ranged ? 'eagles-eye' : 'arrow'); await tick(1500);
    const corpses = [killer, member].flatMap(client => client.snapshot.loot.filter(d => d.enemyId === goblin.id));
    assert.equal(corpses.length, ranged ? 1 : 2, 'the killer keeps credit beyond the ordinary 14-meter party radius');
    assert.equal(chanceCalls, spawnDraws + 1, 'a party kill rolls the voucher exactly once');
    const vouchers = corpses.flatMap(d => d.items.filter(row => row.itemId === 'moss-voucher').map(row => ({ ownerId: d.ownerId, quantity: row.quantity })));
    assert.deepEqual(vouchers, roll < 10 ? [{ ownerId: killer.id, quantity: 1 }] : []);
    assert(killer.goblin() && !killer.goblin().alive); await tick(15000); assert.equal(killer.goblin().alive, false, 'killed goblins do not respawn');
    if (roll < 10) {
      const drop = corpses.find(d => d.ownerId === killer.id); await move(killer, { x: drop.x, z: drop.z - 1 });
      const foreignCount = member.messages.length; member.send({ type: 'loot', targetId: drop.id, itemId: 'item:moss-voucher' });
      await until(() => member.messages.slice(foreignCount).some(m => m.type === 'event' && m.kind === 'info'), 'foreign loot rejected');
      assert.equal(member.player().carriedItems['moss-voucher'] ?? 0, 0);
      for (let i = 0; i < 2; i++) killer.send({ type: 'loot', targetId: drop.id, itemId: 'item:moss-voucher' });
      await until(() => killer.player().carriedItems['moss-voucher'] === 1, 'voucher collected once');
      const saved = JSON.parse(readFileSync(file, 'utf8'))[killer.recordKey].characters[0]; assert.equal(saved.carriedItems['moss-voucher'], 1);
      await tick(1000); assert.equal(killer.player().carriedItems['moss-voucher'], 1); assert.equal(chanceCalls, spawnDraws + 1, 'opening or replaying a corpse never rerolls');
    }
    await stop();
  }
  console.log('PASS: authorized extra GM spawns, forged/self-target/terrain denial, independent natural timing and cap, rare occupied-world spawn, idle expiry, collision-aware fleeing, fixed portal/deadline, no attacks/respawn, exactly 10% single party roll, personal ownership, durable pickup and replay protection.');
} finally { await stop(); await new Promise(resolve => identity.close(resolve)); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
