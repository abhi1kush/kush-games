// Smoke tests for Minesweeper, Sudoku, Tic-Tac-Toe, Memory Match and Flappy Wings, plus screenshots.
// Usage: node e2e/new-games.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { reactCommitCounterScript } from './perf-snake.mjs';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const NEW_GAME_IDS = ['minesweeper', 'sudoku', 'tic-tac-toe', 'memory-match', 'flappy-wings'];
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
async function waitFor(predicate, timeoutMs = 10000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}
const data = (page, testId, name) => page.getByTestId(testId).getAttribute(`data-${name}`);
const readSave = (page, gameId) => page.evaluate(id => JSON.parse(localStorage.getItem(`kush-games:${id}:save:v1`) ?? 'null'), gameId);

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

// ================= Desktop =================
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(reactCommitCounterScript);
const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(`desktop: ${error}`));

// ---------- Hub ----------
await page.goto(siteUrl, { waitUntil: 'networkidle' });
const playNowIds = await page.locator('[data-testid=row-play-now] .card').evaluateAll(cards => cards.map(card => card.dataset.testid.replace('card-', '')));
check(NEW_GAME_IDS.every(id => playNowIds.includes(id)), `hub: all five new games are in Play Now (${playNowIds.join(', ')})`);
const comingSoonIds = await page.locator('[data-testid=row-coming-soon] .card').evaluateAll(cards => cards.map(card => card.dataset.testid.replace('card-', '')));
check(NEW_GAME_IDS.every(id => !comingSoonIds.includes(id)) && comingSoonIds.length >= 3, `hub: Coming Soon keeps other placeholders (${comingSoonIds.join(', ')})`);
await page.getByTestId('filter-arcade').click();
check(await page.locator('[data-testid=row-play-now] [data-testid=card-flappy-wings]').count() === 1, 'hub: Flappy Wings shows under the Arcade filter');
await page.getByTestId('filter-all').click();
await page.locator('[data-testid=row-play-now]').scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${screenshotDirectory}/kush-games-home-new.png` });

// ---------- Minesweeper ----------
await page.goto(`${siteUrl}#/play/minesweeper`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=minesweeper]');
await page.getByTestId('difficulty-beginner').click();
check(await page.locator('.ms-cell').count() === 81 && await page.getByTestId('ms-mines-left').innerText() === '10', 'minesweeper: Beginner is 9×9 with 10 mines');
await page.locator('.ms-cell[data-index="40"]').click();
const revealedAfterFirst = Number(await data(page, 'minesweeper', 'revealed'));
check(revealedAfterFirst > 1 && await page.locator('.ms-cell[data-index="40"]').getAttribute('data-state') === 'revealed'
  && await data(page, 'minesweeper', 'status') !== 'lost', `minesweeper: first click is safe and opens an area (${revealedAfterFirst} cells)`);
await page.getByTestId('mode-flag').click();
const hiddenIndex = await page.locator('.ms-cell[data-state=hidden]').first().getAttribute('data-index');
await page.locator(`.ms-cell[data-index="${hiddenIndex}"]`).click();
check(await data(page, 'minesweeper', 'flags') === '1' && await page.getByTestId('ms-mines-left').innerText() === '9', 'minesweeper: Flag mode places a flag and the counter drops');
await page.locator(`.ms-cell[data-index="${hiddenIndex}"]`).click();
await page.getByTestId('mode-dig').click();
await page.locator(`.ms-cell[data-index="${hiddenIndex}"]`).click({ button: 'right' });
check(await data(page, 'minesweeper', 'flags') === '1', 'minesweeper: right-click flags');
await page.waitForTimeout(1100);
check(Number(await page.getByTestId('ms-timer').innerText()) >= 1, 'minesweeper: timer runs');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=minesweeper]');
check(await page.getByTestId('restored').isVisible() && Number(await data(page, 'minesweeper', 'revealed')) === revealedAfterFirst
  && await data(page, 'minesweeper', 'flags') === '1', 'minesweeper: refresh resumes the board');
