// Integration tests through the real wasm bindings (the same .wasm files the site ships).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as breakoutModule from './breakout/breakout.js';
import * as checkersModule from './checkers/checkers.js';
import * as connectFourModule from './connect_four/connect_four.js';
import * as kushJumpModule from './kush_jump/kush_jump.js';
import * as jungleStrikeModule from './jungle_strike/jungle_strike.js';
import * as antarikshModule from './antariksh_defenders/antariksh_defenders.js';
import * as mithaiModule from './mithai_match/mithai_match.js';
import * as ludoModule from './ludo/ludo.js';
import * as snakesModule from './snakes_ladders/snakes_ladders.js';
import { decodeMoves } from '../games/checkers/engine';
import { RenderSlot } from '../games/breakout/engine';
import { Buttons, Phase as KushJumpPhase, RenderSlot as KushJumpSlot } from '../games/kushjump/engine';
import { Buttons as StrikeButtons, PLATFORM_COUNT, RenderSlot as StrikeSlot } from '../games/junglestrike/engine';
import { parseJungleStrikeSave } from '../games/junglestrike/save';
import { Buttons as AntarikshButtons, RenderSlot as AntarikshSlot, SHIELD_COUNT, SHIELD_HEIGHT, SHIELD_WIDTH } from '../games/antariksh/engine';
import { parseAntarikshSave } from '../games/antariksh/save';
import { LEVEL_COUNT as MITHAI_LEVELS, levelInfo as mithaiLevelInfo, RenderSlot as MithaiSlot } from '../games/mithai/engine';
import { emptyMithaiProgress, parseMithaiSave } from '../games/mithai/save';
import { decodeSnapshot, EnginePhase, YARD } from '../games/ludo/engine';
import { TurnAuthority } from '../games/online/turnRoom/authority';
import { ludoSpec } from '../games/ludo/spec';
import { BOARD_JUMPS, decodeSnapshot as decodeSnakes, EnginePhase as SnakesPhase, jumpTarget } from '../games/snakesladders/engine';
import { snakesSpec } from '../games/snakesladders/spec';

const wasmBytes = (name: string) => readFileSync(new URL(`./${name}/${name}_bg.wasm`, import.meta.url));
let breakoutMemory: WebAssembly.Memory;
let kushJumpMemory: WebAssembly.Memory;
let jungleStrikeMemory: WebAssembly.Memory;
let antarikshMemory: WebAssembly.Memory;
let mithaiMemory: WebAssembly.Memory;

beforeAll(() => {
  breakoutMemory = breakoutModule.initSync({ module: wasmBytes('breakout') }).memory;
  checkersModule.initSync({ module: wasmBytes('checkers') });
  connectFourModule.initSync({ module: wasmBytes('connect_four') });
  kushJumpMemory = kushJumpModule.initSync({ module: wasmBytes('kush_jump') }).memory;
  jungleStrikeMemory = jungleStrikeModule.initSync({ module: wasmBytes('jungle_strike') }).memory;
  antarikshMemory = antarikshModule.initSync({ module: wasmBytes('antariksh_defenders') }).memory;
  mithaiMemory = mithaiModule.initSync({ module: wasmBytes('mithai_match') }).memory;
  ludoModule.initSync({ module: wasmBytes('ludo') });
  snakesModule.initSync({ module: wasmBytes('snakes_ladders') });
});

