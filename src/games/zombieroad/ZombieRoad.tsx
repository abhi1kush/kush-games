import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, useSharedMute } from '../sharedSound';
import { type ControlsGuide, ControlsPanel, ControlsToggle } from '../ControlsPanel';
import { ShareGameButton } from '../ShareGameButton';
import {
  createSprites, drawCover, FLICKERING_LIGHT, lampPosition, PICKUP_COLORS, PLAYER_SPRITE_SIZE, SPLAT_COLORS, type Sprites, stampStain, ZOMBIE_FRAMES, zombieSpriteSize,
} from './art';
import {
  Buttons, createRenderView, Events, loadZombieRoadEngine, MAX_HEALTH, ParticleKind, Phase, PLAYER_Y, POWER_SECONDS, RenderSlot, STAIN_RING, waveTagline,
  WORLD_HEIGHT, WORLD_WIDTH, ZOMBIE_RADIUS, ZombieKind, ZombieRoad, ZombieState,
} from './engine';
import { createZombieRoadSaveSlot } from './save';
import { playLimited, primeAudio, type SoundKind } from './sounds';
import '../shared.css';
import '../online/online.css';
import './zombieroad.css';

const BEST_SCORE_STORAGE_KEY = 'kush-games-zombie-road-best';
const AUTO_FIRE_STORAGE_KEY = 'kush-games-zombie-road-auto-fire';
const GAME_NAME = 'Zombie Road';

export default function ZombieRoadScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadZombieRoadEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="zombie-loading"><p className="game-help">Loading…</p></div>;
  return <ZombieRoadGame memory={memory} />;
}

/** Which keys do what. Returns the button bit, or 0. */
function buttonForKey(key: string): number {
  switch (key) {
    case 'arrowleft': case 'a': return Buttons.left;
    case 'arrowright': case 'd': return Buttons.right;
    case ' ': case 'z': case 'arrowup': case 'w': return Buttons.fire;
    default: return 0;
  }
}

/** Phones and tablets start with auto-fire on (one thumb to move is plenty); computers start with it off. */
function prefersAutoFire() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}

const EVENT_SOUNDS: [number, SoundKind][] = [
  [Events.gameOver, 'gameOver'], [Events.lifeLost, 'lifeLost'], [Events.waveClear, 'waveClear'], [Events.tankArrives, 'tankArrives'], [Events.tankDown, 'tankDown'],
  [Events.extraLife, 'extraLife'], [Events.pickup, 'pickup'], [Events.coverBroken, 'coverBroken'], [Events.breach, 'breach'], [Events.playerHurt, 'playerHurt'],
  [Events.waveStart, 'waveStart'], [Events.zombieDown, 'zombieDown'], [Events.spit, 'spit'], [Events.coverHit, 'coverHit'], [Events.groan, 'groan'],
  [Events.zombieHit, 'zombieHit'], [Events.shoot, 'shoot'],
];

/** Everything the renderer keeps between frames (sprites for the current size, the stains layer, cached HUD text). */
interface Renderer {
  context: CanvasRenderingContext2D;
  scale: number;
  sprites: Sprites;
  stains: HTMLCanvasElement;
  stainsContext: CanvasRenderingContext2D;
  stainsWave: number;
  shownStainSerial: number;
  stainRandom: () => number;
  shownScore: number;
  scoreText: string;
  shownBest: number;
  bestText: string;
  shownWave: number;
  waveText: string;
  waveTitle: string;
  waveClearTitle: string;
  waveTagline: string;
  shownLeft: number;
  leftText: string;
  shownLives: number;
  livesText: string;
  hudBar?: CanvasGradient;
}

const POINT_TEXTS = new Map<number, string>();
const pointText = (points: number) => {
  let text = POINT_TEXTS.get(points);
  if (!text) { text = `+${points}`; POINT_TEXTS.set(points, text); }
  return text;
};
const SECONDS_TEXTS = Array.from({ length: POWER_SECONDS + 2 }, (_, seconds) => `${seconds}s`);

function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  context.fillStyle = 'rgba(0,0,0,0.7)';
  context.fillText(text, x + 0.6, y + 0.6);
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function drawHeart(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = '#ff4d5e';
  context.beginPath();
  context.moveTo(x, y + 2.6);
  context.bezierCurveTo(x - 3.6, y + 0.2, x - 2.2, y - 2.6, x, y - 1);
  context.bezierCurveTo(x + 2.2, y - 2.6, x + 3.6, y + 0.2, x, y + 2.6);
  context.fill();
}

