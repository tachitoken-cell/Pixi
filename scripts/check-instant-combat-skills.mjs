import assert from 'node:assert/strict';
import { createInstantCombatSkills, IC_SKILL_TUNING } from '../src/instant-combat-boss-skills.mjs';
import { INSTANT_COMBAT_SKILLS } from '../src/instant-combat-skills.ts';
import { INSTANT_COMBAT_CREATURES } from '../src/instant-combat.ts';

function fixture(model, id, count = 6) {
  const mapId = Object.entries(INSTANT_COMBAT_CREATURES).find(([, map]) => map.bosses.some(b => b.model === model))[0];
  const members = Array.from({ length: count }, (_, i) => ({ instanceId: 'test', player: { id: `p${i}`, name: `Player ${i}`, hp: 10000, maxHp: 10000, x: 0, z: 5, rotation: 0, inventory: { private: true } } }));
  const run = { id: 'test', mapId, round: 5, abilityIndex: INSTANT_COMBAT_SKILLS[model].findIndex(s => s.id === id), bossPhase: 'combat',
    boss: { id: 'boss', model, hp: 100000, maxHp: 100000, x: 0, z: 0, alive: true }, hazards: [], runes: [] };
  const hits = [], enemies = [run.boss], events = [], moves = [], cancelled = [];
  const ctx = { enemies, living: () => members.filter(s => s.player.hp > 0 && s.instanceId === run.id),
    target: () => members.find(s => s.player.id === run.taunt && s.player.hp > 0) || members.find(s => s.player.hp > 0),
    damage(s, amount, at) { hits.push({ id: s.player.id, amount, at }); s.player.hp = Math.max(0, s.player.hp - amount); },
    kill(s, at) { hits.push({ id: s.player.id, amount: s.player.hp, at, kill: true }); s.player.hp = 0; },
    interrupt() {}, displace(s, p, at) { Object.assign(s.player, p); moves.push(at); }, dirty() {}, cancelEnemy(actor) { cancelled.push(actor.id); },
    event(s, text) { events.push(text); }, tell(run, text) { run.objective = text; },
    spawn(run, creature, p) { const actor = { ...creature, ...p, id: `objective-${enemies.length}`, instanceId: run.id, hp: 1, maxHp: 1, alive: true }; enemies.push(actor); return actor; } };
  const api = createInstantCombatSkills(ctx), now = 10000;
  const cast = () => api.cast(run, now);
  const advance = ms => api.resolve(run, now + ms);
  const where = (index, x, z) => Object.assign(members[index].player, { x, z });
  return { api, run, members, hits, enemies, events, moves, cancelled, now, cast, advance, where };
}

