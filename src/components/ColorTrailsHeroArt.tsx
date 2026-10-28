import { DotSymbol, colorOf } from '../games/colortrails/palette';

/** One trail of the poster puzzle: its color index and the cells it passes through, endpoint to endpoint. */
type PosterTrail = { color: number; cells: [number, number][]; drawing?: boolean };

/**
 * A solved-looking 6×6 Color Trails board (every cell filled), with one purple trail still being drawn
 * toward its partner dot — the hub's custom hero art for Color Trails, in the spirit of the 2048 tile grid.
 */
const POSTER_TRAILS: PosterTrail[] = [
  { color: 0, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]] },
  { color: 1, cells: [[4, 0], [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5]] },
  { color: 3, cells: [[4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [3, 5]] },
  { color: 2, cells: [[2, 1], [1, 1], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5]] },
  { color: 4, cells: [[1, 2], [2, 2], [2, 3], [3, 3]] },
  { color: 5, cells: [[3, 4], [2, 4], [1, 4], [1, 3]], drawing: true },
];

const SIZE = 6;
const center = (cell: number) => cell * 10 + 5;
const pathOf = (cells: [number, number][]) =>
  cells.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${center(x)} ${center(y)}`).join('');

export default function ColorTrailsHeroArt() {
  return (
    <div className="hero__trails" aria-hidden="true" data-testid="hero-color-trails">
      <svg viewBox="-2 -2 64 64" className="hero__trails-board">
        <defs>
          <filter id="hero-trail-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="hero-trail-dot-shine" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* board cells */}
        {Array.from({ length: SIZE * SIZE }, (_, index) => (
          <rect key={index} className="hero__trails-cell" x={(index % SIZE) * 10 + 0.6} y={Math.floor(index / SIZE) * 10 + 0.6}
            width={8.8} height={8.8} rx={1.6} />
        ))}
        {/* soft color wash under each trail's cells */}
        {POSTER_TRAILS.map((trail) => trail.cells.map(([x, y]) => (
          <rect key={`${trail.color}-${x}-${y}`} x={x * 10 + 0.6} y={y * 10 + 0.6} width={8.8} height={8.8} rx={1.6}
            fill={colorOf(trail.color).fill} opacity={trail.drawing ? 0.12 : 0.2} />
        )))}
        {/* the trails themselves */}
        <g filter="url(#hero-trail-glow)" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {POSTER_TRAILS.map((trail) => (
            <path key={trail.color} d={pathOf(trail.drawing ? trail.cells.slice(0, -1) : trail.cells)}
              stroke={colorOf(trail.color).fill} strokeWidth={3.6}
              className={trail.drawing ? 'hero__trails-path hero__trails-path--drawing' : 'hero__trails-path'}
              pathLength={100} />
          ))}
        </g>
        {/* endpoint dots with their color-blind-friendly symbols */}
        {POSTER_TRAILS.map((trail) => {
          const ends = [trail.cells[0], trail.cells[trail.cells.length - 1]];
          return ends.map(([x, y], endIndex) => (
            <g key={`${trail.color}-end-${endIndex}`}>
              <circle cx={center(x)} cy={center(y)} r={3.4} fill={colorOf(trail.color).fill}
                className={trail.drawing && endIndex === 1 ? 'hero__trails-dot hero__trails-dot--target' : 'hero__trails-dot'} />
              <circle cx={center(x)} cy={center(y)} r={3.4} fill="url(#hero-trail-dot-shine)" />
              <DotSymbol color={trail.color} x={center(x)} y={center(y)} />
            </g>
          ));
        })}
        {/* the "finger" drawing the purple trail */}
        <circle className="hero__trails-cursor" cx={center(1)} cy={center(4)} r={4.6} />
      </svg>
      {/* floating dots around the board for depth */}
      {[0, 1, 2, 3, 4, 6].map((color, index) => (
        <span key={color} className={`hero__trails-orb hero__trails-orb--${index}`} style={{ background: colorOf(color).fill, color: colorOf(color).fill }} />
      ))}
    </div>
  );
}
