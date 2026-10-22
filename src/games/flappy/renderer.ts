/** Draws Flappy Wings on a canvas. Static art (sky, pipe body, ground strip, bird) is drawn once into offscreen canvases. */
import { BIRD_RADIUS, BIRD_X, FlappyState, GROUND_HEIGHT, GROUND_TOP, PIPE_GAP, PIPE_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from './physics';

const PIPE_CAP_HEIGHT = 22;
const PIPE_CAP_OVERHANG = 4;
const GROUND_STRIPE = 24;

function makeCanvas(width: number, height: number, scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d')!;
  context.scale(scale, scale);
  return { canvas, context };
}

export class FlappyRenderer {
  private context: CanvasRenderingContext2D;
  private scale = 1;
  private sky!: HTMLCanvasElement;
  private pipeBody!: HTMLCanvasElement;
  private pipeCap!: HTMLCanvasElement;
  private ground!: HTMLCanvasElement;
  private bird!: HTMLCanvasElement;

  constructor(private canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d', { alpha: false })!;
  }

  /** Match the canvas to its CSS size and device pixel ratio; rebuilds the cached art. */
  resize(cssWidth: number) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = (cssWidth / WORLD_WIDTH) * pixelRatio;
    this.canvas.width = Math.round(WORLD_WIDTH * this.scale);
    this.canvas.height = Math.round(WORLD_HEIGHT * this.scale);
    this.buildArt();
  }

  private buildArt() {
    const scale = this.scale;
    const sky = makeCanvas(WORLD_WIDTH, GROUND_TOP, scale);
    const gradient = sky.context.createLinearGradient(0, 0, 0, GROUND_TOP);
    gradient.addColorStop(0, '#56ccf2');
    gradient.addColorStop(1, '#b8ecff');
    sky.context.fillStyle = gradient;
    sky.context.fillRect(0, 0, WORLD_WIDTH, GROUND_TOP);
    sky.context.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, size] of [[40, 90, 18], [70, 84, 24], [100, 92, 16], [190, 150, 20], [215, 142, 26], [244, 152, 17]]) {
      sky.context.beginPath(); sky.context.arc(x, y, size, 0, Math.PI * 2); sky.context.fill();
    }
    sky.context.fillStyle = '#7fd08a';
    for (let x = 0; x < WORLD_WIDTH; x += 36) { sky.context.beginPath(); sky.context.arc(x + 18, GROUND_TOP + 6, 26, Math.PI, 0); sky.context.fill(); }
    this.sky = sky.canvas;

    // as tall as the world, so pipes are drawn by cropping instead of stretching (stretching blurs the ends)
    const body = makeCanvas(PIPE_WIDTH, GROUND_TOP, scale);
    const pipeGradient = body.context.createLinearGradient(0, 0, PIPE_WIDTH, 0);
    pipeGradient.addColorStop(0, '#3aa845'); pipeGradient.addColorStop(0.35, '#8de07a'); pipeGradient.addColorStop(1, '#2a7a34');
    body.context.fillStyle = pipeGradient;
    body.context.fillRect(0, 0, PIPE_WIDTH, GROUND_TOP);
    body.context.fillStyle = '#1d5a25';
    body.context.fillRect(0, 0, 2, GROUND_TOP); body.context.fillRect(PIPE_WIDTH - 2, 0, 2, GROUND_TOP);
    this.pipeBody = body.canvas;

    const capWidth = PIPE_WIDTH + PIPE_CAP_OVERHANG * 2;
    const cap = makeCanvas(capWidth, PIPE_CAP_HEIGHT, scale);
    const capGradient = cap.context.createLinearGradient(0, 0, capWidth, 0);
    capGradient.addColorStop(0, '#3aa845'); capGradient.addColorStop(0.35, '#9be888'); capGradient.addColorStop(1, '#2a7a34');
    cap.context.fillStyle = '#1d5a25';
    cap.context.fillRect(0, 0, capWidth, PIPE_CAP_HEIGHT);
    cap.context.fillStyle = capGradient;
    cap.context.fillRect(2, 2, capWidth - 4, PIPE_CAP_HEIGHT - 4);
    this.pipeCap = cap.canvas;

    const ground = makeCanvas(WORLD_WIDTH + GROUND_STRIPE, GROUND_HEIGHT, scale);
    ground.context.fillStyle = '#ded895';
    ground.context.fillRect(0, 0, WORLD_WIDTH + GROUND_STRIPE, GROUND_HEIGHT);
    ground.context.fillStyle = '#73bf2e';
    ground.context.fillRect(0, 0, WORLD_WIDTH + GROUND_STRIPE, 12);
    ground.context.fillStyle = '#5aa021';
    for (let x = 0; x < WORLD_WIDTH + GROUND_STRIPE; x += GROUND_STRIPE) {
      ground.context.beginPath();
      ground.context.moveTo(x, 12); ground.context.lineTo(x + 12, 0); ground.context.lineTo(x + 24, 0); ground.context.lineTo(x + 12, 12);
      ground.context.fill();
    }
    ground.context.fillStyle = '#c9b96a';
    ground.context.fillRect(0, 12, WORLD_WIDTH + GROUND_STRIPE, 3);
    this.ground = ground.canvas;

    const birdSize = BIRD_RADIUS * 2 + 8;
    const bird = makeCanvas(birdSize, birdSize, scale);
    const center = birdSize / 2;
    const birdContext = bird.context;
    birdContext.fillStyle = '#ffd23f';
    birdContext.strokeStyle = '#5a3b00';
    birdContext.lineWidth = 1.5;
    birdContext.beginPath(); birdContext.arc(center, center, BIRD_RADIUS, 0, Math.PI * 2); birdContext.fill(); birdContext.stroke();
    birdContext.fillStyle = '#fff3c4';
    birdContext.beginPath(); birdContext.ellipse(center - 5, center + 3, 7, 4.5, -0.3, 0, Math.PI * 2); birdContext.fill(); birdContext.stroke();
    birdContext.fillStyle = '#fff';
    birdContext.beginPath(); birdContext.arc(center + 5, center - 4, 4.5, 0, Math.PI * 2); birdContext.fill(); birdContext.stroke();
    birdContext.fillStyle = '#000';
    birdContext.beginPath(); birdContext.arc(center + 6.5, center - 4, 1.8, 0, Math.PI * 2); birdContext.fill();
    birdContext.fillStyle = '#ff7a1a';
    birdContext.beginPath(); birdContext.moveTo(center + 9, center); birdContext.lineTo(center + 17, center + 2); birdContext.lineTo(center + 9, center + 5);
    birdContext.closePath(); birdContext.fill(); birdContext.stroke();
    this.bird = bird.canvas;
  }

  private drawPipeBody(x: number, top: number, height: number) {
    if (height <= 0) return;
    const sourceHeight = Math.min(this.pipeBody.height, Math.ceil(height * this.scale));
    this.context.drawImage(this.pipeBody, 0, 0, this.pipeBody.width, sourceHeight, x, top, PIPE_WIDTH, sourceHeight / this.scale);
  }

  draw(state: FlappyState) {
    const context = this.context;
    const scale = this.scale;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(this.sky, 0, 0);
    context.setTransform(scale, 0, 0, scale, 0, 0);

    for (const pipe of state.pipes) {
      const gapTop = pipe.gapY - PIPE_GAP / 2;
      const gapBottom = pipe.gapY + PIPE_GAP / 2;
      this.drawPipeBody(pipe.x, 0, gapTop - PIPE_CAP_HEIGHT);
      this.drawPipeBody(pipe.x, gapBottom + PIPE_CAP_HEIGHT, GROUND_TOP - gapBottom - PIPE_CAP_HEIGHT);
      context.drawImage(this.pipeCap, pipe.x - PIPE_CAP_OVERHANG, gapTop - PIPE_CAP_HEIGHT, PIPE_WIDTH + PIPE_CAP_OVERHANG * 2, PIPE_CAP_HEIGHT);
      context.drawImage(this.pipeCap, pipe.x - PIPE_CAP_OVERHANG, gapBottom, PIPE_WIDTH + PIPE_CAP_OVERHANG * 2, PIPE_CAP_HEIGHT);
    }

    const groundOffset = state.distance % GROUND_STRIPE;
    context.drawImage(this.ground, -groundOffset, GROUND_TOP, WORLD_WIDTH + GROUND_STRIPE, GROUND_HEIGHT);

    const tilt = state.status === 'ready' ? 0 : Math.max(-0.45, Math.min(1.3, state.velocityY / 450));
    const birdSize = BIRD_RADIUS * 2 + 8;
    context.translate(BIRD_X, state.birdY);
    context.rotate(tilt);
    context.drawImage(this.bird, -birdSize / 2, -birdSize / 2, birdSize, birdSize);
    context.setTransform(scale, 0, 0, scale, 0, 0);

    if (state.status !== 'over' || state.score > 0) {
      context.font = '900 40px system-ui, sans-serif';
      context.textAlign = 'center';
      context.lineWidth = 5;
      context.strokeStyle = '#3b2a00';
      context.fillStyle = '#fff';
      context.strokeText(String(state.score), WORLD_WIDTH / 2, 70);
      context.fillText(String(state.score), WORLD_WIDTH / 2, 70);
    }
  }
}
