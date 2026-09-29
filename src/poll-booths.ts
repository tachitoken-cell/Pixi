import { CITY_LAYOUTS } from './city.ts';

/** The service point is on the open paving in front of the solid ballot kiosk. */
export const POLL_BOOTHS = CITY_LAYOUTS.map(city => ({
  id: `poll-booth-${city.zone}`, name: 'Polling booth', cityName: city.name, zone: city.zone,
  x: city.x - 10, z: city.z - 3.2, modelX: city.x - 10, modelZ: city.z - 5, rotation: 0,
}));
export const POLL_BOOTH_COLLIDERS = POLL_BOOTHS.map(booth => ({
  x: booth.modelX, z: booth.modelZ, r: Math.hypot(1.1, .9), halfWidth: 1.1, halfDepth: .9,
}));
