// Paani Pour e2e: start screen + how-to card, lifting and pouring with real clicks (top-colour rule enforced by
// Rust), the pour animation, undo, hint, solving a level by clicks (win card, stars), progress and a level in play
// surviving a refresh, the draw loop sleeping when idle, and phones in portrait/landscape (tap, no h-scroll).
// Usage: node e2e/paani-pour.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { noOverflow, waitFor } from './relay.mjs';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const shots = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const testUrl = `${siteUrl}?pourTest#/play/paani-pour`;
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const pageErrors = [];
const watch = (page, label) => page.on('pageerror', error => { pageErrors.push(`${label}: ${error}`); console.log(`  page error (${label}): ${error}`); });
const state = page => page.evaluate(() => window.__pourTest.state());
const layers = page => page.evaluate(() => window.__pourTest.layers());
const point = (page, tube) => page.evaluate(t => window.__pourTest.tubePoint(t), tube);
const idle = page => waitFor(async () => !(await state(page)).animating, 5000, 30);
async function clickTube(page, tube, touch = false) {
  const p = await point(page, tube);
  if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
async function pourByClicks(page, from, to, touch = false) { await clickTube(page, from, touch); await clickTube(page, to, touch); }
async function followHint(page) {
  const hint = await page.evaluate(() => window.__pourTest.peekHint());
  if (hint < 0) return false;
  await pourByClicks(page, hint >> 4, hint & 15);
  await idle(page);
  return true;
}
async function deselect(page) { const selected = (await state(page)).selected; if (selected !== null) await clickTube(page, selected); }
const unlockAll = page => page.evaluate(() => localStorage.setItem('kush-games:paani-pour:save:v1', JSON.stringify({ version: 1, savedAt: Date.now(), data: { unlocked: 20, stars: Array(20).fill(0), current: 19, savedLevel: -1, savedPours: [] } })));

// ---------- desktop ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  watch(page, 'desktop');
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  check(await page.getByTestId('pour-start').isVisible(), 'start screen shows');
  check((await page.getByTestId('pour-controls').innerText()).includes('top colour'), 'how-to card explains the pour rule');
  check(await page.getByTestId('pour-level-2').isDisabled(), 'level 2 starts locked');
  await page.screenshot({ path: `${shots}/kush-games-watersort-start.png` });
  await page.getByTestId('pour-play').click();
  await waitFor(() => page.evaluate(() => !!window.__pourTest));
  let value = await state(page);
  check(value.tubes === 5 && value.colours === 3 && value.pours === 0, `level 1: 3 colours in 5 tubes (par ${value.par})`);
  // lift and put down
  await clickTube(page, 0);
  check((await state(page)).selected === 0, 'tapping a tube lifts it');
  await clickTube(page, 0);
  check((await state(page)).selected === null, 'tapping it again puts it down');
  // an illegal pour: find a pair Rust refuses where the target is not empty
  const start = await layers(page);
  const illegal = await page.evaluate(() => { const t = window.__pourTest.layers(); for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) if (a !== b && t[a].length && t[b].length === 4) return [a, b]; return null; });
  if (illegal) {
    await pourByClicks(page, illegal[0], illegal[1]);
    check(JSON.stringify(await layers(page)) === JSON.stringify(start) && (await state(page)).pours === 0, 'pouring onto a full tube is refused');
    await deselect(page);
  }
  // a legal pour by clicks, with the animation
  const hint = await page.evaluate(() => window.__pourTest.peekHint());
  const [from, to] = [hint >> 4, hint & 15];
  const topColour = start[from][start[from].length - 1];
  await pourByClicks(page, from, to);
  await page.waitForTimeout(380);
  await page.screenshot({ path: `${shots}/kush-games-watersort-pour.png` });
  value = await state(page);
  check(value.pours === 1 && value.animating, 'the pour counts and animates');
  const after = await layers(page);
  check(after[to][after[to].length - 1] === topColour && after[from].length < start[from].length, 'the top colour moved across');
  check(await idle(page), 'the animation ends and the draw loop sleeps');
  await page.getByTestId('pour-undo').click();
  check(JSON.stringify(await layers(page)) === JSON.stringify(start) && (await state(page)).pours === 0, 'Undo restores the tubes');
  // keyboard pour
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('ArrowRight');
  for (let index = 0; index < from; index++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  check((await state(page)).selected === from, 'arrow keys + Space lift a tube');
  await deselect(page);
  // hint
  await page.getByTestId('pour-hint').click();
  check((await state(page)).hintsLeft === 2 && (await page.getByTestId('pour-note').innerText()).includes('Hint'), 'Hint shows one pour and uses one of three');
  await followHint(page);
  await page.screenshot({ path: `${shots}/kush-games-watersort-desktop.png` });
  let guard = 0;
  while (!(await state(page)).solved && guard++ < 80) if (!(await followHint(page))) break;
  check(await waitFor(() => page.getByTestId('pour-won').isVisible(), 4000), 'solving every tube shows the win card');
  value = await state(page);
  check(value.solved && value.stars === 2, `a hint caps the stars at two (${value.stars})`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${shots}/kush-games-watersort-win.png` });
  check(!(await state(page)).animating, 'nothing redraws once settled');
  await page.reload({ waitUntil: 'networkidle' });
  check(!(await page.getByTestId('pour-level-2').isDisabled()) && (await page.getByTestId('pour-level-1').innerText()).includes('★'), 'after refresh: level 2 unlocked, level 1 keeps stars');
  // a level in play survives a refresh
  await page.getByTestId('pour-play').click();
  await waitFor(() => page.evaluate(() => !!window.__pourTest));
  check((await state(page)).level === 1, 'Continue opens level 2');
  await followHint(page); await followHint(page);
  const midway = await layers(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('pour-play').click();
  await waitFor(() => page.evaluate(() => !!window.__pourTest));
  check((await state(page)).pours === 2 && JSON.stringify(await layers(page)) === JSON.stringify(midway), 'the level in play is restored after a refresh');
  check(await page.getByTestId('pour-restored').isVisible(), 'a note says it picked up where you left off');
  await page.getByTestId('pour-reset').click();
  check((await state(page)).pours === 0, 'Reset starts the level over');
  await context.close();
}

// ---------- phones ----------
for (const [label, viewport] of [['portrait', { width: 375, height: 812 }], ['landscape', { width: 812, height: 375 }]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  watch(page, label);
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await unlockAll(page);
  await page.reload({ waitUntil: 'networkidle' });
  check(await noOverflow(page), `${label}: start screen has no horizontal scroll`);
  await page.getByTestId('pour-play').tap();
  await waitFor(() => page.evaluate(() => !!window.__pourTest));
  const value = await state(page);
  check(value.tubes === 14, `${label}: level 20 has 14 tubes`);
  const hint = await page.evaluate(() => window.__pourTest.peekHint());
  await pourByClicks(page, hint >> 4, hint & 15, true);
  check((await state(page)).pours === 1, `${label}: tapping two tubes pours`);
  check(await noOverflow(page), `${label}: level has no horizontal scroll`);
  const box = await page.getByTestId('pour-canvas').boundingBox();
  check(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${label}: tubes fit the screen width`);
  if (label === 'portrait') { await page.waitForTimeout(350); await page.screenshot({ path: `${shots}/kush-games-watersort-mobile.png` }); }
  await context.close();
}

await browser.close();
check(pageErrors.length === 0, `no page errors (${pageErrors.length})`);
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
