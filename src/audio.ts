import { getMusicScore, MUSIC_VARIATIONS } from './music.ts';
import { SPELLS, abilityValid, type AbilityId } from './spells.ts';
import { playSpellSound } from './spell-audio.ts';

export type SoundEffect = 'bow' | 'melee' | 'magic' | 'heal' | 'hit' | 'hurt' | 'gather' | 'reward' | 'level-up' | 'jump' | 'death' | 'click';
type Channel = 'music' | 'effects';

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function createGameAudio() {
  const levels = { music: .25, effects: .6 };
  try {
    const saved = JSON.parse(localStorage.getItem('mossvale-audio') || 'null');
    for (const channel of ['music', 'effects'] as const) {
      if (typeof saved?.[channel] === 'number' && Number.isFinite(saved[channel])) levels[channel] = clamp(saved[channel]);
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
  let context: AudioContext | undefined;
  let buses: Record<Channel, GainNode> | undefined;
  let noise: AudioBuffer | undefined;
  let timer: number | undefined;
  let nextNote = 0, step = 0, unlocked = false, disposed = false, resuming = false, pageHidden = false;
  const voices = { music: new Set<AudioScheduledSourceNode>(), effects: new Set<AudioScheduledSourceNode>() };
  const lastEffect = new Map<string, number>();
  const uiBuffers=new Map<string,AudioBuffer>();
  let uiLoading=false,lastUiSound=-Infinity;
  let sceneZone = 'greenwood', sceneCombat = false, variant = 0;
  let score = getMusicScore(sceneZone, sceneCombat, variant);

  function voice(channel: Channel, type: OscillatorType | 'noise', frequency: number, duration: number, amplitude: number, when: number, endFrequency = frequency) {
    if (!context || !buses || !levels[channel] || (channel === 'effects' && voices.effects.size >= 32)) return;
    const source = type === 'noise' ? context.createBufferSource() : context.createOscillator();
    const envelope = context.createGain();
    let filter: BiquadFilterNode | undefined;
    if (source instanceof OscillatorNode) {
      source.type = type as OscillatorType;
      source.frequency.setValueAtTime(frequency, when);
      source.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    } else {
      source.buffer = noise!;
      source.loop = true;
      filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = frequency;
    }
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(amplitude, when + .005);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(filter || envelope);
    if (filter) filter.connect(envelope);
    envelope.connect(buses[channel]);
    voices[channel].add(source);
    source.onended = () => { voices[channel].delete(source); source.disconnect(); filter?.disconnect(); envelope.disconnect(); };
    source.start(when);
    source.stop(when + duration + .015);
  }

  function schedule() {
    if (!context || context.state !== 'running' || document.hidden || pageHidden || disposed) return;
    // A stalled frame skips missed notes instead of playing a burst on recovery.
    if (nextNote < context.currentTime) nextNote = context.currentTime + .02;
    while (nextNote < context.currentTime + .16) {
      // Change mood on a beat; rotate the composition after each full phrase.
      const desired = getMusicScore(sceneZone, sceneCombat, variant);
      if (step % 2 === 0 && desired.id !== score.id) { score = desired; step = 0; }
      const bar = Math.floor(step / 8), beat = step % 8, chord = score.chords[bar], eighth = score.eighth;
      const note = score.melody[bar][beat];
      if (note) voice('music', score.lead, hz(note), eighth * (score.melody[bar][beat + 1] === 0 ? 1.8 : .8), .04, nextNote);
      voice('music', 'triangle', hz(chord[[0, 1, 2, 1, 0, 1, 2, 1][beat]] + 12), eighth * .65, .045, nextNote);
      if (beat % 2 === 0) voice('music', 'triangle', hz(chord[0] - 12 + (beat === 4 ? 7 : 0)), eighth * 1.7, .1, nextNote);
      if (score.percussion) {
        voice('music', 'noise', beat % 4 === 2 ? 2200 : 6500, .045, beat % 4 === 2 ? .045 : .012, nextNote);
        if (beat % 4 === 0) voice('music', 'sine', 100, .14, .15, nextNote, 38);
      }
      step++;
      if (step === score.melody.length * 8) { step = 0; variant = (variant + 1) % MUSIC_VARIATIONS; }
      nextNote += eighth;
    }
  }

  function stopVoices(channel: Channel) {
    for (const source of voices[channel]) { try { source.stop(); } catch { /* Already ended. */ } source.onended?.(new Event('ended')); }
    voices[channel].clear();
  }

  function pause() {
    if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
    stopVoices('music'); stopVoices('effects');
    if (context && context.state !== 'closed') void context.suspend().then(() => {
      // Visibility may change again before the browser finishes suspending.
      if (!document.hidden && !pageHidden && !disposed) start();
    }).catch(() => {});
  }

  function start(userGesture = false) {
    if (!context || !unlocked || disposed || document.hidden || pageHidden) return;
    if (context.state === 'running') {
      if (timer === undefined) { nextNote = context.currentTime + .04; schedule(); timer = window.setInterval(schedule, 60); }
    } else if (context.state !== 'closed' && (!resuming || userGesture)) {
      resuming = true;
      void context.resume().then(() => {
        resuming = false;
        if (disposed || document.hidden || pageHidden) pause();
        else if (context?.state === 'running') start();
      }).catch(() => { resuming = false; });
    }
  }

  function unlock() {
    if (disposed) return;
    if (!context) {
      const AudioConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioConstructor) return;
      try {
        context = new AudioConstructor();
        buses = { music: context.createGain(), effects: context.createGain() };
        for (const channel of ['music', 'effects'] as const) { buses[channel].gain.value = levels[channel]; buses[channel].connect(context.destination); }
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .3), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      } catch { if (context) void context.close().catch(() => {}); context = undefined; return; }
    }
    if(!uiLoading&&typeof fetch==='function'){
      uiLoading=true;const audioContext=context;
      for(const name of ['tap','open','close'])void fetch(`/ui/benji-2026-09-28/sfx/ui_${name}.wav`).then(response=>{if(!response.ok)throw Error('UI sound unavailable');return response.arrayBuffer();}).then(bytes=>audioContext.decodeAudioData(bytes)).then(buffer=>{if(!disposed)uiBuffers.set(name,buffer);}).catch(()=>{});
    }
    unlocked = true;
    // WebKit may leave an automatic resume pending until another trusted gesture.
    start(true);
  }

  function play(name: SoundEffect, volume = 1) {
    if (!context || context.state !== 'running' || !unlocked || disposed || document.hidden || pageHidden || !levels.effects || !Number.isFinite(volume)) return;
    const now = context.currentTime, loudness = clamp(volume);
    if (!loudness || now - (lastEffect.get(name) ?? -Infinity) < .045) return;
    lastEffect.set(name, now);
    const tone = (type: OscillatorType | 'noise', freq: number, duration: number, gain = .16, delay = 0, end = freq) => voice('effects', type, freq, duration, gain * loudness, now + delay, end);
    const notes = (pitches: number[], spacing = .08, type: OscillatorType = 'square') => pitches.forEach((pitch, i) => tone(type, hz(pitch), spacing * 1.5, .095, i * spacing));
    switch (name) {
      case 'bow': tone('noise', 3400, .09, .12); tone('triangle', 540, .11, .22, 0, 140); break;
      case 'melee': tone('noise', 1300, .13, .25); tone('triangle', 160, .13, .24, 0, 45); break;
      case 'magic': notes([69, 76, 81], .065); tone('triangle', 320, .25, .13, 0, 1100); break;
      case 'heal': notes([67, 71, 74, 79], .11, 'triangle'); break;
      case 'hit': tone('noise', 2100, .065, .25); tone('square', 180, .065, .08, 0, 75); break;
      case 'hurt': tone('sawtooth', 180, .2, .12, 0, 65); break;
      case 'gather': tone('noise', 2700, .065, .15); tone('square', 860, .085, .08); tone('triangle', 420, .15, .13); break;
      case 'reward': notes([72, 76, 79], .085); break;
      case 'level-up': notes([67, 71, 74, 79, 83, 86], .12); break;
      case 'jump': tone('square', 180, .16, .08, 0, 560); break;
      case 'death': notes([62, 57, 53, 50], .18, 'triangle'); break;
      case 'click': tone('square', 720, .035, .06, 0, 500); break;
    }
  }

  function ui(name:'tap'|'open'|'close') {
    if(!context||!buses||context.state!=='running'||!unlocked||disposed||document.hidden||pageHidden||!levels.effects)return;
    const now=context.currentTime;if(now-lastUiSound<.08)return;lastUiSound=now;
    const buffer=uiBuffers.get(name);if(!buffer){play('click',.7);return;}
    if(voices.effects.size>=32)return;
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.5;
    source.connect(gain);gain.connect(buses.effects);voices.effects.add(source);
    source.onended=()=>{voices.effects.delete(source);source.disconnect();gain.disconnect();};source.start(now);
  }

  function spell(ability: AbilityId, stage: 'cast' | 'release' | 'impact', volume = 1, delay = 0) {
    if (!context || context.state !== 'running' || !unlocked || disposed || document.hidden || pageHidden || !levels.effects
      || !abilityValid(ability) || !Number.isFinite(volume) || !Number.isFinite(delay) || delay < 0 || delay > 3) return;
    const now = context.currentTime, loudness = clamp(volume), key = `${ability}:${stage}`;
    if (!loudness || now - (lastEffect.get(key) ?? -Infinity) < .09) return;
    lastEffect.set(key, now);
    playSpellSound(SPELLS[ability], stage, (type, freq, duration, gain = .12, offset = 0, end = freq) =>
      voice('effects', type, freq, duration, gain * loudness, now + delay + offset, end));
  }

  function visibility() { if (document.hidden) pause(); else start(); }
  function pagehide() { pageHidden = true; pause(); }
  function pageshow() { pageHidden = false; start(); }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  return {
    unlock, play, spell, ui,
    setScene(zone: string, combat = false) { sceneZone = zone; sceneCombat = combat; },
    reset() { stopVoices('effects'); lastEffect.clear(); sceneCombat = false; },
    volume: (channel: Channel) => levels[channel],
    setVolume(channel: Channel, value: number) {
      if (disposed || !Number.isFinite(value)) return;
      levels[channel] = clamp(value);
      if (buses && context) buses[channel].gain.setTargetAtTime(levels[channel], context.currentTime, .015);
      if (!levels[channel]) stopVoices(channel);
      try { localStorage.setItem('mossvale-audio', JSON.stringify(levels)); } catch { /* Settings still apply for this visit. */ }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
      buses?.music.disconnect(); buses?.effects.disconnect();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
}
