/**
 * Placing the fleet: drag ships from the dock onto the sea (or tap a ship, then a cell), tap a placed ship to turn
 * it, drag it to move it, or let the computer scatter them (Random). R turns the selected ship.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CELLS, codeOf, type FleetCode, Mark, occupancy, type Placement, placementsOf, randomFleet, SHIPS, SIZE } from './engine';
import { placementCells, Sea, ShipShape, type SeaShip } from './Sea';

const NO_MARKS = new Array<Mark>(CELLS).fill(Mark.Unknown);

interface Drag { ship: number; vertical: boolean; grab: number; from: Placement | null; startX: number; startY: number; moved: boolean; cell: number | null; }

export function PlacementBoard({ title, playerColor, initial, readyLabel, onReady, onSound, testPrefix = 'fleet' }: {
  title: string;
  playerColor: string;
  initial?: FleetCode | null;
  readyLabel: string;
  onReady(code: FleetCode): void;
  onSound?(kind: 'place' | 'rotate' | 'error'): void;
  testPrefix?: string;
}) {
  const [placed, setPlaced] = useState<Placement[]>(() => (initial ? placementsOf(initial) : []));
  const [selected, setSelected] = useState<number | null>(0);
  const [vertical, setVertical] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const fits = useCallback((placement: Placement, list: Placement[]) => {
    const cells = placementCells(placement);
    if (!cells) return false;
    const taken = occupancy(codeOf(list.filter(item => item.ship !== placement.ship)));
    return cells.every(cell => taken[cell] < 0);
  }, []);

  const place = useCallback((placement: Placement) => {
    if (!fits(placement, placed)) { onSound?.('error'); return false; }
    const next = [...placed.filter(item => item.ship !== placement.ship), placement];
    setPlaced(next);
    onSound?.('place');
    const remaining = SHIPS.map((_, ship) => ship).filter(ship => !next.some(item => item.ship === ship));
    setSelected(remaining[0] ?? null);
    return true;
  }, [fits, onSound, placed]);

  /** Where a ship would start if its grabbed segment were over `cell` (kept on the sea where possible). */
  const startFor = (cell: number, ship: number, isVertical: boolean, grab: number) => {
    const length = SHIPS[ship].length;
    let row = Math.floor(cell / SIZE), column = cell % SIZE;
    if (isVertical) row = Math.max(0, Math.min(SIZE - length, row - grab)); else column = Math.max(0, Math.min(SIZE - length, column - grab));
    return row * SIZE + column;
  };

  const cellAt = (x: number, y: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || x < rect.left || y < rect.top || x >= rect.right || y >= rect.bottom) return null;
    return Math.floor(((y - rect.top) / rect.height) * SIZE) * SIZE + Math.floor(((x - rect.left) / rect.width) * SIZE);
  };

  // dragging follows the pointer anywhere on the page
  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const moved = current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 6;
      setDrag({ ...current, moved, cell: cellAt(event.clientX, event.clientY) });
    };
    const up = (event: PointerEvent) => {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;
      const cell = cellAt(event.clientX, event.clientY);
      if (!current.moved && current.from) {
        // a tap on a placed ship turns it (if it fits), else selects it
        const turned = { ...current.from, vertical: !current.from.vertical };
        if (fits(turned, placed)) { setPlaced(list => [...list.filter(item => item.ship !== turned.ship), turned]); onSound?.('rotate'); }
        else onSound?.('error');
        setSelected(current.ship);
        setVertical(turned.vertical);
        return;
      }
      if (!current.moved) { setSelected(current.ship); return; }
      if (cell === null) return;
      place({ ship: current.ship, start: startFor(cell, current.ship, current.vertical, current.grab), vertical: current.vertical });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const owner = occupancy(codeOf(placed));
  const startDragFromCell = (cell: number, event: ReactPointerEvent) => {
    const ship = owner[cell];
    if (ship < 0) return;
    const from = placed.find(item => item.ship === ship)!;
    const grab = from.vertical ? Math.floor(cell / SIZE) - Math.floor(from.start / SIZE) : (cell % SIZE) - (from.start % SIZE);
    event.preventDefault();
    setDrag({ ship, vertical: from.vertical, grab, from, startX: event.clientX, startY: event.clientY, moved: false, cell });
  };
  const startDragFromDock = (ship: number, event: ReactPointerEvent) => {
    event.preventDefault();
    setSelected(ship);
    setDrag({ ship, vertical, grab: 0, from: null, startX: event.clientX, startY: event.clientY, moved: false, cell: null });
  };

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'r' && !(event.target instanceof HTMLInputElement)) { setVertical(value => !value); onSound?.('rotate'); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [onSound]);

  // preview of the ship being dragged (or the selected one under the mouse)
  let preview: { placement: Placement; isValid: boolean } | null = null;
  if (drag?.moved && drag.cell !== null) {
    const placement = { ship: drag.ship, start: startFor(drag.cell, drag.ship, drag.vertical, drag.grab), vertical: drag.vertical };
    preview = { placement, isValid: fits(placement, placed) };
  } else if (!drag && hover !== null && selected !== null && !placed.some(item => item.ship === selected)) {
    const placement = { ship: selected, start: startFor(hover, selected, vertical, 0), vertical };
    preview = { placement, isValid: fits(placement, placed) };
  }
  const ships: SeaShip[] = placed.filter(item => !(drag?.moved && drag.ship === item.ship)).map(item => ({ ...item, state: 'afloat' as const }));
  if (preview) ships.push({ ...preview.placement, state: preview.isValid ? 'ghost' : 'bad' });
  const isComplete = placed.length === SHIPS.length;

  return (
    <div className="fleet-place" data-testid={`${testPrefix}-placement`} style={{ ['--fleet' as string]: playerColor }} onPointerLeave={() => setHover(null)}>
      <h2 className="fleet-place__title">{title}</h2>
      <div className="fleet-place__body">
        <div onPointerMove={event => { if (!drag) setHover(cellAt(event.clientX, event.clientY)); }}>
          <Sea marks={NO_MARKS} ships={ships} testId={`${testPrefix}-place-sea`} label="Your sea" gridRef={gridRef}
            hotCells={preview ? { cells: placementCells(preview.placement) ?? [], isValid: preview.isValid } : null}
            onCell={cell => { if (owner[cell] < 0 && selected !== null && !drag) place({ ship: selected, start: startFor(cell, selected, vertical, 0), vertical }); }}
            onCellPointerDown={(cell, event) => { if (owner[cell] >= 0) startDragFromCell(cell, event); }} />
        </div>
        <div className="fleet-dock">
          <p className="fleet-dock__hint">Drag ships onto the sea, or tap a ship and then a square. Tap a placed ship to turn it; drag it to move it.</p>
          <ul className="fleet-dock__ships">
            {SHIPS.map((ship, index) => {
              const isPlaced = placed.some(item => item.ship === index);
              return (
                <li key={ship.name}>
                  <button type="button" className={`fleet-dock__ship${selected === index ? ' is-selected' : ''}${isPlaced ? ' is-placed' : ''}`} data-testid={`${testPrefix}-dock-${index}`}
                    onPointerDown={event => { if (!isPlaced) startDragFromDock(index, event); }} onClick={() => setSelected(index)} style={{ ['--length' as string]: ship.length }}>
                    <span className="fleet-dock__shape"><ShipShape ship={index} vertical={false} /></span>
                    <span>{ship.name} <small>({ship.length})</small>{isPlaced ? ' ✓' : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="fleet-dock__buttons">
            <button type="button" className="online-button" onClick={() => { setVertical(value => !value); onSound?.('rotate'); }} data-testid={`${testPrefix}-rotate`}>⟳ Turn ({vertical ? 'down' : 'across'})</button>
            <button type="button" className="online-button" onClick={() => { setPlaced(placementsOf(randomFleet())); setSelected(null); onSound?.('place'); }} data-testid={`${testPrefix}-random`}>🎲 Random</button>
            <button type="button" className="online-button" onClick={() => { setPlaced([]); setSelected(0); }} data-testid={`${testPrefix}-clear`}>Clear</button>
          </div>
          <button type="button" className="online-button online-button--primary fleet-dock__ready" disabled={!isComplete} onClick={() => onReady(codeOf(placed))} data-testid={`${testPrefix}-ready`}>
            {isComplete ? readyLabel : `Place ${SHIPS.length - placed.length} more ship${SHIPS.length - placed.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
