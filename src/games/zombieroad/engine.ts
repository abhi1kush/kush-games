/** Loads the Zombie Road wasm once (only when the game opens) and keeps its memory for zero-copy reads. */
import init, { ZombieRoad } from '../../wasm/zombie_road/zombie_road.js';

let ready: Promise<WebAssembly.Memory> | null = null;
export const loadZombieRoadEngine = () => (ready ??= init().then(exports => exports.memory));
export { ZombieRoad };

/** World units: a fixed 240 × 320 road (portrait 3:4). Mirrors wasm/zombie_road/src/world.rs. */
export const WORLD_WIDTH = 240;
export const WORLD_HEIGHT = 320;
export const PLAYER_Y = 290;
export const DEFENSE_LINE_Y = 306;
export const MAX_HEALTH = 100;
export const POWER_SECONDS = 12;
export const WAVE_INTRO_SECONDS = 1.8;
export const WAVE_CLEAR_SECONDS = 2.2;
export const DYING_SECONDS = 1.4;
export const TANK_EVERY = 5;

/** Held-button bits for set_input. */
export const Buttons = { left: 1, right: 2, fire: 4 } as const;

export const enum Phase { Ready = 0, Playing = 1, Dying = 2, WaveClear = 3, WaveIntro = 4, GameOver = 5 }
export const enum ZombieKind { Walker = 0, Runner = 1, Brute = 2, Spitter = 3, Tank = 4 }
export const ZOMBIE_KIND_COUNT = 5;
/** Body radius per kind (world units). Mirrors `stats` in world.rs. */
export const ZOMBIE_RADIUS = [6, 5, 10, 6, 16] as const;
export const enum ZombieState { Walking = 0, Biting = 1, Spitting = 2 }
export const enum CoverKind { Barricade = 0, WreckedCar = 1 }
export const enum PickupKind { Spread = 0, Rapid = 1, Medkit = 2 }
export const enum ParticleKind { Splat = 0, Spark = 1, ScoreText = 2, Debris = 3, Acid = 4 }

/** Event bits returned by advance(). Mirrors `events` in world.rs. */
export const Events = {
  shoot: 1, zombieHit: 2, zombieDown: 4, playerHurt: 8, lifeLost: 16, waveClear: 32, waveStart: 64, gameOver: 128, pickup: 256,
  coverHit: 512, spit: 1024, breach: 2048, tankArrives: 4096, groan: 8192, tankDown: 16384, coverBroken: 32768, extraLife: 65536,
} as const;

/** Pool sizes and the render buffer layout. Mirrors `render_slot` in lib.rs (checked by a test). */
export const MAX_ZOMBIES = 40;
export const MAX_BULLETS = 36;
export const MAX_SPITS = 12;
export const MAX_PARTICLES = 120;
export const MAX_PICKUPS = 3;
export const COVER_COUNT = 4;
export const STAIN_RING = 8;
const COVERS = 32;
const ZOMBIES = COVERS + COVER_COUNT * 4;
const BULLETS = ZOMBIES + MAX_ZOMBIES * 7;
const SPITS = BULLETS + MAX_BULLETS * 2;
const PARTICLES = SPITS + MAX_SPITS * 3;
const PICKUPS = PARTICLES + MAX_PARTICLES * 5;
const STAINS = PICKUPS + MAX_PICKUPS * 4;
export const RenderSlot = {
  phase: 0, phaseSeconds: 1, wave: 2, score: 3, lives: 4, health: 5, playerX: 6, invulnerable: 7, spreadSeconds: 8, rapidSeconds: 9, shake: 10, flash: 11,
  zombiesAlive: 12, zombiesLeft: 13, zombieCount: 14, bulletCount: 15, spitCount: 16, particleCount: 17, pickupCount: 18, kills: 19, waveTotal: 20,
  tankHealth: 21, autoFire: 22, sinceShot: 23, stainSerial: 24,
  covers: COVERS, coverStride: 4, zombies: ZOMBIES, zombieStride: 7, bullets: BULLETS, bulletStride: 2, spits: SPITS, spitStride: 3,
  particles: PARTICLES, particleStride: 5, pickups: PICKUPS, pickupStride: 4, stains: STAINS, stainStride: 3, length: STAINS + STAIN_RING * 3,
} as const;

/** One line under the wave banner: what is new or special about this wave. */
export function waveTagline(wave: number): string {
  if (wave % TANK_EVERY === 0) return 'A TANK leads the horde · pour fire into it';
  switch (wave) {
    case 1: return 'Walkers shamble in · hold the line';
    case 2: return 'Runners! Fast and they dodge around cover';
    case 3: return 'Spitters lob acid · stay behind cover';
    case 4: return 'Brutes soak up bullets and smash cover';
    default: return 'The horde grows · every kind at once';
  }
}

/**
 * A typed-array view straight onto wasm memory (no copying). The same function is reused every frame (no allocation);
 * the view is recreated only if the memory grew, which detaches the old buffer.
 */
export function createRenderView(memory: WebAssembly.Memory, game: ZombieRoad): () => Float32Array {
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
