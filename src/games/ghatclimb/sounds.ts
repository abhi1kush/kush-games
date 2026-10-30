/** Generated sounds for Ghat Climb: a running engine, coins, a jerry can, a flip and the pass. */
import { playSound, unlockAudio } from '../sharedSound';

export type GhatSound = 'coin' | 'fuel' | 'crash' | 'finish';

export function playGhatSound(kind: GhatSound, isMuted: boolean) {
  switch (kind) {
    case 'coin': return playSound({ tones: [{ frequency: 880, durationSeconds: 0.06, volume: 0.06, type: 'square' }, { frequency: 1320, durationSeconds: 0.08, volume: 0.05, type: 'square', startSeconds: 0.05 }] }, isMuted);
    case 'fuel': return playSound({ tones: [{ frequency: 220, endFrequency: 440, durationSeconds: 0.16, volume: 0.07, type: 'triangle' }] }, isMuted);
    case 'crash': return playSound({ noises: [{ durationSeconds: 0.35, volume: 0.16, filterFrequency: 400, filterType: 'lowpass' }], tones: [{ frequency: 140, endFrequency: 50, durationSeconds: 0.4, volume: 0.1, type: 'sawtooth' }] }, isMuted);
    case 'finish': return playSound({ tones: [523, 659, 784].map((frequency, index) => ({ frequency, durationSeconds: 0.4, volume: 0.07, type: 'triangle' as OscillatorType, startSeconds: index * 0.1 })) }, isMuted);
  }
}

export interface EngineState {
  /** The engine is turning over: a climb is under way and not paused. */
  running: boolean;
  gas: boolean;
  /** Road speed as a share of top speed, 0..1. */
  speed: number;
  /** Slope load from the physics, 0..1.5. */
  strain: number;
  /** The driven wheel is off the road, so the engine revs free. */
  freeRevving: boolean;
  muted: boolean;
}

const IDLE_HZ = 34;
const REDLINE_HZ = 120;

/**
 * A continuous engine note: a sawtooth and a sub-octave square through a low-pass filter, pulsed at the firing
 * rate, plus filtered noise for the grit of a working engine. Revs follow speed and gas; load deepens and roughens
 * the note. Nodes are built on the first update after audio is unlocked.
 */
export class EngineSound {
  private context: AudioContext | null = null;
  private main: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private pulse: OscillatorNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private grit: GainNode | null = null;
  private output: GainNode | null = null;
  private rpm = 0;

  update(state: EngineState, dt: number) {
    if (!this.output) {
      if (!state.running || state.muted) return;
      if (!this.build()) return;
    }
    const context = this.context!;
    const now = context.currentTime;
    const load = Math.min(1, state.strain);
    const target = !state.running ? 0
      : Math.min(1, state.speed * 0.7 + (state.gas ? 0.22 + load * 0.12 : 0) + (state.gas && state.freeRevving ? 0.3 : 0));
    // revs climb faster than they fall, like a flywheel
    const rate = target > this.rpm ? 3.2 : 1.6;
    this.rpm += (target - this.rpm) * Math.min(1, dt * rate);

    const hz = IDLE_HZ + (REDLINE_HZ - IDLE_HZ) * this.rpm;
    const labouring = state.gas ? load : 0;
    this.main!.frequency.setTargetAtTime(hz, now, 0.03);
    this.sub!.frequency.setTargetAtTime(hz / 2, now, 0.03);
    this.pulse!.frequency.setTargetAtTime(hz / 2, now, 0.03);
    this.filter!.frequency.setTargetAtTime(260 + this.rpm * 900 + labouring * 500, now, 0.05);
    this.grit!.gain.setTargetAtTime(0.01 + labouring * 0.05 + (state.gas ? 0.012 : 0), now, 0.08);
    const volume = state.muted || !state.running ? 0 : 0.05 + (state.gas ? 0.035 : 0) + labouring * 0.025;
    this.output!.gain.setTargetAtTime(volume, now, state.running ? 0.06 : 0.25);
  }

  dispose() {
    for (const node of [this.main, this.sub, this.pulse, this.noise]) {
      try { node?.stop(); } catch { /* already stopped */ }
    }
    this.output?.disconnect();
    this.output = null;
    this.context = null;
  }

  private build(): boolean {
    const context = unlockAudio();
    if (!context || context.state !== 'running') return false;
    this.context = context;

    const output = context.createGain();
    output.gain.value = 0;
    output.connect(context.destination);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    // the firing pulse: the body gain swings with each power stroke
    const body = context.createGain();
    body.gain.value = 0.7;
    filter.connect(body).connect(output);

    const main = context.createOscillator();
    main.type = 'sawtooth';
    const sub = context.createOscillator();
    sub.type = 'square';
    const subLevel = context.createGain();
    subLevel.gain.value = 0.5;
    main.connect(filter);
    sub.connect(subLevel).connect(filter);

    const pulse = context.createOscillator();
    pulse.type = 'sine';
    const depth = context.createGain();
    depth.gain.value = 0.3;
    pulse.connect(depth).connect(body.gain);

    const noise = context.createBufferSource();
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 320;
    band.Q.value = 0.8;
    const grit = context.createGain();
    grit.gain.value = 0;
    noise.connect(band).connect(grit).connect(output);

    for (const source of [main, sub, pulse, noise]) source.start();
    this.main = main;
    this.sub = sub;
    this.pulse = pulse;
    this.filter = filter;
    this.grit = grit;
    this.noise = noise;
    this.output = output;
    return true;
  }
}
