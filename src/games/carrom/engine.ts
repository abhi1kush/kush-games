/**
 * Carrom: loads the Rust/wasm board (physics + rules + computer player) once, and the helpers shared by local and
 * online play. A game is just its list of shots, each `s<x>.<aimX>.<aimY>.<power>` in whole board units (the board is
 * 1000 × 1000; power 1…1000), so replaying the list in wasm rebuilds the exact same board in any browser.
 */
import init, { Carrom } from '../../wasm/carrom/carrom.js';

let ready: Promise<WebAssembly.Memory> | null = null;
let memory: WebAssembly.Memory | null = null;
export const loadCarromEngine = () => (ready ??= init().then(exports => { memory = exports.memory; return exports.memory; }));
export { Carrom };

export const BOARD = 1000;
export const COIN_R = 21.5;
export const STRIKER_R = 27.5;
export const POCKET_R = 31;
export const POCKETS: readonly (readonly [number, number])[] = [[31, 31], [969, 31], [31, 969], [969, 969]];
export const BASELINE_Y = [863, 137] as const;
export const BASELINE_MIN = 182;
export const BASELINE_MAX = 818;
export const QUEEN = 1;
export const BODY_COUNT = 20;
export const BODY_STRIDE = 7;
/** Simulation: 400 fixed steps per second; at most this many per animation frame (lag protection). */
export const STEP_MS = 2.5;
export const MAX_STEPS_PER_FRAME = 24;
export const LEVEL_NAMES = ['Easy', 'Medium', 'Hard'] as const;
export const PLAYER_NAMES = ['White', 'Black'] as const;

export const PHASE_AIM = 0;
export const PHASE_MOVING = 1;
export const PHASE_OVER = 2;
export const QUEEN_ON_BOARD = 0;
export const QUEEN_PENDING = 1;
export const QUEEN_COVERED = 2;
export const FOUL_NONE = 0;
export const FOUL_STRIKER = 1;
export const FOUL_LAST_COIN = 2;
export const FOUL_OPPONENT_LAST = 3;

/** Who owns disc `index`: null for the striker and the Queen. */
export const ownerOf = (index: number): 0 | 1 | null => (index < 2 ? null : index < 11 ? 0 : 1);

/** A view straight onto the wasm disc pool (recreated only if wasm memory grew). */
export function bodiesView(game: Carrom): Float32Array {
  if (!memory) throw new Error('carrom engine not loaded');
  return new Float32Array(memory.buffer, game.bodies_ptr(), BODY_COUNT * BODY_STRIDE);
}

export interface Shot { x: number; aimX: number; aimY: number; power: number; }
const SHOT = /^s(\d{3})\.(-?\d{1,4})\.(-?\d{1,4})\.(\d{1,4})$/;
export const isShotText = (value: unknown): value is string => typeof value === 'string' && SHOT.test(value);
export function parseShot(text: string): Shot | null {
  const match = SHOT.exec(text);
  if (!match) return null;
  const [x, aimX, aimY, power] = match.slice(1).map(Number);
  if (power < 1 || power > 1000 || Math.abs(aimX) > 3000 || Math.abs(aimY) > 3000) return null;
  return { x, aimX, aimY, power };
}
export const shotText = (shot: Shot) =>
  `s${String(Math.round(shot.x)).padStart(3, '0')}.${Math.round(shot.aimX)}.${Math.round(shot.aimY)}.${Math.max(1, Math.min(1000, Math.round(shot.power)))}`;

/** Starts `text` on `game` if it is a legal shot now. */
export function startShot(game: Carrom, text: string): boolean {
  const shot = parseShot(text);
  return !!shot && game.phase() === PHASE_AIM && game.shoot(shot.x, shot.aimX, shot.aimY, shot.power);
}

/** A fresh board with `shots` played out instantly; null if one of them is illegal. */
export function replay(shots: readonly string[], into?: Carrom): Carrom | null {
  const game = into ?? new Carrom();
  if (into) game.reset();
  for (const text of shots) {
    if (!startShot(game, text)) { if (!into) game.free(); return null; }
    game.settle();
  }
  return game;
}

export interface Outcome { player: 0 | 1; foul: number; own: number; opponent: number; queen: number; returned: number; again: boolean; }
export function lastOutcome(game: Carrom): Outcome {
  const [player, foul, own, opponent, queen, returned, again] = game.last_outcome();
  return { player: player as 0 | 1, foul, own, opponent, queen, returned, again: again === 1 };
}

/** A short line about the shot that just finished (null if nothing worth saying). */
export function outcomeText(outcome: Outcome, names: readonly [string, string]): { text: string; kind: 'good' | 'bad' | 'info' } | null {
  const who = names[outcome.player];
  if (outcome.foul === FOUL_STRIKER) return { text: `Foul! ${who} pocketed the striker — a coin goes back`, kind: 'bad' };
  if (outcome.foul === FOUL_LAST_COIN) return { text: `Foul! ${who}'s last coin can't go before the Queen is covered`, kind: 'bad' };
  if (outcome.foul === FOUL_OPPONENT_LAST) return { text: `Foul! The opponent's last coin can't go before the Queen is covered`, kind: 'bad' };
  if (outcome.queen & 2) return { text: `${who} covered the Queen! 👑`, kind: 'good' };
  if (outcome.queen & 1) return { text: `${who} pocketed the Queen — cover her with your next coin!`, kind: 'good' };
  if (outcome.queen & 4) return { text: 'Not covered — the Queen goes back to the centre', kind: 'bad' };
  if (outcome.own > 0) return { text: `${who} pocketed ${outcome.own === 1 ? 'a coin' : `${outcome.own} coins`} — shoot again!`, kind: 'good' };
  if (outcome.opponent > 0) return { text: `${who} pocketed the opponent's coin`, kind: 'info' };
  return null;
}

/** First disc the striker would touch going from (x, y) along (dx, dy) (unit), with the contact point. */
export function aimContact(bodies: Float32Array, x: number, y: number, dx: number, dy: number) {
  let best: { t: number; index: number } | null = null;
  for (let index = 1; index < BODY_COUNT; index++) {
    const base = index * BODY_STRIDE;
    if (bodies[base + 6] < 0.5) continue;
    const reach = bodies[base + 4] + STRIKER_R;
    const fx = bodies[base] - x, fy = bodies[base + 1] - y;
    const along = fx * dx + fy * dy;
    if (along <= 0) continue;
    const across = fx * fx + fy * fy - along * along;
    if (across >= reach * reach) continue;
    const t = along - Math.sqrt(reach * reach - across);
    if (t > 0 && (!best || t < best.t)) best = { t, index };
  }
  // the first cushion along the line
  const wall = Math.min(
    dx > 0 ? (BOARD - STRIKER_R - x) / dx : dx < 0 ? (STRIKER_R - x) / dx : Infinity,
    dy > 0 ? (BOARD - STRIKER_R - y) / dy : dy < 0 ? (STRIKER_R - y) / dy : Infinity,
  );
  if (best && best.t < wall) {
    const cx = x + dx * best.t, cy = y + dy * best.t;
    const base = best.index * BODY_STRIDE;
    const nx = bodies[base] - cx, ny = bodies[base + 1] - cy, length = Math.hypot(nx, ny) || 1;
    return { kind: 'disc' as const, index: best.index, x: cx, y: cy, push: [nx / length, ny / length] as const };
  }
  return { kind: 'wall' as const, x: x + dx * wall, y: y + dy * wall };
}
