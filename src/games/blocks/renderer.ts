/**
 * Canvas drawing for Blocks. The grid background and one sprite per cell colour (plus ghost
 * sprites) are drawn once per size and cached; a frame is then ~200 drawImage calls at most,
 * and frames are only drawn when the state changes or while a line-clear animation runs.
 */
import { BlocksState, CellType, ghostPiece, PIECE_ROTATIONS, pieceCells, PieceType } from './game';

export const PIECE_COLORS: Record<CellType, string> = {
  I: '#2ec4f1',
  O: '#f7d038',
  T: '#a651e8',
  S: '#4cd964',
  Z: '#ff4d5e',
  J: '#3d6cf0',
  L: '#ff9f1a',
  garbage: '#5b5f6b',
};

const BACKGROUND_COLOR = '#121218';
const GRID_LINE_COLOR = '#1f1f2a';
const CELL_TYPES = Object.keys(PIECE_COLORS) as CellType[];

function createLayer(width: number, height: number) {
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, width);
  layer.height = Math.max(1, height);
  return layer;
}

/** A solid block with a light top/left edge and a dark bottom/right edge. */
function drawBlockSprite(size: number, color: string) {
  const sprite = createLayer(size, size);
  const context = sprite.getContext('2d')!;
  const bevel = Math.max(1, Math.round(size * 0.12));
  const gap = Math.max(1, Math.round(size * 0.04));
  context.fillStyle = color;
  context.fillRect(gap, gap, size - gap * 2, size - gap * 2);
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(gap, gap, size - gap * 2, bevel);
  context.fillRect(gap, gap, bevel, size - gap * 2);
  context.fillStyle = 'rgba(0,0,0,0.28)';
  context.fillRect(gap, size - gap - bevel, size - gap * 2, bevel);
  context.fillRect(size - gap - bevel, gap, bevel, size - gap * 2);
  return sprite;
}

function drawGhostSprite(size: number, color: string) {
  const sprite = createLayer(size, size);
  const context = sprite.getContext('2d')!;
  const lineWidth = Math.max(1, Math.round(size * 0.08));
  context.fillStyle = color + '22';
  context.fillRect(lineWidth, lineWidth, size - lineWidth * 2, size - lineWidth * 2);
  context.strokeStyle = color + 'aa';
  context.lineWidth = lineWidth;
  context.strokeRect(lineWidth * 1.5, lineWidth * 1.5, size - lineWidth * 3, size - lineWidth * 3);
  return sprite;
}

