/* tslint:disable */
/* eslint-disable */

export class Checkers {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Play legal move number `index`.
     */
    apply(index: number): boolean;
    /**
     * The computer's move index for the side to move (level 0 easy, 1 medium, 2 hard), -1 if none.
     */
    best_move(level: number, seed: number, node_budget: number): number;
    /**
     * Bitmask of pieces that have a capture (captures are compulsory).
     */
    capturing_pieces(): number;
    /**
     * 32 squares: 0 empty, 1 dark man, 2 dark king, 3 light man, 4 light king.
     */
    cells(): Uint8Array;
    history(): Uint8Array;
    last_nodes(): number;
    /**
     * Legal moves, flattened: for each move `from, capturedMask, pathLength, path…`.
     */
    legal_moves(): Uint32Array;
    load(history: Uint8Array): boolean;
    move_count(): number;
    constructor();
    quiet_plies(): number;
    /**
     * Set up an arbitrary position (used by tests): bitmasks plus side to move.
     */
    set_position(dark: number, light: number, kings: number, side: number): void;
    side_to_move(): number;
    /**
     * Take back `plies` moves (e.g. 2 to undo your move and the computer's reply).
     */
    undo(plies: number): boolean;
    /**
     * 0 playing, 1 dark won, 2 light won, 3 draw.
     */
    winner(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_checkers_free: (a: number, b: number) => void;
    readonly checkers_apply: (a: number, b: number) => number;
    readonly checkers_best_move: (a: number, b: number, c: number, d: number) => number;
    readonly checkers_capturing_pieces: (a: number) => number;
    readonly checkers_cells: (a: number, b: number) => void;
    readonly checkers_history: (a: number, b: number) => void;
    readonly checkers_last_nodes: (a: number) => number;
    readonly checkers_legal_moves: (a: number, b: number) => void;
    readonly checkers_load: (a: number, b: number, c: number) => number;
    readonly checkers_move_count: (a: number) => number;
    readonly checkers_new: () => number;
    readonly checkers_quiet_plies: (a: number) => number;
    readonly checkers_set_position: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly checkers_side_to_move: (a: number) => number;
    readonly checkers_undo: (a: number, b: number) => number;
    readonly checkers_winner: (a: number) => number;
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
