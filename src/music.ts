import type { ZoneId } from './content';

export const MUSIC_VARIATIONS = 3;
export type MusicScore = { id: string; eighth: number; melody: number[][]; chords: number[][]; lead: OscillatorType; percussion: boolean };
type Theme = { root: number; scale: number[]; bpm: number; lead: OscillatorType; harmony: string[]; tunes: string[]; battle: string[] };
const major = [0, 2, 4, 5, 7, 9, 11], minor = [0, 2, 3, 5, 7, 8, 10];

// Original compositions: scale degrees 1–9, dots for rests, eight eighth notes per bar.
// Each region has three separate eight-bar melodies and its own battle responses.
const themes: Record<ZoneId | 'dungeon', Theme> = {
  greenwood: {
    root: 62, scale: major, bpm: 96, lead: 'square', harmony: ['15641511', '14651451', '16451451'],
    tunes: [
      '358.753.|257.652.|3689876.|468.654.|358.9876|975.679.|863.4567|8...1...',
      '13.53521|46.8642.|65.36865|572.725.|13.58135|468.6542|579.7652|3.21....',
      '5.323.12|6.535.36|4.686.42|7.575.27|8.531.35|6.424.68|9.752.75|8...1...',
    ], battle: ['13558531', '11356585', '58531321'],
  },
  amberwild: {
    root: 60, scale: minor, bpm: 90, lead: 'triangle', harmony: ['16471551', '13671451', '14675151'],
    tunes: [
      '5.3.213.|6.5.368.|4.6.864.|7.5.275.|8.753.13|5.7.975.|2.75321.|1.......',
      '13..58.5|35..68.6|64..24.6|75..27.5|83..58.3|42..64.2|57..92.7|8...3.1.',
      '8.8653..|46.864..|65.313..|75.275..|5.7532..|13.587..|25.975..|8.531...',
    ], battle: ['11535385', '31358531', '53581321'],
  },
  frostmarch: {
    root: 65, scale: major, bpm: 76, lead: 'sine', harmony: ['14651451', '16351451', '16415351'],
    tunes: [
      '8...5.3.|6...8.6.|4...6.8.|9...7.5.|8.9.853.|6.8.642.|7.9.752.|8.......',
      '3.5...8.|6.3...5.|5.3...7.|9.7...5.|8.5...3.|6.4...2.|5.7.9.7.|8...1...',
      '58..35..|86..53..|64..28..|85..31..|97..52..|75..37..|95..72..|8.......',
    ], battle: ['58585313', '13585358', '53588531'],
  },
  hollow: {
    root: 57, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 82, lead: 'triangle', harmony: ['14261451', '16241451', '14761451'],
    tunes: [
      '1..5.3..|4..8.6..|2..6.4..|6..3.8..|1.3.5.8.|4.6.8.6.|5.7.2.7.|1.......',
      '85..3.1.|63..8.6.|24..6.2.|46..8.4.|13..5.8.|64..2.4.|75..2.7.|8...1...',
      '3.1.5...|6.4.8...|7.5.2...|6.3.8...|5.3.18..|8.6.42..|7.2.57..|8.3.1...',
    ], battle: ['15131351', '13513585', '51538321'],
  },
  sunveil: {
    root: 62, scale: [0, 1, 4, 5, 7, 8, 10], bpm: 104, lead: 'square', harmony: ['12411251', '14162451', '16241451'],
    tunes: [
      '123.5321|24.642.4|468.8642|13.58531|8.753231|246.642.|575.2375|8321....',
      '5.323125|6.424246|8.531358|6.353686|4.262426|8.646864|7.525725|8.321...',
      '13.23.51|68.53.68|24.62.46|48.64.24|15.85.31|46.86.42|57.97.52|83.21...',
    ], battle: ['12135321', '13213585', '58532121'],
  },
  mistwood: {
    root: 64, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 110, lead: 'triangle', harmony: ['14251451', '16471451', '14671451'],
    tunes: [
      '1.35.853|4.68.642|2.46.624|5.72.975|8.53.135|6.42.468|7.59.752|8.31....',
      '35.8.531|63.8.653|46.8.642|57.2.975|13.5.853|64.8.642|75.9.275|83.1....',
      '5.13.581|8.46.864|3.68.653|2.75.972|3.58.531|6.84.642|9.75.275|8.53.1..',
    ], battle: ['13513581', '15135853', '58135321'],
  },
  dungeon: {
    root: 57, scale: [0, 1, 3, 5, 7, 8, 10], bpm: 80, lead: 'triangle', harmony: ['12161251', '16271451', '14721251'],
    tunes: [
      '1...21..|2...42..|1...53..|6...86..|1.2.315.|2.4.642.|5.7.275.|1.......',
      '51..3...|63..8...|24..6...|75..2...|13..85..|46..82..|57..92..|8...1...',
      '13..1.21|46..4.24|75..7.57|24..2.42|15..1.35|26..2.46|57..5.27|8.3.1...',
    ], battle: ['12151531', '11315385', '51531211'],
  },
};

