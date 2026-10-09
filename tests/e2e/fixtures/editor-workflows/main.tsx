import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { AgentChatProvider, useAgentChatBridge, useAgentChatRegistry } from '@/shared/contexts/AgentChatContext';
import { activateTimelineClipData } from '@/shared/state/selectionStore';
import { BrowserVideoEditor } from '@/tools/video-editor/browser/BrowserVideoEditor';
import { InMemoryDataProvider, createVideoEditorEffectCatalog } from '@/tools/video-editor/browser-provider';
import { createEmbedDemoTimelineFixture } from '@/tools/video-editor/testing';
import { TimelineEditorShellCore } from '@/tools/video-editor/components/TimelineEditorShellCore';
import { PUBLIC_TIMELINE_SERVICE_HOOKS } from '@/tools/video-editor/runtime/timelineHostServiceHooks';
import type { VideoEditorScopedServices } from '@/tools/video-editor/browser/scopedServices';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext';
import { useTimelineChromeContext, useTimelineConfigVersion, useTimelineEditorData, useTimelineEditorOps } from '@/tools/video-editor/hooks/timelineStore';
import { useTimelineCommandsService } from '@/tools/video-editor/hooks/useTimelineCommandsService';
import { loadTimelineDraft } from '@/tools/video-editor/data/timelineDraftIndexedDb';
import { AuthProvider } from '@/shared/contexts/AuthContext';
import { UserSettingsProvider } from '@/shared/contexts/UserSettingsContext';
import { ProjectProvider } from '@/shared/contexts/ProjectContext';
import { ShotsContextProvider } from '@/shared/contexts/ShotsContext';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { useBridgeTaskSnapshot } from '@/shared/hooks/tasks/useBridgeTaskSnapshot';
import { createTask } from '@/shared/lib/taskCreation/createTask';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { createFakeBridgeRouter } from '@/test/fakeBridgeRouter';
import '@/index.css';

// Fixture media, network and failure injection only. All timeline, draft,
// agent, selection, render and task operations use the production services.
const pngCanvas = document.createElement('canvas');
pngCanvas.width = 320; pngCanvas.height = 180;
const painter = pngCanvas.getContext('2d')!;
painter.fillStyle = '#426776'; painter.fillRect(0, 0, 320, 180);
const mediaUrl = pngCanvas.toDataURL('image/png');
async function objectIdentity(url: string) {
  const bytes = await (await originalDataFetch(url)).arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
const originalDataFetch = window.fetch.bind(window);
const mediaId = await objectIdentity(mediaUrl);
painter.fillStyle = '#774266'; painter.fillRect(0, 0, 320, 180);
const importedUrl = pngCanvas.toDataURL('image/png');
const importedMediaId = await objectIdentity(importedUrl);
painter.fillStyle = '#42774a'; painter.fillRect(0, 0, 320, 180);
const galleryUrl = pngCanvas.toDataURL('image/png');
const galleryMediaId = await objectIdentity(galleryUrl);
const fixture = createEmbedDemoTimelineFixture();
const seed = {
  configVersion: fixture.configVersion,
  registry: { assets: { 'demo-hero': { file: 'workflow.png', media_id: mediaId, type: 'image/png', duration: 0.4, generationId: 'generation-workflow' } } },
  config: { ...fixture.config, theme: undefined, theme_overrides: { visual: { canvas: { width: 320, height: 180, fps: 30 } } }, output: { ...fixture.config.output, resolution: '320x180', fps: 30, file: 'workflow.mp4' }, clips: [{ ...fixture.config.clips[0], hold: 0.4 }] },
};
const writes: Array<{ timelineId: string; expectedVersion: number; acceptedVersion?: number; error?: string }> = [];
let offline = false;
class WorkflowDataProvider extends InMemoryDataProvider {
  override async saveTimeline(...args: Parameters<InMemoryDataProvider['saveTimeline']>) {
    const event = { timelineId: args[0], expectedVersion: args[2] } as typeof writes[number];
    writes.push(event);
    try {
      if (offline) throw new Error('Injected offline save');
      event.acceptedVersion = await super.saveTimeline(...args);
      return event.acceptedVersion;
    } catch (error) { event.error = error instanceof Error ? error.message : String(error); throw error; }
  }
}
const resolveAssetUrl = async (file: string) => file === galleryMediaId || file === galleryUrl ? galleryUrl : file === importedMediaId || file === 'import.png' ? importedUrl : mediaUrl;
const provider = new WorkflowDataProvider({ timelines: { 'workflow-full': structuredClone(seed), 'workflow-dialog': structuredClone(seed) }, resolveAssetUrl });
const resolver = { resolveAssetUrl };
const effectCatalog = createVideoEditorEffectCatalog({ effects: [] });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const bridge = createFakeBridgeRouter();
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const request = new Request(input, init);
  const path = new URL(request.url).pathname;
  if (path.includes('/api/astrid/v1/tasks') || path.includes('/api/astrid/v1/projects/demo-project/tasks') || path === '/api/astrid/v1/capabilities') return bridge.handle(request);
  return originalFetch(input, init);
};
const evidence = {
  provider, writes, mediaId, importedMediaId, galleryMediaId, loadTimelineDraft,
  setOffline: (value: boolean) => { offline = value; },
  probes: new Map<string, { reload: () => Promise<unknown> }>(),
  completeTask: (id: string) => bridge.completeTask(id, { role: 'primary', media_id: `sha256:${'1'.repeat(64)}`, is_primary: true }),
};
Object.assign(window, { editorWorkflowEvidence: evidence });

