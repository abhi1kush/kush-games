/* tslint:disable */
/* eslint-disable */

export class EmberLane {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Run the fixed 60 Hz simulation for `ms` (at most 12 steps per call; negative or huge gaps are clamped).
     */
    advance(ms: number): void;
    carrying(): boolean;
    checkpoint(): number;
    cleared(): boolean;
    crate_x(index: number): number;
    danger(): number;
    deaths(): number;
    /**
     * Test hook: jump to a checkpoint (as if reached), keeping the stage as it is.
     */
    debug_warp(checkpoint: number): void;
    ember_active(): boolean;
    ember_x(): number;
    ember_y(): number;
    embers(): number;
    facing(): number;
    /**
     * Seconds into the windmill's light cycle (see World::windmill_angle for the sails it turns into).
     */
    flicker_phase(): number;
    interact(): void;
    lever(index: number): boolean;
    light_at(x: number): number;
    light_count(): number;
    /**
     * light_count × 8 f32: x, flame height, radius, intensity, kind, lit, left bound, right bound
     */
    lights_ptr(): number;
    constructor();
    oil(): number;
    /**
     * Standing on a crate (safe from the rats).
     */
    on_crate(): boolean;
    player_lit(): boolean;
    player_x(): number;
    player_y(): number;
    pot_left(): number;
    prompt(): number;
    rat_count(): number;
    /**
     * rat_count × 8 × 4 bytes: x, vx, lane, state (0 hidden, 1 active, 2 fleeing), timer, phase, nest, rng
     */
    rats_ptr(): number;
    /**
     * Held buttons: 1 left, 2 right.
     */
    set_input(buttons: number): void;
    sibling_facing(): number;
    sibling_lit(): boolean;
    sibling_walked(): number;
    sibling_x(): number;
    sibling_y(): number;
    /**
     * Which block Mira stands on (-1: the ground; 0 the crate, 1 the stone wall).
     */
    standing_on(): number;
    state(): number;
    state_time(): number;
    /**
     * Events since the last call (bit flags, see world.rs) — sounds and effects.
     */
    take_events(): number;
    throw_ember(): boolean;
    throw_target(): number;
    time(): number;
    walked(): number;
}

/**
 * Stage two as JavaScript sees it: the same fixed 60 Hz step as stage one.
 */
