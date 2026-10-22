/**
 * Arrow Out: a board packed with winding arrows. Each arrow is a snake-like path of cells ending in an arrowhead.
 * Tapping an arrow sends it out of the board: the head goes straight the way it points and the body follows its
 * trail. That only works when every cell between the head and the board edge is empty; tapping a blocked arrow
 * costs a life. Pure logic: levels, legality, lives, undo and hints.
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

export interface Cell { row: number; column: number; }

export interface Arrow {
  id: number;
  /** The path from the tail to the head (the last cell carries the arrowhead). */
  cells: Cell[];
  /** Where the arrowhead points. */
  direction: Direction;
}

export interface Level {
  number: number;
  rows: number;
  columns: number;
  arrows: Arrow[];
}

export const LIVES_PER_LEVEL = 3;
export const MAX_COLUMNS = 12;
export const MAX_ROWS = 16;

export const headOf = (arrow: Arrow) => arrow.cells[arrow.cells.length - 1];
export const arrowCells = (arrow: Arrow) => arrow.cells;

/** The cells from just past the head to the board edge, in the arrow's direction. */
export function exitPath(arrow: Arrow, rows: number, columns: number): Cell[] {
  const { rowStep, columnStep } = DIRECTION_STEPS[arrow.direction];
  const head = headOf(arrow);
  const path: Cell[] = [];
  let row = head.row + rowStep;
  let column = head.column + columnStep;
  while (row >= 0 && row < rows && column >= 0 && column < columns) {
    path.push({ row, column });
    row += rowStep;
    column += columnStep;
  }
  return path;
}

/** Number of 90° turns along an arrow's path (counting the turn into the arrowhead's direction). */
export function countBends(arrow: Arrow): number {
  let bends = 0;
  let previousStep: string | null = null;
  for (let index = 1; index <= arrow.cells.length; index++) {
    const step = index < arrow.cells.length
      ? `${arrow.cells[index].row - arrow.cells[index - 1].row},${arrow.cells[index].column - arrow.cells[index - 1].column}`
      : `${DIRECTION_STEPS[arrow.direction].rowStep},${DIRECTION_STEPS[arrow.direction].columnStep}`;
    if (previousStep !== null && step !== previousStep) bends++;
    previousStep = step;
  }
  return bends;
}

export interface LevelShape { rows: number; columns: number; minLength: number; maxLength: number; turnChance: number; }

/** Boards grow from 5×5 to 12×16; arrows get longer and wind more as levels go up. */
export function levelShape(levelNumber: number): LevelShape {
  const growth = Math.max(0, levelNumber - 1);
  return {
    columns: Math.min(MAX_COLUMNS, 5 + Math.floor(growth / 2)),
    rows: Math.min(MAX_ROWS, 5 + Math.floor(levelNumber / 2) + Math.floor(growth / 4)),
    minLength: 2,
    maxLength: Math.min(16, 4 + Math.floor(levelNumber / 2)),
    turnChance: Math.min(0.65, 0.35 + levelNumber * 0.015),
  };
}

const levelSeed = (levelNumber: number) => Math.imul(levelNumber, 2654435761) ^ 0x5eed;

/**
 * Builds a level that can always be cleared.
 *
 * Arrows are placed one after another, and the board is cleared in the reverse order: the arrow placed last
 * leaves first. So when arrow k leaves, only arrows placed before it are still on the board, which means arrow
 * k's exit ray only has to be clear of arrows placed BEFORE it. Arrows placed later may sit on that ray; they are
 * already gone by then. Each new arrow therefore picks a head whose ray to the edge is empty right now, then
 * grows a winding body backwards from the head (never onto its own ray).
 *
 * To pack the board, a second pass lengthens arrows at the tail into empty neighbouring cells. Arrow k may take
 * a cell only if no arrow placed after k (and not k itself) needs that cell for its ray; the same reasoning keeps
 * the level solvable. The two passes repeat until nothing more fits. The same level number gives the same board.
 */
export function generateLevel(levelNumber: number): Level {
  // Rarely a board leaves an unreachable pocket; then a few other seeds are tried and the fullest board is kept.
  let best: Level | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const level = buildLevel(levelNumber, levelSeed(levelNumber) + attempt * 7919);
    if (!best || fillRatio(level) > fillRatio(best)) best = level;
    if (fillRatio(level) >= TARGET_FILL) break;
  }
  return best!;
}

