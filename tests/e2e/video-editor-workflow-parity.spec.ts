import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { InMemoryDataProvider } from '@/tools/video-editor/browser-provider';
import type { loadTimelineDraft } from '@/tools/video-editor/data/timelineDraftIndexedDb';

type EvidenceWindow = Window & { editorWorkflowEvidence: {
  provider: InMemoryDataProvider; mediaId: string; importedMediaId: string; galleryMediaId: string;
  writes: Array<{ timelineId: string; expectedVersion: number; acceptedVersion?: number; error?: string }>;
  loadTimelineDraft: typeof loadTimelineDraft; setOffline(value: boolean): void; completeTask(id: string): void;
} };
const fixtureUrl = '/tests/e2e/fixtures/editor-workflows/index.html?localTest=1&localBrowserRender=1';
const execFileAsync = promisify(execFile);
const diagnostics = new WeakMap<Page, { pageErrors: string[]; console: Array<{ level: string; message: string }> }>();
test.beforeEach(async ({ page }) => {
  const events = { pageErrors: [] as string[], console: [] as Array<{ level: string; message: string }> };
  diagnostics.set(page, events);
  page.on('pageerror', error => events.pageErrors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) events.console.push({ level: message.type(), message: message.text() }); });
});
test.afterEach(async ({ page }, testInfo) => {
  await writeFile(testInfo.outputPath('browser-runtime-diagnostics.json'), JSON.stringify(diagnostics.get(page), null, 2));
  expect(diagnostics.get(page)?.pageErrors).toEqual([]);
});

