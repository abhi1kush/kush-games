/** Room codes and share links. */

/** No 0/O, 1/I/L: easy to read out loud or type. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
export const PEER_ID_PREFIX = 'kushchess-';

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

/** PeerJS id of the host of a room, e.g. kushchess-K7M2Q (lower-case, as the broker ids are). */
export const hostPeerId = (code: string) => `${PEER_ID_PREFIX}${code.toLowerCase()}`;

/** The hash route of a room: #/play/chess?room=CODE */
export const roomHash = (code: string) => `#/play/chess?room=${encodeURIComponent(code)}`;

/** Full link to share, based on where the site is served from. */
export function roomLink(code: string, location: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${location.origin}${location.pathname}${roomHash(code)}`;
}

/** The room code in a hash like #/play/chess?room=K7M2Q, if any. */
export function roomCodeFromHash(hash: string): string | null {
  const queryStart = hash.indexOf('?');
  if (queryStart < 0) return null;
  return normalizeRoomCode(new URLSearchParams(hash.slice(queryStart + 1)).get('room'));
}
