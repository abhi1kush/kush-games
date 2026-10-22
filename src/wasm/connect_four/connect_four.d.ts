/* tslint:disable */
/* eslint-disable */

export class ConnectFour {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The computer's column for the player to move: level 0 easy, 1 medium, 2 hard. -1 if the game is over.
     */
    best_move(level: number, seed: number, node_budget: number): number;
    /**
     * 42 cells, index = column * 6 + row (row 0 = bottom): 0 empty, 1 first player, 2 second player.
     */
    cells(): Uint8Array;
    history(): Uint8Array;
    /**
     * Positions searched by the last `best_move`.
     */
    last_nodes(): number;
    /**
     * Replace the game with these columns (from a save). Returns false if they aren't a legal game.
     */
    load(columns: Uint8Array): boolean;
    constructor();
    /**
     * Drop a stone for the player to move. Returns the row (0 = bottom) or -1 if not allowed.
     */
    play(column: number): number;
    /**
     * 0 or 1: whose turn it is.
     */
    player_to_move(): number;
    undo(): boolean;
    /**
     * 0 = still playing, 1 = first player won, 2 = second player won, 3 = draw.
     */
    winner(): number;
    /**
     * Cells of the winning line(s), same numbering as `cells`.
     */
    winning_cells(): Uint8Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_connectfour_free: (a: number, b: number) => void;
    readonly connectfour_best_move: (a: number, b: number, c: number, d: number) => number;
    readonly connectfour_cells: (a: number, b: number) => void;
    readonly connectfour_history: (a: number, b: number) => void;
    readonly connectfour_last_nodes: (a: number) => number;
    readonly connectfour_load: (a: number, b: number, c: number) => number;
    readonly connectfour_new: () => number;
    readonly connectfour_play: (a: number, b: number) => number;
    readonly connectfour_player_to_move: (a: number) => number;
    readonly connectfour_undo: (a: number) => number;
    readonly connectfour_winner: (a: number) => number;
    readonly connectfour_winning_cells: (a: number, b: number) => void;
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
