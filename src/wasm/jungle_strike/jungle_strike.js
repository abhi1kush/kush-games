/* @ts-self-types="./jungle_strike.d.ts" */

export class JungleStrike {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JungleStrikeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_junglestrike_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    active_enemies() {
        const ret = wasm.junglestrike_active_enemies(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Simulate `seconds` (fixed 1/120 s steps; hitches dropped, slow frames capped). Returns a bitmask of events.
     * @param {number} seconds
     * @returns {number}
     */
    advance(seconds) {
        const ret = wasm.junglestrike_advance(this.__wbg_ptr, seconds);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static boss_wall_x() {
        const ret = wasm.junglestrike_boss_wall_x();
        return ret;
    }
    /**
     * @returns {number}
     */
    camera_x() {
        const ret = wasm.junglestrike_camera_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    checkpoint_reached() {
        const ret = wasm.junglestrike_checkpoint_reached(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    static checkpoint_x() {
        const ret = wasm.junglestrike_checkpoint_x();
        return ret;
    }
    /**
     * @returns {boolean}
     */
    continue_game() {
        const ret = wasm.junglestrike_continue_game(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    continues() {
        const ret = wasm.junglestrike_continues(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {boolean} invincible
     */
    debug_set_invincible(invincible) {
        wasm.junglestrike_debug_set_invincible(this.__wbg_ptr, invincible);
    }
    /**
     * @param {number} weapon
     */
    debug_set_weapon(weapon) {
        wasm.junglestrike_debug_set_weapon(this.__wbg_ptr, weapon);
    }
    /**
     * Release a weapon capsule just above the hero.
     * @param {number} weapon
     * @returns {boolean}
     */
    debug_spawn_capsule(weapon) {
        const ret = wasm.junglestrike_debug_spawn_capsule(this.__wbg_ptr, weapon);
        return ret !== 0;
    }
    /**
     * Put a soldier `distance` units in front of the hero, running at it.
     * @param {number} distance
     * @returns {boolean}
     */
    debug_spawn_soldier(distance) {
        const ret = wasm.junglestrike_debug_spawn_soldier(this.__wbg_ptr, distance);
        return ret !== 0;
    }
    /**
     * @param {number} x
     */
    debug_teleport(x) {
        wasm.junglestrike_debug_teleport(this.__wbg_ptr, x);
    }
    /**
     * @returns {number}
     */
    enemies_defeated() {
        const ret = wasm.junglestrike_enemies_defeated(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    hero_aim() {
        const ret = wasm.junglestrike_hero_aim(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    hero_pose() {
        const ret = wasm.junglestrike_hero_pose(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    hero_x() {
        const ret = wasm.junglestrike_hero_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    hero_y() {
        const ret = wasm.junglestrike_hero_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    static level_end() {
        const ret = wasm.junglestrike_level_end();
        return ret;
    }
    /**
     * @returns {number}
     */
    lives() {
        const ret = wasm.junglestrike_lives(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.junglestrike_new();
        this.__wbg_ptr = ret;
        JungleStrikeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    phase() {
        const ret = wasm.junglestrike_phase(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static platform_count() {
        const ret = wasm.junglestrike_platform_count();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    platforms_pointer() {
        const ret = wasm.junglestrike_platforms_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    press_fire() {
        wasm.junglestrike_press_fire(this.__wbg_ptr);
    }
    /**
     * A jump or fire tap that may be released before the next frame.
     */
    press_jump() {
        wasm.junglestrike_press_jump(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    static render_length() {
        const ret = wasm.junglestrike_render_length();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    render_pointer() {
        const ret = wasm.junglestrike_render_pointer(this.__wbg_ptr);
        return ret >>> 0;
    }
    restart() {
        wasm.junglestrike_restart(this.__wbg_ptr);
    }
    /**
     * @param {boolean} checkpoint_reached
     * @param {number} lives
     * @param {number} score
     * @param {number} weapon
     * @param {number} continues
     * @returns {boolean}
     */
    restore(checkpoint_reached, lives, score, weapon, continues) {
        const ret = wasm.junglestrike_restore(this.__wbg_ptr, checkpoint_reached, lives, score, weapon, continues);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    score() {
        const ret = wasm.junglestrike_score(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Held buttons: 1 left, 2 right, 4 up, 8 down, 16 jump, 32 fire.
     * @param {number} buttons
     */
    set_input(buttons) {
        wasm.junglestrike_set_input(this.__wbg_ptr, buttons);
    }
    /**
     * Visible width in world units (the height is always 240).
     * @param {number} width
     */
    set_view_width(width) {
        wasm.junglestrike_set_view_width(this.__wbg_ptr, width);
    }
    start() {
        wasm.junglestrike_start(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    static water_left() {
        const ret = wasm.junglestrike_water_left();
        return ret;
    }
    /**
     * @returns {number}
     */
    static water_right() {
        const ret = wasm.junglestrike_water_right();
        return ret;
    }
    /**
     * @returns {number}
     */
    weapon() {
        const ret = wasm.junglestrike_weapon(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) JungleStrike.prototype[Symbol.dispose] = JungleStrike.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./jungle_strike_bg.js": import0,
    };
}

const JungleStrikeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_junglestrike_free(ptr, 1));

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
        module_or_path = new URL('jungle_strike_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
