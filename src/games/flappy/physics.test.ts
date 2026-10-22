import { describe, expect, it } from 'vitest';
import {
  BIRD_RADIUS, BIRD_X, circleHitsRect, createFlappy, FIXED_STEP_SECONDS, flap, FlappyState, GROUND_TOP, hitsSomething, MAX_GAP_Y, MIN_GAP_Y,
  nextPipe, PIPE_GAP, PIPE_WIDTH, setPaused, step,
} from './physics';
import { parseFlappySave, serializeFlappy } from './save';

const run = (state: FlappyState, seconds: number) => {
  let current = state;
  for (let elapsed = 0; elapsed < seconds && current.status !== 'over'; elapsed += FIXED_STEP_SECONDS) current = step(current, FIXED_STEP_SECONDS);
  return current;
};

describe('flappy collision', () => {
  it('circle vs rectangle', () => {
    expect(circleHitsRect(0, 0, 10, 5, -5, 10, 10)).toBe(true); // overlapping edge
    expect(circleHitsRect(0, 0, 10, 11, -5, 10, 10)).toBe(false); // just right of it
    expect(circleHitsRect(0, 0, 10, 8, 8, 10, 10)).toBe(false); // corner gap: 8²+8² > 10²
    expect(circleHitsRect(0, 0, 10, 6, 6, 10, 10)).toBe(true); // corner touching
  });

  it('pipes hit above and below the gap but not inside it', () => {
    const pipe = { x: BIRD_X - PIPE_WIDTH / 2, gapY: 250, scored: false };
    expect(hitsSomething(250, [pipe])).toBe(false);
    expect(hitsSomething(250 - PIPE_GAP / 2 + BIRD_RADIUS + 1, [pipe])).toBe(false);
    expect(hitsSomething(250 - PIPE_GAP / 2 + BIRD_RADIUS - 2, [pipe])).toBe(true);
    expect(hitsSomething(250 + PIPE_GAP / 2 - BIRD_RADIUS + 2, [pipe])).toBe(true);
    expect(hitsSomething(GROUND_TOP - BIRD_RADIUS + 1, [])).toBe(true);
  });

  it('falling without flapping ends on the ground', () => {
    const state = run(flap(createFlappy(1)), 5);
    expect(state.status).toBe('over');
    expect(state.birdY).toBe(GROUND_TOP - BIRD_RADIUS);
  });
});

describe('flappy play', () => {
  it('stays ready (bobbing) until the first flap', () => {
    const state = run(createFlappy(1), 2);
    expect(state.status).toBe('ready');
    expect(state.pipes).toHaveLength(0);
  });

  it('an autopilot that flaps below the gap scores once per pipe', () => {
    let state = flap(createFlappy(7));
    for (let tick = 0; tick < 120 * 30 && state.status === 'playing'; tick++) {
      const target = nextPipe(state)?.gapY ?? 250;
      if (state.birdY > target + 18 && state.velocityY > 0) state = flap(state);
      state = step(state, FIXED_STEP_SECONDS);
    }
    expect(state.status).toBe('playing');
    // 30 s at 140 px/s with pipes every 180 px is a little over 20 pipes
    expect(state.score).toBeGreaterThanOrEqual(19);
    expect(state.score).toBeLessThanOrEqual(23);
    expect(state.pipes.every(pipe => pipe.gapY >= MIN_GAP_Y && pipe.gapY <= MAX_GAP_Y)).toBe(true);
  });

  it('pause freezes the world', () => {
    const playing = run(flap(createFlappy(3)), 0.3);
    const paused = setPaused(playing, true);
    expect(step(paused, 1)).toBe(paused);
    expect(flap(paused)).toBe(paused);
    expect(setPaused(paused, false).status).toBe('playing');
  });

  it('the same seed gives the same pipes', () => {
    expect(run(flap(createFlappy(11)), 1.5).pipes).toEqual(run(flap(createFlappy(11)), 1.5).pipes);
  });

  it('saves runs in progress and restores them paused', () => {
    const playing = run(flap(createFlappy(5)), 0.4);
    const restored = parseFlappySave(JSON.parse(JSON.stringify(serializeFlappy(playing))))!;
    expect(restored.status).toBe('paused');
    expect(restored.birdY).toBeCloseTo(playing.birdY);
    expect(serializeFlappy(createFlappy(1))).toBeNull();
    expect(serializeFlappy(run(flap(createFlappy(1)), 5))).toBeNull();
    expect(parseFlappySave({ ...serializeFlappy(playing), birdY: 'high' })).toBeNull();
  });
});
