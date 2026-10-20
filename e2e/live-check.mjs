// Headless browser check of a deployed (or previewed) Kush Games site.
// Usage: node e2e/live-check.mjs [url] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { measureSnake, reactCommitCounterScript } from './perf-snake.mjs';

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
const SNAKE_COLUMNS = 17;
const SNAKE_ROWS = 17;
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const ARROW_KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
/** Shortest signed distance on a wrapping axis. */
function wrappedDistance(from, to, size) {
  const forward = (to - from + size) % size;
  return forward <= size / 2 ? forward : forward - size;
}
/** Simple autopilot: steer toward the apple (using the wrap) until `appleCount` more apples are eaten. */
/** The documented scoring formula, re-implemented independently for the checks. */
const expectedApplePoints = (tickMs, length) => Math.round(10 * (150 / tickMs) * (1 + (length - 3) / 20));
const scoringResults = [];

async function steerToApples(page, appleCount, timeoutMs) {
  const board = page.getByTestId('snake-board');
  const startApples = Number(await board.getAttribute('data-apples'));
  const deadline = Date.now() + timeoutMs;
  let lastSteeredHead = '';
  let previous = null; // { score, length, tickMs, apples } seen on the previous poll
  while (Date.now() < deadline) {
    const [headValue, appleValue, direction, status, scoreText, lengthText, tickText, applesText] = await page.evaluate(() => {
      const element = document.querySelector('[data-testid=snake-board]');
      return ['head', 'apple', 'direction', 'status', 'score', 'length', 'tickMs', 'apples'].map(name => element.dataset[name]);
    });
    const current = { score: Number(scoreText), length: Number(lengthText), tickMs: Number(tickText), apples: Number(applesText) };
    if (previous && current.apples === previous.apples + 1) {
      // score increment must match the formula using the speed + length from just before eating
      scoringResults.push({ gained: current.score - previous.score, expected: expectedApplePoints(previous.tickMs, previous.length),
        tickMs: previous.tickMs, length: previous.length, tickAfter: current.tickMs });
    }
    previous = current;
    const eaten = current.apples - startApples;
    if (eaten >= appleCount || status !== 'running') return eaten;
    const [headX, headY] = headValue.split(',').map(Number);
    const [appleX, appleY] = appleValue.split(',').map(Number);
    const distanceX = wrappedDistance(headX, appleX, SNAKE_COLUMNS);
    const distanceY = wrappedDistance(headY, appleY, SNAKE_ROWS);
    let wanted = distanceX !== 0 ? (distanceX > 0 ? 'right' : 'left') : (distanceY > 0 ? 'down' : 'up');
    if (wanted === OPPOSITE[direction]) wanted = distanceY !== 0 ? (distanceY > 0 ? 'down' : 'up') : 'up';
    if (wanted === OPPOSITE[direction]) wanted = 'left';
    if (wanted !== direction && lastSteeredHead !== headValue) {
      lastSteeredHead = headValue;
      await page.keyboard.press(ARROW_KEY[wanted]);
    }
    await page.waitForTimeout(15);
  }
  return Number(await board.getAttribute('data-apples')) - startApples;
}

/** Median time between snake steps, measured from data-head changes in the page. */
async function measureStepInterval(page, durationMs) {
  return page.evaluate(duration => new Promise(resolve => {
    const board = document.querySelector('[data-testid=snake-board]');
    const times = [];
    const observer = new MutationObserver(() => times.push(performance.now()));
    observer.observe(board, { attributes: true, attributeFilter: ['data-head'] });
    setTimeout(() => {
      observer.disconnect();
      const gaps = times.slice(1).map((time, index) => time - times[index]).sort((first, second) => first - second);
      resolve(gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null);
    }, duration);
  }), durationMs);
}

