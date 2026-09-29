import { goldSource } from './gold-economy';
import type { Player } from './shared';
import { ATTRIBUTE_EFFECTS, PRIMARY_ATTRIBUTES, GEAR_SETS, RESOURCE_PRICES, gearSetBonuses, gearById, gearQuality, gearStatBreakdown, EQUIPMENT_SLOTS, gearFitsSlot, type Gear, type GearSlot, type StatBonuses } from './progression';
import { AUTO_ATTACKS } from './auto-attacks';
import { BAG_ITEMS, bagKindValid } from './bags';
import { LOOT_ITEMS, lootItemValid } from './loot-items';
import { gearSellPrice } from './merchants';
import { icon } from './icons';

export const itemResources = {
  potion: { label: 'Healing potion', icon: 'potion', kind: 'Consumable', description: 'Restores 55 health. Use from your bag or hotbar.' },
  wood: { label: 'Wood', icon: 'wood', kind: 'Crafting material', description: 'Gathered from trees. Used for crafting and equipment upgrades.' },
  crystal: { label: 'Lantern fragments', icon: 'crystal', kind: 'Crafting material', description: 'Mined from crystal deposits. Used for crafting and equipment upgrades.' },
  herb: { label: 'Wild herbs', icon: 'resource-herb', kind: 'Crafting material', description: 'Picked in the wild. Used for crafting and equipment upgrades.' },
  relic: { label: 'Rootvault relics', icon: 'resource-relic', kind: 'Dungeon material', description: 'Recovered from dungeons. Forge powerful equipment and improve higher-tier gear.' },
} as const;
export const itemStatLabels: Record<keyof StatBonuses, string> = {
  strength: 'strength', agility: 'agility', intellect: 'intellect', stamina: 'stamina', spirit: 'spirit',
  primaryDamage: 'attack damage', specialDamage: 'magic (skill damage)', damage: 'all damage', defense: 'defense (armor)', speed: 'movement speed',
};
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (value: number) => value.toLocaleString('en-US');
const slots: Record<GearSlot, string> = { weapon: 'Weapon', armor: 'Body', charm: 'Necklace', head: 'Head', legs: 'Legs', shoes: 'Feet', back: 'Back', ring: 'Finger' };
const weaponTypes = { Ranger: 'Bow', Knight: 'Sword', Mage: 'Staff', Cleric: 'Mace' };
const armorTypes = { Ranger: 'Leather', Knight: 'Plate', Mage: 'Cloth', Cleric: 'Cloth' };
const title = (label: string) => `<h3 class="item-sheet-name">${escape(label)}</h3>`;
const line = (text: string, className = '') => `<div${className ? ` class="${className}"` : ''}>${text}</div>`;
const sheet = (quality: string, content: string) => `<div class="item-sheet quality-${quality}">${content}</div>`;
const sellPrice = (price: number) => line(`Sell Price: <span class="item-sheet-gold">${number(price)} ${icon('gold')}<span>gold</span></span>`, 'item-sheet-price');
const description = (text: string) => line(escape(text), 'item-sheet-description');
const requirements = (level: number, className: Gear['className'], player?: Player | null) => `<div class="item-sheet-requirements">${line(`Requires Level ${level}`, player && player.level < level ? 'item-sheet-unmet' : '')}${className ? line(`Calling: ${className}`, player && player.appearance.className !== className ? 'item-sheet-unmet' : '') : ''}</div>`;

const statName = (stat: keyof StatBonuses) => itemStatLabels[stat][0].toUpperCase() + itemStatLabels[stat].slice(1);
const statAmount = (stat: keyof StatBonuses, value: number) => `${number(value)}${stat === 'speed' ? '%' : ''}`;
const gearContext = (gear: Gear) => `Level ${gear.requiredLevel} · ${gear.className || 'Any calling'} · Upgrade +${gear.upgradeLevel || 0}`;

