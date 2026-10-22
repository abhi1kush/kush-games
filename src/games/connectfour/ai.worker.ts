/// <reference lib="webworker" />
import init, { ConnectFour } from '../../wasm/connect_four/connect_four.js';

const ready = init();
let engine: ConnectFour | undefined;
const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<{ id: number; history: number[]; level: number; seed: number; budget: number }>) => {
  const { id, history, level, seed, budget } = event.data;
  await ready;
  engine ??= new ConnectFour();
  engine.load(Uint8Array.from(history));
  const start = performance.now();
  const move = engine.best_move(level, seed, budget);
  workerScope.postMessage({ id, move, milliseconds: performance.now() - start, nodes: engine.last_nodes() });
};
