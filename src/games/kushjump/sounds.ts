/** Kush Jump's sounds: short Web Audio tones and noise bursts (original, generated; no audio files). */
import { playSound, unlockAudio } from '../sharedSound';

export type SoundKind = 'jump' | 'coin' | 'stomp' | 'bump' | 'brickBreak' | 'powerUpAppears' | 'powerUp' | 'shrink' | 'kick' | 'death' | 'flag' | 'stageClear'
  | 'oneUp' | 'checkpoint' | 'rescue';

const arpeggio = (frequencies: number[], gapSeconds: number, durationSeconds: number, volume: number, type: OscillatorType = 'triangle') =>
  frequencies.map((frequency, index) => ({ frequency, durationSeconds, startSeconds: index * gapSeconds, volume, type }));

const SOUNDS: Record<SoundKind, { play: (muted: boolean) => void; milliseconds: number }> = {
  jump: { milliseconds: 120, play: muted => playSound({ tones: [{ frequency: 260, endFrequency: 620, durationSeconds: 0.12, volume: 0.035, type: 'square' }] }, muted) },
  coin: { milliseconds: 160, play: muted => playSound({ tones: arpeggio([1175, 1760], 0.05, 0.1, 0.04, 'sine') }, muted) },
  stomp: { milliseconds: 110, play: muted => playSound({ tones: [{ frequency: 240, endFrequency: 90, durationSeconds: 0.1, volume: 0.05, type: 'square' }], noises: [{ durationSeconds: 0.05, volume: 0.12, filterFrequency: 700 }] }, muted) },
  bump: { milliseconds: 70, play: muted => playSound({ tones: [{ frequency: 150, endFrequency: 110, durationSeconds: 0.07, volume: 0.06, type: 'triangle' }] }, muted) },
  brickBreak: { milliseconds: 220, play: muted => playSound({ tones: [{ frequency: 200, endFrequency: 60, durationSeconds: 0.18, volume: 0.04, type: 'square' }], noises: [{ durationSeconds: 0.22, volume: 0.22, filterFrequency: 1100 }] }, muted) },
  powerUpAppears: { milliseconds: 260, play: muted => playSound({ tones: [{ frequency: 330, endFrequency: 880, durationSeconds: 0.26, volume: 0.04, type: 'sine' }] }, muted) },
  powerUp: { milliseconds: 380, play: muted => playSound({ tones: arpeggio([440, 554, 659, 880, 1109], 0.06, 0.12, 0.045) }, muted) },
  shrink: { milliseconds: 360, play: muted => playSound({ tones: arpeggio([740, 554, 415, 311], 0.07, 0.12, 0.045, 'square') }, muted) },
  kick: { milliseconds: 60, play: muted => playSound({ tones: [{ frequency: 520, endFrequency: 300, durationSeconds: 0.06, volume: 0.05, type: 'square' }] }, muted) },
  death: { milliseconds: 900, play: muted => playSound({ tones: [{ frequency: 520, endFrequency: 260, durationSeconds: 0.25, volume: 0.05, type: 'square' }, { frequency: 300, endFrequency: 70, durationSeconds: 0.6, startSeconds: 0.28, volume: 0.06, type: 'sawtooth' }] }, muted) },
  flag: { milliseconds: 700, play: muted => playSound({ tones: [{ frequency: 280, endFrequency: 1300, durationSeconds: 0.7, volume: 0.04, type: 'triangle' }] }, muted) },
  stageClear: { milliseconds: 900, play: muted => playSound({ tones: [...arpeggio([523, 659, 784, 1047], 0.12, 0.2, 0.05), { frequency: 1319, durationSeconds: 0.45, startSeconds: 0.5, volume: 0.05, type: 'sine' }] }, muted) },
  oneUp: { milliseconds: 420, play: muted => playSound({ tones: arpeggio([659, 880, 1047, 1319, 1568], 0.07, 0.11, 0.045, 'sine') }, muted) },
  checkpoint: { milliseconds: 260, play: muted => playSound({ tones: arpeggio([784, 1175], 0.09, 0.16, 0.05, 'sine') }, muted) },
  rescue: { milliseconds: 160, play: muted => playSound({ tones: [{ frequency: 660, endFrequency: 990, durationSeconds: 0.14, volume: 0.04, type: 'sine' }] }, muted) },
};

// At most 4 sounds overlap and each kind plays at most once per 45 ms (a coin row or a shell spree can't flood the mixer).
const MAX_OVERLAPPING_SOUNDS = 4;
const ALWAYS_PLAYED: ReadonlySet<SoundKind> = new Set(['powerUp', 'death', 'stageClear', 'flag', 'oneUp']);
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
