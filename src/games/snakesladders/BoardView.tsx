/**
 * The table: a canvas board (static picture cached; redrawn only while a token moves) between two strips of player
 * bays. The dice sits in the bay of whoever's turn it is; online, your own bay is bottom-left.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Confetti, drawBoard, drawConfetti, drawToken, makeConfetti } from './board';
import { Dice } from '../online/turnRoom/Dice';
import type { TurnBoardProps } from '../online/turnRoom/TurnGameApp';
import { placeText } from '../online/turnRoom/spec';
import { BOARD_JUMPS, bezierPoint, DICE_SETTLE_MS, EnginePhase, type GameView, HOP_MS, jumpMs, LAST_SQUARE, MAX_STRIKES, type Point, REMOVED, SEATS, snakeCurve, squarePoint } from './engine';

interface Animation {
  seat: number;
  from: number;
  landed: number;
  to: number;
  board: number;
  startedAt: number;
  hopsEnd: number;
  jumpStart: number;
  endsAt: number;
  lastHop: number;
  jumpSounded: boolean;
}

/** Bay corner for a seat: 0 bottom-left, 1 top-left, 2 top-right, 3 bottom-right (rotated so you're bottom-left). */
const corner = (seat: number, rotation: number) => (seat - rotation + 4) % 4;

