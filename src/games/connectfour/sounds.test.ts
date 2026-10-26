import { describe, expect, it } from 'vitest';
import { dropSoundParts, landingDelaySeconds } from './sounds';

describe('connect four drop sound', () => {
  it('clacks when the disc lands, later for a longer fall', () => {
    expect(landingDelaySeconds(0, false)).toBeCloseTo(0.41); // bottom row: 6 rows of fall
    expect(landingDelaySeconds(5, false)).toBeCloseTo(0.185); // top row
    const bottom = dropSoundParts(0);
    const clack = bottom.noises.find(noise => noise.filterFrequency === 3200)!;
    expect(clack.startSeconds).toBeCloseTo(0.41);
    expect(bottom.tones[0].startSeconds).toBeCloseTo(0.41);
    expect(bottom.tones[0].frequency).toBeLessThan(dropSoundParts(5).tones[0].frequency); // deeper after a longer fall
    expect(bottom.noises.some(noise => noise.filterType === 'highpass')).toBe(true); // the slide while it falls
  });

  it('lands at once with reduced motion', () => {
    const parts = dropSoundParts(0, true);
    expect(parts.tones[0].startSeconds).toBe(0);
    expect(parts.noises.some(noise => noise.filterType === 'highpass')).toBe(false);
  });
});
