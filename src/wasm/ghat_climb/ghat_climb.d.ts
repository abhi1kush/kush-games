/* tslint:disable */
/* eslint-disable */

export class GhatClimb {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Run the fixed step for `ms` (at most 10 steps per call; negative or huge gaps are dropped).
     */
    advance(ms: number): void;
    angle(): number;
    coins(): number;
    /**
     * Bit 1 rear tyre on the road, bit 2 front tyre.
     */
    contact(): number;
    course_end(): number;
    distance(): number;
    /**
     * Engine pull this step, 0 to 1.
     */
    drive(): number;
    finish_x(): number;
    fuel(): number;
    grade_at(x: number): number;
    height_at(x: number): number;
    constructor();
    phase(): number;
    pickup_count(): number;
    /**
     * pickup_count × 4 f32: x, y, kind, taken
     */
    pickups_ptr(): number;
    /**
     * Test and resume hook: put the jeep back on the road.
     */
    restore(x: number, fuel: number, coins: number): void;
    score(): number;
    /**
     * Held buttons: 1 gas, 2 brake.
     */
    set_input(buttons: number): void;
    speed(): number;
    spin(): number;
    start(): void;
    /**
     * Share of the engine spent holding the slope; past 1 the hill wins.
     */
    strain(): number;
    take_events(): number;
    time(): number;
    touch(): number;
    x(): number;
    y(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_ghatclimb_free: (a: number, b: number) => void;
    readonly ghatclimb_advance: (a: number, b: number) => void;
    readonly ghatclimb_angle: (a: number) => number;
    readonly ghatclimb_coins: (a: number) => number;
    readonly ghatclimb_contact: (a: number) => number;
    readonly ghatclimb_course_end: (a: number) => number;
    readonly ghatclimb_distance: (a: number) => number;
    readonly ghatclimb_drive: (a: number) => number;
    readonly ghatclimb_finish_x: (a: number) => number;
    readonly ghatclimb_fuel: (a: number) => number;
    readonly ghatclimb_grade_at: (a: number, b: number) => number;
    readonly ghatclimb_height_at: (a: number, b: number) => number;
    readonly ghatclimb_new: () => number;
    readonly ghatclimb_phase: (a: number) => number;
    readonly ghatclimb_pickup_count: (a: number) => number;
    readonly ghatclimb_pickups_ptr: (a: number) => number;
    readonly ghatclimb_restore: (a: number, b: number, c: number, d: number) => void;
    readonly ghatclimb_score: (a: number) => number;
    readonly ghatclimb_set_input: (a: number, b: number) => void;
    readonly ghatclimb_speed: (a: number) => number;
    readonly ghatclimb_spin: (a: number) => number;
    readonly ghatclimb_start: (a: number) => void;
    readonly ghatclimb_strain: (a: number) => number;
    readonly ghatclimb_take_events: (a: number) => number;
    readonly ghatclimb_time: (a: number) => number;
    readonly ghatclimb_touch: (a: number) => number;
    readonly ghatclimb_x: (a: number) => number;
    readonly ghatclimb_y: (a: number) => number;
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
