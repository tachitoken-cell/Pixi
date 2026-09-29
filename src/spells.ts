import type { CharacterClass } from './shared.ts';

// IDs are persisted in characters, hotbars and combat events. Never reuse an old ID.
export type AbilityId = "custom-516e6f75-adeb-4c3e-b804-5f1b516d2dc2" | "custom-8eb597a3-6f91-4cd7-bdcb-501af748545e" | "custom-2cbf0a01-1c73-4489-b369-b6776f7f46ed" | "custom-862f02e6-12d3-4e22-8a91-62c5ee899614" | "edict-of-the-dawn" | "titans-edict" | "eternal-edict" | "poison-cloud" | "charge" | "taunt" | "powerful-throw" | "guard" | "adamant-guardian" | "courageous-call" | "lord-of-battle" | "tame-beast" | "combined-assault" | "twinshot" | "venom-detonation" | "arcane-volley" | "combustion" | "shatter" | "arrow" | "hamstring-shot" | "power-shot" | "trail-mending" | "poison-shot" | "concussive-shot" | "multishot" | "barkskin" | "volley" | "frost-arrow" | "ricochet-shot" | "piercing-shot" | "thornburst" | "serpent-fan" | "rapid-fire" | "explosive-arrow" | "tranquilizing-shot" | "wild-renewal" | "razor-flurry" | "viper-strike" | "hail-of-arrows" | "binding-arrow" | "eagles-eye" | "frostfall-volley" | "survival-instinct" | "starfall-arrow" | "relentless-volley"
  | "strike" | "crippling-strike" | "cleave" | "second-wind" | "shield-bash" | "iron-guard" | "whirlwind" | "heavy-slash" | "shockwave" | "shield-toss" | "rallying-cry" | "concussive-blow" | "groundbreaker" | "crushing-sweep" | "bladestorm" | "quick-recovery" | "shattering-throw" | "earthshaker" | "guardian-oath" | "relentless-strike" | "chainbreaker" | "thunderclap" | "colossus-strike" | "stalwart-company" | "siegebreaker" | "unyielding-blows" | "battle-renewal" | "last-bastion"
  | "fireball" | "arcane-missile" | "frostbolt" | "flame-barrier" | "nova" | "ice-lance" | "arcane-burst" | "cinderbolt" | "meteor" | "arcane-restoration" | "frozen-orb" | "spellward" | "pyroblast" | "arcane-barrage" | "deep-freeze" | "arcane-beam" | "ice-barrier" | "flamewave" | "blizzard" | "ley-renewal" | "glacial-spike" | "comet-shower" | "chain-lightning" | "flash-freeze" | "inferno-beam" | "starfire" | "winterstorm" | "arcane-tempest" | "aegis-of-the-archmage"
  | "smite" | "heal" | "holy-nova" | "flash-heal" | "power-word-shield" | "renew" | "searing-light" | "binding-light" | "prayer-of-healing" | "holy-fire" | "penance" | "holy-word-serenity" | "divine-aegis" | "chains-of-light" | "circle-of-healing" | "divine-hymn" | "radiant-burst" | "guardian-light" | "greater-heal" | "sacred-flame" | "prayer-of-mending" | "holy-word-chastise" | "sanctuary" | "judgment" | "salvation" | "holy-lance" | "seraphic-barrier" | "cleansing-radiance" | "light-of-dawn" | "wrath-of-heaven" | "guardian-of-the-dawn";
export const RETIRED_SPELLS = {"hunters-reprieve":{"className":"Ranger","requiredLevel":22},"silken-guard":{"className":"Ranger","requiredLevel":34},"forest-ward":{"className":"Ranger","requiredLevel":44},"heart-of-the-wild":{"className":"Ranger","requiredLevel":60},"steel-bulwark":{"className":"Knight","requiredLevel":24},"defiant-stand":{"className":"Knight","requiredLevel":42},"fortress":{"className":"Knight","requiredLevel":46},"prismatic-guard":{"className":"Mage","requiredLevel":44},"blinkward":{"className":"Mage","requiredLevel":52}} as const;
export type RetiredAbilityId = keyof typeof RETIRED_SPELLS;
/** Existing atlas/model names remain stable even after a spell retires. */
export type SpellArtId = AbilityId | RetiredAbilityId;
export type HotbarSlot = AbilityId | 'mend' | 'interact' | null;
export type SpellSchool = 'physical' | 'fire' | 'frost' | 'arcane' | 'holy' | 'poison';
export const SPELL_BONUS_LABELS = { fire: 'Fire damage', frost: 'Frost damage', arcane: 'Arcane damage', holy: 'Holy damage', physical: 'physical ability damage', poison: 'poison damage', direct: 'direct ability damage', instant: 'instant ability damage', casting: 'cast and channel damage', periodic: 'damage over time', healing: 'healing', shielding: 'shield absorption', control: 'slow duration', chilled: 'direct damage against slowed enemies' } as const;
export type SpellBonuses = Partial<Record<keyof typeof SPELL_BONUS_LABELS, number>>;
export interface SpellStats { primaryDamage: number; specialDamage: number; skillDamage?: number; spellBonuses?: SpellBonuses; damageMultiplier?: number; magicDamageMultiplier?: number; castSpeedMultiplier?: number }
/** Persisted talent IDs shared by the catalog and authoritative combat. */
export const TALENT_EFFECT_IDS = {
  preciseShots:'custom-542f3ce8-e745-484a-9bc3-cb624415b6ff', primalFocus:'custom-f52507bb-80c7-4067-9fa4-0e4beda2f788', naturalGift:'custom-6805d983-80b3-479e-b8c4-70793d850f4e',
  heatedHaste:'custom-beae5a3c-4e83-48c4-82f1-bfa05f17d045', magicFocus:'custom-e1f80f80-e98d-4bdc-8fda-d4dee64dfd2a', sharpMind:'custom-e591c589-f537-4690-9e68-82a8534027e1',
  sunbreaker:'knight-3', ironBulwark:'knight-sentinel-4', siegebreaker:'knight-warlord-5', healingLight:'cleric-radiance-2', blessedArmor:'cleric-devotion-2', righteousForce:'cleric-judgment-5',
  arrowstorm: 'ranger-marksmanship-4', beastmaster: 'ranger-beastmaster', everlastingBond: 'ranger-everlasting-bond',
  twinshot: 'ranger-3', twinshotMomentum: 'ranger-marksmanship-3', venom: 'ranger-survival-3', lingeringVenom: 'ranger-survival-6',
  arcaneEcho: 'mage-6', arcaneEchoChance: 'mage-warding-3', burning: 'mage-3', periodicBurning: 'mage-spellfire-3',
  chilled: 'mage-frostweaving-3', deepChill: 'mage-frostweaving-6',
  wideSwing: 'custom-ece9586f-85c4-482f-bd43-f1869b5d4a02', fineCuts: 'custom-3447ea15-8441-4f2b-b8e3-a322be986bd3',
  guard: 'custom-02723b73-c611-4fe1-895d-661544a98cdb', holdTheLine: 'custom-69e5775e-3a57-40b0-b032-0f2aa4a125e8',
  courageousCall: 'custom-4549ff51-1e44-4747-b1f8-575f817b2f08', intoTheFray: 'custom-cdf4bd32-3754-4628-af93-8ba132dc76a0',
  powerfulThrow: 'knight-vanguard-6', adamantGuardian: 'knight-sentinel-6', lordOfBattle: 'knight-warlord-9',
  edictLight:'custom-ead2acc1-1d80-43e6-bdac-678ed0451f9c', bouncingEdicts:'custom-01b6f08c-bfb2-44b9-a294-25e287be9b7d', edictDawn:'custom-bfeda156-9c0b-4fd5-80ab-2ddf772cff28',
  edictProtection:'custom-35d1bf12-1974-4e4c-9e9e-2118d3b6595d', blanketEdicts:'custom-08e24f9e-783a-461f-873d-4af7a3ecaed5', titansEdict:'custom-b6b3d821-bdfa-494e-9ad5-c4c00f4f88d9',
  edictHarm:'custom-221f95e2-73d4-4747-b9e0-5c08fa50fc86', renewableEdict:'custom-d07de059-ed1c-4417-b30f-17b9e3a3cb8f', eternalEdict:'custom-c21f4d69-ac3f-4107-8a09-c4c2c96614d9',
} as const;
/** Workshop-created IDs remain stable in saved spellbooks and hotbars. */
export const SPELL_EFFECT_IDS = { roll:'custom-8eb597a3-6f91-4cd7-bdcb-501af748545e', blink:'custom-2cbf0a01-1c73-4489-b369-b6776f7f46ed', lightspeed:'custom-862f02e6-12d3-4e22-8a91-62c5ee899614', revivify:'custom-516e6f75-adeb-4c3e-b804-5f1b516d2dc2' } as const;
/** Tunable defaults where the workshop specified behavior without power or radius. */
export const CLERIC_EDICTS = { durationMs:12000, radius:8, lightScale:.5, protectionScale:.5, harmScale:.5,
  dawnTickMs:2000, dawnTickScale:.5, dawnPulseScale:.5, titanReflectScale:.25 } as const;
