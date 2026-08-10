import type { Page } from '@playwright/test';

/** Waits for the demo score's SVG to be rendered and interactive. */
export async function waitForScore(page: Page) {
  await page.waitForSelector('.score-viewer svg', { timeout: 15_000 });
}

/** Waits for piano samples to finish loading (enables the Play button). Slower and
 * network-dependent, so only use it in tests that actually exercise playback. */
export async function waitForAudioReady(page: Page) {
  await page.waitForSelector('.transport-controls__play-pause:not([disabled])', { timeout: 40_000 });
}
