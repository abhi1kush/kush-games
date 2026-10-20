import { describe, expect, it } from 'vitest';
import { createMatch, MatchState } from './match';
import { createMemoryLink } from './memoryTransport';
import { emptyGuestMatch } from './protocol';
import { RoomSession, SessionUpdate } from './session';

function createPair(hostMatch: MatchState = createMatch('w'), guestMatch: MatchState = emptyGuestMatch()) {
  const link = createMemoryLink();
  const hostUpdates: SessionUpdate[] = [];
  const guestUpdates: SessionUpdate[] = [];
  const host = new RoomSession('host', hostMatch, link.host, update => hostUpdates.push(update));
  const guest = new RoomSession('guest', guestMatch, link.guest, update => guestUpdates.push(update));
  host.start();
  guest.start();
  return { link, host, guest, hostUpdates, guestUpdates };
}

describe('online room sessions (in-memory transport)', () => {
  it('syncs on connect and plays moves both ways', () => {
    const { link, host, guest, guestUpdates } = createPair();
    expect(host.connection.status).toBe('waiting');
    link.connect();
    link.flush();
    expect(guest.match.gameNumber).toBe(1);
    expect(guest.color).toBe('b');
    expect(host.color).toBe('w');
    expect(guest.playMove('e7e5')).toBeNull(); // not black's turn yet
    expect(host.playMove('e2e4')?.san).toBe('e4');
    link.flush();
    expect(guestUpdates[guestUpdates.length - 1].opponentMove).toBe('e2e4');
    expect(guest.playMove('e7e5')?.san).toBe('e5');
    link.flush();
    expect(host.match.moves).toEqual(['e2e4', 'e7e5']);
    expect(guest.match).toEqual(host.match);
    const moveMessages = link.sent.filter(entry => entry.message.type === 'move').map(entry => entry.message);
    expect(moveMessages).toEqual([
      { type: 'move', gameNumber: 1, ply: 0, uci: 'e2e4', san: 'e4' },
      { type: 'move', gameNumber: 1, ply: 1, uci: 'e7e5', san: 'e5' },
    ]);
  });

  it('host can play black', () => {
    const { link, host, guest } = createPair(createMatch('b'));
    link.connect();
    link.flush();
    expect(host.color).toBe('b');
    expect(guest.color).toBe('w');
    expect(guest.playMove('d2d4')).not.toBeNull();
    link.flush();
    expect(host.match.moves).toEqual(['d2d4']);
  });

  it('a move made while disconnected arrives with the sync on reconnect', () => {
    const { link, host, guest } = createPair();
    link.connect();
    link.flush();
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
    link.connect();
    link.flush();
    host.playMove('e2e4');
    link.flush();
    guest.playMove('c7c5');
    link.flush();
    // the guest page reloads: a new session starts from the saved match
    guest.stop();
    const reloadedLink = createMemoryLink();
    const savedGuestMatch = JSON.parse(JSON.stringify(guest.match));
    const newHost = new RoomSession('host', host.match, reloadedLink.host, () => undefined);
    const newGuest = new RoomSession('guest', savedGuestMatch, reloadedLink.guest, () => undefined);
    newHost.start();
    newGuest.start();
    reloadedLink.connect();
    reloadedLink.flush();
    expect(newGuest.match).toEqual(newHost.match);
    expect(newGuest.match.moves).toEqual(['e2e4', 'c7c5']);
    expect(newHost.playMove('g1f3')).not.toBeNull();
    reloadedLink.flush();
    expect(newGuest.match.moves).toHaveLength(3);
  });

  it('resign, draw and rematch (colours swap)', () => {
    const { link, host, guest } = createPair();
    link.connect();
    link.flush();
    host.playMove('e2e4');
    link.flush();
    guest.offerDraw();
    link.flush();
    expect(host.match.drawOfferFrom).toBe('b');
    host.declineDraw();
    link.flush();
    expect(guest.match.drawOfferFrom).toBeNull();
    guest.offerDraw();
    link.flush();
    host.acceptDraw();
    link.flush();
    expect(guest.match.ending).toEqual({ kind: 'draw-agreed' });
    guest.offerRematch();
    link.flush();
    expect(host.match.rematchOfferFrom).toBe('b');
    host.acceptRematch();
    link.flush();
    expect(host.match).toEqual(guest.match);
    expect(host.match.gameNumber).toBe(2);
    expect(host.color).toBe('b');
    expect(guest.color).toBe('w');
    guest.playMove('d2d4');
    link.flush();
    host.resign();
    link.flush();
    expect(guest.match.ending).toEqual({ kind: 'resign', loser: 'b' });
  });

  it('ignores garbage from the other side', () => {
    const { link, guest } = createPair();
    link.connect();
    link.flush();
    const before = guest.match;
    (link.host as unknown as { send: (data: unknown) => boolean }).send({ type: 'move', gameNumber: 1, ply: 0, uci: 'e2e5', san: '??' });
    (link.host as unknown as { send: (data: unknown) => boolean }).send('hello?');
    link.flush();
    expect(guest.match.moves).toEqual(before.moves);
  });
});