// Play it out safely using the saved mine layout: flag every mine, open every safe cell -> win.
const mineSave = await readSave(page, 'minesweeper');
const mineSet = new Set(mineSave.data.mineIndexes);
for (let index = 0; index < 81; index++) {
  const cellState = await page.locator(`.ms-cell[data-index="${index}"]`).getAttribute('data-state');
  if (mineSet.has(index) || cellState === 'revealed') continue;
  if (cellState === 'flagged') await page.locator(`.ms-cell[data-index="${index}"]`).click({ button: 'right' });
  await page.locator(`.ms-cell[data-index="${index}"]`).click();
  if (await data(page, 'minesweeper', 'status') === 'won') break;
}
check(await data(page, 'minesweeper', 'status') === 'won' && await page.getByTestId('ms-result').isVisible() && await page.getByTestId('ms-best').innerText() !== '—',
  'minesweeper: clearing every safe cell wins and records a best time');
check(await readSave(page, 'minesweeper') === null, 'minesweeper: finished game is not saved');
await page.getByTestId('difficulty-intermediate').click();
await page.locator('.ms-cell[data-index="120"]').click();
await page.screenshot({ path: `${screenshotDirectory}/kush-games-minesweeper.png` });
check(await noOverflow(page), 'minesweeper: no horizontal page overflow on desktop');

// ---------- Sudoku ----------
await page.goto(`${siteUrl}#/play/sudoku`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=sudoku]');
let sudokuSave = await readSave(page, 'sudoku');
check(sudokuSave !== null && sudokuSave.data.puzzle.filter(Boolean).length >= 30, 'sudoku: a new puzzle is generated and saved immediately');
const { solution, puzzle } = sudokuSave.data;
const emptyCells = puzzle.flatMap((value, index) => (value ? [] : [index]));
const firstEmpty = emptyCells[0];
await page.locator(`.sudoku-cell[data-index="${firstEmpty}"]`).click();
check(await page.locator('.sudoku-cell.is-peer').count() === 20, 'sudoku: selecting a cell highlights its row, column and box');
const wrongDigit = solution[firstEmpty] === 9 ? 1 : solution[firstEmpty] + 1;
await page.getByTestId(`pad-${wrongDigit}`).click();
check(await data(page, 'sudoku', 'mistakes') === '1', 'sudoku: a wrong number counts a mistake');
const hasConflictPeer = puzzle.some((value, index) => value === wrongDigit && (Math.floor(index / 9) === Math.floor(firstEmpty / 9) || index % 9 === firstEmpty % 9
  || (Math.floor(index / 27) === Math.floor(firstEmpty / 27) && Math.floor((index % 9) / 3) === Math.floor((firstEmpty % 9) / 3))));
if (hasConflictPeer) check(await page.locator(`.sudoku-cell[data-index="${firstEmpty}"].is-conflict`).count() === 1, 'sudoku: duplicate shows a conflict');
await page.getByTestId('sudoku-undo').click();
check(await page.locator(`.sudoku-cell[data-index="${firstEmpty}"]`).getAttribute('data-value') === '0', 'sudoku: undo clears the number');
await page.getByTestId(`pad-${solution[firstEmpty]}`).click();
check(await page.locator('.sudoku-cell.is-same').count() >= 1, 'sudoku: same numbers are highlighted');
const secondEmpty = emptyCells[1];
await page.locator(`.sudoku-cell[data-index="${secondEmpty}"]`).click();
await page.getByTestId('sudoku-pencil').click();
await page.getByTestId('pad-1').click();
await page.getByTestId('pad-2').click();
check(await page.locator(`.sudoku-cell[data-index="${secondEmpty}"] .sudoku-notes`).innerText().then(text => text.includes('1') && text.includes('2')), 'sudoku: pencil notes');
await page.getByTestId('sudoku-pencil').click();
const filledBeforeHint = Number(await data(page, 'sudoku', 'filled'));
await page.getByTestId('sudoku-hint').click();
check(Number(await data(page, 'sudoku', 'filled')) === filledBeforeHint + 1
  && await page.locator(`.sudoku-cell[data-index="${secondEmpty}"]`).getAttribute('data-value') === String(solution[secondEmpty]), 'sudoku: hint fills the selected cell correctly');
