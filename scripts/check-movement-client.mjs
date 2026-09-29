import ts from 'typescript';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { mountSpeed } from '../src/travel.ts';
import { gearUpgradeQuote } from '../src/progression.ts';
import { canTraverse, WORLD_BOUNDS } from '../src/realm.ts';
import { moveJump, newJump } from '../src/jumping.ts';
import { CLIMB_ENABLED } from '../src/climbing.ts';
import { Vector3 } from 'three';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const functionText = name => tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(tree);
const start = source.indexOf("  } else if(msg.type==='snapshot'){");
const end = source.indexOf("  } else if(msg.type==='combat'){", start);
assert(start >= 0 && end > start, 'exercise the actual snapshot and correction message handlers');
const handlers = source.slice(start, end).replace(/^  } else /, '');
function fixture() {
  const noop = () => {}, snaps = [];
  const context = createContext({ instantCombat:null, raid:null,raidInvites:[],raidAppearance:()=>[],presentedRaidResult:"",presentedDungeonResult:"",arenaWagerUI:{close:noop},
    treasureMapStarting:false, rosterActive: false, selectedBagItem: '', gearUpgradeQuote, player: { id: 'hero', hp: 100, appearance: { className: 'Ranger' } }, playerId: 'hero', position: { x: 0, z: 0 },
    worldReady:true, renderedInstance:null, updateDungeonRoomView:noop, worldZone: 'greenwood', worldInstance: null, worldDungeonKind:null, dungeonSummon:null, zoneHandle: null, serverOffset: 0, pendingPartyInvite: null,
    party: null, partyInvites: [], dungeon: null, arena:null, players: [], enemies: [], nodes: [], loot: [], gmPlayers: [],
    heldKeyCodes:new Map(),rotation: 0, keys: new Set(['w']), combatAnimations: new Map(), panel: { open: false }, deathPresented: false,
    $: () => ({ textContent: '' }), updatePartyHUD: noop, replaceAvatar: noop, reconcileJump: noop,
    updateShopSales: noop, updateHUD: noop, updateAudioScene: noop, refreshGmAccess: noop, updatePartyInvitation: noop, updateWho: noop, syncEntities: noop, renderInspectPanel: noop,
    achievementsUI: { update: noop }, arenaUI: { update: noop }, duelUI: { update: noop }, playerMenu: { update: noop }, tradeUI: { refresh: noop }, auctionUI: { refresh: noop }, lootUI: { drops: [], update(drops) { this.drops = drops; }, visibleDrops() { return this.drops; } },
    zoneError: noop, clearWaypoint: noop, closePanel: noop, gameAudio: { play: noop, reset: noop },
    snapWorldPosition(x, z, instanceId, jump) { snaps.push({ x, z, instanceId, jump }); Object.assign(context.position, { x, z }); },
    async switchZone(zone, instanceId) { context.worldZone = zone; context.worldInstance = instanceId; },
  });
  runInContext(source.match(/^function clearMovementKeys.*$/m)[0], context);
  runInContext(stripTypeScriptTypes(`function receive(msg){${handlers}}}`), context);
  const snapshot = player => context.receive({ type: 'snapshot', serverTime: 0, zone: player.zone ?? 'greenwood',
    instanceId: player.instanceId ?? null, population: 1, players: [{ id: 'hero', hp: 100, appearance: { className: 'Ranger' }, x: 0, z: 0, ownedGear: [], ...player }], enemies: [], nodes: [], loot: [] });
  const correction = point => context.receive({ type: 'correction', x: 0, z: 0, zone: 'greenwood', instanceId: null, rotation: 0, ...point });
  return { context, snaps, snapshot, correction };
}

