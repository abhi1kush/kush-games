// A relay "room network" for the turn games (Ludo, Snakes & Ladders) in e2e tests: one "broker" holding each room
// id (like the PeerJS server) and message delivery between browser contexts, exposed as window.__kushTestRoomNetwork.
// Real WebRTC data channels can't open in some sandboxes, so the tests use this; everything else is the real app.
export function createTurnRelay(browser, { nameKey, onPageError }) {
  const endpoints = new Map();
  const holders = new Map();
  let nextPeer = 1;
  const deliver = (id, kind, a = null, b = null) => {
    const endpoint = endpoints.get(id);
    if (!endpoint) return;
    endpoint.page.evaluate(([target, what, first, second]) => window.__turnRelayDeliver?.(target, what, first, second), [id, kind, a, b]).catch(() => undefined);
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
  function pageGone(page) {
    for (const [id, endpoint] of [...endpoints]) if (endpoint.page === page) { dropHost(id); dropGuest(id); endpoints.delete(id); }
  }

  /** A player in their own browser context, wired to the relay. */
  async function newPlayer(name, options) {
    const context = await browser.newContext(options);
    await context.exposeBinding('__turnRelay', ({ page }, text) => relay(page, text));
    await context.addInitScript(([playerName, key]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, playerName);
      const handlers = {};
      window.__turnRelayDeliver = (id, kind, a, b) => {
        const handler = handlers[id];
        if (!handler) return;
        if (kind === 'status') handler.onStatus(a);
        else if (kind === 'guestOpen') handler.onGuestOpen(a);
        else if (kind === 'guestMessage') handler.onGuestMessage(a, JSON.parse(b));
        else if (kind === 'guestClose') handler.onGuestClose(a);
        else if (kind === 'hostMessage') handler.onHostMessage(JSON.parse(a));
      };
      window.addEventListener('pagehide', () => { for (const id of Object.keys(handlers)) { delete handlers[id]; window.__turnRelay(JSON.stringify({ id, cmd: 'stop' })); } });
      window.__kushTestRoomNetwork = (gameId, code) => {
        const id = Math.random().toString(36).slice(2, 10);
        const send = command => window.__turnRelay(JSON.stringify({ id, ...command }));
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
    }, [name, nameKey]);
    const page = await context.newPage();
    page.on('pageerror', error => onPageError?.(name, error));
    page.on('close', () => pageGone(page));
    return { name, page, context };
  }
  return { newPlayer };
}
