/** Generated Jal Path sounds (no audio files); all respect the shared mute. */
import { playSound } from '../sharedSound';

export type JalSound = 'turn' | 'blocked' | 'valve' | 'splash' | 'house' | 'win' | 'lose';

export function playJalSound(kind: JalSound, isMuted: boolean) {
  switch (kind) {
    case 'turn': playSound({ tones: [{ frequency: 900, endFrequency: 620, durationSeconds: 0.05, volume: 0.05, type: 'triangle' }], noises: [{ durationSeconds: 0.04, volume: 0.04, filterFrequency: 3000, filterType: 'bandpass' }] }, isMuted); return;
    case 'blocked': playSound({ tones: [{ frequency: 160, durationSeconds: 0.12, volume: 0.06, type: 'square' }] }, isMuted); return;
    case 'valve': playSound({ tones: [{ frequency: 180, endFrequency: 320, durationSeconds: 0.35, volume: 0.05, type: 'sawtooth' }], noises: [{ durationSeconds: 0.6, volume: 0.06, filterFrequency: 900 }] }, isMuted); return;
    case 'splash': playSound({ noises: [{ durationSeconds: 0.25, volume: 0.07, filterFrequency: 1800, filterType: 'bandpass' }] }, isMuted); return;
    case 'house': playSound({ tones: [880, 1175, 1568].map((frequency, index) => ({ frequency, durationSeconds: 0.14, volume: 0.06, startSeconds: index * 0.07, type: 'sine' as OscillatorType })) }, isMuted); return;
    case 'win': playSound({ tones: [523, 659, 784, 1047, 784, 1047].map((frequency, index) => ({ frequency, durationSeconds: index === 5 ? 0.45 : 0.15, volume: 0.07, startSeconds: index * 0.12, type: 'triangle' as OscillatorType })) }, isMuted); return;
    case 'lose': playSound({ tones: [392, 349, 311, 262].map((frequency, index) => ({ frequency, durationSeconds: 0.22, volume: 0.07, startSeconds: index * 0.16, type: 'triangle' as OscillatorType })) }, isMuted);
  }
}
