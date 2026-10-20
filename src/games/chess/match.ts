/**
 * Pure chess match state shared by local and online play. No React, no network.
 *
 * A match is the list of moves (UCI, e.g. "e2e4", "e7e8q") from the start position plus how the
 * game ended when that isn't decided by the board (resignation, agreed draw). chess.js checks
 * every move and decides check, mate, stalemate and the automatic draws.
 */
import { Chess, Move, Square } from 'chess.js';

export type Color = 'w' | 'b';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export type Ending = { kind: 'resign'; loser: Color } | { kind: 'draw-agreed' };

export interface MatchState {
  /** Increases with every rematch, so messages from an older game are ignored. */
  gameNumber: number;
  /** Colour the room's host plays in this game (swaps on rematch). Local games use 'w'. */
  hostColor: Color;
  /** Moves in UCI notation from the start position. */
  moves: string[];
  ending: Ending | null;
  drawOfferFrom: Color | null;
  rematchOfferFrom: Color | null;
}

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');
export const colorName = (color: Color) => (color === 'w' ? 'White' : 'Black');

export function createMatch(hostColor: Color = 'w', gameNumber = 1): MatchState {
  return { gameNumber, hostColor, moves: [], ending: null, drawOfferFrom: null, rematchOfferFrom: null };
}

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
export const isUciMove = (text: unknown): text is string => typeof text === 'string' && UCI_PATTERN.test(text);
export const moveToUci = (move: Pick<Move, 'from' | 'to' | 'promotion'>) => `${move.from}${move.to}${move.promotion ?? ''}`;

/** Play one UCI move on a chess.js game; returns the move or null when illegal. */
export function playUci(game: Chess, uci: string): Move | null {
  if (!isUciMove(uci)) return null;
  try {
    return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

/** Replay a move list from the start; null when any move is illegal. */
export function replayMoves(moves: readonly string[]): Chess | null {
  const game = new Chess();
  for (const uci of moves) if (!playUci(game, uci)) return null;
  return game;
}

export type ResultReason =
  | 'checkmate' | 'resignation' | 'stalemate' | 'threefold repetition' | 'insufficient material' | 'fifty-move rule' | 'agreement';

export interface MatchOutcome {
  isOver: boolean;
  /** null for a draw (or while playing). */
  winner: Color | null;
  reason: ResultReason | null;
}

export function matchOutcome(match: MatchState, game: Chess): MatchOutcome {
  if (match.ending?.kind === 'resign') return { isOver: true, winner: opposite(match.ending.loser), reason: 'resignation' };
  if (match.ending?.kind === 'draw-agreed') return { isOver: true, winner: null, reason: 'agreement' };
  if (game.isCheckmate()) return { isOver: true, winner: opposite(game.turn()), reason: 'checkmate' };
  if (game.isStalemate()) return { isOver: true, winner: null, reason: 'stalemate' };
  if (game.isInsufficientMaterial()) return { isOver: true, winner: null, reason: 'insufficient material' };
  if (game.isThreefoldRepetition()) return { isOver: true, winner: null, reason: 'threefold repetition' };
  if (game.isDrawByFiftyMoves()) return { isOver: true, winner: null, reason: 'fifty-move rule' };
  return { isOver: false, winner: null, reason: null };
}

export function describeOutcome(outcome: MatchOutcome): string {
  if (!outcome.isOver) return '';
  if (outcome.winner) return `${colorName(outcome.winner)} wins by ${outcome.reason}`;
  return `Draw by ${outcome.reason}`;
}

/** Whose turn it is after the given moves (white starts). */
export const colorToMove = (match: MatchState): Color => (match.moves.length % 2 === 0 ? 'w' : 'b');

/**
 * Add a move by `mover` if it is their turn, the game is still on and the move is legal.
 * Returns the new state and the move details, or null.
 */
export function applyMove(match: MatchState, uci: string, mover: Color): { match: MatchState; move: Move; game: Chess } | null {
  if (colorToMove(match) !== mover) return null;
  const game = replayMoves(match.moves);
  if (!game || matchOutcome(match, game).isOver) return null;
  const move = playUci(game, uci);
  if (!move) return null;
  return { match: { ...match, moves: [...match.moves, moveToUci(move)], drawOfferFrom: null }, move, game };
}

export function resign(match: MatchState, loser: Color): MatchState {
  const game = replayMoves(match.moves);
  if (!game || matchOutcome(match, game).isOver) return match;
  return { ...match, ending: { kind: 'resign', loser }, drawOfferFrom: null };
}

export function offerDraw(match: MatchState, from: Color): MatchState {
  const game = replayMoves(match.moves);
  if (!game || matchOutcome(match, game).isOver || match.drawOfferFrom) return match;
  return { ...match, drawOfferFrom: from };
}

/** Accepting only works for the player the draw was offered to. */
export function acceptDraw(match: MatchState, by: Color): MatchState {
  if (match.drawOfferFrom !== opposite(by)) return match;
  return { ...match, ending: { kind: 'draw-agreed' }, drawOfferFrom: null };
}

export const declineDraw = (match: MatchState): MatchState => (match.drawOfferFrom ? { ...match, drawOfferFrom: null } : match);

export const offerRematch = (match: MatchState, from: Color): MatchState => ({ ...match, rematchOfferFrom: from });

/** A new game with colours swapped. */
export function startRematch(match: MatchState): MatchState {
  return createMatch(opposite(match.hostColor), match.gameNumber + 1);
}

/** Squares a piece on `from` can move to (for highlighting). */
export function legalTargets(game: Chess, from: Square): Move[] {
  return game.moves({ square: from, verbose: true });
}
