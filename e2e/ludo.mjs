// Ludo e2e: a real 4-player online room in separate browser contexts (desktop, phone portrait, phone landscape).
// Real WebRTC data channels can't open in some sandboxes (this box included), so by default the room network is a
// relay run by this script (window.__kushTestRoomNetwork: one "broker" holding the room id, like the PeerJS server,
// and message delivery between the contexts). Everything else is the real app: rules in wasm, the host authority,
// host migration, saving, reconnecting and the UI. A separate check confirms the public PeerJS broker registers rooms.
// Turn clocks are shortened with the test-only ?ludoTurn=N parameter.
// Usage: node e2e/ludo.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';
import { waitFor } from './relay.mjs';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const TURN_SECONDS = 4;
const testUrl = `${siteUrl}?ludoTest&ludoTurn=${TURN_SECONDS}`;
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const pageErrors = [];

// ---------- relay "broker" ----------
const endpoints = new Map(); // id → { page, room, mode, hostId, guests: Map(peer → id) }
const holders = new Map();   // room → endpoint id
let nextPeer = 1;
const deliver = (id, kind, a = null, b = null) => {
  const endpoint = endpoints.get(id);
  if (!endpoint) return;
  endpoint.page.evaluate(([target, what, first, second]) => window.__ludoRelayDeliver?.(target, what, first, second), [id, kind, a, b]).catch(() => undefined);
};
function dropHost(id) {
  const endpoint = endpoints.get(id);
  if (!endpoint || holders.get(endpoint.room) !== id) return;
  holders.delete(endpoint.room);
  for (const [, guestId] of endpoint.guests) {
    const guest = endpoints.get(guestId);
    if (guest) { guest.hostPeer = null; guest.hostId = null; deliver(guestId, 'status', 'host-lost'); }
  }
  endpoint.guests.clear();
}
function dropGuest(id) {
  const endpoint = endpoints.get(id);
  if (!endpoint?.hostId) return;
  const host = endpoints.get(endpoint.hostId);
  if (host) { host.guests.delete(endpoint.hostPeer); deliver(endpoint.hostId, 'guestClose', endpoint.hostPeer); }
  endpoint.hostId = null; endpoint.hostPeer = null;
}
function tryConnect(id) {
  const endpoint = endpoints.get(id);
  if (!endpoint || endpoint.mode !== 'guest' || endpoint.hostId) return;
  const hostId = holders.get(endpoint.room);
  if (!hostId || hostId === id) { deliver(id, 'status', endpoint.wasConnected ? 'host-lost' : 'connecting'); setTimeout(() => tryConnect(id), 1000); return; }
  const peer = `r${nextPeer++}`;
  endpoint.hostId = hostId; endpoint.hostPeer = peer; endpoint.wasConnected = true;
  endpoints.get(hostId).guests.set(peer, id);
  deliver(id, 'status', 'connected');
  deliver(hostId, 'guestOpen', peer);
}
function relay(page, text) {
  const command = JSON.parse(text);
  const { id } = command;
  const endpoint = endpoints.get(id);
  switch (command.cmd) {
    case 'start': endpoints.set(id, { page, room: command.room, mode: 'idle', hostId: null, hostPeer: null, guests: new Map(), wasConnected: false }); return;
    case 'host':
      if (!endpoint) return;
      dropGuest(id);
      if (holders.has(endpoint.room) && holders.get(endpoint.room) !== id) { endpoint.mode = 'idle'; deliver(id, 'status', 'host-id-taken'); return; }
      holders.set(endpoint.room, id); endpoint.mode = 'host'; deliver(id, 'status', 'hosting'); return;
    case 'join': if (!endpoint) return; dropHost(id); dropGuest(id); endpoint.mode = 'guest'; tryConnect(id); return;
    case 'send': { if (!endpoint) return; const guestId = endpoint.guests.get(command.peer); if (guestId) deliver(guestId, 'hostMessage', command.message); return; }
    case 'broadcast': if (!endpoint) return; for (const guestId of endpoint.guests.values()) deliver(guestId, 'hostMessage', command.message); return;
    case 'toHost': if (endpoint?.hostId) deliver(endpoint.hostId, 'guestMessage', endpoint.hostPeer, command.message); return;
    case 'close': {
      if (!endpoint) return;
      const guestId = endpoint.guests.get(command.peer);
      endpoint.guests.delete(command.peer);
      const guest = guestId && endpoints.get(guestId);
      if (guest) { guest.hostId = null; guest.hostPeer = null; deliver(guestId, 'status', 'host-lost'); setTimeout(() => tryConnect(guestId), 1000); }
      return;
    }
    case 'stop': if (!endpoint) return; dropHost(id); dropGuest(id); endpoints.delete(id); return;
  }
}
/** A page went away (reload/close): like a crashed tab, its connections drop. */
function pageGone(page) {
  for (const [id, endpoint] of [...endpoints]) if (endpoint.page === page) { dropHost(id); dropGuest(id); endpoints.delete(id); }
}

