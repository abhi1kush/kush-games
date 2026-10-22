/**
 * React side of an online room: runs a RoomSession for the lifetime of the component (render it with
 * `key={role + roomCode}` so a new room gets a fresh hook), mirrors its match and connection into state,
 * saves the room after every change and fires sound/announcement callbacks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTransport } from './createTransport';
import { colorOfRole, isMatchOver, OnlineMatch, OnlineRules, Role } from './match';
import type { Notice } from './protocol';
import type { SavedOnlineRoom } from './save';
import { RoomSession } from './session';
import type { ConnectionInfo } from './transport';

export interface OnlineRoomOptions<Color extends string> {
  rules: OnlineRules<Color>;
  role: Role;
  roomCode: string;
  initialMatch: OnlineMatch<Color>;
  save(room: SavedOnlineRoom<Color>): void;
  onOpponentMove?(move: string, match: OnlineMatch<Color>): void;
  onConnected?(): void;
  /** The current game just finished (board result, resignation or agreed draw). */
  onGameOver?(match: OnlineMatch<Color>): void;
}

export interface OnlineRoomActions {
  playMove(move: string): string | null;
  resign(): void;
  offerDraw(): void;
  acceptDraw(): void;
  declineDraw(): void;
  /** "New game": accept the friend's rematch request, or ask for one. */
  requestRematch(): void;
  declineRematch(): void;
}

const NOTICE_MS = 4500;

export function useOnlineRoom<Color extends string>(options: OnlineRoomOptions<Color>) {
  const { rules, role, roomCode } = options;
  const [match, setMatch] = useState(options.initialMatch);
  const [connection, setConnection] = useState<ConnectionInfo>({ status: 'starting' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const sessionRef = useRef<RoomSession<Color> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const session = new RoomSession(rules, role, optionsRef.current.initialMatch, createTransport(role, roomCode, rules.gameId), update => {
      setMatch(current => (current === update.match ? current : update.match));
      setConnection(current => (current.status === update.connection.status && current.problem === update.connection.problem ? current : update.connection));
      if (update.notice && update.notice !== 'rematch-started') setNotice(update.notice);
      if (update.opponentMove) optionsRef.current.onOpponentMove?.(update.opponentMove, update.match);
    });
    sessionRef.current = session;
    session.start();
    return () => { session.stop(); if (sessionRef.current === session) sessionRef.current = null; };
  }, [rules, role, roomCode]);

  // Save every change so a refresh rejoins the same room with the same game.
  useEffect(() => { optionsRef.current.save({ mode: 'online', role, roomCode, match }); }, [match, role, roomCode]);

  // Connected chime (only on a change to connected, not on every render).
  const wasConnectedRef = useRef(false);
  useEffect(() => {
    const isConnected = connection.status === 'connected';
    if (isConnected && !wasConnectedRef.current) optionsRef.current.onConnected?.();
    wasConnectedRef.current = isConnected;
  }, [connection.status]);

  // Game over announcement, once per game (not when a finished game is restored).
  const isOver = isMatchOver(rules, match);
  const finishedGameRef = useRef(isOver ? match.gameNumber : -1);
  useEffect(() => {
    if (!isOver || finishedGameRef.current === match.gameNumber) return;
    finishedGameRef.current = match.gameNumber;
    optionsRef.current.onGameOver?.(match);
  }, [isOver, match]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  // A new game (or a new offer) makes an old notice irrelevant.
  useEffect(() => { setNotice(null); }, [match.gameNumber]);

  const run = useCallback((action: (session: RoomSession<Color>) => void) => {
    const session = sessionRef.current;
    if (session) { setNotice(null); action(session); }
  }, []);
  const actions: OnlineRoomActions = useMemo(() => ({
    playMove: move => sessionRef.current?.playMove(move) ?? null,
    resign: () => run(session => session.resign()),
    offerDraw: () => run(session => session.offerDraw()),
    acceptDraw: () => run(session => session.acceptDraw()),
    declineDraw: () => run(session => session.declineDraw()),
    requestRematch: () => run(session => session.requestRematch()),
    declineRematch: () => run(session => session.declineRematch()),
  }), [run]);

  const myColor = colorOfRole(rules, match, role);
  const isMyTurn = !isOver && rules.colorToMove(match.moves) === myColor;
  return { match, connection, notice, myColor, isOver, isMyTurn, actions };
}
