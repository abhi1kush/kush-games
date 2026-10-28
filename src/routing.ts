import { useEffect, useState } from 'react';
import { currentGameId, RENAMED_GAME_IDS } from './games/registry';

export type Route =
  | { page: 'home'; infoGameId?: string }
  | { page: 'play'; gameId: string };

/** Hash routes (work on GitHub Pages without server rewrites):
 *  #/            home
 *  #/title/<id>  home with the detail modal open
 *  #/play/<id>   full-screen game (a game may read its own ?query, e.g. #/play/chess?room=K7M2Q) */
/** Games that were taken off the hub: their old links land on the home page instead of "Game not found". */
export const REMOVED_GAME_IDS: ReadonlySet<string> = new Set(['solitaire']);

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0];
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
  if ((segments[0] === 'play' || segments[0] === 'title') && segments[1] && REMOVED_GAME_IDS.has(segments[1])) return { page: 'home' };
  // A renamed game's old id (e.g. #/play/2048 → Power of 2) opens the game under its new id.
  if (segments[0] === 'play' && segments[1]) return { page: 'play', gameId: currentGameId(segments[1]) };
  if (segments[0] === 'title' && segments[1]) return { page: 'home', infoGameId: currentGameId(segments[1]) };
  return { page: 'home' };
}

export const homePath = '#/';
export const playPath = (gameId: string) => `#/play/${encodeURIComponent(gameId)}`;
export const infoPath = (gameId: string) => `#/title/${encodeURIComponent(gameId)}`;

export function navigate(path: string) {
  window.location.hash = path;
}

/** The hash with a renamed game's old id swapped for its new one (keeping any ?query), or null when nothing was renamed. */
export function renamedHash(hash: string): string | null {
  const [path, ...query] = hash.replace(/^#/, '').split('?');
  const segments = path.split('/').filter(Boolean);
  if ((segments[0] !== 'play' && segments[0] !== 'title') || !segments[1]) return null;
  const oldId = decodeURIComponent(segments[1]);
  if (!Object.prototype.hasOwnProperty.call(RENAMED_GAME_IDS, oldId)) return null;
  const newPath = segments[0] === 'play' ? playPath(currentGameId(oldId)) : infoPath(currentGameId(oldId));
  return query.length ? `${newPath}?${query.join('?')}` : newPath;
}

/** A link to a removed game is rewritten to the home page, and a renamed game's old link to its new id
 *  (both without adding a history entry, so Back still works and bookmarks keep opening the game). */
function routeFromLocation(): Route {
  const route = parseHash(window.location.hash);
  const segments = window.location.hash.replace(/^#/, '').split('?')[0].split('/').filter(Boolean);
  const replaceHash = (hash: string) => {
    try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`); } catch { /* ignore */ }
  };
  if (route.page === 'home' && !route.infoGameId && segments.length >= 2) replaceHash(homePath);
  else { const newHash = renamedHash(window.location.hash); if (newHash) replaceHash(newHash); }
  return route;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(routeFromLocation);
  useEffect(() => {
    const handleHashChange = () => setRoute(routeFromLocation());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  return route;
}
