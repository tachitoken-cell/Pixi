import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { spellsForClass, defaultHotbar } from '../src/spells.ts';
import { regionAt, canTraverse } from '../src/realm.ts';
import { ARENA_ENTRANCE, normalizeArenaRatings } from '../src/arena.ts';
import { COLOSSEUM, isInColosseum } from '../src/colosseum.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-arena-queue-')), clients = [], realNow = Date.now;
let game, port, now = realNow(); Date.now = () => now;
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const result = predicate(); if (result) return result; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 1100) { now += ms; await delay(115); }
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
async function connect(token, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, token, id, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['roster', 'snapshot'].includes(m.type)) c[m.type] = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'guest roster');
  c.send({ type: 'selectCharacter', characterId: id }); await until(() => c.player(), 'world entry'); return c;
}
async function fixture(points = [], ratings = []) {
  await stop(); now += 30000;
  const learnedSpells = spellsForClass('Cleric').map(s => s.id);
  const heroes = ['Amber', 'Briar', 'Cedar', 'Dawn', 'Ember', 'Fern'].map((name, i) => {
    const point = points[i] || { x: ARENA_ENTRANCE.x + i * 2 - 2, z: ARENA_ENTRANCE.z };
    assert(canTraverse(point, point), 'fixture point is walkable');
    return { id: randomUUID(), name, ...point, coordinateVersion: 2, rotation: 0, zone: regionAt(point.x, point.z),
      appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Cleric' },
      arenaRatings: normalizeArenaRatings(ratings[i]), characterCreated: true, talents: [], ...starterGear('Cleric'), learnedSpells, hotbar: defaultHotbar('Cleric', 60, learnedSpells),
      level: 60, xp: 0, gold: 0, hp: 123, maxHp: 808, inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
  });
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((p, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [p] }]))));
  const spawns = ZONES.map(z => z.enemies); ZONES.forEach(z => { z.enemies = []; });
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES.forEach((z, i) => { z.enemies = spawns[i]; }); }
  port = await game.start(); return Promise.all(tokens.map((token, i) => connect(token, heroes[i].id)));
}
async function reject(c, message) { await tick(800); const mark = c.messages.length; c.send(message); await until(() => c.messages.slice(mark).some(m => m.type === 'event' && m.kind === 'info'), `reject ${message.type}`); }
async function queue(c, size = 1) { c.send({ type: 'arenaQueueJoin', size }); await until(() => c.snapshot.arenaQueue || c.snapshot.arenaInvites.length, 'queue or ready check'); }
async function pair(a, b) { await queue(a); await queue(b); return until(() => a.snapshot.arenaInvites[0] && b.snapshot.arenaInvites[0], 'paired ready check'); }
async function cleared(...group) { await until(() => group.every(c => !c.snapshot.arenaQueue && !c.snapshot.arenaInvites.length), 'queue and ready check cleared'); }
async function walk(c, destination) {
  while (Math.hypot(c.player().x - destination.x, c.player().z - destination.z) > .01) {
    await tick(700); const p = c.player(), distance = Math.hypot(p.x - destination.x, p.z - destination.z), ratio = Math.min(1, 2.5 / distance);
    const next = { x: p.x + (destination.x - p.x) * ratio, z: p.z + (destination.z - p.z) * ratio };
    assert(canTraverse(p, next)); c.send({ type: 'move', ...next, rotation: 0 });
    await until(() => Math.hypot(c.player().x - next.x, c.player().z - next.z) < .01, 'legal walk');
  }
}
async function party(a, b) {
  await tick(); a.send({ type: 'partyInvite', targetId: b.id }); const invite = await until(() => b.snapshot.partyInvites[0], 'party invite');
  b.send({ type: 'partyAccept', invitationId: invite.id }); await until(() => b.snapshot.party?.members.some(member => member.id === a.id), 'joined party');
}

