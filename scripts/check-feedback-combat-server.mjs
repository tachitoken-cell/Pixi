import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as spells from '../src/spells.ts';
import { combatStats, maxHealth, starterGear, talentRank, TALENTS, gearById, canLearnTalent } from '../src/progression.ts';
import { AUTO_ATTACKS, autoAttackDamage, autoAttackTiming } from '../src/auto-attacks.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { monsterLevelScale } from '../src/bestiary.ts';
import { combatCompanionStats, tameableCreature } from '../src/combat-companions.ts';
import { ROOTVAULT_GUARDIAN } from '../src/dungeon.ts';
import { storeBoostMultiplier } from '../src/ingame-store.ts';
import { canTraverse } from '../src/realm.ts';
import { jumpFloor, newJump, moveJump } from '../src/jumping.ts';
import { installCollisionScene, updateCollisionSceneState, disposeCollisionScene } from '../src/collision3d.ts';

// Run the shipped action/impact functions with controlled time and rolls, including their lifecycle guards.
const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = name => {
  const single = source.match(new RegExp(`^  function ${name}\\([^\\n]*\\}\\s*$`, 'm'));
  const body = single?.[0] || source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))?.[0];
  assert(body, `${name} exists`); return body;
};
const constant = name => {
  const body = source.match(new RegExp(`^  const ${name} = [^]*?;\\n`, 'm'))?.[0];
  assert(body, `${name} exists`); return body;
};
const actionStart = source.indexOf("} else if (message.type === 'attack') {") + "} else if (message.type === 'attack') {".length;
const actionEnd = source.indexOf("} else if (message.type === 'cancelCast') {", actionStart);
const autoStart = source.indexOf("} else if (message.type === 'autoAttack') {") + "} else if (message.type === 'autoAttack') {".length;
const autoEnd = source.indexOf("} else if (message.type === 'attack') {", autoStart);
assert(actionStart > 0 && actionEnd > actionStart);
const { SPELLS, TALENT_EFFECT_IDS: IDS } = spells;
const noop = () => {}, distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const names = ['combatSaveBlocked', 'moveSessionJump', 'mobilityDestination', 'edictValid', 'edictPower', 'applyEdict', 'edictNearby', 'fireEdict', 'triggerEdicts', 'resolveEdictTimer', 'applyHarmEdict', 'combatStunDuration', 'advanceKnightCharge', 'knightEnemies', 'knightAllies', 'queueKnightHit', 'tauntEnemy', 'combatDefense', 'clericSupportTalents', 'knightDamageTaken', 'updateKnightCombat', 'resolveKnightTimer', 'activeCompanion', 'publicCompanion', 'healCompanion', 'damageCompanion', 'companionInRange', 'canTame', 'updateCombatCompanions', 'restoreHealth', 'combatTalentState', 'chilledTarget', 'changeDotRate', 'expireBurning', 'queueTalentHit', 'applyTalentHit', 'scheduleDot',
  'hostileTargets', 'hostileTargetValid', 'autoAttackTargetValid', 'autoAttackInRange', 'startAutoAttacks',
  'castTargets', 'releaseCast', 'finishCasts', 'resolveHits', 'cancelCast', 'cancelBasicHits', 'cancelPlayerCombat', 'publicDamageOverTime'];

function fixture(className, effects = {}, capstones = []) {
  let now = 100_000, rolls = [], fallback = .99, rollCount = 0;
  const p = { id: 'caster', name: 'Caster', appearance: { className }, level: 60, hp: 10000, maxHp: 10000,
    x: 0, z: 0, zone: 'greenwood', rotation: 0, ...starterGear(className),
    talents: [...Object.entries(effects).flatMap(([key, rank]) => Array(rank).fill(IDS[key])), ...capstones.map(id => SPELLS[id].requiredTalent)],
    learnedSpells: spells.spellsForClass(className).map(spell => spell.id) };
  const s = { player: p, socket: { readyState: 1 }, recordKey: p.id, instanceId: null, lifeStartedAt: 1,
    lastAttack: 0, abilityCooldowns: {}, jump: { y:0, velocity:0, sequence:0, grounded: true }, travel: {}, gm: {} };
  const enemy = { id: 'enemy', kind: 'moss-slime', name: 'Enemy', hp: 1_000_000, maxHp: 1_000_000,
    x: 2, z: 0, zone: p.zone, level: p.level, alive: true, respawnAt: 1, instanceId: null, threat: new Map() };
  const events = [], damage = [], sessions = new Map([[p.id, s]]);
  const math = Object.create(Math);
  math.random = () => { assert(++rollCount < 1000, 'proc chains terminate under constant successful RNG'); return rolls.shift() ?? fallback; };
  const c = { ...spells, Date: class extends Date { static now() { return now; } }, Math: math,
    combatStats, starterGear, talentRank, TALENTS, AUTO_ATTACKS, autoAttackDamage, autoAttackTiming, combatTiming, monsterLevelScale, storeBoostMultiplier, combatCompanionStats, tameableCreature, ROOTVAULT_GUARDIAN,
    WebSocket: { OPEN: 1 }, CHASE_DISTANCE: 100, WORLD_COLLIDERS: [], WORLD_BOUNDS: {}, sessions,
    enemies: [enemy], pendingHits: [], dungeons: new Map(), committingAccounts: new Map(), distance,
    instanceColliders: () => [], instanceBounds: () => ({}), canTraverse: () => true, groundCanTraverse: () => true, waterAt: () => false, jumpFloor,
    instantCombat: { combatActive: () => true, bySession: () => undefined, allies: () => false, enemyKilled: () => false, actionError: () => null, recordAction() {}, clearMovementImpairments() {} },
    raids: {combatActive: () => true}, dungeonPreparing: () => false, arenaMode: () => false, arenaFighter: () => false, duelMember: () => null, duelValid: () => false, isInColosseum: () => true,
    duelOpponent: () => null, worldPvp: () => false, mapGuardianAllowed: () => true, worldBossCombatAllowed: () => true,
    gmObserver: () => false, canSee: () => true, friendlyTarget: (a, b) => a === b,
    liveSession: (session, at = now) => !!session && sessions.get(session.player.id) === session && session.socket.readyState === 1 && (!session.expiresAt || session.expiresAt > at),
    activeSessions: () => [...sessions.values()], broadcast: event => events.push(event), event: (_session, kind, text) => events.push({ kind, text }),
    applyDamage: (target, kind, amount, instanceId, at) => { target.hp = Math.max(0, target.hp - amount); damage.push({ target: target.id, amount, at }); },
    connection: {}, observeClientAction: noop, recordReferralGameplay: noop,
    send: noop, snapshot: () => ({}), dirty: noop, stand: noop, dismount: noop, cancelGathering: noop, advanceJump: noop,
    playerDied: noop, partyOf: () => null, reject: text => assert.fail(text) };
  runInNewContext(['edictHost', 'talentEffectRank', 'combatTargetLife', 'combatInstanceActive', 'autoAttackPaused', 'swimming'].map(constant).join('\n') + '\n'
    + names.map(extract).join('\n') + '\nthis.api={combatTargetLife,' + names.join(',') + '};', c);
  const attack = runInNewContext(`(function(session,message,now){const p=session.player,socket=session.socket;${source.slice(actionStart, actionEnd)}})`, c);
  const autoAttack = runInNewContext(`(function(session,message,now){const p=session.player,socket=session.socket;${source.slice(autoStart, autoEnd)}})`, c);
  const f = { p, s, enemy, c, api: c.api, damage, events,
    get now() { return now; }, set now(value) { now = value; },
    random(...values) { rolls = values; }, alwaysRoll(value) { fallback = value; },
    resolve(at = now) { now = at; c.api.resolveHits(at); },
    cast(ability, target = enemy) { attack(s, { ability, targetId: target.id }, now); return s.casting; },
    autoAttack(target = enemy) { autoAttack(s, { type:'autoAttack', targetId:target.id }, now); },
    stopAutoAttack() { autoAttack(s, { type:'autoAttack', targetId:null }, now); },
    release(ability, target = enemy) {
      const cast = { ability, stats: combatStats(p), attackerLevel: p.level, startedAt: now, rotation: 0,
        anchor: target, targetId: target.id, targetLife: c.api.combatTargetLife(target), from: { x: p.x, z: p.z },
        playerLife: s.lifeStartedAt, instanceId: s.instanceId, duelId: s.duel?.id };
      assert(c.api.releaseCast(s, cast, now), `${ability} releases`); return c.pendingHits.find(hit => !hit.dot && hit.ability === ability);
    },
    pet(level = p.level) {
      p.tamedCompanion = { kind:'bramble-wolf', level, hp:combatCompanionStats(level).maxHp };
      return c.api.activeCompanion(s, now);
    },
    companionBasic() {
      const pet = c.api.activeCompanion(s, now); assert(pet, 'active companion exists');
      s.autoAttack = { enemy, targetLife:enemy.respawnAt, playerLife:s.lifeStartedAt, instanceId:s.instanceId };
      pet.nextAttackAt = now; c.api.updateCombatCompanions(now, 0);
      const hit = c.pendingHits.find(hit => hit.companionBasic); assert(hit, 'companion basic queues'); f.resolve(hit.dueAt); return hit;
    },
    basic() {
      s.autoAttack = { enemy, targetLife: enemy.respawnAt, playerLife: s.lifeStartedAt, instanceId: s.instanceId };
      s.nextAutoAttackAt = now; c.api.startAutoAttacks(now);
      const hit = c.pendingHits.find(hit => hit.basic); assert(hit, 'basic attack queues'); f.resolve(hit.dueAt); return hit;
    },
    drain() { for (let count = 0; c.pendingHits.length; count++) { assert(count < 500, 'finite combat queue'); f.resolve(c.pendingHits[0].dueAt); } },
  };
  return f;
}

