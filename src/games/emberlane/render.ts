/**
 * Ember Lane frame: sky, parallax village, the street, props, rats, Mira and Kabir, then the light pass — a darkness
 * layer with soft holes cut by every flame (clipped by crate shadows), warm additive glows and light shafts — then
 * embers, smoke, low mist, rat eyes glinting in the dark, a danger tint and the vignette.
 */
import { drawBrazier, drawCrate, drawStairs, drawFirePot, drawFlame, drawLantern, drawLever, drawTorch, drawWindow, hash, LayerCache, paintFar, paintMid, paintSky, paintStreet, toScreenX, toScreenY, type View } from './art';
import { drawKabir, drawMira } from './characters';
import { CRATE, type EmberLane, LANTERN_OIL, KIND, LEVER_X, type Light, PROMPT, PROMPT_TEXT, STAIRS, RAT_STRIDE, ratView, readLights, STAGE_END, STATE } from './engine';

/** World units visible from the bottom of the street band to the top of the view. */
export const VIEW_UNITS = 178;
const STREET_DEPTH = 27;
const MIN_WIDTH_UNITS = 255;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; kind: 0 | 1 | 2 }

export interface Overlay { prompt: number; touch: boolean; }


/** Where a light's shadows are cast from: the middle of the flame as drawn (a brazier's flame stands well above its
 * bowl, so its shadows fall from there, not from the rim). World units above the ground. */
export function shadowSourceHeight(light: Light): number {
  if (light.kind === KIND.brazier) return light.height - 1 + (light.radius > 200 ? 30 : 24) * 0.45;
  if (light.kind === KIND.firePot) return 16 + 20 * 0.45;
  return light.height;
}

/**
 * The crate's shadow for one light, as a screen polygon: everything the crate hides from the flame. Its upper edge is
 * the ray from the flame grazing the crate's top (over the far corner when the flame is above the crate, the near
 * corner when it is below) down to the foot of the walls, and its lower edge is the ray from the flame past the
 * crate's foot across the cobbles, so both edges point straight back at the light (the street beyond stays dark, as
 * in the game). `side` is +1 when the shadow falls to the right of the crate, -1 to the left; `farX`
 * is the crate's far edge (screen x).
 */
export function crateShadow(view: View, farX: number, side: 1 | -1, flameX: number, flameY: number): [number, number][] {
  const width = CRATE.half * 2 * view.scale;
  const nearX = farX - side * width;
  const topY = toScreenY(view, CRATE.height);
  const baseY = view.ground;
  const bottom = view.height + 10;
  const reach = farX + side * 4000;
  const upperX = flameY <= topY ? farX : nearX;
  const dx = (x: number) => (Math.abs(x - flameX) < 1 ? side : x - flameX);
  const upperSlope = (topY - flameY) / dx(upperX);
  const upperY = topY + upperSlope * (reach - upperX);
  // the upper edge runs along the ray until it meets the foot of the walls; the street beyond stays in shadow
  const upper: [number, number][] = upperY > baseY
    ? [[upperX + (baseY - topY) / upperSlope, baseY], [reach, baseY]]
    : [[reach, Math.max(-4000, upperY)]];
  // the lower edge runs from the crate's foot away from the flame, down across the cobbles
  const drop = Math.max(1, baseY - flameY);
  const lowerX = farX + ((bottom - baseY) * dx(farX)) / drop;
  return [[upperX, topY], ...upper, [reach, bottom], [side > 0 ? Math.max(lowerX, farX) : Math.min(lowerX, farX), bottom], [farX, baseY], [farX, topY]];
}

/** Clip to the part of the scene a light reaches: the crate's shadow (if it blocks this light) is cut out. */
function clipToShadow(context: CanvasRenderingContext2D, view: View, light: Light, flameX: number, flameY: number) {
  const hasLeft = light.left > 0.5;
  const hasRight = light.right < STAGE_END - 0.5;
  if (!hasLeft && !hasRight) return;
  context.beginPath();
  context.rect(-10, -10, view.width + 20, view.height + 20);
  const shadows: [number, number][][] = [];
  if (hasRight) shadows.push(crateShadow(view, toScreenX(view, light.right), 1, flameX, flameY));
  if (hasLeft) shadows.push(crateShadow(view, toScreenX(view, light.left), -1, flameX, flameY));
  for (const polygon of shadows) {
    polygon.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
    context.closePath();
  }
  context.clip('evenodd');
}

