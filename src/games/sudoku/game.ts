/** Sudoku play state: values, pencil notes, undo history, mistakes and hints. Pure functions. */
import { CELL_COUNT, generatePuzzle, isSolvedGrid, PEERS, SudokuDifficulty } from './sudoku';

/** What one cell looked like before a move, so the move can be undone. */
export interface CellSnapshot { index: number; value: number; notes: number; }

export interface SudokuState {
  difficulty: SudokuDifficulty;
  seed: number;
  /** Starting grid; non-zero cells are fixed. */
  puzzle: number[];
  solution: number[];
  values: number[];
  /** Pencil notes as bit masks (bit n = note n). */
  notes: number[];
  /** Each move stores the cells it changed. */
  history: CellSnapshot[][];
  mistakes: number;
  hintsUsed: number;
  elapsedMs: number;
  isSolved: boolean;
}

export const MAX_HISTORY = 300;

export function createSudoku(difficulty: SudokuDifficulty, seed: number): SudokuState {
  const { puzzle, solution } = generatePuzzle(difficulty, seed);
  return {
    difficulty, seed, puzzle, solution, values: [...puzzle], notes: Array(CELL_COUNT).fill(0), history: [], mistakes: 0, hintsUsed: 0,
    elapsedMs: 0, isSolved: false,
  };
}

export const isGiven = (state: SudokuState, index: number) => state.puzzle[index] !== 0;

function commit(state: SudokuState, changes: CellSnapshot[], values: number[], notes: number[], extra: Partial<SudokuState> = {}): SudokuState {
  const history = [...state.history, changes];
  if (history.length > MAX_HISTORY) history.shift();
  return { ...state, ...extra, values, notes, history, isSolved: isSolvedGrid(values) };
}

/** Put a number in a cell (or clear it when it's the same number). Placing removes that note from the cell's peers. */
export function placeValue(state: SudokuState, index: number, value: number): SudokuState {
  if (state.isSolved || isGiven(state, index)) return state;
  const values = [...state.values];
  const notes = [...state.notes];
  const changes: CellSnapshot[] = [{ index, value: values[index], notes: notes[index] }];
  const newValue = values[index] === value ? 0 : value;
  values[index] = newValue;
  notes[index] = 0;
  if (newValue) {
    const bit = 1 << newValue;
    for (const peer of PEERS[index]) {
      if (notes[peer] & bit) { changes.push({ index: peer, value: values[peer], notes: notes[peer] }); notes[peer] &= ~bit; }
    }
  }
  const isMistake = newValue !== 0 && newValue !== state.solution[index];
  return commit(state, changes, values, notes, { mistakes: state.mistakes + (isMistake ? 1 : 0) });
}

/** Toggle a pencil note in an empty cell. */
export function toggleNote(state: SudokuState, index: number, value: number): SudokuState {
  if (state.isSolved || isGiven(state, index) || state.values[index] !== 0) return state;
  const notes = [...state.notes];
  notes[index] ^= 1 << value;
  return commit(state, [{ index, value: 0, notes: state.notes[index] }], state.values, notes);
}

export function eraseCell(state: SudokuState, index: number): SudokuState {
  if (state.isSolved || isGiven(state, index) || (state.values[index] === 0 && state.notes[index] === 0)) return state;
  const values = [...state.values];
  const notes = [...state.notes];
  values[index] = 0;
  notes[index] = 0;
  return commit(state, [{ index, value: state.values[index], notes: state.notes[index] }], values, notes);
}

export function undo(state: SudokuState): SudokuState {
  if (state.isSolved || state.history.length === 0) return state;
  const history = state.history.slice(0, -1);
  const changes = state.history[state.history.length - 1];
  const values = [...state.values];
  const notes = [...state.notes];
  for (const snapshot of [...changes].reverse()) { values[snapshot.index] = snapshot.value; notes[snapshot.index] = snapshot.notes; }
  return { ...state, values, notes, history };
}

/** Fill the chosen cell with its answer, or, when that's not possible, the first empty or wrong cell. Returns the cell it filled. */
export function giveHint(state: SudokuState, preferredIndex: number | null): { state: SudokuState; index: number | null } {
  if (state.isSolved) return { state, index: null };
  const needsHelp = (index: number) => !isGiven(state, index) && state.values[index] !== state.solution[index];
  const index = preferredIndex !== null && needsHelp(preferredIndex) ? preferredIndex : state.values.findIndex((_, cell) => needsHelp(cell));
  if (index < 0) return { state, index: null };
  const placed = placeValue({ ...state, values: state.values.map((value, cell) => (cell === index ? 0 : value)) }, index, state.solution[index]);
  // the snapshot must hold the real previous value, and a hint is never a mistake
  placed.history[placed.history.length - 1][0] = { index, value: state.values[index], notes: state.notes[index] };
  return { state: { ...placed, mistakes: state.mistakes, hintsUsed: state.hintsUsed + 1 }, index };
}

/** How many times each digit is placed (for greying out finished numbers on the pad). */
export function digitCounts(values: number[]): number[] {
  const counts = Array(10).fill(0);
  for (const value of values) counts[value]++;
  return counts;
}
