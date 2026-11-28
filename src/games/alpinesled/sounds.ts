/** Alpine Drive's sounds: soft Web Audio tones and filtered snow-noise bursts (generated in the browser; no audio files). */
import { playSound, unlockAudio } from '../sharedSound';

export type SoundKind = 'jump' | 'land' | 'ramp' | 'gift' | 'star' | 'shield' | 'shieldBreak' | 'crash' | 'gameOver' | 'milestone' | 'bankScrape' | 'start';

const arpeggio = (frequencies: number[], gapSeconds: number, durationSeconds: number, volume: number, type: OscillatorType = 'triangle') =>
  frequencies.map((frequency, index) => ({ frequency, durationSeconds, startSeconds: index * gapSeconds, volume, type }));

const SOUNDS: Record<SoundKind, { play: (muted: boolean) => void; milliseconds: number }> = {
  jump: { milliseconds: 220, play: muted => playSound({ tones: [{ frequency: 330, endFrequency: 520, durationSeconds: 0.16, volume: 0.035, type: 'sine' }], noises: [{ durationSeconds: 0.14, volume: 0.05, filterFrequency: 2400, filterType: 'bandpass' }] }, muted) },
  land: { milliseconds: 200, play: muted => playSound({ noises: [{ durationSeconds: 0.16, volume: 0.1, filterFrequency: 700 }], tones: [{ frequency: 120, endFrequency: 80, durationSeconds: 0.1, volume: 0.03, type: 'sine' }] }, muted) },
  ramp: { milliseconds: 520, play: muted => playSound({ tones: [{ frequency: 260, endFrequency: 700, durationSeconds: 0.45, volume: 0.035, type: 'sine' }], noises: [{ durationSeconds: 0.4, volume: 0.07, filterFrequency: 3000, filterType: 'bandpass' }] }, muted) },
  gift: { milliseconds: 300, play: muted => playSound({ tones: arpeggio([659, 880, 1047], 0.06, 0.14, 0.035, 'triangle') }, muted) },
  star: { milliseconds: 360, play: muted => playSound({ tones: [...arpeggio([1047, 1319, 1568], 0.05, 0.16, 0.03, 'sine'), { frequency: 2093, durationSeconds: 0.22, startSeconds: 0.15, volume: 0.015, type: 'sine' }] }, muted) },
  shield: { milliseconds: 600, play: muted => playSound({ tones: [...arpeggio([523, 659, 784, 1047], 0.07, 0.22, 0.03, 'sine'), { frequency: 1568, endFrequency: 1760, durationSeconds: 0.4, startSeconds: 0.2, volume: 0.012, type: 'triangle' }] }, muted) },
  shieldBreak: { milliseconds: 500, play: muted => playSound({ tones: [{ frequency: 1400, endFrequency: 500, durationSeconds: 0.35, volume: 0.03, type: 'triangle' }], noises: [{ durationSeconds: 0.3, volume: 0.1, filterFrequency: 4200, filterType: 'highpass' }] }, muted) },
  crash: { milliseconds: 700, play: muted => playSound({ noises: [{ durationSeconds: 0.55, volume: 0.2, filterFrequency: 600 }], tones: [{ frequency: 150, endFrequency: 50, durationSeconds: 0.35, volume: 0.05, type: 'sine' }] }, muted) },
  gameOver: { milliseconds: 1200, play: muted => playSound({ tones: arpeggio([523, 440, 392, 330], 0.2, 0.32, 0.035, 'sine') }, muted) },
  milestone: { milliseconds: 700, play: muted => playSound({ tones: arpeggio([784, 988, 1175, 1568], 0.08, 0.2, 0.03, 'triangle') }, muted) },
  bankScrape: { milliseconds: 260, play: muted => playSound({ noises: [{ durationSeconds: 0.22, volume: 0.05, filterFrequency: 1500, filterType: 'bandpass' }] }, muted) },
  start: { milliseconds: 400, play: muted => playSound({ tones: arpeggio([392, 523, 659], 0.08, 0.18, 0.03, 'sine') }, muted) },
};

// Each kind plays at most once per its own length (a scrape along the bank can't flood the mixer).
const lastPlayedAt: Partial<Record<SoundKind, number>> = {};

export function playLimited(kind: SoundKind, muted: boolean) {
  if (muted) return;
  const now = performance.now();
  const sound = SOUNDS[kind];
  if (now - (lastPlayedAt[kind] ?? -1e9) < Math.min(sound.milliseconds, kind === 'bankScrape' ? 260 : 60)) return;
  lastPlayedAt[kind] = now;
  sound.play(muted);
}

/** Create the AudioContext and run a silent tone on the first touch/key, so the first real sound doesn't stall a frame. */
export function primeAudio() {
  if (!unlockAudio()) return;
  playSound({ tones: [{ frequency: 440, durationSeconds: 0.02, volume: 0.0001 }] }, false);
}
