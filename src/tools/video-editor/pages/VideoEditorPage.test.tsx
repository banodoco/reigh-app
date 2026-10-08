import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoEditorPage from '@/tools/video-editor/pages/VideoEditorPage.tsx';
import { RuntimeAuthenticationError } from '@/integrations/runtime/client.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { RuntimeDataProvider, RuntimeDataProviderOptions } from '@/integrations/runtime/dataProvider.ts';
import type { Transport } from '@/integrations/runtime/generated.ts';
import { RUNTIME_SCHEMA_DIGEST, RUNTIME_TARGETED_EXECUTION_CAPABILITY } from '@/integrations/runtime/contract-metadata.ts';
import { useTimelineQueries } from '@/tools/video-editor/hooks/useTimelineQueries.ts';
import { usePollSync, type UsePollSyncQueries } from '@/tools/video-editor/hooks/usePollSync.ts';
import { assetRegistryQueryKey } from '@/tools/video-editor/hooks/useTimeline.ts';
import { createInteractionState } from '@/tools/video-editor/lib/interaction-state.ts';
import * as timelineData from '@/tools/video-editor/lib/timeline-data.ts';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';
import type { TimelineConfig, AssetRegistry } from '@/tools/video-editor/types/index.ts';
import { setDevExtensionEnabled } from '@/tools/video-editor/dev/devExtensionEnablement.ts';

const state = vi.hoisted(() => ({
  auth: { userId: 'user-1' as string | null },
  project: {
    selectedProjectId: 'project-1' as string | null,
    setSelectedProjectId: vi.fn((id: string | null) => {
      state.project.selectedProjectId = id;
    }),
  },
  projectCrud: {
    projects: [{ id: 'project-1', name: 'Project One', user_id: 'user-1' }],
    isLoadingProjects: false,
  },
  settings: {
    settings: { lastTimelineId: 'timeline-1' as string | undefined },
    update: vi.fn(async () => undefined),
  },
  timelines: {
    data: [{ id: 'timeline-1', name: 'Main timeline', updated_at: '2026-06-11T10:00:00Z' }] as Array<{
      id: string;
      name: string;
      updated_at?: string | null;
    }>,
    isLoading: false,
    error: null as Error | null,
    timelineMutationsAvailable: false,
    createTimeline: {
      isPending: false,
      mutateAsync: vi.fn(async () => ({ id: 'created-timeline' })),
    },
    renameTimeline: {
      mutateAsync: vi.fn(async () => undefined),
    },
    deleteTimeline: {
      mutateAsync: vi.fn(async () => undefined),
    },
  },
  discovery: {
    bridgeHealthy: true,
    bridgeDown: false,
    healthLoading: false,
    projectsLoading: false,
    projectsError: null as Error | null,
    projects: [] as { slug: string; name: string; project_id?: string }[],
    timelinesLoading: false,
    timelinesError: null as Error | null,
    timelines: [] as {
      timeline_id: string;
      timeline_ulid?: string;
      slug?: string;
      name: string;
      is_default?: boolean;
    }[],
  },
  workspaceV1: false,
  selectedProvider: null as DataProvider | null,
  providerProbe: null as React.ComponentType<{ dataProvider: DataProvider; timelineId: string }> | null,
  providerMounts: 0,
  providerUnmounts: 0,
  saveStatusCallback: null as null | ((status: 'saved' | 'saving' | 'dirty' | 'retrying' | 'error') => void),
  confirm: vi.fn(() => true),
  /** Captured extensions prop from the last VideoEditorProvider render (for smoke tests). */
  lastProviderExtensions: null as readonly any[] | null,
  /** Captured timelineOverlaysEnabled prop from the last VideoEditorProvider render. */
  lastTimelineOverlaysEnabled: null as boolean | null,
  /**
   * Dev-local scratchpad array backing the real `devLocalExtensions` module
   * (which is empty on main). Tests push fixture extensions into it.
   */
  devLocalExtensions: [] as any[],
  /**
   * Simulated runtime lifecycle: the mocked provider records one activation
   * entry per extension id when an id enters the extensions prop and one
   * disposal entry when it leaves — mirroring ExtensionLifecycleHost's
   * synchronize() contract (dispose on removal, activate on re-add).
   */
  extensionActivations: [] as string[],
  extensionDisposals: [] as string[],
  bridgeCtor: vi.fn(function MockBridgeProvider(this: Record<string, unknown>, options: unknown) {
    this.kind = 'bridge';
    this.options = options;
    this.persistenceEnabled = true;
    this.resolveAssetUrl = vi.fn();
    this.loadTimeline = vi.fn();
    this.saveTimeline = vi.fn();
    this.loadAssetRegistry = vi.fn();
  }),
  runtimeOnError: null as null | ((error: unknown) => void),
  runtimeCtor: vi.fn(function MockRuntimeProvider(this: Record<string, unknown>, options: unknown) {
    this.kind = 'runtime';
    this.options = options;
    this.reconnect = vi.fn(async () => undefined);
    state.runtimeOnError = (options as { onRuntimeError?: (error: unknown) => void }).onRuntimeError ?? null;
  }),
}));

vi.mock('@/shared/contexts/AuthContext.tsx', () => ({
  useAuth: () => state.auth,
}));

vi.mock('@/shared/contexts/ProjectContext.tsx', () => ({
  useProjectSelectionContext: () => state.project,
  useProjectCrudContext: () => state.projectCrud,
}));

// Page routing is covered by useHomeNavigation.test.ts. Keeping that hook real
// here would mount user-preference persistence, which is outside this page
// contract and requires an initialized Supabase runtime.
vi.mock('@/shared/hooks/useHomeNavigation.ts', () => ({
  useHomeNavigation: () => ({ navigateHome: vi.fn(), targetPath: '/tools/video-editor' }),
}));

vi.mock('@/shared/hooks/settings/useToolSettings.ts', () => ({
  useToolSettings: () => state.settings,
}));

vi.mock('@/tools/video-editor/hooks/useTimelinesList.ts', () => ({
  useTimelinesList: () => state.timelines,
}));

// The discovery hook is owned by the page; tests drive its result through the
// mutable `state.discovery` object so bridge-down → online refreshes can be
// simulated without a real bridge.
vi.mock('@/tools/video-editor/hooks/useAstridBridgeDiscovery.ts', () => ({
  useAstridBridgeDiscovery: () => ({
    healthQuery: {
      isLoading: state.discovery.healthLoading,
      isError: state.discovery.bridgeDown,
      error: state.discovery.bridgeDown ? new Error('bridge unreachable') : null,
      data: state.discovery.bridgeHealthy ? true : false,
    },
    projectsQuery: {
      isLoading: state.discovery.projectsLoading,
      isError: state.discovery.projectsError !== null,
      error: state.discovery.projectsError,
      data: state.discovery.projects.length > 0 ? { projects: state.discovery.projects } : undefined,
    },
    timelinesQuery: {
      isLoading: state.discovery.timelinesLoading,
      isError: state.discovery.timelinesError !== null,
      error: state.discovery.timelinesError,
      data: state.discovery.timelines.length > 0 ? { timelines: state.discovery.timelines } : undefined,
    },
    bridgeHealthy: state.discovery.bridgeHealthy,
    bridgeDown: state.discovery.bridgeDown,
    projectsEmpty: state.discovery.projects.length === 0,
  }),
}));

vi.mock('@/integrations/astrid/workspaceV1.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/astrid/workspaceV1.ts')>();
  return { ...actual, get isAstridWorkspaceV1() { return state.workspaceV1; } };
});

vi.mock('@/tools/video-editor/data/AstridBridgeDataProvider.ts', () => ({
  AstridBridgeDataProvider: state.bridgeCtor,
}));

