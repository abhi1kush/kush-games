/* tslint:disable */
/* eslint-disable */

export class JalPath {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Advance the clock (fixed 1/60 s steps inside; at most half a second per call).
     */
    advance(ms: number): void;
    can_rotate(cell: number): boolean;
    capacity(): number;
    /**
     * How many houses the pipes joined to the source reach right now.
     */
    connected_houses(): number;
    /**
     * Test hook: the intended orientation of a cell.
     */
    debug_solution(cell: number): number;
    /**
     * Test hook: turn every movable dry pipe to the intended route.
     */
    debug_solve(): void;
    height(): number;
    house_fill(house: number): number;
    houses_full(): number;
    level(): number;
    static level_count(): number;
    moves(): number;
    /**
     * Level `level` (0-based).
     */
    constructor(level: number);
    open_valve(): boolean;
    /**
     * 0 planning, 1 water flowing, 2 won, 3 tank empty (lost)
     */
    phase(): number;
    plan_left_ms(): number;
    /**
     * [source cell, source side, house cell, house side × 3]
     */
    ports(): Uint8Array;
    rotate(cell: number): boolean;
    /**
     * Open pipe ends spilling right now, each `cell * 4 + side`.
     */
    spills(): Uint8Array;
    stars(): number;
    tank(): number;
    tiles_ptr(): number;
    width(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_jalpath_free: (a: number, b: number) => void;
    readonly jalpath_advance: (a: number, b: number) => void;
    readonly jalpath_can_rotate: (a: number, b: number) => number;
    readonly jalpath_capacity: (a: number) => number;
    readonly jalpath_connected_houses: (a: number) => number;
    readonly jalpath_debug_solution: (a: number, b: number) => number;
    readonly jalpath_debug_solve: (a: number) => void;
    readonly jalpath_height: (a: number) => number;
    readonly jalpath_house_fill: (a: number, b: number) => number;
    readonly jalpath_houses_full: (a: number) => number;
    readonly jalpath_level: (a: number) => number;
    readonly jalpath_level_count: () => number;
    readonly jalpath_moves: (a: number) => number;
    readonly jalpath_new: (a: number) => number;
    readonly jalpath_open_valve: (a: number) => number;
    readonly jalpath_phase: (a: number) => number;
    readonly jalpath_plan_left_ms: (a: number) => number;
    readonly jalpath_ports: (a: number, b: number) => void;
    readonly jalpath_rotate: (a: number, b: number) => number;
    readonly jalpath_spills: (a: number, b: number) => void;
    readonly jalpath_stars: (a: number) => number;
    readonly jalpath_tank: (a: number) => number;
    readonly jalpath_tiles_ptr: (a: number) => number;
    readonly jalpath_width: (a: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
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
