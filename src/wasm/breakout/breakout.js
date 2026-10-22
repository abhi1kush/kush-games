/* @ts-self-types="./breakout.d.ts" */

export class Breakout {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BreakoutFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_breakout_free(ptr, 0);
    }
    /**
     * Simulate `seconds` of play (fixed 1/120 s steps inside). Returns a bitmask of events for sounds.
     * @param {number} seconds
     * @returns {number}
     */
    advance(seconds) {
        const ret = wasm.breakout_advance(this.__wbg_ptr, seconds);
        return ret >>> 0;
    }
    /**
     * @returns {Uint8Array}
     */
    bricks() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.breakout_bricks(retptr, this.__wbg_ptr);
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
    bricks_pointer() {
        const ret = wasm.breakout_bricks_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} kind
     */
    debug_power_up(kind) {
        wasm.breakout_debug_power_up(this.__wbg_ptr, kind);
    }
    /**
     * @param {number} lives
     */
    debug_set_lives(lives) {
        wasm.breakout_debug_set_lives(this.__wbg_ptr, lives);
    }
    /**
     * @param {number} level
     */
    debug_start_level(level) {
        wasm.breakout_debug_start_level(this.__wbg_ptr, level);
    }
    launch() {
        wasm.breakout_launch(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    level() {
        const ret = wasm.breakout_level(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    lives() {
        const ret = wasm.breakout_lives(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} seed
     */
    constructor(seed) {
        const ret = wasm.breakout_new(seed);
        this.__wbg_ptr = ret;
        BreakoutFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    next_level() {
        wasm.breakout_next_level(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.breakout_phase(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    render_pointer() {
        const ret = wasm.breakout_render_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    restart() {
        wasm.breakout_restart(this.__wbg_ptr);
    }
    /**
     * @param {number} level
     * @param {number} score
     * @param {number} lives
     * @param {Uint8Array} bricks
     * @returns {boolean}
     */
    restore(level, score, lives, bricks) {
        const ptr0 = passArray8ToWasm0(bricks, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.breakout_restore(this.__wbg_ptr, level, score, lives, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    score() {
        const ret = wasm.breakout_score(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Keyboard: -1 left, 0 stop, 1 right.
     * @param {number} direction
     */
    set_paddle_direction(direction) {
        wasm.breakout_set_paddle_direction(this.__wbg_ptr, direction);
    }
    /**
     * Pointer / touch: move the paddle centre towards x (world units). Pass a negative number to stop following.
     * @param {number} x
     */
    set_paddle_target(x) {
        wasm.breakout_set_paddle_target(this.__wbg_ptr, x);
    }
}
if (Symbol.dispose) Breakout.prototype[Symbol.dispose] = Breakout.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./breakout_bg.js": import0,
    };
}

const BreakoutFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_breakout_free(ptr, 1));

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

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
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

let WASM_VECTOR_LEN = 0;

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
        module_or_path = new URL('breakout_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
