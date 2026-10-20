/**
 * Pure falling-blocks logic: board, pieces, rotation with wall kicks, collision, gravity,
 * lock delay, line clears, scoring and the 7-bag randomiser. No React, no timers, no DOM.
 */

export const BOARD_COLUMNS = 10;
export const BOARD_ROWS = 20;
export const QUEUE_LENGTH = 5;
export const LOCK_DELAY_MS = 500;
/** Moving or rotating a grounded piece restarts the lock delay, at most this many times. */
export const MAX_LOCK_RESETS = 15;
export const LINES_PER_LEVEL = 10;
/** Points for clearing 1, 2, 3 or 4 lines at once, multiplied by the level. */
export const LINE_CLEAR_POINTS = [0, 100, 300, 500, 800];
export const SOFT_DROP_POINTS_PER_CELL = 1;
export const HARD_DROP_POINTS_PER_CELL = 2;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type CellType = PieceType | 'garbage';
export type Board = (CellType | null)[][];
export type GameStatus = 'ready' | 'running' | 'paused' | 'over';
export type Rotation = 0 | 1 | 2 | 3;

export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export interface Point { x: number; y: number; }

export interface ActivePiece {
  type: PieceType;
  rotation: Rotation;
  /** Board column of the shape matrix's left edge. */
  x: number;
  /** Board row of the shape matrix's top edge (may be negative while spawning). */
  y: number;
}

export interface BlocksState {
  board: Board;
  active: ActivePiece | null;
  /** Upcoming pieces, next first. */
  queue: PieceType[];
  /** Pieces left in the current 7-bag. */
  bag: PieceType[];
  /** Seed of the deterministic random generator. */
  randomSeed: number;
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  status: GameStatus;
  /** Time accumulated towards the next gravity step. */
  gravityElapsedMs: number;
  /** Time the piece has been resting on something. */
  lockElapsedMs: number;
  lockResets: number;
  /** Full rows waiting for the clear animation to finish (see finishLineClear). */
  clearingRows: number[];
  /** Number of lines in the most recent clear, and how many clears happened so far. */
  lastClearLines: number;
  clearCount: number;
  lockCount: number;
}

// ---------- Shapes ----------
const SPAWN_SHAPES: Record<PieceType, number[][]> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};

export function rotateMatrixClockwise(matrix: number[][]): number[][] {
  const size = matrix.length;
  return matrix.map((_, row) => matrix.map((__, column) => matrix[size - 1 - column][row]));
}

function cellsOfMatrix(matrix: number[][]): Point[] {
  const cells: Point[] = [];
  matrix.forEach((rowValues, row) => rowValues.forEach((value, column) => { if (value) cells.push({ x: column, y: row }); }));
  return cells;
}

/** For each piece, the cell offsets of its 4 rotations. */
export const PIECE_ROTATIONS: Record<PieceType, Point[][]> = Object.fromEntries(PIECE_TYPES.map(type => {
  const rotations: Point[][] = [];
  let matrix = SPAWN_SHAPES[type];
  for (let rotation = 0; rotation < 4; rotation++) {
    rotations.push(cellsOfMatrix(matrix));
    matrix = rotateMatrixClockwise(matrix);
  }
  return [type, rotations];
})) as Record<PieceType, Point[][]>;

export const shapeSize = (type: PieceType) => SPAWN_SHAPES[type].length;

/** Simple wall kicks tried in order when a rotation collides. */
export const WALL_KICKS: Point[] = [
  { x: 0, y: 0 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -2, y: 0 }, { x: 2, y: 0 },
];

export function pieceCells(piece: ActivePiece): Point[] {
  return PIECE_ROTATIONS[piece.type][piece.rotation].map(cell => ({ x: piece.x + cell.x, y: piece.y + cell.y }));
}

// ---------- Board ----------
export function createEmptyBoard(columns = BOARD_COLUMNS, rows = BOARD_ROWS): Board {
  return Array.from({ length: rows }, () => Array<CellType | null>(columns).fill(null));
}

/** True when the piece is outside the walls/floor or overlaps a filled cell. Cells above the top are allowed. */
export function collides(board: Board, piece: ActivePiece): boolean {
  const columns = board[0].length;
  return pieceCells(piece).some(cell => {
    if (cell.x < 0 || cell.x >= columns || cell.y >= board.length) return true;
    return cell.y >= 0 && board[cell.y][cell.x] !== null;
  });
}

export function spawnPiece(type: PieceType, columns = BOARD_COLUMNS): ActivePiece {
  const firstFilledRow = Math.min(...PIECE_ROTATIONS[type][0].map(cell => cell.y));
  return { type, rotation: 0, x: Math.floor((columns - shapeSize(type)) / 2), y: firstFilledRow === 0 ? 0 : -firstFilledRow };
}

export function findFullRows(board: Board): number[] {
  return board.flatMap((row, rowIndex) => (row.every(cell => cell !== null) ? [rowIndex] : []));
}

