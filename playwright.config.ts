import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**'], // Vitest owns tests/unit -- keep it out of Playwright's own collection
  fullyParallel: false, // tests share one piano sample cache; avoid racing first-load fetches
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ipad-landscape',
      use: {
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        isMobile: false,
      },
      testMatch: /tablet\.spec\.ts/,
    },
    {
      name: 'ipad-portrait',
      use: {
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        isMobile: false,
      },
      testMatch: /tablet\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
