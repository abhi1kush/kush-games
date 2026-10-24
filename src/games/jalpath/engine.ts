/**
 * Jal Path: loads the Rust/wasm puzzle (board, rotation rules, water flow, tank, win/lose) once and gives the
 * renderer zero-copy views of its tiles. TypeScript only draws; every rule lives in Rust.
 */
import init, { JalPath } from '../../wasm/jal_path/jal_path.js';

let ready: Promise<WebAssembly.Memory> | null = null;
let memory: WebAssembly.Memory | null = null;
export const loadJalPathEngine = () => (ready ??= init().then(exports => { memory = exports.memory; return exports.memory; }));
export { JalPath };

export const NORTH = 0;
export const EAST = 1;
export const SOUTH = 2;
export const WEST = 3;
export const KIND_PIPE = 1;
export const KIND_ROCK = 2;
export const FLAG_FIXED = 1;
export const FLAG_LEAK = 2;
export const FLAG_CONNECTED = 4;
export const NO_ENTRY = 255;
export const PHASE_PLANNING = 0;
export const PHASE_FLOWING = 1;
export const PHASE_WON = 2;
export const PHASE_LOST = 3;
/** Tile layout in wasm memory: mask, kind, flags, entry (u8 each) then fill (f32) — 8 bytes. */
export const TILE_BYTES = 8;
/** Water costs (tank units), mirrored from Rust for the controls card. */
export const RATES = { tile: 2, spill: 4, leak: 3, evaporation: 0.5 } as const;

export interface Tile { mask: number; kind: number; flags: number; entry: number; fill: number }
export interface Port { cell: number; side: number }

/** Read all tiles straight out of wasm memory (views are recreated each call: memory may grow). */
export function readTiles(game: JalPath): Tile[] {
  if (!memory) throw new Error('engine not loaded');
  const count = game.width() * game.height();
  const pointer = game.tiles_ptr();
  const bytes = new Uint8Array(memory.buffer, pointer, count * TILE_BYTES);
  const floats = new Float32Array(memory.buffer, pointer, count * 2);
  const tiles: Tile[] = [];
  for (let cell = 0; cell < count; cell++) {
    const base = cell * TILE_BYTES;
    tiles.push({ mask: bytes[base], kind: bytes[base + 1], flags: bytes[base + 2], entry: bytes[base + 3], fill: floats[cell * 2 + 1] });
  }
  return tiles;
}

export function readPorts(game: JalPath): { source: Port; houses: Port[] } {
  const raw = game.ports();
  return { source: { cell: raw[0], side: raw[1] }, houses: [1, 2, 3].map(index => ({ cell: raw[index * 2], side: raw[index * 2 + 1] })) };
}

/** Open pipe ends as {cell, side}; encoded as cell * 4 + side in Rust. */
export function readSpills(game: JalPath): Port[] {
  return Array.from(game.spills(), code => ({ cell: code >> 2, side: code & 3 }));
}

export const sideCount = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
export const isElbow = (mask: number) => sideCount(mask) === 2 && mask !== 5 && mask !== 10;

export interface Progress { unlocked: number; stars: number[]; current: number }
export const LEVEL_COUNT = 18;
export const emptyProgress = (): Progress => ({ unlocked: 1, stars: Array(LEVEL_COUNT).fill(0), current: 0 });

export function parseProgress(data: unknown): Progress | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const { unlocked, stars, current } = record;
  if (!Number.isInteger(unlocked) || (unlocked as number) < 1 || (unlocked as number) > LEVEL_COUNT) return null;
  if (!Number.isInteger(current) || (current as number) < 0 || (current as number) >= LEVEL_COUNT) return null;
  if (!Array.isArray(stars) || stars.length !== LEVEL_COUNT || !stars.every(value => Number.isInteger(value) && value >= 0 && value <= 3)) return null;
  return { unlocked: unlocked as number, stars: stars as number[], current: current as number };
}

/** After winning `level` with `stars`: unlock the next one and keep the best stars. */
export function recordWin(progress: Progress, level: number, stars: number): Progress {
  const next = { ...progress, stars: progress.stars.slice() };
  next.stars[level] = Math.max(next.stars[level], stars);
  next.unlocked = Math.min(LEVEL_COUNT, Math.max(next.unlocked, level + 2));
  next.current = Math.min(LEVEL_COUNT - 1, level + 1);
  return next;
}
