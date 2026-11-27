/** Loads the Little Painter wasm once (only when the game opens). */
import init, { LittlePainter } from '../../wasm/little_painter/little_painter.js';

let ready: Promise<void> | null = null;
export const loadLittlePainterEngine = () => (ready ??= init().then(() => undefined));
export { LittlePainter };

/** Palette index 0: the eraser (the region goes back to white / unpainted). Mirrors book.rs. */
export const ERASER = 0;
export const UNPAINTED_FILL = '#ffffff';

export const hexColor = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;

/** CSS colour of every palette index: [eraser white, paint 1 … paint N]. Read from wasm so there is one source. */
export function readPaletteColors(): string[] {
  const colors = [UNPAINTED_FILL];
  for (let color = 1; color <= LittlePainter.palette_size(); color++) colors.push(hexColor(LittlePainter.palette_rgb(color)));
  return colors;
}
