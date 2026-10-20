import { Suspense, useEffect } from 'react';
import { findGame } from '../games/registry';
import { homePath, navigate } from '../routing';
import ComingSoonScreen from './ComingSoonScreen';

export default function PlayerPage({ gameId }: { gameId: string }) {
  const game = findGame(gameId);
  const GameComponent = game?.status === 'playable' ? game.component : undefined;
  const goBack = () => navigate(homePath);

  useEffect(() => {
    document.body.classList.add('no-scroll');
    document.title = game ? `${game.title} · Kush Games` : 'Kush Games';
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') goBack(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('no-scroll');
      document.title = 'Kush Games';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [game]);

  return (
    <div className="player" data-testid="player">
      <div className="player__bar">
        <button type="button" className="player__back" onClick={goBack} data-testid="back">
          <span aria-hidden="true">←</span> Back
        </button>
        <span className="player__title">{game ? game.title : 'Game not found'}</span>
      </div>
      <main className="player__stage">
        {!game && (
          <div className="player__message">
            <h1>Game not found</h1>
            <p>There is no game called “{gameId}”.</p>
            <button type="button" className="button button--play" onClick={goBack}>Browse games</button>
          </div>
        )}
        {game && !GameComponent && <ComingSoonScreen game={game} />}
        {GameComponent && (
          <Suspense fallback={<div className="player__message"><div className="spinner" aria-label="Loading" /></div>}>
            <GameComponent />
          </Suspense>
        )}
      </main>
    </div>
  );
}