/** A small pill in the HUD: the pickup's letter and its seconds left, right-aligned at `right`. */
function drawPowerTimer(context: CanvasRenderingContext2D, right: number, seconds: number, color: string, letter: string) {
  context.fillStyle = color;
  context.fillRect(right - 20, 13.5, 20, 6);
  context.fillStyle = '#111111';
  context.textAlign = 'right';
  context.fillText(SECONDS_TEXTS[Math.ceil(seconds)] ?? '', right - 1.5, 16.7);
  context.textAlign = 'left';
  context.fillText(letter, right - 18.5, 16.7);
}

function drawPlate(context: CanvasRenderingContext2D, top: number, height: number) {
  context.fillStyle = 'rgba(6,8,10,0.72)';
  context.fillRect(0, top, WORLD_WIDTH, height);
  context.fillStyle = 'rgba(200,40,30,0.8)';
  context.fillRect(0, top, WORLD_WIDTH, 0.8);
  context.fillRect(0, top + height - 0.8, WORLD_WIDTH, 0.8);
}

/** Draw one frame from the wasm render buffer. */
function drawFrame(renderer: Renderer, render: Float32Array, clock: number, bestScore: number) {
  const { context, scale, sprites } = renderer;
  const phase = render[RenderSlot.phase] as Phase;
  const wave = render[RenderSlot.wave];
  const shake = render[RenderSlot.shake];
  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 4 : 0;
  const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 4 : 0;
  context.setTransform(scale, 0, 0, scale, shakeX * scale, shakeY * scale);

  // ---- the road, its stains and the flickering streetlight
  context.drawImage(sprites.road, -3, -3, WORLD_WIDTH + 6, WORLD_HEIGHT + 6);
  if (renderer.stainsWave !== wave) {
    renderer.stainsWave = wave;
    renderer.stainsContext.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    renderer.shownStainSerial = render[RenderSlot.stainSerial];
  }
  const stainSerial = render[RenderSlot.stainSerial];
  if (stainSerial < renderer.shownStainSerial) renderer.shownStainSerial = stainSerial; // a restart
  if (stainSerial - renderer.shownStainSerial > STAIN_RING) renderer.shownStainSerial = stainSerial - STAIN_RING;
  while (renderer.shownStainSerial < stainSerial) {
    const offset = RenderSlot.stains + (renderer.shownStainSerial % STAIN_RING) * RenderSlot.stainStride;
    stampStain(renderer.stainsContext, render[offset], render[offset + 1], render[offset + 2], renderer.stainRandom);
    renderer.shownStainSerial++;
  }
  context.drawImage(renderer.stains, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  const flicker = Math.sin(clock * 23) * Math.sin(clock * 7.3) > 0.5 ? 0.12 : 0.85 + Math.sin(clock * 40) * 0.1;
  const [lampX, lampY] = lampPosition(FLICKERING_LIGHT);
  context.globalAlpha = flicker;
  context.drawImage(sprites.flickerPool, lampX - 36, lampY - 36, 72, 72);
  context.globalAlpha = 1;

  // ---- cover
  for (let index = 0; index < 4; index++) {
    const offset = RenderSlot.covers + index * RenderSlot.coverStride;
    drawCover(context, render[offset], render[offset + 1], render[offset + 2], render[offset + 3], clock);
  }

  // ---- pickups
  const pickupCount = render[RenderSlot.pickupCount];
  for (let index = 0; index < pickupCount; index++) {
    const offset = RenderSlot.pickups + index * RenderSlot.pickupStride;
    const bob = Math.sin(render[offset + 3] * 5) * 1.2;
    context.drawImage(sprites.pickups[render[offset]], render[offset + 1] - 7, render[offset + 2] - 7 + bob, 14, 14);
  }

  // ---- the horde
  const zombieCount = render[RenderSlot.zombieCount];
  for (let index = 0; index < zombieCount; index++) {
    const offset = RenderSlot.zombies + index * RenderSlot.zombieStride;
    const kind = render[offset], x = render[offset + 1], y = render[offset + 2];
    if (y < -30) continue;
    const state = render[offset + 6] as ZombieState;
    const frame = state === ZombieState.Biting ? Math.floor(clock * 9 + index) & 3 : Math.floor(render[offset + 3]) % ZOMBIE_FRAMES;
    const size = zombieSpriteSize(kind);
    const lunge = state === ZombieState.Biting ? Math.sin(clock * 18 + index) * 0.8 : 0;
    context.drawImage(sprites.zombies[kind * ZOMBIE_FRAMES + frame], x - size / 2, y - size / 2 + lunge, size, size);
    if (render[offset + 5] > 0) context.drawImage(sprites.zombieFlashes[kind], x - size / 2, y - size / 2 + lunge, size, size);
    const radius = ZOMBIE_RADIUS[kind];
    if (state === ZombieState.Spitting) {
      context.fillStyle = 'rgba(200,255,60,0.45)';
      context.beginPath(); context.arc(x, y + radius * 0.6, 3.2 + Math.sin(clock * 30) * 0.6, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#d8ff4a';
      context.beginPath(); context.arc(x, y + radius * 0.6, 1.4, 0, Math.PI * 2); context.fill();
    }
    const health = render[offset + 4];
    if (kind === ZombieKind.Brute && health < 1) {
      context.fillStyle = 'rgba(0,0,0,0.6)'; context.fillRect(x - 8, y - radius - 4, 16, 1.8);
      context.fillStyle = '#ef4d3c'; context.fillRect(x - 8, y - radius - 4, 16 * health, 1.8);
    }
  }

  // ---- acid spit
  const spitCount = render[RenderSlot.spitCount];
  for (let index = 0; index < spitCount; index++) {
    const offset = RenderSlot.spits + index * RenderSlot.spitStride;
    const x = render[offset], y = render[offset + 1], wobble = Math.sin(render[offset + 2] * 20) * 0.4;
    context.fillStyle = 'rgba(170,230,40,0.35)';
    context.beginPath(); context.arc(x, y - 3, 2.2, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#a8e22c';
    context.beginPath(); context.arc(x, y, 2.6 + wobble, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#eaff9a';
    context.beginPath(); context.arc(x - 0.7, y - 0.7, 0.9, 0, Math.PI * 2); context.fill();
  }

  // ---- the survivor
  const playerX = render[RenderSlot.playerX];
  const invulnerable = render[RenderSlot.invulnerable];
  const spreadSeconds = render[RenderSlot.spreadSeconds], rapidSeconds = render[RenderSlot.rapidSeconds];
  const blinking = invulnerable > 0 && (Math.floor(clock * 12) & 1) === 1;
  if (phase !== Phase.GameOver && !blinking) {
    if (spreadSeconds > 0 || rapidSeconds > 0) {
      context.strokeStyle = spreadSeconds > 0 ? 'rgba(255,154,46,0.55)' : 'rgba(54,201,240,0.55)';
      context.lineWidth = 0.9;
      context.beginPath(); context.arc(playerX, PLAYER_Y, 9.5 + Math.sin(clock * 8) * 0.6, 0, Math.PI * 2); context.stroke();
    }
    if (phase === Phase.Dying) context.globalAlpha = 0.55;
    context.drawImage(sprites.survivor, playerX - PLAYER_SPRITE_SIZE / 2, PLAYER_Y - PLAYER_SPRITE_SIZE / 2, PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
    context.globalAlpha = 1;
    if (render[RenderSlot.sinceShot] < 0.05 && phase === Phase.Playing) {
      context.fillStyle = 'rgba(255,220,120,0.9)';
      context.beginPath(); context.arc(playerX, PLAYER_Y - 13.5, 2.2, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath(); context.arc(playerX, PLAYER_Y - 13.5, 1, 0, Math.PI * 2); context.fill();
    }
  }

  // ---- bullets
  const bulletCount = render[RenderSlot.bulletCount];
  context.fillStyle = 'rgba(255,220,120,0.35)';
  for (let index = 0; index < bulletCount; index++) {
    const offset = RenderSlot.bullets + index * RenderSlot.bulletStride;
    context.fillRect(render[offset] - 0.5, render[offset + 1], 1, 7);
  }
  context.fillStyle = '#fff3b0';
  for (let index = 0; index < bulletCount; index++) {
    const offset = RenderSlot.bullets + index * RenderSlot.bulletStride;
    context.fillRect(render[offset] - 0.6, render[offset + 1] - 2, 1.2, 4);
  }

  // ---- particles
  const particleCount = render[RenderSlot.particleCount];
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let index = 0; index < particleCount; index++) {
    const offset = RenderSlot.particles + index * RenderSlot.particleStride;
    const kind = render[offset] as ParticleKind, x = render[offset + 1], y = render[offset + 2], progress = render[offset + 3], value = render[offset + 4];
    context.globalAlpha = 1 - progress;
    switch (kind) {
      case ParticleKind.Splat: {
        const size = 1.8 * (1 - progress * 0.5);
        context.fillStyle = SPLAT_COLORS[value] ?? SPLAT_COLORS[0];
        context.fillRect(x - size / 2, y - size / 2, size, size);
        break;
      }
      case ParticleKind.Spark: {
        const size = value > 0 ? 2.2 : 1.2;
        context.fillStyle = value > 0 ? '#ff7a3c' : '#ffe08a';
        context.fillRect(x - size / 2, y - size / 2, size, size);
        break;
      }
      case ParticleKind.Debris:
        context.fillStyle = value === 0 || value === 3 ? '#4a2a22' : '#8f8e86';
        context.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
        break;
      case ParticleKind.Acid:
        context.fillStyle = '#c6f03a';
        context.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
        break;
      case ParticleKind.ScoreText:
        context.font = '800 6px system-ui, sans-serif';
        drawText(context, pointText(value), x, y, value >= 100 ? '#ffd23f' : '#ffffff');
        break;
    }
  }
  context.globalAlpha = 1;

  // ---- fog the horde walks out of, vignette, hurt flash
  const drift = (clock * 4) % WORLD_WIDTH;
  context.drawImage(sprites.fogBank, drift, 0, WORLD_WIDTH, 100);
  context.drawImage(sprites.fogBank, drift - WORLD_WIDTH, 0, WORLD_WIDTH, 100);
  context.drawImage(sprites.atmosphere, -3, -3, WORLD_WIDTH + 6, WORLD_HEIGHT + 6);
  const flash = render[RenderSlot.flash];
  if (flash > 0) { context.globalAlpha = flash * 0.32; context.fillStyle = '#be0000'; context.fillRect(-3, -3, WORLD_WIDTH + 6, WORLD_HEIGHT + 6); }
  const health = render[RenderSlot.health];
  if (health < 35 && phase === Phase.Playing) {
    // low health: the edges pulse red
    context.globalAlpha = 0.35 + Math.sin(clock * 6) * 0.25;
    context.strokeStyle = '#dc1414';
    context.lineWidth = 4;
    context.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }
  context.globalAlpha = 1;

  // ---- HUD (strings rebuilt only when their numbers change)
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const score = render[RenderSlot.score];
  if (score !== renderer.shownScore) { renderer.shownScore = score; renderer.scoreText = `SCORE ${score}`; }
  const best = Math.max(bestScore, score);
  if (best !== renderer.shownBest) { renderer.shownBest = best; renderer.bestText = `BEST ${best}`; }
  if (wave !== renderer.shownWave) {
    renderer.shownWave = wave;
    renderer.waveText = `WAVE ${wave}`;
    renderer.waveTitle = `WAVE ${wave}`;
    renderer.waveClearTitle = `WAVE ${wave} CLEARED`;
    renderer.waveTagline = waveTagline(wave);
  }
  const zombiesLeft = render[RenderSlot.zombiesLeft];
  if (zombiesLeft !== renderer.shownLeft) { renderer.shownLeft = zombiesLeft; renderer.leftText = `${zombiesLeft} left`; }
  const lives = render[RenderSlot.lives];
  if (lives !== renderer.shownLives) { renderer.shownLives = lives; renderer.livesText = lives === 0 ? 'Overrun…' : `${lives} ${lives === 1 ? 'life' : 'lives'} left`; }

  if (!renderer.hudBar) {
    renderer.hudBar = context.createLinearGradient(0, 0, 0, 24);
    renderer.hudBar.addColorStop(0, 'rgba(0,0,0,0.78)');
    renderer.hudBar.addColorStop(1, 'rgba(0,0,0,0)');
  }
  context.fillStyle = renderer.hudBar;
  context.fillRect(0, 0, WORLD_WIDTH, 24);
  context.font = '800 7px system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  drawText(context, renderer.scoreText, 5, 7.5, '#ffffff');
  context.textAlign = 'center';
  drawText(context, renderer.waveText, WORLD_WIDTH / 2, 7.5, '#ff6a50');
  context.textAlign = 'right';
  drawText(context, renderer.bestText, WORLD_WIDTH - 5, 7.5, 'rgba(255,255,255,0.75)');
  // health bar and lives
  context.fillStyle = 'rgba(0,0,0,0.6)';
  context.fillRect(5, 14.5, 50, 4);
  const healthFraction = Math.max(0, health / MAX_HEALTH);
  context.fillStyle = healthFraction > 0.6 ? '#62d26f' : healthFraction > 0.3 ? '#f2c14e' : '#ef4d3c';
  context.fillRect(5, 14.5, 50 * healthFraction, 4);
  for (let life = 0; life < lives; life++) drawHeart(context, 61 + life * 7, 16.5);
  context.font = '700 6px system-ui, sans-serif';
  context.textAlign = 'center';
  if (phase === Phase.Playing || phase === Phase.Dying) drawText(context, renderer.leftText, WORLD_WIDTH / 2, 16.5, 'rgba(255,255,255,0.8)');
  // power-up timers on the right
  let timerX = WORLD_WIDTH - 5;
  if (rapidSeconds > 0) { drawPowerTimer(context, timerX, rapidSeconds, PICKUP_COLORS[1], 'R'); timerX -= 23; }
  if (spreadSeconds > 0) drawPowerTimer(context, timerX, spreadSeconds, PICKUP_COLORS[0], 'S');
  // the Tank's health
  const tankHealth = render[RenderSlot.tankHealth];
  if (tankHealth >= 0) {
    context.fillStyle = 'rgba(0,0,0,0.65)';
    context.fillRect(WORLD_WIDTH / 2 - 50, 24, 100, 5);
    context.fillStyle = '#c62f24';
    context.fillRect(WORLD_WIDTH / 2 - 50, 24, 100 * tankHealth, 5);
    context.textAlign = 'center';
    context.font = '900 4.6px system-ui, sans-serif';
    drawText(context, 'TANK', WORLD_WIDTH / 2, 26.6, '#ffffff');
  }

  // ---- banners between waves
  const phaseSeconds = render[RenderSlot.phaseSeconds];
  if (phase === Phase.WaveIntro || phase === Phase.WaveClear || phase === Phase.Dying) {
    const appear = Math.min(1, phaseSeconds * 4);
    context.globalAlpha = appear;
    drawPlate(context, 130, 40);
    context.textAlign = 'center';
    context.font = `900 ${(phase === Phase.WaveClear ? 15 : 20) * (1 + Math.max(0, 0.2 - phaseSeconds))}px system-ui, sans-serif`;
    const title = phase === Phase.WaveIntro ? renderer.waveTitle : phase === Phase.WaveClear ? renderer.waveClearTitle : 'BITTEN!';
    drawText(context, title, WORLD_WIDTH / 2, 145, phase === Phase.WaveClear ? '#9be36a' : '#ff5a44');
    context.font = '700 6.4px system-ui, sans-serif';
    const subtitle = phase === Phase.WaveIntro ? renderer.waveTagline : phase === Phase.WaveClear ? 'Survived! Cover patched up · wave bonus' : renderer.livesText;
    drawText(context, subtitle, WORLD_WIDTH / 2, 161, 'rgba(255,255,255,0.88)');
    context.globalAlpha = 1;
  }
}

function ZombieRoadGame({ memory }: { memory: WebAssembly.Memory }) {
  const saveSlot = useMemo(() => createZombieRoadSaveSlot(), []);
  const [initialSave] = useState(() => saveSlot.load());
  const gameRef = useRef<ZombieRoad>(null as unknown as ZombieRoad);
  const [autoFire, setAutoFire] = useState(() => readStoredJson<boolean>(AUTO_FIRE_STORAGE_KEY, prefersAutoFire()));
  if (!gameRef.current) {
    gameRef.current = new ZombieRoad();
    gameRef.current.seed((Math.random() * 0xffffffff) >>> 0);
    if (initialSave) gameRef.current.restore(initialSave.wave, initialSave.score, initialSave.lives);
  }
  const readRender = useMemo(() => createRenderView(memory, gameRef.current), [memory]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(Phase.Ready);
  const [isPaused, setIsPaused] = useState(false);
  const [showsPauseControls, setShowsPauseControls] = useState(false);
  const [wasRestored, setWasRestored] = useState(initialSave !== null);
  const [bestScore, setBestScore] = useState(() => readStoredJson<number>(BEST_SCORE_STORAGE_KEY, 0));
  const bestScoreRef = useRef(bestScore);
  bestScoreRef.current = bestScore;
  const { isMuted, isMutedRef, toggleMute } = useSharedMute();
  const isPausedRef = useRef(false);
  const keyButtonsRef = useRef(0);
  const touchButtonsRef = useRef(0);
  const needsDrawRef = useRef(true);
  const perfRef = useRef<{ workMilliseconds: Float64Array; frameMilliseconds: Float64Array; count: number } | null>(null);

  useEffect(() => { gameRef.current.set_auto_fire(autoFire); saveStoredJson(AUTO_FIRE_STORAGE_KEY, autoFire); }, [autoFire]);
  const toggleAutoFire = useCallback(() => setAutoFire(on => !on), []);

  const recordBest = useCallback((score: number) => {
    setBestScore(previous => { if (score <= previous) return previous; saveStoredJson(BEST_SCORE_STORAGE_KEY, score); return score; });
  }, []);

  // Saves happen when play stops (pause, tab hidden, leaving, a life lost, a new wave), never every frame.
  const saveProgress = useCallback(() => {
    const game = gameRef.current;
    const currentPhase = game.phase() as Phase;
    recordBest(game.score());
    if (currentPhase === Phase.GameOver || (currentPhase === Phase.Dying && game.lives() === 0)) { saveSlot.clear(); return; }
    saveSlot.save({ wave: game.wave(), score: game.score(), lives: Math.max(1, game.lives()) });
  }, [recordBest, saveSlot]);

  useEffect(() => () => { saveProgress(); gameRef.current.free(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Test hook for e2e/zombie-road.mjs (only with ?zombieTest in the URL).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('zombieTest')) return;
    perfRef.current = { workMilliseconds: new Float64Array(1200), frameMilliseconds: new Float64Array(1200), count: 0 };
    const testWindow = window as unknown as { __zombieTest?: unknown };
    testWindow.__zombieTest = { game: gameRef.current, render: readRender, touchButtons: touchButtonsRef, perf: perfRef.current };
    return () => { delete testWindow.__zombieTest; };
  }, [readRender]);

  const pause = useCallback(() => {
    keyButtonsRef.current = 0;
    touchButtonsRef.current = 0;
    gameRef.current.set_target_x(-1);
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    saveProgress();
  }, [saveProgress]);
  const resume = useCallback(() => {
    primeAudio();
    isPausedRef.current = false;
    setIsPaused(false);
    setShowsPauseControls(false);
    needsDrawRef.current = true;
  }, []);

  const newGame = useCallback(() => {
    primeAudio();
    gameRef.current.restart();
    saveSlot.clear();
    setWasRestored(false);
    if (isPausedRef.current) { isPausedRef.current = false; setIsPaused(false); setShowsPauseControls(false); }
    needsDrawRef.current = true;
  }, [saveSlot]);

  /** Start, resume, or play again: whatever the overlay is asking for. */
  const advanceOverlay = useCallback(() => {
    primeAudio();
    if (isPausedRef.current) { resume(); return; }
    const game = gameRef.current;
    const currentPhase = game.phase() as Phase;
    if (currentPhase === Phase.Ready) { game.start(); setWasRestored(false); }
    else if (currentPhase === Phase.GameOver) newGame();
    needsDrawRef.current = true;
  }, [newGame, resume]);
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
      const scale = canvas.height / WORLD_HEIGHT;
      if (!renderer || Math.abs(renderer.scale - scale) > 0.01) {
        const stains = document.createElement('canvas');
        stains.width = Math.ceil(WORLD_WIDTH * scale);
        stains.height = Math.ceil(WORLD_HEIGHT * scale);
        const stainsContext = stains.getContext('2d')!;
        stainsContext.scale(scale, scale);
        let stainSeed = 12345;
        renderer = {
          context, scale, sprites: createSprites(scale), stains, stainsContext, stainsWave: -1, shownStainSerial: 0,
          stainRandom: () => { stainSeed = (stainSeed * 1664525 + 1013904223) >>> 0; return stainSeed / 4294967296; },
          shownScore: -1, scoreText: '', shownBest: -1, bestText: '', shownWave: -1, waveText: '', waveTitle: '', waveClearTitle: '', waveTagline: '',
          shownLeft: -1, leftText: '', shownLives: -1, livesText: '',
        };
      }
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
      if (events & (Events.waveStart | Events.lifeLost)) window.setTimeout(saveProgress, 0);
      if (events & Events.gameOver) { saveSlot.clear(); recordBest(gameRef.current.score()); }
      if (events & Events.lifeLost && navigator.vibrate) { try { navigator.vibrate(120); } catch { /* not allowed */ } }
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick); // keep the loop alive even if this frame throws
      const seconds = (now - previousTime) / 1000;
      previousTime = now;
      if (isPausedRef.current) { if (needsDrawRef.current && renderer) { needsDrawRef.current = false; drawFrame(renderer, readRender(), now / 1000, bestScoreRef.current); } return; }
      try {
        const workStart = perfRef.current ? performance.now() : 0;
        const game = gameRef.current;
        game.set_input(keyButtonsRef.current | touchButtonsRef.current);
        const events = game.advance(seconds); // the wasm side drops hitches (> 100 ms) and caps slow frames at 50 ms
        const render = readRender();
        if (events) handleEvents(events);
        const currentPhase = render[RenderSlot.phase];
        if (currentPhase !== lastPhase) { lastPhase = currentPhase; setPhase(currentPhase as Phase); needsDrawRef.current = true; }
        // the game-over screen stops once the splats settle: draw once, then idle
        const isStill = currentPhase === Phase.GameOver && render[RenderSlot.particleCount] === 0;
        if (renderer && (!isStill || needsDrawRef.current)) { needsDrawRef.current = false; drawFrame(renderer, render, now / 1000, bestScoreRef.current); }
        const perf = perfRef.current;
        if (perf) {
          const slot = perf.count % perf.workMilliseconds.length;
          perf.workMilliseconds[slot] = performance.now() - workStart;
          perf.frameMilliseconds[slot] = seconds * 1000;
          perf.count++;
        }
      } catch (error) {
        if (!hasLoggedError) { hasLoggedError = true; console.error('Zombie Road frame failed', error); }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); };
  }, [isMutedRef, readRender, recordBest, saveProgress, saveSlot]);

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
        if (event.repeat || isPausedRef.current) return; // only P, Enter or a tap resumes, so a stray arrow key can't unpause
        if (gameRef.current.phase() === Phase.Ready) advanceOverlayRef.current();
      } else if (key === 'enter' && !event.repeat) { event.preventDefault(); advanceOverlayRef.current(); }
      else if (key === 'p' && !event.repeat) { if (isPausedRef.current) resume(); else pause(); }
      else if (key === 'm' && !event.repeat) toggleMute();
      else if (key === 'f' && !event.repeat) toggleAutoFire();
    };
    const handleUp = (event: KeyboardEvent) => {
      const button = buttonForKey(event.key.toLowerCase());
      if (button) keyButtonsRef.current &= ~button;
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [pause, resume, toggleMute, toggleAutoFire]);

  // Dragging on the road itself walks the survivor to the finger (absolute).
  const canvasPointer = useRef<number | null>(null);
  const aimAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    gameRef.current.set_target_x(((event.clientX - box.left) / box.width) * WORLD_WIDTH);
  };

  const showsOverlay = isPaused || phase === Phase.Ready || phase === Phase.GameOver;
  const game = gameRef.current;
  return (
    <div className="game-shell zombie-road" data-testid="zombie-road" data-phase={phase} data-paused={isPaused}>
      <div className="zombie-road__bar">
        <button type="button" className="game-button" onClick={() => (isPaused ? resume() : pause())} data-testid="zombie-pause" aria-label={isPaused ? 'Resume' : 'Pause'}>{isPaused ? '▶' : '❚❚'}</button>
        <button type="button" className="game-button" onClick={newGame} data-testid="zombie-restart">Restart</button>
        <button type="button" className={`game-button${autoFire ? ' is-active' : ''}`} onClick={toggleAutoFire} aria-pressed={autoFire} data-testid="zombie-auto-fire"
          title="Auto-fire (F)">Auto-fire {autoFire ? 'on' : 'off'}</button>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
        <span className="zombie-road__best">High score <b data-testid="zombie-best">{bestScore}</b></span>
      </div>
      <div className="zombie-road__play">
        <div className="zombie-road__stage" ref={stageRef}>
          <canvas ref={canvasRef} className="zombie-road__canvas" data-testid="zombie-canvas" aria-label="Zombie Road playfield"
            onPointerDown={event => {
              if (showsOverlay) { if (!(phase === Phase.GameOver && !isPaused)) advanceOverlay(); return; }
              try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
              canvasPointer.current = event.pointerId;
              aimAt(event);
            }}
            onPointerMove={event => { if (canvasPointer.current === event.pointerId) aimAt(event); }}
            onPointerUp={event => { if (canvasPointer.current === event.pointerId) { canvasPointer.current = null; game.set_target_x(-1); } }}
            onPointerCancel={() => { canvasPointer.current = null; game.set_target_x(-1); }} />
          {showsOverlay && (
            <div className={`zombie-road__overlay${phase === Phase.Ready && !isPaused ? ' is-light' : ''}`} data-testid="zombie-overlay"
              onClick={phase === Phase.GameOver && !isPaused ? undefined : advanceOverlay} role="presentation">
              {isPaused ? <>
                  <b>Paused</b><span>Tap or press P to resume</span>
                  <ControlsToggle isOpen={showsPauseControls} onToggle={() => setShowsPauseControls(open => !open)} testId="zombie-controls-toggle" />
                  {showsPauseControls && <ControlsPanel guide={CONTROLS_GUIDE} stopsClicks testId="zombie-pause-controls" />}
                </>
                : phase === Phase.Ready ? <>
                  <b className="zombie-road__title">ZOMBIE<small>ROAD</small></b>
                  <span className="zombie-road__tagline">Hold the road. Don’t let them through.</span>
                  <span>Wave {game.wave()} · {'❤'.repeat(Math.min(game.lives(), 5))}{wasRestored ? ` · ${game.score()} pts` : ''}</span>
                  {wasRestored && <span className="zombie-road__restored" data-testid="restored">💾 Saved game restored</span>}
                  <ControlsPanel guide={CONTROLS_GUIDE} testId="zombie-controls" />
                  <span className="zombie-road__hint">Press any key or tap to start</span>
                  <span className="zombie-road__share" onClick={event => event.stopPropagation()} role="presentation"><ShareGameButton gameId="zombie-road" gameName={GAME_NAME} testId="zombie-share" /></span>
                </>
                : <>
                  <b className="zombie-road__gameover">Overrun</b>
                  <span data-testid="zombie-final-score">Score {game.score()} · Wave {game.wave()} · High score {Math.max(bestScore, game.score())}</span>
                  <span className="zombie-road__end-actions">
                    <button type="button" className="game-button game-button--primary" onClick={newGame} data-testid="zombie-new-game">Play again</button>
                    <ShareGameButton gameId="zombie-road" gameName={GAME_NAME} testId="zombie-share-end" />
                  </span>
                </>}
            </div>
          )}
        </div>
        <TouchControls buttonsRef={touchButtonsRef} game={game} onPress={() => {
          const currentPhase = gameRef.current.phase() as Phase;
          if (isPausedRef.current || currentPhase === Phase.Ready) advanceOverlayRef.current();
        }} />
      </div>
      <p className="game-help">←→ or A/D move · Space, Z or ↑ fire (hold) · F auto-fire · P pause · M mute · Esc back to the hub.
        Zombies shamble down the road in waves: walkers first, then runners that dodge around cover, spitters that lob acid, brutes that smash
        barricades, and a Tank every fifth wave. Stop them before they reach the hazard line or you. Shots fly over your cover; claws and acid wear it down.
        Pickups: S spread shot, R rapid fire, + medkit (an extra life at full health).</p>
    </div>
  );
}

