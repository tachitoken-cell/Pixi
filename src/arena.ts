import { COLOSSEUM, COLOSSEUM_ENTRANCE, COLOSSEUM_PILLARS } from './colosseum.ts';
import type { ArenaRatings, ArenaSize } from './shared.ts';

export const ARENA_INITIAL_RATING = 1000;
export const arenaRank = (rating: number): string => rating >= 2000 ? 'Master' : rating >= 1800 ? 'Diamond'
  : rating >= 1600 ? 'Platinum' : rating >= 1400 ? 'Gold' : rating >= 1200 ? 'Silver' : 'Bronze';
export const arenaRatingDelta = (rating: number, opponentRating: number, score: 0 | 0.5 | 1): number =>
  Math.round(32 * (score - 1 / (1 + 10 ** ((opponentRating - rating) / 400))));

export function normalizeArenaRatings(value?: unknown): ArenaRatings {
  const ratings = value && typeof value === 'object' ? value as Partial<ArenaRatings> : {};
  return Object.fromEntries(([1, 2, 3] as const).map(size => {
    const saved = ratings[size];
    const integer = (n: unknown, fallback = 0) => Number.isSafeInteger(n) && Number(n) >= 0 ? Number(n) : fallback;
    return [size, { rating: integer(saved?.rating, ARENA_INITIAL_RATING), wins: integer(saved?.wins), losses: integer(saved?.losses), draws: integer(saved?.draws) }];
  })) as ArenaRatings;
}

export const arenaRatingsValid = (value: unknown): value is ArenaRatings => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 3 && [1, 2, 3].every(size => {
    const rating = (value as ArenaRatings)[size as ArenaSize];
    return rating && typeof rating === 'object' && !Array.isArray(rating) && Object.keys(rating).length === 4
      && ['rating', 'wins', 'losses', 'draws'].every(key => Number.isSafeInteger(rating[key as keyof typeof rating]) && rating[key as keyof typeof rating] >= 0);
  });

/** Match assembly is outside the open world PvP ring. */
export const ARENA_ENTRANCE = { ...COLOSSEUM_ENTRANCE, zone: COLOSSEUM.zone };
export const ARENA_ENTRY_RADIUS = 12;
export const ARENA_RADIUS = COLOSSEUM.radius;
export const ARENA_BOUNDS = { minX: -43, maxX: 43, minZ: -43, maxZ: 43 };
export const ARENA_COLLIDERS = COLOSSEUM_PILLARS.map(pillar => ({ ...pillar, x: pillar.x - COLOSSEUM.x, z: pillar.z - COLOSSEUM.z }));
export const isArenaInstance = (id: string | null | undefined): boolean => !!id?.startsWith('arena-');
export const isInArena = (point: { x: number; z: number }): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.z) && Math.hypot(point.x, point.z) <= ARENA_RADIUS;
export const arenaTeamPosition = (team: 0 | 1, slot: number, size: ArenaSize) => ({
  x: team === 0 ? -28 : 28, z: (slot - (size - 1) / 2) * 6,
  rotation: team === 0 ? Math.PI / 2 : -Math.PI / 2,
});
