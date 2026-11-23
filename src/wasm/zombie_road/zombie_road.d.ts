/* tslint:disable */
/* eslint-disable */

export class ZombieRoad {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     */
    advance(seconds: number): number;
    auto_fire(): boolean;
    cover_health(index: number): number;
    debug_clear_wave(): void;
    debug_drop_pickup(kind: number): void;
    /**
     * x of the living zombie lowest on the road (the most dangerous), or -1.
     */
    debug_most_dangerous_zombie_x(): number;
    debug_set_health(health: number): void;
    debug_set_invincible(invincible: boolean): void;
    debug_set_lives(lives: number): void;
    debug_set_wave(wave: number): void;
    debug_spawn_zombie(kind: number, x: number, y: number): boolean;
    health(): number;
    kills(): number;
    lives(): number;
    constructor();
    phase(): number;
    player_x(): number;
    static render_length(): number;
    render_pointer(): number;
    restart(): void;
    restore(wave: number, score: number, lives: number): boolean;
    score(): number;
    seed(seed: number): void;
    set_auto_fire(on: boolean): void;
    /**
     * Held buttons: 1 left, 2 right, 4 fire.
     */
    set_input(buttons: number): void;
    /**
     * Where a finger wants the survivor (world x); negative for none.
     */
    set_target_x(x: number): void;
    start(): void;
    wave(): number;
    zombies_alive(): number;
    zombies_left(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_zombieroad_free: (a: number, b: number) => void;
    readonly zombieroad_advance: (a: number, b: number) => number;
    readonly zombieroad_auto_fire: (a: number) => number;
    readonly zombieroad_cover_health: (a: number, b: number) => number;
    readonly zombieroad_debug_clear_wave: (a: number) => void;
    readonly zombieroad_debug_drop_pickup: (a: number, b: number) => void;
    readonly zombieroad_debug_most_dangerous_zombie_x: (a: number) => number;
    readonly zombieroad_debug_set_health: (a: number, b: number) => void;
    readonly zombieroad_debug_set_invincible: (a: number, b: number) => void;
    readonly zombieroad_debug_set_lives: (a: number, b: number) => void;
    readonly zombieroad_debug_set_wave: (a: number, b: number) => void;
    readonly zombieroad_debug_spawn_zombie: (a: number, b: number, c: number, d: number) => number;
    readonly zombieroad_health: (a: number) => number;
    readonly zombieroad_kills: (a: number) => number;
    readonly zombieroad_lives: (a: number) => number;
    readonly zombieroad_new: () => number;
    readonly zombieroad_phase: (a: number) => number;
    readonly zombieroad_player_x: (a: number) => number;
    readonly zombieroad_render_length: () => number;
    readonly zombieroad_render_pointer: (a: number) => number;
    readonly zombieroad_restart: (a: number) => void;
    readonly zombieroad_restore: (a: number, b: number, c: number, d: number) => number;
    readonly zombieroad_score: (a: number) => number;
    readonly zombieroad_seed: (a: number, b: number) => void;
    readonly zombieroad_set_auto_fire: (a: number, b: number) => void;
    readonly zombieroad_set_input: (a: number, b: number) => void;
    readonly zombieroad_set_target_x: (a: number, b: number) => void;
    readonly zombieroad_start: (a: number) => void;
    readonly zombieroad_wave: (a: number) => number;
    readonly zombieroad_zombies_alive: (a: number) => number;
    readonly zombieroad_zombies_left: (a: number) => number;
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
