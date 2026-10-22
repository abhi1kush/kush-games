import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createAiClient, emptyTally, isTally, Tally, waitAtLeast } from '../aiWorkerClient';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, playSound, unlockAudio, useSharedMute } from '../sharedSound';
import { Checkers as Engine, CheckersMove, computeMoveHere, decodeMoves, HARD_NODE_BUDGET, loadCheckersEngine, squareColumn, squareRow } from './engine';
import { createCheckersSaveSlot, LEVEL_NAMES, PlayMode } from './save';
import '../shared.css';
import './checkers.css';

const TALLY_STORAGE_KEY = 'kush-games-checkers-tally';
type Tallies = Record<PlayMode, Tally>;
const DARK = 0;

interface BoardView {
  cells: Uint8Array;
  moves: CheckersMove[];
  sideToMove: number;
  /** 0 playing, 1 dark won, 2 light won, 3 draw. */
  winner: number;
  history: number[];
  mustCapture: boolean;
}
const viewOf = (engine: Engine): BoardView => {
  const moves = decodeMoves(engine.legal_moves());
  return { cells: engine.cells(), moves, sideToMove: engine.side_to_move(), winner: engine.winner(), history: Array.from(engine.history()), mustCapture: moves.some(move => move.captured.length > 0) };
};

const playMoveSound = (isCapture: boolean, isMuted: boolean) => playSound(isCapture
  ? { tones: [{ frequency: 520, endFrequency: 260, durationSeconds: 0.12, volume: 0.07, type: 'square' }], noises: [{ durationSeconds: 0.05, volume: 0.05, filterFrequency: 1600 }] }
  : { noises: [{ durationSeconds: 0.05, volume: 0.06, filterFrequency: 900 }] }, isMuted);
const playCrownSound = (isMuted: boolean) => playSound({ tones: [880, 1175].map((frequency, index) => ({ frequency, durationSeconds: 0.16, startSeconds: index * 0.08, volume: 0.05 })) }, isMuted);
const playEndSound = (didWin: boolean, isMuted: boolean) =>
  playSound({ tones: (didWin ? [523, 659, 784, 1047] : [392, 330, 262]).map((frequency, index) => ({ frequency, durationSeconds: 0.22, startSeconds: index * 0.11, volume: 0.07 })) }, isMuted);

function readTallies(): Tallies {
  const stored = readStoredJson<Partial<Tallies>>(TALLY_STORAGE_KEY, {});
  return { computer: isTally(stored.computer) ? stored.computer : emptyTally(), friends: isTally(stored.friends) ? stored.friends : emptyTally() };
}

export default function CheckersScreen() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadCheckersEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell" data-testid="checkers-loading"><p className="game-help">Loading…</p></div>;
  return <CheckersGame />;
}

