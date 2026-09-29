import { PETS, PET_LOOT_QUALITIES, PET_LOOT_RADIUS, type PetId } from './pets.ts';
import { MONSTERS } from './bestiary.ts';
import type { Player } from './shared.ts';
import { TALENT_EFFECT_IDS } from './spells.ts';
import { MOUNTS, MOUNT_UNLOCK_LEVEL, MOUNT_UPGRADE_LEVEL, mountSpeed, type MountId } from './travel.ts';
import { MOUNT_PRICES } from './training.ts';
import { icon } from './icons.ts';
import { STORE_PRODUCTS } from './ingame-store.ts';
import { nftAsset, nftLearnedPetConvertible, nftLearnedMountConvertible } from './nfts.ts';

export function petDropLabel(chance: number) { return `${Number((chance * 100).toFixed(4))}% · 1 in ${Math.round(1 / chance).toLocaleString('en-US')}`; }

type CompanionPlayer = Pick<Player, 'hp' | 'zeppelin'> & Partial<Pick<Player, 'appearance' | 'talents' | 'combatCompanion' | 'tamedCompanion' | 'combatCompanionRecallAt' | 'travel' | 'gm'>>;

export function renderCombatCompanion(player: CompanionPlayer, connected: boolean, now = Date.now()) {
  if (player.appearance?.className !== 'Ranger' && !player.tamedCompanion) return '';
  const unlocked = player.appearance?.className === 'Ranger' && player.talents?.includes(TALENT_EFFECT_IDS.beastmaster);
  const active = player.combatCompanion, pet = active ?? player.tamedCompanion;
  const waiting = (player.combatCompanionRecallAt ?? 0) > now;
  const reason = !connected ? 'Reconnect to manage your companion.' : player.hp <= 0 ? 'Revive to recall your companion.' : !unlocked ? 'Learn Beastmaster in the Ranger talent tree.' : player.zeppelin ? 'Your companion will return after the zeppelin trip.' : player.travel?.mount ? 'Dismount to recall your companion.' : player.gm?.invisible ? 'Your companion is hidden while you are invisible.' : waiting ? `Leave combat to manage your companion (${Math.ceil(((player.combatCompanionRecallAt ?? 0) - now) / 1000)}s).` : '';
  const status = active?.hp ? active.targetId ? 'Fighting beside you' : 'Following you' : pet ? pet.hp <= 0 ? 'Defeated · Recall out of combat to revive' : 'Resting' : 'No creature tamed';
  return `<section class="combat-companion" aria-labelledby="combat-companion-title">
    <h3 id="combat-companion-title">Combat companion${pet ? ` · ${MONSTERS[pet.kind].name}` : ''}</h3>
    <p class="pet-current" role="status">${status}${pet ? ` · Level ${pet.level}` : ''}${active?.bondReady ? ' · Everlasting Bond ready: use a basic attack to heal your companion and deal bonus damage.' : ''}</p>
    ${active ? `<label class="combat-companion-health">Health <meter min="0" max="${active.maxHp}" value="${active.hp}" aria-label="${MONSTERS[active.kind].name} health">${active.hp} / ${active.maxHp}</meter><span>${active.hp} / ${active.maxHp}</span></label>` : pet ? `<p>${pet.hp} health remaining.</p>` : ''}
    ${pet ? `<button class="primary-button" type="button" data-combat-companion="${active?.hp ? 'dismiss' : 'recall'}" data-pet-action="combat-companion" ${reason ? 'disabled' : ''}>${active?.hp ? 'Dismiss companion' : pet.hp <= 0 ? 'Revive &amp; recall companion' : 'Recall companion'}</button>` : ''}
    ${reason ? `<p>${reason}</p>` : ''}
    <p>${unlocked ? 'Select a living creature at or below your level and use Tame Beast from Skills. World bosses and dungeon bosses cannot be tamed. Taming a new creature replaces your current combat companion. Your companion joins your attacks and receives the heals you receive. Use Combined Assault after learning it in your talent tree.' : 'Beastmaster lets you tame a creature to fight beside you and share your healing.'}</p>
  </section>`;
}

