import { playSound } from '../sharedSound';

export const playSlideSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 380, endFrequency: 900, durationSeconds: 0.16, volume: 0.05, type: 'sine' }], noises: [{ durationSeconds: 0.12, volume: 0.06, filterFrequency: 2400, filterType: 'bandpass' }] }, isMuted);
export const playBlockedSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 180, endFrequency: 120, durationSeconds: 0.18, volume: 0.08, type: 'square' }], noises: [{ durationSeconds: 0.08, volume: 0.2, filterFrequency: 600 }] }, isMuted);
export const playLevelClearSound = (isMuted: boolean) =>
  playSound({ tones: [523, 659, 784, 1047, 1319].map((frequency, i) => ({ frequency, durationSeconds: 0.22, startSeconds: i * 0.08, volume: 0.06 })) }, isMuted);
export const playFailSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 330, endFrequency: 110, durationSeconds: 0.6, volume: 0.07, type: 'sawtooth' }] }, isMuted);
export const playHintSound = (isMuted: boolean) => playSound({ tones: [{ frequency: 1200, durationSeconds: 0.08, volume: 0.04, type: 'sine' }, { frequency: 1600, durationSeconds: 0.1, startSeconds: 0.07, volume: 0.04, type: 'sine' }] }, isMuted);
