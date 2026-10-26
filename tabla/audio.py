"""Deterministic modal percussion synthesis and portable MIDI (GM approximations)."""
from array import array
import io
import math
import random
import struct
import sys
import wave
from functools import lru_cache

SAMPLE_RATE = 22050
TONES = {'Dha': (145, .45, .7), 'Dhin': (195, .5, .55), 'Tin': (340, .48, 0),
         'Ta': (390, .14, 0), 'Na': (430, .2, 0), 'Ge': (105, .5, 1),
         'Ka': (125, .12, .8), 'Ti': (460, .09, 0), 'Te': (320, .09, 0)}
GM = {'Dha': [36, 60], 'Dhin': [36, 62], 'Tin': [60], 'Ta': [76], 'Na': [60],
      'Ge': [64], 'Ka': [64], 'Ti': [77], 'Te': [76], 'Rest': []}


@lru_cache(maxsize=16)
def stroke(bol):
    if bol == 'Rest':
        return array('f', [0.])
    frequency, decay, bass = TONES[bol]
    rng = random.Random(bol)
    result = array('f')
    for n in range(int(SAMPLE_RATE * .65)):
        t = n / SAMPLE_RATE
        attack = min(1., t / .002)
        tonal = sum(weight * math.sin(2 * math.pi * frequency * ratio * t) * math.exp(-t/(decay/(i+1)))
                    for i, (ratio, weight) in enumerate([(1, .6), (1.48, .23), (2.08, .13)]))
        low = bass * .45 * math.sin(2 * math.pi * (85*t + 2*(1-math.exp(-t*24)))) * math.exp(-t/.18)
        noise = rng.uniform(-1, 1) * .15 * math.exp(-t/.012)
        result.append((tonal + low + noise) * attack * .65)
    return result


def render_wav(tokens, bpm=100, beats=16):
    step = 60 / bpm
    signal = array('f', [0.]) * int((len(tokens) * step + .65) * SAMPLE_RATE)
    for position, bol in enumerate(tokens):
        start = round(position * step * SAMPLE_RATE)
        strength = 1. if position % beats == 0 else .8
        for offset, sample in enumerate(stroke(bol)):
            signal[start + offset] += sample * strength
    peak = max(max(abs(v) for v in signal), 1.)
    pcm = array('h', (int(v / peak * 30000) for v in signal))
    if sys.byteorder != 'little':
        pcm.byteswap()
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())
    return buffer.getvalue()


def vlq(value):
    out = [value & 127]
    value >>= 7
    while value:
        out.insert(0, (value & 127) | 128)
        value >>= 7
    return bytes(out)


def render_midi(tokens, bpm=100, beats=16):
    tempo = round(60_000_000 / bpm)
    events = [(0, b'\xff\x51\x03' + tempo.to_bytes(3, 'big'))]
    for index, bol in enumerate(tokens):
        for note in GM[bol]:
            events.append((index * 480, bytes([0x99, note, 110 if index % beats == 0 else 85])))
            events.append((index * 480 + 180, bytes([0x89, note, 0])))
    events.sort(key=lambda e: e[0])
    track, previous = bytearray(), 0
    for tick, event in events:
        track.extend(vlq(tick - previous) + event)
        previous = tick
    track.extend(vlq(len(tokens) * 480 - previous) + b'\xff\x2f\x00')
    return b'MThd' + struct.pack('>IHHH', 6, 0, 1, 480) + b'MTrk' + struct.pack('>I', len(track)) + track


def render_abc(tokens, taal, bpm, beats, groups):
    # A percussion demonstration mapping; ABC pitches do not preserve tabla timbre.
    notes = {'Dha': '[C,G]', 'Dhin': '[C,A]', 'Tin': 'B', 'Ta': 'c', 'Na': 'd',
             'Ge': 'C,', 'Ka': 'D,', 'Ti': 'e', 'Te': 'f', 'Rest': 'z'}
    meter = {16: '4/4', 8: '4/4', 6: '3/4'}[beats]
    bars = []
    bar_length = 4 if beats in (16, 8) else 3
    for i in range(0, len(tokens), bar_length):
        bars.append(' '.join(notes[t] for t in tokens[i:i+bar_length]))
    return f'X:1\nT:{taal.title()} - generated bol study\nM:{meter}\nL:1/4\nQ:1/4={bpm}\nK:C\n% One quarter note per matra. Taal cycle = {beats} matras.\n% Symbolic pitch mapping only; use WAV for synthesized percussion.\n' + ' | '.join(bars) + ' |]\n'
