import { test, expect } from '@playwright/test';
import { waitForScore, waitForAudioReady } from './helpers.js';

test.describe('playback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForScore(page);
    await waitForAudioReady(page);
  });

  test('play button starts playback and highlights notes over time', async ({ page }) => {
    const playPause = page.locator('.transport-controls__play-pause');
    await playPause.click();
    await expect(playPause).toHaveText('Pause');

    // The first note (C4) plus the sustained bass chord should light up almost immediately.
    await expect(page.locator('.note-readout')).toContainText('C4', { timeout: 3_000 });

    // Piece is ~4.8s at the default 100% tempo; it should finish and reset the button.
    await expect(playPause).toHaveText('Play', { timeout: 10_000 });
    await expect(page.locator('.note-readout')).toHaveText('Tap a note or chord above');
  });

  test('tempo slider slows playback down proportionally', async ({ page }) => {
    const slider = page.locator('input[type="range"]');
    await slider.fill('0.5');
    await expect(page.locator('.transport-controls__tempo')).toContainText('Tempo: 50%');

    const playPause = page.locator('.transport-controls__play-pause');
    const start = Date.now();
    await playPause.click();
    // Must actually observe "Pause" first -- otherwise the later "Play" check could pass
    // trivially on the button's already-"Play" pre-click state instead of a real round trip.
    await expect(playPause).toHaveText('Pause');
    await expect(playPause).toHaveText('Play', { timeout: 15_000 });
    const elapsedSeconds = (Date.now() - start) / 1000;

    // Nominal duration is ~4.8s at 100%, so ~9.6s at 50% -- allow generous slack for
    // scheduling/network jitter while still catching a badly broken tempo control.
    expect(elapsedSeconds).toBeGreaterThan(7);
    expect(elapsedSeconds).toBeLessThan(13);
  });

  test('pausing and resuming continues from the paused position instead of restarting', async ({ page }) => {
    const playPause = page.locator('.transport-controls__play-pause');
    await playPause.click();
    await expect(playPause).toHaveText('Pause');

    // Let roughly 1s of the ~4.8s piece play before pausing.
    await page.waitForTimeout(1000);
    await playPause.click();
    await expect(playPause).toHaveText('Play');
    // Pausing should immediately silence whatever was sounding.
    await expect(page.locator('.note-readout')).toHaveText('Tap a note or chord above');

    const resumeStart = Date.now();
    await playPause.click();
    await expect(playPause).toHaveText('Pause');
    await expect(playPause).toHaveText('Play', { timeout: 10_000 });
    const resumeElapsed = (Date.now() - resumeStart) / 1000;

    // Resuming ~1s in should finish well before a fresh 4.8s playthrough would, proving it
    // picked up from the paused position rather than restarting at 0.
    expect(resumeElapsed).toBeLessThan(4.3);
  });

  test('clicking play again after the piece finishes restarts from the beginning', async ({ page }) => {
    const playPause = page.locator('.transport-controls__play-pause');
    await playPause.click();
    await expect(playPause).toHaveText('Pause');
    await expect(playPause).toHaveText('Play', { timeout: 10_000 }); // let it finish naturally

    await playPause.click();
    await expect(playPause).toHaveText('Pause');
    // The very first note (C4) sounding again proves it restarted from 0, rather than being
    // stuck at the end where currentTime() >= durationSeconds forever.
    await expect(page.locator('.note-readout')).toContainText('C4', { timeout: 2_000 });
  });

  test('changing tempo mid-playback keeps playing instead of breaking scheduling', async ({ page }) => {
    const playPause = page.locator('.transport-controls__play-pause');
    const slider = page.locator('input[type="range"]');

    await playPause.click();
    await expect(playPause).toHaveText('Pause');
    await page.waitForTimeout(500);

    await slider.fill('0.5'); // slow down mid-playback

    await expect(playPause).toHaveText('Play', { timeout: 15_000 });
    await expect(page.locator('.note-readout')).toHaveText('Tap a note or chord above');
  });
});
