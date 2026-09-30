// Time-Spaces (like NosTale): a glowing stone in the world opens a timed run through sealed chambers. Defeat every
// monster in a chamber to open its gate; the last chamber holds a boss and a reward chest. Finish quickly for a
// better rank (S / A / B / C) and bigger rewards. Monsters inside never respawn, and every run starts fresh.
import { MAPS } from './maps.js';

export const TIMESPACES = {
  ts1: { name: 'Jelly Warren', num: 1, level: 'Lv. 1-4', minLv: 1, limit: 300, map: 'fields', at: [-12, -4],
    desc: 'A pocket of time where jellies multiply without end. Their king waits in the last chamber.',
    chambers: [[{ type: 'jelly', n: 5 }], [{ type: 'jelly', n: 4 }, { type: 'hopper', n: 4 }], [{ type: 'hopper', n: 2 }, { type: 'kingjelly', at: [0, -4] }]],
    reward: { xp: 320, jobXp: 90, gold: 220, saat: 1 } },
  ts2: { name: 'Shroom Hollow', num: 2, level: 'Lv. 4-7', minLv: 3, limit: 360, map: 'woods', at: [5, 14],
    desc: 'Spores drift through a forest frozen in time. The Shroom Lord rules its heart.',
    chambers: [[{ type: 'shroom', n: 6 }], [{ type: 'shroom', n: 4 }, { type: 'wolf', n: 3 }], [{ type: 'wolf', n: 2 }, { type: 'shroomlord', at: [0, -4] }]],
    reward: { xp: 850, jobXp: 180, gold: 420, saat: 2 } },
  ts3: { name: 'Crab Cove', num: 3, level: 'Lv. 5-8', minLv: 4, limit: 420, map: 'coast', at: [-10, -4],
    desc: 'A tide pool trapped between moments, guarded by the Crab King.',
    chambers: [[{ type: 'crab', n: 5 }], [{ type: 'bluejelly', n: 5 }, { type: 'crab', n: 3 }], [{ type: 'bluejelly', n: 3 }, { type: 'crabking', at: [0, -4] }]],
    reward: { xp: 1000, jobXp: 200, gold: 500, saat: 2 } },
};

export const chamberId = (ts, i) => `${ts}_${i + 1}`;

// register every chamber as a small map; stones go into their outdoor maps
for (const [id, ts] of Object.entries(TIMESPACES)) {
  ts.chambers.forEach((mons, i) => {
    const last = i === ts.chambers.length - 1;
    MAPS[chamberId(id, i)] = {
      name: `TS ${ts.num} · ${ts.name}`, theme: 'timespace', dungeon: true, timespace: id, chamber: i, last,
      size: [52, 52], seed: 400 + ts.num * 10 + i, level: `Chamber ${i + 1} / ${ts.chambers.length}`,
      sky: 0x1e1438, fog: [30, 110], music: 'grotto',
      portals: [
        { id: 'south', edge: 'south', at: 0, to: 'sealed' },
        ...(last ? [] : [{ id: 'north', edge: 'north', at: 0, to: chamberId(id, i + 1), toPortal: 'south' }]),
      ],
      monsters: mons,
    };
  });
  const m = MAPS[ts.map];
  (m.tsStones ||= []).push({ id, name: `Time-Space ${ts.num}`, at: ts.at });
}

export const RANKS = [['S', 0.4, 1.5], ['A', 0.6, 1.25], ['B', 0.85, 1], ['C', Infinity, 0.75]];
export function rankFor(used, limit) {
  const f = used / limit;
  return RANKS.find(([, max]) => f <= max);
}
