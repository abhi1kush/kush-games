/* @ts-self-types="./mithai_match.d.ts" */

export class MithaiMatch {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MithaiMatchFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mithaimatch_free(ptr, 0);
    }
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     * @param {number} seconds
     * @returns {number}
     */
    advance(seconds) {
        const ret = wasm.mithaimatch_advance(this.__wbg_ptr, seconds);
        return ret >>> 0;
    }
    begin() {
        wasm.mithaimatch_begin(this.__wbg_ptr);
    }
    /**
     * @param {number} cell
     * @returns {number}
     */
    colour_at(cell) {
        const ret = wasm.mithaimatch_colour_at(this.__wbg_ptr, cell);
        return ret >>> 0;
    }
    /**
     * @param {number} cell
     * @param {number} colour
     * @param {number} special
     */
    debug_place(cell, colour, special) {
        wasm.mithaimatch_debug_place(this.__wbg_ptr, cell, colour, special);
    }
    /**
     * @param {number} moves
     */
    debug_set_moves(moves) {
        wasm.mithaimatch_debug_set_moves(this.__wbg_ptr, moves);
    }
    /**
     * @param {number} score
     */
    debug_set_score(score) {
        wasm.mithaimatch_debug_set_score(this.__wbg_ptr, score);
    }
    /**
     * @returns {number}
     */
    goal_remaining() {
        const ret = wasm.mithaimatch_goal_remaining(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    goal_total() {
        const ret = wasm.mithaimatch_goal_total(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * A valid swap as (a × 64 + b), or -1.
     * @returns {number}
     */
    hint_move() {
        const ret = wasm.mithaimatch_hint_move(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    static level_count() {
        const ret = wasm.mithaimatch_level_count();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    level() {
        const ret = wasm.mithaimatch_level(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * One fact about a level by `field`: 0 moves, colours, 1 colours, 2 goal kind (0 score, 1 collect, 2 jelly, 3 blockers), 3 goal amount, 4 goal colour, 5 two-star score, 6 three-star score.
     * @param {number} index
     * @param {number} field
     * @returns {number}
     */
    static level_info(index, field) {
        const ret = wasm.mithaimatch_level_info(index, field);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    moves_left() {
        const ret = wasm.mithaimatch_moves_left(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.mithaimatch_new();
        this.__wbg_ptr = ret;
        MithaiMatchFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.mithaimatch_phase(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static render_length() {
        const ret = wasm.mithaimatch_render_length();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    render_pointer() {
        const ret = wasm.mithaimatch_render_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    score() {
        const ret = wasm.mithaimatch_score(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} cell
     * @returns {number}
     */
    special_at(cell) {
        const ret = wasm.mithaimatch_special_at(this.__wbg_ptr, cell);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    specials_made() {
        const ret = wasm.mithaimatch_specials_made(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    stars() {
        const ret = wasm.mithaimatch_stars(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} index
     * @param {number} seed
     */
    start_level(index, seed) {
        wasm.mithaimatch_start_level(this.__wbg_ptr, index, seed);
    }
    /**
     * 0 up, 1 right, 2 down, 3 left
     * @param {number} cell
     * @param {number} direction
     */
    swipe(cell, direction) {
        wasm.mithaimatch_swipe(this.__wbg_ptr, cell, direction);
    }
    /**
     * @param {number} cell
     */
    tap(cell) {
        wasm.mithaimatch_tap(this.__wbg_ptr, cell);
    }
}
if (Symbol.dispose) MithaiMatch.prototype[Symbol.dispose] = MithaiMatch.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./mithai_match_bg.js": import0,
    };
}

const MithaiMatchFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mithaimatch_free(ptr, 1));

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('mithai_match_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
