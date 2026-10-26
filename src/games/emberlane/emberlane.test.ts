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
    expect(hintFor(470, false, 3, { onCrate: false, potLit: false, crateX: 2575 })).toMatch(/stone steps/i);
    expect(hintFor(505, false, 3, { onCrate: true, potLit: false, crateX: 2575 })).toMatch(/gutter out and flare/i);
    expect(hintFor(540, false, 3, { onCrate: false, potLit: false, crateX: 2575 })).toMatch(/while the torch burns/i);
    const yard = { onCrate: false, potLit: false, crateX: 2575 };
    expect(hintFor(2540, false, 2, yard)).toMatch(/climb onto/i);
    expect(hintFor(2575, false, 2, { ...yard, onCrate: true })).toMatch(/fire pot/i);
    expect(hintFor(2575, false, 1, { ...yard, onCrate: true, potLit: true })).toMatch(/hop down/i);
    expect(hintFor(2610, false, 1, { ...yard, potLit: true })).toMatch(/push the crate left/i);
    expect(hintFor(2610, false, 1, yard)).toMatch(/climb back/i);
    expect(hintFor(2560, false, 1, { ...yard, crateX: 2530 })).toMatch(/lights the whole yard/i);
    expect(hintFor(3040, false, 0)).toMatch(/lever/i);
    expect(hintFor(3650, false, 0)).toMatch(/door/i);
  });
});