for (const className of ['Knight', 'Ranger', 'Mage', 'Cleric']) {
  for (const backgroundLoot of [false, true]) {
    const f = fixture(className);
    f.c.committingAccounts.set(f.s.recordKey, { backgroundLoot });
    f.autoAttack(); f.api.startAutoAttacks(f.now);
    assert.equal(f.c.pendingHits.some(hit => hit.basic), backgroundLoot, `${className} basic attacks continue only through corpse loot saves`);
  }
}
for (const backgroundLoot of [false, true]) {
  const f = fixture('Ranger', { beastmaster: 1 }), pet = f.pet();
  f.c.committingAccounts.set(f.s.recordKey, { backgroundLoot });
  f.s.autoAttack = { enemy: f.enemy }; pet.nextAttackAt = f.now;
  f.api.updateCombatCompanions(f.now, 0);
  assert.equal(f.c.pendingHits.some(hit => hit.companionBasic), backgroundLoot, 'combat companions keep attacking during corpse loot, but pause for equipment mutations');
}

{
  const skillRing = 'star-ring~2~common~-~5', allDamageRing = 'copper-ring~2~common~391a68bae2aa60d1~0';
  assert.deepEqual(gearById(skillRing).stats, { specialDamage: 7, stamina: 6, spirit: 6 });
  assert.deepEqual(gearById(allDamageRing).stats, { primaryDamage: 1, stamina: 1, spirit: 1, damage: 1 });
  const castDamage = (f, ability, target) => {
    const cast = f.cast(ability, target);
    if (cast) { f.now = cast.endsAt; f.api.finishCasts(f.now); }
    f.drain();
    return f.damage.reduce((total, hit) => total + hit.amount, 0);
  };
  // Independent arithmetic catches a shared tooltip/server formula that omits the same bonus in both places.
  for (const spell of Object.values(SPELLS)) for (const bonus of [0, 7]) {
    const p = { level: 60, appearance: { className: spell.className }, talents: [], equipment: bonus ? { ring1: skillRing } : {} };
    const power = (spell.damageStat === 'specialDamage' ? 213 : { Ranger: 193, Knight: 201, Mage: 197, Cleric: 195 }[spell.className]) + bonus;
    const direct = spell.damageScale === 0 ? 0 : Math.max(1, Math.round(power * spell.damageScale));
    const periodic = spell.status?.ticks ? Math.max(1, Math.round(power * spell.status.tickScale)) : 0;
    const stats = combatStats(p);
    assert.equal(spells.spellDamage(spell, stats), direct, `${spell.id}: skill gear powers every catalog spell, including healing and shields`);
    if (periodic) assert.equal(spells.spellPeriodicDamage(spell, stats), periodic, `${spell.id}: periodic skill scaling`);
    assert.equal(spells.spellTotalPower(spell, stats), direct * (spell.channel ? spell.channel.durationMs / spell.channel.tickMs : 1) + periodic * (spell.status?.ticks || 0), `${spell.id}: complete displayed power`);
  }
  for (const [className, ability, base, scale] of [
    ['Ranger', 'eagles-eye', 193, 2.65], ['Knight', 'heavy-slash', 201, 2.2],
    ['Mage', 'glacial-spike', 197, 2], ['Cleric', 'holy-lance', 195, 2.6],
  ]) {
    const bare = fixture(className), geared = fixture(className);
    geared.p.equipment.ring1 = skillRing;
    assert.equal(castDamage(bare, ability), Math.round(base * scale), `${ability}: preserve unmodified base damage`);
    assert.equal(castDamage(geared, ability), Math.round((base + 7) * scale), `${ability}: skill gear increases authoritative damage`);
    assert.equal(spells.spellTotalPower(SPELLS[ability], combatStats(geared.p)), Math.round((base + 7) * scale), `${ability}: displayed power includes the bonus`);
    const weapon = fixture(className); weapon.p.equipment.ring1 = skillRing; weapon.basic();
    assert.equal(weapon.damage[0].amount, Math.round(base * .55), `${className}: skill-only gear does not buff automatic attacks`);
  }
  for (const [ability, expected] of [
    ['poison-shot', Math.round(200 * .65) + 3 * Math.round(200 * .35)],
    ['rapid-fire', 6 * Math.round(200 * .5)],
    ['volley', 220], ['serpent-fan', Math.round(220 * .45) + 4 * Math.round(220 * .18)],
  ]) {
    const f = fixture('Ranger'); f.p.equipment.ring1 = skillRing;
    assert.equal(castDamage(f, ability), expected, `${ability}: direct, channel and periodic hits count skill damage once`);
    assert.equal(spells.spellTotalPower(SPELLS[ability], combatStats(f.p)), expected, `${ability}: displayed total matches authoritative hits`);
  }
  for (const [ability, expected] of [
    ['heal', Math.round(202 * 2.3)], ['renew', 3 * Math.round(202 * .85)], ['prayer-of-healing', Math.round(220 * 1.35)],
    ['power-word-shield', 404], ['sanctuary', 396],
  ]) {
    const f = fixture('Cleric'); f.p.equipment.ring1 = skillRing; f.p.hp = 1;
    castDamage(f, ability, f.p);
    assert.equal(SPELLS[ability].effect === 'shield' ? f.s.shield.amount : f.p.hp - 1, expected, `${ability}: skill gear affects actual healing or absorption once`);
  }
  for (const [ring, primary] of [['copper-ring', 194], [allDamageRing, 195]]) {
    const f = fixture('Ranger'); f.p.equipment.ring1 = ring;
    assert.equal(castDamage(f, 'eagles-eye'), Math.round(primary * 2.65), 'All Damage applies once to Eagle\'s Eye');
    const special = fixture('Ranger'); special.p.equipment.ring1 = ring;
    assert.equal(castDamage(special, 'volley'), ring === allDamageRing ? 214 : 213, 'All Damage applies once to special-scaled skills');
    const weapon = fixture('Ranger'); weapon.p.equipment.ring1 = ring; weapon.basic();
    assert.equal(weapon.damage[0].amount, Math.round(primary * .55), 'All Damage also affects automatic attacks');
  }
  for (const [talents, expected] of [
    [[], Math.round(193 * 2.65)], [['ranger-4', 'ranger-pathfinder-1', 'ranger-pathfinder-1', 'ranger-5'], Math.round(195 * 2.65)],
    [['ranger-1'], Math.round(193 * 2.65 * 1.02)], [['ranger-4', 'ranger-pathfinder-1', 'ranger-pathfinder-1', 'ranger-5', 'ranger-1'], Math.round(195 * 2.65 * 1.02)],
  ]) {
    const f = fixture('Ranger');
    for (const id of talents) { assert(canLearnTalent(f.p, id), `${id}: reachable passive allocation`); f.p.talents.push(id); }
    assert.equal(castDamage(f, 'eagles-eye'), expected, 'Eagle\'s Eye applies flat skill and percentage damage passives together');
  }
}

