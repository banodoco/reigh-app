import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AgentChatProvider, useAgentChatBridge, useAgentChatRegistry } from '@/shared/contexts/AgentChatContext';
import { activateTimelineClipData } from '@/shared/state/selectionStore';
import { BrowserVideoEditor } from '@/tools/video-editor/browser/BrowserVideoEditor';
import { InMemoryDataProvider, createVideoEditorEffectCatalog } from '@/tools/video-editor/browser-provider';
import { createEmbedDemoTimelineFixture } from '@/tools/video-editor/testing';
import { TimelineEditorShellCore } from '@/tools/video-editor/components/TimelineEditorShellCore';
import { PUBLIC_TIMELINE_SERVICE_HOOKS } from '@/tools/video-editor/runtime/timelineHostServiceHooks';
import type { VideoEditorScopedServices } from '@/tools/video-editor/browser/scopedServices';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext';
import { useTimelineChromeContext, useTimelineEditorData, useTimelineEditorOps } from '@/tools/video-editor/hooks/timelineStore';
import { AuthProvider } from '@/shared/contexts/AuthContext';
import { UserSettingsProvider } from '@/shared/contexts/UserSettingsContext';
import { ProjectProvider } from '@/shared/contexts/ProjectContext';
import { ShotsContextProvider } from '@/shared/contexts/ShotsContext';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { createTask } from '@/shared/lib/taskCreation/createTask';
import { createFakeBridgeRouter } from '@/test/fakeBridgeRouter';
import { GenerationsPane } from '@/features/gallery/components/GenerationsPane/GenerationsPane';
import { TasksPane } from '@/features/tasks/components/TasksPane/TasksPane';
import { IncomingTasksProvider } from '@/shared/contexts/IncomingTasksContext';
import { bootstrapPanesStore } from '@/shared/state/panesStore';
import {RUNTIME_SCHEMA_DIGEST,RUNTIME_TARGETED_EXECUTION_CAPABILITY} from '@/integrations/runtime/contract-metadata';
import '@/index.css';

