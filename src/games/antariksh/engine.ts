/** Loads the Antariksh Defenders wasm once (only when the game opens) and keeps its memory for zero-copy reads. */
import init, { AntarikshDefenders } from '../../wasm/antariksh_defenders/antariksh_defenders.js';

let ready: Promise<WebAssembly.Memory> | null = null;
export const loadAntarikshEngine = () => (ready ??= init().then(exports => exports.memory));
export { AntarikshDefenders };

/** World units: a fixed 240 × 280 playfield (portrait-friendly 6:7). Mirrors wasm/antariksh_defenders/src/world.rs. */
export const WORLD_WIDTH = 240;
export const WORLD_HEIGHT = 280;
export const PLAYER_Y = 257;
export const MYSTERY_Y = 30;
export const GROUND_Y = 268;
/** Legacy shield strip layout (the barriers were removed; the wasm keeps an always-empty byte array). */
export const SHIELD_WIDTH = 24;
export const SHIELD_HEIGHT = 16;
export const SHIELD_COUNT = 4;

/** Held-button bits for set_input. */
export const Buttons = { left: 1, right: 2, fire: 4 } as const;

export const enum Phase { Ready = 0, Countdown = 1, Playing = 2, Dying = 3, WaveClear = 4, WaveIntro = 5, GameOver = 6 }
export const enum EnemyKind {
  Asteroid = 0, Debris = 1, Drone = 2, Queen = 3, Crawler = 4, Jelly = 5, RingShard = 6, Spinner = 7, Wraith = 8, CryoMine = 9, Gunship = 10, Mech = 11, Captive = 12,
}
export const ENEMY_KIND_COUNT = 13;
/** Weapon bonus bits (render slot `weapons`). Mirrors `weapons` in world.rs. */
export const Weapons = { triple: 1, rapid: 2, both: 3 } as const;
export const enum Power { None = 0, TripleShot = 1, Bubble = 2, MachineGun = 3 }
export const enum ParticleKind { Spark = 0, Ring = 1, Ember = 2, ScoreText = 3, Shard = 4, Native = 5, RescueText = 6 }
/**
 * The journey outward from the Sun, mirrored from wasm/antariksh_defenders/src/waves.rs: seven legs, each in three sub-stages
 * (departure from the last world, transit through deep space, arrival in the destination's sky). Waves past the end repeat
 * the Aranya rescue. The render buffer's `stage` / `backdrop` slots hold the stage index (0..STAGE_COUNT-1).
 */
