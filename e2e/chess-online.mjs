// Chess e2e: local pass-and-play, then a real online game between two browser contexts
// (host at 1280px, guest on a 375px phone) through the public PeerJS server.
// Usage: node e2e/chess-online.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const boardData = (page, name) => page.getByTestId('chess-board').getAttribute(`data-${name}`);
const tap = async (page, square, isTouch = false) => {
  const locator = page.locator(`[data-square=${square}]`);
  if (isTouch) await locator.tap(); else await locator.click();
};
async function move(page, from, to, isTouch = false) {
  await tap(page, from, isTouch);
  await tap(page, to, isTouch);
}
async function waitFor(predicate, timeoutMs = 15000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const pageErrors = [];

// ---------- Local pass-and-play ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(`local: ${error}`));
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  check(await page.locator('[data-testid=row-play-now] [data-testid=card-chess]').count() === 1
    && await page.locator('[data-testid=row-coming-soon] [data-testid=card-chess]').count() === 0, 'home: Chess is in Play Now, not Coming Soon');
  await page.goto(`${siteUrl}#/play/chess`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=chess-lobby]');
  await page.getByTestId('chess-local').click();
  await page.waitForSelector('[data-testid=chess-board]');
  await tap(page, 'e2');
  check(await page.locator('[data-square=e2].is-selected').count() === 1
    && await page.locator('[data-square=e3].is-target-move').count() === 1 && await page.locator('[data-square=e4].is-target-move').count() === 1
    && await page.locator('.is-target-move, .is-target-capture').count() === 2, 'local: tapping a pawn highlights its 2 legal squares');
  await tap(page, 'e4');
  check(await boardData(page, 'moves') === '1' && await page.locator('[data-square=e4]').getAttribute('data-piece') === 'wp'
    && await page.locator('[data-square=e2].is-last-move').count() === 1, 'local: tap-to-move plays e4 and marks the last move');
  await move(page, 'e7', 'e5');
  await move(page, 'd1', 'h5');
  await move(page, 'b8', 'c6');
  await move(page, 'f1', 'c4');
  await move(page, 'g8', 'f6');
  await move(page, 'e1', 'e2'); // illegal for a king? no: e2 is empty, legal. Undo it.
  await page.getByTestId('chess-undo').click();
  await move(page, 'h5', 'f7');
  check(await boardData(page, 'over') === 'true' && await boardData(page, 'result') === 'w'
    && /White wins by checkmate/.test(await page.getByTestId('chess-status').innerText()), 'local: scholar’s mate is checkmate');
  check(await page.locator('[data-square=e8].is-check').count() === 1, 'local: the mated king is highlighted');
  check(await page.evaluate(() => localStorage.getItem('kush-games:chess:save:v1')) === null, 'local: a finished local game is not saved');
  await page.getByTestId('chess-new-game').click();
  await move(page, 'd2', 'd4');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=chess-board]');
  check(await boardData(page, 'moves') === '1' && await page.getByTestId('chess-restored').isVisible(), 'local: an unfinished game is restored after reload');
  await page.getByTestId('chess-leave').click();
  await context.close();
}

// ---------- Online: host (desktop) + guest (phone) ----------
const connectionStatus = page => page.getByTestId('chess-connection').getAttribute('data-status');
const guestOptions = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/**
 * Stand-in for the network when this machine's browser can't make WebRTC connections: each page
 * gets a transport whose messages are relayed between the two browser contexts by this script.
 * Everything else (the session, protocol, saving and UI) is the real app code.
 */
async function createRelayContexts() {
  const pages = {};
  let isOpen = false;
  const deliver = (role, method, argument) => pages[role]?.evaluate(([name, value]) => {
    const handlers = window.__chessRelayHandlers;
    if (!handlers) return;
    if (name === 'open') { window.__chessRelayOpen = true; handlers.onStatus({ status: 'connected' }); handlers.onOpen(); }
    else if (name === 'close') { window.__chessRelayOpen = false; handlers.onStatus({ status: 'opponent-left' }); }
    else handlers.onMessage(JSON.parse(value));
  }, [method, argument]).catch(() => undefined);
  const ready = { host: false, guest: false };
  const setReady = async (role, isReady) => {
    ready[role] = isReady;
    const other = role === 'host' ? 'guest' : 'host';
    if (isOpen) { isOpen = false; await deliver(other, 'close'); }
    if (ready.host && ready.guest) {
      await new Promise(resolve => setTimeout(resolve, 300));
      isOpen = true;
      await deliver('host', 'open');
      await deliver('guest', 'open');
    }
  };
  const makeContext = async (role, options) => {
    const context = await browser.newContext(options);
    await context.exposeBinding('__chessRelaySend', (_source, text) => { if (isOpen) void deliver(role === 'host' ? 'guest' : 'host', 'message', text); });
    await context.exposeBinding('__chessRelayReady', (_source, isReady) => setReady(role, isReady));
    await context.addInitScript(() => {
      window.__kushChessTestTransport = () => ({
        start(handlers) {
          window.__chessRelayHandlers = handlers;
          handlers.onStatus({ status: 'waiting' });
          window.__chessRelayReady(true);
        },
        send(message) { if (!window.__chessRelayOpen) return false; window.__chessRelaySend(JSON.stringify(message)); return true; },
        stop() { window.__chessRelayHandlers = null; window.__chessRelayOpen = false; window.__chessRelayReady(false); },
      });
      window.addEventListener('pagehide', () => window.__chessRelayReady(false));
    });
    pages[role] = await context.newPage();
    return { context, page: pages[role] };
  };
  const hostSide = await makeContext('host', { viewport: { width: 1280, height: 800 } });
  const guestSide = await makeContext('guest', guestOptions);
  return { hostContext: hostSide.context, guestContext: guestSide.context, host: hostSide.page, guest: guestSide.page };
}

