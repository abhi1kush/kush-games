/**
 * Which screen a game with an online mode shows: its normal (local) game, the online lobby, or a room.
 * Opening a room link joins it; a saved room is rejoined after a refresh; leaving clears the room save.
 */
import { useCallback, useEffect, useState } from 'react';
import type { SaveSlot } from '../persistence';
import { createOnlineMatch, emptyGuestMatch, OnlineMatch, OnlineRules, Role } from './match';
import { createRoomCode, roomCodeFromHash, roomHash } from './room';
import type { SavedOnlineRoom } from './save';

export type OnlineScreen<Color extends string> =
  | { kind: 'local' }
  | { kind: 'lobby' }
  | { kind: 'room'; role: Role; roomCode: string; initialMatch: OnlineMatch<Color>; isRestored: boolean };

function initialScreen<Color extends string>(rules: OnlineRules<Color>, saved: SavedOnlineRoom<Color> | null): OnlineScreen<Color> {
  const linkedRoom = roomCodeFromHash(window.location.hash);
  if (linkedRoom && saved?.roomCode !== linkedRoom) {
    return { kind: 'room', role: 'guest', roomCode: linkedRoom, initialMatch: emptyGuestMatch(rules), isRestored: false };
  }
  if (saved) return { kind: 'room', role: saved.role, roomCode: saved.roomCode, initialMatch: saved.match, isRestored: true };
  return { kind: 'local' };
}

export function useOnlineScreen<Color extends string>(rules: OnlineRules<Color>, slot: SaveSlot<SavedOnlineRoom<Color>>) {
  const [screen, setScreen] = useState<OnlineScreen<Color>>(() => initialScreen(rules, slot.load()));

  const joinRoom = useCallback((roomCode: string) => {
    setScreen({ kind: 'room', role: 'guest', roomCode, initialMatch: emptyGuestMatch(rules), isRestored: false });
    if (roomCodeFromHash(window.location.hash) !== roomCode) window.history.replaceState(null, '', roomHash(rules.gameId, roomCode));
  }, [rules]);

  /** The host plays the first colour in game 1 (Red / Dark); colours swap with every rematch. */
  const createRoom = useCallback(() => {
    const roomCode = createRoomCode();
    setScreen({ kind: 'room', role: 'host', roomCode, initialMatch: createOnlineMatch(rules), isRestored: false });
  }, [rules]);

  const showLobby = useCallback(() => setScreen({ kind: 'lobby' }), []);

  const showLocal = useCallback(() => {
    slot.clear();
    setScreen({ kind: 'local' });
    if (roomCodeFromHash(window.location.hash)) window.history.replaceState(null, '', `#/play/${rules.gameId}`);
  }, [rules, slot]);

  useEffect(() => {
    const handleHashChange = () => {
      const code = roomCodeFromHash(window.location.hash);
      if (code && !(screen.kind === 'room' && screen.roomCode === code)) joinRoom(code);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [screen, joinRoom]);

  return { screen, joinRoom, createRoom, showLobby, showLocal };
}