// Exercise every authored skill through all scheduled jobs; no demonstrations or
// private player fields may enter public floor markers.
let count = 0;
for (const [model, skills] of Object.entries(INSTANT_COMBAT_SKILLS)) for (const skill of skills) {
  const f = fixture(model, skill.id); f.cast(); count++;
  assert.equal(f.run.boss.attack.name, skill.name);
  for (const item of [...f.run.hazards, ...f.run.runes]) {
    assert(Number.isFinite(item.x) && Number.isFinite(item.z)); assert(!('inventory' in item)); assert(!('hp' in item));
  }
  assert(f.api.impacts(f.run, f.now + 60000).every(Number.isFinite));
  f.advance(60000); f.api.clear(f.run);
  assert.equal(f.run.skillRuntime, undefined); assert.equal(f.run.hazards.length, 0); assert.equal(f.run.runes.length, 0);
}
assert.equal(count, 24);
{
  const f = fixture('ossuary-tyrant', 'verdict'); f.where(1, 0, -5); f.cast(); f.advance(1932); assert.equal(f.hits.length, 0);
  f.advance(1933); assert.equal(f.members[0].player.hp, 1500); assert.equal(f.members[1].player.hp, 10000);
  assert.match(f.api.actionError(f.run, f.members[0], 'move', f.now + 1934), /stunned/);
}
{
  const f = fixture('ossuary-tyrant', 'bone-cage'); f.cast(); f.advance(1333);
  const cages = f.enemies.filter(e => e.skillObjective); assert.equal(cages.length, 2); assert.equal(cages[0].maxHp, 2000);
  assert.match(f.api.actionError(f.run, f.members[0], 'attack', f.now + 1400), /trapped/);
  cages[0].hp = 0; cages[0].alive = false; f.advance(1500); assert.equal(f.api.actionError(f.run, f.members[0], 'move', f.now + 1500), null);
  f.advance(9333); assert.equal(f.members[0].player.hp, 10000); assert.equal(f.members[1].player.hp, 0);
}
{
  const f = fixture('ossuary-tyrant', 'grave-toll'); f.cast(); const r = f.run.runes[0]; f.members.forEach(s => Object.assign(s.player, { x: r.x, z: r.z })); f.advance(4670);
  assert.equal(f.members[0].player.hp, 7000, 'three 60%-total tolls split across six allies');
}
{
  const f = fixture('marrow-colossus', 'earthsplitter'); f.cast(); f.advance(1400); assert.equal(f.members[0].player.hp, 4000);
  f.where(0, 30, 30); f.advance(2400); assert.equal(f.members[0].player.hp, 3500, 'bleed follows the struck player away from the lane');
}
{
  const f = fixture('marrow-colossus', 'marrow-quake'); f.where(0, 0, 5); f.where(1, 0, 12); f.cast(); f.advance(2067);
  assert.equal(f.members[0].player.hp, 10000); assert.equal(f.members[1].player.hp, 3000);
}
{
  const f = fixture('marrow-colossus', 'crushing-grip'); f.cast(); f.advance(1000); assert.equal(f.enemies[1].maxHp, 5000); f.advance(5000); assert.equal(f.members[0].player.hp, 0);
}
{
  const f = fixture('grave-cantor', 'silent-requiem'); f.cast(); f.advance(999); f.api.recordAction(f.run, f.members[0], 'move', f.now + 999); assert.equal(f.hits.length, 0);
  f.advance(1000); f.api.recordAction(f.run, f.members[0], 'move', f.now + 1100); f.api.recordAction(f.run, f.members[0], 'attack', f.now + 1200);
  assert.equal(f.members[0].player.hp, 5000); assert.equal(f.members[1].player.hp, 10000); assert.match(f.api.actionError(f.run, f.members[0], 'cast', f.now + 1500), /silenced/);
}
{
  const f = fixture('grave-cantor', 'dirge-marks'); f.cast(); f.where(0, -20, 0); f.where(1, 0, 20); f.where(2, 20, 0); f.advance(2800);
  assert.deepEqual(f.members.slice(0, 3).map(s => s.player.hp), [4000, 4000, 4000], 'marks follow actual players and separate explosions do not overlap');
}
{
  const f = fixture('grave-cantor', 'last-rites'); f.cast(); f.run.runes.forEach((r, i) => f.where(i, r.x, r.z)); f.advance(6000); assert.equal(f.hits.length, 0); assert.match(f.run.objective, /interrupted/);
  const failed = fixture('grave-cantor', 'last-rites'); failed.cast(); failed.advance(6000); assert.equal(failed.members[0].player.hp, 1000);
}
{
  const f = fixture('carrion-queen', 'acid-rain'); f.cast(); f.advance(933); f.where(1, 30, 30); f.advance(1933); assert.equal(f.members[0].player.hp, 8000); assert.equal(f.members[1].player.hp, 10000);
}
{
  const f = fixture('carrion-queen', 'brood-bomb'); f.cast(); const r = f.run.runes[0]; f.members.forEach(s => Object.assign(s.player, { x: r.x, z: r.z })); f.advance(2667);
  assert.equal(f.enemies.length, 1); assert.equal(f.members[0].player.hp, 8500);
  const failed = fixture('carrion-queen', 'brood-bomb'); failed.where(0, 20, 0); failed.cast(); const mark = failed.run.runes[0]; failed.where(0, mark.x, mark.z); failed.advance(2667); assert.equal(failed.enemies.length, 5);
}
{
  const f = fixture('carrion-queen', 'venom-stacks'); f.cast(); f.advance(4000); assert.equal(f.run.skillRuntime.venom.get('p0'), 4); assert.equal(f.members[0].player.hp, 10000);
  f.run.abilityIndex = 2; f.run.taunt = 'p1'; f.api.cast(f.run, f.now + 5000); f.advance(9000); assert.equal(f.members[0].player.hp, 10000); assert.equal(f.members[1].player.hp, 10000);
  f.run.abilityIndex = 2; f.api.cast(f.run, f.now + 10000); f.advance(10600); assert.equal(f.members[1].player.hp, 0, 'fifth stack kills the tank');
}
{
  const f = fixture('rift-sovereign', 'void-collapse'); f.where(1, 30, 0); f.cast(); f.advance(3333); assert(f.moves.length > 0); assert.equal(f.members[0].player.hp, 1000); assert.equal(f.members[1].player.hp, 10000);
}
{
  const f = fixture('rift-sovereign', 'polarity-decree'); f.members.forEach((_, i) => f.where(i, i % 2 ? -10 : 10, 5)); f.cast(); f.advance(3000); assert.equal(f.hits.length, 0);
  const failed = fixture('rift-sovereign', 'polarity-decree'); failed.where(0, -10, 5); failed.cast(); failed.advance(3000); assert.equal(failed.members[0].player.hp, 2000);
}
{
  const f = fixture('rift-sovereign', 'rift-lances'); f.where(3, 10, 0); f.cast(); f.advance(1333); assert.equal(f.members[0].player.hp, 3500); assert.equal(f.members[3].player.hp, 10000);
}
{
  const f = fixture('nullweaver', 'null-tether', 3); f.cast(); f.where(1, 10, 5); f.advance(800); assert.deepEqual(f.members.map(s => s.player.hp), [3000, 3000, 10000]);
  f.advance(10000); assert.equal(f.hits.length, 2, 'one snap per pair; odd unpaired participant is not penalized');
}
{
  const f = fixture('nullweaver', 'cocoon'); f.run.boss.hp = 50000; f.cast(); f.advance(1067); assert.equal(f.enemies[1].maxHp, 100000 * IC_SKILL_TUNING.cocoonHp); f.advance(9067); assert.equal(f.members[0].player.hp, 0); assert.equal(f.run.boss.hp, 55000);
}
{
  const f = fixture('nullweaver', 'web-snare'); f.where(0, -2, -2); f.where(1, 2, -2); f.cast(); f.advance(2800); assert.equal(f.members[0].player.hp, 6000); assert.equal(f.members[1].player.hp, 10000); assert.match(f.api.actionError(f.run, f.members[0], 'move', f.now + 2801), /rooted/);
  f.api.clearMovementImpairments(f.run, f.members[0]);assert.equal(f.api.actionError(f.run,f.members[0],'move',f.now+2801),null,'authored Blink/Lightspeed cleanse normal roots');
}
for(const gone of ['death','leave']){
 const f=fixture('nullweaver','cocoon');f.cast();f.advance(1067);const actor=f.enemies[1],victim=f.members[0];
 f.api.clearMovementImpairments(f.run,victim);assert.match(f.api.actionError(f.run,victim,'move',f.now+1100),/rooted/,'movement cleanses cannot free a rescue objective');
 if(gone==='death')victim.player.hp=0;else victim.instanceId='world';f.advance(1167);
 assert.equal(actor.alive,false,`${gone} retires the orphan rescue actor`);assert.equal(actor.hp,0);assert(f.cancelled.includes(actor.id));
 assert(!f.run.runes.some(r=>r.playerId===victim.player.id));assert.equal(f.run.skillRuntime.controls.get(victim.player.id).trapId,undefined);
}
{
  const f = fixture('umbral-behemoth', 'stampede'); f.where(1, 10, 5); f.cast(); f.advance(1000); assert.equal(f.members[0].player.hp, 1000); assert.equal(f.members[1].player.hp, 10000); assert(f.moves.length > 0);
}
{
  const f = fixture('umbral-behemoth', 'tail-sweep'); f.where(1, 0, -5); f.cast(); f.advance(1667); assert.equal(f.members[0].player.hp, 10000); assert.equal(f.members[1].player.hp, 2500);
}
{
  const f = fixture('umbral-behemoth', 'devour'); f.cast(); f.advance(1200); f.run.taunt = 'p1'; f.advance(3467); assert.equal(f.hits.length, 0);
  const failed = fixture('umbral-behemoth', 'devour'); failed.cast(); failed.advance(3467); assert.equal(failed.members[0].player.hp, 0);
}
{
  const f = fixture('eclipse-oracle', 'total-eclipse'); f.cast(); f.run.runes.forEach((r, i) => f.where(i, r.x, r.z)); f.advance(3333);
  assert.equal(f.members[0].player.hp, 10000); assert.equal(f.members[3].player.hp, 2000); assert(f.api.publicState(f.run, f.members[3]).blindUntil > f.now + 3333);
}
{
  const f = fixture('eclipse-oracle', 'prophecy'); f.members.forEach((_, i) => f.where(i, -10, 10)); f.cast(); f.advance(2000); assert.equal(f.hits.length, 0);
  f.members.forEach((_, i) => f.where(i, 10, 10)); f.advance(5000); assert.equal(f.hits.length, 0, 'a cleared quadrant is safe for later blasts');
}
{
  const f = fixture('eclipse-oracle', 'sweeping-gaze'); f.cast(); f.advance(1333); assert.equal(f.members[0].player.hp, 5000);
  const rotations = f.run.hazards.map(h => h.rotation); f.advance(1833); assert.notDeepEqual(f.run.hazards.map(h => h.rotation), rotations, 'server beam geometry rotates with its visible tell');
}
console.log('PASS 24 v12 skills: authored deadlines, safe zones, rescue HP/timers, tank swaps, control expiry, repeated effects, no private marker fields, cleanup.');
