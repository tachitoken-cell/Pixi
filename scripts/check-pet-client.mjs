import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setRaidAssets } from '../src/monster-models.ts';
import { PETS, PET_LOOT_QUALITIES } from '../src/pets.ts';
import { nftAsset } from '../src/nfts.ts';
import { MOUNTS, newTravel } from '../src/travel.ts';
import { createPetFollowers, createPetModel, setPetAssets, animatePetModel } from '../src/pet-models.ts';
import { renderPetCollection, renderMountCollection, petDropLabel } from '../src/pet-ui.ts';

const assets = new THREE.Group();
for (const pet of PETS) {
  const root = new THREE.Group(); root.name = pet.id;
  for (const part of ['head', 'tail', 'leg-front-left', 'leg-front-right', 'leg-rear-left', 'leg-rear-right', 'wing-left', 'wing-right']) {
    const node = new THREE.Group(); node.name = `${pet.id}-${part}`; node.rotation.x = .12; root.add(node);
  }
  assets.add(root);
}
setPetAssets(assets);
const raidBytes=readFileSync(new URL('../public/models/horned-apostle.glb',import.meta.url));
const raidAsset=await new GLTFLoader().parseAsync(raidBytes.buffer.slice(raidBytes.byteOffset,raidBytes.byteOffset+raidBytes.byteLength),'');setRaidAssets(raidAsset.scene,raidAsset.animations);
const scene = new THREE.Scene(), terrain = (x, z) => x * .1 + z * .03;
const followers = createPetFollowers(scene, terrain), owner = { id: 'local', pet: 'moss-fox', x: 0, z: 0, rotation: 0 };
followers.update([owner], .016, 0);
assert.equal(scene.children.length, 1);
let fox = scene.children[0]; const start = fox.position.clone();
followers.update([{ ...owner, x: 8 }], .016, 1);
assert(fox.position.x > start.x && fox.position.x < 8, 'pet follows without jumping to every movement update');
assert.equal(fox.position.y, terrain(fox.position.x, fox.position.z), 'follower samples terrain at its own position');
followers.update([{ ...owner, x: 100 }], .016, 2);
assert(Math.abs(fox.position.x - 101.15) < 1e-8, 'distant pet catches up after a teleport');
followers.update([{ ...owner, pet: 'golden-pig' }], .016, 3);
assert.equal(followers.size, 1); assert.equal(scene.children.length, 1); assert.equal(fox.parent, null, 'changing pet removes the previous model');
assert.equal(scene.children[0].userData.petId, 'golden-pig');
followers.update([owner, { ...owner, id: 'remote', pet: 'moon-owl' }], .016, 4);
assert.equal(followers.size, 2, 'local and remote companions render independently');
followers.update([{ ...owner, id: 'remote', pet: 'moon-owl' }], .016, 5);
assert.equal(followers.size, 1); assert.equal(scene.children[0].userData.ownerId, 'remote', 'departing owner cannot leave a ghost pet');
followers.clear(); assert.equal(scene.children.length, 0); assert.equal(followers.size, 0);
const blocked = createPetFollowers(scene, terrain, () => false);
blocked.update([owner], .016, 0); assert.equal(scene.children[0].position.x, owner.x); assert.equal(scene.children[0].position.z, owner.z); blocked.clear();
followers.update([{ ...owner, petPosition: { x: 0, z: 0 } }], .1, 0);
fox = scene.children[0];
const collecting = { ...owner, petPosition: { x: 5, z: 0 } };
followers.update([collecting], .1, 1);
assert(fox.position.x > 0 && fox.position.x < 5, 'the pet visibly travels toward authoritative loot coordinates instead of teleporting');
for (let i = 0; i < 60; i++) followers.update([collecting], .1, 1 + i / 10);
assert(Math.abs(fox.position.x - 5) < .18, 'the pet reaches the loot while its owner stays put');
for (let i = 0; i < 60; i++) followers.update([{ ...owner, petPosition: { x: 0, z: 0 } }], .1, 8 + i / 10);
assert(Math.abs(fox.position.x) < .18 && Math.abs(fox.position.z) < .18, 'the pet visibly returns to the server-selected follow position');
followers.update([{ ...owner, petPosition: { x: NaN, z: 0 } }], .1, 15);
assert(fox.position.toArray().every(Number.isFinite), 'invalid server coordinates use the safe legacy follow target');
followers.clear();
const wall = createPetFollowers(scene, terrain, (from, to) => (from.x < 2) === (to.x < 2));
wall.update([{ ...owner, petPosition: { x: 0, z: 0 } }], .1, 0);
wall.update([collecting], .1, 1); assert.equal(scene.children[0].position.x, 0, 'loot behind a wall is not a valid visual destination');
wall.clear(); wall.update([{ ...owner, x: 30, petPosition: { x: 30, z: 0 } }], .1, 0);
wall.update([{ ...owner, petPosition: { x: -5, z: 0 } }], .1, 1);
assert.equal(scene.children[0].position.x, 30, 'catch-up never teleports through a wall toward an outbound loot destination');
wall.update([{ ...owner, petPosition: { x: 0, z: 0 } }], .1, 1);
assert.equal(scene.children[0].position.x, 0, 'authoritative catch-up can recover beside an owner who teleported'); wall.clear();
for (const petPosition of [undefined, null, { x: NaN, z: 0 }]) {
  wall.update([{ ...owner, x: 30 }], .1, 0); wall.update([{ ...owner, petPosition }], .1, 1);
  assert.equal(scene.children[0].position.x, 1.15, 'legacy follow recovers beside the owner when a wall blocks its previous position'); wall.clear();
}

