import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, useSharedMute } from '../sharedSound';
import { BACKDROP_WIDTH, createBackdrop, createTileSprites, drawCheckpoint, drawDebrisPiece, drawEntity, drawGoal, drawHero, type TileSprites } from './art';
import {
  Buttons, CHECKPOINT_COLUMN, createMemoryViews, EffectKind, EntityKind, EntityState, Events, FLAG_COLUMN, FLAG_TOP_ROW, FORT_DOOR_COLUMN, GROUND_ROW,
  HeroPose, KushJump, LEVEL_COLUMNS, LEVEL_ROWS, loadKushJumpEngine, MAX_VIEW_WIDTH, MIN_VIEW_WIDTH, type MemoryViews, Phase, RenderSlot, Tile,
  TILE, TILE_KIND_COUNT, WORLD_HEIGHT,
} from './engine';
import { createKushJumpSaveSlot } from './save';
import { playLimited, primeAudio, type SoundKind } from './sounds';
import '../shared.css';
import './kushjump.css';

const BEST_SCORE_STORAGE_KEY = 'kush-games-kush-jump-best';
const GROUND_Y = GROUND_ROW * TILE;
const POLE_X = FLAG_COLUMN * TILE + TILE / 2;
const POLE_TOP_Y = FLAG_TOP_ROW * TILE + 4;
const POLE_BASE_Y = (GROUND_ROW - 1) * TILE;
const FORT_X = FORT_DOOR_COLUMN * TILE - 32;
const CHECKPOINT_X = CHECKPOINT_COLUMN * TILE + 8;

export default function KushJumpScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadKushJumpEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="kush-jump-loading"><p className="game-help">Loading…</p></div>;
  return <KushJumpGame memory={memory} />;
}

/** Which keys do what. Returns the button bit, or 0. */
function buttonForKey(key: string): number {
  switch (key) {
    case 'arrowleft': case 'a': return Buttons.left;
    case 'arrowright': case 'd': return Buttons.right;
    case 'arrowup': case 'w': case ' ': case 'z': case 'k': return Buttons.jump;
    case 'shift': case 'x': case 'j': return Buttons.run;
    default: return 0;
  }
}

const EVENT_SOUNDS: [number, SoundKind][] = [
  [Events.death, 'death'], [Events.stageClear, 'stageClear'], [Events.flag, 'flag'], [Events.powerUp, 'powerUp'], [Events.oneUp, 'oneUp'],
  [Events.shrink, 'shrink'], [Events.brickBreak, 'brickBreak'], [Events.stomp, 'stomp'], [Events.kick, 'kick'], [Events.coin, 'coin'],
  [Events.powerUpAppears, 'powerUpAppears'], [Events.bump, 'bump'], [Events.jump, 'jump'], [Events.checkpoint, 'checkpoint'], [Events.rescue, 'rescue'],
];

const pad = (value: number, digits: number) => String(Math.max(0, Math.floor(value))).padStart(digits, '0');

/** Everything the renderer keeps between frames (sprites for the current screen size, and the canvas metrics). */
interface Renderer {
  context: CanvasRenderingContext2D;
  pixelsPerUnit: number;
  viewWidth: number;
  sprites: TileSprites;
  backdrop: HTMLCanvasElement;
}

