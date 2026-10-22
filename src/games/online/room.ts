/** Room codes, PeerJS ids and share links for online games. */

/** No 0/O, 1/I/L: easy to read out loud or type. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
/** PeerJS id prefix per game (Chess keeps its original one so rooms opened before still work). */
const PEER_ID_PREFIXES: Record<string, string> = { chess: 'kushchess-', 'connect-four': 'kushc4-', checkers: 'kushcheckers-' };

export function createRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index++) code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Clean up a typed or pasted code; null when it can't be a room code. */
export function normalizeRoomCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const code = text.trim().toUpperCase().replace(/[\s-]/g, '');
  if (code.length < 4 || code.length > 8) return null;
  return [...code].every(character => ROOM_CODE_ALPHABET.includes(character)) ? code : null;
}

/** PeerJS id of a room's host, e.g. kushc4-k7m2q (lower-case, as the broker's ids are). */
export const hostPeerId = (gameId: string, code: string) =>
  `${PEER_ID_PREFIXES[gameId] ?? `kush${gameId.replace(/[^a-z0-9]/g, '')}-`}${code.toLowerCase()}`;

/** The hash route of a room, e.g. #/play/connect-four?room=K7M2Q */
export const roomHash = (gameId: string, code: string) => `#/play/${gameId}?room=${encodeURIComponent(code)}`;

/** Full link to share, based on where the site is served from. */
export function roomLink(gameId: string, code: string, location: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${location.origin}${location.pathname}${roomHash(gameId, code)}`;
}

/** The room code in a hash like #/play/chess?room=K7M2Q, if any. */
export function roomCodeFromHash(hash: string): string | null {
  const queryStart = hash.indexOf('?');
  if (queryStart < 0) return null;
  return normalizeRoomCode(new URLSearchParams(hash.slice(queryStart + 1)).get('room'));
}
