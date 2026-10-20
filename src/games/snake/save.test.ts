import { describe, expect, it } from 'vitest';
import { changeDirection, createInitialState, SnakeState, startGame, step } from './game';
import { parseSnakeSave, restoreSnake, serializeSnake } from './save';

const fixedRandom = () => 0.5;
function playedGame(): SnakeState {
  let state = startGame(createInitialState(17, 17, fixedRandom, { mode: 'speeding-up', constantSpeed: 'normal' }));
  // put the apple right in front of the head so it gets eaten
  state = { ...state, apple: { x: state.snake[0].x + 1, y: state.snake[0].y } };
  state = step(state, fixedRandom);
  state = changeDirection(state, 'up');
  return step(step(state, fixedRandom), fixedRandom);
}
const roundTrip = (state: SnakeState) => {
  const saved = serializeSnake(state);
  const parsed = saved && parseSnakeSave(JSON.parse(JSON.stringify(saved)));
  return parsed ? restoreSnake(parsed) : null;
};

describe('Snake save', () => {
  it('round-trips body, direction, apple, score, speed and comes back paused', () => {
    const state = playedGame();
    expect(state.applesEaten).toBe(1);
    const restored = roundTrip(state)!;
    expect(restored.snake).toEqual(state.snake);
    expect(restored.snake.length).toBe(4);
    expect(restored).toMatchObject({ direction: 'up', apple: state.apple, score: state.score, applesEaten: 1, speed: state.speed, status: 'paused' });
    const saved = serializeSnake(state)!;
    expect(saved.length).toBe(4);
    expect(saved.tickMs).toBe(147);
  });

  it('a restored game continues identically after resuming', () => {
    const state = playedGame();
    const restored = startGame(roundTrip(state)!);
    expect(step(restored, fixedRandom).snake).toEqual(step(state, fixedRandom).snake);
  });

  it('only saves games in progress', () => {
    expect(serializeSnake(createInitialState())).toBeNull();
    expect(serializeSnake({ ...playedGame(), status: 'over' })).toBeNull();
    expect(serializeSnake({ ...playedGame(), status: 'paused' })?.status).toBe('paused');
  });

  it('rejects inconsistent saves', () => {
    const saved = serializeSnake(playedGame())!;
    expect(parseSnakeSave({ ...saved, length: 9 })).toBeNull();
    expect(parseSnakeSave({ ...saved, tickMs: 60 })).toBeNull();
    expect(parseSnakeSave({ ...saved, snake: [{ x: 40, y: 0 }] , length: 1 })).toBeNull();
    expect(parseSnakeSave({ ...saved, snake: [saved.snake[0], saved.snake[0]], length: 2 })).toBeNull();
    expect(parseSnakeSave({ ...saved, apple: saved.snake[1] })).toBeNull();
    expect(parseSnakeSave({ ...saved, direction: 'sideways' })).toBeNull();
    expect(parseSnakeSave({ ...saved, speed: { mode: 'warp', constantSpeed: 'slow' } })).toBeNull();
    expect(parseSnakeSave({ ...saved, status: 'over' })).toBeNull();
    expect(parseSnakeSave('nope')).toBeNull();
  });
});
