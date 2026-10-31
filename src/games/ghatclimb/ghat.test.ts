import { describe, expect, it } from 'vitest';
import { engineMood, parseRun } from './engine';

describe('Mountain Climb save', () => {
  it('keeps a climb that is still on the road and drops a broken one', () => {
    expect(parseRun({ x: 420, fuel: 60, coins: 3 })).toEqual({ x: 420, fuel: 60, coins: 3 });
    expect(parseRun({ x: 10, fuel: 60, coins: 0 })).toBeNull();
    expect(parseRun({ x: 420, fuel: 140, coins: 0 })).toBeNull();
    expect(parseRun({ x: 420, fuel: 60, coins: 1.5 })).toBeNull();
    expect(parseRun(null)).toBeNull();
  });
});

describe('Mountain Climb engine gauge', () => {
  it('reads the slope load and the rear tyre', () => {
    expect(engineMood(false, 50, 0.8, 3).mood).toBe('idle');
    expect(engineMood(true, 0, 0.8, 3).mood).toBe('empty');
    expect(engineMood(true, 50, 0.05, 3)).toEqual({ mood: 'cruising', effort: 0.1 });
    expect(engineMood(true, 50, 0.2, 3).mood).toBe('pulling');
    expect(engineMood(true, 50, 0.45, 1)).toEqual({ mood: 'straining', effort: 0.9 });
    expect(engineMood(true, 50, 1.2, 3)).toEqual({ mood: 'too steep', effort: 1 });
    expect(engineMood(true, 50, 0.4, 2).mood).toBe('wheel up');
  });
});
