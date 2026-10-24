// Mithai Match smoke test: hub card (wasm not loaded on the hub), the start screen with its controls card, the level map,
// tap-tap and drag swaps, an invalid swap sliding back, specials and a special+special combo, winning a level (stars, the
// next level unlocking, progress surviving a reload), losing, pause (with the controls card) and mute, idle frames not
// redrawn, a frame-time perf sample (normal and 4× CPU throttling), and the phone layouts (portrait taps + swipes, landscape).
// Usage: node e2e/mithai-match.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const gameUrl = `${siteUrl}?mithaiTest#/play/mithai-match`;
const SAVE_KEY = 'kush-games:mithai-match:save:v1';
const Phase = { Ready: 0, Idle: 1, SwapBack: 3, Won: 7, Lost: 8 };
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const game = (page, script, argument) => page.evaluate(([source, value]) => new Function('game', 'value', source)(window.__mithaiTest.game, value), [script, argument]);
const phase = page => game(page, 'return game.phase()');
const waitFor = async (predicate, timeout = 8000, interval = 40) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await predicate()) return true; await new Promise(resolve => setTimeout(resolve, interval)); }
  return false;
};
const waitIdle = page => waitFor(async () => [Phase.Idle, Phase.Won, Phase.Lost].includes(await phase(page)), 10000);
const watchErrors = page => {
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
};
const cellCentre = async (page, cell) => {
  const box = await page.getByTestId('mithai-canvas').boundingBox();
  const size = box.width / 8;
  return { x: box.x + (cell % 8 + 0.5) * size, y: box.y + (Math.floor(cell / 8) + 0.5) * size, size };
};
const hint = async page => { const move = await game(page, 'return game.hint_move()'); return [Math.floor(move / 64), move % 64]; };
const dragMouse = async (page, from, to) => {
  const a = await cellCentre(page, from), b = await cellCentre(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
};
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return { frames: sorted.length, average: +(sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2), p95: +at(0.95).toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) };
};
const openLevel = async (page, number) => {
  if (await page.getByTestId('mithai-play').isVisible().catch(() => false)) await page.getByTestId('mithai-play').click();
  if (await page.getByTestId('mithai-map-button').isVisible().catch(() => false)) await page.getByTestId('mithai-map-button').click();
  await page.getByTestId(`mithai-level-${number}`).click();
  await page.getByTestId('mithai-start').click();
  await waitFor(async () => await phase(page) === Phase.Idle, 3000);
};
// keep playing hinted moves straight through the wasm API for `milliseconds` (busy board for perf sampling)
const autoplay = (page, milliseconds) => page.evaluate(milliseconds => new Promise(resolve => {
  const { game } = window.__mithaiTest;
  const end = performance.now() + milliseconds;
  const step = () => {
    if (game.phase() === 1) {
      game.debug_set_moves(30);
      const move = game.hint_move();
      if (move >= 0) { game.tap(Math.floor(move / 64)); game.tap(move % 64); }
    }
    if (game.phase() === 7 || game.phase() === 8) game.start_level(game.level(), 99);
    if (game.phase() === 0) game.begin();
    if (performance.now() < end) requestAnimationFrame(step); else resolve();
  };
  step();
}), milliseconds);

