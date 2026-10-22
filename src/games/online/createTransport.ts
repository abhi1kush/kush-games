import { PeerTransport } from './peerTransport';
import type { Transport, TransportFactory } from './transport';
import type { Role } from './match';

/**
 * PeerJS normally. Browser tests may install `window.__kushTestTransport` (or the older
 * `window.__kushChessTestTransport`) to relay messages themselves, since WebRTC can't open in some sandboxes.
 */
export function createTransport(role: Role, roomCode: string, gameId: string): Transport {
  const testWindow = window as unknown as { __kushTestTransport?: TransportFactory; __kushChessTestTransport?: TransportFactory };
  const testFactory = testWindow.__kushTestTransport ?? testWindow.__kushChessTestTransport;
  return testFactory ? testFactory(role, roomCode, gameId) : new PeerTransport(role, roomCode, gameId);
}
