// Fleet Clash (the sea-battle game) e2e: placement (drag, turn, random), a game against the computer through the UI
// (hits, sinks, the computer's replies, finish), pass and play with the hand-over screen, phones, and an online game
// between two browser contexts over the test relay (sealed fleets, auto answers, refresh, reveal + check, rematch).
// Usage: node e2e/battleship.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { connectionStatus, createRelayContexts, noOverflow, pressNewGameTogether, sideBySide, waitFor } from './relay.mjs';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const route = '#/play/fleet-clash';
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const pageErrors = [];
const watch = (page, label) => page.on('pageerror', error => { pageErrors.push(`${label}: ${error}`); console.log(`  page error (${label}): ${error}`); });
const attr = (page, name) => page.getByTestId('fleet').getAttribute(`data-${name}`);

/** Pick a target cell like a sensible player: next to an open hit, else a random checkerboard square. */
const pickTarget = page => page.evaluate(() => {
  const cells = [...document.querySelectorAll('[data-testid^=fleet-target-cell-]')];
  const mark = cell => Number(cells[cell]?.getAttribute('data-mark') ?? -1);
  const neighbours = cell => [cell - 10, cell + 10, cell % 10 ? cell - 1 : -1, cell % 10 < 9 ? cell + 1 : -1].filter(next => next >= 0 && next < 100);
  for (let cell = 0; cell < 100; cell++) if (mark(cell) === 2) { const open = neighbours(cell).filter(next => mark(next) === 0); if (open.length) return open[Math.floor(Math.random() * open.length)]; }
  const unknown = cells.map((_, cell) => cell).filter(cell => mark(cell) === 0);
  const parity = unknown.filter(cell => (Math.floor(cell / 10) + cell) % 2 === 0);
  const list = parity.length ? parity : unknown;
  return list[Math.floor(Math.random() * list.length)];
});
async function fire(page, isTouch = false) {
  const cell = await pickTarget(page);
  const target = page.getByTestId(`fleet-target-cell-${cell}`);
  if (isTouch) await target.tap(); else await target.click();
  return cell;
}
const myTurn = page => page.locator('.fleet-sea.can-fire').count().then(count => count > 0);

// ---------- placement + a game against the computer (desktop) ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  watch(page, 'desktop');
  await page.goto(`${siteUrl}${route}`, { waitUntil: 'networkidle' });
  check(await page.getByTestId('fleet-rules').isVisible(), 'start screen shows the how-to-play card');
  await page.getByTestId('fleet-level-2').click();
  await page.getByTestId('fleet-start').click();
  check(await page.getByTestId('fleet-placement').isVisible(), 'placement screen opens');
  // drag the carrier from the dock onto B3
  const dock = await page.getByTestId('fleet-dock-0').boundingBox();
  const cell = await page.getByTestId('fleet-place-sea-cell-21').boundingBox();
  await page.mouse.move(dock.x + 30, dock.y + dock.height / 2);
  await page.mouse.down();
  await page.mouse.move(cell.x + 4, cell.y + 4, { steps: 8 });
  await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 3 });
  await page.mouse.up();
  const carrier = page.getByTestId('fleet-place-sea-ship-0');
  check(await carrier.count() === 1, 'drag and drop places the carrier');
  const before = await carrier.boundingBox();
  await page.getByTestId('fleet-place-sea-cell-22').click();
  const after = await carrier.boundingBox();
  check(before.width > before.height && after.height > after.width, 'tapping a placed ship turns it');
  await page.getByTestId('fleet-dock-4').click();
  await page.getByTestId('fleet-place-sea-cell-77').click();
  check(await page.getByTestId('fleet-place-sea-ship-4').count() === 1, 'tap a ship, then a square, places it');
  check(await page.getByTestId('fleet-ready').isDisabled(), 'Start stays off until all five ships are placed');
  await page.getByTestId('fleet-random').click();
  check(await page.locator('[data-testid^=fleet-place-sea-ship-]').count() === 5 && await page.getByTestId('fleet-ready').isEnabled(), 'Random places the whole fleet');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-battleship-place.png` });
  await page.getByTestId('fleet-ready').click();
  check(await waitFor(() => page.getByTestId('fleet-target').isVisible()), 'the battle starts: enemy waters + your fleet');
  check(await page.locator('[data-testid^=fleet-target-ship-]').count() === 0, 'fog of war: no enemy ships are shown');
  let sawHit = false, sawSunk = false, computerFired = false, shots = 0;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline && !(await attr(page, 'winner'))) {
    if (!(await myTurn(page))) { await page.waitForTimeout(120); continue; }
    await fire(page);
    shots++;
    await page.waitForTimeout(200);
    const kind = await page.getByTestId('fleet-callout').first().getAttribute('data-kind').catch(() => null);
    if (kind === 'hit' && !sawHit) { sawHit = true; await page.screenshot({ path: `${screenshotDirectory}/kush-games-battleship-hit.png` }); }
    if (await page.locator('[data-testid^=fleet-target-ship-][data-state=sunk]').count() && !sawSunk) {
      sawSunk = true;
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${screenshotDirectory}/kush-games-battleship-desktop.png` });
    }
    if (!computerFired) computerFired = await page.locator('[data-testid^=fleet-own-cell-]:not([data-mark="0"])').count() > 0;
  }
  check(sawHit, 'a hit shows the fire mark and a “Hit!” callout');
  check(sawSunk, 'sinking a ship reveals the wreck on the enemy waters');
  check(computerFired, 'the computer fires back at your fleet');
  check(await page.getByTestId('fleet-enemy-status').getAttribute('data-afloat').then(value => Number(value) < 5), 'the ships-left panel counts sunk ships');
  check(!!(await attr(page, 'winner')) && await page.getByTestId('fleet-finish').isVisible(), `the game ends with a finish card (${shots} shots, winner ${await attr(page, 'winner')})`);
  await page.getByTestId('fleet-play-again').click();
  check(await page.getByTestId('fleet-placement').isVisible(), 'New game goes back to placing the fleet');
  await context.close();
}

