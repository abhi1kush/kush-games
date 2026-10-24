// Jungle Strike smoke test: hub card (wasm not loaded on the hub), load, move, shoot, an enemy kill, a power-up from a
// capsule, the checkpoint saved through a reload, pause/mute, a perf sample during heavy action (with 4× CPU throttling),
// the boss fight finished through the teleport hook, and phone layouts (portrait + landscape) with multi-touch controls.
// Usage: node e2e/jungle-strike.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const gameUrl = `${siteUrl}?jungleStrikeTest#/play/jungle-strike`;
const SAVE_KEY = 'kush-games:jungle-strike:save:v1';
// render buffer slots (src/games/junglestrike/engine.ts)
const Slot = { entityCount: 17, bulletCount: 18, enemyBulletCount: 19, particleCount: 20, entities: 55, entityStride: 8 };
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const state = page => page.evaluate(() => {
  const { game, views } = window.__jungleStrikeTest;
  const render = views().render;
  return { x: game.hero_x(), y: game.hero_y(), phase: game.phase(), lives: game.lives(), score: game.score(), weapon: game.weapon(), bullets: render[18], defeated: game.enemies_defeated() };
});
const phaseOf = page => page.getByTestId('jungle-strike').getAttribute('data-phase');
const game = (page, script, argument) => page.evaluate(([source, value]) => new Function('game', 'value', source)(window.__jungleStrikeTest.game, value), [script, argument]);
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
const resetPerf = page => page.evaluate(() => { window.__jungleStrikeTest.perf.count = 0; });
const readPerf = page => page.evaluate(() => {
  const { perf } = window.__jungleStrikeTest;
  const length = Math.min(perf.count, perf.workMilliseconds.length);
  return { work: Array.from(perf.workMilliseconds.slice(0, length)), frame: Array.from(perf.frameMilliseconds.slice(0, length)) };
});

