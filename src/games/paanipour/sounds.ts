/** Generated Paani Pour sounds (WebAudio, no files); all respect the shared mute. */
import { playSound } from '../sharedSound';

export type PourSound = 'select' | 'invalid' | 'done' | 'win' | 'undo' | 'hint';

export function playPourSound(kind: PourSound, isMuted: boolean) {
  switch (kind) {
    case 'select': playSound({ tones: [{ frequency: 1300, endFrequency: 1700, durationSeconds: 0.05, volume: 0.035, type: 'sine' }] }, isMuted); return;
    case 'invalid': playSound({ tones: [{ frequency: 170, durationSeconds: 0.12, volume: 0.05, type: 'square' }] }, isMuted); return;
    case 'undo': playSound({ tones: [{ frequency: 700, endFrequency: 420, durationSeconds: 0.12, volume: 0.04, type: 'triangle' }] }, isMuted); return;
    case 'hint': playSound({ tones: [{ frequency: 988, durationSeconds: 0.1, volume: 0.04, type: 'sine' }, { frequency: 1319, durationSeconds: 0.14, volume: 0.04, startSeconds: 0.09, type: 'sine' }] }, isMuted); return;
    case 'done': playSound({ tones: [1047, 1319, 1568].map((frequency, index) => ({ frequency, durationSeconds: 0.16, volume: 0.05, startSeconds: index * 0.07, type: 'sine' as OscillatorType })) }, isMuted); return;
    case 'win': playSound({ tones: [523, 659, 784, 1047, 784, 1047].map((frequency, index) => ({ frequency, durationSeconds: index === 5 ? 0.45 : 0.15, volume: 0.07, startSeconds: index * 0.12, type: 'triangle' as OscillatorType })) }, isMuted);
  }
}

/** Water pouring: a hiss of falling water plus glugs that rise in pitch as the tube fills (`fillFrom`/`fillTo` 0…4). */
export function playPour(fillFrom: number, fillTo: number, startDelaySeconds: number, isMuted: boolean) {
  const glugs = Math.max(2, Math.round((fillTo - fillFrom) * 3));
  const tones = Array.from({ length: glugs }, (_, index) => {
    const level = fillFrom + ((fillTo - fillFrom) * index) / glugs;
    const base = 260 + level * 110;
    return { frequency: base, endFrequency: base * 1.6, durationSeconds: 0.07, volume: 0.045, startSeconds: startDelaySeconds + index * (0.32 / glugs), type: 'sine' as OscillatorType };
  });
  playSound({ tones, noises: [{ durationSeconds: 0.36, volume: 0.05, filterFrequency: 1400 + fillTo * 250, filterType: 'bandpass', startSeconds: startDelaySeconds }] }, isMuted);
}
