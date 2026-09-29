"""Original Mossvale story score and synced action sound, 32 seconds / 48 kHz.

Run with the bundled Python runtime (numpy + stdlib only).
The fixed seed keeps the exported stereo PCM reproducible.
"""
from pathlib import Path
import wave

import numpy as np


SR = 48_000
DURATION = 32
OUT = Path(__file__).resolve().parents[1] / "assets/trailer-story/mossvale-story-audio.wav"
rng = np.random.default_rng(3906)
mix = np.zeros((SR * DURATION, 2), dtype=np.float64)


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def add(sound, start, gain=1, pan=0):
    offset = round(start * SR)
    length = min(len(sound), len(mix) - offset)
    assert offset >= 0 and length > 0
    gains = np.array([np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)])
    mix[offset:offset + length] += sound[:length, None] * gain * gains


def envelope(t, attack, release):
    return np.minimum(t / attack, 1) * np.minimum((t[-1] - t) / release, 1)


def noise(duration, low, high):
    count = round(duration * SR)
    frequencies = np.fft.rfftfreq(count, 1 / SR)
    spectrum = np.fft.rfft(rng.standard_normal(count))
    spectrum *= np.exp(-(frequencies / high) ** 4)
    spectrum *= 1 - np.exp(-(frequencies / max(low, 1)) ** 4)
    result = np.fft.irfft(spectrum, n=count)
    return result / max(np.std(result), 1e-9)


def pluck(midi, start, gain=.12, pan=0, duration=2.3, glass=False):
    t = np.arange(round(duration * SR)) / SR
    fundamental = hz(midi)
    sound = np.zeros(len(t))
    partials = [(1, 1, 1.5), (2, .30, .55), (3, .12, .28), (4.01, .045, .18)]
    if glass:
        partials = [(1, 1, 1.2), (2.002, .20, .8), (2.76, .055, .4), (4.04, .018, .2)]
    for ratio, level, decay in partials:
        sound += level * np.sin(2 * np.pi * fundamental * ratio * t) * np.exp(-t / decay)
    sound *= (1 - np.exp(-t / .014)) * np.minimum((t[-1] - t) / .25, 1)
    add(sound, start, gain, pan)


def pad(notes, start, duration, gain=.09):
    t = np.arange(round(duration * SR)) / SR
    env = envelope(t, .9, 1.5)
    for index, midi in enumerate(notes):
        sound = np.zeros(len(t))
        for detune in [-.0015, .0011]:
            for harmonic, level in [(1, .64), (2, .17), (3, .075), (4, .022)]:
                phase = rng.uniform(0, 2 * np.pi)
                sound += level * np.sin(2 * np.pi * hz(midi) * (1 + detune) * harmonic * t + phase)
        sound *= env * (.9 + .1 * np.sin(2 * np.pi * .17 * t + index))
        add(sound, start, gain / np.sqrt(len(notes)), -.65 + 1.3 * index / (len(notes) - 1))


def impact(start, gain, duration=2.2, pan=0):
    t = np.arange(round(duration * SR)) / SR
    # Low skin-drum body, short soft transient and a roomy rolling tail.
    phase = 2 * np.pi * (39 * t + 40 * .065 * (1 - np.exp(-t / .065)))
    body = np.sin(phase) * np.exp(-t / .55)
    skin = noise(duration, 90, 1250) * np.exp(-t / .055) * .22
    rumble = noise(duration, 25, 130) * np.exp(-t / .7) * .15
    add((body + skin + rumble) * envelope(t, .004, .3), start, gain, pan)


def whoosh(start, duration, gain, pan=0):
    t = np.arange(round(duration * SR)) / SR
    u = t / duration
    air = noise(duration, 180, 2300)
    swell = np.sin(np.pi * u) ** 2 * (.35 + .65 * u)
    # Slow pitch movement is embedded in airy noise, not a exposed sine sweep.
    phase = 2 * np.pi * (105 * t + 100 * t * t / duration)
    add((air * .55 + np.sin(phase) * .11) * swell, start, gain, pan)


# Foley stays distinct from the drum score: short soil impacts, metal contacts,
# fire crackle and crystal hits use different noise bands and decay lengths.
def footstep(start, gain=.065, pan=0, stone=False):
    duration = .17
    t = np.arange(round(duration * SR)) / SR
    sound = noise(duration, 80, 2400 if stone else 1000) * np.exp(-t / .025)
    sound += .3 * np.sin(2 * np.pi * 94 * t) * np.exp(-t / .048)
    add(sound * envelope(t, .003, .025), start, gain, pan)


