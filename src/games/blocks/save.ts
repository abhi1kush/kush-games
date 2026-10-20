/** Saving and restoring an in-progress Blocks game (see ../persistence.ts). */
import { createSaveSlot, isInteger, isOneOf, isRecord } from '../persistence';
import {
  ActivePiece, Board, BlocksState, BOARD_COLUMNS, BOARD_ROWS, CellType, collides, finishLineClear, levelForLines,
  PIECE_TYPES, PieceType, QUEUE_LENGTH,
} from './game';

export const BLOCKS_SAVE_VERSION = 1;
const CELL_TYPES: readonly CellType[] = [...PIECE_TYPES, 'garbage'];

export interface SavedBlocks {
  board: Board;
  active: ActivePiece;
  queue: PieceType[];
  bag: PieceType[];
  /** Random generator state, so the piece order carries on exactly. */
  randomSeed: number;
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  gravityElapsedMs: number;
  lockElapsedMs: number;
  lockResets: number;
  lastClearLines: number;
  clearCount: number;
  lockCount: number;
  status: 'running' | 'paused';
}

/** Only games in progress are saved; null means "nothing to save" (clear the slot). */
export function serializeBlocks(state: BlocksState): SavedBlocks | null {
  // A clear that is still animating is finished first, so the save never holds full rows.
  const settled = finishLineClear(state);
  if ((settled.status !== 'running' && settled.status !== 'paused') || !settled.active) return null;
  return {
    board: settled.board.map(row => [...row]),
    active: { ...settled.active },
    queue: [...settled.queue],
    bag: [...settled.bag],
    randomSeed: settled.randomSeed,
    hold: settled.hold,
    canHold: settled.canHold,
    score: settled.score,
    lines: settled.lines,
    level: settled.level,
    gravityElapsedMs: settled.gravityElapsedMs,
    lockElapsedMs: settled.lockElapsedMs,
    lockResets: settled.lockResets,
    lastClearLines: settled.lastClearLines,
    clearCount: settled.clearCount,
    lockCount: settled.lockCount,
    status: settled.status,
  };
}

const isPieceType = (value: unknown): value is PieceType => isOneOf(value, PIECE_TYPES);
const isTime = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 60_000;

export function parseBlocksSave(data: unknown): SavedBlocks | null {
  if (!isRecord(data)) return null;
  const { board, active, queue, bag } = data;
  if (!Array.isArray(board) || board.length !== BOARD_ROWS) return null;
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== BOARD_COLUMNS) return null;
    if (!row.every(cell => cell === null || isOneOf(cell, CELL_TYPES))) return null;
    if (row.every(cell => cell !== null)) return null; // full rows are always cleared before saving
  }
  if (!isRecord(active) || !isPieceType(active.type) || !isInteger(active.rotation, 0, 3)
    || !isInteger(active.x, -4, BOARD_COLUMNS) || !isInteger(active.y, -4, BOARD_ROWS)) return null;
  if (!Array.isArray(queue) || queue.length !== QUEUE_LENGTH || !queue.every(isPieceType)) return null;
  if (!Array.isArray(bag) || bag.length > PIECE_TYPES.length || !bag.every(isPieceType) || new Set(bag).size !== bag.length) return null;
  if (!isInteger(data.randomSeed, -(2 ** 31), 2 ** 31 - 1)) return null;
  if (data.hold !== null && !isPieceType(data.hold)) return null;
  if (typeof data.canHold !== 'boolean' || !isOneOf(data.status, ['running', 'paused'] as const)) return null;
  if (!isInteger(data.score, 0) || !isInteger(data.lines, 0) || data.level !== levelForLines(data.lines as number)) return null;
  if (!isTime(data.gravityElapsedMs) || !isTime(data.lockElapsedMs) || !isInteger(data.lockResets, 0)) return null;
  if (!isInteger(data.lastClearLines, 0, 4) || !isInteger(data.clearCount, 0) || !isInteger(data.lockCount, 0)) return null;
  if (collides(board as Board, active as unknown as ActivePiece)) return null;
  return data as unknown as SavedBlocks;
}

/** A restored game always comes back paused. */
export function restoreBlocks(saved: SavedBlocks): BlocksState {
  return {
    board: saved.board.map(row => [...row]),
    active: { ...saved.active },
    queue: [...saved.queue],
    bag: [...saved.bag],
    randomSeed: saved.randomSeed,
    hold: saved.hold,
    canHold: saved.canHold,
    score: saved.score,
    lines: saved.lines,
    level: saved.level,
    status: 'paused',
    gravityElapsedMs: saved.gravityElapsedMs,
    lockElapsedMs: saved.lockElapsedMs,
    lockResets: saved.lockResets,
    clearingRows: [],
    lastClearLines: saved.lastClearLines,
    clearCount: saved.clearCount,
    lockCount: saved.lockCount,
  };
}

export const createBlocksSaveSlot = () => createSaveSlot({ gameId: 'blocks', version: BLOCKS_SAVE_VERSION, parse: parseBlocksSave });