export class BlocksRenderer {
  private readonly context: CanvasRenderingContext2D;
  private background: HTMLCanvasElement | null = null;
  private blockSprites = new Map<CellType, HTMLCanvasElement>();
  private ghostSprites = new Map<CellType, HTMLCanvasElement>();
  private cellPixels = 0;
  private columns = 0;
  private rows = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d', { alpha: false })!;
  }

  /** Rebuild the cached layers when the cell size changes. Returns true if anything changed. */
  resize(cellPixels: number, columns: number, rows: number): boolean {
    if (cellPixels === this.cellPixels && columns === this.columns && rows === this.rows) return false;
    this.cellPixels = cellPixels;
    this.columns = columns;
    this.rows = rows;
    this.canvas.width = columns * cellPixels;
    this.canvas.height = rows * cellPixels;
    this.background = createLayer(this.canvas.width, this.canvas.height);
    const backgroundContext = this.background.getContext('2d', { alpha: false })!;
    backgroundContext.fillStyle = BACKGROUND_COLOR;
    backgroundContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
    backgroundContext.fillStyle = GRID_LINE_COLOR;
    for (let column = 1; column < columns; column++) backgroundContext.fillRect(column * cellPixels, 0, 1, this.canvas.height);
    for (let row = 1; row < rows; row++) backgroundContext.fillRect(0, row * cellPixels, this.canvas.width, 1);
    this.blockSprites = new Map(CELL_TYPES.map(type => [type, drawBlockSprite(cellPixels, PIECE_COLORS[type])]));
    this.ghostSprites = new Map(CELL_TYPES.map(type => [type, drawGhostSprite(cellPixels, PIECE_COLORS[type])]));
    return true;
  }

  get isReady() { return this.cellPixels > 0; }

  /**
   * Draw a whole frame. `clearProgress` (0..1) animates the rows in state.clearingRows:
   * a white flash, then the row shrinks and fades out.
   */
  draw(state: BlocksState, clearProgress = 0) {
    if (!this.background) return;
    const context = this.context;
    const size = this.cellPixels;
    context.drawImage(this.background, 0, 0);
    const clearingRows = new Set(state.clearingRows);

    state.board.forEach((row, rowIndex) => {
      if (clearingRows.has(rowIndex)) return;
      row.forEach((cell, columnIndex) => {
        if (cell) context.drawImage(this.blockSprites.get(cell)!, columnIndex * size, rowIndex * size);
      });
    });

    if (clearingRows.size > 0) this.drawClearingRows(state, clearProgress);

    const ghost = ghostPiece(state);
    if (ghost && state.active && ghost.y !== state.active.y) {
      const ghostSprite = this.ghostSprites.get(ghost.type)!;
      for (const cell of pieceCells(ghost)) if (cell.y >= 0) context.drawImage(ghostSprite, cell.x * size, cell.y * size);
    }
    if (state.active) {
      const sprite = this.blockSprites.get(state.active.type)!;
      for (const cell of pieceCells(state.active)) if (cell.y >= 0) context.drawImage(sprite, cell.x * size, cell.y * size);
    }
  }

  private drawClearingRows(state: BlocksState, progress: number) {
    const context = this.context;
    const size = this.cellPixels;
    const flashPart = 0.35;
    for (const rowIndex of state.clearingRows) {
      const top = rowIndex * size;
      if (progress < flashPart) {
        state.board[rowIndex].forEach((cell, columnIndex) => {
          if (cell) context.drawImage(this.blockSprites.get(cell)!, columnIndex * size, top);
        });
        context.fillStyle = `rgba(255,255,255,${0.9 - (progress / flashPart) * 0.2})`;
        context.fillRect(0, top, this.canvas.width, size);
      } else {
        const shrink = (progress - flashPart) / (1 - flashPart);
        const height = Math.max(0, size * (1 - shrink));
        context.globalAlpha = 1 - shrink;
        context.fillStyle = '#ffffff';
        context.fillRect(this.canvas.width * shrink * 0.5, top + (size - height) / 2, this.canvas.width * (1 - shrink), height);
        context.globalAlpha = 1;
      }
    }
  }
}

/** Draw upcoming/held pieces into a small canvas, one per slot (4×2 cells each), centred. */
export function drawPiecePreview(canvas: HTMLCanvasElement, pieces: (PieceType | null)[], dimmed = false) {
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const slotHeight = canvas.height / pieces.length;
  const cellSize = Math.floor(Math.min(canvas.width / 4.6, slotHeight / 2.6));
  pieces.forEach((type, slotIndex) => {
    if (!type) return;
    const cells = PIECE_ROTATIONS[type][0];
    const minX = Math.min(...cells.map(cell => cell.x));
    const maxX = Math.max(...cells.map(cell => cell.x));
    const minY = Math.min(...cells.map(cell => cell.y));
    const maxY = Math.max(...cells.map(cell => cell.y));
    const offsetX = (canvas.width - (maxX - minX + 1) * cellSize) / 2 - minX * cellSize;
    const offsetY = slotIndex * slotHeight + (slotHeight - (maxY - minY + 1) * cellSize) / 2 - minY * cellSize;
    const sprite = drawBlockSprite(cellSize, PIECE_COLORS[type]);
    context.globalAlpha = dimmed ? 0.4 : 1;
    for (const cell of cells) context.drawImage(sprite, Math.round(offsetX + cell.x * cellSize), Math.round(offsetY + cell.y * cellSize));
    context.globalAlpha = 1;
  });
}
