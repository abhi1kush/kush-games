// Snakes & Ladders e2e: board picking, a local game, and a real 4-player online room in separate browser contexts
// (desktop, phone portrait, phone landscape) over the test relay network (see turnRelay.mjs) — kick, refresh,
// host migration, missed turns → forfeit, finish and rematch. A separate check confirms the public PeerJS broker
// registers rooms. Turn clocks are shortened with the test-only ?snakesTurn=N parameter.
// Usage: node e2e/snakes-ladders.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { waitFor } from './relay.mjs';
import { createTurnRelay } from './turnRelay.mjs';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const TURN_SECONDS = 4;
const testUrl = `${siteUrl}?snakesTest&snakesTurn=${TURN_SECONDS}`;
const route = '#/play/snakes-ladders';
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const pageErrors = [];
const relay = createTurnRelay(browser, {
  nameKey: 'kush-games-snakes-ladders-name',
  onPageError: (name, error) => { pageErrors.push(`${name}: ${error}`); console.log(`  page error (${name}): ${error.stack?.split('\n').slice(0, 4).join(' | ')}`); },
});
const players = {};
const newPlayer = async (name, options) => (players[name] = await relay.newPlayer(name, options));

const view = page => page.evaluate(() => window.__snakesTest?.view() ?? null);
const myPlayer = async page => { const current = await view(page); return current?.state?.players.find(player => player.clientId === current.myId) ?? null; };
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const boardFits = page => page.evaluate(() => { const board = document.querySelector('[data-testid=snakes-board]')?.getBoundingClientRect(); return !!board && board.right <= innerWidth + 1 && board.bottom <= innerHeight + 1 && board.left >= -1 && board.top >= -1; });