/** Draw one frame from the wasm render buffer. Only on-screen tiles are touched; sprites are pre-rendered. */
function drawFrame(renderer: Renderer, views: MemoryViews, clock: number) {
  const { context, pixelsPerUnit: scale, viewWidth, sprites, backdrop } = renderer;
  const { render, tiles } = views;
  const cameraX = render[RenderSlot.cameraX];
  const canvasWidth = context.canvas.width, canvasHeight = context.canvas.height;
  context.setTransform(1, 0, 0, 1, 0, 0);
  // far scenery, scrolling at 40% of the camera
  const backdropWidthPixels = BACKDROP_WIDTH * scale;
  let backdropX = -((cameraX * 0.4 * scale) % backdropWidthPixels);
  for (; backdropX < canvasWidth; backdropX += backdropWidthPixels) context.drawImage(backdrop, Math.floor(backdropX), 0, Math.ceil(backdropWidthPixels) + 1, canvasHeight);

  context.setTransform(scale, 0, 0, scale, -cameraX * scale, 0);
  const entityCount = render[RenderSlot.entityCount];
  // a Sun Berry rising out of its crate is drawn behind the tiles
  for (let index = 0; index < entityCount; index++) {
    const offset = RenderSlot.entities + index * RenderSlot.entityStride;
    if (render[offset + 1] === EntityState.Emerging) drawEntity(context, render[offset], render[offset + 1], render[offset + 2], render[offset + 3], render[offset + 4], render[offset + 5], clock);
  }
  // decorations behind the hero
  if (cameraX + viewWidth > CHECKPOINT_X - 20 && cameraX < CHECKPOINT_X + 20) drawCheckpoint(context, CHECKPOINT_X, GROUND_Y, render[RenderSlot.checkpoint] === 1);
  if (cameraX + viewWidth > POLE_X - 20) drawGoal(context, POLE_X, POLE_TOP_Y, POLE_BASE_Y, render[RenderSlot.flagY], FORT_X, GROUND_Y);

  // tiles, in device pixels (rounded edges so neighbours meet without seams)
  context.setTransform(1, 0, 0, 1, 0, 0);
  const effectCount = render[RenderSlot.effectCount];
  const firstColumn = Math.max(0, Math.floor(cameraX / TILE));
  const lastColumn = Math.min(LEVEL_COLUMNS - 1, Math.floor((cameraX + viewWidth) / TILE));
  const coinWidth = Math.abs(Math.cos(clock * 4));
  for (let column = firstColumn; column <= lastColumn; column++) {
    const left = Math.round((column * TILE - cameraX) * scale), right = Math.round(((column + 1) * TILE - cameraX) * scale);
    for (let row = 0; row < LEVEL_ROWS; row++) {
      const kind = tiles[row * LEVEL_COLUMNS + column];
      if (kind === Tile.empty) continue;
      const rowTop = Math.round(row * TILE * scale);
      const height = Math.round((row + 1) * TILE * scale) - rowTop;
      let top = rowTop;
      if (kind === Tile.coin) {
        const width = Math.max(1, (right - left) * coinWidth);
        context.drawImage(sprites.coin, left + (right - left - width) / 2, top, width, height);
        continue;
      }
      // a bumped block jumps up for a moment
      for (let effect = 0; effect < effectCount; effect++) {
        const offset = RenderSlot.effects + effect * RenderSlot.effectStride;
        if (render[offset] === EffectKind.Bump && render[offset + 1] === column && render[offset + 2] === row) top -= Math.round(Math.sin((render[offset + 3] / 0.16) * Math.PI) * 5 * scale);
      }
      const isGrassy = kind === Tile.ground && (row === 0 || tiles[(row - 1) * LEVEL_COLUMNS + column] !== Tile.ground);
      const sprite = sprites.sprites[isGrassy ? TILE_KIND_COUNT : kind];
      if (sprite) context.drawImage(sprite, left, top, right - left, height);
    }
  }

  context.setTransform(scale, 0, 0, scale, -cameraX * scale, 0);
  for (let index = 0; index < entityCount; index++) {
    const offset = RenderSlot.entities + index * RenderSlot.entityStride;
    const x = render[offset + 2];
    if (render[offset + 1] === EntityState.Emerging || x > cameraX + viewWidth + 4 || x < cameraX - 24) continue;
    drawEntity(context, render[offset], render[offset + 1], x, render[offset + 3], render[offset + 4], render[offset + 5], clock);
  }
  const pose = render[RenderSlot.heroPose] as HeroPose;
  const isBlinking = render[RenderSlot.heroInvulnerable] > 0 && Math.floor(clock * 16) % 2 === 0;
  if (pose !== HeroPose.Hidden && !isBlinking) {
    drawHero(context, render[RenderSlot.heroX], render[RenderSlot.heroY], render[RenderSlot.heroBig] === 1, render[RenderSlot.heroFacing], pose,
      render[RenderSlot.heroStride], render[RenderSlot.heroVelocityX]);
  }
  // effects: popped coins, brick debris, floating points
  context.font = 'bold 7px system-ui, sans-serif';
  context.textAlign = 'center';
  for (let effect = 0; effect < effectCount; effect++) {
    const offset = RenderSlot.effects + effect * RenderSlot.effectStride;
    const kind = render[offset], x = render[offset + 1], y = render[offset + 2], age = render[offset + 3];
    if (kind === EffectKind.CoinPop) {
      if (age > 0.5) continue;
      const rise = 60 * age - 100 * age * age * 0.5 - 20 * age;
      const width = 10 * Math.abs(Math.cos(age * 18));
      context.drawImage(sprites.coin, x - width / 2, y - 12 - rise * 1.6, Math.max(1, width), 14);
    } else if (kind === EffectKind.Debris) {
      for (let piece = 0; piece < 4; piece++) {
        const side = piece % 2 ? 1 : -1, isHigh = piece < 2;
        drawDebrisPiece(context, x + side * (28 + (isHigh ? 0 : 10)) * age, y + (isHigh ? -150 : -90) * age + 450 * age * age, age * 14 * side);
      }
    } else if (kind === EffectKind.Score) {
      context.globalAlpha = Math.max(0, 1 - age / 0.8);
      context.fillStyle = '#000';
      context.fillText(String(render[offset + 4]), x + 0.5, y - 6 - age * 30 + 0.5);
      context.fillStyle = '#fff';
      context.fillText(String(render[offset + 4]), x, y - 6 - age * 30);
      context.globalAlpha = 1;
    }
  }
  // HUD (screen space)
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.font = 'bold 8px ui-monospace, Menlo, Consolas, monospace';
  context.textAlign = 'left';
  const columnWidth = viewWidth / 4;
  const hudItems: [string, string][] = [
    ['SCORE', pad(render[RenderSlot.score], 6)], ['COINS', `◎×${pad(render[RenderSlot.coins], 2)}`], ['STAGE', '1'], ['TIME', pad(render[RenderSlot.time], 3)],
  ];
  for (let index = 0; index < hudItems.length; index++) {
    const [label, value] = hudItems[index];
    const x = 10 + index * columnWidth;
    context.fillStyle = 'rgba(0,0,0,0.45)';
    context.fillText(label, x + 0.6, 12.6); context.fillText(value, x + 0.6, 22.6);
    context.fillStyle = '#fff';
    context.fillText(label, x, 12); context.fillText(value, x, 22);
  }
  context.fillStyle = '#ff4d6d';
  context.fillText(`♥×${render[RenderSlot.lives]}`, 10 + 2 * columnWidth + 22, 22);
}