for (const pet of PETS) {
  const a = createPetModel(pet.id), b = createPetModel(pet.id);
  const head = a.getObjectByName(`${pet.id==='death-apostle'?'horned-apostle':pet.id}-head`), resting = head.rotation.clone();
  animatePetModel(a, 1, true); const pose = head.quaternion.clone();
  animatePetModel(a, 1, true); assert(head.quaternion.equals(pose), 'sampling a pose twice does not accumulate rotation');
  assert(b.getObjectByName(`${pet.id==='death-apostle'?'horned-apostle':pet.id}-head`).rotation.equals(resting), 'each follower owns its joint transforms');
  for (const time of [0, .2, 1, 20]) for (const moving of [true, false]) {
    animatePetModel(a, time, moving); a.updateMatrixWorld(true);
    a.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), `${pet.id} has finite transforms`));
  }
}

const player = { ownedPets: [], summonedPet: null, carriedItems: {}, hp: 100, zeppelin: null };
const empty = renderPetCollection(player, true);
const lootSelect = html => html.match(/<select\b[^>]*id="pet-loot-quality"[^>]*>[\s\S]*?<\/select>/)?.[0];
assert.match(lootSelect(empty), /aria-describedby="pet-loot-help"/, 'rarity selector exposes its collection rules');
assert.match(empty, /<label for="pet-loot-quality">Minimum item rarity<\/label>/);
assert.match(empty, /Summon a pet to collect/, 'loot rules explain the summoned-pet requirement');
assert.match(lootSelect(empty), /<option value="uncommon" selected>/, 'old characters default to uncommon');
assert.match(lootSelect(empty), /<option value="common" >Common and better<\/option>/, 'Common pickup is an explicit opt-in');
assert.equal([...lootSelect(empty).matchAll(/<option\b/g)].length, 6);
assert.doesNotMatch(lootSelect(empty), /disabled/, 'rarity can be set before a pet is summoned');
assert.match(lootSelect(renderPetCollection(player, false)), /disabled/, 'disconnected settings cannot be changed');
for (const quality of PET_LOOT_QUALITIES) {
  const select = lootSelect(renderPetCollection({ ...player, petLootMinQuality: quality }, true));
  assert.equal([...select.matchAll(/<option\b/g)].length, 6, 'Common through Mythic are the available thresholds');
  assert.match(select, new RegExp(`<option value="${quality}" selected>`));
  assert.equal([...select.matchAll(/\bselected\b/g)].length, 1, 'exactly the saved threshold is selected');
}
function button(html, attribute, value) {
  const match = html.match(new RegExp(`<button\\b[^>]*\\b${attribute}="${value}"[^>]*>[\\s\\S]*?</button>`));
  assert(match, `Missing ${attribute}="${value}"`); return match[0];
}
function preview(html, kind, id) {
  assert.equal([...html.matchAll(/<canvas\b/g)].length, 1, 'one selected companion uses one preview canvas');
  assert.match(html, new RegExp(`<canvas\\b[^>]*id="collection-preview"[^>]*data-kind="${kind}"[^>]*data-id="${id}"`));
  for (const tab of ['pets', 'mounts']) assert(button(html, 'data-collection-tab', tab));
  for (const direction of ['-1', '1']) assert.match(button(html, 'data-collection-rotate', direction), /aria-label="Rotate preview (?:left|right)"/);
}
assert.equal([...empty.matchAll(/data-collection-select=/g)].length, PETS.length);
assert.equal([...empty.matchAll(/data-learn-pet=/g)].length, 1, 'only the selected pet exposes an action');
preview(empty, 'pets', PETS[0].id);
assert.equal(petDropLabel(.00025), '0.025% · 1 in 4,000');
for (const pet of PETS) {
  assert(empty.includes(`src="${pet.icon}"`));
  const selected = renderPetCollection(player, true, 0, pet.id);
  preview(selected, 'pets', pet.id);
  assert.match(button(selected, 'data-collection-select', pet.id), /aria-pressed="true"/);
  assert.doesNotMatch(button(selected, 'data-collection-select', pet.id), /\bdisabled\b/, 'unowned companions remain browsable');
  assert.match(button(selected, 'data-learn-pet', pet.id), /\bdisabled\b/, 'unowned pets cannot be learned without a carried drop');
  assert(!selected.includes('Infinity'));
  if (pet.storeOnly) assert.match(selected, /Ingame store · Burn \$20 worth of MOSS/);
  else if (pet.retired || pet.source === 'moss-slime') {
    assert.match(selected, pet.retired ? /Retired from drops/ : /No longer drops/);
    assert.doesNotMatch(selected, /0\.025% · 1 in 4,000/);
    assert.match(button(selected, 'data-learn-pet', pet.id), />Buy an existing copy at auction/);
    assert.doesNotMatch(selected, /<span>Source<\/span> Ingame store|0% ·|Infinity/);
    assert.doesNotMatch(button(renderPetCollection({ ...player, carriedItems: { [pet.id]: 1 } }, true, 0, pet.id), 'data-learn-pet', pet.id), /\bdisabled\b/, 'existing retired copies can still be learned');
    assert.doesNotMatch(button(renderPetCollection({ ...player, ownedPets: [pet.id] }, true, 0, pet.id), 'data-summon-pet', pet.id), /\bdisabled\b/, 'every owned retired pet remains summonable');
  }
  else if (pet.source) {
    assert.match(selected, /0\.025% · 1 in 4,000/);
    if (pet.source === 'ashen-crown-titan') assert.match(selected, /Level 40 world boss/);
    else assert.match(selected, /Level 10 or higher/);
  }
  else assert(!selected.includes('Level 1<'), 'ordinary enemies have no misleading fixed level');
  if (!pet.retired && !pet.storeOnly && !('referralOnly' in pet) && nftAsset('pet', pet.id)) {
    const configured = renderPetCollection({ ...player, nftConfigured: true, carriedItems: { [pet.id]: 1 } }, true, 0, pet.id);
    assert.doesNotMatch(button(configured, 'data-claim-nft-pet', pet.id), /\bdisabled\b/, 'each new drop can enter the wallet claim review');
    assert.doesNotMatch(button(configured, 'data-learn-pet', pet.id), /\bdisabled\b/, 'new pet learning remains optional alongside NFT minting');
    const previouslyLearned = renderPetCollection({ ...player, ownedPets: [pet.id], nftConfigured: true }, true, 0, pet.id);
    assert.match(button(previouslyLearned, 'data-claim-nft-pet', pet.id), />Mint NFT · review/);
    assert.match(button(previouslyLearned, 'data-summon-pet', pet.id), />Summon/);
    assert.match(previouslyLearned, /character unlock is exchanged for wallet ownership/, 'existing owners see the conversion cost before review');
  }
}
const carried = renderPetCollection({ ...player, carriedItems: { 'golden-pig': 2 } }, true, 0, 'golden-pig');
assert.match(button(carried, 'data-learn-pet', 'golden-pig'), />Learn pet · consumes 1/);
assert.doesNotMatch(button(carried, 'data-learn-pet', 'golden-pig'), /\bdisabled\b/);
assert.match(button(renderPetCollection({ ...player, carriedItems: { 'store-ashwing': 1 } }, true, 0, 'store-ashwing'), 'data-learn-pet', 'store-ashwing'), /\bdisabled\b/, 'store pets never expose an inventory learn action');
const learned = { ...player, ownedPets: ['moss-fox', 'golden-pig'], summonedPet: 'moss-fox' };
const collection = renderPetCollection(learned, true);
preview(collection, 'pets', 'moss-fox');
assert.match(button(collection, 'data-summon-pet', ''), />Dismiss/);
assert(!collection.includes('data-summon-pet="golden-pig"'), 'browsing does not expose actions for other pets');
const selectedOwned = renderPetCollection(learned, true, 0, 'golden-pig');
assert.match(button(selectedOwned, 'data-summon-pet', 'golden-pig'), />Summon/);
assert(!selectedOwned.includes('data-summon-pet=""'), 'selecting a different pet does not treat it as summoned');
preview(renderPetCollection({ ...player, ownedPets: ['golden-pig'] }, true), 'pets', 'golden-pig');
const nftOwned = { ...player, nftPets: ['moon-owl'], nftConfigured: true };
assert.match(button(renderPetCollection(nftOwned, true, 0, 'moon-owl'), 'data-summon-pet', 'moon-owl'), />Summon/);
const nftDrop = { ...player, nftConfigured: true, carriedItems: { 'moss-fox': 1 } };
const claim = renderPetCollection(nftDrop, true, 0, 'moss-fox');
assert.match(button(claim, 'data-claim-nft-pet', 'moss-fox'), />Claim NFT · review/);
assert(!claim.includes('data-learn-pet='), 'configured NFT drops cannot be permanently learned');
for (const [changes, connected] of [[{ hp: 0 }, true], [{ zeppelin: {} }, true], [{}, false]]) {
  assert.match(button(renderPetCollection({ ...learned, ...changes }, connected), 'data-summon-pet', ''), /\bdisabled\b/);
  assert.match(button(renderPetCollection({ ...nftDrop, ...changes }, connected, 0, 'moss-fox'), 'data-claim-nft-pet', 'moss-fox'), /\bdisabled\b/);
  assert.match(button(renderPetCollection({ ...player, carriedItems: { 'golden-pig': 1 }, ...changes }, connected, 0, 'golden-pig'), 'data-learn-pet', 'golden-pig'), /\bdisabled\b/);
}

