import type { GameCategory } from '../games/types';
import { genreSlug } from '../games/registry';

export type GenreChoice = GameCategory | 'all';

/** All / Puzzle / Arcade / … chips that filter the All games grid. They wrap, never scroll sideways. */
export default function GenreFilter({ genres, totalCount, selected, onSelect }: {
  genres: { genre: GameCategory; count: number }[]; totalCount: number; selected: GenreChoice; onSelect: (choice: GenreChoice) => void;
}) {
  const chips: { choice: GenreChoice; label: string; count: number; testId: string }[] = [
    { choice: 'all', label: 'All', count: totalCount, testId: 'filter-all' },
    ...genres.map(({ genre, count }) => ({ choice: genre, label: genre, count, testId: `filter-${genreSlug(genre)}` })),
  ];
  return (
    <div className="genre-filter" role="group" aria-label="Filter games by genre">
      {chips.map(chip => (
        <button key={chip.choice} type="button" className="genre-filter__chip" data-testid={chip.testId}
          aria-pressed={selected === chip.choice} onClick={() => onSelect(chip.choice)}>
          {chip.label} <span className="genre-filter__count">{chip.count}</span>
        </button>
      ))}
    </div>
  );
}
