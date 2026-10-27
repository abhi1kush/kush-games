/* @ts-self-types="./ember_lane.d.ts" */

export class EmberLane {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EmberLaneFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_emberlane_free(ptr, 0);
    }
    /**
     * Run the fixed 60 Hz simulation for `ms` (at most 12 steps per call; negative or huge gaps are clamped).
     * @param {number} ms
     */
    advance(ms) {
        wasm.emberlane_advance(this.__wbg_ptr, ms);
    }
    /**
     * @returns {boolean}
     */
    carrying() {
        const ret = wasm.emberlane_carrying(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    checkpoint() {
        const ret = wasm.emberlane_checkpoint(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    cleared() {
        const ret = wasm.emberlane_cleared(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} index
     * @returns {number}
     */
    crate_x(index) {
        const ret = wasm.emberlane_crate_x(this.__wbg_ptr, index);
        return ret;
    }
    /**
     * @returns {number}
     */
    danger() {
        const ret = wasm.emberlane_danger(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    deaths() {
        const ret = wasm.emberlane_deaths(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Test hook: jump to a checkpoint (as if reached), keeping the stage as it is.
     * @param {number} checkpoint
     */
    debug_warp(checkpoint) {
        wasm.emberlane_debug_warp(this.__wbg_ptr, checkpoint);
    }
    /**
     * @returns {boolean}
     */
    ember_active() {
        const ret = wasm.emberlane_ember_active(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    ember_x() {
        const ret = wasm.emberlane_ember_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    ember_y() {
        const ret = wasm.emberlane_ember_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    embers() {
        const ret = wasm.emberlane_embers(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    facing() {
        const ret = wasm.emberlane_facing(this.__wbg_ptr);
        return ret;
    }
    interact() {
        wasm.emberlane_interact(this.__wbg_ptr);
    }
    /**
     * @param {number} index
     * @returns {boolean}
     */
    lever(index) {
        const ret = wasm.emberlane_lever(this.__wbg_ptr, index);
        return ret !== 0;
    }
    /**
     * @param {number} x
     * @returns {number}
     */
    light_at(x) {
        const ret = wasm.emberlane_light_at(this.__wbg_ptr, x);
        return ret;
    }
    /**
     * @returns {number}
     */
    light_count() {
        const ret = wasm.emberlane_light_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * light_count × 8 f32: x, flame height, radius, intensity, kind, lit, left bound, right bound
     * @returns {number}
     */
    lights_ptr() {
        const ret = wasm.emberlane_lights_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.emberlane_new();
        this.__wbg_ptr = ret;
        EmberLaneFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    oil() {
        const ret = wasm.emberlane_oil(this.__wbg_ptr);
        return ret;
    }
    /**
     * Standing on a crate (safe from the rats).
     * @returns {boolean}
     */
    on_crate() {
        const ret = wasm.emberlane_on_crate(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    player_lit() {
        const ret = wasm.emberlane_player_lit(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    player_x() {
        const ret = wasm.emberlane_player_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    player_y() {
        const ret = wasm.emberlane_player_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    pot_left() {
        const ret = wasm.emberlane_pot_left(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    prompt() {
        const ret = wasm.emberlane_prompt(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    rat_count() {
        const ret = wasm.emberlane_rat_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * rat_count × 8 × 4 bytes: x, vx, lane, state (0 hidden, 1 active, 2 fleeing), timer, phase, nest, rng
     * @returns {number}
     */
    rats_ptr() {
        const ret = wasm.emberlane_rats_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Held buttons: 1 left, 2 right.
     * @param {number} buttons
     */
    set_input(buttons) {
        wasm.emberlane_set_input(this.__wbg_ptr, buttons);
    }
    /**
     * @returns {number}
     */
    sibling_facing() {
        const ret = wasm.emberlane_sibling_facing(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    sibling_lit() {
        const ret = wasm.emberlane_sibling_lit(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    sibling_walked() {
        const ret = wasm.emberlane_sibling_walked(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    sibling_x() {
        const ret = wasm.emberlane_sibling_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    sibling_y() {
        const ret = wasm.emberlane_sibling_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * Which block Mira stands on (-1: the ground; 0 the crate, 1 the stone wall).
     * @returns {number}
     */
    standing_on() {
        const ret = wasm.emberlane_standing_on(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    state() {
        const ret = wasm.emberlane_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    state_time() {
        const ret = wasm.emberlane_state_time(this.__wbg_ptr);
        return ret;
    }
    /**
     * Events since the last call (bit flags, see world.rs) — sounds and effects.
     * @returns {number}
     */
    take_events() {
        const ret = wasm.emberlane_take_events(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    throw_ember() {
        const ret = wasm.emberlane_throw_ember(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    throw_target() {
        const ret = wasm.emberlane_throw_target(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    time() {
        const ret = wasm.emberlane_time(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    walked() {
        const ret = wasm.emberlane_walked(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) EmberLane.prototype[Symbol.dispose] = EmberLane.prototype.free;

/**
 * Stage two as JavaScript sees it: the same fixed 60 Hz step as stage one.
 */
export class GuardSteps {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GuardStepsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_guardsteps_free(ptr, 0);
    }
    /**
     * @param {number} ms
     */
    advance(ms) {
        wasm.guardsteps_advance(this.__wbg_ptr, ms);
    }
    /**
     * The spear found her and the fall is over: game over.
     * @returns {boolean}
     */
    caught() {
        const ret = wasm.guardsteps_caught(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    cleared() {
        const ret = wasm.guardsteps_cleared(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * 0…1: how close the rats are to finishing Mira or Kabir.
     * @returns {number}
     */
    danger() {
        const ret = wasm.guardsteps_danger(this.__wbg_ptr);
        return ret;
    }
    /**
     * Seconds the lamp has been dark.
     * @returns {number}
     */
    dark_time() {
        const ret = wasm.guardsteps_dark_time(this.__wbg_ptr);
        return ret;
    }
    /**
     * Test hook: put the soldier at x facing the given way, back on patrol.
     * @param {number} x
     * @param {number} facing
     */
    debug_guard(x, facing) {
        wasm.guardsteps_debug_guard(this.__wbg_ptr, x, facing);
    }
    /**
     * Test hook: put Mira at x (standing on the ground there).
     * @param {number} x
     */
    debug_place(x) {
        wasm.guardsteps_debug_place(this.__wbg_ptr, x);
    }
    /**
     * @returns {number}
     */
    embers() {
        const ret = wasm.guardsteps_embers(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    facing() {
        const ret = wasm.guardsteps_facing(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} x
     * @returns {number}
     */
    ground_at(x) {
        const ret = wasm.guardsteps_ground_at(this.__wbg_ptr, x);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    guard_beset() {
        const ret = wasm.guardsteps_guard_beset(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * 0…1: how close the rats are to finishing the soldier.
     * @returns {number}
     */
    guard_danger() {
        const ret = wasm.guardsteps_guard_danger(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    guard_eaten() {
        const ret = wasm.guardsteps_guard_eaten(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    guard_facing() {
        const ret = wasm.guardsteps_guard_facing(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    guard_state() {
        const ret = wasm.guardsteps_guard_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    guard_time() {
        const ret = wasm.guardsteps_guard_time(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    guard_walked() {
        const ret = wasm.guardsteps_guard_walked(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    guard_x() {
        const ret = wasm.guardsteps_guard_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    guard_y() {
        const ret = wasm.guardsteps_guard_y(this.__wbg_ptr);
        return ret;
    }
    interact() {
        wasm.guardsteps_interact(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    item() {
        const ret = wasm.guardsteps_item(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    kabir_follows() {
        const ret = wasm.guardsteps_kabir_follows(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * What ended the run: 0 the spear, 1 the rats.
     * @returns {number}
     */
    killed_by() {
        const ret = wasm.guardsteps_killed_by(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    lamp_lit() {
        const ret = wasm.guardsteps_lamp_lit(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} x
     * @returns {number}
     */
    light_at(x) {
        const ret = wasm.guardsteps_light_at(this.__wbg_ptr, x);
        return ret;
    }
    /**
     * @returns {number}
     */
    light_count() {
        const ret = wasm.guardsteps_light_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * light_count × 8 f32, the same layout as stage one's lights.
     * @returns {number}
     */
    lights_ptr() {
        const ret = wasm.guardsteps_lights_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    missile_active() {
        const ret = wasm.guardsteps_missile_active(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    missile_item() {
        const ret = wasm.guardsteps_missile_item(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    missile_x() {
        const ret = wasm.guardsteps_missile_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    missile_y() {
        const ret = wasm.guardsteps_missile_y(this.__wbg_ptr);
        return ret;
    }
    constructor() {
        const ret = wasm.guardsteps_new();
        this.__wbg_ptr = ret;
        GuardStepsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {boolean}
     */
    player_lit() {
        const ret = wasm.guardsteps_player_lit(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    player_x() {
        const ret = wasm.guardsteps_player_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    player_y() {
        const ret = wasm.guardsteps_player_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    prompt() {
        const ret = wasm.guardsteps_prompt(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    rat_count() {
        const ret = wasm.guardsteps_rat_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * rat_count × 8 × 4 bytes, the same layout as stage one's rats.
     * @returns {number}
     */
    rats_ptr() {
        const ret = wasm.guardsteps_rats_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * 0…1 while he strikes his tinder at the lamp post.
     * @returns {number}
     */
    relight_progress() {
        const ret = wasm.guardsteps_relight_progress(this.__wbg_ptr);
        return ret;
    }
    /**
     * 0 ember, 1 stone.
     * @param {number} item
     */
    select_item(item) {
        wasm.guardsteps_select_item(this.__wbg_ptr, item);
    }
    /**
     * Held buttons: 1 left, 2 right.
     * @param {number} buttons
     */
    set_input(buttons) {
        wasm.guardsteps_set_input(this.__wbg_ptr, buttons);
    }
    /**
     * @returns {number}
     */
    sibling_facing() {
        const ret = wasm.guardsteps_sibling_facing(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    sibling_walked() {
        const ret = wasm.guardsteps_sibling_walked(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    sibling_x() {
        const ret = wasm.guardsteps_sibling_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    sibling_y() {
        const ret = wasm.guardsteps_sibling_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    state() {
        const ret = wasm.guardsteps_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    state_time() {
        const ret = wasm.guardsteps_state_time(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    stones() {
        const ret = wasm.guardsteps_stones(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    suspicion() {
        const ret = wasm.guardsteps_suspicion(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    take_events() {
        const ret = wasm.guardsteps_take_events(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Throw whatever is selected (stone or ember). False if nothing was thrown.
     * @returns {boolean}
     */
    throw_selected() {
        const ret = wasm.guardsteps_throw_selected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    throw_target() {
        const ret = wasm.guardsteps_throw_target(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    time() {
        const ret = wasm.guardsteps_time(this.__wbg_ptr);
        return ret;
    }
    toggle_item() {
        wasm.guardsteps_toggle_item(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    walked() {
        const ret = wasm.guardsteps_walked(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) GuardSteps.prototype[Symbol.dispose] = GuardSteps.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./ember_lane_bg.js": import0,
    };
}

const EmberLaneFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_emberlane_free(ptr, 1));
const GuardStepsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_guardsteps_free(ptr, 1));

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
        module_or_path = new URL('ember_lane_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
