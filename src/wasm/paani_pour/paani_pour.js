/* @ts-self-types="./paani_pour.d.ts" */

export class PaaniPour {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PaaniPourFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_paanipour_free(ptr, 0);
    }
    /**
     * @param {number} from
     * @param {number} to
     * @returns {boolean}
     */
    can_pour(from, to) {
        const ret = wasm.paanipour_can_pour(this.__wbg_ptr, from, to);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    capacity() {
        const ret = wasm.paanipour_capacity(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    colour_count() {
        const ret = wasm.paanipour_colour_count(this.__wbg_ptr);
        return ret;
    }
    /**
     * Test hook: pour the rest of a solution.
     * @returns {boolean}
     */
    debug_solve() {
        const ret = wasm.paanipour_debug_solve(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * The next pour of a solution from here as from * 16 + to; -1 if solved, none found (undo!) or no hints left.
     * Using it counts as a hint (the pour itself is left to the player).
     * @returns {number}
     */
    hint() {
        const ret = wasm.paanipour_hint(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    hints_left() {
        const ret = wasm.paanipour_hints_left(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    hints_used() {
        const ret = wasm.paanipour_hints_used(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} tube
     * @returns {boolean}
     */
    is_done(tube) {
        const ret = wasm.paanipour_is_done(this.__wbg_ptr, tube);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    is_solved() {
        const ret = wasm.paanipour_is_solved(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * No allowed pour would change anything: undo or reset.
     * @returns {boolean}
     */
    is_stuck() {
        const ret = wasm.paanipour_is_stuck(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * tube_count × capacity bytes, bottom layer first, 0 = empty
     * @returns {number}
     */
    layers_ptr() {
        const ret = wasm.paanipour_layers_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static level_count() {
        const ret = wasm.paanipour_level_count();
        return ret;
    }
    /**
     * @returns {number}
     */
    level() {
        const ret = wasm.paanipour_level(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} level
     */
    constructor(level) {
        const ret = wasm.paanipour_new(level);
        this.__wbg_ptr = ret;
        PaaniPourFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    par() {
        const ret = wasm.paanipour_par(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Same as `hint` without using one (tests).
     * @returns {number}
     */
    peek_hint() {
        const ret = wasm.paanipour_peek_hint(this.__wbg_ptr);
        return ret;
    }
    /**
     * Pour; returns how many layers moved (0 = not allowed).
     * @param {number} from
     * @param {number} to
     * @returns {number}
     */
    pour(from, to) {
        const ret = wasm.paanipour_pour(this.__wbg_ptr, from, to);
        return ret;
    }
    /**
     * @returns {number}
     */
    pours() {
        const ret = wasm.paanipour_pours(this.__wbg_ptr);
        return ret >>> 0;
    }
    reset() {
        wasm.paanipour_reset(this.__wbg_ptr);
    }
    /**
     * 3 stars at or under par, 2 within par + a quarter (at least 3 extra), else 1; any hint caps at 2.
     * @returns {number}
     */
    stars() {
        const ret = wasm.paanipour_stars(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    tube_count() {
        const ret = wasm.paanipour_tube_count(this.__wbg_ptr);
        return ret;
    }
    /**
     * Undo the last pour; returns from * 16 + to + amount * 256, or -1.
     * @returns {number}
     */
    undo() {
        const ret = wasm.paanipour_undo(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) PaaniPour.prototype[Symbol.dispose] = PaaniPour.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./paani_pour_bg.js": import0,
    };
}

const PaaniPourFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_paanipour_free(ptr, 1));

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
        module_or_path = new URL('paani_pour_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
