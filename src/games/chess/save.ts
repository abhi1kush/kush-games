/** Saving and restoring a chess game in progress, including the online room (see ../persistence.ts). */
import { createSaveSlot, isRecord } from '../persistence';
import { MatchState } from './match';
import { parseMatch, Role } from './protocol';
import { normalizeRoomCode } from './room';

export const CHESS_SAVE_VERSION = 1;

export type SavedChess =
  | { mode: 'local'; match: MatchState }
  | { mode: 'online'; match: MatchState; role: Role; roomCode: string };

export function parseChessSave(data: unknown): SavedChess | null {
  if (!isRecord(data)) return null;
  const match = parseMatch(data.match);
  if (!match) return null;
  if (data.mode === 'local') return { mode: 'local', match };
  if (data.mode !== 'online' || (data.role !== 'host' && data.role !== 'guest')) return null;
  const roomCode = normalizeRoomCode(typeof data.roomCode === 'string' ? data.roomCode : null);
  return roomCode && roomCode === data.roomCode ? { mode: 'online', match, role: data.role, roomCode } : null;
}

export const createChessSaveSlot = () => createSaveSlot({ gameId: 'chess', version: CHESS_SAVE_VERSION, parse: parseChessSave });