vi.mock('@/integrations/runtime/dataProvider.ts', () => ({
  RuntimeDataProvider: state.runtimeCtor,
}));

// The dev-local scratchpad is empty on main; tests push fixtures into the
// shared hoisted array so the page's `devLocalExtensions` filter sees them.
vi.mock('@/tools/video-editor/dev/localExtensions.ts', () => ({
  devLocalExtensions: state.devLocalExtensions,
}));

vi.mock('@/tools/video-editor/components/ReighVideoEditorShell.tsx', () => ({
  ReighVideoEditorShell: ({ timelineId, navigationControls }: { timelineId: string; navigationControls?: React.ReactNode }) => (
    <div data-testid="video-editor-shell">
      {timelineId}
      {navigationControls}
    </div>
  ),
}));

vi.mock('@/tools/video-editor/contexts/VideoEditorProvider.tsx', async () => {
  const ReactModule = await import('react');

  return {
    VideoEditorProvider: ({
      dataProvider,
      timelineId,
      timelineName,
      onSaveStatusChange,
      extensions,
      timelineOverlaysEnabled,
      children,
    }: {
      dataProvider: DataProvider & { kind?: string };
      timelineId: string;
      timelineName?: string | null;
      onSaveStatusChange?: (status: 'saved' | 'saving' | 'dirty' | 'retrying' | 'error') => void;
      extensions?: readonly any[];
      timelineOverlaysEnabled?: boolean;
      children: React.ReactNode;
    }) => {
      state.selectedProvider = dataProvider;
      const Probe = state.providerProbe;
      const [saveStatus, setSaveStatus] = ReactModule.useState<'saved' | 'saving' | 'dirty' | 'retrying' | 'error'>('saved');
      state.saveStatusCallback = onSaveStatusChange ?? null;
      state.lastProviderExtensions = extensions ?? null;
      state.lastTimelineOverlaysEnabled = timelineOverlaysEnabled ?? false;

      ReactModule.useEffect(() => {
        state.providerMounts += 1;
        return () => {
          state.providerUnmounts += 1;
          if (state.saveStatusCallback === onSaveStatusChange) {
            state.saveStatusCallback = null;
          }
        };
      }, []);

      // Simulate the runtime lifecycle (mirrors ExtensionLifecycleHost's
      // synchronize): an id entering the extensions prop is activated once,
      // an id leaving it is disposed once. The direct-extension fast path
      // delivers a fresh list whenever the page's external-store memo changes.
      const prevExtensionIdsRef = ReactModule.useRef<string[]>([]);
      ReactModule.useEffect(() => {
        const ids = (extensions ?? [])
          .map((ext: { manifest?: { id?: unknown } }) =>
            typeof ext?.manifest?.id === 'string' ? ext.manifest.id : '',
          )
          .filter((id: string) => id.length > 0);
        const prev = prevExtensionIdsRef.current;
        for (const id of ids) {
          if (!prev.includes(id)) state.extensionActivations.push(id);
        }
        for (const id of prev) {
          if (!ids.includes(id)) state.extensionDisposals.push(id);
        }
        prevExtensionIdsRef.current = ids;
      }, [extensions]);

      ReactModule.useEffect(() => {
        onSaveStatusChange?.(saveStatus);
      }, [onSaveStatusChange, saveStatus]);

      return (
        <div
          data-testid="video-editor-provider"
          data-kind={dataProvider.kind ?? 'unknown'}
          data-timeline-id={timelineId}
          data-timeline-name={timelineName ?? ''}
          data-timeline-overlays-enabled={String(timelineOverlaysEnabled ?? false)}
        >
          <button type="button" onClick={() => setSaveStatus('saving')}>
            status-saving
          </button>
          <button type="button" onClick={() => setSaveStatus('dirty')}>
            status-dirty
          </button>
          <button type="button" onClick={() => setSaveStatus('retrying')}>
            status-retrying
          </button>
          <button type="button" onClick={() => setSaveStatus('error')}>
            status-error
          </button>
          <button type="button" onClick={() => setSaveStatus('saved')}>
            status-saved
          </button>
          <span data-testid="mock-save-status">{saveStatus}</span>
          {Probe && <Probe dataProvider={dataProvider} timelineId={timelineId} />}
          {children}
        </div>
      );
    },
  };
});

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <VideoEditorPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}


const L04_PROJECT = 'l04-project-id';
const L04_TIMELINE = 'l04-timeline';
const L04_HEAD = 'l04-head-1';
const L04_NEXT_HEAD = 'l04-head-2';
const L04_TOKEN = `sha256:${'a'.repeat(64)}`;
const L04_UNKNOWN = `sha256:${'b'.repeat(64)}`;
const L04_CARD_URL = `/api/runtime/v1/objects/${encodeURIComponent(L04_TOKEN)}`;
const l04Config: TimelineConfig = {
  ...createDefaultTimelineConfig(),
  clips: [{ id: 'l04-card', at: 0, track: 'V1', clipType: 'end-spanning-layer', hold: 1, params: { cardAssets: { card0: 'l04-card-asset' } } }],
};
const l04Registry: AssetRegistry = {
  assets: { 'l04-card-asset': { file: 'card.png', type: 'image/png', media_id: L04_TOKEN, content_sha256: L04_TOKEN } },
};
type L04Build = { status: 'resolved'; data: timelineData.TimelineData } | { status: 'rejected'; error: unknown };
let l04Builds: L04Build[] = [];
let l04Queries: ReturnType<typeof useTimelineQueries> | null = null;
let l04Navigate: ReturnType<typeof useNavigate>;

function makeL04Transport() {
  const requests: Array<{ provider: string; method: string; path: string }> = [];
  const providers: RuntimeDataProvider[] = [];
  let held = false;
  let revised = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const response = (value: unknown) => ({ status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify(value)) });
  const transportFor = (provider: string): Transport => async (method, path) => {
    requests.push({ provider, method, path });
    if (path === '/v1/health') return response({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 });
    if (path === '/v1/handshake') return response({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 'l04-session', actor_id: 'owner', realm_id: 'l04-realm', scopes: ['handshake', 'projects:read'], capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] });
    if (path === '/v1/realm') return response({ realm_id: 'l04-realm', display_name: 'L04 offline fixture', version: 1, created_at: '2026-10-08T00:00:00Z' });
    const inspection = /^\/v1\/projects\/([^/]+)\/timelines\/([^/]+)\/inspect$/.exec(path);
    if (method === 'POST' && inspection) {
      if (held) await gate;
      const head = revised ? L04_NEXT_HEAD : L04_HEAD;
      return response({ project_id: inspection[1], timeline_id: inspection[2], revision_id: head, head_revision_id: head, is_current_head: true, representation: 'canonical_head', authority: 'runtime_parent_composition' });
    }
    const revision = /^\/v1\/projects\/([^/]+)\/timelines\/([^/]+)\/composition-revisions\/([^/]+)$/.exec(path);
    if (method === 'GET' && revision) {
      const next = revision[3] === L04_NEXT_HEAD;
      const registry = next ? { assets: { 'l04-card-asset': { ...l04Registry.assets['l04-card-asset'], metadata: { observedRevision: L04_NEXT_HEAD } } } } : l04Registry;
      return response({ project_id: revision[1], timeline_id: revision[2], revision_id: revision[3], content_digest: `sha256:${(next ? 'd' : 'c').repeat(64)}`, payload: { config: l04Config, registry, clips: [], occurrences: [] }, created_at: '2026-10-08T00:00:00Z' });
    }
    throw new Error(`Unexpected L04 offline transport request: ${method} ${path}`);
  };
  return { requests, providers, transportFor, hold: () => { held = true; }, advance: () => { revised = true; held = false; release(); }, release: () => { held = false; release(); } };
}

