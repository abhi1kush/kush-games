/**
 * Saving in-progress games to localStorage so a refresh doesn't wipe progress.
 *
 * Each game has one save slot under a versioned key, e.g. `kush-games:blocks:save:v1`.
 * A save is stored as `{ version, savedAt, data }`. Loading never throws: corrupt JSON,
 * a different version or data that fails the game's own check is discarded (and removed).
 * Bump a game's version when its saved shape changes; old saves are then ignored.
 */

/** Minimal part of the Storage API we use, so tests can pass an in-memory version. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface SaveEnvelope<Data> { version: number; savedAt: number; data: Data; }

export interface SaveSlotOptions<Data> {
  gameId: string;
  version: number;
  /** Returns the data when it has the expected shape, otherwise null. */
  parse: (data: unknown) => Data | null;
  /** Minimum time between throttled writes. */
  throttleMs?: number;
  storage?: KeyValueStorage | null;
  now?: () => number;
}

export interface SaveSlot<Data> {
  readonly key: string;
  load(): Data | null;
  /** Write now (cancels any pending throttled write). */
  save(data: Data): void;
  /** Write at most once per throttle window; the newest data wins. Call flush() before the page goes away. */
  saveThrottled(data: Data): void;
  /** Write a pending throttled save immediately. */
  flush(): void;
  clear(): void;
}

/** Saves for the current versions; the home page uses this to show "Continue" badges. */
export const SAVE_VERSIONS: Record<string, number> = {
  '2048': 1, snake: 1, blocks: 1, chess: 1, minesweeper: 1, sudoku: 1, 'tic-tac-toe': 1, 'memory-match': 1, 'flappy-wings': 1,
  'arrow-out': 3, 'color-trails': 1, breakout: 1, 'connect-four': 1, checkers: 1, 'kush-jump': 1, 'jungle-strike': 1, 'antariksh-defenders': 1, 'mithai-match': 1,
};

/** Storage keys left behind by games that were removed from the hub; cleared once on startup. */
export const REMOVED_GAME_STORAGE_KEYS: readonly string[] = ['kush-games:solitaire:save:v1', 'kush-games-solitaire-draw', 'kush-games-solitaire-stats'];

export function clearRemovedGameData(storage: KeyValueStorage | null = browserStorage()) {
  for (const key of REMOVED_GAME_STORAGE_KEYS) { try { storage?.removeItem(key); } catch { /* storage unavailable */ } }
}

/** Games whose online room is saved in a second slot (so it doesn't replace the local game's save). */
export const ONLINE_SAVE_VERSION = 1;
export const onlineSaveGameId = (gameId: string) => `${gameId}-online`;
export const GAMES_WITH_ONLINE_SAVE: readonly string[] = ['connect-four', 'checkers'];

export const saveKey = (gameId: string, version: number) => `kush-games:${gameId}:save:v${version}`;

export const DEFAULT_SAVE_THROTTLE_MS = 1000;

function browserStorage(): KeyValueStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Parse an envelope string; null for anything that isn't a valid save of this version. */
export function parseEnvelope<Data>(text: string | null, version: number, parse: (data: unknown) => Data | null): Data | null {
  if (text === null) return null;
  let envelope: unknown;
  try { envelope = JSON.parse(text); } catch { return null; }
  if (typeof envelope !== 'object' || envelope === null) return null;
  const candidate = envelope as Partial<SaveEnvelope<unknown>>;
  if (candidate.version !== version || !('data' in candidate)) return null;
  try { return parse(candidate.data); } catch { return null; }
}

export function createSaveSlot<Data>(options: SaveSlotOptions<Data>): SaveSlot<Data> {
  const { gameId, version, parse, throttleMs = DEFAULT_SAVE_THROTTLE_MS } = options;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const now = options.now ?? Date.now;
  const key = saveKey(gameId, version);
  let pending: { data: Data } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastWriteAt = -Infinity;

  const remove = (storageKey: string) => { try { storage?.removeItem(storageKey); } catch { /* storage unavailable */ } };
  const cancelPending = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = null;
  };
  const write = (data: Data) => {
    lastWriteAt = now();
    try {
      const envelope: SaveEnvelope<Data> = { version, savedAt: lastWriteAt, data };
      storage?.setItem(key, JSON.stringify(envelope));
    } catch { /* full or unavailable storage: keep playing without saving */ }
  };

  return {
    key,
    load() {
      // Drop saves from older versions of this game.
      for (let oldVersion = 0; oldVersion < version; oldVersion++) remove(saveKey(gameId, oldVersion));
      let text: string | null = null;
      try { text = storage?.getItem(key) ?? null; } catch { return null; }
      const data = parseEnvelope(text, version, parse);
      if (data === null && text !== null) remove(key);
      return data;
    },
    save(data) {
      cancelPending();
      write(data);
    },
    saveThrottled(data) {
      pending = { data };
      if (timer !== undefined) return;
      const wait = Math.max(0, lastWriteAt + throttleMs - now());
      timer = setTimeout(() => {
        timer = undefined;
        if (pending) { const { data: newest } = pending; pending = null; write(newest); }
      }, wait);
    },
    flush() {
      if (!pending) return;
      const { data } = pending;
      cancelPending();
      write(data);
    },
    clear() {
      cancelPending();
      remove(key);
    },
  };
}

/** True when a game has an in-progress save (cheap enough to call while rendering). */
export function hasSavedGame(gameId: string, storage: KeyValueStorage | null = browserStorage()): boolean {
  const version = SAVE_VERSIONS[gameId];
  if (version === undefined || !storage) return false;
  const isSaved = (key: string, keyVersion: number) =>
    parseEnvelope(storage.getItem(key), keyVersion, data => (typeof data === 'object' && data !== null ? data : null)) !== null;
  try {
    return isSaved(saveKey(gameId, version), version)
      || (GAMES_WITH_ONLINE_SAVE.includes(gameId) && isSaved(saveKey(onlineSaveGameId(gameId), ONLINE_SAVE_VERSION), ONLINE_SAVE_VERSION));
  } catch { return false; }
}

// ---------- Small validation helpers shared by the games ----------
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isInteger = (value: unknown, minimum = -Infinity, maximum = Infinity): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
export const isOneOf = <Option extends string>(value: unknown, options: readonly Option[]): value is Option =>
  typeof value === 'string' && (options as readonly string[]).includes(value);
