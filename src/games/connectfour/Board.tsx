import { useState } from 'react';
import { COLUMNS, ROWS } from './engine';
import type { DiscColor } from './save';

/** The 7×6 grid of columns (buttons). Used by local and online play. */
export default function ConnectFourBoard({ cells, winningCells, lastDropCell, colorOfOwner, isLocked, onColumn }: {
  /** 42 cells, index = column * 6 + row (row 0 = bottom): 0 empty, 1 first player, 2 second player. */
  cells: Uint8Array;
  winningCells: Set<number>;
  lastDropCell: number | null;
  colorOfOwner(owner: 1 | 2): DiscColor;
  /** Not your turn / game over: no hover highlight. */
  isLocked: boolean;
  onColumn(column: number): void;
}) {
  const [hoverColumn, setHoverColumn] = useState<number | null>(null);
  return (
    <div className={`c4-board${isLocked ? ' is-locked' : ''}`} data-testid="c4-board" onPointerLeave={() => setHoverColumn(null)}>
      {Array.from({ length: COLUMNS }, (_, column) => (
        <button type="button" key={column} className={`c4-column${hoverColumn === column && !isLocked ? ' is-hovered' : ''}`}
          onClick={() => onColumn(column)} onPointerEnter={() => setHoverColumn(column)} aria-label={`Drop in column ${column + 1}`}
          data-testid={`c4-column-${column}`} disabled={cells[column * ROWS + ROWS - 1] !== 0}>
          {Array.from({ length: ROWS }, (_, rowFromTop) => {
            const row = ROWS - 1 - rowFromTop;
            const cell = column * ROWS + row;
            const owner = cells[cell];
            const color = owner === 0 ? null : colorOfOwner(owner as 1 | 2);
            const isNew = lastDropCell === cell;
            return (
              <span key={row} className="c4-cell">
                {color && <i className={`c4-disc c4-disc--${color}${winningCells.has(cell) ? ' is-winning' : ''}${isNew ? ' is-dropping' : ''}`}
                  style={isNew ? { ['--drop-rows' as string]: ROWS - row } : undefined} data-testid="c4-disc" data-color={color} />}
              </span>
            );
          })}
        </button>
      ))}
    </div>
  );
}
