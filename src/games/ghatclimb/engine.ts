/**
 * Ghat Climb: loads the Rust/wasm jeep once (road, two-wheel physics, fuel, coins, the pass on a fixed
 * 1/120 s step) and gives the renderer a zero-copy view of the pickups.
 */
import init, { GhatClimb } from '../../wasm/ghat_climb/ghat_climb.js';

let ready: Promise<WebAssembly.Memory> | null = null;
let memory: WebAssembly.Memory | null = null;
export const loadGhatEngine = () => (ready ??= init().then(exports => { memory = exports.memory; return exports.memory; }));
export { GhatClimb };

export const FINISH_X = 1680;
export const COURSE_END = 1760;
export const FUEL_MAX = 100;
export const WHEEL_R = 6.5;
export const REAR = -16;
export const FRONT = 15.5;
export const AXLE = -5;
export const PICKUP_STRIDE = 4;

export const PHASE = { ready: 0, driving: 1, crashed: 2, stranded: 3, finished: 4 } as const;
export const BUTTON = { gas: 1, brake: 2 } as const;
export const EVENT = { coin: 1, fuel: 2, crash: 4, stranded: 8, finish: 16 } as const;
export const KIND = { coin: 1, fuel: 2 } as const;

export interface Pickup { x: number; y: number; kind: number; taken: boolean }

export function readPickups(game: GhatClimb): Pickup[] {
  if (!memory) throw new Error('engine not loaded');
  const count = game.pickup_count();
  const view = new Float32Array(memory.buffer, game.pickups_ptr(), count * PICKUP_STRIDE);
  const pickups: Pickup[] = [];
  for (let index = 0; index < count; index++) {
    const base = index * PICKUP_STRIDE;
    pickups.push({ x: view[base], y: view[base + 1], kind: view[base + 2], taken: view[base + 3] > 0.5 });
  }
  return pickups;
}

export type EngineMood = 'idle' | 'empty' | 'wheel up' | 'cruising' | 'pulling' | 'straining' | 'too steep';

/**
 * What the engine is doing, for the gauge and the exhaust. `strain` is the share of the engine the slope eats:
 * about 0.05 on the flat, where the pull goes into speed, and 0.45 on the 40° faces, where it goes into height.
 * `effort` scales that so the steepest faces on the road fill the gauge.
 */
const FULL_GAUGE = 0.5;
export function engineMood(gasHeld: boolean, fuel: number, strain: number, contact: number): { mood: EngineMood; effort: number } {
  if (!gasHeld) return { mood: 'idle', effort: 0 };
  if (fuel <= 0) return { mood: 'empty', effort: 0 };
  const effort = Math.max(0, Math.min(1, strain / FULL_GAUGE));
  if (!(contact & 1)) return { mood: 'wheel up', effort };
  if (strain >= 1) return { mood: 'too steep', effort };
  if (strain >= 0.33) return { mood: 'straining', effort };
  if (strain >= 0.15) return { mood: 'pulling', effort };
  return { mood: 'cruising', effort };
}

/** A climb in progress. Cleared when the run ends, so the hub's Continue badge means "still on the road". */
export interface RunSave { x: number; fuel: number; coins: number }
export function parseRun(data: unknown): RunSave | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const { x, fuel, coins } = record;
  if (typeof x !== 'number' || typeof fuel !== 'number' || !Number.isInteger(coins)) return null;
  if (!(x >= 20) || x > COURSE_END || !(fuel >= 0) || fuel > FUEL_MAX || (coins as number) < 0 || (coins as number) > 20) return null;
  return { x, fuel, coins: coins as number };
}
