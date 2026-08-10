import { test, expect } from '@playwright/test';
import { waitForScore, waitForAudioReady } from './helpers.js';

test('looping a measure range repeats it instead of stopping', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  await page.check('.loop-selector__toggle input[type="checkbox"]');
  const measureInputs = page.locator('.loop-selector__measure-input');
  await measureInputs.nth(0).fill('2');
  await measureInputs.nth(1).fill('2');

  await page.locator('.transport-controls__play-pause').click();

  // Measure 2's melody starts on G4; if looping works, it should recur multiple times
  // within a window that would only fit ~2 passes of a single ~2.4s measure -- and the
  // button must still read "Pause" throughout, since a real loop never reaches "the end".
  let g4Sightings = 0;
  const readouts: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    const readout = (await page.locator('.note-readout').textContent()) ?? '';
    readouts.push(readout);
    if (readout.includes('G4')) g4Sightings++;
  }

  expect(g4Sightings).toBeGreaterThan(1);
  await expect(page.locator('.transport-controls__play-pause')).toHaveText('Pause');

  // Measure 1's melody (which starts on C4) should never appear while looping measure 2 only.
  expect(readouts.some((r) => r.includes('C4'))).toBe(false);
});

test('turning off loop mid-playback lets the piece continue instead of looping forever', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  const toggle = page.locator('.loop-selector__toggle input[type="checkbox"]');
  await toggle.check();
  const measureInputs = page.locator('.loop-selector__measure-input');
  await measureInputs.nth(0).fill('1');
  await measureInputs.nth(1).fill('1');

  const playPause = page.locator('.transport-controls__play-pause');
  await playPause.click();
  await expect(playPause).toHaveText('Pause');

  // Let measure 1 (~2.4s per pass) loop at least once before disabling looping.
  await page.waitForTimeout(3000);
  await expect(playPause).toHaveText('Pause'); // still looping, hasn't reached "the end"

  await toggle.uncheck();

  // With looping off, playback should proceed into measure 2 (G4) and finish normally,
  // rather than continuing to repeat measure 1 forever.
  await expect(page.locator('.note-readout')).toContainText('G4', { timeout: 3_000 });
  await expect(playPause).toHaveText('Play', { timeout: 5_000 });
});
