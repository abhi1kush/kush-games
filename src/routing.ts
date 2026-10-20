import { useEffect, useState } from 'react';

export type Route =
  | { page: 'home'; infoGameId?: string }
  | { page: 'play'; gameId: string };

/** Hash routes (work on GitHub Pages without server rewrites):
 *  #/            home
 *  #/title/<id>  home with the detail modal open
 *  #/play/<id>   full-screen game */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
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

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const handleHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  return route;
}
