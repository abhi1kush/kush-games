import { playSound } from '../sharedSound';
import type { Mark } from './game';

export const playPlaceSound = (mark: Mark, isMuted: boolean) =>
  playSound({ tones: [{ frequency: mark === 'X' ? 520 : 390, endFrequency: mark === 'X' ? 620 : 330, durationSeconds: 0.08, volume: 0.06 }] }, isMuted);
export const playWinSound = (isMuted: boolean) =>
  playSound({ tones: [392, 523, 659, 784].map((frequency, i) => ({ frequency, durationSeconds: 0.2, startSeconds: i * 0.09, volume: 0.07 })) }, isMuted);
export const playLoseSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 330, endFrequency: 150, durationSeconds: 0.45, volume: 0.06, type: 'sawtooth' }] }, isMuted);
export const playDrawSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 440, durationSeconds: 0.12, volume: 0.05 }, { frequency: 440, durationSeconds: 0.12, startSeconds: 0.15, volume: 0.05 }] }, isMuted);
