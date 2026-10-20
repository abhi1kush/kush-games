import { describe, expect, it } from 'vitest';
import { infoPath, parseHash, playPath } from './routing';

describe('hash routing', () => {
  it('parses home, info and play routes', () => {
    expect(parseHash('')).toEqual({ page: 'home' });
    expect(parseHash('#/')).toEqual({ page: 'home' });
    expect(parseHash(infoPath('snake'))).toEqual({ page: 'home', infoGameId: 'snake' });
    expect(parseHash(playPath('2048'))).toEqual({ page: 'play', gameId: '2048' });
    expect(parseHash('#/play/')).toEqual({ page: 'home' });
    expect(parseHash('#/play/chess?room=K7M2Q')).toEqual({ page: 'play', gameId: 'chess' });
  });
});