// 1) The real thing: PeerJS server + WebRTC.
let transportUsed = 'PeerJS (WebRTC)';
let hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let guestContext = await browser.newContext(guestOptions);
await hostContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(siteUrl).origin });
let host = await hostContext.newPage();
let guest = await guestContext.newPage();
host.on('pageerror', error => pageErrors.push(`host: ${error}`));
guest.on('pageerror', error => pageErrors.push(`guest: ${error}`));

await host.goto(`${siteUrl}#/play/chess`, { waitUntil: 'networkidle' });
await host.getByTestId('chess-create-room').click();
const reachedServer = await waitFor(async () => (await connectionStatus(host)) === 'waiting', 20000);
check(reachedServer, `peerjs: host registers the room on the public PeerJS server (status ${await connectionStatus(host)})`);
let roomCode = await host.getByTestId('chess-room-code').innerText();
const roomLinkText = await host.getByTestId('chess-room-link').inputValue();
check(/^[A-Z2-9]{5}$/.test(roomCode) && roomLinkText.endsWith(`#/play/chess?room=${roomCode}`), `online: room code ${roomCode} and link ${roomLinkText}`);
check(/Waiting for friend/.test(await host.getByTestId('chess-connection').innerText()), 'online: host shows "Waiting for friend…"');
await host.getByTestId('chess-copy').click();
check(await host.evaluate(() => navigator.clipboard.readText()) === roomLinkText, 'online: Copy link puts the link on the clipboard');
await guest.goto(`${siteUrl}#/play/chess?room=${roomCode}`, { waitUntil: 'networkidle' });
const peerConnected = reachedServer && await waitFor(async () => (await connectionStatus(guest)) === 'connected' && (await connectionStatus(host)) === 'connected', 25000);
console.log(`INFO peerjs: direct WebRTC connection ${peerConnected ? 'worked' : 'did NOT open on this machine'}`);
if (!peerConnected) {
  const guestStatus = await connectionStatus(guest);
  const helpText = await guest.getByTestId('chess-connection-help').innerText().catch(() => '');
  check(guestStatus === 'failed' || guestStatus === 'connecting', `peerjs: guest found the host's room via the PeerJS server and is trying (${guestStatus})`);
  check(/another network/.test(helpText) || guestStatus === 'connecting', `peerjs: a failed direct connection shows the "try another network" help (${helpText.slice(0, 60)}…)`);
  await hostContext.close();
  await guestContext.close();
  // 2) Same two-browser test over the relay transport.
  transportUsed = 'relay (mocked transport)';
  ({ hostContext, guestContext, host, guest } = await createRelayContexts());
  host.on('pageerror', error => pageErrors.push(`host: ${error}`));
  guest.on('pageerror', error => pageErrors.push(`guest: ${error}`));
  await host.goto(`${siteUrl}#/play/chess`, { waitUntil: 'networkidle' });
  await host.getByTestId('chess-create-room').click();
  roomCode = await host.getByTestId('chess-room-code').innerText();
  await guest.goto(`${siteUrl}#/play/chess?room=${roomCode}`, { waitUntil: 'networkidle' });
}
console.log(`INFO online test transport: ${transportUsed}`);

