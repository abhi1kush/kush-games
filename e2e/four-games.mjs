// Smoke test for three Rust/WebAssembly board/arcade games (Breakout, Connect Four, Checkers) at 1280 and 375 px:
// play a little, refresh and check the save is restored, check the hub's Continue badges; saves screenshots.
// Usage: node e2e/four-games.mjs [siteUrl] [screenshotDirectory]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const GAME_IDS = ['breakout', 'connect-four', 'checkers'];
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const aiTimes = { 'connect-four': [], checkers: [] };
async function waitFor(predicate, timeoutMs = 10000, intervalMs = 60) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}
const data = (page, testId, name) => page.getByTestId(testId).getAttribute(`data-${name}`);
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openGame(page, id, testId) {
  await page.goto(`${siteUrl}#/play/${id}`);
  await page.waitForSelector(`[data-testid=${testId}]`, { timeout: 15000 });
}

// ---------------- Breakout ----------------
async function testBreakout(page, label, screenshotPath) {
  const wasmRequests = [];
  page.on('request', request => { if (request.url().endsWith('.wasm')) wasmRequests.push(request.url().split('/').pop()); });
  await openGame(page, 'breakout', 'breakout');
  check(wasmRequests.length === 1 && wasmRequests[0].startsWith('breakout_bg'), `${label} breakout: only its own wasm is fetched (${wasmRequests.join(', ')})`);
  check(await data(page, 'breakout', 'phase') === '0', `${label} breakout: starts serving`);
  const canvas = page.getByTestId('breakout-canvas');
  const box = await canvas.boundingBox();
  check(box.width > 200 && box.x >= 0 && box.x + box.width <= page.viewportSize().width, `${label} breakout: canvas fits (${Math.round(box.width)}×${Math.round(box.height)})`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
  check(await waitFor(async () => await data(page, 'breakout', 'phase') === '1', 2000), `${label} breakout: click launches the ball`);
  // follow the ball with the keyboard-free pointer: sweep the paddle a little, then wait for brick hits
  for (let step = 0; step < 8; step++) { await page.mouse.move(box.x + box.width * (0.3 + 0.05 * step), box.y + box.height * 0.9); await pause(150); }
  check(await waitFor(async () => Number(await page.getByTestId('breakout-score').innerText()) > 0, 6000), `${label} breakout: bricks break and the score rises (${await page.getByTestId('breakout-score').innerText()})`);
  if (screenshotPath) await page.screenshot({ path: screenshotPath });
  await page.keyboard.press('p');
  check(await data(page, 'breakout', 'paused') === 'true', `${label} breakout: P pauses`);
  const score = await page.getByTestId('breakout-score').innerText();
  await page.reload();
  await page.waitForSelector('[data-testid=breakout]');
  check(await data(page, 'breakout', 'paused') === 'true' && await page.getByTestId('restored').count() === 1, `${label} breakout: refresh restores the game, paused`);
  check(await page.getByTestId('breakout-score').innerText() === score, `${label} breakout: score restored (${score})`);
  await page.getByTestId('breakout-overlay').click();
  check(await data(page, 'breakout', 'paused') === 'false', `${label} breakout: tap resumes`);
  await page.keyboard.press('p');
  check(await noOverflow(page), `${label} breakout: no horizontal scroll`);
}

// ---------------- Connect Four ----------------
async function testConnectFour(page, label, screenshotPath) {
  await openGame(page, 'connect-four', 'connect-four');
  await page.getByTestId('c4-mode-computer').click();
  await page.getByTestId('c4-level-2').click();
  check(await data(page, 'connect-four', 'level') === '2', `${label} connect four: Hard selected`);
  // if the computer opens, wait for it
  await waitFor(async () => await data(page, 'connect-four', 'thinking') === 'false' && Number(await data(page, 'connect-four', 'moves')) % 2 === 0, 5000);
  for (const column of [3, 3, 2]) {
    const before = Number(await data(page, 'connect-four', 'moves'));
    await page.getByTestId(`c4-column-${column}`).click();
    const answered = await waitFor(async () => Number(await data(page, 'connect-four', 'moves')) >= before + 2 || await data(page, 'connect-four', 'winner') !== '0', 6000);
    const milliseconds = Number(await data(page, 'connect-four', 'ai-ms'));
    if (milliseconds) aiTimes['connect-four'].push(milliseconds);
    check(answered, `${label} connect four: Hard answers column ${column + 1} (search ${milliseconds} ms)`);
  }
  const discs = await page.getByTestId('c4-disc').count();
  check(discs >= 6, `${label} connect four: ${discs} discs on the board`);
  if (screenshotPath) await page.screenshot({ path: screenshotPath });
  await page.reload();
  await page.waitForSelector('[data-testid=connect-four]');
  check(await page.getByTestId('c4-disc').count() === discs && await page.getByTestId('restored').count() === 1, `${label} connect four: refresh restores the board`);
  await page.getByTestId('c4-undo').click();
  check(await waitFor(async () => await page.getByTestId('c4-disc').count() === discs - 2), `${label} connect four: undo takes back my move and the reply`);
  // pass and play: first player wins vertically
  await page.getByTestId('c4-mode-friends').click();
  const tallyBefore = Number(await page.getByTestId('c4-tally-red').innerText()) + Number(await page.getByTestId('c4-tally-yellow').innerText());
  for (const column of [0, 1, 0, 1, 0, 1, 0]) { await page.getByTestId(`c4-column-${column}`).click(); await pause(60); }
  check(await data(page, 'connect-four', 'winner') === '1', `${label} connect four: four in a column wins (pass and play)`);
  check(await page.locator('.c4-disc.is-winning').count() === 4, `${label} connect four: winning four highlighted`);
  const tallyAfter = Number(await page.getByTestId('c4-tally-red').innerText()) + Number(await page.getByTestId('c4-tally-yellow').innerText());
  check(tallyAfter === tallyBefore + 1, `${label} connect four: score tally counts the win`);
  // leave a game in progress for the Continue badge
  await page.getByTestId('c4-new').click();
  await page.getByTestId('c4-column-3').click();
  check(await noOverflow(page), `${label} connect four: no horizontal scroll`);
}

// ---------------- Checkers ----------------
async function playCheckersMove(page) {
  const piece = page.locator('.checkers-piece.is-movable').first();
  await piece.click();
  const target = page.locator('.checkers-cell.is-target').first();
  await target.waitFor({ timeout: 2000 });
  await target.click();
}

async function testCheckers(page, label, screenshotPath) {
  await openGame(page, 'checkers', 'checkers');
  await page.getByTestId('checkers-mode-computer').click();
  await page.getByTestId('checkers-level-2').click();
  check(await page.locator('.checkers-piece.is-dark').count() === 12 && await page.locator('.checkers-piece.is-light').count() === 12, `${label} checkers: 12 v 12`);
  const boardBox = await page.getByTestId('checkers-board').boundingBox();
  check(boardBox.x >= 0 && boardBox.x + boardBox.width <= page.viewportSize().width, `${label} checkers: board fits (${Math.round(boardBox.width)} px)`);
  let sawForcedCapture = false;
  for (let move = 0; move < 6; move++) {
    if (await data(page, 'checkers', 'winner') !== '0') break;
    await waitFor(async () => await data(page, 'checkers', 'side') === '0' && await data(page, 'checkers', 'thinking') === 'false', 6000);
    if (await data(page, 'checkers', 'must-capture') === 'true') {
      sawForcedCapture = true;
      check(await page.locator('.checkers-piece.must-capture').count() >= 1 && await page.locator('.checkers-piece.is-movable:not(.must-capture)').count() === 0,
        `${label} checkers: forced capture shown, only capturing pieces can move`);
    }
    const plies = Number(await data(page, 'checkers', 'plies'));
    await playCheckersMove(page);
    const answered = await waitFor(async () => Number(await data(page, 'checkers', 'plies')) >= plies + 2 || await data(page, 'checkers', 'winner') !== '0', 6000);
    const milliseconds = Number(await data(page, 'checkers', 'ai-ms'));
    if (milliseconds) aiTimes.checkers.push(milliseconds);
    check(answered, `${label} checkers: Hard replies (search ${milliseconds} ms)`);
  }
  console.log(`INFO ${label} checkers: ${sawForcedCapture ? 'a forced capture came up' : 'no forced capture came up in 6 moves (covered by cargo tests)'}`);
  await pause(500);
  if (screenshotPath) {
    await page.locator('.checkers-piece.is-movable').first().click();
    await page.screenshot({ path: screenshotPath });
    await page.locator('.checkers-cell.is-selected').click().catch(() => {});
  }
  const plies = await data(page, 'checkers', 'plies');
  const pieces = await page.getByTestId('checkers-pieces').innerText();
  await page.reload();
  await page.waitForSelector('[data-testid=checkers]');
  check(await page.getByTestId('restored').count() === 1 && await data(page, 'checkers', 'plies') === plies && await page.getByTestId('checkers-pieces').innerText() === pieces,
    `${label} checkers: refresh restores the position (${plies} plies, ${pieces})`);
  await page.getByTestId('checkers-undo').click();
  check(await waitFor(async () => Number(await data(page, 'checkers', 'plies')) === Number(plies) - 2), `${label} checkers: undo takes back my move and the reply`);
  check(await noOverflow(page), `${label} checkers: no horizontal scroll`);
}

async function testHub(page, label, screenshotPath) {
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=hero]');
  const wasmOnHub = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('.wasm')).length);
  check(wasmOnHub === 0, `${label} hub: no wasm downloaded on the home page`);
  check(await page.locator('[data-testid=row-coming-soon]').count() === 0, `${label} hub: Coming Soon section hidden`);
  for (const id of GAME_IDS) {
    const card = page.locator(`[data-testid=row-play-now] [data-testid=card-${id}]`);
    check(await card.count() === 1 && await card.locator('.game-art__soon').count() === 0, `${label} hub: ${id} card is playable`);
    check(await page.getByTestId(`continue-${id}`).count() === 1, `${label} hub: ${id} shows a Continue badge`);
  }
  check(await noOverflow(page), `${label} hub: no horizontal scroll`);
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.locator('[data-testid=row-play-now] [data-testid=card-connect-four] .card__cover').click();
  await page.waitForSelector('[data-testid=modal]');
  await page.locator('[data-testid=modal] .button--play').click();
  await page.waitForSelector('[data-testid=connect-four]');
  check(await page.getByTestId('restored').count() === 1, `${label} hub: Play opens Connect Four with the saved game`);
}

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const viewports = [
  { label: 'desktop', viewport: { width: 1280, height: 860 }, shots: { breakout: 'kush-games-breakout.png', 'connect-four': 'kush-games-connect4.png', checkers: 'kush-games-checkers.png', hub: 'kush-games-hub-14.png' } },
  { label: 'mobile', viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true, shots: { breakout: 'mobile-breakout.png', 'connect-four': 'mobile-connect4.png', checkers: 'mobile-checkers.png' } },
];
const mobileShots = [];
for (const { label, viewport, isMobile, hasTouch, shots } of viewports) {
  const context = await browser.newContext({ viewport, isMobile, hasTouch, deviceScaleFactor: isMobile ? 2 : 1 });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(`${label}: ${error}`));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(`${label} console: ${message.text()}`); });
  const shot = id => shots[id] && (isMobile ? `/tmp/${shots[id]}` : `${screenshotDirectory}/${shots[id]}`);
  await page.goto(siteUrl);
  await page.evaluate(() => localStorage.clear());
  await testBreakout(page, label, shot('breakout'));
  await testConnectFour(page, label, shot('connect-four'));
  await testCheckers(page, label, shot('checkers'));
  await testHub(page, label, shot('hub'));
  if (isMobile) mobileShots.push(...GAME_IDS.map(shot));
  await context.close();
}

