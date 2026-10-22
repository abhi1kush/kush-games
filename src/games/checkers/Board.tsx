import { useLayoutEffect, useMemo, useRef } from 'react';
import { CheckersMove, squareColumn, squareRow } from './engine';

/**
 * The 8×8 board. Squares are numbered 0–31 with row 0 at the top (light's home row); `isFlipped` turns the board
 * so light is at the bottom (the online guest playing light sees their pieces nearest to them).
 */
export default function CheckersBoard({ cells, moves, selected, lastMove, isLocked, isFlipped, mustCapture, plies, onSquare }: {
  cells: Uint8Array;
  /** Legal moves of the side to move (empty when it's not your turn). */
  moves: CheckersMove[];
  selected: number | null;
  lastMove: CheckersMove | null;
  isLocked: boolean;
  isFlipped: boolean;
  mustCapture: boolean;
  /** Number of moves played; restarts the capture fade for each move. */
  plies: number;
  onSquare(square: number): void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const movablePieces = useMemo(() => new Set(moves.map(move => move.from)), [moves]);
  const targets = useMemo(() => new Set(moves.filter(move => move.from === selected).map(move => move.to)), [moves, selected]);

  // Slide the moved piece along its path (and fade captured pieces) with Web Animations: no React work per frame.
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!lastMove || !board) return;
    const piece = board.querySelector<HTMLElement>(`[data-square="${lastMove.to}"] .checkers-piece`);
    const cellSize = (isFlipped ? -1 : 1) * board.clientWidth / 8;
    const end = { x: squareColumn(lastMove.to), y: squareRow(lastMove.to) };
    const points = [lastMove.from, ...lastMove.path].map(square => ({ x: (squareColumn(square) - end.x) * cellSize, y: (squareRow(square) - end.y) * cellSize }));
    const animation = piece?.animate(points.map(point => ({ transform: `translate(${point.x}px, ${point.y}px)` })), { duration: 160 * lastMove.path.length + 60, easing: 'ease-in-out' });
    return () => animation?.cancel();
  }, [lastMove, isFlipped]);

  return (
    <div className={`checkers-board${isLocked ? ' is-waiting' : ''}`} ref={boardRef} data-testid="checkers-board" data-flipped={isFlipped}>
      {Array.from({ length: 64 }, (_, displayIndex) => {
        const cellIndex = isFlipped ? 63 - displayIndex : displayIndex;
        const row = Math.floor(cellIndex / 8), column = cellIndex % 8;
        if ((row + column) % 2 === 0) return <div key={cellIndex} className="checkers-cell is-light" />;
        const square = row * 4 + Math.floor(column / 2);
        const owner = cells[square];
        const isMovable = !isLocked && movablePieces.has(square);
        const wasJumped = lastMove?.captured.includes(square);
        return (
          <button type="button" key={cellIndex} className={`checkers-cell${selected === square ? ' is-selected' : ''}${targets.has(square) ? ' is-target' : ''}${lastMove && (lastMove.from === square || lastMove.to === square) ? ' is-last' : ''}`}
            data-square={square} data-testid="checkers-square" onClick={() => onSquare(square)} aria-label={`Square ${square + 1}`}>
            {owner !== 0 && (
              <i className={`checkers-piece ${owner <= 2 ? 'is-dark' : 'is-light'}${owner % 2 === 0 ? ' is-king' : ''}${isMovable ? ' is-movable' : ''}${isMovable && mustCapture ? ' must-capture' : ''}`}
                data-piece={owner} />
            )}
            {wasJumped && owner === 0 && <i key={plies} className="checkers-piece is-captured" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
