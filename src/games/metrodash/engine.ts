/** Loads the Metro Dash wasm once (only when the game opens) and keeps its memory for zero-copy reads. */
import init, { MetroDash } from '../../wasm/metro_dash/metro_dash.js';

let ready: Promise<WebAssembly.Memory> | null = null;
export const loadMetroDashEngine = () => (ready ??= init().then(exports => exports.memory));
export { MetroDash };

/** Mirrors wasm/metro_dash/src/world.rs. */
export const LANE_WIDTH = 2.5;
export const TRAIN_HALF_WIDTH = 1.15;
export const TRAIN_HEIGHT = 3.2;
export const CAR_LENGTH = 13;
export const RAMP_LENGTH = 7;
export const LOW_BARRIER_HEIGHT = 1.0;
export const HIGH_BARRIER_BOTTOM = 1.15;
export const HIGH_BARRIER_TOP = 3.0;
export const SIGN_BOTTOM = 1.2;
export const SIGN_TOP = 2.7;
export const STAND_HEIGHT = 1.7;
export const ROLL_HEIGHT = 0.8;
export const CRASH_SECONDS = 1.2;
export const MAX_ENTITIES = 200;
export const SCENERY_BLOCK = 48;
export const MAGNET_SECONDS = 10;
export const SNEAKERS_SECONDS = 10;
export const MULTIPLIER_SECONDS = 15;
export const HOVERBOARD_SECONDS = 30;
export const COIN_SCORE = 5;
export const MILESTONE_METRES = 500;

export const enum Phase { Ready = 0, Playing = 1, Crashed = 2, GameOver = 3 }
export const enum Motion { Running = 0, Airborne = 1, Rolling = 2 }
export const enum EntityKind {
  Train = 0, MovingTrain = 1, Ramp = 2, LowBarrier = 3, HighBarrier = 4, Sign = 5, Coin = 6, Magnet = 7, Sneakers = 8, Multiplier = 9, Hoverboard = 10,
}
export const enum CrashReason { None = 0, HeadOn = 1, Caught = 2 }

/** Event bits returned by advance(). Mirrors `events` in world.rs. */
export const Events = {
  jump: 1, superJump: 2, land: 4, roll: 8, lane: 16, coin: 32, powerUp: 64, hoverboardBreak: 128, stumble: 256, crash: 512, gameOver: 1024,
  milestone: 2048, ramp: 4096, streak: 8192, powerUpEnd: 16384, laneBump: 32768, caught: 65536,
} as const;

/** The render buffer layout. Mirrors `render_slot` in lib.rs (checked by a test). */
export const RenderSlot = {
  phase: 0, phaseSeconds: 1, distance: 2, score: 3, coins: 4, speed: 5, playerX: 6, playerY: 7, surface: 8, motion: 9, rollSeconds: 10, runCycle: 11,
  lateral: 12, multiplier: 13, magnetSeconds: 14, sneakersSeconds: 15, multiplierSeconds: 16, hoverboardSeconds: 17, ghostSeconds: 18, stumbleSeconds: 19,
  chaserGap: 20, crashReason: 21, entityCount: 22, coinStreak: 23, verticalVelocity: 24, trackOffset: 25, blockIndex: 26, lane: 27, lastPowerUp: 28,
  hitGrace: 29, runSeconds: 30,
  entities: 32, entityStride: 8, length: 32 + MAX_ENTITIES * 8,
} as const;
/** Per entity: kind, x, y, near end (metres ahead of the runner), far end, variant, velocity, lane. */
export const EntityField = { kind: 0, x: 1, y: 2, near: 3, far: 4, variant: 5, velocity: 6, lane: 7 } as const;

/**
 * A typed-array view straight onto wasm memory (no copying). The same function is reused every frame (no allocation);
 * the view is recreated only if the memory grew, which detaches the old buffer.
 */
export function createRenderView(memory: WebAssembly.Memory, game: MetroDash): () => Float32Array {
  let buffer = memory.buffer;
  let view = new Float32Array(buffer, game.render_pointer(), RenderSlot.length);
  return () => {
    if (memory.buffer !== buffer) {
      buffer = memory.buffer;
      view = new Float32Array(buffer, game.render_pointer(), RenderSlot.length);
    }
    return view;
  };
}