export function BoardView({ view, players, rotation, canAct, hostId, myId, clock, onRoll, sound }: TurnBoardProps<GameView>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardImage = useRef<HTMLCanvasElement | null>(null);
  const [pixels, setPixels] = useState(0);
  const shown = useRef<{ positions: number[]; moveId: number } | null>(null);
  const animation = useRef<Animation | null>(null);
  const confetti = useRef<{ pieces: Confetti[]; startedAt: number } | null>(null);
  const frame = useRef(0);
  const latest = useRef({ view, pixels, sound });
  latest.current = { view, pixels, sound };
  const [movingSeat, setMovingSeat] = useState(-1);

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
    drawBoard(image, pixels, view.board);
    boardImage.current = image;
    paint(performance.now());
  }, [pixels, view.board]); // eslint-disable-line react-hooks/exhaustive-deps

  function movingPoint(active: Animation, time: number): { point: Point; lift: number } {
    if (time < active.startedAt) return { point: squarePoint(active.from), lift: 0 };
    if (time < active.hopsEnd) {
      const elapsed = Math.max(0, time - active.startedAt);
      const hop = Math.min(active.landed - active.from - 1, Math.floor(elapsed / HOP_MS));
      if (hop > active.lastHop) { active.lastHop = hop; latest.current.sound('hop', hop); }
      const fraction = Math.min(1, (elapsed - hop * HOP_MS) / HOP_MS);
      const a = squarePoint(active.from + hop), b = squarePoint(active.from + hop + 1);
      return { point: [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction], lift: Math.sin(fraction * Math.PI) };
    }
    if (active.to === active.landed || time < active.jumpStart) return { point: squarePoint(active.landed), lift: 0 };
    if (!active.jumpSounded) { active.jumpSounded = true; latest.current.sound(active.to > active.landed ? 'ladder' : 'snake'); }
    const progress = Math.min(1, (time - active.jumpStart) / (active.endsAt - active.jumpStart));
    if (active.to > active.landed) {
      // climbing: steady steps up the ladder with a little bob per rung
      const a = squarePoint(active.landed), b = squarePoint(active.to);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
      return { point: [a[0] + (b[0] - a[0]) * eased, a[1] + (b[1] - a[1]) * eased], lift: Math.abs(Math.sin(progress * Math.PI * 6)) * 0.35 };
    }
    // sliding down the snake's body, speeding up
    const snakes = (BOARD_JUMPS[active.board] ?? []).filter(([from, to]) => to < from);
    const index = snakes.findIndex(([from]) => from === active.landed);
    const curve = snakeCurve(active.landed, active.to, Math.max(0, index));
    return { point: bezierPoint(curve, progress * progress * (3 - 2 * progress)), lift: 0.15 };
  }

  function paint(time: number): boolean {
    const canvas = canvasRef.current, image = boardImage.current;
    const { view: current, pixels: size } = latest.current;
    if (!canvas || !image || !size) return false;
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const unit = size / 10;
    const active = animation.current;
    const pieces: { x: number; y: number; seat: number; lift: number; scale: number }[] = [];
    const squares = new Map<number, number[]>();
    for (let seat = 0; seat < 4; seat++) {
      const position = current.positions[seat];
      if (!(current.joined & (1 << seat)) || position === REMOVED || position === 0 || active?.seat === seat) continue;
      squares.set(position, [...(squares.get(position) ?? []), seat]);
    }
    for (const [square, seats] of squares) {
      const [baseX, baseY] = squarePoint(square);
      seats.forEach((seat, index) => {
        const spread = seats.length === 1 ? [0, 0] : [((index % 2) - 0.5) * 0.4, seats.length > 2 ? (Math.floor(index / 2) - 0.5) * 0.36 : 0.05];
        pieces.push({ x: (baseX + spread[0]) * unit, y: (baseY + spread[1]) * unit, seat, lift: 0, scale: seats.length === 1 ? 1 : 0.8 });
      });
    }
    let running = false;
    if (active) {
      const { point, lift } = movingPoint(active, time);
      if (!(active.from === 0 && time < active.startedAt)) pieces.push({ x: point[0] * unit, y: point[1] * unit, seat: active.seat, lift, scale: 1.08 });
      running = true;
      if (time >= active.endsAt) {
        animation.current = null;
        setMovingSeat(-1);
        if (active.to === LAST_SQUARE) {
          const [x, y] = squarePoint(LAST_SQUARE);
          confetti.current = { pieces: makeConfetti(x, y), startedAt: time };
          latest.current.sound('home');
        }
      }
    }
    pieces.sort((a, b) => a.y - b.y);
    for (const piece of pieces) drawToken(context, piece.x, piece.y, unit * 0.36 * piece.scale, piece.seat, piece.lift);
    if (confetti.current) {
      const seconds = (time - confetti.current.startedAt) / 1000;
      if (seconds > 1.8) confetti.current = null;
      else { drawConfetti(context, confetti.current.pieces, seconds, unit); running = true; }
    }
    return running;
  }

  function loop(time: number) {
    frame.current = 0;
    if (paint(Math.max(time, performance.now() - 50))) frame.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    const previous = shown.current;
    const move = view.lastMove;
    shown.current = { positions: [...view.positions], moveId: move?.id ?? 0 };
    if (previous && move && move.id !== previous.moveId && previous.positions[move.seat] === move.from && move.landed !== move.from) {
      const startedAt = performance.now() + DICE_SETTLE_MS;
      const hopsEnd = startedAt + (move.landed - move.from) * HOP_MS;
      const jumpStart = hopsEnd + (move.to !== move.landed ? 140 : 0);
      animation.current = { seat: move.seat, from: move.from, landed: move.landed, to: move.to, board: view.board, startedAt, hopsEnd, jumpStart,
        endsAt: jumpStart + (move.to !== move.landed ? jumpMs(move.landed, move.to) : 0), lastHop: -1, jumpSounded: false };
      setMovingSeat(move.seat);
      if (!frame.current) frame.current = requestAnimationFrame(loop);
      return;
    }
    if (!animation.current && !confetti.current) paint(performance.now());
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const seatPlayer = (seat: number) => players.find(player => player.seat === seat);
  const isPlaying = view.phase === EnginePhase.AwaitRoll || view.phase === EnginePhase.Resolving;
  const canRoll = canAct && view.phase === EnginePhase.AwaitRoll;
  const bays = [0, 1, 2, 3].sort((a, b) => corner(a, rotation) - corner(b, rotation));

  const bay = (seat: number) => {
    const player = seatPlayer(seat);
    const isJoined = (view.joined & (1 << seat)) !== 0;
    const isOut = player ? ['left', 'kicked', 'forfeited'].includes(player.status) : isJoined && !(view.active & (1 << seat));
    const isTurn = isPlaying && view.current === seat;
    const position = view.positions[seat];
    const place = view.places[seat];
    const strikes = view.strikes[seat];
    const where = corner(seat, rotation);
    return (
      <div key={seat} className={`snakes-bay snakes-bay--${where === 0 || where === 1 ? 'left' : 'right'}${isTurn ? ' is-turn' : ''}${!isJoined ? ' is-empty' : ''}${isOut ? ' is-out' : ''}`}
        style={{ ['--seat' as string]: SEATS[seat].color }} data-testid={`snakes-bay-${seat}`} data-corner={where}>
        {isJoined ? (
          <>
            <span className={`snakes-bay__token${position === 0 && movingSeat !== seat ? ' is-waiting' : ''}`} aria-hidden="true" />
            <span className="snakes-bay__text">
              <span className="snakes-bay__name">
                {player?.clientId === hostId && <b className="snakes-bay__crown" title="Host">♛</b>}
                {player?.name ?? SEATS[seat].name}{player && player.clientId === myId ? ' (you)' : ''}
                {player && !player.connected && !player.isBot && !isOut && <span title="Disconnected"> ⏳</span>}
              </span>
              <span className="snakes-bay__info" data-testid={`snakes-square-${seat}`}>
                {isOut ? (player?.status === 'left' ? 'Left' : player?.status === 'kicked' ? 'Removed' : 'Out — 3 missed turns')
                  : place > 0 ? <b className={`snakes-bay__place snakes-bay__place--${place}`} data-testid={`snakes-place-${seat}`}>{placeText(place)}</b>
                    : position === 0 ? 'Not started' : `Square ${position}`}
                {strikes > 0 && !isOut && <b className="snakes-bay__strikes" data-testid={`snakes-strikes-${seat}`}>⚠ {strikes}/{MAX_STRIKES}</b>}
              </span>
            </span>
            {isTurn && (
              <span className="snakes-bay__dice" data-testid="snakes-dice-spot">
                <Dice value={view.dice || 1} rollId={view.rollId} canRoll={canRoll} onRoll={onRoll} clock={clock} color={SEATS[seat].color}
                  isWaiting={view.phase === EnginePhase.AwaitRoll} testPrefix="snakes" label={canRoll ? 'Roll the dice' : `${player?.name ?? SEATS[seat].name}’s dice`} />
              </span>
            )}
          </>
        ) : <span className="snakes-bay__free">—</span>}
      </div>
    );
  };

  return (
    <div className="snakes-table" data-testid="snakes-table">
      <div className="snakes-bays">{bays.slice(1, 3).map(bay)}</div>
      <div className="snakes-board" ref={wrapRef} data-testid="snakes-board" data-current={view.current} data-phase={view.phase} data-board={view.board} data-animating={movingSeat >= 0}>
        <canvas ref={canvasRef} className="snakes-board__canvas" aria-label="Snakes and ladders board" />
      </div>
      <div className="snakes-bays">{[bays[0], bays[3]].map(bay)}</div>
    </div>
  );
}
