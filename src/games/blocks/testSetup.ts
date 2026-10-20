/**
 * Test-only setups selected with a URL query parameter, e.g. ?blocksSetup=quad#/play/blocks.
 * They only change the starting board/pieces; normal play never uses them.
 */
import { BOARD_COLUMNS, BOARD_ROWS, createEmptyBoard, InitialStateOptions } from './game';

export function setupFromQuery(search: string): InitialStateOptions | undefined {
  const parameters = new URLSearchParams(search);
  const setup = parameters.get('blocksSetup');
  const seedText = parameters.get('blocksSeed');
  const seed = seedText !== null && Number.isFinite(Number(seedText)) ? Number(seedText) : undefined;
  if (setup === 'quad') {
    // bottom 4 rows full except the left column, and an I piece first: one drop clears 4 lines
    const board = createEmptyBoard();
    for (let row = BOARD_ROWS - 4; row < BOARD_ROWS; row++) {
      for (let column = 1; column < BOARD_COLUMNS; column++) board[row][column] = 'garbage';
    }
    return { seed: seed ?? 7, board, firstPieces: ['I', 'O', 'T'] };
  }
  return seed !== undefined ? { seed } : undefined;
}
