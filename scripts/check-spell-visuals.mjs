import assert from 'node:assert/strict';
import { SPELLS, RETIRED_SPELLS } from '../src/spells.ts';
import { SPELL_VISUALS, SPELL_CHOREOGRAPHY_SOURCES } from '../src/spell-visuals.ts';
import { drawRangerSpell } from '../src/spell-art-ranger.ts';
import { drawKnightSpell } from '../src/spell-art-knight.ts';
import { drawMageSpell } from '../src/spell-art-mage.ts';
import { drawClericSpell } from '../src/spell-art-cleric.ts';

const drawers = { Ranger: drawRangerSpell, Knight: drawKnightSpell, Mage: drawMageSpell, Cleric: drawClericSpell };
const motifs = new Set(['flame', 'shard', 'spark', 'rune', 'leaf', 'feather', 'shield', 'slash', 'ring', 'arrow']);
assert.deepEqual(Object.keys(SPELL_VISUALS).sort(), [...Object.keys(SPELLS),...Object.keys(RETIRED_SPELLS)].sort(), 'every active or legacy art spell has a palette and fallback cue');
for (const id of ['poison-cloud', 'charge', 'taunt', 'powerful-throw', 'guard', 'adamant-guardian', 'courageous-call', 'lord-of-battle']) {
  assert(!SPELL_CHOREOGRAPHY_SOURCES[id], `${id}: class rework has its own choreography`);
}
let maximumParts = 0, phaseCount = 0;

function record(draw, id, phase, p, quality) {
  const calls = [];
  let parts = 0;
  const append = (kind, values, cost = 1) => {
    for (const value of values) if (typeof value === 'number') assert(Number.isFinite(value), `${id}/${phase}: finite art command`);
    calls.push([kind, ...values]);
    parts += cost;
  };
  const art = {
    phase, p, t: p * .7, r: id === 'adamant-guardian' && phase === 'impact' ? 5 : 2.5,
    detail: n => Math.max(1, Math.ceil(n * (quality === 'low' ? .3 : 1))),
    shape(motif, x, y, z, sx, sy = sx, sz = sx, tone = 0, yaw = 0, pitch = 0, roll = 0) {
      assert(motifs.has(motif), `${id}: available Blender silhouette`);
      assert([sx, sy, sz].every(n => n >= 0 && n <= 12), `${id}: bounded nonnegative dimensions`);
      assert(Number.isInteger(tone) && tone >= 0 && tone <= 5, `${id}: supported art tone`);
      append('shape', [motif, x, y, z, sx, sy, sz, yaw, pitch, roll]);
    },
    line(ax, ay, az, bx, by, bz, width, tone = 1) {
      assert(width >= 0 && width <= 2, `${id}: bounded stroke width`);
      append('line', [ax, ay, az, bx, by, bz, width]);
    },
    ring(x, y, z, radius, tone = 0, pitch = 0, yaw = 0) {
      assert(radius >= 0 && radius <= 12, `${id}: bounded ring`);
      append('ring', [x, y, z, radius, pitch, yaw]);
    },
    arc(x, y, z, radius, start, end, width, tone = 0, pitch = 0) {
      assert(radius >= 0 && radius <= 12 && width >= 0 && width <= 2, `${id}: bounded arc`);
      append('arc', [x, y, z, radius, start, end, width, pitch], Math.max(2, Math.ceil(Math.abs(end - start) * 4)));
    },
  };
  const handled = draw(id, art);
  maximumParts = Math.max(maximumParts, parts);
  assert(parts <= 150, `${id}/${phase}/${p}/${quality}: ${parts} structural parts exceeds 150`);
  return { handled, calls, parts };
}

for (const quality of ['high', 'low']) {
  const signatures = new Map();
  for (const spell of Object.values(SPELLS)) {
    const visual = SPELL_VISUALS[spell.id];
    assert(motifs.has(visual.motif), `${spell.id}: supported essential cue`);
    assert(/^#[\da-f]{6}$/i.test(visual.color) && /^#[\da-f]{6}$/i.test(visual.accent), `${spell.id}: valid palette`);
    const phases = spell.id === 'adamant-guardian' ? ['field', 'impact'] : ['shatter', 'venom-detonation'].includes(spell.id) ? ['impact']
      : spell.effect === 'damage' && spell.visual !== 'radial' ? ['flight', 'impact'] : ['field'];
    const sequence = [];
    for (const phase of phases) {
      phaseCount++;
      for (const p of [0, .25, .5, .75, .99]) {
        const frame = record(drawers[spell.className], spell.id, phase, p, quality);
        assert(frame.handled, `${spell.id}/${phase}: class artist covers the real runtime phase`);
        assert(frame.calls.length > 0, `${spell.id}/${phase}: authored art exists beyond the fallback cue`);
        sequence.push([phase, frame.calls]);
      }
    }
    // All classes use identical mock time/radius; color and tone cannot make a duplicate pass.
    const signature = JSON.stringify(sequence);
    const source = SPELL_CHOREOGRAPHY_SOURCES[spell.id] || spell.id;
    assert(!signatures.has(signature) || signatures.get(signature) === source, `${spell.id} copies an undeclared structural sequence of ${signatures.get(signature)}`);
    signatures.set(signature, source);
    for (const [className, draw] of Object.entries(drawers)) if (className !== spell.className) {
      const other = record(draw, spell.id, phases[0], .5, quality);
      assert(!other.handled && other.calls.length === 0, `${className} must not claim ${spell.id}`);
    }
  }
  assert(signatures.size >= new Set(Object.keys(SPELLS).map(id=>SPELL_CHOREOGRAPHY_SOURCES[id]||id)).size, `${quality}: each spell has an explicit drawn sequence or declared shared artwork`);
}

// Protect readable structures, rather than exact particle counts or profile-number differences.
const fortress = record(drawKnightSpell, 'fortress', 'field', .5, 'low').calls;
assert(fortress.filter(call => call[0] === 'shape' && call[1] === 'shield').length >= 3, 'Fortress keeps multiple defensive walls on Low');
const snowflake = record(drawMageSpell, 'nova', 'field', .5, 'low').calls;
assert(snowflake.filter(call => call[0] === 'line').length >= 12, 'Frost Nova keeps its branched snowflake outline on Low');
const web = record(drawRangerSpell, 'silken-guard', 'field', .5, 'low').calls;
assert(web.filter(call => call[0] === 'line').length >= 16, 'Silken Guard keeps its spoke-and-thread web on Low');
for (const id of ['arrow', 'rapid-fire', 'binding-arrow', 'twinshot']) {
  const planted = record(drawRangerSpell, id, 'impact', .5, 'low').calls.filter(call => call[0] === 'shape' && call[1] === 'arrow');
  assert(planted.length > 0 && planted.every(call => -Math.sin(call[9]) < -.8), `${id}: planted +Z arrowheads point into the ground`);
}
console.log(`PASS: ${Object.keys(SPELLS).length} spells with explicit or declared shared choreography, ${phaseCount} High/Low phase checks at five times, finite art, at most ${maximumParts} expanded parts per spell, retained Low silhouettes.`);
