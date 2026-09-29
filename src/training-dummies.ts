import { CITY_LAYOUTS } from './city.ts';

export const TRAINING_DUMMY_HP = 100_000;
export const TRAINING_DUMMY_RESET_MS = 10_000;

/** Clear practice space beside each city's class trainers, facing the southern approach. */
export const TRAINING_DUMMIES = CITY_LAYOUTS.map(city => ({
  id: `training-dummy-${city.zone}`, kind: 'training-dummy' as const,
  zone: city.zone, x: city.x - 39, z: city.z - 32,
}));
