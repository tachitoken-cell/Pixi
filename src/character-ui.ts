import { itemLocked, ownsLockItem } from './item-locks';
import { goldSource } from './gold-economy';
import { playerTitle } from './titles';
import type { Player } from './shared';
import { PRIMARY_ATTRIBUTES, ATTRIBUTE_EFFECTS, equippedAttributes, EQUIPMENT_SLOTS, MAX_GEAR_UPGRADE, combatStats, equipmentSlotFor, gearFitsSlot, gearById, gearUpgradeQuote, gearSpeedMultiplier, type EquipmentSlot, type Gear, type GearSlot, type StatBonuses } from './progression';
import { icon } from './icons';
import { BAG_ITEMS, BAG_SLOT_COUNT, BASE_BAG_CAPACITY, bagItems as inventoryBagItems, bagCapacity, bagCanFit, bagKindValid, type EquippedBags } from './bags';
import { LOOT_ITEMS, lootItemValid, gearLootQuality } from './loot-items';
import { isPetId } from './pets';
import { MOUNTS, type MountId } from './travel';
import { nftAsset, nftLearnedPetConvertible, nftLearnedMountConvertible } from './nfts';
import { itemResources as resources, itemStatLabels, renderItemTooltip } from './item-tooltip';
import { auctionItemLabel } from './auction';

export const gearSlotLabels: Record<GearSlot, string> = { weapon: 'Weapon', armor: 'Body', charm: 'Necklace', head: 'Head', legs: 'Legs', shoes: 'Shoes', back: 'Back', ring: 'Ring' };
const labels: Record<EquipmentSlot, string> = { ...gearSlotLabels, ring1: 'Ring 1', ring2: 'Ring 2' };
const emptySlotIcons: Record<EquipmentSlot, string> = { weapon: 'sword', armor: 'shield', charm: 'beacon', head: 'user', legs: 'route', shoes: 'travel', back: 'leaf', ring1: 'gold', ring2: 'gold' };
const weaponIcons = { Ranger: 'bow', Knight: 'sword', Mage: 'spark', Cleric: 'cleric-smite' };
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (value: number) => value.toLocaleString('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export function gearArt(gear: Gear): string {
  const image = gear.icon ?? gear.model;
  if (image) return `<img class="gear-art" src="/ui/gear/${encodeURIComponent(image)}.png" alt="" draggable="false" decoding="async">`;
  const name = gear.slot === 'weapon' ? weaponIcons[gear.className || 'Ranger'] : gear.slot === 'ring' ? 'gold' : emptySlotIcons[gear.slot];
  return icon(name);
}
const quality = gearLootQuality;
export const BENJI_ITEM_ICONS: Record<string,string> = {'heatproof-tonic':'item-greater-tonic','greater-tonic':'item-greater-tonic','berry-tart':'item-berry-tart','treasure-map':'item-treasure-map','trail-bread':'item-bread','roast-meat':'item-roast-drumstick','hearty-stew':'item-forest-stew','slime-residue':'item-slime-gel','gnarled-bark':'item-bark','chipped-fang':'item-fang','frost-shard':'item-frost-crystal','tattered-pelt':'item-fur-pelt'};
export const lootItemArt = (id: string) => Object.hasOwn(BENJI_ITEM_ICONS,id) ? `<img class="loot-item-art" src="/ui/benji-2026-09-28/icons/${BENJI_ITEM_ICONS[id]}.png" alt="" draggable="false" decoding="async">` : ['sp-protection-roll','sp-revival-core','sp-specialist-case'].includes(id) ? icon(id==='sp-protection-roll'?'book':id==='sp-revival-core'?'crystal':'bag') : lootItemValid(id) ? `<img class="loot-item-art" src="${LOOT_ITEMS[id].category==='mount'?`/ui/mount-${encodeURIComponent(id)}.png`:`/ui/${LOOT_ITEMS[id].category==='pet'?'pets':'loot'}/${encodeURIComponent(id)}.png`}" alt="" draggable="false" decoding="async">` : '';
export const gearStatLabels = itemStatLabels;
const compactStatLabels: Record<keyof StatBonuses, string> = { strength: 'STR', agility: 'AGI', intellect: 'INT', stamina: 'STA', spirit: 'SPI', primaryDamage: 'Attack', specialDamage: 'Magic', damage: 'Damage', defense: 'Defense', speed: 'Speed' };
const itemMore = (id: string, content: string) => `<details class="item-more" data-item-more="${escape(id)}"><summary>Details</summary>${content}</details>`;
const statValue = (stat: keyof StatBonuses, value: number) => `${number(value)}${stat === 'speed' ? '%' : ''}`;
export const gearBonuses = (stats: StatBonuses) => (Object.keys(gearStatLabels) as (keyof StatBonuses)[]).filter(stat => stats[stat]).map(stat => `+${statValue(stat, stats[stat]!)} ${gearStatLabels[stat]}`).join(' · ') || 'Starter equipment';
const bonuses = gearBonuses;
const isEquipped = (player: Player, id: string) => Object.values(player.equipment).includes(id);
const emptyGearArt = (slot: EquipmentSlot, player: Player) => {
  const model = slot === 'charm' ? 'necklace' : slot === 'ring1' || slot === 'ring2' ? 'ring' : slot === 'weapon' ? null : `${player.appearance.className.toLowerCase()}-${slot === 'armor' ? 'body' : slot}`;
  return model ? `<img class="gear-art" src="/ui/gear/${model}.png" alt="" draggable="false" decoding="async">` : icon(weaponIcons[player.appearance.className]);
};