export interface CombatTalents {
  heat: number; heatUntil: number; twinshotReadyUntil: number; arrowstormStacks?: number; arrowstormUntil?: number; bondReady?: boolean;
  powerfulThrowReady?: boolean; thrownShield?: { x: number; z: number; expiresAt: number };
  guardUntil?: number; guardianUntil?: number; courageousCallUntil?: number; lordOfBattleUntil?: number;
  blessedArmorUntil?: number; blessedArmorDefense?: number;
  movementSpeedUntil?: number; movementSpeedMultiplier?: number;
  edicts?: Array<{ kind:'light' | 'protection' | 'harm' | 'dawn' | 'titan'; sourceId:string; until:number; power:number; repeatUntil:number }>;
}
export interface Spell {
  /** Talent abilities are granted by this allocation, never purchased from trainers. */
  requiredTalent?: string;
  school: SpellSchool;
  /** Conditional utility, evaluated on the authoritative target when the hit lands. */
  shatterScale?: number; executeScale?: number;
  /** Subsequent Ricochet hits on the same target retain this fraction of the previous hit. */
  repeatDamageMultiplier?: number; reviveHealthFraction?: number;
  id: AbilityId; className: CharacterClass; requiredLevel: number; label: string; description: string; icon: string; color: string;
  range: number; cooldownMs: number; castTimeMs: number; damageScale: number; damageStat: 'primaryDamage' | 'specialDamage';
  effect: 'damage' | 'heal' | 'shield' | 'buff' | 'revive'; targetRelation: 'hostile' | 'friendly' | 'self';
  targeting: 'single' | 'radial' | 'chain' | 'splash'; visual: 'projectile' | 'radial' | 'meteor';
  radius?: number; maxTargets?: number; shieldDurationMs?: number;
  /** Authored Knight movement, threat and talent effects. */
  chargeSpeed?: number; tauntDurationMs?: number; castMoveMultiplier?: number; pickupCastTimeMs?: number;
  reflectScale?: number; absorbedDamageScale?: number; damageBonusPercent?: number; buffDurationMs?: number;
  markDurationMs?: number; markHealDurationMs?: number; markHealTicks?: number;
  movementDistance?: number; movementDurationMs?: number; movementSpeedMultiplier?: number; clearMovementImpairments?: boolean;
  /** Power is per tick; the first tick occurs after tickMs, never at channel start. */
  channel?: { durationMs: number; tickMs: number };
  status?: { kind: 'slow' | 'stun' | 'poison' | 'burn'; durationMs: number; multiplier?: number; ticks?: number; tickScale?: number };
}
/** Shared global cooldown starts when an action is accepted, including instant spells. */
export const GLOBAL_ATTACK_MS = 1500;
type SpellOptions = Partial<Omit<Spell, 'id' | 'className' | 'requiredLevel' | 'label' | 'description' | 'castTimeMs' | 'cooldownMs' | 'damageScale'>>;
const family = (className: CharacterClass, color: string, range: number, visual: Spell['visual']) =>
  (id: AbilityId, requiredLevel: number, label: string, description: string, castTimeMs: number, cooldownMs: number, damageScale: number, options: SpellOptions = {}): Spell =>
    ({ id, className, requiredLevel, label, description, castTimeMs, cooldownMs, damageScale, color, range, visual,
      school: className === 'Mage' ? 'arcane' : className === 'Cleric' ? 'holy' : 'physical', damageStat: 'primaryDamage', effect: 'damage', targetRelation: 'hostile', targeting: 'single', icon: `spell-${id}`, ...options });
const ranger = family('Ranger', '#e8cc8c', 13.5, 'projectile');
const knight = family('Knight', '#ffe4ad', 4.5, 'radial');
const mage = family('Mage', '#d2a0ff', 15, 'projectile');
const cleric = family('Cleric', '#ffedab', 15, 'projectile');

