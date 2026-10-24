// Carrom e2e: menu + rules card, aiming with a real mouse drag (aim line + power), a pocket that earns another shot,
// a striker foul, the computer's turn, keyboard placement, pass and play, refresh restore, phones in portrait and
// landscape (touch slingshot, no horizontal scroll), and an online game between two browser contexts over the test
// relay (both boards end identical, the second player's board is turned, resign, rematch) + the real PeerJS broker.
// Usage: node e2e/carrom.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { connectionStatus, createRelayContexts, noOverflow, pressNewGameTogether, waitFor } from './relay.mjs';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const route = '#/play/carrom';
const testUrl = `${siteUrl}?carromTest${route}`;
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const pageErrors = [];
const watch = (page, label) => page.on('pageerror', error => { pageErrors.push(`${label}: ${error}`); console.log(`  page error (${label}): ${error}`); });
const state = page => page.evaluate(() => window.__carromTest.state());
const settled = async (page, shots, timeout = 30000) => waitFor(async () => { const value = await state(page); return value.applied >= shots && !value.animating; }, timeout, 50);
/** Canvas pixel position of a board point (board 1000 units + 72 frame each side). */
async function boardPoint(page, x, y, flipped = false) {
  const box = await page.getByTestId('carrom-canvas').boundingBox();
  const unit = box.width / 1144;
  const [bx, by] = flipped ? [1000 - x, 1000 - y] : [x, y];
  return [box.x + (72 + bx) * unit, box.y + (72 + by) * unit];
}
const whiteOnBoard = page => page.evaluate(() => { const bodies = window.__carromTest.bodies(); for (let index = 2; index <= 10; index++) if (bodies[index * 7 + 6] > 0.5) return index; return -1; });

