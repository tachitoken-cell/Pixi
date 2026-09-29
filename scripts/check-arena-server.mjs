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
import { combatStats, starterGear } from '../src/progression.ts';
import { SPELLS, spellCastTimeMs, spellsForClass, defaultHotbar } from '../src/spells.ts';
import { AUTO_ATTACKS, autoAttackTiming } from '../src/auto-attacks.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { regionAt, canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { COLOSSEUM } from '../src/colosseum.ts';
import { ARENA_ENTRANCE, ARENA_BOUNDS, ARENA_COLLIDERS, isArenaInstance } from '../src/arena.ts';

// Real WebSockets, normal movement validation and isolated saves. The mocked Date.now stays in integer milliseconds.
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-arena-')), clients = [], realNow = Date.now;
let game, port, clock = realNow(); Date.now = () => clock;
const point = (x, z) => ({ x, z });
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const value = predicate(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(at = clock) {
  assert(at >= clock, 'test clock is monotonic');
  // Compressed snapshots can arrive after the next server tick. Observe every
  // participant's new state before choosing another attack or reading results.
  const frames = clients.filter(c => c.inWorld && c.socket.readyState === WebSocket.OPEN).map(c => [c, c.snapshot]);
  clock = Math.ceil(at);
  await until(() => frames.every(([c, before]) => !c.inWorld || c.socket.readyState !== WebSocket.OPEN
    || c.snapshot !== before && c.snapshot.serverTime === clock), 'fresh arena snapshots after clock advance');
}
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = null; }
function hero(name, className, index) {
  const learnedSpells = spellsForClass(className).map(spell => spell.id), level = 60, x = ARENA_ENTRANCE.x + index * 2 - 4, z = ARENA_ENTRANCE.z;
  return { id: randomUUID(), name, x, z, zone: regionAt(x, z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    characterCreated: true, talents: [], ...starterGear(className), learnedSpells, hotbar: defaultHotbar(className, level, learnedSpells),
    ridingRank: 0, ownedMounts: [], hp: 808, maxHp: 808, level, xp: 0, gold: 0, carriedItems: { 'trail-bread': 1 },
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
    quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function connect(token, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, token, id, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === id);
  client.combats = () => client.messages.filter(message => message.type === 'combat' && message.playerId === id);
  socket.on('message', raw => {
    const message = JSON.parse(raw); client.messages.push(message);
    if (['roster', 'welcome', 'snapshot'].includes(message.type)) client[message.type] = message;
    if (message.type === 'snapshot') client.inWorld = true;
    if (message.type === 'roster') client.inWorld = false;
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'private roster');
  client.send({ type: 'selectCharacter', characterId: id }); await until(() => client.player(), 'world entry'); return client;
}
async function fixture(classes = ['Ranger', 'Knight', 'Cleric', 'Ranger', 'Cleric'], points = [], hp = 808) {
  await stop(); clock += 30000;
  const heroes = classes.map((className, i) => ({ ...hero(['Amber', 'Briar', 'Cedar', 'Dawn', 'Elm'][i], className, i), ...points[i], hp }));
  heroes.forEach(p => { p.zone = regionAt(p.x, p.z); assert(canTraverse(p, p), 'fixture spawn is walkable'); });
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dataDir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((p, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [p] }]))));
  const spawns = ZONES.map(zone => zone.enemies); ZONES.forEach(zone => { zone.enemies = []; });
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES.forEach((zone, i) => { zone.enemies = spawns[i]; }); }
  port = await game.start(); return Promise.all(tokens.map((token, i) => connect(token, heroes[i].id)));
}
async function rejected(client, message, advance = 1001) {
  await tick(clock + advance); const index = client.messages.length; client.send(message);
  return until(() => client.messages.slice(index).find(m => m.type === 'event' && m.kind === 'info'), `reject ${message.type}`);
}
async function party(a, b) {
  await tick(clock + 1001); a.send({ type: 'partyInvite', targetId: b.id });
  const invite = await until(() => b.snapshot.partyInvites?.[0], 'party invitation');
  b.send({ type: 'partyAccept', invitationId: invite.id }); await until(() => a.snapshot.party?.members.length === 2 && b.snapshot.party, 'two-person party');
}
async function request(a, b, size = 1) {
  await tick(clock + 1001); a.send({ type: 'arenaRequest', targetId: b.id, size });
  const invite=await until(() => b.snapshot.arenaInvites.find(invite => invite.inviterId === a.id), 'arena challenge');
  for(const client of clients.filter(client=>invite.members.some(member=>member.id===client.id))){const player=client.player();client.returnState={x:player.x,z:player.z,zone:player.zone,hp:player.hp,abilityCooldowns:{...player.abilityCooldowns},globalCooldownUntil:player.globalCooldownUntil||0};}
  return invite;
}
async function start(a, b, size = 1, others = []) {
  const invite = await request(a, b, size);
  for (const member of [b, ...others]) member.send({ type: 'arenaAccept', invitationId: invite.id });
  const duel = await until(() => a.snapshot.arena?.phase === 'countdown' && a.snapshot.arena, 'unanimous ready countdown');
  assert.equal(duel.members.length, size * 2); assert.equal(duel.size, size);
  await tick(duel.startsAt + 1);
  await until(() => [a, b, ...others].every(c => c.snapshot.arena?.phase === 'active' && c.player().arenaPhase === 'active'), 'active match');
  return a.snapshot.arena;
}
async function arrange(entries) {
  const routes = entries.map(([client, goal]) => ({ client, goal, path: findPath(client.player(), goal, ARENA_COLLIDERS, ARENA_BOUNDS) }));
  assert(routes.every(r => r.path.length), 'movement route exists');
  for (let step = 0; routes.some(r => r.path.length) && step < 150; step++) {
    await tick(clock + 650);
    const moves = [];
    for (const route of routes) {
      while (route.path.length && Math.hypot(route.path[0].x - route.client.player().x, route.path[0].z - route.client.player().z) < .01) route.path.shift();
      if (!route.path.length) continue;
      const from = route.client.player(), to = route.path[0], distance = Math.hypot(to.x - from.x, to.z - from.z), ratio = Math.min(1, 2.9 / distance);
      const next = { x: from.x + (to.x - from.x) * ratio, z: from.z + (to.z - from.z) * ratio };
      assert(canTraverse(from, next, ARENA_COLLIDERS, ARENA_BOUNDS)); route.client.send({ type: 'move', ...next, rotation: 0 }); moves.push([route.client, next]);
    }
    await until(() => moves.every(([c, p]) => Math.hypot(c.player().x - p.x, c.player().z - p.z) < .01), 'legal walking');
  }
  assert(routes.every(r => Math.hypot(r.client.player().x - r.goal.x, r.client.player().z - r.goal.z) < .01));
}
async function release(a, b, ability = AUTO_ATTACKS[a.player().appearance.className].ability) {
  await tick(Math.max(clock + 1, (a.player().globalCooldownUntil || 0) + 1, (a.player().abilityCooldowns[ability] || 0) + 1));
  const count = a.combats().length, mark = a.messages.length; a.send({ type: 'attack', ability, targetId: b.id });
  await until(() => a.player().casting || a.combats().length > count || a.messages.slice(mark).some(m => m.type === 'event' && m.kind === 'info'), `accept ${ability}`);
  const rejection = a.messages.slice(mark).find(m => m.type === 'event' && m.kind === 'info');
  if (rejection) console.error('ARENA_ATTACK_REJECTION', JSON.stringify({ clock, ability, rejection: rejection.text,
    players: [a, b].map(client => ({ serverTime: client.snapshot.serverTime, arena: client.snapshot.arena?.phase,
      members: client.snapshot.arena?.members.map(({id,hp,eliminated}) => ({id,hp,eliminated})),
      players: client.snapshot.players.map(({id,x,z,hp,jump,arenaEliminated}) => ({id,x,z,hp,jump,arenaEliminated})) })) }));
  assert(!rejection, `${ability}: ${rejection?.text}; phase=${a.snapshot.arena?.phase}; attacker=${a.player().hp}; target=${b.player().hp}`);
  if (a.player().casting) await tick(a.player().casting.endsAt);
  return until(() => a.combats()[count], `release ${ability}`);
}
function impact(a, event) {
  const target = event.targets[0], distance = Math.hypot(target.x - event.from.x, target.z - event.from.z);
  const timing = event.basic ? autoAttackTiming(a.player().appearance.className, distance) : combatTiming(event.ability, distance);
  return event.startedAt + (timing.delay + timing.flight) * 1000;
}
async function hit(a, b, ability) { const event = await release(a, b, ability); await tick(Math.max(clock, impact(a, event) + 1)); return event; }
async function knockOut(a, b) {
  for (let i = 0; i < 40 && !b.player().arenaEliminated && b.snapshot.arena?.phase === 'active'; i++) await hit(a, b);
  assert.equal(b.snapshot.arena.members.find(member=>member.id===b.id).hp, 1, 'knockout stops at exactly 1 HP'); assert(!b.player().diedAt, 'no death or respawn');
}
async function finished(group, winnerTeam) {
  await until(() => group.every(c => c.snapshot.arena?.phase === 'finished'), 'result on every connected participant');
  for (const c of group) {
    assert.equal(c.snapshot.arena.winnerTeam, winnerTeam); assert.equal(c.player().pvp, false); assert.equal(c.player().arenaMatchId, null); assert.equal(c.player().arenaPhase,null); assert.equal(c.player().instanceId,null);
    assert.deepEqual({x:c.player().x,z:c.player().z,zone:c.player().zone},{x:c.returnState.x,z:c.returnState.z,zone:c.returnState.zone},'returns to the exact overworld entry point');assert.equal(c.player().hp,c.returnState.hp,'pre-match HP restored');assert.deepEqual(c.player().abilityCooldowns,c.returnState.abilityCooldowns);assert.equal(c.player().globalCooldownUntil||0,c.returnState.globalCooldownUntil);
    assert.equal(c.player().autoAttack, null); assert.equal(c.player().casting, null); assert.equal(c.player().duelStatus, null);
    assert.equal(c.player().xp, 0); assert.equal(c.player().gold, 0); assert.equal(c.player().quest.kills, 0); assert.equal(c.snapshot.loot.length, 0);
  }
}

