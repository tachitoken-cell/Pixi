// All game audio is synthesized with the Web Audio API: sound effects and a cozy,
// original soundtrack per map (harp, flute, marimba, soft pads, light percussion).
// Browsers only allow audio after the player touches or clicks, so `unlock()` is
// called from the first input event.

let ctx = null, master, musicBus, sfxBus, reverb, noiseBuf, analyser;
const settings = { music: true, sfx: true };
try {
  const saved = JSON.parse(localStorage.getItem('vq-audio') || '{}');
  Object.assign(settings, saved);
} catch { /* storage blocked: keep defaults */ }
const save = () => { try { localStorage.setItem('vq-audio', JSON.stringify(settings)); } catch { /* ignore */ } };

function makeReverb() {
  const len = ctx.sampleRate * 2.4;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048; master.connect(analyser);
    musicBus = ctx.createGain(); musicBus.gain.value = settings.music ? 0.55 : 0;
    sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx ? 0.8 : 0;
    reverb = makeReverb();
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    reverb.connect(wet).connect(master);
    musicBus.connect(master); sfxBus.connect(master);
    musicBus.connect(reverb);
    const sfxWet = ctx.createGain(); sfxWet.gain.value = 0.25;
    sfxBus.connect(sfxWet).connect(reverb);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (pendingTrack) startTrack(pendingTrack);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMusic(on) {
  settings.music = on; save();
  if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.3);
}
export function setSfx(on) {
  settings.sfx = on; save();
  if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
}
export const audioSettings = settings;
// for recording a preview of the music
export const internals = () => ({ ctx, master });
// current output loudness (0..1), handy for checks and visualisers
export function level() {
  if (!analyser) return 0;
  const d = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(d);
  let sum = 0;
  for (const v of d) sum += v * v;
  return Math.sqrt(sum / d.length);
}

// ---------------------------------------------------------------- building blocks
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function env(g, t, a, peak, d, sustain = 0, r = 0.05) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
  if (sustain) g.gain.setTargetAtTime(0.0001, t + a + d, r);
}

function tone({ freq, type = 'sine', t = ctx.currentTime, a = 0.005, d = 0.2, vol = 0.3, glide = 0, bus = sfxBus, detune = 0, filter = 0, vib = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + a + d);
  o.detune.value = detune;
  const g = ctx.createGain();
  env(g, t, a, vol, d);
  let node = o;
  if (vib) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.2; lg.gain.value = freq * vib;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t + 0.12); lfo.stop(t + a + d + 0.1);
  }
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filter;
    node.connect(f); node = f;
  }
  node.connect(g).connect(bus);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

function noise({ t = ctx.currentTime, a = 0.005, d = 0.15, vol = 0.3, type = 'bandpass', freq = 1200, q = 1, sweep = 0, bus = sfxBus }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + a + d);
  const g = ctx.createGain();
  env(g, t, a, vol, d);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + a + d + 0.05);
}