// ---------- desktop: vs computer ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  watch(page, 'desktop');
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  check(await page.getByTestId('carrom-rules').isVisible(), 'menu shows the how-to-play card');
  await page.getByTestId('carrom-mode-computer').click();
  await page.getByTestId('carrom-level-1').click();
  await page.getByTestId('carrom-start').click();
  check(await waitFor(async () => (await page.getByTestId('carrom-status').innerText()).includes('Your turn')), 'the game starts: your turn as White');
  const start = await page.evaluate(() => window.__carromTest.bodies());
  const coinsOn = [...Array(20).keys()].filter(index => start[index * 7 + 6] > 0.5).length;
  check(coinsOn === 20, 'striker, Queen and 18 coins on the board');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-carrom-desktop.png` });

  // drag the striker sideways along the baseline
  const [sx, sy] = await boardPoint(page, 500, 863);
  await page.mouse.move(sx, sy); await page.mouse.down();
  await page.mouse.move(sx + 60, sy + 2, { steps: 6 }); await page.mouse.up();
  const moved = await page.evaluate(() => window.__carromTest.striker());
  check(moved > 540, `dragging the striker sideways places it (x ${Math.round(moved)})`);
  // aim: pull back from the striker
  const [ax, ay] = await boardPoint(page, moved, 863);
  await page.mouse.move(ax, ay); await page.mouse.down();
  const [px, py] = await boardPoint(page, moved + 40, 1040);
  await page.mouse.move(px, py, { steps: 8 });
  const power = Number(await page.getByTestId('carrom-power').getAttribute('data-power'));
  check(power > 40, `pulling back shows the power meter (${power}%) and the aim line`);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-carrom-aim.png` });
  await page.mouse.up();
  check(await waitFor(async () => (await state(page)).applied === 1, 3000, 30), 'releasing shoots the striker');
  check(await settled(page, 1), 'the shot plays out and the board comes to rest');
  // the computer's turn (if the break didn't pocket a white)
  if ((await state(page)).turn === 1) {
    check(await waitFor(async () => (await page.getByTestId('carrom-status').innerText()).includes('Computer is aiming')), 'the computer takes its turn');
    check(await waitFor(async () => { const value = await state(page); return value.turn === 0 && !value.animating && value.applied >= 2; }, 60000), 'the computer shoots and the turn comes back');
  }
  // a pocket: put a white coin by the bottom-left pocket and cut it in
  const white = await whiteOnBoard(page);
  const before = await state(page);
  await page.evaluate(index => window.__carromTest.put(index, 120, 880), white);
  await page.evaluate(() => window.__carromTest.shoot(300, 120, 880, 450));
  await page.waitForTimeout(450);
  check(await settled(page, before.applied + 1), 'the pocket shot plays out');
  const afterPocket = await state(page);
  check(afterPocket.pocketed[0] === before.pocketed[0] + 1 && afterPocket.turn === 0, `a white coin is pocketed and you shoot again (pocketed ${afterPocket.pocketed[0]})`);
  check(/pocketed/.test(await page.getByTestId('carrom-toast').innerText().catch(() => '')), 'a “pocketed — shoot again” message shows');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-carrom-pocket.png` });
  // a foul: shoot the striker straight into the bottom-left pocket
  await page.evaluate(() => window.__carromTest.shoot(200, 31, 969, 300));
  check(await settled(page, afterPocket.applied + 1), 'the foul shot plays out');
  const afterFoul = await state(page);
  check(afterFoul.turn === 1 && afterFoul.pocketed[0] === afterPocket.pocketed[0] - 1, 'pocketing the striker is a foul: a coin comes back and the turn passes');
  check(/Foul/.test(await page.getByTestId('carrom-toast').innerText().catch(() => '')), 'the foul is announced');
  check(await waitFor(async () => { const value = await state(page); return value.applied > afterFoul.applied && value.turn === 0 && !value.animating; }, 60000), 'the computer plays after the foul');
  // keyboard: arrows move the striker
  await page.getByTestId('carrom-canvas').focus();
  const keyStart = await page.evaluate(() => window.__carromTest.striker());
  for (let press = 0; press < 5; press++) await page.keyboard.press('ArrowLeft');
  const keyEnd = await page.evaluate(() => window.__carromTest.striker());
  check(Math.abs(keyEnd - keyStart) >= 20, 'arrow keys move the striker');
  // refresh keeps the game
  const shotsBefore = (await state(page)).applied;
  await page.reload({ waitUntil: 'networkidle' });
  check(await waitFor(async () => (await state(page)).applied === shotsBefore), `a refresh restores the game (${shotsBefore} shots)`);
  await context.close();
}

// ---------- vs the Hard computer: a few turns ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  watch(page, 'hard');
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('carrom-level-2').click();
  await page.getByTestId('carrom-start').click();
  await waitFor(async () => (await state(page)).turn === 0);
  await page.evaluate(() => window.__carromTest.shoot(500, 503, 500, 1000));
  check(await waitFor(async () => (await state(page)).turn === 1 || (await state(page)).applied >= 1, 20000), 'the break is played');
  await waitFor(async () => { const value = await state(page); return value.turn === 1 && !value.animating; }, 30000);
  check(await waitFor(async () => (await page.getByTestId('carrom-power').getAttribute('data-power')) !== '0', 5000, 50), 'the computer shows its aim and power before shooting');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-carrom-vs.png` });
  check(await waitFor(async () => { const value = await state(page); return value.turn === 0 && !value.animating; }, 90000), 'Hard computer finishes its turn');
  await context.close();
}

// ---------- pass and play ----------
{
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await context.newPage();
  watch(page, 'friends');
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await page.getByTestId('carrom-mode-friends').click();
  await page.getByTestId('carrom-start').click();
  await page.evaluate(() => window.__carromTest.shoot(400, 400, 1000, 80)); // a gentle shot away from the coins
  await settled(page, 1);
  check((await state(page)).turn === 1 && (await page.getByTestId('carrom').getAttribute('data-can-shoot')) === 'true', 'two players: after a miss Player 2 shoots from the top on the same device');
  check((await page.getByTestId('carrom-status').innerText()).includes('Player 2'), 'the status names Player 2');
  await context.close();
}

// ---------- phones ----------
for (const [label, options] of [['portrait', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['landscape', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  watch(page, label);
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  check(await noOverflow(page), `${label}: menu has no horizontal scroll`);
  await page.getByTestId('carrom-start').tap();
  await waitFor(async () => (await state(page)).turn === 0);
  const box = await page.getByTestId('carrom-canvas').boundingBox();
  check(box.width >= (label === 'portrait' ? 340 : 240) && box.x >= 0 && box.x + box.width <= options.viewport.width + 1, `${label}: the board fits the screen (${Math.round(box.width)} px)`);
  check(await noOverflow(page), `${label}: game has no horizontal scroll`);
  // touch slingshot
  const touch = await context.newCDPSession(page);
  const [sx, sy] = await boardPoint(page, 500, 863);
  const [ex, ey] = await boardPoint(page, 520, 1060);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let step = 1; step <= 8; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (ex - sx) * step / 8, y: sy + (ey - sy) * step / 8 }] });
  if (label === 'portrait') await page.screenshot({ path: `${screenshotDirectory}/kush-games-carrom-mobile.png` });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(await waitFor(async () => (await state(page)).applied === 1, 3000, 30), `${label}: a finger pull-back and release shoots`);
  await settled(page, 1);
  check(await noOverflow(page), `${label}: still no horizontal scroll after the shot`);
  await context.close();
}

