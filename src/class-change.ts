import { bagCanFit, bagCapacity, bagUsage, bagsValid } from './bags.ts';
import { BANK_CAPACITY, bankItems, bankPlayerValid, newBank } from './bank.ts';
import { auctionEscrowHas } from './auction.ts';
import { EQUIPMENT_SLOTS, MAX_LEVEL, TALENT_VERSION, gearById, gearFitsSlot, gearIdValid, maxHealth, starterGear } from './progression.ts';
import { CHARACTER_CLASSES, type CharacterClass, type Player } from './shared.ts';
import { defaultHotbar, LEGACY_HOTBAR_PAGE_SIZE, spellsForClass } from './spells.ts';

type ClassChange = Pick<Player, 'appearance' | 'ownedGear' | 'equipment' | 'bank' | 'learnedSpells' | 'hotbar' | 'hotbar2' | 'hotbarExtra' | 'hotbar2Extra' | 'talents' | 'talentVersion' | 'hp' | 'maxHp'>;

/** Prepare the whole transition before the server consumes a paid credit or saves anything. */
export function classChangeChanges(player: Player, target: unknown): ClassChange | null {
  if (!CHARACTER_CLASSES.includes(target as CharacterClass) || !CHARACTER_CLASSES.includes(player.appearance.className)
    || target === player.appearance.className || !Number.isSafeInteger(player.level) || player.level < 1 || player.level > MAX_LEVEL
    || !Number.isFinite(player.hp) || player.hp <= 0 || !Array.isArray(player.ownedGear)
    || new Set(player.ownedGear).size !== player.ownedGear.length
    || !player.ownedGear.every(id => gearIdValid(id) && gearById(id)!.requiredLevel <= player.level)
    || !EQUIPMENT_SLOTS.every(slot => { const id = player.equipment[slot]; return id === null || player.ownedGear.includes(id)
      && gearFitsSlot(id, slot) && (!gearById(id)!.className || gearById(id)!.className === player.appearance.className); })
    || !bagsValid(player) || !bankPlayerValid(player)) return null;

  const className = target as CharacterClass, starter = starterGear(className);
  if (starter.ownedGear.some(id => auctionEscrowHas(player, id))) return null;
  const bank = { ...(player.bank ?? newBank()), gear: (player.bank?.gear ?? []).filter(id => !starter.ownedGear.includes(id)) };
  const ownedGear = [...new Set([...player.ownedGear, ...starter.ownedGear])];
  const learnedSpells = spellsForClass(className).filter(spell => spell.requiredLevel === 1).map(spell => spell.id);
  const changes: ClassChange = {
    appearance: { ...player.appearance, className }, ownedGear, equipment: starter.equipment, bank,
    learnedSpells, hotbar: defaultHotbar(className, player.level, learnedSpells).slice(0, LEGACY_HOTBAR_PAGE_SIZE), hotbar2: Array(LEGACY_HOTBAR_PAGE_SIZE).fill(null), hotbarExtra: [null, null], hotbar2Extra: [null, null], talents: [], talentVersion: TALENT_VERSION,
    hp: player.hp, maxHp: player.maxHp,
  };
  // Unequip all previous gear. Keep it in the backpack first, then use bank slots for overflow.
  const overflow = Math.max(0, bagUsage({ ...player, ...changes }) - bagCapacity(player));
  if (overflow) {
    const previousEquipment = [...new Set(Object.values(player.equipment))].filter((id): id is string => id !== null && !starter.ownedGear.includes(id));
    if (overflow > previousEquipment.length || bankItems(bank).length + overflow > BANK_CAPACITY) return null;
    const stored = new Set(previousEquipment.slice(-overflow));
    changes.ownedGear = ownedGear.filter(id => !stored.has(id));
    bank.gear.push(...stored);
  }
  const projected = { ...player, ...changes };
  if (!bagCanFit(projected) || !bankPlayerValid(projected)) return null;
  changes.maxHp = maxHealth(projected);
  changes.hp = Math.min(player.hp, changes.maxHp);
  return changes;
}
