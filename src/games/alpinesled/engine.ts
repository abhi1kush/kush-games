/** Loads the Alpine Sled wasm once (only when the game opens) and keeps its memory for zero-copy reads. */
import init, { AlpineSled } from '../../wasm/alpine_sled/alpine_sled.js';

let ready: Promise<WebAssembly.Memory> | null = null;
export const loadAlpineSledEngine = () => (ready ??= init().then(exports => exports.memory));
export { AlpineSled };

/** Mirrors wasm/alpine_sled/src/world.rs. */
export const SEGMENT_LENGTH = 4;
export const DRAW_SEGMENTS = 100;
export const VIEW_DISTANCE = SEGMENT_LENGTH * DRAW_SEGMENTS;
export const MAX_ENTITIES = 128;
export const TRAIL_HALF_WIDTH = 7;
export const RAMP_HALF_WIDTH = 1.6;
export const RAMP_HEIGHT = 1.1;
export const CRASH_SECONDS = 1.3;
export const MILESTONE_METRES = 500;

/** Held-button bits for set_input. */
export const Buttons = { left: 1, right: 2 } as const;

export const enum Phase { Ready = 0, Playing = 1, Crashing = 2, GameOver = 3 }
export const enum Motion { Sliding = 0, OnRamp = 1, Airborne = 2 }
export const enum EntityKind { Pine = 0, Boulder = 1, Snowman = 2, Log = 3, Ramp = 4, Gift = 5, Star = 6, Shield = 7 }
export const ENTITY_KIND_COUNT = 8;
/** Width and height (metres) each kind is drawn at. Mirrors `kind_size` in world.rs (drawn a little wider than it hits). */
export const ENTITY_DRAW_SIZE: readonly (readonly [number, number])[] = [
  [2.4, 3.6], // pine
  [2.3, 1.25], // boulder
  [1.5, 1.9], // snowman
  [3.2, 0.75], // log
  [3.2, 1.1], // ramp (drawn as 3D polygons)
  [1.0, 1.0], // gift
  [1.1, 1.1], // star
  [1.2, 1.2], // shield
];

/** Event bits returned by advance(). Mirrors `events` in world.rs. */
export const Events = {
  jump: 1, land: 2, ramp: 4, gift: 8, star: 16, shield: 32, shieldBreak: 64, crash: 128, gameOver: 256, milestone: 512, bankScrape: 1024,
} as const;

/** The render buffer layout. Mirrors `render_slot` in lib.rs (checked by a test). */
const SEGMENTS = 32;
const ENTITIES = SEGMENTS + DRAW_SEGMENTS * 3;
export const RenderSlot = {
  phase: 0, phaseSeconds: 1, distance: 2, score: 3, gifts: 4, stars: 5, speed: 6, playerX: 7, altitude: 8, lean: 9, shield: 10, graceSeconds: 11,
  heading: 12, firstSegment: 13, segmentCount: 14, entityCount: 15, playerRelativeX: 16, playerRelativeY: 17, playerGroundY: 18, playerRelativeZ: 19,
  motion: 20, slope: 21, collectibles: 22, curvature: 23,
  segments: SEGMENTS, segmentStride: 3, entities: ENTITIES, entityStride: 7, length: ENTITIES + MAX_ENTITIES * 7,
} as const;

/**
 * A typed-array view straight onto wasm memory (no copying). The same function is reused every frame (no allocation);
 * the view is recreated only if the memory grew, which detaches the old buffer.
 */
export function createRenderView(memory: WebAssembly.Memory, game: AlpineSled): () => Float32Array {
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