{
  const skillRing = 'star-ring~2~common~-~5', allDamageRing = 'copper-ring~2~common~391a68bae2aa60d1~0';
  assert.deepEqual(gearById(skillRing).stats, { specialDamage: 7, stamina: 6, spirit: 6 });
  assert.deepEqual(gearById(allDamageRing).stats, { primaryDamage: 1, stamina: 1, spirit: 1, damage: 1 });
  const castDamage = (f, ability, target) => {
    const cast = f.cast(ability, target);
    if (cast) { f.now = cast.endsAt; f.api.finishCasts(f.now); }
    f.drain();
    return f.damage.reduce((total, hit) => total + hit.amount, 0);
  };
  // Independent arithmetic catches a shared tooltip/server formula that omits the same bonus in both places.
  for (const spell of Object.values(SPELLS)) for (const bonus of [0, 7]) {
    const p = { level: 60, appearance: { className: spell.className }, talents: [], equipment: bonus ? { ring1: skillRing } : {} };
    const power = (spell.damageStat === 'specialDamage' ? 213 : { Ranger: 193, Knight: 201, Mage: 197, Cleric: 195 }[spell.className]) + bonus;
    const direct = spell.damageScale === 0 ? 0 : Math.max(1, Math.round(power * spell.damageScale));
    const periodic = spell.status?.ticks ? Math.max(1, Math.round(power * spell.status.tickScale)) : 0;
    const stats = combatStats(p);
    assert.equal(spells.spellDamage(spell, stats), direct, `${spell.id}: skill gear powers every catalog spell, including healing and shields`);
    if (periodic) assert.equal(spells.spellPeriodicDamage(spell, stats), periodic, `${spell.id}: periodic skill scaling`);
    assert.equal(spells.spellTotalPower(spell, stats), direct * (spell.channel ? spell.channel.durationMs / spell.channel.tickMs : 1) + periodic * (spell.status?.ticks || 0), `${spell.id}: complete displayed power`);
  }
  for (const [className, ability, base, scale] of [
    ['Ranger', 'eagles-eye', 193, 2.65], ['Knight', 'heavy-slash', 201, 2.2],
    ['Mage', 'glacial-spike', 197, 2], ['Cleric', 'holy-lance', 195, 2.6],
  ]) {
    const bare = fixture(className), geared = fixture(className);
    geared.p.equipment.ring1 = skillRing;
    assert.equal(castDamage(bare, ability), Math.round(base * scale), `${ability}: preserve unmodified base damage`);
    assert.equal(castDamage(geared, ability), Math.round((base + 7) * scale), `${ability}: skill gear increases authoritative damage`);
    assert.equal(spells.spellTotalPower(SPELLS[ability], combatStats(geared.p)), Math.round((base + 7) * scale), `${ability}: displayed power includes the bonus`);
    const weapon = fixture(className); weapon.p.equipment.ring1 = skillRing; weapon.basic();
    assert.equal(weapon.damage[0].amount, Math.round(base * .55), `${className}: skill-only gear does not buff automatic attacks`);
  }
  for (const [ability, expected] of [
    ['poison-shot', Math.round(200 * .65) + 3 * Math.round(200 * .35)],
    ['rapid-fire', 6 * Math.round(200 * .5)],
    ['volley', 220], ['serpent-fan', Math.round(220 * .45) + 4 * Math.round(220 * .18)],
  ]) {
    const f = fixture('Ranger'); f.p.equipment.ring1 = skillRing;
    assert.equal(castDamage(f, ability), expected, `${ability}: direct, channel and periodic hits count skill damage once`);
    assert.equal(spells.spellTotalPower(SPELLS[ability], combatStats(f.p)), expected, `${ability}: displayed total matches authoritative hits`);
  }
  for (const [ability, expected] of [
    ['heal', Math.round(202 * 2.3)], ['renew', 3 * Math.round(202 * .85)], ['prayer-of-healing', Math.round(220 * 1.35)],
    ['power-word-shield', 404], ['sanctuary', 396],
  ]) {
    const f = fixture('Cleric'); f.p.equipment.ring1 = skillRing; f.p.hp = 1;
    castDamage(f, ability, f.p);
    assert.equal(SPELLS[ability].effect === 'shield' ? f.s.shield.amount : f.p.hp - 1, expected, `${ability}: skill gear affects actual healing or absorption once`);
  }
  for (const [ring, primary] of [['copper-ring', 194], [allDamageRing, 195]]) {
    const f = fixture('Ranger'); f.p.equipment.ring1 = ring;
    assert.equal(castDamage(f, 'eagles-eye'), Math.round(primary * 2.65), 'All Damage applies once to Eagle\'s Eye');
    const special = fixture('Ranger'); special.p.equipment.ring1 = ring;
    assert.equal(castDamage(special, 'volley'), ring === allDamageRing ? 214 : 213, 'All Damage applies once to special-scaled skills');
    const weapon = fixture('Ranger'); weapon.p.equipment.ring1 = ring; weapon.basic();
    assert.equal(weapon.damage[0].amount, Math.round(primary * .55), 'All Damage also affects automatic attacks');
  }
  for (const [talents, expected] of [
    [[], Math.round(193 * 2.65)], [['ranger-4', 'ranger-pathfinder-1', 'ranger-pathfinder-1', 'ranger-5'], Math.round(195 * 2.65)],
    [['ranger-1'], Math.round(193 * 2.65 * 1.02)], [['ranger-4', 'ranger-pathfinder-1', 'ranger-pathfinder-1', 'ranger-5', 'ranger-1'], Math.round(195 * 2.65 * 1.02)],
  ]) {
    const f = fixture('Ranger');
    for (const id of talents) { assert(canLearnTalent(f.p, id), `${id}: reachable passive allocation`); f.p.talents.push(id); }
    assert.equal(castDamage(f, 'eagles-eye'), expected, 'Eagle\'s Eye applies flat skill and percentage damage passives together');
  }
}

{
  const ordinary = fixture('Ranger'); ordinary.alwaysRoll(0); ordinary.basic(); ordinary.drain();
  assert.equal(ordinary.damage.length, 1, 'Twinshot requires its signature talent');
  const f = fixture('Ranger', { twinshot: 1, twinshotMomentum: 2 });
  f.random(.99, .99, .35); f.basic(); f.basic(); f.basic(); f.drain();
  assert.equal(f.damage.length, 4, 'two failed basics raise Twinshot from 20% to 40%');
  assert.equal(f.s.combatTalents.twinshotMisses, 0, 'a proc clears the accumulated chance');
  f.random(.25); f.basic(); f.drain();
  assert.equal(f.damage.length, 5, 'the next basic returns to 20%');
  f.alwaysRoll(0); f.release('arrow'); f.drain();
  assert.equal(f.damage.length, 6, 'Quick Shot is an ability, not a basic attack proc trigger');
  const reset = fixture('Ranger', { twinshot: 1 }, ['twinshot']); reset.random(0, 0);
  reset.release('twinshot'); reset.drain();
  assert.equal(reset.damage.length, 2, 'the Twinshot capstone can release an extra shot');
  assert(reset.s.abilityCooldowns.twinshot <= reset.now, 'extra shot resets the capstone cooldown');
  assert(reset.s.combatTalents.twinshotReadyUntil > reset.now, 'reset grants a temporary instant shot');
  const count = reset.events.filter(event => event.type === 'combat').length;
  reset.cast('twinshot');
  assert(!reset.s.casting, 'the next Twinshot uses the actual instant-cast action path');
  assert.equal(reset.events.filter(event => event.type === 'combat').length, count + 1);
  assert(!reset.s.combatTalents.twinshotReadyUntil, 'accepting the instant shot consumes readiness');
  const pity = fixture('Ranger', { twinshot: 1, twinshotMomentum: 2 }, ['twinshot']);
  pity.basic(); pity.basic(); assert.equal(pity.s.combatTalents.twinshotMisses, 2);
  pity.random(.25); pity.release('twinshot'); pity.drain();
  assert.equal(pity.damage.length, 3, 'active Twinshot keeps its flat 20% chance despite accumulated basic pity');
  assert.equal(pity.s.combatTalents.twinshotMisses, 2, 'failed active Twinshot does not increase basic pity');
  pity.random(.1, .99); pity.release('twinshot'); pity.drain();
  assert.equal(pity.damage.length, 5, 'active Twinshot still procs below its 20% threshold');
  assert.equal(pity.s.combatTalents.twinshotMisses, 2, 'successful active Twinshot does not consume basic pity');
}

{
  const f = fixture('Mage', { arcaneEcho: 1, arcaneEchoChance: 2 });
  f.random(.2, .2, .99); f.release('arcane-missile'); f.drain();
  assert.equal(f.damage.length, 3, '25% Arcane Echo chance applies to a missile and its own repeat');
  const base = fixture('Mage', { arcaneEcho: 1 }); base.random(.2);
  base.release('arcane-missile'); base.drain();
  assert.equal(base.damage.length, 1, 'unaugmented Arcane Echo chance is 15%');
  const wrongSchool = fixture('Mage', { arcaneEcho: 1 }); wrongSchool.alwaysRoll(0);
  wrongSchool.release('frostbolt'); wrongSchool.drain();
  assert.equal(wrongSchool.damage.length, 1, 'Frost cannot trigger Arcane Echo');
  const bounded = fixture('Mage', { arcaneEcho: 1 }); bounded.alwaysRoll(0);
  bounded.release('arcane-missile'); bounded.drain();
  assert(bounded.damage.length > 2 && bounded.damage.length <= 17, 'successful recursion has a finite server budget');
  for (const count of [1, 3, 9]) {
    const volley = fixture('Mage', { arcaneEcho: 1 }, ['arcane-volley']);
    volley.c.enemies = Array.from({ length: count }, (_, i) => ({ ...volley.enemy, id: `foe-${i}`, x: 2 + i / 3, threat: new Map() }));
    volley.release('arcane-volley', volley.c.enemies[0]); volley.drain();
    assert.equal(volley.damage.length, 8, 'seven initial missiles guarantee one repeat with failed random rolls');
    assert.equal(new Set(volley.damage.map(hit => hit.target)).size, Math.min(count, 7), 'volley distributes over at most seven legal targets');
  }
  const duel = fixture('Mage', { arcaneEcho: 1 }, ['arcane-volley']);
  const victim = { ...duel.p, id: 'volley-opponent', talents: [], x: 2 };
  victim.hp = victim.maxHp = maxHealth(victim);
  duel.c.sessions.set(victim.id, { ...duel.s, player: victim, abilityCooldowns: {} });
  duel.c.enemies = []; duel.c.worldPvp = () => true;
  duel.release('arcane-volley', victim); duel.drain();
  assert.equal(duel.damage.length, 8);
  assert(victim.hp > 0, 'guaranteed volley damage does not one-shot a full-health equal-level opponent in ordinary gear');
  for (const ability of ['arcane-volley', 'arcane-missile']) {
    const paired = [];
    for (const pvp of [false, true]) {
      const encounter = fixture('Mage', { arcaneEcho: 1 }, ['arcane-volley']); encounter.random(0, 0);
      let target = encounter.enemy;
      if (pvp) {
        target = { ...encounter.p, id: 'unarmored-opponent', talents: [], equipment: {}, hp: 1_000_000, maxHp: 1_000_000, x: 2 };
        assert.equal(combatStats(target).defense, 0);
        encounter.c.sessions.set(target.id, { ...encounter.s, player: target, abilityCooldowns: {} });
        encounter.c.enemies = []; encounter.c.worldPvp = () => true;
      }
      encounter.release(ability, target); encounter.drain(); paired.push(encounter.damage.map(hit => hit.amount));
      if (!pvp && ability === 'arcane-volley') {
        const direct = spells.spellDamage(SPELLS[ability], combatStats(encounter.p));
        assert.equal(paired[0].filter(amount => amount === direct).length, 7, 'all seven PvE volley missiles retain authored damage');
        assert(paired[0].length > 8, 'controlled successful rolls exercise inherited echoes beyond the guaranteed repeat');
      }
    }
    assert.deepEqual(paired[1], paired[0].map(amount => Math.max(1, Math.round((ability === 'arcane-volley' ? Math.round(amount * .4) : amount) * .2))),
      '80% PvP reduction applies after the existing volley missile and inherited echo reduction; PvE retains authored damage');
  }
}

