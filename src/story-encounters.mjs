import { randomUUID } from 'node:crypto';
import { STORY_ENCOUNTERS, STORY_OBJECTS } from './story-world-data.ts';
import { storyInteractAvailable } from './story-quests.ts';

/** Short, personal overworld encounters; quest completion is the durable record.
 * Disconnecting, dying or leaving discards the attempt without spending progress. */
export function createStoryEncounters(ctx) {
  const runs = new Map();
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function clear(session, message, questId) {
    const run = runs.get(session.player.id); if (!run) return;
    if (run.session !== session) return;
    if (questId && run.definition.questId !== questId) return;
    for (const enemy of run.enemies) ctx.remove(enemy);
    runs.delete(session.player.id);
    if (message) ctx.tell(session, message);
  }
  function wave(run, now) {
    const groups = run.definition.waves[run.wave] ?? [], count = groups.reduce((sum, group) => sum + group.count, 0);
    let index = 0;
    for (const group of groups) for (let n = 0; n < group.count; n++) {
      const angle = index++ * Math.PI * 2 / Math.max(1, count);
      try {
        const enemy = ctx.spawn({ id: `story-encounter-${run.id}-${run.wave}-${index}`, kind: group.kind, level: group.level,
          zone: run.definition.zone, x: run.x + Math.sin(angle) * 8, z: run.z + Math.cos(angle) * 8, storyEncounterId: run.id }, now);
        if (!enemy) throw Error('Missing encounter enemy.');
        run.enemies.push(enemy);
      }
      catch { clear(run.session, 'The encounter could not start here. Please try again.'); return false; }
    }
    run.phase = 'fighting'; run.lastHurtAt = now; return true;
  }
  function start(session, object, now) {
    const definition = STORY_ENCOUNTERS.find(entry => entry.objectId === object?.id);
    const origin = definition && STORY_OBJECTS.find(entry => entry.id === definition.objectId);
    if (!definition || !origin) return false;
    const p = session.player;
    if (!ctx.live(session) || p.hp <= 0 || session.instanceId || session.zeppelin || p.zone !== definition.zone
      || distance(p, origin) > 3 || !ctx.canMove(p, origin)
      || !storyInteractAvailable(p.storyQuests, definition.id, definition.questId)) return false;
    const previous = runs.get(p.id);
    if (previous && previous.session !== session) clear(previous.session);
    if (runs.has(session.player.id)) { ctx.tell(session, 'Finish the traveler encounter already in progress.'); return true; }
    const route = definition.route ?? [];
    // The data includes the starting point. Skip it so a second ambush cannot fire before the escort moves.
    const firstStep = route.findIndex(point => distance(point, origin) > .05);
    const run = { id: randomUUID(), definition, session, x: origin.x, z: origin.z, wave: 0, routeIndex: firstStep < 0 ? route.length : firstStep,
      hp: 100, phase: 'fighting', enemies: [], startedAt: now, lastTick: now, lastHurtAt: now };
    runs.set(session.player.id, run);
    if (!wave(run, now)) return false;
    ctx.tell(session, `${origin.name}: stay nearby and protect your companion. Defeat the attackers to continue.`);
    return true;
  }
  function tick(now) {
    for (const run of runs.values()) {
      const { session, definition } = run, p = session.player;
      if (!ctx.live(session) || p.hp <= 0 || session.instanceId || p.zone !== definition.zone || session.zeppelin
        || !storyInteractAvailable(p.storyQuests, definition.id, definition.questId) || distance(p, run) > 30 || now - run.startedAt >= 300_000) {
        clear(session, 'The rescue attempt ended. Return to the traveler to try again.'); continue;
      }
      const dt = Math.min(.2, Math.max(0, now - run.lastTick) / 1000); run.lastTick = now;
      const alive = run.enemies.filter(enemy => enemy.alive && enemy.hp > 0);
      if (alive.length) {
        for (const enemy of alive) {
          // Player aggro uses normal combat. Unengaged attackers advance on the traveler.
          if (!enemy.target && distance(enemy, run) > 1.8) {
            const length = distance(enemy, run), step = Math.min(dt * 2, length - 1.8);
            const next = { x: enemy.x + (run.x - enemy.x) / length * step, z: enemy.z + (run.z - enemy.z) / length * step };
            if (ctx.canMove(enemy, next)) { enemy.x = next.x; enemy.z = next.z; enemy.rotation = Math.atan2(run.x - enemy.x, run.z - enemy.z); }
          }
        }
        if (now - run.lastHurtAt >= 1000) {
          run.lastHurtAt = now;
          run.hp = Math.max(0, run.hp - alive.filter(enemy => !enemy.target && distance(enemy, run) <= 2.2).length * 8);
          if (!run.hp) { clear(session, 'The traveler was overwhelmed. Return to the starting point to try again.'); continue; }
        }
        continue;
      }
      const route = definition.route ?? [], next = route[run.routeIndex];
      if (next) {
        run.phase = 'moving';
        if (distance(p, run) > 10) continue;
        const remaining = distance(run, next), step = Math.min(dt * 1.6, remaining);
        if (remaining > .05) {
          const destination = { x: run.x + (next.x - run.x) / remaining * step, z: run.z + (next.z - run.z) / remaining * step };
          if (!ctx.canMove(run, destination)) { clear(session, 'The traveler’s route is blocked. Return to the start to try again.'); continue; }
          Object.assign(run, destination);
        } else {
          run.routeIndex++;
          if (run.wave + 1 < definition.waves.length) { run.wave++; wave(run, now); }
        }
      } else if (run.wave + 1 < definition.waves.length) {
        run.wave++; wave(run, now);
      } else {
        ctx.progress(session, { kind: 'interact', target: definition.id, scope: 'overworld', zone: definition.zone });
        clear(session, 'The traveler is safe. Return to your quest giver.');
      }
    }
  }
  return { start, tick, clear, publicState(session) {
    const run = runs.get(session.player.id);
    return run?.session === session ? { id: run.definition.id, objectId: run.definition.objectId, x: run.x, z: run.z, hp: run.hp,
      phase: run.phase, wave: run.wave + 1, waves: run.definition.waves.length } : null;
  } };
}
