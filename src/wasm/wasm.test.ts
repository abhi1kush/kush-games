// Integration tests through the real wasm bindings (the same .wasm files the site ships).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as breakoutModule from './breakout/breakout.js';
import * as checkersModule from './checkers/checkers.js';
import * as connectFourModule from './connect_four/connect_four.js';
import * as kushJumpModule from './kush_jump/kush_jump.js';
import * as antarikshModule from './antariksh_defenders/antariksh_defenders.js';
import * as mithaiModule from './mithai_match/mithai_match.js';
import * as ludoModule from './ludo/ludo.js';
import * as snakesModule from './snakes_ladders/snakes_ladders.js';
import * as fleetModule from './fleet_clash/fleet_clash.js';
import * as carromModule from './carrom/carrom.js';
import * as jalPathModule from './jal_path/jal_path.js';
import * as paaniPourModule from './paani_pour/paani_pour.js';
import * as emberLaneModule from './ember_lane/ember_lane.js';
import { decodeMoves } from '../games/checkers/engine';
import { RenderSlot } from '../games/breakout/engine';
import { Buttons, Phase as KushJumpPhase, RenderSlot as KushJumpSlot } from '../games/kushjump/engine';
import { Buttons as AntarikshButtons, RenderSlot as AntarikshSlot, SHIELD_COUNT, SHIELD_HEIGHT, SHIELD_WIDTH } from '../games/antariksh/engine';
import { parseAntarikshSave } from '../games/antariksh/save';
import { LEVEL_COUNT as MITHAI_LEVELS, levelInfo as mithaiLevelInfo, RenderSlot as MithaiSlot } from '../games/mithai/engine';
import { emptyMithaiProgress, parseMithaiSave } from '../games/mithai/save';
import { decodeSnapshot, EnginePhase, YARD } from '../games/ludo/engine';
import { TurnAuthority } from '../games/online/turnRoom/authority';
import { ludoSpec } from '../games/ludo/spec';
import { BOARD_JUMPS, decodeSnapshot as decodeSnakes, EnginePhase as SnakesPhase, jumpTarget } from '../games/snakesladders/engine';
import { snakesSpec } from '../games/snakesladders/spec';
import { computerShot, replayLocal, type LocalGame } from '../games/fleetclash/local';
import { replay as replayCarrom, shotText as carromShotText } from '../games/carrom/engine';
import { carromRules } from '../games/carrom/online';

const wasmBytes = (name: string) => readFileSync(new URL(`./${name}/${name}_bg.wasm`, import.meta.url));
let breakoutMemory: WebAssembly.Memory;
let kushJumpMemory: WebAssembly.Memory;
let antarikshMemory: WebAssembly.Memory;
let mithaiMemory: WebAssembly.Memory;

let jalPathMemory: WebAssembly.Memory;
let paaniPourMemory: WebAssembly.Memory;
let emberLaneMemory: WebAssembly.Memory;

beforeAll(() => {
  breakoutMemory = breakoutModule.initSync({ module: wasmBytes('breakout') }).memory;
  checkersModule.initSync({ module: wasmBytes('checkers') });
  connectFourModule.initSync({ module: wasmBytes('connect_four') });
  kushJumpMemory = kushJumpModule.initSync({ module: wasmBytes('kush_jump') }).memory;
  antarikshMemory = antarikshModule.initSync({ module: wasmBytes('antariksh_defenders') }).memory;
  mithaiMemory = mithaiModule.initSync({ module: wasmBytes('mithai_match') }).memory;
  ludoModule.initSync({ module: wasmBytes('ludo') });
  snakesModule.initSync({ module: wasmBytes('snakes_ladders') });
  fleetModule.initSync({ module: wasmBytes('fleet_clash') });
  carromModule.initSync({ module: wasmBytes('carrom') });
  jalPathMemory = jalPathModule.initSync({ module: wasmBytes('jal_path') }).memory;
  paaniPourMemory = paaniPourModule.initSync({ module: wasmBytes('paani_pour') }).memory;
  emberLaneMemory = emberLaneModule.initSync({ module: wasmBytes('ember_lane') }).memory;
});

