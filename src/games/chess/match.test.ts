import { describe, expect, it } from 'vitest';
import {
  acceptDraw, applyMove, colorToMove, createMatch, describeOutcome, MatchState, matchOutcome, offerDraw, replayMoves, resign, startRematch,
} from './match';

/** Play moves alternating colours from the current turn; fails the test on an illegal move. */
function play(match: MatchState, ...moves: string[]): MatchState {
  return moves.reduce((current, uci) => {
    const result = applyMove(current, uci, colorToMove(current));
    if (!result) throw new Error(`illegal ${uci}`);
    return result.match;
  }, match);
}
const outcomeOf = (match: MatchState) => matchOutcome(match, replayMoves(match.moves)!);

describe('chess match rules (chess.js)', () => {
  it('applies legal moves only, in turn', () => {
    const match = createMatch();
    expect(applyMove(match, 'e2e4', 'b')).toBeNull(); // not black's turn
    expect(applyMove(match, 'e2e5', 'w')).toBeNull(); // illegal
    expect(applyMove(match, 'zz99', 'w')).toBeNull();
    const result = applyMove(match, 'e2e4', 'w')!;
    expect(result.move.san).toBe('e4');
    expect(result.match.moves).toEqual(['e2e4']);
    expect(colorToMove(result.match)).toBe('b');
  });

  it('detects checkmate (fool’s mate)', () => {
    const match = play(createMatch(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(outcomeOf(match)).toEqual({ isOver: true, winner: 'b', reason: 'checkmate' });
    expect(describeOutcome(outcomeOf(match))).toBe('Black wins by checkmate');
    expect(applyMove(match, 'a2a3', 'w')).toBeNull();
  });

  it('handles castling, en passant and promotion', () => {
    const castled = play(createMatch(), 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1');
    expect(replayMoves(castled.moves)!.get('g1')).toEqual({ type: 'k', color: 'w' });
    expect(replayMoves(castled.moves)!.get('f1')).toEqual({ type: 'r', color: 'w' });
    const enPassant = play(createMatch(), 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
    expect(replayMoves(enPassant.moves)!.get('d5')).toBeUndefined();
    const promoted = play(createMatch(), 'h2h4', 'g7g5', 'h4g5', 'h7h6', 'g5h6', 'f8g7', 'h6g7', 'g8f6', 'g7h8n');
    expect(replayMoves(promoted.moves)!.get('h8')).toEqual({ type: 'n', color: 'w' });
    expect(promoted.moves[promoted.moves.length - 1]).toBe('g7h8n');
  });

  it('detects stalemate, repetition and insufficient material', () => {
    // fastest known stalemate (Sam Loyd, 10 moves)
    const stalemate = play(createMatch(), 'e2e3', 'a7a5', 'd1h5', 'a8a6', 'h5a5', 'h7h5', 'h2h4', 'a6h6', 'a5c7', 'f7f6', 'c7d7', 'e8f7',
      'd7b7', 'd8d3', 'b7b8', 'd3h7', 'b8c8', 'f7g6', 'c8e6');
    expect(outcomeOf(stalemate)).toMatchObject({ isOver: true, winner: null, reason: 'stalemate' });
    const repetition = play(createMatch(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
    expect(outcomeOf(repetition).reason).toBe('threefold repetition');
    const bare = replayMoves([])!;
    bare.load('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
    expect(bare.isInsufficientMaterial()).toBe(true);
  });

  it('resigns, offers and accepts draws, and swaps colours on rematch', () => {
    const started = play(createMatch('w', 3), 'e2e4');
    expect(outcomeOf(resign(started, 'b'))).toEqual({ isOver: true, winner: 'w', reason: 'resignation' });
    const offered = offerDraw(started, 'w');
    expect(offered.drawOfferFrom).toBe('w');
    expect(acceptDraw(offered, 'w')).toBe(offered); // can't accept your own offer
    expect(outcomeOf(acceptDraw(offered, 'b'))).toMatchObject({ isOver: true, winner: null, reason: 'agreement' });
    expect(play(offered, 'e7e5').drawOfferFrom).toBeNull(); // a move withdraws the offer
    expect(startRematch(started)).toEqual(createMatch('b', 4));
  });
});
