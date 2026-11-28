import { createSaveSlot, isRecord } from '../persistence';

/** What survives a refresh: the whole run as the wasm save bytes (runner, power-ups, score, the track ahead). */
export interface SavedMetroDash { bytes: number[]; }

export function parseMetroDashSave(data: unknown): SavedMetroDash | null {
  if (!isRecord(data) || !Array.isArray(data.bytes) || data.bytes.length < 16 || data.bytes.length > 16384) return null;
  if (!data.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return null;
  return { bytes: data.bytes as number[] };
}

export const createMetroDashSaveSlot = () => createSaveSlot({ gameId: 'metro-dash', version: 1, parse: parseMetroDashSave });
