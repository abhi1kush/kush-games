/**
 * A tiny generated "chomp" for eating an apple (Web Audio API, no audio files).
 * The AudioContext is created lazily on the first user gesture and reused.
 */
const MUTED_STORAGE_KEY = 'kush-games-snake-muted';
const CHOMP_SECONDS = 0.12;
const MASTER_VOLUME = 0.3;

type AudioContextConstructor = typeof AudioContext;
let audioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let chompsPlayed = 0;

export function readMuted(): boolean {
  try { return localStorage.getItem(MUTED_STORAGE_KEY) === 'true'; } catch { return false; }
}

export function saveMuted(muted: boolean) {
  try { localStorage.setItem(MUTED_STORAGE_KEY, String(muted)); } catch { /* storage unavailable */ }
}

/** Call from a user gesture (key press, tap, click) so browsers allow audio. */
export function unlockAudio(): AudioContext | null {
  if (!audioContext) {
    const AudioContextClass: AudioContextConstructor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!AudioContextClass) return null;
    try { audioContext = new AudioContextClass(); } catch { return null; }
  }
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined);
  return audioContext;
}

export const getChompsPlayed = () => chompsPlayed;

/** Short crunchy chomp: a band-passed noise burst plus a quick pitch-dropping blip (~120 ms). */
export function playChomp() {
  const context = audioContext;
  if (!context || context.state !== 'running') return;
  const startTime = context.currentTime;
  const output = context.createGain();
  output.gain.value = MASTER_VOLUME;
  output.connect(context.destination);

  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * CHOMP_SECONDS), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  }
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  const bandpass = context.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(2200, startTime);
  bandpass.frequency.exponentialRampToValueAtTime(900, startTime + CHOMP_SECONDS);
  bandpass.Q.value = 1.4;
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.9, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
  noise.connect(bandpass).connect(noiseGain).connect(output);

  const blip = context.createOscillator();
  blip.type = 'square';
  blip.frequency.setValueAtTime(420, startTime);
  blip.frequency.exponentialRampToValueAtTime(110, startTime + 0.1);
  const blipGain = context.createGain();
  blipGain.gain.setValueAtTime(0.25, startTime);
  blipGain.gain.exponentialRampToValueAtTime(0.001, startTime + CHOMP_SECONDS);
  blip.connect(blipGain).connect(output);

  noise.start(startTime);
  noise.stop(startTime + CHOMP_SECONDS);
  blip.start(startTime);
  blip.stop(startTime + CHOMP_SECONDS);
  blip.onended = () => output.disconnect();
  chompsPlayed++;
}