// Active trainer lessons and talent abilities; retired IDs remain reserved for saved-data migration.
export const SPELLS: Record<AbilityId, Spell> = {
  // Utility behavior is explicit in the workshop prose; its generic damage defaults are not attacks.
  [SPELL_EFFECT_IDS.roll]: ranger(SPELL_EFFECT_IDS.roll, 9, "Roll", "Roll forwards a short distance", 0, 14000, 0, { icon:'spell-roll',color:'#e4c47e',effect:'buff',targetRelation:'self',range:12,movementDistance:12,movementDurationMs:500 }),
  [SPELL_EFFECT_IDS.blink]: mage(SPELL_EFFECT_IDS.blink, 11, "Blink", "Blink forwards a short distance, removing slows and roots", 0, 20000, 0, { icon:'spell-blink',color:'#e4c47e',effect:'buff',targetRelation:'self',range:15,movementDistance:15,clearMovementImpairments:true }),
  [SPELL_EFFECT_IDS.lightspeed]: cleric(SPELL_EFFECT_IDS.lightspeed, 9, "Lighspeed", "Free yourself of movement impairing effects and increase your movement speed for 5s", 0, 20000, 0, { icon:'spell-lightspeed',color:'#e4c47e',effect:'buff',targetRelation:'self',range:15,buffDurationMs:5000,movementSpeedMultiplier:1.5,clearMovementImpairments:true }),
  "edict-of-the-dawn": cleric("edict-of-the-dawn", 1, "Edict of the Dawn", "Place an extra powerful Edict on an ally, lasting 12 seconds and healing over time. When the affected target is hit they send out a healing pulse", 0, 30000, 0, { effect:'buff',targetRelation:'friendly',range:18,visual:'radial',buffDurationMs:12000,requiredTalent:TALENT_EFFECT_IDS.edictDawn }),
  "titans-edict": cleric("titans-edict", 1, "Titan's Edict", "Mark your ally with a Titan's Edict, granting them a large absorb shield that reflects damage. can be affected by other Edict talents.", 0, 45000, 4, { effect:'shield',targetRelation:'friendly',range:18,visual:'radial',shieldDurationMs:12000,buffDurationMs:12000,reflectScale:CLERIC_EDICTS.titanReflectScale,requiredTalent:TALENT_EFFECT_IDS.titansEdict }),
  "eternal-edict": cleric("eternal-edict", 1, "Eternal Edict", "All your current Edicts lasts for 8 seconds and can be repeatedly activated", 0, 60000, 0, { effect:'buff',targetRelation:'self',range:0,visual:'radial',buffDurationMs:8000,requiredTalent:TALENT_EFFECT_IDS.eternalEdict }),
  "tame-beast": ranger("tame-beast", 1, "Tame Beast", "Tame an ordinary creature at or below your level as your permanent combat companion. World bosses and dungeon bosses cannot be tamed. Any healing you receive also heals your companion.", 3000, 10000, 0, { range:8,requiredTalent:'ranger-beastmaster' }),
  "combined-assault": ranger("combined-assault", 13, "Combined Assault", "You and your companion strike the same target together, each dealing 150% of basic-attack damage. Your living companion must already be in melee range of the target while you shoot from bow range. 16-second cooldown.", 0, 16000, 1.5, { requiredTalent:'ranger-pathfinder-6' }),
  // Talent capstones: row five requires twelve invested branch points.
  "twinshot": ranger("twinshot", 37, "Double Tap", "Draw a heavy shot with a 20% chance to fire twice. A bonus shot has a 20% chance to reset this cooldown and make your next Double Tap instant for ten seconds.", 1500, 10000, 1.4, { range:18,requiredTalent:'ranger-marksmanship-6' }),
  "venom-detonation": ranger("venom-detonation", 37, "Venom Detonation", "Consume your poisons on enemies within twelve meters, immediately dealing their remaining damage, increased by 5% for each different damage-over-time effect of yours on that enemy.", 0, 20000, 1, { school:'poison',color:'#91dc55',range:12,targeting:'radial',visual:'radial',requiredTalent:'ranger-survival-9' }),
  "arcane-volley": mage("arcane-volley", 37, "Arcane Volley", "Fire seven Arcane Missiles divided among up to seven enemies. One missile guarantees an Arcane Echo; every other hit and echo uses your normal repeat chance. This volley and its echoes deal 40% damage against players.", 0, 20000, .2, { range:18,targeting:'chain',maxTargets:7,requiredTalent:'mage-warding-6' }),
  "combustion": mage("combustion", 37, "Combustion", "Prepare a massive fire strike that leaves a powerful six-second burn. Burning heat speeds up the cast and its damage-over-time ticks.", 3000, 20000, 2.8, { school:'fire',color:'#ff8d42',range:18,status:{kind:'burn',durationMs:6000,ticks:6,tickScale:.4},requiredTalent:'mage-spellfire-6' }),
  "shatter": mage("shatter", 37, "Shatter", "Consume Chilled effects within eighteen meters, immediately striking those enemies with frost and making each explode onto enemies within three meters.", 0, 20000, 1.2, { school:'frost',color:'#83e4ff',range:18,targeting:'radial',visual:'radial',requiredTalent:'mage-frostweaving-9' }),
  "powerful-throw": knight("powerful-throw", 13, "Powerful Throw", "Hold for two seconds while moving at 30% speed, then throw your shield for 200% damage to up to five enemies. Walk over your shield to reduce the next charge to one second.", 2000, 15000, 2, { icon:'spell-shield-toss',range:18,targeting:'chain',maxTargets:5,visual:'projectile',castMoveMultiplier:.3,pickupCastTimeMs:1000,requiredTalent:TALENT_EFFECT_IDS.powerfulThrow }),
  "guard": knight("guard", 1, "Guard", "Absorb 200% of your special power for eight seconds. For the full eight seconds, reflect 25% of incoming damage and generate extra threat, even after the shield is spent.", 0, 10000, 2, { icon:'spell-iron-guard',effect:'shield',targetRelation:'self',range:0,damageStat:'specialDamage',shieldDurationMs:8000,buffDurationMs:8000,reflectScale:.25,requiredTalent:TALENT_EFFECT_IDS.guard }),
  "adamant-guardian": knight("adamant-guardian", 13, "Adamant Guardian", "Reduce damage taken by 40% for eight seconds, taunt nearby enemies, and instantly counterattack when hit, at most once per second.", 0, 45000, 0, { icon:'spell-fortress',effect:'buff',targetRelation:'self',range:0,buffDurationMs:8000,tauntDurationMs:3000,requiredTalent:TALENT_EFFECT_IDS.adamantGuardian }),
  "courageous-call": knight("courageous-call", 1, "Courageous Call", "Inspire yourself and party allies within nine meters, increasing damage dealt by 20% for seven seconds. Into the Fray also grants 7% or 15% critical strike chance.", 0, 12000, 0, { icon:'spell-rallying-cry',effect:'buff',targetRelation:'friendly',range:9,targeting:'radial',buffDurationMs:7000,damageBonusPercent:20,requiredTalent:TALENT_EFFECT_IDS.courageousCall }),
  "lord-of-battle": knight("lord-of-battle", 13, "Lord of Battle", "Mark enemies and party allies within nine meters for eight seconds. The next hit on each marked enemy adds 100% special-power damage; hits on marked allies restore 100% special-power health over six seconds in three pulses.", 0, 30000, 1, { icon:'spell-last-bastion',effect:'buff',range:9,targeting:'radial',damageStat:'specialDamage',markDurationMs:8000,markHealDurationMs:6000,markHealTicks:3,requiredTalent:TALENT_EFFECT_IDS.lordOfBattle }),
  // Ranger
  "poison-cloud": ranger("poison-cloud", 33, "Poison Cloud", "Shoot a poison arrow that bursts within five meters, dealing 50% damage and poisoning enemies for four ticks of 40% damage over four seconds.", 0, 9000, .5, { icon:'spell-poison-cloud',color:'#e4c47e',school:'poison',range:15,targeting:'splash',radius:5,status:{kind:'poison',durationMs:4000,ticks:4,tickScale:.4} }),
  "arrow": ranger("arrow", 1, "Quick Shot", "An instant arrow for steady single-target pressure.", 0, 550, 1),
  "hamstring-shot": ranger("hamstring-shot", 2, "Hamstring Shot", "An instant low shot that slows one enemy by 35% for four seconds.", 0, 8000, 0.75, {  status:{kind:'slow',durationMs:4000,multiplier:.65} }),
  "power-shot": ranger("power-shot", 4, "Power Shot", "A repeatable two-second draw trades mobility for powerful long-range damage.", 2000, 0, 1.7, { range:18,color:'#fff3ae' }),
  "trail-mending": ranger("trail-mending", 6, "Trail Mending", "Stop to bind your wounds and restore your own health.", 2000, 20000, 2, {"effect":"heal","targetRelation":"self","visual":"radial","range":0}),
  "poison-shot": ranger("poison-shot", 8, "Venom Arrow", "An arrow that poisons its target for three further ticks.", 0, 2000, 0.65, {"color":"#91dc55","school":"poison","status":{"kind":"poison","durationMs":3000,"ticks":3,"tickScale":0.35}}),
  "concussive-shot": ranger("concussive-shot", 10, "Concussive Shot", "A short-range impact arrow stuns one enemy for one second.", 0, 16000, 0.5, { range:9,status:{kind:'stun',durationMs:1000} }),
  "multishot": ranger("multishot", 12, "Multishot", "Loose arrows at up to three nearby enemies.", 0, 6000, 0.8, { color:'#8be4b6',range:15,damageStat:'specialDamage',targeting:'chain',maxTargets:3 }),
  "barkskin": ranger("barkskin", 14, "Barkskin", "Wrap yourself in bark that absorbs incoming damage for ten seconds.", 0, 24000, 1.8, { effect:'shield',targetRelation:'self',visual:'radial',range:0,shieldDurationMs:10000 }),
  "volley": ranger("volley", 16, "Volley", "Rain arrows on every enemy within 7.5 meters.", 0, 3500, 1, { color:'#e7b35b',range:7.5,damageStat:'specialDamage',targeting:'radial' }),
  "frost-arrow": ranger("frost-arrow", 18, "Frost Arrow", "Aim an icy arrow that heavily slows one distant enemy for five seconds.", 1500, 9000, 1.25, { range:18,status:{kind:'slow',durationMs:5000,multiplier:.35} }),
  "ricochet-shot": ranger("ricochet-shot", 20, "Ricochet Shot", "A quick bouncing shot catches five foes, trading impact for coverage. Can hit the same target several times for reduced damage", 0, 10000, 0.6, {"damageStat":"specialDamage","targeting":"chain","maxTargets":5,"repeatDamageMultiplier":0.85}),
  "piercing-shot": ranger("piercing-shot", 24, "Piercing Shot", "Hold a long draw to strike a single enemy from 24 meters.", 2500, 12000, 2.4, { range:24 }),
  "thornburst": ranger("thornburst", 26, "Thornburst", "Burst thorns around yourself to slow nearby attackers for three seconds.", 0, 18000, 0.55, { visual:'radial',range:6,damageStat:'specialDamage',targeting:'radial',status:{kind:'slow',durationMs:3000,multiplier:.45} }),
  "serpent-fan": ranger("serpent-fan", 28, "Serpent Fan", "Poison up to three enemies; each suffers four additional venom ticks.", 1000, 16000, 0.45, {"school":"poison","damageStat":"specialDamage","targeting":"chain","range":12,"maxTargets":3,"status":{"kind":"poison","durationMs":4000,"ticks":4,"tickScale":0.18}}),
  "rapid-fire": ranger("rapid-fire", 30, "Rapid Fire", "Remain still and fire six arrows over three seconds at one enemy.", 0, 18000, 0.5, { range:18,channel:{durationMs:3000,tickMs:500} }),
  "explosive-arrow": ranger("explosive-arrow", 32, "Explosive Arrow", "Launch an explosive arrow into a target and foes within 2.5 meters.", 1500, 14000, 1.15, { range:18,damageStat:'specialDamage',targeting:'splash',radius:2.5 }),
  "tranquilizing-shot": ranger("tranquilizing-shot", 36, "Tranquilizing Shot", "Carefully aim a low-damage arrow that stuns a distant foe for three seconds.", 1500, 25000, 0.4, { range:21,status:{kind:'stun',durationMs:3000} }),
  "wild-renewal": ranger("wild-renewal", 38, "Wild Renewal", "Remain still to restore your health once a second for three seconds.", 0, 26000, 1.1, { effect:'heal',targetRelation:'self',visual:'radial',range:0,channel:{durationMs:3000,tickMs:1000} }),
  "razor-flurry": ranger("razor-flurry", 40, "Razor Flurry", "An instant close-range fan of seven arrows.", 0, 14000, 0.75, { range:9,damageStat:'specialDamage',targeting:'chain',maxTargets:7 }),
  "viper-strike": ranger("viper-strike", 42, "Viper Strike", "A concentrated long-range poison delivers six damaging ticks.", 1000, 20000, 0.8, {"school":"poison","range":21,"status":{"kind":"poison","durationMs":6000,"ticks":6,"tickScale":0.3}}),
  "hail-of-arrows": ranger("hail-of-arrows", 46, "Hail of Arrows", "Remain still to rain three waves of arrows on nearby foes.", 0, 24000, 0.7, { range:10.5,damageStat:'specialDamage',targeting:'radial',channel:{durationMs:3000,tickMs:1000} }),
  "binding-arrow": ranger("binding-arrow", 48, "Binding Arrow", "Pin a target and enemies within two meters with a brief stun.", 2000, 30000, 0.65, { range:18,damageStat:'specialDamage',targeting:'splash',radius:2,status:{kind:'stun',durationMs:1500} }),
  "eagles-eye": ranger("eagles-eye", 50, "Eagle's Eye", "An extended 27-meter shot with a deliberate draw.", 3000, 16000, 2.65, {"range":27}),
  "frostfall-volley": ranger("frostfall-volley", 52, "Frostfall Volley", "Cover a target and foes within four meters in slowing arrows.", 2000, 22000, 0.85, { range:18,damageStat:'specialDamage',targeting:'splash',radius:4,status:{kind:'slow',durationMs:5000,multiplier:.4} }),
  "survival-instinct": ranger("survival-instinct", 54, "Survival Instinct", "An instant, powerful self-shield for surviving a sudden attack.", 0, 60000, 3, {"effect":"shield","targetRelation":"self","visual":"radial","range":0,"shieldDurationMs":8000}),
  "starfall-arrow": ranger("starfall-arrow", 56, "Starfall Arrow", "Prepare a heavy arrow that bursts over a wide group.", 3000, 26000, 1.8, { range:24,damageStat:'specialDamage',targeting:'splash',radius:4.5,maxTargets:4,visual:'meteor' }),
  "relentless-volley": ranger("relentless-volley", 58, "Relentless Volley", "Remain still to fire six waves at up to three foes.", 0, 32000, 0.4, { range:18,damageStat:'specialDamage',targeting:'chain',maxTargets:3,channel:{durationMs:3000,tickMs:500} }),
  // Knight
  "charge": knight("charge", 3, "Charge", "Rush at an enemy up to fifteen meters away, dealing 80% damage and slowing it by 35% for four seconds.", 0, 12000, .8, { icon:'spell-charge',color:'#e4c47e',range:15,visual:'projectile',chargeSpeed:30,status:{kind:'slow',durationMs:4000,multiplier:.65} }),
  "taunt": knight("taunt", 1, "Taunt", "Deal 50% damage and force an enemy to attack you for three seconds. With no target, or a target already attacking you, select a nearby enemy attacking an ally.", 0, 7000, .5, { icon:'spell-taunt',color:'#e4c47e',range:18,visual:'projectile',tauntDurationMs:3000 }),
  "strike": knight("strike", 1, "Sword Strike", "Instantly strike a nearby enemy with your blade.", 0, 550, 1, { color:'#ffe4ad' }),
  "crippling-strike": knight("crippling-strike", 2, "Crippling Strike", "A low cut slows one enemy by 35% for four seconds.", 0, 8000, 0.8, { status:{kind:'slow',durationMs:4000,multiplier:.65} }),
  "cleave": knight("cleave", 4, "Cleave", "A broad sweep catches up to three close enemies.", 0, 4000, 1.25, { color:'#ffc486',range:5.7,targeting:'chain',maxTargets:3 }),
  "second-wind": knight("second-wind", 6, "Second Wind", "Take a breath to restore your health.", 0, 22000, 1, {"effect":"heal","targetRelation":"self","range":0}),
  "shield-bash": knight("shield-bash", 8, "Shield Bash", "Bash one enemy and stun it for two seconds.", 0, 6000, 0.75, { color:'#b8def6',status:{kind:'stun',durationMs:2000} }),
  "iron-guard": knight("iron-guard", 10, "Iron Guard", "Raise a damage-absorbing guard for ten seconds.", 0, 18000, 1.5, {"effect":"shield","targetRelation":"self","range":0,"shieldDurationMs":10000}),
  "whirlwind": knight("whirlwind", 12, "Whirlwind", "Spin your blade through all nearby enemies.", 0, 3500, 1, { color:'#ffd780',range:7.5,damageStat:'specialDamage',targeting:'radial' }),
  "heavy-slash": knight("heavy-slash", 14, "Heavy Slash", "Wind up a heavy two-second blade strike.", 2000, 10000, 2.2, { range:5.7 }),
  "shockwave": knight("shockwave", 16, "Shockwave", "Slam the ground to send a broad wave through nearby foes.", 0, 7500, 1.15, { color:'#f6c965',range:10.5,damageStat:'specialDamage',targeting:'radial' }),
  "shield-toss": knight("shield-toss", 18, "Shield Toss", "Throw your shield at three foes to briefly slow their advance.", 0, 12000, 0.75, { range:13.5,visual:'projectile',targeting:'chain',maxTargets:3,status:{kind:'slow',durationMs:2500,multiplier:.65} }),
  "rallying-cry": knight("rallying-cry", 20, "Rallying Cry", "Restore a small amount of health to yourself and nearby party allies.", 0, 30000, 1, {"damageStat":"specialDamage","effect":"heal","targetRelation":"friendly","targeting":"radial","range":7.5}),
  "concussive-blow": knight("concussive-blow", 22, "Concussive Blow", "Deliver a powerful single strike with a short stun.", 1500, 22000, 1.7, { status:{kind:'stun',durationMs:1500} }),
  "groundbreaker": knight("groundbreaker", 26, "Groundbreaker", "Crack the ground under nearby enemies, slowing them for five seconds.", 1500, 16000, 0.9, { range:9,damageStat:'specialDamage',targeting:'radial',status:{kind:'slow',durationMs:5000,multiplier:.45} }),
  "crushing-sweep": knight("crushing-sweep", 28, "Crushing Sweep", "Commit to a heavy sweep through four nearby enemies.", 2000, 14000, 1.6, { range:6,damageStat:'specialDamage',targeting:'chain',maxTargets:4 }),
  "bladestorm": knight("bladestorm", 30, "Bladestorm", "Remain still and strike nearby enemies six times over three seconds.", 0, 24000, 0.4, { range:6,damageStat:'specialDamage',targeting:'radial',channel:{durationMs:3000,tickMs:500} }),
  "quick-recovery": knight("quick-recovery", 32, "Quick Recovery", "An instant small self-heal for a sudden opening.", 0, 18000, 1.25, { effect:'heal',targetRelation:'self',range:0 }),
  "shattering-throw": knight("shattering-throw", 34, "Shattering Throw", "Hurl a heavy strike at one enemy from eighteen meters.", 1500, 18000, 1.9, { range:18,visual:'projectile' }),
  "earthshaker": knight("earthshaker", 36, "Earthshaker", "A prepared ground slam briefly stuns every nearby enemy.", 2000, 30000, 0.9, { range:7.5,damageStat:'specialDamage',targeting:'radial',status:{kind:'stun',durationMs:2000} }),
  "guardian-oath": knight("guardian-oath", 38, "Guardian's Oath", "Shield a ally, or yourself if no ally is selected.", 0, 30000, 2, {"effect":"shield","targetRelation":"friendly","range":12,"shieldDurationMs":12000}),
  "relentless-strike": knight("relentless-strike", 40, "Relentless Strike", "An instant hard-hitting single-target strike.", 0, 12000, 1.65, { range:5.7 }),
  "chainbreaker": knight("chainbreaker", 44, "Chainbreaker", "Slow up to five attackers with an immediate sweeping blow.", 0, 20000, 0.8, { range:7.5,damageStat:'specialDamage',targeting:'chain',maxTargets:5,status:{kind:'slow',durationMs:4000,multiplier:.5} }),
  "thunderclap": knight("thunderclap", 48, "Thunderclap", "A short-range instant shock stuns nearby enemies for one second.", 0, 26000, 0.6, { range:5.7,damageStat:'specialDamage',targeting:'radial',status:{kind:'stun',durationMs:1000} }),
  "colossus-strike": knight("colossus-strike", 50, "Colossus Strike", "Take three seconds to deliver a massive single-target blow.", 3000, 24000, 3.5, { range:6 }),
  "stalwart-company": knight("stalwart-company", 52, "Stalwart Company", "Brace to shield yourself and party allies within nine meters.", 1500, 45000, 1.8, { effect:'shield',targetRelation:'friendly',range:9,damageStat:'specialDamage',targeting:'radial',shieldDurationMs:12000 }),
  "siegebreaker": knight("siegebreaker", 54, "Siegebreaker", "Hurl a heavy blow that bursts over a target and foes within three meters.", 2500, 22000, 1.75, { range:15,damageStat:'specialDamage',targeting:'splash',radius:3,visual:'projectile' }),
  "unyielding-blows": knight("unyielding-blows", 56, "Unyielding Blows", "Remain still and hammer one close enemy six times.", 0, 28000, 0.65, { range:5.7,channel:{durationMs:3000,tickMs:500} }),
  "battle-renewal": knight("battle-renewal", 58, "Battle Renewal", "Call on your resolve for a large, deliberate self-heal.", 1000, 40000, 3.6, {"effect":"heal","targetRelation":"self","range":0}),
  "last-bastion": knight("last-bastion", 60, "Last Bastion", "Instantly shield yourself and nearby party allies for six seconds.", 0, 90000, 2, {"damageStat":"specialDamage","effect":"shield","targetRelation":"friendly","targeting":"radial","range":7.5,"shieldDurationMs":6000}),
  // Mage
  "fireball": mage("fireball", 1, "Fireball", "Sustained fire: a two-second bolt followed by four seconds of burning. Recasting refreshes your burn.", 2000, 0, 1.3, { status:{kind:'burn',durationMs:4000,ticks:4,tickScale:.1}, color:'#ff8d42',range:10.5 }),
  "arcane-missile": mage("arcane-missile", 2, "Arcane Missile", "An instant finisher: deals double damage to enemies below 30% health.", 0, 4000, 0.45, { executeScale:2, range:15 }),
  "frostbolt": mage("frostbolt", 4, "Frostbolt", "Repeatable control: a two-second frost bolt slows one enemy by half for three seconds.", 2000, 0, 1.35, { color:'#83e4ff',status:{kind:'slow',durationMs:3000,multiplier:.5} }),
  "flame-barrier": mage("flame-barrier", 6, "Flame Barrier", "Envelop yourself in a protective absorb shield for ten seconds.", 0, 25000, 1.5, {"school":"fire","effect":"shield","targetRelation":"self","visual":"radial","range":0,"shieldDurationMs":10000}),
  "nova": mage("nova", 8, "Frost Nova", "Create breathing room: an instant low-damage ring slows nearby enemies for four seconds.", 0, 12000, 0.35, { color:'#82dfff',range:7.5,damageStat:'specialDamage',targeting:'radial',visual:'radial',status:{kind:'slow',durationMs:4000,multiplier:.5} }),
  "ice-lance": mage("ice-lance", 10, "Ice Lance", "Shatter a chilled target: this instant shard deals triple damage while the enemy is slowed.", 0, 6000, 0.45, { shatterScale:3, range:18 }),
  "arcane-burst": mage("arcane-burst", 12, "Arcane Burst", "A mobile arcane pulse trades single-target power for nearby crowd coverage.", 0, 6500, 0.5, { color:'#d2a0ff',range:10.5,damageStat:'specialDamage',targeting:'radial',visual:'radial' }),
  "cinderbolt": mage("cinderbolt", 14, "Cinderbolt", "A faster fire cast for shorter safe windows; less sustained damage than Fireball.", 1500, 0, 1.1, { range:18 }),
  "meteor": mage("meteor", 16, "Meteor", "Call down a heavy meteor on a target and enemies within three meters.", 3000, 10000, 1.55, { color:'#ff5e35',range:18,damageStat:'specialDamage',targeting:'splash',radius:3,visual:'meteor' }),
  "arcane-restoration": mage("arcane-restoration", 18, "Arcane Restoration", "Concentrate arcane energy to restore your own health.", 3000, 30000, 2, {"effect":"heal","targetRelation":"self","visual":"radial","range":0}),
  "frozen-orb": mage("frozen-orb", 20, "Frozen Orb", "A cold orb splashes over nearby foes, slowing them for four seconds.", 1500, 14000, 0.9, { range:18,damageStat:'specialDamage',targeting:'splash',radius:3,status:{kind:'slow',durationMs:4000,multiplier:.5} }),
  "spellward": mage("spellward", 22, "Spellward", "Instantly shield one ally, or yourself if no ally is selected.", 0, 25000, 1.8, {"effect":"shield","targetRelation":"friendly","visual":"radial","shieldDurationMs":12000}),
  "pyroblast": mage("pyroblast", 24, "Pyroblast", "Prepare a three-second blast for heavy single-target damage.", 3000, 18000, 2.7, { range:21 }),
  "arcane-barrage": mage("arcane-barrage", 26, "Arcane Barrage", "An instant fan of arcane bolts strikes up to four enemies.", 0, 12000, 0.8, { range:15,damageStat:'specialDamage',targeting:'chain',maxTargets:4 }),
  "deep-freeze": mage("deep-freeze", 28, "Deep Freeze", "A focused frost spell stuns one enemy for three seconds.", 1500, 25000, 0.5, { range:18,status:{kind:'stun',durationMs:3000} }),
  "arcane-beam": mage("arcane-beam", 30, "Arcane Beam", "Remain still and channel six pulses of arcane damage into one target.", 0, 18000, 0.45, { range:18,channel:{durationMs:3000,tickMs:500} }),
  "ice-barrier": mage("ice-barrier", 32, "Ice Barrier", "Form a stronger personal shield that lasts twenty seconds.", 0, 50000, 2.5, {"school":"frost","effect":"shield","targetRelation":"self","visual":"radial","range":0,"shieldDurationMs":20000}),
  "flamewave": mage("flamewave", 34, "Flamewave", "An immediate close-range flame wave burns nearby enemies for three further ticks over four seconds.", 0, 14000, 0.7, { range:6,damageStat:'specialDamage',targeting:'radial',visual:'radial',status:{kind:'burn',durationMs:4000,ticks:3,tickScale:.35} }),
  "blizzard": mage("blizzard", 36, "Blizzard", "Remain still to strike a target and nearby foes with three waves of ice.", 0, 24000, 0.7, { range:21,damageStat:'specialDamage',targeting:'splash',radius:4,channel:{durationMs:3000,tickMs:1000} }),
  "ley-renewal": mage("ley-renewal", 38, "Ley Renewal", "Remain still to recover health once a second for three seconds.", 0, 30000, 1.1, { effect:'heal',targetRelation:'self',range:0,visual:'radial',channel:{durationMs:3000,tickMs:1000} }),
  "glacial-spike": mage("glacial-spike", 40, "Glacial Spike", "Launch a heavy icicle that slows its target for six seconds.", 2500, 16000, 2, { range:24,status:{kind:'slow',durationMs:6000,multiplier:.4} }),
  "comet-shower": mage("comet-shower", 42, "Comet Shower", "Prepare a shower of comets over a target and a wide nearby group.", 2500, 22000, 1.65, { range:21,damageStat:'specialDamage',targeting:'splash',radius:4.5,visual:'meteor' }),
  "chain-lightning": mage("chain-lightning", 46, "Chain Lightning", "Cast a branching bolt into up to six enemies.", 2000, 17000, 1.1, { range:18,damageStat:'specialDamage',targeting:'chain',maxTargets:6 }),
  "flash-freeze": mage("flash-freeze", 48, "Flash Freeze", "Instantly stun enemies within six meters for one second.", 0, 32000, 0.4, { range:6,damageStat:'specialDamage',targeting:'radial',visual:'radial',status:{kind:'stun',durationMs:1000} }),
  "inferno-beam": mage("inferno-beam", 50, "Inferno Beam", "Remain still to burn one target with three powerful pulses.", 0, 26000, 1.2, { range:21,channel:{durationMs:3000,tickMs:1000} }),
  "starfire": mage("starfire", 54, "Starfire", "Conjure a massive long-range bolt over three seconds.", 3000, 26000, 3.5, { range:27 }),
  "winterstorm": mage("winterstorm", 56, "Winterstorm", "Blanket a wide group in a heavily slowing frost explosion.", 2500, 28000, 1.15, { range:21,damageStat:'specialDamage',targeting:'splash',radius:5,status:{kind:'slow',durationMs:6000,multiplier:.35} }),
  "arcane-tempest": mage("arcane-tempest", 58, "Arcane Tempest", "Remain still to send six arcane waves through nearby enemies.", 0, 35000, 0.5, { range:10.5,damageStat:'specialDamage',targeting:'radial',visual:'radial',channel:{durationMs:3000,tickMs:500} }),
  "aegis-of-the-archmage": mage("aegis-of-the-archmage", 60, "Aegis of the Archmage", "Instantly protect a ally or yourself with a major fifteen-second shield.", 0, 75000, 4, {"effect":"shield","targetRelation":"friendly","visual":"radial","range":21,"shieldDurationMs":15000}),
  // Cleric
  "smite": cleric("smite", 1, "Smite", "A repeatable two-second holy bolt rewards standing still with steady damage.", 2000, 0, 1.5),
  "heal": cleric("heal", 2, "Heal", "A measured cast restores substantial health to one ally or yourself.", 2500, 0, 2.3, { effect:'heal',targetRelation:'friendly' }),
  "holy-nova": cleric("holy-nova", 4, "Holy Nova", "Release an instant ring of holy damage around you.", 0, 8000, 0.8, { range:7.5,damageStat:'specialDamage',targeting:'radial',visual:'radial' }),
  "flash-heal": cleric("flash-heal", 6, "Flash Heal", "A faster, smaller heal for one ally or yourself.", 1500, 3000, 1.5, { effect:'heal',targetRelation:'friendly' }),
  "power-word-shield": cleric("power-word-shield", 8, "Power Word: Shield", "Instantly absorb damage for a ally or yourself for fifteen seconds.", 0, 15000, 2, { effect:'shield',targetRelation:'friendly',visual:'radial',shieldDurationMs:15000 }),
  "renew": cleric("renew", 10, "Renew", "Remain still and restore one ally’s health once a second for three seconds.", 0, 12000, 0.85, { effect:'heal',targetRelation:'friendly',visual:'radial',channel:{durationMs:3000,tickMs:1000} }),
  "searing-light": cleric("searing-light", 12, "Searing Light", "An instant, lighter holy bolt for a quick strike.", 0, 5000, 0.7, { range:18 }),
  "binding-light": cleric("binding-light", 14, "Binding Light", "A low-damage bolt slows one enemy by half for five seconds.", 0, 12000, 0.45, { range:18,status:{kind:'slow',durationMs:5000,multiplier:.5} }),
  "prayer-of-healing": cleric("prayer-of-healing", 16, "Prayer of Healing", "A deliberate prayer restores health to yourself and nearby party allies.", 2500, 12000, 1.35, { effect:'heal',targetRelation:'friendly',range:9,damageStat:'specialDamage',targeting:'radial',visual:'radial' }),
  "holy-fire": cleric("holy-fire", 18, "Holy Fire", "Prepare a concentrated holy flame against one distant enemy.", 2500, 10000, 1.9, { range:21,color:'#ffe2a3' }),
  "penance": cleric("penance", 20, "Penance", "Remain still and strike one enemy with three pulses of holy judgment.", 0, 15000, 0.8, { range:18,channel:{durationMs:3000,tickMs:1000} }),
  "holy-word-serenity": cleric("holy-word-serenity", 22, "Holy Word: Serenity", "An instant substantial heal with a long recovery.", 0, 30000, 2.4, { effect:'heal',targetRelation:'friendly',range:18 }),
  "divine-aegis": cleric("divine-aegis", 24, "Divine Aegis", "Prepare a strong shield for one ally or yourself for twenty seconds.", 1500, 25000, 3.3, { effect:'shield',targetRelation:'friendly',range:18,visual:'radial',shieldDurationMs:20000 }),
  "chains-of-light": cleric("chains-of-light", 26, "Chains of Light", "A focused ray stuns one enemy for two seconds.", 1500, 20000, 0.55, { range:18,status:{kind:'stun',durationMs:2000} }),
  "circle-of-healing": cleric("circle-of-healing", 28, "Circle of Healing", "Instantly restore a modest amount of health to nearby party allies and yourself.", 0, 22000, 1, { effect:'heal',targetRelation:'friendly',range:7.5,damageStat:'specialDamage',targeting:'radial',visual:'radial' }),
  "divine-hymn": cleric("divine-hymn", 30, "Divine Hymn", "Remain still and heal nearby party allies and yourself in three waves.", 0, 45000, 0.9, { effect:'heal',targetRelation:'friendly',range:10.5,damageStat:'specialDamage',targeting:'radial',visual:'radial',channel:{durationMs:3000,tickMs:1000} }),
  "radiant-burst": cleric("radiant-burst", 32, "Radiant Burst", "A bolt of light bursts over a target and enemies within three meters.", 2000, 14000, 1.2, { range:18,damageStat:'specialDamage',targeting:'splash',radius:3 }),
  "guardian-light": cleric("guardian-light", 34, "Guardian Light", "A brief, powerful instant self-shield for a dangerous moment.", 0, 40000, 3.5, { effect:'shield',targetRelation:'self',range:0,visual:'radial',shieldDurationMs:7000 }),
  "greater-heal": cleric("greater-heal", 36, "Greater Heal", "A slow, efficient restoration for a severely wounded ally or yourself.", 3000, 6000, 3.6, { effect:'heal',targetRelation:'friendly',range:21 }),
  "sacred-flame": cleric("sacred-flame", 38, "Sacred Flame", "Remain still and sear a target and nearby enemies with three holy flames.", 0, 22000, 0.75, { range:18,damageStat:'specialDamage',targeting:'splash',radius:3,channel:{durationMs:3000,tickMs:1000} }),
  "prayer-of-mending": cleric("prayer-of-mending", 40, "Prayer of Mending", "A prayer restores health to up to three nearby party members, including yourself.", 1500, 16000, 1.4, { effect:'heal',targetRelation:'friendly',range:15,damageStat:'specialDamage',targeting:'chain',maxTargets:3 }),
  "holy-word-chastise": cleric("holy-word-chastise", 42, "Holy Word: Chastise", "Instantly stun one enemy for two seconds with a word of light.", 0, 28000, 0.6, { range:15,status:{kind:'stun',durationMs:2000} }),
  "sanctuary": cleric("sanctuary", 44, "Sanctuary", "Place a ten-second absorb shield on yourself and nearby party allies.", 1500, 40000, 1.8, { effect:'shield',targetRelation:'friendly',range:9,damageStat:'specialDamage',targeting:'radial',visual:'radial',shieldDurationMs:10000 }),
  "judgment": cleric("judgment", 46, "Judgment", "An immediate hard-hitting holy bolt with a measured recovery.", 0, 14000, 1.5, { range:18 }),
  "salvation": cleric("salvation", 48, "Salvation", "Cast a long prayer that restores substantial health to yourself and nearby party allies.", 3000, 30000, 2.4, { effect:'heal',targetRelation:'friendly',range:12,damageStat:'specialDamage',targeting:'radial',visual:'radial' }),
  "holy-lance": cleric("holy-lance", 50, "Holy Lance", "Form a long-range spear of light for a heavy single-target strike.", 2500, 18000, 2.6, { range:24 }),
  "seraphic-barrier": cleric("seraphic-barrier", 52, "Seraphic Barrier", "Shield up to three nearby party members, including yourself, for twelve seconds.", 0, 35000, 2.1, { effect:'shield',targetRelation:'friendly',range:15,damageStat:'specialDamage',targeting:'chain',maxTargets:3,visual:'radial',shieldDurationMs:12000 }),
  "cleansing-radiance": cleric("cleansing-radiance", 54, "Cleansing Radiance", "A wide burst of holy damage slows approaching enemies for five seconds.", 2000, 22000, 1, { range:10.5,damageStat:'specialDamage',targeting:'radial',visual:'radial',status:{kind:'slow',durationMs:5000,multiplier:.4} }),
  "light-of-dawn": cleric("light-of-dawn", 56, "Light of Dawn", "An instant, generous heal for yourself and nearby party allies.", 0, 45000, 1.8, { effect:'heal',targetRelation:'friendly',range:9,damageStat:'specialDamage',targeting:'radial',visual:'radial' }),
  "wrath-of-heaven": cleric("wrath-of-heaven", 58, "Wrath of Heaven", "Call down holy judgment over a target and enemies within four meters.", 3000, 28000, 2, { range:24,damageStat:'specialDamage',targeting:'splash',radius:4,visual:'meteor' }),
  "guardian-of-the-dawn": cleric("guardian-of-the-dawn", 60, "Guardian of the Dawn", "Instantly shield a ally or yourself with a major fifteen-second blessing.", 0, 75000, 5.5, { effect:'shield',targetRelation:'friendly',range:24,visual:'radial',shieldDurationMs:15000 }),
  [SPELL_EFFECT_IDS.revivify]: cleric(SPELL_EFFECT_IDS.revivify, 1, "Revivify", "Return all nearby ally players to life", 0, 0, 0, { icon:'spell-revivify',color:'#e4c47e',effect:'revive',targetRelation:'friendly',targeting:'radial',visual:'radial',range:15,reviveHealthFraction:1 }),
};

