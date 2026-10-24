/**
 * Colour themes. Each theme is a set of CSS custom properties (see `:root` and `:root[data-theme=…]` in styles.css);
 * switching sets `data-theme` on <html>, so the change is instant and needs no reload. The choice is saved with the
 * versioned save-slot pattern (`kush-games:theme:save:v1`), and a tiny inline script in index.html applies it before
 * the first paint, so a saved theme never flashes red first.
 */
import { useSyncExternalStore } from 'react';
import { createSaveSlot, isRecord, saveKey } from './games/persistence';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
  /** Swatches shown in the picker (the palette, in role order). */
  swatches: string[];
  /** Browser UI colour (`<meta name="theme-color">`). */
  chromeColor: string;
  /** Suffix of this theme's favicon files in public/ (made by scripts/build-favicons.mjs): favicon<suffix>.svg … */
  iconSuffix: string;
}

export const THEME_IDS = ['netflix-red', 'lagoon'] as const;
export type ThemeId = typeof THEME_IDS[number];
export const DEFAULT_THEME: ThemeId = 'netflix-red';

export const THEMES: readonly ThemeOption[] = [
  { id: 'netflix-red', name: 'Netflix Red', description: 'The classic dark look with red accents', swatches: ['#141414', '#181818', '#e50914', '#ffffff', '#46d369'], chromeColor: '#141414', iconSuffix: '' },
  { id: 'lagoon', name: 'Lagoon', description: 'Deep teal with green, cyan and gold', swatches: ['#163235', '#106967', '#4fbc9c', '#32bfda', '#efca7c'], chromeColor: '#163235', iconSuffix: '-lagoon' },
];

export const THEME_SAVE_ID = 'theme';
export const THEME_SAVE_VERSION = 1;
/** The key the inline script in index.html reads; a test keeps the two in step. */
export const THEME_STORAGE_KEY = saveKey(THEME_SAVE_ID, THEME_SAVE_VERSION);

export const isThemeId = (value: unknown): value is ThemeId => typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
export function parseThemeSave(data: unknown): { theme: ThemeId } | null {
  return isRecord(data) && isThemeId(data.theme) ? { theme: data.theme } : null;
}

const themeSlot = createSaveSlot({ gameId: THEME_SAVE_ID, version: THEME_SAVE_VERSION, parse: parseThemeSave });

function readInitialTheme(): ThemeId {
  if (typeof document !== 'undefined' && isThemeId(document.documentElement.dataset.theme)) return document.documentElement.dataset.theme;
  return themeSlot.load()?.theme ?? DEFAULT_THEME;
}

let currentTheme: ThemeId = readInitialTheme();
const listeners = new Set<() => void>();

/** Bump to make browsers fetch the icons again after they change. */
export const ICON_VERSION = 3;
/** The tab / home-screen icon links in index.html and the file each one points to (before the theme suffix). */
const ICON_LINKS: [id: string, name: string, extension: string][] = [
  ['favicon-png', 'favicon', '-32.png'], ['favicon-svg', 'favicon', '.svg'], ['apple-touch-icon', 'apple-touch-icon', '.png'],
];
export const iconHref = (name: string, suffix: string, extension: string) => `${import.meta.env.BASE_URL}${name}${suffix}${extension}?v=${ICON_VERSION}`;

/** Put a theme on the page: the data-theme attribute, the browser UI colour and the matching K favicon. */
export function applyTheme(themeId: ThemeId) {
  if (typeof document === 'undefined') return;
  const theme = THEMES.find(option => option.id === themeId) ?? THEMES[0];
  const root = document.documentElement;
  if (theme.id === DEFAULT_THEME) delete root.dataset.theme; else root.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.chromeColor);
  for (const [id, name, extension] of ICON_LINKS) {
    const link = document.getElementById(id) as HTMLLinkElement | null;
    const href = iconHref(name, theme.iconSuffix, extension);
    if (link && !link.href.endsWith(href)) link.href = href;
  }
}

export function setTheme(themeId: ThemeId) {
  if (themeId === currentTheme) return;
  currentTheme = themeId;
  applyTheme(themeId);
  if (themeId === DEFAULT_THEME) themeSlot.clear(); else themeSlot.save({ theme: themeId });
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // another tab changed the theme
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const saved = themeSlot.load()?.theme ?? DEFAULT_THEME;
    if (saved !== currentTheme) { currentTheme = saved; applyTheme(saved); listeners.forEach(other => other()); }
  };
  window.addEventListener('storage', handleStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', handleStorage); };
};

/** The current theme as React state (all settings buttons stay in sync). */
export const useTheme = () => useSyncExternalStore(subscribe, () => currentTheme, () => DEFAULT_THEME);

if (typeof document !== 'undefined') applyTheme(currentTheme);
