/** Sudoku generation, solving and checking. A grid is 81 numbers in row order; 0 means empty. */
import { createRandom, shuffled } from '../random';

export const SIZE = 9;
export const CELL_COUNT = 81;
const ALL_DIGITS_MASK = 0b1111111110; // bits 1..9

export const rowOf = (index: number) => Math.floor(index / SIZE);
export const columnOf = (index: number) => index % SIZE;
export const boxOf = (index: number) => Math.floor(rowOf(index) / 3) * 3 + Math.floor(columnOf(index) / 3);

/** For each cell, the 20 other cells in its row, column and box. */
export const PEERS: number[][] = Array.from({ length: CELL_COUNT }, (_, index) =>
  Array.from({ length: CELL_COUNT }, (_, other) => other).filter(other =>
    other !== index && (rowOf(other) === rowOf(index) || columnOf(other) === columnOf(index) || boxOf(other) === boxOf(index))));

const bitCount = (mask: number) => { let count = 0; while (mask) { mask &= mask - 1; count++; } return count; };

interface Masks { rows: number[]; columns: number[]; boxes: number[]; }

function buildMasks(grid: number[]): Masks | null {
  const masks: Masks = { rows: Array(9).fill(0), columns: Array(9).fill(0), boxes: Array(9).fill(0) };
  for (let index = 0; index < CELL_COUNT; index++) {
    const value = grid[index];
    if (!value) continue;
    const bit = 1 << value;
    const row = rowOf(index), column = columnOf(index), box = boxOf(index);
    if ((masks.rows[row] | masks.columns[column] | masks.boxes[box]) & bit) return null; // duplicate: no solutions
    masks.rows[row] |= bit; masks.columns[column] |= bit; masks.boxes[box] |= bit;
  }
  return masks;
}

/**
 * Backtracking search that always fills the cell with the fewest candidates first.
 * Calls onSolution for each solution found; stop early by returning true from it.
 */
function search(grid: number[], masks: Masks, onSolution: (grid: number[]) => boolean, random?: () => number): boolean {
  let bestIndex = -1;
  let bestCandidates = 0;
  let bestCount = 10;
  for (let index = 0; index < CELL_COUNT; index++) {
    if (grid[index]) continue;
    const candidates = ALL_DIGITS_MASK & ~(masks.rows[rowOf(index)] | masks.columns[columnOf(index)] | masks.boxes[boxOf(index)]);
    const count = bitCount(candidates);
    if (count === 0) return false;
    if (count < bestCount) { bestIndex = index; bestCandidates = candidates; bestCount = count; if (count === 1) break; }
  }
  if (bestIndex === -1) return onSolution(grid);
  const digits: number[] = [];
  for (let digit = 1; digit <= 9; digit++) if (bestCandidates & (1 << digit)) digits.push(digit);
  const row = rowOf(bestIndex), column = columnOf(bestIndex), box = boxOf(bestIndex);
  for (const digit of random ? shuffled(digits, random) : digits) {
    const bit = 1 << digit;
    grid[bestIndex] = digit;
    masks.rows[row] |= bit; masks.columns[column] |= bit; masks.boxes[box] |= bit;
    const stop = search(grid, masks, onSolution, random);
    masks.rows[row] &= ~bit; masks.columns[column] &= ~bit; masks.boxes[box] &= ~bit;
    grid[bestIndex] = 0;
    if (stop) return true;
  }
  return false;
}

/** Number of solutions, counting no further than `limit` (2 is enough to test uniqueness). */
export function countSolutions(grid: number[], limit = 2): number {
  const masks = buildMasks(grid);
  if (!masks) return 0;
  let count = 0;
  search([...grid], masks, () => ++count >= limit);
  return count;
}

export function solve(grid: number[]): number[] | null {
  const masks = buildMasks(grid);
  if (!masks) return null;
  let solution: number[] | null = null;
  search([...grid], masks, found => { solution = [...found]; return true; });
  return solution;
}

/** A random complete, valid grid. */
export function generateSolvedGrid(random: () => number): number[] {
  let solution: number[] = [];
  search(Array(CELL_COUNT).fill(0), buildMasks(Array(CELL_COUNT).fill(0))!, found => { solution = [...found]; return true; }, random);
  return solution;
}

export type SudokuDifficulty = 'easy' | 'medium' | 'hard';
export const SUDOKU_DIFFICULTIES: { id: SudokuDifficulty; label: string; targetClues: number }[] = [
  { id: 'easy', label: 'Easy', targetClues: 40 },
  { id: 'medium', label: 'Medium', targetClues: 32 },
  { id: 'hard', label: 'Hard', targetClues: 26 },
];

export interface Puzzle { puzzle: number[]; solution: number[]; }

/** Remove clues in random order while the puzzle still has exactly one solution. */
export function generatePuzzle(difficulty: SudokuDifficulty, seed: number): Puzzle {
  const random = createRandom(seed);
  const solution = generateSolvedGrid(random);
  const puzzle = [...solution];
  const targetClues = SUDOKU_DIFFICULTIES.find(option => option.id === difficulty)?.targetClues ?? 40;
  let clues = CELL_COUNT;
  for (const index of shuffled(Array.from({ length: CELL_COUNT }, (_, cell) => cell), random)) {
    if (clues <= targetClues) break;
    const removed = puzzle[index];
    puzzle[index] = 0;
    if (countSolutions(puzzle, 2) === 1) clues--;
    else puzzle[index] = removed;
  }
  return { puzzle, solution };
}

/** Cells whose value repeats in their row, column or box. */
export function findConflicts(values: number[]): Set<number> {
  const conflicts = new Set<number>();
  for (let index = 0; index < CELL_COUNT; index++) {
    if (!values[index]) continue;
    for (const peer of PEERS[index]) if (values[peer] === values[index]) { conflicts.add(index); break; }
  }
  return conflicts;
}

/** True when the grid is completely and correctly filled. */
export function isSolvedGrid(values: number[]): boolean {
  return values.length === CELL_COUNT && values.every(value => value >= 1 && value <= 9) && findConflicts(values).size === 0;
}