{
  const sum = hits => hits.reduce((total, hit) => total + hit.damage, 0);
  const close = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-6, message);
  for (const rank of [0, 1, 2]) {
    const f = fixture('Ranger', { venom: 1, lingeringVenom: rank });
    const first = f.basic(), poison = Math.round(first.damage * .6), ticks = 4 + rank;
    assert.equal(f.damage[0].amount, first.damage - poison, '60% of basic damage is converted, not added');
    assert.equal(f.c.pendingHits.length, ticks);
    close(sum(f.c.pendingHits), poison, 'longer venom preserves the initial damage pool');
    assert.equal(f.c.pendingHits.at(-1).dueAt - first.dueAt, ticks * 1000, 'each lingering rank adds one second');
    f.basic();
    assert.equal(f.c.pendingHits.length, ticks, 'reapplication refreshes one poison');
    close(sum(f.c.pendingHits), poison * 2, 'unspent basic poison carries forward exactly');
    const seen = f.api.publicDamageOverTime(f.s).get(f.enemy.id);
    assert.equal(seen.length, 1, 'public effects expose one owned timer');
    f.s.autoAttack = null; f.api.cancelBasicHits(f.s); f.drain();
    assert.equal(f.damage.length, 2 + ticks, 'stopping basic attacks preserves already applied poison');
    assert.equal(f.damage.reduce((total, hit) => total + hit.amount, 0), first.damage * 2, 'integer poison ticks preserve exact same-level total damage at every duration rank');
  }
  const boosted = fixture('Ranger', { venom: 1 });
  const poisonTalent = Object.values(TALENTS).find(talent => talent.className === 'Ranger' && talent.spellBonuses?.poison);
  const periodicTalent = Object.values(TALENTS).find(talent => talent.className === 'Ranger' && talent.spellBonuses?.periodic);
  assert(poisonTalent && periodicTalent, 'Venom has poison and periodic damage talents');
  boosted.p.talents.push(poisonTalent.id, periodicTalent.id);
  const firstBoosted = boosted.basic(), initialBonus = combatStats(boosted.p).spellBonuses;
  const initialPool = Math.round(Math.round(firstBoosted.damage * .6) * (1 + (initialBonus.poison + initialBonus.periodic) / 100));
  close(sum(boosted.c.pendingHits), initialPool, 'basic venom benefits from poison and periodic damage bonuses');
  assert.equal(boosted.damage[0].amount, firstBoosted.damage - Math.round(firstBoosted.damage * .6), 'poison bonuses do not increase the direct basic portion');
  boosted.p.talents.push(poisonTalent.id);
  const nextBoosted = boosted.basic(), updatedBonus = combatStats(boosted.p).spellBonuses;
  close(sum(boosted.c.pendingHits), initialPool + Math.round(Math.round(nextBoosted.damage * .6) * (1 + (updatedBonus.poison + updatedBonus.periodic) / 100)),
    'reapplication scales only newly converted venom and never compounds the carried pool');
  const f = fixture('Ranger', { venom: 1 }, ['venom-detonation']); f.basic();
  const poisonCast = f.release('poison-shot'); f.resolve(poisonCast.dueAt);
  assert.equal(new Set(f.c.pendingHits.map(hit => hit.ability)).size, 2, 'ability poison and basic venom coexist');
  const original = [...f.c.pendingHits], pool = sum(original), other = { ...f.s, player: { ...f.p, id: 'other-ranger' } };
  f.c.sessions.set(other.player.id, other);
  const foreign = { ...original[0], session: other }, distant = { ...f.enemy, id: 'distant', x: 30, threat: new Map() };
  f.c.enemies.push(distant);
  const outOfRange = { ...original[0], enemy: distant };
  f.c.pendingHits.push(foreign, outOfRange); f.c.pendingHits.sort((a, b) => a.dueAt - b.dueAt);
  const count = f.damage.length; f.release('venom-detonation'); f.resolve();
  assert.equal(f.damage.length, count + 1);
  assert.equal(f.damage.at(-1).amount, Math.round(pool * 1.1), 'two unique owned effects add 10% to the remaining poison pool');
  assert.equal(f.c.pendingHits.length, 2, 'detonation removes every remaining tick only on legal targets');
  assert(f.c.pendingHits.includes(foreign) && f.c.pendingHits.includes(outOfRange), 'another caster and distant poison survive');
  f.release('venom-detonation'); f.resolve();
  assert.equal(f.damage.length, count + 1, 'an unpoisoned target takes no free detonation damage');

  for (const kind of ['player', 'companion', 'enemy']) {
    const mixed = fixture('Ranger', { venom: 1 }, ['venom-detonation']);
    const target = kind === 'enemy' ? mixed.enemy : (() => {
      const { owner, pet } = opposingCompanion(mixed);
      return kind === 'player' ? owner.player : pet;
    })();
    mixed.autoAttack(target); mixed.api.startAutoAttacks(mixed.now);
    mixed.release('poison-shot', target); mixed.release('viper-strike', target);
    mixed.resolve(Math.max(...mixed.c.pendingHits.map(hit => hit.dueAt))); mixed.stopAutoAttack();
    const dots = mixed.c.pendingHits.filter(hit => hit.dot && hit.enemy === target);
    const basicPool = sum(dots.filter(hit => hit.venomBasic));
    const arrowPool = sum(dots.filter(hit => hit.ability === 'poison-shot'));
    const viperPool = sum(dots.filter(hit => hit.ability === 'viper-strike'));
    assert(basicPool > 0 && arrowPool > 0 && viperPool > 0, `${kind}: mixed detonation includes basic Venom and both reduced spell poisons`);
    const weightedPool = basicPool + (arrowPool + viperPool) * (kind === 'enemy' ? 1 : .5);
    const raw = Math.round(weightedPool * 1.15), defense = kind === 'companion' ? combatCompanionStats(target.level).defense : kind === 'player' ? combatStats(target).defense : 0;
    const expected = kind === 'enemy' ? raw : Math.max(1, Math.round(Math.max(1, raw - defense) * .2));
    const hp = target.hp, detonation = mixed.release('venom-detonation', target);
    assert(detonation.dueAt < Math.min(...dots.map(hit => hit.dueAt)), 'detonation lands before the next consumed tick');
    mixed.resolve(detonation.dueAt);
    assert.equal(hp - target.hp, expected, `${kind}: detonation preserves each source poison's PvP reduction and the three-effect bonus`);
    assert(!mixed.c.pendingHits.some(hit => hit.dot && hit.enemy === target), 'detonation consumes every owned tick exactly once');
  }
}

{
  const f = fixture('Mage', { burning: 1 });
  const first = f.release('fireball'); f.resolve(first.dueAt);
  assert.equal(f.s.combatTalents.heat, 1, 'direct fire damage grants Burning');
  assert.equal(f.c.pendingHits.length, 4);
  assert(f.c.pendingHits[0].dueAt - f.now < 1000, 'Burning accelerates existing burn ticks');
  const cast = f.cast('cinderbolt');
  assert.equal(cast.endsAt - cast.startedAt, Math.round(SPELLS.cinderbolt.castTimeMs / 1.03), 'actual action uses heat for cast speed');
  f.api.cancelCast(f.s);
  const second = f.release('cinderbolt'), nextTick = f.c.pendingHits.find(hit => hit.dot).dueAt;
  f.resolve(second.dueAt);
  assert.equal(f.s.combatTalents.heat, 2);
  assert(f.c.pendingHits[0].dueAt < nextTick, 'new heat also speeds a previously applied DoT');
  f.drain(); assert.equal(f.s.combatTalents.heat, 2, 'without the augment, DoTs do not build heat');
  f.resolve(f.now + 7000);
  assert.equal(f.api.combatTalentState(f.s, f.now).heat, 0, 'idle heat expires');
  f.s.lastAttack = 0;
  const coldCast = f.cast('fireball');
  assert.equal(coldCast.endsAt - coldCast.startedAt, SPELLS.fireball.castTimeMs, 'expiry restores authored cast speed');
  for (const rank of [1, 2]) {
    const periodic = fixture('Mage', { burning: 1, periodicBurning: rank });
    const hit = periodic.release('fireball'); periodic.resolve(hit.dueAt);
    periodic.resolve(periodic.c.pendingHits[0].dueAt);
    assert.equal(periodic.s.combatTalents.heat, 1 + rank, 'each periodic augment rank adds one heat per tick');
  }
  const capped = fixture('Mage', { burning: 1, periodicBurning: 2 }, ['combustion']);
  for (let i = 0; i < 12; i++) { const hit = capped.release('cinderbolt'); capped.resolve(hit.dueAt); }
  assert.equal(capped.s.combatTalents.heat, 10, 'heat is bounded at ten stacks');
  const combustion = capped.cast('combustion');
  assert.equal(combustion.endsAt - combustion.startedAt, Math.round(3000 / 1.3));
  capped.now = combustion.endsAt; capped.api.finishCasts(capped.now);
  const impact = capped.c.pendingHits.find(hit => hit.ability === 'combustion'); capped.resolve(impact.dueAt);
  assert.equal(capped.c.pendingHits.length, 6, 'Combustion leaves six real damage ticks');
  assert(capped.c.pendingHits[0].damage > spells.spellPeriodicDamage(SPELLS.fireball, combatStats(capped.p)), 'Combustion has a stronger burn than Fireball');
  capped.drain(); assert.equal(capped.s.combatTalents.heat, 10, 'periodic heat cannot exceed the stack cap');
}

