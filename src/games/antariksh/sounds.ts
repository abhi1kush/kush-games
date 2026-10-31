/** Antariksh Defenders' sounds: short Web Audio tones and noise bursts (original, generated in the browser; no audio files). */
import { playSound, unlockAudio } from '../sharedSound';

export type SoundKind = 'shoot' | 'enemyDown' | 'playerDown' | 'mysteryAppear' | 'mysteryDown' | 'shieldHit' | 'waveClear' | 'waveStart' | 'gameOver'
  | 'extraLife' | 'powerUp' | 'countdownTick' | 'liftoff' | 'enemyShoot' | 'bubblePop'
  | 'queenHit' | 'queenDown' | 'weaponUnlock';

const arpeggio = (frequencies: number[], gapSeconds: number, durationSeconds: number, volume: number, type: OscillatorType = 'triangle') =>
  frequencies.map((frequency, index) => ({ frequency, durationSeconds, startSeconds: index * gapSeconds, volume, type }));

const SOUNDS: Record<SoundKind, { play: (muted: boolean) => void; milliseconds: number }> = {
  shoot: { milliseconds: 60, play: muted => playSound({ tones: [{ frequency: 1250, endFrequency: 420, durationSeconds: 0.07, volume: 0.022, type: 'square' }] }, muted) },
  enemyDown: { milliseconds: 160, play: muted => playSound({ noises: [{ durationSeconds: 0.16, volume: 0.12, filterFrequency: 1800 }], tones: [{ frequency: 420, endFrequency: 90, durationSeconds: 0.14, volume: 0.04, type: 'square' }] }, muted) },
  playerDown: { milliseconds: 900, play: muted => playSound({ noises: [{ durationSeconds: 0.7, volume: 0.28, filterFrequency: 700 }], tones: [{ frequency: 520, endFrequency: 60, durationSeconds: 0.8, volume: 0.06, type: 'sawtooth' }] }, muted) },
  mysteryAppear: { milliseconds: 500, play: muted => playSound({ tones: [{ frequency: 300, endFrequency: 900, durationSeconds: 0.25, volume: 0.025, type: 'sine' }, { frequency: 900, endFrequency: 300, durationSeconds: 0.25, startSeconds: 0.25, volume: 0.025, type: 'sine' }] }, muted) },
  mysteryDown: { milliseconds: 600, play: muted => playSound({ noises: [{ durationSeconds: 0.35, volume: 0.2, filterFrequency: 1200 }], tones: arpeggio([784, 988, 1175, 1568], 0.07, 0.12, 0.04, 'square') }, muted) },
  shieldHit: { milliseconds: 60, play: muted => playSound({ noises: [{ durationSeconds: 0.06, volume: 0.07, filterFrequency: 3000 }] }, muted) },
  waveClear: { milliseconds: 1000, play: muted => playSound({ tones: [...arpeggio([523, 659, 784, 1047], 0.11, 0.2, 0.045, 'square'), { frequency: 1319, durationSeconds: 0.4, startSeconds: 0.5, volume: 0.045, type: 'triangle' }] }, muted) },
  waveStart: { milliseconds: 300, play: muted => playSound({ tones: arpeggio([392, 587], 0.1, 0.16, 0.04, 'triangle') }, muted) },
  gameOver: { milliseconds: 1100, play: muted => playSound({ tones: arpeggio([523, 440, 349, 262], 0.22, 0.3, 0.05, 'triangle') }, muted) },
  extraLife: { milliseconds: 600, play: muted => playSound({ tones: arpeggio([659, 784, 988, 1319, 1568], 0.07, 0.12, 0.045, 'square') }, muted) },
  powerUp: { milliseconds: 420, play: muted => playSound({ tones: arpeggio([440, 554, 659, 880], 0.06, 0.12, 0.045, 'triangle') }, muted) },
  countdownTick: { milliseconds: 200, play: muted => playSound({ tones: [{ frequency: 880, durationSeconds: 0.12, volume: 0.04, type: 'sine' }] }, muted) },
  liftoff: { milliseconds: 900, play: muted => playSound({ tones: [{ frequency: 1320, durationSeconds: 0.3, volume: 0.045, type: 'sine' }, { frequency: 80, endFrequency: 160, durationSeconds: 0.8, volume: 0.05, type: 'sawtooth' }], noises: [{ durationSeconds: 0.9, volume: 0.16, filterFrequency: 500 }] }, muted) },
  enemyShoot: { milliseconds: 80, play: muted => playSound({ tones: [{ frequency: 260, endFrequency: 190, durationSeconds: 0.07, volume: 0.018, type: 'triangle' }] }, muted) },
  queenHit: { milliseconds: 90, play: muted => playSound({ tones: [{ frequency: 210, endFrequency: 150, durationSeconds: 0.09, volume: 0.05, type: 'sawtooth' }], noises: [{ durationSeconds: 0.05, volume: 0.06, filterFrequency: 2500 }] }, muted) },
  queenDown: { milliseconds: 900, play: muted => playSound({ noises: [{ durationSeconds: 0.6, volume: 0.24, filterFrequency: 900 }], tones: [{ frequency: 600, endFrequency: 70, durationSeconds: 0.6, volume: 0.05, type: 'sawtooth' }] }, muted) },
  weaponUnlock: { milliseconds: 800, play: muted => playSound({ tones: [...arpeggio([523, 784, 1047, 1568], 0.06, 0.14, 0.045, 'square'), { frequency: 2093, durationSeconds: 0.35, startSeconds: 0.26, volume: 0.035, type: 'triangle' }] }, muted) },
  bubblePop: { milliseconds: 250, play: muted => playSound({ tones: [{ frequency: 1500, endFrequency: 300, durationSeconds: 0.2, volume: 0.04, type: 'sine' }] }, muted) },
};

// The march: four descending bass notes, one per formation step (so it speeds up as the formation thins).
const MARCH_NOTES = [98, 87.3, 77.8, 73.4];
export function playMarch(note: number, muted: boolean) {
  if (muted) return;
  playSound({ tones: [{ frequency: MARCH_NOTES[note & 3], durationSeconds: 0.07, volume: 0.07, type: 'square' }] }, muted);
}

// At most 5 sounds overlap and each kind plays at most once per 45 ms (a firefight can't flood the mixer).
const MAX_OVERLAPPING_SOUNDS = 5;
const ALWAYS_PLAYED: ReadonlySet<SoundKind> = new Set(['powerUp', 'playerDown', 'waveClear', 'gameOver', 'extraLife', 'countdownTick', 'liftoff', 'mysteryDown', 'queenDown', 'weaponUnlock']);
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
