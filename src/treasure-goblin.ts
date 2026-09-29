export const TREASURE_GOBLIN = {
  spawnIntervalMs: 5 * 60_000, spawnChancePercent: 2, idleLifetimeMs: 5 * 60_000,
  escapeMs: 30_000, portalMs: 3_000, noticeRange: 12, fleeSpeed: 6.4, voucherChancePercent: 10,
} as const;

export interface TreasureGoblinState { spawnedAt: number; escapeAt?: number; portalAt: number }
export const treasureGoblinDeadline = (state: TreasureGoblinState) => state.escapeAt ?? state.spawnedAt + TREASURE_GOBLIN.idleLifetimeMs;
export function engageTreasureGoblin(state: TreasureGoblinState, now: number) {
  if (state.escapeAt !== undefined) return;
  state.escapeAt = Math.min(now + TREASURE_GOBLIN.escapeMs, treasureGoblinDeadline(state));
  state.portalAt = state.escapeAt - TREASURE_GOBLIN.portalMs;
}

/** Try the escape direction and two side steps; the realm supplies terrain/collision checks. */
export function treasureGoblinFleeGoal(enemy: { x: number; z: number; rotation: number }, target: { x: number; z: number } | undefined,
  allowed: (point: { x: number; z: number }) => boolean) {
  const angle = target && Math.hypot(enemy.x - target.x, enemy.z - target.z) > .01
    ? Math.atan2(enemy.x - target.x, enemy.z - target.z) : enemy.rotation;
  for (const offset of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
    const point = { x: enemy.x + Math.sin(angle + offset) * 2, z: enemy.z + Math.cos(angle + offset) * 2 };
    if (allowed(point)) return point;
  }
}
