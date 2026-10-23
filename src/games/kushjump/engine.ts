/** Loads the Kush Jump wasm once (only when the game opens) and keeps its memory for zero-copy reads. */
import init, { KushJump } from '../../wasm/kush_jump/kush_jump.js';

let ready: Promise<WebAssembly.Memory> | null = null;
export const loadKushJumpEngine = () => (ready ??= init().then(exports => exports.memory));
export { KushJump };

/** World units: tiles are 16 units, the view is always 240 units tall and 256–480 wide. */
export const TILE = 16;
export const WORLD_HEIGHT = 240;
export const MIN_VIEW_WIDTH = 256;
export const MAX_VIEW_WIDTH = 480;
export const LEVEL_COLUMNS = 214;
export const LEVEL_ROWS = 15;
export const GROUND_ROW = 13;
export const CHECKPOINT_COLUMN = 102;
export const FLAG_COLUMN = 199;
export const FLAG_TOP_ROW = 2;
export const FORT_DOOR_COLUMN = 206;
export const HERO_WIDTH = 12;

/** Tile kinds (must match wasm/kush_jump/src/level.rs `tile`). */
export const Tile = {
  empty: 0, ground: 1, brick: 2, coinCrate: 3, berryCrate: 4, usedCrate: 5, stone: 6,
  pipeTopLeft: 7, pipeTopRight: 8, pipeLeft: 9, pipeRight: 10, coin: 11, coinBrick: 12,
} as const;
export const TILE_KIND_COUNT = 13;

/** Slots of the f32 render buffer (must match render_slot in wasm/kush_jump/src/lib.rs). */
export const RenderSlot = {
  heroX: 0, heroY: 1, heroBig: 2, heroFacing: 3, heroPose: 4, heroStride: 5, heroInvulnerable: 6, cameraX: 7, phase: 8, score: 9,
  coins: 10, lives: 11, time: 12, checkpoint: 13, flagY: 14, tilesVersion: 15, entityCount: 16, effectCount: 17, heroVelocityX: 18,
  entities: 19, entityStride: 6, effects: 19 + 32 * 6, effectStride: 5, length: 19 + 32 * 6 + 16 * 5,
} as const;

export enum Phase { Ready = 0, Playing = 1, Dying = 2, GameOver = 3, Goal = 4, Cleared = 5 }
export enum EntityKind { Walker = 0, Shellbug = 1, Shell = 2, Berry = 3 }
export enum EntityState { Dormant = 0, Active = 1, Squashed = 2, Knocked = 3, Emerging = 4 }
export enum EffectKind { CoinPop = 0, Debris = 1, Score = 2, Bump = 3 }
export enum HeroPose { Standing = 0, Walking = 1, Jumping = 2, Skidding = 3, Dead = 4, OnPole = 5, Hidden = 6 }
export const Buttons = { left: 1, right: 2, jump: 4, run: 8 } as const;
export const Events = {
  jump: 1, coin: 2, stomp: 4, bump: 8, brickBreak: 16, powerUpAppears: 32, powerUp: 64, shrink: 128, death: 256, kick: 512, flag: 1024,
  stageClear: 2048, oneUp: 4096, checkpoint: 8192, hitch: 16384, rescue: 32768, gameOver: 65536, lifeLost: 131072,
} as const;

export interface MemoryViews { render: Float32Array; tiles: Uint8Array; }

/**
 * Typed-array views straight onto wasm memory (no copying). The same object is returned every frame (no allocation);
 * its views are recreated only if the memory grew, which detaches the old buffer.
 */
export function createMemoryViews(memory: WebAssembly.Memory, game: KushJump): () => MemoryViews {
  let buffer = memory.buffer;
  const makeViews = (): MemoryViews => ({
    render: new Float32Array(buffer, game.render_pointer(), RenderSlot.length),
    tiles: new Uint8Array(buffer, game.tiles_pointer(), LEVEL_COLUMNS * LEVEL_ROWS),
  });
  const views = makeViews();
  return () => {
    if (memory.buffer !== buffer) {
      buffer = memory.buffer;
      const fresh = makeViews();
      views.render = fresh.render;
      views.tiles = fresh.tiles;
    }
    return views;
  };
}
