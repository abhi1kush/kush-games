/**
 * Color Trails play rules (like the classic "connect the dots / flow" puzzles):
 * - Drag from a dot to draw a path; steps go up/down/left/right one cell at a time.
 * - Reaching the other dot of the same color connects the pair. You can't draw through another color's dot.
 * - Drawing over another color's path cuts it there (it comes back if you back off in the same drag).
 * - Dragging back over your own path shortens it; starting a drag from the middle of a path continues from there.
 * - The level is solved when every pair is connected and every cell is covered.
 * - A "move" is counted when you start drawing a different color from the one you drew last (as in Flow);
 *   a perfect solve uses one move per color.
 */
import levelData from './levels.json';
import { BUNDLED_LEVELS } from './levelPlan';
import { buildNeighbors, decodePuzzle, Puzzle } from './puzzle';

export interface Level extends Puzzle { number: number; }

export type TrailsStatus = 'playing' | 'won';

export interface TrailsState {
  level: Level;
  /** One path per color: cells in drawing order, starting at one of that color's dots ([] = nothing drawn). */
  paths: number[][];
  moves: number;
  /** Color of the last drawn move (a new move is counted when another color is drawn). */
  lastMovedColor: number | null;
  hintsUsed: number;
  /** Earlier `paths` for undo. */
  history: number[][][];
  status: TrailsStatus;
}

const bundledLevels = levelData as { r: number; c: number; g: string }[];
export const MAX_LEVEL = 999;

/** Levels after the bundled ones replay the hardest bundled boards, mirrored / turned and with colors reshuffled. */
function levelGrid(levelNumber: number): { rows: number; columns: number; grid: string } {
  if (levelNumber <= BUNDLED_LEVELS) {
    const { r, c, g } = bundledLevels[levelNumber - 1];
    return { rows: r, columns: c, grid: g };
  }
  const hardStart = BUNDLED_LEVELS - 49;
  const base = bundledLevels[hardStart - 1 + ((levelNumber - BUNDLED_LEVELS - 1) % 50)];
  const variant = Math.floor((levelNumber - BUNDLED_LEVELS - 1) / 50) % 3; // 0: mirror left-right, 1: upside down, 2: turned 180°
  const cells = [...base.g];
  const transformed = cells.map((_, cell) => {
    const row = Math.floor(cell / base.c), column = cell % base.c;
    const sourceRow = variant === 0 ? row : base.r - 1 - row;
    const sourceColumn = variant === 1 ? column : base.c - 1 - column;
    return cells[sourceRow * base.c + sourceColumn];
  });
  const letters = [...new Set(transformed)].sort();
  const shift = levelNumber % letters.length;
  const grid = transformed.map(letter => letters[(letters.indexOf(letter) + shift) % letters.length]).join('');
  return { rows: base.r, columns: base.c, grid };
}

const levelCache = new Map<number, Level>();
export function getLevel(levelNumber: number): Level {
  let level = levelCache.get(levelNumber);
  if (!level) {
    const { rows, columns, grid } = levelGrid(levelNumber);
    level = { number: levelNumber, ...decodePuzzle(rows, columns, grid) };
    levelCache.set(levelNumber, level);
  }
  return level;
}

export function startLevel(levelNumber: number): TrailsState {
  const level = getLevel(levelNumber);
  return { level, paths: level.endpoints.map(() => []), moves: 0, lastMovedColor: null, hintsUsed: 0, history: [], status: 'playing' };
}

// ---------- Board helpers ----------

/** Which color's dot is on each cell (-1 = none). */
export function dotColors(level: Level): Int16Array {
  const colors = new Int16Array(level.rows * level.columns).fill(-1);
  level.endpoints.forEach(([first, second], color) => { colors[first] = color; colors[second] = color; });
  return colors;
}

export const isAdjacent = (level: Level, first: number, second: number) => buildNeighbors(level.rows, level.columns)[first].includes(second);

/** A path connects its pair when it runs from one dot to the other. */
export function isConnected(level: Level, color: number, path: number[]): boolean {
  if (path.length < 2) return false;
  const [first, second] = level.endpoints[color];
  return (path[0] === first && path[path.length - 1] === second) || (path[0] === second && path[path.length - 1] === first);
}

export const connectedCount = (state: TrailsState) => state.paths.filter((path, color) => isConnected(state.level, color, path)).length;

export function coveredCells(level: Level, paths: number[][]): number {
  const covered = new Set<number>();
  paths.forEach(path => path.forEach(cell => covered.add(cell)));
  level.endpoints.forEach(([first, second]) => { covered.add(first); covered.add(second); });
  return covered.size;
}

export const fillPercent = (state: TrailsState) => Math.floor((coveredCells(state.level, state.paths) / (state.level.rows * state.level.columns)) * 100);

export function isSolved(level: Level, paths: number[][]): boolean {
  return paths.every((path, color) => isConnected(level, color, path)) && coveredCells(level, paths) === level.rows * level.columns;
}

// ---------- Drawing ----------

export interface Stroke {
  color: number;
  /** Paths as they were when the drag started (cut paths are worked out from these, so they grow back). */
  startPaths: number[][];
  /** The path being drawn. */
  path: number[];
}

