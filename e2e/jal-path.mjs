// Jal Path e2e: start screen + controls card, turning a pipe with a real click (and a bolted/rock tap refused),
// keyboard turn, pause stops the countdown, solving via the test hook then opening the valve (water flows, houses
// light up, win card, stars), progress survives a refresh (level 2 unlocked), an unsolved board runs the tank dry
// (fail card, Retry resets), the draw loop sleeps when idle, and phones in portrait/landscape (tap, no h-scroll).
// Usage: node e2e/jal-path.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { noOverflow, waitFor } from './relay.mjs';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const shots = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const testUrl = `${siteUrl}?jalTest#/play/jal-path`;
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const pageErrors = [];
const watch = (page, label) => page.on('pageerror', error => { pageErrors.push(`${label}: ${error}`); console.log(`  page error (${label}): ${error}`); });
const state = page => page.evaluate(() => window.__jalTest.state());
const tiles = page => page.evaluate(() => window.__jalTest.tiles());
const point = (page, cell) => page.evaluate(c => window.__jalTest.cellPoint(c), cell);
const firstTurnable = page => page.evaluate(() => { const t = window.__jalTest.tiles(); return t.findIndex((_, c) => window.__jalTest.canRotate(c)); });
const firstStuck = page => page.evaluate(() => { const t = window.__jalTest.tiles(); return t.findIndex((tile, c) => !window.__jalTest.canRotate(c) && (tile.kind === 2 || tile.flags & 1)); });

