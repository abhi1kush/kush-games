import { describe, expect, it } from 'vitest';
import { advanceTime, BlocksState, createInitialState, hardDrop, holdPiece, lockPiece, moveHorizontal, PieceType, rotateClockwise, startGame, spawnNext, togglePause } from './game';
import { parseBlocksSave, restoreBlocks, serializeBlocks } from './save';

function playedGame(seed = 1234): BlocksState {
  let state = startGame(createInitialState({ seed }));
  for (let piece = 0; piece < 9; piece++) {
    state = moveHorizontal(state, piece % 2 ? 1 : -1);
    if (piece % 3 === 0) state = rotateClockwise(state);
    if (piece === 4) state = holdPiece(state);
    state = hardDrop(state);
  }
  return advanceTime(moveHorizontal(state, 1), 900);
}
const roundTrip = (state: BlocksState) => {
  const saved = serializeBlocks(state);
  const parsed = saved && parseBlocksSave(JSON.parse(JSON.stringify(saved)));
  return parsed ? restoreBlocks(parsed) : null;
};
/** The types of the next `count` pieces, by locking pieces one after another. */
function upcomingPieces(state: BlocksState, count: number): PieceType[] {
  const types: PieceType[] = [];
  let current: BlocksState = { ...state, board: state.board.map(row => row.map(() => null)) };
  for (let index = 0; index < count; index++) {
    types.push(current.active!.type);
    current = spawnNext({ ...current, board: current.board, status: 'running' });
  }
  return types;
}

describe('Blocks save', () => {
  it('round-trips board, piece, queue, bag, hold, score, lines, level and RNG state; comes back paused', () => {
    const state = playedGame();
    expect(state.hold).not.toBeNull();
    const restored = roundTrip(state)!;
    expect(restored.board).toEqual(state.board);
    expect(restored.active).toEqual(state.active);
    expect(restored).toMatchObject({
      queue: state.queue, bag: state.bag, randomSeed: state.randomSeed, hold: state.hold, canHold: state.canHold,
      score: state.score, lines: state.lines, level: state.level, lockCount: state.lockCount, status: 'paused', clearingRows: [],
    });
  });

  it('continues the same piece order after restoring (RNG continuity)', () => {
    const state = playedGame(99);
    const restored = togglePause(roundTrip(state)!);
    expect(upcomingPieces(restored, 30)).toEqual(upcomingPieces(state, 30));
    // and identical play gives identical results
    const playOn = (game: BlocksState) => hardDrop(moveHorizontal(hardDrop(rotateClockwise(game)), -1));
    expect(playOn(restored).board).toEqual(playOn(state).board);
    expect(playOn(restored).queue).toEqual(playOn(state).queue);
  });

  it('finishes a line clear that is still animating before saving', () => {
    let state = startGame(createInitialState({ seed: 7, firstPieces: ['I', 'O'] }));
    state = { ...state, board: state.board.map((row, rowIndex) => (rowIndex === 19 ? row.map((_, column) => (column < 6 ? 'garbage' as const : null)) : row)) };
    state = hardDrop(moveHorizontal(moveHorizontal(moveHorizontal(state, 1), 1), 1));
    expect(state.clearingRows).toEqual([19]);
    const restored = roundTrip(state)!;
    expect(restored.board[19].every(cell => cell === null)).toBe(true);
    expect(restored.lines).toBe(1);
    expect(restored.active?.type).toBe('O');
  });

  it('only saves games in progress', () => {
    expect(serializeBlocks(createInitialState({ seed: 1 }))).toBeNull();
    expect(serializeBlocks({ ...playedGame(), status: 'over' })).toBeNull();
    expect(serializeBlocks(lockPiece({ ...playedGame(), active: { type: 'I', rotation: 0, x: 0, y: -3 } }))).toBeNull();
  });

  it('rejects inconsistent or corrupt saves', () => {
    const saved = serializeBlocks(playedGame())!;
    expect(parseBlocksSave({ ...saved, level: 5 })).toBeNull();
    expect(parseBlocksSave({ ...saved, queue: ['I'] })).toBeNull();
    expect(parseBlocksSave({ ...saved, queue: ['Q', 'I', 'O', 'T', 'S'] })).toBeNull();
    expect(parseBlocksSave({ ...saved, bag: ['I', 'I'] })).toBeNull();
    expect(parseBlocksSave({ ...saved, board: saved.board.slice(1) })).toBeNull();
    expect(parseBlocksSave({ ...saved, active: { ...saved.active, x: 20 } })).toBeNull();
    expect(parseBlocksSave({ ...saved, randomSeed: 1.5 })).toBeNull();
    const fullRow = saved.board.map((row, index) => (index === 19 ? row.map(() => 'garbage') : row));
    expect(parseBlocksSave({ ...saved, board: fullRow })).toBeNull();
    const overlapping = saved.board.map(row => row.map(() => 'garbage'));
    expect(parseBlocksSave({ ...saved, board: overlapping })).toBeNull();
    expect(parseBlocksSave(undefined)).toBeNull();
  });
});