def contact(start, gain=.25, pan=0, metal=False):
    duration = .65
    t = np.arange(round(duration * SR)) / SR
    sound = noise(duration, 240, 4200) * np.exp(-t / .055)
    if metal:
        for frequency, level in [(713, .5), (1139, .3), (1987, .13)]:
            sound += level * np.sin(2 * np.pi * frequency * t) * np.exp(-t / .18)
    add(sound * envelope(t, .002, .08), start, gain, pan)
    impact(start, gain * .85, .7, pan)


def magic(start, duration=.8, gain=.13, pan=0, fire=False):
    t = np.arange(round(duration * SR)) / SR
    phase = 2 * np.pi * (200 * t + 670 * t * t / duration)
    airy = noise(duration, 900, 5200) * (.25 + .75 * np.sin(2 * np.pi * 19 * t) ** 6)
    sound = .5 * airy + .2 * np.sin(phase) + .13 * np.sin(phase * 1.5)
    add(sound * envelope(t, .04, .12), start, gain, pan)
    if fire:
        add(noise(duration, 100, 1900) * envelope(t, .04, .3), start, gain * .6, pan)


# One uninterrupted chase and fight: no village cue or scene transitions.
time = np.arange(len(mix)) / SR
wind_env = envelope(time, 1.4, 2.5) * (.62 + .38 * np.sin(2 * np.pi * .075 * time) ** 2)
add(noise(DURATION, 140, 1300) * wind_env, 0, .018, -.65)
add(noise(DURATION, 180, 1000) * wind_env, 0, .014, .65)
# Continuous running: three staggered pairs of boots, then movement during combat.
for start, stop, stone in [(0, 9, False), (9, 18, True), (20, 24, True)]:
    for index, beat in enumerate(np.arange(start, stop, .30)):
        for delay, pan, gain in [(0, -.22, .066), (.095, .3, .048), (.18, -.5, .037)]:
            footstep(float(beat + delay), gain, pan + .09 * (-1) ** index, stone)
for beat in [18.3, 18.6, 19.5, 19.8, 24.4, 24.8, 25.4, 27.4]:
    footstep(beat, .07, -.2, beat > 12)

# 0-18: wolf ambush and running pursuit. One ostinato carries the action.
for start, duration, notes in [(0, 5, [50, 57, 62, 65, 69]),
                               (4.6, 4.5, [46, 53, 58, 62, 65]),
                               (8.5, 4, [43, 50, 55, 58, 62]),
                               (11.7, 3.8, [48, 55, 60, 63, 67]),
                               (15.0, 3.7, [45, 52, 57, 61, 64])]:
    pad(notes, start, duration, .115)
for index, beat in enumerate(np.arange(0, 18, .375)):
    note = [62, 69, 74, 69, 65, 72, 77, 72][index % 8]
    pluck(note, float(beat), .09 if index % 2 else .12, (-1) ** index * .3, 1.2)
for index, beat in enumerate(np.arange(0, 17.9, .75)):
    impact(float(beat), .16 if index % 2 else .24, 1.0, (-1) ** index * .18)
whoosh(.7, .85, .11, .3)  # Wolves charge into the trail.
whoosh(2.1, .4, .16, -.2)
contact(2.5, .37, -.15, metal=True)  # Knight contact: frame 61.
whoosh(3.6, .40, .15, .35)
contact(4, .24, .32)  # Ranger arrow contact: frame 97.
magic(4.05, .65, .11, .25)
whoosh(7.1, .4, .16, -.2)
contact(7.5, .34, -.15, metal=True)  # Additional wolf sword hit: frame 181.
magic((201 - 1) / 24, 2 / 3, .17, .25)
contact(9, .29, .2)  # Additional wolf mage bolt hit: frame 217.
magic(9.04, .55, .08, .2)
whoosh(10.6, .45, .13, -.3)
magic(11.05, .95, .20, -.25, fire=True)
contact(12, .42, .05)  # Fireball hits golem: frame 289.
impact(12.6, .28, 1.1, .12)
magic(12.62, .7, .095, .12)
whoosh(13.6, .4, .17, -.2)
contact(14, .40, -.15, metal=True)  # Second golem sword hit: frame 337.
# Heavy distant boss footsteps build across frames 370-450.
for beat, gain in [(15.375, .18), (16.15, .21), (16.9, .24), (17.65, .28), (18.375, .32)]:
    impact(beat, gain, 1.1, .25)

