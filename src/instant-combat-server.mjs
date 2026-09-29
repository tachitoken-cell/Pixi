import { randomUUID } from 'node:crypto';
import { INSTANT_COMBAT, INSTANT_COMBAT_WAVES, INSTANT_COMBAT_BRACKETS, INSTANT_COMBAT_CREATURES, INSTANT_COMBAT_BROOD_NEST, instantCombatBracket, instantCombatSchedule, instantCombatEncounter } from './instant-combat.ts';
import { monsterStatsAtLevel } from './bestiary.ts';
import { instantCombatMap, instantCombatPosition } from './instant-combat-maps.ts';
import { raidHazardContains } from './raid.ts';
import { findPath } from './navigation.ts';
import { WALK_SPEED } from './travel.ts';
import { createInstantCombatSkills } from './instant-combat-boss-skills.mjs';

const actions = new Set(['instantCombatRegister', 'instantCombatUnregister', 'instantCombatLeave']);

/** Realm-local events use the existing combat actors and authoritative world clock. */
export function createInstantCombatController(ctx) {
  const registrations = new Map(), runs = new Map(), membership = new Map();
  let startsAt = instantCombatSchedule(ctx.now ?? Date.now()).startsAt, announced = false;
  const bySession = session => membership.get(session?.player.id);
  const present = run => [...run.members].map(id => ctx.sessions.get(id)).filter(session => session?.instanceId === run.id);
  const living = run => present(run).filter(session => ctx.live(session) && session.player.hp > 0);
  const remaining = run => ctx.enemies.filter(enemy => enemy.instanceId === run.id && enemy.alive).length;
  const objectiveActors = run => ctx.enemies.filter(enemy => enemy.instanceId === run.id && enemy !== run.boss && enemy.alive && enemy.hp > 0);
  const tell = (run, text) => { run.objective = text; for (const session of present(run)) ctx.event(session, text); };
  const skills = createInstantCombatSkills({ ...ctx, living, spawn, tell });
  function removeEnemies(run) {
    for (let index = ctx.enemies.length - 1; index >= 0; index--) if (ctx.enemies[index].instanceId === run.id) {
      ctx.cancelEnemy(ctx.enemies[index]); ctx.enemies.splice(index, 1);
    }
  }
  function leave(session, reason = 'You left Instant Combat. Collected belongings remain yours.') {
    registrations.delete(session.player.id);
    const run = bySession(session);
    if (!run) return false;
    membership.delete(session.player.id); run.members.delete(session.player.id);
    ctx.removeRewards?.(run.id, session.player.id);
    ctx.cancel(session);
    const point = session.returnPosition;
    session.instanceId = null; session.returnPosition = null;
    if (point) Object.assign(session.player, point);
    if (session.player.hp <= 0) { session.player.hp = session.player.maxHp; session.player.diedAt = 0; }
    ctx.correct(session, reason); ctx.event(session, reason);
    if (!run.members.size) { removeEnemies(run); runs.delete(run.id); }
    ctx.dirty(); return true;
  }
  function finish(run, phase, now, text) {
    skills.clear(run);
    run.phase = phase; run.phaseEndsAt = now + INSTANT_COMBAT.returnMs;
    run.hazards = []; run.runes = []; run.mechanic = null; run.mechanicEndsAt = 0;
    removeEnemies(run); run.boss = null;
    if (phase === 'failed') ctx.removeRewards?.(run.id);
    for (const session of present(run)) ctx.cancel(session);
    tell(run, text);
    ctx.dirty();
  }
  function spawn(run, creature, point, now, hpScale = 1, role, damageScale = 1) {
    point = instantCombatPosition(run.mapId, point.x, point.z, role === 'boss' ? 2 : 1);
    const level = Math.min(run.bracket.maxLevel, run.level + run.round - 1), stats = monsterStatsAtLevel(creature.kind, level);
    const enemy = { id: `${run.id}-${run.round}-${randomUUID()}`, instantCombat: true, instanceId: run.id, ...creature,
      ...(role ? { instantCombatRole: role, dungeonBoss: role === 'boss' } : {}), level, zone: 'hollow', ...point, homeX: point.x, homeZ: point.z,
      hp: Math.max(1, Math.round(stats.hp * hpScale)), maxHp: Math.max(1, Math.round(stats.hp * hpScale)), damageScale, defenseBypass: INSTANT_COMBAT.defenseBypass[run.round - 1], alive: true, diedAt: 0, respawnAt: Infinity,
      lastAttack: now, rotation: 0, attack: null, participants: new Set(), threat: new Map(), target: null };
    ctx.enemies.push(enemy); return enemy;
  }
  function startSubwave(run, now) {
    removeEnemies(run); run.subwave++;
    const map = instantCombatMap(run.mapId), creatures = INSTANT_COMBAT_CREATURES[run.mapId];
    if (run.round === INSTANT_COMBAT.rounds && run.subwave === INSTANT_COMBAT.subwaves) {
      const creature = creatures.bosses.find(boss => boss.model === run.bossModel);
      run.boss = spawn(run, creature, map.boss, now, 3 + run.size * 1.5, 'boss');
      run.bossPhase = 'combat'; run.bossStep = 0; run.nextAbility = now + 3000; run.abilityIndex = 0;
      tell(run, `${run.boss.name}: ${creature.instruction} Each shield has 45 seconds${creature.mechanic === 'charge' ? ', with extra travel time if needed' : ''}.`);
    } else {
      const wave = INSTANT_COMBAT_WAVES[Math.min(run.round, INSTANT_COMBAT_WAVES.length) - 1], count = Math.max(wave.minimum, Math.ceil(run.size * wave.perPlayer));
      const level = Math.min(run.bracket.maxLevel, run.level + run.round - 1), benchmark = monsterStatsAtLevel('briar-sentinel', level);
      for (let index = 0; index < count; index++) {
        const angle = index / count * Math.PI * 2, radius = map.waveRadius - index % 3;
        const creature = creatures.waves[run.round <= 2 ? run.round - 1 : index % 2], stats = monsterStatsAtLevel(creature.kind, level);
        spawn(run, creature, { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius }, now,
          wave.hp * (1 + .025 * (run.size - 1)) * benchmark.hp / stats.hp, undefined, wave.damage * benchmark.damage / stats.damage);
      }
      tell(run, `Instant Combat: round ${run.round} of ${INSTANT_COMBAT.rounds}, group ${run.subwave} of ${INSTANT_COMBAT.subwaves}. Defeat every enemy.`);
    }
    ctx.dirty();
  }
  function startWave(run, now) {
    run.round++; run.subwave = 0; run.phase = 'fighting'; run.phaseEndsAt = 0;
    startSubwave(run, now);
  }
  const mechanicPoint = (run, index, count, radius = instantCombatMap(run.mapId).mechanicRadius) => {
    const angle = index / count * Math.PI * 2;
    return instantCombatPosition(run.mapId, Math.sin(angle) * radius, Math.cos(angle) * radius, 3);
  };
  const marker = (run, point, kind, label, extra = {}) => ({ id: randomUUID(), ...point, kind, label, r: 3, charge: 0, active: true, ...extra });
  const hurt = (run, team, fraction, now) => {
    for (const session of team) ctx.damage(session, Math.max(1, Math.round(session.player.maxHp * fraction)), now, run.boss);
  };
  const facingAway = (player, boss) => {
    const dx = boss.x - player.x, dz = boss.z - player.z, length = Math.hypot(dx, dz);
    return length > 1 && (Math.sin(player.rotation) * dx + Math.cos(player.rotation) * dz) / length < -.2;
  };
  function mechanicRound(run, now) {
    const m = run.mechanic, count = Math.min(4, Math.ceil(run.size / 5)), index = m.progress;
    run.runes = [];
    if (m.kind === 'stomps') {
      run.runes.push(marker(run, mechanicPoint(run, index, m.goal), 'soak', `Soak stomp ${index + 1}`, { r: 3.5 }));
      m.nextAt = now + 6500;
      tell(run, `Armor Break ${index + 1}/${m.goal}: stand inside the gold circle when the stomp lands. One player is enough.`);
    } else if (m.kind === 'brood') {
      for (let i = 0; i < count; i++) spawn(run, INSTANT_COMBAT_BROOD_NEST, mechanicPoint(run, i, count), now, Math.max(.65, run.size / count * .45), 'anchor');
      m.nextAt = now + 10000;
      tell(run, `Brood ${index + 1}/${m.goal}: destroy the nests before they hatch in 10 seconds, then clear any surviving scarabs.`);
    } else if (m.kind === 'webs') {
      for (const session of living(run)) run.runes.push(marker(run, { x: session.player.x, z: session.player.z }, 'web', 'Move 6m to sever', { r: 6, playerId: session.player.id }));
      m.nextAt = now + 8000;
      tell(run, `Severed Web ${index + 1}/${m.goal}: every marked player must move 6 meters from their web origin before it collapses.`);
    } else if (m.kind === 'charge') {
      const target = living(run)[index % living(run).length];
      if (!target) return;
      // These authored lanes have space beyond their pillar. Select by a real walking route from the marked player.
      const map = instantCombatMap(run.mapId);
      const placements = [0, 2, 5, 8, 12, 14].map(index => {
        const angle = index / 16 * Math.PI * 2;
        const point = instantCombatPosition(run.mapId, Math.sin(angle) * 10, Math.cos(angle) * 10, 1);
        const bait = instantCombatPosition(run.mapId, Math.sin(angle) * 17, Math.cos(angle) * 17, .4);
        const path = findPath(target.player, bait, map.colliders, map.bounds);
        let length = 0, previous = target.player;
        for (const next of path) { length += Math.hypot(next.x - previous.x, next.z - previous.z); previous = next; }
        return { point, bait, length: path.length ? length : Infinity };
      }).sort((a, b) => a.length - b.length);
      const { point, bait, length } = placements[0];
      if (!Number.isFinite(length)) {
        m.stage = 'position'; m.nextAt = now + 1000;
        tell(run, 'Move toward the central ritual platform so the boss can mark a reachable charge lane.'); return;
      }
      const pillar = spawn(run, { ...INSTANT_COMBAT_CREATURES[run.mapId].anchor, name: 'Umbral Pillar' }, point, now, 1, 'anchor');
      pillar.instantCombatInvulnerable = true; m.pillarId = pillar.id; m.targetId = target.player.id; m.stage = 'aim';
      run.runes.push(marker(run, bait, 'bait', `${target.player.name || 'Marked player'}: bait here`, { r: 1.5, playerId: target.player.id }));
      const aimMs = Math.max(6000, Math.ceil(length / WALK_SPEED * 1000) + 1000);
      run.mechanicEndsAt += aimMs - 6000;
      m.nextAt = now + aimMs;
      tell(run, `Pillar ${index + 1}/${m.goal}: the marked player must stand beyond the pillar at the gold marker. When the red lane locks, dodge it!`);
    } else if (m.kind === 'gaze') {
      m.nextAt = now + 5000;
      tell(run, `Eclipse Gaze ${index + 1}/${m.goal}: turn your character away from the boss before the gaze lands. Everyone must look away together.`);
    }
    if (m.nextAt) run.boss.attack = { id: randomUUID(), name: m.label, style: m.kind === 'charge' ? 'charge' : 'pulse',
      startedAt: now, impactAt: m.nextAt, endsAt: m.nextAt, x: run.boss.x, z: run.boss.z, radius: 0, rotation: run.boss.rotation };
  }
  function beginMechanic(run, now) {
    skills.clear(run);
    const count = Math.min(3, Math.ceil(run.size / 7)), kind = run.boss.mechanic;
    run.bossStep++; run.bossPhase = 'mechanic';
    run.hazards = []; run.runes = []; run.mechanicEndsAt = now + INSTANT_COMBAT.mechanicMs; run.lastRuneAt = now;
    const labels = { anchors: 'Bone Chains', stomps: 'Armor Break', notes: 'Funeral Melody', brood: 'Hatching Brood', rifts: 'Rift Sealing', webs: 'Severed Web', charge: 'Pillar Shatter', gaze: 'Eclipse Gaze' };
    const goal = ['anchors', 'rifts'].includes(kind) ? count + run.bossStep - 1 : ['stomps', 'notes'].includes(kind) ? 2 + run.bossStep : 1 + run.bossStep;
    run.mechanic = { kind, label: labels[kind], progress: 0, goal, nextAt: 0 };
    ctx.cancelEnemy(run.boss); run.boss.attack = null;
    if (kind === 'anchors') {
      for (let i = 0; i < goal; i++) spawn(run, { ...INSTANT_COMBAT_CREATURES[run.mapId].anchor, name: 'Bone Chain' }, mechanicPoint(run, i, goal), now, Math.max(1, run.size / goal * .7), 'anchor');
      tell(run, `Bone Chains: destroy all ${goal} chains to break ${run.boss.name}'s shield within 45 seconds.`);
    } else if (kind === 'notes' || kind === 'rifts') {
      for (let i = 0; i < goal; i++) run.runes.push(marker(run, mechanicPoint(run, i, goal), kind === 'notes' ? 'ordered' : 'charge', kind === 'notes' ? `Note ${i + 1}` : 'Seal rift', { active: kind !== 'notes' || i === 0 }));
      tell(run, kind === 'notes' ? `Funeral Melody: charge notes 1–${goal} in order, 1.5 seconds each. A wrong note hurts and resets the active note's charge.` : `Rift Sealing: stand in each blue rift for 3 seconds. Every rift keeps its progress when you move away.`);
    } else mechanicRound(run, now);
    ctx.dirty();
  }
  function clearMechanic(run, now) {
    run.bossPhase = run.bossStep === 2 ? 'final' : 'combat'; run.mechanicEndsAt = 0; run.nextAbility = now + 3000;
    run.runes = []; run.hazards = []; run.mechanic = null;
    ctx.cancelEnemy(run.boss); run.boss.attack = null;
    tell(run, run.bossStep === 2 ? 'The final shield is broken. Defeat the boss and dodge its faster attacks!' : 'The shield is broken. Attack the boss!');
    ctx.dirty();
  }
  function resolveMechanic(run, now) {
    const m = run.mechanic;
    if (!m) return;
    const team = living(run), elapsed = Math.max(0, Math.min(250, now - run.lastRuneAt)); run.lastRuneAt = now;
    const inside = rune => team.filter(session => Math.hypot(session.player.x - rune.x, session.player.z - rune.z) <= rune.r);
    if (m.kind === 'charge' && m.stage === 'aim' && team.length && !team.some(session => session.player.id === m.targetId)) {
      const pillar = objectiveActors(run).find(enemy => enemy.id === m.pillarId);
      if (pillar) { pillar.hp = 0; pillar.alive = false; ctx.cancelEnemy(pillar); }
      mechanicRound(run, now); return;
    }
    if (m.kind === 'anchors') m.progress = m.goal - objectiveActors(run).length;
    else if (m.kind === 'notes' || m.kind === 'rifts') {
      const wrong = m.kind === 'notes' ? run.runes.flatMap((rune, index) => index > m.progress ? inside(rune) : []) : [];
      if (wrong.length && now >= (m.wrongAt || 0)) {
        hurt(run, [...new Set(wrong)], .1, now); m.wrongAt = now + 1000;
        if (run.runes[m.progress]) run.runes[m.progress].charge = 0;
      }
      for (const [index, rune] of run.runes.entries()) {
        if (m.kind === 'notes' && (index !== m.progress || wrong.length)) continue;
        const duration = m.kind === 'notes' ? 1500 : INSTANT_COMBAT.runeChargeMs;
        if (inside(rune).length) rune.charge = Math.min(1, (Math.round(rune.charge * duration) + elapsed) / duration);
      }
      m.progress = run.runes.filter(rune => rune.charge >= 1).length;
      if (m.kind === 'notes') run.runes.forEach((rune, index) => { rune.active = index === m.progress; });
    } else if (m.kind === 'brood') {
      if (m.nextAt && now >= m.nextAt) {
        const nests = objectiveActors(run).filter(enemy => enemy.model === INSTANT_COMBAT_BROOD_NEST.model);
        for (const nest of nests) {
          nest.hp = 0; nest.alive = false; nest.diedAt = m.nextAt; ctx.cancelEnemy(nest);
          for (const side of [-1, 1]) spawn(run, INSTANT_COMBAT_CREATURES[run.mapId].waves[1], { x: nest.x + side * 1.5, z: nest.z }, m.nextAt, .65);
        }
        m.nextAt = 0;
        if (nests.length) tell(run, 'The nests hatched! Defeat every scarab to clear this brood batch.');
      }
      if (!objectiveActors(run).length) { m.progress++; if (m.progress < m.goal) mechanicRound(run, now); }
    } else if (m.kind === 'webs') {
      run.runes = run.runes.filter(rune => team.some(session => session.player.id === rune.playerId));
      for (const rune of run.runes) {
        const player = team.find(session => session.player.id === rune.playerId).player;
        if (Math.hypot(player.x - rune.x, player.z - rune.z) >= rune.r) { rune.charge = 1; rune.active = false; }
      }
      if (team.length && run.runes.every(rune => rune.charge >= 1)) {
        m.progress++; if (m.progress < m.goal) mechanicRound(run, now);
      } else if (now >= m.nextAt) {
        hurt(run, team.filter(session => run.runes.some(rune => rune.playerId === session.player.id && rune.charge < 1)), .3, m.nextAt);
        mechanicRound(run, now);
      }
    } else if (m.kind === 'stomps' && now >= m.nextAt) {
      const soaking = inside(run.runes[0]);
      if (soaking.length) { hurt(run, soaking, .08, m.nextAt); m.progress++; }
      else hurt(run, team, .2, m.nextAt);
      if (m.progress < m.goal) mechanicRound(run, now);
    } else if (m.kind === 'gaze' && now >= m.nextAt) {
      const caught = team.filter(session => !facingAway(session.player, run.boss));
      if (team.length && !caught.length) m.progress++;
      else hurt(run, caught, .2, m.nextAt);
      if (m.progress < m.goal) mechanicRound(run, now);
    } else if (m.kind === 'charge' && now >= m.nextAt) {
      if (m.stage === 'aim') {
        const target = team.find(session => session.player.id === m.targetId) || team[0];
        if (!target) return;
        const boss = run.boss, rotation = Math.atan2(target.player.x - boss.x, target.player.z - boss.z), impactAt = m.nextAt + 3000;
        const hazard = { id: randomUUID(), sourceId: boss.id, kind: 'Umbral Charge', label: 'Umbral Charge · Dodge the locked lane', plane: 'arena', shape: 'line',
          x: boss.x + Math.sin(rotation) * 17, z: boss.z + Math.cos(rotation) * 17, r: 0, width: 4, length: 34, rotation,
          startedAt: m.nextAt, impactAt, endsAt: impactAt + 600, damage: .6 };
        run.hazards.push(hazard); m.hazardId = hazard.id; m.stage = 'impact'; m.nextAt = impactAt;
        boss.rotation = rotation;
        boss.attack = { id: hazard.id, name: hazard.label, style: 'charge', startedAt: hazard.startedAt, impactAt, endsAt: hazard.endsAt,
          x: boss.x, z: boss.z, radius: 0, rotation, targetId: target.player.id };
        tell(run, 'The charge lane is locked! Dodge out; the lane must strike the Umbral Pillar to break it.');
      } else {
        const pillar = objectiveActors(run).find(enemy => enemy.id === m.pillarId), hazard = run.hazards.find(h => h.id === m.hazardId);
        if (pillar && hazard && raidHazardContains(hazard, pillar)) {
          pillar.hp = 0; pillar.alive = false; pillar.diedAt = m.nextAt; ctx.cancelEnemy(pillar); m.progress++;
        } else if (pillar) { pillar.hp = 0; pillar.alive = false; ctx.cancelEnemy(pillar); }
        if (m.progress < m.goal) mechanicRound(run, now);
      }
    }
    if (m.progress >= m.goal) clearMechanic(run, now);
  }
  function resolveRun(run, now) {
    if (run.phase !== 'fighting' || !run.boss) return;
    if (!run.boss.alive || run.boss.hp <= 0) { skills.clear(run); return; }
    skills.resolve(run, now);
    if (run.mechanicEndsAt && now >= run.mechanicEndsAt) {
      finish(run, 'failed', run.mechanicEndsAt, `Instant Combat failed: ${run.mechanic.label} was not cleared before the boss ritual finished.`); return;
    }
    for (const hazard of run.hazards) {
      if (hazard.skill || hazard.resolved || hazard.impactAt > now) continue;
      hazard.resolved = true;
      if (!run.boss.alive || run.boss.hp <= 0) continue;
      for (const session of living(run)) if (raidHazardContains(hazard, session.player))
        ctx.damage(session, Math.max(1, Math.round(session.player.maxHp * hazard.damage)), hazard.impactAt, run.boss);
    }
    if (run.boss.attack?.endsAt <= now) run.boss.attack = null;
    resolveMechanic(run, now);
    run.hazards = run.hazards.filter(hazard => hazard.endsAt > now);
  }
  function damageAllowed(enemy, amount, at, attacker) {
    if (!enemy.instantCombat) return amount;
    const run = runs.get(enemy.instanceId);
    if (!run || run.phase !== 'fighting' || !enemy.alive || enemy.hp <= 0) return 0;
    if (at >= run.expiresAt) { finish(run, 'failed', at, 'Instant Combat timed out. The event has ended.'); return 0; }
    resolveRun(run, at);
    if (run.phase !== 'fighting' || runs.get(run.id) !== run || !living(run).length || attacker?.player?.hp <= 0) return 0;
    if (enemy.instantCombatInvulnerable) return 0;
    if (enemy.skillObjective && enemy.trappedPlayerId === attacker?.player.id) return 0;
    if (enemy !== run.boss) return amount;
    if (run.mechanicEndsAt) return 0;
    const threshold = [70, 35][run.bossStep];
    return Math.max(0, Math.min(amount, enemy.hp - (threshold === undefined ? 0 : Math.floor(enemy.maxHp * threshold / 100))));
  }
  function lock(now) {
    const groups = new Map(INSTANT_COMBAT_BRACKETS.map(bracket => [bracket.id, []]));
    for (const session of registrations.values()) {
      if (!ctx.live(session)) continue;
      const bracket = instantCombatBracket(session.player.level);
      const error = !bracket ? 'Your level is outside the Instant Combat brackets.' : ctx.entryError(session);
      if (error || now - startsAt >= INSTANT_COMBAT.maxDurationMs) {
        ctx.event(session, error || 'This Instant Combat registration has expired. Join the next event.'); continue;
      }
      groups.get(bracket.id).push(session);
    }
    registrations.clear();
    for (const bracket of INSTANT_COMBAT_BRACKETS) {
      const group = groups.get(bracket.id);
      for (let offset = 0; offset < group.length; offset += INSTANT_COMBAT.maxPlayers) {
        const team = group.slice(offset, offset + INSTANT_COMBAT.maxPlayers);
        const { mapId, bossModel } = instantCombatEncounter(startsAt);
        const run = { id: `instant-combat-${randomUUID()}`, mapId, bossModel, bracket, members: new Set(), size: team.length,
          level: Math.max(bracket.minLevel, Math.round(team.reduce((sum, session) => sum + session.player.level, 0) / team.length)),
          phase: 'preparing', round: 0, subwave: 0, phaseEndsAt: now + INSTANT_COMBAT.preparationMs, expiresAt: now + INSTANT_COMBAT.maxDurationMs,
          boss: null, bossStep: 0, hazards: [], runes: [], mechanic: null, mechanicEndsAt: 0, objective: 'Prepare together. Five rounds of three groups await; the last group is the boss.' };
        runs.set(run.id, run);
        for (const [index, session] of team.entries()) {
          ctx.prepare(session);
          const p = session.player;
          session.returnPosition = { standingPosition:p.standingPosition, x: p.x, z: p.z, rotation: p.rotation, zone: p.zone };
          session.instanceId = run.id; run.members.add(p.id); membership.set(p.id, run);
          const spawn = instantCombatMap(mapId).spawn;
          Object.assign(p, instantCombatPosition(mapId, spawn.x + (index % 5 - 2) * 2, spawn.z + (Math.floor(index / 5) - 1.5) * 2), { rotation: 0, zone: 'hollow' });
          ctx.correct(session, `Instant Combat: prepare for ${INSTANT_COMBAT.preparationMs / 1000} seconds.`);
          ctx.event(session, 'Instant Combat registration closed. Prepare together; five rounds of three groups await. Enemies drop nothing. Clear all three groups for timed personal ground rewards.');
        }
      }
    }
    ctx.dirty();
  }
  function schedule(now) {
    if (now >= startsAt) {
      if (ctx.available()) lock(now);
      else { for (const session of registrations.values()) ctx.event(session, 'Instant Combat was cancelled for the realm restart.'); registrations.clear(); }
      startsAt = instantCombatSchedule(now).startsAt; announced = false;
    }
    if (!announced && ctx.available() && now >= startsAt - INSTANT_COMBAT.registrationMs) {
      announced = true;
      ctx.onRegistration?.(startsAt);
      for (const session of ctx.sessions.values()) if (ctx.live(session))
        ctx.event(session, 'Instant Combat begins in 5 minutes. Register from anywhere in the Instant Combat menu.');
    }
  }
  function startRegistration(now) {
    schedule(now);
    if (!ctx.available()) return 'Instant Combat cannot start while the realm is preparing to restart.';
    if (runs.size) return 'An Instant Combat run is already active. Wait until it has ended.';
    if (now >= startsAt - INSTANT_COMBAT.registrationMs) return 'Instant Combat registration is already open.';
    if (now + INSTANT_COMBAT.registrationMs > startsAt - INSTANT_COMBAT.registrationMs)
      return 'The scheduled Instant Combat signup opens in less than five minutes. Wait for that event.';
    startsAt = now + INSTANT_COMBAT.registrationMs; announced = false;
    schedule(now); ctx.dirty(); return null;
  }
  function handle(session, message, now) {
    if (!actions.has(message.type)) return false;
    if (Object.keys(message).length !== 1) { ctx.event(session, 'Invalid Instant Combat action.'); return true; }
    schedule(now);
    if (message.type === 'instantCombatLeave') { leave(session); return true; }
    if (message.type === 'instantCombatUnregister') { registrations.delete(session.player.id); return true; }
    if (!ctx.available() || now < startsAt - INSTANT_COMBAT.registrationMs || now >= startsAt) {
      ctx.event(session, 'Instant Combat registration opens five minutes before the next event.'); return true;
    }
    if (!ctx.live(session) || !instantCombatBracket(session.player.level) || bySession(session)) {
      ctx.event(session, 'Choose a level 16–60 character outside an active Instant Combat run.'); return true;
    }
    registrations.set(session.player.id, session);
    ctx.event(session, 'Registered for Instant Combat. Be alive and finish any duel or arena match before registration closes.');
    return true;
  }
  function tick(now) {
    schedule(now);
    for (const run of [...runs.values()]) {
      for (const id of [...run.members]) {
        const session = ctx.sessions.get(id);
        if (!session || session.instanceId !== run.id) { membership.delete(id); run.members.delete(id); continue; }
        if (!ctx.live(session) || session.player.hp <= 0) leave(session, session.player.hp <= 0
          ? 'You fell in Instant Combat and returned safely. You cannot rejoin this run.' : 'You disconnected from Instant Combat.');
      }
      if (!run.members.size) { removeEnemies(run); runs.delete(run.id); continue; }
      resolveRun(run, now);
      if (['completed', 'failed'].includes(run.phase)) {
        if (now >= run.phaseEndsAt) for (const session of present(run)) leave(session, 'Instant Combat ended. Returned to the world.');
      } else if (now >= run.expiresAt) finish(run, 'failed', now, 'Instant Combat timed out. The event has ended.');
      else if (run.phase === 'fighting' && !remaining(run)) {
        if (run.subwave < INSTANT_COMBAT.subwaves) { startSubwave(run, now); continue; }
        if (run.round === INSTANT_COMBAT.rounds) finish(run, 'completed', now, 'Instant Combat complete! Collect your personal final rewards within 30 seconds before returning.');
        else { run.phase = 'intermission'; run.phaseEndsAt = now + INSTANT_COMBAT.roundBreakMs;
          tell(run, `Wave ${run.round} cleared! Collect your personal ground rewards within 20 seconds, then prepare for the next round.`); }
        ctx.rewardWave?.(run, living(run), now, run.phaseEndsAt);
        ctx.dirty();
      } else if (['preparing', 'intermission'].includes(run.phase) && now >= run.phaseEndsAt) startWave(run, now);
      else if (run.phase === 'fighting' && run.boss?.alive) {
        if (!run.mechanicEndsAt && run.bossStep < 2 && run.boss.hp <= Math.floor(run.boss.maxHp * [70, 35][run.bossStep] / 100)) beginMechanic(run, now);
        else if (!run.mechanicEndsAt && now >= run.nextAbility) skills.cast(run, now);
      }
    }
  }
  return { handle, tick, leave, startRegistration, bySession, byInstance: id => runs.get(id), damageAllowed,
    actionError: (session, type, now) => skills.actionError(bySession(session), session, type, now),
    clearMovementImpairments: session => skills.clearMovementImpairments(bySession(session), session),
    recordAction: (session, type, now) => skills.recordAction(bySession(session), session, type, now),
    impacts: now => [...runs.values()].flatMap(run => run.phase !== 'fighting' ? [] : [
      ...run.hazards.filter(hazard => !hazard.skill && !hazard.resolved && hazard.impactAt <= now).map(hazard => hazard.impactAt),
      ...skills.impacts(run, now),
      ...(run.mechanic?.nextAt && run.mechanic.nextAt <= now ? [run.mechanic.nextAt] : []),
      ...(run.mechanicEndsAt && run.mechanicEndsAt <= now ? [run.mechanicEndsAt] : []),
    ]),
    resolve: now => { for (const run of runs.values()) resolveRun(run, now); },
    combatActive: id => !runs.has(id) || runs.get(id).phase === 'fighting',
    allies: (a, b) => !!bySession(a) && bySession(a) === bySession(b) && a.instanceId === b.instanceId,
    enemyKilled: enemy => enemy.instantCombat === true,
    publicState(session, now = Date.now()) {
      const run = bySession(session), bracket = run?.bracket || instantCombatBracket(session.player.level);
      return { startsAt, registrationOpensAt: startsAt - INSTANT_COMBAT.registrationMs,
        registrationOpen: ctx.available() && now >= startsAt - INSTANT_COMBAT.registrationMs && now < startsAt,
        registered: registrations.has(session.player.id), bracketId: bracket?.id || null,
        registeredCount: [...registrations.values()].filter(entry => ctx.live(entry) && instantCombatBracket(entry.player.level)?.id === bracket?.id).length,
        run: run ? { id: run.id, mapId: run.mapId, bossModel: run.bossModel, bracketId: run.bracket.id, minLevel: run.bracket.minLevel, maxLevel: run.bracket.maxLevel,
          phase: run.phase, round: run.round, totalRounds: INSTANT_COMBAT.rounds, subwave: run.subwave, totalSubwaves: INSTANT_COMBAT.subwaves, phaseEndsAt: run.phaseEndsAt,
          members: run.members.size, enemiesRemaining: remaining(run), objective: run.objective,
          control: skills.publicState(run, session),
          boss: run.boss ? { id: run.boss.id, name: run.boss.name, x: run.boss.x, z: run.boss.z, hp: run.boss.hp, maxHp: run.boss.maxHp,
            phase: run.bossPhase, shielded: !!run.mechanicEndsAt, endsAt: run.mechanicEndsAt } : null,
          mechanic: run.mechanic ? (({ kind, label, progress, goal, nextAt, targetId }) => ({ kind, label, progress, goal, nextAt, ...(targetId ? { targetId } : {}) }))(run.mechanic) : null,
          hazards: run.hazards.map(({ damage, resolved, ...hazard }) => hazard),
          runes: run.mechanic?.kind === 'gaze' ? living(run).map(({ player }) => ({ id: player.id, x: player.x, z: player.z, r: 1.2, kind: 'gaze',
            label: facingAway(player, run.boss) ? 'Ready' : 'Look away', charge: facingAway(player, run.boss) ? 1 : 0, playerId: player.id }))
            : run.runes.map(rune => { const player = rune.playerId ? ctx.sessions.get(rune.playerId)?.player : null;
              return { ...rune, ...(player ? { targetX: player.x, targetZ: player.z } : {}) }; }) } : null };
    },
    stop() { registrations.clear(); for (const run of [...runs.values()]) for (const session of present(run)) leave(session, 'The realm is restarting. Returned from Instant Combat.'); },
  };
}