export function removeRows(board: Board, rowsToRemove: number[]): Board {
  const remaining = board.filter((_, rowIndex) => !rowsToRemove.includes(rowIndex));
  const emptyRows = Array.from({ length: board.length - remaining.length }, () => Array<CellType | null>(board[0].length).fill(null));
  return [...emptyRows, ...remaining.map(row => [...row])];
}

// ---------- Random 7-bag ----------
/** mulberry32: a tiny deterministic generator, so games can be replayed in tests. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const nextSeed = (seed + 0x6d2b79f5) | 0;
  let mixed = nextSeed;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296, seed: nextSeed };
}

/** A shuffled bag containing each of the 7 pieces exactly once. */
export function shuffledBag(seed: number): { bag: PieceType[]; seed: number } {
  const bag = [...PIECE_TYPES];
  let currentSeed = seed;
  for (let index = bag.length - 1; index > 0; index--) {
    const random = nextRandom(currentSeed);
    currentSeed = random.seed;
    const swapIndex = Math.floor(random.value * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
  }
  return { bag, seed: currentSeed };
}

/** Top the queue up to QUEUE_LENGTH pieces, drawing from the bag and refilling it when empty. */
function fillQueue(queue: PieceType[], bag: PieceType[], seed: number) {
  const nextQueue = [...queue];
  let nextBag = [...bag];
  let nextSeed = seed;
  while (nextQueue.length < QUEUE_LENGTH) {
    if (nextBag.length === 0) {
      const refill = shuffledBag(nextSeed);
      nextBag = refill.bag;
      nextSeed = refill.seed;
    }
    nextQueue.push(nextBag.shift()!);
  }
  return { queue: nextQueue, bag: nextBag, randomSeed: nextSeed };
}

// ---------- Speed and scoring ----------
export const levelForLines = (lines: number) => Math.floor(lines / LINES_PER_LEVEL) + 1;

/** Milliseconds per gravity step: 800 ms at level 1, 15% faster per level, never below 80 ms. */
export function gravityIntervalMs(level: number): number {
  return Math.max(80, Math.round(800 * Math.pow(0.85, level - 1)));
}

export function lineClearPoints(linesCleared: number, level: number): number {
  return (LINE_CLEAR_POINTS[linesCleared] ?? 0) * level;
}

// ---------- State ----------
export interface InitialStateOptions {
  seed?: number;
  board?: Board;
  /** Force the first pieces (e.g. for tests); the rest come from the bag. */
  firstPieces?: PieceType[];
}

export function createInitialState(options: InitialStateOptions = {}): BlocksState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const filled = fillQueue(options.firstPieces ?? [], [], seed);
  return {
    board: options.board ? options.board.map(row => [...row]) : createEmptyBoard(),
    active: null,
    queue: filled.queue,
    bag: filled.bag,
    randomSeed: filled.randomSeed,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    status: 'ready',
    gravityElapsedMs: 0,
    lockElapsedMs: 0,
    lockResets: 0,
    clearingRows: [],
    lastClearLines: 0,
    clearCount: 0,
    lockCount: 0,
  };
}

/** Take the next piece from the queue. Game over if it can't be placed. */
export function spawnNext(state: BlocksState): BlocksState {
  const [nextType, ...restOfQueue] = state.queue;
  const filled = fillQueue(restOfQueue, state.bag, state.randomSeed);
  const piece = spawnPiece(nextType, state.board[0].length);
  const base = { ...state, ...filled, canHold: true, gravityElapsedMs: 0, lockElapsedMs: 0, lockResets: 0 };
  if (collides(state.board, piece)) return { ...base, active: null, status: 'over' };
  return { ...base, active: piece };
}

export function startGame(state: BlocksState): BlocksState {
  if (state.status === 'paused') return { ...state, status: 'running' };
  if (state.status !== 'ready') return state;
  return spawnNext({ ...state, status: 'running' });
}

export function togglePause(state: BlocksState): BlocksState {
  if (state.status === 'running') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'running' };
  return state;
}

const canAct = (state: BlocksState) => state.status === 'running' && state.active !== null && state.clearingRows.length === 0;

export function isGrounded(state: BlocksState): boolean {
  return state.active !== null && collides(state.board, { ...state.active, y: state.active.y + 1 });
}

/** Rows the active piece can fall before landing (used for the ghost and hard drop). */
export function dropDistance(state: BlocksState): number {
  if (!state.active) return 0;
  let distance = 0;
  while (!collides(state.board, { ...state.active, y: state.active.y + distance + 1 })) distance++;
  return distance;
}

export function ghostPiece(state: BlocksState): ActivePiece | null {
  return state.active ? { ...state.active, y: state.active.y + dropDistance(state) } : null;
}

/** After a successful sideways move or rotation, a grounded piece gets its lock delay back (limited). */
function afterShift(state: BlocksState, piece: ActivePiece): BlocksState {
  const moved = { ...state, active: piece };
  if (isGrounded(moved) && state.lockResets < MAX_LOCK_RESETS) {
    return { ...moved, lockElapsedMs: 0, lockResets: state.lockResets + 1 };
  }
  return moved;
}

