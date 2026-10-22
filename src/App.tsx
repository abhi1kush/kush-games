import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameDetailModal from './components/GameDetailModal';
import GameGrid from './components/GameGrid';
import GenreFilter, { type GenreChoice } from './components/GenreFilter';
import HeroBanner from './components/HeroBanner';
import NavBar from './components/NavBar';
import PlayerPage from './components/PlayerPage';
import { buildHomeSections, featuredGame, findGame } from './games/registry';
import { useHashRoute } from './routing';

export default function App() {
  const route = useHashRoute();
  const sections = useMemo(() => buildHomeSections(), []);
  const [genre, setGenre] = useState<GenreChoice>('all');
  const shownGames = useMemo(
    () => (genre === 'all' ? sections.playableGames : sections.playableGames.filter(game => game.categories.includes(genre))),
    [genre, sections]);
  const showGenre = useCallback((choice: GenreChoice) => {
    setGenre(choice);
    document.getElementById('row-play-now')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const infoGame = route.page === 'home' && route.infoGameId ? findGame(route.infoGameId) : undefined;
  const isPlaying = route.page === 'play';
  const homeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // make the hidden home page non-interactive while a game is open
    homeRef.current?.toggleAttribute('inert', isPlaying);
  }, [isPlaying]);

  return (
    <>
      {/* Home stays mounted under the player so the scroll position is kept when you go Back. */}
      <div className="home" aria-hidden={isPlaying} ref={homeRef}>
        <NavBar onShowGenre={showGenre} />
        <HeroBanner game={featuredGame} />
        <main className="rows">
          <GameGrid sectionId="play-now" games={shownGames}
            title={<>{genre === 'all' ? 'All games' : `${genre} games`} <span className="home-section__count">{shownGames.length}</span></>}>
            <GenreFilter genres={sections.genres} totalCount={sections.playableGames.length} selected={genre} onSelect={setGenre} />
          </GameGrid>
          <GameGrid sectionId="coming-soon" title="Coming Soon" games={sections.comingSoonGames} />
        </main>
        <footer className="footer">
          <p>Kush Games — a home for browser games. Built with React, TypeScript &amp; Vite.</p>
          <p><a href="https://github.com/abhi1kush/kush-games">Source on GitHub</a></p>
        </footer>
      </div>
      {infoGame && <GameDetailModal game={infoGame} />}
      {route.page === 'play' && <PlayerPage gameId={route.gameId} />}
    </>
  );
}
