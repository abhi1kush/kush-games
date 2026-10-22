import { playSound } from '../sharedSound';

export const playFlipSound = (isMuted: boolean) => playSound({ noises: [{ durationSeconds: 0.05, volume: 0.12, filterFrequency: 2500, filterType: 'bandpass' }] }, isMuted);
export const playMatchSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 660, durationSeconds: 0.1, volume: 0.06 }, { frequency: 990, durationSeconds: 0.16, startSeconds: 0.08, volume: 0.06 }] }, isMuted);
export const playMismatchSound = (isMuted: boolean) => playSound({ tones: [{ frequency: 300, endFrequency: 200, durationSeconds: 0.18, volume: 0.05, type: 'square' }] }, isMuted);
export const playCompleteSound = (isMuted: boolean) =>
  playSound({ tones: [523, 659, 784, 1047, 784, 1047].map((frequency, i) => ({ frequency, durationSeconds: 0.16, startSeconds: i * 0.08, volume: 0.06 })) }, isMuted);
