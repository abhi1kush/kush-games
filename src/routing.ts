import { useEffect, useState } from 'react';

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
  if (segments[0] === 'play' && segments[1]) return { page: 'play', gameId: segments[1] };
  if (segments[0] === 'title' && segments[1]) return { page: 'home', infoGameId: segments[1] };
  return { page: 'home' };
}

export const homePath = '#/';
export const playPath = (gameId: string) => `#/play/${encodeURIComponent(gameId)}`;
export const infoPath = (gameId: string) => `#/title/${encodeURIComponent(gameId)}`;

export function navigate(path: string) {
  window.location.hash = path;
}

/** A link to a removed game is rewritten to the home page (without adding a history entry). */
function routeFromLocation(): Route {
  const route = parseHash(window.location.hash);
  const segments = window.location.hash.replace(/^#/, '').split('?')[0].split('/').filter(Boolean);
  if (route.page === 'home' && !route.infoGameId && segments.length >= 2) {
    try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${homePath}`); } catch { /* ignore */ }
  }
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
