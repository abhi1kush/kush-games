/**
 * Stage two frame ("The Guard Steps"): sky and far rooftops, the terrace behind the sanctuary, the stone staircase
 * down into the walled yard, the soldier's hanging lamp, barrels where Kabir hides, the stone pile, the far gate;
 * then Mira, Kabir and the soldier (with his suspicion eye), stones and embers in flight, and the light pass — the
 * same darkness-with-holes as stage one, so putting out the lamp really drops the yard into the dark — and a while
 * later the rats boil up out of the drain under it (stage one's swarm, drawn on the yard floor).
 */
import { drawFlame, drawLantern, drawTorch, hash, LayerCache, paintFar, paintSky, toScreenX, toScreenY, type View } from './art';
import { drawKabir, drawMira } from './characters';
import { GUARD, GUARD_PROMPT, GUARD_PROMPT_TEXT, GUARD_STATE, type GuardSteps, ITEM, KIND_HANGING_LAMP, type Light, MIRA_STRIKE, ratView, readGuardLights, RAT_STRIDE, scorpionView, STATE } from './engine';
import { drawRatEyes, drawRatSwarm } from './render';
import { drawSoldier, drawSuspicion } from './soldier';

/** World units visible: stage one's 178 plus the drop into the yard. */
export const GUARD_VIEW_UNITS = 200 + GUARD.yardDepth;
const FLOOR_DEPTH = 27;
const MIN_WIDTH_UNITS = 255;
const LAMP_ARM_Y = 40;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; kind: 0 | 1 | 2 }
export interface GuardOverlay { prompt: number; touch: boolean }

const D = GUARD.yardDepth;
const tread = (GUARD.stairsBottom - GUARD.stairsTop) / GUARD.steps;
const rise = D / GUARD.steps;

