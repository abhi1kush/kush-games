import { describe, expect, it } from 'vitest';
import { CHECKPOINT_X, emptyProgress, hintFor, parseProgress, SECTION_NAMES } from './engine';

describe('Ember Lane helpers', () => {
  it('saves progress and rejects broken saves', () => {
    const progress = { cleared: true, checkpoint: 3, bestSeconds: 142.5, clears: 2 };
    expect(parseProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
    expect(parseProgress(emptyProgress())).toEqual(emptyProgress());
    expect(parseProgress({ ...progress, checkpoint: 9 })).toBeNull();
    expect(parseProgress({ ...progress, bestSeconds: -1 })).toBeNull();
    expect(parseProgress({ ...progress, clears: 1.5 })).toBeNull();
    expect(parseProgress(null)).toBeNull();
  });

  it('names a section for every checkpoint and teaches each puzzle where it starts', () => {
    expect(SECTION_NAMES.length).toBe(CHECKPOINT_X.length + 1);
    expect(hintFor(CHECKPOINT_X[0], false, 0)).toMatch(/light/);
    expect(hintFor(1060, false, 3)).toMatch(/ember/i);
    expect(hintFor(1760, false, 0)).toMatch(/lantern/i);
    expect(hintFor(1760, true, 0)).toBe('');
    expect(hintFor(2450, false, 2)).toMatch(/crate/i);
    expect(hintFor(3040, false, 0)).toMatch(/lever/i);
    expect(hintFor(3650, false, 0)).toMatch(/door/i);
  });
});
