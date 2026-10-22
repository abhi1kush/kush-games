// Breakout performance + fairness check on a throttled "phone" (375 px, DPR 2, CPU slowed 4× and 6×).
// An in-page autopilot plays through the normal touch path (pointermove on the canvas) for ~55 s on later levels with
// multi-ball and wide-paddle power-ups, then plays "late" (moves under the ball only at the last moment, like a person)
// while the test freezes the main thread for 300 ms just as the ball comes down — the classic phone hitch.
// Usage: node e2e/perf-breakout.mjs [siteUrl] [--label name] [--json out.json] [--assert] [--rates 4,6] [--seconds 55]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { reactCommitCounterScript } from './perf-snake.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const siteUrl = args.find(arg => /^https?:/.test(arg)) ?? 'https://abhi1kush.github.io/kush-games/';
const label = option('label', 'run');
const jsonPath = option('json', null);
const shouldAssert = args.includes('--assert');
const rates = option('rates', '4,6').split(',').map(Number);
const normalSeconds = Number(option('seconds', '55'));
const hitchCount = Number(option('hitches', '6'));
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

const instrumentation = () => {
  const counters = { storageWrites: 0, oscillators: 0 };
  window.__perfCounters = counters;
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (...rest) { counters.storageWrites++; return originalSetItem.apply(this, rest); };
  const originalOscillator = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () { counters.oscillators++; return originalOscillator.call(this); };
  window.__longTasks = [];
  new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__longTasks.push([entry.startTime, entry.duration]); }).observe({ type: 'longtask', buffered: true });
};

/** In-page autopilot + frame recorder. Uses only the canvas's pointer events and the test hook's read-only views. */
const autopilot = () => {
  const test = window.__breakoutTest;
  const canvas = document.querySelector('[data-testid=breakout-canvas]');
  const state = window.__autopilot = {
    mode: 'track', recording: false, frames: [], jumps: [], livesLost: [], hitches: [], hitchArmed: false, gameOvers: 0, freeRelaunches: 0,
    errors: [],
  };
  let previousTime = 0, previousLives = -1, lastLaunchAt = 0;
  const previousBalls = new Float32Array(6);
  let previousBallCount = 0;
  const pointer = (x) => {
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: box.left + (x / 480) * box.width, clientY: box.top + box.height * 0.92, pointerType: 'touch', pointerId: 7, isPrimary: true, buttons: 1, bubbles: true }));
  };
  const loop = now => {
    requestAnimationFrame(loop);
    try {
      if (state.recording && previousTime) state.frames.push(now - previousTime, state.mode === 'track' ? 0 : 1);
      previousTime = now;
      const render = test.views().render;
      const phase = render[22];
      const lives = render[25];
      if (previousLives >= 0 && lives < previousLives && state.recording) {
        const lastHitch = state.hitches[state.hitches.length - 1];
        state.livesLost.push({ at: now, afterHitch: lastHitch && now - lastHitch.at < 1500 ? true : false });
      }
      previousLives = lives;
      if (lives <= 1) test.game.debug_set_lives(5);
      if (phase === 0) { previousBallCount = 0; if (now - lastLaunchAt > 200) { lastLaunchAt = now; test.game.launch(); } return; }
      if (phase === 2) { test.game.next_level(); previousBallCount = 0; return; }
      if (phase === 3) { state.gameOvers++; test.game.restart(); previousBallCount = 0; return; }
      const ballCount = render[2];
      // how far each ball moved since the last frame (big jumps = the ball "teleports")
      if (state.recording && ballCount === previousBallCount) {
        for (let index = 0; index < ballCount; index++) {
          const jump = Math.hypot(render[3 + index * 2] - previousBalls[index * 2], render[4 + index * 2] - previousBalls[index * 2 + 1]);
          if (jump < 200) state.jumps.push(jump, state.mode === 'track' ? 0 : 1);
        }
      }
      // pick the lowest ball that is coming down
      let chosen = -1;
      for (let index = 0; index < ballCount; index++) {
        const y = render[4 + index * 2];
        const isFalling = ballCount === previousBallCount ? y > previousBalls[index * 2 + 1] : true;
        if (isFalling && (chosen < 0 || y > render[4 + chosen * 2])) chosen = index;
      }
      if (chosen < 0) chosen = 0;
      const ballX = render[3 + chosen * 2], ballY = render[4 + chosen * 2];
      const wasAbove = ballCount === previousBallCount && previousBalls[chosen * 2 + 1] < 560;
      for (let index = 0; index < 6; index++) previousBalls[index] = render[3 + index];
      previousBallCount = ballCount;
      const paddleWidth = render[1];
      if (state.mode === 'track') {
        pointer(ballX + Math.sin(now / 900) * paddleWidth * 0.3);
      } else {
        // late catcher: stays ~90 units to the side until the ball is low, then moves under it
        if (ballY < 560) pointer(ballX + (ballX < 240 ? 90 : -90));
        else {
          pointer(ballX);
          if (state.hitchArmed && wasAbove && ballCount === 1) {
            state.hitchArmed = false;
            state.hitches.push({ at: now, livesBefore: lives, ballY });
            const until = performance.now() + 300;
            while (performance.now() < until) { /* the phone freezes */ }
          }
        }
      }
    } catch (error) { state.errors.push(String(error)); }
  };
  requestAnimationFrame(loop);
};

