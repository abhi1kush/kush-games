import { describe, expect, it } from 'vitest';
import { CHECKPOINT_X, emptyProgress, GUARD_STATE, guardHint, hintFor, parseProgress, SECTION_NAMES } from './engine';

describe('Ember Lane helpers', () => {
  it('saves progress and rejects broken saves', () => {
    const progress = { cleared: true, checkpoint: 3, bestSeconds: 142.5, clears: 2, stage: 2 as const, stage2Unlocked: true, stage2Clears: 1, stage2BestSeconds: 61 };
    expect(parseProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
    // a save from before stage two: a cleared night street unlocks it, Continue stays on stage one
    expect(parseProgress({ cleared: true, checkpoint: 0, bestSeconds: 100, clears: 1 })).toEqual({ ...emptyProgress(), cleared: true, bestSeconds: 100, clears: 1, stage2Unlocked: true });
    expect(parseProgress({ ...progress, stage: 3 })).toBeNull();
    expect(parseProgress({ ...progress, stage2Clears: -1 })).toBeNull();
    expect(parseProgress({ ...progress, stage: 2, stage2Unlocked: false })?.stage).toBe(1);
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

  it('teaches stage two: put the lamp out, take him down, relight it, lead Kabir out', () => {
    const scene = { x: 150, lampLit: true, guardState: GUARD_STATE.patrol, kabirFollows: false, stones: 3, embers: 1, item: 1 };
    expect(guardHint(scene)).toMatch(/Kabir will hide/);
    expect(guardHint({ ...scene, x: 400 })).toMatch(/stone at the lamp/);
    expect(guardHint({ ...scene, x: 400, item: 0 })).toMatch(/Select stones/);
    expect(guardHint({ ...scene, x: 400, stones: 0 })).toMatch(/pile/);
    expect(guardHint({ ...scene, x: 700, lampLit: false, guardState: GUARD_STATE.relight, relighting: true })).toMatch(/take him down/);
    expect(guardHint({ ...scene, x: 600, lampLit: false, guardState: GUARD_STATE.relight })).toMatch(/kneels/);
    expect(guardHint({ ...scene, x: 700, lampLit: false, guardState: GUARD_STATE.down })).toMatch(/Switch to the ember/);
    expect(guardHint({ ...scene, x: 700, lampLit: false, guardState: GUARD_STATE.down, embers: 0 })).toMatch(/torch on the terrace/);
    expect(guardHint({ ...scene, x: 700, guardState: GUARD_STATE.down, kabirFollows: true })).toMatch(/gate/);
  });
});
