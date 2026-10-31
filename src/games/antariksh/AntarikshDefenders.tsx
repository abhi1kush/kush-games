import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { readStoredJson, saveStoredJson } from '../random';
import { MuteButton, useSharedMute } from '../sharedSound';
import { type ControlsGuide, ControlsPanel, ControlsToggle } from '../ControlsPanel';
import {
  type BackdropLayers, createBackdrop, createSprites, drawEnemyBullet, drawFlame, drawGlow, drawParticle, drawPlayerBullet, ENEMY_SPRITE_HEIGHT, ENEMY_SPRITE_WIDTH,
  GlowColor, GROUND_STRIP_HEIGHT, LAYER_SPEEDS, MYSTERY_SPRITE_HEIGHT, MYSTERY_SPRITE_WIDTH, PLAYER_SPRITE_SIZE, QUEEN_SPRITE_HEIGHT, QUEEN_SPRITE_WIDTH, SAFFRON, type Sprites,
} from './art';
import {
  AntarikshDefenders, Backdrop, Buttons, createMemoryViews, EnemyKind, Events, GROUND_Y, loadAntarikshEngine, MAX_ENEMIES, type MemoryViews, MYSTERY_Y, Phase, PLAYER_Y, Power,
  RenderSlot, stageName, Weapons, WORLD_HEIGHT, WORLD_WIDTH,
} from './engine';
import { createAntarikshSaveSlot } from './save';
import { playLimited, playMarch, primeAudio, type SoundKind } from './sounds';
import '../shared.css';
import './antariksh.css';

const BEST_SCORE_STORAGE_KEY = 'kush-games-antariksh-defenders-best';

export default function AntarikshDefendersScreen() {
  const [memory, setMemory] = useState<WebAssembly.Memory | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { loadAntarikshEngine().then(setMemory, () => setLoadError(true)); }, []);
  if (loadError) return <div className="game-shell"><p className="game-banner game-banner--lose">Couldn’t load the game engine. Please refresh.</p></div>;
  if (!memory) return <div className="game-shell" data-testid="antariksh-loading"><p className="game-help">Loading…</p></div>;
  return <AntarikshGame memory={memory} />;
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

const EVENT_SOUNDS: [number, SoundKind][] = [
  [Events.playerDown, 'playerDown'], [Events.gameOver, 'gameOver'], [Events.waveClear, 'waveClear'], [Events.extraLife, 'extraLife'], [Events.powerUp, 'powerUp'],
  [Events.mysteryDown, 'mysteryDown'], [Events.liftoff, 'liftoff'], [Events.countdownTick, 'countdownTick'], [Events.bubblePop, 'bubblePop'],
  [Events.enemyDown, 'enemyDown'], [Events.mysteryAppear, 'mysteryAppear'], [Events.waveStart, 'waveStart'], [Events.shoot, 'shoot'],
  [Events.enemyShoot, 'enemyShoot'], [Events.queenHit, 'queenHit'], [Events.queenDown, 'queenDown'], [Events.weaponUnlock, 'weaponUnlock'],
];

/** Everything the renderer keeps between frames (sprites for the current size, cached HUD text). */
interface Renderer {
  context: CanvasRenderingContext2D;
  scale: number;
  backdrops: (BackdropLayers | undefined)[];
  sprites: Sprites;
  /** Parallax state: distance flown (in "cruise seconds") since this stage's backdrop appeared, and the current speed factor. */
  travel: number;
  sceneryTravel: number;
  speed: number;
  lastClock: number;
  shownBackdrop: number;
  shownScore: number;
  scoreText: string;
  shownBest: number;
  bestText: string;
  shownWave: number;
  waveText: string;
  waveTitle: string;
  stageTitle: string;
  hudBar?: CanvasGradient;
  queenHitUntil: number;
  bannerUntil: number;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerColor: string;
}

const COUNTDOWN_TEXT = ['T-3', 'T-2', 'T-1'] as const;
const STREAKS = 26;

/** How fast the scenery rushes past in each phase: cruising while playing, a warp burst between stages. */
function targetSpeed(phase: Phase) {
  switch (phase) {
    case Phase.Playing: return 1;
    case Phase.Countdown: return 0.7;
    case Phase.WaveClear: case Phase.WaveIntro: return 4.5;
    case Phase.Dying: return 0.5;
    default: return 0.35;
  }
}

