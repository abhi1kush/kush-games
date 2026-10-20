/** Small Web Audio sounds for moves, captures and checks. No audio files; the AudioContext is made on first use. */
const MUTE_STORAGE_KEY = 'kush-games-chess-muted';

let audioContext: AudioContext | null = null;
let soundsPlayed = 0;

export function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_STORAGE_KEY) === 'true'; } catch { return false; }
}
export function saveMuted(isMuted: boolean) {
  try { localStorage.setItem(MUTE_STORAGE_KEY, String(isMuted)); } catch { /* storage unavailable */ }
}

/** Create/resume the AudioContext; call from a user gesture. */
export function unlockAudio(): AudioContext | null {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') void audioContext.resume();
    return audioContext;
  } catch { return null; }
}

function tone(context: AudioContext, frequency: number, startAt: number, duration: number, volume: number, type: OscillatorType = 'triangle') {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.7, startAt + duration);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function noiseTap(context: AudioContext, startAt: number, duration: number, volume: number, frequency: number) {
  const frameCount = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index++) samples[index] = (Math.random() * 2 - 1) * (1 - index / frameCount) ** 3;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(startAt);
}

export type MoveSound = 'move' | 'capture' | 'check';

/** A wooden "tock" for a move, a heavier double knock for a capture, a two-note ping for check. */
export function playMoveSound(kind: MoveSound) {
  const context = unlockAudio();
  soundsPlayed++;
  if (!context) return;
  const now = context.currentTime + 0.005;
  if (kind === 'move') {
    noiseTap(context, now, 0.05, 0.5, 1800);
    tone(context, 520, now, 0.06, 0.08);
  } else if (kind === 'capture') {
    noiseTap(context, now, 0.07, 0.7, 1200);
    tone(context, 300, now, 0.09, 0.12);
    noiseTap(context, now + 0.06, 0.05, 0.4, 900);
  } else {
    noiseTap(context, now, 0.05, 0.45, 1800);
    tone(context, 880, now + 0.02, 0.12, 0.07, 'sine');
    tone(context, 1320, now + 0.11, 0.16, 0.06, 'sine');
  }
}

export const getSoundsPlayed = () => soundsPlayed;