export type CollectionViewOptions = { search?: string; collectedOnly?: boolean };
const collectionEscape = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const collectedCount = (catalog: readonly {id: string}[], ids: readonly string[]) => catalog.filter(entry => ids.includes(entry.id)).length;
function collectionFilters(kind: 'pets' | 'mounts', view: CollectionViewOptions, shown: number, total: number) {
  return `<div class="collection-filters"><label for="collection-search">Search ${kind}</label><input id="collection-search" type="search" data-collection-search value="${collectionEscape(view.search ?? '')}" placeholder="Search by name…" autocomplete="off"><label class="collection-filter-owned"><input type="checkbox" data-collection-collected ${view.collectedOnly ? 'checked' : ''}> Collected only</label><span class="collection-filter-count" role="status">${shown} of ${total} shown</span></div>`;
}
function collectionTabs(kind: 'pets' | 'mounts', owned: number, total: number, player: Partial<Pick<Player, 'ownedPets' | 'nftPets' | 'ownedMounts' | 'nftMounts'>>) {
  const petCount = player.ownedPets || player.nftPets ? collectedCount(PETS, [...(player.ownedPets ?? []), ...(player.nftPets ?? [])]) : undefined;
  const mountCount = player.ownedMounts || player.nftMounts ? collectedCount(MOUNTS, [...(player.ownedMounts ?? []), ...(player.nftMounts ?? [])]) : undefined;
  return `<div class="collection-toolbar"><nav class="collection-tabs" aria-label="Companion collections">
    <button type="button" data-collection-tab="pets" aria-pressed="${kind === 'pets'}">Pets${petCount === undefined ? '' : `<span class="collection-tab-count">${petCount}</span>`}</button>
    <button type="button" data-collection-tab="mounts" aria-pressed="${kind === 'mounts'}">Mounts${mountCount === undefined ? '' : `<span class="collection-tab-count">${mountCount}</span>`}</button>
  </nav><span class="collection-count"><strong>${owned}</strong> / ${total} collected</span></div><progress class="collection-progress" max="${total}" value="${owned}" aria-label="${kind === 'pets' ? 'Pets' : 'Mounts'} collected">${owned} / ${total}</progress>`;
}

function collectionStage(kind: 'pets' | 'mounts', id: string, name: string, art: string) {
  return `<div id="collection-stage" class="collection-stage">
    <img class="collection-preview-fallback" src="${art}" alt="${name}" draggable="false">
    <canvas id="collection-preview" data-kind="${kind}" data-id="${id}" tabindex="0" aria-label="3D preview of ${name}. Drag or use the arrow keys to rotate."></canvas>
    <div class="collection-rotation"><button type="button" data-collection-rotate="-1" aria-label="Rotate preview left">${icon('left')}</button><span>Drag to rotate</span><button type="button" data-collection-rotate="1" aria-label="Rotate preview right">${icon('arrow')}</button></div>
  </div>`;
}

