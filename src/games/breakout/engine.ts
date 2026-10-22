/** Loads the Breakout wasm once (only when the game opens) and keeps its memory for zero-copy reads. */
import init, { Breakout } from '../../wasm/breakout/breakout.js';

let ready: Promise<WebAssembly.Memory> | null = null;
export const loadBreakoutEngine = () => (ready ??= init().then(exports => exports.memory));
export { Breakout };

export const WORLD_WIDTH = 480;
export const WORLD_HEIGHT = 640;
export const BRICK_COLUMNS = 10;
export const BRICK_ROWS = 9;
export const BRICK_WIDTH = 42;
export const BRICK_HEIGHT = 18;
export const BRICK_GAP = 4;
export const BRICKS_LEFT = (WORLD_WIDTH - (BRICK_COLUMNS * (BRICK_WIDTH + BRICK_GAP) - BRICK_GAP)) / 2;
export const BRICKS_TOP = 72;
export const PADDLE_Y = 596;
export const PADDLE_HEIGHT = 12;
export const BALL_RADIUS = 6;
export const STEEL = 9;

/** Slots of the f32 render buffer (must match render_slot in wasm/breakout/src/lib.rs). */
export const RenderSlot = {
  paddleX: 0, paddleWidth: 1, ballCount: 2, balls: 3, powerUpCount: 9, powerUps: 10, phase: 22, level: 23, score: 24, lives: 25, bricksVersion: 26,
  wideSeconds: 27, length: 28,
} as const;
export enum Phase { Serving = 0, Playing = 1, LevelCleared = 2, GameOver = 3 }
export const Events = { wall: 1, paddle: 2, brickHit: 4, brickBroken: 8, steelHit: 16, powerUp: 32, lifeLost: 64, levelCleared: 128, gameOver: 256 } as const;
export const POWER_UP_LABELS = ['W', 'M', 'S', '+'] as const;
export const POWER_UP_COLORS = ['#4cc9f0', '#f72585', '#90be6d', '#ffd166'] as const;

/**
 * Typed-array views straight onto wasm memory (no copying, no allocation per frame).
 * Recreated only if the memory grows (which detaches the old buffer).
 */
export function createMemoryViews(memory: WebAssembly.Memory, game: Breakout) {
  let buffer = memory.buffer;
  let render = new Float32Array(buffer, game.render_pointer(), RenderSlot.length);
  let bricks = new Uint8Array(buffer, game.bricks_pointer(), BRICK_COLUMNS * BRICK_ROWS);
  return () => {
    if (memory.buffer !== buffer) {
      buffer = memory.buffer;
      render = new Float32Array(buffer, game.render_pointer(), RenderSlot.length);
      bricks = new Uint8Array(buffer, game.bricks_pointer(), BRICK_COLUMNS * BRICK_ROWS);
    }
    return { render, bricks };
  };
}
