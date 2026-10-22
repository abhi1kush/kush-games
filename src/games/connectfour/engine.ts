/** Loads the Connect Four wasm once (only when the game opens). */
import init, { ConnectFour } from '../../wasm/connect_four/connect_four.js';
import type { AiRequest, AiResult } from '../aiWorkerClient';

let ready: Promise<unknown> | null = null;
export const loadConnectFourEngine = () => (ready ??= init());

export { ConnectFour };
export const COLUMNS = 7;
export const ROWS = 6;
/** Search budget for Hard: about 50 ms on a laptop, ~200 ms on a mid-range phone. */
export const HARD_NODE_BUDGET = 160_000;

/** Run the search on this thread (fallback when there is no worker). */
export async function computeMoveHere(request: AiRequest): Promise<AiResult> {
  await loadConnectFourEngine();
  const engine = new ConnectFour();
  engine.load(Uint8Array.from(request.history));
  const start = performance.now();
  const move = engine.best_move(request.level, request.seed, request.budget);
  const result = { move, milliseconds: performance.now() - start, nodes: engine.last_nodes() };
  engine.free();
  return result;
}
