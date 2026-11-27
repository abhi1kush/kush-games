import { createSaveSlot, isRecord } from '../persistence';

/** What survives a refresh: the whole run as the wasm save bytes (trail seed, sled, score, the obstacles ahead). */
export interface SavedAlpineSled { bytes: number[]; }

export function parseAlpineSledSave(data: unknown): SavedAlpineSled | null {
  if (!isRecord(data) || !Array.isArray(data.bytes) || data.bytes.length < 8 || data.bytes.length > 4096) return null;
  if (!data.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return null;
  return { bytes: data.bytes as number[] };
}

export const createAlpineSledSaveSlot = () => createSaveSlot({ gameId: 'alpine-sled', version: 1, parse: parseAlpineSledSave });
