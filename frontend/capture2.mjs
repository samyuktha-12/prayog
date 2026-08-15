import { chromium } from 'playwright';
import path from 'path';

const OUT = '/Users/samyukthamohan/Projects/prayog/docs/screenshots';
const BASE = 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (msg) => console.log('PAGE:', msg.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Separation of Substances/i }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Enter the Lab/i }).click();
  await page.waitForSelector('.scene-stage', { timeout: 15000 });
  await page.waitForTimeout(2200); // camera dolly settle

  const beaker = { x: 285, y: 425 };
  const burner = { x: 765, y: 495 };

  // --- Step 1: stir (simple click) ---
  await page.mouse.click(beaker.x, beaker.y);
  await page.waitForTimeout(1800); // stirring animation + onAction

  // --- Step 2: pour (drag beaker > 60px) ---
  await page.mouse.move(beaker.x, beaker.y);
  await page.mouse.down();
  await page.mouse.move(beaker.x + 90, beaker.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1600); // pour + settle -> checkpoint 1 armed
  await page.screenshot({ path: path.join(OUT, '04-scene-checkpoint.png') });

  // --- Answer checkpoint 1 via chat ---
  await page.getByPlaceholder(/Ask a question/i).fill('the sand stayed on the paper');
  await page.getByRole('button', { name: /^Send$/i }).click();
  await page.waitForTimeout(4000); // real Sarvam LLM round trip
  await page.screenshot({ path: path.join(OUT, '05-scene-evaluate.png') });

  // --- Step 3: heat (simple click on burner) ---
  await page.mouse.click(burner.x, burner.y);
  await page.waitForTimeout(2600); // heating animation + onAction -> checkpoint 2 armed
  await page.screenshot({ path: path.join(OUT, '06-scene-checkpoint2.png') });

  // --- Answer checkpoint 2 via chat ---
  await page.getByPlaceholder(/Ask a question/i).fill('it was dissolved in the water all along');
  await page.getByRole('button', { name: /^Send$/i }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, '07-scene-complete.png') });

  // --- Finish & see report ---
  await page.getByRole('button', { name: /Finish & see report/i }).click();
  await page.waitForTimeout(4000); // real sarvam-105b report generation
  await page.screenshot({ path: path.join(OUT, '08-report.png') });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