// Keep the existing sixteen-bar D-major woodland theme as Greenwood's first variation.
const woodlandMelody = [
  [66, 69, 74, 0, 73, 69, 66, 0], [64, 69, 73, 0, 71, 69, 64, 0],
  [66, 71, 74, 78, 76, 74, 71, 0], [67, 71, 74, 0, 71, 69, 67, 0],
  [66, 69, 74, 0, 78, 76, 74, 73], [76, 73, 69, 0, 71, 73, 76, 0],
  [74, 71, 66, 0, 67, 69, 71, 73], [74, 0, 69, 66, 62, 0, 0, 0],
  [71, 74, 79, 0, 78, 74, 71, 0], [69, 73, 76, 0, 78, 76, 73, 69],
  [71, 74, 78, 0, 81, 78, 76, 74], [73, 0, 71, 69, 68, 69, 73, 0],
  [71, 74, 79, 0, 78, 76, 74, 71], [73, 76, 81, 0, 79, 76, 73, 69],
  [74, 78, 81, 78, 76, 74, 73, 69], [74, 0, 0, 0, 0, 0, 0, 0],
];
const woodlandChords = [
  [50, 54, 57], [45, 49, 52], [47, 50, 54], [43, 47, 50],
  [50, 54, 57], [45, 49, 52], [43, 47, 50], [50, 54, 57],
  [43, 47, 50], [45, 49, 52], [47, 50, 54], [45, 49, 52],
  [43, 47, 50], [45, 49, 52], [50, 54, 57], [50, 54, 57],
];
const scores = new Map<string, MusicScore>();

export function getMusicScore(zone: string, combat: boolean, variant: number): MusicScore {
  const region = Object.hasOwn(themes, zone) ? zone as keyof typeof themes : 'greenwood';
  const theme = themes[region], index = Number.isFinite(variant) ? ((Math.trunc(variant) % MUSIC_VARIATIONS) + MUSIC_VARIATIONS) % MUSIC_VARIATIONS : 0;
  const id = `${region}-${combat ? 'combat' : 'explore'}-${index + 1}`, cached = scores.get(id);
  if (cached) return cached;
  const note = (degree: number) => theme.root + theme.scale[(degree - 1) % 7] + Math.floor((degree - 1) / 7) * 12;
  let melody = theme.tunes[index].split('|').map(bar => [...bar].map(degree => degree === '.' ? 0 : note(Number(degree))));
  let chords = [...theme.harmony[index]].map(degree => [0, 2, 4].map(interval => note(Number(degree) + interval) - 12));
  if (region === 'greenwood' && index === 0) { melody = woodlandMelody; chords = woodlandChords; }
  if (combat) {
    // Alternate each melody's calls with newly composed, chord-following battle responses.
    melody = melody.map((bar, i) => {
      const root = chords[i][0] + 12, degree = theme.scale.indexOf((root - theme.root + 120) % 12);
      return i % 2 === 0 ? bar.map((pitch, beat) => pitch || chords[i][beat % 3] + 12)
        : [...theme.battle[index]].map(pitch => note(Number(pitch) + degree) - (root < theme.root ? 12 : 0));
    });
  }
  const score: MusicScore = { id, eighth: 30 / (theme.bpm + (combat ? 36 : 0)), melody, chords, lead: combat ? 'square' : theme.lead, percussion: combat };
  scores.set(id, score);
  return score;
}
