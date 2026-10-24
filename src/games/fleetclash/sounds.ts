/** Generated sea-battle sounds (no audio files); all respect the shared mute. */
import { playSound } from '../sharedSound';

export type FleetSound = 'fire' | 'miss' | 'hit' | 'sunk' | 'place' | 'rotate' | 'error' | 'win' | 'lose' | 'turn';

export function playFleetSound(kind: FleetSound, isMuted: boolean) {
  switch (kind) {
    case 'fire':
      playSound({ tones: [{ frequency: 900, endFrequency: 300, durationSeconds: 0.25, volume: 0.035, type: 'triangle' }], noises: [{ durationSeconds: 0.12, volume: 0.06, filterFrequency: 1200 }] }, isMuted);
      return;
    case 'miss':
      playSound({ noises: [{ durationSeconds: 0.45, volume: 0.07, filterFrequency: 2200, filterType: 'bandpass' }, { durationSeconds: 0.3, volume: 0.04, filterFrequency: 700, startSeconds: 0.12 }] }, isMuted);
      return;
    case 'hit':
      playSound({ tones: [{ frequency: 140, endFrequency: 45, durationSeconds: 0.4, volume: 0.12, type: 'sine' }], noises: [{ durationSeconds: 0.5, volume: 0.12, filterFrequency: 600 }] }, isMuted);
      return;
    case 'sunk':
      playSound({
        tones: [{ frequency: 120, endFrequency: 35, durationSeconds: 0.7, volume: 0.14, type: 'sine' }, { frequency: 330, endFrequency: 220, durationSeconds: 0.6, volume: 0.04, startSeconds: 0.35, type: 'sawtooth' }],
        noises: [{ durationSeconds: 0.8, volume: 0.13, filterFrequency: 500 }, { durationSeconds: 0.6, volume: 0.05, filterFrequency: 3000, filterType: 'highpass', startSeconds: 0.4 }],
      }, isMuted);
      return;
    case 'place':
      playSound({ tones: [{ frequency: 300, endFrequency: 200, durationSeconds: 0.08, volume: 0.06, type: 'triangle' }], noises: [{ durationSeconds: 0.08, volume: 0.03, filterFrequency: 900 }] }, isMuted);
      return;
    case 'rotate':
      playSound({ tones: [{ frequency: 500, endFrequency: 700, durationSeconds: 0.07, volume: 0.04, type: 'triangle' }] }, isMuted);
      return;
    case 'error':
      playSound({ tones: [{ frequency: 180, durationSeconds: 0.12, volume: 0.05, type: 'square' }] }, isMuted);
      return;
    case 'turn':
      playSound({ tones: [{ frequency: 660, durationSeconds: 0.08, volume: 0.05, type: 'sine' }, { frequency: 880, durationSeconds: 0.12, volume: 0.05, startSeconds: 0.08, type: 'sine' }] }, isMuted);
      return;
    case 'win':
      playSound({ tones: [523, 659, 784, 1047, 784, 1047].map((frequency, index) => ({ frequency, durationSeconds: index === 5 ? 0.45 : 0.15, volume: 0.07, startSeconds: index * 0.12, type: 'triangle' as OscillatorType })) }, isMuted);
      return;
    case 'lose':
      playSound({ tones: [392, 349, 311, 262].map((frequency, index) => ({ frequency, durationSeconds: 0.22, volume: 0.07, startSeconds: index * 0.16, type: 'triangle' as OscillatorType })) }, isMuted);
  }
}

/** The sound for a shot result (1 miss, 2 hit, 10+ sunk). */
export const resultSound = (result: number): FleetSound => (result === 1 ? 'miss' : result === 2 ? 'hit' : 'sunk');
