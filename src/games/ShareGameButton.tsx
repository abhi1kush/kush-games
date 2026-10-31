import { useEffect, useRef, useState } from 'react';
import { shareGameLink } from './share';

/** A Share button for a game's play link, styled like the online buttons. Shows "Copied!" briefly when it copied the link. */
export function ShareGameButton({ gameId, gameName, testId = 'share-game' }: { gameId: string; gameName: string; testId?: string }) {
  const [label, setLabel] = useState<'Share' | 'Copied!' | 'Copy failed'>('Share');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onShare = async () => {
    const result = await shareGameLink(gameId, gameName);
    if (result !== 'copied' && result !== 'failed') return;
    setLabel(result === 'copied' ? 'Copied!' : 'Copy failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLabel('Share'), 2000);
  };
  return (
    <button type="button" className="online-button" onClick={() => { void onShare(); }} data-testid={testId} aria-label={`Share ${gameName}`} aria-live="polite">
      {label === 'Share' ? '↗ Share' : label}
    </button>
  );
}
