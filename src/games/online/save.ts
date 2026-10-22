/** Saved online rooms: which room we were in, as whom, and the match, so a refresh rejoins it. */
import { isRecord, OnlineMatch, OnlineRules, parseOnlineMatch, Role } from './match';
import { normalizeRoomCode } from './room';

export interface SavedOnlineRoom<Color extends string> {
  mode: 'online';
  role: Role;
  roomCode: string;
  match: OnlineMatch<Color>;
}

export function parseSavedOnlineRoom<Color extends string>(rules: OnlineRules<Color>, data: unknown): SavedOnlineRoom<Color> | null {
  if (!isRecord(data) || data.mode !== 'online' || (data.role !== 'host' && data.role !== 'guest')) return null;
  const roomCode = normalizeRoomCode(typeof data.roomCode === 'string' ? data.roomCode : null);
  const match = parseOnlineMatch(rules, data.match);
  return roomCode && match ? { mode: 'online', role: data.role, roomCode, match } : null;
}
