import { describe, expect, it } from 'vitest';
import { createRoomCode, hostPeerId, normalizeRoomCode, ROOM_CODE_ALPHABET, roomCodeFromHash, roomLink } from './room';
import { parseChessSave } from './save';
import { createMatch } from './match';

describe('chess rooms', () => {
  it('creates readable 5-character codes', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = createRoomCode();
      expect(code).toHaveLength(5);
      expect([...code].every(character => ROOM_CODE_ALPHABET.includes(character))).toBe(true);
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('normalises typed codes and reads them from links', () => {
    expect(normalizeRoomCode(' k7m-2q ')).toBe('K7M2Q');
    expect(normalizeRoomCode('K0M2Q')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
    expect(roomCodeFromHash('#/play/chess?room=k7m2q')).toBe('K7M2Q');
    expect(roomCodeFromHash('#/play/chess')).toBeNull();
    expect(hostPeerId('K7M2Q')).toBe('kushchess-k7m2q');
    expect(roomLink('K7M2Q', { origin: 'https://abhi1kush.github.io', pathname: '/kush-games/' }))
      .toBe('https://abhi1kush.github.io/kush-games/#/play/chess?room=K7M2Q');
  });

  it('validates saved games', () => {
    const match = { ...createMatch('b', 2), moves: ['e2e4'] };
    expect(parseChessSave(JSON.parse(JSON.stringify({ mode: 'online', match, role: 'guest', roomCode: 'K7M2Q' }))))
      .toEqual({ mode: 'online', match, role: 'guest', roomCode: 'K7M2Q' });
    expect(parseChessSave({ mode: 'local', match })).toEqual({ mode: 'local', match });
    expect(parseChessSave({ mode: 'online', match, role: 'guest', roomCode: 'bad code' })).toBeNull();
    expect(parseChessSave({ mode: 'online', match, role: 'spy', roomCode: 'K7M2Q' })).toBeNull();
    expect(parseChessSave({ mode: 'local', match: { ...match, moves: ['e2e5'] } })).toBeNull();
  });
});
