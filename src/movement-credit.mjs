import { WALK_SPEED } from './travel.ts';

export const MOVEMENT_CREDIT_SECONDS = 3.2 / WALK_SPEED;
const graceMs = MOVEMENT_CREDIT_SECONDS * 1000;

// Monotonic server heartbeats distinguish a blocked event loop from delayed client traffic.
export function createMovementCredit(clock = () => performance.now()) {
  let observed = clock(), pause;
  const moving = new WeakMap();
  function observe() {
    const at = clock(), gap = at - observed;
    if (gap > graceMs) pause = { from: observed, to: at, cap: Math.min(2, MOVEMENT_CREDIT_SECONDS + (gap - 100) / 1000) };
    observed = at;
    return at;
  }
  function reset(session) {
    moving.delete(session);
    session.moveBudget = Math.min(session.moveBudget, MOVEMENT_CREDIT_SECONDS);
  }
  function refill(session, now, receipt = observe()) {
    let previous = moving.get(session);
    if (previous && (previous.lastMove !== session.lastMove || previous.budget !== session.moveBudget
      || previous.x !== session.player.x || previous.z !== session.player.z || previous.instance !== session.instanceId
      || previous.mount !== session.travel.mount)) { reset(session); previous = undefined; }
    let cap = previous && receipt <= previous.until ? previous.cap : MOVEMENT_CREDIT_SECONDS;
    if (previous && pause && receipt >= pause.to && receipt <= pause.to + graceMs && previous.at <= pause.from && pause.from - previous.at <= graceMs) {
      cap = Math.max(cap, pause.cap);
      previous.until = pause.to + graceMs;
      previous.cap = cap;
    }
    // A pause only retains elapsed credit; it never adds time or changes movement costs.
    session.moveBudget = Math.min(cap, session.moveBudget + Math.max(0, now - session.lastMove) / 1000);
    session.lastMove = now;
    return receipt;
  }
  function accepted(session, receipt, distance) {
    if (distance <= 1e-8) { reset(session); return; }
    moving.set(session, { at: receipt, until: moving.get(session)?.until || 0, cap: moving.get(session)?.cap || MOVEMENT_CREDIT_SECONDS, lastMove: session.lastMove,
      budget: session.moveBudget, x: session.player.x, z: session.player.z, instance: session.instanceId, mount: session.travel.mount });
  }
  return { observe, refill, accepted, reset };
}