for (const pet of PETS.filter(pet => pet.storeOnly)) {
  const owned = { ...player, ownedPets: [pet.id], nftConfigured: true, nftMintablePets: [pet.id] };
  const eligible = renderPetCollection(owned, true, 0, pet.id);
  assert.doesNotMatch(button(eligible, 'data-claim-nft-pet', pet.id), /\bdisabled\b/, 'enabled store companions can enter conversion review');
  assert.match(eligible, /verified MOSS purchase/);
  const disabled = renderPetCollection({ ...owned, nftMintablePets: [] }, true, 0, pet.id);
  assert.match(button(disabled, 'data-claim-nft-pet', pet.id), /\bdisabled\b/, 'store conversion respects the advertised mintable species');
}
const unavailableNewPet = renderPetCollection({ ...player, nftConfigured: true, nftMintablePets: ['moss-fox'], carriedItems: { 'fern-lynx': 1 } }, true, 0, 'fern-lynx');
assert.doesNotMatch(button(unavailableNewPet, 'data-learn-pet', 'fern-lynx'), /\bdisabled\b/, 'mint availability never removes the shipped Learn option');
assert.match(button(unavailableNewPet, 'data-claim-nft-pet', 'fern-lynx'), /\bdisabled\b/, 'unavailable new collection disables only Mint');

