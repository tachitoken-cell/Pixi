import { randomUUID } from 'node:crypto';
import { INSTANT_COMBAT, INSTANT_COMBAT_CREATURES } from './instant-combat.ts';
import { INSTANT_COMBAT_SKILLS } from './instant-combat-skills.ts';
import { instantCombatMap, instantCombatPosition } from './instant-combat-maps.ts';
import { raidHazardContains } from './raid.ts';

// v12 supplies the rules and event times, but omits these server tuning values.
// Cage durability follows Bone Cage; beam geometry is from ic_skills.py.
export const IC_SKILL_TUNING = { cocoonHp: .02, beamWidth: 1.8, beamLength: 16, beamStart: 1.5, beamTickMs: 500, pullSpeed: 3,
  knockbackM: 5, lightEndRadius: 1.96, successfulToll: .6, successfulBomb: .9 };

/** The authored FX contain demonstration players, so only the server's actual
 * player positions, objectives and hazards are used to enforce these rules. */
export function createInstantCombatSkills(ctx) {
  const state = run => run.skillRuntime ||= { jobs: [], controls: new Map(), venom: new Map(), digest: new Map(), acidHitAt: new Map() };
  const team = run => ctx.living(run);
  const at = (run, when, action) => { state(run).jobs.push({ at: when, action }); };
  const player = (run, id) => team(run).find(session => session.player.id === id);
  const control = (run, session) => {
    const map = state(run).controls, id = session.player.id;
    if (!map.has(id)) map.set(id, {});
    return map.get(id);
  };
  const status = (run, session, kind, until) => {
    const entry = control(run, session); entry[`${kind}Until`] = Math.max(entry[`${kind}Until`] || 0, until);
    if (kind === 'stun' || kind === 'silence') ctx.interrupt?.(session, kind);
  };
  const hurt = (run, sessions, fraction, when, effect, duration = 0) => {
    for (const session of sessions) if (session.player.hp > 0 && session.instanceId === run.id) {
      ctx.damage(session, Math.max(1, Math.round(session.player.maxHp * fraction)), when, run.boss);
      if (session.player.hp > 0 && effect) status(run, session, effect, when + duration);
    }
  };
  const kill = (run, session, when) => {
    if (session?.player.hp > 0 && session.instanceId === run.id) ctx.kill(session, when, run.boss);
  };
  const point = (run, x, z, radius = .45) => instantCombatPosition(run.mapId, x, z, radius);
  const marker = (run, p, r, label, extra = {}) => {
    const rune = { id: randomUUID(), x: p.x, z: p.z, r, kind: 'soak', charge: 0, active: true, label, skill: true, ...extra };
    run.runes.push(rune); return rune;
  };
  const removeMarker = (run, rune) => { run.runes = run.runes.filter(item => item !== rune); };
  const hazard = (run, label, shape, geometry, from, impact, until = impact + 500) => {
    const h = { id: randomUUID(), sourceId: run.boss.id, kind: label, label, plane: 'arena', shape,
      x: run.boss.x, z: run.boss.z, r: 0, ...geometry, startedAt: from, impactAt: impact, endsAt: until, skill: true };
    run.hazards.push(h); return h;
  };
  const inside = (run, h) => team(run).filter(session => raidHazardContains(h, session.player));
  const target = (run, when) => ctx.target?.(run.boss, team(run), when) || team(run).slice().sort((a, b) => Math.hypot(a.player.x - run.boss.x, a.player.z - run.boss.z) - Math.hypot(b.player.x - run.boss.x, b.player.z - run.boss.z))[0];
  const every = (run, from, until, step, action) => { for (let time = from; time <= until; time += step) at(run, time, () => action(time)); };
  const push = (run, sessions, origin, distance, when) => {
    for (const session of sessions) {
      const dx = session.player.x - origin.x, dz = session.player.z - origin.z, length = Math.hypot(dx, dz) || 1, step = Math.max(-length, distance);
      ctx.displace?.(session, point(run, session.player.x + dx / length * step, session.player.z + dz / length * step), when);
    }
  };
  const line = (run, label, origin, rotation, width, length, from, impact) => hazard(run, label, 'line', {
    x: origin.x + Math.sin(rotation) * length / 2, z: origin.z + Math.cos(rotation) * length / 2, width, length, rotation }, from, impact);
  function trap(run, victim, name, fraction, from, timer, heal = 0) {
    if (!victim) return;
    const actor = ctx.spawn(run, { ...INSTANT_COMBAT_CREATURES[run.mapId].anchor, name }, point(run, victim.player.x + 1.5, victim.player.z), from, 1, 'anchor');
    actor.hp = actor.maxHp = Math.max(1, Math.round(run.boss.maxHp * fraction)); actor.skillObjective = true;
    actor.trappedPlayerId = victim.player.id;
    const retire = when => { actor.alive = false; actor.hp = 0; actor.diedAt = when; ctx.cancelEnemy?.(actor); };
    const entry = control(run, victim); entry.trapId = actor.id; entry.rootUntil = from + timer;
    const rune = marker(run, victim.player, 1.6, `${name}: rescue ${victim.player.name || 'ally'}`, { playerId: victim.player.id });
    every(run, from, from + timer, 100, when => {
      if (entry.trapId !== actor.id) return;
      if (!actor.alive || actor.hp <= 0 || !player(run, victim.player.id)) {
        if (actor.alive && actor.hp > 0) retire(when);
        entry.rootUntil = 0; delete entry.trapId; removeMarker(run, rune); return;
      }
      if (when >= from + timer) {
        kill(run, victim, when); run.boss.hp = Math.min(run.boss.maxHp, run.boss.hp + run.boss.maxHp * heal);
        retire(when); entry.rootUntil = 0; delete entry.trapId; removeMarker(run, rune);
      }
    });
  }
  function cast(run, now) {
    const list = INSTANT_COMBAT_SKILLS[run.boss.model], members = team(run);
    if (!list?.length || !members.length) return;
    const skill = list[run.abilityIndex++ % list.length], boss = run.boss, main = target(run, now) || members[0];
    const p = skill.params, origin = { x: boss.x, z: boss.z }, rotation = Math.atan2(main.player.x - boss.x, main.player.z - boss.z);
    const end = now + skill.castMs, events = name => skill.events.filter(event => event.name === name).map(event => now + event.ms);
    const event = name => events(name)[0], reach = extra => Math.max(end, extra), markAll = (r, text, extra = {}) => members.map(session => marker(run, session.player, r, text, { playerId: session.player.id, followId: session.player.id, ...extra }));
    let busyUntil = end;
    boss.rotation = rotation;
    boss.attack = { id: randomUUID(), name: skill.name, style: 'pulse', startedAt: now, impactAt: now + skill.events[0].ms,
      endsAt: end, x: boss.x, z: boss.z, radius: 0, rotation, targetId: main.player.id };
    ctx.tell(run, `${skill.name}: ${skill.rule}`);
    switch (skill.id) {
      case 'verdict': {
        const hit = event('slam'), h = hazard(run, skill.name, 'cone', { r: 14, angle: Math.PI, rotation }, event('telegraph'), hit);
        at(run, hit, () => hurt(run, inside(run, h), .85, hit, 'stun', 2000)); break;
      }
      case 'bone-cage': {
        const start = event('cages'); busyUntil = reach(start + p.timer_s * 1000);
        at(run, start, () => { for (const victim of team(run).slice(0, p.cages)) trap(run, victim, 'Bone Cage', p.cage_hp_pct_of_boss / 100, start, p.timer_s * 1000); }); break;
      }
      case 'grave-toll': {
        const rune = marker(run, point(run, main.player.x, main.player.z, p.radius_m), p.radius_m, 'Stack: Grave Toll');
        for (const hit of events('toll')) at(run, hit, () => {
          const soaking = team(run).filter(s => Math.hypot(s.player.x - rune.x, s.player.z - rune.z) <= rune.r);
          hurt(run, soaking, soaking.length === 1 ? .6 : soaking.length === 2 ? .4 : IC_SKILL_TUNING.successfulToll / Math.max(1, soaking.length), hit);
        }); at(run, end, () => removeMarker(run, rune)); break;
      }
      case 'earthsplitter': {
        events('slam').forEach((hit, wave) => {
          const lanes = Array.from({ length: p.lanes }, (_, i) => line(run, skill.name, origin, rotation + i * Math.PI / 2 + wave * Math.PI / 4, p.lane_width_m, p.length_m, events('telegraph')[wave], hit));
          at(run, hit, () => { const caught = team(run).filter(s => lanes.some(h => raidHazardContains(h, s.player))); hurt(run, caught, .6, hit);
            for (let tick = 1; tick <= 6; tick++) at(run, hit + tick * 1000, () => hurt(run, caught, .05, hit + tick * 1000)); });
        }); break;
      }
      case 'marrow-quake': {
        const hit = event('land'), h = hazard(run, skill.name, 'ring', { innerR: p.safe_radius_m, r: p.hit_radius_m }, event('telegraph'), hit);
        at(run, hit, () => hurt(run, inside(run, h), .7, hit, 'stun', 2000)); break;
      }
      case 'crushing-grip': {
        const start = event('weak_spot'); busyUntil = reach(start + p.timer_s * 1000);
        at(run, event('grab'), () => status(run, main, 'root', busyUntil));
        at(run, start, () => trap(run, player(run, main.player.id), 'Glowing Fist', p.weak_spot_pct / 100, start, p.timer_s * 1000)); break;
      }
      case 'silent-requiem': {
        const start = event('silence_start'), until = start + p.duration_s * 1000;
        hazard(run, 'Silent Requiem · Stop all actions', 'circle', { r: 50 }, start, until, until);
        at(run, start, () => { state(run).requiem = { until, punished: new Set() }; });
        at(run, until, () => { state(run).requiem = null; }); break;
      }
      case 'dirge-marks': {
        const hit = event('explode');
        members.slice(0, p.marks).forEach((session, i) => {
          const h = hazard(run, `${skill.name}: spread`, 'circle', { x: session.player.x, z: session.player.z, r: p.radius_m, followId: session.player.id }, events('mark')[i], hit);
          at(run, hit, () => hurt(run, inside(run, h), .6, hit));
        }); break;
      }
      case 'last-rites': {
        const start = event('channel'), finish = start + p.channel_s * 1000; busyUntil = reach(finish);
        const runes = Array.from({ length: p.runes }, (_, i) => { const angle = i / p.runes * Math.PI * 2; return marker(run, point(run, Math.sin(angle) * 10, Math.cos(angle) * 10, 2), 2, `Grave rune ${i + 1}`); });
        let cleared = false;
        every(run, start, finish, 100, when => {
          if (cleared) return;
          for (const r of runes) r.charge = Number(team(run).some(s => Math.hypot(s.player.x - r.x, s.player.z - r.z) <= r.r));
          if (runes.every(r => r.charge)) { cleared = true; for (const r of runes) removeMarker(run, r); ctx.tell(run, 'Last Rites interrupted.'); }
          else if (when >= finish) { hurt(run, team(run), .9, when); for (const r of runes) removeMarker(run, r); }
        }); break;
      }
      case 'acid-rain': {
        for (const spit of events('spit')) at(run, spit, () => {
          const puddles = team(run).map(s => hazard(run, 'Acid Rain · Keep moving', 'circle', { x: s.player.x, z: s.player.z, r: p.puddle_radius_m }, spit, spit + 1000, spit + p.puddle_s * 1000));
          every(run, spit + 1000, spit + p.puddle_s * 1000, 1000, when => {
            const caught = team(run).filter(s => puddles.some(h => raidHazardContains(h, s.player)) && when - (state(run).acidHitAt.get(s.player.id) ?? -Infinity) >= 1000);
            for (const s of caught) state(run).acidHitAt.set(s.player.id, when); hurt(run, caught, .2, when);
          });
        }); break;
      }
      case 'brood-bomb': {
        const farthest = [...members].sort((a, b) => Math.hypot(b.player.x - boss.x, b.player.z - boss.z) - Math.hypot(a.player.x - boss.x, a.player.z - boss.z))[0];
        const rune = marker(run, point(run, farthest.player.x, farthest.player.z, p.radius_m), p.radius_m, 'Brood Bomb: 3 players');
        const hit = event('burst'); at(run, hit, () => {
          const soaking = team(run).filter(s => Math.hypot(s.player.x - rune.x, s.player.z - rune.z) <= rune.r);
          hurt(run, soaking, soaking.length < p.soak_min ? .9 : IC_SKILL_TUNING.successfulBomb / soaking.length, hit);
          if (soaking.length < p.soak_min) for (let i = 0; i < 4; i++) ctx.spawn(run, INSTANT_COMBAT_CREATURES['bone-pit'].waves[1], point(run, rune.x + (i % 2 ? 1 : -1), rune.z + (i < 2 ? 1 : -1)), hit, .65);
          removeMarker(run, rune);
        }); break;
      }
      case 'venom-stacks': {
        for (const hit of events('bite')) at(run, hit, () => {
          const tank = target(run, hit); if (!tank) return;
          const stacks = (state(run).venom.get(tank.player.id) || 0) + 1; state(run).venom.set(tank.player.id, stacks);
          ctx.event(tank, `Venom: ${stacks} stacks. ${stacks >= p.swap_at ? 'Another tank must taunt now!' : ''}`);
          if (stacks >= p.swap_at + 1) { hurt(run, team(run).filter(s => s !== tank && Math.hypot(s.player.x - tank.player.x, s.player.z - tank.player.z) <= p.burst_radius_m), .5, hit); kill(run, tank, hit); state(run).venom.delete(tank.player.id); }
        }); break;
      }
      case 'void-collapse': {
        const start = event('pull_start'), hit = event('collapse'), h = hazard(run, 'Void Collapse · Escape 10m', 'circle', { x: 0, z: 0, r: p.radius_m }, start, hit);
        every(run, start + 100, hit - 1, 100, when => push(run, team(run), { x: 0, z: 0 }, -IC_SKILL_TUNING.pullSpeed * .1, when));
        at(run, hit, () => hurt(run, inside(run, h), .9, hit, 'silence', 4000)); break;
      }
      case 'polarity-decree': {
        const hit = event('judgement'), runes = markAll(1.2, 'Gold: +X half');
        runes.forEach((r, i) => { r.label = i % 2 ? 'Violet: -X half' : 'Gold: +X half'; r.kind = i % 2 ? 'web' : 'soak'; });
        for (const [x, label] of [[17, 'Gold half'], [-17, 'Violet half']]) marker(run, { x, z: 0 }, 3, label, { kind: x < 0 ? 'web' : 'soak' });
        at(run, hit, () => { hurt(run, members.filter((s, i) => player(run, s.player.id) && (i % 2 ? s.player.x >= 0 : s.player.x < 0)), .8, hit, 'stun', 3000); run.runes = run.runes.filter(r => !r.skill); }); break;
      }
      case 'rift-lances': {
        events('lance').forEach((hit, i) => {
          const chosen = members[i % members.length], angle = Math.atan2(chosen.player.x - boss.x, chosen.player.z - boss.z);
          const h = line(run, `${skill.name} ${i + 1}`, origin, angle, p.lane_width_m, p.length_m, event('mark'), hit);
          at(run, hit, () => hurt(run, inside(run, h), .65, hit));
        }); break;
      }
      case 'null-tether': {
        const start = event('tether'), until = start + p.duration_s * 1000; busyUntil = reach(until);
        for (let i = 0; i + 1 < members.length; i += 2) {
          const a = members[i], b = members[i + 1], rune = marker(run, a.player, p.max_distance_m, `Stay near ${b.player.name || 'partner'}`, { kind: 'web', followId: a.player.id, playerId: b.player.id }); let done = false;
          every(run, start, until, 100, when => {
            if (done) return;
            if (!player(run, a.player.id) || !player(run, b.player.id)) { done = true; removeMarker(run, rune); return; }
            if (Math.hypot(a.player.x - b.player.x, a.player.z - b.player.z) > p.max_distance_m) { hurt(run, [a, b], .7, when, 'silence', 4000); done = true; }
            if (when >= until) done = true;
            if (done) removeMarker(run, rune);
          });
        } break;
      }
      case 'cocoon': {
        const start = event('cocooned'); busyUntil = reach(start + p.timer_s * 1000);
        at(run, start, () => trap(run, target(run, start), 'Cocoon', IC_SKILL_TUNING.cocoonHp, start, p.timer_s * 1000, p.heal_pct / 100)); break;
      }
      case 'web-snare': {
        const hit = event('pulse'), bounds = instantCombatMap(run.mapId).bounds, tiles = [];
        for (let x = Math.floor(bounds.minX / p.tile_m); x < Math.ceil(bounds.maxX / p.tile_m); x++) for (let z = Math.floor(bounds.minZ / p.tile_m); z < Math.ceil(bounds.maxZ / p.tile_m); z++) if ((x + z) % 2 === 0)
          tiles.push(hazard(run, 'Web tile · Move to clear floor', 'line', { x: (x + .5) * p.tile_m, z: (z + .5) * p.tile_m, width: p.tile_m, length: p.tile_m }, event('web_floor'), hit));
        at(run, hit, () => hurt(run, team(run).filter(s => tiles.some(h => raidHazardContains(h, s.player))), .4, hit, 'root', 4000)); break;
      }
      case 'stampede': {
        const hits = [event('charge'), event('charge_back')], h = line(run, skill.name, origin, rotation, p.lane_width_m, p.length_m, event('mark'), hits[0]);
        h.endsAt = hits[1] + 500;
        for (const hit of hits) at(run, hit, () => { const caught = inside(run, h); hurt(run, caught, .9, hit); push(run, caught, boss, IC_SKILL_TUNING.knockbackM, hit); }); break;
      }
      case 'tail-sweep': {
        const hit = event('sweep'), h = hazard(run, skill.name, 'cone', { r: p.radius_m, angle: Math.PI * (360 - p.safe_arc_deg) / 180, rotation: rotation + Math.PI }, event('telegraph'), hit);
        at(run, hit, () => { const caught = inside(run, h); hurt(run, caught, .75, hit); push(run, caught, boss, IC_SKILL_TUNING.knockbackM, hit); }); break;
      }
      case 'devour': {
        for (const hit of events('devour')) at(run, hit, () => {
          const tank = target(run, hit); if (!tank) return;
          if ((state(run).digest.get(tank.player.id) || 0) > hit) kill(run, tank, hit);
          else { state(run).digest.set(tank.player.id, hit + p.digest_s * 1000); ctx.event(tank, 'Digesting: another tank must taunt before Devour!'); }
        }); break;
      }
      case 'total-eclipse': {
        const start = event('eye_closes'), hit = event('eye_opens'), runes = Array.from({ length: p.lights }, (_, i) => { const a = i / p.lights * Math.PI * 2; return marker(run, point(run, Math.sin(a) * 11, Math.cos(a) * 11, p.radius_m), p.radius_m, 'Light: safe'); });
        at(run, start, () => { state(run).darkUntil = hit; });
        every(run, start, hit, 100, when => { for (const r of runes) r.r = p.radius_m + (IC_SKILL_TUNING.lightEndRadius - p.radius_m) * Math.min(1, (when - start) / (hit - start)); });
        at(run, hit, () => { for (const r of runes) r.r = IC_SKILL_TUNING.lightEndRadius;
          hurt(run, team(run).filter(s => !runes.some(r => Math.hypot(s.player.x - r.x, s.player.z - r.z) <= r.r)), .8, hit, 'blind', 4000);
          for (const r of runes) removeMarker(run, r); }); break;
      }
      case 'prophecy': {
        for (let i = 0; i < p.quadrants; i++) {
          const hit = event(`blast_${i + 1}`), angle = i * Math.PI / 2 + Math.PI / 4;
          const h = hazard(run, `Prophecy ${i + 1}`, 'cone', { x: 0, z: 0, r: 50, angle: Math.PI / 2, rotation: angle }, event('prophecy'), hit);
          const rune = marker(run, point(run, Math.sin(angle) * 12, Math.cos(angle) * 12, 2), 2, String(i + 1));
          at(run, hit, () => { hurt(run, inside(run, h), .7, hit); removeMarker(run, rune); });
        } break;
      }
      case 'sweeping-gaze': {
        const start = event('sweep_start'), finish = event('sweep_end');
        const beams = Array.from({ length: p.beams }, (_, i) => line(run, skill.name, origin, rotation + i * Math.PI / 2, IC_SKILL_TUNING.beamWidth, IC_SKILL_TUNING.beamLength, event('beams'), start));
        for (const h of beams) { h.endsAt = finish; h.x += Math.sin(h.rotation) * IC_SKILL_TUNING.beamStart; h.z += Math.cos(h.rotation) * IC_SKILL_TUNING.beamStart; }
        every(run, start, finish, 100, when => { beams.forEach((h, i) => { h.rotation = rotation + i * Math.PI / 2 + Math.min(1, (when - start) / (finish - start)) * p.sweep_deg * Math.PI / 180; h.x = boss.x + Math.sin(h.rotation) * (h.length / 2 + IC_SKILL_TUNING.beamStart); h.z = boss.z + Math.cos(h.rotation) * (h.length / 2 + IC_SKILL_TUNING.beamStart); }); });
        every(run, start, finish, IC_SKILL_TUNING.beamTickMs, when => hurt(run, team(run).filter(s => beams.some(h => raidHazardContains(h, s.player))), .5, when)); break;
      }
    }
    boss.attack.endsAt = busyUntil; run.nextAbility = busyUntil + (run.bossPhase === 'final' ? 1500 : 2500) / INSTANT_COMBAT.attackRateMultiplier;
    ctx.dirty();
  }
  function resolve(run, now) {
    const s = state(run);
    for (const item of [...run.hazards, ...run.runes]) if (item.followId) {
      const following = player(run, item.followId); if (following) { item.x = following.player.x; item.z = following.player.z; }
    }
    s.jobs.sort((a, b) => a.at - b.at);
    while (s.jobs[0]?.at <= now && run.boss?.alive && run.boss.hp > 0) { const job = s.jobs.shift(); job.action(); s.jobs.sort((a, b) => a.at - b.at); }
  }
  function clear(run) {
    for (const enemy of ctx.enemies) if (enemy.instanceId === run.id && enemy.skillObjective) { enemy.hp = 0; enemy.alive = false; }
    run.hazards = run.hazards.filter(h => !h.skill); run.runes = run.runes.filter(r => !r.skill); delete run.skillRuntime;
  }
  function recordAction(run, session, type, now) {
    const active = run && state(run).requiem;
    if (!active || now >= active.until || active.punished.has(session.player.id) || !['move', 'jump', 'attack', 'autoAttack', 'cast'].includes(type)) return;
    active.punished.add(session.player.id); hurt(run, [session], .5, now, 'silence', 5000);
    ctx.event(session, 'Silent Requiem: you acted during the red halo.');
  }
  function actionError(run, session, type, now) {
    const s = run?.skillRuntime?.controls.get(session.player.id); if (!s) return null;
    if (s.stunUntil > now && ['move', 'jump', 'attack', 'autoAttack', 'cast'].includes(type)) return 'You are stunned.';
    if (s.trapId && s.rootUntil > now && ['attack', 'autoAttack', 'cast'].includes(type)) return 'You are trapped. Allies must break the rescue objective.';
    if (s.rootUntil > now && ['move', 'jump'].includes(type)) return 'You are rooted. Allies can break a cage or cocoon.';
    if (s.silenceUntil > now && ['attack', 'cast'].includes(type)) return 'You are silenced.';
    return null;
  }
  return { cast, resolve, clear, actionError, recordAction,
    clearMovementImpairments: (run, session) => {
      const entry = run?.skillRuntime?.controls.get(session.player.id);
      if (entry && !entry.trapId) entry.rootUntil = 0;
    },
    impacts: (run, now) => state(run).jobs.filter(job => job.at <= now).map(job => job.at),
    publicState: (run, session) => {
      const s = run.skillRuntime?.controls.get(session.player.id) || {};
      return { stunUntil: s.stunUntil || 0, rootUntil: s.rootUntil || 0, silenceUntil: s.silenceUntil || 0, blindUntil: s.blindUntil || 0, darkUntil: run.skillRuntime?.darkUntil || 0 };
    } };
}
