import { getMusicScore, MUSIC_VARIATIONS } from '../src/music.ts';
import { SPELLS, abilityValid } from '../src/spells.ts';
import { playSpellSound } from '../src/spell-audio.ts';
import { isArenaInstance } from '../src/arena.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/audio.ts', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '').replace('export function', 'function');
function fixture(saved = null, { blockedStorage = false, blockedResume = false, unsupported = false, delayedSuspend = false, pendingResume = false } = {}) {
  const contexts = [], intervals = new Map(), windowEvents = new EventTarget(), document = new EventTarget();
  document.hidden = false;
  const storage = new Map(saved === null ? [] : [['mossvale-audio', saved]]), suspensions = [];
  class Param {
    value = 0;
    setValueAtTime(value, time) { assert(Number.isFinite(value) && Number.isFinite(time)); this.value = value; }
    exponentialRampToValueAtTime(value, time) { assert(value > 0); this.setValueAtTime(value, time); }
    linearRampToValueAtTime(value, time) { this.setValueAtTime(value, time); }
    setTargetAtTime(value, time) { this.setValueAtTime(value, time); }
  }
  class Node {
    disconnected = false;
    connect(target) { assert(target); return target; }
    disconnect() { this.disconnected = true; }
  }
  class Source extends Node {
    frequency = new Param();
    start(time) { this.startTime = time; }
    stop(time) { this.stopTime = time; }
    finish() { this.onended?.(new Event('ended')); }
  }
  class Oscillator extends Source {}
  class Context {
    state = 'suspended'; currentTime = 0; sampleRate = 48000; destination = new Node(); sources = []; gains = []; resumeCalls = 0; closeCalls = 0;
    constructor() { contexts.push(this); }
    createGain() { const node = new Node(); node.gain = new Param(); this.gains.push(node); return node; }
    createOscillator() { const node = new Oscillator(); this.sources.push(node); return node; }
    createBufferSource() { const node = new Source(); this.sources.push(node); return node; }
    createBiquadFilter() { const node = new Node(); node.frequency = new Param(); return node; }
    createBuffer(_, length) { return { getChannelData: () => new Float32Array(length) }; }
    resume() { this.resumeCalls++; if (pendingResume && this.resumeCalls === 1) return new Promise(() => {}); if (blockedResume) return Promise.reject(new Error('Autoplay denied')); this.state = 'running'; return Promise.resolve(); }
    suspend() {
      if (delayedSuspend) return new Promise(resolve => suspensions.push(() => { if (this.state !== 'closed') this.state = 'suspended'; resolve(); }));
      this.state = 'suspended'; return Promise.resolve();
    }
    close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
  }
  let nextTimer = 0;
  const window = Object.assign(windowEvents, {
    AudioContext: unsupported ? undefined : Context,
    setInterval(fn) { const id = nextTimer++; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
  });
  const runtime = { getMusicScore, MUSIC_VARIATIONS, SPELLS, abilityValid, playSpellSound,
    window, document, OscillatorNode: Oscillator, Event, localStorage: {
    getItem(key) { if (blockedStorage) throw new Error('Denied'); return storage.get(key) ?? null; },
    setItem(key, value) { if (blockedStorage) throw new Error('Denied'); storage.set(key, value); },
  } };
  runInNewContext(source, runtime);
  const audio = runtime.createGameAudio();
  return { audio, contexts, intervals, storage,
    tick(time) { contexts[0].currentTime = time; for (const fn of intervals.values()) fn(); },
    finish() { for (const node of contexts[0].sources) node.finish(); },
    hide(hidden) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
    page(type) { window.dispatchEvent(new Event(type)); },
    finishSuspending() { for (const finish of suspensions.splice(0)) finish(); },
  };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const f = fixture();
assert.equal(f.audio.volume('music'), .25);
assert.equal(f.audio.volume('effects'), .6);
f.audio.play('bow');
f.hide(true); f.hide(false);
assert.equal(f.contexts.length, 0, 'creation, effects and visibility do not bypass the first gesture');
f.audio.unlock(); f.audio.unlock(); await flush();
const context = f.contexts[0];
assert.equal(f.contexts.length, 1, 'repeated gestures share one context');
assert.equal(f.intervals.size, 1, 'repeated unlocks share one music scheduler, including timer ID zero');
assert(context.sources.length >= 3, 'music starts with lead, arpeggio and bass');
for (const effect of ['bow', 'melee', 'magic', 'heal', 'hit', 'hurt', 'gather', 'reward', 'level-up', 'jump', 'death', 'click']) {
  f.finish(); context.currentTime += 1;
  const before = context.sources.length;
  f.audio.play(effect);
  assert(context.sources.length > before, `${effect} creates an audible source`);
  f.audio.play(effect);
  const once = context.sources.length;
  f.audio.play(effect);
  assert.equal(context.sources.length, once, `${effect} suppresses same-frame duplicates`);
}
f.finish();
const beforeStorm = context.sources.length;
for (let i = 0; i < 100; i++) { context.currentTime += .05; f.audio.play('level-up'); }
assert.equal(context.sources.length - beforeStorm, 32, 'sound storms cannot exceed 32 effect voices');
f.audio.setVolume('effects', 0);
const beforeMute = context.sources.length;
f.audio.play('bow');
assert.equal(context.sources.length, beforeMute, 'muted effects create no sources');
assert(context.sources.every(node => node.disconnected), 'muting and finished effects release their nodes');
f.audio.setVolume('music', 0); f.tick(context.currentTime + 1);
assert.equal(context.sources.length, beforeMute, 'muted music creates no sources');
assert.deepEqual(JSON.parse(f.storage.get('mossvale-audio')), { music: 0, effects: 0 });
f.audio.setVolume('music', .3); f.tick(context.currentTime + 1);
assert(context.sources.length > beforeMute, 'unmuting restores the loop');
f.hide(true);
assert.equal(f.intervals.size, 0);
assert.equal(context.state, 'suspended');
assert(context.sources.every(node => node.disconnected), 'backgrounding releases scheduled notes');
f.hide(false); await flush();
assert.equal(context.state, 'running'); assert.equal(f.intervals.size, 1);
f.page('pagehide');
assert.equal(context.state, 'suspended'); assert.equal(f.intervals.size, 0);
f.page('pageshow'); await flush();
assert.equal(context.state, 'running'); assert.equal(f.intervals.size, 1, 'back-forward cache restoration resumes audio');
f.audio.dispose(); f.audio.dispose();
f.hide(true); f.hide(false); f.page('pageshow'); f.audio.unlock(); await flush();
assert.equal(context.state, 'closed'); assert.equal(context.closeCalls, 1); assert.equal(f.intervals.size, 0);
assert(context.gains.every(node => node.disconnected), 'disposal disconnects all buses and envelopes');

for (const saved of ['bad json', '{}', '{"music":"1","effects":null}', '{"music":1e400,"effects":false}']) {
  const item = fixture(saved);
  assert.equal(item.audio.volume('music'), .25); assert.equal(item.audio.volume('effects'), .6); item.audio.dispose();
}
const persisted = fixture('{"music":0,"effects":2}');
assert.equal(persisted.audio.volume('music'), 0); assert.equal(persisted.audio.volume('effects'), 1);
persisted.audio.setVolume('music', NaN); assert.equal(persisted.audio.volume('music'), 0);
persisted.audio.setVolume('effects', -.5); assert.equal(persisted.audio.volume('effects'), 0); persisted.audio.dispose();
for (const options of [{ blockedStorage: true }, { blockedResume: true }, { unsupported: true }]) {
  const item = fixture(null, options); item.audio.setVolume('music', .1); item.audio.unlock(); await flush(); item.audio.dispose();
}
const interrupted = fixture(null, { pendingResume: true });
interrupted.audio.unlock(); await flush();
assert.equal(interrupted.contexts[0].state, 'suspended');
interrupted.audio.unlock(); await flush();
assert.equal(interrupted.contexts[0].state, 'running', 'a later gesture retries a WebKit resume that never settled');
assert.equal(interrupted.intervals.size, 1); interrupted.audio.dispose();

const race = fixture(); race.audio.unlock(); race.hide(true); await flush();
assert.equal(race.contexts[0].state, 'suspended'); assert.equal(race.intervals.size, 0, 'a pending resume cannot restart hidden-tab audio'); race.audio.dispose();
const rapid = fixture(null, { delayedSuspend: true }); rapid.audio.unlock(); await flush();
rapid.hide(true); rapid.hide(false); rapid.finishSuspending(); await flush();
assert.equal(rapid.contexts[0].state, 'running'); assert.equal(rapid.intervals.size, 1, 'rapid hide/show recovers after the asynchronous suspend completes'); rapid.audio.dispose(); rapid.finishSuspending();
console.log('PASS: all 12 synthesized effects, original music loop, gesture-only start, one scheduler, saved volumes, muting, bounded voices, hidden/page lifecycle, disposal and denied audio/storage.');

// Exercise the actual audio engine with every spell, delayed impacts, scene changes.
const expanded = fixture(); expanded.audio.unlock(); await flush();
const expandedContext = expanded.contexts[0];
expanded.audio.setVolume('music', 0);
for (const ability of Object.keys(SPELLS)) for (const stage of ['cast', 'release', 'impact']) {
  expanded.finish(); expandedContext.currentTime += 1;
  const before = expandedContext.sources.length;
  expanded.audio.spell(ability, stage, .8, .6);
  const sources = expandedContext.sources.slice(before);
  assert(sources.length > 0 && sources.length <= 12, `${ability}/${stage} renders a bounded recipe`);
  assert(sources.every(node => node.startTime >= expandedContext.currentTime + .6), 'impact waits for the projectile');
  expanded.audio.spell(ability, stage);
  assert.equal(expandedContext.sources.length, before + sources.length, 'same-frame spell events are coalesced');
}
expanded.audio.reset();
assert(expandedContext.sources.every(node => node.disconnected), 'changing worlds cancels pending impacts');
const invalidBefore = expandedContext.sources.length;
for (const args of [['missing','cast'], ['fireball','impact',NaN], ['fireball','impact',1,-1], ['fireball','impact',1,Infinity]]) expanded.audio.spell(...args);
assert.equal(expandedContext.sources.length, invalidBefore);
expanded.audio.setVolume('effects',0); expanded.audio.spell('fireball','release');
assert.equal(expandedContext.sources.length, invalidBefore, 'spell sounds honor the effects mute');
expanded.audio.dispose();

const adaptive = fixture(); adaptive.audio.unlock(); await flush();
const adaptiveContext = adaptive.contexts[0];
const advance = seconds => { const end = adaptiveContext.currentTime + seconds; while (adaptiveContext.currentTime < end) { adaptive.finish(); adaptive.tick(adaptiveContext.currentTime + .06); } };
let before = adaptiveContext.sources.length;
adaptive.audio.setScene('frostmarch', true); advance(1);
assert(adaptiveContext.sources.slice(before).some(node => node.loop), 'combat introduces percussion within a beat');
adaptive.audio.setScene('frostmarch', false); advance(1);
before = adaptiveContext.sources.length; advance(1);
assert(!adaptiveContext.sources.slice(before).some(node => node.loop), 'exploration removes combat percussion');
const startingPitches = adaptiveContext.sources.slice(before).filter(node => node.type === 'sine').map(node => node.frequency.value);
adaptive.audio.setScene('dungeon', false); advance(1);
before = adaptiveContext.sources.length; advance(1);
assert(adaptiveContext.sources.slice(before).some(node => node.type === 'triangle'));
assert(startingPitches.length > 0, 'Frostmarch uses its own lead timbre');
// Run full compositions through several rotations; no bad bar lookup or extra scheduler can hide here.
for (const zone of ['greenwood','amberwild','frostmarch','hollow','sunveil','mistwood','dungeon']) {
  adaptive.audio.setScene(zone,true); advance(95);
}
assert.equal(adaptive.intervals.size,1);
adaptive.audio.dispose();

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const sceneCalls = [];
const state = { connected:true, worldReady:true, rosterActive:false, entryActive:false,
  player:{ hp:100, zone:'sunveil', appearance:{className:'Mage'} }, playerId:'self', worldInstance:null,
  enemies:[], audioCombatUntil:0, usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),
  gameAudio:{setScene:(...args)=>sceneCalls.push(args)} };
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function updateAudioScene('),main.indexOf('function clearCombat()'))),state);
state.updateAudioScene(1000); assert.deepEqual(sceneCalls.at(-1),['sunveil',false]);
state.enemies=[{alive:true,targetId:'someone-else'}]; state.updateAudioScene(1000);
assert.deepEqual(sceneCalls.at(-1),['sunveil',false], 'nearby unrelated fights do not change your music');
state.enemies=[{alive:true,targetId:'self'}]; state.updateAudioScene(1000);
assert.deepEqual(sceneCalls.at(-1),['sunveil',true], 'authoritative monster aggro starts combat');
state.enemies=[]; state.updateAudioScene(6000); assert.deepEqual(sceneCalls.at(-1),['sunveil',true]);
state.updateAudioScene(7100); assert.deepEqual(sceneCalls.at(-1),['sunveil',false], 'combat ends after six seconds without a threat');
state.worldInstance='private-dungeon'; state.updateAudioScene(7200); assert.deepEqual(sceneCalls.at(-1),['dungeon',false]);
state.worldInstance='arena-private'; state.updateAudioScene(7250); assert.deepEqual(sceneCalls.at(-1),['sunveil',false], 'private arenas retain region music');
state.player.hp=0; state.updateAudioScene(7300); assert.equal(sceneCalls.at(-1)[1],false);
state.player=undefined;state.rosterActive=true;state.updateAudioScene(7400);assert.deepEqual(sceneCalls.at(-1),['greenwood',false]);
console.log('PASS: 124 spell recipes through the engine, timed impacts, reset/mute, adaptive biome/combat playback and authoritative threat routing.');

// Execute gameplay's real event route, keeping scheduling tied to the authoritative combat timeline.
const { combatTiming: routeTiming } = await import('../src/combat-timing.ts');
const routedSounds = [], routedScenes = [], routedEffects = [];
const routing = {
  worldDungeonKind:null, SPELLS, combatTiming: routeTiming,
  performance: { now: () => 10000 }, Date: { now: () => 1000000 }, serverOffset: 50,
  playerId: 'self', player: { id: 'self' }, players: [{ id: 'other' }],
  position: { x: 0, z: 0 }, rotation: 0, audioCombatUntil: 0,
  combatAnimations: new Map(), combatEffects: { play: (...args) => routedEffects.push(args) },
  updateAudioScene: now => routedScenes.push(now),
  gameAudio: {
    spell: (...args) => routedSounds.push(args), play: (...args) => routedSounds.push(args),
  },
};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function playCombat('), main.indexOf('function combatPose('))), routing);
function routeEvent(ability, { caster = 'self', from = 0, target = 10, targetId = 'enemy', age = 0 } = {}) {
  routedSounds.length = routedScenes.length = routedEffects.length = 0; routing.audioCombatUntil = 0;
  const event = { ability, playerId: caster, from: { x: from, z: 0 }, targets: [{ id: targetId, x: target, z: 0 }],
    startedAt: 1000050 - age, rotation: 0, castTimeMs: SPELLS[ability].castTimeMs };
  routing.playCombat(event);
  assert.equal(routedEffects.length, 1, 'audio routing preserves visible effects');
  assert.equal(routing.combatAnimations.get(caster).started, 10000 - age, 'animation and audio share event age');
  return routedSounds.filter(([, , volume]) => volume > 0);
}
for (const [ability, distance] of [['fireball', 10], ['meteor', 18], ['nova', 6], ['heal', 0]]) {
  const tones = routeEvent(ability, { target: distance }), timing = routeTiming(ability, distance);
  assert.deepEqual(tones, [[ability, 'release', 1, timing.delay], [ability, 'impact', .8, timing.delay + timing.flight]], `${ability}: local cues match shared launch and impact timing`);
  assert.equal(routing.audioCombatUntil, SPELLS[ability].effect === 'damage' ? 16000 : 0);
  assert.equal(routedScenes.length, SPELLS[ability].effect === 'damage' ? 1 : 0, 'healing does not enter combat');
}
const nearby = routeEvent('frostbolt', { caster: 'other', from: 12, target: 6 });
const nearbyTiming = routeTiming('frostbolt', 6);
assert.deepEqual(nearby, [['frostbolt', 'release', .225, nearbyTiming.delay], ['frostbolt', 'impact', .45 * .75 * .8, nearbyTiming.delay + nearbyTiming.flight]], 'nearby remote audio attenuates at each endpoint');
assert.equal(routing.audioCombatUntil, 0, 'unrelated nearby spells do not enter combat');
const incoming = routeEvent('starfire', { caster: 'other', from: 27, target: 0, targetId: 'self' });
const incomingTiming = routeTiming('starfire', 27);
assert.deepEqual(incoming, [['starfire', 'impact', .8, incomingTiming.delay + incomingTiming.flight]], 'a caster outside earshot still lands an audible impact on the listener');
assert.equal(routing.audioCombatUntil, 16000); assert.equal(routedScenes.length, 1, 'incoming hostile damage enters combat');
assert.deepEqual(routeEvent('starfire', { caster: 'other', from: 40, target: 55 }), [], 'distant unrelated combat is silent');
assert.equal(routing.audioCombatUntil, 0);
assert.deepEqual(routeEvent('heal', { caster: 'other', from: 12, target: 0, targetId: 'self' }).map(([, stage]) => stage), ['release', 'impact']);
assert.equal(routing.audioCombatUntil, 0, 'incoming friendly healing does not enter combat');
const late = routeEvent('starfire', { target: 27, age: 500 });
assert.deepEqual(late, [['starfire', 'impact', .8, incomingTiming.delay + incomingTiming.flight - .5]], 'late events skip a stale launch while preserving a future impact');
assert.deepEqual(routeEvent('starfire', { target: 27, age: 2000 }), [], 'fully expired combat events do not replay sounds');

// The snapshot, rather than attack acceptance, starts the local windup sound exactly once.
const castLine = main.split('\n').find(line => line.includes("gameAudio.spell(player.casting.ability,'cast'"));
assert(castLine, 'authoritative snapshots route local casting audio');
runInNewContext(stripTypeScriptTypes(`function routeCast(player, oldCast) { ${castLine} }`), routing);
for (const [casting, oldCast, expected] of [
  [{ ability: 'fireball', startedAt: 500 }, 400, [['fireball', 'cast', .65]]],
  [{ ability: 'fireball', startedAt: 500 }, 500, []],
  [{ ability: 'mount', startedAt: 500 }, 400, []],
  [null, 400, []],
]) {
  routedSounds.length = 0; routing.routeCast({ casting }, oldCast);
  assert.deepEqual(routedSounds, expected, 'only a new spell cast starts a windup cue');
}
console.log('PASS: actual gameplay routes local casts, attenuated local/remote release and impact timing, distant incoming hits, quiet unrelated fights, stale events and damage-only combat transitions.');
