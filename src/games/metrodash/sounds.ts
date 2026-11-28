/** Metro Dash's sounds: bright, soft Web Audio tones and filtered noise (generated in the browser; no audio files). */
import { playSound, unlockAudio } from '../sharedSound';

export type SoundKind = 'jump' | 'superJump' | 'land' | 'roll' | 'lane' | 'bump' | 'powerUp' | 'powerUpEnd' | 'hoverboardBreak' | 'stumble' | 'crash'
  | 'caught' | 'gameOver' | 'milestone' | 'ramp' | 'streak' | 'start';

const arpeggio = (frequencies: number[], gapSeconds: number, durationSeconds: number, volume: number, type: OscillatorType = 'triangle') =>
  frequencies.map((frequency, index) => ({ frequency, durationSeconds, startSeconds: index * gapSeconds, volume, type }));

const SOUNDS: Record<SoundKind, { play: (muted: boolean) => void; milliseconds: number }> = {
  jump: { milliseconds: 120, play: muted => playSound({ tones: [{ frequency: 380, endFrequency: 720, durationSeconds: 0.14, volume: 0.035, type: 'sine' }] }, muted) },
  superJump: { milliseconds: 200, play: muted => playSound({ tones: [{ frequency: 300, endFrequency: 1100, durationSeconds: 0.3, volume: 0.035, type: 'sine' }, { frequency: 600, endFrequency: 1600, durationSeconds: 0.25, startSeconds: 0.05, volume: 0.012, type: 'triangle' }] }, muted) },
  land: { milliseconds: 120, play: muted => playSound({ noises: [{ durationSeconds: 0.08, volume: 0.06, filterFrequency: 900 }] }, muted) },
  roll: { milliseconds: 150, play: muted => playSound({ noises: [{ durationSeconds: 0.22, volume: 0.06, filterFrequency: 1400, filterType: 'bandpass' }], tones: [{ frequency: 260, endFrequency: 170, durationSeconds: 0.16, volume: 0.02, type: 'sine' }] }, muted) },
  lane: { milliseconds: 60, play: muted => playSound({ noises: [{ durationSeconds: 0.09, volume: 0.045, filterFrequency: 2600, filterType: 'bandpass' }] }, muted) },
  bump: { milliseconds: 120, play: muted => playSound({ tones: [{ frequency: 160, endFrequency: 120, durationSeconds: 0.08, volume: 0.03, type: 'sine' }] }, muted) },
  powerUp: { milliseconds: 400, play: muted => playSound({ tones: [...arpeggio([523, 659, 784, 1047], 0.06, 0.16, 0.032, 'triangle'), { frequency: 1568, durationSeconds: 0.3, startSeconds: 0.24, volume: 0.014, type: 'sine' }] }, muted) },
  powerUpEnd: { milliseconds: 400, play: muted => playSound({ tones: arpeggio([784, 587, 440], 0.07, 0.14, 0.022, 'sine') }, muted) },
  hoverboardBreak: { milliseconds: 500, play: muted => playSound({ tones: [{ frequency: 1300, endFrequency: 420, durationSeconds: 0.35, volume: 0.03, type: 'triangle' }], noises: [{ durationSeconds: 0.3, volume: 0.09, filterFrequency: 3800, filterType: 'highpass' }] }, muted) },
  stumble: { milliseconds: 300, play: muted => playSound({ noises: [{ durationSeconds: 0.18, volume: 0.12, filterFrequency: 700 }], tones: [{ frequency: 220, endFrequency: 150, durationSeconds: 0.18, volume: 0.035, type: 'triangle' }] }, muted) },
  crash: { milliseconds: 700, play: muted => playSound({ noises: [{ durationSeconds: 0.5, volume: 0.2, filterFrequency: 650 }], tones: [{ frequency: 160, endFrequency: 50, durationSeconds: 0.35, volume: 0.05, type: 'sine' }] }, muted) },
  caught: { milliseconds: 700, play: muted => playSound({ tones: [{ frequency: 2100, durationSeconds: 0.12, volume: 0.02, type: 'square' }, { frequency: 2100, durationSeconds: 0.25, startSeconds: 0.16, volume: 0.02, type: 'square' }] }, muted) },
  gameOver: { milliseconds: 1200, play: muted => playSound({ tones: arpeggio([523, 440, 392, 330], 0.18, 0.3, 0.032, 'sine') }, muted) },
  milestone: { milliseconds: 700, play: muted => playSound({ tones: arpeggio([784, 988, 1175, 1568], 0.08, 0.2, 0.028, 'triangle') }, muted) },
  ramp: { milliseconds: 400, play: muted => playSound({ tones: [{ frequency: 300, endFrequency: 620, durationSeconds: 0.3, volume: 0.025, type: 'sine' }] }, muted) },
  streak: { milliseconds: 300, play: muted => playSound({ tones: arpeggio([1319, 1568, 2093], 0.05, 0.12, 0.022, 'sine') }, muted) },
  start: { milliseconds: 400, play: muted => playSound({ tones: arpeggio([392, 523, 659, 784], 0.07, 0.16, 0.03, 'triangle') }, muted) },
};

// Each kind plays at most once per its own length, so a burst of events can't flood the mixer.
const lastPlayedAt: Partial<Record<SoundKind | 'coin', number>> = {};

export function playLimited(kind: SoundKind, muted: boolean) {
  if (muted) return;
  const now = performance.now();
  const sound = SOUNDS[kind];
  if (now - (lastPlayedAt[kind] ?? -1e9) < Math.min(sound.milliseconds, 90)) return;
  lastPlayedAt[kind] = now;
  sound.play(muted);
}

// a pentatonic run, so a line of coins plays a little rising tune
const COIN_NOTES = [988, 1109, 1319, 1480, 1661, 1976];
/** A coin "ting", a step higher for each coin in a streak. */
export function playCoin(streak: number, muted: boolean) {
  if (muted) return;
  const now = performance.now();
  if (now - (lastPlayedAt.coin ?? -1e9) < 45) return;
  lastPlayedAt.coin = now;
  const frequency = COIN_NOTES[Math.max(0, streak - 1) % COIN_NOTES.length];
  playSound({ tones: [{ frequency, durationSeconds: 0.09, volume: 0.024, type: 'sine' }, { frequency: frequency * 1.5, durationSeconds: 0.12, startSeconds: 0.04, volume: 0.012, type: 'sine' }] }, muted);
}

/** Create the AudioContext and run a silent tone on the first touch/key, so the first real sound doesn't stall a frame. */
export function primeAudio() {
  if (!unlockAudio()) return;
  playSound({ tones: [{ frequency: 440, durationSeconds: 0.02, volume: 0.0001 }] }, false);
}
