import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAiClient, emptyTally, isTally, Tally, waitAtLeast } from '../aiWorkerClient';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, playSound, unlockAudio, useSharedMute } from '../sharedSound';
import { COLUMNS, computeMoveHere, ConnectFour as Engine, HARD_NODE_BUDGET, loadConnectFourEngine, ROWS } from './engine';
import { createConnectFourSaveSlot, DiscColor, LEVEL_NAMES, PlayMode, SavedConnectFour } from './save';
import '../shared.css';
import './connectfour.css';

const TALLY_STORAGE_KEY = 'kush-games-connect-four-tally';
type Tallies = Record<PlayMode, Tally>;
const otherColor = (color: DiscColor): DiscColor => (color === 'red' ? 'yellow' : 'red');

interface BoardView {
  cells: Uint8Array;
  /** 0 playing, 1/2 the first/second player won, 3 draw. */
  winner: number;
  winningCells: Set<number>;
  playerToMove: number;
  history: number[];
}

const viewOf = (engine: Engine): BoardView => ({
  cells: engine.cells(), winner: engine.winner(), winningCells: new Set(engine.winning_cells()),
  playerToMove: engine.player_to_move(), history: Array.from(engine.history()),
});

const playDropSound = (row: number, isMuted: boolean) =>
  playSound({ tones: [{ frequency: 180 + row * 30, endFrequency: 90 + row * 15, durationSeconds: 0.12, volume: 0.09, type: 'sine' }] }, isMuted);
const playEndSound = (outcome: 'win' | 'lose' | 'draw', isMuted: boolean) => {
  const notes = outcome === 'win' ? [523, 659, 784, 1047] : outcome === 'lose' ? [392, 330, 262] : [440, 440];
  playSound({ tones: notes.map((frequency, index) => ({ frequency, durationSeconds: 0.22, startSeconds: index * 0.11, volume: 0.07 })) }, isMuted);
};

function readTallies(): Tallies {
  const stored = readStoredJson<Partial<Tallies>>(TALLY_STORAGE_KEY, {});
  return { computer: isTally(stored.computer) ? stored.computer : emptyTally(), friends: isTally(stored.friends) ? stored.friends : emptyTally() };
}

/** The Connect Four screen: waits for the wasm, then shows the game. */
export default function ConnectFour() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadConnectFourEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell" data-testid="connect-four-loading"><p className="game-help">Loading…</p></div>;
  return <ConnectFourGame />;
}