/** Draw a vertically seamless tile scrolled down by `offset` world units. */
function drawScrolling(context: CanvasRenderingContext2D, layer: HTMLCanvasElement, offset: number) {
  const y = offset % WORLD_HEIGHT;
  context.drawImage(layer, -2, y, WORLD_WIDTH + 4, WORLD_HEIGHT);
  context.drawImage(layer, -2, y - WORLD_HEIGHT, WORLD_WIDTH + 4, WORLD_HEIGHT);
}

function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  context.fillStyle = 'rgba(0,0,0,0.6)';
  context.fillText(text, x + 0.6, y + 0.6);
  context.fillStyle = color;
  context.fillText(text, x, y);
}

/** Draw one frame from the wasm render buffer. Backdrop layers and sprites are pre-rendered; the layers scroll down for a forward-flight feel. */
function drawFrame(renderer: Renderer, views: MemoryViews, clock: number, bestScore: number) {
  const { context, scale, sprites } = renderer;
  const { render } = views;
  const phase = render[RenderSlot.phase] as Phase;
  const phaseSeconds = render[RenderSlot.phaseSeconds];
  const backdropKind = render[RenderSlot.backdrop] as Backdrop;
  const backdrop = renderer.backdrops[backdropKind] ??= createBackdrop(scale, backdropKind);
  const shake = render[RenderSlot.shake];
  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 3 : 0;
  const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 3 : 0;
  context.setTransform(scale, 0, 0, scale, shakeX * scale, shakeY * scale);

  // parallax: everything behind the ship scrolls down (the ship flies "up" into space); far layers slower than near ones
  const delta = Math.min(0.1, Math.max(0, clock - renderer.lastClock));
  renderer.lastClock = clock;
  if (renderer.shownBackdrop !== backdropKind) { renderer.shownBackdrop = backdropKind; renderer.sceneryTravel = 0; }
  renderer.speed += (targetSpeed(phase) - renderer.speed) * Math.min(1, delta * 2.5);
  renderer.travel += delta * renderer.speed;
  renderer.sceneryTravel += delta * renderer.speed;
  const travel = renderer.travel;
  context.drawImage(backdrop.sky, -2, -2, WORLD_WIDTH + 4, WORLD_HEIGHT + 4);
  drawScrolling(context, backdrop.farStars, travel * LAYER_SPEEDS.farStars);
  drawScrolling(context, backdrop.nebula, travel * LAYER_SPEEDS.nebula);
  // the stage's planet drifts past and comes round again; Earth just falls away below as the ship climbs
  const sceneryDistance = renderer.sceneryTravel * LAYER_SPEEDS.scenery;
  const sceneryY = backdropKind === Backdrop.Earth ? Math.min(sceneryDistance, WORLD_HEIGHT)
    : ((sceneryDistance + WORLD_HEIGHT) % (WORLD_HEIGHT * 2)) - WORLD_HEIGHT;
  if (sceneryY < WORLD_HEIGHT) context.drawImage(backdrop.scenery, -2, sceneryY, WORLD_WIDTH + 4, WORLD_HEIGHT);
  drawScrolling(context, backdrop.midStars, travel * LAYER_SPEEDS.midStars);

  // near streaks: fast star trails that stretch out during the warp between stages
  const stretch = 1 + Math.max(0, renderer.speed - 1) * 2.2;
  for (let streak = 0; streak < STREAKS; streak++) {
    const speed = 55 + (streak % 5) * 22;
    const x = (streak * 97.31 + 13) % WORLD_WIDTH;
    const length = (1.2 + (streak % 5) * 0.7) * stretch;
    const y = ((streak * 53.7 + travel * speed) % (WORLD_HEIGHT + 30)) - 15;
    context.fillStyle = streak % 7 === 0 ? 'rgba(255,200,140,0.6)' : 'rgba(210,230,255,0.55)';
    context.fillRect(x, y, streak % 3 === 0 ? 0.8 : 0.5, length);
  }
  context.drawImage(backdrop.pad, -2, GROUND_Y, WORLD_WIDTH + 4, GROUND_STRIP_HEIGHT);

  // the formation (warping in from above at the start of a wave)
  const entering = phase === Phase.WaveIntro || phase === Phase.Countdown || phase === Phase.Ready;
  const entry = phase === Phase.Ready ? 1 : phase === Phase.Countdown ? Math.min(1, phaseSeconds / 3) : Math.min(1, phaseSeconds / 1.2);
  const dropIn = entering ? -(1 - entry) * (1 - entry) * 140 : 0;
  const marchFrame = render[RenderSlot.marchFrame];
  let queenX = -1, queenY = 0;
  for (let index = 0; index < MAX_ENEMIES; index++) {
    const offset = RenderSlot.enemies + index * RenderSlot.enemyStride;
    if (render[offset] === 0) continue;
    const kind = render[offset + 1];
    const x = render[offset + 2], y = render[offset + 3] + dropIn;
    if (kind === EnemyKind.Queen) { queenX = x; queenY = y; continue; }
    context.drawImage(sprites.enemies[kind * 2 + marchFrame], x - ENEMY_SPRITE_WIDTH / 2, y - ENEMY_SPRITE_HEIGHT / 2, ENEMY_SPRITE_WIDTH, ENEMY_SPRITE_HEIGHT);
  }
  if (queenX >= 0) {
    // the queen: a pulsing aura, her sprite (flashing white when hit), and her armour pips
    const hurt = clock < renderer.queenHitUntil;
    context.globalCompositeOperation = 'lighter';
    drawGlow(context, sprites, GlowColor.Magenta, queenX, queenY, 30 + Math.sin(clock * 4) * 3, hurt ? 0.9 : 0.45);
    context.globalCompositeOperation = 'source-over';
    context.drawImage(sprites.enemies[EnemyKind.Queen * 2 + marchFrame], queenX - QUEEN_SPRITE_WIDTH / 2, queenY - QUEEN_SPRITE_HEIGHT / 2 - 1, QUEEN_SPRITE_WIDTH, QUEEN_SPRITE_HEIGHT);
    if (hurt) {
      context.globalCompositeOperation = 'lighter';
      drawGlow(context, sprites, GlowColor.White, queenX, queenY, 16, 0.8);
      context.globalCompositeOperation = 'source-over';
    }
    const hitsLeft = render[RenderSlot.queenHitsLeft], hitsMax = render[RenderSlot.queenHitsMax];
    const pipWidth = 2.4, gap = 0.8, total = hitsMax * (pipWidth + gap) - gap;
    for (let pip = 0; pip < hitsMax; pip++) {
      context.fillStyle = pip < hitsLeft ? '#ff4fd8' : 'rgba(255,255,255,0.18)';
      context.fillRect(queenX - total / 2 + pip * (pipWidth + gap), queenY - 13, pipWidth, 1.1);
    }
  }

  if (render[RenderSlot.mysteryActive] === 1) {
    const sprite = sprites.mystery[backdropKind <= Backdrop.Moon ? (render[RenderSlot.mysteryDirection] > 0 ? 0 : 1) : 2];
    const mysteryX = render[RenderSlot.mysteryX], mysteryY = MYSTERY_Y + Math.sin(clock * 5) * 0.6;
    context.globalCompositeOperation = 'lighter';
    drawGlow(context, sprites, backdropKind <= Backdrop.Moon ? GlowColor.Cyan : GlowColor.Magenta, mysteryX, mysteryY, 26, 0.35);
    context.globalCompositeOperation = 'source-over';
    context.drawImage(sprite, mysteryX - MYSTERY_SPRITE_WIDTH / 2, mysteryY - MYSTERY_SPRITE_HEIGHT / 2, MYSTERY_SPRITE_WIDTH, MYSTERY_SPRITE_HEIGHT);
  }

  const capsuleCount = render[RenderSlot.capsuleCount];
  for (let index = 0; index < capsuleCount; index++) {
    const offset = RenderSlot.capsules + index * RenderSlot.capsuleStride;
    const isBubble = render[offset] === Power.Bubble;
    const x = render[offset + 1] + Math.sin(clock * 6 + index) * 0.8, y = render[offset + 2];
    context.globalCompositeOperation = 'lighter';
    drawGlow(context, sprites, isBubble ? GlowColor.Cyan : GlowColor.Saffron, x, y, 16 + Math.sin(clock * 8) * 2, 0.6);
    context.globalCompositeOperation = 'source-over';
    context.drawImage(sprites.capsules[isBubble ? 1 : 0], x - 4.5, y - 4.5, 9, 9);
  }

  // the launcher
  const playerX = render[RenderSlot.playerX];
  const weapons = render[RenderSlot.weapons];
  const isBlinking = render[RenderSlot.invulnerable] > 0 && Math.floor(clock * 14) % 2 === 0;
  if (phase !== Phase.Dying && phase !== Phase.GameOver && !isBlinking) {
    const liftoff = phase === Phase.Countdown && phaseSeconds >= 3 ? (phaseSeconds - 3) * 6 : 0;
    drawFlame(context, playerX, PLAYER_Y + liftoff * 0.2, clock, sprites);
    if (liftoff > 0) drawFlame(context, playerX, PLAYER_Y + 2 + liftoff * 0.3, clock + 0.3, sprites);
    if (weapons !== 0) {
      // weapon pods: saffron wing-tip cannons for triple shot, a cyan nose barrel for the machine gun
      context.globalCompositeOperation = 'lighter';
      if (weapons & Weapons.triple) for (const side of [-1, 1]) drawGlow(context, sprites, GlowColor.Saffron, playerX + side * 6.5, PLAYER_Y - 2, 6 + Math.sin(clock * 9) * 1, 0.8);
      if (weapons & Weapons.rapid) drawGlow(context, sprites, GlowColor.Cyan, playerX, PLAYER_Y - 10, 7 + Math.sin(clock * 11) * 1, 0.9);
      context.globalCompositeOperation = 'source-over';
    }
    context.drawImage(sprites.player, playerX - PLAYER_SPRITE_SIZE / 2, PLAYER_Y - PLAYER_SPRITE_SIZE / 2, PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
    if (weapons & Weapons.triple) {
      context.fillStyle = SAFFRON;
      for (const side of [-1, 1]) context.fillRect(playerX + side * 6.5 - 0.6, PLAYER_Y - 4, 1.2, 3);
    }
    if (weapons & Weapons.rapid) { context.fillStyle = '#bfefff'; context.fillRect(playerX - 0.5, PLAYER_Y - 11.5, 1, 2); }
    const power = render[RenderSlot.power] as Power;
    if (power === Power.Bubble && (render[RenderSlot.powerSeconds] > 2 || Math.floor(clock * 8) % 2 === 0)) {
      const radius = 11 + Math.sin(clock * 6) * 0.6;
      const bubble = context.createRadialGradient(playerX, PLAYER_Y, radius * 0.6, playerX, PLAYER_Y, radius);
      bubble.addColorStop(0, 'rgba(79,195,247,0)');
      bubble.addColorStop(1, 'rgba(79,195,247,0.3)');
      context.fillStyle = bubble;
      context.beginPath(); context.arc(playerX, PLAYER_Y, radius, 0, Math.PI * 2); context.fill();
      context.strokeStyle = 'rgba(160,230,255,0.9)';
      context.lineWidth = 0.7;
      context.stroke();
    }
  }

  const boltStyle = weapons === Weapons.both ? 2 : weapons & Weapons.rapid ? 1 : 0;
  const playerBulletCount = render[RenderSlot.playerBulletCount];
  context.globalCompositeOperation = 'lighter';
  for (let index = 0; index < playerBulletCount; index++) {
    const offset = RenderSlot.playerBullets + index * RenderSlot.playerBulletStride;
    drawPlayerBullet(context, sprites, render[offset], render[offset + 1], boltStyle);
  }
  context.globalCompositeOperation = 'source-over';
  const enemyBulletCount = render[RenderSlot.enemyBulletCount];
  for (let index = 0; index < enemyBulletCount; index++) {
    const offset = RenderSlot.enemyBullets + index * RenderSlot.enemyBulletStride;
    drawEnemyBullet(context, render[offset], render[offset + 1], render[offset + 2], render[offset + 3]);
  }
  const particleCount = render[RenderSlot.particleCount];
  for (let index = 0; index < particleCount; index++) {
    const offset = RenderSlot.particles + index * RenderSlot.particleStride;
    drawParticle(context, sprites, render[offset], render[offset + 1], render[offset + 2], render[offset + 3], render[offset + 4], index);
  }
  const flash = render[RenderSlot.flash];
  if (flash > 0) {
    context.globalAlpha = Math.min(0.5, flash);
    context.fillStyle = '#ffffff';
    context.fillRect(-4, -4, WORLD_WIDTH + 8, WORLD_HEIGHT + 8);
    context.globalAlpha = 1;
  }

  // HUD (no shake)
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const hudBar = renderer.hudBar ??= (() => {
    const gradient = context.createLinearGradient(0, 0, 0, 16);
    gradient.addColorStop(0, 'rgba(3,6,20,0.85)');
    gradient.addColorStop(1, 'rgba(3,6,20,0)');
    return gradient;
  })();
  context.fillStyle = hudBar;
  context.fillRect(0, 0, WORLD_WIDTH, 16);
  const score = render[RenderSlot.score];
  const best = Math.max(bestScore, score);
  const wave = render[RenderSlot.wave];
  if (score !== renderer.shownScore) { renderer.shownScore = score; renderer.scoreText = String(score).padStart(6, '0'); }
  if (best !== renderer.shownBest) { renderer.shownBest = best; renderer.bestText = String(best).padStart(6, '0'); }
  if (wave !== renderer.shownWave) {
    renderer.shownWave = wave;
    const name = stageName(wave).toUpperCase();
    renderer.waveText = `W${wave} · ${name}`;
    renderer.waveTitle = `WAVE ${wave}`;
    renderer.stageTitle = name;
  }
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.font = '700 3.6px system-ui, sans-serif';
  drawText(context, 'SCORE', 5, 5.5, 'rgba(255,255,255,0.55)');
  context.font = '800 6.4px ui-monospace, Menlo, Consolas, monospace';
  drawText(context, renderer.scoreText, 5, 12, '#ffffff');
  context.textAlign = 'center';
  context.font = '700 3.6px system-ui, sans-serif';
  drawText(context, 'HIGH SCORE', 104, 5.5, 'rgba(255,217,168,0.6)');
  context.font = '800 6.4px ui-monospace, Menlo, Consolas, monospace';
  drawText(context, renderer.bestText, 104, 12, '#ffd9a8');
  context.textAlign = 'right';
  context.font = '700 3.6px system-ui, sans-serif';
  drawText(context, 'SECTOR', WORLD_WIDTH - 5, 5.5, 'rgba(126,224,138,0.6)');
  context.font = '800 5.2px system-ui, sans-serif';
  drawText(context, renderer.waveText, WORLD_WIDTH - 5, 12, '#7ee08a');
  context.fillStyle = 'rgba(255,153,51,0.35)';
  context.fillRect(0, 15.5, WORLD_WIDTH, 0.3);

  const lives = render[RenderSlot.lives];
  const shownLives = phase === Phase.Dying ? lives : Math.max(0, lives - 1); // the ship on the pad is one of them
  for (let life = 0; life < Math.min(shownLives, 6); life++) context.drawImage(sprites.life, 4 + life * 8, 270, 8, 10);
  // weapon status, bottom right: chips for each bonus, or the fused triple stream
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.font = '800 4.6px system-ui, sans-serif';
  let chipRight = WORLD_WIDTH - 4;
  const chip = (label: string, color: string) => {
    const width = context.measureText(label).width + 5;
    context.fillStyle = 'rgba(3,6,20,0.7)';
    context.fillRect(chipRight - width, 271.5, width, 6.5);
    context.fillStyle = color;
    context.fillRect(chipRight - width, 271.5, 0.8, 6.5);
    drawText(context, label, chipRight - 2, 275, color);
    chipRight -= width + 2;
  };
  if (weapons === Weapons.both) chip('TRIPLE STREAM', '#ffd23f');
  else {
    if (weapons & Weapons.rapid) chip('MACHINE GUN', '#4fc3f7');
    if (weapons & Weapons.triple) chip('TRIPLE SHOT', SAFFRON);
  }
  const power = render[RenderSlot.power] as Power;
  if (power === Power.Bubble) {
    const seconds = render[RenderSlot.powerSeconds];
    chip('SHIELD', '#4fc3f7');
    context.fillStyle = '#4fc3f7';
    context.fillRect(chipRight + 2, 278.4, (context.measureText('SHIELD').width + 5) * Math.min(1, seconds / 9), 0.8);
  }

  // banners: mission-control countdown, wave intros, wave clear, weapon unlocks
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (phase === Phase.Countdown) {
    const step = Math.floor(phaseSeconds);
    context.font = '700 6px system-ui, sans-serif';
    drawText(context, 'MISSION CONTROL  ·  GO FOR LAUNCH', WORLD_WIDTH / 2, 138, 'rgba(255,255,255,0.85)');
    const pulse = 1 - (phaseSeconds - step);
    context.font = `900 ${30 + pulse * 6}px system-ui, sans-serif`;
    context.globalAlpha = 0.75 + pulse * 0.25;
    drawText(context, step < 3 ? COUNTDOWN_TEXT[step] : 'LIFTOFF!', WORLD_WIDTH / 2, 166, step < 3 ? '#ffffff' : SAFFRON);
    context.globalAlpha = 1;
    context.font = '800 6.5px system-ui, sans-serif';
    drawText(context, renderer.waveText, WORLD_WIDTH / 2, 192, '#7ee08a');
  } else if (phase === Phase.WaveIntro) {
    context.globalAlpha = Math.min(1, phaseSeconds * 3, (1.8 - phaseSeconds) * 3);
    drawPlate(context, 128, 40);
    context.font = '900 20px system-ui, sans-serif';
    drawText(context, renderer.waveTitle, WORLD_WIDTH / 2, 141, SAFFRON);
    context.font = '800 7.5px system-ui, sans-serif';
    drawText(context, renderer.stageTitle, WORLD_WIDTH / 2, 160, '#7ee08a');
    context.globalAlpha = 1;
  } else if (phase === Phase.WaveClear) {
    context.globalAlpha = Math.min(1, phaseSeconds * 4);
    drawPlate(context, 134, 24);
    context.font = '900 16px system-ui, sans-serif';
    drawText(context, 'SECTOR CLEAR', WORLD_WIDTH / 2, 146, '#ffffff');
    context.globalAlpha = 1;
  }
  const bannerLeft = renderer.bannerUntil - clock;
  if (bannerLeft > 0 && phase !== Phase.GameOver) {
    const age = BANNER_SECONDS - bannerLeft;
    context.globalAlpha = Math.min(1, age * 6, bannerLeft * 3);
    const pop = 1 + Math.max(0, 0.25 - age) * 1.6;
    drawPlate(context, 196, 26);
    context.font = `900 ${11 * pop}px system-ui, sans-serif`;
    drawText(context, renderer.bannerTitle, WORLD_WIDTH / 2, 205, renderer.bannerColor);
    context.font = '700 5.4px system-ui, sans-serif';
    drawText(context, renderer.bannerSubtitle, WORLD_WIDTH / 2, 216, 'rgba(255,255,255,0.85)');
    context.globalAlpha = 1;
  }
}

const BANNER_SECONDS = 2.4;

/** A soft dark plate behind centred banner text (y is the plate's top). */
function drawPlate(context: CanvasRenderingContext2D, y: number, height: number) {
  const plate = context.createLinearGradient(0, 0, WORLD_WIDTH, 0);
  plate.addColorStop(0, 'rgba(3,6,20,0)');
  plate.addColorStop(0.2, 'rgba(3,6,20,0.72)');
  plate.addColorStop(0.8, 'rgba(3,6,20,0.72)');
  plate.addColorStop(1, 'rgba(3,6,20,0)');
  context.fillStyle = plate;
  context.fillRect(0, y, WORLD_WIDTH, height);
}

/** What the unlock banner says for the weapon bits just reached. */
function weaponBanner(weapons: number, queenDown: boolean): [string, string, string] {
  if (weapons === Weapons.both) return ['TRIPLE STREAM UNLOCKED', 'Triple shot + machine gun · hold fire for three streams', '#ffd23f'];
  if (weapons & Weapons.rapid) return [queenDown ? 'QUEEN DOWN · MACHINE GUN' : 'MACHINE GUN', 'Hold fire for a continuous stream', '#4fc3f7'];
  return ['TRIPLE SHOT', 'Three bolts per shot · kill the queen for the machine gun', SAFFRON];
}

function AntarikshGame({ memory }: { memory: WebAssembly.Memory }) {
  const saveSlot = useMemo(() => createAntarikshSaveSlot(), []);
  const [initialSave] = useState(() => saveSlot.load());
  const gameRef = useRef<AntarikshDefenders>(null as unknown as AntarikshDefenders);
  if (!gameRef.current) {
    gameRef.current = new AntarikshDefenders();
    gameRef.current.seed((Math.random() * 0xffffffff) >>> 0);
    if (initialSave) gameRef.current.restore(initialSave.wave, initialSave.score, initialSave.lives);
  }
  const readViews = useMemo(() => createMemoryViews(memory, gameRef.current), [memory]);
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
  // Test hook for e2e/antariksh-defenders.mjs (only with ?antarikshTest in the URL).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('antarikshTest')) return;
    perfRef.current = { workMilliseconds: new Float64Array(1200), frameMilliseconds: new Float64Array(1200), count: 0 };
    const testWindow = window as unknown as { __antarikshTest?: unknown };
    testWindow.__antarikshTest = { game: gameRef.current, views: readViews, touchButtons: touchButtonsRef, perf: perfRef.current };
    return () => { delete testWindow.__antarikshTest; };
  }, [readViews]);

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
    gameRef.current.restart();
    saveSlot.clear();
    setWasRestored(false);
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
        renderer = {
          context, scale, backdrops: [], sprites: createSprites(scale), travel: 0, sceneryTravel: 0, speed: 1, lastClock: performance.now() / 1000, shownBackdrop: -1,
          queenHitUntil: 0, bannerUntil: 0, bannerTitle: '', bannerSubtitle: '', bannerColor: '#ffffff',
          shownScore: -1, scoreText: '', shownBest: -1, bestText: '', shownWave: -1, waveText: '', waveTitle: '', stageTitle: '',
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
    const handleEvents = (events: number, views: MemoryViews) => {
      const muted = isMutedRef.current;
      if (events & Events.march) playMarch(views.render[RenderSlot.marchNote], muted);
      if (renderer && events & Events.queenHit) renderer.queenHitUntil = performance.now() / 1000 + 0.08;
      if (renderer && events & Events.weaponUnlock) {
        [renderer.bannerTitle, renderer.bannerSubtitle, renderer.bannerColor] = weaponBanner(views.render[RenderSlot.weapons], (events & Events.queenDown) !== 0);
        renderer.bannerUntil = performance.now() / 1000 + BANNER_SECONDS;
      }
      for (const [bit, sound] of EVENT_SOUNDS) if (events & bit) playLimited(sound, muted);
      if (events & (Events.waveStart | Events.playerDown)) window.setTimeout(saveProgress, 0);
      if (events & Events.gameOver) { saveSlot.clear(); recordBest(gameRef.current.score()); }
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick); // keep the loop alive even if this frame throws
      const seconds = (now - previousTime) / 1000;
      previousTime = now;
      if (isPausedRef.current) return;
      try {
        const workStart = perfRef.current ? performance.now() : 0;
        const game = gameRef.current;
        game.set_input(keyButtonsRef.current | touchButtonsRef.current);
        const events = game.advance(seconds); // the wasm side drops hitches (> 100 ms) and caps slow frames at 50 ms
        const views = readViews();
        if (events) handleEvents(events, views);
        const currentPhase = views.render[RenderSlot.phase];
        if (currentPhase !== lastPhase) { lastPhase = currentPhase; setPhase(currentPhase as Phase); needsDrawRef.current = true; }
        // the game-over screen stops once the sparks settle: draw once, then idle (the start screen keeps the stars drifting)
        const isStill = currentPhase === Phase.GameOver && views.render[RenderSlot.particleCount] === 0;
        if (renderer && (!isStill || needsDrawRef.current)) { needsDrawRef.current = false; drawFrame(renderer, views, now / 1000, bestScoreRef.current); }
        const perf = perfRef.current;
        if (perf) {
          const slot = perf.count % perf.workMilliseconds.length;
          perf.workMilliseconds[slot] = performance.now() - workStart;
          perf.frameMilliseconds[slot] = seconds * 1000;
          perf.count++;
        }
      } catch (error) {
        if (!hasLoggedError) { hasLoggedError = true; console.error('Antariksh Defenders frame failed', error); }
      }
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); };
  }, [isMutedRef, readViews, recordBest, saveProgress, saveSlot]);

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
    };
    const handleUp = (event: KeyboardEvent) => {
      const button = buttonForKey(event.key.toLowerCase());
      if (button) keyButtonsRef.current &= ~button;
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [pause, resume, toggleMute]);

  // Dragging on the playfield itself flies the ship to the finger (absolute).
  const canvasPointer = useRef<number | null>(null);
  const aimAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    gameRef.current.set_target_x(((event.clientX - box.left) / box.width) * WORLD_WIDTH);
  };

  const showsOverlay = isPaused || phase === Phase.Ready || phase === Phase.GameOver;
  const game = gameRef.current;
  return (
    <div className="game-shell antariksh" data-testid="antariksh" data-phase={phase} data-paused={isPaused}>
      <div className="antariksh__bar">
        <button type="button" className="game-button" onClick={() => (isPaused ? resume() : pause())} data-testid="antariksh-pause" aria-label={isPaused ? 'Resume' : 'Pause'}>{isPaused ? '▶' : '❚❚'}</button>
        <button type="button" className="game-button" onClick={newGame} data-testid="antariksh-restart">Restart</button>
        <MuteButton isMuted={isMuted} onToggle={toggleMute} />
        <span className="antariksh__best">High score <b data-testid="antariksh-best">{bestScore}</b></span>
      </div>
      <div className="antariksh__play">
        <div className="antariksh__stage" ref={stageRef}>
          <canvas ref={canvasRef} className="antariksh__canvas" data-testid="antariksh-canvas" aria-label="Antariksh Defenders playfield"
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
            <div className={`antariksh__overlay${phase === Phase.Ready && !isPaused ? ' is-light' : ''}`} data-testid="antariksh-overlay"
              onClick={phase === Phase.GameOver && !isPaused ? undefined : advanceOverlay} role="presentation">
              {isPaused ? <>
                  <b>Paused</b><span>Tap or press P to resume</span>
                  <ControlsToggle isOpen={showsPauseControls} onToggle={() => setShowsPauseControls(open => !open)} testId="antariksh-controls-toggle" />
                  {showsPauseControls && <ControlsPanel guide={CONTROLS_GUIDE} stopsClicks testId="antariksh-pause-controls" />}
                </>
                : phase === Phase.Ready ? <>
                  <b className="antariksh__title">ANTARIKSH<small>DEFENDERS</small></b>
                  <span className="antariksh__tagline">Defend the journey from Earth to deep space</span>
                  <span>Wave {game.wave()} · {stageName(game.wave())} · {'🚀'.repeat(Math.min(game.lives(), 6))}{wasRestored ? ` · ${game.score()} pts` : ''}</span>
                  {wasRestored && <span className="antariksh__restored" data-testid="restored">💾 Saved mission restored</span>}
                  <ControlsPanel guide={CONTROLS_GUIDE} testId="antariksh-controls" />
                  <span className="antariksh__hint">Press any key or tap to launch</span>
                </>
                : <>
                  <b className="antariksh__gameover">Mission over</b>
                  <span data-testid="antariksh-final-score">Score {game.score()} · Wave {game.wave()} · High score {Math.max(bestScore, game.score())}</span>
                  <button type="button" className="game-button game-button--primary" onClick={newGame} data-testid="antariksh-new-game">Launch again</button>
                </>}
            </div>
          )}
        </div>
        <TouchControls buttonsRef={touchButtonsRef} game={game} onPress={() => {
          const currentPhase = gameRef.current.phase() as Phase;
          if (isPausedRef.current || currentPhase === Phase.Ready) advanceOverlayRef.current();
        }} />
      </div>
      <p className="game-help">←→ or A/D move · Space, Z or ↑ fire (hold to keep firing) · P pause · M mute · Esc back to the hub.
        Weapon bonuses: catch a T capsule (from the comet or mothership) for the triple shot; shoot down the crowned queen in the
        centre of every formation (she takes several hits behind her guards) for the machine gun; hold both for the triple stream. Bonuses last until you lose a ship.</p>
    </div>
  );
}

