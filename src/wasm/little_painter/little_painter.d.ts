/* tslint:disable */
/* eslint-disable */

export class LittlePainter {
    free(): void;
    [Symbol.dispose](): void;
    active_picture(): number;
    can_undo(): boolean;
    /**
     * Make the open picture white again (one undo step brings it all back).
     */
    clear(): boolean;
    color_of(picture: number, region: number): number;
    colored_count(picture: number): number;
    /**
     * Every region's colour of a picture (a copy, one byte per region).
     */
    colors(picture: number): Uint8Array;
    /**
     * Bit i set = picture i has every region painted.
     */
    completed_mask(): number;
    /**
     * Paint a region of the open picture with the selected colour. False when nothing changed.
     */
    fill(region: number): boolean;
    /**
     * Index of the first region of the open picture that is still white, or -1.
     */
    first_unpainted(): number;
    is_complete(picture: number): boolean;
    /**
     * Restore a saved book. False (and nothing changes) when the bytes aren't a valid save.
     */
    load(bytes: Uint8Array): boolean;
    /**
     * A fresh book: every picture white, the Peacock (picture 0) open, the first colour selected.
     */
    constructor();
    /**
     * 0xRRGGBB of a palette index (index 0, the eraser / unpainted, is white).
     */
    static palette_rgb(color: number): number;
    /**
     * Number of paint colours; the eraser (index 0) is extra.
     */
    static palette_size(): number;
    static picture_count(): number;
    /**
     * Number of tappable regions in a picture (0 for an unknown picture).
     */
    static region_count(picture: number): number;
    /**
     * The whole book as bytes (see `Book::save`).
     */
    save(): Uint8Array;
    select_color(color: number): boolean;
    selected_color(): number;
    set_active_picture(picture: number): boolean;
    undo(): boolean;
    undo_depth(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_littlepainter_free: (a: number, b: number) => void;
    readonly littlepainter_active_picture: (a: number) => number;
    readonly littlepainter_can_undo: (a: number) => number;
    readonly littlepainter_clear: (a: number) => number;
    readonly littlepainter_color_of: (a: number, b: number, c: number) => number;
    readonly littlepainter_colored_count: (a: number, b: number) => number;
    readonly littlepainter_colors: (a: number, b: number, c: number) => void;
    readonly littlepainter_completed_mask: (a: number) => number;
    readonly littlepainter_fill: (a: number, b: number) => number;
    readonly littlepainter_first_unpainted: (a: number) => number;
    readonly littlepainter_is_complete: (a: number, b: number) => number;
    readonly littlepainter_load: (a: number, b: number, c: number) => number;
    readonly littlepainter_new: () => number;
    readonly littlepainter_palette_rgb: (a: number) => number;
    readonly littlepainter_palette_size: () => number;
    readonly littlepainter_picture_count: () => number;
    readonly littlepainter_region_count: (a: number) => number;
    readonly littlepainter_save: (a: number, b: number) => void;
    readonly littlepainter_select_color: (a: number, b: number) => number;
    readonly littlepainter_selected_color: (a: number) => number;
    readonly littlepainter_set_active_picture: (a: number, b: number) => number;
    readonly littlepainter_undo: (a: number) => number;
    readonly littlepainter_undo_depth: (a: number) => number;
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
