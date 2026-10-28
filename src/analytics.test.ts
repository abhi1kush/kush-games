import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackEvent, trackGamePlay } from './analytics';

const g = globalThis as unknown as { window?: { umami?: unknown } };

describe('analytics', () => {
  afterEach(() => { vi.useRealTimers(); delete g.window; });

  it('sends game-play with the game id when umami is loaded', () => {
    const track = vi.fn();
    g.window = { umami: { track } };
    trackGamePlay('ember-lane');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('game-play', { game: 'ember-lane' });
  });

  it('waits for a late script, and no-ops safely when it never loads or throws', () => {
    vi.useFakeTimers();
    g.window = {};
    const track = vi.fn();
    trackEvent('game-play', { game: '2048' }, 1000, 100);
    vi.advanceTimersByTime(300);
    g.window.umami = { track };
    vi.advanceTimersByTime(100);
    expect(track).toHaveBeenCalledWith('game-play', { game: '2048' });

    g.window = {};
    expect(() => { trackEvent('x', {}, 500, 100); vi.advanceTimersByTime(2000); }).not.toThrow();
    g.window = { umami: { track: () => { throw new Error('blocked'); } } };
    expect(() => trackEvent('x', {})).not.toThrow();
  });

  it('cancel stops a pending send', () => {
    vi.useFakeTimers();
    g.window = {};
    const track = vi.fn();
    const cancel = trackEvent('x', {}, 1000, 100);
    cancel();
    g.window.umami = { track };
    vi.advanceTimersByTime(1000);
    expect(track).not.toHaveBeenCalled();
  });
});
