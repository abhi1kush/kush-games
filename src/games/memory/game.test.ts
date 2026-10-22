import { describe, expect, it } from 'vitest';
import { createMemoryGame, flipCard, GRID_SIZES, hideMismatch, isComplete, MemoryState } from './game';
import { parseMemorySave, serializeMemory } from './save';

const partnerOf = (state: MemoryState, index: number) => state.faces.findIndex((face, other) => other !== index && face === state.faces[index]);

describe('memory match deck', () => {
  it.each(GRID_SIZES.map(size => size.id))('%s has every face exactly twice', size => {
    const state = createMemoryGame(size, 9);
    const { columns, rows } = GRID_SIZES.find(option => option.id === size)!;
    expect(state.faces).toHaveLength(columns * rows);
    const counts = new Map<string, number>();
    for (const face of state.faces) counts.set(face, (counts.get(face) ?? 0) + 1);
    expect([...counts.values()].every(count => count === 2)).toBe(true);
    expect(counts.size).toBe((columns * rows) / 2);
  });
});

describe('memory match pairing', () => {
  it('keeps matches, counts moves and finishes', () => {
    let state = createMemoryGame('4x4', 1);
    const done = new Set<number>();
    for (let index = 0; index < state.faces.length; index++) {
      if (done.has(index)) continue;
      const partner = partnerOf(state, index);
      expect(flipCard(state, index).result).toBe('first');
      state = flipCard(state, index).state;
      const second = flipCard(state, partner);
      expect(second.result).toBe('match');
      state = second.state;
      done.add(index); done.add(partner);
    }
    expect(isComplete(state)).toBe(true);
    expect(state.moves).toBe(8);
    expect(serializeMemory(state)).toBeNull();
  });

  it('a mismatch stays open until hidden or the next tap', () => {
    let state = createMemoryGame('4x4', 2);
    const wrong = state.faces.findIndex(face => face !== state.faces[0]);
    state = flipCard(state, 0).state;
    const result = flipCard(state, wrong);
    expect(result.result).toBe('mismatch');
    expect(result.state.openIndexes).toEqual([0, wrong]);
    expect(result.state.moves).toBe(1);
    expect(hideMismatch(result.state).openIndexes).toEqual([]);
    // tapping a third card turns the pair back and opens the new one
    const third = [...Array(16).keys()].find(index => index !== 0 && index !== wrong)!;
    const next = flipCard(result.state, third);
    expect(next.result).toBe('first');
    expect(next.state.openIndexes).toEqual([third]);
  });

  it('ignores taps on open or matched cards', () => {
    let state = createMemoryGame('4x4', 3);
    state = flipCard(state, 0).state;
    expect(flipCard(state, 0).result).toBe('ignored');
    state = flipCard(state, partnerOf(state, 0)).state;
    expect(flipCard(state, 0).result).toBe('ignored');
  });

  it('saves and restores progress, rejecting broken decks', () => {
    let state = createMemoryGame('4x5', 4);
    state = flipCard(state, 0).state;
    state = flipCard(state, partnerOf(state, 0)).state;
    state = { ...state, elapsedMs: 3000 };
    const saved = JSON.parse(JSON.stringify(serializeMemory(state)));
    expect(parseMemorySave(saved)).toEqual(state);
    expect(parseMemorySave({ ...saved, faces: saved.faces.map(() => '🍎') })).toBeNull();
    const halfMatched = [...saved.matched];
    halfMatched[0] = false;
    expect(parseMemorySave({ ...saved, matched: halfMatched })).toBeNull();
  });
});
