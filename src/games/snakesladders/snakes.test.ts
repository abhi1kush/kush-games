import { describe, expect, it } from 'vitest';
import { BOARD_JUMPS, BOARDS, decodeSnapshot, jumpTarget, moveDurationMs, snakeCurve, squarePoint } from './engine';
import { snakesSpec } from './spec';

describe('Snakes & Ladders boards and geometry', () => {
  it('numbers the squares back and forth from the bottom-left', () => {
    expect(squarePoint(1)).toEqual([0.5, 9.5]);
    expect(squarePoint(10)).toEqual([9.5, 9.5]);
    expect(squarePoint(11)).toEqual([9.5, 8.5]);
    expect(squarePoint(20)).toEqual([0.5, 8.5]);
    expect(squarePoint(100)).toEqual([0.5, 0.5]);
  });
  it('has five themed boards, each with ladders and snakes; the first is the default', () => {
    expect(BOARDS).toHaveLength(5);
    expect(BOARD_JUMPS).toHaveLength(5);
    expect(BOARDS[0].name).toBe('Mango Grove');
    for (const jumps of BOARD_JUMPS) {
      expect(jumps.filter(([from, to]) => to > from).length).toBeGreaterThanOrEqual(6);
      expect(jumps.filter(([from, to]) => to < from).length).toBeGreaterThanOrEqual(6);
    }
    expect(jumpTarget(0, 28)).toBe(84);
    expect(jumpTarget(0, 87)).toBe(24);
    expect(jumpTarget(0, 2)).toBe(2);
  });
  it('snake curves start at the head and end at the tail', () => {
    const [head, , , tail] = snakeCurve(99, 78, 0);
    expect(head).toEqual(squarePoint(99));
    expect(tail).toEqual(squarePoint(78));
  });
  it('waits long enough for the hops and the jump before the next turn', () => {
    const plain = moveDurationMs({ id: 1, seat: 0, from: 10, landed: 14, to: 14 });
    const ladder = moveDurationMs({ id: 1, seat: 0, from: 24, landed: 28, to: 84 });
    expect(ladder).toBeGreaterThan(plain + 500);
    expect(decodeSnapshot([1, 2, 3])).toBeNull();
    expect(snakesSpec.variantCount).toBe(5);
  });
});

describe('token drawing', () => {
  it('the ellipse under a token is opaque, resting or hopping', async () => {
    const { drawToken, TOKEN_BASE } = await import('./board');
    for (const lift of [0, 0.5, 1]) {
      const fills: string[] = [];
      let style: unknown = '';
      const gradient = { addColorStop() {} };
      const context = new Proxy({}, {
        get: (_, key) => (key === 'fillStyle' ? style : key === 'fill' ? () => fills.push(String(style)) : key.toString().startsWith('create') ? () => gradient : () => undefined),
        set: (_, key, value) => { if (key === 'fillStyle') style = value; return true; },
      }) as CanvasRenderingContext2D;
      drawToken(context, 50, 50, 20, 0, lift);
      expect(fills[0]).toBe(TOKEN_BASE);
      expect(fills[0]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
