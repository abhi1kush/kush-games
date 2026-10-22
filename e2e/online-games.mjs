// Connect Four + Checkers online e2e: two browser contexts (host desktop, guest phone) through the relay transport
// (see relay.mjs), plus a check that the real PeerJS broker registers and finds the rooms.
// Usage: node e2e/online-games.mjs [siteUrl] [screenshotDirectory] [--peerjs-only]
import { chromium } from 'playwright-core';
import { connectionStatus, createRelayContexts, guestPhoneOptions, hostDesktopOptions, noOverflow, pressNewGameTogether, sideBySide, waitFor } from './relay.mjs';

const positional = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
const siteUrl = positional[0] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = positional[1] ?? '/workspace';
const isPeerJsOnly = process.argv.includes('--peerjs-only');
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const pageErrors = [];
const watchErrors = (page, label) => page.on('pageerror', error => pageErrors.push(`${label}: ${error}`));
const data = (page, testId, name) => page.getByTestId(testId).first().getAttribute(`data-${name}`);

// ---------- Real PeerJS broker: the host registers the room id, the guest finds it ----------
for (const game of [{ id: 'connect-four', testId: 'connect-four', online: 'c4-mode-online' }, { id: 'checkers', testId: 'checkers', online: 'checkers-mode-online' }]) {
  const hostContext = await browser.newContext(hostDesktopOptions);
  const guestContext = await browser.newContext(guestPhoneOptions);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  watchErrors(host, `${game.id} peer host`);
  watchErrors(guest, `${game.id} peer guest`);
  await host.goto(`${siteUrl}#/play/${game.id}`, { waitUntil: 'networkidle' });
  await host.getByTestId(game.online).click();
  await host.getByTestId('online-create').click();
  const registered = await waitFor(async () => (await connectionStatus(host)) === 'waiting', 20000);
  check(registered, `${game.id} peerjs: host registers the room on the public PeerJS broker (${await connectionStatus(host)})`);
  const roomCode = await host.getByTestId('online-room-code').innerText();
  await guest.goto(`${siteUrl}#/play/${game.id}?room=${roomCode}`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(9000);
  const guestStatus = await connectionStatus(guest);
  const guestProblem = await guest.getByTestId('online-connection').getAttribute('data-problem');
  const connected = guestStatus === 'connected';
  check(registered && (connected || guestProblem !== 'host-not-found'),
    `${game.id} peerjs: the guest finds the host's room id via the broker (${guestStatus}${guestProblem ? `/${guestProblem}` : ''}; direct WebRTC ${connected ? 'opened' : 'did not open on this machine'})`);
  await hostContext.close();
  await guestContext.close();
}

if (!isPeerJsOnly) {
  // ---------- Connect Four ----------
  const { hostContext, guestContext, host, guest } = await createRelayContexts(browser);
  watchErrors(host, 'c4 host');
  watchErrors(guest, 'c4 guest');
  const c4 = (page, name) => data(page, 'connect-four', name);
  await host.goto(`${siteUrl}#/play/connect-four`, { waitUntil: 'networkidle' });
  await host.getByTestId('c4-mode-online').click();
  check(await host.getByTestId('online-lobby').isVisible(), 'c4: "Online" opens the play-a-friend lobby next to vs Computer / 2 Players');
  await host.getByTestId('online-create').click();
  const roomCode = await host.getByTestId('online-room-code').innerText();
  const link = await host.getByTestId('online-room-link').inputValue();
  check(/^[A-Z2-9]{5}$/.test(roomCode) && link.endsWith(`#/play/connect-four?room=${roomCode}`), `c4: room ${roomCode}, share link ${link}`);
  await guest.goto(link, { waitUntil: 'networkidle' });
  check(await waitFor(async () => (await connectionStatus(host)) === 'connected' && (await connectionStatus(guest)) === 'connected', 20000),
    'c4: the guest auto-joins from the link; both show Connected');
  check(await c4(host, 'my-color') === 'red' && await c4(guest, 'my-color') === 'yellow', 'c4: host is Red (moves first), guest Yellow');
  check(await noOverflow(guest), 'c4: no horizontal scroll on the 375px phone');
  await guest.getByTestId('c4-column-3').tap();
  check(await c4(guest, 'moves') === '0', 'c4: the guest cannot drop on Red’s turn');
  const drop = async (page, column) => {
    const before = Number(await c4(page, 'moves'));
    if (page === guest) await page.getByTestId(`c4-column-${column}`).tap(); else await page.getByTestId(`c4-column-${column}`).click();
    const other = page === host ? guest : host;
    return waitFor(async () => Number(await c4(other, 'moves')) === before + 1, 10000, 50);
  };
  let synced = true;
  for (const [index, column] of [0, 6, 1, 6, 2, 5].entries()) synced &&= await drop(index % 2 === 0 ? host : guest, column);
  const discs = page => page.locator('[data-testid=c4-disc]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-color')).join(','));
  check(synced && await discs(host) === await discs(guest), 'c4: 6 drops synced both ways, same board');
  check(/Your turn/.test(await host.getByTestId('c4-status').innerText()) && /Friend’s turn/.test(await guest.getByTestId('c4-status').innerText()), 'c4: turn shown on both ends');
  // Draw offer → decline
  await guest.getByTestId('online-offer-draw').tap();
  check(await waitFor(() => host.getByTestId('online-draw-offer').isVisible(), 10000) && await guest.getByTestId('online-draw-pending').isVisible(), 'c4: draw offer reaches the host (pending on the guest)');
  await host.getByTestId('online-decline-draw').click();
  check(await waitFor(() => guest.getByTestId('online-notice').isVisible(), 10000), 'c4: the guest is told the draw was declined');
  // Refresh rejoin (guest)
  await guest.reload({ waitUntil: 'networkidle' });
  check(await waitFor(async () => (await c4(guest, 'moves')) === '6' && (await connectionStatus(guest)) === 'connected', 30000)
    && await c4(guest, 'my-color') === 'yellow', 'c4: the guest reloads, the board is restored and the room re-joined');
  // Red completes four in a row
  await drop(host, 3);
  check(await waitFor(async () => (await c4(guest, 'over')) === 'true', 10000)
    && /You win/.test(await host.getByTestId('online-result').innerText()) && /Your friend wins/.test(await guest.getByTestId('online-result').innerText()),
    'c4: four in a row → host "You win", guest "Your friend wins"');
  check(await host.getByTestId('online-new-game').isVisible() && await guest.getByTestId('online-new-game').isVisible(), 'c4: New game shows on BOTH ends');
  await host.mouse.move(0, 0);
  await host.screenshot({ path: '/tmp/c4-host.png' });
  await guest.screenshot({ path: '/tmp/c4-guest.png' });
  await sideBySide('/tmp/c4-host.png', '/tmp/c4-guest.png', `${screenshotDirectory}/kush-games-c4-online.png`, ['Host · Red (desktop)', 'Guest · Yellow (phone)']);
  // Rematch: guest asks, host accepts → colours swap
  await guest.getByTestId('online-new-game').tap();
  check(await waitFor(() => host.getByTestId('online-rematch-offer').isVisible(), 10000), 'c4: the host sees "Friend wants a rematch — Accept / Decline"');
  await host.getByTestId('online-accept-rematch').click();
  check(await waitFor(async () => (await c4(guest, 'my-color')) === 'red' && (await c4(host, 'my-color')) === 'yellow' && (await c4(host, 'moves')) === '0', 10000),
    'c4: rematch starts on both ends with the guest now Red (moving first)');
  check(await drop(guest, 3), 'c4: the guest moves first in game 2');
  // Agreed draw, then both press New game → game 3
  await host.getByTestId('online-offer-draw').click();
  await waitFor(() => guest.getByTestId('online-draw-offer').isVisible(), 10000);
  await guest.getByTestId('online-accept-draw').tap();
  check(await waitFor(async () => /Draw agreed/.test(await host.getByTestId('online-result').innerText()) && /Draw agreed/.test(await guest.getByTestId('online-result').innerText()), 10000),
    'c4: accepted draw → "Draw agreed" on both ends');
  await pressNewGameTogether([host, guest]);
  check(await waitFor(async () => (await c4(host, 'game-number')) === '3' && (await c4(guest, 'game-number')) === '3' && (await c4(host, 'my-color')) === 'red', 10000),
    'c4: both pressing New game starts game 3 straight away');
  // Resign with confirm
  await host.getByTestId('online-resign').click();
  await host.getByTestId('online-confirm-resign').click();
  check(await waitFor(async () => /you win/.test(await guest.getByTestId('online-result').innerText()), 10000), 'c4: the host resigns; the guest wins');
  await guest.getByTestId('online-leave').tap();
  check(await waitFor(async () => (await connectionStatus(host)) === 'opponent-left', 15000), 'c4: host shows "Opponent left" when the guest leaves');
  check(await guest.evaluate(() => localStorage.getItem('kush-games:connect-four-online:save:v1')) === null, 'c4: leaving clears the online save');
  await host.goto(siteUrl, { waitUntil: 'networkidle' });
  check(await host.locator('[data-testid=continue-connect-four]').first().isVisible(), 'home: Connect Four shows ▶ Continue while a room is saved');
  await hostContext.close();
  await guestContext.close();
}