function KushJumpGame({ memory }: { memory: WebAssembly.Memory }) {
  const saveSlot = useMemo(() => createKushJumpSaveSlot(), []);
  const [initialSave] = useState(() => saveSlot.load());
  const gameRef = useRef<KushJump>(null as unknown as KushJump);
  if (!gameRef.current) {
    gameRef.current = new KushJump();
    if (initialSave) gameRef.current.restore(initialSave.checkpoint, initialSave.lives, initialSave.score, initialSave.coins);
  }
  const readViews = useMemo(() => createMemoryViews(memory, gameRef.current), [memory]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(Phase.Ready);
  const [isPaused, setIsPaused] = useState(false);
  const [wasRestored, setWasRestored] = useState(initialSave !== null);
  const [bestScore, setBestScore] = useState(() => readStoredJson<number>(BEST_SCORE_STORAGE_KEY, 0));
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const isPausedRef = useRef(false);
  const keyButtonsRef = useRef(0);
  const touchButtonsRef = useRef(0);
  const needsDrawRef = useRef(true);

  // Saves happen when play stops (pause, tab hidden, leaving, a life lost, the checkpoint reached), never every frame.
  const saveProgress = useCallback(() => {
    const game = gameRef.current;
    const currentPhase = game.phase() as Phase;
    if (currentPhase === Phase.GameOver || currentPhase === Phase.Cleared || currentPhase === Phase.Goal) { saveSlot.clear(); return; }
    saveSlot.save({ checkpoint: game.checkpoint_reached(), lives: game.lives(), score: game.score(), coins: game.coins() });
  }, [saveSlot]);

  useEffect(() => () => { saveProgress(); gameRef.current.free(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Test hook for e2e/kush-jump.mjs (only with ?kushJumpTest in the URL).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('kushJumpTest')) return;
    const testWindow = window as unknown as { __kushJumpTest?: unknown };
    testWindow.__kushJumpTest = { game: gameRef.current, views: readViews, touchButtons: touchButtonsRef };
    return () => { delete testWindow.__kushJumpTest; };
  }, [readViews]);

  const pause = useCallback(() => {
    keyButtonsRef.current = 0;
    touchButtonsRef.current = 0;
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    saveProgress();
  }, [saveProgress]);
  const resume = useCallback(() => {
    primeAudio();
    isPausedRef.current = false;
    setIsPaused(false);
    needsDrawRef.current = true;
  }, []);

  /** Start, continue after a lost life, or play again — whatever the overlay is asking for. */
  const advanceOverlay = useCallback(() => {
    primeAudio();
    const game = gameRef.current;
    if (isPausedRef.current) { resume(); return; }
    const currentPhase = game.phase() as Phase;
    if (currentPhase === Phase.Ready) { game.start(); setWasRestored(false); }
    else if (currentPhase === Phase.GameOver || currentPhase === Phase.Cleared) { game.restart(); saveSlot.clear(); setWasRestored(false); }
    needsDrawRef.current = true;
  }, [resume, saveSlot]);
  const advanceOverlayRef = useRef(advanceOverlay);
  advanceOverlayRef.current = advanceOverlay;

  // ---------- The loop: advance the wasm world, draw from its memory ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const context = canvas.getContext('2d', { alpha: false })!;
    let renderer: Renderer | null = null;
    // Size the canvas to its box (device pixels, at most 2× density); sprites are rebuilt only when the scale changes.
    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const box = stage.getBoundingClientRect();
      if (box.width < 10 || box.height < 10) return;
      canvas.width = Math.round(box.width * pixelRatio);
      canvas.height = Math.round(box.height * pixelRatio);
      const pixelsPerUnit = canvas.height / WORLD_HEIGHT;
      const viewWidth = Math.min(MAX_VIEW_WIDTH, Math.max(MIN_VIEW_WIDTH, canvas.width / pixelsPerUnit));
      gameRef.current.set_view_width(viewWidth);
      context.imageSmoothingEnabled = true;
      if (!renderer || Math.abs(renderer.pixelsPerUnit - pixelsPerUnit) > 0.01) {
        renderer = { context, pixelsPerUnit, viewWidth, sprites: createTileSprites(pixelsPerUnit), backdrop: createBackdrop(pixelsPerUnit) };
      } else renderer.viewWidth = viewWidth;
      needsDrawRef.current = true;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    let lastPhase = -1;
    let previousTime = performance.now();
    let frame = 0;
    let hasLoggedError = false;
    const handleEvents = (events: number) => {
      const muted = isMutedRef.current;
      for (const [bit, sound] of EVENT_SOUNDS) if (events & bit) playLimited(sound, muted);
      if (events & (Events.checkpoint | Events.lifeLost)) window.setTimeout(saveProgress, 0);
      if (events & (Events.gameOver | Events.stageClear)) {
        saveSlot.clear();
        const score = gameRef.current.score();
        setBestScore(previous => { if (score <= previous) return previous; saveStoredJson(BEST_SCORE_STORAGE_KEY, score); return score; });
      }
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick); // keep the loop alive even if this frame throws
      const seconds = (now - previousTime) / 1000;
      previousTime = now;
      if (isPausedRef.current) return;
      try {
        const game = gameRef.current;
        game.set_input(keyButtonsRef.current | touchButtonsRef.current);
        const events = game.advance(seconds); // the wasm side drops hitches (> 100 ms) and caps slow frames at 50 ms
        if (events) handleEvents(events);
        const views = readViews();
        const currentPhase = views.render[RenderSlot.phase];
        if (currentPhase !== lastPhase) { lastPhase = currentPhase; setPhase(currentPhase as Phase); }
        // nothing moves on the start / game-over / clear screens: draw once, then idle
        const isStill = (currentPhase === Phase.Ready || currentPhase === Phase.GameOver || currentPhase === Phase.Cleared) && views.render[RenderSlot.effectCount] === 0;
        if (renderer && (!isStill || needsDrawRef.current)) { needsDrawRef.current = false; drawFrame(renderer, views, now / 1000); }
      } catch (error) {
        if (!hasLoggedError) { hasLoggedError = true; console.error('Kush Jump frame failed', error); }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); };
  }, [isMutedRef, readViews, saveProgress, saveSlot]);

  // Pause when the tab is hidden or the window loses focus; save right away.
  useEffect(() => {
    const handleHide = () => { if (document.hidden) pause(); };
    const handleBlur = () => pause();
    const handlePageHide = () => saveProgress();
    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handlePageHide);
    return () => { document.removeEventListener('visibilitychange', handleHide); window.removeEventListener('blur', handleBlur); window.removeEventListener('pagehide', handlePageHide); };
  }, [pause, saveProgress]);

  useEffect(() => {
    const prime = () => primeAudio();
    window.addEventListener('pointerdown', prime, { once: true, capture: true, passive: true });
    window.addEventListener('keydown', prime, { once: true, capture: true });
    return () => { window.removeEventListener('pointerdown', prime, { capture: true }); window.removeEventListener('keydown', prime, { capture: true }); };
  }, []);

  useEffect(() => {
    const handleDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const button = buttonForKey(key);
      if (button) {
        event.preventDefault();
        keyButtonsRef.current |= button;
        if (event.repeat) return;
        const currentPhase = gameRef.current.phase() as Phase;
        if (isPausedRef.current || currentPhase === Phase.Ready) { if (button !== Buttons.run) advanceOverlayRef.current(); }
        if (button === Buttons.jump && !isPausedRef.current) gameRef.current.press_jump();
      } else if (key === 'enter' && !event.repeat) { event.preventDefault(); advanceOverlayRef.current(); }
      else if (key === 'p' && !event.repeat) { if (isPausedRef.current) resume(); else pause(); }
      else if (key === 'm' && !event.repeat) toggleMute();
    };
    const handleUp = (event: KeyboardEvent) => {
      const button = buttonForKey(event.key.toLowerCase());
      if (button) keyButtonsRef.current &= ~button;
      if (event.key === 'Shift') keyButtonsRef.current &= ~Buttons.run;
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [pause, resume, toggleMute]);

  const showsOverlay = isPaused || phase === Phase.Ready || phase === Phase.GameOver || phase === Phase.Cleared;
  const game = gameRef.current;
  return (
    <div className="game-shell kush-jump" data-testid="kush-jump" data-phase={phase} data-paused={isPaused}>
      <div className="kush-jump__bar">
        <button type="button" className="game-button" onClick={() => (isPaused ? resume() : pause())} data-testid="kush-jump-pause" aria-label={isPaused ? 'Resume' : 'Pause'}>{isPaused ? '▶' : '❚❚'}</button>
        <button type="button" className="game-button" onClick={() => { game.restart(); saveSlot.clear(); setWasRestored(false); needsDrawRef.current = true; }} data-testid="kush-jump-restart">Restart</button>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
        <span className="kush-jump__best">Best <b>{bestScore}</b></span>
      </div>
      <div className="kush-jump__play">
        <div className="kush-jump__stage" ref={stageRef}>
          <canvas ref={canvasRef} className="kush-jump__canvas" data-testid="kush-jump-canvas" aria-label="Kush Jump stage" onPointerDown={() => { if (showsOverlay) advanceOverlay(); }} />
          {showsOverlay && (
            <button type="button" className={`kush-jump__overlay${phase === Phase.Ready && !isPaused ? ' is-light' : ''}`} onClick={advanceOverlay} data-testid="kush-jump-overlay">
              {isPaused ? <><b>Paused</b><span>Tap or press P to resume</span></>
                : phase === Phase.Ready ? <>
                  <b className="kush-jump__title">KUSH JUMP</b>
                  <span>Stage 1 · Sunny Hills · ♥×{game.lives()}{game.checkpoint_reached() ? ' · from the checkpoint' : ''}</span>
                  {wasRestored && <span className="kush-jump__restored" data-testid="restored">💾 Saved progress restored</span>}
                  <span className="kush-jump__hint">Press any key or tap to start</span>
                </>
                : phase === Phase.Cleared ? <><b>Stage clear!</b><span data-testid="kush-jump-final-score">Score {game.score()} · Best {Math.max(bestScore, game.score())}</span><span className="kush-jump__hint">Tap to play again</span></>
                : <><b>Game over</b><span>Score {game.score()}</span><span className="kush-jump__hint">Tap to play again</span></>}
            </button>
          )}
        </div>
        <TouchControls buttonsRef={touchButtonsRef} onPress={button => {
          const currentPhase = gameRef.current.phase() as Phase;
          if (isPausedRef.current || currentPhase === Phase.Ready) { advanceOverlayRef.current(); }
          if (button === Buttons.jump) gameRef.current.press_jump();
        }} />
      </div>
      <p className="game-help">←/→ or A/D move · Space, ↑, W or Z jump (hold for higher) · Shift or X run · P pause · M mute. Stomp grumbles, kick shells, bump ★ crates for coins and a Sun Berry.</p>
    </div>
  );
}

