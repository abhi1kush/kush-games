/**
 * The carrom table: one wasm board that plays the shot list (animated, with the real physics), the canvas, and the
 * controls to place the striker and shoot. Used by local games (vs computer, two players) and online play.
 *
 * Lag protections: a frame gap over 100 ms (tab in the background, a hiccup) counts as one normal frame instead of a
 * burst of catch-up; at most MAX_STEPS_PER_FRAME fixed steps run per frame; and nothing is redrawn while the board
 * rests unless the aim or striker changes.
 */
import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { drawFrame, paintBoard, toBoard, type Overlay, type View } from './board';
import {
  aimContact, BASELINE_MAX, BASELINE_MIN, BASELINE_Y, bodiesView, Carrom, frameSteps, type FrameClock, lastOutcome, type Outcome, PHASE_AIM, PHASE_MOVING, type Shot, shotText,
  startShot, STRIKER_R,
} from './engine';
import type { CarromSound } from './sounds';

export interface TableState {
  turn: 0 | 1; phase: number; winner: 0 | 1 | null; points: number; pocketed: [number, number]; due: [number, number];
  queenState: number; queenOwner: 0 | 1; applied: number; animating: boolean;
}

const PULSE_MS = 1400;
const FULL_PULL = 230; // board units of pull-back for full power
const GLOW = ['#2ec4b6', '#e50914'] as const;

function readState(game: Carrom, applied: number, animating: boolean): TableState {
  const winner = game.winner();
  return {
    turn: game.turn() as 0 | 1, phase: game.phase(), winner: winner === 255 ? null : (winner as 0 | 1), points: game.points(), pocketed: [game.pocketed(0), game.pocketed(1)],
    due: [game.due(0), game.due(1)], queenState: game.queen_state(), queenOwner: game.queen_owner() as 0 | 1, applied, animating,
  };
}

type Drag = { mode: 'pending' | 'place' | 'aim'; startX: number; startY: number; id: number } | null;