export function renderPetCollection(player: Pick<Player, 'ownedPets' | 'summonedPet' | 'carriedItems' | 'hp' | 'zeppelin'> & Partial<Pick<Player, 'petLootMinQuality'|'raidProgress'|'ownedMounts'|'nftMounts'>> & CompanionPlayer & { nftPets?: PetId[]; nftConfigured?: boolean; nftMintablePets?: PetId[] }, connected: boolean, now = Date.now(), selectedId?: PetId, view: CollectionViewOptions = {}) {
  const learned = player.ownedPets ?? [], owned = new Set([...learned, ...(player.nftPets ?? [])]);
  const lootControls = `<div class="collection-loot"><label for="pet-loot-quality">Minimum item rarity</label><select id="pet-loot-quality" data-pet-loot-quality aria-describedby="pet-loot-help" ${!connected ? 'disabled' : ''}>${PET_LOOT_QUALITIES.map(quality => `<option value="${quality}" ${quality === (player.petLootMinQuality ?? 'uncommon') ? 'selected' : ''}>${quality[0].toUpperCase() + quality.slice(1)}${quality === 'mythic' ? '' : ' and better'}</option>`).join('')}</select>
      <p id="pet-loot-help">${player.summonedPet ? 'Your summoned pet runs to' : 'Summon a pet to collect'} your loot and unlocked chests within ${PET_LOOT_RADIUS}m on a clear, dry path. Gold is always collected. Lower rarities and items that do not fit stay in the loot.</p>
    </div>`;
  const visible = PETS.filter(entry => (!view.collectedOnly || owned.has(entry.id)) && entry.name.toLocaleLowerCase().includes((view.search ?? '').trim().toLocaleLowerCase()));
  const filters = collectionFilters('pets', view, visible.length, PETS.length), ownedCount = collectedCount(PETS, [...owned]);
  if (!visible.length) return `<div class="collection-journal">${collectionTabs('pets', ownedCount, PETS.length, player)}${lootControls}${filters}<p class="collection-empty" role="status">No pets match these filters. Change your search or turn off Collected only.</p></div>`;
  const pet = visible.find(entry => entry.id === selectedId) ?? visible.find(entry => entry.id === player.summonedPet) ?? visible.find(entry => owned.has(entry.id)) ?? visible[0];
  const storeProduct = STORE_PRODUCTS.find(product => product.id === pet.id);
  const referral = 'referralOnly' in pet, noDrops = pet.retired || pet.source === 'moss-slime';
  const nftPet = !!nftAsset('pet', pet.id), unavailable = referral ? 'Refer 10 qualified adventurers' : pet.id==='death-apostle'?'Earn in the Horned Apostle raid':noDrops ? 'Buy an existing copy at auction' : 'Find a drop or buy at auction';
  const have = owned.has(pet.id), summoned = player.summonedPet === pet.id, count = player.carriedItems?.[pet.id] ?? 0, source = pet.source ? MONSTERS[pet.source] : null;
  const convertLearned = learned.includes(pet.id) && nftLearnedPetConvertible(pet.id);
  const mintable = player.nftMintablePets ? player.nftMintablePets.includes(pet.id) : !pet.storeOnly;
  const reason = !connected ? 'Reconnect to change pets.' : player.hp <= 0 ? 'Revive to change pets.' : player.zeppelin ? 'Your pet will return after the zeppelin trip.' : '';
  const status = have ? summoned ? 'Summoned' : !learned.includes(pet.id) ? 'Owned by your wallet' : 'Learned' : count ? 'Ready to collect' : 'Not collected';
  const action = player.nftConfigured && nftPet && !nftLearnedPetConvertible(pet.id) && !have
    ? `<button class="primary-button" type="button" data-claim-nft-pet="${pet.id}" data-pet-action="${pet.id}" ${reason || !count || !mintable ? 'disabled' : ''}>${count ? 'Claim NFT · review' : unavailable}</button>`
    : have ? `<button class="primary-button" type="button" data-summon-pet="${summoned ? '' : pet.id}" data-pet-action="${pet.id}" aria-pressed="${summoned}" ${reason ? 'disabled' : ''}>${summoned ? 'Dismiss' : 'Summon'}</button>`
    : `<button class="primary-button" type="button" data-learn-pet="${pet.id}" data-pet-action="${pet.id}" ${reason || referral || pet.storeOnly || !count ? 'disabled' : ''}>${referral ? unavailable : pet.storeOnly ? 'Available in the Ingame store' : count ? 'Learn pet · consumes 1' : unavailable}</button>`;
  const companion = renderCombatCompanion(player, connected, now);
  return `<div class="collection-journal">${collectionTabs('pets', ownedCount, PETS.length, player)}
    ${lootControls}
    <div class="collection-body"><div class="collection-browser">${filters}<div class="collection-list" role="group" aria-label="Pet collection">${visible.map(entry => {
      const collected = owned.has(entry.id), carried = player.carriedItems?.[entry.id] ?? 0;
      return `<button class="collection-entry ${collected ? 'is-owned' : ''}" type="button" data-collection-select="${entry.id}" aria-pressed="${entry.id === pet.id}"><img src="${entry.icon}" alt="" width="48" height="48"><span><strong>${entry.name}</strong><small>${player.summonedPet === entry.id ? 'Summoned' : learned.includes(entry.id) ? 'Learned' : collected ? 'Wallet pet' : carried ? 'In backpack' : 'Not collected'}</small></span></button>`;
    }).join('')}</div></div>
    <section class="collection-detail" aria-labelledby="collection-name">${collectionStage('pets', pet.id, pet.name, pet.icon)}
      <div class="collection-copy"><div class="collection-name-row"><h3 id="collection-name">${pet.name}</h3><span class="collection-owned ${have ? 'is-owned' : ''}">${status}</span></div>
        <p class="collection-description">${pet.description}</p>
        <p class="collection-source"><span>Source</span> ${referral ? '10 qualified referrals<small>Unlocked for every character on your account. Cannot be traded or minted as an NFT.</small>' : pet.id==='death-apostle'?`The Horned Apostle · Level 60 raid<small>Rare personal clear reward · Evolution ${player.raidProgress?.petEvolution??0} / 3</small>`:noDrops ? `${pet.retired ? 'Retired from drops' : 'No longer drops'}<small>Existing pets stay with their owners. Unlearned copies can still be traded.</small>` : source ? `${source.name}${pet.source === 'ashen-crown-titan' ? ' · Level 40 world boss' : ' · Level 10 or higher'}<small>${petDropLabel(pet.dropChance)} drop chance</small>` : `Ingame store${storeProduct ? ` · Burn $${storeProduct.usdPrice} worth of MOSS` : ''}`}</p>
        ${count ? `<p class="collection-backpack">${count} unlearned in backpack</p>` : ''}
        <div class="collection-actions">${action}${nftLearnedPetConvertible(pet.id) && (convertLearned || !pet.storeOnly && count) ? `<button class="primary-button" type="button" data-claim-nft-pet="${pet.id}" ${reason || !mintable ? 'disabled' : ''}>Mint NFT · review</button>` : ''}</div>${reason ? `<p class="collection-action-note" role="status">${reason}</p>` : ''}
        ${pet.storeOnly && convertLearned ? '<p class="collection-action-note">Store conversion requires a verified MOSS purchase.</p>' : ''}${!mintable && (count || convertLearned) ? '<p class="collection-action-note">NFT minting for this pet is not enabled on this realm yet.</p>' : ''}
        ${convertLearned ? '<p class="collection-action-note">Convert this learned pet to an NFT. Its character unlock is exchanged for wallet ownership after you confirm the mint.</p>' : ''}
      </div>
    </section></div>
    <p class="collection-footnote">One collection pet can follow you alongside your combat companion. Your loot preference applies to every collection pet.</p>
    ${referral ? '' : `<details id="collection-pet-trading" class="collection-disclosure"><summary>Pet trading &amp; NFTs</summary><div>
      ${count && nftPet && !nftLearnedPetConvertible(pet.id) && (!player.nftConfigured || have) ? `<button class="primary-button" type="button" data-claim-nft-pet="${pet.id}" aria-label="Claim ${pet.name} NFT" ${!connected || !mintable ? 'disabled' : ''}>Claim NFT · review</button>` : ''}
      <button class="collection-secondary" type="button" data-open-nfts>NFT collections</button>
      <p class="pet-trade-note">Unlearned pets, including retired companions, can be listed at the Auction House. Store companions stay with this character unless an eligible MOSS purchase is converted into an NFT. ${pet.storeOnly ? 'Purchased companions can be reviewed for conversion into wallet NFTs.' : nftLearnedPetConvertible(pet.id) ? 'Learn this pet for your character, or mint it as an NFT for your wallet.' : player.nftConfigured && nftPet ? 'Claim this pet as an NFT, then summon it from the wallet that owns it.' : 'Learn this pet to summon it.'} NFT collections support all eighteen pets when enabled on this realm. Eligible learned pets can be converted by exchanging their character unlock. NFT access follows the current wallet owner; selling or transferring the NFT removes that access. NFT collections carry a 5% resale royalty for MOSS buyback and burn.</p>
    </div></details>`}
    ${companion ? `<details id="collection-combat-companion" class="collection-disclosure collection-companion" ${player.combatCompanion ? 'open' : ''}><summary>Combat companion${player.combatCompanion ? ` · ${MONSTERS[player.combatCompanion.kind].name}` : ''}</summary>${companion}</details>` : ''}
  </div>`;
}

