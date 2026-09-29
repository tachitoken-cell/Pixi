import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SPELLS, spellDamage, spellPeriodicDamage, spellTargetMultiplier } from '../src/spells.ts';
import { combatStats as playerCombatStats, starterGear } from '../src/progression.ts';

// Run the shipped impact and status resolvers at exact timestamps, without wall-clock waits.
const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert(start >= 0, `${name} exists`);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
const sessions = new Map(), events = [], interrupted = [], combatLog = [];
const arenaMode = session => session?.duel?.mode === 'arena';
const makeSession = (id, mode = 'arena') => {
  const session = { player: { id, name: id, hp: 10000, maxHp: 10000, level: 60, x: 0, z: 0, zone: 'greenwood', appearance: { className: 'Ranger' } },
    lifeStartedAt: 1, instanceId: mode === 'arena' ? 'arena-test' : null, duel: ['arena', 'duel'].includes(mode) ? { id: mode, mode } : null,
    pvp: mode === 'colosseum', socket: { readyState: 1 } };
  sessions.set(id, session); return session;
};
const context = { instantCombat: { combatActive: () => true, enemyKilled: () => false }, sessions, events, enemies: [], pendingHits: [], WebSocket: { OPEN: 1 }, arenaMode, SPELLS,
  broadcast: event => events.push(event), dungeonPreparing: () => false, worldPvp: session => session.pvp,
  hostileTargetValid: (attacker, target) => attacker !== sessions.get(target.id),
  knightDamageTaken: () => {}, knockOut: session => { session.eliminated = true; }, endDuel: () => {},
  activeCompanion: session => session.companion, dirty: () => {}, expireBurning: () => false, resolveKnightTimer: () => false,
  resolveEdictTimer: () => false, triggerEdicts: () => {}, applyHarmEdict: () => {},
  advanceKnightCharge: () => {}, combatTargetLife: target => target.ownerId ? target : sessions.get(target.id)?.lifeStartedAt ?? target.respawnAt,
  applyTalentHit: (hit, damage) => damage, talentEffectRank: () => 0, storeBoostMultiplier: () => 1,
  chilledTarget: () => false, spellPeriodicDamage, spellTargetMultiplier,
  combatStats: target => ({ defense: target.defense || 0 }), combatCompanionStats: () => ({ defense: 0 }),
  companionInRange: () => true, stand: () => {}, event: (_session, kind, text) => { if (kind === 'combat') combatLog.push(text); }, duelMember: session => ({ eliminated: !!session.eliminated }),
  monsterLevelScale: () => 1, distance: () => 0, CHASE_DISTANCE: 25,
  cancelCast: session => { interrupted.push(session); session.casting = null; }, cancelBasicHits: session => { session.autoAttack = null; },
  combatTalentState: () => ({ heat: 0 }) };
runInNewContext(['combatDefense', 'applyDamage', 'damageCompanion', 'combatStunDuration', 'resolveHits', 'scheduleDot', 'cancelPlayerCombat', 'knightDamageTaken', 'queueKnightHit'].map(extract).join('\n'), context);
const attacker = makeSession('attacker'), victim = makeSession('victim');
function hit(target = victim.player, extra = {}, at = 1000, actor = attacker) {
  context.pendingHits.push({ session: actor, enemy: target, damage: 100, dueAt: at, life: context.combatTargetLife(target),
    playerLife: actor.lifeStartedAt, instanceId: actor.instanceId, zone: actor.player.zone, ...extra });
  context.pendingHits.sort((a, b) => a.dueAt - b.dueAt);
  const start = events.length;
  context.resolveHits(at);
  return events.slice(start);
}
const impactKinds = [{}, { basic: true, projectile: true }, { dot: true }, { talentSecondary: true }, { reflected: true }, { edictProc: true }];
for (const extra of impactKinds) {
  assert.equal(hit(victim.player, extra)[0].amount, 20, 'every player damage path receives 80% PvP reduction once');
  assert.match(combatLog.at(-1), /for 20\./, 'combat log reports the reduced hit');
}
victim.player.defense = 20;
assert.equal(hit()[0].amount, 16, 'PvP reduction applies after defense');
victim.player.defense = 0;
attacker.companion = { saved: { hp: 100 }, instanceId: attacker.instanceId };
assert.equal(hit(victim.player, { companion: attacker.companion, companionBasic: true })[0].amount, 20, 'companion attacks receive PvP reduction once');
attacker.companion = null;
victim.shield = { amount: 60, endsAt: 5000 };
const shieldHp = victim.player.hp;
assert.equal(hit()[0].amount, 20); assert.equal(events.at(-1).effect, 'absorb');
assert.equal(victim.shield.amount, 40); assert.equal(victim.player.hp, shieldHp, 'absorb consumes reduced PvP damage');
victim.shield = null;
context.scheduleDot({ session: attacker, enemy: victim.player, playerLife: attacker.lifeStartedAt,
  instanceId: attacker.instanceId, life: victim.lifeStartedAt }, 11, 3, 3000, 1000);
