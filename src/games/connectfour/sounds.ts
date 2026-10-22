import { playSound } from '../sharedSound';

export const playDropSound = (row: number, isMuted: boolean) =>
  playSound({ tones: [{ frequency: 180 + row * 30, endFrequency: 90 + row * 15, durationSeconds: 0.12, volume: 0.09, type: 'sine' }] }, isMuted);

export const playEndSound = (outcome: 'win' | 'lose' | 'draw', isMuted: boolean) => {
  const notes = outcome === 'win' ? [523, 659, 784, 1047] : outcome === 'lose' ? [392, 330, 262] : [440, 440];
  playSound({ tones: notes.map((frequency, index) => ({ frequency, durationSeconds: 0.22, startSeconds: index * 0.11, volume: 0.07 })) }, isMuted);
};
