// Pralay Run e2e: hub card + thumbnail (wasm not loaded on the hub), title screen with the controls card, running,
// jumping and a double jump with real keys, shooting a shade, pause (controls card), the Pralay ending an idle run,
// the game-over card, the best run surviving a reload, quick restart, mute, and phones in portrait/landscape with
// touch buttons (no sideways overflow, buttons on screen).
// Usage: node e2e/pralay-run.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const shots = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const testUrl = `${siteUrl}?pralayTest#/play/pralay-run`;
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
const pageErrors = [];
const watch = page => {
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
};
const waitFor = async (predicate, timeout = 8000, interval = 50) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await predicate()) return true; await new Promise(resolve => setTimeout(resolve, interval)); }
  return false;
};
const state = page => page.evaluate(() => { const g = window.__pralayTest.game(); return { phase: g.phase(), x: g.hero_x(), y: g.hero_y(), hp: g.hp(), kills: g.kills(), distance: g.distance(), score: g.score(), voidX: g.void_x() }; });

const browser = await chromium.launch({ executablePath: chromePath, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  watch(page);
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.removeItem('kush-games-pralay-run-best'); localStorage.setItem('kush-games-muted', 'true'); });
  check(!(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('pralay_run')))), 'the Pralay Run wasm is not loaded on the hub');
  check(await page.locator('img[src*="pralay-run"]').count() > 0, 'hub shows the Pralay Run thumbnail');

  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('pralay-start').waitFor({ timeout: 20000 });
  check(await page.getByRole('heading', { name: 'Pralay Run' }).isVisible(), 'title card shows the game name');
  check(await page.getByTestId('pralay-controls').isVisible(), 'start screen shows the controls card');
  check(!(await page.getByTestId('pralay-best').count()), 'no best run on a fresh browser');
  await page.screenshot({ path: `${shots}/kush-games-pralay-start.png` });

  // Space starts the run; hold → to run
  await page.keyboard.press('Space');
  await waitFor(async () => (await page.getByTestId('pralay-run').getAttribute('data-phase')) === '1');
  check(!(await page.getByTestId('pralay-overlay').count()), 'Space starts the run (overlay gone)');
  const start = await state(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  const moved = await state(page);
  check(moved.x > start.x + 50, `holding → runs forward (${start.x.toFixed(0)} → ${moved.x.toFixed(0)})`);
  check(Number(await page.getByTestId('pralay-distance').textContent()) > 0, 'the HUD shows the distance');
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  const jumped = await state(page);
  check(jumped.y < moved.y - 10, 'Space jumps');
  await page.keyboard.press('Space');
  await page.waitForTimeout(160);
  check((await state(page)).y < jumped.y - 4, 'Space in the air double-jumps higher');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(900);

  // a shade straight ahead on flat ground: two light bolts drop it
  await page.evaluate(() => { const g = window.__pralayTest.game(); g.debug_flatten(g.hero_x() + 900); g.debug_set_void(g.hero_x() - 400); g.debug_spawn(0, g.hero_x() + 90); });
  await page.keyboard.down('j');
  await waitFor(async () => (await state(page)).kills >= 1, 3000);
  await page.keyboard.up('j');
  const afterShot = await state(page);
  check(afterShot.kills === 1 && afterShot.hp === 3, `J shoots a shade down without getting hurt (kills ${afterShot.kills}, hp ${afterShot.hp})`);
  check(afterShot.score >= 50, `a kill scores (${afterShot.score})`);
  await page.screenshot({ path: `${shots}/kush-games-pralay-desktop.png` });

  // pause shows the controls card; the world stops
  await page.keyboard.press('p');
  await page.getByTestId('pralay-resume').waitFor();
  await page.getByTestId('pralay-controls-toggle').click();
  check(await page.getByTestId('pralay-pause-controls').isVisible(), 'pause shows the controls card');
  const paused = await state(page);
  await page.waitForTimeout(500);
  check((await state(page)).voidX === paused.voidX, 'nothing moves while paused');
  await page.screenshot({ path: `${shots}/kush-games-pralay-paused.png` });
  await page.keyboard.press('p');
  await waitFor(async () => !(await page.getByTestId('pralay-overlay').count()));

  // stand still: the Pralay catches up and ends the run
  await page.evaluate(() => { const g = window.__pralayTest.game(); g.debug_set_void(g.hero_x() - 60); });
  check(await waitFor(async () => (await page.getByTestId('pralay-run').getAttribute('data-phase')) === '3', 10000), 'standing still, the Pralay swallows Aru (game over)');
  await page.getByTestId('pralay-result').waitFor();
  const finalScore = Number(await page.getByTestId('pralay-final-score').textContent());
  check(finalScore > 0, `the game-over card shows the score (${finalScore})`);
  await page.screenshot({ path: `${shots}/kush-games-pralay-over.png` });

  // best run survives a reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('pralay-best').waitFor({ timeout: 20000 });
  check((await page.getByTestId('pralay-best').textContent()).includes(String(finalScore)), 'the best run is remembered after a refresh');

  // quick restart: start, die, R runs again at once
  await page.getByTestId('pralay-start').click();
  await page.evaluate(() => { const g = window.__pralayTest.game(); g.debug_set_void(g.hero_x()); });
  await waitFor(async () => (await page.getByTestId('pralay-run').getAttribute('data-phase')) === '3', 6000);
  await page.waitForTimeout(500);
  await page.keyboard.press('r');
  check(await waitFor(async () => (await page.getByTestId('pralay-run').getAttribute('data-phase')) === '1', 2000), 'R starts a new run right away');
  const fresh = await state(page);
  check(fresh.hp === 3 && fresh.distance === 0, 'the new run starts fresh');

  // mute toggles and is shared
  const muted = await page.evaluate(() => localStorage.getItem('kush-games-muted'));
  await page.keyboard.press('m');
  check(await page.evaluate(() => localStorage.getItem('kush-games-muted')) !== muted, 'M toggles mute');
  await desktop.close();

  // ---------- phones ----------
  for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    const phone = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const mobile = await phone.newPage();
    watch(mobile);
    await mobile.goto(testUrl, { waitUntil: 'networkidle' });
    await mobile.getByTestId('pralay-start').waitFor({ timeout: 20000 });
    check(await mobile.getByTestId('pralay-controls-touch').isVisible(), `${name}: the controls card explains the touch buttons`);
    await mobile.screenshot({ path: `${shots}/kush-games-pralay-${name}-start.png` });
    await mobile.getByTestId('pralay-start').tap();
    await waitFor(async () => (await mobile.getByTestId('pralay-run').getAttribute('data-phase')) === '1');
    for (const id of ['touch-left', 'touch-right', 'touch-dash', 'touch-fire', 'touch-jump']) {
      const box = await mobile.getByTestId(id).boundingBox();
      check(box && box.x >= 0 && box.x + box.width <= viewport.width + 0.5 && box.y + box.height <= viewport.height + 0.5, `${name}: ${id} is on screen`);
    }
    const before = await state(mobile);
    const right = await mobile.getByTestId('touch-right').boundingBox();
    const client = await phone.newCDPSession(mobile);
    const point = { x: right.x + right.width / 2, y: right.y + right.height / 2 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await mobile.waitForTimeout(700);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await state(mobile);
    check(after.x > before.x + 40, `${name}: holding ▶ runs (${before.x.toFixed(0)} → ${after.x.toFixed(0)})`);
    await mobile.getByTestId('touch-jump').tap();
    await mobile.waitForTimeout(120);
    check((await state(mobile)).y < after.y - 5, `${name}: JUMP jumps`);
    check(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no sideways overflow`);
    await mobile.screenshot({ path: `${shots}/kush-games-pralay-${name}.png` });
    await phone.close();
  }
} finally {
  await browser.close();
}
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