export function renderMountCollection(player: Pick<Player, 'hp' | 'zeppelin' | 'level' | 'ridingRank' | 'ownedMounts' | 'travel'> & Partial<Pick<Player, 'carriedItems' | 'nftMounts' | 'nftMountsConfigured' | 'nftMintableMounts' | 'ownedPets' | 'nftPets'>>, connected: boolean, selectedId: MountId, preferredMount: MountId, outdoors: boolean, view: CollectionViewOptions = {}) {
  const learned = player.ownedMounts ?? [], owned = new Set([...learned, ...(player.nftMounts ?? [])]), mounted = player.travel?.mount;
  const visible = MOUNTS.filter(entry => (!view.collectedOnly || owned.has(entry.id)) && entry.name.toLocaleLowerCase().includes((view.search ?? '').trim().toLocaleLowerCase()));
  const filters = collectionFilters('mounts', view, visible.length, MOUNTS.length), ownedCount = collectedCount(MOUNTS, [...owned]);
  if (!visible.length) return `<div class="collection-journal">${collectionTabs('mounts', ownedCount, MOUNTS.length, player)}${filters}<p class="collection-empty" role="status">No mounts match these filters. Change your search or turn off Collected only.</p></div>`;
  const mount = visible.find(entry => entry.id === selectedId) ?? visible[0];
  const have = owned.has(mount.id), count = player.carriedItems?.[mount.id] ?? 0, speed = mountSpeed(player.level, player.ridingRank), expert = player.ridingRank === 2;
  const convertible = nftLearnedMountConvertible(mount.id), convertLearned = convertible && learned.includes(mount.id), mintable = player.nftMountsConfigured && player.nftMintableMounts?.includes(mount.id);
  const manageReason = !connected ? 'Reconnect to change mounts.' : player.hp <= 0 ? 'Revive to manage mounts.' : player.zeppelin ? 'Finish your zeppelin trip to manage mounts.' : '';
  const reason = manageReason || (mounted ? '' : !speed ? player.level < MOUNT_UNLOCK_LEVEL ? `Riding unlocks at level ${MOUNT_UNLOCK_LEVEL}.` : 'Learn riding from a riding trainer.' : !have ? 'Collect this mount to ride it.' : !outdoors ? 'Mounts can only be ridden outdoors.' : '');
  const canLearn = !('referralOnly' in mount) && !learned.includes(mount.id) && count > 0 && !mount.storeOnly;
  const learnAction = `<button class="primary-button" type="button" data-learn-mount="${mount.id}" ${manageReason ? 'disabled' : ''}>Learn mount · consumes 1</button>`;
  const status = mounted === mount.id ? 'Currently riding' : have ? learned.includes(mount.id) ? 'Learned' : 'Owned by your wallet' : count ? 'Ready to collect' : 'Not collected';
  return `<div class="collection-journal">${collectionTabs('mounts', ownedCount, MOUNTS.length, player)}
    <div class="collection-body"><div class="collection-browser">${filters}<div class="collection-list" role="group" aria-label="Mount collection">${visible.map(entry => `<button class="collection-entry ${owned.has(entry.id) ? 'is-owned' : ''}" type="button" data-collection-select="${entry.id}" aria-pressed="${entry.id === mount.id}"><img src="${entry.icon}" alt="" width="48" height="48"><span><strong>${entry.name}</strong><small>${mounted === entry.id ? 'Currently riding' : owned.has(entry.id) ? preferredMount === entry.id ? 'Preferred mount' : learned.includes(entry.id) ? 'Learned' : 'Wallet mount' : player.carriedItems?.[entry.id] ? 'In backpack' : 'Not collected'}</small></span></button>`).join('')}</div></div>
    <section class="collection-detail" aria-labelledby="collection-name">${collectionStage('mounts', mount.id, mount.name, mount.icon)}
      <div class="collection-copy"><div class="collection-name-row"><h3 id="collection-name">${mount.name}</h3><span class="collection-owned ${have ? 'is-owned' : ''}">${status}</span></div>
        <p class="collection-description">${speed ? `${expert ? 'Expert' : 'Apprentice'} riding · ${speed} m/s` : `Requires level ${MOUNT_UNLOCK_LEVEL} and riding training`}. ${mount.id === 'wayfarer-stag' ? 'Two saddles: use a nearby player’s menu to invite them to ride. The passenger accepts and can leave at any time.' : 'Every mount uses your riding skill.'}</p>
        <p class="collection-source"><span>Source</span> ${'referralOnly' in mount ? '25 qualified referrals · Account reward · Two riders' : mount.source ? `${MONSTERS[mount.source].name}${mount.dungeonDrop?.dungeon === 'veilhaven' ? ' · Veilhaven Monastery' : ''} · ${petDropLabel(mount.dropChance)} per eligible kill · Drops as an unlearned item` : mount.storeOnly ? 'Ingame store' : `Mount seller · ${MOUNT_PRICES[mount.id]} gold`}</p>
        ${count ? `<p class="collection-backpack">${count} unlearned in backpack</p>` : ''}
        <div class="collection-actions">${!have && !mounted && canLearn ? learnAction : `<button class="primary-button" type="button" data-ride-mount="${mounted ? '' : mount.id}" ${reason ? 'disabled' : ''}>${mounted ? 'Dismount' : 'Summon mount · 2s cast'}</button>`}
          ${canLearn && (have || mounted) ? learnAction : ''}
          ${convertible && (convertLearned || !mount.storeOnly && count) ? `<button class="primary-button" type="button" data-claim-nft-mount="${mount.id}" ${manageReason || !mintable ? 'disabled' : ''}>${convertLearned ? 'Convert learned mount · NFT' : 'Mint NFT · review'}</button>` : ''}
          ${have ? `<button class="collection-secondary" type="button" data-prefer-mount="${mount.id}" aria-pressed="${preferredMount === mount.id}" ${preferredMount === mount.id ? 'disabled' : ''}>${preferredMount === mount.id ? 'Preferred mount' : 'Set as preferred'}</button>` : ''}
        </div>${reason && (have || mounted || !canLearn || manageReason) ? `<p class="collection-action-note" role="status">${reason}</p>` : ''}
        ${mount.storeOnly && convertLearned ? '<p class="collection-action-note">Store conversion requires a verified MOSS purchase.</p>' : ''}${convertible && !mintable && (count || convertLearned) ? '<p class="collection-action-note">NFT minting for this mount is not enabled on this realm yet.</p>' : ''}
        ${convertLearned ? '<p class="collection-action-note">Converting this learned mount exchanges its character unlock for NFT wallet ownership.</p>' : ''}
        <div class="collection-training"><button type="button" data-find-trainer="riding-trainer">${icon('route')} Riding trainer</button>${!mount.storeOnly && !mount.dropOnly && !('referralOnly' in mount) ? `<button type="button" data-find-trainer="mount-seller">${icon('route')} Mount seller</button>` : ''}</div>
      </div>
    </section></div>
    <p class="collection-footnote">${expert ? 'Expert training applies to every mount.' : `Expert riding becomes available at level ${MOUNT_UPGRADE_LEVEL}.`} Attacking, gathering, or entering deep water dismounts you.</p>
    ${'referralOnly' in mount ? '' : `<details id="collection-mount-trading" class="collection-disclosure"><summary>Mount trading &amp; NFTs</summary><div><button class="collection-secondary" type="button" data-open-nfts>NFT collections</button><p class="pet-trade-note">Unlearned mount drops can be traded or listed at the Auction House. Learn a drop for your character or mint it into the separate Mossvale Mounts NFT collection. Eligible learned mounts can be converted; store conversions require a verified MOSS purchase. Briar Horse and Moonfang Wolf from the mount seller cannot be minted. NFT access follows the current wallet owner; selling or transferring the NFT removes that access. The collection carries a 5% resale royalty for MOSS buyback and burn.</p></div></details>`}
  </div>`;
}