export function bagItems(player: Player) {
  return inventoryBagItems(player);
}
/** Cosmetic slot positions; inventory ownership and capacity remain authoritative. */
export function reconcileBagSlots(player: Player, saved: readonly unknown[] = []): (string | null)[] {
  const remaining = new Set(bagItems(player));
  const slots = Array.from({length: bagCapacity(player)}, (_, index) => {
    const id = saved[index];
    return typeof id === 'string' && remaining.delete(id) ? id : null;
  });
  for (const id of remaining) {
    const empty = slots.indexOf(null);
    if (empty >= 0) slots[empty] = id;
  }
  return slots;
}
const bagArt = (kind = 'backpack') => `<img class="bag-art" src="/ui/bags/${encodeURIComponent(kind)}.png" alt="" draggable="false" decoding="async">`;
const equippedBags = (player: Player): EquippedBags => [...(player.equippedBags || [null,null,null,null])] as EquippedBags;
const ownedBag = (player: Player, id: string) => (player.ownedBags || []).find(bag => bag.id === id && bagKindValid(bag.kind));

function renderGearUpgrade(player: Player, gear: Gear): string {
  const level = gear.upgradeLevel || 0, quote = gearUpgradeQuote(gear.id);
  if (!quote) return level >= MAX_GEAR_UPGRADE ? `<section class="gear-upgrade" aria-label="Equipment upgrades"><strong>Fully upgraded · +${MAX_GEAR_UPGRADE}</strong></section>` : '';
  const gold = player.gold ?? 0;
  const available = (id: keyof typeof quote.materials) => player.inventory?.[id] ?? 0;
  const materials = Object.entries(quote.materials) as [keyof typeof quote.materials, number][];
  const short = gold < quote.gold || materials.some(([id, cost]) => available(id) < cost);
  const unavailable = player.hp <= 0 || !!player.zeppelin || !!player.travel?.mount || !!player.casting;
  const locked = player.level < gear.requiredLevel || !!gear.className && gear.className !== player.appearance.className;
  const cost = (label: string, art: string, required: number, owned: number) => `<li class="${owned < required ? 'stat-loss missing' : ''}" title="${label}: ${number(required)} required / ${number(owned)} owned" aria-label="${label}: ${number(required)} required, ${number(owned)} owned${owned < required ? `, missing ${number(required - owned)}` : ''}">${icon(art)}<span>${number(required)}/${number(owned)}</span>${owned < required ? '<strong aria-hidden="true">!</strong>' : ''}</li>`;
  return `<section class="gear-upgrade" aria-label="Equipment upgrades"><strong>Upgrade +${level} → +${level + 1}</strong><div class="gear-upgrade-stats" aria-label="Current and upgraded bonuses">${(Object.keys(gearStatLabels) as (keyof StatBonuses)[]).filter(stat => gear.stats[stat] || quote.next.stats[stat]).map(stat => `<span title="${gearStatLabels[stat]}">${compactStatLabels[stat]} ${statValue(stat, gear.stats[stat] || 0)} → <b class="stat-gain">${statValue(stat, quote.next.stats[stat] || 0)}</b></span>`).join('')}</div><ul class="gear-upgrade-cost" aria-label="Upgrade materials: required / owned">${cost('Gold', 'gold', quote.gold, gold)}${materials.map(([id, required]) => cost(resources[id].label, resources[id].icon, required, available(id))).join('')}</ul><div class="item-actions"><button type="button" class="primary-button" data-upgrade-gear="${escape(gear.id)}" ${short || unavailable || locked ? 'disabled' : ''}>${icon('gear')}Upgrade to +${level + 1}</button><button type="button" class="primary-button" data-item-upgrade-mode="details">Cancel</button></div><small class="item-action-note">${locked ? `Requires level ${gear.requiredLevel}${gear.className ? ` ${gear.className}` : ''}. ` : ''}${short ? 'Missing materials marked ! · ' : ''}${unavailable ? 'Dismount and finish combat actions first. ' : ''}Required / owned in bags · Guaranteed upgrade · Maximum +${MAX_GEAR_UPGRADE}.</small></section>`;
}

