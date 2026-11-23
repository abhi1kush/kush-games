/* @ts-self-types="./zombie_road.d.ts" */

export class ZombieRoad {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ZombieRoadFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_zombieroad_free(ptr, 0);
    }
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     * @param {number} seconds
     * @returns {number}
     */
    advance(seconds) {
        const ret = wasm.zombieroad_advance(this.__wbg_ptr, seconds);
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    auto_fire() {
        const ret = wasm.zombieroad_auto_fire(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} index
     * @returns {number}
     */
    cover_health(index) {
        const ret = wasm.zombieroad_cover_health(this.__wbg_ptr, index);
        return ret;
    }
    debug_clear_wave() {
        wasm.zombieroad_debug_clear_wave(this.__wbg_ptr);
    }
    /**
     * @param {number} kind
     */
    debug_drop_pickup(kind) {
        wasm.zombieroad_debug_drop_pickup(this.__wbg_ptr, kind);
    }
    /**
     * x of the living zombie lowest on the road (the most dangerous), or -1.
     * @returns {number}
     */
    debug_most_dangerous_zombie_x() {
        const ret = wasm.zombieroad_debug_most_dangerous_zombie_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} health
     */
    debug_set_health(health) {
        wasm.zombieroad_debug_set_health(this.__wbg_ptr, health);
    }
    /**
     * @param {boolean} invincible
     */
    debug_set_invincible(invincible) {
        wasm.zombieroad_debug_set_invincible(this.__wbg_ptr, invincible);
    }
    /**
     * @param {number} lives
     */
    debug_set_lives(lives) {
        wasm.zombieroad_debug_set_lives(this.__wbg_ptr, lives);
    }
    /**
     * @param {number} wave
     */
    debug_set_wave(wave) {
        wasm.zombieroad_debug_set_wave(this.__wbg_ptr, wave);
    }
    /**
     * @param {number} kind
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    debug_spawn_zombie(kind, x, y) {
        const ret = wasm.zombieroad_debug_spawn_zombie(this.__wbg_ptr, kind, x, y);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    health() {
        const ret = wasm.zombieroad_health(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    kills() {
        const ret = wasm.zombieroad_kills(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    lives() {
        const ret = wasm.zombieroad_lives(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.zombieroad_new();
        this.__wbg_ptr = ret;
        ZombieRoadFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.zombieroad_phase(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    player_x() {
        const ret = wasm.zombieroad_player_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    static render_length() {
        const ret = wasm.zombieroad_render_length();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    render_pointer() {
        const ret = wasm.zombieroad_render_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    restart() {
        wasm.zombieroad_restart(this.__wbg_ptr);
    }
    /**
     * @param {number} wave
     * @param {number} score
     * @param {number} lives
     * @returns {boolean}
     */
    restore(wave, score, lives) {
        const ret = wasm.zombieroad_restore(this.__wbg_ptr, wave, score, lives);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    score() {
        const ret = wasm.zombieroad_score(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} seed
     */
    seed(seed) {
        wasm.zombieroad_seed(this.__wbg_ptr, seed);
    }
    /**
     * @param {boolean} on
     */
    set_auto_fire(on) {
        wasm.zombieroad_set_auto_fire(this.__wbg_ptr, on);
    }
    /**
     * Held buttons: 1 left, 2 right, 4 fire.
     * @param {number} buttons
     */
    set_input(buttons) {
        wasm.zombieroad_set_input(this.__wbg_ptr, buttons);
    }
    /**
     * Where a finger wants the survivor (world x); negative for none.
     * @param {number} x
     */
    set_target_x(x) {
        wasm.zombieroad_set_target_x(this.__wbg_ptr, x);
    }
    start() {
        wasm.zombieroad_start(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    wave() {
        const ret = wasm.zombieroad_wave(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    zombies_alive() {
        const ret = wasm.zombieroad_zombies_alive(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    zombies_left() {
        const ret = wasm.zombieroad_zombies_left(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) ZombieRoad.prototype[Symbol.dispose] = ZombieRoad.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./zombie_road_bg.js": import0,
    };
}

const ZombieRoadFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_zombieroad_free(ptr, 1));

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
        module_or_path = new URL('zombie_road_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
