import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { MONSTERS } from '../src/bestiary.ts';
import { CHAPTERS } from '../src/content.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { SPELLS, spellCastTimeMs, legacyAbility } from '../src/spells.ts';
import { findPath } from '../src/navigation.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, DUNGEON_COLLIDERS, DUNGEON_BOUNDS, toWorld } from '../src/realm.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-loot-'));
const clients = [], realNow = Date.now;
let game, port, clockOffset = 0;
// Advance only gameplay time for respawn/expiry; the server loop and WebSockets remain real.
Date.now = () => realNow() + clockOffset;
const key = token => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('base64url');
function character(name, overrides = {}) {
  const level = overrides.level || 12, className = overrides.className || 'Ranger', chapter = overrides.chapter || 0;
  const p = { id: randomUUID(), name, appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    characterCreated: true, coordinateVersion: 2, talents: [], ...starterGear(className), zone: 'greenwood', x: -48, z: 1, rotation: 0,
    level, xp: 0, gold: 0, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12,
    inventory: { wood: 0, crystal: 0, potion: 3, herb: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
    quest: { chapter, stage: 1, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[chapter].objectives.map(o => [o.id, 0])), completed: false, ending: null }, ...overrides };
  Object.assign(p, toWorld(p.zone, p));
  delete p.className; delete p.chapter;
  return p;
}
async function until(predicate, label, timeout = 4500) {
  const end = realNow() + timeout;
  while (realNow() < end) { const result = predicate(); if (result) return result; await delay(20); }
  throw new Error(`Timed out: ${label}`);
}
async function start(records) {
  if (records) writeFileSync(join(dataDir, 'players.json'), JSON.stringify(records));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' });
  port = await game.start();
}
async function select(c, id) {
  c.welcome = null; c.snapshot = null;
  c.send({ type: 'selectCharacter', characterId: id });
  await until(() => c.welcome?.id === id && c.player(), 'selected character enters');
}
async function connect(accountToken, characterId) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const c = { socket, messages: [], snapshot: null, welcome: null, roster: null }; clients.push(c);
  socket.on('message', raw => {
    const m = JSON.parse(raw.toString()); c.messages.push(m);
    if (m.type === 'snapshot') c.snapshot = m;
    if (m.type === 'welcome') c.welcome = m;
    if (m.type === 'roster') c.roster = m;
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send = m => socket.send(JSON.stringify(m));
  c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  c.send({ type: 'join', token: accountToken });
  await until(() => c.roster, 'account roster loads');
  if (characterId) await select(c, characterId);
  return c;
}
async function snapshotAfter(c, action) {
  const old = c.snapshot, sentAt = Date.now();
  action();
  await until(() => c.snapshot !== old && c.snapshot.serverTime >= sentAt + 120, 'fresh authoritative snapshot');
}
async function walk(c, x, z) {
  const dungeon = !!c.player().instanceId;
  const path = findPath(c.player(), { x, z }, dungeon ? DUNGEON_COLLIDERS : WORLD_COLLIDERS, dungeon ? DUNGEON_BOUNDS : WORLD_BOUNDS);
  assert(path.length, `a walkable loot route reaches ${x},${z}`);
  for (const destination of path) {
  while (Math.hypot(c.player().x - destination.x, c.player().z - destination.z) > 0.02) {
    const p = c.player(), gap = Math.hypot(destination.x - p.x, destination.z - p.z), step = Math.min(2.5, gap);
    const next = { x: p.x + (destination.x - p.x) / gap * step, z: p.z + (destination.z - p.z) / gap * step };
    clockOffset += 500;
    c.send({ type: 'move', zone: p.zone, ...next, rotation: 0 });
    await until(() => Math.hypot(c.player().x - next.x, c.player().z - next.z) < 0.01, 'legal movement accepted').catch(error=>{
      throw new Error(`${error.message} toward ${next.x},${next.z}; actual ${c.player().x},${c.player().z}, HP ${c.player().hp}; ${JSON.stringify(c.messages.filter(m=>m.type==='correction'||m.type==='event').slice(-4))}`);
    });
  }
  }
}
async function kill(c, targetId) {
  const ids = new Set(c.snapshot.loot.map(drop => drop.id));
  const oldCount = c.messages.length, before = { gold: c.player().gold, xp: c.player().xp, kills: c.player().quest.kills };
  c.send({ type: 'attack', targetId });
  const casting = await until(() => c.player().casting, 'lethal spell preparation');
  assert.equal(casting.endsAt - casting.startedAt, spellCastTimeMs(SPELLS[legacyAbility(c.player().appearance.className)], combatStats(c.player())));
  const event = await until(() => c.messages.slice(oldCount).find(message => message.type === 'combat' && message.playerId === c.welcome.id), 'lethal spell released');
  assert.equal(event.startedAt, casting.endsAt);
  for (const snapshot of c.messages.slice(oldCount).filter(message => message.type === 'snapshot' && message.serverTime >= casting.startedAt && message.serverTime < casting.endsAt)) {
    const player = snapshot.players.find(player => player.id === c.welcome.id);
    assert.deepEqual({ gold: player.gold, xp: player.xp, kills: player.quest.kills }, before, 'cast preparation cannot award loot or kill credit');
    assert(snapshot.loot.every(drop => ids.has(drop.id)), 'no corpse exists before the cast releases');
  }
  return await until(() => c.snapshot.loot.find(drop => drop.ownerId === c.welcome.id && !ids.has(drop.id)), 'lethal hit creates personal loot');
}

try {
  const ownerToken = token(), peerToken = token(), elsewhereToken = token();
  const ownerCharacter = character('Loot owner', { hp: 8 }), sibling = character('Same account');
  const peerCharacter = character('Other account'), elsewhereCharacter = character('Other zone', { zone: 'amberwild', chapter: 1 });
  await start({ [key(ownerToken)]: { characters: [ownerCharacter, sibling] }, [key(peerToken)]: { characters: [peerCharacter] }, [key(elsewhereToken)]: { characters: [elsewhereCharacter] } });
  let owner = await connect(ownerToken, ownerCharacter.id);
  const peer = await connect(peerToken, peerCharacter.id), elsewhere = await connect(elsewhereToken, elsewhereCharacter.id);
  const drop = await kill(owner, 'slime-0');
  assert.deepEqual(Object.keys(drop).sort(), ['id', 'enemyId', 'ownerId', 'zone', 'instanceId', 'kind', 'name', 'x', 'z', 'diedAt', 'rotation', 'gold', 'relic', 'items', 'expiresAt'].sort());
  assert.equal(drop.instanceId, null); assert.equal(drop.relic, 0);
  assert.equal(drop.enemyId, 'slime-0'); assert.equal(drop.ownerId, ownerCharacter.id); assert.equal(drop.zone, 'greenwood');
  assert.equal(drop.kind, 'moss-slime'); assert.equal(drop.name, 'Woodland slime'); assert.equal(drop.gold, 8);
  assert.match(drop.id, /^[\da-f-]{36}$/);
  const deadEnemy = owner.snapshot.enemies.find(e => e.id === 'slime-0');
  assert.equal(deadEnemy.alive, false); assert.deepEqual([drop.x, drop.z], [deadEnemy.x, deadEnemy.z], 'loot stays at the actual death position');
  const lethalCast = owner.messages.find(m => m.type === 'combat' && m.playerId === ownerCharacter.id && m.targets.some(target => target.id === deadEnemy.id));
  const castTarget = lethalCast.targets.find(target => target.id === deadEnemy.id);
  const timing = combatTiming(lethalCast.ability, Math.hypot(castTarget.x - lethalCast.from.x, castTarget.z - lethalCast.from.z));
  assert.equal(deadEnemy.diedAt, lethalCast.startedAt + (timing.delay + timing.flight) * 1000, 'death begins at the authoritative lethal impact, not a later snapshot tick');
  assert.equal(drop.diedAt, deadEnemy.diedAt); assert.equal(drop.rotation, deadEnemy.rotation, 'loot retains the fallen enemy facing');
  assert.ok(drop.expiresAt - Date.now() > 299000 && drop.expiresAt - Date.now() <= 300000, 'personal loot lasts five minutes');
  assert.equal(owner.player().gold, 0, 'killing does not collect gold');
  assert.equal(owner.player().xp, MONSTERS['moss-slime'].xp); assert.equal(owner.player().quest.kills, 1, 'kill objectives advance before looting');
  assert.ok(owner.messages.some(m => m.kind === 'reward' && m.text.includes(`+${MONSTERS['moss-slime'].xp} XP`) && m.text.includes('Loot the remains')));
  await until(() => [peer, elsewhere].every(c => c.snapshot.serverTime >= drop.diedAt), 'other players receive snapshots after the kill');
  assert(owner.snapshot.loot.some(item => item.id === drop.id), 'owner receives their personal corpse');
  for (const c of [peer, elsewhere]) assert(!c.snapshot.loot.some(item => item.id === drop.id), 'other players and regions never receive private corpse loot');

  await snapshotAfter(owner, () => {
    for (const targetId of [undefined, null, 3, {}, [], '', 'x'.repeat(129), 'missing']) owner.send({ type: 'loot', targetId });
    owner.send({ type: 'loot', targetId: drop.id, ownerId: peerCharacter.id, gold: 999999, x: drop.x, z: drop.z });
    peer.send({ type: 'loot', targetId: drop.id, ownerId: ownerCharacter.id });
    elsewhere.send({ type: 'loot', targetId: drop.id, zone: 'greenwood' });
  });
  assert.equal(owner.player().gold, 0, 'malformed and distant requests cannot collect or set gold');
  assert.equal(peer.player().gold, 0, 'another account cannot take a nearby personal drop');
  assert.ok(owner.snapshot.loot.some(item => item.id === drop.id));

  const rosterBefore = owner.roster;
  owner.send({ type: 'leaveWorld' });
  await until(() => owner.roster !== rosterBefore, 'owner returns to roster');
  await snapshotAfter(peer, () => owner.send({ type: 'loot', targetId: drop.id }));
  assert(!peer.snapshot.loot.some(item => item.id === drop.id), 'owner leaving the world does not expose private loot');
  await select(owner, sibling.id);
  await snapshotAfter(owner, () => owner.send({ type: 'loot', targetId: drop.id }));
  assert.equal(owner.player().gold, 0, 'a different character on the same account cannot claim the drop');
  assert(!owner.snapshot.loot.some(item => item.id === drop.id), 'same-account sibling does not receive another character’s loot');
  await select(owner, ownerCharacter.id);
  assert(owner.snapshot.loot.some(item => item.id === drop.id), 'inactive roster and sibling requests preserve the owner’s corpse');

  await walk(peer, -36, 0);
  await walk(owner, drop.x, drop.z);
  clockOffset += 15000;
  await until(() => owner.snapshot.enemies.find(e => e.id === 'slime-0').alive, 'enemy respawns independently');
  assert.equal(owner.snapshot.enemies.find(e => e.id === 'slime-0').diedAt, 0, 'respawn clears the new enemy life death timestamp');
  assert.deepEqual(owner.snapshot.loot.find(item => item.id === drop.id), drop, 'enemy respawn does not erase or move the old corpse');
  await until(() => owner.player().hp === 0, 'low-health owner falls beside the corpse');
  const diedAt = owner.player().diedAt;
  assert(Number.isFinite(diedAt) && diedAt > drop.diedAt && diedAt <= owner.snapshot.serverTime);
  assert(owner.messages.some(m => m.type === 'snapshot' && m.enemies.some(enemy => enemy.attack?.targetId === ownerCharacter.id && enemy.attack.impactAt === diedAt)), 'player death time matches the lethal monster contact');
  await snapshotAfter(owner, () => owner.send({ type: 'loot', targetId: drop.id }));
  assert.equal(owner.player().gold, 0, 'fallen owners cannot loot');
  assert.ok(owner.snapshot.loot.some(item => item.id === drop.id));
  // Freeze only gameplay time to exercise the exact animation boundary on real sockets.
  Date.now = () => diedAt + DEATH_ANIMATION_MS - 1;
  const beforeRespawn = owner.snapshot;
  owner.send({ type: 'respawn' });
  await until(() => owner.snapshot !== beforeRespawn, 'snapshot after premature respawn');
  assert.equal(owner.player().hp, 0, 'respawn cannot cut off the final millisecond of the death animation');
  assert.equal(owner.player().diedAt, diedAt, 'rejected respawn never restarts the death animation');
  const deadRoster = owner.roster;
  owner.send({ type: 'leaveWorld' }); await until(() => owner.roster !== deadRoster, 'fallen owner returns to roster');
  await select(owner, ownerCharacter.id);
  assert.equal(owner.welcome.player.diedAt, diedAt); assert.equal(owner.player().diedAt, diedAt, 'session cancellation and re-entry preserve the same death');
  Date.now = () => diedAt + DEATH_ANIMATION_MS;
  owner.send({ type: 'respawn' });
  await until(() => owner.player().hp === owner.player().maxHp, 'owner respawns');
  assert.equal(owner.player().diedAt, 0, 'a revived player starts a fresh life');
  clockOffset = Date.now() - realNow(); Date.now = () => realNow() + clockOffset;
  owner.socket.close();
  await until(() => owner.socket.readyState === WebSocket.CLOSED, 'owner disconnects');
  owner = await connect(ownerToken, ownerCharacter.id);
  assert.ok(owner.snapshot.loot.some(item => item.id === drop.id), 'same-character reconnect retains unclaimed loot');
  await walk(owner, drop.x, drop.z);
  owner.send({ type: 'loot', targetId: drop.id }); owner.send({ type: 'loot', targetId: drop.id });
  await until(() => owner.player().gold === 8 && !owner.snapshot.loot.some(item => item.id === drop.id), 'manual pickup pays and removes once');
  await snapshotAfter(owner, () => owner.send({ type: 'loot', targetId: drop.id }));
  assert.equal(owner.player().gold, 8); assert.equal(owner.player().xp, MONSTERS['moss-slime'].xp); assert.equal(owner.player().quest.kills, 1, 'looting cannot duplicate kill credit');
  assert.equal(owner.messages.filter(m => m.kind === 'reward' && m.text.startsWith('+8 gold · ') && m.text.endsWith('Woodland slime looted')).length, 1);

  const expired = await kill(owner, 'slime-0');
  await walk(owner, expired.x, expired.z);
  clockOffset += 300001;
  await until(() => !owner.snapshot.loot.some(item => item.id === expired.id), 'unclaimed corpse expires after five minutes');
  await snapshotAfter(owner, () => owner.send({ type: 'loot', targetId: expired.id }));
  assert.equal(owner.player().gold, 8, 'expired loot never pays');
  await game.stop();
  const saved = JSON.parse(readFileSync(join(dataDir, 'players.json'), 'utf8'));
  assert.equal(saved[key(ownerToken)].characters.find(p => p.id === ownerCharacter.id).gold, 8);
  assert.equal(saved[key(ownerToken)].characters.find(p => p.id === sibling.id).gold, 0);
  await start();
  owner = await connect(ownerToken, ownerCharacter.id);
  assert.equal(owner.player().gold, 8, 'collected gold survives a server restart');
  await game.stop();

  const bossOwner = character('Boss owner', { level: 80, className: 'Mage', zone: 'hollow', chapter: 7, x: 0, z: -9 });
  const bossPeer = character('Boss peer', { level: 80, zone: 'hollow', chapter: 7, x: 2, z: -10 });
  const far = character('Distant watcher', { level: 80, zone: 'hollow', chapter: 7, x: 20, z: -12 });
  const fallen = character('Fallen watcher', { level: 80, zone: 'hollow', chapter: 7, x: 0, z: -12, hp: 0 });
  const bossTokens = [token(), token(), token(), token()];
  await start(Object.fromEntries([bossOwner, bossPeer, far, fallen].map((p, i) => [key(bossTokens[i]), { characters: [p] }])));
  const a = await connect(bossTokens[0], bossOwner.id), b = await connect(bossTokens[1], bossPeer.id);
  const distant = await connect(bossTokens[2], far.id), dead = await connect(bossTokens[3], fallen.id);
  const bossDrop = await kill(a, 'root-warden-0');
  await until(() => b.snapshot.loot.length === 1, 'second participant receives their own share');
  const bossDrops = [a, b].flatMap(c => c.snapshot.loot);
  for (const c of [a, b]) assert.deepEqual(c.snapshot.loot.map(item => item.ownerId), [c.welcome.id], 'each participant receives only their own boss share');
  assert.equal(new Set(bossDrops.map(item => item.id)).size, 2, 'boss shares have independent identities');
  for (const item of bossDrops) assert.equal(item.gold, 60);
  await until(() => b.player().xp === MONSTERS['root-warden'].xp, 'boss XP shared');
  for (const c of [a, b]) { assert.equal(c.player().gold, 0); assert.equal(c.player().xp, MONSTERS['root-warden'].xp); assert.equal(c.player().quest.kills, 1); }
  assert.equal(distant.player().xp, 0); assert.equal(dead.player().xp, 0);
  await snapshotAfter(b, () => b.send({ type: 'loot', targetId: bossDrop.id }));
  assert.equal(b.player().gold, 0, 'a credited boss participant still cannot take another share');
  const peerDrop = b.snapshot.loot.find(item => item.ownerId === bossPeer.id);
  await walk(b, peerDrop.x, peerDrop.z);
  await until(() => Date.now() >= peerDrop.diedAt + DEATH_ANIMATION_MS, 'boss death animation finishes before pickup');
  b.send({ type: 'loot', targetId: peerDrop.id });
  await until(() => b.player().gold === 60, 'participant collects their own boss share');

  const entrance = toWorld('hollow', { x: 0, z: -24 });
  await walk(a, entrance.x, entrance.z);
  a.send({ type: 'dungeonEnter' });
  await until(() => a.player()?.instanceId, 'loot owner enters a separate dungeon instance');
  assert(!a.snapshot.loot.some(item => item.id === bossDrop.id), 'dungeon snapshots exclude overworld corpses');
  await snapshotAfter(a, () => a.send({ type: 'loot', targetId: bossDrop.id }));
  assert.equal(a.player().gold, 0, 'even the owner cannot collect across instances');
  assert(!b.snapshot.loot.some(item => item.id === bossDrop.id), 'other participants never receive the owner share');
  await walk(a, 0, 25); a.send({ type: 'dungeonExit' });
  await until(() => a.player()?.instanceId === null, 'loot owner returns to the overworld');
  assert(a.snapshot.loot.some(item => item.id === bossDrop.id), 'cross-instance requests leave the owner share intact');
  await walk(a, bossDrop.x, bossDrop.z); a.send({ type: 'loot', targetId: bossDrop.id });
  await until(() => a.player().gold === 60, 'returning owner can still collect the original share');
  await game.stop();
  const novice = character('Fallen delver', { level: 1, hp: 1, zone: 'hollow', x: 0, z: -24 }), noviceToken = token();
  await start({ [key(noviceToken)]: { characters: [novice] } });
  const delver = await connect(noviceToken, novice.id);
  delver.send({ type: 'dungeonEnter' }); await until(() => delver.player().instanceId, 'solo novice enters the Rootvault');
  await walk(delver, 0, 15);
  await until(() => delver.player().hp === 0, 'the final living dungeon member falls', 10000);
  const wipeDeath = delver.player().diedAt, encounterIds = delver.snapshot.enemies.map(enemy => enemy.id);
  Date.now = () => wipeDeath + DEATH_ANIMATION_MS - 1;
  const beforeWipe = delver.snapshot;
  await until(() => delver.snapshot !== beforeWipe, 'tick just before automatic wipe revival');
  assert.equal(delver.snapshot.dungeon.wipes, 0); assert.equal(delver.player().hp, 0);
  assert.equal(delver.player().diedAt, wipeDeath);
  assert.deepEqual(delver.snapshot.enemies.map(enemy => enemy.id), encounterIds, 'the existing encounter remains until the full death animation finishes');
  Date.now = () => wipeDeath + DEATH_ANIMATION_MS;
  await until(() => delver.snapshot.dungeon.wipes === 1, 'the party revives at the full death-animation boundary');
  assert.equal(delver.player().hp, delver.player().maxHp); assert.equal(delver.player().diedAt, 0);
  assert.deepEqual([delver.player().x, delver.player().z], [0, 22]);
  assert(delver.snapshot.enemies.every(enemy => enemy.alive && enemy.diedAt === 0 && !encounterIds.includes(enemy.id)), 'a wipe starts fresh enemy lives');
  clockOffset = Date.now() - realNow(); Date.now = () => realNow() + clockOffset;
  console.log('PASS: real WS manual corpse gold; immediate XP/quest credit; lethal-impact timestamps and retained corpse facing; exact 1400ms player respawn and dungeon-wipe gates; position and five-minute expiry; range/malformed/ownership/sibling/roster/death/instance guards; cross-region replication; reconnect, respawn-independent drops, once-only pickup and saved gold; separate boss shares.');
} finally {
  for (const c of clients) c.socket.terminate();
  await game?.stop();
  Date.now = realNow;
  rmSync(dataDir, { recursive: true, force: true });
}