export function renderItemLock(player: Player, id: string): string {
  if (!ownsLockItem(player, id)) return '';
  const locked = itemLocked(player, id), stack = id.startsWith('item:') || Object.hasOwn(player.inventory, id);
  return `<div class="item-protection"><button type="button" class="primary-button" data-item-lock="${escape(id)}" data-lock-value="${!locked}" aria-pressed="${locked}">${icon('shield')}${locked ? 'Unlock' : 'Lock'} ${stack ? 'stack' : 'item'}</button><small>${locked ? 'Locked · protected from sale, drop and transfer.' : 'Prevent accidental sale, drop or transfer.'}${stack ? ' Covers this item type in bags and bank, including future pickups. Use and crafting stay available.' : ' Equipment use, upgrades and bank storage stay available.'}</small></div>`;
}
export function renderItemDetails(player: Player, id: string, upgrading = false, lockAfterContent = false): string {
  const lock=renderItemLock(player,id),content=renderItemDetailContent(player,id,upgrading);
  return `<button type="button" class="item-sheet-close" data-close-item aria-label="Close item details">${icon('close')}</button><div class="item-detail-main">${lockAfterContent?content+lock:lock+content}</div>`;
}
function renderItemDetailContent(player: Player, id: string, upgrading: boolean): string {
  const carriedId=id.startsWith('item:')?id.slice(5):'', carried=lootItemValid(carriedId)&&((player.carriedItems?.[carriedId]||0)>0)?LOOT_ITEMS[carriedId]:undefined;
  if(carried){
    if(carriedId==='treasure-map')return `<div class="item-detail-heading quality-rare">${lootItemArt(carriedId)}<h3>${escape(carried.label)}</h3></div>${itemMore(id, `<p>${escape(carried.description)}</p>`)}<button type="button" class="primary-button" ${player.treasureMap?'data-open-treasure-map':'data-start-treasure-map'} ${!player.treasureMap&&(player.hp<=0||player.instanceId||player.zeppelin)?'disabled':''}>${player.treasureMap?'View expedition':'Use treasure map'}</button><p class="item-action-note">${player.treasureMap?'Finish your current expedition before using another map.':player.hp<=0||player.instanceId||player.zeppelin?'Return to the open world alive to use this map.':'Consumes one map. Follow your progress in Quests.'} Unused maps can be sold at the Auction House.</p>`;
    if(carriedId==='moss-voucher')return `<div class="item-detail-heading quality-epic">${lootItemArt(carriedId)}<h3>${escape(carried.label)}</h3></div>${itemMore(id, `<p>${escape(carried.description)}</p>`)}<button type="button" class="primary-button" data-find-shady-merchant>Find shady merchant</button><p class="item-action-note">Consumed only after your fixed payout is saved. Wallet network fees apply.</p>`;
    const count=player.carriedItems![carriedId]!, heatproof=carriedId==='heatproof-tonic', usable=heatproof||!!carried.heal&&(carried.category==='food'||carried.category==='potion');
    if(carried.category==='mount'&&MOUNTS.some(mount=>mount.id===carriedId)){
      const mount=carriedId as MountId, storeOnly=MOUNTS.find(entry=>entry.id===mount)!.storeOnly, learned=player.ownedMounts?.includes(mount), convertible=nftLearnedMountConvertible(mount), mintable=player.nftMountsConfigured&&player.nftMintableMounts?.includes(mount), unavailable=player.hp<=0||!!player.zeppelin;
      return `<div class="item-detail-heading quality-${carried.quality}">${lootItemArt(carriedId)}<div><h3>${escape(carried.label)}</h3><small>Unlearned mount · ${number(count)} in your bag</small></div></div>${itemMore(id, `<p>${escape(carried.description)}</p>`)}${storeOnly?'':`<button type="button" class="primary-button" data-learn-mount="${mount}" ${learned||unavailable?'disabled':''}>${icon('check')}${learned?'Already learned':'Learn mount · consumes 1'}</button>`}${convertible&&(!storeOnly||learned)?`<button type="button" class="primary-button" data-claim-nft-mount="${mount}" ${!mintable||unavailable?'disabled':''}>${learned?'Convert learned mount · NFT':'Mint NFT · review'}</button>`:''}<small class="item-action-note">${storeOnly?'Store conversion requires a verified MOSS purchase.':'Learning consumes one item and unlocks this mount for your character.'} Riding still requires training. NFT minting is optional; converting a learned mount exchanges its character unlock for wallet ownership.</small>${convertible&&!mintable?'<p class="item-action-note">NFT minting for this mount is not enabled on this realm yet.</p>':''}<p class="item-action-note">Sell unlearned mounts at the Auction House.</p>`;
    }
    if(carried.category==='pet'&&isPetId(carriedId)){
      const learned=player.ownedPets?.includes(carriedId), optionalNft=nftLearnedPetConvertible(carriedId), mintable=!player.nftMintablePets||player.nftMintablePets.includes(carriedId), claim=player.nftConfigured&&!!nftAsset('pet',carriedId)&&!optionalNft;
      return `<div class="item-detail-heading quality-${carried.quality}">${lootItemArt(carriedId)}<div><h3>${escape(carried.label)}</h3><small>Unlearned pet · ${number(count)} in your bag</small></div></div>${itemMore(id, `<p>${escape(carried.description)}</p>`)}<button type="button" class="primary-button" data-${claim?'claim-nft':'learn'}-pet="${carriedId}" ${!claim&&learned||claim&&!mintable||player.hp<=0||player.zeppelin?'disabled':''}>${icon('check')}${claim?'Claim NFT · review':learned?'Already learned':'Learn pet'}</button>${optionalNft?`<button type="button" class="primary-button" data-claim-nft-pet="${carriedId}" ${!mintable||player.hp<=0||player.zeppelin?'disabled':''}>${learned?'Convert learned pet · NFT':'Mint NFT · review'}</button>`:''}<small class="item-action-note">${claim?'Claim this legacy pet as an NFT. Access follows its current wallet owner.':learned?'You can auction this extra pet.':'Learning consumes one item and permanently unlocks this companion.'} ${optionalNft?'NFT minting is optional; converting a learned pet exchanges its character unlock for wallet ownership. ':''}Only one pet can be summoned at a time.</small><p class="item-action-note">Sell unlearned pets at the Auction House.</p>`;
    }
    return `<div class="item-detail-heading quality-${carried.quality}">${lootItemArt(carriedId)}<div><h3>${escape(carried.label)}</h3><small>${carried.category==='junk'?'Vendor junk':carried.category==='treasure'?'Treasure':carried.category==='food'?'Food':'Potion'} · ${number(count)} in your bag</small></div></div>${itemMore(id, `<p>${escape(carried.description)}</p>`)}${usable?`<p class="item-bonuses">${heatproof?'20% less fire damage for 5 minutes.':`Restores ${carried.heal} health.`}</p><button type="button" class="primary-button" data-use-item="${escape(carriedId)}" ${player.hp<=0||!heatproof&&player.hp>=player.maxHp?'disabled':''}>${icon(carried.category==='food'?'heartroot':'potion')}${carried.category==='food'?'Eat':'Drink'} · ${heatproof?'Fire resistance':`+${carried.heal} health`}</button><small class="item-action-note">${carried.category==='food'?'Out of combat':'Usable in combat'} · Shared 10s cooldown</small>`:''}<p class="item-vendor-value">Vendor value: ${number(goldSource(carried.sellPrice,'resale',player.economyVersion===1))} gold each${count>1?` · ${number(count*goldSource(carried.sellPrice,'resale',player.economyVersion===1))} gold total`:''}</p><small class="item-action-note">Sell at a nearby merchant.</small>`;
  }
  const bag = id.startsWith('bag:') ? ownedBag(player, id.slice(4)) : undefined;
  if (bag) {
    const definition=BAG_ITEMS[bag.kind], slots=equippedBags(player), wornSlot=slots.indexOf(bag.id);
    let actions: string;
    if(wornSlot>=0){
      slots[wornSlot]=null;const fits=bagCanFit(player,{equippedBags:slots});
      actions=`<button type="button" class="primary-button" data-unequip-bag="${wornSlot}" ${fits?'':'disabled'} title="${fits?'Return this bag to your inventory':'Make room in your other bags before unequipping'}">${icon('bag')}Unequip bag ${wornSlot+1}</button>${fits?'':'<small class="item-action-note">Make room in your other bags first.</small>'}`;
    }else{
      actions=`<div class="bag-equip-options">${Array.from({length:BAG_SLOT_COUNT},(_,slot)=>{
        const replaced=slots[slot]?ownedBag(player,slots[slot]!):undefined, next=[...slots] as EquippedBags;next[slot]=bag.id;
        const levelLocked=player.level<definition.requiredLevel, fits=bagCanFit(player,{equippedBags:next});
        const change=definition.slots-(replaced?BAG_ITEMS[replaced.kind].slots:0);
        return `<div class="item-equip-option"><span class="item-slot-label">Bag ${slot+1} · ${escape(replaced?BAG_ITEMS[replaced.kind].label:'Empty socket')}</span><small>${change>0?'+':''}${change} slots</small><button type="button" class="primary-button" data-equip-bag="${escape(bag.id)}" data-equip-bag-slot="${slot}" ${levelLocked||!fits?'disabled':''}>${icon('check')}${levelLocked?`Requires level ${definition.requiredLevel}`:!fits?'Not enough room':`Equip in bag ${slot+1}`}</button></div>`;
      }).join('')}</div>`;
    }
    return `<div class="item-detail-heading quality-${definition.quality}">${bagArt(bag.kind)}<div><h3>${escape(definition.label)}</h3><small>${wornSlot>=0?`Equipped · Bag ${wornSlot+1}`:'In your inventory'} · ${definition.slots} slots · Level ${definition.requiredLevel}</small></div></div>${actions}${itemMore(id, `<div class="bag-model-preview" data-bag-model="${bag.kind}"></div><p>${escape(definition.description)}</p>`)}<small class="item-action-note">${wornSlot>=0?'Unequip to sell':'Sell'} at a bag merchant for ${number(goldSource(Math.floor(definition.price/4),'resale',player.economyVersion===1))} gold.</small>`;
  }
  const gear = player.ownedGear.includes(id) ? gearById(id) : undefined;
  if (gear) {
    const wornSlot = isEquipped(player, id) ? equipmentSlotFor(player.equipment, id) : undefined, choices = EQUIPMENT_SLOTS.filter(slot => gearFitsSlot(id, slot));
    const locked = player.level < gear.requiredLevel || !!gear.className && gear.className !== player.appearance.className;
    const heading = `<div class="item-detail-heading quality-${quality(gear)}">${gearArt(gear)}<div><h3>${escape(gear.label)}</h3><small>${wornSlot ? `Equipped · ${labels[wornSlot]}` : `In your bag · ${gearSlotLabels[gear.slot]}`} · Level ${gear.requiredLevel}${gear.className ? ` · ${gear.className}` : ''}</small></div></div>`;
    if (upgrading) return `${heading}${renderGearUpgrade(player, gear)}${!gearUpgradeQuote(gear.id) ? '<button type="button" class="primary-button" data-item-upgrade-mode="details">Item details</button>' : ''}`;
    const comparisons = wornSlot ? '' : `<div class="item-comparisons${gear.slot === 'ring' ? ' ring-comparisons' : ''}">${choices.map(slot => {
      const current = gearById(player.equipment[slot]);
      const difference = (Object.keys(gearStatLabels) as (keyof StatBonuses)[]).flatMap(stat => {
        const delta = (gear.stats[stat] || 0) - (current?.stats[stat] || 0);
        return delta ? [`<span class="${delta > 0 ? 'stat-gain' : 'stat-loss'}">${delta > 0 ? '+' : '−'}${statValue(stat, Math.abs(delta))} ${compactStatLabels[stat]}</span>`] : [];
      }).join(' · ');
      return `<p class="item-comparison" title="Compared with ${escape(current?.label || 'empty slot')}">${gear.slot === 'ring' ? labels[slot] : 'Equipped'}: ${difference || 'Same bonuses'}</p>`;
    }).join('')}</div>`;
    const actions = wornSlot ? wornSlot === 'weapon' || wornSlot === 'armor' ? '' : `<button type="button" class="primary-button" data-unequip-gear="${wornSlot}">${icon('bag')}Unequip ${labels[wornSlot]}</button>` : choices.map(slot => `<button type="button" class="primary-button" data-equip-gear="${escape(gear.id)}" ${locked ? 'disabled' : ''}${gear.slot === 'ring' ? ` data-equip-slot="${slot}"` : ''}>${icon('check')}${locked ? `Requires level ${gear.requiredLevel}${gear.className ? ` ${gear.className}` : ''}` : `Equip ${labels[slot]}`}</button>`).join('');
    return `${heading}<div class="item-stat-line" aria-label="Item bonuses">${(Object.keys(gearStatLabels) as (keyof StatBonuses)[]).filter(stat => gear.stats[stat]).map(stat => `<span title="${gearStatLabels[stat]}">${compactStatLabels[stat]} <b>${statValue(stat, gear.stats[stat]!)}</b></span>`).join('') || '<span>Starter equipment</span>'}</div>${comparisons}<div class="item-actions">${actions}${gearUpgradeQuote(id) ? `<button type="button" class="primary-button" data-item-upgrade-mode="upgrade">${icon('gear')}Upgrade</button>` : (gear.upgradeLevel || 0) >= MAX_GEAR_UPGRADE ? `<span class="item-action-note">Fully upgraded · +${MAX_GEAR_UPGRADE}</span>` : ''}</div>${itemMore(id, renderItemTooltip(id, player))}`;
  }
  const resource = Object.hasOwn(resources, id) ? resources[id as keyof typeof resources] : undefined;
  if (!resource) return '<div class="bag-empty-detail">Select an item to inspect it.<br>Drag equipment onto its slot, or double-click to equip.</div>';
  return `<div class="item-detail-heading">${icon(resource.icon)}<div><h3>${resource.label}</h3><small>${resource.kind} · ${number(player.inventory[id as keyof typeof resources])} in your bag</small></div></div>${itemMore(id, `<p>${resource.description}</p>`)}${id === 'potion' ? `<button type="button" class="primary-button" data-use-potion ${!player.inventory.potion || player.hp <= 0 || player.hp >= player.maxHp ? 'disabled' : ''}>${icon('potion')}Drink potion · +55 health</button><small class="item-action-note">Health ${player.hp} / ${player.maxHp}</small>` : `<button type="button" class="primary-button" data-open-crafting>${icon('gear')} Visit workshop</button>`}`;
}