export class Renderer {
  private sky: HTMLCanvasElement | null = null;
  private skyKey = '';
  private far = new LayerCache(paintFar, 0.22);
  private mid = new LayerCache(paintMid, 0.5);
  private street = new LayerCache(paintStreet, 1);
  private dark = document.createElement('canvas');
  private particles: Particle[] = [];
  private trail: [number, number][] = [];
  private leverTimes = [-9, -9];
  private leverState = [false, false];
  private windowOpen = new Map<number, number>();
  camX = 0;
  private lastTime = 0;

  view(width: number, height: number): View {
    // landscape: fit the street's height; portrait phones: keep at least MIN_WIDTH_UNITS of street in view
    const scale = Math.min(height / VIEW_UNITS, width / MIN_WIDTH_UNITS);
    return { camX: this.camX, scale, width, height, ground: height - STREET_DEPTH * scale };
  }

  /** Snap the camera to Mira (after a respawn or on start). */
  snap(game: EmberLane, width: number, height: number) {
    const view = this.view(width, height);
    this.camX = this.cameraTarget(game, view);
  }

  private cameraTarget(game: EmberLane, view: View) {
    const visible = view.width / view.scale;
    const target = game.player_x() - visible * (0.42 - 0.08 * game.facing());
    return Math.max(0, Math.min(STAGE_END - visible, target));
  }

