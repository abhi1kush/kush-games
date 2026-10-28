import { DotSymbol, colorOf } from '../games/colortrails/palette';

type Cell = [number, number];

/**
 * The hub's custom hero art for Color Trails: a tilted 6×6 trail board whose one job is to show the game's
 * core move — a trail being drawn from one dot to its matching partner. A fingertip drags a purple trail
 * from the first dot, around one corner, into the second dot, which pops when the pair connects; then the
 * loop resets. A couple of dim, unconnected pairs hint at the rest of the puzzle without competing for the eye.
 * With prefers-reduced-motion the board shows the finished connection, still.
 */
const HERO_COLOR = 5; // purple
const HERO_CELLS: Cell[] = [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3], [4, 4]];
const WAITING_PAIRS: { color: number; ends: [Cell, Cell] }[] = [
  { color: 1, ends: [[0, 2], [0, 5]] },
  { color: 4, ends: [[5, 0], [5, 5]] },
  { color: 2, ends: [[1, 3], [3, 5]] },
];

const SIZE = 6;
const center = (cell: number) => cell * 10 + 5;
const pathOf = (cells: Cell[]) =>
  cells.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${center(x)} ${center(y)}`).join('');

function Dot({ color, cell, className, r = 3.6 }: { color: number; cell: Cell; className?: string; r?: number }) {
  const [x, y] = cell;
  return (
    <g className={className}>
      <circle cx={center(x)} cy={center(y)} r={r} fill={colorOf(color).fill} />
      <circle cx={center(x)} cy={center(y)} r={r} fill="url(#hero-trail-dot-shine)" />
      <DotSymbol color={color} x={center(x)} y={center(y)} />
    </g>
  );
}

export default function ColorTrailsHeroArt() {
  const start = HERO_CELLS[0];
  const end = HERO_CELLS[HERO_CELLS.length - 1];
  const heroFill = colorOf(HERO_COLOR).fill;
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
        {/* the cells the trail claims light up once the pair is connected */}
        <g className="hero__trails-wash">
          {HERO_CELLS.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x * 10 + 0.6} y={y * 10 + 0.6} width={8.8} height={8.8} rx={1.6} fill={heroFill} />
          ))}
        </g>
        {/* dim pairs still waiting to be joined: context, not the focus */}
        <g className="hero__trails-waiting">
          {WAITING_PAIRS.map((pair) => pair.ends.map((cell, endIndex) => (
            <Dot key={`${pair.color}-${endIndex}`} color={pair.color} cell={cell} r={3} />
          )))}
        </g>
        {/* the trail being drawn from dot to dot */}
        <path className="hero__trails-path" d={pathOf(HERO_CELLS)} pathLength={100} filter="url(#hero-trail-glow)"
          fill="none" stroke={heroFill} strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
        {/* the matching pair */}
        <Dot color={HERO_COLOR} cell={start} className="hero__trails-dot hero__trails-dot--start" r={4} />
        <circle className="hero__trails-ring" cx={center(end[0])} cy={center(end[1])} r={4} fill="none" stroke={heroFill} strokeWidth={0.9} />
        <Dot color={HERO_COLOR} cell={end} className="hero__trails-dot hero__trails-dot--target" r={4} />
        {/* the fingertip dragging the trail (moves by CSS transform from the start dot) */}
        <circle className="hero__trails-cursor" cx={center(start[0])} cy={center(start[1])} r={5} />
      </svg>
      {/* floating dots around the board for depth */}
      {[0, 1, 2, 3, 4, 6].map((color, index) => (
        <span key={color} className={`hero__trails-orb hero__trails-orb--${index}`} style={{ background: colorOf(color).fill, color: colorOf(color).fill }} />
      ))}
    </div>
  );
}
