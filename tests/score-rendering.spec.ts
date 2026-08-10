import { test, expect } from '@playwright/test';
import { waitForScore } from './helpers.js';

test('renders the demo score on load', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  await expect(page.locator('.app-header h1')).toHaveText('Piano Learning');
  await expect(page.locator('.score-viewer text', { hasText: 'Demo Piece' })).toBeVisible();

  const noteGroups = page.locator('.score-viewer svg g.vf-stavenote');
  await expect(noteGroups).toHaveCount(10);
});

test('piano keyboard renders with no keys highlighted initially', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  await expect(page.locator('.note-readout')).toHaveText('Tap a note or chord above');
});