  burst(x: number, y: number, count: number, kind: 0 | 1 | 2 = 0) {
    for (let index = 0; index < count; index++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const speed = 20 + Math.random() * 60;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed, life: 0.6 + Math.random() * 0.8, age: 0, size: 0.6 + Math.random() * 1.2, kind });
    }
  }

  draw(context: CanvasRenderingContext2D, game: EmberLane, width: number, height: number, ratio: number, now: number, overlay: Overlay) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const time = now / 1000;
    let view = this.view(width, height);
    this.camX += (this.cameraTarget(game, view) - this.camX) * Math.min(1, dt * 4);
    view = this.view(width, height);
    const s = view.scale;
    const lights = readLights(game);
    this.lightAt = x => game.light_at(x);
    this.groundAt = () => view.ground;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    // --- sky + parallax (cached)
    const skyKey = `${width}:${height}:${ratio}`;
    if (skyKey !== this.skyKey) { this.sky = paintSky(width, height, ratio); this.skyKey = skyKey; this.dark.width = Math.ceil(width / 2); this.dark.height = Math.ceil(height / 2); }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(this.sky!, 0, 0);
    this.drawClouds(context, width * ratio, height * ratio, time);
    this.far.draw(context, view, ratio);
    this.drawSmokeColumns(context, view, ratio, time);
    this.mid.draw(context, view, ratio);
    this.street.draw(context, view, ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    // --- props
    const visible = (x: number, margin = 60) => x > view.camX - margin && x < view.camX + width / s + margin;
    for (let index = 0; index < 2; index++) {
      const pulled = game.lever(index);
      if (pulled !== this.leverState[index]) { this.leverState[index] = pulled; this.leverTimes[index] = time; }
      if (visible(LEVER_X[index])) drawLever(context, view, LEVER_X[index], pulled, this.leverTimes[index], time);
    }
    lights.forEach((light, index) => {
      if (!visible(light.x, 80)) return;
      if (light.kind === KIND.torch || light.kind === KIND.flicker) drawTorch(context, view, light, light.lit ? light.intensity : 0, time, index * 1.7);
      else if (light.kind === KIND.brazier) drawBrazier(context, view, light, light.intensity, time, index * 2.3, light.radius > 200);
      else if (light.kind === KIND.firePot) drawFirePot(context, view, light, light.intensity, time, game.pot_left());
      else if (light.kind === KIND.hearth) this.drawHearth(context, view, light, time);
      else if (light.kind === KIND.window) {
        const target = light.lit ? 1 : 0;
        const current = this.windowOpen.get(index) ?? target;
        const next = current + (target - current) * Math.min(1, dt * 5);
        this.windowOpen.set(index, next);
        drawWindow(context, view, light.x, light.height, next, time);
      }
    });
    const crateX = game.crate_x(0);
    if (visible(STAIRS.x)) drawStairs(context, view, STAIRS);

    // --- lantern lying on its hook / the ground
    const lantern = lights.find(light => light.kind === KIND.lantern)!;
    if (!game.carrying() && visible(lantern.x)) {
      const onHook = game.oil() >= LANTERN_OIL - 0.01 && !lantern.lit;
      const lx = toScreenX(view, lantern.x);
      const ly = toScreenY(view, onHook ? 44 : 5);
      if (onHook) { context.strokeStyle = '#2b2b30'; context.lineWidth = 2 * s; context.beginPath(); context.moveTo(lx - 8 * s, ly - 14 * s); context.lineTo(lx, ly - 14 * s); context.lineTo(lx, ly - 11 * s); context.stroke(); }
      drawLantern(context, lx, ly, s, lantern.lit, lantern.intensity, time);
      if (onHook) { context.fillStyle = `rgba(255, 220, 140, ${0.35 + 0.25 * Math.sin(time * 3)})`; context.beginPath(); context.arc(lx, ly - 2 * s, 9 * s, 0, Math.PI * 2); context.fill(); }
    }

    // --- rats (back half), characters, rats (front half)
    const rats = ratView(game);
    const ratCount = game.rat_count();
    drawRatSwarm(context, view, rats, ratCount, time, false, this.lightAt, this.groundAt);
    const state = game.state();
    const isDead = state === STATE.dead;
    const deadT = isDead ? game.state_time() : 0;
    const fear = game.danger();
    const charY = view.ground + 7 * s;
    const playerX = toScreenX(view, game.player_x());
    const kabirX = toScreenX(view, game.sibling_x());
    const kabirMoving = Math.abs(game.sibling_x() - (this.lastKabir ?? game.sibling_x())) > 0.05;
    this.lastKabir = game.sibling_x();
    // contact shadows
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    for (const [x, w, y] of [[playerX, 8, game.player_y()], [kabirX, 6, game.sibling_y()]] as const) { context.beginPath(); context.ellipse(x, charY - y * s, w * s * (1 - Math.min(0.5, y / 80)), 1.8 * s, 0, 0, Math.PI * 2); context.fill(); }
    const miraHands = drawMira(context, {
      x: playerX, y: charY - game.player_y() * s, s, facing: game.facing(), walked: game.walked(), moving: state === STATE.walk || state === STATE.push, time, fear,
      pushing: state === STATE.push, throwing: state === STATE.throw ? game.state_time() : undefined, climbing: state === STATE.climb, carrying: game.carrying(), dead: isDead ? deadT : 0,
    });
    const holdHands = !game.carrying() && state === STATE.idle && !kabirMoving && Math.abs(game.sibling_x() - game.player_x()) < 30 ? miraHands.back : null;
    drawKabir(context, { x: kabirX, y: charY - 0.5 * s - game.sibling_y() * s, s, facing: game.sibling_facing(), walked: game.sibling_walked(), moving: kabirMoving, time, fear, dead: isDead ? deadT : 0 }, holdHands);
    if (game.carrying()) drawLantern(context, miraHands.front[0], miraHands.front[1] + 9 * s, s, lantern.lit, lantern.intensity, time);
    drawRatSwarm(context, view, rats, ratCount, time, true, this.lightAt, this.groundAt);

    // --- ember in flight
    if (game.ember_active()) {
      const ex = toScreenX(view, game.ember_x());
      const ey = toScreenY(view, game.ember_y()) + 7 * s;
      this.trail.push([ex + view.camX * s, ey]);
      if (this.trail.length > 14) this.trail.shift();
      this.trail.forEach(([tx, ty], index) => {
        context.fillStyle = `rgba(255, ${140 + index * 6}, 60, ${index / this.trail.length * 0.8})`;
        context.beginPath(); context.arc(tx - view.camX * s, ty, (0.6 + index * 0.12) * s, 0, Math.PI * 2); context.fill();
      });
      drawFlame(context, ex, ey + 2 * s, 7 * s, time * 2, 5, 1);
    } else this.trail.length = 0;

    // --- light pass: warm the whole scene, then lay the darkness over it
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = '#ffd6aa';
    context.fillRect(0, 0, width, height);
    context.restore();
    this.drawDarkness(context, view, lights, game, ratio, charY);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (visible(crateX)) this.drawShadedCrate(context, view, game, crateX);
    drawRatSwarm(context, view, rats, ratCount, time, false, this.lightAt, this.groundAt, true);
    drawRatSwarm(context, view, rats, ratCount, time, true, this.lightAt, this.groundAt, true);
    this.drawGlows(context, view, lights, time, game, miraHands.front);
    this.stepParticles(context, view, lights, dt, time);
    drawRatEyes(context, view, rats, ratCount, time, this.lightAt, this.groundAt);
    this.drawMist(context, view, time);
    if (game.throw_target() >= 0 && !isDead) this.drawAim(context, view, game, lights[game.throw_target()], time);
    // danger + vignette
    if (fear > 0.02) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 14);
      const red = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.75);
      red.addColorStop(0, 'rgba(120, 0, 0, 0)'); red.addColorStop(1, `rgba(150, 0, 10, ${fear * (0.45 + 0.2 * pulse)})`);
      context.fillStyle = red; context.fillRect(0, 0, width, height);
    }
    const vignette = context.createRadialGradient(width / 2, height * 0.55, Math.min(width, height) * 0.3, width / 2, height * 0.55, Math.max(width, height) * 0.78);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)'); vignette.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
    context.fillStyle = vignette; context.fillRect(0, 0, width, height);
    if (isDead) { context.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, Math.max(0, deadT - 0.6) * 0.9)})`; context.fillRect(0, 0, width, height); }
    if (overlay.prompt && !isDead) this.drawPrompt(context, view, playerX, charY - (54 + game.player_y()) * s, game.player_x() < 1000 && overlay.prompt === PROMPT.climb ? 'Climb the steps' : game.player_x() < 1000 && overlay.prompt === PROMPT.hopDown ? 'Step down' : PROMPT_TEXT[overlay.prompt], overlay.touch);
  }

  private lastKabir: number | null = null;
  private lightAt: (x: number) => number = () => 0;
  private groundAt: (x: number) => number = () => 0;

  private drawHearth(context: CanvasRenderingContext2D, view: View, light: Light, time: number) {
    const s = view.scale;
    const x = toScreenX(view, light.x);
    const ground = view.ground;
    context.fillStyle = '#4a4440';
    for (let stone = 0; stone < 7; stone++) { const a = Math.PI + (stone / 6) * Math.PI; context.beginPath(); context.ellipse(x + Math.cos(a) * 16 * s, ground - 3 * s + Math.sin(a) * 2 * s, 4.5 * s, 3.2 * s, 0, 0, Math.PI * 2); context.fill(); }
    context.strokeStyle = '#3a2412'; context.lineWidth = 2.6 * s;
    context.beginPath(); context.moveTo(x - 10 * s, ground - 2 * s); context.lineTo(x + 8 * s, ground - 8 * s); context.moveTo(x + 10 * s, ground - 2 * s); context.lineTo(x - 8 * s, ground - 8 * s); context.stroke();
    drawFlame(context, x, ground - 5 * s, 28 * s, time, 1.3, 1);
    // a little pot on a tripod
    context.strokeStyle = '#2a2a2e'; context.lineWidth = 1.6 * s;
    context.beginPath(); context.moveTo(x - 18 * s, ground); context.lineTo(x, ground - 44 * s); context.lineTo(x + 18 * s, ground); context.stroke();
    context.fillStyle = '#222226'; context.beginPath(); context.ellipse(x, ground - 30 * s, 7 * s, 5 * s, 0, 0, Math.PI); context.fill();
  }

  /** The crate after the darkness pass: lit on whichever face sees a flame. */
  private drawShadedCrate(context: CanvasRenderingContext2D, view: View, game: EmberLane, crateX: number) {
    drawCrate(context, view, crateX);
    const lit = Math.max(game.light_at(crateX - CRATE.half - 1), game.light_at(crateX + CRATE.half + 1));
    const s = view.scale;
    context.fillStyle = `rgba(6, 6, 16, ${0.88 * (1 - lit)})`;
    context.fillRect(toScreenX(view, crateX - CRATE.half) - 1, view.ground - CRATE.height * s - 1, CRATE.half * 2 * s + 2, CRATE.height * s + 2);
  }

  /** Rat bodies; the moonlit pass draws them again after the darkness as faint cool silhouettes. */
  private drawDarkness(context: CanvasRenderingContext2D, view: View, lights: Light[], game: EmberLane, ratio: number, charY: number) {
    const dark = this.dark.getContext('2d')!;
    const half = 0.5;
    dark.setTransform(half, 0, 0, half, 0, 0);
    dark.globalCompositeOperation = 'source-over';
    dark.clearRect(0, 0, view.width, view.height);
    const shade = dark.createLinearGradient(0, 0, 0, view.height);
    shade.addColorStop(0, 'rgba(5, 6, 20, 0.62)');
    shade.addColorStop(0.4, 'rgba(4, 5, 16, 0.92)');
    shade.addColorStop(1, 'rgba(2, 2, 8, 0.97)');
    dark.fillStyle = shade;
    dark.fillRect(0, 0, view.width, view.height);
    dark.globalCompositeOperation = 'destination-out';
    const s = view.scale;
    const time = performance.now() / 1000;
    lights.forEach((light, index) => {
      if (!light.lit || light.intensity <= 0.01) return;
      let x = toScreenX(view, light.x);
      let y = toScreenY(view, light.height);
      if (light.kind === KIND.lantern && game.carrying()) { x = toScreenX(view, game.player_x() + game.facing() * 7); y = charY - 26 * s; }
      const flicker = light.kind === KIND.window || light.kind === KIND.door ? 1 : 1 + Math.sin(time * 9 + index) * 0.025 + Math.sin(time * 23 + index * 3) * 0.015;
      const radius = light.radius * s * (light.kind === KIND.brazier && light.radius > 200 ? 0.95 : 1.05) * flicker;
      if (x + radius < 0 || x - radius > view.width) return;
      dark.save();
      clipToShadow(dark, view, light, x, light.kind === KIND.lantern ? y : toScreenY(view, shadowSourceHeight(light)));
      const hole = dark.createRadialGradient(x, y, 0, x, y, radius);
      const strength = light.intensity;
      hole.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      hole.addColorStop(0.18, `rgba(0, 0, 0, ${0.94 * strength})`);
      hole.addColorStop(0.5, `rgba(0, 0, 0, ${0.62 * strength})`);
      hole.addColorStop(0.8, `rgba(0, 0, 0, ${0.22 * strength})`);
      hole.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dark.fillStyle = hole;
      dark.beginPath(); dark.ellipse(x, y, radius, radius * 0.92, 0, 0, Math.PI * 2); dark.fill();
      dark.restore();
    });
    // a faint rim so the children never vanish completely
    for (const wx of [game.player_x(), game.sibling_x()]) {
      const x = toScreenX(view, wx);
      const rim = dark.createRadialGradient(x, charY - 14 * s, 0, x, charY - 14 * s, 26 * s);
      rim.addColorStop(0, 'rgba(0, 0, 0, 0.42)'); rim.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dark.fillStyle = rim;
      dark.fillRect(x - 26 * s, charY - 40 * s, 52 * s, 52 * s);
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(this.dark, 0, 0, this.dark.width, this.dark.height, 0, 0, view.width * ratio, view.height * ratio);
  }

  private drawGlows(context: CanvasRenderingContext2D, view: View, lights: Light[], time: number, game: EmberLane, hand: [number, number]) {
    const s = view.scale;
    context.save();
    context.globalCompositeOperation = 'lighter';
    lights.forEach((light, index) => {
      if (!light.lit || light.intensity <= 0.01) return;
      let x = toScreenX(view, light.x);
      let y = toScreenY(view, light.height);
      if (light.kind === KIND.lantern && game.carrying()) { x = hand[0]; y = hand[1] + 7 * s; }
      if (x < -light.radius * s || x > view.width + light.radius * s) return;
      const flicker = 0.9 + 0.1 * Math.sin(time * 11 + index * 1.7);
      const warm = light.kind === KIND.window || light.kind === KIND.door ? '255, 196, 120' : '255, 150, 60';
      context.save();
      clipToShadow(context, view, light, x, light.kind === KIND.lantern ? y : toScreenY(view, shadowSourceHeight(light)));
      const halo = context.createRadialGradient(x, y, 0, x, y, light.radius * s * 0.75);
      halo.addColorStop(0, `rgba(${warm}, ${0.32 * light.intensity * flicker})`);
      halo.addColorStop(0.4, `rgba(${warm}, ${0.12 * light.intensity * flicker})`);
      halo.addColorStop(1, `rgba(${warm}, 0)`);
      context.fillStyle = halo;
      context.fillRect(x - light.radius * s, y - light.radius * s, light.radius * 2 * s, light.radius * 2 * s);
      // volumetric shafts falling from the flame
      if (light.kind !== KIND.lantern && light.kind !== KIND.firePot) {
        const shafts = light.kind === KIND.door ? 5 : 3;
        for (let shaft = 0; shaft < shafts; shaft++) {
          const spread = (shaft - (shafts - 1) / 2) * 0.32 + Math.sin(time * 0.4 + index + shaft) * 0.05;
          const length = light.radius * s * 0.9;
          const ray = context.createLinearGradient(x, y, x + Math.sin(spread) * length, y + Math.cos(spread) * length);
          ray.addColorStop(0, `rgba(${warm}, ${0.07 * light.intensity})`); ray.addColorStop(1, `rgba(${warm}, 0)`);
          context.fillStyle = ray;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + Math.sin(spread - 0.12) * length, y + Math.cos(spread - 0.12) * length);
          context.lineTo(x + Math.sin(spread + 0.12) * length, y + Math.cos(spread + 0.12) * length);
          context.closePath(); context.fill();
        }
      }
      const core = context.createRadialGradient(x, y - 4 * s, 0, x, y - 4 * s, 14 * s);
      core.addColorStop(0, `rgba(255, 230, 170, ${0.55 * light.intensity})`); core.addColorStop(1, 'rgba(255, 180, 90, 0)');
      context.fillStyle = core;
      context.fillRect(x - 14 * s, y - 18 * s, 28 * s, 28 * s);
      context.restore();
    });
    context.restore();
  }

  private stepParticles(context: CanvasRenderingContext2D, view: View, lights: Light[], dt: number, time: number) {
    // spawn embers and smoke from flames (world coordinates)
    lights.forEach(light => {
      if (!light.lit || light.intensity < 0.3 || light.kind === KIND.window || light.kind === KIND.door) return;
      if (light.x < view.camX - 100 || light.x > view.camX + view.width / view.scale + 100) return;
      const rate = light.kind === KIND.brazier || light.kind === KIND.hearth ? 9 : light.kind === KIND.lantern ? 0 : 3.5;
      if (Math.random() < rate * dt) this.particles.push({ x: light.x + (Math.random() - 0.5) * 6, y: light.height + 8, vx: (Math.random() - 0.5) * 10, vy: 18 + Math.random() * 22, life: 1.2 + Math.random() * 1.4, age: 0, size: 0.5 + Math.random() * 0.9, kind: 0 });
      if ((light.kind === KIND.brazier || light.kind === KIND.hearth || light.kind === KIND.torch) && Math.random() < (light.kind === KIND.torch ? 1.2 : 2.5) * dt) {
        this.particles.push({ x: light.x, y: light.height + 18, vx: 4 + Math.random() * 6, vy: 10 + Math.random() * 8, life: 3 + Math.random() * 2, age: 0, size: 4 + Math.random() * 4, kind: 1 });
      }
    });
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
    const s = view.scale;
    context.save();
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      particle.age += dt;
      if (particle.age >= particle.life) { this.particles.splice(index, 1); continue; }
      particle.x += (particle.vx + Math.sin(time * 2 + index) * 6) * dt;
      particle.y += particle.vy * dt;
      if (particle.kind === 2) particle.vy -= 120 * dt;
      const t = particle.age / particle.life;
      const x = toScreenX(view, particle.x);
      const y = toScreenY(view, particle.y);
      if (particle.kind === 1) {
        context.globalCompositeOperation = 'source-over';
        const size = particle.size * (1 + t * 2.5) * s;
        const puff = context.createRadialGradient(x, y, 0, x, y, size);
        const alpha = 0.16 * Math.min(1, t * 4) * (1 - t);
        puff.addColorStop(0, `rgba(80, 72, 80, ${alpha})`); puff.addColorStop(1, 'rgba(80, 72, 80, 0)');
        context.fillStyle = puff;
        context.fillRect(x - size, y - size, size * 2, size * 2);
      } else {
        context.globalCompositeOperation = 'lighter';
        const flick = 0.6 + 0.4 * Math.sin(time * 30 + index);
        context.fillStyle = particle.kind === 2 ? `rgba(200, 190, 180, ${0.6 * (1 - t)})` : `rgba(255, ${150 + Math.floor(80 * (1 - t))}, 60, ${(1 - t) * flick})`;
        context.beginPath(); context.arc(x, y, particle.size * s * (1 - t * 0.5), 0, Math.PI * 2); context.fill();
      }
    }
    context.restore();
  }

  private drawMist(context: CanvasRenderingContext2D, view: View, time: number) {
    const s = view.scale;
    for (let band = 0; band < 3; band++) {
      const offset = ((time * (6 + band * 3) + band * 400 - view.camX * s * (0.8 + band * 0.1)) % (view.width + 600)) - 300;
      const mist = context.createRadialGradient(offset + 300, view.ground - 4 * s, 0, offset + 300, view.ground - 4 * s, 340);
      mist.addColorStop(0, 'rgba(150, 160, 200, 0.07)'); mist.addColorStop(1, 'rgba(150, 160, 200, 0)');
      context.fillStyle = mist;
      context.fillRect(offset - 60, view.ground - 60 * s, 720, 90 * s);
    }
  }

  private drawClouds(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
    for (let cloud = 0; cloud < 4; cloud++) {
      const x = ((time * (4 + cloud) * 3 + cloud * 520 - this.camX * 0.08 * width / 600) % (width + 600)) - 300;
      const y = height * (0.12 + cloud * 0.07);
      const g = context.createRadialGradient(x, y, 0, x, y, width * 0.18);
      g.addColorStop(0, 'rgba(60, 60, 100, 0.22)'); g.addColorStop(1, 'rgba(60, 60, 100, 0)');
      context.fillStyle = g;
      context.beginPath(); context.ellipse(x, y, width * 0.2, height * 0.05, 0, 0, Math.PI * 2); context.fill();
    }
  }

  private drawSmokeColumns(context: CanvasRenderingContext2D, view: View, ratio: number, time: number) {
    // far pyre smoke drifting up behind the village
    for (const fx of [600, 1700, 2800]) {
      const x = (fx * 0.22 - view.camX * 0.22) * view.scale * ratio;
      if (x < -200 || x > view.width * ratio + 200) continue;
      for (let puff = 0; puff < 6; puff++) {
        const t = (time * 0.05 + puff / 6) % 1;
        const y = (view.ground - (40 + t * 160) * view.scale) * ratio;
        const r = (12 + t * 40) * view.scale * ratio;
        context.fillStyle = `rgba(40, 36, 50, ${0.25 * (1 - t)})`;
        context.beginPath(); context.arc(x + Math.sin(t * 6 + puff) * 10 * ratio + t * 60 * ratio, y, r, 0, Math.PI * 2); context.fill();
      }
    }
  }

  private drawAim(context: CanvasRenderingContext2D, view: View, game: EmberLane, target: Light, time: number) {
    const s = view.scale;
    const x0 = toScreenX(view, game.player_x());
    const y0 = view.ground - 30 * s;
    const x1 = toScreenX(view, target.x);
    const y1 = toScreenY(view, target.height);
    context.save();
    context.setLineDash([3 * s, 4 * s]);
    context.lineDashOffset = -time * 20;
    context.strokeStyle = 'rgba(255, 180, 90, 0.45)';
    context.lineWidth = 1.2 * s;
    context.beginPath(); context.moveTo(x0, y0); context.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 60 * s, x1, y1); context.stroke();
    context.setLineDash([]);
    context.strokeStyle = `rgba(255, 190, 100, ${0.5 + 0.3 * Math.sin(time * 6)})`;
    context.beginPath(); context.arc(x1, y1 - 2 * s, (9 + Math.sin(time * 6) * 1.5) * s, 0, Math.PI * 2); context.stroke();
    context.restore();
  }

  private drawPrompt(context: CanvasRenderingContext2D, view: View, x: number, y: number, text: string, touch: boolean) {
    const s = view.scale;
    const label = `${touch ? '✋' : 'E'}  ${text}`;
    context.font = `700 ${Math.round(Math.max(11, 5.4 * s))}px system-ui, sans-serif`;
    const width = context.measureText(label).width + 16;
    const height = Math.max(20, 9 * s);
    context.fillStyle = 'rgba(10, 12, 24, 0.82)';
    context.strokeStyle = 'rgba(255, 200, 120, 0.7)';
    context.lineWidth = 1.2;
    context.beginPath(); context.roundRect(x - width / 2, y - height, width, height, height / 2); context.fill(); context.stroke();
    context.fillStyle = '#ffe2b0';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(label, x, y - height / 2 + 1);
    context.textAlign = 'start'; context.textBaseline = 'alphabetic';
  }
}

export { CRATE };

/**
 * The rat swarm (stage one's street and stage two's yard): the back or front half of the lanes, or (moonlit) their
 * faint blue shapes over the darkness. `groundAt` gives the screen y of the ground under a world x.
 */
export function drawRatSwarm(context: CanvasRenderingContext2D, view: View, rats: Float32Array, count: number, time: number, front: boolean, lightAt: (x: number) => number, groundAt: (x: number) => number, moonlit = false) {
  const s = view.scale;
  if (moonlit) context.save();
  for (let index = 0; index < count; index++) {
    const base = index * RAT_STRIDE;
    const state = rats[base + 3];
    if (state < 0.5) continue;
    const lane = rats[base + 2];
    if ((lane >= 0.5) !== front) continue;
    const x = toScreenX(view, rats[base]);
    if (x < -20 || x > view.width + 20) continue;
    if (moonlit) { const shade = 1 - lightAt(rats[base]); if (shade < 0.05) continue; context.globalAlpha = 0.34 * shade; }
    const vx = rats[base + 1];
    const phase = rats[base + 5];
    const y = groundAt(rats[base]) + (1.5 + lane * 20) * s;
    const dir = vx >= 0 ? 1 : -1;
    const size = (0.85 + hash(index) * 0.35) * s;
    const hop = Math.abs(Math.sin(phase)) * 1.2 * size * (Math.abs(vx) > 20 ? 1 : 0.3);
    context.save();
    context.translate(x, y - hop);
    context.scale(dir, 1);
    // tail
    context.strokeStyle = moonlit ? '#3e4660' : '#4a3a36';
    context.lineWidth = 0.9 * size;
    context.beginPath();
    context.moveTo(-4 * size, -1.6 * size);
    context.quadraticCurveTo(-8 * size, -1 * size + Math.sin(phase * 1.3) * 2 * size, -11 * size, -2.4 * size + Math.sin(phase) * 1.5 * size);
    context.stroke();
    // body
    context.fillStyle = moonlit ? (index % 3 ? '#262b40' : '#30364e') : index % 3 ? '#2b2421' : '#3a302a';
    context.beginPath(); context.ellipse(0, -2.4 * size, 5 * size, 2.5 * size, 0, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.ellipse(4.4 * size, -2.6 * size, 2.6 * size, 1.8 * size, 0.2, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#5a4a44';
    context.beginPath(); context.arc(3.6 * size, -4.4 * size, 1.1 * size, 0, Math.PI * 2); context.fill();
    context.fillStyle = 'rgba(255, 220, 200, 0.08)';
    context.beginPath(); context.ellipse(-0.5 * size, -3.8 * size, 3.5 * size, 0.8 * size, 0, 0, Math.PI * 2); context.fill();
    // scurrying legs
    context.strokeStyle = '#1d1715'; context.lineWidth = 0.7 * size;
    context.beginPath();
    for (const offset of [-2.5, 2.5]) { const swing = Math.sin(phase * 2 + offset) * 1.4 * size; context.moveTo(offset * size, -1 * size); context.lineTo(offset * size + swing, 0); }
    context.stroke();
    context.restore();
  }
  if (moonlit) context.restore();
}

/** Rat eyes glinting in the dark. */
export function drawRatEyes(context: CanvasRenderingContext2D, view: View, rats: Float32Array, count: number, time: number, lightAt: (x: number) => number, groundAt: (x: number) => number) {
  const s = view.scale;
  context.save();
  context.globalCompositeOperation = 'lighter';
  for (let index = 0; index < count; index++) {
    const base = index * RAT_STRIDE;
    if (rats[base + 3] < 0.5) continue;
    const wx = rats[base];
    const x = toScreenX(view, wx);
    if (x < -10 || x > view.width + 10) continue;
    // blink now and then
    if ((time * 0.7 + hash(index * 7)) % 1 < 0.06) continue;
    const light = lightAt(wx);
    const near = Math.max(0.25, Math.min(1, 1 - light * 0.6));
    const dir = rats[base + 1] >= 0 ? 1 : -1;
    const size = (0.85 + hash(index) * 0.35) * s;
    const y = groundAt(wx) + (1.5 + rats[base + 2] * 20) * s - 4.4 * size;
    context.fillStyle = `rgba(255, ${70 + Math.floor(light * 80)}, 40, ${0.75 * near})`;
    context.beginPath(); context.arc(x + dir * 5.6 * size, y + 1.3 * size, 0.55 * size, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}
