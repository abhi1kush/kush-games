import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useSharedMute } from '../sharedSound';
import { ShareGameButton } from '../ShareGameButton';
import { ERASER, LittlePainter, loadLittlePainterEngine, readPaletteColors, UNPAINTED_FILL } from './engine';
import { BOARD_SIZE, DETAIL_STROKE_WIDTH, INK_COLOR, PAINT_NAMES, PICTURES, REGION_STROKE_WIDTH, type Picture, type Shape } from './pictures';
import { pictureMarkup } from './svg';
import { createLittlePainterSaveSlot } from './save';
import { playPaintSound } from './sounds';
import '../shared.css';
import './littlepainter.css';

const GAME_NAME = 'Little Painter';
const HINT_MILLISECONDS = 2200;
const CONFETTI_PIECES = 36;

export default function LittlePainterScreen() {
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadLittlePainterEngine().then(() => setIsReady(true), () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the paint box. Please refresh.</p></div>;
  if (!isReady) return <div className="game-shell" data-testid="paint-loading"><p className="game-help">Opening the paint box…</p></div>;
  return <LittlePainterGame />;
}

/** A little pink-and-blue rubber eraser. */
function EraserIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="little-painter__eraser-icon">
      <g transform="rotate(-35 16 16)" stroke={INK_COLOR} strokeWidth="2" strokeLinejoin="round">
        <rect x="5" y="10" width="13" height="12" rx="2.5" fill="#f29bc0" />
        <rect x="18" y="10" width="9" height="12" rx="2.5" fill="#6cc3ec" />
      </g>
    </svg>
  );
}

function ShapeElement({ shape }: { shape: Shape }) {
  switch (shape.kind) {
    case 'path': return <path d={shape.d} transform={shape.transform} />;
    case 'circle': return <circle cx={shape.cx} cy={shape.cy} r={shape.r} transform={shape.transform} />;
    case 'ellipse': return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} transform={shape.transform} />;
    case 'rect': return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.radius || undefined} transform={shape.transform} />;
  }
}

/** The picture as live SVG: one <g data-region> per tappable region, outline-only details on top (they never catch taps). */
const PictureArt = memo(function PictureArt({ picture, fills, hintedRegions, className, testId, label, isInteractive = false }:
  { picture: Picture; fills: readonly string[]; hintedRegions?: ReadonlySet<number>; className: string; testId?: string; label: string; isInteractive?: boolean }) {
  return (
    <svg className={className} viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} data-testid={testId} role="img" aria-label={label}>
      <g stroke={INK_COLOR} strokeWidth={REGION_STROKE_WIDTH} strokeLinejoin="round" strokeLinecap="round">
        {picture.regions.map((region, index) => (
          <g key={index} data-region={isInteractive ? index : undefined} data-name={isInteractive ? region.name : undefined} fill={fills[index] ?? UNPAINTED_FILL}
            className={hintedRegions?.has(index) ? 'is-hinted' : undefined}>
            {region.shapes.map((shape, shapeIndex) => <ShapeElement key={shapeIndex} shape={shape} />)}
          </g>
        ))}
      </g>
      <g stroke={INK_COLOR} strokeWidth={DETAIL_STROKE_WIDTH} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none">
        {picture.details.map((detail, index) => (
          <g key={index} fill={detail.fill === 'ink' ? INK_COLOR : detail.fill === 'white' ? '#ffffff' : 'none'} stroke={detail.fill === 'none' ? undefined : 'none'}>
            <ShapeElement shape={detail.shape} />
          </g>
        ))}
      </g>
    </svg>
  );
});

