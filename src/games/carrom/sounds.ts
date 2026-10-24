/** Generated carrom sounds (no audio files): clicks scale with how hard discs meet; all respect the shared mute. */
import { playSound } from '../sharedSound';

export type CarromSound = 'flick' | 'pocket' | 'foul' | 'queen' | 'turn' | 'win' | 'lose' | 'place';

export function playCarromSound(kind: CarromSound, isMuted: boolean) {
  switch (kind) {
    case 'flick': playSound({ tones: [{ frequency: 1400, endFrequency: 500, durationSeconds: 0.05, volume: 0.05, type: 'triangle' }], noises: [{ durationSeconds: 0.06, volume: 0.07, filterFrequency: 2500 }] }, isMuted); return;
    case 'pocket': playSound({ tones: [{ frequency: 260, endFrequency: 110, durationSeconds: 0.22, volume: 0.1, type: 'sine' }], noises: [{ durationSeconds: 0.18, volume: 0.05, filterFrequency: 500 }] }, isMuted); return;
    case 'foul': playSound({ tones: [{ frequency: 220, durationSeconds: 0.16, volume: 0.06, type: 'square' }, { frequency: 165, durationSeconds: 0.26, volume: 0.06, startSeconds: 0.16, type: 'square' }] }, isMuted); return;
    case 'queen': playSound({ tones: [784, 988, 1175, 1568].map((frequency, index) => ({ frequency, durationSeconds: 0.14, volume: 0.06, startSeconds: index * 0.08, type: 'triangle' as OscillatorType })) }, isMuted); return;
    case 'turn': playSound({ tones: [{ frequency: 660, durationSeconds: 0.08, volume: 0.04, type: 'sine' }, { frequency: 880, durationSeconds: 0.1, volume: 0.04, startSeconds: 0.08, type: 'sine' }] }, isMuted); return;
    case 'place': playSound({ tones: [{ frequency: 420, endFrequency: 360, durationSeconds: 0.04, volume: 0.03, type: 'triangle' }] }, isMuted); return;
    case 'win': playSound({ tones: [523, 659, 784, 1047, 784, 1047].map((frequency, index) => ({ frequency, durationSeconds: index === 5 ? 0.45 : 0.15, volume: 0.07, startSeconds: index * 0.12, type: 'triangle' as OscillatorType })) }, isMuted); return;
    case 'lose': playSound({ tones: [392, 349, 311, 262].map((frequency, index) => ({ frequency, durationSeconds: 0.22, volume: 0.07, startSeconds: index * 0.16, type: 'triangle' as OscillatorType })) }, isMuted);
  }
}

/** A wooden click: `strength` is the impact speed (board units / s); quiet taps are skipped. */
export function playClick(strength: number, cushion: boolean, isMuted: boolean) {
  if (strength < 120) return;
  const volume = Math.min(0.12, 0.015 + strength / 30000);
  if (cushion) playSound({ tones: [{ frequency: 140, endFrequency: 90, durationSeconds: 0.08, volume: volume * 0.9, type: 'sine' }], noises: [{ durationSeconds: 0.05, volume: volume * 0.6, filterFrequency: 700 }] }, isMuted);
  else playSound({ tones: [{ frequency: 2100, endFrequency: 1500, durationSeconds: 0.035, volume, type: 'triangle' }], noises: [{ durationSeconds: 0.03, volume: volume * 0.8, filterFrequency: 3500, filterType: 'bandpass' }] }, isMuted);
}
