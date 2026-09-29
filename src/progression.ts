import type { CharacterClass, Player } from './shared';
import { SPELLS, SPELL_BONUS_LABELS, TALENT_EFFECT_IDS, type AbilityId, type SpellBonuses } from './spells.ts';
import { TALENT_DESIGN } from './talent-design.ts';
import { activeSpecialist } from './specialist-classes.ts';

export const MAX_LEVEL = 60;

export type GearSlot = 'weapon' | 'armor' | 'charm' | 'head' | 'legs' | 'shoes' | 'back' | 'ring';
export const EQUIPMENT_SLOTS = ['head', 'charm', 'back', 'armor', 'weapon', 'legs', 'shoes', 'ring1', 'ring2'] as const;
export type EquipmentSlot = typeof EQUIPMENT_SLOTS[number];
export interface Equipment { weapon: string; armor: string; charm: string | null; head: string | null; legs: string | null; shoes: string | null; back: string | null; ring1: string | null; ring2: string | null }
export const PRIMARY_ATTRIBUTES = ['strength', 'agility', 'intellect', 'stamina', 'spirit'] as const;
export type Attribute = typeof PRIMARY_ATTRIBUTES[number];
export const ATTRIBUTE_EFFECTS: Record<Attribute, string> = {
  strength: 'Each point adds 1 attack and skill power for Knights.',
  agility: 'Each point adds 1 attack and skill power for Rangers.',
  intellect: 'Each point adds 1 attack and skill power for Mages and Clerics.',
  stamina: 'Each point adds 5 maximum health.',
  spirit: 'Each point restores 1 health every 5 seconds outside combat.',
};
const classAttribute = (className: CharacterClass): Attribute => className === 'Knight' ? 'strength' : className === 'Ranger' ? 'agility' : 'intellect';
export interface StatBonuses extends Partial<Record<Attribute, number>> { primaryDamage?: number; specialDamage?: number; damage?: number; defense?: number; speed?: number }
export const GEAR_QUALITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type GearQuality = typeof GEAR_QUALITIES[number];
export interface Gear {
  id: string; label: string; description: string; slot: GearSlot; className: CharacterClass | null;
  price: number; sellPrice?: number; requiredLevel: number; stats: StatBonuses; color: string; model?: string; icon?: string; setId?: string; quality?: GearQuality; dropOnly?: boolean; baseId?: string; upgradeLevel?: number; randomized?: boolean;
}
export interface Talent {
  id: string; label: string; description: string; className: CharacterClass; branch: string;
  requiredLevel: number; prerequisite: string | null; prerequisiteRank: number; stats: StatBonuses;
  spellBonuses?: SpellBonuses;
  /** Percentage points per rank; kept separate from attack/skill power and healing. */
  passiveBonuses?: Partial<Record<'critChance' | 'attackSpeed' | 'castSpeed' | 'allDamage' | 'magicDamage' | 'health', number>>;
  ability?: AbilityId; icon?: string; rankDescriptions?: readonly string[];
  maxRank: number; row: number; column: number; requiredBranchPoints: number;
}

export const GEAR_SETS = [
  { id: 'briarwatch', label: 'Briarwatch', className: 'Ranger', requiredLevel: 5, color: '#66864a' },
  { id: 'sandstrider', label: 'Sandstrider', className: 'Ranger', requiredLevel: 12, color: '#bd8e53' },
  { id: 'froststalker', label: 'Froststalker', className: 'Ranger', requiredLevel: 25, color: '#7faec7' },
  { id: 'stormfeather', label: 'Stormfeather', className: 'Ranger', requiredLevel: 40, color: '#476987' },
  { id: 'elderwild', label: 'Elderwild', className: 'Ranger', requiredLevel: 50, color: '#526b37' },
  { id: 'ironbastion', label: 'Ironbastion', className: 'Knight', requiredLevel: 5, color: '#7d8b91' },
  { id: 'duneguard', label: 'Duneguard', className: 'Knight', requiredLevel: 12, color: '#bf884d' },
  { id: 'frostguard', label: 'Frostguard', className: 'Knight', requiredLevel: 25, color: '#9fced6' },
  { id: 'stormbreaker', label: 'Stormbreaker', className: 'Knight', requiredLevel: 40, color: '#566e9b' },
  { id: 'dawnwarden', label: 'Dawnwarden', className: 'Knight', requiredLevel: 50, color: '#d6b76a' },
  { id: 'emberweave', label: 'Emberweave', className: 'Mage', requiredLevel: 5, color: '#a34e43' },
  { id: 'duneoracle', label: 'Dune Oracle', className: 'Mage', requiredLevel: 12, color: '#c49b6a' },
  { id: 'frostweave', label: 'Frostweave', className: 'Mage', requiredLevel: 25, color: '#8fbada' },
  { id: 'stormcaller', label: 'Stormcaller', className: 'Mage', requiredLevel: 40, color: '#655ca8' },
  { id: 'novice', label: 'Novice', className: 'Cleric', requiredLevel: 5, color: '#dccda5' },
  { id: 'sunweave', label: 'Sunweave', className: 'Cleric', requiredLevel: 12, color: '#dcbd72' },
  { id: 'luminant', label: 'Luminant', className: 'Cleric', requiredLevel: 25, color: '#a4d9d3' },
  { id: 'dawnsong', label: 'Dawnsong', className: 'Cleric', requiredLevel: 40, color: '#79aab4' },
  { id: 'seraphic', label: 'Seraphic', className: 'Cleric', requiredLevel: 50, color: '#f0dd9d' },
  { id: 'astralweave', label: 'Astralweave', className: 'Mage', requiredLevel: 50, color: '#8c75c2' },
] as const;
/** Set effects use the same multipliers as talents; upgrading a piece retains its set. */
export function gearSetBonuses(setId: string): { pieces: number; bonuses: SpellBonuses; description: string }[] {
  const set = GEAR_SETS.find(set => set.id === setId);
  if (!set) return [];
  const theme: keyof SpellBonuses = ['briarwatch','elderwild'].includes(setId) ? 'poison'
    : ['emberweave'].includes(setId) ? 'fire' : ['frostweave','froststalker'].includes(setId) ? 'chilled'
    : set.className === 'Mage' ? 'arcane' : set.className === 'Ranger' ? 'direct'
    : set.className === 'Cleric' ? 'healing' : 'casting';
  const secondary: keyof SpellBonuses = theme === 'poison' || theme === 'fire' ? 'periodic' : theme === 'chilled' ? 'control'
    : set.className === 'Knight' || set.className === 'Cleric' ? 'shielding' : set.className === 'Ranger' ? 'instant' : 'casting';
  return [{ pieces: 2, bonuses: { [theme]: 8 }, description: `+8% ${SPELL_BONUS_LABELS[theme]}` },
    { pieces: 4, bonuses: { [secondary]: 12 }, description: `+12% ${SPELL_BONUS_LABELS[secondary]}` }];
}

const setGear: Gear[] = GEAR_SETS.flatMap(set => {
  const tier = [5, 12, 25, 40, 50].indexOf(set.requiredLevel) + 1, mage = set.className === 'Mage' || set.className === 'Cleric', knight = set.className === 'Knight';
  const slots = ['head', 'armor', 'legs', 'shoes', 'back', 'charm', 'ring', 'weapon'] as const;
  const labels = set.className === 'Cleric' ? ['Cowl', 'Vestments', 'Leggings', 'Sandals', 'Mantle', 'Pendant', 'Ring', 'Mace'] : mage ? ['Crown', 'Robes', 'Trousers', 'Slippers', 'Mantle', 'Pendant', 'Ring', 'Staff']
    : knight ? ['Helm', 'Plate', 'Greaves', 'Sabatons', 'Cape', 'Medallion', 'Signet', 'Sword']
    : ['Hood', 'Tunic', 'Leggings', 'Boots', 'Cloak', 'Talisman', 'Band', 'Longbow'];
  const stats: StatBonuses[] = [
    knight ? { defense: Math.ceil(tier / 2) } : mage ? { specialDamage: tier } : { primaryDamage: tier },
    { defense: mage ? Math.ceil(tier * .6) : Math.ceil(tier * .8) + (knight ? 2 : 1) },
    { defense: Math.ceil(tier / 2) },
    mage ? { specialDamage: Math.ceil(tier / 2) } : { primaryDamage: Math.ceil(tier / 2) },
    mage ? { specialDamage: tier * 2 } : knight ? { specialDamage: tier } : { primaryDamage: tier },
    knight ? { primaryDamage: Math.ceil(tier / 2) } : { specialDamage: mage ? tier * 3 : tier * 2 + 1 },
    mage ? { specialDamage: tier * 2 } : { primaryDamage: tier * 2 },
    mage ? { primaryDamage: 2 + tier * 3, specialDamage: 5 + tier * 5 }
      : { primaryDamage: (knight ? 5 : 4) + tier * 4, specialDamage: 2 + tier * (knight ? 2 : 3) },
  ];
  return slots.map((slot, index) => ({
    id: `${set.id}-${slot}`, setId: set.id, label: `${set.label} ${labels[index]}`, description: `${set.label} gear for a seasoned ${set.className.toLowerCase()}.`,
    slot, className: set.className, requiredLevel: set.requiredLevel, price: [55, 85, 65, 45, 60, 70, 65, 100][index] * [1, 2, 4, 7, 10][tier - 1],
    stats: stats[index], color: set.color, model: set.className === 'Cleric' ? (slot === 'charm' ? 'necklace' : slot === 'ring' ? 'ring' : `cleric-${slot === 'armor' ? 'body' : slot}`) : `${set.id}-${slot === 'armor' ? 'body' : slot === 'charm' ? 'necklace' : slot}`,
  }));
});

