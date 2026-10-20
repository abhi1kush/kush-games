/** Saving and restoring an in-progress Snake game (see ../persistence.ts). */
import { createSaveSlot, isInteger, isOneOf, isRecord } from '../persistence';
import { CONSTANT_SPEEDS, Direction, Point, SnakeState, SpeedSetting, tickIntervalFor } from './game';

export const SNAKE_SAVE_VERSION = 1;
const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];
const SPEED_MODES = ['speeding-up', 'constant'] as const;
const CONSTANT_SPEED_IDS = CONSTANT_SPEEDS.map(speed => speed.id);

export interface SavedSnake {
  columns: number;
  rows: number;
  /** Head first. */
  snake: Point[];
  direction: Direction;
  apple: Point | null;
  score: number;
  length: number;
  applesEaten: number;
  lastApplePoints: number;
  speed: SpeedSetting;
  /** Step interval when saved (checked against speed + applesEaten on load). */
  tickMs: number;
  status: 'running' | 'paused';
}

/** Only games in progress are saved; null means "nothing to save" (clear the slot). */
export function serializeSnake(state: SnakeState): SavedSnake | null {
  if (state.status !== 'running' && state.status !== 'paused') return null;
  // A queued turn hasn't happened yet; the saved direction is the one the snake is moving in.
  return {
    columns: state.columns,
    rows: state.rows,
    snake: state.snake.map(segment => ({ x: segment.x, y: segment.y })),
    direction: state.direction,
    apple: state.apple ? { ...state.apple } : null,
    score: state.score,
    length: state.snake.length,
    applesEaten: state.applesEaten,
    lastApplePoints: state.lastApplePoints,
    speed: { ...state.speed },
    tickMs: tickIntervalFor(state.speed, state.applesEaten),
    status: state.status,
  };
}

export function parseSnakeSave(data: unknown): SavedSnake | null {
  if (!isRecord(data)) return null;
  const { columns, rows, snake, apple, speed } = data;
  if (!isInteger(columns, 3, 200) || !isInteger(rows, 3, 200)) return null;
  const isPointOnBoard = (point: unknown): point is Point =>
    isRecord(point) && isInteger(point.x, 0, columns - 1) && isInteger(point.y, 0, rows - 1);
  if (!Array.isArray(snake) || snake.length < 1 || snake.length >= columns * rows || !snake.every(isPointOnBoard)) return null;
  const occupied = new Set(snake.map(segment => segment.y * columns + segment.x));
  if (occupied.size !== snake.length) return null;
  if (apple !== null && (!isPointOnBoard(apple) || occupied.has(apple.y * columns + apple.x))) return null;
  if (!isOneOf(data.direction, DIRECTIONS) || !isOneOf(data.status, ['running', 'paused'] as const)) return null;
  if (!isInteger(data.score, 0) || !isInteger(data.applesEaten, 0) || !isInteger(data.lastApplePoints, 0)) return null;
  if (data.length !== snake.length) return null;
  if (!isRecord(speed) || !isOneOf(speed.mode, SPEED_MODES) || !isOneOf(speed.constantSpeed, CONSTANT_SPEED_IDS)) return null;
  if (data.tickMs !== tickIntervalFor(speed as unknown as SpeedSetting, data.applesEaten)) return null;
  return data as unknown as SavedSnake;
}

/** A restored game always comes back paused. */
export function restoreSnake(saved: SavedSnake): SnakeState {
  return {
    columns: saved.columns,
    rows: saved.rows,
    snake: saved.snake.map(segment => ({ x: segment.x, y: segment.y })),
    direction: saved.direction,
    directionQueue: [],
    apple: saved.apple ? { ...saved.apple } : null,
    score: saved.score,
    applesEaten: saved.applesEaten,
    lastApplePoints: saved.lastApplePoints,
    speed: { mode: saved.speed.mode, constantSpeed: saved.speed.constantSpeed },
    status: 'paused',
    hasWon: false,
  };
}

export const createSnakeSaveSlot = () => createSaveSlot({ gameId: 'snake', version: SNAKE_SAVE_VERSION, parse: parseSnakeSave });
