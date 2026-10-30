/** Generated sounds for Ghat Climb: the engine, coins, a jerry can, a flip and the pass. */
import { playSound } from '../sharedSound';

export type GhatSound = 'engine' | 'coin' | 'fuel' | 'crash' | 'finish';

export function playGhatSound(kind: GhatSound, isMuted: boolean) {
  switch (kind) {
    case 'engine': return playSound({ noises: [{ durationSeconds: 0.07, volume: 0.04, filterFrequency: 180 + Math.random() * 80, filterType: 'lowpass' }] }, isMuted);
    case 'coin': return playSound({ tones: [{ frequency: 880, durationSeconds: 0.06, volume: 0.06, type: 'square' }, { frequency: 1320, durationSeconds: 0.08, volume: 0.05, type: 'square', startSeconds: 0.05 }] }, isMuted);
    case 'fuel': return playSound({ tones: [{ frequency: 220, endFrequency: 440, durationSeconds: 0.16, volume: 0.07, type: 'triangle' }] }, isMuted);
    case 'crash': return playSound({ noises: [{ durationSeconds: 0.35, volume: 0.16, filterFrequency: 400, filterType: 'lowpass' }], tones: [{ frequency: 140, endFrequency: 50, durationSeconds: 0.4, volume: 0.1, type: 'sawtooth' }] }, isMuted);
    case 'finish': return playSound({ tones: [523, 659, 784].map((frequency, index) => ({ frequency, durationSeconds: 0.4, volume: 0.07, type: 'triangle' as OscillatorType, startSeconds: index * 0.1 })) }, isMuted);
  }
}
