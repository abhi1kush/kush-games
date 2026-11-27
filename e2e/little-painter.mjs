// Little Painter smoke test: hub card + Kids filter (wasm not loaded on the hub), lazy wasm load, the Peacock as the default
// first picture, real taps coloring regions (inside the lines: only the tapped region changes), multi-step Undo, switching
// pictures, a refresh resuming the colors, Clear (confirm dialog, then Undo brings it back), ✨ Find, the PNG download,
// coloring the whole Peacock (celebration + ⭐ on its picker thumbnail), mute, both hub themes, and clean desktop,
// tablet and phone (portrait + landscape) layouts.
// Usage: node e2e/little-painter.mjs [siteUrl] [screenshotDirectory]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace/coloring-shots';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const gameUrl = `${siteUrl}?paintTest#/play/little-painter`;
const SAVE_KEY = 'kush-games:little-painter:save:v1';
const THEME_KEY = 'kush-games:theme:save:v1';
const WHITE = 'rgb(255, 255, 255)';
// Peacock regions (src/games/littlepainter/pictures.ts)
const Peacock = { sky: 0, sun: 1, cloud: 2, grass: 3, fan: 4, feathers: [5, 6, 7, 8, 9, 10], eyespots: [11, 12, 13, 14, 15, 16], eyeCentres: [17, 18, 19, 20, 21, 22],
  legs: 23, neck: 24, body: 25, wing: 26, head: 27, crest: 28, beak: 29, leftPetals: 30, leftCentre: 31, rightPetals: 32, rightCentre: 33, count: 34 };
// palette indexes (book.rs PALETTE + 1)
const Paint = { eraser: 0, red: 1, orange: 2, yellow: 3, lime: 4, leaf: 5, teal: 6, sky: 7, ocean: 8, purple: 9, pink: 10, peach: 11, brown: 12, sand: 13, gray: 14, charcoal: 15, snow: 16 };
/** A cheerful peacock: blue-green bird, golden eyespots, a peach evening sky. */
const PEACOCK_COLORS = new Map([
  [Peacock.sky, Paint.peach], [Peacock.sun, Paint.yellow], [Peacock.cloud, Paint.snow], [Peacock.grass, Paint.leaf], [Peacock.fan, Paint.lime],
  ...Peacock.feathers.map((region, i) => [region, i % 2 ? Paint.teal : Paint.leaf]), ...Peacock.eyespots.map(region => [region, Paint.yellow]),
  ...Peacock.eyeCentres.map((region, i) => [region, i % 2 ? Paint.purple : Paint.ocean]),
  [Peacock.legs, Paint.gray], [Peacock.neck, Paint.ocean], [Peacock.body, Paint.ocean], [Peacock.wing, Paint.teal], [Peacock.head, Paint.ocean],
  [Peacock.crest, Paint.pink], [Peacock.beak, Paint.orange], [Peacock.leftPetals, Paint.pink], [Peacock.leftCentre, Paint.yellow],
  [Peacock.rightPetals, Paint.purple], [Peacock.rightCentre, Paint.yellow],
]);

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
const shot = async (page, name) => {
  const path = `${screenshotDirectory}/${name}`;
  await page.screenshot({ path });
  console.log(`saved ${path}`);
};
const board = page => page.getByTestId('paint-board');
/** The fill of every region on the board, as computed CSS colours. */
const boardFills = page => page.evaluate(() => [...document.querySelectorAll('[data-testid=paint-board] [data-region]')].map(element => getComputedStyle(element).fill));
const fillOf = async (page, region) => (await boardFills(page))[region];
const swatchColor = (page, paint) => page.getByTestId(`paint-swatch-${paint}`).evaluate(element => getComputedStyle(element).backgroundColor);
/** A screen point where a tap lands on `region` (the visible part nearest its middle). */
const pointInRegion = (page, region) => page.evaluate(region => {
  const element = document.querySelector(`[data-testid=paint-board] [data-region="${region}"]`);
  const box = element.getBoundingClientRect();
  const boardBox = element.ownerSVGElement.getBoundingClientRect();
  let best = null;
  const steps = 24;
  for (let row = 0; row <= steps; row++) for (let column = 0; column <= steps; column++) {
    const x = box.left + (box.width * column) / steps, y = box.top + (box.height * row) / steps;
    if (x < boardBox.left + 1 || y < boardBox.top + 1 || x > boardBox.right - 1 || y > boardBox.bottom - 1) continue;
    if (document.elementFromPoint(x, y)?.closest('[data-region]') !== element) continue;
    // prefer points with room around them (all four neighbours also inside the region)
    const room = [[4, 0], [-4, 0], [0, 4], [0, -4]].filter(([dx, dy]) => document.elementFromPoint(x + dx, y + dy)?.closest('[data-region]') === element).length;
    const distance = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
    const score = room * 1000 - distance;
    if (!best || score > best.score) best = { x, y, score };
  }
  return best && { x: best.x, y: best.y };
}, region);
async function tapRegion(page, region, { touch = false } = {}) {
  const point = await pointInRegion(page, region);
  if (!point) throw new Error(`no visible point for region ${region}`);
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
}
const pick = (page, paint, touch = false) => (touch ? page.getByTestId(`paint-swatch-${paint}`).tap() : page.getByTestId(`paint-swatch-${paint}`).click());
const progressText = page => page.getByTestId('paint-progress').innerText();
/** Layout: nothing sideways, the stage doesn't scroll, every control is inside the viewport. */
const layoutReport = page => page.evaluate(() => {
  const stage = document.querySelector('.player__stage');
  const inside = selector => [...document.querySelectorAll(selector)].every(element => {
    const box = element.getBoundingClientRect();
    return box.left >= -0.5 && box.right <= window.innerWidth + 0.5 && box.top >= -0.5 && box.bottom <= window.innerHeight + 0.5;
  });
  const boardBox = document.querySelector('[data-testid=paint-board]').getBoundingClientRect();
  return {
    noSideways: document.documentElement.scrollWidth <= window.innerWidth,
    stageFits: stage.scrollHeight <= stage.clientHeight + 1,
    boardInside: boardBox.left >= 0 && boardBox.right <= window.innerWidth + 0.5 && boardBox.bottom <= window.innerHeight + 0.5,
    boardSize: Math.round(boardBox.width),
    toolsInside: inside('.little-painter__tool'),
    swatchesInside: inside('.little-painter__swatch'),
    smallestSwatch: Math.round(Math.min(...[...document.querySelectorAll('.little-painter__swatch')].map(element => element.getBoundingClientRect().width))),
  };
});
const setTheme = (page, theme) => page.evaluate(([key, theme]) => localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), data: { theme } })), [THEME_KEY, theme]);

