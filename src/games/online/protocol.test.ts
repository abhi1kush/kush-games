import { describe, expect, it } from 'vitest';
import { applyMove, chessRules, colorToMove, createMatch, MatchState } from '../chess/match';
import { parseChessSave } from '../chess/save';
import { colorOfRole, emptyGuestMatch, parseOnlineMatch } from './match';
import { handleMessage, mergeSync, Message, parseMessage, PROTOCOL_VERSION, syncMessage } from './protocol';
import { createRoomCode, hostPeerId, normalizeRoomCode, ROOM_CODE_ALPHABET, roomCodeFromHash, roomLink } from './room';

const rules = chessRules;
function play(match: MatchState, ...moves: string[]): MatchState {
  return moves.reduce((current, uci) => applyMove(current, uci, colorToMove(current))!.match, match);
}
const handle = (match: MatchState, message: Message, role: 'host' | 'guest') => handleMessage(rules, match, message, role);

describe('rooms', () => {
  it('creates readable 5-character codes', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = createRoomCode();
      expect(code).toHaveLength(5);
      expect([...code].every(character => ROOM_CODE_ALPHABET.includes(character))).toBe(true);
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('normalises codes, reads them from links and keeps a peer id per game', () => {
    expect(normalizeRoomCode(' k7m-2q ')).toBe('K7M2Q');
    expect(normalizeRoomCode('K0M2Q')).toBeNull();
    expect(roomCodeFromHash('#/play/checkers?room=k7m2q')).toBe('K7M2Q');
    expect(roomCodeFromHash('#/play/chess')).toBeNull();
    expect(hostPeerId('chess', 'K7M2Q')).toBe('kushchess-k7m2q'); // unchanged from before the shared module
    expect(hostPeerId('connect-four', 'K7M2Q')).toBe('kushc4-k7m2q');
    expect(hostPeerId('checkers', 'K7M2Q')).toBe('kushcheckers-k7m2q');
    expect(roomLink('connect-four', 'K7M2Q', { origin: 'https://abhi1kush.github.io', pathname: '/kush-games/' }))
      .toBe('https://abhi1kush.github.io/kush-games/#/play/connect-four?room=K7M2Q');
  });

  it('validates saved chess games', () => {
    const match = { ...createMatch('b', 2), moves: ['e2e4'] };
    expect(parseChessSave(JSON.parse(JSON.stringify({ mode: 'online', match, role: 'guest', roomCode: 'K7M2Q' }))))
      .toEqual({ mode: 'online', match, role: 'guest', roomCode: 'K7M2Q' });
    expect(parseChessSave({ mode: 'local', match })).toEqual({ mode: 'local', match });
    expect(parseChessSave({ mode: 'online', match, role: 'spy', roomCode: 'K7M2Q' })).toBeNull();
    expect(parseChessSave({ mode: 'local', match: { ...match, moves: ['e2e5'] } })).toBeNull();
  });
});

describe('protocol messages', () => {
  it('accepts well-formed messages and rejects junk', () => {
    expect(parseMessage(rules, { type: 'move', gameNumber: 1, ply: 0, move: 'e2e4' })).toEqual({ type: 'move', gameNumber: 1, ply: 0, move: 'e2e4' });
    expect(parseMessage(rules, { type: 'hello', protocol: PROTOCOL_VERSION, role: 'guest', game: 'chess' })).not.toBeNull();
    expect(parseMessage(rules, { type: 'rematch-decline', gameNumber: 2 })).toEqual({ type: 'rematch-decline', gameNumber: 2 });
    expect(parseMessage(rules, { type: 'ping', extra: 1 })).toEqual({ type: 'ping' });
    for (const junk of [null, 'e2e4', 42, {}, { type: 'move', gameNumber: 1, ply: -1, move: 'e2e4' },
      { type: 'move', gameNumber: 1, ply: 0, move: 'e2e9' }, { type: 'move', gameNumber: 1, ply: 0, move: '3' }, { type: 'resign' },
      { type: 'launch-missiles', gameNumber: 1 }, { type: 'hello', protocol: 2, role: 'admin', game: 'chess' }]) {
      expect(parseMessage(rules, junk)).toBeNull();
    }
  });

  it('only accepts synced matches with legal moves', () => {
    const match = play(createMatch(), 'e2e4', 'e7e5');
    expect(parseOnlineMatch(rules, JSON.parse(JSON.stringify(match)))).toEqual(match);
    expect(parseOnlineMatch(rules, { ...match, moves: ['e2e4', 'e2e4'] })).toBeNull();
    expect(parseOnlineMatch(rules, { ...match, hostColor: 'red' })).toBeNull();
    expect(parseOnlineMatch(rules, { ...match, ending: { kind: 'resign', loser: 'x' } })).toBeNull();
  });
});

describe('protocol: applying moves and game messages', () => {
  const hostWhite = createMatch('w', 1);

  it('applies the opponent’s next move, ignores duplicates, asks for a sync when out of order or illegal', () => {
    const result = handle(hostWhite, { type: 'move', gameNumber: 1, ply: 0, move: 'e2e4' }, 'guest');
    expect(result.match.moves).toEqual(['e2e4']);
    expect(result.appliedMove).toBe('e2e4');
    const afterE4 = result.match;
    expect(handle(afterE4, { type: 'move', gameNumber: 1, ply: 0, move: 'e2e4' }, 'guest').match).toBe(afterE4);
    expect(handle(afterE4, { type: 'move', gameNumber: 1, ply: 3, move: 'g1f3' }, 'host').replies).toEqual([{ type: 'sync-request' }]);
    expect(handle(afterE4, { type: 'move', gameNumber: 7, ply: 1, move: 'e7e5' }, 'host').replies).toEqual([{ type: 'sync-request' }]);
    const illegal = handle(afterE4, { type: 'move', gameNumber: 1, ply: 1, move: 'e7e4' }, 'host');
    expect(illegal.match).toBe(afterE4);
    expect(illegal.replies[0].type).toBe('sync');
    // the opponent can only move their own pieces
    expect(handle(hostWhite, { type: 'move', gameNumber: 1, ply: 0, move: 'e2e4' }, 'host').match.moves).toEqual([]);
  });

  it('resign and draw messages', () => {
    const started = play(hostWhite, 'e2e4');
    expect(handle(started, { type: 'resign', gameNumber: 1 }, 'host').match.ending).toEqual({ kind: 'resign', loser: 'b' });
    expect(handle(started, { type: 'resign', gameNumber: 0 }, 'host').match).toBe(started); // old game
    const offered = handle(started, { type: 'draw-offer', gameNumber: 1 }, 'host').match;
    expect(offered.drawOfferFrom).toBe('b');
    expect(handle(offered, { type: 'draw-accept', gameNumber: 1 }, 'host').match.ending).toBeNull(); // can't accept a draw offered to them
    const myOffer = { ...started, drawOfferFrom: 'w' as const };
    expect(handle(myOffer, { type: 'draw-accept', gameNumber: 1 }, 'host').match.ending).toEqual({ kind: 'draw-agreed' });
    const declined = handle(myOffer, { type: 'draw-decline', gameNumber: 1 }, 'host');
    expect(declined.match.drawOfferFrom).toBeNull();
    expect(declined.notice).toBe('draw-declined');
    // a move cancels a pending offer
    expect(handle(myOffer, { type: 'move', gameNumber: 1, ply: 1, move: 'e7e5' }, 'host').match.drawOfferFrom).toBeNull();
  });

  it('rematch: needs a finished game, swaps colours, crossing offers start right away, decline clears', () => {
    const started = play(hostWhite, 'e2e4');
    expect(handle(started, { type: 'rematch-offer', gameNumber: 1 }, 'host').match).toBe(started); // still playing
    const finished = { ...started, ending: { kind: 'resign' as const, loser: 'w' as const } };
    const asked = handle(finished, { type: 'rematch-offer', gameNumber: 1 }, 'host');
    expect(asked.match.rematchOfferFrom).toBe('b');
    const crossed = handle({ ...finished, rematchOfferFrom: 'w' }, { type: 'rematch-offer', gameNumber: 1 }, 'host');
    expect(crossed.match).toMatchObject({ gameNumber: 2, hostColor: 'b', moves: [], ending: null });
    expect(crossed.notice).toBe('rematch-started');
    const accepted = handle({ ...finished, rematchOfferFrom: 'w' }, { type: 'rematch-accept', gameNumber: 1 }, 'host').match;
    expect(colorOfRole(rules, accepted, 'host')).toBe('b');
    expect(colorOfRole(rules, accepted, 'guest')).toBe('w');
    const declined = handle({ ...finished, rematchOfferFrom: 'w' }, { type: 'rematch-decline', gameNumber: 1 }, 'host');
    expect(declined.match.rematchOfferFrom).toBeNull();
    expect(declined.notice).toBe('rematch-declined');
  });

  it('rejects a different protocol version or game', () => {
    expect(handle(hostWhite, { type: 'hello', protocol: 99, role: 'guest', game: 'chess' }, 'host').versionMismatch).toBe(true);
    expect(handle(hostWhite, { type: 'hello', protocol: PROTOCOL_VERSION, role: 'guest', game: 'checkers' }, 'host').versionMismatch).toBe(true);
    expect(handle(hostWhite, { type: 'hello', protocol: PROTOCOL_VERSION, role: 'guest', game: 'chess' }, 'host').versionMismatch).toBeUndefined();
  });
});

describe('protocol: full sync on (re)connect', () => {
  const base = play(createMatch('w', 2), 'e2e4', 'e7e5');

  it('a new guest adopts the host’s game', () => {
    expect(mergeSync(emptyGuestMatch(rules), base, 'guest')).toEqual(base);
    expect(mergeSync(base, emptyGuestMatch(rules), 'host')).toEqual(base);
  });

  it('the longer list wins when the other is a prefix; otherwise the host’s', () => {
    const ahead = play(base, 'g1f3');
    expect(mergeSync(base, ahead, 'host').moves).toEqual(ahead.moves);
    expect(mergeSync(ahead, base, 'guest').moves).toEqual(ahead.moves);
    const hostSide = play(base, 'g1f3');
    const guestSide = play(base, 'd2d4');
    expect(mergeSync(hostSide, guestSide, 'host').moves).toEqual(hostSide.moves);
    expect(mergeSync(guestSide, hostSide, 'guest').moves).toEqual(hostSide.moves);
  });

  it('a newer game (rematch) wins, endings and rematch offers are kept', () => {
    const rematch = createMatch('b', 3);
    expect(mergeSync(base, rematch, 'host')).toEqual(rematch);
    expect(mergeSync(rematch, base, 'guest')).toEqual(rematch);
    const resigned = { ...base, ending: { kind: 'resign' as const, loser: 'w' as const }, rematchOfferFrom: 'b' as const };
    expect(mergeSync(base, resigned, 'host')).toMatchObject({ ending: resigned.ending, rematchOfferFrom: 'b' });
  });

  it('replies with the merged match only when the other side differs', () => {
    const ahead = play(base, 'g1f3');
    const behindReceives = handle(base, syncMessage(ahead), 'guest');
    expect(behindReceives.match.moves).toEqual(ahead.moves);
    expect(behindReceives.replies).toEqual([]);
    const aheadReceives = handle(ahead, syncMessage(base), 'host');
    expect(aheadReceives.replies.map(reply => reply.type)).toEqual(['sync']);
  });
});