// ---------------------------------------------------------------- sound effects
const SFX = {
  step(surface = 'grass') {
    const r = 0.85 + Math.random() * 0.3;
    if (surface === 'cobble' || surface === 'mountain') { noise({ freq: 2400 * r, q: 2, d: 0.05, vol: 0.13 }); tone({ freq: 180 * r, d: 0.04, vol: 0.05, type: 'triangle' }); }
    else if (surface === 'sand') noise({ freq: 1600 * r, q: 0.6, d: 0.09, vol: 0.09, type: 'highpass' });
    else if (surface === 'path') { noise({ freq: 900 * r, q: 1, d: 0.07, vol: 0.12 }); }
    else noise({ freq: 700 * r, q: 0.7, d: 0.08, vol: 0.1 });
  },
  swing() { noise({ freq: 600, sweep: 4, q: 1.5, a: 0.03, d: 0.16, vol: 0.22 }); },
  whoosh() { noise({ freq: 400, sweep: 3, q: 1, a: 0.05, d: 0.25, vol: 0.2 }); },
  spin() { const t = ctx.currentTime; for (let i = 0; i < 3; i++) noise({ t: t + i * 0.12, freq: 500 + i * 200, sweep: 3, q: 1.4, a: 0.03, d: 0.14, vol: 0.18 }); },
  slam() { SFX.whoosh(); tone({ freq: 110, glide: 0.4, d: 0.3, vol: 0.4, type: 'sine', t: ctx.currentTime + 0.05 }); noise({ t: ctx.currentTime + 0.05, freq: 300, d: 0.2, vol: 0.25, type: 'lowpass' }); },
  hit() { tone({ freq: 150, glide: 0.5, d: 0.12, vol: 0.35 }); noise({ freq: 2000, q: 0.8, d: 0.05, vol: 0.2 }); },
  crit() { SFX.hit(); tone({ freq: midi(88), d: 0.25, vol: 0.12, type: 'triangle', t: ctx.currentTime + 0.03 }); tone({ freq: midi(93), d: 0.3, vol: 0.1, type: 'triangle', t: ctx.currentTime + 0.08 }); },
  magicHit() { noise({ freq: 3000, q: 3, d: 0.25, vol: 0.18, sweep: 0.4 }); tone({ freq: midi(84), d: 0.3, vol: 0.12, type: 'sine', glide: 0.5 }); },
  miss() { noise({ freq: 1200, sweep: 2, q: 2, a: 0.02, d: 0.12, vol: 0.1 }); },
  twang() { tone({ freq: 520, glide: 0.55, d: 0.18, vol: 0.18, type: 'triangle' }); noise({ freq: 900, sweep: 2.5, q: 1.2, a: 0.02, d: 0.2, vol: 0.12, t: ctx.currentTime + 0.03 }); },
  creak() { tone({ freq: 140, glide: 1.4, a: 0.1, d: 0.35, vol: 0.06, type: 'sawtooth', filter: 600 }); },
  charge() { const t = ctx.currentTime; [72, 76, 79, 84].forEach((n, i) => tone({ freq: midi(n), t: t + i * 0.05, d: 0.2, vol: 0.07, type: 'sine' })); },
  zap() { tone({ freq: 900, glide: 0.25, d: 0.3, vol: 0.14, type: 'sawtooth', filter: 2400 }); tone({ freq: midi(88), d: 0.4, vol: 0.08, type: 'sine', vib: 0.02 }); },
  shout() { const t = ctx.currentTime; tone({ freq: 160, glide: 1.5, a: 0.05, d: 0.35, vol: 0.18, type: 'sawtooth', filter: 900 }); [60, 64, 67, 72].forEach((n, i) => tone({ freq: midi(n), t: t + 0.15 + i * 0.07, d: 0.35, vol: 0.1, type: 'square', filter: 1800 })); },
  guard() { const t = ctx.currentTime; [67, 71, 74, 79].forEach((n, i) => tone({ freq: midi(n), t: t + i * 0.08, d: 0.6, vol: 0.09, type: 'triangle' })); },
  dash() { noise({ freq: 300, sweep: 5, q: 0.8, a: 0.04, d: 0.3, vol: 0.25 }); },
  hurt() { tone({ freq: 240, glide: 0.5, d: 0.16, vol: 0.2, type: 'square', filter: 1200 }); noise({ freq: 600, d: 0.08, vol: 0.18, type: 'lowpass' }); },
  pop() { tone({ freq: 700, glide: 0.2, d: 0.14, vol: 0.2, type: 'sine' }); const t = ctx.currentTime; [76, 72, 67].forEach((n, i) => tone({ freq: midi(n), t: t + 0.08 + i * 0.06, d: 0.15, vol: 0.07, type: 'triangle' })); },
  levelUp() { const t = ctx.currentTime; [[60, 0], [64, 0.1], [67, 0.2], [72, 0.3], [76, 0.42], [79, 0.54]].forEach(([n, d]) => { tone({ freq: midi(n), t: t + d, d: 0.5, vol: 0.12, type: 'triangle' }); tone({ freq: midi(n + 12), t: t + d, d: 0.3, vol: 0.04, type: 'sine' }); }); [60, 64, 67, 72].forEach((n) => tone({ freq: midi(n), t: t + 0.7, a: 0.02, d: 1.2, vol: 0.07, type: 'triangle' })); },
  jobUp() { const t = ctx.currentTime; [[67, 0], [71, 0.08], [74, 0.16], [79, 0.26], [83, 0.38]].forEach(([n, d]) => tone({ freq: midi(n), t: t + d, d: 0.45, vol: 0.11, type: 'triangle' })); },
  portal() { tone({ freq: 200, glide: 4, a: 0.2, d: 0.6, vol: 0.12, type: 'sine', vib: 0.03 }); noise({ freq: 800, sweep: 5, q: 2, a: 0.25, d: 0.5, vol: 0.12 }); },
  stones() { const t = ctx.currentTime; for (let i = 0; i < 5; i++) noise({ t: t + i * 0.05 + Math.random() * 0.03, freq: 2500 + Math.random() * 1500, q: 4, d: 0.04, vol: 0.12 }); },
  heal() { const t = ctx.currentTime; [79, 84, 88].forEach((n, i) => tone({ freq: midi(n), t: t + i * 0.12, d: 0.6, vol: 0.06, type: 'sine' })); },
  die() { const t = ctx.currentTime; [67, 63, 60, 55].forEach((n, i) => tone({ freq: midi(n), t: t + i * 0.22, d: 0.5, vol: 0.12, type: 'triangle' })); },
  talk() { const t = ctx.currentTime; for (let i = 0; i < 3; i++) tone({ freq: midi(74 + Math.floor(Math.random() * 5)), t: t + i * 0.07, d: 0.05, vol: 0.06, type: 'square', filter: 2000 }); },
  click() { tone({ freq: 1200, d: 0.03, vol: 0.05, type: 'triangle' }); },
  denied() { tone({ freq: 200, d: 0.12, vol: 0.08, type: 'square', filter: 800 }); },
};

