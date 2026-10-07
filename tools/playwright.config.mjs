// Visual regression for the site. Uses the Chrome already installed rather than downloading one.
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './visual',
  use: { channel: 'chrome', baseURL: process.env.BASE_URL || 'https://www.aedinlai.com' },
  expect: { toHaveScreenshot: { maxDiffPixels: 600, threshold: 0.2 } },
  reporter: [['list']],
});
