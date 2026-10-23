// Integration tests through the real wasm bindings (the same .wasm files the site ships).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as breakoutModule from './breakout/breakout.js';
import * as checkersModule from './checkers/checkers.js';
import * as connectFourModule from './connect_four/connect_four.js';
import * as solitaireModule from './solitaire/solitaire.js';
import * as kushJumpModule from './kush_jump/kush_jump.js';
import { decodeMoves } from '../games/checkers/engine';
import { decodeLayout } from '../games/solitaire/engine';
import { RenderSlot } from '../games/breakout/engine';
import { Buttons, Phase as KushJumpPhase, RenderSlot as KushJumpSlot } from '../games/kushjump/engine';

const wasmBytes = (name: string) => readFileSync(new URL(`./${name}/${name}_bg.wasm`, import.meta.url));
let breakoutMemory: WebAssembly.Memory;
let kushJumpMemory: WebAssembly.Memory;

beforeAll(() => {
  breakoutMemory = breakoutModule.initSync({ module: wasmBytes('breakout') }).memory;
  checkersModule.initSync({ module: wasmBytes('checkers') });
  connectFourModule.initSync({ module: wasmBytes('connect_four') });
  solitaireModule.initSync({ module: wasmBytes('solitaire') });
  kushJumpMemory = kushJumpModule.initSync({ module: wasmBytes('kush_jump') }).memory;
});

describe('wasm bindings', () => {
  it('every game .wasm stays small (< 40 KB raw)', () => {
    for (const name of ['breakout', 'checkers', 'connect_four', 'solitaire', 'kush_jump']) expect(wasmBytes(name).length, name).toBeLessThan(40 * 1024);
  });

  it('Kush Jump: runs right through the render buffer, survives a hitch and finishes at the flag', () => {
    const game = new kushJumpModule.KushJump();
    const render = new Float32Array(kushJumpMemory.buffer, game.render_pointer(), KushJumpSlot.length);
    game.set_view_width(400);
    game.start();
    const startX = render[KushJumpSlot.heroX];
    game.set_input(Buttons.right);
    for (let frame = 0; frame < 30; frame++) game.advance(1 / 60);
    expect(render[KushJumpSlot.heroX]).toBeGreaterThan(startX + 10);
    const beforeHitch = render[KushJumpSlot.heroX];
    game.advance(3); // a 3 s freeze is dropped, not simulated
    expect(render[KushJumpSlot.heroX] - beforeHitch).toBeLessThan(4);
    game.debug_teleport(195);
    for (let frame = 0; frame < 900 && game.phase() !== KushJumpPhase.Cleared; frame++) game.advance(1 / 60);
    expect(game.phase()).toBe(KushJumpPhase.Cleared);
    expect(game.score()).toBeGreaterThan(5000);
    game.free();
  });

  it('Connect Four: plays, detects a win and the hard AI blocks a threat in a worker-sized budget', () => {
    const game = new connectFourModule.ConnectFour();
    expect(game.load(Uint8Array.from([0, 6, 1, 6, 2]))).toBe(true);
    const start = performance.now();
    expect(game.best_move(2, 1, 160_000)).toBe(3);
    expect(performance.now() - start).toBeLessThan(1000);
    game.play(5);
    game.play(3);
    expect(game.winner()).toBe(1);
    expect(Array.from(game.winning_cells()).sort((a, b) => a - b)).toEqual([0, 6, 12, 18]);
    game.free();
  });

  it('Checkers: decodes forced captures from the flat move list and replays history', () => {
    const game = new checkersModule.Checkers();
    expect(decodeMoves(game.legal_moves())).toHaveLength(7);
    // dark at square 21 (row 5), light at 17 (row 4) with 13 empty: the only move is the capture
    game.set_position(1 << 21, (1 << 17) | (1 << 0), 0, 0);
    const moves = decodeMoves(game.legal_moves());
    expect(moves).toHaveLength(1);
    expect(moves[0].captured).toEqual([17]);
    expect(game.capturing_pieces()).toBe(1 << 21);
    const fresh = new checkersModule.Checkers();
    fresh.apply(2); fresh.apply(1);
    const copy = new checkersModule.Checkers();
    expect(copy.load(fresh.history())).toBe(true);
    expect(Array.from(copy.cells())).toEqual(Array.from(fresh.cells()));
    [game, fresh, copy].forEach(item => item.free());
  });

  it('Solitaire: same seed, same deal; moves replay from the action list', () => {
    const first = new solitaireModule.Solitaire(1234, 1);
    const second = new solitaireModule.Solitaire(1234, 1);
    expect(Array.from(first.layout())).toEqual(Array.from(second.layout()));
    const layout = decodeLayout(first.layout());
    expect(layout.stockCount).toBe(24);
    expect(layout.columns.map(column => column.cards.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (let step = 0; step < 25; step++) {
      const hint = first.hint();
      if (hint.length === 1) first.draw(); else if (hint.length === 3) first.move_cards(hint[0], hint[1], hint[2]); else break;
    }
    const copy = new solitaireModule.Solitaire(1, 1);
    expect(copy.load(1234, 1, first.actions())).toBe(true);
    expect(Array.from(copy.layout())).toEqual(Array.from(first.layout()));
    expect(first.undo()).toBe(true);
    [first, second, copy].forEach(item => item.free());
  });

  it('Breakout: JS reads positions straight from wasm memory after each advance', () => {
    const game = new breakoutModule.Breakout(7);
    const render = new Float32Array(breakoutMemory.buffer, game.render_pointer(), RenderSlot.length);
    expect(render[RenderSlot.ballCount]).toBe(1);
    expect(render[RenderSlot.lives]).toBe(3);
    game.launch();
    const startY = render[RenderSlot.balls + 1];
    game.advance(0.1);
    expect(render[RenderSlot.balls + 1]).toBeLessThan(startY); // moved up, same view, no copy
    const bricks = new Uint8Array(breakoutMemory.buffer, game.bricks_pointer(), 90);
    expect(bricks.some(hits => hits > 0)).toBe(true);
    expect(game.restore(4, 500, 2, bricks.slice())).toBe(true);
    expect(game.level()).toBe(4);
    expect(game.phase()).toBe(0);
    game.free();
  });
});