/** Shared spellbook and hotbar text for utility without a damage or healing total. */
export function spellUtilityLabel(spell: Spell): string | null {
  if (spell.effect === 'revive') return `Revives fallen allies within ${spell.range}m at ${Math.round(spell.reviveHealthFraction! * 100)}% health`;
  if (spell.id === 'adamant-guardian') return '40% damage reduction for 8s · Counterattacks when hit, once per second';
  const cleanse = spell.clearMovementImpairments ? ' · Removes slows and roots' : '';
  if (spell.movementDistance) return `Move ${spell.movementDistance}m forwards${cleanse}`;
  if (spell.movementSpeedMultiplier) return `+${Math.round((spell.movementSpeedMultiplier - 1) * 100)}% movement speed for ${(spell.buffDurationMs ?? 0) / 1000}s${cleanse}`;
  if (spell.id === 'eternal-edict') return `Repeat current Edicts for ${(spell.buffDurationMs ?? 0) / 1000}s`;
  if (spell.id === 'edict-of-the-dawn') return `Heals every ${CLERIC_EDICTS.dawnTickMs / 1000}s for ${(spell.buffDurationMs ?? 0) / 1000}s · Healing pulse when hit`;
  return null;
}

/** Trainer lessons by default; spellbooks also include talent-granted abilities. */
export function spellsForClass(className: CharacterClass, includeTalents = false): Spell[] {
  return Object.values(SPELLS).filter(spell => spell.className === className && (includeTalents || !spell.requiredTalent)).sort((a, b) => a.requiredLevel - b.requiredLevel);
}
/** School membership is authored independently of names, colors and damage-stat choice. */
const schoolSpells: Partial<Record<SpellSchool, AbilityId[]>> = {
  fire: ['fireball','flame-barrier','cinderbolt','meteor','pyroblast','flamewave','inferno-beam'],
  frost: ['frostbolt','nova','ice-lance','frozen-orb','deep-freeze','ice-barrier','blizzard','glacial-spike','comet-shower','flash-freeze','winterstorm'],
  poison: ['poison-shot','serpent-fan','viper-strike'],
};
for (const [school, ids] of Object.entries(schoolSpells)) for (const id of ids) SPELLS[id].school = school as SpellSchool;

