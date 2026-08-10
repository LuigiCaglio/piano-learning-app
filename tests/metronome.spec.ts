import { test, expect } from '@playwright/test';
import { waitForScore, waitForAudioReady } from './helpers.js';

test('metronome toggle is present and off by default', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  await expect(page.locator('.transport-controls__metronome input')).not.toBeChecked();
});

test('enabling the metronome adds a count-in delay before the first note on a fresh start', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  const playPause = page.locator('.transport-controls__play-pause');

  // Baseline without the metronome: the first note should appear almost immediately.
  const baselineStart = Date.now();
  await playPause.click();
  await expect(page.locator('.note-readout')).toContainText('C4', { timeout: 3_000 });
  const baselineElapsed = Date.now() - baselineStart;
  await expect(playPause).toHaveText('Play', { timeout: 10_000 }); // let it finish

  // With the metronome on, a fresh start should delay the first note by a ~4-beat count-in
  // (the demo piece is 100bpm/0.6s-per-quarter, so ~2.4s) rather than sounding immediately.
  await page.locator('.transport-controls__metronome input').check();
  const countInStart = Date.now();
  await playPause.click();
  await expect(playPause).toHaveText('Pause');
  await expect(page.locator('.note-readout')).toContainText('C4', { timeout: 6_000 });
  const countInElapsed = Date.now() - countInStart;

  expect(countInElapsed).toBeGreaterThan(baselineElapsed + 1_500);
  expect(countInElapsed).toBeLessThan(4_000);
});

test('does not break playback when toggled on mid-piece', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  const playPause = page.locator('.transport-controls__play-pause');
  await playPause.click();
  await expect(playPause).toHaveText('Pause');
  await page.waitForTimeout(500);

  // Toggling mid-playback should not restart the piece or add a count-in -- just start
  // clicking alongside whatever's already playing.
  await page.locator('.transport-controls__metronome input').check();
  await expect(playPause).toHaveText('Pause');
  await expect(playPause).toHaveText('Play', { timeout: 8_000 }); // still finishes normally
});
