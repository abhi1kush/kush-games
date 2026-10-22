// Arrow Out smoke test at 1280px and 375px, with screenshots.
// Arrows are winding SVG paths, so taps go to the centre of a chosen cell of the arrow (its head by default).
// Usage: node e2e/arrow-out.mjs [siteUrl] [screenshotDirectory]
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
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const gameData = (page, name) => page.getByTestId('arrow-out').getAttribute(`data-${name}`);
const SAVE_KEY = 'kush-games:arrow-out:save:v2';

/** Which arrows on the board can escape right now, worked out from the data-* attributes. */
const classifyArrows = page => page.evaluate(() => {
  const root = document.querySelector('[data-testid=arrow-out]');
  const rows = Number(root.dataset.rows), columns = Number(root.dataset.columns);
  const steps = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const pieces = [...document.querySelectorAll('.arrow-piece:not(.is-leaving)')].map(element => ({
    id: Number(element.dataset.arrowId), direction: element.dataset.direction,
    cells: element.dataset.cells.split(';').map(pair => pair.split(',').map(Number)),
  }));
  const occupied = new Map();
  for (const piece of pieces) for (const [row, column] of piece.cells) occupied.set(`${row},${column}`, piece.id);
  const free = [], blocked = [], lengths = {};
  for (const piece of pieces) {
    const [rowStep, columnStep] = steps[piece.direction];
    const [headRow, headColumn] = piece.cells[piece.cells.length - 1];
    let row = headRow + rowStep, column = headColumn + columnStep, isBlocked = false;
    while (row >= 0 && row < rows && column >= 0 && column < columns) {
      if (occupied.has(`${row},${column}`)) { isBlocked = true; break; }
      row += rowStep; column += columnStep;
    }
    (isBlocked ? blocked : free).push(piece.id);
    lengths[piece.id] = piece.cells.length;
  }
  return { free, blocked, lengths, coveredCells: occupied.size, totalCells: rows * columns };
});
/** Tap the centre of one of the arrow's cells (default: a middle body cell, to prove the whole arrow is tappable). */
async function tapArrow(page, arrowId, isTouch = false, cellChoice = 'middle') {
  const point = await page.evaluate(([id, choice]) => {
    const root = document.querySelector('[data-testid=arrow-out]');
    const columns = Number(root.dataset.columns), rows = Number(root.dataset.rows);
    const box = document.querySelector('[data-testid=arrow-svg]').getBoundingClientRect();
    const cellSize = box.width / (columns + 0.6);
    const cells = document.querySelector(`[data-arrow-id="${id}"]`).dataset.cells.split(';').map(pair => pair.split(',').map(Number));
    const [row, column] = choice === 'head' ? cells[cells.length - 1] : cells[Math.floor(cells.length / 2)];
    return { x: box.left + (0.3 + column + 0.5) * cellSize, y: box.top + (0.3 + row + 0.5) * (box.height / (rows + 0.6)) };
  }, [arrowId, cellChoice]);
  if (isTouch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
}
async function clearLevel(page) {
  for (let guard = 0; guard < 200 && await gameData(page, 'status') === 'playing'; guard++) {
    const { free } = await classifyArrows(page);
    if (!free.length) return false;
    await tapArrow(page, free[0]);
  }
  return await gameData(page, 'status') === 'won';
}

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });

// ================= Desktop =================
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(reactCommitCounterScript);
const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(`desktop: ${error}`));
await page.goto(siteUrl, { waitUntil: 'networkidle' });
check(await page.locator('[data-testid=row-play-now] [data-testid=card-arrow-out]').count() === 1
  && await page.locator('[data-testid=row-puzzle] [data-testid=card-arrow-out]').count() === 1, 'hub: Arrow Out card is in Play Now and the Puzzle row');
await page.goto(`${siteUrl}#/play/arrow-out`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=arrow-out]');
const levelOneStats = await classifyArrows(page);
check(await gameData(page, 'level') === '1' && await gameData(page, 'status') === 'playing' && levelOneStats.coveredCells / levelOneStats.totalCells >= 0.9,
  `arrow: level 1 starts with a packed 5×5 board (${levelOneStats.coveredCells}/${levelOneStats.totalCells} cells)`);

// Level 1: blocked tap, escape, undo, hint
let arrowsAtStart = Number(await gameData(page, 'arrows-left'));
let { free, blocked } = await classifyArrows(page);
check(free.length > 0, `arrow: some arrows are free (${free.length} free, ${blocked.length} blocked)`);
if (blocked.length) {
  await tapArrow(page, blocked[0]);
  check(await gameData(page, 'lives') === '2' && Number(await gameData(page, 'arrows-left')) === arrowsAtStart
    && await page.locator(`[data-arrow-id="${blocked[0]}"]`).count() === 1, 'arrow: a blocked arrow stays put and costs a life');
  await page.waitForTimeout(500);
} else check(true, 'arrow: (level 1 has no blocked arrow; blocked tap checked on level 2)');
const commitsBefore = await page.evaluate(() => window.__reactCommits);
await tapArrow(page, free[0]);
check(Number(await gameData(page, 'arrows-left')) === arrowsAtStart - 1, 'arrow: a free arrow escapes');
await page.waitForTimeout(800);
check(await page.locator(`[data-arrow-id="${free[0]}"]`).count() === 0, 'arrow: the escaped arrow slides off and is removed');
const commitsForTap = (await page.evaluate(() => window.__reactCommits)) - commitsBefore;
check(commitsForTap <= 4, `arrow: one tap costs only ${commitsForTap} React commits (animation runs outside React)`);
await page.getByTestId('arrow-undo').click();
check(Number(await gameData(page, 'arrows-left')) === arrowsAtStart && await page.locator(`[data-arrow-id="${free[0]}"]`).count() === 1, 'arrow: undo brings the arrow back');
await page.getByTestId('arrow-hint').click();
const hinted = await page.locator('.arrow-piece.is-hint').getAttribute('data-arrow-id');
check(hinted !== null && (await classifyArrows(page)).free.includes(Number(hinted)), 'arrow: hint highlights an arrow that can escape');
await tapArrow(page, Number(hinted));
const livesBeforeReload = await gameData(page, 'lives');
const leftBeforeReload = await gameData(page, 'arrows-left');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=arrow-out]');
check(await page.getByTestId('restored').isVisible() && await gameData(page, 'arrows-left') === leftBeforeReload && await gameData(page, 'lives') === livesBeforeReload,
  'arrow: refresh restores the board and lives');
