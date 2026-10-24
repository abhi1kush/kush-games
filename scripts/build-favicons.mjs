// Draws the ribbon "K" favicon for each colour theme and exports the files in public/:
//   favicon[-lagoon].svg, favicon[-lagoon]-32.png, apple-touch-icon[-lagoon].png (180 px, full-bleed for iOS)
// plus an optional preview sheet. Rasterising uses the same headless Chrome as the e2e checks.
// Usage: node scripts/build-favicons.mjs [previewPng]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const THEMES = {
  '': { background: '#141414', stem: '#b1060f', arm: '#c4070f', leg: '#e50914' },          // Netflix Red
  '-lagoon': { background: '#163235', stem: '#b08a3e', arm: '#c9a55c', leg: '#efca7c' },  // Lagoon
};

/**
 * A tall K on a 32-unit grid: the stem and arm are darker ribbons, the bright leg folds over them, and soft shadows
 * mark the folds. Every straight edge sits on an even unit, so the 16 px rendering lands on whole pixels; the letter
 * runs from y 2 to y 30 (one pixel of margin at 16 px).
 */
export function kSvg({ background, stem, arm, leg }, { rounded = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<defs>
<linearGradient id="stemFold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
<linearGradient id="armFold" x1="0" y1="1" x2=".45" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".7" stop-color="#000" stop-opacity="0"/></linearGradient>
</defs>
<rect width="32" height="32"${rounded ? ' rx="6"' : ''} fill="${background}"/>
<path d="M6 2h6v26.8l-6 1.2z" fill="${stem}"/>
<path d="M10 8h2v12H9z" fill="url(#stemFold)"/>
<path d="M12 15 20 2h6L16.4 20z" fill="${arm}"/>
<path d="M12 15 20 2h6L16.4 20z" fill="url(#armFold)"/>
<path d="M6 8h6.4L26 28.8 19.6 30z" fill="${leg}"/>
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
  writeFileSync(`public/favicon${suffix}-32.png`, Buffer.from(await rasterise(svg, 32), 'base64'));
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
