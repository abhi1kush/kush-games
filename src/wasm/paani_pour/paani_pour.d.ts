/* tslint:disable */
/* eslint-disable */

export class PaaniPour {
    free(): void;
    [Symbol.dispose](): void;
    can_pour(from: number, to: number): boolean;
    capacity(): number;
    colour_count(): number;
    /**
     * Test hook: pour the rest of a solution.
     */
    debug_solve(): boolean;
    /**
     * The next pour of a solution from here as from * 16 + to; -1 if solved, none found (undo!) or no hints left.
     * Using it counts as a hint (the pour itself is left to the player).
     */
    hint(): number;
    hints_left(): number;
    hints_used(): number;
    is_done(tube: number): boolean;
    is_solved(): boolean;
    /**
     * No allowed pour would change anything: undo or reset.
     */
    is_stuck(): boolean;
    /**
     * tube_count × capacity bytes, bottom layer first, 0 = empty
     */
    layers_ptr(): number;
    static level_count(): number;
    level(): number;
    constructor(level: number);
    par(): number;
    /**
     * Same as `hint` without using one (tests).
     */
    peek_hint(): number;
    /**
     * Pour; returns how many layers moved (0 = not allowed).
     */
    pour(from: number, to: number): number;
    pours(): number;
    reset(): void;
    /**
     * 3 stars at or under par, 2 within par + a quarter (at least 3 extra), else 1; any hint caps at 2.
     */
    stars(): number;
    tube_count(): number;
    /**
     * Undo the last pour; returns from * 16 + to + amount * 256, or -1.
     */
    undo(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_paanipour_free: (a: number, b: number) => void;
    readonly paanipour_can_pour: (a: number, b: number, c: number) => number;
    readonly paanipour_capacity: (a: number) => number;
    readonly paanipour_colour_count: (a: number) => number;
    readonly paanipour_debug_solve: (a: number) => number;
    readonly paanipour_hint: (a: number) => number;
    readonly paanipour_hints_left: (a: number) => number;
    readonly paanipour_hints_used: (a: number) => number;
    readonly paanipour_is_done: (a: number, b: number) => number;
    readonly paanipour_is_solved: (a: number) => number;
    readonly paanipour_is_stuck: (a: number) => number;
    readonly paanipour_layers_ptr: (a: number) => number;
    readonly paanipour_level: (a: number) => number;
    readonly paanipour_level_count: () => number;
    readonly paanipour_new: (a: number) => number;
    readonly paanipour_par: (a: number) => number;
    readonly paanipour_peek_hint: (a: number) => number;
    readonly paanipour_pour: (a: number, b: number, c: number) => number;
    readonly paanipour_pours: (a: number) => number;
    readonly paanipour_reset: (a: number) => void;
    readonly paanipour_stars: (a: number) => number;
    readonly paanipour_tube_count: (a: number) => number;
    readonly paanipour_undo: (a: number) => number;
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
