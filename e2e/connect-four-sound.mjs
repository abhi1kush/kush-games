// Connect Four drop sound: every disc (yours, the computer's, a friend's in pass-and-play) schedules a clack timed
// to its landing; muting silences it. Usage: node e2e/connect-four-sound.mjs [siteUrl]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
let failures = 0;
const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
// count the audio nodes the game schedules (sources started, with their start times)
await page.addInitScript(() => {
  window.__audioStarts = [];
  const wrap = (proto, label) => {
    const start = proto.start;
    proto.start = function (when = 0, ...rest) { window.__audioStarts.push({ label, when, now: this.context.currentTime }); return start.call(this, when, ...rest); };
  };
  wrap(AudioBufferSourceNode.prototype, 'noise');
  wrap(OscillatorNode.prototype, 'tone');
  localStorage.setItem('kush-games-muted', 'false');
});
const sounds = () => page.getByTestId('connect-four').getAttribute('data-sounds').then(Number);
const moves = () => page.getByTestId('connect-four').getAttribute('data-moves').then(Number);
const starts = () => page.evaluate(() => window.__audioStarts.length);

await page.goto(`${siteUrl}#/play/connect-four`);
await page.getByTestId('connect-four').waitFor();
await page.waitForFunction(() => document.querySelector('[data-testid=c4-column-0]'));

// pass-and-play: both players' drops
await page.getByTestId('c4-mode-friends').click();
await page.waitForTimeout(200);
let before = await sounds();
let nodesBefore = await starts();
await page.getByTestId('c4-column-3').click();
await page.waitForTimeout(100);
check(await sounds() === before + 1, 'dropping a disc plays the drop sound');
const scheduled = await page.evaluate(n => window.__audioStarts.slice(n), nodesBefore);
const clack = scheduled.filter(node => node.when - node.now > 0.3);
check(scheduled.length >= 6 && clack.length >= 4, `it is a layered clack timed to the landing (${scheduled.length} nodes, ${clack.length} at the landing)`);
before = await sounds();
await page.getByTestId('c4-column-3').click();
await page.waitForTimeout(100);
check(await sounds() === before + 1, "the second player's drop plays it too");

// against the computer: its reply clacks as well
await page.getByTestId('c4-mode-computer').click().catch(() => {});
await page.waitForTimeout(300);
before = await sounds();
const movesBefore = await moves();
await page.getByTestId('c4-column-2').click();
await page.waitForFunction(m => Number(document.querySelector('[data-testid=connect-four]').getAttribute('data-moves')) >= m + 2, movesBefore, { timeout: 8000 }).catch(() => {});
check(await sounds() >= before + 2, `your drop and the computer's reply both clack (${(await sounds()) - before})`);

// muted: silent
await page.keyboard.press('m');
await page.waitForTimeout(100);
check((await page.getByTestId('mute').first().getAttribute('aria-pressed')) === 'true', 'M mutes');
before = await sounds();
nodesBefore = await starts();
const muteMoves = await moves();
await page.getByTestId('c4-column-4').click();
await page.waitForFunction(m => Number(document.querySelector('[data-testid=connect-four]').getAttribute('data-moves')) >= m + 2, muteMoves, { timeout: 8000 }).catch(() => {});
check(await sounds() === before && await starts() === nodesBefore, 'muted: no drop sound');
await page.keyboard.press('m');
check(errors.length === 0, `no page errors (${errors.length})`);
await browser.close();
if (failures) { console.log(`${failures} check(s) failed`); process.exit(1); }
console.log('all checks passed');
