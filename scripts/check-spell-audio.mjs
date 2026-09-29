import assert from 'node:assert/strict';
import { SPELLS } from '../src/spells.ts';
import { playSpellSound, spellSoundFamily } from '../src/spell-audio.ts';

const stages = ['cast', 'release', 'impact'];
const random = Math.random;
const record = (spell, stage) => { const tones = []; playSpellSound(spell, stage, (...tone) => tones.push(tone)); return tones; };
const families = new Set(), signatures = new Map();
try {
  for (const roll of [0, .5, 1]) {
    Math.random = () => roll;
    for (const spell of Object.values(SPELLS)) {
      families.add(spellSoundFamily(spell));
      for (const stage of stages) {
        const tones = record(spell, stage), label = `${spell.id}/${stage}/${roll}`;
        assert(tones.length >= 2 && tones.length <= 12, `${label}: audible, bounded layers`);
        for (const [type, frequency, duration, gain, delay, end] of tones) {
          assert(['sine', 'triangle', 'square', 'sawtooth', 'noise'].includes(type), label);
          assert([frequency, duration, gain, delay, end].every(Number.isFinite), `${label}: finite parameters`);
          assert(frequency >= 20 && frequency < 18000 && end >= 20 && end < 18000, `${label}: audible frequencies`);
          assert(duration >= .02 && gain > 0 && gain <= .32 && delay >= 0 && duration + delay < 1, `${label}: bounded sound`);
          if (spell.channel && stage !== 'cast') assert(duration + delay < spell.channel.tickMs / 1000, `${label}: channel tail ends before next tick`);
        }
      }
      if (roll === .5) {
        const variants = stages.map(stage => JSON.stringify(record(spell, stage)));
        assert.equal(new Set(variants).size, 3, `${spell.id}: cast, release and impact are distinct`);
        assert(!signatures.has(variants[1]), `${spell.id}: release recipe duplicates ${signatures.get(variants[1])}`);
        signatures.set(variants[1], spell.id);
      }
    }
  }
  assert.equal(families.size, 12, 'all elemental, physical and support families are represented');
  assert.equal(signatures.size, Object.keys(SPELLS).length, 'every ability has a distinct release recipe');
  const expected = { fireball: 'fire', meteor: 'fire', nova: 'frost', 'comet-shower': 'frost',
    'arcane-missile': 'arcane', 'chain-lightning': 'lightning', smite: 'holy', thornburst: 'nature',
    'poison-shot': 'poison', arrow: 'bow', strike: 'weapon', earthshaker: 'earth',
    'flame-barrier': 'shield', 'ice-barrier': 'shield', 'greater-heal': 'healing',
    'edict-of-the-dawn': 'holy', 'eternal-edict': 'holy' };
  for (const [id, family] of Object.entries(expected)) assert.equal(spellSoundFamily(SPELLS[id]), family, id);
  Math.random = () => .5;
  for (const [a, b] of [['fireball', 'pyroblast'], ['nova', 'holy-nova'], ['arrow', 'power-shot'],
    ['shield-bash', 'strike'], ['flame-barrier', 'ice-barrier'], ['heal', 'flash-heal'], ['arcane-beam', 'inferno-beam'],
    ['edict-of-the-dawn', 'smite'], ['eternal-edict', 'smite'], ['edict-of-the-dawn', 'eternal-edict']]) {
    assert.notDeepEqual(record(SPELLS[a], 'impact'), record(SPELLS[b], 'impact'), `${a} and ${b} have distinct identities`);
  }
  Math.random = () => 0;
  const low = record(SPELLS.fireball, 'release');
  Math.random = () => 1;
  const high = record(SPELLS.fireball, 'release');
  assert.notEqual(low[0][1], high[0][1], 'repeated casts receive a little detuning');
  assert(high[0][1] / low[0][1] < 1.04, 'detuning preserves each ability identity');
} finally { Math.random = random; }
console.log(`PASS: ${Object.keys(SPELLS).length} spell sounds across ${families.size} families, three stages, ${signatures.size} release variants, bounded layers, channel tails and modest detuning.`);
