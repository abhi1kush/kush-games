/**
 * The featured ("poster") game shown in the big hero banner on the home page. Visitors who never picked one get
 * Color Trails; the ⚙ settings panel lets anyone pick another playable game, and the choice is saved like the theme
 * (versioned save slot `kush-games:featured-game:save:v1`) so it survives a refresh.
 */
import { useSyncExternalStore } from 'react';
import { createSaveSlot, isRecord, saveKey, type KeyValueStorage } from './games/persistence';
import { findGame, games } from './games/registry';
import type { GameDefinition } from './games/types';

/** The hero game for new visitors (and whenever a saved choice is no longer a playable game). */
export const DEFAULT_FEATURED_GAME_ID = 'color-trails';

export const FEATURED_SAVE_ID = 'featured-game';
export const FEATURED_SAVE_VERSION = 1;
export const FEATURED_STORAGE_KEY = saveKey(FEATURED_SAVE_ID, FEATURED_SAVE_VERSION);

/** Games that can be the poster: every playable game, A–Z by title (the default first). */
export function featurableGames(allGames: GameDefinition[] = games): GameDefinition[] {
  const playable = allGames.filter(game => game.status === 'playable');
  const sorted = [...playable].sort((a, b) => a.title.localeCompare(b.title));
  const defaultGame = sorted.find(game => game.id === DEFAULT_FEATURED_GAME_ID);
  return defaultGame ? [defaultGame, ...sorted.filter(game => game !== defaultGame)] : sorted;
}

export const isFeaturableId = (value: unknown): value is string =>
  typeof value === 'string' && findGame(value)?.status === 'playable';

export function parseFeaturedSave(data: unknown): { gameId: string } | null {
  return isRecord(data) && isFeaturableId(data.gameId) ? { gameId: data.gameId } : null;
}

export const createFeaturedSlot = (storage?: KeyValueStorage | null) =>
  createSaveSlot({ gameId: FEATURED_SAVE_ID, version: FEATURED_SAVE_VERSION, parse: parseFeaturedSave, storage });

const featuredSlot = createFeaturedSlot();

/** The saved featured game id, or the default when nothing valid is saved. */
export const loadFeaturedGameId = (slot = featuredSlot) => slot.load()?.gameId ?? DEFAULT_FEATURED_GAME_ID;

let currentId = loadFeaturedGameId();
const listeners = new Set<() => void>();

export function setFeaturedGame(gameId: string) {
  if (!isFeaturableId(gameId) || gameId === currentId) return;
  currentId = gameId;
  featuredSlot.save({ gameId }); // saved even when it's the default, so an explicit choice survives a future default change
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => { // another tab changed it
    if (event.key !== FEATURED_STORAGE_KEY) return;
    const saved = loadFeaturedGameId();
    if (saved !== currentId) { currentId = saved; listeners.forEach(other => other()); }
  };
  window.addEventListener('storage', handleStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', handleStorage); };
};

/** The featured game id as React state (hero and settings stay in sync). */
export const useFeaturedGameId = () => useSyncExternalStore(subscribe, () => currentId, () => DEFAULT_FEATURED_GAME_ID);
export const useFeaturedGame = (): GameDefinition => findGame(useFeaturedGameId()) ?? findGame(DEFAULT_FEATURED_GAME_ID)!;
