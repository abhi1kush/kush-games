// Zombie Road smoke test: hub card (wasm not loaded on the hub), lazy wasm load, start, moving, firing, kills and score,
// a wave cleared by actually shooting it, pause (with the controls card), mute and auto-fire toggles, a save restored through
// a reload, game over and play again, a frame-time sample at 4× CPU slowdown, both hub themes, and the phone layouts
// (portrait with drag pad + FIRE and auto-fire, landscape).
// Usage: node e2e/zombie-road.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const gameUrl = `${siteUrl}?zombieTest#/play/zombie-road`;
const SAVE_KEY = 'kush-games:zombie-road:save:v1';
const BEST_KEY = 'kush-games-zombie-road-best';
const THEME_KEY = 'kush-games:theme:save:v1';
// phases (src/games/zombieroad/engine.ts)
const Phase = { ready: '0', playing: '1', dying: '2', waveClear: '3', waveIntro: '4', gameOver: '5' };
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const state = page => page.evaluate(() => {
  const { game, render } = window.__zombieTest;
  const view = render();
  return { x: game.player_x(), phase: game.phase(), wave: game.wave(), lives: game.lives(), health: game.health(), score: game.score(), kills: game.kills(),
    alive: game.zombies_alive(), left: game.zombies_left(), bullets: view[15], autoFire: game.auto_fire(), firstZombieY: view[48 + 2] };
});
const phaseOf = page => page.getByTestId('zombie-road').getAttribute('data-phase');
const game = (page, script, argument) => page.evaluate(([source, value]) => new Function('game', 'value', source)(window.__zombieTest.game, value), [script, argument]);
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
const resetPerf = page => page.evaluate(() => { window.__zombieTest.perf.count = 0; });
const readPerf = page => page.evaluate(() => {
  const { perf } = window.__zombieTest;
  const length = Math.min(perf.count, perf.workMilliseconds.length);
  return { work: Array.from(perf.workMilliseconds.slice(0, length)), frame: Array.from(perf.frameMilliseconds.slice(0, length)) };
});
// walk under the zombie lowest on the road (the most dangerous) for `milliseconds`, or until `untilWave` is reached
const hunt = (page, milliseconds, untilWave = 0) => page.evaluate(([milliseconds, untilWave]) => new Promise(resolve => {
  const { game } = window.__zombieTest;
  const end = performance.now() + milliseconds;
  const step = () => {
    const x = game.debug_most_dangerous_zombie_x();
    game.set_target_x(x >= 0 ? x : 120);
    if (performance.now() < end && !(untilWave && game.wave() >= untilWave)) requestAnimationFrame(step); else { game.set_target_x(-1); resolve(); }
  };
  step();
}), [milliseconds, untilWave]);
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
  const wasmOnHub = await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('zombie_road')));
  check(!wasmOnHub, 'the Zombie Road wasm is not loaded on the hub');
  const card = page.locator('img[src*="zombie-road"]').first();
  check(await page.locator('img[src*="zombie-road"]').count() > 0, 'hub shows the Zombie Road thumbnail');
  check(await page.getByText('Zombie Road').first().isVisible(), 'hub shows the Zombie Road card');
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, 'kush-games-zombie-road-hub.png');

  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('zombie-canvas').waitFor();
  check(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('zombie_road'))), 'the wasm loads when the game opens');
  check(await phaseOf(page) === Phase.ready, 'loads on the start screen');
  const overlayText = await page.getByTestId('zombie-overlay').textContent();
  check(overlayText.includes('ZOMBIE') && overlayText.includes('Wave 1'), 'title overlay with wave 1');
  const startControls = page.getByTestId('zombie-controls');
  const startControlsText = await startControls.textContent();
  check(await startControls.isVisible() && await startControls.getAttribute('data-keys') === 'true'
    && ['Move', 'Fire', 'hold', 'Auto-fire', 'Pause', 'Mute', 'Back to the hub', 'Spread shot', 'Rapid fire', 'Medkit'].every(text => startControlsText.includes(text)),
    'desktop: keyboard controls card on the start screen (move, fire, F, P, M, Esc, pickups)');
  check(await page.getByTestId('zombie-auto-fire').textContent() === 'Auto-fire off', 'auto-fire starts off on a computer');
  await shot(page, 'kush-games-zombie-road-start-desktop.png');
  const canvasBox = await page.getByTestId('zombie-canvas').boundingBox();
  check(canvasBox.height >= 500 && Math.abs(canvasBox.width / canvasBox.height - 3 / 4) < 0.02, `desktop canvas ${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)} (3:4)`);

  // start, move
  const startX = (await state(page)).x;
  await page.keyboard.down('ArrowRight');
  check(await waitFor(async () => await phaseOf(page) === Phase.waveIntro, 1500), 'a key press starts: the wave banner shows');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  check((await state(page)).x > startX + 30, 'the survivor moves right');
  check(await waitFor(async () => await phaseOf(page) === Phase.playing, 4000), 'play starts after the banner');
  const leftStart = (await state(page)).x;
  await page.keyboard.down('a');
  await page.waitForTimeout(400);
  await page.keyboard.up('a');
  check((await state(page)).x < leftStart - 30, 'A moves left');

  // fire and kill real zombies of wave 1 (no debug spawns), then clear the whole wave by shooting it
  await game(page, 'game.debug_set_invincible(true)');
  await page.keyboard.down(' ');
  await page.waitForTimeout(150);
  check((await state(page)).bullets > 0, 'Space fires');
  await hunt(page, 9000);
  const afterHunt = await state(page);
  check(afterHunt.kills > 0 && afterHunt.score > 0, `shots land: ${afterHunt.kills} kills, score ${afterHunt.score}`);
  await shot(page, 'kush-games-zombie-road-desktop-wave1.png');
  await hunt(page, 70000, 2);
  await page.keyboard.up(' ');
  const afterWave = await state(page);
  check(afterWave.wave === 2 && afterWave.kills >= 12, `wave 1 cleared by shooting: now wave ${afterWave.wave}, ${afterWave.kills} kills, score ${afterWave.score}`);
  check(await waitFor(async () => await phaseOf(page) === Phase.playing, 6000), 'wave 2 starts');

  // a busy later wave for the screenshot: wave 5 (every kind plus a Tank), auto-fire on with F
  await page.keyboard.press('f');
  check((await state(page)).autoFire && await page.getByTestId('zombie-auto-fire').textContent() === 'Auto-fire on', 'F turns auto-fire on');
  await game(page, 'game.debug_set_wave(5)');
  await hunt(page, 14000);
  const busyState = await state(page);
  check(busyState.alive > 3, `wave 5 has a crowd on the road (${busyState.alive} zombies)`);
  await shot(page, 'kush-games-zombie-road-desktop.png');

  // pause, controls from pause, mute, auto-fire off
  await page.keyboard.press('p');
  check(await page.getByTestId('zombie-road').getAttribute('data-paused') === 'true', 'P pauses');
  const frozen = await state(page);
  await page.waitForTimeout(500);
  const stillFrozen = await state(page);
  check(frozen.firstZombieY === stillFrozen.firstZombieY && frozen.x === stillFrozen.x && frozen.score === stillFrozen.score, 'nothing moves while paused');
  await page.keyboard.press('ArrowLeft');
  check(await page.getByTestId('zombie-road').getAttribute('data-paused') === 'true', 'a stray arrow key does not resume');
  await page.getByTestId('zombie-controls-toggle').click();
  check(await page.getByTestId('zombie-pause-controls').isVisible() && await page.getByTestId('zombie-road').getAttribute('data-paused') === 'true', 'controls open from the pause screen (and it stays paused)');
  await shot(page, 'kush-games-zombie-road-paused-desktop.png');
  await page.keyboard.press('p');
  check(await page.getByTestId('zombie-road').getAttribute('data-paused') === 'false', 'P resumes');
  await page.keyboard.press('m');
  check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'true', 'M mutes');
  await page.keyboard.press('m');
  await page.keyboard.press('f');
  check(!(await state(page)).autoFire && await page.evaluate(() => localStorage.getItem('kush-games-zombie-road-auto-fire')) === 'false', 'F turns auto-fire off again (remembered)');

  // persistence: jump to wave 3, pause (saves), reload, the run is restored at the start of wave 3
  await game(page, 'game.debug_set_wave(3)');
  await page.waitForTimeout(100);
  await page.keyboard.press('p');
  const beforeReload = await state(page);
  const saved = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
  check(saved !== null && saved.includes('"wave":3'), 'progress saved on pause');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('zombie-canvas').waitFor();
  const restored = await state(page);
  check(restored.wave === 3 && restored.score === beforeReload.score && restored.lives === beforeReload.lives && String(restored.phase) === Phase.ready,
    `reload restores wave ${restored.wave}, score ${restored.score}, lives ${restored.lives}`);
  check(await page.getByTestId('restored').isVisible() && (await page.getByTestId('zombie-overlay').textContent()).includes('Wave 3'), 'restored banner shows wave 3');
  check(Number(await page.getByTestId('zombie-best').textContent()) >= beforeReload.score && beforeReload.score > 0, 'high score kept through the reload');

  // game over: one life and almost no health, a walker right on top of the survivor
  await page.keyboard.press('Enter');
  check(await waitFor(async () => await phaseOf(page) === Phase.playing, 4000), 'the restored game plays');
  await game(page, 'game.debug_set_lives(1); game.debug_set_health(5); game.debug_spawn_zombie(0, game.player_x(), 280)');
  check(await waitFor(async () => await phaseOf(page) === Phase.gameOver, 5000), 'losing the last life ends the game');
  const finalText = await page.getByTestId('zombie-final-score').textContent();
  check(finalText.includes(`Score ${restored.score}`) && finalText.includes('Wave 3'), `game-over screen: ${finalText}`);
  check(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY) === null, 'the save is cleared at game over');
  check(Number(await page.evaluate(key => localStorage.getItem(key), BEST_KEY)) >= restored.score, 'the high score is stored');
  await page.waitForTimeout(800);
  await shot(page, 'kush-games-zombie-road-gameover-desktop.png');
  await page.getByTestId('zombie-new-game').click();
  const fresh = await state(page);
  check(fresh.wave === 1 && fresh.score === 0 && fresh.lives === 3 && String(fresh.phase) === Phase.waveIntro, 'Play again starts a fresh game at wave 1');
  // the Restart button mid-game
  await waitFor(async () => await phaseOf(page) === Phase.playing, 4000);
  await game(page, 'game.debug_set_wave(4)');
  await page.getByTestId('zombie-restart').click();
  check((await state(page)).wave === 1, 'Restart goes back to wave 1');

  // perf: a busy wave 8, hunting with auto-fire; normal then 4× CPU slowdown
  await game(page, 'game.debug_set_invincible(true); game.set_auto_fire(true); game.debug_set_wave(8)');
  await waitFor(async () => await phaseOf(page) === Phase.playing, 5000);
  await resetPerf(page);
  await hunt(page, 3000);
  const normal = await readPerf(page);
  const cdp = await desktop.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await resetPerf(page);
  await hunt(page, 4000);
  const throttled = await readPerf(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  perfReport.normal = { work: summarize(normal.work), frame: summarize(normal.frame) };
  perfReport.throttled4x = { work: summarize(throttled.work), frame: summarize(throttled.frame), zombies: (await state(page)).alive };
  console.log(`PERF ${JSON.stringify(perfReport)}`);
  check(perfReport.normal.work.p95 < 4, `simulate + draw p95 ${perfReport.normal.work.p95} ms per frame (desktop)`);
  check(perfReport.throttled4x.work.p95 < 12, `simulate + draw p95 ${perfReport.throttled4x.work.p95} ms per frame at 4× CPU slowdown (budget 16.7 ms)`);

  // themes: the start pill and buttons follow the hub theme
  const pillColor = async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('zombie-canvas').waitFor();
    return page.evaluate(() => ({ theme: document.documentElement.dataset.theme ?? 'netflix-red', pill: getComputedStyle(document.querySelector('.zombie-road__hint')).backgroundColor }));
  };
  await page.evaluate(key => { localStorage.removeItem(key); localStorage.removeItem('kush-games:zombie-road:save:v1'); }, THEME_KEY);
  const lagoon = await pillColor();
  check(lagoon.theme === 'lagoon' && lagoon.pill === 'rgb(239, 202, 124)', `Lagoon theme: gold start pill (${lagoon.pill})`);
  await shot(page, 'kush-games-zombie-road-start-lagoon.png');
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), data: { theme: 'netflix-red' } })), THEME_KEY);
  const red = await pillColor();
  check(red.theme === 'netflix-red' && red.pill === 'rgb(255, 255, 255)', `Netflix Red theme: white start pill (${red.pill})`);
  await shot(page, 'kush-games-zombie-road-start-netflix-red.png');
  await desktop.close();

  // ---------- phone, portrait ----------
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await phone.newPage();
  watchErrors(mobile);
  await mobile.goto(gameUrl, { waitUntil: 'networkidle' });
  await mobile.getByTestId('zombie-canvas').waitFor();
  check(await mobile.getByTestId('zombie-touch').isVisible(), 'touch controls visible on a phone');
  check(await noOverflow(mobile), 'no horizontal scroll at 375 px');
  check(await mobile.getByTestId('zombie-auto-fire').textContent() === 'Auto-fire on', 'auto-fire starts on on a phone');
  const stageBox = await mobile.getByTestId('zombie-canvas').boundingBox();
  const fireBox = await mobile.getByTestId('touch-fire').boundingBox();
  const padBox = await mobile.getByTestId('touch-pad').boundingBox();
  check(stageBox.width >= 250 && fireBox.y >= stageBox.y + stageBox.height - 1 && fireBox.y + fireBox.height <= 667 && padBox.y + padBox.height <= 667,
    `portrait: road ${Math.round(stageBox.width)}×${Math.round(stageBox.height)} with the drag pad and FIRE below it, all on screen`);
  const mobileControls = mobile.getByTestId('zombie-controls');
  const mobileControlsBox = await mobileControls.boundingBox();
  check(await mobile.getByTestId('zombie-controls-touch').isVisible() && await mobileControls.getAttribute('data-keys') === 'false', 'phone: the controls card shows the touch buttons (no keyboard keys)');
  check(mobileControlsBox.y >= stageBox.y - 1 && mobileControlsBox.x >= stageBox.x - 1 && mobileControlsBox.x + mobileControlsBox.width <= stageBox.x + stageBox.width + 1, 'phone: the touch diagram fits across the start screen');
  await shot(mobile, 'kush-games-zombie-road-start-mobile.png');
  await mobile.getByTestId('touch-fire').tap();
  check(await waitFor(async () => await phaseOf(mobile) === Phase.waveIntro, 2000), 'tapping FIRE starts the game');
  await waitFor(async () => await phaseOf(mobile) === Phase.playing, 4000);
  await game(mobile, 'game.debug_set_invincible(true)');
  const mobileStart = (await state(mobile)).x;
  const padPointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: padBox.x + padBox.width / 2, clientY: padBox.y + padBox.height / 2 };
  await mobile.getByTestId('touch-pad').dispatchEvent('pointerdown', padPointer);
  await mobile.getByTestId('touch-pad').dispatchEvent('pointermove', { ...padPointer, clientX: padPointer.clientX + padBox.width * 0.3 });
  await mobile.waitForTimeout(700);
  const mobileState = await state(mobile);
  await mobile.getByTestId('touch-pad').dispatchEvent('pointerup', padPointer);
  check(mobileState.x > mobileStart + 30 && mobileState.bullets > 0, `drag pad moves right (${mobileStart.toFixed(0)} → ${mobileState.x.toFixed(0)}) while auto-fire shoots (${mobileState.bullets} bullets)`);
  await hunt(mobile, 10000);
  const mobileHunt = await state(mobile);
  check(mobileHunt.kills > 0 && mobileHunt.score > 0, `phone: auto-fire kills (${mobileHunt.kills} kills, score ${mobileHunt.score})`);
  await shot(mobile, 'kush-games-zombie-road-mobile.png');
  // the FIRE button fires with auto-fire off
  await mobile.getByTestId('zombie-auto-fire').tap();
  await mobile.waitForTimeout(500);
  const quiet = (await state(mobile)).bullets;
  const firePointer = { pointerId: 8, pointerType: 'touch', isPrimary: false, bubbles: true, clientX: fireBox.x + fireBox.width / 2, clientY: fireBox.y + fireBox.height / 2 };
  await mobile.getByTestId('touch-fire').dispatchEvent('pointerdown', firePointer);
  await mobile.waitForTimeout(250);
  const firing = (await state(mobile)).bullets;
  await mobile.getByTestId('touch-fire').dispatchEvent('pointerup', firePointer);
  check(quiet === 0 && firing > 0, `with auto-fire off, holding FIRE shoots (${quiet} → ${firing} bullets)`);
  // dragging on the road walks to the finger
  const canvasPointer = { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: stageBox.x + stageBox.width * 0.15, clientY: stageBox.y + stageBox.height * 0.8 };
  await mobile.getByTestId('zombie-canvas').dispatchEvent('pointerdown', canvasPointer);
  await mobile.waitForTimeout(2000);
  await mobile.getByTestId('zombie-canvas').dispatchEvent('pointerup', canvasPointer);
  const dragged = await state(mobile);
  check(Math.abs(dragged.x - 36) < 6, `touching the road walks the survivor to the finger (x ${dragged.x.toFixed(0)})`);
  await mobile.getByTestId('zombie-pause').tap();
  await mobile.getByTestId('zombie-controls-toggle').tap();
  check(await mobile.getByTestId('zombie-pause-controls').isVisible() && await mobile.getByTestId('zombie-road').getAttribute('data-paused') === 'true' && await noOverflow(mobile),
    'phone: controls open from the pause screen');
  await shot(mobile, 'kush-games-zombie-road-paused-mobile.png');
  // refresh on the phone resumes too
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.getByTestId('zombie-canvas').waitFor();
  check(await mobile.getByTestId('restored').isVisible(), 'phone: a refresh restores the game');
  await phone.close();

  // ---------- phone, landscape ----------
  const sideways = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const landscape = await sideways.newPage();
  watchErrors(landscape);
  await landscape.goto(gameUrl, { waitUntil: 'networkidle' });
  await landscape.getByTestId('zombie-canvas').waitFor();
  const landscapeBox = await landscape.getByTestId('zombie-canvas').boundingBox();
  check(await noOverflow(landscape), 'no horizontal scroll in landscape');
  check(landscapeBox.height >= 240 && landscapeBox.y + landscapeBox.height <= 390, `landscape canvas ${Math.round(landscapeBox.width)}×${Math.round(landscapeBox.height)} fits the screen`);
  const landscapeFire = await landscape.getByTestId('touch-fire').boundingBox();
  const landscapePad = await landscape.getByTestId('touch-pad').boundingBox();
  check(landscapeFire.x >= landscapeBox.x + landscapeBox.width && landscapePad.x + landscapePad.width <= landscapeBox.x, 'landscape: pad and FIRE sit either side of the road');
  await shot(landscape, 'kush-games-zombie-road-start-landscape.png');
  await sideways.close();
} finally {
  await browser.close();
}
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
