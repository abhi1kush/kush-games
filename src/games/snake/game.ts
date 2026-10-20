/** Pure Snake game logic: no React, no timers, no DOM. */

export type Direction = 'up' | 'down' | 'left' | 'right';
export type GameStatus = 'ready' | 'running' | 'paused' | 'over';
export type RandomSource = () => number;

export interface Point { x: number; y: number; }

export interface SnakeState {
  columns: number;
  rows: number;
  /** Head first, tail last. */
  snake: Point[];
  /** Direction the snake moved on the last step. */
  direction: Direction;
  /** Turns waiting to be applied, one per step, so quick turns aren't lost. */
  directionQueue: Direction[];
  apple: Point | null;
  score: number;
  status: GameStatus;
  /** True when the snake filled the whole board. */
  hasWon: boolean;
}

export const DEFAULT_COLUMNS = 17;
export const DEFAULT_ROWS = 17;
export const INITIAL_LENGTH = 3;
export const MAX_QUEUED_TURNS = 3;
export const POINTS_PER_APPLE = 1;
export const STARTING_TICK_MS = 150;
export const FASTEST_TICK_MS = 60;
export const TICK_SPEEDUP_PER_APPLE_MS = 3;

const DIRECTION_OFFSETS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE_DIRECTION: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const isSamePoint = (first: Point, second: Point) => first.x === second.x && first.y === second.y;

export function isOpposite(first: Direction, second: Direction): boolean {
  return OPPOSITE_DIRECTION[first] === second;
}

/** Pick a random empty cell for the apple; never on the snake. Returns null if the board is full. */
export function spawnApple(snake: Point[], columns: number, rows: number, random: RandomSource = Math.random): Point | null {
  const occupiedCells = new Set(snake.map(segment => segment.y * columns + segment.x));
  const freeCells: Point[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      if (!occupiedCells.has(y * columns + x)) freeCells.push({ x, y });
    }
  }
  if (freeCells.length === 0) return null;
  const chosenIndex = Math.min(freeCells.length - 1, Math.floor(random() * freeCells.length));
  return freeCells[chosenIndex];
}

/** Keep a coordinate on the board by wrapping it around (works for -1 too). */
export function wrapCoordinate(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/** A fresh game in the 'ready' state: snake in the middle facing right. */
export function createInitialState(columns = DEFAULT_COLUMNS, rows = DEFAULT_ROWS, random: RandomSource = Math.random): SnakeState {
  const headX = Math.floor(columns / 2);
  const headY = Math.floor(rows / 2);
  const snake = Array.from({ length: INITIAL_LENGTH }, (_, segmentIndex) => ({ x: headX - segmentIndex, y: headY }));
  return {
    columns,
    rows,
    snake,
    direction: 'right',
    directionQueue: [],
    apple: spawnApple(snake, columns, rows, random),
    score: 0,
    status: 'ready',
    hasWon: false,
  };
}

/**
 * Queue a turn. A turn is compared with the last queued turn (or the current direction),
 * so an instant reverse is ignored and repeated presses don't fill the queue.
 */
export function changeDirection(state: SnakeState, requestedDirection: Direction): SnakeState {
  if (state.status === 'over') return state;
  const latestDirection = state.directionQueue[state.directionQueue.length - 1] ?? state.direction;
  if (requestedDirection === latestDirection || isOpposite(requestedDirection, latestDirection)) return state;
  if (state.directionQueue.length >= MAX_QUEUED_TURNS) return state;
  return { ...state, directionQueue: [...state.directionQueue, requestedDirection] };
}

export function startGame(state: SnakeState): SnakeState {
  return state.status === 'ready' || state.status === 'paused' ? { ...state, status: 'running' } : state;
}

export function pauseGame(state: SnakeState): SnakeState {
  return state.status === 'running' ? { ...state, status: 'paused' } : state;
}

export function togglePause(state: SnakeState): SnakeState {
  if (state.status === 'running') return pauseGame(state);
  return startGame(state);
}

/** Advance the game by one tick. Only moves while running. Only running into itself ends the game. */
export function step(state: SnakeState, random: RandomSource = Math.random): SnakeState {
  if (state.status !== 'running') return state;
  const [nextDirection = state.direction, ...remainingQueue] = state.directionQueue;
  const offset = DIRECTION_OFFSETS[nextDirection];
  const currentHead = state.snake[0];
  // The edges are pass-through: leaving one side brings the head back on the opposite side.
  const newHead = {
    x: wrapCoordinate(currentHead.x + offset.x, state.columns),
    y: wrapCoordinate(currentHead.y + offset.y, state.rows),
  };

  const eatsApple = state.apple !== null && isSamePoint(newHead, state.apple);
  // When not eating, the tail moves away this tick, so moving into it is allowed.
  const bodyThatCanBeHit = eatsApple ? state.snake : state.snake.slice(0, -1);
  if (bodyThatCanBeHit.some(segment => isSamePoint(segment, newHead))) {
    return { ...state, direction: nextDirection, directionQueue: [], status: 'over' };
  }

  const movedSnake = eatsApple ? [newHead, ...state.snake] : [newHead, ...state.snake.slice(0, -1)];
  const nextApple = eatsApple ? spawnApple(movedSnake, state.columns, state.rows, random) : state.apple;
  const filledBoard = eatsApple && nextApple === null;
  return {
    ...state,
    snake: movedSnake,
    direction: nextDirection,
    directionQueue: remainingQueue,
    apple: nextApple,
    score: state.score + (eatsApple ? POINTS_PER_APPLE : 0),
    status: filledBoard ? 'over' : 'running',
    hasWon: filledBoard,
  };
}

/** Milliseconds between steps; gets slowly faster with every apple. */
export function tickInterval(score: number): number {
  const applesEaten = Math.floor(score / POINTS_PER_APPLE);
  return Math.max(FASTEST_TICK_MS, STARTING_TICK_MS - applesEaten * TICK_SPEEDUP_PER_APPLE_MS);
}
