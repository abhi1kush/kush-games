// Color Trails smoke test at 1280px (mouse) and 375px (touch), with screenshots.
// Paths are drawn by dragging through cell centres; the solution is read back from the hint button.
// Usage: node e2e/color-trails.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { reactCommitCounterScript } from './perf-snake.mjs';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const SAVE_KEY = 'kush-games:color-trails:save:v1';
const PROGRESS_KEY = 'kush-games-color-trails-progress';
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const gameData = (page, name) => page.getByTestId('color-trails').getAttribute(`data-${name}`);
const trailCells = page => page.evaluate(() => [...document.querySelectorAll('.trail')].map(element => element.dataset.cells ? element.dataset.cells.split(',').map(Number) : []));

/** Screen point of a cell centre. */
const cellPoints = (page, cells) => page.evaluate(list => {
  const root = document.querySelector('[data-testid=color-trails]');
  const columns = Number(root.dataset.columns), rows = Number(root.dataset.rows);
  const box = document.querySelector('[data-testid=trails-board]').getBoundingClientRect();
  return list.map(cell => ({ x: box.left + ((cell % columns) + 0.5) * (box.width / columns), y: box.top + (Math.floor(cell / columns) + 0.5) * (box.height / rows) }));
}, cells);

async function mouseDrag(page, cells, { release = true } = {}) {
  const points = await cellPoints(page, cells);
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 3 });
  await page.waitForTimeout(50);
  if (release) await page.mouse.up();
}

async function touchDrag(page, cdp, cells, { release = true } = {}) {
  const points = await cellPoints(page, cells);
  const touch = point => [{ x: point.x, y: point.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(points[0]) });
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    for (const share of [0.5, 1]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }) });
      await page.waitForTimeout(16);
    }
  }
  await page.waitForTimeout(60);
  if (release) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Read the full solution by pressing Hint until the board is solved, then restart the level. */
async function readSolution(page) {
  for (let guard = 0; guard < 30 && await gameData(page, 'status') === 'playing'; guard++) await page.getByTestId('trails-hint').click();
  const solution = await trailCells(page);
  await page.getByTestId('trails-restart').click();
  return solution;
}

async function openLevel(page, levelNumber) {
  await page.evaluate(([progressKey, saveKey, cleared]) => {
    localStorage.setItem(progressKey, JSON.stringify({ highestCleared: cleared, stars: Array(cleared).fill(2) }));
    localStorage.removeItem(saveKey);
  }, [PROGRESS_KEY, SAVE_KEY, levelNumber - 1]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=color-trails]');
}

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });

// ================= Desktop =================
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(reactCommitCounterScript);
const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(`desktop: ${error}`));
await page.goto(siteUrl, { waitUntil: 'networkidle' });
const inAllGames = await page.locator('[data-testid=row-play-now] [data-testid=card-color-trails]').count() === 1;
await page.getByTestId('filter-puzzle').click();
const thumbnailLoaded = await page.locator('[data-testid=card-color-trails] img').evaluate(image => image.complete && image.naturalWidth > 0).catch(() => false);
check(inAllGames && await page.locator('[data-testid=row-play-now] [data-testid=card-color-trails]').count() === 1 && thumbnailLoaded,
  'hub: Color Trails card (with its thumbnail) is in All games and under the Puzzle filter');
await page.goto(`${siteUrl}#/play/color-trails`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=color-trails]');
check(await gameData(page, 'level') === '1' && await gameData(page, 'columns') === '5' && await gameData(page, 'rows') === '5',
  `trails: level 1 is a 5×5 board with ${await gameData(page, 'colors')} colors`);
const levelOneSolution = await readSolution(page);
check(levelOneSolution.every(path => path.length >= 2) && await gameData(page, 'connected') === '0' && await gameData(page, 'status') === 'playing',
  'trails: hints solve the level; Restart clears it');

// draw one path by dragging (and count React commits while dragging)
const firstPath = levelOneSolution.reduce((longest, path) => (path.length > longest.length ? path : longest));
const firstColor = levelOneSolution.indexOf(firstPath);
const commitsBefore = await page.evaluate(() => window.__reactCommits);
await mouseDrag(page, firstPath);
const commitsForDrag = (await page.evaluate(() => window.__reactCommits)) - commitsBefore;
const drawn = (await trailCells(page))[firstColor];
check(await gameData(page, 'connected') === '1' && drawn.join() === firstPath.join() && await gameData(page, 'moves') === '1',
  `trails: dragging draws a ${firstPath.length}-cell path that connects its pair (1 move)`);
