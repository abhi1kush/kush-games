/**
 * Paani Pour: loads the Rust/wasm rules (tubes, pours, undo, levels, solver for par and hints) once, and reads the
 * tube layers zero-copy. TypeScript only draws and animates.
 */
import init, { PaaniPour } from '../../wasm/paani_pour/paani_pour.js';

let ready: Promise<WebAssembly.Memory> | null = null;
let memory: WebAssembly.Memory | null = null;
export const loadPaaniPourEngine = () => (ready ??= init().then(exports => { memory = exports.memory; return exports.memory; }));
export { PaaniPour };

export const CAPACITY = 4;
export const LEVEL_COUNT = 20;
export const HINTS_PER_LEVEL = 3;
/** Colour 1…12 → paint. Index 0 is unused (empty). */
export const WATER_COLOURS = ['', '#e8253b', '#ff8c1a', '#ffd23f', '#8bd346', '#169c52', '#1ec8c8', '#3fa9f5', '#2f4fd8', '#8e44ec', '#ff5fae', '#8b5a2b', '#e4e8ee'];
export const COLOUR_NAMES = ['', 'red', 'orange', 'yellow', 'lime', 'green', 'teal', 'sky', 'blue', 'purple', 'pink', 'brown', 'white'];

/** Tubes as arrays of colours, bottom first, without empties. */
export function readTubes(game: PaaniPour): number[][] {
  if (!memory) throw new Error('engine not loaded');
  const count = game.tube_count();
  const bytes = new Uint8Array(memory.buffer, game.layers_ptr(), count * CAPACITY);
  const tubes: number[][] = [];
  for (let tube = 0; tube < count; tube++) {
    const layers: number[] = [];
    for (let depth = 0; depth < CAPACITY; depth++) { const colour = bytes[tube * CAPACITY + depth]; if (colour) layers.push(colour); }
    tubes.push(layers);
  }
  return tubes;
}

export interface Progress { unlocked: number; stars: number[]; current: number; savedLevel: number; savedPours: number[] }
export const emptyProgress = (): Progress => ({ unlocked: 1, stars: Array(LEVEL_COUNT).fill(0), current: 0, savedLevel: -1, savedPours: [] });

const isInt = (value: unknown, low: number, high: number) => Number.isInteger(value) && (value as number) >= low && (value as number) <= high;

export function parseProgress(data: unknown): Progress | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (!isInt(record.unlocked, 1, LEVEL_COUNT) || !isInt(record.current, 0, LEVEL_COUNT - 1) || !isInt(record.savedLevel, -1, LEVEL_COUNT - 1)) return null;
  if (!Array.isArray(record.stars) || record.stars.length !== LEVEL_COUNT || !record.stars.every(value => isInt(value, 0, 3))) return null;
  if (!Array.isArray(record.savedPours) || record.savedPours.length > 512 || !record.savedPours.every(value => isInt(value, 0, 255))) return null;
  return { unlocked: record.unlocked as number, stars: record.stars as number[], current: record.current as number, savedLevel: record.savedLevel as number, savedPours: record.savedPours as number[] };
}

export function recordWin(progress: Progress, level: number, stars: number): Progress {
  const next = { ...progress, stars: progress.stars.slice(), savedLevel: -1, savedPours: [] };
  next.stars[level] = Math.max(next.stars[level], stars);
  next.unlocked = Math.min(LEVEL_COUNT, Math.max(next.unlocked, level + 2));
  next.current = Math.min(LEVEL_COUNT - 1, level + 1);
  return next;
}

/** Replay saved pours (from * 16 + to) onto a fresh level; stops at the first one that isn't allowed. */
export function replayPours(game: PaaniPour, pours: readonly number[]) {
  for (const code of pours) if (!game.pour(code >> 4, code & 15)) break;
}
