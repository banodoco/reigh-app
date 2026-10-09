import { expect, test } from '@playwright/test';
import type { ExtensionContext } from '@/sdk/context';

type FixtureWindow = Window & { editorInstanceEvidence: { contexts: Map<string, ExtensionContext>; released: string[]; commands: string[] } };

test('full and dialog editor lifetimes keep independent roots, commands, selection and renderers', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/tests/e2e/fixtures/editor-instances/index.html?localTest=1');
  const full = page.locator('[data-video-editor-instance="full"]');
  const dialog = page.locator('[data-video-editor-instance="dialog"]');
  await expect(full.getByTestId('renderer-full')).toHaveText('timeline-full');
  await expect(dialog.getByTestId('renderer-dialog')).toHaveText('timeline-dialog');
  await expect(page.getByTestId('host-timeline')).toHaveText('timeline-full');

  await page.getByTestId('select-full').click();
  await expect(page.getByTestId('selection-full')).toHaveText('clip-hero');
  await page.getByTestId('select-dialog').click();
  await expect(page.getByTestId('selection-dialog')).toHaveText('clip-hero');
  await expect(page.getByTestId('selection-full')).toHaveText('clip-hero');
  await page.getByTestId('clear-dialog').click();
  await expect(page.getByTestId('selection-dialog')).toBeEmpty();
  await expect(page.getByTestId('selection-full')).toHaveText('clip-hero');

  await page.evaluate(() => {
    const evidence = (window as FixtureWindow).editorInstanceEvidence;
    evidence.contexts.get('full')!.chrome.announce('Full announcement');
    evidence.contexts.get('dialog')!.chrome.announce('Dialog announcement');
    evidence.contexts.get('dialog')!.chrome.focus('button');
  });
  await expect(full.locator('[data-video-editor-aria-live]')).toHaveText('Full announcement');
  await expect(dialog.locator('[data-video-editor-aria-live]')).toHaveText('Dialog announcement');
  expect(await page.evaluate(() => document.activeElement?.closest('[data-video-editor-instance]')?.getAttribute('data-video-editor-instance'))).toBe('dialog');
  await dialog.focus();
  await page.keyboard.press('Control+k');
  await expect.poll(() => page.evaluate(() => (window as FixtureWindow).editorInstanceEvidence.commands)).toEqual(['timeline-dialog']);
  await full.focus(); await page.keyboard.press('Control+k');
  await expect.poll(() => page.evaluate(() => (window as FixtureWindow).editorInstanceEvidence.commands)).toEqual(['timeline-dialog', 'timeline-full']);
  await page.screenshot({ path: testInfo.outputPath('desktop-two-instances.png'), fullPage: true });

  await dialog.focus(); await page.getByTestId('toggle-dialog').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('host-timeline')).toHaveText('timeline-full');
  await expect(page.getByTestId('selection-full')).toHaveText('clip-hero');
  await expect(full.getByTestId('renderer-full')).toHaveText('timeline-full');
  expect(await page.evaluate(() => (window as FixtureWindow).editorInstanceEvidence.released)).toEqual(['timeline-dialog']);
  await page.getByTestId('toggle-dialog').click();
  await expect(dialog.getByTestId('renderer-dialog')).toHaveText('timeline-dialog');
  await dialog.focus(); await page.getByTestId('update-dialog').click();
  await expect(dialog.getByTestId('renderer-dialog')).toHaveText('timeline-dialog-next');
  await expect(page.getByTestId('host-timeline')).toHaveText('timeline-full');
  await expect(page.getByTestId('selection-full')).toHaveText('clip-hero');
  await full.focus(); await page.keyboard.press('Control+k');
  await expect.poll(() => page.evaluate(() => (window as FixtureWindow).editorInstanceEvidence.commands)).toEqual(['timeline-dialog', 'timeline-full', 'timeline-full']);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(full).toBeVisible(); await expect(dialog).toBeVisible();
  await expect(full.getByRole('button', { name: 'Render', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Render', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('phone-two-instances.png'), fullPage: true });
  expect(errors).toEqual([]);
});