function Probe({ name }: { name: string }) {
  const runtime = useVideoEditorRuntime(); const data = useTimelineEditorData();
  const ops = useTimelineEditorOps(); const chrome = useTimelineChromeContext();
  const commands = useTimelineCommandsService(); const version = useTimelineConfigVersion();
  const [result, setResult] = useState('');
  useEffect(() => {
    evidence.probes.set(name, { reload: chrome.reloadFromServer });
    return () => { evidence.probes.delete(name); };
  }, [chrome.reloadFromServer, name]);
  return <div style={{ padding: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    <button data-testid={`fade-${name}`} onClick={() => setResult(JSON.stringify(commands.updateClip({ clipId: 'clip-hero', patch: { effects: { fade_in: 0.1, fade_out: 0.1 }, entrance: { type: 'fade', duration: 0.1 }, exit: { type: 'fade-out', duration: 0.1 } } })))}>Set fade</button>
    <button data-testid={`import-${name}`} onClick={async () => {
      const registered = await commands.registerAsset({ assetId: 'managed-import', entry: { file: 'import.png', media_id: importedMediaId, type: 'image/png', duration: 0.2, generationId: 'generation-import', variantId: 'variant-import' }, sourceUrl: importedUrl });
      setResult(JSON.stringify(registered.ok ? commands.addClip({ assetId: 'managed-import', clipId: 'clip-import', trackId: 'V1', time: 0.4, clipSpanSeconds: 0.2 }) : registered));
    }}>Import managed asset</button>
    <button data-testid={`select-${name}`} onClick={() => { runtime.agentChat.activateTimeline?.(); activateTimelineClipData(runtime.agentSelectionOwner!); ops.selectClip('clip-hero'); }}>Select clip</button>
    <button data-testid={`offline-edit-${name}`} onClick={() => setResult(JSON.stringify(commands.updateClip({ clipId: 'clip-hero', patch: { label: 'Recovered offline clip' } })))}>Edit offline</button>
    <button data-testid={`reload-${name}`} onClick={() => void chrome.reloadFromServer()}>Reload canonical</button>
    <button data-testid={`retry-draft-${name}`} onClick={chrome.retryRecoveredDraft}>Retry draft</button>
    <output data-testid={`result-${name}`}>{result}</output>
    <output data-testid={`version-${name}`}>{version}</output>
    <output data-testid={`save-${name}`}>{chrome.saveStatus}</output>
    <output data-testid={`draft-${name}`}>{chrome.recoveryDraft ? 'recoverable' : ''}</output>
    <output hidden data-testid={`config-${name}`}>{JSON.stringify(data.data?.config)}</output>
    <output data-testid={`render-${name}`}>{chrome.renderStatus}</output>
    <output data-testid={`render-log-${name}`}>{chrome.renderLog}</output>
  </div>;
}
function Editor({ name }: { name: string }) {
  const registry = useAgentChatRegistry(); const timelineId = `workflow-${name}`;
  const [owner] = useState(() => Symbol(name));
  const services = useMemo<VideoEditorScopedServices>(() => ({
    contract: 'reigh.video-editor.scoped-services.v1', scope: { instanceId: name, projectId: 'demo-project', projectSlug: 'demo-project', timelineId },
    shots: { shots: [], isLoading: false, error: null, refetchShots() {}, finalVideoMap: new Map(), dismissFinalVideo() {} },
    mediaLightbox: { Lightbox: () => null, loadGenerationForLightbox: async id => id === 'generation-gallery' ? { id, generation_id: id, location: galleryUrl, type: 'image', media_id: galleryMediaId } : null },
    agentChat: { registerTimeline: (value) => registry.register({ timelineId: value.timelineId, editorContext: { ...value, tool: 'video-editor', projectSlug: value.projectSlug ?? null, timelineName: name } }, owner), unregisterTimeline: () => registry.unregister(owner), activateTimeline: () => registry.activate(owner) },
    toast: { error: () => '', warning: () => '', success: () => '', info: () => '' },
    telemetry: { log() {}, warn() {}, error() {} }, timelineServices: PUBLIC_TIMELINE_SERVICE_HOOKS,
  }), [name, owner, registry, timelineId]);
  return <BrowserVideoEditor dataProvider={provider} timelineId={timelineId} assetResolver={resolver} effectCatalog={effectCatalog} hostServices={services}>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Probe name={name} /><div style={{ flex: 1, minHeight: 0 }}><TimelineEditorShellCore timelineId={timelineId} forceCondensed={name === 'dialog'} showHeader={false} /></div>
    </div>
  </BrowserVideoEditor>;
}
function TaskProbe() {
  const snapshot = useBridgeTaskSnapshot(['demo-project']);
  return <div><output hidden data-testid="task-snapshot">{JSON.stringify(snapshot.data ?? [])}</output><span>{snapshot.data?.map(task => `${task.id}: ${task.status}`).join(', ')}</span><button data-testid="refresh-tasks" onClick={() => void snapshot.refetch()}>Refresh tasks</button></div>;
}
function Host() {
  const [open, setOpen] = useState(true); const [tasksOpen, setTasksOpen] = useState(true); const [taskId, setTaskId] = useState('');
  const chat = useAgentChatBridge(); const [agentResult, setAgentResult] = useState('');
  const [, setSearchParams] = useSearchParams();
  return <main>
    <button data-testid="toggle-dialog" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Reopen'} dialog</button>
    <output data-testid="host-timeline">{chat.timelineId}</output><output data-testid="host-project">{chat.editorContext?.projectId}</output>
    <button data-testid="gallery-send" onClick={() => setSearchParams({ timeline: chat.timelineId!, addGenerationId: 'generation-gallery' })}>Send Gallery asset to selected editor</button>
    <button data-testid="agent-fade" onClick={async () => {
      const context = chat.editorContext;
      try {
        const result = await context?.elementOperationAdapter?.execute({ name: 'timeline.set_clip_fade', project: context.projectSlug, timeline: context.timelineId, expected_version: context.timelineSummary?.configVersion, clip_id: 'clip-hero', fade_in: 0.1, fade_out: 0.1 });
        setAgentResult(JSON.stringify(result ?? { error: 'adapter missing' }));
        await evidence.probes.get(context?.timelineId === 'workflow-full' ? 'full' : 'dialog')?.reload();
      } catch (error) { setAgentResult(JSON.stringify({ error: String(error) })); }
    }}>Run selected agent fade</button><output hidden data-testid="agent-result">{agentResult}</output>
    <button data-testid="admit-task" onClick={async () => {
      const result = await createTask({ project: 'demo-project', capability_id: 'astrid.image_generation', capability_digest: `sha256:${'a'.repeat(64)}`, schema_version: '1', input_object_ids: [], spec: { family: 'image_generation', params: { prompt: 'E1-05 task recovery' }, output_policy: {} }, storage_estimate: { scratch_bytes: 0, output_bytes: 0 }, settlement_effect: {} });
      setTaskId(result.task_id); await queryClient.invalidateQueries({ queryKey: taskQueryKeys.snapshot('demo-project') });
    }}>Admit fixture task</button><output data-testid="task-id">{taskId}</output>
    <button data-testid="toggle-tasks" onClick={() => setTasksOpen(!tasksOpen)}>Toggle Tasks</button>{tasksOpen && <TaskProbe />}
    <section aria-label="Full editor" style={{ height: 660 }}><Editor name="full" /></section>
    {open && <section role="dialog" aria-label="Dialog editor" style={{ height: 660, border: '2px solid #888' }}><Editor name="dialog" /></section>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><MemoryRouter><AuthProvider><UserSettingsProvider><ProjectProvider><ShotsContextProvider value={{ shots: [], isLoading: false, error: null, refetchShots() {} }}><TooltipProvider><AgentChatProvider><Host /></AgentChatProvider></TooltipProvider></ShotsContextProvider></ProjectProvider></UserSettingsProvider></AuthProvider></MemoryRouter></QueryClientProvider>);