await page.keyboard.press('ArrowRight');
await page.screenshot({ path: `${screenshotDirectory}/kush-games-sudoku.png` });
const filledBeforeReload = await data(page, 'sudoku', 'filled');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=sudoku]');
check(await page.getByTestId('restored').isVisible() && await data(page, 'sudoku', 'filled') === filledBeforeReload && await data(page, 'sudoku', 'mistakes') === '1',
  'sudoku: refresh resumes the puzzle, mistakes included');
// Finish it with the keyboard.
sudokuSave = await readSave(page, 'sudoku');
for (let index = 0; index < 81; index++) {
  if (sudokuSave.data.values[index] === solution[index]) continue;
  await page.locator(`.sudoku-cell[data-index="${index}"]`).click();
  await page.keyboard.press(String(solution[index]));
}
check(await data(page, 'sudoku', 'solved') === 'true' && await page.getByTestId('sudoku-solved').isVisible() && await readSave(page, 'sudoku') === null,
  'sudoku: solving shows the win and clears the save');
await page.getByTestId('sudoku-new').click();
check(await data(page, 'sudoku', 'solved') === 'false' && await readSave(page, 'sudoku') !== null, 'sudoku: New starts and saves a fresh puzzle');

// ---------- Tic-Tac-Toe ----------
await page.goto(`${siteUrl}#/play/tic-tac-toe`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=tictactoe]');
await page.getByTestId('ttt-hard').click();
for (let move = 0; move < 5 && !(await data(page, 'tictactoe', 'outcome')); move++) {
  await waitFor(async () => (await data(page, 'tictactoe', 'turn')) === 'X' || !!(await data(page, 'tictactoe', 'outcome')), 3000, 50);
  if (await data(page, 'tictactoe', 'outcome')) break;
  const board = await data(page, 'tictactoe', 'board');
  const free = [...board].flatMap((cell, index) => (cell === '.' ? [index] : []));
  await page.locator(`.ttt-cell[data-index="${free[(move * 5) % free.length]}"]`).click();
  await waitFor(async () => (await data(page, 'tictactoe', 'turn')) === 'X' || !!(await data(page, 'tictactoe', 'outcome')), 3000, 50);
}
const hardOutcome = await data(page, 'tictactoe', 'outcome');
check(hardOutcome === 'O' || hardOutcome === 'draw', `tic-tac-toe: Hard computer doesn't lose (outcome ${hardOutcome})`);
const tallyText = Number(await page.getByTestId(hardOutcome === 'draw' ? 'tally-draw' : 'tally-o').innerText());
check(tallyText >= 1, 'tic-tac-toe: score tally updates');
await page.getByTestId('ttt-friend').click();
for (const index of [0, 3, 1, 4]) await page.locator(`.ttt-cell[data-index="${index}"]`).click();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=tictactoe]');
check(await data(page, 'tictactoe', 'board') === 'XX.OO....',
  'tic-tac-toe: refresh keeps the round');
check(await page.getByTestId('restored').isVisible() && await data(page, 'tictactoe', 'opponent') === 'friend', 'tic-tac-toe: restored banner in 2-player mode');
await page.locator('.ttt-cell[data-index="2"]').click();
check(await data(page, 'tictactoe', 'outcome') === 'X' && await page.locator('.ttt-cell.is-winning').count() === 3
  && await page.getByTestId('tally-x').innerText() === '1', 'tic-tac-toe: pass-and-play win highlights the line and counts');
await page.waitForTimeout(350);
await page.screenshot({ path: `${screenshotDirectory}/kush-games-tictactoe.png` });
check(await readSave(page, 'tic-tac-toe') === null, 'tic-tac-toe: finished round is not saved');

