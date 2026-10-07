import { expect, test } from '@playwright/test';

test('loads the unauthenticated home route', async ({ page }) => {
  const response = await page.goto('/home', { waitUntil: 'domcontentloaded' });

  expect(response?.ok()).toBe(true);
  await expect(page.locator('#root')).toBeAttached();
  // The public entry is a deliberate async boundary; wait for its committed surface
  // before asserting document visibility on a cold Vite transform.
  await expect(page.locator('main.astrid-public-site')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});
