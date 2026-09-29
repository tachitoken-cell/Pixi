import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { NFT_PETS, NFT_MOUNTS, NFT_HOUSES } from '../src/nfts.ts';
import { BUILDINGS } from '../src/buildings.ts';

const origin = 'https://mossvale.world', root = new URL('../public/nfts/', import.meta.url);
const write = (file, data) => writeFileSync(new URL(file, root), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
for (const folder of ['pets', 'mounts', 'houses']) mkdirSync(new URL(`${folder}/`, root), { recursive: true });
for (const pet of NFT_PETS) {
  assert(existsSync(new URL(`../public${pet.icon}`, import.meta.url)));
  write(`pets/${pet.assetId}.json`, { name: pet.name, description: `${pet.description} This Mossvale Pets NFT grants its current verified wallet holder access to this cosmetic companion in Mossvale. Selling or transferring it moves that access to the new holder.`, image: `${origin}${pet.icon}`, external_url: origin,
    attributes: [{ trait_type: 'Species', value: pet.name }, { trait_type: 'Game asset', value: pet.id }, { trait_type: 'Rarity', value: pet.quality }, { trait_type: 'Source', value: pet.retired ? 'Retired from drops' : pet.storeOnly ? 'Store purchase' : pet.source }] });
}
for (const mount of NFT_MOUNTS) {
  assert(existsSync(new URL(`../public${mount.icon}`, import.meta.url)));
  write(`mounts/${mount.assetId}.json`, { name: mount.name, description: `${mount.description} This Mossvale Mounts NFT grants its current verified wallet holder access to this mount in Mossvale. Riding level and training are still required. Selling or transferring it moves that access to the new holder.`, image: `${origin}${mount.icon}`, external_url: origin,
    attributes: [{ trait_type: 'Mount', value: mount.name }, { trait_type: 'Game asset', value: mount.id }, { trait_type: 'Rarity', value: mount.quality }, { trait_type: 'Source', value: mount.storeOnly ? 'Store purchase' : mount.source }] });
}
for (const house of NFT_HOUSES) {
  const building = BUILDINGS.find(building => building.id === house.id);
  assert(building?.kind === 'cottage');
  assert(existsSync(new URL(`houses/${house.assetId}.png`, root)), `Missing trading card for deed ${house.assetId}`);
  write(`houses/${house.assetId}.json`, { name: house.name, description: `The unique Mossvale Houses deed for ${house.name} (${house.id}) in Greenwood. The current verified wallet holder owns this in-game house. One deed identifies this location across Mossvale realms; selling or transferring the NFT moves ownership to the new holder.`, image: `${origin}/nfts/houses/${house.assetId}.png`, external_url: origin,
    attributes: [{ trait_type: 'House ID', value: house.id }, { trait_type: 'Zone', value: building.zone }, { trait_type: 'Building', value: building.kind }, { trait_type: 'World X', value: building.x }, { trait_type: 'World Z', value: building.z }] });
}
write('pets/collection.json', { name: 'Mossvale Pets', description: 'Looted Mossvale companions whose in-game access follows their NFTs. Both collections specify a 5% resale royalty to the shared MOSS buy-and-burn receiver.', image: `${origin}/ui/pets/moss-fox.png`, external_link: origin });
write('houses/collection.json', { name: 'Mossvale Houses', description: 'Unique deeds for selected Mossvale houses. House ownership follows the current NFT holder. A 5% resale royalty funds MOSS buy-and-burn.', image: `${origin}/nfts/houses/1.png`, external_link: origin });
write('mounts/collection.json', { name: 'Mossvale Mounts', description: 'Collectible Mossvale mounts whose in-game access follows their NFTs. Riding requirements still apply. A 5% resale royalty funds MOSS buy-and-burn.', image: `${origin}/ui/mount-verdant-revenant.png`, external_link: origin });
console.log(`Built metadata for ${NFT_PETS.length} pet species, ${NFT_MOUNTS.length} mounts and ${NFT_HOUSES.length} unique house deeds. No collections published.`);
