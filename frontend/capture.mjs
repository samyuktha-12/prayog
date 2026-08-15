import { chromium } from 'playwright';
import path from 'path';

const OUT = '/Users/samyukthamohan/Projects/prayog/docs/screenshots';
const BASE = 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // --- Home ---
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '01-home.png') });

  // --- Setup (click Chemistry card) ---
  await page.getByRole('button', { name: /Separation of Substances/i }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '02-setup.png') });

  // --- Enter the Lab -> Scene ---
  await page.getByRole('button', { name: /Enter the Lab/i }).click();
  await page.waitForSelector('.scene-stage', { timeout: 15000 });
  // let the camera dolly-in animation finish (1.8s) + canvas settle
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '03-scene-intro.png') });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
