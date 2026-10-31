import { playPath } from '../routing';

/** Absolute link that opens a game, based on where the site is served from (e.g. https://abhi1kush.github.io/kush-games/#/play/mountain-climb). */
export function gameLink(gameId: string, location: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${location.origin}${location.pathname}${playPath(gameId)}`;
}

type ShareNavigator = Pick<Navigator, 'share'> & { clipboard?: Pick<Clipboard, 'writeText'> };

/** Share a game's play link: the Web Share sheet when there is one, otherwise copy the link. Resolves to what happened. */
export async function shareGameLink(gameId: string, gameName: string, nav: ShareNavigator = navigator, location?: Pick<Location, 'origin' | 'pathname'>): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = gameLink(gameId, location);
  if (typeof nav.share === 'function') {
    try { await nav.share({ title: `${gameName} on Kush Games`, text: `Play ${gameName} on Kush Games:`, url }); return 'shared'; } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  try { await nav.clipboard!.writeText(url); return 'copied'; } catch { return 'failed'; }
}