/** One disclosure is shared by hover, bags, bank and market inspection. */
export function renderGearRollDetails(gear: Gear, player?: Player | null): string {
  const comparisons = player ? EQUIPMENT_SLOTS.filter(slot => gearFitsSlot(gear.id, slot)).map(slot => {
    const worn = gearById(player.equipment[slot]), slotName = slot === 'ring1' ? 'Ring 1' : slot === 'ring2' ? 'Ring 2' : slots[gear.slot];
    if (worn?.id === gear.id) return line(`Already equipped · ${slotName}`, 'item-sheet-note');
    const differences = (Object.keys(itemStatLabels) as (keyof StatBonuses)[]).flatMap(stat => {
      const delta = (gear.stats[stat] || 0) - (worn?.stats[stat] || 0);
      return delta ? [line(`${delta > 0 ? '+' : '−'}${statAmount(stat, Math.abs(delta))} ${itemStatLabels[stat]}`, delta > 0 ? 'item-roll-gain' : 'item-roll-loss')] : [];
    }).join('');
    return `<section class="item-roll-comparison"><strong>${slotName} · Compared with ${escape(worn?.label || 'empty slot')}</strong>${worn ? line(gearContext(worn), 'item-sheet-note') : ''}${differences || line('Same bonuses')}</section>`;
  }).join('') : '';
  return `<details class="item-roll-details" data-item-roll="${escape(gear.id)}"><summary>Roll details</summary><div class="item-roll-body">
    ${line(gearContext(gear), 'item-sheet-note')}
    ${line(gear.randomized ? 'Ranges apply only to the random affixes selected for this item.' : 'Fixed item: no random affixes.', 'item-sheet-note')}
    <ul class="item-roll-stats">${gearStatBreakdown(gear.id).map(row => `<li><div class="item-roll-heading"><strong>${statName(row.stat)}</strong><span>Total ${statAmount(row.stat, row.total)}</span></div><dl><div><dt>Base</dt><dd>${statAmount(row.stat, row.base)}</dd></div><div><dt>Roll</dt><dd>${statAmount(row.stat, row.roll)}${row.max ? `<small>Range ${statAmount(row.stat, row.min)}–${statAmount(row.stat, row.max)}</small>` : '<small>No affix</small>'}</dd></div><div><dt>Upgrade</dt><dd>${statAmount(row.stat, row.upgrade)}</dd></div></dl></li>`).join('')}</ul>
    ${line('Higher rarity can raise roll potential and affix count. Level, calling, base stats, upgrades and actual rolls still matter: an epic is not always better for your build.', 'item-sheet-note')}
    ${comparisons ? `<div class="item-roll-comparisons"><strong>If equipped instead</strong>${comparisons}</div>` : ''}
  </div></details>`;
}

/** Retain the native toggle and focused summary when a passive update rebuilds its owner. */
export function preserveItemRollDetails(container: ParentNode): () => void {
  const previous = [...container.querySelectorAll<HTMLDetailsElement>('[data-item-roll]')].map(node => ({node, scroll: node.querySelector('.item-roll-body')?.scrollTop})), active = document.activeElement;
  return () => {
    const next = [...container.querySelectorAll<HTMLDetailsElement>('[data-item-roll]')];
    for (const {node: old, scroll} of previous) {
      const replacement = next.find(node => node.dataset.itemRoll === old.dataset.itemRoll);
      if (!replacement || replacement === old) continue;
      const summary = old.querySelector('summary')!;
      if (old.innerHTML !== replacement.innerHTML) {
        old.replaceChildren(...replacement.childNodes);
        old.querySelector('summary')!.replaceWith(summary);
      }
      replacement.replaceWith(old);
      const body = old.querySelector('.item-roll-body'); if (body && scroll !== undefined) body.scrollTop = scroll;
      if (active === summary) summary.focus({ preventScroll: true });
    }
  };
}

