import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAiClient, emptyTally, isTally, Tally, waitAtLeast } from '../aiWorkerClient';
import { readStoredJson, saveStoredJson } from '../random';
import { OnlineLobbyCard } from '../online/OnlineUI';
import { useOnlineScreen } from '../online/useOnlineScreen';
import { MuteButton, unlockAudio, useSharedMute } from '../sharedSound';
import CheckersBoard from './Board';
import CheckersOnline, { createCheckersOnlineSlot } from './CheckersOnline';
import { Checkers as Engine, CheckersMove, computeMoveHere, decodeMoves, HARD_NODE_BUDGET, loadCheckersEngine } from './engine';
import { checkersRules } from './rules';
import { createCheckersSaveSlot, LEVEL_NAMES, PlayMode } from './save';
import { playCrownSound, playEndSound, playMoveSound } from './sounds';
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
  return <CheckersScreens />;
}

/** Local play (vs computer / 2 players on one device), the online lobby, or an online room. */
function CheckersScreens() {
  const [onlineSlot] = useState(createCheckersOnlineSlot);
  const { screen, createRoom, joinRoom, showLobby, showLocal } = useOnlineScreen(checkersRules, onlineSlot);
  if (screen.kind === 'room') {
    return (
      <CheckersOnline key={`${screen.role}:${screen.roomCode}`} role={screen.role} roomCode={screen.roomCode} initialMatch={screen.initialMatch}
        isRestored={screen.isRestored} saveSlot={onlineSlot} onLeave={showLocal} />
    );
  }
  if (screen.kind === 'lobby') {
    return (
      <div className="game-shell checkers" data-testid="checkers" data-mode="online-lobby">
        <div className="game-shell__header">
          <ModeSegments mode="online" onLocalMode={showLocal} onOnline={showLobby} />
        </div>
        <OnlineLobbyCard onCreate={() => { unlockAudio(); createRoom(); }} onJoin={code => { unlockAudio(); joinRoom(code); }}
          description="Create a room and send your friend the link. You play Dark and move first; colours swap every new game." />
      </div>
    );
  }
  return <CheckersGame onOnline={showLobby} />;
}

function ModeSegments({ mode, onLocalMode, onOnline }: { mode: PlayMode | 'online'; onLocalMode(mode: PlayMode): void; onOnline(): void }) {
  return (
    <div className="game-segments" role="group" aria-label="Opponent">
      <button type="button" className={mode === 'computer' ? 'is-selected' : ''} onClick={() => onLocalMode('computer')} data-testid="checkers-mode-computer">vs Computer</button>
      <button type="button" className={mode === 'friends' ? 'is-selected' : ''} onClick={() => onLocalMode('friends')} data-testid="checkers-mode-friends">2 Players</button>
      <button type="button" className={mode === 'online' ? 'is-selected' : ''} onClick={onOnline} data-testid="checkers-mode-online">Online</button>
    </div>
  );
}

function CheckersGame({ onOnline }: { onOnline(): void }) {
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
        <ModeSegments mode={mode} onLocalMode={nextMode => startNewGame({ mode: nextMode })} onOnline={onOnline} />
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
      <CheckersBoard cells={view.cells} moves={view.winner === 0 ? view.moves : []} selected={selected} lastMove={lastMove}
        isLocked={isComputerTurn || view.winner !== 0} isFlipped={false} mustCapture={view.mustCapture} plies={view.history.length} onSquare={handleSquare} />
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
