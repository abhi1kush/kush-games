import { useEffect } from 'react';
import { games } from '../games/registry';
import type { GameDefinition } from '../games/types';
import { homePath, infoPath, navigate, playPath } from '../routing';
import GameArt from './GameArt';

export default function GameDetailModal({ game }: { game: GameDefinition }) {
  const isPlayable = game.status === 'playable';
  const close = () => navigate(homePath);
  const similarGames = games
    .filter(other => other.id !== game.id && other.categories.some(category => game.categories.includes(category)))
    .slice(0, 6);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', handleKeyDown);
    document.body.classList.add('no-scroll');
    return () => { window.removeEventListener('keydown', handleKeyDown); document.body.classList.remove('no-scroll'); };
  }, []);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={game.title} data-testid="modal" onClick={close}>
      <div className="modal__panel" onClick={event => event.stopPropagation()}>
        <button type="button" className="modal__close" onClick={close} aria-label="Close">✕</button>
        <div className="modal__art">
          <GameArt game={game} variant="modal" showTitle={false} />
          <div className="modal__art-fade" />
          <div className="modal__headline">
            <h2>{game.title}</h2>
            <button type="button" className="button button--play" onClick={() => navigate(playPath(game.id))}>
              <span aria-hidden="true">▶</span> {isPlayable ? 'Play' : 'Preview'}
            </button>
          </div>
        </div>
        <div className="modal__body">
          <div className="modal__main">
            <div className="modal__meta">
              <span className={isPlayable ? 'modal__match' : 'modal__soon'}>{isPlayable ? 'Playable now' : 'Coming soon'}</span>
              <span>{game.releaseYear}</span>
              <span className="modal__hd">HD</span>
            </div>
            <p className="modal__tagline">{game.tagline}</p>
            <p>{game.description}</p>
          </div>
          <dl className="modal__facts">
            <dt>Genres:</dt><dd>{game.categories.join(', ')}</dd>
            <dt>Controls:</dt><dd>{game.controls}</dd>
          </dl>
        </div>
        {similarGames.length > 0 && (
          <div className="modal__similar">
            <h3>More Like This</h3>
            <div className="modal__grid">
              {similarGames.map(other => (
                <button type="button" key={other.id} className="modal__similar-card" onClick={() => navigate(infoPath(other.id))}>
                  <GameArt game={other} />
                  <span>{other.tagline}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
