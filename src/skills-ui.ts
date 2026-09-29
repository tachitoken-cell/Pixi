import { goldSource } from './gold-economy';
import type { Player } from './shared';
import { SKILLS, RESOURCE_TYPES, PROFESSION_RANKS, MAX_SKILL_XP, gatheringDuration, canGather, skillProgress, professionRank, professionDifficulty, gatheringXpGain, nextGatheringUnlock, type SkillId } from './skills';
import { getZone, type NodeKind } from './content';
import { WORLD_GATHERING_NODES } from './gathering-nodes';
import { RECIPES } from './adventure';
import { LOOT_ITEMS } from './loot-items';
import { icon } from './icons';

const professionIcons: Record<SkillId, string> = { mining: 'mining', woodcutting: 'woodcutting', herbalism: 'herbalism', fishing: 'fish' };
const starterResources: Record<SkillId, NodeKind> = { mining: 'crystal', woodcutting: 'timber', herbalism: 'herb', fishing: 'brook-shoal' };
const professionUses: Record<SkillId, string> = { mining: 'Lantern fragments for smithing and alchemy', woodcutting: 'Timber for woodworking and equipment', herbalism: 'Herbs for potions and woven equipment', fishing: 'Catch fish to eat out of combat or sell to merchants' };
const toolLabels = { pickaxe: 'Pickaxe', axe: 'Axe', hands: 'By hand', rod: 'Fishing rod supplied' };
const skillCap = skillProgress(MAX_SKILL_XP).level;
const difficultyLabels = { locked: 'Locked', challenging: 'Challenging', practiced: 'Practiced', familiar: 'Familiar', mastered: 'Mastered' };

export function skillTabs(active: 'combat' | 'professions'): string {
  const tabs = [
    { id: 'combat', label: 'Combat', art: 'sword' },
    { id: 'professions', label: 'Professions', art: 'crafting' },
  ];
  return `<nav class="skill-tabs" aria-label="Skill categories">${tabs.map(tab => `<button type="button" class="primary-button skill-tab" data-skill-tab="${tab.id}" aria-pressed="${active === tab.id}">${icon(tab.art)}<span>${tab.label}</span></button>`).join('')}</nav>`;
}

export function renderSkills(player: Player): string {
  return `<p class="professions-intro">Gather richer resources, then turn them into supplies and equipment at a workshop. Each profession grows through practice.</p><div class="profession-list">${(Object.keys(SKILLS) as SkillId[]).map(id => {
    const skill = SKILLS[id], totalXp = player.skills[id] ?? 0, progress = skillProgress(totalXp), rank = professionRank(totalXp);
    const next = nextGatheringUnlock(id, totalXp);
    const tiers = (Object.entries(RESOURCE_TYPES) as [NodeKind, typeof RESOURCE_TYPES[NodeKind]][])
      .filter(([kind, resource]) => resource.skill === id && (kind === starterResources[id] || resource.requiredLevel > 1))
      .sort((a, b) => a[1].requiredLevel - b[1].requiredLevel);
    const current = tiers.filter(([, resource]) => resource.requiredLevel <= progress.level).at(-1)!;
    const experience = progress.nextLevelXp ? `${progress.xp.toLocaleString('en-US')} / ${progress.nextLevelXp.toLocaleString('en-US')} XP to level ${progress.level + 1}` : `Level ${skillCap} / ${skillCap} · maximum level`;
    return `<section class="profession" aria-labelledby="skill-${id}-title">${icon(professionIcons[id])}<div class="profession-body"><div class="profession-heading"><h3 id="skill-${id}-title">${skill.label}</h3><span class="profession-level">${rank.label} · Level ${progress.level} / ${skillCap}</span></div><p class="profession-description">${toolLabels[skill.tool]} · ${professionUses[id]}</p><div class="profession-progress-label"><span>${experience}</span></div><progress class="profession-progress" max="100" value="${progress.percent}" aria-label="${skill.label} experience" aria-valuetext="${experience}">${experience}</progress><p class="profession-next">${next ? `<strong>Next: ${PROFESSION_RANKS.find(tier => tier.level === next.level)!.label} at ${next.level}.</strong> Gather ${current[1].label.toLowerCase()} to unlock ${next.resources.map(kind => RESOURCE_TYPES[kind].label.toLowerCase()).join(', ')}.` : progress.level === skillCap ? 'Every resource unlocked. Your craft is mastered.' : `<strong>Every resource unlocked.</strong> Gather artisan resources to keep growing toward level ${skillCap}.`}</p><button type="button" class="primary-button" data-profession-guide="${id}">Read ${skill.label} guide</button><ol class="profession-tiers" aria-label="${skill.label} progression">${tiers.map(([kind, resource]) => {
      const difficulty = professionDifficulty(resource.requiredLevel, totalXp), locked = difficulty === 'locked';
      const tier = PROFESSION_RANKS.find(item => item.level === resource.requiredLevel)!;
      const xp = gatheringXpGain(kind, totalXp);
      return `<li><button type="button" class="profession-tier${tier.id === rank.id ? ' profession-tier--current' : ''}" data-resource-kind="${kind}" ${locked ? 'disabled' : ''} title="${locked ? `Requires ${skill.label} ${resource.requiredLevel}` : `Set a waypoint to ${resource.label}`}" aria-label="${resource.label}, ${tier.label}, ${locked ? `requires ${skill.label} level ${resource.requiredLevel}` : `${difficultyLabels[difficulty]}, ${xp} XP per gather`}"><span class="profession-tier-rank"><strong>${tier.label}</strong><small>Level ${resource.requiredLevel}</small></span><span class="profession-tier-resource"><img class="profession-resource-art" src="${resource.skill === 'fishing' ? `/ui/loot/${resource.item}.png` : `/ui/gathering/${kind}.png`}" alt="" width="40" height="40" loading="lazy" decoding="async"><strong>${resource.label}</strong><span>${resource.yield} ${resource.reward} per gather</span></span><span class="profession-tier-yield"><span class="profession-difficulty" data-difficulty="${difficulty}">${difficultyLabels[difficulty]}</span><small>${locked ? `Unlock at ${resource.requiredLevel}` : `${xp} XP per gather`}</small></span></button></li>`;
    }).join('')}</ol><button type="button" class="primary-button" data-train-skill="${id}">${icon('route')} Find ${current[1].label.toLowerCase()}</button></div></section>`;
  }).join('')}</div><p class="profession-xp-note">Challenging resources give full XP. Practiced and familiar resources give less; mastered resources still yield materials, but no XP.</p><button type="button" class="primary-button" data-open-crafting>${icon('crafting')} Open your recipe book</button>`;
}

