// Headless browser check of a deployed (or previewed) Kush Games site.
// Usage: node e2e/live-check.mjs [url] [screenshotDirectory]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
let failureCount = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failureCount++;
};

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });

async function hasNoHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
    && document.body.scrollWidth <= window.innerWidth);
}
const boardSnapshot = page => page.evaluate(() =>
  [...document.querySelectorAll('.game-2048__tile')].map(tile => `${tile.dataset.value}@${tile.style.cssText}`).sort().join('|'));

const snakeHead = page => page.getByTestId('snake-board').getAttribute('data-head')
  .then(value => { const [x, y] = value.split(',').map(Number); return { x, y }; });
const snakeStatus = page => page.getByTestId('snake-board').getAttribute('data-status');
async function waitForSnake(page, predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate(await snakeHead(page), await snakeStatus(page))) return true;
    await page.waitForTimeout(40);
  }
  return false;
}
async function swipe(cdp, fromX, fromY, toX, toY) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y: fromY }] });
  for (let stepIndex = 1; stepIndex <= 6; stepIndex++) {
    const progress = stepIndex / 6;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + (toX - fromX) * progress, y: fromY + (toY - fromY) * progress }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function waitForBoardChange(page, before) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(100);
    if (await boardSnapshot(page) !== before) return true;
  }
  return false;
}

