// Metro Dash smoke test: hub card (wasm not loaded on the hub), lazy wasm load, the start screen and controls card, lane
// changes with keys and mouse swipes (one press = one lane, snapped fast), a jump clearing a low barrier, a roll under a high
// barrier, coins, power-ups (magnet, super sneakers, 2×, hoverboard saving a crash), a side stumble then caught, a head-on
// crash → game over → Play again, pause (with the controls card), mute, a run restored paused through a reload, both hub
// themes, phone portrait and landscape (touch swipes, no overflow), frame times (also at 4× CPU slowdown), and a look-ahead
// bot running 150 s on several seeds without crashing (the track always leaves an open path).
// Usage: node e2e/metro-dash.mjs [siteUrl] [screenshotDirectory]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace/runner-shots/live';
mkdirSync(screenshotDirectory, { recursive: true });
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const gameUrl = `${siteUrl}?metroTest#/play/metro-dash`;
const SAVE_KEY = 'kush-games:metro-dash:save:v1';
const BEST_KEY = 'kush-games-metro-dash-best';
const THEME_KEY = 'kush-games:theme:save:v1';
// src/games/metrodash/engine.ts
const Phase = { ready: '0', playing: '1', crashed: '2', gameOver: '3' };
const Kind = { train: 0, movingTrain: 1, ramp: 2, lowBarrier: 3, highBarrier: 4, sign: 5, coin: 6, magnet: 7, sneakers: 8, multiplier: 9, hoverboard: 10 };
const Events = { stumble: 256, hoverboardBreak: 128, caught: 65536 };
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const watchErrors = page => {
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
};
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const game = (page, script, argument) => page.evaluate(([source, value]) => new Function('game', 'value', source)(window.__metroTest.game, value), [script, argument]);
const state = page => game(page, `return { phase: game.phase(), distance: game.distance(), score: game.score(), coins: game.coins(), lane: game.lane(), x: game.player_x(),
  y: game.player_y(), rolling: game.is_rolling(), stumbles: game.stumbles(), speed: game.speed(), magnet: game.magnet_seconds(), multiplier: game.multiplier(),
  sneakers: game.sneakers_seconds(), hoverboard: game.hoverboard_seconds() }`);
const phaseOf = page => page.getByTestId('metro-dash').getAttribute('data-phase');
const waitFor = async (predicate, timeout = 8000, interval = 30) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await predicate()) return true; await new Promise(resolve => setTimeout(resolve, interval)); }
  return false;
};
/** Highest value of an expression over `milliseconds`, sampled every frame in the page. */
const peak = (page, expression, milliseconds) => page.evaluate(([expression, milliseconds]) => new Promise(resolve => {
  const read = new Function('game', `return ${expression}`);
  const end = performance.now() + milliseconds;
  let highest = -Infinity;
  const step = () => { highest = Math.max(highest, read(window.__metroTest.game)); if (performance.now() < end) requestAnimationFrame(step); else resolve(highest); };
  step();
}), [expression, milliseconds]);
/** Events the game fired over `milliseconds` (wraps advance once, in the page). */
const collectEvents = (page, milliseconds) => page.evaluate(milliseconds => new Promise(resolve => {
  const target = window.__metroTest.game;
  const original = target.advance;
  let events = 0;
  target.advance = function (seconds) { const fired = original.call(this, seconds); events |= fired; return fired; };
  setTimeout(() => { target.advance = original; resolve(events); }, milliseconds);
}), milliseconds);
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return { frames: sorted.length, average: +(sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2), p95: +at(0.95).toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) };
};
const resetPerf = page => page.evaluate(() => { window.__metroTest.perf.count = 0; });
const readPerf = page => page.evaluate(() => {
  const { perf } = window.__metroTest;
  const length = Math.min(perf.count, perf.workMilliseconds.length);
  return { work: Array.from(perf.workMilliseconds.slice(0, length)), frame: Array.from(perf.frameMilliseconds.slice(0, length)) };
});
const sceneColors = page => page.evaluate(() => {
  const canvas = document.querySelector('[data-testid="metro-canvas"]');
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = new Set();
  let blank = 0, samples = 0;
  for (let index = 0; index < pixels.length; index += 4 * 13) {
    colors.add(`${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`);
    if (pixels[index] + pixels[index + 1] + pixels[index + 2] === 0) blank++;
    samples++;
  }
  return { distinct: colors.size, blankShare: blank / samples };
});
const shot = async (page, name) => {
  const path = `${screenshotDirectory}/${name}`;
  await page.screenshot({ path });
  console.log(`saved ${path}`);
};
/** An empty track ahead and the run going, not invincible, with the current lane known. */
const freshRun = async page => {
  await game(page, 'game.restart(7); game.debug_set_invincible(false); game.debug_set_autopilot(false); game.debug_clear_track()');
  await page.waitForTimeout(150);
};
const openGame = async page => {
  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('metro-canvas').waitFor();
  await page.waitForFunction(() => window.__metroTest);
};
/** A finger swipe through Chrome's touch input (fires real pointer events of type touch). */
const swipe = async (cdp, x, y, dx, dy) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 4; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 4, y: y + dy * step / 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