// ---------- Memory Match ----------
await page.goto(`${siteUrl}#/play/memory-match`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=memory]');
await page.getByTestId('size-4x4').click();
let faces = (await data(page, 'memory', 'faces')).split(',');
check(faces.length === 16, 'memory: 4×4 deck has 16 cards');
const partner = index => faces.findIndex((face, other) => other !== index && face === faces[index]);
const mismatch = faces.findIndex(face => face !== faces[0]);
await page.locator('.memory-card[data-index="0"]').click();
await page.locator(`.memory-card[data-index="${mismatch}"]`).click();
check(await data(page, 'memory', 'moves') === '1' && await page.locator('.memory-card.is-up').count() === 2, 'memory: two different cards stay up briefly');
await page.waitForTimeout(1000);
check(await page.locator('.memory-card.is-up').count() === 0, 'memory: mismatched cards flip back');
const matchedPairs = [];
for (let index = 0; index < 16 && matchedPairs.length < 3; index++) {
  if (matchedPairs.some(pair => pair.includes(index))) continue;
  await page.locator(`.memory-card[data-index="${index}"]`).click();
  await page.locator(`.memory-card[data-index="${partner(index)}"]`).click();
  matchedPairs.push([index, partner(index)]);
}
check(await data(page, 'memory', 'matched') === '3' && await page.locator('.memory-card.is-matched').count() === 6, 'memory: matching pairs stay face up');
const unmatched = [...Array(16).keys()].find(index => !matchedPairs.flat().includes(index));
await page.locator(`.memory-card[data-index="${unmatched}"]`).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${screenshotDirectory}/kush-games-memory.png` });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=memory]');
faces = (await data(page, 'memory', 'faces')).split(',');
check(await page.getByTestId('restored').isVisible() && await data(page, 'memory', 'matched') === '3' && await data(page, 'memory', 'moves') === '4',
  'memory: refresh resumes matched pairs and moves');
const openAfterRestore = await data(page, 'memory', 'open');
if (openAfterRestore) await page.locator(`.memory-card[data-index="${partner(Number(openAfterRestore))}"]`).click();
for (let index = 0; index < 16; index++) {
  if (await page.locator(`.memory-card[data-index="${index}"]`).getAttribute('data-up') === 'true') continue;
  await page.locator(`.memory-card[data-index="${index}"]`).click();
  await page.locator(`.memory-card[data-index="${partner(index)}"]`).click();
}
check(await data(page, 'memory', 'complete') === 'true' && await page.getByTestId('memory-complete').isVisible() && await page.getByTestId('memory-best').innerText() !== '—'
  && await readSave(page, 'memory-match') === null, 'memory: finishing shows the result, records a best and clears the save');

// ---------- Flappy Wings ----------
await page.goto(`${siteUrl}#/play/flappy-wings`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=flappy-hint]');
check(await data(page, 'flappy', 'status') === 'ready', 'flappy: waits on the ready screen');
// In-page autopilot: flap whenever the bird drops below the next gap.
await page.evaluate(() => {
  const root = document.querySelector('[data-testid=flappy]');
  window.__flappyAutopilot = true;
  const steer = () => {
    if (!window.__flappyAutopilot) return;
    const birdY = Number(root.dataset.birdY);
    const gapY = root.dataset.gapY ? Number(root.dataset.gapY) : 240;
    if (root.dataset.status === 'playing' && birdY > gapY + 12 && Number(root.dataset.velocity) > -60) window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    requestAnimationFrame(steer);
  };
  requestAnimationFrame(steer);
});
// The autopilot can crash on a slow frame; allow a few attempts to reach 2 points.
const commitsBefore = await page.evaluate(() => window.__reactCommits);
let flightAttempts = 0;
let reachedScore = false;
while (!reachedScore && flightAttempts < 4) {
  flightAttempts++;
  if (await data(page, 'flappy', 'status') === 'over') await page.waitForTimeout(500);
  if (await data(page, 'flappy', 'status') === 'over') await page.locator('.flappy-frame').click({ position: { x: 100, y: 200 } }); // back to ready
  await page.locator('.flappy-frame').click({ position: { x: 100, y: 200 } });
  if (flightAttempts === 1) check(await waitFor(async () => (await data(page, 'flappy', 'status')) === 'playing', 2000), 'flappy: a click starts the run');
  await waitFor(async () => Number(await data(page, 'flappy', 'score')) >= 2 || (await data(page, 'flappy', 'status')) === 'over', 15000);
  reachedScore = Number(await data(page, 'flappy', 'score')) >= 2 && (await data(page, 'flappy', 'status')) === 'playing';
}
check(reachedScore, `flappy: the bird flies through pipes (score ${await data(page, 'flappy', 'score')}, attempt ${flightAttempts})`);
const commitsDuringFlight = (await page.evaluate(() => window.__reactCommits)) - commitsBefore;
check(commitsDuringFlight <= 12 * flightAttempts, `flappy: React only re-renders on score/status changes (${commitsDuringFlight} commits in ${flightAttempts} run(s))`);
await page.screenshot({ path: `${screenshotDirectory}/kush-games-flappy.png` });
await page.keyboard.press('p');
check(await data(page, 'flappy', 'status') === 'paused' && await page.getByTestId('flappy-paused').isVisible(), 'flappy: P pauses');
const pausedScore = await data(page, 'flappy', 'score');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=flappy-paused]');
check(await data(page, 'flappy', 'status') === 'paused' && await data(page, 'flappy', 'score') === pausedScore
  && /restored/i.test(await page.getByTestId('flappy-paused').innerText()) && await page.getByTestId('flappy-new').isVisible(), 'flappy: refresh restores the run paused with Resume / New game');
