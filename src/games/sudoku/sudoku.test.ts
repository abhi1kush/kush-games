import { describe, expect, it } from 'vitest';
import { createSudoku, eraseCell, giveHint, placeValue, toggleNote, undo } from './game';
import { parseSudokuSave, serializeSudoku } from './save';
import { countSolutions, findConflicts, generatePuzzle, isSolvedGrid, PEERS, solve } from './sudoku';

const KNOWN_PUZZLE = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'.split('').map(Number);

describe('sudoku solver and validator', () => {
  it('solves a known puzzle uniquely', () => {
    const solution = solve(KNOWN_PUZZLE)!;
    expect(isSolvedGrid(solution)).toBe(true);
    expect(solution.slice(0, 9)).toEqual([5, 3, 4, 6, 7, 8, 9, 1, 2]);
    expect(countSolutions(KNOWN_PUZZLE)).toBe(1);
  });

  it('detects multiple solutions and impossible grids', () => {
    expect(countSolutions(Array(81).fill(0))).toBe(2);
    const broken = [...KNOWN_PUZZLE];
    broken[2] = 5; // second 5 in the first row
    expect(countSolutions(broken)).toBe(0);
    expect([...findConflicts(broken)].sort((a, b) => a - b)).toEqual([0, 2]);
  });

  it('every cell has 20 peers', () => {
    expect(PEERS.every(peers => peers.length === 20)).toBe(true);
  });

  it('rejects incomplete or wrong grids', () => {
    const solution = solve(KNOWN_PUZZLE)!;
    expect(isSolvedGrid(KNOWN_PUZZLE)).toBe(false);
    const swapped = [...solution];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(isSolvedGrid(swapped)).toBe(false);
  });
});

describe('sudoku generator', () => {
  it.each(['easy', 'medium', 'hard'] as const)('makes %s puzzles with exactly one solution', difficulty => {
    for (const seed of [1, 2, 3]) {
      const { puzzle, solution } = generatePuzzle(difficulty, seed);
      expect(isSolvedGrid(solution)).toBe(true);
      expect(countSolutions(puzzle)).toBe(1);
      expect(solve(puzzle)).toEqual(solution);
      puzzle.forEach((given, index) => { if (given) expect(given).toBe(solution[index]); });
      const clues = puzzle.filter(Boolean).length;
      const target = { easy: 40, medium: 32, hard: 26 }[difficulty];
      expect(clues).toBeGreaterThanOrEqual(target);
      expect(clues).toBeLessThanOrEqual(target + 8);
    }
  });

  it('is repeatable for a seed', () => {
    expect(generatePuzzle('medium', 42)).toEqual(generatePuzzle('medium', 42));
  });
});

describe('sudoku moves', () => {
  const fresh = () => createSudoku('easy', 5);
  const firstEmpty = (state: ReturnType<typeof fresh>) => state.values.indexOf(0);

  it('counts mistakes, removes peer notes, and undoes', () => {
    let state = fresh();
    const index = firstEmpty(state);
    const answer = state.solution[index];
    const peer = PEERS[index].find(other => state.values[other] === 0)!;
    state = toggleNote(state, peer, answer);
    expect(state.notes[peer]).toBe(1 << answer);
    const wrong = answer === 9 ? 1 : answer + 1;
    state = placeValue(state, index, wrong);
    expect(state.mistakes).toBe(1);
    state = placeValue(state, index, answer);
    expect(state.values[index]).toBe(answer);
    expect(state.notes[peer]).toBe(0);
    state = undo(state);
    expect(state.values[index]).toBe(wrong);
    expect(state.notes[peer]).toBe(1 << answer);
    state = eraseCell(state, index);
    expect(state.values[index]).toBe(0);
  });

  it('cannot change givens', () => {
    const state = fresh();
    const given = state.puzzle.findIndex(Boolean);
    expect(placeValue(state, given, 1)).toBe(state);
  });

  it('hints fill the right answer and solving finishes the game', () => {
    let state = fresh();
    while (!state.isSolved) state = giveHint(state, null).state;
    expect(state.values).toEqual(state.solution);
    expect(state.mistakes).toBe(0);
    expect(state.hintsUsed).toBe(state.puzzle.filter(given => !given).length);
    expect(serializeSudoku(state)).toBeNull();
  });

  it('saves and restores a game in progress', () => {
    let state = fresh();
    state = placeValue(state, firstEmpty(state), 3);
    const restored = parseSudokuSave(JSON.parse(JSON.stringify(serializeSudoku(state))))!;
    expect(restored.values).toEqual(state.values);
    expect(restored.history).toEqual(state.history);
    expect(parseSudokuSave({ ...serializeSudoku(state), values: [1, 2] })).toBeNull();
  });
});
