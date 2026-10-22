import { createSaveSlot, isInteger, isRecord } from '../persistence';
import { CellState, countAdjacentMines, DIFFICULTIES, difficultyById, DifficultyId, MinesweeperState } from './game';

export interface SavedMinesweeper {
  difficulty: DifficultyId;
  mineIndexes: number[];
  /** One character per cell: h hidden, r revealed, f flagged. */
  cells: string;
  elapsedMs: number;
}

const CELL_CODES: Record<CellState, string> = { hidden: 'h', revealed: 'r', flagged: 'f' };
const CODE_STATES: Record<string, CellState> = { h: 'hidden', r: 'revealed', f: 'flagged' };

/** Only a game in progress is saved. */
export function serializeMinesweeper(state: MinesweeperState): SavedMinesweeper | null {
  if (state.status !== 'playing') return null;
  return {
    difficulty: state.difficulty,
    mineIndexes: state.isMine.flatMap((isMine, index) => (isMine ? [index] : [])),
    cells: state.cellStates.map(cellState => CELL_CODES[cellState]).join(''),
    elapsedMs: Math.round(state.elapsedMs),
  };
}

export function parseMinesweeperSave(data: unknown): SavedMinesweeper | null {
  if (!isRecord(data) || !DIFFICULTIES.some(difficulty => difficulty.id === data.difficulty)) return null;
  const { rows, columns, mines } = difficultyById(data.difficulty as DifficultyId);
  const total = rows * columns;
  if (!Array.isArray(data.mineIndexes) || data.mineIndexes.length !== mines || !data.mineIndexes.every(index => isInteger(index, 0, total - 1))) return null;
  if (new Set(data.mineIndexes).size !== mines) return null;
  if (typeof data.cells !== 'string' || data.cells.length !== total || !/^[hrf]+$/.test(data.cells)) return null;
  if (!isInteger(data.elapsedMs, 0, 1e9)) return null;
  const mineSet = new Set(data.mineIndexes as number[]);
  // a revealed mine would mean the game was lost; such saves are never written
  if ([...data.cells].some((code, index) => code === 'r' && mineSet.has(index))) return null;
  return data as unknown as SavedMinesweeper;
}

export function restoreMinesweeper(saved: SavedMinesweeper): MinesweeperState {
  const { rows, columns, mines } = difficultyById(saved.difficulty);
  const isMine = Array(rows * columns).fill(false);
  for (const index of saved.mineIndexes) isMine[index] = true;
  return {
    difficulty: saved.difficulty, rows, columns, mineCount: mines, isMine, adjacentMines: countAdjacentMines(isMine, rows, columns),
    cellStates: [...saved.cells].map(code => CODE_STATES[code]), status: 'playing', explodedIndex: null, elapsedMs: saved.elapsedMs,
  };
}

export const createMinesweeperSaveSlot = () => createSaveSlot({ gameId: 'minesweeper', version: 1, parse: parseMinesweeperSave });
