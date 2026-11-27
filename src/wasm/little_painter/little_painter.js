/* @ts-self-types="./little_painter.d.ts" */

export class LittlePainter {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LittlePainterFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_littlepainter_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    active_picture() {
        const ret = wasm.littlepainter_active_picture(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    can_undo() {
        const ret = wasm.littlepainter_can_undo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Make the open picture white again (one undo step brings it all back).
     * @returns {boolean}
     */
    clear() {
        const ret = wasm.littlepainter_clear(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} picture
     * @param {number} region
     * @returns {number}
     */
    color_of(picture, region) {
        const ret = wasm.littlepainter_color_of(this.__wbg_ptr, picture, region);
        return ret;
    }
    /**
     * @param {number} picture
     * @returns {number}
     */
    colored_count(picture) {
        const ret = wasm.littlepainter_colored_count(this.__wbg_ptr, picture);
        return ret >>> 0;
    }
    /**
     * Every region's colour of a picture (a copy, one byte per region).
     * @param {number} picture
     * @returns {Uint8Array}
     */
    colors(picture) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.littlepainter_colors(retptr, this.__wbg_ptr, picture);
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
     * Bit i set = picture i has every region painted.
     * @returns {number}
     */
    completed_mask() {
        const ret = wasm.littlepainter_completed_mask(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Paint a region of the open picture with the selected colour. False when nothing changed.
     * @param {number} region
     * @returns {boolean}
     */
    fill(region) {
        const ret = wasm.littlepainter_fill(this.__wbg_ptr, region);
        return ret !== 0;
    }
    /**
     * Index of the first region of the open picture that is still white, or -1.
     * @returns {number}
     */
    first_unpainted() {
        const ret = wasm.littlepainter_first_unpainted(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} picture
     * @returns {boolean}
     */
    is_complete(picture) {
        const ret = wasm.littlepainter_is_complete(this.__wbg_ptr, picture);
        return ret !== 0;
    }
    /**
     * Restore a saved book. False (and nothing changes) when the bytes aren't a valid save.
     * @param {Uint8Array} bytes
     * @returns {boolean}
     */
    load(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.littlepainter_load(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * A fresh book: every picture white, the Peacock (picture 0) open, the first colour selected.
     */
    constructor() {
        const ret = wasm.littlepainter_new();
        this.__wbg_ptr = ret;
        LittlePainterFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * 0xRRGGBB of a palette index (index 0, the eraser / unpainted, is white).
     * @param {number} color
     * @returns {number}
     */
    static palette_rgb(color) {
        const ret = wasm.littlepainter_palette_rgb(color);
        return ret >>> 0;
    }
    /**
     * Number of paint colours; the eraser (index 0) is extra.
     * @returns {number}
     */
    static palette_size() {
        const ret = wasm.littlepainter_palette_size();
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    static picture_count() {
        const ret = wasm.littlepainter_picture_count();
        return ret >>> 0;
    }
    /**
     * Number of tappable regions in a picture (0 for an unknown picture).
     * @param {number} picture
     * @returns {number}
     */
    static region_count(picture) {
        const ret = wasm.littlepainter_region_count(picture);
        return ret >>> 0;
    }
    /**
     * The whole book as bytes (see `Book::save`).
     * @returns {Uint8Array}
     */
    save() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.littlepainter_save(retptr, this.__wbg_ptr);
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
     * @param {number} color
     * @returns {boolean}
     */
    select_color(color) {
        const ret = wasm.littlepainter_select_color(this.__wbg_ptr, color);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    selected_color() {
        const ret = wasm.littlepainter_selected_color(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} picture
     * @returns {boolean}
     */
    set_active_picture(picture) {
        const ret = wasm.littlepainter_set_active_picture(this.__wbg_ptr, picture);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    undo() {
        const ret = wasm.littlepainter_undo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    undo_depth() {
        const ret = wasm.littlepainter_undo_depth(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) LittlePainter.prototype[Symbol.dispose] = LittlePainter.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./little_painter_bg.js": import0,
    };
}

const LittlePainterFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_littlepainter_free(ptr, 1));

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
        module_or_path = new URL('little_painter_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
