/* tslint:disable */
/* eslint-disable */

export class MithaiMatch {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     */
    advance(seconds: number): number;
    begin(): void;
    colour_at(cell: number): number;
    debug_place(cell: number, colour: number, special: number): void;
    debug_set_moves(moves: number): void;
    debug_set_score(score: number): void;
    goal_remaining(): number;
    goal_total(): number;
    /**
     * A valid swap as (a × 64 + b), or -1.
     */
    hint_move(): number;
    static level_count(): number;
    level(): number;
    /**
     * One fact about a level by `field`: 0 moves, colours, 1 colours, 2 goal kind (0 score, 1 collect, 2 jelly, 3 blockers), 3 goal amount, 4 goal colour, 5 two-star score, 6 three-star score.
     */
    static level_info(index: number, field: number): number;
    moves_left(): number;
    constructor();
    phase(): number;
    static render_length(): number;
    render_pointer(): number;
    score(): number;
    special_at(cell: number): number;
    specials_made(): number;
    stars(): number;
    start_level(index: number, seed: number): void;
    /**
     * 0 up, 1 right, 2 down, 3 left
     */
    swipe(cell: number, direction: number): void;
    tap(cell: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_mithaimatch_free: (a: number, b: number) => void;
    readonly mithaimatch_advance: (a: number, b: number) => number;
    readonly mithaimatch_begin: (a: number) => void;
    readonly mithaimatch_colour_at: (a: number, b: number) => number;
    readonly mithaimatch_debug_place: (a: number, b: number, c: number, d: number) => void;
    readonly mithaimatch_debug_set_moves: (a: number, b: number) => void;
    readonly mithaimatch_debug_set_score: (a: number, b: number) => void;
    readonly mithaimatch_goal_remaining: (a: number) => number;
    readonly mithaimatch_goal_total: (a: number) => number;
    readonly mithaimatch_hint_move: (a: number) => number;
    readonly mithaimatch_level: (a: number) => number;
    readonly mithaimatch_level_count: () => number;
    readonly mithaimatch_level_info: (a: number, b: number) => number;
    readonly mithaimatch_moves_left: (a: number) => number;
    readonly mithaimatch_new: () => number;
    readonly mithaimatch_phase: (a: number) => number;
    readonly mithaimatch_render_length: () => number;
    readonly mithaimatch_render_pointer: (a: number) => number;
    readonly mithaimatch_score: (a: number) => number;
    readonly mithaimatch_special_at: (a: number, b: number) => number;
    readonly mithaimatch_specials_made: (a: number) => number;
    readonly mithaimatch_stars: (a: number) => number;
    readonly mithaimatch_start_level: (a: number, b: number, c: number) => void;
    readonly mithaimatch_swipe: (a: number, b: number, c: number) => void;
    readonly mithaimatch_tap: (a: number, b: number) => void;
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
