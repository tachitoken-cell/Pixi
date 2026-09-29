import type { AbilityId, Spell } from './spells.ts';

export type SpellSoundFamily = 'fire' | 'frost' | 'arcane' | 'lightning' | 'holy' | 'nature' | 'poison' | 'bow' | 'weapon' | 'earth' | 'shield' | 'healing';
export type SpellSoundStage = 'cast' | 'release' | 'impact';
type Tone = (type: OscillatorType | 'noise', frequency: number, duration: number, gain?: number, delay?: number, endFrequency?: number) => void;

// Explicit elements keep Frost Nova, comets and enchanted arrows out of generic class sounds.
const ELEMENTS: Partial<Record<AbilityId, SpellSoundFamily>> = {
  combustion: 'fire', shatter: 'frost', 'venom-detonation': 'poison', fireball: 'fire', cinderbolt: 'fire', pyroblast: 'fire', meteor: 'fire', flamewave: 'fire',
  'inferno-beam': 'fire', starfire: 'fire', 'explosive-arrow': 'fire', 'flame-barrier': 'fire',
  frostbolt: 'frost', nova: 'frost', 'ice-lance': 'frost', 'frozen-orb': 'frost', 'deep-freeze': 'frost',
  blizzard: 'frost', 'glacial-spike': 'frost', 'comet-shower': 'frost', 'flash-freeze': 'frost', winterstorm: 'frost',
  'frost-arrow': 'frost', 'frostfall-volley': 'frost', 'ice-barrier': 'frost',
  'chain-lightning': 'lightning', thunderclap: 'lightning',
  thornburst: 'nature', 'binding-arrow': 'nature', barkskin: 'nature',
  'survival-instinct': 'nature', 'starfall-arrow': 'arcane',
  shockwave: 'earth', groundbreaker: 'earth', earthshaker: 'earth', siegebreaker: 'earth',
};

export function spellSoundFamily(spell: Spell): SpellSoundFamily {
  if (spell.effect === 'heal') return 'healing';
  if (spell.effect === 'shield') return 'shield';
  if (spell.status?.kind === 'poison') return 'poison';
  return ELEMENTS[spell.id] ?? ({ Ranger: 'bow', Knight: 'weapon', Mage: 'arcane', Cleric: 'holy' } as const)[spell.className];
}

