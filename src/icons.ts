import type { AbilityId, SpellArtId } from './spells.ts';
import { SPELL_CHOREOGRAPHY_SOURCES } from './spell-visuals.ts';

// These authored slots stay fixed when spell levels or catalog ordering change.
// Every sheet is four columns by eight rows, with the final cell transparent.
export const SPELL_ICON_ATLASES: Record<string, readonly SpellArtId[]> = {
  'ranger': [
    'arrow', 'hamstring-shot', 'power-shot', 'trail-mending',
    'poison-shot', 'concussive-shot', 'multishot', 'barkskin',
    'volley', 'frost-arrow', 'ricochet-shot', 'hunters-reprieve',
    'piercing-shot', 'thornburst', 'serpent-fan', 'rapid-fire',
    'explosive-arrow', 'silken-guard', 'tranquilizing-shot', 'wild-renewal',
    'razor-flurry', 'viper-strike', 'forest-ward', 'hail-of-arrows',
    'binding-arrow', 'eagles-eye', 'frostfall-volley', 'survival-instinct',
    'starfall-arrow', 'relentless-volley', 'heart-of-the-wild',
  ],
  'knight': [
    'strike', 'crippling-strike', 'cleave', 'second-wind',
    'shield-bash', 'iron-guard', 'whirlwind', 'heavy-slash',
    'shockwave', 'shield-toss', 'rallying-cry', 'concussive-blow',
    'steel-bulwark', 'groundbreaker', 'crushing-sweep', 'bladestorm',
    'quick-recovery', 'shattering-throw', 'earthshaker', 'guardian-oath',
    'relentless-strike', 'defiant-stand', 'chainbreaker', 'fortress',
    'thunderclap', 'colossus-strike', 'stalwart-company', 'siegebreaker',
    'unyielding-blows', 'battle-renewal', 'last-bastion',
  ],
  'mage': [
    'fireball', 'arcane-missile', 'frostbolt', 'flame-barrier',
    'nova', 'ice-lance', 'arcane-burst', 'cinderbolt',
    'meteor', 'arcane-restoration', 'frozen-orb', 'spellward',
    'pyroblast', 'arcane-barrage', 'deep-freeze', 'arcane-beam',
    'ice-barrier', 'flamewave', 'blizzard', 'ley-renewal',
    'glacial-spike', 'comet-shower', 'prismatic-guard', 'chain-lightning',
    'flash-freeze', 'inferno-beam', 'blinkward', 'starfire',
    'winterstorm', 'arcane-tempest', 'aegis-of-the-archmage',
  ],
  'cleric': [
    'smite', 'heal', 'holy-nova', 'flash-heal',
    'power-word-shield', 'renew', 'searing-light', 'binding-light',
    'prayer-of-healing', 'holy-fire', 'penance', 'holy-word-serenity',
    'divine-aegis', 'chains-of-light', 'circle-of-healing', 'divine-hymn',
    'radiant-burst', 'guardian-light', 'greater-heal', 'sacred-flame',
    'prayer-of-mending', 'holy-word-chastise', 'sanctuary', 'judgment',
    'salvation', 'holy-lance', 'seraphic-barrier', 'cleansing-radiance',
    'light-of-dawn', 'wrath-of-heaven', 'guardian-of-the-dawn',
  ],
};

