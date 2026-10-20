import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { canvasPixelSize, diffBoard } from './boardDiff';
import { CanvasBoardRenderer } from './canvasRenderer';
import {
  changeDirection, CONSTANT_SPEEDS, createInitialState, currentTickMs, describeSpeedSetting, Direction, formatMultiplier,
  GameStatus, setSpeed, SnakeState, SpeedSetting, speedMultiplier, startGame, step, togglePause,
} from './game';
import { BestScoreDetails, readBestDetails, readBestScore, readSpeedSetting, saveBestScore, saveSpeedSetting } from './settings';
import { getChompsPlayed, playChomp, readMuted, saveMuted, unlockAudio } from './sound';
import './snake.css';

const MINIMUM_SWIPE_DISTANCE = 24;
const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

/** Order the header chip cycles through: speeding up, then each constant speed. */
const SPEED_CYCLE: SpeedSetting[] = [
  { mode: 'speeding-up', constantSpeed: 'normal' },
  ...CONSTANT_SPEEDS.map(option => ({ mode: 'constant' as const, constantSpeed: option.id })),
];
const sameSpeedSetting = (first: SpeedSetting, second: SpeedSetting) =>
  first.mode === second.mode && (first.mode === 'speeding-up' || first.constantSpeed === second.constantSpeed);

interface SpeedPickerProps { speed: SpeedSetting; onChange: (speed: SpeedSetting) => void; }