export const LEG_NAMES = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Aranya'] as const;
export const enum Leg { Mars = 0, Jupiter = 1, Saturn = 2, Uranus = 3, Neptune = 4, Pluto = 5, Aranya = 6 }
export const SUB_STAGE_NAMES = ['Departure', 'Transit', 'Arrival'] as const;
export const STAGES_PER_LEG = 3;
export const STAGE_COUNT = LEG_NAMES.length * STAGES_PER_LEG;
export const FINAL_LEG = Leg.Aranya;
export const stageIndex = (wave: number) => Math.min(Math.max(1, wave), STAGE_COUNT) - 1;
export const legOfStage = (stage: number) => Math.floor(stage / STAGES_PER_LEG) as Leg;
export const subStageOf = (stage: number) => stage % STAGES_PER_LEG;
const SUB_NAMES_ARANYA = ['Departure', 'Interstellar', 'Rescue'] as const;
export const STAGE_NAMES = Array.from({ length: STAGE_COUNT }, (_, stage) => {
  const leg = legOfStage(stage);
  return `${LEG_NAMES[leg]} · ${(leg === Leg.Aranya ? SUB_NAMES_ARANYA : SUB_STAGE_NAMES)[subStageOf(stage)]}`;
});
export const stageName = (wave: number) => STAGE_NAMES[stageIndex(wave)];
/** Where each leg starts from (the world being left behind on its departure stage). */
export const ORIGIN_NAMES = ['Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] as const;
/** One line under the wave banner: where you are on the journey. */
export function stageTagline(stage: number) {
  const leg = legOfStage(stage), sub = subStageOf(stage);
  if (leg === Leg.Aranya) return ['Beyond Pluto · leaving the Sun behind', 'Interstellar · Aranya calls for help', 'Free the natives · stop the Extraction Corp'][sub];
  return [`Leaving ${ORIGIN_NAMES[leg]} for ${LEG_NAMES[leg]}`, `Deep space · ${LEG_NAMES[leg]} ahead`, `${LEG_NAMES[leg]} orbit reached`][sub];
}

/** Event bits returned by advance(). Mirrors `events` in world.rs. */
export const Events = {
  shoot: 1, enemyDown: 2, playerDown: 4, march: 8, mysteryAppear: 16, mysteryDown: 32, shieldHit: 64, waveClear: 128, waveStart: 256,
  gameOver: 512, extraLife: 1024, powerUp: 2048, countdownTick: 4096, liftoff: 8192, enemyShoot: 16384, hitch: 32768, bubblePop: 65536, invaded: 131072,
  queenHit: 262144, queenDown: 524288, weaponUnlock: 1048576, rescue: 2097152, armourHit: 4194304,
} as const;

/** Pool sizes and the render buffer layout. Mirrors `render_slot` in lib.rs (checked by a test). */
export const MAX_ENEMIES = 55;
export const MAX_PLAYER_BULLETS = 40;
export const MAX_ENEMY_BULLETS = 10;
export const MAX_PARTICLES = 160;
export const MAX_CAPSULES = 2;
const ENEMIES = 32;
const PLAYER_BULLETS = ENEMIES + MAX_ENEMIES * 4;
const ENEMY_BULLETS = PLAYER_BULLETS + MAX_PLAYER_BULLETS * 3;
const PARTICLES = ENEMY_BULLETS + MAX_ENEMY_BULLETS * 4;
const CAPSULES = PARTICLES + MAX_PARTICLES * 5;
export const RenderSlot = {
  phase: 0, phaseSeconds: 1, wave: 2, score: 3, lives: 4, playerX: 5, invulnerable: 6, power: 7, powerSeconds: 8, marchFrame: 9, mysteryActive: 10,
  mysteryX: 11, mysteryDirection: 12, shake: 13, flash: 14, shieldVersion: 15, enemiesAlive: 16, playerBulletCount: 17, enemyBulletCount: 18,
  particleCount: 19, capsuleCount: 20, stage: 21, backdrop: 22, marchNote: 23, enemiesAtStart: 24, weapons: 25, queenHitsLeft: 26, queenHitsMax: 27, rescued: 28,
  enemies: ENEMIES, enemyStride: 4, playerBullets: PLAYER_BULLETS, playerBulletStride: 3, enemyBullets: ENEMY_BULLETS, enemyBulletStride: 4,
  particles: PARTICLES, particleStride: 5, capsules: CAPSULES, capsuleStride: 3, length: CAPSULES + MAX_CAPSULES * 3,
} as const;

export interface MemoryViews { render: Float32Array; shields: Uint8Array; }

/**
 * Typed-array views straight onto wasm memory (no copying). The same object is returned every frame (no allocation);
 * its views are recreated only if the memory grew, which detaches the old buffer.
 */
export function createMemoryViews(memory: WebAssembly.Memory, game: AntarikshDefenders): () => MemoryViews {
  let buffer = memory.buffer;
  const makeViews = (): MemoryViews => ({
    render: new Float32Array(buffer, game.render_pointer(), RenderSlot.length),
    shields: new Uint8Array(buffer, game.shields_pointer(), SHIELD_COUNT * SHIELD_WIDTH * SHIELD_HEIGHT),
  });
  const views = makeViews();
  return () => {
    if (memory.buffer !== buffer) {
      buffer = memory.buffer;
      const fresh = makeViews();
      views.render = fresh.render;
      views.shields = fresh.shields;
    }
    return views;
  };
}
