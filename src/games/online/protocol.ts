/**
 * Messages between the two browsers of a room, and the pure rules for handling them (same for every game).
 *
 * - Moves carry their ply number (0 = first move) and game number; the receiver checks them with the game's own
 *   rules. Anything out of order, illegal or from another game triggers a full sync instead of being applied.
 * - On every (re)connect both sides send `sync` with their whole match. The merge makes both converge: a newer game
 *   wins; in the same game the longer move list wins if the other is a prefix of it; otherwise the host's version wins.
 */
import {
  acceptDraw, applyOnlineMove, colorOfRole, declineDraw, declineRematch, isCount, isMatchOver, isRecord, offerDraw, offerRematch,
  OnlineMatch, OnlineRules, otherColor, parseOnlineMatch, resignMatch, Role, startRematch,
} from './match';

export const PROTOCOL_VERSION = 2;

const GAME_MESSAGE_TYPES = ['resign', 'draw-offer', 'draw-accept', 'draw-decline', 'rematch-offer', 'rematch-accept', 'rematch-decline'] as const;
export type GameMessageType = (typeof GAME_MESSAGE_TYPES)[number];

export type Message =
  | { type: 'hello'; protocol: number; role: Role; game: string }
  | { type: 'sync'; match: OnlineMatch<string> }
  | { type: 'sync-request' }
  | { type: 'move'; gameNumber: number; ply: number; move: string }
  | { type: GameMessageType; gameNumber: number }
  | { type: 'ping' };

/** Something worth telling the player that isn't part of the match itself. */
export type Notice = 'draw-declined' | 'rematch-declined' | 'rematch-started';

/** Turn untrusted data from the other browser into a Message, or null. */
export function parseMessage<Color extends string>(rules: OnlineRules<Color>, data: unknown): Message | null {
  if (!isRecord(data) || typeof data.type !== 'string') return null;
  switch (data.type) {
    case 'hello':
      return isCount(data.protocol, 1) && (data.role === 'host' || data.role === 'guest') && typeof data.game === 'string'
        ? { type: 'hello', protocol: data.protocol, role: data.role, game: data.game } : null;
    case 'sync': {
      const match = parseOnlineMatch(rules, data.match);
      return match ? { type: 'sync', match } : null;
    }
    case 'sync-request':
    case 'ping':
      return { type: data.type };
    case 'move':
      return isCount(data.gameNumber) && isCount(data.ply) && rules.isMoveText(data.move)
        ? { type: 'move', gameNumber: data.gameNumber, ply: data.ply, move: data.move } : null;
    default:
      return (GAME_MESSAGE_TYPES as readonly string[]).includes(data.type) && isCount(data.gameNumber)
        ? { type: data.type as GameMessageType, gameNumber: data.gameNumber } : null;
  }
}

export const syncMessage = <Color extends string>(match: OnlineMatch<Color>): Message => ({ type: 'sync', match });

const isPrefix = (shorter: readonly string[], longer: readonly string[]) =>
  shorter.length <= longer.length && shorter.every((move, index) => longer[index] === move);

/** Combine our match with the other side's `sync`. Both sides running this converge on the same state. */
export function mergeSync<Color extends string>(local: OnlineMatch<Color>, remote: OnlineMatch<Color>, localRole: Role): OnlineMatch<Color> {
  if (remote.gameNumber > local.gameNumber) return remote;
  if (remote.gameNumber < local.gameNumber) return local;
  const hostVersion = localRole === 'host' ? local : remote;
  let moves: string[];
  if (isPrefix(local.moves, remote.moves)) moves = remote.moves;
  else if (isPrefix(remote.moves, local.moves)) moves = local.moves;
  else moves = hostVersion.moves;
  const base = moves === remote.moves ? remote : local;
  return {
    gameNumber: local.gameNumber,
    hostColor: hostVersion.hostColor,
    moves: [...moves],
    ending: local.ending ?? remote.ending ?? null,
    drawOfferFrom: base.drawOfferFrom,
    rematchOfferFrom: local.rematchOfferFrom ?? remote.rematchOfferFrom,
  };
}

export interface HandleResult<Color extends string> {
  match: OnlineMatch<Color>;
  /** Messages to send back. */
  replies: Message[];
  /** The opponent's move that was just applied. */
  appliedMove?: string;
  notice?: Notice;
  /** The other side runs a different protocol version or game. */
  versionMismatch?: boolean;
}

/** React to one message from the opponent. Pure: returns the new match and any replies. */
export function handleMessage<Color extends string>(rules: OnlineRules<Color>, match: OnlineMatch<Color>, message: Message, role: Role): HandleResult<Color> {
  const mine = colorOfRole(rules, match, role);
  const opponent = otherColor(rules, mine);
  const unchanged: HandleResult<Color> = { match, replies: [] };
  const isCurrentGame = 'gameNumber' in message && message.gameNumber === match.gameNumber;
  switch (message.type) {
    case 'hello':
      return message.protocol === PROTOCOL_VERSION && message.game === rules.gameId ? unchanged : { ...unchanged, versionMismatch: true };
    case 'ping':
      return unchanged;
    case 'sync-request':
      return { match, replies: [syncMessage(match)] };
    case 'sync': {
      const merged = mergeSync(match, message.match as OnlineMatch<Color>, role);
      const otherSideMatches = JSON.stringify(merged) === JSON.stringify(message.match);
      return { match: merged, replies: otherSideMatches ? [] : [syncMessage(merged)] };
    }
    case 'move': {
      if (!isCurrentGame) return { match, replies: [{ type: 'sync-request' }] };
      if (message.ply < match.moves.length && match.moves[message.ply] === message.move) return unchanged; // duplicate
      if (message.ply !== match.moves.length) return { match, replies: [{ type: 'sync-request' }] };
      const next = applyOnlineMove(rules, match, message.move, opponent);
      if (!next) return { match, replies: [syncMessage(match)] };
      return { match: next, replies: [], appliedMove: next.moves[message.ply] };
    }
    case 'resign':
      return isCurrentGame ? { match: resignMatch(rules, match, opponent), replies: [] } : unchanged;
    case 'draw-offer':
      return isCurrentGame ? { match: offerDraw(rules, match, opponent), replies: [] } : unchanged;
    case 'draw-accept':
      return isCurrentGame ? { match: acceptDraw(rules, match, opponent), replies: [] } : unchanged;
    case 'draw-decline':
      return isCurrentGame && match.drawOfferFrom === mine ? { match: declineDraw(match), replies: [], notice: 'draw-declined' } : unchanged;
    case 'rematch-offer': {
      if (!isCurrentGame) return unchanged;
      const next = offerRematch(rules, match, opponent);
      // both asked at the same time: the new game starts on both sides without another round trip
      return { match: next, replies: [], notice: next.gameNumber !== match.gameNumber ? 'rematch-started' : undefined };
    }
    case 'rematch-accept':
      return isCurrentGame && isMatchOver(rules, match) ? { match: startRematch(rules, match), replies: [], notice: 'rematch-started' } : unchanged;
    case 'rematch-decline':
      return isCurrentGame && match.rematchOfferFrom === mine ? { match: declineRematch(match), replies: [], notice: 'rematch-declined' } : unchanged;
    default:
      return unchanged;
  }
}