const browser = await chromium.launch({ executablePath: chromePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const perfReport = {};
try {
  // ---------- desktop ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  watchErrors(page);
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  check(!(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('mithai_match')))), 'the Mithai Match wasm is not loaded on the hub');
  check(await page.locator('img[src*="mithai-match"]').count() > 0, 'hub shows the Mithai Match thumbnail');
  check(await page.getByText('Mithai Match').first().isVisible(), 'hub shows the Mithai Match card');
  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('mithai-title').waitFor();
  check(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('mithai_match'))), 'the wasm loads when the game opens');
  const controlsText = await page.getByTestId('mithai-controls').textContent();
  check(['swap', 'drag', 'Pause', 'Mute', 'Back to the hub', 'striped', 'wrapped', 'sprinkle bomb'].every(text => controlsText.includes(text)), 'start screen controls card: click/drag swap, P, M, Esc, specials legend');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-match3-start-desktop.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-match3-start-desktop.png`);

  await page.getByTestId('mithai-play').click();
  check(await page.getByTestId('mithai-map').isVisible(), 'Play opens the level map');
  check(await page.getByTestId('mithai-level-1').isEnabled() && await page.getByTestId('mithai-level-2').isDisabled(), 'level 1 open, level 2 locked on a fresh save');
  await page.getByTestId('mithai-level-1').click();
  check((await page.getByTestId('mithai-overlay').textContent()).includes('Score 1,500'), 'level intro shows the goal');
  await page.getByTestId('mithai-start').click();
  check(await waitFor(async () => await phase(page) === Phase.Idle, 2000), 'Start begins the level');
  const canvasBox = await page.getByTestId('mithai-canvas').boundingBox();
  check(canvasBox.width >= 480 && Math.abs(canvasBox.width - canvasBox.height) < 2, `desktop board ${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)} (square)`);

  // tap-tap swap
  let moves = await game(page, 'return game.moves_left()');
  let [a, b] = await hint(page);
  let point = await cellCentre(page, a);
  await page.mouse.click(point.x, point.y);
  check(await game(page, 'return window.__mithaiTest.views()[8]') === a, 'clicking a sweet selects it');
  point = await cellCentre(page, b);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(100);
  await waitIdle(page);
  check(await game(page, 'return game.moves_left()') === moves - 1 && await game(page, 'return game.score()') > 0, 'click + click on a neighbour swaps, matches, scores and spends a move');
  check(await page.getByTestId('mithai-moves').textContent() === String(moves - 1), 'HUD shows the moves left');

  // drag swap
  moves -= 1;
  [a, b] = await hint(page);
  await dragMouse(page, a, b);
  await page.waitForTimeout(100);
  await waitIdle(page);
  check(await game(page, 'return game.moves_left()') === moves - 1, 'dragging a sweet onto its neighbour swaps it');
  moves -= 1;
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-match3-desktop.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-match3-desktop.png`);

  // idle board isn't redrawn (until the hint starts pulsing after 5 s)
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__mithaiTest.perf.draws = 0; });
  await page.waitForTimeout(1500);
  const idleDraws = await page.evaluate(() => window.__mithaiTest.perf.draws);
  check(idleDraws <= 2, `a settled board is not redrawn (${idleDraws} draws in 1.5 s)`);
  check(await waitFor(async () => await game(page, 'return window.__mithaiTest.views()[11]') === 1, 6000), 'a hint pulses after a few idle seconds');

  // invalid swap: two same-colour neighbours (swapping them changes nothing) slide back, no move spent
  const pair = await game(page, `for (let cell = 0; cell < 64; cell++) { if (cell % 8 < 7 && game.colour_at(cell) < 6 && game.colour_at(cell) === game.colour_at(cell + 1) && game.special_at(cell) === 0 && game.special_at(cell + 1) === 0) return cell; } return -1;`);
  if (pair >= 0) {
    await dragMouse(page, pair, pair + 1);
    check(await waitFor(async () => await phase(page) === Phase.SwapBack, 1000, 10), 'a swap that makes no line animates back');
    await waitIdle(page);
    check(await game(page, 'return game.moves_left()') === moves, 'the invalid swap costs no move');
  } else check(false, 'found two same-colour neighbours for the invalid-swap test');

  // specials: show one of each, then fire a striped + wrapped combo
  await game(page, 'game.debug_place(36, 2, 1); game.debug_place(45, 4, 2); game.debug_place(54, 5, 3); game.debug_place(62, 0, 4); game.debug_place(0, 0, 1); game.debug_place(1, 3, 3); window.__mithaiTest.redraw();');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-match3-specials.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-match3-specials.png`);
  const scoreBefore = await game(page, 'return game.score()');
  await dragMouse(page, 0, 1);
  await page.waitForTimeout(120);
  await page.screenshot({ path: '/tmp/kush-games-match3-combo.png' });
  await waitIdle(page);
  check(await game(page, 'return game.score()') - scoreBefore > 500, 'swapping a striped sweet with a wrapped one sets off a big combo');

  // pause with the controls card, mute
  await page.keyboard.press('p');
  check(await page.getByTestId('mithai').getAttribute('data-paused') === 'true', 'P pauses');
  await page.getByTestId('mithai-controls-toggle').click();
  check(await page.getByTestId('mithai-pause-controls').isVisible(), 'the controls card opens from the pause screen');
  await page.keyboard.press('p');
  check(await page.getByTestId('mithai').getAttribute('data-paused') === 'false', 'P resumes');
  await page.keyboard.press('m');
  check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'true', 'M mutes');
  await page.keyboard.press('m');

  // win: nearly there, one more match finishes level 1
  await waitIdle(page);
  await game(page, 'game.debug_set_score(2990);');
  [a, b] = await hint(page);
  await dragMouse(page, a, b);
  check(await waitFor(async () => await page.getByTestId('mithai-result-stars').isVisible().catch(() => false), 8000), 'winning shows the level-complete card');
  const stars = Number(await page.getByTestId('mithai-result-stars').getAttribute('data-stars'));
  check(stars >= 1 && stars <= 3, `level complete with ${stars} star(s)`);
  await page.getByTestId('mithai-to-map').click();
  check(await page.getByTestId('mithai-level-2').isEnabled(), 'level 2 unlocks on the map');
  check(Number(await page.getByTestId('mithai-level-1-stars').getAttribute('data-stars')) === stars, 'the map shows level 1 stars');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('mithai-play').click();
  check(await page.getByTestId('mithai-level-2').isEnabled() && Number(await page.getByTestId('mithai-level-1-stars').getAttribute('data-stars')) === stars, 'progress survives a reload');

  // lose: one move left on level 2
  await page.getByTestId('mithai-level-2').click();
  await page.getByTestId('mithai-start').click();
  await waitFor(async () => await phase(page) === Phase.Idle, 2000);
  await game(page, 'game.debug_set_moves(1);');
  [a, b] = await hint(page);
  await dragMouse(page, a, b);
  check(await waitFor(async () => await page.getByTestId('mithai-retry').isVisible().catch(() => false), 8000), 'running out of moves shows Out of moves / Try again');
  await page.getByTestId('mithai-retry').click();
  check(await waitFor(async () => await phase(page) === Phase.Ready && await page.getByTestId('mithai-moves').textContent() === '18', 2000), 'Try again restarts the level');
  await page.getByTestId('mithai-start').click();

  // perf: keep the board busy with cascades, normal then 4× CPU slowdown
  const sample = async milliseconds => {
    await page.evaluate(() => { window.__mithaiTest.perf.count = 0; });
    await autoplay(page, milliseconds);
    return page.evaluate(() => {
      const { perf } = window.__mithaiTest;
      const length = Math.min(perf.count, perf.workMilliseconds.length);
      return { work: Array.from(perf.workMilliseconds.slice(0, length)), frame: Array.from(perf.frameMilliseconds.slice(0, length)) };
    });
  };
  const normal = await sample(4000);
  const cdp = await desktop.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const throttled = await sample(4000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  perfReport.normal = { work: summarize(normal.work), frame: summarize(normal.frame) };
  perfReport.throttled4x = { work: summarize(throttled.work), frame: summarize(throttled.frame) };
  console.log(`PERF ${JSON.stringify(perfReport)}`);
  check(perfReport.normal.work.p95 < 4, `simulate + draw p95 ${perfReport.normal.work.p95} ms per frame (desktop)`);
  check(perfReport.throttled4x.work.p95 < 12, `simulate + draw p95 ${perfReport.throttled4x.work.p95} ms per frame at 4× CPU slowdown (budget 16.7 ms)`);
  check(perfReport.throttled4x.frame.average < 22, `frame interval ${perfReport.throttled4x.frame.average} ms average at 4× CPU slowdown`);

  // level map screenshot with some progress (written straight into the save)
  await page.evaluate(([key]) => {
    const stars = [3, 3, 2, 3, 2, 1, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), data: { unlocked: 8, stars, best: stars.map(count => count * 2000) } }));
  }, [SAVE_KEY]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('mithai-play').click();
  check(await page.getByTestId('mithai-level-9').isEnabled() && await page.getByTestId('mithai-level-10').isDisabled(), 'the map follows the saved progress');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-match3-levels.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-match3-levels.png`);
  check(await noOverflow(page), 'no horizontal scroll on desktop');

  // theme switch: board chrome follows the Netflix Red theme
  const lagoonNode = await page.getByTestId('mithai-level-1').evaluate(node => getComputedStyle(node).borderColor);
  const previousTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'netflix-red'));
  await page.getByTestId('mithai-level-1').click();
  await page.getByTestId('mithai-start').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/kush-games-match3-netflix.png' });
  await page.getByTestId('mithai-map-button').click();
  check(await page.getByTestId('mithai-level-1').evaluate(node => getComputedStyle(node).borderColor) !== lagoonNode, 'the map and board chrome follow the hub theme');
  await page.evaluate(theme => { if (theme) document.documentElement.setAttribute('data-theme', theme); else document.documentElement.removeAttribute('data-theme'); }, previousTheme);

  // ---------- phone, portrait ----------
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await phone.newPage();
  watchErrors(mobile);
  await mobile.goto(gameUrl, { waitUntil: 'networkidle' });
  await mobile.getByTestId('mithai-title').waitFor();
  check(await noOverflow(mobile), 'no horizontal scroll at 375 px (title)');
  check(await mobile.getByTestId('mithai-controls-touch').isVisible(), 'phone start screen explains tap and swipe');
  await mobile.getByTestId('mithai-play').tap();
  check(await noOverflow(mobile), 'no horizontal scroll at 375 px (map)');
  await mobile.getByTestId('mithai-level-1').tap();
  await mobile.getByTestId('mithai-start').tap();
  await waitFor(async () => await phase(mobile) === Phase.Idle, 2000);
  const phoneBox = await mobile.getByTestId('mithai-canvas').boundingBox();
  check(phoneBox.width >= 340 && phoneBox.y + phoneBox.height <= 667, `phone board ${Math.round(phoneBox.width)} px wide, fully on screen`);
  check(await noOverflow(mobile), 'no horizontal scroll at 375 px (playing)');
  moves = await game(mobile, 'return game.moves_left()');
  [a, b] = await hint(mobile);
  point = await cellCentre(mobile, a);
  await mobile.touchscreen.tap(point.x, point.y);
  point = await cellCentre(mobile, b);
  await mobile.touchscreen.tap(point.x, point.y);
  await mobile.waitForTimeout(100);
  await waitIdle(mobile);
  check(await game(mobile, 'return game.moves_left()') === moves - 1, 'tap + tap swaps on a phone');
  [a, b] = await hint(mobile);
  const from = await cellCentre(mobile, a), to = await cellCentre(mobile, b);
  const touchCdp = await phone.newCDPSession(mobile);
  await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let step = 1; step <= 4; step++) {
    await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 4, y: from.y + (to.y - from.y) * step / 4 }] });
  }
  await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForTimeout(100);
  await waitIdle(mobile);
  check(await game(mobile, 'return game.moves_left()') === moves - 2, 'swiping a sweet swaps it on a phone');
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: `${screenshotDirectory}/kush-games-match3-mobile.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-match3-mobile.png`);
  await mobile.getByTestId('mithai-pause').tap();
  await mobile.getByTestId('mithai-controls-toggle').tap();
  check(await mobile.getByTestId('mithai-pause-controls').isVisible() && await noOverflow(mobile), 'phone pause screen opens the controls card');

  // ---------- phone, landscape ----------
  const sideways = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const landscape = await sideways.newPage();
  watchErrors(landscape);
  await landscape.goto(gameUrl, { waitUntil: 'networkidle' });
  await landscape.getByTestId('mithai-title').waitFor();
  check(await noOverflow(landscape), 'no horizontal scroll in landscape (title)');
  await landscape.getByTestId('mithai-play').tap();
  await landscape.getByTestId('mithai-level-1').tap();
  await landscape.getByTestId('mithai-start').tap();
  const sideBox = await landscape.getByTestId('mithai-canvas').boundingBox();
  check(sideBox.height >= 280 && sideBox.y + sideBox.height <= 392, `landscape board ${Math.round(sideBox.width)} px, fully on screen`);
  check(await noOverflow(landscape), 'no horizontal scroll in landscape (playing)');
  await landscape.screenshot({ path: '/tmp/mithai-landscape.png' });
} catch (error) {
  check(false, `unexpected error: ${error.stack ?? error}`);
} finally {
  await browser.close();
}
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
