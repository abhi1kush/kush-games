import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { canvasPixelSize, diffBoard } from './boardDiff';
import { CanvasBoardRenderer } from './canvasRenderer';
import {
  changeDirection, createInitialState, Direction, GameStatus, SnakeState, startGame, step, tickInterval, togglePause,
} from './game';
import { getChompsPlayed, playChomp, readMuted, saveMuted, unlockAudio } from './sound';
import './snake.css';

const BEST_SCORE_STORAGE_KEY = 'kush-games-snake-best';
const MINIMUM_SWIPE_DISTANCE = 24;
const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

function readBestScore(): number {
  try { return Number(localStorage.getItem(BEST_SCORE_STORAGE_KEY)) || 0; } catch { return 0; }
}

function saveBestScore(score: number) {
  try { localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(score)); } catch { /* storage unavailable */ }
}

const pointText = (point: { x: number; y: number } | null) => (point ? `${point.x},${point.y}` : '');

/** Write the data-* attributes the e2e checks read, touching only the ones that changed. */
function syncBoardAttributes(board: HTMLElement | null, previous: SnakeState | null, next: SnakeState) {
  if (!board) return;
  const setIfChanged = (name: string, previousValue: string | null, nextValue: string) => {
    if (previousValue !== nextValue || board.getAttribute(name) !== nextValue) board.setAttribute(name, nextValue);
  };
  setIfChanged('data-status', previous?.status ?? null, next.status);
  setIfChanged('data-head', previous ? pointText(previous.snake[0]) : null, pointText(next.snake[0]));
  setIfChanged('data-length', previous ? String(previous.snake.length) : null, String(next.snake.length));
  setIfChanged('data-direction', previous?.direction ?? null, next.direction);
  setIfChanged('data-apple', previous ? pointText(previous.apple) : null, pointText(next.apple));
}

/**
 * Snake on a single canvas. The game state lives in a ref and the game loop draws only the
 * changed cells; React re-renders only when score, status, best score or mute change.
 */
