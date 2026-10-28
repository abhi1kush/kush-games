import { describe, expect, it } from 'vitest';
import { infoPath, parseHash, playPath, renamedHash } from './routing';

describe('hash routing', () => {
  it('parses home, info and play routes', () => {
    expect(parseHash('')).toEqual({ page: 'home' });
    expect(parseHash('#/')).toEqual({ page: 'home' });
    expect(parseHash(infoPath('snake'))).toEqual({ page: 'home', infoGameId: 'snake' });
    expect(parseHash(playPath('power-of-2'))).toEqual({ page: 'play', gameId: 'power-of-2' });
    expect(parseHash('#/play/')).toEqual({ page: 'home' });
    expect(parseHash('#/play/chess?room=K7M2Q')).toEqual({ page: 'play', gameId: 'chess' });
  });

  it('keeps old links to a renamed game working (2048 → Power of 2)', () => {
    expect(parseHash('#/play/2048')).toEqual({ page: 'play', gameId: 'power-of-2' });
    expect(parseHash('#/title/2048')).toEqual({ page: 'home', infoGameId: 'power-of-2' });
    expect(renamedHash('#/play/2048')).toBe('#/play/power-of-2');
    expect(renamedHash('#/title/2048')).toBe('#/title/power-of-2');
    expect(renamedHash('#/play/2048?x=1')).toBe('#/play/power-of-2?x=1');
    expect(renamedHash('#/play/power-of-2')).toBeNull();
    expect(renamedHash('#/play/snake')).toBeNull();
    expect(renamedHash('#/')).toBeNull();
  });

  it('sends links to removed games (Solitaire) back to the hub', () => {
    expect(parseHash(playPath('solitaire'))).toEqual({ page: 'home' });
    expect(parseHash(infoPath('solitaire'))).toEqual({ page: 'home' });
  });
});
