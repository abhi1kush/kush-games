/**
 * Runs a game's computer opponent in a Web Worker (its own copy of the game's wasm), so a deep search never
 * blocks taps or animations. Falls back to the main thread when workers aren't available.
 */
export interface AiRequest { history: number[]; level: number; seed: number; budget: number; }
export interface AiResult { move: number; milliseconds: number; nodes: number; }

export interface AiClient { request(request: AiRequest): Promise<AiResult>; dispose(): void; }

export function createAiClient(createWorker: () => Worker, computeHere: (request: AiRequest) => Promise<AiResult>): AiClient {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, { request: AiRequest; resolve: (result: AiResult) => void }>();
  const failOver = () => {
    worker?.terminate();
    worker = null;
    for (const [id, { request, resolve }] of pending) { pending.delete(id); void computeHere(request).then(resolve); }
  };
  try {
    worker = createWorker();
    worker.onmessage = (event: MessageEvent<AiResult & { id: number }>) => {
      const entry = pending.get(event.data.id);
      pending.delete(event.data.id);
      entry?.resolve(event.data);
    };
    worker.onerror = failOver;
  } catch { worker = null; }
  return {
    request(request) {
      if (!worker) return computeHere(request);
      const id = ++nextId;
      return new Promise(resolve => { pending.set(id, { request, resolve }); worker!.postMessage({ id, ...request }); });
    },
    dispose() { worker?.terminate(); worker = null; pending.clear(); },
  };
}

/** Keep the computer from answering faster than a person can follow. */
export const waitAtLeast = <Value>(promise: Promise<Value>, milliseconds: number) =>
  Promise.all([promise, new Promise(resolve => setTimeout(resolve, milliseconds))]).then(([value]) => value);

/** Wins/losses/draws kept across games (separately for vs-computer and two players). */
export interface Tally { first: number; second: number; draws: number; }
export const emptyTally = (): Tally => ({ first: 0, second: 0, draws: 0 });
export const isTally = (value: unknown): value is Tally =>
  typeof value === 'object' && value !== null && ['first', 'second', 'draws'].every(key => Number.isInteger((value as Record<string, unknown>)[key]));
