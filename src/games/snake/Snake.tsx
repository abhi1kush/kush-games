import { useCallback, useEffect, useRef, useState } from 'react';
import {
  changeDirection, createInitialState, Direction, SnakeState, startGame, step, tickInterval, togglePause,
} from './game';
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

/** A red SVG apple centred in grid cell (x, y). */
function Apple({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="snake-game__apple" data-testid="apple">
      <path d="M0.5 0.32 C0.36 0.2 0.12 0.24 0.12 0.52 C0.12 0.78 0.32 0.94 0.5 0.86 C0.68 0.94 0.88 0.78 0.88 0.52 C0.88 0.24 0.64 0.2 0.5 0.32 Z"
        fill="#e3262f" />
      <ellipse cx="0.34" cy="0.46" rx="0.07" ry="0.12" fill="#ff8a8a" opacity="0.8" />
      <path d="M0.5 0.32 Q0.5 0.18 0.56 0.1" stroke="#6b3e1f" strokeWidth="0.06" fill="none" strokeLinecap="round" />
      <path d="M0.55 0.18 Q0.72 0.06 0.82 0.16 Q0.7 0.28 0.55 0.18 Z" fill="#3fbf4a" />
    </g>
  );
}

export default function Snake() {
  const [gameState, setGameState] = useState<SnakeState>(() => createInitialState());
  const [bestScore, setBestScore] = useState(readBestScore);
  const [isNewBestScore, setIsNewBestScore] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { status, score, snake, apple, columns, rows } = gameState;
  const head = snake[0];

  const steerSnake = useCallback((direction: Direction) => {
    setGameState(current => {
      const turned = changeDirection(current, direction);
      return turned.status === 'ready' ? startGame(turned) : turned;
    });
  }, []);

  const restart = useCallback(() => {
    setIsNewBestScore(false);
    setGameState(startGame(createInitialState()));
  }, []);

  const handlePrimaryAction = useCallback(() => {
    if (status === 'over') restart();
    else setGameState(current => togglePause(current));
  }, [status, restart]);

  // Game loop: one step per tick while running. Speed comes from the score.
  const currentTickMs = tickInterval(score);
  useEffect(() => {
    if (status !== 'running') return;
    const timer = window.setInterval(() => setGameState(current => step(current)), currentTickMs);
    return () => window.clearInterval(timer);
  }, [status, currentTickMs]);

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
      const direction = KEY_TO_DIRECTION[event.key];
      if (direction) { event.preventDefault(); steerSnake(direction); return; }
      if (event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); handlePrimaryAction(); return; }
      if (event.key === 'p' || event.key === 'P') { setGameState(current => togglePause(current)); return; }
      if (event.key === 'Enter' && (status === 'ready' || status === 'over')) { event.preventDefault(); handlePrimaryAction(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [steerSnake, handlePrimaryAction, status]);

  // Pause automatically when the tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) setGameState(current => (current.status === 'running' ? togglePause(current) : current));
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Swipe anywhere in the game area. Turns fire during the move, so one gesture can make several turns.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let startX = 0;
    let startY = 0;
    let isTracking = false;
    const handleTouchStart = (event: TouchEvent) => {
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
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);
    return () => {
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
            <button type="button" className="snake-game__pause" onClick={handlePrimaryAction}
              disabled={status === 'over'} data-testid="snake-pause"
              aria-label={status === 'running' ? 'Pause' : 'Resume'}>
              {status === 'running' ? '❚❚' : '▶'}
            </button>
          </div>
        </header>

        <div className="snake-game__board" data-testid="snake-board" data-status={status}
          data-head={`${head.x},${head.y}`} data-length={snake.length} data-direction={gameState.direction}
          data-apple={apple ? `${apple.x},${apple.y}` : ''}>
          <svg viewBox={`0 0 ${columns} ${rows}`} className="snake-game__svg" role="img" aria-label="Snake board">
            <defs>
              <pattern id="snake-checker" width="2" height="2" patternUnits="userSpaceOnUse">
                <rect width="2" height="2" fill="#1b1b1b" />
                <rect width="1" height="1" fill="#202020" />
                <rect x="1" y="1" width="1" height="1" fill="#202020" />
              </pattern>
              <linearGradient id="snake-body" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#5af078" />
                <stop offset="1" stopColor="#1fa84a" />
              </linearGradient>
            </defs>
            <rect width={columns} height={rows} fill="url(#snake-checker)" />
            {apple && <Apple x={apple.x} y={apple.y} />}
            {snake.slice(1).map((segment, segmentIndex) => (
              <rect key={segmentIndex} x={segment.x + 0.06} y={segment.y + 0.06} width={0.88} height={0.88} rx={0.25}
                fill="url(#snake-body)" opacity={Math.max(0.55, 1 - segmentIndex * 0.02)} />
            ))}
            <g className="snake-game__head">
              <rect x={head.x + 0.02} y={head.y + 0.02} width={0.96} height={0.96} rx={0.32} fill="#7dff95" />
              <circle cx={head.x + 0.32} cy={head.y + 0.36} r={0.11} fill="#111" />
              <circle cx={head.x + 0.68} cy={head.y + 0.36} r={0.11} fill="#111" />
            </g>
          </svg>

          {status === 'ready' && (
            <div className="snake-game__overlay" data-testid="snake-start">
              <div className="snake-game__overlay-glyph" aria-hidden="true">🐍🍎</div>
              <h2>Snake</h2>
              <p>Eat apples and grow longer. The edges wrap around, so just don’t bite yourself.</p>
              <button type="button" className="snake-game__primary" onClick={() => setGameState(current => startGame(current))}>
                ▶ Start
              </button>
              <p className="snake-game__hint">Arrow keys / WASD or swipe · Space to pause</p>
            </div>
          )}
          {status === 'paused' && (
            <div className="snake-game__overlay" data-testid="snake-paused">
              <h2>Paused</h2>
              <button type="button" className="snake-game__primary" onClick={() => setGameState(current => startGame(current))}>
                ▶ Resume
              </button>
              <p className="snake-game__hint">Press Space to resume</p>
            </div>
          )}
          {status === 'over' && (
            <div className="snake-game__overlay snake-game__overlay--over" data-testid="snake-over">
              <h2>{gameState.hasWon ? 'You win!' : 'Game Over'}</h2>
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
        <p className="snake-game__help">Arrow keys or <b>WASD</b> to steer · <b>Space</b> to pause · swipe on mobile</p>
      </div>
    </div>
  );
}
