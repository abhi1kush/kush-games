/* tslint:disable */
/* eslint-disable */

export class AntarikshDefenders {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     */
    advance(seconds: number): number;
    debug_drop_capsule(power: number): void;
    debug_launch_mystery(): void;
    /**
     * x of the living enemy closest to the ship (for aiming in tests), or -1.
     */
    debug_nearest_enemy_x(): number;
    debug_set_invincible(invincible: boolean): void;
    debug_set_wave(wave: number): void;
    debug_set_weapons(bits: number): void;
    debug_thin_formation(keep: number): void;
    enemies_alive(): number;
    formation_y(): number;
    kills(): number;
    lives(): number;
    march_interval(): number;
    constructor();
    phase(): number;
    player_x(): number;
    power(): number;
    queen_hits_left(): number;
    static render_length(): number;
    render_pointer(): number;
    restart(): void;
    restore(wave: number, score: number, lives: number): boolean;
    score(): number;
    seed(seed: number): void;
    /**
     * Held buttons: 1 left, 2 right, 4 fire.
     */
    set_input(buttons: number): void;
    /**
     * Where a finger wants the ship (world x); negative for none.
     */
    set_target_x(x: number): void;
    shield_cells_left(): number;
    static shields_length(): number;
    shields_pointer(): number;
    /**
     * The stage name for a wave ("Low Earth Orbit", "Lunar Orbit", "Mars Approach", ...).
     */
    static stage_name(wave: number): string;
    start(): void;
    wave(): number;
    weapons(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_antarikshdefenders_free: (a: number, b: number) => void;
    readonly antarikshdefenders_advance: (a: number, b: number) => number;
    readonly antarikshdefenders_debug_drop_capsule: (a: number, b: number) => void;
    readonly antarikshdefenders_debug_launch_mystery: (a: number) => void;
    readonly antarikshdefenders_debug_nearest_enemy_x: (a: number) => number;
    readonly antarikshdefenders_debug_set_invincible: (a: number, b: number) => void;
    readonly antarikshdefenders_debug_set_wave: (a: number, b: number) => void;
    readonly antarikshdefenders_debug_set_weapons: (a: number, b: number) => void;
    readonly antarikshdefenders_debug_thin_formation: (a: number, b: number) => void;
    readonly antarikshdefenders_enemies_alive: (a: number) => number;
    readonly antarikshdefenders_formation_y: (a: number) => number;
    readonly antarikshdefenders_kills: (a: number) => number;
    readonly antarikshdefenders_lives: (a: number) => number;
    readonly antarikshdefenders_march_interval: (a: number) => number;
    readonly antarikshdefenders_new: () => number;
    readonly antarikshdefenders_phase: (a: number) => number;
    readonly antarikshdefenders_player_x: (a: number) => number;
    readonly antarikshdefenders_power: (a: number) => number;
    readonly antarikshdefenders_queen_hits_left: (a: number) => number;
    readonly antarikshdefenders_render_length: () => number;
    readonly antarikshdefenders_render_pointer: (a: number) => number;
    readonly antarikshdefenders_restart: (a: number) => void;
    readonly antarikshdefenders_restore: (a: number, b: number, c: number, d: number) => number;
    readonly antarikshdefenders_score: (a: number) => number;
    readonly antarikshdefenders_seed: (a: number, b: number) => void;
    readonly antarikshdefenders_set_input: (a: number, b: number) => void;
    readonly antarikshdefenders_set_target_x: (a: number, b: number) => void;
    readonly antarikshdefenders_shield_cells_left: (a: number) => number;
    readonly antarikshdefenders_shields_length: () => number;
    readonly antarikshdefenders_shields_pointer: (a: number) => number;
    readonly antarikshdefenders_stage_name: (a: number, b: number) => void;
    readonly antarikshdefenders_start: (a: number) => void;
    readonly antarikshdefenders_wave: (a: number) => number;
    readonly antarikshdefenders_weapons: (a: number) => number;
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
