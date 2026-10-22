/**
 * Arrow Out: a grid packed with straight arrows. Tapping an arrow sends it sliding off the board in the
 * direction it points, but only when nothing is in its way. Tapping a blocked arrow costs a life.
 * Pure logic: levels, legality, lives, undo and hints.
 */
import { createRandom } from '../random';

export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
export const DIRECTION_STEPS: Record<Direction, { rowStep: number; columnStep: number }> = {
  up: { rowStep: -1, columnStep: 0 },
  down: { rowStep: 1, columnStep: 0 },
  left: { rowStep: 0, columnStep: -1 },
  right: { rowStep: 0, columnStep: 1 },
};

export interface Arrow {
  id: number;
  /** The cell with the arrowhead. */
  headRow: number;
  headColumn: number;
  direction: Direction;
  /** Cells long, including the head (the body trails behind it). */
  length: number;
}

export interface Level {
  number: number;
  rows: number;
  columns: number;
  arrows: Arrow[];
}

export const LIVES_PER_LEVEL = 3;
export const MAX_COLUMNS = 9;
export const MAX_ROWS = 12;

/** Every cell an arrow covers, head first. */
export function arrowCells(arrow: Arrow): { row: number; column: number }[] {
  const { rowStep, columnStep } = DIRECTION_STEPS[arrow.direction];
  return Array.from({ length: arrow.length }, (_, offset) => ({ row: arrow.headRow - rowStep * offset, column: arrow.headColumn - columnStep * offset }));
}

/** The cells between the head and the edge of the board that the arrow must pass through. */
export function exitPath(arrow: Arrow, rows: number, columns: number): { row: number; column: number }[] {
  const { rowStep, columnStep } = DIRECTION_STEPS[arrow.direction];
  const path = [];
  let row = arrow.headRow + rowStep;
  let column = arrow.headColumn + columnStep;
  while (row >= 0 && row < rows && column >= 0 && column < columns) {
    path.push({ row, column });
    row += rowStep;
    column += columnStep;
  }
  return path;
}

/** Board size and longest arrow for a level: boards grow every couple of levels up to 9×12. */
export function levelShape(levelNumber: number): { rows: number; columns: number; maxLength: number } {
  const growth = Math.max(0, levelNumber - 1);
  const columns = Math.min(MAX_COLUMNS, 4 + Math.floor(growth / 2));
  const rows = Math.min(MAX_ROWS, 4 + Math.floor((growth + 1) / 2) + Math.floor(growth / 6));
  const maxLength = levelNumber <= 2 ? 2 : levelNumber <= 6 ? 3 : 4;
  return { rows, columns, maxLength };
}

const levelSeed = (levelNumber: number) => Math.imul(levelNumber, 2654435761) ^ 0x5eed;

/**
 * Builds a level that can always be cleared. Arrows are placed one at a time, and each new arrow must have a
 * clear path to the edge past the arrows already placed. Removing them in reverse order therefore always works:
 * the newest arrow's path only crosses arrows placed after it, which are already gone.
 * The same level number always gives the same board.
 */
export function generateLevel(levelNumber: number): Level {
  const { rows, columns, maxLength } = levelShape(levelNumber);
  const random = createRandom(levelSeed(levelNumber));
  const occupied: (number | null)[][] = Array.from({ length: rows }, () => Array(columns).fill(null));
  const arrows: Arrow[] = [];
  const attempts = rows * columns * 40;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // favour long arrows; fall back to shorter ones as the board fills up
    const lengthLimit = attempt < attempts * 0.6 ? maxLength : attempt < attempts * 0.85 ? Math.min(2, maxLength) : 1;
    const length = 1 + Math.floor(random() * lengthLimit);
    const candidate: Arrow = {
      id: arrows.length,
      headRow: Math.floor(random() * rows),
      headColumn: Math.floor(random() * columns),
      direction: DIRECTIONS[Math.floor(random() * 4)],
      length,
    };
    const cells = arrowCells(candidate);
    if (cells.some(({ row, column }) => row < 0 || row >= rows || column < 0 || column >= columns || occupied[row][column] !== null)) continue;
    if (exitPath(candidate, rows, columns).some(({ row, column }) => occupied[row][column] !== null)) continue;
    for (const { row, column } of cells) occupied[row][column] = candidate.id;
    arrows.push(candidate);
  }
  return { number: levelNumber, rows, columns, arrows };
}