/** Boards at least this full are accepted straight away. */
export const TARGET_FILL = 0.9;

function buildLevel(levelNumber: number, seed: number): Level {
  const shape = levelShape(levelNumber);
  const { rows, columns } = shape;
  const random = createRandom(seed);
  const cellCount = rows * columns;
  const indexOf = (row: number, column: number) => row * columns + column;
  const inside = (row: number, column: number) => row >= 0 && row < rows && column >= 0 && column < columns;
  /** Which arrow covers each cell (-1 = empty). */
  const owner: number[] = Array(cellCount).fill(-1);
  /** Arrows whose exit ray crosses each cell. */
  const rayOwners: number[][] = Array.from({ length: cellCount }, () => []);
  const placed: { cells: number[]; direction: Direction }[] = [];
  const maxTotalLength = shape.maxLength * 3;

  const rayFrom = (headIndex: number, direction: Direction): number[] | null => {
    const { rowStep, columnStep } = DIRECTION_STEPS[direction];
    const ray: number[] = [];
    let row = Math.floor(headIndex / columns) + rowStep;
    let column = (headIndex % columns) + columnStep;
    while (inside(row, column)) {
      const index = indexOf(row, column);
      if (owner[index] !== -1) return null;
      ray.push(index);
      row += rowStep;
      column += columnStep;
    }
    return ray;
  };
  const emptyNeighbors = (index: number, excluded: Set<number>) => {
    const row = Math.floor(index / columns), column = index % columns;
    const neighbors: number[] = [];
    for (const direction of DIRECTIONS) {
      const { rowStep, columnStep } = DIRECTION_STEPS[direction];
      const neighborRow = row + rowStep, neighborColumn = column + columnStep;
      if (!inside(neighborRow, neighborColumn)) continue;
      const neighbor = indexOf(neighborRow, neighborColumn);
      if (owner[neighbor] === -1 && !excluded.has(neighbor)) neighbors.push(neighbor);
    }
    return neighbors;
  };

  /** Place one new arrow; false when no head has a clear ray any more. */
  const placeArrow = (): boolean => {
    const candidates: { head: number; neck: number; direction: Direction; ray: number[]; weight: number }[] = [];
    let totalWeight = 0;
    for (let head = 0; head < cellCount; head++) {
      if (owner[head] !== -1) continue;
      for (const direction of DIRECTIONS) {
        const { rowStep, columnStep } = DIRECTION_STEPS[direction];
        const neckRow = Math.floor(head / columns) - rowStep, neckColumn = (head % columns) - columnStep;
        if (!inside(neckRow, neckColumn) || owner[indexOf(neckRow, neckColumn)] !== -1) continue;
        const ray = rayFrom(head, direction);
        if (!ray) continue;
        // heads deep inside the board (long rays) are preferred: later arrows will likely block them
        const weight = (1 + ray.length) ** 1.5;
        candidates.push({ head, neck: indexOf(neckRow, neckColumn), direction, ray, weight });
        totalWeight += weight;
      }
    }
    if (!candidates.length) return false;
    let pick = random() * totalWeight;
    let chosen = candidates[candidates.length - 1];
    for (const candidate of candidates) { pick -= candidate.weight; if (pick <= 0) { chosen = candidate; break; } }

    const rayCells = new Set(chosen.ray);
    const path = [chosen.head, chosen.neck];
    const inPath = new Set(path);
    const targetLength = shape.minLength + Math.floor(random() * (shape.maxLength - shape.minLength + 1));
    // the body grows backwards from the neck; going on in the same direction keeps a straight segment
    let lastRowStep = Math.floor(chosen.neck / columns) - Math.floor(chosen.head / columns);
    let lastColumnStep = (chosen.neck % columns) - (chosen.head % columns);
    while (path.length < targetLength) {
      const current = path[path.length - 1];
      const currentRow = Math.floor(current / columns), currentColumn = current % columns;
      const options = emptyNeighbors(current, new Set([...rayCells, ...inPath]));
      if (!options.length) break;
      const straightRow = currentRow + lastRowStep, straightColumn = currentColumn + lastColumnStep;
      const straight = inside(straightRow, straightColumn) ? options.find(option => option === indexOf(straightRow, straightColumn)) : undefined;
      let next: number;
      if (straight !== undefined && random() > shape.turnChance) next = straight;
      else {
        // prefer cells with few free neighbours, so the snake hugs walls and fills pockets
        const scored = options.map(option => ({ option, score: emptyNeighbors(option, inPath).length + random() * 1.5 }));
        scored.sort((first, second) => first.score - second.score);
        next = scored[0].option;
      }
      lastRowStep = Math.floor(next / columns) - currentRow;
      lastColumnStep = (next % columns) - currentColumn;
      path.push(next);
      inPath.add(next);
    }
    const arrowIndex = placed.length;
    const cells = path.reverse(); // tail → head
    for (const cell of cells) owner[cell] = arrowIndex;
    for (const cell of chosen.ray) rayOwners[cell].push(arrowIndex);
    placed.push({ cells, direction: chosen.direction });
    return true;
  };

  /** Lengthen arrows at the tail into empty cells where that stays solvable. */
  const extendTails = (): boolean => {
    let changed = false;
    for (let index = 0; index < cellCount; index++) {
      if (owner[index] !== -1) continue;
      const row = Math.floor(index / columns), column = index % columns;
      const neighborArrows: number[] = [];
      for (const direction of DIRECTIONS) {
        const { rowStep, columnStep } = DIRECTION_STEPS[direction];
        if (!inside(row + rowStep, column + columnStep)) continue;
        const neighborOwner = owner[indexOf(row + rowStep, column + columnStep)];
        if (neighborOwner !== -1 && placed[neighborOwner].cells[0] === indexOf(row + rowStep, column + columnStep)) neighborArrows.push(neighborOwner);
      }
      const usable = neighborArrows.filter(arrowIndex =>
        placed[arrowIndex].cells.length < maxTotalLength && rayOwners[index].every(rayOwner => rayOwner < arrowIndex));
      if (!usable.length) continue;
      const arrowIndex = usable[Math.floor(random() * usable.length)];
      placed[arrowIndex].cells.unshift(index);
      owner[index] = arrowIndex;
      changed = true;
    }
    return changed;
  };

  for (let round = 0; round < 50; round++) {
    let placedAny = false;
    while (placeArrow()) placedAny = true;
    const extended = extendTails();
    if (!placedAny && !extended) break;
  }

  const arrows: Arrow[] = placed.map((arrow, id) => ({
    id, direction: arrow.direction, cells: arrow.cells.map(cell => ({ row: Math.floor(cell / columns), column: cell % columns })),
  }));
  return { number: levelNumber, rows, columns, arrows };
}