// Each band lists weapon, armor, head, legs, shoes, back, charm, ring.
// Item rows: name, primary damage, special damage, defense, description.
const dropGear: Gear[] = ([
  { className: 'Ranger', color: '#7e8956', bands: [
    [
      ['Branchhook Bow', 2, 1, 0, 'A bent ash limb with a fresh hemp string and a leather grip.'],
      ['Patchhide Jerkin', 0, 0, 1, 'Supple hide patched at the shoulder with sturdy saddle leather.'],
      ['Fernshade Hood', 1, 0, 1, 'A deep green hood that keeps stray branches clear of the eyes.'],
      ['Brushwalker Leggings', 0, 0, 1, 'Coarse linen with hide panels sewn over the knees.'],
      ['Deerskin Trail Boots', 1, 0, 0, 'Soft deerhide boots shaped by many woodland miles.'],
      ['Rainleaf Cloak', 1, 1, 0, 'Overlapping cloth panels shed the drizzle from low branches.'],
      ['Acorn Cord', 0, 2, 0, 'A polished acorn hangs from a braided cord of green thread.'],
      ['Carved Willow Band', 1, 0, 0, 'A smooth willow ring marked with a single arrow.'],
    ], [
      ['Hawkeye Recurve', 6, 3, 0, 'Horn tips and a balanced grip give this hunting bow a firm draw.'],
      ['Boarhide Hunting Vest', 0, 0, 3, 'Thick boarhide is layered across the ribs and breast.'],
      ['Foxwatch Hood', 2, 0, 1, 'A fitted leather brow keeps this fur-lined hood clear of the bowstring.'],
      ['Thornproof Leggings', 1, 0, 1, 'Close stitching and doubled hide reinforce the outer seams.'],
      ['Quietstep Boots', 2, 0, 0, 'Carefully fitted soles give an archer a steady stance.'],
      ['Oiled Hunter Cloak', 1, 2, 0, 'Waxed green canvas is clasped with a carved fox tooth.'],
      ['Falconclaw Talisman', 1, 3, 0, 'A silver-capped claw rests against a small disk of heartwood.'],
      ['Keeneye Copper Band', 2, 0, 0, 'A bright copper ring bears the watchful eye of a hunting hawk.'],
    ], [
      ['Seasoned Yew Bow', 7, 4, 0, 'Dark yew limbs hold their curve after seasons on the trail.'],
      ['Stitched Hartskin Vest', 1, 0, 2, 'Strong hartskin and a fitted shoulder leave the drawing arm free.'],
      ['Mossveil Hood', 2, 0, 1, 'Mottled wool covers a light leather brow guard.'],
      ['Waxed Briar Trousers', 2, 0, 1, 'Waxed cloth and tough knee patches withstand the tangled undergrowth.'],
      ['Ridgepath Boots', 2, 0, 0, 'Broad soles and tight ankle wraps support long hours on rocky trails.'],
      ['Weathered Huntcloak', 2, 1, 0, 'An old hunting cloak, carefully mended around its antler clasp.'],
      ['Polished Antler Charm', 1, 3, 0, 'A smooth antler point is etched with the marks of forest trails.'],
      ['Oakgrain Archer Band', 2, 1, 0, 'Dark oak is wrapped with a slender ribbon of beaten copper.'],
    ], [
      ['Silverstring Recurve', 10, 6, 0, 'A finely balanced recurve strung with silver-bound sinew.'],
      ['Greenwood Scout Jerkin', 1, 0, 3, 'Layered green leather protects the chest without binding the shoulders.'],
      ['Owlfeather Cowl', 2, 1, 1, 'A close-fitting cowl is trimmed with the barred feathers of a woodland owl.'],
      ['Razorleaf Leggings', 3, 0, 1, 'Leaf-shaped leather scales protect the thighs and knees.'],
      ['Foxwind Striders', 1, 1, 1, 'Fine foxhide boots have reinforced heels and supple ankle guards.'],
      ['Misttrail Cloak', 2, 2, 0, 'Pale green cloth carries a border of carefully stitched arrowheads.'],
      ['Heartwood Fang Pendant', 1, 4, 0, 'A wolf fang is set into living-green heartwood and bound with silver.'],
      ['Trueflight Signet', 3, 1, 0, 'A silver arrow crosses the polished green stone of this signet.'],
    ],
  ] },
  { className: 'Knight', color: '#939da3', bands: [
    [
      ['Notched Militia Sword', 3, 0, 0, 'A plain iron sword with a freshly honed edge beneath the old nicks.'],
      ['Quilted Watchcoat', 0, 0, 2, 'Thick wool padding cushions a village watchman beneath rough leather.'],
      ['Dented Kettle Helm', 0, 0, 1, 'A battered iron brim still shields the brow.'],
      ['Leatherbound Greaves', 0, 0, 1, 'Narrow iron plates are held to the shins by broad leather straps.'],
      ['Irontoe Marching Boots', 1, 0, 0, 'Workmanlike boots carry dull iron caps over the toes.'],
      ['Woolen Watchcape', 0, 1, 1, 'A heavy wool cape closes with the buckle of an old watch uniform.'],
      ['Old Guard Medallion', 1, 0, 0, 'A worn brass shield hangs from a length of honest iron chain.'],
      ['Hammered Tin Signet', 1, 0, 0, 'A plain shield has been hammered into the face of this sturdy ring.'],
    ], [
      ['Keenedge Arming Sword', 6, 3, 0, 'A tempered edge and a weighted pommel lend purpose to every cut.'],
      ['Riveted Guard Mail', 0, 0, 3, 'Small riveted rings spread a blow across the padded chest.'],
      ['Reinforced Brow Helm', 1, 0, 1, 'A second strip of iron strengthens the brow of this fitted helm.'],
      ['Steelstrap Greaves', 1, 0, 1, 'Curved steel plates protect the legs while leaving the knees free.'],
      ['Surefoot Sabatons', 1, 0, 1, 'Overlapping toe plates sit over firm, well-fitted boots.'],
      ['Boarhide Guard Cape', 0, 2, 1, 'A short cape of thick hide hangs from a pair of brass shield clasps.'],
      ['Oakshield Medallion', 1, 2, 0, 'An oak shield set in bronze bears the marks of a sworn protector.'],
      ['Steadfast Iron Band', 2, 0, 0, 'A broad iron band carries an unbroken line around its edge.'],
    ], [
      ['Honed Patrol Sword', 8, 3, 0, 'Repeated honing has given this dependable patrol blade a clean bite.'],
      ['Fieldwarden Hauberk', 1, 0, 3, 'A close-cut shirt of mail is reinforced along the sword arm.'],
      ['Ironrim War Helm', 0, 0, 2, 'A rolled iron rim strengthens the crown of this field helm.'],
      ['Braced Sentinel Greaves', 2, 0, 1, 'Braced shin plates are lined with worn but serviceable hide.'],
      ['Roughsteel Sabatons', 1, 0, 2, 'Practical steel footplates bear the scars of long patrols.'],
      ['Heavy Roadguard Cape', 0, 1, 2, 'Dense wool and leather shoulder panels stand up to hard travel.'],
      ['Bronze Rampart Token', 1, 1, 1, 'A square bronze token shows the gate of a woodland keep.'],
      ['Engraved Watch Signet', 2, 1, 0, 'The worn crest of the watch is cut deep into an iron ring.'],
    ], [
      ['Brightsteel Oathblade', 11, 5, 0, 'A bright, balanced blade bears a short oath along its fuller.'],
      ['Oakguard Brigandine', 1, 0, 4, 'Overlapping steel plates are riveted beneath tough green leather.'],
      ['Wolfcrest Bascinet', 2, 0, 1, 'A raised wolf crest crowns a carefully fitted steel helm.'],
      ['Ironbark War Greaves', 2, 1, 1, 'Deep steel ridges echo the bark of the oldest forest oaks.'],
      ['Stoneheel Sabatons', 1, 1, 2, 'Reinforced heels anchor the stance beneath polished steel footplates.'],
      ['Resolute Banner Cape', 0, 2, 2, 'A silver-edged cape bears the upright blade of an unbroken guard.'],
      ['Lionheart Ward Medallion', 1, 2, 1, 'A lion is cast in warm bronze above a small shield of steel.'],
      ['Bulwark Silver Signet', 3, 1, 0, 'A broad silver face carries the crenellations of a mighty wall.'],
    ],
  ] },
  { className: 'Mage', color: '#a18bbb', bands: [
    [
      ['Hazel Sparkstaff', 1, 2, 0, 'A small quartz splinter is bound into the fork of a hazel branch.'],
      ['Mended Linen Robes', 0, 1, 1, 'Old linen robes retain a few careful stitches of warding thread.'],
      ['Mothwing Scholar Cap', 0, 1, 0, 'A soft cap is embroidered with a tiny silver moth.'],
      ['Inkstained Breeches', 0, 0, 1, 'Sturdy cloth bears ink stains from years beside a writing desk.'],
      ['Softsole Felt Slippers', 0, 1, 0, 'A simple rune is sewn into each warm felt sole.'],
      ['Ashcloth Shoulder Mantle', 0, 2, 0, 'Faded ash-grey cloth holds a faint trace of old spellwork.'],
      ['Quartz Chip Pendant', 0, 2, 0, 'A cloudy quartz chip hangs in a small cage of copper wire.'],
      ['Pewter Rune Ring', 0, 1, 0, 'A single practice rune is carved into a narrow pewter ring.'],
    ], [
      ['Glimmerroot Staff', 5, 4, 0, 'A clear crystal glimmers between the curled roots of this balanced staff.'],
      ['Spellstitched Field Robes', 0, 2, 1, 'Fresh warding stitches strengthen a practical travelling robe.'],
      ['Moonthread Pointed Hat', 0, 2, 0, 'A crescent of pale thread circles the brim of a pointed hat.'],
      ['Warded Scholar Trousers', 0, 1, 1, 'Small protective runes line the seams beneath violet cloth.'],
      ['Runesole Slippers', 0, 2, 0, 'Copper-thread runes trace a careful pattern beneath each foot.'],
      ['Emberlined Travel Mantle', 0, 3, 0, 'A muted red lining is stitched with sparks of golden thread.'],
      ['Dewglass Focus Pendant', 0, 3, 1, 'A clear glass droplet gathers light within a warded copper frame.'],
      ['Copper Sparkcoil Ring', 0, 3, 0, 'A tight copper coil surrounds a bright fleck of charged quartz.'],
    ], [
      ['Seasoned Rowan Staff', 5, 8, 0, 'A well-used rowan staff carries deep channels for focusing spellwork.'],
      ['Violet Wayfarer Robes', 0, 3, 1, 'Layered violet cloth conceals sturdy seams and practical warding knots.'],
      ['Deepbrim Runic Hat', 0, 2, 1, 'A reinforced brim shades a band of weathered silver runes.'],
      ['Silverstitched Breeches', 0, 2, 1, 'Silver-thread wards run down both legs of these stout breeches.'],
      ['Cloudfelt Walking Shoes', 1, 1, 1, 'Dense felt cushions leather soles marked with curling sky runes.'],
      ['Duskwool Spell Mantle', 0, 3, 0, 'Dark wool holds its embroidered spell circles despite years of wear.'],
      ['Smoky Crystal Locket', 1, 3, 0, 'Smoky quartz rests in a hinged locket etched with a focusing spiral.'],
      ['Etched Amethyst Band', 0, 3, 0, 'A small amethyst sits above a ring of carefully renewed runes.'],
    ], [
      ['Starbud Channeling Staff', 7, 13, 0, 'A star-shaped crystal blooms from the silver-bound crown of this staff.'],
      ['Witchwood Spell Robes', 0, 4, 1, 'Fine violet robes carry layered wards in a pattern of silver branches.'],
      ['Twilight Crystal Hat', 1, 2, 1, 'A pale violet crystal is set above the finely stitched brim.'],
      ['Spellguard Silk Trousers', 0, 3, 1, 'Strong silk holds a close lattice of silver warding thread.'],
      ['Glimmerstep Shoes', 1, 1, 2, 'Polished crystal clasps fasten shoes sewn with precise focusing runes.'],
      ['Moonfire Scholar Mantle', 0, 4, 1, 'Pale blue spell circles shimmer against a deep violet lining.'],
      ['Clearheart Prism Pendant', 1, 4, 0, 'A carefully cut prism directs light through a silver focusing cage.'],
      ['Spellwell Silver Ring', 1, 3, 0, 'Concentric silver circles surround a deep, clear violet stone.'],
    ],
  ] },
  { className: 'Cleric', color: '#d9c899', bands: [
    [
      ['Beechwood Prayer Mace', 1, 2, 0, 'A brass sun caps a sturdy beechwood handle wrapped in prayer cloth.'],
      ['Homespun Shrine Vestments', 0, 1, 1, 'Warm homespun cloth bears the simple sun of a roadside shrine.'],
      ['Linen Vigil Cowl', 0, 1, 1, 'A padded linen cowl carries a small candle stitched above the brow.'],
      ['Mended Chapel Leggings', 0, 0, 1, 'Plain chapel cloth is reinforced with careful patches at the knees.'],
      ['Ropebound Pilgrim Sandals', 0, 1, 0, 'Braided prayer cords secure thick leather soles.'],
      ['Woolen Mercy Mantle', 0, 1, 1, 'A warm wool mantle closes with a modest wooden sun clasp.'],
      ['Small Sunwheel Pendant', 0, 2, 0, 'A tiny brass sunwheel has been polished by generations of prayers.'],
      ['Plain Devotion Band', 0, 1, 0, 'A narrow brass ring bears a small, carefully engraved sun.'],
    ], [
      ['Consecrated Copper Mace', 4, 6, 0, 'A copper sunburst has been blessed and balanced on a firm oak haft.'],
      ['Blessed Wayside Vestments', 1, 1, 1, 'Reinforced ivory cloth is edged with a quiet line of golden prayer.'],
      ['Lightkeeper Prayer Cowl', 0, 2, 1, 'A golden sun sits above the padded brow of this ivory cowl.'],
      ['Guarded Pilgrim Leggings', 0, 1, 1, 'Prayer-stitched knee panels strengthen these travelling leggings.'],
      ['Softlight Walking Sandals', 0, 1, 1, 'Layered leather soles and blessed straps support long pilgrimages.'],
      ['Goldthread Mercy Mantle', 0, 2, 1, 'Golden thread outlines open hands along the edge of a warm mantle.'],
      ['Amber Prayer Locket', 0, 3, 1, 'A honey-coloured stone rests beside a tiny scroll of blessing.'],
      ['Faithkeeper Bronze Ring', 0, 2, 1, 'A raised bronze sun shelters a small ivory stone.'],
    ], [
      ['Brass Dawn Bell Mace', 5, 9, 0, 'A solid brass sun echoes the shape of a chapel bell.'],
      ['Stoutcloth Hospice Vestments', 1, 2, 1, 'Practical layers of cream cloth are lined with a protective prayer.'],
      ['Candlewoven Vigil Cowl', 0, 2, 1, 'Pale candle patterns circle the reinforced edge of a serviceable cowl.'],
      ['Ivory Roadward Leggings', 1, 1, 1, 'Thick ivory cloth and guarded seams withstand a long road.'],
      ['Surestep Shrine Sandals', 1, 1, 1, 'Wide straps bear the worn sun marks of several woodland shrines.'],
      ['Warm Hearthkeeper Mantle', 0, 1, 2, 'A thick travel mantle is fastened with a bronze hearth emblem.'],
      ['Carved Laurel Reliquary', 0, 3, 1, 'A small laurel case preserves a prayer beneath its polished wooden lid.'],
      ['Polished Sunstone Band', 1, 2, 0, 'A warm orange sunstone is set into a broad, well-worn brass band.'],
    ], [
      ['Radiant Oakheart Mace', 6, 13, 0, 'A bright golden sunburst crowns a silver-bound heartwood haft.'],
      ['Dawnbound Healing Vestments', 1, 3, 1, 'Fine ivory vestments carry golden prayers above a protective teal lining.'],
      ['Suncrest Sacred Cowl', 0, 2, 2, 'A radiant sun crest rests above a softly padded, silver-edged cowl.'],
      ['Gracewoven Warden Leggings', 1, 2, 1, 'Layers of prayer-woven cloth guard the knees beneath golden stitching.'],
      ['Blessed Lantern Sandals', 1, 1, 2, 'Strong leather and gold sun clasps carry the blessing of a lantern shrine.'],
      ['Brightfeather Sanctuary Mantle', 0, 2, 2, 'Ivory feather embroidery surrounds a strong clasp shaped like open wings.'],
      ['Livinglight Laurel Pendant', 0, 4, 1, 'A warm golden stone rests within a wreath of silver laurel leaves.'],
      ['Mercyglow Silver Ring', 1, 2, 1, 'A pale sunstone gleams between two small silver hands.'],
    ],
  ] },
] as const).flatMap(profile => profile.bands.flatMap((items, index) => {
  const requiredLevel = [1, 3, 8, 10][index], quality = index % 2 ? 'uncommon' : 'common';
  return (['weapon', 'armor', 'head', 'legs', 'shoes', 'back', 'charm', 'ring'] as const).map((slot, slotIndex) => {
    const [label, primaryDamage, specialDamage, defense, description] = items[slotIndex];
    const id = `drop-${profile.className.toLowerCase()}-${quality}-${requiredLevel}-${slot}`;
    return {
      id, label, description, icon: id, slot, className: profile.className, requiredLevel, quality, dropOnly: true, color: profile.color,
      stats: { ...(primaryDamage ? { primaryDamage } : {}), ...(specialDamage ? { specialDamage } : {}), ...(defense ? { defense } : {}) },
      price: [28, 24, 16, 20, 16, 20, 20, 16][slotIndex] * [1, 2, 3, 4][index],
      model: `drop-${profile.className.toLowerCase()}-${quality}-${slot === 'armor' ? 'body' : slot === 'charm' ? 'necklace' : slot}`,
    };
  });
}));