for (const level of [25, 50]) for (const mount of ['horse', 'wolf']) {
  const f = fixture(), speed = mountSpeed(level), ridingRank = level === 50 ? 2 : 1;
  const travel = { mount, stamina: 100, sprinting: false, exhausted: false };
  // A 350ms-old accepted position is 3.5/4.9m behind normal riding prediction.
  for (let tick = 4; tick < 40; tick++) {
    const predicted = speed * tick * .1;
    f.context.position.z = predicted;
    f.snapshot({ z: predicted - speed * .35, level, ridingRank, travel, hp: 90 });
    assert.equal(f.context.position.z, predicted, `${mount}, level ${level}: delayed snapshot must not rewind riding`);
    assert.equal(f.context.player.hp, 90, 'health continues to replicate');
    assert.equal(f.context.player.travel.mount, mount, 'mounted state continues to replicate');
  }
  assert.equal(f.snaps.length, 0); assert(f.context.keys.has('w'), 'snapshot preserves held movement');
  f.snapshot({ z: 0, travel: { ...travel, mount: null, stamina: 73 } });
  assert.equal(f.context.player.travel.mount, null); assert.equal(f.context.player.travel.stamina, 73);

  const correctedZ = f.context.position.z - .25, jump = { y: 2, sequence: 1 };
  f.correction({ z: correctedZ, rotation: .8, jump });
  assert.equal(f.context.position.z, correctedZ, 'even a small explicit correction snaps');
  assert.equal(f.context.rotation, .8); assert.equal(f.context.keys.size, 0); assert.equal(f.snaps.at(-1).jump, jump);
  f.snapshot({ z: correctedZ - 10, travel });
  assert.equal(f.context.position.z, correctedZ, 'a delayed snapshot cannot undo a correction');
}

const f = fixture();
f.context.position.z = 2;
f.snapshot({ z: 1, hp: 0, jump: { y: 0, sequence: 2 } });
assert.equal(f.context.position.z, 1, 'death retains the authoritative position even within 3m');
assert.equal(f.context.keys.size, 0); assert.equal(f.snaps.at(-1).jump.y, 0);
f.correction({ z: 8 }); f.snapshot({ z: 8, hp: 100 });
assert.equal(f.context.position.z, 8, 'respawn correction restores the refuge position');
for (const [zone, instanceId, z] of [['hollow', 'vault', 24], ['greenwood', null, 8]]) {
  f.correction({ zone, instanceId, z });
  assert.equal(f.context.position.z, z); assert.equal(f.context.worldZone, zone); assert.equal(f.context.worldInstance, instanceId);
}
console.log('PASS movement client: delayed snapshots preserve both mounts/riding ranks and state updates; explicit corrections, death, respawn and instance travel remain authoritative.');

// Saving a merchant sale can correct an idle rider repeatedly. Keep the rendered
// saddle/hover height and camera framing while applying authoritative movement.
for (const lift of [0, .7, 1.4, 2.2]) {
  const f = fixture(), c = f.context;
  Object.assign(c, { newJump, sprintSinceMove: true, lastSentMove: null,
    jumpRequestedAt: 0, position: new Vector3(3, 4, 5),
    localAvatar: { position: new Vector3(3, 4 + lift, 5) }, cameraTarget: new Vector3(2.5, 5.2 + lift, 4.5) });
  runInContext(stripTypeScriptTypes(functionText('snapWorldPosition')), c);
  const riderOffset = c.localAvatar.position.clone().sub(c.position), cameraOffset = c.cameraTarget.clone().sub(c.position);
  for (let tick = 0; tick < 20; tick++) {
    const x = tick < 10 ? 3 : 8, z = tick < 10 ? 5 : -2, y = tick < 10 ? 4 : 7;
    f.correction({ x, z, jump: { y, grounded: true, velocity: 0, sequence: 0 } });
    assert.deepEqual(c.position.toArray(), [x, y, z], 'corrections still apply the exact authoritative position');
    assert(c.localAvatar.position.clone().sub(c.position).distanceTo(riderOffset) < 1e-12, 'idle and real corrections preserve rider height');
    assert(c.cameraTarget.clone().sub(c.position).distanceTo(cameraOffset) < 1e-12, 'idle and real corrections preserve camera framing');
    assert.equal(c.lastSentMove.x, x); assert.equal(c.lastSentMove.z, z);
    assert.equal(c.keys.size, 0); assert.equal(c.sprintSinceMove, false);
  }
}
console.log('PASS merchant corrections: repeated idle and real position resets preserve rider height and camera framing.');

