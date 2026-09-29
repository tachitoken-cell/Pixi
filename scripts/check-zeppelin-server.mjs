import { COMMUNITY_VERSION } from '../src/community.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { ZONES } from '../src/content.ts';
import { canTraverse, regionAt } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';
import { jumpFloor } from '../src/jumping.ts';
import { actorFloor, actorCanStand } from '../src/collision3d.ts';
import { ZEPPELIN_PORTS, zeppelinPose } from '../src/zeppelin.ts';
import { COLOSSEUM } from '../src/colosseum.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-zeppelin-')), realNow = Date.now, clients = [];
let clock = realNow(), game, port;
Date.now = () => { assert(Number.isSafeInteger(clock), 'test clock must match Date.now whole milliseconds'); return clock; };
const [departure, destination] = ZEPPELIN_PORTS;
function hero(name, point = departure, level = 1) {
  return { id: randomUUID(), name, x: point.x, z: point.z, zone: regionAt(point.x, point.z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), level, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, xp: 0, gold: 0,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function until(fn, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 0) { clock = Math.ceil(clock + ms); await delay(130); }
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], snapshots: 0 };
  clients.push(c); c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['snapshot', 'roster', 'welcome'].includes(m.type)) c[m.type] = m; if (m.type === 'snapshot') c.snapshots++; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'roster');
  c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id }); await until(() => c.player(), 'world entry'); return c;
}
async function action(c, message, ms = 0) { clock += ms; const count = c.snapshots; c.send(message); await until(() => c.snapshots > count, message.type); return c.player(); }
function atDock(player, dock) {
  assert.equal(player.x, dock.x); assert.equal(player.z, dock.z); assert.equal(player.zone, dock.id);
  assert.equal(player.zeppelin, null); assert(player.jump.grounded);
  assert(Math.abs(player.jump.y-actorFloor('overworld',dock.x,dock.z,player.jump.y+.05))<.001,'arrival stands on the authored dock surface');
  assert(actorCanStand('overworld',dock.x,player.jump.y,dock.z),'arrival has body clearance');
}
const board = (from = departure.id, to = destination.id) => ({ type: 'zeppelinBoard', from, to });
const discover = (port = departure.id) => ({ type: 'zeppelinDiscover', port });
function aboard(player, flight) {
  const pose = zeppelinPose(flight, clock);
  assert.deepEqual(player.zeppelin, flight); assert.equal(player.x, pose.x); assert.equal(player.z, pose.z); assert.equal(player.jump.y, pose.y); assert(!player.jump.grounded);
}
try {
  for (const dock of ZEPPELIN_PORTS) {
    assert(canTraverse(dock, dock), `${dock.name} dock has clear collision`);
    assert(!waterAt(dock.x, dock.z)); assert.equal(regionAt(dock.x, dock.z), dock.id); assert.equal(jumpFloor(dock.x, dock.z), dock.y);
  }
  const actors = [hero('Passenger'), hero('Observer', { x: departure.x, z: departure.z + 12 }), hero('Faraway', { x: 0, z: 8 }), hero('Mounted', departure, 25), { ...hero('Fallen'), hp: 0 }];
  actors[0].zeppelinPorts = [destination.id];
  actors[1].zeppelinPorts = [departure.id, departure.id, 'unknown', destination.id, 123];
  actors[3].zeppelinPorts = [departure.id, destination.id];
  const sibling = { ...hero('Fresh Pilot'), zeppelin: { from: 'unknown', to: 'unknown', startedAt: 1, ignored: true } };
  const tokens = actors.map(() => randomBytes(32).toString('base64url')), keys = tokens.map(token => createHash('sha256').update(token).digest('hex'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(actors.map((p, i) => [keys[i], { characters: i === 0 ? [p, sibling] : [p], communityRulesVersion: COMMUNITY_VERSION }]))));
  const oldNodes = ZONES[0].nodes;
  ZONES[0].nodes = [{ id: 'zeppelin-gather-check', kind: 'timber', x: departure.x, z: departure.z + 1 }];
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES[0].nodes = oldNodes; }
  port = await game.start();
  let passenger = await connect(tokens[0]);
  const observer = await connect(tokens[1]), faraway = await connect(tokens[2]), mounted = await connect(tokens[3]), fallen = await connect(tokens[4]);
  assert.deepEqual(faraway.player().zeppelinPorts, [], 'legacy characters start with no discovered docks');
  assert.deepEqual(observer.player().zeppelinPorts, [departure.id, destination.id], 'stored discovery lists keep only unique valid dock IDs');
  await action(fallen, discover()); assert.deepEqual(fallen.player().zeppelinPorts, [], 'fallen characters cannot discover docks');
  await action(faraway, discover()); assert.deepEqual(faraway.player().zeppelinPorts, [], 'discovery requires a physical visit');
  await action(passenger, board()); assert.equal(passenger.player().zeppelin, null, 'departure must be discovered');
  for (const message of [discover('unknown'), { ...discover(), zeppelinPorts: [departure.id, destination.id] }, { ...discover(), x: departure.x }]) {
    await action(passenger, message, 650); assert.deepEqual(passenger.player().zeppelinPorts, [destination.id], 'malformed and forged discovery cannot grant a dock');
  }
  await action(passenger, { type: 'jump' }); await action(passenger, discover());
  assert.deepEqual(passenger.player().zeppelinPorts, [destination.id], 'airborne discovery is rejected'); await tick(1000);
  await action(passenger, discover()); await until(() => passenger.player().zeppelinPorts.includes(departure.id), 'dock discovery saved');
  await action(passenger, discover()); assert.deepEqual(passenger.player().zeppelinPorts, [destination.id, departure.id], 'discovery is idempotent');
  await action(passenger, { type: 'selectCharacter', characterId: sibling.id });
  assert.deepEqual(passenger.player().zeppelinPorts, [], 'another character on the same account does not inherit docks'); assert.equal(passenger.player().zeppelin, null, 'invalid saved flights do not resume');
  await action(passenger, discover()); await until(() => passenger.player().zeppelinPorts.includes(departure.id), 'sibling discovers local dock');
  await action(passenger, board()); assert.equal(passenger.player().zeppelin, null, 'destination must be discovered');
  await action(passenger, { type: 'selectCharacter', characterId: actors[0].id });
  assert.deepEqual(passenger.player().zeppelinPorts, [destination.id, departure.id]);
  for (const message of [board(departure.id, departure.id), board('unknown'), { ...board(), startedAt: 0 }, { type: 'zeppelinBoard', to: destination.id }]) {
    await action(passenger, message, 650); atDock(passenger.player(), departure);
  }
  await action(faraway, board()); assert.equal(faraway.player().zeppelin, null, 'cannot remotely board');
  await action(passenger, { type: 'jump' }); await action(passenger, board()); assert.equal(passenger.player().zeppelin, null, 'must be grounded'); await tick(1000);
  await action(passenger, { type: 'gather', targetId: 'zeppelin-gather-check' }); assert(passenger.player().gathering);
  await action(passenger, board()); assert.equal(passenger.player().zeppelin, null, 'cannot board during gathering'); await action(passenger, { type: 'cancelGather' });
  await action(passenger, { type: 'duelRequest', targetId: mounted.welcome.id });
  await until(() => mounted.snapshot.duelInvites.length, 'duel invitation');
  await action(mounted, { type: 'duelAccept', invitationId: mounted.snapshot.duelInvites[0].id });
  await action(passenger, board()); assert.equal(passenger.player().zeppelin, null, 'cannot board during a duel');
  await action(passenger, { type: 'duelForfeit' });
  await action(mounted, { type: 'mount', mount: 'horse' }); assert(mounted.player().casting);
  await action(mounted, board()); assert.equal(mounted.player().zeppelin, null, 'cannot board during a cast');
  await tick(2000); assert.equal(mounted.player().travel.mount, 'horse');
  await action(mounted, board()); assert(mounted.player().zeppelin); assert.equal(mounted.player().travel.mount, null, 'boarding dismounts');
  await action(passenger, board());
  const flight = passenger.player().zeppelin;
  assert(flight && flight.arrivesAt > clock + 12000, 'level-one character with no gold or riding can take a timed flight');
  assert.equal(passenger.player().gold, 0); assert.equal(passenger.player().ridingRank, 0);
  assert.equal(passenger.player().z, departure.z + 12); assert.equal(passenger.player().jump.y, departure.y + 1.3);
  assert(!passenger.player().jump.grounded);
  await until(() => observer.snapshot.players.find(p => p.id === actors[0].id)?.zeppelin, 'flight replicated to other players');
  await action(observer, { type: 'duelRequest', targetId: actors[0].id }); assert.equal(passenger.player().duelOpponentId, null);
  await action(observer, { type: 'tradeRequest', targetId: actors[0].id }); assert(!passenger.messages.some(m => m.type === 'trade' && m.trade), 'cannot trade with airborne passengers');
  // Exercise a route above the PvP floor without tying this guard to the current atlas layout.
  const arenaPosition = { x: COLOSSEUM.x, z: COLOSSEUM.z };
  Object.assign(COLOSSEUM, { x: passenger.player().x, z: passenger.player().z });
  try {
    await tick(); assert.equal(observer.player().pvp, true); assert.equal(passenger.player().pvp, false, 'flying above the arena never opts into PvP');
    const attacks = observer.messages.filter(m => m.type === 'combat').length;
    for (const message of [{ type: 'autoAttack', targetId: actors[0].id }, { type: 'attack', ability: 'arrow', targetId: actors[0].id }]) await action(observer, message);
    assert.equal(observer.player().autoAttack, null); assert.equal(observer.messages.filter(m => m.type === 'combat').length, attacks, 'arena players cannot attack airborne passengers');
    assert.equal(passenger.player().hp, 100);
  } finally { Object.assign(COLOSSEUM, arenaPosition); }
  const before = { ...passenger.player().jump };
  for (const message of [{ type: 'move', zone: destination.id, x: destination.x, z: destination.z, rotation: 1 }, { type: 'jump' }, { type: 'mount', mount: 'horse' }, { type: 'travel', zone: destination.id }, { type: 'dungeonEnter' }, { type: 'attack', targetId: 'none' }, { type: 'stand' }, discover(ZEPPELIN_PORTS[2].id), board()]) {
    await action(passenger, message); assert.deepEqual(passenger.player().zeppelin, flight); assert.deepEqual(passenger.player().jump, before);
    assert.deepEqual(passenger.player().zeppelinPorts, [destination.id, departure.id], 'passengers cannot discover docks from the air');
  }
  await action(passenger, { type: 'chat', text: 'Hello from the zeppelin' }, 800);
  assert(passenger.messages.some(m => m.type === 'event' && m.kind === 'chat' && m.text.includes('Hello from the zeppelin')));
  await tick((flight.arrivesAt - flight.startedAt) / 2 - (clock - flight.startedAt));
  const pose = zeppelinPose(flight, clock), p = passenger.player();
  assert.equal(p.x, pose.x); assert.equal(p.z, pose.z); assert.equal(p.jump.y, pose.y); assert.equal(p.hp, 100, 'passengers stay safe above the world');
  await delay(1100);
  const saved = JSON.parse(readFileSync(join(dir, 'players.json'), 'utf8'))[keys[0]].characters[0];
  assert.equal(saved.x, departure.x); assert.equal(saved.z, departure.z); assert.equal(saved.zone, departure.id); assert.deepEqual(saved.zeppelin, flight, 'midflight saves retain the route alongside a safe ground fallback');
  assert.deepEqual(saved.zeppelinPorts, [destination.id, departure.id], 'discovered docks are durable');
  await tick(flight.arrivesAt - clock - 1); assert(passenger.player().zeppelin, 'no early disembarkation');
  await tick(1); atDock(passenger.player(), destination);
  assert(passenger.messages.some(m => m.type === 'correction' && m.x === destination.x && m.z === destination.z));
  await action(passenger, board(destination.id, departure.id)); const returnFlight = passenger.player().zeppelin; await tick(8000); aboard(passenger.player(), returnFlight);
  passenger.socket.terminate(); await delay(130); passenger = await connect(tokens[0]); aboard(passenger.player(), returnFlight);
  assert.deepEqual(passenger.player().zeppelinPorts, [destination.id, departure.id], 'reconnect preserves personal discoveries');
  await game.stop();
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start();
  passenger = await connect(tokens[0]); aboard(passenger.player(), returnFlight);
  await game.stop(); clock = Math.ceil(returnFlight.arrivesAt) + 1;
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start();
  passenger = await connect(tokens[0]); atDock(passenger.player(), departure);
  await action(passenger, board()); passenger.send({ type: 'leaveWorld' }); await until(() => passenger.roster && passenger.roster.characters[0].x === departure.x, 'explicit world exit');
  passenger.send({ type: 'selectCharacter', characterId: actors[0].id }); await until(() => passenger.player()?.zeppelin === null, 'explicit exit ends flight'); atDock(passenger.player(), departure);
  console.log('PASS zeppelin server: six safe docks, durable per-character discovery and both-endpoint unlocks, invalid/remote/airborne claims denied, free flights, replicated trajectory and PvP immunity, action locks, safe arrival, seamless reconnect/restart and offline arrival.');
} finally { for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
