import { useEffect, useState } from 'react';

export const formatClock = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

/** A clock that re-renders only itself once a second. Shows baseMs plus the time since startedAt (performance.now()), or just baseMs when stopped. */
export function GameTimer({ baseMs, startedAt, testId, format = formatClock }: {
  baseMs: number; startedAt: number | null; testId: string; format?: (milliseconds: number) => string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setTick(tick => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return <b data-testid={testId}>{format(baseMs + (startedAt === null ? 0 : performance.now() - startedAt))}</b>;
}