const browser = await chromium.launch({ executablePath: chromePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const report = {};
try {
  // ---------- hub ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  watchErrors(page);
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  check(!(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('metro_dash')))), 'the Metro Dash wasm is not loaded on the hub');
  const card = page.locator('img[src*="metro-dash"]').first();
  check(await card.count() > 0, 'hub shows the Metro Dash thumbnail');
  check(await page.getByText('Metro Dash').first().isVisible(), 'hub shows the Metro Dash card');
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, 'hub-card.png');

  // ---------- start screen ----------
  const loadStart = Date.now();
  await openGame(page);
  check(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('metro_dash'))), `the wasm loads when the game opens (${Date.now() - loadStart} ms)`);
  check(await phaseOf(page) === Phase.ready, 'opens on the start screen');
  const overlayText = await page.getByTestId('metro-overlay').textContent();
  check(overlayText.includes('METRO') && overlayText.includes('DASH'), 'title on the start screen');
  const controls = page.getByTestId('metro-controls');
  const controlsText = await controls.textContent();
  check(await controls.isVisible() && await controls.getAttribute('data-keys') === 'true'
    && ['Switch lanes', 'Jump', 'Roll', 'Pause', 'Mute', 'Start', 'Back to the hub', 'Magnet', 'Super jump', 'Double score', 'Hoverboard'].every(text => controlsText.includes(text)),
    'desktop: keyboard controls card on the start screen');
  const stageBox = await page.getByTestId('metro-canvas').boundingBox();
  check(stageBox.width >= 900 && Math.abs(stageBox.width / stageBox.height - 1.6) < 0.03, `desktop view ${Math.round(stageBox.width)}×${Math.round(stageBox.height)} (16:10)`);
  await page.waitForTimeout(600);
  await shot(page, 'start.png');

  await page.keyboard.press('Enter');
  check(await waitFor(async () => await phaseOf(page) === Phase.playing, 1500), 'Enter starts the run');
  await page.waitForTimeout(1200);
  const colors = await sceneColors(page);
  check(colors.distinct >= 40 && colors.blankShare < 0.01, `the scene is drawn (${colors.distinct} colours, ${(colors.blankShare * 100).toFixed(1)}% blank)`);
  const moving = await state(page);
  await page.waitForTimeout(800);
  const moved = await state(page);
  check(moved.distance > moving.distance + 6 && moved.score > moving.score, `runs forward on its own (${moving.distance.toFixed(0)} → ${moved.distance.toFixed(0)} m)`);

  // ---------- lanes ----------
  await freshRun(page);
  check((await state(page)).lane === 1, 'starts in the middle lane');
  await page.keyboard.press('ArrowRight');
  const snapStart = Date.now();
  check(await waitFor(async () => Math.abs((await state(page)).x - 2.5) < 0.02, 600, 10), `→ moves one lane right and snaps there (${Date.now() - snapStart} ms incl. polling)`);
  check((await state(page)).lane === 2, '… exactly one lane');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  check((await state(page)).lane === 2, '→ at the right wall just bumps');
  await page.keyboard.press('a');
  await page.waitForTimeout(80);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  check((await state(page)).lane === 0, 'A then ← (pressed quickly) take two lanes left');
  // mouse swipe on the game
  const centre = { x: stageBox.x + stageBox.width / 2, y: stageBox.y + stageBox.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 50, centre.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  check((await state(page)).lane === 1, 'a short mouse swipe right switches lane');

  // ---------- jump over a low barrier ----------
  await freshRun(page);
  await game(page, 'game.debug_spawn(3, 1, game.speed() * 0.32, 0, 0)');
  await page.keyboard.press('Space');
  const risingHeight = await peak(page, 'game.player_y()', 170);
  await shot(page, 'jump.png');
  const jumpHeight = Math.max(risingHeight, await peak(page, 'game.player_y()', 200));
  await page.waitForTimeout(800);
  let after = await state(page);
  check(jumpHeight > 1.2 && jumpHeight < 2 && after.phase === 1 && after.stumbles === 0, `Space jumps (peak ${jumpHeight.toFixed(2)} m) and clears a low barrier`);
  await freshRun(page);
  await game(page, 'game.debug_spawn(3, 1, 12, 0, 0)');
  check(await waitFor(async () => await phaseOf(page) !== Phase.playing, 3000), 'running into a low barrier without jumping ends the run');

  // ---------- roll under a high barrier ----------
  await freshRun(page);
  await game(page, 'game.debug_spawn(4, 1, game.speed() * 0.3, 0, 0); game.debug_spawn(5, 1, game.speed() * 0.3 + 1.5, 0, 0)');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(140);
  check((await state(page)).rolling, '↓ rolls');
  await shot(page, 'roll.png');
  await page.waitForTimeout(900);
  after = await state(page);
  check(after.phase === 1 && after.stumbles === 0, 'rolling passes under a high barrier and a sign');
  await freshRun(page);
  await game(page, 'game.debug_spawn(4, 1, 12, 0, 0)');
  check(await waitFor(async () => await phaseOf(page) !== Phase.playing, 3000), 'running into a high barrier standing up ends the run');

  // ---------- coins ----------
  await freshRun(page);
  await game(page, 'for (let index = 0; index < 6; index++) game.debug_spawn(6, 1, 6 + index * 2.2, 0.7, 0)');
  check(await waitFor(async () => await page.getByTestId('metro-coins').textContent() === '6', 3000), 'running through a line of coins collects them all (HUD 6)');
  const coinScore = await state(page);
  check(coinScore.score >= Math.floor(coinScore.distance) + 30, `coins add to the score (${coinScore.score} at ${coinScore.distance.toFixed(0)} m)`);

  // ---------- power-ups ----------
  await game(page, 'game.debug_spawn(7, 0, 8, 1, 0); for (let index = 0; index < 4; index++) game.debug_spawn(6, 0, 18 + index * 2, 0.7, 0)');
  await page.keyboard.press('ArrowLeft');
  check(await waitFor(async () => await page.getByTestId('metro-magnet').isVisible(), 2500), 'a magnet is picked up (HUD timer shows)');
  await page.keyboard.press('ArrowRight');
  check(await waitFor(async () => (await state(page)).coins >= 10, 3000), 'the magnet pulls in coins from the next lane');
  await game(page, 'game.debug_spawn(9, 1, 8, 1, 0)');
  check(await waitFor(async () => await page.getByTestId('metro-multiplier-badge').isVisible(), 2500) && (await state(page)).multiplier === 2, '2× score is picked up (×2 badge)');
  await game(page, 'game.debug_spawn(8, 1, 8, 1, 0)');
  check(await waitFor(async () => (await state(page)).sneakers > 0, 2500), 'super sneakers are picked up');
  await page.keyboard.press('ArrowUp');
  const superJump = await peak(page, 'game.player_y()', 900);
  check(superJump > 3.5, `with sneakers the jump goes higher than a train (${superJump.toFixed(2)} m)`);
  await page.waitForTimeout(900);
  await game(page, 'game.debug_activate(10); game.debug_spawn(0, game.lane(), 14, 0, 26)');
  const hoverEvents = await collectEvents(page, 1800);
  after = await state(page);
  check((hoverEvents & Events.hoverboardBreak) !== 0 && after.phase === 1, 'the hoverboard takes a head-on crash and the run goes on');
  await shot(page, 'powerups.png');

  // ---------- stumble, then caught ----------
  await freshRun(page);
  await game(page, 'game.debug_spawn(0, 0, 0.5, 0, 60)');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowLeft');
  const stumbleEvents = await collectEvents(page, 500);
  after = await state(page);
  check((stumbleEvents & Events.stumble) !== 0 && after.lane === 1 && after.phase === 1, 'switching into the side of a train is a stumble: bounced back, still running');
  await page.keyboard.press('ArrowLeft');
  const caughtEvents = await collectEvents(page, 2500);
  check((caughtEvents & Events.caught) !== 0 && await phaseOf(page) === Phase.gameOver, 'a second stumble straight after: the guard catches you');
  check((await page.getByTestId('metro-overlay').textContent()).includes('Caught'), '“Caught!” on the game-over screen');

  // ---------- head-on crash → game over → Play again ----------
  await freshRun(page);
  await page.waitForTimeout(1500);
  await game(page, 'game.debug_spawn(0, 1, 16, 0, 39)');
  check(await waitFor(async () => await phaseOf(page) === Phase.gameOver, 4000), 'a train head-on ends the run (game over)');
  const finalText = await page.getByTestId('metro-final-score').textContent();
  const best = await page.evaluate(key => Number(localStorage.getItem(key)), BEST_KEY);
  check(/Score \d+ · \d+ m/.test(finalText) && best > 0 && await page.getByTestId('metro-best').textContent() === String(best), `game over shows the score (${finalText}) and the best is kept (${best})`);
  check(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY) === null, 'a finished run leaves no save behind');
  await page.waitForTimeout(400);
  await shot(page, 'game-over.png');
  await page.getByTestId('metro-new-game').click();
  check(await waitFor(async () => await phaseOf(page) === Phase.playing, 1500) && (await state(page)).distance < 10, 'Play again starts a fresh run');

  // ---------- mid-run with trains and coins; pause, mute, reload ----------
  await game(page, 'game.restart(31); game.debug_set_autopilot(true)');
  await page.waitForTimeout(7000);
  await shot(page, 'desktop-run.png');
  check((await state(page)).phase === 1, 'the bot is still running after 7 s of real play');
  await page.keyboard.press('p');
  check(await page.getByTestId('metro-dash').getAttribute('data-paused') === 'true', 'P pauses');
  const pausedAt = (await state(page)).distance;
  await page.waitForTimeout(400);
  check((await state(page)).distance === pausedAt, 'nothing moves while paused');
  await page.getByTestId('metro-controls-toggle').click();
  check(await page.getByTestId('metro-pause-controls').isVisible(), 'the controls card opens on the pause screen');
  await page.keyboard.press('m');
  check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'true', 'M mutes');
  await page.keyboard.press('m');
  check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'false', 'M unmutes');
  check(await page.evaluate(key => localStorage.getItem(key) !== null, SAVE_KEY), 'pausing saves the run');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('metro-canvas').waitFor();
  await page.waitForFunction(() => window.__metroTest);
  const restored = await state(page);
  check(await page.getByTestId('restored').isVisible() && await page.getByTestId('metro-dash').getAttribute('data-paused') === 'true' && Math.abs(restored.distance - pausedAt) < 0.01,
    `a refresh brings the run back paused at the same spot (${pausedAt.toFixed(1)} m)`);
  await page.keyboard.press('p');
  await page.waitForTimeout(500);
  check((await state(page)).distance > pausedAt + 3, 'P carries on from there');

  // ---------- frame time ----------
  await game(page, 'game.restart(55); game.debug_set_autopilot(true); game.debug_set_invincible(true)');
  await page.waitForTimeout(500);
  await resetPerf(page);
  await page.waitForTimeout(5000);
  let perf = await readPerf(page);
  report.desktop = { work: summarize(perf.work), frame: summarize(perf.frame) };
  check(report.desktop.work.p95 < 6 && report.desktop.frame.average < 20, `desktop frame time: work p95 ${report.desktop.work.p95} ms, frame avg ${report.desktop.frame.average} ms`);
  const cdpDesktop = await desktop.newCDPSession(page);
  await cdpDesktop.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await resetPerf(page);
  await page.waitForTimeout(5000);
  perf = await readPerf(page);
  report.slowCpu = { work: summarize(perf.work), frame: summarize(perf.frame) };
  await cdpDesktop.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check(report.slowCpu.work.p95 < 16.7 && report.slowCpu.frame.average < 20, `4× slower CPU: work p95 ${report.slowCpu.work.p95} ms, frame avg ${report.slowCpu.frame.average} ms (60 fps)`);

  // ---------- a fair path: the bot runs 150 s on several seeds (simulated in the page, paused screen) ----------
  await page.keyboard.press('p');
  const botRuns = await page.evaluate(() => {
    const { game } = window.__metroTest;
    const results = [];
    for (const seed of [3, 17, 2026, 90210]) {
      game.restart(seed);
      game.debug_set_invincible(false);
      game.debug_set_autopilot(true);
      for (let frame = 0; frame < 150 * 60 && game.phase() === 1; frame++) game.advance(1 / 60);
      results.push({ seed, phase: game.phase(), distance: Math.round(game.distance()), coins: game.coins(), stumbles: game.stumbles(), speed: +game.speed().toFixed(1) });
    }
    game.debug_set_autopilot(false);
    return results;
  });
  for (const run of botRuns) check(run.phase === 1 && run.distance > 2000, `bot run, seed ${run.seed}: still running after 150 s, ${run.distance} m, ${run.coins} coins, ${run.stumbles} stumbles, ${run.speed} m/s`);
  report.bot = botRuns;

  // ---------- themes ----------
  const themeColors = async () => {
    await page.goto(siteUrl, { waitUntil: 'networkidle' });
    await page.evaluate(key => localStorage.removeItem(key), SAVE_KEY);
    await openGame(page);
    return page.evaluate(() => ({ theme: document.documentElement.dataset.theme ?? 'netflix-red', pill: getComputedStyle(document.querySelector('.metro-dash__hint')).backgroundColor,
      stage: getComputedStyle(document.querySelector('.metro-dash__stage') ?? document.body).boxShadow }));
  };
  await page.evaluate(([themeKey, saveKey]) => { localStorage.removeItem(themeKey); localStorage.removeItem(saveKey); }, [THEME_KEY, SAVE_KEY]);
  const lagoon = await themeColors();
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), data: { theme: 'netflix-red' } })), THEME_KEY);
  const red = await themeColors();
  check(lagoon.theme === 'lagoon' && red.theme === 'netflix-red' && lagoon.pill !== red.pill, `the start pill follows the hub theme (Lagoon ${lagoon.pill}, Netflix Red ${red.pill})`);
  await shot(page, 'start-netflix-red.png');
  await page.evaluate(key => localStorage.removeItem(key), THEME_KEY);
  await desktop.close();

  // ---------- phones ----------
  for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    const phone = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const phonePage = await phone.newPage();
    watchErrors(phonePage);
    await openGame(phonePage);
    const cdp = await phone.newCDPSession(phonePage);
    const box = await phonePage.getByTestId('metro-canvas').boundingBox();
    check(await noOverflow(phonePage) && box.y + box.height <= viewport.height + 1 && box.width <= viewport.width,
      `${label}: the game fits the screen (${Math.round(box.width)}×${Math.round(box.height)} at y ${Math.round(box.y)}), no sideways scroll`);
    const touchCard = phonePage.getByTestId('metro-controls');
    check(await touchCard.getAttribute('data-touch') === 'true' && (await touchCard.textContent()).includes('Swipe anywhere'), `${label}: the start screen shows the swipe controls`);
    if (label === 'portrait') await shot(phonePage, 'start-phone-portrait.png');
    const middle = { x: box.x + box.width / 2, y: box.y + box.height * 0.6 };
    await swipe(cdp, middle.x, middle.y, 0, -40);
    check(await waitFor(async () => await phaseOf(phonePage) === Phase.playing, 1500), `${label}: a swipe starts the run`);
    await game(phonePage, 'game.debug_set_invincible(false); game.debug_clear_track()');
    await phonePage.waitForTimeout(200);
    await swipe(cdp, middle.x, middle.y, -36, 4);
    await phonePage.waitForTimeout(250);
    check((await state(phonePage)).lane === 0, `${label}: a short swipe left changes lane`);
    await swipe(cdp, middle.x, middle.y, 36, -3);
    await swipe(cdp, middle.x, middle.y, 36, 2);
    await phonePage.waitForTimeout(300);
    check((await state(phonePage)).lane === 2, `${label}: two quick swipes right go two lanes`);
    await swipe(cdp, middle.x, middle.y, 3, -36);
    check(await peak(phonePage, 'game.player_y()', 400) > 1, `${label}: a swipe up jumps`);
    await phonePage.waitForTimeout(500);
    await swipe(cdp, middle.x, middle.y, 2, 36);
    await phonePage.waitForTimeout(80);
    check((await state(phonePage)).rolling, `${label}: a swipe down rolls`);
    await game(phonePage, 'game.restart(31); game.debug_set_autopilot(true); game.debug_set_invincible(true)');
    await phonePage.waitForTimeout(6500);
    await resetPerf(phonePage);
    await phonePage.waitForTimeout(3000);
    const phonePerf = await readPerf(phonePage);
    report[label] = { work: summarize(phonePerf.work), frame: summarize(phonePerf.frame) };
    check(report[label].work.p95 < 8, `${label}: frame work p95 ${report[label].work.p95} ms`);
    await shot(phonePage, `phone-${label}-run.png`);
    check(await noOverflow(phonePage), `${label}: still no sideways scroll mid-run`);
    await phone.close();
  }
} finally {
  await browser.close();
}
const realErrors = pageErrors.filter(error => !error.includes('favicon'));
check(realErrors.length === 0, `no page errors${realErrors.length ? `: ${realErrors.join(' | ')}` : ''}`);
console.log(JSON.stringify(report));
console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
