// Alpine Sled smoke test: hub card (wasm not loaded on the hub), lazy wasm load, the 3D scene really drawn (colour variety,
// sky over snow, the sled in front), start, steering both ways, jumping off the snow, a ramp launch over obstacles with the
// air stars, gifts and the shield, distance and score rising, pause (with the controls card), mute, a run restored paused
// through a reload, a crash into a pine ending the run and Play again starting clean, frame times (also at 4× CPU slowdown),
// both hub themes, and the phone layouts (portrait with drag pad + JUMP, swipe-up and drag on the slope; landscape).
// Usage: node e2e/alpine-sled.mjs [siteUrl] [screenshotDirectory]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace/sled-shots';
mkdirSync(screenshotDirectory, { recursive: true });
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const gameUrl = `${siteUrl}?sledTest#/play/alpine-sled`;
const SAVE_KEY = 'kush-games:alpine-sled:save:v1';
const BEST_KEY = 'kush-games-alpine-sled-best';
const THEME_KEY = 'kush-games:theme:save:v1';
// phases and kinds (src/games/alpinesled/engine.ts)
const Phase = { ready: '0', playing: '1', crashing: '2', gameOver: '3' };
const Kind = { pine: 0, boulder: 1, snowman: 2, log: 3, ramp: 4, gift: 5, star: 6, shield: 7 };
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const state = page => page.evaluate(() => {
  const { game } = window.__sledTest;
  return { phase: game.phase(), distance: game.distance(), score: game.score(), x: game.player_x(), altitude: game.altitude(), motion: game.motion(),
    gifts: game.gifts(), stars: game.stars(), shield: game.has_shield(), speed: game.speed() };
});
const phaseOf = page => page.getByTestId('alpine-sled').getAttribute('data-phase');
const game = (page, script, argument) => page.evaluate(([source, value]) => new Function('game', 'value', source)(window.__sledTest.game, value), [script, argument]);
const waitFor = async (predicate, timeout = 8000, interval = 40) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await predicate()) return true; await new Promise(resolve => setTimeout(resolve, interval)); }
  return false;
};
/** Highest value `read` reaches within `milliseconds`, sampled every animation frame in the page. */
const peak = (page, expression, milliseconds) => page.evaluate(([expression, milliseconds]) => new Promise(resolve => {
  const read = new Function('game', `return ${expression}`);
  const end = performance.now() + milliseconds;
  let highest = -Infinity;
  const step = () => { highest = Math.max(highest, read(window.__sledTest.game)); if (performance.now() < end) requestAnimationFrame(step); else resolve(highest); };
  step();
}), [expression, milliseconds]);
const watchErrors = page => {
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
};
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return { frames: sorted.length, average: +(sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2), p95: +at(0.95).toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) };
};
const resetPerf = page => page.evaluate(() => { window.__sledTest.perf.count = 0; });
const readPerf = page => page.evaluate(() => {
  const { perf } = window.__sledTest;
  const length = Math.min(perf.count, perf.workMilliseconds.length);
  return { work: Array.from(perf.workMilliseconds.slice(0, length)), frame: Array.from(perf.frameMilliseconds.slice(0, length)) };
});
/** What the canvas shows: colour variety on a grid, the average sky (top band) and snow (bottom band) colours, warm wood near the sled. */
const sceneColors = page => page.evaluate(() => {
  const canvas = document.querySelector('[data-testid="sled-canvas"]');
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  const colors = new Set();
  let blank = 0, samples = 0;
  const band = (top, bottom) => {
    let red = 0, green = 0, blue = 0, count = 0;
    for (let y = Math.floor(height * top); y < height * bottom; y += 7) for (let x = 0; x < width; x += 7) {
      const index = (y * width + x) * 4; red += pixels[index]; green += pixels[index + 1]; blue += pixels[index + 2]; count++;
    }
    return [red / count, green / count, blue / count].map(Math.round);
  };
  let wood = 0;
  for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
    const index = (y * width + x) * 4;
    const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
    colors.add(`${red >> 4},${green >> 4},${blue >> 4}`);
    if (red === 0 && green === 0 && blue === 0) blank++;
    if (red > 120 && red - blue > 50 && green > 70 && red > green) wood++;
    samples++;
  }
  return { distinct: colors.size, blankShare: blank / samples, sky: band(0.02, 0.12), snow: band(0.85, 0.98), woodShare: wood / samples, width, height };
});
const shot = async (page, name) => {
  const path = `${screenshotDirectory}/${name}`;
  await page.screenshot({ path });
  console.log(`saved ${path}`);
};