export type PlayStatus = 'playing' | 'won' | 'failed';

export interface ArrowGameState {
  level: Level;
  /** Ids of arrows that have left the board, in order. */
  removedIds: number[];
  livesLeft: number;
  mistakes: number;
  hintsUsed: number;
  status: PlayStatus;
}

export function startLevel(levelNumber: number): ArrowGameState {
  return { level: generateLevel(levelNumber), removedIds: [], livesLeft: LIVES_PER_LEVEL, mistakes: 0, hintsUsed: 0, status: 'playing' };
}

/** Grid of arrow ids for the arrows still on the board. */
export function occupancy(level: Level, removedIds: readonly number[]): (number | null)[][] {
  const removed = new Set(removedIds);
  const grid: (number | null)[][] = Array.from({ length: level.rows }, () => Array(level.columns).fill(null));
  for (const arrow of level.arrows) {
    if (removed.has(arrow.id)) continue;
    for (const { row, column } of arrowCells(arrow)) grid[row][column] = arrow.id;
  }
  return grid;
}

/** The first arrow in the way, and how many free cells there are before it (null when the path is clear). */
export function findBlocker(level: Level, removedIds: readonly number[], arrowId: number): { blockerId: number; freeCells: number } | null {
  const grid = occupancy(level, removedIds);
  const path = exitPath(level.arrows[arrowId], level.rows, level.columns);
  for (let index = 0; index < path.length; index++) {
    const blockerId = grid[path[index].row][path[index].column];
    if (blockerId !== null) return { blockerId, freeCells: index };
  }
  return null;
}

export const isOnBoard = (state: ArrowGameState, arrowId: number) => arrowId >= 0 && arrowId < state.level.arrows.length && !state.removedIds.includes(arrowId);
export const canEscape = (state: ArrowGameState, arrowId: number) => isOnBoard(state, arrowId) && findBlocker(state.level, state.removedIds, arrowId) === null;

export type TapResult =
  | { kind: 'ignored' }
  | { kind: 'escaped' }
  | { kind: 'blocked'; blockerId: number; freeCells: number };

/** Tap an arrow: it escapes if its path is clear, otherwise it bumps into the first arrow in the way and a life is lost. */
export function tapArrow(state: ArrowGameState, arrowId: number): { state: ArrowGameState; result: TapResult } {
  if (state.status !== 'playing' || !isOnBoard(state, arrowId)) return { state, result: { kind: 'ignored' } };
  const blocker = findBlocker(state.level, state.removedIds, arrowId);
  if (blocker) {
    const livesLeft = state.livesLeft - 1;
    return {
      state: { ...state, livesLeft, mistakes: state.mistakes + 1, status: livesLeft <= 0 ? 'failed' : 'playing' },
      result: { kind: 'blocked', ...blocker },
    };
  }
  const removedIds = [...state.removedIds, arrowId];
  const status: PlayStatus = removedIds.length === state.level.arrows.length ? 'won' : 'playing';
  return { state: { ...state, removedIds, status }, result: { kind: 'escaped' } };
}

/** Put the last escaped arrow back. Lives lost stay lost. */
export function undoLast(state: ArrowGameState): ArrowGameState {
  if (state.status !== 'playing' || state.removedIds.length === 0) return state;
  return { ...state, removedIds: state.removedIds.slice(0, -1) };
}

/** An arrow that can escape right now (the one nearest the top-left), or null. */
export function findHint(state: ArrowGameState): number | null {
  if (state.status !== 'playing') return null;
  const free = state.level.arrows.filter(arrow => canEscape(state, arrow.id));
  if (free.length === 0) return null;
  free.sort((first, second) => first.headRow - second.headRow || first.headColumn - second.headColumn);
  return free[0].id;
}

export const arrowsLeft = (state: ArrowGameState) => state.level.arrows.length - state.removedIds.length;