export const LEGACY_HOTBAR_PAGE_SIZE = 8;
export const HOTBAR_PAGE_SIZE = 10;
export const HOTBAR_SIZE = HOTBAR_PAGE_SIZE * 2;

/** Older realms persist the first eight slots and preserve the two optional tail slots. */
export function extendedHotbar(slots: unknown, extra?: unknown): unknown {
  if (!Array.isArray(slots) || slots.length !== LEGACY_HOTBAR_PAGE_SIZE) return extra === undefined ? slots : null;
  if (extra !== undefined && (!Array.isArray(extra) || extra.length !== HOTBAR_PAGE_SIZE - LEGACY_HOTBAR_PAGE_SIZE)) return null;
  return [...slots, ...(extra === undefined ? [null, null] : extra as unknown[])];
}

/** Keep legacy slots stable; a larger catalog must not resize or reshuffle the hotbar. */
const DEFAULT_ABILITIES: Record<CharacterClass, readonly [AbilityId, AbilityId, AbilityId, AbilityId, AbilityId]> = {
  Ranger: ['arrow', 'volley', 'power-shot', 'multishot', 'poison-shot'],
  Knight: ['strike', 'whirlwind', 'cleave', 'shockwave', 'shield-bash'],
  Mage: ['fireball', 'nova', 'frostbolt', 'arcane-burst', 'meteor'],
  Cleric: ['smite', 'holy-nova', 'heal', 'flash-heal', 'power-word-shield'],
};
export function defaultHotbar(className: CharacterClass, level = 1, learnedSpells?: readonly AbilityId[]): HotbarSlot[] {
  const [primary, special, ...additional] = DEFAULT_ABILITIES[className].map(id => abilityUnlocked(id, className, level, learnedSpells) ? id : null);
  return [primary, special, 'mend', 'interact', ...additional, null, null, null];
}
export function abilityValid(value: unknown, className?: CharacterClass): value is AbilityId {
  return typeof value === 'string' && Object.hasOwn(SPELLS, value) && (!className || SPELLS[value as AbilityId].className === className);
}
/** Remove only valid retired lessons and their slots; malformed saves still fail normal validation. */
export function migrateRetiredSpells(player: { appearance?: { className?: unknown }; level?: unknown; learnedSpells?: unknown; hotbar?: unknown; hotbar2?: unknown; hotbarExtra?: unknown; hotbar2Extra?: unknown }): void {
  const learned = player.learnedSpells, className = player.appearance?.className, level = player.level;
  if (!Array.isArray(learned) || new Set(learned).size !== learned.length || !Number.isSafeInteger(level)) return;
  const retired = (id: unknown): id is RetiredAbilityId => typeof id === 'string' && Object.hasOwn(RETIRED_SPELLS, id);
  if (!learned.every(id => {
    const spell = retired(id) ? RETIRED_SPELLS[id] : abilityValid(id) && !SPELLS[id].requiredTalent ? SPELLS[id] : null;
    return spell && spell.className === className && spell.requiredLevel <= (level as number);
  })) return;
  const banks = ['hotbar', 'hotbar2', 'hotbarExtra', 'hotbar2Extra'] as const;
  for (const bank of banks) {
    const slots = player[bank];
    if (slots === undefined) continue;
    if (!Array.isArray(slots) || !(bank.endsWith('Extra') ? slots.length === 2 : [LEGACY_HOTBAR_PAGE_SIZE, HOTBAR_PAGE_SIZE].includes(slots.length))
        || !slots.every(slot => slot === null || slot === 'mend' || slot === 'interact' || abilityValid(slot) || retired(slot) && learned.includes(slot))) return;
  }
  player.learnedSpells = learned.filter(id => !retired(id));
  for (const bank of banks) if (Array.isArray(player[bank])) player[bank] = player[bank].map(slot => retired(slot) ? null : slot);
}
export function abilityUnlocked(value: unknown, className: CharacterClass, level: number, learnedSpells?: readonly AbilityId[], talents?: readonly string[]): value is AbilityId {
  if (!abilityValid(value, className) || !Number.isSafeInteger(level) || level < SPELLS[value].requiredLevel) return false;
  const requiredTalent = SPELLS[value].requiredTalent;
  return requiredTalent ? Array.isArray(talents) && talents.includes(requiredTalent)
    : learnedSpells === undefined || Array.isArray(learnedSpells) && learnedSpells.includes(value);
}
export function hotbarValid(value: unknown, className: CharacterClass, level?: number, learnedSpells?: readonly AbilityId[], talents?: readonly string[]): value is HotbarSlot[] {
  return Array.isArray(value) && value.length === HOTBAR_PAGE_SIZE && value.every(slot => slot === null || slot === 'mend' || slot === 'interact'
    || abilityValid(slot, className) && (level === undefined && learnedSpells === undefined && talents === undefined
      || abilityUnlocked(slot, className, level ?? Number.MAX_SAFE_INTEGER, learnedSpells, talents)));
}
/** Preserve chosen positions; learning a spell never overwrites another slot. */
export function availableHotbar(slots: unknown, className: CharacterClass, level: number, learnedSpells?: readonly AbilityId[], talents?: readonly string[]): HotbarSlot[] {
  const bank = extendedHotbar(slots);
  if (!hotbarValid(bank, className)) return defaultHotbar(className, level, learnedSpells);
  return bank.map(slot => abilityValid(slot) && !abilityUnlocked(slot, className, level, learnedSpells, talents) ? null : slot);
}
// Special-scaled abilities already include skill bonuses; primary-scaled abilities need them too.
const spellPower = (spell: Spell, stats: SpellStats): number => stats[spell.damageStat] + (spell.damageStat === 'primaryDamage' ? stats.skillDamage || 0 : 0);
const spellDamageMultiplier = (spell: Spell, stats: SpellStats): number => spell.effect === 'damage'
  ? (stats.damageMultiplier ?? 1) * (spell.school === 'physical' ? 1 : stats.magicDamageMultiplier ?? 1) : 1;
