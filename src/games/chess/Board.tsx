import { memo, useCallback } from 'react';
import type { Color } from './match';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

/** Filled glyphs for both sides (coloured with CSS); U+FE0E asks for text, not emoji. */
const PIECE_GLYPHS: Record<string, string> = { k: '♚\uFE0E', q: '♛\uFE0E', r: '♜\uFE0E', b: '♝\uFE0E', n: '♞\uFE0E', p: '♟\uFE0E' };
const PIECE_NAMES: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

export type TargetKind = 'move' | 'capture';

interface SquareProps {
  square: string;
  /** e.g. "wn" for a white knight, '' for empty. */
  piece: string;
  isLight: boolean;
  isSelected: boolean;
  target: TargetKind | null;
  isLastMove: boolean;
  isCheck: boolean;
  rankLabel: string | null;
  fileLabel: string | null;
}

const BoardSquare = memo(function BoardSquare(props: SquareProps) {
  const { square, piece, isLight, isSelected, target, isLastMove, isCheck, rankLabel, fileLabel } = props;
  const classNames = ['chess-square', isLight ? 'is-light' : 'is-dark'];
  if (isSelected) classNames.push('is-selected');
  if (isLastMove) classNames.push('is-last-move');
  if (isCheck) classNames.push('is-check');
  if (target) classNames.push(`is-target-${target}`);
  const label = piece ? `${square}, ${piece[0] === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece[1]]}` : square;
  return (
    <button type="button" className={classNames.join(' ')} data-square={square} data-piece={piece} aria-label={label}>
      {piece && <span className={`chess-piece chess-piece--${piece[0]}`} aria-hidden="true">{PIECE_GLYPHS[piece[1]]}</span>}
      {rankLabel && <span className="chess-coordinate chess-coordinate--rank" aria-hidden="true">{rankLabel}</span>}
      {fileLabel && <span className="chess-coordinate chess-coordinate--file" aria-hidden="true">{fileLabel}</span>}
    </button>
  );
});

export interface BoardProps {
  /** 8 rows from rank 8 to rank 1, each 8 cells from a to h: "wp", "bk", ... or ''. */
  position: string[][];
  orientation: Color;
  selected: string | null;
  targets: ReadonlyMap<string, TargetKind>;
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  onSquareClick: (square: string) => void;
}

/** 64 memoised squares: a change re-renders only the squares whose look changed. */
export default function Board({ position, orientation, selected, targets, lastMove, checkSquare, onSquareClick }: BoardProps) {
  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const square = (event.target as HTMLElement).closest<HTMLElement>('[data-square]')?.dataset.square;
    if (square) onSquareClick(square);
  }, [onSquareClick]);

  const isWhiteBottom = orientation === 'w';
  const squares = [];
  for (let displayRow = 0; displayRow < 8; displayRow++) {
    const row = isWhiteBottom ? displayRow : 7 - displayRow;
    const rank = 8 - row;
    for (let displayColumn = 0; displayColumn < 8; displayColumn++) {
      const fileIndex = isWhiteBottom ? displayColumn : 7 - displayColumn;
      const square = `${FILES[fileIndex]}${rank}`;
      squares.push(
        <BoardSquare key={square} square={square} piece={position[row][fileIndex]} isLight={(row + fileIndex) % 2 === 0}
          isSelected={selected === square} target={targets.get(square) ?? null}
          isLastMove={lastMove !== null && (lastMove.from === square || lastMove.to === square)} isCheck={checkSquare === square}
          rankLabel={displayColumn === 0 ? String(rank) : null} fileLabel={displayRow === 7 ? FILES[fileIndex] : null} />,
      );
    }
  }
  return (
    <div className={`chess-board${orientation === 'b' ? ' is-flipped' : ''}`} onClick={handleClick} data-testid="chess-squares" role="grid" aria-label="Chess board">
      {squares}
    </div>
  );
}