export const GEAR: Record<string, Gear> = Object.fromEntries(([
  { id: 'death-horns', label: 'Death Horns', description: 'The ridged horns of the Horned Apostle. Earned only from a full raid clear.', slot: 'head', className: null, price: 0, sellPrice: 0, requiredLevel: 60, stats: {defense: 14, stamina: 12, spirit: 8}, color: '#cda958', quality: 'legendary', dropOnly: true, icon: 'death-horns' },
  { id: 'cleric-mace', label: 'Acolyte sun mace', description: 'A small sun-forged focus for holy magic.', slot: 'weapon', className: 'Cleric', price: 0, requiredLevel: 1, stats: {}, color: '#d8b46a', model: 'cleric-weapon' },
  { id: 'cleric-robes', label: 'Acolyte vestments', description: 'Ivory vestments with a teal stole and a book of prayers.', slot: 'armor', className: 'Cleric', price: 0, requiredLevel: 1, stats: {}, color: '#e8ddbf', model: 'cleric-body' },
  { id: 'dawnlight-mace', label: 'Dawnlight mace', description: 'A golden sun that focuses healing and holy damage.', slot: 'weapon', className: 'Cleric', price: 65, requiredLevel: 2, stats: {primaryDamage: 4, specialDamage: 5}, color: '#eccd78', model: 'cleric-weapon' },
  { id: 'dawnweave-robes', label: 'Dawnweave vestments', description: 'Reinforced vestments for a healer on the open road.', slot: 'armor', className: 'Cleric', price: 50, requiredLevel: 2, stats: {defense: 2}, color: '#d6e3c7', model: 'cleric-body' },
  { id: 'ranger-bow', label: 'Trail bow', description: 'A trusted bow for your first journey.', slot: 'weapon', className: 'Ranger', price: 0, requiredLevel: 1, stats: {}, color: '#a16e3e' },
  { id: 'knight-sword', label: 'Keeper sword', description: 'A simple blade with a steady edge.', slot: 'weapon', className: 'Knight', price: 0, requiredLevel: 1, stats: {}, color: '#bdcbd0' },
  { id: 'mage-staff', label: 'Apprentice staff', description: 'A little starlight, carefully held.', slot: 'weapon', className: 'Mage', price: 0, requiredLevel: 1, stats: {}, color: '#91d4df' },
  { id: 'ranger-tunic', label: 'Trail tunic', description: 'Light clothes for an open road.', slot: 'armor', className: 'Ranger', price: 0, requiredLevel: 1, stats: {}, color: '#577956' },
  { id: 'knight-mail', label: 'Keeper mail', description: 'The first armor of a village protector.', slot: 'armor', className: 'Knight', price: 0, requiredLevel: 1, stats: {}, color: '#899ba3' },
  { id: 'mage-robes', label: 'Apprentice robes', description: 'Robes woven for an eager scholar.', slot: 'armor', className: 'Mage', price: 0, requiredLevel: 1, stats: {}, color: '#8477ba' },
  { id: 'warden-longbow', label: 'Warden longbow', description: 'A carved bow strung with silver thread.', slot: 'weapon', className: 'Ranger', price: 65, requiredLevel: 2, stats: { primaryDamage: 5, specialDamage: 3 }, color: '#d7b052' },
  { id: 'sunsteel-sword', label: 'Sunsteel sword', description: 'A bright blade forged beside the Amber Beacon.', slot: 'weapon', className: 'Knight', price: 65, requiredLevel: 2, stats: { primaryDamage: 5, specialDamage: 3 }, color: '#e6c56c' },
  { id: 'starfall-staff', label: 'Starfall staff', description: 'A staff crowned with a fragment of the winter sky.', slot: 'weapon', className: 'Mage', price: 65, requiredLevel: 2, stats: { primaryDamage: 5, specialDamage: 3 }, color: '#b194ee' },
  { id: 'ranger-mantle', label: 'Warden mantle', description: 'Layered leather for the deeper woodland.', slot: 'armor', className: 'Ranger', price: 50, requiredLevel: 2, stats: { defense: 2 }, color: '#355c47' },
  { id: 'sunsteel-plate', label: 'Sunsteel plate', description: 'Hammered plates edged in lantern gold.', slot: 'armor', className: 'Knight', price: 50, requiredLevel: 2, stats: { defense: 2 }, color: '#778fa9' },
  { id: 'starwoven-robes', label: 'Starwoven robes', description: 'An enchanted weave that softens each blow.', slot: 'armor', className: 'Mage', price: 50, requiredLevel: 2, stats: { defense: 2 }, color: '#654a98' },
  { id: 'lantern-charm', label: 'Lantern charm', description: 'A small light that lends courage to every traveler.', slot: 'charm', className: null, price: 35, requiredLevel: 1, stats: { specialDamage: 3, defense: 1 }, color: '#f2c36b' },
  { id: 'rootforged-charm', label: 'Rootforged sigil', description: 'Forged from relics recovered in the Rootvault.', slot: 'charm', className: null, price: 0, sellPrice: 25, requiredLevel: 3, stats: { primaryDamage: 5, specialDamage: 8, defense: 3 }, color: '#a7dfb3' },
  { id: 'copper-ring', label: 'Copper band', description: 'A sturdy band worn by travelers.', slot: 'ring', className: null, price: 25, requiredLevel: 1, stats: { primaryDamage: 1 }, color: '#ce9860', model: 'ring' },
  { id: 'star-ring', label: 'Starlight ring', description: 'A pale stone that holds a spark of magic.', slot: 'ring', className: null, price: 45, requiredLevel: 1, stats: { specialDamage: 2 }, color: '#a9ceeb', model: 'ring' },
  ...([
    { className: 'Cleric', color: '#e8ddbf', labels: ['Acolyte cowl', 'Pilgrim leggings', 'Dawn sandals', 'Sunlit mantle'] },
    { className: 'Ranger', color: '#577956', labels: ['Trail hood', 'Warden leggings', 'Pathfinder boots', 'Woodland cloak'] },
    { className: 'Knight', color: '#899ba3', labels: ['Keeper helm', 'Steel greaves', 'Marching sabatons', 'Vanguard cape'] },
    { className: 'Mage', color: '#8477ba', labels: ['Scholar hat', 'Runic trousers', 'Starwoven shoes', 'Astral mantle'] },
  ] as const).flatMap(({ className, color, labels }) => (['head', 'legs', 'shoes', 'back'] as const).map((slot, index) => ({
    id: `${className.toLowerCase()}-${slot}`, label: labels[index], description: `Made for a ${className.toLowerCase()} exploring the wilds.`, slot, className,
    price: [25, 30, 20, 38][index], requiredLevel: 1, stats: ([{ defense: 1 }, { defense: 1 }, { primaryDamage: 1 }, { specialDamage: 2 }] as StatBonuses[])[index],
    color, model: `${className.toLowerCase()}-${slot}`,
  }))),
  ...dropGear,
  ...setGear,
] satisfies Gear[]).map(item => [item.id, { ...item, ...(!item.model && item.slot === 'armor' ? { model: `${item.className!.toLowerCase()}-body` } : !item.model && item.slot === 'charm' ? { model: 'necklace' } : {}) } ]));