/** Draw the picture at 1200 × 1200 and download it as a PNG. */
async function downloadPicture(picture: Picture, fills: readonly string[]) {
  const size = 1200;
  const blobUrl = URL.createObjectURL(new Blob([pictureMarkup(picture, fills, size)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = blobUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(png);
    link.download = `little-painter-${picture.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

interface ConfettiPiece { id: number; left: number; delay: number; duration: number; color: string; drift: number; spin: number; round: boolean; }

function makeConfetti(colors: readonly string[]): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_PIECES }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 0.5, duration: 1.8 + Math.random() * 1.2,
    color: colors[1 + (i % (colors.length - 2))], drift: (Math.random() - 0.5) * 80, spin: (Math.random() - 0.5) * 720, round: i % 3 === 0,
  }));
}

function LittlePainterGame() {
  const painterRef = useRef<LittlePainter>(null!);
  const saveSlot = useMemo(createLittlePainterSaveSlot, []);
  const [wasRestored] = useState(() => {
    painterRef.current = new LittlePainter();
    const saved = saveSlot.load();
    return !!saved && painterRef.current.load(Uint8Array.from(saved.bytes));
  });
  const paletteColors = useMemo(readPaletteColors, []);
  const [revision, setRevision] = useState(0);
  const [hintedRegions, setHintedRegions] = useState<ReadonlySet<number>>(new Set());
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [celebration, setCelebration] = useState<{ picture: number; confetti: ConfettiPiece[] } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const hintTimerRef = useRef(0);

  const painter = painterRef.current;
  const activePicture = painter.active_picture();
  const selectedColor = painter.selected_color();
  const picture = PICTURES[activePicture];
  // every picture's fills (the picker shows them all); recomputed only after a change
  const allFills = useMemo(() => PICTURES.map((_, index) => Array.from(painter.colors(index), color => paletteColors[color] ?? UNPAINTED_FILL)),
    [revision, painter, paletteColors]); // eslint-disable-line react-hooks/exhaustive-deps
  const coloredCount = painter.colored_count(activePicture);
  const regionCount = LittlePainter.region_count(activePicture);
  const completedMask = painter.completed_mask();
  const canUndo = painter.can_undo();

  const commit = useCallback(() => {
    saveSlot.save({ bytes: Array.from(painterRef.current.save()) });
    setRevision(value => value + 1);
  }, [saveSlot]);

  const stopHint = useCallback(() => { window.clearTimeout(hintTimerRef.current); setHintedRegions(new Set()); }, []);
  useEffect(() => () => window.clearTimeout(hintTimerRef.current), []);
  useEffect(() => () => painterRef.current.free(), []);

  // Test hook for e2e/little-painter.mjs (only with ?paintTest in the URL).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('paintTest')) return;
    const testWindow = window as unknown as { __paintTest?: unknown };
    testWindow.__paintTest = { painter: painterRef.current, pictures: PICTURES.map(entry => ({ id: entry.id, regions: entry.regions.length })) };
    return () => { delete testWindow.__paintTest; };
  }, []);

  const paintRegion = useCallback((region: number) => {
    const book = painterRef.current;
    const picture = book.active_picture();
    const wasComplete = book.is_complete(picture);
    if (!book.fill(region)) return;
    playPaintSound(book.selected_color() === ERASER ? 'erase' : 'fill', isMutedRef.current);
    if (!wasComplete && book.is_complete(picture)) {
      setCelebration({ picture, confetti: makeConfetti(paletteColors) });
      playPaintSound('celebrate', isMutedRef.current);
    }
    stopHint();
    commit();
  }, [commit, isMutedRef, paletteColors, stopHint]);

  const handleBoardClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const regionElement = (event.target as Element).closest?.('[data-region]');
    if (regionElement) paintRegion(Number(regionElement.getAttribute('data-region')));
  }, [paintRegion]);

  const undo = useCallback(() => {
    if (!painterRef.current.undo()) return;
    playPaintSound('undo', isMutedRef.current);
    commit();
  }, [commit, isMutedRef]);

  const clearPicture = useCallback(() => {
    setIsConfirmingClear(false);
    if (!painterRef.current.clear()) return;
    playPaintSound('clear', isMutedRef.current);
    setCelebration(null);
    commit();
  }, [commit, isMutedRef]);

  const selectColor = useCallback((color: number) => {
    if (painterRef.current.select_color(color)) { playPaintSound('pick', isMutedRef.current); commit(); }
  }, [commit, isMutedRef]);

  const openPicture = useCallback((index: number) => {
    if (!painterRef.current.set_active_picture(index)) return;
    playPaintSound('pick', isMutedRef.current);
    setCelebration(null);
    setIsConfirmingClear(false);
    stopHint();
    commit();
  }, [commit, isMutedRef, stopHint]);

  const showHint = useCallback(() => {
    const book = painterRef.current;
    const colors = book.colors(book.active_picture());
    const unpainted = new Set<number>();
    colors.forEach((color, region) => { if (color === ERASER) unpainted.add(region); });
    window.clearTimeout(hintTimerRef.current);
    setHintedRegions(unpainted);
    hintTimerRef.current = window.setTimeout(() => setHintedRegions(new Set()), HINT_MILLISECONDS);
  }, []);

  const savePicture = useCallback(async () => {
    setIsSaving(true);
    try { await downloadPicture(picture, allFills[activePicture]); } finally { setIsSaving(false); }
  }, [picture, allFills, activePicture]);

  // Ctrl/⌘+Z or U undo; M mute
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((key === 'z' && (event.ctrlKey || event.metaKey)) || (key === 'u' && !event.ctrlKey && !event.metaKey)) { event.preventDefault(); undo(); }
      else if (key === 'm' && !event.ctrlKey && !event.metaKey) toggleMute();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, toggleMute]);

  const nextPicture = (activePicture + 1) % PICTURES.length;
  const isComplete = coloredCount === regionCount;

  return (
    <div className="game-shell little-painter" data-testid="little-painter" data-picture={picture.id} data-complete={isComplete}>
      <div className="little-painter__layout">
        <div className="little-painter__board-column">
          <div className="little-painter__board" onClick={handleBoardClick} role="presentation">
            <PictureArt picture={picture} fills={allFills[activePicture]} hintedRegions={hintedRegions} className="little-painter__art"
              isInteractive testId="paint-board" label={`${picture.title} coloring page: tap a part to paint it`} />
            {celebration && celebration.picture === activePicture && (
              <div className="little-painter__celebration" data-testid="paint-celebration" onClick={event => { event.stopPropagation(); setCelebration(null); }} role="presentation">
                <div className="little-painter__confetti" aria-hidden="true">
                  {celebration.confetti.map(piece => (
                    <i key={piece.id} style={{ left: `${piece.left}%`, background: piece.color, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`,
                      borderRadius: piece.round ? '50%' : '2px', ['--drift' as string]: `${piece.drift}px`, ['--spin' as string]: `${piece.spin}deg` }} />
                  ))}
                </div>
                <div className="little-painter__cheer">
                  <b>🌟 Beautiful! 🌟</b>
                  <span>You colored the whole {picture.title.toLowerCase()}!</span>
                  <span className="little-painter__cheer-actions">
                    <button type="button" className="game-button" onClick={event => { event.stopPropagation(); setCelebration(null); }} data-testid="paint-keep">Keep coloring</button>
                    <button type="button" className="game-button game-button--primary" onClick={event => { event.stopPropagation(); openPicture(nextPicture); }} data-testid="paint-next">
                      Next: {PICTURES[nextPicture].emoji} {PICTURES[nextPicture].title}
                    </button>
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="little-painter__progress" data-testid="paint-progress" aria-live="polite">
            <span className="little-painter__progress-bar"><span style={{ width: `${(coloredCount / regionCount) * 100}%` }} /></span>
            <span>{isComplete ? '⭐ All colored!' : `${coloredCount} / ${regionCount} colored`}</span>
            {wasRestored && revision === 0 && <span className="little-painter__restored" data-testid="restored">💾 Welcome back!</span>}
          </div>
        </div>

        <div className="little-painter__side">
          <div className="little-painter__tools" role="toolbar" aria-label="Tools">
            <button type="button" className="little-painter__tool" onClick={undo} disabled={!canUndo} data-testid="paint-undo" aria-label="Undo" title="Undo (Ctrl+Z)">
              <span aria-hidden="true">↩️</span><small>Undo</small>
            </button>
            <button type="button" className="little-painter__tool" onClick={showHint} disabled={isComplete} data-testid="paint-hint" aria-label="Show the parts still white" title="Find the white parts">
              <span aria-hidden="true">✨</span><small>Find</small>
            </button>
            <button type="button" className="little-painter__tool" onClick={() => setIsConfirmingClear(true)} disabled={coloredCount === 0} data-testid="paint-clear" aria-label="Clear picture" title="Start this picture again">
              <span aria-hidden="true">🧽</span><small>Clear</small>
            </button>
            <button type="button" className="little-painter__tool" onClick={savePicture} disabled={isSaving} data-testid="paint-save" aria-label="Save picture as PNG" title="Download as a picture (PNG)">
              <span aria-hidden="true">📥</span><small>Save</small>
            </button>
            <button type="button" className="little-painter__tool" onClick={toggleMute} data-testid="mute" aria-pressed={isMuted}
              aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'} title={isMuted ? 'Sound on (M)' : 'Sound off (M)'}>
              <span aria-hidden="true">{isMuted ? '🔇' : '🔊'}</span><small>{isMuted ? 'Quiet' : 'Sound'}</small>
            </button>
          </div>

          <div className="little-painter__palette" role="radiogroup" aria-label="Paints" data-testid="paint-palette">
            {paletteColors.slice(1).map((color, i) => {
              const paint = i + 1;
              return (
                <button key={paint} type="button" role="radio" aria-checked={selectedColor === paint} aria-label={PAINT_NAMES[i]} title={PAINT_NAMES[i]}
                  className={`little-painter__swatch${selectedColor === paint ? ' is-selected' : ''}`} style={{ ['--swatch' as string]: color }}
                  onClick={() => selectColor(paint)} data-testid={`paint-swatch-${paint}`} />
              );
            })}
            <button type="button" role="radio" aria-checked={selectedColor === ERASER} aria-label="Eraser" title="Eraser (back to white)"
              className={`little-painter__swatch little-painter__swatch--eraser${selectedColor === ERASER ? ' is-selected' : ''}`}
              onClick={() => selectColor(ERASER)} data-testid="paint-swatch-0"><EraserIcon /></button>
          </div>

          <div className="little-painter__pictures" role="listbox" aria-label="Pictures" data-testid="paint-pictures">
            {PICTURES.map((entry, index) => {
              const isDone = (completedMask & (1 << index)) !== 0;
              return (
                <button key={entry.id} type="button" role="option" aria-selected={index === activePicture} aria-label={`${entry.title}${isDone ? ' (all colored)' : ''}`}
                  className={`little-painter__picture${index === activePicture ? ' is-active' : ''}`} onClick={() => openPicture(index)}
                  data-testid={`paint-picture-${entry.id}`} data-done={isDone} title={entry.title}>
                  <PictureArt picture={entry} fills={allFills[index]} className="little-painter__thumb" label={entry.title} />
                  {isDone && <span className="little-painter__done" aria-hidden="true">⭐</span>}
                </button>
              );
            })}
          </div>
          <div className="little-painter__footer">
            <p className="game-help">Pick a paint, then tap any part of the picture. Ctrl+Z or U undo · M mute · Esc back to the hub.</p>
            <ShareGameButton gameId="little-painter" gameName={GAME_NAME} testId="paint-share" />
          </div>
        </div>
      </div>

      {isConfirmingClear && (
        <div className="little-painter__dialog-backdrop" onClick={() => setIsConfirmingClear(false)} role="presentation">
          <div className="little-painter__dialog" role="alertdialog" aria-modal="true" aria-labelledby="paint-clear-title" onClick={event => event.stopPropagation()} data-testid="paint-clear-dialog">
            <b id="paint-clear-title">Start the {picture.title.toLowerCase()} again?</b>
            <span>All its colors will go away. (You can still press Undo to bring them back.)</span>
            <span className="little-painter__dialog-actions">
              <button type="button" className="game-button" onClick={() => setIsConfirmingClear(false)} data-testid="paint-clear-no" autoFocus>✖ Keep it</button>
              <button type="button" className="game-button game-button--primary" onClick={clearPicture} data-testid="paint-clear-yes">🧽 Clear</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