// ---------- online: two browsers over the test relay ----------
{
  const { hostContext, guestContext, host, guest } = await createRelayContexts(browser);
  watch(host, 'online host'); watch(guest, 'online guest');
  await host.goto(testUrl, { waitUntil: 'networkidle' });
  await host.getByTestId('carrom-mode-online').click();
  await host.getByTestId('online-create').click();
  const link = await host.getByTestId('online-room-link').inputValue();
  check(link.includes(`${route}?room=`), `host created a room (${link.split('room=')[1]})`);
  await guest.goto(link.replace('#', '?carromTest#'), { waitUntil: 'networkidle' });
  check(await waitFor(async () => (await connectionStatus(host)) === 'connected' && (await connectionStatus(guest)) === 'connected', 20000), 'the guest joins from the link; both connected');
  check(await waitFor(async () => (await guest.getByTestId('carrom').getAttribute('data-flipped')) === 'true'), 'the guest (Black) sees the board turned so their baseline is at the bottom');
  await host.evaluate(() => window.__carromTest.shoot(500, 503, 500, 1000));
  check(await settled(host, 1) && await settled(guest, 1), 'the host’s break plays out on both screens');
  let shots = 1;
  // play a few shots each, whoever's turn it is, with simple shots straight up/down the board
  for (let round = 0; round < 6; round++) {
    const hostState = await state(host);
    const page = hostState.turn === 0 ? host : guest;
    const y = hostState.turn === 0 ? 400 : 600;
    const ok = await page.evaluate(([round, y]) => {
      const s = window.__carromTest;
      for (let step = 0; step < 30; step++) { const x = 250 + ((round * 70 + step * 23) % 520); if (s.canPlace(x)) { s.shoot(x, x + 20, y, 500); return true; } }
      return false;
    }, [round, y]);
    if (!ok) break;
    shots++;
    await settled(host, shots); await settled(guest, shots);
  }
  const [hostBodies, guestBodies] = [await host.evaluate(() => window.__carromTest.bodies()), await guest.evaluate(() => window.__carromTest.bodies())];
  const hostCount = (await state(host)).applied;
  check(hostCount >= 4 && hostCount === (await state(guest)).applied && hostBodies.every((value, index) => value === guestBodies[index]), `after ${hostCount} shots both boards are identical, coin for coin (deterministic physics)`);
  await guest.reload({ waitUntil: 'networkidle' });
  check(await waitFor(async () => (await connectionStatus(guest)) === 'connected' && (await state(guest)).applied === hostCount, 20000), 'a refreshed guest rejoins with the same board');
  const turnPage = (await state(host)).turn === 0 ? guest : host; // the player who is NOT shooting resigns
  await turnPage.getByTestId('online-resign').click();
  await turnPage.getByTestId('online-confirm-resign').click();
  check(await waitFor(() => host.getByTestId('online-game-over').isVisible()) && await guest.getByTestId('online-game-over').isVisible(), 'resigning ends the game on both screens');
  check(await noOverflow(guest), 'guest phone: no horizontal scroll');
  await pressNewGameTogether([host, guest]);
  check(await waitFor(async () => (await host.getByTestId('carrom-screen').getAttribute('data-game-number')) === '2' && (await state(host)).applied === 0 && (await guest.getByTestId('carrom').getAttribute('data-flipped')) === 'false'),
    'rematch: a fresh board, colours swapped (the guest now plays White)');
  await hostContext.close(); await guestContext.close();
}

// ---------- the public PeerJS broker registers a room ----------
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${siteUrl}${route}`, { waitUntil: 'networkidle' });
  await page.getByTestId('carrom-mode-online').click();
  await page.getByTestId('online-create').click();
  check(await waitFor(async () => (await connectionStatus(page)) === 'waiting', 25000), 'real PeerJS: the host registers the room on the public broker');
  await context.close();
}

check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All Carrom checks passed');
process.exit(failures ? 1 : 0);
