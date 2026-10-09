import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { defineExtension, type ExtensionContext } from '@reigh/editor-sdk';
import { AgentChatProvider, useAgentChatBridge, useAgentChatRegistry } from '@/shared/contexts/AgentChatContext';
import { BrowserVideoEditor } from '@/tools/video-editor/browser/BrowserVideoEditor';
import { InMemoryDataProvider, createVideoEditorEffectCatalog } from '@/tools/video-editor/browser-provider';
import { createEmbedDemoTimelineFixture } from '@/tools/video-editor/testing';
import { TimelineEditorShellCore } from '@/tools/video-editor/components/TimelineEditorShellCore';
import { PUBLIC_TIMELINE_SERVICE_HOOKS } from '@/tools/video-editor/runtime/timelineHostServiceHooks';
import type { VideoEditorScopedServices } from '@/tools/video-editor/browser/scopedServices';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext';
import { useTimelineEditorData, useTimelineEditorOps } from '@/tools/video-editor/hooks/timelineStore';
import { activateTimelineClipData, editorReplaceTimelineSelection } from '@/shared/state/selectionStore';
import { AuthProvider } from '@/shared/contexts/AuthContext';
import { UserSettingsProvider } from '@/shared/contexts/UserSettingsContext';
import { ProjectProvider } from '@/shared/contexts/ProjectContext';
import { ShotsContextProvider } from '@/shared/contexts/ShotsContext';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import '@/index.css';

const evidence = { contexts: new Map<string, ExtensionContext>(), released: [] as string[], commands: [] as string[] };
Object.assign(window, { editorInstanceEvidence: evidence });
const assetResolver = { resolveAssetUrl: async () => `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#426776"/></svg>')}` };
const fixture = createEmbedDemoTimelineFixture();
const seed = { configVersion: fixture.configVersion, registry: fixture.registry, config: fixture.config };
const dataProvider = new InMemoryDataProvider({ timelines: { 'timeline-full': seed, 'timeline-dialog': seed, 'timeline-dialog-next': seed }, resolveAssetUrl: assetResolver.resolveAssetUrl });
const effectCatalog = createVideoEditorEffectCatalog({ effects: [] });

function Probe({ name }: { name: string }) {
  const runtime = useVideoEditorRuntime(); const data = useTimelineEditorData(); const ops = useTimelineEditorOps();
  return <div style={{ display: 'flex', gap: 8 }}>
    <button data-testid={`select-${name}`} onClick={() => { runtime.agentChat.activateTimeline?.(); activateTimelineClipData(runtime.agentSelectionOwner!); editorReplaceTimelineSelection(['clip-hero'], runtime.agentSelectionOwner); }}>Select shared clip</button>
    <button data-testid={`clear-${name}`} onClick={ops.clearSelection}>Clear selection</button>
    <output data-testid={`selection-${name}`}>{[...data.selectedClipIds].join(',')}</output>
  </div>;
}
function Editor({ name, timelineId, compact }: { name: string; timelineId: string; compact?: boolean }) {
  const registry = useAgentChatRegistry();
  const [owner] = useState(() => Symbol(name));
  const services = useMemo<VideoEditorScopedServices>(() => ({
    contract: 'reigh.video-editor.scoped-services.v1', scope: { instanceId: name, projectId: 'same-project', timelineId },
    shots: { shots: [], isLoading: false, error: null, refetchShots() {}, finalVideoMap: new Map(), dismissFinalVideo() {} },
    mediaLightbox: { Lightbox: () => null, loadGenerationForLightbox: async () => null },
    agentChat: {
      registerTimeline: (value) => registry.register({ timelineId: value.timelineId, editorContext: { tool: 'video-editor', projectId: value.projectId, projectSlug: null, timelineId: value.timelineId, timelineName: name } }, owner),
      unregisterTimeline: () => registry.unregister(owner), activateTimeline: () => registry.activate(owner),
    },
    toast: { error: () => '', warning: () => '', success: () => '', info: () => '' },
    telemetry: { log() {}, warn() {}, error() {} }, timelineServices: PUBLIC_TIMELINE_SERVICE_HOOKS,
  }), [name, owner, registry, timelineId]);
  const extensions = useMemo(() => [defineExtension({
    manifest: { id: 'example.browser-instance', apiVersion: 1, version: '1.0.0', label: name,
      contributions: [
        { kind: 'command', id: 'instance-command', command: 'example.browser-instance.echo', label: 'Echo instance' },
        { kind: 'keybinding', id: 'instance-keybinding', command: 'example.browser-instance.echo', key: 'CtrlOrCmd+K' },
        { kind: 'slot', id: 'instance-status', slot: 'statusBar', render: 'instance-status' },
      ] },
    activate(ctx) {
      evidence.contexts.set(name, ctx);
      const command = ctx.commands.registerCommand('example.browser-instance.echo', () => { evidence.commands.push(timelineId); });
      const renderer = ctx.ui.registerRenderer('instance-status', () => <span data-testid={`renderer-${name}`}>{timelineId}</span>);
      return { dispose() { command.dispose(); renderer.dispose(); evidence.released.push(timelineId); } };
    },
  })], [name, timelineId]);
  return <BrowserVideoEditor dataProvider={dataProvider} timelineId={timelineId} assetResolver={assetResolver}
    effectCatalog={effectCatalog} hostServices={services} extensions={extensions}>
    <Probe name={name} /><TimelineEditorShellCore timelineId={timelineId} forceCondensed={compact} showHeader={false} />
  </BrowserVideoEditor>;
}
function Host() {
  const [open, setOpen] = useState(true); const [timeline, setTimeline] = useState('timeline-dialog');
  const chat = useAgentChatBridge();
  return <main>
    <div style={{ padding: 8 }}><button data-testid="toggle-dialog" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Reopen'} dialog</button>
      <button data-testid="update-dialog" onClick={() => setTimeline(timeline === 'timeline-dialog' ? 'timeline-dialog-next' : 'timeline-dialog')}>Update dialog scope</button>
      <output data-testid="host-timeline">{chat.timelineId}</output></div>
    <section aria-label="Full editor" style={{ height: 600, width: '100%' }}><Editor name="full" timelineId="timeline-full" /></section>
    {open && <section role="dialog" aria-label="Dialog editor" style={{ height: 500, width: '100%', border: '2px solid #888' }}><Editor name="dialog" timelineId={timeline} compact /></section>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AuthProvider><UserSettingsProvider><ProjectProvider><ShotsContextProvider value={{ shots: [], isLoading: false, error: null, refetchShots() {} }}><TooltipProvider><AgentChatProvider><Host /></AgentChatProvider></TooltipProvider></ShotsContextProvider></ProjectProvider></UserSettingsProvider></AuthProvider></MemoryRouter></QueryClientProvider>);
