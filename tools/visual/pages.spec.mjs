// One baseline screenshot per page, at two widths. Run with --update-snapshots to re-baseline.
//
// Canvases are masked out. `animations: 'disabled'` only stops CSS animations — a canvas driven by
// JS or WASM keeps painting, so Sandbit's falling sand made its screenshot differ on every run and
// the suite failed at random. Masking covers the canvas with a flat box and compares the chrome
// around it, which is the part a visual regression is actually meant to protect.
import { test, expect } from '@playwright/test';

const PAGES = ['/', '/gatecraft/', '/sandbit/', '/news/'];

for (const path of PAGES) {
  for (const [label, width] of [['desktop', 1280], ['phone', 390]]) {
    test(`${path} ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: 'load' });
      await page.waitForTimeout(2500);
      await expect(page).toHaveScreenshot(`${path.replace(/\//g, '_')}${label}.png`, {
        fullPage: false,
        animations: 'disabled',
        mask: [page.locator('canvas'), page.locator('video')],
      });
    });
  }
}
