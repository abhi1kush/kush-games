/**
 * Ghat Climb frame: sky and five mountain ranges at their own depths, the dirt road, coins and jerry cans,
 * the jeep, then shrubs passing in front. The road height comes from the same wasm function the wheels stand on.
 */
import { AXLE, COURSE_END, engineMood, FINISH_X, FRONT, type GhatClimb, PHASE, readPickups, REAR, ROOF, WHEEL_R } from './engine';

import { drawBackdrop, drawForeground, type View } from './scenery';

const VIEW_UNITS = 210;
const toX = (view: View, x: number) => (x - view.camX) * view.scale;
const toY = (view: View, y: number) => view.height / 2 - (y - view.camY) * view.scale;

interface Dust { x: number; y: number; life: number; age: number; size: number }
interface Smoke { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; dark: number }

/** Drawn tyre, a little smaller than the physics wheel; its centre drops so the tread still meets the road. */
const TYRE_R = WHEEL_R - 1;
const TYRE_DROP = WHEEL_R - TYRE_R;

/** Tail pipe, in body space. */
const PIPE_ALONG = -28.4;
const PIPE_UP = AXLE + 2.6;

export class Renderer {
  private dust: Dust[] = [];
  private smoke: Smoke[] = [];
  private last = 0;
  private camY: number | null = null;

