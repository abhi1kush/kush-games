/* @ts-self-types="./solitaire.d.ts" */

export class Solitaire {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SolitaireFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_solitaire_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    actions() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.solitaire_actions(retptr, this.__wbg_ptr);
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
     * Tap-to-move: send the cards to the best legal place (foundation first). Returns the destination or -1.
     * @param {number} from
     * @param {number} count
     * @returns {number}
     */
    auto_move(from, count) {
        const ret = wasm.solitaire_auto_move(this.__wbg_ptr, from, count);
        return ret;
    }
    /**
     * Every card is face up and the stock/waste are empty: the rest can be played automatically.
     * @returns {boolean}
     */
    can_auto_finish() {
        const ret = wasm.solitaire_can_auto_finish(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    draw_count() {
        const ret = wasm.solitaire_draw_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Turn cards from the stock (or turn the waste back over when the stock is empty).
     * @returns {boolean}
     */
    draw() {
        const ret = wasm.solitaire_draw(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Move one card to a foundation if it's safe (or any card when `safe_only` is false). Returns [from, to] or empty.
     * @param {boolean} safe_only
     * @returns {Uint8Array}
     */
    foundation_step(safe_only) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.solitaire_foundation_step(retptr, this.__wbg_ptr, safe_only);
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
     * A useful move as [from, count, to], [0] for "draw", or empty when nothing helps.
     * @returns {Uint8Array}
     */
    hint() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.solitaire_hint(retptr, this.__wbg_ptr);
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
     * @returns {boolean}
     */
    is_won() {
        const ret = wasm.solitaire_is_won(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Layout: stockCount, wasteCount, waste…, then per foundation count, cards…, then per column count, faceDownCount, cards….
     * Cards are 0–51: suit = card / 13 (♠ ♥ ♦ ♣), rank = card % 13 (0 = ace).
     * @returns {Uint8Array}
     */
    layout() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.solitaire_layout(retptr, this.__wbg_ptr);
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
     * Rebuild a saved game. Returns false (and leaves a fresh deal) if the actions don't replay.
     * @param {number} seed
     * @param {number} draw_count
     * @param {Uint8Array} actions
     * @returns {boolean}
     */
    load(seed, draw_count, actions) {
        const ptr0 = passArray8ToWasm0(actions, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.solitaire_load(this.__wbg_ptr, seed, draw_count, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Move `count` cards from location `from` to location `to` (0 stock, 1 waste, 2–5 foundations ♠♥♦♣, 6–12 columns).
     * @param {number} from
     * @param {number} count
     * @param {number} to
     * @returns {boolean}
     */
    move_cards(from, count, to) {
        const ret = wasm.solitaire_move_cards(this.__wbg_ptr, from, count, to);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    moves() {
        const ret = wasm.solitaire_moves(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} seed
     * @param {number} draw_count
     */
    constructor(seed, draw_count) {
        const ret = wasm.solitaire_new(seed, draw_count);
        this.__wbg_ptr = ret;
        SolitaireFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    score() {
        const ret = wasm.solitaire_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    seed() {
        const ret = wasm.solitaire_seed(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    undo() {
        const ret = wasm.solitaire_undo(this.__wbg_ptr);
        return ret !== 0;
    }
}
if (Symbol.dispose) Solitaire.prototype[Symbol.dispose] = Solitaire.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./solitaire_bg.js": import0,
    };
}

const SolitaireFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_solitaire_free(ptr, 1));

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
        module_or_path = new URL('solitaire_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
