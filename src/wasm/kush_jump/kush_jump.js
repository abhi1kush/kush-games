/* @ts-self-types="./kush_jump.d.ts" */

export class KushJump {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KushJumpFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kushjump_free(ptr, 0);
    }
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     * @param {number} seconds
     * @returns {number}
     */
    advance(seconds) {
        const ret = wasm.kushjump_advance(this.__wbg_ptr, seconds);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static checkpoint_column() {
        const ret = wasm.kushjump_checkpoint_column();
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    checkpoint_reached() {
        const ret = wasm.kushjump_checkpoint_reached(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    coins() {
        const ret = wasm.kushjump_coins(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Teleport, then lift the hero `height` units into the air (to drop onto an enemy).
     * @param {number} column
     * @param {number} height
     */
    debug_drop(column, height) {
        wasm.kushjump_debug_drop(this.__wbg_ptr, column, height);
    }
    /**
     * @param {boolean} is_big
     */
    debug_set_big(is_big) {
        wasm.kushjump_debug_set_big(this.__wbg_ptr, is_big);
    }
    /**
     * @param {number} column
     */
    debug_teleport(column) {
        wasm.kushjump_debug_teleport(this.__wbg_ptr, column);
    }
    /**
     * Enemies stomped or knocked out so far.
     * @returns {number}
     */
    enemies_defeated() {
        const ret = wasm.kushjump_enemies_defeated(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static flag_column() {
        const ret = wasm.kushjump_flag_column();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static fort_door_column() {
        const ret = wasm.kushjump_fort_door_column();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    hero_x() {
        const ret = wasm.kushjump_hero_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    hero_y() {
        const ret = wasm.kushjump_hero_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    is_big() {
        const ret = wasm.kushjump_is_big(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    static level_columns() {
        const ret = wasm.kushjump_level_columns();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static level_rows() {
        const ret = wasm.kushjump_level_rows();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    lives() {
        const ret = wasm.kushjump_lives(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.kushjump_new();
        this.__wbg_ptr = ret;
        KushJumpFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.kushjump_phase(this.__wbg_ptr);
        return ret >>> 0;
    }
    press_jump() {
        wasm.kushjump_press_jump(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    render_pointer() {
        const ret = wasm.kushjump_render_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    restart() {
        wasm.kushjump_restart(this.__wbg_ptr);
    }
    /**
     * @param {boolean} checkpoint_reached
     * @param {number} lives
     * @param {number} score
     * @param {number} coins
     * @returns {boolean}
     */
    restore(checkpoint_reached, lives, score, coins) {
        const ret = wasm.kushjump_restore(this.__wbg_ptr, checkpoint_reached, lives, score, coins);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    score() {
        const ret = wasm.kushjump_score(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Held buttons: 1 left, 2 right, 4 jump, 8 run.
     * @param {number} buttons
     */
    set_input(buttons) {
        wasm.kushjump_set_input(this.__wbg_ptr, buttons);
    }
    /**
     * Visible width in world units (the height is always 240); the camera keeps the hero in view with it.
     * @param {number} width
     */
    set_view_width(width) {
        wasm.kushjump_set_view_width(this.__wbg_ptr, width);
    }
    start() {
        wasm.kushjump_start(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    tiles_pointer() {
        const ret = wasm.kushjump_tiles_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) KushJump.prototype[Symbol.dispose] = KushJump.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./kush_jump_bg.js": import0,
    };
}

const KushJumpFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_kushjump_free(ptr, 1));

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
        module_or_path = new URL('kush_jump_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
