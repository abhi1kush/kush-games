/** Loads the Snakes & Ladders rules (Rust → wasm) once, plus the boards, their geometry and the snapshot layout. */
import init, { SnakesLadders } from '../../wasm/snakes_ladders/snakes_ladders.js';

let ready: Promise<unknown> | null = null;
export const loadSnakesEngine = () => (ready ??= init());
export { SnakesLadders };

export const LAST_SQUARE = 100;
export const REMOVED = 254;
export const MAX_STRIKES = 3;

export const enum EnginePhase { Lobby = 0, AwaitRoll = 1, Resolving = 3, Over = 4 }
export const enum RollNote { None = 0, Overshoot = 1, ThreeSixes = 2 }

export const SEATS = [
  { name: 'Ruby', color: '#e8344e', light: '#ff9aa8', dark: '#9c1028' },
  { name: 'Emerald', color: '#16a35a', light: '#86efac', dark: '#0b6b39' },
  { name: 'Saffron', color: '#f59e0b', light: '#fde68a', dark: '#a85d00' },
  { name: 'Sapphire', color: '#2f6fe4', light: '#9cc1ff', dark: '#173f99' },
] as const;
/** Seats a room hands out, in order (two players sit at opposite corners). */
export const SEAT_ORDER = [0, 2, 1, 3] as const;

export interface BoardTheme {
  name: string;
  blurb: string;
  /** Square colours: [even, odd] checker, frame, number colour */
  light: string;
  dark: string;
  frame: string;
  ink: string;
  snakes: readonly (readonly [string, string])[];
  night?: boolean;
}

/** (from, to) pairs: up = ladder, down = snake. Mirrors BOARDS in wasm/snakes_ladders/src/rules.rs (a test checks). */
export const BOARD_JUMPS: readonly (readonly (readonly [number, number])[])[] = [
  [[4, 14], [9, 31], [21, 42], [28, 84], [40, 59], [51, 67], [63, 81], [71, 91], [17, 7], [54, 34], [62, 19], [64, 60], [87, 24], [93, 73], [95, 75], [99, 78]],
  [[3, 22], [11, 26], [20, 29], [36, 55], [50, 69], [57, 76], [72, 92], [27, 5], [38, 15], [46, 25], [49, 12], [66, 45], [74, 53], [83, 58], [89, 68], [97, 78], [98, 41]],
  [[2, 38], [8, 31], [16, 45], [33, 70], [36, 44], [51, 73], [61, 88], [79, 98], [25, 3], [48, 26], [56, 37], [69, 32], [86, 52], [94, 65], [96, 58]],
  [[5, 16], [12, 23], [19, 38], [30, 41], [42, 63], [53, 64], [60, 79], [77, 86], [82, 93], [24, 13], [35, 27], [47, 34], [58, 39], [67, 48], [75, 55], [88, 69], [92, 72], [97, 84]],
  [[6, 46], [18, 39], [26, 85], [44, 65], [58, 87], [70, 90], [31, 9], [52, 10], [64, 22], [73, 41], [81, 43], [89, 54], [95, 35], [98, 8]],
];

export const BOARDS: readonly BoardTheme[] = [
  { name: 'Mango Grove', blurb: 'The classic balance', light: '#fff6dc', dark: '#ffd479', frame: '#2f7d32', ink: '#5b3a00',
    snakes: [['#43a047', '#c6ff00'], ['#e65100', '#ffd180'], ['#6a1b9a', '#ea80fc'], ['#00838f', '#84ffff']] },
  { name: 'Monsoon Rapids', blurb: 'More snakes than ladders', light: '#e6f6ff', dark: '#9fd4f7', frame: '#1557b0', ink: '#0b3a6b',
    snakes: [['#2e7d32', '#b9f6ca'], ['#283593', '#8c9eff'], ['#00695c', '#a7ffeb'], ['#4527a0', '#d1c4e9']] },
  { name: 'Temple Steps', blurb: 'Long ladders, long snakes', light: '#fdeede', dark: '#f4b98f', frame: '#8d3b1f', ink: '#5a2008',
    snakes: [['#1b5e20', '#ffeb3b'], ['#b71c1c', '#ffcdd2'], ['#4e342e', '#ffcc80'], ['#004d40', '#80cbc4']] },
  { name: 'Spice Bazaar', blurb: 'Lots of short hops', light: '#fff0f7', dark: '#f7b0d3', frame: '#9c1d6b', ink: '#5e0a3d',
    snakes: [['#f57f17', '#fff59d'], ['#2e7d32', '#ccff90'], ['#c62828', '#ffab91'], ['#1565c0', '#90caf9']] },
  { name: 'Starry Night', blurb: 'A few huge jumps', light: '#2c3c78', dark: '#1f2b5c', frame: '#0b1030', ink: '#dfe6ff', night: true,
    snakes: [['#00c853', '#b2ff59'], ['#ff6d00', '#ffe57f'], ['#d500f9', '#ff80ab'], ['#00b8d4', '#e0f7fa']] },
];
export const DEFAULT_BOARD = 0;

