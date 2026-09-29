import assert from 'node:assert/strict';
import { ZONES } from '../src/content.ts';
import { getMusicScore, MUSIC_VARIATIONS } from '../src/music.ts';

assert.equal(MUSIC_VARIATIONS, 3);
const ids = new Set(), melodies = new Set();
for (const zone of [...ZONES.map(zone => zone.id), 'dungeon']) {
  for (let variant = 0; variant < MUSIC_VARIATIONS; variant++) {
    const calm = getMusicScore(zone, false, variant), battle = getMusicScore(zone, true, variant);
    assert.equal(getMusicScore(zone, false, variant), calm, 'scheduler reuses cached scores');
    assert(battle.eighth < calm.eighth, 'combat increases the tempo');
    assert(!calm.percussion && battle.percussion, 'combat adds percussion');
    assert.notDeepEqual(battle.melody, calm.melody, 'battle has different notes and rhythms');
    for (const score of [calm, battle]) {
      assert(!ids.has(score.id), 'each arrangement has its own identity'); ids.add(score.id);
      const tune = JSON.stringify(score.melody);
      assert(!melodies.has(tune), 'each arrangement has a distinct melody'); melodies.add(tune);
      assert(score.eighth >= .18 && score.eighth <= .4);
      assert(['square', 'triangle', 'sine', 'sawtooth'].includes(score.lead));
      assert(score.melody.length >= 8 && score.melody.length === score.chords.length);
      for (const bar of score.melody) {
        assert.equal(bar.length, 8, `${score.id}: every bar has eight eighth notes`);
        assert(bar.some(pitch => pitch > 0), 'every measure has musical content');
        assert(bar.every(pitch => Number.isInteger(pitch) && (pitch === 0 || pitch >= 48 && pitch <= 96)), `${score.id}: playable lead range`);
      }
      for (const chord of score.chords) {
        assert.equal(chord.length, 3);
        assert(chord.every(pitch => Number.isInteger(pitch) && pitch >= 36 && pitch <= 84));
        assert(chord[0] < chord[1] && chord[1] < chord[2]);
      }
    }
    assert.deepEqual(getMusicScore(zone, false, variant + MUSIC_VARIATIONS), calm, 'playlist wraps');
  }
}
assert.equal(ids.size, (ZONES.length + 1) * MUSIC_VARIATIONS * 2);
const original = getMusicScore('greenwood', false, 0);
assert.equal(original.melody.length, 16);
assert.deepEqual(original.melody[0], [66, 69, 74, 0, 73, 69, 66, 0]);
assert.deepEqual(original.chords[0], [50, 54, 57]);
assert.equal(original.eighth, 30 / 96);
for (const unknown of ['new-region', '', '__proto__', 'constructor']) assert.deepEqual(getMusicScore(unknown, false, 0), original);
for (const invalid of [NaN, Infinity, -Infinity]) assert.deepEqual(getMusicScore('greenwood', false, invalid), original);
assert.deepEqual(getMusicScore('greenwood', false, -1), getMusicScore('greenwood', false, 2));
console.log(`PASS: ${ids.size} distinct arrangements across ${ZONES.length} biomes and dungeons, three variations, combat tempo/percussion/responses, valid measures and notes, original woodland theme, wrapping and fallbacks.`);