const CONTROLS_GUIDE: ControlsGuide = {
  keyRows: [
    { keys: ['←', '→'], label: 'Move (or A / D)' },
    { keys: ['Space', '/', 'Z', '/', '↑'], label: 'Fire · hold to keep firing' },
    { keys: ['F'], label: 'Auto-fire on / off' },
    { keys: ['P'], label: 'Pause' },
    { keys: ['M'], label: 'Mute' },
    { keys: ['Esc'], label: 'Back to the hub' },
  ],
  touch: { leftControl: 'drag', leftLabel: 'Drag to move', buttons: [{ name: 'FIRE', label: 'Hold to fire', color: 'rgba(214,58,40,0.8)' }] },
  touchTips: ['Drag on the pad or the road to move', 'Auto-fire (top bar) shoots for you, or hold FIRE'],
  weaponsLabel: 'Pickups',
  weapons: [
    { letter: 'S', name: 'Spread shot', color: PICKUP_COLORS[0] },
    { letter: 'R', name: 'Rapid fire', color: PICKUP_COLORS[1] },
    { letter: '+', name: 'Medkit', color: '#ff5a5a' },
  ],
};

/**
 * On-screen controls for phones: a wide drag pad (slide a thumb and the survivor follows, relative to where you touched) and a
 * big FIRE button. Native pointer events, several fingers at once; held buttons go straight into a ref the loop reads.
 */
