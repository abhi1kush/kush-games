/** Little Painter's gentle sounds: soft Web Audio tones (generated, no audio files), quiet enough for small ears. */
import { playSound } from '../sharedSound';

export type PaintSound = 'fill' | 'erase' | 'undo' | 'clear' | 'pick' | 'celebrate';

export function playPaintSound(kind: PaintSound, isMuted: boolean) {
  switch (kind) {
    case 'fill': return playSound({ tones: [{ frequency: 520 + Math.random() * 80, endFrequency: 820, durationSeconds: 0.12, volume: 0.045, type: 'sine' }] }, isMuted);
    case 'erase': return playSound({ noises: [{ durationSeconds: 0.12, volume: 0.05, filterFrequency: 1800, filterType: 'bandpass' }] }, isMuted);
    case 'undo': return playSound({ tones: [{ frequency: 660, endFrequency: 420, durationSeconds: 0.13, volume: 0.04, type: 'sine' }] }, isMuted);
    case 'clear': return playSound({ noises: [{ durationSeconds: 0.35, volume: 0.06, filterFrequency: 1400, filterType: 'bandpass' }],
      tones: [{ frequency: 700, endFrequency: 300, durationSeconds: 0.3, volume: 0.03, type: 'sine' }] }, isMuted);
    case 'pick': return playSound({ tones: [{ frequency: 880, durationSeconds: 0.06, volume: 0.025, type: 'sine' }] }, isMuted);
    case 'celebrate': return playSound({ tones: [523, 659, 784, 1047, 1319].map((frequency, i) =>
      ({ frequency, durationSeconds: 0.5, startSeconds: i * 0.11, volume: 0.04, type: 'sine' as OscillatorType }))
      .concat([{ frequency: 1568, durationSeconds: 0.8, startSeconds: 0.6, volume: 0.025, type: 'triangle' }]) }, isMuted);
  }
}
