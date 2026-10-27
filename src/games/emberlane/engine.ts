/**
 * Ember Lane: loads the Rust/wasm stage once (light, crate shadows, rat swarms, puzzles, movement, checkpoints on a
 * fixed 60 Hz step) and gives the renderer zero-copy views of its lights and rats.
 */
import init, { EmberLane, GuardSteps } from '../../wasm/ember_lane/ember_lane.js';

let ready: Promise<WebAssembly.Memory> | null = null;
let memory: WebAssembly.Memory | null = null;
export const loadEmberLaneEngine = () => (ready ??= init().then(exports => { memory = exports.memory; return exports.memory; }));
export { EmberLane, GuardSteps };

export const STAGE_END = 3760;
export const DOOR_X = 3700;
export const LIGHT_STRIDE = 8;
export const RAT_STRIDE = 8;

export const KIND = { hearth: 0, torch: 1, flicker: 2, brazier: 3, firePot: 4, lantern: 5, window: 6, door: 7 } as const;
export const STATE = { idle: 0, walk: 1, push: 2, climb: 3, throw: 4, dead: 5 } as const;
export const PROMPT = { none: 0, takeLantern: 1, dropLantern: 2, lever: 3, climb: 4, hopDown: 5 } as const;
export const PROMPT_TEXT = ['', 'Take the lantern', 'Put the lantern down', 'Pull the lever', 'Climb onto the crate', 'Hop down'];
export const EVENT = {
  ignite: 1, death: 2, checkpoint: 4, take: 8, drop: 16, lever: 32, throw: 64, fizzle: 128, clear: 256, climb: 512,
  lanternOut: 1024, potOut: 2048, respawn: 4096, push: 8192,
} as const;
export const BUTTON = { left: 1, right: 2 } as const;
export const CHECKPOINT_X = [120, 990, 1700, 2410, 3000];
export const SECTION_NAMES = ['The Hearth', 'Torch Lane', 'Brazier Square', 'Lantern Alley', 'Cooper’s Yard', 'Shutter Row'];
export const CRATE = { half: 15, height: 30 };
/** Seconds of lantern oil (matches the engine). */
export const LANTERN_OIL = 8;
export const LEVER_X = [3060, 3262];
/** The fixed stone staircase before the guttering torch (block index 1 in the engine): steps up, a landing, steps down. */
export const STAIRS = { index: 1, x: 505, half: 26, height: 26, steps: 3, landing: 8 };

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
export function ratView(game: EmberLane | GuardSteps): Float32Array {
  if (!memory) throw new Error('engine not loaded');
  return new Float32Array(memory.buffer, game.rats_ptr(), game.rat_count() * RAT_STRIDE);
}

/** Saved progress. `stage` is where Continue picks up (1 the night street, 2 the guard steps); stage two keeps its
 * own unlock, clear count and best time. Saves from before stage two existed load with stage two locked. */
export interface Progress {
  cleared: boolean; checkpoint: number; bestSeconds: number; clears: number;
  stage: 1 | 2; stage2Unlocked: boolean; stage2Clears: number; stage2BestSeconds: number;
}
export const emptyProgress = (): Progress => ({ cleared: false, checkpoint: 0, bestSeconds: 0, clears: 0, stage: 1, stage2Unlocked: false, stage2Clears: 0, stage2BestSeconds: 0 });
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isSeconds = (value: unknown) => typeof value === 'number' && value >= 0;
export function parseProgress(data: unknown): Progress | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.cleared !== 'boolean') return null;
  if (!Number.isInteger(record.checkpoint) || (record.checkpoint as number) < 0 || (record.checkpoint as number) > 4) return null;
  if (!isSeconds(record.bestSeconds) || !isCount(record.clears)) return null;
  const progress: Progress = { ...emptyProgress(), cleared: record.cleared, checkpoint: record.checkpoint as number, bestSeconds: record.bestSeconds as number, clears: record.clears as number };
  // stage two fields are optional (older saves); when present they must be sound
  if (record.stage !== undefined && record.stage !== 1 && record.stage !== 2) return null;
  if (record.stage2Unlocked !== undefined && typeof record.stage2Unlocked !== 'boolean') return null;
  if (record.stage2Clears !== undefined && !isCount(record.stage2Clears)) return null;
  if (record.stage2BestSeconds !== undefined && !isSeconds(record.stage2BestSeconds)) return null;
  progress.stage2Unlocked = (record.stage2Unlocked as boolean | undefined) ?? record.cleared;
  progress.stage = record.stage === 2 && progress.stage2Unlocked ? 2 : 1;
  progress.stage2Clears = (record.stage2Clears as number | undefined) ?? 0;
  progress.stage2BestSeconds = (record.stage2BestSeconds as number | undefined) ?? 0;
  return progress;
}

