/**
 * Messages between two browsers in an online room, and the pure rules for handling them.
 *
 * - Moves are sent as UCI + SAN with their ply number (0 = White's first move) and game number.
 *   The receiver checks them with chess.js; anything out of order, illegal or from an old game
 *   triggers a full sync instead of being applied.
 * - On every (re)connect both sides send `sync` with their whole match (moves + FEN). The merge
 *   rule makes both converge: a newer game wins; in the same game the longer move list wins if
 *   the other is a prefix of it; if the lists disagree, the host's version wins.
 */
import {
  acceptDraw, applyMove, Color, createMatch, declineDraw, Ending, isUciMove, MatchState, offerDraw, offerRematch, opposite,
  replayMoves, resign, startRematch,
} from './match';

export const PROTOCOL_VERSION = 1;
export type Role = 'host' | 'guest';

export type Message =
  | { type: 'hello'; protocol: number; role: Role }
  | { type: 'sync'; match: MatchState; fen: string }
  | { type: 'sync-request' }
  | { type: 'move'; gameNumber: number; ply: number; uci: string; san: string }
  | { type: 'resign'; gameNumber: number }
  | { type: 'draw-offer'; gameNumber: number }
  | { type: 'draw-accept'; gameNumber: number }
  | { type: 'draw-decline'; gameNumber: number }
  | { type: 'rematch-offer'; gameNumber: number }
  | { type: 'rematch-accept'; gameNumber: number }
  | { type: 'ping' };

/** The colour this side plays in the current game. */
export const myColor = (match: MatchState, role: Role): Color => (role === 'host' ? match.hostColor : opposite(match.hostColor));

// ---------- Validation of incoming data ----------
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isInteger(value) && value >= minimum && value < 1e6;
const isColor = (value: unknown): value is Color => value === 'w' || value === 'b';

function parseEnding(value: unknown): Ending | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (value.kind === 'draw-agreed') return { kind: 'draw-agreed' };
  if (value.kind === 'resign' && isColor(value.loser)) return { kind: 'resign', loser: value.loser };
  return undefined;
}

/** Check the shape of a match and that its moves are legal; null otherwise. */
export function parseMatch(value: unknown): MatchState | null {
  if (!isRecord(value) || !isCount(value.gameNumber) || !isColor(value.hostColor)) return null;
  if (!Array.isArray(value.moves) || value.moves.length > 2000 || !value.moves.every(isUciMove)) return null;
  const ending = parseEnding(value.ending);
  if (ending === undefined) return null;
  const drawOfferFrom = value.drawOfferFrom ?? null;
  const rematchOfferFrom = value.rematchOfferFrom ?? null;
  if ((drawOfferFrom !== null && !isColor(drawOfferFrom)) || (rematchOfferFrom !== null && !isColor(rematchOfferFrom))) return null;
  if (!replayMoves(value.moves as string[])) return null;
  return { gameNumber: value.gameNumber, hostColor: value.hostColor, moves: [...(value.moves as string[])], ending, drawOfferFrom, rematchOfferFrom };
}

const GAME_MESSAGES = ['resign', 'draw-offer', 'draw-accept', 'draw-decline', 'rematch-offer', 'rematch-accept'] as const;

/** Turn untrusted data from the other browser into a Message, or null. */
export function parseMessage(data: unknown): Message | null {
  if (!isRecord(data) || typeof data.type !== 'string') return null;
  switch (data.type) {
    case 'hello':
      return isCount(data.protocol, 1) && (data.role === 'host' || data.role === 'guest') ? { type: 'hello', protocol: data.protocol, role: data.role } : null;
    case 'sync': {
      const match = parseMatch(data.match);
      return match && typeof data.fen === 'string' ? { type: 'sync', match, fen: data.fen } : null;
    }
    case 'sync-request':
    case 'ping':
      return { type: data.type };
    case 'move':
      return isCount(data.gameNumber) && isCount(data.ply) && isUciMove(data.uci) && typeof data.san === 'string'
        ? { type: 'move', gameNumber: data.gameNumber, ply: data.ply, uci: data.uci, san: data.san.slice(0, 12) } : null;
    default:
      if ((GAME_MESSAGES as readonly string[]).includes(data.type) && isCount(data.gameNumber)) {
        return { type: data.type as (typeof GAME_MESSAGES)[number], gameNumber: data.gameNumber };
      }
      return null;
  }
}

