import { describe, expect, it } from 'vitest';
import { BEST_STORAGE_KEY, loadBest, parseBest, recordRun } from './save';

const memoryStorage = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, map }; };

describe('Pralay Run best run', () => {
  it('keeps the best score and longest distance across runs', () => {
    const storage = memoryStorage();
    expect(loadBest(storage)).toBeNull();
    expect(recordRun({ score: 120, distance: 90, kills: 1 }, storage)).toEqual({ best: { score: 120, distance: 90, kills: 1, runs: 1 }, isBest: true });
    expect(recordRun({ score: 80, distance: 110, kills: 3 }, storage)).toEqual({ best: { score: 120, distance: 110, kills: 3, runs: 2 }, isBest: false });
    expect(loadBest(storage)).toEqual({ score: 120, distance: 110, kills: 3, runs: 2 });
    expect(JSON.parse(storage.map.get(BEST_STORAGE_KEY)!)).toEqual({ score: 120, distance: 110, kills: 3, runs: 2 });
  });
  it('ignores a damaged save', () => {
    expect(parseBest({ score: -1, distance: 1, kills: 0, runs: 1 })).toBeNull();
    expect(parseBest('nope')).toBeNull();
    const storage = memoryStorage();
    storage.setItem(BEST_STORAGE_KEY, '{bad json');
    expect(loadBest(storage)).toBeNull();
  });
});
