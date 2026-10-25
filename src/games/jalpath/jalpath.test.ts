import { describe, expect, it } from 'vitest';
import { emptyProgress, isElbow, LEVEL_COUNT, parseProgress, recordLoss, recordWin, sideCount } from './engine';
import { cellAt, cellCenter } from './render';

describe('Jal Path helpers', () => {
  it('saves progress that survives a refresh and rejects broken saves', () => {
    const progress = recordWin(emptyProgress(), 0, 2);
    expect(progress).toEqual({ unlocked: 2, stars: [2, ...Array(LEVEL_COUNT - 1).fill(0)], current: 1, extraSeconds: Array(LEVEL_COUNT).fill(0) });
    expect(parseProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
    expect(parseProgress({ unlocked: 0, stars: [], current: 0 })).toBeNull();
    expect(parseProgress({ ...progress, stars: progress.stars.map(() => 4) })).toBeNull();
    expect(parseProgress(null)).toBeNull();
  });

  it('adapts planning time: +5 s per loss (max +30), -7 s per win, never below the base', () => {
    let progress = emptyProgress();
    progress = recordLoss(progress, 2);
    expect(progress.extraSeconds[2]).toBe(5);
    for (let index = 0; index < 10; index++) progress = recordLoss(progress, 2);
    expect(progress.extraSeconds[2]).toBe(30);
    progress = recordWin(progress, 2, 3);
    expect(progress.extraSeconds[2]).toBe(23);
    progress = recordWin(recordWin(recordWin(recordWin(progress, 2, 3), 2, 3), 2, 3), 2, 3);
    expect(progress.extraSeconds[2]).toBe(0);
    expect(recordWin(emptyProgress(), 0, 3).extraSeconds[0]).toBe(0);
    const old = { unlocked: 3, stars: Array(LEVEL_COUNT).fill(1), current: 2 };
    expect(parseProgress(old)?.extraSeconds).toEqual(Array(LEVEL_COUNT).fill(0));
    expect(parseProgress({ ...old, extraSeconds: Array(LEVEL_COUNT).fill(-7) })).toBeNull();
  });

  it('keeps the best stars and never unlocks past the last level', () => {
    let progress = recordWin(emptyProgress(), 0, 3);
    progress = recordWin(progress, 0, 1);
    expect(progress.stars[0]).toBe(3);
    progress = recordWin(progress, LEVEL_COUNT - 1, 1);
    expect(progress.unlocked).toBe(LEVEL_COUNT);
    expect(progress.current).toBe(LEVEL_COUNT - 1);
  });

  it('knows pipe shapes and maps taps to cells (one-tile margin round the board)', () => {
    expect(isElbow(0b0011)).toBe(true);
    expect(isElbow(0b0101)).toBe(false);
    expect(sideCount(0b1111)).toBe(4);
    expect(cellAt(10, 10, 5, 5, 40)).toBeNull();
    expect(cellAt(45, 45, 5, 5, 40)).toBe(0);
    expect(cellAt(40 * 6 - 1, 40 * 6 - 1, 5, 5, 40)).toBe(24);
    const [x, y] = cellCenter(7, 5, 40);
    expect(cellAt(x, y, 5, 5, 40)).toBe(7);
  });
});