let last = {};
export function sfx(name, arg) {
  if (!ctx || !settings.sfx || !SFX[name]) return;
  const now = ctx.currentTime;
  if (last[name] && now - last[name] < 0.03) return; // don't stack identical sounds
  last[name] = now;
  SFX[name](arg);
}

// character animation events → sounds
const EVENT_SFX = { slash: 'swing', punch: 'swing', slam: 'slam', spin: 'spin', stone: 'twang', aim: 'creak', ebolt: 'zap', bolt: 'zap', arrow: 'twang', volley: 'twang', charge: 'charge', buffAtk: 'shout', buffDef: 'guard', guard: 'guard', dash: 'dash', nova: 'zap' };
export function animEvent(name) { if (EVENT_SFX[name]) sfx(EVENT_SFX[name]); }

// ---------------------------------------------------------------- music
// Each track: tempo, beats per bar, a chord per bar (root + chord tones in MIDI), and the
// instruments that play it. The melody is composed once per track from the chords with a
// fixed seed, so a map always has the same tune.
const C = (root, q = 'maj') => ({ root, tones: q === 'maj' ? [0, 4, 7] : q === 'min' ? [0, 3, 7] : q === 'sus' ? [0, 5, 7] : [0, 4, 7, 11] });
// a chord that borrows another key for its melody notes (for key changes mid-track)
const K = (chord, key, scale) => ({ ...chord, key, scale });
const MINOR = [0, 2, 3, 5, 7, 8, 10], HARMONIC = [0, 2, 3, 5, 7, 8, 11], PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const TRACKS = {
  // town theme in the style of NosTale's village music: bouncy 4/4, recorder melody with a
  // clarinet harmony, pizzicato oom-pah, glockenspiel sparkles, soft strings and tambourine
  village: { bpm: 112, beats: 4, key: 65, scale: [0, 2, 4, 5, 7, 9, 11], seed: 5, lead: 'flute', harmony: 'clarinet', glock: true,
    accomp: 'oompah', arp: 'pizz', perc: 'tambourine', strings: true,
    chords: [C(65), C(70), C(60), C(65), C(62, 'min'), C(70), C(67, 'min'), C(60)] },
  fields: { bpm: 104, beats: 4, key: 67, scale: [0, 2, 4, 5, 7, 9, 11], seed: 9, lead: 'ocarina', arp: 'pluck', perc: true,
    chords: [C(67), C(60), C(62), C(67), C(64, 'min'), C(60), C(62, 'sus'), C(62)] },
  woods: { bpm: 72, beats: 4, key: 62, scale: [0, 2, 3, 5, 7, 9, 10], seed: 13, lead: 'flute', arp: 'harp', perc: false, pad: true,
    chords: [C(62, 'min'), C(60), C(65), C(67), C(62, 'min'), C(70), C(60), C(69, 'min')] },
  coast: { bpm: 92, beats: 4, key: 60, scale: [0, 2, 4, 6, 7, 9, 11], seed: 21, lead: 'ocarina', arp: 'marimba', perc: true, pad: true,
    chords: [C(60, 'maj7'), C(62), C(64, 'min'), C(62), C(60, 'maj7'), C(57, 'min'), C(65, 'maj7'), C(67)] },
  // dungeon battle theme in the style of NosTale's Time-Space battle music, played as tense rock:
  // grinding E-F half steps and tritone jumps, a galloping riff that creeps up a half step,
  // twin lead guitars, a high tremolo 'alarm' and relentless drums
  battle: { bpm: 176, beats: 4, key: 64, scale: PHRYGIAN, seed: 17, lead: 'leadGtr', harmony: 'leadGtr',
    accomp: 'rock', perc: 'rock', guitars: true, tremolo: true,
    rhythms: [[[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 1.5], [3, 1]], [[0, 0.75], [0.75, 0.75], [1.5, 0.5], [2, 2]], [[0, 1.5], [1.5, 1.5], [3, 1]], [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]]],
    chords: [C(64, 'min'), C(65), C(64, 'min'), C(65), C(60), K(C(59), 64, HARMONIC), C(64, 'min'), K(C(58), 62, MINOR),
      K(C(66, 'min'), 66, PHRYGIAN), K(C(67), 66, PHRYGIAN), K(C(66, 'min'), 66, PHRYGIAN), K(C(67), 66, PHRYGIAN),
      K(C(62), 66, MINOR), K(C(61), 66, HARMONIC), K(C(58), 62, MINOR), K(C(59), 64, HARMONIC)] },
};
// the notes a melody may use over a chord: the chord's own key if it has one, else the track's
function scaleFor(tr, ch, lo = -1, hi = 2) {
  const notes = [];
  for (let o = lo; o <= hi; o++) for (const d of ch.scale || tr.scale) notes.push((ch.key ?? tr.key) + o * 12 + d);
  return notes;
}

