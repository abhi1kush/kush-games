import { playSound } from '../sharedSound';

export const playMoveSound = (isCapture: boolean, isMuted: boolean) => playSound(isCapture
  ? { tones: [{ frequency: 520, endFrequency: 260, durationSeconds: 0.12, volume: 0.07, type: 'square' }], noises: [{ durationSeconds: 0.05, volume: 0.05, filterFrequency: 1600 }] }
  : { noises: [{ durationSeconds: 0.05, volume: 0.06, filterFrequency: 900 }] }, isMuted);
export const playCrownSound = (isMuted: boolean) =>
  playSound({ tones: [880, 1175].map((frequency, index) => ({ frequency, durationSeconds: 0.16, startSeconds: index * 0.08, volume: 0.05 })) }, isMuted);
export const playEndSound = (didWin: boolean, isMuted: boolean) =>
  playSound({ tones: (didWin ? [523, 659, 784, 1047] : [392, 330, 262]).map((frequency, index) => ({ frequency, durationSeconds: 0.22, startSeconds: index * 0.11, volume: 0.07 })) }, isMuted);
