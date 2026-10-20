import type { GameDefinition } from '../games/types';

interface GameArtProps {
  game: GameDefinition;
  variant?: 'card' | 'hero' | 'modal';
  showTitle?: boolean;
}

/** Generated cover art: gradient + SVG pattern + glyph + title. No external images. */
export default function GameArt({ game, variant = 'card', showTitle = true }: GameArtProps) {
  const { gradientFrom, gradientTo, accentColor, glyph } = game.artwork;
  const patternId = `pattern-${game.id}-${variant}`;
  return (
    <div
      className={`game-art game-art--${variant}`}
      style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`, ['--accent' as string]: accentColor }}
      aria-hidden="true"
    >
      <svg className="game-art__pattern" width="100%" height="100%">
        <defs>
          <pattern id={patternId} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <circle cx="4" cy="4" r="2" fill="white" fillOpacity="0.14" />
            <rect x="14" y="14" width="10" height="10" rx="2" fill="black" fillOpacity="0.06" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <span className="game-art__glyph">{glyph}</span>
      {showTitle && <span className="game-art__title">{game.title}</span>}
      {game.status === 'coming-soon' && variant === 'card' && <span className="game-art__badge">Coming Soon</span>}
    </div>
  );
}