/**
 * On-screen buttons for phones: a left/right pad (slide a thumb between the halves) plus Run and Jump.
 * Native pointer events, several fingers at once; held buttons go straight into a ref the game loop reads.
 */
function TouchControls({ buttonsRef, onPress }: { buttonsRef: React.MutableRefObject<number>; onPress: (button: number) => void }) {
  const padPointers = useRef(new Map<number, number>());
  const updatePad = () => {
    let held = 0;
    padPointers.current.forEach(button => { held |= button; });
    buttonsRef.current = (buttonsRef.current & ~(Buttons.left | Buttons.right)) | held;
  };
  const padButtonAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX < box.left + box.width / 2 ? Buttons.left : Buttons.right;
  };
  const handlePadDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    padPointers.current.set(event.pointerId, padButtonAt(event));
    updatePad();
    onPress(padButtonAt(event));
  };
  const handlePadMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!padPointers.current.has(event.pointerId)) return;
    padPointers.current.set(event.pointerId, padButtonAt(event));
    updatePad();
  };
  const handlePadUp = (event: ReactPointerEvent<HTMLDivElement>) => { padPointers.current.delete(event.pointerId); updatePad(); };
  const holdButton = (button: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
      buttonsRef.current |= button;
      onPress(button);
    },
    onPointerUp: () => { buttonsRef.current &= ~button; },
    onPointerCancel: () => { buttonsRef.current &= ~button; },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });
  return (
    <div className="kush-jump__touch" data-testid="kush-jump-touch">
      <div className="kush-jump__pad" onPointerDown={handlePadDown} onPointerMove={handlePadMove} onPointerUp={handlePadUp} onPointerCancel={handlePadUp}
        onContextMenu={event => event.preventDefault()} role="group" aria-label="Move">
        <span className="kush-jump__key" data-testid="touch-left" aria-label="Left">◀</span>
        <span className="kush-jump__key" data-testid="touch-right" aria-label="Right">▶</span>
      </div>
      <div className="kush-jump__actions">
        <button type="button" className="kush-jump__key kush-jump__key--run" data-testid="touch-run" aria-label="Run" {...holdButton(Buttons.run)}>RUN</button>
        <button type="button" className="kush-jump__key kush-jump__key--jump" data-testid="touch-jump" aria-label="Jump" {...holdButton(Buttons.jump)}>JUMP</button>
      </div>
    </div>
  );
}