/** Start a drag on a cell: a dot starts its color afresh; a path cell continues that path from there. */
export function beginStroke(state: TrailsState, cell: number): Stroke | null {
  if (state.status !== 'playing') return null;
  const dots = dotColors(state.level);
  if (dots[cell] !== -1) return { color: dots[cell], startPaths: state.paths, path: [cell] };
  for (let color = 0; color < state.paths.length; color++) {
    const index = state.paths[color].indexOf(cell);
    if (index !== -1) return { color, startPaths: state.paths, path: state.paths[color].slice(0, index + 1) };
  }
  return null;
}

/** Move the drag into a neighbouring cell. Returns the same stroke when the step isn't allowed. */
export function extendStroke(state: TrailsState, stroke: Stroke, cell: number): Stroke {
  const { level } = state;
  const { path, color } = stroke;
  const head = path[path.length - 1];
  if (cell === head) return stroke;
  const ownIndex = path.indexOf(cell);
  if (ownIndex !== -1) return { ...stroke, path: path.slice(0, ownIndex + 1) }; // back over your own path
  if (!isAdjacent(level, head, cell)) return stroke;
  if (isConnected(level, color, path)) return stroke; // already joined: only backing off is allowed
  const dots = dotColors(level);
  if (dots[cell] !== -1 && dots[cell] !== color) return stroke; // another color's dot
  return { ...stroke, path: [...path, cell] };
}

/** All paths while (or after) drawing: the drawn color replaced, other colors cut where the new path crosses them. */
export function pathsWithStroke(stroke: Stroke): number[][] {
  const drawn = new Set(stroke.path);
  return stroke.startPaths.map((path, color) => {
    if (color === stroke.color) return stroke.path.length > 1 ? stroke.path : [];
    const cutAt = path.findIndex(cell => drawn.has(cell));
    if (cutAt === -1) return path;
    return cutAt <= 1 ? [] : path.slice(0, cutAt);
  });
}

const samePaths = (first: number[][], second: number[][]) =>
  first.length === second.length && first.every((path, color) => path.length === second[color].length && path.every((cell, index) => cell === second[color][index]));

/** Finish a drag: record it for undo, count the move, check for a win. */
export function endStroke(state: TrailsState, stroke: Stroke): TrailsState {
  const paths = pathsWithStroke(stroke);
  if (samePaths(paths, state.paths)) return state;
  const isNewMove = state.lastMovedColor !== stroke.color;
  return {
    ...state,
    paths,
    history: [...state.history, state.paths],
    moves: state.moves + (isNewMove ? 1 : 0),
    lastMovedColor: stroke.color,
    status: isSolved(state.level, paths) ? 'won' : 'playing',
  };
}

export function undoLast(state: TrailsState): TrailsState {
  if (!state.history.length || state.status !== 'playing') return state;
  return { ...state, paths: state.history[state.history.length - 1], history: state.history.slice(0, -1), lastMovedColor: null };
}

/** Lay one correct path from the solution (the longest pair that isn't right yet); other paths in the way are cut. */
export function applyHint(state: TrailsState): { state: TrailsState; color: number | null } {
  if (state.status !== 'playing') return { state, color: null };
  const { level } = state;
  const wrongColors = level.solution
    .map((solutionPath, color) => ({ color, solutionPath }))
    .filter(({ color, solutionPath }) => {
      const current = state.paths[color];
      if (current.length !== solutionPath.length) return true;
      const forward = current.every((cell, index) => cell === solutionPath[index]);
      const backward = current.every((cell, index) => cell === solutionPath[solutionPath.length - 1 - index]);
      return !forward && !backward;
    })
    .sort((first, second) => second.solutionPath.length - first.solutionPath.length);
  if (!wrongColors.length) return { state, color: null };
  const { color, solutionPath } = wrongColors[0];
  const paths = pathsWithStroke({ color, startPaths: state.paths, path: solutionPath });
  return {
    color,
    state: {
      ...state, paths, history: [...state.history, state.paths], hintsUsed: state.hintsUsed + 1, lastMovedColor: null,
      status: isSolved(level, paths) ? 'won' : 'playing',
    },
  };
}

/** 3 stars: perfect (one move per color, no hints). 2 stars: a few extra moves, or hints used. 1 star otherwise. */
export function starsFor(state: TrailsState): number {
  const colorCount = state.level.endpoints.length;
  if (state.moves <= colorCount && state.hintsUsed === 0) return 3;
  if (state.moves <= colorCount + Math.ceil(colorCount / 2)) return 2;
  return 1;
}

export const isPerfect = (state: TrailsState) => state.moves <= state.level.endpoints.length && state.hintsUsed === 0;

/** Check saved paths: each starts at its own dot, steps to neighbours, doesn't repeat, overlap or pass another dot. */
export function pathsAreValid(level: Level, paths: unknown): paths is number[][] {
  if (!Array.isArray(paths) || paths.length !== level.endpoints.length) return false;
  const dots = dotColors(level);
  const used = new Set<number>();
  return paths.every((path, color) => {
    if (!Array.isArray(path)) return false;
    if (path.length === 0) return true;
    if (path.length === 1) return false;
    if (!level.endpoints[color].includes(path[0])) return false;
    return path.every((cell, index) => {
      if (!Number.isInteger(cell) || cell < 0 || cell >= level.rows * level.columns || used.has(cell)) return false;
      if (dots[cell] !== -1 && dots[cell] !== color) return false;
      if (index > 0 && !isAdjacent(level, path[index - 1], cell)) return false;
      if (index > 0 && index < path.length - 1 && dots[cell] === color) return false; // a dot can only be at an end
      used.add(cell);
      return true;
    });
  });
}
