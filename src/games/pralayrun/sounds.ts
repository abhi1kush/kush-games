/** Generated sounds for Pralay Run (no audio files): jumps, the dash, light bolts, enemies and the collapsing world. */
import { playSound, unlockAudio } from '../sharedSound';

export type PralaySound = 'jump' | 'airJump' | 'dash' | 'shoot' | 'hit' | 'kill' | 'hurt' | 'gem' | 'crumble' | 'collapse' | 'death' | 'stomp'
  | 'enemyShot' | 'heart' | 'land' | 'orbPop' | 'start' | 'best';

const SOUNDS: Record<PralaySound, { milliseconds: number; play: (muted: boolean) => void }> = {
  jump: { milliseconds: 120, play: m => playSound({ tones: [{ frequency: 330, endFrequency: 620, durationSeconds: 0.12, volume: 0.045, type: 'triangle' }] }, m) },
  airJump: { milliseconds: 160, play: m => playSound({ tones: [{ frequency: 520, endFrequency: 980, durationSeconds: 0.14, volume: 0.04, type: 'sine' }, { frequency: 780, endFrequency: 1400, durationSeconds: 0.1, volume: 0.02, type: 'sine', startSeconds: 0.03 }] }, m) },
  dash: { milliseconds: 200, play: m => playSound({ noises: [{ durationSeconds: 0.2, volume: 0.09, filterFrequency: 2400, filterType: 'bandpass' }], tones: [{ frequency: 240, endFrequency: 900, durationSeconds: 0.16, volume: 0.03, type: 'sawtooth' }] }, m) },
  shoot: { milliseconds: 70, play: m => playSound({ tones: [{ frequency: 1250, endFrequency: 560, durationSeconds: 0.08, volume: 0.03, type: 'square' }] }, m) },
  hit: { milliseconds: 60, play: m => playSound({ noises: [{ durationSeconds: 0.05, volume: 0.06, filterFrequency: 1800, filterType: 'bandpass' }] }, m) },
  kill: { milliseconds: 300, play: m => playSound({ noises: [{ durationSeconds: 0.3, volume: 0.1, filterFrequency: 700, filterType: 'lowpass' }], tones: [{ frequency: 660, endFrequency: 1320, durationSeconds: 0.18, volume: 0.04, type: 'triangle' }] }, m) },
  hurt: { milliseconds: 380, play: m => playSound({ tones: [{ frequency: 300, endFrequency: 120, durationSeconds: 0.32, volume: 0.08, type: 'sawtooth' }], noises: [{ durationSeconds: 0.2, volume: 0.08, filterFrequency: 900 }] }, m) },
  gem: { milliseconds: 140, play: m => playSound({ tones: [{ frequency: 1318, durationSeconds: 0.08, volume: 0.035, type: 'sine' }, { frequency: 1976, durationSeconds: 0.12, volume: 0.03, type: 'sine', startSeconds: 0.05 }] }, m) },
  crumble: { milliseconds: 260, play: m => playSound({ noises: [{ durationSeconds: 0.26, volume: 0.09, filterFrequency: 380, filterType: 'lowpass' }] }, m) },
  collapse: { milliseconds: 420, play: m => playSound({ noises: [{ durationSeconds: 0.45, volume: 0.06, filterFrequency: 160, filterType: 'lowpass' }], tones: [{ frequency: 55, endFrequency: 38, durationSeconds: 0.4, volume: 0.05, type: 'sine' }] }, m) },
  death: { milliseconds: 1200, play: m => playSound({ tones: [{ frequency: 440, endFrequency: 110, durationSeconds: 0.9, volume: 0.08, type: 'sawtooth' }, { frequency: 220, endFrequency: 55, durationSeconds: 1.1, volume: 0.07, type: 'triangle', startSeconds: 0.1 }], noises: [{ durationSeconds: 1.0, volume: 0.08, filterFrequency: 300, filterType: 'lowpass' }] }, m) },
  stomp: { milliseconds: 140, play: m => playSound({ tones: [{ frequency: 180, endFrequency: 520, durationSeconds: 0.12, volume: 0.06, type: 'square' }] }, m) },
  enemyShot: { milliseconds: 260, play: m => playSound({ tones: [{ frequency: 140, endFrequency: 300, durationSeconds: 0.25, volume: 0.05, type: 'sawtooth' }] }, m) },
  heart: { milliseconds: 420, play: m => playSound({ tones: [523, 659, 784, 1047].map((frequency, index) => ({ frequency, durationSeconds: 0.18, volume: 0.04, type: 'sine' as OscillatorType, startSeconds: index * 0.07 })) }, m) },
  land: { milliseconds: 80, play: m => playSound({ noises: [{ durationSeconds: 0.07, volume: 0.06, filterFrequency: 420, filterType: 'lowpass' }] }, m) },
  orbPop: { milliseconds: 120, play: m => playSound({ tones: [{ frequency: 900, endFrequency: 1800, durationSeconds: 0.1, volume: 0.035, type: 'triangle' }] }, m) },
  start: { milliseconds: 500, play: m => playSound({ tones: [{ frequency: 196, endFrequency: 392, durationSeconds: 0.5, volume: 0.06, type: 'triangle' }, { frequency: 294, endFrequency: 587, durationSeconds: 0.5, volume: 0.04, type: 'sine', startSeconds: 0.06 }] }, m) },
  best: { milliseconds: 800, play: m => playSound({ tones: [523, 659, 784, 1047, 1319].map((frequency, index) => ({ frequency, durationSeconds: 0.3, volume: 0.045, type: 'sine' as OscillatorType, startSeconds: index * 0.09 })) }, m) },
};

// At most 5 sounds overlap and each kind plays at most once per 50 ms, so a fire-hold or a collapse can't flood the mixer.
const MAX_OVERLAPPING = 5;
const ALWAYS: ReadonlySet<PralaySound> = new Set(['death', 'hurt', 'heart', 'best', 'start']);
const lastPlayed: Partial<Record<PralaySound, number>> = {};
const endTimes = new Float64Array(MAX_OVERLAPPING);

export function playLimited(kind: PralaySound, muted: boolean) {
  if (muted) return;
  const now = performance.now();
  if (now - (lastPlayed[kind] ?? -1e9) < 50) return;
  let slot = 0;
  for (let index = 1; index < MAX_OVERLAPPING; index++) if (endTimes[index] < endTimes[slot]) slot = index;
  if (endTimes[slot] > now && !ALWAYS.has(kind)) return;
  endTimes[slot] = now + SOUNDS[kind].milliseconds;
  lastPlayed[kind] = now;
  SOUNDS[kind].play(muted);
}

/** Create the AudioContext on the first touch/key so the first real sound doesn't stall a frame. */
export function primeAudio() {
  if (!unlockAudio()) return;
  playSound({ tones: [{ frequency: 440, durationSeconds: 0.02, volume: 0.0001 }] }, false);
}
