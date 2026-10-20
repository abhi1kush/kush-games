/**
 * Draws the Snake board on one <canvas>. The checker background and every sprite
 * (body, head per direction, apple) are pre-rendered once per size, so each tick is a
 * handful of drawImage calls on the cells that changed.
 */
import { BoardChange, cellBounds } from './boardDiff';
import type { Direction, Point, SnakeState } from './game';

export const BOARD_COLORS = {
  lightSquare: '#202020',
  darkSquare: '#1b1b1b',
  body: '#1fa84a',
  head: '#8dff9f',
  eye: '#111111',
  tongue: '#ff4d6d',
  apple: '#e3262f',
  appleShine: '#ff8a8a',
  appleStem: '#6b3e1f',
  appleLeaf: '#3fbf4a',
};

type Sprite = HTMLCanvasElement;
const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

function createLayer(width: number, height: number): Sprite {
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, width);
  layer.height = Math.max(1, height);
  return layer;
}

function roundedRectangle(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawBodySprite(size: number): Sprite {
  const sprite = createLayer(size, size);
  const context = sprite.getContext('2d')!;
  const inset = size * 0.08;
  context.fillStyle = BOARD_COLORS.body;
  roundedRectangle(context, inset, inset, size - inset * 2, size - inset * 2, size * 0.22);
  context.fill();
  return sprite;
}

/** Bright, very rounded head with eyes (and a small tongue) facing the direction of travel. */
function drawHeadSprite(size: number, direction: Direction): Sprite {
  const sprite = createLayer(size, size);
  const context = sprite.getContext('2d')!;
  // Draw facing right, then rotate for the other directions.
  context.translate(size / 2, size / 2);
  context.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[direction]);
  context.translate(-size / 2, -size / 2);
  const inset = size * 0.03;
  context.fillStyle = BOARD_COLORS.head;
  roundedRectangle(context, inset, inset, size - inset * 2 - size * 0.06, size - inset * 2, size * 0.42);
  context.fill();
  // tongue, kept inside the cell
  context.strokeStyle = BOARD_COLORS.tongue;
  context.lineWidth = Math.max(1, size * 0.07);
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(size * 0.86, size * 0.5);
  context.lineTo(size * 0.97, size * 0.5);
  context.stroke();
  // eyes near the front edge
  context.fillStyle = BOARD_COLORS.eye;
  for (const eyeY of [0.3, 0.7]) {
    context.beginPath();
    context.arc(size * 0.64, size * eyeY, size * 0.1, 0, Math.PI * 2);
    context.fill();
  }
  return sprite;
}

function drawAppleSprite(size: number): Sprite {
  const sprite = createLayer(size, size);
  const context = sprite.getContext('2d')!;
  context.scale(size, size);
  context.fillStyle = BOARD_COLORS.apple;
  context.beginPath();
  context.moveTo(0.5, 0.32);
  context.bezierCurveTo(0.36, 0.2, 0.12, 0.24, 0.12, 0.52);
  context.bezierCurveTo(0.12, 0.78, 0.32, 0.94, 0.5, 0.86);
  context.bezierCurveTo(0.68, 0.94, 0.88, 0.78, 0.88, 0.52);
  context.bezierCurveTo(0.88, 0.24, 0.64, 0.2, 0.5, 0.32);
  context.fill();
  context.fillStyle = BOARD_COLORS.appleShine;
  context.beginPath();
  context.ellipse(0.34, 0.46, 0.06, 0.11, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = BOARD_COLORS.appleStem;
  context.lineWidth = 0.06;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(0.5, 0.32);
  context.quadraticCurveTo(0.5, 0.18, 0.56, 0.1);
  context.stroke();
  context.fillStyle = BOARD_COLORS.appleLeaf;
  context.beginPath();
  context.moveTo(0.55, 0.18);
  context.quadraticCurveTo(0.72, 0.06, 0.82, 0.16);
  context.quadraticCurveTo(0.7, 0.28, 0.55, 0.18);
  context.fill();
  return sprite;
}

export class CanvasBoardRenderer {
  private readonly context: CanvasRenderingContext2D;
  private background: Sprite | null = null;
  private bodySprite: Sprite | null = null;
  private appleSprite: Sprite | null = null;
  private headSprites = new Map<Direction, Sprite>();
  private boardPixels = 0;
  private cellsAcross = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d', { alpha: false })!;
  }

  /** (Re)build the cached background and sprites for a backing-store size. */
  resize(boardPixels: number, columns: number) {
    if (boardPixels === this.boardPixels && columns === this.cellsAcross) return false;
    this.boardPixels = boardPixels;
    this.cellsAcross = columns;
    this.canvas.width = boardPixels;
    this.canvas.height = boardPixels;
    this.background = createLayer(boardPixels, boardPixels);
    const backgroundContext = this.background.getContext('2d', { alpha: false })!;
    for (let row = 0; row < columns; row++) {
      for (let column = 0; column < columns; column++) {
        const bounds = cellBounds(column, row, boardPixels, columns);
        backgroundContext.fillStyle = (row + column) % 2 === 0 ? BOARD_COLORS.lightSquare : BOARD_COLORS.darkSquare;
        backgroundContext.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);
      }
    }
    const spriteSize = Math.ceil(boardPixels / columns);
    this.bodySprite = drawBodySprite(spriteSize);
    this.appleSprite = drawAppleSprite(spriteSize);
    this.headSprites = new Map(DIRECTIONS.map(direction => [direction, drawHeadSprite(spriteSize, direction)]));
    return true;
  }

  get isReady() { return this.boardPixels > 0; }

  drawFull(state: SnakeState) {
    if (!this.background) return;
    this.context.drawImage(this.background, 0, 0);
    if (state.apple) this.drawSprite(this.appleSprite!, state.apple);
    for (let index = state.snake.length - 1; index >= 1; index--) this.drawSprite(this.bodySprite!, state.snake[index]);
    this.drawSprite(this.headSprites.get(state.direction)!, state.snake[0]);
  }

  apply(change: BoardChange, state: SnakeState) {
    if (!this.background || change.kind === 'none') return;
    if (change.kind === 'full') { this.drawFull(state); return; }
    if (change.erasedTail) this.eraseCell(change.erasedTail);
    if (change.previousHeadAsBody) {
      this.eraseCell(change.previousHeadAsBody);
      this.drawSprite(this.bodySprite!, change.previousHeadAsBody);
    }
    this.eraseCell(change.newHead); // clears an eaten apple
    this.drawSprite(this.headSprites.get(state.direction)!, change.newHead);
    if (change.appleToDraw) this.drawSprite(this.appleSprite!, change.appleToDraw);
  }

  private eraseCell(cell: Point) {
    const bounds = cellBounds(cell.x, cell.y, this.boardPixels, this.cellsAcross);
    this.context.drawImage(this.background!, bounds.left, bounds.top, bounds.width, bounds.height,
      bounds.left, bounds.top, bounds.width, bounds.height);
  }

  private drawSprite(sprite: Sprite, cell: Point) {
    const bounds = cellBounds(cell.x, cell.y, this.boardPixels, this.cellsAcross);
    this.context.drawImage(sprite, 0, 0, sprite.width, sprite.height, bounds.left, bounds.top, bounds.width, bounds.height);
  }
}
