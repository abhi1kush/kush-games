import { describe, expect, it } from 'vitest';
import {
  advanceTime, BlocksState, BOARD_COLUMNS, BOARD_ROWS, collides, createEmptyBoard, createInitialState, dropDistance,
  findFullRows, finishLineClear, ghostPiece, gravityIntervalMs, hardDrop, holdPiece, isGrounded, levelForLines,
  lineClearPoints, LOCK_DELAY_MS, lockPiece, MAX_LOCK_RESETS, moveDown, moveHorizontal, msUntilNextEvent, nextRandom,
  PIECE_ROTATIONS, PIECE_TYPES, pieceCells, removeRows, rotateClockwise, rotateMatrixClockwise, shuffledBag, spawnPiece,
  startGame, togglePause, Board, PieceType,
} from './game';

/** A board with the bottom `rowCount` rows filled except for `gapColumn`. */
function boardWithGap(rowCount: number, gapColumn: number): Board {
  const board = createEmptyBoard();
  for (let row = BOARD_ROWS - rowCount; row < BOARD_ROWS; row++) {
    for (let column = 0; column < BOARD_COLUMNS; column++) if (column !== gapColumn) board[row][column] = 'garbage';
  }
  return board;
}

const runningWith = (firstPieces: PieceType[], board?: Board, seed = 1): BlocksState =>
  startGame(createInitialState({ seed, firstPieces, board }));

const occupiedColumns = (state: BlocksState) => pieceCells(state.active!).map(cell => cell.x).sort((first, second) => first - second);

describe('pieces and rotation', () => {
  it('has 7 four-cell pieces with 4 rotations each', () => {
    expect(PIECE_TYPES).toHaveLength(7);
    for (const type of PIECE_TYPES) {
      expect(PIECE_ROTATIONS[type]).toHaveLength(4);
      PIECE_ROTATIONS[type].forEach(cells => expect(cells).toHaveLength(4));
    }
  });

  it('rotates a matrix clockwise', () => {
    expect(rotateMatrixClockwise([[1, 2], [3, 4]])).toEqual([[3, 1], [4, 2]]);
  });

  it('spawns centred in the top row', () => {
    const iPiece = spawnPiece('I');
    expect(pieceCells(iPiece).map(cell => cell.y)).toEqual([0, 0, 0, 0]);
    expect(pieceCells(iPiece).map(cell => cell.x)).toEqual([3, 4, 5, 6]);
    expect(pieceCells(spawnPiece('O')).map(cell => cell.x).sort()).toEqual([4, 4, 5, 5]);
    expect(Math.min(...pieceCells(spawnPiece('T')).map(cell => cell.y))).toBe(0);
  });

  it('rotates T clockwise and back to the start after four turns', () => {
    let state = runningWith(['T']);
    const start = pieceCells(state.active!);
    state = rotateClockwise(state);
    expect(state.active!.rotation).toBe(1);
    expect(pieceCells(state.active!)).not.toEqual(start);
    for (let turn = 0; turn < 3; turn++) state = rotateClockwise(state);
    expect(pieceCells(state.active!)).toEqual(start);
  });

  it('does not rotate O', () => {
    const state = runningWith(['O']);
    expect(rotateClockwise(state)).toBe(state);
  });

  it('wall-kicks away from the wall when rotating', () => {
    // vertical I against the right wall: rotating back to horizontal needs a kick to the left
    let state = runningWith(['I']);
    state = rotateClockwise(state); // vertical, column x+2
    while (moveHorizontal(state, 1) !== state) state = moveHorizontal(state, 1);
    expect(occupiedColumns(state)).toEqual([9, 9, 9, 9]);
    const rotated = rotateClockwise(state);
    expect(rotated).not.toBe(state);
    expect(Math.max(...occupiedColumns(rotated))).toBeLessThanOrEqual(9);
    expect(collides(rotated.board, rotated.active!)).toBe(false);
  });
});

describe('movement and collision', () => {
  it('moves left and right but not through walls', () => {
    let state = runningWith(['O']);
    for (let step = 0; step < 10; step++) state = moveHorizontal(state, -1);
    expect(occupiedColumns(state)[0]).toBe(0);
    for (let step = 0; step < 20; step++) state = moveHorizontal(state, 1);
    expect(Math.max(...occupiedColumns(state))).toBe(9);
  });

  it('does not move into filled cells', () => {
    const board = createEmptyBoard();
    board[0][2] = 'garbage';
    board[1][2] = 'garbage';
    let state = runningWith(['O'], board); // O at columns 4-5
    state = moveHorizontal(moveHorizontal(state, -1), -1);
    expect(occupiedColumns(state)[0]).toBe(3);
  });

  it('finds the drop distance and ghost position', () => {
    const state = runningWith(['O']);
    expect(dropDistance(state)).toBe(18);
    expect(ghostPiece(state)!.y).toBe(18);
  });

  it('soft drop moves down and scores a point per cell', () => {
    const state = moveDown(runningWith(['T']), true);
    expect(state.active!.y).toBe(1);
    expect(state.score).toBe(1);
    expect(moveDown(runningWith(['T'])).score).toBe(0);
  });
});

