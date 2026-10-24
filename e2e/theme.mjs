// Theme settings check: ⚙ top-right on the hub and game pages (desktop + 375 px); a fresh visitor gets Lagoon and the
// green K; picking Netflix Red recolours the page and the favicon, survives a reload (applied by the inline script before
// the app loads); Esc closes the panel before leaving a game; switching back to Lagoon works.
// Usage: node e2e/theme.mjs [siteUrl] [screenshotDirectory]
import { chromium } from 'playwright-core';

const siteUrl = process.argv[2] ?? 'https://abhi1kush.github.io/kush-games/';
const screenshotDirectory = process.argv[3] ?? '/workspace';
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const THEME_KEY = 'kush-games:theme:save:v1';
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
};
const pageErrors = [];
const watchErrors = page => {
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
};
const colors = page => page.evaluate(() => ({
  theme: document.documentElement.dataset.theme ?? 'netflix-red',
  background: getComputedStyle(document.body).backgroundColor,
  logo: getComputedStyle(document.querySelector('.nav__logo')).color,
  playButton: document.querySelector('.hero .button--play') ? getComputedStyle(document.querySelector('.hero .button--play')).backgroundColor : null,
  metaThemeColor: document.querySelector('meta[name="theme-color"]').content,
}));
const iconHrefs = page => page.evaluate(() => ['favicon-png', 'favicon-svg', 'apple-touch-icon'].map(id => document.getElementById(id).getAttribute('href') ?? ''));
const iconsAre = (hrefs, suffix) => hrefs.length === 3 && hrefs.every(href => href.includes('v=5') && (suffix ? href.includes(suffix) : !href.includes('-lagoon')));
const allServed = (page, hrefs) => page.evaluate(async list => (await Promise.all(list.map(href => fetch(href).then(response => response.status)))).every(status => status === 200), hrefs);
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const visibleGear = page => page.locator('.nav [data-testid=settings-button]');
const playerGear = page => page.locator('.player [data-testid=settings-button]');

