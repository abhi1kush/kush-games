/* tslint:disable */
/* eslint-disable */

export class JungleStrike {
    free(): void;
    [Symbol.dispose](): void;
    active_enemies(): number;
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     */
    advance(seconds: number): number;
    static boss_wall_x(): number;
    camera_x(): number;
    checkpoint_reached(): boolean;
    static checkpoint_x(): number;
    continue_game(): boolean;
    continues(): number;
    debug_set_invincible(invincible: boolean): void;
    debug_set_weapon(weapon: number): void;
    /**
     * Release a weapon capsule just above the hero.
     */
    debug_spawn_capsule(weapon: number): boolean;
    /**
     * Put a soldier `distance` units in front of the hero, running at it.
     */
    debug_spawn_soldier(distance: number): boolean;
    debug_teleport(x: number): void;
    enemies_defeated(): number;
    hero_aim(): number;
    hero_pose(): number;
    hero_x(): number;
    hero_y(): number;
    static level_end(): number;
    lives(): number;
    constructor();
    phase(): number;
    static platform_count(): number;
    platforms_pointer(): number;
    press_fire(): void;
    /**
     * A jump or fire tap that may be released before the next frame.
     */
    press_jump(): void;
    static render_length(): number;
    render_pointer(): number;
    restart(): void;
    restore(checkpoint_reached: boolean, lives: number, score: number, weapon: number, continues: number): boolean;
    score(): number;
    /**
     * Held buttons: 1 left, 2 right, 4 up, 8 down, 16 jump, 32 fire.
     */
    set_input(buttons: number): void;
    /**
     * Visible width in world units (the height is always 240).
     */
    set_view_width(width: number): void;
    start(): void;
    static water_left(): number;
    static water_right(): number;
    weapon(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_junglestrike_free: (a: number, b: number) => void;
    readonly junglestrike_active_enemies: (a: number) => number;
    readonly junglestrike_advance: (a: number, b: number) => number;
    readonly junglestrike_boss_wall_x: () => number;
    readonly junglestrike_camera_x: (a: number) => number;
    readonly junglestrike_checkpoint_reached: (a: number) => number;
    readonly junglestrike_checkpoint_x: () => number;
    readonly junglestrike_continue_game: (a: number) => number;
    readonly junglestrike_continues: (a: number) => number;
    readonly junglestrike_debug_set_invincible: (a: number, b: number) => void;
    readonly junglestrike_debug_set_weapon: (a: number, b: number) => void;
    readonly junglestrike_debug_spawn_capsule: (a: number, b: number) => number;
    readonly junglestrike_debug_spawn_soldier: (a: number, b: number) => number;
    readonly junglestrike_debug_teleport: (a: number, b: number) => void;
    readonly junglestrike_enemies_defeated: (a: number) => number;
    readonly junglestrike_hero_aim: (a: number) => number;
    readonly junglestrike_hero_pose: (a: number) => number;
    readonly junglestrike_hero_x: (a: number) => number;
    readonly junglestrike_hero_y: (a: number) => number;
    readonly junglestrike_level_end: () => number;
    readonly junglestrike_lives: (a: number) => number;
    readonly junglestrike_new: () => number;
    readonly junglestrike_phase: (a: number) => number;
    readonly junglestrike_platform_count: () => number;
    readonly junglestrike_platforms_pointer: (a: number) => number;
    readonly junglestrike_press_fire: (a: number) => void;
    readonly junglestrike_press_jump: (a: number) => void;
    readonly junglestrike_render_length: () => number;
    readonly junglestrike_render_pointer: (a: number) => number;
    readonly junglestrike_restart: (a: number) => void;
    readonly junglestrike_restore: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly junglestrike_score: (a: number) => number;
    readonly junglestrike_set_input: (a: number, b: number) => void;
    readonly junglestrike_set_view_width: (a: number, b: number) => void;
    readonly junglestrike_start: (a: number) => void;
    readonly junglestrike_water_left: () => number;
    readonly junglestrike_water_right: () => number;
    readonly junglestrike_weapon: (a: number) => number;
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
