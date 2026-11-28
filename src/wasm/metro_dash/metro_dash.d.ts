/* tslint:disable */
/* eslint-disable */

export class MetroDash {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     */
    advance(seconds: number): number;
    coins(): number;
    crash_reason(): number;
    debug_activate(kind: number): void;
    /**
     * Clear the track ahead and stop generating it (spawn your own things with debug_spawn).
     */
    debug_clear_track(): void;
    debug_resume_spawning(): void;
    debug_set_autopilot(on: boolean): void;
    debug_set_invincible(invincible: boolean): void;
    /**
     * Put something `ahead` metres in front of the runner in `lane` (trains and ramps `length` long).
     */
    debug_spawn(kind: number, lane: number, ahead: number, y: number, length: number): boolean;
    distance(): number;
    hoverboard_seconds(): number;
    is_grounded(): boolean;
    is_rolling(): boolean;
    lane(): number;
    last_power_up(): number;
    magnet_seconds(): number;
    multiplier(): number;
    multiplier_seconds(): number;
    constructor(seed: number);
    phase(): number;
    player_x(): number;
    player_y(): number;
    press_jump(): void;
    /**
     * -1 one lane left, 1 one lane right (a press into the wall just bumps).
     */
    press_lane(direction: number): void;
    press_roll(): void;
    static render_length(): number;
    render_pointer(): number;
    /**
     * A brand-new run, straight into play.
     */
    restart(seed: number): void;
    restore(bytes: Uint8Array): boolean;
    save(): Uint8Array;
    score(): number;
    seed(): number;
    sneakers_seconds(): number;
    speed(): number;
    start(): void;
    stumbles(): number;
    surface(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_metrodash_free: (a: number, b: number) => void;
    readonly metrodash_advance: (a: number, b: number) => number;
    readonly metrodash_coins: (a: number) => number;
    readonly metrodash_crash_reason: (a: number) => number;
    readonly metrodash_debug_activate: (a: number, b: number) => void;
    readonly metrodash_debug_clear_track: (a: number) => void;
    readonly metrodash_debug_resume_spawning: (a: number) => void;
    readonly metrodash_debug_set_autopilot: (a: number, b: number) => void;
    readonly metrodash_debug_set_invincible: (a: number, b: number) => void;
    readonly metrodash_debug_spawn: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly metrodash_distance: (a: number) => number;
    readonly metrodash_hoverboard_seconds: (a: number) => number;
    readonly metrodash_is_grounded: (a: number) => number;
    readonly metrodash_is_rolling: (a: number) => number;
    readonly metrodash_lane: (a: number) => number;
    readonly metrodash_last_power_up: (a: number) => number;
    readonly metrodash_magnet_seconds: (a: number) => number;
    readonly metrodash_multiplier: (a: number) => number;
    readonly metrodash_multiplier_seconds: (a: number) => number;
    readonly metrodash_new: (a: number) => number;
    readonly metrodash_phase: (a: number) => number;
    readonly metrodash_player_x: (a: number) => number;
    readonly metrodash_player_y: (a: number) => number;
    readonly metrodash_press_jump: (a: number) => void;
    readonly metrodash_press_lane: (a: number, b: number) => void;
    readonly metrodash_press_roll: (a: number) => void;
    readonly metrodash_render_length: () => number;
    readonly metrodash_render_pointer: (a: number) => number;
    readonly metrodash_restart: (a: number, b: number) => void;
    readonly metrodash_restore: (a: number, b: number, c: number) => number;
    readonly metrodash_save: (a: number, b: number) => void;
    readonly metrodash_score: (a: number) => number;
    readonly metrodash_seed: (a: number) => number;
    readonly metrodash_sneakers_seconds: (a: number) => number;
    readonly metrodash_speed: (a: number) => number;
    readonly metrodash_start: (a: number) => void;
    readonly metrodash_stumbles: (a: number) => number;
    readonly metrodash_surface: (a: number) => number;
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
