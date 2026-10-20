import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  advanceTime, BlocksState, BOARD_COLUMNS, BOARD_ROWS, createInitialState, finishLineClear, GameStatus, hardDrop,
  holdPiece, InitialStateOptions, moveDown, moveHorizontal, msUntilNextEvent, rotateClockwise, startGame, togglePause,
} from './game';
import { BlocksRenderer, drawPiecePreview } from './renderer';
import { getSoundsPlayed, playGameOver, playLineClear, playLockTick, readMuted, saveMuted, unlockAudio } from './sound';
import { createBlocksSaveSlot, restoreBlocks, serializeBlocks } from './save';
import { setupFromQuery } from './testSetup';
import './blocks.css';

const BEST_SCORE_STORAGE_KEY = 'kush-games-blocks-best';
const CLEAR_ANIMATION_MS = 280;
/** Key repeat: delay before auto-repeat (DAS), then the repeat interval (ARR). */
const AUTO_REPEAT_DELAY_MS = 160;
const AUTO_REPEAT_INTERVAL_MS = 45;
const SOFT_DROP_REPEAT_MS = 40;
const PREVIEW_SLOTS = 3;
const CLEAR_LABELS = ['', '', 'Double!', 'Triple!', 'BLOCKS!'];

type RepeatAction = 'left' | 'right' | 'down';
type GameAction = RepeatAction | 'rotate' | 'hardDrop' | 'hold';

function readBestScore(): number {
  try { return Number(localStorage.getItem(BEST_SCORE_STORAGE_KEY)) || 0; } catch { return 0; }
}
function saveBestScore(score: number) {
  try { localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(score)); } catch { /* storage unavailable */ }
}

const KEY_TO_ACTION: Record<string, GameAction> = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowUp: 'rotate', w: 'rotate', W: 'rotate', x: 'rotate', X: 'rotate',
  ' ': 'hardDrop',
  c: 'hold', C: 'hold', Shift: 'hold',
};