/** The yard's stonework, painted once per chunk. y = 0 is the terrace; the yard floor is y = -D. */
function paintYard(context: CanvasRenderingContext2D, u0: number, u1: number, scale: number, ground: number, height: number) {
  const S = (u: number) => u * scale;
  const Y = (y: number) => ground - y * scale;
  // the yard's back wall: big ashlar blocks with two arches and a high walkway
  const wall = context.createLinearGradient(0, Y(90), 0, Y(-D));
  wall.addColorStop(0, '#2b2a36'); wall.addColorStop(1, '#3b3634');
  context.fillStyle = wall;
  const wallLeft = Math.max(u0, GUARD.stairsTop - 40); const wallRight = Math.min(u1, GUARD.exitTop + 40);
  if (wallLeft < wallRight) context.fillRect(S(wallLeft), Y(92), S(wallRight - wallLeft), Y(-D) - Y(92));
  context.strokeStyle = 'rgba(10, 8, 14, 0.5)'; context.lineWidth = S(0.8);
  context.beginPath();
  for (let row = 0; row < 14; row++) {
    const y = -D + row * 10;
    const left = Math.max(u0, GUARD.stairsTop - 40); const right = Math.min(u1, GUARD.exitTop + 40);
    if (left >= right) break;
    context.moveTo(S(left), Y(y)); context.lineTo(S(right), Y(y));
    for (let u = Math.floor(left / 24) * 24 + (row % 2) * 12; u < right; u += 24) { if (u < left) continue; context.moveTo(S(u), Y(y)); context.lineTo(S(u), Y(y + 10)); }
  }
  context.stroke();
  for (const ax of [590, 820]) {
    if (ax + 40 < u0 || ax - 40 > u1) continue;
    context.fillStyle = '#121019';
    context.beginPath(); context.moveTo(S(ax - 22), Y(-D)); context.lineTo(S(ax - 22), Y(-D + 40)); context.arc(S(ax), Y(-D + 40), S(22), Math.PI, 0); context.lineTo(S(ax + 22), Y(-D)); context.fill();
    context.fillStyle = 'rgba(70, 60, 90, 0.25)';
    for (let bar = -16; bar <= 16; bar += 8) context.fillRect(S(ax + bar) - S(0.8), Y(-D + 58), S(1.6), S(58));
  }
  // banners (plain cloth, no emblem)
  for (const bx of [515, 905]) {
    if (bx + 20 < u0 || bx - 20 > u1) continue;
    context.fillStyle = '#5a1f22';
    context.beginPath(); context.moveTo(S(bx - 9), Y(70)); context.lineTo(S(bx + 9), Y(70)); context.lineTo(S(bx + 9), Y(22)); context.lineTo(S(bx), Y(28)); context.lineTo(S(bx - 9), Y(22)); context.closePath(); context.fill();
    context.fillStyle = 'rgba(200, 160, 80, 0.5)'; context.fillRect(S(bx - 9), Y(66), S(18), S(1.4));
  }
  // the terrace behind the sanctuary (left) and the gate terrace (right): stone floor bands and retaining walls
  const terraces: [number, number][] = [[0, GUARD.stairsTop], [GUARD.exitTop, GUARD.stageEnd + 40]];
  for (const [a, b] of terraces) {
    if (b < u0 || a > u1) continue;
    const face = context.createLinearGradient(0, Y(0), 0, height);
    face.addColorStop(0, '#4b4440'); face.addColorStop(1, '#24201f');
    context.fillStyle = face;
    context.fillRect(S(a), Y(0), S(b - a), height - Y(0));
    context.fillStyle = '#5c5550';
    context.fillRect(S(a), Y(0), S(b - a), S(10));
    context.fillStyle = 'rgba(255, 240, 220, 0.12)'; context.fillRect(S(a), Y(0), S(b - a), S(1.2));
    context.strokeStyle = 'rgba(10, 8, 8, 0.45)'; context.lineWidth = S(0.8);
    context.beginPath();
    for (let u = Math.floor(a / 18) * 18; u < b; u += 18) { if (u < a) continue; context.moveTo(S(u), Y(0)); context.lineTo(S(u - 3), Y(-10)); }
    for (let row = 1; row < 7; row++) { context.moveTo(S(a), Y(-10 - row * 8)); context.lineTo(S(b), Y(-10 - row * 8)); }
    context.stroke();
  }
  // yard floor: worn flagstones
  const fx0 = GUARD.stairsTop; const fx1 = GUARD.exitTop;
  if (!(fx1 < u0 || fx0 > u1)) {
    const floor = context.createLinearGradient(0, Y(-D), 0, height);
    floor.addColorStop(0, '#4a4542'); floor.addColorStop(1, '#262220');
    context.fillStyle = floor;
    context.fillRect(S(fx0), Y(-D), S(fx1 - fx0), height - Y(-D));
    const rows = Math.ceil((height - Y(-D)) / S(7)) + 1;
    for (let row = 0; row < rows; row++) {
      const size = 16 + row * 2.4;
      for (let u = Math.floor(fx0 / size) * size; u < fx1; u += size) {
        const shade = 64 + Math.floor(hash(Math.floor(u / size) * 13 + row * 101) * 22) - row * 3;
        context.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 7})`;
        context.fillRect(S(u + (row % 2) * size * 0.5) + 1, Y(-D) + S(row * 7) + S(1), S(size) - 2, S(6));
      }
    }
    // a drain grate under the lamp
    context.fillStyle = '#16141a'; context.fillRect(S(GUARD.lampX + 30), Y(-D) + S(3), S(18), S(4));
    context.strokeStyle = '#3a3640'; context.lineWidth = S(0.8);
    context.beginPath(); for (let bar = 2; bar < 18; bar += 4) { context.moveTo(S(GUARD.lampX + 30 + bar), Y(-D) + S(3)); context.lineTo(S(GUARD.lampX + 30 + bar), Y(-D) + S(7)); } context.stroke();
    // a jagged crack across the flagstones: the scorpions' home
    const cx = GUARD.crackX;
    context.fillStyle = '#121014';
    context.beginPath();
    context.moveTo(S(cx - 14), Y(-D) + S(4));
    for (const [dx, dy] of [[-9, 2.6], [-5, 5.2], [-1, 3.4], [3, 6], [7, 3.8], [11, 5.4], [14, 4.4]] as const) context.lineTo(S(cx + dx), Y(-D) + S(dy));
    for (const [dx, dy] of [[11, 7], [6, 5.4], [2, 8], [-3, 5.6], [-8, 6.8]] as const) context.lineTo(S(cx + dx), Y(-D) + S(dy));
    context.closePath(); context.fill();
  }
  // the two staircases: solid stone with lit nosings
  for (const [top, bottom] of [[GUARD.stairsTop, GUARD.stairsBottom], [GUARD.exitTop, GUARD.exitBottom]] as const) {
    const dir = bottom > top ? 1 : -1;
    if (Math.max(top, bottom) < u0 - 20 || Math.min(top, bottom) > u1 + 20) continue;
    for (let step = 0; step < GUARD.steps; step++) {
      const x0 = top + dir * step * tread; const x1 = x0 + dir * tread;
      const y = -(step + 1) * rise;
      const left = Math.min(x0, x1);
      const body = context.createLinearGradient(0, Y(y), 0, height);
      body.addColorStop(0, '#6e6358'); body.addColorStop(1, '#2a2522');
      context.fillStyle = body;
      context.fillRect(S(left), Y(y), S(tread), height - Y(y));
      context.fillStyle = 'rgba(255, 238, 210, 0.28)'; context.fillRect(S(left), Y(y), S(tread), S(1.4));
      context.fillStyle = 'rgba(0, 0, 0, 0.3)';
      context.fillRect(dir > 0 ? S(x0) - S(1.2) : S(x0), Y(y + rise), S(1.2), S(rise));
      context.strokeStyle = 'rgba(20, 16, 14, 0.6)'; context.lineWidth = S(0.8);
      context.strokeRect(S(left), Y(y), S(tread), S(8));
    }
  }
  // the sanctuary's back wall and door (where they came out)
  if (u0 < 70) {
    context.fillStyle = '#3a3036'; context.fillRect(S(0), Y(110), S(46), Y(0) - Y(110));
    context.fillStyle = '#20161a';
    context.beginPath(); context.moveTo(S(12), Y(0)); context.lineTo(S(12), Y(30)); context.arc(S(26), Y(30), S(14), Math.PI, 0); context.lineTo(S(40), Y(0)); context.fill();
    context.fillStyle = 'rgba(255, 190, 110, 0.35)';
    context.beginPath(); context.moveTo(S(15), Y(0)); context.lineTo(S(15), Y(30)); context.arc(S(26), Y(30), S(11), Math.PI, 0); context.lineTo(S(37), Y(0)); context.fill();
  }
  // the far gate: a stone arch opening onto the moonlit road beyond
  const gx = GUARD.gateX;
  if (gx + 60 > u0 && gx - 60 < u1) {
    context.fillStyle = '#3a3538'; context.fillRect(S(gx - 34), Y(96), S(68), Y(0) - Y(96));
    const road = context.createLinearGradient(0, Y(60), 0, Y(0));
    road.addColorStop(0, '#2c3458'); road.addColorStop(1, '#5a6080');
    context.fillStyle = road;
    context.beginPath(); context.moveTo(S(gx - 18), Y(0)); context.lineTo(S(gx - 18), Y(42)); context.arc(S(gx), Y(42), S(18), Math.PI, 0); context.lineTo(S(gx + 18), Y(0)); context.fill();
    context.strokeStyle = '#1e1a1c'; context.lineWidth = S(1.6);
    context.beginPath(); context.arc(S(gx), Y(42), S(19), Math.PI, 0); context.stroke();
    context.fillStyle = '#16141c';
    for (const tx of [-12, -4, 6, 13]) { context.beginPath(); context.ellipse(S(gx + tx), Y(14 + hash(tx + 40) * 10), S(3), S(10), 0, 0, Math.PI * 2); context.fill(); }
  }
}

export class GuardRenderer {
  private sky: HTMLCanvasElement | null = null;
  private skyKey = '';
  private far = new LayerCache(paintFar, 0.22);
  private yard = new LayerCache(paintYard, 1);
  private dark = document.createElement('canvas');
  private particles: Particle[] = [];
  private trail: [number, number][] = [];
  private lastTime = 0;
  private lastKabir: number | null = null;
  private lastGuard: number | null = null;
  private lampSmoke = 0;
  camX = 0;

  view(width: number, height: number): View {
    const scale = Math.min(height / GUARD_VIEW_UNITS, width / MIN_WIDTH_UNITS);
    return { camX: this.camX, scale, width, height, ground: height - (FLOOR_DEPTH + D) * scale };
  }

  snap(game: GuardSteps, width: number, height: number) { this.camX = this.cameraTarget(game, this.view(width, height)); }

  private cameraTarget(game: GuardSteps, view: View) {
    const visible = view.width / view.scale;
    const x = game.player_x();
    let target = x - visible * (0.42 - 0.08 * game.facing());
    // from the terrace edge to the yard, frame Mira and the lamp together so she can see what she is up against
    if (x > 230 && x < GUARD.exitBottom && !game.kabir_follows()) {
      const between = (x + GUARD.lampX) / 2 - visible / 2;
      target = Math.min(between, x - visible * 0.16);
      target = Math.max(target, x - visible * 0.84);
    }
    return Math.max(0, Math.min(GUARD.stageEnd - visible, target));
  }

  burst(x: number, y: number, count: number, kind: 0 | 1 | 2 = 0) {
    for (let index = 0; index < count; index++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const speed = 20 + Math.random() * 60;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed, life: 0.6 + Math.random() * 0.8, age: 0, size: 0.6 + Math.random() * 1.2, kind });
    }
  }

  /** The lamp was just snuffed: glass chips and a curl of smoke. */
  snuffed() { this.burst(GUARD.lampX, LAMP_ARM_Y - 14, 14, 2); this.lampSmoke = 3; }

  draw(context: CanvasRenderingContext2D, game: GuardSteps, width: number, height: number, ratio: number, now: number, overlay: GuardOverlay) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const time = now / 1000;
    let view = this.view(width, height);
    this.camX += (this.cameraTarget(game, view) - this.camX) * Math.min(1, dt * 4);
    view = this.view(width, height);
    const s = view.scale;
    const lights = readGuardLights(game);
    const visible = (x: number, margin = 60) => x > view.camX - margin && x < view.camX + width / s + margin;

    const skyKey = `${width}:${height}:${ratio}`;
    if (skyKey !== this.skyKey) { this.sky = paintSky(width, height, ratio); this.skyKey = skyKey; this.dark.width = Math.ceil(width / 2); this.dark.height = Math.ceil(height / 2); }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(this.sky!, 0, 0);
    this.far.draw(context, { ...view, ground: view.ground - 30 * s }, ratio);
    this.yard.draw(context, view, ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    // --- props: torches, the hanging lamp on its post, stone pile, barrels
    for (const light of lights) {
      if (!visible(light.x, 80)) continue;
      if (light.kind === KIND_HANGING_LAMP) this.drawLampPost(context, view, light, time);
      else drawTorch(context, view, light, light.lit ? light.intensity : 0, time, light.x * 0.01);
    }
    if (visible(GUARD.stonePileX)) this.drawStonePile(context, view, game.stones());

    // --- rats (back half) — they only come out of the drain once the lamp has been dark a while
    const rats = ratView(game);
    const ratCount = game.rat_count();
    const lightAt = (x: number) => game.light_at(x);
    const floorAt = (x: number) => toScreenY(view, game.ground_at(x));
    drawRatSwarm(context, view, rats, ratCount, time, false, lightAt, floorAt);
    const scorpions = scorpionView(game);
    const scorpionCount = GUARD.scorpionCount;
    drawScorpions(context, view, scorpions, scorpionCount, time, false, lightAt, floorAt);

    // --- characters
    const state = game.state();
    const isDead = state === STATE.dead;
    const deadT = isDead ? game.state_time() : 0;
    const charY = (y: number) => toScreenY(view, y) + 7 * s;
    const kabirMoving = Math.abs(game.sibling_x() - (this.lastKabir ?? game.sibling_x())) > 0.05;
    this.lastKabir = game.sibling_x();
    const guardMoving = Math.abs(game.guard_x() - (this.lastGuard ?? game.guard_x())) > 0.05;
    this.lastGuard = game.guard_x();
    const playerX = toScreenX(view, game.player_x());
    const kabirX = toScreenX(view, game.sibling_x());
    // rats on him: he stamps and swats
    const beset = game.guard_beset();
    const guardX = toScreenX(view, game.guard_x()) + (beset ? Math.sin(time * 38) * 1.4 * s : 0);
    const hiding = !game.kabir_follows();
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    for (const [x, w, y] of [[playerX, 8, game.player_y()], [kabirX, 6, game.sibling_y()], [guardX, 10, game.guard_y()]] as const) { context.beginPath(); context.ellipse(x, charY(y), w * s, 1.8 * s, 0, 0, Math.PI * 2); context.fill(); }
    const danger = game.danger();
    const fear = Math.min(1, Math.max(game.suspicion(), danger));
    // Kabir crouches behind the barrels until the yard is lit and safe
    drawKabir(context, { x: kabirX, y: charY(game.sibling_y()) - 0.5 * s + (hiding && !kabirMoving ? 3 * s : 0), s, facing: hiding && !kabirMoving ? 1 : game.sibling_facing(), walked: game.sibling_walked(), moving: kabirMoving, time, fear: hiding ? 0.35 : fear * 0.6, dead: 0 }, null);
    if (visible(GUARD.kabirHideX)) this.drawBarrels(context, view);
    const guardState = game.guard_state();
    const spearTip = drawSoldier(context, { x: guardX, y: charY(game.guard_y()), s, facing: game.guard_facing(), walked: game.guard_walked(), state: guardState, stateTime: game.guard_time(), time, moving: guardMoving, relight: game.relight_progress() });
    const miraHands = drawMira(context, {
      x: playerX, y: charY(game.player_y()), s, facing: game.facing(), walked: game.walked(), moving: state === STATE.walk, time, fear,
      throwing: state === STATE.throw ? game.state_time() : state === MIRA_STRIKE ? game.state_time() * 0.75 : undefined, dead: isDead ? deadT : 0,
    });
    drawRatSwarm(context, view, rats, ratCount, time, true, lightAt, floorAt);
    drawScorpions(context, view, scorpions, scorpionCount, time, true, lightAt, floorAt);
    if (state === MIRA_STRIKE && game.state_time() < 0.35) {
      // the takedown: a hard swing with a stone in her fist
      context.fillStyle = '#8c8a86';
      context.beginPath(); context.arc(miraHands.front[0], miraHands.front[1], 1.8 * s, 0, Math.PI * 2); context.fill();
    }
    if (guardState === GUARD_STATE.spear && game.guard_time() > 0.25 && game.guard_time() < 0.5) {
      context.fillStyle = 'rgba(255, 240, 220, 0.9)';
      context.beginPath(); context.arc(spearTip[0], spearTip[1], 2.4 * s, 0, Math.PI * 2); context.fill();
    }

    // --- stone or ember in flight
    if (game.missile_active()) {
      const mx = toScreenX(view, game.missile_x());
      const my = toScreenY(view, game.missile_y()) + 7 * s;
      const stone = game.missile_item() === ITEM.stone;
      this.trail.push([mx + view.camX * s, my]);
      if (this.trail.length > 12) this.trail.shift();
      this.trail.forEach(([tx, ty], index) => {
        context.fillStyle = stone ? `rgba(200, 200, 210, ${index / this.trail.length * 0.35})` : `rgba(255, ${140 + index * 6}, 60, ${index / this.trail.length * 0.8})`;
        context.beginPath(); context.arc(tx - view.camX * s, ty, (0.5 + index * 0.1) * s, 0, Math.PI * 2); context.fill();
      });
      if (stone) { context.fillStyle = '#9a9894'; context.beginPath(); context.ellipse(mx, my, 2 * s, 1.6 * s, time * 9, 0, Math.PI * 2); context.fill(); }
      else drawFlame(context, mx, my + 2 * s, 7 * s, time * 2, 5, 1);
    } else this.trail.length = 0;

    // --- light pass
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = '#ffd6aa';
    context.fillRect(0, 0, width, height);
    context.restore();
    this.drawDarkness(context, view, lights, game, ratio, charY);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawRatSwarm(context, view, rats, ratCount, time, false, lightAt, floorAt, true);
    drawRatSwarm(context, view, rats, ratCount, time, true, lightAt, floorAt, true);
    drawScorpions(context, view, scorpions, scorpionCount, time, false, lightAt, floorAt, true);
    drawScorpions(context, view, scorpions, scorpionCount, time, true, lightAt, floorAt, true);
    this.drawGlows(context, view, lights, time);
    // a dark lamp still catches the moonlight, so Mira can see her target
    const lamp = lights.find(light => light.kind === KIND_HANGING_LAMP);
    if (lamp && !lamp.lit && visible(lamp.x, 80)) { context.save(); context.globalAlpha = 0.55; this.drawLampPost(context, view, lamp, time); context.restore(); }
    this.stepParticles(context, view, lights, dt, time);
    drawRatEyes(context, view, rats, ratCount, time, lightAt, floorAt);
    drawScorpionGlints(context, view, scorpions, scorpionCount, time, lightAt, floorAt);
    this.drawDrainEyes(context, view, game, time);
    // the soldier's eye stays readable in the dark; the suspicion meter rides above his cap
    drawSuspicion(context, guardX, charY(game.guard_y()) - 60 * s, s, game.suspicion(), guardState, game.relight_progress(), time);
    if (!isDead && !game.kabir_follows()) this.drawEdgeMarkers(context, view, game, lamp, time);
    if (game.throw_target() && !isDead) this.drawAim(context, view, game, lights[1], time, game.item() === ITEM.stone);
    if (fear > 0.25 && !isDead) {
      const pulse = 0.5 + 0.5 * Math.sin(time * (8 + fear * 10));
      const red = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.75);
      red.addColorStop(0, 'rgba(120, 0, 0, 0)'); red.addColorStop(1, `rgba(150, 0, 10, ${(fear - 0.25) * (0.5 + 0.25 * pulse)})`);
      context.fillStyle = red; context.fillRect(0, 0, width, height);
    }
    const vignette = context.createRadialGradient(width / 2, height * 0.55, Math.min(width, height) * 0.3, width / 2, height * 0.55, Math.max(width, height) * 0.78);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)'); vignette.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
    context.fillStyle = vignette; context.fillRect(0, 0, width, height);
    if (isDead) {
      if (deadT < 0.25) { context.fillStyle = `rgba(200, 20, 20, ${0.35 * (1 - deadT / 0.25)})`; context.fillRect(0, 0, width, height); }
      context.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, Math.max(0, deadT - 0.8) * 0.8)})`; context.fillRect(0, 0, width, height);
    }
    if (overlay.prompt && !isDead) this.drawPrompt(context, s, playerX, charY(game.player_y()) - 56 * s, GUARD_PROMPT_TEXT[overlay.prompt], overlay.touch, overlay.prompt === GUARD_PROMPT.strike);
  }

  /** Eyes stirring under the grate as the dark drags on: the rats are about to come up. */
  private drawDrainEyes(context: CanvasRenderingContext2D, view: View, game: GuardSteps, time: number) {
    const dark = game.dark_time();
    if (game.lamp_lit() || dark < GUARD.drainDelay - 2.5) return;
    const s = view.scale;
    const x0 = toScreenX(view, GUARD.drainX - 9);
    if (x0 < -30 || x0 > view.width + 30) return;
    const y = toScreenY(view, -D) + 5 * s;
    const count = dark >= GUARD.drainDelay ? 5 : Math.ceil((dark - (GUARD.drainDelay - 2.5)) * 2);
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let index = 0; index < count; index++) {
      if ((time * 0.9 + hash(index * 11)) % 1 < 0.12) continue;
      const ex = x0 + (2 + hash(index * 5 + 1) * 14) * s;
      const ey = y + (hash(index * 3 + 2) - 0.5) * 2 * s;
      context.fillStyle = 'rgba(255, 80, 40, 0.8)';
      for (const dx of [0, 1.6]) { context.beginPath(); context.arc(ex + dx * s, ey, 0.5 * s, 0, Math.PI * 2); context.fill(); }
    }
    context.restore();
  }

  /** Off-screen pointers on narrow (portrait) screens: where the lamp hangs, and the soldier's eye when he is wary. */
  private drawEdgeMarkers(context: CanvasRenderingContext2D, view: View, game: GuardSteps, lamp: Light | undefined, time: number) {
    const marker = (worldX: number, worldY: number, draw: (x: number, y: number) => void) => {
      const x = toScreenX(view, worldX);
      if (x >= 0 && x <= view.width) return;
      const side = x < 0 ? -1 : 1;
      const edgeX = side < 0 ? 16 : view.width - 16;
      const y = Math.max(70, Math.min(view.height - 40, toScreenY(view, worldY)));
      context.fillStyle = 'rgba(10, 10, 20, 0.7)';
      context.beginPath(); context.arc(edgeX, y, 12, 0, Math.PI * 2); context.fill();
      context.fillStyle = 'rgba(255, 220, 170, 0.85)';
      context.beginPath(); context.moveTo(edgeX + side * 15, y); context.lineTo(edgeX + side * 9, y - 5); context.lineTo(edgeX + side * 9, y + 5); context.closePath(); context.fill();
      draw(edgeX, y);
    };
    if (lamp) marker(lamp.x, lamp.height, (x, y) => drawLantern(context, x, y + 5, 1.1, lamp.lit, lamp.lit ? 1 : 0, time));
    const suspicion = game.suspicion();
    if (suspicion > 0.05) marker(game.guard_x(), game.guard_y() + 10, (x, y) => {
      context.strokeStyle = `rgb(255, ${Math.round(210 - suspicion * 180)}, 60)`; context.lineWidth = 2;
      context.beginPath(); context.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + suspicion * Math.PI * 2); context.stroke();
      context.fillStyle = '#ffd060'; context.beginPath(); context.ellipse(x, y, 4, 2.6, 0, 0, Math.PI * 2); context.fill();
    });
  }

  private drawLampPost(context: CanvasRenderingContext2D, view: View, light: Light, time: number) {
    const s = view.scale;
    const postX = toScreenX(view, light.x - 14);
    const lampX = toScreenX(view, light.x);
    const foot = toScreenY(view, -D);
    const top = toScreenY(view, LAMP_ARM_Y + 6);
    context.strokeStyle = '#26222a'; context.lineCap = 'butt';
    context.lineWidth = 3 * s;
    context.beginPath(); context.moveTo(postX, foot); context.lineTo(postX, top); context.lineTo(lampX + 2 * s, top); context.stroke();
    context.lineWidth = 1.4 * s;
    context.beginPath(); context.moveTo(postX, top + 8 * s); context.lineTo(postX + 8 * s, top); context.stroke();
    context.fillStyle = '#2a262c'; context.fillRect(postX - 4 * s, foot - 3 * s, 8 * s, 3 * s);
    // the lamp hangs on a short chain; it swings a little after a hit
    const swing = Math.sin(time * 1.3) * 0.6 * s + (this.lampSmoke > 0 ? Math.sin(time * 9) * this.lampSmoke * 0.8 * s : 0);
    context.strokeStyle = '#3a363e'; context.lineWidth = 0.8 * s;
    context.beginPath(); context.moveTo(lampX, top); context.lineTo(lampX + swing, toScreenY(view, light.height) - 12 * s); context.stroke();
    drawLantern(context, lampX + swing, toScreenY(view, light.height) + 3 * s, s * 1.15, light.lit, light.lit ? light.intensity : 0, time);
    if (!light.lit && this.lampSmoke > 0) {
      for (let puff = 0; puff < 3; puff++) {
        const t = ((time * 0.6 + puff / 3) % 1);
        context.fillStyle = `rgba(150, 145, 160, ${0.18 * (1 - t) * Math.min(1, this.lampSmoke)})`;
        context.beginPath(); context.arc(lampX + Math.sin(t * 5 + puff) * 3 * s, toScreenY(view, light.height) - (4 + t * 22) * s, (2 + t * 5) * s, 0, Math.PI * 2); context.fill();
      }
    }
  }

  private drawStonePile(context: CanvasRenderingContext2D, view: View, stones: number) {
    const s = view.scale;
    const x = toScreenX(view, GUARD.stonePileX);
    const y = toScreenY(view, 0) + 6 * s;
    const pile: [number, number, number][] = [[-6, 0, 3.4], [0, 0, 3.8], [6, 0, 3.2], [-3, -4, 3], [3, -4, 3.1], [0, -7.5, 2.6]];
    pile.forEach(([dx, dy, r], index) => {
      context.fillStyle = index % 2 ? '#6f6b66' : '#85807a';
      context.beginPath(); context.ellipse(x + dx * s, y + dy * s, r * s, r * 0.8 * s, index, 0, Math.PI * 2); context.fill();
    });
    if (stones < GUARD.maxStones) {
      context.fillStyle = 'rgba(255, 230, 170, 0.3)';
      context.beginPath(); context.arc(x, y - 4 * s, 11 * s, 0, Math.PI * 2); context.fill();
    }
  }

  private drawBarrels(context: CanvasRenderingContext2D, view: View) {
    const s = view.scale;
    for (const [bx, h] of [[GUARD.kabirHideX + 2, 20], [GUARD.kabirHideX + 17, 24]] as const) {
      const x = toScreenX(view, bx);
      const ground = toScreenY(view, 0) + 7 * s;
      const body = context.createLinearGradient(x - 8 * s, 0, x + 8 * s, 0);
      body.addColorStop(0, '#3d2616'); body.addColorStop(0.5, '#7a5132'); body.addColorStop(1, '#3a2414');
      context.fillStyle = body;
      context.beginPath(); context.roundRect(x - 8 * s, ground - h * s, 16 * s, h * s, 4 * s); context.fill();
      context.strokeStyle = '#2a2a2e'; context.lineWidth = 1.5 * s;
      context.beginPath(); context.moveTo(x - 8 * s, ground - 5 * s); context.lineTo(x + 8 * s, ground - 5 * s); context.moveTo(x - 8 * s, ground - (h - 5) * s); context.lineTo(x + 8 * s, ground - (h - 5) * s); context.stroke();
    }
  }

  private drawDarkness(context: CanvasRenderingContext2D, view: View, lights: Light[], game: GuardSteps, ratio: number, charY: (y: number) => number) {
    const dark = this.dark.getContext('2d')!;
    dark.setTransform(0.5, 0, 0, 0.5, 0, 0);
    dark.globalCompositeOperation = 'source-over';
    dark.clearRect(0, 0, view.width, view.height);
    const shade = dark.createLinearGradient(0, 0, 0, view.height);
    shade.addColorStop(0, 'rgba(5, 6, 20, 0.5)');
    shade.addColorStop(0.4, 'rgba(4, 5, 16, 0.76)');
    shade.addColorStop(1, 'rgba(2, 2, 8, 0.86)');
    dark.fillStyle = shade;
    dark.fillRect(0, 0, view.width, view.height);
    dark.globalCompositeOperation = 'destination-out';
    const s = view.scale;
    const time = performance.now() / 1000;
    lights.forEach((light, index) => {
      if (!light.lit || light.intensity <= 0.01) return;
      const x = toScreenX(view, light.x);
      const y = toScreenY(view, light.height);
      const flicker = 1 + Math.sin(time * 9 + index) * 0.025 + Math.sin(time * 23 + index * 3) * 0.015;
      const radius = light.radius * s * 1.05 * flicker;
      if (x + radius < 0 || x - radius > view.width) return;
      const hole = dark.createRadialGradient(x, y, 0, x, y, radius);
      hole.addColorStop(0, `rgba(0, 0, 0, ${light.intensity})`);
      hole.addColorStop(0.18, `rgba(0, 0, 0, ${0.94 * light.intensity})`);
      hole.addColorStop(0.5, `rgba(0, 0, 0, ${0.62 * light.intensity})`);
      hole.addColorStop(0.8, `rgba(0, 0, 0, ${0.22 * light.intensity})`);
      hole.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dark.fillStyle = hole;
      dark.beginPath(); dark.ellipse(x, y, radius, radius * 0.92, 0, 0, Math.PI * 2); dark.fill();
    });
    // faint rims so nobody vanishes completely (the soldier's a touch dimmer: he is the threat in the dark)
    for (const [wx, wy, strength] of [[game.player_x(), game.player_y(), 0.45], [game.sibling_x(), game.sibling_y(), 0.4], [game.guard_x(), game.guard_y(), 0.3]] as const) {
      const x = toScreenX(view, wx);
      const y = charY(wy) - 16 * s;
      const rim = dark.createRadialGradient(x, y, 0, x, y, 28 * s);
      rim.addColorStop(0, `rgba(0, 0, 0, ${strength})`); rim.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dark.fillStyle = rim;
      dark.fillRect(x - 28 * s, y - 28 * s, 56 * s, 56 * s);
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(this.dark, 0, 0, this.dark.width, this.dark.height, 0, 0, view.width * ratio, view.height * ratio);
  }

  private drawGlows(context: CanvasRenderingContext2D, view: View, lights: Light[], time: number) {
    const s = view.scale;
    context.save();
    context.globalCompositeOperation = 'lighter';
    lights.forEach((light, index) => {
      if (!light.lit || light.intensity <= 0.01) return;
      const x = toScreenX(view, light.x);
      const y = toScreenY(view, light.height);
      if (x < -light.radius * s || x > view.width + light.radius * s) return;
      const flicker = 0.9 + 0.1 * Math.sin(time * 11 + index * 1.7);
      const halo = context.createRadialGradient(x, y, 0, x, y, light.radius * s * 0.75);
      halo.addColorStop(0, `rgba(255, 150, 60, ${0.3 * light.intensity * flicker})`);
      halo.addColorStop(0.4, `rgba(255, 150, 60, ${0.11 * light.intensity * flicker})`);
      halo.addColorStop(1, 'rgba(255, 150, 60, 0)');
      context.fillStyle = halo;
      context.fillRect(x - light.radius * s, y - light.radius * s, light.radius * 2 * s, light.radius * 2 * s);
      // the hanging lamp throws a cone down onto the soldier's beat
      if (light.kind === KIND_HANGING_LAMP) {
        const cone = context.createLinearGradient(x, y, x, toScreenY(view, -D));
        cone.addColorStop(0, `rgba(255, 200, 120, ${0.12 * flicker})`); cone.addColorStop(1, 'rgba(255, 200, 120, 0)');
        context.fillStyle = cone;
        context.beginPath(); context.moveTo(x - 4 * s, y); context.lineTo(x + 4 * s, y); context.lineTo(x + 120 * s, toScreenY(view, -D) + 6 * s); context.lineTo(x - 120 * s, toScreenY(view, -D) + 6 * s); context.closePath(); context.fill();
      }
      const core = context.createRadialGradient(x, y - 4 * s, 0, x, y - 4 * s, 14 * s);
      core.addColorStop(0, `rgba(255, 230, 170, ${0.55 * light.intensity})`); core.addColorStop(1, 'rgba(255, 180, 90, 0)');
      context.fillStyle = core;
      context.fillRect(x - 14 * s, y - 18 * s, 28 * s, 28 * s);
    });
    context.restore();
  }

  private stepParticles(context: CanvasRenderingContext2D, view: View, lights: Light[], dt: number, time: number) {
    this.lampSmoke = Math.max(0, this.lampSmoke - dt * 0.6);
    for (const light of lights) {
      if (!light.lit || light.x < view.camX - 100 || light.x > view.camX + view.width / view.scale + 100) continue;
      if (Math.random() < (light.kind === KIND_HANGING_LAMP ? 1 : 3.5) * dt) this.particles.push({ x: light.x + (Math.random() - 0.5) * 6, y: light.height + 8, vx: (Math.random() - 0.5) * 10, vy: 18 + Math.random() * 22, life: 1.2 + Math.random() * 1.4, age: 0, size: 0.5 + Math.random() * 0.9, kind: 0 });
    }
    if (this.particles.length > 300) this.particles.splice(0, this.particles.length - 300);
    const s = view.scale;
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      particle.age += dt;
      if (particle.age >= particle.life) { this.particles.splice(index, 1); continue; }
      particle.x += (particle.vx + Math.sin(time * 2 + index) * 6) * dt;
      particle.y += particle.vy * dt;
      if (particle.kind === 2) particle.vy -= 120 * dt;
      const t = particle.age / particle.life;
      const flick = 0.6 + 0.4 * Math.sin(time * 30 + index);
      context.fillStyle = particle.kind === 2 ? `rgba(200, 200, 215, ${0.6 * (1 - t)})` : `rgba(255, ${150 + Math.floor(80 * (1 - t))}, 60, ${(1 - t) * flick})`;
      context.beginPath(); context.arc(toScreenX(view, particle.x), toScreenY(view, particle.y), particle.size * s * (1 - t * 0.5), 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }

  private drawAim(context: CanvasRenderingContext2D, view: View, game: GuardSteps, lamp: Light, time: number, stone: boolean) {
    const s = view.scale;
    const x0 = toScreenX(view, game.player_x());
    const y0 = toScreenY(view, game.player_y()) - 24 * s;
    const x1 = toScreenX(view, lamp.x);
    const y1 = toScreenY(view, lamp.height);
    const colour = stone ? '200, 210, 230' : '255, 180, 90';
    context.save();
    context.setLineDash([3 * s, 4 * s]);
    context.lineDashOffset = -time * 20;
    context.strokeStyle = `rgba(${colour}, 0.5)`;
    context.lineWidth = 1.2 * s;
    context.beginPath(); context.moveTo(x0, y0); context.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 50 * s, x1, y1); context.stroke();
    context.setLineDash([]);
    context.strokeStyle = `rgba(${colour}, ${0.55 + 0.3 * Math.sin(time * 6)})`;
    context.beginPath(); context.arc(x1, y1, (9 + Math.sin(time * 6) * 1.5) * s, 0, Math.PI * 2); context.stroke();
    context.restore();
  }

  private drawPrompt(context: CanvasRenderingContext2D, s: number, x: number, y: number, text: string, touch: boolean, urgent: boolean) {
    const label = `${touch ? '✋' : 'E'}  ${text}`;
    context.font = `700 ${Math.round(Math.max(11, 5.4 * s))}px system-ui, sans-serif`;
    const width = context.measureText(label).width + 16;
    const height = Math.max(20, 9 * s);
    context.fillStyle = urgent ? 'rgba(60, 8, 8, 0.88)' : 'rgba(10, 12, 24, 0.82)';
    context.strokeStyle = urgent ? 'rgba(255, 120, 100, 0.85)' : 'rgba(255, 200, 120, 0.7)';
    context.lineWidth = 1.2;
    context.beginPath(); context.roundRect(x - width / 2, y - height, width, height, height / 2); context.fill(); context.stroke();
    context.fillStyle = '#ffe2b0';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(label, x, y - height / 2 + 1);
    context.textAlign = 'start'; context.textBaseline = 'alphabetic';
  }
}

