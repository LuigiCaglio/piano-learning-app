import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const htmlPath = process.argv[2];
const outDir = process.argv[3];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.resolve(htmlPath));
const el = await page.$('#icon');

for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.evaluate((s) => {
    const svg = document.getElementById('icon');
    svg.setAttribute('width', String(s));
    svg.setAttribute('height', String(s));
  }, size);
  await el.screenshot({ path: path.join(outDir, `icon-${size}.png`) });
  console.log(`Rendered icon-${size}.png`);
}

await browser.close();
