import type { GameDefinition } from '../games/types';
import { useFeaturedGame } from '../featured';
import { homePath, navigate, playPath } from '../routing';

export default function ComingSoonScreen({ game }: { game: GameDefinition }) {
  const { gradientFrom, gradientTo, accentColor, glyph } = game.artwork;
  const featuredGame = useFeaturedGame();
  return (
    <div className="coming-soon" data-testid="coming-soon"
      style={{ background: `radial-gradient(circle at 50% 30%, ${gradientFrom}cc, ${gradientTo}66 45%, #0b0b0b 80%)` }}>
      <div className="coming-soon__glyph" style={{ color: accentColor }}>{glyph}</div>
      <div className="coming-soon__badge">Coming Soon</div>
      <h1>{game.title}</h1>
      <p className="coming-soon__tagline">{game.tagline}</p>
      <p className="coming-soon__description">{game.description}</p>
      <div className="coming-soon__progress" aria-hidden="true"><span /></div>
      <p className="coming-soon__note">This game is in development. Check back soon!</p>
      <div className="coming-soon__actions">
        <button type="button" className="button button--play" onClick={() => navigate(playPath(featuredGame.id))}>
          ▶ Play {featuredGame.title} instead
        </button>
        <button type="button" className="button button--info" onClick={() => navigate(homePath)}>Browse games</button>
      </div>
    </div>
  );
}