const browser = await chromium.launch({ executablePath: chromePath, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  // ---------- desktop ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await desktop.newPage();
  watchErrors(page);
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  check(!(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('little_painter')))), 'the Little Painter wasm is not loaded on the hub');
  check(await page.locator('img[src*="little-painter"]').count() > 0, 'hub shows the Little Painter thumbnail');
  check(await page.getByText('Little Painter').first().isVisible(), 'hub shows the Little Painter card');
  await page.getByTestId('filter-kids').click();
  const kidsCards = await page.locator('[data-testid=row-play-now] [data-testid^="card-"]').evaluateAll(cards => cards.map(card => card.dataset.testid));
  check(kidsCards.length >= 1 && kidsCards.every(id => id.includes('little-painter')), `the Kids filter chip shows Little Painter (${kidsCards.join(', ')})`);
  await page.locator('img[src*="little-painter"]').first().scrollIntoViewIfNeeded();
  await shot(page, 'little-painter-hub-card.png');
  await page.getByTestId('filter-all').click();

  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  await board(page).waitFor();
  check(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('little_painter'))), 'the wasm loads when the game opens');
  check(await page.getByTestId('little-painter').getAttribute('data-picture') === 'peacock', 'the Peacock is the default picture');
  const firstOption = page.locator('[data-testid=paint-pictures] [role=option]').first();
  check(await firstOption.getAttribute('data-testid') === 'paint-picture-peacock' && await firstOption.getAttribute('aria-selected') === 'true', 'the Peacock is first in the picker and selected');
  const blankFills = await boardFills(page);
  check(blankFills.length === Peacock.count && blankFills.every(fill => fill === WHITE), `the Peacock starts all white (${blankFills.length} regions)`);
  check((await progressText(page)).includes(`0 / ${Peacock.count}`), 'progress shows 0 colored');
  check(await page.getByTestId('paint-undo').isDisabled() && await page.getByTestId('paint-clear').isDisabled(), 'Undo and Clear are disabled on a blank picture');
  await shot(page, 'little-painter-desktop-blank-peacock.png');

  // tap to fill, inside the lines
  await pick(page, Paint.sky);
  check(await page.getByTestId(`paint-swatch-${Paint.sky}`).getAttribute('aria-checked') === 'true', 'tapping a swatch selects it');
  const skyBlue = await swatchColor(page, Paint.sky);
  await tapRegion(page, Peacock.body);
  await page.waitForTimeout(250);
  let fills = await boardFills(page);
  check(fills[Peacock.body] === skyBlue, `tapping the body paints it sky blue (${fills[Peacock.body]})`);
  check(fills.filter((fill, region) => region !== Peacock.body).every(fill => fill === WHITE), 'only the tapped region changed (nothing bleeds outside the lines)');
  check((await progressText(page)).includes(`1 / ${Peacock.count}`), 'progress shows 1 colored');
  await pick(page, Paint.orange);
  const orange = await swatchColor(page, Paint.orange);
  await tapRegion(page, Peacock.body);
  await page.waitForTimeout(250);
  check(await fillOf(page, Peacock.body) === orange, 'tapping again with orange repaints it');
  await page.getByTestId('paint-undo').click();
  await page.waitForTimeout(250);
  check(await fillOf(page, Peacock.body) === skyBlue, 'Undo restores the previous color (sky blue)');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(await fillOf(page, Peacock.body) === WHITE && await page.getByTestId('paint-undo').isDisabled(), 'a second Undo (Ctrl+Z) goes back to white and Undo is disabled');

  // eraser
  await pick(page, Paint.pink);
  await tapRegion(page, Peacock.sun);
  await pick(page, Paint.eraser);
  await tapRegion(page, Peacock.sun);
  await page.waitForTimeout(250);
  check(await fillOf(page, Peacock.sun) === WHITE, 'the eraser makes a region white again');

  // a few colors, then refresh
  await pick(page, Paint.teal);
  await tapRegion(page, Peacock.feathers[0]);
  await pick(page, Paint.yellow);
  await tapRegion(page, Peacock.eyespots[0]);
  await tapRegion(page, Peacock.sun);
  await pick(page, Paint.purple);
  await tapRegion(page, Peacock.head);
  await page.waitForTimeout(250);
  const beforeReload = await boardFills(page);
  check(await page.evaluate(key => !!localStorage.getItem(key), SAVE_KEY), 'progress is saved to localStorage');
  await page.reload({ waitUntil: 'networkidle' });
  await board(page).waitFor();
  await page.waitForTimeout(250);
  check(JSON.stringify(await boardFills(page)) === JSON.stringify(beforeReload), 'a refresh brings back every color');
  check(await page.getByTestId('restored').isVisible(), 'a "Welcome back" note shows after the refresh');
  check(await page.getByTestId(`paint-swatch-${Paint.purple}`).getAttribute('aria-checked') === 'true', 'the selected paint is restored too');

  // switching pictures
  await page.getByTestId('paint-picture-rocket').click();
  await page.waitForTimeout(250);
  check(await page.getByTestId('little-painter').getAttribute('data-picture') === 'rocket', 'tapping the Rocket thumbnail opens the Rocket');
  check((await boardFills(page)).every(fill => fill === WHITE), 'the Rocket starts white');
  await pick(page, Paint.red);
  await tapRegion(page, 10); // rocket body
  await page.waitForTimeout(250);
  check(await fillOf(page, 10) === await swatchColor(page, Paint.red), 'coloring the Rocket body works');
  check(await page.getByTestId('paint-picture-rocket').locator('g[fill="#e9645f"]').count() === 1, 'the Rocket thumbnail shows the new color');
  await page.getByTestId('paint-picture-peacock').click();
  await page.waitForTimeout(250);
  check(JSON.stringify(await boardFills(page)) === JSON.stringify(beforeReload), 'back on the Peacock its colors are still there');
  await page.reload({ waitUntil: 'networkidle' });
  await board(page).waitFor();
  check(await page.getByTestId('little-painter').getAttribute('data-picture') === 'peacock', 'the open picture is remembered across a refresh');

  // ✨ Find highlights the parts still white
  await page.getByTestId('paint-hint').click();
  await page.waitForTimeout(100);
  const hinted = await page.locator('[data-testid=paint-board] [data-region].is-hinted').count();
  const whiteCount = (await boardFills(page)).length - beforeReload.filter(fill => fill !== WHITE).length;
  check(hinted === whiteCount && hinted > 0, `✨ Find highlights the ${whiteCount} white parts (${hinted})`);
  await shot(page, 'little-painter-desktop-find-hint.png');
  await page.waitForTimeout(2400);
  check(await page.locator('[data-testid=paint-board] .is-hinted').count() === 0, 'the hint fades after a moment');

  // Clear with a confirm, then Undo brings everything back
  await page.getByTestId('paint-clear').click();
  check(await page.getByTestId('paint-clear-dialog').isVisible(), 'Clear asks first');
  await shot(page, 'little-painter-desktop-clear-confirm.png');
  await page.getByTestId('paint-clear-no').click();
  check(JSON.stringify(await boardFills(page)) === JSON.stringify(beforeReload), '"Keep it" leaves the drawing alone');
  await page.getByTestId('paint-clear').click();
  await page.getByTestId('paint-clear-yes').click();
  await page.waitForTimeout(250);
  check((await boardFills(page)).every(fill => fill === WHITE), 'Clear makes the picture white');
  await page.getByTestId('paint-undo').click();
  await page.waitForTimeout(250);
  check(JSON.stringify(await boardFills(page)) === JSON.stringify(beforeReload), 'Undo after Clear brings the whole drawing back');

  // color the whole peacock with real taps → celebration
  for (const [region, paint] of PEACOCK_COLORS) {
    if (await page.getByTestId(`paint-swatch-${paint}`).getAttribute('aria-checked') !== 'true') await pick(page, paint);
    await tapRegion(page, region);
  }
  await page.waitForTimeout(400);
  fills = await boardFills(page);
  let allMatch = true;
  for (const [region, paint] of PEACOCK_COLORS) if (fills[region] !== await swatchColor(page, paint)) { allMatch = false; console.log(`  region ${region}: ${fills[region]}`); }
  check(PEACOCK_COLORS.size === Peacock.count && allMatch, 'every Peacock region was colored by a real tap with the intended paint');
  check(await page.getByTestId('paint-celebration').isVisible(), 'finishing the Peacock shows the celebration');
  check(await page.getByTestId('little-painter').getAttribute('data-complete') === 'true' && (await progressText(page)).includes('All colored'), 'progress says all colored');
  check(await page.getByTestId('paint-picture-peacock').getAttribute('data-done') === 'true' && await page.locator('[data-testid=paint-picture-peacock] .little-painter__done').isVisible(), 'the Peacock thumbnail gets a ⭐');
  check(await page.getByTestId('paint-hint').isDisabled(), '✨ Find is disabled when nothing is white');
  await page.waitForTimeout(500);
  await shot(page, 'little-painter-desktop-peacock-celebration.png');
  await page.getByTestId('paint-keep').click();
  await page.waitForTimeout(300);
  check(!(await page.getByTestId('paint-celebration').isVisible()), '"Keep coloring" closes the celebration');
  await shot(page, 'little-painter-desktop-peacock-colored.png');
  await board(page).screenshot({ path: `${screenshotDirectory}/little-painter-peacock-colored-board.png` });

  // PNG download
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('paint-save').click()]);
  const pngPath = `${screenshotDirectory}/little-painter-peacock-download.png`;
  await download.saveAs(pngPath);
  const png = readFileSync(pngPath);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  check(download.suggestedFilename() === 'little-painter-peacock.png', `the download is named ${download.suggestedFilename()}`);
  check(png.subarray(1, 4).toString() === 'PNG' && width === 1200 && height === 1200 && png.length > 20_000, `the download is a 1200×1200 PNG (${png.length} bytes)`);

  // mute
  const muteBefore = await page.getByTestId('mute').getAttribute('aria-pressed');
  await page.getByTestId('mute').click();
  check(await page.getByTestId('mute').getAttribute('aria-pressed') !== muteBefore, 'the sound button toggles');
  await page.getByTestId('mute').click();

  // desktop layout
  const desktopLayout = await layoutReport(page);
  check(desktopLayout.noSideways && desktopLayout.stageFits && desktopLayout.boardInside && desktopLayout.toolsInside && desktopLayout.swatchesInside,
    `desktop layout is clean (${JSON.stringify(desktopLayout)})`);

  // themes
  const themeColors = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme ?? 'netflix-red',
    ring: getComputedStyle(document.querySelector('.little-painter__swatch.is-selected')).boxShadow, background: getComputedStyle(document.body).backgroundColor }));
  const lagoon = await themeColors();
  check(lagoon.theme === 'lagoon' && lagoon.ring.includes('rgb(239, 202, 124)'), `Lagoon theme (default): gold ring on the selected paint (${lagoon.ring.slice(0, 22)}…)`);
  await shot(page, 'little-painter-desktop-lagoon.png');
  await setTheme(page, 'netflix-red');
  await page.reload({ waitUntil: 'networkidle' });
  await board(page).waitFor();
  await page.waitForTimeout(300);
  const red = await themeColors();
  check(red.theme === 'netflix-red' && red.ring.includes('rgb(255, 255, 255)') && red.background !== lagoon.background, `Netflix Red theme: white ring, dark background (${red.background})`);
  check((await boardFills(page)).filter(fill => fill !== WHITE).length === Peacock.count, 'the colored Peacock survives the theme switch and reload');
  await shot(page, 'little-painter-desktop-netflix-red.png');
  await page.getByTestId('paint-picture-butterfly').click();
  await page.getByTestId('paint-clear').isDisabled();
  await page.getByTestId('paint-picture-peacock').click();
  await setTheme(page, 'lagoon');
  const savedBook = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
  await desktop.close();

  // ---------- phones and tablet ----------
  const layouts = [
    { name: 'phone-portrait', viewport: { width: 390, height: 844 } },
    { name: 'phone-landscape', viewport: { width: 844, height: 390 } },
    { name: 'small-phone', viewport: { width: 360, height: 640 } },
    { name: 'tablet-portrait', viewport: { width: 820, height: 1180 } },
  ];
  for (const { name, viewport } of layouts) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const phone = await context.newPage();
    watchErrors(phone);
    await phone.goto(siteUrl, { waitUntil: 'domcontentloaded' });
    await phone.evaluate(([key, value]) => { localStorage.clear(); localStorage.setItem(key, value); }, [SAVE_KEY, savedBook]);
    await phone.goto(gameUrl, { waitUntil: 'networkidle' });
    await board(phone).waitFor();
    await phone.waitForTimeout(300);
    const layout = await layoutReport(phone);
    check(layout.noSideways && layout.stageFits && layout.boardInside && layout.toolsInside && layout.swatchesInside && layout.smallestSwatch >= 28,
      `${name}: clean layout, nothing clipped (${JSON.stringify(layout)})`);
    await shot(phone, `little-painter-${name}-peacock.png`);
    if (name === 'phone-portrait') {
      // touch: open the butterfly and tap-fill with a finger
      await phone.getByTestId('paint-picture-butterfly').tap();
      await phone.waitForTimeout(250);
      await pick(phone, Paint.pink, true);
      await tapRegion(phone, 3, { touch: true });
      await pick(phone, Paint.sky, true);
      await tapRegion(phone, 4, { touch: true });
      await phone.waitForTimeout(250);
      const butterflyFills = await boardFills(phone);
      check(butterflyFills[3] === await swatchColor(phone, Paint.pink) && butterflyFills[4] === await swatchColor(phone, Paint.sky) && butterflyFills.filter(fill => fill !== WHITE).length === 2,
        'phone: finger taps color the butterfly wings (and nothing else)');
      await phone.getByTestId('paint-undo').tap();
      await phone.waitForTimeout(250);
      check((await boardFills(phone))[4] === WHITE, 'phone: Undo works by touch');
      await shot(phone, 'little-painter-phone-portrait-butterfly.png');
      await phone.getByTestId('paint-picture-peacock').tap();
    }
    await context.close();
  }
  check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