function compose(tr) { // 16 bars: A (8) then A' (first half repeated, new ending)
  let s = tr.seed;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const inChord = (n, ch) => ch.tones.some((t) => (n - ch.root - t) % 12 === 0);
  const bars = [];
  let prev = tr.key + 12;
  for (let b = 0; b < tr.chords.length; b++) {
    const ch = tr.chords[b];
    const scaleNotes = scaleFor(tr, ch);
    const notes = [];
    // rhythm per bar: [start in beats, length in beats]
    const rhythms = tr.beats === 3 ? [[[0, 1.5], [1.5, 0.5], [2, 1]], [[0, 2], [2, 1]], [[0, 1], [1, 1], [2, 1]]] : [[[0, 1.5], [1.5, 0.5], [2, 1], [3, 1]], [[0, 2], [2, 1.5], [3.5, 0.5]], [[0, 1], [1, 1], [2, 2]], [[0.5, 1], [1.5, 0.5], [2, 2]]];
    const pool = tr.rhythms || rhythms;
    const rhythm = b % 4 === 3 ? [[0, tr.beats]] : pool[Math.floor(R() * pool.length)];
    for (const [st, len] of rhythm) {
      const strong = st === 0 || st === 2;
      let cands = scaleNotes.filter((n) => Math.abs(n - prev) <= 5 && n >= tr.key + 2 && n <= tr.key + 21);
      if (strong) cands = cands.filter((n) => inChord(n, ch));
      if (!cands.length) cands = scaleNotes.filter((n) => inChord(n, ch) && n >= tr.key && n <= tr.key + 21);
      const n = cands[Math.floor(R() * cands.length)];
      notes.push([st, len, n]);
      prev = n;
    }
    bars.push(notes);
  }
  const out = [...bars, ...bars.slice(0, 4)];
  // new ending for A': walk down to the tonic
  for (let b = 4; b < 8; b++) {
    const ch = tr.chords[b];
    const last = b === 7;
    const n = scaleFor(tr, ch).filter((x) => inChord(x, last ? { root: tr.key, tones: [0] } : ch) && x >= tr.key && x <= tr.key + 14);
    out.push(last ? [[0, tr.beats, tr.key + 12]] : [[0, 1, n[n.length - 1 - (b % 2)]], [1, 1, n[Math.max(0, n.length - 2)]], [2, 2, n[Math.floor(n.length / 2)]]]);
  }
  return out;
}

