/* tslint:disable */
/* eslint-disable */

export class Solitaire {
    free(): void;
    [Symbol.dispose](): void;
    actions(): Uint8Array;
    /**
     * Tap-to-move: send the cards to the best legal place (foundation first). Returns the destination or -1.
     */
    auto_move(from: number, count: number): number;
    /**
     * Every card is face up and the stock/waste are empty: the rest can be played automatically.
     */
    can_auto_finish(): boolean;
    draw_count(): number;
    /**
     * Turn cards from the stock (or turn the waste back over when the stock is empty).
     */
    draw(): boolean;
    /**
     * Move one card to a foundation if it's safe (or any card when `safe_only` is false). Returns [from, to] or empty.
     */
    foundation_step(safe_only: boolean): Uint8Array;
    /**
     * A useful move as [from, count, to], [0] for "draw", or empty when nothing helps.
     */
    hint(): Uint8Array;
    is_won(): boolean;
    /**
     * Layout: stockCount, wasteCount, waste…, then per foundation count, cards…, then per column count, faceDownCount, cards….
     * Cards are 0–51: suit = card / 13 (♠ ♥ ♦ ♣), rank = card % 13 (0 = ace).
     */
    layout(): Uint8Array;
    /**
     * Rebuild a saved game. Returns false (and leaves a fresh deal) if the actions don't replay.
     */
    load(seed: number, draw_count: number, actions: Uint8Array): boolean;
    /**
     * Move `count` cards from location `from` to location `to` (0 stock, 1 waste, 2–5 foundations ♠♥♦♣, 6–12 columns).
     */
    move_cards(from: number, count: number, to: number): boolean;
    moves(): number;
    constructor(seed: number, draw_count: number);
    score(): number;
    seed(): number;
    undo(): boolean;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_solitaire_free: (a: number, b: number) => void;
    readonly solitaire_actions: (a: number, b: number) => void;
    readonly solitaire_auto_move: (a: number, b: number, c: number) => number;
    readonly solitaire_can_auto_finish: (a: number) => number;
    readonly solitaire_draw: (a: number) => number;
    readonly solitaire_draw_count: (a: number) => number;
    readonly solitaire_foundation_step: (a: number, b: number, c: number) => void;
    readonly solitaire_hint: (a: number, b: number) => void;
    readonly solitaire_is_won: (a: number) => number;
    readonly solitaire_layout: (a: number, b: number) => void;
    readonly solitaire_load: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly solitaire_move_cards: (a: number, b: number, c: number, d: number) => number;
    readonly solitaire_moves: (a: number) => number;
    readonly solitaire_new: (a: number, b: number) => number;
    readonly solitaire_score: (a: number) => number;
    readonly solitaire_seed: (a: number) => number;
    readonly solitaire_undo: (a: number) => number;
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
