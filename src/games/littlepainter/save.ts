import { createSaveSlot, isRecord } from '../persistence';

/** What survives a refresh: the whole book as the wasm save bytes (every picture's colours, the open picture, the selected paint). */
export interface SavedLittlePainter { bytes: number[]; }

export function parseLittlePainterSave(data: unknown): SavedLittlePainter | null {
  if (!isRecord(data) || !Array.isArray(data.bytes) || data.bytes.length < 4 || data.bytes.length > 4096) return null;
  if (!data.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return null;
  return { bytes: data.bytes as number[] };
}

export const createLittlePainterSaveSlot = () => createSaveSlot({ gameId: 'little-painter', version: 1, parse: parseLittlePainterSave });