describe('wasm bindings', () => {
  it('every game .wasm stays small (< 40 KB raw)', () => {
    for (const name of ['breakout', 'checkers', 'connect_four', 'kush_jump', 'antariksh_defenders', 'mithai_match', 'ludo', 'snakes_ladders', 'fleet_clash', 'carrom', 'jal_path', 'paani_pour', 'ember_lane']) expect(wasmBytes(name).length, name).toBeLessThan(40 * 1024);
  });

  it('Jal Path: tiles read zero-copy (8 bytes each), a solved board waters all three houses, an unsolved one runs dry', () => {
    expect(jalPathModule.JalPath.level_count()).toBe(18);
    for (let level = 0; level < 18; level += 5) {
      const game = new jalPathModule.JalPath(level);
      const cells = game.width() * game.height();
      const bytes = () => new Uint8Array(jalPathMemory.buffer, game.tiles_ptr(), cells * 8);
      const fills = () => new Float32Array(jalPathMemory.buffer, game.tiles_ptr(), cells * 2);
      expect(Array.from({ length: cells }, (_, cell) => bytes()[cell * 8 + 1]).some(kind => kind === 1)).toBe(true);
      const ports = game.ports();
      expect(ports.length).toBe(8);
      game.debug_solve();
      expect(game.connected_houses()).toBe(3);
      expect(game.open_valve()).toBe(true);
      for (let step = 0; step < 2400 && game.phase() === 1; step++) game.advance(50);
      expect(game.phase(), `level ${level + 1}`).toBe(2);
      expect(game.houses_full()).toBe(3);
      expect(Array.from({ length: cells }, (_, cell) => fills()[cell * 2 + 1]).some(fill => fill >= 1)).toBe(true);
      expect(game.stars()).toBeGreaterThanOrEqual(1);
      game.free();
    }
    const hinted = new jalPathModule.JalPath(3);
    const cell = hinted.hint_cell();
    expect(cell).toBeGreaterThanOrEqual(0);
    const result = hinted.hint();
    expect(result >> 2).toBe(cell);
    expect(hinted.debug_solution(cell)).toBe(new Uint8Array(jalPathMemory.buffer, hinted.tiles_ptr(), 64 * 8)[cell * 8]);
    expect(hinted.hints_left()).toBe(2);
    hinted.free();
    const dry = new jalPathModule.JalPath(0);
    dry.open_valve();
    for (let step = 0; step < 4000 && dry.phase() === 1; step++) dry.advance(50);
    expect(dry.phase()).toBe(3);
    expect(dry.tank()).toBe(0);
    dry.free();
  });

  it('Paani Pour: tubes read zero-copy, pours follow the top-colour rule, undo restores, the solver finishes a level', () => {
    expect(paaniPourModule.PaaniPour.level_count()).toBe(20);
    const game = new paaniPourModule.PaaniPour(0);
    const tubes = game.tube_count();
    expect(tubes).toBe(game.colour_count() + 2);
    const layers = () => Array.from(new Uint8Array(paaniPourMemory.buffer, game.layers_ptr(), tubes * 4));
    const start = layers();
    expect(start.filter(colour => colour === 1)).toHaveLength(4);
    expect(game.can_pour(tubes - 1, 0)).toBe(false); // empty source
    const hint = game.peek_hint();
    const amount = game.pour(hint >> 4, hint & 15);
    expect(amount).toBeGreaterThan(0);
    expect(layers()).not.toEqual(start);
    expect(game.undo() & 255).toBe(hint);
    expect(layers()).toEqual(start);
    expect(game.debug_solve()).toBe(true);
    expect(game.is_solved()).toBe(true);
    expect(game.stars()).toBe(3);
    expect(game.pours()).toBe(game.par());
    game.free();
  });

  it('Ember Lane: lights and rats read zero-copy, the dark is lethal and death returns to the checkpoint', () => {
    const game = new emberLaneModule.EmberLane();
    const lights = new Float32Array(emberLaneMemory.buffer, game.lights_ptr(), game.light_count() * 8);
    expect(lights[2]).toBeGreaterThan(100); // the hearth's radius
    expect(game.rat_count()).toBeGreaterThan(100);
    expect(game.player_lit()).toBe(true);
    game.debug_warp(1);
    expect(game.checkpoint()).toBe(1);
    game.set_input(2);
    for (let step = 0; step < 60 * 12 && game.deaths() === 0; step++) game.advance(1000 / 60);
    expect(game.deaths()).toBe(1);
    game.set_input(0);
    for (let step = 0; step < 60 * 3; step++) game.advance(1000 / 60);
    expect(Math.abs(game.player_x() - 990)).toBeLessThan(5);
    expect(game.state()).not.toBe(5);
    game.free();
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
  it('Fleet Clash: random fleets, shots and every computer level win a whole local game', () => {
    const board = new fleetModule.FleetBoard();
    board.randomize(99);
    expect(board.is_complete()).toBe(true);
    const code = Array.from(board.code());
    expect(fleetModule.FleetBoard.from_code(Uint8Array.from(code))).toBeTruthy();
    expect(fleetModule.FleetBoard.from_code(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeUndefined();
    board.free();
    for (const level of [0, 1, 2]) {
      const fleets = [1, 2].map(seed => { const fleet = new fleetModule.FleetBoard(); fleet.randomize(seed * 31 + level); const value = Array.from(fleet.code()); fleet.free(); return value; });
      // the human fires at every square in order; the computer plays its turns
      const game: LocalGame = { mode: 'computer', level, first: 0, names: ['You', 'Computer'], fleets: [fleets[0], fleets[1]], shots: [], seed: 1234 + level };
      let state = replayLocal(game);
      let next = 0;
      while (state.winner === null && game.shots.length < 200) {
        game.shots.push(state.turn === 0 ? next++ : computerShot(game, state));
        state = replayLocal(game);
      }
      expect(state.winner).not.toBeNull();
      const computerShots = state.seas[1].shots;
      expect(new Set(game.shots.filter((_, index) => index % 2 === 1)).size).toBe(computerShots);
    }
  });

  it('Carrom: computer players finish a game as a shot list that replays identically and passes the online rules', () => {
    const board = new carromModule.Carrom();
    const shots: string[] = [];
    while (board.winner() === 255 && shots.length < 300) {
      const [x, aimX, aimY, power] = board.ai_shot(2, shots.length + 7);
      const text = carromShotText({ x, aimX, aimY, power });
      // the rounded shot is what gets played (and sent online)
      if (!carromRules.legalMove(shots, text)) { const fallback = carromShotText({ x: 500, aimX: 500, aimY: 500, power: 600 }); expect(carromRules.legalMove(shots, fallback)).toBe(fallback); shots.push(fallback); }
      else shots.push(text);
      const shot = shots[shots.length - 1].slice(1).split('.').map(Number);
      expect(board.shoot(shot[0], shot[1], shot[2], shot[3])).toBe(true);
      board.settle();
    }
    expect(board.winner()).not.toBe(255);
    expect(carromRules.isLegalLine(shots)).toBe(true);
    expect(carromRules.isOverOnBoard(shots)).toBe(true);
    const again = replayCarrom(shots)!;
    expect([again.winner(), again.points(), again.pocketed(0), again.pocketed(1)]).toEqual([board.winner(), board.points(), board.pocketed(0), board.pocketed(1)]);
    expect(carromRules.isLegalLine([...shots.slice(0, 3), 's100.500.500.500'])).toBe(false); // striker off the baseline
    again.free(); board.free();
  });
});
