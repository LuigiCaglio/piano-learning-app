import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForScore, waitForAudioReady } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const singleStaffFixture = path.join(__dirname, 'fixtures', 'import-fixture.musicxml');
const twoStaffFixture = path.join(__dirname, 'fixtures', 'two-staff-fixture.musicxml');

test('hand selector is hidden for a single-staff piece', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  // The demo piece is a grand staff (2 staves), so the selector should be visible there.
  await expect(page.locator('.hand-selector')).toBeVisible();

  await page.setInputFiles('input[type="file"]', singleStaffFixture);
  await expect(page.locator('.score-viewer text', { hasText: 'Imported Test Piece' })).toBeVisible();
  await expect(page.locator('.hand-selector')).toHaveCount(0);
});

test('right-hand-only playback never sounds bass-clef notes', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  await page.locator('.hand-selector__option', { hasText: 'Right hand' }).click();
  await page.locator('.transport-controls__play-pause').click();
  await expect(page.locator('.transport-controls__play-pause')).toHaveText('Pause');

  const readouts: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    readouts.push((await page.locator('.note-readout').textContent()) ?? '');
  }

  // Bass-clef pitches from the demo piece's chords -- none should ever appear.
  const bassNotes = ['C3', 'E3', 'G3', 'F2', 'A2'];
  for (const bassNote of bassNotes) {
    expect(readouts.some((r) => r.includes(bassNote))).toBe(false);
  }
  // Sanity check that the right hand's own melody did actually play.
  expect(readouts.some((r) => r.includes('C4'))).toBe(true);
});

test('left-hand-only playback never sounds treble melody notes', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  await page.locator('.hand-selector__option', { hasText: 'Left hand' }).click();
  await page.locator('.transport-controls__play-pause').click();
  await expect(page.locator('.transport-controls__play-pause')).toHaveText('Pause');

  const readouts: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    readouts.push((await page.locator('.note-readout').textContent()) ?? '');
  }

  const trebleMelodyNotes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  for (const trebleNote of trebleMelodyNotes) {
    expect(readouts.some((r) => r.includes(trebleNote))).toBe(false);
  }
  expect(readouts.some((r) => r.includes('C3'))).toBe(true);
});

test('switching hands mid-playback takes effect immediately', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  const playPause = page.locator('.transport-controls__play-pause');
  await page.locator('.hand-selector__option', { hasText: 'Right hand' }).click();
  await playPause.click();
  await expect(playPause).toHaveText('Pause');
  await page.waitForTimeout(500);

  // Switch to left hand mid-playback -- it should keep playing (not stop), and the readout
  // should move to bass-clef content rather than continuing the right-hand-only schedule.
  await page.locator('.hand-selector__option', { hasText: 'Left hand' }).click();
  await expect(playPause).toHaveText('Pause');

  const readoutsAfterSwitch: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(400);
    readoutsAfterSwitch.push((await page.locator('.note-readout').textContent()) ?? '');
  }
  const trebleMelodyNotes = ['D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
  for (const trebleNote of trebleMelodyNotes) {
    expect(readoutsAfterSwitch.some((r) => r.includes(trebleNote))).toBe(false);
  }
});

test('tapping a note only shows the active hand\'s notes when a hand filter is set', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  // Index 8 is the bass-clef whole-note chord in measure 1 (C3+E3+G3), which shares beat 1
  // with the treble melody's first note (C4, index 0) -- tapping it with no hand filter
  // surfaces all four pitches (see tap-to-identify.spec.ts). With a hand filter active, only
  // that hand's notes at the beat should show.
  await page.locator('.hand-selector__option', { hasText: 'Right hand' }).click();
  await page.locator('.score-viewer svg g.vf-stavenote').nth(8).click();
  await expect(page.locator('.note-readout')).toHaveText('C4');

  await page.locator('.hand-selector__option', { hasText: 'Left hand' }).click();
  await page.locator('.score-viewer svg g.vf-stavenote').nth(8).click();
  await expect(page.locator('.note-readout')).toHaveText('C3, E3, G3');
});

test('resets to "both hands" when a different piece is opened', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  await page.locator('.hand-selector__option', { hasText: 'Right hand' }).click();
  await expect(page.locator('.hand-selector__option--active')).toHaveText('Right hand');

  // Opening a different multi-staff piece should reset the filter rather than carrying the
  // previous piece's "right hand" selection over to one the user hasn't chosen it for.
  await page.setInputFiles('input[type="file"]', twoStaffFixture);
  await expect(page.locator('.score-viewer text', { hasText: 'Two Staff Fixture' })).toBeVisible();
  await expect(page.locator('.hand-selector')).toBeVisible();
  await expect(page.locator('.hand-selector__option--active')).toHaveText('Both hands');
});
