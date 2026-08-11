import { test, expect } from '@playwright/test';
import { waitForScore } from './helpers.js';

test('opening a sample piece loads it and adds it to the library', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  await page.locator('.sample-library__toggle').click();
  await page.locator('.sample-library__item', { hasText: 'Ode to Joy' }).click();

  await expect(page.locator('.score-viewer text', { hasText: 'Ode to Joy' })).toBeVisible();
  await expect(page.locator('.load-error')).not.toBeVisible();
  await expect(page.locator('.piece-library__item')).toHaveCount(1);
  await expect(page.locator('.piece-library__item')).toContainText('Ode to Joy');
});

test('every bundled sample loads without a load error', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  for (const title of ['Twinkle, Twinkle, Little Star', 'Ode to Joy', 'Fur Elise']) {
    await page.locator('.sample-library__toggle').click();
    await page.locator('.sample-library__item', { hasText: title }).click();
    await expect(page.locator('.score-viewer text', { hasText: title })).toBeVisible();
    await expect(page.locator('.load-error')).not.toBeVisible();
  }
  // All three are distinct pieces, so the library should hold all three, not overwrite.
  await expect(page.locator('.piece-library__item')).toHaveCount(3);
});

test('re-selecting the same sample reopens it instead of duplicating the library entry', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  await page.locator('.sample-library__toggle').click();
  await page.locator('.sample-library__item', { hasText: 'Fur Elise' }).click();
  await expect(page.locator('.piece-library__item')).toHaveCount(1);

  await page.locator('.sample-library__toggle').click();
  await page.locator('.sample-library__item', { hasText: 'Fur Elise' }).click();
  await expect(page.locator('.piece-library__item')).toHaveCount(1);
});