const players = {};
async function newPlayer(name, options) {
  const context = await browser.newContext(options);
  await context.exposeBinding('__ludoRelay', ({ page }, text) => relay(page, text));
  await context.addInitScript(playerName => {
    if (!localStorage.getItem('kush-games-ludo-name')) localStorage.setItem('kush-games-ludo-name', playerName);
    const handlers = {};
    window.__ludoRelayDeliver = (id, kind, a, b) => {
      const handler = handlers[id];
      if (!handler) return;
      if (kind === 'status') handler.onStatus(a);
      else if (kind === 'guestOpen') handler.onGuestOpen(a);
      else if (kind === 'guestMessage') handler.onGuestMessage(a, JSON.parse(b));
      else if (kind === 'guestClose') handler.onGuestClose(a);
      else if (kind === 'hostMessage') handler.onHostMessage(JSON.parse(a));
    };
    // a tab that unloads drops its connections, like a closed or refreshed tab
    window.addEventListener('pagehide', () => { for (const id of Object.keys(handlers)) { delete handlers[id]; window.__ludoRelay(JSON.stringify({ id, cmd: 'stop' })); } });
    window.__kushTestRoomNetwork = (gameId, code) => {
      const id = Math.random().toString(36).slice(2, 10);
      const send = command => window.__ludoRelay(JSON.stringify({ id, ...command }));
      return {
        start(handler) { handlers[id] = handler; send({ cmd: 'start', room: `${gameId}-${code}` }); },
        host() { send({ cmd: 'host' }); },
        join() { send({ cmd: 'join' }); },
        sendToGuest(peer, message) { send({ cmd: 'send', peer, message: JSON.stringify(message) }); },
        broadcast(message) { send({ cmd: 'broadcast', message: JSON.stringify(message) }); },
        sendToHost(message) { send({ cmd: 'toHost', message: JSON.stringify(message) }); return true; },
        closeGuest(peer) { send({ cmd: 'close', peer }); },
        stop() { delete handlers[id]; send({ cmd: 'stop' }); },
      };
    };
  }, name);
  const page = await context.newPage();
  page.on('pageerror', error => { pageErrors.push(`${name}: ${error}`); console.log(`  page error (${name}): ${error.stack?.split('\n').slice(0, 4).join(' | ')}`); });
  page.on('close', () => pageGone(page));
  players[name] = { name, page, context };
  return players[name];
}

const view = page => page.evaluate(() => window.__ludoTest?.view() ?? null);
const myPlayer = async page => { const current = await view(page); return current?.state?.players.find(player => player.clientId === current.myId) ?? null; };
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const boardFits = page => page.evaluate(() => { const board = document.querySelector('[data-testid=ludo-board]')?.getBoundingClientRect(); return !!board && board.right <= innerWidth + 1 && board.bottom <= innerHeight + 1 && board.left >= -1; });