export function moveHorizontal(state: BlocksState, columns: -1 | 1): BlocksState {
  if (!canAct(state)) return state;
  const moved = { ...state.active!, x: state.active!.x + columns };
  return collides(state.board, moved) ? state : afterShift(state, moved);
}

export function rotateClockwise(state: BlocksState): BlocksState {
  if (!canAct(state)) return state;
  const active = state.active!;
  if (active.type === 'O') return state;
  const rotated = { ...active, rotation: ((active.rotation + 1) % 4) as Rotation };
  for (const kick of WALL_KICKS) {
    const kicked = { ...rotated, x: rotated.x + kick.x, y: rotated.y + kick.y };
    if (!collides(state.board, kicked)) return afterShift(state, kicked);
  }
  return state;
}

/** Move down one row. `isSoftDrop` awards a point per cell. Does nothing when grounded. */
export function moveDown(state: BlocksState, isSoftDrop = false): BlocksState {
  if (!canAct(state) || isGrounded(state)) return state;
  return {
    ...state,
    active: { ...state.active!, y: state.active!.y + 1 },
    gravityElapsedMs: 0,
    lockElapsedMs: 0,
    lockResets: 0,
    score: state.score + (isSoftDrop ? SOFT_DROP_POINTS_PER_CELL : 0),
  };
}

/** Fix the active piece into the board, score any full rows and spawn the next piece. */
export function lockPiece(state: BlocksState): BlocksState {
  if (!state.active) return state;
  const board = state.board.map(row => [...row]);
  const cells = pieceCells(state.active);
  let isAboveTop = false;
  for (const cell of cells) {
    if (cell.y < 0) { isAboveTop = true; continue; }
    board[cell.y][cell.x] = state.active.type;
  }
  const locked = { ...state, board, active: null, lockCount: state.lockCount + 1 };
  if (isAboveTop) return { ...locked, status: 'over' as const };
  const fullRows = findFullRows(board);
  if (fullRows.length === 0) return spawnNext(locked);
  const lines = state.lines + fullRows.length;
  return {
    ...locked,
    clearingRows: fullRows,
    score: state.score + lineClearPoints(fullRows.length, state.level),
    lines,
    level: levelForLines(lines),
    lastClearLines: fullRows.length,
    clearCount: state.clearCount + 1,
  };
}

/** Called when the clear animation ends: collapse the rows and bring in the next piece. */
export function finishLineClear(state: BlocksState): BlocksState {
  if (state.clearingRows.length === 0) return state;
  const cleared = { ...state, board: removeRows(state.board, state.clearingRows), clearingRows: [] };
  return state.status === 'over' ? cleared : spawnNext(cleared);
}

export function hardDrop(state: BlocksState): BlocksState {
  if (!canAct(state)) return state;
  const distance = dropDistance(state);
  return lockPiece({
    ...state,
    active: { ...state.active!, y: state.active!.y + distance },
    score: state.score + distance * HARD_DROP_POINTS_PER_CELL,
  });
}

export function holdPiece(state: BlocksState): BlocksState {
  if (!canAct(state) || !state.canHold) return state;
  const currentType = state.active!.type;
  if (state.hold === null) return { ...spawnNext({ ...state, hold: currentType }), canHold: false };
  const swapped = spawnPiece(state.hold, state.board[0].length);
  const base = { ...state, hold: currentType, canHold: false, gravityElapsedMs: 0, lockElapsedMs: 0, lockResets: 0 };
  if (collides(state.board, swapped)) return { ...base, active: null, status: 'over' };
  return { ...base, active: swapped };
}

/** How long until something happens on its own (a gravity step or a lock). */
export function msUntilNextEvent(state: BlocksState): number {
  if (!canAct(state)) return Infinity;
  if (isGrounded(state)) return Math.max(0, LOCK_DELAY_MS - state.lockElapsedMs);
  return Math.max(0, gravityIntervalMs(state.level) - state.gravityElapsedMs);
}

/** Advance time: apply gravity steps and the lock delay. */
export function advanceTime(state: BlocksState, elapsedMs: number): BlocksState {
  let current = state;
  let remainingMs = elapsedMs;
  // bounded: at most one step per row plus one lock
  for (let guard = 0; guard < BOARD_ROWS * 4 && canAct(current); guard++) {
    if (isGrounded(current)) {
      const untilLock = LOCK_DELAY_MS - current.lockElapsedMs;
      if (remainingMs >= untilLock) return lockPiece(current);
      return { ...current, lockElapsedMs: current.lockElapsedMs + remainingMs };
    }
    const untilStep = gravityIntervalMs(current.level) - current.gravityElapsedMs;
    if (remainingMs < untilStep) return { ...current, gravityElapsedMs: current.gravityElapsedMs + remainingMs };
    remainingMs -= untilStep;
    current = moveDown(current);
  }
  return current;
}
