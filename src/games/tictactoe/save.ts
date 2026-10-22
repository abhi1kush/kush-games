import { createSaveSlot, isOneOf, isRecord } from '../persistence';
import { Board, Difficulty, Mark, outcomeOf } from './game';

export type Opponent = 'computer' | 'friend';

export interface SavedTicTacToe {
  board: Board;
  /** Who moved first this round. */
  firstMark: Mark;
  opponent: Opponent;
  difficulty: Difficulty;
  /** The human's mark against the computer. */
  humanMark: Mark;
}

export function parseTicTacToeSave(data: unknown): SavedTicTacToe | null {
  if (!isRecord(data) || !Array.isArray(data.board) || data.board.length !== 9) return null;
  if (!data.board.every(cell => cell === null || cell === 'X' || cell === 'O')) return null;
  if (!isOneOf(data.firstMark, ['X', 'O'] as const) || !isOneOf(data.humanMark, ['X', 'O'] as const)) return null;
  if (!isOneOf(data.opponent, ['computer', 'friend'] as const) || !isOneOf(data.difficulty, ['easy', 'hard'] as const)) return null;
  const board = data.board as Board;
  const firstCount = board.filter(cell => cell === data.firstMark).length;
  const secondCount = board.filter(cell => cell !== null && cell !== data.firstMark).length;
  if (firstCount - secondCount !== 0 && firstCount - secondCount !== 1) return null;
  if (outcomeOf(board) || board.every(cell => cell === null)) return null; // finished or empty rounds are not saved
  return data as unknown as SavedTicTacToe;
}

export const createTicTacToeSaveSlot = () => createSaveSlot({ gameId: 'tic-tac-toe', version: 1, parse: parseTicTacToeSave });