  draw(context: CanvasRenderingContext2D, game: GhatClimb, width: number, height: number, ratio: number, now: number, gasHeld = false) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const scale = Math.min(height / VIEW_UNITS, width / 300);
    const visible = width / scale;
    const camX = Math.max(0, Math.min(COURSE_END - visible, game.x() - visible * 0.36));
    const view: View = { scale, camX, camY: this.frame(game, camX, visible, height / scale, dt), width, height };
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawBackdrop(context, width, height, ratio);
    this.road(context, view, game);
    this.flag(context, view, game);
    this.pickups(context, view, game);
    const { mood, effort } = game.phase() === PHASE.driving ? engineMood(gasHeld, game.fuel(), game.strain(), game.contact()) : { mood: 'idle', effort: 0 };
    this.smokeStep(context, view, game, dt, mood === 'idle' || mood === 'empty' ? -1 : effort);
    this.jeep(context, view, game, mood === 'straining' || mood === 'too steep' ? effort : 0, now);
    this.dustStep(context, view, game, dt);
    drawForeground(context, view);
    this.vignette(context, view);
  }

  /**
   * Vertical camera. It drifts slowly toward the average height of the road on screen, so hills roll past
   * without the ground bobbing; it only chases the jeep hard when a tall peak or a deep dip would take the
   * jeep off the top or bottom of the frame.
   */
  private frame(game: GhatClimb, camX: number, wide: number, tall: number, dt: number) {
    let sum = 0;
    for (let sample = 0; sample <= 8; sample++) sum += game.height_at(camX + wide * sample / 8);
    const target = sum / 9 + tall * 0.2;
    const y = game.y();
    if (this.camY === null || Math.abs(y - this.camY) > tall) this.camY = target;
    this.camY += (target - this.camY) * Math.min(1, dt * 0.7);
    // keep room for the roof above and the wheels below; past that the camera moves with the jeep
    const above = tall * 0.5 - 38;
    const below = tall * 0.5 - 30;
    if (y - this.camY > above) this.camY = y - above;
    else if (this.camY - y > below) this.camY = y + below;
    return this.camY;
  }

  private vignette(context: CanvasRenderingContext2D, view: View) {
    const { width, height } = view;
    const edge = context.createRadialGradient(width / 2, height * 0.55, Math.min(width, height) * 0.45, width / 2, height * 0.55, Math.max(width, height) * 0.75);
    edge.addColorStop(0, 'rgba(20, 16, 10, 0)');
    edge.addColorStop(1, 'rgba(60, 40, 20, 0.14)');
    context.fillStyle = edge;
    context.fillRect(0, 0, width, height);
  }

  private road(context: CanvasRenderingContext2D, view: View, game: GhatClimb) {
    const s = view.scale;
    const step = 6;
    const left = Math.floor((view.camX - 12) / step) * step;
    const right = view.camX + view.width / s + 12;
    const xs: number[] = [];
    const hs: number[] = [];
    for (let x = left; x <= right; x += step) { xs.push(x); hs.push(game.height_at(x)); }
    const trace = (lift: number, wobble = 0) => {
      xs.forEach((x, index) => {
        const y = hs[index] + lift + (wobble ? Math.sin(x * 0.045 + lift) * wobble + Math.sin(x * 0.013) * wobble * 1.6 : 0);
        if (index === 0) context.moveTo(toX(view, x), toY(view, y)); else context.lineTo(toX(view, x), toY(view, y));
      });
    };
    const top = Math.min(...hs.map(h => toY(view, h)));

    // the cut hillside: warm topsoil fading into dark rock
    context.beginPath();
    trace(0);
    context.lineTo(toX(view, right), view.height + 20);
    context.lineTo(toX(view, left), view.height + 20);
    context.closePath();
    const earth = context.createLinearGradient(0, top, 0, view.height);
    earth.addColorStop(0, '#a86a3e');
    earth.addColorStop(0.4, '#874f2e');
    earth.addColorStop(1, '#55311d');
    context.fillStyle = earth;
    context.fill();

    // rock strata following the road down into the hill
    context.lineCap = 'round';
    for (const [lift, wobble, alpha, widthPx] of [[-11, 1.5, 0.22, 3], [-24, 2.5, 0.2, 5], [-42, 4, 0.18, 8], [-66, 5, 0.16, 12]] as const) {
      context.beginPath();
      trace(lift, wobble);
      context.strokeStyle = `rgba(50, 26, 12, ${alpha})`;
      context.lineWidth = widthPx * s * 0.35;
      context.stroke();
    }

    // stones set in the earth
    context.fillStyle = 'rgba(60, 32, 16, 0.35)';
    context.beginPath();
    xs.forEach((x, index) => {
      const chance = noise(x);
      if (chance < 0.45) return;
      const depth = 3 + noise(x + 11) * 30;
      const r = (0.8 + noise(x + 7) * 2.2) * s;
      context.moveTo(toX(view, x) + r, toY(view, hs[index] - depth));
      context.ellipse(toX(view, x), toY(view, hs[index] - depth), r, r * 0.65, 0, 0, Math.PI * 2);
    });
    context.fill();

    // packed tyre track and its edge
    context.beginPath();
    trace(0);
    context.strokeStyle = '#4a2a16';
    context.lineWidth = 3.2;
    context.stroke();
    context.beginPath();
    trace(-1.2);
    context.strokeStyle = 'rgba(232, 180, 120, 0.7)';
    context.lineWidth = 1.6;
    context.stroke();

    // dry grass verge and tufts behind the track
    context.beginPath();
    trace(1.6);
    context.strokeStyle = 'rgba(150, 128, 70, 0.75)';
    context.lineWidth = 3;
    context.stroke();
    context.strokeStyle = 'rgba(120, 104, 58, 0.9)';
    context.lineWidth = 1.1;
    context.beginPath();
    xs.forEach((x, index) => {
      if (noise(x + 3) < 0.4) return;
      const base = toY(view, hs[index] + 1.5);
      const px = toX(view, x + noise(x + 5) * step);
      const tall = (2 + noise(x + 8) * 3.5) * s;
      context.moveTo(px - tall * 0.3, base);
      context.lineTo(px - tall * 0.15, base - tall);
      context.moveTo(px, base);
      context.lineTo(px + tall * 0.1, base - tall * 1.2);
      context.moveTo(px + tall * 0.3, base);
      context.lineTo(px + tall * 0.4, base - tall * 0.8);
    });
    context.stroke();
    context.lineCap = 'butt';
  }

  private flag(context: CanvasRenderingContext2D, view: View, game: GhatClimb) {
    const x = toX(view, FINISH_X);
    if (x < -40 || x > view.width + 40) return;
    const ground = toY(view, game.height_at(FINISH_X));
    const s = view.scale;
    context.strokeStyle = '#d8d0c6';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, ground);
    context.lineTo(x, ground - 36 * s);
    context.stroke();
    context.fillStyle = '#b0563f';
    context.fillRect(x, ground - 36 * s, 16 * s, 10 * s);
  }

  private pickups(context: CanvasRenderingContext2D, view: View, game: GhatClimb) {
    const s = view.scale;
    for (const pickup of readPickups(game)) {
      if (pickup.taken) continue;
      const x = toX(view, pickup.x);
      if (x < -20 || x > view.width + 20) continue;
      const y = toY(view, pickup.y);
      if (pickup.kind === 2) {
        // an olive army jerry can, lit from the dusk sky above
        const can = context.createLinearGradient(0, y - 8 * s, 0, y + 4 * s);
        can.addColorStop(0, '#858a55');
        can.addColorStop(1, '#4f5331');
        context.fillStyle = can;
        context.strokeStyle = '#2c2e1b';
        context.lineWidth = 1.2;
        context.beginPath();
        context.roundRect(x - 5 * s, y - 8 * s, 10 * s, 12 * s, 1.6 * s);
        context.fill();
        context.stroke();
        context.strokeStyle = 'rgba(40, 42, 24, 0.55)';
        context.lineWidth = 0.9;
        context.beginPath();
        context.moveTo(x - 3 * s, y - 5.5 * s);
        context.lineTo(x + 3 * s, y + 1.5 * s);
        context.moveTo(x + 3 * s, y - 5.5 * s);
        context.lineTo(x - 3 * s, y + 1.5 * s);
        context.stroke();
        context.fillStyle = '#3a3c26';
        context.fillRect(x - 4 * s, y - 10.5 * s, 4.5 * s, 2.5 * s);
        context.fillStyle = '#8f8a78';
        context.fillRect(x + 1.2 * s, y - 10 * s, 2.4 * s, 2 * s);
      } else {
        // old brass rather than bright yellow, so it sits in the evening light
        const coin = context.createRadialGradient(x - 1.6 * s, y - 1.8 * s, 0.5 * s, x, y, 5.4 * s);
        coin.addColorStop(0, '#ecd497');
        coin.addColorStop(0.55, '#c9a45a');
        coin.addColorStop(1, '#94723a');
        context.fillStyle = coin;
        context.strokeStyle = '#5a4222';
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(x, y, 5.2 * s, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.strokeStyle = 'rgba(90, 66, 34, 0.5)';
        context.lineWidth = 0.8;
        context.beginPath();
        context.arc(x, y, 3.4 * s, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  private jeep(context: CanvasRenderingContext2D, view: View, game: GhatClimb, flame: number, now: number) {
    const s = view.scale;
    const crashed = game.phase() === PHASE.crashed;
    const angle = game.angle();
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    // the suspension lets a tyre hang down to the road while the body lifts
    const droop = (along: number) => {
      const wx = game.x() + along * cos - AXLE * sin;
      const wy = game.y() + along * sin + AXLE * cos;
      return Math.max(0, Math.min(game.touch(), wy - game.height_at(wx) - WHEEL_R));
    };
    context.save();
    context.translate(toX(view, game.x()), toY(view, game.y()));
    context.scale(s, -s);
    context.rotate(angle);
    if (crashed) context.globalAlpha = 0.85;
    this.wheel(context, REAR, AXLE - droop(REAR), game.spin());
    this.wheel(context, FRONT, AXLE - droop(FRONT), game.spin());
    this.body(context);
    if (flame > 0) this.flame(context, flame, now);
    context.restore();
  }

  /** A boxy hill 4x4: long bonnet, upright screen, soft top, flared arches, snorkel and a spare on the tail. */
  private body(context: CanvasRenderingContext2D) {
    const bottom = AXLE + 1;
    const hub = AXLE - TYRE_DROP;
    const arch = TYRE_R + 1.6;
    const lip = Math.asin((bottom - hub) / arch);
    const archOver = (centre: number) => {
      for (let i = 0; i <= 12; i++) {
        const a = lip + (Math.PI - 2 * lip) * (i / 12);
        context.lineTo(centre + Math.cos(a) * arch, hub + Math.sin(a) * arch);
      }
    };

    const paint = context.createLinearGradient(0, ROOF, 0, bottom);
    paint.addColorStop(0, '#d06a4a');
    paint.addColorStop(1, '#863526');
    context.fillStyle = paint;
    context.strokeStyle = '#2e130d';
    context.lineWidth = 1.3;
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(-26, bottom);
    context.lineTo(-26, 5);
    context.lineTo(-14, 5.5);
    context.lineTo(-12.5, ROOF);
    context.lineTo(4, ROOF);
    context.lineTo(8.5, 5);
    context.lineTo(22, 4.4);
    context.lineTo(25, 3);
    context.lineTo(25, -2.6);
    context.lineTo(24, bottom);
    archOver(FRONT);
    archOver(REAR);
    context.closePath();
    context.fill();
    context.stroke();
    context.strokeStyle = 'rgba(255, 214, 180, 0.6)';
    context.lineWidth = 0.7;
    context.beginPath();
    context.moveTo(-25.4, 4.6);
    context.lineTo(-14.4, 5.1);
    context.moveTo(9.2, 4.4);
    context.lineTo(21.8, 3.9);
    context.stroke();

    // canvas soft top and the windows under it
    context.fillStyle = '#35312c';
    context.beginPath();
    context.moveTo(-12.9, 9.8);
    context.lineTo(-12.5, ROOF);
    context.lineTo(4, ROOF);
    context.lineTo(5.1, 9.8);
    context.closePath();
    context.fill();
    context.fillStyle = '#9fb3c9';
    context.beginPath();
    context.moveTo(-11.6, 6.4);
    context.lineTo(-11, 9.4);
    context.lineTo(5.3, 9.4);
    context.lineTo(7.4, 6.4);
    context.closePath();
    context.fill();
    context.fillStyle = '#3a2418';
    context.beginPath();
    context.arc(1.2, 8.1, 1.9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#93402f';
    context.fillRect(-3.2, 6.2, 1.3, 3.4);

    // door seam, handle, bonnet line
    context.strokeStyle = 'rgba(56, 22, 14, 0.7)';
    context.lineWidth = 0.6;
    context.beginPath();
    context.moveTo(-2.6, 5.6);
    context.lineTo(-2.6, -2.6);
    context.moveTo(8.6, 4.8);
    context.lineTo(8.6, -1.5);
    context.moveTo(10, 3.6);
    context.lineTo(22.5, 3.2);
    context.stroke();
    context.fillStyle = '#2b2622';
    context.fillRect(-5.4, 3.4, 2, 0.8);

    // black fender flares, side step and bumpers
    context.strokeStyle = '#2b2622';
    context.lineWidth = 2.2;
    context.lineCap = 'round';
    for (const centre of [REAR, FRONT]) {
      context.beginPath();
      context.arc(centre, hub, arch + 0.6, 0.35, Math.PI - 0.35);
      context.stroke();
    }
    context.fillStyle = '#2b2622';
    context.fillRect(-7, bottom - 1, 13.5, 1.3);
    context.fillRect(23.5, -3.6, 4, 2.8);
    context.fillRect(-27.5, -3.6, 3, 2.8);

    // snorkel up the windscreen pillar
    context.lineWidth = 1.3;
    context.beginPath();
    context.moveTo(10.5, 2.5);
    context.lineTo(10.5, 4.8);
    context.lineTo(7.2, 10.6);
    context.stroke();
    context.fillRect(6, 10.2, 2.6, 1.4);

    // spare wheel on the tailgate
    context.fillStyle = '#1f1b18';
    context.beginPath();
    context.arc(-27.2, 2.2, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#8c8a86';
    context.beginPath();
    context.arc(-27.2, 2.2, 1.6, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#fff2c4';
    context.beginPath();
    context.arc(24.2, 1.3, 1.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ff9a3c';
    context.fillRect(-26.4, -1.6, 0.9, 1.6);
    context.fillStyle = '#5c5955';
    context.fillRect(PIPE_ALONG, PIPE_UP - 0.55, 3, 1.1);
  }

  /** Afterburn out of the tail pipe while the engine is fighting the hill. */
  private flame(context: CanvasRenderingContext2D, effort: number, now: number) {
    const flicker = 0.75 + 0.25 * Math.sin(now * 0.06) + 0.15 * Math.sin(now * 0.17);
    const length = (5 + effort * 9) * flicker;
    const half = 1.6 + effort * 1.4;
    const outer = context.createLinearGradient(PIPE_ALONG, 0, PIPE_ALONG - length, 0);
    outer.addColorStop(0, 'rgba(255, 210, 90, 0.95)');
    outer.addColorStop(0.5, 'rgba(255, 110, 30, 0.75)');
    outer.addColorStop(1, 'rgba(255, 60, 20, 0)');
    context.fillStyle = outer;
    context.beginPath();
    context.moveTo(PIPE_ALONG, PIPE_UP + half);
    context.quadraticCurveTo(PIPE_ALONG - length * 0.6, PIPE_UP + half * 1.3, PIPE_ALONG - length, PIPE_UP);
    context.quadraticCurveTo(PIPE_ALONG - length * 0.6, PIPE_UP - half * 1.3, PIPE_ALONG, PIPE_UP - half);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(150, 210, 255, 0.85)';
    context.beginPath();
    context.ellipse(PIPE_ALONG - 1.6, PIPE_UP, 2.2 * flicker, half * 0.55, 0, 0, Math.PI * 2);
    context.fill();
  }

  /** Exhaust: a thin trail while cruising, thick dark puffs when the slope eats the engine. */
  private smokeStep(context: CanvasRenderingContext2D, view: View, game: GhatClimb, dt: number, effort: number) {
    if (effort >= 0) {
      const angle = game.angle();
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const rate = 10 + effort * 50;
      if (Math.random() < rate * dt) {
        this.smoke.push({
          x: game.x() + PIPE_ALONG * cos - PIPE_UP * sin,
          y: game.y() + PIPE_ALONG * sin + PIPE_UP * cos,
          vx: -6 - Math.random() * 6,
          vy: 5 + Math.random() * 5,
          life: 0.5 + effort * 0.6,
          age: 0,
          size: 1.6 + effort * 2.6 + Math.random(),
          dark: effort,
        });
      }
    }
    const s = view.scale;
    for (let index = this.smoke.length - 1; index >= 0; index--) {
      const puff = this.smoke[index];
      puff.age += dt;
      if (puff.age > puff.life) { this.smoke.splice(index, 1); continue; }
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      const fade = 1 - puff.age / puff.life;
      const shade = Math.round(200 - puff.dark * 140);
      context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${(0.25 + puff.dark * 0.35) * fade})`;
      context.beginPath();
      context.arc(toX(view, puff.x), toY(view, puff.y), puff.size * (1 + puff.age * 1.6) * s, 0, Math.PI * 2);
      context.fill();
    }
  }

  private wheel(context: CanvasRenderingContext2D, along: number, up: number, spin: number) {
    context.save();
    context.translate(along, up - TYRE_DROP);
    context.rotate(-spin);
    context.fillStyle = '#2a2a2e';
    context.beginPath();
    context.arc(0, 0, TYRE_R, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#66676b';
    context.lineWidth = 1.1;
    context.beginPath();
    for (let spoke = 0; spoke < 3; spoke++) {
      const angle = spoke * Math.PI / 3;
      context.moveTo(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5);
      context.lineTo(Math.cos(angle) * (TYRE_R - 1.1), Math.sin(angle) * (TYRE_R - 1.1));
    }
    context.stroke();
    context.fillStyle = '#77787c';
    context.beginPath();
    context.arc(0, 0, 1.8, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private dustStep(context: CanvasRenderingContext2D, view: View, game: GhatClimb, dt: number) {
    if (game.phase() === PHASE.driving && Math.abs(game.speed()) > 22 && Math.random() < 0.6) {
      this.dust.push({ x: game.x() - 14, y: game.height_at(game.x()) + 2, life: 0.45, age: 0, size: 3 + Math.random() * 3 });
    }
    const s = view.scale;
    for (let index = this.dust.length - 1; index >= 0; index--) {
      const puff = this.dust[index];
      puff.age += dt;
      if (puff.age > puff.life) { this.dust.splice(index, 1); continue; }
      const alpha = 0.35 * (1 - puff.age / puff.life);
      context.fillStyle = `rgba(160, 130, 90, ${alpha})`;
      context.beginPath();
      context.arc(toX(view, puff.x - puff.age * 12), toY(view, puff.y + puff.age * 6), puff.size * s, 0, Math.PI * 2);
      context.fill();
    }
  }
}

/** Repeatable 0..1 value for a road position, so stones and tufts stay put as the camera moves. */
function noise(x: number): number {
  const v = Math.sin(Math.round(x * 10) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}