const browser = await chromium.launch({ executablePath: chromePath });
try {
  // ---------- desktop ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  watchErrors(page);
  await page.goto(siteUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  const gear = visibleGear(page);
  const gearBox = await gear.boundingBox();
  check(gearBox && gearBox.x + gearBox.width > 1280 - 90 && gearBox.y < 60, `gear top-right on desktop (${Math.round(gearBox?.x)}, ${Math.round(gearBox?.y)})`);
  check(gearBox.width >= 40 && gearBox.height >= 40, `gear tap target ${gearBox.width}×${gearBox.height}`);
  // a fresh visitor (nothing saved) gets Lagoon and the green K
  const fresh = await colors(page);
  check(fresh.theme === 'lagoon' && fresh.background === 'rgb(22, 50, 53)' && fresh.logo === 'rgb(79, 188, 156)' && fresh.playButton === 'rgb(239, 202, 124)' && fresh.metaThemeColor === '#163235',
    `default for a fresh visitor is Lagoon (${JSON.stringify(fresh)})`);
  const lagoonIcons = await iconHrefs(page);
  check(iconsAre(lagoonIcons, '-lagoon'), `Lagoon K favicon links by default (${lagoonIcons.join(', ')})`);
  check(await allServed(page, lagoonIcons), 'Lagoon favicon files return 200');
  check(await page.evaluate(key => localStorage.getItem(key), THEME_KEY) === null, 'nothing saved until a theme is picked');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-lagoon-default.png` });
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-theme-lagoon-desktop.png` });
  await gear.click();
  check(await page.getByTestId('settings-panel').isVisible(), 'gear opens the settings panel');
  check(await gear.getAttribute('aria-expanded') === 'true', 'aria-expanded is true while open');
  check(await page.getByRole('radio', { name: /Lagoon/ }).getAttribute('aria-checked') === 'true', 'Lagoon is the checked option');
  check(await page.getByRole('radio', { name: /Lagoon/ }).textContent().then(text => text.includes('default')), 'Lagoon is marked as the default');
  await page.keyboard.press('Escape');
  check(!(await page.getByTestId('settings-panel').isVisible()), 'Esc closes the panel');

  // pick Netflix Red explicitly
  await gear.click();
  await page.getByTestId('theme-netflix-red').click();
  await page.waitForTimeout(300); // let the buttons' 150 ms background transition finish
  const red = await colors(page);
  check(red.theme === 'netflix-red' && red.background === 'rgb(20, 20, 20)' && red.logo === 'rgb(229, 9, 20)',
    `Netflix Red recolours the page without a reload (${JSON.stringify(red)})`);
  check(red.metaThemeColor === '#141414', 'browser theme-color follows');
  const redIcons = await iconHrefs(page);
  check(iconsAre(redIcons, ''), `favicon switches to the red K instantly (${redIcons.join(', ')})`);
  check(await allServed(page, redIcons), 'red favicon files return 200');
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-theme-red-panel.png` });
  await page.mouse.click(400, 500);
  check(!(await page.getByTestId('settings-panel').isVisible()), 'an outside click closes the panel');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), THEME_KEY);
  check(saved?.version === 1 && saved?.data?.theme === 'netflix-red', 'the explicit Netflix Red choice is saved as a versioned envelope');
  await page.reload({ waitUntil: 'networkidle' });
  check((await colors(page)).theme === 'netflix-red', 'a saved Netflix Red survives a reload');
  check(iconsAre(await iconHrefs(page), ''), 'red favicon after a reload');
  // before first paint: with the app's JavaScript blocked, the inline script alone must apply the saved choice
  const bare = await desktop.newPage();
  await bare.route(/\/assets\/.*\.js$/, route => route.abort());
  await bare.goto(siteUrl, { waitUntil: 'domcontentloaded' });
  const bareState = await bare.evaluate(() => ({ theme: document.documentElement.dataset.theme, themeColor: document.querySelector('meta[name="theme-color"]').content }));
  check(bareState.theme === 'netflix-red' && bareState.themeColor === '#141414', `saved red applied by index.html before the app runs (${JSON.stringify(bareState)})`);
  check(iconsAre(await iconHrefs(bare), ''), 'red favicon set by index.html before the app runs');
  await bare.close();

  // back to Lagoon
  await visibleGear(page).click();
  await page.getByTestId('theme-lagoon').click();
  const back = await colors(page);
  check(back.theme === 'lagoon' && back.background === 'rgb(22, 50, 53)' && back.logo === 'rgb(79, 188, 156)', 'switching back to Lagoon works');
  check(iconsAre(await iconHrefs(page), '-lagoon'), 'favicon switches back to the green K');
  await page.mouse.click(400, 500);
  await page.reload({ waitUntil: 'networkidle' });
  check((await colors(page)).theme === 'lagoon' && iconsAre(await iconHrefs(page), '-lagoon'), 'Lagoon and its favicon after a reload');

  // game page: gear in the player bar; Esc closes the panel first, then the next Esc goes back to the hub
  await page.goto(`${siteUrl}#/play/connect-four`, { waitUntil: 'networkidle' });
  await page.getByTestId('player').waitFor();
  const gameGear = playerGear(page);
  const gameGearBox = await gameGear.boundingBox();
  check(gameGearBox && gameGearBox.x + gameGearBox.width > 1280 - 60 && gameGearBox.y < 60, 'gear top-right on the game page');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-theme-lagoon-game.png` });
  await gameGear.click();
  await page.keyboard.press('Escape');
  check(!(await page.getByTestId('settings-panel').isVisible()) && await page.getByTestId('player').isVisible(), 'Esc on a game page closes the panel and stays in the game');
  await page.keyboard.press('Escape');
  // (navigation goes through a hashchange event, so give it a moment)
  check(await page.getByTestId('player').waitFor({ state: 'detached', timeout: 3000 }).then(() => true, () => false), 'the next Esc still goes back to the hub');
  await desktop.close();

  // ---------- phone ----------
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await phone.newPage();
  watchErrors(mobile);
  await mobile.goto(siteUrl, { waitUntil: 'networkidle' });
  const mobileGear = visibleGear(mobile);
  const mobileGearBox = await mobileGear.boundingBox();
  check(mobileGearBox && mobileGearBox.x + mobileGearBox.width <= 375 && mobileGearBox.x + mobileGearBox.width > 375 - 40 && mobileGearBox.y < 60, `gear top-right at 375 px (${Math.round(mobileGearBox?.x)}, ${Math.round(mobileGearBox?.y)})`);
  check(mobileGearBox.width >= 40 && mobileGearBox.height >= 40, 'gear tap target ≥ 40 px on a phone');
  const navHeight = await mobile.evaluate(() => document.querySelector('.nav').getBoundingClientRect().height);
  check(navHeight < 80, `nav stays one compact bar (${Math.round(navHeight)} px)`);
  check(await noOverflow(mobile), 'no horizontal scroll at 375 px');
  await mobileGear.tap();
  const panelBox = await mobile.getByTestId('settings-panel').boundingBox();
  check(panelBox.x >= 0 && panelBox.x + panelBox.width <= 375, 'panel fits the phone screen');
  await mobile.mouse.click(180, 400);
  check(!(await mobile.getByTestId('settings-panel').isVisible()), 'tapping outside closes the panel');
  check((await colors(mobile)).theme === 'lagoon', 'Lagoon by default on the phone');
  check(await noOverflow(mobile), 'still no horizontal scroll in Lagoon');
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: `${screenshotDirectory}/kush-games-theme-lagoon-mobile.png` });
  await mobile.goto(`${siteUrl}#/play/kush-jump`, { waitUntil: 'networkidle' });
  const playerGearBox = await playerGear(mobile).boundingBox();
  check(playerGearBox && playerGearBox.x + playerGearBox.width <= 375 && await noOverflow(mobile), 'game page bar fits at 375 px with the gear');
  await phone.close();
} finally {
  await browser.close();
}
check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.slice(0, 3).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
