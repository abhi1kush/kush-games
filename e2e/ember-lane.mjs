// Ember Lane e2e: title screen + controls card, walking with real keys (Lio follows), pause (frame loop sleeps,
// controls card shown), throwing an ember into a cold brazier, death in the dark to the rats and waking at the
// checkpoint, Continue after a refresh, taking the lantern, the shutter levers and clearing the stage at the
// sanctuary door (saved), mute, and phones in portrait/landscape with touch controls and no sideways scroll.
// Usage: node e2e/ember-lane.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { noOverflow, waitFor } from './relay.mjs';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const shots = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const testUrl = `${siteUrl}?emberTest#/play/ember-lane`;
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const pageErrors = [];
const watch = (page, label) => page.on('pageerror', error => { pageErrors.push(`${label}: ${error}`); console.log(`  page error (${label}): ${error}`); });
const info = page => page.evaluate(() => window.__emberTest.info());
const begin = (page, checkpoint) => page.evaluate(c => window.__emberTest.begin(c), checkpoint);
const walkTo = (page, x) => page.evaluate(target => window.__emberTest.walkTo(target), x);
const wait = (page, seconds) => page.evaluate(s => window.__emberTest.wait(s), seconds);
const canvasHash = page => page.evaluate(() => { const data = document.querySelector('[data-testid=ember-canvas]').toDataURL(); let h = 0; for (let i = 0; i < data.length; i += 7) h = (h * 31 + data.charCodeAt(i)) | 0; return h; });
const press = async (page, key) => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press(key); };
async function hold(page, key, ms) { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); }

/** The tutorial line must sit in the upper part of the stage: below the HUD and above Mira's and Lio's heads. */
async function hintClearOfCharacters(page) {
  return page.evaluate(() => {
    const hint = document.querySelector('[data-testid=ember-hint]')?.getBoundingClientRect();
    const stage = document.querySelector('[data-testid=ember-stage]').getBoundingClientRect();
    if (!hint) return { ok: false, why: 'no hint' };
    const scale = Math.min(stage.height / 178, stage.width / 255);
    const headTop = stage.top + stage.height - 27 * scale + 7 * scale - 52 * scale;
    const hudBottom = Math.max(...[...document.querySelectorAll('[data-testid=ember-hud] > * > *')].map(element => element.getBoundingClientRect().bottom));
    return { ok: hint.bottom < headTop && hint.top >= hudBottom - 1, hintTop: Math.round(hint.top - stage.top), hintBottom: Math.round(hint.bottom - stage.top), headTop: Math.round(headTop - stage.top), hudBottom: Math.round(hudBottom - stage.top) };
  });
}

