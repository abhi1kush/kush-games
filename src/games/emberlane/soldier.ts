/**
 * The yard soldier of stage two, drawn with paths at world scale (original art): a padded rust-red gambeson, a
 * rounded iron cap with a cheek flap, a round wooden shield slung on his back and a long ash spear with a leaf blade.
 * Poses: a slow patrol walk, a pause where he looks about, a wary lean, a running charge with the spear levelled, the
 * thrust, crouching at the lamp post striking his tinder, and crumpling when Mira takes him down.
 */
import { GUARD_STATE } from './engine';

export interface SoldierPose {
  x: number;
  /** screen y of his feet */
  y: number;
  s: number;
  facing: number;
  walked: number;
  state: number;
  /** seconds in the current state */
  stateTime: number;
  time: number;
  moving: boolean;
  /** 0…1 while striking his tinder */
  relight: number;
}

function limb(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, colour: string) {
  context.strokeStyle = colour; context.lineWidth = width; context.lineCap = 'round';
  context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
}

/** Returns the screen point of his spear tip (for the hit spark). */
export function drawSoldier(context: CanvasRenderingContext2D, pose: SoldierPose): [number, number] {
  const { s, facing, time, state, stateTime } = pose;
  const charging = state === GUARD_STATE.charge;
  const thrusting = state === GUARD_STATE.spear;
  const down = state === GUARD_STATE.down;
  const relighting = state === GUARD_STATE.relight && pose.relight > 0;
  const cadence = charging ? 0.2 : 0.17;
  const stride = pose.moving ? Math.sin(pose.walked * cadence) : 0;
  const bob = pose.moving ? Math.abs(Math.cos(pose.walked * cadence)) * (charging ? 2 : 1.2) * s : Math.sin(time * 1.8) * 0.3 * s;
  const crouch = relighting ? 7 * s : 0;
  context.save();
  context.translate(pose.x, pose.y);
  if (down) {
    // he crumples backwards and lies still
    const t = Math.min(1, stateTime / 0.7);
    context.translate(-facing * t * 10 * s, 0);
    context.rotate(-facing * t * 1.45);
  }
  context.scale(facing, 1);
  const lean = charging ? 0.22 : thrusting ? 0.3 * Math.min(1, stateTime / 0.15) : state === GUARD_STATE.suspicious ? 0.08 : 0;
  const hip = -20 * s - bob + crouch;
  // legs: dark hose and wrapped boots
  const kneel = relighting ? 1 : 0;
  limb(context, 0, hip, 5 * stride * s + lean * 8 * s + kneel * 7 * s, -1 * s - kneel * 6 * s, 4 * s, '#2c2622');
  if (kneel) limb(context, 7 * s, -7 * s, 7 * s, -1 * s, 4 * s, '#2c2622');
  limb(context, 0, hip, -5 * stride * s + lean * 4 * s - kneel * 4 * s, -1 * s, 4 * s, '#352d28');
  context.fillStyle = '#1b1612';
  for (const foot of kneel ? [8.4, -2.6] : [5 * stride + lean * 8, -5 * stride + lean * 4]) { context.beginPath(); context.ellipse(foot * s + 1.6 * s, -1.2 * s, 3.2 * s, 1.5 * s, 0, 0, Math.PI * 2); context.fill(); }
  context.rotate(lean);
  // round shield slung on his back
  context.fillStyle = '#5c3d22';
  context.beginPath(); context.ellipse(-5.5 * s, hip - 10 * s, 3 * s, 8 * s, 0, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#8a8478'; context.lineWidth = 1 * s; context.stroke();
  // gambeson: quilted, belted, skirted
  const coat = context.createLinearGradient(0, hip - 22 * s, 0, hip + 6 * s);
  coat.addColorStop(0, '#8a3a26'); coat.addColorStop(1, '#5a2418');
  context.fillStyle = coat;
  context.beginPath();
  context.moveTo(-5 * s, hip - 20 * s); context.lineTo(5.5 * s, hip - 20 * s);
  context.lineTo(7 * s + stride * 0.6 * s, hip + 5 * s); context.lineTo(-6.5 * s - stride * 0.6 * s, hip + 5 * s);
  context.closePath(); context.fill();
  context.strokeStyle = 'rgba(30, 10, 6, 0.45)'; context.lineWidth = 0.7 * s;
  context.beginPath();
  for (let row = 1; row < 5; row++) { const y = hip - 20 * s + row * 5 * s; context.moveTo(-5.4 * s, y); context.lineTo(6 * s, y); }
  context.stroke();
  context.fillStyle = '#2a1c12'; context.fillRect(-5.6 * s, hip - 2.5 * s, 12 * s, 2.2 * s);
  context.fillStyle = '#b08a3a'; context.fillRect(0.4 * s, hip - 2.7 * s, 2.2 * s, 2.6 * s);
  // head: weathered face, stubble, iron cap with a cheek flap
  const headY = hip - 26 * s;
  context.fillStyle = '#c99a78';
  context.beginPath(); context.ellipse(0.8 * s, headY, 4.3 * s, 5 * s, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = 'rgba(60, 40, 30, 0.35)';
  context.beginPath(); context.ellipse(1.6 * s, headY + 2.6 * s, 3.2 * s, 2 * s, 0, 0, Math.PI); context.fill();
  // looking about while paused on his beat
  const glance = state === GUARD_STATE.patrol && !pose.moving ? Math.sin(time * 1.4) : 0;
  context.fillStyle = '#1e140e';
  context.beginPath(); context.ellipse((2.6 + glance * 0.6) * s, headY - 0.3 * s, 0.7 * s, 0.9 * s, 0, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#3a2418'; context.lineWidth = 0.8 * s;
  const brow = state === GUARD_STATE.suspicious || charging || thrusting ? 0.9 : 0;
  context.beginPath(); context.moveTo(1.2 * s, headY - 2.2 * s); context.lineTo(3.8 * s, headY - 2.2 * s + brow * s); context.stroke();
  const cap = context.createLinearGradient(0, headY - 8 * s, 0, headY - 1 * s);
  cap.addColorStop(0, '#9aa0a8'); cap.addColorStop(1, '#4d525a');
  context.fillStyle = cap;
  context.beginPath(); context.ellipse(0.4 * s, headY - 2.4 * s, 5.4 * s, 5.2 * s, 0, Math.PI, Math.PI * 2); context.fill();
  context.fillRect(-5 * s, headY - 2.6 * s, 10.8 * s, 1.6 * s);
  context.fillStyle = '#5a4030';
  context.beginPath(); context.moveTo(-4.6 * s, headY - 1.2 * s); context.lineTo(-1.6 * s, headY - 1.2 * s); context.lineTo(-2.4 * s, headY + 4 * s); context.lineTo(-4.8 * s, headY + 3 * s); context.closePath(); context.fill();
  context.fillStyle = 'rgba(255, 255, 255, 0.35)';
  context.beginPath(); context.ellipse(1.6 * s, headY - 5.2 * s, 2 * s, 0.7 * s, -0.3, 0, Math.PI * 2); context.fill();
  // spear arm and spear
  const shoulderY = hip - 17 * s;
  let handX = 6 * s;
  let handY = hip - 9 * s;
  let angle = -1.42; // spear held upright, butt on the ground beside him
  let reach = 0;
  if (charging) { handX = 8 * s; handY = hip - 12 * s; angle = -0.12; }
  if (thrusting) {
    const t = Math.min(1, stateTime / 0.18);
    const back = stateTime > 0.4 ? Math.min(1, (stateTime - 0.4) / 0.15) : 0;
    reach = (t * 14 - back * 6) * s;
    handX = 6 * s + reach; handY = hip - 12 * s; angle = -0.05;
  }
  if (relighting) { handX = 9 * s; handY = hip - 6 * s; angle = -1.75; }
  if (down) { angle = 1.5; handX = 4 * s; handY = hip - 8 * s; }
  limb(context, 0.5 * s, shoulderY, handX, handY, 3 * s, '#7a3020');
  const length = 64 * s;
  const butt = 20 * s;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const tipX = handX + ux * (length - butt);
  const tipY = handY + uy * (length - butt);
  limb(context, handX - ux * butt, handY - uy * butt, tipX, tipY, 1.6 * s, '#8a6a44');
  // leaf blade
  context.fillStyle = '#c8ccd2';
  context.beginPath();
  context.moveTo(tipX + ux * 9 * s, tipY + uy * 9 * s);
  context.quadraticCurveTo(tipX + ux * 3 * s - uy * 2.4 * s, tipY + uy * 3 * s + ux * 2.4 * s, tipX, tipY);
  context.quadraticCurveTo(tipX + ux * 3 * s + uy * 2.4 * s, tipY + uy * 3 * s - ux * 2.4 * s, tipX + ux * 9 * s, tipY + uy * 9 * s);
  context.fill();
  context.fillStyle = '#5a5e66'; context.fillRect(tipX - 1 * s, tipY - 1 * s, 2 * s, 2 * s);
  context.fillStyle = '#c99a78';
  context.beginPath(); context.arc(handX, handY, 1.7 * s, 0, Math.PI * 2); context.fill();
  // the other hand: strikes flint over the lamp's wick
  if (relighting) {
    const fx = 10 * s; const fy = hip - 14 * s;
    limb(context, 0.5 * s, shoulderY, fx, fy, 3 * s, '#8a3a26');
    if (Math.sin(time * 22) > 0.55) {
      context.fillStyle = '#ffd27a';
      for (let spark = 0; spark < 4; spark++) { const a = time * 9 + spark * 1.7; context.fillRect(fx + Math.cos(a) * 3 * s, fy - 2 * s + Math.sin(a) * 2 * s, 0.9 * s, 0.9 * s); }
    }
  } else limb(context, 0.5 * s, shoulderY, -2 * s + stride * 3 * s, hip - 4 * s, 3 * s, '#6a2a1c');
  context.restore();
  const cos = Math.cos(lean); const sin = Math.sin(lean);
  const lx = tipX + ux * 9 * s; const ly = tipY + uy * 9 * s;
  return [pose.x + (lx * cos - ly * sin) * facing, pose.y + lx * sin + ly * cos];
}

/**
 * The suspicion indicator over his head: an eye that opens as suspicion fills, ringed by a meter that runs from amber
 * to red. "?" while he wonders, "!" when he is fully aware and comes for her. While he strikes his tinder a small
 * flame bar shows how long the dark will last.
 */
export function drawSuspicion(context: CanvasRenderingContext2D, x: number, y: number, s: number, suspicion: number, state: number, relight: number, time: number) {
  const aware = state === GUARD_STATE.charge || state === GUARD_STATE.spear;
  if (state === GUARD_STATE.down) return;
  if (suspicion > 0.01 || aware) {
    const r = 6 * s;
    const pulse = aware ? 1 + Math.sin(time * 18) * 0.12 : 1;
    context.save();
    context.translate(x, y);
    context.scale(pulse, pulse);
    context.fillStyle = 'rgba(12, 10, 18, 0.82)';
    context.beginPath(); context.arc(0, 0, r + 1.6 * s, 0, Math.PI * 2); context.fill();
    const level = aware ? 1 : suspicion;
    const red = Math.round(255);
    const green = Math.round(210 - level * 180);
    context.strokeStyle = `rgb(${red}, ${green}, 60)`;
    context.lineWidth = 2 * s;
    context.lineCap = 'round';
    context.beginPath(); context.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + level * Math.PI * 2); context.stroke();
    // the eye
    const open = Math.max(0.15, level);
    context.fillStyle = `rgb(${red}, ${green + 30}, 120)`;
    context.beginPath(); context.ellipse(0, 0, 3.6 * s, 2.4 * s * open, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#140c0c';
    context.beginPath(); context.arc(0, 0, 1.1 * s * (0.6 + open * 0.4), 0, Math.PI * 2); context.fill();
    context.restore();
    const mark = aware ? '!' : suspicion > 0.35 ? '?' : '';
    if (mark) {
      context.font = `900 ${Math.round(Math.max(12, 8 * s))}px system-ui, sans-serif`;
      context.textAlign = 'center'; context.textBaseline = 'alphabetic';
      context.fillStyle = aware ? '#ff4040' : '#ffd060';
      context.strokeStyle = 'rgba(0, 0, 0, 0.8)'; context.lineWidth = 2.5;
      context.strokeText(mark, x, y - 9 * s); context.fillText(mark, x, y - 9 * s);
      context.textAlign = 'start';
    }
  }
  if (state === GUARD_STATE.relight && relight > 0) {
    const width = 16 * s;
    const top = y + (suspicion > 0.01 ? 10 * s : 0);
    context.fillStyle = 'rgba(12, 10, 18, 0.8)';
    context.beginPath(); context.roundRect(x - width / 2 - 1.5 * s, top - 1.5 * s, width + 3 * s, 4 * s, 2 * s); context.fill();
    context.fillStyle = '#ff9a3a';
    context.fillRect(x - width / 2, top - 0.5 * s, width * Math.min(1, relight), 2 * s);
  }
}
