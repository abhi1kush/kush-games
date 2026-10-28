import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from './games/persistence';
import { createFeaturedSlot, DEFAULT_FEATURED_GAME_ID, featurableGames, FEATURED_STORAGE_KEY, loadFeaturedGameId, parseFeaturedSave } from './featured';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
}

describe('featured (poster) game', () => {
  it('defaults to Color Trails when nothing is saved', () => {
    expect(DEFAULT_FEATURED_GAME_ID).toBe('color-trails');
    expect(loadFeaturedGameId(createFeaturedSlot(memoryStorage()))).toBe('color-trails');
  });

  it('remembers a saved choice under a versioned key, like the theme', () => {
    const storage = memoryStorage();
    createFeaturedSlot(storage).save({ gameId: '2048' });
    expect(FEATURED_STORAGE_KEY).toBe('kush-games:featured-game:save:v1');
    expect(storage.data.has(FEATURED_STORAGE_KEY)).toBe(true);
    expect(loadFeaturedGameId(createFeaturedSlot(storage))).toBe('2048'); // a fresh load (refresh) reads it back
  });

  it('ignores unknown or removed games and falls back to the default', () => {
    expect(parseFeaturedSave({ gameId: 'jungle-strike' })).toBeNull();
    expect(parseFeaturedSave('2048')).toBeNull();
    const storage = memoryStorage();
    storage.setItem(FEATURED_STORAGE_KEY, JSON.stringify({ version: 1, savedAt: 0, data: { gameId: 'nope' } }));
    expect(loadFeaturedGameId(createFeaturedSlot(storage))).toBe('color-trails');
  });

  it('offers every playable game, Color Trails first then A–Z, including 2048', () => {
    const ids = featurableGames().map(game => game.id);
    expect(ids[0]).toBe('color-trails');
    expect(ids).toContain('2048');
    expect(new Set(ids).size).toBe(ids.length);
    const rest = featurableGames().slice(1).map(game => game.title);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });
});
