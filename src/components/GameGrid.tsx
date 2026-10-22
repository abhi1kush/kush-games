import type { ReactNode } from 'react';
import type { GameDefinition } from '../games/types';
import GameCard from './GameCard';

/** One home-page section: a heading and a wrapping grid of cards (no sideways scrolling). */
export default function GameGrid({ sectionId, title, games, children }: {
  sectionId: string; title: ReactNode; games: GameDefinition[]; children?: ReactNode;
}) {
  return (
    <section className="home-section" id={`row-${sectionId}`} data-testid={`row-${sectionId}`} aria-labelledby={`title-${sectionId}`}>
      <h2 className="home-section__title" id={`title-${sectionId}`}>{title}</h2>
      {children}
      <div className="game-grid" role="list">
        {games.map(game => <div role="listitem" key={game.id} className="game-grid__item"><GameCard game={game} /></div>)}
      </div>
    </section>
  );
}
