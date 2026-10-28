import { THUMBNAILS } from '../assets/thumbnails';
import type { GameDefinition } from '../games/types';
import { infoPath, navigate, playPath } from '../routing';

/** The big poster at the top of the home page for the featured game (picked in ⚙ settings; Color Trails by default). */
export default function HeroBanner({ game }: { game: GameDefinition }) {
  const { gradientFrom, gradientTo, glyph } = game.artwork;
  const thumbnail = THUMBNAILS[game.id];
  const genre = game.categories[0] ?? 'Puzzle';
  return (
    <header className="hero" data-testid="hero" data-featured-game={game.id}>
      <div className="hero__backdrop" style={{ background: `linear-gradient(120deg, #141414 0%, ${gradientFrom} 55%, ${gradientTo} 100%)` }}>
        {game.id === '2048' ? (
          <div className="hero__tiles" aria-hidden="true">
            {[2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4, 2, 8, 16, 2048].map((tileValue, tileIndex) => (
              <span key={tileIndex} className={`hero__tile hero__tile--${tileValue}`}>{tileValue}</span>
            ))}
          </div>
        ) : thumbnail ? (
          <div className="hero__poster" aria-hidden="true">
            <img src={thumbnail} width={320} height={180} alt="" decoding="async" draggable={false} />
          </div>
        ) : (
          <div className="hero__poster hero__poster--glyph" aria-hidden="true">{glyph}</div>
        )}
      </div>
      <div className="hero__fade" />
      <div className="hero__content">
        <div className="hero__label"><span className="hero__label-k">K</span> GAME</div>
        <h1 className="hero__title">{game.title}</h1>
        <div className="hero__rank"><span className="hero__top10">TOP<br />10</span> #1 in {genre} Games Today</div>
        <p className="hero__description">{game.description}</p>
        <div className="hero__actions">
          <button type="button" className="button button--play" onClick={() => navigate(playPath(game.id))}>
            <span aria-hidden="true">▶</span> Play
          </button>
          <button type="button" className="button button--info" onClick={() => navigate(infoPath(game.id))}>
            <span aria-hidden="true">ⓘ</span> More Info
          </button>
        </div>
      </div>
    </header>
  );
}
