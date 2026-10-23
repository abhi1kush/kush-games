/* tslint:disable */
/* eslint-disable */

export class KushJump {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     */
    advance(seconds: number): number;
    static checkpoint_column(): number;
    checkpoint_reached(): boolean;
    coins(): number;
    /**
     * Teleport, then lift the hero `height` units into the air (to drop onto an enemy).
     */
    debug_drop(column: number, height: number): void;
    debug_set_big(is_big: boolean): void;
    debug_teleport(column: number): void;
    /**
     * Enemies stomped or knocked out so far.
     */
    enemies_defeated(): number;
    static flag_column(): number;
    static fort_door_column(): number;
    hero_x(): number;
    hero_y(): number;
    is_big(): boolean;
    static level_columns(): number;
    static level_rows(): number;
    lives(): number;
    constructor();
    phase(): number;
    press_jump(): void;
    render_pointer(): number;
    restart(): void;
    restore(checkpoint_reached: boolean, lives: number, score: number, coins: number): boolean;
    score(): number;
    /**
     * Held buttons: 1 left, 2 right, 4 jump, 8 run.
     */
    set_input(buttons: number): void;
    /**
     * Visible width in world units (the height is always 240); the camera keeps the hero in view with it.
     */
    set_view_width(width: number): void;
    start(): void;
    tiles_pointer(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_kushjump_free: (a: number, b: number) => void;
    readonly kushjump_advance: (a: number, b: number) => number;
    readonly kushjump_checkpoint_column: () => number;
    readonly kushjump_checkpoint_reached: (a: number) => number;
    readonly kushjump_coins: (a: number) => number;
    readonly kushjump_debug_drop: (a: number, b: number, c: number) => void;
    readonly kushjump_debug_set_big: (a: number, b: number) => void;
    readonly kushjump_debug_teleport: (a: number, b: number) => void;
    readonly kushjump_enemies_defeated: (a: number) => number;
    readonly kushjump_flag_column: () => number;
    readonly kushjump_fort_door_column: () => number;
    readonly kushjump_hero_x: (a: number) => number;
    readonly kushjump_hero_y: (a: number) => number;
    readonly kushjump_is_big: (a: number) => number;
    readonly kushjump_level_columns: () => number;
    readonly kushjump_level_rows: () => number;
    readonly kushjump_lives: (a: number) => number;
    readonly kushjump_new: () => number;
    readonly kushjump_phase: (a: number) => number;
    readonly kushjump_press_jump: (a: number) => void;
    readonly kushjump_render_pointer: (a: number) => number;
    readonly kushjump_restart: (a: number) => void;
    readonly kushjump_restore: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly kushjump_score: (a: number) => number;
    readonly kushjump_set_input: (a: number, b: number) => void;
    readonly kushjump_set_view_width: (a: number, b: number) => void;
    readonly kushjump_start: (a: number) => void;
    readonly kushjump_tiles_pointer: (a: number) => number;
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
