import type { OnlineMatch } from './match';

export type OnlineOutcome = 'win' | 'loss' | 'draw';
export interface OnlineResult { outcome: OnlineOutcome; text: string; }

/** The board's verdict: a winner (with an optional reason like "four in a row"), a draw, or still playing. */
export type BoardResult<Color extends string> = { winner: Color; reason?: string } | { draw: true; reason?: string } | null;

/** The result from this player's point of view, or null while the game goes on. */
export function onlineResult<Color extends string>(match: OnlineMatch<Color>, mine: Color, board: BoardResult<Color>): OnlineResult | null {
  if (match.ending?.kind === 'resign') {
    return match.ending.loser === mine
      ? { outcome: 'loss', text: 'You resigned — your friend wins' }
      : { outcome: 'win', text: 'Your friend resigned — you win! 🎉' };
  }
  if (match.ending?.kind === 'draw-agreed') return { outcome: 'draw', text: 'Draw agreed 🤝' };
  if (!board) return null;
  const reason = board.reason ? ` — ${board.reason}` : '';
  if ('draw' in board) return { outcome: 'draw', text: `Draw${reason}` };
  return board.winner === mine ? { outcome: 'win', text: `You win${reason}! 🎉` } : { outcome: 'loss', text: `Your friend wins${reason}` };
}
