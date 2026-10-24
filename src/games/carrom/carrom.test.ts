import { describe, expect, it } from 'vitest';
import { frameSteps, type FrameClock, isShotText, MAX_STEPS_PER_FRAME, parseShot, shotText } from './engine';

describe('carrom animation clock', () => {
  it('a frame timestamp earlier than the shot start never gives a negative step count (the shot would skip its animation)', () => {
    // regression: requestAnimationFrame passes the frame's start time, which can be before performance.now() at the
    // moment the shot began; a negative count wrapped to ~4 billion in wasm and played the whole shot in one frame
    const clock: FrameClock = { last: null, carry: 0 };
    const first = frameSteps(clock, 1000);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    expect(frameSteps(clock, 990)).toBe(0);
    expect(frameSteps(clock, 1016.7)).toBeGreaterThanOrEqual(6);
    for (let now = 1017; now < 1200; now += 16.7) { const steps = frameSteps(clock, now); expect(steps).toBeGreaterThanOrEqual(0); expect(steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME); }
  });
  it('a long stall counts as one normal frame and a slow frame is capped', () => {
    const clock: FrameClock = { last: 0, carry: 0 };
    expect(frameSteps(clock, 5000)).toBe(6);
    expect(frameSteps(clock, 5090)).toBe(MAX_STEPS_PER_FRAME);
    expect(clock.carry).toBe(0);
  });
});

describe('carrom shot text', () => {
  it('round-trips and rejects junk', () => {
    const text = shotText({ x: 500.4, aimX: 503, aimY: -20, power: 1200 });
    expect(text).toBe('s500.503.-20.1000');
    expect(parseShot(text)).toEqual({ x: 500, aimX: 503, aimY: -20, power: 1000 });
    expect(isShotText('s50.1.1.1')).toBe(false);
    expect(parseShot('s500.1.1.0')).toBeNull();
  });
});
