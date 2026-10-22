/**
 * Checkers for the shared online code. A move is its path of squares, e.g. "21-17" or "22-15-6" for a double jump
 * (squares 0–31, row 0 at the top). The Rust/wasm rules decide which paths are legal (captures are compulsory and
 * jumps must continue), so a received move is only applied if it is exactly one of the engine's legal moves.
 */
import type { OnlineRules } from '../online/match';
import { Checkers as Engine, CheckersMove, decodeMoves } from './engine';

export type CheckersColor = 'dark' | 'light';

export const moveText = (move: Pick<CheckersMove, 'from' | 'path'>) => [move.from, ...move.path].join('-');

export interface ReplayedLine {
  engine: Engine;
  legalMoves: CheckersMove[];
  /** The last move played, for highlighting and animation. */
  lastMove: CheckersMove | null;
}

let scratch: Engine | null = null;
let cached: { line: string; replayed: ReplayedLine } | null = null;

/** Replay path moves on a shared scratch engine (cached for the last line); null when any move is illegal. */
export function replayPaths(moves: readonly string[]): ReplayedLine | null {
  const line = moves.join(' ');
  if (cached && cached.line === line) return cached.replayed;
  cached = null;
  scratch ??= new Engine();
  scratch.load(new Uint8Array());
  let legalMoves = decodeMoves(scratch.legal_moves());
  let lastMove: CheckersMove | null = null;
  for (const text of moves) {
    const chosen = legalMoves.find(candidate => moveText(candidate) === text);
    if (!chosen || !scratch.apply(chosen.index)) return null;
    lastMove = chosen;
    legalMoves = decodeMoves(scratch.legal_moves());
  }
  const replayed = { engine: scratch, legalMoves, lastMove };
  cached = { line, replayed };
  return replayed;
}

const PATH_PATTERN = /^\d{1,2}(-\d{1,2}){1,12}$/;
const isPathText = (value: unknown): value is string =>
  typeof value === 'string' && PATH_PATTERN.test(value) && value.split('-').every(square => Number(square) < 32);

export const checkersRules: OnlineRules<CheckersColor> = {
  gameId: 'checkers',
  colors: ['dark', 'light'],
  isMoveText: isPathText,
  isLegalLine: moves => replayPaths(moves) !== null,
  legalMove(moves, move) {
    const replayed = replayPaths(moves);
    if (!replayed || replayed.engine.winner() !== 0) return null;
    return replayed.legalMoves.some(candidate => moveText(candidate) === move) ? move : null;
  },
  colorToMove: moves => (moves.length % 2 === 0 ? 'dark' : 'light'),
  isOverOnBoard: moves => (replayPaths(moves)?.engine.winner() ?? 1) !== 0,
};
