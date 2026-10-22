/**
 * Colors chosen to stay apart for common color-vision differences (blue/orange/yellow first, red and green
 * separated by brightness), and each color also has its own small symbol on its dots.
 */
export const TRAIL_COLORS = [
  { name: 'red', fill: '#e8384f' }, { name: 'blue', fill: '#3d7dff' }, { name: 'yellow', fill: '#f6c90e' }, { name: 'green', fill: '#1fae6a' },
  { name: 'orange', fill: '#ff8a1f' }, { name: 'purple', fill: '#9b5cff' }, { name: 'cyan', fill: '#22c7e8' }, { name: 'pink', fill: '#ff6fb5' },
  { name: 'brown', fill: '#b07a4a' }, { name: 'lime', fill: '#a8e61d' }, { name: 'white', fill: '#e9eef5' }, { name: 'teal', fill: '#12a39a' },
  { name: 'gray', fill: '#8d99ae' }, { name: 'maroon', fill: '#a3243b' },
] as const;

export const colorOf = (color: number) => TRAIL_COLORS[color % TRAIL_COLORS.length];

/** A tiny dark symbol drawn inside a dot (unit: one cell = 10). */
export function DotSymbol({ color, x, y }: { color: number; x: number; y: number }) {
  const ink = { fill: 'rgba(10,14,30,0.72)', stroke: 'rgba(10,14,30,0.72)' };
  const shapes = [
    <circle cx={x} cy={y} r={1.05} fill={ink.fill} />,
    <rect x={x - 1.1} y={y - 1.1} width={2.2} height={2.2} fill={ink.fill} />,
    <path d={`M${x} ${y - 1.4}L${x + 1.3} ${y + 1}H${x - 1.3}Z`} fill={ink.fill} />,
    <path d={`M${x} ${y - 1.5}L${x + 1.5} ${y}L${x} ${y + 1.5}L${x - 1.5} ${y}Z`} fill={ink.fill} />,
    <path d={`M${x - 1.4} ${y}H${x + 1.4}M${x} ${y - 1.4}V${y + 1.4}`} stroke={ink.stroke} strokeWidth={0.8} />,
    <circle cx={x} cy={y} r={1.1} fill="none" stroke={ink.stroke} strokeWidth={0.65} />,
    <path d={`M${x - 1.1} ${y - 1.1}L${x + 1.1} ${y + 1.1}M${x + 1.1} ${y - 1.1}L${x - 1.1} ${y + 1.1}`} stroke={ink.stroke} strokeWidth={0.75} />,
    <g fill={ink.fill}><circle cx={x - 0.85} cy={y} r={0.6} /><circle cx={x + 0.85} cy={y} r={0.6} /></g>,
    <rect x={x - 1.4} y={y - 0.45} width={2.8} height={0.9} fill={ink.fill} />,
    <rect x={x - 0.45} y={y - 1.4} width={0.9} height={2.8} fill={ink.fill} />,
    <path d={`M${x - 1.3} ${y + 0.7}L${x} ${y - 0.7}L${x + 1.3} ${y + 0.7}`} fill="none" stroke={ink.stroke} strokeWidth={0.75} />,
    <path d={`M${x} ${y + 1.4}L${x + 1.3} ${y - 1}H${x - 1.3}Z`} fill={ink.fill} />,
    <rect x={x - 1} y={y - 1} width={2} height={2} fill="none" stroke={ink.stroke} strokeWidth={0.6} />,
    <path d={`M${x - 1.4} ${y - 0.8}H${x + 1.4}M${x - 1.4} ${y + 0.8}H${x + 1.4}`} stroke={ink.stroke} strokeWidth={0.6} />,
  ];
  return shapes[color % shapes.length];
}
