"""Original Mossvale score and timed VFX sound design, 24 seconds / 48 kHz.

Run with the bundled Python runtime (numpy + stdlib only).
The fixed seed keeps the exported stereo PCM reproducible.
"""
from pathlib import Path
import wave

import numpy as np


SR = 48_000
DURATION = 24
OUT = Path(__file__).resolve().parents[1] / "assets/trailer/mossvale-trailer-audio.wav"
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


# 0-5: first light. Stereo wind and a sparse hand-played harp phrase.
time = np.arange(len(mix)) / SR
wind_env = envelope(time, 1.4, 2.5) * (.62 + .38 * np.sin(2 * np.pi * .075 * time) ** 2)
add(noise(DURATION, 140, 1300) * wind_env, 0, .018, -.65)
add(noise(DURATION, 180, 1000) * wind_env, 0, .014, .65)
pad([50, 57, 62, 65, 69], 0, 6, .105)
for note, beat, pan in [(74, .6, -.3), (69, 1.35, .25), (77, 2.1, -.15), (76, 3.1, .3), (74, 4.0, -.2)]:
    pluck(note, beat, .105, pan)
for note, beat in [(86, 1.1), (81, 2.65), (89, 4.15)]:
    pluck(note, beat, .035, .5, glass=True)

# 5-10: village and adventurers. Warm major harmony, a walking harp ostinato.
pad([46, 53, 58, 62, 65], 4.75, 6.0, .135)
for index, note in enumerate([58, 65, 70, 74, 65, 70, 77, 74, 70, 65]):
    pluck(note, 5 + index * .48, .13 if index % 2 == 0 else .09, (-1) ** index * .32)
impact(5.05, .13, 1.8)
impact(7.48, .12, 1.8, -.15)
whoosh(9.25, 1.25, .065, .2)

# 10-15: the Rootvault. Descending low harmony and an ascending crystalline spell.
pad([43, 50, 55, 62, 69], 9.65, 6.4, .125)
impact(10.02, .24, 2.1)
for index, note in enumerate([67, 74, 79, 74, 70, 77, 82, 86]):
    pluck(note, 10.2 + index * .55, .085, np.sin(index * 1.7) * .6, glass=True)
for index, note in enumerate([55, 62, 67, 62, 55, 62, 69, 74]):
    pluck(note, 10.1 + index * .6, .09, (-1) ** index * .3)
whoosh(13.55, 1.8, .13, -.1)
whoosh(14.1, .9, .095, .35)

# 15-20.5: Stormhorn. Dominant tension, drums, electrical air and the 18s shockwave.
pad([45, 52, 57, 62, 64], 14.5, 3.7, .165)
pad([45, 52, 57, 61, 64], 17.0, 4.7, .175)
for beat, gain, pan in [(15, .40, 0), (15.75, .22, -.25), (16.5, .32, .2),
                        (17.25, .25, -.2), (17.65, .18, .2), (18, .68, 0),
                        (19.15, .28, .18), (19.7, .22, -.15)]:
    impact(beat, gain, 2.6 if beat == 18 else 1.7, pan)
for index, note in enumerate([57, 64, 69, 74, 57, 64, 69, 73, 57, 64, 69]):
    pluck(note, 15 + index * .48, .135, (-1) ** index * .3, 1.6)
whoosh(16.55, 1.48, .19)
whoosh(17.45, .56, .105, -.4)
for start in [15.3, 16.2, 17.05, 18.32, 19.25]:
    t = np.arange(round(.65 * SR)) / SR
    crackle = noise(.65, 1000, 4800) * (.3 + .7 * np.sin(2 * np.pi * 14 * t) ** 8)
    add(crackle * np.exp(-t / .16) * envelope(t, .005, .08), start, .043, rng.uniform(-.5, .5))
whoosh(19.85, 1.18, .105, .15)

# 20.5-24: the Mossvale wordmark. Bright final resolution with falling gold chimes.
pad([50, 57, 62, 66, 69], 20.25, 3.75, .165)
impact(20.95, .32, 2.5)
for index, note in enumerate([62, 69, 74, 78, 81]):
    pluck(note, 20.85 + index * .055, .12, -.45 + index * .225, 3)
for index, note in enumerate([93, 90, 86, 81, 78, 74]):
    pluck(note, 21.08 + index * .22, .035, np.sin(index * 2) * .65, 2.5, glass=True)

# Lightweight stereo early reflections plus soft late echoes; no external samples.
dry = mix.copy()
for seconds, level, flip in [(.071, .12, True), (.113, .10, False), (.179, .12, True),
                             (.271, .11, False), (.397, .09, True), (.541, .07, False),
                             (.733, .052, True), (1.013, .035, False), (1.331, .019, True)]:
    delay = round(seconds * SR)
    mix[delay:] += dry[:-delay, ::-1] * level if flip else dry[:-delay] * level

# Master headroom and gentle fade guarantee a clean start and tail at exactly 24s.
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
assert .85 < np.max(np.abs(restored)) <= .92
assert np.sqrt(np.mean(restored[SR:4 * SR] ** 2)) > .01
assert np.sqrt(np.mean(restored[17 * SR:19 * SR] ** 2)) > np.sqrt(np.mean(restored[SR:4 * SR] ** 2))
print(OUT)
print(f"Verified: {DURATION}s, {SR} Hz, stereo PCM16; peak {np.max(np.abs(restored)):.4f}; RMS {np.sqrt(np.mean(restored ** 2)):.4f}")
print("5s RMS:", [round(float(np.sqrt(np.mean(restored[a * SR:b * SR] ** 2))), 4) for a, b in [(0, 5), (5, 10), (10, 15), (15, 20), (20, 24)]])
