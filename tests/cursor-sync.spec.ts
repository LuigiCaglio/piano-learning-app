import { test, expect } from '@playwright/test';
import { waitForScore, waitForAudioReady } from './helpers.js';

test('the follow-along cursor advances across the score during playback', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  const cursorImg = page.locator('.score-viewer img').first();
  await expect(cursorImg).toBeVisible();
  const startBox = await cursorImg.boundingBox();
  if (!startBox) throw new Error('cursor not found');

  await page.locator('.transport-controls__play-pause').click();
  await page.waitForTimeout(2500);

  const laterBox = await cursorImg.boundingBox();
  if (!laterBox) throw new Error('cursor not found after playback started');

  // The demo piece's second measure sits to the right of the first, so the cursor should
  // have moved rightward (it may also wrap to a new system on narrower viewports, in which
  // case it moves down instead -- either way, it must not still be at the start position).
  const moved = laterBox.x !== startBox.x || laterBox.y !== startBox.y;
  expect(moved).toBe(true);
});
