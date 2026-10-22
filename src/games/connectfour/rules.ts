/** Connect Four for the shared online code: moves are column digits "0"–"6", checked with the Rust/wasm rules. */
import type { OnlineRules } from '../online/match';
import { ConnectFour as Engine, ROWS } from './engine';
import type { DiscColor } from './save';

let scratch: Engine | null = null;
let scratchLine: string | null = null;

/** Replay a move list on a shared scratch engine (cached for the last line); null when a move is illegal. */
export function replayColumns(moves: readonly string[]): Engine | null {
  const line = moves.join('');
  if (scratch && scratchLine === line) return scratch;
  scratch ??= new Engine();
  const isLegal = scratch.load(Uint8Array.from(moves, Number));
  scratchLine = isLegal ? line : null;
  return isLegal ? scratch : null;
}

const COLUMN_PATTERN = /^[0-6]$/;

export const connectFourRules: OnlineRules<DiscColor> = {
  gameId: 'connect-four',
  colors: ['red', 'yellow'],
  isMoveText: (value): value is string => typeof value === 'string' && COLUMN_PATTERN.test(value),
  isLegalLine: moves => moves.length <= 42 && replayColumns(moves) !== null,
  legalMove(moves, move) {
    if (!COLUMN_PATTERN.test(move)) return null;
    const engine = replayColumns(moves);
    if (!engine || engine.winner() !== 0) return null;
    return engine.cells()[Number(move) * ROWS + ROWS - 1] === 0 ? move : null;
  },
  colorToMove: moves => (moves.length % 2 === 0 ? 'red' : 'yellow'),
  isOverOnBoard: moves => (replayColumns(moves)?.winner() ?? 1) !== 0,
};
