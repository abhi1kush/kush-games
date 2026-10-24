/* tslint:disable */
/* eslint-disable */

export class FleetAi {
    free(): void;
    [Symbol.dispose](): void;
    choose(): number;
    /**
     * level 0 Easy, 1 Medium, 2 Hard
     */
    constructor(level: number, seed: number);
    record(cell: number, result: number, ship_start: number, ship_vertical: boolean): void;
}

export class FleetBoard {
    free(): void;
    [Symbol.dispose](): void;
    all_sunk(): boolean;
    can_place(ship: number, start: number, vertical: boolean): boolean;
    code(): Uint8Array;
    /**
     * A complete fleet from its 10-byte code, or undefined.
     */
    static from_code(code: Uint8Array): FleetBoard | undefined;
    is_complete(): boolean;
    constructor();
    place(ship: number, start: number, vertical: boolean): boolean;
    randomize(seed: number): void;
    remove(ship: number): void;
    /**
     * 255 if no ship is there.
     */
    ship_at(cell: number): number;
    /**
     * 0 not allowed, 1 miss, 2 hit, 10 + ship when it sinks that ship.
     */
    shoot(cell: number): number;
    sunk_mask(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_fleetai_free: (a: number, b: number) => void;
    readonly __wbg_fleetboard_free: (a: number, b: number) => void;
    readonly fleetai_choose: (a: number) => number;
    readonly fleetai_new: (a: number, b: number) => number;
    readonly fleetai_record: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly fleetboard_all_sunk: (a: number) => number;
    readonly fleetboard_can_place: (a: number, b: number, c: number, d: number) => number;
    readonly fleetboard_code: (a: number, b: number) => void;
    readonly fleetboard_from_code: (a: number, b: number) => number;
    readonly fleetboard_is_complete: (a: number) => number;
    readonly fleetboard_new: () => number;
    readonly fleetboard_place: (a: number, b: number, c: number, d: number) => number;
    readonly fleetboard_randomize: (a: number, b: number) => void;
    readonly fleetboard_remove: (a: number, b: number) => void;
    readonly fleetboard_ship_at: (a: number, b: number) => number;
    readonly fleetboard_shoot: (a: number, b: number) => number;
    readonly fleetboard_sunk_mask: (a: number) => number;
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
