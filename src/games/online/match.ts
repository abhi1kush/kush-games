/**
 * The state of one online match, shared by every two-player game (Chess, Connect Four, Checkers).
 *
 * A match is a move list (short strings, e.g. "e2e4", "3" or "21-14-5") plus what the board can't decide by itself:
 * a resignation, an agreed draw, a pending draw offer and a pending rematch offer. Each game supplies OnlineRules
 * that check moves with its own engine (chess.js, or the Rust/wasm rules), so both browsers validate everything.
 */
export type Role = 'host' | 'guest';
export type Ending<Color extends string> = { kind: 'resign'; loser: Color } | { kind: 'draw-agreed' };

export interface OnlineMatch<Color extends string> {
  /** Increases with every rematch, so messages about an older game are ignored. */
  gameNumber: number;
  /** Colour the room's host plays in this game (swaps on rematch). */
  hostColor: Color;
  moves: string[];
  ending: Ending<Color> | null;
  drawOfferFrom: Color | null;
  rematchOfferFrom: Color | null;
}

export interface OnlineRules<Color extends string> {
  gameId: string;
  /** [moves first, moves second] */
  colors: readonly [Color, Color];
  /** Cheap shape check of a move string from the network. */
  isMoveText(value: unknown): value is string;
  /** Every move of the list is legal from the start position. */
  isLegalLine(moves: readonly string[]): boolean;
  /** The move in its normal form if it is legal next (and the board game isn't over), else null. */
  legalMove(moves: readonly string[], move: string): string | null;
  colorToMove(moves: readonly string[]): Color;
  /** Finished on the board (win, draw by the rules). */
  isOverOnBoard(moves: readonly string[]): boolean;
}

export const otherColor = <Color extends string>(rules: OnlineRules<Color>, color: Color): Color =>
  (color === rules.colors[0] ? rules.colors[1] : rules.colors[0]);

export function createOnlineMatch<Color extends string>(rules: OnlineRules<Color>, hostColor: Color = rules.colors[0], gameNumber = 1): OnlineMatch<Color> {
  return { gameNumber, hostColor, moves: [], ending: null, drawOfferFrom: null, rematchOfferFrom: null };
}

/** A guest that hasn't heard from the host uses game 0, so the host's game always wins the first sync. */
export const emptyGuestMatch = <Color extends string>(rules: OnlineRules<Color>) => createOnlineMatch(rules, rules.colors[0], 0);

export const colorOfRole = <Color extends string>(rules: OnlineRules<Color>, match: OnlineMatch<Color>, role: Role): Color =>
  (role === 'host' ? match.hostColor : otherColor(rules, match.hostColor));

export const isMatchOver = <Color extends string>(rules: OnlineRules<Color>, match: OnlineMatch<Color>) =>
  match.ending !== null || rules.isOverOnBoard(match.moves);

/** Add `mover`'s move if it's their turn and legal; clears a pending draw offer. Null otherwise. */
export function applyOnlineMove<Color extends string>(rules: OnlineRules<Color>, match: OnlineMatch<Color>, move: string, mover: Color): OnlineMatch<Color> | null {
  if (match.ending || rules.colorToMove(match.moves) !== mover) return null;
  const normalized = rules.legalMove(match.moves, move);
  if (normalized === null) return null;
  return { ...match, moves: [...match.moves, normalized], drawOfferFrom: null };
}

export function resignMatch<Color extends string>(rules: OnlineRules<Color>, match: OnlineMatch<Color>, loser: Color): OnlineMatch<Color> {
  if (isMatchOver(rules, match)) return match;
  return { ...match, ending: { kind: 'resign', loser }, drawOfferFrom: null };
}

export function offerDraw<Color extends string>(rules: OnlineRules<Color>, match: OnlineMatch<Color>, from: Color): OnlineMatch<Color> {
  if (isMatchOver(rules, match) || match.drawOfferFrom) return match;
  return { ...match, drawOfferFrom: from };
}

/** Only the player the draw was offered to can accept it. */
export function acceptDraw<Color extends string>(rules: OnlineRules<Color>, match: OnlineMatch<Color>, by: Color): OnlineMatch<Color> {
  if (match.drawOfferFrom !== otherColor(rules, by) || isMatchOver(rules, match)) return match;
  return { ...match, ending: { kind: 'draw-agreed' }, drawOfferFrom: null };
}

export const declineDraw = <Color extends string>(match: OnlineMatch<Color>): OnlineMatch<Color> =>
  (match.drawOfferFrom ? { ...match, drawOfferFrom: null } : match);

/** A new game, colours (and so who moves first) swapped. */
export const startRematch = <Color extends string>(rules: OnlineRules<Color>, match: OnlineMatch<Color>): OnlineMatch<Color> =>
  createOnlineMatch(rules, otherColor(rules, match.hostColor), match.gameNumber + 1);

/** Ask for a rematch after the game. If the other player already asked, the new game starts right away. */
export function offerRematch<Color extends string>(rules: OnlineRules<Color>, match: OnlineMatch<Color>, from: Color): OnlineMatch<Color> {
  if (!isMatchOver(rules, match) || match.rematchOfferFrom === from) return match;
  if (match.rematchOfferFrom === otherColor(rules, from)) return startRematch(rules, match);
  return { ...match, rematchOfferFrom: from };
}

export const declineRematch = <Color extends string>(match: OnlineMatch<Color>): OnlineMatch<Color> =>
  (match.rematchOfferFrom ? { ...match, rematchOfferFrom: null } : match);

// ---------- Validation of data from the other browser (or storage) ----------
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isCount = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isInteger(value) && value >= minimum && value < 1e6;

/** Check the shape of a match and that its moves are legal; null otherwise. */
export function parseOnlineMatch<Color extends string>(rules: OnlineRules<Color>, value: unknown): OnlineMatch<Color> | null {
  const isColor = (candidate: unknown): candidate is Color => rules.colors.includes(candidate as Color);
  if (!isRecord(value) || !isCount(value.gameNumber) || !isColor(value.hostColor)) return null;
  if (!Array.isArray(value.moves) || value.moves.length > 2000 || !value.moves.every(move => rules.isMoveText(move))) return null;
  let ending: Ending<Color> | null;
  if (value.ending === null || value.ending === undefined) ending = null;
  else if (isRecord(value.ending) && value.ending.kind === 'draw-agreed') ending = { kind: 'draw-agreed' };
  else if (isRecord(value.ending) && value.ending.kind === 'resign' && isColor(value.ending.loser)) ending = { kind: 'resign', loser: value.ending.loser };
  else return null;
  const drawOfferFrom = value.drawOfferFrom ?? null;
  const rematchOfferFrom = value.rematchOfferFrom ?? null;
  if ((drawOfferFrom !== null && !isColor(drawOfferFrom)) || (rematchOfferFrom !== null && !isColor(rematchOfferFrom))) return null;
  const moves = [...(value.moves as string[])];
  if (!rules.isLegalLine(moves)) return null;
  return { gameNumber: value.gameNumber, hostColor: value.hostColor, moves, ending, drawOfferFrom, rematchOfferFrom };
}
