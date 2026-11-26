/** Zombie Road's sounds: short Web Audio tones and noise bursts (original, generated in the browser; no audio files). */
import { playSound, unlockAudio } from '../sharedSound';

export type SoundKind = 'shoot' | 'zombieHit' | 'zombieDown' | 'playerHurt' | 'lifeLost' | 'waveClear' | 'waveStart' | 'gameOver' | 'pickup'
  | 'coverHit' | 'coverBroken' | 'breach' | 'tankArrives' | 'tankDown' | 'groan' | 'extraLife';

const arpeggio = (frequencies: number[], gapSeconds: number, durationSeconds: number, volume: number, type: OscillatorType = 'triangle') =>
  frequencies.map((frequency, index) => ({ frequency, durationSeconds, startSeconds: index * gapSeconds, volume, type }));

const SOUNDS: Record<SoundKind, { play: (muted: boolean) => void; milliseconds: number }> = {
  shoot: { milliseconds: 60, play: muted => playSound({ noises: [{ durationSeconds: 0.06, volume: 0.07, filterFrequency: 2600 }], tones: [{ frequency: 180, endFrequency: 70, durationSeconds: 0.06, volume: 0.03, type: 'square' }] }, muted) },
  zombieHit: { milliseconds: 70, play: muted => playSound({ noises: [{ durationSeconds: 0.05, volume: 0.06, filterFrequency: 700 }] }, muted) },
  zombieDown: { milliseconds: 220, play: muted => playSound({ noises: [{ durationSeconds: 0.18, volume: 0.13, filterFrequency: 600 }], tones: [{ frequency: 160, endFrequency: 55, durationSeconds: 0.2, volume: 0.05, type: 'sawtooth' }] }, muted) },
  playerHurt: { milliseconds: 260, play: muted => playSound({ tones: [{ frequency: 300, endFrequency: 140, durationSeconds: 0.22, volume: 0.06, type: 'square' }], noises: [{ durationSeconds: 0.12, volume: 0.1, filterFrequency: 1200 }] }, muted) },
  lifeLost: { milliseconds: 1000, play: muted => playSound({ noises: [{ durationSeconds: 0.6, volume: 0.22, filterFrequency: 500 }], tones: [{ frequency: 420, endFrequency: 50, durationSeconds: 0.9, volume: 0.06, type: 'sawtooth' }] }, muted) },
  waveClear: { milliseconds: 1000, play: muted => playSound({ tones: [...arpeggio([392, 523, 659, 784], 0.11, 0.2, 0.045, 'square'), { frequency: 1047, durationSeconds: 0.45, startSeconds: 0.5, volume: 0.04, type: 'triangle' }] }, muted) },
  waveStart: { milliseconds: 600, play: muted => playSound({ tones: [{ frequency: 110, endFrequency: 98, durationSeconds: 0.5, volume: 0.06, type: 'sawtooth' }, { frequency: 165, endFrequency: 147, durationSeconds: 0.5, volume: 0.035, type: 'sawtooth' }] }, muted) },
  gameOver: { milliseconds: 1400, play: muted => playSound({ tones: arpeggio([330, 294, 247, 196, 147], 0.22, 0.32, 0.05, 'triangle') }, muted) },
  pickup: { milliseconds: 420, play: muted => playSound({ tones: arpeggio([523, 659, 784, 1047], 0.06, 0.12, 0.045, 'triangle') }, muted) },
  coverHit: { milliseconds: 90, play: muted => playSound({ noises: [{ durationSeconds: 0.07, volume: 0.08, filterFrequency: 400 }], tones: [{ frequency: 140, endFrequency: 100, durationSeconds: 0.06, volume: 0.03, type: 'triangle' }] }, muted) },
  coverBroken: { milliseconds: 600, play: muted => playSound({ noises: [{ durationSeconds: 0.5, volume: 0.22, filterFrequency: 900 }], tones: [{ frequency: 120, endFrequency: 40, durationSeconds: 0.4, volume: 0.05, type: 'square' }] }, muted) },
  breach: { milliseconds: 500, play: muted => playSound({ tones: [{ frequency: 660, durationSeconds: 0.14, volume: 0.04, type: 'square' }, { frequency: 520, durationSeconds: 0.14, startSeconds: 0.16, volume: 0.04, type: 'square' }] }, muted) },
  tankArrives: { milliseconds: 1300, play: muted => playSound({ tones: [{ frequency: 70, endFrequency: 45, durationSeconds: 1.2, volume: 0.09, type: 'sawtooth' }, { frequency: 105, endFrequency: 60, durationSeconds: 1.0, volume: 0.05, type: 'square' }], noises: [{ durationSeconds: 1.0, volume: 0.12, filterFrequency: 300 }] }, muted) },
  tankDown: { milliseconds: 1100, play: muted => playSound({ noises: [{ durationSeconds: 0.9, volume: 0.26, filterFrequency: 700 }], tones: [...arpeggio([523, 659, 784, 1047, 1319], 0.08, 0.14, 0.04, 'square')] }, muted) },
  groan: { milliseconds: 900, play: muted => playSound({ tones: [{ frequency: 92 + Math.random() * 30, endFrequency: 70, durationSeconds: 0.8, volume: 0.035, type: 'sawtooth' }, { frequency: 138, endFrequency: 104, durationSeconds: 0.7, volume: 0.015, type: 'triangle' }] }, muted) },
  extraLife: { milliseconds: 600, play: muted => playSound({ tones: arpeggio([659, 784, 988, 1319, 1568], 0.07, 0.12, 0.045, 'square') }, muted) },
};

// At most 5 sounds overlap and each kind plays at most once per 45 ms (a firefight can't flood the mixer).
const MAX_OVERLAPPING_SOUNDS = 5;
const ALWAYS_PLAYED: ReadonlySet<SoundKind> = new Set(['playerHurt', 'lifeLost', 'waveClear', 'gameOver', 'pickup', 'coverBroken', 'tankArrives', 'tankDown', 'extraLife', 'breach']);
const lastPlayedAt: Partial<Record<SoundKind, number>> = {};
const soundEndTimes = new Float64Array(MAX_OVERLAPPING_SOUNDS);

export function playLimited(kind: SoundKind, muted: boolean) {
  if (muted) return;
  const now = performance.now();
  if (now - (lastPlayedAt[kind] ?? -1e9) < 45) return;
  let slot = 0;
  for (let index = 1; index < MAX_OVERLAPPING_SOUNDS; index++) if (soundEndTimes[index] < soundEndTimes[slot]) slot = index;
  if (soundEndTimes[slot] > now && !ALWAYS_PLAYED.has(kind)) return;
  soundEndTimes[slot] = now + SOUNDS[kind].milliseconds;
  lastPlayedAt[kind] = now;
  SOUNDS[kind].play(muted);
}

/** Create the AudioContext and run a silent tone on the first touch/key, so the first real sound doesn't stall a frame. */
export function primeAudio() {
  if (!unlockAudio()) return;
  playSound({ tones: [{ frequency: 440, durationSeconds: 0.02, volume: 0.0001 }] }, false);
}