/**
 * Stage two's scorpions: chunky, kid-friendly silhouettes — a rounded amber body, two big pincers held out front and
 * a segmented tail curled up over the back with a stinger — so they read clearly next to the rats, even small on a
 * phone. Same lanes as the rats (back / front half); `moonlit` draws their faint shapes over the darkness.
 */
function drawScorpions(context: CanvasRenderingContext2D, view: View, list: Float32Array, count: number, time: number, front: boolean, lightAt: (x: number) => number, groundAt: (x: number) => number, moonlit = false) {
  const s = view.scale;
  context.save();
  for (let index = 0; index < count; index++) {
    const base = index * RAT_STRIDE;
    if (list[base + 3] < 0.5) continue;
    const lane = list[base + 2];
    if ((lane >= 0.5) !== front) continue;
    const wx = list[base];
    const x = toScreenX(view, wx);
    if (x < -24 || x > view.width + 24) continue;
    if (moonlit) { const shade = 1 - lightAt(wx); if (shade < 0.05) continue; context.globalAlpha = 0.6 * shade; } else context.globalAlpha = 1;
    const vx = list[base + 1];
    const phase = list[base + 5];
    const moving = Math.abs(vx) > 12;
    const y = groundAt(wx) + (1.5 + lane * 20) * s;
    const dir = vx >= 0 ? 1 : -1;
    const size = (1.0 + hash(index * 3 + 7) * 0.3) * s;
    const body = moonlit ? '#3a3a58' : index % 2 ? '#a5552a' : '#8c4520';
    const dark = moonlit ? '#24243a' : '#5a2a12';
    context.save();
    context.translate(x, y);
    context.scale(dir, 1);
    // eight little legs, scuttling
    context.strokeStyle = dark; context.lineWidth = 0.8 * size; context.lineCap = 'round';
    context.beginPath();
    for (let leg = 0; leg < 4; leg++) {
      const lx = (-2.6 + leg * 1.8) * size;
      const swing = (moving ? Math.sin(phase * 2.4 + leg * 1.6) : 0.3) * 1.3 * size;
      context.moveTo(lx, -1.6 * size); context.lineTo(lx - 1.2 * size + swing, -0.8 * size); context.lineTo(lx - 1.6 * size + swing, 0);
    }
    context.stroke();
    // tail: five beads arching up and forward over the back, ending in a stinger
    const curl = Math.sin(time * 3 + index) * 0.12 + (moving ? 0 : 0.1);
    let tx = -4 * size; let ty = -2.2 * size;
    context.fillStyle = body;
    for (let seg = 0; seg < 5; seg++) {
      const angle = Math.PI * (0.95 - seg * 0.24 - curl);
      tx += Math.cos(angle) * 2.1 * size; ty -= Math.sin(angle) * 2.1 * size;
      context.beginPath(); context.arc(tx, ty, (1.4 - seg * 0.12) * size, 0, Math.PI * 2); context.fill();
    }
    context.fillStyle = moonlit ? '#5a5a80' : '#f0c040';
    context.beginPath(); context.moveTo(tx + 0.8 * size, ty - 0.4 * size); context.lineTo(tx + 2.6 * size, ty + 1.2 * size); context.lineTo(tx + 0.4 * size, ty + 0.9 * size); context.closePath(); context.fill();
    // body: a rounded plated oval
    context.fillStyle = body;
    context.beginPath(); context.ellipse(0, -2.2 * size, 4.4 * size, 2 * size, 0, 0, Math.PI * 2); context.fill();
    context.strokeStyle = dark; context.lineWidth = 0.5 * size;
    context.beginPath(); for (const px of [-2, 0, 2]) { context.moveTo(px * size, -3.9 * size); context.lineTo(px * size, -0.6 * size); } context.stroke();
    // pincers: arm out front, a snapping claw
    const snap = moving ? 0.25 + 0.25 * Math.sin(phase * 3) : 0.35 + 0.2 * Math.sin(time * 5 + index);
    context.strokeStyle = body; context.lineWidth = 1 * size;
    context.beginPath(); context.moveTo(3.4 * size, -2.4 * size); context.lineTo(5.6 * size, -3.4 * size); context.stroke();
    context.fillStyle = body;
    context.save(); context.translate(6.4 * size, -3.6 * size);
    context.beginPath(); context.ellipse(0, 0, 1.6 * size, 1.1 * size, 0, 0, Math.PI * 2); context.fill();
    context.rotate(-snap); context.beginPath(); context.ellipse(1.6 * size, -0.4 * size, 1.4 * size, 0.6 * size, 0, 0, Math.PI * 2); context.fill();
    context.rotate(snap * 2); context.beginPath(); context.ellipse(1.6 * size, 0.4 * size, 1.4 * size, 0.6 * size, 0, 0, Math.PI * 2); context.fill();
    context.restore();
    // a soft highlight so the shape pops on the dark flagstones
    context.fillStyle = moonlit ? 'rgba(180, 190, 255, 0.12)' : 'rgba(255, 210, 150, 0.22)';
    context.beginPath(); context.ellipse(-0.6 * size, -3.3 * size, 3 * size, 0.6 * size, 0, 0, Math.PI * 2); context.fill();
    context.restore();
  }
  context.restore();
}

