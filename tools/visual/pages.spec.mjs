// One baseline screenshot per page, at two widths. Run with --update-snapshots to re-baseline.
import { test, expect } from '@playwright/test';
const PAGES = ['/', '/gatecraft/', '/sandbit/', '/news/'];
for (const path of PAGES) {
  for (const [label, width] of [['desktop', 1280], ['phone', 390]]) {
    test(`${path} ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: 'load' });
      await page.waitForTimeout(2500);
      await expect(page).toHaveScreenshot(`${path.replace(/\//g,'_')}${label}.png`,
        { fullPage: false, animations: 'disabled' });
    });
  }
}