try {
  {
    const [a, b] = await fixture([{ x: 0, z: 8 }, { x: COLOSSEUM.x, z: COLOSSEUM.radius - 1 }]);
    assert(b.player().pvp, 'second fighter starts in world PvP');
    const invite = await pair(a, b); assert.equal(invite.queued, true);
    assert.equal(a.snapshot.arenaInvites[0].acceptReason, '', 'safe fighter can accept from anywhere');
    assert(b.snapshot.arenaInvites[0].acceptReason, 'combat restriction belongs only to the affected fighter');
    await reject(b, { type: 'arenaAccept', invitationId: invite.id });
    assert.equal(b.snapshot.arenaInvites[0].id, invite.id, 'combat rejection preserves the ready check');
    assert(b.snapshot.arenaInvites[0].members.every(m => !m.accepted), 'combat rejection never records acceptance');
    a.send({ type: 'jump' }); await until(() => !a.player().jump.grounded, 'remote fighter jumps during ready check');
    a.send({ type: 'arenaAccept', invitationId: invite.id });
    await until(() => b.snapshot.arenaInvites[0]?.members.find(m => m.id === a.id).accepted, 'airborne fighter accepts');
    await walk(b, { x: COLOSSEUM.x, z: COLOSSEUM.radius + 1 });
    await until(() => !b.player().pvp && b.snapshot.arenaInvites[0]?.acceptReason === '', 'leaving combat enables acceptance');
    const returns = [a, b].map(c => ({ x: c.player().x, z: c.player().z, hp: c.player().hp, zone: c.player().zone }));
    b.send({ type: 'arenaAccept', invitationId: invite.id });
    await until(() => a.snapshot.arena?.phase === 'countdown' && b.snapshot.arena?.phase === 'countdown', 'remote mutual consent starts arena');
    a.send({ type: 'arenaForfeit' });
    await until(() => [a, b].every(c => c.snapshot.arena?.phase === 'finished'), 'remote match finishes');
    for (const [i, c] of [a, b].entries()) {
      assert.deepEqual({ x: c.player().x, z: c.player().z, hp: c.player().hp, zone: c.player().zone }, returns[i], 'match restores exact remote return state');
      assert.equal(c.player().instanceId, null);
    }
  }
  {
    const [a, b, c, d] = await fixture();
    await reject(a, { type: 'arenaQueueJoin', size: 2 }); assert.equal(a.snapshot.arenaQueue, null, 'team queue requires a preformed party');
    await queue(a); const joined = a.snapshot.arenaQueue.joinedAt; await tick(); await queue(a);
    assert.equal(a.snapshot.arenaQueue.joinedAt, joined, 'duplicate join preserves one queue entry'); assert.equal(b.snapshot.arenaQueue, null, 'queue state is private');
    a.send({ type: 'arenaQueueLeave' }); await cleared(a);
    const abandoned = await pair(a, b); a.send({ type: 'arenaQueueLeave' }); await cleared(a, b);
    await reject(b, { type: 'arenaAccept', invitationId: abandoned.id }); assert.equal(b.snapshot.arena, null, 'leaving queue also cancels a ready check that raced the Leave click');
    const first = await pair(a, b); assert.equal(first.size, 1); assert(first.members.every(m => !m.accepted), 'both matched fighters must explicitly accept');
    assert.equal(a.snapshot.arenaQueue, null); assert.equal(b.snapshot.arenaQueue, null); assert.equal(c.snapshot.arenaInvites.length, 0, 'ready check is private');
    await reject(c, { type: 'arenaAccept', invitationId: first.id });
    a.send({ type: 'arenaAccept', invitationId: first.id }); await until(() => b.snapshot.arenaInvites[0].members.find(m => m.id === a.id).accepted, 'first consent');
    assert.equal(a.snapshot.arena, null, 'one consent never starts a match');
    b.send({ type: 'arenaAccept', invitationId: first.id }); await until(() => a.snapshot.arena?.phase === 'countdown' && b.snapshot.arena?.phase === 'countdown', 'second consent starts countdown');
    await reject(a, { type: 'arenaQueueJoin' });
    const second = await pair(c, d); assert.notEqual(second.id, first.id, 'independent queue pairing');
    c.send({ type: 'arenaAccept', invitationId: second.id }); d.send({ type: 'arenaAccept', invitationId: second.id });
    await until(() => c.snapshot.arena?.phase === 'countdown', 'second match'); assert.notEqual(c.player().instanceId, a.player().instanceId);
    a.send({ type: 'arenaForfeit' }); await until(() => a.snapshot.arena?.phase === 'finished', 'first forfeit'); assert.equal(a.player().hp, 123);
    assert.equal(c.snapshot.arena.phase, 'countdown', 'other match continues'); c.send({ type: 'arenaForfeit' }); await cleared(a, b, c, d);
  }
  {
    const [a, b, c] = await fixture();
    a.send({ type: 'ignoreAdd', targetId: b.id }); await until(() => a.messages.some(m => m.type === 'friends' && m.ignored?.some(p => p.id === b.id)), 'ignore committed');
    await queue(a); await queue(b); await tick(); assert(a.snapshot.arenaQueue && b.snapshot.arenaQueue, 'ignore in either direction prevents pairing');
    await queue(c); const invite = await until(() => a.snapshot.arenaInvites[0], 'compatible player skips ignored pair');
    assert.deepEqual(new Set(invite.members.map(m => m.id)), new Set([a.id, c.id])); assert(b.snapshot.arenaQueue);
    c.send({ type: 'arenaDecline', invitationId: invite.id }); await cleared(a, c); assert(b.snapshot.arenaQueue, 'decline does not consume another queue entry');
    b.send({ type: 'arenaQueueLeave' }); await cleared(b);
  }
  {
    const [a, b, c] = await fixture(); await queue(a); const joined = a.snapshot.arenaQueue.joinedAt;
    await walk(a, { x: a.player().x, z: ARENA_ENTRANCE.z - 13 });
    assert.equal(a.snapshot.arenaQueue.joinedAt, joined, 'walking away from the entrance preserves queue priority');
    await walk(a, { x: a.player().x, z: ARENA_ENTRANCE.z });
    const invite = await pair(a, b); await walk(a, { x: a.player().x, z: ARENA_ENTRANCE.z - 13 });
    a.send({ type: 'jump' }); await until(() => !a.player().jump.grounded, 'ready fighter jumps'); await tick(1);
    assert.equal(a.snapshot.arenaInvites[0].id, invite.id, 'walking and jumping preserve the ready check');
    await tick(31000); await cleared(a, b); await reject(a, { type: 'arenaAccept', invitationId: invite.id });
    const ready = await pair(a, b); await party(a, c); await cleared(a, b); await reject(b, { type: 'arenaAccept', invitationId: ready.id });
    await reject(a, { type: 'arenaQueueJoin' }); assert.equal(a.snapshot.arenaQueue, null, 'party member cannot queue solo');
  }
  {
    const [a, b, c] = await fixture(); await queue(a); a.send({ type: 'attack', ability: 'heal' });
    const joined = a.snapshot.arenaQueue.joinedAt;
    await until(() => a.player().casting, 'healing cast begins'); await tick(1);
    assert.equal(a.snapshot.arenaQueue.joinedAt, joined, 'starting a cast preserves queue priority');
    a.send({ type: 'arenaQueueLeave' }); await cleared(a); await queue(a);
    assert(a.player().casting, 'joining the queue during a cast succeeds'); const castingJoined = a.snapshot.arenaQueue.joinedAt;
    a.send({ type: 'jump' }); await until(() => !a.player().jump.grounded, 'jump begins'); await tick(1);
    assert.equal(a.snapshot.arenaQueue.joinedAt, castingJoined, 'jumping preserves queue priority');
    a.send({ type: 'arenaQueueLeave' }); await cleared(a); await queue(a);
    assert(!a.player().jump.grounded, 'joining the queue while airborne succeeds');
    await tick(2000); await tick(); c.send({ type: 'arenaRequest', targetId: a.id, size: 1 });
    const invite = await until(() => a.snapshot.arenaInvites[0], 'direct challenge removes waiting queue'); assert.equal(a.snapshot.arenaQueue, null);
    a.send({ type: 'arenaDecline', invitationId: invite.id }); await cleared(a, c);
    await queue(a); a.socket.close(); await until(() => !b.snapshot.players.some(p => p.id === a.id), 'disconnect removed player');
    const returned = await connect(a.token, a.id); assert.equal(returned.snapshot.arenaQueue, null, 'reconnect never restores queue');
    const ready = await pair(returned, b); returned.send({ type: 'leaveWorld' }); await until(() => !b.snapshot.arenaInvites.length, 'departure cancels ready check');
    await reject(b, { type: 'arenaAccept', invitationId: ready.id });
  }
  {
    const [a, b] = await fixture([{ x: 0, z: 8 }, { x: ARENA_ENTRANCE.x, z: ARENA_ENTRANCE.z }]);
    const invite = await pair(a, b);
    a.send({ type: 'arenaAccept', invitationId: invite.id });
    await until(() => b.snapshot.arenaInvites[0].members.find(m => m.id === a.id).accepted, 'first acceptance before combat');
    a.send({ type: 'attack', ability: 'heal' }); await until(() => a.player().casting, 'accepted fighter enters combat');
    await until(() => !b.snapshot.arenaInvites[0]?.members.find(m => m.id === a.id).accepted, 'combat revokes prior acceptance');
    assert(a.snapshot.arenaInvites[0].acceptReason); assert.equal(b.snapshot.arenaInvites[0].acceptReason, '');
    b.send({ type: 'arenaAccept', invitationId: invite.id });
    await until(() => a.snapshot.arenaInvites[0]?.members.find(m => m.id === b.id).accepted, 'other fighter can accept while opponent is busy');
    assert.equal(a.snapshot.arena, null, 'stale acceptance cannot teleport a fighter out of combat');
    await reject(a, { type: 'arenaAccept', invitationId: invite.id });
    a.send({ type: 'cancelCast' }); await until(() => !a.player().casting && a.snapshot.arenaInvites[0]?.acceptReason === '', 'combat ends');
    assert.equal(a.snapshot.arena, null, 'ending combat requires renewed consent');
    a.send({ type: 'arenaAccept', invitationId: invite.id });
    await until(() => a.snapshot.arena?.phase === 'countdown', 'retry after combat starts match');
    a.send({ type: 'arenaForfeit' }); await until(() => a.snapshot.arena?.phase === 'finished', 'retry match finishes');
    await tick(Math.max(1100, (a.player().globalCooldownUntil || 0) - now + 1, (a.player().abilityCooldowns.heal || 0) - now + 1));
    const declined = await pair(a, b); a.send({ type: 'attack', ability: 'heal' });
    await until(() => a.player().casting, 'fighter casts before declining'); a.send({ type: 'arenaDecline', invitationId: declined.id }); await cleared(a, b);
  }
  {
    const [a, b] = await fixture([{ x: ARENA_ENTRANCE.x, z: ARENA_ENTRANCE.z }, { x: ARENA_ENTRANCE.x, z: ARENA_ENTRANCE.z + 2 }]);
    await queue(a); b.send({ type: 'duelRequest', targetId: a.id }); const invite = await until(() => a.snapshot.duelInvites[0], 'ordinary duel offered at safe arena entrance');
    await until(() => !a.snapshot.arenaQueue, 'ordinary duel removes queue'); a.send({ type: 'duelAccept', invitationId: invite.id });
    await until(() => a.snapshot.duel && b.snapshot.duel, 'ordinary duel starts'); await tick(); assert(a.snapshot.duel && !a.player().pvp);
    await walk(a, { x: COLOSSEUM.x, z: COLOSSEUM.radius + 1 }); assert(a.snapshot.duel, 'walking through the spectator clearing preserves a duel');
    await walk(a, { x: COLOSSEUM.x, z: COLOSSEUM.radius - 1 }); await until(() => !a.snapshot.duel && !b.snapshot.duel, 'entering actual lethal ring ends duel');
    assert(isInColosseum(a.player()) && a.player().pvp); await walk(b, { x: COLOSSEUM.x, z: COLOSSEUM.radius + 1 });
    assert(Math.hypot(a.player().x - b.player().x, a.player().z - b.player().z) < 8); await tick();
    await reject(b, { type: 'duelRequest', targetId: a.id }); assert.equal(a.snapshot.duelInvites.length, 0, 'the actual ring blocks ordinary duel requests even within range');
  }
  for (const size of [2, 3]) {
    const group = await fixture(Array.from({ length: 6 }, (_, i) => ({ x: i, z: 8 })));
    const first = group.slice(0, size), second = group.slice(size, size * 2), [a, b] = first, [c] = second;
    for (const member of first.slice(1)) await party(a, member);
    for (const member of second.slice(1)) await party(c, member);
    await reject(b, { type: 'arenaQueueJoin', size });
    await reject(a, { type: 'arenaQueueJoin', size: size === 2 ? 3 : 2 });
    await reject(a, { type: 'arenaQueueJoin', size: 1 });
    await queue(a, size);
    await until(() => first.every(member => member.snapshot.arenaQueue?.size === size), 'whole party sees queue');
    assert(first.every(member => member.snapshot.arenaQueue.rating === 1000));
    const joined = a.snapshot.arenaQueue.joinedAt; await tick(); await queue(a, size);
    assert.equal(a.snapshot.arenaQueue.joinedAt, joined, 'repeat party join preserves priority');
    b.send({ type: 'arenaQueueLeave' }); await cleared(...first);
    await queue(a, size); await queue(c, size);
    const invite = await until(() => group.slice(0, size * 2).every(member => member.snapshot.arenaInvites.length) && a.snapshot.arenaInvites[0], 'team ready check');
    assert.equal(invite.size, size); assert.equal(invite.members.length, size * 2); assert(invite.rated);
    for (const member of [...first, ...second].slice(0, -1)) member.send({ type: 'arenaAccept', invitationId: invite.id });
    await until(() => a.snapshot.arenaInvites[0]?.members.filter(member => member.accepted).length === size * 2 - 1, 'all but one ready');
    assert(!a.player().arenaMatchId, 'every fighter must consent');
    second.at(-1).send({ type: 'arenaAccept', invitationId: invite.id });
    await until(() => [...first, ...second].every(member => member.snapshot.arena?.phase === 'countdown'), 'full team match starts remotely');
    assert.equal(new Set([...first, ...second].map(member => `${member.player().x},${member.player().z}`)).size, size * 2, 'distinct symmetric team spawns');
    assert(first.every(member => member.player().arenaTeam === a.player().arenaTeam));
    b.send({ type: 'arenaForfeit' });
    await until(() => [...first, ...second].every(member => member.snapshot.arena?.phase === 'finished'), 'team result');
    for (const member of first) { assert.equal(member.player().arenaRatings[size].rating, 984); assert.equal(member.player().arenaRatings[size].losses, 1); assert.equal(member.snapshot.arena.ratingChange, -16); }
    for (const member of second) { assert.equal(member.player().arenaRatings[size].rating, 1016); assert.equal(member.player().arenaRatings[size].wins, 1); assert.equal(member.snapshot.arena.ratingChange, 16); }
    assert([...first, ...second].every(member => member.player().arenaRatings[1].rating === 1000), 'brackets stay independent');
    await queue(a, size); b.send({ type: 'partyLeave' }); await cleared(...first);
    await party(a, b); await queue(a, size); await queue(c, size);
    await until(() => b.snapshot.arenaInvites.length, 'new ready check');
    b.send({ type: 'partyLeave' }); await cleared(...first, ...second);
    assert.equal(c.player().arenaRatings[size].wins, 1, 'cancelled ready check never awards rating');
  }
  {
    const record = rating => ({ '1': { rating, wins: 0, losses: 0, draws: 0 } });
    const [a, b, c] = await fixture([], [record(1000), record(1600), record(1100)]);
    await queue(a); await queue(b); await tick();
    assert(a.snapshot.arenaQueue && b.snapshot.arenaQueue, 'large MMR gap waits');
    await queue(c); const invite = await until(() => a.snapshot.arenaInvites[0], 'similar MMR matched');
    assert.deepEqual(new Set(invite.members.map(member => member.id)), new Set([a.id, c.id]));
    c.send({ type: 'arenaDecline', invitationId: invite.id }); await cleared(a, c);
    await queue(a); await tick(120000);
    await until(() => a.snapshot.arenaInvites.length && b.snapshot.arenaInvites.length, 'MMR range expands with wait');
  }
  console.log('PASS arena queue: Solo/2v2/3v3 from anywhere, unanimous remote entry, per-bracket team ratings, MMR pairing and expanding range, full-party leave/roster cleanup, combat/cast/jump guards, ignore/decline/expiry/departure safety and isolated instances.');
} finally { await stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
