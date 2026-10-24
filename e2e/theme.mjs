// Theme settings check: ⚙ top-right on the hub and game pages (desktop + 375 px), switching to Lagoon recolours the page,
// the choice survives a reload (applied by the inline script before the app loads), Esc closes the panel before
// leaving a game, and switching back to Netflix Red works.
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
  const red = await colors(page);
  check(red.theme === 'netflix-red' && red.logo === 'rgb(229, 9, 20)' && red.background === 'rgb(20, 20, 20)', `default is Netflix Red (${JSON.stringify(red)})`);
  await gear.click();
  check(await page.getByTestId('settings-panel').isVisible(), 'gear opens the settings panel');
  check(await gear.getAttribute('aria-expanded') === 'true', 'aria-expanded is true while open');
  check(await page.getByRole('radio', { name: /Netflix Red/ }).getAttribute('aria-checked') === 'true', 'Netflix Red is the checked option');
  await page.waitForTimeout(300); // panel entrance animation
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-theme-red-panel.png` });
  await page.keyboard.press('Escape');
  check(!(await page.getByTestId('settings-panel').isVisible()), 'Esc closes the panel');
  await gear.click();
  await page.getByTestId('theme-lagoon').click();
  await page.waitForTimeout(300); // let the buttons' 150 ms background transition finish
  const lagoon = await colors(page);
  check(lagoon.theme === 'lagoon' && lagoon.background === 'rgb(22, 50, 53)' && lagoon.logo === 'rgb(79, 188, 156)' && lagoon.playButton === 'rgb(239, 202, 124)',
    `Lagoon recolours the page without a reload (${JSON.stringify(lagoon)})`);
  check(lagoon.metaThemeColor === '#163235', 'browser theme-color follows');
  await page.mouse.click(400, 500);
  check(!(await page.getByTestId('settings-panel').isVisible()), 'an outside click closes the panel');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${screenshotDirectory}/kush-games-theme-lagoon-desktop.png` });
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), THEME_KEY);
  check(saved?.version === 1 && saved?.data?.theme === 'lagoon', 'saved as a versioned envelope');

  await page.reload({ waitUntil: 'networkidle' });
  check((await colors(page)).theme === 'lagoon', 'Lagoon persists after a reload');
  // before first paint: with the app's JavaScript blocked, the inline script alone must already apply the theme
  const bare = await desktop.newPage();
  await bare.route(/\/assets\/.*\.js$/, route => route.abort());
  await bare.goto(siteUrl, { waitUntil: 'domcontentloaded' });
  const bareState = await bare.evaluate(() => ({ theme: document.documentElement.dataset.theme, background: getComputedStyle(document.documentElement).getPropertyValue('--background').trim() }));
  check(bareState.theme === 'lagoon', `theme applied by index.html before the app runs (${JSON.stringify(bareState)})`);
  await bare.close();

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

  // switch back
  await visibleGear(page).click();
  await page.getByTestId('theme-netflix-red').click();
  const back = await colors(page);
  check(back.theme === 'netflix-red' && back.background === 'rgb(20, 20, 20)' && back.logo === 'rgb(229, 9, 20)', 'switching back to Netflix Red works');
  await page.reload({ waitUntil: 'networkidle' });
  check((await colors(page)).theme === 'netflix-red', 'Netflix Red persists after a reload');
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
  await mobile.getByTestId('theme-lagoon').tap();
  await mobile.mouse.click(180, 400);
  check(!(await mobile.getByTestId('settings-panel').isVisible()), 'tapping outside closes the panel');
  check((await colors(mobile)).theme === 'lagoon', 'Lagoon on the phone');
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