/** Write the data-* attributes read by the e2e checks; only touches changed values. */
function syncBoardAttributes(element: HTMLElement | null, state: BlocksState) {
  if (!element) return;
  const values: Record<string, string> = {
    'data-status': state.status,
    'data-score': String(state.score),
    'data-lines': String(state.lines),
    'data-level': String(state.level),
    'data-piece': state.active?.type ?? '',
    'data-piece-x': state.active ? String(state.active.x) : '',
    'data-piece-y': state.active ? String(state.active.y) : '',
    'data-rotation': state.active ? String(state.active.rotation) : '',
    'data-locks': String(state.lockCount),
    'data-clears': String(state.clearCount),
    'data-last-clear': String(state.lastClearLines),
    'data-clearing': state.clearingRows.length ? 'true' : 'false',
    'data-next': state.queue[0] ?? '',
    'data-hold': state.hold ?? '',
    'data-filled-cells': String(state.board.reduce((total, row) => total + row.filter(Boolean).length, 0)),
    'data-board': state.board.map(row => row.map(cell => (cell === null ? '.' : cell === 'garbage' ? 'g' : cell)).join('')).join('/'),
  };
  for (const [name, value] of Object.entries(values)) if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Falling-blocks game on one canvas. The game state lives in a ref; gravity runs on a timer
 * scheduled for the next event only, frames are drawn on state changes, and requestAnimationFrame
 * runs only during the line-clear animation. React re-renders when score/lines/level/status change.
 */
export default function Blocks() {
  // Test setups (?blocksSetup / ?blocksSeed) must be deterministic, so they never load or write saves.
  const [initialGame] = useState(() => {
    const testOptions = setupFromQuery(window.location.search);
    const saveSlot = testOptions ? null : createBlocksSaveSlot();
    const saved = saveSlot?.load();
    const state = saved ? restoreBlocks(saved) : createInitialState(testOptions);
    return { testOptions, saveSlot, state, isRestored: Boolean(saved) };
  });
  const saveSlot = initialGame.saveSlot;
  const initialOptionsRef = useRef<InitialStateOptions | undefined>(initialGame.testOptions);
  const gameStateRef = useRef<BlocksState>(initialGame.state);
  const [status, setStatus] = useState<GameStatus>(initialGame.state.status);
  const [isRestored, setIsRestored] = useState(initialGame.isRestored);
  const [score, setScore] = useState(initialGame.state.score);
  const [lines, setLines] = useState(initialGame.state.lines);
  const [level, setLevel] = useState(initialGame.state.level);
  const [bestScore, setBestScore] = useState(readBestScore);
  const [isMuted, setIsMuted] = useState(readMuted);
  const isMutedRef = useRef(isMuted);

  const frameRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement>(null);
  const holdCanvasRef = useRef<HTMLCanvasElement>(null);
  const clearLabelRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BlocksRenderer | null>(null);
  const gravityTimerRef = useRef<number | undefined>(undefined);
  const lastAdvanceAtRef = useRef(performance.now());
  const clearAnimationRef = useRef<number | undefined>(undefined);
  const previewKeyRef = useRef('');

  const drawPreviews = useCallback((state: BlocksState) => {
    const key = `${state.queue.slice(0, PREVIEW_SLOTS).join('')}|${state.hold ?? ''}|${state.canHold}`;
    if (key === previewKeyRef.current) return;
    previewKeyRef.current = key;
    if (nextCanvasRef.current) drawPiecePreview(nextCanvasRef.current, state.queue.slice(0, PREVIEW_SLOTS));
    if (holdCanvasRef.current) drawPiecePreview(holdCanvasRef.current, [state.hold], !state.canHold);
  }, []);

  // commitGameState and scheduleGravity reference each other through this ref.
  const commitRef = useRef<(next: BlocksState) => void>(() => undefined);

  const scheduleGravity = useCallback(() => {
    window.clearTimeout(gravityTimerRef.current);
    gravityTimerRef.current = undefined;
    const state = gameStateRef.current;
    const delay = msUntilNextEvent(state);
    if (!Number.isFinite(delay)) return;
    gravityTimerRef.current = window.setTimeout(() => {
      const now = performance.now();
      const elapsed = now - lastAdvanceAtRef.current;
      lastAdvanceAtRef.current = now;
      commitRef.current(advanceTime(gameStateRef.current, elapsed));
    }, delay);
  }, []);

  const runClearAnimation = useCallback(() => {
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / CLEAR_ANIMATION_MS);
      rendererRef.current?.draw(gameStateRef.current, progress);
      if (progress < 1) {
        clearAnimationRef.current = requestAnimationFrame(animate);
      } else {
        clearAnimationRef.current = undefined;
        lastAdvanceAtRef.current = performance.now();
        commitRef.current(finishLineClear(gameStateRef.current));
      }
    };
    clearAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  const showClearEffects = useCallback((lineCount: number) => {
    const label = clearLabelRef.current;
    if (label && CLEAR_LABELS[lineCount]) {
      label.textContent = CLEAR_LABELS[lineCount];
      label.className = `blocks-game__clear-label${lineCount >= 4 ? ' is-big' : ''}`;
      label.animate?.(
        [{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.1)', offset: 0.25 },
          { opacity: 0, transform: 'translate(-50%, -80%) scale(1)' }],
        { duration: lineCount >= 4 ? 900 : 650, easing: 'ease-out', fill: 'forwards' },
      );
    }
    if (lineCount >= 4 && !prefersReducedMotion()) {
      frameRef.current?.animate?.(
        [{ transform: 'translate(0, 0)' }, { transform: 'translate(-6px, 3px)' }, { transform: 'translate(5px, -4px)' },
          { transform: 'translate(-4px, -2px)' }, { transform: 'translate(3px, 4px)' }, { transform: 'translate(0, 0)' }],
        { duration: 320, easing: 'ease-out' },
      );
      frameRef.current?.setAttribute('data-shakes', String(Number(frameRef.current.getAttribute('data-shakes') ?? 0) + 1));
    }
  }, []);

  /** Save the game in progress, or clear the slot when there is none (not started, or over). */
  const persistGame = useCallback((state: BlocksState) => {
    if (!saveSlot) return;
    const saved = serializeBlocks(state);
    if (saved) saveSlot.save(saved); else saveSlot.clear();
  }, [saveSlot]);

  const commitGameState = useCallback((next: BlocksState) => {
    const previous = gameStateRef.current;
    if (next === previous) return;
    gameStateRef.current = next;
    const startedClear = next.clearingRows.length > 0 && previous.clearingRows.length === 0;
    if (clearAnimationRef.current === undefined) rendererRef.current?.draw(next);
    drawPreviews(next);
    syncBoardAttributes(boardRef.current, next);

    const sounds = !isMutedRef.current;
    if (startedClear) {
      if (sounds) playLineClear(next.lastClearLines);
      showClearEffects(next.lastClearLines);
      runClearAnimation();
    } else if (next.lockCount > previous.lockCount && sounds) {
      playLockTick();
    }
    if (next.status === 'over' && previous.status !== 'over' && sounds) playGameOver();
    if (sounds && next !== previous) boardRef.current?.setAttribute('data-sounds', String(getSoundsPlayed()));

    if (next.status !== previous.status) {
      if (next.status === 'running') { lastAdvanceAtRef.current = performance.now(); setIsRestored(false); }
      setStatus(next.status);
    }
    // Save on each lock, line clear, hold and pause/resume (not on every move or gravity step).
    if (next.status !== previous.status || next.lockCount !== previous.lockCount || next.clearCount !== previous.clearCount
      || next.hold !== previous.hold || next.canHold !== previous.canHold) persistGame(next);
    if (next.score !== previous.score) setScore(next.score);
    if (next.lines !== previous.lines) setLines(next.lines);
    if (next.level !== previous.level) setLevel(next.level);
    scheduleGravity();
  }, [drawPreviews, persistGame, runClearAnimation, scheduleGravity, showClearEffects]);
  commitRef.current = commitGameState;

  /** Bring gravity up to date before applying a player action. */
  const performAction = useCallback((action: GameAction) => {
    const now = performance.now();
    let state = advanceTime(gameStateRef.current, now - lastAdvanceAtRef.current);
    lastAdvanceAtRef.current = now;
    if (action === 'left') state = moveHorizontal(state, -1);
    else if (action === 'right') state = moveHorizontal(state, 1);
    else if (action === 'down') state = moveDown(state, true);
    else if (action === 'rotate') state = rotateClockwise(state);
    else if (action === 'hardDrop') state = hardDrop(state);
    else if (action === 'hold') state = holdPiece(state);
    commitGameState(state);
  }, [commitGameState]);

  const startOrResume = useCallback(() => commitGameState(startGame(gameStateRef.current)), [commitGameState]);
  const pauseOrResume = useCallback(() => commitGameState(togglePause(gameStateRef.current)), [commitGameState]);
  const restart = useCallback(() => {
    saveSlot?.clear();
    setIsRestored(false);
    if (clearAnimationRef.current !== undefined) cancelAnimationFrame(clearAnimationRef.current);
    clearAnimationRef.current = undefined;
    gameStateRef.current = createInitialState(initialOptionsRef.current?.seed !== undefined ? { seed: initialOptionsRef.current.seed + 1 } : undefined);
    commitGameState(startGame(gameStateRef.current));
  }, [commitGameState, saveSlot]);

  const toggleMute = useCallback(() => {
    setIsMuted(wasMuted => {
      const nowMuted = !wasMuted;
      isMutedRef.current = nowMuted;
      saveMuted(nowMuted);
      if (!nowMuted) unlockAudio();
      return nowMuted;
    });
  }, []);

  // Best score
  useEffect(() => {
    if (score > bestScore) { setBestScore(score); saveBestScore(score); }
  }, [score, bestScore]);

  // Canvas: devicePixelRatio (capped at 2), redraw on resize.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const board = boardRef.current;
    if (!canvas || !board) return;
    const renderer = new BlocksRenderer(canvas);
    rendererRef.current = renderer;
    syncBoardAttributes(board, gameStateRef.current);
    const fit = () => {
      const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const cellPixels = Math.max(4, Math.round((board.clientWidth * ratio) / BOARD_COLUMNS));
      if (renderer.resize(cellPixels, BOARD_COLUMNS, BOARD_ROWS)) renderer.draw(gameStateRef.current);
      for (const preview of [nextCanvasRef.current, holdCanvasRef.current]) {
        if (!preview) continue;
        const width = Math.round(preview.clientWidth * ratio);
        const height = Math.round(preview.clientHeight * ratio);
        if (preview.width !== width || preview.height !== height) { preview.width = width; preview.height = height; previewKeyRef.current = ''; }
      }
      drawPreviews(gameStateRef.current);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(board);
    if (nextCanvasRef.current) observer.observe(nextCanvasRef.current);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      rendererRef.current = null;
    };
  }, [drawPreviews]);

  // Stop timers on unmount
  useEffect(() => () => {
    window.clearTimeout(gravityTimerRef.current);
    if (clearAnimationRef.current !== undefined) cancelAnimationFrame(clearAnimationRef.current);
  }, []);

  // Keyboard with DAS/ARR auto-repeat for left/right/soft drop.
  useEffect(() => {
    const repeatTimers = new Map<RepeatAction, { delay?: number; interval?: number }>();
    const stopRepeat = (action: RepeatAction) => {
      const timers = repeatTimers.get(action);
      if (timers) { window.clearTimeout(timers.delay); window.clearInterval(timers.interval); repeatTimers.delete(action); }
    };
    const startRepeat = (action: RepeatAction) => {
      stopRepeat(action);
      if (action === 'left') stopRepeat('right');
      if (action === 'right') stopRepeat('left');
      const timers: { delay?: number; interval?: number } = {};
      const delay = action === 'down' ? SOFT_DROP_REPEAT_MS : AUTO_REPEAT_DELAY_MS;
      const interval = action === 'down' ? SOFT_DROP_REPEAT_MS : AUTO_REPEAT_INTERVAL_MS;
      timers.delay = window.setTimeout(() => { timers.interval = window.setInterval(() => performAction(action), interval); }, delay);
      repeatTimers.set(action, timers);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!isMutedRef.current) unlockAudio();
      const currentStatus = gameStateRef.current.status;
      if (event.key === 'p' || event.key === 'P') { pauseOrResume(); return; }
      if (event.key === 'm' || event.key === 'M') { toggleMute(); return; }
      if ((event.key === ' ' || event.key === 'Enter') && currentStatus !== 'running') {
        event.preventDefault();
        if (event.repeat) return;
        if (currentStatus === 'over') restart(); else startOrResume();
        return;
      }
      const action = KEY_TO_ACTION[event.key];
      if (!action) return;
      event.preventDefault();
      if (event.repeat) return; // our own DAS/ARR handles repeats
      performAction(action);
      if (action === 'left' || action === 'right' || action === 'down') startRepeat(action);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const action = KEY_TO_ACTION[event.key];
      if (action === 'left' || action === 'right' || action === 'down') stopRepeat(action);
    };
    const stopAll = () => { for (const action of [...repeatTimers.keys()]) stopRepeat(action); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', stopAll);
    return () => {
      stopAll();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', stopAll);
    };
  }, [performAction, pauseOrResume, restart, startOrResume, toggleMute]);

  // Auto-pause when the tab is hidden (pausing also saves).
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) return;
      if (gameStateRef.current.status === 'running') commitGameState(togglePause(gameStateRef.current));
      else persistGame(gameStateRef.current);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [commitGameState, persistGame]);

  // Final save when the page goes away or the player leaves the game (Back / route change).
  useEffect(() => {
    const saveNow = () => persistGame(gameStateRef.current);
    window.addEventListener('pagehide', saveNow);
    return () => {
      window.removeEventListener('pagehide', saveNow);
      saveNow();
    };
  }, [persistGame]);

  // Touch: tap = rotate, drag sideways = move by cells, drag down = soft drop, quick flick down = hard drop.
  useEffect(() => {
    const frame = frameRef.current;
    const board = boardRef.current;
    if (!frame || !board) return;
    let tracking = false;
    let startX = 0, startY = 0, startTime = 0, stepX = 0, stepY = 0, movedSideways = false, softDropped = false;
    const handleTouchStart = (event: TouchEvent) => {
      if (!isMutedRef.current) unlockAudio();
      if (event.touches.length !== 1 || (event.target as HTMLElement).closest('button')) return;
      tracking = true;
      startX = stepX = event.touches[0].clientX;
      startY = stepY = event.touches[0].clientY;
      startTime = performance.now();
      movedSideways = softDropped = false;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!tracking) return;
      event.preventDefault();
      if (gameStateRef.current.status !== 'running') return;
      const touch = event.touches[0];
      const cellSize = board.clientWidth / BOARD_COLUMNS;
      while (touch.clientX - stepX >= cellSize) { performAction('right'); stepX += cellSize; movedSideways = true; }
      while (stepX - touch.clientX >= cellSize) { performAction('left'); stepX -= cellSize; movedSideways = true; }
      const isMostlyVertical = Math.abs(touch.clientY - startY) > Math.abs(touch.clientX - startX) * 1.2;
      if (isMostlyVertical) {
        while (touch.clientY - stepY >= cellSize) { performAction('down'); stepY += cellSize; softDropped = true; }
      } else {
        stepY = touch.clientY;
      }
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (gameStateRef.current.status !== 'running') return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const duration = performance.now() - startTime;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < 10 && duration < 300 && !movedSideways && !softDropped) { performAction('rotate'); return; }
      const isFlickDown = deltaY > 50 && duration < 250 && Math.abs(deltaX) < deltaY * 0.6 && deltaY / duration > 0.35;
      if (isFlickDown) performAction('hardDrop');
    };
    frame.addEventListener('touchstart', handleTouchStart, { passive: true });
    frame.addEventListener('touchmove', handleTouchMove, { passive: false });
    frame.addEventListener('touchend', handleTouchEnd);
    frame.addEventListener('touchcancel', () => { tracking = false; });
    return () => {
      frame.removeEventListener('touchstart', handleTouchStart);
      frame.removeEventListener('touchmove', handleTouchMove);
      frame.removeEventListener('touchend', handleTouchEnd);
    };
  }, [performAction]);

  // On-screen buttons, with auto-repeat while held for ◀ ▶ ▼.
  const buttonRepeatRef = useRef<{ delay?: number; interval?: number }>({});
  const stopButtonRepeat = useCallback(() => {
    window.clearTimeout(buttonRepeatRef.current.delay);
    window.clearInterval(buttonRepeatRef.current.interval);
    buttonRepeatRef.current = {};
  }, []);
  useEffect(() => stopButtonRepeat, [stopButtonRepeat]);
  const pressButton = (action: GameAction) => (event: React.PointerEvent) => {
    event.preventDefault();
    if (!isMutedRef.current) unlockAudio();
    performAction(action);
    if (action === 'left' || action === 'right' || action === 'down') {
      stopButtonRepeat();
      const interval = action === 'down' ? SOFT_DROP_REPEAT_MS : AUTO_REPEAT_INTERVAL_MS + 15;
      buttonRepeatRef.current.delay = window.setTimeout(() => {
        buttonRepeatRef.current.interval = window.setInterval(() => performAction(action), interval);
      }, AUTO_REPEAT_DELAY_MS + 40);
    }
  };
  const buttonHandlers = (action: GameAction) => ({
    onPointerDown: pressButton(action),
    onPointerUp: stopButtonRepeat,
    onPointerLeave: stopButtonRepeat,
    onPointerCancel: stopButtonRepeat,
  });

  return (
    <div className="blocks-game" data-testid="blocks-game">
      <div className="blocks-game__layout">
        <div className="blocks-game__frame" ref={frameRef} data-testid="blocks-frame">
          <div className="blocks-game__board" ref={boardRef} data-testid="blocks-board">
            <canvas ref={canvasRef} className="blocks-game__canvas" data-testid="blocks-canvas" role="img" aria-label="Blocks board" />
            <div className="blocks-game__clear-label" ref={clearLabelRef} data-testid="blocks-clear-label" aria-live="polite" />
            {status === 'ready' && (
              <div className="blocks-game__overlay" data-testid="blocks-start">
                <h2>Blocks</h2>
                <p className="blocks-game__intro">Shapes fall. Fill a whole row to clear it.</p>
                <button type="button" className="blocks-game__primary" onClick={startOrResume} data-testid="blocks-start-button">▶ Start</button>
                <p className="blocks-game__hint">Arrows / WASD · ↑ rotate · Space drop · C hold · P pause</p>
              </div>
            )}
            {status === 'paused' && (
              <div className="blocks-game__overlay" data-testid="blocks-paused" data-restored={isRestored ? 'true' : 'false'}>
                {isRestored && <p className="blocks-game__restored" data-testid="blocks-restored">💾 Saved game restored</p>}
                <h2>Paused</h2>
                {isRestored && <p className="blocks-game__hint">Score {score} · Lines {lines} · Level {level}</p>}
                <button type="button" className="blocks-game__primary" onClick={startOrResume} data-testid="blocks-resume">▶ Resume</button>
                <button type="button" className="blocks-game__secondary" onClick={restart} data-testid="blocks-new-game">↻ New game</button>
                <p className="blocks-game__hint">Press P to resume</p>
              </div>
            )}
            {status === 'over' && (
              <div className="blocks-game__overlay blocks-game__overlay--over" data-testid="blocks-over">
                <h2>Game Over</h2>
                <dl className="blocks-game__final">
                  <div><dt>Score</dt><dd>{score}</dd></div>
                  <div><dt>Lines</dt><dd>{lines}</dd></div>
                  <div><dt>Level</dt><dd>{level}</dd></div>
                </dl>
                <p>{score > 0 && score >= bestScore ? '🏆 New best!' : `Best ${bestScore}`}</p>
                <button type="button" className="blocks-game__primary" onClick={restart} data-testid="blocks-restart">↻ Play again</button>
              </div>
            )}
          </div>
        </div>

        <aside className="blocks-game__side">
          <h1 className="blocks-game__title">Blocks</h1>
          <div className="blocks-game__panel">
            <span className="blocks-game__label">Next</span>
            <canvas ref={nextCanvasRef} className="blocks-game__next" data-testid="blocks-next" aria-hidden="true" />
          </div>
          <div className="blocks-game__panel">
            <span className="blocks-game__label">Hold</span>
            <canvas ref={holdCanvasRef} className="blocks-game__hold" data-testid="blocks-hold" aria-hidden="true" />
          </div>
          <dl className="blocks-game__stats">
            <div><dt>Score</dt><dd data-testid="blocks-score">{score}</dd></div>
            <div><dt>Lines</dt><dd data-testid="blocks-lines">{lines}</dd></div>
            <div><dt>Level</dt><dd data-testid="blocks-level">{level}</dd></div>
            <div><dt>Best</dt><dd data-testid="blocks-best">{bestScore}</dd></div>
          </dl>
          <div className="blocks-game__side-buttons">
            <button type="button" onClick={toggleMute} data-testid="blocks-mute" aria-pressed={isMuted}
              aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}>{isMuted ? '🔇' : '🔊'}</button>
            <button type="button" onClick={status === 'over' ? restart : status === 'ready' ? startOrResume : pauseOrResume}
              data-testid="blocks-pause" aria-label={status === 'running' ? 'Pause' : 'Play'}>{status === 'running' ? '❚❚' : '▶'}</button>
          </div>
        </aside>
      </div>

      <div className="blocks-game__controls" aria-label="Game controls">
        <button type="button" {...buttonHandlers('left')} aria-label="Move left">◀</button>
        <button type="button" {...buttonHandlers('rotate')} aria-label="Rotate">⟳</button>
        <button type="button" {...buttonHandlers('right')} aria-label="Move right">▶</button>
        <button type="button" {...buttonHandlers('down')} aria-label="Soft drop">▼</button>
        <button type="button" {...buttonHandlers('hardDrop')} aria-label="Hard drop">⤓</button>
        <button type="button" {...buttonHandlers('hold')} aria-label="Hold">⇄</button>
      </div>
      <p className="blocks-game__help">←/→ or A/D move · ↑/W rotate · ↓/S soft drop · Space hard drop · C/Shift hold · P pause · M mute</p>
    </div>
  );
}
