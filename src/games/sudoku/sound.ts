import { playSound } from '../sharedSound';

export const playPlaceSound = (isMuted: boolean) => playSound({ tones: [{ frequency: 660, durationSeconds: 0.06, volume: 0.05 }] }, isMuted);
export const playNoteSound = (isMuted: boolean) => playSound({ tones: [{ frequency: 1100, durationSeconds: 0.04, volume: 0.03, type: 'sine' }] }, isMuted);
export const playMistakeSound = (isMuted: boolean) => playSound({ tones: [{ frequency: 220, endFrequency: 160, durationSeconds: 0.18, volume: 0.06, type: 'square' }] }, isMuted);
export const playSolvedSound = (isMuted: boolean) =>
  playSound({ tones: [523, 659, 784, 1047, 1319].map((frequency, i) => ({ frequency, durationSeconds: 0.22, startSeconds: i * 0.08, volume: 0.06 })) }, isMuted);
