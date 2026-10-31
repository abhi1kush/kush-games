/* @ts-self-types="./antariksh_defenders.d.ts" */

export class AntarikshDefenders {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AntarikshDefendersFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_antarikshdefenders_free(ptr, 0);
    }
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     * @param {number} seconds
     * @returns {number}
     */
    advance(seconds) {
        const ret = wasm.antarikshdefenders_advance(this.__wbg_ptr, seconds);
        return ret >>> 0;
    }
    /**
     * @param {number} power
     */
    debug_drop_capsule(power) {
        wasm.antarikshdefenders_debug_drop_capsule(this.__wbg_ptr, power);
    }
    debug_launch_mystery() {
        wasm.antarikshdefenders_debug_launch_mystery(this.__wbg_ptr);
    }
    /**
     * x of the living enemy closest to the ship (for aiming in tests), or -1.
     * @returns {number}
     */
    debug_nearest_enemy_x() {
        const ret = wasm.antarikshdefenders_debug_nearest_enemy_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {boolean} invincible
     */
    debug_set_invincible(invincible) {
        wasm.antarikshdefenders_debug_set_invincible(this.__wbg_ptr, invincible);
    }
    /**
     * @param {number} wave
     */
    debug_set_wave(wave) {
        wasm.antarikshdefenders_debug_set_wave(this.__wbg_ptr, wave);
    }
    /**
     * @param {number} bits
     */
    debug_set_weapons(bits) {
        wasm.antarikshdefenders_debug_set_weapons(this.__wbg_ptr, bits);
    }
    /**
     * @param {number} keep
     */
    debug_thin_formation(keep) {
        wasm.antarikshdefenders_debug_thin_formation(this.__wbg_ptr, keep);
    }
    /**
     * @returns {number}
     */
    enemies_alive() {
        const ret = wasm.antarikshdefenders_enemies_alive(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    formation_y() {
        const ret = wasm.antarikshdefenders_formation_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    kills() {
        const ret = wasm.antarikshdefenders_kills(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    lives() {
        const ret = wasm.antarikshdefenders_lives(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    march_interval() {
        const ret = wasm.antarikshdefenders_march_interval(this.__wbg_ptr);
        return ret;
    }
    constructor() {
        const ret = wasm.antarikshdefenders_new();
        this.__wbg_ptr = ret;
        AntarikshDefendersFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.antarikshdefenders_phase(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    player_x() {
        const ret = wasm.antarikshdefenders_player_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    power() {
        const ret = wasm.antarikshdefenders_power(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    queen_hits_left() {
        const ret = wasm.antarikshdefenders_queen_hits_left(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static render_length() {
        const ret = wasm.antarikshdefenders_render_length();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    render_pointer() {
        const ret = wasm.antarikshdefenders_render_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    restart() {
        wasm.antarikshdefenders_restart(this.__wbg_ptr);
    }
    /**
     * @param {number} wave
     * @param {number} score
     * @param {number} lives
     * @returns {boolean}
     */
    restore(wave, score, lives) {
        const ret = wasm.antarikshdefenders_restore(this.__wbg_ptr, wave, score, lives);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    score() {
        const ret = wasm.antarikshdefenders_score(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} seed
     */
    seed(seed) {
        wasm.antarikshdefenders_seed(this.__wbg_ptr, seed);
    }
    /**
     * Held buttons: 1 left, 2 right, 4 fire.
     * @param {number} buttons
     */
    set_input(buttons) {
        wasm.antarikshdefenders_set_input(this.__wbg_ptr, buttons);
    }
    /**
     * Where a finger wants the ship (world x); negative for none.
     * @param {number} x
     */
    set_target_x(x) {
        wasm.antarikshdefenders_set_target_x(this.__wbg_ptr, x);
    }
    /**
     * @returns {number}
     */
    shield_cells_left() {
        const ret = wasm.antarikshdefenders_shield_cells_left(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static shields_length() {
        const ret = wasm.antarikshdefenders_shields_length();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    shields_pointer() {
        const ret = wasm.antarikshdefenders_shields_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The stage name for a wave ("Low Earth Orbit", "Lunar Orbit", "Mars Approach", ...).
     * @param {number} wave
     * @returns {string}
     */
    static stage_name(wave) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.antarikshdefenders_stage_name(retptr, wave);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
        }
    }
    start() {
        wasm.antarikshdefenders_start(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    wave() {
        const ret = wasm.antarikshdefenders_wave(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    weapons() {
        const ret = wasm.antarikshdefenders_weapons(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) AntarikshDefenders.prototype[Symbol.dispose] = AntarikshDefenders.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./antariksh_defenders_bg.js": import0,
    };
}

const AntarikshDefendersFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_antarikshdefenders_free(ptr, 1));

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
        module_or_path = new URL('antariksh_defenders_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