const rider = { hp: 100, zeppelin: null, level: 25, ridingRank: 1, ownedMounts: ['horse'], travel: newTravel() };
for (const mount of MOUNTS) {
  const html = renderMountCollection(rider, true, mount.id, 'horse', true);
  preview(html, 'mounts', mount.id);
  assert.equal([...html.matchAll(/data-collection-select=/g)].length, MOUNTS.length);
  assert.match(button(html, 'data-collection-select', mount.id), /aria-pressed="true"/);
  assert.doesNotMatch(button(html, 'data-collection-select', mount.id), /\bdisabled\b/, 'all mounts can be previewed');
  assert.equal([...html.matchAll(/data-ride-mount=/g)].length, 1, 'only selected mount gets a ride control');
  assert.equal(/\bdisabled\b/.test(button(html, 'data-ride-mount', mount.id)), mount.id !== 'horse', 'only an owned mount can be summoned');
  assert.equal(html.includes('data-prefer-mount='), mount.id === 'horse', 'only owned mounts can become the preference');
  assert(button(html, 'data-find-trainer', 'riding-trainer'));
}
const storeMount = renderMountCollection({ ...rider, ownedMounts: ['store-embermane'] }, true, 'store-embermane', 'horse', true);
const rareMount = renderMountCollection(rider, true, 'verdant-revenant', 'horse', true);
assert.match(rareMount, /Veiled Abbess.*1 in 10,000.*Drops as an unlearned item/);
assert.doesNotMatch(rareMount, /data-find-trainer="mount-seller"|undefined gold/, 'drop-only mounts never show vendor prices or directions');
assert.doesNotMatch(button(storeMount, 'data-ride-mount', 'store-embermane'), /\bdisabled\b/, 'owned store mounts use learned riding');
assert.doesNotMatch(button(storeMount, 'data-prefer-mount', 'store-embermane'), /\bdisabled\b/, 'store mounts can be preferred');
assert.match(button(renderMountCollection(rider, true, 'horse', 'horse', true), 'data-prefer-mount', 'horse'), /\bdisabled\b/, 'current preference is clearly marked');
for (const [changes, connected, outdoors] of [[{ hp: 0 }, true, true], [{ zeppelin: {} }, true, true], [{}, false, true], [{ level: 24 }, true, true], [{ ridingRank: 0 }, true, true], [{}, true, false]]) {
  assert.match(button(renderMountCollection({ ...rider, ...changes }, connected, 'horse', 'horse', outdoors), 'data-ride-mount', 'horse'), /\bdisabled\b/);
}
const mountHolder = { ...rider, nftMountsConfigured: true, nftMintableMounts: ['verdant-revenant'], carriedItems: { 'verdant-revenant': 2 } };
const mountDrop = renderMountCollection(mountHolder, true, 'verdant-revenant', 'horse', true);
assert.doesNotMatch(button(mountDrop, 'data-learn-mount', 'verdant-revenant'), /\bdisabled\b/);
assert.doesNotMatch(button(mountDrop, 'data-claim-nft-mount', 'verdant-revenant'), /\bdisabled\b/);
assert.match(mountDrop, /Learn mount · consumes 1/);
const mountUnavailable = renderMountCollection({ ...mountHolder, nftMountsConfigured: false }, true, 'verdant-revenant', 'horse', true);
assert.doesNotMatch(button(mountUnavailable, 'data-learn-mount', 'verdant-revenant'), /\bdisabled\b/, 'collection outage leaves learning available');
assert.match(button(mountUnavailable, 'data-claim-nft-mount', 'verdant-revenant'), /\bdisabled\b/);
const walletRider = { ...rider, nftMounts: ['verdant-revenant'] };
const walletMount = renderMountCollection(walletRider, true, 'verdant-revenant', 'horse', true);
assert.doesNotMatch(button(walletMount, 'data-ride-mount', 'verdant-revenant'), /\bdisabled\b/, 'wallet ownership grants riding');
assert.doesNotMatch(button(walletMount, 'data-prefer-mount', 'verdant-revenant'), /\bdisabled\b/);
assert.match(walletMount, /Owned by your wallet/);
assert.match(button(renderMountCollection({ ...walletRider, nftMounts: [] }, true, 'verdant-revenant', 'horse', true), 'data-ride-mount', 'verdant-revenant'), /\bdisabled\b/, 'transfer removes wallet riding rights');
for (const id of ['horse', 'wolf']) assert(!renderMountCollection({ ...mountHolder, ownedMounts: ['horse', 'wolf'] }, true, id, 'horse', true).includes('data-claim-nft-mount'), 'vendor mounts never expose minting');
for (const id of ['store-embermane', 'store-cinderfang']) {
  const html = renderMountCollection({ ...rider, ownedMounts: [id], nftMountsConfigured: true, nftMintableMounts: [id] }, true, id, 'horse', true);
  assert.doesNotMatch(button(html, 'data-claim-nft-mount', id), /\bdisabled\b/);
  assert.match(html, /verified MOSS purchase/);
}
const mounted = { ...rider, travel: { ...rider.travel, mount: 'horse' } };
assert.doesNotMatch(button(renderMountCollection(mounted, true, 'wolf', 'horse', false), 'data-ride-mount', ''), /\bdisabled\b/, 'an active mount can be dismissed while browsing an unowned mount or indoors');
for (const [changes, connected] of [[{ hp: 0 }, true], [{ zeppelin: {} }, true], [{}, false]]) {
  assert.match(button(renderMountCollection({ ...mounted, ...changes }, connected, 'wolf', 'horse', true), 'data-ride-mount', ''), /\bdisabled\b/);
}

