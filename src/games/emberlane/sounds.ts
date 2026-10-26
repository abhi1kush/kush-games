/** Generated sounds for Ember Lane (no audio files): flames, embers, rats, the shutters and the sanctuary. */
import { playSound } from '../sharedSound';

export type EmberSound = 'step' | 'ignite' | 'throw' | 'fizzle' | 'take' | 'drop' | 'lever' | 'climb' | 'push' | 'squeak' | 'scurry' | 'death' | 'checkpoint' | 'respawn' | 'clear' | 'lanternOut' | 'potOut';

export function playEmberSound(kind: EmberSound, isMuted: boolean) {
  switch (kind) {
    case 'step': return playSound({ noises: [{ durationSeconds: 0.05, volume: 0.05, filterFrequency: 500 + Math.random() * 300, filterType: 'lowpass' }] }, isMuted);
    case 'ignite': return playSound({ noises: [{ durationSeconds: 0.5, volume: 0.22, filterFrequency: 900, filterType: 'bandpass' }, { durationSeconds: 0.9, volume: 0.1, filterFrequency: 300, filterType: 'lowpass', startSeconds: 0.08 }], tones: [{ frequency: 110, endFrequency: 70, durationSeconds: 0.5, volume: 0.12, type: 'triangle' }] }, isMuted);
    case 'throw': return playSound({ noises: [{ durationSeconds: 0.25, volume: 0.1, filterFrequency: 1800, filterType: 'highpass' }], tones: [{ frequency: 520, endFrequency: 260, durationSeconds: 0.25, volume: 0.05, type: 'sine' }] }, isMuted);
    case 'fizzle': return playSound({ noises: [{ durationSeconds: 0.4, volume: 0.1, filterFrequency: 3200, filterType: 'highpass' }] }, isMuted);
    case 'take': return playSound({ tones: [{ frequency: 660, durationSeconds: 0.08, volume: 0.08, type: 'triangle' }, { frequency: 990, durationSeconds: 0.12, volume: 0.06, type: 'triangle', startSeconds: 0.06 }] }, isMuted);
    case 'drop': return playSound({ tones: [{ frequency: 330, endFrequency: 280, durationSeconds: 0.12, volume: 0.08, type: 'triangle' }], noises: [{ durationSeconds: 0.06, volume: 0.06, filterFrequency: 700 }] }, isMuted);
    case 'lever': return playSound({ tones: [{ frequency: 160, endFrequency: 90, durationSeconds: 0.3, volume: 0.12, type: 'square' }], noises: [{ durationSeconds: 0.45, volume: 0.1, filterFrequency: 400, filterType: 'bandpass', startSeconds: 0.1 }] }, isMuted);
    case 'climb': return playSound({ noises: [{ durationSeconds: 0.12, volume: 0.07, filterFrequency: 600 }, { durationSeconds: 0.1, volume: 0.06, filterFrequency: 500, startSeconds: 0.25 }] }, isMuted);
    case 'push': return playSound({ noises: [{ durationSeconds: 0.22, volume: 0.06, filterFrequency: 220, filterType: 'lowpass' }] }, isMuted);
    case 'squeak': return playSound({ tones: [{ frequency: 2600 + Math.random() * 900, endFrequency: 3600, durationSeconds: 0.07, volume: 0.035, type: 'sine' }, { frequency: 3000, endFrequency: 2400, durationSeconds: 0.06, volume: 0.03, type: 'sine', startSeconds: 0.09 }] }, isMuted);
    case 'scurry': return playSound({ noises: [0, 0.05, 0.1, 0.15, 0.2].map(startSeconds => ({ durationSeconds: 0.03, volume: 0.04, filterFrequency: 2500, filterType: 'bandpass' as BiquadFilterType, startSeconds })) }, isMuted);
    case 'death': return playSound({ tones: [{ frequency: 220, endFrequency: 80, durationSeconds: 1.1, volume: 0.12, type: 'sawtooth' }], noises: [{ durationSeconds: 0.9, volume: 0.14, filterFrequency: 2200, filterType: 'bandpass' }] }, isMuted);
    case 'checkpoint': return playSound({ tones: [{ frequency: 392, durationSeconds: 0.4, volume: 0.07, type: 'sine' }, { frequency: 587, durationSeconds: 0.6, volume: 0.06, type: 'sine', startSeconds: 0.12 }] }, isMuted);
    case 'respawn': return playSound({ tones: [{ frequency: 294, endFrequency: 392, durationSeconds: 0.5, volume: 0.06, type: 'sine' }] }, isMuted);
    case 'clear': return playSound({ tones: [392, 494, 587, 784].map((frequency, index) => ({ frequency, durationSeconds: 0.9, volume: 0.07, type: 'sine' as OscillatorType, startSeconds: index * 0.16 })) }, isMuted);
    case 'lanternOut': return playSound({ noises: [{ durationSeconds: 0.35, volume: 0.08, filterFrequency: 1200, filterType: 'bandpass' }], tones: [{ frequency: 300, endFrequency: 150, durationSeconds: 0.4, volume: 0.05, type: 'triangle' }] }, isMuted);
    case 'potOut': return playSound({ noises: [{ durationSeconds: 0.3, volume: 0.07, filterFrequency: 1500, filterType: 'bandpass' }] }, isMuted);
  }
}