export function CarromTable({ shots, controllable, flipped, onShoot, onState, onOutcome, sound, click, preview, testId = 'carrom' }: {
  shots: readonly string[];
  /** Players this device shoots for (both for pass and play). */
  controllable: readonly (0 | 1)[];
  flipped: boolean;
  onShoot(text: string): void;
  onState(state: TableState): void;
  /** A shot finished animating (`index` in the list). Not called for shots replayed instantly. */
  onOutcome?(outcome: Outcome, index: number): void;
  sound(kind: CarromSound): void;
  click(strength: number, cushion: boolean): void;
  /** The computer lining up its shot (shown as an aim line). */
  preview?: Shot | null;
  testId?: string;
}) {
  const gameRef = useRef<Carrom | null>(null);
  if (!gameRef.current) gameRef.current = new Carrom();
  const game = gameRef.current;
  const appliedRef = useRef<string[]>([]);
  const animatingRef = useRef(false);
  const [state, setState] = useState<TableState>(() => readState(game, 0, false));
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);
  const view: View = { size, ratio: Math.min(2, window.devicePixelRatio || 1), flipped };
  const viewRef = useRef(view); viewRef.current = view;
  const boardImage = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const strikerX = useRef(500);
  const aim = useRef<{ dx: number; dy: number; power: number } | null>(null);
  const keyAim = useRef<{ angle: number; charging: number | null } | null>(null);
  const drag = useRef<Drag>(null);
  const [, setUiTick] = useState(0);
  const props = useRef({ onShoot, onState, onOutcome, sound, click, controllable, preview });
  props.current = { onShoot, onState, onOutcome, sound, click, controllable, preview };

  useEffect(() => () => { gameRef.current?.free(); gameRef.current = null; }, []);

  const publish = useCallback(() => {
    const next = readState(game, appliedRef.current.length, animatingRef.current);
    setState(next);
    props.current.onState(next);
  }, [game]);

  const canAim = useCallback(() => {
    const current = readState(game, appliedRef.current.length, animatingRef.current);
    return current.phase === PHASE_AIM && !current.animating && props.current.controllable.includes(current.turn) && !props.current.preview;
  }, [game]);

  // ---------- drawing ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const v = viewRef.current;
    if (!canvas || v.size <= 0) return;
    const pixels = Math.round(v.size * v.ratio);
    if (canvas.width !== pixels) { canvas.width = pixels; canvas.height = pixels; }
    const key = `${pixels}`;
    if (boardImage.current?.key !== key) boardImage.current = { key, canvas: paintBoard(v) };
    const bodies = bodiesView(game);
    const overlay: Overlay = {};
    const turn = game.turn() as 0 | 1;
    if (game.phase() === PHASE_AIM) {
      const ai = props.current.preview;
      const x = ai ? ai.x : strikerX.current;
      const y = BASELINE_Y[turn];
      overlay.striker = { x, y, bad: !game.can_place(x), glow: GLOW[turn], pulse: pulse.current ? Math.min(1, (performance.now() - pulse.current.start) / PULSE_MS) : null };
      let direction: { dx: number; dy: number; power: number } | null = aim.current;
      if (ai) { const length = Math.hypot(ai.aimX - ai.x, ai.aimY - y) || 1; direction = { dx: (ai.aimX - ai.x) / length, dy: (ai.aimY - y) / length, power: ai.power / 1000 }; }
      else if (!direction && keyAim.current) direction = { dx: Math.sin(keyAim.current.angle), dy: -Math.cos(keyAim.current.angle) * (turn === 0 ? 1 : -1), power: keyAim.current.charging ?? 0 };
      if (direction) {
        const contact = aimContact(bodies, x, y, direction.dx, direction.dy);
        overlay.aim = { fromX: x, fromY: y, toX: contact.x, toY: contact.y, contact: contact.kind === 'disc' ? contact : null, power: direction.power };
      }
    }
    drawFrame(canvas.getContext('2d')!, boardImage.current.canvas, v, bodies, overlay);
  }, [game]);

  const startPulse = useCallback(() => {
    if (game.phase() !== PHASE_AIM) return;
    if (pulse.current) cancelAnimationFrame(pulse.current.frame);
    pulseCount.current += 1;
    const current = { start: performance.now(), frame: 0 };
    pulse.current = current;
    const tick = () => {
      if (pulse.current !== current) return;
      if (game.phase() !== PHASE_AIM || performance.now() - current.start > PULSE_MS) { pulse.current = null; draw(); return; }
      draw();
      current.frame = requestAnimationFrame(tick);
    };
    current.frame = requestAnimationFrame(tick);
  }, [game, draw]);

  // ---------- playing the shot list ----------
  const frame = useRef(0);
  // turn pulse: every new turn (after each shot, incl. extra turns, and when a board loads) rings the striker
  const pulse = useRef<{ start: number; frame: number } | null>(null);
  const pulseCount = useRef(0);
  /** Frames drawn for each animated shot (test hook: every shot must play over many frames). */
  const framesRef = useRef<number[]>([]);
  const sync = useCallback(() => {
    if (animatingRef.current) return;
    const target = shotsRef.current;
    const applied = appliedRef.current;
    const isExtension = target.length >= applied.length && applied.every((text, index) => target[index] === text);
    if (!isExtension) {
      // a different game (new game, rematch, restored save): rebuild instantly
      const valid: string[] = [];
      game.reset();
      for (const text of target) { if (!startShot(game, text)) break; game.settle(); valid.push(text); }
      appliedRef.current = valid;
      strikerX.current = bodiesView(game)[0];
      aim.current = null; keyAim.current = null;
      publish(); draw(); startPulse();
      return;
    }
    if (target.length === applied.length) return;
    const text = target[applied.length];
    if (!startShot(game, text)) { appliedRef.current = [...applied, text]; publish(); return; } // an illegal shot is skipped
    animatingRef.current = true;
    framesRef.current.push(0);
    aim.current = null; keyAim.current = null;
    props.current.sound('flick');
    publish();
    const clock: FrameClock = { last: null, carry: 0 };
    const run = (now: number) => {
      const moving = game.advance(frameSteps(clock, now));
      const impacts = game.take_impacts();
      const coin = impacts & 0xfff, cushion = (impacts >> 12) & 0xfff, pockets = impacts >>> 24;
      if (coin) props.current.click(coin, false);
      else if (cushion) props.current.click(cushion, true);
      if (pockets) props.current.sound('pocket');
      draw();
      framesRef.current[framesRef.current.length - 1] += 1;
      if (moving && game.phase() === PHASE_MOVING) { frame.current = requestAnimationFrame(run); return; }
      animatingRef.current = false;
      appliedRef.current = [...appliedRef.current, text];
      strikerX.current = bodiesView(game)[0];
      const outcome = lastOutcome(game);
      props.current.onOutcome?.(outcome, appliedRef.current.length - 1);
      publish(); draw();
      if (shotsRef.current.length === appliedRef.current.length) startPulse();
      sync();
    };
    frame.current = requestAnimationFrame(run);
  }, [game, publish, draw, startPulse]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => { sync(); }, [shots, sync]);
  useEffect(() => { publish(); startPulse(); }, [publish, startPulse]);
  useEffect(() => () => { if (pulse.current) cancelAnimationFrame(pulse.current.frame); }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // ---------- size ----------
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => setSize(Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight || wrap.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { draw(); }, [size, flipped, preview, state, draw]);

  // ---------- controls ----------
  const fire = (dx: number, dy: number, power: number) => {
    const turn = game.turn() as 0 | 1;
    const x = Math.round(strikerX.current);
    if (!game.can_place(x)) { props.current.sound('foul'); return; }
    const shot = { x, aimX: x + dx * 400, aimY: BASELINE_Y[turn] + dy * 400, power: Math.max(1, Math.round(power * 1000)) };
    aim.current = null; keyAim.current = null;
    props.current.onShoot(shotText(shot));
  };
  const pointToBoard = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return toBoard({ ...viewRef.current, size: rect.width }, event.clientX - rect.left, event.clientY - rect.top);
  };
  const moveStriker = (x: number) => {
    const clamped = Math.max(BASELINE_MIN, Math.min(BASELINE_MAX, x));
    if (Math.round(clamped / 12) !== Math.round(strikerX.current / 12)) props.current.sound('place');
    strikerX.current = clamped;
    draw(); setUiTick(tick => tick + 1);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canAim() || drag.current) return;
    event.preventDefault();
    const [x, y] = pointToBoard(event);
    const turn = game.turn() as 0 | 1;
    const onStriker = Math.hypot(x - strikerX.current, y - BASELINE_Y[turn]) < STRIKER_R * 1.9;
    drag.current = { mode: onStriker ? 'pending' : 'aim', startX: x, startY: y, id: event.pointerId };
    keyAim.current = null;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    if (!onStriker) updateAim(x, y);
  };
  const updateAim = (x: number, y: number) => {
    const turn = game.turn() as 0 | 1;
    const sx = strikerX.current, sy = BASELINE_Y[turn];
    const pull = Math.hypot(sx - x, sy - y);
    if (pull < 6) { aim.current = null; draw(); return; }
    aim.current = { dx: (sx - x) / pull, dy: (sy - y) / pull, power: Math.min(1, Math.max(0, (pull - 8) / FULL_PULL)) };
    draw(); setUiTick(tick => tick + 1);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const [x, y] = pointToBoard(event);
    if (current.mode === 'pending') {
      const dx = x - current.startX, dy = y - current.startY;
      if (Math.hypot(dx, dy) < 8) return;
      current.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'place' : 'aim';
    }
    if (current.mode === 'place') moveStriker(strikerX.current + (x - current.startX)), current.startX = x;
    else updateAim(x, y);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    const value = aim.current;
    if (current.mode === 'aim' && value && value.power >= 0.04 && canAim()) fire(value.dx, value.dy, value.power);
    else { aim.current = null; draw(); setUiTick(tick => tick + 1); }
  };
  const onPointerCancel = () => { drag.current = null; aim.current = null; draw(); };

  const chargeFrame = useRef(0);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!canAim()) return;
    const turn = game.turn() as 0 | 1;
    const sideways = flipped ? -1 : 1;
    if (event.key === 'ArrowLeft' || event.key === 'a') { moveStriker(strikerX.current - (event.shiftKey ? 24 : 6) * sideways); event.preventDefault(); }
    else if (event.key === 'ArrowRight' || event.key === 'd') { moveStriker(strikerX.current + (event.shiftKey ? 24 : 6) * sideways); event.preventDefault(); }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'w' || event.key === 's') {
      const delta = (event.key === 'ArrowUp' || event.key === 'w' ? -1 : 1) * (event.shiftKey ? 0.08 : 0.02) * (turn === 0 ? 1 : -1) * sideways;
      keyAim.current = { angle: Math.max(-1.45, Math.min(1.45, (keyAim.current?.angle ?? 0) + delta)), charging: keyAim.current?.charging ?? null };
      aim.current = null; draw(); setUiTick(tick => tick + 1); event.preventDefault();
    } else if (event.key === ' ' && !event.repeat) {
      event.preventDefault();
      keyAim.current = { angle: keyAim.current?.angle ?? 0, charging: 0 };
      const start = performance.now();
      const charge = (now: number) => {
        if (!keyAim.current || keyAim.current.charging === null) return;
        const t = ((now - start) / 1300) % 2;
        keyAim.current.charging = t < 1 ? t : 2 - t; // the meter rises and falls until you let go
        draw(); setUiTick(tick => tick + 1);
        chargeFrame.current = requestAnimationFrame(charge);
      };
      chargeFrame.current = requestAnimationFrame(charge);
    }
  };
  const onKeyUp = (event: ReactKeyboardEvent) => {
    if (event.key !== ' ' || !keyAim.current || keyAim.current.charging === null) return;
    cancelAnimationFrame(chargeFrame.current);
    const { angle, charging } = keyAim.current;
    const turn = game.turn() as 0 | 1;
    if (charging >= 0.04 && canAim()) fire(Math.sin(angle), -Math.cos(angle) * (turn === 0 ? 1 : -1), charging);
    else keyAim.current = { angle, charging: null };
  };

  // test hook (only with ?carromTest in the URL)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('carromTest')) return;
    const hooks = {
      state: () => readState(game, appliedRef.current.length, animatingRef.current),
      bodies: () => Array.from(bodiesView(game)),
      put: (index: number, x: number, y: number, on = true) => { game.debug_put(index, x, y, on); draw(); },
      shoot: (x: number, aimX: number, aimY: number, power: number) => { strikerX.current = x; props.current.onShoot(shotText({ x, aimX, aimY, power })); },
      striker: () => strikerX.current,
      canPlace: (x: number) => game.can_place(x),
      frames: () => [...framesRef.current],
      pulses: () => pulseCount.current,
    };
    (window as unknown as Record<string, unknown>)[`__${testId}Test`] = hooks;
  }, [game, draw, testId]);

  const value = aim.current ?? (keyAim.current?.charging != null ? { power: keyAim.current.charging } : null);
  const power = props.current.preview ? props.current.preview.power / 1000 : value?.power ?? 0;
  const canShoot = state.phase === PHASE_AIM && !state.animating && controllable.includes(state.turn) && !preview;
  return (
    <div className="carrom-table" data-testid={testId} data-turn={state.turn} data-phase={state.phase} data-shots={state.applied} data-animating={state.animating}
      data-winner={state.winner ?? ''} data-can-shoot={canShoot} data-flipped={flipped}>
      <div className="carrom-table__board" ref={wrapRef}>
        <canvas ref={canvasRef} className={`carrom-canvas${canShoot ? ' can-shoot' : ''}`} style={{ width: size, height: size }} tabIndex={0}
          aria-label="Carrom board. Drag the striker sideways to place it; pull back from it and let go to shoot. Keys: arrows move and aim, hold Space for power."
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onKeyDown={onKeyDown} onKeyUp={onKeyUp}
          data-testid={`${testId}-canvas`} />
      </div>
      <div className="carrom-controls">
        <input type="range" className="carrom-slider" min={BASELINE_MIN} max={BASELINE_MAX} step={1} value={Math.round(props.current.preview?.x ?? strikerX.current)} disabled={!canShoot}
          style={flipped ? { transform: 'scaleX(-1)' } : undefined} aria-label="Striker position" data-testid={`${testId}-slider`}
          onChange={event => moveStriker(Number(event.target.value))} />
        <div className="carrom-power" aria-label="Power" data-testid={`${testId}-power`} data-power={Math.round(power * 100)}>
          <span style={{ width: `${Math.round(power * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