/** Sample canvas pixels at the centre of the head cell, the first body cell and an empty cell. */
async function headAndBodyColors(page) {
  return page.evaluate(({ columns, rows }) => {
    const board = document.querySelector('[data-testid=snake-board]');
    const canvas = board.querySelector('canvas');
    const context = canvas.getContext('2d');
    const [headX, headY] = board.dataset.head.split(',').map(Number);
    const offset = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[board.dataset.direction];
    const bodyX = (headX - offset[0] + columns) % columns;
    const bodyY = (headY - offset[1] + rows) % rows;
    const cellPixels = canvas.width / columns;
    const colorAt = (cellX, cellY, fractionX = 0.5, fractionY = 0.5) => {
      // for the head, sample behind the eyes (towards the neck) so we hit the head colour
      const pixel = context.getImageData(Math.floor((cellX + fractionX) * cellPixels), Math.floor((cellY + fractionY) * cellPixels), 1, 1).data;
      return `${pixel[0]},${pixel[1]},${pixel[2]}`;
    };
    const behind = 0.5 - offset[0] * 0.2;
    const behindY = 0.5 - offset[1] * 0.2;
    const [appleX, appleY] = board.dataset.apple.split(',').map(Number);
    let emptyX = (headX + 5) % columns; const emptyY = (headY + 5) % rows;
    if (emptyX === appleX && emptyY === appleY) emptyX = (emptyX + 1) % columns;
    return { head: colorAt(headX, headY, behind, behindY), body: colorAt(bodyX, bodyY), background: colorAt(emptyX, emptyY) };
  }, { columns: SNAKE_COLUMNS, rows: SNAKE_ROWS });
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
  await context.addInitScript(reactCommitCounterScript);
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

  await page.goto(`${siteUrl}#/play/minesweeper`);
  await page.waitForSelector('[data-testid=coming-soon]');
  check(/Minesweeper/.test(await page.locator('[data-testid=coming-soon] h1').innerText()), 'desktop: placeholder game shows Coming Soon screen');

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
  const board = page.getByTestId('snake-board');
  const startPicker = page.locator('[data-testid=snake-start] [data-testid=snake-speed-picker]');
  check(await startPicker.isVisible(), 'desktop: Start screen shows the speed mode toggle');
  check(await page.evaluate(() => localStorage.getItem('kush-games-snake-speed')) === null, 'desktop: fresh localStorage (no saved speed)');
  check(await board.getAttribute('data-speed-mode') === 'constant' && await board.getAttribute('data-tick-ms') === '150'
    && await page.getByTestId('snake-multiplier').innerText() === 'x1.0', 'desktop: default mode is Constant · Slow at 150 ms (x1.0)');
  check(await startPicker.getByRole('radio', { name: /Constant/ }).getAttribute('aria-checked') === 'true'
    && await startPicker.getByRole('radio', { name: /^Slow/ }).getAttribute('aria-checked') === 'true'
    && await startPicker.getByRole('radio', { name: /Speeding up/ }).getAttribute('aria-checked') === 'false',
    'desktop: Start screen shows Constant · Slow selected');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-snake-start.png` });
  await startPicker.getByRole('radio', { name: /Speeding up/ }).click();
  check(await board.getAttribute('data-speed-mode') === 'speeding-up' && await board.getAttribute('data-tick-ms') === '150', 'desktop: choosing Speeding up works');
  await startPicker.getByRole('radio', { name: /Normal/ }).click();
  check(await board.getAttribute('data-speed-mode') === 'constant' && await board.getAttribute('data-tick-ms') === '110'
    && await page.getByTestId('snake-multiplier').innerText() === 'x1.4', 'desktop: choosing Normal uses 110 ms (x1.4)');
  await startPicker.getByRole('radio', { name: /Very fast/ }).click();
  check(await board.getAttribute('data-tick-ms') === '60' && await page.getByTestId('snake-multiplier').innerText() === 'x2.5',
    'desktop: Very fast is 60 ms (x2.5)');
  check(JSON.parse(await page.evaluate(() => localStorage.getItem('kush-games-snake-speed'))).constantSpeed === 'very-fast', 'desktop: speed choice is saved');
  await startPicker.getByRole('radio', { name: /^Fast/ }).click();
  const chipSettings = [];
  for (let click = 0; click < 5; click++) {
    await page.getByTestId('snake-speed-chip').click();
    chipSettings.push(`${await board.getAttribute('data-speed-mode')}:${await board.getAttribute('data-tick-ms')}`);
  }
  check(chipSettings.join(' ') === 'constant:60 speeding-up:150 constant:150 constant:110 constant:80',
    `desktop: header speed chip cycles the modes (${chipSettings.join(' ')})`);
  await startPicker.getByRole('radio', { name: /Speeding up/ }).click();
  check(await board.getAttribute('data-speed-mode') === 'speeding-up', 'desktop: back to Speeding up for the main run');
  await page.keyboard.press('Space');
  const runningHead = await snakeHead(page);
  check(await snakeStatus(page) === 'running', 'desktop: Space starts Snake');
  check(await page.getByTestId('snake-speed-chip').isDisabled(), 'desktop: speed chip is disabled while playing');
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
  await page.keyboard.press('Space');
  check(await snakeStatus(page) === 'paused' && await page.getByTestId('snake-paused').isVisible(), 'desktop: Space pauses Snake');
  const pausedHead = await snakeHead(page);
  check(await page.getByTestId('snake-canvas').count() === 1, 'desktop: Snake board is a single canvas');
  check(await page.locator('[data-testid=snake-board] svg, [data-testid=snake-board] rect').count() === 0, 'desktop: no SVG segment elements on the board');
  const colors = await headAndBodyColors(page);
  check(colors.head !== colors.body && colors.head !== colors.background && colors.body !== colors.background,
    `desktop: head pixel differs from body pixel (head ${colors.head}, body ${colors.body}, background ${colors.background})`);
  check(colors.head === '141,255,159' && colors.body === '31,168,74', 'desktop: head is bright green, body is darker green');
  await page.waitForTimeout(500);
  const headAfterPause = await snakeHead(page);
  check(pausedHead.x === headAfterPause.x && pausedHead.y === headAfterPause.y, 'desktop: snake stays still while paused');
  await page.keyboard.press('Space');
  check(await snakeStatus(page) === 'running', 'desktop: Space resumes Snake');
  // Pass-through edges: head left, off the left edge, and come back on the right.
  await page.keyboard.press('ArrowLeft');
  check(await waitForSnake(page, (head, status) => status === 'running' && head.x === 0, 4000), 'desktop: snake reaches the left edge');
  check(await waitForSnake(page, (head, status) => status === 'running' && head.x === SNAKE_COLUMNS - 1, 1000),
    'desktop: snake wraps off the left edge and reappears on the right');
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-snake.png` });
  check(await waitForSnake(page, (head, status) => status === 'running' && head.x === SNAKE_COLUMNS - 3, 1500), 'desktop: snake keeps playing after wrapping');
  // Wrap vertically too: go up and come back from the bottom.
  await page.keyboard.press('ArrowUp');
  check(await waitForSnake(page, head => head.y === 0, 4000) && await waitForSnake(page, (head, status) => status === 'running' && head.y === SNAKE_ROWS - 1, 1000),
    'desktop: snake wraps off the top edge and reappears at the bottom');

  // Game Over the only way left: eat two apples (length 5), then turn back into its own body.
  check(await page.getByTestId('snake-mute').getAttribute('aria-pressed') === 'false', 'desktop: sound is on by default');
  let applesEaten = await steerToApples(page, 1, 30000);
  const chompsAfterFirstApple = Number(await page.getByTestId('snake-board').getAttribute('data-chomps') ?? 0);
  check(applesEaten >= 1 && chompsAfterFirstApple >= 1, `desktop: eating an apple plays the chomp sound (chomps=${chompsAfterFirstApple})`);
  await page.keyboard.press('m');
  check(await page.getByTestId('snake-mute').getAttribute('aria-pressed') === 'true'
    && await page.evaluate(() => localStorage.getItem('kush-games-snake-muted')) === 'true', 'desktop: M mutes and the choice is saved');
  applesEaten += await steerToApples(page, 1, 30000);
  const chompsWhileMuted = Number(await page.getByTestId('snake-board').getAttribute('data-chomps') ?? 0);
  check(chompsWhileMuted === chompsAfterFirstApple, 'desktop: no chomp while muted');
  await page.getByTestId('snake-mute').click();
  check(await page.getByTestId('snake-mute').getAttribute('aria-pressed') === 'false'
    && await page.evaluate(() => localStorage.getItem('kush-games-snake-muted')) === 'false', 'desktop: mute button turns sound back on');
  check(applesEaten >= 2 && Number(await page.getByTestId('snake-score').innerText()) >= 20, `desktop: snake eats apples and scores (score=${await page.getByTestId('snake-score').innerText()})`);
  check(scoringResults.length >= 2 && scoringResults.every(result => result.gained === result.expected),
    `desktop: score increments match the formula in Speeding up (${scoringResults.map(result => `+${result.gained} vs ${result.expected} @${result.tickMs}ms len${result.length}`).join(', ')})`);
  check(await board.getAttribute('data-tick-ms') === '144' && await page.getByTestId('snake-multiplier').innerText() === 'x1.0',
    `desktop: Speeding up gets faster after 2 apples (tick ${await board.getAttribute('data-tick-ms')} ms)`);
  check(Number(await page.getByTestId('snake-board').getAttribute('data-length')) >= 5, 'desktop: snake grows by one per apple');
  const currentDirection = await page.getByTestId('snake-board').getAttribute('data-direction');
  const leftTurn = { right: 'up', up: 'left', left: 'down', down: 'right' }[currentDirection];
  for (const turn of [leftTurn, OPPOSITE[currentDirection], OPPOSITE[leftTurn]]) await page.keyboard.press(ARROW_KEY[turn]);
  check(await waitForSnake(page, (_head, status) => status === 'over', 3000), 'desktop: snake dies when it runs into itself');
  const overText = await page.getByTestId('snake-over-stats').innerText();
  check(await page.getByTestId('snake-over').isVisible() && /Length\s*5/i.test(overText) && /Speed/i.test(overText) && /Score/i.test(overText),
    `desktop: Game Over shows length, speed and score (${overText.replace(/\s+/g, ' ')})`);
  check(/Speeding up/.test(await page.evaluate(() => localStorage.getItem('kush-games-snake-best-details'))),
    'desktop: shared best score remembers the mode it was set in');
  // Switch to Constant · Fast on the Game Over screen; it applies at restart.
  const overPicker = page.locator('[data-testid=snake-over] [data-testid=snake-speed-picker]');
  await overPicker.getByRole('radio', { name: /^Fast/ }).click();
  check(await board.getAttribute('data-speed-mode') === 'speeding-up', 'desktop: mode change on Game Over waits for restart');
  await page.getByTestId('snake-restart').click();
  check(await snakeStatus(page) === 'running' && Number(await page.getByTestId('snake-score').innerText()) === 0, 'desktop: Restart starts a new game');
  check(await board.getAttribute('data-speed-mode') === 'constant' && await board.getAttribute('data-tick-ms') === '80'
    && await page.getByTestId('snake-multiplier').innerText() === 'x1.9', 'desktop: restart uses Constant · Fast (80 ms, x1.9)');
  const intervalBeforeEating = await measureStepInterval(page, 1000);
  scoringResults.length = 0;
  const constantApples = await steerToApples(page, 2, 30000);
  const intervalAfterEating = await measureStepInterval(page, 1000);
  check(constantApples >= 2 && await board.getAttribute('data-tick-ms') === '80'
    && Math.abs(intervalBeforeEating - 80) <= 15 && Math.abs(intervalAfterEating - 80) <= 15,
    `desktop: Constant mode keeps the step interval fixed after eating (${intervalBeforeEating} ms before, ${intervalAfterEating} ms after)`);
  check(scoringResults.length >= 2 && scoringResults.every(result => result.gained === result.expected && result.tickAfter === 80),
    `desktop: score increments match the formula in Constant mode (${scoringResults.map(result => `+${result.gained} vs ${result.expected} @${result.tickMs}ms len${result.length}`).join(', ')})`);
  check(await page.getByTestId('snake-floating-points').innerText() === `+${scoringResults.at(-1)?.gained}`, 'desktop: floating +N shows the last apple\'s points');
  // Performance sanity: 5 s of straight play (edges wrap, so it can't die).
  const cdpDesktop = await context.newCDPSession(page);
  const performance = await measureSnake(page, cdpDesktop, 5);
  console.log(`INFO desktop Snake 5 s: ${JSON.stringify(performance)}`);
  check(performance.reactCommits <= 4, `desktop: no React re-render per tick (${performance.reactCommits} commits in 5 s)`);
  check(performance.elementOrTextMutations <= 12, `desktop: no DOM element churn per tick (${performance.elementOrTextMutations} element/text mutations in 5 s)`);
  check(await snakeStatus(page) === 'running', 'desktop: still running after 5 s of wrapping');
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
  const headerBox = await page.locator('.snake-game__header').evaluate(header => {
    const lastButton = header.querySelector('[data-testid=snake-pause]').getBoundingClientRect();
    return { buttonsRight: lastButton.right, headerRight: header.getBoundingClientRect().right };
  });
  check(headerBox.buttonsRight <= headerBox.headerRight + 1, `mobile: score + mute + pause buttons fit in the header (${Math.round(headerBox.buttonsRight)} <= ${Math.round(headerBox.headerRight)})`);
  const startFit = await page.evaluate(() => {
    const boardRect = document.querySelector('[data-testid=snake-board]').getBoundingClientRect();
    const inside = element => { const rect = element.getBoundingClientRect();
      return rect.left >= boardRect.left - 1 && rect.right <= boardRect.right + 1 && rect.top >= boardRect.top - 1 && rect.bottom <= boardRect.bottom + 1; };
    const overlay = document.querySelector('[data-testid=snake-start]');
    return { picker: inside(overlay.querySelector('[data-testid=snake-speed-picker]')), startButton: inside(overlay.querySelector('[data-testid=snake-start-button]')),
      overlayScrolls: overlay.scrollHeight > overlay.clientHeight + 1 };
  });
  check(startFit.picker && startFit.startButton && !startFit.overlayScrolls, `mobile: Start screen speed toggle and Start button fit on the board (${JSON.stringify(startFit)})`);
  const mobilePicker = page.locator('[data-testid=snake-start] [data-testid=snake-speed-picker]');
  check(await page.getByTestId('snake-board').getAttribute('data-speed-mode') === 'constant' && await page.getByTestId('snake-board').getAttribute('data-tick-ms') === '150'
    && await mobilePicker.getByRole('radio', { name: /^Slow/ }).getAttribute('aria-checked') === 'true'
    && await page.getByTestId('snake-multiplier').innerText() === 'x1.0', 'mobile: fresh start defaults to Constant · Slow (150 ms, x1.0)');
  await mobilePicker.getByRole('radio', { name: /Normal/ }).tap();
  check(await page.getByTestId('snake-board').getAttribute('data-tick-ms') === '110', 'mobile: tapping Normal switches to 110 ms');
  await mobilePicker.getByRole('radio', { name: /Speeding up/ }).tap();
  await page.reload();
  await page.waitForSelector('[data-testid=snake-start]');
  check(await page.getByTestId('snake-board').getAttribute('data-speed-mode') === 'speeding-up', 'mobile: a saved Speeding up choice is kept after reload');
  const canvasSize = await page.getByTestId('snake-canvas').evaluate(canvas => ({ pixels: canvas.width, css: canvas.clientWidth }));
  check(canvasSize.pixels === Math.round(canvasSize.css * 2), `mobile: canvas is sized for devicePixelRatio 2 (${canvasSize.pixels}px for ${canvasSize.css}px)`);
  const dpadBox = await page.locator('.snake-game__dpad').boundingBox();
  check(dpadBox.y + dpadBox.height <= 812, 'mobile: D-pad fits on screen without scrolling');
  check(await hasNoHorizontalOverflow(page), 'mobile: no horizontal overflow on Snake page');
  const boardCenterX = snakeBoardBox.x + snakeBoardBox.width / 2;
  const boardCenterY = snakeBoardBox.y + snakeBoardBox.height / 2;
  let headBeforeSwipe = await snakeHead(page);
  await swipe(cdp, boardCenterX, boardCenterY, boardCenterX, boardCenterY - 90);
  check(await waitForSnake(page, (head, status) => status === 'running' && head.y < headBeforeSwipe.y), 'mobile: swipe up starts Snake and turns it up');
  check(await waitForSnake(page, head => head.y === 0, 3000) && await waitForSnake(page, (head, status) => status === 'running' && head.y === SNAKE_ROWS - 1, 1000),
    'mobile: snake wraps off the top and reappears at the bottom');
  headBeforeSwipe = await snakeHead(page);
  await swipe(cdp, boardCenterX, boardCenterY, boardCenterX + 90, boardCenterY);
  check(await waitForSnake(page, head => head.x > headBeforeSwipe.x), 'mobile: swipe right turns the snake right');
  const headBeforeDpad = await snakeHead(page);
  await page.getByRole('button', { name: 'Down', exact: true }).tap();
  // wrap-aware: moving down from the bottom row lands on row 0
  check(await waitForSnake(page, head => head.y === (headBeforeDpad.y + 1) % SNAKE_ROWS || head.y === (headBeforeDpad.y + 2) % SNAKE_ROWS, 2000)
    && await page.getByTestId('snake-board').getAttribute('data-direction') === 'down', 'mobile: D-pad Down turns the snake down');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-snake-mobile.png` });
  await page.getByTestId('snake-pause').tap();
  check(await snakeStatus(page) === 'paused', 'mobile: pause button pauses Snake');
  const mobileColors = await headAndBodyColors(page);
  check(mobileColors.head !== mobileColors.body, `mobile: head pixel differs from body pixel (head ${mobileColors.head}, body ${mobileColors.body})`);
  await page.getByTestId('snake-mute').tap();
  check(await page.getByTestId('snake-mute').getAttribute('aria-pressed') === 'true', 'mobile: mute button toggles');
  check(pageErrors.length === 0, `mobile: no page errors ${pageErrors.join('; ')}`);
  await context.close();
}

// ---------- Blocks ----------
const blocksAttribute = (page, name) => page.getByTestId('blocks-board').getAttribute(`data-${name}`);
const blocksNumber = async (page, name) => Number(await blocksAttribute(page, name));
const canvasFingerprint = page => page.getByTestId('blocks-canvas').evaluate(canvas => {
  const text = canvas.toDataURL();
  let hash = 0;
  for (let index = 0; index < text.length; index += 7) hash = (hash * 31 + text.charCodeAt(index)) | 0;
  return hash;
});
async function waitForBlocks(page, predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await page.waitForTimeout(30);
  }
  return false;
}
/** Hard-drop a few pieces at different columns so the board has a stack. */
async function stackSomePieces(page, pressKey, count) {
  for (let pieceIndex = 0; pieceIndex < count; pieceIndex++) {
    const shift = (pieceIndex % 5) - 2;
    for (let step = 0; step < Math.abs(shift) * 2; step++) await pressKey(shift < 0 ? 'left' : 'right');
    if (pieceIndex % 2 === 1) await pressKey('rotate');
    await pressKey('hardDrop');
    await page.waitForTimeout(60);
  }
}

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(reactCommitCounterScript);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  const playNowIds = await page.locator('[data-testid=row-play-now] .card').evaluateAll(cards => cards.map(card => card.dataset.testid));
  check(playNowIds.includes('card-blocks') && await page.locator('[data-testid=row-coming-soon] [data-testid=card-blocks]').count() === 0,
    `blocks desktop: Blocks is in Play Now and not Coming Soon (${playNowIds.join(', ')})`);
  check(await page.locator('[data-testid=row-puzzle] [data-testid=card-blocks]').count() === 1
    && await page.locator('[data-testid=row-arcade] [data-testid=card-blocks]').count() === 1, 'blocks desktop: Blocks is in Puzzle and Arcade rows');
  await page.goto(`${siteUrl}?blocksSeed=11#/play/blocks`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=blocks-start]');
  check(await page.getByTestId('blocks-canvas').count() === 1, 'blocks desktop: board is a single canvas');
  await page.keyboard.press('Space');
  check(await blocksAttribute(page, 'status') === 'running' && (await blocksAttribute(page, 'piece')) !== '', 'blocks desktop: Space starts the game and a piece spawns');
  if (await blocksAttribute(page, 'piece') === 'O') { await page.keyboard.press('Space'); await page.waitForTimeout(50); }
  const startY = await blocksNumber(page, 'piece-y');
  check(await waitForBlocks(page, async () => await blocksNumber(page, 'piece-y') > startY, 1500), 'blocks desktop: pieces fall by gravity');
  const fingerprintBefore = await canvasFingerprint(page);
  const startX = await blocksNumber(page, 'piece-x');
  await page.keyboard.press('ArrowLeft');
  check(await blocksNumber(page, 'piece-x') === startX - 1, 'blocks desktop: ArrowLeft moves one column left');
  check(await canvasFingerprint(page) !== fingerprintBefore, 'blocks desktop: the canvas changes when the piece moves');
  await page.keyboard.press('d');
  check(await blocksNumber(page, 'piece-x') === startX, 'blocks desktop: D moves one column right');
  const rotationBefore = await blocksNumber(page, 'rotation');
  await page.keyboard.press('ArrowUp');
  check(await blocksNumber(page, 'rotation') === (rotationBefore + 1) % 4, 'blocks desktop: ArrowUp rotates clockwise');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(450);
  await page.keyboard.up('ArrowLeft');
  check(await blocksNumber(page, 'piece-x') <= startX - 3, `blocks desktop: holding ArrowLeft auto-repeats (x ${startX} → ${await blocksNumber(page, 'piece-x')})`);
  const scoreBeforeSoftDrop = await blocksNumber(page, 'score');
  await page.keyboard.press('ArrowDown');
  check(await blocksNumber(page, 'score') === scoreBeforeSoftDrop + 1, 'blocks desktop: soft drop scores 1 point');
  const pieceBeforeHold = await blocksAttribute(page, 'piece');
  await page.keyboard.press('c');
  check(await blocksAttribute(page, 'hold') === pieceBeforeHold, 'blocks desktop: C holds the piece');
  const locksBefore = await blocksNumber(page, 'locks');
  const scoreBeforeHardDrop = await blocksNumber(page, 'score');
  await page.keyboard.press('Space');
  check(await blocksNumber(page, 'locks') === locksBefore + 1 && await blocksNumber(page, 'filled-cells') === 4
    && await blocksNumber(page, 'score') > scoreBeforeHardDrop, 'blocks desktop: Space hard-drops and locks the piece');
  check(Number(await blocksAttribute(page, 'sounds') ?? 0) >= 1, 'blocks desktop: lock plays a sound');
  const desktopKeys = { left: 'ArrowLeft', right: 'ArrowRight', rotate: 'ArrowUp', hardDrop: 'Space' };
  await stackSomePieces(page, key => page.keyboard.press(desktopKeys[key]), 7);
  check(await blocksNumber(page, 'filled-cells') >= 20, `blocks desktop: pieces stack up (${await blocksNumber(page, 'filled-cells')} cells)`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-blocks.png` });
  await page.keyboard.press('p');
  check(await blocksAttribute(page, 'status') === 'paused' && await page.getByTestId('blocks-paused').isVisible(), 'blocks desktop: P pauses');
  const pausedY = await blocksNumber(page, 'piece-y');
  await page.waitForTimeout(1000);
  check(await blocksNumber(page, 'piece-y') === pausedY, 'blocks desktop: nothing falls while paused');
  await page.keyboard.press('p');
  check(await blocksAttribute(page, 'status') === 'running', 'blocks desktop: P resumes');
  await page.getByTestId('blocks-mute').click();
  check(await page.getByTestId('blocks-mute').getAttribute('aria-pressed') === 'true'
    && await page.evaluate(() => localStorage.getItem('kush-games-blocks-muted')) === 'true', 'blocks desktop: mute toggles and is saved');
  const soundsWhileMuted = Number(await blocksAttribute(page, 'sounds') ?? 0);
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  check(Number(await blocksAttribute(page, 'sounds') ?? 0) === soundsWhileMuted, 'blocks desktop: no sound while muted');
  await page.getByTestId('blocks-mute').click();
  check(await page.getByTestId('blocks-mute').getAttribute('aria-pressed') === 'false', 'blocks desktop: unmute');
  // idle falling: no React re-renders
  const cdp = await context.newCDPSession(page);
  const performance = await measureSnake(page, cdp, 5, '[data-testid=blocks-game]');
  console.log(`INFO blocks desktop 5 s idle falling: ${JSON.stringify(performance)}`);
  check(performance.reactCommits === 0 && performance.elementOrTextMutations === 0,
    `blocks desktop: 0 React re-renders while idle-falling (${performance.reactCommits} commits, ${performance.elementOrTextMutations} element changes)`);
  check(await hasNoHorizontalOverflow(page), 'blocks desktop: no horizontal overflow');

  // Line clear (test-only setup: bottom 4 rows full except column 0, an I piece first)
  await page.goto(`${siteUrl}?blocksSetup=quad#/play/blocks`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=blocks-start]');
  check(await blocksNumber(page, 'filled-cells') === 36, 'blocks desktop: test setup has 4 nearly-full rows');
  await page.keyboard.press('Space');
  check(await blocksAttribute(page, 'piece') === 'I', 'blocks desktop: test setup starts with an I piece');
  await page.keyboard.press('ArrowUp');
  for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowLeft');
  const soundsBeforeClear = Number(await blocksAttribute(page, 'sounds') ?? 0);
  await page.keyboard.press('Space');
  check(await blocksAttribute(page, 'clearing') === 'true' && await blocksAttribute(page, 'last-clear') === '4',
    'blocks desktop: a 4-line clear starts the clear animation');
  await page.waitForTimeout(100);
  await page.screenshot({ path: '/tmp/kush-games-blocks-clear.png' });
  check(await page.getByTestId('blocks-clear-label').innerText() === 'BLOCKS!', 'blocks desktop: 4 lines show "BLOCKS!"');
  check(await page.getByTestId('blocks-frame').getAttribute('data-shakes') === '1', 'blocks desktop: 4 lines shake the board');
  check(Number(await blocksAttribute(page, 'sounds') ?? 0) === soundsBeforeClear + 1, 'blocks desktop: line clear plays the chime');
  check(await waitForBlocks(page, async () => await blocksAttribute(page, 'clearing') === 'false', 1000), 'blocks desktop: rows collapse after the animation');
  check(await blocksNumber(page, 'filled-cells') === 0 && await blocksNumber(page, 'lines') === 4
    && await blocksNumber(page, 'score') === 800 + 2 * 17 && await page.getByTestId('blocks-lines').innerText() === '4',
    `blocks desktop: board is empty, 4 lines, score 834 (${await blocksNumber(page, 'score')})`);
  check(await blocksAttribute(page, 'piece') === 'O', 'blocks desktop: next piece spawns after the clear');
  check(pageErrors.length === 0, `blocks desktop: no page errors ${pageErrors.join('; ')}`);
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`${siteUrl}?blocksSeed=21#/play/blocks`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=blocks-start]');
  check(await hasNoHorizontalOverflow(page), 'blocks mobile: no horizontal overflow');
  const layout = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    const board = box('[data-testid=blocks-board]'), side = box('.blocks-game__side'), controls = box('.blocks-game__controls');
    return { boardLeft: board.left, sideRight: side.right, controlsLeft: controls.left, controlsRight: controls.right, controlsBottom: controls.bottom, boardWidth: board.width };
  });
  check(layout.boardLeft >= 0 && layout.sideRight <= 375 && layout.controlsLeft >= 0 && layout.controlsRight <= 375 && layout.controlsBottom <= 812,
    `blocks mobile: board, side panel and buttons fit at 375px (${JSON.stringify(layout)})`);
  await page.getByTestId('blocks-start-button').tap();
  check(await blocksAttribute(page, 'status') === 'running', 'blocks mobile: Start button starts');
  if (await blocksAttribute(page, 'piece') === 'O') { await page.getByRole('button', { name: 'Hard drop' }).tap(); await page.waitForTimeout(50); }
  const tapButton = async name => { await page.getByRole('button', { name, exact: true }).tap(); await page.waitForTimeout(40); };
  let pieceX = await blocksNumber(page, 'piece-x');
  await tapButton('Move left');
  check(await blocksNumber(page, 'piece-x') === pieceX - 1, 'blocks mobile: ◀ button moves left');
  await tapButton('Move right');
  check(await blocksNumber(page, 'piece-x') === pieceX, 'blocks mobile: ▶ button moves right');
  let rotation = await blocksNumber(page, 'rotation');
  await tapButton('Rotate');
  check(await blocksNumber(page, 'rotation') === (rotation + 1) % 4, 'blocks mobile: ⟳ button rotates');
  const yBeforeSoft = await blocksNumber(page, 'piece-y');
  await tapButton('Soft drop');
  check(await blocksNumber(page, 'piece-y') >= yBeforeSoft + 1 && await blocksNumber(page, 'score') >= 1, 'blocks mobile: ▼ button soft-drops');
  let locks = await blocksNumber(page, 'locks');
  await tapButton('Hard drop');
  check(await blocksNumber(page, 'locks') === locks + 1, 'blocks mobile: ⤓ button hard-drops');
  // gestures
  const cdp = await context.newCDPSession(page);
  const boardBox = await page.getByTestId('blocks-board').boundingBox();
  const cell = boardBox.width / 10;
  const centerX = boardBox.x + boardBox.width / 2;
  const centerY = boardBox.y + boardBox.height * 0.4;
  const touch = async (points, delayMs) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (const point of points.slice(1)) { await page.waitForTimeout(delayMs); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] }); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(60);
  };
  if (await blocksAttribute(page, 'piece') === 'O') { await tapButton('Hard drop'); }
  rotation = await blocksNumber(page, 'rotation');
  await touch([{ x: centerX, y: centerY }], 0);
  check(await blocksNumber(page, 'rotation') === (rotation + 1) % 4, 'blocks mobile: tap on the board rotates');
  pieceX = await blocksNumber(page, 'piece-x');
  await touch([{ x: centerX, y: centerY }, { x: centerX + cell * 0.6, y: centerY }, { x: centerX + cell * 1.2, y: centerY }, { x: centerX + cell * 2.3, y: centerY }], 30);
  check(await blocksNumber(page, 'piece-x') === pieceX + 2, `blocks mobile: dragging right moves by cells (${pieceX} → ${await blocksNumber(page, 'piece-x')})`);
  locks = await blocksNumber(page, 'locks');
  await touch([{ x: centerX, y: centerY - 60 }, { x: centerX, y: centerY - 20 }, { x: centerX, y: centerY + 40 }], 20);
  check(await blocksNumber(page, 'locks') === locks + 1, 'blocks mobile: quick flick down hard-drops');
  const mobileButtons = { left: 'Move left', right: 'Move right', rotate: 'Rotate', hardDrop: 'Hard drop' };
  await stackSomePieces(page, key => tapButton(mobileButtons[key]), 6);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-blocks-mobile.png` });
  check(await hasNoHorizontalOverflow(page), 'blocks mobile: still no overflow mid-game');
  await page.getByTestId('blocks-mute').tap();
  check(await page.getByTestId('blocks-mute').getAttribute('aria-pressed') === 'true', 'blocks mobile: mute button toggles');
  await page.getByTestId('blocks-pause').tap();
  check(await blocksAttribute(page, 'status') === 'paused', 'blocks mobile: pause button pauses');
  check(pageErrors.length === 0, `blocks mobile: no page errors ${pageErrors.join('; ')}`);
  await context.close();
}

await browser.close();
console.log(failureCount ? `\n${failureCount} check(s) failed` : '\nAll checks passed');
process.exitCode = failureCount ? 1 : 0;