function TouchControls({ buttonsRef, game, onPress }: { buttonsRef: React.MutableRefObject<number>; game: ZombieRoad; onPress: () => void }) {
  const padPointer = useRef<number | null>(null);
  const dragStart = useRef({ clientX: 0, playerX: 0 });
  const knobRef = useRef<HTMLSpanElement>(null);
  const movePad = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const travel = event.clientX - dragStart.current.clientX;
    game.set_target_x(Math.min(WORLD_WIDTH, Math.max(0, dragStart.current.playerX + (travel / box.width) * WORLD_WIDTH * 1.4)));
    const knobX = Math.min(box.width / 2 - 22, Math.max(-box.width / 2 + 22, event.clientX - (box.left + box.width / 2)));
    if (knobRef.current) knobRef.current.style.transform = `translateX(${knobX.toFixed(1)}px)`;
  };
  const releasePad = () => {
    padPointer.current = null;
    game.set_target_x(-1);
    if (knobRef.current) knobRef.current.style.transform = '';
  };
  const releaseFire = () => { buttonsRef.current &= ~Buttons.fire; };
  return (
    <div className="zombie-road__touch" data-testid="zombie-touch">
      <div className="zombie-road__pad" data-testid="touch-pad" role="group" aria-label="Drag to move"
        onPointerDown={event => {
          event.preventDefault();
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
          padPointer.current = event.pointerId;
          dragStart.current.clientX = event.clientX;
          dragStart.current.playerX = game.player_x();
          movePad(event);
          onPress();
        }}
        onPointerMove={event => { if (padPointer.current === event.pointerId) movePad(event); }}
        onPointerUp={event => { if (padPointer.current === event.pointerId) releasePad(); }}
        onPointerCancel={releasePad}
        onContextMenu={event => event.preventDefault()}>
        <i>◀</i><span className="zombie-road__knob" ref={knobRef} /><i>▶</i>
      </div>
      <button type="button" className="zombie-road__fire" data-testid="touch-fire" aria-label="Fire"
        onPointerDown={event => {
          event.preventDefault();
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
          buttonsRef.current |= Buttons.fire;
          onPress();
        }}
        onPointerUp={releaseFire} onPointerCancel={releaseFire} onContextMenu={event => event.preventDefault()}>FIRE</button>
    </div>
  );
}