if (!process.argv.includes('--skip-assets')) {
  const assets = new THREE.Group();
  for (const path of ['pets', 'store-collection', 'wild-pets', 'autumn-pets', 'wayfinder-sprite']) {
    const bytes = readFileSync(new URL(`../public/models/${path}.glb`, import.meta.url));
    assets.add((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene);
  }
  setPetAssets(assets);
  for (const pet of PETS) {
    const model = createPetModel(pet.id), bounds = new THREE.Box3().setFromObject(model), height = bounds.max.y - bounds.min.y;
    assert(bounds.min.y >= -.06 && bounds.min.y <= .15, `${pet.id} feet align to the ground: ${bounds.min.y}`);
    assert(height >= .4 && height <= 2, `${pet.id} has pet-scale Y-up bounds: ${height}`);
    assert(bounds.max.z - bounds.min.z < 3, `${pet.id} is not lying on its side`);
    let triangles = 0, meshes = 0;
    model.traverse(node => { if (node.isMesh) { meshes++; triangles += node.geometry.index ? node.geometry.index.count / 3 : node.geometry.attributes.position.count / 3; } });
    assert(triangles > 1000 && meshes > 1, `${pet.id} has a detailed authored model`);
    assert(readFileSync(new URL(`../public${pet.icon}`, import.meta.url)).length > 1000, `${pet.id} has a rendered portrait`);
    for (const moving of [false, true]) for (const time of [0, .25, 1, 8]) {
      animatePetModel(model, time, moving); model.updateMatrixWorld(true);
      model.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), `${pet.id} exported rig remains finite`));
    }
    console.log(`${pet.name}: ${Math.round(triangles).toLocaleString('en-US')} triangles, ${meshes} meshes, ${height.toFixed(2)}m tall`);
  }
}
console.log('PASS: pet loot rarity controls, journal selection/preview metadata, pet ownership/learning/NFT guards, mount ownership/riding/dismount guards, one companion per owner, remote cleanup, grounded follow/catch-up, animation isolation and pet assets.');

