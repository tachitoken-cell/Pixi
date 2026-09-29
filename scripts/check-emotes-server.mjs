import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { EMOTES } from '../src/emotes.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { RACES, DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { ZONES } from '../src/content.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear } from '../src/progression.ts';
import { spellsForClass, defaultHotbar } from '../src/spells.ts';
import { canTraverse, regionAt, toWorld, WORLD_BOUNDS, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';
import { BUILDING_CHAIRS, chairApproach, buildingAt } from '../src/buildings.ts';
import { ROOTVAULT_ENTRANCE } from '../src/dungeon.ts';
import { zeppelinPort } from '../src/zeppelin.ts';

// Real WebSockets and realm ticks; only isolated saves, encounter data and wall time are controlled.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-emotes-')), file = join(dir, 'players.json'), clients = [], realNow = Date.now;
const originalMonsters = structuredClone(MONSTERS), spawn = OVERWORLD_SPAWNS.find(enemy => enemy.id === 'slime-1'), base = { x: spawn.x, z: spawn.z - 2 };
let clock = realNow(), game, port;
Date.now = () => clock;
const hash = token => createHash('sha256').update(token).digest('hex');
async function until(fn, label) { const end = realNow() + 6000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 800) { clock += ms; await delay(130); }
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
function hero(name, extra = {}) {
  const learnedSpells = spellsForClass('Mage').map(spell => spell.id);
  return { id: randomUUID(), name, appearance: { ...DEFAULT_APPEARANCE, className: 'Mage' }, coordinateVersion: 2, zone: 'greenwood', x: base.x, z: base.z, rotation: 0,
    level: 60, maxHp: 808, hp: 808, xp: 0, gold: 0, characterCreated: true, talents: [], ...starterGear('Mage'), learnedSpells,
    hotbar: defaultHotbar('Mage', 60, learnedSpells), ridingRank: 1, ownedMounts: ['horse'], rootvaultUnlocked: true,
    inventory: { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, quest: { stage: 0, kills: 0, crystals: 0 }, ...extra };
}
async function connect(p, token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], token, id: p.id }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(player => player.id === c.id);
  c.emotes = () => c.messages.filter(message => message.type === 'event' && message.kind === 'emote');
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['snapshot', 'roster', 'welcome'].includes(m.type)) c[m.type] = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token, characterId: p.id }); await until(() => c.player(), `enter ${p.name}`); return c;
}
async function fixture(extra = {}, peers = []) {
  await stop(); clock += 10000;
  for (const stats of Object.values(MONSTERS)) Object.assign(stats, { aggroRange: 0, speed: 0 });
  const p = hero('Emote actor', extra), rows = [p, ...peers], tokens = rows.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(file, JSON.stringify(Object.fromEntries(rows.map((player, i) => [hash(tokens[i]), { characters: [player], communityRulesVersion: COMMUNITY_VERSION }]))));
  const enemies = ZONES[0].enemies, nodes = ZONES[0].nodes;
  ZONES[0].enemies = [{ id: 'emote-target', kind: 'moss-slime', x: p.x, z: p.z + 2 }];
  ZONES[0].nodes = [{ id: 'emote-node', kind: 'crystal', x: p.x + 1, z: p.z }];
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES[0].enemies = enemies; ZONES[0].nodes = nodes; }
  port = await game.start(); const connected = []; for (let i = 0; i < rows.length; i++) connected.push(await connect(rows[i], tokens[i])); return connected;
}
async function begin(c, id = 'dance') {
  await tick(); const count = c.emotes().length; c.send({ type: 'emote', emoteId: id });
  await until(() => c.emotes().length > count && c.player().emote?.id === id, `${id} acknowledged`); return c.player().emote;
}
async function request(c, message) { const before = c.snapshot; c.send(message); await until(() => c.snapshot !== before, message.type); return c.player(); }
async function rejected(c, message, pattern = /activity|dry ground/, elapsed = 800) {
  await tick(elapsed); const index = c.messages.length; c.send(message);
  const result = await until(() => c.messages.slice(index).find(m => m.type === 'event' && m.kind === 'info'), 'rejected emote'); assert.match(result.text, pattern);
}
try {
  const actorId = randomUUID(), near = hero('Nearby'), ignored = hero('Ignoring', { ignoreIds: [actorId] }), farPoint = toWorld('hollow', { x: 0, z: 8 }), far = hero('Distant', { ...farPoint, zone: regionAt(farPoint.x, farPoint.z) });
  let [c, observer, ignoring, distant] = await fixture({ id: actorId, emote: { id: 'dance', startedAt: 1, endsAt: null } }, [near, ignored, far]);
  assert.equal(c.player().emote, null, 'saved emotes never restore');
  for (const [id, definition] of Object.entries(EMOTES)) {
    const state = await begin(c, id); assert.deepEqual(state, { id, startedAt: clock, endsAt: definition.duration === null ? null : clock + definition.duration });
    await until(() => observer.snapshot.players.find(p => p.id === actorId)?.emote?.startedAt === state.startedAt, 'nearby authoritative replication');
    assert.deepEqual(observer.snapshot.players.find(p => p.id === actorId).emote, state); assert.equal(observer.emotes().at(-1).text, `Emote actor ${definition.text}`);
    assert.equal(ignoring.snapshot.players.find(p => p.id === actorId)?.emote, null); assert.equal(distant.snapshot.players.find(p => p.id === actorId)?.emote, null);
    assert.equal(ignoring.emotes().length, 0); assert.equal(distant.emotes().length, 0);
    if (definition.duration !== null) { await tick(definition.duration - 1); assert(c.player().emote, 'finite gesture remains until deadline'); await tick(1); assert.equal(c.player().emote, null, 'gesture expires exactly at deadline'); }
    else { await tick(60000); assert.deepEqual(c.player().emote, state, 'dance loops without a timeout'); }
  }
  const dance = await begin(c), eventCount = c.emotes().length;
  c.send({ type: 'emote', emoteId: 'laugh' }); c.send({ type: 'chat', text: 'Too soon' }); await delay(130);
  assert.deepEqual(c.player().emote, dance); assert.equal(c.emotes().length, eventCount, 'emotes share chat spam protection');
  await request(c, { type: 'emote', emoteId: null }); assert.equal(c.player().emote, null, 'stop works inside the cooldown');
  await tick(); c.send({ type: 'chat', text: 'Hello' }); await until(() => c.messages.some(m => m.kind === 'chat' && m.text.endsWith('Hello')), 'chat sent');
  c.send({ type: 'emote', emoteId: 'dance' }); await delay(130); assert.equal(c.player().emote, null, 'chat also throttles emotes');
  for (const bad of [{ type: 'emote' }, { type: 'emote', emoteId: 1 }, { type: 'emote', emoteId: '__proto__' }, { type: 'emote', emoteId: 'DANCE' }, { type: 'emote', emoteId: 'dance', startedAt: 1 }, { type: 'emote', emoteId: null, endsAt: null }])
    await rejected(c, bad, /Choose an emote/);
  await begin(c); const stationary = { type: 'move', x: c.player().x, z: c.player().z, rotation: 1 };
  for (let i = 0; i < 5; i++) { await request(c, stationary); assert.equal(c.player().emote.id, 'dance', 'idle heartbeat and facing changes preserve dance'); }
  assert(canTraverse(c.player(), { x: c.player().x + .001, z: c.player().z }));
  await request(c, { ...stationary, x: stationary.x + .001 }); assert.equal(c.player().emote, null, 'even a small accepted step cancels'); await tick(5000); assert.equal(c.player().emote, null, 'stopping does not resume dance');
  await begin(c); await request(c, { type: 'jump' }); assert.equal(c.player().emote, null); assert.equal(c.player().jump.grounded, false);
  await rejected(c, { type: 'emote', emoteId: 'dance' }, /activity|dry ground/, 100); await tick(2000);
  await begin(c); c.send({ type: 'gather', targetId: 'emote-node' }); await until(() => c.player().gathering, 'gathering'); assert.equal(c.player().emote, null);
  await rejected(c, { type: 'emote', emoteId: 'laugh' }); await request(c, { type: 'cancelGather' });
  await begin(c); await request(c, { type: 'mount', mount: 'horse' }); assert.equal(c.player().emote, null); assert.equal(c.player().casting.ability, 'mount');
  await rejected(c, { type: 'emote', emoteId: 'dance' }); await tick(3000); assert.equal(c.player().travel.mount, 'horse');
  await rejected(c, { type: 'emote', emoteId: 'laugh' }); await request(c, { type: 'emote', emoteId: null }); await request(c, { type: 'mount', mount: null });
  await begin(c); await request(c, { type: 'attack', ability: 'frostbolt', targetId: 'emote-target' }); assert.equal(c.player().emote, null); assert(c.player().casting);
  await rejected(c, { type: 'emote', emoteId: 'dance' }); await request(c, { type: 'cancelCast' });
  await begin(c); await request(c, { type: 'autoAttack', targetId: 'emote-target' }); assert.equal(c.player().emote, null);
  await request(c, { type: 'autoAttack', targetId: null });

  // World reentry, reconnect and restart never resurrect an old emote or save it as progression.
  [c] = await fixture(); await begin(c); c.send({ type: 'leaveWorld' }); await until(() => c.roster, 'roster'); assert.equal(c.roster.characters[0].emote, null);
  c.snapshot = null; c.send({ type: 'selectCharacter', characterId: c.id }); await until(() => c.player(), 'reentry'); assert.equal(c.player().emote, null);
  await begin(c); c.socket.close(); await until(() => c.socket.readyState === WebSocket.CLOSED, 'disconnect'); c = await connect({ id: c.id }, c.token); assert.equal(c.player().emote, null);
  await begin(c); const savedId = c.id, token = c.token; await stop(); assert.equal(JSON.parse(readFileSync(file, 'utf8'))[hash(token)].characters[0].emote, undefined);
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); c = await connect({ id: savedId }, token); assert.equal(c.player().emote, null);

  for (const race of RACES) { [c] = await fixture({ appearance: { ...DEFAULT_APPEARANCE, className: 'Mage', race: race.id } }); await begin(c); assert.equal(c.player().appearance.race, race.id, 'every race can use the shared emote protocol'); }
  [c] = await fixture({ hp: 0, diedAt: clock }); await rejected(c, { type: 'emote', emoteId: 'dance' }); await request(c, { type: 'emote', emoteId: null });
  const wet = { x: WORLD_BOUNDS.minX + 4, z: 0 }; assert(waterAt(wet.x, wet.z));
  [c] = await fixture({ ...wet, zone: regionAt(wet.x, wet.z) }); await rejected(c, { type: 'emote', emoteId: 'dance' });
  const chair = BUILDING_CHAIRS.find(chair => { const point = chairApproach(chair); return buildingAt(point.x, point.z)?.zone === 'greenwood' && canTraverse(point, point); }); assert(chair);
  [c] = await fixture(chairApproach(chair)); await begin(c); await request(c, { type: 'sit', chairId: chair.id }); assert(c.player().seated); assert.equal(c.player().emote, null); await rejected(c, { type: 'emote', emoteId: 'dance' });
  const dock = zeppelinPort('greenwood'); [c] = await fixture({ x: dock.x, z: dock.z, zeppelinPorts: ['greenwood', 'hollow'] });
  await begin(c); await request(c, { type: 'zeppelinBoard', from: 'greenwood', to: 'hollow' }); assert(c.player().zeppelin); assert.equal(c.player().emote, null);
  await rejected(c, { type: 'emote', emoteId: 'dance' }); await request(c, { type: 'emote', emoteId: null });
  const entrance = { x: ROOTVAULT_ENTRANCE.x, z: ROOTVAULT_ENTRANCE.z, zone: 'hollow' };
  [c, observer] = await fixture(entrance, [hero('Outside dungeon', entrance)]); await begin(c); await request(c, { type: 'dungeonEnter' }); assert(c.player().instanceId); assert.equal(c.player().emote, null);
  const outsideCount = observer.emotes().length; await begin(c); await delay(130); assert.equal(observer.emotes().length, outsideCount, 'instance boundary suppresses text'); assert(!observer.snapshot.players.some(p => p.id === c.id), 'instance boundary suppresses player state');
  [c] = await fixture({ hp: 1 }); await begin(c); Object.assign(MONSTERS['moss-slime'], { aggroRange: 7, damage: 100, speed: originalMonsters['moss-slime'].speed });
  for (let i = 0; i < 30 && c.player().hp; i++) await tick(200);
  assert.equal(c.player().hp, 0, 'real enemy combat reaches the death path'); assert.equal(c.player().emote, null, 'combat and death clear dance');
  console.log('PASS emotes: all commands/races, authoritative timing and loop, nearby replication, ignored/far/instance isolation, strict request and chat throttling, idle vs accepted movement, action/travel/death cancellation, activity rejection and transient reconnect/restart state.');
} finally { await stop(); Date.now = realNow; for (const [id, stats] of Object.entries(originalMonsters)) Object.assign(MONSTERS[id], stats); rmSync(dir, { recursive: true, force: true }); }
