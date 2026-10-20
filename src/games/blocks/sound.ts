/**
 * Generated Blocks sound effects (Web Audio API, no files). The AudioContext is created lazily
 * on the first user gesture and reused.
 */
const MUTED_STORAGE_KEY = 'kush-games-blocks-muted';
const MASTER_VOLUME = 0.25;

let audioContext: AudioContext | null = null;
let soundsPlayed = 0;

export function readMuted(): boolean {
  try { return localStorage.getItem(MUTED_STORAGE_KEY) === 'true'; } catch { return false; }
}

export function saveMuted(muted: boolean) {
  try { localStorage.setItem(MUTED_STORAGE_KEY, String(muted)); } catch { /* storage unavailable */ }
}

export function unlockAudio(): AudioContext | null {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    try { audioContext = new AudioContextClass(); } catch { return null; }
  }
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined);
  return audioContext;
}

export const getSoundsPlayed = () => soundsPlayed;

function readyContext(): AudioContext | null {
  return audioContext && audioContext.state === 'running' ? audioContext : null;
}

/** One enveloped oscillator note. */
function playNote(context: AudioContext, output: AudioNode, options: {
  frequency: number; endFrequency?: number; startAt: number; duration: number; volume: number; type: OscillatorType;
}) {
  const oscillator = context.createOscillator();
  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.frequency, options.startAt);
  if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, options.startAt + options.duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, options.startAt);
  gain.gain.exponentialRampToValueAtTime(options.volume, options.startAt + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, options.startAt + options.duration);
  oscillator.connect(gain).connect(output);
  oscillator.start(options.startAt);
  oscillator.stop(options.startAt + options.duration + 0.02);
}

function masterOutput(context: AudioContext, totalSeconds: number) {
  const output = context.createGain();
  output.gain.value = MASTER_VOLUME;
  output.connect(context.destination);
  setTimeout(() => output.disconnect(), (totalSeconds + 0.2) * 1000);
  return output;
}

/** Soft tick when a piece locks. */
export function playLockTick() {
  const context = readyContext();
  if (!context) return;
  const output = masterOutput(context, 0.05);
  playNote(context, output, { frequency: 900, endFrequency: 500, startAt: context.currentTime, duration: 0.045, volume: 0.35, type: 'triangle' });
  soundsPlayed++;
}

/** Bright rising chime; more lines = more notes. Four lines get a big chord. */
export function playLineClear(lineCount: number) {
  const context = readyContext();
  if (!context) return;
  const startAt = context.currentTime;
  const risingNotes = [784, 988, 1175, 1568]; // G5 B5 D6 G6
  if (lineCount >= 4) {
    const output = masterOutput(context, 0.9);
    risingNotes.forEach((frequency, index) =>
      playNote(context, output, { frequency, startAt: startAt + index * 0.05, duration: 0.18, volume: 0.35, type: 'square' }));
    for (const frequency of [523, 659, 784, 1047]) { // C major chord
      playNote(context, output, { frequency, startAt: startAt + 0.22, duration: 0.65, volume: 0.28, type: 'triangle' });
    }
  } else {
    const output = masterOutput(context, 0.1 + lineCount * 0.08);
    risingNotes.slice(0, lineCount + 1).forEach((frequency, index) =>
      playNote(context, output, { frequency, startAt: startAt + index * 0.06, duration: 0.12 + lineCount * 0.03, volume: 0.4, type: 'sine' }));
  }
  soundsPlayed++;
}

/** Low falling tone for game over. */
export function playGameOver() {
  const context = readyContext();
  if (!context) return;
  const output = masterOutput(context, 0.8);
  playNote(context, output, { frequency: 220, endFrequency: 70, startAt: context.currentTime, duration: 0.7, volume: 0.45, type: 'sawtooth' });
  soundsPlayed++;
}
