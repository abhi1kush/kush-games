// Shared helpers for the online e2e tests.
//
// Real WebRTC data channels can't open in some sandboxes, so the tests can swap the transport: each page gets
// `window.__kushTestTransport`, whose messages this script relays between the two browser contexts. Everything
// else (session, protocol, saving and UI) is the real app code.
export async function waitFor(predicate, timeoutMs = 15000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate().catch(() => false)) return true;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

export const guestPhoneOptions = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const hostDesktopOptions = { viewport: { width: 1280, height: 800 } };
export const connectionStatus = page => page.getByTestId('online-connection').getAttribute('data-status');
export const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Two browser contexts (host desktop, guest phone by default) joined by a relay transport. */
export async function createRelayContexts(browser, { hostOptions = hostDesktopOptions, guestOptions = guestPhoneOptions } = {}) {
  const pages = {};
  let isOpen = false;
  const deliver = (role, method, argument) => pages[role]?.evaluate(([name, value]) => {
    const handlers = window.__kushRelayHandlers;
    if (!handlers) return;
    if (name === 'open') { window.__kushRelayOpen = true; handlers.onStatus({ status: 'connected' }); handlers.onOpen(); }
    else if (name === 'close') { window.__kushRelayOpen = false; handlers.onStatus({ status: 'opponent-left' }); }
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
    await context.exposeBinding('__kushRelaySend', (_source, text) => { if (isOpen) void deliver(role === 'host' ? 'guest' : 'host', 'message', text); });
    await context.exposeBinding('__kushRelayReady', (_source, isReady) => setReady(role, isReady));
    await context.addInitScript(() => {
      window.__kushTestTransport = () => ({
        start(handlers) {
          window.__kushRelayHandlers = handlers;
          handlers.onStatus({ status: 'waiting' });
          window.__kushRelayReady(true);
        },
        send(message) { if (!window.__kushRelayOpen) return false; window.__kushRelaySend(JSON.stringify(message)); return true; },
        stop() { window.__kushRelayHandlers = null; window.__kushRelayOpen = false; window.__kushRelayReady(false); },
      });
      window.addEventListener('pagehide', () => window.__kushRelayReady(false));
    });
    pages[role] = await context.newPage();
    return { context, page: pages[role] };
  };
  const hostSide = await makeContext('host', hostOptions);
  const guestSide = await makeContext('guest', guestOptions);
  return { hostContext: hostSide.context, guestContext: guestSide.context, host: hostSide.page, guest: guestSide.page };
}

/** Put two screenshots next to each other (labels on top) with Python/Pillow. */
export async function sideBySide(leftPath, rightPath, outputPath, labels = ['Host', 'Guest']) {
  const { execFileSync } = await import('node:child_process');
  execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw, ImageFont
left, right = Image.open(sys.argv[1]).convert('RGB'), Image.open(sys.argv[2]).convert('RGB')
scale = lambda image, height: image.resize((round(image.width * height / image.height), height))
height = min(1000, max(left.height, right.height))
left, right = scale(left, height), scale(right, height)
gap, top = 24, 44
canvas = Image.new('RGB', (left.width + right.width + gap * 3, height + top + gap), (18, 18, 22))
canvas.paste(left, (gap, top)); canvas.paste(right, (left.width + gap * 2, top))
draw = ImageDraw.Draw(canvas)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception: font = ImageFont.load_default()
draw.text((gap, 10), sys.argv[4], fill=(230, 230, 230), font=font)
draw.text((left.width + gap * 2, 10), sys.argv[5], fill=(230, 230, 230), font=font)
canvas.save(sys.argv[3])
`, leftPath, rightPath, outputPath, labels[0], labels[1]]);
}

/** Both players press "New game" at the same moment (whichever of New game / Accept each one sees). */
export const pressNewGameTogether = pages => Promise.all(pages.map(page => page.evaluate(() =>
  (document.querySelector('[data-testid=online-new-game]') ?? document.querySelector('[data-testid=online-accept-rematch]'))?.click())));
