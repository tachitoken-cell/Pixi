import type { SpellMotif } from './spell-visuals.ts';

/** Local +Z is projectile travel/character facing; fields and impacts are grounded. */
export interface SpellArt {
  phase: 'flight' | 'impact' | 'field';
  p: number; t: number; r: number;
  detail: (count: number) => number;
  shape: (motif: SpellMotif, x: number, y: number, z: number, sx: number, sy?: number, sz?: number, tone?: number, yaw?: number, pitch?: number, roll?: number) => void;
  line: (ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, tone?: number) => void;
  ring: (x: number, y: number, z: number, radius: number, tone?: number, pitch?: number, yaw?: number) => void;
  arc: (x: number, y: number, z: number, radius: number, start: number, end: number, width: number, tone?: number, pitch?: number) => void;
}