// Filtering must never retain an action for a hidden/unowned selection or count stale IDs.
const filteredOwner = { ...player, ownedPets:['moss-fox','moss-fox','removed-pet'], nftPets:['moss-fox','moon-owl'], ownedMounts:['horse'], nftMounts:['horse'] };
const onlyOwned = renderPetCollection(filteredOwner, true, 0, 'golden-pig', {collectedOnly:true});
assert.equal([...onlyOwned.matchAll(/data-collection-select=/g)].length,2);
assert.match(onlyOwned, /<strong>2<\/strong> \/ \d+ collected/);
assert.doesNotMatch(onlyOwned, /data-(?:learn|summon)-pet="golden-pig"/);
const owlSearch = renderPetCollection(filteredOwner, true, 0, 'moss-fox', {search:'  MOON  ',collectedOnly:true});
preview(owlSearch,'pets','moon-owl');
assert.equal([...owlSearch.matchAll(/data-collection-select=/g)].length,1);
const noMatch = renderPetCollection(filteredOwner, true, 0, 'moon-owl', {search:'<missing>"'});
assert.match(noMatch,/value="&lt;missing&gt;&quot;"/);
assert.match(noMatch,/No pets match these filters/);
assert.doesNotMatch(noMatch, /<canvas|data-(?:summon|learn|claim-nft)-pet=/);
assert.match(noMatch,/id="pet-loot-quality"/,'pet pickup preference remains available with no search result');
const carriedOnly = renderPetCollection({...player,carriedItems:{'moss-fox':1}},true,0,'moss-fox',{collectedOnly:true});
assert.match(carriedOnly,/No pets match/,'unlearned items do not count as collection ownership');
const mountOwner = {hp:100,zeppelin:null,level:60,ridingRank:2,travel:newTravel(),ownedMounts:[MOUNTS[0].id,MOUNTS[0].id,'removed-mount'],nftMounts:[MOUNTS[1].id]};
const filteredMount = renderMountCollection(mountOwner,true,MOUNTS[0].id,MOUNTS[0].id,true,{search:MOUNTS[1].name,collectedOnly:true});
preview(filteredMount,'mounts',MOUNTS[1].id);
assert.equal([...filteredMount.matchAll(/data-collection-select=/g)].length,1);
assert.match(filteredMount,/<strong>2<\/strong> \/ \d+ collected/);
assert.doesNotMatch(renderMountCollection(mountOwner,true,MOUNTS[0].id,MOUNTS[0].id,true,{search:'not-a-mount'}),/<canvas|data-ride-mount=/);
console.log('PASS collection filters: true catalog ownership counts, deduplication, wallet pets/mounts, escaped search, visible selection and action-free empty state.');