/** Segmented toggle shown on the Start and Game Over screens. */
function SpeedPicker({ speed, onChange }: SpeedPickerProps) {
  const isConstant = speed.mode === 'constant';
  return (
    <div className="snake-speed" data-testid="snake-speed-picker">
      <div className="snake-speed__segments" role="radiogroup" aria-label="Speed mode">
        <button type="button" role="radio" aria-checked={!isConstant} className={!isConstant ? 'is-selected' : ''}
          onClick={() => onChange({ ...speed, mode: 'speeding-up' })}>⚡ Speeding up</button>
        <button type="button" role="radio" aria-checked={isConstant} className={isConstant ? 'is-selected' : ''}
          onClick={() => onChange({ ...speed, mode: 'constant' })}>⏱ Constant</button>
      </div>
      <div className={`snake-speed__segments snake-speed__segments--small ${isConstant ? '' : 'is-inactive'}`}
        role="radiogroup" aria-label="Constant speed">
        {CONSTANT_SPEEDS.map(option => {
          const selected = isConstant && speed.constantSpeed === option.id;
          return (
            <button type="button" role="radio" key={option.id} aria-checked={selected} className={selected ? 'is-selected' : ''}
              onClick={() => onChange({ mode: 'constant', constantSpeed: option.id })}>
              {option.label}<small>{formatMultiplier(speedMultiplier(option.tickMs))}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Float a "+N" over the eaten apple. One reused element, animated on the compositor. */
function showFloatingPoints(element: HTMLDivElement | null, cell: { x: number; y: number }, columns: number, rows: number, points: number) {
  if (!element) return;
  element.textContent = `+${points}`;
  element.style.left = `${((cell.x + 0.5) / columns) * 100}%`;
  element.style.top = `${((cell.y + 0.5) / rows) * 100}%`;
  element.animate?.(
    [{ opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%, -190%) scale(1.15)' }],
    { duration: 750, easing: 'ease-out', fill: 'forwards' },
  );
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
  setIfChanged('data-tick-ms', previous ? String(currentTickMs(previous)) : null, String(currentTickMs(next)));
  setIfChanged('data-apples', previous ? String(previous.applesEaten) : null, String(next.applesEaten));
  setIfChanged('data-last-points', previous ? String(previous.lastApplePoints) : null, String(next.lastApplePoints));
  setIfChanged('data-speed-mode', previous ? previous.speed.mode : null, next.speed.mode);
  setIfChanged('data-score', previous ? String(previous.score) : null, String(next.score));
}

/**
 * Snake on a single canvas. The game state lives in a ref and the game loop draws only the
 * changed cells; React re-renders only when score, status, best score or mute change.
 */
export default function Snake() {
  const speedSettingRef = useRef<SpeedSetting>(readSpeedSetting());
  const [speedSetting, setSpeedSetting] = useState<SpeedSetting>(speedSettingRef.current);
  const gameStateRef = useRef<SnakeState>(createInitialState(undefined, undefined, undefined, speedSettingRef.current));
  const [status, setStatus] = useState<GameStatus>(gameStateRef.current.status);
  const [score, setScore] = useState(0);
  const [tickMs, setTickMs] = useState(() => currentTickMs(gameStateRef.current));
  const [bestScore, setBestScore] = useState(readBestScore);
  const [bestDetails, setBestDetails] = useState<BestScoreDetails | null>(readBestDetails);
  const floatingPointsRef = useRef<HTMLDivElement>(null);
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
    const nextTickMs = currentTickMs(nextState);
    if (nextTickMs !== currentTickMs(previousState)) setTickMs(nextTickMs);
    if (nextState.score !== previousState.score) {
      setScore(nextState.score);
      if (nextState.applesEaten > previousState.applesEaten) {
        showFloatingPoints(floatingPointsRef.current, nextState.snake[0], nextState.columns, nextState.rows, nextState.lastApplePoints);
        if (!isMutedRef.current) {
          playChomp();
          boardRef.current?.setAttribute('data-chomps', String(getChompsPlayed()));
        }
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
    const freshGame = startGame(createInitialState(undefined, undefined, undefined, speedSettingRef.current));
    const previousState = gameStateRef.current;
    gameStateRef.current = freshGame;
    rendererRef.current?.drawFull(freshGame);
    syncBoardAttributes(boardRef.current, previousState, freshGame);
    setStatus(freshGame.status);
    setScore(0);
    setTickMs(currentTickMs(freshGame));
  }, []);

  /** Pick a speed mode. Ignored mid-game; applies now on the Start screen, or at the next restart after Game Over. */
  const chooseSpeed = useCallback((speed: SpeedSetting) => {
    const currentStatus = gameStateRef.current.status;
    if (currentStatus === 'running' || currentStatus === 'paused') return;
    speedSettingRef.current = speed;
    setSpeedSetting(speed);
    saveSpeedSetting(speed);
    if (currentStatus === 'ready') updateGame(current => setSpeed(current, speed));
  }, [updateGame]);

  const cycleSpeed = useCallback(() => {
    const currentIndex = SPEED_CYCLE.findIndex(option => sameSpeedSetting(option, speedSettingRef.current));
    chooseSpeed(SPEED_CYCLE[(currentIndex + 1) % SPEED_CYCLE.length]);
  }, [chooseSpeed]);

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

  // Game loop at the tick rate; only runs while playing. tickMs only changes when an apple speeds it up.
  useEffect(() => {
    if (status !== 'running') return;
    const timer = window.setInterval(() => commitGameState(step(gameStateRef.current)), tickMs);
    return () => window.clearInterval(timer);
  }, [status, tickMs, commitGameState]);

  // One shared high score (scoring is fair across modes), remembering the mode it was set in.
  useEffect(() => {
    if (score > bestScore) {
      const details = { speedLabel: describeSpeedSetting(gameStateRef.current.speed), length: gameStateRef.current.snake.length };
      setBestScore(score);
      setBestDetails(details);
      setIsNewBestScore(true);
      saveBestScore(score, details);
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
      // Swipes may start anywhere, even on overlay buttons (a tap still clicks); only the D-pad is excluded.
      if (event.touches.length !== 1 || target.closest('.snake-game__dpad, .snake-game__header')) return;
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

  const isPlaying = status === 'running' || status === 'paused';
  const currentMultiplier = speedMultiplier(tickMs);
  const finalState = gameStateRef.current;

  return (
    <div className="snake-game" ref={containerRef} data-testid="snake-game">
      <div className="snake-game__container">
        <header className="snake-game__header">
          <h1 className="snake-game__title"><span aria-hidden="true">🐍</span> Snake</h1>
          <button type="button" className="snake-game__speed-chip" onClick={cycleSpeed} data-testid="snake-speed-chip"
            disabled={isPlaying}
            title={isPlaying ? `${describeSpeedSetting(speedSetting)} – change it on the Start or Game Over screen`
              : `${describeSpeedSetting(speedSetting)} – click to change`}
            aria-label={`Speed: ${describeSpeedSetting(speedSetting)}, multiplier ${formatMultiplier(currentMultiplier)}`}>
            <span aria-hidden="true">{speedSetting.mode === 'constant' ? '⏱' : '⚡'}</span>
            <b data-testid="snake-multiplier">{formatMultiplier(currentMultiplier)}</b>
          </button>
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
          <div className="snake-game__floating-points" ref={floatingPointsRef} data-testid="snake-floating-points" aria-hidden="true" />

          {status === 'ready' && (
            <div className="snake-game__overlay" data-testid="snake-start">
              <div className="snake-game__overlay-glyph" aria-hidden="true">🐍🍎</div>
              <h2>Snake</h2>
              <p className="snake-game__intro">Eat apples and grow longer. The edges wrap around, so just don’t bite yourself.</p>
              <SpeedPicker speed={speedSetting} onChange={chooseSpeed} />
              <p className="snake-game__scoring">Each apple: <b>10 × speed × length bonus</b></p>
              <button type="button" className="snake-game__primary" onClick={() => updateGame(startGame)} data-testid="snake-start-button">▶ Start</button>
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
              <h2>{finalState.hasWon ? 'You win!' : 'Game Over'}</h2>
              <dl className="snake-game__stats" data-testid="snake-over-stats">
                <div><dt>Length</dt><dd>{finalState.snake.length}</dd></div>
                <div><dt>Speed</dt><dd>{formatMultiplier(currentMultiplier)}<small>{describeSpeedSetting(finalState.speed)}</small></dd></div>
                <div><dt>Score</dt><dd>{score}</dd></div>
              </dl>
              {isNewBestScore && score > 0
                ? <p className="snake-game__new-best">🏆 New high score!</p>
                : <p className="snake-game__best-line">Best {bestScore}{bestDetails ? ` · ${bestDetails.speedLabel}` : ''}</p>}
              <SpeedPicker speed={speedSetting} onChange={chooseSpeed} />
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
