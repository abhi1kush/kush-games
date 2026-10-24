/* @ts-self-types="./carrom.d.ts" */

export class Carrom {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CarromFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_carrom_free(ptr, 0);
    }
    /**
     * Up to `steps` fixed steps (1/400 s each). False once everything rests and the shot is scored.
     * @param {number} steps
     * @returns {boolean}
     */
    advance(steps) {
        const ret = wasm.carrom_advance(this.__wbg_ptr, steps);
        return ret !== 0;
    }
    /**
     * The computer's shot: [x, aim_x, aim_y, power].
     * @param {number} level
     * @param {number} seed
     * @returns {Float32Array}
     */
    ai_shot(level, seed) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.carrom_ai_shot(retptr, this.__wbg_ptr, level, seed);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Address of the disc pool in wasm memory (20 × 7 f32: striker, queen, 9 white, 9 black).
     * @returns {number}
     */
    bodies_ptr() {
        const ret = wasm.carrom_bodies_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} x
     * @returns {boolean}
     */
    can_place(x) {
        const ret = wasm.carrom_can_place(this.__wbg_ptr, x);
        return ret !== 0;
    }
    /**
     * Test hook: move a disc (on = false pockets it).
     * @param {number} index
     * @param {number} x
     * @param {number} y
     * @param {boolean} on
     */
    debug_put(index, x, y, on) {
        wasm.carrom_debug_put(this.__wbg_ptr, index, x, y, on);
    }
    /**
     * @param {number} player
     * @returns {number}
     */
    due(player) {
        const ret = wasm.carrom_due(this.__wbg_ptr, player);
        return ret;
    }
    /**
     * Last finished shot: [player, foul, own, opponent, queen bits, returned, again]
     * @returns {Uint8Array}
     */
    last_outcome() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.carrom_last_outcome(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    constructor() {
        const ret = wasm.carrom_new();
        this.__wbg_ptr = ret;
        CarromFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * 0 aiming, 1 discs moving, 2 over
     * @returns {number}
     */
    phase() {
        const ret = wasm.carrom_phase(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} x
     * @returns {boolean}
     */
    place_striker(x) {
        const ret = wasm.carrom_place_striker(this.__wbg_ptr, x);
        return ret !== 0;
    }
    /**
     * @param {number} player
     * @returns {number}
     */
    pocketed(player) {
        const ret = wasm.carrom_pocketed(this.__wbg_ptr, player);
        return ret;
    }
    /**
     * @returns {number}
     */
    points() {
        const ret = wasm.carrom_points(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    queen_owner() {
        const ret = wasm.carrom_queen_owner(this.__wbg_ptr);
        return ret;
    }
    /**
     * 0 on the board, 1 pocketed and waiting to be covered, 2 covered
     * @returns {number}
     */
    queen_state() {
        const ret = wasm.carrom_queen_state(this.__wbg_ptr);
        return ret;
    }
    reset() {
        wasm.carrom_reset(this.__wbg_ptr);
    }
    settle() {
        wasm.carrom_settle(this.__wbg_ptr);
    }
    /**
     * @param {number} x
     * @param {number} aim_x
     * @param {number} aim_y
     * @param {number} power
     * @returns {boolean}
     */
    shoot(x, aim_x, aim_y, power) {
        const ret = wasm.carrom_shoot(this.__wbg_ptr, x, aim_x, aim_y, power);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    shots() {
        const ret = wasm.carrom_shots(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Strongest coin hit and cushion hit (speed) and pockets since the last call: coin | cushion << 12 | pockets << 24.
     * @returns {number}
     */
    take_impacts() {
        const ret = wasm.carrom_take_impacts(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    turn() {
        const ret = wasm.carrom_turn(this.__wbg_ptr);
        return ret;
    }
    /**
     * 255 while playing
     * @returns {number}
     */
    winner() {
        const ret = wasm.carrom_winner(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) Carrom.prototype[Symbol.dispose] = Carrom.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./carrom_bg.js": import0,
    };
}

const CarromFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_carrom_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

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

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
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
    cachedFloat32ArrayMemory0 = null;
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
        module_or_path = new URL('carrom_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