export const fillRatio = (level: Level) => level.arrows.reduce((total, arrow) => total + arrow.cells.length, 0) / (level.rows * level.columns);

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

const levelCache = new Map<number, Level>();
/** Generated levels are cached (they never change). */
export function getLevel(levelNumber: number): Level {
  let level = levelCache.get(levelNumber);
  if (!level) {
    level = generateLevel(levelNumber);
    if (levelCache.size > 20) levelCache.clear();
    levelCache.set(levelNumber, level);
  }
  return level;
}

export function startLevel(levelNumber: number): ArrowGameState {
  return { level: getLevel(levelNumber), removedIds: [], livesLeft: LIVES_PER_LEVEL, mistakes: 0, hintsUsed: 0, status: 'playing' };
}

/** Grid of arrow ids for the arrows still on the board. */
export function occupancy(level: Level, removedIds: readonly number[]): (number | null)[][] {
  const removed = new Set(removedIds);
  const grid: (number | null)[][] = Array.from({ length: level.rows }, () => Array(level.columns).fill(null));
  for (const arrow of level.arrows) {
    if (removed.has(arrow.id)) continue;
    for (const { row, column } of arrow.cells) grid[row][column] = arrow.id;
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

/** An arrow that can escape right now (the one whose head is nearest the top-left), or null. */
export function findHint(state: ArrowGameState): number | null {
  if (state.status !== 'playing') return null;
  const free = state.level.arrows.filter(arrow => canEscape(state, arrow.id));
  if (free.length === 0) return null;
  free.sort((first, second) => headOf(first).row - headOf(second).row || headOf(first).column - headOf(second).column);
  return free[0].id;
}

export const arrowsLeft = (state: ArrowGameState) => state.level.arrows.length - state.removedIds.length;