// mobile screenshots side by side
const composite = await browser.newPage({ viewport: { width: 3 * 375 + 4 * 16, height: 760 + 32 + 28 }, deviceScaleFactor: 1 });
const images = mobileShots.map(path => `data:image/png;base64,${readFileSync(path).toString('base64')}`);
const titles = ['Breakout', 'Connect Four', 'Checkers'];
await composite.setContent(`<body style="margin:0;background:#0b0e1a;display:flex;gap:16px;padding:16px;font:600 14px system-ui;color:#cbd2ff">${
  images.map((source, index) => `<figure style="margin:0;width:375px"><figcaption style="height:28px">${titles[index]} · 375 px</figcaption><img src="${source}" style="width:375px;height:760px;border-radius:14px;display:block"></figure>`).join('')}</body>`);
await composite.waitForLoadState('load');
await composite.screenshot({ path: `${screenshotDirectory}/kush-games-four-mobile.png` });
await browser.close();

const summarize = values => values.length ? `median ${values.sort((a, b) => a - b)[Math.floor(values.length / 2)]} ms, max ${Math.max(...values)} ms over ${values.length} moves` : 'n/a';
console.log(`INFO AI search time (Hard) — Connect Four: ${summarize(aiTimes['connect-four'])}; Checkers: ${summarize(aiTimes.checkers)}`);
check(pageErrors.length === 0, `no page errors (${pageErrors.join(' | ') || 'none'})`);
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed');
process.exit(failures ? 1 : 0);
