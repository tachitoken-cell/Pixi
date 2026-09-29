import type { ZoneId } from './content.ts';

export const REGION_LEVEL_RANGES: Readonly<Record<string, Readonly<{ min: number; max: number }>>> = {
  slimefen: { min: 24, max: 32 },
  sugarbloom: { min: 28, max: 36 },
  greenwood: { min: 1, max: 6 },
  amberwild: { min: 6, max: 12 },
  frostmarch: { min: 12, max: 18 },
  hollow: { min: 18, max: 24 },
  sunveil: { min: 30, max: 45 },
  mistwood: { min: 45, max: 60 },
  pinewake: { min: 3, max: 8 },
  silverreach: { min: 2, max: 7 },
  cindergrove: { min: 4, max: 9 },
  redleaf: { min: 6, max: 12 },
  sunscar: { min: 9, max: 15 },
  tidewatch: { min: 6, max: 12 },
  'bracken-crown': { min: 8, max: 14 },
  whisper: { min: 10, max: 16 },
  emberfall: { min: 10, max: 16 },
  stormcrag: { min: 12, max: 18 },
  northglass: { min: 14, max: 20 },
  'opal-isles': { min: 16, max: 22 },
  moonfen: { min: 16, max: 22 },
  shadewood: { min: 20, max: 26 },
  elderwood: { min: 24, max: 30 },
  'violet-reach': { min: 24, max: 30 },
  'winterspire': { min: 26, max: 34 },
  'aurora-reach': { min: 28, max: 36 },
  'copper-highlands': { min: 26, max: 34 },
  'westwind-meadows': { min: 24, max: 32 },
  'oakheart-coast': { min: 26, max: 34 },
  'umbral-shores': { min: 28, max: 36 },
  'nightbloom': { min: 32, max: 40 },
  'southwind-basin': { min: 28, max: 36 },
  'dune-wells': { min: 30, max: 36 },
  'saffron-mesa': { min: 36, max: 42 },
  'glass-dunes': { min: 40, max: 45 },
  'sunveil-badlands': { min: 38, max: 44 },
  'canopy-reach': { min: 45, max: 50 },
  'jade-rainforest': { min: 48, max: 54 },
  'mistwood-basin': { min: 52, max: 58 },
  'orchid-isles': { min: 55, max: 60 },
  'ancient-canopy': { min: 56, max: 60 },
};

export function regionLevelRange(regionId: string, zone: ZoneId): Readonly<{ min: number; max: number }> {
  return REGION_LEVEL_RANGES[Object.hasOwn(REGION_LEVEL_RANGES, regionId) ? regionId : zone];
}
export function regionLevelLabel(regionId: string, zone: ZoneId): string {
  const { min, max } = regionLevelRange(regionId, zone);
  return `Lv ${min}–${max}`;
}