function L04PollProbe({ admitted, queries, dataProvider }: { admitted: timelineData.TimelineData; queries: UsePollSyncQueries; dataProvider: DataProvider }) {
  const dataRef = React.useRef(admitted);
  const selectedClipIdRef = React.useRef<string | null>(null);
  const selectedTrackIdRef = React.useRef<string | null>(null);
  const editSeqRef = React.useRef(0);
  const pendingOpsRef = React.useRef(0);
  const savedSeqRef = React.useRef(0);
  const configVersionRef = React.useRef(admitted.configVersion);
  const lastSavedSignatureRef = React.useRef(admitted.stableSignature);
  const isSavingRef = React.useRef(false);
  const interactionStateRef = React.useRef(createInteractionState());
  const resolveAssetUrl = React.useCallback((file: string) => dataProvider.resolveAssetUrl(file), [dataProvider]);
  const commitData = React.useCallback((next: timelineData.TimelineData) => { dataRef.current = next; }, []);
  usePollSync({ queries, provider: dataProvider, resolveAssetUrl, commitData, dataRef, selectedClipIdRef, selectedTrackIdRef, editSeqRef, pendingOpsRef, savedSeqRef, configVersionRef, lastSavedSignatureRef, isSavingRef, interactionStateRef });
  return <output data-testid="l04-admitted-card">{(admitted.resolvedConfig.clips[0].params?.__astridAssets as Record<string, string> | undefined)?.card0}</output>;
}

function L04QueryProbe({ dataProvider, timelineId }: { dataProvider: DataProvider; timelineId: string }) {
  const resolveAssetUrl = React.useCallback((file: string) => dataProvider.resolveAssetUrl(file), [dataProvider]);
  const queries = useTimelineQueries(dataProvider, timelineId, resolveAssetUrl);
  l04Queries = queries;
  const [admitted, setAdmitted] = React.useState<timelineData.TimelineData | null>(null);
  React.useEffect(() => { if (queries.timelineQuery.data) setAdmitted((current) => current ?? queries.timelineQuery.data!); }, [queries.timelineQuery.data]);
  return admitted ? <L04PollProbe admitted={admitted} queries={queries} dataProvider={dataProvider} /> : null;
}