{
  const f = fixture('Mage', { chilled: 1, deepChill: 2 }, ['shatter']);
  const first = f.release('comet-shower'); f.resolve(first.dueAt);
  assert(f.api.chilledTarget(f.enemy, f.now), 'a frost spell without an authored slow still applies Chilled');
  assert.equal(f.enemy.slowMultiplier, .8); assert.equal(f.enemy.talentChill.until, f.now + 4000);
  const lance = f.release('ice-lance'); f.resolve(lance.dueAt);
  assert.equal(f.damage.at(-1).amount, Math.round(spells.spellDamage(SPELLS['ice-lance'], combatStats(f.p)) * 3 * 1.1), 'Chilled gives triple Ice Lance damage plus two deep-chill ranks');
  assert(f.s.abilityCooldowns['ice-lance'] <= f.now, 'landing Ice Lance on Chilled resets its cooldown');
  const plain = fixture('Mage', { chilled: 1 });
  const initialLance = plain.release('ice-lance'); plain.resolve(initialLance.dueAt);
  assert(plain.s.abilityCooldowns['ice-lance'] > plain.now, 'first Ice Lance does not reset itself on an initially unchilled target');
  const nearby = { ...f.enemy, id: 'nearby', x: 4, talentChill: null, threat: new Map() };
  const far = { ...f.enemy, id: 'far', x: 12, talentChill: null, slowUntil: f.now + 5000, threat: new Map() };
  f.c.enemies.push(nearby, far);
  const count = f.damage.length; f.release('shatter'); f.resolve();
  assert.equal(f.damage.length, count + 2, 'Shatter hits a chilled center and its nearby unchilled neighbor');
  assert(!f.damage.slice(count).some(hit => hit.target === far.id), 'an ordinary slow is not a Shatter center');
  assert(!f.api.chilledTarget(f.enemy, f.now), 'Shatter consumes its centers instead of reapplying Chilled');
  f.release('shatter'); f.resolve();
  assert.equal(f.damage.length, count + 2, 'consumed Chilled cannot explode a second time');
  for (const obstructed of [false, true]) {
    const edge = fixture('Mage', { chilled: 1 }, ['shatter']); edge.enemy.x = 17;
    const chill = edge.release('comet-shower'); edge.resolve(chill.dueAt);
    const splash = { ...edge.enemy, id: 'outside-center-range', x: 19, talentChill: null, threat: new Map() };
    edge.c.enemies.push(splash);
    if (obstructed) edge.c.canTraverse = (a, b) => !(a === edge.enemy && b === splash);
    const previous = edge.damage.length; edge.release('shatter'); edge.resolve();
    assert.equal(edge.damage.length - previous, obstructed ? 1 : 2, 'Shatter reaches a neighbor beyond center acquisition range while respecting blast line of sight');
    assert.equal(edge.damage.slice(previous).some(hit => hit.target === splash.id), !obstructed);
  }
}

// Redesign effects use the same live action, impact and lifecycle functions as existing specializations.
for (const rank of [1, 2]) {
  const f = fixture('Ranger', { twinshot:1, arrowstorm:rank }); f.alwaysRoll(0);
  for (let proc = 1; proc <= 7; proc++) {
    const hit = f.basic(); f.drain();
    assert.equal(f.api.combatTalentState(f.s,f.now).arrowstormStacks,Math.min(proc,5),'Arrowstorm caps at five Twinshot triggers');
    assert.equal(f.s.combatTalents.arrowstormUntil,hit.dueAt+10000,'each trigger refreshes the full ten-second duration');
  }
  const readyAt = f.s.nextAutoAttackAt;
  f.now = readyAt-1; f.api.startAutoAttacks(f.now); assert.equal(f.c.pendingHits.length,0,'haste never bypasses the actual basic cooldown');
  f.now = readyAt; f.api.startAutoAttacks(f.now);
  assert(Math.abs(f.s.nextAutoAttackAt-f.now-AUTO_ATTACKS.Ranger.cooldownMs/(1+5*rank*.05))<1e-6,'ranked stacks shorten authoritative auto-attack timing');
  f.drain();
  f.now = f.s.combatTalents.arrowstormUntil; f.api.startAutoAttacks(f.now);
  assert.equal(f.api.combatTalentState(f.s,f.now).arrowstormStacks,0,'Arrowstorm expires at its deadline');
  assert.equal(f.s.nextAutoAttackAt-f.now,AUTO_ATTACKS.Ranger.cooldownMs,'expiry restores the authored attack interval');
  f.drain(); assert.equal(f.s.combatTalents.arrowstormStacks,1,'first proc after expiry starts a new stack');
}

for (const rank of [1, 2]) {
  const f = fixture('Ranger', { beastmaster:1, everlastingBond:rank, twinshot:1 }), pet = f.pet();
  const maximum = combatCompanionStats(pet.saved.level).maxHp; pet.saved.hp = 1;
  const petHit = f.companionBasic(); assert.equal(f.damage.at(-1).amount,combatCompanionStats(pet.saved.level).damage,'companion uses normalized damage');
  assert(pet.bondReady); assert(!petHit.basic,'companion attacks never masquerade as owner basics');
  f.companionBasic(); assert(pet.bondReady,'multiple companion attacks retain one pending empowerment');
  f.release('arrow'); f.drain(); assert(pet.bondReady,'an owner spell cannot consume Bond'); assert.equal(pet.saved.hp,1,'spells do not trigger the basic-attack heal');
  f.random(0); const before=f.damage.length, basic=f.basic(); f.drain();
  assert.equal(f.damage[before].amount,Math.round(basic.damage*(1+rank*.1)),'Bond empowers exactly one owner basic by 10/20%');
  assert.equal(f.damage[before+1].amount,basic.damage,'the Twinshot bonus does not inherit or consume another Bond empowerment');
  assert.equal(pet.saved.hp,1+Math.round(maximum*rank*.05),'5/10% pet-health heal occurs once, not again on the bonus shot');
  assert(!pet.bondReady);
  const next=f.basic(); f.drain(); assert.equal(f.damage.at(-1).amount,next.damage,'subsequent basic has ordinary damage until another companion hit');
  assert.equal(pet.saved.hp,1+Math.round(maximum*rank*.05),'unprimed owner basics neither heal nor amplify damage');
  f.api.damageCompanion(f.s,maximum,f.now); assert.equal(pet.saved.hp,0); assert(!pet.bondReady); assert.equal(pet.target,null);
  f.api.healCompanion(f.s,maximum,f.now); assert.equal(pet.saved.hp,0,'ordinary healing cannot resurrect a fallen companion');
}
{
  const f=fixture('Ranger',{beastmaster:1}),pet=f.pet(); pet.saved.hp=100;
  assert.equal(f.api.restoreHealth(f.s,42,f.now),0,'owner is already at full health');
  assert.equal(pet.saved.hp,142,'incoming healing still reaches the companion when owner is full');
  f.p.hp-=7; assert.equal(f.api.restoreHealth(f.s,42,f.now),7); assert.equal(pet.saved.hp,184,'owner overheal does not reduce the mirrored pet amount');
  f.p.hp=0; f.api.restoreHealth(f.s,42,f.now); assert.equal(pet.saved.hp,184,'dead owners cannot route healing to an active companion');
}
for (const level of [1,30,60]) {
  const f=fixture('Ranger',{beastmaster:1}); f.pet(level); f.enemy.level=level;
  f.companionBasic(); assert.equal(f.damage.at(-1).amount,combatCompanionStats(level).damage,'taming cannot import elite monster attack power');
}

{
  const f=fixture('Ranger',{beastmaster:1}),pet=f.pet(); f.enemy.x=10;
  f.autoAttack();
  for(let tick=0;tick<25&&!f.damage.length;tick++) {
    f.now+=100; f.api.updateCombatCompanions(f.now,.1); f.resolve();
  }
  assert.equal(f.damage.length,1,'the pet reaches and attacks a target selected at bow range');
  assert(distance(pet,f.enemy)<=combatCompanionStats(pet.saved.level).range);
  assert.deepEqual([f.p.x,f.p.z],[0,0],'pet pursuit never pulls the hunter into melee');
}

