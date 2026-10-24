import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, parseThemeSave, THEME_STORAGE_KEY, THEMES } from './theme';

const readText = (path: string) => new TextDecoder().decode(readFileSync(new URL(path, import.meta.url)));
const css = readText('./styles.css');
const html = readText('../index.html');

/** The custom properties declared in one `selector { … }` block of styles.css. */
function themeVariables(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(match => [match[1], match[2].toLowerCase()]));
}
const luminance = (hex: string) => {
  const [red, green, blue] = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (first: string, second: string) => {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

describe('colour themes', () => {
  it('Lagoon is the default and uses exactly the requested palette', () => {
    expect(DEFAULT_THEME).toBe('lagoon');
    expect(THEMES.map(theme => theme.id)).toEqual(['lagoon', 'netflix-red']);
    const lagoon = themeVariables(':root[data-theme="lagoon"]');
    expect([lagoon.background, lagoon.surface, lagoon.brand, lagoon.highlight, lagoon.primary]).toEqual(['#163235', '#106967', '#4fbc9c', '#32bfda', '#efca7c']);
    expect(THEMES[0].swatches).toEqual(['#163235', '#106967', '#4fbc9c', '#32bfda', '#efca7c']);
  });

  it('Lagoon text meets WCAG AA (4.5:1) on its backgrounds', () => {
    const lagoon = themeVariables(':root[data-theme="lagoon"]');
    const pairs: [string, string][] = [
      ['text', 'background'], ['text', 'surface'], ['muted', 'background'], ['muted', 'surface'], ['faint', 'surface'], ['success', 'surface'],
      ['on-primary', 'primary'], ['on-badge', 'badge'], ['on-action', 'action'], ['link', 'background'], ['brand', 'background'], ['highlight', 'background'],
    ];
    for (const [text, background] of pairs) expect(contrast(lagoon[text], lagoon[background]), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
  });

  it('saved choices are validated, and index.html reads the same versioned key before first paint', () => {
    expect(parseThemeSave({ theme: 'lagoon' })).toEqual({ theme: 'lagoon' });
    expect(parseThemeSave({ theme: 'hot-pink' })).toBeNull();
    expect(parseThemeSave('lagoon')).toBeNull();
    expect(THEME_STORAGE_KEY).toBe('kush-games:theme:save:v1');
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(html).toContain("s.data.theme==='netflix-red'");
    expect(html).toContain('<html lang="en" data-theme="lagoon">');
    expect(html).toContain('<meta name="theme-color" content="#163235" />');
  });

  it('every theme has its favicon files; the page ships Lagoon icons and the pre-paint script swaps them for a saved red choice', () => {
    const publicFile = (name: string) => readFileSync(new URL(`../public/${name}`, import.meta.url));
    for (const theme of THEMES) {
      for (const name of [`favicon${theme.iconSuffix}.svg`, `favicon${theme.iconSuffix}-32.png`, `apple-touch-icon${theme.iconSuffix}.png`]) expect(publicFile(name).length, name).toBeGreaterThan(200);
    }
    const script = html.indexOf('<script>');
    for (const id of ['favicon-png', 'favicon-svg', 'apple-touch-icon']) {
      expect(html.indexOf(`id="${id}"`), id).toBeGreaterThan(0);
      expect(html.indexOf(`id="${id}"`), id).toBeLessThan(script);
    }
    for (const file of ['favicon-lagoon-32.png?v=5', 'favicon-lagoon.svg?v=5', 'apple-touch-icon-lagoon.png?v=5']) expect(html).toContain(file); // default icons
    expect(html).toContain("l.href.replace('-lagoon','')");
  });
});
