/** Saving a turn game: the online room this tab is in (to reconnect after a refresh) or a local pass-and-play game. */
import { createSaveSlot } from '../../persistence';
import { normalizeRoomCode } from '../room';
import { parseRoomState, type RoomState } from './protocol';
import type { SavedRoom } from './room';
import type { TurnGameSpec } from './spec';

export type SavedTurnGame =
  | { kind: 'online'; room: SavedRoom }
  | { kind: 'local'; state: RoomState };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseSavedTurnGame(data: unknown, spec: Pick<TurnGameSpec, 'snapshotLength' | 'decode'>): SavedTurnGame | null {
  if (!isRecord(data)) return null;
  if (data.kind === 'local') {
    const state = parseRoomState(data.state, spec);
    return state && state.roomCode === 'LOCAL' && state.phase !== 'lobby' ? { kind: 'local', state } : null;
  }
  if (data.kind !== 'online' || !isRecord(data.room)) return null;
  const room = data.room;
  const roomCode = normalizeRoomCode(typeof room.roomCode === 'string' ? room.roomCode : null);
  if (!roomCode || typeof room.clientId !== 'string' || !/^[a-z0-9-]{4,40}$/i.test(room.clientId) || typeof room.name !== 'string') return null;
  if (room.role !== 'host' && room.role !== 'guest') return null;
  const state = room.state === null ? null : parseRoomState(room.state, spec);
  if (room.state !== null && !state) return null;
  return { kind: 'online', room: { roomCode, clientId: room.clientId, name: room.name, role: room.role, state } };
}

export const createTurnSaveSlot = (spec: TurnGameSpec) =>
  createSaveSlot<SavedTurnGame>({ gameId: spec.gameId, version: 1, parse: data => parseSavedTurnGame(data, spec), throttleMs: 400 });

/** Per-game browser storage: player name, rooms this browser was removed from, this tab's player id. */
export function turnStorage(gameId: string) {
  const nameKey = `kush-games-${gameId}-name`;
  const kickedKey = `kush-games-${gameId}-kicked`;
  const clientKey = `kush-games-${gameId}-client`;
  return {
    readName: () => readItem(localStorage, nameKey) ?? '',
    saveName: (name: string) => writeItem(localStorage, nameKey, name),
    readKickedRooms: () => readKicked(kickedKey),
    rememberKicked: (roomCode: string) => writeItem(localStorage, kickedKey, JSON.stringify([...readKicked(kickedKey).filter(code => code !== roomCode), roomCode].slice(-20))),
    sessionClientId(create: () => string): string {
      const existing = readItem(sessionStorage, clientKey);
      if (existing && /^[a-z0-9-]{4,40}$/i.test(existing)) return existing;
      const id = create();
      writeItem(sessionStorage, clientKey, id);
      return id;
    },
  };
}
export type TurnStorage = ReturnType<typeof turnStorage>;

function readItem(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}
function writeItem(storage: Storage, key: string, value: string) {
  try { storage.setItem(key, value); } catch { /* storage unavailable */ }
}
function readKicked(key: string): string[] {
  try {
    const value: unknown = JSON.parse(readItem(localStorage, key) ?? '[]');
    return Array.isArray(value) ? value.filter((code): code is string => typeof code === 'string').slice(-20) : [];
  } catch { return []; }
}
