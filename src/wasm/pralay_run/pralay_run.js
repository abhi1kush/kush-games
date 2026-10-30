/* @ts-self-types="./pralay_run.d.ts" */

export class PralayRun {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PralayRunFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pralayrun_free(ptr, 0);
    }
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     * @param {number} seconds
     * @returns {number}
     */
    advance(seconds) {
        const ret = wasm.pralayrun_advance(this.__wbg_ptr, seconds);
        return ret >>> 0;
    }
    /**
     * Remove every hazard and enemy and lay flat ground from the hero to `until` (for deterministic e2e checks).
     * @param {number} until
     */
    debug_flatten(until) {
        wasm.pralayrun_debug_flatten(this.__wbg_ptr, until);
    }
    /**
     * Push the Pralay back (or forward) to `x`.
     * @param {number} x
     */
    debug_set_void(x) {
        wasm.pralayrun_debug_set_void(this.__wbg_ptr, x);
    }
    /**
     * Put an enemy (0 shade, 1 wisp, 2 idol) at x on the ground the hero stands on.
     * @param {number} kind
     * @param {number} x
     */
    debug_spawn(kind, x) {
        wasm.pralayrun_debug_spawn(this.__wbg_ptr, kind, x);
    }
    /**
     * @returns {number}
     */
    distance() {
        const ret = wasm.pralayrun_distance(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    enemy_count() {
        const ret = wasm.pralayrun_enemy_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    gems() {
        const ret = wasm.pralayrun_gems(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    hero_x() {
        const ret = wasm.pralayrun_hero_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    hero_y() {
        const ret = wasm.pralayrun_hero_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    hp() {
        const ret = wasm.pralayrun_hp(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    kills() {
        const ret = wasm.pralayrun_kills(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} seed
     */
    constructor(seed) {
        const ret = wasm.pralayrun_new(seed);
        this.__wbg_ptr = ret;
        PralayRunFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    pace() {
        const ret = wasm.pralayrun_pace(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.pralayrun_phase(this.__wbg_ptr);
        return ret >>> 0;
    }
    press_dash() {
        wasm.pralayrun_press_dash(this.__wbg_ptr);
    }
    press_jump() {
        wasm.pralayrun_press_jump(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    static render_length() {
        const ret = wasm.pralayrun_render_length();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    render_pointer() {
        const ret = wasm.pralayrun_render_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * A fresh run on a new layout.
     * @param {number} seed
     */
    restart(seed) {
        wasm.pralayrun_restart(this.__wbg_ptr, seed);
    }
    /**
     * @returns {number}
     */
    score() {
        const ret = wasm.pralayrun_score(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Held buttons: 1 left, 2 right, 4 jump, 8 dash, 16 fire.
     * @param {number} buttons
     */
    set_input(buttons) {
        wasm.pralayrun_set_input(this.__wbg_ptr, buttons);
    }
    /**
     * Visible width in world units (the height is always 270).
     * @param {number} width
     */
    set_view_width(width) {
        wasm.pralayrun_set_view_width(this.__wbg_ptr, width);
    }
    start() {
        wasm.pralayrun_start(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    void_x() {
        const ret = wasm.pralayrun_void_x(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) PralayRun.prototype[Symbol.dispose] = PralayRun.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./pralay_run_bg.js": import0,
    };
}

const PralayRunFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pralayrun_free(ptr, 1));

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
        module_or_path = new URL('pralay_run_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