// Catalog attributes are additive: existing damage, armor and version 1 affixes retain their values.
for (const gear of Object.values(GEAR)) {
  if (gear.price <= 0 && !gear.sellPrice) continue;
  const budget = Math.max(1, Math.ceil(gear.requiredLevel / 12));
  if (gear.className) gear.stats[classAttribute(gear.className)] = budget * (gear.slot === 'weapon' ? 2 : 1);
  if (['armor', 'head', 'legs'].includes(gear.slot) || !gear.className) gear.stats.stamina = budget * (gear.slot === 'armor' ? 2 : 1);
  if (['back', 'charm', 'ring'].includes(gear.slot) && (!gear.className || ['Mage', 'Cleric'].includes(gear.className))) gear.stats.spirit = budget;
}

export const MAX_GEAR_UPGRADE = 5;
export function gearQuality(gear: Gear): GearQuality {
  return gear.quality ?? (gear.id === 'rootforged-charm' ? 'rare' : gear.setId ? gear.requiredLevel >= 40 ? 'epic' : gear.requiredLevel >= 25 ? 'rare' : 'uncommon'
    : gear.requiredLevel === 1 || gear.price === 0 ? 'common' : 'uncommon');
}
function gearRollMaximum(base: Gear, quality: GearQuality, stat: keyof StatBonuses) {
  const tier = GEAR_QUALITIES.indexOf(quality);
  return stat === 'speed' ? 1 + Math.ceil(tier / 2) : 1 + tier + Math.floor(base.requiredLevel / 12);
}
function gearBaseAtLevel(base: Gear, level: number): Gear {
  return level === base.requiredLevel ? base : { ...base, requiredLevel: level,
    stats: Object.fromEntries(Object.entries(base.stats).map(([stat, value]) => [stat, Math.ceil(value * level / base.requiredLevel)])) };
}
/** A versioned, bounded identity carries the roll through saves, trades and auctions without a second inventory format. */
export function gearById(id: unknown): Gear | undefined {
  if (typeof id !== 'string' || id.length > 120) return;
  if (Object.hasOwn(GEAR, id)) return GEAR[id];
  const match = /^([a-z0-9-]+)~([12345])~(common|uncommon|rare|epic|legendary|mythic)~([0-9a-f]{16}|-)~(?:([1-9][0-9]?)~)?([0-5])$/.exec(id);
  if (!match || !Object.hasOwn(GEAR, match[1])) return;
  const template = GEAR[match[1]], version = Number(match[2]), quality = match[3] as GearQuality, upgradeLevel = Number(match[6]), rolled = version !== 5 && match[4] !== '-';
  // v5 gives fixed-stat drops separate identities without adding random bonuses.
  if (version === 5 && (match[4] === '-' || quality !== gearQuality(template))) return;
  // v3 extends level-50 templates through 60; v4 fills the level-25/40 tier gaps. Older identities keep their stats.
  if (version === 3 ? !rolled || template.requiredLevel !== 50 || !match[5] || Number(match[5]) <= 50 || Number(match[5]) > 60
    : version === 4 ? !rolled || ![25, 40].includes(template.requiredLevel) || !match[5] || Number(match[5]) <= template.requiredLevel || Number(match[5]) >= (template.requiredLevel === 25 ? 40 : 50)
    : !!match[5]) return;
  const base = gearBaseAtLevel(template, Number(match[5] ?? template.requiredLevel));
  if (base.price <= 0 && !base.sellPrice || !rolled && (upgradeLevel === 0 && version !== 5 || quality !== gearQuality(base))) return;
  const stats = { ...base.stats }, tier = GEAR_QUALITIES.indexOf(quality);
  if (rolled) {
    // The seed is persisted, so these integer operations must stay stable for version 1 IDs.
    let seed = (parseInt(match[4].slice(0, 8), 16) ^ parseInt(match[4].slice(8), 16)) >>> 0;
    const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 0x100000000);
    const keys: (keyof StatBonuses)[] = ['primaryDamage', 'specialDamage', 'damage', 'defense', 'speed'];
    if (version >= 2) keys.push(...(base.className ? [classAttribute(base.className)] : []), 'stamina', 'spirit');
    for (let count = 0; count < Math.min(5, tier + 1); count++) {
      const key = keys.splice(Math.floor(random() * keys.length), 1)[0];
      const maximum = gearRollMaximum(base, quality, key);
      stats[key] = (stats[key] ?? 0) + 1 + Math.floor(random() * maximum);
    }
  }
  for (const key of Object.keys(stats) as (keyof StatBonuses)[]) stats[key]! += upgradeLevel * Math.max(1, Math.ceil(stats[key]! * .1));
  return { ...base, id, baseId: base.id, quality, upgradeLevel, randomized: rolled, stats, dropOnly: true,
    label: `${rolled ? quality[0].toUpperCase() + quality.slice(1) + ' ' : ''}${base.label}${upgradeLevel ? ` +${upgradeLevel}` : ''}`,
    description: `${base.description}${rolled ? ' Its bonus attributes were rolled when it dropped.' : ''} Upgrade with materials and gold up to +${MAX_GEAR_UPGRADE}.`,
    sellPrice: (base.sellPrice ?? Math.max(1, Math.floor(base.price / 4))) + (rolled ? (tier + 1) * 3 : 0) + upgradeLevel * 5 };
}
export const gearIdValid = (id: unknown): id is string => !!gearById(id);
/** Inspect the same versioned roll and upgrade calculation used for the owned item. */
export function gearStatBreakdown(id: unknown) {
  const gear = gearById(id);
  if (!gear) return [];
  const base = gearBaseAtLevel(GEAR[gear.baseId ?? gear.id], gear.requiredLevel);
  const unupgraded = gear.randomized ? gearById(gear.id.slice(0, -1) + '0')! : base;
  return (Object.keys(gear.stats) as (keyof StatBonuses)[]).map(stat => {
    const fixed = base.stats[stat] ?? 0, beforeUpgrade = unupgraded.stats[stat] ?? 0, roll = beforeUpgrade - fixed;
    return { stat, base: fixed, roll, min: roll ? 1 : 0, max: roll ? gearRollMaximum(base, gearQuality(gear), stat) : 0,
      upgrade: gear.stats[stat]! - beforeUpgrade, total: gear.stats[stat]! };
  });
}
const gearSeed = (random: () => number) => Array.from({ length: 2 }, () => Math.floor(random() * 0x100000000).toString(16).padStart(8, '0')).join('');
export function copyGear(baseId: string, random = Math.random): Gear {
  const base = Object.hasOwn(GEAR, baseId) ? GEAR[baseId] : undefined;
  const gear = base && gearById(`${baseId}~5~${gearQuality(base)}~${gearSeed(random)}~0`);
  if (!gear) throw new Error('Invalid gear copy');
  return gear;
}
export function rollGear(baseId: string, quality: GearQuality, random = Math.random, level = GEAR[baseId]?.requiredLevel): Gear {
  const seed = gearSeed(random);
  const scaled = level !== GEAR[baseId]?.requiredLevel;
  const gear = gearById(`${baseId}~${scaled ? GEAR[baseId]?.requiredLevel === 50 ? 3 : 4 : 2}~${quality}~${seed}~${scaled ? `${level}~` : ''}0`);
  if (!gear) throw new Error('Invalid gear roll');
  return gear;
}
export function gearUpgradeQuote(id: unknown): { gold: number; materials: Partial<Record<'wood' | 'crystal' | 'herb' | 'relic', number>>; nextId: string; next: Gear } | null {
  const gear = gearById(id), level = (gear?.upgradeLevel ?? 0) + 1;
  if (!gear || gear.price <= 0 && !gear.sellPrice || level > MAX_GEAR_UPGRADE) return null;
  const quality = gearQuality(gear), tier = GEAR_QUALITIES.indexOf(quality);
  const nextId = gear.baseId ? gear.id.slice(0, -1) + level : `${gear.id}~2~${quality}~-~${level}`;
  return { gold: (20 + gear.requiredLevel * 5) * level * level,
    materials: { crystal: (tier + 1) * level * 2, wood: level * (gear.slot === 'weapon' ? 3 : 2), herb: level,
      ...(level >= 3 || tier >= 3 ? { relic: Math.max(1, tier - 1) * level } : {}) }, nextId, next: gearById(nextId)! };
}
/** Return a projected owner. The server commits the material debit and identity replacement together. */
export function upgradeGear<T extends Pick<Player, 'ownedGear' | 'equipment' | 'gold' | 'inventory' | 'appearance' | 'level' | 'bank' | 'auctions' | 'lockedItems'>>(player: T, id: unknown): T | null {
  const quote = gearUpgradeQuote(id);
  if (!quote || typeof id !== 'string' || !player.ownedGear.includes(id) || player.ownedGear.includes(quote.nextId)
    || quote.next.requiredLevel > player.level || quote.next.className && quote.next.className !== player.appearance.className
    || player.bank?.gear.includes(quote.nextId) || player.auctions?.some(listing => listing.item.kind === 'gear' && listing.item.id === quote.nextId)
    || !Number.isSafeInteger(player.gold) || player.gold < quote.gold
    || Object.entries(quote.materials).some(([key, amount]) => !Number.isSafeInteger(player.inventory[key as keyof typeof quote.materials]) || player.inventory[key as keyof typeof quote.materials] < amount)) return null;
  const inventory = { ...player.inventory };
  for (const [key, amount] of Object.entries(quote.materials)) inventory[key as keyof typeof quote.materials] -= amount;
  return { ...player, ...(player.lockedItems ? { lockedItems: [...new Set(player.lockedItems.map(locked => locked === id ? quote.nextId : locked))] } : {}), gold: player.gold - quote.gold, inventory, ownedGear: player.ownedGear.map(owned => owned === id ? quote.nextId : owned),
    equipment: Object.fromEntries(Object.entries(player.equipment).map(([slot, equipped]) => [slot, equipped === id ? quote.nextId : equipped])) as unknown as Equipment };
}
export function gearSpeedMultiplier(player: Pick<Player, 'equipment'>): number {
  return 1 + Math.min(20, Object.values(player.equipment).reduce((sum, id) => sum + (gearById(id)?.stats.speed ?? 0), 0)) / 100;
}

