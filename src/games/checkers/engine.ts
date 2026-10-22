/** Loads the Checkers wasm once (only when the game opens) and decodes its flat move list. */
import init, { Checkers } from '../../wasm/checkers/checkers.js';
import type { AiRequest, AiResult } from '../aiWorkerClient';

let ready: Promise<unknown> | null = null;
export const loadCheckersEngine = () => (ready ??= init());
export { Checkers };
/** Search budget for Hard: ~60 ms on a laptop, ~200 ms on a mid-range phone. */
export const HARD_NODE_BUDGET = 120_000;

export interface CheckersMove { index: number; from: number; to: number; path: number[]; captured: number[]; }

/** Decode `legal_moves()`: from, capturedMask, pathLength, path… per move. */
export function decodeMoves(flat: Uint32Array): CheckersMove[] {
  const moves: CheckersMove[] = [];
  for (let offset = 0; offset < flat.length;) {
    const from = flat[offset], capturedMask = flat[offset + 1], pathLength = flat[offset + 2];
    const path = Array.from(flat.subarray(offset + 3, offset + 3 + pathLength));
    const captured = Array.from({ length: 32 }, (_, square) => square).filter(square => (capturedMask >>> square) & 1);
    moves.push({ index: moves.length, from, to: path[path.length - 1], path, captured });
    offset += 3 + pathLength;
  }
  return moves;
}

/** Board position of a dark square (row 0 at the top). */
export const squareRow = (square: number) => Math.floor(square / 4);
export const squareColumn = (square: number) => 2 * (square % 4) + (squareRow(square) % 2 === 0 ? 1 : 0);

export async function computeMoveHere(request: AiRequest): Promise<AiResult> {
  await loadCheckersEngine();
  const engine = new Checkers();
  engine.load(Uint8Array.from(request.history));
  const start = performance.now();
  const move = engine.best_move(request.level, request.seed, request.budget);
  const result = { move, milliseconds: performance.now() - start, nodes: engine.last_nodes() };
  engine.free();
  return result;
}