/** One shared calculation keeps tooltips, casts, channels and periodic damage aligned. */
export function spellDamage(spell: Spell, stats: SpellStats): number {
  if (spell.damageScale === 0) return 0;
  const bonus = stats.spellBonuses || {};
  const percent = spell.effect === 'heal' ? bonus.healing || 0 : spell.effect === 'shield' ? bonus.shielding || 0
    : (bonus[spell.school] || 0) + (bonus.direct || 0) + (spell.castTimeMs > 0 || spell.channel ? bonus.casting || 0 : bonus.instant || 0);
  return Math.max(1, Math.round(spellPower(spell, stats) * spell.damageScale * (1 + percent / 100) * spellDamageMultiplier(spell, stats)));
}
export function spellPeriodicDamage(spell: Spell, stats: SpellStats): number {
  const bonus = stats.spellBonuses || {};
  return Math.max(1, Math.round(spellPower(spell, stats) * (spell.status?.tickScale || 0) * (1 + ((bonus[spell.school] || 0) + (bonus.periodic || 0)) / 100) * spellDamageMultiplier(spell, stats)));
}
export function spellTargetMultiplier(spell: Spell, stats: SpellStats, slowed: boolean, healthFraction: number): number {
  return (slowed ? spell.shatterScale || 1 : 1) * (healthFraction < .3 ? spell.executeScale || 1 : 1)
    * (1 + (slowed ? stats.spellBonuses?.chilled || 0 : 0) / 100);
}
export function spellTotalPower(spell: Spell, stats: SpellStats): number {
  const ticks = spell.channel ? spell.channel.durationMs / spell.channel.tickMs : 1;
  const periodic = spell.status?.ticks ? spell.status.ticks * spellPeriodicDamage(spell, stats) : 0;
  return spellDamage(spell, stats) * ticks + periodic;
}
export function spellTotalDamage(spell: Spell, stats: SpellStats): number {
  return spell.effect === 'damage' ? spellTotalPower(spell, stats) : 0;
}
/** Gear never slows casts; only active talent effects alter authored timing. */
export function spellCastTimeMs(spell: Spell, stats?: SpellStats, talents?: CombatTalents, now = Date.now()): number {
  if (spell.id === 'twinshot' && (talents?.twinshotReadyUntil ?? 0) > now) return 0;
  const duration = spell.id === 'powerful-throw' && talents?.powerfulThrowReady ? spell.pickupCastTimeMs! : spell.castTimeMs;
  const heat = (talents?.heatUntil ?? 0) > now ? Math.min(10, Math.max(0, talents!.heat)) : 0;
  return Math.round(duration / ((1 + heat * .03) * (stats?.castSpeedMultiplier ?? 1)));
}
/** Five impacts visit each selected foe before repeating, losing 15% per repeat on that foe. */
export function ricochetHits<T>(targets: readonly T[]): { target: T; damageMultiplier: number }[] {
  return targets.length ? Array.from({ length: SPELLS['ricochet-shot'].maxTargets! }, (_, index) => ({
    target: targets[index % targets.length], damageMultiplier: SPELLS['ricochet-shot'].repeatDamageMultiplier! ** Math.floor(index / targets.length),
  })) : [];
}
export function legacyAbility(className: CharacterClass, special = false): AbilityId {
  return DEFAULT_ABILITIES[className][special ? 1 : 0];
}
