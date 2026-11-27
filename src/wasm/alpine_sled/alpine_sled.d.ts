/* tslint:disable */
/* eslint-disable */

export class AlpineSled {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     */
    advance(seconds: number): number;
    altitude(): number;
    collectibles(): number;
    debug_clear_trail(): void;
    /**
     * Count of obstacles (kind < 4) within `ahead` metres of the sled.
     */
    debug_obstacles_ahead(ahead: number): number;
    debug_set_invincible(invincible: boolean): void;
    /**
     * Put something `ahead` metres in front of the sled at sideways offset `x`.
     */
    debug_spawn(kind: number, ahead: number, x: number, altitude: number): boolean;
    debug_teleport(distance: number): void;
    distance(): number;
    gifts(): number;
    has_shield(): boolean;
    motion(): number;
    constructor(seed: number);
    phase(): number;
    player_x(): number;
    press_jump(): void;
    static render_length(): number;
    render_pointer(): number;
    /**
     * A brand-new run on a new trail, straight into play.
     */
    restart(seed: number): void;
    restore(bytes: Uint8Array): boolean;
    save(): Uint8Array;
    score(): number;
    seed(): number;
    /**
     * Held buttons: 1 left, 2 right.
     */
    set_input(buttons: number): void;
    /**
     * Analog steering from a drag (-1 … 1), added to the buttons.
     */
    set_steer_axis(axis: number): void;
    /**
     * The page's layout: half the screen width ÷ the focal length, so the camera keeps the sled on screen.
     */
    set_view_half_width(view_half_width: number): void;
    /**
     * The sled's sideways screen position as a share of half the screen (0 = centre, ±1 = an edge).
     */
    sled_screen_share(): number;
    speed(): number;
    stars(): number;
    start(): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_alpinesled_free: (a: number, b: number) => void;
    readonly alpinesled_advance: (a: number, b: number) => number;
    readonly alpinesled_altitude: (a: number) => number;
    readonly alpinesled_collectibles: (a: number) => number;
    readonly alpinesled_debug_clear_trail: (a: number) => void;
    readonly alpinesled_debug_obstacles_ahead: (a: number, b: number) => number;
    readonly alpinesled_debug_set_invincible: (a: number, b: number) => void;
    readonly alpinesled_debug_spawn: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly alpinesled_debug_teleport: (a: number, b: number) => void;
    readonly alpinesled_distance: (a: number) => number;
    readonly alpinesled_gifts: (a: number) => number;
    readonly alpinesled_has_shield: (a: number) => number;
    readonly alpinesled_motion: (a: number) => number;
    readonly alpinesled_new: (a: number) => number;
    readonly alpinesled_phase: (a: number) => number;
    readonly alpinesled_player_x: (a: number) => number;
    readonly alpinesled_press_jump: (a: number) => void;
    readonly alpinesled_render_length: () => number;
    readonly alpinesled_render_pointer: (a: number) => number;
    readonly alpinesled_restart: (a: number, b: number) => void;
    readonly alpinesled_restore: (a: number, b: number, c: number) => number;
    readonly alpinesled_save: (a: number, b: number) => void;
    readonly alpinesled_score: (a: number) => number;
    readonly alpinesled_seed: (a: number) => number;
    readonly alpinesled_set_input: (a: number, b: number) => void;
    readonly alpinesled_set_steer_axis: (a: number, b: number) => void;
    readonly alpinesled_set_view_half_width: (a: number, b: number) => void;
    readonly alpinesled_sled_screen_share: (a: number) => number;
    readonly alpinesled_speed: (a: number) => number;
    readonly alpinesled_stars: (a: number) => number;
    readonly alpinesled_start: (a: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
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
