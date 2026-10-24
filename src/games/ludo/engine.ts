/** Loads the Ludo rules (Rust → wasm) once, plus the board geometry and the snapshot layout shared by every browser. */
import init, { Ludo } from '../../wasm/ludo/ludo.js';

let ready: Promise<unknown> | null = null;
export const loadLudoEngine = () => (ready ??= init());
export { Ludo };

export const SEAT_COUNT = 4;
export const TOKENS = 4;
export const HOME = 56;
export const LAST_TRACK = 50;
export const YARD = 255;
export const REMOVED = 254;
export const MAX_STRIKES = 3;
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

export const enum EnginePhase { Lobby = 0, AwaitRoll = 1, AwaitMove = 2, NoMove = 3, Over = 4 }
export const enum NoMoveReason { None = 0, NothingLegal = 1, ThreeSixes = 2 }

export const SEATS = [
  { name: 'Red', color: '#e53935', light: '#ff8a80', dark: '#a31515' },
  { name: 'Green', color: '#2e9e44', light: '#8be29b', dark: '#1b6a2b' },
  { name: 'Yellow', color: '#f5b800', light: '#ffe48a', dark: '#b07f00' },
  { name: 'Blue', color: '#1e7ae5', light: '#8ec5ff', dark: '#11509c' },
] as const;

/** Seats a room hands out, in order: two players sit opposite each other (Red and Yellow). */
export const SEAT_ORDER = [0, 2, 1, 3] as const;

// ---------- Board geometry (a 15 × 15 grid; x right, y down; seat 0 Red's yard is bottom-left) ----------
export type Cell = readonly [number, number];

/** The 52 track squares clockwise, starting at Red's start square (absolute square 0). */
export const TRACK: readonly Cell[] = (() => {
  const cells: Cell[] = [];
  const line = (fromX: number, fromY: number, toX: number, toY: number) => {
    const stepX = Math.sign(toX - fromX), stepY = Math.sign(toY - fromY);
    for (let x = fromX, y = fromY; ; x += stepX, y += stepY) { cells.push([x, y]); if (x === toX && y === toY) break; }
  };
  line(6, 13, 6, 9); line(5, 8, 0, 8); cells.push([0, 7]); line(0, 6, 5, 6);
  line(6, 5, 6, 0); cells.push([7, 0]); line(8, 0, 8, 5);
  line(9, 6, 14, 6); cells.push([14, 7]); line(14, 8, 9, 8);
  line(8, 9, 8, 14); cells.push([7, 14]); cells.push([6, 14]);
  return cells;
})();

/** Each seat's home column (progress 51…55). */
export const HOME_COLUMNS: readonly (readonly Cell[])[] = [
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
];
/** Top-left cell of each seat's 6 × 6 yard. */
export const YARD_ORIGINS: readonly Cell[] = [[0, 9], [0, 0], [9, 0], [9, 9]];
/** Where the four tokens wait in the yard (cell centres, fractional). */
export const yardSpot = (seat: number, token: number): [number, number] => {
  const [originX, originY] = YARD_ORIGINS[seat];
  return [originX + (token % 2 === 0 ? 1.85 : 4.15), originY + (token < 2 ? 1.85 : 4.15)];
};
/** Centre of a seat's yard (where its dice sits on its turn). */
export const yardCentre = (seat: number): [number, number] => [YARD_ORIGINS[seat][0] + 3, YARD_ORIGINS[seat][1] + 3];
/** Finished tokens sit in the seat's triangle of the centre. */
const HOME_SPOTS: readonly [number, number][] = [[7.5, 8.55], [6.45, 7.5], [7.5, 6.45], [8.55, 7.5]];

export const absoluteSquare = (seat: number, progress: number) => (seat * 13 + progress) % 52;

/** Centre of the square a token with this progress stands on (grid units, cell centre = +0.5). */
export function tokenPoint(seat: number, token: number, progress: number): [number, number] {
  if (progress === YARD || progress === REMOVED) { const [x, y] = yardSpot(seat, token); return [x, y]; }
  if (progress === HOME) { const [x, y] = HOME_SPOTS[seat]; return [x + ((token % 2) - 0.5) * 0.45, y + ((token >> 1) - 0.5) * 0.45]; }
  const [x, y] = progress <= LAST_TRACK ? TRACK[absoluteSquare(seat, progress)] : HOME_COLUMNS[seat][progress - 51];
  return [x + 0.5, y + 0.5];
}

/** Rotate a grid point by quarter turns (counter-clockwise), so a player's own yard can be shown bottom-left. */
export function rotatePoint(x: number, y: number, quarterTurns: number): [number, number] {
  let pointX = x, pointY = y;
  for (let turn = 0; turn < ((quarterTurns % 4) + 4) % 4; turn++) [pointX, pointY] = [pointY, 15 - pointX];
  return [pointX, pointY];
}

// ---------- The 56-byte snapshot (mirrors Game::snapshot in wasm/ludo/src/rules.rs) ----------
export const SNAPSHOT_LENGTH = 56;
export interface Capture { seat: number; token: number; from: number; }
export interface LastMove { id: number; seat: number; token: number; from: number; to: number; captures: Capture[]; }
export interface GameView {
  phase: EnginePhase;
  current: number;
  dice: number;
  rollId: number;
  sixesInRow: number;
  autoPlayedLast: boolean;
  noMoveReason: NoMoveReason;
  active: number;
  joined: number;
  legalMask: number;
  places: number[];
  strikes: number[];
  progress: number[][];
  lastMove: LastMove | null;
}

export function decodeSnapshot(bytes: ArrayLike<number> | null | undefined): GameView | null {
  if (!bytes || bytes.length !== SNAPSHOT_LENGTH || bytes[0] !== 1) return null;
  const places = [0, 1, 2, 3].map(seat => bytes[12 + seat]);
  const strikes = [0, 1, 2, 3].map(seat => bytes[16 + seat]);
  const progress = [0, 1, 2, 3].map(seat => [0, 1, 2, 3].map(token => bytes[20 + seat * 4 + token]));
  const captureCount = Math.min(3, bytes[45]);
  const captures: Capture[] = [];
  for (let index = 0; index < captureCount; index++) captures.push({ seat: bytes[46 + index * 3], token: bytes[47 + index * 3], from: bytes[48 + index * 3] });
  return {
    phase: bytes[1] as EnginePhase, current: bytes[2], dice: bytes[3], rollId: bytes[4], sixesInRow: bytes[5], autoPlayedLast: (bytes[6] & 2) !== 0,
    noMoveReason: bytes[7] as NoMoveReason, active: bytes[8], joined: bytes[9], legalMask: bytes[11], places, strikes, progress,
    lastMove: bytes[40] === 0 || bytes[41] > 3 ? null : { id: bytes[40], seat: bytes[41], token: bytes[42], from: bytes[43], to: bytes[44], captures },
  };
}

/** The squares a token passes through from `from` to `to` (for the hop animation); a token leaving the yard hops once. */
export function hopPath(seat: number, token: number, from: number, to: number): [number, number][] {
  if (from === YARD) return [tokenPoint(seat, token, 0)];
  const points: [number, number][] = [];
  for (let progress = from + 1; progress <= to; progress++) points.push(tokenPoint(seat, token, progress));
  return points;
}

export const placeText = (place: number) => ['', '1st', '2nd', '3rd', '4th'][place] ?? '';