const browser = await chromium.launch({ executablePath: chromePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const perfReport = {};
try {
  // ---------- desktop ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  watchErrors(page);
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  const wasmOnHub = await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('jungle_strike')));
  check(!wasmOnHub, 'the Jungle Strike wasm is not loaded on the hub');
  check(await page.locator('img[src*="jungle-strike"]').count() > 0, 'hub shows the Jungle Strike thumbnail');
  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('jungle-strike-canvas').waitFor();
  check(await phaseOf(page) === '0', 'loads on the Ready screen');
  check(await page.getByTestId('jungle-strike-overlay').textContent().then(text => text.includes('JUNGLE STRIKE')), 'title overlay shown');
  const canvasBox = await page.getByTestId('jungle-strike-canvas').boundingBox();
  check(canvasBox.width >= 700 && canvasBox.height >= 350, `desktop canvas ${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)}`);

  // move
  const startX = (await state(page)).x;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowRight');
  check(await phaseOf(page) === '1', 'a key press starts play');
  check((await state(page)).x > startX + 30, `the commando runs right (${startX} → ${(await state(page)).x.toFixed(0)})`);
  await game(page, 'game.debug_set_invincible(true)');
  // jump
  const groundY = (await state(page)).y;
  await page.keyboard.press('z');
  let highest = groundY;
  for (let sample = 0; sample < 10; sample++) { await page.waitForTimeout(40); highest = Math.min(highest, (await state(page)).y); }
  check(groundY - highest > 30, `somersault jump (rose ${(groundY - highest).toFixed(0)} units)`);
  await page.waitForTimeout(600);

  // shoot (hold fire = auto-fire)
  await page.keyboard.down('x');
  let mostBullets = 0;
  for (let sample = 0; sample < 8; sample++) { await page.waitForTimeout(50); mostBullets = Math.max(mostBullets, (await state(page)).bullets); }
  await page.keyboard.up('x');
  check(mostBullets >= 2, `holding X auto-fires (${mostBullets} bullets in flight)`);
  // aim: up + fire while standing
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(60);
  check(await game(page, 'return game.hero_aim()') === 6, 'Up aims straight up');
  await page.keyboard.up('ArrowUp');

  // an enemy kill
  await game(page, 'game.debug_teleport(1320)');
  await page.waitForTimeout(100);
  const defeatedBefore = (await state(page)).defeated;
  await game(page, 'return game.debug_spawn_soldier(90)');
  await page.keyboard.down('x');
  check(await waitFor(async () => (await state(page)).defeated > defeatedBefore, 3000), 'a foot soldier goes down to rifle fire');
  await page.keyboard.up('x');

  // a power-up: shoot a capsule open, then walk into the pickup
  await game(page, 'game.debug_teleport(1300)');
  await page.evaluate(() => { const { views } = window.__jungleStrikeTest; void views; });
  await game(page, 'return game.debug_spawn_capsule(2)');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('x');
  const opened = await waitFor(() => page.evaluate(() => {
    const render = window.__jungleStrikeTest.views().render;
    for (let index = 0; index < render[17]; index++) if (render[55 + index * 8] === 5) return true;
    return false;
  }), 4000);
  await page.keyboard.up('x');
  await page.keyboard.up('ArrowUp');
  check(opened, 'shooting the flying capsule releases a weapon pickup');
  let collected = false;
  for (let attempt = 0; attempt < 40 && !collected; attempt++) {
    const pickupX = await page.evaluate(() => {
      const render = window.__jungleStrikeTest.views().render;
      for (let index = 0; index < render[17]; index++) if (render[55 + index * 8] === 5) return render[55 + index * 8 + 2];
      return null;
    });
    const { x, weapon } = await state(page);
    if (weapon === 2) { collected = true; break; }
    if (pickupX === null) break;
    const key = pickupX > x ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key); await page.waitForTimeout(80); await page.keyboard.up(key);
    await page.waitForTimeout(40);
  }
  collected ||= (await state(page)).weapon === 2;
  check(collected, 'walking into the pickup gives the Spread gun');

  // desktop mid-action screenshot with the spread gun
  await game(page, 'game.debug_teleport(1430)');
  await game(page, 'game.debug_spawn_soldier(150)');
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('x');
  await page.waitForTimeout(500);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-jungle-strike-desktop.png` });
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('x'); await page.keyboard.up('ArrowRight');
  console.log(`saved ${screenshotDirectory}/kush-games-jungle-strike-desktop.png`);

  // pause and mute
  await page.keyboard.press('p');
  check(await page.getByTestId('jungle-strike').getAttribute('data-paused') === 'true', 'P pauses');
  const pausedX = (await state(page)).x;
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.up('ArrowRight');
  check((await state(page)).x === pausedX, 'nothing moves while paused');
  check(await page.evaluate(key => localStorage.getItem(key) !== null, SAVE_KEY), 'pausing saves progress');
  await page.keyboard.press('p');
  check(await page.getByTestId('jungle-strike').getAttribute('data-paused') === 'false', 'P resumes');
  await page.keyboard.press('m');
  check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'true', 'M mutes');
  await page.keyboard.press('m');

  // checkpoint → saved → survives a reload
  await game(page, 'game.debug_teleport(1880)');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(450); await page.keyboard.up('ArrowRight');
  check(await waitFor(() => game(page, 'return game.checkpoint_reached()')), 'midway checkpoint reached');
  await page.waitForTimeout(150);
  const savedText = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
  const saved = savedText && JSON.parse(savedText).data;
  check(saved?.checkpoint === true && saved.weapon === 2, `checkpoint saved with the weapon (${savedText})`);
  const beforeReload = await state(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('jungle-strike-canvas').waitFor();
  check(await page.getByTestId('restored').isVisible(), 'restored banner after the reload');
  const restored = await page.evaluate(() => { const { game } = window.__jungleStrikeTest; return { checkpoint: game.checkpoint_reached(), score: game.score(), x: game.hero_x(), weapon: game.weapon(), lives: game.lives() }; });
  check(restored.checkpoint && restored.score === beforeReload.score && restored.x === 1880 && restored.weapon === 2 && restored.lives === beforeReload.lives,
    `restored at the checkpoint with score, lives and weapon (${JSON.stringify(restored)})`);

  // perf during heavy action: spread gun, soldiers, turrets, explosions; normal speed then 4× CPU throttling
  await page.keyboard.press('Enter');
  await game(page, 'game.debug_set_invincible(true); game.debug_set_weapon(2); game.debug_teleport(2300)');
  const heavyAction = async milliseconds => {
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('x');
    const end = Date.now() + milliseconds;
    let peak = { bullets: 0, enemies: 0, particles: 0 };
    let toggle = 0;
    while (Date.now() < end) {
      await page.evaluate(() => { const { game } = window.__jungleStrikeTest; game.debug_spawn_soldier(120); game.debug_spawn_soldier(200); });
      if (toggle++ % 2) await page.keyboard.down('ArrowUp'); else await page.keyboard.up('ArrowUp');
      const counts = await page.evaluate(() => { const render = window.__jungleStrikeTest.views().render; return { bullets: render[18] + render[19], enemies: render[17], particles: render[20] }; });
      peak = { bullets: Math.max(peak.bullets, counts.bullets), enemies: Math.max(peak.enemies, counts.enemies), particles: Math.max(peak.particles, counts.particles) };
      await page.waitForTimeout(250);
    }
    await page.keyboard.up('ArrowUp'); await page.keyboard.up('x'); await page.keyboard.up('ArrowRight');
    return peak;
  };
  await resetPerf(page);
  const peakNormal = await heavyAction(3000);
  const normal = await readPerf(page);
  const cdp = await desktop.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await game(page, 'game.debug_teleport(2600)');
  await resetPerf(page);
  const peakThrottled = await heavyAction(4000);
  const throttled = await readPerf(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  perfReport.normal = { work: summarize(normal.work), frame: summarize(normal.frame), peak: peakNormal };
  perfReport.throttled4x = { work: summarize(throttled.work), frame: summarize(throttled.frame), peak: peakThrottled };
  console.log(`PERF ${JSON.stringify(perfReport)}`);
  check(perfReport.normal.work.p95 < 4, `simulate + draw p95 ${perfReport.normal.work.p95} ms per frame (desktop)`);
  check(perfReport.throttled4x.work.p95 < 12, `simulate + draw p95 ${perfReport.throttled4x.work.p95} ms per frame at 4× CPU slowdown (budget 16.7 ms)`);
  check(perfReport.throttled4x.frame.average < 20, `frame interval ${perfReport.throttled4x.frame.average} ms average at 4× CPU slowdown`);

  // the boss: teleport to the gate, take the Laser, screenshot the fight, then destroy the core
  await game(page, 'game.debug_teleport(3750); game.debug_set_weapon(3)');
  await page.keyboard.down('x');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-jungle-strike-boss.png` });
  await page.keyboard.press('z');
  console.log(`saved ${screenshotDirectory}/kush-games-jungle-strike-boss.png`);
  check(await waitFor(async () => await phaseOf(page) === '4', 20000), 'the gate core is destroyed');
  await page.keyboard.up('x');
  check(await waitFor(async () => await phaseOf(page) === '5', 6000), 'stage clear after the gate blows');
  check(await page.getByTestId('jungle-strike-overlay').textContent().then(text => text.includes('Stage clear')), 'Stage clear overlay');
  check(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY) === null, 'save cleared after the clear');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-jungle-strike-clear.png` });
  await desktop.close();

  // ---------- phone, portrait ----------
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await phone.newPage();
  watchErrors(mobile);
  await mobile.goto(gameUrl, { waitUntil: 'networkidle' });
  await mobile.getByTestId('jungle-strike-canvas').waitFor();
  check(await mobile.getByTestId('jungle-strike-touch').isVisible(), 'touch controls visible on a phone');
  check(await noOverflow(mobile), 'no horizontal scroll at 375 px');
  const stageBox = await mobile.getByTestId('jungle-strike-canvas').boundingBox();
  const fireBox = await mobile.getByTestId('touch-fire').boundingBox();
  const stickBox = await mobile.getByTestId('touch-stick').boundingBox();
  check(stageBox.width >= 330 && stageBox.x >= 0 && stageBox.x + stageBox.width <= 375, `portrait canvas ${Math.round(stageBox.width)}×${Math.round(stageBox.height)}`);
  check(fireBox.y + fireBox.height <= 667 && stickBox.y >= stageBox.y + stageBox.height - 1 && stickBox.x >= 0, 'stick and buttons below the canvas, on screen');
  await mobile.getByTestId('touch-fire').tap();
  check(await waitFor(async () => await phaseOf(mobile) === '1', 2000), 'tapping FIRE starts play');
  await game(mobile, 'game.debug_set_invincible(true)');
  const mobileStart = (await state(mobile)).x;
  // two fingers at once: stick pushed right-and-up, FIRE held
  const stickPointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: stickBox.x + stickBox.width * 0.92, clientY: stickBox.y + stickBox.height * 0.1 };
  const firePointer = { pointerId: 8, pointerType: 'touch', isPrimary: false, bubbles: true, clientX: fireBox.x + fireBox.width / 2, clientY: fireBox.y + fireBox.height / 2 };
  await mobile.getByTestId('touch-stick').dispatchEvent('pointerdown', stickPointer);
  await mobile.getByTestId('touch-fire').dispatchEvent('pointerdown', firePointer);
  await mobile.waitForTimeout(700);
  const mobileState = await state(mobile);
  const mobileAim = await game(mobile, 'return game.hero_aim()');
  await mobile.screenshot({ path: `${screenshotDirectory}/kush-games-jungle-strike-mobile.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-jungle-strike-mobile.png`);
  await mobile.getByTestId('touch-fire').dispatchEvent('pointerup', firePointer);
  await mobile.getByTestId('touch-stick').dispatchEvent('pointerup', stickPointer);
  check(mobileState.x > mobileStart + 20 && mobileAim === 7 && mobileState.bullets > 0, `stick + FIRE together: runs (${mobileStart.toFixed(0)} → ${mobileState.x.toFixed(0)}), aims up-right (${mobileAim}) and shoots (${mobileState.bullets})`);
  await phone.close();

  // ---------- phone, landscape ----------
  const sideways = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const landscape = await sideways.newPage();
  watchErrors(landscape);
  await landscape.goto(gameUrl, { waitUntil: 'networkidle' });
  await landscape.getByTestId('jungle-strike-canvas').waitFor();
  const landscapeBox = await landscape.getByTestId('jungle-strike-canvas').boundingBox();
  check(await noOverflow(landscape), 'no horizontal scroll in landscape');
  check(landscapeBox.height >= 240 && landscapeBox.y + landscapeBox.height <= 390, `landscape canvas ${Math.round(landscapeBox.width)}×${Math.round(landscapeBox.height)} fits the screen`);
  check(await landscape.getByTestId('touch-fire').isVisible() && await landscape.getByTestId('touch-stick').isVisible(), 'landscape controls visible');
  await landscape.getByTestId('jungle-strike-overlay').tap();
  await landscape.waitForTimeout(400);
  await landscape.screenshot({ path: `${screenshotDirectory}/kush-games-jungle-strike-landscape.png` });
  await sideways.close();
} finally {
  await browser.close();
}
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
