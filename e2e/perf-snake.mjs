// Measures Snake rendering cost over ~5 s of play: React commits, DOM mutations and main-thread time.
// Usage: node e2e/perf-snake.mjs [url] [seconds]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const seconds = Number(process.argv[3] ?? 5);

export async function measureSnake(page, cdp, durationSeconds, rootSelector = '[data-testid=snake-game]') {
  await page.evaluate(selector => {
    window.__snakeMutations = { attributes: 0, structure: 0 };
    new MutationObserver(records => records.forEach(record => {
      if (record.type === 'attributes') window.__snakeMutations.attributes++; else window.__snakeMutations.structure++;
    }))
      .observe(document.querySelector(selector), { subtree: true, childList: true, attributes: true, characterData: true });
  }, rootSelector);
  await cdp.send('Performance.enable');
  const metricsOf = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
  const before = await metricsOf();
  const commitsBefore = await page.evaluate(() => window.__reactCommits ?? 0);
  await page.waitForTimeout(durationSeconds * 1000);
  const after = await metricsOf();
  const commits = (await page.evaluate(() => window.__reactCommits ?? 0)) - commitsBefore;
  const delta = name => after[name] - before[name];
  return {
    reactCommits: commits,
    ...(await page.evaluate(() => ({ attributeMutations: window.__snakeMutations.attributes, elementOrTextMutations: window.__snakeMutations.structure }))),
    scriptMs: Math.round(delta('ScriptDuration') * 1000),
    styleRecalcMs: Math.round(delta('RecalcStyleDuration') * 1000),
    layoutMs: Math.round(delta('LayoutDuration') * 1000),
    totalTaskMs: Math.round(delta('TaskDuration') * 1000),
    styleRecalcs: delta('RecalcStyleCount'),
    layouts: delta('LayoutCount'),
  };
}

/** Counts React commits through the DevTools hook (React calls it in production builds too). */
export const reactCommitCounterScript = () => {
  window.__reactCommits = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject(renderer) { this.renderers.set(1, renderer); return 1; },
    onCommitFiberRoot() { window.__reactCommits++; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    checkDCE() {},
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
    await context.addInitScript(reactCommitCounterScript);
    const page = await context.newPage();
    await page.goto(`${siteUrl}#/play/snake`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid=snake-start]');
    await page.keyboard.press('Space'); // snake goes straight; edges wrap, so it never dies
    await page.waitForTimeout(300);
    const cdp = await context.newCDPSession(page);
    const result = await measureSnake(page, cdp, seconds);
    console.log(JSON.stringify({ viewport: `${viewport.width}px`, seconds, ...result }));
    await context.close();
  }
  await browser.close();
}
