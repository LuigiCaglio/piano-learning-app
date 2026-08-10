import { test, expect } from '@playwright/test';
import { waitForScore, waitForAudioReady } from './helpers.js';

test('the cursor is hidden until playback starts, and hides again on pause', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  // Sitting on the page before any Play press would look like something is already playing.
  await expect(page.locator('.score-viewer img').first()).not.toBeVisible();

  const playPause = page.locator('.transport-controls__play-pause');
  await playPause.click();
  await expect(playPause).toHaveText('Pause');
  await expect(page.locator('.score-viewer img').first()).toBeVisible();

  await playPause.click(); // pause
  await expect(playPause).toHaveText('Play');
  await expect(page.locator('.score-viewer img').first()).not.toBeVisible();
});

test('the follow-along cursor advances across the score during playback', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  await page.locator('.transport-controls__play-pause').click();
  const cursorImg = page.locator('.score-viewer img').first();
  await expect(cursorImg).toBeVisible();
  const startBox = await cursorImg.boundingBox();
  if (!startBox) throw new Error('cursor not found');

  await page.waitForTimeout(2500);

  const laterBox = await cursorImg.boundingBox();
  if (!laterBox) throw new Error('cursor not found after playback started');

  // The demo piece's second measure sits to the right of the first, so the cursor should
  // have moved rightward (it may also wrap to a new system on narrower viewports, in which
  // case it moves down instead -- either way, it must not still be at the start position).
  const moved = laterBox.x !== startBox.x || laterBox.y !== startBox.y;
  expect(moved).toBe(true);
});
