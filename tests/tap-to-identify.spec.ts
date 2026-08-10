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

  test('tapping still works correctly after the page has scrolled', async ({ page }) => {
    // Note hit-regions are cached viewport-relative rects; a short viewport forces the page
    // to actually scroll, which is exactly what goes stale without a scroll-triggered rebuild.
    await page.setViewportSize({ width: 800, height: 500 });
    await page.waitForTimeout(400); // let the resize-triggered rebuild settle

    await page.evaluate(() => window.scrollTo(0, 150));
    await page.waitForTimeout(200); // let the scroll-triggered rebuild settle

    const notes = page.locator('.score-viewer svg g.vf-stavenote');
    await notes.nth(0).click();
    await expect(page.locator('.note-readout')).toHaveText('C4');

    // Index 8 is the bass-clef chord -- confirms alignment holds elsewhere on the score too.
    await notes.nth(8).click();
    await expect(page.locator('.note-readout')).toHaveText('C3, E3, G3');
  });

  test('a real touch with natural drift still registers as a tap, not a scroll', async ({ page, context }) => {
    // A genuine finger tap almost never lands perfectly still (unlike a mouse click or
    // page.click()). If the score container claims horizontal touch movement for native
    // panning, the browser cancels the tap as soon as the finger drifts a bit -- this
    // dispatches a real touch sequence via CDP to reproduce that, rather than the
    // higher-level .click() the other tests use.
    const box = await page.locator('.score-viewer svg g.vf-stavenote').nth(0).boundingBox();
    if (!box) throw new Error('note bounding box not found');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    type TouchEventType = 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel';
    const client = await context.newCDPSession(page);
    const dispatch = (type: TouchEventType, px: number, py: number) =>
      client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }],
      });

    await dispatch('touchStart', x, y);
    await dispatch('touchMove', x + 18, y + 12); // ~22px of drift -- realistic for a real tap
    await page.waitForTimeout(30);
    await dispatch('touchEnd', x + 18, y + 12);

    await expect(page.locator('.note-readout')).toHaveText('C4');
  });
});