// Fixture media/network, asynchronous gates, and read-only observations only.
// Gallery/Tasks actions, editor ownership, imports and saves use production code.
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
class WorkflowDataProvider extends InMemoryDataProvider {
  override async saveTimeline(...args: Parameters<InMemoryDataProvider['saveTimeline']>) {
    const event = { timelineId: args[0], expectedVersion: args[2] } as typeof writes[number];
    writes.push(event);
    try {
      event.acceptedVersion = await super.saveTimeline(...args);
      return event.acceptedVersion;
    } catch (error) { event.error = error instanceof Error ? error.message : String(error); throw error; }
  }
}
const resolveAssetUrl = async (file: string) => file === galleryMediaId || file === galleryUrl ? galleryUrl : mediaUrl;
const provider = new WorkflowDataProvider({ timelines: { 'workflow-full': structuredClone(seed), 'workflow-dialog': structuredClone(seed) }, resolveAssetUrl });
const resolver = { resolveAssetUrl };
const effectCatalog = createVideoEditorEffectCatalog({ effects: [] });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const sameProject = new URLSearchParams(window.location.search).get('sameProject') === '1';
const dialogProject = sameProject ? 'project-a' : 'project-b';
const bridges = new Map(['project-a', 'project-b'].map(project => {
  const router = createFakeBridgeRouter();
  router.state.project = { ...router.state.project, slug: project };
  router.state.tasks.clear();
  router.state.admissions = project === 'project-b' ? 100 : 0;
  router.state.galleryDetails = router.state.galleryDetails.slice(0, 1);
  router.state.galleryDetails[0].variants = router.state.galleryDetails[0].variants.map(variant => ({...variant,media_id:galleryMediaId}));
  if (project === 'project-b') {
    router.state.galleryDetails[0] = { ...router.state.galleryDetails[0], generation_id: 'generation-project-b', variants: router.state.galleryDetails[0].variants.map(variant => ({...variant, generation_id: 'generation-project-b'})) };
  }
  return [project, router] as const;
}));
const requests: Array<{method: string; path: string; body?: unknown}> = [];
const loads: Array<{instance: string; generationId: string; project: string}> = [];
const exports: Array<unknown> = [];
const variantIdentities: Array<{project: string; path: string; object_id: string}> = [];
let pendingMedia = false;
let pendingTask = false;
let releaseMedia: (() => void) | undefined;
let releaseTask: (() => void) | undefined;
const gate = (kind: 'media' | 'task') => new Promise<void>(resolve => { if (kind === 'media') releaseMedia = resolve; else releaseTask = resolve; });
const taskProjects = new Map<string,string>();
const managedOutputs = new Map<string, any>();
const originalFetch = window.fetch.bind(window);
const json = (value: unknown) => new Response(JSON.stringify(value), {headers: {'Content-Type':'application/json'}});
window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url); const path = url.pathname;
  if (!path.startsWith('/api/astrid') && !path.startsWith('/api/runtime')) return originalFetch(input, init);
  const body = request.method === 'POST' ? await request.clone().json() : undefined;
  requests.push({method: request.method, path, ...(body ? {body} : {})});
  if (path.endsWith('/v1/health')) return json({protocol:'workspace.v1',schema_digest:RUNTIME_SCHEMA_DIGEST,runtime_epoch:1,status:'ok'});
  if (path.endsWith('/v1/handshake')) return json({protocol:'workspace.v1',schema_digest:RUNTIME_SCHEMA_DIGEST,session_id:'fixture-session',actor_id:'fixture',realm_id:'fixture',scopes:[],capabilities:[RUNTIME_TARGETED_EXECUTION_CAPABILITY]});
  if (path.endsWith('/v1/realm')) return json({realm_id:'fixture',display_name:'Fixture',version:1,created_at:new Date().toISOString()});
  const taskMatch = path.match(/\/v1\/tasks\/([^/]+)/);
  const projectMatch = path.match(/\/projects\/([^/]+)/);
  const project = projectMatch?.[1] ?? body?.project ?? (path.includes('/generations/generation-project-b') ? 'project-b' : undefined) ?? (taskMatch ? taskProjects.get(taskMatch[1]) : undefined) ?? 'project-a';
  if (taskMatch && !path.endsWith('/managed-outputs') && request.method === 'GET' && pendingTask) await gate('task');
  if (path.endsWith('/managed-outputs') && taskMatch) return json({items:[managedOutputs.get(taskMatch[1])], next_cursor:null});
  if (/\/managed-outputs\/.+\/export$/.test(path)) {
    const receipt = {data:{export_id:'export-selected',...body.expected,destination:{root:'/exports',filename:body.destination_filename},exported_at:new Date().toISOString()},receipt:{receipt_id:'selected-export',result:{association_id:body.expected.association_id}}};
    exports.push({path,body,receipt});
    return json(receipt);
  }
  if (/\/v1\/objects\//.test(path)) return new Response(await (await originalFetch(galleryUrl)).arrayBuffer(), {headers:{'Content-Type':'image/png'}});
  const canonicalUrl = new URL(request.url); canonicalUrl.pathname = canonicalUrl.pathname.replace('/api/runtime','/api/astrid');
  const response = await bridges.get(project)!.handle(new Request(canonicalUrl,request));
  if (path.includes('/v1/generations/') && path.endsWith('/variants') && response.ok) {
    const page = await response.json();
    page.items = page.items.map((variant: Record<string,unknown>) => { variantIdentities.push({project,path,object_id:galleryMediaId}); return {...variant,object_id:galleryMediaId}; });
    return json(page);
  }
  return response;
};
const admitted: Record<string,string> = {};
for (const [name, project, timeline] of [['full','project-a','workflow-full'],['dialog',dialogProject,'workflow-dialog'],['background',dialogProject,'workflow-dialog']]) {
  const result = await createTask({project,capability_id:'rendering.render',capability_digest:`sha256:${'d'.repeat(64)}`,schema_version:'1',input_object_ids:[],spec:{family:'rendering.render',params:{timeline_ref:timeline},output_policy:{}},storage_estimate:{scratch_bytes:0,output_bytes:0},settlement_effect:{}});
  admitted[name] = result.task_id; taskProjects.set(result.task_id,project);
  const bridge = bridges.get(project)!;
  if (name !== 'background') bridge.completeTask(result.task_id,{role:'video',media_id:galleryMediaId,is_primary:true});
  else bridge.state.tasks.get(result.task_id)!.status = 'running';
  managedOutputs.set(result.task_id,{association_id:`output-${name}`,project_id:project,run_id:`run-${name}`,task_id:result.task_id,attempt_id:`attempt-${name}`,output_port:'video',role:'render',object_id:galleryMediaId,digest:galleryMediaId,size:12,filename:`${name}.mp4`,media_type:'video/mp4',state:'available',version:1,provenance:{executor_id:'fixture',lease_id:'fixture-lease',fence:1,runtime_epoch:1}});
}
const evidence = {
  provider, writes, mediaId, galleryMediaId, galleryUrl, admitted, requests, loads, exports, variantIdentities, dialogProject,
  setMediaPending: (value: boolean) => { pendingMedia = value; },
  setTaskPending: (value: boolean) => { pendingTask = value; },
  releaseMedia: () => { pendingMedia = false; releaseMedia?.(); },
  releaseTask: () => { pendingTask = false; releaseTask?.(); },
  completeBackground: () => { bridges.get(dialogProject)!.completeTask(admitted.background, {role:'video',media_id:galleryMediaId,is_primary:true}); },
  backgroundState: () => bridges.get(dialogProject)!.state.tasks.get(admitted.background)?.status,
  refreshTasks: () => queryClient.invalidateQueries({queryKey:['runtime-tasks']}),
};
Object.assign(window, { productionWidgetEvidence: evidence });

