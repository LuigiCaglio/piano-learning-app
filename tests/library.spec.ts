import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForScore } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'import-fixture.musicxml');
const fixturePath2 = path.join(__dirname, 'fixtures', 'import-fixture-2.musicxml');

test('importing a score adds it to the library, persists, and can be selected or deleted', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  await page.setInputFiles('input[type="file"]', fixturePath);
  await expect(page.locator('.piece-library__item')).toHaveCount(1);
  await expect(page.locator('.piece-library__item')).toContainText('import-fixture');

  // Importing should immediately load the piece.
  await expect(page.locator('.score-viewer text', { hasText: 'Imported Test Piece' })).toBeVisible();
  // ...and replace the demo piece entirely, not render both at once.
  await expect(page.locator('.score-viewer svg')).toHaveCount(1);

  // Persists across a reload (IndexedDB), even though the displayed score resets to the demo.
  await page.reload({ waitUntil: 'load' });
  await waitForScore(page);
  await expect(page.locator('.piece-library__item')).toHaveCount(1);

  // Selecting it from the library loads it again.
  await page.locator('.piece-library__item', { hasText: 'import-fixture' }).click();
  await expect(page.locator('.score-viewer text', { hasText: 'Imported Test Piece' })).toBeVisible();

  // Deleting it removes it from the library.
  await page.locator('.piece-library__delete').click();
  await expect(page.locator('.piece-library__item')).toHaveCount(0);
});

test('importing a second piece keeps both in the library and switches cleanly between them', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  await page.setInputFiles('input[type="file"]', fixturePath);
  await expect(page.locator('.piece-library__item')).toHaveCount(1);
  await expect(page.locator('.score-viewer text', { hasText: 'Imported Test Piece' })).toBeVisible();

  await page.setInputFiles('input[type="file"]', fixturePath2);
  await expect(page.locator('.piece-library__item')).toHaveCount(2);
  // Importing the second piece should load it, and only it -- not both at once.
  await expect(page.locator('.score-viewer text', { hasText: 'Second Imported Piece' })).toBeVisible();
  await expect(page.locator('.score-viewer svg')).toHaveCount(1);

  // Switching back to the first piece via the library shows the first piece only. Titles
  // are matched exactly -- "import-fixture" is a substring of "import-fixture-2" too.
  await page.locator('.piece-library__title', { hasText: /^import-fixture$/ }).click();
  await expect(page.locator('.score-viewer text', { hasText: 'Imported Test Piece' })).toBeVisible();
  await expect(page.locator('.score-viewer text', { hasText: 'Second Imported Piece' })).not.toBeVisible();
  await expect(page.locator('.score-viewer svg')).toHaveCount(1);
});

test('an invalid file shows a load error instead of failing silently', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  await page.setInputFiles('input[type="file"]', {
    name: 'bogus.musicxml',
    mimeType: 'application/xml',
    buffer: Buffer.from('not valid musicxml'),
  });

  await expect(page.locator('.load-error')).toBeVisible();
});