const upgraded=fixture(), next=gearUpgradeQuote('warden-longbow').nextId;
upgraded.context.selectedBagItem='warden-longbow';upgraded.snapshot({ownedGear:['warden-longbow']});
assert.equal(upgraded.context.selectedBagItem,'warden-longbow','pending upgrade keeps current selection');
upgraded.snapshot({ownedGear:[next]});assert.equal(upgraded.context.selectedBagItem,next,'confirmed upgrade follows its exact replacement item');
upgraded.context.selectedBagItem='sunsteel-sword';upgraded.snapshot({ownedGear:[next]});assert.equal(upgraded.context.selectedBagItem,'sunsteel-sword','an unrelated ownership change cannot select another item');

// Run the actual prediction and sender against the server's swept collision and
// movement credit rules. Locally valid turns must stay valid between packets.
const movement = 'const charging=false;'+source.slice(source.indexOf(' const able=connected&&worldReady'), source.indexOf(' if(isMoving&&'));
const periodicMove = source.match(/^ if\(able&&!jump.climb&&now-lastMove>=50\).*$/m)[0];
function movementFixture(shape, speed, fps, signs = [1, 1], sprint = false, slideBeforeClimb = false) {
  const [sx, sz] = signs, extent = (shape.halfWidth ?? shape.r) + .4;
  const start = { x: (-extent - .2) * sx, z: (-extent - 1.1) * sz };
  let authoritative = { ...start }, budget = .8 / 5.8, lastAt = 0;
  const packets = [], noop = () => {};
  const c = createContext({
    position: new Vector3(start.x, 0, start.z), jump: newJump(start.x, start.z, true), lastSentMove: { ...start },
    connected: true, worldReady: true, renderedInstance:'test-dungeon', worldInstance: 'test-dungeon', worldZone: 'greenwood', dungeon: null,
    colliders: [shape], WORLD_BOUNDS, isInstantCombatInstance, dungeonBounds: () => WORLD_BOUNDS, isRaidInstance,RAID_BOUNDS,isArenaInstance: () => false,
    canTraverse, moveJump: (state,from,to,instance) => canTraverse(from,to,[shape]) && moveJump(state,from,to,instance), newJump, playerRouteAllowed:(from,to)=>canTraverse(from,to,[],WORLD_BOUNDS), currentCollisionScene:()=>undefined, CLIMB_ENABLED, startClimb:()=>false, climbStopRequested:false, syncCollisionState:noop, waterAt: () => false, localAvatar: { position: new Vector3() }, cameraTarget: new Vector3(),
    player: { hp: 100, travel: { mount: speed > 10 ? 'horse' : null } }, gmFlying: () => false,
    keys: new Set([sx > 0 ? 'd' : 'a', sz > 0 ? 's' : 'w', ...(sprint ? ['shift'] : [])]),
    yaw: 0, rotation: 0, lastMove: 0, isMoving: false, sprintSinceMove: false, jumpRequestedAt: 0,
    updateDungeonRoomView: noop, clock: 0, modalOpen: () => false, standUp: noop, travelSpeed: () => speed, canSprint: () => true,
    toast: noop, WebSocket: { OPEN: 1 },
  });
  if (slideBeforeClimb) c.startClimb = () => assert.fail('a clear slide around an object must be tried before grabbing it to climb');
  c.performance = { now: () => c.clock };
  c.socket = { readyState: 1, send(raw) {
    const message = JSON.parse(raw);
    assert(canTraverse(authoritative, message, c.colliders), `corner packet stays clear at ${speed} m/s, ${fps} fps: ${JSON.stringify({ authoritative, message })}`);
    budget = Math.min(3.2 / 5.8, budget + (c.clock - lastAt) / 1000); lastAt = c.clock;
    const cost = Math.hypot(message.x - authoritative.x, message.z - authoritative.z) / speed;
    assert(cost <= budget + .1 / speed, 'turn packets stay within authoritative speed credit'); budget -= cost;
    if (sprint && cost > 0) assert(message.sprint, 'turn flushes retain sprint input');
    authoritative = message; packets.push({ ...message, at: c.clock });
  } };
  for (const name of ['send', 'snapWorldPosition', 'freeAt', 'tryClimb']) runInContext(stripTypeScriptTypes(functionText(name)), c);
  if (slideBeforeClimb) {
    const allowed = c.playerRouteAllowed;
    c.playerRouteAllowed = () => false; c.tryClimb({ x: start.x + .1, z: start.z });
    c.playerRouteAllowed = allowed;
  }
  runInContext(`function frame(dt,now){${movement}${periodicMove}}`, c);
  for (let frame = 1; frame <= fps * 2; frame++) { c.clock = frame * 1000 / fps; c.frame(1 / fps, c.clock); }
  if (shape.halfWidth) assert(c.position.x * sx > extent && c.position.z * sz > -extent, 'holding diagonal input progresses around the corner');
  const beforeEscape = c.position.clone();
  c.keys.clear(); c.keys.add(c.position.z > 0 ? 's' : 'w'); if (sprint) c.keys.add('shift');
  for (let frame = 1; frame <= fps / 2; frame++) { c.clock += 1000 / fps; c.frame(1 / fps, c.clock); }
  assert(c.position.distanceTo(beforeEscape) > speed * .4, 'turning away from an obstacle never remains stuck');
  for (const packet of packets) assert(packets.filter(p => p.at > packet.at - 1000 && p.at <= packet.at).length < 50, 'corner packets leave room below the 65-actions/second limit');
  c.snapWorldPosition(start.x, start.z, null, newJump(start.x, start.z, true));
  assert.equal(c.lastSentMove.x, start.x); assert.equal(c.lastSentMove.z, start.z, 'corrections and travel reset the network anchor');
  c.connected = false; c.send({ type: 'move', x: 99, z: 99, rotation: 0 });
  assert.equal(c.lastSentMove.x, start.x, 'unsent moves cannot advance the network anchor');
  if (slideBeforeClimb) {
    c.connected = true; c.position.set(0,0,-extent-.02); c.lastSentMove = { x:0,z:c.position.z };
    authoritative = { ...c.lastSentMove }; budget = .8/5.8; lastAt = c.clock;
    c.jump = newJump(0,c.position.z,true); c.keys.clear(); c.keys.add('s'); c.yaw = 1e-8;
    let attempts = 0; c.startClimb = () => { attempts++; return false; };
    c.clock += 100; c.frame(1/60,c.clock);
    assert.equal(attempts,CLIMB_ENABLED ? 1 : 0,'blocked movement starts a climb only while climbing is enabled');
    if (!CLIMB_ENABLED) { assert(!c.jump.climb); assert.equal(c.position.z,-extent-.02,'disabled climbing cannot move through the wall'); }
  }
}
movementFixture({ x: 0, z: 0, r: 1, halfWidth: 1, halfDepth: 1 }, 5.8, 60, [1, 1], false, true);
for (const shape of [{ x: 0, z: 0, r: 1, halfWidth: 1, halfDepth: 1 }, { x: 0, z: 0, r: 1 }]) {
  for (const fps of [20, 60, 144, 240]) for (const speed of [5.8, 8.2, 10, 14]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    movementFixture(shape, speed, fps, [sx, sz], speed === 8.2);
  }
}
console.log('PASS corner movement: walls and round obstacles, all approaches, walk/sprint/mount speeds, 20–240 fps, packet collision/credit/rate, sprint state and correction resets.');
