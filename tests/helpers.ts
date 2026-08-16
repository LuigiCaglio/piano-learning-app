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

/** Tempo, metronome, hand selector, and loop selector live inside the practice bar's
 * collapsible section (see App.tsx) -- collapsed by default so Play/Pause and the keyboard stay
 * reachable without scrolling. Tests that interact with any of those controls need this first. */
export async function expandControls(page: Page) {
  await page.locator('.practice-bar__handle').click();
}
