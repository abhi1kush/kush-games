/** Two in-memory transports wired to each other, for tests (and as a stand-in for the network). */
import type { Message } from './protocol';
import type { Transport, TransportHandlers } from './session';

export interface MemoryLink {
  host: Transport;
  guest: Transport;
  /** Open the connection (both sides get onOpen). */
  connect(): void;
  /** Drop the connection; messages sent while down are lost. */
  disconnect(): void;
  /** Deliver queued messages (delivery is manual so tests control the order). */
  flush(): void;
  sent: { from: 'host' | 'guest'; message: Message }[];
}

export function createMemoryLink(): MemoryLink {
  let isOpen = false;
  const handlers: Partial<Record<'host' | 'guest', TransportHandlers>> = {};
  const queue: { to: 'host' | 'guest'; data: unknown }[] = [];
  const sent: MemoryLink['sent'] = [];
  const side = (name: 'host' | 'guest'): Transport => ({
    start(sideHandlers) {
      handlers[name] = sideHandlers;
      sideHandlers.onStatus({ status: name === 'host' ? 'waiting' : 'connecting' });
    },
    send(message) {
      if (!isOpen) return false;
      sent.push({ from: name, message });
      // round-trip through JSON like the real data channel
      queue.push({ to: name === 'host' ? 'guest' : 'host', data: JSON.parse(JSON.stringify(message)) });
      return true;
    },
    stop() { delete handlers[name]; },
  });
  const link: MemoryLink = {
    host: side('host'),
    guest: side('guest'),
    sent,
    connect() {
      isOpen = true;
      for (const name of ['host', 'guest'] as const) handlers[name]?.onStatus({ status: 'connected' });
      for (const name of ['host', 'guest'] as const) handlers[name]?.onOpen();
    },
    disconnect() {
      isOpen = false;
      queue.length = 0;
      for (const name of ['host', 'guest'] as const) handlers[name]?.onStatus({ status: 'opponent-left' });
    },
    flush() {
      while (queue.length) {
        const { to, data } = queue.shift()!;
        handlers[to]?.onMessage(data);
      }
    },
  };
  return link;
}