// Legacy sheets also serve navigation, talents, crafting and other non-spell UI.
export const ICONS: Record<string, [string, number, number]> = {
  shot:['abilities',0,3], volley:['abilities',1,3], sword:['abilities',2,3], whirlwind:['abilities',3,3],
  bolt:['abilities',4,3], nova:['abilities',5,3], potion:['abilities',6,3], gather:['abilities',7,3],
  chat:['abilities',8,3], travel:['abilities',9,3], respawn:['abilities',10,3], beacon:['abilities',11,3],
  bag:['functions',0,4], book:['functions',1,4], map:['functions',2,4], user:['functions',3,4],
  gear:['functions',4,4], sound:['functions',5,4], muted:['functions',6,4], camera:['functions',7,4],
  logout:['functions',8,4], dice:['functions',9,4], close:['functions',10,4], check:['functions',11,4],
  arrow:['functions',12,4], left:['functions',13,4], up:['functions',14,4], down:['functions',15,4],
  leaf:['world',0,4], compass:['world',1,4], sun:['world',2,4], crystal:['world',3,4],
  wood:['world',4,4], gold:['world',5,4], shield:['world',6,4], boss:['world',7,4],
  ember:['world',8,4], frost:['world',9,4], heartroot:['world',10,4], crown:['world',11,4],
  help:['world',12,4], bow:['world',13,4], spark:['world',14,4], route:['world',15,4],
  'power-shot':['adventure',0,5],
  'multishot':['adventure',1,5],
  'poison-shot':['adventure',2,5],
  'fireball':['adventure',3,5],
  'frostbolt':['adventure',4,5],
  'arcane-burst':['adventure',5,5],
  'meteor':['adventure',6,5],
  'cleave':['adventure',7,5],
  'shockwave':['adventure',8,5],
  'shield-bash':['adventure',9,5],
  'mining':['adventure',10,5],
  'woodcutting':['adventure',11,5],
  'herbalism':['adventure',12,5],
  'inspect':['adventure',13,5],
  'invite':['adventure',14,5],
  'trade':['adventure',15,5],
  'whisper':['adventure',16,5],
  'crafting':['adventure',17,5],
  'skill-tree':['adventure',18,5],
  'interact':['adventure',19,5],
};
for (const [className, ids] of Object.entries(SPELL_ICON_ATLASES)) {
  ids.forEach((id, slot) => { ICONS[`spell-${id}`] = [`spells-${className}`, slot, 8]; });
}
/** Additional spells reuse matching authored artwork without reshuffling atlases. */
export const TALENT_ICON_SOURCES: Partial<Record<SpellArtId, SpellArtId>> = { ...SPELL_CHOREOGRAPHY_SOURCES, charge:'strike', taunt:'strike', 'powerful-throw':'shield-toss', guard:'iron-guard', 'adamant-guardian':'fortress', 'courageous-call':'rallying-cry', 'lord-of-battle':'last-bastion', 'tame-beast':'heart-of-the-wild', 'combined-assault':'razor-flurry', twinshot:'multishot', 'venom-detonation':'serpent-fan', 'arcane-volley':'arcane-barrage', combustion:'pyroblast', shatter:'glacial-spike' };
for (const [id, source] of Object.entries(TALENT_ICON_SOURCES)) ICONS[`spell-${id}`] = ICONS[`spell-${source}`];
['roll', 'blink', 'lightspeed', 'poison-cloud', 'edict-of-the-dawn', 'titans-edict', 'eternal-edict', 'edict-of-light', 'bouncing-edicts', 'edict-of-protection', 'blanket-edicts', 'edict-of-harm', 'renewable-edict'].forEach((id, slot) => { ICONS[`spell-${id}`] = ['spells-redesign', slot, 4]; });
export const SEPTEMBER_28_ICONS = ['venom-detonation','charge','taunt','revivify','precise-shots','primal-focus','natural-gift','sunbreaker','wide-swing','fine-cuts','guard','hold-the-line','courageous-call','into-the-fray','heated-haste','magic-focus','shatter','sharp-mind','healing-light','righteous-force'] as const;
SEPTEMBER_28_ICONS.forEach((id, slot) => { ICONS[`spell-${id}`] = ['spells-september28', slot, 5]; });
const clericIcons: Record<string,string> = { cleric:'class', 'cleric-smite':'smite', 'cleric-heal':'heal', 'cleric-renew':'renew', 'cleric-shield':'shield', 'cleric-burst':'holyburst', 'cleric-holyburst':'holyburst', 'cleric-beam':'beam', 'cleric-blessing':'blessing', 'cleric-guardian':'guardian' };
export const MENU_ICONS: Record<string, string> = {
  arena:'01_arena', store:'02_store', settings:'03_settings', wallet:'04_wallet', nfts:'05_nfts',
  friends:'06_friends_chat', achievements:'07_achievements', talents:'08_skilltree', specialist:'09_sp_icon',
  journal:'10_journal', character:'11_character_gear', spells:'12_combat_skills', raid:'13_raid', pets:'14_pet',
  crafting:'15_workshop', bags:'16_bags', account:'17_character_face', referral:'18_referral',
};
/** Exact artwork from Benji's September 28 package; unmatched legacy controls retain their art. */
export const BENJI_MENU_ICONS: Record<string,string> = {
 arena:'menu-arena', store:'menu/store', settings:'menu/settings', nfts:'menu/nfts',
 friends:'menu/friends', achievements:'menu/achievements', talents:'menu/talents',
 journal:'menu/journal', character:'menu/character', spells:'menu/spellbook', raid:'menu/raid', pets:'menu/pets',
 crafting:'menu/workshop', bags:'menu/bag', account:'menu/profile', referral:'menu/referrals', 'instant-combat':'menu/instant-combat',
};
export const BENJI_RESOURCE_ICONS:Record<string,string>={wood:'item-wood',crystal:'item-lantern-fragment',potion:'item-healing-potion','resource-herb':'item-wild-herb','resource-relic':'item-rootvault-relic'};
export function icon(name: string, cls = '') {
  if(Object.hasOwn(BENJI_RESOURCE_ICONS,name))return `<img class="icon item-art ${cls}" src="/ui/benji-2026-09-28/icons/${BENJI_RESOURCE_ICONS[name]}.png" alt="" aria-hidden="true" draggable="false"/>`;
  if(name.startsWith('menu-') && Object.hasOwn(BENJI_MENU_ICONS,name.slice(5)))return `<img class="icon item-art navigation-icon ${cls}" src="/ui/benji-2026-09-28/icons/${BENJI_MENU_ICONS[name.slice(5)]}.png" width="64" height="64" alt="" aria-hidden="true" draggable="false"/>`;
  if(name.startsWith('menu-') && Object.hasOwn(MENU_ICONS,name.slice(5)))return `<img class="icon item-art navigation-icon ${cls}" src="/ui/navigation/${MENU_ICONS[name.slice(5)]}.png" width="64" height="64" alt="" aria-hidden="true" draggable="false"/>`;
  if(name==='fish')return `<img class="icon item-art ${cls}" src="/ui/loot/brook-trout.png" alt="" aria-hidden="true" draggable="false"/>`;
  if(Object.hasOwn(clericIcons,name))return `<img class="icon item-art ${cls}" src="/ui/cleric/${clericIcons[name]}.png" alt="" aria-hidden="true" draggable="false"/>`;
  const [atlas, slot, rows] = ICONS[name] || ICONS.help;
  return `<span class="icon item-art atlas-${atlas} ${cls}" style="--icon-x:${slot % 4 * 100 / 3}%;--icon-y:${Math.floor(slot / 4) * 100 / (rows - 1)}%" aria-hidden="true"></span>`;
}