const CONTROLS_GUIDE: ControlsGuide = {
  keyRows: [
    { keys: ['←', '→'], label: 'Move (or A / D)' },
    { keys: ['Space', '/', 'Z', '/', '↑'], label: 'Fire · hold to keep firing' },
    { keys: ['P'], label: 'Pause' },
    { keys: ['M'], label: 'Mute' },
    { keys: ['Esc'], label: 'Back to the hub' },
  ],
  touch: { leftControl: 'drag', leftLabel: 'Drag to fly', buttons: [{ name: 'FIRE', label: 'Hold to fire', color: 'rgba(255,153,51,0.75)' }] },
  touchTips: ['Drag on the pad or the playfield to move', 'Hold FIRE with another finger'],
  weaponsLabel: 'Bonuses',
  weapons: [
    { letter: 'T', name: 'Triple shot', color: SAFFRON },
    { letter: '♛', name: 'Queen → machine gun', color: '#ff4fd8' },
    { letter: '3', name: 'Both → 3 streams', color: '#ffd23f' },
    { letter: 'S', name: 'Shield', color: '#4fc3f7' },
  ],
};

/**
 * On-screen controls for phones: a wide drag pad (slide a thumb and the ship follows, relative to where you touched) and a
 * big FIRE button. Native pointer events, several fingers at once; held buttons go straight into a ref the loop reads.
 */
function TouchControls({ buttonsRef, game, onPress }: { buttonsRef: React.MutableRefObject<number>; game: AntarikshDefenders; onPress: () => void }) {
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
    <div className="antariksh__touch" data-testid="antariksh-touch">
      <div className="antariksh__pad" data-testid="touch-pad" role="group" aria-label="Drag to move"
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
        <i>◀</i><span className="antariksh__knob" ref={knobRef} /><i>▶</i>
      </div>
      <button type="button" className="antariksh__fire" data-testid="touch-fire" aria-label="Fire"
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
