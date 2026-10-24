/* tslint:disable */
/* eslint-disable */

export class SnakesLadders {
    free(): void;
    [Symbol.dispose](): void;
    static board_count(): number;
    /**
     * The board's jumps as [from, to, from, to, …] (for drawing it).
     */
    static board_jumps(board: number): Uint8Array;
    choose_move(): number;
    current(): number;
    /**
     * Tests only: the next roll's value.
     */
    debug_force_roll(value: number): void;
    debug_set_position(seat: number, square: number): void;
    legal_mask(): number;
    /**
     * No choices in this game: every roll moves the token by itself.
     */
    move_token(_token: number): boolean;
    constructor(seed: number);
    pass_turn(): boolean;
    phase(): number;
    remove_seat(seat: number): boolean;
    reseed(seed: number): void;
    restore(bytes: Uint8Array): boolean;
    roll(): number;
    set_variant(board: number): boolean;
    snapshot(): Uint8Array;
    start(seats_mask: number, first: number): boolean;
    /**
     * 0 nothing, 1 auto-rolled (strike added), 2 forfeited on the third strike
     */
    timeout(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_snakesladders_free: (a: number, b: number) => void;
    readonly snakesladders_board_count: () => number;
    readonly snakesladders_board_jumps: (a: number, b: number) => void;
    readonly snakesladders_choose_move: (a: number) => number;
    readonly snakesladders_current: (a: number) => number;
    readonly snakesladders_debug_force_roll: (a: number, b: number) => void;
    readonly snakesladders_debug_set_position: (a: number, b: number, c: number) => void;
    readonly snakesladders_legal_mask: (a: number) => number;
    readonly snakesladders_move_token: (a: number, b: number) => number;
    readonly snakesladders_new: (a: number) => number;
    readonly snakesladders_pass_turn: (a: number) => number;
    readonly snakesladders_phase: (a: number) => number;
    readonly snakesladders_remove_seat: (a: number, b: number) => number;
    readonly snakesladders_reseed: (a: number, b: number) => void;
    readonly snakesladders_restore: (a: number, b: number, c: number) => number;
    readonly snakesladders_roll: (a: number) => number;
    readonly snakesladders_set_variant: (a: number, b: number) => number;
    readonly snakesladders_snapshot: (a: number, b: number) => void;
    readonly snakesladders_start: (a: number, b: number, c: number) => number;
    readonly snakesladders_timeout: (a: number) => number;
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