/** Play the turns of `names` (by tapping the dice / the first glowing token) until `done()`; others are left alone. */
const reported = new Set();
async function play(names, done, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return true;
    for (const name of names) {
      const { page } = players[name];
      const current = await view(page).catch(() => null);
      const game = current?.game;
      const me = current?.state?.players.find(player => player.clientId === current.myId);
      if (!game || !me || current.state.phase !== 'playing' || game.current !== me.seat || me.status !== 'playing') continue;
      const report = error => { const text = String(error).split('\n').slice(0, 3).join(' '); if (!reported.has(text)) { reported.add(text); console.log(`  (${name}: ${text})`); } };
      if (game.phase === 1) await page.locator('[data-testid=ludo-dice]:not([disabled])').click({ timeout: 1500, force: true }).catch(report);
      else if (game.phase === 2) await page.locator('[data-testid^=ludo-move-]').first().click({ timeout: 1500, force: true }).catch(report);
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return false;
}

// ---------- the room ----------
const host = await newPlayer('Host', { viewport: { width: 1280, height: 800 } });
const asha = await newPlayer('Asha', { viewport: { width: 1100, height: 760 } });
const meera = await newPlayer('Meera', { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const kabir = await newPlayer('Kabir', { viewport: { width: 390, height: 740 }, isMobile: true, hasTouch: true });
const ravi = await newPlayer('Ravi', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await host.page.goto(`${testUrl}#/play/ludo`, { waitUntil: 'networkidle' });
await host.page.waitForSelector('[data-testid=ludo-menu]');
check(await host.page.getByTestId('ludo-rules').count() === 1, 'start screen shows the rules card');
await host.page.getByTestId('ludo-create').click();
await host.page.waitForSelector('[data-testid=ludo-lobby]');
const roomCode = await host.page.getByTestId('ludo-room-code').innerText();
const link = await host.page.getByTestId('ludo-link').inputValue();
check(/^[A-Z2-9]{5}$/.test(roomCode) && link.endsWith(`#/play/ludo?room=${roomCode}`), `host created room ${roomCode} with a share link`);
const roomUrl = `${testUrl}#/play/ludo?room=${roomCode}`;
const lobbyCount = page => page.locator('[data-testid=ludo-lobby-player]').count();

for (const player of [asha, meera, kabir]) await player.page.goto(roomUrl, { waitUntil: 'networkidle' });
check(await waitFor(async () => (await lobbyCount(host.page)) === 4 && (await lobbyCount(kabir.page)) === 4), 'three guests join through the link: 4 players in the lobby');
const lobbyNames = await host.page.locator('[data-testid=ludo-lobby-player]').evaluateAll(items => items.map(item => item.getAttribute('data-name')));
check(lobbyNames.join() === 'Host,Asha,Meera,Kabir', `lobby lists names in join order (${lobbyNames.join(', ')})`);
check(await host.page.getByTestId('ludo-start').isEnabled() && await asha.page.getByTestId('ludo-start').count() === 0, 'only the host has the Start button');

// a 5th player is turned away
await ravi.page.goto(roomUrl, { waitUntil: 'networkidle' });
check(await waitFor(() => ravi.page.getByTestId('ludo-ending-rejected').isVisible()) && /full/i.test(await ravi.page.getByTestId('ludo-ending-rejected').locator('h2').innerText()), 'a 5th player gets “This room is full”');

// host removes Kabir
await host.page.getByTestId('ludo-kick-Kabir').click();
check(await waitFor(() => kabir.page.getByTestId('ludo-ending-kicked').isVisible()), 'kicked player sees the “removed” message');
check(await waitFor(async () => (await lobbyCount(host.page)) === 3 && (await lobbyCount(asha.page)) === 3), 'everyone sees 3 players after the kick');
await kabir.page.reload({ waitUntil: 'networkidle' });
await kabir.page.waitForTimeout(1500);
check(await kabir.page.getByTestId('ludo-ending-kicked').isVisible() && await lobbyCount(host.page) === 3, 'kicked player can’t rejoin with the same link (reload)');

// Ravi takes the free seat
await ravi.page.goto(`${siteUrl}?ludoTest&ludoTurn=${TURN_SECONDS}#/play/ludo`, { waitUntil: 'networkidle' });
await ravi.page.goto(roomUrl, { waitUntil: 'networkidle' });
check(await waitFor(async () => (await lobbyCount(host.page)) === 4), 'a new player joins the freed seat (4 again)');
await asha.page.getByTestId('ludo-lobby-name').fill('Asha ⭐');
check(await waitFor(async () => (await host.page.locator('[data-testid=ludo-lobby-player][data-name="Asha ⭐"]').count()) === 1), 'a renamed player shows up with the new name for the host');
check(await asha.page.evaluate(() => localStorage.getItem('kush-games-ludo-name')) === 'Asha ⭐', 'the edited name is saved');
await host.page.screenshot({ path: `${screenshotDirectory}/kush-games-ludo-lobby.png` });

// start
await host.page.getByTestId('ludo-start').click();
check(await waitFor(async () => {
  for (const player of [host, asha, meera, ravi]) if (!(await player.page.getByTestId('ludo-game').isVisible())) return false;
  return true;
}), 'host starts: the game opens for all 4 players');
const seats = {};
for (const player of [host, asha, meera, ravi]) seats[player.name] = (await myPlayer(player.page)).seat;
check(new Set(Object.values(seats)).size === 4, `each player has their own colour (${JSON.stringify(seats)})`);
for (const player of [host, asha, meera, ravi]) {
  check(await noOverflow(player.page) && await boardFits(player.page), `${player.name}: no horizontal scroll, the board fits the screen`);
}

// the dice sits on the current player's yard and the turn banner names them
const diceCheck = async page => page.evaluate(() => {
  const board = document.querySelector('[data-testid=ludo-board]');
  const current = Number(board.getAttribute('data-current'));
  const dice = document.querySelector('.ludo-board__dice')?.getBoundingClientRect();
  const yard = document.querySelector(`[data-testid=ludo-yard-${current}]`)?.getBoundingClientRect();
  const inside = dice && yard && dice.left + dice.width / 2 > yard.left && dice.left + dice.width / 2 < yard.right && dice.top + dice.height / 2 > yard.top && dice.top + dice.height / 2 < yard.bottom;
  return { inside: !!inside, glowing: document.querySelector(`[data-testid=ludo-yard-${current}]`)?.classList.contains('is-turn') ?? false };
});
await waitFor(async () => (await view(host.page))?.game?.phase === 1, 5000);
const firstDice = await diceCheck(host.page);
check(firstDice.inside && firstDice.glowing, 'the dice sits on the current player’s yard, which glows');
check(await host.page.getByTestId('ludo-seconds').count() === 1, 'the turn timer shows a countdown');
check(await play(['Host', 'Asha', 'Meera', 'Ravi'], async () => ((await view(host.page))?.game?.rollId ?? 0) >= 10, 60000), 'players roll and move: 10 rolls played through the UI');
// screenshot when it's someone else's turn on the host's screen
await play(['Host', 'Asha', 'Meera', 'Ravi'], async () => { const current = await view(host.page); return current?.game?.current !== seats.Host && current?.game?.phase === 1; }, 20000);
await host.page.waitForTimeout(700);
const otherTurn = await diceCheck(host.page);
check(otherTurn.inside, 'the dice moved to the other player’s yard on their turn');
await host.page.waitForTimeout(500);
await host.page.screenshot({ path: `${screenshotDirectory}/kush-games-ludo-dice-turn.png` });
await play(['Host', 'Asha', 'Meera', 'Ravi'], async () => ((await view(host.page))?.game?.rollId ?? 0) >= 22, 60000);
await host.page.screenshot({ path: `${screenshotDirectory}/kush-games-ludo-desktop.png` });
await meera.page.screenshot({ path: `${screenshotDirectory}/kush-games-ludo-mobile.png` });
await ravi.page.screenshot({ path: `${screenshotDirectory}/kush-games-ludo-landscape.png` });
check(await noOverflow(ravi.page) && await boardFits(ravi.page) && await noOverflow(meera.page), 'phones (portrait + landscape): still no horizontal scroll mid-game');

// Asha refreshes mid-game and gets her seat back
await asha.page.reload({ waitUntil: 'networkidle' });
check(await play(['Host', 'Meera', 'Ravi'], async () => { const me = await myPlayer(asha.page); return me?.seat === seats.Asha && me.status === 'playing' && me.connected && (await view(asha.page))?.network === 'connected'; }, 20000),
  'a refreshed guest rejoins the same seat');

// the host leaves: Asha (next in join order) takes over and the game goes on
const ashaId = (await view(asha.page)).myId;
await host.page.getByTestId('ludo-leave').click();
await host.page.getByTestId('ludo-confirm-yes').click();
check(await waitFor(() => host.page.getByTestId('ludo-ending-left').isVisible()), 'the host sees “You left the game”');
check(await play(['Meera', 'Ravi'], async () => (await view(asha.page))?.role === 'host', 15000), 'host migration: Asha becomes the host');
check(await play(['Asha', 'Meera', 'Ravi'], async () => (await view(meera.page))?.state?.hostId === ashaId && (await view(ravi.page))?.state?.hostId === ashaId && (await view(meera.page))?.network === 'connected', 15000),
  'the others reconnect to the new host');
const hostGone = (await view(asha.page)).state.players.find(player => player.name === 'Host');
check(hostGone?.status === 'left' && (await view(asha.page)).game.progress[hostGone.seat].every(progress => progress === 254), 'the old host’s tokens are off the board');
check(await asha.page.locator('[data-testid=ludo-log]').innerText().then(text => /now the host/.test(text)), 'the log says who the new host is');
const rollBefore = (await view(asha.page)).game.rollId;
check(await play(['Asha', 'Meera', 'Ravi'], async () => ((await view(meera.page))?.game?.rollId ?? 0) >= ((rollBefore + 4) % 256), 30000), 'the game keeps going under the new host');

// Ravi leaves
await ravi.page.getByTestId('ludo-leave').click();
check(await ravi.page.getByTestId('ludo-confirm').isVisible(), 'Leave asks for confirmation');
await ravi.page.getByTestId('ludo-confirm-yes').click();
check(await waitFor(async () => (await view(asha.page))?.state?.players.find(player => player.name === 'Ravi')?.status === 'left'), 'Ravi left: marked as left for everyone');
check(await waitFor(async () => (await view(meera.page))?.game?.progress[seats.Ravi].every(progress => progress === 254)), 'Ravi’s tokens are removed');

// Meera stops playing: three missed turns → out
let sawTwoStrikes = false;
const strikes = async () => (await view(asha.page))?.game?.strikes[seats.Meera] ?? 0;
const baseStrikes = await strikes();
console.log(`  (Meera had ${baseStrikes} strike(s) before she stopped playing)`);
if (baseStrikes < 2) {
  const expected = baseStrikes + 1;
  await play(['Asha'], async () => (await strikes()) >= expected, 40000);
  check(await waitFor(async () => new RegExp(`${expected}/3`).test(await asha.page.getByTestId(`ludo-player-strikes-${seats.Meera}`).innerText().catch(() => ''))),
    `a missed turn is auto-played and shows strike ${expected}/3 next to Meera’s name`);
  check(await asha.page.locator('[data-testid=ludo-log], [data-testid=ludo-toast]').allInnerTexts().then(texts => texts.join(' ').includes(`Meera ran out of time — played automatically (strike ${expected}/3)`)),
    `everyone is told: “Meera ran out of time — played automatically (strike ${expected}/3)”`);
}
check(await play(['Asha'], async () => {
  const count = await strikes();
  if (count === 2 && !sawTwoStrikes) {
    sawTwoStrikes = true;
    await asha.page.waitForTimeout(300);
    await asha.page.screenshot({ path: `${screenshotDirectory}/kush-games-ludo-strikes.png` });
  }
  return (await view(asha.page))?.state?.players.find(player => player.name === 'Meera')?.status === 'forfeited';
}, 60000), 'the 3rd missed turn forfeits Meera');
check(sawTwoStrikes, 'strike 2/3 was shown on the way');
check(await meera.page.locator('[data-testid=ludo-log]').innerText().then(text => /Meera missed 3 turns and is out/.test(text)), 'everyone (incl. Meera) is told she is out');

// one player left → Asha wins
check(await waitFor(async () => (await view(asha.page))?.state?.phase === 'finished' && await asha.page.getByTestId('ludo-finish').isVisible(), 10000), 'only Asha is left: game over, finish card shown');
check(await asha.page.locator('[data-testid=ludo-finish-place]').first().innerText().then(text => /Asha/.test(text) && /1st/.test(text)), 'Asha is 1st');
await asha.page.waitForTimeout(600);
await asha.page.screenshot({ path: `${screenshotDirectory}/kush-games-ludo-finish.png` });
check(await meera.page.getByTestId('ludo-rematch').isVisible(), 'everyone gets a New game button');
await asha.page.getByTestId('ludo-rematch').click();
check(await waitFor(async () => (await view(meera.page))?.state?.gameNumber === 2 && (await view(meera.page))?.state?.phase === 'playing'), 'New game starts a fresh game for the players still in the room');

// the public PeerJS broker registers a Ludo room (direct WebRTC between contexts may not open here)
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${siteUrl}#/play/ludo`, { waitUntil: 'networkidle' });
  await page.getByTestId('ludo-create').click();
  check(await waitFor(async () => (await page.getByTestId('ludo-network').getAttribute('data-status').catch(() => '')) === 'hosting', 25000), 'real PeerJS: the host registers the room on the public broker');
  await context.close();
}

check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All Ludo checks passed');
process.exit(failures ? 1 : 0);
