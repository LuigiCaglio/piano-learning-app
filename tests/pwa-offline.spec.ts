import { test, expect } from '@playwright/test';
import { waitForScore, waitForAudioReady } from './helpers.js';

test('registers a service worker with a valid manifest', async ({ page }) => {
  await page.goto('/');
  await waitForScore(page);

  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15_000 });

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const manifest = await page.evaluate(async (href) => {
    const res = await fetch(href!);
    return res.json();
  }, manifestHref);

  expect(manifest.name).toBe('Piano Learning');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test('the app shell loads while offline', async ({ page, context }) => {
  await page.goto('/');
  await waitForScore(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15_000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });

  await expect(page.locator('.app-header h1')).toHaveText('Piano Learning');
  await expect(page.locator('.score-viewer svg')).toBeVisible();

  await context.setOffline(false);
});

test('piano audio works offline after one prior online session', async ({ page, context }) => {
  await page.goto('/');
  await waitForScore(page);
  await waitForAudioReady(page);

  // Play once online so smplr's CacheStorage-backed sample cache gets populated.
  const playPause = page.locator('.transport-controls__play-pause');
  await playPause.click();
  await expect(playPause).toHaveText('Play', { timeout: 15_000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });

  await waitForAudioReady(page); // should now resolve from the cache, no network needed
  await expect(page.locator('.transport-controls__error')).toHaveCount(0);

  await context.setOffline(false);
});