describe('wasm bindings', () => {
  it('every game .wasm stays small (< 40 KB raw)', () => {
    for (const name of ['breakout', 'checkers', 'connect_four', 'kush_jump', 'jungle_strike', 'antariksh_defenders', 'mithai_match', 'ludo', 'snakes_ladders']) expect(wasmBytes(name).length, name).toBeLessThan(40 * 1024);
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

  it('Jungle Strike: the render layout matches, it runs and shoots, drops a hitch, and the boss can be beaten', () => {
    expect(jungleStrikeModule.JungleStrike.render_length()).toBe(StrikeSlot.length);
    expect(jungleStrikeModule.JungleStrike.platform_count()).toBe(PLATFORM_COUNT);
    const game = new jungleStrikeModule.JungleStrike();
    const render = new Float32Array(jungleStrikeMemory.buffer, game.render_pointer(), StrikeSlot.length);
    game.set_view_width(400);
    game.start();
    game.debug_set_invincible(true);
    const startX = render[StrikeSlot.heroX];
    game.set_input(StrikeButtons.right | StrikeButtons.fire);
    for (let frame = 0; frame < 30; frame++) game.advance(1 / 60);
    expect(render[StrikeSlot.heroX]).toBeGreaterThan(startX + 30);
    expect(render[StrikeSlot.bulletCount]).toBeGreaterThan(0);
    const beforeHitch = render[StrikeSlot.heroX];
    game.advance(3);
    expect(render[StrikeSlot.heroX] - beforeHitch).toBeLessThan(3);
    game.debug_teleport(3700);
    game.debug_set_weapon(3);
    game.set_input(StrikeButtons.fire);
    for (let frame = 0; frame < 1800 && game.phase() !== 5; frame++) game.advance(1 / 60);
    expect(game.phase()).toBe(5);
    expect(game.score()).toBeGreaterThan(15000);
    game.free();
  });

  it('Jungle Strike saves are validated', () => {
    expect(parseJungleStrikeSave({ checkpoint: true, lives: 2, score: 1200, weapon: 2, continues: 1 })).toEqual({ checkpoint: true, lives: 2, score: 1200, weapon: 2, continues: 1 });
    expect(parseJungleStrikeSave({ checkpoint: true, lives: 0, score: 0, weapon: 0, continues: 0 })).toBeNull();
    expect(parseJungleStrikeSave({ checkpoint: true, lives: 2, score: 0, weapon: 7, continues: 0 })).toBeNull();
    expect(parseJungleStrikeSave(null)).toBeNull();
  });

  it('Antariksh Defenders: the render layout matches, it counts down, moves, fires, kills and drops a hitch', () => {
    expect(antarikshModule.AntarikshDefenders.render_length()).toBe(AntarikshSlot.length);
    expect(antarikshModule.AntarikshDefenders.shields_length()).toBe(SHIELD_COUNT * SHIELD_WIDTH * SHIELD_HEIGHT);
    expect(antarikshModule.AntarikshDefenders.stage_name(3)).toBe('Lunar Orbit');
    const game = new antarikshModule.AntarikshDefenders();
    const render = new Float32Array(antarikshMemory.buffer, game.render_pointer(), AntarikshSlot.length);
    expect(render[AntarikshSlot.enemiesAlive]).toBe(45);
    game.start();
    game.debug_set_invincible(true);
    for (let frame = 0; frame < 240; frame++) game.advance(1 / 60);
    expect(game.phase()).toBe(2);
    const startX = render[AntarikshSlot.playerX];
    game.set_input(AntarikshButtons.right);
    for (let frame = 0; frame < 30; frame++) game.advance(1 / 60);
    expect(render[AntarikshSlot.playerX]).toBeGreaterThan(startX + 30);
    game.set_input(AntarikshButtons.fire);
    for (let frame = 0; frame < 300 && game.kills() === 0; frame++) { game.set_target_x(game.debug_nearest_enemy_x()); game.advance(1 / 60); }
    expect(game.kills()).toBeGreaterThan(0);
    expect(game.score()).toBeGreaterThan(0);
    game.set_input(AntarikshButtons.left);
    game.set_target_x(-1);
    const beforeHitch = render[AntarikshSlot.playerX];
    game.advance(3);
    expect(beforeHitch - render[AntarikshSlot.playerX]).toBeLessThan(3);
    game.free();
  });

  it('Antariksh Defenders saves are validated', () => {
    expect(parseAntarikshSave({ wave: 3, score: 2400, lives: 2 })).toEqual({ wave: 3, score: 2400, lives: 2 });
    expect(parseAntarikshSave({ wave: 0, score: 0, lives: 3 })).toBeNull();
    expect(parseAntarikshSave({ wave: 2, score: 10, lives: 0 })).toBeNull();
    expect(parseAntarikshSave({ wave: 2, score: -5, lives: 3 })).toBeNull();
    expect(parseAntarikshSave('nope')).toBeNull();
  });

  it('Mithai Match: the render layout matches, a hinted swap scores and spends a move, specials fire, hitches are dropped', () => {
    const { MithaiMatch } = mithaiModule;
    expect(MithaiMatch.render_length()).toBe(MithaiSlot.length);
    expect(MithaiMatch.level_count()).toBe(MITHAI_LEVELS);
    expect(mithaiLevelInfo(0).moves).toBeGreaterThan(mithaiLevelInfo(14).moves - 10);
    const game = new MithaiMatch();
    const render = new Float32Array(mithaiMemory.buffer, game.render_pointer(), MithaiSlot.length);
    game.start_level(0, 42);
    game.begin();
    const moves = game.moves_left();
    const hint = game.hint_move();
    expect(hint).toBeGreaterThanOrEqual(0);
    game.tap(Math.floor(hint / 64));
    expect(render[MithaiSlot.selected]).toBe(Math.floor(hint / 64));
    game.tap(hint % 64);
    for (let frame = 0; frame < 600 && game.phase() !== 1; frame++) game.advance(1 / 60);
    expect(game.moves_left()).toBe(moves - 1);
    expect(game.score()).toBeGreaterThan(0);
    for (let cell = 0; cell < 64; cell++) expect(render[MithaiSlot.cells + cell * MithaiSlot.cellStride]).toBeLessThan(6);
    // a striped sweet swapped with a wrapped one clears three rows and three columns
    game.debug_place(27, 0, 1);
    game.debug_place(28, 1, 3);
    const before = game.score();
    game.swipe(27, 1);
    for (let frame = 0; frame < 900 && game.phase() !== 1 && game.phase() !== 7 && game.phase() !== 8; frame++) game.advance(1 / 60);
    expect(game.score() - before).toBeGreaterThan(500);
    game.advance(5);
    expect(render[MithaiSlot.phaseSeconds]).toBeLessThan(0.2);
    game.free();
  });

  it('Mithai Match progress saves are validated', () => {
    const progress = emptyMithaiProgress();
    progress.unlocked = 3;
    progress.stars[0] = 3;
    expect(parseMithaiSave(progress)).toEqual(progress);
    expect(parseMithaiSave({ ...progress, unlocked: 20 })).toBeNull();
    expect(parseMithaiSave({ ...progress, stars: [4, ...progress.stars.slice(1)] })).toBeNull();
    expect(parseMithaiSave({ ...progress, best: [1] })).toBeNull();
    expect(parseMithaiSave(null)).toBeNull();
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

  it('Ludo: the real rules engine plays a whole 4-player game of computer players through the authority', () => {
    const engine = new ludoModule.Ludo(12345);
    let now = 0;
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const authority = TurnAuthority.createLocal(ludoSpec, engine, [0, 1, 2, 3].map(seat => ({ seat, name: `CPU ${seat}`, isBot: true })), { now: () => now, random, turnSeconds: 0 });
    const start = decodeSnapshot(authority.toState().snapshot)!;
    expect(start.phase).toBe(EnginePhase.AwaitRoll);
    expect(start.progress.flat().every(progress => progress === YARD)).toBe(true);
    for (let step = 0; step < 40000 && authority.state.phase === 'playing'; step++) { now += 800; authority.tick(); }
    const end = decodeSnapshot(authority.toState().snapshot)!;
    expect(authority.state.phase).toBe('finished');
    expect([...end.places].sort()).toEqual([1, 2, 3, 4]);
    // snapshot round trip into a fresh engine
    const copy = new ludoModule.Ludo(1);
    expect(copy.restore(Uint8Array.from(authority.state.snapshot!))).toBe(true);
    const restored = Array.from(copy.snapshot());
    expect(restored.map((value, index) => value === authority.state.snapshot![index] ? -1 : index).filter(index => index >= 0)).toEqual([]);
    engine.free(); copy.free();
  });
  it('Snakes & Ladders: the TypeScript boards match the Rust ones, and every board plays to the end through the authority', () => {
    expect(snakesModule.SnakesLadders.board_count()).toBe(BOARD_JUMPS.length);
    BOARD_JUMPS.forEach((jumps, board) => expect(Array.from(snakesModule.SnakesLadders.board_jumps(board))).toEqual(jumps.flat()));
    for (let board = 0; board < BOARD_JUMPS.length; board++) {
      const engine = new snakesModule.SnakesLadders(1000 + board);
      let now = 0;
      let seed = 11 + board;
      const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      const authority = TurnAuthority.createLocal(snakesSpec, engine, [0, 1, 2, 3].map(seat => ({ seat, name: `CPU ${seat}`, isBot: true })), { now: () => now, random, turnSeconds: 0, variant: board });
      const start = decodeSnakes(authority.toState().snapshot)!;
      expect(start.board).toBe(board);
      expect(start.phase).toBe(SnakesPhase.AwaitRoll);
      let jumpsSeen = 0;
      let lastMove = 0;
      for (let step = 0; step < 40000 && authority.state.phase === 'playing'; step++) {
        now += 700; authority.tick();
        const view = decodeSnakes(authority.state.snapshot)!;
        if (view.lastMove && view.lastMove.id !== lastMove) {
          lastMove = view.lastMove.id;
          expect(view.lastMove.to).toBe(jumpTarget(board, view.lastMove.landed));
          if (view.lastMove.to !== view.lastMove.landed) jumpsSeen++;
        }
      }
      const end = decodeSnakes(authority.toState().snapshot)!;
      expect(authority.state.phase).toBe('finished');
      expect([...end.places].sort()).toEqual([1, 2, 3, 4]);
      expect(jumpsSeen).toBeGreaterThan(0);
      expect(authority.state.events.some(event => event.kind === 'ladder' || event.kind === 'snake')).toBe(true);
      engine.free();
    }
  });
});