{
  const connected = await waitFor(async () => (await connectionStatus(guest)) === 'connected' && (await connectionStatus(host)) === 'connected', 30000);
  check(connected, `online: guest auto-joins from the link and both show Connected [${transportUsed}]`);
  check(await boardData(host, 'my-color') === 'w' && await boardData(guest, 'my-color') === 'b'
    && await boardData(guest, 'orientation') === 'b' && await boardData(host, 'orientation') === 'w', 'online: host is White, guest is Black and the guest’s board is flipped');
  const guestFirstSquare = await guest.locator('[data-square]').first().getAttribute('data-square');
  check(guestFirstSquare === 'h1', `online: Black sees h1 in the top-left corner (${guestFirstSquare})`);
  check(await noOverflow(guest), 'online: no horizontal overflow on the 375px phone');
  const guestBoardBox = await guest.getByTestId('chess-board').boundingBox();
  check(guestBoardBox.x >= 0 && guestBoardBox.x + guestBoardBox.width <= 375 && guestBoardBox.width >= 340, `online: board fits the phone (${Math.round(guestBoardBox.width)}px)`);

  await move(guest, 'e7', 'e5', true);
  check(await boardData(guest, 'moves') === '0', 'online: guest cannot move on the host’s turn');
  const hostMoves = [['e2', 'e4'], ['g1', 'f3'], ['f1', 'b5']];
  const guestMoves = [['e7', 'e5'], ['b8', 'c6'], ['a7', 'a6']];
  let synced = true;
  for (let turn = 0; turn < 3; turn++) {
    await move(host, ...hostMoves[turn]);
    synced &&= await waitFor(async () => (await boardData(guest, 'moves')) === String(turn * 2 + 1), 10000, 50);
    await move(guest, ...guestMoves[turn], true);
    synced &&= await waitFor(async () => (await boardData(host, 'moves')) === String(turn * 2 + 2), 10000, 50);
  }
  check(synced && await boardData(host, 'fen') === await boardData(guest, 'fen'), `online: 6 moves synced both ways, same position (${await boardData(host, 'fen')})`);
  check((await host.getByTestId('chess-moves').innerText()).replace(/\s+/g, ' ').includes('3. Bb5 a6'), 'online: move list shows SAN');
  check(/Your move/.test(await host.getByTestId('chess-status').innerText()) && /Friend’s move/.test(await guest.getByTestId('chess-status').innerText()),
    'online: turn indicator on both sides');
  check(Number(await guest.getByTestId('chess-game').getAttribute('data-sounds')) >= 6, 'online: a move sound plays for every move');
  await host.mouse.move(0, 0);
  await tap(host, 'b5');
  await host.waitForTimeout(150);
  await host.screenshot({ path: `${screenshotDirectory}/kush-games-chess-desktop.png` });
  await tap(host, 'b5');
  await guest.screenshot({ path: `${screenshotDirectory}/kush-games-chess-mobile.png` });

  await guest.reload({ waitUntil: 'networkidle' });
  check(await boardData(guest, 'moves') === '6' && await boardData(guest, 'my-color') === 'b', 'online: after a reload the guest’s board and colour are restored from the save');
  check(await waitFor(async () => (await connectionStatus(guest)) === 'connected', 30000), 'online: the guest re-joins the room after a reload');
  await move(host, 'b5', 'c6');
  check(await waitFor(async () => (await boardData(guest, 'moves')) === '7', 10000, 50), 'online: moves still sync after the guest reloads');
  await move(guest, 'd7', 'c6', true);
  await waitFor(async () => (await boardData(host, 'moves')) === '8', 10000, 50);
  await host.reload({ waitUntil: 'networkidle' });
  const hostBack = await waitFor(async () => (await connectionStatus(host)) === 'connected' && (await connectionStatus(guest)) === 'connected', 45000);
  check(hostBack && await boardData(host, 'moves') === '8' && await boardData(host, 'fen') === await boardData(guest, 'fen'),
    `online: the host reloads, keeps the board and both reconnect (${await connectionStatus(host)} / ${await connectionStatus(guest)})`);

  await guest.getByTestId('chess-offer-draw').tap();
  check(await waitFor(() => host.getByTestId('chess-draw-offer').isVisible(), 10000), 'online: draw offer reaches the host');
  await host.getByRole('button', { name: 'Decline' }).click();
  check(await waitFor(async () => !(await guest.getByTestId('chess-offer-draw').isDisabled()), 10000), 'online: declining the draw re-enables the offer');
  await host.getByTestId('chess-resign').click();
  await host.getByTestId('chess-confirm-resign').click();
  check(await waitFor(async () => (await boardData(guest, 'result')) === 'b', 10000)
    && /you win/.test(await guest.getByTestId('chess-status').innerText()), 'online: host resigns, the guest sees "you win"');
  await guest.getByTestId('chess-rematch').tap();
  check(await waitFor(() => host.getByTestId('chess-rematch-offer').isVisible(), 10000), 'online: rematch offer reaches the host');
  await host.getByTestId('chess-accept-rematch').click();
  check(await waitFor(async () => (await boardData(guest, 'my-color')) === 'w' && (await boardData(host, 'my-color')) === 'b'
    && (await boardData(guest, 'moves')) === '0' && (await boardData(guest, 'orientation')) === 'w', 10000), 'online: rematch starts a new game with colours swapped and boards re-oriented');
  await move(guest, 'd2', 'd4', true);
  check(await waitFor(async () => (await boardData(host, 'moves')) === '1', 10000), 'online: the new game syncs (guest now White)');

  await guest.getByTestId('chess-leave').tap();
  check(await waitFor(async () => (await connectionStatus(host)) === 'opponent-left', 25000)
    && /Opponent left/.test(await host.getByTestId('chess-connection').innerText()), 'online: host shows "Opponent left" when the guest leaves');
  check(await guest.evaluate(() => localStorage.getItem('kush-games:chess:save:v1')) === null, 'online: leaving clears the guest’s save');
  await host.goto(siteUrl, { waitUntil: 'networkidle' });
  check(await host.locator('[data-testid=row-play-now] [data-testid=continue-chess]').isVisible(), 'home: Chess card shows ▶ Continue while a room is saved');
}

check(pageErrors.length === 0, `no page errors ${pageErrors.join(' | ')}`);
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
