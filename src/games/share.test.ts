import { describe, expect, it, vi } from 'vitest';
import { gameLink, shareGameLink } from './share';

const live = { origin: 'https://abhi1kush.github.io', pathname: '/kush-games/' };

describe('game share link', () => {
  it('is the absolute play link on the hub', () => {
    expect(gameLink('mountain-climb', live)).toBe('https://abhi1kush.github.io/kush-games/#/play/mountain-climb');
  });

  it('uses the Web Share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareGameLink('mountain-climb', 'Mountain Climb', { share }, live)).toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Mountain Climb on Kush Games', url: 'https://abhi1kush.github.io/kush-games/#/play/mountain-climb' }));
  });

  it('copies the link when Web Share is missing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareGameLink('mountain-climb', 'Mountain Climb', { share: undefined as never, clipboard: { writeText } }, live)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://abhi1kush.github.io/kush-games/#/play/mountain-climb');
  });

  it('does not copy when the player cancels the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('cancel'), { name: 'AbortError' }));
    const writeText = vi.fn();
    expect(await shareGameLink('mountain-climb', 'Mountain Climb', { share, clipboard: { writeText } }, live)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });
});