check(await clearLevel(page) && await page.getByTestId('arrow-won').isVisible(), 'arrow: clearing every arrow shows the level-complete celebration');
await page.getByTestId('arrow-next-level').click();
check(await gameData(page, 'level') === '2', 'arrow: Next level goes to level 2');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=arrow-out]');
check(await gameData(page, 'level') === '2', 'arrow: level progress survives a refresh');

// Level 2: run out of lives
({ blocked } = await classifyArrows(page));
check(blocked.length > 0, 'arrow: level 2 has blocked arrows');
for (let tap = 0; tap < 3; tap++) await tapArrow(page, blocked[0]);
check(await gameData(page, 'status') === 'failed' && await page.getByTestId('arrow-failed').isVisible(), 'arrow: three blocked taps fail the level');
await page.getByTestId('arrow-retry').click();
check(await gameData(page, 'status') === 'playing' && await gameData(page, 'lives') === '3', 'arrow: Try again restarts the level with full lives');
// a mid-size level (pretend 9 levels are done): screenshot while the longest free arrow slides out in gold
await page.evaluate(key => { localStorage.setItem('kush-games-arrow-out-progress', JSON.stringify({ highestCleared: 9 })); localStorage.removeItem(key); }, SAVE_KEY);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=arrow-out]');
const midStats = await classifyArrows(page);
check(await gameData(page, 'level') === '10' && midStats.coveredCells / midStats.totalCells >= 0.9 && Math.max(...Object.values(midStats.lengths)) >= 8,
  `arrow: level 10 is a packed ${await gameData(page, 'columns')}×${await gameData(page, 'rows')} board with long winding arrows (${midStats.coveredCells}/${midStats.totalCells} cells, ${Object.keys(midStats.lengths).length} arrows)`);
const longestFree = [...midStats.free].sort((first, second) => midStats.lengths[second] - midStats.lengths[first])[0];
await tapArrow(page, longestFree);
await page.waitForTimeout(260);
check(await page.locator(`[data-arrow-id="${longestFree}"].is-leaving`).count() === 1, 'arrow: the tapped arrow turns gold and slides out along its path');
await page.screenshot({ path: `${screenshotDirectory}/kush-games-arrow-bent.png` });
check(await noOverflow(page), 'arrow: no horizontal overflow on desktop');
const savedBeforeBack = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
await page.getByTestId('back').click();
await page.waitForSelector('[data-testid=row-play-now]');
check(await page.locator('[data-testid=row-play-now] [data-testid=continue-arrow-out]').count() === 1,
  `hub: Arrow Out shows a Continue badge (save before Back: ${savedBeforeBack ? 'yes' : 'none'})`);
await context.close();

// ================= Mobile 375px =================
const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const phone = await mobile.newPage();
phone.on('pageerror', error => pageErrors.push(`mobile: ${error}`));
await phone.goto(`${siteUrl}#/play/arrow-out`, { waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=arrow-out]');
check(await noOverflow(phone), 'mobile: level 1 has no horizontal overflow');
// jump to a big late level (12×16) by pretending 29 levels are done
await phone.evaluate(key => { localStorage.setItem('kush-games-arrow-out-progress', JSON.stringify({ highestCleared: 29 })); localStorage.removeItem(key); }, SAVE_KEY);
await phone.reload({ waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=arrow-out]');
const boardBox = await phone.getByTestId('arrow-board').boundingBox();
check(await gameData(phone, 'level') === '30' && await gameData(phone, 'columns') === '12' && await noOverflow(phone)
  && boardBox.x >= 0 && boardBox.x + boardBox.width <= 375, `mobile: level 30 (${await gameData(phone, 'columns')}×${await gameData(phone, 'rows')}) fits the screen (${boardBox.width.toFixed(0)}px wide)`);
const phoneCellSize = boardBox.width / (12 + 0.6);
check(phoneCellSize >= 22, `mobile: cells stay tappable (${phoneCellSize.toFixed(1)}px)`);
const mobileStart = Number(await gameData(phone, 'arrows-left'));
({ free, blocked } = await classifyArrows(phone));
await tapArrow(phone, free[0], true);
await tapArrow(phone, blocked[0], true);
check(Number(await gameData(phone, 'arrows-left')) === mobileStart - 1 && await gameData(phone, 'lives') === '2', 'mobile: taps send a free arrow out and a blocked tap costs a life');
await phone.waitForTimeout(900);
({ free } = await classifyArrows(phone));
const phoneLengths = (await classifyArrows(phone)).lengths;
const longestPhoneFree = [...free].sort((first, second) => phoneLengths[second] - phoneLengths[first])[0];
await tapArrow(phone, longestPhoneFree, true);
await phone.waitForTimeout(240);
await phone.screenshot({ path: `${screenshotDirectory}/kush-games-arrow-bent-mobile.png` });
check(await noOverflow(phone), 'mobile: still no horizontal overflow while an arrow slides out');
await mobile.close();
await browser.close();

check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