export function gearFitsSlot(itemId: string, slot: EquipmentSlot): boolean {
  const item = gearById(itemId);
  return !!item && EQUIPMENT_SLOTS.includes(slot) && (item.slot === 'ring' ? slot === 'ring1' || slot === 'ring2' : item.slot === slot);
}
export function equipmentSlotFor(equipment: Equipment, itemId: string): EquipmentSlot | undefined {
  const item = gearById(itemId);
  if (!item) return;
  if (item.slot !== 'ring') return item.slot;
  return equipment.ring1 === itemId ? 'ring1' : equipment.ring2 === itemId ? 'ring2' : !equipment.ring1 ? 'ring1' : !equipment.ring2 ? 'ring2' : 'ring1';
}

const talentProfiles = [
  { className: 'Ranger', branches: ['Marksmanship', 'Pathfinder', 'Survival'],
    legacy: ['Steady aim', 'Volley', 'Eagle eye', 'Sure footing', 'Trail ward', 'Forest guardian'],
    additions: [
      ['Draw strength', 'Split shafts', 'Piercing arrows', 'Perfect release', 'Arrowstorm', 'Master archer'],
      ['Hide padding', 'Thorn guard', 'Rooted stance', 'Briar mantle', 'Wild reprisal', 'Ancient protector'],
      ['Hunter’s instinct', 'Prepared ambush', 'Endurance', 'Honed arrowheads', 'Venom craft', 'Thick hide', 'Relentless hunter', 'Living thorns', 'Heart of the wild'],
    ] },
  { className: 'Knight', branches: ['Vanguard', 'Sentinel', 'Warlord'],
    legacy: ['Keen edge', 'Cleave', 'Sunbreaker', 'Brace', 'Iron resolve', 'Unbroken'],
    additions: [
      ['Weapon drills', 'Sweeping force', 'Tempered edge', 'Crushing blows', 'Steel tempest', 'Blade champion'],
      ['Shield training', 'Defiant strike', 'Layered mail', 'Iron bulwark', 'Unyielding force', 'Adamant guardian'],
      ['Battle rhythm', 'Commanding force', 'Veteran’s guard', 'Heavy strikes', 'Siegebreaker', 'Battleplate', 'Conqueror’s edge', 'War standard', 'Lord of battle'],
    ] },
  { className: 'Mage', branches: ['Spellfire', 'Warding', 'Frostweaving'],
    legacy: ['Arcane focus', 'Starburst', 'Spellweaver', 'Light ward', 'Runic shelter', 'Starlit aegis'],
    additions: [
      ['Ember study', 'Volatile magic', 'Searing focus', 'White flame', 'Astral inferno', 'Archmage’s fire'],
      ['Woven barrier', 'Runic retaliation', 'Crystal skin', 'Prismatic mantle', 'Aegis surge', 'Eternal ward'],
      ['Ice shaping', 'Frozen surge', 'Glacial armor', 'Shard focus', 'Winter’s power', 'Rime barrier', 'Shattering force', 'Winter mantle', 'Heart of winter'],
    ] },
  { className: 'Cleric', branches: ['Radiance', 'Devotion', 'Judgment'],
    legacy: ['Holy focus', 'Bright prayer', 'Lightbearer', 'Merciful ward', 'Steady faith', 'Sanctuary'],
    additions: [
      ['Dawn study', 'Healing light', 'Luminous will', 'Bountiful grace', 'Sunlit spirit', 'Beacon of hope'],
      ['Sacred resolve', 'Guarded prayer', 'Woven blessings', 'Protective faith', 'Radiant aegis', 'Unbroken devotion'],
      ['Zealous strike', 'Searing word', 'Pilgrim guard', 'Holy fire', 'Righteous force', 'Sanctified armor', 'Judgment of dawn', 'Resolute spirit', 'Herald of light'],
    ] },
] as const;
// Retain old IDs and prerequisites so legacy builds can be validated before refunding.
const legacyTalentStats: StatBonuses[] = [{ primaryDamage: 3 }, { specialDamage: 6 }, { primaryDamage: 5, specialDamage: 4 }, { defense: 1 }, { defense: 1, specialDamage: 2 }, { defense: 2, primaryDamage: 2 }];
const branchStats: StatBonuses[][] = [
  [{ primaryDamage: 1 }, { specialDamage: 2 }, { primaryDamage: 1 }, { primaryDamage: 2 }, { specialDamage: 3 }, { primaryDamage: 4, specialDamage: 6 }],
  [{ defense: 1 }, { primaryDamage: 1, specialDamage: 1 }, { defense: 1 }, { defense: 1, specialDamage: 1 }, { primaryDamage: 1, specialDamage: 2 }, { defense: 2, specialDamage: 4 }],
  [{ primaryDamage: 1 }, { specialDamage: 2 }, { defense: 1 }, { primaryDamage: 1 }, { specialDamage: 2 }, { defense: 1 }, { primaryDamage: 2, specialDamage: 1 }, { defense: 1, specialDamage: 2 }, { primaryDamage: 3, specialDamage: 4, defense: 1 }],
];
const talentList: Talent[] = [];
for (const profile of talentProfiles) for (const [branchIndex, branch] of profile.branches.entries()) {
  const prefix = profile.className.toLowerCase(), branchId = branch.toLowerCase();
  const center = [0, 1, 2].map(index => branchIndex < 2 ? `${prefix}-${branchIndex * 3 + index + 1}` : `${prefix}-${branchId}-${index + 1}`);
  const flank = [0, 1, 2, 3, 4, 5].map(index => `${prefix}-${branchId}-${index + (branchIndex === 2 ? 4 : 1)}`);
  const add = (id: string, label: string, stats: StatBonuses, row: number, column: number, maxRank: number, requiredLevel: number, requiredBranchPoints: number, prerequisite: string | null, prerequisiteRank = 0) => {
    talentList.push({ id, label, stats, className: profile.className, branch, row, column, maxRank, requiredLevel, requiredBranchPoints, prerequisite, prerequisiteRank,
      description: Object.entries(stats).map(([stat, amount]) => `+${amount} ${stat === 'primaryDamage' ? 'primary damage' : stat === 'specialDamage' ? 'special damage' : 'defense'}`).join(' · ') + (maxRank > 1 ? ' per rank' : ''),
    });
  };
  for (let row = 0; row < 3; row++) {
    const legacy = branchIndex < 2, index = branchIndex * 3 + row;
    add(center[row], legacy ? profile.legacy[index] : profile.additions[2][row], legacy ? legacyTalentStats[index] : branchStats[2][row], row, 1,
      legacy ? 1 : [3, 2, 2][row], legacy ? row + 1 : [1, 3, 6][row], legacy ? row : [0, 3, 5][row], row ? center[row - 1] : null, row ? legacy ? 1 : [3, 2][row - 1] : 0);
  }
  const labels = profile.additions[branchIndex], stats = branchStats[branchIndex], start = branchIndex === 2 ? 3 : 0;
  add(flank[0], labels[start], stats[start], 0, 0, 3, 1, 0, null);
  add(flank[1], labels[start + 1], stats[start + 1], 1, 2, 2, 3, 3, flank[0], 2);
  add(flank[2], labels[start + 2], stats[start + 2], 2, 0, 3, 6, 5, center[1], branchIndex === 2 ? 2 : 1);
  add(flank[3], labels[start + 3], stats[start + 3], 3, 0, 2, 9, 8, flank[2], 2);
  add(flank[4], labels[start + 4], stats[start + 4], 3, 2, 2, 9, 8, center[2], branchIndex === 2 ? 2 : 1);
  add(flank[5], labels[start + 5], stats[start + 5], 4, 1, 1, 13, 12, flank[4], 2);
}
for (const talent of talentList) {
  const oldBranch = talent.branch, tier = talent.row === 4 ? 15 : talent.row >= 2 ? 3 : 2;
  if (talent.className === 'Mage') {
    talent.branch = oldBranch === 'Spellfire' ? 'Fire' : oldBranch === 'Warding' ? 'Arcane' : 'Frost';
    const school = talent.branch.toLowerCase() as 'fire' | 'arcane' | 'frost';
    const theme = talent.column === 2 ? school === 'fire' ? 'periodic' : school === 'frost' ? 'chilled' : 'casting' : school;
    talent.spellBonuses = { [theme]: tier };
    talent.stats = {};
    const labels = { Fire: ['Kindling','Flame study','Searing focus','Living flame','Inferno'], Frost: ['Ice shaping','Winter study','Glacial focus','Shattering cold','Heart of winter'], Arcane: ['Arcane focus','Ley study','Concentration','Astral power','Archmage'] };
    talent.label = `${labels[talent.branch as keyof typeof labels][talent.row]}${talent.column === 0 ? ' mastery' : talent.column === 2 ? ' surge' : ''}`;
  } else if (talent.className === 'Ranger' && oldBranch !== 'Pathfinder') {
    const theme = oldBranch === 'Survival' ? talent.column === 2 ? 'periodic' : 'poison' : talent.column === 2 ? 'instant' : 'direct';
    talent.branch = oldBranch === 'Survival' ? 'Venom' : 'Marksmanship';
    talent.spellBonuses = { [theme]: tier }; talent.stats = {};
    if (oldBranch === 'Survival') talent.label = `${['Venom craft','Serpent study','Toxic arrows','Lingering venom','Master poisoner'][talent.row]}${talent.column === 0 ? ' mastery' : talent.column === 2 ? ' surge' : ''}`;
  } else if (talent.className === 'Cleric') {
    talent.spellBonuses = { [oldBranch === 'Radiance' ? 'healing' : oldBranch === 'Devotion' ? 'shielding' : 'holy']: tier };
    talent.stats = oldBranch === 'Devotion' && talent.stats.defense ? { defense: talent.stats.defense } : {};
  } else if (talent.className === 'Knight' && oldBranch !== 'Sentinel') {
    talent.spellBonuses = { [oldBranch === 'Vanguard' ? 'physical' : 'casting']: tier };
    talent.stats = {};
  }
  if (talent.spellBonuses) talent.description = Object.entries(talent.spellBonuses).map(([key, value]) => `+${value}% ${SPELL_BONUS_LABELS[key as keyof SpellBonuses]}`).join(' · ') + (talent.stats.defense ? ` · +${talent.stats.defense} defense` : '') + (talent.maxRank > 1 ? ' per rank' : '');
}
// Keep the previous layout for fail-closed validation before a free build refund.
const PREVIOUS_TALENTS: Record<string, Talent> = Object.fromEntries(talentList.map(talent => [talent.id, { ...talent }]));
const signatures = [
  { signature:TALENT_EFFECT_IDS.twinshot, augment:TALENT_EFFECT_IDS.twinshotMomentum, ability:'twinshot', label:'Twinshot',
    description:'Basic attacks have a 20% chance to fire a second shot. Bonus shots cannot trigger another Twinshot.', augmentLabel:'Steady momentum',
    ranks:['Each basic attack that does not Twinshot adds 5 percentage points to the next basic Twinshot chance. Resets after a Twinshot.', 'Each basic attack that does not Twinshot adds 10 percentage points to the next basic Twinshot chance. Resets after a Twinshot.'] },
  { signature:TALENT_EFFECT_IDS.venom, augment:TALENT_EFFECT_IDS.lingeringVenom, ability:'venom-detonation', label:'Toxic arrows',
    description:'Convert 60% of basic-attack damage into poison over four seconds. Reapplying adds all remaining damage to the new poison.', augmentLabel:'Lingering venom',
    ranks:['Toxic Arrows lasts six seconds. Reapplying still preserves all remaining poison damage.', 'Toxic Arrows lasts eight seconds. Reapplying still preserves all remaining poison damage.'] },
  { signature:TALENT_EFFECT_IDS.arcaneEcho, augment:TALENT_EFFECT_IDS.arcaneEchoChance, ability:'arcane-volley', label:'Arcane Echo',
    description:'Damaging arcane spells have a 15% chance to launch an Arcane Missile. These missiles can repeat, up to sixteen echoes per chain.', augmentLabel:'Resonance',
    ranks:['Arcane Echo chance increases to 20%, including repeat missiles.', 'Arcane Echo chance increases to 25%, including repeat missiles.'] },
  { signature:TALENT_EFFECT_IDS.burning, augment:TALENT_EFFECT_IDS.periodicBurning, ability:'combustion', label:'Burning',
    description:'Damaging fire spells grant one Heat for six seconds, up to ten. Each Heat increases spell cast speed and all damage-over-time tick rates by 3%.', augmentLabel:'Living flame',
    ranks:['Your damage-over-time ticks also grant one Heat and refresh Burning.', 'Your damage-over-time ticks also grant two Heat and refresh Burning.'] },
  { signature:TALENT_EFFECT_IDS.chilled, augment:TALENT_EFFECT_IDS.deepChill, ability:'shatter', label:'Chilled',
    description:'Damaging frost spells Chill targets for four seconds, slowing them by 20%. Ice Lance deals triple damage to Chilled targets and resets its cooldown when it hits them.', augmentLabel:'Deep chill',
    ranks:['Chilled targets take 5% more damage from all your frost spells.', 'Chilled targets take 10% more damage from all your frost spells.'] },
] as const;
for (const effect of signatures) {
  const signature = talentList.find(talent => talent.id === effect.signature)!;
  const augment = talentList.find(talent => talent.id === effect.augment)!;
  const spell = SPELLS[effect.ability], capstone = talentList.find(talent => talent.id === spell.requiredTalent)!;
  Object.assign(signature, { label:effect.label, description:effect.description, maxRank:1, requiredLevel:16, requiredBranchPoints:5, stats:{}, spellBonuses:undefined, ability:effect.ability });
  Object.assign(augment, { label:effect.augmentLabel, description:effect.ranks.join(' Rank 2: '), rankDescriptions:effect.ranks, maxRank:2, requiredLevel:16, prerequisite:signature.id, prerequisiteRank:1, stats:{}, spellBonuses:undefined, ability:effect.ability });
  for (const talent of talentList) if (talent.prerequisite === signature.id) talent.prerequisiteRank = 1;
  Object.assign(capstone, { label:spell.label, description:spell.description, requiredLevel:spell.requiredLevel, stats:{}, spellBonuses:undefined, ability:effect.ability });
}
const VERSION_3_TALENTS: Record<string, Talent> = Object.fromEntries(talentList.map(talent => [talent.id, { ...talent }]));
// Tobie's September 19 layout. Old layouts above remain unchanged for save validation.
talentList.splice(talentList.findIndex(talent => talent.id === 'ranger-6'), 1);
for (const talent of talentList) if (talent.className === 'Ranger' && talent.branch === 'Pathfinder') talent.branch = 'Beastmaster';
const VERSION_5_TALENTS: Record<string, Talent> = Object.fromEntries(talentList.map(talent => [talent.id, talent]));
for (const [column, ids] of [
  'ranger-marksmanship-2 ranger-survival-5 ranger-survival-8 knight-vanguard-2 knight-vanguard-5 knight-sentinel-2 knight-warlord-5 mage-spellfire-2 mage-warding-2 mage-frostweaving-5 cleric-radiance-2 cleric-devotion-2 cleric-judgment-5',
  'ranger-marksmanship-3 ranger-marksmanship-4 knight-sentinel-3 knight-warlord-6 cleric-radiance-3 cleric-devotion-3 cleric-judgment-6',
  'ranger-1 ranger-3 ranger-pathfinder-1 ranger-survival-1 ranger-survival-6 ranger-survival-7 knight-2 knight-vanguard-3 knight-vanguard-4 knight-5 knight-6 knight-warlord-2 knight-warlord-3 mage-1 mage-4 mage-frostweaving-1 cleric-1 cleric-2 cleric-3 cleric-4 cleric-5 cleric-6 cleric-judgment-1 cleric-judgment-2 cleric-judgment-3',
].entries()) for (const id of ids.split(' ')) VERSION_5_TALENTS[id].column = column;
for (const [id, label] of Object.entries({ 'ranger-marksmanship-5':'Perfect Release', 'ranger-survival-1':'Serpent Study', 'ranger-survival-2':'Serpent study Surge', 'ranger-survival-4':'Venom craft', 'ranger-survival-5':'Venom craft Mastery' })) VERSION_5_TALENTS[id].label = label;
Object.assign(VERSION_5_TALENTS[TALENT_EFFECT_IDS.arrowstorm], { label:'Arrowstorm', description:'Triggering Twinshot increases your attack speed for ten seconds, stacking up to five times. Each trigger refreshes the duration.',
  rankDescriptions:['Each Twinshot grants 5% attack speed for ten seconds, up to 25%.', 'Each Twinshot grants 10% attack speed for ten seconds, up to 50%.'], stats:{}, spellBonuses:undefined, icon:'spell-twinshot' });