const dotStart = events.length; context.resolveHits(4000);
assert.deepEqual(events.slice(dotStart).map(event => event.amount), [2, 2, 2], 'scheduled periodic ticks round reduced damage to preserve integer health');
attacker.combatTalents = { guard: { until: 10000, absorbed: 0 } };
victim.combatTalents = { guard: { until: 10000, absorbed: 0 } };
const reflected = hit();
assert.deepEqual(reflected.map(event => event.amount), [20, Math.max(1, Math.round(Math.max(1, Math.round(20 * SPELLS.guard.reflectScale)) * .2))],
  'reflection derives from reduced incoming damage, reduces the separate reflected hit once, and never reflects recursively');
attacker.combatTalents = victim.combatTalents = null;

const makePet = owner => owner.companion = { id: `companion:${owner.player.id}`, ownerId: owner.player.id, instanceId: owner.instanceId,
  x: 0, z: 0, level: 60, saved: { hp: 1000 }, get hp() { return this.saved.hp; } };
const pet = makePet(victim);
assert.equal(hit(pet)[0].amount, 20, 'damage to companions also receives 80% PvP reduction');
assert.equal(hit(pet, { damage: 11 })[0].amount, 2); assert(Number.isInteger(pet.saved.hp), 'companion health remains valid for persistence');
for (const target of [victim.player, pet]) assert.equal(hit(target, { damage: 1 })[0].amount, 1, 'a valid damaging hit retains the one HP minimum');
for (const mode of ['duel', 'colosseum']) {
  const outside = makeSession(`outside-${mode}`, mode), outsideAttacker = makeSession(`outside-attacker-${mode}`, mode);
  const outsidePet = makePet(outside);
  for (const target of [outside.player, outsidePet]) for (const extra of impactKinds) {
    assert.equal(hit(target, extra, 1000, outsideAttacker)[0].amount, 20, `${mode}: players and owned companions receive 80% PvP reduction`);
    assert.match(combatLog.at(-1), /for 20\./);
  }
  const attackingPet = makePet(outsideAttacker);
  assert.equal(hit(outside.player, { companion: attackingPet, companionBasic: true }, 1000, outsideAttacker)[0].amount, 20, `${mode}: pet attacks receive the same reduction`);
  const monster = { id: `monster-${mode}`, kind: 'moss-slime', hp: 1000, maxHp: 1000, alive: true, level: 60,
    x: 0, z: 0, zone: 'greenwood', instanceId: null, respawnAt: 1, threat: new Map() };
  assert.equal(hit(monster, {}, 1000, outsideAttacker)[0].amount, 100, `${mode}: attacking a PvE enemy retains full damage`);
  assert.equal(hit(monster, { companion: attackingPet, companionBasic: true }, 1000, outsideAttacker)[0].amount, 100, `${mode}: pet attacks on PvE enemies retain full damage`);
  for (const source of [monster, undefined]) {
    const hp = outside.player.hp;
    context.applyDamage(outside.player, 'player', 100, null, 1000, source);
    assert.equal(outside.player.hp, hp - 100, `${mode}: monster and environmental damage are not reduced by the victim's PvP state`);
    const petHp = outsidePet.hp;
    context.damageCompanion(outside, 100, 1000);
    assert.equal(outsidePet.hp, petHp - 100, `${mode}: monster and environmental damage to pets are unchanged`);
  }
  const duration = context.combatStunDuration(outside, outside, 5000, 1000);
  assert.equal(duration, 5000); assert.equal(outside.arenaStunChain, undefined, 'ordinary stuns never gain arena diminishing returns');
}

