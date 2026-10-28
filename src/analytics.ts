/** Umami Cloud analytics (script tag in index.html). Pageviews are automatic; this adds custom events.
 *  No PII: only the registry game id is sent. Safe when the script is blocked or not yet loaded. */

type Umami = { track: (event: string, data?: Record<string, string>) => unknown };

const getUmami = (): Umami | undefined => {
  const umami = (window as unknown as { umami?: Umami }).umami;
  return umami && typeof umami.track === 'function' ? umami : undefined;
};

/** Send `name` once, waiting up to `timeoutMs` for the deferred script; no-op if it never arrives.
 *  Returns a cancel function (call it on unmount). */
export function trackEvent(name: string, data: Record<string, string>, timeoutMs = 10000, pollMs = 250): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const deadline = Date.now() + timeoutMs;
  const attempt = () => {
    if (cancelled) return;
    const umami = getUmami();
    if (umami) {
      try { umami.track(name, data); } catch { /* analytics must never break a game */ }
      return;
    }
    if (Date.now() < deadline) timer = setTimeout(attempt, pollMs);
  };
  attempt();
  return () => { cancelled = true; if (timer) clearTimeout(timer); };
}

export const trackGamePlay = (gameId: string) => trackEvent('game-play', { game: gameId });