// back to the hub: Continue badges
await page.getByTestId('back').click();
await page.waitForSelector('[data-testid=row-play-now]');
const badges = await Promise.all(['minesweeper', 'sudoku', 'flappy-wings'].map(id => page.locator(`[data-testid=row-play-now] [data-testid=continue-${id}]`).count()));
check(badges.every(count => count === 1), `hub: Continue badges for saved games (${badges.join(',')})`);
await page.goto(`${siteUrl}#/play/flappy-wings`, { waitUntil: 'networkidle' });
await page.getByTestId('flappy-resume').click();
check(await data(page, 'flappy', 'status') === 'playing', 'flappy: Resume continues');
await page.evaluate(() => { window.__flappyAutopilot = false; });
check(await waitFor(async () => (await data(page, 'flappy', 'status')) === 'over', 8000), 'flappy: without flapping the bird crashes');
check(await page.getByTestId('flappy-over').isVisible() && Number(await page.getByTestId('flappy-best').innerText()) >= Number(pausedScore)
  && await readSave(page, 'flappy-wings') === null, 'flappy: game over shows best score and clears the save');
// shared mute
await page.getByTestId('mute').click();
check(await page.evaluate(() => localStorage.getItem('kush-games-muted')) === 'true', 'sound: mute toggle is stored');
await page.goto(`${siteUrl}#/play/tic-tac-toe`, { waitUntil: 'networkidle' });
check(await page.getByTestId('mute').getAttribute('aria-pressed') === 'true', 'sound: the mute setting is shared by the new games');
await page.getByTestId('mute').click();
await context.close();

// ================= Mobile (375px, touch) =================
const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const phone = await mobile.newPage();
phone.on('pageerror', error => pageErrors.push(`mobile: ${error}`));
const mobileShots = [];
await phone.goto(siteUrl, { waitUntil: 'networkidle' });
check(await noOverflow(phone), 'mobile: hub has no horizontal overflow');