export function renderProfessionGuide(player: Player, id: SkillId): string {
  const skill = SKILLS[id], totalXp = player.skills[id] ?? 0, level = skillProgress(totalXp).level;
  const resources = (Object.entries(RESOURCE_TYPES) as [NodeKind, typeof RESOURCE_TYPES[NodeKind]][])
    .filter(([, resource]) => resource.skill === id).sort((a, b) => a[1].requiredLevel - b[1].requiredLevel);
  const recipes = RECIPES.filter(recipe => (!recipe.className || recipe.className === player.appearance.className)
    && resources.some(([, resource]) => resource.item ? recipe.itemCost?.[resource.item] : resource.reward !== 'fish' && recipe.cost[resource.reward]));
  return `<article class="profession-guide"><button type="button" class="primary-button" data-profession-back>Back to professions</button>
    <h3 tabindex="-1" id="profession-guide-title">${skill.label} guide</h3><p class="profession-level">Level ${level} / ${skillCap}${level === skillCap ? ' · Maximum level' : ''}</p>
    <h4>How to train</h4><p>${skill.description} Select an available resource and move within reach to gather. Your ${skill.label} level unlocks resources independently of your character level; tools are used automatically.</p>
    <p>Gather the highest tier you have unlocked to keep earning XP. Challenging work gives full XP, practiced work gives less, and familiar work gives the least. Mastered resources still give materials, but no profession XP. The XP below reflects your current level.</p>
    <h4>Resources and locations</h4><p>Find sets a waypoint to an available resource. Listed regions show where resources grow; individual nodes may be depleted.</p>
    <ul class="profession-guide-resources">${resources.map(([kind, resource]) => {
      const locations = [...new Set(WORLD_GATHERING_NODES.filter(node => node.kind === kind).map(node => getZone(node.zone).name))];
      const available = canGather(kind, totalXp), difficulty = professionDifficulty(resource.requiredLevel, totalXp);
      return `<li><h5>${resource.label} <span>Level ${resource.requiredLevel}</span></h5>
        <p>${resource.yield} ${resource.item ? LOOT_ITEMS[resource.item].label : resource.reward} per gather · ${gatheringDuration(kind, totalXp) / 1000}s · ${difficultyLabels[difficulty]}${available ? ` · ${gatheringXpGain(kind, totalXp)} XP` : ''}</p>
        ${resource.item ? `<p>Restores ${LOOT_ITEMS[resource.item].heal} health out of combat · Sells for ${goldSource(LOOT_ITEMS[resource.item].sellPrice,'resale',player.economyVersion===1)} gold</p>` : ''}
        <p>${locations.join(', ')}</p><button type="button" class="primary-button" data-resource-kind="${kind}" ${available ? '' : 'disabled'}>${available ? `Find ${resource.label.toLowerCase()}` : `Requires ${skill.label} ${resource.requiredLevel}`}</button></li>`;
    }).join('')}</ul>
    ${id === 'fishing' ? '<h4>Using your catch</h4><p>Stand on dry ground beside a shoal to fish. Your rod is supplied. Catches go into your backpack; eat them outside combat to recover health, or sell them to a merchant.</p>' : ''}
    ${recipes.length ? `<h4>Craft with your materials</h4><p>These recipes use your gathered materials and suit your class. Crafting has its own level. Open the recipe book to see outputs, ingredient counts and workshop directions.</p>
    <ul class="profession-guide-recipes">${recipes.map(recipe => `<li><strong>${recipe.label}</strong><span>Crafting ${recipe.requiredCraftingLevel} · Character ${recipe.requiredLevel}</span><span>${[...Object.entries(recipe.cost).map(([material, quantity]) => `${quantity} ${material}`), ...Object.entries(recipe.itemCost ?? {}).map(([item, quantity]) => `${quantity} ${LOOT_ITEMS[item].label}`)].join(', ')}</span></li>`).join('')}</ul>` : ''}
    <button type="button" class="primary-button" data-open-crafting>${icon('crafting')} Open your recipe book</button></article>`;
}