/** Shared item sheet for pointer/focus previews and the actionable bag detail pane. */
export function renderItemTooltip(id: string, player?: Player | null): string {
  const gear = gearById(id);
  if (gear) {
    const quality = gearQuality(gear), calling = gear.className;
    const type = gear.slot === 'weapon' ? calling ? weaponTypes[calling] : 'Weapon' : ['armor', 'head', 'legs', 'shoes'].includes(gear.slot) ? calling ? armorTypes[calling] : 'Armor' : gear.slot === 'back' ? 'Cloak' : 'Accessory';
    const attributes = PRIMARY_ATTRIBUTES.filter(stat => gear.stats[stat]).map(stat => line(`+${number(gear.stats[stat]!)} ${itemStatLabels[stat][0].toUpperCase() + itemStatLabels[stat].slice(1)}`) + line(ATTRIBUTE_EFFECTS[stat], 'item-sheet-attribute-effect')).join('');
    const bonuses = (Object.keys(itemStatLabels) as (keyof StatBonuses)[]).filter(stat => !Object.hasOwn(ATTRIBUTE_EFFECTS, stat) && gear.stats[stat]).map(stat => line(`+${number(gear.stats[stat]!)}${stat === 'speed' ? '%' : ''} ${itemStatLabels[stat][0].toUpperCase() + itemStatLabels[stat].slice(1)}`)).join('');
    const set = GEAR_SETS.find(set => set.id === gear.setId);
    return sheet(quality, title(gear.label)
      + line(`Item Level ${gear.requiredLevel}${gear.upgradeLevel ? ` · Upgrade +${gear.upgradeLevel}` : ''}`, 'item-sheet-level')
      + `<div class="item-sheet-type"><span>${slots[gear.slot]}</span><span>${type}</span></div>`
      + (gear.slot === 'weapon' && calling ? line(`Attack interval ${ (AUTO_ATTACKS[calling].cooldownMs / 1000).toFixed(2)}s`, 'item-sheet-weapon') : '')
      + (attributes ? `<div class="item-sheet-attributes">${attributes}</div>` : '')
      + (bonuses ? `<div class="item-sheet-bonuses">${bonuses}</div>` : '')
      + (gear.randomized ? line('Randomly rolled bonuses', 'item-sheet-note') : '')
      + (set ? line(`${escape(set.label)} set${player ? ` · ${new Set(Object.values(player.equipment).map(id => gearById(id)).filter(item => item?.setId === set.id).map(item => item!.slot)).size} / 8 pieces equipped` : ''}`, 'item-sheet-set') : '')
      + (set ? gearSetBonuses(set.id).map(bonus => line(`(${bonus.pieces}) ${bonus.description}`, player && new Set(Object.values(player.equipment).map(id => gearById(id)).filter(item => item?.setId === set.id).map(item => item!.slot)).size >= bonus.pieces ? 'item-sheet-bonuses' : 'item-sheet-note')).join('') : '')
      + description(gear.description) + requirements(gear.requiredLevel, calling, player) + renderGearRollDetails(gear, player) + sellPrice(goldSource(gearSellPrice(gear.id), 'resale', player?.economyVersion === 1)));
  }
  const lootId = id.startsWith('item:') ? id.slice(5) : id;
  if (lootItemValid(lootId)) {
    const item = LOOT_ITEMS[lootId], category = { junk: 'Vendor junk', treasure: 'Treasure', food: 'Food', potion: 'Potion', pet: 'Companion', mount: 'Mount' }[item.category];
    return sheet(item.quality, title(item.label) + line(category, 'item-sheet-type')
      + (item.heal ? line(`Use: Restores ${item.heal} health.`, 'item-sheet-bonuses') + line(`${item.category === 'food' ? 'Out of combat' : 'Usable in combat'} · Shared 10s cooldown`, 'item-sheet-note') : '')
      + description(item.description) + (lootId === 'moss-voucher' ? line('Redeem with Veyl in Willowbrook. Cannot be sold for gold.', 'item-sheet-bonuses') : lootId === 'treasure-map' ? line('Use from your bags. One active expedition at a time. Unused maps can be auctioned.', 'item-sheet-bonuses') : item.category === 'mount' ? line('Learn this mount, mint it as an NFT, or sell it at the Auction House. Riding requires training.', 'item-sheet-bonuses') : item.category === 'pet' ? line('Learn this companion or sell it at the Auction House.', 'item-sheet-bonuses') : sellPrice(goldSource(item.sellPrice, 'resale', player?.economyVersion === 1))));
  }
  const bagId = id.startsWith('bag:') ? id.slice(4) : '', kind = id.startsWith('bag-kind:') ? id.slice(9) : player?.ownedBags?.find(bag => bag.id === bagId)?.kind;
  if (bagKindValid(kind)) {
    const bag = BAG_ITEMS[kind];
    return sheet(bag.quality, title(bag.label) + line('Bag', 'item-sheet-type') + line(`${bag.slots} storage slots`, 'item-sheet-bonuses') + description(bag.description) + requirements(bag.requiredLevel, null, player) + sellPrice(goldSource(Math.floor(bag.price / 4), 'resale', player?.economyVersion === 1)));
  }
  if (Object.hasOwn(itemResources, id)) {
    const resource = itemResources[id as keyof typeof itemResources];
    return sheet('common', title(resource.label) + line(resource.kind, 'item-sheet-type')
      + (id === 'potion' ? line('Use: Restores 55 health.', 'item-sheet-bonuses') : '') + description(resource.description)
      + (Object.hasOwn(RESOURCE_PRICES, id) ? sellPrice(goldSource(RESOURCE_PRICES[id as keyof typeof RESOURCE_PRICES], 'resale', player?.economyVersion === 1)) : ''));
  }
  return id === 'gold' ? sheet('common', title('Gold') + line('Currency', 'item-sheet-type') + description('Earned through adventures and trading. Spend at merchants, trainers, workshops, and on equipment upgrades.')) : '';
}
