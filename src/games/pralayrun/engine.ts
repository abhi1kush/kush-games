/** Loads the Pralay Run wasm once (only when the game opens) and keeps its memory for zero-copy reads. */
import init, { PralayRun } from '../../wasm/pralay_run/pralay_run.js';

let ready: Promise<WebAssembly.Memory> | null = null;
export const loadPralayRunEngine = () => (ready ??= init().then(exports => exports.memory));
export { PralayRun };

/** World units: the view is always 270 tall and 360–540 wide. */
export const VIEW_HEIGHT = 270;
export const MIN_VIEW_WIDTH = 360;
export const MAX_VIEW_WIDTH = 540;
export const MAX_HP = 3;
export const VENT_PERIOD = 2.8;
export const VENT_ACTIVE = 1.0;
export const DASH_SECONDS = 0.17;

const MAX_PLATFORMS = 80, MAX_PROPS = 48, MAX_ENEMIES = 24, MAX_BULLETS = 40, MAX_EFFECTS = 48;
const PLATFORMS = 32, PLATFORM_STRIDE = 7, PROP_STRIDE = 6, ENEMY_STRIDE = 7, BULLET_STRIDE = 5, EFFECT_STRIDE = 5;
const PROPS = PLATFORMS + MAX_PLATFORMS * PLATFORM_STRIDE;
const ENEMIES = PROPS + MAX_PROPS * PROP_STRIDE;
const BULLETS = ENEMIES + MAX_ENEMIES * ENEMY_STRIDE;
const EFFECTS = BULLETS + MAX_BULLETS * BULLET_STRIDE;

/** Slots of the f32 render buffer (must match render_slot in wasm/pralay_run/src/lib.rs). */
export const RenderSlot = {
  heroX: 0, heroY: 1, heroVelocityX: 2, heroVelocityY: 3, heroFacing: 4, heroPose: 5, heroInvulnerable: 6, heroDash: 7, cameraX: 8, voidX: 9,
  phase: 10, score: 11, distance: 12, hp: 13, kills: 14, gems: 15, pace: 16, platformCount: 17, propCount: 18, enemyCount: 19, bulletCount: 20,
  effectCount: 21, clock: 22, heroStride: 23, airJumps: 24, canDash: 25, shotCooldown: 26, dyingTime: 27, voidSpeed: 28, elapsed: 29,
  platforms: PLATFORMS, platformStride: PLATFORM_STRIDE, props: PROPS, propStride: PROP_STRIDE, enemies: ENEMIES, enemyStride: ENEMY_STRIDE,
  bullets: BULLETS, bulletStride: BULLET_STRIDE, effects: EFFECTS, effectStride: EFFECT_STRIDE, length: EFFECTS + MAX_EFFECTS * EFFECT_STRIDE,
} as const;

export enum Phase { Ready = 0, Playing = 1, Dying = 2, GameOver = 3 }
export enum Pose { Idle = 0, Run = 1, Rise = 2, Fall = 3, Dash = 4, Hurt = 5, Dead = 6 }
export enum PlatformKind { Ground = 0, Ledge = 1, Crumble = 2, Pillar = 3 }
export enum PropKind { Spikes = 0, Vent = 1, Gem = 2, Heart = 3, Lamp = 4 }
export enum EnemyKind { Shade = 0, Wisp = 1, Idol = 2 }
export enum EffectKind { Spark = 0, Burst = 1, Score = 2, Dust = 3, Pickup = 4, Hurt = 5, Crumble = 6 }
export const Buttons = { left: 1, right: 2, jump: 4, dash: 8, fire: 16 } as const;
export const Events = {
  jump: 1, airJump: 2, dash: 4, shoot: 8, hit: 16, kill: 32, hurt: 64, gem: 128, crumble: 256, death: 512, gameOver: 1024, stomp: 2048,
  enemyShot: 4096, heart: 8192, land: 16384, orbPop: 32768, collapse: 65536,
} as const;

/**
 * A Float32Array view straight onto the wasm render buffer (no copying). The same getter is reused every frame;
 * the view is recreated only if the memory grew (which detaches the old buffer).
 */
export function createRenderView(memory: WebAssembly.Memory, game: PralayRun): () => Float32Array {
  let buffer = memory.buffer;
  let view = new Float32Array(buffer, game.render_pointer(), RenderSlot.length);
  return () => {
    if (memory.buffer !== buffer || view.byteOffset !== game.render_pointer()) {
      buffer = memory.buffer;
      view = new Float32Array(buffer, game.render_pointer(), RenderSlot.length);
    }
    return view;
  };
}