export class GuardSteps {
    free(): void;
    [Symbol.dispose](): void;
    advance(ms: number): void;
    /**
     * The spear found her and the fall is over: game over.
     */
    caught(): boolean;
    cleared(): boolean;
    /**
     * 0…1: how close the rats are to finishing Mira or Kabir.
     */
    danger(): number;
    /**
     * Seconds the lamp has been dark.
     */
    dark_time(): number;
    /**
     * Test hook: put the soldier at x facing the given way, back on patrol.
     */
    debug_guard(x: number, facing: number): void;
    /**
     * Test hook: put Mira at x (standing on the ground there).
     */
    debug_place(x: number): void;
    embers(): number;
    facing(): number;
    ground_at(x: number): number;
    guard_beset(): boolean;
    /**
     * 0…1: how close the rats are to finishing the soldier.
     */
    guard_danger(): number;
    guard_eaten(): boolean;
    guard_facing(): number;
    guard_state(): number;
    guard_time(): number;
    guard_walked(): number;
    guard_x(): number;
    guard_y(): number;
    interact(): void;
    item(): number;
    kabir_follows(): boolean;
    /**
     * What ended the run: 0 the spear, 1 the rats.
     */
    killed_by(): number;
    lamp_lit(): boolean;
    light_at(x: number): number;
    light_count(): number;
    /**
     * light_count × 8 f32, the same layout as stage one's lights.
     */
    lights_ptr(): number;
    missile_active(): boolean;
    missile_item(): number;
    missile_x(): number;
    missile_y(): number;
    constructor();
    player_lit(): boolean;
    player_x(): number;
    player_y(): number;
    prompt(): number;
    rat_count(): number;
    /**
     * rat_count × 8 × 4 bytes, the same layout as stage one's rats.
     */
    rats_ptr(): number;
    /**
     * 0…1 while he strikes his tinder at the lamp post.
     */
    relight_progress(): number;
    /**
     * SCORPION_COUNT (10, GUARD.scorpionCount in TS) × 8 × 4 bytes, the rat layout.
     */
    scorpions_ptr(): number;
    /**
     * 0 ember, 1 stone.
     */
    select_item(item: number): void;
    /**
     * Held buttons: 1 left, 2 right.
     */
    set_input(buttons: number): void;
    sibling_facing(): number;
    sibling_walked(): number;
    sibling_x(): number;
    sibling_y(): number;
    state(): number;
    state_time(): number;
    stones(): number;
    suspicion(): number;
    take_events(): number;
    /**
     * Throw whatever is selected (stone or ember). False if nothing was thrown.
     */
    throw_selected(): boolean;
    throw_target(): boolean;
    time(): number;
    toggle_item(): void;
    walked(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_emberlane_free: (a: number, b: number) => void;
    readonly __wbg_guardsteps_free: (a: number, b: number) => void;
    readonly emberlane_advance: (a: number, b: number) => void;
    readonly emberlane_carrying: (a: number) => number;
    readonly emberlane_checkpoint: (a: number) => number;
    readonly emberlane_cleared: (a: number) => number;
    readonly emberlane_crate_x: (a: number, b: number) => number;
    readonly emberlane_danger: (a: number) => number;
    readonly emberlane_deaths: (a: number) => number;
    readonly emberlane_debug_warp: (a: number, b: number) => void;
    readonly emberlane_ember_active: (a: number) => number;
    readonly emberlane_ember_x: (a: number) => number;
    readonly emberlane_ember_y: (a: number) => number;
    readonly emberlane_embers: (a: number) => number;
    readonly emberlane_facing: (a: number) => number;
    readonly emberlane_flicker_phase: (a: number) => number;
    readonly emberlane_interact: (a: number) => void;
    readonly emberlane_lever: (a: number, b: number) => number;
    readonly emberlane_light_at: (a: number, b: number) => number;
    readonly emberlane_light_count: (a: number) => number;
    readonly emberlane_lights_ptr: (a: number) => number;
    readonly emberlane_new: () => number;
    readonly emberlane_oil: (a: number) => number;
    readonly emberlane_on_crate: (a: number) => number;
    readonly emberlane_player_lit: (a: number) => number;
    readonly emberlane_player_x: (a: number) => number;
    readonly emberlane_player_y: (a: number) => number;
    readonly emberlane_pot_left: (a: number) => number;
    readonly emberlane_prompt: (a: number) => number;
    readonly emberlane_rat_count: (a: number) => number;
    readonly emberlane_rats_ptr: (a: number) => number;
    readonly emberlane_set_input: (a: number, b: number) => void;
    readonly emberlane_sibling_facing: (a: number) => number;
    readonly emberlane_sibling_lit: (a: number) => number;
    readonly emberlane_sibling_walked: (a: number) => number;
    readonly emberlane_sibling_x: (a: number) => number;
    readonly emberlane_sibling_y: (a: number) => number;
    readonly emberlane_standing_on: (a: number) => number;
    readonly emberlane_state: (a: number) => number;
    readonly emberlane_state_time: (a: number) => number;
    readonly emberlane_take_events: (a: number) => number;
    readonly emberlane_throw_ember: (a: number) => number;
    readonly emberlane_throw_target: (a: number) => number;
    readonly emberlane_time: (a: number) => number;
    readonly emberlane_walked: (a: number) => number;
    readonly guardsteps_advance: (a: number, b: number) => void;
    readonly guardsteps_caught: (a: number) => number;
    readonly guardsteps_cleared: (a: number) => number;
    readonly guardsteps_danger: (a: number) => number;
    readonly guardsteps_dark_time: (a: number) => number;
    readonly guardsteps_debug_guard: (a: number, b: number, c: number) => void;
    readonly guardsteps_debug_place: (a: number, b: number) => void;
    readonly guardsteps_embers: (a: number) => number;
    readonly guardsteps_facing: (a: number) => number;
    readonly guardsteps_ground_at: (a: number, b: number) => number;
    readonly guardsteps_guard_beset: (a: number) => number;
    readonly guardsteps_guard_danger: (a: number) => number;
    readonly guardsteps_guard_eaten: (a: number) => number;
    readonly guardsteps_guard_facing: (a: number) => number;
    readonly guardsteps_guard_state: (a: number) => number;
    readonly guardsteps_guard_time: (a: number) => number;
    readonly guardsteps_guard_walked: (a: number) => number;
    readonly guardsteps_guard_x: (a: number) => number;
    readonly guardsteps_guard_y: (a: number) => number;
    readonly guardsteps_interact: (a: number) => void;
    readonly guardsteps_item: (a: number) => number;
    readonly guardsteps_kabir_follows: (a: number) => number;
    readonly guardsteps_killed_by: (a: number) => number;
    readonly guardsteps_lamp_lit: (a: number) => number;
    readonly guardsteps_light_at: (a: number, b: number) => number;
    readonly guardsteps_light_count: (a: number) => number;
    readonly guardsteps_lights_ptr: (a: number) => number;
    readonly guardsteps_missile_active: (a: number) => number;
    readonly guardsteps_missile_item: (a: number) => number;
    readonly guardsteps_missile_x: (a: number) => number;
    readonly guardsteps_missile_y: (a: number) => number;
    readonly guardsteps_new: () => number;
    readonly guardsteps_player_lit: (a: number) => number;
    readonly guardsteps_player_x: (a: number) => number;
    readonly guardsteps_player_y: (a: number) => number;
    readonly guardsteps_prompt: (a: number) => number;
    readonly guardsteps_rat_count: (a: number) => number;
    readonly guardsteps_rats_ptr: (a: number) => number;
    readonly guardsteps_relight_progress: (a: number) => number;
    readonly guardsteps_scorpions_ptr: (a: number) => number;
    readonly guardsteps_select_item: (a: number, b: number) => void;
    readonly guardsteps_set_input: (a: number, b: number) => void;
    readonly guardsteps_sibling_facing: (a: number) => number;
    readonly guardsteps_sibling_walked: (a: number) => number;
    readonly guardsteps_sibling_x: (a: number) => number;
    readonly guardsteps_sibling_y: (a: number) => number;
    readonly guardsteps_state: (a: number) => number;
    readonly guardsteps_state_time: (a: number) => number;
    readonly guardsteps_stones: (a: number) => number;
    readonly guardsteps_suspicion: (a: number) => number;
    readonly guardsteps_take_events: (a: number) => number;
    readonly guardsteps_throw_selected: (a: number) => number;
    readonly guardsteps_throw_target: (a: number) => number;
    readonly guardsteps_time: (a: number) => number;
    readonly guardsteps_toggle_item: (a: number) => void;
    readonly guardsteps_walked: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
