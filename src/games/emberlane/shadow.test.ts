import { describe, expect, it } from 'vitest';
import { crateShadow } from './render';
import { CRATE } from './engine';

const view = { camX: 0, scale: 2, width: 800, height: 400, ground: 340 };
const slope = (a: [number, number], b: [number, number]) => (b[1] - a[1]) / (b[0] - a[0]);

describe('crate shadow', () => {
  it('has edges that point straight back at the flame', () => {
    const flame: [number, number] = [100, 250]; // above the crate top (340 - 60 = 280)
    const shadow = crateShadow(view, 300, 1, flame[0], flame[1]);
    const [upperCorner, upperFar] = shadow;
    const [lowerBottom, foot] = shadow.slice(-3, -1);
    expect(upperCorner).toEqual([300, view.ground - CRATE.height * view.scale]); // far top corner
    expect(slope(flame, upperCorner)).toBeCloseTo(slope(upperCorner, upperFar), 5);
    expect(upperFar[1]).toBeLessThanOrEqual(view.ground); // it meets the foot of the walls, not the cobbles
    expect(foot).toEqual([300, view.ground]);
    expect(slope(flame, foot)).toBeCloseTo(slope(foot, lowerBottom), 5);
  });

  it('grazes the near corner when the flame is lower than the crate, and mirrors to the left', () => {
    const flame: [number, number] = [500, 300]; // right of the crate, below its top
    const shadow = crateShadow(view, 200, -1, flame[0], flame[1]);
    const nearX = 200 + CRATE.half * 2 * view.scale;
    expect(shadow[0][0]).toBe(nearX);
    expect(shadow[1][0]).toBeLessThan(200);
    expect(slope(flame, shadow[0])).toBeCloseTo(slope(shadow[0], shadow[1]), 5);
  });
});
