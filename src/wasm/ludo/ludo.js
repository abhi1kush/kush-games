/* @ts-self-types="./ludo.d.ts" */

export class Ludo {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LudoFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ludo_free(ptr, 0);
    }
    /**
     * The move a computer player (or an auto-played turn) would make, 255 if none.
     * @returns {number}
     */
    choose_move() {
        const ret = wasm.ludo_choose_move(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    current() {
        const ret = wasm.ludo_current(this.__wbg_ptr);
        return ret;
    }
    /**
     * Tests only: the next roll's value.
     * @param {number} value
     */
    debug_force_roll(value) {
        wasm.ludo_debug_force_roll(this.__wbg_ptr, value);
    }
    /**
     * @param {number} seat
     * @param {number} token
     * @param {number} progress
     */
    debug_set_progress(seat, token, progress) {
        wasm.ludo_debug_set_progress(this.__wbg_ptr, seat, token, progress);
    }
    /**
     * @returns {number}
     */
    dice() {
        const ret = wasm.ludo_dice(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    legal_mask() {
        const ret = wasm.ludo_legal_mask(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} token
     * @returns {boolean}
     */
    move_token(token) {
        const ret = wasm.ludo_move_token(this.__wbg_ptr, token);
        return ret !== 0;
    }
    /**
     * @param {number} seed
     */
    constructor(seed) {
        const ret = wasm.ludo_new(seed);
        this.__wbg_ptr = ret;
        LudoFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {boolean}
     */
    pass_turn() {
        const ret = wasm.ludo_pass_turn(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.ludo_phase(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} seat
     * @returns {boolean}
     */
    remove_seat(seat) {
        const ret = wasm.ludo_remove_seat(this.__wbg_ptr, seat);
        return ret !== 0;
    }
    /**
     * @param {number} seed
     */
    reseed(seed) {
        wasm.ludo_reseed(this.__wbg_ptr, seed);
    }
    /**
     * @param {Uint8Array} bytes
     * @returns {boolean}
     */
    restore(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ludo_restore(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    roll() {
        const ret = wasm.ludo_roll(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint8Array}
     */
    snapshot() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.ludo_snapshot(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export2(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Seats as a bit mask (bit 0 Red, 1 Green, 2 Yellow, 3 Blue); `first` rolls first.
     * @param {number} seats_mask
     * @param {number} first
     * @returns {boolean}
     */
    start(seats_mask, first) {
        const ret = wasm.ludo_start(this.__wbg_ptr, seats_mask, first);
        return ret !== 0;
    }
    /**
     * 0 nothing, 1 auto-played (strike added), 2 forfeited on the third strike
     * @returns {number}
     */
    timeout() {
        const ret = wasm.ludo_timeout(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) Ludo.prototype[Symbol.dispose] = Ludo.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./ludo_bg.js": import0,
    };
}

const LudoFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ludo_free(ptr, 1));

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
        module_or_path = new URL('ludo_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
