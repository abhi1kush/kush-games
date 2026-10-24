/* @ts-self-types="./fleet_clash.d.ts" */

export class FleetAi {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FleetAiFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_fleetai_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    choose() {
        const ret = wasm.fleetai_choose(this.__wbg_ptr);
        return ret;
    }
    /**
     * level 0 Easy, 1 Medium, 2 Hard
     * @param {number} level
     * @param {number} seed
     */
    constructor(level, seed) {
        const ret = wasm.fleetai_new(level, seed);
        this.__wbg_ptr = ret;
        FleetAiFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} cell
     * @param {number} result
     * @param {number} ship_start
     * @param {boolean} ship_vertical
     */
    record(cell, result, ship_start, ship_vertical) {
        wasm.fleetai_record(this.__wbg_ptr, cell, result, ship_start, ship_vertical);
    }
}
if (Symbol.dispose) FleetAi.prototype[Symbol.dispose] = FleetAi.prototype.free;

export class FleetBoard {
    static __wrap(ptr) {
        const obj = Object.create(FleetBoard.prototype);
        obj.__wbg_ptr = ptr;
        FleetBoardFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FleetBoardFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_fleetboard_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    all_sunk() {
        const ret = wasm.fleetboard_all_sunk(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} ship
     * @param {number} start
     * @param {boolean} vertical
     * @returns {boolean}
     */
    can_place(ship, start, vertical) {
        const ret = wasm.fleetboard_can_place(this.__wbg_ptr, ship, start, vertical);
        return ret !== 0;
    }
    /**
     * @returns {Uint8Array}
     */
    code() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.fleetboard_code(retptr, this.__wbg_ptr);
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
     * A complete fleet from its 10-byte code, or undefined.
     * @param {Uint8Array} code
     * @returns {FleetBoard | undefined}
     */
    static from_code(code) {
        const ptr0 = passArray8ToWasm0(code, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fleetboard_from_code(ptr0, len0);
        return ret === 0 ? undefined : FleetBoard.__wrap(ret);
    }
    /**
     * @returns {boolean}
     */
    is_complete() {
        const ret = wasm.fleetboard_is_complete(this.__wbg_ptr);
        return ret !== 0;
    }
    constructor() {
        const ret = wasm.fleetboard_new();
        this.__wbg_ptr = ret;
        FleetBoardFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} ship
     * @param {number} start
     * @param {boolean} vertical
     * @returns {boolean}
     */
    place(ship, start, vertical) {
        const ret = wasm.fleetboard_place(this.__wbg_ptr, ship, start, vertical);
        return ret !== 0;
    }
    /**
     * @param {number} seed
     */
    randomize(seed) {
        wasm.fleetboard_randomize(this.__wbg_ptr, seed);
    }
    /**
     * @param {number} ship
     */
    remove(ship) {
        wasm.fleetboard_remove(this.__wbg_ptr, ship);
    }
    /**
     * 255 if no ship is there.
     * @param {number} cell
     * @returns {number}
     */
    ship_at(cell) {
        const ret = wasm.fleetboard_ship_at(this.__wbg_ptr, cell);
        return ret;
    }
    /**
     * 0 not allowed, 1 miss, 2 hit, 10 + ship when it sinks that ship.
     * @param {number} cell
     * @returns {number}
     */
    shoot(cell) {
        const ret = wasm.fleetboard_shoot(this.__wbg_ptr, cell);
        return ret;
    }
    /**
     * @returns {number}
     */
    sunk_mask() {
        const ret = wasm.fleetboard_sunk_mask(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) FleetBoard.prototype[Symbol.dispose] = FleetBoard.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./fleet_clash_bg.js": import0,
    };
}

const FleetAiFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_fleetai_free(ptr, 1));
const FleetBoardFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_fleetboard_free(ptr, 1));

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
        module_or_path = new URL('fleet_clash_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
