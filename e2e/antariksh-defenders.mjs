// Antariksh Defenders smoke test: hub card (wasm not loaded on the hub), load, the countdown, moving, firing, a kill,
// pause (with the controls card) and mute, a save restored through a reload, a frame-time perf sample during a busy late
// wave (normal and 4× CPU throttling), and the phone layouts (portrait with two-finger drag + FIRE, and landscape).
// Usage: node e2e/antariksh-defenders.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const gameUrl = `${siteUrl}?antarikshTest#/play/antariksh-defenders`;
const SAVE_KEY = 'kush-games:antariksh-defenders:save:v1';
// render buffer slots (src/games/antariksh/engine.ts)
const Slot = { playerX: 5, enemiesAlive: 16, playerBullets: 17, enemyBullets: 18, particles: 19, enemies: 32 };
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const state = page => page.evaluate(() => {
  const { game, views } = window.__antarikshTest;
  const render = views().render;
  return { x: game.player_x(), phase: game.phase(), wave: game.wave(), lives: game.lives(), score: game.score(), kills: game.kills(), bullets: render[17],
    alive: game.enemies_alive(), formationY: game.formation_y(), firstEnemyX: render[34] };
});
const phaseOf = page => page.getByTestId('antariksh').getAttribute('data-phase');
const game = (page, script, argument) => page.evaluate(([source, value]) => new Function('game', 'value', source)(window.__antarikshTest.game, value), [script, argument]);
const waitFor = async (predicate, timeout = 8000, interval = 50) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await predicate()) return true; await new Promise(resolve => setTimeout(resolve, interval)); }
  return false;
};
const watchErrors = page => {
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
};
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return { frames: sorted.length, average: +(sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2), p95: +at(0.95).toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) };
};
const resetPerf = page => page.evaluate(() => { window.__antarikshTest.perf.count = 0; });
const readPerf = page => page.evaluate(() => {
  const { perf } = window.__antarikshTest;
  const length = Math.min(perf.count, perf.workMilliseconds.length);
  return { work: Array.from(perf.workMilliseconds.slice(0, length)), frame: Array.from(perf.frameMilliseconds.slice(0, length)) };
});
// fly under the nearest enemy (no barriers in the way any more) for `milliseconds`
const hunt = (page, milliseconds) => page.evaluate(milliseconds => new Promise(resolve => {
  const { game, views } = window.__antarikshTest;
  const end = performance.now() + milliseconds;
  const step = () => {
    const render = views().render;
    let best = -1;
    for (let index = 0; index < 55; index++) {
      const offset = 32 + index * 4;
      if (render[offset] === 0) continue;
      if (best < 0 || Math.abs(render[offset + 2] - game.player_x()) < Math.abs(best - game.player_x())) best = render[offset + 2];
    }
    game.set_target_x(best >= 0 ? best : game.debug_nearest_enemy_x());
    if (performance.now() < end) requestAnimationFrame(step); else { game.set_target_x(-1); resolve(); }
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
  const wasmOnHub = await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('antariksh_defenders')));
  check(!wasmOnHub, 'the Antariksh Defenders wasm is not loaded on the hub');
  check(await page.locator('img[src*="antariksh-defenders"]').count() > 0, 'hub shows the Antariksh Defenders thumbnail');
  check(await page.getByText('Antariksh Defenders').first().isVisible(), 'hub shows the Antariksh Defenders card');
  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('antariksh-canvas').waitFor();
  check(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('antariksh_defenders'))), 'the wasm loads when the game opens');
  check(await phaseOf(page) === '0', 'loads on the Ready screen');
  const overlayText = await page.getByTestId('antariksh-overlay').textContent();
  check(overlayText.includes('ANTARIKSH') && overlayText.includes('Low Earth Orbit'), 'title overlay with the first stage name');
  const startControls = page.getByTestId('antariksh-controls');
  const startControlsText = await startControls.textContent();
  check(await startControls.isVisible() && ['Move', 'Fire', 'hold', 'Pause', 'Mute', 'Back to the hub', 'Triple shot', 'Shield'].every(text => startControlsText.includes(text)),
    'controls card on the start screen: move, fire (hold), P, M, Esc, capsule legend');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-antariksh-start-desktop.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-antariksh-start-desktop.png`);
  const canvasBox = await page.getByTestId('antariksh-canvas').boundingBox();
  check(canvasBox.height >= 500 && Math.abs(canvasBox.width / canvasBox.height - 6 / 7) < 0.02, `desktop canvas ${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)} (6:7)`);

  // launch: countdown, then move
  const startX = (await state(page)).x;
  await page.keyboard.down('ArrowRight');
  check(await waitFor(async () => await phaseOf(page) === '1', 1500), 'a key press starts the mission-control countdown');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  check((await state(page)).x > startX + 20, 'the ship moves right');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-antariksh-countdown.png` });
  check(await waitFor(async () => await phaseOf(page) === '2', 5000), 'liftoff: play starts after the countdown');
  const leftStart = (await state(page)).x;
  await page.keyboard.down('a');
  await page.waitForTimeout(400);
  await page.keyboard.up('a');
  check((await state(page)).x < leftStart - 20, 'A moves left');

  // fire and kill
  await game(page, 'game.debug_set_invincible(true); game.set_target_x(64)');
  await page.waitForTimeout(1200);
  await page.keyboard.down(' ');
  await page.waitForTimeout(120);
  check((await state(page)).bullets > 0, 'Space fires');
  await hunt(page, 4000);
  await page.keyboard.up(' ');
  const afterHunt = await state(page);
  check(afterHunt.kills > 0 && afterHunt.score > 0 && afterHunt.alive < 45, `kills land (${afterHunt.kills} kills, ${afterHunt.score} points)`);

  // desktop mid-wave screenshot: the comet crossing, shots in the air
  await game(page, 'game.debug_launch_mystery()');
  await page.keyboard.down('z');
  await hunt(page, 1600);
  await page.keyboard.up('z');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-antariksh-desktop.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-antariksh-desktop.png`);

  // pause, controls from pause, mute
  await page.keyboard.press('p');
  check(await page.getByTestId('antariksh').getAttribute('data-paused') === 'true', 'P pauses');
  const frozen = await state(page);
  await page.waitForTimeout(500);
  const stillFrozen = await state(page);
  check(frozen.formationY === stillFrozen.formationY && frozen.firstEnemyX === stillFrozen.firstEnemyX && frozen.x === stillFrozen.x, 'nothing moves while paused');
  await page.keyboard.press('ArrowLeft');
  check(await page.getByTestId('antariksh').getAttribute('data-paused') === 'true', 'a stray arrow key does not resume');
  await page.getByTestId('antariksh-controls-toggle').click();
  check(await page.getByTestId('antariksh-pause-controls').isVisible() && await page.getByTestId('antariksh').getAttribute('data-paused') === 'true', 'controls open from the pause screen (and stay paused)');
  await page.keyboard.press('p');
  check(await page.getByTestId('antariksh').getAttribute('data-paused') === 'false', 'P resumes');
  await page.keyboard.press('m');
  check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'true' && await page.evaluate(() => localStorage.getItem('kush-games-muted')) === 'true', 'M mutes');
  await page.keyboard.press('m');
  check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'false', 'M unmutes');

  // persistence: jump to wave 3, pause (saves), reload, the run is restored at the start of wave 3
  await game(page, 'game.debug_set_wave(3)');
  await page.waitForTimeout(100);
  await page.keyboard.press('p');
  const beforeReload = await state(page);
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
  check(saved !== null && saved.includes('"wave":3'), 'progress saved on pause');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('antariksh-canvas').waitFor();
  const restored = await state(page);
  check(restored.wave === 3 && restored.score === beforeReload.score && restored.lives === beforeReload.lives && restored.phase === 0,
    `reload restores wave ${restored.wave}, score ${restored.score}, lives ${restored.lives}`);
  check(await page.getByTestId('restored').isVisible() && (await page.getByTestId('antariksh-overlay').textContent()).includes('Lunar Orbit'), 'restored banner + "Lunar Orbit" stage name');
  check(Number(await page.getByTestId('antariksh-best').textContent()) >= beforeReload.score && beforeReload.score > 0, 'high score kept through the reload');

  // perf: a busy late wave (wave 7, lots of enemy fire), hunting and firing, the mothership crossing; normal then 4× CPU slowdown
  await page.keyboard.press('Enter');
  await game(page, 'game.debug_set_invincible(true); game.debug_set_wave(7)');
  await waitFor(async () => await phaseOf(page) === '2', 5000);
  const busy = async milliseconds => {
    await page.keyboard.down(' ');
    await game(page, 'game.debug_launch_mystery()');
    let peak = { enemyBullets: 0, particles: 0 };
    const end = Date.now() + milliseconds;
    const hunting = hunt(page, milliseconds);
    while (Date.now() < end) {
      const counts = await page.evaluate(() => { const render = window.__antarikshTest.views().render; return { enemyBullets: render[18], particles: render[19] }; });
      peak = { enemyBullets: Math.max(peak.enemyBullets, counts.enemyBullets), particles: Math.max(peak.particles, counts.particles) };
      await page.waitForTimeout(200);
    }
    await hunting;
    await page.keyboard.up(' ');
    return peak;
  };
  await resetPerf(page);
  const peakNormal = await busy(3000);
  const normal = await readPerf(page);
  const cdp = await desktop.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await game(page, 'game.debug_set_wave(8)');
  await page.waitForTimeout(1900);
  await resetPerf(page);
  const peakThrottled = await busy(4000);
  const throttled = await readPerf(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  perfReport.normal = { work: summarize(normal.work), frame: summarize(normal.frame), peak: peakNormal };
  perfReport.throttled4x = { work: summarize(throttled.work), frame: summarize(throttled.frame), peak: peakThrottled };
  console.log(`PERF ${JSON.stringify(perfReport)}`);
  check(perfReport.normal.work.p95 < 3, `simulate + draw p95 ${perfReport.normal.work.p95} ms per frame (desktop)`);
  check(perfReport.throttled4x.work.p95 < 10, `simulate + draw p95 ${perfReport.throttled4x.work.p95} ms per frame at 4× CPU slowdown (budget 16.7 ms)`);
  check(perfReport.throttled4x.frame.average < 20, `frame interval ${perfReport.throttled4x.frame.average} ms average at 4× CPU slowdown`);
  await desktop.close();

  // ---------- phone, portrait ----------
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await phone.newPage();
  watchErrors(mobile);
  await mobile.goto(gameUrl, { waitUntil: 'networkidle' });
  await mobile.getByTestId('antariksh-canvas').waitFor();
  check(await mobile.getByTestId('antariksh-touch').isVisible(), 'touch controls visible on a phone');
  check(await noOverflow(mobile), 'no horizontal scroll at 375 px');
  const stageBox = await mobile.getByTestId('antariksh-canvas').boundingBox();
  const fireBox = await mobile.getByTestId('touch-fire').boundingBox();
  const padBox = await mobile.getByTestId('touch-pad').boundingBox();
  check(stageBox.width >= 280 && fireBox.y >= stageBox.y + stageBox.height - 1 && fireBox.y + fireBox.height <= 667 && padBox.y + padBox.height <= 667,
    `portrait: playfield ${Math.round(stageBox.width)}×${Math.round(stageBox.height)} with the drag pad and FIRE below it, all on screen`);
  const mobileControlsBox = await mobile.getByTestId('antariksh-controls').boundingBox();
  check(await mobile.getByTestId('antariksh-controls-touch').isVisible() && mobileControlsBox.y >= stageBox.y && mobileControlsBox.y + mobileControlsBox.height <= stageBox.y + stageBox.height
    && mobileControlsBox.x >= stageBox.x && mobileControlsBox.x + mobileControlsBox.width <= stageBox.x + stageBox.width, 'phone: the touch diagram fits inside the start screen');
  await mobile.screenshot({ path: `${screenshotDirectory}/kush-games-antariksh-start-mobile.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-antariksh-start-mobile.png`);
  await mobile.getByTestId('touch-fire').tap();
  check(await waitFor(async () => await phaseOf(mobile) === '1', 2000), 'tapping FIRE starts the countdown');
  await waitFor(async () => await phaseOf(mobile) === '2', 5000);
  await game(mobile, 'game.debug_set_invincible(true)');
  const mobileStart = (await state(mobile)).x;
  // two fingers at once: drag on the pad to the right while FIRE is held
  const padPointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: padBox.x + padBox.width / 2, clientY: padBox.y + padBox.height / 2 };
  const firePointer = { pointerId: 8, pointerType: 'touch', isPrimary: false, bubbles: true, clientX: fireBox.x + fireBox.width / 2, clientY: fireBox.y + fireBox.height / 2 };
  await mobile.getByTestId('touch-pad').dispatchEvent('pointerdown', padPointer);
  await mobile.getByTestId('touch-fire').dispatchEvent('pointerdown', firePointer);
  await mobile.getByTestId('touch-pad').dispatchEvent('pointermove', { ...padPointer, clientX: padPointer.clientX + padBox.width * 0.3 });
  await mobile.waitForTimeout(700);
  const mobileState = await state(mobile);
  await mobile.screenshot({ path: `${screenshotDirectory}/kush-games-antariksh-mobile.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-antariksh-mobile.png`);
  await mobile.getByTestId('touch-fire').dispatchEvent('pointerup', firePointer);
  await mobile.getByTestId('touch-pad').dispatchEvent('pointerup', padPointer);
  check(mobileState.x > mobileStart + 30 && mobileState.bullets > 0, `drag + FIRE together: flies right (${mobileStart.toFixed(0)} → ${mobileState.x.toFixed(0)}) and shoots (${mobileState.bullets})`);
  // dragging on the playfield flies to the finger
  const canvasPointer = { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: stageBox.x + stageBox.width * 0.15, clientY: stageBox.y + stageBox.height * 0.8 };
  await mobile.getByTestId('antariksh-canvas').dispatchEvent('pointerdown', canvasPointer);
  await mobile.waitForTimeout(2400);
  await mobile.getByTestId('antariksh-canvas').dispatchEvent('pointerup', canvasPointer);
  const dragged = await state(mobile);
  check(Math.abs(dragged.x - 36) < 6, `touching the playfield flies the ship to the finger (x ${dragged.x.toFixed(0)})`);
  await mobile.getByTestId('antariksh-pause').tap();
  await mobile.getByTestId('antariksh-controls-toggle').tap();
  check(await mobile.getByTestId('antariksh-pause-controls').isVisible() && await mobile.getByTestId('antariksh').getAttribute('data-paused') === 'true' && await noOverflow(mobile),
    'phone: controls open from the pause screen');
  await phone.close();

  // ---------- phone, landscape ----------
  const sideways = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const landscape = await sideways.newPage();
  watchErrors(landscape);
  await landscape.goto(gameUrl, { waitUntil: 'networkidle' });
  await landscape.getByTestId('antariksh-canvas').waitFor();
  const landscapeBox = await landscape.getByTestId('antariksh-canvas').boundingBox();
  check(await noOverflow(landscape), 'no horizontal scroll in landscape');
  check(landscapeBox.height >= 240 && landscapeBox.y + landscapeBox.height <= 390, `landscape canvas ${Math.round(landscapeBox.width)}×${Math.round(landscapeBox.height)} fits the screen`);
  const landscapeFire = await landscape.getByTestId('touch-fire').boundingBox();
  const landscapePad = await landscape.getByTestId('touch-pad').boundingBox();
  check(landscapeFire.x >= landscapeBox.x + landscapeBox.width && landscapePad.x + landscapePad.width <= landscapeBox.x, 'landscape: pad and FIRE sit either side of the playfield');
  const landscapePanel = await landscape.getByTestId('antariksh-controls').boundingBox();
  check(landscapePanel && landscapePanel.y >= landscapeBox.y - 1 && landscapePanel.y + landscapePanel.height <= landscapeBox.y + landscapeBox.height + 1, 'landscape: the controls card fits inside the stage');
  await landscape.screenshot({ path: `${screenshotDirectory}/kush-games-antariksh-start-landscape.png` });
  await sideways.close();
} finally {
  await browser.close();
}
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