describe('hard drop and locking', () => {
  it('hard drop locks at the bottom, scores 2 per cell and spawns the next piece', () => {
    const state = hardDrop(runningWith(['O', 'T']));
    expect(state.score).toBe(36);
    expect(state.board[19][4]).toBe('O');
    expect(state.board[18][5]).toBe('O');
    expect(state.active!.type).toBe('T');
    expect(state.lockCount).toBe(1);
  });

  it('uses a lock delay of about 500 ms once grounded', () => {
    let state = runningWith(['O']);
    while (!isGrounded(state)) state = moveDown(state);
    expect(msUntilNextEvent(state)).toBe(LOCK_DELAY_MS);
    state = advanceTime(state, LOCK_DELAY_MS - 1);
    expect(state.active!.type).toBe('O');
    state = advanceTime(state, 1);
    expect(state.lockCount).toBe(1);
  });

  it('moving a grounded piece resets the lock delay, but only a limited number of times', () => {
    let state = runningWith(['O']);
    while (!isGrounded(state)) state = moveDown(state);
    state = advanceTime(state, 400);
    state = moveHorizontal(state, -1);
    expect(state.lockElapsedMs).toBe(0);
    for (let reset = 0; reset < MAX_LOCK_RESETS + 5; reset++) state = moveHorizontal(state, reset % 2 === 0 ? 1 : -1);
    expect(state.lockResets).toBe(MAX_LOCK_RESETS);
    expect(advanceTime(state, LOCK_DELAY_MS).lockCount).toBe(1);
  });

  it('gravity moves the piece down one row per interval', () => {
    let state = runningWith(['T']);
    const interval = gravityIntervalMs(1);
    state = advanceTime(state, interval - 1);
    expect(state.active!.y).toBe(0);
    state = advanceTime(state, 1);
    expect(state.active!.y).toBe(1);
    state = advanceTime(state, interval * 3);
    expect(state.active!.y).toBe(4);
  });

  it('is game over when a new piece cannot spawn', () => {
    const board = createEmptyBoard();
    for (let column = 0; column < BOARD_COLUMNS; column++) if (column !== 0) board[1][column] = 'garbage';
    const state = runningWith(['O', 'O'], board);
    expect(state.status).toBe('over');
  });

  it('is game over when a piece locks above the top', () => {
    const board = createEmptyBoard();
    for (let row = 1; row < BOARD_ROWS; row++) board[row][4] = 'garbage';
    let state = runningWith(['I', 'O'], board); // horizontal I sits in row 0 on top of column 4
    state = rotateClockwise(state);
    state = hardDrop(state);
    expect(state.status).toBe('over');
  });
});