if (!isPeerJsOnly) {
  // ---------- Checkers ----------
  const { hostContext, guestContext, host, guest } = await createRelayContexts(browser);
  watchErrors(host, 'checkers host');
  watchErrors(guest, 'checkers guest');
  const ck = (page, name) => data(page, 'checkers', name);
  await host.goto(`${siteUrl}#/play/checkers`, { waitUntil: 'networkidle' });
  await host.getByTestId('checkers-mode-online').click();
  await host.getByTestId('online-create').click();
  const link = await host.getByTestId('online-room-link').inputValue();
  await guest.goto(link, { waitUntil: 'networkidle' });
  check(await waitFor(async () => (await connectionStatus(host)) === 'connected' && (await connectionStatus(guest)) === 'connected', 20000), 'checkers: guest joins via the link; Connected on both');
  check(await ck(host, 'my-color') === 'dark' && await ck(guest, 'my-color') === 'light', 'checkers: host plays Dark (moves first), guest Light');
  const firstSquare = page => page.locator('[data-testid=checkers-square]').first().getAttribute('data-square');
  check(await firstSquare(host) === '0' && await firstSquare(guest) === '31'
    && await guest.getByTestId('checkers-board').getAttribute('data-flipped') === 'true', 'checkers: the guest’s board is flipped (Light at the bottom)');
  check(await noOverflow(guest), 'checkers: no horizontal scroll on the 375px phone');
  const playAnyMove = async page => {
    const before = Number(await ck(page, 'plies'));
    const tap = locator => (page === guest ? locator.tap() : locator.click());
    await tap(page.locator('[data-testid=checkers-square]:has(.is-movable)').first());
    await tap(page.locator('[data-testid=checkers-square].is-target').first());
    const other = page === host ? guest : host;
    return waitFor(async () => Number(await ck(other, 'plies')) === before + 1, 10000, 50);
  };
  const layout = page => page.locator('[data-testid=checkers-square]').evaluateAll(nodes =>
    nodes.map(node => `${node.getAttribute('data-square')}:${node.querySelector('[data-piece]')?.getAttribute('data-piece') ?? 0}`).sort().join(' '));
  await guest.locator('[data-testid=checkers-square]').nth(20).tap();
  check(await ck(guest, 'plies') === '0', 'checkers: the guest cannot move on Dark’s turn');
  let synced = true;
  for (let ply = 0; ply < 6; ply++) synced &&= await playAnyMove(ply % 2 === 0 ? host : guest);
  check(synced && await layout(host) === await layout(guest), `checkers: 6 moves (paths validated by the wasm rules) synced, same position`);
  await host.mouse.move(0, 0);
  await host.waitForTimeout(500);
  await host.screenshot({ path: '/tmp/checkers-host.png' });
  await guest.screenshot({ path: '/tmp/checkers-guest.png' });
  await sideBySide('/tmp/checkers-host.png', '/tmp/checkers-guest.png', `${screenshotDirectory}/kush-games-checkers-online.png`, ['Host · Dark (desktop)', 'Guest · Light, board flipped (phone)']);
  // Host reload → rejoin
  await host.reload({ waitUntil: 'networkidle' });
  check(await waitFor(async () => (await ck(host, 'plies')) === '6' && (await connectionStatus(host)) === 'connected' && (await connectionStatus(guest)) === 'connected', 30000),
    'checkers: the host reloads, keeps the game and both reconnect');
  check(await playAnyMove(host), 'checkers: moves still sync after the reload');
  // Draw: guest offers, a move auto-cancels it... the host moved already; guest offers now, host accepts
  await guest.getByTestId('online-offer-draw').tap();
  await waitFor(() => host.getByTestId('online-draw-offer').isVisible(), 10000);
  check(await playAnyMove(guest), 'checkers: the guest moves while its own draw offer is pending');
  check(await waitFor(async () => !(await host.getByTestId('online-draw-offer').isVisible()), 5000), 'checkers: a move cancels the pending draw offer');
  await host.getByTestId('online-offer-draw').click();
  await waitFor(() => guest.getByTestId('online-draw-offer').isVisible(), 10000);
  await guest.getByTestId('online-accept-draw').tap();
  check(await waitFor(async () => /Draw agreed/.test(await host.getByTestId('online-result').innerText()) && /Draw agreed/.test(await guest.getByTestId('online-result').innerText()), 10000)
    && await host.getByTestId('online-new-game').isVisible() && await guest.getByTestId('online-new-game').isVisible(), 'checkers: accepted draw on both ends, New game on both');
  await guest.getByTestId('online-new-game').tap();
  await waitFor(() => host.getByTestId('online-rematch-offer').isVisible(), 10000);
  await host.getByTestId('online-accept-rematch').click();
  check(await waitFor(async () => (await ck(guest, 'my-color')) === 'dark' && (await ck(host, 'my-color')) === 'light' && (await ck(guest, 'plies')) === '0'
    && (await host.getByTestId('checkers-board').getAttribute('data-flipped')) === 'true' && (await guest.getByTestId('checkers-board').getAttribute('data-flipped')) === 'false', 10000),
    'checkers: rematch swaps colours (guest Dark, host’s board now flipped)');
  check(await playAnyMove(guest), 'checkers: the guest moves first in game 2');
  await guest.getByTestId('online-resign').tap();
  await guest.getByTestId('online-confirm-resign').tap();
  check(await waitFor(async () => /you win/.test(await host.getByTestId('online-result').innerText()) && /You resigned/.test(await guest.getByTestId('online-result').innerText()), 10000),
    'checkers: the guest resigns; results on both ends');
  await host.getByTestId('online-new-game').click();
  await waitFor(() => guest.getByTestId('online-rematch-offer').isVisible(), 10000);
  await guest.getByTestId('online-decline-rematch').tap();
  check(await waitFor(async () => (await host.getByTestId('online-notice').getAttribute('data-notice')) === 'rematch-declined', 10000)
    && await host.getByTestId('online-new-game').isVisible(), 'checkers: declining a rematch tells the host; New game is offered again');
  await hostContext.close();
  await guestContext.close();
}

check(pageErrors.length === 0, `no page errors ${pageErrors.join(' | ')}`);
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
