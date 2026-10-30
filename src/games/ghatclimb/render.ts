/**
 * Ghat Climb frame: morning sky, two ridges, the dirt road, coins and jerry cans, then the jeep.
 * The road height comes from the same wasm function the wheels stand on.
 */
import { AXLE, COURSE_END, engineMood, FINISH_X, FRONT, type GhatClimb, PHASE, readPickups, REAR, WHEEL_R } from './engine';

const VIEW_UNITS = 210;

interface View { scale: number; camX: number; camY: number; width: number; height: number }
const toX = (view: View, x: number) => (x - view.camX) * view.scale;
const toY = (view: View, y: number) => view.height / 2 - (y - view.camY) * view.scale;

interface Dust { x: number; y: number; life: number; age: number; size: number }
interface Smoke { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; dark: number }

/** Tail pipe, in body space. */
const PIPE_ALONG = -23;
const PIPE_UP = AXLE + 4;

export class Renderer {
  private dust: Dust[] = [];
  private smoke: Smoke[] = [];
  private last = 0;

  draw(context: CanvasRenderingContext2D, game: GhatClimb, width: number, height: number, ratio: number, now: number, gasHeld = false) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const scale = Math.min(height / VIEW_UNITS, width / 300);
    const visible = width / scale;
    const view: View = {
      scale,
      camX: Math.max(0, Math.min(COURSE_END - visible, game.x() - visible * 0.36)),
      camY: game.y() + 18,
      width,
      height,
    };
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.sky(context, view, now / 1000);
    this.ridge(context, view, 0.28, 96, '#9ec98a');
    this.ridge(context, view, 0.55, 48, '#6ea04a');
    this.road(context, view, game);
    this.flag(context, view, game);
    this.pickups(context, view, game);
    const { mood, effort } = game.phase() === PHASE.driving ? engineMood(gasHeld, game.fuel(), game.strain(), game.contact()) : { mood: 'idle', effort: 0 };
    this.smokeStep(context, view, game, dt, mood === 'idle' || mood === 'empty' ? -1 : effort);
    this.jeep(context, view, game, mood === 'straining' || mood === 'too steep' ? effort : 0, now);
    this.dustStep(context, view, game, dt);
  }

  private sky(context: CanvasRenderingContext2D, view: View, time: number) {
    const sky = context.createLinearGradient(0, 0, 0, view.height);
    sky.addColorStop(0, '#79c4ee');
    sky.addColorStop(0.55, '#d7ecf8');
    sky.addColorStop(1, '#f6e0b0');
    context.fillStyle = sky;
    context.fillRect(0, 0, view.width, view.height);
    const sunX = view.width * 0.78;
    const sunY = view.height * 0.16;
    const glow = context.createRadialGradient(sunX, sunY, 8, sunX, sunY, view.height * 0.45);
    glow.addColorStop(0, 'rgba(255, 236, 170, 0.9)');
    glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, view.width, view.height);
    context.fillStyle = '#fff4c4';
    context.beginPath();
    context.arc(sunX, sunY, Math.max(14, view.height * 0.045), 0, Math.PI * 2);
    context.fill();
    for (let cloud = 0; cloud < 3; cloud++) {
      const x = ((time * (12 + cloud * 4) + cloud * 220) % (view.width + 180)) - 80;
      context.fillStyle = 'rgba(255,255,255,0.72)';
      context.beginPath();
      context.ellipse(x, 28 + cloud * 16, 36, 12, 0, 0, Math.PI * 2);
      context.ellipse(x + 22, 24 + cloud * 16, 22, 10, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  private ridge(context: CanvasRenderingContext2D, view: View, parallax: number, lift: number, colour: string) {
    const s = view.scale;
    context.beginPath();
    const left = view.camX * parallax - 40;
    const right = left + view.width / s + 80;
    context.moveTo(toX(view, left / parallax), view.height);
    for (let x = left; x <= right; x += 16) {
      const world = x / parallax;
      const y = lift + viewHeight(world) * 0.22;
      context.lineTo((x - view.camX * parallax) * s, toY(view, y));
    }
    context.lineTo(view.width + 20, view.height);
    context.closePath();
    context.fillStyle = colour;
    context.fill();
  }

  private road(context: CanvasRenderingContext2D, view: View, game: GhatClimb) {
    const s = view.scale;
    const left = view.camX - 10;
    const right = view.camX + view.width / s + 10;
    context.beginPath();
    let first = true;
    for (let x = left; x <= right; x += 8) {
      const px = toX(view, x);
      const py = toY(view, game.height_at(x));
      if (first) { context.moveTo(px, py); first = false; } else context.lineTo(px, py);
    }
    context.lineTo(toX(view, right), view.height + 20);
    context.lineTo(toX(view, left), view.height + 20);
    context.closePath();
    const dirt = context.createLinearGradient(0, view.height * 0.4, 0, view.height);
    dirt.addColorStop(0, '#d7b98a');
    dirt.addColorStop(1, '#8b6844');
    context.fillStyle = dirt;
    context.fill();
    context.beginPath();
    first = true;
    for (let x = left; x <= right; x += 8) {
      const px = toX(view, x);
      const py = toY(view, game.height_at(x));
      if (first) { context.moveTo(px, py); first = false; } else context.lineTo(px, py);
    }
    context.strokeStyle = '#6e5030';
    context.lineWidth = 3;
    context.stroke();
    // a pale verge just above the tyre line
    context.beginPath();
    first = true;
    for (let x = left; x <= right; x += 8) {
      const px = toX(view, x);
      const py = toY(view, game.height_at(x) + 3.2);
      if (first) { context.moveTo(px, py); first = false; } else context.lineTo(px, py);
    }
    context.strokeStyle = 'rgba(90, 140, 50, 0.55)';
    context.lineWidth = 4;
    context.stroke();
  }

  private flag(context: CanvasRenderingContext2D, view: View, game: GhatClimb) {
    const x = toX(view, FINISH_X);
    if (x < -40 || x > view.width + 40) return;
    const ground = toY(view, game.height_at(FINISH_X));
    const s = view.scale;
    context.strokeStyle = '#f4f4f4';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, ground);
    context.lineTo(x, ground - 36 * s);
    context.stroke();
    context.fillStyle = '#d23a2a';
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
        context.fillStyle = '#c0392b';
        context.strokeStyle = '#6e140c';
        context.lineWidth = 1.4;
        context.beginPath();
        context.roundRect(x - 5 * s, y - 8 * s, 10 * s, 12 * s, 2 * s);
        context.fill();
        context.stroke();
        context.fillStyle = '#f4efe6';
        context.fillRect(x - 1.4 * s, y - 11 * s, 2.8 * s, 4 * s);
      } else {
        context.fillStyle = '#ffd23f';
        context.strokeStyle = '#8a5a10';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(x, y, 5.2 * s, 0, Math.PI * 2);
        context.fill();
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
    if (flame > 0) this.flame(context, flame, now);
    this.wheel(context, REAR, AXLE - droop(REAR), game.spin());
    this.wheel(context, FRONT, AXLE - droop(FRONT), game.spin());
    context.fillStyle = '#d23a2a';
    context.strokeStyle = '#6e140c';
    context.lineWidth = 1.1;
    context.beginPath();
    context.roundRect(-22, AXLE + 2, 46, 12, 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#f4efe6';
    context.beginPath();
    context.moveTo(-4, AXLE + 14);
    context.lineTo(16, AXLE + 14);
    context.lineTo(22, AXLE + 4);
    context.lineTo(-8, AXLE + 4);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = '#9fd7f2';
    context.fillRect(-2, AXLE + 7, 14, 6);
    context.fillStyle = '#3a2418';
    context.beginPath();
    context.arc(4, AXLE + 12, 2.3, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff2c4';
    context.beginPath();
    context.arc(20, AXLE + 6, 1.6, 0, Math.PI * 2);
    context.fill();
    context.restore();
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
    context.translate(along, up);
    context.rotate(-spin);
    context.fillStyle = '#2a2a2e';
    context.beginPath();
    context.arc(0, 0, WHEEL_R, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#c8c8c8';
    context.lineWidth = 1.3;
    context.beginPath();
    for (let spoke = 0; spoke < 3; spoke++) {
      const angle = spoke * Math.PI / 3;
      context.moveTo(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5);
      context.lineTo(Math.cos(angle) * (WHEEL_R - 1.2), Math.sin(angle) * (WHEEL_R - 1.2));
    }
    context.stroke();
    context.fillStyle = '#d0d0d0';
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

function viewHeight(x: number): number {
  // a quiet echo of the road for the far ridges, without calling wasm again
  return 40 + 18 * Math.sin(x * 0.01) + 10 * Math.sin(x * 0.023);
}
