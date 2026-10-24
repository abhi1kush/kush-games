/** A small picture of a board for the board picker (squares, ladders and snakes, no numbers). */
import { memo } from 'react';
import { BOARD_JUMPS, BOARDS, snakeCurve, squarePoint } from './engine';

export const BoardPreview = memo(function BoardPreview({ variant }: { variant: number }) {
  const theme = BOARDS[variant] ?? BOARDS[0];
  const jumps = BOARD_JUMPS[variant] ?? BOARD_JUMPS[0];
  const squares = [];
  for (let row = 0; row < 10; row++) for (let column = (row % 2); column < 10; column += 2) squares.push(<rect key={`${row}-${column}`} x={column} y={row} width="1" height="1" />);
  const snakes = jumps.filter(([from, to]) => to < from);
  return (
    <svg viewBox="0 0 10 10" role="img" aria-label={`${theme.name} board`} data-board={variant}>
      <rect width="10" height="10" fill={theme.light} />
      <g fill={theme.dark}>{squares}</g>
      <g stroke="#8a5223" strokeWidth="0.32" strokeLinecap="round">
        {jumps.filter(([from, to]) => to > from).map(([from, to]) => { const [x1, y1] = squarePoint(from), [x2, y2] = squarePoint(to); return <line key={from} x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray="0.12 0.18" />; })}
      </g>
      <g fill="none" strokeLinecap="round">
        {snakes.map(([from, to], index) => {
          const [a, b, c, d] = snakeCurve(from, to, index);
          return <path key={from} d={`M${a[0]} ${a[1]}C${b[0]} ${b[1]} ${c[0]} ${c[1]} ${d[0]} ${d[1]}`} stroke={theme.snakes[index % theme.snakes.length][0]} strokeWidth="0.3" />;
        })}
      </g>
      <rect x="0.1" y="0.1" width="9.8" height="9.8" fill="none" stroke={theme.frame} strokeWidth="0.2" />
    </svg>
  );
});
