/* tslint:disable */
/* eslint-disable */

export class Ludo {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The move a computer player (or an auto-played turn) would make, 255 if none.
     */
    choose_move(): number;
    current(): number;
    /**
     * Tests only: the next roll's value.
     */
    debug_force_roll(value: number): void;
    debug_set_progress(seat: number, token: number, progress: number): void;
    dice(): number;
    legal_mask(): number;
    move_token(token: number): boolean;
    constructor(seed: number);
    pass_turn(): boolean;
    phase(): number;
    remove_seat(seat: number): boolean;
    reseed(seed: number): void;
    restore(bytes: Uint8Array): boolean;
    roll(): number;
    snapshot(): Uint8Array;
    /**
     * Seats as a bit mask (bit 0 Red, 1 Green, 2 Yellow, 3 Blue); `first` rolls first.
     */
    start(seats_mask: number, first: number): boolean;
    /**
     * 0 nothing, 1 auto-played (strike added), 2 forfeited on the third strike
     */
    timeout(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_ludo_free: (a: number, b: number) => void;
    readonly ludo_choose_move: (a: number) => number;
    readonly ludo_current: (a: number) => number;
    readonly ludo_debug_force_roll: (a: number, b: number) => void;
    readonly ludo_debug_set_progress: (a: number, b: number, c: number, d: number) => void;
    readonly ludo_dice: (a: number) => number;
    readonly ludo_legal_mask: (a: number) => number;
    readonly ludo_move_token: (a: number, b: number) => number;
    readonly ludo_new: (a: number) => number;
    readonly ludo_pass_turn: (a: number) => number;
    readonly ludo_phase: (a: number) => number;
    readonly ludo_remove_seat: (a: number, b: number) => number;
    readonly ludo_reseed: (a: number, b: number) => void;
    readonly ludo_restore: (a: number, b: number, c: number) => number;
    readonly ludo_roll: (a: number) => number;
    readonly ludo_snapshot: (a: number, b: number) => void;
    readonly ludo_start: (a: number, b: number, c: number) => number;
    readonly ludo_timeout: (a: number) => number;
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