export interface BagViewOptions {
  activeBag?: string;
  filter?: 'all' | 'equipment' | 'materials' | 'consumables' | 'quest' | 'misc';
  sort?: 'slots' | 'type' | 'name' | 'quantity';
  mossBalance?: string | null;
  search?: string;
  contents?: 'grid' | 'list';
}
const bagLayoutIcon = (list = false) => `<svg class="bag-layout-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${list ? '<path d="M2 3h4v4H2zm6 0h14v4H8zM2 10h4v4H2zm6 0h14v4H8zM2 17h4v4H2zm6 0h14v4H8z"/>' : '<path d="M2 2h8v8H2zm12 0h8v8h-8zM2 14h8v8H2zm12 0h8v8h-8z"/>'}</svg>`;

export function renderBackpack(player: Player, selected = '', standalone = false, closedBags: readonly string[] = [], savedSlots: readonly (string | null)[] = [], view: BagViewOptions = {}, upgrading = false): string {
  const items = bagItems(player), storage = reconcileBagSlots(player, savedSlots), closed = new Set(closedBags), slots=equippedBags(player);
  let offset=0;
  const containers=[{id:'backpack',label:'Backpack',kind:'backpack',capacity:BASE_BAG_CAPACITY,quality:'common',slot:-1},
    ...slots.flatMap((id,slot)=>{const bag=id?ownedBag(player,id):undefined;if(!bag)return[];const definition=BAG_ITEMS[bag.kind];return[{id:bag.id,label:definition.label,kind:bag.kind,capacity:definition.slots,quality:definition.quality,slot}];})]
    .map(container=>{const start=offset;offset+=container.capacity;return {...container,start,contents:storage.slice(start,offset)};});
  const renderSlot = (id: string | null, index: number) => {
    const position = `data-storage-slot="${index}"${standalone&&(view.filter&&view.filter!=='all'||view.sort&&view.sort!=='slots'||view.search?.trim())?' data-storage-locked="true"':''}`;
    if (!id) return `<span class="bag-slot empty" ${position} aria-label="Empty bag slot ${index + 1}"></span>`;
    const drag = `${position}${itemLocked(player,id)?' data-item-locked="true"':''} draggable="true" data-drag-item="${escape(id)}" data-item-tooltip="${escape(id)}"`;
    const carriedId=id.startsWith('item:')?id.slice(5):'';
    if(lootItemValid(carriedId)){const item=LOOT_ITEMS[carriedId],count=player.carriedItems?.[carriedId]||0;return `<button type="button" class="bag-slot quality-${item.quality}" ${drag} data-inspect-item="${escape(id)}" aria-pressed="${id===selected}" aria-label="${escape(item.label)}, ${number(count)}${itemLocked(player,id)?', locked':''}" >${lootItemArt(carriedId)}${count>1?`<span class="item-stack" aria-hidden="true">${count>9999?compact.format(count):count}</span>`:''}</button>`;}
    const bag=id.startsWith('bag:')?ownedBag(player,id.slice(4)):undefined;
    if(bag){const definition=BAG_ITEMS[bag.kind];return `<button type="button" class="bag-slot quality-${definition.quality}" ${drag} data-inspect-item="${escape(id)}" aria-pressed="${id===selected}" aria-label="${escape(definition.label)}, ${definition.slots} slots${itemLocked(player,id)?', locked':''}"  data-drag-bag="${escape(bag.id)}">${bagArt(bag.kind)}<span class="item-stack" aria-hidden="true">${definition.slots}</span></button>`;}
    const gear = gearById(id), resource = resources[id as keyof typeof resources];
    if(!gear&&!resource)return '<span class="bag-slot empty" aria-label="Unknown item"></span>';
    const label = gear?.label || resource.label, count = gear ? 1 : player.inventory[id as keyof typeof resources];
    return `<button type="button" class="bag-slot ${gear ? `quality-${quality(gear)}` : 'quality-common'}" ${drag} data-inspect-item="${escape(id)}" aria-pressed="${id === selected}" aria-label="${escape(label)}${itemLocked(player,id)?', locked':''}${count > 1 ? `, ${number(count)}` : ''}"  ${gear ? `data-drag-gear="${escape(id)}"` : ''}>${gear ? gearArt(gear) : icon(resource.icon)}${count > 1 ? `<span class="item-stack" aria-hidden="true">${count > 9999 ? compact.format(count) : count}</span>` : ''}${gear && player.level < gear.requiredLevel ? `<span class="item-level-lock">${gear.requiredLevel}</span>` : ''}</button>`;
  };
  const pending=player.pendingAuctionPurchases?.length?`<section class="bag-pending-purchases" aria-label="Pending auction purchases"><h3>Pending purchases</h3><p>Purchase pending. Items remain locked until delivery completes.</p><ul>${player.pendingAuctionPurchases.map(({id,item})=>{
    const gear=item.kind==='gear'?gearById(item.id):undefined,loot=item.kind==='item'?LOOT_ITEMS[item.id]:undefined;
    const art=gear?gearArt(gear):loot?lootItemArt(item.id):icon(item.kind==='gold'?'gold':resources[item.id as keyof typeof resources]?.icon||'bag');
    return `<li data-pending-auction="${escape(id)}" class="quality-${gear?quality(gear):loot?.quality||'common'}">${art}<div><strong>${escape(auctionItemLabel(item))}</strong><small>${number(item.quantity)} ${item.kind==='gold'?'gold in lot':item.quantity===1?'item':'items'} · Pending delivery</small></div></li>`;
  }).join('')}</ul></section>`:'';
  const moss=typeof view.mossBalance==='string'&&/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(view.mossBalance)?view.mossBalance:null;
  const [mossWhole,mossFraction='']=(moss||'0').split('.'),mossDecimals=mossFraction.slice(0,4).replace(/0+$/,'');
  const mossAmount=moss===null?'—':mossWhole==='0'&&!mossDecimals&&/[1-9]/.test(mossFraction)?'<0.0001':mossWhole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(mossDecimals?`.${mossDecimals}`:'');
  const currency=`<div class="bag-currencies"><div class="bag-currency">${icon('gold')}<strong>${number(player.gold)}</strong><span>gold</span></div><div class="bag-currency bag-moss" title="${escape(moss===null?'Mossvale wallet balance unavailable':`Mossvale wallet · ${moss} MOSS`)}">${icon('leaf')}<strong>${escape(mossAmount)}</strong><span>MOSS</span></div></div>`;
  const emptySocket=(slot:number)=>`<span class="bag-toggle empty" role="img" tabindex="0" aria-label="Empty bag socket ${slot+1}. Equip a bag to add storage." title="Bag ${slot+1} · Drop a bag here">${bagArt()}<span class="bag-size" aria-hidden="true">—</span></span>`;
  if(!standalone){
    const active=containers.find(container=>container.id===view.activeBag),activeId=active?.id||'all',contents=active?.contents||storage,start=active?.start||0;
    const tab=(container?:typeof containers[number])=>{const id=container?.id||'all',count=container?container.contents.filter(Boolean).length:items.length,capacity=container?.capacity||storage.length,label=container?container.slot<0?'Backpack':`Bag ${container.slot+1}`:'Bag';return `<button type="button" class="bag-tab${container?` quality-${container.quality}`:''}" data-select-bag="${escape(id)}" aria-pressed="${id===activeId}" aria-label="${label}, ${count} / ${capacity} slots" ${container?`draggable="true" data-drag-bag="${escape(container.id)}" data-item-tooltip="bag-kind:${escape(container.kind)}"`:''}>${container ? bagArt(container.kind) : icon('menu-bags')}<span><strong>${label}</strong><small>${count} / ${capacity}</small></span></button>`;};
    return `<div class="bag-manager bag-profile"><nav class="bag-tabs" aria-label="Bags">${tab()}${Array.from({length:BAG_SLOT_COUNT},(_,slot)=>{const container=containers.find(bag=>bag.slot===slot);return `<div class="bag-socket${container?'':' empty'}" data-bag-slot="${slot}">${container?tab(container):emptySocket(slot)}</div>`;}).join('')}</nav><div class="bag-toolbar">${currency}<span class="bag-capacity">${contents.filter(Boolean).length} / ${contents.length} slots</span><div class="bag-layout-switch" aria-label="Inventory layout"><button type="button" data-bag-layout="list" aria-label="Show all bags" aria-pressed="false" title="Show all bags">${bagLayoutIcon(true)}</button><button type="button" data-bag-layout="grid" aria-label="Show character inventory" aria-pressed="true" title="Show character inventory">${bagLayoutIcon()}</button></div></div><div class="bag-windows">${pending}<div class="bag-grid" aria-label="${escape(active?.label||'All bags')} slots">${contents.map((id,index)=>renderSlot(id,start+index)).join('')}</div></div></div>`;
  }
  const filter=view.filter||'all',sort=view.sort||'slots',search=(view.search||'').slice(0,100),query=search.trim().toLocaleLowerCase(),contents=view.contents==='list'?'list':'grid';
  const activeBag=containers.some(container=>container.id===view.activeBag)?view.activeBag!:'all';
  const filters=[['all','All'],['equipment','Equipment'],['materials','Materials'],['consumables','Consumables'],['quest','Quest'],['misc','Misc']] as const;
  const itemInfo=(id:string)=>{
    const gear=gearById(id),resource=Object.hasOwn(resources,id)?resources[id as keyof typeof resources]:undefined,carried=id.startsWith('item:')?id.slice(5):'',loot=lootItemValid(carried)?LOOT_ITEMS[carried]:undefined,bag=id.startsWith('bag:')?ownedBag(player,id.slice(4)):undefined;
    const category=gear?'equipment':resource?id==='potion'?'consumables':'materials':carried==='treasure-map'||carried==='moss-voucher'?'quest':loot?.category==='food'||loot?.category==='potion'?'consumables':'misc';
    return {category,name:gear?.label||resource?.label||loot?.label||(bag?BAG_ITEMS[bag.kind].label:id),count:resource?player.inventory[id as keyof typeof resources]:loot?player.carriedItems?.[carried]||0:1,kind:gear?labels[gear.slot as EquipmentSlot]||'Equipment':loot?.category||category};
  };
  const tab=(container?:typeof containers[number])=>{
    const id=container?.id||'all',count=container?container.contents.filter(Boolean).length:items.length,capacity=container?.capacity||storage.length,label=container?.label||'All bags';
    return `<button type="button" class="bag-tab${container?` quality-${container.quality}`:''}" data-select-bag="${escape(id)}" aria-pressed="${activeBag===id}" aria-label="${escape(label)}, ${count} / ${capacity} slots"${container&&container.slot>=0?` draggable="true" data-drag-bag="${escape(container.id)}" data-item-tooltip="bag-kind:${escape(container.kind)}"`:''}>${container?bagArt(container.kind):icon('menu-bags')}<span><strong>${escape(label)}</strong><small>${count} / ${capacity}</small></span><progress value="${count}" max="${capacity}" aria-label="${escape(label)} capacity"></progress></button>`;
  };
  const tabs=`<nav class="bag-tabs bag-capacity-tabs" aria-label="Bags">${tab()}${tab(containers[0])}${Array.from({length:BAG_SLOT_COUNT},(_,slot)=>{const container=containers.find(bag=>bag.slot===slot);return `<div class="bag-socket${container?'':' empty'}" data-bag-slot="${slot}">${container?tab(container):emptySocket(slot)}</div>`;}).join('')}</nav>`;
  const bar=`<header class="bag-bar"><div class="bag-bar-summary"><strong>Your bags</strong><span>${items.length} / ${bagCapacity(player)} slots</span><button type="button" class="bag-character-button" data-open-character>${icon('menu-character')}Character</button><button type="button" class="bag-close" data-close-bag aria-label="Close bags">${icon('close')}</button></div></header>`;
  const tools=`<div class="bag-toolbar">${currency}<label class="bag-search"><span>Search items</span><input type="search" data-bag-search maxlength="100" autocomplete="off" value="${escape(search)}" placeholder="Search your bags" aria-label="Search items"></label><div class="bag-layout-switch" role="group" aria-label="Item display">${(['grid','list'] as const).map(mode=>`<button type="button" data-bag-contents="${mode}" aria-label="Show ${mode==='grid'?'item grid':'item list'}" aria-pressed="${contents===mode}">${bagLayoutIcon(mode==='list')}</button>`).join('')}</div></div>`;
  const toolbar=`<div class="bag-filters"><div class="bag-filter-options" aria-label="Filter items">${filters.map(([value,label])=>`<button type="button" data-bag-filter="${value}" aria-pressed="${filter===value}"><span>${label}</span></button>`).join('')}</div><label class="bag-sort">Sort by <select data-bag-sort aria-label="Sort bag items" title="Choose Custom to rearrange slots.">${[['slots','Custom'],['type','Type'],['name','Name'],['quantity','Quantity']].map(([value,label])=>`<option value="${value}"${sort===value?' selected':''}>${label}</option>`).join('')}</select></label></div>`;
  const windows=containers.filter(container=>activeBag==='all'||container.id===activeBag).map(container=>{
    const cells=container.contents.map((id,index)=>({id,index:container.start+index,info:id?itemInfo(id):null})).filter(cell=>(filter==='all'||cell.info?.category===filter)&&(!query||cell.info?.name.toLocaleLowerCase().includes(query))&&(contents!=='list'||cell.id));
    if(sort!=='slots')cells.sort((a,b)=>!a.info?b.info?1:0:!b.info?-1:(sort==='quantity'?b.info.count-a.info.count:sort==='type'?filters.findIndex(([value])=>value===a.info!.category)-filters.findIndex(([value])=>value===b.info!.category):0)||a.info.name.localeCompare(b.info.name)||a.index-b.index);
    const renderCell=(cell:typeof cells[number])=>{const html=renderSlot(cell.id,cell.index);return contents==='list'&&cell.info?html.replace('</button>',`<span class="bag-list-copy"><strong>${escape(cell.info.name)}</strong><small>${escape(cell.info.kind)}${cell.id&&itemLocked(player,cell.id)?' · Locked':''}</small></span><span class="bag-list-quantity">${number(cell.info.count)}</span></button>`):html;};
    return `<section class="backpack-window bag-container" id="bag-container-${escape(container.id)}" data-bag-container="${escape(container.id)}" aria-label="${escape(container.label)}" ${closed.has(container.id)?'hidden':''}><header class="bag-heading">${container.slot>=0?`<button type="button" class="bag-container-inspect" data-inspect-item="bag:${escape(container.id)}" data-item-tooltip="bag-kind:${escape(container.kind)}" aria-label="Inspect ${escape(container.label)}">${bagArt(container.kind)}</button>`:bagArt()}<div><h3>${escape(container.label)}</h3><span>${query||filter!=='all'?`${cells.length} matching items`: `${container.contents.filter(Boolean).length} / ${container.capacity} slots`}</span></div><button type="button" class="bag-close" data-close-container="${escape(container.id)}" aria-label="Close ${escape(container.label)}">${icon('close')}</button></header><div class="bag-grid${contents==='list'?' bag-list':''}" aria-label="${escape(container.label)} slots">${cells.map(renderCell).join('')}</div>${!cells.length?'<p class="bag-no-results" role="status">No matching items in this bag.</p>':''}</section>`;
  }).join('');
  const detail=selected?renderItemDetails(player,selected,upgrading,true):'<div class="bag-detail-empty"><strong>Choose an item</strong><p>Inspect equipment, use supplies or manage an item’s lock.</p></div>';
  return `<div class="bag-manager bag-overview bag-redesign">${bar}${tabs}${tools}${toolbar}<div class="bag-content-layout"><div class="bag-windows">${pending}${windows}</div><section class="item-detail${selected?'':' is-empty'}" id="bag-item-details" aria-live="polite">${detail}</section></div></div>`;
}

