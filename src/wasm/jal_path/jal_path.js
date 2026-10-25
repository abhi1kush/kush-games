/* @ts-self-types="./jal_path.d.ts" */

export class JalPath {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JalPathFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_jalpath_free(ptr, 0);
    }
    /**
     * @param {number} ms
     * @returns {boolean}
     */
    add_plan_time(ms) {
        const ret = wasm.jalpath_add_plan_time(this.__wbg_ptr, ms);
        return ret !== 0;
    }
    /**
     * Advance the clock (fixed 1/60 s steps inside; at most half a second per call).
     * @param {number} ms
     */
    advance(ms) {
        wasm.jalpath_advance(this.__wbg_ptr, ms);
    }
    /**
     * @param {number} cell
     * @returns {boolean}
     */
    can_rotate(cell) {
        const ret = wasm.jalpath_can_rotate(this.__wbg_ptr, cell);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    capacity() {
        const ret = wasm.jalpath_capacity(this.__wbg_ptr);
        return ret;
    }
    /**
     * How many houses the pipes joined to the source reach right now.
     * @returns {number}
     */
    connected_houses() {
        const ret = wasm.jalpath_connected_houses(this.__wbg_ptr);
        return ret;
    }
    /**
     * Test hook: the intended orientation of a cell.
     * @param {number} cell
     * @returns {number}
     */
    debug_solution(cell) {
        const ret = wasm.jalpath_debug_solution(this.__wbg_ptr, cell);
        return ret;
    }
    /**
     * Test hook: turn every movable dry pipe to the intended route.
     */
    debug_solve() {
        wasm.jalpath_debug_solve(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    height() {
        const ret = wasm.jalpath_height(this.__wbg_ptr);
        return ret;
    }
    /**
     * Use a hint: turns one pipe into place. Returns cell * 4 + quarter turns, or -1 (none left / nothing to fix).
     * @returns {number}
     */
    hint() {
        const ret = wasm.jalpath_hint(this.__wbg_ptr);
        return ret;
    }
    /**
     * The pipe a hint would fix (or -1), without using one.
     * @returns {number}
     */
    hint_cell() {
        const ret = wasm.jalpath_hint_cell(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    hints_left() {
        const ret = wasm.jalpath_hints_left(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    hints_used() {
        const ret = wasm.jalpath_hints_used(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} house
     * @returns {number}
     */
    house_fill(house) {
        const ret = wasm.jalpath_house_fill(this.__wbg_ptr, house);
        return ret;
    }
    /**
     * @returns {number}
     */
    houses_full() {
        const ret = wasm.jalpath_houses_full(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    level() {
        const ret = wasm.jalpath_level(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    static level_count() {
        const ret = wasm.jalpath_level_count();
        return ret;
    }
    /**
     * @returns {number}
     */
    moves() {
        const ret = wasm.jalpath_moves(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Level `level` (0-based).
     * @param {number} level
     */
    constructor(level) {
        const ret = wasm.jalpath_new(level);
        this.__wbg_ptr = ret;
        JalPathFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {boolean}
     */
    open_valve() {
        const ret = wasm.jalpath_open_valve(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * 0 planning, 1 water flowing, 2 won, 3 tank empty (lost)
     * @returns {number}
     */
    phase() {
        const ret = wasm.jalpath_phase(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    plan_left_ms() {
        const ret = wasm.jalpath_plan_left_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * [source cell, source side, house cell, house side × 3]
     * @returns {Uint8Array}
     */
    ports() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.jalpath_ports(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {number} cell
     * @returns {boolean}
     */
    rotate(cell) {
        const ret = wasm.jalpath_rotate(this.__wbg_ptr, cell);
        return ret !== 0;
    }
    /**
     * Open pipe ends spilling right now, each `cell * 4 + side`.
     * @returns {Uint8Array}
     */
    spills() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.jalpath_spills(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {number}
     */
    stars() {
        const ret = wasm.jalpath_stars(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    tank() {
        const ret = wasm.jalpath_tank(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    tiles_ptr() {
        const ret = wasm.jalpath_tiles_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    width() {
        const ret = wasm.jalpath_width(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) JalPath.prototype[Symbol.dispose] = JalPath.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./jal_path_bg.js": import0,
    };
}

const JalPathFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_jalpath_free(ptr, 1));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

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
    cachedDataViewMemory0 = null;
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
        module_or_path = new URL('jal_path_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