function Probe({name}:{name:string}) {
  const runtime = useVideoEditorRuntime(); const data = useTimelineEditorData();
  const chrome = useTimelineChromeContext(); const ops = useTimelineEditorOps();
  return <div style={{padding:8}}>
    <button data-testid={`select-${name}`} onClick={() => { runtime.agentChat.activateTimeline?.(); activateTimelineClipData(runtime.agentSelectionOwner!); ops.selectClip('clip-hero'); }}>Activate {name}</button>
    <output data-testid={`version-${name}`}>{data.data?.configVersion}</output>
    <output data-testid={`save-${name}`}>{chrome.saveStatus}</output>
    <output hidden data-testid={`config-${name}`}>{JSON.stringify(data.data?.config)}</output>
  </div>;
}
function Editor({ name }: { name: string }) {
  const registry = useAgentChatRegistry(); const timelineId = `workflow-${name}`;
  const [owner] = useState(() => Symbol(name));
  const services = useMemo<VideoEditorScopedServices>(() => ({
    contract: 'reigh.video-editor.scoped-services.v1', scope: { instanceId: name, projectId: name === 'full' ? 'project-a' : dialogProject, projectSlug: name === 'full' ? 'project-a' : dialogProject, timelineId },
    shots: { shots: [], isLoading: false, error: null, refetchShots() {}, finalVideoMap: new Map(), dismissFinalVideo() {} },
    mediaLightbox: { Lightbox: () => null, loadGenerationForLightbox: async id => { loads.push({instance:name,generationId:id,project:name === 'full' ? 'project-a' : dialogProject}); if (pendingMedia) await gate('media'); return { id, generation_id:id, location:galleryUrl,type:'image',media_id:galleryMediaId }; } },
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
function Host() {
  const [open,setOpen] = useState(true); const [widgets,setWidgets] = useState(true);
  const chat = useAgentChatBridge(); const location = useLocation();
  const [locks,setLocks] = useState({shots:false,tasks:true,gens:true,editor:false});
  const [paneOpen,setPaneOpen] = useState({tasks:true,gens:true,editor:false});
  const [owner] = useState(()=>Symbol('fixture-panes'));
  useEffect(() => bootstrapPanesStore({owner,viewportHeight:window.innerHeight,locks,isGenerationsPaneOpen:paneOpen.gens,isEditorPaneOpen:paneOpen.editor,isTasksPaneOpen:paneOpen.tasks,
    setIsGenerationsPaneLocked:value=>setLocks(previous=>({...previous,gens:value})),setIsTasksPaneLocked:value=>setLocks(previous=>({...previous,tasks:value})),setIsShotsPaneLocked:value=>setLocks(previous=>({...previous,shots:value})),setIsEditorPaneLocked:value=>setLocks(previous=>({...previous,editor:value})),
    setIsGenerationsPaneOpen:value=>setPaneOpen(previous=>({...previous,gens:value})),setIsTasksPaneOpen:value=>setPaneOpen(previous=>({...previous,tasks:value})),setIsEditorPaneOpen:value=>setPaneOpen(previous=>({...previous,editor:value})),resetAllPaneLocks:()=>setLocks({shots:false,tasks:false,gens:false,editor:false})}),[owner,locks,paneOpen]);
  return <main style={{paddingRight:420,paddingBottom:340}}>
    <button data-testid="toggle-dialog" onClick={()=>setOpen(!open)}>Toggle dialog editor</button>
    <button data-testid="toggle-widgets" onClick={()=>setWidgets(!widgets)}>Toggle Widgets</button>
    <output data-testid="host-timeline">{chat.timelineId}</output><output data-testid="host-project">{chat.editorContext?.projectId}</output>
    <output hidden data-testid="route">{location.pathname+location.search}</output>
    <section aria-label="Full editor" style={{height:500}}><Editor name="full"/></section>
    {open && <section role="dialog" aria-label="Dialog editor" style={{height:500,border:'2px solid #888'}}><Editor name="dialog"/></section>}
    {widgets && <><GenerationsPane/><TasksPane onOpenSettings={()=>{}}/></>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/tools/video-editor?localTest=1&runtime=1&runtimeProject=project-a&runtimeTimeline=workflow-full&timeline=workflow-full']}><AuthProvider><UserSettingsProvider><ProjectProvider><ShotsContextProvider value={{shots:[],isLoading:false,error:null,refetchShots(){}}}><IncomingTasksProvider><TooltipProvider><AgentChatProvider><Host/></AgentChatProvider></TooltipProvider></IncomingTasksProvider></ShotsContextProvider></ProjectProvider></UserSettingsProvider></AuthProvider></MemoryRouter></QueryClientProvider>);