/** Short layered cues; the combat timeline owns release/impact and channel tick timing. */
export function playSpellSound(spell: Spell, stage: SpellSoundStage, tone: Tone) {
  const family = spellSoundFamily(spell), impact = stage === 'impact', casting = stage === 'cast';
  const pitch = 2 ** ((spell.requiredLevel / 2 % 12) / 12) * (.985 + Math.random() * .03);
  const weight = Math.min(1.5, .75 + spell.damageScale * .17 + spell.castTimeMs / 15000);
  const area = spell.targeting !== 'single';
  const loudness = (casting ? .48 : impact ? 1 : .78) * (spell.channel ? .78 : 1);
  const tail = spell.channel && !casting ? Math.min(.7, spell.channel.tickMs / 1000 * .9) : .88;
  const t: Tone = (type, frequency, duration, gain = .1, delay = 0, endFrequency = frequency) => {
    delay = Math.min(delay, tail - .04);
    tone(type, frequency * pitch, Math.min(duration, tail - delay), gain * loudness, delay, endFrequency * pitch);
  };

  if (casting) {
    const physical = family === 'bow' || family === 'weapon' || family === 'earth';
    const root = { bow: 115, weapon: 95, earth: 70, fire: 145, frost: 620, arcane: 280,
      lightning: 880, holy: 440, nature: 350, poison: 185, shield: 220, healing: 390 }[family];
    t(physical ? 'noise' : 'triangle', physical ? 950 : root, .26, .09, 0, root * 1.6);
    t('sine', root, .42, .09, .04, root * 2);
    if (!physical) t('sine', root * 1.5, .32, .05, .12, root * 2.5);
    if (spell.castTimeMs >= 2500 || spell.channel) t('triangle', root / 2, .52, .06, .08, root);
    return;
  }

  switch (family) {
    case 'fire':
      t('noise', impact ? 1700 : 950, impact ? .42 : .3, .19 * weight);
      t('sawtooth', impact ? 105 : 165, .23, .055, 0, impact ? 38 : 65);
      t('triangle', 75, .34, .16 * weight, .015, 32);
      for (let i = 0; i < 3; i++) t('noise', 2300 + i * 700, .035, .065, .05 + i * .075);
      break;
    case 'frost':
      t('noise', 5600, impact ? .13 : .24, .08);
      for (let i = 0; i < 3; i++) t('sine', 940 * [1, 1.49, 2.11][i], .2 + i * .04, .075 / (1 + i * .5), i * .035, 720 * [1, 1.49, 2.11][i]);
      t('triangle', impact ? 150 : 380, .17, .08, .01, impact ? 65 : 800);
      break;
    case 'arcane':
      t('triangle', impact ? 760 : 280, .24, .12, 0, impact ? 190 : 900);
      for (let i = 0; i < 3; i++) t('sine', 420 * [1, 1.26, 1.78][i], .18, .07, i * .055, 420 * [1.78, 1.26, 1][i]);
      t('noise', 1800, .08, .045);
      break;
    case 'lightning':
      for (let i = 0; i < 4; i++) t('noise', 6200 - i * 950, .025 + i * .008, .17, i * .045);
      t('sawtooth', 1250, .14, .075, 0, 85);
      t('triangle', 95, impact ? .34 : .2, .15, .03, 36);
      break;
    case 'holy':
      t('triangle', impact ? 660 : 330, .28, .105, 0, impact ? 440 : 660);
      for (let i = 0; i < 3; i++) t('sine', 660 * [1, 1.25, 1.5][i], .37, .055, i * .04);
      t('noise', 3100, .07, .05);
      if (spell.id === 'holy-fire' || spell.id === 'sacred-flame') t('noise', 1100, .3, .09);
      // Edicts keep the holy chord, with a sustained chime distinct from Smite.
      if (spell.id === 'edict-of-the-dawn') t('sine', 880, .48, .045, .08, 660);
      else if (spell.id === 'eternal-edict') t('sine', 440, .55, .055, .08, 880);
      break;
    case 'nature':
      t('noise', 950, .27, .12);
      t('triangle', 130, .15, .14, 0, 65);
      for (let i = 0; i < 3; i++) t('sine', 530 + i * 160, .12, .055, i * .075, 790 + i * 200);
      break;
    case 'poison':
      t('noise', 2600, .25, .075);
      for (let i = 0; i < 4; i++) t('sine', 210 + i * 75, .07, .095, i * .06, 70 + i * 18);
      t('triangle', 110, .2, .07, .02, 45);
      break;
    case 'bow':
      t('noise', impact ? 1900 : 4200, impact ? .055 : .1, .11);
      t('triangle', impact ? 150 : 520, .12, .15 * weight, 0, impact ? 48 : 140);
      if (!impact) t('sine', 760, .06, .05, .018, 280);
      if (impact) t('noise', 700, .09, .075);
      break;
    case 'weapon': {
      const shield = spell.id === 'shield-bash' || spell.id === 'shield-toss' || spell.id === 'powerful-throw';
      t('noise', impact ? 1900 : 3300, impact ? .065 : .14, .16);
      t('triangle', shield ? 175 : 130, .15, .16 * weight, 0, 45);
      t('sine', shield ? 430 : 1150, .13, .05, .012, shield ? 240 : 740);
      if (impact) t('sine', shield ? 677 : 1740, .09, .035, .01);
      break;
    }
    case 'earth':
      t('triangle', 90, .42, .2 * weight, 0, 29);
      t('noise', 620, .39, .18);
      t('noise', 2000, .065, .11);
      for (let i = 0; i < 2; i++) t('triangle', 135 - i * 25, .15, .07, .09 + i * .1, 40);
      break;
    case 'shield': {
      const material = ELEMENTS[spell.id];
      const root = spell.className === 'Knight' ? 160 : material === 'nature' ? 220 : spell.className === 'Cleric' ? 440 : 390;
      t('triangle', root, .42, .12, 0, root * 1.5);
      t('sine', root * 2, .48, .06, .035);
      t('sine', root * 3, .37, .035, .08);
      t('noise', material === 'frost' ? 5400 : material === 'fire' ? 1300 : 780, .22, .065);
      if (spell.className === 'Knight') t('noise', 2300, .045, .12);
      break;
    }
    case 'healing': {
      const root = { Knight: 220, Ranger: 350, Mage: 440, Cleric: 520 }[spell.className];
      for (let i = 0; i < 4; i++) t('sine', root * [1, 1.25, 1.5, 2][i], .34, .075, i * (spell.castTimeMs === 1500 ? .035 : .065));
      t('triangle', root / 2, .44, .06);
      break;
    }
  }

  // Geometry adds breadth; channels stay shorter than a tick instead of scheduling future ticks here.
  if (area) t('noise', family === 'frost' ? 4400 : 1200, spell.targeting === 'splash' ? .38 : .3, .05, .06);
  if (spell.targeting === 'chain') for (let i = 1; i < Math.min(3, spell.maxTargets ?? 2); i++) t('triangle', 360 + i * 180, .07, .045, i * .065);
  if (spell.visual === 'meteor' || spell.damageScale >= 2.5) t('sine', spell.effect === 'damage' ? 65 : 220, .48, .1, .015, spell.effect === 'damage' ? 28 : 440);
  if (spell.channel) t('triangle', family === 'fire' ? 115 : 340, .09, .045, .14, family === 'fire' ? 60 : 440);
  if (spell.status?.kind === 'stun') t('square', 160, .07, .035, .025, 70);
  else if (spell.status?.kind === 'slow' && family !== 'frost') t('sine', 690, .14, .04, .04, 220);
}
