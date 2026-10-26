/**
 * Ember Lane: loads the Rust/wasm stage once (light, crate shadows, rat swarms, puzzles, movement, checkpoints on a
 * fixed 60 Hz step) and gives the renderer zero-copy views of its lights and rats.
 */
import init, { EmberLane } from '../../wasm/ember_lane/ember_lane.js';

let ready: Promise<WebAssembly.Memory> | null = null;
let memory: WebAssembly.Memory | null = null;
export const loadEmberLaneEngine = () => (ready ??= init().then(exports => { memory = exports.memory; return exports.memory; }));
export { EmberLane };

export const STAGE_END = 3760;
export const DOOR_X = 3700;
export const LIGHT_STRIDE = 8;
export const RAT_STRIDE = 8;

export const KIND = { hearth: 0, torch: 1, flicker: 2, brazier: 3, firePot: 4, lantern: 5, window: 6, door: 7 } as const;
export const STATE = { idle: 0, walk: 1, push: 2, climb: 3, throw: 4, dead: 5 } as const;
export const PROMPT = { none: 0, takeLantern: 1, dropLantern: 2, lever: 3, climb: 4 } as const;
export const PROMPT_TEXT = ['', 'Take the lantern', 'Put the lantern down', 'Pull the lever', 'Climb over'];
export const EVENT = {
  ignite: 1, death: 2, checkpoint: 4, take: 8, drop: 16, lever: 32, throw: 64, fizzle: 128, clear: 256, climb: 512,
  lanternOut: 1024, potOut: 2048, respawn: 4096, push: 8192,
} as const;
export const BUTTON = { left: 1, right: 2 } as const;
export const CHECKPOINT_X = [120, 990, 1700, 2410, 3000];
export const SECTION_NAMES = ['The Hearth', 'Torch Lane', 'Brazier Square', 'Lantern Alley', 'Cooper’s Yard', 'Shutter Row'];
export const CRATE = { half: 15, height: 30 };
export const LEVER_X = [3060, 3262];

export interface Light { x: number; height: number; radius: number; intensity: number; kind: number; lit: boolean; left: number; right: number }
export interface Rat { x: number; vx: number; lane: number; state: number; phase: number }

export function readLights(game: EmberLane): Light[] {
  if (!memory) throw new Error('engine not loaded');
  const count = game.light_count();
  const view = new Float32Array(memory.buffer, game.lights_ptr(), count * LIGHT_STRIDE);
  const lights: Light[] = [];
  for (let index = 0; index < count; index++) {
    const base = index * LIGHT_STRIDE;
    lights.push({ x: view[base], height: view[base + 1], radius: view[base + 2], intensity: view[base + 3], kind: view[base + 4], lit: view[base + 5] > 0.5, left: view[base + 6], right: view[base + 7] });
  }
  return lights;
}

/** Rats straight from wasm memory (the view is rebuilt each frame; memory may grow). */
export function ratView(game: EmberLane): Float32Array {
  if (!memory) throw new Error('engine not loaded');
  return new Float32Array(memory.buffer, game.rats_ptr(), game.rat_count() * RAT_STRIDE);
}

export interface Progress { cleared: boolean; checkpoint: number; bestSeconds: number; clears: number }
export const emptyProgress = (): Progress => ({ cleared: false, checkpoint: 0, bestSeconds: 0, clears: 0 });
export function parseProgress(data: unknown): Progress | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.cleared !== 'boolean') return null;
  if (!Number.isInteger(record.checkpoint) || (record.checkpoint as number) < 0 || (record.checkpoint as number) > 4) return null;
  if (typeof record.bestSeconds !== 'number' || !(record.bestSeconds >= 0) || !Number.isInteger(record.clears) || (record.clears as number) < 0) return null;
  return { cleared: record.cleared, checkpoint: record.checkpoint as number, bestSeconds: record.bestSeconds, clears: record.clears as number };
}

/** The tutorial line for where Mira stands. */
export function hintFor(x: number, carrying: boolean, embers: number): string {
  if (x < 300) return 'Rats fear the light. Keep yourself — and Lio — inside it.';
  if (x > 480 && x < 610) return 'That torch keeps guttering. Wait for it to flare up, then cross.';
  if (x > 960 && x < 1120) return embers > 0 ? 'A cold brazier in the dark. Throw an ember at it.' : 'A cold brazier in the dark…';
  if (x > 1240 && x < 1330) return 'Light the next brazier from here.';
  if (x > 1690 && x < 1800 && !carrying) return 'A lantern! Take it — the oil won’t last long.';
  if (x > 2390 && x < 2560) return 'The crate hides the street from the brazier. Light the fire pot beyond it, climb over and push the crate back.';
  if (x > 2980 && x < 3080) return 'Pull the lever to open the shutters. One rope works both windows.';
  if (x > 3240 && x < 3290) return 'The second lever opens the other window — and shuts this one.';
  if (x > 3560) return 'The sanctuary door. Go in together.';
  return '';
}