function CheckersGame() {
  const saveSlot = useMemo(() => createCheckersSaveSlot(), []);
  const [initialSave] = useState(() => saveSlot.load());
  const engineRef = useRef<Engine>(null as unknown as Engine);
  if (!engineRef.current) {
    engineRef.current = new Engine();
    if (initialSave && !engineRef.current.load(Uint8Array.from(initialSave.history))) engineRef.current.load(new Uint8Array());
  }
  const [mode, setMode] = useState<PlayMode>(initialSave?.mode ?? 'computer');
  const [level, setLevel] = useState(initialSave?.level ?? 1);
  const [view, setView] = useState<BoardView>(() => viewOf(engineRef.current));
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<CheckersMove | null>(null);
  const [wasRestored, setWasRestored] = useState(() => (initialSave?.history.length ?? 0) > 0);
  const [isThinking, setIsThinking] = useState(false);
  const [aiMilliseconds, setAiMilliseconds] = useState<number | null>(null);
  const [tallies, setTallies] = useState<Tallies>(readTallies);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const requestIdRef = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef({ mode, level });
  settingsRef.current = { mode, level };
  const aiClient = useMemo(() => createAiClient(() => new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' }), computeMoveHere), []);
  useEffect(() => () => { aiClient.dispose(); engineRef.current.free(); }, [aiClient]);

  const isComputerTurn = mode === 'computer' && view.winner === 0 && view.sideToMove !== DARK;

  const persist = useCallback((engine: Engine) => {
    const history = Array.from(engine.history());
    if (history.length === 0 || engine.winner() !== 0) saveSlot.clear();
    else saveSlot.save({ ...settingsRef.current, history });
  }, [saveSlot]);

  const playMove = useCallback((move: CheckersMove) => {
    const engine = engineRef.current;
    const wasKing = engine.cells()[move.from] % 2 === 0;
    if (!engine.apply(move.index)) return;
    const after = viewOf(engine);
    const crowned = !wasKing && after.cells[move.to] % 2 === 0;
    playMoveSound(move.captured.length > 0, isMutedRef.current);
    if (crowned) playCrownSound(isMutedRef.current);
    setLastMove(move);
    setSelected(null);
    setWasRestored(false);
    setView(after);
    persist(engine);
    if (after.winner !== 0) {
      const { mode: currentMode } = settingsRef.current;
      setTallies(previous => {
        const tally = { ...previous[currentMode] };
        if (after.winner === 1) tally.first++; else if (after.winner === 2) tally.second++; else tally.draws++;
        const updated = { ...previous, [currentMode]: tally };
        saveStoredJson(TALLY_STORAGE_KEY, updated);
        return updated;
      });
      playEndSound(currentMode === 'friends' || after.winner === 1, isMutedRef.current);
    }
  }, [isMutedRef, persist]);

  // Slide the moved piece along its path (and fade captured pieces) with Web Animations: no React work per frame.
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!lastMove || !board) return;
    const piece = board.querySelector<HTMLElement>(`[data-square="${lastMove.to}"] .checkers-piece`);
    const cellSize = board.clientWidth / 8;
    const end = { x: squareColumn(lastMove.to), y: squareRow(lastMove.to) };
    const points = [lastMove.from, ...lastMove.path].map(square => ({ x: (squareColumn(square) - end.x) * cellSize, y: (squareRow(square) - end.y) * cellSize }));
    const animation = piece?.animate(points.map(point => ({ transform: `translate(${point.x}px, ${point.y}px)` })), { duration: 160 * lastMove.path.length + 60, easing: 'ease-in-out' });
    return () => animation?.cancel();
  }, [lastMove]);

  // Computer's turn.
  useEffect(() => {
    if (!isComputerTurn) return;
    const requestId = ++requestIdRef.current;
    setIsThinking(true);
    const request = { history: view.history, level, seed: (Date.now() & 0xffff) + view.history.length, budget: HARD_NODE_BUDGET };
    void waitAtLeast(aiClient.request(request), 420).then(result => {
      if (requestId !== requestIdRef.current) return;
      setIsThinking(false);
      setAiMilliseconds(Math.round(result.milliseconds));
      const move = view.moves[result.move];
      if (move) playMove(move);
    });
  }, [aiClient, isComputerTurn, level, playMove, view]);

  const handleSquare = (square: number) => {
    if (view.winner !== 0 || isComputerTurn || isThinking) return;
    unlockAudio();
    const owner = view.cells[square];
    const ownsPiece = owner !== 0 && (owner <= 2 ? DARK : 1) === view.sideToMove;
    if (ownsPiece) { setSelected(view.moves.some(move => move.from === square) ? square : null); return; }
    if (selected === null) return;
    const move = view.moves.find(candidate => candidate.from === selected && candidate.to === square);
    if (move) playMove(move); else setSelected(null);
  };

  const startNewGame = useCallback((settings: Partial<{ mode: PlayMode; level: number }> = {}) => {
    requestIdRef.current++;
    setIsThinking(false);
    engineRef.current.load(new Uint8Array());
    if (settings.mode) setMode(settings.mode);
    if (settings.level !== undefined) setLevel(settings.level);
    setSelected(null);
    setLastMove(null);
    setWasRestored(false);
    setView(viewOf(engineRef.current));
    saveSlot.clear();
  }, [saveSlot]);

  const undo = useCallback(() => {
    const engine = engineRef.current;
    requestIdRef.current++;
    setIsThinking(false);
    if (!engine.undo(1)) return;
    if (settingsRef.current.mode === 'computer' && engine.side_to_move() !== DARK && engine.history().length > 0) engine.undo(1);
    setSelected(null);
    setLastMove(null);
    setView(viewOf(engine));
    persist(engine);
  }, [persist]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'u') undo(); else if (key === 'n') startNewGame(); else if (key === 'm') toggleMute(); else if (key === 'escape') setSelected(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [startNewGame, toggleMute, undo]);

  const movablePieces = useMemo(() => new Set(view.moves.map(move => move.from)), [view.moves]);
  const targets = useMemo(() => new Set(view.moves.filter(move => move.from === selected).map(move => move.to)), [view.moves, selected]);
  const tally = tallies[mode];
  const pieceCount = (owner: 1 | 3) => view.cells.filter(cell => cell === owner || cell === owner + 1).length;
  const sideName = (side: number) => (side === DARK ? 'Dark' : 'Light');
  const status = view.winner === 3 ? 'Draw — 40 moves each without a capture.'
    : view.winner !== 0 ? (mode === 'computer' ? (view.winner === 1 ? 'You win! 🎉' : 'The computer wins.') : `${sideName(view.winner - 1)} wins! 🎉`)
    : isComputerTurn ? 'Computer is thinking…'
    : `${mode === 'computer' ? 'Your move' : `${sideName(view.sideToMove)} to move`}${view.mustCapture ? ' — you must capture!' : ''}`;

  return (
    <div className="game-shell checkers" data-testid="checkers" data-mode={mode} data-level={level} data-winner={view.winner} data-plies={view.history.length}
      data-side={view.sideToMove} data-thinking={isThinking} data-must-capture={view.mustCapture} data-ai-ms={aiMilliseconds ?? ''}>
      <div className="game-shell__header">
        <div className="game-segments" role="group" aria-label="Opponent">
          <button type="button" className={mode === 'computer' ? 'is-selected' : ''} onClick={() => startNewGame({ mode: 'computer' })} data-testid="checkers-mode-computer">vs Computer</button>
          <button type="button" className={mode === 'friends' ? 'is-selected' : ''} onClick={() => startNewGame({ mode: 'friends' })} data-testid="checkers-mode-friends">2 Players</button>
        </div>
        {mode === 'computer' && (
          <div className="game-segments" role="group" aria-label="Difficulty">
            {LEVEL_NAMES.map((name, index) => (
              <button type="button" key={name} className={level === index ? 'is-selected' : ''} onClick={() => startNewGame({ level: index })} data-testid={`checkers-level-${index}`}>{name}</button>
            ))}
          </div>
        )}
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="game-shell__stats">
        <div className="game-stat"><span>{mode === 'computer' ? 'You' : 'Dark'}</span><b>{tally.first}</b></div>
        <div className="game-stat"><span>Draws</span><b>{tally.draws}</b></div>
        <div className="game-stat"><span>{mode === 'computer' ? 'Computer' : 'Light'}</span><b>{tally.second}</b></div>
        <div className="game-stat"><span>Pieces</span><b data-testid="checkers-pieces">{pieceCount(1)}–{pieceCount(3)}</b></div>
      </div>
      {wasRestored && <p className="game-restored" data-testid="restored">💾 Saved game restored</p>}
      <p className={`game-banner ${view.winner === 0 ? (view.mustCapture && !isComputerTurn ? 'game-banner--lose' : 'game-banner--info') : view.winner === 1 || mode === 'friends' || view.winner === 3 ? 'game-banner--win' : 'game-banner--lose'}`}
        data-testid="checkers-status">{status}</p>
      <div className={`checkers-board${isComputerTurn ? ' is-waiting' : ''}`} ref={boardRef} data-testid="checkers-board">
        {Array.from({ length: 64 }, (_, cellIndex) => {
          const row = Math.floor(cellIndex / 8), column = cellIndex % 8;
          if ((row + column) % 2 === 0) return <div key={cellIndex} className="checkers-cell is-light" />;
          const square = row * 4 + Math.floor(column / 2);
          const owner = view.cells[square];
          const isMovable = !isComputerTurn && view.winner === 0 && movablePieces.has(square);
          const wasJumped = lastMove?.captured.includes(square);
          return (
            <button type="button" key={cellIndex} className={`checkers-cell${selected === square ? ' is-selected' : ''}${targets.has(square) ? ' is-target' : ''}${lastMove && (lastMove.from === square || lastMove.to === square) ? ' is-last' : ''}`}
              data-square={square} data-testid="checkers-square" onClick={() => handleSquare(square)} aria-label={`Square ${square + 1}`}>
              {owner !== 0 && (
                <i className={`checkers-piece ${owner <= 2 ? 'is-dark' : 'is-light'}${owner % 2 === 0 ? ' is-king' : ''}${isMovable ? ' is-movable' : ''}${isMovable && view.mustCapture ? ' must-capture' : ''}`}
                  data-piece={owner} />
              )}
              {wasJumped && owner === 0 && <i key={view.history.length} className="checkers-piece is-captured" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="game-actions">
        <button type="button" className="game-button" onClick={undo} disabled={view.history.length === 0} data-testid="checkers-undo">↶ Undo</button>
        <button type="button" className="game-button game-button--primary" onClick={() => startNewGame()} data-testid="checkers-new">New game</button>
      </div>
      <p className="game-help">
        Tap a piece, then a highlighted square. Captures are compulsory and jumps continue while they can; reach the far row to crown a king.
        {aiMilliseconds !== null && mode === 'computer' && <> {aiMilliseconds < 1 ? "Computer's reply was forced." : `Computer thought for ${aiMilliseconds} ms.`}</>}
      </p>
    </div>
  );
}
