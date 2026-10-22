import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, playSound, unlockAudio, useSharedMute } from '../sharedSound';
import {
  cardName, decodeLayout, FIRST_COLUMN, FIRST_FOUNDATION, isRed, Layout, loadSolitaireEngine, RANK_NAMES, rankOf, Solitaire, STOCK, SUIT_SYMBOLS, suitOf, WASTE,
} from './engine';
import { createSolitaireSaveSlot, SavedSolitaire } from './save';
import '../shared.css';
import './solitaire.css';

const DRAW_MODE_STORAGE_KEY = 'kush-games-solitaire-draw';
const STATS_STORAGE_KEY = 'kush-games-solitaire-stats';
interface Stats { played: number; won: number; bestSeconds: number | null; }
interface Hint { from: number; count: number; to: number; token: number; }
interface DragState { from: number; count: number; startX: number; startY: number; elements: HTMLElement[]; isDragging: boolean; pointerId: number; }

const newSeed = () => (Math.random() * 0xffffffff) >>> 0;
const playCardSound = (isMuted: boolean) => playSound({ noises: [{ durationSeconds: 0.04, volume: 0.05, filterFrequency: 2400, filterType: 'highpass' }] }, isMuted);
const playFoundationSound = (rank: number, isMuted: boolean) => playSound({ tones: [{ frequency: 440 + rank * 40, durationSeconds: 0.1, volume: 0.04, type: 'sine' }] }, isMuted);
const playBadSound = (isMuted: boolean) => playSound({ tones: [{ frequency: 180, durationSeconds: 0.1, volume: 0.05, type: 'square' }] }, isMuted);
const playWinSound = (isMuted: boolean) => playSound({ tones: [523, 659, 784, 1047, 1319].map((frequency, index) => ({ frequency, durationSeconds: 0.25, startSeconds: index * 0.09, volume: 0.06 })) }, isMuted);
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function SolitaireScreen() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadSolitaireEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell" data-testid="solitaire-loading"><p className="game-help">Loading…</p></div>;
  return <SolitaireGame />;
}

function CardFace({ card }: { card: number }) {
  const rank = RANK_NAMES[rankOf(card)], suit = SUIT_SYMBOLS[suitOf(card)];
  return <><span className="sol-card__corner">{rank}<i>{suit}</i></span><span className="sol-card__pip">{suit}</span></>;
}

