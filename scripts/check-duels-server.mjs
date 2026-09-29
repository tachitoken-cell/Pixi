import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { CHARACTER_CLASSES } from '../src/shared.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, spellsForClass, defaultHotbar, spellDamage } from '../src/spells.ts';
import { AUTO_ATTACKS, autoAttackTiming, autoAttackDamage } from '../src/auto-attacks.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { regionAt, canTraverse } from '../src/realm.ts';

// Real server ticks and WebSockets; isolated saves and a monotonic clock keep combat deterministic.
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-duels-')), clients = [], realNow = Date.now;
const origin = ZONES[0].enemies.find(enemy => enemy.id === 'slime-1');
let game, port, clock = realNow(); Date.now = () => clock;
const key = token => createHash('sha256').update(token).digest('hex');
const pvpDamage = (damage, defense, scale = .2) => Math.max(1, Math.round(Math.max(1, damage - defense) * scale));
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const value = predicate(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(at = clock) { assert(at >= clock); clock = Math.ceil(at); await delay(125); }
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = null; }
function hero(name, className, z) {
  const learnedSpells = spellsForClass(className).map(spell => spell.id), level = 60, x = origin.x;
  return { id: randomUUID(), name, x, z, zone: regionAt(x, z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    characterCreated: true, talents: [], ...starterGear(className), learnedSpells, hotbar: defaultHotbar(className, level, learnedSpells),
    ridingRank: 0, ownedMounts: [], hp: 808, maxHp: 808, level, xp: 0, gold: 0, carriedItems: { 'trail-bread': 1 },
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
    quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function connect(token, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, token, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === id);
  client.combats = () => client.messages.filter(message => message.type === 'combat' && message.playerId === id);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['roster', 'welcome', 'snapshot'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'private roster');
  client.send({ type: 'selectCharacter', characterId: id }); await until(() => client.player(), 'world entry');
  return client;
}
async function fixture(className = 'Ranger', hp = 150, { opponentClass = 'Knight', bystanderClass = 'Ranger' } = {}) {
  await stop(); clock += 30000;
  const heroes = [hero('Challenger', className, origin.z), hero('Opponent', opponentClass, origin.z + 2), hero('Bystander', bystanderClass, origin.z + 1)];
  heroes[1].hp = typeof hp === 'function' ? hp(heroes[0], heroes[1]) : hp;
  assert(heroes.every(player => canTraverse(heroes[0], player)), 'clear duel fixture');
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dataDir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((player, index) => [key(tokens[index]), { characters: [player] }]))));
  const spawns = ZONES.map(zone => zone.enemies); ZONES.forEach(zone => { zone.enemies = []; });
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES.forEach((zone, index) => { zone.enemies = spawns[index]; }); }
  port = await game.start();
  return Promise.all(tokens.map((token, index) => connect(token, heroes[index].id)));
}
async function request(a, b) {
  await tick(clock + 1001); // Invitations share the server's one-second request cooldown.
  a.send({ type: 'duelRequest', targetId: b.player().id });
  return until(() => b.snapshot.duelInvites.find(invite => invite.inviterId === a.player().id), 'private duel invitation');
}
async function start(a, b) {
  const invitation = await request(a, b); b.send({ type: 'duelAccept', invitationId: invitation.id });
  await until(() => a.snapshot.duel && b.snapshot.duel, 'mutually accepted duel');
  assert.equal(a.snapshot.duel.id, b.snapshot.duel.id);
  assert.equal(a.snapshot.duel.opponentId, b.player().id); assert.equal(a.snapshot.duel.opponentName, b.player().name);
  assert.equal(b.snapshot.duel.opponentId, a.player().id);
  assert.equal(a.player().duelOpponentId, b.player().id); assert.equal(b.player().duelOpponentId, a.player().id);
  assert.equal(a.snapshot.duelInvites.length + b.snapshot.duelInvites.length, 0);
}
async function rejected(client, message) {
  await tick(clock + 701); const index = client.messages.length; client.send(message);
  return until(() => client.messages.slice(index).find(message => message.type === 'event' && message.kind === 'info'), `reject ${message.type}`);
}
async function move(client, point, blocked = false) {
  assert(canTraverse(client.player(), point), 'test movement has clear ground');
  const index = client.messages.length, previous = { x: client.player().x, z: client.player().z };
  client.send({ type: 'move', ...point, zone: client.player().zone, rotation: 0 });
  if (blocked) {
    const correction = await until(() => client.messages.slice(index).find(message => message.type === 'correction'), 'movement rejected');
    assert.deepEqual({ x: correction.x, z: correction.z }, previous); return correction;
  }
  await until(() => Math.hypot(client.player().x - point.x, client.player().z - point.z) < .001, 'legal movement');
}
async function release(client, target, ability) {
  const count = client.combats().length;
  client.send(ability ? { type: 'attack', ability, targetId: target.player().id } : { type: 'autoAttack', targetId: target.player().id });
  await until(() => client.player().casting || client.combats().length > count, 'attack accepted');
  if (client.player().casting) await tick(client.player().casting.endsAt);
  return until(() => client.combats()[count], 'attack released');
}
function impact(client, event) {
  const target = event.targets[0], distance = Math.hypot(target.x - event.from.x, target.z - event.from.z);
  const timing = event.basic ? autoAttackTiming(client.player().appearance.className, distance) : combatTiming(event.ability, distance);
  return event.startedAt + (timing.delay + timing.flight) * 1000;
}
async function ended(a, b, hp = 1) {
  await until(() => a.snapshot.duel === null && b.snapshot.duel === null, 'duel ends on both clients');
  assert.equal(b.player().hp, hp); assert(!b.player().diedAt, 'duel never enters death/respawn');
  for (const client of [a, b]) {
    assert.equal(client.player().duelOpponentId, null); assert.equal(client.player().autoAttack, null); assert.equal(client.player().casting, null);
    assert.equal(client.player().duelStatus, null, 'ending clears all duel control effects');
    assert.equal(client.player().xp, 0); assert.equal(client.player().gold, 0); assert.equal(client.player().quest.kills, 0);
    assert.equal(client.snapshot.loot.length, 0, 'duels never award loot');
  }
}

