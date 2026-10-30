/* tslint:disable */
/* eslint-disable */

export class PralayRun {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     */
    advance(seconds: number): number;
    /**
     * Remove every hazard and enemy and lay flat ground from the hero to `until` (for deterministic e2e checks).
     */
    debug_flatten(until: number): void;
    /**
     * Push the Pralay back (or forward) to `x`.
     */
    debug_set_void(x: number): void;
    /**
     * Put an enemy (0 shade, 1 wisp, 2 idol) at x on the ground the hero stands on.
     */
    debug_spawn(kind: number, x: number): void;
    distance(): number;
    enemy_count(): number;
    gems(): number;
    hero_x(): number;
    hero_y(): number;
    hp(): number;
    kills(): number;
    constructor(seed: number);
    pace(): number;
    phase(): number;
    press_dash(): void;
    press_jump(): void;
    static render_length(): number;
    render_pointer(): number;
    /**
     * A fresh run on a new layout.
     */
    restart(seed: number): void;
    score(): number;
    /**
     * Held buttons: 1 left, 2 right, 4 jump, 8 dash, 16 fire.
     */
    set_input(buttons: number): void;
    /**
     * Visible width in world units (the height is always 270).
     */
    set_view_width(width: number): void;
    start(): void;
    void_x(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_pralayrun_free: (a: number, b: number) => void;
    readonly pralayrun_advance: (a: number, b: number) => number;
    readonly pralayrun_debug_flatten: (a: number, b: number) => void;
    readonly pralayrun_debug_set_void: (a: number, b: number) => void;
    readonly pralayrun_debug_spawn: (a: number, b: number, c: number) => void;
    readonly pralayrun_distance: (a: number) => number;
    readonly pralayrun_enemy_count: (a: number) => number;
    readonly pralayrun_gems: (a: number) => number;
    readonly pralayrun_hero_x: (a: number) => number;
    readonly pralayrun_hero_y: (a: number) => number;
    readonly pralayrun_hp: (a: number) => number;
    readonly pralayrun_kills: (a: number) => number;
    readonly pralayrun_new: (a: number) => number;
    readonly pralayrun_pace: (a: number) => number;
    readonly pralayrun_phase: (a: number) => number;
    readonly pralayrun_press_dash: (a: number) => void;
    readonly pralayrun_press_jump: (a: number) => void;
    readonly pralayrun_render_length: () => number;
    readonly pralayrun_render_pointer: (a: number) => number;
    readonly pralayrun_restart: (a: number, b: number) => void;
    readonly pralayrun_score: (a: number) => number;
    readonly pralayrun_set_input: (a: number, b: number) => void;
    readonly pralayrun_set_view_width: (a: number, b: number) => void;
    readonly pralayrun_start: (a: number) => void;
    readonly pralayrun_void_x: (a: number) => number;
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
