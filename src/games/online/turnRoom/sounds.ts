/** Generated sounds for the turn games (Ludo, Snakes & Ladders) (no audio files); they all respect the shared mute setting. */
import { playSound } from '../../sharedSound';

export type TurnSound = 'roll' | 'hop' | 'capture' | 'home' | 'six' | 'turn' | 'strike' | 'forfeit' | 'finish' | 'win' | 'join' | 'leave' | 'tick' | 'start' | 'ladder' | 'snake';

export function playTurnSound(kind: TurnSound, isMuted: boolean, step = 0) {
  switch (kind) {
    case 'roll':
      playSound({ noises: [0, 0.07, 0.15, 0.24, 0.34].map((startSeconds, index) => ({ durationSeconds: 0.05, volume: 0.09 - index * 0.012, filterFrequency: 1800 + index * 300, filterType: 'bandpass' as BiquadFilterType, startSeconds })) }, isMuted);
      return;
    case 'hop':
      playSound({ tones: [{ frequency: 520 + step * 22, endFrequency: 700 + step * 22, durationSeconds: 0.07, volume: 0.05, type: 'triangle' }] }, isMuted);
      return;
    case 'capture':
      playSound({
        tones: [{ frequency: 640, endFrequency: 160, durationSeconds: 0.32, volume: 0.08, type: 'sawtooth' }, { frequency: 980, endFrequency: 1300, durationSeconds: 0.12, volume: 0.05, startSeconds: 0.3 }],
        noises: [{ durationSeconds: 0.18, volume: 0.07, filterFrequency: 900 }],
      }, isMuted);
      return;
    case 'home':
      playSound({ tones: [660, 880, 1320].map((frequency, index) => ({ frequency, durationSeconds: 0.14, volume: 0.06, startSeconds: index * 0.08, type: 'sine' as OscillatorType })) }, isMuted);
      return;
    case 'six':
      playSound({ tones: [{ frequency: 880, durationSeconds: 0.08, volume: 0.05 }, { frequency: 1175, durationSeconds: 0.12, volume: 0.05, startSeconds: 0.07 }] }, isMuted);
      return;
    case 'turn':
      playSound({ tones: [{ frequency: 740, durationSeconds: 0.1, volume: 0.06, type: 'sine' }, { frequency: 988, durationSeconds: 0.16, volume: 0.06, startSeconds: 0.1, type: 'sine' }] }, isMuted);
      return;
    case 'tick':
      playSound({ tones: [{ frequency: 1400, durationSeconds: 0.03, volume: 0.035, type: 'square' }] }, isMuted);
      return;
    case 'strike':
      playSound({ tones: [{ frequency: 330, durationSeconds: 0.14, volume: 0.07, type: 'square' }, { frequency: 247, durationSeconds: 0.22, volume: 0.07, startSeconds: 0.15, type: 'square' }] }, isMuted);
      return;
    case 'forfeit':
      playSound({ tones: [392, 330, 262, 196].map((frequency, index) => ({ frequency, durationSeconds: 0.2, volume: 0.07, startSeconds: index * 0.15, type: 'triangle' as OscillatorType })) }, isMuted);
      return;
    case 'finish':
      playSound({ tones: [523, 659, 784].map((frequency, index) => ({ frequency, durationSeconds: 0.16, volume: 0.07, startSeconds: index * 0.11 })) }, isMuted);
      return;
    case 'win':
      playSound({ tones: [523, 659, 784, 1047, 784, 1047].map((frequency, index) => ({ frequency, durationSeconds: index === 5 ? 0.4 : 0.15, volume: 0.07, startSeconds: index * 0.12 })) }, isMuted);
      return;
    case 'join':
      playSound({ tones: [{ frequency: 660, durationSeconds: 0.1, volume: 0.05 }, { frequency: 990, durationSeconds: 0.14, volume: 0.05, startSeconds: 0.09 }] }, isMuted);
      return;
    case 'leave':
      playSound({ tones: [{ frequency: 660, durationSeconds: 0.1, volume: 0.05 }, { frequency: 440, durationSeconds: 0.16, volume: 0.05, startSeconds: 0.09 }] }, isMuted);
      return;
    case 'ladder':
      playSound({ tones: [523, 587, 659, 698, 784, 880, 988, 1047].map((frequency, index) => ({ frequency, durationSeconds: 0.07, volume: 0.05, startSeconds: index * 0.06, type: 'triangle' as OscillatorType })) }, isMuted);
      return;
    case 'snake':
      playSound({ tones: [{ frequency: 900, endFrequency: 140, durationSeconds: 0.7, volume: 0.06, type: 'sawtooth' }], noises: [{ durationSeconds: 0.5, volume: 0.04, filterFrequency: 3000, filterType: 'highpass' }] }, isMuted);
      return;
    case 'start':
      playSound({ tones: [392, 523, 659, 784].map((frequency, index) => ({ frequency, durationSeconds: 0.12, volume: 0.06, startSeconds: index * 0.09, type: 'triangle' as OscillatorType })) }, isMuted);
  }
}
