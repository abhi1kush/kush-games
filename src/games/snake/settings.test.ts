import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED_SETTING } from './game';
import { parseBestDetails, parseBestScore, parseSpeedSetting, serializeSpeedSetting } from './settings';

describe('speed setting persistence', () => {
  it('round-trips a setting', () => {
    const setting = { mode: 'constant' as const, constantSpeed: 'very-fast' as const };
    expect(parseSpeedSetting(serializeSpeedSetting(setting))).toEqual(setting);
  });

  it('falls back to the default for missing or bad data', () => {
    expect(parseSpeedSetting(null)).toEqual(DEFAULT_SPEED_SETTING);
    expect(parseSpeedSetting('not json')).toEqual(DEFAULT_SPEED_SETTING);
    expect(parseSpeedSetting('{"mode":"warp","constantSpeed":"ludicrous"}')).toEqual(DEFAULT_SPEED_SETTING);
    expect(parseSpeedSetting('{"mode":"constant"}')).toEqual({ mode: 'constant', constantSpeed: 'normal' });
  });
});

describe('best score persistence', () => {
  it('parses the best score safely (old numeric values still work)', () => {
    expect(parseBestScore('42')).toBe(42);
    expect(parseBestScore(null)).toBe(0);
    expect(parseBestScore('abc')).toBe(0);
    expect(parseBestScore('-5')).toBe(0);
  });

  it('parses best score details', () => {
    expect(parseBestDetails('{"speedLabel":"Constant · Fast","length":12}')).toEqual({ speedLabel: 'Constant · Fast', length: 12 });
    expect(parseBestDetails('{"speedLabel":3}')).toBeNull();
    expect(parseBestDetails('oops')).toBeNull();
    expect(parseBestDetails(null)).toBeNull();
  });
});
