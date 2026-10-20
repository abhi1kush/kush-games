import { describe, expect, it } from 'vitest';
import {
  changeDirection, createInitialState, FASTEST_TICK_MS, INITIAL_LENGTH, pauseGame, spawnApple, SnakeState,
  startGame, STARTING_TICK_MS, step, tickInterval, togglePause,
} from './game';

const firstCell = () => 0;

function runningState(overrides: Partial<SnakeState> = {}): SnakeState {
  return { ...startGame(createInitialState(10, 10, firstCell)), ...overrides };
}

describe('createInitialState', () => {
  it('starts ready, in the middle, facing right, with an apple off the snake', () => {
    const state = createInitialState(10, 10, firstCell);
    expect(state.status).toBe('ready');
    expect(state.snake).toEqual([{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]);
    expect(state.snake).toHaveLength(INITIAL_LENGTH);
    expect(state.direction).toBe('right');
    expect(state.apple).toEqual({ x: 0, y: 0 });
    expect(state.score).toBe(0);
  });
});

describe('step', () => {
  it('does nothing unless running', () => {
    const ready = createInitialState(10, 10, firstCell);
    expect(step(ready)).toBe(ready);
    const paused = pauseGame(startGame(ready));
    expect(paused.status).toBe('paused');
    expect(step(paused)).toBe(paused);
  });

  it('moves the snake one cell in its direction without growing', () => {
    const next = step(runningState());
    expect(next.snake).toEqual([{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }]);
    expect(next.score).toBe(0);
  });

  it('eats an apple: grows by one, scores, and spawns a new apple off the snake', () => {
    const state = runningState({ apple: { x: 6, y: 5 } });
    const next = step(state, firstCell);
    expect(next.snake).toHaveLength(INITIAL_LENGTH + 1);
    expect(next.snake[0]).toEqual({ x: 6, y: 5 });
    expect(next.score).toBe(1);
    expect(next.apple).not.toBeNull();
    expect(next.snake.some(segment => segment.x === next.apple!.x && segment.y === next.apple!.y)).toBe(false);
  });

  it('dies on walls', () => {
    const state = runningState({ snake: [{ x: 9, y: 2 }, { x: 8, y: 2 }, { x: 7, y: 2 }] });
    const next = step(state);
    expect(next.status).toBe('over');
    expect(next.snake).toEqual(state.snake);
    const topState = runningState({ snake: [{ x: 3, y: 0 }, { x: 3, y: 1 }], direction: 'up' });
    expect(step(topState).status).toBe('over');
  });

  it('dies when running into itself', () => {
    // head at (5,5) moving down into its own body at (5,6)
    const snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
    const state = runningState({ snake, direction: 'left', directionQueue: ['down'] });
    expect(step(state).status).toBe('over');
  });

  it('may move into the cell the tail is leaving', () => {
    const snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
    const state = runningState({ snake, direction: 'left', directionQueue: ['down'], apple: { x: 0, y: 0 } });
    const next = step(state);
    expect(next.status).toBe('running');
    expect(next.snake[0]).toEqual({ x: 5, y: 6 });
  });

  it('wins when the snake fills the board', () => {
    const snake = [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }];
    const state: SnakeState = { ...runningState(), columns: 2, rows: 2, snake, direction: 'left', directionQueue: ['up'], apple: { x: 0, y: 0 } };
    const next = step(state);
    expect(next.status).toBe('over');
    expect(next.hasWon).toBe(true);
    expect(next.score).toBe(1);
  });
});

describe('changeDirection', () => {
  it('ignores an instant reverse', () => {
    const state = runningState();
    expect(changeDirection(state, 'left')).toBe(state);
  });

  it('ignores repeating the current direction', () => {
    const state = runningState();
    expect(changeDirection(state, 'right')).toBe(state);
  });

  it('queues quick turns so none are lost', () => {
    let state = runningState({ apple: { x: 0, y: 0 } });
    state = changeDirection(state, 'up');
    state = changeDirection(state, 'left');
    expect(state.directionQueue).toEqual(['up', 'left']);
    state = step(state);
    expect(state.snake[0]).toEqual({ x: 5, y: 4 });
    state = step(state);
    expect(state.snake[0]).toEqual({ x: 4, y: 4 });
    expect(state.direction).toBe('left');
  });

  it('checks reverses against the last queued turn', () => {
    let state = changeDirection(runningState(), 'up');
    state = changeDirection(state, 'down'); // reverse of queued 'up'
    expect(state.directionQueue).toEqual(['up']);
    state = changeDirection(state, 'left'); // allowed: up then left (not a reverse of right yet)
    expect(state.directionQueue).toEqual(['up', 'left']);
  });

  it('limits the queue length', () => {
    let state = runningState();
    for (const direction of ['up', 'left', 'down', 'right', 'up'] as const) state = changeDirection(state, direction);
    expect(state.directionQueue).toEqual(['up', 'left', 'down']);
  });

  it('can set a direction before starting', () => {
    const state = changeDirection(createInitialState(10, 10, firstCell), 'up');
    expect(state.directionQueue).toEqual(['up']);
  });
});

describe('spawnApple', () => {
  it('never places the apple on the snake', () => {
    // 3x3 board with only (2,2) free
    const snake = [0, 1, 2, 3, 4, 5, 6, 7].map(cellIndex => ({ x: cellIndex % 3, y: Math.floor(cellIndex / 3) }));
    for (const randomValue of [0, 0.3, 0.6, 0.999]) {
      expect(spawnApple(snake, 3, 3, () => randomValue)).toEqual({ x: 2, y: 2 });
    }
  });

  it('returns null when the board is full', () => {
    const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    expect(spawnApple(snake, 2, 1)).toBeNull();
  });

  it('is always off the snake for many random values', () => {
    const state = createInitialState();
    for (let attempt = 0; attempt < 200; attempt++) {
      const apple = spawnApple(state.snake, state.columns, state.rows)!;
      expect(state.snake.some(segment => segment.x === apple.x && segment.y === apple.y)).toBe(false);
    }
  });
});

describe('pause and speed', () => {
  it('toggles pause and resume', () => {
    const running = startGame(createInitialState());
    expect(togglePause(running).status).toBe('paused');
    expect(togglePause(togglePause(running)).status).toBe('running');
  });

  it('speeds up slowly with score, down to a floor', () => {
    expect(tickInterval(0)).toBe(STARTING_TICK_MS);
    expect(tickInterval(5)).toBeLessThan(tickInterval(0));
    expect(tickInterval(1000)).toBe(FASTEST_TICK_MS);
  });
});
