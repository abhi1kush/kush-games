// Arrow Out smoke test at 1280px and 375px, with screenshots.
// (arrows are tapped with force: the hint pulse keeps an arrow "moving", which Playwright would otherwise wait out)
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
const SAVE_KEY = 'kush-games:arrow-out:save:v1';

/** Which arrows on the board can escape right now, worked out from the data-* attributes. */
const classifyArrows = page => page.evaluate(() => {
  const root = document.querySelector('[data-testid=arrow-out]');
  const rows = Number(root.dataset.rows), columns = Number(root.dataset.columns);
  const steps = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const pieces = [...document.querySelectorAll('.arrow-piece:not(.is-leaving)')].map(element => ({
    id: Number(element.dataset.arrowId), row: Number(element.dataset.row), column: Number(element.dataset.column),
    direction: element.dataset.direction, length: Number(element.dataset.length),
  }));
  const occupied = new Map();
  for (const piece of pieces) {
    const [rowStep, columnStep] = steps[piece.direction];
    for (let offset = 0; offset < piece.length; offset++) occupied.set(`${piece.row - rowStep * offset},${piece.column - columnStep * offset}`, piece.id);
  }
  const free = [], blocked = [];
  for (const piece of pieces) {
    const [rowStep, columnStep] = steps[piece.direction];
    let row = piece.row + rowStep, column = piece.column + columnStep, isBlocked = false;
    while (row >= 0 && row < rows && column >= 0 && column < columns) {
      if (occupied.has(`${row},${column}`)) { isBlocked = true; break; }
      row += rowStep; column += columnStep;
    }
    (isBlocked ? blocked : free).push(piece.id);
  }
  return { free, blocked };
});
const tapArrow = (page, arrowId, isTouch = false) => (isTouch ? page.locator(`[data-arrow-id="${arrowId}"]`).tap({ force: true }) : page.locator(`[data-arrow-id="${arrowId}"]`).click({ force: true }));
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
check(await gameData(page, 'level') === '1' && await gameData(page, 'status') === 'playing' && await page.locator('.arrow-piece').count() > 3, 'arrow: level 1 starts with a packed board');

// Level 1: blocked tap, escape, undo, hint
let arrowsAtStart = Number(await gameData(page, 'arrows-left'));
let { free, blocked } = await classifyArrows(page);
check(free.length > 0, `arrow: some arrows are free (${free.length} free, ${blocked.length} blocked)`);
if (blocked.length) {
  await tapArrow(page, blocked[0]);
  check(await gameData(page, 'lives') === '2' && Number(await gameData(page, 'arrows-left')) === arrowsAtStart
    && await page.locator(`[data-arrow-id="${blocked[0]}"]`).count() === 1, 'arrow: a blocked arrow stays put and costs a life');
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
({ free } = await classifyArrows(page));
await tapArrow(page, free[0]);
await page.getByTestId('arrow-hint').click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${screenshotDirectory}/kush-games-arrow.png` });
check(await noOverflow(page), 'arrow: no horizontal overflow on desktop');
await page.getByTestId('back').click();
await page.waitForSelector('[data-testid=row-play-now]');
check(await page.locator('[data-testid=row-play-now] [data-testid=continue-arrow-out]').count() === 1, 'hub: Arrow Out shows a Continue badge');
await context.close();

// ================= Mobile 375px =================
const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const phone = await mobile.newPage();
phone.on('pageerror', error => pageErrors.push(`mobile: ${error}`));
await phone.goto(`${siteUrl}#/play/arrow-out`, { waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=arrow-out]');
check(await noOverflow(phone), 'mobile: level 1 has no horizontal overflow');
// jump to a big late level (9×12) by pretending 29 levels are done
await phone.evaluate(key => { localStorage.setItem('kush-games-arrow-out-progress', JSON.stringify({ highestCleared: 29 })); localStorage.removeItem(key); }, SAVE_KEY);
await phone.reload({ waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=arrow-out]');
const boardBox = await phone.getByTestId('arrow-board').boundingBox();
check(await gameData(phone, 'level') === '30' && await gameData(phone, 'columns') === '9' && await noOverflow(phone)
  && boardBox.x >= 0 && boardBox.x + boardBox.width <= 375, `mobile: level 30 (9×${await gameData(phone, 'rows')}) fits the screen (${boardBox.width.toFixed(0)}px wide)`);
const firstPieceBox = await phone.locator('.arrow-piece').first().boundingBox();
check(Math.min(firstPieceBox.width, firstPieceBox.height) >= 26, `mobile: arrows stay tappable (${Math.min(firstPieceBox.width, firstPieceBox.height).toFixed(0)}px)`);
const mobileStart = Number(await gameData(phone, 'arrows-left'));
({ free, blocked } = await classifyArrows(phone));
await tapArrow(phone, free[0], true);
await tapArrow(phone, free[1], true);
await tapArrow(phone, blocked[0], true);
check(Number(await gameData(phone, 'arrows-left')) === mobileStart - 2 && await gameData(phone, 'lives') === '2', 'mobile: taps send free arrows out and a blocked tap costs a life');
await phone.waitForTimeout(700);
await phone.screenshot({ path: `${screenshotDirectory}/kush-games-arrow-mobile.png` });
await mobile.close();
await browser.close();

check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