// ---------- desktop ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  watch(page, 'desktop');
  await page.goto(testUrl);
  await page.getByTestId('ember-start').waitFor({ timeout: 20000 });
  await page.evaluate(() => { localStorage.removeItem('kush-games:ember-lane:save:v1'); localStorage.setItem('kush-games-muted', 'true'); });
  await page.reload();
  await page.getByTestId('ember-start').waitFor({ timeout: 20000 });
  check(await page.getByRole('heading', { name: 'Ember Lane' }).isVisible(), 'title card shows the game name');
  check(await page.getByTestId('ember-controls').isVisible(), 'start screen shows the controls card');
  check(!(await page.getByTestId('ember-continue').count()), 'no Continue on a fresh save');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/kush-games-ember-start.png` });

  await page.getByTestId('ember-play').click();
  await page.getByTestId('ember-hud').waitFor();
  await page.getByTestId('ember-hint').waitFor();
  const hintSpot = await hintClearOfCharacters(page);
  check(hintSpot.ok, `desktop: tutorial text sits above the characters and below the HUD ${JSON.stringify(hintSpot)}`);
  const before = await info(page);
  await hold(page, 'ArrowRight', 1600);
  const walked = await info(page);
  check(walked.x > before.x + 80, `ArrowRight walks Mira forward (${before.x.toFixed(0)} → ${walked.x.toFixed(0)})`);
  await page.waitForTimeout(700);
  const after = await info(page);
  check(after.sibling > before.sibling + 60 && after.sibling < after.x, `Lio follows behind (${after.sibling.toFixed(0)})`);
  check(after.lit && after.deaths === 0, 'the torch-lit start is safe');
  await hold(page, 'd', 900);
  await page.screenshot({ path: `${shots}/kush-games-ember-desktop.png` });

  // pause
  await press(page, 'p');
  await page.getByTestId('ember-paused').waitFor();
  check(await page.getByTestId('ember-paused').getByTestId('ember-controls').isVisible(), 'pause shows the controls card');
  const pausedAt = (await info(page)).time;
  const hashA = await canvasHash(page);
  await page.waitForTimeout(600);
  check((await info(page)).time === pausedAt && (await canvasHash(page)) === hashA, 'paused: the clock stops and nothing is redrawn');
  await page.getByTestId('ember-resume').click();
  await page.waitForTimeout(300);
  check((await info(page)).time > pausedAt, 'resume restarts the clock');

  // mute toggle
  const pressedBefore = await page.getByTestId('mute').first().getAttribute('aria-pressed');
  await press(page, 'm');
  check((await page.getByTestId('mute').first().getAttribute('aria-pressed')) !== pressedBefore, 'M toggles mute');
  await press(page, 'm');

  // braziers: throw an ember with F
  await begin(page, 1);
  await page.waitForTimeout(200);
  await walkTo(page, 1060);
  const embers = (await info(page)).embers;
  check(embers === 3, `three embers at Torch Lane's checkpoint (${embers})`);
  check(await page.evaluate(() => window.__emberTest.game().light_at(1250)) < 0.2, 'the square beyond is dark before the throw');
  await press(page, 'f');
  await page.waitForTimeout(250);
  check(await page.evaluate(() => window.__emberTest.game().ember_active()), 'F throws an ember in an arc');
  await page.waitForTimeout(1400);
  check(await page.evaluate(() => window.__emberTest.game().light_at(1250)) > 0.5, 'the ember lights the cold brazier');
  check((await info(page)).embers === embers - 1, 'one ember spent');
  await hold(page, 'ArrowRight', 1200);
  await page.screenshot({ path: `${shots}/kush-games-ember-light.png` });

  // death in the dark → checkpoint
  await begin(page, 1);
  await page.waitForTimeout(200);
  await walkTo(page, 1090);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('ArrowRight');
  await waitFor(async () => (await info(page)).danger > 0.45 || (await info(page)).deaths > 0, 12000, 40);
  await page.screenshot({ path: `${shots}/kush-games-ember-rats.png` });
  await waitFor(async () => (await info(page)).deaths > 0, 12000, 50);
  await page.keyboard.up('ArrowRight');
  check((await info(page)).deaths === 1, 'walking into the dark lets the rats take you');
  await waitFor(async () => (await info(page)).state !== 5, 6000, 50);
  const respawned = await info(page);
  check(Math.abs(respawned.x - 990) < 6 && respawned.checkpoint === 1 && respawned.embers === 3, `wake at the Torch Lane checkpoint with embers back (${respawned.x.toFixed(0)})`);

  // refresh → Continue
  await page.reload();
  await page.getByTestId('ember-start').waitFor({ timeout: 20000 });
  const continueText = await page.getByTestId('ember-continue').textContent().catch(() => '');
  check(continueText.includes('Brazier Square'), `Continue from the saved checkpoint after a refresh ("${continueText}")`);
  await page.getByTestId('ember-continue').click();
  await page.getByTestId('ember-hud').waitFor();
  check(Math.abs((await info(page)).x - 990) < 6, 'Continue starts at the checkpoint');

  // Cooper's Yard, played the way that used to dead-end: slide the crate right, then climb
  await begin(page, 3);
  await page.waitForTimeout(200);
  await hold(page, 'ArrowRight', 5000);
  let yard = await info(page);
  check(yard.deaths === 0 && yard.crate < 2600 && yard.prompt === 4, `sliding the crate right stops short of the fire pot and offers the climb (crate ${yard.crate.toFixed(0)})`);
  await press(page, 'e');
  await page.waitForTimeout(2500);
  yard = await info(page);
  check(yard.onCrate && yard.deaths === 0 && yard.siblingY > 10, 'E climbs ONTO the crate; Mira and Lio are safe up there');
  check((await page.getByTestId('ember-hint').textContent()).includes('fire pot'), 'the hint says to light the fire pot from the crate');
  await press(page, 'f');
  await page.waitForTimeout(1400);
  check((await info(page)).pot > 0, 'an ember from the crate lights the fire pot');
  await page.screenshot({ path: `${shots}/kush-games-ember-crate-fix.png` });
  await press(page, 'e');
  await page.waitForTimeout(800);
  yard = await info(page);
  check(!yard.onCrate && yard.x > yard.crate && yard.lit, 'E hops down on the far side, into the pot’s light');
  await hold(page, 'ArrowLeft', 2600);
  yard = await info(page);
  check(yard.crate <= 2535, `pushing left moves the crate behind the brazier (${yard.crate.toFixed(0)})`);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('ArrowRight');
  await waitFor(async () => (await info(page)).checkpoint === 4 || (await info(page)).deaths > 0, 20000, 100);
  await page.keyboard.up('ArrowRight');
  yard = await info(page);
  check(yard.checkpoint === 4 && yard.deaths === 0, 'Cooper’s Yard cleared without a death');

  // the lantern
  await begin(page, 2);
  await page.waitForTimeout(200);
  await walkTo(page, 1765);
  await page.waitForTimeout(100);
  check((await info(page)).prompt === 1, 'the lantern offers “Take the lantern”');
  await press(page, 'e');
  await page.waitForTimeout(150);
  check((await info(page)).carrying && (await page.getByTestId('ember-oil').isVisible()), 'E takes the lantern; the oil gauge shows');

  // shutter levers and the sanctuary door
  await begin(page, 4);
  await page.waitForTimeout(200);
  await walkTo(page, 3060);
  await press(page, 'e');
  await page.waitForTimeout(150);
  check((await page.evaluate(() => window.__emberTest.windows())).join() === 'true,false', 'E pulls the first lever: its shutters open');
  await wait(page, 1);
  await walkTo(page, 3262);
  await press(page, 'e');
  await page.waitForTimeout(150);
  const windows = await page.evaluate(() => window.__emberTest.windows());
  check(!windows[0] && windows[1], 'the second lever shares the rope: it opens its shutter and closes the first');
  await wait(page, 0.5);
  await walkTo(page, 3640);
  await hold(page, 'ArrowRight', 1500);
  await page.getByTestId('ember-clear').waitFor({ timeout: 8000 }).catch(() => {});
  check(await page.getByTestId('ember-clear').isVisible(), 'reaching the lit doorway together clears the stage');
  check((await info(page)).deaths === 0, 'cleared without a fall');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/kush-games-ember-clear.png` });
  await page.reload();
  await page.getByTestId('ember-start').waitFor({ timeout: 20000 });
  const record = await page.getByTestId('ember-record').textContent().catch(() => '');
  check(record.includes('1×'), `the clear is saved ("${record}")`);
  await context.close();
}

// ---------- phone portrait + landscape ----------
for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  watch(page, label);
  await page.goto(testUrl);
  await page.getByTestId('ember-start').waitFor({ timeout: 20000 });
  check(await noOverflow(page), `${label}: start screen has no sideways scroll`);
  await page.getByTestId('ember-play').tap();
  await page.getByTestId('ember-touch').waitFor();
  check(await page.getByTestId('touch-throw').isVisible(), `${label}: touch controls show`);
  await page.getByTestId('ember-hint').waitFor();
  const hintSpot = await hintClearOfCharacters(page);
  check(hintSpot.ok, `${label}: tutorial text sits above the characters and below the HUD ${JSON.stringify(hintSpot)}`);
  const start = (await info(page)).x;
  const box = await page.getByTestId('touch-right').boundingBox();
  const cdp = await context.newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(1500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const moved = (await info(page)).x;
  check(moved > start + 60, `${label}: holding ▶ walks (${start.toFixed(0)} → ${moved.toFixed(0)})`);
  check(await noOverflow(page), `${label}: playing has no sideways scroll`);
  if (label === 'portrait') {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shots}/kush-games-ember-mobile.png` });
  }
  await context.close();
}

check(pageErrors.length === 0, `no page errors (${pageErrors.length})`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
