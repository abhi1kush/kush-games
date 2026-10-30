/* @ts-self-types="./ghat_climb.d.ts" */

export class GhatClimb {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GhatClimbFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ghatclimb_free(ptr, 0);
    }
    /**
     * Run the fixed step for `ms` (at most 10 steps per call; negative or huge gaps are dropped).
     * @param {number} ms
     */
    advance(ms) {
        wasm.ghatclimb_advance(this.__wbg_ptr, ms);
    }
    /**
     * @returns {number}
     */
    angle() {
        const ret = wasm.ghatclimb_angle(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    coins() {
        const ret = wasm.ghatclimb_coins(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Bit 1 rear tyre on the road, bit 2 front tyre.
     * @returns {number}
     */
    contact() {
        const ret = wasm.ghatclimb_contact(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    course_end() {
        const ret = wasm.ghatclimb_course_end(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    distance() {
        const ret = wasm.ghatclimb_distance(this.__wbg_ptr);
        return ret;
    }
    /**
     * Engine pull this step, 0 to 1.
     * @returns {number}
     */
    drive() {
        const ret = wasm.ghatclimb_drive(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    finish_x() {
        const ret = wasm.ghatclimb_finish_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    fuel() {
        const ret = wasm.ghatclimb_fuel(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} x
     * @returns {number}
     */
    grade_at(x) {
        const ret = wasm.ghatclimb_grade_at(this.__wbg_ptr, x);
        return ret;
    }
    /**
     * @param {number} x
     * @returns {number}
     */
    height_at(x) {
        const ret = wasm.ghatclimb_height_at(this.__wbg_ptr, x);
        return ret;
    }
    constructor() {
        const ret = wasm.ghatclimb_new();
        this.__wbg_ptr = ret;
        GhatClimbFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.ghatclimb_phase(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    pickup_count() {
        const ret = wasm.ghatclimb_pickup_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * pickup_count × 4 f32: x, y, kind, taken
     * @returns {number}
     */
    pickups_ptr() {
        const ret = wasm.ghatclimb_pickups_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Test and resume hook: put the jeep back on the road.
     * @param {number} x
     * @param {number} fuel
     * @param {number} coins
     */
    restore(x, fuel, coins) {
        wasm.ghatclimb_restore(this.__wbg_ptr, x, fuel, coins);
    }
    /**
     * @returns {number}
     */
    score() {
        const ret = wasm.ghatclimb_score(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Held buttons: 1 gas, 2 brake.
     * @param {number} buttons
     */
    set_input(buttons) {
        wasm.ghatclimb_set_input(this.__wbg_ptr, buttons);
    }
    /**
     * @returns {number}
     */
    speed() {
        const ret = wasm.ghatclimb_speed(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    spin() {
        const ret = wasm.ghatclimb_spin(this.__wbg_ptr);
        return ret;
    }
    start() {
        wasm.ghatclimb_start(this.__wbg_ptr);
    }
    /**
     * Share of the engine spent holding the slope; past 1 the hill wins.
     * @returns {number}
     */
    strain() {
        const ret = wasm.ghatclimb_strain(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    take_events() {
        const ret = wasm.ghatclimb_take_events(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    time() {
        const ret = wasm.ghatclimb_time(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    touch() {
        const ret = wasm.ghatclimb_touch(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    x() {
        const ret = wasm.ghatclimb_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    y() {
        const ret = wasm.ghatclimb_y(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) GhatClimb.prototype[Symbol.dispose] = GhatClimb.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./ghat_climb_bg.js": import0,
    };
}

const GhatClimbFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ghatclimb_free(ptr, 1));

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
        module_or_path = new URL('ghat_climb_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