// ---------------------------------------------------------------- stage two: the guard steps
export const GUARD = {
  stageEnd: 1200, yardDepth: 48, stairsTop: 380, stairsBottom: 476, exitBottom: 960, exitTop: 1040, steps: 6, gateX: 1130,
  kabirHideX: 335, stonePileX: 250, torchX: 150, lampX: 700, patrolLeft: 545, patrolRight: 860, maxStones: 3,
  /** The rats' drain under the lamp, and how long the lamp is dark before they climb out of it. */
  drainX: 739, drainDelay: 5.5,
} as const;
export const GUARD_STATE = { patrol: 0, suspicious: 1, charge: 2, spear: 3, relight: 4, down: 5 } as const;
export const MIRA_STRIKE = 6;
export const ITEM = { ember: 0, stone: 1 } as const;
export const GUARD_PROMPT = { none: 0, takeEmber: 1, takeStones: 2, strike: 3 } as const;
export const GUARD_PROMPT_TEXT = ['', 'Take an ember from the torch', 'Pick up stones', 'Take him down'];
export const GUARD_EVENT = {
  throw: 1, snuff: 2, clatter: 4, ignite: 8, fizzle: 16, notice: 32, alarm: 64, spear: 128, death: 256, takedown: 512,
  guardRelit: 1024, take: 2048, kabirComes: 4096, clear: 8192, caught: 16384, guardEaten: 32768, bitten: 65536, ratsOut: 131072,
} as const;
/** What ended a stage-two run. */
export const KILLED_BY = { spear: 0, rats: 1 } as const;
/** Light kind for the soldier's hanging lamp (stage one's kinds go up to 7). */
export const KIND_HANGING_LAMP = 8;

export function readGuardLights(game: GuardSteps): Light[] {
  if (!memory) throw new Error('engine not loaded');
  const count = game.light_count();
  const view = new Float32Array(memory.buffer, game.lights_ptr(), count * LIGHT_STRIDE);
  return Array.from({ length: count }, (_, index) => {
    const base = index * LIGHT_STRIDE;
    return { x: view[base], height: view[base + 1], radius: view[base + 2], intensity: view[base + 3], kind: view[base + 4], lit: view[base + 5] > 0.5, left: view[base + 6], right: view[base + 7] };
  });
}

