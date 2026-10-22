import { playSound } from '../sharedSound';

export const playRevealSound = (cellsOpened: number, isMuted: boolean) =>
  cellsOpened > 1
    ? playSound({ tones: [{ frequency: 520, endFrequency: 980, durationSeconds: 0.14, volume: 0.06 }], noises: [{ durationSeconds: 0.08, volume: 0.08, filterFrequency: 3000, filterType: 'highpass' }] }, isMuted)
    : playSound({ tones: [{ frequency: 700, durationSeconds: 0.05, volume: 0.05, type: 'square' }] }, isMuted);
export const playFlagSound = (isMuted: boolean) => playSound({ tones: [{ frequency: 880, endFrequency: 1320, durationSeconds: 0.07, volume: 0.05 }] }, isMuted);
export const playBoomSound = (isMuted: boolean) =>
  playSound({ noises: [{ durationSeconds: 0.7, volume: 0.6, filterFrequency: 500 }], tones: [{ frequency: 120, endFrequency: 40, durationSeconds: 0.5, volume: 0.15, type: 'sawtooth' }] }, isMuted);
export const playWinSound = (isMuted: boolean) =>
  playSound({ tones: [523, 659, 784, 1047].map((frequency, i) => ({ frequency, durationSeconds: 0.18, startSeconds: i * 0.09, volume: 0.07 })) }, isMuted);