// ---------- desktop ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  watch(page, 'desktop');
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  check(await page.getByTestId('jal-start').isVisible(), 'start screen shows');
  check((await page.getByTestId('jal-controls').innerText()).includes('Timing'), 'controls card documents the timing');
  check(await page.getByTestId('jal-level-2').isDisabled(), 'level 2 starts locked');
  await page.screenshot({ path: `${shots}/kush-games-pipes-start.png` });
  await page.getByTestId('jal-play').click();
  await waitFor(() => page.evaluate(() => !!window.__jalTest));
  let value = await state(page);
  check(value.phase === 0 && value.tank === 1 && value.width === 5, `level 1 is a 5×5 board in planning with a full tank (${value.width}×${value.height})`);
  const cell = await firstTurnable(page);
  const before = (await tiles(page))[cell].mask;
  const at = await point(page, cell);
  await page.mouse.click(at.x, at.y);
  const after = (await tiles(page))[cell].mask;
  check(after === (((before << 1) | (before >> 3)) & 15), `clicking a pipe turns it 90° clockwise (${before} → ${after})`);
  check((await state(page)).moves === 1, 'the move is counted');
  const stuck = await firstStuck(page);
  if (stuck >= 0) {
    const mask = (await tiles(page))[stuck].mask;
    const p = await point(page, stuck);
    await page.mouse.click(p.x, p.y);
    check((await tiles(page))[stuck].mask === mask, 'a bolted pipe or rock does not turn');
  }
  // keyboard: arrow to cell 0, Space turns it if allowed
  await page.keyboard.press('ArrowRight');
  const canTurnZero = await page.evaluate(() => window.__jalTest.canRotate(0));
  const zero = (await tiles(page))[0].mask;
  await page.keyboard.press('Space');
  check(canTurnZero ? (await tiles(page))[0].mask !== zero : true, 'Space turns the pipe under the keyboard cursor');
  // pause freezes the countdown
  await page.getByTestId('jal-pause').click();
  const frozen = (await state(page)).planLeft;
  await page.waitForTimeout(800);
  check((await state(page)).planLeft === frozen && await page.getByTestId('jal-paused').isVisible(), 'pause stops the countdown');
  await page.keyboard.press('p');
  await page.waitForTimeout(600);
  check((await state(page)).planLeft < frozen, 'resume restarts the countdown');
  await page.waitForTimeout(400);
  check(!(await state(page)).animating, 'the draw loop sleeps while planning (no redraw when idle)');
  await page.screenshot({ path: `${shots}/kush-games-pipes-desktop.png` });
  // hint: turns exactly one route pipe into place and glows
  const wrongOnRoute = () => page.evaluate(() => window.__jalTest.tiles().filter((tile, c) => { const want = window.__jalTest.solution(c); return want !== 0 && tile.mask !== want; }).length);
  check((await page.getByTestId('jal-hint').innerText()).includes('3'), 'Hint button shows 3 hints');
  const hinted = await page.evaluate(() => window.__jalTest.hintCell());
  const masksBefore = (await tiles(page)).map(tile => tile.mask);
  const wrongBefore = await wrongOnRoute();
  await page.getByTestId('jal-hint').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/kush-games-pipes-hint.png` });
  const masksAfter = (await tiles(page)).map(tile => tile.mask);
  const changed = masksAfter.map((mask, c) => mask !== masksBefore[c] ? c : -1).filter(c => c >= 0);
  check(hinted >= 0 && changed.length === 1 && changed[0] === hinted, `a hint turns exactly one pipe (cell ${hinted})`);
  check(masksAfter[hinted] === await page.evaluate(c => window.__jalTest.solution(c), hinted), 'the hinted pipe now sits the right way');
  check(await wrongOnRoute() === wrongBefore - 1, `the route has one fewer wrong pipe (${wrongBefore} → ${wrongBefore - 1})`);
  check((await state(page)).hintsLeft === 2 && await page.getByTestId('jal-hint-note').isVisible(), 'hint count drops to 2 and a note explains it');
  await page.keyboard.press('h');
  check((await state(page)).hintsLeft === 1, 'H key uses a hint too');
  // solve + open valve
  await page.evaluate(() => window.__jalTest.solve());
  await page.getByTestId('jal-valve').click();
  check(await waitFor(async () => (await state(page)).phase === 1, 3000), 'the valve opens: water flows');
  await page.waitForTimeout(1600);
  value = await state(page);
  check(value.tank < 1 && value.animating, `the tank drains while water flows (${Math.round(value.tank * 100)}%)`);
  await page.screenshot({ path: `${shots}/kush-games-pipes-flow.png` });
  check(await waitFor(async () => (await state(page)).housesFull >= 1, 20000), 'a house fills and lights up');
  check(await waitFor(async () => (await state(page)).phase === 2, 30000), 'all three houses watered: level won');
  value = await state(page);
  check(value.housesFull === 3 && value.stars >= 1, `win card data: 3 houses, ${value.stars} stars`);
  check(await page.getByTestId('jal-won').isVisible(), 'win card shows');
  await page.waitForTimeout(400);
  await page.evaluate(() => { const o = document.querySelector('[data-testid="jal-won"]'); if (o) o.style.visibility = 'hidden'; });
  await page.screenshot({ path: `${shots}/kush-games-pipes-houses.png` });
  await page.evaluate(() => { const o = document.querySelector('[data-testid="jal-won"]'); if (o) o.style.visibility = ''; });
  await page.waitForTimeout(3000);
  check(!(await state(page)).animating, 'the draw loop stops a few seconds after the win');
  // progress survives refresh
  await page.reload({ waitUntil: 'networkidle' });
  check(!(await page.getByTestId('jal-level-2').isDisabled()), 'after refresh level 2 is unlocked');
  check((await page.getByTestId('jal-play').innerText()).includes('Level 2'), 'Continue points at level 2');
  check((await page.getByTestId('jal-level-1').innerText()).includes('★'), 'level 1 keeps its stars');
  // fail: open the valve on the scrambled board
  await page.getByTestId('jal-level-1').click();
  await waitFor(() => page.evaluate(() => !!window.__jalTest));
  await page.keyboard.press('v');
  check(await waitFor(async () => (await state(page)).spills > 0, 5000), 'open ends spill water');
  check(await waitFor(async () => (await state(page)).phase === 3, 60000), 'the tank runs dry: level lost');
  check((await state(page)).tank === 0 && await page.getByTestId('jal-lost').isVisible(), 'fail card shows with an empty tank');
  await page.screenshot({ path: `${shots}/kush-games-pipes-fail.png` });
  check((await page.getByTestId('jal-extra-note').innerText()).includes('+5 s'), 'the fail card promises +5 s planning time');
  const basePlan = 40000 - 0; // level 1 base planning time
  await page.getByTestId('jal-retry').click();
  value = await state(page);
  check(value.phase === 0 && value.tank === 1, 'Retry resets the level');
  check(value.planLeft > basePlan + 4000 && await page.getByTestId('jal-extra').isVisible(), `after a loss the retry has +5 s planning (${Math.round(value.planLeft / 1000)} s)`);
  await page.evaluate(() => window.__jalTest.solve());
  await page.keyboard.press('v');
  check(await waitFor(async () => (await state(page)).phase === 2, 30000), 'win the retried level');
  await page.getByTestId('jal-replay').click();
  value = await state(page);
  check(value.planLeft <= basePlan && value.planLeft > basePlan - 1000, `a win takes the extra back but never below the base (${Math.round(value.planLeft / 1000)} s)`);
  await context.close();
}

// ---------- phones ----------
for (const [label, viewport] of [['portrait', { width: 375, height: 812 }], ['landscape', { width: 812, height: 375 }]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  watch(page, label);
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  check(await noOverflow(page), `${label}: start screen has no horizontal scroll`);
  await page.getByTestId('jal-play').tap();
  await waitFor(() => page.evaluate(() => !!window.__jalTest));
  const cell = await firstTurnable(page);
  const before = (await tiles(page))[cell].mask;
  const p = await point(page, cell);
  await page.touchscreen.tap(p.x, p.y);
  check((await tiles(page))[cell].mask !== before, `${label}: tapping turns a pipe`);
  check(await noOverflow(page), `${label}: level has no horizontal scroll`);
  const box = await page.getByTestId('jal-canvas').boundingBox();
  check(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${label}: the board fits the screen width (${Math.round(box.width)}px)`);
  if (label === 'portrait') {
    await page.getByTestId('jal-hint').tap();
    check((await state(page)).hintsLeft === 2, `${label}: tapping Hint works`);
    await page.evaluate(() => window.__jalTest.solve());
    await page.getByTestId('jal-valve').tap();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${shots}/kush-games-pipes-mobile.png` });
  }
  await context.close();
}

await browser.close();
check(pageErrors.length === 0, `no page errors (${pageErrors.length})`);
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
