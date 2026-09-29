import { SPELLS, SPELL_EFFECT_IDS, type SpellArtId } from './spells.ts';
import type { SpellArt } from './spell-choreography.ts';
import { SPELL_CHOREOGRAPHY_SOURCES } from './spell-visuals.ts';

/** Ranger magic is made from bowcraft, living wood, predators and weather. */
export function drawRangerSpell(id: SpellArtId, a: SpellArt): boolean {
  id = SPELL_CHOREOGRAPHY_SOURCES[id] || id;
  const { shape: s, line: l, arc, detail, phase, p, t, r } = a;
  const flight = phase === 'flight', rise = Math.sin(Math.PI * p), open = Math.min(1, p * 3);
  switch (id) {
    case SPELL_EFFECT_IDS.roll: {
      // Three receding feather wakes trace the tumble, with loose leaves peeling into the dust.
      for (let i = 0; i < 3; i++) {
        const turn = p * Math.PI * 2 - i * .35;
        arc(0, .65, -i * .45, .5 + i * .12, turn, turn + Math.PI * 1.2, .04 * (1 - p), i % 2, Math.PI / 2);
        s('feather', (i - 1) * .3, .12, -.7 - i * .5, .22 * (1 - p), .12, .6, 0, .3);
      }
      for (let i = 0; i < detail(9); i++) {
        const side = i % 2 ? 1 : -1, drift = (p + i * .11) % 1;
        s('leaf', side * (.3 + drift * .8), .12 + Math.sin(drift * Math.PI) * .45, -.3 - i * .14 - drift,
          .13 * (1 - drift), .08, .3, i % 2, t * 6 + i, drift * 2, side * drift);
      }
      return true;
    }
    case 'poison-cloud': {
      if (flight) {
        // A bark-wrapped spore pod leaks two thin corkscrew trails before it ruptures.
        s('arrow', 0, 0, .3, .8, .8, 1.8, 2);
        for (const side of [-1, 1]) {
          s('leaf', side * .16, 0, -.1, .6, 1.1, .6, 3, 0, 0, side * .7);
          for (let j = 0; j < 4; j++) {
            const v = t * 8 + j * .65 + (side < 0 ? Math.PI : 0), d = .16 + j * .065;
            l(Math.cos(v) * d, Math.sin(v) * d, -.4 - j * .2, Math.cos(v + .6) * (d + .04), Math.sin(v + .6) * (d + .04), -.6 - j * .2, .04 - j * .006, 0);
          }
        }
      } else {
        // Fungal soil patches and low rolling spores reach the splash edge without hiding targets.
        const spread = (SPELLS[id].radius ?? 5) * Math.min(1, .15 + p * 3.4);
        for (let j = 0; j < 6; j++) {
          const v = j * Math.PI / 3 + Math.sin(j * 2.3) * .12, d = spread * (.64 + j % 2 * .12), drift = Math.sin(t * 2 + j) * .16;
          l(Math.sin(v) * d * .4, .06, Math.cos(v) * d * .4, Math.sin(v) * d, .07, Math.cos(v) * d, .055, 2);
          s('leaf', Math.sin(v) * d, .08 + rise * .08, Math.cos(v) * d, .35 + rise * .2, .12, .5 + rise * .2, 2, v + drift, -.2);
          s('leaf', Math.sin(v) * d * .8, .17 + rise * .12, Math.cos(v) * d * .8, .4, .18, .65, 3, v - .6, -.55);
          arc(Math.sin(v) * d, .75 + rise * (.5 + j % 2 * .3), Math.cos(v) * d, .38 + rise * .4, v + p * 2, v + p * 2 + 1.9, .045, 1, -.35);
          // Six separated boundary wisps communicate area without a solid target-obscuring disk.
          arc(0, .08, 0, spread, v - .28, v + .28, .04, 1);
        }
        for (let j = 0; j < detail(9); j++) {
          const v = j * 2.4 + t * .35, d = spread * (.25 + j % 3 * .23), h = (p * 1.7 + j * .17) % 1;
          s('spark', Math.sin(v) * d, .7 + h * 1.15, Math.cos(v) * d, .085 * (1 - h), .12, .085, 1, v, -.6);
        }
      }
      return true;
    }
    case 'tame-beast': {
      const y = flight ? 0 : .65, radius = .3 + open * .35;
      for (const side of [-1, 1]) {
        s('leaf', side * radius, y + rise * .2, 0, .7, .5, 1.1, 0, side * .6, 0, side * p);
        arc(0, y, 0, radius, side < 0 ? Math.PI : 0, side < 0 ? Math.PI * 1.8 : Math.PI * .8, .045, 1, Math.PI / 2);
      }
      s('spark', 0, y, 0, .24, .35, .24, 1);
      return true;
    }
    case 'combined-assault': {
      s('arrow', -.2, flight ? 0 : .5, 0, .9, .9, 1.6, 1, 0, flight ? 0 : 1.1);
      for (let claw = 0; claw < 3; claw++) s('slash', .1 + claw * .24, flight ? claw * .12 : .35 + rise * .3, .15, .5, .6, 1.2 + open * .4, 0, .4, 0, -.45);
      return true;
    }
    case 'arrow': {
      // A clean fletched arrow cuts a narrow V through the air, then lodges in the ground.
      if (flight) {
        s('arrow', 0, 0, 0, 1, 1, 1.8);
        for (const side of [-1, 1]) l(side * .32, 0, -.6, side * .08, 0, -1.15, .025, 1);
        s('feather', .11, .05, -.65, .45, .3, .5, 1, .2);
      } else {
        s('arrow', 0, .48, 0, .85, .85, 1.65, 0, 0, 1.06);
        for (const side of [-1, 1]) s('feather', side * p * .55, .18 + rise * .45, .2, .4, .3, .6, 1, side * 1.3, p);
      }
      return true;
    }
    case 'hamstring-shot': {
      // Paired hooked barbs snap shut like a low animal trap; the teeth remain ankle-high.
      const gap = flight ? .27 : .12 + (1 - open) * .68, y = flight ? 0 : .22;
      if (flight) s('arrow', 0, 0, .12, .9, .8, 1.6);
      for (const side of [-1, 1]) {
        l(side * gap, y, -.5, side * (gap + .3), y + .12, 0, .075, 2);
        l(side * (gap + .3), y + .12, 0, side * gap, y, .5, .075, 0);
        for (let j = 0; j < 3; j++) s('shard', side * gap, y + .08, -.32 + j * .32, .17, .13, .38, 1, -side * Math.PI / 2);
      }
      if (!flight) l(-.7, .07, -.65, .7, .07, .65, .025, 1);
      return true;
    }
    case 'power-shot': {
      // A visible crossbow limb and taut string compress behind a broad bolt, then recoil.
      const recoil = flight ? .1 * Math.sin(t * 12) : rise * .45, y = flight ? 0 : .65;
      s('arrow', 0, y, flight ? .2 : .45, 1.75, 1.35, 2.4, 1);
      for (const side of [-1, 1]) {
        l(0, y, -.35, side * (.75 + recoil), y + .16, -.68, .10, 2);
        l(side * (.75 + recoil), y + .16, -.68, side * .85, y + .1, -.25, .085);
        l(side * .85, y + .1, -.25, 0, y, -1.1 + recoil, .025, 1);
      }
      if (!flight) for (const side of [-1, 1]) l(0, .06, .2, side * (1 + p), .06, 1.1 + p, .065, 2);
      return true;
    }
    case 'trail-mending': {
      // Broad crossed bandages wind around the torso, with a leaf dressing at the knot.
      for (let j = 0; j < 3; j++) {
        const y = .45 + j * .34, tighten = .6 - open * .12;
        l(-tighten, y, -.3, tighten, y + .18, .3, .10, 1);
        l(tighten, y, -.3, -tighten, y + .18, .3, .10, 1);
        l(-tighten, y, -.3, -tighten, y + .16, .3, .085);
        l(tighten, y, -.3, tighten, y + .16, .3, .085);
      }
      s('leaf', 0, 1.02, .48, .85, .6, .75, 0, 0, -Math.PI / 2, -.3);
      for (const side of [-1, 1]) l(0, .95, .5, side * .28, .7 + rise * .15, .55, .075, 1);
      return true;
    }
    case 'poison-shot': {
      // An arrow carries a swollen venom sac; impact punctures it into three hanging drops.
      if (flight) {
        s('arrow', 0, 0, .15, .95, .8, 1.65);
        s('leaf', 0, 0, -.2, 1.25, 2.2, .7, 0, 0, 0, t * 2);
        for (const side of [-1, 1]) l(side * .2, 0, -.48, 0, 0, -.68, .06, 2);
      } else {
        for (let j = 0; j < 3; j++) {
          const x = (j - 1) * .6, h = .2 + (1 - p) * (1 + j * .25);
          l(x, h, 0, x, Math.min(2, h + .32), 0, .045, 1);
          s('leaf', x, h, 0, .55, .55, .8, 0, 0, -Math.PI / 2);
          s('leaf', x, .06, 0, .8 + open * .6, .2, 1 + open * .5, 2, j * 2);
        }
      }
      return true;
    }
    case 'concussive-shot': {
      // A blunt hammer cap collapses into a square pressure plate and four ringing stars.
      const y = flight ? 0 : .85;
      if (flight) {
        s('arrow', 0, 0, -.25, .8, .8, 1.3);
        s('shield', 0, 0, .38, .8, .7, .65, 1);
        l(-.4, -.35, .35, .4, .35, .35, .1);
      } else {
        const w = .38 + rise * .35;
        l(-w, y - w, 0, w, y - w, 0, .10, 1); l(w, y - w, 0, w, y + w, 0, .10, 1);
        l(w, y + w, 0, -w, y + w, 0, .10, 1); l(-w, y + w, 0, -w, y - w, 0, .10, 1);
        for (let j = 0; j < 4; j++) { const v = j * Math.PI / 2 + t * 3; s('spark', Math.cos(v) * .85, 1.9, Math.sin(v) * .45, .28, .28, .28, 1); }
      }
      return true;
    }
    case 'multishot': {
      // Three fletched lanes form a broad fork; impact opens three outward pointing chevrons.
      if (flight) for (let j = -1; j <= 1; j++) {
        const x = j * .46;
        s('arrow', x, -.1 * Math.abs(j), -.24 * Math.abs(j), .7, .7, 1.45, j ? 0 : 1, j * .25);
        l(x, -.1 * Math.abs(j), -.5, x * 1.4, -.1, -1.15, .045, 1);
      } else for (let j = -1; j <= 1; j++) {
        const x = j * (.5 + p * .8), z = .2 + (1 - Math.abs(j)) * .3;
        l(x - .24, .18, z - .25, x, .18, z + .18, .07);
        l(x, .18, z + .18, x + .24, .18, z - .25, .07, 1);
      }
      return true;
    }
    case 'barkskin': {
      // Staggered bark boards close around the body; branching seams show living wood.
      for (let j = 0; j < 6; j++) {
        const v = j * Math.PI / 3, d = .8 - open * .18, x = Math.sin(v) * d, z = Math.cos(v) * d;
        s('shield', x, .83 + j % 2 * .17, z, .72, 1.7, .8, j % 2 ? 2 : 0, v);
        l(x, .25, z, x * .95, 1.58, z * .95, .045, 1);
        l(x, .75, z, x + Math.cos(v) * .2, 1.03, z - Math.sin(v) * .2, .028, 2);
      }
      for (let j = 0; j < 3; j++) s('leaf', Math.sin(j * 2.1) * .65, 1.75 + rise * .15, Math.cos(j * 2.1) * .65, .6, .4, .8, 1, j * 2.1, -.7);
      return true;
    }
    case 'volley': {
      // Parallel aerial shafts become a sparse, evenly spaced arrow fence on contact.
      if (flight) for (let j = 0; j < 5; j++) {
        const x = (j - 2) * .22, z = -.18 * Math.abs(j - 2);
        s('arrow', x, .28 * Math.sin(j + t * 3), z, .55, .55, 1.1);
        l(x, .25, z - .4, x, .6, z - 1.1, .025, 1);
      } else for (let j = 0; j < 5; j++) {
        const z = (j % 2) * .45, y = .42 + (1 - open) * (1.4 + j * .12);
        s('arrow', (j - 2) * .44, y, z, .65, .65, 1.35, 0, 0, Math.PI / 2);
        l((j - 2) * .44 - .12, .05, z, (j - 2) * .44 + .12, .05, z, .045, 1);
      }
      return true;
    }
    case 'frost-arrow': {
      // A crystalline snowflake arrowhead leaves an angular, six-spoked frost scar.
      const y = flight ? 0 : .08, spread = flight ? .3 : .45 + p * .8;
      if (flight) s('arrow', 0, 0, -.15, .9, .9, 1.75, 1);
      for (let j = 0; j < 6; j++) {
        const v = j * Math.PI / 3, x = Math.cos(v) * spread, z = Math.sin(v) * spread;
        if (flight) l(0, 0, .45, x, z, .45, .055, 1);
        else { l(0, y, 0, x, y, z, .065, 1); l(x * .58, y, z * .58, x * .7 - z * .22, y, z * .7 + x * .22, .035); }
      }
      if (!flight) s('shard', 0, .3 + rise * .18, 0, .7, .65, .95, 0, 0, -Math.PI / 2);
      return true;
    }
    case 'ricochet-shot': {
      // A spinning boomerang of two barbed vanes leaves a zigzag ricochet mark.
      if (flight) {
        const spin = t * 10;
        for (const side of [-1, 1]) {
          s('arrow', Math.cos(spin) * side * .26, Math.sin(spin) * side * .26, 0, .65, .65, 1.1, 0, side * .75, 0, spin);
          l(0, 0, -.3, Math.cos(spin) * side * .62, Math.sin(spin) * side * .62, .1, .055, 1);
        }
      } else {
        const d = .3 + p;
        l(-d, .15, -.55, d * .3, .2, -.2, .065, 1);
        l(d * .3, .2, -.2, -d * .3, .25, .25, .065);
        l(-d * .3, .25, .25, d, .3, .65, .065, 1);
        s('arrow', d, .32, .65, .6, .6, .8, 0, Math.PI / 3);
      }
      return true;
    }
    case 'hunters-reprieve': {
      // A cupped feather nest closes around a bright seed, then releases it upward.
      for (let j = 0; j < 7; j++) {
        const v = j / 7 * Math.PI * 2, d = .58 + rise * .16;
        s('feather', Math.sin(v) * d, .65 + rise * .32, Math.cos(v) * d, .9, .5, 1.1, 0, v, -.8 + p * .65);
      }
      s('leaf', 0, .55 + p * 1.7, 0, .75, 1.8, .9, 1, t * 2, -Math.PI / 2);
      for (const side of [-1, 1]) arc(0, .22, 0, .75, side < 0 ? 0 : Math.PI, side < 0 ? 1.25 : 4.4, .065, 2);
      return true;
    }
    case 'piercing-shot': {
      // A helical auger tip drills forward; two split armor plates peel away on impact.
      if (flight) {
        l(0, 0, -1.25, 0, 0, .65, .05, 1);
        s('shard', 0, 0, .44, .65, .65, 1.3, 1);
        for (let j = 0; j < 12; j++) {
          const z = -.85 + j * .1, v = j * .8 + t * 14, next = v + .8;
          l(Math.cos(v) * .22, Math.sin(v) * .22, z, Math.cos(next) * .22, Math.sin(next) * .22, z + .1, .045);
        }
      } else for (const side of [-1, 1]) {
        s('shield', side * (.28 + p * .9), .6 + rise * .3, 0, .7, 1.35, .6, 2, side * p * 1.6, 0, side * p);
        l(side * .07, .06, -.9, side * .13, .06, .95, .055, 1);
      }
      return true;
    }
    case 'thornburst': {
      // Irregular bramble forks spread at the real wavefront, with upright barbed thorns.
      for (let j = 0; j < 8; j++) {
        const v = j * Math.PI / 4, x = Math.sin(v) * r, z = Math.cos(v) * r, h = .35 + rise * .65;
        l(x * .66, .09, z * .66, x, h, z, .085, 2);
        l(x, h, z, x + Math.cos(v) * .42, h * .6, z - Math.sin(v) * .42, .055);
        s('shard', x, h + .2, z, .36, .3, .85, 1, v, -Math.PI / 2);
        s('leaf', x * .85, h * .5, z * .85, .65, .4, .85, 0, v + .8, -.6);
      }
      return true;
    }
    case 'serpent-fan': {
      // Three small snakes spread as separate S-curves, each ending in a forked tongue.
      for (let snake = -1; snake <= 1; snake++) {
        const spread = flight ? .3 : .6 + p * .4, y = flight ? 0 : .28;
        for (let j = 0; j < 6; j++) {
          const z = -.85 + j * .24, x = snake * spread + Math.sin(j * .9 - t * 8) * .13;
          const nx = snake * spread + Math.sin((j + 1) * .9 - t * 8) * .13;
          l(x, y, z, nx, y, z + .24, .065, j % 2 ? 0 : 1);
        }
        s('leaf', snake * spread, y, .6, .4, .7, .6, 0);
        for (const fork of [-1, 1]) l(snake * spread, y, .78, snake * spread + fork * .09, y, .96, .022, 1);
      }
      return true;
    }
    case 'rapid-fire': {
      // A compact stack of successive bolt silhouettes advances along a straight firing rail.
      if (flight) {
        l(-.2, -.1, -1.35, -.2, -.1, .35, .035, 2); l(.2, -.1, -1.35, .2, -.1, .35, .035, 2);
        for (let j = 0; j < 4; j++) s('arrow', 0, .03, .3 - j * .4 + (t * 3 % .4), .55, .55, .72, j ? 0 : 1);
      } else for (let j = 0; j < 4; j++) {
        const z = -.55 + j * .37, x = (j % 2 ? -1 : 1) * .16;
        s('arrow', x, .38 + (1 - open) * j * .18, z, .5, .5, .85, 0, 0, 1.05);
        l(x - .16, .06, z - .12, x + .16, .06, z + .12, .05, 1);
      }
      return true;
    }
    case 'explosive-arrow': {
      // A wrapped powder charge and sparking fuse split into a jagged starburst crater.
      if (flight) {
        s('arrow', 0, 0, .2, .95, .8, 1.55);
        for (const side of [-1, 1]) s('shield', side * .12, 0, -.22, .45, .45, .55, 2, side * Math.PI / 2);
        l(0, .12, -.35, .18, .38, -.68, .035, 1);
        s('spark', .18, .38, -.68, .2 + Math.sin(t * 27) * .06, .25, .25, 1);
      } else for (let j = 0; j < 8; j++) {
        const v = j * Math.PI / 4, d = .35 + open * 1.45;
        l(Math.sin(v) * .2, .1, Math.cos(v) * .2, Math.sin(v) * d, .13, Math.cos(v) * d, .12, 2);
        s('flame', Math.sin(v) * d * .7, .3 + rise * (j % 2 ? .8 : 1.5), Math.cos(v) * d * .7, .65, .5, 1 + rise, j % 2 ? 0 : 1, v, -Math.PI / 2);
      }
      return true;
    }
    case 'silken-guard': {
      // A suspended web canopy: eight spokes, three concentric polygon threads, a bright knot.
      for (let j = 0; j < 8; j++) {
        const v = j * Math.PI / 4, next = v + Math.PI / 4;
        l(0, 2.2, 0, Math.sin(v) * 1.05, .25, Math.cos(v) * 1.05, .022, 1);
        for (let level = 1; level <= 3; level++) {
          const d = level * .29, y = 2.2 - level * .5 + rise * .12;
          l(Math.sin(v) * d, y, Math.cos(v) * d, Math.sin(next) * d, y, Math.cos(next) * d, .023, level % 2);
        }
      }
      s('spark', 0, 2.2, 0, .26, .26, .26, 1, t);
      return true;
    }
    case 'tranquilizing-shot': {
      // A feather-tufted dart unfolds into a drooping poppy with three descending sleep marks.
      if (flight) {
        s('arrow', 0, 0, .25, .55, .55, 1.25, 1);
        for (let j = 0; j < 5; j++) { const v = j * Math.PI * .4; s('feather', Math.cos(v) * .16, Math.sin(v) * .16, -.4, .75, .4, .7, 0, .3, 0, v); }
      } else {
        l(0, .1, 0, 0, 1.25 - p * .4, 0, .055, 2);
        for (let j = 0; j < 5; j++) { const v = j * Math.PI * .4; s('leaf', Math.sin(v) * .3, 1.2 - p * .4, Math.cos(v) * .3, 1.05, .6, .85, 0, v, p * .9); }
        for (let j = 0; j < 3; j++) {
          const y = 1.75 + j * .26 - p * .35, x = j * .23;
          l(x - .1, y, 0, x + .1, y, 0, .025, 1); l(x + .1, y, 0, x - .1, y - .14, 0, .025, 1); l(x - .1, y - .14, 0, x + .1, y - .14, 0, .025, 1);
        }
      }
      return true;
    }
    case 'wild-renewal': {
      // Two fern fronds unfurl from a spring; paired leaflets open from bottom to top.
      l(0, .05, 0, 0, .65, 0, .10, 2);
      for (const side of [-1, 1]) for (let j = 0; j < 6; j++) {
        const growth = Math.max(.08, Math.min(1, p * 2 - j * .12)), x = side * j * .12, y = .5 + j * .22;
        l(x, y, 0, x + side * .12, y + .22, 0, .045, 0);
        s('leaf', x + side * .2 * growth, y + .07, .08, .8 * growth, .6, .7, 1, side * .7, -.6, -side * .6);
        s('leaf', x - side * .12 * growth, y + .06, -.08, .65 * growth, .5, .6, 0, -side * .7, -.8, side * .5);
      }
      for (let j = 0; j < detail(5); j++) s('spark', Math.sin(j * 2.4 + t) * .5, (p + j / 5) % 1 * 2, Math.cos(j * 2.4) * .45, .11, .16, .11, 1);
      return true;
    }
    case 'razor-flurry': {
      // A serrated folding fan opens into seven scythe-like cuts, rather than parallel arrows.
      const y = flight ? 0 : .65, spread = flight ? .85 : .8 + open * .5;
      for (let j = 0; j < 7; j++) {
        const v = -.95 + j * .315, x = Math.sin(v) * spread, z = Math.cos(v) * spread;
        l(0, y, -.45, x, y, z, .045, 2);
        s('slash', x, y, z, .45, .32, .7, j % 2 ? 0 : 1, v + t * .3);
      }
      if (!flight) for (let j = -1; j <= 1; j++) l(j * .3, .09, -.7, j * .65, .09, 1.15, .08, 1);
      return true;
    }
    case 'viper-strike': {
      // A single hooded cobra rears behind two long fangs; impact drives both fangs downward.
      if (flight) {
        s('leaf', 0, .15, -.25, 2.2, .8, 1.2, 0, 0, -.55);
        s('shield', 0, .08, .1, .6, .55, .65, 2);
        for (const side of [-1, 1]) { s('shard', side * .16, -.12, .45, .2, .2, .85, 1); s('spark', side * .18, .15, .18, .08, .08, .08, 1); }
        l(0, .12, -.6, .25 * Math.sin(t * 8), 0, -1.2, .10);
      } else {
        for (const side of [-1, 1]) {
          s('shard', side * .28, .32 + (1 - open) * 1.6, 0, .35, .3, 1.25, 1, 0, Math.PI / 2);
          s('leaf', side * .28, .055, 0, .7 + p, .15, .9 + p, 2, side);
        }
        arc(0, .13, 0, .85, -.3, Math.PI + .3, .12, 0);
      }
      return true;
    }
    case 'forest-ward': {
      // Four living roots form pointed gothic arches, joined by leafy branch lintels.
      for (let j = 0; j < 4; j++) {
        const v = j * Math.PI / 2, dx = Math.sin(v), dz = Math.cos(v);
        l(dx * 1.1, .05, dz * 1.1, dx * .9, 1.25, dz * .9, .14, 2);
        l(dx * .9, 1.25, dz * .9, dx * .55, 2.1, dz * .55, .095);
        l(dx * .55, 2.1, dz * .55, 0, 2.5 + rise * .2, 0, .06, 1);
        s('leaf', dx * .82, 1.5, dz * .82, 1.1, .7, 1.15, 0, v, -.75);
        s('leaf', dx * .5, 2.03, dz * .5, .85, .5, 1, 1, v + .7, -.35);
      }
      return true;
    }
    case 'hail-of-arrows': {
      // Three separated curtains descend in sequence; falling shafts become a planted grid.
      const curtain = Math.floor(p * 3), y0 = flight ? -.8 : .3;
      for (let row = 0; row < 3; row++) for (let j = -1; j <= 1; j++) {
        const fall = Math.max(0, Math.min(1, p * 3 - row)), y = flight ? y0 + (1 - fall) * 1.8 : .4 + (1 - fall) * 2;
        s('arrow', j * .48, y, (row - 1) * .45, .62, .62, 1.25, row === curtain ? 1 : 0, 0, Math.PI / 2);
        if (row === curtain) l(j * .48, y + .3, (row - 1) * .45, j * .48, y + (flight ? .5 : .7), (row - 1) * .45, .025, 1);
      }
      return true;
    }
    case 'binding-arrow': {
      // A rope-wrapped arrow unspools into four pinned corners and a tightening X snare.
      if (flight) {
        s('arrow', 0, 0, .12, .85, .85, 1.5);
        for (let j = 0; j < 8; j++) { const v = j * .8 + t * 5; l(Math.cos(v) * .2, Math.sin(v) * .2, -.6 + j * .1, Math.cos(v + .8) * .2, Math.sin(v + .8) * .2, -.5 + j * .1, .045, 1); }
      } else {
        const d = 1.15 - open * .35;
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          s('arrow', x * d, .32, z * d, .7, .7, 1.1, 0, 0, Math.PI / 2);
          l(x * d, .16, z * d, 0, .55 + rise * .3, 0, .065, 1);
          l(x * d, .16, z * d, x * d, .16, -z * d, .035, 2);
        }
        s('leaf', 0, .6, 0, .5, .5, .65, 0, t * 2);
      }
      return true;
    }
    case 'eagles-eye': {
      // Broad articulated eagle wings frame a pointed beak; impact reveals a watchful eye.
      if (flight) {
        s('arrow', 0, 0, .5, .85, .85, 1.5, 1);
        for (const side of [-1, 1]) for (let j = 0; j < 5; j++) {
          const x = side * (.25 + j * .22), flap = Math.sin(t * 7) * j * .065;
          s('feather', x, flap, -.15 - j * .12, .9, .55, .85 + j * .08, j % 2, side * .65, flap, side * .2);
        }
      } else {
        const lid = .3 + rise * .13;
        for (const side of [-1, 1]) {
          l(-.95, 1.15, 0, -.4, 1.15 + side * lid, 0, .065, side > 0 ? 1 : 0);
          l(-.4, 1.15 + side * lid, 0, .4, 1.15 + side * lid, 0, .065, side > 0 ? 1 : 0);
          l(.4, 1.15 + side * lid, 0, .95, 1.15, 0, .065, side > 0 ? 1 : 0);
        }
        s('shard', 0, 1.15, 0, .35, .35, .9 - p * .4, 1, 0, -Math.PI / 2);
        for (const side of [-1, 1]) s('feather', side * 1.1, 1.05, 0, .7, .4, .9, 0, side * 1.5, -.2);
      }
      return true;
    }
    case 'frostfall-volley': {
      // Three suspended icicles form a falling crown, breaking into a triangular ice cage.
      if (flight) for (let j = 0; j < 3; j++) {
        const v = j * Math.PI * 2 / 3 + t * 2;
        s('shard', Math.cos(v) * .48, Math.sin(v) * .48, -.25, .7, .7, 1.8, j ? 0 : 1);
        l(Math.cos(v) * .48, Math.sin(v) * .48, -.7, 0, 0, -1.3, .025, 1);
      } else for (let j = 0; j < 3; j++) {
        const v = j * Math.PI * 2 / 3, n = v + Math.PI * 2 / 3, d = 1 + p * .4;
        const x = Math.sin(v) * d, z = Math.cos(v) * d;
        s('shard', x, .65 + rise * .35, z, .85, .7, 2, 0, v, -Math.PI / 2);
        l(x, .12, z, Math.sin(n) * d, .12, Math.cos(n) * d, .055, 1);
        l(x, 1.1, z, 0, 1.7 - p * .4, 0, .035, 1);
      }
      return true;
    }
    case 'survival-instinct': {
      // A protective wolf mask, alert ears and swept cheek plates snap around the ranger.
      const y = 1.25, spread = .6 + (1 - open) * .3;
      s('shield', 0, y, .7, 1.45, 1.55, .9, 2);
      for (const side of [-1, 1]) {
        s('shard', side * spread, 1.97, .55, .65, .5, 1.1, 0, side * .25, -Math.PI / 2, side * -.3);
        l(side * .16, 1.47, .84, side * .48, 1.58, .75, .065, 1);
        s('feather', side * .65, .95, .45, 1.2, .8, 1.2, 0, side * .8, -.8);
        l(side * .14, .92, .87, 0, .75, 1.05, .09, 1);
      }
      s('leaf', 0, .94, 1.06, .55, .5, .4, 1, 0, -Math.PI / 2);
      return true;
    }
    case 'starfall-arrow': {
      // A five-point comet star rides the arrow, then unfolds into a large ground pentagram.
      const y = flight ? 0 : .08, d = flight ? .62 : .4 + open * 1.8;
      for (let j = 0; j < 5; j++) {
        const v = j * Math.PI * 2 / 5, n = v + Math.PI * 4 / 5;
        if (flight) l(Math.sin(v) * d, Math.cos(v) * d, .1, Math.sin(n) * d, Math.cos(n) * d, .1, .055, 1);
        else l(Math.sin(v) * d, y, Math.cos(v) * d, Math.sin(n) * d, y, Math.cos(n) * d, .07, j % 2);
      }
      if (flight) { s('arrow', 0, 0, .1, 1, 1, 1.7); for (const side of [-1, 1]) l(side * .25, 0, -.3, side * .12, 0, -1.45, .07, 0); }
      else for (let j = 0; j < 5; j++) { const v = j * Math.PI * 2 / 5; s('spark', Math.sin(v) * d, .2 + rise * .7, Math.cos(v) * d, .4, .8, .4, 1); }
      return true;
    }
    case 'relentless-volley': {
      // Rotating magazine vanes feed a forward arrow; impact stamps a six-toothed gear mark.
      const y = flight ? 0 : .18, wheel = t * 8;
      if (flight) {
        for (let j = 0; j < 6; j++) {
          const v = j * Math.PI / 3 + wheel;
          l(0, 0, -.45, Math.cos(v) * .58, Math.sin(v) * .58, -.45, .055, 2);
          s('feather', Math.cos(v) * .5, Math.sin(v) * .5, -.45, .6, .35, .7, j % 2, 0, 0, v);
        }
        s('arrow', 0, 0, .28, .8, .8, 1.4, 1);
      } else for (let j = 0; j < 6; j++) {
        const v = j * Math.PI / 3 + p * .35, d = .55 + open * .5;
        l(Math.sin(v) * .35, y, Math.cos(v) * .35, Math.sin(v) * d, y, Math.cos(v) * d, .10, j % 2);
        s('arrow', Math.sin(v) * d, .28, Math.cos(v) * d, .5, .5, .65, 1, v);
      }
      return true;
    }
    case 'heart-of-the-wild': {
      // A living tree grows heart-shaped boughs above a visible root system.
      const h = .75 + open * 1.2;
      l(0, .05, 0, 0, h, 0, .18, 2);
      for (let j = 0; j < 5; j++) { const v = j * Math.PI * .4; l(0, .18, 0, Math.sin(v) * (1 + p * .4), .055, Math.cos(v) * (1 + p * .4), .085, 0); }
      for (const side of [-1, 1]) {
        l(0, h * .55, 0, side * .72, h + .28, 0, .09);
        l(side * .72, h + .28, 0, side * .44, h + .7, 0, .075);
        l(side * .44, h + .7, 0, 0, h + .43, 0, .07, 1);
        for (let j = 0; j < 3; j++) s('leaf', side * (.25 + j * .2), h + .22 + j * .15, 0, .85, .6, 1, j % 2, side * .7, -.65, side * .45);
      }
      s('spark', 0, h + .18, .07, .32 + rise * .12, .5, .3, 1);
      return true;
    }
    case 'twinshot': {
      // Two complete arrows braid around a shared axis, then leave a unmistakable paired hit.
      if (flight) {
        for (const side of [-1, 1]) {
          const v = t * 7 + (side < 0 ? Math.PI : 0), x = Math.cos(v) * .34, y = Math.sin(v) * .34;
          s('arrow', x, y, 0, .85, .85, 1.65, side < 0 ? 0 : 1);
          l(x, y, -.6, -x, -y, -1.05, .035, 1);
        }
      } else {
        for (const side of [-1, 1]) {
          s('arrow', side * .32, .53, 0, .85, .85, 1.6, side < 0 ? 0 : 1, side * .14, 1.08);
          arc(side * .32, .1, 0, .22 + p * .38, -Math.PI / 2, Math.PI / 2, .055, 1);
        }
        l(-.32, .08, 0, .32, .08, 0, .07, 2);
      }
      return true;
    }
    case 'venom-detonation': {
      // Poison veins retract into a three-lobed sac, which ruptures upward into venom jets.
      const contract = Math.max(.12, 1 - p * 2.2), blast = Math.max(0, (p - .32) / .68);
      for (let j = 0; j < 6; j++) {
        const v = j * Math.PI / 3, d = .25 + contract * 1.45;
        l(Math.sin(v) * d, .09, Math.cos(v) * d, Math.sin(v + .35) * d * .45, .13, Math.cos(v + .35) * d * .45, .10, 2);
        if (blast > 0) {
          const x = Math.sin(v) * blast * 1.3, z = Math.cos(v) * blast * 1.3, y = .2 + Math.sin(blast * Math.PI) * (1.3 + j % 2 * .5);
          l(0, .35, 0, x, y, z, .065, 1);
          s('leaf', x, y, z, .55, .75, .85, 0, v, -Math.PI / 2);
        }
      }
      for (let j = 0; j < 3; j++) { const v = j * Math.PI * 2 / 3; s('leaf', Math.sin(v) * .24 * contract, .35, Math.cos(v) * .24 * contract, (.4 + contract) * .85, .9, .95, 0, v, -.6); }
      return true;
    }
    default: return false;
  }
}