VERSION_5_TALENTS['ranger-marksmanship-6'].prerequisite = TALENT_EFFECT_IDS.arrowstorm;
for (const id of ['ranger-pathfinder-5', 'ranger-survival-7', 'ranger-survival-8']) Object.assign(VERSION_5_TALENTS[id], { prerequisite:null, prerequisiteRank:0 });
Object.assign(VERSION_5_TALENTS['ranger-pathfinder-6'], { label:SPELLS['combined-assault'].label, description:SPELLS['combined-assault'].description,
  prerequisite:TALENT_EFFECT_IDS.everlastingBond, prerequisiteRank:1, stats:{}, spellBonuses:undefined, ability:'combined-assault' });
VERSION_5_TALENTS[TALENT_EFFECT_IDS.beastmaster] = { id:TALENT_EFFECT_IDS.beastmaster, className:'Ranger', branch:'Beastmaster', label:'Beastmaster', description:SPELLS['tame-beast'].description,
  row:2, column:2, maxRank:1, requiredLevel:1, requiredBranchPoints:0, prerequisite:null, prerequisiteRank:0, stats:{}, ability:'tame-beast' };
VERSION_5_TALENTS[TALENT_EFFECT_IDS.everlastingBond] = { id:TALENT_EFFECT_IDS.everlastingBond, className:'Ranger', branch:'Beastmaster', label:'Everlasting Bond',
  description:'Your companion’s basic attacks empower your next basic attack to deal extra damage and heal your companion. This effect does not stack.',
  rankDescriptions:['Your next basic attack deals 10% extra damage and heals your companion for 5% of its maximum health.', 'Your next basic attack deals 20% extra damage and heals your companion for 10% of its maximum health.'],
  row:2, column:1, maxRank:2, requiredLevel:1, requiredBranchPoints:0, prerequisite:TALENT_EFFECT_IDS.beastmaster, prerequisiteRank:1, stats:{}, icon:'spell-tame-beast' };
