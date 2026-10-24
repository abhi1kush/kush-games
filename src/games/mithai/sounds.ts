/** Mithai Match sounds: short Web Audio tones and noise bursts (original, generated in the browser; no audio files). */
import { playSound, unlockAudio } from '../sharedSound';

export type SoundKind = 'swap' | 'invalid' | 'specialMade' | 'striped' | 'wrapped' | 'colourBomb' | 'jelly' | 'stone' | 'lock' | 'shuffle' | 'won' | 'lost'
  | 'select' | 'bonus' | 'land' | 'star';

const arpeggio = (frequencies: number[], gapSeconds: number, durationSeconds: number, volume: number, type: OscillatorType = 'triangle') =>
  frequencies.map((frequency, index) => ({ frequency, durationSeconds, startSeconds: index * gapSeconds, volume, type }));

const SOUNDS: Record<SoundKind, (muted: boolean) => void> = {
  swap: muted => playSound({ tones: [{ frequency: 380, endFrequency: 620, durationSeconds: 0.09, volume: 0.03, type: 'sine' }] }, muted),
  invalid: muted => playSound({ tones: [{ frequency: 240, endFrequency: 170, durationSeconds: 0.12, volume: 0.04, type: 'triangle' }, { frequency: 170, endFrequency: 240, durationSeconds: 0.1, startSeconds: 0.12, volume: 0.03, type: 'triangle' }] }, muted),
  specialMade: muted => playSound({ tones: arpeggio([880, 1175, 1568], 0.05, 0.14, 0.035, 'sine') }, muted),
  striped: muted => playSound({ tones: [{ frequency: 1800, endFrequency: 300, durationSeconds: 0.28, volume: 0.035, type: 'sawtooth' }], noises: [{ durationSeconds: 0.18, volume: 0.06, filterFrequency: 4000 }] }, muted),
  wrapped: muted => playSound({ tones: [{ frequency: 160, endFrequency: 50, durationSeconds: 0.35, volume: 0.07, type: 'sine' }], noises: [{ durationSeconds: 0.3, volume: 0.16, filterFrequency: 900 }] }, muted),
  colourBomb: muted => playSound({ tones: arpeggio([523, 659, 784, 1047, 1319, 1568, 2093], 0.04, 0.16, 0.03, 'sine') }, muted),
  jelly: muted => playSound({ tones: [{ frequency: 300, endFrequency: 520, durationSeconds: 0.08, volume: 0.025, type: 'sine' }] }, muted),
  stone: muted => playSound({ noises: [{ durationSeconds: 0.12, volume: 0.15, filterFrequency: 1400 }] }, muted),
  lock: muted => playSound({ tones: [{ frequency: 2200, durationSeconds: 0.06, volume: 0.025, type: 'square' }, { frequency: 1650, durationSeconds: 0.08, startSeconds: 0.05, volume: 0.02, type: 'square' }] }, muted),
  shuffle: muted => playSound({ tones: arpeggio([400, 500, 450, 600, 520, 700], 0.05, 0.07, 0.025, 'triangle') }, muted),
  won: muted => playSound({ tones: [...arpeggio([523, 659, 784, 1047], 0.12, 0.22, 0.05, 'triangle'), { frequency: 1319, durationSeconds: 0.5, startSeconds: 0.5, volume: 0.045, type: 'sine' }] }, muted),
  lost: muted => playSound({ tones: arpeggio([523, 440, 370, 294], 0.2, 0.3, 0.045, 'triangle') }, muted),
  select: muted => playSound({ tones: [{ frequency: 1200, durationSeconds: 0.03, volume: 0.02, type: 'sine' }] }, muted),
  bonus: muted => playSound({ tones: arpeggio([1319, 1568, 1319, 1760, 2093], 0.06, 0.08, 0.025, 'square') }, muted),
  land: muted => playSound({ tones: [{ frequency: 140, endFrequency: 90, durationSeconds: 0.06, volume: 0.03, type: 'sine' }] }, muted),
  star: muted => playSound({ tones: [{ frequency: 1568, durationSeconds: 0.18, volume: 0.04, type: 'sine' }, { frequency: 2093, durationSeconds: 0.25, startSeconds: 0.06, volume: 0.03, type: 'sine' }] }, muted),
};

const lastPlayedAt: Partial<Record<SoundKind, number>> = {};
let lastMatchAt = 0;

/** Each kind plays at most once per 40 ms (a cascade can't flood the mixer). */
export function playLimited(kind: SoundKind, muted: boolean) {
  if (muted) return;
  const now = performance.now();
  if (now - (lastPlayedAt[kind] ?? -1e9) < 40) return;
  lastPlayedAt[kind] = now;
  SOUNDS[kind](muted);
}

/** A bright pluck that climbs a major scale with each cascade. */
const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
export function playMatch(cascade: number, muted: boolean) {
  if (muted) return;
  const now = performance.now();
  if (now - lastMatchAt < 40) return;
  lastMatchAt = now;
  const frequency = SCALE[Math.min(SCALE.length - 1, Math.max(0, cascade - 1))];
  playSound({ tones: [{ frequency, durationSeconds: 0.14, volume: 0.045, type: 'triangle' }, { frequency: frequency * 2, durationSeconds: 0.08, volume: 0.015, type: 'sine' }] }, muted);
}

export function primeAudio() {
  if (!unlockAudio()) return;
  playSound({ tones: [{ frequency: 440, durationSeconds: 0.02, volume: 0.0001 }] }, false);
}
