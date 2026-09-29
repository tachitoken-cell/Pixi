import { colosseumFloorHeight } from './colosseum.ts';
import { ALL_CITY_PROPS, CITY_LAYOUTS, ALL_CITY_FURNISHINGS, BANK_HOME_IDS, TOWN_HALL_SEATS } from './city.ts';
import type { ZoneId } from './content.ts';
import { groundHeight } from './landscape.ts';
import { VILLAGES, VILLAGE_PROPS, VILLAGE_PROP_SIZES, villagePropHeight } from './settlements.ts';

export interface Building {
  id: string; kind: 'cottage' | 'inn' | 'auction-hall' | 'clocktower'; x: number; z: number; y: number; rotation: number;
  width: number; depth: number; zone: ZoneId;
}
export interface BuildingChair { id: string; buildingId: string; x: number; z: number; y: number; rotation: number }
export const BUILDING_WALL_THICKNESS = .35;
export const BUILDING_DOOR_WIDTH = 2.8;
export const buildingDoorWidth = (building: Pick<Building,'kind'>) => building.kind === 'auction-hall' ? 6 : building.kind === 'clocktower' ? 4 : BUILDING_DOOR_WIDTH;
export const BUILDING_RAMP_LENGTH = 3;
export const BUILDING_SEAT_HEIGHT = .8;
export const BUILDING_FLOOR_LIFT = .08; // Keep floorboards above the terrain surface.
export function buildingPoint(building: Pick<Building, 'x' | 'z' | 'rotation'>, x: number, z: number) {
  const c = Math.cos(building.rotation), s = Math.sin(building.rotation);
  return { x: building.x + x * c + z * s, z: building.z - x * s + z * c };
}
function localPoint(building: Building, x: number, z: number) {
  const dx = x - building.x, dz = z - building.z, c = Math.cos(building.rotation), s = Math.sin(building.rotation);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
export const BUILDINGS: readonly Building[] = [
  ...CITY_LAYOUTS.flatMap(city=>[
    ...city.props.filter(p=>p.kind==='city-clocktower'||p.kind==='city-auction-hall').map(prop=>({...prop,kind:prop.kind==='city-clocktower'?'clocktower' as const:'auction-hall' as const,zone:city.zone,y:groundHeight(prop.x,prop.z)+BUILDING_FLOOR_LIFT})),
    ...city.homes.map(home=>({...home,zone:city.zone,y:groundHeight(home.x,home.z)+BUILDING_FLOOR_LIFT})),
  ]),
  ...VILLAGE_PROPS.flatMap(prop => prop.kind !== 'inn' && prop.kind !== 'cottage' ? [] : [{
    id: prop.id, kind: prop.kind, x: prop.x, z: prop.z, y: villagePropHeight(prop) + BUILDING_FLOOR_LIFT, rotation: prop.rotation,
    zone: VILLAGES.find(village => village.id === prop.villageId)!.zone, ...VILLAGE_PROP_SIZES[prop.kind],
  }]),
];
export const BUILDING_CHAIRS: readonly BuildingChair[] = BUILDINGS.flatMap(building => building.kind === 'clocktower' ? TOWN_HALL_SEATS.map((seat,index)=>({
  id:`${building.id}-chair-${index}`,buildingId:building.id,...buildingPoint(building,seat.x,seat.z),y:building.y+BUILDING_SEAT_HEIGHT,rotation:building.rotation+seat.rotation,
})) :
  (building.kind==='auction-hall' || building.id===BANK_HOME_IDS[building.zone] ? [] : building.kind === 'inn' ? [-1.5, 1.5] : [-1.5]).flatMap((z, row) => [-1,1].map((side, index) => ({
    id: `${building.id}-chair-${row * 2 + index}`, buildingId: building.id,
    ...buildingPoint(building, side * 2.8, z), y: building.y + BUILDING_SEAT_HEIGHT,
    rotation: building.rotation - side * Math.PI / 2,
  }))));
/** Bed footprints are authored in build-house-assets.py, with reachable aisle-side approaches. */
export const BUILDING_BEDS = BUILDINGS.filter(building => ['cottage','inn'].includes(building.kind) && building.id !== BANK_HOME_IDS[building.zone]).flatMap(building => [-1,1].map(side => ({
  id: `${building.id}-bed-${side}`, buildingId: building.id, zone: building.zone,
  ...buildingPoint(building, side*(building.width/2-.95), building.kind==='inn'?2.65:1.5),
  approach: buildingPoint(building, side*(building.width/2-2.15), building.kind==='inn'?2.65:1.5),
  y: building.y + .85, rotation: building.rotation,
})));
export const chairApproach = (chair: BuildingChair) => ({ x: chair.x + Math.sin(chair.rotation) * .85, z: chair.z + Math.cos(chair.rotation) * .85 });
export function buildingAt(x: number, z: number) {
  return BUILDINGS.find(building => {
    const p = localPoint(building,x,z);
    return Math.abs(p.x) < building.width/2 && Math.abs(p.z) < building.depth/2;
  });
}
/** The same floor and front ramp support authoritative movement and rendered actors. */
export function buildingFloorHeight(x: number, z: number) {
  const ground = groundHeight(x,z), terrace = colosseumFloorHeight(x,z);
  if (terrace !== undefined) return Math.max(ground,terrace);
  for (const building of BUILDINGS) {
    const p = localPoint(building,x,z);
    if (Math.abs(p.x) <= building.width/2 && Math.abs(p.z) <= building.depth/2) return Math.max(ground,building.y);
    const distance = p.z - building.depth/2;
    if (Math.abs(p.x) <= buildingDoorWidth(building)/2 && distance >= 0 && distance <= BUILDING_RAMP_LENGTH) {
      const foot = buildingPoint(building,p.x,building.depth/2+BUILDING_RAMP_LENGTH);
      const base = groundHeight(foot.x,foot.z);
      return Math.max(ground, building.y + (base-building.y) * distance/BUILDING_RAMP_LENGTH);
    }
  }
  if (ALL_CITY_PROPS.some(p => /pavilion|stable|market-stall/.test(p.kind) && Math.abs(x-p.x)<=p.width/2 && Math.abs(z-p.z)<=p.depth/2)) return ground+BUILDING_FLOOR_LIFT;
  return ground;
}
function box(building: Building, x: number, z: number, width: number, depth: number) {
  const turned = Math.abs(Math.sin(building.rotation)) > .5;
  return { ...buildingPoint(building,x,z), r: Math.hypot(width,depth)/2,
    halfWidth: (turned ? depth : width)/2, halfDepth: (turned ? width : depth)/2 };
}
export const BUILDING_COLLIDERS = BUILDINGS.flatMap(building => {
  if (['auction-hall','clocktower'].includes(building.kind)) return []; // Shared city kit owns civic walls and counters.
  const { width:w, depth:d } = building, wall = BUILDING_WALL_THICKNESS, wing = (w-BUILDING_DOOR_WIDTH)/2;
  return [
    box(building,-w/2,0,wall,d+wall), box(building,w/2,0,wall,d+wall), box(building,0,-d/2,w,wall),
    box(building,-(BUILDING_DOOR_WIDTH+wing)/2,d/2,wing,wall), box(building,(BUILDING_DOOR_WIDTH+wing)/2,d/2,wing,wall),
    ...building.id===BANK_HOME_IDS[building.zone] ? [] : [box(building,0,-1.5,2.2,1.4),
    box(building,0,-d/2+.57,2.96,.8),
    ...[-1,1].flatMap(side=>[
      box(building,side*(w/2-.57),-d/2+1.83,.8,2.33),
      box(building,side*(w/2-.95),building.kind==='inn'?2.65:1.5,1.50,2.8),
    ]),
    ],
    ...BUILDING_CHAIRS.filter(chair=>chair.buildingId===building.id).map(chair => ({ x:chair.x,z:chair.z,r:.4,halfWidth:.35,halfDepth:.35 })),
  ];
});

/** Interior furniture shares the same collision as its exported Blender footprint. */
export const CIVIC_FURNITURE_COLLIDERS = ALL_CITY_FURNISHINGS.flatMap(prop=>{
  if(!prop.buildingId||prop.kind==='bank-crest')return [];
  const building=BUILDINGS.find(b=>b.id===prop.buildingId);if(!building)throw new Error(`Missing furnishing room: ${prop.buildingId}`);
  return [box(building,prop.x,prop.z,prop.width,prop.depth)];
});