/** Two tiny green-white eye glints per scorpion in the dark (rats' are red), so you can tell them apart. */
function drawScorpionGlints(context: CanvasRenderingContext2D, view: View, list: Float32Array, count: number, time: number, lightAt: (x: number) => number, groundAt: (x: number) => number) {
  const s = view.scale;
  context.save();
  context.globalCompositeOperation = 'lighter';
  for (let index = 0; index < count; index++) {
    const base = index * RAT_STRIDE;
    if (list[base + 3] < 0.5) continue;
    const wx = list[base];
    const x = toScreenX(view, wx);
    if (x < -10 || x > view.width + 10) continue;
    if ((time * 0.6 + hash(index * 13)) % 1 < 0.05) continue;
    const near = Math.max(0.2, Math.min(1, 1 - lightAt(wx) * 0.7));
    const dir = list[base + 1] >= 0 ? 1 : -1;
    const size = (1.0 + hash(index * 3 + 7) * 0.3) * s;
    const y = groundAt(wx) + (1.5 + list[base + 2] * 20) * s - 3.6 * size;
    context.fillStyle = `rgba(170, 255, 190, ${0.7 * near})`;
    for (const dx of [2.6, 3.6]) { context.beginPath(); context.arc(x + dir * dx * size, y, 0.45 * size, 0, Math.PI * 2); context.fill(); }
  }
  context.restore();
}
