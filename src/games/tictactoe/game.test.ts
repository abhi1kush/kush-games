import { describe, expect, it } from 'vitest';
import { createRandom } from '../random';
import { Board, bestMove, easyMove, emptyBoard, emptyCells, Mark, markToMove, otherMark, outcomeOf } from './game';
import { parseTicTacToeSave } from './save';

/** Play every possible human reply against the hard computer and return how many games the human won. */
function humanWinsInFullTree(board: Board, toMove: Mark, computer: Mark): { humanWins: number; games: number } {
  const outcome = outcomeOf(board);
  if (outcome) return { humanWins: outcome.winner === otherMark(computer) ? 1 : 0, games: 1 };
  if (toMove === computer) {
    const next = [...board];
    next[bestMove(board, computer, () => 0)] = computer;
    return humanWinsInFullTree(next, otherMark(toMove), computer);
  }
  let humanWins = 0, games = 0;
  for (const index of emptyCells(board)) {
    const next = [...board];
    next[index] = toMove;
    const result = humanWinsInFullTree(next, otherMark(toMove), computer);
    humanWins += result.humanWins; games += result.games;
  }
  return { humanWins, games };
}

describe('tic-tac-toe rules', () => {
  it('finds wins, lines and draws', () => {
    expect(outcomeOf(['X', 'X', 'X', null, 'O', 'O', null, null, null])).toEqual({ winner: 'X', line: [0, 1, 2] });
    expect(outcomeOf(['O', 'X', 'X', null, 'O', 'X', null, null, 'O'])).toEqual({ winner: 'O', line: [0, 4, 8] });
    expect(outcomeOf(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])).toEqual({ winner: 'draw', line: null });
    expect(outcomeOf(emptyBoard())).toBeNull();
    expect(markToMove(['X', null, null, null, null, null, null, null, null], 'X')).toBe('O');
  });
});

describe('tic-tac-toe minimax', () => {
  it('never loses as O against every possible X line of play', () => {
    const result = humanWinsInFullTree(emptyBoard(), 'X', 'O');
    expect(result.humanWins).toBe(0);
    expect(result.games).toBeGreaterThan(100);
  });

  it('never loses as X against every possible O line of play', () => {
    expect(humanWinsInFullTree(emptyBoard(), 'X', 'X').humanWins).toBe(0);
  });

  it('takes a win immediately and blocks a threat', () => {
    expect(bestMove(['O', 'O', null, 'X', 'X', null, null, null, null], 'O')).toBe(2);
    expect(bestMove(['X', 'X', null, null, 'O', null, null, null, null], 'O')).toBe(2);
  });

  it('easy mode always plays a legal move', () => {
    const random = createRandom(3);
    let board = emptyBoard();
    let toMove: Mark = 'X';
    while (!outcomeOf(board)) {
      const move = easyMove(board, toMove, random);
      expect(board[move]).toBeNull();
      board = [...board]; board[move] = toMove; toMove = otherMark(toMove);
    }
  });
});

describe('tic-tac-toe save', () => {
  const base = { firstMark: 'X', opponent: 'computer', difficulty: 'hard', humanMark: 'X' };
  it('accepts a round in progress and rejects finished, empty or impossible boards', () => {
    expect(parseTicTacToeSave({ ...base, board: ['X', 'O', null, null, null, null, null, null, null] })).not.toBeNull();
    expect(parseTicTacToeSave({ ...base, board: emptyBoard() })).toBeNull();
    expect(parseTicTacToeSave({ ...base, board: ['X', 'X', 'X', 'O', 'O', null, null, null, null] })).toBeNull();
    expect(parseTicTacToeSave({ ...base, board: ['X', 'X', null, null, null, null, null, null, null] })).toBeNull();
  });
});
