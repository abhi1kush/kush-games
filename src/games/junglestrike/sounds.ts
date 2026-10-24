/** Jungle Strike's sounds: short Web Audio tones and noise bursts (original, generated in the browser; no audio files). */
import { playSound, unlockAudio } from '../sharedSound';

export type SoundKind = 'shoot' | 'laser' | 'enemyHit' | 'explosion' | 'bigExplosion' | 'heroDown' | 'powerUp' | 'capsuleOpen' | 'bridgeBlast'
  | 'checkpoint' | 'stageClear' | 'bossHit' | 'jump' | 'splash' | 'enemyShoot' | 'gameOver';

const arpeggio = (frequencies: number[], gapSeconds: number, durationSeconds: number, volume: number, type: OscillatorType = 'triangle') =>
  frequencies.map((frequency, index) => ({ frequency, durationSeconds, startSeconds: index * gapSeconds, volume, type }));

const SOUNDS: Record<SoundKind, { play: (muted: boolean) => void; milliseconds: number }> = {
  shoot: { milliseconds: 50, play: muted => playSound({ tones: [{ frequency: 900, endFrequency: 300, durationSeconds: 0.05, volume: 0.025, type: 'square' }] }, muted) },
  laser: { milliseconds: 180, play: muted => playSound({ tones: [{ frequency: 1800, endFrequency: 420, durationSeconds: 0.18, volume: 0.03, type: 'sawtooth' }] }, muted) },
  enemyHit: { milliseconds: 50, play: muted => playSound({ tones: [{ frequency: 320, endFrequency: 200, durationSeconds: 0.05, volume: 0.03, type: 'square' }] }, muted) },
  explosion: { milliseconds: 260, play: muted => playSound({ noises: [{ durationSeconds: 0.26, volume: 0.2, filterFrequency: 900 }], tones: [{ frequency: 140, endFrequency: 50, durationSeconds: 0.22, volume: 0.05, type: 'triangle' }] }, muted) },
  bigExplosion: { milliseconds: 520, play: muted => playSound({ noises: [{ durationSeconds: 0.5, volume: 0.3, filterFrequency: 600 }], tones: [{ frequency: 90, endFrequency: 35, durationSeconds: 0.5, volume: 0.07, type: 'sawtooth' }] }, muted) },
  heroDown: { milliseconds: 800, play: muted => playSound({ tones: [{ frequency: 660, endFrequency: 110, durationSeconds: 0.7, volume: 0.05, type: 'square' }], noises: [{ durationSeconds: 0.15, volume: 0.12, filterFrequency: 1500 }] }, muted) },
  powerUp: { milliseconds: 420, play: muted => playSound({ tones: arpeggio([392, 523, 659, 784, 1047], 0.06, 0.12, 0.045, 'square') }, muted) },
  capsuleOpen: { milliseconds: 200, play: muted => playSound({ tones: [{ frequency: 500, endFrequency: 1100, durationSeconds: 0.18, volume: 0.04, type: 'sine' }], noises: [{ durationSeconds: 0.1, volume: 0.1, filterFrequency: 2000 }] }, muted) },
  bridgeBlast: { milliseconds: 300, play: muted => playSound({ noises: [{ durationSeconds: 0.3, volume: 0.22, filterFrequency: 700 }] }, muted) },
  checkpoint: { milliseconds: 300, play: muted => playSound({ tones: arpeggio([659, 988], 0.1, 0.18, 0.05, 'sine') }, muted) },
  stageClear: { milliseconds: 1200, play: muted => playSound({ tones: [...arpeggio([392, 523, 659, 784, 1047], 0.13, 0.22, 0.05, 'square'), { frequency: 1319, durationSeconds: 0.5, startSeconds: 0.7, volume: 0.05, type: 'triangle' }] }, muted) },
  bossHit: { milliseconds: 60, play: muted => playSound({ tones: [{ frequency: 180, endFrequency: 120, durationSeconds: 0.06, volume: 0.04, type: 'square' }] }, muted) },
  jump: { milliseconds: 90, play: muted => playSound({ tones: [{ frequency: 220, endFrequency: 440, durationSeconds: 0.09, volume: 0.025, type: 'triangle' }] }, muted) },
  splash: { milliseconds: 220, play: muted => playSound({ noises: [{ durationSeconds: 0.22, volume: 0.12, filterFrequency: 2600 }] }, muted) },
  enemyShoot: { milliseconds: 70, play: muted => playSound({ tones: [{ frequency: 520, endFrequency: 640, durationSeconds: 0.06, volume: 0.018, type: 'sine' }] }, muted) },
  gameOver: { milliseconds: 1100, play: muted => playSound({ tones: arpeggio([523, 440, 349, 262], 0.22, 0.3, 0.05, 'triangle') }, muted) },
};

// At most 5 sounds overlap and each kind plays at most once per 45 ms (a firefight can't flood the mixer).
const MAX_OVERLAPPING_SOUNDS = 5;
const ALWAYS_PLAYED: ReadonlySet<SoundKind> = new Set(['powerUp', 'heroDown', 'stageClear', 'gameOver', 'checkpoint']);
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