/** Where the stage-two puzzle stands, for the tutorial line. */
export interface GuardScene {
  dead?: boolean; x: number; lampLit: boolean; guardState: number; kabirFollows: boolean; stones: number; embers: number; item: number; relighting?: boolean;
  /** The rats are up out of the drain (the lamp has been dark a while). */ ratsOut?: boolean;
  /** The rats brought the soldier down. */ guardEaten?: boolean;
  /** Rats are on the soldier right now. */ guardBeset?: boolean;
}
/** Below this x on the top steps Mira is out of the yard rats' reach. */
export const RAT_SAFE_X = 460;
export function guardHint(scene: GuardScene): string {
  const { x, lampLit, guardState, kabirFollows, stones, embers, item, relighting, ratsOut, guardEaten, guardBeset } = scene;
  if (scene.dead) return '';
  const down = guardState === GUARD_STATE.down;
  const inYard = x > RAT_SAFE_X;
  if (kabirFollows) {
    if (!lampLit) return inYard ? 'The lamp is out — rats! Relight it with an ember, or get Kabir back up the steps.' : 'Relight the lamp before you take Kabir into the yard.';
    return x > GUARD.exitBottom ? 'Through the gate together.' : 'The lamp is lit and the yard is safe. Lead Kabir to the gate.';
  }
  if (down) {
    if (lampLit) return '';
    if (ratsOut && inYard) return 'Rats in the dark! Relight the lamp now — or run back up the steps.';
    const lead = guardEaten ? 'The rats took him. ' : '';
    if (embers === 0) return `${lead}Kabir won’t come down into the dark. Fetch an ember from the torch on the terrace.`;
    return item === 1 ? `${lead}Kabir won’t come down into the dark. Switch to the ember and throw it at the lamp.` : `${lead}Kabir won’t come down into the dark. Face the lamp and throw the ember to relight it.`;
  }
  if (!lampLit && ratsOut) {
    if (inYard) return 'The rats are out of the drain — get out of the dark, up the steps!';
    return guardBeset ? 'The rats are on him. Stay up here on the steps.' : 'Rats swarm the dark yard. Wait on the steps — they’ll find him.';
  }
  if (guardState === GUARD_STATE.relight) {
    if (!inYard) return 'Dark! The rats under the grate will wake soon — wait here and let them find him, or hurry down and take him down first.';
    return relighting ? 'He’s striking his tinder at the post — take him down before the rats come up!' : 'Dark! Wait until he kneels at the lamp post, then get behind him — the rats will be up soon.';
  }
  if (guardState === GUARD_STATE.charge || guardState === GUARD_STATE.spear) return 'He’s seen you — run!';
  if (x < 200) return 'A soldier guards the yard below. Kabir will hide by the barrels — go down alone.';
  if (x < GUARD.stairsBottom + 20) {
    if (!lampLit) return 'Dark now. Sneak down — get behind him before he relights it.';
    if (stones === 0) return 'Out of stones. There’s a pile on the terrace behind you.';
    return item === 0 ? 'Select stones, face the lamp and throw one — put out his light.' : 'Stay out of the light. Throw a stone at the lamp to put it out.';
  }
  return lampLit ? 'In the light he will see you. Get out of it — or put the lamp out.' : '';
}

/** Where the crate puzzle stands (Cooper's Yard). */
export interface Yard { onCrate: boolean; potLit: boolean; crateX: number }
/** The crate is out of the brazier's way once it is pushed back to here. */
export const CRATE_CLEAR_X = 2535;

/** The tutorial line for where Mira stands. */
export function hintFor(x: number, carrying: boolean, embers: number, yard?: Yard): string {
  if (yard && x > 2390 && x < 2800) {
    if (yard.crateX <= CRATE_CLEAR_X) return x < 2700 ? 'The brazier lights the whole yard now. Go on — keep Kabir close.' : '';
    if (yard.onCrate) return yard.potLit ? 'Quick, while the pot burns: hop down on the far side, then push the crate back left, behind the brazier.' : 'Safe up here — rats can’t climb. Throw an ember at the fire pot ahead.';
    if (x > yard.crateX) return yard.potLit ? 'Push the crate left, behind the brazier, before the pot burns out.' : 'Too dark! Turn round and climb back onto the crate.';
    if (x > 2450) return 'The crate blocks the brazier’s light. Climb onto it — rats can’t reach you up there.';
  }
  if (x < 300) return 'Rats fear the light. Keep yourself — and Kabir — inside it.';
  if (x > 380 && x < 640 && yard?.onCrate) return 'From the landing, watch the torch ahead gutter out and flare up. As it flares, walk down the steps and cross while it burns.';
  if (x > 430 && x < STAIRS.x) return 'Stone steps. Walk up them — once you are on the landing, the torch ahead starts to gutter.';
  if (x > STAIRS.x && x < 640) return 'Cross while the torch burns. If it gutters out, wait in the light behind you.';
  if (x > 960 && x < 1120) return embers > 0 ? 'A cold brazier in the dark. Throw an ember at it.' : 'A cold brazier in the dark…';
  if (x > 1240 && x < 1330) return 'Light the next brazier from here.';
  if (x > 1690 && x < 1800 && !carrying) return 'A lantern! Take it — the oil won’t last long.';
  if (x > 2980 && x < 3080) return 'Pull the lever to open the shutters. One rope works both windows.';
  if (x > 3240 && x < 3290) return 'The second lever opens the other window — and shuts this one.';
  if (x > 3560) return 'The sanctuary door. Go in together.';
  return '';
}
