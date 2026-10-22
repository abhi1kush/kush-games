import { createSaveSlot, isInteger, isOneOf, isRecord } from '../persistence';
import { CellSnapshot, MAX_HISTORY, SudokuState } from './game';
import { CELL_COUNT, findConflicts, isSolvedGrid, SUDOKU_DIFFICULTIES, SudokuDifficulty } from './sudoku';

const DIFFICULTY_IDS = SUDOKU_DIFFICULTIES.map(option => option.id) as SudokuDifficulty[];
const isGrid = (value: unknown, maximum: number): value is number[] =>
  Array.isArray(value) && value.length === CELL_COUNT && value.every(cell => isInteger(cell, 0, maximum));
const isSnapshot = (value: unknown): value is CellSnapshot =>
  isRecord(value) && isInteger(value.index, 0, CELL_COUNT - 1) && isInteger(value.value, 0, 9) && isInteger(value.notes, 0, 0b1111111110);


/** Only unsolved puzzles are saved. */
export function serializeSudoku(state: SudokuState): SudokuState | null {
  if (state.isSolved) return null;
  return { ...state, elapsedMs: Math.round(state.elapsedMs) };
}

export function parseSudokuSave(data: unknown): SudokuState | null {
  if (!isRecord(data) || !isOneOf(data.difficulty, DIFFICULTY_IDS) || !isInteger(data.seed)) return null;
  if (!isGrid(data.puzzle, 9) || !isGrid(data.solution, 9) || !isGrid(data.values, 9) || !isGrid(data.notes, 0b1111111110)) return null;
  if (!isSolvedGrid(data.solution) || findConflicts(data.puzzle).size) return null;
  const { puzzle, solution, values } = data;
  if (puzzle.some((given, index) => given !== 0 && (given !== solution[index] || values[index] !== given))) return null;
  if (!Array.isArray(data.history) || data.history.length > MAX_HISTORY || !data.history.every(move => Array.isArray(move) && move.every(isSnapshot))) return null;
  if (!isInteger(data.mistakes, 0) || !isInteger(data.hintsUsed, 0) || !isInteger(data.elapsedMs, 0)) return null;
  if (isSolvedGrid(values)) return null;
  return { ...(data as unknown as SudokuState), isSolved: false };
}

export const createSudokuSaveSlot = () => createSaveSlot({ gameId: 'sudoku', version: 1, parse: parseSudokuSave });
