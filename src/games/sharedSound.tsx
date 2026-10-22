/**
 * Shared Web Audio helpers and one shared mute setting (`kush-games-muted`) for the games added
 * together: Minesweeper, Sudoku, Tic-Tac-Toe, Memory Match and Flappy Wings. Sounds are generated
 * (no audio files) and the AudioContext is created lazily on the first user gesture.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const SHARED_MUTE_STORAGE_KEY = 'kush-games-muted';

let audioContext: AudioContext | null = null;
let soundsPlayed = 0;

export function readSharedMuted(): boolean {
  try { return localStorage.getItem(SHARED_MUTE_STORAGE_KEY) === 'true'; } catch { return false; }
}
export function saveSharedMuted(isMuted: boolean) {
  try { localStorage.setItem(SHARED_MUTE_STORAGE_KEY, String(isMuted)); } catch { /* storage unavailable */ }
}

/** Create or resume the AudioContext; call it from a key press, click or tap. */
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

export interface ToneOptions {
  frequency: number;
  /** Glide to this frequency by the end. */
  endFrequency?: number;
  durationSeconds: number;
  volume?: number;
  type?: OscillatorType;
  /** Delay from now. */
  startSeconds?: number;
}

export interface NoiseOptions {
  durationSeconds: number;
  volume?: number;
  filterFrequency?: number;
  filterType?: BiquadFilterType;
  startSeconds?: number;
}

/** A sound is a list of tones and noise bursts played together. Nothing happens while muted. */
export function playSound(parts: { tones?: ToneOptions[]; noises?: NoiseOptions[] }, isMuted: boolean) {
  if (isMuted) return;
  soundsPlayed++;
  const context = unlockAudio();
  if (!context) return;
  const now = context.currentTime + 0.005;
  for (const tone of parts.tones ?? []) {
    const startAt = now + (tone.startSeconds ?? 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type ?? 'triangle';
    oscillator.frequency.setValueAtTime(tone.frequency, startAt);
    if (tone.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, startAt + tone.durationSeconds);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(tone.volume ?? 0.08, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + tone.durationSeconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + tone.durationSeconds + 0.03);
  }
  for (const noise of parts.noises ?? []) {
    const startAt = now + (noise.startSeconds ?? 0);
    const frameCount = Math.max(1, Math.ceil(context.sampleRate * noise.durationSeconds));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / frameCount) ** 2;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = noise.filterType ?? 'lowpass';
    filter.frequency.value = noise.filterFrequency ?? 1200;
    const gain = context.createGain();
    gain.gain.value = noise.volume ?? 0.3;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(startAt);
  }
}

export const getSharedSoundsPlayed = () => soundsPlayed;

/** The shared mute setting as React state plus a ref (for event handlers and game loops). Stays in sync across tabs. */
export function useSharedMute() {
  const [isMuted, setIsMuted] = useState(readSharedMuted);
  const isMutedRef = useRef(isMuted);
  const toggleMute = useCallback(() => {
    const nowMuted = !isMutedRef.current;
    isMutedRef.current = nowMuted;
    saveSharedMuted(nowMuted);
    setIsMuted(nowMuted);
    if (!nowMuted) unlockAudio();
  }, []);
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SHARED_MUTE_STORAGE_KEY) return;
      isMutedRef.current = event.newValue === 'true';
      setIsMuted(isMutedRef.current);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);
  return { isMuted, isMutedRef, toggleMute };
}

/** 🔊/🔇 button used by these games. */
export function MuteButton({ isMuted, onToggle, className = '' }: { isMuted: boolean; onToggle: () => void; className?: string }) {
  return (
    <button type="button" className={`shared-mute ${className}`} onClick={onToggle} data-testid="mute" aria-pressed={isMuted}
      aria-label={isMuted ? 'Unmute sound' : 'Mute sound'} title={isMuted ? 'Unmute (M)' : 'Mute (M)'}>
      {isMuted ? '🔇' : '🔊'}
    </button>
  );
}