function L04RouteDriver() { l04Navigate = useNavigate(); return null; }
function renderL04Page(entry = `/tools/video-editor?localProject=l04-project&localTimeline=${L04_TIMELINE}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><L04RouteDriver /><VideoEditorPage /></MemoryRouter></QueryClientProvider>;
  const view = render(tree());
  return { ...view, client, refresh: () => view.rerender(tree()), navigate: (url: string) => act(() => l04Navigate(url)) };
}

async function flushL04() { await act(async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); }); }

describe('VideoEditorPage', () => {
  const originalDEV = import.meta.env.DEV;

  beforeAll(() => {
    // jsdom does not provide scrollIntoView, which cmdk calls internally.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn();
    }
  });

  beforeEach(() => {
    (import.meta.env as Record<string, unknown>).DEV = true;
    window.localStorage.clear();
    state.auth.userId = 'user-1';
    state.project.selectedProjectId = 'project-1';
    state.project.setSelectedProjectId.mockClear();
    state.projectCrud.projects = [{ id: 'project-1', name: 'Project One', user_id: 'user-1' }];
    state.projectCrud.isLoadingProjects = false;
    state.settings.settings = { lastTimelineId: 'timeline-1' };
    state.settings.update.mockClear();
    state.timelines.data = [{ id: 'timeline-1', name: 'Main timeline', updated_at: '2026-06-11T10:00:00Z' }];
    state.timelines.isLoading = false;
    state.timelines.error = null;
    state.timelines.timelineMutationsAvailable = false;
    state.timelines.createTimeline.isPending = false;
    state.timelines.createTimeline.mutateAsync.mockClear();
    state.timelines.renameTimeline.mutateAsync.mockClear();
    state.timelines.deleteTimeline.mutateAsync.mockClear();
    state.discovery.bridgeHealthy = true;
    state.discovery.bridgeDown = false;
    state.discovery.healthLoading = false;
    state.discovery.projectsLoading = false;
    state.discovery.projectsError = null;
    state.discovery.projects = [{ slug: 'ados-talks', name: 'Ados Talks' }];
    state.discovery.timelinesLoading = false;
    state.discovery.timelinesError = null;
    state.discovery.timelines = [
      {
        timeline_id: '11111111-1111-1111-1111-111111111111',
        timeline_ulid: '01JM4K5N7P0000000000000017',
        slug: 'intro-cut',
        name: 'Intro Cut',
        is_default: true,
      },
      {
        timeline_id: '22222222-2222-2222-2222-222222222222',
        timeline_ulid: '01JM4K5N7P0000000000000018',
        slug: 'alt-cut',
        name: 'Alt Cut',
        is_default: false,
      },
    ];
    state.workspaceV1 = false;
    state.selectedProvider = null;
    state.providerProbe = null;
    state.providerMounts = 0;
    state.providerUnmounts = 0;
    state.saveStatusCallback = null;
    state.lastProviderExtensions = null;
    state.lastTimelineOverlaysEnabled = null;
    state.devLocalExtensions.length = 0;
    state.extensionActivations.length = 0;
    state.extensionDisposals.length = 0;
    state.confirm.mockReset();
    state.confirm.mockReturnValue(true);
    state.bridgeCtor.mockClear();
    state.runtimeCtor.mockClear();
    state.runtimeOnError = null;
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', state.confirm);
    window.confirm = state.confirm;
  });

  afterEach(() => {
    (import.meta.env as Record<string, unknown>).DEV = originalDEV;
  });

  it('surfaces Runtime auth recovery in the existing Runtime editor route', async () => {
    renderPage('/tools/video-editor?runtime=1&runtimeProject=project-r&runtimeTimeline=timeline-r');

    await screen.findByTestId('video-editor-provider');
    expect(state.runtimeCtor).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-r',
      onRuntimeError: expect.any(Function),
    }));
    expect(screen.queryByTestId('astrid-acp-session-controls')).toBeNull();

    act(() => {
      state.runtimeOnError?.(new RuntimeAuthenticationError('/api/runtime'));
    });

    expect(await screen.findByTestId('runtime-connector-alert')).toHaveTextContent(
      'Workspace Runtime authentication failed',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry Runtime connection' }));
    expect(state.runtimeCtor.mock.instances[0].reconnect).toHaveBeenCalledTimes(1);
  });

  it('only exposes the manual ACP controls behind the explicit debug flag', async () => {
    renderPage('/tools/video-editor?runtime=1&runtimeProject=project-r&runtimeTimeline=timeline-r&acpDebug=1');

    await screen.findByTestId('video-editor-provider');
    expect(screen.getByTestId('astrid-acp-session-controls')).toBeInTheDocument();
  });

  it('does not loop timeline creation when Astrid returns an empty list', async () => {
    state.settings.settings = { lastTimelineId: undefined };
    state.timelines.data = [];
    state.timelines.timelineMutationsAvailable = false;

    // Bare editor routes are Astrid-first now. They must not enter the retired
    // relational auto-create path just because no Astrid timeline is selected.
    const view = renderPage('/tools/video-editor');
    expect(await screen.findByText('Select a project and timeline')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create timeline' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/tools/video-editor']}>
          <VideoEditorPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.timelines.createTimeline.mutateAsync).not.toHaveBeenCalled();
    expect(state.timelines.renameTimeline.mutateAsync).not.toHaveBeenCalled();
    expect(state.timelines.deleteTimeline.mutateAsync).not.toHaveBeenCalled();
  });

  it('uses AstridBridgeDataProvider in Local mode with bridge persistence enabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/astrid/projects/ados-talks/timelines/11111111-1111-1111-1111-111111111111')) {
        return new Response(JSON.stringify({
          timeline_id: '11111111-1111-1111-1111-111111111111',
          name: 'Intro Cut',
          config: { clips: [], tracks: [] },
          config_version: 0,
        }), { status: 200 });
      }
      throw new Error(`Unexpected bridge request: ${url}`);
    }));

    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    const provider = await screen.findByTestId('video-editor-provider');

    expect(provider).toHaveAttribute('data-kind', 'bridge');
    expect(state.bridgeCtor).toHaveBeenCalledWith(expect.objectContaining({
      projectSlug: 'ados-talks',
      timelineRef: '11111111-1111-1111-1111-111111111111',
      timelineId: '11111111-1111-1111-1111-111111111111',
      onBridgeRequest: expect.any(Function),
    }));
  });

  it('does not advertise a local render action when the Astrid render bridge is descoped', async () => {
    const fetchCalls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes('/api/astrid/projects/ados-talks/timelines/11111111-1111-1111-1111-111111111111')) {
        return new Response(JSON.stringify({
          timeline_id: '11111111-1111-1111-1111-111111111111',
          name: 'Intro Cut',
          config: { clips: [], tracks: [] },
          config_version: 0,
        }), { status: 200 });
      }
      throw new Error(`Unexpected bridge request: ${url}`);
    }));

    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    await screen.findByTestId('video-editor-provider');

    expect(screen.queryByRole('button', { name: /render locally/i })).toBeNull();
    expect(fetchCalls.every((url) => !url.includes('/render'))).toBe(true);
  });

  it('remounts the editor when the Local timeline selection changes (explicit URL params)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/astrid/projects/ados-talks/timelines/11111111-1111-1111-1111-111111111111')) {
        return new Response(JSON.stringify({
          timeline_id: '11111111-1111-1111-1111-111111111111',
          name: 'Intro Cut',
          config: { clips: [], tracks: [] },
          config_version: 0,
        }), { status: 200 });
      }
      if (url.includes('/api/astrid/projects/ados-talks/timelines/22222222-2222-2222-2222-222222222222')) {
        return new Response(JSON.stringify({
          timeline_id: '22222222-2222-2222-2222-222222222222',
          name: 'Alt Cut',
          config: { clips: [], tracks: [] },
          config_version: 0,
        }), { status: 200 });
      }
      throw new Error(`Unexpected bridge request: ${url}`);
    }));

    const first = renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    const provider = await screen.findByTestId('video-editor-provider');
    expect(provider).toHaveAttribute('data-timeline-id', '11111111-1111-1111-1111-111111111111');
    expect(state.providerMounts).toBe(1);

    // A new explicit selection (different URL) mounts a fresh editor.
    first.unmount();
    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=22222222-2222-2222-2222-222222222222');

    await waitFor(() => {
      expect(screen.getByTestId('video-editor-provider')).toHaveAttribute(
        'data-timeline-id',
        '22222222-2222-2222-2222-222222222222',
      );
    });
    expect(state.providerMounts).toBe(2);
  });

  it('renders only Astrid projects in the selector dropdown', async () => {
    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    await screen.findByTestId('video-editor-provider');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));

    expect(screen.queryByText('Reigh projects')).toBeNull();
    expect(screen.getByText('Astrid projects')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Project One/ })).toBeNull();
    expect(screen.getByRole('option', { name: /Ados Talks/ })).toBeInTheDocument();
  });

  it('shows the bridge-down card with the selectors visible when the bridge is down', async () => {
    state.discovery.bridgeDown = true;
    state.discovery.bridgeHealthy = false;
    state.discovery.timelines = [];
    renderPage('/tools/video-editor?localProject=ados-talks');

    await screen.findByText('Unable to connect to the local Astrid workspace');
    // The selectors stay mounted (and openable) so the launch hint is reachable.
    expect(screen.getByRole('combobox', { name: 'Select project' })).toBeInTheDocument();
  });

  it('shows the projects-root hint when the bridge is reachable but has no projects', async () => {
    state.discovery.projects = [];
    state.discovery.timelines = [];
    renderPage('/tools/video-editor?localProject=ados-talks');

    await screen.findByText('Select a project and timeline');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));

    expect(await screen.findByText(/Start Astrid with a projects root/)).toBeInTheDocument();
  });

  it('auto-picks the default timeline when a local project has no timeline param', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url.includes('/api/astrid/projects/ados-talks/timelines/11111111-1111-1111-1111-111111111111')
        || url.includes('/api/astrid/projects/ados-talks/timelines/01JM4K5N7P0000000000000017')
      ) {
        return new Response(JSON.stringify({
          timeline_id: '11111111-1111-1111-1111-111111111111',
          timeline_ulid: '01JM4K5N7P0000000000000017',
          name: 'Intro Cut',
          config: { clips: [], tracks: [] },
          config_version: 0,
        }), { status: 200 });
      }
      throw new Error(`Unexpected bridge request: ${url}`);
    }));

    renderPage('/tools/video-editor?localProject=ados-talks');

    const provider = await screen.findByTestId('video-editor-provider');
    expect(provider).toHaveAttribute('data-kind', 'bridge');
    // Auto-pick selects the ULID as the routable ref.
    expect(provider).toHaveAttribute('data-timeline-id', '01JM4K5N7P0000000000000017');
  });

  it('auto-picks the first timeline when no default exists', async () => {
    state.discovery.timelines = [
      {
        timeline_id: '22222222-2222-2222-2222-222222222222',
        timeline_ulid: '01JM4K5N7P0000000000000018',
        slug: 'alt-cut',
        name: 'Alt Cut',
        is_default: false,
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url.includes('/api/astrid/projects/ados-talks/timelines/22222222-2222-2222-2222-222222222222')
        || url.includes('/api/astrid/projects/ados-talks/timelines/01JM4K5N7P0000000000000018')
      ) {
        return new Response(JSON.stringify({
          timeline_id: '22222222-2222-2222-2222-222222222222',
          timeline_ulid: '01JM4K5N7P0000000000000018',
          name: 'Alt Cut',
          config: { clips: [], tracks: [] },
          config_version: 0,
        }), { status: 200 });
      }
      throw new Error(`Unexpected bridge request: ${url}`);
    }));

    renderPage('/tools/video-editor?localProject=ados-talks');

    const provider = await screen.findByTestId('video-editor-provider');
    expect(provider).toHaveAttribute('data-kind', 'bridge');
    // Auto-pick selects the ULID as the routable ref.
    expect(provider).toHaveAttribute('data-timeline-id', '01JM4K5N7P0000000000000018');
  });

  it('renders the selectors with the current local selection while keeping the editor mounted', async () => {
    setupBridgeFetch();

    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    await screen.findByTestId('video-editor-provider');

    expect(screen.getByRole('combobox', { name: 'Select project' })).toHaveTextContent('ados-talks');
    // Timeline label = bridge timeline name once the name GET resolves,
    // falling back to the timeline id while it loads.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Select timeline' })).toHaveTextContent('Intro Cut');
    });
  });

  it('opens Local mode straight from the URL params and never writes a storage flag', async () => {
    // The legacy `dev.videoEditor.localMode` flag is retired — the pasted link
    // is the only signal, and it has to be enough (any environment).
    setupBridgeFetch();

    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    const provider = await screen.findByTestId('video-editor-provider');
    expect(provider).toHaveAttribute('data-kind', 'bridge');
    // ...and no storage flag is written (existing stored values stay inert).
    expect(window.localStorage.getItem('dev.videoEditor.localMode')).toBeNull();
  });

  it('honors explicit local-mode URL params when DEV is off', async () => {
    (import.meta.env as Record<string, unknown>).DEV = false;
    setupBridgeFetch();

    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    const provider = await screen.findByTestId('video-editor-provider');
    // Desktop production serves the same-origin Astrid bridge middleware; the
    // explicit URL remains the sole mode signal in every environment.
    expect(provider).toHaveAttribute('data-kind', 'bridge');
    expect(state.bridgeCtor).toHaveBeenCalledTimes(1);
  });

  it('keeps the selector Astrid-only', async () => {
    setupBridgeFetch();

    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    const provider = await screen.findByTestId('video-editor-provider');
    await waitFor(() => {
      expect(provider).toHaveAttribute('data-kind', 'bridge');
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));
    expect(screen.queryByText('Reigh projects')).toBeNull();
    expect(screen.queryByRole('option', { name: /Project One/ })).toBeNull();
    expect(screen.getByRole('option', { name: /Ados Talks/ })).toBeInTheDocument();
    expect(state.confirm).not.toHaveBeenCalled();
  });

  it('bridge-down → online: the selectors refresh and the editor mounts', async () => {
    state.discovery.bridgeDown = true;
    state.discovery.bridgeHealthy = false;
    state.discovery.projects = [];
    state.discovery.timelines = [];

    renderPage('/tools/video-editor?localProject=ados-talks');

    await screen.findByText('Unable to connect to the local Astrid workspace');

    const user = userEvent.setup();
    const projectTrigger = screen.getByRole('combobox', { name: 'Select project' });
    await user.click(projectTrigger);
    expect(await screen.findByText('No Astrid projects found')).toBeInTheDocument();
    await user.click(projectTrigger);

    // The bridge comes up with a projects root (but no timelines yet): the
    // reopened dropdown must now show the discovered project.
    state.discovery.bridgeDown = false;
    state.discovery.bridgeHealthy = true;
    state.discovery.projects = [{ slug: 'ados-talks', name: 'Ados Talks' }];
    state.discovery.timelines = [];

    await user.click(screen.getByRole('combobox', { name: 'Select project' }));
    expect(await screen.findByRole('option', { name: /Ados Talks/ })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));

    // Timelines appear → the auto-pick effect mounts the bridge editor.
    state.discovery.timelines = [
      {
        timeline_id: '11111111-1111-1111-1111-111111111111',
        timeline_ulid: '01JM4K5N7P0000000000000017',
        slug: 'intro-cut',
        name: 'Intro Cut',
        is_default: true,
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url.includes('/api/astrid/projects/ados-talks/timelines/11111111-1111-1111-1111-111111111111')
        || url.includes('/api/astrid/projects/ados-talks/timelines/01JM4K5N7P0000000000000017')
      ) {
        return new Response(JSON.stringify({
          timeline_id: '11111111-1111-1111-1111-111111111111',
          timeline_ulid: '01JM4K5N7P0000000000000017',
          name: 'Intro Cut',
          config: { clips: [], tracks: [] },
          config_version: 0,
        }), { status: 200 });
      }
      throw new Error(`Unexpected bridge request: ${url}`);
    }));

    // Reopening the dropdown re-renders the page, which re-reads the mocked
    // discovery state and lets the auto-pick effect run.
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));

    const provider = await screen.findByTestId('video-editor-provider');
    expect(provider).toHaveAttribute('data-kind', 'bridge');
  });

  it('passes a save-status callback into the mounted provider', async () => {
    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    await screen.findByTestId('video-editor-provider');
    expect(state.saveStatusCallback).toBeTypeOf('function');
  });

  it('switching local projects with a clean editor auto-picks a timeline and remounts', async () => {
    state.discovery.projects = [
      { slug: 'ados-talks', name: 'Ados Talks' },
      { slug: 'other-project', name: 'Other Project' },
    ];
    setupBridgeFetch();

    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    const provider = await screen.findByTestId('video-editor-provider');
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-status')).toHaveTextContent('saved');
    });
    expect(state.providerMounts).toBe(1);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select project' }));
    await user.click(await screen.findByText('Other Project'));

    await waitFor(() => {
      expect(state.providerMounts).toBe(2);
    });
    expect(screen.getByTestId('video-editor-provider')).toHaveAttribute('data-kind', 'bridge');
    // Auto-pick selects the ULID as the routable ref.
    expect(screen.getByTestId('video-editor-provider')).toHaveAttribute(
      'data-timeline-id',
      '01JM4K5N7P0000000000000017',
    );
  });

  it('blocks switching while the editor is saving', async () => {
    await mountLocalEditor();

    act(() => {
      state.saveStatusCallback?.('saving');
    });

    expect(screen.getByRole('combobox', { name: 'Select project' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Select timeline' })).toBeDisabled();

    // Still on the same timeline — switch blocked without confirm
    expect(screen.getByTestId('video-editor-provider')).toHaveAttribute(
      'data-timeline-id',
      '11111111-1111-1111-1111-111111111111',
    );
    expect(state.confirm).not.toHaveBeenCalled();
  });

  it('blocks switching while the editor is retrying a transport failure', async () => {
    await mountLocalEditor();

    act(() => {
      state.saveStatusCallback?.('retrying');
    });

    // A retry is scheduled (a save WILL happen) — switching would abandon it,
    // so both selectors are disabled and no confirm dialog is offered.
    expect(screen.getByRole('combobox', { name: 'Select project' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Select timeline' })).toBeDisabled();
    expect(screen.getByTestId('video-editor-provider')).toHaveAttribute(
      'data-timeline-id',
      '11111111-1111-1111-1111-111111111111',
    );
    expect(state.confirm).not.toHaveBeenCalled();
  });

  it('confirms dirty-state timeline switches when accepted and blocks when declined', async () => {
    await mountLocalEditor();

    // Dirty + denied → switch must be blocked, provider unchanged
    state.confirm.mockReturnValue(false);
    fireEvent.click(screen.getByText('status-dirty'));
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-status')).toHaveTextContent('dirty');
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select timeline' }));
    await user.click(await screen.findByText('Alt Cut'));

    expect(state.confirm).toHaveBeenCalledWith(
      'You have unsaved timeline changes. Switch editors and discard them?',
    );
    expect(screen.getByTestId('video-editor-provider')).toHaveAttribute('data-kind', 'bridge');

    // Reset to saved, then dirty + confirmed → confirm is called
    state.confirm.mockReset();
    state.confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText('status-saved'));
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-status')).toHaveTextContent('saved');
    });
    fireEvent.click(screen.getByText('status-dirty'));
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-status')).toHaveTextContent('dirty');
    });

    await user.click(screen.getByRole('combobox', { name: 'Select timeline' }));
    await user.click(await screen.findByText('Alt Cut'));

    expect(state.confirm).toHaveBeenCalledWith(
      'You have unsaved timeline changes. Switch editors and discard them?',
    );
    await waitFor(() => {
      expect(screen.getByTestId('video-editor-provider')).toHaveAttribute('data-kind', 'bridge');
      expect(screen.getByTestId('video-editor-provider')).toHaveAttribute(
        'data-timeline-id',
        '01JM4K5N7P0000000000000018',
      );
    });
  });

  it('confirms error-state timeline switches and blocks when declined', async () => {
    await mountLocalEditor();

    // Error + denied → switch blocked
    state.confirm.mockReturnValue(false);
    act(() => {
      state.saveStatusCallback?.('error');
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select timeline' }));
    await user.click(await screen.findByText('Alt Cut'));

    expect(state.confirm).toHaveBeenCalledWith(
      'The last timeline save failed. Switch editors anyway?',
    );
    expect(screen.getByTestId('video-editor-provider')).toHaveAttribute('data-kind', 'bridge');

    // Error + confirmed → confirm was honored
    state.confirm.mockReset();
    state.confirm.mockReturnValue(true);
    act(() => {
      state.saveStatusCallback?.('saved');
      state.saveStatusCallback?.('error');
    });

    await user.click(screen.getByRole('combobox', { name: 'Select timeline' }));
    await user.click(await screen.findByText('Alt Cut'));

    expect(state.confirm).toHaveBeenCalledWith(
      'The last timeline save failed. Switch editors anyway?',
    );
    await waitFor(() => {
      expect(screen.getByTestId('video-editor-provider')).toHaveAttribute('data-kind', 'bridge');
      expect(screen.getByTestId('video-editor-provider')).toHaveAttribute(
        'data-timeline-id',
        '01JM4K5N7P0000000000000018',
      );
    });
  });

  it('confirms error-state local timeline switches and cancels them when declined', async () => {
    setupBridgeFetch();
    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

    const provider = await screen.findByTestId('video-editor-provider');
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-status')).toHaveTextContent('saved');
    });
    act(() => {
      state.saveStatusCallback?.('error');
    });
    state.confirm.mockReturnValue(false);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Select timeline' }));
    await user.click(await screen.findByText('Alt Cut'));

    expect(state.confirm).toHaveBeenCalledWith('The last timeline save failed. Switch editors anyway?');
    expect(screen.getByTestId('video-editor-provider')).toHaveAttribute('data-timeline-id', '11111111-1111-1111-1111-111111111111');
    expect(state.providerMounts).toBe(1);
    expect(state.providerUnmounts).toBe(0);
  });

  function setupBridgeFetch() {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url.includes('/api/astrid/projects/ados-talks/timelines/11111111-1111-1111-1111-111111111111')
        || url.includes('/api/astrid/projects/ados-talks/timelines/01JM4K5N7P0000000000000017')
      ) {
        return new Response(JSON.stringify({
          timeline_id: '11111111-1111-1111-1111-111111111111',
          timeline_ulid: '01JM4K5N7P0000000000000017',
          name: 'Intro Cut',
          config: { clips: [], tracks: [] },
          config_version: 0,
        }), { status: 200 });
      }
      if (
        url.includes('/api/astrid/projects/ados-talks/timelines/22222222-2222-2222-2222-222222222222')
        || url.includes('/api/astrid/projects/ados-talks/timelines/01JM4K5N7P0000000000000018')
      ) {
        return new Response(JSON.stringify({
          timeline_id: '22222222-2222-2222-2222-222222222222',
          timeline_ulid: '01JM4K5N7P0000000000000018',
          name: 'Alt Cut',
          config: { clips: [], tracks: [] },
          config_version: 0,
        }), { status: 200 });
      }
      throw new Error(`Unexpected bridge request: ${url}`);
    }));
  }

  async function mountLocalEditor() {
    setupBridgeFetch();
    renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');
    const provider = await screen.findByTestId('video-editor-provider');
    expect(provider).toHaveAttribute('data-kind', 'bridge');
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-status')).toHaveTextContent('saved');
    });
    return provider;
  }

  // ---------------------------------------------------------------------------
  // ?extensionSmoke=1 in the stock app path
  // ---------------------------------------------------------------------------

  describe('?extensionSmoke=1 page integration', () => {
    it('passes the smoke extension into VideoEditorProvider when ?extensionSmoke=1 is present', async () => {
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111&extensionSmoke=1');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');

      // The smoke extension should have been resolved and passed to the provider
      expect(state.lastProviderExtensions).not.toBeNull();
      expect(state.lastProviderExtensions).toHaveLength(1);
      expect(state.lastProviderExtensions![0].manifest.id).toBe('com.reigh.smoke.extension-smoke');
      expect(state.lastProviderExtensions![0].manifest.contributions).toHaveLength(1);
      expect(state.lastProviderExtensions![0].manifest.contributions[0].id).toBe('extension-smoke-status');
    });

    it('does NOT pass the smoke extension when ?extensionSmoke is absent', async () => {
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');

      // No smoke extension — provider receives empty or no extensions
      expect(state.lastProviderExtensions ?? []).toHaveLength(0);
    });

    it('does NOT pass the smoke extension when extensionSmoke=0 (not exactly 1)', async () => {
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111&extensionSmoke=0');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');

      expect(state.lastProviderExtensions ?? []).toHaveLength(0);
    });

    it('does NOT pass the smoke extension when extensionSmoke is empty', async () => {
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111&extensionSmoke');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');

      expect(state.lastProviderExtensions ?? []).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // ?timelineOverlayCanary=1 — DEV-only canary gate for the timelineOverlay family
  // ---------------------------------------------------------------------------

  describe('?timelineOverlayCanary=1 (DEV canary gate)', () => {
    it('enables timeline overlays in DEV only when the canary query is exactly 1', async () => {
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111&timelineOverlayCanary=1');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');
      expect(state.lastTimelineOverlaysEnabled).toBe(true);
      expect(provider).toHaveAttribute('data-timeline-overlays-enabled', 'true');
    });

    it('keeps the overlay dark in DEV when the canary query is absent', async () => {
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');
      expect(state.lastTimelineOverlaysEnabled).toBe(false);
      expect(provider).toHaveAttribute('data-timeline-overlays-enabled', 'false');
    });

    it('ignores a non-1 canary value in DEV (only exactly 1 enables)', async () => {
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111&timelineOverlayCanary=0');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(state.lastTimelineOverlaysEnabled).toBe(false);
      expect(provider).toHaveAttribute('data-timeline-overlays-enabled', 'false');
    });

    it('ignores the canary query in production (DEV off) — the query must never be honored outside DEV', async () => {
      (import.meta.env as Record<string, unknown>).DEV = false;
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111&timelineOverlayCanary=1');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');
      expect(state.lastTimelineOverlaysEnabled).toBe(false);
      expect(provider).toHaveAttribute('data-timeline-overlays-enabled', 'false');
    });

    it('passes the flag into the local-mode provider mount too (canary + localProject)', async () => {
      setupBridgeFetch();
      renderPage(
        '/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111&timelineOverlayCanary=1',
      );

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');
      expect(state.lastTimelineOverlaysEnabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Extension-driven overlay gate — an enabled dev-local extension that
  // declares a `timelineOverlay` contribution mounts the host without the
  // canary query (DEV only; production drops devLocalExtensions entirely).
  // ---------------------------------------------------------------------------

  describe('timelineOverlay host gate via enabled dev-local extension (DEV)', () => {
    const OVERLAY_EXT_ID = 'com.reigh.dev.overlay-fixture';

    function makeOverlayDevLocalExtension() {
      return {
        manifest: {
          id: OVERLAY_EXT_ID,
          version: '0.1.0',
          label: 'Local Overlay Fixture',
          description: 'A dev-local overlay extension for host-gate tests.',
          apiVersion: 1,
          contributions: [
            {
              id: `${OVERLAY_EXT_ID}-overlay`,
              kind: 'timelineOverlay',
              render: `${OVERLAY_EXT_ID}-overlay`,
              order: 5,
              label: 'Local Overlay Fixture',
            },
          ],
        },
        activate: vi.fn(() => ({ dispose: vi.fn() })),
      };
    }

    it('mounts the overlay host when an overlay-capable dev-local extension is enabled (no URL param)', async () => {
      state.devLocalExtensions.push(makeOverlayDevLocalExtension());
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');
      expect(state.lastTimelineOverlaysEnabled).toBe(true);
      expect(provider).toHaveAttribute('data-timeline-overlays-enabled', 'true');
    });

    it('keeps the host dark when the enabled dev-local extension has no timelineOverlay contribution', async () => {
      state.devLocalExtensions.push({
        manifest: {
          id: 'com.reigh.dev.slot-only-fixture',
          version: '0.1.0',
          label: 'Local Slot Fixture',
          description: 'A dev-local slot-only extension for host-gate tests.',
          apiVersion: 1,
          contributions: [
            {
              id: 'com.reigh.dev.slot-only-fixture-status',
              kind: 'slot',
              slot: 'statusBar',
              render: 'com.reigh.dev.slot-only-fixture-status',
              label: 'Local Slot Fixture Status',
            },
          ],
        },
        activate: vi.fn(() => ({ dispose: vi.fn() })),
      });
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(state.lastTimelineOverlaysEnabled).toBe(false);
      expect(provider).toHaveAttribute('data-timeline-overlays-enabled', 'false');
    });

    it('drops the overlay gate when the overlay extension is disabled through the external store', async () => {
      state.devLocalExtensions.push(makeOverlayDevLocalExtension());
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(state.lastTimelineOverlaysEnabled).toBe(true);

      act(() => {
        setDevExtensionEnabled(OVERLAY_EXT_ID, false);
      });

      await waitFor(() => {
        expect(state.lastTimelineOverlaysEnabled).toBe(false);
      });
    });

    it('ignores the extension-driven gate in production (DEV off)', async () => {
      (import.meta.env as Record<string, unknown>).DEV = false;
      state.devLocalExtensions.push(makeOverlayDevLocalExtension());
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');
      expect(state.lastTimelineOverlaysEnabled).toBe(false);
      expect(provider).toHaveAttribute('data-timeline-overlays-enabled', 'false');
    });
  });

  describe('dev-local extension enablement (external store)', () => {
    const DEV_LOCAL_ID = 'com.reigh.dev.local-fixture';

    function makeDevLocalExtension() {
      return {
        manifest: {
          id: DEV_LOCAL_ID,
          version: '0.1.0',
          label: 'Local Fixture Extension',
          description: 'A dev-local scratchpad extension for enablement tests.',
          apiVersion: 1,
          contributions: [
            {
              id: `${DEV_LOCAL_ID}-status`,
              kind: 'slot',
              slot: 'statusBar',
              render: `${DEV_LOCAL_ID}-status`,
              label: 'Local Fixture Status',
            },
          ],
        },
        activate: vi.fn(() => ({ dispose: vi.fn() })),
      };
    }

    it('passes an enabled dev-local extension into the provider (activated once)', async () => {
      state.devLocalExtensions.push(makeDevLocalExtension());
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');
      expect(state.lastProviderExtensions).toHaveLength(1);
      expect(state.lastProviderExtensions![0].manifest.id).toBe(DEV_LOCAL_ID);
      expect(state.extensionActivations).toEqual([DEV_LOCAL_ID]);
      expect(state.extensionDisposals).toEqual([]);
    });

    it('drops the dev-local extension when disabled through the external store (no searchParams change, no refresh key)', async () => {
      state.devLocalExtensions.push(makeDevLocalExtension());
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(state.lastProviderExtensions).toHaveLength(1);

      // Toggling the store notifies the page's useSyncExternalStore
      // subscription; the smokeDirectExtensions memo must update from the
      // snapshot without any URL or loader-refresh change.
      act(() => {
        setDevExtensionEnabled(DEV_LOCAL_ID, false);
      });

      await waitFor(() => {
        expect(state.lastProviderExtensions ?? []).toHaveLength(0);
      });
      // Runtime teardown: the extension left the provider's extension list.
      expect(state.extensionDisposals).toEqual([DEV_LOCAL_ID]);
    });

    it('does not mount a dev-local extension that is disabled before the page renders', async () => {
      act(() => {
        setDevExtensionEnabled(DEV_LOCAL_ID, false);
      });
      state.devLocalExtensions.push(makeDevLocalExtension());
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      await screen.findByTestId('video-editor-provider');

      expect(state.lastProviderExtensions ?? []).toHaveLength(0);
      expect(state.extensionActivations).toEqual([]);
    });

    it('re-enables a disabled dev-local extension and activates it exactly once', async () => {
      state.devLocalExtensions.push(makeDevLocalExtension());
      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      await screen.findByTestId('video-editor-provider');
      expect(state.lastProviderExtensions).toHaveLength(1);
      expect(state.extensionActivations).toEqual([DEV_LOCAL_ID]);

      // Disable → teardown (exactly one disposal).
      act(() => {
        setDevExtensionEnabled(DEV_LOCAL_ID, false);
      });
      await waitFor(() => {
        expect(state.lastProviderExtensions ?? []).toHaveLength(0);
      });
      expect(state.extensionDisposals).toEqual([DEV_LOCAL_ID]);

      // Re-enable → the extension comes back, and only one new activation is
      // recorded for the re-add (1 initial + 1 re-enable), with no extra
      // disposal from the re-add itself.
      act(() => {
        setDevExtensionEnabled(DEV_LOCAL_ID, true);
      });

      await waitFor(() => {
        expect(state.lastProviderExtensions).toHaveLength(1);
        expect(state.lastProviderExtensions![0].manifest.id).toBe(DEV_LOCAL_ID);
      });
      expect(state.extensionActivations.filter((id) => id === DEV_LOCAL_ID)).toHaveLength(2);
      expect(state.extensionDisposals.filter((id) => id === DEV_LOCAL_ID)).toHaveLength(1);
    });

    it('does not mount dev-local extensions when DEV is off', async () => {
      state.devLocalExtensions.push(makeDevLocalExtension());
      (import.meta.env as Record<string, unknown>).DEV = false;

      renderPage('/tools/video-editor?localProject=ados-talks&localTimeline=11111111-1111-1111-1111-111111111111');

      const provider = await screen.findByTestId('video-editor-provider');
      expect(provider).toHaveAttribute('data-kind', 'bridge');
      expect(state.lastProviderExtensions ?? []).toHaveLength(0);
      expect(state.extensionActivations).toEqual([]);
    });
  });

  describe('P2-L04.PROVIDER actual page provider lifetime', () => {
    let actualRuntime: typeof import('@/integrations/runtime/dataProvider.ts');
    let runtime: ReturnType<typeof makeL04Transport>;
    const defaultRuntimeCtor = state.runtimeCtor.getMockImplementation()!;

    beforeAll(async () => { actualRuntime = await vi.importActual<typeof import('@/integrations/runtime/dataProvider.ts')>('@/integrations/runtime/dataProvider.ts'); });
    beforeEach(() => {
      state.workspaceV1 = true;
      state.discovery.projects = [
        { slug: 'l04-project', name: 'L04 Project', project_id: L04_PROJECT },
        { slug: 'l04-other', name: 'L04 Other', project_id: 'l04-other-project-id' },
      ];
      state.discovery.timelines = [
        { timeline_id: L04_TIMELINE, name: 'Opening name', is_default: true },
        { timeline_id: 'l04-other-timeline', name: 'Other timeline' },
      ];
      runtime = makeL04Transport();
      l04Queries = null;
      l04Builds = [];
      state.runtimeCtor.mockImplementation(function (_options: unknown) {
        const options = _options as RuntimeDataProviderOptions;
        const provider = new actualRuntime.RuntimeDataProvider({ ...options, transport: runtime.transportFor(`provider-${runtime.providers.length + 1}`) });
        runtime.providers.push(provider);
        state.runtimeOnError = (options.onRuntimeError as ((error: unknown) => void) | undefined) ?? null;
        return provider;
      });
      const realBuild = timelineData.buildTimelineData;
      vi.spyOn(timelineData, 'buildTimelineData').mockImplementation((...args) => {
        const promise = realBuild(...args);
        void promise.then((data) => { l04Builds.push({ status: 'resolved', data }); }, (error: unknown) => { l04Builds.push({ status: 'rejected', error }); });
        return promise; // preserve the real build and the real hook's rejection behavior
      });
    });
    afterEach(() => {
      runtime.release();
      state.providerProbe = null;
      state.workspaceV1 = false;
      vi.restoreAllMocks();
      state.runtimeCtor.mockImplementation(defaultRuntimeCtor);
    });

    it.each([false, true])('keeps its admitted provider and card through pending reads and discovered name refresh (initially absent=%s)', async (initiallyAbsent) => {
      if (initiallyAbsent) {
        state.discovery.timelinesLoading = true;
        state.discovery.timelines = [];
      }
      state.providerProbe = L04QueryProbe;
      const view = renderL04Page();
      try {
        await screen.findByTestId('l04-admitted-card');
        await waitFor(() => expect(l04Builds).toHaveLength(1));
        expect(l04Builds[0].status).toBe('resolved');
        const admittedProvider = state.selectedProvider!;
        expect(admittedProvider).toBe(runtime.providers[0]);
        expect(await admittedProvider.resolveAssetUrl(L04_TOKEN)).toBe(L04_CARD_URL);
        const admittedRegistry = l04Queries!.assetRegistryQuery.data;
        const mounts = state.providerMounts;
        const editorNode = screen.getByTestId('video-editor-provider');
        runtime.hold();
        const pending = view.client.refetchQueries({ queryKey: assetRegistryQueryKey(L04_TIMELINE), exact: true });
        await waitFor(() => expect(view.client.getQueryState(assetRegistryQueryKey(L04_TIMELINE))?.fetchStatus).toBe('fetching'));
        state.discovery.timelinesLoading = false;
        state.discovery.timelines = [{ timeline_id: L04_TIMELINE, name: 'Refreshed display name', is_default: true }];
        view.refresh();
        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Select timeline' })).toHaveTextContent('Refreshed display name'));
        expect(screen.getByTestId('video-editor-provider')).toHaveAttribute('data-timeline-name', 'Refreshed display name');
        expect(screen.getByTestId('video-editor-provider')).toBe(editorNode);
        expect(state.providerMounts).toBe(mounts);
        expect(state.providerUnmounts).toBe(0);
        expect.soft(state.selectedProvider, 'display metadata must retain the admitted state owner').toBe(admittedProvider);
        runtime.advance();
        await pending;
        await waitFor(() => expect(l04Queries!.assetRegistryQuery.data).not.toBe(admittedRegistry));
        await flushL04();
        expect(l04Queries!.assetRegistryQuery.data?.assets['l04-card-asset']).toMatchObject({ media_id: L04_TOKEN, content_sha256: L04_TOKEN, metadata: { observedRevision: L04_NEXT_HEAD } });
        expect(l04Builds).toHaveLength(2);
        const rebuilt = l04Builds[1];
        console.info('P2-L04.PROVIDER page name refresh', { initiallyAbsent, providers: runtime.providers.length, mounts: state.providerMounts, rebuild: rebuilt.status, requests: runtime.requests });
        expect.soft(rebuilt.status, 'the authored card must resolve after its admitted provider finishes the pending read').toBe('resolved');
        expect.soft(rebuilt.status === 'resolved' ? rebuilt.data.resolvedConfig.clips[0].params?.__astridAssets : undefined).toMatchObject({ card0: L04_CARD_URL });
        await expect(state.selectedProvider!.resolveAssetUrl(L04_TOKEN)).resolves.toBe(L04_CARD_URL);
      } finally {
        view.unmount();
        view.client.clear();
        runtime.release();
        await flushL04();
      }
    });

    it('replaces provider and editor at real timeline/project authority changes', async () => {
      const view = renderL04Page();
      try {
        await screen.findByTestId('video-editor-provider');
        const first = state.selectedProvider;
        expect(state.providerMounts).toBe(1);
        view.navigate('/tools/video-editor?localProject=l04-project&localTimeline=l04-other-timeline');
        await waitFor(() => expect(state.providerMounts).toBe(2));
        const second = state.selectedProvider;
        expect(second).not.toBe(first);
        expect(screen.getByTestId('video-editor-provider')).toHaveAttribute('data-timeline-id', 'l04-other-timeline');
        view.navigate('/tools/video-editor?localProject=l04-other&localTimeline=l04-other-timeline');
        await waitFor(() => expect(state.providerMounts).toBe(3));
        expect(state.selectedProvider).not.toBe(second);
        expect(state.providerUnmounts).toBe(2);
        expect(state.runtimeCtor.mock.calls.map(([options]) => (options as RuntimeDataProviderOptions).projectId)).toEqual([L04_PROJECT, L04_PROJECT, 'l04-other-project-id']);
      } finally { view.unmount(); view.client.clear(); }
    });

    it('replaces provider/remount on local-to-runtime mode change and retries through the current provider', async () => {
      const view = renderL04Page();
      try {
        await screen.findByTestId('video-editor-provider');
        const localProvider = state.selectedProvider;
        view.navigate(`/tools/video-editor?runtime=1&runtimeProject=${L04_PROJECT}&runtimeTimeline=${L04_TIMELINE}`);
        await waitFor(() => expect(state.providerMounts).toBe(2));
        const currentProvider = state.selectedProvider as RuntimeDataProvider;
        expect(currentProvider).not.toBe(localProvider);
        expect(state.providerUnmounts).toBe(1);
        const reconnect = vi.spyOn(currentProvider, 'reconnect');
        act(() => state.runtimeOnError?.(new RuntimeAuthenticationError('/api/runtime')));
        await screen.findByTestId('runtime-connector-alert');
        await userEvent.setup().click(screen.getByRole('button', { name: 'Retry Runtime connection' }));
        await waitFor(() => expect(reconnect).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByTestId('runtime-connector-alert')).toBeNull());
        expect(state.selectedProvider).toBe(currentProvider);
        expect(runtime.requests.every(({ provider }) => provider === 'provider-2')).toBe(true);
        view.navigate(`/tools/video-editor?localProject=l04-project&localTimeline=${L04_TIMELINE}`);
        await waitFor(() => expect(state.providerMounts).toBe(3));
        expect(state.selectedProvider).not.toBe(currentProvider);
      } finally { view.unmount(); view.client.clear(); }
    });

    it('resolves a known card and rejects a truly unknown token on the page-selected provider', async () => {
      const view = renderL04Page();
      try {
        await screen.findByTestId('video-editor-provider');
        const provider = state.selectedProvider!;
        const data = await timelineData.loadTimelineJsonFromProvider(provider, L04_TIMELINE);
        expect(data.resolvedConfig.clips[0].params?.__astridAssets).toMatchObject({ card0: L04_CARD_URL });
        expect(await provider.resolveAssetUrl(L04_TOKEN)).toBe(L04_CARD_URL);
        await expect(provider.resolveAssetUrl(L04_UNKNOWN)).rejects.toThrow(`Workspace Runtime has no managed object for asset ${L04_UNKNOWN}`);
        expect(runtime.requests.some(({ path }) => path.startsWith('/v1/objects/'))).toBe(false);
      } finally { view.unmount(); view.client.clear(); }
    });
  });

});
