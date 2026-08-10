import { test, expect } from '@playwright/test';
import { waitForScore } from './helpers.js';

test.describe('tap-to-identify', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForScore(page);
  });

  test('tapping a single note shows its name and highlights the key', async ({ page }) => {
    const notes = page.locator('.score-viewer svg g.vf-stavenote');
    await notes.nth(0).click();

    await expect(page.locator('.note-readout')).toHaveText('C4');
    // Klavier renders the active key's label; confirm the note is actually lit up, not just
    // reflected in the text readout above the keyboard.
    await expect(page.locator('.piano-keyboard__label')).toHaveText('C4');
  });

  test('tapping a chord shows every pitch in it', async ({ page }) => {
    const notes = page.locator('.score-viewer svg g.vf-stavenote');
    // Index 8 is the bass-clef whole-note chord in measure 1 (C3+E3+G3).
    await notes.nth(8).click();

    await expect(page.locator('.note-readout')).toHaveText('C3, E3, G3');
    await expect(page.locator('.piano-keyboard__label')).toHaveCount(3);
  });

  test('a near-miss tap (fat-finger touch) still registers via tap tolerance', async ({ page }) => {
    const firstNote = page.locator('.score-viewer svg g.vf-stavenote').nth(0);
    const box = await firstNote.boundingBox();
    if (!box) throw new Error('note bounding box not found');

    // 12px outside the note's own glyph, well within the tolerance radius.
    await page.mouse.click(box.x - 12, box.y - 12);
    await expect(page.locator('.note-readout')).toHaveText('C4');
  });

  test('a tap far from any note does not change the current selection', async ({ page }) => {
    const notes = page.locator('.score-viewer svg g.vf-stavenote');
    await notes.nth(0).click();
    await expect(page.locator('.note-readout')).toHaveText('C4');

    const box = await notes.nth(0).boundingBox();
    if (!box) throw new Error('note bounding box not found');
    await page.mouse.click(box.x - 100, box.y - 100);

    await expect(page.locator('.note-readout')).toHaveText('C4');
  });
});
