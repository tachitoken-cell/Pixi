import type { JumpState } from './jumping.ts';
import { WALK_MAX_STEP } from './jumping.ts';
import type { TravelState } from './travel.ts';
import { groundHeight, waterAt, TERRAIN_MAX_STEP, WATER_LEVEL } from './landscape.ts';
import { buildingAt, buildingFloorHeight } from './buildings.ts';
import { canTraverse } from './realm.ts';
import { ACTOR_RADIUS, ACTOR_HEIGHT, actorWall, actorFloor, actorCanStand, actorCanMove, actorSweep } from './collision3d.ts';

export interface ClimbState { x: number; z: number; topY: number; rotation: number; wall?: boolean }
// Temporarily disabled while overworld movement is repaired; solid collision stays active.
export const CLIMB_ENABLED = false;
export const CLIMB_REACH = .65;
export const CLIMB_SPEED = 1.4;
export const CLIMB_DRAIN = 20;

export function startClimb(state: JumpState, from: { x: number; z: number }, to: { x: number; z: number }, travel: TravelState, dungeon = false, sceneKey?: string) {
  if (!CLIMB_ENABLED) return false;
  const distance = Math.hypot(to.x - from.x, to.z - from.z), floor = groundHeight(from.x, from.z);
  if (state.climb || !state.grounded || travel.mount || travel.driverId || travel.exhausted || travel.stamina <= 0
      || ![from.x, from.z, to.x, to.z].every(Number.isFinite) || distance <= 0 || distance > CLIMB_REACH + 1e-8
      || !dungeon && waterAt(from.x, from.z) && state.y <= WATER_LEVEL + .1) return false;
  const direction = { x: to.x - from.x, z: to.z - from.z };
  let target = { x: to.x, z: to.z, topY: groundHeight(to.x, to.z), rotation: Math.atan2(direction.x, direction.z) }, wall = false;
  if (sceneKey) {
    const contact = actorWall(sceneKey, { ...from, y: state.y }, direction, CLIMB_REACH);
    if (contact && Math.hypot(contact.x - from.x, contact.z - from.z) <= ACTOR_RADIUS + distance + .03) {
      const x = contact.x - contact.normalX * .2, z = contact.z - contact.normalZ * .2;
      // Nearby caps/branches can sit above the particular mesh we touched.
      // The capsule support query finds the actual mantle height. Headroom is
      // checked during ascent, allowing a partial climb below an overhang.
      const topY = actorFloor(sceneKey, x, z, contact.topY + ACTOR_HEIGHT);
      if (!Number.isFinite(topY) || topY <= state.y + WALK_MAX_STEP) return false;
      target = { x, z, topY, rotation: Math.atan2(-contact.normalX, -contact.normalZ) }; wall = true;
    }
  }
  if (!wall) {
    if (dungeon || Math.abs(state.y - floor) > .03 || target.topY - floor <= WALK_MAX_STEP + .001 || target.topY - floor > 2 * TERRAIN_MAX_STEP + .001
        || !sceneKey && !canTraverse(from, to)) return false;
    for (let i = 0; i <= 8; i++) {
      const x = from.x + direction.x * i / 8, z = from.z + direction.z * i / 8;
      if (waterAt(x, z) || !sceneKey && (buildingAt(x, z) || Math.abs(buildingFloorHeight(x, z) - groundHeight(x, z)) > .001)
          || groundHeight(x, z) > target.topY + .001) return false;
    }
    if (sceneKey && (!actorCanMove(sceneKey, { ...from, y: state.y }, { ...from, y: target.topY }) || !actorCanMove(sceneKey, { ...from, y: target.topY }, { x: target.x, y: target.topY, z: target.z }))) return false;
  }
  state.climb = { ...target, ...(wall ? { wall: true } : {}) };
  state.grounded = false; state.velocity = 0; state.sequence++;
  travel.sprinting = false;
  return true;
}
export function stopClimb(state: JumpState) {
  if (!state.climb) return;
  delete state.climb;
  state.velocity = 0; state.grounded = false; state.sequence++;
}
export function stepClimb(state: JumpState, position: { x: number; z: number; rotation?: number }, travel: TravelState, dt: number, sceneKey?: string,
    routeAllowed?: (from: { x: number; z: number }, to: { x: number; z: number }) => boolean) {
  if (!CLIMB_ENABLED) { stopClimb(state); return; }
  let remaining = Math.max(0, dt);
  while (state.climb && remaining > 1e-9) {
    const climb = state.climb;
    const direction = { x: Math.sin(climb.rotation), z: Math.cos(climb.rotation) };
    const contact = sceneKey && climb.wall ? actorWall(sceneKey, { ...position, y: state.y }, direction, CLIMB_REACH) : null;
    if (sceneKey && contact) {
      const x = contact.x + direction.x * .2, z = contact.z + direction.z * .2;
      const topY = actorFloor(sceneKey, x, z, contact.topY + ACTOR_HEIGHT);
      if (Number.isFinite(topY) && topY >= climb.topY - .03) Object.assign(climb, { x, z, topY });
    }
    if (sceneKey && climb.wall && state.y < climb.topY - .25 && !contact) {
      const ledge = actorFloor(sceneKey, climb.x, climb.z, state.y + .3);
      if (!Number.isFinite(ledge) || ledge < state.y - .05 || !actorCanStand(sceneKey, climb.x, ledge, climb.z)) { stopClimb(state); break; }
      climb.topY = ledge;
    }
    const height = Math.max(0, climb.topY - state.y);
    const seconds = Math.min(remaining, .05, height > 1e-8 ? height / CLIMB_SPEED : .05, Math.max(0, travel.stamina) / CLIMB_DRAIN);
    const nextY = Math.min(climb.topY, state.y + seconds * CLIMB_SPEED);
    let fraction = sceneKey ? actorSweep(sceneKey, { ...position, y: state.y }, { ...position, y: nextY }) : 1;
    if (sceneKey && contact) {
      // Follow a receding face, or move out around a shallow raised stone. Both
      // legs are swept; a broad overhang cannot be climbed through or around.
      const gap = (contact.x - position.x) * direction.x + (contact.z - position.z) * direction.z;
      const offsets = fraction < 1 ? [-.04, -.08, -.12, -.16, -.2, -.24] : [Math.min(.08, gap - ACTOR_RADIUS - .025)];
      for (const offset of offsets) {
        if (Math.abs(offset) < .001 || offset < 0 && gap - offset > ACTOR_RADIUS + .25) continue;
        const next = { x: position.x + direction.x * offset, y: state.y, z: position.z + direction.z * offset };
        if ((!routeAllowed || routeAllowed(position, next)) && actorCanMove(sceneKey, { ...position, y: state.y }, next) && actorCanMove(sceneKey, next, { ...next, y: nextY })) {
          position.x = next.x; position.z = next.z; fraction = 1; break;
        }
      }
    }
    state.y += (nextY - state.y) * fraction; state.velocity = 0;
    travel.stamina = Math.max(0, travel.stamina - seconds * CLIMB_DRAIN); travel.sprinting = false;
    remaining -= seconds;
    if (travel.stamina < .001) { travel.stamina = 0; travel.exhausted = true; }
    if (state.y >= climb.topY - 1e-8) {
      const floor = sceneKey ? actorFloor(sceneKey, climb.x, climb.z, state.y + .03) : climb.topY;
      if (Number.isFinite(floor) && Math.abs(floor - state.y) < .03 && (!routeAllowed || routeAllowed(position, climb)) && (!sceneKey || actorCanStand(sceneKey, climb.x, floor, climb.z)
          && actorCanMove(sceneKey, { ...position, y: state.y }, { x: climb.x, y: floor, z: climb.z }))) {
        Object.assign(position, { x: climb.x, z: climb.z, rotation: climb.rotation });
        state.y = floor; state.grounded = true; delete state.climb;
      }
    }
    if (state.climb && (travel.exhausted || seconds <= 0 || !contact && (fraction < 1 || state.y >= climb.topY - 1e-8))) { stopClimb(state); break; }
  }
}
