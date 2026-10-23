// Kush Jump smoke test: hub card, load, run + jump, a stomp, checkpoint save through a reload, pause, mute,
// finishing the stage (teleport hook near the flag), and phone layouts (portrait + landscape) with touch buttons.
// Usage: node e2e/kush-jump.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const gameUrl = `${siteUrl}?kushJumpTest#/play/kush-jump`;
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const hero = page => page.evaluate(() => { const { game } = window.__kushJumpTest; return { x: game.hero_x(), y: game.hero_y(), phase: game.phase(), lives: game.lives() }; });
const phaseOf = page => page.getByTestId('kush-jump').getAttribute('data-phase');
const waitFor = async (predicate, timeout = 8000, interval = 50) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await predicate()) return true; await new Promise(resolve => setTimeout(resolve, interval)); }
  return false;
};
const watchErrors = page => {
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
};

const browser = await chromium.launch({ executablePath: chromePath, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  // ---------- desktop ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  watchErrors(page);
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  const wasmBeforeOpening = await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('kush_jump')));
  check(!wasmBeforeOpening, 'the Kush Jump wasm is not loaded on the hub');
  check(await page.locator('img[src*="kush-jump"]').count() > 0, 'hub shows the Kush Jump thumbnail');
  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('kush-jump-canvas').waitFor();
  check(await phaseOf(page) === '0', 'loads on the Ready screen');
  check(await page.getByTestId('kush-jump-overlay').textContent().then(text => text.includes('KUSH JUMP')), 'title overlay shown');
  const canvasBox = await page.getByTestId('kush-jump-canvas').boundingBox();
  check(canvasBox.width >= 900 && canvasBox.height >= 400, `desktop canvas ${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)}`);

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowRight');
  let state = await hero(page);
  check(await phaseOf(page) === '1', 'a key press starts play');
  check(state.x > 3 * 16 + 30, `hero walks right (x ${state.x.toFixed(1)})`);
  const groundY = state.y;
  await page.keyboard.down('Space');
  let highest = groundY;
  for (let sample = 0; sample < 12; sample++) { await page.waitForTimeout(40); highest = Math.min(highest, (await hero(page)).y); }
  await page.keyboard.up('Space');
  check(groundY - highest > 30, `hero jumps (rose ${(groundY - highest).toFixed(1)} units)`);
  await waitFor(async () => Math.abs((await hero(page)).y - groundY) < 0.5, 3000);

  // stomp: drop onto the first awake walker
  await page.evaluate(() => window.__kushJumpTest.game.debug_teleport(19));
  await waitFor(() => page.evaluate(() => {
    const { views } = window.__kushJumpTest; const render = views().render;
    for (let index = 0; index < render[16]; index++) if (render[19 + index * 6] === 0 && render[19 + index * 6 + 1] === 1) return true;
    return false;
  }), 3000);
  const stomped = await page.evaluate(async () => {
    const { game, views } = window.__kushJumpTest;
    const render = views().render;
    let walkerX = -1;
    for (let index = 0; index < render[16]; index++) if (render[19 + index * 6] === 0 && render[19 + index * 6 + 1] === 1) { walkerX = render[19 + index * 6 + 2]; break; }
    if (walkerX < 0) return { error: 'no walker' };
    game.debug_drop((walkerX + 1) / 16, 36);
    await new Promise(resolve => setTimeout(resolve, 700));
    return { defeated: game.enemies_defeated(), phase: game.phase(), score: game.score() };
  });
  check(stomped.defeated >= 1 && stomped.phase === 1, `stomp defeats a walker (${JSON.stringify(stomped)})`);

  // mid-level screenshot among the bricks, floating coins and grumbles
  await page.evaluate(() => window.__kushJumpTest.game.debug_teleport(73));
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(450);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-kush-jump-desktop.png` });
  await page.keyboard.up('Space');
  console.log(`saved ${screenshotDirectory}/kush-games-kush-jump-desktop.png`);

  // pause and mute
  await page.keyboard.press('p');
  check(await page.getByTestId('kush-jump').getAttribute('data-paused') === 'true', 'P pauses');
  const pausedX = (await hero(page)).x;
  await page.waitForTimeout(300);
  check((await hero(page)).x === pausedX, 'nothing moves while paused');
  await page.keyboard.press('p');
  check(await page.getByTestId('kush-jump').getAttribute('data-paused') === 'false', 'P resumes');
  await page.getByTestId('mute').click();
  check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'true', 'mute toggles on');
  await page.getByTestId('mute').click();

  // checkpoint → saved → survives a reload
  if (await phaseOf(page) !== '1') { await page.keyboard.press('Enter'); }
  await page.evaluate(() => window.__kushJumpTest.game.debug_teleport(103));
  check(await waitFor(() => page.evaluate(() => window.__kushJumpTest.game.checkpoint_reached())), 'checkpoint reached');
  await page.waitForTimeout(150);
  const savedText = await page.evaluate(() => localStorage.getItem('kush-games:kush-jump:save:v1'));
  check(savedText !== null && JSON.parse(savedText).data.checkpoint === true, 'checkpoint saved');
  const scoreBeforeReload = await page.evaluate(() => window.__kushJumpTest.game.score());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('kush-jump-canvas').waitFor();
  check(await page.getByTestId('restored').isVisible(), 'restored banner after reload');
  const restored = await page.evaluate(() => { const { game } = window.__kushJumpTest; return { checkpoint: game.checkpoint_reached(), score: game.score(), x: game.hero_x() }; });
  check(restored.checkpoint && restored.score === scoreBeforeReload && restored.x === 102 * 16, `progress restored at the checkpoint (${JSON.stringify(restored)})`);

  // finish: teleport near the flag and run right
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__kushJumpTest.game.debug_teleport(195));
  const scoreBeforeFlag = await page.evaluate(() => window.__kushJumpTest.game.score());
  await page.keyboard.down('ArrowRight');
  check(await waitFor(async () => await phaseOf(page) === '4', 4000), 'grabs the flag pole');
  await page.keyboard.up('ArrowRight');
  check(await waitFor(async () => await phaseOf(page) === '5', 15000), 'stage cleared after the fort walk and time count');
  const finalScore = await page.evaluate(() => window.__kushJumpTest.game.score());
  check(finalScore > scoreBeforeFlag + 5000, `flag + time bonus added (${scoreBeforeFlag} → ${finalScore})`);
  check(await page.getByTestId('kush-jump-overlay').textContent().then(text => text.includes('Stage clear')), 'Stage clear overlay');
  check(await page.evaluate(() => localStorage.getItem('kush-games:kush-jump:save:v1')) === null, 'save cleared after the clear');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-kush-jump-clear.png` });
  await desktop.close();

  // ---------- phone, portrait ----------
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await phone.newPage();
  watchErrors(mobile);
  await mobile.goto(gameUrl, { waitUntil: 'networkidle' });
  await mobile.getByTestId('kush-jump-canvas').waitFor();
  check(await mobile.getByTestId('kush-jump-touch').isVisible(), 'touch buttons visible on a phone');
  check(await noOverflow(mobile), 'no horizontal scroll at 375px');
  const stageBox = await mobile.getByTestId('kush-jump-canvas').boundingBox();
  const jumpBox = await mobile.getByTestId('touch-jump').boundingBox();
  check(stageBox.width >= 330 && stageBox.x >= 0 && stageBox.x + stageBox.width <= 375, `portrait canvas ${Math.round(stageBox.width)}×${Math.round(stageBox.height)}`);
  check(jumpBox.y + jumpBox.height <= 667 && jumpBox.y >= stageBox.y + stageBox.height - 1, 'buttons below the canvas, on screen');
  await mobile.getByTestId('touch-jump').tap();
  check(await waitFor(async () => await phaseOf(mobile) === '1', 2000), 'tapping a button starts play');
  const startX = (await hero(mobile)).x;
  const rightBox = await mobile.getByTestId('touch-right').boundingBox();
  const pointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: rightBox.x + rightBox.width / 2, clientY: rightBox.y + rightBox.height / 2 };
  await mobile.getByTestId('touch-right').dispatchEvent('pointerdown', pointer);
  await mobile.waitForTimeout(800);
  await mobile.getByTestId('touch-jump').dispatchEvent('pointerdown', { ...pointer, pointerId: 8 });
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: `${screenshotDirectory}/kush-games-kush-jump-mobile.png` });
  console.log(`saved ${screenshotDirectory}/kush-games-kush-jump-mobile.png`);
  await mobile.getByTestId('touch-jump').dispatchEvent('pointerup', { ...pointer, pointerId: 8 });
  await mobile.getByTestId('kush-jump-touch').locator('.kush-jump__pad').dispatchEvent('pointerup', pointer);
  const movedState = await hero(mobile);
  check(movedState.x > startX + 30, `touch ▶ moves the hero (${startX.toFixed(0)} → ${movedState.x.toFixed(0)})`);
  await phone.close();

  // ---------- phone, landscape ----------
  const sideways = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const landscape = await sideways.newPage();
  watchErrors(landscape);
  await landscape.goto(gameUrl, { waitUntil: 'networkidle' });
  await landscape.getByTestId('kush-jump-canvas').waitFor();
  const landscapeBox = await landscape.getByTestId('kush-jump-canvas').boundingBox();
  check(await noOverflow(landscape), 'no horizontal scroll in landscape');
  check(landscapeBox.height >= 240 && landscapeBox.y + landscapeBox.height <= 390, `landscape canvas ${Math.round(landscapeBox.width)}×${Math.round(landscapeBox.height)} fits the screen`);
  check(await landscape.getByTestId('touch-jump').isVisible(), 'landscape touch buttons visible');
  await landscape.getByTestId('kush-jump-overlay').tap();
  await landscape.waitForTimeout(300);
  await landscape.screenshot({ path: `${screenshotDirectory}/kush-games-kush-jump-landscape.png` });
  await sideways.close();
} finally {
  await browser.close();
}
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
