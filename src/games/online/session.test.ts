import { describe, expect, it } from 'vitest';
import { chessRules, Color, createMatch, MatchState } from '../chess/match';
import { emptyGuestMatch } from './match';
import { createMemoryLink } from './memoryTransport';
import { RoomSession, SessionUpdate } from './session';

function createPair(hostMatch: MatchState = createMatch('w'), guestMatch: MatchState = emptyGuestMatch(chessRules)) {
  const link = createMemoryLink();
  const hostUpdates: SessionUpdate<Color>[] = [];
  const guestUpdates: SessionUpdate<Color>[] = [];
  const host = new RoomSession(chessRules, 'host', hostMatch, link.host, update => hostUpdates.push(update));
  const guest = new RoomSession(chessRules, 'guest', guestMatch, link.guest, update => guestUpdates.push(update));
  host.start();
  guest.start();
  link.connect();
  link.flush();
  return { link, host, guest, hostUpdates, guestUpdates };
}

/** Fool's mate: black wins after four moves. */
function playFoolsMate(link: ReturnType<typeof createMemoryLink>, white: RoomSession<Color>, black: RoomSession<Color>) {
  for (const [side, move] of [[white, 'f2f3'], [black, 'e7e5'], [white, 'g2g4'], [black, 'd8h4']] as const) {
    expect(side.playMove(move)).toBe(move);
    link.flush();
  }
}