const browser = await chromium.launch({ executablePath: chromePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const perfReport = {};
try {
  // ---------- desktop ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  watchErrors(page);
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  check(!(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('alpine_sled')))), 'the Alpine Sled wasm is not loaded on the hub');
  check(await page.locator('img[src*="alpine-sled"]').count() > 0, 'hub shows the Alpine Sled thumbnail');
  check(await page.getByText('Alpine Sled').first().isVisible(), 'hub shows the Alpine Sled card');
  await page.locator('img[src*="alpine-sled"]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, 'hub-card.png');

  const loadStart = Date.now();
  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('sled-canvas').waitFor();
  check(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('alpine_sled'))), `the wasm loads when the game opens (${Date.now() - loadStart} ms to the canvas)`);
  check(await phaseOf(page) === Phase.ready, 'loads on the start screen');
  const overlayText = await page.getByTestId('sled-overlay').textContent();
  check(overlayText.includes('ALPINE') && overlayText.includes('SLED'), 'title overlay');
  const startControls = page.getByTestId('sled-controls');
  const startControlsText = await startControls.textContent();
  check(await startControls.isVisible() && await startControls.getAttribute('data-keys') === 'true'
    && ['Steer', 'Jump', 'Pause', 'Mute', 'Start', 'Back to the hub', 'Gift', 'Star', 'Shield'].every(text => startControlsText.includes(text)),
    'desktop: keyboard controls card on the start screen (steer, jump, P, M, Enter, Esc, collectibles)');
  await page.waitForTimeout(300);
  await shot(page, 'start-desktop.png');
  const stageBox = await page.getByTestId('sled-canvas').boundingBox();
  check(stageBox.width >= 900 && Math.abs(stageBox.width / stageBox.height - 1.6) < 0.03, `desktop view ${Math.round(stageBox.width)}×${Math.round(stageBox.height)} (16:10)`);

  // start, and the 3D scene is really drawn
  await page.keyboard.press('Enter');
  check(await waitFor(async () => await phaseOf(page) === Phase.playing, 1500), 'Enter starts the run');
  await game(page, 'game.debug_set_invincible(true)');
  await page.waitForTimeout(1500);
  const colors = await sceneColors(page);
  check(colors.distinct >= 60 && colors.blankShare < 0.01, `the 3D scene is drawn: ${colors.distinct} distinct colours, ${(colors.blankShare * 100).toFixed(1)}% blank`);
  check(colors.sky[2] > colors.sky[0] + 15, `a soft blue sky on top (rgb ${colors.sky})`);
  check(colors.snow.every(channel => channel > 190), `light snow at the bottom (rgb ${colors.snow})`);
  check(colors.woodShare > 0.004, `the wooden sled is in view (${(colors.woodShare * 100).toFixed(2)}% warm wood pixels)`);

  // glides on its own: distance, score and the HUD rise
  const before = await state(page);
  await page.waitForTimeout(1200);
  const after = await state(page);
  const hudDistance = await page.getByTestId('sled-distance').textContent();
  check(after.distance > before.distance + 10 && after.score > before.score, `the sled glides downhill on its own (${before.distance.toFixed(0)} → ${after.distance.toFixed(0)} m, score ${before.score} → ${after.score})`);
  check(Math.abs(parseInt(hudDistance, 10) - after.distance) <= 30 && hudDistance.endsWith(' m'), `HUD shows the distance (${hudDistance})`);

  // steering
  await game(page, 'game.debug_clear_trail()');
  const steerStart = (await state(page)).x;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(450);
  await page.keyboard.up('ArrowRight');
  const steeredRight = await state(page);
  check(steeredRight.x > steerStart + 1.5, `→ steers right (x ${steerStart.toFixed(2)} → ${steeredRight.x.toFixed(2)})`);
  await page.keyboard.down('a');
  await page.waitForTimeout(700);
  await page.keyboard.up('a');
  check((await state(page)).x < steeredRight.x - 2, 'A steers left');

  // jumping lifts the sled off the snow and lands it
  await game(page, 'game.debug_clear_trail()');
  await page.keyboard.press(' ');
  const jumpPeak = await peak(page, 'game.altitude()', 900);
  check(jumpPeak > 0.9 && jumpPeak < 1.6, `Space jumps (peak ${jumpPeak.toFixed(2)} m)`);
  check(await waitFor(async () => (await state(page)).motion === 0 && (await state(page)).altitude === 0, 2000), 'and lands back on the snow');
  await page.keyboard.press('ArrowUp');
  check(await peak(page, 'game.altitude()', 500) > 0.6, '↑ jumps too');
  await page.waitForTimeout(600);

  // a gift right ahead
  await game(page, 'game.debug_clear_trail(); game.debug_spawn(5, 12, game.player_x(), 0)');
  check(await waitFor(async () => await page.getByTestId('sled-gifts').textContent() === '1', 3000), 'riding over a gift collects it (HUD 🎁 1)');

  // a ramp: a long high arc over a pine, collecting the stars hanging in the air
  await game(page, 'game.debug_clear_trail(); const x = game.player_x(); game.debug_spawn(4, 22, x, 0); game.debug_spawn(0, 32.5, x, 0); for (const ahead of [29.5, 33.5, 37.5]) game.debug_spawn(6, ahead, x, 3);');
  await page.waitForTimeout(250);
  await shot(page, 'ramp-ahead-desktop.png');
  const rampPeak = await peak(page, 'game.altitude()', 3000);
  const afterRamp = await state(page);
  check(rampPeak > 3.2, `the ramp launches the sled high (peak ${rampPeak.toFixed(2)} m, higher than a pine)`);
  check(afterRamp.stars === 3 && String(afterRamp.phase) === Phase.playing, `flies over the pine and grabs all 3 air stars (stars ${afterRamp.stars})`);

  // the shield: picked up, then absorbs one real hit
  await game(page, 'game.debug_set_invincible(false); game.debug_clear_trail(); game.debug_spawn(7, 10, game.player_x(), 0)');
  check(await waitFor(async () => (await state(page)).shield && await page.getByTestId('sled-shield').isVisible(), 3000), 'a shield is picked up (HUD 🛡️)');
  await game(page, 'game.debug_clear_trail(); game.debug_spawn(1, 10, game.player_x(), 0)');
  check(await waitFor(async () => !(await state(page)).shield, 3000) && String((await state(page)).phase) === Phase.playing, 'the shield takes the boulder hit and the run goes on');
  await game(page, 'game.debug_set_invincible(true)');

  // a scenic mid-run screenshot on a natural stretch of trail further down the mountain
  await game(page, 'game.debug_teleport(1180)');
  await page.waitForTimeout(3500);
  await shot(page, 'desktop-run.png');
  const midRunColors = await sceneColors(page);
  check(midRunColors.distinct >= 60, `mid-run scene stays rich (${midRunColors.distinct} colours)`);
  check(await game(page, 'return game.debug_obstacles_ahead(400)') > 3, 'the trail ahead has obstacles');
  // frame cost
  await resetPerf(page);
  await page.waitForTimeout(2500);
  const normalPerf = await readPerf(page);
  perfReport.desktop = { work: summarize(normalPerf.work), frame: summarize(normalPerf.frame) };
  check(perfReport.desktop.work.p95 < 8, `desktop frame work p95 ${perfReport.desktop.work.p95} ms (avg ${perfReport.desktop.work.average})`);
  const cdp = await desktop.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await resetPerf(page);
  await page.waitForTimeout(2500);
  const slowPerf = await readPerf(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  perfReport.desktopSlow4x = { work: summarize(slowPerf.work), frame: summarize(slowPerf.frame) };
  check(perfReport.desktopSlow4x.work.p95 < 16, `4× slower CPU: frame work p95 ${perfReport.desktopSlow4x.work.p95} ms (avg ${perfReport.desktopSlow4x.work.average}) fits a 60 fps frame`);

  // pause, controls from pause, mute
  await page.keyboard.press('p');
  check(await page.getByTestId('alpine-sled').getAttribute('data-paused') === 'true', 'P pauses');
  const frozen = await state(page);
  await page.waitForTimeout(500);
  const stillFrozen = await state(page);
  check(frozen.distance === stillFrozen.distance && frozen.x === stillFrozen.x, 'nothing moves while paused');
  await page.keyboard.press('ArrowLeft');
  check(await page.getByTestId('alpine-sled').getAttribute('data-paused') === 'true', 'a stray arrow key does not resume');
  await page.getByTestId('sled-controls-toggle').click();
  check(await page.getByTestId('sled-pause-controls').isVisible() && await page.getByTestId('alpine-sled').getAttribute('data-paused') === 'true', 'controls open from the pause screen (and it stays paused)');
  await shot(page, 'paused-desktop.png');
  await page.keyboard.press('p');
  check(await page.getByTestId('alpine-sled').getAttribute('data-paused') === 'false', 'P resumes');
  await page.keyboard.press('m');
  check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'true', 'M mutes');
  await page.keyboard.press('m');

  // persistence: pause (saves), reload, the run comes back paused exactly where it was
  await page.keyboard.press('p');
  const beforeReload = await state(page);
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
  check(saved !== null && saved.includes('"bytes"'), 'the run is saved on pause');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('sled-canvas').waitFor();
  await page.waitForTimeout(300);
  const restored = await state(page);
  check(Math.abs(restored.distance - beforeReload.distance) < 0.01 && restored.score === beforeReload.score && Math.abs(restored.x - beforeReload.x) < 1e-4
    && restored.gifts === beforeReload.gifts && restored.stars === beforeReload.stars,
    `reload restores the run (${restored.distance.toFixed(1)} m, score ${restored.score}, 🎁 ${restored.gifts} ⭐ ${restored.stars})`);
  check(await page.getByTestId('alpine-sled').getAttribute('data-paused') === 'true' && await page.getByTestId('restored').isVisible(), 'it comes back paused, with a "your run was saved" note');
  await shot(page, 'restored-paused-desktop.png');
  await page.waitForTimeout(400);
  check((await state(page)).distance === restored.distance, 'and stays still until you carry on');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  check((await state(page)).distance > restored.distance + 5, 'Enter carries on from there');

  // crash into a pine: game over, then Play again starts clean
  await game(page, 'game.debug_set_invincible(false); game.debug_clear_trail(); game.debug_spawn(0, 14, game.player_x(), 0)');
  check(await waitFor(async () => await phaseOf(page) === Phase.crashing, 3000), 'hitting a pine wipes out');
  await page.waitForTimeout(250);
  await shot(page, 'crash-desktop.png');
  check(await waitFor(async () => await phaseOf(page) === Phase.gameOver, 3000), 'then the game-over screen');
  const finalState = await state(page);
  const finalText = await page.getByTestId('sled-final-score').textContent();
  check(finalText.includes(`Score ${finalState.score}`) && finalText.includes(`${Math.floor(finalState.distance)} m`), `game-over screen: ${finalText}`);
  check(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY) === null, 'the save is cleared at game over');
  check(Number(await page.evaluate(key => localStorage.getItem(key), BEST_KEY)) === finalState.score && Number(await page.getByTestId('sled-best').textContent()) === finalState.score,
    `the best score is stored (${finalState.score})`);
  await page.waitForTimeout(500);
  await shot(page, 'gameover-desktop.png');
  await page.getByTestId('sled-new-game').click();
  await page.waitForTimeout(100);
  const fresh = await state(page);
  check(String(fresh.phase) === Phase.playing && fresh.distance < 5 && fresh.gifts === 0 && fresh.stars === 0 && !fresh.shield && Math.abs(fresh.x) < 0.5,
    `Play again starts a clean run (${fresh.distance.toFixed(1)} m, 🎁 ${fresh.gifts}, ⭐ ${fresh.stars})`);
  check(await page.getByTestId('sled-gifts').textContent() === '0' && Number(await page.getByTestId('sled-best').textContent()) === finalState.score, 'HUD reset, best score kept');
  check(await noOverflow(page), 'desktop: no sideways scrolling');

  // themes: the start pill follows the hub theme
  const themeColors = async () => {
    // leave the game first (leaving saves the run), then drop the save so the start screen shows
    await page.goto(siteUrl, { waitUntil: 'networkidle' });
    await page.evaluate(key => localStorage.removeItem(key), SAVE_KEY);
    await page.goto(gameUrl, { waitUntil: 'networkidle' });
    await page.getByTestId('sled-canvas').waitFor();
    return page.evaluate(() => ({ theme: document.documentElement.dataset.theme ?? 'netflix-red', pill: getComputedStyle(document.querySelector('.alpine-sled__hint')).backgroundColor }));
  };
  await page.evaluate(([themeKey, saveKey]) => { localStorage.removeItem(themeKey); localStorage.removeItem(saveKey); }, [THEME_KEY, SAVE_KEY]);
  const lagoon = await themeColors();
  check(lagoon.theme === 'lagoon' && lagoon.pill === 'rgb(239, 202, 124)', `Lagoon theme: gold start pill (${lagoon.pill})`);
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), data: { theme: 'netflix-red' } })), THEME_KEY);
  const red = await themeColors();
  check(red.theme === 'netflix-red' && red.pill === 'rgb(255, 255, 255)', `Netflix Red theme: white start pill (${red.pill})`);
  await shot(page, 'start-desktop-netflix-red.png');
  await desktop.close();

  // ---------- phone, portrait ----------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const mobile = await phone.newPage();
  watchErrors(mobile);
  await mobile.goto(gameUrl, { waitUntil: 'networkidle' });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.getByTestId('sled-canvas').waitFor();
  const touchControls = mobile.getByTestId('sled-touch');
  check(await touchControls.isVisible() && await mobile.getByTestId('touch-jump').isVisible() && await mobile.getByTestId('touch-pad').isVisible(), 'phone: drag pad and JUMP button');
  check(await mobile.getByTestId('sled-controls').getAttribute('data-touch') === 'true' && await mobile.getByTestId('sled-controls').getAttribute('data-keys') === 'false',
    'phone: the start card explains the touch controls (no key caps)');
  const phoneStage = await mobile.getByTestId('sled-canvas').boundingBox();
  const jumpBox = await mobile.getByTestId('touch-jump').boundingBox();
  check(phoneStage.width >= 370 && phoneStage.height > phoneStage.width && jumpBox.y + jumpBox.height <= 844 && await noOverflow(mobile),
    `phone portrait: a tall ${Math.round(phoneStage.width)}×${Math.round(phoneStage.height)} view, controls on screen, no overflow`);
  await shot(mobile, 'start-mobile-portrait.png');
  // tapping JUMP starts the run
  const tapPointer = { pointerId: 3, pointerType: 'touch', isPrimary: true, bubbles: true };
  await mobile.getByTestId('touch-jump').dispatchEvent('pointerdown', tapPointer);
  check(await waitFor(async () => await phaseOf(mobile) === Phase.playing, 1500), 'phone: tapping JUMP starts the run');
  await game(mobile, 'game.debug_set_invincible(true); game.debug_clear_trail()');
  await mobile.waitForTimeout(300);
  await mobile.getByTestId('touch-jump').dispatchEvent('pointerdown', tapPointer);
  check(await peak(mobile, 'game.altitude()', 700) > 0.9, 'phone: JUMP jumps');
  await mobile.waitForTimeout(500);
  // drag pad steering
  const padBox = await mobile.getByTestId('touch-pad').boundingBox();
  const padStart = (await state(mobile)).x;
  const padPointer = { pointerId: 5, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: padBox.x + padBox.width / 2, clientY: padBox.y + padBox.height / 2 };
  await mobile.getByTestId('touch-pad').dispatchEvent('pointerdown', padPointer);
  await mobile.getByTestId('touch-pad').dispatchEvent('pointermove', { ...padPointer, clientX: padBox.x + padBox.width * 0.95 });
  await mobile.waitForTimeout(450);
  await mobile.getByTestId('touch-pad').dispatchEvent('pointerup', { ...padPointer, clientX: padBox.x + padBox.width * 0.95 });
  const padSteered = (await state(mobile)).x;
  check(padSteered > padStart + 1.5, `phone: dragging the pad right steers right (x ${padStart.toFixed(2)} → ${padSteered.toFixed(2)})`);
  // dragging on the slope steers; a swipe up jumps
  const slopePointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: phoneStage.x + phoneStage.width * 0.6, clientY: phoneStage.y + phoneStage.height * 0.7 };
  await mobile.getByTestId('sled-canvas').dispatchEvent('pointerdown', slopePointer);
  await mobile.getByTestId('sled-canvas').dispatchEvent('pointermove', { ...slopePointer, clientX: phoneStage.x + phoneStage.width * 0.2 });
  await mobile.waitForTimeout(600);
  await mobile.getByTestId('sled-canvas').dispatchEvent('pointerup', { ...slopePointer, clientX: phoneStage.x + phoneStage.width * 0.2 });
  check((await state(mobile)).x < padSteered - 2, 'phone: dragging left on the slope steers left');
  await mobile.waitForTimeout(300);
  const swipePointer = { pointerId: 8, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: phoneStage.x + phoneStage.width * 0.5, clientY: phoneStage.y + phoneStage.height * 0.75 };
  await mobile.getByTestId('sled-canvas').dispatchEvent('pointerdown', swipePointer);
  await mobile.getByTestId('sled-canvas').dispatchEvent('pointermove', { ...swipePointer, clientY: swipePointer.clientY - 90 });
  check(await peak(mobile, 'game.altitude()', 700) > 0.9, 'phone: a swipe up jumps');
  await mobile.getByTestId('sled-canvas').dispatchEvent('pointerup', { ...swipePointer, clientY: swipePointer.clientY - 90 });
  // mid-run screenshot on a natural stretch
  await game(mobile, 'game.debug_teleport(640)');
  await mobile.waitForTimeout(3200);
  await shot(mobile, 'mobile-portrait-run.png');
  const phoneColors = await sceneColors(mobile);
  check(phoneColors.distinct >= 50 && phoneColors.woodShare > 0.004, `phone: the 3D scene and sled are drawn (${phoneColors.distinct} colours)`);
  await resetPerf(mobile);
  await mobile.waitForTimeout(2000);
  const phonePerf = await readPerf(mobile);
  perfReport.phone = { work: summarize(phonePerf.work), frame: summarize(phonePerf.frame) };
  check(perfReport.phone.work.p95 < 8, `phone frame work p95 ${perfReport.phone.work.p95} ms`);
  await mobile.getByTestId('sled-pause').tap();
  await mobile.getByTestId('sled-controls-toggle').tap();
  check(await mobile.getByTestId('sled-pause-controls').isVisible() && await mobile.getByTestId('alpine-sled').getAttribute('data-paused') === 'true' && await noOverflow(mobile),
    'phone: controls open from the pause screen');
  await shot(mobile, 'paused-mobile-portrait.png');
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.getByTestId('sled-canvas').waitFor();
  check(await mobile.getByTestId('restored').isVisible() && await mobile.getByTestId('alpine-sled').getAttribute('data-paused') === 'true', 'phone: a refresh brings the run back paused');
  await phone.close();

  // ---------- phone, landscape ----------
  const sideways = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const landscape = await sideways.newPage();
  watchErrors(landscape);
  await landscape.goto(gameUrl, { waitUntil: 'networkidle' });
  await landscape.evaluate(() => localStorage.clear());
  await landscape.reload({ waitUntil: 'networkidle' });
  await landscape.getByTestId('sled-canvas').waitFor();
  await landscape.getByTestId('touch-jump').dispatchEvent('pointerdown', tapPointer);
  await game(landscape, 'game.debug_set_invincible(true)');
  await landscape.waitForTimeout(2500);
  const landscapeStage = await landscape.getByTestId('sled-canvas').boundingBox();
  const landscapeJump = await landscape.getByTestId('touch-jump').boundingBox();
  const landscapePad = await landscape.getByTestId('touch-pad').boundingBox();
  check(landscapeStage.width >= 800 && landscapeStage.y + landscapeStage.height <= 391 && landscapeJump.y + landscapeJump.height <= landscapeStage.y + landscapeStage.height + 1
    && landscapePad.x >= landscapeStage.x - 1 && await noOverflow(landscape),
    `phone landscape: ${Math.round(landscapeStage.width)}×${Math.round(landscapeStage.height)} view fills the screen, pad and JUMP on its corners`);
  await shot(landscape, 'mobile-landscape-run.png');
  await sideways.close();
} finally {
  await browser.close();
}
console.log('perf', JSON.stringify(perfReport));
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 5).join(' | ')}` : ''}`);
console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