check(commitsForDrag <= firstPath.length * 2 + 6, `trails: the drag cost ${commitsForDrag} React commits for ${firstPath.length} cells (rAF-throttled)`);
await page.waitForTimeout(1100);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=color-trails]');
check(await page.getByTestId('restored').isVisible() && await gameData(page, 'connected') === '1' && (await trailCells(page))[firstColor].join() === firstPath.join(),
  'trails: refresh restores the drawn path');
await page.getByTestId('trails-undo').click().catch(() => {});
await page.getByTestId('trails-restart').click();
for (const path of levelOneSolution) await mouseDrag(page, path);
check(await gameData(page, 'status') === 'won' && await page.getByTestId('trails-won').isVisible()
  && await page.getByTestId('trails-stars').getAttribute('data-stars') === '3' && await gameData(page, 'moves') === String(levelOneSolution.length),
  'trails: dragging every path solves level 1 — perfect, 3 stars and the celebration');
await page.getByTestId('trails-next-level').click();
check(await gameData(page, 'level') === '2', 'trails: Next level goes to level 2');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=color-trails]');
check(await gameData(page, 'level') === '2', 'trails: level progress survives a refresh');
await page.getByTestId('trails-level').click();
const pickerButtons = await page.getByTestId('trails-pick').allInnerTexts();
check(pickerButtons.length === 2 && pickerButtons[0].includes('★★★'), `trails: level select lists cleared levels with stars (${pickerButtons.map(text => text.replace(/\s+/g, ' ')).join(' | ')})`);
await page.getByTestId('trails-pick').first().click();
check(await gameData(page, 'level') === '1', 'trails: picking a cleared level opens it');

// mid-level screenshot: level 20, a few paths laid by hints and one being drawn
await openLevel(page, 20);
const midSolution = await readSolution(page);
const midColors = midSolution.map((path, color) => ({ path, color })).sort((first, second) => second.path.length - first.path.length);
for (const { path } of midColors.slice(1, 4)) await mouseDrag(page, path);
const drawing = midColors[0].path;
await mouseDrag(page, drawing.slice(0, Math.ceil(drawing.length * 0.6)), { release: false });
await page.screenshot({ path: `${screenshotDirectory}/kush-games-dots.png` });
await page.mouse.up();
check(await gameData(page, 'level') === '20' && Number(await gameData(page, 'connected')) >= 3 && await noOverflow(page),
  `trails: level 20 (${await gameData(page, 'columns')}×${await gameData(page, 'rows')}, ${await gameData(page, 'colors')} colors) partly solved, no overflow`);
await page.waitForTimeout(1100);
await page.getByTestId('back').click();
await page.waitForSelector('[data-testid=row-play-now]');
check(await page.locator('[data-testid=card-color-trails] [data-testid=continue-color-trails]').count() === 1, 'hub: Color Trails shows a Continue badge');
await context.close();

// ================= Mobile 375px (touch) =================
const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const phone = await mobile.newPage();
phone.on('pageerror', error => pageErrors.push(`mobile: ${error}`));
const cdp = await mobile.newCDPSession(phone);
await phone.goto(`${siteUrl}#/play/color-trails`, { waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=color-trails]');
check(await noOverflow(phone), 'mobile: level 1 has no horizontal overflow');
const phoneSolution = await readSolution(phone);
const phonePath = phoneSolution.reduce((longest, path) => (path.length > longest.length ? path : longest));
await touchDrag(phone, cdp, phonePath);
check(await gameData(phone, 'connected') === '1', 'mobile: a touch drag draws and connects a path');
await openLevel(phone, 45);
const boardBox = await phone.getByTestId('trails-board').boundingBox();
const phoneCell = boardBox.width / Number(await gameData(phone, 'columns'));
check(await gameData(phone, 'columns') === '10' && boardBox.x >= 0 && boardBox.x + boardBox.width <= 375 && phoneCell >= 30 && await noOverflow(phone),
  `mobile: level 45 (${await gameData(phone, 'columns')}×${await gameData(phone, 'rows')}, ${await gameData(phone, 'colors')} colors) fits the screen with ${phoneCell.toFixed(1)}px cells`);
const bigSolution = await readSolution(phone);
const bigColors = bigSolution.map((path, color) => ({ path, color })).sort((first, second) => second.path.length - first.path.length);
for (const { path } of bigColors.slice(2, 5)) await touchDrag(phone, cdp, path);
const bigDrawing = bigColors[0].path;
await touchDrag(phone, cdp, bigDrawing.slice(0, Math.ceil(bigDrawing.length / 2)), { release: false });
await phone.screenshot({ path: `${screenshotDirectory}/kush-games-dots-mobile.png` });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
check(Number(await gameData(phone, 'connected')) >= 3 && await noOverflow(phone), `mobile: big level partly solved by touch (${await gameData(phone, 'connected')} pairs, ${await gameData(phone, 'fill')}% filled)`);
await mobile.close();
await browser.close();

check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
