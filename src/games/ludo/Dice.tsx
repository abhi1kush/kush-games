/** The 3D dice (CSS cube) with the turn ring timer around it. It sits on the yard of whoever's turn it is. */
import { useEffect, useRef, useState } from 'react';

const FACE_ANGLES: Record<number, [number, number]> = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACES: [number, string][] = [[1, 'front'], [2, 'right'], [6, 'back'], [5, 'left'], [3, 'top'], [4, 'bottom']];

export interface DiceClock { remainingMs: number; totalMs: number; key: string; }

export function Dice({ value, rollId, canRoll, onRoll, clock, color, isWaiting, label }: {
  value: number;
  rollId: number;
  canRoll: boolean;
  onRoll(): void;
  clock: DiceClock | null;
  color: string;
  /** Dice not rolled yet this turn (shown a little faded). */
  isWaiting: boolean;
  label: string;
}) {
  const spins = useRef(0);
  const lastRoll = useRef(rollId);
  const [isRolling, setIsRolling] = useState(false);
  if (rollId !== lastRoll.current) { lastRoll.current = rollId; spins.current += 1; }
  useEffect(() => {
    if (spins.current === 0) return;
    setIsRolling(true);
    const timer = window.setTimeout(() => setIsRolling(false), 650);
    return () => window.clearTimeout(timer);
  }, [rollId]);
  const [faceX, faceY] = FACE_ANGLES[value] ?? FACE_ANGLES[1];
  const turnX = spins.current * 720 + faceX;
  const turnY = spins.current * 360 + faceY;
  const seconds = useCountdown(clock);
  return (
    <div className={`ludo-dice${canRoll ? ' can-roll' : ''}${isRolling ? ' is-rolling' : ''}${isWaiting ? ' is-waiting' : ''}`} style={{ ['--seat' as string]: color }}>
      {clock && (
        <svg className="ludo-dice__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="45" className="ludo-dice__ring-track" />
          <circle key={`${clock.key}-${clock.remainingMs}`} cx="50" cy="50" r="45" className="ludo-dice__ring-time"
            style={{ animationDuration: `${clock.totalMs}ms`, animationDelay: `${-(clock.totalMs - clock.remainingMs)}ms` }} />
        </svg>
      )}
      <button type="button" className="ludo-dice__button" onClick={onRoll} disabled={!canRoll} aria-label={label} data-testid="ludo-dice" data-value={value} data-roll={rollId}>
        <span className="ludo-dice__cube" style={{ transform: `rotateX(${turnX}deg) rotateY(${turnY}deg)` }}>
          {FACES.map(([face, side]) => (
            <span key={face} className={`ludo-dice__face ludo-dice__face--${side}`}>
              {Array.from({ length: 9 }, (_, index) => <i key={index} className={PIPS[face].includes(index) ? 'is-pip' : ''} />)}
            </span>
          ))}
        </span>
      </button>
      {clock && seconds !== null && <span className={`ludo-dice__seconds${seconds <= 5 ? ' is-low' : ''}`} data-testid="ludo-seconds">{seconds}</span>}
    </div>
  );
}

/** Whole seconds left on the turn clock (ticks only while a clock runs). */
function useCountdown(clock: DiceClock | null): number | null {
  const [now, setNow] = useState(() => performance.now());
  const startedAt = useRef({ key: '', at: 0, remaining: 0 });
  const signature = clock ? `${clock.key}-${clock.remainingMs}` : '';
  if (clock && startedAt.current.key !== signature) startedAt.current = { key: signature, at: performance.now(), remaining: clock.remainingMs };
  useEffect(() => {
    if (!clock) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!clock) return null;
  return Math.max(0, Math.ceil((startedAt.current.remaining - Math.max(0, now - startedAt.current.at)) / 1000));
}