Object.assign(VERSION_5_TALENTS['ranger-survival-5'], { description:'+2% damage over time per rank.', rankDescriptions:['+2% damage over time.', '+4% damage over time.'], spellBonuses:{ periodic:2 } });
Object.assign(VERSION_5_TALENTS[TALENT_EFFECT_IDS.lingeringVenom], { description:'Toxic Arrows lasts five seconds at rank 1 or six seconds at rank 2. Reapplying preserves all remaining poison damage.',
  rankDescriptions:['Toxic Arrows lasts five seconds. Reapplying still preserves all remaining poison damage.', 'Toxic Arrows lasts six seconds. Reapplying still preserves all remaining poison damage.'] });
VERSION_5_TALENTS['ranger-survival-9'].prerequisite = TALENT_EFFECT_IDS.lingeringVenom;

const VERSION_4_TALENTS: Record<string, Talent> = Object.fromEntries(Object.values(VERSION_5_TALENTS).map(talent => [talent.id, { ...talent }]));
// September 22 workshop: retain authored IDs so saved workshop builds map to the game.
VERSION_5_TALENTS['ranger-pathfinder-6'].description = 'You and your companion strike the same target together, each dealing 150% of basic-attack damage. Your companion must be alive and within melee range of the target. 16-second cooldown.';
Object.assign(VERSION_5_TALENTS['knight-3'], { row:1 });
Object.assign(VERSION_5_TALENTS['knight-6'], { row:1, column:1 });
Object.assign(VERSION_5_TALENTS['knight-sentinel-3'], { column:0 });
Object.assign(VERSION_5_TALENTS['knight-warlord-6'], { row:1 });
for (const id of ['knight-vanguard-5', 'knight-sentinel-5', 'knight-warlord-6', 'knight-warlord-7']) Object.assign(VERSION_5_TALENTS[id], { prerequisite:null, prerequisiteRank:0 });
for (const [branch, signature, augment, label, description, ranks, ability] of [
  ['Vanguard', TALENT_EFFECT_IDS.wideSwing, TALENT_EFFECT_IDS.fineCuts, 'Wide Swing', 'Your basic attacks automatically cleave to a second nearby enemy', ['15% damage, 2 targets', '30% damage, 3 targets'], null],
  ['Sentinel', TALENT_EFFECT_IDS.guard, TALENT_EFFECT_IDS.holdTheLine, 'Guard', 'Raise your shield to absorb incoming hits, reducing damage and reflecting damage back at attackers, generating extra threat', ['25% Area damage', '50% Area damage'], 'guard'],
  ['Warlord', TALENT_EFFECT_IDS.courageousCall, TALENT_EFFECT_IDS.intoTheFray, 'Courageous Call', 'Let out a shout, inspiring allies to fight with more vigor.', ['7% Crit Chance', '15% Crit Chance'], 'courageous-call'],
] as const) {
  VERSION_5_TALENTS[signature] = { id:signature, className:'Knight', branch, label, description, row:2, column:branch === 'Sentinel' ? 2 : 0,
    maxRank:1, requiredLevel:1, requiredBranchPoints:0, prerequisite:null, prerequisiteRank:0, stats:{},
    ...(ability ? {ability} : {}), ...(branch === 'Warlord' ? {rankDescriptions:['20% more damage']} : {}), icon:'compass' };
  VERSION_5_TALENTS[augment] = { id:augment, className:'Knight', branch, label:branch === 'Vanguard' ? 'Fine Cuts' : branch === 'Sentinel' ? 'Hold the Line' : 'Into the Fray',
    description:branch === 'Vanguard' ? 'Increases the damage and targets you auto attacks cleave' : branch === 'Sentinel' ? 'Damage you absorb increase the damage you reflect, and makes it shatter for area damage' : 'Courage Call also grants allies increased crit chance',
    rankDescriptions:ranks, row:2, column:1, maxRank:2, requiredLevel:1, requiredBranchPoints:0, prerequisite:signature, prerequisiteRank:1, stats:{}, icon:'compass' };
}
for (const [id, ability, prerequisite, label, description] of [
  ['knight-vanguard-6', 'powerful-throw', TALENT_EFFECT_IDS.fineCuts, 'Powerful Throw', "Hold to charge your throw, then throw your shield, bouncing on enemies. You can pick up the shield to reduce the next throw's charge time"],
  ['knight-sentinel-6', 'adamant-guardian', TALENT_EFFECT_IDS.holdTheLine, 'Adamant Guardian', 'Brace yourself, absorbing more damage and building up a massive hit based on damage absorbed, taunting enemies'],
  ['knight-warlord-9', 'lord-of-battle', TALENT_EFFECT_IDS.intoTheFray, 'Lord of battle', 'Mark nearby enemies and allies, causing enemies hit to take extra damage and allies hit to get healed'],
] as const) Object.assign(VERSION_5_TALENTS[id], { label, description, ability, prerequisite, prerequisiteRank:2, stats:{}, spellBonuses:undefined });

