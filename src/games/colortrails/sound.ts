import { playSound } from '../sharedSound';

/** A soft tick per cell drawn; the pitch climbs a little as the path gets longer. */
export const playStepSound = (pathLength: number, isMuted: boolean) =>
  playSound({ tones: [{ frequency: 420 + Math.min(pathLength, 24) * 18, durationSeconds: 0.05, volume: 0.025, type: 'sine' }] }, isMuted);
export const playConnectSound = (color: number, isMuted: boolean) => {
  const base = [523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319, 1397, 1568][color % 12];
  playSound({ tones: [{ frequency: base, durationSeconds: 0.14, volume: 0.06, type: 'triangle' }, { frequency: base * 1.5, durationSeconds: 0.2, startSeconds: 0.07, volume: 0.05, type: 'triangle' }] }, isMuted);
};
export const playCutSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 260, endFrequency: 160, durationSeconds: 0.09, volume: 0.04, type: 'square' }] }, isMuted);
export const playLevelClearSound = (isMuted: boolean) =>
  playSound({ tones: [523, 659, 784, 1047, 1319].map((frequency, index) => ({ frequency, durationSeconds: 0.24, startSeconds: index * 0.08, volume: 0.06 })) }, isMuted);
export const playHintSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 1200, durationSeconds: 0.08, volume: 0.04, type: 'sine' }, { frequency: 1600, durationSeconds: 0.1, startSeconds: 0.07, volume: 0.04, type: 'sine' }] }, isMuted);
