/** Ludo's plug-in for the shared turn-game room code: its snapshot, seats and log lines. */
import type { TurnGameSpec } from '../online/turnRoom/spec';
import { decodeSnapshot, EnginePhase, type GameView, HOME, NoMoveReason, SEAT_ORDER, SEATS, SNAPSHOT_LENGTH } from './engine';

export const LUDO_PROTOCOL = 1;
/** How long the dice stay up after a roll that can't be used, before the turn passes. */
export const NO_MOVE_PAUSE_MS = 1300;

export const ludoSpec: TurnGameSpec<GameView> = {
  gameId: 'ludo',
  protocol: LUDO_PROTOCOL,
  snapshotLength: SNAPSHOT_LENGTH,
  seatOrder: SEAT_ORDER,
  seatNames: SEATS.map(seat => seat.name),
  decode: decodeSnapshot,
  describe(before, after, seatName, log) {
    const move = after.lastMove;
    if (move && move.id !== before.lastMove?.id) {
      const mover = seatName(move.seat);
      for (const capture of move.captures) log(`${mover} captured ${seatName(capture.seat)}’s token!`, 'capture');
      if (move.to === HOME) log(`${mover} brought a token home`, 'home');
    }
    if (after.phase === EnginePhase.NoMove && after.noMoveReason === NoMoveReason.ThreeSixes && after.rollId !== before.rollId) {
      log(`${seatName(after.current)} rolled three 6s — turn lost`, 'six');
    }
  },
  variantCount: 1,
  resolveMs: () => NO_MOVE_PAUSE_MS,
};
