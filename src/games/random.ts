/** mulberry32: a tiny seeded random generator, so games can be replayed in tests. */
export function createRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle into a new array. */
export function shuffled<Item>(items: readonly Item[], random: () => number = Math.random): Item[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const swapIndex = Math.floor(random() * (i + 1));
    [result[i], result[swapIndex]] = [result[swapIndex], result[i]];
  }
  return result;
}

/** Read and write small JSON settings (best scores etc.) without ever throwing. */
export function readStoredJson<Value>(key: string, fallback: Value): Value {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as Value) : fallback;
  } catch { return fallback; }
}
export function saveStoredJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