const percentile = (sorted, fraction) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : 0;
const round = value => Math.round(value * 10) / 10;

async function runAtRate(browser, rate) {
  const context = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.addInitScript(reactCommitCounterScript);
  await context.addInitScript(instrumentation);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  const testUrl = `${siteUrl}?breakoutTest=1#/play/breakout`;
  await page.goto(testUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid=breakout]');
  await page.waitForFunction(() => window.__breakoutTest);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await page.evaluate(autopilot);
  await page.evaluate(() => { const game = window.__breakoutTest.game; game.debug_start_level(5); game.debug_set_lives(5); });
  await page.waitForTimeout(1500);
  await browser.startTracing(page, { categories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc'] });
  const startCounters = await page.evaluate(() => ({ ...window.__perfCounters, commits: window.__reactCommits, longTasks: window.__longTasks.length, now: performance.now() }));
  await page.evaluate(() => { window.__autopilot.recording = true; });
  // normal play: multi-ball / wide paddle every 8 s, a later level halfway
  for (let second = 0; second < normalSeconds; second += 1) {
    if (second % 8 === 2) await page.evaluate(kind => window.__breakoutTest.game.debug_power_up(kind), (second / 8) % 2 < 1 ? 1 : 0);
    if (second === Math.floor(normalSeconds / 2)) await page.evaluate(() => window.__breakoutTest.game.debug_start_level(9));
    await page.waitForTimeout(1000);
  }
  const normalCounters = await page.evaluate(() => ({ ...window.__perfCounters, commits: window.__reactCommits, now: performance.now() }));
  // hitch phase: late catching + a 300 ms freeze as the ball comes down
  await page.evaluate(() => { window.__autopilot.mode = 'late'; window.__breakoutTest.game.debug_start_level(3); });
  for (let hitch = 0; hitch < hitchCount; hitch++) {
    await page.evaluate(() => { window.__autopilot.hitchArmed = true; });
    await page.waitForFunction(() => !window.__autopilot.hitchArmed, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  const traceBuffer = await browser.stopTracing();
  if (option('trace', null)) writeFileSync(`${option('trace')}-${rate}x.json`, traceBuffer);
  const trace = JSON.parse(traceBuffer.toString());
  const result = await page.evaluate(({ startCounters }) => {
    const state = window.__autopilot;
    return {
      frames: state.frames, jumps: state.jumps, livesLost: state.livesLost, hitches: state.hitches, errors: state.errors, gameOvers: state.gameOvers,
      longTasks: window.__longTasks.slice(startCounters.longTasks), counters: window.__perfCounters, commits: window.__reactCommits,
    };
  }, { startCounters });
  await context.close();

  const normalFrames = [], hitchFrames = [];
  for (let index = 0; index < result.frames.length; index += 2) (result.frames[index + 1] ? hitchFrames : normalFrames).push(result.frames[index]);
  const normalJumps = [], hitchJumps = [];
  for (let index = 0; index < result.jumps.length; index += 2) (result.jumps[index + 1] ? hitchJumps : normalJumps).push(result.jumps[index]);
  const sorted = [...normalFrames].sort((a, b) => a - b);
  const gcEvents = trace.traceEvents.filter(event => (event.name === 'MinorGC' || event.name === 'MajorGC') && event.ph === 'X');
  let allocatedBytes = 0, lastAfter = null;
  for (const event of [...gcEvents].sort((a, b) => a.ts - b.ts)) {
    const before = event.args?.usedHeapSizeBefore, after = event.args?.usedHeapSizeAfter;
    if (before && lastAfter !== null && before > lastAfter) allocatedBytes += before - lastAfter;
    if (after) lastAfter = after;
  }
  const traceSeconds = (Math.max(...trace.traceEvents.map(event => event.ts || 0)) - Math.min(...trace.traceEvents.filter(event => event.ts).map(event => event.ts))) / 1e6;
  const normalLongTasks = result.longTasks.filter(([start]) => start < normalCounters.now);
  return {
    rate,
    normal: {
      frames: normalFrames.length,
      p50: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)), p99: round(percentile(sorted, 0.99)), max: round(sorted[sorted.length - 1] ?? 0),
      over50: normalFrames.filter(ms => ms > 50).length,
      over50Percent: round(100 * normalFrames.filter(ms => ms > 50).length / Math.max(1, normalFrames.length)),
      longTasks: normalLongTasks.length, longTaskMs: Math.round(normalLongTasks.reduce((sum, [, duration]) => sum + duration, 0)),
      storageWrites: normalCounters.storageWrites - startCounters.storageWrites,
      oscillators: normalCounters.oscillators - startCounters.oscillators,
      reactCommits: normalCounters.commits - startCounters.commits,
      maxBallJump: round(Math.max(0, ...normalJumps)),
      livesLost: result.livesLost.filter(loss => loss.at < normalCounters.now).length,
    },
    gc: { events: gcEvents.length, minor: gcEvents.filter(event => event.name === 'MinorGC').length, major: gcEvents.filter(event => event.name === 'MajorGC').length,
      gcMs: Math.round(gcEvents.reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000), allocatedKBPerSecond: round(allocatedBytes / 1024 / Math.max(1, traceSeconds)) },
    hitch: {
      hitches: result.hitches.length,
      livesLostAfterHitch: result.livesLost.filter(loss => loss.afterHitch).length,
      livesLostLatePlay: result.livesLost.filter(loss => loss.at >= normalCounters.now).length,
      maxBallJump: round(Math.max(0, ...hitchJumps)),
    },
    errors: [...result.errors, ...pageErrors],
  };
}

// "software" canvas = what a phone without GPU canvas acceleration does: the canvas is rasterised on the main thread,
// so CPU throttling applies to drawing too (with GPU raster, drawing happens in another process this test can't slow).
const canvasModes = option('canvas', 'gpu,software').split(',');
const results = [];
for (const canvas of canvasModes) {
  const browser = await chromium.launch({ executablePath: chromePath,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', ...(canvas === 'software' ? ['--disable-accelerated-2d-canvas'] : [])] });
  for (const rate of rates) {
    const result = { canvas, ...await runAtRate(browser, rate) };
    results.push(result);
    console.log(`[${label}] ${canvas} canvas, ${rate}x CPU: ${JSON.stringify(result)}`);
  }
  await browser.close();
}
if (jsonPath) writeFileSync(jsonPath, JSON.stringify({ label, siteUrl, results }, null, 2));

if (shouldAssert) {
  let failures = 0;
  const check = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) failures++; };
  for (const { canvas, rate, normal, hitch, errors } of results) {
    const budget = rate <= 4 ? { p95: 40, over50Percent: 2 } : { p95: 55, over50Percent: 6 };
    const where = `${canvas} ${rate}x`;
    check(normal.p95 <= budget.p95, `${where}: frame time p95 ${normal.p95} ms ≤ ${budget.p95} ms (p50 ${normal.p50}, p99 ${normal.p99})`);
    check(normal.over50Percent <= budget.over50Percent, `${where}: frames over 50 ms ${normal.over50Percent}% ≤ ${budget.over50Percent}%`);
    check(normal.storageWrites === 0, `${where}: no localStorage writes while the ball is in play (${normal.storageWrites})`);
    check(normal.reactCommits <= 4, `${where}: React stays idle while playing (${normal.reactCommits} commits)`);
    check(normal.maxBallJump <= 24, `${where}: the ball never jumps more than 24 units between frames (${normal.maxBallJump})`);
    check(hitch.hitches === hitchCount && hitch.livesLostAfterHitch === 0, `${where}: ${hitch.hitches} simulated 300 ms hitches cost ${hitch.livesLostAfterHitch} lives`);
    check(hitch.maxBallJump <= 24, `${where}: no teleport after a hitch (max jump ${hitch.maxBallJump})`);
    check(errors.length === 0, `${where}: no errors (${errors.join(' | ') || 'none'})`);
  }
  console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed');
  process.exit(failures ? 1 : 0);
}