// Current metadata comes from the complete workshop export; legacy catalogs above exist only for migration.
const edictAbilities: Record<string, AbilityId> = {
  [TALENT_EFFECT_IDS.edictDawn]:'edict-of-the-dawn', [TALENT_EFFECT_IDS.titansEdict]:'titans-edict', [TALENT_EFFECT_IDS.eternalEdict]:'eternal-edict',
};
const edictIcons: Record<string, string> = {
  [TALENT_EFFECT_IDS.edictLight]:'spell-edict-of-light', [TALENT_EFFECT_IDS.bouncingEdicts]:'spell-bouncing-edicts',
  [TALENT_EFFECT_IDS.edictProtection]:'spell-edict-of-protection', [TALENT_EFFECT_IDS.blanketEdicts]:'spell-blanket-edicts',
  [TALENT_EFFECT_IDS.edictHarm]:'spell-edict-of-harm', [TALENT_EFFECT_IDS.renewableEdict]:'spell-renewable-edict',
};
const talentPassiveBonuses: Record<string, NonNullable<Talent['passiveBonuses']>> = {
  [TALENT_EFFECT_IDS.preciseShots]: { attackSpeed:5 },
  [TALENT_EFFECT_IDS.primalFocus]: { critChance:2.5 },
  [TALENT_EFFECT_IDS.naturalGift]: { allDamage:2 },
  [TALENT_EFFECT_IDS.heatedHaste]: { castSpeed:2 },
  [TALENT_EFFECT_IDS.magicFocus]: { magicDamage:2 },
  [TALENT_EFFECT_IDS.sharpMind]: { critChance:2.5 },
  [TALENT_EFFECT_IDS.sunbreaker]: { critChance:2.5 },
  [TALENT_EFFECT_IDS.ironBulwark]: { health:5 },
  [TALENT_EFFECT_IDS.siegebreaker]: { allDamage:2 },
  [TALENT_EFFECT_IDS.righteousForce]: { critChance:2.5 },
};
// These persisted nodes now grant different effects. Do not carry their old flat/school bonuses forward.
const replacedTalentBonuses = new Set(['knight-3', 'knight-sentinel-4', 'knight-warlord-5', 'cleric-radiance-2', 'cleric-devotion-2', 'cleric-judgment-5']);
export const TALENTS: Record<string, Talent> = Object.fromEntries(TALENT_DESIGN.classes.flatMap(c => c.trees.flatMap(tree => tree.talents.map(({ rank: _rank, notes: _notes, ...talent }) => {
  const previous = VERSION_5_TALENTS[talent.id];
  return [talent.id, { ...talent, className:c.id as CharacterClass, branch:tree.name, stats:replacedTalentBonuses.has(talent.id) ? {} : previous?.stats ?? {},
    icon:/new icon/i.test(_notes) ? `spell-${talent.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : edictIcons[talent.id] ?? (edictAbilities[talent.id] ? SPELLS[edictAbilities[talent.id]].icon : talent.icon),
    spellBonuses:replacedTalentBonuses.has(talent.id) ? undefined : previous?.spellBonuses,
    passiveBonuses:talentPassiveBonuses[talent.id], ability:edictAbilities[talent.id] ?? previous?.ability }];
}))));

// Version 6 differs only in these allocation rules. Its descriptions/effects are irrelevant to save validation.
const addedTalentIds = new Set(Object.keys(talentPassiveBonuses).filter(id => !Object.hasOwn(VERSION_5_TALENTS, id)));
const version6Rules: Record<string, Partial<Talent>> = {
  'ranger-5': { requiredBranchPoints:1 }, 'knight-3': { maxRank:1 },
  'knight-vanguard-5': { requiredBranchPoints:9 }, 'knight-sentinel-5': { requiredBranchPoints:9 }, 'knight-warlord-7': { requiredBranchPoints:9 },
  [TALENT_EFFECT_IDS.wideSwing]: { requiredBranchPoints:6 }, [TALENT_EFFECT_IDS.guard]: { requiredBranchPoints:6 }, [TALENT_EFFECT_IDS.courageousCall]: { requiredBranchPoints:6 },
};
const VERSION_6_TALENTS: Record<string, Talent> = Object.fromEntries(Object.values(TALENTS).filter(talent => !addedTalentIds.has(talent.id)).map(talent => [talent.id, { ...talent, ...version6Rules[talent.id] }]));

export const RESOURCE_PRICES = { wood: 3, crystal: 5, herb: 2 } as const;

export function starterGear(className: CharacterClass): { ownedGear: string[]; equipment: Equipment } {
  const weapon = { Ranger: 'ranger-bow', Knight: 'knight-sword', Mage: 'mage-staff', Cleric: 'cleric-mace' }[className];
  const armor = { Ranger: 'ranger-tunic', Knight: 'knight-mail', Mage: 'mage-robes', Cleric: 'cleric-robes' }[className];
  return { ownedGear: [weapon, armor], equipment: { weapon, armor, charm: null, head: null, legs: null, shoes: null, back: null, ring1: null, ring2: null } };
}
export const TALENT_VERSION = 7;
export const earnedTalentPoints = (level: number) => 1 + Math.floor((Math.min(MAX_LEVEL, Math.max(1, level)) - 1) / 3);
export const availableTalentPoints = (player: Pick<Player, 'level' | 'talents'>) => Math.max(0, earnedTalentPoints(player.level) - player.talents.length);
export const talentRank = (player: Pick<Player, 'talents'>, id: string) => player.talents.filter(learned => learned === id).length;
export const branchTalentPoints = (player: Pick<Player, 'talents'>, branch: string) => player.talents.filter(id => Object.hasOwn(TALENTS, id) && TALENTS[id].branch === branch).length;
export function canLearnTalent(player: Pick<Player, 'level' | 'talents' | 'appearance'>, id: string, legacy = false, catalog = TALENTS): boolean {
  const talent = Object.hasOwn(catalog, id) ? catalog[id] : undefined;
  return !!talent && talent.className === player.appearance.className && player.level >= talent.requiredLevel && (legacy ? player.talents.length < player.level : availableTalentPoints(player) > 0)
    && talentRank(player, id) < talent.maxRank && player.talents.filter(learned => Object.hasOwn(catalog, learned) && catalog[learned].branch === talent.branch).length >= talent.requiredBranchPoints
    && (!talent.prerequisite || talentRank(player, talent.prerequisite) >= talent.prerequisiteRank);
}
export function talentsValid(player: Pick<Player, 'level' | 'talents' | 'appearance'>, legacy = false, catalog = TALENTS): boolean {
  if (!Array.isArray(player.talents) || player.talents.length > (legacy ? player.level : earnedTalentPoints(player.level)) || player.talents.length > talentList.length * 3
      || !player.talents.every(id => typeof id === 'string' && Object.hasOwn(catalog, id))) return false;
  // Validate a reachable allocation, independent of array order in older saves.
  // This also rejects high-tier nodes that try to count each other as their entry points.
  const pending = [...player.talents], replay = { ...player, talents: [] as string[] };
  while (pending.length) {
    const index = pending.findIndex(id => canLearnTalent(replay, id, legacy, catalog));
    if (index < 0) return false;
    replay.talents.push(pending.splice(index, 1)[0]);
  }
  return true;
}
/** Refund only structurally valid old builds; malformed saves still fail closed. */
export function migrateTalents(player: Pick<Player, 'level' | 'talents' | 'appearance' | 'talentVersion'>): void {
  const previous = player.talentVersion === 6 ? VERSION_6_TALENTS : player.talentVersion === 5 ? VERSION_5_TALENTS : player.talentVersion === 4 ? VERSION_4_TALENTS : player.talentVersion === 3 ? VERSION_3_TALENTS : player.talentVersion === undefined || player.talentVersion === 2 ? PREVIOUS_TALENTS : undefined;
  if (previous && talentsValid(player, player.talentVersion === undefined, previous)) {
    if ((player.talentVersion ?? 0) < 4 || !talentsValid(player)) player.talents = [];
    player.talentVersion = TALENT_VERSION;
  }
}
export function equippedAttributes(player: Pick<Player, 'equipment'>): Record<Attribute, number> {
  const attributes = { strength: 0, agility: 0, intellect: 0, stamina: 0, spirit: 0 };
  for (const id of Object.values(player.equipment)) {
    const stats = gearById(id)?.stats;
    for (const attribute of PRIMARY_ATTRIBUTES) attributes[attribute] += stats?.[attribute] ?? 0;
  }
  return attributes;
}
export const maxHealth = (player: Pick<Player, 'level' | 'equipment'> & Partial<Pick<Player, 'talents'>>): number => {
  const healthBonus = (player.talents ?? []).reduce((total, id) => total + (TALENTS[id]?.passiveBonuses?.health ?? 0), 0);
  return Math.round((100 + (player.level - 1) * 12 + equippedAttributes(player).stamina * 5) * (1 + healthBonus / 100));
};

export function combatStats(player: Pick<Player, 'level' | 'appearance' | 'talents' | 'equipment' | 'raidProgress'>) {
  const base = { Ranger: { range: SPELLS.arrow.range, primaryDamage: 16 }, Knight: { range: SPELLS.strike.range, primaryDamage: 24 }, Mage: { range: SPELLS.fireball.range, primaryDamage: 20 }, Cleric: { range: SPELLS.smite.range, primaryDamage: 18 } }[player.appearance.className];
  const stats = { ...base, primaryDamage: base.primaryDamage + (player.level - 1) * 3, specialDamage: 36 + (player.level - 1) * 3, skillDamage: 0, defense: 0, spellBonuses: {} as SpellBonuses,
    critChance:0, attackSpeedMultiplier:1, castSpeedMultiplier:1, damageMultiplier:1, magicDamageMultiplier:1 };
  const passives = player.talents.map(id => TALENTS[id]?.passiveBonuses);
  for (const bonus of passives) {
    stats.critChance += (bonus?.critChance ?? 0) / 100;
    stats.attackSpeedMultiplier += (bonus?.attackSpeed ?? 0) / 100;
    stats.castSpeedMultiplier += (bonus?.castSpeed ?? 0) / 100;
    stats.damageMultiplier += (bonus?.allDamage ?? 0) / 100;
    stats.magicDamageMultiplier += (bonus?.magicDamage ?? 0) / 100;
  }
  const power = equippedAttributes(player)[classAttribute(player.appearance.className)];
  stats.primaryDamage += power; stats.specialDamage += power;
  for (const bonus of [...player.talents.map(id => TALENTS[id]?.stats), ...Object.values(player.equipment).map(id => gearById(id)?.stats)]) {
    if (!bonus) continue;
    stats.primaryDamage += (bonus.primaryDamage || 0) + (bonus.damage || 0);
    stats.specialDamage += (bonus.specialDamage || 0) + (bonus.damage || 0);
    stats.skillDamage += bonus.specialDamage || 0;
    stats.defense += bonus.defense || 0;
  }
  const specialist=activeSpecialist(player.raidProgress,player.appearance.className);
  if(specialist){stats.primaryDamage+=specialist.upgrade*2;stats.specialDamage+=specialist.upgrade*2;stats.skillDamage+=specialist.upgrade*2;stats.defense+=Math.floor(specialist.upgrade/3);}
  const bonuses = player.talents.map(id => TALENTS[id]?.spellBonuses);
  const equipped = Object.values(player.equipment).map(id => gearById(id));
  for (const setId of new Set(equipped.map(gear => gear?.setId).filter(Boolean))) {
    const pieces = new Set(equipped.filter(gear => gear?.setId === setId).map(gear => gear!.slot)).size;
    for (const effect of gearSetBonuses(setId!)) if (pieces >= effect.pieces) bonuses.push(effect.bonuses);
  }
  for (const bonus of bonuses) for (const [key, value] of Object.entries(bonus || {})) {
    const stat = key as keyof SpellBonuses;
    stats.spellBonuses[stat] = (stats.spellBonuses[stat] || 0) + value;
  }
  return stats;
}
