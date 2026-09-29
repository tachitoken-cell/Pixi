import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { CHARACTER_CLASSES, DEATH_ANIMATION_MS } from '../src/shared.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, spellsForClass, defaultHotbar, spellDamage } from '../src/spells.ts';
import { AUTO_ATTACKS, autoAttackTiming } from '../src/auto-attacks.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { regionAt, canTraverse } from '../src/realm.ts';
import { COLOSSEUM, COLOSSEUM_ENTRANCE, isInColosseum } from '../src/colosseum.ts';
import { moveJump } from '../src/jumping.ts';
import { CLIMB_ENABLED } from '../src/climbing.ts';

// Real server ticks and WebSockets; isolated saves and a monotonic clock keep combat deterministic.
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-colosseum-')), clients = [], realNow = Date.now;
const origin = { x: COLOSSEUM.x, z: COLOSSEUM.z + COLOSSEUM.radius - 3 };
let game, port, clock = realNow(); Date.now = () => clock;
const key = token => createHash('sha256').update(token).digest('hex');
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const value = predicate(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(at = clock) {
  assert(at >= clock); clock = at;
  const before = clients.map(client => client.snapshot);
  // Combat settles before the realm snapshots; timer expiry alone does not flush WebSocket delivery.
  await until(() => clients.every((client, index) => client.snapshot !== before[index] && client.snapshot?.serverTime >= at), `realm snapshots at ${at}`);
}
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
async function fixture(className = 'Ranger', hp = 150, { opponentClass = 'Knight', bystanderClass = 'Ranger', positions = [], angle = 0 } = {}) {
  await stop(); clock += 30000;
  const heroes = [hero('Challenger', className, origin.z), hero('Opponent', opponentClass, origin.z + 2), hero('Bystander', bystanderClass, origin.z + 1)];
  heroes.forEach((player, i) => {
    const radius = positions[i] !== undefined ? COLOSSEUM.radius + positions[i] : player.z - COLOSSEUM.z;
    player.x = COLOSSEUM.x + Math.sin(angle) * radius; player.z = COLOSSEUM.z + Math.cos(angle) * radius;
    player.zone = regionAt(player.x, player.z);
  });
  heroes[1].hp = typeof hp === 'function' ? hp(heroes[0], heroes[1]) : hp;
  assert(heroes.every(player => canTraverse(heroes[0], player)), 'clear arena fixture');
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dataDir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((player, index) => [key(tokens[index]), { characters: [player] }]))));
  const spawns = ZONES.map(zone => zone.enemies); ZONES.forEach(zone => { zone.enemies = []; });
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES.forEach((zone, index) => { zone.enemies = spawns[index]; }); }
  port = await game.start();
  return Promise.all(tokens.map((token, index) => connect(token, heroes[index].id)));
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
  await until(() => Math.hypot(client.player().x - point.x, client.player().z - point.z) < .001, 'legal movement').catch(error => { throw Error(JSON.stringify({target:point,player:client.player(),corrections:client.messages.slice(index).filter(m=>m.type==='correction')}), {cause:error}); });
}
async function spectatorRoute(client, goal) {
  let jumps = 0, blockedTicks = 0;
  const stamina = client.player().travel.stamina;
  for (let steps = 0; Math.hypot(client.player().x-goal.x,client.player().z-goal.z) > .02; steps++) {
    assert(steps < 600, 'spectator movement makes progress toward the next waypoint');
    await tick(clock + 100);
    const player = client.player(), gap = Math.hypot(goal.x-player.x,goal.z-player.z), step = Math.min(.4,gap);
    const next = { x:player.x+(goal.x-player.x)*step/gap, z:player.z+(goal.z-player.z)*step/gap };
    if (moveJump({...player.jump},player,next,false,'overworld')) {
      await move(client,next); blockedTicks = 0;
    } else {
      assert(++blockedTicks < 30, `normal jumps clear the spectator riser at ${player.x},${player.jump.y},${player.z}`);
      if (player.jump.grounded) {
        const sequence = player.jump.sequence, index = client.messages.length;
        client.send({type:'jump'});
        await until(() => client.player().jump.sequence > sequence || client.messages.slice(index).find(message=>message.type==='correction'), 'spectator jump accepted');
        assert(!client.player().jump.grounded && client.player().jump.sequence > sequence, 'the realm accepts a normal jump from the terrace');
        jumps++;
      }
    }
    assert.equal(client.player().pvp,false,'spectator access never crosses the PvP floor');
    assert(!client.player().jump.climb,'spectator access never activates climbing');
    assert.equal(client.player().travel.stamina,stamina,'normal spectator movement and jumping consume no stamina');
  }
  for (let ticks = 0; !client.player().jump.grounded; ticks++) {
    assert(ticks < 20, 'spectator lands on supported terrace geometry');
    await tick(clock + 100);
  }
  assert.equal(client.player().pvp,false,'the landed spectator remains outside the PvP floor');
  assert(!client.player().jump.climb);
  assert.equal(client.player().travel.stamina,stamina);
  return jumps;
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

try {
  {
    // This supported terrace point leaves capsule clearance beside the actual parapet.
    const radius=Math.hypot(22.5,58.5)-1,angle=Math.atan2(22.5,58.5),corner={x:COLOSSEUM.x+Math.sin(angle)*radius,z:COLOSSEUM.z+Math.cos(angle)*radius};
    const [spectator]=await fixture('Ranger',808,{positions:[radius-COLOSSEUM.radius],angle});
    assert(spectator.player().jump.y>10&&spectator.player().jump.grounded,'saved wall-corner characters reconnect on the upper terrace');
    const inside={x:corner.x+.45,z:corner.z-.17};
    await tick(clock+500);await move(spectator,inside);
    await tick(clock+500);await move(spectator,corner);await tick(clock+2000);
    assert(spectator.player().jump.y>10&&spectator.player().jump.grounded,'authoritative movement does not fall below the wall corner');
    await move(spectator,inside);assert.equal(spectator.player().pvp,false);
  }
  {
    const [spectator] = await fixture('Ranger', 808, { positions: [COLOSSEUM_ENTRANCE.z - COLOSSEUM.z - COLOSSEUM.radius] });
    const safeRadius = COLOSSEUM.radius + 1.5, path = [{ x: COLOSSEUM.x, z: COLOSSEUM.z + safeRadius }];
    for (let step = 1; step <= 18; step++) {
      const angle = Math.PI / 4 * step / 18;
      path.push({ x: COLOSSEUM.x + Math.sin(angle) * safeRadius, z: COLOSSEUM.z + Math.cos(angle) * safeRadius });
    }
    path.push({ x: COLOSSEUM.x + Math.SQRT1_2 * (COLOSSEUM.outerRadius-5), z: COLOSSEUM.z + Math.SQRT1_2 * (COLOSSEUM.outerRadius-5) });
    assert.equal(CLIMB_ENABLED,false,'climbing remains disabled during spectator access');
    let jumps=0;for (const point of path) jumps+=await spectatorRoute(spectator,point);
    assert(jumps>0,'authored solid terrace risers require normal jumps');
    assert(spectator.player().jump.y > 8 && spectator.player().jump.grounded, 'real movement reaches supported upper spectator seats');
  }
  for (const className of CHARACTER_CLASSES) {
    const [a, b, third] = await fixture(className, 2);
    for (const client of [a, b, third]) {
      assert.equal(client.player().pvp, true); assert.equal(client.snapshot.duel, null);
    }
    const attack = await release(a, b), hitAt = impact(a, attack);
    await tick(hitAt - 1); assert.equal(b.player().hp, 2, `${className}: HP waits for impact`);
    await tick(hitAt + 1);
    assert.equal(b.player().hp, 0, `${className}: arena basics kill without a duel`);
    assert.equal(b.player().diedAt, hitAt); assert.equal(b.player().duelStatus, null);
    const before = b.player(); b.send({ type: 'respawn' }); await tick();
    assert.equal(b.player().hp, 0, 'normal death animation is enforced');
    await tick(hitAt + DEATH_ANIMATION_MS + 1); b.send({ type: 'respawn' });
    await until(() => b.player().hp === b.player().maxHp, 'normal refuge respawn');
    assert.equal(b.player().pvp, false); assert.equal(isInColosseum(b.player()), false);
    assert.deepEqual(b.player().inventory, before.inventory, 'death preserves belongings');
    assert.equal(a.player().xp, 0); assert.equal(a.player().gold, 0); assert.equal(a.snapshot.loot.length, 0, 'PvP awards no PvE loot');
    const thirdHit = await release(a, third, AUTO_ATTACKS[className].ability);
    const hp = third.player().hp; await tick(impact(a, thirdHit) + 1);
    assert(third.player().hp < hp, `${className}: a third player is also hostile`);
  }
  {
    const [a, b, third] = await fixture('Ranger', 808);
    a.send({ type: 'partyInvite', targetId: b.player().id });
    const invite = await until(() => b.snapshot.partyInvites?.[0], 'party invitation');
    b.send({ type: 'partyAccept', invitationId: invite.id });
    await until(() => a.snapshot.party && b.snapshot.party, 'party formed');
    for (const ability of ['volley', 'multishot', 'explosive-arrow']) {
      await tick(clock + 2000); const before = b.player().hp, thirdHp = third.player().hp;
      const cast = await release(a, b, ability);
      assert.deepEqual(new Set(cast.targets.map(target => target.id)), new Set([b.player().id, third.player().id]), `${ability}: arena AoE includes party and third players`);
      await tick(impact(a, cast) + 1000);
      assert(b.player().hp < before); assert(third.player().hp < thirdHp);
    }
    await rejected(a, { type: 'duelRequest', targetId: b.player().id });
    assert.equal(b.snapshot.duelInvites.length, 0, 'cannot gain 1 HP duel protection inside');
  }
  {
    const [inside, target, outside] = await fixture('Ranger', 808, { positions: [-3, -1, 1] });
    assert.equal(outside.player().pvp, false);
    for (const [attacker, victim] of [[outside, target], [inside, outside]]) {
      await rejected(attacker, { type: 'autoAttack', targetId: victim.player().id });
      await rejected(attacker, { type: 'attack', ability: 'arrow', targetId: victim.player().id });
    }
    const cast = await release(inside, target, 'volley');
    assert.deepEqual(cast.targets.map(target => target.id), [target.player().id], 'radial AoE excludes spectators');
    await tick(impact(inside, cast) + 1); assert.equal(outside.player().hp, 808);
    await tick(clock + 2000);
    const projectile = await release(inside, target, 'arrow'), hp = target.player().hp;
    await move(target, { x: COLOSSEUM.x, z: COLOSSEUM.z + COLOSSEUM.radius + 1 });
    await tick(impact(inside, projectile) + 1); assert.equal(target.player().hp, hp, 'projectiles cannot hit someone who left');
  }
  for (const leaving of ['caster', 'target']) {
    const [a, b] = await fixture('Ranger', 808, { positions: [-1, -2] });
    const cast = await release(a, b, 'poison-shot'), hitAt = impact(a, cast);
    await tick(hitAt + 1); const hp = b.player().hp; assert(hp < 808);
    const client = leaving === 'caster' ? a : b;
    await tick(clock + 500); await move(client, { x: COLOSSEUM.x, z: COLOSSEUM.z + COLOSSEUM.radius + 1 });
    assert.equal(client.player().pvp, false);
    await tick(clock + 600); await move(client, { x: COLOSSEUM.x, z: COLOSSEUM.z + COLOSSEUM.radius - 1 });
    await tick(hitAt + 10000);
    assert.equal(b.player().hp, hp, `${leaving}: leaving and reentering cancels poison permanently`);
  }
  {
    const [a, b, spectator] = await fixture('Ranger', 808, { positions: [-.5, -.1, 4], angle: Math.PI / 4 });
    assert.equal(spectator.player().pvp, false);
    assert(spectator.player().jump.y > a.player().jump.y, 'spectator stands on a raised seating tier');
    for (const [attacker, target] of [[a, spectator], [spectator, a]]) {
      await rejected(attacker, { type: 'autoAttack', targetId: target.player().id });
      await rejected(attacker, { type: 'attack', ability: 'arrow', targetId: target.player().id });
    }
    for (const ability of ['volley', 'starfall-arrow']) {
      const cast = await release(a, b, ability), hp = b.player().hp;
      assert.deepEqual(cast.targets.map(target => target.id), [b.player().id], `${ability}: nearby raised seats are excluded from AoE`);
      await tick(impact(a, cast) + 1);
      assert(b.player().hp < hp); assert.equal(spectator.player().hp, 808);
      await tick(clock + 2000);
    }
  }
  {
    const [a, b] = await fixture('Mage', 808);
    a.send({ type: 'attack', ability: 'fireball', targetId: b.player().id });
    const cast = await until(() => a.player().casting, 'cast begins');
    await tick(clock + 500); await move(b, { x: COLOSSEUM.x, z: COLOSSEUM.z + COLOSSEUM.radius + 1 });
    await tick(cast.endsAt + 2000);
    assert.equal(b.player().hp, 808); assert.equal(a.player().casting, null, 'leaving cancels incoming casts before release');
    assert.equal(a.combats().length, 0);
  }
  {
    const [a, b] = await fixture('Ranger', 808);
    a.send({ type: 'attack', ability: 'rapid-fire', targetId: b.player().id });
    const cast = await until(() => a.player().casting, 'channel begins');
    await tick(cast.startedAt + 500); const first = await until(() => a.combats()[0], 'channel pulse');
    await tick(impact(a, first) + 1); const hp = b.player().hp;
    await move(b, { x: COLOSSEUM.x, z: COLOSSEUM.z + COLOSSEUM.radius + 1 });
    await tick(cast.endsAt + 2000);
    assert.equal(b.player().hp, hp); assert.equal(a.combats().length, 1, 'boundary cancels remaining channel pulses');
  }
  {
    const [a, b, outside] = await fixture('Cleric', 150, { opponentClass: 'Cleric', bystanderClass: 'Cleric', positions: [-3, -1, 1] });
    for (const [healer, victim] of [[outside, b], [a, b], [a, outside]]) for (const ability of ['heal', 'power-word-shield']) {
      assert.match((await rejected(healer, { type: 'attack', ability, targetId: victim.player().id })).text, /friendly target/);
    }
    assert.equal(b.player().hp, 150); assert.equal(b.player().shield, null);
    assert.match((await rejected(b, { type: 'useItem', itemId: 'trail-bread' })).text, /combat/);
    await release(b, b, 'heal'); assert(b.player().hp > 150, 'self heal works in free-for-all');
    await tick(clock + 1501); await release(b, b, 'power-word-shield');
    const shield = b.player().shield, hp = b.player().hp;
    const hit = await release(a, b, 'searing-light'); await tick(impact(a, hit) + 1);
    assert.equal(b.player().hp, hp); assert(b.player().shield.amount < shield.amount, 'self shield absorbs real PvP');
  }
  {
    const [, b, healer] = await fixture('Cleric', 150, { bystanderClass: 'Cleric', positions: [-3, 1, 3] });
    healer.send({ type: 'attack', ability: 'heal', targetId: b.player().id });
    const cast = await until(() => healer.player().casting, 'outside heal starts');
    await tick(clock + 500); await move(b, { x: COLOSSEUM.x, z: COLOSSEUM.z + COLOSSEUM.radius - 1 });
    await tick(cast.endsAt + 1); assert.equal(b.player().hp, 150, 'entry invalidates an outside heal already casting');
    assert.equal(healer.combats().length, 0);
  }
  {
    const [a, b] = await fixture('Ranger', (attacker, target) => Math.max(1, Math.round(Math.max(1, spellDamage(SPELLS['poison-shot'], combatStats(attacker)) - combatStats(target).defense) * .1)) + 2);
    const cast = await release(a, b, 'poison-shot'), hitAt = impact(a, cast);
    await tick(hitAt + 1); assert.equal(b.player().hp, 2);
    await tick(hitAt + 1001); assert.equal(b.player().hp, 0, 'poison ticks can kill in the arena');
    await tick(clock + DEATH_ANIMATION_MS); b.send({ type: 'respawn' });
    await until(() => b.player().hp === b.player().maxHp, 'respawn after poison death');
    await tick(hitAt + 10000); assert.equal(b.player().hp, b.player().maxHp, 'old poison never damages the new life');
  }
  {
    const [a, b] = await fixture('Ranger', 808, { opponentClass: 'Mage' });
    const stun = await release(a, b, 'tranquilizing-shot');
    b.send({ type: 'attack', ability: 'fireball', targetId: a.player().id }); await until(() => b.player().casting, 'opponent starts casting');
    await tick(impact(a, stun) + 1);
    assert.equal(b.player().casting, null); assert(b.player().duelStatus.stunUntil > clock);
    await move(b, { x: COLOSSEUM.x, z: COLOSSEUM.z + COLOSSEUM.radius + 1 }, true);
    assert.match((await rejected(b, { type: 'attack', ability: 'fireball', targetId: a.player().id })).text, /stunned/);
    await tick(b.player().duelStatus.stunUntil + 1);
    await move(b, { x: COLOSSEUM.x, z: COLOSSEUM.z + COLOSSEUM.radius + 1 });
    assert.equal(b.player().duelStatus, null, 'exit clears arena control effects');
  }
  {
    const [a, b] = await fixture('Ranger', 808);
    const slow = await release(a, b, 'hamstring-shot'); await tick(impact(a, slow) + 1);
    assert(b.player().duelStatus.slowUntil > clock);
    await tick(clock + 500); await move(b, { x: COLOSSEUM.x, z: b.player().z - 2.8 }, true);
  }
  {
    const [a, b] = await fixture('Ranger', 808, { positions: [4, 4.5, 5], angle: Math.PI / 4 });
    assert.equal(a.player().pvp, false); assert.equal(b.player().pvp, false);
    a.send({ type: 'duelRequest', targetId: b.player().id });
    const invite = await until(() => b.snapshot.duelInvites[0], 'safe spectator duel invitation');
    assert.equal(a.snapshot.duel, null); assert.equal(b.snapshot.duel, null);
    b.send({ type: 'duelAccept', invitationId: invite.id }); await until(() => a.snapshot.duel && b.snapshot.duel, 'safe spectator duel requires mutual consent');
    assert.equal(a.player().pvp, false); assert.equal(b.player().pvp, false, 'consensual duels do not enable lethal world PvP');
    a.send({ type: 'duelForfeit' }); await until(() => !a.snapshot.duel && !b.snapshot.duel, 'spectator duel cleanup');
    assert.equal(b.snapshot.duelInvites.length, 0);
  }
  {
    const entranceRadius = COLOSSEUM_ENTRANCE.z - COLOSSEUM.z;
    const [a, b] = await fixture('Ranger', 2, { positions: [entranceRadius + 8 - COLOSSEUM.radius, entranceRadius + 6 - COLOSSEUM.radius] });
    a.send({ type: 'duelRequest', targetId: b.player().id });
    const invite = await until(() => b.snapshot.duelInvites[0], 'outside duel invitation');
    b.send({ type: 'duelAccept', invitationId: invite.id }); await until(() => a.snapshot.duel && b.snapshot.duel, 'outside duel starts');
    await tick(clock + 500); await move(b, { x: COLOSSEUM.x, z: COLOSSEUM_ENTRANCE.z + 4 });
    assert(a.snapshot.duel && b.snapshot.duel, 'entering the safe spectator clearing preserves an ordinary duel');
    assert.equal(b.player().pvp, false); assert.equal(b.player().hp, 2);
    a.send({ type: 'duelForfeit' }); await until(() => !a.snapshot.duel && !b.snapshot.duel, 'outside duel forfeit');
    await rejected(a, { type: 'autoAttack', targetId: b.player().id });
    await tick(clock + 1001); a.send({ type: 'duelRequest', targetId: b.player().id });
    const rematch = await until(() => b.snapshot.duelInvites[0], 'safe spectator can be challenged from nearby outside');
    b.send({ type: 'duelDecline', invitationId: rematch.id }); await until(() => !b.snapshot.duelInvites.length, 'decline spectator rematch');
  }
  console.log('PASS colosseum: safe spectator walk and raised-seat immunity, all four classes, third-player and party free-for-all, lethal hits and refuge respawn, no rewards, AoE and border safety, poison/reentry/cast/channel cancellation, self support, stun/slow, and duel transition.');
} finally { await stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true }); }
