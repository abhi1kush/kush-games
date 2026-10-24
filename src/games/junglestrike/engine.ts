/** Loads the Jungle Strike wasm once (only when the game opens) and keeps its memory for zero-copy reads. */
import init, { JungleStrike } from '../../wasm/jungle_strike/jungle_strike.js';

let ready: Promise<WebAssembly.Memory> | null = null;
export const loadJungleStrikeEngine = () => (ready ??= init().then(exports => exports.memory));
export { JungleStrike };

/** World units: the view is always 240 units tall and 256–480 wide. */
export const WORLD_HEIGHT = 240;
export const MIN_VIEW_WIDTH = 256;
export const MAX_VIEW_WIDTH = 480;
export const GROUND_TOP = 200;
export const WATER_SURFACE_Y = 210;
export const CHECKPOINT_X = 1900;
export const BOSS_WALL_X = 3820;
export const LEVEL_END = 3900;

/** Held-button bits for set_input. */
export const Buttons = { left: 1, right: 2, up: 4, down: 8, jump: 16, fire: 32 } as const;

export const enum Phase { Ready = 0, Playing = 1, Dying = 2, GameOver = 3, BossDown = 4, Cleared = 5 }
export const enum Pose { Stand = 0, Run = 1, Somersault = 2, Fall = 3, Prone = 4, Swim = 5, Dying = 6, Hidden = 7 }
export const enum Weapon { Rifle = 0, Rapid = 1, Spread = 2, Laser = 3 }
export const enum EntityKind { Soldier = 0, Turret = 1, Cannon = 2, Sniper = 3, Capsule = 4, Pickup = 5, BossCannon = 6, BossCore = 7 }
export const enum ParticleKind { Explosion = 0, BigExplosion = 1, Spark = 2, Splash = 3, Muzzle = 4 }
export const enum PlatformKind { Ground = 0, Ledge = 1, Bridge = 2 }

export const WEAPON_LETTERS = ['', 'R', 'S', 'L'] as const;
export const WEAPON_NAMES = ['Rifle', 'Rapid', 'Spread', 'Laser'] as const;

/** Event bits returned by advance(). Mirrors wasm/jungle_strike/src/world.rs `events`. */
export const Events = {
  shoot: 1, enemyHit: 2, enemyDown: 4, explosion: 8, heroDown: 16, powerUp: 32, capsuleOpen: 64, bridgeBlast: 128, checkpoint: 256,
  lifeLost: 512, gameOver: 1024, stageClear: 2048, bossHit: 4096, jump: 8192, splash: 16384, hitch: 32768, enemyShoot: 65536, laser: 131072, bossDown: 262144,
} as const;

/** Pool sizes and the render buffer layout. Mirrors wasm/jungle_strike/src/lib.rs `render_slot` (checked by a test). */
export const PLATFORM_COUNT = 34;
export const MAX_ENTITIES = 32;
export const MAX_PLAYER_BULLETS = 40;
export const MAX_ENEMY_BULLETS = 48;
export const MAX_PARTICLES = 96;
const PLATFORM_ALIVE = 21;
const ENTITIES = PLATFORM_ALIVE + PLATFORM_COUNT;
const BULLETS = ENTITIES + MAX_ENTITIES * 8;
const ENEMY_BULLETS = BULLETS + MAX_PLAYER_BULLETS * 5;
const PARTICLES = ENEMY_BULLETS + MAX_ENEMY_BULLETS * 2;
export const RenderSlot = {
  heroX: 0, heroY: 1, heroFacing: 2, heroPose: 3, heroAim: 4, heroStride: 5, heroInvulnerable: 6, cameraX: 7, phase: 8, score: 9, lives: 10,
  continues: 11, weapon: 12, checkpoint: 13, bossActive: 14, phaseSeconds: 15, bossHealth: 16, entityCount: 17, bulletCount: 18, enemyBulletCount: 19,
  particleCount: 20, platformAlive: PLATFORM_ALIVE,
  entities: ENTITIES, entityStride: 8, bullets: BULLETS, bulletStride: 5, enemyBullets: ENEMY_BULLETS, enemyBulletStride: 2,
  particles: PARTICLES, particleStride: 4, length: PARTICLES + MAX_PARTICLES * 4,
} as const;

export interface MemoryViews { render: Float32Array; platforms: Float32Array; }

/**
 * Typed-array views straight onto wasm memory (no copying). The same object is returned every frame (no allocation);
 * its views are recreated only if the memory grew, which detaches the old buffer.
 */
export function createMemoryViews(memory: WebAssembly.Memory, game: JungleStrike): () => MemoryViews {
  let buffer = memory.buffer;
  const makeViews = (): MemoryViews => ({
    render: new Float32Array(buffer, game.render_pointer(), RenderSlot.length),
    platforms: new Float32Array(buffer, game.platforms_pointer(), PLATFORM_COUNT * 4),
  });
  const views = makeViews();
  return () => {
    if (memory.buffer !== buffer) {
      buffer = memory.buffer;
      const fresh = makeViews();
      views.render = fresh.render;
      views.platforms = fresh.platforms;
    }
    return views;
  };
}