/** Where a token landing on `square` ends up on `board`. */
export const jumpTarget = (board: number, square: number) => BOARD_JUMPS[board]?.find(([from]) => from === square)?.[1] ?? square;

// ---------- geometry: 10 × 10 units, x right, y down; square 1 bottom-left, rows snake back and forth ----------
export type Point = [number, number];
export function squarePoint(square: number): Point {
  if (square <= 0) return [-0.15, 9.5];
  const index = Math.min(99, square - 1);
  const row = Math.floor(index / 10);
  const column = row % 2 === 0 ? index % 10 : 9 - (index % 10);
  return [column + 0.5, 9 - row + 0.5];
}

/** A snake's body: a cubic curve from head (`from`) to tail (`to`), bending one way or the other by its index. */
export function snakeCurve(from: number, to: number, index: number): [Point, Point, Point, Point] {
  const head = squarePoint(from), tail = squarePoint(to);
  const dx = tail[0] - head[0], dy = tail[1] - head[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length, ny = dx / length;
  const bend = Math.min(1.5, length * 0.28) * (index % 2 === 0 ? 1 : -1);
  return [head, [head[0] + dx * 0.3 + nx * bend, head[1] + dy * 0.3 + ny * bend], [head[0] + dx * 0.7 - nx * bend, head[1] + dy * 0.7 - ny * bend], tail];
}
export function bezierPoint([p0, p1, p2, p3]: [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
}

// ---------- animation timing (shared by the board and the host's pause before the next turn) ----------
export const DICE_SETTLE_MS = 560;
export const HOP_MS = 170;
export const jumpMs = (from: number, to: number) => Math.round(Math.min(1300, 420 + Math.abs(Math.floor((from - 1) / 10) - Math.floor((to - 1) / 10)) * 110));
/** How long a move takes to show (dice settle, hops, then the ladder climb or snake slide). */
export function moveDurationMs(move: LastMove | null): number {
  if (!move) return DICE_SETTLE_MS;
  const hops = Math.max(0, move.landed - move.from);
  return DICE_SETTLE_MS + hops * HOP_MS + (move.to !== move.landed ? 140 + jumpMs(move.landed, move.to) : 0);
}

// ---------- the 34-byte snapshot (mirrors Game::snapshot in wasm/snakes_ladders/src/rules.rs) ----------
export const SNAPSHOT_LENGTH = 34;
export interface LastMove { id: number; seat: number; from: number; landed: number; to: number; }
export interface GameView {
  phase: EnginePhase;
  current: number;
  dice: number;
  rollId: number;
  sixesInRow: number;
  autoPlayedLast: boolean;
  note: RollNote;
  active: number;
  joined: number;
  board: number;
  places: number[];
  strikes: number[];
  positions: number[];
  lastMove: LastMove | null;
}

export function decodeSnapshot(bytes: ArrayLike<number> | null | undefined): GameView | null {
  if (!bytes || bytes.length !== SNAPSHOT_LENGTH || bytes[0] !== 1) return null;
  const seats = [0, 1, 2, 3];
  return {
    phase: bytes[1] as EnginePhase, current: bytes[2], dice: bytes[3], rollId: bytes[4], sixesInRow: bytes[5], autoPlayedLast: (bytes[6] & 2) !== 0,
    note: bytes[7] as RollNote, active: bytes[8], joined: bytes[9], board: Math.min(BOARDS.length - 1, bytes[11]),
    places: seats.map(seat => bytes[12 + seat]), strikes: seats.map(seat => bytes[16 + seat]), positions: seats.map(seat => bytes[20 + seat]),
    lastMove: bytes[28] === 0 || bytes[29] > 3 ? null : { id: bytes[28], seat: bytes[29], from: bytes[30], landed: bytes[31], to: bytes[32] },
  };
}