export default function Snake() {
  const gameStateRef = useRef<SnakeState>(createInitialState());
  const [status, setStatus] = useState<GameStatus>(gameStateRef.current.status);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(readBestScore);
  const [isNewBestScore, setIsNewBestScore] = useState(false);
  const [isMuted, setIsMuted] = useState(readMuted);
  const isMutedRef = useRef(isMuted);
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasBoardRenderer | null>(null);

  /** Apply a new game state: draw the changed cells, update attributes, and React state only if it changed. */
  const commitGameState = useCallback((nextState: SnakeState) => {
    const previousState = gameStateRef.current;
    if (nextState === previousState) return;
    gameStateRef.current = nextState;
    rendererRef.current?.apply(diffBoard(previousState, nextState), nextState);
    syncBoardAttributes(boardRef.current, previousState, nextState);
    if (nextState.status !== previousState.status) setStatus(nextState.status);
    if (nextState.score !== previousState.score) {
      setScore(nextState.score);
      if (nextState.score > previousState.score && !isMutedRef.current) {
        playChomp();
        boardRef.current?.setAttribute('data-chomps', String(getChompsPlayed()));
      }
    }
  }, []);

  const updateGame = useCallback((update: (current: SnakeState) => SnakeState) => {
    commitGameState(update(gameStateRef.current));
  }, [commitGameState]);

  const steerSnake = useCallback((direction: Direction) => {
    updateGame(current => {
      const turned = changeDirection(current, direction);
      return turned.status === 'ready' ? startGame(turned) : turned;
    });
  }, [updateGame]);

  const restart = useCallback(() => {
    setIsNewBestScore(false);
    const freshGame = startGame(createInitialState());
    const previousState = gameStateRef.current;
    gameStateRef.current = freshGame;
    rendererRef.current?.drawFull(freshGame);
    syncBoardAttributes(boardRef.current, previousState, freshGame);
    setStatus(freshGame.status);
    setScore(0);
  }, []);

  const handlePrimaryAction = useCallback(() => {
    if (gameStateRef.current.status === 'over') restart();
    else updateGame(togglePause);
  }, [restart, updateGame]);

  const toggleMute = useCallback(() => {
    setIsMuted(wasMuted => {
      const nowMuted = !wasMuted;
      isMutedRef.current = nowMuted;
      saveMuted(nowMuted);
      if (!nowMuted) unlockAudio();
      return nowMuted;
    });
  }, []);

  // Canvas setup: size with devicePixelRatio (capped at 2) and redraw fully on resize / DPR change.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const board = boardRef.current;
    if (!canvas || !board) return;
    const renderer = new CanvasBoardRenderer(canvas);
    rendererRef.current = renderer;
    syncBoardAttributes(board, null, gameStateRef.current);
    const fitToBoard = () => {
      const cssSize = board.clientWidth;
      if (!cssSize) return;
      const pixels = canvasPixelSize(cssSize, window.devicePixelRatio);
      if (renderer.resize(pixels, gameStateRef.current.columns)) renderer.drawFull(gameStateRef.current);
    };
    fitToBoard();
    const resizeObserver = new ResizeObserver(fitToBoard);
    resizeObserver.observe(board);
    let resolutionQuery: MediaQueryList | null = null;
    const watchResolution = () => {
      resolutionQuery?.removeEventListener('change', handleResolutionChange);
      resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolutionQuery.addEventListener('change', handleResolutionChange);
    };
    function handleResolutionChange() { fitToBoard(); watchResolution(); }
    watchResolution();
    return () => {
      resizeObserver.disconnect();
      resolutionQuery?.removeEventListener('change', handleResolutionChange);
      rendererRef.current = null;
    };
  }, []);

  // Game loop at the tick rate; only runs while playing.
  const currentTickMs = tickInterval(score);
  useEffect(() => {
    if (status !== 'running') return;
    const timer = window.setInterval(() => commitGameState(step(gameStateRef.current)), currentTickMs);
    return () => window.clearInterval(timer);
  }, [status, currentTickMs, commitGameState]);

  // High score
  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      setIsNewBestScore(true);
      saveBestScore(score);
    }
  }, [score, bestScore]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!isMutedRef.current) unlockAudio();
      const direction = KEY_TO_DIRECTION[event.key];
      if (direction) { event.preventDefault(); steerSnake(direction); return; }
      if (event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); handlePrimaryAction(); return; }
      if (event.key === 'p' || event.key === 'P') { updateGame(togglePause); return; }
      if (event.key === 'm' || event.key === 'M') { toggleMute(); return; }
      const currentStatus = gameStateRef.current.status;
      if (event.key === 'Enter' && (currentStatus === 'ready' || currentStatus === 'over')) { event.preventDefault(); handlePrimaryAction(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [steerSnake, handlePrimaryAction, updateGame, toggleMute]);

  // Pause when the tab is hidden (this also stops the interval).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) updateGame(current => (current.status === 'running' ? togglePause(current) : current));
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [updateGame]);

  // Swipe anywhere in the game area. Turns fire during the move, so one gesture can make several turns.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let startX = 0;
    let startY = 0;
    let isTracking = false;
    const handlePointerDown = () => { if (!isMutedRef.current) unlockAudio(); };
    const handleTouchStart = (event: TouchEvent) => {
      if (!isMutedRef.current) unlockAudio();
      const target = event.target as HTMLElement;
      if (event.touches.length !== 1 || target.closest('button')) return;
      isTracking = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!isTracking) return;
      event.preventDefault();
      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < MINIMUM_SWIPE_DISTANCE) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) steerSnake(deltaX > 0 ? 'right' : 'left');
      else steerSnake(deltaY > 0 ? 'down' : 'up');
      startX = touch.clientX;
      startY = touch.clientY;
    };
    const handleTouchEnd = () => { isTracking = false; };
    container.addEventListener('pointerdown', handlePointerDown, { passive: true });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [steerSnake]);

  const pressDirectionButton = (direction: Direction) => (event: React.PointerEvent) => {
    event.preventDefault();
    steerSnake(direction);
  };

  return (
    <div className="snake-game" ref={containerRef} data-testid="snake-game">
      <div className="snake-game__container">
        <header className="snake-game__header">
          <h1 className="snake-game__title"><span aria-hidden="true">🐍</span> Snake</h1>
          <div className="snake-game__scores">
            <div className="snake-game__score"><span>Score</span><b data-testid="snake-score">{score}</b></div>
            <div className="snake-game__score"><span>Best</span><b data-testid="snake-best">{bestScore}</b></div>
            <button type="button" className="snake-game__icon-button" onClick={toggleMute} data-testid="snake-mute"
              aria-pressed={isMuted} aria-label={isMuted ? 'Unmute sound' : 'Mute sound'} title={isMuted ? 'Unmute (M)' : 'Mute (M)'}>
              {isMuted ? '🔇' : '🔊'}
            </button>
            <button type="button" className="snake-game__icon-button" onClick={handlePrimaryAction}
              disabled={status === 'over'} data-testid="snake-pause"
              aria-label={status === 'running' ? 'Pause' : 'Resume'}>
              {status === 'running' ? '❚❚' : '▶'}
            </button>
          </div>
        </header>

        <div className="snake-game__board" ref={boardRef} data-testid="snake-board">
          <canvas ref={canvasRef} className="snake-game__canvas" data-testid="snake-canvas" role="img" aria-label="Snake board" />

          {status === 'ready' && (
            <div className="snake-game__overlay" data-testid="snake-start">
              <div className="snake-game__overlay-glyph" aria-hidden="true">🐍🍎</div>
              <h2>Snake</h2>
              <p>Eat apples and grow longer. The edges wrap around, so just don’t bite yourself.</p>
              <button type="button" className="snake-game__primary" onClick={() => updateGame(startGame)}>▶ Start</button>
              <p className="snake-game__hint">Arrow keys / WASD or swipe · Space to pause · M to mute</p>
            </div>
          )}
          {status === 'paused' && (
            <div className="snake-game__overlay" data-testid="snake-paused">
              <h2>Paused</h2>
              <button type="button" className="snake-game__primary" onClick={() => updateGame(startGame)}>▶ Resume</button>
              <p className="snake-game__hint">Press Space to resume</p>
            </div>
          )}
          {status === 'over' && (
            <div className="snake-game__overlay snake-game__overlay--over" data-testid="snake-over">
              <h2>{gameStateRef.current.hasWon ? 'You win!' : 'Game Over'}</h2>
              <p className="snake-game__final-score">Score <b>{score}</b></p>
              {isNewBestScore && score > 0 ? <p className="snake-game__new-best">🏆 New high score!</p> : <p>Best {bestScore}</p>}
              <button type="button" className="snake-game__primary" onClick={restart} data-testid="snake-restart">↻ Restart</button>
              <p className="snake-game__hint">Press Space to play again</p>
            </div>
          )}
        </div>

        <div className="snake-game__dpad" aria-label="Direction buttons">
          <button type="button" className="snake-game__dpad-up" onPointerDown={pressDirectionButton('up')} aria-label="Up">▲</button>
          <button type="button" className="snake-game__dpad-left" onPointerDown={pressDirectionButton('left')} aria-label="Left">◀</button>
          <button type="button" className="snake-game__dpad-center" onClick={handlePrimaryAction}
            aria-label={status === 'running' ? 'Pause' : 'Play'}>{status === 'running' ? '❚❚' : '▶'}</button>
          <button type="button" className="snake-game__dpad-right" onPointerDown={pressDirectionButton('right')} aria-label="Right">▶</button>
          <button type="button" className="snake-game__dpad-down" onPointerDown={pressDirectionButton('down')} aria-label="Down">▼</button>
        </div>
        <p className="snake-game__help">Arrow keys or <b>WASD</b> to steer · <b>Space</b> to pause · <b>M</b> to mute · swipe on mobile</p>
      </div>
    </div>
  );
}
