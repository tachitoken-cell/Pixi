import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { createRemoteMotion } from '../src/remote-motion.ts';
import { groundHeight, waterAt } from '../src/landscape.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const cadenceLine = source.split('\n').find(line => line.trimStart().startsWith('if(able&&!jump.climb&&now-lastMove'));
assert(cadenceLine, 'exercise the actual frame movement sender');
const cadence = new Function('now', 'lastMove', 'able', 'climb=false', `let count=0; const position={x:0,z:0},worldZone='greenwood',rotation=0,jump={climb}; function send(){count++;} ${cadenceLine} return {count,lastMove};`);
assert.equal(cadence(49, 0, true).count, 0);
assert.equal(cadence(50, 0, true).count, 1);
assert.equal(cadence(5000, 0, true).count, 1, 'a stalled frame sends once, without a catch-up burst');
assert.equal(cadence(5000, 0, false).count, 0, 'unavailable movement never sends');
assert.equal(cadence(5000, 0, true, true).count, 0, 'authoritative climbing never sends horizontal prediction packets');

const pose = (x, extra = {}) => ({ x, y: 0, z: 0, rotation: 0, instanceId: null, mode: 'walking', ...extra });
const close = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
const motion = createRemoteMotion();
motion.push(pose(0), 1000, 20);
motion.push(pose(1, { y: 1, rotation: Math.PI / 2 }), 1100, 130);
motion.push(pose(2, { y: 2, rotation: Math.PI }), 1200, 225);
const reused = motion.sample(220);
close(reused.x, .5, 'position follows snapshot time, not variable arrival time');
close(reused.y, .5, 'jump height interpolates with horizontal position');
close(reused.rotation, Math.PI / 4, 'rotation interpolates');
assert(reused.moving);
assert.equal(motion.sample(230), reused, 'sampling reuses its output object');
close(motion.sample(10000).x, 2, 'a stalled connection cannot extrapolate');
assert.equal(motion.sample(10000).moving, false);
motion.push(pose(99), 1150, 300);
close(motion.sample(10000).x, 2, 'late older snapshots are ignored');
motion.push(pose(NaN), 1300, 325);
close(motion.sample(10000).x, 2, 'invalid network coordinates are ignored');

const turning = createRemoteMotion();
turning.push(pose(0, { rotation: Math.PI - .1 }), 0, 0);
turning.push(pose(0, { rotation: -Math.PI + .1 }), 100, 100);
close(turning.sample(200).rotation, Math.PI, 'rotation takes the short path across the wrap');
assert.equal(turning.sample(200).moving, false, 'turning in place does not animate running');

const boundaries = createRemoteMotion();
for (let time = 0; time <= 400; time += 100) boundaries.push(pose(time / 100), time, time);
for (const time of [249.9, 250, 250.1, 349.9, 350, 350.1]) {
  assert(boundaries.sample(time).moving, 'an interior snapshot boundary cannot flicker to idle');
}
const stopped = createRemoteMotion();
stopped.push(pose(0), 0, 0); stopped.push(pose(1), 100, 100); stopped.push(pose(1), 200, 200);
assert.equal(stopped.sample(250).moving, false, 'the following stationary segment stops animation at its boundary');

for (const [label, update, time, received] of [
  ['teleport', pose(50), 200, 200],
  ['instance transition', pose(2, { instanceId: 'dungeon:one' }), 200, 200],
  ['sitting', pose(2, { mode: 'seated:chair' }), 200, 200],
  ['death', pose(2, { mode: 'dead' }), 200, 200],
  ['zeppelin boarding', pose(2, { mode: 'zeppelin' }), 200, 200],
  ['server update gap', pose(2), 2000, 2000],
  ['backgrounded receiver', pose(2), 200, 2000],
]) {
  const value = createRemoteMotion(); value.push(pose(0), 0, 0); value.push(pose(1), 100, 100);
  value.push(update, time, received);
  close(value.sample(received).x, update.x, `${label} resets old positions immediately`);
  assert.equal(value.sample(received).moving, false, `${label} clears stale running`);
}

// Execute the real entity-sync and remote-frame bindings with inexpensive meshes.
// World construction, labels and animation internals are outside this check.
const syncStart = source.indexOf('function syncEntities('), syncEnd = source.indexOf(' for(const [id,entry] of enemyMeshes)', syncStart);
const frameStart = source.lastIndexOf(' for(const p of players){', source.indexOf('const pose=entry.motion.sample(now)'));
const frameEnd = source.indexOf(' const petOwners:', frameStart);
const clearStart = source.indexOf('function clearEntityViews(){'), clearEnd = source.indexOf('function zoneError(){', clearStart);
assert(syncStart >= 0 && syncEnd > syncStart && frameStart >= 0 && frameEnd > frameStart);
assert(source.includes('syncEntities(msg.serverTime)'), 'snapshot handler forwards its authoritative timestamp');
function clientFixture() {
  const noop = () => {}, trace = [], mountTrace = [], labelTrace = [];
  const context = {
    visibleInDungeonRoom:()=>true, clock: 0, performance: { now: () => context.clock }, Date: { now: () => 1000 + context.clock }, serverOffset: 0,
    createRemoteMotion, remote: new Map(), mountViews: new Map(), lootMeshes: new Map(), loot: [], selectedId: null,
    playerId: 'local', players: [], position: { x: 100, z: 100 }, worldInstance: null, graphics: { renderDistance: 180 },
    scene: { add: noop }, makeCharacter: () => new THREE.Group(), removeRig: noop, disposeMount: noop,
    playerNameplate: () => ({ remove: noop }), updatePlayerNameplate: noop, raidAppearance: progress => progress, updateRaidNameplate: noop,
    surfaceHeight: () => 2, groundHeight: () => 2, jumpFloor: () => 2, waterAt: x => x < 0, mountRiderOffset: () => 3,
    zeppelinPose: flight => flight.pose, deathProgress: () => .5, combatPose: () => context.attack,
    animateCharacter: (...args) => trace.push(args), updateMountView: (...args) => mountTrace.push(args), placeLabel: (...args) => labelTrace.push(args),
    emotePlayback: noop, mountBob: () => 0, inColosseumClearing: () => false, COLOSSEUM: { outerRadius: 20 },
    petFollowers: { clear: noop }, combatCompanions: { clear: noop }, clearUnitFrames: noop, clearChatBubbles: noop, playerMenu: { close: noop },
    panel: { open: false }, closePanel: noop, clearCombat: noop, hoveredId: null, targetRing: { visible: true },
    enemyMeshes: new Map(), nodeMeshes: new Map(), removeNode: noop,
  };
  runInNewContext(stripTypeScriptTypes(`${source.match(/^function activeMount\(.*$/m)[0]}\n${source.slice(clearStart, clearEnd)}\n${source.slice(syncStart, syncEnd)}}\nfunction renderRemote(now){const elapsed=now/1000,flightNow=1000+now,swimmers=[];${source.slice(frameStart, frameEnd)}}`), context);
  const player = { id: 'other', appearance: {}, equipment: {}, hp: 100, ridingRank: 1, x: 0, z: 0, rotation: 0, instanceId: null, jump: { y: 2, grounded: true, velocity: 0 }, travel: { mount: null } };
  context.players = [player];
  return { context, player, trace, mountTrace, labelTrace, sync(time, changes = {}) { context.clock = time; Object.assign(player, changes); context.syncEntities(1000 + time); },
    render(time) { context.clock = time; context.renderRemote(time); return context.remote.get(player.id).mesh; } };
}
const client = clientFixture();
client.sync(0); client.sync(100, { x: 1, rotation: Math.PI / 2, jump: { y: 4, grounded: false, velocity: 2 } });
let mesh = client.render(200);
close(mesh.position.x, .5, 'frame uses buffered horizontal position');
close(mesh.position.y, 3, 'frame uses buffered jump height');
close(mesh.rotation.y, Math.PI / 4, 'frame uses interpolated facing');
assert.equal(client.trace.at(-1)[2], true, 'animation uses sampled movement');
assert.equal(client.context.position.x, 100, 'remote interpolation never changes local movement');
const originalMotion = client.context.remote.get('other').motion;
client.sync(200, { x: 2, equipment: { head: 'new-helmet' }, travel: { mount: 'horse' } });
assert.equal(client.context.remote.get('other').motion, originalMotion, 'cosmetic rebuilding retains motion history');
mesh = client.render(250); close(mesh.position.y, 7, 'mount height is added exactly once after jump interpolation');
client.context.clock = 260; client.context.syncEntities();
client.sync(300, { x: 3 });
close(client.render(425).position.x, 2.75, 'world resync does not inject a synthetic stationary snapshot');
client.sync(400, { seated: { chairId: 'one', x: 5, z: 6, y: 8, rotation: .7 }, travel: { mount: null }, jump: { y: 2, grounded: true, velocity: 0 } });
mesh = client.render(400); close(mesh.position.x, 5, 'sitting resets to chair position'); close(mesh.position.y, 7.2, 'chair height remains authoritative');
close(mesh.rotation.y, .7, 'chair facing remains authoritative'); assert.equal(client.trace.at(-1)[2], false);
client.sync(500, { seated: null, hp: 0, x: 6 });
mesh = client.render(500); close(mesh.position.x, 6, 'death cannot keep interpolating old movement'); assert.equal(client.trace.at(-1)[2], false);
client.sync(600, { hp: 100, zeppelin: { pose: { x: 40, y: 50, z: 60, rotation: 1.2 } } });
mesh = client.render(600); close(mesh.position.x, 40, 'zeppelin pose overrides the motion buffer'); close(mesh.position.y, 50, 'zeppelin height remains exact');
assert.equal(client.context.remote.get('other').motion.sample(600).terrainGrounded, false, 'flight cannot inherit ground support');
close(mesh.rotation.y, 1.2, 'zeppelin facing remains exact'); assert.equal(client.trace.at(-1)[2], false);
client.sync(700, { zeppelin: null, x: 2, z: 3, jump: { y: 2, grounded: true, velocity: 0 } });
close(client.render(700).position.x, 2, 'disembarking resets the flight history');
client.sync(800, { instanceId: 'dungeon:one', x: 4 });
client.context.worldInstance = 'dungeon:one';
close(client.render(800).position.x, 4, 'instance travel snaps immediately');
client.sync(900, { x: 50 }); close(client.render(900).position.x, 50, 'teleports cannot sweep across the world');
client.context.attack = { rotation: 2.2 }; close(client.render(1200).rotation.y, 2.2, 'stationary combat keeps authoritative attack facing');
client.context.players = []; client.context.syncEntities(2300); assert.equal(client.context.remote.size, 0, 'departed players release their motion history');
const fallback = clientFixture(); fallback.player.x = -2; delete fallback.player.jump;
fallback.context.syncEntities();
close(fallback.render(0).position.x, -2, 'a fresh view without a snapshot timestamp is seeded immediately');
close(fallback.render(0).position.y, -.65, 'missing jump state keeps swimming fallback height');
fallback.sync(100, { x: -1 }); fallback.context.clearEntityViews();
assert.equal(fallback.context.remote.size, 0, 'world replacement discards remote timelines');
assert.equal(fallback.context.players.length, 0, 'old-world players cannot reseed discarded timelines');
fallback.context.players = [fallback.player]; fallback.sync(200, { x: 4, instanceId: 'new-instance' });
fallback.context.worldInstance = 'new-instance';
close(fallback.render(200).position.x, 4, 'new-world view starts at its authoritative location');
close(fallback.render(200).position.y, 2, 'missing jump state uses the destination terrain height');

const terrace = [{ x: -300.2, z: -298 }, { x: -299.8, z: -298 }];
assert.equal(groundHeight(terrace[1].x, terrace[1].z) - groundHeight(terrace[0].x, terrace[0].z), 1.5);
for (const [from, to] of [terrace, [...terrace].reverse()]) for (const mounted of [false, true]) {
  const walker = clientFixture();
  Object.assign(walker.context, { groundHeight, waterAt, surfaceHeight: groundHeight, position: from });
  const at = point => ({ ...point, jump: { y: groundHeight(point.x, point.z), grounded: true, velocity: 0 }, travel: { mount: mounted ? 'horse' : null } });
  walker.sync(0, at(from)); walker.sync(100, at(to));
  for (const time of [175, 195, 205, 225, 250, 5000]) {
    const view = walker.render(time);
    close(view.position.y, groundHeight(view.position.x, view.position.z) + (mounted ? 3 : 0), 'grounded terrace movement keeps feet on the sampled tile, with one mount lift');
  }
}
for (const [label, startOffset, endOffset, startGrounded, endGrounded] of [
  ['takeoff', 0, 2, true, false], ['landing', 2, 0, false, true],
  ['roof', 4, 4, true, true], ['step onto a prop', 0, .2, true, true],
]) {
  const elevated = clientFixture(), [from, to] = terrace;
  Object.assign(elevated.context, { groundHeight, waterAt, surfaceHeight: groundHeight, position: from });
  const startY = groundHeight(from.x, from.z) + startOffset, endY = groundHeight(to.x, to.z) + endOffset;
  elevated.sync(0, { ...from, jump: { y: startY, grounded: startGrounded, velocity: 0 } });
  elevated.sync(100, { ...to, jump: { y: endY, grounded: endGrounded, velocity: 0 } });
  close(elevated.render(195).position.y, startY + (endY - startY) * .45, `${label} retains authoritative height interpolation`);
}

const climbing = clientFixture();
climbing.context.attack = { rotation: 2.2 };
climbing.sync(0, { jump: { y: 2, grounded: false, velocity: 0, climb: { rotation: 0 } } });
climbing.sync(100, { jump: { y: 4, grounded: false, velocity: 0, climb: { rotation: 0 } } });
close(climbing.render(200).position.y, 3, 'vertical climbing preserves remote height interpolation');
assert.equal(climbing.trace.at(-1)[2], true, 'vertical climbing animates without horizontal travel');
assert.equal(climbing.trace.at(-1)[3], false, 'climbing suppresses combat poses');
assert.equal(climbing.trace.at(-1)[6].climbing, true, 'remote animation receives the authoritative climbing state');

const culled = clientFixture();
Object.assign(culled.context.position, { x: 0, z: 0 }); culled.context.graphics.renderDistance = 64;
culled.sync(0, { travel: { mount: 'horse' } }); culled.render(0);
const mountMesh = new THREE.Group(); culled.context.mountViews.set('other', { id: 'horse', mesh: mountMesh });
const remoteEntry = culled.context.remote.get('other');
const counts = () => [culled.trace.length, culled.mountTrace.length, culled.labelTrace.length];
const visibleCounts = counts();
culled.sync(100, { x: 200 }); culled.render(100);
assert.deepEqual(counts(), visibleCounts, 'distant actors skip character animation, mount update and label placement');
assert.equal(remoteEntry.mesh.visible, false); assert.equal(remoteEntry.label.hidden, true); assert.equal(mountMesh.visible, false);
culled.sync(200, { x: 201 }); culled.render(200);
assert.deepEqual(counts(), visibleCounts, 'hidden actors remain inexpensive across updates');
culled.context.position.x = 200;
mesh = culled.render(300); close(mesh.position.x, 200.5, 'returning within range resumes the updated timeline');
assert.equal(remoteEntry.mesh.visible, true); assert.equal(remoteEntry.label.hidden, false); assert.equal(mountMesh.visible, true);
assert.equal(culled.trace.at(-1)[2], true, 'returning visible actor resumes moving animation');
assert.equal(culled.mountTrace.length, visibleCounts[1] + 1, 'returning mount resumes its update');
for (const changes of [{ instanceId: 'another-instance' }, { instanceId: null, gm: { invisible: true } }]) {
  const before = counts(); culled.sync(culled.context.clock + 100, changes); culled.render(culled.context.clock);
  assert.deepEqual(counts(), before, 'other-instance and invisible actors skip animation work');
  assert.equal(remoteEntry.mesh.visible, false); assert.equal(remoteEntry.label.hidden, true); assert.equal(mountMesh.visible, false);
}
culled.sync(600, { gm: undefined, x: 1000, zeppelin: { pose: { x: 201, y: 50, z: 0, rotation: 1 } } });
mesh = culled.render(600); assert.equal(mesh.visible, true); close(mesh.position.x, 201, 'nearby airships are visible even when the stored ground position is distant');
const flyingCounts = counts();
culled.sync(700, { x: 201, zeppelin: { pose: { x: 1000, y: 50, z: 0, rotation: 1 } } });
culled.render(700); assert.equal(remoteEntry.mesh.visible, false);
assert.deepEqual(counts(), flyingCounts, 'distant airships are culled using their flight position');

// Constant authoritative velocity isolates observer playback from sender/input
// jitter. Every packet remains ordered, as on the production WebSocket.
function playbackNetwork(fps, cadence, delayFor) {
  const speed = 5.8, packets = [];
  for (let time = 0, index = 0, arrival = -1; time <= 16000; index++) {
    arrival = Math.max(arrival + .01, time + delayFor(time, index));
    packets.push({ time, arrival, x: speed * time / 1000 });
    time += cadence[index % cadence.length];
  }
  const remote = createRemoteMotion(), frames = [];
  let index = 0, previous = 0, authoritative = 0;
  for (let frame = 0; frame <= 19 * fps; frame++) {
    const now = frame * 1000 / fps;
    while (index < packets.length && packets[index].arrival <= now) {
      const packet = packets[index++]; authoritative = packet.x;
      remote.push(pose(packet.x), packet.time, packet.arrival);
    }
    const value = remote.sample(now), velocity = (value.x - previous) * fps;
    assert(value.x >= previous - 1e-8, 'latency changes never rewind an authoritative forward path');
    assert(value.x <= authoritative + 1e-8, 'playback never extrapolates beyond a received pose');
    assert(velocity <= speed * 1.1 + 1e-7, 'catch-up never turns a received packet into an unbounded position jump');
    frames.push({ now, x: value.x, velocity, moving: value.moving }); previous = value.x;
  }
  close(frames.at(-1).x, packets.at(-1).x, 'stalled playback ends at the final authoritative position');
  assert.equal(frames.at(-1).moving, false, 'stalled playback cannot keep running');
  const stats = (start, end) => {
    const window = frames.filter(frame => frame.now >= start && frame.now < end);
    return { freeze: window.filter(frame => frame.velocity < 1e-6).length / window.length,
      peak: Math.max(...window.map(frame => frame.velocity)),
      mean: window.reduce((sum, frame) => sum + frame.velocity, 0) / window.length };
  };
  return { frames, stats };
}
for (const fps of [30, 60, 120]) {
  const step = playbackNetwork(fps, [100], time => time >= 2000 && time < 8000 ? 220 : 20);
  for (const [start, end] of [[800, 1800], [5500, 7800], [13000, 15000]]) {
    const steady = step.stats(start, end);
    assert.equal(steady.freeze, 0, 'steady delivery recovers from a lasting latency step and its reversal');
    close(steady.mean, 5.8, 'healthy, delayed and recovered phases preserve walking speed');
  }
  for (const time of [1000, 14500]) {
    const frame = step.frames.find(frame => frame.now === time);
    close(frame.x, (time - 20 - 150) * 5.8 / 1000, 'healthy and recovered delivery use the original 150ms buffer');
  }
  for (const [label, cadence, delays] of [
    ['burst jitter', [100], [20, 30, 20, 220, 20, 30, 20, 20]],
    ['mixed server gaps', [100, 150, 250, 200, 100], [20]],
    ['250ms server cadence', [250], [20]],
  ]) {
    const network = playbackNetwork(fps, cadence, (_time, index) => delays[index % delays.length]);
    const steady = network.stats(6000, 15000);
    assert.equal(steady.freeze, 0, `${label}: buffering prevents repeated freezes after warmup`);
    close(steady.mean, 5.8, `${label}: buffering preserves average walking speed`);
    assert(steady.peak <= 5.8 * 1.1 + 1e-7, `${label}: recovery remains bounded`);
    console.log(JSON.stringify({ fps, scenario: label, ...steady }));
  }
  console.log(JSON.stringify({ fps, scenario: '20ms -> 220ms -> 20ms', delayed: step.stats(5500, 7800), recovered: step.stats(13000, 15000) }));
}

// Same two-hop synthetic network as the lag investigation: sender updates,
// 100 ms server snapshots, then observer delivery; these are not player captures.
function simulate(fps, jitter, improved) {
  const speed = 5.8, seconds = 12, sent = [], received = [], velocities = [];
  let lastSend = 0, lastArrival = -1, source = 0, sourceX = 0;
  for (let frame = 1; frame <= seconds * fps; frame++) {
    const time = frame * 1000 / fps;
    const step = improved ? cadence(time, lastSend, true) : { count: time - lastSend > 100 ? 1 : 0, lastMove: time };
    if (step.count) {
      const delay = jitter ? [20, 30, 75, 20, 25][sent.length % 5] : 20;
      const arrival = Math.max(lastArrival + .01, time + delay);
      sent.push({ time: arrival, x: speed * time / 1000 });
      lastArrival = arrival; lastSend = step.lastMove;
    }
  }
  lastArrival = -1;
  for (let tick = 1; tick <= seconds * 10; tick++) {
    const time = tick * 100;
    while (source < sent.length && sent[source].time <= time) sourceX = sent[source++].x;
    const arrival = Math.max(lastArrival + .01, time + (jitter ? [20, 35, 15, 65, 20, 100, 20][tick % 7] : 20));
    received.push({ time, arrival, x: sourceX }); lastArrival = arrival;
  }
  const remote = createRemoteMotion(); let target = 0, index = 0, x = 0;
  for (let frame = 1; frame <= seconds * fps; frame++) {
    const time = frame * 1000 / fps;
    while (index < received.length && received[index].arrival <= time) {
      const next = received[index++]; target = next.x;
      remote.push(pose(target), next.time, next.arrival);
    }
    const previous = x;
    x = improved ? remote.sample(time).x : x + (target - x) * Math.min(1, 12 / fps);
    if (time > 2000) velocities.push((x - previous) * fps);
  }
  const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const variation = Math.sqrt(velocities.reduce((sum, value) => sum + (value - mean) ** 2, 0) / velocities.length) / mean;
  return { min: Math.min(...velocities), max: Math.max(...velocities), mean, variation };
}
for (const fps of [30, 60, 120]) for (const jitter of [false, true]) {
  const before = simulate(fps, jitter, false), after = simulate(fps, jitter, true);
  assert(Math.abs(after.mean - 5.8) < .08, 'buffering preserves average walking speed');
  assert(after.min >= -1e-7, 'a steady walker never moves backwards');
  assert(after.variation < before.variation * .65, `${fps} FPS jitter=${jitter}: speed variation must materially improve`);
  if (!jitter && fps >= 60) assert(after.variation < .001, 'steady network and cadence render constant speed');
  console.log(JSON.stringify({ fps, jitter, before, after }));
}
console.log('PASS remote movement: real client bindings, monotonic bounded latency recovery, burst/slow-cadence buffering, continuous boundary animation, authoritative transitions, culling and upstream jitter model.');
