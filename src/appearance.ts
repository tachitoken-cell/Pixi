import type { Appearance } from './shared.ts';

export const RACES = [
  { id: 'human', label: 'Human', description: 'Familiar features and a balanced build.' },
  { id: 'elf', label: 'Elf', description: 'Pointed ears and a slender build.' },
  { id: 'dwarf', label: 'Dwarf', description: 'A compact, sturdy adventurer.' },
  { id: 'orc', label: 'Orc', description: 'Broad features and small tusks.' },
  { id: 'goblin', label: 'Goblin', description: 'A small adventurer with prominent ears.' },
  { id: 'foxfolk', label: 'Foxfolk', description: 'Fox ears, a muzzle and a bushy tail.' },
  { id: 'catfolk', label: 'Catfolk', description: 'Pointed feline ears, whiskers and a curling tail.' },
  { id: 'dogfolk', label: 'Dogfolk', description: 'Floppy ears, a broad muzzle and a wagging tail.' },
  { id: 'lizardfolk', label: 'Lizardfolk', description: 'A scaled crest, small horns and a long tail.' },
] as const;
export const GENDERS = [
  { id: 'male', label: 'Male', description: 'Masculine character presentation.' },
  { id: 'female', label: 'Female', description: 'Feminine character presentation.' },
] as const;
export const FACES = [
  { id: 'bright', label: 'Bright', description: 'Wide, alert eyes.' },
  { id: 'calm', label: 'Calm', description: 'A relaxed, thoughtful expression.' },
  { id: 'stern', label: 'Stern', description: 'Strong brows and a determined gaze.' },
  { id: 'smile', label: 'Smile', description: 'A cheerful smile.' },
  { id: 'freckles', label: 'Freckles', description: 'Freckles across the cheeks.' },
  { id: 'scarred', label: 'Scarred', description: 'A mark from a past adventure.' },
  { id: 'painted', label: 'Painted', description: 'Bold markings across the face.' },
  { id: 'weathered', label: 'Weathered', description: 'The lined face of a seasoned traveler.' },
] as const;
export const HAIRSTYLES = [
  { id: 'swept', label: 'Swept', description: 'A side-swept fringe.' },
  { id: 'long', label: 'Long', description: 'Long, flowing hair.' },
  { id: 'mohawk', label: 'Mohawk', description: 'A raised central crest.' },
  { id: 'none', label: 'Bald', description: 'No hair.' },
  { id: 'bob', label: 'Bob', description: 'A short, rounded cut.' },
  { id: 'braids', label: 'Braids', description: 'A pair of woven braids.' },
  { id: 'ponytail', label: 'Ponytail', description: 'Hair tied behind the head.' },
  { id: 'spiky', label: 'Spiky', description: 'An untidy crown of spikes.' },
  { id: 'curly', label: 'Curly', description: 'A full head of curls.' },
  { id: 'topknot', label: 'Topknot', description: 'A high, tied knot.' },
  { id: 'sidecut', label: 'Sidecut', description: 'A swept top with a close-cut side.' },
  { id: 'pixie', label: 'Pixie', description: 'A short, textured crop.' },
  { id: 'twin-buns', label: 'Twin buns', description: 'Two round buns with loose locks.' },
  { id: 'dreadlocks', label: 'Locs', description: 'Long, chunky twisted locks.' },
  { id: 'fishtail', label: 'Fishtail braid', description: 'A thick woven braid down the back.' },
  { id: 'undercut', label: 'Undercut', description: 'A high swept crest with shaved sides.' },
] as const;

export type Race = typeof RACES[number]['id'];
export type Gender = typeof GENDERS[number]['id'];
export type Face = typeof FACES[number]['id'];
export type HairStyle = typeof HAIRSTYLES[number]['id'];
export const DEFAULT_APPEARANCE: Readonly<Required<Appearance>> = {
  skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger',
  race: 'human', gender: 'male', face: 'bright', hairHighlight: '#49362b', armorColors: {},
};
const classes = new Set(['Ranger', 'Knight', 'Mage', 'Cleric']);
export const ARMOR_COLOR_SLOTS = ['head', 'armor', 'legs', 'shoes', 'back'] as const;
export type ArmorColorSlot = typeof ARMOR_COLOR_SLOTS[number];
const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const colors = ['skin', 'hair', 'outfit', 'accent'] as const;
const hasOption = (catalog: readonly { id: string }[], value: unknown) => typeof value === 'string' && catalog.some(option => option.id === value);

/** Missing new fields identify legacy appearances; supplied invalid values never become defaults. */
export function appearanceValid(value: unknown): value is Appearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const look = value as Record<string, unknown>;
  return colors.every(key => Object.hasOwn(look, key) && validColor(look[key]))
    && Object.hasOwn(look, 'hairStyle') && hasOption(HAIRSTYLES, look.hairStyle)
    && Object.hasOwn(look, 'className') && typeof look.className === 'string' && classes.has(look.className)
    && (!Object.hasOwn(look, 'race') || hasOption(RACES, look.race))
    && (!Object.hasOwn(look, 'gender') || hasOption(GENDERS, look.gender))
    && (!Object.hasOwn(look, 'face') || hasOption(FACES, look.face))
    && (!Object.hasOwn(look, 'hairHighlight') || validColor(look.hairHighlight))
    && (!Object.hasOwn(look, 'armorColors') || !!look.armorColors && typeof look.armorColors === 'object' && !Array.isArray(look.armorColors)
      && Object.entries(look.armorColors).every(([key, value]) => ARMOR_COLOR_SLOTS.includes(key as ArmorColorSlot) && validColor(value)));
}

/** Explicit copying prevents unrelated client fields from becoming saved character state. */
export function normalizeAppearance(appearance: Appearance): Required<Appearance> {
  if (!appearanceValid(appearance)) throw new Error('Invalid character appearance.');
  return {
    hairHighlight: Object.hasOwn(appearance, 'hairHighlight') ? appearance.hairHighlight! : appearance.hair,
    armorColors: Object.hasOwn(appearance, 'armorColors') ? { ...appearance.armorColors } : {},
    skin: appearance.skin, hair: appearance.hair, hairStyle: appearance.hairStyle,
    outfit: appearance.outfit, accent: appearance.accent, className: appearance.className,
    race: Object.hasOwn(appearance, 'race') ? appearance.race! : 'human',
    gender: Object.hasOwn(appearance, 'gender') ? appearance.gender! : 'male',
    face: Object.hasOwn(appearance, 'face') ? appearance.face! : 'bright',
  };
}
export const copyAppearance = normalizeAppearance;

/** Load-only migrations for retired choices; new character requests stay strict. */
export function migrateLegacyAppearance(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const look = value as Record<string, unknown>;
    const retiredGender = Object.hasOwn(look, 'gender') && look.gender === 'nonbinary';
    const retiredRace = Object.hasOwn(look, 'race') && look.race === 'serpent';
    if (retiredGender || retiredRace) {
      const migrated = { ...look, ...(retiredGender ? { gender: 'male' } : {}), ...(retiredRace ? { race: 'lizardfolk' } : {}) };
      if (appearanceValid(migrated)) return migrated;
    }
  }
  return value;
}
