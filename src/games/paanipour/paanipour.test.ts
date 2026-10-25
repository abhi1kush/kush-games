import { describe, expect, it } from 'vitest';
import { emptyProgress, LEVEL_COUNT, parseProgress, recordWin, WATER_COLOURS } from './engine';
import { layoutTubes, tubeAt, tubeOrigin } from './render';

describe('Paani Pour helpers', () => {
  it('saves progress and the level in play, and rejects broken saves', () => {
    const progress = { ...emptyProgress(), savedLevel: 0, savedPours: [1, 16 + 2] };
    expect(parseProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
    const won = recordWin(progress, 0, 3);
    expect(won).toMatchObject({ unlocked: 2, current: 1, savedLevel: -1, savedPours: [] });
    expect(won.stars[0]).toBe(3);
    expect(recordWin(won, 0, 1).stars[0]).toBe(3);
    expect(parseProgress({ ...progress, savedPours: [999] })).toBeNull();
    expect(parseProgress({ ...progress, stars: [] })).toBeNull();
    expect(recordWin(emptyProgress(), LEVEL_COUNT - 1, 2).unlocked).toBe(LEVEL_COUNT);
  });

  it('has 12 distinct water colours', () => {
    expect(new Set(WATER_COLOURS.slice(1)).size).toBe(12);
  });

  it('lays tubes out in rows that fit, and taps map back to tubes', () => {
    const phone = layoutTubes(14, 360, 600);
    expect(phone.rows).toBeGreaterThan(1);
    expect(phone.columns * phone.cellWidth).toBeLessThanOrEqual(360.01);
    const wide = layoutTubes(5, 900, 600);
    expect(wide.rows).toBe(1);
    for (const layout of [phone, wide]) {
      const count = layout === phone ? 14 : 5;
      for (let tube = 0; tube < count; tube++) {
        const [x, y] = tubeOrigin(tube, count, layout);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x + layout.tubeWidth).toBeLessThanOrEqual(layout.width);
        expect(y + layout.tubeHeight).toBeLessThanOrEqual(layout.height);
        expect(tubeAt(x + layout.tubeWidth / 2, y + layout.tubeHeight / 2, count, layout)).toBe(tube);
      }
    }
  });
});
