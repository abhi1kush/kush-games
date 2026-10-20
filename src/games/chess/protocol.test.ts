import { describe, expect, it } from 'vitest';
import { applyMove, colorToMove, createMatch, MatchState } from './match';
import { emptyGuestMatch, handleMessage, mergeSync, Message, myColor, parseMatch, parseMessage, PROTOCOL_VERSION, syncMessage } from './protocol';

function play(match: MatchState, ...moves: string[]): MatchState {
  return moves.reduce((current, uci) => applyMove(current, uci, colorToMove(current))!.match, match);
}

describe('chess protocol messages', () => {
  it('accepts well-formed messages and rejects junk', () => {
    expect(parseMessage({ type: 'move', gameNumber: 1, ply: 0, uci: 'e2e4', san: 'e4' })).toEqual({ type: 'move', gameNumber: 1, ply: 0, uci: 'e2e4', san: 'e4' });
    expect(parseMessage({ type: 'hello', protocol: PROTOCOL_VERSION, role: 'guest' })).not.toBeNull();
    expect(parseMessage({ type: 'resign', gameNumber: 2 })).toEqual({ type: 'resign', gameNumber: 2 });
    expect(parseMessage({ type: 'ping', extra: 1 })).toEqual({ type: 'ping' });
    for (const junk of [null, 'e2e4', 42, {}, { type: 'move', gameNumber: 1, ply: -1, uci: 'e2e4', san: 'e4' },
      { type: 'move', gameNumber: 1, ply: 0, uci: 'e2e9', san: 'x' }, { type: 'resign' }, { type: 'launch-missiles', gameNumber: 1 },
      { type: 'hello', protocol: 1, role: 'admin' }]) {
      expect(parseMessage(junk)).toBeNull();
    }
  });

  it('only accepts synced matches with legal moves', () => {
    const match = play(createMatch(), 'e2e4', 'e7e5');
    expect(parseMatch(JSON.parse(JSON.stringify(match)))).toEqual(match);
    expect(parseMatch({ ...match, moves: ['e2e4', 'e2e4'] })).toBeNull();
    expect(parseMatch({ ...match, hostColor: 'red' })).toBeNull();
    expect(parseMatch({ ...match, ending: { kind: 'resign', loser: 'x' } })).toBeNull();
    const sync = syncMessage(match);
    expect(sync.type === 'sync' && sync.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  });
});

describe('chess protocol: applying moves', () => {
  const hostWhite = createMatch('w', 1);

  it('applies the opponent’s next move', () => {
    const result = handleMessage(hostWhite, { type: 'move', gameNumber: 1, ply: 0, uci: 'e2e4', san: 'e4' }, 'guest');
    expect(result.match.moves).toEqual(['e2e4']);
    expect(result.appliedMove).toBe('e2e4');
    expect(result.replies).toEqual([]);
  });

  it('ignores duplicates and asks for a sync when out of order, from another game, or illegal', () => {
    const afterE4 = play(hostWhite, 'e2e4');
    expect(handleMessage(afterE4, { type: 'move', gameNumber: 1, ply: 0, uci: 'e2e4', san: 'e4' }, 'guest').match).toBe(afterE4);
    expect(handleMessage(afterE4, { type: 'move', gameNumber: 1, ply: 3, uci: 'g1f3', san: 'Nf3' }, 'host').replies).toEqual([{ type: 'sync-request' }]);
    expect(handleMessage(afterE4, { type: 'move', gameNumber: 7, ply: 1, uci: 'e7e5', san: 'e5' }, 'host').replies).toEqual([{ type: 'sync-request' }]);
    const illegal = handleMessage(afterE4, { type: 'move', gameNumber: 1, ply: 1, uci: 'e7e4', san: 'e4' }, 'host');
    expect(illegal.match).toBe(afterE4);
    expect(illegal.replies[0].type).toBe('sync');
  });

  it('refuses a move for the wrong colour (the opponent can only move their own pieces)', () => {
    // host plays white: a "move" from the guest on white's turn is rejected
    const result = handleMessage(hostWhite, { type: 'move', gameNumber: 1, ply: 0, uci: 'e2e4', san: 'e4' }, 'host');
    expect(result.match.moves).toEqual([]);
  });

  it('handles resign, draw offers and rematch from the opponent', () => {
    const started = play(hostWhite, 'e2e4');
    expect(handleMessage(started, { type: 'resign', gameNumber: 1 }, 'host').match.ending).toEqual({ kind: 'resign', loser: 'b' });
    expect(handleMessage(started, { type: 'resign', gameNumber: 0 }, 'host').match).toBe(started); // old game
    const offered = handleMessage(started, { type: 'draw-offer', gameNumber: 1 }, 'host').match;
    expect(offered.drawOfferFrom).toBe('b');
    // an accept is only valid for our own offer
    expect(handleMessage(offered, { type: 'draw-accept', gameNumber: 1 }, 'host').match.ending).toBeNull();
    const myOffer = { ...started, drawOfferFrom: 'w' as const };
    expect(handleMessage(myOffer, { type: 'draw-accept', gameNumber: 1 }, 'host').match.ending).toEqual({ kind: 'draw-agreed' });
    const rematch = handleMessage(started, { type: 'rematch-accept', gameNumber: 1 }, 'host').match;
    expect(rematch).toMatchObject({ gameNumber: 2, hostColor: 'b', moves: [] });
    expect(myColor(rematch, 'host')).toBe('b');
    expect(myColor(rematch, 'guest')).toBe('w');
  });

  it('rejects a different protocol version', () => {
    expect(handleMessage(hostWhite, { type: 'hello', protocol: 99, role: 'guest' }, 'host').versionMismatch).toBe(true);
  });
});

describe('chess protocol: full sync on (re)connect', () => {
  const base = play(createMatch('w', 2), 'e2e4', 'e7e5');

  it('a new guest adopts the host’s game', () => {
    expect(mergeSync(emptyGuestMatch(), base, 'guest')).toEqual(base);
    expect(mergeSync(base, emptyGuestMatch(), 'host')).toEqual(base);
  });

  it('the longer move list wins when the other is a prefix (a move was lost while disconnected)', () => {
    const ahead = play(base, 'g1f3');
    expect(mergeSync(base, ahead, 'host').moves).toEqual(ahead.moves);
    expect(mergeSync(ahead, base, 'guest').moves).toEqual(ahead.moves);
  });

  it('the host’s version wins when the move lists disagree, on both sides', () => {
    const hostSide = play(base, 'g1f3');
    const guestSide = play(base, 'd2d4');
    expect(mergeSync(hostSide, guestSide, 'host').moves).toEqual(hostSide.moves);
    expect(mergeSync(guestSide, hostSide, 'guest').moves).toEqual(hostSide.moves);
  });

  it('a newer game (rematch) wins and endings are kept', () => {
    const rematch = createMatch('b', 3);
    expect(mergeSync(base, rematch, 'host')).toEqual(rematch);
    expect(mergeSync(rematch, base, 'guest')).toEqual(rematch);
    const resigned = { ...base, ending: { kind: 'resign' as const, loser: 'w' as const } };
    expect(mergeSync(base, resigned, 'host').ending).toEqual(resigned.ending);
  });

  it('replies with the merged match only when the other side differs', () => {
    const ahead = play(base, 'g1f3');
    const behindReceives = handleMessage(base, syncMessage(ahead) as Extract<Message, { type: 'sync' }>, 'guest');
    expect(behindReceives.match.moves).toEqual(ahead.moves);
    expect(behindReceives.replies).toEqual([]);
    const aheadReceives = handleMessage(ahead, syncMessage(base), 'host');
    expect(aheadReceives.match.moves).toEqual(ahead.moves);
    expect(aheadReceives.replies.map(reply => reply.type)).toEqual(['sync']);
  });
});
