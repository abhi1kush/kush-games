/* @ts-self-types="./metro_dash.d.ts" */

export class MetroDash {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MetroDashFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_metrodash_free(ptr, 0);
    }
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     * @param {number} seconds
     * @returns {number}
     */
    advance(seconds) {
        const ret = wasm.metrodash_advance(this.__wbg_ptr, seconds);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    coins() {
        const ret = wasm.metrodash_coins(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    crash_reason() {
        const ret = wasm.metrodash_crash_reason(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} kind
     */
    debug_activate(kind) {
        wasm.metrodash_debug_activate(this.__wbg_ptr, kind);
    }
    /**
     * Clear the track ahead and stop generating it (spawn your own things with debug_spawn).
     */
    debug_clear_track() {
        wasm.metrodash_debug_clear_track(this.__wbg_ptr);
    }
    debug_resume_spawning() {
        wasm.metrodash_debug_resume_spawning(this.__wbg_ptr);
    }
    /**
     * @param {boolean} on
     */
    debug_set_autopilot(on) {
        wasm.metrodash_debug_set_autopilot(this.__wbg_ptr, on);
    }
    /**
     * @param {boolean} invincible
     */
    debug_set_invincible(invincible) {
        wasm.metrodash_debug_set_invincible(this.__wbg_ptr, invincible);
    }
    /**
     * Put something `ahead` metres in front of the runner in `lane` (trains and ramps `length` long).
     * @param {number} kind
     * @param {number} lane
     * @param {number} ahead
     * @param {number} y
     * @param {number} length
     * @returns {boolean}
     */
    debug_spawn(kind, lane, ahead, y, length) {
        const ret = wasm.metrodash_debug_spawn(this.__wbg_ptr, kind, lane, ahead, y, length);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    distance() {
        const ret = wasm.metrodash_distance(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    hoverboard_seconds() {
        const ret = wasm.metrodash_hoverboard_seconds(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    is_grounded() {
        const ret = wasm.metrodash_is_grounded(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    is_rolling() {
        const ret = wasm.metrodash_is_rolling(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    lane() {
        const ret = wasm.metrodash_lane(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    last_power_up() {
        const ret = wasm.metrodash_last_power_up(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    magnet_seconds() {
        const ret = wasm.metrodash_magnet_seconds(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    multiplier() {
        const ret = wasm.metrodash_multiplier(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    multiplier_seconds() {
        const ret = wasm.metrodash_multiplier_seconds(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} seed
     */
    constructor(seed) {
        const ret = wasm.metrodash_new(seed);
        this.__wbg_ptr = ret;
        MetroDashFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.metrodash_phase(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    player_x() {
        const ret = wasm.metrodash_player_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    player_y() {
        const ret = wasm.metrodash_player_y(this.__wbg_ptr);
        return ret;
    }
    press_jump() {
        wasm.metrodash_press_jump(this.__wbg_ptr);
    }
    /**
     * -1 one lane left, 1 one lane right (a press into the wall just bumps).
     * @param {number} direction
     */
    press_lane(direction) {
        wasm.metrodash_press_lane(this.__wbg_ptr, direction);
    }
    press_roll() {
        wasm.metrodash_press_roll(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    static render_length() {
        const ret = wasm.metrodash_render_length();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    render_pointer() {
        const ret = wasm.metrodash_render_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * A brand-new run, straight into play.
     * @param {number} seed
     */
    restart(seed) {
        wasm.metrodash_restart(this.__wbg_ptr, seed);
    }
    /**
     * @param {Uint8Array} bytes
     * @returns {boolean}
     */
    restore(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.metrodash_restore(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @returns {Uint8Array}
     */
    save() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.metrodash_save(retptr, this.__wbg_ptr);
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
     * @returns {number}
     */
    score() {
        const ret = wasm.metrodash_score(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    seed() {
        const ret = wasm.metrodash_seed(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    sneakers_seconds() {
        const ret = wasm.metrodash_sneakers_seconds(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    speed() {
        const ret = wasm.metrodash_speed(this.__wbg_ptr);
        return ret;
    }
    start() {
        wasm.metrodash_start(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    stumbles() {
        const ret = wasm.metrodash_stumbles(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    surface() {
        const ret = wasm.metrodash_surface(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) MetroDash.prototype[Symbol.dispose] = MetroDash.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./metro_dash_bg.js": import0,
    };
}

const MetroDashFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_metrodash_free(ptr, 1));

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
        module_or_path = new URL('metro_dash_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
