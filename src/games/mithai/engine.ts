/** Loads the Mithai Match wasm once (only when the game opens) and keeps its memory for zero-copy reads. */
import init, { MithaiMatch } from '../../wasm/mithai_match/mithai_match.js';

let ready: Promise<WebAssembly.Memory> | null = null;
export const loadMithaiEngine = () => (ready ??= init().then(exports => exports.memory));
export { MithaiMatch };

export const SIZE = 8;
export const CELLS = 64;
export const NO_PIECE = 255;
export const BOMB_COLOUR = 6;
export const LEVEL_COUNT = 20;

export const enum Phase { Ready = 0, Idle = 1, Swapping = 2, SwapBack = 3, Clearing = 4, Falling = 5, Shuffling = 6, Won = 7, Lost = 8 }
export const enum Special { None = 0, StripedH = 1, StripedV = 2, Wrapped = 3, ColourBomb = 4 }
export const enum EffectKind { RowBeam = 0, ColumnBeam = 1, Blast = 2, BombRays = 3, ScoreText = 4, BigBlast = 5, Made = 6 }
export const enum GoalKind { Score = 0, Collect = 1, Jelly = 2, Blockers = 3 }

/** The six sweets, in colour order (shape and colour both differ, so they read without colour vision). */
export const SWEETS = [
  { name: 'Laddoo', shape: 'round' },
  { name: 'Jalebi', shape: 'spiral' },
  { name: 'Barfi', shape: 'square' },
  { name: 'Kaju katli', shape: 'diamond' },
  { name: 'Gulab jamun', shape: 'drop' },
  { name: 'Sandesh', shape: 'heart' },
] as const;

/** Event bits returned by advance(). Mirrors `events` in wasm/mithai_match/src/world.rs. */
export const Events = {
  swap: 1, invalid: 2, match: 4, specialMade: 8, striped: 16, wrapped: 32, colourBomb: 64, jelly: 128, stone: 256, lock: 512, shuffle: 1024,
  won: 2048, lost: 4096, landed: 8192, bonus: 16384, hitch: 32768, select: 65536, combo: 131072,
} as const;

export const MAX_GHOSTS = 64;
export const MAX_PARTICLES = 200;
export const MAX_EFFECTS = 24;
const CELLS_START = 20;
const GHOSTS = CELLS_START + CELLS * 8;
const PARTICLES = GHOSTS + MAX_GHOSTS * 4;
const EFFECTS = PARTICLES + MAX_PARTICLES * 4;
/** The render buffer layout. Mirrors `render_slot` in lib.rs (checked by a test). */
export const RenderSlot = {
  phase: 0, phaseSeconds: 1, score: 2, movesLeft: 3, level: 4, goalRemaining: 5, cascade: 6, stars: 7, selected: 8, hintA: 9, hintB: 10, showHint: 11,
  slideProgress: 12, ghostCount: 13, particleCount: 14, effectCount: 15, animating: 16,
  cells: CELLS_START, cellStride: 8, ghosts: GHOSTS, ghostStride: 4, particles: PARTICLES, particleStride: 4, effects: EFFECTS, effectStride: 4,
  length: EFFECTS + MAX_EFFECTS * 4,
} as const;

export interface LevelInfo { moves: number; colours: number; goalKind: GoalKind; goalAmount: number; goalColour: number; twoStars: number; threeStars: number; }
export function levelInfo(index: number): LevelInfo {
  const field = (which: number) => MithaiMatch.level_info(index, which);
  return { moves: field(0), colours: field(1), goalKind: field(2) as GoalKind, goalAmount: field(3), goalColour: field(4), twoStars: field(5), threeStars: field(6) };
}

/** A Float32Array straight onto wasm memory (no copying); recreated only if the memory grew. Same object every frame. */
export function createRenderView(memory: WebAssembly.Memory, game: MithaiMatch): () => Float32Array {
  let buffer = memory.buffer;
  let view = new Float32Array(buffer, game.render_pointer(), RenderSlot.length);
  return () => {
    if (memory.buffer !== buffer) { buffer = memory.buffer; view = new Float32Array(buffer, game.render_pointer(), RenderSlot.length); }
    return view;
  };
}