for (const ability of ['eagles-eye', 'power-shot', 'poison-shot', 'viper-strike']) for (const mode of ['arena', 'duel', 'colosseum', null]) {
  const spell = SPELLS[ability], actor = makeSession(`${ability}-caster-${mode}`, mode), recipient = makeSession(`${ability}-target-${mode}`, mode);
  const stats = playerCombatStats({ ...actor.player, ...starterGear('Ranger'), talents: [] });
  const monster = {
    id: `${ability}-monster`, kind: 'moss-slime', hp: 10000, maxHp: 10000, alive: true, level: 60,
    x: 0, z: 0, zone: 'greenwood', instanceId: null, respawnAt: 1, threat: new Map() };
  const direct = Math.round(spellDamage(spell, stats) * spellTargetMultiplier(spell, stats, false, 1));
  for (const target of mode ? [Object.assign(recipient.player, { defense: 20 }), makePet(recipient)] : [monster]) {
    const expected = damage => mode ? Math.max(1, Math.round(Math.max(1, damage - (target.defense || 0)) * .1)) : damage;
    const start = events.length;
    hit(target, { ability, stats, damage: spellDamage(spell, stats), status: spell.status, attackerLevel: 60 }, 1000, actor);
    context.resolveHits(1000 + (spell.status?.durationMs || 0));
    assert.deepEqual(events.slice(start).map(event => event.amount),
      [expected(direct), ...Array(spell.status?.ticks || 0).fill(expected(spellPeriodicDamage(spell, stats)))],
      `${spell.label}: authored impact and all ${spell.status?.ticks || 0} poison ticks ${mode ? `receive 90% reduction on ${target.ownerId ? 'companions' : 'players'} in ${mode}` : 'retain full PvE damage'}`);
  }
}

for (const target of [victim.player, pet]) {
  const state = target === victim.player ? victim : pet;
  let at = 10000;
  for (const duration of [4000, 3000, 2000, 1000, 0, 0]) {
    victim.casting = { ability: 'heal' }; victim.autoAttack = { enemy: attacker.player };
    const priorInterrupts = interrupted.length, priorReset = state.arenaStunChain?.resetAt;
    const result = hit(target, { status: { kind: 'stun', durationMs: 5000 } }, at);
    const stunUntil = target === victim.player ? victim.duelStatus.stunUntil : pet.stunUntil;
    if (duration) {
      assert.equal(stunUntil, at + duration, 'arena stun uses 80% duration and shared 100/75/50/25 percent chain steps');
      assert.equal(state.arenaStunChain.resetAt, stunUntil + 15000);
    } else {
      assert(stunUntil < at, 'immune attempts do not add a stun');
      assert(result.some(event => event.effect === 'immune' && event.amount === 0 && event.targetId === target.id), 'immune uses the overhead damage channel');
      assert.equal(state.arenaStunChain.resetAt, priorReset, 'immune attempts cannot perpetually extend immunity');
      assert.equal(interrupted.length, priorInterrupts, 'immune does not interrupt a cast');
      assert(victim.casting); assert(victim.autoAttack, 'immune does not cancel basic attacks');
    }
    at += duration + 1;
  }
  const resetAt = state.arenaStunChain.resetAt;
  assert.equal(context.combatStunDuration(victim, state, 5000, resetAt - 1), 0);
  assert.equal(context.combatStunDuration(victim, state, 5000, resetAt), 4000, 'chain resets exactly fifteen seconds after the last successful stun ends');
}
victim.player.hp = 20;
hit(victim.player, {}, 40000);
assert.equal(victim.player.hp, 1, 'reduced damage preserves arena knockout protection');
context.cancelPlayerCombat(victim);
assert.equal(victim.arenaStunChain, null); assert.equal(victim.duelStatus, null); assert.equal(victim.companion, null, 'arena transitions clear stun chains and companion state');
console.log('PASS PvP combat: 80% general and 90% Eagle\'s Eye/Power Shot/Venom Arrow/Viper Strike reduction, arena/duels/colosseum, all impact paths, defense/shields, periodic/reflected/companion damage, minimum damage, unchanged PvE, stun chains/reset/immunity and knockout cleanup.');
