import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRemovedGameData, migrateRenamedGameData, createSaveSlot, hasSavedGame, KeyValueStorage, parseEnvelope, saveKey } from './persistence';

function memoryStorage(): KeyValueStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: key => { items.delete(key); },
  };
}

interface Progress { level: number; }
const parseProgress = (data: unknown): Progress | null =>
  typeof data === 'object' && data !== null && typeof (data as Progress).level === 'number' ? (data as Progress) : null;

describe('save slots', () => {
  afterEach(() => vi.useRealTimers());

  it('uses versioned keys', () => {
    expect(saveKey('blocks', 1)).toBe('kush-games:blocks:save:v1');
  });

  it('round-trips data', () => {
    const storage = memoryStorage();
    const slot = createSaveSlot({ gameId: 'test', version: 2, parse: parseProgress, storage });
    expect(slot.load()).toBeNull();
    slot.save({ level: 3 });
    expect(JSON.parse(storage.items.get('kush-games:test:save:v2')!)).toMatchObject({ version: 2, data: { level: 3 } });
    expect(slot.load()).toEqual({ level: 3 });
    slot.clear();
    expect(slot.load()).toBeNull();
    expect(storage.items.size).toBe(0);
  });

  it('discards a save with another version and removes older version keys', () => {
    const storage = memoryStorage();
    storage.setItem('kush-games:test:save:v2', JSON.stringify({ version: 1, savedAt: 0, data: { level: 3 } }));
    storage.setItem('kush-games:test:save:v1', JSON.stringify({ version: 1, savedAt: 0, data: { level: 3 } }));
    const slot = createSaveSlot({ gameId: 'test', version: 2, parse: parseProgress, storage });
    expect(slot.load()).toBeNull();
    expect(storage.items.size).toBe(0);
  });

  it('discards corrupt JSON and data that fails the check, without throwing', () => {
    const storage = memoryStorage();
    const slot = createSaveSlot({ gameId: 'test', version: 1, parse: parseProgress, storage });
    for (const text of ['{not json', 'null', '42', '"text"', '{"version":1}', JSON.stringify({ version: 1, savedAt: 0, data: { level: 'x' } })]) {
      storage.setItem(slot.key, text);
      expect(slot.load()).toBeNull();
      expect(storage.items.has(slot.key)).toBe(false);
    }
    const throwingParse = () => { throw new Error('bad'); };
    expect(parseEnvelope(JSON.stringify({ version: 1, data: {} }), 1, throwingParse)).toBeNull();
  });

  it('keeps working when storage throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('denied'); },
    };
    const slot = createSaveSlot({ gameId: 'test', version: 1, parse: parseProgress, storage: broken });
    expect(() => { slot.save({ level: 1 }); slot.clear(); }).not.toThrow();
    expect(slot.load()).toBeNull();
    expect(createSaveSlot({ gameId: 'test', version: 1, parse: parseProgress, storage: null }).load()).toBeNull();
  });

  it('throttles writes: at most one per window, newest data wins, flush writes at once', () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    let writes = 0;
    const counting: KeyValueStorage = { ...storage, setItem: (key, value) => { writes++; storage.setItem(key, value); } };
    const slot = createSaveSlot({ gameId: 'test', version: 1, parse: parseProgress, storage: counting, throttleMs: 1000, now: () => Date.now() });
    for (let level = 1; level <= 50; level++) slot.saveThrottled({ level });
    vi.advanceTimersByTime(0);
    expect(writes).toBe(1);
    expect(slot.load()).toEqual({ level: 50 });
    slot.saveThrottled({ level: 51 });
    slot.saveThrottled({ level: 52 });
    vi.advanceTimersByTime(500);
    expect(writes).toBe(1);
    vi.advanceTimersByTime(500);
    expect(writes).toBe(2);
    expect(slot.load()).toEqual({ level: 52 });
    slot.saveThrottled({ level: 53 });
    slot.flush();
    expect(writes).toBe(3);
    expect(slot.load()).toEqual({ level: 53 });
    vi.advanceTimersByTime(2000);
    expect(writes).toBe(3);
  });

  it('clear cancels a pending throttled write', () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const slot = createSaveSlot({ gameId: 'test', version: 1, parse: parseProgress, storage, throttleMs: 1000, now: () => Date.now() });
    slot.save({ level: 1 });
    slot.saveThrottled({ level: 2 });
    slot.clear();
    vi.advanceTimersByTime(2000);
    expect(slot.load()).toBeNull();
  });

  it('hasSavedGame reports saves for known games only', () => {
    const storage = memoryStorage();
    expect(hasSavedGame('snake', storage)).toBe(false);
    storage.setItem('kush-games:snake:save:v1', JSON.stringify({ version: 1, savedAt: 0, data: { score: 1 } }));
    expect(hasSavedGame('snake', storage)).toBe(true);
    storage.setItem('kush-games:snake:save:v1', '{oops');
    expect(hasSavedGame('snake', storage)).toBe(false);
    expect(hasSavedGame('chess', storage)).toBe(false);
  });

  it('an online room counts as a saved game for Connect Four and Checkers (Continue badge)', () => {
    const storage = memoryStorage();
    expect(hasSavedGame('checkers', storage)).toBe(false);
    storage.setItem('kush-games:checkers-online:save:v1', JSON.stringify({ version: 1, savedAt: 0, data: { mode: 'online' } }));
    expect(hasSavedGame('checkers', storage)).toBe(true);
    expect(hasSavedGame('connect-four', storage)).toBe(false);
  });

  it('clears data left behind by removed games (Solitaire) and nothing else', () => {
    const storage = memoryStorage();
    storage.setItem('kush-games:solitaire:save:v1', '{}');
    storage.setItem('kush-games-solitaire-stats', '{}');
    storage.setItem('kush-games:snake:save:v1', '{}');
    clearRemovedGameData(storage);
    expect([...storage.items.keys()]).toEqual(['kush-games:snake:save:v1']);
  });

  it('moves a renamed game\'s save and best score to its new keys (2048 → power-of-2)', () => {
    const storage = memoryStorage();
    storage.setItem('kush-games:2048:save:v1', '{"version":1}');
    storage.setItem('2048-best', '5000');
    storage.setItem('kush-games:snake:save:v1', '{}');
    migrateRenamedGameData(storage);
    expect(storage.getItem('kush-games:power-of-2:save:v1')).toBe('{"version":1}');
    expect(storage.getItem('kush-games-power-of-2-best')).toBe('5000');
    expect(storage.getItem('kush-games:2048:save:v1')).toBeNull();
    expect(storage.getItem('2048-best')).toBeNull();
    expect(storage.getItem('kush-games:snake:save:v1')).toBe('{}');
  });

  it('moves Ghat Climb\'s save and best score to Mountain Climb', () => {
    const storage = memoryStorage();
    storage.setItem('kush-games:ghat-climb:save:v1', '{"version":1,"savedAt":0,"data":{"x":420,"fuel":60,"coins":3}}');
    storage.setItem('kush-games-ghat-climb-best', '1234');
    migrateRenamedGameData(storage);
    expect(storage.getItem('kush-games:mountain-climb:save:v1')).toContain('"x":420');
    expect(storage.getItem('kush-games-mountain-climb-best')).toBe('1234');
    expect(storage.getItem('kush-games:ghat-climb:save:v1')).toBeNull();
    expect(storage.getItem('kush-games-ghat-climb-best')).toBeNull();
    expect(hasSavedGame('mountain-climb', storage)).toBe(true);
  });

  it('never overwrites newer data already under the new key', () => {
    const storage = memoryStorage();
    storage.setItem('kush-games:2048:save:v1', 'old');
    storage.setItem('kush-games:power-of-2:save:v1', 'new');
    migrateRenamedGameData(storage);
    expect(storage.getItem('kush-games:power-of-2:save:v1')).toBe('new');
    expect(storage.getItem('kush-games:2048:save:v1')).toBeNull();
  });
});
