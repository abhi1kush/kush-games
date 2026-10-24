/** The 10 × 10 sea (your fleet or the enemy's waters): coordinates, ships, splashes, hits and sunk wrecks. */
import { memo, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cellName, CELLS, columnLetter, Mark, type Placement, shipCells, SHIPS, SIZE } from './engine';

/** A ship's hull, deck and guns as an SVG path in a length × 1 box (drawn left to right, bow on the right). */
function hullPaths(length: number) {
  const end = length - 0.06;
  const hull = `M0.1 0.5Q0.1 0.18 0.42 0.17L${end - 0.55} 0.15Q${end - 0.1} 0.22 ${end} 0.5Q${end - 0.1} 0.78 ${end - 0.55} 0.85L0.42 0.83Q0.1 0.82 0.1 0.5Z`;
  return { hull };
}

export const ShipShape = memo(function ShipShape({ ship, vertical, state = 'afloat' }: { ship: number; vertical: boolean; state?: 'afloat' | 'sunk' | 'ghost' | 'bad' }) {
  const length = SHIPS[ship].length;
  const { hull } = hullPaths(length);
  const details: ReactNode[] = [];
  if (ship === 0) {
    // carrier: flat deck with a runway and an island
    details.push(<path key="deck" d={`M0.45 0.32H${length - 0.7}M0.45 0.68H${length - 0.7}`} stroke="rgba(255,255,255,0.55)" strokeWidth="0.04" strokeDasharray="0.18 0.12" />);
    details.push(<rect key="island" x={length * 0.55} y="0.14" width="0.55" height="0.2" rx="0.05" fill="#5d6d7e" />);
  } else if (ship === 3) {
    // submarine: conning tower
    details.push(<rect key="tower" x={length * 0.38} y="0.34" width="0.7" height="0.32" rx="0.16" fill="#2c3e50" />);
  } else {
    details.push(<rect key="bridge" x={length * 0.35} y="0.3" width={Math.max(0.5, length * 0.22)} height="0.4" rx="0.06" fill="#d5dde4" />);
    for (let gun = 0; gun < Math.max(1, length - 2); gun++) {
      const x = gun === 0 ? length - 0.75 : 0.55 + (gun - 1) * 0.7;
      details.push(<g key={`gun${gun}`}><circle cx={x} cy="0.5" r="0.13" fill="#4a5a68" /><path d={`M${x} 0.5H${x + (gun === 0 ? 0.32 : -0.32)}`} stroke="#4a5a68" strokeWidth="0.06" /></g>);
    }
  }
  const width = vertical ? 1 : length, height = vertical ? length : 1;
  return (
    <svg className={`fleet-ship fleet-ship--${state}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" data-ship={ship}>
      <g transform={vertical ? `rotate(90) translate(0 -1)` : undefined}>
        <path d={hull} className="fleet-ship__hull" />
        <path d={`M0.3 0.5H${length - 0.3}`} stroke="rgba(255,255,255,0.15)" strokeWidth="0.03" />
        {details}
      </g>
    </svg>
  );
});

export interface SeaShip extends Placement { state: 'afloat' | 'sunk' | 'ghost' | 'bad'; }

const shipStyle = ({ start, vertical, ship }: Placement) => {
  const length = SHIPS[ship].length;
  return {
    left: `${((start % SIZE) / SIZE) * 100}%`, top: `${(Math.floor(start / SIZE) / SIZE) * 100}%`,
    width: `${((vertical ? 1 : length) / SIZE) * 100}%`, height: `${((vertical ? length : 1) / SIZE) * 100}%`,
  };
};

export function Sea({ marks, ships, lastShot, onCell, onCellPointerDown, onShipPointerDown, canFire, testId, label, size = 'large', gridRef, hotCells, aim }: {
  marks: readonly Mark[];
  ships: readonly SeaShip[];
  lastShot?: number | null;
  /** Firing or placing: a cell was chosen. */
  onCell?(cell: number): void;
  onCellPointerDown?(cell: number, event: ReactPointerEvent): void;
  onShipPointerDown?(ship: number, event: ReactPointerEvent): void;
  canFire?: boolean;
  testId: string;
  label: string;
  size?: 'large' | 'small';
  gridRef?: React.Ref<HTMLDivElement>;
  /** Cells to highlight (placement preview). */
  hotCells?: { cells: number[]; isValid: boolean } | null;
  aim?: number | null;
}) {
  const keys = (event: KeyboardEvent<HTMLButtonElement>, cell: number) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SIZE, ArrowDown: SIZE };
    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = cell + delta;
    if (next < 0 || next >= CELLS || (Math.abs(delta) === 1 && Math.floor(next / SIZE) !== Math.floor(cell / SIZE))) return;
    (event.currentTarget.parentElement?.querySelector(`[data-cell="${next}"]`) as HTMLButtonElement | null)?.focus();
  };
  const hot = new Set(hotCells?.cells ?? []);
  return (
    <div className={`fleet-sea fleet-sea--${size}${canFire ? ' can-fire' : ''}`} data-testid={testId} aria-label={label}>
      <div className="fleet-sea__letters" aria-hidden="true">{Array.from({ length: SIZE }, (_, column) => <span key={column}>{columnLetter(column)}</span>)}</div>
      <div className="fleet-sea__numbers" aria-hidden="true">{Array.from({ length: SIZE }, (_, row) => <span key={row}>{row + 1}</span>)}</div>
      <div className="fleet-sea__grid" ref={gridRef} role="grid">
        {ships.map(ship => (
          <div key={`${ship.ship}-${ship.state}`} className={`fleet-sea__ship is-${ship.state}`} style={shipStyle(ship)} data-testid={`${testId}-ship-${ship.ship}`} data-state={ship.state}
            onPointerDown={onShipPointerDown ? event => onShipPointerDown(ship.ship, event) : undefined}>
            <ShipShape ship={ship.ship} vertical={ship.vertical} state={ship.state} />
            {ship.state === 'sunk' && <span className="fleet-sea__smoke" aria-hidden="true" />}
          </div>
        ))}
        {Array.from({ length: CELLS }, (_, cell) => {
          const mark = marks[cell];
          const isHot = hot.has(cell);
          return (
            <button key={cell} type="button" className={`fleet-cell is-mark-${mark}${cell === lastShot ? ' is-last' : ''}${isHot ? (hotCells?.isValid ? ' is-hot' : ' is-bad') : ''}${aim === cell ? ' is-aim' : ''}`}
              data-cell={cell} data-mark={mark} data-testid={`${testId}-cell-${cell}`} aria-label={`${cellName(cell)}${mark === Mark.Miss ? ', miss' : mark === Mark.Hit ? ', hit' : mark === Mark.Sunk ? ', sunk' : ''}`}
              tabIndex={canFire || onCell ? 0 : -1} disabled={!onCell && !onCellPointerDown}
              onClick={onCell ? () => onCell(cell) : undefined} onPointerDown={onCellPointerDown ? event => onCellPointerDown(cell, event) : undefined}
              onKeyDown={event => keys(event, cell)}>
              {mark === Mark.Miss && <i className="fleet-cell__splash" />}
              {(mark === Mark.Hit || mark === Mark.Sunk) && <i className="fleet-cell__fire" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The five ships of a fleet, crossed out when sunk. */
export function FleetStatus({ title, sunkMask, testId, color }: { title: string; sunkMask: number; testId: string; color: string }) {
  const afloat = SHIPS.filter((_, ship) => !(sunkMask & (1 << ship))).length;
  return (
    <div className="fleet-status" data-testid={testId} data-afloat={afloat} style={{ ['--fleet' as string]: color }}>
      <h3>{title} <b>{afloat}/5 afloat</b></h3>
      <ul>
        {SHIPS.map((ship, index) => {
          const sunk = (sunkMask & (1 << index)) !== 0;
          return (
            <li key={ship.name} className={sunk ? 'is-sunk' : ''} data-testid={`${testId}-${index}`} data-sunk={sunk}>
              <span className="fleet-status__pips">{Array.from({ length: ship.length }, (_, pip) => <i key={pip} />)}</span>
              <span>{ship.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Cells of a placement (for previews), or null if it leaves the sea. */
export const placementCells = (placement: Placement) => shipCells(placement.start, placement.vertical, SHIPS[placement.ship].length);
