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
  /** Apples eaten this game (drives the speeding-up curve). */
  applesEaten: number;
  /** Points awarded for the most recent apple (0 before the first). */
  lastApplePoints: number;
  /** Speed setting for this game; fixed once the game starts. */
  speed: SpeedSetting;
  status: GameStatus;
  /** True when the snake filled the whole board. */
  hasWon: boolean;
}

export const DEFAULT_COLUMNS = 17;
export const DEFAULT_ROWS = 17;
export const INITIAL_LENGTH = 3;
export const MAX_QUEUED_TURNS = 3;
export const STARTING_TICK_MS = 150;
export const FASTEST_TICK_MS = 60;
export const TICK_SPEEDUP_PER_APPLE_MS = 3;

// ---------- Speed modes ----------
export type SpeedMode = 'speeding-up' | 'constant';
export type ConstantSpeed = 'slow' | 'normal' | 'fast' | 'very-fast';
export interface SpeedSetting { mode: SpeedMode; constantSpeed: ConstantSpeed; }

export const CONSTANT_SPEEDS: { id: ConstantSpeed; label: string; tickMs: number }[] = [
  { id: 'slow', label: 'Slow', tickMs: 150 },
  { id: 'normal', label: 'Normal', tickMs: 110 },
  { id: 'fast', label: 'Fast', tickMs: 80 },
  { id: 'very-fast', label: 'Very fast', tickMs: 60 },
];
export const DEFAULT_SPEED_SETTING: SpeedSetting = { mode: 'speeding-up', constantSpeed: 'normal' };

export function constantSpeedTickMs(constantSpeed: ConstantSpeed): number {
  return (CONSTANT_SPEEDS.find(speed => speed.id === constantSpeed) ?? CONSTANT_SPEEDS[1]).tickMs;
}

/** Milliseconds between steps for a speed setting after `applesEaten` apples. */
export function tickIntervalFor(speed: SpeedSetting, applesEaten: number): number {
  return speed.mode === 'constant' ? constantSpeedTickMs(speed.constantSpeed) : tickInterval(applesEaten);
}

/** The step interval in effect for a state right now. */
export const currentTickMs = (state: SnakeState) => tickIntervalFor(state.speed, state.applesEaten);

export function describeSpeedSetting(speed: SpeedSetting): string {
  if (speed.mode === 'speeding-up') return 'Speeding up';
  const constant = CONSTANT_SPEEDS.find(option => option.id === speed.constantSpeed) ?? CONSTANT_SPEEDS[1];
  return `Constant · ${constant.label}`;
}

// ---------- Fair scoring ----------
/**
 * Every apple is worth:
 *   points = round(BASE_APPLE_POINTS × speedMultiplier × lengthMultiplier)
 *   speedMultiplier  = REFERENCE_TICK_MS / tickMs          (150 ms → 1×, 110 ms → 1.36×, 80 ms → 1.88×, 60 ms → 2.5×)
 *   lengthMultiplier = 1 + (length − INITIAL_LENGTH) / 20   (length 3 → 1×, 13 → 1.5×, 23 → 2×)
 * where tickMs is the step interval and length is the snake's length just before it eats.
 * Both speed modes use the same formula, so the same speed and length are always worth the same.
 */
export const BASE_APPLE_POINTS = 10;
export const REFERENCE_TICK_MS = 150;
export const LENGTH_BONUS_DIVISOR = 20;

export const speedMultiplier = (tickMs: number) => REFERENCE_TICK_MS / tickMs;
export const lengthMultiplier = (length: number) => 1 + Math.max(0, length - INITIAL_LENGTH) / LENGTH_BONUS_DIVISOR;

export function applePoints(tickMs: number, length: number): number {
  return Math.round(BASE_APPLE_POINTS * speedMultiplier(tickMs) * lengthMultiplier(length));
}

/** Short label for the header, e.g. "x1.4". */
export const formatMultiplier = (multiplier: number) => `x${multiplier.toFixed(1)}`;

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
export function createInitialState(
  columns = DEFAULT_COLUMNS, rows = DEFAULT_ROWS, random: RandomSource = Math.random, speed: SpeedSetting = DEFAULT_SPEED_SETTING,
): SnakeState {
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
    applesEaten: 0,
    lastApplePoints: 0,
    speed,
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

/** Change the speed setting; only allowed before the game starts or after it ends. */
export function setSpeed(state: SnakeState, speed: SpeedSetting): SnakeState {
  if (state.status === 'running' || state.status === 'paused') return state;
  return { ...state, speed };
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
  // Points use the speed and length at the moment of eating (before growing / speeding up).
  const pointsEarned = eatsApple ? applePoints(currentTickMs(state), state.snake.length) : 0;
  return {
    ...state,
    snake: movedSnake,
    direction: nextDirection,
    directionQueue: remainingQueue,
    apple: nextApple,
    score: state.score + pointsEarned,
    applesEaten: state.applesEaten + (eatsApple ? 1 : 0),
    lastApplePoints: eatsApple ? pointsEarned : state.lastApplePoints,
    status: filledBoard ? 'over' : 'running',
    hasWon: filledBoard,
  };
}

/** 'Speeding up' mode: milliseconds between steps, slowly faster with every apple. */
export function tickInterval(applesEaten: number): number {
  return Math.max(FASTEST_TICK_MS, STARTING_TICK_MS - applesEaten * TICK_SPEEDUP_PER_APPLE_MS);
}
