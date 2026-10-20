/** Pure helpers that work out which board cells changed between two game states. */
import { Point, SnakeState, isSamePoint } from './game';

export type BoardChange =
  | { kind: 'none' }
  | { kind: 'full' }
  | {
      kind: 'incremental';
      /** Previous head cell, repainted as a body cell (null when the snake has a single segment). */
      previousHeadAsBody: Point | null;
      newHead: Point;
      /** Previous tail cell to clear back to the background (null when the snake grew). */
      erasedTail: Point | null;
      /** Apple to draw (null when the apple did not move). */
      appleToDraw: Point | null;
    };

/**
 * Compare two states. Returns 'incremental' for a normal one-cell move (including across a wrapped edge),
 * 'none' when nothing on the board changed, and 'full' for anything else (new game, resize, odd jumps).
 * Draw order for an incremental change: erase tail, previous head as body, new head, apple.
 */
export function diffBoard(previous: SnakeState | null, next: SnakeState): BoardChange {
  if (!previous || previous.columns !== next.columns || previous.rows !== next.rows) return { kind: 'full' };
  const appleChanged = !sameOptionalPoint(previous.apple, next.apple);
  if (previous.snake === next.snake || sameSnake(previous.snake, next.snake)) {
    if (!appleChanged) return { kind: 'none' };
    return { kind: 'full' };
  }
  const grew = next.snake.length === previous.snake.length + 1;
  const keptLength = next.snake.length === previous.snake.length;
  if (!grew && !keptLength) return { kind: 'full' };
  // A normal move: everything behind the new head is the old snake shifted by one.
  const expectedBody = grew ? previous.snake : previous.snake.slice(0, -1);
  const bodyMatches = expectedBody.every((segment, index) => isSamePoint(segment, next.snake[index + 1]));
  if (!bodyMatches) return { kind: 'full' };
  return {
    kind: 'incremental',
    previousHeadAsBody: next.snake.length > 1 ? previous.snake[0] : null,
    newHead: next.snake[0],
    erasedTail: grew ? null : previous.snake[previous.snake.length - 1],
    appleToDraw: appleChanged ? next.apple : null,
  };
}

function sameOptionalPoint(first: Point | null, second: Point | null): boolean {
  if (first === null || second === null) return first === second;
  return isSamePoint(first, second);
}

function sameSnake(first: Point[], second: Point[]): boolean {
  return first.length === second.length && first.every((segment, index) => isSamePoint(segment, second[index]));
}

/**
 * Integer pixel bounds of a cell, so neighbouring cells share edges exactly and
 * repainting one cell never leaves seams or touches its neighbours.
 */
export function cellBounds(column: number, row: number, boardPixels: number, cellsAcross: number) {
  const left = Math.round((column * boardPixels) / cellsAcross);
  const top = Math.round((row * boardPixels) / cellsAcross);
  const right = Math.round(((column + 1) * boardPixels) / cellsAcross);
  const bottom = Math.round(((row + 1) * boardPixels) / cellsAcross);
  return { left, top, width: right - left, height: bottom - top };
}

/** Canvas backing-store size for a CSS size, with devicePixelRatio capped at 2. */
export function canvasPixelSize(cssPixels: number, devicePixelRatio: number): number {
  const ratio = Math.min(2, Math.max(1, devicePixelRatio || 1));
  return Math.max(1, Math.round(cssPixels * ratio));
}
