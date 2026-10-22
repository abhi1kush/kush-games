/* tslint:disable */
/* eslint-disable */

export class Breakout {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Simulate `seconds` of play (fixed 1/120 s steps inside). Returns a bitmask of events for sounds.
     */
    advance(seconds: number): number;
    bricks(): Uint8Array;
    bricks_pointer(): number;
    debug_power_up(kind: number): void;
    debug_set_lives(lives: number): void;
    debug_start_level(level: number): void;
    launch(): void;
    level(): number;
    lives(): number;
    constructor(seed: number);
    next_level(): void;
    phase(): number;
    render_pointer(): number;
    restart(): void;
    restore(level: number, score: number, lives: number, bricks: Uint8Array): boolean;
    score(): number;
    /**
     * Keyboard: -1 left, 0 stop, 1 right.
     */
    set_paddle_direction(direction: number): void;
    /**
     * Pointer / touch: move the paddle centre towards x (world units). Pass a negative number to stop following.
     */
    set_paddle_target(x: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_breakout_free: (a: number, b: number) => void;
    readonly breakout_advance: (a: number, b: number) => number;
    readonly breakout_bricks: (a: number, b: number) => void;
    readonly breakout_bricks_pointer: (a: number) => number;
    readonly breakout_debug_power_up: (a: number, b: number) => void;
    readonly breakout_debug_set_lives: (a: number, b: number) => void;
    readonly breakout_debug_start_level: (a: number, b: number) => void;
    readonly breakout_launch: (a: number) => void;
    readonly breakout_level: (a: number) => number;
    readonly breakout_lives: (a: number) => number;
    readonly breakout_new: (a: number) => number;
    readonly breakout_next_level: (a: number) => void;
    readonly breakout_phase: (a: number) => number;
    readonly breakout_render_pointer: (a: number) => number;
    readonly breakout_restart: (a: number) => void;
    readonly breakout_restore: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly breakout_score: (a: number) => number;
    readonly breakout_set_paddle_direction: (a: number, b: number) => void;
    readonly breakout_set_paddle_target: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
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