await phone.goto(`${siteUrl}#/play/minesweeper`, { waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=minesweeper]');
await phone.getByTestId('difficulty-expert').tap();
check(await data(phone, 'minesweeper', 'transposed') === 'true' && await noOverflow(phone), 'mobile minesweeper: Expert turns to a tall 16-wide board, no page overflow');
const cellWidth = await phone.locator('.ms-cell').first().evaluate(cell => cell.getBoundingClientRect().width);
check(cellWidth >= 20, `mobile minesweeper: cells stay tappable (${cellWidth.toFixed(1)}px)`);
await phone.getByTestId('difficulty-beginner').tap();
await phone.locator('.ms-cell[data-index="40"]').tap();
const hiddenCell = phone.locator('.ms-cell[data-state=hidden]').first();
await hiddenCell.evaluate(cell => cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true })));
await phone.waitForTimeout(500);
await hiddenCell.evaluate(cell => cell.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true })));
check(await data(phone, 'minesweeper', 'flags') === '1', 'mobile minesweeper: long-press flags');
mobileShots.push(`${screenshotDirectory}/kush-games-mobile-minesweeper.png`);
await phone.screenshot({ path: mobileShots[mobileShots.length - 1] });

await phone.goto(`${siteUrl}#/play/sudoku`, { waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=sudoku]');
const phoneSudoku = await readSave(phone, 'sudoku');
const phoneEmpty = phoneSudoku.data.values.indexOf(0);
await phone.locator(`.sudoku-cell[data-index="${phoneEmpty}"]`).tap();
await phone.getByTestId(`pad-${phoneSudoku.data.solution[phoneEmpty]}`).tap();
check(await phone.locator(`.sudoku-cell[data-index="${phoneEmpty}"]`).getAttribute('data-value') === String(phoneSudoku.data.solution[phoneEmpty]) && await noOverflow(phone),
  'mobile sudoku: tap a cell then the number pad, no overflow');
mobileShots.push(`${screenshotDirectory}/kush-games-mobile-sudoku.png`);
await phone.screenshot({ path: mobileShots[mobileShots.length - 1] });

await phone.goto(`${siteUrl}#/play/tic-tac-toe`, { waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=tictactoe]');
await phone.getByTestId('ttt-easy').tap();
await phone.locator('.ttt-cell[data-index="4"]').tap();
check(await waitFor(async () => [...(await data(phone, 'tictactoe', 'board'))].filter(cell => cell !== '.').length === 2, 3000) && await noOverflow(phone),
  'mobile tic-tac-toe: the computer answers a tap');
mobileShots.push(`${screenshotDirectory}/kush-games-mobile-tictactoe.png`);
await phone.screenshot({ path: mobileShots[mobileShots.length - 1] });

await phone.goto(`${siteUrl}#/play/memory-match`, { waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=memory]');
await phone.getByTestId('size-6x6').tap();
await phone.locator('.memory-card[data-index="0"]').tap();
await phone.waitForTimeout(400);
const lastCardBox = await phone.locator('.memory-card').last().boundingBox();
check(await data(phone, 'memory', 'open') === '0' && await noOverflow(phone) && lastCardBox.x + lastCardBox.width <= 375 && lastCardBox.width >= 40,
  `mobile memory: 6×6 fits the phone (${lastCardBox.width.toFixed(0)}px cards)`);
mobileShots.push(`${screenshotDirectory}/kush-games-mobile-memory.png`);
await phone.screenshot({ path: mobileShots[mobileShots.length - 1] });

await phone.goto(`${siteUrl}#/play/flappy-wings`, { waitUntil: 'networkidle' });
await phone.waitForSelector('[data-testid=flappy]');
await phone.locator('.flappy-frame').tap();
check(await data(phone, 'flappy', 'status') === 'playing', 'mobile flappy: tap flaps');
const canvasBox = await phone.getByTestId('flappy-canvas').boundingBox();
check(canvasBox.x >= 0 && canvasBox.x + canvasBox.width <= 375 && canvasBox.y + canvasBox.height <= 667 && await noOverflow(phone),
  `mobile flappy: canvas fits the screen (${canvasBox.width.toFixed(0)}×${canvasBox.height.toFixed(0)})`);
await phone.waitForTimeout(250);
mobileShots.push(`${screenshotDirectory}/kush-games-mobile-flappy.png`);
await phone.screenshot({ path: mobileShots[mobileShots.length - 1] });
await mobile.close();
await browser.close();

check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
console.log(`MOBILE_SHOTS ${mobileShots.join(' ')}`);
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
