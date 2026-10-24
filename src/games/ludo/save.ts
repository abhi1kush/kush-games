/** Saving Ludo: the online room this tab is in (to reconnect after a refresh) or a local pass-and-play game. */
import { createSaveSlot } from '../persistence';
import { normalizeRoomCode } from '../online/room';
import { parseRoomState, type RoomState } from './protocol';
import type { SavedRoom } from './room';

export type SavedLudo =
  | { kind: 'online'; room: SavedRoom }
  | { kind: 'local'; state: RoomState };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseSavedLudo(data: unknown): SavedLudo | null {
  if (!isRecord(data)) return null;
  if (data.kind === 'local') {
    const state = parseRoomState(data.state);
    return state && state.roomCode === 'LOCAL' && state.phase !== 'lobby' ? { kind: 'local', state } : null;
  }
  if (data.kind !== 'online' || !isRecord(data.room)) return null;
  const room = data.room;
  const roomCode = normalizeRoomCode(typeof room.roomCode === 'string' ? room.roomCode : null);
  if (!roomCode || typeof room.clientId !== 'string' || !/^[a-z0-9-]{4,40}$/i.test(room.clientId) || typeof room.name !== 'string') return null;
  if (room.role !== 'host' && room.role !== 'guest') return null;
  const state = room.state === null ? null : parseRoomState(room.state);
  if (room.state !== null && !state) return null;
  return { kind: 'online', room: { roomCode, clientId: room.clientId, name: room.name, role: room.role, state } };
}

export const createLudoSaveSlot = () => createSaveSlot<SavedLudo>({ gameId: 'ludo', version: 1, parse: parseSavedLudo, throttleMs: 400 });

const NAME_KEY = 'kush-games-ludo-name';
const KICKED_KEY = 'kush-games-ludo-kicked';
const CLIENT_KEY = 'kush-games-ludo-client';

export function readName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
export function saveName(name: string) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* storage unavailable */ }
}

/** Rooms this browser was removed from: opening their link again shows the "removed" message instead of rejoining. */
export function readKickedRooms(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KICKED_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((code): code is string => typeof code === 'string').slice(-20) : [];
  } catch { return []; }
}
export function rememberKicked(roomCode: string) {
  try { localStorage.setItem(KICKED_KEY, JSON.stringify([...readKickedRooms().filter(code => code !== roomCode), roomCode].slice(-20))); } catch { /* ignore */ }
}

/** This tab's player id (kept for the tab's session, so a refresh is the same player). */
export function sessionClientId(create: () => string): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_KEY);
    if (existing && /^[a-z0-9-]{4,40}$/i.test(existing)) return existing;
    const id = create();
    sessionStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch { return create(); }
}
