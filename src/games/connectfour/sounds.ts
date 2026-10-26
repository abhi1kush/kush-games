import { type NoiseOptions, playSound, type ToneOptions } from '../sharedSound';
import { ROWS } from './engine';

/** When the falling disc lands, matching the CSS drop animation (140 ms + 45 ms per row it falls). */
export function landingDelaySeconds(row: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : (140 + (ROWS - row) * 45) / 1000;
}

/**
 * A disc dropped into the frame: a faint plastic slide as it falls, a hard clack when it lands (a bright click plus
 * a hollow knock from the frame, a little deeper the further it fell), and a small rattle as it settles.
 */
export function dropSoundParts(row: number, reducedMotion = false): { tones: ToneOptions[]; noises: NoiseOptions[] } {
  const land = landingDelaySeconds(row, reducedMotion);
  const fall = ROWS - row; // 1 (top row) … 6 (bottom)
  const noises: NoiseOptions[] = [
    { durationSeconds: 0.03, volume: 0.32, filterFrequency: 3200, filterType: 'bandpass', startSeconds: land }, // the click
    { durationSeconds: 0.05, volume: 0.22, filterFrequency: 900, filterType: 'bandpass', startSeconds: land + 0.004 }, // the knock
    { durationSeconds: 0.025, volume: 0.12, filterFrequency: 2600, filterType: 'bandpass', startSeconds: land + 0.085 }, // the settle
  ];
  if (land > 0.05) noises.unshift({ durationSeconds: land * 0.9, volume: 0.035, filterFrequency: 1800, filterType: 'highpass' }); // the slide
  const tones: ToneOptions[] = [
    { frequency: 230 - fall * 12, endFrequency: 95, durationSeconds: 0.11, volume: 0.13, type: 'triangle', startSeconds: land },
    { frequency: 1250 + row * 40, endFrequency: 900, durationSeconds: 0.035, volume: 0.035, type: 'square', startSeconds: land },
    { frequency: 260 - fall * 10, endFrequency: 150, durationSeconds: 0.05, volume: 0.05, type: 'triangle', startSeconds: land + 0.085 },
  ];
  return { tones, noises };
}

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Play the drop for a disc landing in `row` (0 = bottom). Silent while muted. */
export const playDropSound = (row: number, isMuted: boolean) => playSound(dropSoundParts(row, prefersReducedMotion()), isMuted);

export const playEndSound = (outcome: 'win' | 'lose' | 'draw', isMuted: boolean) => {
  const notes = outcome === 'win' ? [523, 659, 784, 1047] : outcome === 'lose' ? [392, 330, 262] : [440, 440];
  playSound({ tones: notes.map((frequency, index) => ({ frequency, durationSeconds: 0.22, startSeconds: index * 0.11, volume: 0.07 })) }, isMuted);
};
