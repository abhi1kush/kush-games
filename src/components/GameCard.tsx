import type { GameDefinition } from '../games/types';
import { hasSavedGame } from '../games/persistence';
import { infoPath, navigate, playPath } from '../routing';
import GameArt from './GameArt';

export default function GameCard({ game }: { game: GameDefinition }) {
  const isPlayable = game.status === 'playable';
  // Read at render: a few localStorage lookups when the home page shows.
  const canContinue = isPlayable && hasSavedGame(game.id);
  return (
    <div className="card" data-testid={`card-${game.id}`}>
      <button type="button" className="card__cover" onClick={() => navigate(infoPath(game.id))} aria-label={`${game.title} – details`}>
        <GameArt game={game} />
        {canContinue && <span className="card__continue" data-testid={`continue-${game.id}`}>▶ Continue</span>}
      </button>
      <div className="card__details">
        <div className="card__actions">
          <button type="button" className="card__round card__round--play" onClick={() => navigate(playPath(game.id))}
            aria-label={`Play ${game.title}`}>▶</button>
          <button type="button" className="card__round" onClick={() => navigate(infoPath(game.id))}
            aria-label={`More info about ${game.title}`}>⌄</button>
          <span className={`card__status ${isPlayable ? 'card__status--live' : ''}`}>{canContinue ? 'Continue' : isPlayable ? 'Play now' : 'Coming soon'}</span>
        </div>
        <div className="card__title">{game.title}</div>
        <p className="card__description">{game.tagline}</p>
        <div className="card__tags">{game.categories.join(' • ')}</div>
      </div>
    </div>
  );
}
