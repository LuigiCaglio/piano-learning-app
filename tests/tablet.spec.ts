import { test, expect } from '@playwright/test';
import { waitForScore } from './helpers.js';

// Runs under the 'ipad-landscape' project (1024x768, touch-enabled) configured in
// playwright.config.ts.

const MIN_TOUCH_TARGET = 40; // slightly under the 44px guideline to allow for antialiasing/rounding

test('key touch targets meet minimum size guidelines', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  const playPause = await page.locator('.transport-controls__play-pause').boundingBox();
  expect(playPause?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

  const importButton = await page.locator('.app-header button', { hasText: 'Import score' }).boundingBox();
  expect(importButton?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

  const sampleToggle = await page.locator('.sample-library__toggle').boundingBox();
  expect(sampleToggle?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

  const loopToggle = await page.locator('.loop-selector__toggle').boundingBox();
  expect(loopToggle?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
});

test('layout does not overflow horizontally at tablet width', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('the score container does not let native touch panning steal taps', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  const touchAction = await page.locator('.score-viewer').evaluate((el) => getComputedStyle(el).touchAction);
  expect(touchAction).toBe('none');
});

test('tapping the score does not flash the default mobile tap-highlight', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  const tapHighlight = await page
    .locator('.score-viewer')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-tap-highlight-color'));
  // Browsers normalize a "transparent" tap-highlight-color to rgba(0, 0, 0, 0).
  expect(tapHighlight).toBe('rgba(0, 0, 0, 0)');
});