// ---------- phones: portrait and landscape ----------
for (const [label, options] of [['portrait', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['landscape', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  watch(page, label);
  await page.goto(`${siteUrl}${route}`, { waitUntil: 'networkidle' });
  await page.getByTestId('fleet-start').tap();
  // touch drag of the destroyer onto the sea
  const dock = await page.getByTestId('fleet-dock-1').boundingBox();
  const cell = await page.getByTestId('fleet-place-sea-cell-60').boundingBox();
  const touch = await context.newCDPSession(page);
  const point = (x, y) => [{ x, y }];
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(dock.x + 25, dock.y + dock.height / 2) });
  for (let step = 1; step <= 8; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(dock.x + 25 + ((cell.x + cell.width / 2) - dock.x - 25) * step / 8, dock.y + dock.height / 2 + ((cell.y + cell.height / 2) - dock.y - dock.height / 2) * step / 8) });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(await page.getByTestId('fleet-place-sea-ship-1').count() === 1, `${label}: dragging with a finger places a ship`);
  // Chrome's synthetic CDP touch sequence swallows the click of the very next tap, so tap Random until the fleet is full
  for (let attempt = 0; attempt < 3 && await page.getByTestId('fleet-ready').isDisabled(); attempt++) { await page.getByTestId('fleet-random').tap(); await page.waitForTimeout(150); }
  check(await noOverflow(page), `${label}: placement has no horizontal scroll`);
  await page.getByTestId('fleet-ready').tap();
  for (let shot = 0; shot < 6; shot++) { await waitFor(() => myTurn(page), 5000); await fire(page, true); await page.waitForTimeout(250); }
  check(await noOverflow(page), `${label}: battle has no horizontal scroll`);
  if (label === 'portrait') await page.screenshot({ path: `${screenshotDirectory}/kush-games-battleship-mobile.png` });
  await context.close();
}

// ---------- pass and play: the hand-over screen hides each fleet ----------
{
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await context.newPage();
  watch(page, 'friends');
  await page.goto(`${siteUrl}${route}`, { waitUntil: 'networkidle' });
  await page.getByTestId('fleet-mode-friends').click();
  await page.getByTestId('fleet-start').click();
  await page.getByTestId('fleet-random').click();
  await page.getByTestId('fleet-ready').click();
  check(await page.getByTestId('fleet-curtain').isVisible() && await page.locator('[data-testid^=fleet-place-sea-ship-]').count() === 0, 'player 1’s fleet is hidden before player 2 places theirs');
  await page.getByTestId('fleet-curtain-continue').click();
  await page.getByTestId('fleet-random').click();
  await page.getByTestId('fleet-ready').click();
  check(await page.getByTestId('fleet-curtain').isVisible(), 'the battle starts behind a pass-the-device screen');
  await page.getByTestId('fleet-curtain-continue').click();
  const shooter = await attr(page, 'turn');
  await fire(page);
  check(await waitFor(() => page.getByTestId('fleet-curtain').isVisible(), 4000), 'after a shot the device is handed over (boards hidden)');
  await page.getByTestId('fleet-curtain-continue').click();
  check(await attr(page, 'turn') !== shooter && await myTurn(page), 'the other player fires next');
  await context.close();
}

