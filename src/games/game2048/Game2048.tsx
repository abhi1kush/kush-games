// 2048 game component, adapted from https://github.com/abhi1kush/2048 (src/App.tsx).
// Changes: renamed to Game2048, CSS scoped under .game-2048, readable names.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Direction, GameState, move, newGame } from './game';
import './game2048.css';

const BEST_SCORE_STORAGE_KEY = '2048-best';
const MINIMUM_SWIPE_DISTANCE = 24;
const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

function readBestScore(): number {
  try { return Number(localStorage.getItem(BEST_SCORE_STORAGE_KEY)) || 0; } catch { return 0; }
}

export default function Game2048() {
  const [gameState, setGameState] = useState<GameState>(() => newGame());
  const [bestScore, setBestScore] = useState(readBestScore);
  const boardRef = useRef<HTMLDivElement>(null);

  const moveTiles = useCallback((direction: Direction) => setGameState(current => move(current, direction)), []);
  const restart = useCallback(() => setGameState(newGame()), []);

  useEffect(() => {
    if (gameState.score > bestScore) {
      setBestScore(gameState.score);
      try { localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(gameState.score)); } catch { /* storage unavailable */ }
    }
  }, [gameState.score, bestScore]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const direction = KEY_TO_DIRECTION[event.key];
      if (direction) { event.preventDefault(); moveTiles(direction); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveTiles]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    let startX = 0;
    let startY = 0;
    let isTracking = false;
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      isTracking = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };
    const handleTouchMove = (event: TouchEvent) => { if (isTracking) event.preventDefault(); };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!isTracking) return;
      isTracking = false;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < MINIMUM_SWIPE_DISTANCE) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) moveTiles(deltaX > 0 ? 'right' : 'left');
      else moveTiles(deltaY > 0 ? 'down' : 'up');
    };
    board.addEventListener('touchstart', handleTouchStart, { passive: true });
    board.addEventListener('touchmove', handleTouchMove, { passive: false });
    board.addEventListener('touchend', handleTouchEnd);
    return () => {
      board.removeEventListener('touchstart', handleTouchStart);
      board.removeEventListener('touchmove', handleTouchMove);
      board.removeEventListener('touchend', handleTouchEnd);
    };
  }, [moveTiles]);

  const showWinOverlay = gameState.won && !gameState.keepPlaying;
  return (
    <div className="game-2048" data-testid="game-2048">
      <div className="game-2048__container">
        <header className="game-2048__header">
          <h1>2048</h1>
          <div className="game-2048__scores">
            <div className="game-2048__score" data-testid="score"><span>Score</span>{gameState.score}</div>
            <div className="game-2048__score"><span>Best</span>{bestScore}</div>
          </div>
        </header>
        <div className="game-2048__bar">
          <p>Join the tiles, get to <b>2048!</b></p>
          <button type="button" onClick={restart}>New Game</button>
        </div>
        <div className="game-2048__board" ref={boardRef} data-testid="board">
          {Array.from({ length: 16 }, (_, cellIndex) => (
            <div key={cellIndex} className="game-2048__cell"
              style={{ ['--row' as string]: Math.floor(cellIndex / 4), ['--col' as string]: cellIndex % 4 }} />
          ))}
          {gameState.tiles.map(tile => (
            <div key={tile.id} className="game-2048__tile" data-value={tile.value}
              style={{ ['--row' as string]: tile.row, ['--col' as string]: tile.col }}>
              <div key={`${tile.id}-${tile.value}`}
                className={`game-2048__inner v${tile.value > 2048 ? 'super' : tile.value}${tile.merged ? ' merged' : ''}${tile.isNew ? ' new' : ''}`}>
                {tile.value}
              </div>
            </div>
          ))}
          {(showWinOverlay || gameState.over) && (
            <div className={`game-2048__overlay ${showWinOverlay ? 'win' : ''}`}>
              <h2>{showWinOverlay ? 'You win!' : 'Game over!'}</h2>
              <div>
                {showWinOverlay && (
                  <button type="button" onClick={() => setGameState(current => ({ ...current, keepPlaying: true }))}>Keep going</button>
                )}
                <button type="button" onClick={restart}>Try again</button>
              </div>
            </div>
          )}
        </div>
        <p className="game-2048__help">Use <b>arrow keys</b> or <b>WASD</b> — or swipe on mobile.</p>
      </div>
    </div>
  );
}
