import {expect,test,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

type EvidenceWindow = Window & {productionWidgetEvidence:any};
const diagnostic = new WeakMap<Page,{errors:string[];console:Array<{level:string;text:string}>}>();
test.beforeEach(async({page})=>{
 const logs={errors:[] as string[],console:[] as Array<{level:string;text:string}>};diagnostic.set(page,logs);
 page.on('pageerror',e=>logs.errors.push(e.message));page.on('console',e=>{if(['error','warning'].includes(e.type()))logs.console.push({level:e.type(),text:e.text()});});
 await page.setViewportSize({width:1440,height:1100});
 // Native image elements do not call window.fetch; serve the same canonical PNG bytes.
 await page.route('**/api/runtime/v1/objects/**',async route=>{const dataUrl=await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.galleryUrl);await route.fulfill({status:200,contentType:'image/png',body:Buffer.from(dataUrl.split(',')[1],'base64')});});
});
test.afterEach(async({page},info)=>{
 await writeFile(info.outputPath('browser-diagnostics.json'),JSON.stringify(diagnostic.get(page),null,2));
 await page.screenshot({path:info.outputPath('production-widgets.png'),fullPage:true});
 expect(diagnostic.get(page)?.errors).toEqual([]);
});
async function open(page:Page,sameProject:boolean){
 await page.goto(`/tests/e2e/fixtures/production-widget-scope/index.html?localTest=1&sameProject=${sameProject?'1':'0'}`);
 await expect(page.getByTestId('version-full')).toHaveText('1');await expect(page.getByTestId('version-dialog')).toHaveText('1');
 await page.getByTestId('select-dialog').click();await expect(page.getByTestId('host-timeline')).toHaveText('workflow-dialog');
}
async function gallerySend(page:Page){
 const item=page.locator('[data-testid="generations-pane"] [data-gallery-item-id]').first();await expect(item).toBeVisible();await item.click();
 await page.getByTestId('add-selected-generation-to-timeline').click();
}
for(const sameProject of [true,false]){
 test(`production Gallery targets selected dialog with route A (${sameProject?'same':'different'} project) and captures pending load`,async({page},info)=>{
  await open(page,sameProject);
  await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.setMediaPending(true));
  await expect(page.locator('[data-testid="generations-pane"] [data-gallery-item-id]').first()).toBeVisible();
  await page.screenshot({path:info.outputPath('selected-dialog-gallery.png'),fullPage:true});
  await gallerySend(page);
  await expect.poll(()=>page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.loads.length)).toBe(1);
  await expect(page.getByTestId('route')).toContainText('runtimeProject=project-a');await expect(page.getByTestId('route')).toContainText('timeline=workflow-full');
  await page.getByTestId('select-full').click();await expect(page.getByTestId('host-timeline')).toHaveText('workflow-full');
  await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.releaseMedia());
  await expect.poll(()=>page.evaluate(async()=>{const e=(window as EvidenceWindow).productionWidgetEvidence;return Object.values((await e.provider.loadAssetRegistry('workflow-dialog')).assets).find((a:any)=>a.generationId===e.loads[0]?.generationId);})).toMatchObject({media_id:await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.galleryMediaId)});
  await expect(page.getByTestId('save-dialog')).toHaveText('saved');
  const importedAssetId = await page.evaluate(async()=>{const e=(window as EvidenceWindow).productionWidgetEvidence;return Object.entries((await e.provider.loadAssetRegistry('workflow-dialog')).assets).find(([,a]:any)=>a.generationId===e.loads[0].generationId)?.[0];});
  expect(importedAssetId).toBeTruthy();
  await page.getByTestId('toggle-dialog').click();await page.getByTestId('toggle-dialog').click();
  await expect(page.getByTestId('config-dialog')).toContainText(importedAssetId!);
  const evidence=await page.evaluate(async()=>{const e=(window as EvidenceWindow).productionWidgetEvidence;return {route:document.querySelector('[data-testid="route"]')?.textContent,galleryMediaId:e.galleryMediaId,variantIdentities:e.variantIdentities,loads:e.loads,requests:e.requests,writes:e.writes,full:await e.provider.loadAssetRegistry('workflow-full'),dialog:await e.provider.loadAssetRegistry('workflow-dialog'),head:await e.provider.loadTimeline('workflow-dialog')};});
  expect(Object.values(evidence.full.assets).some((a:any)=>a.generationId===evidence.loads[0].generationId)).toBe(false);
  expect(evidence.variantIdentities.some((variant:any)=>variant.project===evidence.loads[0].project&&variant.object_id===evidence.galleryMediaId)).toBe(true);
  expect(evidence.loads).toEqual([{instance:'dialog',project:sameProject?'project-a':'project-b',generationId:sameProject?expect.any(String):'generation-project-b'}]);
  expect(evidence.route).toBe('/tools/video-editor?localTest=1&runtime=1&runtimeProject=project-a&runtimeTimeline=workflow-full&timeline=workflow-full');
  expect(evidence.head.configVersion).toBeGreaterThan(1);
  expect(evidence.writes.every((w:any)=>w.timelineId==='workflow-dialog')).toBe(true);
  await writeFile(info.outputPath('gallery-captured-scope.json'),JSON.stringify(evidence,null,2));
 });
 test(`production Tasks selects dialog query and captured managed-output action (${sameProject?'same':'different'} project)`,async({page},info)=>{
  await open(page,sameProject);
  await expect.poll(()=>page.evaluate((project)=>(window as EvidenceWindow).productionWidgetEvidence.requests.some((r:any)=>r.path===`/api/runtime/v1/projects/${project}/tasks`),sameProject?'project-a':'project-b')).toBe(true);
  await page.getByRole('button',{name:/Show succeeded tasks/}).click();
  const ids=await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.admitted);
  await expect(page.locator(`[data-runtime-task-id="${ids.dialog}"]`)).toBeVisible();
  await expect(page.getByRole('button',{name:`Export Runtime managed output for task ${ids.dialog}`})).toBeVisible();
  await expect(page.getByRole('button',{name:`Export Runtime managed output for task ${ids.full}`})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('selected-dialog-tasks.png'),fullPage:true});
  await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.setTaskPending(true));
  await page.getByRole('button',{name:`Export Runtime managed output for task ${ids.dialog}`}).click();
  await expect.poll(()=>page.evaluate((id)=>(window as EvidenceWindow).productionWidgetEvidence.requests.some((r:any)=>r.path===`/api/runtime/v1/tasks/${id}`),ids.dialog)).toBe(true);
  await page.getByTestId('select-full').click();
  await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.releaseTask());
  await expect.poll(()=>page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.exports.length)).toBe(1);
  const evidence=await page.evaluate(() => {const e=(window as EvidenceWindow).productionWidgetEvidence;return {exports:e.exports,requests:e.requests,admitted:e.admitted};});
  expect(evidence.exports[0].receipt.receipt.receipt_id).toBe('selected-export');
  expect(evidence.exports[0].receipt.data.task_id).toBe(ids.dialog);
  expect(evidence.exports[0].body.expected).toMatchObject({project_id:sameProject?'project-a':'project-b',task_id:ids.dialog,association_id:'output-dialog',filename:'dialog.mp4'});
  await writeFile(info.outputPath('tasks-captured-scope.json'),JSON.stringify(evidence,null,2));
 });
}
test('production Tasks recovers same admitted task after Widgets and editor close/reopen with background completion',async({page},info)=>{
 await open(page,false);const ids=await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.admitted);
 await page.getByRole('button',{name:/Show processing tasks/}).click();
 await expect(page.locator(`[data-runtime-task-id="${ids.background}"]`)).toContainText('running');
 await page.getByTestId('toggle-widgets').click();await expect(page.locator('[data-runtime-task-list]')).toHaveCount(0);
 await page.getByTestId('toggle-dialog').click();await expect(page.getByTestId('host-timeline')).toHaveText('workflow-full');
 expect(await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.backgroundState())).toBe('running');
 await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.completeBackground());
 await page.getByTestId('toggle-dialog').click();await page.getByTestId('select-dialog').click();await page.getByTestId('toggle-widgets').click();
 await page.evaluate(()=>(window as EvidenceWindow).productionWidgetEvidence.refreshTasks());
 await page.getByRole('button',{name:/Show succeeded tasks/}).click();
 await expect(page.locator(`[data-runtime-task-id="${ids.background}"]`)).toContainText('succeeded');
 await expect(page.getByRole('button',{name:`Export Runtime managed output for task ${ids.background}`})).toBeVisible();
 const evidence=await page.evaluate(()=>{const e=(window as EvidenceWindow).productionWidgetEvidence;return {admitted:e.admitted,requests:e.requests};});
 expect(evidence.requests.filter((r:any)=>r.path.includes('/cancel'))).toEqual([]);
 expect(evidence.requests.filter((r:any)=>r.method==='POST'&&r.path.endsWith('/v1/tasks'))).toHaveLength(3);
 await writeFile(info.outputPath('task-lifetime.json'),JSON.stringify(evidence,null,2));
});