// ---------- online: two browsers ----------
{
  const { hostContext, guestContext, host, guest } = await createRelayContexts(browser);
  watch(host, 'online host'); watch(guest, 'online guest');
  await host.goto(`${siteUrl}${route}`, { waitUntil: 'networkidle' });
  await host.getByTestId('fleet-mode-online').click();
  await host.getByTestId('online-create').click();
  const link = await host.getByTestId('online-room-link').inputValue();
  check(link.includes(`${route}?room=`), `host created a room (${link.split('room=')[1]})`);
  await guest.goto(link, { waitUntil: 'networkidle' });
  check(await waitFor(async () => (await connectionStatus(host)) === 'connected' && (await connectionStatus(guest)) === 'connected', 20000), 'the guest joins from the link; both connected');
  // the guest is ready first: their sealed fleet waits for the host's
  await guest.getByTestId('fleet-random').tap();
  await guest.getByTestId('fleet-ready').tap();
  check(await waitFor(async () => /Waiting for your friend/.test(await guest.getByTestId('fleet-status').innerText())), 'the guest waits for the host to place');
  await host.getByTestId('fleet-random').click();
  await host.getByTestId('fleet-ready').click();
  check(await waitFor(async () => (await attr(host, 'expected')) === 'fire' && (await attr(guest, 'expected')) === 'fire', 10000), 'both fleets sealed: the battle starts on both screens');
  const saved = await guest.evaluate(() => Object.entries(localStorage).filter(([key]) => key.includes('fleet-clash-online')).map(([, value]) => value).join(''));
  check(saved.includes('"c') && !/"v\d/.test(saved), 'only sealed fingerprints were exchanged (no fleet positions in the move list)');
  check(await guest.locator('[data-testid^=fleet-target-ship-]').count() === 0, 'fog of war online: the friend’s ships are hidden');
  const players = [{ page: host, touch: false }, { page: guest, touch: true }];
  let refreshed = false, shots = 0;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline && !(await attr(host, 'winner'))) {
    let fired = false;
    for (const { page, touch } of players) {
      if (await myTurn(page)) {
        const before = await page.locator('[data-testid^=fleet-target-cell-]:not([data-mark="0"])').count();
        await fire(page, touch);
        shots++;
        await waitFor(async () => (await page.locator('[data-testid^=fleet-target-cell-]:not([data-mark="0"])').count()) > before, 5000, 50);
        fired = true;
      }
    }
    if (shots === 30 && !refreshed) {
      refreshed = true;
      await guest.screenshot({ path: '/tmp/fleet-online-guest.png' });
      await host.screenshot({ path: '/tmp/fleet-online-host.png' });
      await guest.reload({ waitUntil: 'networkidle' });
      check(await waitFor(async () => (await connectionStatus(guest)) === 'connected' && await guest.getByTestId('fleet-own').isVisible(), 20000), 'a refreshed guest rejoins with their own fleet still there');
    }
    if (!fired) await host.waitForTimeout(100);
  }
  const winner = await attr(host, 'winner');
  check(winner !== '' && winner === await attr(guest, 'winner'), `a fleet is sunk: both agree on the winner (${winner}) after ${shots} shots`);
  check(await waitFor(async () => (await host.getByTestId('fleet-verify').getAttribute('data-state')) === 'ok' && (await guest.getByTestId('fleet-verify').getAttribute('data-state')) === 'ok', 10000),
    'both fleets are revealed and check out against the sealed fingerprints');
  check(await waitFor(() => host.getByTestId('online-game-over').isVisible()) && await guest.getByTestId('online-game-over').isVisible(), 'game over banner with New game on both screens');
  await host.waitForTimeout(400);
  await host.screenshot({ path: '/tmp/fleet-online-host-end.png' });
  await guest.screenshot({ path: '/tmp/fleet-online-guest-end.png' });
  await sideBySide('/tmp/fleet-online-host.png', '/tmp/fleet-online-guest.png', `${screenshotDirectory}/kush-games-battleship-online.png`, ['Host (desktop)', 'Guest (phone)']);
  check(await noOverflow(guest), 'guest phone: no horizontal scroll');
  await pressNewGameTogether([host, guest]);
  check(await waitFor(async () => (await attr(host, 'game-number')) === '2' && (await attr(guest, 'game-number')) === '2' && await host.getByTestId('fleet-placement').isVisible() && await guest.getByTestId('fleet-placement').isVisible()),
    'rematch: a new game starts with fresh fleets');
  await hostContext.close(); await guestContext.close();
}

// the public PeerJS broker registers a room
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${siteUrl}${route}`, { waitUntil: 'networkidle' });
  await page.getByTestId('fleet-mode-online').click();
  await page.getByTestId('online-create').click();
  check(await waitFor(async () => (await connectionStatus(page)) === 'waiting', 25000), 'real PeerJS: the host registers the room on the public broker');
  await context.close();
}

check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All Fleet Clash checks passed');
process.exit(failures ? 1 : 0);