export function renderGear(player: Player, selected = '', inspecting = false, closedBags: readonly string[] = [], savedSlots: readonly (string | null)[] = [], upgrading = false, view: BagViewOptions = {}): string {
  const stats = combatStats(player), attributes = equippedAttributes(player);
  const identity=`<strong translate="no">${escape(player.name || 'Adventurer')}</strong><span>Lv ${player.level} ${player.appearance.className}</span>${playerTitle(player)?`<span class="character-title">&lt;${escape(playerTitle(player)!)}&gt;</span>`:''}`;
  const slot = (type: EquipmentSlot) => {
    const id = player.equipment[type], gear = gearById(id);
    return `<div class="paper-doll-slot" ${inspecting ? '' : `data-gear-slot="${type}"`}><span>${labels[type]}</span><button type="button" class="bag-slot equipment-slot-button ${gear ? `quality-${quality(gear)}` : 'empty'}" ${gear && !inspecting ? `data-inspect-item="${escape(id!)}" aria-pressed="${id === selected}"` : ''} aria-label="${labels[type]}: ${escape(gear?.label || 'empty')}${gear&&itemLocked(player,gear.id)?', locked':''}" ${gear ? `${itemLocked(player,gear.id)?'data-item-locked="true" ':''}data-item-tooltip="${escape(gear.id)}"` : `title="${inspecting ? 'Empty slot' : `Drop ${labels[type].toLowerCase()} equipment here`}"`}>${gear ? gearArt(gear) : emptyGearArt(type, player)}</button></div>`;
  };
  return `<div class="character-bags${inspecting ? '' : ' profile-inventory'}"><section class="character-sheet" aria-label="Character equipment">${inspecting?'':`<header class="character-identity">${icon(weaponIcons[player.appearance.className])}<div>${identity}</div></header>`}<div class="paper-doll"><div class="paper-doll-stage"></div><div class="equipment-rail left">${slot('head')}${slot('charm')}${slot('armor')}${slot('back')}</div><div class="equipment-rail right">${slot('legs')}${slot('shoes')}${slot('ring1')}${slot('ring2')}</div><div class="equipment-weapon">${slot('weapon')}</div>${inspecting?`<div class="paper-doll-caption">${identity}<small>Drag to rotate · Arrow keys to turn</small></div>`:''}</div><dl class="character-attributes"><div><dt>${icon('heartroot')}HP</dt><dd>${player.hp ?? player.maxHp ?? 100}<small> / ${player.maxHp ?? 100}</small></dd></div><div><dt>${icon(weaponIcons[player.appearance.className])}ATK</dt><dd>${stats.primaryDamage}</dd></div><div><dt>${icon('spark')}Magic</dt><dd>${stats.specialDamage}</dd></div><div><dt>${icon('shield')}DEF</dt><dd>${stats.defense}</dd></div><div><dt>${icon('travel')}Speed</dt><dd>+${Math.round((gearSpeedMultiplier(player)-1)*100)}<small>%</small></dd></div></dl><dl class="character-primary-attributes" aria-label="Attributes from equipment">${PRIMARY_ATTRIBUTES.map(attribute => `<div tabindex="0" title="${attribute}: ${ATTRIBUTE_EFFECTS[attribute]}" aria-label="${attribute}: ${number(attributes[attribute])}. ${ATTRIBUTE_EFFECTS[attribute]}"><dt>${compactStatLabels[attribute]}</dt><dd>${number(attributes[attribute])}</dd></div>`).join('')}</dl>${inspecting ? `<ul class="inspect-equipment" aria-label="Equipped items">${EQUIPMENT_SLOTS.map(type => { const gear = gearById(player.equipment[type]); return `<li${gear ? ` tabindex="0" data-item-tooltip="${escape(gear.id)}"` : ''}>${gear ? gearArt(gear) : emptyGearArt(type, player)}<div><strong>${labels[type]} · ${escape(gear?.label || 'Empty')}</strong>${gear ? `<small>Level ${gear.requiredLevel} · ${bonuses(gear.stats)}</small>` : ''}</div></li>`; }).join('')}</ul>` : ''}</section>${inspecting ? '' : `<aside class="character-pack">${renderBackpack(player, selected, false, closedBags, savedSlots, view)}<section class="item-detail" id="bag-item-details" aria-live="polite" ${selected?'':'hidden'}>${selected?renderItemDetails(player, selected, upgrading):''}</section></aside>`}</div>`;
}