describe('online room sessions (in-memory transport)', () => {
  it('syncs on connect and plays moves both ways', () => {
    const { link, host, guest, guestUpdates } = createPair();
    expect(guest.match.gameNumber).toBe(1);
    expect(guest.color).toBe('b');
    expect(guest.playMove('e7e5')).toBeNull(); // not black's turn yet
    expect(host.playMove('e2e4')).toBe('e2e4');
    link.flush();
    expect(guestUpdates[guestUpdates.length - 1].opponentMove).toBe('e2e4');
    expect(guest.playMove('e7e5')).toBe('e7e5');
    link.flush();
    expect(guest.match).toEqual(host.match);
    expect(link.sent.filter(entry => entry.message.type === 'move').map(entry => entry.message)).toEqual([
      { type: 'move', gameNumber: 1, ply: 0, move: 'e2e4' },
      { type: 'move', gameNumber: 1, ply: 1, move: 'e7e5' },
    ]);
    expect(link.sent.find(entry => entry.message.type === 'hello')?.message).toMatchObject({ protocol: 2, game: 'chess' });
  });

  it('reconnect: a move made while disconnected arrives with the sync', () => {
    const { link, host, guest } = createPair();
    link.disconnect();
    expect(guest.connection.status).toBe('opponent-left');
    host.playMove('e2e4'); // lost: nobody is connected
    link.flush();
    expect(guest.match.moves).toEqual([]);
    link.connect();
    link.flush();
    expect(guest.match.moves).toEqual(['e2e4']);
    expect(guest.connection.status).toBe('connected');
  });

  it('a guest that reloads (restored from its save) converges with the host', () => {
    const { link, host, guest } = createPair();
    host.playMove('e2e4');
    link.flush();
    guest.playMove('c7c5');
    link.flush();
    guest.stop();
    const reloadedLink = createMemoryLink();
    const newHost = new RoomSession(chessRules, 'host', host.match, reloadedLink.host, () => undefined);
    const newGuest = new RoomSession(chessRules, 'guest', JSON.parse(JSON.stringify(guest.match)), reloadedLink.guest, () => undefined);
    newHost.start();
    newGuest.start();
    reloadedLink.connect();
    reloadedLink.flush();
    expect(newGuest.match).toEqual(newHost.match);
    expect(newHost.playMove('g1f3')).not.toBeNull();
    reloadedLink.flush();
    expect(newGuest.match.moves).toHaveLength(3);
  });

  it('draw offer: decline (with notice), auto-cancel on a move, accept', () => {
    const { link, host, guest, hostUpdates } = createPair();
    host.playMove('e2e4');
    link.flush();
    guest.offerDraw();
    guest.offerDraw(); // a second offer is ignored
    link.flush();
    expect(host.match.drawOfferFrom).toBe('b');
    guest.declineDraw(); // can't decline your own offer
    expect(guest.match.drawOfferFrom).toBe('b');
    host.declineDraw();
    link.flush();
    expect(guest.match.drawOfferFrom).toBeNull();
    expect(hostUpdates.some(update => update.notice)).toBe(false);
    host.offerDraw();
    link.flush();
    expect(guest.match.drawOfferFrom).toBe('w');
    guest.playMove('e7e5'); // moving instead of answering cancels the offer
    link.flush();
    expect(host.match.drawOfferFrom).toBeNull();
    expect(guest.match.drawOfferFrom).toBeNull();
    guest.offerDraw();
    link.flush();
    host.acceptDraw();
    link.flush();
    expect(guest.match.ending).toEqual({ kind: 'draw-agreed' });
    expect(host.match).toEqual(guest.match);
  });

  it('resign ends the game on both sides; no more moves', () => {
    const { link, host, guest } = createPair();
    host.playMove('d2d4');
    link.flush();
    guest.resign();
    link.flush();
    expect(host.match.ending).toEqual({ kind: 'resign', loser: 'b' });
    expect(guest.match).toEqual(host.match);
    expect(guest.playMove('d7d5')).toBeNull();
  });

  it('rematch handshake: request → friend sees it → accept starts a swapped game on both ends', () => {
    const { link, host, guest, hostUpdates } = createPair();
    playFoolsMate(link, host, guest);
    expect(host.match.rematchOfferFrom).toBeNull();
    guest.requestRematch();
    link.flush();
    expect(host.match.rematchOfferFrom).toBe('b');
    host.requestRematch(); // "New game" when the friend already asked = accept
    link.flush();
    expect(host.match).toEqual(guest.match);
    expect(host.match).toMatchObject({ gameNumber: 2, hostColor: 'b', moves: [] });
    expect(host.color).toBe('b');
    expect(guest.color).toBe('w');
    expect(guest.playMove('e2e4')).toBe('e2e4');
    link.flush();
    expect(host.match.moves).toEqual(['e2e4']);
    expect(hostUpdates.length).toBeGreaterThan(0);
  });

  it('rematch: both press New game at once → one new game; decline tells the asker', () => {
    const { link, host, guest, hostUpdates } = createPair();
    playFoolsMate(link, host, guest);
    host.requestRematch();
    guest.requestRematch(); // crossing offers, nothing delivered yet
    link.flush();
    expect(host.match.gameNumber).toBe(2);
    expect(guest.match).toEqual(host.match);
    // game 2: host is black now. Finish it with a resignation and decline the rematch.
    host.resign();
    link.flush();
    host.requestRematch();
    link.flush();
    expect(guest.match.rematchOfferFrom).toBe('b');
    guest.declineRematch();
    link.flush();
    expect(host.match.rematchOfferFrom).toBeNull();
    expect(hostUpdates[hostUpdates.length - 1].notice).toBe('rematch-declined');
    expect(host.match.gameNumber).toBe(2);
    // asking again still works
    host.requestRematch();
    link.flush();
    guest.acceptRematch();
    link.flush();
    expect(guest.match).toMatchObject({ gameNumber: 3, hostColor: 'w' });
    expect(host.match).toEqual(guest.match);
  });

  it('ignores garbage from the other side', () => {
    const { link, guest } = createPair();
    const before = guest.match;
    (link.host as unknown as { send: (data: unknown) => boolean }).send({ type: 'move', gameNumber: 1, ply: 0, move: 'e2e5' });
    (link.host as unknown as { send: (data: unknown) => boolean }).send('hello?');
    link.flush();
    expect(guest.match.moves).toEqual(before.moves);
  });
});