// ---------- Desktop ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=hero]');
  check(await page.locator('.nav__logo').innerText().then(text => /kush\s*games/i.test(text)), 'desktop: nav shows Kush Games logo');
  check(await page.locator('.hero__title').innerText() === '2048', 'desktop: hero features 2048');
  const rowTitles = await page.locator('.row__title').allInnerTexts();
  check(['Puzzle', 'Arcade', 'Strategy', 'Classic Board', 'Coming Soon'].every(title => rowTitles.includes(title)), `desktop: category rows present (${rowTitles.join(', ')})`);
  check(await page.locator('.card').count() >= 20, 'desktop: many game cards rendered');
  check(await hasNoHorizontalOverflow(page), 'desktop: no horizontal page overflow');

  const comingSoonRow = page.locator('[data-testid=row-coming-soon]');
  await comingSoonRow.scrollIntoViewIfNeeded();
  await comingSoonRow.locator('.row__viewport').hover();
  await comingSoonRow.locator('.row__arrow--right').click();
  await page.waitForTimeout(800);
  const rowScrollLeft = await comingSoonRow.locator('.row__track').evaluate(track => track.scrollLeft);
  check(rowScrollLeft > 0, `desktop: Coming Soon row scrolls with arrow (scrollLeft=${rowScrollLeft})`);

  const firstPuzzleCard = page.locator('[data-testid=row-puzzle] .card').first();
  await firstPuzzleCard.hover();
  await page.waitForTimeout(450);
  const cardScale = await firstPuzzleCard.evaluate(card => new DOMMatrix(getComputedStyle(card).transform).a);
  check(cardScale > 1.1, `desktop: card scales up on hover (scale=${cardScale.toFixed(2)})`);
  check(await firstPuzzleCard.locator('.card__details').evaluate(element => getComputedStyle(element).opacity === '1'), 'desktop: hovered card shows title + description');

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-desktop.png` });

  await page.getByRole('button', { name: /More Info/ }).click();
  await page.waitForSelector('[data-testid=modal]');
  check(await page.locator('[data-testid=modal] h2').innerText() === '2048', 'desktop: More Info opens detail modal');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await page.locator('[data-testid=modal]').count() === 0, 'desktop: Escape closes modal');

  await page.locator('.hero').getByRole('button', { name: /^▶?\s*Play$/ }).click();
  await page.waitForSelector('[data-testid=board] .game-2048__tile');
  check(page.url().endsWith('#/play/2048'), `desktop: Play opens #/play/2048 (${page.url()})`);
  let boardChanged = false;
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
    const before = await boardSnapshot(page);
    await page.keyboard.press(key);
    if (await waitForBoardChange(page, before)) { boardChanged = true; break; }
  }
  check(boardChanged, 'desktop: 2048 responds to arrow keys');
  for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowDown']) {
    await page.keyboard.press(key); await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-2048.png` });
  check(await hasNoHorizontalOverflow(page), 'desktop: no horizontal overflow on 2048 page');
  await page.getByTestId('back').click();
  await page.waitForSelector('[data-testid=player]', { state: 'detached' });
  check(true, 'desktop: Back returns to home');

  await page.goto(`${siteUrl}#/play/blocks`);
  await page.waitForSelector('[data-testid=coming-soon]');
  check(/Blocks/.test(await page.locator('[data-testid=coming-soon] h1').innerText()), 'desktop: placeholder game shows Coming Soon screen');

  // Snake
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('kush-games-snake-best', '7'));
  const playNowIds = await page.locator('[data-testid=row-play-now] .card').evaluateAll(cards => cards.map(card => card.dataset.testid));
  check(playNowIds.includes('card-snake'), `desktop: Snake is in Play Now (${playNowIds.join(', ')})`);
  check(await page.locator('[data-testid=row-coming-soon] [data-testid=card-snake]').count() === 0, 'desktop: Snake is no longer in Coming Soon');
  await page.locator('[data-testid=row-play-now] [data-testid=card-snake] .card__cover').click();
  await page.waitForSelector('[data-testid=modal]');
  await page.locator('[data-testid=modal] .button--play').click();
  await page.waitForSelector('[data-testid=snake-start]');
  check(page.url().endsWith('#/play/snake'), 'desktop: Snake opens on #/play/snake from the modal');
  check(await page.getByTestId('snake-best').innerText() === '7', 'desktop: Snake high score is read from localStorage');
  await page.keyboard.press('Space');
  const runningHead = await snakeHead(page);
  check(await snakeStatus(page) === 'running', 'desktop: Space starts Snake');
  check(await waitForSnake(page, head => head.x > runningHead.x), 'desktop: snake moves right on its own');
  let beforeTurn = await snakeHead(page);
  await page.keyboard.press('ArrowUp');
  check(await waitForSnake(page, head => head.y < beforeTurn.y && head.x === beforeTurn.x + 1 || head.y < beforeTurn.y - 1), 'desktop: ArrowUp turns the snake up');
  await page.keyboard.press('ArrowDown');
  beforeTurn = await snakeHead(page);
  await page.waitForTimeout(400);
  check((await snakeHead(page)).y < beforeTurn.y, 'desktop: instant reverse (ArrowDown while going up) is ignored');
  await page.keyboard.press('a');
  beforeTurn = await snakeHead(page);
  check(await waitForSnake(page, head => head.x < beforeTurn.x), 'desktop: WASD (a) turns the snake left');
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-snake.png` });
  await page.keyboard.press('Space');
  check(await snakeStatus(page) === 'paused' && await page.getByTestId('snake-paused').isVisible(), 'desktop: Space pauses Snake');
  const pausedHead = await snakeHead(page);
  await page.waitForTimeout(500);
  const headAfterPause = await snakeHead(page);
  check(pausedHead.x === headAfterPause.x && pausedHead.y === headAfterPause.y, 'desktop: snake stays still while paused');
  await page.keyboard.press('Space');
  check(await snakeStatus(page) === 'running', 'desktop: Space resumes Snake');
  await page.keyboard.press('ArrowLeft');
  check(await waitForSnake(page, (_head, status) => status === 'over', 8000), 'desktop: snake dies on the wall');
  check(await page.getByTestId('snake-over').isVisible() && /Score/.test(await page.getByTestId('snake-over').innerText()), 'desktop: Game Over screen shows the score');
  await page.getByTestId('snake-restart').click();
  check(await snakeStatus(page) === 'running' && Number(await page.getByTestId('snake-score').innerText()) === 0, 'desktop: Restart starts a new game');
  check(await hasNoHorizontalOverflow(page), 'desktop: no horizontal overflow on Snake page');
  check(pageErrors.length === 0, `desktop: no page errors ${pageErrors.join('; ')}`);
  await context.close();
}

// ---------- Mobile ----------
{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=hero]');
  check(await page.locator('.row').count() >= 5, 'mobile: rows render');
  check(await hasNoHorizontalOverflow(page), 'mobile: no horizontal page overflow');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-mobile.png` });

  const cdp = await context.newCDPSession(page);
  const puzzleTrack = page.locator('[data-testid=row-puzzle] .row__track');
  await puzzleTrack.scrollIntoViewIfNeeded();
  const trackBox = await puzzleTrack.boundingBox();
  const swipeY = Math.round(trackBox.y + trackBox.height / 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: swipeY }] });
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - step * 25, y: swipeY }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(700);
  const swipedScrollLeft = await puzzleTrack.evaluate(track => track.scrollLeft);
  check(swipedScrollLeft > 0, `mobile: row swipes horizontally (scrollLeft=${swipedScrollLeft})`);
  check(await hasNoHorizontalOverflow(page), 'mobile: still no page overflow after swipe');

  await page.locator('[data-testid=card-snake] .card__cover').first().tap();
  await page.waitForSelector('[data-testid=modal]');
  check(true, 'mobile: tapping a card opens the detail modal');
  check(await hasNoHorizontalOverflow(page), 'mobile: no overflow with modal open');
  await page.locator('.modal__close').tap();

  await page.goto(`${siteUrl}#/play/2048`);
  await page.waitForSelector('[data-testid=board] .game-2048__tile');
  const boardBox = await page.getByTestId('board').boundingBox();
  check(boardBox.x >= 0 && boardBox.x + boardBox.width <= 375, `mobile: 2048 board fits screen (width=${Math.round(boardBox.width)})`);
  const centerX = boardBox.x + boardBox.width / 2;
  const centerY = boardBox.y + boardBox.height / 2;
  const swipes = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  let swipeWorked = false;
  for (const [directionX, directionY] of swipes) {
    const before = await boardSnapshot(page);
    const endX = centerX + directionX * 100;
    const endY = centerY + directionY * 100;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centerX, y: centerY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (centerX + endX) / 2, y: (centerY + endY) / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: endX, y: endY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (await waitForBoardChange(page, before)) { swipeWorked = true; break; }
  }
  check(swipeWorked, 'mobile: 2048 responds to swipe');
  check(await hasNoHorizontalOverflow(page), 'mobile: no horizontal overflow on 2048 page');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-2048-mobile.png` });

  // Snake on mobile
  await page.goto(`${siteUrl}#/play/snake`);
  await page.waitForSelector('[data-testid=snake-start]');
  const snakeBoardBox = await page.getByTestId('snake-board').boundingBox();
  check(snakeBoardBox.x >= 0 && snakeBoardBox.x + snakeBoardBox.width <= 375 && snakeBoardBox.y + snakeBoardBox.height <= 812,
    `mobile: Snake board fits the screen (${Math.round(snakeBoardBox.width)}px)`);
  check(await page.locator('.snake-game__dpad').isVisible(), 'mobile: on-screen D-pad is shown');
  const dpadBox = await page.locator('.snake-game__dpad').boundingBox();
  check(dpadBox.y + dpadBox.height <= 812, 'mobile: D-pad fits on screen without scrolling');
  check(await hasNoHorizontalOverflow(page), 'mobile: no horizontal overflow on Snake page');
  const boardCenterX = snakeBoardBox.x + snakeBoardBox.width / 2;
  const boardCenterY = snakeBoardBox.y + snakeBoardBox.height / 2;
  let headBeforeSwipe = await snakeHead(page);
  await swipe(cdp, boardCenterX, boardCenterY, boardCenterX, boardCenterY - 90);
  check(await waitForSnake(page, (head, status) => status === 'running' && head.y < headBeforeSwipe.y), 'mobile: swipe up starts Snake and turns it up');
  headBeforeSwipe = await snakeHead(page);
  await swipe(cdp, boardCenterX, boardCenterY, boardCenterX + 90, boardCenterY);
  check(await waitForSnake(page, head => head.x > headBeforeSwipe.x), 'mobile: swipe right turns the snake right');
  const headBeforeDpad = await snakeHead(page);
  await page.getByRole('button', { name: 'Down', exact: true }).tap();
  check(await waitForSnake(page, head => head.y > headBeforeDpad.y), 'mobile: D-pad Down turns the snake down');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-snake-mobile.png` });
  await page.getByTestId('snake-pause').tap();
  check(await snakeStatus(page) === 'paused', 'mobile: pause button pauses Snake');
  check(pageErrors.length === 0, `mobile: no page errors ${pageErrors.join('; ')}`);
  await context.close();
}

await browser.close();
console.log(failureCount ? `\n${failureCount} check(s) failed` : '\nAll checks passed');
process.exitCode = failureCount ? 1 : 0;