function opposingCompanion(f,mode='world') {
  const player={...f.p,id:'pet-owner',name:'Pet Owner',x:2,appearance:{className:'Ranger'},talents:[IDS.beastmaster],
    tamedCompanion:{kind:'bramble-wolf',level:f.p.level,hp:combatCompanionStats(f.p.level).maxHp}};
  const owner={...f.s,player,recordKey:player.id,abilityCooldowns:{},travel:{},gm:{}};
  f.c.sessions.set(player.id,owner);
  if(mode==='world') f.c.worldPvp=session=>session===f.s||session===owner;
  if(mode==='duel'||mode==='arena') {
    const duel={id:'pet-duel',members:[{session:f.s,team:0},{session:owner,team:1}]};
    f.s.duel=owner.duel=duel;
    f.c.duelMember=session=>session.duel?.members.find(member=>member.session===session);
    f.c.duelValid=session=>session.duel===duel;
    f.c.duelOpponent=session=>session===f.s?owner:f.s;
    if(mode==='arena') {
      f.c.arenaMode=session=>session.duel===duel;
      f.c.arenaFighter=session=>f.c.liveSession(session)&&!f.c.duelMember(session)?.eliminated&&session.player.hp>0;
    }
  }
  return {owner,pet:f.api.activeCompanion(owner,f.now)};
}
for(const mode of ['world','duel','arena']) {
  const f=fixture('Mage'),{owner,pet}=opposingCompanion(f,mode),ownerHp=owner.player.hp;
  assert(f.api.hostileTargets(f.s,f.now).includes(pet),`${mode} exposes the opponent's companion`);
  assert(f.api.hostileTargetValid(f.s,pet,f.now));
  assert(!f.api.hostileTargetValid(owner,pet,f.now),'owners cannot attack their own pets');
  assert.equal(f.api.combatTargetLife(pet),pet,'each active pet has its own combat life identity');
  f.cast('arcane-missile',pet); f.api.finishCasts(f.s.casting?.endsAt??f.now); f.drain();
  assert(pet.saved.hp<pet.maxHp,'hostile player spells damage saved companion health');
  assert.equal(owner.player.hp,ownerHp,'companion damage never damages its owner');
  assert(f.events.some(event=>event.type==='damage'&&event.targetId===pet.id&&event.amount>0),'pet damage is broadcast on its target id');
  if(mode==='arena') {
    f.c.duelMember(owner).team=0;
    assert(!f.api.hostileTargets(f.s,f.now).includes(pet),'arena teammates cannot select each other\'s pets for attacks');
    assert(!f.api.hostileTargetValid(f.s,pet,f.now),'arena team legality is rechecked at impact');
  } else {
    f.c.worldPvp=()=>false; f.c.duelValid=()=>false;
    assert(!f.api.hostileTargets(f.s,f.now).includes(pet),'pets cannot bypass peaceful owner protection');
    assert(!f.api.hostileTargetValid(f.s,pet,f.now));
  }
}
for(const mode of ['world','duel','arena']) {
  const f=fixture('Knight'),{owner,pet}=opposingCompanion(f,mode),ownerHp=owner.player.hp;
  f.p.achievements={kills:0}; owner.player.achievements={kills:0}; pet.saved.hp=1;
  f.autoAttack(pet); f.api.startAutoAttacks(f.now); f.drain();
  assert.equal(pet.saved.hp,0,'ordinary auto attacks can defeat a hostile companion');
  assert.equal(owner.player.hp,ownerHp);
  assert.equal(f.p.achievements.kills,0,'defeating a pet awards no monster kill credit');
  assert.equal(owner.player.achievements.kills,0);
  assert(!f.events.some(event=>event.kind==='reward'),'defeating a pet grants no loot or experience');
  assert(!f.c.duelMember(owner)?.eliminated,'defeating a companion never eliminates its owner');
  assert(!f.api.hostileTargetValid(f.s,pet,f.now),'fallen companions are no longer valid targets');
}
{
  const f=fixture('Mage'),{owner,pet}=opposingCompanion(f); owner.player.x=pet.x=10;
  const hit=f.release('frostbolt',pet); f.resolve(hit.dueAt);
  assert(pet.slowUntil>f.now,'hostile slows apply to the companion');
  assert(!owner.duelStatus,'companion control effects do not affect its owner');
  f.api.updateCombatCompanions(f.now,.1);
  assert(Math.abs(pet.x-9.7)<1e-6,'the pet pursues at half speed while slowed');
}
{
  const f=fixture('Mage'),{owner,pet}=opposingCompanion(f),hit=f.release('deep-freeze',pet);
  f.now=hit.dueAt-100; owner.autoAttack={enemy:f.p}; pet.nextAttackAt=f.now; f.api.updateCombatCompanions(f.now,0);
  assert(f.c.pendingHits.some(pending=>pending.companionBasic),'the opponent pet has an attack winding up');
  f.resolve(hit.dueAt); assert(pet.stunUntil>f.now); f.drain();
  assert.equal(f.damage.length,0,'stunning a companion interrupts its pending attack without hitting its owner');
  const x=pet.x; f.api.updateCombatCompanions(f.now,.1);
  assert.equal(pet.x,x,'stunned companions cannot move'); assert.equal(f.c.pendingHits.length,0);
}
{
  const f=fixture('Ranger'),{owner,pet}=opposingCompanion(f),ownerHp=owner.player.hp;
  f.release('poison-shot',pet); f.drain();
  assert(f.events.filter(event=>event.type==='damage'&&event.targetId===pet.id).length>1,'companion targets receive periodic spell damage');
  assert.equal(owner.player.hp,ownerHp,'periodic companion damage never damages the owner');
}
{
  const f=fixture('Mage'),{owner,pet}=opposingCompanion(f,'duel'),hp=pet.hp;
  f.release('arcane-missile',pet); owner.duel.id='another-duel'; f.drain();
  assert.equal(pet.hp,hp,'pet projectiles cannot cross duel identities');
}
for(const invalidate of [
  (f,owner)=>owner.player.tamedCompanion={...owner.player.tamedCompanion},
  (f,owner)=>owner.player.tamedCompanion.hp=0,
  (f,owner)=>owner.player.tamedCompanion.dismissed=true,
  (f,owner)=>owner.travel.mount=true,
  (f,owner)=>owner.lifeStartedAt++,
  (f,owner)=>owner.instanceId='elsewhere',
  (f,owner)=>owner.player.hp=0,
  (f,owner)=>owner.socket={readyState:3},
  (f,owner)=>f.c.sessions.delete(owner.player.id),
  f=>f.c.worldPvp=()=>false,
  f=>f.c.isInColosseum=()=>false,
  f=>f.c.waterAt=x=>x===2,
]) {
  const f=fixture('Mage'),{owner,pet}=opposingCompanion(f);
  f.release('arcane-missile',pet); invalidate(f,owner); const hp=owner.player.tamedCompanion.hp; f.drain();
  assert.equal(owner.player.tamedCompanion.hp,hp,'stale projectiles cannot damage replaced, dead, despawned or newly protected pets');
  assert(!f.events.some(event=>event.type==='damage'),'invalid pet impact produces no damage event');
}

const tameInvalidations=[
  f=>f.enemy.worldBoss=true, f=>f.enemy.dungeonBoss=true, f=>f.enemy.kind='training-dummy', f=>f.enemy.id=ROOTVAULT_GUARDIAN.id,
  f=>f.enemy.level=f.p.level+1, f=>f.p.talents=[], f=>f.p.level--, f=>f.enemy.alive=false, f=>f.enemy.hp=0,
];
for (const invalidate of tameInvalidations) {
  const early=fixture('Ranger',{beastmaster:1}); invalidate(early); early.cast('tame-beast');
  assert(!early.s.casting&&!early.p.tamedCompanion,'invalid creatures/talents/levels cannot begin taming');
  const late=fixture('Ranger',{beastmaster:1}),cast=late.cast('tame-beast'); assert(cast,'valid tame begins');
  invalidate(late); late.now=cast.endsAt; late.api.finishCasts(late.now);
  assert(!late.s.casting&&!late.p.tamedCompanion,'eligibility is rechecked at tame completion');
  assert.equal(late.damage.length,0,'failed taming never damages the creature');
  assert(!late.s.abilityCooldowns['tame-beast'],'failed tame does not start spell cooldown');
}
{
  const f=fixture('Ranger',{beastmaster:1}),old=f.pet(),before=f.enemy.hp;
  f.s.autoAttack={enemy:f.enemy,targetLife:f.enemy.respawnAt,playerLife:f.s.lifeStartedAt,instanceId:f.s.instanceId};
  old.nextAttackAt=f.now; f.api.updateCombatCompanions(f.now,0); f.api.startAutoAttacks(f.now);
  assert(f.c.pendingHits.some(hit=>hit.companion)&&f.c.pendingHits.some(hit=>hit.basic));
  const cast=f.cast('tame-beast'); assert.equal(cast.endsAt-cast.startedAt,3000);
  assert(!f.s.autoAttack&&f.c.pendingHits.length===1&&f.c.pendingHits[0].projectile,'taming cancels pending melee while a released hunter projectile remains valid');
  f.resolve(f.now+1000);const releasedDamage=autoAttackDamage('Ranger',combatStats(f.p));
  assert.equal(f.enemy.hp,before-releasedDamage,'the already released projectile still lands');
  f.api.updateCombatCompanions(f.now,1); assert.equal(f.c.pendingHits.length,0,'companion remains passive during taming');
  f.now=cast.endsAt; f.api.finishCasts(f.now);
  assert.equal(f.p.tamedCompanion.kind,f.enemy.kind); assert.equal(f.p.tamedCompanion.level,f.enemy.level);
  assert.equal(f.p.tamedCompanion.hp,combatCompanionStats(f.enemy.level).maxHp);
  assert.equal(f.s.abilityCooldowns['tame-beast'],f.now+10000);
  assert.equal(f.enemy.hp,before-releasedDamage); assert(f.enemy.alive); assert.equal(f.damage.length,1,'taming adds no damage or kill rewards beyond the earlier projectile');
}
for (const invalidate of [f=>f.enemy.respawnAt++,f=>f.p.x=1,f=>f.s.lifeStartedAt++,f=>f.s.instanceId='elsewhere']) {
  const f=fixture('Ranger',{beastmaster:1}),cast=f.cast('tame-beast'); invalidate(f); f.now=cast.endsAt; f.api.finishCasts(f.now);
  assert(!f.p.tamedCompanion,'movement, target respawn, owner death/respawn and realm changes interrupt taming');
}

