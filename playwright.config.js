import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: '**/build.spec.js',
  outputDir: 'test-results',
  reporter: 'list',
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: 'http://127.0.0.1:11100',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    timezoneId: 'America/Los_Angeles',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'desktop-landscape',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet-portrait',
      use: { viewport: { width: 820, height: 1180 } },
    },
    {
      name: 'mobile-portrait',
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixels: 0,
      threshold: 0.1,
    },
  },
  snapshotPathTemplate: 'docs/screenshots/{arg}{ext}',
  webServer: {
    command: 'npm run dev -- --port 11100 --strictPort',
    url: 'http://127.0.0.1:11100',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
