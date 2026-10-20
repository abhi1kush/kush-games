import { useEffect, useMemo, useRef } from 'react';
import GameDetailModal from './components/GameDetailModal';
import GameRowView from './components/GameRowView';
import HeroBanner from './components/HeroBanner';
import NavBar from './components/NavBar';
import PlayerPage from './components/PlayerPage';
import { buildHomeRows, featuredGame, findGame } from './games/registry';
import { useHashRoute } from './routing';

export default function App() {
  const route = useHashRoute();
  const homeRows = useMemo(() => buildHomeRows(), []);
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
        <NavBar />
        <HeroBanner game={featuredGame} />
        <div className="rows">
          {homeRows.map(row => <GameRowView key={row.id} row={row} />)}
        </div>
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