{
  const f=fixture('Ranger',{beastmaster:1,everlastingBond:2},['combined-assault']),pet=f.pet(),start=f.now;
  f.cast('combined-assault'); f.api.updateCombatCompanions(f.now,0);
  assert.equal(f.s.abilityCooldowns['combined-assault'],start+16000); assert.equal(f.c.pendingHits.length,2);
  const expected=[Math.round(combatCompanionStats(pet.saved.level).damage*1.5),Math.round(autoAttackDamage('Ranger',combatStats(f.p))*1.5)];
  f.drain(); assert.deepEqual(f.damage.map(hit=>hit.amount),expected,'Combined Assault delivers 150% owner and normalized pet basic damage');
  assert(!pet.bondReady,'Combined Assault is not a companion basic and cannot prime Bond');
  f.now=start+15999; f.cast('combined-assault'); assert.equal(f.c.pendingHits.length,0,'Combined Assault respects its 16-second cooldown');
  f.now=start+16000; f.cast('combined-assault'); f.api.updateCombatCompanions(f.now,0);
  assert.equal(f.c.pendingHits.length,2,'Combined Assault becomes ready exactly at 16 seconds');
}
{
  const f=fixture('Ranger',{beastmaster:1},['combined-assault']),pet=f.pet(); f.enemy.x=10;
  f.cast('combined-assault');
  assert(!pet.assault&&!f.c.pendingHits.length,'Combined Assault requires the companion already in melee');
  assert(!f.s.abilityCooldowns['combined-assault'],'an out-of-range companion consumes no cooldown');
  assert.deepEqual([pet.x,pet.z],[0,0],'rejected Combined Assault does not command pet movement');
  pet.x=9;f.cast('combined-assault');f.api.updateCombatCompanions(f.now,0);f.drain();
  assert.deepEqual(f.damage.map(hit=>hit.amount),[
    Math.round(combatCompanionStats(pet.saved.level).damage*1.5),Math.round(autoAttackDamage('Ranger',combatStats(f.p))*1.5),
  ],'an already adjacent pet strikes while the hunter shoots from bow range');
  assert.deepEqual([f.p.x,f.p.z],[0,0],'Combined Assault does not require the hunter to enter melee');
}
for (const invalidate of [f=>f.p.tamedCompanion=null,f=>f.p.tamedCompanion.hp=0,f=>f.p.talents=[]]) {
  const f=fixture('Ranger',{beastmaster:1},['combined-assault']); f.pet(); invalidate(f); f.cast('combined-assault');
  assert.equal(f.c.pendingHits.length,0,'Combined Assault requires its talent and a living companion');
  assert(!f.s.abilityCooldowns['combined-assault']);
}
for (const invalidate of [f=>f.p.tamedCompanion={...f.p.tamedCompanion},f=>f.p.tamedCompanion.hp=0,f=>f.p.tamedCompanion.dismissed=true,f=>f.s.companion.x=-10]) {
  const f=fixture('Ranger',{beastmaster:1},['combined-assault']); f.pet(); f.cast('combined-assault'); f.api.updateCombatCompanions(f.now,0); invalidate(f); f.drain();
  assert.equal(f.damage.length,1,'a replaced/dead/dismissed/out-of-range pet loses its pending hit while the owner shot still lands');
  assert.equal(f.damage[0].amount,Math.round(autoAttackDamage('Ranger',combatStats(f.p))*1.5));
}
for (const invalidate of [f=>f.p.hp=0,f=>f.s.lifeStartedAt++,f=>f.s.instanceId='elsewhere',f=>f.enemy.respawnAt++,f=>f.s.socket.readyState=3]) {
  const f=fixture('Ranger',{beastmaster:1},['combined-assault']); f.pet(); f.cast('combined-assault'); f.api.updateCombatCompanions(f.now,0); invalidate(f); f.drain();
  assert.equal(f.damage.length,0,'owner death/transition/logout or target respawn cancels both Combined Assault hits');
}
for (const invalidate of [f=>f.p.tamedCompanion={...f.p.tamedCompanion},f=>f.p.tamedCompanion.hp=0,f=>f.s.instanceId='elsewhere',f=>f.p.hp=0]) {
  const f=fixture('Ranger',{beastmaster:1,everlastingBond:2}),pet=f.pet(); pet.nextAttackAt=f.now;
  f.s.autoAttack={enemy:f.enemy}; f.api.updateCombatCompanions(f.now,0); assert(f.c.pendingHits.some(hit=>hit.companionBasic));
  invalidate(f); f.drain(); assert.equal(f.damage.length,0,'stale companion basics cancel after replacement/death/transition');
  assert(!pet.bondReady,'cancelled companion basics cannot prime Bond');
}

{
  const f=fixture('Ranger',{beastmaster:1,everlastingBond:2}),pet=f.pet(); pet.saved.hp=321; pet.bondReady=true; pet.nextAttackAt=f.now;
  f.s.autoAttack={enemy:f.enemy}; f.api.updateCombatCompanions(f.now,0); assert(f.c.pendingHits.some(hit=>hit.companionBasic));
  f.c.waterAt=()=>true; f.drain(); assert.equal(f.damage.length,0,'entering water cancels already queued companion damage');
  assert.equal(f.api.activeCompanion(f.s,f.now),null,'companions cannot attack while the owner swims');
  assert.equal(f.p.tamedCompanion.hp,321,'swimming suspension preserves saved health');
  f.api.updateCombatCompanions(f.now+2000,2); assert.equal(f.c.pendingHits.length,0,'swimming cannot queue fresh companion attacks');
  f.c.waterAt=()=>false; const restored=f.api.activeCompanion(f.s,f.now);
  assert(restored && restored!==pet); assert.equal(restored.saved,pet.saved); assert.equal(restored.saved.hp,321);
  assert(!restored.bondReady && restored.target===null,'returning to dry land creates a fresh combat identity without stale Bond/target state');
}

{
  const f=fixture('Ranger',{beastmaster:1}),pet=f.pet(); f.enemy.kind='training-dummy';
  f.s.autoAttack={enemy:f.enemy}; pet.nextAttackAt=f.now; f.api.updateCombatCompanions(f.now,0);
  assert(f.c.pendingHits.some(hit=>hit.companionBasic));
  f.stopAutoAttack(); f.drain(); f.api.updateCombatCompanions(f.now+3000,0);
  assert.equal(f.damage.length,0); assert.equal(f.c.pendingHits.length,0);
  assert.equal(pet.target,null,'stop attacking also calls the companion off an immortal training dummy');
}

// Baseline action and life guards: every proc must keep using these authoritative checks.
for (const invalidate of [f => f.s.socket.readyState = 3, f => f.s.lifeStartedAt++, f => f.enemy.respawnAt++,
  f => f.s.instanceId = 'elsewhere', f => f.enemy.instanceId = 'elsewhere', f => f.enemy.alive = false,
  f => f.p.hp = 0, f => f.s.expiresAt = f.now]) {
  const f = fixture('Mage', { arcaneEcho: 1 }); f.alwaysRoll(0);
  const hit = f.release('arcane-missile'); invalidate(f); f.resolve(hit.dueAt);
  assert.equal(f.damage.length, 0, 'invalid source/target lifecycle blocks impact and procs');
  assert.equal(f.c.pendingHits.length, 0, 'invalid impact cannot generate children');
}

for (const invalidate of [f => f.c.sessions.delete(f.p.id), f => f.s.lifeStartedAt++, f => f.enemy.respawnAt++,
  f => f.s.instanceId = 'elsewhere', f => f.p.hp = 0]) {
  const f = fixture('Mage', { arcaneEcho: 1 }); f.alwaysRoll(0);
  const initial = f.release('arcane-missile'); f.resolve(initial.dueAt);
  assert.equal(f.damage.length, 1); assert(f.c.pendingHits.length, 'repeat waits for its own impact');
  invalidate(f); f.drain(); assert.equal(f.damage.length, 1, 'pending procs cannot cross logout, death, respawn or instance boundaries');
}

{
  const f = fixture('Mage', { arcaneEcho: 1 }); f.random(0, .99);
  const victim = { ...f.p, id: 'opponent', name: 'Opponent', hp: 10000, x: 2 };
  const recipient = { ...f.s, player: victim, abilityCooldowns: {} };
  f.c.sessions.set(victim.id, recipient); f.c.worldPvp = () => true;
  f.release('arcane-missile', victim); f.drain();
  assert.equal(f.damage.length, 2, 'PvP runs the same proc pipeline before its damage branch returns');
  assert(f.damage.every(hit => hit.target === victim.id));
  const frost = fixture('Mage', { chilled: 1 }); frost.enemy.kind = 'training-dummy';
  const hit = frost.release('comet-shower'); frost.resolve(hit.dueAt);
  assert(frost.api.chilledTarget(frost.enemy, frost.now), 'training dummies exercise talent procs');
  f.s.talentChill = { until: f.now + 4000, life: 1 };
  f.s.combatTalents = { heat: 10, heatUntil: f.now + 6000, twinshotReadyUntil: f.now + 10000 };
  f.release('arcane-missile', victim); f.api.cancelPlayerCombat(f.s);
  assert.equal(f.c.pendingHits.length, 0, 'combat cleanup removes owned pending projectiles and procs');
  assert(!f.s.combatTalents && !f.s.talentChill, 'combat cleanup removes ephemeral heat, readiness and player Chill');
}

