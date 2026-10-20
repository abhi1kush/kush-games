import { useEffect, useRef, useState } from 'react';
import type { GameRow } from '../games/registry';
import GameCard from './GameCard';

export default function GameRowView({ row }: { row: GameRow }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = () => {
    const track = trackRef.current;
    if (!track) return;
    setCanScrollLeft(track.scrollLeft > 4);
    setCanScrollRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, []);

  const scrollByPage = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className="row" id={`row-${row.id}`} data-testid={`row-${row.id}`}>
      <h2 className="row__title">{row.title}</h2>
      <div className="row__viewport">
        <button type="button" className="row__arrow row__arrow--left" hidden={!canScrollLeft}
          onClick={() => scrollByPage(-1)} aria-label={`Scroll ${row.title} left`}>‹</button>
        <div className="row__track" ref={trackRef} onScroll={updateArrows}>
          {row.games.map(game => <GameCard key={game.id} game={game} />)}
        </div>
        <button type="button" className="row__arrow row__arrow--right" hidden={!canScrollRight}
          onClick={() => scrollByPage(1)} aria-label={`Scroll ${row.title} right`}>›</button>
      </div>
    </section>
  );
}
