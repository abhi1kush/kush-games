/* tslint:disable */
/* eslint-disable */

export class Carrom {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Up to `steps` fixed steps (1/400 s each). False once everything rests and the shot is scored.
     */
    advance(steps: number): boolean;
    /**
     * The computer's shot: [x, aim_x, aim_y, power].
     */
    ai_shot(level: number, seed: number): Float32Array;
    /**
     * Address of the disc pool in wasm memory (20 × 7 f32: striker, queen, 9 white, 9 black).
     */
    bodies_ptr(): number;
    can_place(x: number): boolean;
    /**
     * Test hook: move a disc (on = false pockets it).
     */
    debug_put(index: number, x: number, y: number, on: boolean): void;
    due(player: number): number;
    /**
     * Last finished shot: [player, foul, own, opponent, queen bits, returned, again]
     */
    last_outcome(): Uint8Array;
    constructor();
    /**
     * 0 aiming, 1 discs moving, 2 over
     */
    phase(): number;
    place_striker(x: number): boolean;
    pocketed(player: number): number;
    points(): number;
    queen_owner(): number;
    /**
     * 0 on the board, 1 pocketed and waiting to be covered, 2 covered
     */
    queen_state(): number;
    reset(): void;
    settle(): void;
    shoot(x: number, aim_x: number, aim_y: number, power: number): boolean;
    shots(): number;
    /**
     * Strongest coin hit and cushion hit (speed) and pockets since the last call: coin | cushion << 12 | pockets << 24.
     */
    take_impacts(): number;
    turn(): number;
    /**
     * 255 while playing
     */
    winner(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_carrom_free: (a: number, b: number) => void;
    readonly carrom_advance: (a: number, b: number) => number;
    readonly carrom_ai_shot: (a: number, b: number, c: number, d: number) => void;
    readonly carrom_bodies_ptr: (a: number) => number;
    readonly carrom_can_place: (a: number, b: number) => number;
    readonly carrom_debug_put: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly carrom_due: (a: number, b: number) => number;
    readonly carrom_last_outcome: (a: number, b: number) => void;
    readonly carrom_new: () => number;
    readonly carrom_phase: (a: number) => number;
    readonly carrom_place_striker: (a: number, b: number) => number;
    readonly carrom_pocketed: (a: number, b: number) => number;
    readonly carrom_points: (a: number) => number;
    readonly carrom_queen_owner: (a: number) => number;
    readonly carrom_queen_state: (a: number) => number;
    readonly carrom_reset: (a: number) => void;
    readonly carrom_settle: (a: number) => void;
    readonly carrom_shoot: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly carrom_shots: (a: number) => number;
    readonly carrom_take_impacts: (a: number) => number;
    readonly carrom_turn: (a: number) => number;
    readonly carrom_winner: (a: number) => number;
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