export function syncMessage(match: MatchState): Message {
  return { type: 'sync', match, fen: replayMoves(match.moves)?.fen() ?? '' };
}

const isPrefix = (shorter: readonly string[], longer: readonly string[]) =>
  shorter.length <= longer.length && shorter.every((move, index) => longer[index] === move);

/** Combine our match with the other side's `sync`. Both sides running this converge on the same state. */
export function mergeSync(local: MatchState, remote: MatchState, localRole: Role): MatchState {
  if (remote.gameNumber > local.gameNumber) return remote;
  if (remote.gameNumber < local.gameNumber) return local;
  const hostVersion = localRole === 'host' ? local : remote;
  let moves: string[];
  if (isPrefix(local.moves, remote.moves)) moves = remote.moves;
  else if (isPrefix(remote.moves, local.moves)) moves = local.moves;
  else moves = hostVersion.moves;
  const sameAsRemote = moves === remote.moves;
  const base = sameAsRemote ? remote : local;
  return {
    gameNumber: local.gameNumber,
    hostColor: hostVersion.hostColor,
    moves: [...moves],
    ending: local.ending ?? remote.ending ?? null,
    drawOfferFrom: base.drawOfferFrom,
    rematchOfferFrom: local.rematchOfferFrom ?? remote.rematchOfferFrom,
  };
}

export interface HandleResult {
  match: MatchState;
  /** Messages to send back. */
  replies: Message[];
  /** Set when an opponent's move was applied (for sounds/highlights). */
  appliedMove?: string;
  /** A different protocol version on the other side. */
  versionMismatch?: boolean;
}

/** React to one message from the opponent. Pure: returns the new match and any replies. */
export function handleMessage(match: MatchState, message: Message, role: Role): HandleResult {
  const opponent = opposite(myColor(match, role));
  const unchanged: HandleResult = { match, replies: [] };
  const isCurrentGame = 'gameNumber' in message && message.gameNumber === match.gameNumber;
  switch (message.type) {
    case 'hello':
      return message.protocol === PROTOCOL_VERSION ? unchanged : { ...unchanged, versionMismatch: true };
    case 'ping':
      return unchanged;
    case 'sync-request':
      return { match, replies: [syncMessage(match)] };
    case 'sync': {
      const merged = mergeSync(match, message.match, role);
      // If the other side is behind (or disagrees), tell them what we ended up with.
      const otherSideMatches = JSON.stringify(merged) === JSON.stringify(message.match);
      return { match: merged, replies: otherSideMatches ? [] : [syncMessage(merged)] };
    }
    case 'move': {
      if (!isCurrentGame) return { match, replies: [{ type: 'sync-request' }] };
      if (message.ply < match.moves.length && match.moves[message.ply] === message.uci) return unchanged; // duplicate
      if (message.ply !== match.moves.length) return { match, replies: [{ type: 'sync-request' }] };
      const result = applyMove(match, message.uci, opponent);
      if (!result) return { match, replies: [syncMessage(match)] };
      return { match: result.match, replies: [], appliedMove: message.uci };
    }
    case 'resign':
      return isCurrentGame ? { match: resign(match, opponent), replies: [] } : unchanged;
    case 'draw-offer':
      return isCurrentGame ? { match: offerDraw(match, opponent), replies: [] } : unchanged;
    case 'draw-accept':
      return isCurrentGame && match.drawOfferFrom === myColor(match, role) ? { match: acceptDraw(match, opponent), replies: [] } : unchanged;
    case 'draw-decline':
      return isCurrentGame ? { match: declineDraw(match), replies: [] } : unchanged;
    case 'rematch-offer':
      return isCurrentGame ? { match: offerRematch(match, opponent), replies: [] } : unchanged;
    case 'rematch-accept':
      return isCurrentGame ? { match: startRematch(match), replies: [] } : unchanged;
    default:
      return unchanged;
  }
}

/** A guest that hasn't heard from the host yet uses game 0, so the host's game always wins the first sync. */
export const emptyGuestMatch = (): MatchState => createMatch('w', 0);
