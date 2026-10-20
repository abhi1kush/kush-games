import { describe, expect, it } from 'vitest';
import {
  applePoints, CONSTANT_SPEEDS, constantSpeedTickMs, createInitialState, currentTickMs, describeSpeedSetting,
  formatMultiplier, lengthMultiplier, setSpeed, SnakeState, SpeedSetting, speedMultiplier, startGame, step, tickIntervalFor,
} from './game';

const speedingUp: SpeedSetting = { mode: 'speeding-up', constantSpeed: 'normal' };
const constant = (constantSpeed: SpeedSetting['constantSpeed']): SpeedSetting => ({ mode: 'constant', constantSpeed });
const firstCell = () => 0;

/** A running game whose next step eats an apple straight ahead. */
function aboutToEat(speed: SpeedSetting, applesEaten = 0, extraLength = 0): SnakeState {
  const base = startGame(createInitialState(30, 5, firstCell, speed));
  const headX = 20;
  const snake = Array.from({ length: 3 + extraLength }, (_, index) => ({ x: headX - index, y: 2 }));
  return { ...base, snake, applesEaten, apple: { x: headX + 1, y: 2 } };
}

describe('scoring formula', () => {
  it('gives the documented examples', () => {
    expect(applePoints(150, 3)).toBe(10);
    expect(applePoints(110, 3)).toBe(14);
    expect(applePoints(80, 3)).toBe(19);
    expect(applePoints(60, 3)).toBe(25);
    expect(applePoints(150, 13)).toBe(15);
    expect(applePoints(60, 23)).toBe(50);
    expect(applePoints(120, 13)).toBe(19);
  });

  it('has multipliers of 1x at the reference speed and starting length', () => {
    expect(speedMultiplier(150)).toBe(1);
    expect(speedMultiplier(60)).toBe(2.5);
    expect(lengthMultiplier(3)).toBe(1);
    expect(lengthMultiplier(23)).toBe(2);
    expect(formatMultiplier(speedMultiplier(110))).toBe('x1.4');
    expect(formatMultiplier(1)).toBe('x1.0');
  });

  it('awards more for faster or longer snakes', () => {
    expect(applePoints(80, 5)).toBeGreaterThan(applePoints(110, 5));
    expect(applePoints(110, 10)).toBeGreaterThan(applePoints(110, 5));
  });

  it('gives equal points for equal speed and length in both modes', () => {
    // speeding-up after 0 apples runs at 150 ms, the same as constant Slow
    expect(step(aboutToEat(speedingUp, 0)).lastApplePoints).toBe(step(aboutToEat(constant('slow'), 0)).lastApplePoints);
    // speeding-up after 30 apples is at the 60 ms floor, same as constant Very fast
    const fastSpeedingUp = step(aboutToEat(speedingUp, 30, 10));
    const fastConstant = step(aboutToEat(constant('very-fast'), 30, 10));
    expect(fastSpeedingUp.lastApplePoints).toBe(fastConstant.lastApplePoints);
    expect(fastSpeedingUp.lastApplePoints).toBe(applePoints(60, 13));
  });

  it('scores with the speed and length from before eating', () => {
    const state = aboutToEat(speedingUp, 10, 4); // 120 ms, length 7
    const next = step(state);
    expect(next.lastApplePoints).toBe(applePoints(120, 7));
    expect(next.score).toBe(state.score + applePoints(120, 7));
    expect(currentTickMs(next)).toBe(117);
  });
});

describe('tick interval per mode', () => {
  it('speeds up in speeding-up mode', () => {
    expect(tickIntervalFor(speedingUp, 0)).toBe(150);
    expect(tickIntervalFor(speedingUp, 10)).toBe(120);
    expect(tickIntervalFor(speedingUp, 100)).toBe(60);
  });

  it('stays fixed in constant mode, even after eating', () => {
    for (const option of CONSTANT_SPEEDS) {
      expect(tickIntervalFor(constant(option.id), 0)).toBe(option.tickMs);
      expect(tickIntervalFor(constant(option.id), 25)).toBe(option.tickMs);
    }
    const after = step(aboutToEat(constant('fast')));
    expect(after.applesEaten).toBe(1);
    expect(currentTickMs(after)).toBe(80);
    expect(constantSpeedTickMs('very-fast')).toBe(60);
  });

  it('describes settings for display', () => {
    expect(describeSpeedSetting(speedingUp)).toBe('Speeding up');
    expect(describeSpeedSetting(constant('fast'))).toBe('Constant · Fast');
  });
});

describe('setSpeed', () => {
  it('only changes the speed before starting or after game over', () => {
    const ready = createInitialState();
    expect(setSpeed(ready, constant('fast')).speed).toEqual(constant('fast'));
    const running = startGame(ready);
    expect(setSpeed(running, constant('fast'))).toBe(running);
    const over: SnakeState = { ...running, status: 'over' };
    expect(setSpeed(over, constant('fast')).speed.mode).toBe('constant');
  });
});