try {
  {
    const [a, b] = await fixture(['Ranger', 'Knight'], [{x:COLOSSEUM.x,z:COLOSSEUM.z},{x:COLOSSEUM.x+2,z:COLOSSEUM.z}]);
    await rejected(a, { type: 'arenaRequest', targetId: b.id, size: 1 }); assert.equal(b.snapshot.arenaInvites.length, 0, 'private arena cannot be entered from the lethal world ring');
  }
  {
    const [a, b, c, d] = await fixture();
    assert(clients.every(c => !c.player().pvp), 'the separate arena entrance is safe');
    await rejected(a, { type: 'attack', ability: 'arrow', targetId: b.id }); assert.equal(b.player().hp, b.player().maxHp);
    await rejected(a, { type: 'arenaRequest', targetId: b.id, size: 3 }); assert.equal(b.snapshot.arenaInvites.length, 0);
    const invite = await request(a, b);
    assert.equal(invite.size, 1); assert.equal(invite.members.filter(m => m.accepted).length, 1);
    assert.equal(c.snapshot.arenaInvites.length, 0, 'challenge remains private');
    await rejected(c, { type: 'arenaAccept', invitationId: invite.id });
    const parallel=await request(c,d);assert.notEqual(parallel.id,invite.id,'another pair can issue a concurrent private challenge');d.send({type:'arenaDecline',invitationId:parallel.id});await until(()=>!c.snapshot.arenaInvites.length,'parallel challenge declined independently');
    b.send({ type: 'arenaDecline', invitationId: invite.id }); await until(() => !a.snapshot.arenaInvites.length && !b.snapshot.arenaInvites.length, 'decline cancels both sides');
    const expired = await request(a, b); await tick(clock + 31000); await until(() => !b.snapshot.arenaInvites.length, 'challenge expiry');
    await rejected(b, { type: 'arenaAccept', invitationId: expired.id });
    const ready = await request(a, b); b.send({ type: 'arenaAccept', invitationId: ready.id });
    const countdown = await until(() => a.snapshot.arena?.phase === 'countdown' && a.snapshot.arena, 'ready');
    assert(countdown.startsAt > clock && countdown.startsAt <= clock + 5000); assert(!a.player().pvp);
    const before = { x: a.player().x, z: a.player().z }, mark = a.messages.length;
    a.send({ type: 'move', x: before.x + 1, z: before.z, rotation: 0 });
    await until(() => a.messages.slice(mark).some(m => m.type === 'correction'), 'countdown rejects movement');
    assert.equal(a.player().x, before.x); await rejected(a, { type: 'attack', ability: 'arrow', targetId: b.id });
    await tick(countdown.startsAt + 1); await until(() => a.player().arenaPhase==='active' && b.player().arenaPhase==='active', 'countdown starts combat');
    assert(isArenaInstance(a.player().instanceId));assert.equal(a.player().instanceId,b.player().instanceId);assert.equal(a.snapshot.instanceId,a.player().instanceId);assert(a.player().x*b.player().x<0,'teams start at opposing ends');assert.equal(a.player().pvp,false,'private match is distinct from world PvP');
    await rejected(c, { type: 'attack', ability: 'searing-light', targetId: a.id });
    await rejected(a, { type: 'autoAttack', targetId: c.id });
    a.send({ type: 'arenaForfeit' }); await finished([a, b], 1);
  }
  {
    const [a,b,c,d,spectator]=await fixture(['Ranger','Knight','Cleric','Ranger','Cleric']);
    await start(a,b);const firstInstance=a.player().instanceId;await start(c,d);const secondInstance=c.player().instanceId;
    assert(isArenaInstance(firstInstance)&&isArenaInstance(secondInstance));assert.notEqual(firstInstance,secondInstance,'concurrent matches have distinct instances');
    await until(()=>[a,b].every(client=>client.snapshot.players.length===2)&&[c,d].every(client=>client.snapshot.players.length===2),'private snapshots settle');
    for(const group of [[a,b],[c,d]])for(const client of group){assert.deepEqual(new Set(client.snapshot.players.map(player=>player.id)),new Set(group.map(member=>member.id)));assert.equal(client.snapshot.dungeon,null);for(const field of ['enemies','nodes','loot'])assert.equal(client.snapshot[field].length,0,'arena contains no shared world entities');}
    assert(!spectator.snapshot.players.some(player=>[a,b,c,d].some(client=>client.id===player.id)),'overworld spectators never receive private arena players');
    await arrange([[a,point(0,0)],[b,point(0,2)],[c,point(0,0)],[d,point(0,2)]]);
    await rejected(a,{type:'attack',ability:'arrow',targetId:d.id});await rejected(c,{type:'attack',ability:'heal',targetId:a.id});await rejected(spectator,{type:'attack',ability:'heal',targetId:a.id});
    const marks=[c,d,spectator].map(client=>client.messages.length),before=b.player().hp;await hit(a,b);assert(b.player().hp<before);
    for(const [index,client] of [c,d,spectator].entries())assert(!client.messages.slice(marks[index]).some(message=>message.type==='combat'&&message.playerId===a.id),'combat events remain in their match instance');
    a.send({type:'arenaForfeit'});await finished([a,b],1);assert.equal(c.snapshot.arena.phase,'active','finishing one instance never ends another');assert.equal(c.player().instanceId,secondInstance);
    c.send({type:'arenaForfeit'});await finished([c,d],1);
  }
  {
    const [a,b]=await fixture(['Cleric','Knight'],[],123);
    a.send({type:'attack',ability:'heal'});const cast=await until(()=>a.player().casting,'world healing starts');
    await rejected(a,{type:'arenaRequest',targetId:b.id,size:1});assert.equal(b.snapshot.arenaInvites.length,0,'casting cannot be escaped through private matchmaking');
    await tick(cast.endsAt+1);a.send({type:'jump'});await until(()=>a.player().jump?.grounded===false,'jump starts');
    await rejected(a,{type:'arenaRequest',targetId:b.id,size:1},0);assert.equal(b.snapshot.arenaInvites.length,0,'airborne players cannot enter a private arena');
  }
  for (const className of CHARACTER_CLASSES) {
    const [a, b] = await fixture([className, 'Knight']); await start(a, b);
    await arrange([[a, point(0, 0)], [b, point(0, 2)]]);
    await knockOut(a, b); await finished([a, b], 0);
    const hp = b.player().hp; await tick(clock + 10000); assert.equal(b.player().hp, hp, `${className}: no post-result damage`);
  }
  {
    const [a, b, c, d, spectator] = await fixture(['Cleric', 'Ranger', 'Ranger', 'Knight', 'Cleric']);
    await rejected(a, { type: 'arenaRequest', targetId: c.id, size: 2 }); assert.equal(c.snapshot.arenaInvites.length, 0, '2v2 requires two full parties');
    await party(a, b); await party(c, d);
    await rejected(b, { type: 'arenaRequest', targetId: c.id, size: 2 }); assert.equal(c.snapshot.arenaInvites.length, 0, 'only leaders issue team challenges');
    const invite = await request(a, c, 2); assert.equal(invite.members.length, 4); assert.equal(spectator.snapshot.arenaInvites.length, 0);
    c.send({ type: 'arenaAccept', invitationId: invite.id }); d.send({ type: 'arenaAccept', invitationId: invite.id }); await tick();
    assert.equal(a.snapshot.arena, null, 'opposing captain cannot consent for your teammate');
    assert.equal(b.snapshot.arenaInvites[0].members.filter(m => m.accepted).length, 3);
    b.send({ type: 'arenaAccept', invitationId: invite.id });
    const countdown = await until(() => a.snapshot.arena?.phase === 'countdown' && a.snapshot.arena, 'all four ready');
    await tick(countdown.startsAt + 1); await until(() => a.snapshot.arena.phase === 'active', '2v2 starts');
    await arrange([[a, point(0, 0)], [b, point(0, -2)], [c, point(0, 2)], [d, point(1, 2)]]);
    assert.equal(a.player().arenaTeam, b.player().arenaTeam); assert.notEqual(a.player().arenaTeam, c.player().arenaTeam);
    await rejected(b, { type: 'attack', ability: 'arrow', targetId: a.id });
    await rejected(spectator, { type: 'attack', ability: 'heal', targetId: b.id });
    await rejected(a, { type: 'attack', ability: 'heal', targetId: c.id });
    const before = b.player().hp; await hit(c, b); assert(b.player().hp < before);
    const damaged = b.player().hp; await release(a, b, 'heal'); await until(() => b.player().hp > damaged, 'teammate healing works');
    await release(a, b, 'power-word-shield'); await until(() => b.player().shield?.amount > 0, 'teammate shield works');
    const protectedHp = a.player().hp, outsideHp = spectator.player().hp;
    for (const ability of ['volley', 'multishot', 'explosive-arrow']) {
      const event = await hit(b, c, ability);
      assert.deepEqual(new Set(event.targets.map(t => t.id)), new Set([c.id, d.id]), `${ability}: only opposing team selected`);
      assert.equal(a.player().hp, protectedHp); assert.equal(spectator.player().hp, outsideHp);
    }
    await tick(clock + 16000); await knockOut(c, b);
    assert.equal(a.snapshot.arena.phase, 'active', 'one teammate knockout does not end 2v2'); assert.equal(b.player().arenaEliminated, true); assert.equal(b.player().pvp, false);
    await rejected(b, { type: 'attack', ability: 'arrow', targetId: c.id }); await rejected(a, { type: 'attack', ability: 'heal', targetId: b.id });
    const mark = b.messages.length, old = b.player(); b.send({ type: 'move', x: old.x + 1, z: old.z, rotation: 0 });
    await until(() => b.messages.slice(mark).some(m => m.type === 'correction'), 'eliminated player cannot move');
    assert.equal(b.player().x, old.x); assert.equal(b.player().hp, 1);
    await knockOut(c, a); await finished([a, b, c, d], 1);
  }
  {
    const [a, b, c, d] = await fixture(); await party(a, b); await party(c, d);
    const invite = await request(a, c, 2); b.send({ type: 'arenaDecline', invitationId: invite.id });
    await until(() => [a, b, c, d].every(c => !c.snapshot.arenaInvites.length), 'any teammate may decline');
    await request(a, c, 2); d.send({ type: 'partyLeave' });
    await until(() => [a, b, c, d].every(c => !c.snapshot.arenaInvites.length), 'roster change invalidates ready checks');
    assert.equal(a.snapshot.arena, null);
  }
  {
    const [a, b] = await fixture(['Ranger', 'Mage']); await start(a, b);
    const pillar = ARENA_COLLIDERS[0], cover = (x, z) => ({ x: pillar.x + x, z: pillar.z + z });
    await arrange([[a, cover(-4, 0)], [b, cover(4, 0)]]);
    await rejected(a, { type: 'attack', ability: 'arrow', targetId: b.id }); assert.equal(a.combats().length, 0, 'pillar blocks targeted casts');
    a.send({ type: 'autoAttack', targetId: b.id }); await tick(clock + 2500); assert.equal(a.combats().length, 0, 'cover pauses automatic attacks');
    await arrange([[b, cover(-4, 4)]]); await tick(clock + 2500);
    const attack = await until(() => a.combats()[0], 'flanking resumes attacks'); await tick(Math.max(clock, impact(a, attack) + 1));
    assert(b.player().hp < b.player().maxHp); a.send({ type: 'autoAttack', targetId: null }); await tick();
    await arrange([[a, cover(-4, 4)], [b, cover(-4, 0)]]);
    b.send({ type: 'attack', ability: 'fireball', targetId: a.id });
    const cast = await until(() => b.player().casting, 'exposed cast starts'), hp = a.player().hp;
    await arrange([[a, cover(-2, 4)]]); assert(!canTraverse(a.player(), b.player(), ARENA_COLLIDERS, ARENA_BOUNDS));
    await tick(Math.max(clock, cast.endsAt + 1000)); assert.equal(a.player().hp, hp, 'taking cover interrupts pending spell release');
    const mark = a.messages.length; a.send({ type: 'move', ...cover(-2, 3.2), rotation: 0 });
    await until(() => a.messages.slice(mark).some(m => m.type === 'correction'), 'solid pillar rejection');
    assert(!canTraverse(a.player(), pillar, ARENA_COLLIDERS, ARENA_BOUNDS));
    a.send({ type: 'arenaForfeit' }); await finished([a, b], 1);
  }
  {
    const [a, b] = await fixture(['Ranger', 'Knight']); await start(a, b); await arrange([[a, point(0, 0)], [b, point(0, 2)]]);
    const event = await release(a, b, 'poison-shot'), oldMatch = a.snapshot.arena.id,oldInstance=a.player().instanceId;
    a.send({ type: 'arenaForfeit' }); await finished([a, b], 1);
    await start(a, b); assert.notEqual(a.snapshot.arena.id, oldMatch);assert.notEqual(a.player().instanceId,oldInstance,'rematches cannot reuse an old combat instance');
    await tick(Math.max(clock + 12000, impact(a, event) + 12000)); assert.equal(b.player().hp, b.player().maxHp, 'old poison cannot enter a rematch');
    b.send({ type: 'leaveWorld' }); await until(() => a.snapshot.arena?.phase === 'finished', 'world departure ends match'); assert.equal(a.snapshot.arena.winnerTeam, 0);
  }
  {
    const [a, b] = await fixture(); await start(a, b);
    b.send({type:'arenaForfeit'});await finished([a,b],0);assert.equal(b.player().instanceId,null,'explicit exit returns safely to the world');
  }
  {
    const [a, b, c, d] = await fixture(); await party(a, b); await party(c, d); await start(a, c, 2, [b, d]);
    d.socket.close(); await finished([a, b, c], 0);
    const rejoined = await connect(d.token, d.id); assert.equal(rejoined.player().arenaMatchId, null); assert.equal(rejoined.player().pvp, false);assert.equal(rejoined.player().instanceId,null);assert.deepEqual({x:rejoined.player().x,z:rejoined.player().z},{x:d.returnState.x,z:d.returnState.z},'disconnect/rejoin restores saved overworld point');assert.equal(rejoined.player().hp,d.returnState.hp);
  }
  {
    const [a, b] = await fixture(); const match = await start(a, b);
    await tick(match.endsAt + 1); await finished([a, b], null);
    await tick(clock + 21000); await until(() => !a.snapshot.arena && !b.snapshot.arena, 'result expires');
  }
  for (const [basic, remainingMs, winner] of [[false, 450, 0], [true, 450, 0], [false, 350, null]]) {
    const [a, b] = await fixture(['Ranger', 'Ranger']);
    const match = await start(a, b); await arrange([[a, point(0, 1)], [b, point(0, -1)]]);
    const prepareHit = async () => {
      if (!basic) return hit(a, b);
      const count = a.combats().length;
      a.send({ type: 'autoAttack', targetId: b.id });
      const event = await until(() => a.combats()[count], 'preparation basic launched');
      await tick(impact(a, event) + 1);
      const nextAttackAt = a.player().autoAttack.nextAttackAt;
      a.send({ type: 'autoAttack', targetId: null });
      await until(() => !a.player().autoAttack, 'preparation basic stopped');
      await tick(nextAttackAt);
    };
    await prepareHit(); const damage = b.player().maxHp - b.player().hp;
    while (b.player().hp > damage + 1) await prepareHit();
    const woundedHp = b.player().hp;
    await tick(match.endsAt - remainingMs);
    const count = a.combats().length;
    a.send(basic ? { type: 'autoAttack', targetId: b.id } : { type: 'attack', ability: 'arrow', targetId: b.id });
    const event = await until(() => a.combats()[count], 'final projectile launched');
    assert.equal(impact(a, event) < match.endsAt, winner === 0, 'projectile is scheduled on the intended side of deadline');
    await tick(match.endsAt + 25); await finished([a, b], winner);
    assert.equal(b.snapshot.arena.members.find(member=>member.id===b.id).hp, winner === 0 ? 1 : woundedHp, 'deadline settles only impacts scheduled before it');
    await tick(clock + 1000); assert.equal(b.player().hp,b.returnState.hp,'post-deadline projectile stays cancelled after returning to the world');
  }
  {
    const [a, b] = await fixture(['Ranger', 'Ranger']);
    const match = await start(a, b); await arrange([[a, point(0, 1)], [b, point(0, -1)]]);
    await hit(a, b); await hit(b, a); const woundedHp = b.player().hp;
    const castMs = spellCastTimeMs(SPELLS['trail-mending'], combatStats(a.player()));
    await tick(match.endsAt - castMs - 100); a.send({ type: 'attack', ability: 'trail-mending' });
    const early = await until(() => a.player().casting, 'heal ending before deadline'); assert(early.endsAt < match.endsAt);
    await tick(match.endsAt - castMs + 100); b.send({ type: 'attack', ability: 'trail-mending' });
    const late = await until(() => b.player().casting, 'heal ending after deadline'); assert(late.endsAt > match.endsAt);
    await tick(match.endsAt + 25); await finished([a, b], null);
    assert.equal(a.snapshot.arena.members.find(member=>member.id===a.id).hp,a.player().maxHp, 'a heal completed before deadline settles on a late tick');
    assert.equal(b.snapshot.arena.members.find(member=>member.id===b.id).hp,woundedHp, 'a heal completing after deadline is cancelled');
  }
  {
    const [a,b]=await fixture(['Ranger','Knight'],[],123);await start(a,b);
    const saved=[a,b].map(client=>({token:client.token,id:client.id,returnState:client.returnState}));
    for(const prior of saved){const response=await fetch(`http://127.0.0.1:${port}/api/roster`,{headers:{'X-Guest-Token':prior.token}});assert.equal(response.status,200);const roster=await response.json(),stored=roster.characters.find(player=>player.id===prior.id);assert.equal(stored.hp,prior.returnState.hp,'roster exposes pre-arena HP');assert.deepEqual({x:stored.x,z:stored.z},{x:prior.returnState.x,z:prior.returnState.z},'roster never exposes temporary arena coordinates');assert.equal(stored.instanceId,null);assert.equal(stored.arenaMatchId,null);assert.equal(stored.arenaPhase,null);assert.deepEqual(stored.abilityCooldowns,prior.returnState.abilityCooldowns);}
    await game.stop();game=null;for(const client of clients.splice(0))client.socket.terminate();
    game=createGameServer({port:0,host:'127.0.0.1',dataDir,keycloak:null,databaseUrl:''});port=await game.start();
    for(const prior of saved){const rejoined=await connect(prior.token,prior.id);assert.equal(rejoined.player().instanceId,null,'server restart cannot revive a private instance');assert.equal(rejoined.player().arenaMatchId,null);assert.equal(rejoined.snapshot.arena,null);assert.deepEqual({x:rejoined.player().x,z:rejoined.player().z},{x:prior.returnState.x,z:prior.returnState.z});assert.equal(rejoined.player().hp,prior.returnState.hp,'restart retains pre-arena health');}
  }
  console.log('PASS private arena instances: safe-entrance consent, concurrent instance and event isolation, exact return state/restart recovery, 1v1/all classes, unanimous 2v2, team healing and damage isolation, knockout/results, cover, countdown, expiry, roster changes, departures, disconnects, rematches, deadline ordering and no rewards.');
} finally { await stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true }); }
