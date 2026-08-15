import { chromium } from 'playwright';
import path from 'path';

const OUT = '/Users/samyukthamohan/Projects/prayog/docs/screenshots';
const BASE = 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (msg) => console.log('PAGE:', msg.text()));

  // --- Home ---
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '01-home.png') });

  // --- Setup ---
  await page.getByRole('button', { name: /Separation of Substances/i }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '02-setup.png') });

  // --- Enter the Lab -> Scene ---
  await page.getByRole('button', { name: /Enter the Lab/i }).click();
  await page.waitForSelector('.scene-stage', { timeout: 15000 });
  await page.waitForTimeout(2200); // camera dolly settle
  await page.screenshot({ path: path.join(OUT, '03-scene-intro.png') });

  const beaker = { x: 285, y: 425 };
  const burner = { x: 765, y: 495 };

  // --- Step 1: stir ---
  await page.mouse.click(beaker.x, beaker.y);
  await page.waitForTimeout(1800);

  // --- Step 2: pour (drag) ---
  await page.mouse.move(beaker.x, beaker.y);
  await page.mouse.down();
  await page.mouse.move(beaker.x + 90, beaker.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, '04-scene-checkpoint.png') });

  // --- Answer checkpoint 1 ---
  await page.getByPlaceholder(/Ask a question/i).fill('the sand stayed on the paper');
  await page.getByRole('button', { name: /^Send$/i }).click();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(OUT, '05-scene-evaluate.png') });

  // --- Step 3: heat ---
  await page.mouse.click(burner.x, burner.y);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: path.join(OUT, '06-scene-checkpoint2.png') });

  // --- Answer checkpoint 2 ---
  await page.getByPlaceholder(/Ask a question/i).fill('it was dissolved in the water all along');
  await page.getByRole('button', { name: /^Send$/i }).click();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(OUT, '07-scene-complete.png') });

  // --- Finish & see report ---
  await page.getByRole('button', { name: /Finish & see report/i }).click();
  await page.waitForSelector('.report-card', { timeout: 30000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '08-report.png') });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
