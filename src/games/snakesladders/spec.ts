/** Snakes & Ladders' plug-in for the shared turn-game room code: its snapshot, seats, boards and log lines. */
import type { TurnGameSpec } from '../online/turnRoom/spec';
import { BOARDS, decodeSnapshot, EnginePhase, type GameView, moveDurationMs, RollNote, SEAT_ORDER, SEATS, SNAPSHOT_LENGTH } from './engine';

export const SNAKES_PROTOCOL = 1;
/** Extra pause after the move has played out, before the next turn. */
const SETTLE_MS = 450;

export const snakesSpec: TurnGameSpec<GameView> = {
  gameId: 'snakes-ladders',
  protocol: SNAKES_PROTOCOL,
  snapshotLength: SNAPSHOT_LENGTH,
  seatOrder: SEAT_ORDER,
  seatNames: SEATS.map(seat => seat.name),
  decode: decodeSnapshot,
  describe(before, after, seatName, log) {
    if (after.rollId === before.rollId || after.phase !== EnginePhase.Resolving) return;
    const move = after.lastMove;
    const name = seatName(after.current);
    if (after.note === RollNote.ThreeSixes) { log(`${name} rolled three 6s — turn lost`, 'six'); return; }
    if (!move || move.id === before.lastMove?.id) return;
    if (move.to > move.landed) log(`${name} climbed a ladder ${move.landed} → ${move.to}`, 'ladder');
    else if (move.to < move.landed) log(`Snake! ${name} slid ${move.landed} → ${move.to}`, 'snake');
  },
  variantCount: BOARDS.length,
  resolveMs: view => (view.note === RollNote.None ? moveDurationMs(view.lastMove) : 1100) + SETTLE_MS,
};