try {
  {
    const [a, b, bystander] = await fixture();
    let invitation = await request(a, b);
    assert.equal(a.snapshot.duel, null); assert.equal(b.snapshot.duel, null, 'request alone never allows PvP');
    assert.equal(bystander.snapshot.duelInvites.length, 0, 'invitation is private');
    await rejected(bystander, { type: 'duelAccept', invitationId: invitation.id });
    await rejected(a, { type: 'duelAccept', invitationId: invitation.id });
    await rejected(a, { type: 'autoAttack', targetId: b.player().id });
    await rejected(a, { type: 'attack', ability: 'arrow', targetId: b.player().id });
    assert.equal(b.player().hp, 150);
    b.send({ type: 'duelDecline', invitationId: invitation.id }); await until(() => !b.snapshot.duelInvites.length, 'decline');
    await start(a, b);
    await rejected(bystander, { type: 'attack', ability: 'arrow', targetId: b.player().id });
    await rejected(a, { type: 'autoAttack', targetId: bystander.player().id });
    a.send({ type: 'duelForfeit' }); await ended(a, b, 150);
    invitation = await request(a, b); await tick(clock + 31000);
    await until(() => !b.snapshot.duelInvites.length, 'invitation expiry');
    await rejected(b, { type: 'duelAccept', invitationId: invitation.id });
    await start(a, b); a.socket.close();
    await until(() => b.snapshot.duel === null, 'disconnect ends duel'); assert.equal(b.player().hp, 150);
    const again = await connect(a.token, a.welcome.id); assert.equal(again.snapshot.duel, null, 'reconnect never restores transient duels');
    await request(again, b); again.send({ type: 'leaveWorld' });
    await until(() => !b.snapshot.duelInvites.length, 'world departure removes pending invitations');
  }
  for (const className of CHARACTER_CLASSES) {
    const [a, b] = await fixture(className, (attacker, target) => pvpDamage(autoAttackDamage(className, combatStats(attacker)), combatStats(target).defense) + 2); await start(a, b);
    const first = await release(a, b), initial = b.player().hp;
    await tick(impact(a, first) - 1); assert.equal(b.player().hp, initial, `${className}: HP waits for actual contact`);
    await tick(impact(a, first) + 1); assert(b.player().hp > 1 && b.player().hp < initial, `${className}: basic hit damages opponent`);
    await tick(a.player().autoAttack.nextAttackAt);
    const second = await until(() => a.combats()[1], 'second automatic swing'); await tick(impact(a, second) + 1);
    await ended(a, b); const count = a.combats().length; await tick(clock + 10000);
    assert.equal(b.player().hp, 1); assert.equal(a.combats().length, count, 'no automatic hits continue after defeat');
    const [caster, victim] = await fixture(className, 2); await start(caster, victim);
    const cast = await release(caster, victim, AUTO_ATTACKS[className].ability); await tick(impact(caster, cast) + 1);
    await ended(caster, victim);
  }
  {
    const [a, b, bystander] = await fixture('Ranger', 808); await start(a, b);
    for (const ability of ['volley', 'multishot', 'explosive-arrow']) {
      await tick(clock + 2000); const before = b.player().hp, cast = await release(a, b, ability);
      assert.deepEqual(cast.targets.map(target => target.id), [b.player().id], `${ability}: radial, chain and splash exclude bystanders`);
      await tick(impact(a, cast) + 1); assert(b.player().hp < before); assert.equal(bystander.player().hp, 808);
    }
    a.send({ type: 'duelForfeit' }); await ended(a, b, b.player().hp);
  }
  {
    const [a, b, outsider] = await fixture('Cleric', 150, { opponentClass: 'Cleric', bystanderClass: 'Cleric' });
    outsider.send({ type: 'attack', ability: 'heal', targetId: b.player().id });
    const outsideCast = await until(() => outsider.player().casting, 'outside heal begins before duel');
    await start(a, b); await tick(outsideCast.endsAt);
    assert.equal(b.player().hp, 150); assert.equal(outsider.combats().length, 0, 'duel acceptance invalidates an already-casting outside heal');
    for (const ability of ['heal', 'power-word-shield']) {
      assert.match((await rejected(outsider, { type: 'attack', ability, targetId: b.player().id })).text, /friendly target/);
      assert.equal(outsider.player().casting, null); assert.equal(b.player().hp, 150); assert.equal(b.player().shield, null);
    }
    assert.match((await rejected(b, { type: 'useItem', itemId: 'trail-bread' })).text, /combat/);
    assert.equal(b.player().hp, 150); assert.equal(b.player().carriedItems['trail-bread'], 1, 'duel blocks food without consuming it');
    await release(b, b, 'heal'); await until(() => b.player().hp > 150, 'duelist self heal restores actual HP');
    await tick(clock + 1501); await release(b, b, 'power-word-shield');
    const shield = await until(() => b.player().shield, 'duelist self shield applied'), hp = b.player().hp;
    const hit = await release(a, b, 'searing-light'); await tick(impact(a, hit) + 1);
    assert.equal(b.player().hp, hp); assert(b.player().shield.amount < shield.amount, 'self shield actually absorbs opponent damage');
    a.send({ type: 'duelForfeit' }); await ended(a, b, hp);
  }
  {
    const [a, b] = await fixture('Ranger', 808, { opponentClass: 'Mage' }); await start(a, b);
    const basic = await release(b, a), stun = await release(a, b, 'concussive-shot');
    assert(impact(a, stun) < impact(b, basic), 'stun lands while opposing projectile is still in flight');
    await tick(impact(a, stun) + 1); assert(b.player().duelStatus.stunUntil > clock);
    await tick(impact(b, basic) + 1);
    assert.equal(a.player().hp, 808 - pvpDamage(autoAttackDamage('Mage', combatStats(b.player())), combatStats(a.player()).defense), 'an already released projectile survives a later stun and retains PvP reduction');
    a.send({ type: 'duelForfeit' }); await ended(a, b, b.player().hp);
  }
  {
    const [a, b] = await fixture('Ranger', 808, { opponentClass: 'Mage' }); await start(a, b);
    const stun = await release(a, b, 'tranquilizing-shot');
    b.send({ type: 'attack', ability: 'fireball', targetId: a.player().id }); await until(() => b.player().casting, 'opponent begins casting');
    b.send({ type: 'autoAttack', targetId: a.player().id }); await until(() => b.player().autoAttack, 'opponent arms autos during cast');
    await tick(impact(a, stun) + 1); assert.equal(b.player().casting, null, 'stun interrupts the actual spell cast');
    const endsAt = b.player().duelStatus.stunUntil;
    assert.match((await move(b, { x: b.player().x, z: b.player().z + 1 }, true)).reason, /stunned/);
    for (const message of [{ type: 'attack', ability: 'fireball', targetId: a.player().id }, { type: 'jump' }, { type: 'autoAttack', targetId: a.player().id }])
      assert.match((await rejected(b, message)).text, /stunned/);
    await tick(endsAt - 1); assert.equal(b.combats().length, 0, 'stun pauses armed autos and prevents interrupted spell damage'); assert.equal(a.player().hp, 808);
    a.send({ type: 'duelForfeit' }); await ended(a, b, b.player().hp);
  }
  {
    const [a, b] = await fixture('Ranger', 808); await start(a, b);
    const slow = await release(a, b, 'hamstring-shot'); await tick(impact(a, slow) + 1);
    const point = { x: b.player().x, z: b.player().z - 2.8 }; await tick(clock + 500);
    await move(b, point, true); assert(b.player().duelStatus.slowUntil > clock, 'active slow enforces reduced movement credit');
    a.send({ type: 'duelForfeit' }); await ended(a, b, b.player().hp);
    await move(b, point); // Same distance and clock now succeed because ending removed the slow.
  }
  {
    const [a, b] = await fixture(), invitation = await request(a, b);
    for (let step = 0; step < 3; step++) { await tick(clock + 600); await move(b, { x: b.player().x, z: b.player().z + 3 }); }
    assert(Math.hypot(a.player().x - b.player().x, a.player().z - b.player().z) > 8);
    assert.match((await rejected(b, { type: 'duelAccept', invitationId: invitation.id })).text, /nearby/);
    assert.equal(a.snapshot.duel, null); assert.equal(b.snapshot.duel, null, 'acceptance rechecks actual distance after invitation');
  }
  {
    const [a, b] = await fixture('Ranger', (attacker, target) => pvpDamage(spellDamage(SPELLS['poison-shot'], combatStats(attacker)), combatStats(target).defense, .1) + 2);
    await start(a, b); const cast = await release(a, b, 'poison-shot'), hitAt = impact(a, cast);
    await tick(hitAt + 1); assert.equal(b.player().hp, 2, 'initial poison impact lands before its scheduled ticks');
    await tick(hitAt + 1001); await ended(a, b);
    await tick(clock + 10000); assert.equal(b.player().hp, 1, 'remaining poison cannot kill after duel ends');
  }
  {
    const [a, b] = await fixture('Ranger', (attacker, target) => pvpDamage(spellDamage(SPELLS['rapid-fire'], combatStats(attacker)), combatStats(target).defense) + 2);
    await start(a, b); a.send({ type: 'attack', ability: 'rapid-fire', targetId: b.player().id });
    const cast = await until(() => a.player().casting, 'channel starts');
    await tick(cast.startedAt + 500); const first = await until(() => a.combats()[0], 'first channel pulse');
    await tick(impact(a, first) + 1); assert.equal(b.player().hp, 2);
    await tick(cast.startedAt + 1000); const second = await until(() => a.combats()[1], 'second channel pulse');
    await tick(impact(a, second) + 1); await ended(a, b);
    await tick(cast.endsAt + 10000); assert.equal(b.player().hp, 1); assert.equal(a.combats().length, 2, 'defeat cancels remaining channel pulses');
  }
  {
    const [a, b] = await fixture('Ranger', 808); await start(a, b);
    const oldDuel = a.snapshot.duel.id, cast = await release(a, b, 'poison-shot');
    a.send({ type: 'duelForfeit' }); await ended(a, b, 808);
    await start(a, b); assert.notEqual(a.snapshot.duel.id, oldDuel);
    await tick(impact(a, cast) + 10000); assert.equal(b.player().hp, 808, 'old projectile and poison cannot leak into a rematch');
    b.send({ type: 'leaveWorld' }); await until(() => a.snapshot.duel === null, 'active duel ends on world departure');
  }
  console.log('PASS duels: private consent and accept range, invalid-target guards, lifecycle cleanup, all four classes, exact 1 HP without death/rewards, AoE isolation, outside-support/food denial, self-heal/shield absorption, stun/slow behavior, poison/channel cancellation and rematch safety.');
} finally { await stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true }); }