test('full/dialog save, reopen, canonical import, selected agent CAS and host Tasks recovery share authorities', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(fixtureUrl);
  await expect(page.getByTestId('version-full')).toHaveText('1');
  await expect(page.getByTestId('version-dialog')).toHaveText('1');
  await page.getByTestId('fade-full').click();
  await expect(page.getByTestId('result-full')).toContainText('"ok":true');
  await expect(page.getByTestId('version-full')).toHaveText('2');
  await expect(page.getByTestId('save-full')).toHaveText('saved');
  await page.getByTestId('select-dialog').click();
  await expect(page.getByTestId('host-timeline')).toHaveText('workflow-dialog');
  await expect(page.getByTestId('host-project')).toHaveText('demo-project');
  await page.getByTestId('agent-fade').click();
  await expect(page.getByTestId('agent-result')).toContainText('"config_version":2');
  await expect(page.getByTestId('version-dialog')).toHaveText('2');
  const pair = await page.evaluate(async () => {
    const evidence = (window as EvidenceWindow).editorWorkflowEvidence;
    return Promise.all(['workflow-full', 'workflow-dialog'].map(id => evidence.provider.loadTimeline(id)));
  });
  expect(pair[0].config.clips[0]).toEqual(pair[1].config.clips[0]);
  await page.getByTestId('import-dialog').click();
  await expect(page.getByTestId('result-dialog')).toContainText('"ok":true');
  const importedClipId = JSON.parse((await page.getByTestId('result-dialog').textContent())!).data.clipId;
  await expect.poll(async () => Number(await page.getByTestId('version-dialog').textContent())).toBeGreaterThan(2);
  await expect(page.getByTestId('save-dialog')).toHaveText('saved');
  const beforeClose = await page.evaluate(async () => {
    const evidence = (window as EvidenceWindow).editorWorkflowEvidence;
    return { head: await evidence.provider.loadTimeline('workflow-dialog'), registry: await evidence.provider.loadAssetRegistry('workflow-dialog'), importedMediaId: evidence.importedMediaId };
  });
  expect(beforeClose.head.config.clips.find(clip => clip.id === importedClipId)?.asset).toBe('managed-import');
  expect(beforeClose.registry.assets['managed-import']).toMatchObject({ media_id: beforeClose.importedMediaId, generationId: 'generation-import', variantId: 'variant-import' });
  await page.getByTestId('toggle-dialog').click();
  await expect(page.getByTestId('host-timeline')).toHaveText('workflow-full');
  await page.getByTestId('toggle-dialog').click();
  await expect(page.getByTestId('version-dialog')).toHaveText(String(beforeClose.head.configVersion));
  await expect(page.getByTestId('config-dialog')).toContainText(importedClipId);
  const staleResult = await page.evaluate(async () => {
    const evidence = (window as EvidenceWindow).editorWorkflowEvidence;
    const head = await evidence.provider.loadTimeline('workflow-dialog');
    try { await evidence.provider.saveTimeline('workflow-dialog', { ...head.config, clips: [] }, head.configVersion - 1); return 'accepted'; }
    catch (error) { return (error as Error).name; }
  });
  expect(staleResult).toBe('TimelineVersionConflictError');
  const afterStale = await page.evaluate(() => (window as EvidenceWindow).editorWorkflowEvidence.provider.loadTimeline('workflow-dialog'));
  expect(afterStale).toEqual(beforeClose.head);
  await page.getByTestId('select-dialog').click();
  await page.getByTestId('gallery-send').click();
  await expect.poll(() => page.evaluate(async () => {
    const e = (window as EvidenceWindow).editorWorkflowEvidence;
    return Object.values((await e.provider.loadAssetRegistry('workflow-dialog')).assets).find(asset => asset.generationId === 'generation-gallery');
  })).toMatchObject({ media_id: await page.evaluate(() => (window as EvidenceWindow).editorWorkflowEvidence.galleryMediaId) });
  await expect(page.getByTestId('save-dialog')).toHaveText('saved');
  expect(await page.evaluate(async () => Object.values((await (window as EvidenceWindow).editorWorkflowEvidence.provider.loadAssetRegistry('workflow-full')).assets).some(asset => asset.generationId === 'generation-gallery'))).toBe(false);
  await page.getByTestId('admit-task').click();
  await expect(page.getByTestId('task-id')).not.toBeEmpty();
  const taskId = (await page.getByTestId('task-id').textContent())!;
  await expect(page.getByTestId('task-snapshot')).toContainText(taskId);
  await expect(page.getByTestId('task-snapshot')).toContainText('Queued');
  await page.getByTestId('toggle-tasks').click();
  await expect(page.getByTestId('task-snapshot')).toHaveCount(0);
  await page.getByTestId('toggle-dialog').click();
  await page.evaluate(id => (window as EvidenceWindow).editorWorkflowEvidence.completeTask(id), taskId);
  await page.getByTestId('toggle-tasks').click();
  await expect(page.getByTestId('task-snapshot')).toContainText(taskId);
  await page.getByTestId('refresh-tasks').click();
  await expect(page.getByTestId('task-snapshot')).toContainText('Complete');
  await page.getByTestId('toggle-dialog').click();
  await expect(page.getByTestId('config-dialog')).toContainText(importedClipId);
  const evidence = await page.evaluate(async () => {
    const e = (window as EvidenceWindow).editorWorkflowEvidence;
    return { writes: e.writes, head: await e.provider.loadTimeline('workflow-dialog'), registry: await e.provider.loadAssetRegistry('workflow-dialog') };
  });
  await writeFile(testInfo.outputPath('workflow-identity.json'), JSON.stringify(evidence, null, 2));
  await page.screenshot({ path: testInfo.outputPath('saved-reopened-workflow.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('an offline editor draft survives close/reopen and clears only after the save acknowledgment', async ({ page }, testInfo) => {
  await page.goto(fixtureUrl);
  await expect(page.getByTestId('version-dialog')).toHaveText('1');
  await page.evaluate(() => (window as EvidenceWindow).editorWorkflowEvidence.setOffline(true));
  await page.getByTestId('offline-edit-dialog').click();
  await expect(page.getByTestId('result-dialog')).toContainText('"ok":true');
  await expect.poll(() => page.evaluate(async () => {
    const e = (window as EvidenceWindow).editorWorkflowEvidence;
    return (await e.loadTimelineDraft('workflow-dialog'))?.draft.config;
  })).toMatchObject({ clips: [expect.objectContaining({ label: 'Recovered offline clip' })] });
  await expect.poll(() => page.evaluate(() => (window as EvidenceWindow).editorWorkflowEvidence.writes.some(write => write.error === 'Injected offline save'))).toBe(true);
  await page.getByTestId('toggle-dialog').click();
  await page.getByTestId('toggle-dialog').click();
  await expect(page.getByTestId('draft-dialog')).toHaveText('recoverable');
  await expect(page.getByTestId('config-dialog')).not.toContainText('Recovered offline clip');
  await page.screenshot({ path: testInfo.outputPath('recoverable-draft.png'), fullPage: true });
  await page.evaluate(() => (window as EvidenceWindow).editorWorkflowEvidence.setOffline(false));
  await page.getByTestId('retry-draft-dialog').click();
  await expect(page.getByTestId('version-dialog')).toHaveText('2');
  await expect(page.getByTestId('save-dialog')).toHaveText('saved');
  await expect(page.getByTestId('config-dialog')).toContainText('Recovered offline clip');
  await expect.poll(() => page.evaluate(() => (window as EvidenceWindow).editorWorkflowEvidence.loadTimelineDraft('workflow-dialog'))).toBeNull();
  await page.getByTestId('toggle-dialog').click(); await page.getByTestId('toggle-dialog').click();
  await expect(page.getByTestId('config-dialog')).toContainText('Recovered offline clip');
  await expect(page.getByTestId('draft-dialog')).toBeEmpty();
});

test('the explicitly supported local browser renderer exports real media from the same editor', async ({ page }, testInfo) => {
  await page.goto(fixtureUrl);
  await expect(page.getByTestId('version-full')).toHaveText('1');
  const full = page.locator('[data-video-editor-instance="full"]');
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  await full.getByRole('button', { name: 'Render', exact: true }).click();
  await expect(page.getByTestId('render-full')).toHaveText('done', { timeout: 60000 });
  const download = await downloadPromise;
  const output = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(output);
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', output]);
  const metadata = JSON.parse(stdout);
  expect(metadata.streams[0]).toMatchObject({ codec_type: 'video', width: 320, height: 180, nb_read_frames: '12' });
  await writeFile(testInfo.outputPath('ffprobe.json'), stdout);
  await writeFile(testInfo.outputPath('browser-render-log.txt'), (await page.getByTestId('render-log-full').textContent())!);
  await page.screenshot({ path: testInfo.outputPath('browser-export.png'), fullPage: true });
});
