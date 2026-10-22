import { playSound } from '../sharedSound';

export const playFlapSound = (isMuted: boolean) => playSound({ tones: [{ frequency: 420, endFrequency: 760, durationSeconds: 0.08, volume: 0.05, type: 'sine' }] }, isMuted);
export const playScoreSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 988, durationSeconds: 0.07, volume: 0.05, type: 'square' }, { frequency: 1319, durationSeconds: 0.12, startSeconds: 0.07, volume: 0.05, type: 'square' }] }, isMuted);
export const playHitSound = (isMuted: boolean) =>
  playSound({ noises: [{ durationSeconds: 0.25, volume: 0.45, filterFrequency: 900 }], tones: [{ frequency: 260, endFrequency: 70, durationSeconds: 0.4, volume: 0.08, type: 'sawtooth' }] }, isMuted);