function SolitaireGame() {
  const saveSlot = useMemo(() => createSolitaireSaveSlot(), []);
  const [initialSave] = useState(() => saveSlot.load());
  const engineRef = useRef<Solitaire>(null as unknown as Solitaire);
  const elapsedRef = useRef(initialSave?.elapsedSeconds ?? 0);
  if (!engineRef.current) {
    const drawCount = initialSave?.drawCount ?? (readStoredJson<number>(DRAW_MODE_STORAGE_KEY, 1) === 3 ? 3 : 1);
    engineRef.current = new Solitaire(initialSave?.seed ?? newSeed(), drawCount);
    if (initialSave && !engineRef.current.load(initialSave.seed, initialSave.drawCount, Uint8Array.from(initialSave.actions))) elapsedRef.current = 0;
  }
  const readView = () => {
    const engine = engineRef.current;
    return { layout: decodeLayout(engine.layout()), score: engine.score(), moves: engine.moves(), isWon: engine.is_won(), canAutoFinish: engine.can_auto_finish(), drawCount: engine.draw_count() };
  };
  const [view, setView] = useState(readView);
  const [elapsedSeconds, setElapsedSeconds] = useState(elapsedRef.current);
  const [wasRestored, setWasRestored] = useState(() => (initialSave?.actions.length ?? 0) > 0);
  const [hint, setHint] = useState<Hint | null>(null);
  const [isAutoMoving, setIsAutoMoving] = useState(false);
  const [stats, setStats] = useState<Stats>(() => readStoredJson<Stats>(STATS_STORAGE_KEY, { played: 0, won: 0, bestSeconds: null }));
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const dragRef = useRef<DragState | null>(null);
  const autoTimerRef = useRef(0);
  const tokenRef = useRef(0);
  useEffect(() => () => { window.clearTimeout(autoTimerRef.current); engineRef.current.free(); }, []);

  const persist = useCallback(() => {
    const engine = engineRef.current;
    if (engine.is_won() || engine.moves() === 0) { saveSlot.clear(); return; }
    const data: SavedSolitaire = { seed: engine.seed(), drawCount: engine.draw_count() === 3 ? 3 : 1, actions: Array.from(engine.actions()), elapsedSeconds: elapsedRef.current };
    saveSlot.save(data);
  }, [saveSlot]);

  const recordWin = useCallback(() => {
    playWinSound(isMutedRef.current);
    setStats(previous => {
      const updated = { played: previous.played, won: previous.won + 1, bestSeconds: previous.bestSeconds === null ? elapsedRef.current : Math.min(previous.bestSeconds, elapsedRef.current) };
      saveStoredJson(STATS_STORAGE_KEY, updated);
      return updated;
    });
  }, [isMutedRef]);

  /** After every action: refresh, save, then keep sending safe cards up to the foundations one by one. */
  const afterAction = useCallback(() => {
    const engine = engineRef.current;
    if (engine.moves() === 1) setStats(previous => { const updated = { ...previous, played: previous.played + 1 }; saveStoredJson(STATS_STORAGE_KEY, updated); return updated; });
    setHint(null);
    setWasRestored(false);
    setView(readView());
    persist();
    window.clearTimeout(autoTimerRef.current);
    const step = () => {
      const finishing = engine.can_auto_finish();
      const moved = engine.foundation_step(!finishing);
      if (moved.length) {
        playFoundationSound(rankOf(decodeLayout(engine.layout()).foundations[moved[1] - FIRST_FOUNDATION].slice(-1)[0] ?? 0), isMutedRef.current);
        setView(readView());
        persist();
        if (engine.is_won()) { setIsAutoMoving(false); recordWin(); return; }
        autoTimerRef.current = window.setTimeout(step, finishing ? 70 : 140);
      } else setIsAutoMoving(false);
    };
    setIsAutoMoving(true);
    autoTimerRef.current = window.setTimeout(step, 160);
  }, [isMutedRef, persist, recordWin]);

  const draw = () => {
    unlockAudio();
    if (engineRef.current.draw()) { playCardSound(isMutedRef.current); afterAction(); }
  };

  const moveCards = (from: number, count: number, to: number) => {
    if (!engineRef.current.move_cards(from, count, to)) return false;
    playCardSound(isMutedRef.current);
    afterAction();
    return true;
  };

  const tapCards = (from: number, count: number) => {
    const destination = engineRef.current.auto_move(from, count);
    if (destination < 0) { playBadSound(isMutedRef.current); return; }
    playCardSound(isMutedRef.current);
    afterAction();
  };

  // ---------- Drag and drop (DOM transforms during the drag, React only on drop) ----------
  const handleCardPointerDown = (event: ReactPointerEvent<HTMLElement>, from: number, count: number) => {
    if (event.button > 0 || view.isWon) return;
    unlockAudio();
    const cardElement = event.currentTarget;
    const container = cardElement.parentElement!;
    const siblings = Array.from(container.querySelectorAll<HTMLElement>(':scope > .sol-card'));
    const elements = siblings.slice(siblings.indexOf(cardElement));
    cardElement.setPointerCapture?.(event.pointerId);
    dragRef.current = { from, count, startX: event.clientX, startY: event.clientY, elements, isDragging: false, pointerId: event.pointerId };
  };

  const handleCardPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX, deltaY = event.clientY - drag.startY;
    if (!drag.isDragging && Math.hypot(deltaX, deltaY) < 6) return;
    if (!drag.isDragging) { drag.isDragging = true; drag.elements.forEach(element => element.classList.add('is-dragging')); }
    for (const element of drag.elements) element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  };

  const handleCardPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.isDragging) { tapCards(drag.from, drag.count); return; }
    // hide the dragged cards for a moment so the hit test sees what's underneath them
    drag.elements.forEach(element => { element.style.visibility = 'hidden'; });
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop]')
      ?? nearestColumn(event.clientX, event.clientY);
    drag.elements.forEach(element => { element.style.visibility = ''; });
    const to = target ? Number(target.dataset.drop) : -1;
    const resetDrag = () => drag.elements.forEach(element => { element.classList.remove('is-dragging'); element.style.transform = ''; });
    if (to >= 0 && to !== drag.from && engineRef.current.move_cards(drag.from, drag.count, to)) {
      resetDrag();
      playCardSound(isMutedRef.current);
      afterAction();
    } else {
      if (to >= 0 && to !== drag.from) playBadSound(isMutedRef.current);
      drag.elements.forEach(element => { element.classList.add('is-returning'); element.classList.remove('is-dragging'); element.style.transform = ''; });
      window.setTimeout(() => drag.elements.forEach(element => element.classList.remove('is-returning')), 220);
    }
  };

  // ---------- Buttons ----------
  const undo = useCallback(() => {
    window.clearTimeout(autoTimerRef.current);
    setIsAutoMoving(false);
    if (!engineRef.current.undo()) return;
    setHint(null);
    setView(readView());
    persist();
  }, [persist]);

  const showHint = useCallback(() => {
    const suggestion = engineRef.current.hint();
    if (!suggestion.length) { setHint({ from: -1, count: 0, to: -1, token: ++tokenRef.current }); return; }
    if (suggestion.length === 1) setHint({ from: STOCK, count: 0, to: STOCK, token: ++tokenRef.current });
    else setHint({ from: suggestion[0], count: suggestion[1], to: suggestion[2], token: ++tokenRef.current });
  }, []);
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 1800);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const startNewGame = useCallback((drawCount?: number) => {
    window.clearTimeout(autoTimerRef.current);
    setIsAutoMoving(false);
    const nextDrawCount = drawCount ?? engineRef.current.draw_count();
    saveStoredJson(DRAW_MODE_STORAGE_KEY, nextDrawCount);
    engineRef.current.free();
    engineRef.current = new Solitaire(newSeed(), nextDrawCount);
    elapsedRef.current = 0;
    setElapsedSeconds(0);
    setHint(null);
    setWasRestored(false);
    setView(readView());
    saveSlot.clear();
  }, [saveSlot]);

  // Timer: runs from the first move until the win, paused while the tab is hidden.
  const isTimerRunning = view.moves > 0 && !view.isWon;
  useEffect(() => {
    if (!isTimerRunning) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
      if (elapsedRef.current % 10 === 0) persist();
    }, 1000);
    const saveNow = () => persist();
    window.addEventListener('pagehide', saveNow);
    return () => { window.clearInterval(timer); window.removeEventListener('pagehide', saveNow); };
  }, [isTimerRunning, persist]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'u') undo(); else if (key === 'h') showHint(); else if (key === 'm') toggleMute(); else if (key === 'n') startNewGame();
      else if (key === 'd' || key === ' ') { event.preventDefault(); draw(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const { layout } = view;
  const isHinted = (location: number, depthFromTop: number) => hint !== null && hint.from === location && depthFromTop < Math.max(hint.count, 1);
  const visibleWaste = layout.waste.slice(view.drawCount === 3 ? -3 : -2);

  return (
    <div className="game-shell solitaire" data-testid="solitaire" data-moves={view.moves} data-score={view.score} data-won={view.isWon}
      data-stock={layout.stockCount} data-waste={layout.waste.length} data-foundation-cards={layout.foundations.reduce((total, foundation) => total + foundation.length, 0)}
      data-draw={view.drawCount}>
      <div className="game-shell__header">
        <div className="game-segments" role="group" aria-label="Draw">
          {[1, 3].map(count => (
            <button type="button" key={count} className={view.drawCount === count ? 'is-selected' : ''} onClick={() => startNewGame(count)} data-testid={`sol-draw-${count}`}>Draw {count}</button>
          ))}
        </div>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
      </div>
      <div className="game-shell__stats">
        <div className="game-stat"><span>Time</span><b data-testid="sol-time">{formatTime(elapsedSeconds)}</b></div>
        <div className="game-stat"><span>Moves</span><b data-testid="sol-moves">{view.moves}</b></div>
        <div className="game-stat"><span>Score</span><b data-testid="sol-score">{view.score}</b></div>
        <div className="game-stat"><span>Won</span><b>{stats.won}/{stats.played}</b></div>
      </div>
      {wasRestored && <p className="game-restored" data-testid="restored">💾 Saved game restored</p>}
      <div className="sol-table" data-testid="sol-table">
        <div className="sol-top">
          <button type="button" className={`sol-slot sol-stock${hint?.from === STOCK ? ' is-hinted' : ''}`} onClick={draw} data-testid="sol-stock" aria-label={layout.stockCount ? `Stock, ${layout.stockCount} cards` : 'Turn the waste over'}>
            {layout.stockCount > 0 ? <span className="sol-card is-back"><b>{layout.stockCount}</b></span> : <span className="sol-recycle">↻</span>}
          </button>
          <div className="sol-slot sol-waste" data-testid="sol-waste">
            {visibleWaste.map((card, index) => {
              const isTop = index === visibleWaste.length - 1;
              return (
                <div key={card} className={`sol-card${isRed(card) ? ' is-red' : ''}${isTop && isHinted(WASTE, 0) ? ' is-hinted' : ''}`} style={{ ['--fan' as string]: view.drawCount === 3 ? index : 0 }}
                  data-card={cardName(card)} data-testid={isTop ? 'sol-waste-top' : undefined}
                  onPointerDown={isTop ? event => handleCardPointerDown(event, WASTE, 1) : undefined} onPointerMove={handleCardPointerMove} onPointerUp={handleCardPointerUp}>
                  <CardFace card={card} />
                </div>
              );
            })}
          </div>
          <span className="sol-gap" />
          {layout.foundations.map((foundation, suit) => {
            const location = FIRST_FOUNDATION + suit;
            const top = foundation[foundation.length - 1];
            return (
              <div key={suit} className={`sol-slot sol-foundation${hint?.to === location ? ' is-target' : ''}`} data-drop={location} data-testid="sol-foundation" data-count={foundation.length}>
                <span className="sol-foundation__suit">{SUIT_SYMBOLS[suit]}</span>
                {top !== undefined && (
                  <div key={top} className={`sol-card${isRed(top) ? ' is-red' : ''}${view.isWon ? ' is-cascading' : ''}`} style={{ ['--cascade' as string]: suit }} data-card={cardName(top)}
                    onPointerDown={event => handleCardPointerDown(event, location, 1)} onPointerMove={handleCardPointerMove} onPointerUp={handleCardPointerUp}>
                    <CardFace card={top} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="sol-tableau">
          {layout.columns.map((column, columnIndex) => {
            const location = FIRST_COLUMN + columnIndex;
            let offset = 0;
            return (
              <div key={columnIndex} className={`sol-column${hint?.to === location ? ' is-target' : ''}`} data-drop={location} data-testid="sol-column"
                data-count={column.cards.length} data-face-down={column.faceDown} style={{ ['--column-height' as string]: column.cards.length }}>
                {column.cards.map((card, index) => {
                  const isFaceUp = index >= column.faceDown;
                  const top = offset;
                  offset += isFaceUp ? 1 : 0.42;
                  const depthFromTop = column.cards.length - 1 - index;
                  return (
                    <div key={card} className={`sol-card${isFaceUp ? (isRed(card) ? ' is-red' : '') : ' is-back'}${isFaceUp && isHinted(location, depthFromTop) ? ' is-hinted' : ''}`}
                      style={{ ['--offset' as string]: top }} data-card={isFaceUp ? cardName(card) : undefined}
                      onPointerDown={isFaceUp ? event => handleCardPointerDown(event, location, depthFromTop + 1) : undefined}
                      onPointerMove={isFaceUp ? handleCardPointerMove : undefined} onPointerUp={isFaceUp ? handleCardPointerUp : undefined}>
                      {isFaceUp && <CardFace card={card} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {view.isWon && (
          <div className="sol-won" data-testid="sol-won">
            <div className="sol-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div>
            <p className="sol-won__title">You won! 🎉</p>
            <p className="sol-won__small">{formatTime(elapsedSeconds)} · {view.moves} moves · {view.score} points</p>
            <button type="button" className="game-button game-button--primary" onClick={() => startNewGame()} data-testid="sol-play-again">Deal again</button>
          </div>
        )}
      </div>
      <div className="game-actions">
        <button type="button" className="game-button" onClick={undo} disabled={view.moves === 0} data-testid="sol-undo">↶ Undo</button>
        <button type="button" className="game-button" onClick={showHint} disabled={view.isWon} data-testid="sol-hint">💡 Hint</button>
        <button type="button" className="game-button game-button--primary" onClick={() => startNewGame()} data-testid="sol-new">New deal</button>
      </div>
      {hint && hint.from === -1 && <p className="game-banner game-banner--info" data-testid="sol-no-moves">No useful moves left — try Undo or a new deal.</p>}
      <p className="game-help" data-auto-moving={isAutoMoving}>Drag cards, or tap one to send it to the best spot. Build columns down in alternating colors and foundations up by suit from the ace. Keys: D draw, U undo, H hint, N new deal.</p>
    </div>
  );
}

/** When a drop lands between elements, pick the column under the pointer's x (or the foundation row). */
function nearestColumn(x: number, y: number): HTMLElement | null {
  const columns = Array.from(document.querySelectorAll<HTMLElement>('.sol-column'));
  const foundations = Array.from(document.querySelectorAll<HTMLElement>('.sol-foundation'));
  const inRange = (element: HTMLElement) => { const box = element.getBoundingClientRect(); return x >= box.left && x <= box.right && y >= box.top - 20; };
  const foundation = foundations.find(element => { const box = element.getBoundingClientRect(); return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom + 20; });
  return foundation ?? columns.find(inRange) ?? null;
}