function ConnectFourGame() {
  const saveSlot = useMemo(() => createConnectFourSaveSlot(), []);
  const [initialSave] = useState(() => saveSlot.load());
  const engineRef = useRef<Engine>(null as unknown as Engine);
  if (!engineRef.current) {
    engineRef.current = new Engine();
    if (initialSave) engineRef.current.load(Uint8Array.from(initialSave.history));
  }
  const [mode, setMode] = useState<PlayMode>(initialSave?.mode ?? 'computer');
  const [level, setLevel] = useState(initialSave?.level ?? 1);
  const [firstColor, setFirstColor] = useState<DiscColor>(initialSave?.firstColor ?? 'red');
  const [view, setView] = useState<BoardView>(() => viewOf(engineRef.current));
  const [wasRestored, setWasRestored] = useState(() => (initialSave?.history.length ?? 0) > 0);
  const [isThinking, setIsThinking] = useState(false);
  const [lastDrop, setLastDrop] = useState<{ cell: number; row: number } | null>(null);
  const [aiMilliseconds, setAiMilliseconds] = useState<number | null>(null);
  const [tallies, setTallies] = useState<Tallies>(readTallies);
  const [hoverColumn, setHoverColumn] = useState<number | null>(null);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const requestIdRef = useRef(0);
  const settingsRef = useRef({ mode, level, firstColor });
  settingsRef.current = { mode, level, firstColor };
  const aiClient = useMemo(() => createAiClient(() => new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' }), computeMoveHere), []);
  useEffect(() => () => { aiClient.dispose(); engineRef.current.free(); }, [aiClient]);

  const colorOfPlayer = (player: number, first = firstColor): DiscColor => (player === 0 ? first : otherColor(first));
  const colorToMove = colorOfPlayer(view.playerToMove);
  const isComputerTurn = mode === 'computer' && view.winner === 0 && colorToMove === 'yellow';

  const persist = useCallback((engine: Engine, settings: Omit<SavedConnectFour, 'history'>) => {
    const history = Array.from(engine.history());
    if (history.length === 0 || engine.winner() !== 0) saveSlot.clear();
    else saveSlot.save({ ...settings, history });
  }, [saveSlot]);

  const finishGame = useCallback((engine: Engine) => {
    const winner = engine.winner();
    if (winner === 0) return;
    const { mode: currentMode, firstColor: first } = settingsRef.current;
    const winnerColor = winner === 3 ? null : (winner === 1 ? first : otherColor(first));
    setTallies(previous => {
      const tally = { ...previous[currentMode] };
      if (winnerColor === null) tally.draws++; else if (winnerColor === 'red') tally.first++; else tally.second++;
      const updated = { ...previous, [currentMode]: tally };
      saveStoredJson(TALLY_STORAGE_KEY, updated);
      return updated;
    });
    const outcome = winnerColor === null ? 'draw' : currentMode === 'friends' || winnerColor === 'red' ? 'win' : 'lose';
    playEndSound(outcome, isMutedRef.current);
  }, [isMutedRef]);

  const dropDisc = useCallback((column: number) => {
    const engine = engineRef.current;
    const row = engine.play(column);
    if (row < 0) return false;
    playDropSound(row, isMutedRef.current);
    setLastDrop({ cell: column * ROWS + row, row });
    setView(viewOf(engine));
    setWasRestored(false);
    persist(engine, settingsRef.current);
    finishGame(engine);
    return true;
  }, [finishGame, isMutedRef, persist]);

  // Ask the computer for a move whenever it's its turn.
  useEffect(() => {
    if (!isComputerTurn) return;
    const requestId = ++requestIdRef.current;
    setIsThinking(true);
    const request = { history: view.history, level, seed: (Date.now() & 0xffff) + view.history.length, budget: HARD_NODE_BUDGET };
    void waitAtLeast(aiClient.request(request), 380).then(result => {
      if (requestId !== requestIdRef.current) return; // the game changed meanwhile
      setIsThinking(false);
      setAiMilliseconds(Math.round(result.milliseconds));
      if (result.move >= 0) dropDisc(result.move);
    });
  }, [aiClient, dropDisc, isComputerTurn, level, view.history]);

  const handleColumn = (column: number) => {
    if (view.winner !== 0 || isComputerTurn || isThinking) return;
    unlockAudio();
    dropDisc(column);
  };

  const startNewGame = useCallback((settings: Partial<{ mode: PlayMode; level: number; alternate: boolean }> = {}) => {
    requestIdRef.current++;
    setIsThinking(false);
    const nextMode = settings.mode ?? settingsRef.current.mode;
    const nextLevel = settings.level ?? settingsRef.current.level;
    const nextFirst = settings.alternate ? otherColor(settingsRef.current.firstColor) : settingsRef.current.firstColor;
    engineRef.current.load(new Uint8Array());
    setMode(nextMode);
    setLevel(nextLevel);
    setFirstColor(nextFirst);
    setLastDrop(null);
    setWasRestored(false);
    setView(viewOf(engineRef.current));
    saveSlot.clear();
  }, [saveSlot]);

  const undo = useCallback(() => {
    const engine = engineRef.current;
    requestIdRef.current++;
    setIsThinking(false);
    if (!engine.undo()) return;
    // against the computer, also take back its reply so it's your turn again
    const { mode: currentMode, firstColor: first } = settingsRef.current;
    const isYellowToMove = () => (engine.player_to_move() === 0 ? first : otherColor(first)) === 'yellow';
    if (currentMode === 'computer' && isYellowToMove() && engine.history().length > 0) engine.undo();
    setLastDrop(null);
    setView(viewOf(engine));
    persist(engine, settingsRef.current);
  }, [persist]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const column = Number(event.key) - 1;
      if (column >= 0 && column < COLUMNS) handleColumn(column);
      else if (event.key.toLowerCase() === 'u') undo();
      else if (event.key.toLowerCase() === 'n') startNewGame({ alternate: true });
      else if (event.key.toLowerCase() === 'm') toggleMute();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const tally = tallies[mode];
  const statusText = view.winner === 3 ? 'Draw — the board is full.'
    : view.winner !== 0 ? (mode === 'computer' ? (colorOfPlayer(view.winner - 1) === 'red' ? 'You win! 🎉' : 'The computer wins.') : `${colorOfPlayer(view.winner - 1) === 'red' ? 'Red' : 'Yellow'} wins! 🎉`)
    : mode === 'computer' ? (isComputerTurn ? 'Computer is thinking…' : 'Your turn (red)') : `${colorToMove === 'red' ? 'Red' : 'Yellow'} to play`;

  return (
    <div className="game-shell connect-four" data-testid="connect-four" data-mode={mode} data-level={level} data-winner={view.winner}
      data-moves={view.history.length} data-thinking={isThinking} data-ai-ms={aiMilliseconds ?? ''}>
      <div className="game-shell__header">
        <div className="game-segments" role="group" aria-label="Opponent">
          <button type="button" className={mode === 'computer' ? 'is-selected' : ''} onClick={() => startNewGame({ mode: 'computer' })} data-testid="c4-mode-computer">vs Computer</button>
          <button type="button" className={mode === 'friends' ? 'is-selected' : ''} onClick={() => startNewGame({ mode: 'friends' })} data-testid="c4-mode-friends">2 Players</button>
        </div>
        {mode === 'computer' && (
          <div className="game-segments" role="group" aria-label="Difficulty">
            {LEVEL_NAMES.map((name, index) => (
              <button type="button" key={name} className={level === index ? 'is-selected' : ''} onClick={() => startNewGame({ level: index })} data-testid={`c4-level-${index}`}>{name}</button>
            ))}
          </div>
        )}
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="game-shell__stats">
        <div className="game-stat"><span>{mode === 'computer' ? 'You' : 'Red'}</span><b data-testid="c4-tally-red">{tally.first}</b></div>
        <div className="game-stat"><span>Draws</span><b>{tally.draws}</b></div>
        <div className="game-stat"><span>{mode === 'computer' ? 'Computer' : 'Yellow'}</span><b data-testid="c4-tally-yellow">{tally.second}</b></div>
      </div>
      {wasRestored && <p className="game-restored" data-testid="restored">💾 Saved game restored</p>}
      <p className={`game-banner ${view.winner === 0 ? 'game-banner--info' : view.winner === 3 || mode === 'friends' || colorOfPlayer(view.winner - 1) === 'red' ? 'game-banner--win' : 'game-banner--lose'}`}
        data-testid="c4-status">
        {view.winner === 0 && <i className={`c4-turn-disc c4-turn-disc--${colorToMove}`} aria-hidden="true" />}{statusText}
      </p>
      <div className="c4-board" data-testid="c4-board" onPointerLeave={() => setHoverColumn(null)}>
        {Array.from({ length: COLUMNS }, (_, column) => (
          <button type="button" key={column} className={`c4-column${hoverColumn === column && view.winner === 0 && !isComputerTurn ? ' is-hovered' : ''}`}
            onClick={() => handleColumn(column)} onPointerEnter={() => setHoverColumn(column)} aria-label={`Drop in column ${column + 1}`}
            data-testid={`c4-column-${column}`} disabled={view.cells[column * ROWS + ROWS - 1] !== 0}>
            {Array.from({ length: ROWS }, (_, rowFromTop) => {
              const row = ROWS - 1 - rowFromTop;
              const cell = column * ROWS + row;
              const owner = view.cells[cell];
              const color = owner === 0 ? null : colorOfPlayer(owner - 1);
              const isNew = lastDrop?.cell === cell;
              return (
                <span key={row} className="c4-cell">
                  {color && <i className={`c4-disc c4-disc--${color}${view.winningCells.has(cell) ? ' is-winning' : ''}${isNew ? ' is-dropping' : ''}`}
                    style={isNew ? { ['--drop-rows' as string]: ROWS - row } : undefined} data-testid="c4-disc" data-color={color} />}
                </span>
              );
            })}
          </button>
        ))}
      </div>
      <div className="game-actions">
        <button type="button" className="game-button" onClick={undo} disabled={view.history.length === 0} data-testid="c4-undo">↶ Undo</button>
        <button type="button" className="game-button game-button--primary" onClick={() => startNewGame({ alternate: true })} data-testid="c4-new">New game</button>
      </div>
      <p className="game-help">
        Drop discs to line up four in a row — across, up or diagonally. Keys 1–7 drop, U undo, N new game.
        {aiMilliseconds !== null && mode === 'computer' && <> Computer thought for {aiMilliseconds} ms.</>}
      </p>
    </div>
  );
}
