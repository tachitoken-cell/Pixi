import { AUCTIONEER, BANKER, BANK_HOME_IDS, CITY_LAYOUTS, DEED_AUCTIONEER } from './city.ts';

const bankers = ['Elara Mossledger', 'Tamsin Amberlock', 'Edda Frostvault', 'Vesper Nightledger', 'Samira Goldscale', 'Iona Reedkeeper'];
const auctioneers = ['Merrick Ledger', 'Corin Copperleaf', 'Oskar Snowhammer', 'Silas Dusktrade', 'Farid Sunmarket', 'Nessa Willowbid'];

export const BANKERS = CITY_LAYOUTS.map((city, index) => {
  const home = city.homes.find(home => home.id === BANK_HOME_IDS[city.zone])!;
  return { ...BANKER, id: index ? `${city.id}-banker` : BANKER.id, name: bankers[index], cityName: city.name,
    zone: city.zone, x: home.x, z: home.z, rotation: home.rotation };
});
export const AUCTIONEERS = CITY_LAYOUTS.map((city, index) => {
  const hall = city.props.find(prop => prop.kind === 'city-auction-hall')!;
  return { ...AUCTIONEER, id: index ? `${city.id}-auctioneer` : AUCTIONEER.id, name: auctioneers[index], cityName: city.name,
    zone: city.zone, x: hall.x - 3 * Math.sin(hall.rotation), z: hall.z - 3 * Math.cos(hall.rotation), rotation: hall.rotation };
});
export const CITY_SERVICE_NPCS = [...BANKERS, ...AUCTIONEERS, DEED_AUCTIONEER];
