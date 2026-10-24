/**
 * What a turn-based dice game plugs into the shared room code (authority, room, protocol): its wasm engine's
 * snapshot format, seat names and order, and how to describe what a move did for the room's log.
 */
import type { EventKind } from './protocol';

/** Engine phases every turn game uses (the wasm engines share these numbers). */
export const enum TurnPhase { Lobby = 0, AwaitRoll = 1, AwaitMove = 2, Resolving = 3, Over = 4 }
export const MAX_STRIKES = 3;

/** The part of a decoded snapshot the shared room code needs. */
export interface TurnView {
  phase: TurnPhase | number;
  current: number;
  dice: number;
  rollId: number;
  active: number;
  places: number[];
  strikes: number[];
}

export interface TurnGameSpec<View extends TurnView = TurnView> {
  gameId: string;
  /** Bumped when room messages change shape. */
  protocol: number;
  snapshotLength: number;
  /** Seats are handed out in this order as players join. */
  seatOrder: readonly number[];
  seatNames: readonly string[];
  decode(bytes: ArrayLike<number> | null | undefined): View | null;
  /** Log what the last engine step did (captures, ladders, three 6s…). */
  describe(before: View, after: View, seatName: (seat: number) => string, log: (text: string, kind: EventKind) => void): void;
  /** Number of game variants the host can pick from (boards); 1 if none. */
  variantCount: number;
  /** How long the board shows a roll (phase Resolving) before play moves on. */
  resolveMs(view: View): number;
}

export const placeText = (place: number) => ['', '1st', '2nd', '3rd', '4th'][place] ?? '';

/** The methods the shared authority calls on a game's wasm engine (same names in every turn game). */
export interface TurnEngine {
  start(seatsMask: number, first: number): boolean;
  roll(): number;
  move_token(token: number): boolean;
  pass_turn(): boolean;
  timeout(): number;
  remove_seat(seat: number): boolean;
  choose_move(): number;
  phase(): number;
  current(): number;
  legal_mask(): number;
  snapshot(): Uint8Array;
  restore(bytes: Uint8Array): boolean;
  reseed(seed: number): void;
  /** Pick the variant (board) for the next start(). */
  set_variant?(variant: number): boolean;
}
