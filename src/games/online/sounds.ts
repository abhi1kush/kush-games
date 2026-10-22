/** Small generated sounds for online play (shared mute). */
import { playSound } from '../sharedSound';
import type { OnlineOutcome } from './result';

export const playConnectedSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 660, durationSeconds: 0.1, volume: 0.06 }, { frequency: 990, durationSeconds: 0.16, volume: 0.06, startSeconds: 0.09 }] }, isMuted);

export function playGameOverSound(outcome: OnlineOutcome, isMuted: boolean) {
  const notes = outcome === 'win' ? [523, 659, 784, 1047] : outcome === 'loss' ? [392, 330, 262] : [440, 440];
  playSound({ tones: notes.map((frequency, index) => ({ frequency, durationSeconds: 0.18, volume: 0.07, startSeconds: index * 0.13 })) }, isMuted);
}

/** Soft ping for an incoming offer (draw or rematch). */
export const playOfferSound = (isMuted: boolean) =>
  playSound({ tones: [{ frequency: 880, durationSeconds: 0.12, volume: 0.05, type: 'sine' }] }, isMuted);