// guitar amp: tighten the lows, clip hard, then a speaker-cabinet style filter; optional stereo side
function makeAmp(dest, { drive = 12, cab = 3800, level = 0.3, pan = 0 } = {}) {
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
  const ws = ctx.createWaveShaper(); ws.oversample = '4x';
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) { const x = i / 1023.5 - 1; curve[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  ws.curve = curve;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 2200; mid.Q.value = 0.7; mid.gain.value = 6;
  const scoop = ctx.createBiquadFilter(); scoop.type = 'peaking'; scoop.frequency.value = 450; scoop.Q.value = 1; scoop.gain.value = -4;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cab; lp.Q.value = 0.9;
  const g = ctx.createGain(); g.gain.value = level;
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  hp.connect(ws).connect(mid).connect(scoop).connect(lp).connect(g).connect(p).connect(dest);
  return hp;
}

let current = null, pendingTrack = null, timer = null;
function startTrack(name) {
  const tr = TRACKS[name] || TRACKS.village;
  const melody = compose(tr);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
  gain.connect(musicBus);
  const song = { tr, melody, gain, bar: 0, next: ctx.currentTime + 0.3, loop: 0 };
  if (tr.guitars) { // two rhythm guitars left and right, two lead guitars slightly off centre
    song.rhythmL = makeAmp(gain, { drive: 16, cab: 4200, level: 0.26, pan: -0.7 });
    song.rhythmR = makeAmp(gain, { drive: 16, cab: 4000, level: 0.26, pan: 0.7 });
    song.leadAmp = makeAmp(gain, { drive: 24, cab: 5200, level: 0.2, pan: -0.15 });
    song.harmAmp = makeAmp(gain, { drive: 24, cab: 5000, level: 0.14, pan: 0.25 });
  }
  if (current) {
    const old = current;
    old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
    setTimeout(() => old.gain.disconnect(), 3000);
  }
  current = song;
  if (!timer) timer = setInterval(schedule, 50);
}
export function playMusic(name) {
  if (!ctx) { pendingTrack = name; return; }
  if (current && current.name === name) return;
  startTrack(name);
  current.name = name;
}

function inst(kind, freq, t, len, vol, out) {
  switch (kind) {
    case 'flute': tone({ freq, t, a: 0.06, d: len, vol: vol * 0.9, type: 'sine', vib: 0.008, bus: out }); tone({ freq: freq * 2, t, a: 0.08, d: len * 0.8, vol: vol * 0.08, type: 'sine', bus: out }); break;
    case 'ocarina': tone({ freq, t, a: 0.03, d: len, vol: vol * 0.8, type: 'triangle', vib: 0.006, filter: 2500, bus: out }); break;
    case 'harp': tone({ freq, t, a: 0.004, d: len * 2.2, vol: vol * 0.55, type: 'triangle', filter: 3000, bus: out }); break;
    case 'pluck': tone({ freq, t, a: 0.003, d: 0.35, vol: vol * 0.5, type: 'square', filter: 1400, bus: out }); break;
    case 'marimba': tone({ freq, t, a: 0.003, d: 0.4, vol: vol * 0.6, type: 'sine', bus: out }); tone({ freq: freq * 4, t, a: 0.002, d: 0.06, vol: vol * 0.12, type: 'sine', bus: out }); break;
    case 'bass': tone({ freq, t, a: 0.02, d: len, vol: vol * 0.55, type: 'triangle', filter: 500, bus: out }); break;
    case 'clarinet': tone({ freq, t, a: 0.04, d: len, vol: vol * 0.45, type: 'square', filter: 1300, vib: 0.004, bus: out }); break;
    case 'pizz': tone({ freq, t, a: 0.003, d: 0.16, vol: vol * 0.55, type: 'sawtooth', filter: 1500, bus: out }); tone({ freq, t, a: 0.003, d: 0.12, vol: vol * 0.3, type: 'triangle', bus: out }); break;
    case 'glock': tone({ freq, t, a: 0.002, d: 0.9, vol: vol * 0.22, type: 'sine', bus: out }); tone({ freq: freq * 2.76, t, a: 0.002, d: 0.25, vol: vol * 0.07, type: 'sine', bus: out }); break;
    case 'strings': for (const dt of [-6, 6]) tone({ freq, t, a: len * 0.3, d: len * 0.9, vol: vol * 0.1, type: 'sawtooth', detune: dt, filter: 1600, vib: 0.004, bus: out }); break;
    // guitars go through an amp (see makeAmp); a power chord is root, fifth and octave
    case 'power': for (const [k, dt] of [[0, -4], [7, 3], [12, 0]]) tone({ freq: freq * Math.pow(2, k / 12), t, a: 0.003, d: len, vol, type: 'sawtooth', detune: dt, filter: 3200, bus: out }); break;
    case 'mute': for (const k of [0, 7]) tone({ freq: freq * Math.pow(2, k / 12), t, a: 0.002, d: 0.09, vol: vol * 0.8, type: 'sawtooth', filter: 750, bus: out }); break;
    case 'leadGtr': tone({ freq, t, a: 0.006, d: len, vol, type: 'sawtooth', filter: 2800, vib: len > 0.4 ? 0.012 : 0, bus: out }); tone({ freq: freq * 2.003, t, a: 0.006, d: len, vol: vol * 0.3, type: 'square', filter: 3000, bus: out }); break;
    case 'trem': for (const dt of [-8, 8]) tone({ freq, t, a: 0.004, d: len, vol: vol * 0.5, type: 'sawtooth', detune: dt, filter: 3200, bus: out }); break;
    case 'rockbass': tone({ freq, t, a: 0.004, d: len, vol: vol * 0.3, type: 'sawtooth', filter: 900, bus: out }); tone({ freq, t, a: 0.004, d: len, vol: vol * 0.28, type: 'sine', bus: out }); break;
    case 'pad': for (const dt of [-7, 7]) tone({ freq, t, a: len * 0.4, d: len * 0.8, vol: vol * 0.12, type: 'sawtooth', detune: dt, filter: 900, bus: out }); break;
  }
}

function schedule() {
  if (!ctx || !current) return;
  const song = current, tr = song.tr;
  const beat = 60 / tr.bpm;
  while (song.next < ctx.currentTime + 0.25) {
    const t = song.next;
    const ch = tr.chords[song.bar % tr.chords.length];
    const out = song.gain;
    const steps = tr.beats * 2;
    if (tr.accomp === 'rock') {
      // galloping riff in sixteenths (da-dada), power chords ringing on the accents, and on the
      // last beat the muted notes creep up a half step for tension; bass gallops on the root
      const low = ch.root - 24; // low guitar range, E2 for the E chord
      const six = beat / 4, ring = { 0: 6, 6: 4, 10: 2 };
      for (let i = 0; i < 16; i++) {
        if (!ring[i] && i % 4 === 1) continue;
        const st = t + i * six;
        for (const [amp, late] of [[song.rhythmL, 0], [song.rhythmR, 0.006]]) {
          if (ring[i]) inst('power', midi(low), st + late, ring[i] * six * 0.92, 0.22, amp);
          else inst('mute', midi(low + (i >= 12 ? 1 : 0)), st + late, 0, 0.22, amp);
        }
        inst('rockbass', midi(low - 12), st, six * 0.9, 0.6, out);
      }
      // high tremolo 'alarm': the root trilling with the half step above it
      if (tr.tremolo) for (let i = 0; i < 16; i++) inst('trem', midi(ch.root + 12 + (i % 2 && (i >> 2) % 2 ? 1 : 0)), t + i * six, six * 0.9, 0.05, out);
    } else if (tr.accomp === 'oompah') {
      // oom-pah: bass on 1 and 3, short pizzicato chords on 2 and 4
      inst('bass', midi(ch.root - 24), t, beat * 0.9, 0.55, out);
      inst('bass', midi(ch.root - 24 + 7), t + beat * 2, beat * 0.9, 0.45, out);
      for (const b of [1, 3]) for (const k of ch.tones.slice(0, 3)) inst('pizz', midi(ch.root - 12 + k), t + b * beat, 0.2, 0.32, out);
      if (song.bar % 2) inst('pizz', midi(ch.root - 12 + ch.tones[2]), t + 3.5 * beat, 0.2, 0.22, out);
    } else {
      // bass on the first beat (and third in 4/4)
      inst('bass', midi(ch.root - 24), t, beat * (tr.beats === 3 ? 2.6 : 1.8), 0.5, out);
      if (tr.beats === 4) inst('bass', midi(ch.root - 24 + (song.bar % 2 ? 7 : 0)), t + beat * 2, beat * 1.8, 0.4, out);
      // broken-chord arpeggio in eighths
      const arpNotes = [...ch.tones, 12, ...ch.tones.slice().reverse()].map((k) => ch.root + k);
      for (let i = 0; i < steps; i++) {
        if (tr.beats === 3 && i < 2) continue;
        inst(tr.arp, midi(arpNotes[i % arpNotes.length]), t + i * beat / 2, beat * 0.5, 0.28, out);
      }
    }
    // soft pad / strings holding the chord
    if (tr.pad) for (const k of ch.tones) inst('pad', midi(ch.root - 12 + k), t, beat * tr.beats, 0.6, out);
    if (tr.strings) for (const k of ch.tones) inst('strings', midi(ch.root + k - (k > 4 ? 12 : 0)), t, beat * tr.beats, 0.6, out);
    // melody, with an optional harmony a third below and glockenspiel on the downbeats
    const phrase = song.melody[song.bar % song.melody.length];
    const scaleAll = scaleFor(tr, ch, -2, 2);
    for (const [st, len, n] of phrase) {
      inst(tr.lead, midi(n), t + st * beat, len * beat * 0.95, 0.3, song.leadAmp || out);
      if (tr.harmony) {
        const i = scaleAll.indexOf(n);
        if (i >= 2) inst(tr.harmony, midi(scaleAll[i - 2]), t + st * beat, len * beat * 0.9, song.harmAmp ? 0.3 : 0.22, song.harmAmp || out);
      }
      if (tr.glock && (st === 0 || len >= 2)) inst('glock', midi(n + 12), t + st * beat, 0.5, 0.35, out);
    }
    // light percussion
    if (tr.perc === 'rock') {
      // sixteenth hi-hats, kick on the riff accents (non-stop double kick in the middle section),
      // backbeat snare, a tom fill or a building snare roll every 4 bars, crash to start each phrase
      const bar = song.bar, six = beat / 4;
      const kick = (st, v = 0.6) => { tone({ freq: 130, glide: 0.35, t: st, d: 0.14, vol: v * 0.7, bus: out }); noise({ t: st, freq: 3500, q: 1.5, d: 0.012, vol: v * 0.25, bus: out }); };
      const snare = (st, v = 0.34) => { noise({ t: st, freq: 1900, q: 0.6, d: 0.18, vol: v, bus: out }); tone({ freq: 190, glide: 0.8, t: st, d: 0.08, vol: v * 0.6, type: 'triangle', bus: out }); };
      const middle = bar % 16 >= 8;
      const fill = bar % 4 === 3;
      for (let i = 0; i < 16; i++) {
        const st = t + i * six;
        noise({ t: st, freq: 8000, q: 0.7, d: 0.03, vol: i % 4 === 0 ? 0.045 : 0.022, type: 'highpass', bus: out });
        if (middle ? true : [0, 3, 6, 8, 10].includes(i)) kick(st, middle ? (i % 2 ? 0.38 : 0.5) : 0.6);
        if (fill && i >= 8) {
          if (bar % 8 === 7) snare(st, 0.12 + (i - 8) * 0.03); // snare roll building up
          else if (i % 2 === 0) tone({ freq: [260, 220, 180, 150][(i - 8) >> 1], glide: 0.55, t: st, d: 0.16, vol: 0.4, bus: out });
        } else if (i === 4 || i === 12) snare(st);
      }
      if (bar % 4 === 0) noise({ t, freq: 4500, q: 0.4, d: 1.6, vol: 0.11, type: 'highpass', bus: out });
    } else if (tr.perc === 'tambourine') for (let i = 0; i < steps; i++) {
      noise({ t: t + i * beat / 2, freq: 8000, q: 1.5, d: i % 2 ? 0.04 : 0.07, vol: i % 4 === 2 ? 0.07 : 0.035, type: 'bandpass', bus: out });
    } else if (tr.perc) for (let i = 0; i < steps; i++) {
      noise({ t: t + i * beat / 2, freq: 7000, q: 1, d: 0.03, vol: i % 2 ? 0.035 : 0.05, type: 'highpass', bus: out });
      if (i % 4 === 2) noise({ t: t + i * beat / 2, freq: 1800, q: 6, d: 0.05, vol: 0.06, bus: out });
    }
    song.next += beat * tr.beats;
    song.bar = (song.bar + 1) % song.melody.length;
    if (song.bar === 0) song.loop++;
  }
}