const reported = new Set();
/** Roll for `names` on their turns (tapping the dice) until `done()`. */
async function play(names, done, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return true;
    for (const name of names) {
      const { page } = players[name];
      const current = await view(page).catch(() => null);
      const game = current?.game;
      const me = current?.state?.players.find(player => player.clientId === current.myId);
      if (!game || !me || current.state.phase !== 'playing' || game.current !== me.seat || me.status !== 'playing' || game.phase !== 1) continue;
      await page.locator('[data-testid=snakes-dice]:not([disabled])').click({ timeout: 1500, force: true }).catch(error => {
        const text = String(error).split('\n').slice(0, 3).join(' ');
        if (!reported.has(text)) { reported.add(text); console.log(`  (${name}: ${text})`); }
      });
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return false;
}

// ---------- local game: board picker, favourite board, pass and play ----------
{
  const solo = await newPlayer('Solo', { viewport: { width: 1280, height: 800 } });
  await solo.page.goto(`${testUrl}${route}`, { waitUntil: 'networkidle' });
  await solo.page.waitForSelector('[data-testid=snakes-menu]');
  check(await solo.page.getByTestId('snakes-rules').count() === 1, 'start screen shows the rules card');
  await solo.page.getByTestId('snakes-local').click();
  const boards = await solo.page.locator('[data-testid^=snakes-variant-]:not([data-testid=snakes-variant-name])').count();
  check(boards === 5, `the setup offers ${boards} boards`);
  check(await solo.page.getByTestId('snakes-variant-name').innerText() === 'Mango Grove', 'Mango Grove is the default board');
  await solo.page.getByTestId('snakes-variant-3').click();
  check(await solo.page.getByTestId('snakes-variant-name').innerText() === 'Spice Bazaar', 'picking a board shows its name');
  await solo.page.getByTestId('snakes-variants').screenshot({ path: `${screenshotDirectory}/kush-games-snakes-boards.png` }).catch(() => undefined);
  await solo.page.reload({ waitUntil: 'networkidle' });
  await solo.page.getByTestId('snakes-local').click();
  check(await solo.page.getByTestId('snakes-variant-name').innerText() === 'Spice Bazaar', 'the favourite board survives a refresh');
  await solo.page.getByTestId('snakes-local-start').click();
  check(await waitFor(() => solo.page.getByTestId('snakes-game').isVisible()), 'local game starts');
  check(await solo.page.getByTestId('snakes-board').getAttribute('data-board') === '3', 'the picked board is used');
  let sawAnimation = false;
  const rollOf = async () => Number(await solo.page.getByTestId('snakes-dice').getAttribute('data-roll').catch(() => '0'));
  const rolled = await waitFor(async () => {
    if ((await solo.page.getByTestId('snakes-board').getAttribute('data-animating')) === 'true') sawAnimation = true;
    if (await solo.page.locator('[data-testid=snakes-dice]:not([disabled])').count()) await solo.page.keyboard.press('Space');
    return (await rollOf()) >= 8;
  }, 60000, 200);
  check(rolled, 'pass and play: Space rolls, the computer plays its turns (8 rolls)');
  check(sawAnimation, 'tokens animate along the board');
  const squares = await solo.page.locator('[data-testid^=snakes-square-]').allInnerTexts();
  check(squares.some(text => /Square \d+/.test(text)), `tokens moved (${squares.join(', ')})`);
  await solo.context.close();
}

// ---------- the online room ----------
const host = await newPlayer('Host', { viewport: { width: 1280, height: 800 } });
const asha = await newPlayer('Asha', { viewport: { width: 1100, height: 760 } });
const meera = await newPlayer('Meera', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const kabir = await newPlayer('Kabir', { viewport: { width: 390, height: 740 }, isMobile: true, hasTouch: true });
const ravi = await newPlayer('Ravi', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await host.page.goto(`${testUrl}${route}`, { waitUntil: 'networkidle' });
await host.page.getByTestId('snakes-create').click();
await host.page.waitForSelector('[data-testid=snakes-lobby]');
const roomCode = await host.page.getByTestId('snakes-room-code').innerText();
const roomUrl = `${testUrl}${route}?room=${roomCode}`;
check(/^[A-Z2-9]{5}$/.test(roomCode) && (await host.page.getByTestId('snakes-link').inputValue()).endsWith(`${route}?room=${roomCode}`), `host created room ${roomCode} with a share link`);
const lobbyCount = page => page.locator('[data-testid=snakes-lobby-player]').count();
for (const player of [asha, meera, kabir]) await player.page.goto(roomUrl, { waitUntil: 'networkidle' });
check(await waitFor(async () => (await lobbyCount(host.page)) === 4 && (await lobbyCount(kabir.page)) === 4), 'three guests join through the link: 4 players in the lobby');

// the host picks the board; guests see it but can't change it
await host.page.getByTestId('snakes-variant-2').click();
check(await waitFor(async () => (await asha.page.getByTestId('snakes-variant-name').innerText()) === 'Temple Steps'), 'host picks Temple Steps: guests see the board change');
check(await asha.page.locator('button[data-testid^=snakes-variant-]').count() === 0, 'guests can’t change the board');

// a 5th player is turned away, the host removes Kabir
await ravi.page.goto(roomUrl, { waitUntil: 'networkidle' });
check(await waitFor(() => ravi.page.getByTestId('snakes-ending-rejected').isVisible()), 'a 5th player gets “This room is full”');
await host.page.getByTestId('snakes-kick-Kabir').click();
check(await waitFor(() => kabir.page.getByTestId('snakes-ending-kicked').isVisible()), 'the host removes a player; they see the “removed” message');
await ravi.page.goto(`${siteUrl}?snakesTest&snakesTurn=${TURN_SECONDS}${route}`, { waitUntil: 'networkidle' });
await ravi.page.goto(roomUrl, { waitUntil: 'networkidle' });
check(await waitFor(async () => (await lobbyCount(host.page)) === 4), 'a new player takes the free seat');

await host.page.getByTestId('snakes-start').click();
check(await waitFor(async () => {
  for (const player of [host, asha, meera, ravi]) if (!(await player.page.getByTestId('snakes-game').isVisible())) return false;
  return true;
}), 'host starts: the game opens for all 4 players');
check(await meera.page.getByTestId('snakes-board').getAttribute('data-board') === '2', 'everyone plays on the board the host picked');
const seats = {};
for (const player of [host, asha, meera, ravi]) seats[player.name] = (await myPlayer(player.page)).seat;
check(new Set(Object.values(seats)).size === 4, `each player has their own colour (${JSON.stringify(seats)})`);
for (const player of [host, asha, meera, ravi]) check(await noOverflow(player.page) && await boardFits(player.page), `${player.name}: no horizontal scroll, the board fits the screen`);
const myCorner = await meera.page.getByTestId(`snakes-bay-${seats.Meera}`).getAttribute('data-corner');
check(myCorner === '0', 'your own bay is bottom-left');

const diceCheck = page => page.evaluate(() => {
  const current = document.querySelector('[data-testid=snakes-board]').getAttribute('data-current');
  const dice = document.querySelector('[data-testid=snakes-dice]')?.getBoundingClientRect();
  const bay = document.querySelector(`[data-testid=snakes-bay-${current}]`)?.getBoundingClientRect();
  const x = dice && dice.left + dice.width / 2, y = dice && dice.top + dice.height / 2;
  return !!(dice && bay && x > bay.left && x < bay.right && y > bay.top && y < bay.bottom);
});
await waitFor(async () => (await view(host.page))?.game?.phase === 1, 5000);
check(await diceCheck(host.page) && await diceCheck(meera.page), 'the dice sits in the current player’s bay');
check(await host.page.getByTestId('snakes-seconds').count() === 1, 'the turn timer shows a countdown ring');
let sawJump = false;
check(await play(['Host', 'Asha', 'Meera', 'Ravi'], async () => {
  const text = await host.page.getByTestId('snakes-log').innerText().catch(() => '');
  if (/ladder|Snake!/.test(text)) sawJump = true;
  return ((await view(host.page))?.game?.rollId ?? 0) >= 16 && sawJump;
}, 120000), 'players roll through the UI; a ladder or snake shows up in the log');
await play(['Host', 'Asha', 'Meera', 'Ravi'], async () => { const current = await view(host.page); return current?.game?.current !== seats.Host && current?.game?.phase === 1; }, 20000);
await host.page.waitForTimeout(500);
check(await diceCheck(host.page), 'the dice moved to the other player’s bay on their turn');
await host.page.screenshot({ path: `${screenshotDirectory}/kush-games-snakes-online.png` });
await play(['Host', 'Asha', 'Meera', 'Ravi'], async () => ((await view(host.page))?.game?.rollId ?? 0) >= 26, 60000);
await play(['Host', 'Asha', 'Meera', 'Ravi'], async () => (await view(host.page))?.game?.phase === 3 && (await host.page.getByTestId('snakes-board').getAttribute('data-animating')) === 'true', 20000);
await host.page.waitForTimeout(250);
await host.page.screenshot({ path: `${screenshotDirectory}/kush-games-snakes-desktop.png` });
await meera.page.screenshot({ path: `${screenshotDirectory}/kush-games-snakes-mobile.png` });
await ravi.page.screenshot({ path: `${screenshotDirectory}/kush-games-snakes-landscape.png` });
check(await noOverflow(ravi.page) && await boardFits(ravi.page) && await noOverflow(meera.page) && await boardFits(meera.page), 'phones (portrait + landscape): no horizontal scroll mid-game');

// Asha refreshes and gets her seat back
await asha.page.reload({ waitUntil: 'networkidle' });
check(await play(['Host', 'Meera', 'Ravi'], async () => { const me = await myPlayer(asha.page); return me?.seat === seats.Asha && me.status === 'playing' && me.connected && (await view(asha.page))?.network === 'connected'; }, 20000),
  'a refreshed guest rejoins the same seat');

// the host leaves mid-game: Asha takes over
const ashaId = (await view(asha.page)).myId;
await host.page.getByTestId('snakes-leave').click();
await host.page.getByTestId('snakes-confirm-yes').click();
check(await waitFor(() => host.page.getByTestId('snakes-ending-left').isVisible()), 'the host sees “You left the game”');
check(await play(['Meera', 'Ravi'], async () => (await view(asha.page))?.role === 'host', 15000), 'host migration: Asha becomes the host');
check(await play(['Asha', 'Meera', 'Ravi'], async () => (await view(meera.page))?.state?.hostId === ashaId && (await view(ravi.page))?.state?.hostId === ashaId && (await view(meera.page))?.network === 'connected', 15000),
  'the others reconnect to the new host');
const hostGone = (await view(asha.page)).state.players.find(player => player.name === 'Host');
check(hostGone?.status === 'left' && (await view(asha.page)).game.positions[hostGone.seat] === 254, 'the old host’s token is off the board');
const rollBefore = (await view(asha.page)).game.rollId;
check(await play(['Asha', 'Meera', 'Ravi'], async () => ((await view(meera.page))?.game?.rollId ?? 0) >= ((rollBefore + 4) % 256), 30000), 'the game keeps going under the new host');

// Ravi leaves; Meera stops playing → strikes → out → Asha wins
await ravi.page.getByTestId('snakes-leave').click();
await ravi.page.getByTestId('snakes-confirm-yes').click();
check(await waitFor(async () => (await view(asha.page))?.state?.players.find(player => player.name === 'Ravi')?.status === 'left'), 'Ravi left: marked as left for everyone');
let sawStrike = false;
check(await play(['Asha'], async () => {
  const strikes = (await view(asha.page))?.game?.strikes[seats.Meera] ?? 0;
  if (strikes >= 1 && !sawStrike && /\d\/3/.test(await asha.page.getByTestId(`snakes-player-strikes-${seats.Meera}`).innerText().catch(() => ''))) sawStrike = true;
  return (await view(asha.page))?.state?.players.find(player => player.name === 'Meera')?.status === 'forfeited' || (await view(asha.page))?.state?.phase === 'finished';
}, 90000), 'missed turns are auto-played and the 3rd forfeits Meera (or the game ends first)');
check(sawStrike, 'strikes show next to the player’s name');
check(await waitFor(async () => (await view(asha.page))?.state?.phase === 'finished' && await asha.page.getByTestId('snakes-finish').isVisible(), 15000), 'game over: finish card shown');
await asha.page.waitForTimeout(600);
await asha.page.screenshot({ path: `${screenshotDirectory}/kush-games-snakes-finish.png` });
check(await meera.page.getByTestId('snakes-rematch').isVisible(), 'everyone gets a New game button');
await asha.page.getByTestId('snakes-rematch').click();
check(await waitFor(async () => (await view(meera.page))?.state?.gameNumber === 2 && (await view(meera.page))?.state?.phase === 'playing'), 'New game starts a fresh game');

// the public PeerJS broker registers a room
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${siteUrl}${route}`, { waitUntil: 'networkidle' });
  await page.getByTestId('snakes-create').click();
  check(await waitFor(async () => (await page.getByTestId('snakes-network').getAttribute('data-status').catch(() => '')) === 'hosting', 25000), 'real PeerJS: the host registers the room on the public broker');
  await context.close();
}

check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All Snakes & Ladders checks passed');
process.exit(failures ? 1 : 0);
