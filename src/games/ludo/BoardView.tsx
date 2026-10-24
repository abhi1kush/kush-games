/**
 * The board: a canvas (static board image + tokens, redrawn only when something changes or animates) with DOM
 * overlays for the yards (names, strikes, places), the dice and the tokens you can move.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { drawBoard, drawToken, toPixels } from './board';
import { Dice } from '../online/turnRoom/Dice';
import type { TurnBoardProps } from '../online/turnRoom/TurnGameApp';
import { EnginePhase, type GameView, HOME, hopPath, MAX_STRIKES, placeText, REMOVED, rotatePoint, SEATS, tokenPoint, YARD, yardCentre } from './engine';

const HOP_MS = 150;
const CAPTURE_MS = 520;

interface Animation {
  seat: number;
  token: number;
  path: [number, number][];
  startedAt: number;
  captures: { seat: number; token: number; from: [number, number]; to: [number, number] }[];
  captureAt: number;
  endsAt: number;
  reachesHome: boolean;
  lastStep: number;
  captureSounded: boolean;
}

export function BoardView({ view, players, rotation, canAct, hostId, myId, clock, onRoll, onMove, sound }: TurnBoardProps<GameView>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardImage = useRef<HTMLCanvasElement | null>(null);
  const [pixels, setPixels] = useState(0);
  const shown = useRef<{ progress: number[][]; moveId: number } | null>(null);
  const animation = useRef<Animation | null>(null);
  const frame = useRef(0);
  const latest = useRef({ view, rotation, pixels, sound });
  latest.current = { view, rotation, pixels, sound };
  const [isAnimating, setIsAnimating] = useState(false);

  // canvas size follows the element (device pixels, capped at 2×)
  useLayoutEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const measure = () => setPixels(Math.round(element.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pixels) return;
    const image = boardImage.current ?? document.createElement('canvas');
    drawBoard(image, pixels, rotation);
    boardImage.current = image;
    paint(performance.now());
  }, [pixels, rotation]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Draw the board and every token at `time` (mid-animation positions if a move is playing). */
  function paint(time: number): boolean {
    const canvas = canvasRef.current, image = boardImage.current;
    const { view: current, rotation: turns, pixels: size } = latest.current;
    if (!canvas || !image || !size) return false;
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const unit = size / 15;
    const active = animation.current;
    const pieces: { x: number; y: number; seat: number; lift: number; scale: number; alpha: number }[] = [];
    const cells = new Map<string, { seat: number; token: number }[]>();
    for (let seat = 0; seat < 4; seat++) {
      if (!(current.joined & (1 << seat))) continue;
      for (let token = 0; token < 4; token++) {
        const progress = current.progress[seat][token];
        if (progress === REMOVED) continue;
        if (active && active.seat === seat && active.token === token) continue;
        if (active && active.captures.some(capture => capture.seat === seat && capture.token === token)) continue;
        if (progress === YARD || progress === HOME) { const [x, y] = toPixels(tokenPoint(seat, token, progress), unit, turns); pieces.push({ x, y, seat, lift: 0, scale: progress === HOME ? 0.7 : 1, alpha: 1 }); continue; }
        const key = tokenPoint(seat, token, progress).join(',');
        cells.set(key, [...(cells.get(key) ?? []), { seat, token }]);
      }
    }
    // tokens sharing a square spread out a little
    for (const [key, group] of cells) {
      const [baseX, baseY] = key.split(',').map(Number);
      group.forEach(({ seat }, index) => {
        const spread = group.length === 1 ? [0, 0] : [((index % 2) - 0.5) * 0.36, (group.length > 2 ? (Math.floor(index / 2) - 0.5) * 0.36 : 0)];
        const [x, y] = toPixels([baseX + spread[0], baseY + spread[1]], unit, turns);
        pieces.push({ x, y, seat, lift: 0, scale: group.length === 1 ? 1 : 0.78, alpha: 1 });
      });
    }
    let running = false;
    if (active) {
      // rAF timestamps can be slightly older than performance.now() when the move started
      const elapsed = Math.max(0, time - active.startedAt);
      const step = Math.max(0, Math.min(active.path.length - 1, Math.floor(elapsed / HOP_MS)));
      if (elapsed < active.path.length * HOP_MS) {
        running = true;
        const from = step === 0 ? active.path[0] : active.path[step - 1];
        const to = active.path[step];
        const fraction = Math.min(1, (elapsed - step * HOP_MS) / HOP_MS);
        const point: [number, number] = step === 0 && active.path.length === 1 ? to : [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
        const [x, y] = toPixels(point, unit, turns);
        pieces.push({ x, y, seat: active.seat, lift: Math.sin(fraction * Math.PI), scale: 1, alpha: 1 });
        if (step > active.lastStep) { active.lastStep = step; latest.current.sound('hop', step); }
      } else {
        const end = active.path[active.path.length - 1];
        const [x, y] = toPixels(end, unit, turns);
        pieces.push({ x, y, seat: active.seat, lift: 0, scale: active.reachesHome ? 0.7 : 1, alpha: 1 });
      }
      for (const capture of active.captures) {
        const progress = (time - active.captureAt) / CAPTURE_MS;
        if (progress < 0) { const [x, y] = toPixels(capture.from, unit, turns); pieces.push({ x, y, seat: capture.seat, lift: 0, scale: 0.9, alpha: 1 }); running = true; continue; }
        if (!active.captureSounded) { active.captureSounded = true; latest.current.sound('capture'); }
        if (progress < 1) {
          running = true;
          const eased = 1 - (1 - progress) ** 3;
          const point: [number, number] = [capture.from[0] + (capture.to[0] - capture.from[0]) * eased, capture.from[1] + (capture.to[1] - capture.from[1]) * eased];
          const [x, y] = toPixels(point, unit, turns);
          pieces.push({ x, y, seat: capture.seat, lift: Math.sin(progress * Math.PI) * 1.4, scale: 1, alpha: 0.55 + 0.45 * progress });
          // burst where the token was caught
          const [burstX, burstY] = toPixels(capture.from, unit, turns);
          context.strokeStyle = `rgba(255,255,255,${(1 - progress).toFixed(3)})`;
          context.lineWidth = unit * 0.12 * (1 - progress);
          context.beginPath(); context.arc(burstX, burstY, unit * (0.3 + progress * 0.9), 0, Math.PI * 2); context.stroke();
          context.strokeStyle = SEATS[active.seat].color;
          context.globalAlpha = 1 - progress;
          context.beginPath(); context.arc(burstX, burstY, unit * (0.2 + progress * 0.6), 0, Math.PI * 2); context.stroke();
          context.globalAlpha = 1;
        } else { const [x, y] = toPixels(capture.to, unit, turns); pieces.push({ x, y, seat: capture.seat, lift: 0, scale: 1, alpha: 1 }); }
      }
      if (time >= active.endsAt) {
        if (active.reachesHome) latest.current.sound('home');
        animation.current = null;
        running = false;
      }
    }
    pieces.sort((a, b) => a.y - b.y);
    for (const piece of pieces) drawToken(context, piece.x, piece.y, unit * 0.4 * piece.scale, piece.seat, piece.lift, piece.alpha);
    return running;
  }

  function loop(time: number) {
    frame.current = 0;
    if (paint(time)) frame.current = requestAnimationFrame(loop);
    else setIsAnimating(false);
  }

  // a new snapshot: animate the last move if it's new, otherwise just repaint once
  useEffect(() => {
    const previous = shown.current;
    const move = view.lastMove;
    shown.current = { progress: view.progress.map(row => [...row]), moveId: move?.id ?? 0 };
    if (previous && move && move.id !== previous.moveId && previous.progress[move.seat][move.token] === move.from && move.to !== move.from) {
      const now = performance.now();
      const path = move.from === YARD ? [tokenPoint(move.seat, move.token, YARD), ...hopPath(move.seat, move.token, move.from, move.to)] : [tokenPoint(move.seat, move.token, move.from), ...hopPath(move.seat, move.token, move.from, move.to)];
      const hopEnd = now + path.length * HOP_MS;
      animation.current = {
        seat: move.seat, token: move.token, path, startedAt: now, lastStep: 0, captureSounded: false, reachesHome: move.to === HOME,
        captures: move.captures.map(capture => ({ seat: capture.seat, token: capture.token, from: tokenPoint(capture.seat, capture.token, capture.from), to: tokenPoint(capture.seat, capture.token, YARD) })),
        captureAt: hopEnd, endsAt: hopEnd + (move.captures.length ? CAPTURE_MS : 0),
      };
      setIsAnimating(true);
      if (!frame.current) frame.current = requestAnimationFrame(loop);
      return;
    }
    if (!animation.current) paint(performance.now());
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const percent = (point: [number, number]) => {
    const [x, y] = rotatePoint(point[0], point[1], rotation);
    return { left: `${(x / 15) * 100}%`, top: `${(y / 15) * 100}%` };
  };
  const seatPlayer = (seat: number) => players.find(player => player.seat === seat);
  const currentPlayer = seatPlayer(view.current);
  const isPlaying = view.phase === EnginePhase.AwaitRoll || view.phase === EnginePhase.AwaitMove || view.phase === EnginePhase.NoMove;
  const canRoll = canAct && view.phase === EnginePhase.AwaitRoll;
  const canMove = canAct && view.phase === EnginePhase.AwaitMove && !isAnimating;

  return (
    <div className="ludo-board" ref={wrapRef} data-testid="ludo-board" data-current={view.current} data-phase={view.phase}>
      <canvas ref={canvasRef} className="ludo-board__canvas" aria-label="Ludo board" />
      {[0, 1, 2, 3].map(seat => {
        const player = seatPlayer(seat);
        const centre = percent(yardCentre(seat));
        const isJoined = (view.joined & (1 << seat)) !== 0;
        const isOut = player ? ['left', 'kicked', 'forfeited'].includes(player.status) : isJoined;
        const strikes = view.strikes[seat];
        const place = view.places[seat];
        const isTurn = isPlaying && view.current === seat;
        return (
          <div key={seat} className={`ludo-yard${isTurn ? ' is-turn' : ''}${!isJoined ? ' is-empty' : ''}${isOut ? ' is-out' : ''}`} style={{ ...centre, ['--seat' as string]: SEATS[seat].color }}
            data-testid={`ludo-yard-${seat}`}>
            {isJoined && (
              <span className="ludo-yard__label">
                {player?.clientId === hostId && <b className="ludo-yard__crown" title="Host">♛</b>}
                <span className="ludo-yard__name">{player?.name ?? SEATS[seat].name}{player && player.clientId === myId ? ' (you)' : ''}</span>
                {player && !player.connected && !player.isBot && !isOut && <span className="ludo-yard__offline" title="Disconnected">⏳</span>}
              </span>
            )}
            {isJoined && strikes > 0 && !isOut && <span className="ludo-yard__strikes" data-testid={`ludo-strikes-${seat}`}>{'⚠'.repeat(1)} {strikes}/{MAX_STRIKES}</span>}
            {place > 0 && <span className={`ludo-yard__place ludo-yard__place--${place}`} data-testid={`ludo-place-${seat}`}>{placeText(place)}</span>}
            {isOut && player && <span className="ludo-yard__out">{player.status === 'left' ? 'Left' : player.status === 'kicked' ? 'Removed' : 'Out — 3 missed turns'}</span>}
          </div>
        );
      })}
      {isPlaying && (
        <div className="ludo-board__dice" style={percent(yardCentre(view.current))}>
          <Dice value={view.dice || 1} rollId={view.rollId} canRoll={canRoll} onRoll={onRoll} clock={clock} color={SEATS[view.current].color}
            isWaiting={view.phase === EnginePhase.AwaitRoll} testPrefix="ludo" label={canRoll ? 'Roll the dice' : `${currentPlayer?.name ?? SEATS[view.current].name}’s dice`} />
        </div>
      )}
      {canMove && [0, 1, 2, 3].filter(token => view.legalMask & (1 << token)).map(token => {
        const progress = view.progress[view.current][token];
        return (
          <button key={token} type="button" className="ludo-board__pick" style={{ ...percent(tokenPoint(view.current, token, progress)), ['--seat' as string]: SEATS[view.current].color }}
            onClick={() => onMove(token)} aria-label={`Move token ${token + 1}`} data-testid={`ludo-move-${token}`} />
        );
      })}
    </div>
  );
}
