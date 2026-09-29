import type { Player } from './shared.ts';
import type { StoryQuest } from './story-quests.ts';
import { GEAR, gearById, rollGear, type GearSlot } from './progression.ts';
import { LOOT_ITEMS } from './loot-items.ts';
import { MAX_SKILL_XP } from './skills.ts';
import { bagCanFit } from './bags.ts';

/** Builds a bag-checked reward without changing the owner. Gold, XP and claim state commit together on the server. */
export function storyQuestRewardChanges(player: Player, quest: StoryQuest, slot?: GearSlot, random = Math.random): Pick<Player, 'inventory' | 'carriedItems' | 'ownedGear' | 'skills'> | undefined {
  const reward = quest.reward;
  if (slot !== undefined && (!reward.gear?.choice || !reward.gear.slots.includes(slot))) return;
  if (reward.gear?.choice && (slot === undefined || !reward.gear.slots.includes(slot))) return;
  const inventory = { ...player.inventory }, carriedItems = { ...player.carriedItems }, skills = { ...player.skills }, ownedGear = [...player.ownedGear];
  inventory.potion += reward.potions ?? 0;
  inventory.crystal += reward.crystal ?? 0;
  inventory.relic += reward.relic ?? 0;
  for (const [id, count] of Object.entries(reward.inventory ?? {})) inventory[id as 'wood' | 'herb'] += count;
  for (const [id, count] of Object.entries(reward.items ?? {})) {
    if (!Object.hasOwn(LOOT_ITEMS, id)) return;
    carriedItems[id] = (carriedItems[id] ?? 0) + count;
  }
  for (const [id, xp] of Object.entries(reward.professionXp ?? {})) {
    const skill = id as keyof typeof skills;
    if (!Object.hasOwn(skills, skill) || !Number.isSafeInteger(xp) || xp < 0) return;
    skills[skill] = Math.min(MAX_SKILL_XP, skills[skill] + xp);
  }
  if (![...Object.values(inventory), ...Object.values(carriedItems), ...Object.values(skills)].every(value => Number.isSafeInteger(value) && value! >= 0)) return;
  if (reward.gear) {
    const cap = Math.min(player.level, quest.requiredLevel);
    const pool = Object.values(GEAR).filter(gear => gear.price > 0 && gear.requiredLevel <= cap
      && (!gear.className || gear.className === player.appearance.className)
      && (slot ? gear.slot === slot : reward.gear!.slots.includes(gear.slot)));
    const highest = Math.max(0, ...pool.map(gear => gear.requiredLevel));
    const eligible = pool.filter(gear => gear.requiredLevel === highest);
    if (!eligible.length) return;
    let gear = rollGear(eligible[Math.floor(random() * eligible.length)].id, reward.gear.quality, random);
    const reserved = new Set([...ownedGear, ...(player.bank?.gear ?? []), ...(player.auctions ?? []).filter(listing => listing.item.kind === 'gear').map(listing => listing.item.id)]);
    // A repeated RNG seed must create a second physical item, never overwrite an existing rolled item.
    while (reserved.has(gear.id)) {
      const parts = gear.id.split('~');
      parts[3] = ((BigInt(`0x${parts[3]}`) + 1n) % (1n << 64n)).toString(16).padStart(16, '0');
      gear = gearById(parts.join('~'))!;
    }
    ownedGear.push(gear.id);
  }
  const changes = { inventory, carriedItems, ownedGear, skills };
  return bagCanFit(player, changes) ? changes : undefined;
}