describe('line clears and scoring', () => {
  it('finds and removes full rows, shifting the rest down', () => {
    const board = boardWithGap(2, -1);
    board[17][3] = 'T';
    expect(findFullRows(board)).toEqual([18, 19]);
    const collapsed = removeRows(board, [18, 19]);
    expect(collapsed[19][3]).toBe('T');
    expect(findFullRows(collapsed)).toEqual([]);
  });

  it('clears a single line with a short pause for the animation', () => {
    let state = runningWith(['I', 'O'], boardWithGap(1, 0));
    state = rotateClockwise(state); // vertical I in column x + 2
    while (moveHorizontal(state, -1) !== state) state = moveHorizontal(state, -1);
    state = hardDrop(state);
    expect(state.clearingRows).toEqual([19]);
    expect(state.active).toBeNull();
    expect(state.lines).toBe(1);
    expect(state.lastClearLines).toBe(1);
    expect(state.score).toBe(100 + 2 * dropDistanceForVerticalI());
    expect(advanceTime(state, 5000)).toBe(state); // nothing moves during the animation
    state = finishLineClear(state);
    expect(state.clearingRows).toEqual([]);
    expect(state.active!.type).toBe('O');
    expect(state.board[19][0]).toBe('I'); // the rest of the I dropped into the cleared row
  });

  it('scores 100/300/500/800 times the level', () => {
    expect([1, 2, 3, 4].map(lines => lineClearPoints(lines, 1))).toEqual([100, 300, 500, 800]);
    expect(lineClearPoints(4, 3)).toBe(2400);
    expect(lineClearPoints(0, 5)).toBe(0);
  });

  it('a quad clear removes four rows and scores 800', () => {
    let state = runningWith(['I', 'T'], boardWithGap(4, 0));
    state = rotateClockwise(state);
    while (moveHorizontal(state, -1) !== state) state = moveHorizontal(state, -1);
    state = hardDrop(state);
    expect(state.clearingRows).toEqual([16, 17, 18, 19]);
    expect(state.lastClearLines).toBe(4);
    expect(state.score).toBe(800 + 2 * dropDistanceForVerticalI());
    state = finishLineClear(state);
    expect(state.board.every(row => row.every(cell => cell === null))).toBe(true);
  });

  it('levels up every 10 lines and gravity gets faster', () => {
    expect(levelForLines(0)).toBe(1);
    expect(levelForLines(9)).toBe(1);
    expect(levelForLines(10)).toBe(2);
    expect(levelForLines(25)).toBe(3);
    expect(gravityIntervalMs(1)).toBe(800);
    expect(gravityIntervalMs(2)).toBeLessThan(gravityIntervalMs(1));
    expect(gravityIntervalMs(50)).toBe(80);
  });

  it('uses the level before the clear for scoring', () => {
    let state = { ...runningWith(['I', 'O'], boardWithGap(1, 0)), lines: 9 };
    state = rotateClockwise(state);
    while (moveHorizontal(state, -1) !== state) state = moveHorizontal(state, -1);
    state = hardDrop(state);
    expect(state.lines).toBe(10);
    expect(state.level).toBe(2);
    expect(state.score).toBe(100 * 1 + 2 * dropDistanceForVerticalI());
  });
});

function dropDistanceForVerticalI() {
  // I spawns with y = -1; vertical it covers rows -1..2 and falls 17 rows to rest on row 19
  return 17;
}

describe('7-bag randomiser', () => {
  it('is deterministic for a seed', () => {
    expect(nextRandom(42)).toEqual(nextRandom(42));
    expect(shuffledBag(7).bag).toEqual(shuffledBag(7).bag);
  });

  it('every bag contains each piece exactly once', () => {
    let seed = 123;
    for (let bagIndex = 0; bagIndex < 20; bagIndex++) {
      const result = shuffledBag(seed);
      seed = result.seed;
      expect([...result.bag].sort()).toEqual([...PIECE_TYPES].sort());
    }
  });

  it('deals pieces so every group of 7 is a full set', () => {
    let state = startGame(createInitialState({ seed: 99 }));
    const dealt: PieceType[] = [state.active!.type];
    for (let piece = 0; piece < 20; piece++) {
      state = { ...state, board: createEmptyBoard() }; // keep the board empty
      state = hardDrop(state);
      dealt.push(state.active!.type);
    }
    expect([...dealt.slice(0, 7)].sort()).toEqual([...PIECE_TYPES].sort());
    expect([...dealt.slice(7, 14)].sort()).toEqual([...PIECE_TYPES].sort());
    expect(state.queue).toHaveLength(5);
  });
});

describe('hold, pause and status', () => {
  it('holds a piece once per drop and swaps on the next hold', () => {
    let state = runningWith(['T', 'O', 'S']);
    state = holdPiece(state);
    expect(state.hold).toBe('T');
    expect(state.active!.type).toBe('O');
    expect(holdPiece(state)).toBe(state); // only once per piece
    state = hardDrop(state); // O locks, S comes in
    state = holdPiece(state);
    expect(state.hold).toBe('S');
    expect(state.active!.type).toBe('T');
  });

  it('pauses and resumes; nothing happens while paused', () => {
    const running = runningWith(['T']);
    const paused = togglePause(running);
    expect(paused.status).toBe('paused');
    expect(advanceTime(paused, 10000)).toBe(paused);
    expect(moveHorizontal(paused, 1)).toBe(paused);
    expect(togglePause(paused).status).toBe('running');
    expect(startGame(paused).status).toBe('running');
  });

  it('starts from ready with the first queued piece', () => {
    const ready = createInitialState({ seed: 5, firstPieces: ['L'] });
    expect(ready.status).toBe('ready');
    expect(ready.active).toBeNull();
    expect(ready.queue).toHaveLength(5);
    const running = startGame(ready);
    expect(running.active!.type).toBe('L');
    expect(running.queue).toHaveLength(5);
  });
});
