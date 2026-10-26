/**
 * Mira (the older sister, the player) and Kabir (her little brother). Drawn with paths at world scale: walk cycles from
 * distance walked, breathing and blinking when idle, a lean when pushing, a throwing arm, trembling when the rats
 * are close, and Kabir reaching for her hand when they stand together.
 */
export interface Pose {
  x: number;
  y: number;
  /** screen px per world unit */
  s: number;
  facing: number;
  walked: number;
  moving: boolean;
  time: number;
  fear: number;
  pushing?: boolean;
  throwing?: number;
  climbing?: boolean;
  carrying?: boolean;
  dead?: number;
}

const BLINK = (time: number, seed: number) => ((time + seed) % 3.7) < 0.12;

function limb(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, colour: string) {
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
}

/** Returns the screen positions of her front hand (where the lantern hangs) and her back hand (for Kabir). */
export function drawMira(context: CanvasRenderingContext2D, pose: Pose): { front: [number, number]; back: [number, number] } {
  const { s, facing, time } = pose;
  const stride = pose.moving ? Math.sin(pose.walked * 0.21) : 0;
  const bob = pose.moving ? Math.abs(Math.cos(pose.walked * 0.21)) * 1.2 * s : Math.sin(time * 2.2) * 0.35 * s;
  const tremble = pose.fear > 0.05 ? Math.sin(time * 60) * pose.fear * 0.8 * s : 0;
  const lean = pose.pushing ? 0.28 : pose.moving ? 0.06 : 0;
  const deadT = pose.dead ?? 0;
  context.save();
  context.translate(pose.x + tremble, pose.y);
  if (deadT > 0) { context.rotate(-facing * Math.min(1, deadT * 2) * 1.3); context.globalAlpha = Math.max(0, 1 - deadT * 0.6); }
  context.scale(facing, 1);
  const hip = -15 * s - bob;
  // legs
  limb(context, 0, hip, 4 * stride * s + lean * 6 * s, -1 * s, 3.2 * s, '#2a2230');
  limb(context, 0, hip, -4 * stride * s + lean * 4 * s, -1 * s, 3.2 * s, '#352b3c');
  context.fillStyle = '#1d1715';
  for (const foot of [4 * stride + lean * 6, -4 * stride + lean * 4]) { context.beginPath(); context.ellipse(foot * s + 1.4 * s, -1 * s, 2.6 * s, 1.3 * s, 0, 0, Math.PI * 2); context.fill(); }
  context.rotate(lean);
  // cloak (sways against the walk)
  const sway = -stride * 1.5 * s - (pose.moving ? 2 * s : 0);
  const cloak = context.createLinearGradient(0, hip - 16 * s, 0, hip + 6 * s);
  cloak.addColorStop(0, '#2f5d63'); cloak.addColorStop(1, '#1d3a40');
  context.fillStyle = cloak;
  context.beginPath();
  context.moveTo(-4 * s, hip - 15 * s);
  context.quadraticCurveTo(-8 * s + sway, hip, -7 * s + sway * 1.4, hip + 6 * s);
  context.lineTo(6 * s, hip + 5 * s);
  context.quadraticCurveTo(6 * s, hip - 6 * s, 4 * s, hip - 15 * s);
  context.closePath();
  context.fill();
  // tunic
  context.fillStyle = '#6b4a35';
  context.beginPath(); context.roundRect(-3.6 * s, hip - 14 * s, 7.6 * s, 15 * s, 2.4 * s); context.fill();
  context.fillStyle = '#3a2a1e'; context.fillRect(-3.6 * s, hip - 3 * s, 7.6 * s, 1.6 * s);
  // red scarf
  context.fillStyle = '#c81d25';
  context.beginPath(); context.ellipse(0, hip - 14.5 * s, 4.6 * s, 2 * s, 0, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.moveTo(-2 * s, hip - 14 * s); context.quadraticCurveTo(-6 * s + sway, hip - 10 * s, -7 * s + sway, hip - 7 * s); context.lineTo(-4.5 * s + sway, hip - 7.5 * s); context.closePath(); context.fill();
  // head
  const headY = hip - 20 * s;
  context.fillStyle = '#e9c3a0';
  context.beginPath(); context.ellipse(0.6 * s, headY, 4.4 * s, 4.8 * s, 0, 0, Math.PI * 2); context.fill();
  // auburn hair + braid
  context.fillStyle = '#7a3a1e';
  context.beginPath(); context.ellipse(-0.6 * s, headY - 1.8 * s, 4.8 * s, 3.6 * s, -0.2, Math.PI, Math.PI * 2.05); context.fill();
  context.beginPath(); context.ellipse(-3.2 * s, headY, 1.8 * s, 3.4 * s, 0.2, 0, Math.PI * 2); context.fill();
  for (let link = 0; link < 3; link++) { context.beginPath(); context.ellipse(-4.4 * s + sway * 0.2 * link, headY + (3.4 + link * 2.6) * s, 1.4 * s, 1.5 * s, 0, 0, Math.PI * 2); context.fill(); }
  // hood resting on her shoulders
  context.fillStyle = '#244a50';
  context.beginPath(); context.ellipse(-2.6 * s, headY + 4.2 * s, 4 * s, 1.8 * s, 0.3, 0, Math.PI * 2); context.fill();
  // face
  const eyeOpen = BLINK(time, 0.4) ? 0.25 : 1;
  const wide = 1 + pose.fear * 0.5;
  context.fillStyle = '#2a1a14';
  context.beginPath(); context.ellipse(2.4 * s, headY - 0.4 * s, 0.75 * s * wide, 1 * s * eyeOpen * wide, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = 'rgba(255,255,255,0.8)';
  if (eyeOpen > 0.5) { context.beginPath(); context.arc(2.6 * s, headY - 0.8 * s, 0.28 * s, 0, Math.PI * 2); context.fill(); }
  context.strokeStyle = '#7a3a1e'; context.lineWidth = 0.6 * s;
  context.beginPath(); context.moveTo(1.4 * s, headY - 2.4 * s - pose.fear * 0.6 * s); context.lineTo(3.4 * s, headY - 2.1 * s); context.stroke();
  context.strokeStyle = '#8a4a3a'; context.lineWidth = 0.6 * s;
  context.beginPath();
  if (pose.fear > 0.3) context.ellipse(3 * s, headY + 2.3 * s, 0.6 * s, 0.8 * s, 0, 0, Math.PI * 2);
  else { context.moveTo(2.2 * s, headY + 2.2 * s); context.quadraticCurveTo(3 * s, headY + 2.7 * s, 3.6 * s, headY + 2 * s); }
  context.stroke();
  context.fillStyle = 'rgba(220, 110, 100, 0.35)';
  context.beginPath(); context.arc(3.2 * s, headY + 1.1 * s, 0.9 * s, 0, Math.PI * 2); context.fill();
  // arms
  const shoulderY = hip - 12.5 * s;
  let handX = 4 * s - stride * 3 * s;
  let handY = hip - 3 * s;
  if (pose.pushing) { handX = 8 * s; handY = hip - 9 * s; }
  else if (pose.carrying) { handX = 7 * s; handY = hip - 6 * s; }
  else if (pose.throwing !== undefined && pose.throwing < 0.45) {
    const t = pose.throwing / 0.45;
    const angle = -2.4 + t * 3.1;
    handX = Math.cos(angle) * 9 * s; handY = shoulderY + Math.sin(angle) * 9 * s;
  } else if (pose.climbing) { handX = 6 * s; handY = shoulderY - 6 * s; }
  limb(context, 0.5 * s, shoulderY, -3 * s + stride * 3 * s, hip - 3 * s, 2.6 * s, '#2b525a');
  limb(context, 0.5 * s, shoulderY, handX, handY, 2.6 * s, '#2f5d63');
  context.fillStyle = '#e9c3a0';
  context.beginPath(); context.arc(handX, handY, 1.4 * s, 0, Math.PI * 2); context.fill();
  context.restore();
  // hand position in screen space (undo the transforms approximately)
  const cos = Math.cos(lean);
  const sin = Math.sin(lean);
  const toScreen = (lx: number, ly: number): [number, number] => [pose.x + tremble + (lx * cos - ly * sin) * facing, pose.y + lx * sin + ly * cos];
  return { front: toScreen(handX, handY), back: toScreen(-3 * s + stride * 3 * s, hip - 3 * s) };
}

export function drawKabir(context: CanvasRenderingContext2D, pose: Pose, reachHand: [number, number] | null) {
  const { s, facing, time } = pose;
  const stride = pose.moving ? Math.sin(pose.walked * 0.32) : 0;
  const bob = pose.moving ? Math.abs(Math.cos(pose.walked * 0.32)) * 1 * s : Math.sin(time * 2.6 + 1) * 0.3 * s;
  const tremble = pose.fear > 0.05 ? Math.sin(time * 70 + 2) * pose.fear * 0.8 * s : 0;
  const deadT = pose.dead ?? 0;
  context.save();
  context.translate(pose.x + tremble, pose.y);
  if (deadT > 0) { context.rotate(-facing * Math.min(1, deadT * 2) * 1.3); context.globalAlpha = Math.max(0, 1 - deadT * 0.6); }
  context.scale(facing, 1);
  const hip = -9.5 * s - bob;
  limb(context, 0, hip, 3 * stride * s, -1 * s, 2.6 * s, '#3b3226');
  limb(context, 0, hip, -3 * stride * s, -1 * s, 2.6 * s, '#463b2c');
  context.fillStyle = '#1d1715';
  for (const foot of [3 * stride, -3 * stride]) { context.beginPath(); context.ellipse(foot * s + 1 * s, -0.9 * s, 2 * s, 1.1 * s, 0, 0, Math.PI * 2); context.fill(); }
  // tunic (mustard, a bit too big for him)
  context.fillStyle = '#b7892f';
  context.beginPath(); context.moveTo(-4 * s, hip + 2 * s); context.lineTo(-3 * s, hip - 9 * s); context.lineTo(3 * s, hip - 9 * s); context.lineTo(4.2 * s, hip + 2 * s); context.closePath(); context.fill();
  context.fillStyle = '#7a5a20'; context.fillRect(-3.6 * s, hip - 2 * s, 7.4 * s, 1.2 * s);
  // big head, big eyes, floppy cap
  const headY = hip - 13.5 * s;
  context.fillStyle = '#efcaa8';
  context.beginPath(); context.ellipse(0.4 * s, headY, 4.4 * s, 4.4 * s, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#4b3a2a';
  context.beginPath(); context.ellipse(-0.4 * s, headY - 2.4 * s, 4.8 * s, 2.8 * s, 0, Math.PI, Math.PI * 2.02); context.fill();
  context.fillStyle = '#7a2a2a';
  context.beginPath(); context.moveTo(-4.8 * s, headY - 2.6 * s); context.quadraticCurveTo(0, headY - 8.5 * s, 4.8 * s, headY - 2.8 * s); context.quadraticCurveTo(-1 * s, headY - 4 * s, -6.5 * s, headY - 0.4 * s - Math.sin(time * 3) * 0.4 * s); context.closePath(); context.fill();
  const eyeOpen = BLINK(time, 1.9) ? 0.25 : 1;
  const wide = 1 + pose.fear * 0.6;
  context.fillStyle = '#20140e';
  context.beginPath(); context.ellipse(2.3 * s, headY + 0.2 * s, 0.95 * s * wide, 1.2 * s * eyeOpen * wide, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = 'rgba(255,255,255,0.85)';
  if (eyeOpen > 0.5) { context.beginPath(); context.arc(2.6 * s, headY - 0.3 * s, 0.35 * s, 0, Math.PI * 2); context.fill(); }
  context.fillStyle = 'rgba(230, 120, 110, 0.4)';
  context.beginPath(); context.arc(3 * s, headY + 1.9 * s, 0.9 * s, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#8a4a3a'; context.lineWidth = 0.55 * s;
  context.beginPath();
  if (pose.fear > 0.3) context.arc(2.8 * s, headY + 2.8 * s, 0.6 * s, 0, Math.PI * 2);
  else { context.moveTo(2 * s, headY + 2.6 * s); context.quadraticCurveTo(2.8 * s, headY + 3 * s, 3.4 * s, headY + 2.5 * s); }
  context.stroke();
  // a little cloth rabbit in his back hand
  const backHand: [number, number] = [-3 * s + stride * 2 * s, hip - 1.5 * s];
  limb(context, 0, hip - 7.5 * s, backHand[0], backHand[1], 2.2 * s, '#a07a28');
  context.fillStyle = '#d8cfc0';
  context.beginPath(); context.ellipse(backHand[0] - 1 * s, backHand[1] + 2 * s, 1.8 * s, 2.4 * s, 0.3, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.ellipse(backHand[0] - 1.8 * s, backHand[1] - 0.8 * s, 0.6 * s, 1.6 * s, -0.3, 0, Math.PI * 2); context.fill();
  context.restore();
  // front arm: reaches for Mira's hand when she is close and both stand still
  const shoulderX = pose.x + tremble + 0.2 * s * facing;
  const shoulderY = pose.y + hip - 7.5 * s;
  let handX = shoulderX + facing * (3 * s - stride * 2 * s);
  let handY = pose.y + hip - 1 * s;
  if (reachHand && Math.hypot(reachHand[0] - shoulderX, reachHand[1] - shoulderY) < 14 * s) { handX = reachHand[0]; handY = reachHand[1]; }
  limb(context, shoulderX, shoulderY, handX, handY, 2.2 * s, '#b7892f');
  context.fillStyle = '#efcaa8';
  context.beginPath(); context.arc(handX, handY, 1.2 * s, 0, Math.PI * 2); context.fill();
}
