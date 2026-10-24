// Draws the ribbon "K" favicon for each colour theme and exports the files in public/:
//   favicon[-lagoon].svg, favicon[-lagoon]-32.png, apple-touch-icon[-lagoon].png (180 px, full-bleed for iOS)
// plus an optional preview sheet. Rasterising uses the same headless Chrome as the e2e checks.
// Usage: node scripts/build-favicons.mjs [previewPng] [referenceImage]
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const THEMES = {
  '': { background: '#050505', bright: '#e5352a', mid: '#c4271e', dark: '#8e1610', deep: '#4a0805' },          // Netflix Red
  '-lagoon': { background: '#163235', bright: '#efca7c', mid: '#d4ad62', dark: '#b08a3e', deep: '#7a5a22' },  // Lagoon
};

/**
 * The ribbon K on a 32-unit grid (traced from the reference: the letter fills y 3.8–28.8). A wide left bar shaded
 * darker toward its right edge; an upper arm that runs behind the junction (deep shadow at its lower end); a wide leg
 * in front, bright at the junction and darker toward the bottom right. The bar and leg have slightly curved bottoms.
 * `crisp` (used for the 16/32 px PNG) trades some shading for contrast: lighter shadows so the arm still shows.
 */
export function kSvg({ background, bright, mid, dark, deep }, { rounded = true, crisp = false } = {}) {
  const armShadow = crisp ? dark : deep;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<defs>
<linearGradient id="bar" x1="7.6" y1="0" x2="13.3" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${bright}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${crisp ? mid : dark}"/></linearGradient>
<linearGradient id="arm" x1="14.6" y1="15.4" x2="20.4" y2="4.6" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${armShadow}"/><stop offset=".45" stop-color="${crisp ? mid : dark}"/><stop offset="1" stop-color="${bright}"/></linearGradient>
<linearGradient id="leg" x1="14.4" y1="13.6" x2="23.6" y2="29.2" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${bright}"/><stop offset=".6" stop-color="${mid}"/><stop offset="1" stop-color="${crisp ? mid : dark}"/></linearGradient>
</defs>
<rect width="32" height="32"${rounded ? ' rx="3.5"' : ''} fill="${background}"/>
<path d="M18.28 3.8H23.88L16.1 16.5 13.28 12.2V11.6Z" fill="url(#arm)"/>
<path d="M7.56 3.8H13.28V28.6Q10.3 28.6 7.56 28.88Z" fill="url(#bar)"/>
<path d="M13.28 12L24.44 28.8Q21.2 28.62 17.96 28.6L13.28 21.2Z" fill="url(#leg)"/>
</svg>
`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });
const page = await browser.newPage();
const dataUri = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const rasterise = (svg, size) => page.evaluate(async ({ uri, size }) => {
  const image = new Image(); image.src = uri; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  canvas.getContext('2d').drawImage(image, 0, 0, size, size);
  return canvas.toDataURL('image/png').split(',')[1];
}, { uri: dataUri(svg), size });

for (const [suffix, palette] of Object.entries(THEMES)) {
  const svg = kSvg(palette);
  writeFileSync(`public/favicon${suffix}.svg`, svg);
  writeFileSync(`public/favicon${suffix}-32.png`, Buffer.from(await rasterise(kSvg(palette, { crisp: true }), 32), 'base64'));
  writeFileSync(`public/apple-touch-icon${suffix}.png`, Buffer.from(await rasterise(kSvg(palette, { rounded: false }), 180), 'base64'));
}

const previewPath = process.argv[2];
if (previewPath) {
  const sizes = [16, 32, 180];
  const rows = [];
  for (const background of ['#ffffff', '#f1f3f4', '#202124', '#000000']) {
    const cells = Object.entries(THEMES).map(([suffix, palette]) => {
      const uri = dataUri(kSvg(palette));
      return `<div style="display:flex;gap:18px;align-items:center">${sizes.map(size => `<img src="${uri}" width="${size}" height="${size}">`).join('')}
        <canvas data-uri="${uri}" data-size="16" width="128" height="128" style="image-rendering:pixelated"></canvas>
        <canvas data-uri="${uri}" data-size="32" width="128" height="128" style="image-rendering:pixelated"></canvas>
        <span style="font:12px sans-serif;color:${background < '#8' ? '#ccc' : '#333'}">${suffix ? 'Lagoon' : 'Netflix Red'}</span></div>`;
    });
    rows.push(`<div style="background:${background};display:flex;gap:40px;padding:14px">${cells.join('')}</div>`);
  }
  const crispRow = Object.entries(THEMES).map(([suffix, palette]) => {
    const uri = dataUri(kSvg(palette, { crisp: true }));
    return `<img src="${uri}" width="16" height="16"><img src="${uri}" width="32" height="32"><canvas data-uri="${uri}" data-size="16" width="128" height="128" style="image-rendering:pixelated"></canvas>`;
  }).join('');
  rows.push(`<div style="background:#202124;display:flex;gap:18px;align-items:center;padding:14px;font:12px sans-serif;color:#ccc">${crispRow}<span>high-contrast variant used for the 32 px PNG fallback</span></div>`);
  const referencePath = process.argv[3];
  const reference = referencePath ? `data:image/png;base64,${readFileSync(referencePath).toString('base64')}` : '';
  rows.push(`<div style="background:#fff;display:flex;gap:24px;padding:14px;align-items:flex-start;font:12px sans-serif">
    <figure style="margin:0"><img src="${dataUri(kSvg(THEMES['']))}" width="512" height="512"><figcaption>new SVG, 512 px</figcaption></figure>
    ${reference ? `<figure style="margin:0"><img src="${reference}" height="512"><figcaption>reference</figcaption></figure>` : ''}</div>`);
  await page.setContent(`<body style="margin:0">${rows.join('')}<div style="font:12px sans-serif;padding:6px 14px">16 · 32 · 180 px, then the 16 px (×8) and 32 px (×4) renderings pixel by pixel</div></body>`);
  await page.evaluate(async () => {
    for (const canvas of document.querySelectorAll('canvas')) {
      const image = new Image(); image.src = canvas.dataset.uri; await image.decode();
      const size = Number(canvas.dataset.size);
      const small = document.createElement('canvas'); small.width = size; small.height = size;
      small.getContext('2d').drawImage(image, 0, 0, size, size);
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false; context.drawImage(small, 0, 0, 128, 128);
    }
  });
  await page.screenshot({ path: previewPath, fullPage: true });
  console.log(`preview: ${previewPath}`);
}
await browser.close();
