import { waterAt, groundHeight, WATER_LEVEL, TERRAIN_MAX_STEP } from './landscape.ts';
import { buildingFloorHeight } from './buildings.ts';
import { actorBaseFloor, actorFloor, actorCanStand, actorCanMove, actorSweep } from './collision3d.ts';
import type { ClimbState } from './climbing.ts';

export interface JumpState { y: number; velocity: number; grounded: boolean; sequence: number; climb?: ClimbState }
export const WALK_MAX_STEP = .5;
export const JUMP_SPEED = 8.5;
export const JUMP_GRAVITY = 22;
export const jumpFloor = (x: number, z: number, dungeon = false) => dungeon ? 0 : waterAt(x, z) ? WATER_LEVEL - .47 : buildingFloorHeight(x, z);
export function newJump(x: number, z: number, dungeon = false, sceneKey?: string, savedY?: number): JumpState {
  let y = Number.isFinite(savedY) ? savedY! : jumpFloor(x, z, dungeon), grounded = true;
  if (sceneKey) {
    const support = actorFloor(sceneKey, x, z, y + (Number.isFinite(savedY) ? .03 : .5));
    if (Number.isFinite(support) && actorCanStand(sceneKey, x, support, z)) y = support;
    else grounded = false;
  }
  return { y, velocity: 0, grounded, sequence: 0 };
}
export function startJump(state: JumpState, x: number, z: number, dungeon = false, sceneKey?: string) {
  if (state.climb || !state.grounded || !dungeon && waterAt(x, z) && state.y <= WATER_LEVEL + .1) return false;
  if (sceneKey) {
    const floor = actorFloor(sceneKey, x, z, state.y + .03);
    if (!Number.isFinite(floor) || Math.abs(state.y - floor) > .05 || !actorCanStand(sceneKey, x, floor, z)) return false;
    state.y = floor;
  } else state.y = jumpFloor(x, z, dungeon);
  state.velocity = JUMP_SPEED; state.grounded = false; state.sequence++;
  return true;
}
export function stepJump(state: JumpState, dt: number, floorY: number, position?: { x: number; z: number }, sceneKey?: string) {
  if (state.climb) return;
  const floor = sceneKey && position ? actorFloor(sceneKey, position.x, position.z, state.y + .03) : floorY;
  if (state.grounded && Math.abs(state.y - floor) <= .05) { state.y = floor; state.velocity = 0; return; }
  if (state.grounded && !sceneKey) { state.y = floor; state.velocity = 0; return; }
  state.grounded = false;
  const seconds = Math.max(0, dt), nextY = state.y + state.velocity * seconds - .5 * JUMP_GRAVITY * seconds * seconds;
  // A delayed packet can span the jump's apex. Sweep both halves, otherwise a
  // net downward segment would miss the ceiling crossed on the way up.
  if (sceneKey && position && state.velocity > 0 && seconds > state.velocity / JUMP_GRAVITY) {
    const ascending = state.velocity / JUMP_GRAVITY;
    stepJump(state, ascending, floorY, position, sceneKey);
    stepJump(state, seconds - ascending, floorY, position, sceneKey);
    return;
  }
  const fraction = sceneKey && position ? actorSweep(sceneKey, { ...position, y: state.y }, { ...position, y: nextY }) : 1;
  const goingUp = nextY > state.y;
  state.y += (nextY - state.y) * fraction;
  state.velocity -= JUMP_GRAVITY * seconds;
  if (fraction < 1 && goingUp) state.velocity = Math.min(0, state.velocity);
  if (state.y <= floor + .03 && state.velocity <= 0) { state.y = floor; state.velocity = 0; state.grounded = true; }
}

// Terrain keeps its exact stepped tops; Rapier sweeps the complete body against authored solid geometry.
export function moveJump(state: JumpState, from: { x: number; z: number }, to: { x: number; z: number }, dungeon = false, sceneKey?: string) {
  if (state.climb) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .25));
  let y = state.y, grounded = state.grounded, previous = { ...from, y };
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps, z = from.z + (to.z - from.z) * i / steps;
    const baseFloor = sceneKey ? actorBaseFloor(sceneKey, x, z) : jumpFloor(x, z, dungeon);
    const leavingWater = !dungeon && waterAt(previous.x, previous.z) && y <= WATER_LEVEL + .1;
    // Normal terrain terraces lift grounded feet; this does not raise the step allowance for props.
    const terrainRise = !dungeon && grounded && Math.abs(y - groundHeight(previous.x, previous.z)) < .05
      && Math.abs(baseFloor - groundHeight(x, z)) < .001 && baseFloor <= y + TERRAIN_MAX_STEP + .001 ? Math.max(0, baseFloor - y) : 0;
    const maxStep = Math.max(terrainRise, !leavingWater && (sceneKey || !dungeon && Math.abs(baseFloor - groundHeight(x, z)) < .001) ? WALK_MAX_STEP : TERRAIN_MAX_STEP);
    const floor = sceneKey ? actorFloor(sceneKey, x, z, y + (grounded ? maxStep : .001)) : baseFloor;
    if (grounded) {
      if (baseFloor > y + maxStep + .001 || floor > y + maxStep + .001) return false;
      if (!Number.isFinite(floor) || floor < y - (sceneKey ? WALK_MAX_STEP : TERRAIN_MAX_STEP) - .001) grounded = false;
      else y = floor;
    } else if (baseFloor > y + .001 || floor > y + .001) return false;
    // The center ray can find a lower surface while the capsule still overlaps
    // the steep lip behind it. Move off that lip in the air; gravity settles
    // the body only after there is clearance below its whole footprint.
    if (sceneKey && grounded && y < previous.y && !actorCanStand(sceneKey, x, y, z)) { y = previous.y; grounded = false; }
    if (sceneKey && !actorCanMove(sceneKey, previous, { x, y, z })) {
      // A small step first raises clear of the riser, then moves across its actual top.
      const up = grounded && y > previous.y && actorCanMove(sceneKey, previous, { ...previous, y }) && actorCanMove(sceneKey, { ...previous, y }, { x, y, z });
      // At a convex roof edge, moving sideways before settling onto the next
      // support avoids cutting diagonally through that edge.
      const down = grounded && y < previous.y && actorCanMove(sceneKey, previous, { x, y: previous.y, z }) && actorCanMove(sceneKey, { x, y: previous.y, z }, { x, y, z });
      if (!up && !down) return false;
    }
    previous = { x, y, z };
  }
  state.y = y; state.grounded = grounded;
  return true;
}
