import { SPELL_EFFECT_IDS, type AbilityId } from './spells.ts';
import type { SpellArt } from './spell-choreography.ts';

const PI = Math.PI, TAU = PI * 2, UP = -PI / 2;

/** Each blessing has a complete silhouette, retained even with decorative detail disabled. */
export function drawClericSpell(id: AbilityId, a: SpellArt): boolean {
  const { shape, line, ring, arc, p, t, r } = a;
  const flight = a.phase === 'flight', h = flight ? 0 : .72;
  const open = Math.sin(Math.min(1, p * 2.4) * PI / 2);
  switch (id) {
    case SPELL_EFFECT_IDS.revivify:
      // A rising pair of wings carries three broken halos away from the fallen ally.
      for (let i = 0; i < 3; i++) {
        const height = .15 + p * 2.4 + i * .35, radius = .8 - i * .15;
        for (const side of [-1, 1]) {
          arc(0, height, 0, radius, side * PI / 2, side * PI / 2 + PI * .65, .035 * (1 - p), 1);
          shape('feather', side * (.25 + i * .22) * open, height, -.12 * i, .2 * (1 - p), .12, .65, 1, side * .65, -p * .3);
        }
      }
      break;
    case SPELL_EFFECT_IDS.lightspeed:
      // Wing feathers unfurl backwards, then leave two braided golden foot trails.
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          shape('feather', side * (.3 + i * .2 * open), .35 + i * .24, -.2 - p - i * .14, .3 * (1 - p), .15, .8 + i * .1, 1, side * (.35 + open * .3));
          const q = i * .35 + t * 5, next = q + .35, z = -.15 - i * .38;
          line(side * .38 + Math.sin(q) * .1, .12, z, side * .38 + Math.sin(next) * .1, .12, z - .38, .035 * (1 - p), i % 2);
        }
        arc(side * .3, .08, -.2, .35 + p * .8, -PI * .2, PI * .8, .025 * (1 - p), 1);
      }
      break;
    case 'edict-of-the-dawn':
      // A solar crown opens above a broken healing wave; gold grains rise between the rays.
      for (let i = 0; i < 8; i++) {
        const q = i * TAU / 8, radius = .6 + p * 1.6;
        arc(0, .1, 0, radius, q - .19, q + .19, .03 * (1 - p), i % 2);
        line(Math.sin(q) * .4, 1.9, Math.cos(q) * .4, Math.sin(q) * (.6 + open * .5), 1.9 + Math.sin(p * PI) * .15, Math.cos(q) * (.6 + open * .5), .035 * (1 - p), 1);
        const lift = (p + i * .12) % 1;
        shape('spark', Math.sin(q) * .7, .3 + lift * 1.7, Math.cos(q) * .7, .065 * (1 - lift), .13, .065, 1);
      }
      break;
    case 'titans-edict':
      // Six runic cornerstones lock into the shield; their reflection strokes flare outward.
      for (let i = 0; i < 6; i++) {
        const q = i * TAU / 6, next = q + TAU / 6, radius = .7 + open * .45;
        line(Math.sin(q) * radius, .12, Math.cos(q) * radius, Math.sin(next) * radius, .12, Math.cos(next) * radius, .035, 1);
        shape('rune', Math.sin(q) * radius, .3 + i % 2 * .25, Math.cos(q) * radius, .16 * open, .16, .16, i % 2, q, UP);
        const flare = Math.sin(p * PI);
        line(Math.sin(q) * .9, .8, Math.cos(q) * .9, Math.sin(q) * (1.1 + flare * .4), 1.1, Math.cos(q) * (1.1 + flare * .4), .04 * (1 - p), 1);
      }
      break;
    case 'eternal-edict':
      // Two interlaced infinity paths pass through the hourglass; motes loop rather than burst.
      for (const side of [-1, 1]) for (let i = 0; i < 20; i++) {
        const q = i * TAU / 20 + t * side, next = q + TAU / 20;
        line(Math.sin(q), 1.2 + Math.sin(q * 2) * .42, side * .18, Math.sin(next), 1.2 + Math.sin(next * 2) * .42, side * .18, .025 * (1 - p), side < 0 ? 0 : 1);
      }
      for (let i = 0; i < a.detail(8); i++) {
        const q = i * TAU / 8 + t * 5;
        shape('spark', Math.sin(q), 1.2 + Math.sin(q * 2) * .42, .2, .065, .09, .065, 1);
      }
      break;
    case 'smite': { // A cruciform dart; its four barbs unfold on contact.
      const spread = flight ? .23 : .23 + p * .62;
      shape('shard', 0, h, 0, .58, .58, flight ? 1.3 : .8, 1);
      for (const side of [-1, 1]) {
        shape('arrow', side * spread, h, -.12, .35, .35, .62, 0, side * .8);
        shape('arrow', 0, h + side * spread, -.12, .3, .3, .52, 0, 0, side * .8);
      }
      line(0, h, -.84 * (1 - p), 0, h, .45, .035, 1);
      break;
    }
    case 'heal': { // An open prayer book, with pages turning into the recipient.
      const spread = .3 + open * .4;
      line(0, h, -.48, 0, h, .48, .04, 1);
      for (const side of [-1, 1]) {
        const x = side * spread;
        line(0, h, -.48, x, h + .12, -.4, .027);
        line(x, h + .12, -.4, x, h + .12, .48, .027);
        line(x, h + .12, .48, 0, h, .48, .027);
        for (let row = 0; row < 3; row++) line(side * .12, h + .06, -.2 + row * .2, x * .83, h + .16, -.15 + row * .2, .012, 1);
        const turn = t * 2 + (side + 1) * .8;
        shape('leaf', side * .26 * Math.cos(turn), h + .18 + .24 * Math.abs(Math.sin(turn)), 0, .9, .35, .84, 1, side * .4, 0, side * Math.sin(turn) * .6);
      }
      break;
    }
    case 'holy-nova': { // A twelve-rayed solar wheel expands from the caster.
      const radius = Math.max(.35, r);
      for (let i = 0; i < 12; i++) {
        const angle = i * TAU / 12, c = Math.cos(angle), s = Math.sin(angle);
        line(c * radius * .68, .08, s * radius * .68, c * radius, .08, s * radius, .055, i % 2);
        shape('flame', c * radius, .1, s * radius, .3, .35, .72, i % 2, PI / 2 - angle);
      }
      arc(0, .07, 0, radius * .7, 0, TAU, .024, 1);
      break;
    }
    case 'flash-heal': { // Four detached cross arms snap inward in a bright heartbeat.
      const gap = .04 + Math.pow(1 - p, 3) * .8;
      for (const side of [-1, 1]) {
        line(side * gap, h, 0, side * (gap + .42), h, 0, .11, 1);
        line(0, h + side * gap, 0, 0, h + side * (gap + .42), 0, .11, 1);
      }
      shape('spark', 0, h, 0, .22 + .22 * Math.sin(p * PI), .4, .22, 0);
      for (const side of [-1, 1]) shape('feather', side * .5, h + .25 * p, -.12, .4, .4, .68, 0, side * .85, UP * .25);
      break;
    }
    case 'power-word-shield': { // A sealed diamond lattice, rather than a featureless bubble.
      shape('shield', 0, h, .08, 1.9 * open, 1.65, .7, 0);
      for (let i = -2; i <= 2; i++) {
        const x = i * .2, length = .55 - Math.abs(i) * .07;
        line(x - length * .5, h - length * .6, .25, x + length * .5, h + length * .6, .25, .022, 1);
        line(x - length * .5, h + length * .6, .25, x + length * .5, h - length * .6, .25, .022, 1);
      }
      shape('rune', 0, h + .12, .29, .21, .21, .21, 1, 0, UP);
      break;
    }
    case 'renew': { // Three successive buds grow into a small branching tree of life.
      line(0, .06, 0, 0, .35 + open * 1.3, 0, .045, 1);
      for (let tier = 0; tier < 3; tier++) {
        const growth = .25 + .75 * Math.max(0, Math.min(1, p * 3 - tier + .6));
        const y = .38 + tier * .43;
        for (const side of [-1, 1]) {
          line(0, y, 0, side * .3 * growth, y + .2 * growth, 0, .025);
          shape('leaf', side * .38 * growth, y + .2, 0, 1.2 * growth, .6, .66 * growth, tier % 2, 0, UP, -side * .75);
        }
        shape('spark', 0, y + .25, 0, .12 * growth, .14, .12, 1);
      }
      break;
    }
    case 'searing-light': { // A narrow burning beam is focused through an almond-shaped eye.
      const aperture = .2 + .09 * Math.sin(t * 13);
      for (const side of [-1, 1]) shape('slash', 0, h + side * aperture, -.15, .52, .42, .35, side > 0 ? 1 : 0, 0, UP, side > 0 ? 0 : PI);
      shape('spark', 0, h, .02, .25, .3, .25, 1);
      line(0, h, -.9, 0, h, .85 + (flight ? .2 : p), .045, 1);
      line(-.06, h, -.55, -.06, h, .5, .012);
      line(.06, h, -.55, .06, h, .5, .012);
      break;
    }
    case 'binding-light': { // A braided tether closes into four anchored ankle ribbons.
      if (flight) {
        for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
          const z = -.9 + i * .16, next = z + .16;
          line(side * Math.sin(z * 7 + t * 7) * .18, side * .07, z, side * Math.sin(next * 7 + t * 7) * .18, side * .07, next, .04, side > 0 ? 1 : 0);
        }
      } else for (let i = 0; i < 4; i++) {
        const angle = PI / 4 + i * PI / 2, x = Math.cos(angle), z = Math.sin(angle);
        line(x, .03, z, x * .25, .62 - p * .35, z * .25, .035, 1);
        shape('arrow', x, .2, z, .27, .27, .5, 0, 0, PI / 2);
        arc(0, .2 + i * .075, 0, .35, angle, angle + PI, .025, i % 2);
      }
      break;
    }
    case 'prayer-of-healing': { // A rosary hangs above the party, then its beads lift away.
      const radius = .65 + open * .15;
      for (let i = 0; i < 12; i++) {
        const angle = i * TAU / 12, next = (i + 1) * TAU / 12;
        const y = 1.1 + Math.sin(angle) * radius + Math.max(0, p - .55) * 1.3;
        shape('spark', Math.cos(angle) * radius, y, 0, .15, .15, .15, i % 3 === 0 ? 1 : 0);
        line(Math.cos(angle) * radius, y, 0, Math.cos(next) * radius, 1.1 + Math.sin(next) * radius + Math.max(0, p - .55) * 1.3, 0, .017);
      }
      line(0, .38, 0, 0, .04, 0, .045, 1);
      line(-.14, .23, 0, .14, .23, 0, .045, 1);
      break;
    }
    case 'holy-fire': { // A votive candle burns with a tall, splitting sacred wick.
      const y = flight ? -.2 : .3;
      line(0, y, 0, 0, y + .62, 0, .16);
      line(-.065, y + .35, .07, -.065, y + .63, .07, .025, 1);
      line(.055, y + .17, .06, .055, y + .62, .06, .026, 1);
      shape('flame', 0, y + .98, 0, .9, .8, 1.15 + .16 * Math.sin(t * 17), 1, 0, UP);
      for (const side of [-1, 1]) shape('flame', side * .18, y + .81, 0, .35, .35, .66, 0, 0, UP, side * .34);
      arc(0, y - .02, 0, .25, 0, TAU, .05);
      break;
    }
    case 'penance': { // Three scripture tablets process forward, each with its own lit verse.
      for (let i = 0; i < 3; i++) {
        const z = .24 - i * .45, x = Math.sin(t * 3 + i * .8) * .18;
        shape('shield', x, h, z, .65, .56, .22, i === Math.floor(p * 3) % 3 ? 1 : 0, 0, 0, .18 * Math.sin(t * 4 + i));
        for (let row = 0; row < 3; row++) line(x - .105, h + .11 - row * .09, z + .06, x + .105, h + .11 - row * .09, z + .06, .014, 1);
      }
      break;
    }
    case 'holy-word-serenity': { // A quiet lotus opens in two offset layers.
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8, radius = .14 + open * .28;
        shape('leaf', Math.cos(angle) * radius, h - .18, Math.sin(angle) * radius, 1.65, .8, .8, i % 2, PI / 2 - angle, -.35 - (1 - open) * .75);
      }
      for (let i = 0; i < 4; i++) {
        const angle = i * PI / 2 + PI / 4;
        shape('leaf', Math.cos(angle) * .17, h + .04, Math.sin(angle) * .17, .85, .7, .52, 1, PI / 2 - angle, -.65);
      }
      shape('spark', 0, h + .15 + Math.sin(t * 2) * .05, 0, .22, .28, .22, 1);
      break;
    }
    case 'divine-aegis': { // Six hinged ribs assemble a faceted protective dome.
      const radius = .38 + open * .72;
      for (let i = 0; i < 6; i++) {
        const angle = i * TAU / 6, next = (i + 1) * TAU / 6, c = Math.cos(angle), s = Math.sin(angle);
        line(c * radius, .05, s * radius, c * radius, 1.1, s * radius, .035);
        line(c * radius, 1.1, s * radius, c * radius * .56, 1.75, s * radius * .56, .035, 1);
        line(c * radius * .56, 1.75, s * radius * .56, 0, 2.05, 0, .035, 1);
        line(c * radius, 1.1, s * radius, Math.cos(next) * radius, 1.1, Math.sin(next) * radius, .02);
        shape('shield', c * radius, .64, s * radius, .63, .95, .3, i % 2, PI / 2 - angle);
      }
      break;
    }
    case 'chains-of-light': { // Two literal interlocking chains tighten around the target.
      for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
        const q = i / 7, width = flight ? .28 : .64 * (1 - p * .45);
        const x = side * Math.cos(q * PI) * width, y = h + Math.sin(q * PI) * .45;
        const z = flight ? .3 - q * 1.4 : side * Math.sin(q * PI) * .42;
        ring(x, y, z, .115, i % 2, i % 2 ? UP : 0, side * .45);
      }
      shape('shield', 0, h + .22, flight ? -.4 : .45, .35, .37, .4, 1);
      break;
    }
    case 'circle-of-healing': { // A living laurel wreath blossoms outward along the ground.
      const radius = Math.max(.55, r * .78);
      for (let i = 0; i < 14; i++) {
        const angle = i * TAU / 14;
        shape('leaf', Math.cos(angle) * radius, .09 + Math.sin(t * 3 + i) * .03, Math.sin(angle) * radius, .92, .55, .72, i % 2, -angle - .4);
        if (i % 2 === 0) shape('spark', Math.cos(angle) * radius * .87, .15 + p * .24, Math.sin(angle) * radius * .87, .13, .16, .13, 1);
      }
      break;
    }
    case 'divine-hymn': { // A swinging bell, its clapper and three successive sound waves.
      const swing = Math.sin(t * 6) * .18;
      for (const side of [-1, 1]) {
        line(swing, 1.82, 0, side * .25 + swing, 1.67, 0, .043, 1);
        line(side * .25 + swing, 1.67, 0, side * .34, 1.07, 0, .043);
        line(side * .34, 1.07, 0, side * .62, .8, 0, .043);
      }
      ring(0, .8, 0, .63, 1);
      line(swing, 1.63, 0, -swing, .69, 0, .025, 1);
      shape('spark', -swing, .69, 0, .18, .18, .18, 1);
      ring(swing, 1.92, 0, .1, 1, UP);
      for (let i = 0; i < 3; i++) arc(0, .15, 0, .85 + ((p * 3 + i) % 3) * .55, PI * .13, PI * .87, .023, i % 2);
      break;
    }
    case 'radiant-burst': { // An eight-point star splits into the corners of a radiant crystal.
      const distance = flight ? .22 : .28 + p * Math.max(.7, r);
      shape('spark', 0, h, 0, .55 * (1 - p * .5), .55, .55, 1);
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8, y = i % 2 ? .28 : -.1;
        shape('shard', Math.cos(angle) * distance, h + y * (1 + p), Math.sin(angle) * distance, .36, .36, .58 + p * .22, i % 2, PI / 2 - angle, -y);
        if (!flight) line(Math.cos(angle) * distance * .4, h + y * .4, Math.sin(angle) * distance * .4, Math.cos(angle) * distance, h + y, Math.sin(angle) * distance, .015, 1);
      }
      break;
    }
    case 'guardian-light': { // A vigilant tower shield parries between two crossed blades.
      shape('shield', 0, 1.0, .12, 1.6, 1.9, .6, 0);
      shape('spark', 0, 2.0, .12, .2, .24, .2, 1);
      const sweep = .22 + Math.sin(p * PI) * .45;
      for (const side of [-1, 1]) {
        line(side * .63, .2, .2, -side * sweep, 1.7, .28, .057, 1);
        line(side * .77, .54, .25, side * .25, .73, .25, .053);
        shape('shard', -side * sweep, 1.64, .28, .3, .3, .55, 1, 0, UP, -side * .65);
      }
      break;
    }
    case 'greater-heal': { // A chalice fills, then pours a fountain of restorative light.
      const y = flight ? -.7 : .08;
      arc(0, y + 1.12, 0, .48, 0, PI, .047, 1, PI / 2);
      ring(0, y + 1.12, 0, .48, 0);
      line(0, y + .13, 0, 0, y + .65, 0, .064, 1);
      ring(0, y + .1, 0, .28, 1);
      for (let i = 0; i < 6; i++) {
        const angle = i * TAU / 6, q = (p * 1.4 + i / 6) % 1;
        const x = Math.cos(angle), z = Math.sin(angle);
        line(0, y + 1.08, 0, x * .25, y + 1.66, z * .25, .024, 1);
        line(x * .25, y + 1.66, z * .25, x * .6, y + 1.2, z * .6, .016);
        shape('spark', x * q * .6, y + 1.12 + Math.sin(q * PI) * .58, z * q * .6, .12, .14, .12, 1);
      }
      break;
    }
    case 'sacred-flame': { // A small phoenix beats blazing wings over the splash area.
      const flap = Math.sin(t * 9) * .28;
      shape('flame', 0, h, .02, 1.0, .8, 1.2, 1);
      shape('arrow', 0, h + .06, .63, .24, .24, .33, 1);
      for (const side of [-1, 1]) for (let feather = 0; feather < 4; feather++) {
        shape('feather', side * (.27 + feather * .21), h + flap * feather * .6, -.06 - feather * .14,
          .7, .7, .82 - feather * .08, feather % 2, side * (1.25 + feather * .15), flap * side);
      }
      for (const side of [-1, 1]) shape('flame', side * .13, h, -.74, .38, .38, 1, 0, side * -.18);
      break;
    }
    case 'prayer-of-mending': { // Three luminous stitches form a linked triangular blessing.
      for (let i = 0; i < 3; i++) {
        const angle = i * TAU / 3 + PI / 2, next = angle + TAU / 3;
        const x = Math.cos(angle) * .62, z = Math.sin(angle) * .62;
        const nx = Math.cos(next) * .62, nz = Math.sin(next) * .62;
        shape('spark', x, h, z, .22, .22, .22, Math.floor(p * 3) % 3 === i ? 1 : 0);
        for (let stitch = 0; stitch < 4; stitch++) {
          const q = stitch / 4, nq = (stitch + 1) / 4;
          line(x + (nx - x) * q, h + Math.sin(q * PI) * .28, z + (nz - z) * q,
            x + (nx - x) * nq, h + Math.sin(nq * PI) * .28, z + (nz - z) * nq, .026, 1);
        }
      }
      break;
    }
    case 'holy-word-chastise': { // A gavel swings down and stamps a square word-seal.
      const angle = -.9 + Math.min(1, p * 2) * 1.15;
      const x = Math.sin(angle) * .8, y = h + Math.cos(angle) * .8;
      line(0, h - .2, 0, x, y, 0, .068, 1);
      line(x - Math.cos(angle) * .35, y + Math.sin(angle) * .35, 0, x + Math.cos(angle) * .35, y - Math.sin(angle) * .35, 0, .22);
      for (let i = 0; i < 4; i++) {
        const angleA = PI / 4 + i * PI / 2, angleB = angleA + PI / 2;
        line(Math.cos(angleA) * .52, .06, Math.sin(angleA) * .52, Math.cos(angleB) * .52, .06, Math.sin(angleB) * .52, .028, 1);
      }
      break;
    }
    case 'sanctuary': { // A pointed chapel doorway rises around the protected party.
      const top = .9 + open * 1.45;
      for (const side of [-1, 1]) {
        line(side * .95, .04, 0, side * .95, top - .85, 0, .065);
        line(side * .95, top - .85, 0, side * .62, top - .25, 0, .055, 1);
        line(side * .62, top - .25, 0, 0, top + .2, 0, .055, 1);
        line(side * .7, .08, 0, side * .7, top - .8, 0, .026, 1);
        line(side * .7, top - .8, 0, 0, top - .08, 0, .026, 1);
        shape('shield', side * 1.16, .55, 0, .55, 1.0, .3, 0);
        line(side * .95, .06, -.55, side * .95, .06, .55, .05);
      }
      shape('spark', 0, top + .18, 0, .21, .27, .21, 1);
      break;
    }
    case 'judgment': { // The scales of judgment tilt, then settle level on impact.
      const tilt = Math.sin(t * 5) * (flight ? .22 : (1 - p) * .22), y = h + .55;
      line(0, h - .45, 0, 0, y + .22, 0, .049, 1);
      line(-.77, y - tilt, 0, .77, y + tilt, 0, .045, 1);
      for (const side of [-1, 1]) {
        const x = side * .61, rimY = y + side * tilt - .42;
        line(x, y + side * tilt, 0, x - .25, rimY, 0, .019);
        line(x, y + side * tilt, 0, x + .25, rimY, 0, .019);
        arc(x, rimY, 0, .25, 0, PI, .025, 1, PI / 2);
        line(x - .25, rimY, 0, x + .25, rimY, 0, .025, 1);
      }
      shape('spark', 0, y + .18, 0, .2, .22, .2, 1);
      break;
    }
    case 'salvation': { // Two tall gates open, revealing a descending curtain of blessing.
      const swing = open * PI * .43;
      for (const side of [-1, 1]) {
        const hinge = side * 1.0, inner = hinge - side * Math.cos(swing), depth = Math.sin(swing);
        line(hinge, .04, 0, hinge, 2.4, 0, .06, 1);
        line(inner, .04, depth, inner, 2.4, depth, .035);
        for (let rail = 0; rail < 3; rail++) {
          const y = .22 + rail * 1.02;
          line(hinge, y, 0, inner, y, depth, .03, 1);
        }
        shape('shield', hinge, 2.5, 0, .38, .65, .35, 1);
      }
      for (let i = -2; i <= 2; i++) {
        const fall = (p * 1.3 + (i + 2) * .13) % 1;
        line(i * .26, 2.22 - fall * 1.7, .1, i * .26, 2.52 - fall * 1.7, .1, .04, 1);
        shape('feather', i * .26, 2.2 - fall * 1.7, .1, .38, .38, .4, 0, 0, UP);
      }
      break;
    }
    case 'holy-lance': { // A long narrow lance, with a forked socket and two flying pennants.
      line(0, h, -1.7, 0, h, .45, .043, 1);
      shape('shard', 0, h, .6, .42, .42, 1.0, 1);
      for (const side of [-1, 1]) {
        shape('shard', side * .11, h, .3, .17, .17, .5, 0, side * .32);
        line(side * .12, h, -.2, side * .32, h + Math.sin(t * 9) * .09, -.7, .028);
        line(side * .32, h + Math.sin(t * 9) * .09, -.7, side * .22, h, -1.05, .014, 1);
      }
      ring(0, h, -.15, .17, 1, UP);
      break;
    }
    case 'seraphic-barrier': { // Three linked winged wards close protectively toward the middle.
      const radius = 1.05 - open * .25;
      for (let i = 0; i < 3; i++) {
        const angle = i * TAU / 3, next = angle + TAU / 3;
        const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        shape('shield', x, .8, z, .7, 1.0, .5, i % 2, PI / 2 - angle);
        for (const side of [-1, 1]) shape('feather', x + side * .3, 1.1, z, .8, .7, 1.05, 1, side * .85, UP * .55, -side * .35);
        line(x, .4, z, Math.cos(next) * radius, .4, Math.sin(next) * radius, .028, 1);
      }
      break;
    }
    case 'cleansing-radiance': { // Eight tall veils sweep outward, combing light through the area.
      const radius = Math.max(.5, r), height = .65 + Math.sin(p * PI) * .85;
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8, half = .21, c = Math.cos(angle), s = Math.sin(angle);
        const x = c * radius, z = s * radius;
        line(x - s * half, .05, z + c * half, x, height, z, .034, 1);
        line(x, height, z, x + s * half, .05, z - c * half, .034);
        line(x, .1, z, x, height * .8, z, .022, 1);
        shape('feather', x, height + .15, z, .35, .35, .48, 0, -angle, UP);
      }
      break;
    }
    case 'light-of-dawn': { // A half-sun rises from its horizon with seven long dawn rays.
      const rise = .08 + open * .62;
      arc(0, rise, 0, .75, 0, PI, .055, 1, UP);
      line(-1.2, rise, 0, 1.2, rise, 0, .055);
      for (let i = 0; i < 7; i++) {
        const angle = .1 + i * (PI - .2) / 6, c = Math.cos(angle), s = Math.sin(angle);
        line(c * .84, rise + s * .84, 0, c * (1.22 + p * .22), rise + s * (1.22 + p * .22), 0, .04, i % 2);
      }
      for (const side of [-1, 1]) shape('feather', side * .68, rise - .1, .04, .55, .4, .95, 1, side * PI / 2);
      break;
    }
    case 'wrath-of-heaven': { // A monumental sword descends between two torn celestial banners.
      const y = flight ? 0 : 2.3 - Math.min(1, p * 2) * 1.65;
      shape('shard', 0, y, flight ? .1 : 0, 1.25, .72, 2.0, 1, 0, flight ? 0 : PI / 2);
      line(-.57, flight ? 0 : y + 1.02, flight ? -.92 : 0, .57, flight ? 0 : y + 1.02, flight ? -.92 : 0, .12);
      line(0, flight ? 0 : y + 1.02, flight ? -.92 : 0, 0, flight ? 0 : y + 1.52, flight ? -1.42 : 0, .085, 1);
      shape('spark', 0, flight ? 0 : y + 1.58, flight ? -1.48 : 0, .24, .24, .24, 1);
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const x = side * (.63 + Math.sin(t * 5 + i) * .11);
        shape('feather', x, flight ? -.08 : y + .55 + i * .37, flight ? -.45 - i * .37 : -.08, .64, .4, .58, i % 2, 0, flight ? 0 : UP, side * .24);
      }
      if (!flight) for (let i = 0; i < 3; i++) {
        const angle = i * TAU / 3, reach = .25 + p * 1.8;
        line(0, .06, 0, Math.cos(angle) * reach, .06, Math.sin(angle) * reach, .055, 1);
      }
      break;
    }
    case 'guardian-of-the-dawn': { // An entire guardian unfolds: head, robe, staff and twelve wing feathers.
      const spread = .3 + open * .72;
      shape('shield', 0, 1.0, 0, 1.1, 1.75, .55, 0);
      shape('spark', 0, 2.02, 0, .28, .32, .28, 1);
      ring(0, 2.24, 0, .28, 1);
      for (const side of [-1, 1]) {
        line(side * .15, 1.63, 0, side * .48, 1.31, .05, .055, 1);
        for (let feather = 0; feather < 6; feather++) {
          const x = side * (.28 + feather * .18) * spread;
          const y = 1.68 + Math.sin(feather / 6 * PI) * .43 - feather * .1;
          shape('feather', x, y, -.13, .74, .7, 1.02 + feather * .045, feather % 2,
            side * (.8 + feather * .13), UP * .6, -side * (.28 + feather * .10));
        }
      }
      line(.6, .1, .1, .6, 2.17, .1, .045, 1);
      shape('spark', .6, 2.25, .1, .36, .38, .36, 1);
      line(.45, 1.35, .05, .6, 1.35, .1, .05, 1);
      break;
    }
    default: return false;
  }
  return true;
}