{
  const f = fixture('Mage'); f.s.instanceId = 'collision-check';
  const vertices=new Float32Array([-.5,-.5,-.5,.5,-.5,-.5,.5,.5,-.5,-.5,.5,-.5,-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5]);
  const indices=new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);
  const buffer=new ArrayBuffer(vertices.byteLength+indices.byteLength);
  new Float32Array(buffer,0,vertices.length).set(vertices);new Uint32Array(buffer,vertices.byteLength,indices.length).set(indices);
  await installCollisionScene('mobility-check',{shapes:[{vertexOffset:0,vertexCount:8,indexOffset:vertices.byteLength,indexCount:indices.length}],instances:[
    {shape:0,matrix:[40,0,0,0,0,.2,0,0,0,0,40,0,0,-.1,0,1]},
    {shape:0,matrix:[2,0,0,0,0,4,0,0,0,0,2,0,0,2,5,1],state:{key:'wall',value:true}},
  ]},buffer);
  updateCollisionSceneState('mobility-check',{wall:true});
  f.s.jump=newJump(0,0,true,'mobility-check');f.c.moveJump=moveJump;f.c.collisionScene=()=> 'mobility-check';
  f.c.instanceBounds = () => ({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 });
  f.c.playerRouteAllowed=(_session,from,to)=>canTraverse(from,to,[],f.c.instanceBounds());
  const blocked = f.api.mobilityDestination(f.s, 15);
  assert(blocked.z > 3 && blocked.z < 4, 'Blink and Roll stop before a solid collider along their full swept route');
  f.p.rotation = Math.PI / 2; assert.equal(f.api.mobilityDestination(f.s, 15).x, 15, 'utility movement follows authoritative facing');
  f.p.rotation = 0; updateCollisionSceneState('mobility-check',{wall:false}); f.c.instanceBounds = () => ({ minX: -20, maxX: 20, minZ: -20, maxZ: 6 });
  assert(f.api.mobilityDestination(f.s, 15).z < 6, 'utility movement respects room bounds');
  disposeCollisionScene('mobility-check');
}

// Rank boundaries and lifecycle guards use the actual Edict functions with deterministic rolls.
for (const [rank, chance] of [[1, .07], [2, .15]]) {
  for (const roll of [chance - .001, chance]) {
    const f = fixture('Cleric', { edictHarm: 1, bouncingEdicts: rank });
    f.c.enemies.push({ ...f.enemy, id: 'bounce-target', x: 4, threat: new Map() });
    f.alwaysRoll(roll);
    f.api.applyEdict(f.s, f.enemy, 'harm', 100, f.now);
    f.api.triggerEdicts(f.enemy, 'damage', f.now); f.drain();
    assert.equal(f.damage.length, roll < chance ? 3 : 1, `Bouncing Edicts rank ${rank} uses its authored chance and stops after two repeats`);
    assert.equal(f.enemy.edicts.size, 0, 'a bouncing Harm proc does not recursively mark its own target');
  }
}
for (const rank of [1, 2]) {
  const f = fixture('Cleric', { edictHarm: 1, blanketEdicts: rank });
  f.c.enemies.push(...Array.from({ length: 5 }, (_, index) => ({ ...f.enemy, id: `spread-${index}`, x: index + 3, threat: new Map() })));
  f.api.applyEdict(f.s, f.enemy, 'harm', 100, f.now);
  f.api.triggerEdicts(f.enemy, 'damage', f.now); f.drain();
  const marked = f.c.enemies.filter(target => target !== f.enemy && target.edicts?.size);
  assert.equal(marked.length, rank === 1 ? 1 : 3, `Blanket Edicts rank ${rank} spreads to its authored target count`);
  assert(marked.every(target => [...target.edicts.values()][0].power === rank * 10), 'spread power is ten/twenty percent');
  f.api.triggerEdicts(marked[0], 'damage', f.now); f.drain();
  assert.equal([...f.enemy.edicts.values()][0].power, rank ** 2, 'a weaker copy can spread again on a later independent hit, losing power each time');
  assert(!f.c.enemies[4].edicts?.size, 'one trigger does not recursively activate neighboring copies');
}
for (const rank of [1, 2]) for (const roll of [rank * .05 - .001, rank * .05]) {
  const f = fixture('Cleric', { edictHarm: 1, renewableEdict: rank }); f.alwaysRoll(roll);
  f.api.applyEdict(f.s, f.enemy, 'harm', 100, f.now);
  f.api.triggerEdicts(f.enemy, 'damage', f.now); f.drain();
  assert.equal(f.enemy.edicts.size, roll < rank * .05 ? 1 : 0, `Renewable Edict rank ${rank} uses its five/ten percent threshold`);
  assert.equal(f.damage.length, 1, 'a reapplication waits for the next external hit');
}
{
  const f = fixture('Cleric', { edictProtection: 1 }), damageDirect = runInNewContext(`(${extract('applyDamage')})`, f.c);
  f.api.applyEdict(f.s, f.p, 'protection', 100, f.now);
  const before = f.p.hp; damageDirect(f.p, 'player', 10, null, f.now);
  assert.equal(f.p.hp, before, 'Protection raised from no shield absorbs the triggering hit');
  assert.equal(f.s.shield.amount, 90);
  f.s.shield = null; f.api.applyEdict(f.s, f.p, 'protection', 100, f.now);
  damageDirect(f.p, 'player', f.p.hp, null, f.now, undefined, false, true, true);
  assert.equal(f.p.hp, 0, 'mandatory execution bypasses reactive Protection instead of reviving or shielding the target');
  assert.equal(f.s.shield, null);
  assert.match(source, /if\(execute\)session\.shield=null;applyDamage\(session\.player,'player',amount,session\.instanceId,at,source,false,execute === true,execute === true\)/, 'raid executions pass the forced-damage flag');
  assert.match(source, /applyDamage\(target\.player, 'player', target\.player\.hp, target\.instanceId, Date\.now\(\), undefined, false, true, true\)/, 'GM kill passes the forced-damage flag');
}
{
  const f = fixture('Cleric', { edictLight: 1 }), damageDirect = runInNewContext(`(${extract('applyDamage')})`, f.c);
  f.p.hp = 10; f.s.duel = {}; let ended = false; f.c.endDuel = () => { ended = true; };
  f.api.applyEdict(f.s, f.p, 'light', 100, f.now);
  damageDirect(f.p, 'player', 10, null, f.now);
  assert.equal(f.p.hp, 1, 'a lethal duel hit retains its protected one HP instead of activating a revival');
  assert(ended, 'Light cannot prevent the authoritative duel defeat');
}
{
  const f = fixture('Cleric', {}, ['edict-of-the-dawn']); f.p.hp = 1;
  const ally = { ...f.p, id: 'dawn-ally', x: 4 }, allySession = { ...f.s, player: ally, abilityCooldowns: {} };
  f.c.sessions.set(ally.id, allySession); f.c.friendlyTarget = () => true;
  f.release('edict-of-the-dawn', f.p);
  const mark = [...f.s.edicts.values()][0], started = f.now;
  f.resolve(started + 1999); assert.equal(f.p.hp, 1, 'Dawn has no premature periodic heal');
  f.resolve(started + 2000); assert.equal(f.p.hp, 1 + mark.power, 'Dawn heals at its first scheduled tick');
  f.api.triggerEdicts(f.p, 'damage', f.now, f.enemy);
  assert.equal(ally.hp, 1 + mark.power, 'Dawn pulses real healing into nearby friendly players');
  f.resolve(started + 12000); assert.equal(f.p.hp, 1 + mark.power * 7, 'Dawn includes six periodic ticks and one triggered pulse over twelve seconds');
  f.resolve(started + 20000); assert.equal(f.p.hp, 1 + mark.power * 7, 'Dawn stops at twelve seconds');
}
for (const invalidate of [f => f.s.socket.readyState = 3, f => f.s.lifeStartedAt++, f => f.enemy.respawnAt++,
  f => f.s.instanceId = 'elsewhere', f => f.enemy.instanceId = 'elsewhere', f => f.p.hp = 0, f => f.p.talents = []]) {
  const f = fixture('Cleric', { edictHarm: 1 }); f.api.applyEdict(f.s, f.enemy, 'harm', 100, f.now);
  invalidate(f); f.api.triggerEdicts(f.enemy, 'damage', f.now); f.drain();
  assert.equal(f.damage.length, 0, 'Edicts cannot survive source death/logout or a source/target life or instance change');
}

for (const ability of ['tame-beast', 'combined-assault', 'twinshot', 'venom-detonation', 'arcane-volley', 'combustion', 'shatter', 'edict-of-the-dawn', 'titans-edict', 'eternal-edict']) {
  const f = fixture(SPELLS[ability].className); f.cast(ability);
  assert(!f.s.casting && !f.c.pendingHits.length, 'the action handler rejects a capstone without its talent even if present in learned spells');
}

console.log('PASS feedback combat server: Tame eligibility/completion, normalized companion hits/heal mirroring/lifecycle, ranged companion pursuit/Combined Assault, PvP companion targeting/damage/control/identity, Bond ranks, 16-second Combined Assault, Arrowstorm stacking/timing/expiry, Twinshot chance/reset/instant casts, rolling venom/detonation ownership, bounded Arcane Echo/seven missiles, Burning cast/tick speed and expiry, Chilled/Ice Lance/Shatter, Edict rank thresholds/spread bounds/Dawn timing, and authoritative lifecycle guards.');