# 18-29.5: Stormhorn. Building rhythm, a dodge, and three coordinated attacks.
pad([45, 52, 57, 60, 64], 17.75, 4.1, .15)
pad([45, 52, 57, 61, 64], 21.25, 4.5, .16)
pad([45, 52, 57, 61, 64], 25.2, 4.6, .17)
for index, beat in enumerate(np.arange(18, 29.3, .5)):
    impact(float(beat), .23 if index % 2 else .31, 1.2, (-1) ** index * .2)
    pluck([57, 64, 69, 73][index % 4], float(beat + .08), .11, (-1) ** index * .25, 1.1)
whoosh(19.9, 1.1, .22, .2)
impact(21, .62, 2.2)  # Boss ground slam and dust shockwave; heroes dodge.
contact(21, .23)
whoosh(23.65, .35, .18, -.2)
contact(24, .43, -.2, metal=True)  # Knight counter: frame 577.
magic(25.7, .3, .20, .32)
contact(26, .30, .15)  # Mage bolt: frame 625.
magic(26.02, .55, .08, .15)
whoosh(27.6, .40, .16, -.35)
contact(28, .34, -.1)  # Final arrow: frame 673.
whoosh(28.75, .75, .20)
impact(29.5, .65, 2)  # Boss defeat: frame 709.
magic(29.52, .85, .13)

# 30.5-32: victory and the recovered crystal; logo appears over the same shot.
pad([50, 57, 62, 66, 69], 29.75, 2.25, .17)
for index, note in enumerate([74, 78, 81, 86]):
    pluck(note, 30.5 + index * .12, .085, -.4 + index * .25, 1.5, glass=True)
for index, note in enumerate([62, 69, 74, 78, 81]):
    pluck(note, (735 - 1) / 24 + index * .045, .10, -.45 + index * .225, 1.4)
for index, note in enumerate([93, 90, 86, 81, 78, 74]):
    pluck(note, 30.65 + index * .14, .025, np.sin(index * 2) * .65, 1.35, glass=True)

# Lightweight stereo early reflections plus soft late echoes; no external samples.
dry = mix.copy()
for seconds, level, flip in [(.071, .12, True), (.113, .10, False), (.179, .12, True),
                             (.271, .11, False), (.397, .09, True), (.541, .07, False),
                             (.733, .052, True), (1.013, .035, False), (1.331, .019, True)]:
    delay = round(seconds * SR)
    mix[delay:] += dry[:-delay, ::-1] * level if flip else dry[:-delay] * level

# Master headroom and gentle fade guarantee a clean start and tail at exactly 32s.
mix -= mix.mean(axis=0)
mix *= np.minimum(time / .13, 1)[:, None]
mix *= np.minimum((DURATION - time) / 1.2, 1)[:, None]
mix *= .90 / np.max(np.abs(mix))
pcm = np.round(mix * 32767).astype("<i2")
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(SR)
    output.writeframes(pcm.tobytes())

with wave.open(str(OUT), "rb") as check:
    assert (check.getnchannels(), check.getsampwidth(), check.getframerate(), check.getnframes()) == (2, 2, SR, SR * DURATION)
    restored = np.frombuffer(check.readframes(check.getnframes()), "<i2").astype(np.float64).reshape(-1, 2) / 32768
assert np.isfinite(restored).all()
assert .02 < np.sqrt(np.mean(restored ** 2)) < .25
assert .85 < np.max(np.abs(restored)) <= .90
assert np.sqrt(np.mean(restored[SR:4 * SR] ** 2)) > .01
assert np.sqrt(np.mean(restored[20 * SR:26 * SR] ** 2)) > np.sqrt(np.mean(restored[SR:4 * SR] ** 2))
print(OUT)
print(f"Verified: {DURATION}s, {SR} Hz, stereo PCM16; peak {np.max(np.abs(restored)):.4f}; RMS {np.sqrt(np.mean(restored ** 2)):.4f}")
print("Action RMS:", [round(float(np.sqrt(np.mean(restored[a * SR:b * SR] ** 2))), 4) for a, b in [(0, 5), (5, 12), (12, 18), (18, 28), (28, 32)]])
